// Semantic Engine V2 — typed dependency edges lock-down.
// Pins that the natural-deduction sample produces the expected SIGNATURE
// edges between constructors and the type families/constructors they use,
// and that a clean file yields no syntax diagnostics or blocked nodes.
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSemanticEngine } from '../js/editor-src/semantic/semantic-engine.mjs';

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
const d = e.debugSnapshot();

const idByName = new Map(d.symbols.map((s) => [s.name, s.id]));
const nameById = new Map(d.symbols.map((s) => [s.id, s.name]));

// Resolve edges back to readable name->name with kind.
const edgeSet = new Set(
  d.graph.edges.map((ed) => `${nameById.get(ed.from)}->${nameById.get(ed.to)}:${ed.kind}`)
);

for (const want of ['⊃I->nd:signature', '⊃I->⊃:signature', '⊤I->nd:signature', '⊤I->⊤:signature']) {
  expect(edgeSet.has(want), `missing typed edge ${want}; got ${[...edgeSet].join(' | ')}`);
}

// Edge endpoints must be real SymbolIds, not name strings.
for (const ed of d.graph.edges) {
  expect(idByName.has(nameById.get(ed.from)) || true, 'edge.from sanity');
  expect(nameById.has(ed.from) && nameById.has(ed.to), 'edge endpoints must be known SymbolIds');
}

// Clean file: no syntax diagnostics, nothing blocked.
expect(d.summary.syntaxDiagnostics === 0, `clean sample should have 0 diagnostics, got ${d.summary.syntaxDiagnostics}`);
for (const n of d.graph.nodes) {
  expect(n.status !== 'blocked', `clean node ${n.name} should not be blocked`);
  expect(n.status !== 'syntax-fault', `clean node ${n.name} should not be syntax-fault`);
}

console.log('OK semantic graph v2 (typed signature edges, clean status)');
