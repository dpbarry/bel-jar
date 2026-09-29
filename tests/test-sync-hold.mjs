// "Back online: Ask me first" (js/persist/sync/hold.mjs): the real
// runner on a fake clock and lock, a fake engine whose network can fail and
// whose "what changed here" the test sets, and the real device table and
// settings on memory storage.
import { createSyncRunner } from '../js/persist/sync/runner.mjs';
import { createHoldPolicy, HELD_ROW } from '../js/persist/sync/hold.mjs';
import { createStore, createMemoryStorage } from '../js/persist/store.mjs';
import { createTable } from '../js/persist/table.mjs';
import { DEVICE, DEVICE_KEY } from '../js/persist/device-schema.mjs';
import { createSettings } from '../js/persist/settings.mjs';
import { flush, clock, lockManager, storeStub } from './_runner-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const OPTS = { quietMs: 5000, maxWaitMs: 30000, pollMs: 60000, backoff: [5000, 15000, 60000] };
const CHANGE = { key: 'beljar/p/p1/f/f1', cls: 'work', origin: 'local' };
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };

function engineFake() {
  const e = { calls: 0, offline: false, changes: [] };
  e.syncAll = async () => {
    e.calls += 1;
    if (e.offline) throw Object.assign(new Error('sync: heads could not reach the server'), { offline: true });
    return { projects: {}, settings: { status: 'clean' } };
  };
  e.localChanges = async () => e.changes.slice();
  return e;
}

/** One tab: a runner and its policy. `from` shares another tab's device and settings (one browser). */
function tab(o = {}) {
  const c = o.clock || clock();
  let device = o.from && o.from.device;
  let settings = o.from && o.from.settings;
  if (!device) {
    const store = createStore({ storage: o.storage || createMemoryStorage(), events: null });
    device = createTable(store, { key: DEVICE_KEY, rows: DEVICE });
    settings = createSettings(store);
    if (o.ask !== false) settings.set('syncReconnect', 'ask');
  }
  const bus = storeStub();
  const engine = engineFake();
  const net = o.net || { online: true };
  const runner = createSyncRunner({ engine, store: bus, locks: o.locks || lockManager(), timers: c.timers, now: c.now, ...OPTS });
  const policy = createHoldPolicy({ runner, engine, device, settings, account: o.account || 'u_1', online: () => net.online });
  return { c, device, settings, bus, engine, net, runner, policy, held: () => runner.status().held === true };
}

/** A tab that went offline and made an edit: held. */
async function heldTab(o) {
  const t = tab(o);
  t.runner.start();
  await settle();
  t.net.online = false;
  t.engine.offline = true;
  t.engine.changes = [{ pid: 'p1', files: [] }];
  t.bus.emit(CHANGE);
  await settle();
  return t;
}

// ── "Upload them" (the default): nothing is ever held ───────────────────────
{
  const t = tab({ ask: false });
  t.runner.start();
  await settle();
  t.net.online = false;
  t.engine.offline = true;
  t.engine.changes = [{ pid: 'p1', files: [] }];
  t.bus.emit(CHANGE);
  await t.c.advance(OPTS.quietMs);
  await settle();
  expect(!t.held() && t.engine.calls === 2 && t.device.get(HELD_ROW) === '', 'the default: an edit made offline is not held; rounds keep trying');
}

// ── "Ask me first" ───────────────────────────────────────────────────
{
  const t = tab();
  t.runner.start();
  await settle();
  expect(t.engine.calls === 1 && !t.held(), 'online: rounds run as ever');
  t.net.online = false;
  t.engine.offline = true;
  t.policy.check(); // the browser's "offline" event
  await settle();
  expect(!t.held(), 'going offline with nothing waiting holds nothing');
  t.engine.changes = [{ pid: 'p1', files: [] }];
  t.bus.emit(CHANGE);
  expect(t.held() && t.device.get(HELD_ROW) === 'u_1', 'an edit made offline: held at once, and the device remembers for whom');
  await t.c.advance(OPTS.maxWaitMs + OPTS.pollMs);
  expect(t.engine.calls === 1, 'no round while held, however long');
  t.net.online = true;
  t.engine.offline = false;
  t.policy.check(); // "online"
  await settle();
  expect(t.held() && t.engine.calls === 1, 'back online with edits waiting: still held, for the person to decide');
  await t.runner.release();
  await settle();
  expect(!t.held() && t.engine.calls === 2 && t.device.get(HELD_ROW) === '', 'Upload: the round runs, and the device forgets the hold');
  t.bus.emit(CHANGE);
  await t.c.advance(OPTS.quietMs);
  expect(t.engine.calls === 3 && !t.held(), 'and online edits sync as before');
}
{
  // Upload with the server still out of reach (the browser thinks it is online).
  const t = await heldTab();
  t.net.online = true;
  const calls = t.engine.calls;
  await t.runner.release();
  await settle();
  expect(t.engine.calls === calls + 1, 'Upload tries a round at once, though the last one could not reach the server');
  expect(t.held() && t.device.get(HELD_ROW) === 'u_1', 'still unreachable: held again, nothing sent and nothing lost');
}
{
  // The runner last said "offline" (a poll that failed), then an edit: held.
  // Upload must not read as released-and-still-offline before its round.
  const t = tab();
  t.runner.start();
  await settle();
  t.net.online = false;
  t.engine.offline = true;
  await t.c.advance(OPTS.pollMs);
  await settle();
  expect(t.runner.status().state === 'offline' && !t.held(), 'a poll that could not reach the server, nothing waiting: offline, not held');
  t.engine.changes = [{ pid: 'p1', files: [] }];
  t.bus.emit(CHANGE);
  expect(t.held(), 'then an edit: held');
  t.net.online = true;
  t.engine.offline = false;
  const calls = t.engine.calls;
  await t.runner.release();
  await settle();
  expect(t.engine.calls === calls + 1 && !t.held() && t.runner.status().state === 'idle',
    'Upload after the runner last said offline: the round runs, and nothing holds it again first');
}
{
  // An edit heard during the round that fails.
  const t = tab();
  t.runner.start();
  await settle();
  t.engine.offline = true;
  t.bus.emit(CHANGE);
  await t.c.advance(OPTS.quietMs);
  await settle();
  expect(t.held(), 'a round that could not carry an edit, with the browser still claiming online: held');
}

// ── the hold outlives a reload, and moves with the syncing tab ──────────────
{
  const storage = createMemoryStorage();
  const t1 = await heldTab({ storage });
  t1.policy.stop();
  await t1.runner.stop();
  const t2 = tab({ storage });
  t2.engine.changes = [{ pid: 'p1', files: [] }]; // the edits are in storage
  t2.runner.start();
  await settle();
  expect(t2.held() && t2.engine.calls === 0 && t2.device.get(HELD_ROW) === 'u_1', 'a reload keeps the hold: the first round waits');
  t2.policy.stop();
  await t2.runner.stop();
  const t3 = tab({ storage }); // reloaded after the edits were undone in another tab
  t3.runner.start();
  await settle();
  expect(!t3.held() && t3.engine.calls === 1 && t3.device.get(HELD_ROW) === '', 'a reload with nothing left waiting lets it go');
  const other = tab({ storage, account: 'u_2' });
  other.runner.start();
  await settle();
  expect(!other.held() && other.engine.calls === 1, 'another account signed in on the device is not held by it');
}
{
  // Offline from the start, the edits in storage from before the reload.
  const t = tab({ net: { online: false } });
  t.engine.offline = true;
  t.engine.changes = [{ pid: 'p1', files: [] }];
  t.runner.start();
  await settle();
  expect(t.held() && t.device.get(HELD_ROW) === 'u_1', 'opened offline with edits the cloud lacks: held once they are read');
  const quiet = tab({ net: { online: false } });
  quiet.engine.offline = true;
  quiet.runner.start();
  await settle();
  expect(!quiet.held(), 'opened offline with nothing waiting: nothing held');
}
{
  const locks = lockManager();
  const c = clock();
  const net = { online: true };
  const t1 = await heldTab({ locks, clock: c, net });
  const t2 = tab({ locks, clock: c, net, from: t1 });
  t2.engine.changes = t1.engine.changes; // one browser, one storage
  t2.runner.start();
  await settle();
  expect(!t2.runner.status().leader && t2.engine.calls === 0, 'a second tab waits for the lock');
  await t1.runner.stop(); // the tab that held it closes
  await settle();
  expect(t2.runner.status().leader && t2.held() && t2.engine.calls === 0, 'the next tab to sync takes up the hold, and sends nothing');
}

// ── released without the person ─────────────────────────────────────────────
{
  const t = await heldTab();
  t.engine.changes = []; // undone, or the cloud's version taken in another tab
  t.engine.offline = false;
  t.net.online = true;
  const calls = t.engine.calls;
  t.policy.check();
  await settle();
  expect(!t.held() && t.engine.calls === calls + 1 && t.device.get(HELD_ROW) === '', 'back online to nothing waiting: released, and a round runs');
}
{
  const t = await heldTab();
  t.engine.offline = false;
  t.net.online = true;
  t.settings.set('syncReconnect', 'upload');
  t.policy.check(); // persist.mjs looks again when the setting changes
  await settle();
  expect(!t.held() && t.device.get(HELD_ROW) === '', 'the setting back to "Upload them": what waited goes');
}
{
  const t = await heldTab();
  t.policy.stop();
  t.runner.stop();
  expect(t.device.get(HELD_ROW) === 'u_1', 'stopping (signing out) keeps the hold for the next sign-in');
}

console.log(`OK sync hold (${n} checks: never by default, held offline, Upload, still unreachable, a reload, opened offline, the next tab, nothing waiting, the setting, sign-out)`);
