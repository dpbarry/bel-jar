import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { holeHostFile, scanFileHoles } from '../editor-src/harpoon-project-goals.mjs';

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
loadScript('js/harpoon-project-goals.js');

const PG = globalThis.BelJarHarpoonProjectGoals;
const PS = globalThis.BelJarProjectSource;
expect(PG && typeof PG.buildSections === 'function', 'project goals module loaded');

expect(holeHostFile('a.bel') && holeHostFile('p.elf'), 'hole host extensions');
expect(!holeHostFile('a.cfg'), 'cfg is not a hole host');

const srcWithHole = 'rec id : [ |- nat] =\n?\n;';
const holes = scanFileHoles(srcWithHole);
expect(holes.length === 1, `scan finds syntactic hole (got ${holes.length})`);
expect(holes[0].line === 2, `hole line (got ${holes[0].line})`);

const files = [
  { id: 'c1', name: 'grp/a.cfg', baseName: 'a.cfg' },
  { id: 'p', name: 'grp/prelude.elf', baseName: 'prelude.elf' },
  { id: 'a', name: 'grp/base.bel', baseName: 'base.bel' },
  { id: 'b', name: 'grp/use.bel', baseName: 'use.bel' },
  { id: 'x', name: 'grp/x.bel', baseName: 'x.bel' },
];

const texts = {
  c1: 'prelude.elf\nuse.bel\nbase.bel',
  p: '',
  a: 'rec g : [ |- nat] =\n?\n;',
  b: '',
  x: 'rec h : [ |- nat] =\n?\n;',
};

globalThis.BelJarEditor = {
  holeHostFile,
  scanFileHoles,
};

const getText = (id) => texts[id] || '';
const activeCfgsByDir = { grp: ['grp/a.cfg'] };

const model = PG.buildSections({
  files,
  getText,
  getActiveCfgsForDir: (dir) => activeCfgsByDir[dir] || [],
  computeDirLayout: (dir, filesInDir) => {
    const SL = globalThis.BelJarExplorerSuiteLayout;
    const active = activeCfgsByDir[dir] || [];
    const resolver = (all, cfgPath, gt) => PS.orderedPathsForCfg(all, cfgPath, gt || getText);
    return SL.computeDirLayout(filesInDir, active, resolver, files, getText);
  },
});

expect(model.totalCount === 2, `suite + orphan holes (got ${model.totalCount})`);
expect(model.sections.length === 1, 'one section per directory');
expect(model.sections[0].label === 'grp', `dir label (got ${model.sections[0].label})`);
expect(model.sections[0].entries.length === 2, 'suite and orphan holes in same section');
expect(model.sections[0].entries[0].suiteLabel === 'a', `suite on entry (got ${model.sections[0].entries[0].suiteLabel})`);
expect(model.sections[0].entries[0].filePath === 'grp/base.bel', 'hole from suite member');
expect(model.sections[0].entries[1].suiteLabel == null, 'orphan entry has no suite');
expect(model.sections[0].entries[1].filePath === 'grp/x.bel', 'orphan hole listed in same section');

const orphanModel = PG.buildSections({
  files,
  getText,
  getActiveCfgsForDir: () => [],
  computeDirLayout: (dir, filesInDir) => {
    const SL = globalThis.BelJarExplorerSuiteLayout;
    return SL.computeDirLayout(filesInDir, [], null, files, getText);
  },
});

expect(orphanModel.totalCount === 2, `orphan holes in both bel files (got ${orphanModel.totalCount})`);
expect(orphanModel.sections.length === 1, 'one orphan section');
expect(orphanModel.sections[0].label === 'grp', 'orphan section labeled by dir');

{
  const twoDirFiles = [
    ...files,
    { id: 'o', name: 'other/z.bel', baseName: 'z.bel' },
  ];
  const twoTexts = { ...texts, o: 'rec z : [ |- nat] =\n?\n;' };
  const twoGetText = (id) => twoTexts[id] || '';
  const activeFirst = PG.buildSections({
    files: twoDirFiles,
    getText: twoGetText,
    activeFileId: 'o',
    getActiveCfgsForDir: () => [],
    computeDirLayout: (dir, filesInDir) => {
      const SL = globalThis.BelJarExplorerSuiteLayout;
      return SL.computeDirLayout(filesInDir, [], null, twoDirFiles, twoGetText);
    },
  });
  expect(twoDirFiles.length && activeFirst.sections.length === 2, 'two dir sections');
  expect(activeFirst.sections[0].label === 'other', `active dir first (got ${activeFirst.sections[0].label})`);
  expect(activeFirst.sections[1].label === 'grp', 'other dirs follow alphabetically');
}

console.log('test-harpoon-project-goals: ok');
