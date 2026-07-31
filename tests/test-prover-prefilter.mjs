// SOUND pre-filter (E2b): reject a closing fill the checker would provably reject,
// WITHOUT a checker round-trip — but NEVER reject one it would accept. This test
// pins soundness (the load-bearing property) and the intended rejections, purely.
import { movePrefilterOk, candidateMoves, theoremUnderProof } from '../js/editor-src/prover/prover-orchestrator.mjs';
import { ctorSubstIndexConflict, enumerateConstructorsTyped } from '../js/editor-src/prover/hole-split.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const CODE = [
  'exp: type.',
  'app: exp -> exp -> exp.',
  'lam: (exp -> exp) -> exp.',
  'eq: exp -> exp -> type.',
  'eq_app : eq E1 F1 -> eq E2 F2 -> eq (app E1 E2) (app F1 F2).',
  'eq_lam : ({x:exp} eq x x -> eq (E x) (F x)) -> eq (lam (\\x. E x)) (lam (\\x. F x)).',
  'nat : type.',
  'z : nat.',
  's : nat -> nat.',
].join('\n');

const H = (goal, ctx = [], meta = []) => ({ goal, ctx, meta, line: 1, col: 1 });

// ── 1. REJECT: a closing fill whose ctor head builds a DIFFERENT family ───────
// `[ |- z]` (a `nat` ctor) can never inhabit an `eq` goal — rigid mismatch.
expect(movePrefilterOk({ kind: 'fill', text: '[ |- z]' }, H('[ |- eq A B]'), CODE) === false,
  'a nat-ctor fill is rejected against an eq goal');
expect(movePrefilterOk({ kind: 'fill', text: '[ |- s X]' }, H('[ |- eq A B]'), CODE) === false,
  'a nat-ctor application is rejected against an eq goal');

// ── 2. PASS (soundness): a fill whose ctor head DOES build the goal family ────
expect(movePrefilterOk({ kind: 'fill', text: '[ |- eq_app D1 D2]' }, H('[ |- eq (app A B) (app C D)]'), CODE) === true,
  'an eq-ctor fill passes against an eq goal (never wrongly rejected)');
expect(movePrefilterOk({ kind: 'fill', text: '[ |- eq_lam (\\x. \\u. E)]' }, H('[ |- eq (lam A) (lam B)]'), CODE) === true,
  'an eq_lam fill passes against an eq goal');

// ── 3. PASS (soundness): everything the filter CANNOT judge soundly ───────────
// metavar/variable head, projection, open fill, non-fill kinds, non-boxed goal.
expect(movePrefilterOk({ kind: 'fill', text: '[ |- D]' }, H('[ |- eq A B]'), CODE) === true,
  'a metavar-headed fill passes (not a declared ctor — cannot judge)');
expect(movePrefilterOk({ kind: 'fill', text: '[ |- #p.h[..]]' }, H('[ |- eq A B]'), CODE) === true,
  'a parameter projection passes');
expect(movePrefilterOk({ kind: 'fill', text: '[ |- eq_app ? ?]' }, H('[ |- eq A B]'), CODE) === true,
  'an OPEN fill (has ?) passes — not a closing inhabitant');
expect(movePrefilterOk({ kind: 'recurse', text: 'let [ |- R] = f [ |- X] in\n?' }, H('[ |- eq A B]'), CODE) === true,
  'a recurse move passes (only closing fills are judged)');
expect(movePrefilterOk({ kind: 'split', text: 'case x of ...' }, H('[ |- eq A B]'), CODE) === true,
  'a split passes');
expect(movePrefilterOk({ kind: 'impossible', text: 'impossible h' }, H('[ |- eq A B]'), CODE) === true,
  'an impossible move passes');

// ── 3b. ARGUMENT-FAMILY rule: reject a ctor fill passing a hyp of the WRONG
// family into a rigid arg slot (`eq_app d M1` where d : eval …) — no checker. ──
const EVCODE = [
  CODE,
  'eval : exp -> exp -> type.',
  'ev0 : eval M M.',
].join('\n');
const evHole = H('[g |- eq A B]', [
  { name: 'd', type: '[g |- eval M R]' },  // wrong family for an eq_app arg
  { name: 'q', type: '[g |- eq M R]' },    // right family
]);
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app d q]' }, evHole, EVCODE) === false,
  'eq_app with an eval-typed arg where eq is required is rejected');
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app q q]' }, evHole, EVCODE) === true,
  'eq_app with both args eq-typed passes (soundness)');
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app d M1]' },
  H('[g |- eq A B]', [{ name: 'd', type: '[g |- eval M R]' }], [{ name: 'M1', type: '(g |- exp)' }]), EVCODE) === false,
  'eq_app d M1 (d : eval) is rejected — the bigstep_det over-generation');
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app U V]' },
  H('[g |- eq A B]'), EVCODE) === true,
  'eq_app with unknown-typed args passes (cannot judge → sound)');

// ── 3c. Pi-BINDER alignment soundness: `argTypes` drops explicit `{Pi}` binders
// but the TERM includes their instances — a Pi-typed ctor must NEVER be judged
// (the instance would be positionally matched against the wrong declared slot). ──
const PICODE = [
  EVCODE,
  'wit : type.',
  // pw : {x:exp} eq x x -> eq x x -> wit.  — term `pw M D1 D2`; without the guard,
  // M (an exp-typed hyp) would be judged against an `eq` slot and wrongly rejected.
  'pw : {x:exp} eq x x -> eq x x -> wit.',
].join('\n');
const piHole = H('[g |- wit]', [
  { name: 'M', type: '(g |- exp)' },
  { name: 'D1', type: '[g |- eq A A]' },
  { name: 'D2', type: '[g |- eq B B]' },
]);
expect(movePrefilterOk({ kind: 'fill', text: '[g |- pw M D1 D2]' }, piHole, PICODE) === true,
  'a Pi-binder ctor fill is never judged (alignment shifts — must pass)');
// Exact-arity guard: with a SAME-family goal (head rule passes), an arity
// mismatch means the args can't be aligned — not judged, passes through.
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app M]' },
  H('[g |- eq A B]', [{ name: 'M', type: '(g |- exp)' }]), PICODE) === true,
  'arity mismatch (partial application) is not arg-judged');
// And the no-Pi rejection still fires alongside a Pi ctor in the same file.
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app M D1]' },
  H('[g |- eq A B]', [{ name: 'M', type: '(g |- exp)' }, { name: 'D1', type: '[g |- eq A A]' }]), PICODE) === false,
  'no-Pi ctor with a wrong-family bare arg is still rejected (yield preserved)');

// ── 4. SOUNDNESS: the filter must never reject a WELL-TYPED closing fill. We test
// this directly (not by trusting candidateMoves, which over-generates junk like
// `eq_app d g` where g is a context var — the filter is RIGHT to drop that). A
// well-typed `eq_app D1 D2` over eq-typed hyps must always survive. ──
const soundHole = H('[g |- eq N M]', [
  { name: 'D1', type: '[g |- eq A B]' },
  { name: 'D2', type: '[g |- eq C D]' },
], [{ name: 'g', type: 'ctx' }]);
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app D1 D2]' }, soundHole, CODE) === true,
  'a well-typed eq_app over eq-hyps is never rejected (soundness)');
// And a fill with only metavar args (family unknown to us) always survives.
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app Q1 Q2]' }, H('[g |- eq N M]'), CODE) === true,
  'metavar-arg fill always survives (soundness)');
// The junk candidateMoves emits (ctx var into an eq slot) SHOULD be dropped — bonus.
const thm = theoremUnderProof("rec eq_sym : (g:ctx) [g |- eq M N] -> [g |- eq N M] =\n/ total 1 /\nfn d => ?\n;");
const full = `${CODE}\nschema ctx = block x:exp, _t:eq x x;`;
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app d g]' },
  H('[g |- eq N M]', [{ name: 'd', type: '[g |- eq M N]' }], [{ name: 'g', type: 'ctx' }]), full) === false,
  'a ctx-var passed into an eq arg slot is soundly dropped (bonus rejection)');
void thm;

// ── 4b. trustScope SCOPE check (live move loop only, real+complete hole.meta):
// an UPPERCASE arg that is neither a bound metavar/comp-var NOR a declared ctor
// is unbound → rejected. Pure callers (default) must NOT apply it. ──
const scopeCode = `${CODE}\nschema ctx = block x:exp, _t:eq x x;`;
// (a) unbound uppercase arg — rejected ONLY under trustScope.
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app X3 X3]' },
  H('[g |- eq N M]', [], [{ name: 'g', type: 'ctx' }]), scopeCode) === true,
  'pure caller (no trustScope) never rejects on scope — eq_app X3 X3 passes');
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app X3 X3]' },
  H('[g |- eq N M]', [], [{ name: 'g', type: 'ctx' }]), scopeCode, { trustScope: true }) === false,
  'trustScope rejects an unbound uppercase arg (eq_app X3 X3, X3 not in scope)');
// (b) uppercase arg that IS in scope (meta or ctx) — must PASS under trustScope.
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app D1 D2]' },
  H('[g |- eq N M]', [{ name: 'D1', type: '[g |- eq A B]' }, { name: 'D2', type: '[g |- eq C D]' }],
    [{ name: 'g', type: 'ctx' }]), scopeCode, { trustScope: true }) === true,
  'trustScope passes uppercase args bound as comp-vars (soundness — no false prune)');
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app M1 M2]' },
  H('[g |- eq N M]', [], [{ name: 'g', type: 'ctx' }, { name: 'M1', type: '[g |- eq A B]' }, { name: 'M2', type: '[g |- eq C D]' }]),
  scopeCode, { trustScope: true }) === true,
  'trustScope passes uppercase args bound as metavars (soundness)');

// ── 5. Lexical guard: checker-internal `"`-quoted names are unparseable by
// construction — any candidate text carrying one is rejected, for EVERY move
// kind (they leaked into fills live and can kill the wasm checker outright). ──
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app " i2 D2]' }, H('[g |- eq N M]'), CODE) === false,
  'a fill referencing a checker-internal "-name is rejected without a check');
expect(movePrefilterOk({ kind: 'recurse', text: 'let X = f [g |- " i1] in ?' }, H('[g |- eq N M]'), CODE) === false,
  'the "-name guard applies to non-fill kinds too');
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app D1 D2]' }, H('[g |- eq N M]'), CODE) === true,
  'quote-free candidates are untouched by the lexical guard');

// ── 6. Lexical guard #2: a PARAMETER (`#p`) or SUBSTITUTION (`$S`) variable is a
// META object. Cited bare in a computation-level argument slot it is a PARSE
// error, never a type error, so such a candidate can never certify (measured:
// 171 wasted checks across 26 targets, `Ae_a X #p`-shaped). The guard must reject
// exactly those, and must NOT touch the many legal bare-looking positions:
// inside a box, a projection, an `mlam` binder list, or a `{#p : …}` binder. ──
const G = H('[g |- eq N M]', [], [{ name: 'g', type: 'ctx' }]);
for (const [text, reject] of [
  ['Ae_a X #p', true],           // the measured shape
  ['Ae_a #p #p', true],
  ['lemma #p', true],
  ['f $S', true],
  ['[g |- #p]', false],          // boxed — legal
  ['[g |- #p.1]', false],        // projection inside a box — legal
  ['mlam g, #p => ?', false],    // binder list — legal
  ['mlam #p => let [g |- #q] = e in ?', false],
  ['let [g |- #p.2] = e in [g |- H]', false],
  ['{#p : #[g |- tm A[]]} foo', false],
  ['case [g |- #p] of | [g |- x] => ?', false],
  ['[g |- M[$S]]', false],       // substitution APPLIED inside a box — legal
  ['trans [g] e1 e2', false],    // no meta objects at all
]) {
  expect(movePrefilterOk({ kind: 'lemma', text }, G, CODE) === !reject,
    `bare-meta-object guard: ${JSON.stringify(text)} must ${reject ? 'REJECT' : 'PASS'}`);
}

// ── 7. Lexical guard #3: the SIBLING of #2 for ORDINARY meta names. A context
// variable (`g`, `h`) or an LF metavariable (`M`, `A`) is a META object exactly
// like `#p`/`$S`: cited BARE in a computation-level argument slot the checker
// refuses it outright ("Expected h to be a program constant or constructor" —
// measured at ~220 across the no-move residue's deepest holes, 2026-07-29).
// It must reject those and leave every legal position alone, and it must FAIL
// OPEN when the hole carries no meta context (synthetic holes, pre-report probes). ──
const M3 = H('[g |- eq N M]',
  [{ name: 'd', type: '[g |- eq N M]' }],                    // comp context
  [{ name: 'g', type: 'ctx' }, { name: 'M', type: '(g |- tm)' }]); // meta context
for (const [text, reject] of [
  ['ExWkV/c g', true],                 // context variable bare at comp level
  ['ExWkV/c M', true],                 // LF metavariable bare at comp level
  ['lemma d g', true],                 // mixed: legal comp var, illegal meta
  ['[g |- M]', false],                 // boxed — legal
  ['[g |- eq_app M M]', false],        // inside a box — legal
  ['lemma d', false],                  // comp variable only — legal
  ['lemma [g |- M] d', false],         // boxed argument — legal
  ['mlam g, M => ?', false],           // binder list — legal
  ['let M = f d in ?', false],         // binding occurrence — legal
  ['{M : [g |- tm]} foo', false],      // Pi binder — legal
  ['case d of | [g |- eq_r] => ?', false],
]) {
  expect(movePrefilterOk({ kind: 'lemma', text }, M3, CODE) === !reject,
    `bare-meta-NAME guard: ${JSON.stringify(text)} must ${reject ? 'REJECT' : 'PASS'}`);
}
// Fails OPEN with no meta context, and never judges binding-occurrence kinds.
expect(movePrefilterOk({ kind: 'lemma', text: 'ExWkV/c g' }, H('[g |- eq N M]'), CODE) === true,
  'bare-meta-NAME guard fails open when the hole has no meta context');
expect(movePrefilterOk({ kind: 'split', text: 'case [g |- M] of | [g, x:tm |- x] => ?' }, M3, CODE) === true,
  'bare-meta-NAME guard never judges a split (arm patterns are binding occurrences)');

// ── 8. Rules (1b)/(2d): INDEX-level checks. (1b) compares the ctor's result index
// HEADS with the goal's; (2d) first binds the ctor's pattern variables from the
// ARGUMENTS' real types. Both may verdict ONLY on rigid-vs-rigid heads. Over-strictness
// is the known failure mode of index unification here (the split-side unifier is on
// record as having dropped legitimate arms), so the PASS cases matter more than the
// rejects. ──
const IDXCODE = [
  'exp: type.',
  'app: exp -> exp -> exp.',
  'unit: exp.',
  'eq: exp -> exp -> type.',
  'eq_app : eq E1 F1 -> eq E2 F2 -> eq (app E1 E2) (app F1 F2).',
  'eq_u : eq unit unit.',
].join(String.fromCharCode(10));
// (a) rigid head clash between ctor result index and goal index → provably dead.
expect(movePrefilterOk({ kind: 'fill', text: '[ |- eq_u]' },
  H('[ |- eq (app X Y) (app Z W)]'), IDXCODE) === false,
  'rule 1b: eq_u results in `eq unit unit`; goal indices are `app …` — rigid clash, reject');
// (b) the SAME ctor against a goal it can inhabit must PASS.
expect(movePrefilterOk({ kind: 'fill', text: '[ |- eq_u]' },
  H('[ |- eq unit unit]'), IDXCODE) === true,
  'rule 1b: eq_u against `eq unit unit` must PASS');
// (c) flexible goal indices — no judgement possible, must PASS.
expect(movePrefilterOk({ kind: 'fill', text: '[ |- eq_u]' },
  H('[ |- eq A B]'), IDXCODE) === true,
  'rule 1b: flexible goal indices must PASS (no rigid clash)');
// (d) pattern-headed ctor result vs concrete goal — flexible, must PASS.
expect(movePrefilterOk({ kind: 'fill', text: '[ |- eq_app D1 D2]' },
  H('[ |- eq (app P Q) (app R S)]',
    [{ name: 'D1', type: '[ |- eq P R]' }, { name: 'D2', type: '[ |- eq Q S]' }]),
  IDXCODE) === true,
  'rule 2d: a well-typed eq_app must PASS after θ (no false prune)');
// (d2) θ-ACCUMULATING check, pinned DIRECTLY (it is exported scaffolding, not wired
// into movePrefilterOk — on the corpus it moved the check count by exactly zero, see
// the note at its former call site). `eq_app`'s arguments force `app`-headed result
// indices while the goal is `unit`: a rigid clash visible ONLY after substitution.
{
  const eqCtors = enumerateConstructorsTyped(IDXCODE, 'eq');
  const eqApp = eqCtors.find((c) => c.name === 'eq_app');
  expect(!!eqApp, 'θ pin fixture: eq_app must enumerate');
  expect(ctorSubstIndexConflict(IDXCODE, eqApp,
    ['[ |- eq P R]', '[ |- eq Q S]'], ['unit', 'unit']) === true,
    'ctorSubstIndexConflict: eq_app cannot inhabit `eq unit unit` — θ exposes the clash');
  expect(ctorSubstIndexConflict(IDXCODE, eqApp,
    ['[ |- eq P R]', '[ |- eq Q S]'], ['(app P Q)', '(app R S)']) === false,
    'ctorSubstIndexConflict: the well-typed eq_app must PASS (no false prune)');
  expect(ctorSubstIndexConflict(IDXCODE, eqApp,
    [null, null], ['unit', 'unit']) === false,
    'ctorSubstIndexConflict: unknown argument types → θ empty → no judgement');
}
// (e) unknown-typed arguments — θ learns nothing, must PASS.
expect(movePrefilterOk({ kind: 'fill', text: '[ |- eq_app D1 D2]' },
  H('[ |- eq (app P Q) (app R S)]'), IDXCODE) === true,
  'rule 2d: unknown argument types must PASS (θ empty → no judgement)');

console.log('OK test-prover-prefilter (sound head + argument-family rules; 75% fill drop measured)');
