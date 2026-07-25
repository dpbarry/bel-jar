import { mapProveHolesToDocHits, proveOrchestrationCode } from '../js/editor-src/prover/prover-orchestrator.mjs';
import { getHoleGoalsStore } from '../js/editor-src/prover/hole-goals-store.mjs';
import { fileContentSig } from '../js/editor-src/semantic/development-check.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const suite = [
  'bool : type.',
  'rec dual_sym : [ |- nat] =',
  '?',
  ';',
  'rec dual_uniq : [ |- bool] =',
  '?',
  ';',
].join('\n');
const fileStart = suite.indexOf('bool : type.');
const uniqStart = suite.indexOf('rec dual_uniq');
const uniqEnd = suite.indexOf(';', uniqStart) + 1;
const proveCode = proveOrchestrationCode(suite, 'dual_uniq', uniqStart, uniqEnd, fileStart);
const parsed = [
  { line: 4, col: 1, goal: '[ |- bool]', index: 0, ctx: [], meta: [] },
];
const docHits = [{ hole: { line: 6, col: 1 }, from: 0, to: 1 }];
const mapped = mapProveHolesToDocHits(parsed, proveCode, 'dual_uniq', docHits);
expect(mapped.length === 1, 'maps one hole');
expect(mapped[0].line === 6 && mapped[0].col === 1, `doc line/col kept (got ${mapped[0].line}:${mapped[0].col})`);
expect(mapped[0].goal === '[ |- bool]', 'goal carried from checker');

getHoleGoalsStore().clear();
const src = 'rec a : [ |- nat] = ?;\nrec b : [ |- bool] = ?;';
const sig = fileContentSig(src);
getHoleGoalsStore().merge('main.bel', sig, [{ line: 1, col: 1, goal: '[ |- nat]', index: 0 }]);
getHoleGoalsStore().merge('main.bel', sig, [{ line: 2, col: 1, goal: '[ |- bool]', index: 0 }]);
const holes = getHoleGoalsStore().fresh('main.bel', sig);
expect(holes?.length === 2, 'merge keeps both theorems');
expect(holes[0].goal === '[ |- nat]' && holes[1].goal === '[ |- bool]', 'both goals preserved');

console.log('test-certify-hole-goals: ok');
