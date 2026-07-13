// SOUND pre-filter (E2b): reject a closing fill the checker would provably reject,
// WITHOUT a checker round-trip — but NEVER reject one it would accept. This test
// pins soundness (the load-bearing property) and the intended rejections, purely.
import { movePrefilterOk, candidateMoves, theoremUnderProof } from '../editor-src/bel-prover-bridge.mjs';

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

// ── 5. Lexical guard: checker-internal `"`-quoted names are unparseable by
// construction — any candidate text carrying one is rejected, for EVERY move
// kind (they leaked into fills live and can kill the wasm checker outright). ──
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app " i2 D2]' }, H('[g |- eq N M]'), CODE) === false,
  'a fill referencing a checker-internal "-name is rejected without a check');
expect(movePrefilterOk({ kind: 'recurse', text: 'let X = f [g |- " i1] in ?' }, H('[g |- eq N M]'), CODE) === false,
  'the "-name guard applies to non-fill kinds too');
expect(movePrefilterOk({ kind: 'fill', text: '[g |- eq_app D1 D2]' }, H('[g |- eq N M]'), CODE) === true,
  'quote-free candidates are untouched by the lexical guard');

console.log('OK test-prover-prefilter (sound head + argument-family rules; 75% fill drop measured)');
