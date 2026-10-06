// What a round writes, and what it must never send (docs/PERSIST.md §5.3, §5.5).
//
// A commit is never sent for a project deleted while its texts were going up
// ahead of it (a push too big to carry them): landing after the tombstone, it
// would read as another device's edit, beat the deletion, and bring the project
// back. Deleted while the commit carrying them is in flight (a push is one
// request), the tombstone names that commit, and the deletion stands. And what the engine writes itself
// to settle a round (a project forgotten, a deletion settled) is marked as its
// own, so the runner does not hear it as a change waiting to sync: it used to,
// and the cloud said "syncing" for a minute after every such round.
import { createMemoryServer } from '../js/persist/sync/memory-server.mjs';
import { createSyncEngine } from '../js/persist/sync/engine.mjs';
import { TOMBSTONES_KEY } from '../js/persist/keys.mjs';
import { makeDevice, syncHash, fileId, addFile } from './_sync-env.mjs';
import { makeBrowserStorage, openTab } from './_persist-env.mjs';
import { flush, lockManager } from './_runner-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const statusOf = (res, pid) => res.projects[pid] && res.projects[pid].status;
const headOf = (server, pid) => {
  const h = server.history(pid);
  return h ? h.versions[h.versions.length - 1] : null;
};

/** A second, synced project on a device (the last project cannot be deleted). */
async function second(dev, text) {
  dev.work.projectId(); // the first project, as a page makes it
  const pid = dev.work.createProject('Second');
  const fid = fileId(dev.work, pid, 'main.bel');
  dev.work.setText(fid, text, pid);
  await dev.engine.syncAll();
  return { pid, fid };
}

// ── 1. deleted while a round was sending it ─────────────────────────────────
// (a) Its texts going up ahead of the commit (more than one commit carries):
// nothing of it is committed.
{
  const server = createMemoryServer({ hash: syncHash });
  const real = server.transport('u_dean');
  let during = null;
  let sentAhead = 0;
  const transport = {};
  for (const k of Object.keys(real)) transport[k] = real[k];
  // The texts are on their way up: this is when the person deletes it.
  transport.putBlobs = async (...args) => {
    sentAhead += 1;
    if (during) { const run = during; during = null; run(); }
    return real.putBlobs(...args);
  };
  const a = makeDevice(server, { name: 'A', transport });
  await a.engine.syncAll();
  const { pid, fid } = await second(a, 'two\n');
  const versions = server.history(pid).versions.length;
  a.work.setText(fid, 'two\nmore\n', pid);
  for (let i = 0; i < 201; i++) addFile(a.work, pid, 'f' + i + '.bel', 'file ' + i + '\n');
  during = () => a.work.deleteProject(pid);
  await a.engine.syncAll();
  expect(sentAhead > 0, 'two hundred new files are more than one commit carries: they go up ahead of it');
  expect(server.history(pid).versions.filter((v) => !v.deleted).length === versions,
    'deleted while its texts were going up: the edit is never committed');
  await a.engine.syncAll();
  expect(headOf(server, pid).deleted === true && !a.work.getProject(pid) && !a.work.readTombstones()[pid],
    'so it stays deleted, here and in the cloud (a late commit would have read as another device\'s edit, and brought it back)');
  expect(a.notices.length === 0, `and nothing is announced as restored (${JSON.stringify(a.notices)})`);
}

// (b) The commit carrying its texts in flight (a push is one request): the
// tombstone names that commit, so when it lands it is not another device's
// edit, and the deletion stands.
{
  const server = createMemoryServer({ hash: syncHash });
  const real = server.transport('u_dean');
  let during = null;
  let commits = 0;
  const transport = {};
  for (const k of Object.keys(real)) transport[k] = real[k];
  transport.commit = async (...args) => {
    commits += 1;
    if (during) { const run = during; during = null; run(); }
    return real.commit(...args);
  };
  const a = makeDevice(server, { name: 'A1b', transport });
  await a.engine.syncAll();
  const { pid, fid } = await second(a, 'two\n');
  a.work.setText(fid, 'two\nmore\n', pid);
  commits = 0;
  during = () => a.work.deleteProject(pid);
  await a.engine.syncAll();
  expect(commits === 1 && headOf(server, pid).deleted === false, 'the edit went up in one request, and landed as the project was deleted here');
  await a.engine.syncAll();
  expect(headOf(server, pid).deleted === true && !a.work.getProject(pid) && !a.work.readTombstones()[pid],
    'the deletion named that commit, so it stands: deleted here and in the cloud');
  expect(a.notices.length === 0, `and nothing is announced as restored (${JSON.stringify(a.notices)})`);
}

// ── 2. what the engine writes settling a round is marked as its own ─────────
{
  const server = createMemoryServer({ hash: syncHash });
  const a = makeDevice(server, { name: 'A2' });
  const b = makeDevice(server, { name: 'B2' });
  await a.engine.syncAll();
  const { pid } = await second(a, 'one\n');
  await b.engine.syncAll();
  const marked = (dev) => {
    const seen = { depth: 0, stray: [] };
    dev.store.subscribe((e) => {
      if (e.origin !== 'remote' && seen.depth === 0 && (e.cls === 'work' || e.key === TOMBSTONES_KEY)) seen.stray.push(e.key);
    });
    seen.engine = createSyncEngine({
      store: dev.store, work: dev.work, settings: dev.settings, transport: server.transport('u_dean'), account: 'u_dean', hash: syncHash,
      commitId: (() => { let i = 0; return () => dev.name + '-own-c' + (++i); })(),
      own: (fn) => { seen.depth += 1; try { return fn(); } finally { seen.depth -= 1; } },
    });
    return seen;
  };
  const onA = marked(a);
  const onB = marked(b);
  a.work.deleteProject(pid);
  expect(onA.stray.includes(TOMBSTONES_KEY), 'deleting a project is the person\'s change: it is heard, and a round follows');
  onA.stray.length = 0;
  let res = await onA.engine.syncAll();
  expect(statusOf(res, pid) === 'deleted' && onA.stray.length === 0, `settling the deletion is the engine's own writing (${onA.stray.join(', ')})`);
  res = await onB.engine.syncAll();
  expect(statusOf(res, pid) === 'forgot' && onB.stray.length === 0, `and so is forgetting the project on the other device (${onB.stray.join(', ')})`);
}

// ── 3. the page's own Persist tells its runner (the built bundle) ───────────
{
  const server = createMemoryServer({ hash: syncHash });
  const other = makeDevice(server, { name: 'other' });
  await other.engine.syncAll();
  const { pid: theirs } = await second(other, 'from the other device\n');

  const { P } = openTab(makeBrowserStorage());
  const pid = P.getActiveProjectId();
  const fid = P.getActiveFileId();
  P.setFileText(fid, 'one\n');
  P.setAccount('u_dean');
  P.claimProject(pid);
  const runner = P.startSync({ transport: server.transport('u_dean'), locks: lockManager() });
  await flush();
  await runner.syncNow();
  expect(runner.status().leader && runner.status().pending === false && P.listProjects().some((p) => p.id === theirs),
    'the page syncs: its project went up, the other device\'s came down');

  other.work.deleteProject(theirs);
  await other.engine.syncAll();
  await runner.syncNow();
  expect(!P.listProjects().some((p) => p.id === theirs), 'a project deleted on another device is forgotten here');
  expect(runner.status().pending === false && P.syncSummary().state === 'synced',
    `and forgetting it is not heard as a change of this page's waiting to sync (${P.syncSummary().state})`);
  P.setFileText(fid, 'one\ntwo\n');
  expect(runner.status().pending === true, 'while the person\'s own typing still is');
  await P.stopSync();
}

// ── 4. ⛔ a page that is left lets go of sync ─────────────────────────────────
// With home and the editor as two pages, leaving a page is everyday, and the
// browser may keep the page it left (its back/forward cache) with the sync
// lock still held: then no tab syncs. Leaving releases it.
{
  const server = createMemoryServer({ hash: syncHash });
  const storage = makeBrowserStorage();
  const locks = lockManager();
  const left = openTab(storage);
  left.P.setAccount('u_dean');
  const first = left.P.startSync({ transport: server.transport('u_dean'), locks });
  await flush();
  const waiting = openTab(storage);
  const next = waiting.P.startSync({ transport: server.transport('u_dean'), locks });
  await flush();
  expect(first.status().leader === true && next.status().leader === false, 'two tabs: the first syncs, the second waits for the lock');
  left.fire('pagehide', { persisted: true });
  await flush();
  await flush();
  expect(next.status().leader === true, 'the first tab is left (kept by the browser or not): the tab that waited syncs now');
  expect(first.status().leader === false && first.status().state === 'stopped', 'and the page that was left has stopped: it runs no round from the cache');
  await waiting.P.stopSync();
  // Signing out stops holding the lock, and leaving the page is what lets it go.
  const out = openTab(storage);
  const other = openTab(storage);
  const locks2 = lockManager();
  const mine = out.P.startSync({ transport: server.transport('u_dean'), locks: locks2 });
  await flush();
  const theirs = other.P.startSync({ transport: server.transport('u_dean'), locks: locks2 });
  await flush();
  await out.P.stopSync({ hold: true });
  await flush();
  await flush();
  expect(mine.status().state === 'stopped' && theirs.status().leader === false && !!locks2.holder(),
    'signing out stops this tab’s rounds without handing the lock to another tab');
  out.fire('pagehide', { persisted: true });
  await flush();
  await flush();
  expect(theirs.status().leader === true, 'and the page going lets it go, even after sync was stopped that way');
  await other.P.stopSync();
  // Coming back from the cache starts the page again: nothing of it is trusted.
  let reloaded = 0;
  const cached = openTab(storage, { location: { pathname: '/', search: '', hash: '', reload: () => { reloaded += 1; } } });
  cached.fire('pageshow', { persisted: false });
  expect(reloaded === 0, 'an ordinary load does not reload');
  cached.fire('pageshow', { persisted: true });
  expect(reloaded === 1, 'a page brought back from the browser’s cache starts again from storage');
}

console.log(`OK sync round writes (${n} checks: no commit for a project deleted mid-push, the engine's own writes are marked, the page's runner is told, a page that is left lets go of sync)`);
