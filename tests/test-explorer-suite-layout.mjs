import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function loadScript(path) {
  const src = readFileSync(join(root, path), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', src)(globalThis);
}

loadScript('js/project-source.js');
loadScript('js/explorer-suite-layout.js');

const L = globalThis.BelJarExplorerSuiteLayout;
const PS = globalThis.BelJarProjectSource;
expect(L && typeof L.computeDirLayout === 'function', 'layout module loaded');

const files = [
  { id: 'c1', name: 'grp/a.cfg', baseName: 'a.cfg' },
  { id: 'c2', name: 'grp/b.cfg', baseName: 'b.cfg' },
  { id: 'p', name: 'grp/prelude.elf', baseName: 'prelude.elf' },
  { id: 'a', name: 'grp/base.bel', baseName: 'base.bel' },
  { id: 'b', name: 'grp/use.bel', baseName: 'use.bel' },
  { id: 'x', name: 'grp/x.bel', baseName: 'x.bel' },
  { id: 'y', name: 'grp/y.bel', baseName: 'y.bel' },
];

const texts = {
  c1: 'prelude.elf\nuse.bel\nbase.bel',
  c2: 'x.bel\ny.bel',
  p: '', a: '', b: '', x: '', y: '',
};
const getText = (id) => texts[id] || '';
const resolveMembers = (all, cfgPath, gt) => PS.orderedPathsForCfg(all, cfgPath, gt || getText);

// Single active suite: cfg → members → inactive cfg → orphan
{
  const layout = L.computeDirLayout(files, ['grp/a.cfg'], resolveMembers, files, getText);
  const names = layout.orderedFiles.map((f) => f.name);
  expect(names.join('|') === 'grp/a.cfg|grp/prelude.elf|grp/use.bel|grp/base.bel|grp/b.cfg|grp/x.bel|grp/y.bel',
    `single suite order; got ${names.join('|')}`);
  expect(layout.suiteByFile['grp/a.cfg'].role === 'head', 'cfg is head');
  expect(layout.suiteByFile['grp/base.bel'].role === 'tail', 'last member is tail');
  expect(layout.suiteByFile['grp/b.cfg'] === undefined, 'inactive cfg has no spine');
}

// Two disjoint active suites
{
  const layout = L.computeDirLayout(files, ['grp/a.cfg', 'grp/b.cfg'], resolveMembers, files, getText);
  const names = layout.orderedFiles.map((f) => f.name);
  expect(names.join('|') === 'grp/a.cfg|grp/prelude.elf|grp/use.bel|grp/base.bel|grp/b.cfg|grp/x.bel|grp/y.bel',
    `two suites stacked; got ${names.join('|')}`);
  expect(layout.suiteByFile['grp/b.cfg'].suiteIndex === 1, 'second suite index');
  expect(layout.suiteByFile['grp/x.bel'].role === 'mid', 'x is mid');
  expect(layout.suiteByFile['grp/y.bel'].role === 'tail', 'y is tail');
}

// Empty suite (cfg only)
{
  const solo = [{ id: 'c', name: 'solo/t.cfg', baseName: 't.cfg' }];
  const layout = L.computeDirLayout(solo, ['solo/t.cfg'], resolveMembers, solo, () => '');
  expect(layout.orderedFiles.length === 1, 'solo cfg only');
  expect(layout.suiteByFile['solo/t.cfg'].role === 'solo', 'solo role');
}

// Disjoint activation check
{
  const ok = L.canActivateCfg('grp/b.cfg', ['grp/a.cfg'], files, getText, resolveMembers);
  expect(ok.ok === true, 'disjoint suites can co-activate');
  const overlap = L.canActivateCfg('grp/b.cfg', ['grp/a.cfg'], files, (id) => {
    if (id === 'c1') return 'prelude.elf\nx.bel\nbase.bel';
    return texts[id] || '';
  }, resolveMembers);
  expect(overlap.ok === false, 'intersecting suites rejected');
}

console.log('OK explorer suite layout');
