import {
  activeCfgResolver,
  cfgPathForActive,
  developmentForFile,
  inferActiveCfgByDir,
  listDevelopmentMembers,
  workspaceDevelopments,
  preludePathsFor,
  visibilityPaths,
} from '../editor-src/development.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const WS = [
  { id: 'cfg', name: 'bisimulation/sources.cfg', text: 'picalc.bel\nbisimulation.bel\ninvariant.bel' },
  { id: 'pic', name: 'bisimulation/picalc.bel', text: 'LF tm : type;' },
  { id: 'bis', name: 'bisimulation/bisimulation.bel', text: 'LF sim : type;' },
  { id: 'inv', name: 'bisimulation/invariant.bel', text: 'LF inv : type;' },
  { id: 'howe', name: 'bisimulation/howes-method/howe.bel', text: 'LF h : type;' },
  { id: 'howet', name: 'bisimulation/howes-method/howe-total.bel', text: 'LF ht : type;' },
  { id: 'tofte', name: 'tofte-hoas.bel', text: 'LF th : type;' },
  { id: 'untitled', name: 'untitled.bel', text: 'LF o : type;' },
];
const wsText = (id) => WS.find((f) => f.id === id).text;
const bisimOpts = { activeCfgForDir: activeCfgResolver({ bisimulation: 'bisimulation/sources.cfg' }) };

expect(cfgPathForActive(WS, 'bis', wsText, bisimOpts) === 'bisimulation/sources.cfg',
  'module member → active cfg');
expect(cfgPathForActive(WS, 'bis', wsText) === null, 'no active cfg → null');
expect(cfgPathForActive(WS, 'howe', wsText) === null, 'subdir without folder active cfg → null');
expect(cfgPathForActive(WS, 'tofte', wsText) === null, 'root standalone → null');
expect(cfgPathForActive(WS, 'untitled', wsText) === null, 'untitled root → null');

const rootDev = developmentForFile(WS, 'untitled', wsText);
expect(rootDev.kind === 'standalone' && rootDev.preludePaths.length === 0,
  'root standalone: no prelude');
expect(rootDev.paths.join('|') === 'untitled.bel', 'root standalone: paths = self only');
expect(rootDev.scopeKey === 'standalone:untitled.bel', 'root standalone scopeKey');

const invDev = developmentForFile(WS, 'inv', wsText, bisimOpts);
expect(invDev.kind === 'module' && invDev.cfg === 'bisimulation/sources.cfg',
  'module member kind');
expect(invDev.paths.join('|') === 'bisimulation/picalc.bel|bisimulation/bisimulation.bel|bisimulation/invariant.bel',
  'module paths in order');
expect(invDev.preludePaths.join('|') === 'bisimulation/picalc.bel|bisimulation/bisimulation.bel',
  'prelude = predecessors only');
expect(visibilityPaths(invDev).join('|') === invDev.preludePaths.concat(['bisimulation/invariant.bel']).join('|'),
  'visibility = prelude + active');

const devs = workspaceDevelopments(WS, wsText);
// A file in no cfg is isolated even for Run — one development per orphan file,
// not dir-grouped — so run-time visibility matches edit-time standalone scope.
expect(devs.length === 5, `one config + four isolated orphan files, got ${devs.length}`);
const orphanNames = devs.filter((d) => d.kind === 'orphan').map((d) => d.name).sort().join('|');
expect(orphanNames === 'bisimulation/howes-method/howe-total.bel|bisimulation/howes-method/howe.bel|tofte-hoas.bel|untitled.bel',
  'each non-cfg file is its own isolated development');
for (const d of devs.filter((x) => x.kind === 'orphan')) {
  expect(d.paths.length === 1 && d.paths[0] === d.name, 'orphan development = the single file, isolated');
}

const cr = [
  { id: 'c', name: 'church/ord.cfg', text: 'lam.elf\nord-red.elf\npar-red.elf\npar-lemmas.bel' },
  { id: 'l', name: 'church/lam.elf', text: 'LF term : type = | app : term -> term -> term ;' },
  { id: 'o', name: 'church/ord-red.elf', text: 'LF step : term -> term -> type = ;' },
  { id: 're', name: 'church/par-red.elf', text: 'LF pred : term -> term -> type = ;' },
  { id: 'rb', name: 'church/par-red.bel', text: 'pred : term -> term -> type.' },
  { id: 'pl', name: 'church/par-lemmas.bel', text: 'rec f : [ |- pred M N] = ?;' },
];
const crText = (id) => (cr.find((f) => f.id === id) || {}).text || '';
const churchOpts = { activeCfgForDir: activeCfgResolver({ church: 'church/ord.cfg' }) };

const borrowDev = developmentForFile(cr, 'rb', crText, churchOpts);
expect(borrowDev.kind === 'standalone', 'par-red.bel not in cfg → standalone');
expect(borrowDev.preludePaths.length === 0, 'unlisted file: no prelude');
expect(borrowDev.paths.join('|') === 'church/par-red.bel', 'unlisted file sees only self');
expect(cfgPathForActive(cr, 'rb', crText, churchOpts) === null, 'unlisted file has no module cfg');

const noBorrow = developmentForFile(cr, 'rb', crText);
expect(noBorrow.preludePaths.length === 0, 'no prelude without active cfg');

const orphanDir = [
  { id: 'cfg', name: 'grp/order.cfg', text: 'base.bel\nuse.bel' },
  { id: 'a', name: 'grp/base.bel', text: 'LF o : type;' },
  { id: 'z', name: 'grp/use.bel', text: 'LF nd : o → type;' },
  { id: 'x', name: 'grp/extra.bel', text: 'LF tp : type;' },
];
const odText = (id) => orphanDir.find((f) => f.id === id).text;
const grpOpts = { activeCfgForDir: activeCfgResolver({ grp: 'grp/order.cfg' }) };
const extraDev = developmentForFile(orphanDir, 'x', odText, grpOpts);
expect(extraDev.preludePaths.length === 0, 'unlisted file: no module peer prelude');
expect(extraDev.paths.join('|') === 'grp/extra.bel', 'unlisted file sees only self');

const multiDir = [
  { id: 'a', name: 'cls/a.cfg', text: 'x.bel' },
  { id: 'x', name: 'cls/x.bel', text: 'LF a : type;' },
  { id: 'b', name: 'cps/sources.cfg', text: 'p.bel\ncps-eval.elf' },
  { id: 'p', name: 'cps/p.bel', text: 'LF cexp : type;' },
  { id: 'e', name: 'cps/cps-eval.elf', text: 'LF ceval : cexp -> cval -> type;' },
];
const mdText = (id) => multiDir.find((f) => f.id === id).text;
const byDir = inferActiveCfgByDir(multiDir, mdText);
expect(byDir.cls === 'cls/a.cfg' && byDir.cps === 'cps/sources.cfg',
  'inferActiveCfgByDir picks one cfg per folder');
const cpsOpts = { activeCfgForDir: activeCfgResolver(byDir) };
expect(preludePathsFor(multiDir, 'e', mdText, cpsOpts).join('|') === 'cps/p.bel',
  'cps-eval gets prelude once cps folder cfg is active');

const cfgDev = developmentForFile(cr, 'c', crText);
expect(cfgDev.kind === 'module' && cfgDev.cfg === 'church/ord.cfg',
  'editing a .cfg describes its own suite');
expect(cfgDev.paths.join('|') === 'church/lam.elf|church/ord-red.elf|church/par-red.elf|church/par-lemmas.bel',
  'cfg file development paths follow load order');
expect(cfgDev.activeIndex === -1, 'cfg file is not a suite member');

{
  const files = [
    { id: 'a', name: 'grp/a.bel' },
    { id: 'b', name: 'grp/b.bel' },
  ];
  const texts = { a: 'rec inA : [ |- nat] = ?;', b: 'rec inB : [ |- nat] = ?;' };
  const getText = (id) => texts[id] || '';
  const { members: wrong } = listDevelopmentMembers(files, 'b', getText, {}, 'LIVE FROM OTHER FILE');
  const bWrong = wrong.find((m) => m.name === 'grp/b.bel');
  expect(bWrong?.text === 'LIVE FROM OTHER FILE',
    'legacy misuse: live text splices into the anchor file unconditionally');

  const { members: right } = listDevelopmentMembers(files, 'b', getText, {}, null);
  const bRight = right.find((m) => m.name === 'grp/b.bel');
  expect(bRight?.text === 'rec inB : [ |- nat] = ?;',
    'no live splice when the anchor file is not the open editor buffer');
}

console.log('OK development module (active cfg, standalone isolation)');
