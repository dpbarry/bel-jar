// Implicit binders (reconstruction-introduced free variables) DO have types.
// The instant source tier types them from the slot they fill under an
// application head. Two reach extensions are covered here:
//   1. the head may be defined in an EARLIER project file (cross-file signature)
//   2. an untypeable occurrence (e.g. a metavar used as an application head)
//      borrows the type from a sibling occurrence in a typed slot.
import assert from 'node:assert';
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { resolveHoverDoc } from '../editor-src/bel-resolve.mjs';

const at = (src, needle, occ = 1) => {
  let i = -1;
  for (let k = 0; k < occ; k++) i = src.indexOf(needle, i + 1);
  return i;
};
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

// ── in-file: implicit binder typed by its argument slot ──────────────────────
{
  const SRC = `LF tp : type = ;
LF dual : tp -> tp -> type =
  | d : dual A A'
;`;
  const a = typeAt(SRC, at(SRC, 'A A') + 0);
  assert.equal(a.kind, 'implicit', 'A is a reconstruction implicit');
  assert.equal(a.type, 'tp', 'A typed from dual\'s first domain');
  const a2 = typeAt(SRC, at(SRC, "A'"));
  assert.equal(a2.type, 'tp', "A' typed from dual's second domain");
}

// ── cross-file: head signature comes from an earlier project file ────────────
{
  const F1 = `LF tp : type = ;
LF dual : tp -> tp -> type = ;`;
  const F2 = `LF d2 : type =
  | foo : dual A A' -> d2
;`;
  const files = {
    list: [
      { id: 'a', name: 'p/a.bel' },
      { id: 'b', name: 'p/b.bel' },
      { id: 'c', name: 'p/t.cfg' },
    ],
    tx: { a: F1, b: F2, c: 'a.bel\nb.bel\n' },
    activeCfg: { p: 'p/t.cfg' },
  };
  const a = typeAt(F2, at(F2, 'A A'), files, 'b');
  assert.equal(a.kind, 'implicit');
  assert.equal(a.type, 'tp', 'implicit binder typed via a cross-file head signature (dual in a.bel)');
}

// ── sibling sharing: an untypeable occurrence borrows from a typed one ────────
{
  // `pcomp` is a constant taking an `(nm -> proc)`; P sits in pcomp's typed slot
  // AND as the bare head of `(P Y)` — the latter has no local type, so it
  // borrows from the former (same reconstruction binder).
  const SRC = `nm : type.
proc : type.
pcomp : (nm -> proc) -> proc.
LF red : proc -> type =
  | r : red (pcomp P) -> red (P Y)
;`;
  const slot = typeAt(SRC, at(SRC, 'pcomp P') + 6); // P in pcomp P (typed slot)
  assert.equal(slot.type, '(nm -> proc)', 'P typed directly from pcomp\'s domain');

  const head = typeAt(SRC, at(SRC, '(P Y)') + 1); // P as application head
  assert.equal(head.kind, 'implicit');
  assert.equal(head.type, '(nm -> proc)',
    'P at head position borrows its type from the sibling pcomp occurrence');
}

// ── soundness: no typed sibling → no fabricated type ─────────────────────────
{
  // Q appears only at head position (`Q Z`), with nothing to borrow from.
  const SRC = `proc : type.
LF red : proc -> type =
  | r : red (Q Z)
;`;
  const q = typeAt(SRC, at(SRC, '(Q Z)') + 1);
  assert.equal(q.kind, 'implicit');
  assert.equal(q.type, null, 'no typed sibling occurrence → no fabricated type');
}

// ── nested arg: inner application head wins over the outer one ────────────────
{
  // `wf (lin P)` — P belongs to `lin`'s domain, NOT `wf`'s. The nearest enclosing
  // application (term-level `lin P`) must win over the outer type app `wf (…)`.
  const SRC = `nm : type.
proc : type.
lin : (nm -> proc) -> type.
wf : type -> type.
LF holds : type =
  | h : wf (lin P) -> holds
;`;
  const p = typeAt(SRC, at(SRC, 'lin P') + 4);
  assert.equal(p.type, '(nm -> proc)',
    'nested implicit typed by the inner head (lin), not the outer (wf)');
}

// ── mutual LF block: every head is a type family, not an implicit binder ──────
{
  // The grammar flattens `LF n … and a … and p …` into one
  // LFDatatypeDeclaration. The heads after the first (`a`, `p`) must classify as
  // LF type families — NOT reconstruction implicit binders.
  const SRC = `LF n : type =
  | b : n
  | x : n

  and a : type =
  | tau : a
  | dn  : n -> n -> a

  and p : type =
  | null : p
  | bang : p -> p
;`;
  const first = typeAt(SRC, at(SRC, 'n : type'));
  assert.equal(first.kind, 'global');
  assert.equal(first.label, 'LF Type Family', 'first mutual head is a type family');

  const a = typeAt(SRC, at(SRC, 'a : type'));
  assert.equal(a.kind, 'global', 'mutual head `a` is global, not implicit');
  assert.equal(a.label, 'LF Type Family', '`a` labelled as LF Type Family');
  assert.equal(a.type, 'type', '`a` shows its own kind');

  const p = typeAt(SRC, at(SRC, 'p : type'));
  assert.equal(p.kind, 'global', 'mutual head `p` is global, not implicit');
  assert.equal(p.label, 'LF Type Family', '`p` labelled as LF Type Family');

  // …and REFERENCES to the mutual heads from inside the block resolve to the
  // type family too — not the implicit-binder guess.
  const aUse = typeAt(SRC, at(SRC, ': a') + 2); // the `a` in `tau : a` return type
  assert.equal(aUse.kind, 'global', 'use of `a` resolves to the type family');
  assert.equal(aUse.label, 'LF Type Family', 'use of `a` labelled LF Type Family');

  const pUse = typeAt(SRC, at(SRC, ': p') + 2); // the `p` in `null : p` return type
  assert.equal(pUse.kind, 'global', 'use of `p` resolves to the type family');
  assert.equal(pUse.label, 'LF Type Family', 'use of `p` labelled LF Type Family');
}

// ── contextual judgment pattern: implicit typed under l_pcomp2 ───────────────
{
  const F1 = `l_pcomp2: ({x:name}linear (\\z. Q x z))
        → linear (\\z. pcomp A P (\\x. Q x z)).`;
  const F2 = `rec lin_s≡ : T =
fn lP => case lP of
| [g |- l_pcomp2 (\\y. linR)] =>
  [g |- l_pcomp2 (\\x. l_pcomp2 (\\y. linR[..,y]))]
;`;
  const files = {
    list: [
      { id: 'linear', name: 'p/cp_linear.bel' },
      { id: 'thrm', name: 'p/cp_thrm.bel' },
      { id: 'cfg', name: 'p/cp.cfg' },
    ],
    tx: { linear: F1, thrm: F2, cfg: 'cp_linear.bel\ncp_thrm.bel\n' },
    activeCfg: { p: 'p/cp.cfg' },
  };
  const r = typeAt(F2, at(F2, 'linR'), files, 'thrm');
  assert.equal(r.kind, 'implicit');
  assert.equal(r.type, '{x:name}linear (\\z. Q x z)',
    'linR in a contextual pattern is typed from l_pcomp2\'s domain (classical-processes case)');
}

console.log('OK implicit binder typing (arg slot, cross-file head, sibling sharing, no fabrication, mutual LF heads, contextual pattern)');
