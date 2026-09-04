// Gate: semanticGraph.update's incremental path (reuse clean nodes + their
// outgoing edges; rebuild only body-dirty owners) must match a full rebuild
// of the same symbols + syntax + previous snapshot. Status / dirty / cascade
// all depend on previous, so both sides are handed the same previous object.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Text, ChangeSet } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSyntaxStore } from '../js/editor-src/semantic/syntax-store.mjs';
import { createSymbolStore } from '../js/editor-src/semantic/symbol-store.mjs';
import { createSemanticGraph } from '../js/editor-src/semantic/semantic-graph.mjs';

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(here, '..', 'library', 'data', 'case-studies', 'classical-processes');
const DOC_ID = 'workspace://main.bel';

function mkSyntax(store, doc, tree, changes) {
  const syntax = store.update(tree, doc, { documentId: DOC_ID, changes });
  void syntax.syntaxDiagnostics;
  return syntax;
}

function canon(snap) {
  const nodes = [...snap.nodeMap.values()].map((n) => (
    `${n.id}|${n.name}|${n.namespace}|${n.signatureHash}|${n.bodyHash}|${n.status}|${n.range.from}-${n.range.to}|${n.nameRange.from}-${n.nameRange.to}|${n.diagnostics.length}`
  )).sort();
  const edges = snap.edges.map((e) => `${e.from}->${e.to}:${e.kind}`).sort();
  const dirty = [...snap.dirty].sort();
  const removed = [...(snap.removed || [])].sort();
  return JSON.stringify({ nodes, edges, dirty, removed });
}

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
    const name = `t_gen${Math.floor(rand() * 1e6)}`;
    return { from: len, to: len, insert: `\n\n${name} : type.\n` };
  }
  const from = Math.floor(rand() * (len + 1));
  if (roll < 0.55) {
    const s = INSERT_SNIPPETS[Math.floor(rand() * INSERT_SNIPPETS.length)];
    return { from, to: from, insert: s };
  }
  const to = Math.min(len, from + 1 + Math.floor(rand() * 6));
  return { from, to, insert: '' };
}

function runFile(file, seed, steps) {
  const src = readFileSync(join(dataRoot, file), 'utf8');
  let doc = Text.of(src.split('\n'));
  let tree = parser.parse(doc.toString());
  const syntaxStore = createSyntaxStore({ documentId: DOC_ID });
  const symbolStore = createSymbolStore();
  let syntax = mkSyntax(syntaxStore, doc, tree);
  let symbols = symbolStore.update(syntax);

  const live = createSemanticGraph();
  let previous = live.update(symbols, syntax);

  const rand = mulberry32(seed);
  let incrementalHits = 0;
  for (let step = 0; step < steps; step += 1) {
    const spec = randomChange(rand, doc);
    const changes = ChangeSet.of(spec, doc.length);
    const newDoc = changes.apply(doc);
    const newTree = parser.parse(newDoc.toString());
    syntax = mkSyntax(syntaxStore, newDoc, newTree, changes);
    symbols = symbolStore.update(syntax, { changes });

    const full = createSemanticGraph().update(symbols, syntax, {
      previous,
      forceFull: true,
    });
    const inc = live.update(symbols, syntax, { previous });
    if (inc._updateKind === 'incremental') incrementalHits += 1;

    const a = canon(inc);
    const b = canon(full);
    if (a !== b) {
      fail(`${file} seed=${seed} step=${step} kind=${inc._updateKind}: incremental graph != full rebuild (edit ${JSON.stringify(spec)})`);
    }
    previous = inc;
    doc = newDoc;
    tree = newTree;
  }
  return { steps, incrementalHits };
}

let total = 0;
let hits = 0;
for (const file of ['cp_thrm.bel', 'cp_base.bel']) {
  for (let seed = 1; seed <= 4; seed += 1) {
    const r = runFile(file, seed, 80);
    total += r.steps;
    hits += r.incrementalHits;
  }
}

if (hits < 1) fail('fuzz never took the incremental graph path');

// Reference-only resolution change (no bodyHash edit) must match full rebuild.
{
  const file = 'cp_base.bel';
  const src = readFileSync(join(dataRoot, file), 'utf8');
  let doc = Text.of(src.split('\n'));
  let tree = parser.parse(doc.toString());
  const syntaxStore = createSyntaxStore({ documentId: DOC_ID });
  const symbolStore = createSymbolStore();
  const syntax = mkSyntax(syntaxStore, doc, tree);
  const symbols = symbolStore.update(syntax);
  const live = createSemanticGraph();
  const previous = live.update(symbols, syntax);

  let refIdx = -1;
  for (let i = 0; i < symbols.references.length; i += 1) {
    const ref = symbols.references[i];
    if (ref.enclosingDeclarationId) {
      refIdx = i;
      break;
    }
  }
  if (refIdx < 0) fail('reference-only pin: no owned ref in cp_base.bel');

  const refs = symbols.references.slice();
  const before = refs[refIdx];
  refs[refIdx] = before.symbolId
    ? { ...before, symbolId: null, resolution: undefined }
    : { ...before, symbolId: 'synthetic-resolved', resolution: 'global' };
  const referencesByOwner = new Map();
  for (const ref of refs) {
    const ownerId = ref.enclosingDeclarationId;
    if (!ownerId) continue;
    const list = referencesByOwner.get(ownerId);
    if (list) list.push(ref);
    else referencesByOwner.set(ownerId, [ref]);
  }
  const symbols2 = { ...symbols, references: refs, referencesByOwner };

  const full = createSemanticGraph().update(symbols2, syntax, { previous, forceFull: true });
  const inc = live.update(symbols2, syntax, { previous });
  if (inc._updateKind !== 'incremental') fail('reference-only change should use incremental path');
  if (canon(inc) !== canon(full)) fail('reference-only resolution change: incremental != full');
}

console.log(`OK graph-incremental-equivalence: ${total} fuzzed edits, incremental === full (${hits} incremental hits)`);
