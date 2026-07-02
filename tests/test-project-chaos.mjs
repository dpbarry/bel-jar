// Adversarial project / suite / cfg scenarios — must not throw, must surface
// correct diagnostics and consistent assembly order.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cfgDiagnosticsFor } from '../editor-src/bel-cfg-lint.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));

function loadPersist() {
  const storage = new Map();
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  const ctx = vm.createContext({ globalThis: {}, clearTimeout, setTimeout, TextEncoder, localStorage });
  ctx.globalThis = ctx;
  vm.runInContext(readFileSync(join(here, '..', 'js', 'persist.js'), 'utf8'), ctx);
  return { P: ctx.BelJarPersist, storage };
}

function loadPS() {
  const fakeWindow = {};
  // eslint-disable-next-line no-new-func
  new Function('window', readFileSync(join(here, '..', 'js', 'project-source.js'), 'utf8'))(fakeWindow);
  return fakeWindow.BelJarProjectSource;
}

const { P } = loadPersist();
const PS = loadPS();

function seed(files, activeCfgByDir = {}) {
  P.replaceProject(files.map((f) => ({ name: f.name, text: f.text })));
  for (const [dir, cfg] of Object.entries(activeCfgByDir)) {
    P.setActiveCfgForDir(dir, cfg);
  }
}

function names() {
  return new Set(P.listFiles().map((f) => f.name));
}

function textOf(name) {
  const f = P.listFiles().find((x) => x.name === name);
  return f ? P.getFileText(f.id) : '';
}

function getText(id) {
  return P.getFileText(id);
}

// ── happy path: nested folders, active suite, prelude order ─────────────────
{
  seed([
    { name: 'grp/base.bel', text: 'LF a : type;' },
    { name: 'grp/mid.bel', text: 'LF m : type;' },
    { name: 'grp/use.bel', text: 'LF b : type;' },
    { name: 'grp/one.cfg', text: 'base.bel\n' },
    { name: 'grp/two.cfg', text: 'base.bel\nmid.bel\nuse.bel\n' },
  ], { grp: 'grp/two.cfg' });

  const files = P.listFiles();
  const useId = files.find((f) => f.name === 'grp/use.bel').id;
  const prelude = PS.preludeFilesFor(files, useId, getText, {
    activeCfgForDir: (d) => P.getActiveCfgForDir(d),
  });
  expect(prelude.length === 2, 'prelude has base + mid before use');
  expect(prelude[0].name === 'grp/base.bel' && prelude[1].name === 'grp/mid.bel', 'prelude load order');

  P.setActiveCfgForDir('grp', 'grp/one.cfg');
  const orphanPre = PS.preludeFilesFor(files, useId, getText, {
    activeCfgForDir: (d) => P.getActiveCfgForDir(d),
  });
  const dev = PS.developmentForFile(files, useId, getText, {
    activeCfgForDir: (d) => P.getActiveCfgForDir(d),
  });
  expect(orphanPre.length === 0 && dev.kind === 'standalone', 'file not in active cfg → standalone, no prelude');
}

// ── two disjoint active suites in one folder ─────────────────────────────────
{
  seed([
    { name: 'grp/a.bel', text: 'LF a : type;' },
    { name: 'grp/b.bel', text: 'LF b : type;' },
    { name: 'grp/one.cfg', text: 'a.bel\n' },
    { name: 'grp/two.cfg', text: 'b.bel\n' },
  ]);
  P.addActiveCfgForDir('grp', 'grp/one.cfg');
  P.addActiveCfgForDir('grp', 'grp/two.cfg');
  const files = P.listFiles();
  const aId = files.find((f) => f.name === 'grp/a.bel').id;
  const bId = files.find((f) => f.name === 'grp/b.bel').id;
  const activeCfgsForDir = (d) => P.getActiveCfgsForDir(d);
  const devA = PS.developmentForFile(files, aId, getText, { activeCfgsForDir });
  const devB = PS.developmentForFile(files, bId, getText, { activeCfgsForDir });
  expect(devA.kind === 'module' && devA.cfg === 'grp/one.cfg', 'a.bel resolves to one.cfg');
  expect(devB.kind === 'module' && devB.cfg === 'grp/two.cfg', 'b.bel resolves to two.cfg');
}

// ── unassociated .bel: not in any cfg ───────────────────────────────────────
{
  seed([
    { name: 'solo.bel', text: 'LF solo : type;' },
    { name: 'grp/a.bel', text: 'LF a : type;' },
    { name: 'grp/suite.cfg', text: 'a.bel\n' },
  ], { grp: 'grp/suite.cfg' });

  const files = P.listFiles();
  const soloId = files.find((f) => f.name === 'solo.bel').id;
  const pre = PS.preludeFilesFor(files, soloId, getText, {
    activeCfgForDir: (d) => P.getActiveCfgForDir(d),
  });
  expect(!pre || pre.length === 0, 'orphan file has empty prelude');
  const dev = PS.developmentForFile(files, soloId, getText, {
    activeCfgForDir: (d) => P.getActiveCfgForDir(d),
  });
  expect(dev.kind === 'standalone', 'orphan is standalone development');
}

// ── rename updates cfg entry (no dangling lint) ───────────────────────────────
{
  seed([
    { name: 'grp/old.bel', text: 'LF a : type;' },
    { name: 'grp/suite.cfg', text: 'old.bel\n' },
  ], { grp: 'grp/suite.cfg' });
  const id = P.listFiles().find((f) => f.name === 'grp/old.bel').id;
  P.renameFile(id, 'grp/new.bel');
  const cfgText = textOf('grp/suite.cfg');
  const diags = cfgDiagnosticsFor(cfgText, 'grp/suite.cfg', names());
  expect(diags.length === 0, 'cfg updated after rename — no dangling entry');
  expect(cfgText.includes('new.bel') && !cfgText.includes('old.bel'), 'cfg lists renamed path');
}

// ── nested cfg with missing file ──────────────────────────────────────────────
{
  seed([
    { name: 'grp/base.bel', text: 'LF a : type;' },
    { name: 'grp/inner.cfg', text: 'missing.bel\n' },
    { name: 'grp/suite.cfg', text: 'base.bel\ninner.cfg\n' },
  ]);
  const diags = cfgDiagnosticsFor(textOf('grp/inner.cfg'), 'grp/inner.cfg', names());
  expect(diags.some((d) => d.severity === 'warning'), 'nested cfg missing entry warns');
}

// ── delete active cfg clears active pointer ───────────────────────────────────
{
  seed([
    { name: 'grp/a.bel', text: 'LF a : type;' },
    { name: 'grp/suite.cfg', text: 'a.bel\n' },
  ], { grp: 'grp/suite.cfg' });
  const cfgId = P.listFiles().find((f) => f.name === 'grp/suite.cfg').id;
  P.deleteFile(cfgId);
  expect(P.getActiveCfgsForDir('grp').length === 0, 'deleting active cfg clears pointer');
  expect(P.listFiles().length === 1, 'cfg file removed from registry');
}

// ── rapid create / delete / rename consistency ───────────────────────────────
{
  seed([]);
  const id1 = P.createFile('a.bel');
  P.setFileText(id1, 'LF a : type;');
  const id2 = P.createFile('b.bel');
  P.renameFile(id2, 'sub/b.bel');
  P.deleteFile(id1);
  const listed = P.listFiles().map((f) => f.name);
  expect(listed.includes('sub/b.bel') && !listed.includes('a.bel'), 'registry consistent after churn');
}

// ── project silo: second project isolated ─────────────────────────────────────
{
  const { P: P1 } = loadPersist();
  P1.ensureProject();
  P1.setFileText('workspace://main.bel', 'PROJECT_A');
  const pid = P1.createProject('B');
  P1.setActiveProjectId(pid);
  P1.setFileText('workspace://main.bel', 'PROJECT_B');
  P1.setActiveProjectId(P1.DEFAULT_PROJECT_ID);
  expect(P1.getFileText('workspace://main.bel') === 'PROJECT_A', 'switch back preserves silo A');
}

// ── workspace developments: multiple independent folders ──────────────────────
{
  seed([
    { name: 'a/x.bel', text: 'LF ax : type;' },
    { name: 'b/y.bel', text: 'LF by : type;' },
    { name: 'a/suite.cfg', text: 'x.bel\n' },
  ], { a: 'a/suite.cfg' });
  const devs = PS.workspaceDevelopments(P.listFiles(), getText);
  expect(devs.length >= 2, 'multiple developments detected');
}

// ── assemble + remap smoke ────────────────────────────────────────────────────
{
  seed([
    { name: 'f1.bel', text: 'LF a : type;\nLF b : type;' },
    { name: 'f2.bel', text: 'rec r : a = ? ;' },
  ]);
  const files = P.listFiles();
  const { code, spans } = PS.assembleProjectCode(files.map((f) => ({
    id: f.id, name: f.name, text: getText(f.id),
  })));
  expect(code.split('\n').length === 4, 'assembled code line count');
  const remapped = PS.remapLocations('File "input.bel", line 4, column 1:', spans);
  expect(remapped.includes('f2.bel'), 'error remapped to second file');
}

// ── cfg non-entry lines are silently skipped ──────────────────────────────────
{
  seed([{ name: 'grp/suite.cfg', text: 'not-a-real-entry.txt\n' }]);
  const diags = cfgDiagnosticsFor(textOf('grp/suite.cfg'), 'grp/suite.cfg', names());
  expect(diags.length === 0, 'non-entry cfg line → no diagnostic');
}

// ── prepend does not validate file exists; cfg lint surfaces dangling entry ───
{
  seed([
    { name: 'grp/base.bel', text: 'LF a : type;' },
    { name: 'grp/suite.cfg', text: 'base.bel\n' },
  ]);
  expect(P.prependEntryToCfg('grp/suite.cfg', 'grp/missing.bel') === true, 'prepend accepts path (file may be added later)');
  const diags = cfgDiagnosticsFor(textOf('grp/suite.cfg'), 'grp/suite.cfg', names());
  expect(diags.some((d) => d.severity === 'warning' && d.message.includes('missing.bel')), 'cfg lint flags prepended missing file');
}

console.log('OK project chaos (suites, cfg, silos, remap, lint)');
