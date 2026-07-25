// Semantic Engine V2 — symbol identity & resolution lock-down.
// Pins the core contract: AST-path-based SymbolIds survive formatting,
// references resolve through Reference -> SymbolId, and same-named decls
// stay distinct symbols.
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSemanticEngine } from '../js/editor-src/semantic/semantic-engine.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function engineOf(src) {
  const e = createSemanticEngine();
  e.update(parser.parse(src), Text.of(src.split('\n')));
  return e;
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

// --- Six global symbols, expected names ---------------------------------
const e = engineOf(SAMPLE);
const d = e.debugSnapshot();
expect(d.summary.globalSymbols === 6, `expected 6 global symbols, got ${d.summary.globalSymbols}`);
const names = new Set(d.symbols.filter((s) => s.isGlobal).map((s) => s.name));
for (const n of ['o', '⊃', '⊤', 'nd', '⊃I', '⊤I']) {
  expect(names.has(n), `missing expected global symbol ${n}`);
}

// --- Identity survives a format-only edit -------------------------------
// Same line/sibling structure, only indentation + inner spacing changed,
// so AST paths (and thus SymbolIds) must be identical.
const FORMATTED = `LF o : type =
        |   ⊃ :  o → o → o
        |   ⊤ :  o
;
LF nd : o → type =
        |   ⊃I :  (nd A → nd B) → nd (A ⊃ B)
        |   ⊤I :  nd ⊤
;
`;
const idOf = (eng, name) => eng.debugSnapshot().symbols.find((s) => s.name === name).id;
const e2 = engineOf(FORMATTED);
for (const n of ['⊃I', 'nd', '⊤']) {
  expect(idOf(e, n) === idOf(e2, n), `symbol ${n} id changed after format-only edit`);
}

// --- definitionAt resolves via Reference -> SymbolId --------------------
// The 'nd' reference inside ⊃I's signature must resolve to the nd type
// family symbol by id, not merely by name.
const ndRefPos = SAMPLE.indexOf('nd A'); // first 'nd' use inside ⊃I
const def = e.definitionAt(ndRefPos + 1);
expect(def, 'definitionAt on nd reference should resolve');
expect(def.namespace === 'lf-type-family', `nd ref should resolve to type family, got ${def.namespace}`);
const ndSym = e.debugSnapshot().symbols.find((s) => s.name === 'nd' && s.isGlobal);
expect(def.id === ndSym.id, 'definitionAt must return the nd symbol by exact id');

// --- Duplicate names in different declarations stay distinct ------------
const DUP = `LF a : type =
  | c : a
;
LF b : type =
  | c : b
;
`;
const dup = engineOf(DUP).debugSnapshot().symbols.filter((s) => s.name === 'c');
expect(dup.length === 2, `expected two 'c' symbols, got ${dup.length}`);
expect(new Set(dup.map((s) => s.id)).size === 2, 'two distinct c declarations must not collapse to one SymbolId');

// --- Mutual LF block: every head is its own type-family symbol ----------
// `LF n … and a … and p …` parses as ONE LFDatatypeDeclaration with three
// heads. Each head must be a distinct LF type family symbol, and references to
// the later heads must resolve to them — not be dropped (which previously made
// hovers read "implicit binder").
const MUTUAL = `LF n : type =
  | b : n
  and a : type =
  | dn : n -> n -> a
  and p : type =
  | match : n -> n -> p
;
`;
const me = engineOf(MUTUAL);
const ms = me.debugSnapshot().symbols.filter((s) => s.isGlobal);
for (const n of ['n', 'a', 'p']) {
  const sym = ms.find((s) => s.name === n);
  expect(sym, `mutual head ${n} must be a global symbol`);
  expect(sym.namespace === 'lf-type-family', `mutual head ${n} must be an LF type family, got ${sym && sym.namespace}`);
}
expect(new Set(ms.filter((s) => ['n', 'a', 'p'].includes(s.name)).map((s) => s.id)).size === 3,
  'the three mutual heads must be three distinct symbols');

// A reference to a later head (`-> a`) resolves to that head's symbol.
const aRefPos = MUTUAL.indexOf('-> a') + 3;
const aDef = me.definitionAt(aRefPos);
expect(aDef, 'definitionAt on mutual head `a` reference should resolve');
expect(aDef.namespace === 'lf-type-family', `use of \`a\` should resolve to type family, got ${aDef && aDef.namespace}`);
const aSym = ms.find((s) => s.name === 'a');
expect(aDef.id === aSym.id, 'use of `a` must resolve to the `a` head symbol by id');

console.log('OK semantic symbols v2 (identity, resolution, distinctness)');
