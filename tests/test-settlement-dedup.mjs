import { createSemanticSession } from '../editor-src/semantic/semantic-session.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

let loadCalls = 0;
const CODE = 'LF o : type =\n  | ⊤ : o\n;\n';
const FP = 'fp-test';

const client = {
  fingerprint: () => FP,
  loadChecker: async () => {
    loadCalls += 1;
    return '';
  },
};

const session = createSemanticSession(client);
session.markLoaded(FP, CODE);
const first = await session.ensureLoaded(CODE);
expect(first.cached === true, 'markLoaded should satisfy ensureLoaded without load');
expect(loadCalls === 0, `ensureLoaded after markLoaded must not load, got ${loadCalls}`);

session.invalidate();
loadCalls = 0;
await session.ensureLoaded(CODE);
expect(loadCalls === 1, 'ensureLoaded after invalidate should load once');

console.log('OK settlement dedup (session markLoaded skips redundant loadChecker)');
