// The signature lookup: an authored case with its constructors renamed by the
// signature. Pure ESM, no Beluga: whatever it produces is checked by the caller.
import { signatureIndex, transportArm } from '../js/editor-src/prover/case-lookup.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// Twelf form, as the corpus writes it.
const sig = `term : type.
true : term.
z : term.
succ : term -> term.
pred : term -> term.
iszero : term -> term.
tp : type.
bool : tp.
nat : tp.
oft : term -> tp -> type.
t_true : oft true bool.
t_zero : oft z nat.
t_succ : oft M nat -> oft (succ M) nat.
t_pred : oft M nat -> oft (pred M) nat.
t_iszero : oft M nat -> oft (iszero M) bool.
step : term -> term -> type.
e_succ : step M M' -> step (succ M) (succ M').
e_pred : step M M' -> step (pred M) (pred M').
e_iszero : step M M' -> step (iszero M) (iszero M').
e_pred_zero : step (pred z) z.
`;
const index = signatureIndex(sig);
expect(index.get('t_succ').fam === 'oft' && index.get('t_succ').arity === 1, 'the index knows each rule, its judgment and its premises');
expect(index.get('t_iszero').objects.join(' ') === 'iszero bool', 'and the constructors its conclusion talks about');

const succArm = `[ |- e_succ S] =>
  let [ |- t_succ D] = d in
  let [ |- D'] = tps [ |- S] [ |- D] in
    [ |- t_succ D']`;

// ── the case it exists for ────────────────────────────────────────────────────
const pred = transportArm(succArm, 'e_succ', 'e_pred', index);
expect(pred.text === succArm.split('e_succ').join('e_pred').split('t_succ').join('t_pred'),
  "e_pred's case is e_succ's with the step and typing rules about succ read as the ones about pred");
expect(pred.renames.get('t_succ') === 't_pred' && pred.renames.get('e_succ') === 'e_pred', 'and it says what it renamed');

// The typing rule for iszero concludes `bool`, not `nat`: matching whole conclusions
// would miss it. The lookup asks only where the changed object sits.
const isz = transportArm(succArm, 'e_succ', 'e_iszero', index);
expect(isz.text && isz.text.includes('t_iszero D') && !isz.text.includes('t_succ'), 'the rule about iszero is found though its result type differs');

// ── refusals say why, and never guess ─────────────────────────────────────────
const arity = transportArm(succArm, 'e_succ', 'e_pred_zero', index);
expect(!arity.text && /premises/.test(arity.why), 'a rule with a different number of premises is refused, with the reason');
const fam = transportArm(succArm, 'e_succ', 't_pred', index);
expect(!fam.text && /different judgments/.test(fam.why), 'a rule of another judgment is refused');
expect(!transportArm(succArm, 'e_succ', 'e_nowhere', index).text, 'a rule the signature does not have is refused');

// Two rules that could play the same part: no choice is made.
const ambiguous = signatureIndex(`${sig}t_pred2 : oft M nat -> oft (pred M) nat.\n`);
const amb = transportArm(succArm, 'e_succ', 'e_pred', ambiguous);
expect(!amb.text && /two rules/.test(amb.why), 'an ambiguous part is refused, not picked');

// ── comments are the author's ─────────────────────────────────────────────────
const commented = `[ |- e_succ S] =>   % by t_succ inversion
  let [ |- t_succ D] = d in [ |- t_succ D]`;
const c = transportArm(commented, 'e_succ', 'e_pred', index);
expect(c.text.includes('% by t_succ inversion') && c.text.includes('let [ |- t_pred D]'), 'a constructor named in a comment is left alone');

console.log('PASS test-case-lookup.mjs');
