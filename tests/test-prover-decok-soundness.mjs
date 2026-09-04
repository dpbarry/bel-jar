// SOUNDNESS PINS for `decSubderivNames` — the decOk structural gate.
// Every shape here is INVENTED (never a corpus lemma name), per the no-overfit law.
//
// WHY THIS FILE EXISTS (master plan entry 54, 2026-08-16). The author-faithful
// untotalied-recursion policy lets the engine emit recursive calls for theorems whose
// author wrote no `/ total /`. For those, **Beluga is NOT the guard** — it accepts
// untotalied recursive functions, including circular ones (`fn x => f x`). The SOLE
// guard is decOk: the IH's decreasing slot admits only *case components* of the
// destructured binder. A hole in decOk therefore yields proofs the checker ACCEPTS
// that are circular — false theorems recorded as COMPLETE, which is strictly worse
// than any missed proof.
//
// The existing prover tests feed `decOk` in as INPUT to synthesis; none of them check
// that decSubderivNames DERIVES it correctly from source. These do.
import { decSubderivNames, decreasingBinderNameAt, circularSelfCalls } from '../js/editor-src/prover/prover-hyp.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}
// The hole is located by line; holeByteOffsetBridge finds the `?` on that line.
const holeAt = (code, needle) => {
  const lines = code.split('\n');
  const i = lines.findIndex((l) => l.includes(needle) && l.includes('?'));
  expect(i >= 0, `fixture has no hole line matching ${needle}`);
  return { line: i + 1, col: lines[i].indexOf('?') + 1 };
};

// ── S1: THE DECREASING BINDER IS NEVER ITS OWN SUB-DERIVATION ───────────────
// This is the pin that stops `fn d => thm d` — the circular proof Beluga would
// happily accept for an untotalied theorem.
{
  const code = [
    'rec selfCirc : [ |- aa X] -> [ |- bb X] =',
    'fn d =>',
    '  ?',
    ';',
  ].join('\n');
  const dec = decSubderivNames(code, holeAt(code, '?'), 0);
  expect(decreasingBinderNameAt(code, holeAt(code, '?'), 0) === 'd', 'binder at index 0 is d');
  expect(!dec.has('d'), 'S1: the decreasing binder itself must NOT be decOk (circularity)');
  expect(dec.size === 0, `S1: nothing is decOk before any split, got [${[...dec]}]`);
}

// ── S2: GENUINE CASE COMPONENTS ARE decOk, TRANSITIVELY ─────────────────────
{
  const code = [
    'rec compOk : [ |- cc X] -> [ |- dd X] =',
    'fn d =>',
    'case d of',
    '| [ |- c1 P1 P2] =>',
    '  case P1 of',
    '  | [ |- c2 Q1] =>',
    '    ?',
    ';',
  ].join('\n');
  const dec = decSubderivNames(code, holeAt(code, '?'), 0);
  expect(dec.has('P1') && dec.has('P2'), `S2: direct components decOk, got [${[...dec]}]`);
  expect(dec.has('Q1'), `S2: TRANSITIVE component of a component is decOk, got [${[...dec]}]`);
  expect(!dec.has('d'), 'S2: binder still excluded after splitting');
}

// ── S3: LET-INVERSION COMPONENTS ARE decOk ──────────────────────────────────
// `let [ |- ctor S] = d in` is a one-branch case; Beluga's totality checker accepts
// a recursive call on S. Missing this costs candidates (never soundness), but it is
// the documented reason the fixpoint walks lets as well as cases.
{
  const code = [
    'rec letOk : [ |- ee X] -> [ |- ff X] =',
    'fn d =>',
    'let [ |- e1 S1] = d in',
    '  ?',
    ';',
  ].join('\n');
  const dec = decSubderivNames(code, holeAt(code, '?'), 0);
  expect(dec.has('S1'), `S3: let-inversion component is decOk, got [${[...dec]}]`);
  expect(!dec.has('d'), 'S3: binder excluded');
}

// ── S4: A SIBLING ARM'S VARIABLES DO NOT LEAK ───────────────────────────────
// Only the arm on the hole's own path may contribute; a closed sibling's pattern
// variables are out of scope and admitting them would be both unsound and unwritable.
{
  const code = [
    'rec sibling : [ |- gg X] -> [ |- hh X] =',
    'fn d =>',
    'case d of',
    '| [ |- g1 SIBV] => ?',
    '| [ |- g2 MINE] =>',
    '  ?',
    ';',
  ].join('\n');
  const lines = code.split('\n');
  const hole = { line: 6, col: (lines[5] || '').indexOf('?') + 1 };
  const dec = decSubderivNames(code, hole, 0);
  expect(dec.has('MINE'), `S4: own arm's component is decOk, got [${[...dec]}]`);
  expect(!dec.has('SIBV'), `S4: a SIBLING arm's variable must NOT be decOk, got [${[...dec]}]`);
}

// ── S5: A TYPE ASCRIPTION ON AN ARM MUST NOT DONATE decOk NAMES ─────────────
// The fixpoint adds every upper-case identifier occurring in the matched arm. An arm
// may carry an ascription (`| [ |- k1 D1] : [ |- kk (app IDXA IDXB)] =>`) whose index
// variables are LF TERMS, not sub-derivations. Admitting those would let the IH be
// applied to something that is not structurally smaller. They are usually ill-typed in
// the decreasing slot and the checker rejects them — but for an UNTOTALIED theorem the
// checker is not the termination guard, so this must hold on its own.
{
  const code = [
    'rec ascribe : [ |- kk X] -> [ |- ll X] =',
    'fn d =>',
    'case d of',
    '| [ |- k1 D1] : [ |- kk (app IDXA IDXB)] =>',
    '  ?',
    ';',
  ].join('\n');
  const dec = decSubderivNames(code, holeAt(code, '?'), 0);
  expect(dec.has('D1'), `S5: the real pattern component is decOk, got [${[...dec]}]`);
  const leaked = ['IDXA', 'IDXB'].filter((v) => dec.has(v));
  expect(leaked.length === 0,
    `S5: ascription index variables must NOT be decOk — leaked [${leaked}] (got [${[...dec]}]). `
    + 'For an untotalied theorem decOk is the ONLY termination guard, so a leak here is a '
    + 'soundness hole, not a spelling nuisance.');
}

// ── circularSelfCalls: the certification-time guard (entry 55b) ─────────────
// Each of C3–C5 is a bug this check actually shipped with; all three were caught by
// the differential, not by review.
{
  const thmOf = (name) => ({ name });

  // C1: a self-call with no descending argument IS circular.
  const c1 = [
    'rec circ : [ |- aa X] -> [ |- bb X] =',
    'fn d =>',
    '  circ d',
    ';',
  ].join('\n');
  expect(circularSelfCalls(c1, thmOf('circ'), 0).length === 1,
    'C1: `fn d => circ d` must be flagged circular');

  // C2: recursion on a genuine case component is LEGAL, even though the call also
  // passes the binder — the `f x y'` idiom must survive.
  const c2 = [
    'rec good : [ |- cc X] -> [ |- dd X] =',
    'fn d =>',
    'case d of',
    '| [ |- c1 P1] =>',
    '  good P1',
    ';',
  ].join('\n');
  expect(circularSelfCalls(c2, thmOf('good'), 0).length === 0,
    `C2: recursion on a case component must NOT be flagged, got ${JSON.stringify(circularSelfCalls(c2, thmOf('good'), 0))}`);

  // C3: a proof with NO self-call at all (the identity) must not be flagged.
  // Shipped bug: the scan ran over the whole program, so other declarations
  // mentioning the name matched — this refused `rec eval : … = fn X => X`.
  const c3 = [
    'LF ev : type =',
    '| ev/z : ev',
    ';',
    'rec helper : [ |- p] -> [ |- q] =',
    'fn y => idfn y',
    ';',
    'rec idfn : [ |- ee X] -> [ |- ee X] =',
    'fn X => X',
    ';',
  ].join('\n');
  expect(circularSelfCalls(c3, thmOf('idfn'), 0).length === 0,
    `C3: identity proof must NOT be flagged (decl-local scan), got ${JSON.stringify(circularSelfCalls(c3, thmOf('idfn'), 0))}`);

  // C4: a SIBLING declaration calling the theorem is not a self-call of it.
  expect(circularSelfCalls(c3, thmOf('helper'), 0).length === 0,
    'C4: a sibling decl mentioning another theorem must not flag that theorem');

  // C5: a name containing `'` must not throw. Shipped bug: `'` was escaped as `\\'`,
  // which is an INVALID escape under the `u` flag, so RegExp threw and the target
  // came back HARNESS-ERROR on the differential (`mstep'`).
  const c5 = [
    "rec mstep' : [ |- ff X] -> [ |- gg X] =",
    'fn d =>',
    'case d of',
    '| [ |- f1 P1] =>',
    "  mstep' P1",
    ';',
  ].join('\n');
  let threw = null;
  try { circularSelfCalls(c5, thmOf("mstep'"), 0); } catch (e) { threw = String(e && e.message); }
  expect(!threw, `C5: a theorem name with an apostrophe must not throw, got: ${threw}`);
}

console.log('OK test-prover-decok-soundness (binder excluded, transitive components, let-inversion, sibling isolation, ascription leak, circular-self-call guard)');
