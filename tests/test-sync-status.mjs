// What sync is doing, the same in every tab (js/persist/sync/sync-status.mjs),
// and the runner's side of it (pending, safe). The tabs here share a bus that
// behaves like the storage event: a tab never hears its own messages.
import { summarize, createSyncStatus, STATUS_MESSAGE, ASK_MESSAGE } from '../js/persist/sync/sync-status.mjs';
import { createSyncRunner, roundIsSafe } from '../js/persist/sync/runner.mjs';
import { makeBrowserStorage, openTab } from './_persist-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── the summary's order: what needs the person first ─────────────────────────
{
  const file = [{ pid: 'p', fid: 'f', path: 'a.bel', source: 'device' }];
  const st = (x) => summarize(Object.assign({ account: 'u_1', online: true, differs: [] }, x)).state;
  expect(summarize({ account: null, runner: null, online: true, differs: [] }).state === 'off', 'signed out: nothing to say about the cloud');
  expect(summarize({ account: null, runner: null, online: true, differs: file }).state === 'differs', 'signed out, two tabs can still differ');
  expect(st({ differs: file, runner: { state: 'offline' } }) === 'differs', 'files to review outrank being offline');
  expect(st({ runner: { state: 'idle', lastSync: 5 }, online: false }) === 'offline', 'the browser says offline: offline, before any round fails');
  expect(st({ runner: { state: 'offline' } }) === 'offline', 'a round that could not reach the server: offline');
  expect(st({ runner: { state: 'error', error: 'boom' } }) === 'error', 'a failed round: error');
  expect(summarize({ account: 'u', online: true, differs: [], runner: { state: 'error', error: 'boom' } }).error === 'boom', 'and it carries the reason');
  expect(st({ runner: { state: 'syncing', lastSync: 5 } }) === 'syncing', 'a round in flight: syncing');
  expect(st({ runner: { state: 'idle', pending: true, lastSync: 5 } }) === 'pending', 'a change waiting for the next round: pending');
  expect(st({ runner: { state: 'idle', lastSync: 5 } }) === 'synced', 'nothing waiting: synced');
  expect(st({ runner: { state: 'idle' } }) === 'syncing', 'signed in and no round finished yet: syncing, never a false "synced"');
  // Held ("Back online: Ask me first"): the edits wait for the person.
  expect(st({ runner: { state: 'offline', held: true }, online: false }) === 'offline', 'held while the browser is offline: offline, nothing to do yet');
  expect(st({ runner: { state: 'offline', held: true } }) === 'held', 'held and back online: held, though the runner last said offline');
  expect(st({ runner: { state: 'idle', held: true, lastSync: 5 } }) === 'held', 'held outranks synced');
  expect(st({ runner: { state: 'error', held: true } }) === 'held', 'and a failed round');
  expect(st({ differs: file, runner: { state: 'idle', held: true } }) === 'differs', 'files to review still come first');
}

// ── two tabs, one lock ──────────────────────────────────────────────────────
function makeBus() {
  const tabs = [];
  return {
    tab() {
      const me = { fns: new Set() };
      tabs.push(me);
      return {
        post(kind, msg) {
          const copy = JSON.parse(JSON.stringify(msg));
          for (const t of tabs) if (t !== me) for (const fn of t.fns) queueMicrotask(() => fn(kind, copy));
        },
        on(fn) { me.fns.add(fn); return () => me.fns.delete(fn); },
      };
    },
  };
}

function fakeRunner(leader) {
  let status = { state: leader ? 'idle' : 'waiting', leader, lastSync: leader ? 100 : 0, pending: false, safe: leader };
  const fns = new Set();
  const r = {
    rounds: 0,
    next: { projects: { p: { status: 'clean' } } },
    status: () => status,
    subscribe(fn) { fns.add(fn); return () => fns.delete(fn); },
    set(patch) { status = Object.assign({}, status, patch); for (const fn of fns) fn(status); },
    async syncNow() {
      r.rounds += 1;
      const res = r.next;
      r.set({ state: 'idle', lastSync: status.lastSync + 1, safe: roundIsSafe(res), pending: false });
      return res;
    },
    releases: 0,
    hold() { r.set({ held: true }); },
    async release() {
      r.releases += 1;
      r.set({ held: false });
      return r.syncNow();
    },
  };
  return r;
}

{
  const bus = makeBus();
  const conflicts = [];
  const make = () => createSyncStatus({ account: () => 'u_1', conflicts: () => conflicts, tabs: bus.tab(), online: () => true });
  const leaderTab = make();
  const otherTab = make();
  const leadRunner = fakeRunner(true);
  const otherRunner = fakeRunner(false);
  leaderTab.attach(leadRunner);
  otherTab.attach(otherRunner);
  await tick();
  expect(leaderTab.summary().state === 'synced', 'the syncing tab reads its own runner');
  expect(otherTab.summary().state === 'synced', `a tab that opens asks, and shows what the syncing tab says (${otherTab.summary().state})`);

  const heard = [];
  otherTab.subscribe((s) => heard.push(s.state));
  leadRunner.set({ state: 'syncing' });
  await tick();
  leadRunner.set({ state: 'offline', error: 'unreachable' });
  await tick();
  expect(heard.join() === 'syncing,offline', `every tab follows the syncing tab (${heard.join()})`);

  leadRunner.set({ state: 'offline' });
  await tick();
  expect(heard.length === 2, 'a message that changes nothing the summary says is not news');

  conflicts.push({ pid: 'p', fid: 'f', path: 'a.bel', source: 'device' });
  otherTab.refresh();
  expect(otherTab.summary().state === 'differs' && heard[heard.length - 1] === 'differs', 'a file changed in two places reaches the summary on refresh');
  conflicts.length = 0;
  otherTab.refresh();

  // Signing out from the tab that does not sync.
  leadRunner.set({ state: 'idle' });
  await tick();
  const yes = await otherTab.confirm(1000);
  expect(yes.ok === true && leadRunner.rounds === 1, `a non-syncing tab asks, the syncing tab runs the round and answers safe (${JSON.stringify(yes)})`);
  leadRunner.next = { projects: { p: { status: 'error', message: 'no' } } };
  const no = await otherTab.confirm(1000);
  expect(no.ok === false && leadRunner.rounds === 2, 'and answers unsafe when a project could not sync');
  leadRunner.next = { projects: { p: { status: 'pushed' } } };
  const own = await leaderTab.confirm(1000);
  expect(own.ok === true && leadRunner.rounds === 3, 'the syncing tab confirms by itself');

  // Held: every tab shows it, and Upload from any tab lets the rounds go.
  leadRunner.hold();
  await tick();
  expect(otherTab.summary().state === 'held', `a tab that does not sync shows the hold (${otherTab.summary().state})`);
  const up = await otherTab.release(1000);
  expect(up.ok === true && leadRunner.releases === 1 && leadRunner.rounds === 4, `Upload in a tab that does not sync: the syncing tab releases, and a round runs (${JSON.stringify(up)})`);
  await tick();
  expect(otherTab.summary().state === 'synced' && leaderTab.summary().state === 'synced', 'and every tab hears it');
  leadRunner.hold();
  expect((await leaderTab.release(1000)).ok === true && leadRunner.releases === 2, 'the syncing tab releases by itself');
}

{
  // Nobody holds the lock (or the syncing tab closed): the ask times out, never hangs.
  const bus = makeBus();
  const lone = createSyncStatus({ account: () => 'u_1', conflicts: () => [], tabs: bus.tab(), online: () => true });
  lone.attach(fakeRunner(false));
  const t0 = Date.now();
  const r = await lone.confirm(60);
  expect(r.ok === false && r.reason === 'no-answer' && Date.now() - t0 < 1000, `no syncing tab: "no answer" after the wait (${JSON.stringify(r)})`);
  const off = createSyncStatus({ account: () => 'u_1', conflicts: () => [], tabs: bus.tab() });
  expect((await off.confirm(10)).reason === 'not-syncing', 'sync never started: not safe, and says why');
  const gone = await lone.release(60);
  expect(gone.ok === false && gone.reason === 'no-answer', 'Upload with no syncing tab: "no answer", never a hang');
}

// ── the runner: pending and safe ────────────────────────────────────────────
{
  let storeFn = null;
  let release = null;
  let result = { projects: { p: { status: 'pushed' } } };
  const engine = { syncAll: () => new Promise((resolve) => { release = () => resolve(result); }) };
  const timers = { set: () => 0, clear: () => {} };
  const runner = createSyncRunner({
    engine,
    store: { subscribe: (fn) => { storeFn = fn; return () => {}; } },
    locks: { request: (name, opts, fn) => fn() },
    timers,
  });
  runner.start();
  release();
  await tick();
  expect(runner.status().safe === true && runner.status().pending === false, 'a clean first round: safe, nothing pending');

  storeFn({ origin: 'local', cls: 'work' });
  expect(runner.status().pending === true, 'a change heard: pending until a round carries it');
  const r1 = runner.syncNow();
  await tick();
  storeFn({ origin: 'local', cls: 'work' }); // typed during the round
  release();
  await r1;
  expect(runner.status().pending === true, 'a change made during a round waits for the next one');
  const r2 = runner.syncNow();
  await tick();
  release();
  await r2;
  expect(runner.status().pending === false, 'and the next round carries it');

  result = { projects: { p: { status: 'error', message: 'refused' } } };
  storeFn({ origin: 'local', cls: 'work' });
  const r3 = runner.syncNow();
  await tick();
  release();
  await r3;
  expect(runner.status().pending === true && runner.status().safe === false, 'a round that failed for a project keeps the change pending, and is not safe');
  runner.stop();
}

// ── the messages can be stored at all ───────────────────────────────────────
// Every key the store writes must match a declared class (store.mjs CLASSES).
// Posting from inside the runner's listener threw where nobody saw it, and every
// tab's cloud stopped moving: the real Persist, both kinds, both ways.
{
  const storage = makeBrowserStorage();
  const one = openTab(storage);
  const two = openTab(storage);
  const heard = [];
  two.P.onTabMessage((kind) => heard.push(kind));
  let threw = null;
  try {
    one.P.postTabMessage(STATUS_MESSAGE, { state: 'idle', at: 1 });
    one.P.postTabMessage(ASK_MESSAGE, { id: 'x', at: 2 });
  } catch (e) {
    threw = e;
  }
  expect(!threw, `both sync messages can be stored (${threw && threw.message})`);
  expect(heard.includes(STATUS_MESSAGE) && heard.includes(ASK_MESSAGE), `and the other tab hears them (${heard.join()})`);
}

console.log(`OK sync status (${n} checks: the state order, every tab told the same, asking the syncing tab, held and released from any tab, the time limit, pending and safe, the messages stored)`);
