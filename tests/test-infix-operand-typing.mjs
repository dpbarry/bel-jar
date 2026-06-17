// Infix operands are typed from the operator's declared signature when --infix
// is in scope — the juxtapositional parse tree is reinterpreted with full
// associativity/precedence. Covers LF terms, LF types, comp expressions,
// right-assoc chains, and cross-file pragmas.
import assert from 'node:assert';
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { resolveHoverDoc } from '../editor-src/bel-resolve.mjs';

const at = (src, needle, occ = 1) => {
  let i = -1;
  for (let k = 0; k < occ; k++) i = src.indexOf(needle, i + 1);
  return i;
};
const infixB = (src, span) => src.indexOf('B', src.indexOf(span));
const typeAt = (src, pos, files, activeId) => {
  if (files) {
    globalThis.BelJarPersist = {
      listFiles: () => files.list,
      getActiveFileId: () => activeId,
      getFileText: (id) => files.tx[id] || '',
      getActiveCfgForDir: (dir) => files.activeCfg?.[dir] || null,
    };
  }
  try {
    const r = resolveHoverDoc(parser.parse(src), Text.of(src.split('\n')), pos);
    return r && { kind: r.kind, label: r.label, type: r.sourceType };
  } finally {
    if (files) delete globalThis.BelJarPersist;
  }
};

// ── isolated LF infix (no sibling occurrences to borrow from) ────────────────
{
  const SRC = `LF o : type = | ⊃ : o → o → o ;
--infix ⊃ 5 right.
LF p : o → type = | mk : p (A ⊃ B) ;
`;
  const a = typeAt(SRC, at(SRC, 'A ⊃'));
  const b = typeAt(SRC, infixB(SRC, 'A ⊃ B'));
  assert.equal(a.kind, 'implicit');
  assert.equal(a.type, 'o', 'infix left operand typed from ⊃ domain');
  assert.equal(b.type, 'o', 'infix right operand typed from ⊃ second domain');
}

// ── right-associative chain: C is the innermost right operand ───────────────
{
  const SRC = `LF o : type = | ⊃ : o → o → o ;
--infix ⊃ 3 right.
LF p : o → type = | mk : p (A ⊃ B ⊃ C) ;
`;
  assert.equal(typeAt(SRC, at(SRC, 'A ⊃')).type, 'o');
  assert.equal(typeAt(SRC, at(SRC, 'B ⊃')).type, 'o');
  assert.equal(typeAt(SRC, at(SRC, 'C')).type, 'o');
}

// ── LF type-level infix (pragma on a type constructor) ───────────────────────
{
  const SRC = `LF o : type = | arr : o → o → type ;
--infix arr 2 right.
LF p : (A arr B) → type = ;
`;
  assert.equal(typeAt(SRC, at(SRC, 'A arr')).type, 'o');
  assert.equal(typeAt(SRC, infixB(SRC, 'A arr B')).type, 'o');
}

// ── computation-level infix ────────────────────────────────────────────────
{
  const SRC = `o : type.
t : type.
app : o -> o -> o.
--infix app 1 none.
rec r : t = A app B ;
`;
  assert.equal(typeAt(SRC, at(SRC, 'A app')).type, 'o');
  assert.equal(typeAt(SRC, infixB(SRC, 'A app B')).type, 'o');
}

// ── prefix + infix mix: Y is the right operand of infix app ────────────────
{
  const SRC = `o : type.
t : type.
app : o -> o -> o.
--infix app 1 none.
f : (o -> o) -> t.
rec r : t = f x app Y ;
`;
  assert.equal(typeAt(SRC, at(SRC, 'Y')).type, 'o');
}

// ── cross-file: --infix pragma in an earlier project file ──────────────────
{
  const F1 = `LF o : type = | ⊃ : o → o → o ;
--infix ⊃ 5 right.
`;
  const F2 = `LF p : o → type = | mk : p (A ⊃ B) ;
`;
  const files = {
    list: [
      { id: 'a', name: 'nd/o.bel' },
      { id: 'b', name: 'nd/p.bel' },
      { id: 'c', name: 'nd/t.cfg' },
    ],
    tx: { a: F1, b: F2, c: 'o.bel\np.bel\n' },
    activeCfg: { nd: 'nd/t.cfg' },
  };
  const b = typeAt(F2, infixB(F2, 'A ⊃ B'), files, 'b');
  assert.equal(b.type, 'o', 'infix operand typed via pragma from prelude file');
}

// ── without pragma: no fabricated infix typing ─────────────────────────────
{
  const SRC = `LF o : type = | ⊃ : o → o → o ;
LF p : o → type = | mk : p (A ⊃ B) ;
`;
  const a = typeAt(SRC, at(SRC, 'A ⊃'));
  assert.equal(a.kind, 'implicit');
  assert.equal(a.type, null, 'no --infix → no infix reinterpretation');
}

console.log('OK infix operand typing (LF term/type, comp, chains, mix, cross-file, no pragma)');
