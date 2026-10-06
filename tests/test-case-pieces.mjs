// Reading authored pieces out of a proof — the front half of the case-completion
// split. Pure ESM: the grammar and the corpus on disk, no Beluga, no DOM.
import { readFileSync } from 'node:fs';
import {
  declaredFamilies, ruleIndex, armRuleHead, armArrowIndex, armArrow, splitArm,
  authoredPieces, missingRules,
} from '../js/editor-src/prover/case-pieces.mjs';
import { outerArms } from '../scripts/case-read-arms.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── both signature dialects are families ──────────────────────────────────────
// The block form announces itself; the Twelf form the corpus is mostly written in
// does not, and its constructors are separate top-level declarations.
const lfStyle = String.raw`LF tm : type = | app : tm -> tm -> tm | lam : (tm -> tm) -> tm;
LF step : tm -> tm -> type =
| s_app1 : step M M' -> step (app M N) (app M' N)
| s_beta : step (app (lam \x. M x) N) (M N);`;
const twelfStyle = `tp : type.
bool : tp.
oft : term -> tp -> type.
t_true : oft true bool.
t_false : oft false bool.`;

expect(declaredFamilies(lfStyle).join(',') === 'tm,step', 'block-form families are found');
expect(declaredFamilies(twelfStyle).join(',') === 'tp,oft', 'Twelf-form families are found');
// The editor writes glyph arrows (greedy alias expansion, the default): a family whose
// result follows `→` is a family too. Regression, 2026-10-05.
const glyphStyle = lfStyle.replace(/->/g, '→');
expect(declaredFamilies(glyphStyle).join(',') === 'tm,step', 'families declared with glyph arrows are found');
expect(declaredFamilies(twelfStyle.replace(/->/g, '→')).join(',') === 'tp,oft', 'in either dialect');
expect(
  !declaredFamilies(twelfStyle).includes('bool'),
  'a constant whose result is not `type` is not a family',
);

const idx = ruleIndex(lfStyle);
expect(idx.get('s_beta') === 'step' && idx.get('app') === 'tm', 'the rule index inverts the enumerator');

// ── mutual blocks are one declaration with several heads ──────────────────────
const mutual = `LF even : nat -> type = | ez : even z
and odd : nat -> type = | oz : odd (s z);`;
expect(declaredFamilies(mutual).join(',') === 'even,odd', 'both heads of a mutual block are families');

// ── computation-level inductives are judgments too ────────────────────────────
// Regression, found by the harness: these end in `ctype`, not `type`, so a proof by
// induction on one (logical relations, strong normalisation) resolved to no judgment
// and got no assignment table. The enumerator already knew their constructors.
const compLevel = `LF tm : type = | unit : tm | app : tm -> tm -> tm;
inductive Sn : [ |- tm] -> ctype =
| SUnit : Sn [ |- unit]
| SApp : Sn [ |- M] -> Sn [ |- N] -> Sn [ |- app M N];
stratified Red : [ |- tm] -> ctype =
| RUnit : Red [ |- unit];
coinductive Stream : ctype = | (Hd : Stream :: [ |- tm]);`;
expect(declaredFamilies(compLevel).join(',') === 'tm,Sn,Red', 'inductive and stratified ctypes are families; codata is left out');
expect(ruleIndex(compLevel).get('SApp') === 'Sn', 'their constructors index back to them');
const snPieces = authoredPieces(compLevel, ['SUnit => ?', 'SApp s1 s2 ⇒ ?']);
expect(snPieces.judgment === 'Sn' && snPieces.pieces.length === 2, 'a proof by induction on a ctype resolves its judgment');
expect(missingRules(compLevel, 'Sn', snPieces.pieces.slice(0, 1)).map((r) => r.name).join(',') === 'SApp', 'and names its missing rule');

// ── an arm's head comes from its PATTERN, never its body ──────────────────────
// Regression: reading the arm whole made the LAST turnstile win, so
// `[ |- e_switch_true] => let [ |- t_switch D D1 D2] = d in [ |- D1]` reported `D1`.
const armWithBody = '[ |- e_switch_true] =>\n  let [ |- t_switch D D1 D2] = d in [ |- D1]';
expect(armRuleHead(armWithBody) === 'e_switch_true', "an arm's head is read from the pattern only");
expect(armArrowIndex(armWithBody) === 20, 'the top-level arrow is located, not one inside a box');
expect(
  armRuleHead('[g, h:hyp A |- axiom H1[..]] => ?') === 'axiom',
  'a context and a substitution in the pattern do not hide the head',
);
expect(armRuleHead('[ |- s_app1 D] : [ |- T] => ?') === 's_app1', 'a type annotation does not hide the head');
expect(armRuleHead('d => ?') === 'd', 'a bare variable arm reports its own name');
// An UNBOXED pattern whose body contains a box is the case that separates "cut the
// body off" from "take the first turnstile": without the cut, the body's own
// turnstile is the only one there is, and the head is read out of the body.
expect(
  armRuleHead('d => let [ |- x] = d in x') === 'd',
  "a turnstile in the body never supplies the pattern's head",
);
expect(armRuleHead('[ |- #p.h[..]] => ?') === null, 'a projection is not a constructor and is refused');
// Regression: a computation-level pattern has boxes in its ARGUMENTS; their turnstile is
// not the pattern's, and stripping to it read `M_dot sigma' [h |- M]` as headed by `M`.
expect(armRuleHead("M_dot sigma' [h |- M] => ?") === 'M_dot', 'a computation-level pattern is headed by its constructor');
expect(armRuleHead('Ae_v => ?') === 'Ae_v', 'including one with no arguments');

// ── both arrow spellings ──────────────────────────────────────────────────────
// Regression: Beluga takes `=>` and `⇒`, the corpus writes the second in 222 arms of
// 76 proofs, and reading only the first skipped every one of them. They differ in
// WIDTH, so the body must not be sliced at a fixed offset.
const uni = '[ |- e_succ S] ⇒\n  let [ |- t_succ D] = d in [ |- D]';
expect(armArrow(uni).length === 1 && armArrow(armWithBody).length === 2, 'the arrow reports its own width');
expect(armRuleHead(uni) === 'e_succ', 'a Unicode arrow separates pattern from body');
expect(splitArm(uni).pattern === '[ |- e_succ S]', 'the pattern stops at a Unicode arrow');
expect(splitArm(uni).body === 'let [ |- t_succ D] = d in [ |- D]', 'and the body starts right after it, one character on');
expect(splitArm(armWithBody).body === 'let [ |- t_switch D D1 D2] = d in [ |- D1]', 'an ASCII arrow is two characters wide');
expect(splitArm('| [ |- z] => [ |- z]').pattern === '[ |- z]', 'a leading bar is not part of the pattern');
// Both turnstiles. Regression (2026-10-05): the editor's alias expansion writes `⊢`, so an
// arm typed in BelJar reads `[ ⊢ e_succ S] ⇒`; reading only `|-` found no head in any of them.
expect(armRuleHead('[ ⊢ e_succ S] ⇒ let [ ⊢ t_succ D] = d in [ ⊢ D]') === 'e_succ', 'a glyph turnstile is a turnstile');
expect(armRuleHead('[g, h:hyp A ⊢ axiom H1[..]] ⇒ ?') === 'axiom', 'with a context in front of it too');
expect(armRuleHead('[g ⊢ #p.h[..]] ⇒ ?') === null, 'and a projection behind it is still refused');
// No space after the arrow: whitespace would hide a slice that starts one character late.
expect(splitArm('[ |- z] ⇒[ |- z]').body === '[ |- z]', 'the body is sliced by the width of the arrow that is there');
expect(splitArm('[ |- z]') === null, 'an arm with no arrow is not split, and not guessed at');
expect(
  splitArm('[g |- lam (\\x. M)] : [g |- tm (arr A B)] ⇒ ?').pattern === '[g |- lam (\\x. M)] : [g |- tm (arr A B)]',
  'the pattern keeps its type annotation',
);

// ── constructor names may carry symbols ───────────────────────────────────────
// Regression: a hand-rolled letters-only identifier class truncated `step_@1` to
// `step_` and silently lost five of `step`'s nine rules. DECL_IDENT is the one class.
expect(armRuleHead('[ |- step_@1 EV1] => ?') === 'step_@1', 'an `@` belongs to the constructor name');
expect(armRuleHead('[ |- step_#2] => ?') === 'step_#2', 'so does a `#`');

// ── against a real proof, not a fixture ───────────────────────────────────────
const real = 'Beluga-W/examples/small-step/system-f-iso.bel';
let src = null;
try { src = readFileSync(real, 'utf8'); } catch (_) { /* submodule absent */ }
if (src) {
  const arms = outerArms(src, 'pres');
  expect(arms.length === 9, `pres has nine outer arms (got ${arms.length})`);
  const { judgment, pieces, unreadable } = authoredPieces(src, arms);
  expect(judgment === 'step', `pres cases on step (got ${judgment})`);
  expect(unreadable === 0, 'every arm of pres is readable');
  expect(pieces.length === 9, `all nine arms are pieces of step (got ${pieces.length})`);
  expect(
    pieces.map((p) => p.rule).includes('step_@3'),
    'the symbolic rule names survive on a real proof',
  );
  expect(
    missingRules(src, 'step', pieces).length === 0,
    'a complete proof has no missing rules',
  );
  // Take an arm away and it must show up as missing, by name.
  const short = pieces.filter((p) => p.rule !== 'step_roll');
  const gap = missingRules(src, 'step', short);
  expect(gap.length === 1 && gap[0].name === 'step_roll', 'a removed case is named as missing');
  expect(pieces[0].id === 'the step_s case', 'a piece is named by its argument, never by index');
  expect(pieces[0].body.length > 0, 'a piece carries its body');
} else {
  console.log('  (Beluga-W absent — real-proof assertions skipped)');
}

// ── nothing is claimed about a proof we cannot read ───────────────────────────
const noCase = 'LF nat : type = | z : nat;\nrec f : [ |- nat] -> [ |- nat] =\nfn n => n\n;';
expect(outerArms(noCase, 'f').length === 0, 'a proof with no case expression yields no arms');
expect(authoredPieces(noCase, outerArms(noCase, 'f')).judgment === null, 'and no judgment is invented for it');
expect(authoredPieces(lfStyle, []).pieces.length === 0, 'no arms means no pieces');

console.log('PASS test-case-pieces.mjs');
