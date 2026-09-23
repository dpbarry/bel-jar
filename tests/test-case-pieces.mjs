// Reading authored pieces out of a proof — the front half of the case-completion
// split. Pure ESM: the grammar and the corpus on disk, no Beluga, no DOM.
import { readFileSync } from 'node:fs';
import {
  declaredFamilies, ruleIndex, armRuleHead, armArrowIndex,
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
