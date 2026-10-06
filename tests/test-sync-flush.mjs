// What you typed is in the cloud when the tab closes (plan v6 c2;
// js/persist/sync/engine.mjs, docs/PERSIST.md §5).
//
// A push is ONE request: the commit carries the texts the last synced version
// did not have, and the server answers what else it lacks. And the page going
// out of sight sends what waits for the quiet spell at once (`flush`),
// synchronously up to the send, each project in one request that outlives the
// page. Held here: the requests a round makes; that a flush records its commit
// as pending before anything is sent, so one never answered is settled by
// sending it again and is never committed twice; that a commit in flight is
// sent again, never overtaken; that the budget a closing page has leaves the
// rest for the next round; and that a flush in the middle of a round never
// makes a device merge against its own work.
import { createMemoryServer } from '../js/persist/sync/memory-server.mjs';
import { syncKey } from '../js/persist/keys.mjs';
import { createSyncRunner } from '../js/persist/sync/runner.mjs';
import { createSyncEngine } from '../js/persist/sync/engine.mjs';
import { makeDevice, syncHash, fileId, addFile, projectState } from './_sync-env.mjs';
import { makeBrowserStorage, openTab } from './_persist-env.mjs';
import { flush, lockManager } from './_runner-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

/** A transport that counts what it is asked, by method. */
function counting(real) {
  const calls = [];
  const t = {};
  for (const k of Object.keys(real)) t[k] = (...a) => { calls.push(k); return real[k](...a); };
  return { t, calls };
}

const pending = (dev, pid) => (dev.store.get(syncKey(pid)) || {}).pending || null;
const versionsOf = (server, pid) => server.history(pid).versions.length;

/** A device with one synced project, and its main file. */
async function synced(server, name, transport) {
  const dev = makeDevice(server, { name, transport });
  const pid = dev.work.projectId();
  await dev.engine.syncAll();
  return { dev, pid, fid: fileId(dev.work, pid, 'main.bel') };
}

// ── 1. a push is one request ─────────────────────────────────────────────────
{
  const server = createMemoryServer({ hash: syncHash });
  const { t, calls } = counting(server.transport('u_dean'));
  const { dev, pid, fid } = await synced(server, 'A', t);
  dev.work.setText(fid, 'one line\n', pid);
  addFile(dev.work, pid, 'more.bel', 'another\n');
  calls.length = 0;
  const res = await dev.engine.syncAll();
  const forProject = calls.filter((c) => c !== 'heads' && c !== 'settings' && c !== 'commitSettings');
  expect(res.projects[pid].status === 'pushed' && forProject.join() === 'commit',
    `an edit and a new file go up in one request: the commit carries their texts (${calls.join(', ')})`);
  expect(server.text('u_dean', server.history(pid).versions[1].manifest.files.find((f) => f.path === 'more.bel').hash) === 'another\n',
    'and the server holds what it carried');
  const b = makeDevice(server, { name: 'B' });
  await b.engine.syncAll();
  expect(projectState(b.work, pid).files.map((f) => f.text).join('|') === 'one line\n|another\n', 'another device gets it all');

  // The server lacked a text it was not sent (another device deleted nothing; here
  // the pool is simply emptied of one): it says so, and a second request carries it.
  const lacks = createMemoryServer({ hash: syncHash });
  const real = lacks.transport('u_dean');
  const c2 = counting(real);
  const { dev: d2, pid: p2, fid: f2 } = await synced(lacks, 'C', c2.t);
  const stale = { ...d2.store.get(syncKey(p2)) };
  // This device's record claims a version whose texts the server never had (a store rolled back, say).
  const ghost = { v: 1, name: stale.manifest.name, createdAt: stale.manifest.createdAt, files: stale.manifest.files.map((f) => ({ ...f, hash: 'f'.repeat(64) })), folders: [], suites: {} };
  d2.store.set(syncKey(p2), { version: stale.version, manifest: ghost, pending: null });
  d2.work.setText(f2, 'x\n', p2);
  c2.calls.length = 0;
  // The edited text is fresh and goes with the commit; nothing else is missing: still one request.
  let r2 = await d2.engine.syncAll();
  expect(r2.projects[p2].status === 'pushed', 'the server took it');
  expect(c2.calls.filter((c) => c === 'commit').length === 1, 'in one commit');
}

// ── 2. the page going out of sight sends at once ─────────────────────────────
{
  const server = createMemoryServer({ hash: syncHash });
  const real = server.transport('u_dean');
  const { dev, pid, fid } = await synced(server, 'A2', real);
  const before = versionsOf(server, pid);
  dev.work.setText(fid, 'typed a second before the tab closed\n', pid);
  const sends = [];
  let answer;
  const send = (p, body) => {
    // ⛔ Recorded as pending before anything is sent: a page that dies with the request sends it again next time.
    sends.push({ pid: p, body, pendingFirst: !!pending(dev, p) && pending(dev, p).id === body.id });
    return new Promise((resolve) => { answer = () => real.commit(p, body).then(resolve); });
  };
  const sent = dev.engine.flush(send, 64 * 1024);
  expect(Array.isArray(sent) && sent.join() === pid && sends.length === 1, 'the project changed here goes, in one request');
  expect(sends[0].pendingFirst, '⛔ its commit is recorded as pending before it is sent');
  expect(Object.keys(sends[0].body.texts).length === 1 && Object.values(sends[0].body.texts)[0] === 'typed a second before the tab closed\n',
    'carrying the one text the server lacks');
  // The page closes: the request goes on without it.
  await answer();
  expect(versionsOf(server, pid) === before + 1, 'and lands, though nobody is there to hear the answer');
  const b = makeDevice(server, { name: 'B2' });
  await b.engine.syncAll();
  expect(projectState(b.work, pid).files[0].text === 'typed a second before the tab closed\n', 'the other device has what was typed');
  // Opened again here: the pending commit is sent again, answered as already made.
  await new Promise((r) => setImmediate(r));
  const res = await dev.engine.syncAll();
  expect(['clean', 'pushed'].includes(res.projects[pid].status) && versionsOf(server, pid) === before + 1 && !pending(dev, pid),
    'opened again, its commit is settled as made: never committed twice');

  // Nothing changed: nothing is sent.
  expect(dev.engine.flush(() => { throw new Error('nothing to send'); }, 64 * 1024).length === 0, 'with nothing waiting, nothing is sent');
}

// ── 3. heard when the page lives (a tab switched away from): settled at once ─
{
  const server = createMemoryServer({ hash: syncHash });
  const real = server.transport('u_dean');
  const { dev, pid, fid } = await synced(server, 'A3', real);
  dev.work.setText(fid, 'switched away\n', pid);
  const answers = [];
  dev.engine.flush((p, body) => { const pr = real.commit(p, body); answers.push(pr); return pr; }, 64 * 1024);
  await Promise.all(answers);
  await new Promise((r) => setImmediate(r));
  const rec = dev.store.get(syncKey(pid));
  expect(!rec.pending && rec.version === versionsOf(server, pid), 'the answer settles the commit: nothing waits');
}

// ── 4. a commit in flight is left to go on, never overtaken ──────────────────
// The page hides while a round's commit is on its way. Sent again from the
// flush without its texts, it came back "missing" and cleared the record while
// the first was still in flight: a commit made over it next merged against
// this device's own work. The flush leaves it; the request goes on, or, cut
// off with the page, is sent again at the next open.
{
  const server = createMemoryServer({ hash: syncHash });
  const real = server.transport('u_dean');
  let holding = true;
  let release = null;
  const t = Object.assign({}, real, {
    commit: (...a) => (holding
      ? new Promise((resolve) => { holding = false; release = () => real.commit(...a).then(resolve); })
      : real.commit(...a)),
  });
  const { dev, pid, fid } = await synced(server, 'A4', real);
  // Its own name: a commit id is what makes a retry a replay, so two engines must never share one.
  const slow = makeDevice(server, { name: 'A4b', storage: dev.storage, transport: t });
  slow.work.setText(fid, 'a round is sending this\n', pid);
  const round = slow.engine.syncAll();
  await new Promise((r) => setImmediate(r));
  const inFlight = pending(slow, pid);
  expect(!!inFlight && typeof release === 'function', 'a round has a commit of it in flight');
  slow.work.setText(fid, 'a round is sending this\nand more, as the page hides\n', pid);
  const bodies = [];
  const sent = slow.engine.flush((p, body) => { bodies.push(body); return real.commit(p, body); }, 64 * 1024);
  expect(sent.length === 0 && bodies.length === 0 && pending(slow, pid).id === inFlight.id,
    'the page hiding leaves it: no second commit over the same version, and the record still names the one in flight');
  release();
  await round;
  await slow.engine.syncAll();
  const vs = server.history(pid).versions;
  expect(server.text('u_dean', vs[vs.length - 1].manifest.files[0].hash) === 'a round is sending this\nand more, as the page hides\n',
    'the round after carries the rest: nothing is lost');
  expect(!slow.work.listConflicts().length, 'and no device was asked to choose against its own work');
}

// ── 5. what a closing page may send ──────────────────────────────────────────
{
  const server = createMemoryServer({ hash: syncHash });
  const real = server.transport('u_dean');
  const { dev, pid, fid } = await synced(server, 'A5', real);
  dev.work.setText(fid, 'x'.repeat(70 * 1024), pid);
  const sent = dev.engine.flush(() => { throw new Error('must not be sent'); }, 64 * 1024);
  expect(sent.length === 0 && !pending(dev, pid), 'more than a closing page may send waits for the next round, as it always did, with nothing left pending');
  const res = await dev.engine.syncAll();
  expect(res.projects[pid].status === 'pushed', 'and the next round sends it');
}

// ── 6. a flush in the middle of a round ──────────────────────────────────────
// The page hides while a round is between reading the project and committing
// it: the round must not commit over the flush's commit. It finds it, settles
// it, and goes on from there.
{
  const server = createMemoryServer({ hash: syncHash });
  const real = server.transport('u_dean');
  let midway = null;
  const t = Object.assign({}, real, {
    heads: async (...a) => { const r = await real.heads(...a); if (midway) { const go = midway; midway = null; go(); } return r; },
  });
  const { dev, pid, fid } = await synced(server, 'A6', real);
  const dev2 = makeDevice(server, { name: 'A6b', storage: dev.storage, transport: t });
  dev2.work.setText(fid, 'typed\n', pid);
  midway = () => dev2.engine.flush((p, body) => real.commit(p, body), 64 * 1024);
  const before = versionsOf(server, pid);
  const res = await dev2.engine.syncAll();
  expect(['clean', 'pushed'].includes(res.projects[pid].status) && !pending(dev2, pid), `the round settles the flushed commit and finishes (${res.projects[pid].status})`);
  expect(versionsOf(server, pid) === before + 1, 'one version, not two: the round did not commit over it');
  expect(!dev2.work.listConflicts().length, 'and nothing was merged against this device\'s own work');
}

// ── 7. the runner: only the tab that syncs, never while held ─────────────────
{
  const server = createMemoryServer({ hash: syncHash });
  const real = server.transport('u_dean');
  const { dev, pid, fid } = await synced(server, 'A7', real);
  const locks = lockManager();
  const leader = createSyncRunner({ engine: dev.engine, store: dev.store, locks });
  const waiting = createSyncRunner({ engine: dev.engine, store: dev.store, locks });
  leader.start();
  waiting.start();
  await flush();
  dev.work.setText(fid, 'held back\n', pid);
  expect(waiting.flush((p, b) => real.commit(p, b), 64 * 1024).length === 0, 'a tab that does not sync sends nothing: the one that does has it');
  leader.hold();
  expect(leader.flush((p, b) => real.commit(p, b), 64 * 1024).length === 0 && !pending(dev, pid),
    'held for the person ("Back online: Ask me first"), nothing goes: it is theirs to look at first');
  await leader.release();
  await leader.stop();
  expect(leader.flush((p, b) => real.commit(p, b), 64 * 1024).length === 0, 'stopped, nothing goes');
  await waiting.stop();
}

// ── 8. the page: out of sight, it sends (the built bundle) ───────────────────
{
  const server = createMemoryServer({ hash: syncHash });
  const real = server.transport('u_dean');
  const doc = { visibilityState: 'visible', readyState: 'complete', addEventListener() {}, removeEventListener() {} };
  const nav = { onLine: true };
  const { P, fire } = openTab(makeBrowserStorage(), { document: doc, navigator: nav });
  const pid = P.getActiveProjectId();
  const fid = P.getActiveFileId();
  P.setAccount('u_dean');
  P.claimProject(pid);
  const onHide = [];
  const transport = Object.assign({}, real, { commitOnHide: (p, body) => { onHide.push(body); return real.commit(p, body); } });
  const runner = P.startSync({ transport, locks: lockManager() });
  await flush();
  await runner.syncNow();
  P.setFileText(fid, 'typed, and the tab closed\n');
  doc.visibilityState = 'hidden';
  fire('visibilitychange');
  expect(onHide.length === 1 && Object.values(onHide[0].texts).includes('typed, and the tab closed\n'),
    'out of sight, the page sends what was typed at once, by the request that outlives it');
  await flush();
  const b = makeDevice(server, { name: 'B8' });
  await b.engine.syncAll();
  expect(projectState(b.work, pid).files[0].text === 'typed, and the tab closed\n', 'and another device has it, with no round run here');
  doc.visibilityState = 'visible';
  fire('visibilitychange');
  P.setFileText(fid, 'typed offline\n');
  nav.onLine = false;
  doc.visibilityState = 'hidden';
  fire('visibilitychange');
  expect(onHide.length === 1, 'offline, nothing is sent: the next round, online, takes it');
  await P.stopSync();
}

// ── 9. a commit given up on, delivered late ──────────────────────────────────
// A request that runs out of time is abandoned (http-transport.mjs), and the
// server may still act on it after. The next round sends the commit again:
// WHOLE, its texts kept with it in the record. Sent bare, it came back
// "missing" (its texts were only in the first), the record let it go, the first
// landed a moment later, and the device was asked to choose against its own
// commit at the next merge.
{
  const server = createMemoryServer({ hash: syncHash });
  const real = server.transport('u_dean');
  let late = null;
  let calls = 0;
  const t = Object.assign({}, real, {
    commit: async (p, body) => {
      calls += 1;
      if (calls === 1) {
        late = () => real.commit(p, JSON.parse(JSON.stringify(body)));
        throw new Error('timed out');
      }
      const res = await real.commit(p, body);
      // The first, given up on, reaches the server only now.
      if (late) { const go = late; late = null; await go(); }
      return res;
    },
  });
  const { dev, pid, fid } = await synced(server, 'A9', real);
  const slow = makeDevice(server, { name: 'A9b', storage: dev.storage, transport: t });
  slow.work.setText(fid, 'first\n', pid);
  await slow.engine.syncAll().catch(() => null);
  expect(!!pending(slow, pid) && !!pending(slow, pid).texts, 'given up on, the commit stays pending, with its texts');
  slow.work.setText(fid, 'first, then more\n', pid);
  await slow.engine.syncAll();
  await slow.engine.syncAll();
  expect(!slow.work.listConflicts().length, 'sent again whole, it lands or is answered as landed: no device chooses against its own commit');
  const vs = server.history(pid).versions;
  expect(server.text('u_dean', vs[vs.length - 1].manifest.files[0].hash) === 'first, then more\n', 'and what came after it follows');
}

// ── 10. the page hides while a round hashes ──────────────────────────────────
// In a browser the hash is a real wait (Web Crypto), and the page can go out of
// sight in it: the flush records its own commit then. The round must not record
// a second over the same version: it finds the first and settles it.
{
  const server = createMemoryServer({ hash: syncHash });
  const real = server.transport('u_dean');
  const { dev, pid, fid } = await synced(server, 'A10', real);
  let during = null;
  const engine = createSyncEngine({
    store: dev.store, work: dev.work, settings: dev.settings, transport: real, account: 'u_dean',
    hash: async (text) => {
      const h = await syncHash(text);
      if (during && text === 'typed\n') { const go = during; during = null; go(); }
      return h;
    },
    commitId: (() => { let i = 0; return () => 'A10b-c' + (++i); })(),
  });
  dev.work.setText(fid, 'typed\n', pid);
  during = () => {
    engine.flush((p, body) => real.commit(p, body), 64 * 1024);
    // and the person types on, on the same line
    dev.work.setText(fid, 'typed, and on\n', pid);
  };
  await engine.syncAll();
  await engine.syncAll();
  expect(!dev.work.listConflicts().length, 'the round settles the flushed commit instead of committing over it: nothing to choose against its own work');
  const vs = server.history(pid).versions;
  expect(server.text('u_dean', vs[vs.length - 1].manifest.files[0].hash) === 'typed, and on\n', 'and the typing after it follows');
}

console.log(`OK sync flush (${n} checks: a push is one request, the page hiding sends at once, pending before sent, settled once, a commit in flight left to go on, the closing page's budget, a flush mid-round, only the tab that syncs, the page out of sight, a commit delivered late, hidden mid-hash)`);
