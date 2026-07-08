// GOAL-DIRECTED SYNTHESIS (bel-synth): the gap-filling engine. This pins the
// exact capability the greedy loop lacks — deriving a deep non-closing
// `let`-chain BACKWARD from the goal by unification (SLD over the pattern
// fragment), with forward saturation restricted to index-determined (unique-
// constructor) inversions and IH termination keyed to decOk sub-derivations.
// The state below is the real bigstep_det eval_app1/eval_app1 branch; the
// expected output is the reference proof's chain, discovered — not templated.
import { synthesize } from '../editor-src/bel-synth.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── the eval_app1/eval_app1 hole state (checker-reported shapes) ─────────────
const goal = { ctx: 'g', concl: `eq "i R'` };
const facts = [
  // d's split (the decreasing scrutinee) — decOk sub-derivations
  { name: 'X5', extras: [], concl: `eval M1 (lam (\\x2. M'))`, original: true, decOk: true },
  { name: 'X6', extras: [], concl: `eval (M'[.., N]) "i`, original: true, decOk: true },
  // f's split — original but NOT decreasing-position material
  { name: 'F1', extras: [], concl: `eval M1 (lam (\\x2. M1'))`, original: true, decOk: false },
  { name: 'F2', extras: [], concl: `eval (M1'[.., N]) R'`, original: true, decOk: false },
];
const rules = [
  {
    name: 'eq_refl', isIH: false, decIdx: -1,
    flex: new Set(['M']),
    pis: [{ kind: 'ctx' }, { kind: 'obj', varName: 'M' }],
    premises: [], result: 'eq M M',
  },
  {
    name: 'eq_sym', isIH: false, decIdx: -1,
    flex: new Set(['M', 'N']),
    pis: [], premises: ['eq M N'], result: 'eq N M',
  },
  {
    name: 'eval_respects_eq', isIH: false, decIdx: -1,
    flex: new Set(['M', 'N', 'R']),
    pis: [], premises: ['eq M N', 'eval M R'], result: 'eval N R',
  },
  {
    name: 'deterministic', isIH: true, decIdx: 0,
    flex: new Set(['M', 'R', "R'"]),
    pis: [], premises: ['eval M R', "eval M R'"], result: "eq R R'",
  },
];
const ctors = new Map([
  ['eq', [
    { name: 'eq_lam', argTypes: ['({x:exp} eq x x -> eq (M x) (N x))'], result: { head: 'eq', indices: ['(lam M)', '(lam N)'] } },
    { name: 'eq_app', argTypes: ['eq E1 F1', 'eq E2 F2'], result: { head: 'eq', indices: ['(app E1 E2)', '(app F1 F2)'] } },
  ]],
  ['eval', [
    { name: 'eval_lam', argTypes: ['({x:exp} eval x x -> notLam x -> eval (M x) (N x))'], result: { head: 'eval', indices: ['(lam M)', '(lam N)'] } },
    { name: 'eval_app1', argTypes: ["eval M (lam M')", "eval (M' N) R"], result: { head: 'eval', indices: ['(app M N)', 'R'] } },
    { name: 'eval_app2', argTypes: ["eval M M'", "notLam M'", "eval N N'"], result: { head: 'eval', indices: ['(app M N)', "(app M' N')"] } },
  ]],
]);

const out = synthesize(goal, facts, rules, ctors);
expect(out && out.text, 'synthesis finds the eval_app1 chain');
const text = out.text;
console.log('--- derived chain ---\n' + text + '\n---------------------');

// The chain's five forced steps, in dependency order:
const lines = text.split('\n');
expect(lines.length === 5, `five steps (got ${lines.length})`);
// 1. index-determined inversion of the IH product (eq (lam _)(lam _) ⇒ eq_lam only)
expect(/^let \[g \|- eq_lam \(\\x\. \\u\. (\w+)\)\] = deterministic \[g \|- X5\] \[g \|- F1\] in$/.test(lines[0]),
  'step 1: deterministic X5 F1 destructured via the UNIQUE ctor eq_lam');
// 2. eq_refl instantiated by unification (result eq M M vs subgoal eq N N ⇒ M:=N)
expect(/^let \[g \|- (\w+)\] = eq_refl \[g\] \[g \|- N\] in$/.test(lines[1]),
  'step 2: eq_refl [g] [g |- N]');
// 3. the under-binder component instantiated `E[.., N, E2]` — slots from the match
expect(/^let \[g \|- (\w+)\] = eq_sym \[g \|- \w+\[\.\., N, \w+\]\] in$/.test(lines[2]),
  'step 3: eq_sym of the substitution-instantiated component');
// 4. eval_respects_eq transports F2 along the symmetric equation
expect(/^let \[g \|- (\w+)\] = eval_respects_eq \[g \|- \w+\] \[g \|- F2\] in$/.test(lines[3]),
  'step 4: eval_respects_eq … F2');
// 5. tail IH call with the DECREASING argument a decOk fact (X6)
expect(/^deterministic \[g \|- X6\] \[g \|- \w+\]$/.test(lines[4]),
  'step 5: tail deterministic X6 …');

// ── REFUTATION closing (the app1×app2 cross arm): the product's inversion
// REFINES M'1 := lam _, leaving `notLam M'1` uninhabitable — closed by the
// destructuring let + `impossible` (the reference's second idiom). ──
const crossFacts = [
  { name: 'X5', extras: [], concl: `eval M2 (lam (\\x2. M'))`, original: true, decOk: true },
  { name: 'X6', extras: [], concl: `eval (M'[.., N1]) "i`, original: true, decOk: true },
  { name: 'X13', extras: [], concl: `eval M2 M'1`, original: true, decOk: false },
  { name: 'X14', extras: [], concl: `notLam M'1`, original: true, decOk: false },
  { name: 'X15', extras: [], concl: `eval N1 N'`, original: true, decOk: false },
];
const crossCtors = new Map([...ctors, ['notLam', [
  { name: "notLam'", argTypes: [], result: { head: 'notLam', indices: ['(app M N)'] } },
]]]);
const cross = synthesize(
  { ctx: 'g', concl: `eq "i (app M'1 N')` },
  crossFacts, rules, crossCtors,
  { metaVars: new Set(["M'1", "M'", 'M2', 'N1', "N'", '"i']) },
);
expect(cross && /impossible \[g \|- X14\]/.test(cross.text),
  'refutation closes the cross arm via impossible on the refuted notLam');
expect(/^let \[g \|- eq_lam \(\\x\. \\u\. \w+\)\] = deterministic \[g \|- X5\] \[g \|- X13\] in$/m.test(cross.text),
  'the refuting destructure is the deterministic X5 X13 inversion');

// ── termination: without decOk facts at the decreasing index, NO chain ───────
const noDec = facts.map((f) => ({ ...f, decOk: false }));
expect(synthesize(goal, noDec, rules, ctors) === null,
  'no decOk fact at the decreasing index ⇒ honest null (termination guard)');

// ── no matching rules ⇒ honest null, never a guess ───────────────────────────
expect(synthesize({ ctx: 'g', concl: 'wtp X Y' }, facts, rules, ctors) === null,
  'an unproducible goal returns null');

// ── a directly-available fact needs no chain ─────────────────────────────────
const direct = synthesize({ ctx: 'g', concl: `eval (M'[.., N]) "i` }, facts, rules, ctors);
expect(direct && direct.text === `[g |- X6]`, 'a direct fact closes as a bare fill');

console.log('OK test-prover-synth (backward chaining derives the eval_app1 reference chain; termination + honesty pinned)');
