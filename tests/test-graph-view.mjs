// Dependency Graph view: pins the pure model + layout (DOM-free). The neighborhood
// model BFS-expands deps (down) and dependents (up) from a root; the layout places
// the root centered with dependents above and dependencies below.
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';
import { buildNeighborhood, buildGlobalModel, layoutGraph, demoteNotation } from '../editor-src/bel-graph-view.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const SAMPLE = `LF o : type =
  | ⊃ : o → o → o
  | ⊤ : o
;
LF nd : o → type =
  | ⊃I : (nd A → nd B) → nd (A ⊃ B)
  | ⊤I : nd ⊤
;
`;

const e = createSemanticEngine();
e.update(parser.parse(SAMPLE), Text.of(SAMPLE.split('\n')));

const idOf = (name) => e.getSnapshot().graph.nodeMap && [...e.getSnapshot().graph.nodeMap.values()]
  .find((n) => n.name === name)?.id;

const ndId = idOf('nd');
expect(ndId, 'fixture has an nd node');

// --- neighborhood model ---------------------------------------------------
const model = buildNeighborhood(e, ndId, { depth: 1 });
expect(model && model.root === ndId, 'neighborhood root is nd');
const byName = (m) => m.nodes.map((n) => n.name).sort();
const names = byName(model);
expect(names.includes('nd'), 'model includes the root nd');
expect(names.includes('o'), 'model includes dependency o (nd depends on o)');
expect(names.includes('⊃I') && names.includes('⊤I'),
  `model includes dependents ⊃I/⊤I, got ${names}`);

const roleOf = (nm) => model.nodes.find((n) => n.name === nm).role;
expect(roleOf('nd') === 'root', 'nd tagged root');
expect(roleOf('o') === 'dependency', 'o tagged dependency');
expect(roleOf('⊃I') === 'dependent', '⊃I tagged dependent');

const dirOf = (nm) => model.nodes.find((n) => n.name === nm).dir;
expect(dirOf('o') === +1, 'dependency points down (dir +1)');
expect(dirOf('⊃I') === -1, 'dependent points up (dir -1)');

// Every node carries display metadata (so the renderer can tint/label).
for (const n of model.nodes) {
  expect('namespace' in n, `node ${n.name} carries namespace`);
}

// Edges are unique and reference real nodes.
const nodeIds = new Set(model.nodes.map((n) => n.id));
for (const ed of model.edges) {
  expect(nodeIds.has(ed.from) && nodeIds.has(ed.to), 'edge endpoints are model nodes');
  expect(typeof ed.kind === 'string', 'edge carries a kind');
}
const edgeKeys = model.edges.map((ed) => `${ed.from}->${ed.to}:${ed.kind}`);
expect(new Set(edgeKeys).size === edgeKeys.length, 'edges are deduped');

// --- layout ---------------------------------------------------------------
const layout = layoutGraph(model, { mode: 'neighborhood' });
expect(layout.nodes.length === model.nodes.length, 'layout positions every node');
expect(layout.width > 0 && layout.height > 0, 'layout has positive extent');
for (const n of layout.nodes) {
  expect(Number.isFinite(n.x) && Number.isFinite(n.y), `node ${n.name} has finite coords`);
  expect(n.w > 0 && n.h > 0, 'node has size');
}
// Dependents sit above the root; dependencies below.
const yOf = (nm) => layout.nodes.find((n) => n.name === nm).y;
expect(yOf('⊃I') < yOf('nd'), 'dependent ⊃I is above the root');
expect(yOf('o') > yOf('nd'), 'dependency o is below the root');
// Every edge got a path string.
for (const ed of layout.edges) {
  expect(typeof ed.path === 'string' && ed.path.startsWith('M'), 'edge has an SVG path');
}

// --- global model ---------------------------------------------------------
const global = buildGlobalModel(e);
expect(global.root === null, 'global model has no root');
expect(global.nodes.some((n) => n.name === 'nd') && global.nodes.some((n) => n.name === 'o'),
  'global model includes all decls');
const glayout = layoutGraph(global, { mode: 'global' });
expect(glayout.nodes.length === global.nodes.length, 'global layout positions every node');
for (const n of glayout.nodes) {
  expect(Number.isFinite(n.x) && Number.isFinite(n.y), `global node ${n.name} finite coords`);
}

// --- notation demotion: operator pragma nodes fold into their constructor ---
// (fixes the confusing "duplicate ⊃" — the LF constructor and its --infix
// notation are two real symbols; the graph should show ONE, badged.)
{
  const OPS = `LF o : type =
  | ⊃ : o → o → o
  | ¬ : o → o
;
--prefix ¬ 5.
--infix ⊃ 2 right.
`;
  const eo = createSemanticEngine();
  eo.update(parser.parse(OPS), Text.of(OPS.split('\n')));
  const m = buildGlobalModel(eo);
  const opNames = m.nodes.map((n) => n.name);
  expect(!m.nodes.some((n) => n.namespace === 'pragma'), 'no pragma/notation nodes survive in the model');
  expect(opNames.length === new Set(opNames).size, 'no duplicate-name nodes (⊃/¬ appear once)');
  const sup = m.nodes.find((n) => n.name === '⊃');
  expect(sup && sup.notation === true, 'the ⊃ constructor carries a notation badge');
  // demoteNotation is idempotent + a no-op when there are no pragma nodes.
  const plain = { root: null, nodes: [{ id: 'x', name: 'x', namespace: 'rec-function' }], edges: [] };
  expect(demoteNotation(plain).nodes.length === 1, 'demoteNotation is a no-op without pragma nodes');
}

// --- degenerate inputs never throw --------------------------------------
expect(buildNeighborhood(e, 'no-such-id', { depth: 1 }).nodes.length === 1,
  'unknown root yields just the (empty) root node, no throw');
expect(layoutGraph({ root: null, nodes: [], edges: [] }).nodes.length === 0,
  'empty model lays out to nothing');

console.log('OK graph view (model: roles/dirs/dedup, notation-demote; layout; global; degenerate-safe)');
