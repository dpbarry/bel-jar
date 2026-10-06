// The arm reader the case-completion harness masks and splices with.
// Pure ESM: the grammar only.
import { recsWithArms, outerArms, maskArm, replaceArm } from '../scripts/case-read-arms.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const code = `LF nat : type = | z : nat | s : nat -> nat;
rec f : [ |- nat] -> [ |- nat] =
/ total 1 /
fn n => case n of
| [ |- z] => [ |- z]
| [ |- s X] => [ |- X]
;
rec g : [ |- nat] -> [ |- nat] =
fn n => n
;`;

const recs = recsWithArms(code);
expect(recs.map((r) => r.name).join(',') === 'f,g', 'every rec is listed, in order');
const f = recs[0];
expect(f.arms.length === 2, 'f has two outer arms');
expect(recs[1].arms.length === 0, 'a rec with no case has no arms, and is still listed');
expect(/\/\s*total/.test(code.slice(f.from, f.to)), "a rec's span includes its totality declaration");
expect(!/\/\s*total/.test(code.slice(recs[1].from, recs[1].to)), "and not its neighbour's");
expect(code.slice(f.arms[1].from, f.arms[1].to) === f.arms[1].text, 'an arm span indexes the program text');
expect(f.arms[0].text.startsWith('[ |- z]'), 'an arm starts at its pattern, not at its bar');
expect(outerArms(code, 'f').join('§') === f.arms.map((a) => a.text).join('§'), 'outerArms is the same arms as text');

// ── masking takes the bar with the arm ────────────────────────────────────────
const noSecond = maskArm(code, f.arms[1]);
// ⛔ Exact text, not "it still parses": the grammar recovers from a dangling bar, so
// a parse-based check passed with the bar left behind.
expect(noSecond === code.replace('| [ |- s X] => [ |- X]', ''), 'the masked arm is gone, bar and all, and nothing else');
expect(recsWithArms(noSecond)[0].arms.length === 1, 'and what is left still parses as one arm');
// Count arm bars only: a turnstile has a bar of its own.
const armBars = (t) => (t.match(/^\| \[/gm) || []).length;
expect(armBars(noSecond) === armBars(code) - 1, 'exactly one arm bar went with it');

const noFirst = maskArm(code, f.arms[0]);
expect(noFirst === code.replace('| [ |- z] => [ |- z]', ''), 'masking the first arm takes its own bar');
expect(recsWithArms(noFirst)[0].arms.length === 1, 'and leaves the second');
expect(recsWithArms(noFirst)[0].arms[0].text.startsWith('[ |- s X]'), 'and it is the right one');

// A first arm written without a leading bar gives up the bar that follows it.
const barless = code.replace('case n of\n| [ |- z]', 'case n of\n  [ |- z]');
const bl = recsWithArms(barless)[0];
expect(bl.arms.length === 2, 'a barless first arm is still an arm');
const blMasked = maskArm(barless, bl.arms[0]);
expect(blMasked === barless.replace('[ |- z] => [ |- z]\n|', ''), 'the following bar goes with a barless first arm');
const blLeft = recsWithArms(blMasked)[0].arms;
expect(blLeft.length === 1 && blLeft[0].text.startsWith('[ |- s X]'), 'masking it leaves one well-formed arm');

// ── replacement is in place ───────────────────────────────────────────────────
const swapped = replaceArm(code, f.arms[1], '[ |- s Y] =>\n([ |- Y]\n)');
expect(
  swapped === code.replace('[ |- s X] => [ |- X]', '[ |- s Y] =>\n([ |- Y]\n)'),
  'replacement swaps exactly the arm text',
);
const sw = recsWithArms(swapped)[0].arms;
expect(sw.length === 2 && sw[1].text.includes('s Y'), 'a replaced arm sits where the old one was');
expect(sw[0].text === f.arms[0].text, 'and its neighbours are untouched');

console.log('PASS test-case-read-arms.mjs');
