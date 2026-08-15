// MANUAL HARPOON — the interactive session reducer.
//
// The engine's move GENERATION is pinned elsewhere (test-prover-*.mjs); what
// this pins is the manual session's mechanics, which auto-solve never exercised:
// a state that advances one user-picked move at a time, a snapshot stack that
// undoes exactly, and — the load-bearing one — a step record in the SAME shape
// auto-solve pushes, since the solve reel / derivation list / proof-tree
// explorer render manual proofs through that shape with no manual-specific code.
//
// The oracle is a stub: these are state transitions, not proof search, so the
// checker is scripted rather than run.
import {
  manualState,
  movesAt,
  focusHole,
  focusOn,
  isComplete,
  attemptMove,
  applyMove,
  absorbAuto,
  undo,
  redo,
  canUndo,
  canRedo,
} from '../js/editor-src/prover/prover-manual.mjs';
import { theoremUnderProof } from '../js/editor-src/prover/prover-hyp.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── a minimal but REAL program: an LF family with two constructors, and a
//    theorem whose body is a single hole. ────────────────────────────────────
const PRELUDE = `LF nat : type =
| z : nat
| s : nat -> nat
;
LF eq : nat -> nat -> type =
| refl : eq N N
;
`;
const DECL = `rec dbl : [ |- nat] -> [ |- nat] =
?
;`;
const CODE = PRELUDE + DECL;

const thm = theoremUnderProof(DECL);
expect(thm && thm.name === 'dbl', 'theoremUnderProof reads the decl under proof');

// The `## Holes ##` report Beluga prints for CODE (line 11 is the `?`).
function holeReport(line, col, goal, ctx) {
  return [
    '## Holes ##',
    `File "input.bel", line ${line}, column ${col}: Hole number 1, <anonymous>`,
    `Goal: ${goal}`,
    'Meta-context:',
    'Computation context:',
    ...(ctx || []).map((c) => `  ${c.name} : ${c.type}`),
    '',
  ].join('\n');
}

const HOLE_LINE = CODE.split('\n').findIndex((l) => l.trim() === '?') + 1;
const BASE_OUT = holeReport(HOLE_LINE, 1, '[ |- nat] -> [ |- nat]');

// ── 1. state construction ───────────────────────────────────────────────────
const s0 = manualState(CODE, thm, BASE_OUT);
expect(s0.holes.length === 1, `one hole parsed, got ${s0.holes.length}`);
expect(s0.focusIdx === 0, 'focus defaults to the only hole');
expect(!isComplete(s0), 'a state with an open hole is not complete');
expect(focusHole(s0).line === HOLE_LINE, 'focus hole carries the reported line');
expect(s0.steps.length === 0 && !canUndo(s0) && !canRedo(s0), 'fresh state has no history');

// ── 2. moves are offered from OUR model ─────────────────────────────────────
const moves = movesAt(s0, thm);
expect(Array.isArray(moves), 'movesAt returns an array');
expect(moves.length > 0, 'the engine offers at least one move at a fresh arrow goal');
expect(moves.some((m) => m.kind === 'intro'),
  `an arrow goal offers intro; got kinds [${[...new Set(moves.map((m) => m.kind))].join(', ')}]`);
expect(moves.every((m) => typeof m.text === 'string' && m.text.length),
  'every candidate carries text to splice');
expect(moves.every((m) => typeof m.rationale === 'string'),
  'every candidate carries a rationale for the picker to show');

// The engine ranks a CLOSING move first when one exists (`fn X => X` closes this
// trivial goal outright). For the state-transition tests below we want a move
// that leaves a hole, so the successor state is non-trivial.
const openIntro = moves.find((m) => m.kind === 'intro' && m.text.includes('?'));
expect(openIntro, 'the engine offers an intro that leaves a hole to continue from');

// ── 3. a REJECTED move leaves the state untouched and reports why ───────────
const rejectOracle = async () => ({
  ok: false,
  output: 'File "input.bel", line 11, column 1:\nError: Type-checking error. mismatch',
});
const rejected = await applyMove(s0, openIntro, rejectOracle, thm);
expect(rejected.ok === false, 'a move the checker refuses does not apply');
expect(rejected.state === s0, 'a rejected move returns the SAME state object');
expect(/Error/.test(rejected.error || ''), `the checker's objection is surfaced, got: ${rejected.error}`);

// ── 4. an ACCEPTED move advances the state ──────────────────────────────────
// The stub accepts and reports one remaining hole, one line further in.
const acceptOracle = async (code) => {
  const ln = code.split('\n').findIndex((l) => l.includes('?')) + 1;
  if (!ln) return { ok: true, output: 'no holes here' };
  return {
    ok: true,
    output: holeReport(ln, 1, '[ |- nat]', [{ name: 'x', type: '[ |- nat]' }]),
  };
};
const applied = await applyMove(s0, openIntro, acceptOracle, thm);
expect(applied.ok === true, `an accepted move applies; error was: ${applied.error}`);
const s1 = applied.state;
expect(s1 !== s0, 'apply returns a NEW state');
expect(s1.code !== s0.code, 'the working program advanced');
expect(s1.code.includes(openIntro.text.split('\n')[0].trim()),
  'the move text was spliced into the working program');
expect(s1.steps.length === 1, 'one step recorded');
expect(canUndo(s1), 'the snapshot stack grew');

// ── 5. THE STEP SHAPE — what the reel / tree / derivation list consume ──────
const step = s1.steps[0];
for (const f of ['move', 'lead', 'rationale', 'meta', 'checks', 'goal', 'hole', 'text', 'status']) {
  expect(step[f] !== undefined, `step carries \`${f}\` (auto-solve's shape)`);
}
expect(step.move === 'intro', `step.move is the move kind, got ${step.move}`);
expect(step.meta && step.meta.kind === 'intro', 'step.meta is the stepMeta record');
expect(typeof step.lead === 'string' && step.lead.length, 'step.lead is a human caption');
expect(step.checks === 1, 'a manual move costs exactly one certify');
expect(step.status === 'open', 'a step leaving holes is `open`');
expect(step.manual === true, 'a manual step is marked, so the UI can distinguish it');
expect(Array.isArray(step.holeCtx) && Array.isArray(step.holeMeta),
  'the binder snapshots are arrays (the tree reads them)');
// Auto-only fields must be ABSENT, not faked.
expect(step.focus === undefined && step.zp === undefined,
  'auto-only search metadata is omitted rather than invented');

// ── 6. undo / redo round-trips exactly ──────────────────────────────────────
const back = undo(s1);
expect(back.code === s0.code, 'undo restores the previous working program');
expect(back.steps.length === 0, 'undo drops the step');
expect(back.focusIdx === s0.focusIdx, 'undo restores the focus');
expect(canRedo(back), 'undo makes a redo available');
const fwd = redo(back);
expect(fwd.code === s1.code, 'redo restores the advanced program');
expect(fwd.steps.length === 1, 'redo restores the step');
expect(!canRedo(fwd), 'the redo future is consumed');
// A fresh move after undo must PURGE the redo future (Harpoon's history is
// linear, not a tree — doc/harpoon/undo.rst).
const branched = await applyMove(back, openIntro, acceptOracle, thm);
expect(branched.ok && !canRedo(branched.state), 'a new move purges the redo future');

// ── 6b. a pre-verified move is not re-checked ───────────────────────────────
// The background sweep certifies a tactic by actually splicing and checking it,
// which produces the spliced program AND the hole report the successor state is
// built from. Applying that same tactic must REUSE that, not pay for it twice.
let oracleCalls = 0;
const countingOracle = async (code) => { oracleCalls += 1; return acceptOracle(code); };
const pre = await attemptMove(s0, openIntro, countingOracle, thm);
expect(pre.ok, 'the sweep certifies the move');
expect(pre.forCode === s0.code, 'the result is stamped with the program it was reached against');
const callsAfterSweep = oracleCalls;
const reused = await applyMove(s0, openIntro, countingOracle, thm, pre);
expect(reused.ok, 'applying a pre-verified move succeeds');
expect(oracleCalls === callsAfterSweep, 'applying a pre-verified move costs ZERO extra checks');
expect(reused.state.code === pre.spliced, 'and lands the exact program the sweep produced');
expect(reused.state.steps.length === 1, 'with the step recorded as normal');

// A cache from a DIFFERENT program must be refused — otherwise an intervening
// move could splice stale text into the proof.
const stale = { ...pre, forCode: 'some other program' };
const beforeStale = oracleCalls;
const refused = await applyMove(s0, openIntro, countingOracle, thm, stale);
expect(refused.ok, 'the move still applies');
expect(oracleCalls > beforeStale, 'a cache stamped for another program is re-checked, not trusted');

// ── 7. completion ───────────────────────────────────────────────────────────
const doneOracle = async () => ({ ok: true, output: 'no holes here' });
const done = await applyMove(s0, openIntro, doneOracle, thm);
expect(done.ok, 'the closing move applies');
expect(isComplete(done.state), 'a state with zero holes is complete');
expect(focusHole(done.state) === null, 'a complete state has no focus hole');
expect(done.state.steps[0].status === 'solved', 'a step closing the last hole is `solved`');

// ── 8. split arm pruning — the reason splits certify at all ─────────────────
// Splits are emitted with EVERY constructor's arm; Beluga rejects arms its
// coverage checker infers impossible and expects them omitted. The reducer must
// drop the arm the error points into and retry, exactly as the search does.
const splitMv = {
  kind: 'split',
  scrutinee: 'x',
  rationale: 'case-analyse x',
  text: 'case x of\n| z => ?\n| s M => ?',
};
let attempts = 0;
const pruningOracle = async (code) => {
  attempts += 1;
  const holeLine = code.split('\n').findIndex((l) => l.includes('?')) + 1;
  // Reject while the `s M` arm is present; the error points at its line.
  if (code.includes('| s M =>')) {
    const bad = code.split('\n').findIndex((l) => l.includes('| s M =>')) + 1;
    return { ok: false, output: `File "input.bel", line ${bad}, column 3:\nError: coverage` };
  }
  return { ok: true, output: holeReport(holeLine, 1, '[ |- nat]') };
};
const pruned = await attemptMove(s0, splitMv, pruningOracle, thm);
expect(pruned.ok === true, `the split certifies after pruning; error: ${pruned.error}`);
expect(!pruned.text.includes('| s M =>'), 'the offending arm was pruned from the move text');
expect(pruned.text.includes('| z =>'), 'the surviving arm was kept');
expect(attempts > 1, 'pruning re-verified rather than accepting the first verdict');

// ── 9. Brutus folds into the SAME trail ─────────────────────────────────────
// A mid-proof auto-solve must read as a continuation, not a separate event.
const autoResult = {
  complete: true,
  code: CODE.replace('?', 'fn x => x'),
  steps: [{ move: 'fill', lead: 'closed nat', meta: { kind: 'fill' }, checks: 4, status: 'solved' }],
};
const absorbed = absorbAuto(s1, autoResult, thm);
expect(absorbed.steps.length === 2, 'Brutus’s steps append onto the manual trail');
expect(absorbed.steps[0].manual === true && absorbed.steps[1].manual === undefined,
  'manual and Brutus steps stay distinguishable inside one trail');
expect(isComplete(absorbed), 'a completing Brutus run leaves no holes');
expect(canUndo(absorbed), 'a Brutus run is one undoable event');
expect(undo(absorbed).code === s1.code, 'undoing Brutus returns to the manual state it started from');

// ── 10. focus selection (Harpoon's `defer` / subgoal list) ──────────────────
const twoHoles = manualState(
  CODE,
  thm,
  holeReport(HOLE_LINE, 1, '[ |- nat]') + holeReport(HOLE_LINE, 3, '[ |- nat]'),
);
expect(twoHoles.holes.length === 2, `two holes parsed, got ${twoHoles.holes.length}`);
const moved = focusOn(twoHoles, 1);
expect(moved.focusIdx === 1, 'the user can select another subgoal');
expect(moved.code === twoHoles.code, 'selecting a subgoal does not touch the program');
expect(focusOn(twoHoles, 9) === twoHoles, 'an out-of-range focus is a no-op');

console.log('test-prover-manual: OK');
