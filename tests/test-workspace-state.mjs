import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert';

const here = dirname(fileURLToPath(import.meta.url));
const persistSrc = readFileSync(join(here, '..', 'js', 'persist.js'), 'utf8');
const wsSrc = readFileSync(join(here, '..', 'js', 'workspace-state.js'), 'utf8');

function freshCtx() {
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
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  ctx.globalThis = ctx;
  vm.runInContext(persistSrc, ctx);
  vm.runInContext(wsSrc, ctx);
  return ctx;
}

const ctx = freshCtx();
const P = ctx.BelJarPersist;
const W = ctx.BelJarWorkspaceState;

assert.equal(P.workspaceKeyFor('default'), 'beljar-workspace-v1');
assert.equal(P.workspaceKeyFor('my-proj'), 'beljar-proj:my-proj:workspace-v1');

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

P.writeStoredActiveSidePanel('library');
assert.equal(P.readStoredActiveSidePanel(), 'library');
assert.equal(P.readStoredLibraryOpen(), true);
assert.equal(P.readStoredInspectorOpen(), false);

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

P.writeStoredWorkspace({ v: 1, projectId: 'default', activeSidePanel: 'harpoon', floating: [] });
const raw = P.readStoredWorkspace();
assert.equal(raw.activeSidePanel, 'harpoon');

P.resetStoredWorkspace();
assert.equal(P.readStoredWorkspace(), null);

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

P.writeStoredWorkspace({ v: 1, projectId: 'default', activeSidePanel: null, floating: [] });
assert.equal(P.readStoredActiveSidePanel(), null);

console.log('OK workspace state');
