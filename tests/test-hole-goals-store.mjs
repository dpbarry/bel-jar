import {
  createHoleGoalsStore,
  getHoleGoalsStore,
  syncHoleGoalsFromDevelopment,
  syncHoleGoalsFromSettlement,
} from '../js/editor-src/prover/hole-goals-store.mjs';
import { fileContentSig } from '../js/editor-src/semantic/development-check.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

{
  const store = createHoleGoalsStore();
  const sigA = fileContentSig('rec g : [ |- nat] = ?;');
  store.set('a.bel', sigA, [{ line: 2, col: 1, goal: '[ |- nat]' }]);
  expect(store.fresh('a.bel', sigA)?.[0].goal === '[ |- nat]', 'fresh hit returns stored goal');
  expect(store.fresh('a.bel', fileContentSig('edited')) === null, 'edited text → miss');
}

getHoleGoalsStore().clear();

syncHoleGoalsFromDevelopment(
  [{ name: 'b.bel', text: 'rec h : [ |- nat] = ?;' }],
  { 'b.bel': [{ line: 2, col: 1, goal: '[ |- bool]' }] },
);
expect(
  getHoleGoalsStore().fresh('b.bel', fileContentSig('rec h : [ |- nat] = ?;'))?.[0].goal === '[ |- bool]',
  'development sync writes per-file goals',
);

syncHoleGoalsFromSettlement(
  { activeFileName: 'c.bel', fileCode: 'rec x : [ |- nat] = ?;' },
  { state: 'ready', holes: [{ line: 2, col: 1, goal: '[ |- nat]' }], memberHoles: {} },
  () => '',
);
expect(
  getHoleGoalsStore().fresh('c.bel', fileContentSig('rec x : [ |- nat] = ?;'))?.[0].goal === '[ |- nat]',
  'settlement sync writes active-file goals',
);

console.log('ok   test-hole-goals-store.mjs');
