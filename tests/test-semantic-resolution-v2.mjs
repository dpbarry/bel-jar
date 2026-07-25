// Semantic Engine V2 — grammar-position reference resolution lock-down.
// Replaces blunt lower/upper namespace matching: the same identifier text can
// name symbols in several namespaces, and only one is legal at a given
// syntactic position. These tests pin that references resolve by *position*
// (LF type head vs LF term head vs comp type), and that a reference with no
// legal target at its position stays unresolved rather than binding wrongly.
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSemanticEngine } from '../js/editor-src/semantic/semantic-engine.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const eng = (src) => {
  const e = createSemanticEngine();
  e.update(parser.parse(src), Text.of(src.split('\n')));
  return e;
};

// 't' is simultaneously an LF type family (decl 1) and an LF constructor
// (inside family u). Uses in type-head vs term positions must resolve apart.
const SRC = `LF t : type =
  | z : t
;
LF u : type =
  | t : u → u
;
LF p : t → type =
  | mk : p z
;
LF q : u → type =
  | r : q (t z)
;
`;
const e = eng(SRC);
const def = (needle, offset) => e.definitionAt(SRC.indexOf(needle) + offset);

// Type-head occurrences of 't' -> the type family.
expect(def('z : t', 4).namespace === 'lf-type-family', "'t' in 'z : t' (type head) must be the type family");
expect(def('p : t', 4).namespace === 'lf-type-family', "'t' in 'p : t' (type head) must be the type family");
// Term occurrence of 't' -> the constructor.
expect(def('(t z)', 1).namespace === 'lf-constructor', "'t' in '(t z)' (term head) must be the constructor");

// The two are genuinely different symbols.
const tFamily = def('p : t', 4);
const tCtor = def('(t z)', 1);
expect(tFamily.id !== tCtor.id, 'the type family and constructor named t must be distinct symbols');

// Uppercase implicit metavariables in LF positions never bind to a global,
// even when a same-named global exists in another namespace.
{
  const e2 = eng(`inductive A : ctype =\n  | mkA : A\n;\nLF nd : o → type =\n  | impI : nd X → nd X\n;\n`);
  const xRefs = e2.debugSnapshot().references.filter((r) => r.name === 'X');
  expect(xRefs.length > 0, 'sample should contain X references');
  expect(xRefs.every((r) => r.resolution === 'unresolved'),
    'uppercase metavariable X in LF term position must not bind to the comp type A or anything global');
}

// A type-head reference with NO type family of that name stays unresolved,
// rather than falling back to a constructor of the same name.
{
  const e3 = eng(`LF base : type =\n  | only : base\n;\nLF k : only → type =\n;\n`);
  const onlyRef = e3.debugSnapshot().references.find((r) => r.name === 'only');
  expect(onlyRef, "reference to 'only' should exist");
  expect(onlyRef.resolution === 'unresolved',
    "'only' in type-head position must stay unresolved (it is a constructor, not a type family)");
}

console.log('OK semantic resolution v2 (position-aware: type head vs term head, no illegal-position binding)');
