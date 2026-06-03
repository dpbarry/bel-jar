// Semantic Engine V2 — notation/fixity dependency lock-down.
// Pins the first closed gap: an --infix/--prefix pragma is a PRAGMA-namespace
// node that depends on the operator's LF symbol via a typed NOTATION edge,
// the operator occurrence is tracked as a reference (so rename rewrites it),
// and a pragma for a defined operator does not become blocked.
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';
import { EDGE_KIND, NAMESPACE, STATUS } from '../editor-src/semantic/ids.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const SRC = `LF o : type =
  | ⊃ : o → o → o
  | ¬ : o → o
;
--infix ⊃ 5 right.
--prefix ¬ 8.
LF nd : o → type =
  | ⊃I : (nd A → nd B) → nd (A ⊃ B)
;
`;

const e = createSemanticEngine();
e.update(parser.parse(SRC), Text.of(SRC.split('\n')));
const d = e.debugSnapshot();
const symById = new Map(d.symbols.map((s) => [s.id, s]));

// --- A PRAGMA node exists for each fixity pragma ------------------------
const pragmaNodes = d.graph.nodes.filter((n) => n.namespace === NAMESPACE.PRAGMA);
expect(pragmaNodes.length === 2, `expected 2 pragma nodes, got ${pragmaNodes.length}`);
for (const n of pragmaNodes) {
  expect(n.status !== STATUS.BLOCKED, `pragma node ${n.name} for a defined operator must not be blocked`);
}

// --- NOTATION edge from the --infix pragma to the ⊃ LF constructor ------
const opSym = d.symbols.find((s) => s.name === '⊃' && s.namespace === NAMESPACE.LF_CONSTRUCTOR);
expect(opSym, 'operator ⊃ should have an LF constructor symbol');
const notationEdges = d.graph.edges.filter((ed) => ed.kind === EDGE_KIND.NOTATION);
expect(notationEdges.length === 2, `expected 2 notation edges, got ${notationEdges.length}`);
const infixEdge = notationEdges.find(
  (ed) => symById.get(ed.from)?.namespace === NAMESPACE.PRAGMA && ed.to === opSym.id
);
expect(infixEdge, 'expected a NOTATION edge from the --infix pragma to the ⊃ constructor');
// And no signature/body edge masquerades as the pragma dependency.
for (const ed of d.graph.edges) {
  if (symById.get(ed.from)?.namespace === NAMESPACE.PRAGMA) {
    expect(ed.kind === EDGE_KIND.NOTATION, `pragma-owned edge should be NOTATION, got ${ed.kind}`);
  }
}

// --- Operator stays a tracked reference (signature use + pragma use) -----
const refs = e.referencesOf(opSym.id);
expect(refs.length === 2, `⊃ should be referenced twice (signature + notation), got ${refs.length}`);

// --- Renaming the operator rewrites the pragma occurrence too -----------
const rename = e.renamePreview(opSym.id, 'imp');
expect(rename.ok, `rename ⊃ should succeed, got ${rename.reason}`);
expect(rename.edits.length === 3, `rename ⊃ should touch def + 2 refs = 3 edits, got ${rename.edits.length}`);
const pragmaStart = SRC.indexOf('--infix');
const pragmaEnd = SRC.indexOf('\n', pragmaStart);
const rewritesPragma = rename.edits.some((ed) => ed.from >= pragmaStart && ed.to <= pragmaEnd);
expect(rewritesPragma, 'rename must rewrite the operator occurrence inside the --infix pragma');

console.log('OK semantic notation v2 (pragma nodes, NOTATION edges, rename-tracked operators)');
