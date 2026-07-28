import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Text } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { beluga } from '../js/editor-src/language.mjs';
import { createSyntaxStore } from '../js/editor-src/semantic/syntax-store.mjs';
import { createSymbolStore } from '../js/editor-src/semantic/symbol-store.mjs';
import {
  listGroupSymbols,
} from '../js/editor-src/semantic/project-prelude.mjs';
import { inferActiveCfgByDir } from '../js/editor-src/semantic/development.mjs';
import { classifyCompletionSite } from '../js/editor-src/ide/completion/classify.mjs';
import { gatherCompletions, permitsImplicitCompletion } from '../js/editor-src/ide/completion/source.mjs';
import { typeCompatibleWithGoal } from '../js/editor-src/prover/hole-split.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const dataDir = path.resolve(root, arg('--dir', 'library/data'));
const limit = Number(arg('--limit', '0')) || Infinity;
const outputDir = path.resolve(root, 'scratch');
const prefixLengths = [0, 1, 3];

function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(?:bel|elf|cfg)$/iu.test(entry.name)) out.push(full);
  }
  return out;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const i = Math.min(values.length - 1, Math.floor((values.length - 1) * p));
  return values.slice().sort((a, b) => a - b)[i];
}

function maximum(values) {
  let max = 0;
  for (const value of values) if (value > max) max = value;
  return max;
}

function buildStore(text, documentId) {
  const doc = Text.of(text.split('\n'));
  const tree = parser.parse(doc.toString());
  const syntaxStore = createSyntaxStore({ documentId });
  const syntax = syntaxStore.update(tree, doc, { documentId });
  const symbols = createSymbolStore();
  const snapshot = symbols.update(syntax);
  return { doc, symbols, syntaxStore, snapshot };
}

function sourceCandidates(symbols, pos, peers, site) {
  const visible = symbols.visibleSymbolsAt(pos, {
    namespaces: site.namespaces || null,
    refKind: site.refKind || null,
  }).filter((symbol) => {
    if (!symbol.isGlobal) return site.allowLocals !== false;
    return !site.localsOnly;
  });
  const peerNames = (site.localsOnly ? [] : peers)
    .filter((symbol) => {
      if (!symbol.namespace) return false;
      if (site.namespaces) return site.namespaces.has(symbol.namespace);
      return true;
    })
    .map((symbol) => symbol.name);
  return new Set([
    ...visible.map((symbol) => symbol.name),
    ...peerNames,
  ]);
}

function j2Candidates(symbols, pos, peers, site) {
  if (!site.namespaces) return null;
  return sourceCandidates(symbols, pos, peers, site);
}

function j3Candidates(symbols, pos, site) {
  const goal = site.expectedType;
  if (!goal) return null;
  const visible = symbols.visibleSymbolsAt(pos, {
    namespaces: site.namespaces || null,
    refKind: site.refKind || null,
  }).filter((symbol) => {
    if (!symbol.isGlobal) return site.allowLocals !== false;
    return !site.localsOnly;
  });
  const allowed = new Set();
  for (const symbol of visible) {
    if (!symbol?.name || !symbol.sourceText) continue;
    if (typeCompatibleWithGoal(symbol.sourceText, goal) === true) allowed.add(symbol.name);
  }
  return allowed;
}

function auditFile(file, files, getText, activeCfgByDir, stats, violations) {
  const text = getText(file.id);
  if (!file.name.endsWith('.bel')) return;

  const { symbols, syntaxStore, snapshot } = buildStore(text, `workspace://${file.name}`);
  const state = EditorState.create({ doc: text, extensions: [beluga()] });
  const engine = {
    stores: { symbols, syntax: syntaxStore },
    getHoles: () => [],
    getCheckerCode: () => text,
  };
  const peers = listGroupSymbols(files, file.id, getText, {
    activeCfgsForDir: (dir) => activeCfgByDir[dir] ? [activeCfgByDir[dir]] : [],
  });

  for (const use of snapshot.references) {
    if (stats.sites >= limit) return;
    stats.sites += 1;
    for (const length of prefixLengths) {
      const prefixEnd = Math.min(use.to, use.from + length);
      const site = classifyCompletionSite(state, prefixEnd, engine);
      if (site.kind !== 'ident') {
        stats.declined += 1;
        continue;
      }

      const query = text.slice(use.from, prefixEnd);
      const simulated = { ...site, query, from: use.from, to: use.to };
      const start = performance.now();
      const items = gatherCompletions(simulated, engine, state, {
        getPeerSymbols: () => peers,
        activePath: file.name,
      });
      stats.latencies.push(performance.now() - start);
      stats.calls += 1;
      if (site.namespaces) stats.j2Sites += 1;
      else if (items.length) stats.j1OnlyRawOffers += items.length;
      if (site.expectedType) stats.j3Sites += 1;
      if (!site.namespaces && items.length && query && permitsImplicitCompletion(site)) {
        stats.implicitJ1Offers += items.length;
      }

      const expected = sourceCandidates(symbols, use.from, peers, simulated);
      const j2Expected = j2Candidates(symbols, use.from, peers, simulated);
      const j3Expected = j3Candidates(symbols, use.from, simulated);
      for (const item of items) {
        stats.offers += 1;
        if (!expected.has(item.label)) {
          stats.j1Violations += 1;
          if (violations.length < 25) {
            violations.push({
              kind: 'unresolvable-offer',
              file: file.name,
              offset: use.from,
              query,
              offered: item.label,
            });
          }
        }
        if (j2Expected && !j2Expected.has(item.label)) {
          stats.j2Violations += 1;
          if (violations.length < 25) {
            violations.push({
              kind: 'wrong-namespace-offer',
              file: file.name,
              offset: use.from,
              query,
              offered: item.label,
            });
          }
        }
        if (j3Expected && item.just === 3 && !j3Expected.has(item.label)) {
          stats.j3Violations += 1;
          if (violations.length < 25) {
            violations.push({
              kind: 'wrong-type-offer',
              file: file.name,
              offset: use.from,
              query,
              offered: item.label,
              goal: site.expectedType,
            });
          }
        }
      }

      const rank = items.findIndex((item) => item.label === use.name);
      if (rank >= 0) {
        stats.recalled += 1;
        stats.reciprocalRank += 1 / (rank + 1);
        if (rank < 10) stats.recallAt10 += 1;
      }
    }
  }
}

const sourceFiles = walk(dataDir).sort();
const files = sourceFiles.map((full) => {
  const name = path.relative(dataDir, full).replaceAll('\\', '/');
  return { id: name, name, text: fs.readFileSync(full, 'utf8') };
});
const texts = new Map(files.map((file) => [file.id, file.text]));
const getText = (id) => texts.get(id) || '';
const activeCfgByDir = inferActiveCfgByDir(files, getText);
const stats = {
  sites: 0,
  calls: 0,
  declined: 0,
  offers: 0,
  recalled: 0,
  recallAt10: 0,
  reciprocalRank: 0,
  j2Sites: 0,
  j3Sites: 0,
  j1Violations: 0,
  j2Violations: 0,
  j3Violations: 0,
  j1OnlyRawOffers: 0,
  implicitJ1Offers: 0,
  latencies: [],
};
const violations = [];

for (const file of files) auditFile(file, files, getText, activeCfgByDir, stats, violations);

const calls = Math.max(1, stats.calls);
const report = {
  corpus: {
    root: path.relative(root, dataDir).replaceAll('\\', '/'),
    files: files.filter((file) => file.name.endsWith('.bel')).length,
    referenceSites: stats.sites,
    simulatedPrefixes: prefixLengths,
  },
  soundness: {
    j1Violations: stats.j1Violations,
    j2Violations: stats.j2Violations,
    j3Violations: stats.j3Violations,
    j1OnlyRawOffers: stats.j1OnlyRawOffers,
    implicitJ1Offers: stats.implicitJ1Offers,
    note: 'J1-only raw offers remain available to explicit Ctrl-Space; implicitJ1Offers must remain zero.',
    samples: violations,
  },
  utility: {
    calls: stats.calls,
    declined: stats.declined,
    offers: stats.offers,
    recallAt10: stats.recallAt10 / calls,
    meanReciprocalRank: stats.reciprocalRank / calls,
    j2SiteCoverage: stats.j2Sites / calls,
    j3SiteCoverage: stats.j3Sites / calls,
  },
  latencyMs: {
    p50: percentile(stats.latencies, 0.5),
    p95: percentile(stats.latencies, 0.95),
    max: maximum(stats.latencies),
  },
};

fs.mkdirSync(outputDir, { recursive: true });
const output = path.join(outputDir, 'autocomplete-audit.json');
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);

console.log(`corpus: ${report.corpus.files} .bel files, ${report.corpus.referenceSites} reference sites, ${report.utility.calls} simulated prefixes`);
console.log(`soundness: J1 violations ${report.soundness.j1Violations}; J2 violations ${report.soundness.j2Violations}; J3 violations ${report.soundness.j3Violations}; implicit J1 offers ${report.soundness.implicitJ1Offers}`);
console.log(`utility: J2 coverage ${(report.utility.j2SiteCoverage * 100).toFixed(1)}%; J3 coverage ${(report.utility.j3SiteCoverage * 100).toFixed(1)}%; recall@10 ${(report.utility.recallAt10 * 100).toFixed(1)}%; MRR ${report.utility.meanReciprocalRank.toFixed(3)}`);
console.log(`latency: p50 ${report.latencyMs.p50.toFixed(3)} ms; p95 ${report.latencyMs.p95.toFixed(3)} ms; max ${report.latencyMs.max.toFixed(3)} ms`);
console.log(`report: ${path.relative(root, output).replaceAll('\\', '/')}`);
