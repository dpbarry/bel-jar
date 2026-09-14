import {
  collectMovesAt,
  movesAtAsync,
  candidateMovesAsync,
  abortMovesWorkload,
} from '../js/editor-src/prover/prover-moves-async.mjs';
import { movesAt, manualState } from '../js/editor-src/prover/prover-manual.mjs';
import { candidateMoves } from '../js/editor-src/prover/prover-candidates.mjs';
import { theoremUnderProof } from '../js/editor-src/prover/prover-hyp.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const PRELUDE = `LF nat : type =
| z : nat
| s : nat -> nat
;
`;
const DECL = `rec dbl : [ |- nat] -> [ |- nat] =
?
;`;
const CODE = PRELUDE + DECL;
const thm = theoremUnderProof(DECL);
const HOLE_LINE = CODE.split('\n').findIndex((l) => l.trim() === '?') + 1;
const OUT = [
  '## Holes ##',
  `File "input.bel", line ${HOLE_LINE}, column 1: Hole number 1, <anonymous>`,
  'Goal: [ |- nat] -> [ |- nat]',
  'Meta-context:',
  'Computation context:',
  '',
].join('\n');

const state = manualState(CODE, thm, OUT);
const hole = state.holes[0];

const sync = movesAt(state, thm);
const collected = collectMovesAt(hole, CODE, thm);
expect(JSON.stringify(sync) === JSON.stringify(collected),
  'collectMovesAt matches movesAt');

const asyncMoves = await movesAtAsync(state, thm);
expect(JSON.stringify(asyncMoves) === JSON.stringify(sync),
  'movesAtAsync (no Worker) matches movesAt');

const asyncCand = await candidateMovesAsync(hole, CODE, thm);
const syncCand = candidateMoves(hole, CODE, thm) || [];
expect(JSON.stringify(asyncCand) === JSON.stringify(syncCand),
  'candidateMovesAsync (no Worker) matches candidateMoves');

abortMovesWorkload();
const afterAbort = await movesAtAsync(state, thm, { shouldCancel: () => true });
expect(Array.isArray(afterAbort) && afterAbort.length === 0,
  'shouldCancel yields no moves');

let ticks = 0;
const clock = setInterval(() => { ticks += 1; }, 10);
const pending = movesAtAsync(state, thm);
abortMovesWorkload();
await pending;
clearInterval(clock);
expect(ticks >= 0, 'abortMovesWorkload is safe with no live worker');

// A worker error (a crash, or running out of memory on one hard hole) must not end move
// synthesis for the page: the job in flight gets one fresh worker, and later requests start a
// new one. A job that crashes every worker settles empty after that one retry, never loops.
// Fake Worker and document stand in for the browser.
{
  const made = [];
  let crashes = 0;
  const fakeWorker = (crashWhen) => class {
    constructor(url) { this.url = url; this.listeners = new Set(); this.n = made.push(this); }
    addEventListener(type, fn) { if (type === 'message') this.listeners.add(fn); }
    removeEventListener(type, fn) { this.listeners.delete(fn); }
    terminate() { this.dead = true; }
    postMessage(msg) {
      setTimeout(() => {
        if (this.dead) return;
        if (crashWhen(this)) { crashes += 1; if (this.onerror) this.onerror(new Error('crash')); return; }
        const moves = collectMovesAt(msg.hole, msg.code, msg.thm);
        for (const fn of this.listeners) fn({ data: { id: msg.id, moves } });
      }, 0);
    }
  };
  globalThis.document = {
    getElementsByTagName: () => [{ src: 'http://x/js/editor-cm.bundle.js' }],
    baseURI: 'http://x/',
  };

  globalThis.Worker = fakeWorker((w) => w.n === 1);
  abortMovesWorkload();
  const retried = await movesAtAsync(state, thm);
  expect(JSON.stringify(retried) === JSON.stringify(sync), 'a crashed worker is retried for the job in flight');
  expect(made.length === 2, `the retry started a fresh worker (${made.length} made)`);
  const later = await movesAtAsync(state, thm);
  expect(JSON.stringify(later) === JSON.stringify(sync), 'requests after a crash keep working');

  globalThis.Worker = fakeWorker(() => true);
  abortMovesWorkload();
  crashes = 0;
  const dead = await movesAtAsync(state, thm);
  expect(Array.isArray(dead) && dead.length === 0, 'a job that crashes every worker settles empty');
  expect(crashes === 2, `after exactly one retry (${crashes} crashes)`);
  const again = await movesAtAsync(state, thm);
  expect(Array.isArray(again) && crashes === 4, `the next request still tries a fresh worker (${crashes} crashes)`);

  abortMovesWorkload();
  delete globalThis.Worker;
  delete globalThis.document;
}

console.log('ok');
