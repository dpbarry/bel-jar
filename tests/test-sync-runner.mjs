// When sync runs (js/persist/sync/runner.mjs): one tab per browser, a quiet
// spell after changes, a longest wait, a poll, backoff, and never two rounds
// at once. Fake clocks, a fake lock manager and a fake engine: each rule is
// seen to happen at the moment it should.
import { createSyncRunner, SYNC_LOCK } from '../js/persist/sync/runner.mjs';
import { TOMBSTONES_KEY } from '../js/persist/keys.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const flush = () => new Promise((r) => setImmediate(r));

function clock() {
  let t = 0;
  const due = [];
  return {
    now: () => t,
    timers: {
      set(fn, ms) { const h = { at: t + ms, fn }; due.push(h); return h; },
      clear(h) { const i = due.indexOf(h); if (i >= 0) due.splice(i, 1); },
    },
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        due.sort((a, b) => a.at - b.at);
        if (!due.length || due[0].at > end) break;
        const h = due.shift();
        t = h.at;
        h.fn();
        await flush();
      }
      t = end;
      await flush();
    },
  };
}

/** The Web Locks API, as far as the runner uses it: one holder, the rest queue. */
function lockManager() {
  const queue = [];
  let held = null;
  function grant() {
    if (held || !queue.length) return;
    held = queue.shift();
    Promise.resolve(held.fn()).then(() => { held = null; grant(); });
  }
  return {
    request(name, opts, fn) {
      return new Promise((resolve, reject) => {
        const entry = { name, fn, reject };
        if (opts && opts.signal) {
          opts.signal.addEventListener('abort', () => {
            const i = queue.indexOf(entry);
            if (i >= 0) { queue.splice(i, 1); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }
          });
        }
        queue.push(entry);
        grant();
        resolve();
      });
    },
    holder: () => held,
  };
}

function engineStub() {
  const e = { calls: 0, active: 0, maxActive: 0, fail: null, gate: null };
  e.syncAll = async () => {
    e.calls += 1;
    e.active += 1;
    e.maxActive = Math.max(e.maxActive, e.active);
    try {
      if (e.gate) await e.gate;
      if (e.fail) throw e.fail;
      return { projects: {}, settings: { status: 'clean' } };
    } finally {
      e.active -= 1;
    }
  };
  return e;
}

function storeStub() {
  const fns = new Set();
  return {
    subscribe(fn) { fns.add(fn); return () => fns.delete(fn); },
    emit(e) { for (const fn of [...fns]) fn(e); },
  };
}

const OPTS = { quietMs: 5000, maxWaitMs: 30000, pollMs: 60000, backoff: [5000, 15000, 60000] };

// ── one tab syncs ────────────────────────────────────────────────────────────
{
  const c = clock();
  const locks = lockManager();
  const store = storeStub();
  const e1 = engineStub();
  const e2 = engineStub();
  const r1 = createSyncRunner({ engine: e1, store, locks, timers: c.timers, now: c.now, ...OPTS });
  const r2 = createSyncRunner({ engine: e2, store, locks, timers: c.timers, now: c.now, ...OPTS });
  r1.start();
  r2.start();
  await flush();
  expect(locks.holder() && locks.holder().name === SYNC_LOCK, 'the first tab takes the lock');
  expect(r1.status().leader && !r2.status().leader && r2.status().state === 'waiting', 'the second waits');
  expect(e1.calls === 1 && e2.calls === 0, 'the tab holding the lock syncs at once; the other never does');
  expect((await r2.syncNow()) === null && e2.calls === 0, 'asking a waiting tab to sync does nothing');

  // Changes: a quiet spell, then one round.
  store.emit({ key: 'beljar/p/p1/f/f1', cls: 'work', origin: 'local' });
  await c.advance(4000);
  expect(e1.calls === 1, 'no round while changes are fresh');
  store.emit({ key: 'beljar/p/p1/f/f1', cls: 'work', origin: 'local' });
  await c.advance(4999);
  expect(e1.calls === 1, 'each change restarts the quiet spell');
  await c.advance(1);
  expect(e1.calls === 2, 'a round once it has been quiet');

  // Typing without pause: the longest wait still syncs.
  for (let i = 0; i < 40; i++) {
    store.emit({ key: 'beljar/p/p1/f/f1', cls: 'work', origin: 'tab' });
    await c.advance(1000);
  }
  expect(e1.calls === 3, 'busy typing (from any tab) still syncs within the longest wait, and only then');

  // What does not count as a change (after the typing's own quiet spell ends).
  await c.advance(5000);
  const before = e1.calls;
  store.emit({ key: 'beljar/p/p1/f/f1', cls: 'work', origin: 'remote' });
  store.emit({ key: 'beljar/p/p1/session', cls: 'device', origin: 'local' });
  await c.advance(5000);
  expect(e1.calls === before, 'a change sync made itself, or device state, starts nothing');
  store.emit({ key: 'beljar/settings', cls: 'settings', origin: 'local' });
  await c.advance(5000);
  expect(e1.calls === before + 1, 'a settings change does');
  store.emit({ key: TOMBSTONES_KEY, cls: 'device', origin: 'local' });
  await c.advance(5000);
  expect(e1.calls === before + 2, 'so does deleting a synced project');

  // The poll.
  const polled = e1.calls;
  await c.advance(59999);
  expect(e1.calls === polled, 'no poll before its time');
  await c.advance(1);
  expect(e1.calls === polled + 1, 'a quiet tab still polls for other devices\' changes');

  // Never two rounds at once.
  let open;
  e1.gate = new Promise((r) => { open = r; });
  const first = r1.syncNow();
  await flush();
  r1.syncNow();
  r1.syncNow();
  await flush();
  expect(e1.active === 1, 'asked again during a round: it waits');
  e1.gate = null;
  open();
  await first;
  await flush();
  await flush();
  expect(e1.maxActive === 1, 'rounds never overlap');
  const settled = e1.calls;
  await flush();
  expect(settled === polled + 3, 'and the asks during the round become one more round after it');

  // Backoff.
  e1.fail = Object.assign(new Error('no network'), { offline: true });
  await r1.syncNow();
  await flush();
  expect(r1.status().state === 'offline', 'unreachable: offline');
  const failedAt = e1.calls;
  await c.advance(4999);
  expect(e1.calls === failedAt, 'backs off');
  await c.advance(1);
  expect(e1.calls === failedAt + 1, 'then tries again');
  await c.advance(14999);
  expect(e1.calls === failedAt + 1, 'backs off further after a second failure');
  await c.advance(1);
  expect(e1.calls === failedAt + 2, 'and tries again');
  e1.fail = null;
  await c.advance(60000);
  expect(r1.status().state === 'idle' && r1.status().lastSync > 0, 'reachable again: idle');
  const healed = e1.calls;
  await c.advance(60000);
  expect(e1.calls === healed + 1, 'and back to the ordinary poll');

  // The lock moves on when its tab goes.
  const seen = [];
  r2.subscribe((s) => seen.push(s.state));
  r1.stop();
  await flush();
  await flush();
  expect(r2.status().leader && e2.calls === 1, 'when the syncing tab goes, another takes over and syncs');
  expect(seen.includes('idle') || seen.includes('syncing'), 'and says so');
  const stoppedCalls = e1.calls;
  store.emit({ key: 'beljar/p/p1/f/f1', cls: 'work', origin: 'local' });
  await c.advance(120000);
  expect(e1.calls === stoppedCalls, 'a stopped runner never syncs again');
  r2.stop();
}

// ── syncNow answers with a round that began after it; stop waits for one in flight ──
{
  const c = clock();
  const e = engineStub();
  const inner = e.syncAll;
  e.syncAll = async () => { const r = await inner(); return Object.assign({ seq: e.calls }, r); };
  const r = createSyncRunner({ engine: e, store: storeStub(), locks: lockManager(), timers: c.timers, now: c.now, ...OPTS });
  r.start();
  await flush();
  await flush();
  const before = e.calls;
  let open;
  e.gate = new Promise((go) => { open = go; });
  const running = r.syncNow(); // a round starts, and waits at the gate
  await flush();
  const asked = r.syncNow(); // asked while it runs: the change asked about may be newer than that round
  await flush();
  e.gate = null;
  open();
  const [first, second] = await Promise.all([running, asked]);
  expect(first.seq === before + 1 && second.seq === before + 2,
    `a sync asked for during a round is answered by the next round, not the one already running (${first.seq}, ${second.seq})`);

  e.gate = new Promise((go) => { open = go; });
  r.syncNow();
  await flush();
  let stopped = false;
  const stopping = r.stop().then(() => { stopped = true; });
  await flush();
  expect(!stopped, 'stop waits while a round is still in flight');
  e.gate = null;
  open();
  await stopping;
  expect(stopped && e.active === 0, 'and resolves once it has finished: nothing sync does lands after stop resolves');
}

// ── no Web Locks ─────────────────────────────────────────────────────────────
{
  const c = clock();
  const e = engineStub();
  const r = createSyncRunner({ engine: e, store: storeStub(), locks: null, timers: c.timers, now: c.now, ...OPTS });
  r.start();
  await c.advance(120000);
  expect(r.status().state === 'unsupported' && e.calls === 0, 'without Web Locks nothing syncs: two tabs syncing at once is not a risk worth taking');
}

// ── a round that reports a project it could not sync ────────────────────────
{
  const c = clock();
  const e = engineStub();
  e.syncAll = async () => ({ projects: { p1: { pid: 'p1', status: 'error', message: 'two files share a path' } }, settings: { status: 'clean' } });
  const r = createSyncRunner({ engine: e, store: storeStub(), locks: lockManager(), timers: c.timers, now: c.now, ...OPTS });
  r.start();
  await flush();
  await flush();
  expect(r.status().state === 'error' && r.status().error === 'two files share a path', 'a project that could not sync is reported, not hidden');
  r.stop();
}

console.log(`OK sync runner (${n} checks: one tab, quiet spell, longest wait, poll, no overlap, backoff, hand-over)`);
