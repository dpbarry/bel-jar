// Case completion's engine room against the real checker: who is filled unasked, how
// missing cases are planned, and what a fill must satisfy before it counts.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { recsWithArms, maskArm } from '../js/editor-src/prover/case-arms.mjs';
import { armRuleHead } from '../js/editor-src/prover/case-pieces.mjs';
import { STRENGTH } from '../js/editor-src/prover/case-assignment.mjs';
import { signatureIndex } from '../js/editor-src/prover/case-lookup.mjs';
import {
  eligibility, planCase, fillRow, holeInRange, PARK, coverageMissing, bodyIsClosed, keyOfPattern,
} from '../js/editor-src/prover/case-fill.mjs';
import { proveProgram } from '../js/editor-src/prover/prover-orchestrator.mjs';
import { theoremUnderProof } from '../js/editor-src/prover/prover-hyp.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { console, TextDecoder, TextEncoder, setTimeout, clearTimeout };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'beluga_web.bc.js'), 'utf8'), ctx);
const check = async (code) => { const r = ctx.Beluga.checkFromString(code); return { ok: !!r.ok, output: String(r.output || '') }; };

const SIG = `LF tm : type = | z : tm | succ : tm -> tm | pred : tm -> tm;
LF tp : type = | nat : tp;
LF oft : tm -> tp -> type =
| t_z : oft z nat
| t_succ : oft M nat -> oft (succ M) nat
| t_pred : oft M nat -> oft (pred M) nat;
LF step : tm -> tm -> type =
| e_succ : step M M' -> step (succ M) (succ M')
| e_pred : step M M' -> step (pred M) (pred M')
| e_pred_z : step (pred z) z;
`;
const TPS = `${SIG}rec tps : [ |- step M N] -> [ |- oft M T] -> [ |- oft N T] =
/ total s (tps m n t s) /
fn s => fn d => case s of
| [ |- e_succ S] =>
  let [ |- t_succ D] = d in
  let [ |- D'] = tps [ |- S] [ |- D] in
  [ |- t_succ D']
| [ |- e_pred S] =>
  let [ |- t_pred D] = d in
  let [ |- D'] = tps [ |- S] [ |- D] in
  [ |- t_pred D']
| [ |- e_pred_z] =>
  let [ |- t_pred D] = d in
  [ |- t_z]
;
`;
expect((await check(TPS)).ok, 'the fixture is a proof Beluga accepts');
const recOf = (code) => recsWithArms(code).find((r) => r.name === 'tps');
const without = (code, heads) => {
  let out = code;
  for (const a of recOf(code).arms.filter((x) => heads.includes(armRuleHead(x.text))).sort((x, y) => y.from - x.from)) out = maskArm(out, a);
  return out;
};

// ── who is filled without being asked ─────────────────────────────────────────
const e = eligibility(TPS, recOf(TPS));
expect(e.auto && e.strength === STRENGTH.total && e.specification === 'indexed', 'a totalied theorem split on its rules is filled automatically');
const commented = TPS.replace('/ total s (tps m n t s) /', '% / total s (tps m n t s) /');
expect(!eligibility(commented, recOf(commented)).auto, 'a commented-out pragma is not total: never automatic');
const covering = `--coverage\n${commented}`;
const ec = eligibility(covering, recOf(covering));
expect(!ec.auto && ec.strength === STRENGTH.covering, 'a coverage pragma alone is not enough: circular proofs pass there');
const prog = `${SIG}rec copy : [ |- tm] -> [ |- tm] =\n/ total e (copy e) /\nfn e => case e of\n| [ |- z] => [ |- z]\n| [ |- succ M] => [ |- z]\n;\n`;
const ep = eligibility(prog, recsWithArms(prog).find((r) => r.name === 'copy'));
expect(!ep.auto && ep.specification === 'data', 'a function returning a term is never automatic: its type admits wrong answers');

// ── planning ──────────────────────────────────────────────────────────────────
const two = without(TPS, ['e_pred', 'e_pred_z']);
expect(!(await check(two)).ok, 'the proof with two cases removed is rejected');
const plan = await planCase(two, recOf(two), check);
expect(plan.rows.length === 2 && !plan.unbuilt, `both missing cases are planned (got ${plan.rows.length}, ${plan.why || ''})`);
expect(plan.rows.map((r) => r.rule).join(',') === 'e_pred,e_pred_z', 'rows are the missing rules, in signature order');
expect(plan.rows.every((r) => plan.code.slice(r.from, r.to).includes(`?${PARK}`)), 'each row is parked under its own named hole');
expect((await check(plan.code)).ok, 'the planned program checks: holes satisfy coverage');
expect(plan.rows.every((r) => plan.code.slice(r.from, r.to).startsWith(r.pattern)), "a row's span starts at its pattern");
const nothing = await planCase(TPS, recOf(TPS), check);
expect(nothing.rows.length === 0 && nothing.why === 'nothing-missing', 'a complete proof plans nothing');

// ── filling ───────────────────────────────────────────────────────────────────
const rec2 = recOf(two);
const authored = rec2.arms.map((a) => ({ text: a.text, head: armRuleHead(a.text) }));
const base = { authored, index: signatureIndex(two), recStart: rec2.from, maxSteps: 15, deadlineMs: 120000 };
const viaLookup = await fillRow(plan, 0, check, base);
expect(viaLookup.ok && viaLookup.source === 'lookup' && viaLookup.donor === 'e_succ', 'e_pred is filled instantly by the lookup, from e_succ');
expect(/t_pred D/.test(viaLookup.text) && !/t_succ/.test(viaLookup.text), "and it is e_succ's case with succ read as pred");
const viaOrca = await fillRow(plan, 1, check, base);
expect(viaOrca.ok && viaOrca.source === 'orca' && viaOrca.steps > 0, `e_pred_z is filled by Orca (${viaOrca.why || ''})`);
// Not necessarily the author's proof (here Orca returns the inverted premise rather than
// `t_z`); for a theorem any proof will do, and fillRow has already re-checked it.
expect(viaOrca.text.startsWith('[ |- e_pred_z]'), 'and the arm it produced is for that rule');
const forced = await fillRow(plan, 0, check, { ...base, noLookup: true });
expect(forced.ok && forced.source === 'orca', 'without the lookup, Orca fills the renamed case too');

// ── what a fill must satisfy ──────────────────────────────────────────────────
const row = plan.rows[1];
const stub = (make) => async (code) => make(code);
const zero = await fillRow(plan, 1, check, { ...base, noLookup: true, prove: stub((code) => ({ complete: true, code, steps: [] })) });
expect(!zero.ok && zero.why === 'zero-move-complete' && zero.unmeasured, 'a COMPLETE with no move filled nothing, and is not counted either way');
const outside = await fillRow(plan, 1, check, {
  ...base, noLookup: true,
  prove: stub((code) => ({ complete: true, steps: [{ move: 'fill' }], code: code.replace('LF tp : type', 'LF tp  : type') })),
});
expect(!outside.ok && outside.why === 'touched-outside-the-case', 'a fill that changed anything outside its row is refused');
const holeLeft = await fillRow(plan, 1, check, {
  ...base, noLookup: true,
  prove: stub((code) => ({ complete: true, steps: [{ move: 'intro' }], code })),
});
expect(!holeLeft.ok && holeLeft.why === 'failed-re-check', "a fill that leaves a hole in its row fails the independent re-check");
const thm = theoremUnderProof(`rec ${plan.code.slice(rec2.from, row.from)}`);
expect(!!thm && thm.name === 'tps', 'the theorem is read from the header before the row');

// ── holes are placed against the checked text ─────────────────────────────────
const out = (await check(plan.code)).output;
expect(!holeInRange(plan.code, out, row.from, row.to), 'a parked hole does not count as one left in the row');
const anon = plan.code.slice(0, row.from) + plan.code.slice(row.from, row.to).replace(`?${row.hole}`, '?') + plan.code.slice(row.to);
expect(holeInRange(anon, (await check(anon)).output, row.from, row.to), 'an anonymous hole inside the row does');
expect(!holeInRange(anon, (await check(anon)).output, 0, row.from), 'and is not found anywhere else');

// ── Beluga's own list of missing cases, as patterns ───────────────────────────
// Real coverage output (2026-10-03), one shape each.
const param = '######   COVERAGE FAILURE: Case expression doesn\'t cover: ######\n##       CASE(S) NOT COVERED:\n(1)\n#u : #(g |- block (x : exp, u : equal x x, _t : eq x x)) ;  |- [_ |- #u.2]\n\n##';
expect(coverageMissing(param, null).join('|') === '[g |- #u.2]', "a parameter case, with Beluga's `_` replaced by the context its own item names");
const comp = 'CASE(S) NOT COVERED:\n(1)\n#q : #(g1, x : source S[] |- source T[]) ;\nx : Map [h] [g1, x : source S[]], x2 : [h |- target S[]], x1 : Map [h] [g1] |-\n  M_dot x1 x2 \n\n##';
expect(coverageMissing(comp, null).join('|') === 'M_dot x1 x2', 'a computation-level case: the pattern follows the last TOP-LEVEL turnstile, not one inside a type');
const ctxSplit = 'CASE(S) NOT COVERED:\n(1) g : sctx ;  |- [_, x : source T[]]\n\n##';
expect(coverageMissing(ctxSplit, null).join('|') === '[g, x : source T[]]', 'a context split, its context variable read from the declaration `g : sctx`');
expect(coverageMissing(ctxSplit, 'h').join('|') === '[h, x : source T[]]', "the proof's own name for the context wins when it has one");
const twoItems = 'CASE(S) NOT COVERED:\n(1) X : ( |- nat) ;  |- [ |- s X]\n(2) ;  |- [ |- z]\n\n##';
expect(coverageMissing(twoItems, null).join('|') === '[ |- s X]|[ |- z]', 'every listed case, in order');
expect(coverageMissing('CASE(S) NOT COVERED:\n(1) ;  |- [ |- c "i1]\n##', null).length === 0, 'a pattern with an internal name cannot be written, and is left out');
expect(coverageMissing('## Type Reconstruction done ##', null).length === 0, 'no coverage failure, no cases');

// ── where a row may go ────────────────────────────────────────────────────────
expect(bodyIsClosed("[ |- s X] =>\n  let [ |- D] = d in [ |- D]"), 'a body ending in a bracketed term is closed: a let takes no arms');
expect(!bodyIsClosed('[ |- s X] =>\n  case d of | [ |- c] => ?'), 'a body ending in a bare case would take an appended arm');
expect(bodyIsClosed('[ |- s X] =>\n  (case d of | [ |- c] => ?)'), 'a parenthesised case would not');
expect(!bodyIsClosed('[ |- s X] =>\n  fn y => case y of | [ |- c] => ?'), 'nor would a case under a binder at the top');

// ── the catch-all: cases nobody could build do not stop the others ────────────
// The real checker, except that one case nobody can build keeps coverage failing for as
// long as the case is not caught by anything.
const stubCheck = async (code) => {
  const real = await check(code);
  if (!real.ok || code.includes('| _ =>') || !/case s of/.test(code)) return real;
  return { ok: false, output: 'COVERAGE FAILURE: Case expression doesn\'t cover:\n##       CASE(S) NOT COVERED:\n(1) ;  |- [ |- weird "i9]\n##' };
};
const one = without(TPS, ['e_pred']);
const partial = await planCase(one, recOf(one), stubCheck);
expect(partial.partial && !partial.unbuilt && partial.why === 'some-cases-not-built', 'when coverage still fails, a parked catch-all makes the plan usable, and says it is partial');
expect(partial.rows.length === 1 && partial.rows[0].rule === 'e_pred', 'the row that was built is kept');
expect(/\| _ =>\s*\?cf_rest\s*;?\s*$/.test(partial.code.slice(0, partial.code.lastIndexOf(';') + 1).replace(/;\s*$/, '')), 'the catch-all is the last arm, under a parked hole');
const openLast = `${SIG}rec tps : [ |- step M N] -> [ |- oft M T] -> [ |- oft N T] =
/ total s (tps m n t s) /
fn s => fn d => case s of
| [ |- e_succ S] =>
  let [ |- t_succ D] = d in
  let [ |- D'] = tps [ |- S] [ |- D] in
  [ |- t_succ D']
| [ |- e_pred_z] =>
  case d of
  | [ |- t_pred D] => [ |- t_z]
;
`;
const wrapped = await planCase(openLast, recOf(openLast), stubCheck);
expect(/=>\n\s*\(case d of[\s\S]*\n\)\n\s*\| _ =>/.test(wrapped.code), "a last arm ending in a bare case has its body parenthesised before the catch-all goes after it");

// ── a proof as the editor holds it: glyphs ────────────────────────────────────
// Regression (2026-10-05): greedy alias expansion, BelJar's default, turns `|-`, `->` and
// `=>` into `⊢`, `→` and `⇒`. Every check above passed while, in the browser, no arm had a
// head: nothing ran unasked and a forced fill planned the written case as missing.
const glyphs = (t) => t.replace(/\|-/g, '⊢').replace(/->/g, '→').replace(/=>/g, '⇒');
const gTwo = glyphs(two);
const gRec = recOf(gTwo);
expect(eligibility(gTwo, gRec).auto, 'a glyph proof is eligible exactly as its ASCII twin');
const gPlan = await planCase(gTwo, gRec, check);
expect(gPlan.rows.map((r) => r.key).join(',') === plan.rows.map((r) => r.key).join(','),
  `and plans the same missing cases, and no written one (got ${gPlan.rows.map((r) => r.key).join(',')})`);
expect(keyOfPattern('[g ⊢ #p.1[..]]') === keyOfPattern('[g |- #p.1]'), 'a parameter case keys the same in either spelling');
const gBase = { ...base, authored: gRec.arms.map((a) => ({ text: a.text, head: armRuleHead(a.text) })), index: signatureIndex(gTwo), recStart: gRec.from };
const gLookup = await fillRow(gPlan, 0, check, gBase);
expect(gLookup.ok && gLookup.source === 'lookup' && gLookup.donor === 'e_succ', `the lookup still finds its donor among glyph arms (${gLookup.why || ''})`);
const gOrca = await fillRow(gPlan, 1, check, gBase);
expect(gOrca.ok && gOrca.source === 'orca', `and Orca still fills the other case (${gOrca.why || ''})`);

// ── focus: one row while another is still a hole ──────────────────────────────
const focusCode = anon; // row 1 open, row 0 parked
const focusThm = theoremUnderProof(`rec ${focusCode.slice(rec2.from, row.from)}`);
const fr = await proveProgram(focusCode, focusThm, check, { maxSteps: 15, certifyTrim: false, noMeasureSynthesis: true, requireProgress: true, ignoreHolePrefix: PARK });
expect(fr.complete && fr.code.includes(`?${plan.rows[0].hole}`), 'a focused run completes its own row and leaves the parked one alone');

console.log('PASS test-case-fill.mjs');
