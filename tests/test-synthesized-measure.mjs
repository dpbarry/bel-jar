// ⛔ Never write a `/ total /` the author did not. On an untotalied theorem `proveProgram`
// may fork with a measure of its own (`spliceTotalityPragma`) and return code that carries
// it; the Harpoon Lab takes that code into the working program and commits the body from
// the header's `=` to `;`, pragma included. `withoutSynthesizedMeasure` is the exact
// inverse of the splice, applied where the Lab receives the result. Pure Node.
import { spliceTotalityPragma, withoutSynthesizedMeasure } from '../js/editor-src/prover/prover-orchestrator.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const SIG = 'LF nat : type = | z : nat | s : nat -> nat;\n';
const HOLED = `${SIG}rec f : [ |- nat] -> [ |- nat] =\nfn n => ?;\n`;
const SOLVED = `${SIG}rec f : [ |- nat] -> [ |- nat] =\nfn n => case n of\n| [ |- z] => [ |- z]\n| [ |- s N] => f [ |- N];\n`;
const P = '/ total n (f n) /';
const thm = { name: 'f' };

// What the engine hands back after a winning fork: the spliced program, then solved.
const forked = spliceTotalityPragma(HOLED, 'f', P);
expect(forked && forked.includes(`=\n${P}\nfn n`), 'the splice puts the measure right after the body `=`');
const found = forked.replace('fn n => ?', SOLVED.slice(SOLVED.indexOf('fn n')).replace(/;\n$/, ''));
const res = { complete: true, code: found, steps: [{ move: 'split' }], synthesizedMeasure: P };

const out = withoutSynthesizedMeasure(res, thm);
expect(out.code === SOLVED, `the measure comes off and nothing else changes:\n${out.code}`);
expect(out.complete === true && out.steps === res.steps, 'the proof itself stands');
expect(!out.synthesizedMeasure && out.measureRemoved === P, 'and the result says which measure was removed');
expect(res.code === found, 'the result passed in is not mutated');

// The author's own measure is never touched: no fork, nothing to remove.
const authored = { complete: true, code: spliceTotalityPragma(SOLVED, 'f', P) };
expect(withoutSynthesizedMeasure(authored, thm) === authored, "a result with no synthesized measure is returned as is, the author's pragma included");

// Another declaration carrying the same text is not the one that was spliced.
const twin = `${SIG}rec g : [ |- nat] -> [ |- nat] =\n${P.replace(/f/g, 'g')}\nfn n => n;\n${found}`;
const outTwin = withoutSynthesizedMeasure({ ...res, code: twin }, thm);
expect(outTwin.code === twin.replace(`=\n${P}\n`, '=\n'), 'only the theorem under proof loses its measure');
expect(outTwin.code.includes('/ total n (g n) /'), "a sibling's pragma stays");

// Headers the engine reads: `]=` with no space, and glyphs.
const tight = `${SIG}rec f : [ ⊢ nat] → [ ⊢ nat]=\n${P}\nfn n ⇒ n;\n`;
expect(withoutSynthesizedMeasure({ ...res, code: tight }, thm).code === `${SIG}rec f : [ ⊢ nat] → [ ⊢ nat]=\nfn n ⇒ n;\n`,
  'a header with `]=` and glyphs is read the way the splice read it');

// Fail closed: if the measure is not where the splice put it, the result is not a proof
// we may hand on, because committing it would write the invented measure.
const moved = { ...res, code: found.replace(`=\n${P}\n`, '=\n') + `% ${P}\n` };
const outMoved = withoutSynthesizedMeasure(moved, thm);
expect(outMoved.complete === false && outMoved.stuck && outMoved.stuck.reason === 'synthesized-measure',
  'a measure that cannot be found where it was spliced fails the result instead of passing it on');

console.log('ok synthesized-measure');
