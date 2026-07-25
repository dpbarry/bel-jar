import {
  buildHoleDisplayRows,
  fileInActiveDevelopment,
  goalsSemanticallyEqual,
  holesBannerFromRows,
  resolveHoleGoalDisplay,
  storedGoalAt,
} from '../js/editor-src/prover/hole-goal-display.mjs';
import { getHoleGoalsStore } from '../js/editor-src/prover/hole-goals-store.mjs';
import { fileContentSig } from '../js/editor-src/semantic/development-check.mjs';
import { approximateHoleGoal } from '../js/editor-src/prover/prover-orchestrator.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

getHoleGoalsStore().clear();

const src = 'rec g : [ |- nat] =\n?\n;';
const sig = fileContentSig(src);
getHoleGoalsStore().set('a.bel', sig, [{ line: 2, col: 1, goal: '[ |- nat]', index: 0 }]);

expect(storedGoalAt('a.bel', src, 2, 1) === '[ |- nat]', 'stored goal hit');
expect(storedGoalAt('a.bel', src + ' ', 2, 1) === null, 'edited text misses store');

const otherSig = fileContentSig(src);
getHoleGoalsStore().set('other.bel', otherSig, [{ line: 2, col: 1, goal: '[ |- nat]', index: 0 }]);

const rechecking = resolveHoleGoalDisplay({
  inDevelopment: true,
  settleState: 'checking',
  storedGoal: '[ |- nat]',
  settlementGoal: '[ |- bool]',
});
expect(rechecking.state === 'rechecking', 'in-dev checking prefers store over carried settlement');
expect(rechecking.loadingLive === true, 'rechecking is loading');

expect(
  resolveHoleGoalDisplay({
    inDevelopment: true,
    settleState: 'ready',
    storedGoal: null,
    settlementGoal: '[ |- bool]',
  }).goal === '[ |- bool]',
  'in-dev ready falls back to settlement',
);

expect(
  resolveHoleGoalDisplay({
    inDevelopment: false,
    settleState: null,
    storedGoal: '[ |- nat]',
    settlementGoal: '[ |- bool]',
  }).state === 'cached',
  'out-of-dev store reads as cached',
);

expect(
  resolveHoleGoalDisplay({
    inDevelopment: false,
    settleState: null,
    storedGoal: null,
    settlementGoal: '[ |- bool]',
  }).state === 'out-of-scope',
  'out-of-dev without store or approx is out-of-scope',
);

const outApprox = resolveHoleGoalDisplay({
  inDevelopment: false,
  settleState: null,
  storedGoal: null,
  settlementGoal: null,
  approximateGoal: '[ |- nat]',
});
expect(
  outApprox.goal === '[ |- nat]'
    && outApprox.state === 'approximate'
    && outApprox.loadingLive === false,
  'out-of-dev still shows syntactic approximate without Beluga',
);

expect(fileInActiveDevelopment('a.bel', ['a.bel', 'b.bel']), 'member in active dev paths');
expect(!fileInActiveDevelopment('c.bel', ['a.bel']), 'non-member excluded');
expect(fileInActiveDevelopment('a.bel', ['a.bel']), 'standalone member in its dev');

const approx = resolveHoleGoalDisplay({
  inDevelopment: true,
  settleState: 'checking',
  storedGoal: null,
  settlementGoal: null,
  approximateGoal: '[ |- nat]',
});
expect(approx.state === 'approximate' && approx.goal === '[ |- nat]' && approx.loadingLive, 'approximate tier');

expect(
  resolveHoleGoalDisplay({
    inDevelopment: true,
    settleState: 'ready',
    storedGoal: '[ |- nat]',
    settlementGoal: '[ |- bool]',
    approximateGoal: '[ |- nat]',
  }).state === 'live',
  'store wins over approximate when not checking',
);

expect(approximateHoleGoal(src, 2, 1) === '[ |- nat]', 'top-level approximate goal');
expect(approximateHoleGoal('rec f : [ |- nat] =\nfn x => ?\n;', 2, 1) === null, 'nested hole has no approximate');

const rows = buildHoleDisplayRows({
  fileName: 'other.bel',
  fileText: src,
  inDevelopment: false,
  settleState: null,
  syntacticHoles: [{ line: 2, col: 1, index: 0, from: 0, to: 1 }],
});
expect(rows.length === 1 && rows[0].goalState === 'cached', 'cross-dev row uses cached store');
expect(holesBannerFromRows(rows, { inDevelopment: false }) === true, 'hint flag when out of dev');

const freshOut = buildHoleDisplayRows({
  fileName: 'fresh-out.bel',
  fileText: src,
  inDevelopment: false,
  settleState: null,
  syntacticHoles: [{ line: 2, col: 1, index: 0, from: 0, to: 1 }],
});
expect(
  freshOut[0].goalState === 'approximate'
    && freshOut[0].goal === '[ |- nat]'
    && freshOut[0].loadingLive === false,
  'out-of-dev row shows syntactic approximate without Beluga',
);

const approxRows = buildHoleDisplayRows({
  fileName: 'fresh.bel',
  fileText: src,
  inDevelopment: true,
  settleState: 'idle',
  syntacticHoles: [{ line: 2, col: 1, index: 0, from: 0, to: 1 }],
});
expect(approxRows[0].goalState === 'approximate', 'build rows picks approximate when pending');

expect(goalsSemanticallyEqual('[ |- nat]', '[⊢ nat]'), 'cosmetic bracket spacing compares equal');
expect(
  resolveHoleGoalDisplay({
    inDevelopment: true,
    settleState: 'ready',
    storedGoal: null,
    settlementGoal: '[⊢ nat]',
    approximateGoal: '[ |- nat]',
  }).goal === '[ |- nat]',
  'ready keeps approximate display when settlement only differs cosmetically',
);
expect(
  resolveHoleGoalDisplay({
    inDevelopment: true,
    settleState: 'checking',
    storedGoal: '[⊢ nat]',
    settlementGoal: null,
    approximateGoal: '[ |- nat]',
  }).goal === '[ |- nat]',
  'rechecking keeps approximate display when store only differs cosmetically',
);

console.log('OK hole-goal-display');
