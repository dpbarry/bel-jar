import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));

function loadModule(path) {
  const src = readFileSync(join(here, '..', path), 'utf8');
  const fakeWindow = {};
  // eslint-disable-next-line no-new-func
  new Function('window', src)(fakeWindow);
  return fakeWindow;
}

const { listActiveSuites } = loadModule('js/library-suites.js').BelJarLibrarySuites;

const files = [
  { id: 'a', name: 'grp/a.bel' },
  { id: 'b', name: 'grp/b.bel' },
  { id: 'c1', name: 'grp/one.cfg' },
  { id: 'c2', name: 'grp/two.cfg' },
  { id: 'x', name: 'other/x.bel' },
  { id: 'xc', name: 'other/suite.cfg' },
];

const activeByDir = { grp: 'grp/two.cfg', other: 'other/suite.cfg' };

const suites = listActiveSuites({
  listFiles: () => files,
  getActiveCfgForDir: (dir) => activeByDir[dir] || null,
});

expect(suites.length === 2, 'two active suites');
expect(suites[0].cfgPath === 'grp/two.cfg' || suites[1].cfgPath === 'grp/two.cfg', 'grp active cfg used not one.cfg');
expect(suites.some((s) => s.dir === 'other' && s.cfgPath === 'other/suite.cfg'), 'other suite listed');

const none = listActiveSuites({
  listFiles: () => files,
  getActiveCfgForDir: () => null,
});
expect(none.length === 0, 'no active cfg → empty');

const stale = listActiveSuites({
  listFiles: () => [{ id: 'c', name: 'm/t.cfg' }],
  getActiveCfgForDir: () => 'm/missing.cfg',
});
expect(stale.length === 0, 'stale active cfg path excluded');

const multi = listActiveSuites({
  listFiles: () => files,
  getActiveCfgsForDir: (dir) => (dir === 'grp' ? ['grp/one.cfg', 'grp/two.cfg'] : ['other/suite.cfg']),
});
expect(multi.length === 3, 'multi-active per dir lists each cfg');

console.log('OK library suites');
