import {
  buildHoleDisplayRows,
  fileInActiveDevelopment,
  holesBannerFromRows,
  resolveHoleGoalDisplay,
  storedGoalAt,
} from '../editor-src/hole-goal-display.mjs';
import { getHoleGoalsStore } from '../editor-src/hole-goals-store.mjs';
import { fileContentSig } from '../editor-src/development-check.mjs';

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

expect(
  resolveHoleGoalDisplay({
    inDevelopment: true,
    settleState: 'checking',
    storedGoal: '[ |- nat]',
    settlementGoal: '[ |- bool]',
  }).state === 'rechecking',
  'in-dev checking prefers store over carried settlement',
);

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
  'out-of-dev without store is out-of-scope',
);

expect(fileInActiveDevelopment('a.bel', ['a.bel', 'b.bel']), 'member in active dev paths');
expect(!fileInActiveDevelopment('c.bel', ['a.bel']), 'non-member excluded');
expect(fileInActiveDevelopment('a.bel', ['a.bel']), 'standalone member in its dev');

const rows = buildHoleDisplayRows({
  fileName: 'other.bel',
  fileText: src,
  inDevelopment: false,
  settleState: null,
  syntacticHoles: [{ line: 2, col: 1, index: 0, from: 0, to: 1 }],
});
expect(rows.length === 1 && rows[0].goalState === 'cached', 'cross-dev row uses cached store');
expect(holesBannerFromRows(rows, { inDevelopment: false }) === true, 'hint flag when out of dev');

console.log('OK hole-goal-display');
