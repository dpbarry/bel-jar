// After a long sync pulse, the search must yield a macrotask so a reel-style
// setInterval can fire. Without that, "Trying lemma · 7s…" freezes while CSS
// keeps moving.
import { proveProgram, theoremUnderProof } from '../js/editor-src/prover/prover-orchestrator.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const decl = 'rec top : [ |- a] -> [ |- b] =\n?\n;';
const thm = theoremUnderProof(decl);
const oracle = async (c) => {
  const rep = [];
  String(c).split('\n').forEach((ln, i) => {
    const j = ln.indexOf('?');
    if (j >= 0) {
      rep.push(`File "input.bel", line ${i + 1}, column ${j + 1}: Hole number 0, <anonymous>\nGoal: [ |- b]`);
    }
  });
  return { ok: true, output: rep.length ? '## Holes ##\n' + rep.join('\n') : '' };
};

let ticks = 0;
let pulses = 0;
const clock = setInterval(() => { ticks += 1; }, 15);
await proveProgram(decl, thm, oracle, {
  maxSteps: 1,
  noCounterexample: true,
  certifyTrim: false,
  onPulse() {
    pulses += 1;
    if (pulses > 2) return;
    const start = Date.now();
    while (Date.now() - start < 25) { /* starve macrotasks */ }
  },
});
clearInterval(clock);
expect(ticks >= 1, `search yields so a reel-style timer can tick (got ${ticks})`);
console.log('ok');
