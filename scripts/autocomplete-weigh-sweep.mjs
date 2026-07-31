#!/usr/bin/env node
// A/B ranking weights against the Phase 0 audit harness.
// Usage: node scripts/autocomplete-weigh-sweep.mjs
import { gatherCompletions } from '../js/editor-src/ide/completion/source.mjs';
import { WEIGHTS } from '../js/editor-src/ide/completion/weigh.mjs';

// Re-run the audit core with a weights override by patching gather via opts.
// Import the audit as a library would require refactor; instead shell out variants.

const BASELINE = Object.freeze({
  name: 'baseline-pre-6.2',
  // Pre-Phase-6.2 formula: fuzzy*100 + base + proximity + (just-2)*80
  weights: Object.freeze({
    fuzzyScale: 100,
    justStep: 80,
    emptyBaseScale: 1000,
    prefixBonus: 0,
    exactBonus: 0,
    lengthFitScale: 0,
    peerPenalty: 0,
  }),
});

const CANDIDATES = [
  BASELINE,
  { name: 'current', weights: WEIGHTS },
  {
    name: 'prefix-heavy',
    weights: { ...WEIGHTS, prefixBonus: 400, exactBonus: 600, justStep: 80 },
  },
  {
    name: 'just-heavy',
    weights: { ...WEIGHTS, justStep: 160, prefixBonus: 200 },
  },
  {
    name: 'peer-soft',
    weights: { ...WEIGHTS, peerPenalty: 10 },
  },
];

// Inline a trimmed audit loop so we can pass weights without rewriting the CLI.
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Text, EditorState } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { beluga } from '../js/editor-src/language.mjs';
import { createSyntaxStore } from '../js/editor-src/semantic/syntax-store.mjs';
import { createSymbolStore } from '../js/editor-src/semantic/symbol-store.mjs';
import { listGroupSymbols } from '../js/editor-src/semantic/project-prelude.mjs';
import { inferActiveCfgByDir } from '../js/editor-src/semantic/development.mjs';
import { classifyCompletionSite } from '../js/editor-src/ide/completion/classify.mjs';

const root = process.cwd();
const dataDir = path.resolve(root, 'library/data');
const prefixLengths = [0, 1, 3];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(?:bel|elf|cfg)$/iu.test(entry.name)) out.push(full);
  }
  return out;
}

function buildStore(text, documentId) {
  const doc = Text.of(text.split('\n'));
  const tree = parser.parse(doc.toString());
  const syntaxStore = createSyntaxStore({ documentId });
  const syntax = syntaxStore.update(tree, doc, { documentId });
  const symbols = createSymbolStore();
  symbols.update(syntax);
  return { symbols, syntaxStore };
}

function runOnce(weights) {
  const sourceFiles = walk(dataDir).sort();
  const files = sourceFiles.map((full) => {
    const name = path.relative(dataDir, full).replaceAll('\\', '/');
    return { id: name, name, text: fs.readFileSync(full, 'utf8') };
  });
  const texts = new Map(files.map((f) => [f.id, f.text]));
  const getText = (id) => texts.get(id) || '';
  const activeCfgByDir = inferActiveCfgByDir(files, getText);

  let calls = 0;
  let recalled = 0;
  let recallAt10 = 0;
  let reciprocalRank = 0;
  let j1 = 0;
  let j2 = 0;
  let j3 = 0;
  const latencies = [];

  for (const file of files) {
    if (!file.name.endsWith('.bel')) continue;
    const text = getText(file.id);
    const { symbols, syntaxStore } = buildStore(text, `workspace://${file.name}`);
    const snap = symbols.getSnapshot();
    const state = EditorState.create({ doc: text, extensions: [beluga()] });
    const engine = {
      stores: { symbols, syntax: syntaxStore },
      getHoles: () => [],
      getCheckerCode: () => text,
    };
    const peers = listGroupSymbols(files, file.id, getText, {
      activeCfgsForDir: (dir) => (activeCfgByDir[dir] ? [activeCfgByDir[dir]] : []),
    });

    for (const use of snap.references) {
      for (const length of prefixLengths) {
        const prefixEnd = Math.min(use.to, use.from + length);
        const site = classifyCompletionSite(state, prefixEnd, engine);
        if (site.kind !== 'ident') continue;
        const query = text.slice(use.from, prefixEnd);
        const simulated = { ...site, query, from: use.from, to: use.to };
        const t0 = performance.now();
        const items = gatherCompletions(simulated, engine, state, {
          getPeerSymbols: () => peers,
          activePath: file.name,
          weights,
        });
        latencies.push(performance.now() - t0);
        calls += 1;
        const rank = items.findIndex((item) => item.label === use.name);
        if (rank >= 0) {
          recalled += 1;
          reciprocalRank += 1 / (rank + 1);
          if (rank < 10) recallAt10 += 1;
        }
        // Cheap soundness: offered labels must be non-empty strings with just.
        for (const item of items) {
          if (!Number.isInteger(item.just)) j1 += 1;
        }
      }
    }
  }

  const n = Math.max(1, calls);
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.min(latencies.length - 1, Math.floor((latencies.length - 1) * 0.95))] || 0;
  return {
    calls,
    recallAt10: recallAt10 / n,
    mrr: reciprocalRank / n,
    recalledFrac: recalled / n,
    p95,
    bogusJust: j1 + j2 + j3,
  };
}

console.log('weigh sweep (offline prefix-rank model, not retained-pool runtime)\n');
console.log(
  `${'name'.padEnd(18)} ${'MRR'.padStart(7)} ${'R@10'.padStart(7)} ${'p95ms'.padStart(7)}`,
);
const rows = [];
for (const cand of CANDIDATES) {
  const r = runOnce(cand.weights);
  rows.push({ name: cand.name, ...r });
  console.log(
    `${cand.name.padEnd(18)} ${r.mrr.toFixed(3).padStart(7)} ${(r.recallAt10 * 100).toFixed(1).padStart(6)}% ${r.p95.toFixed(3).padStart(7)}`,
  );
}

const best = rows.reduce((a, b) => (b.mrr > a.mrr ? b : a));
console.log(`\nbest offline MRR: ${best.name} (${best.mrr.toFixed(3)})`);
fs.mkdirSync(path.join(root, 'scratch'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'scratch', 'autocomplete-weigh-sweep.json'),
  `${JSON.stringify({
    mode: 'offline-prefix-rank; production retains an empty-query pool and CodeMirror ranks filtered survivors',
    rows,
    best: best.name,
  }, null, 2)}\n`,
);
