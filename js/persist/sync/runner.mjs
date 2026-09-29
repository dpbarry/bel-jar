/**
 * When sync runs (docs/PERSIST.md §5).
 *
 * One tab per browser syncs: the one holding the Web Lock, which the browser
 * hands to another tab the moment the holder closes. The others keep writing
 * locally as always, and the holder hears their writes as storage events.
 *
 * A round runs a quiet spell after work or settings change (never on a
 * keystroke), within a longest wait however busy the typing; on a slow poll
 * for other devices' changes; and at once when asked (an explicit save,
 * coming back online, the tab coming back into view). A round that cannot
 * reach the server backs off. Rounds never overlap: a change during one
 * starts another after it.
 */
import { TOMBSTONES_KEY } from '../keys.mjs';

export const SYNC_LOCK = 'beljar/sync';

// What a finished round may say of a project for its work to be safe on the server.
const SAFE = new Set(['clean', 'pushed', 'downloaded', 'forgot', 'deleted', 'absent', 'restored']);

/**
 * A round's result says every project's work is on the server. The one rule for
 * "nothing would be lost": signing out removes projects only when it holds, and
 * the tab that syncs tells the others (status.safe).
 */
export function roundIsSafe(result) {
  return !!result && !!result.projects && Object.values(result.projects).every((r) => SAFE.has(r.status));
}

/**
 * @param {object} o
 * @param {{ syncAll(): Promise<object> }} o.engine
 * @param {{ subscribe(fn): () => void }} o.store
 * @param {{ request(name, opts, fn): Promise<any> } | null} o.locks   navigator.locks
 * @param {{ set(fn, ms): any, clear(handle): void }} [o.timers]
 * @param {() => number} [o.now]
 * @param {number} [o.quietMs]    after the last change
 * @param {number} [o.maxWaitMs]  after the first change, however busy
 * @param {number} [o.pollMs]     for other devices' changes
 * @param {number[]} [o.backoff]  after 1, 2, 3… failed rounds in a row
 */
export function createSyncRunner(o) {
  const engine = o.engine;
  const timers = o.timers || {
    set: (fn, ms) => globalThis.setTimeout(fn, ms),
    clear: (h) => globalThis.clearTimeout(h),
  };
  const now = o.now || (() => Date.now());
  const quietMs = o.quietMs != null ? o.quietMs : 5000;
  const maxWaitMs = o.maxWaitMs != null ? o.maxWaitMs : 30000;
  const pollMs = o.pollMs != null ? o.pollMs : 60000;
  const backoff = o.backoff || [5000, 15000, 60000, 300000];
  const listeners = new Set();

  // pending: a change this tab heard that no finished round has carried yet.
  // safe: the last round confirmed every project's work is on the server.
  // held: rounds wait for the person ("Back online: Ask me first").
  let status = { state: 'waiting', leader: false, lastSync: 0, error: null, pending: false, safe: false, held: false };
  let leader = false;
  let stopped = false;
  let running = null;
  let again = false;
  let timer = null;
  let firstChange = 0;
  let failures = 0;
  let dirty = false; // a change heard since the last round began
  let held = false;
  let release = null;
  let abort = null;
  let unsubscribe = null;

  function update(patch) {
    status = Object.assign({}, status, patch);
    for (const fn of [...listeners]) {
      try { fn(status); } catch (_) { /* one bad listener must not stop the rest */ }
    }
  }

  function wakeIn(ms) {
    if (timer != null) timers.clear(timer);
    timer = timers.set(() => {
      timer = null;
      round();
    }, Math.max(0, ms));
  }

  /** Something here changed: sync once it has been quiet a while. */
  function changed() {
    if (!leader || stopped) return;
    dirty = true;
    if (!status.pending) update({ pending: true });
    const t = now();
    if (!firstChange) firstChange = t;
    wakeIn(Math.min(quietMs, maxWaitMs - (t - firstChange)));
  }

  function problems(res) {
    const out = [];
    for (const r of Object.values(res.projects || {})) if (r.status === 'error') out.push(r.message);
    if (res.settings && res.settings.status === 'error') out.push(res.settings.message);
    return out;
  }

  function round() {
    if (!leader || stopped || held) return Promise.resolve(null);
    if (running) {
      again = true;
      return running;
    }
    firstChange = 0;
    if (timer != null) { timers.clear(timer); timer = null; }
    // The changes heard so far ride this round; one heard during it waits for the next.
    const carried = dirty;
    dirty = false;
    update({ state: 'syncing' });
    running = engine.syncAll().then((res) => {
      failures = 0;
      const errs = problems(res);
      if (errs.length && carried) dirty = true;
      update({ state: errs.length ? 'error' : 'idle', lastSync: now(), error: errs[0] || null, result: res, pending: dirty, safe: roundIsSafe(res) });
      return res;
    }, (err) => {
      failures += 1;
      if (carried) dirty = true;
      update({ state: err && err.offline ? 'offline' : 'error', error: String(err && err.message || err), pending: dirty, safe: false });
      return null;
    }).then((res) => {
      running = null;
      if (stopped) return res;
      if (again) {
        again = false;
        round();
      } else {
        wakeIn(failures ? backoff[Math.min(failures, backoff.length) - 1] : pollMs);
      }
      return res;
    });
    return running;
  }

  return {
    SYNC_LOCK,

    /** Ask for the lock, and listen for changes (heard only while holding it). */
    start() {
      if (unsubscribe) return;
      unsubscribe = o.store.subscribe((e) => {
        if (e.origin === 'remote') return;
        if (e.cls === 'work' || e.cls === 'settings' || e.key === TOMBSTONES_KEY) changed();
      });
      const locks = o.locks;
      if (!locks || typeof locks.request !== 'function') {
        update({ state: 'unsupported' });
        return;
      }
      abort = typeof AbortController === 'function' ? new AbortController() : null;
      Promise.resolve(locks.request(SYNC_LOCK, abort ? { signal: abort.signal } : {}, () => {
        if (stopped) return undefined;
        leader = true;
        update({ state: 'idle', leader: true });
        round();
        // Held until this page goes away, or stop().
        return new Promise((resolve) => { release = resolve; });
      })).catch(() => { /* stopped while waiting for the lock */ });
    },

    /**
     * Sync now (this tab must hold the lock). Resolves to the result of a round
     * that STARTED after this call, or null: a round already running may have
     * begun before the change the caller wants synced.
     */
    async syncNow() {
      if (running) {
        again = true;
        await running;
        // The round asked for above may already be under way: join it.
        if (running) return running;
      }
      return round();
    },

    status() {
      return status;
    },

    /**
     * No round runs until release(): the edits made offline wait for the person
     * to upload them, or take the cloud's instead (persist.mjs holds it when the
     * connection drops, with "Back online: Ask me first").
     */
    hold() {
      if (held) return;
      held = true;
      if (timer != null) { timers.clear(timer); timer = null; }
      update({ held: true });
    },

    /** Let rounds run again, starting one now. */
    release() {
      if (!held) return Promise.resolve(null);
      held = false;
      // Said together with the round it starts (round() reports "syncing"): a
      // runner whose last round could not reach the server must never read
      // as released and still offline, or the hold would be taken up again
      // before the round could try.
      if (leader && !stopped && !running) {
        status = Object.assign({}, status, { held: false });
        return round();
      }
      update({ held: false });
      return round();
    },

    /** fn(status) on every change: { state, leader, lastSync, error, result }. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /**
     * Stop, and resolve once a round in flight has finished: nothing sync does
     * lands after this resolves (signing out removes projects right after).
     */
    stop() {
      stopped = true;
      if (timer != null) { timers.clear(timer); timer = null; }
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      if (abort) abort.abort();
      if (release) release();
      leader = false;
      update({ state: 'stopped', leader: false });
      return Promise.resolve(running).then(() => undefined);
    },
  };
}
