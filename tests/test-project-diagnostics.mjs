import {
  createProjectDiagnostics,
  makeHealthKey,
  healthKeyFromParts,
  computeFileHealthKey,
  preludeMembersFor,
  _resetProjectDiagnosticsForTests,
} from '../js/editor-src/semantic/project-diagnostics.mjs';
import { fileContentSig, developmentSignature } from '../js/editor-src/semantic/development-check.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

_resetProjectDiagnosticsForTests(null);

const index = createProjectDiagnostics();
const members = [
  { id: 'a', name: 'base.bel', text: 'LF a : type =\n;' },
  { id: 'b', name: 'use.bel', text: 'LF b : type =\n;' },
  { id: 'c', name: 'later.bel', text: 'LF c : type =\n;' },
];
const files = members.map((m) => ({ id: m.id, name: m.name }));
index.registerFiles(members);

function keyFor(m) {
  return healthKeyFromParts({
    scopeKey: 'module:suite.cfg',
    text: m.text,
    preludeMembers: preludeMembersFor(members, m.id).map((p) => ({
      id: p.id,
      name: p.name,
      text: p.text,
    })),
  });
}

// 1. Active live errors → dot; live clean → no dot (instant).
index.setActiveLive('c', [{ line: 2, message: 'boom', severity: 'error' }], { fileName: 'later.bel' });
expect(index.severity('c') === 'error', 'active live errors light the open file');
index.setActiveLive('c', [], { fileName: 'later.bel' });
expect(index.severity('c') === null, 'active live clean clears instantly');

// 2. Leave with errors → inactive still shows; leave clean → inactive clean.
index.setActiveObservation('b', [{ line: 1, message: 'bad', severity: 'error' }], {
  fileName: 'use.bel',
  key: keyFor(members[1]),
});
index.clearActiveLive();
expect(index.forFile('b', { currentKey: keyFor(members[1]) }).errors === 1,
  'left file remembers errors while keys match');

index.setActiveObservation('a', [], {
  fileName: 'base.bel',
  key: keyFor(members[0]),
});
index.clearActiveLive();
expect(index.forFile('a', { currentKey: keyFor(members[0]) }).errors === 0,
  'left file remembers clean while keys match');

// 3. Edit own content → remembered fault dropped.
index.setObservation('b', [{ line: 1, message: 'bad', severity: 'error' }], {
  fileName: 'use.bel',
  key: keyFor(members[1]),
  source: 'live',
});
expect(index.forFile('b', { currentKey: keyFor(members[1]) }).errors === 1, 'seed before edit');
const keyBEdited = healthKeyFromParts({
  scopeKey: 'module:suite.cfg',
  text: members[1].text + '\n% x',
  preludeMembers: preludeMembersFor(members, 'b'),
});
expect(index.forFile('b', { currentKey: keyBEdited }).errors === 0,
  'own content change drops observation on key mismatch');

// 4. Edit prelude member → dependent’s observation dropped (key mismatch).
index.setObservation('b', [{ line: 1, message: 'bad', severity: 'error' }], {
  fileName: 'use.bel',
  key: keyFor(members[1]),
  source: 'live',
});
const newPrelude = [{ id: 'a', name: 'base.bel', text: members[0].text + '\n% pre' }];
const keyBAfterPrelude = healthKeyFromParts({
  scopeKey: 'module:suite.cfg',
  text: members[1].text,
  preludeMembers: newPrelude,
});
expect(keyBAfterPrelude !== keyFor(members[1]), 'prelude edit changes key');
expect(index.forFile('b', { currentKey: keyBAfterPrelude }).errors === 0,
  'prelude change drops remembered fault');

// 5. Banner / foreign suite never in activeLive rows (publisher responsibility —
//    store just shows what it is given).
index.setActiveLive('c', [], { fileName: 'later.bel' });
expect(index.severity('c') === null, 'empty active live is clean');
index.clearActiveLive();

// 6. Development observation; live settle for same key overwrites.
const keyC = keyFor(members[2]);
index.setObservation('c', [{ line: 3, message: 'from-dev', severity: 'error' }], {
  fileName: 'later.bel',
  key: keyC,
  source: 'development',
});
expect(index.forFile('c', { currentKey: keyC }).items[0].msg === 'from-dev',
  'development observation paints never-opened/inactive');
index.clearActiveLive();
index.setObservation('c', [], {
  fileName: 'later.bel',
  key: keyC,
  source: 'live',
});
expect(index.forFile('c', { currentKey: keyC }).errors === 0,
  'live observation overwrites development for same key');

// Development must not override live for same key.
index.setObservation('c', [{ line: 1, message: 'live-err', severity: 'error' }], {
  fileName: 'later.bel',
  key: keyC,
  source: 'live',
});
index.setObservation('c', [{ line: 9, message: 'dev-ghost', severity: 'error' }], {
  fileName: 'later.bel',
  key: keyC,
  source: 'development',
});
expect(index.forFile('c', { currentKey: keyC }).items[0].msg === 'live-err',
  'development cannot override live for the same key');

// forgetScope / forget
index.forget('c');
expect(index.forFile('c', { currentKey: keyC }).errors === 0, 'forget clears');

// makeHealthKey / computeFileHealthKey smoke
const k = makeHealthKey('module:x.cfg', fileContentSig('hi'), developmentSignature([]));
expect(typeof k === 'string' && k.includes('module:x.cfg'), 'makeHealthKey shape');
expect(preludeMembersFor(members, 'c').map((m) => m.id).join(',') === 'a,b',
  'preludeMembersFor prefix');
expect(typeof computeFileHealthKey === 'function', 'computeFileHealthKey exported');

console.log('OK project-diagnostics observation store contract');
