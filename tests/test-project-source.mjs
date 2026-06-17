// Whole-project run support (js/project-source.js): ordered concatenation with
// a 1-based line map, mapping project lines back to files, rewriting all three
// Beluga error-location grammars, and the pure reorder helper. Also pins the
// persist registry's moveFile/getFileText/setFileText (vm-loaded with a fake
// localStorage, same pattern as test-multifile-switch).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));

// ── load project-source.js against a fake window ─────────────────────────────
const psSrc = readFileSync(join(here, '..', 'js', 'project-source.js'), 'utf8');
const fakeWindow = {};
// eslint-disable-next-line no-new-func
new Function('window', psSrc)(fakeWindow);
const PS = fakeWindow.BelJarProjectSource;
expect(PS && typeof PS.concat === 'function', 'BelJarProjectSource is exported');

// ── concat + spans ────────────────────────────────────────────────────────────
const FILES = [
  { id: 'a', name: 'base.bel', text: 'LF o : type =\n  | top : o\n;' },        // 3 lines → 1..3
  { id: 'b', name: 'sub/mid.bel', text: 'LF nd : o → type =\n  | I : nd top\n;\n' }, // 4 lines → 5..8
  { id: 'c', name: 'main.bel', text: 'rec f : [ ⊢ nd top ] = [ ⊢ I ];' },     // 1 line → 10
];
const { code, spans } = PS.concat(FILES);

expect(spans.length === 3, 'one span per file');
expect(spans[0].startLine === 1 && spans[0].endLine === 3, 'first span 1..3');
expect(spans[1].startLine === 5 && spans[1].endLine === 8, 'second span starts after a blank line (5..8)');
expect(spans[2].startLine === 10 && spans[2].endLine === 10, 'third span 10..10');

// The concatenated code's lines must agree with the span math.
const codeLines = code.split('\n');
expect(codeLines.length === 10, `project source is 10 lines, got ${codeLines.length}`);
expect(codeLines[0] === 'LF o : type =', 'line 1 is file A line 1');
expect(codeLines[3] === '', 'line 4 is the blank separator');
expect(codeLines[4] === 'LF nd : o → type =', 'line 5 is file B line 1');
expect(codeLines[9] === FILES[2].text, 'line 10 is file C line 1');

// ── mapLine ───────────────────────────────────────────────────────────────────
expect(PS.mapLine(spans, 1).name === 'base.bel' && PS.mapLine(spans, 1).line === 1, 'line 1 → base.bel:1');
expect(PS.mapLine(spans, 3).line === 3, 'line 3 → base.bel:3 (inclusive end)');
expect(PS.mapLine(spans, 4) === null, 'separator line maps to null');
expect(PS.mapLine(spans, 6).name === 'sub/mid.bel' && PS.mapLine(spans, 6).line === 2, 'line 6 → sub/mid.bel:2');
expect(PS.mapLine(spans, 10).name === 'main.bel' && PS.mapLine(spans, 10).line === 1, 'line 10 → main.bel:1');
expect(PS.mapLine(spans, 99) === null, 'out-of-range line maps to null');
expect(PS.mapLine(spans, 0) === null, 'line 0 maps to null');

// ── remapLocations: the three Beluga grammars ────────────────────────────────
// 1. File "input.bel", line L, column C
let out = PS.remapLocations('File "input.bel", line 6, column 5:\nError: bad', spans);
expect(out.includes('File "sub/mid.bel", line 2, column 5:'), `File-grammar remapped, got: ${out.split('\n')[0]}`);

// characters variant keeps the clause
out = PS.remapLocations('File "input.bel", line 10, characters 4-9:', spans);
expect(out.includes('File "main.bel", line 1, characters 4-9:'), 'File-grammar characters variant remapped');

// 2. compact input.bel:L.C-L.C:
out = PS.remapLocations('input.bel:5.0-6.10:\nError: mismatch', spans);
expect(out.startsWith('sub/mid.bel:1.0-2.10:'), `compact grammar remapped, got: ${out.split('\n')[0]}`);

// single-point compact form
out = PS.remapLocations('input.bel:10.3:', spans);
expect(out.startsWith('main.bel:1.3:'), 'compact single-point remapped');

// compact spanning two files (illegal) left untouched
out = PS.remapLocations('input.bel:3.0-6.2:', spans);
expect(out === 'input.bel:3.0-6.2:', 'cross-file compact span left untouched');

// 3. at line L, characters C-C  (gains an "in <file>," prefix to name the file)
out = PS.remapLocations('Type error.\n  at line 6, characters 2-4', spans);
expect(out.includes('in sub/mid.bel, at line 2, characters 2-4'), `at-line grammar remapped, got: ${out}`);

// Unmappable locations stay verbatim.
out = PS.remapLocations('File "input.bel", line 4, column 1:', spans);
expect(out === 'File "input.bel", line 4, column 1:', 'separator-line location left untouched');

// No spans → identity.
expect(PS.remapLocations('File "x.bel", line 2', null) === 'File "x.bel", line 2', 'null spans → identity');

// ── cfg import order ──────────────────────────────────────────────────────────
expect(PS.parseCfg('% defs\nsyntax.bel\n\njoin.bel').join(',') === 'syntax.bel,join.bel', 'parseCfg skips comments');
const cfgByDir = {
  'ex/identity': {
    'identity.cfg': '% thms\nbase.bel\nmain.bel',
  },
};
const belPaths = ['ex/identity/z-extra.bel', 'ex/identity/main.bel', 'ex/identity/base.bel', 'other/solo.bel'];
const ordered = PS.orderBelPaths(belPaths, cfgByDir);
expect(ordered.join('|') === 'ex/identity/base.bel|ex/identity/main.bel|ex/identity/z-extra.bel|other/solo.bel',
  `cfg order within dir, got: ${ordered.join('|')}`);

// ── default .cfg: explicit path, not active file ─────────────────────────────
const CR_DEF = [
  { id: 'lam', name: 'church-rosser/lam.elf', text: 'LF term : type;' },
  { id: 'eqb', name: 'church-rosser/equiv.bel', text: 'rec eq : ...' },
  { id: 'ocr', name: 'church-rosser/ord-cr.bel', text: 'rec cr : ...' },
  { id: 'tcfg', name: 'church-rosser/test.cfg', text: 'lam.elf\nequiv.bel\nord-cr.bel' },
  { id: 'ocfg', name: 'church-rosser/ord.cfg', text: 'lam.elf\nequiv.bel' },
];
const inferred = PS.inferDefaultCfgPath(CR_DEF, (id) => CR_DEF.find((f) => f.id === id).text);
expect(inferred === 'church-rosser/test.cfg',
  `inferDefaultCfgPath picks longest chain, got: ${inferred}`);
const devCfg = PS.developmentFilesForCfg(CR_DEF, 'church-rosser/ord.cfg',
  (id) => CR_DEF.find((f) => f.id === id).text);
expect(devCfg.map((f) => f.name).join('|') === 'church-rosser/lam.elf|church-rosser/equiv.bel',
  `developmentFilesForCfg follows named cfg, got: ${devCfg.map((f) => f.name).join('|')}`);

// ── whole-project scope: .cfg chain only, skip legacy Twelf .elf ─────────────
const CR2 = [
  { id: 'lam', name: 'church-rosser/lam.elf', text: 'LF term : type;' },
  { id: 'eqb', name: 'church-rosser/equiv.bel', text: 'rec eq : ...' },
  { id: 'eqe', name: 'church-rosser/equiv.elf', text: 'eq2 : --> M N -> type.' },
  { id: 'cfg', name: 'church-rosser/test.cfg', text: 'lam.elf\nequiv.bel' },
];
const cr2Opts = { activeCfgForDir: PS.activeCfgResolver({ 'church-rosser': 'church-rosser/test.cfg' }) };
const dev = PS.developmentFilesFor(CR2, 'eqb', (id) => CR2.find((f) => f.id === id).text, cr2Opts);
expect(dev.map((f) => f.name).join('|') === 'church-rosser/lam.elf|church-rosser/equiv.bel',
  `development is cfg chain only, got: ${dev.map((f) => f.name).join('|')}`);
expect(!dev.some((f) => f.name.endsWith('equiv.elf')), 'legacy equiv.elf excluded from whole-project run');

// ── church-rosser: .elf LF signatures in prelude via test-crec.cfg ────────────
const CR = [
  { id: 'lam', name: 'church-rosser/lam.elf', text: 'LF term : type = | lam : (term -> term) -> term;' },
  { id: 'pred', name: 'church-rosser/par-red.elf', text: 'LF pred : term -> term -> type = | id* : pred M M;' },
  { id: 'bel', name: 'church-rosser/par-lemmas-crec.bel', text: 'schema ctx = block (x:term, t:pred x x);' },
  { id: 'cfg', name: 'church-rosser/test-crec.cfg', text: 'lam.elf\npar-red.elf\npar-lemmas-crec.bel' },
  { id: 'other', name: 'church-rosser/test.cfg', text: 'lam.elf\npar-lemmas.bel' },
];
const crOpts = { activeCfgForDir: PS.activeCfgResolver({ 'church-rosser': 'church-rosser/test-crec.cfg' }) };
const crPre = PS.buildPrelude(CR, 'bel', (id) => CR.find((f) => f.id === id).text, crOpts);
expect(crPre && crPre.spans.length === 2
  && crPre.spans[0].name === 'church-rosser/lam.elf'
  && crPre.spans[1].name === 'church-rosser/par-red.elf',
  'church-rosser prelude loads .elf signatures before .bel');

// ── cfg-aware prelude (order from .cfg, not registry position) ───────────────
const REGISTRY = [
  { id: 'z', name: 'grp/use.bel', text: 'LF nd : o → type;' },
  { id: 'a', name: 'grp/base.bel', text: 'LF o : type;' },
  { id: 'c', name: 'grp/order.cfg', text: 'base.bel\nuse.bel' },
];
const grpOpts = { activeCfgForDir: PS.activeCfgResolver({ grp: 'grp/order.cfg' }) };
const preCfg = PS.buildPrelude(REGISTRY, 'z', (id) => REGISTRY.find((f) => f.id === id).text, grpOpts);
expect(preCfg && preCfg.spans.length === 1 && preCfg.spans[0].name === 'grp/base.bel',
  'prelude follows .cfg even when active file is first in registry');

// ── unusual workspace: one cfg + orphan dir-groups (the "codatatypes" case) ──
// bisimulation/sources.cfg governs three files; howes-method/* and a root file
// are orphans in no cfg.
const WS = [
  { id: 'cfg', name: 'bisimulation/sources.cfg', text: 'picalc.bel\nbisimulation.bel\ninvariant.bel' },
  { id: 'pic', name: 'bisimulation/picalc.bel', text: 'LF tm : type;' },
  { id: 'bis', name: 'bisimulation/bisimulation.bel', text: 'LF sim : type;' },
  { id: 'inv', name: 'bisimulation/invariant.bel', text: 'LF inv : type;' },
  { id: 'howe', name: 'bisimulation/howes-method/howe.bel', text: 'LF h : type;' },
  { id: 'howet', name: 'bisimulation/howes-method/howe-total.bel', text: 'LF ht : type;' },
  { id: 'tofte', name: 'tofte-hoas.bel', text: 'LF th : type;' },
];
const wsText = (id) => WS.find((f) => f.id === id).text;

// cfgPathForActive: module member when folder has active cfg; else null.
const bisimOpts = { activeCfgForDir: PS.activeCfgResolver({ bisimulation: 'bisimulation/sources.cfg' }) };
expect(PS.cfgPathForActive(WS, 'bis', wsText, bisimOpts) === 'bisimulation/sources.cfg',
  'cfgPathForActive: module member → active cfg');
expect(PS.cfgPathForActive(WS, 'howe', wsText) === null,
  'cfgPathForActive: no folder active cfg → null');
expect(PS.cfgPathForActive(WS, 'tofte', wsText) === null,
  'cfgPathForActive: root standalone → null');

// workspaceDevelopments: one config + each non-cfg file isolated on its own.
const devs = PS.workspaceDevelopments(WS, wsText);
const configDev = devs.find((d) => d.kind === 'config');
expect(configDev && configDev.name === 'sources'
  && configDev.paths.join('|') === 'bisimulation/picalc.bel|bisimulation/bisimulation.bel|bisimulation/invariant.bel',
  `config development is the cfg chain in order, got: ${configDev && configDev.paths.join('|')}`);
const orphanNames = devs.filter((d) => d.kind === 'orphan').map((d) => d.name).join('|');
expect(orphanNames === 'bisimulation/howes-method/howe.bel|bisimulation/howes-method/howe-total.bel|tofte-hoas.bel',
  `each non-cfg file is its own isolated development, got: ${orphanNames}`);
for (const d of devs.filter((x) => x.kind === 'orphan')) {
  expect(d.paths.length === 1 && d.paths[0] === d.name, 'orphan development = the single file, isolated');
}
expect(devs.length === 4, `one config + three isolated orphans, got ${devs.length}`);
// No file appears in more than one development.
const seen = {};
for (const d of devs) for (const p of d.paths) { expect(!seen[p], `${p} not double-counted`); seen[p] = true; }

// ── nested cfg: an included cfg is not a separate top-level development ───────
const NESTED = [
  { id: 'top', name: 'all.cfg', text: 'sub/part.cfg\nmain.bel' },
  { id: 'sub', name: 'sub/part.cfg', text: 'a.bel' },
  { id: 'a', name: 'sub/a.bel', text: 'LF a : type;' },
  { id: 'm', name: 'main.bel', text: 'LF m : type;' },
];
const nestedDevs = PS.workspaceDevelopments(NESTED, (id) => NESTED.find((f) => f.id === id).text);
expect(nestedDevs.length === 1 && nestedDevs[0].name === 'all',
  `nested cfg collapses into the parent development, got ${nestedDevs.map((d) => d.name).join('|')}`);
expect(nestedDevs[0].paths.join('|') === 'sub/a.bel|main.bel',
  `nested chain resolves through the sub-cfg, got: ${nestedDevs[0].paths.join('|')}`);

// ── prelude + shiftCheckerOutput ──────────────────────────────────────────────
const FILES2 = [
  { id: 'a', name: 'grp/base.bel', text: 'LF o : type;' },
  { id: 'b', name: 'grp/use.bel', text: 'LF nd : o → type;' },
  { id: 'c', name: 'grp/order.cfg', text: 'base.bel\nuse.bel' },
];
const hoisted = PS.assembleCheckerCode(
  '--nostrengthen\n\nLF nd : o → type;',
  PS.buildPrelude(FILES2, 'b', (id) => FILES2.find((f) => f.id === id).text, grpOpts),
);
expect(hoisted.code.startsWith('--nostrengthen'), 'nostrengthen leads combined checker code');
expect(hoisted.code.includes('LF o : type;'), 'prelude follows hoisted pragma');
expect(hoisted.code.includes('LF nd : o → type;'), 'active file body kept');
expect(hoisted.prelude.offsetLines === 4,
  'line offset accounts for hoisted pragma + blank before prelude');
expect(PS.shiftCheckerOutput('File "input.bel", line 5, column 1:\nError: here', hoisted.prelude).text
  .includes('line 1'), 'active-file lines still shift after hoist');

const maskedLead = PS.peelGlobalFilePragmas('             \n              \nLF b : type = ;');
expect(maskedLead.rest.includes('             '), 'must not peel through masked blank blocks');

const folProject = PS.assembleProjectCode([
  { id: 'elf', name: 'fol/fol.elf', text: 'LF o : type = ;\n' },
  { id: 'bel', name: 'fol/fol.bel', text: '--nostrengthen\nschema ctx = down A;\n' },
]);
expect(folProject.code.startsWith('--nostrengthen'), 'project run hoists pragmas ahead of cfg chain');
expect(folProject.code.includes('LF o : type = ;'), 'elf prelude follows hoisted pragma');
expect(!/\n--nostrengthen\nschema/.test(folProject.code), 'pragma is not left mid-project');
expect(folProject.spans[1].name === 'fol/fol.bel' && folProject.spans[1].startLine > 1,
  'fol.bel span shifts after hoisted header');

const pre = PS.buildPrelude(FILES2, 'b', (id) => FILES2.find((f) => f.id === id).text, grpOpts);
expect(pre.offsetLines === 2, 'prelude offset after 1-line file + blank');
const shifted = PS.shiftCheckerOutput('File "input.bel", line 1, column 3:\nError: bad', pre);
expect(shifted.preludeIssues.length === 1 && shifted.preludeIssues[0].name === 'grp/base.bel',
  'prelude error captured');
expect(PS.shiftCheckerOutput('File "input.bel", line 3, column 1:\nError: here', pre).text
  .includes('line 1'), 'active-file line shifted down');

// ── reorder ───────────────────────────────────────────────────────────────────
const order = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
expect(PS.reorder(order, 'b', -1).map((f) => f.id).join('') === 'bac', 'move b up');
expect(PS.reorder(order, 'a', -1) === order, 'move first up is a no-op (same array)');
expect(PS.reorder(order, 'c', +1) === order, 'move last down is a no-op');
expect(PS.reorder(order, 'a', +2).map((f) => f.id).join('') === 'bca', 'multi-step delta clamps and moves');
expect(order.map((f) => f.id).join('') === 'abc', 'reorder does not mutate its input');

// ── persist registry: moveFile / setFileText / getFileText ──────────────────
const persistSrc = readFileSync(join(here, '..', 'js', 'persist.js'), 'utf8');
const storage = new Map();
const fakeLocalStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
const ctx = vm.createContext({
  globalThis: {},
  clearTimeout,
  setTimeout,
  TextEncoder,
  localStorage: fakeLocalStorage,
});
ctx.globalThis = ctx;
vm.runInContext(persistSrc, ctx);
const Persist = ctx.BelJarPersist;

Persist.replaceProject([
  { name: 'one.bel', text: 'LF a : type;' },
  { name: 'two.cfg', text: 'one.bel' },
], { projectName: 'TestProj' });
expect(Persist.listFiles().length === 2, 'replaceProject sets exact file count');
expect(Persist.getProjectName() === 'TestProj', 'replaceProject sets project name');
expect(Persist.getDefaultCfgPath() === null, 'replaceProject clears default cfg');

Persist.replaceProject([
  { name: 'grp/base.bel', text: 'LF a : type;' },
  { name: 'grp/use.bel', text: 'LF b : type;' },
  { name: 'grp/short.cfg', text: 'base.bel' },
  { name: 'grp/long.cfg', text: 'base.bel\nuse.bel' },
  { name: 'cps/p.bel', text: 'LF cexp : type;' },
  { name: 'cps/sources.cfg', text: 'p.bel' },
], { activeCfgByDir: { grp: 'grp/long.cfg', cps: 'cps/sources.cfg' } });
expect(Persist.getActiveCfgForDir('grp') === 'grp/long.cfg', 'per-folder active cfg stored');
expect(Persist.getActiveCfgForDir('cps') === 'cps/sources.cfg', 'second folder active cfg stored');
expect(Persist.getDefaultCfgPath() === 'grp/long.cfg', 'getDefaultCfgPath reflects active file folder cfg');

Persist.backfillActiveCfgByDir({ debruijn: 'debruijn/main.cfg' });
expect(Persist.getActiveCfgForDir('debruijn') === 'debruijn/main.cfg', 'backfill adds missing dirs');
expect(Persist.getActiveCfgForDir('grp') === 'grp/long.cfg', 'backfill does not overwrite existing');
expect(Persist.getOpenFileIds().length === 1, 'replaceProject opens one tab');
expect(Persist.getFileText(Persist.listFiles()[0].id) === 'LF a : type;', 'replaceProject stores text');

Persist.replaceProject([{ name: 'main.bel', text: 'LF seed : type;' }]);
const idB = Persist.createFile('b.bel');
const idC = Persist.createFile('c.bel');
expect(Persist.listFiles().length === 3, 'registry has 3 files (seed + 2)');

// setFileText / getFileText round-trip.
Persist.setFileText(idB, 'LF tok : type;');
expect(Persist.getFileText(idB) === 'LF tok : type;', 'setFileText/getFileText round-trip');
expect(Persist.getFileText(idC) === '', 'unwritten file reads as empty text');

// moveFile reorders the registry (= project run order).
expect(Persist.moveFile(idC, -1) === true, 'moveFile up succeeds');
expect(Persist.listFiles()[1].id === idC, 'c.bel moved to index 1');
expect(Persist.moveFile(idC, -1) === true && Persist.listFiles()[0].id === idC, 'c.bel moved to front');
expect(Persist.moveFile(idC, -1) === false, 'moving the first file up is a no-op');
expect(Persist.moveFile('nope', 1) === false, 'unknown id is a no-op');

// ── open-files list (tabs ⊂ project) ─────────────────────────────────────────
for (const f of Persist.listFiles()) Persist.openFile(f.id);
expect(Persist.getOpenFileIds().length === 3, 'all project files can be open as tabs');

// Close two, open one back.
Persist.closeOpenFile(idB);
Persist.closeOpenFile(idC);
expect(Persist.getOpenFileIds().length === 1, 'closing tabs shrinks the open list');
Persist.openFile(idC);
const open = Persist.getOpenFileIds();
expect(open[open.length - 1] === idC, 'reopened file appends to the open list');
Persist.openFile(idC);
expect(Persist.getOpenFileIds().length === 2, 'opening an open file does not duplicate');
Persist.openFile('nope');
expect(Persist.getOpenFileIds().length === 2, 'opening an unknown id is a no-op');

// Deleting a file also closes its tab and drops it from the open list.
Persist.deleteFile(idC);
expect(Persist.getOpenFileIds().indexOf(idC) === -1, 'deleteFile removes the file from the open list');
expect(Persist.listFiles().length === 2, 'registry shrank after delete');

console.log('OK project source (concat, remap, cfg order, prelude shift, reorder, persist, open tabs)');
