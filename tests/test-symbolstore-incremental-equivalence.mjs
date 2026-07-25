// Gate: the symbol store's INCREMENTAL update path (reuse untouched top-level
// declarations, position-shifted; recompute only the changed ones) must produce
// a snapshot equivalent to a full rebuild of the same text. "Equivalent" here is
// the property the IDE actually depends on: the same symbols at the same spans,
// and every reference resolving to the SAME target declaration. If reuse ever
// strands a reference or drifts a symbol, hover / go-to-def / rename silently
// corrupt — so this test, not the passing of the rest of the suite, is what lets
// us trust turning the incremental path on in the engine.
//
// The path was shipped but never wired into semanticEngine.update (it called
// symbolStore.update WITHOUT opts.changes) and never had this test — so it was
// dead, unverified code until the wiring fix. This fuzzes it against fullUpdate.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Text, ChangeSet } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSyntaxStore } from '../js/editor-src/semantic/syntax-store.mjs';
import { createSymbolStore } from '../js/editor-src/semantic/symbol-store.mjs';

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(here, '..', 'library', 'data', 'case-studies', 'classical-processes');
const DOC_ID = 'workspace://main.bel';

function mkSyntax(doc, tree) {
  const store = createSyntaxStore({ documentId: DOC_ID });
  return store.update(tree, doc, { documentId: DOC_ID });
}

// Canonical form keyed on STRUCTURE, not numeric ids: a reference is compared by
// where it points (the target decl's identity + span), so two stores that agree
// on meaning match even if their id counters differ. This tests the real
// invariant (correct resolution) rather than an implementation detail.
function symKey(s) {
  return `${s.namespace}|${s.name}|${s.structuralKey}|${s.range.from}-${s.range.to}|${s.nameRange.from}-${s.nameRange.to}`;
}
function canon(snap) {
  const byId = snap.symbolsById;
  const globals = snap.globalSymbols.map(symKey).sort();
  const locals = snap.localSymbols.map(symKey).sort();
  const refs = snap.references.map((r) => {
    const t = r.symbolId ? byId.get(r.symbolId) : null;
    return `${r.range.from}-${r.range.to}|${r.name ?? ''}=>${t ? symKey(t) : 'UNRESOLVED'}`;
  }).sort();
  return JSON.stringify({ globals, locals, refs });
}

// Deterministic PRNG so a failure is reproducible.
function mulberry32(seed) {
  return function next() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INSERT_SNIPPETS = ['x', ' ', '\n', 'foo', 'X', ' => ', 'ctx', '(', ')', 'lam ', '?'];

function randomChange(rand, doc) {
  const len = doc.length;
  const roll = rand();
  if (roll < 0.15) {
    // Append a whole new declaration at the very end (interface change / suffix).
    const name = `t_gen${Math.floor(rand() * 1e6)}`;
    return { from: len, to: len, insert: `\n\n${name} : type.\n` };
  }
  const from = Math.floor(rand() * (len + 1));
  if (roll < 0.55) {
    // Insertion inside the body.
    const s = INSERT_SNIPPETS[Math.floor(rand() * INSERT_SNIPPETS.length)];
    return { from, to: from, insert: s };
  }
  // Deletion of a small span.
  const to = Math.min(len, from + 1 + Math.floor(rand() * 6));
  return { from, to, insert: '' };
}

function runFile(file, seed, steps) {
  const src = readFileSync(join(dataRoot, file), 'utf8');
  let doc = Text.of(src.split('\n'));
  let tree = parser.parse(doc.toString());
  let syntax = mkSyntax(doc, tree);

  const incStore = createSymbolStore();
  const fullStore = createSymbolStore();
  // Prime both identically from scratch — same history is what makes ids
  // comparable, and canon() is id-agnostic regardless.
  incStore.update(syntax);
  fullStore.update(syntax);

  const rand = mulberry32(seed);
  for (let step = 0; step < steps; step += 1) {
    const spec = randomChange(rand, doc);
    const changes = ChangeSet.of(spec, doc.length);
    const newDoc = changes.apply(doc);
    const newTree = parser.parse(newDoc.toString());
    const newSyntax = mkSyntax(newDoc, newTree);

    const incSnap = incStore.update(newSyntax, { changes });
    const fullSnap = fullStore.update(newSyntax, { forceFull: true });

    const a = canon(incSnap);
    const b = canon(fullSnap);
    if (a !== b) {
      // Surface the first differing line for debugging.
      const ao = JSON.parse(a); const bo = JSON.parse(b);
      for (const field of ['globals', 'locals', 'refs']) {
        const as = new Set(ao[field]); const bs = new Set(bo[field]);
        const onlyInc = ao[field].filter((x) => !bs.has(x)).slice(0, 3);
        const onlyFull = bo[field].filter((x) => !as.has(x)).slice(0, 3);
        if (onlyInc.length || onlyFull.length) {
          console.error(`  [${field}] incremental-only:`, onlyInc);
          console.error(`  [${field}] full-only:      `, onlyFull);
        }
      }
      fail(`${file} seed=${seed} step=${step}: incremental snapshot != full rebuild (edit ${JSON.stringify(spec)})`);
    }
    doc = newDoc; tree = newTree; syntax = newSyntax;
  }
  return steps;
}

let total = 0;
for (const file of ['cp_thrm.bel', 'cp_base.bel']) {
  for (let seed = 1; seed <= 6; seed += 1) {
    total += runFile(file, seed, 120);
  }
}

console.log(`OK symbolstore-incremental-equivalence: ${total} fuzzed edits, incremental === full rebuild (symbols + reference resolution)`);
