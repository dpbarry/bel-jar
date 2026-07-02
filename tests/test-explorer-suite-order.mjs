// Phase 4 / C1: the explorer lists active-suite blocks (cfg → members in load
// order), then inactive cfgs and orphans. buildExplorerModel is pure (no DOM).
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
loadScript('js/explorer-tree.js');

const EX = globalThis.BelJarExplorer;
const PS = globalThis.BelJarProjectSource;
expect(EX && typeof EX.buildExplorerModel === 'function', 'BelJarExplorer.buildExplorerModel exported');

const files = [
  { id: 'cfg', name: 'grp/sources.cfg' },
  { id: 'a', name: 'grp/base.bel' },
  { id: 'b', name: 'grp/use.bel' },
  { id: 'z', name: 'grp/zzz.bel' },
  { id: 'p', name: 'grp/prelude.elf' },
  { id: 'alt', name: 'grp/alt.cfg' },
];

const texts = {
  cfg: 'prelude.elf\nuse.bel\nbase.bel',
  alt: 'zzz.bel',
  p: '', a: '', b: '', z: '',
};
const getText = (id) => texts[id] || '';
const resolveMembers = (all, cfgPath, gt) => PS.orderedPathsForCfg(all, cfgPath, gt || getText);

const layoutForDir = (dir, filesInDir) => {
  const active = dir === 'grp' ? ['grp/sources.cfg'] : [];
  return globalThis.BelJarExplorerSuiteLayout.computeDirLayout(
    filesInDir, active, resolveMembers, files, getText,
  );
};

{
  const model = EX.buildExplorerModel(files, [], layoutForDir);
  const grp = model.folders.get('grp');
  const names = grp.files.map((f) => f.name);
  expect(names.join('|') === 'grp/sources.cfg|grp/prelude.elf|grp/use.bel|grp/base.bel|grp/alt.cfg|grp/zzz.bel',
    `stacked suite then inactive cfg then orphan; got: ${names.join('|')}`);
  expect(grp.suiteByFile['grp/sources.cfg'].role === 'head', 'cfg is spine head');
  expect(grp.suiteByFile['grp/base.bel'].role === 'tail', 'last member is tail');
  expect(grp.suiteByFile['grp/alt.cfg'] === undefined, 'inactive cfg has no spine');
}

{
  const model = EX.buildExplorerModel(files, [], null);
  const grp = model.folders.get('grp');
  const names = grp.files.map((f) => f.name);
  expect(names.join('|') === 'grp/alt.cfg|grp/sources.cfg|grp/base.bel|grp/prelude.elf|grp/use.bel|grp/zzz.bel',
    `no layout → legacy alphabetical buckets, got: ${names.join('|')}`);
}

console.log('OK explorer suite order (stacked blocks, alphabetical fallback)');
