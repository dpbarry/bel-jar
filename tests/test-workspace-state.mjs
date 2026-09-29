import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert';
import { runPersistStackInContext } from './persist-stack.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const wsSrc = readFileSync(join(here, '..', 'js', 'workspace', 'workspace.js'), 'utf8');

function freshCtx() {
  const storage = new Map();
  const fakeLocalStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    get length() { return storage.size; },
    key: (i) => [...storage.keys()][i] ?? null,
  };
  const ctx = vm.createContext({
    globalThis: {},
    clearTimeout,
    setTimeout,
    TextEncoder,
    localStorage: fakeLocalStorage,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, length: 0, key: () => null },
  });
  ctx.globalThis = ctx;
  runPersistStackInContext(ctx);
  vm.runInContext(wsSrc, ctx);
  return ctx;
}

const ctx = freshCtx();
const P = ctx.Persist;
const W = ctx.WorkspaceState;

// The workspace and side panel belong to this project's session: another
// project starts clean, and coming back finds this one's.
{
  const home = P.getActiveProjectId();
  P.writeWorkspace({ v: 1, activeSidePanel: 'inspector', floating: [] });
  const other = P.createProject('Other');
  assert.equal(P.readWorkspace(other), null, 'another project has its own (empty) workspace');
  assert.equal(P.readSidePanel(other), null, 'and its own side panel');
  assert.equal(P.readWorkspace(home).activeSidePanel, 'inspector', 'this project keeps its workspace');
  assert.equal(P.readSidePanel(), 'inspector', 'writing the workspace records its side panel');
  const key = 'beljar/p/' + home + '/session';
  assert.equal(JSON.parse(ctx.localStorage.getItem(key)).data.panel, 'inspector', 'in the session record early boot reads');
  P.resetWorkspace();
}

const norm = W.normalizeWorkspace({
  v: 1,
  projectId: 'default',
  activeSidePanel: 'inspector',
  sidebar: {
    inspector: { target: { kind: 'symbol', name: 'foo', fileId: 'workspace://a.bel', posHint: 12 }, histIndex: 2, scrollTop: 40 },
    explorer: { revealActiveFile: true, scrollActiveIntoView: true },
    harpoon: { provingDecl: { fileId: 'workspace://a.bel', declKey: 'rec:thm' } },
  },
  floating: [{
    kind: 'inspector',
    fileId: 'workspace://a.bel',
    geom: { x: 10, y: 20, w: 300, h: 400 },
    anchor: { kind: 'symbol', name: 'foo', posHint: 5 },
    followEditor: true,
    zOrder: 1,
  }],
}, 'default');

assert.equal(norm.activeSidePanel, 'inspector');
assert.equal(norm.sidebar.inspector.target.name, 'foo');
assert.equal(norm.floating.length, 1);
assert.equal(norm.floating[0].geom.w, 300);

const capped = W.normalizeWorkspace({
  v: 1,
  floating: Array.from({ length: 12 }, (_, i) => ({
    kind: 'graph',
    fileId: 'f' + i,
    geom: { x: 0, y: 0, w: 200, h: 200 },
    anchor: { mode: 'global' },
  })),
}, 'default');
assert.equal(capped.floating.length, W.MAX_FLOATING);

P.writeSidePanel('library');
assert.equal(P.readSidePanel(), 'library');
P.writeSidePanel('not-a-panel');
assert.equal(P.readSidePanel(), null, 'an unknown panel is stored as none');

const va = P.normalizeViewportAnchor({ kind: 'decl', declIndex: 2, sigOffset: 15 });
assert.deepEqual(va, { kind: 'decl', declIndex: 2, sigOffset: 15 });

const floats = W.filterFloatingForFile(
  [
    { id: 'a', fileId: 'workspace://one.bel', kind: 'inspector' },
    { id: 'b', fileId: 'workspace://two.bel', kind: 'graph' },
  ],
  'workspace://one.bel',
  ['workspace://one.bel', 'workspace://two.bel'],
);
assert.equal(floats.length, 1);
assert.equal(floats[0].id, 'a');

P.writeWorkspace({ v: 1, projectId: 'default', activeSidePanel: 'harpoon', floating: [] });
const raw = P.readWorkspace();
assert.equal(raw.activeSidePanel, 'harpoon');

P.resetWorkspace();
assert.equal(P.readWorkspace(), null);
assert.equal(P.readSidePanel(), null, 'resetting the workspace clears the side panel too');

const merged = W.mergeFloatingSnapshots(
  [
    { id: 'a', fileId: 'workspace://one.bel', kind: 'graph' },
    { id: 'b', fileId: 'workspace://two.bel', kind: 'inspector' },
    { id: 'stale', fileId: 'workspace://gone.bel', kind: 'harpoon' },
  ],
  'workspace://one.bel',
  ['workspace://one.bel', 'workspace://two.bel'],
  [{ id: 'c', fileId: 'workspace://one.bel', kind: 'harpoon' }],
);
assert.equal(merged.length, 2);
assert.equal(merged[0].id, 'b');
assert.equal(merged[1].id, 'c');

// Shared graph closed on the active file must not leave other tabs' graph floats
// (that was reopening the dependency graph when switching back).
const closedGraph = W.mergeFloatingSnapshots(
  [
    { id: 'graph:__global__', fileId: 'workspace://main.bel', kind: 'graph' },
    { id: 'insp', fileId: 'workspace://main.bel', kind: 'inspector' },
  ],
  'workspace://suite.bel',
  ['workspace://main.bel', 'workspace://suite.bel'],
  [],
);
assert.equal(closedGraph.length, 1);
assert.equal(closedGraph[0].id, 'insp');

const graphMoved = W.mergeFloatingSnapshots(
  [{ id: 'graph:__global__', fileId: 'workspace://main.bel', kind: 'graph' }],
  'workspace://suite.bel',
  ['workspace://main.bel', 'workspace://suite.bel'],
  [{ id: 'graph:__global__', fileId: 'workspace://suite.bel', kind: 'graph' }],
);
assert.equal(graphMoved.length, 1);
assert.equal(graphMoved[0].fileId, 'workspace://suite.bel');

// Closed Harpoon on another tab must not leave a stale float (reopened on focus).
const closedHarpoon = W.mergeFloatingSnapshots(
  [
    { id: 'harp', fileId: 'workspace://main.bel', kind: 'harpoon' },
    { id: 'insp2', fileId: 'workspace://main.bel', kind: 'inspector' },
  ],
  'workspace://suite.bel',
  ['workspace://main.bel', 'workspace://suite.bel'],
  [],
);
assert.equal(closedHarpoon.length, 1);
assert.equal(closedHarpoon[0].id, 'insp2');

const liveHarpoonKept = W.mergeFloatingSnapshots(
  [{ id: 'harp', fileId: 'workspace://main.bel', kind: 'harpoon' }],
  'workspace://suite.bel',
  ['workspace://main.bel', 'workspace://suite.bel'],
  [{ id: 'harp', fileId: 'workspace://main.bel', kind: 'harpoon' }],
);
assert.equal(liveHarpoonKept.length, 1);
assert.equal(liveHarpoonKept[0].id, 'harp');

P.writeWorkspace({ v: 1, projectId: 'default', activeSidePanel: null, floating: [] });
assert.equal(P.readSidePanel(), null);

console.log('OK workspace state');
