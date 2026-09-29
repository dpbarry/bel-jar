/**
 * What sync is doing, told the same way in every tab (docs/PERSIST.md §5).
 *
 * Only the tab holding the sync lock runs rounds (runner.mjs), so on its own
 * every other tab would know nothing. The syncing tab posts its runner's status
 * as a tab message, a tab that opens asks for it, and every tab builds the same
 * summary from it: one state for the cloud beside the project name, the strip,
 * and the review window (docs/UI.md §2: one indicator per fact).
 *
 * A tab that does not sync can still ask for a round and learn whether it left
 * everything on the server (signing out needs that answer, from any tab).
 */
import { roundIsSafe } from './runner.mjs';

export const STATUS_MESSAGE = 'sync-status';
export const ASK_MESSAGE = 'sync-ask';

/**
 * The one summary: { signedIn, state, lastSync, error, differs }.
 *
 * state: 'off' (signed out) | 'differs' (files changed in two places wait for a
 * person) | 'offline' | 'held' (edits made offline wait to be uploaded or
 * dropped: "Back online: Ask me first") | 'error' | 'syncing' |
 * 'pending' (a change waits for the next round) | 'synced'. The order is what
 * needs the person first. `differs`
 * lists the files, and is filled signed out too: two tabs can differ with no
 * account at all.
 */
export function summarize({ account, runner, online, differs }) {
  const files = differs || [];
  if (!account) return { signedIn: false, state: files.length ? 'differs' : 'off', lastSync: 0, error: null, differs: files };
  const st = runner || {};
  let state;
  if (files.length) state = 'differs';
  else if (online === false) state = 'offline';
  // Held, the runner's last word stays "offline" until someone releases it:
  // back online, what shows is that the edits wait.
  else if (st.held) state = 'held';
  else if (st.state === 'offline') state = 'offline';
  else if (st.state === 'error') state = 'error';
  else if (st.state === 'syncing') state = 'syncing';
  else if (st.pending) state = 'pending';
  else if (st.lastSync) state = 'synced';
  else state = 'syncing'; // signed in, and no round has finished yet
  return { signedIn: true, state, lastSync: st.lastSync || 0, error: st.state === 'error' ? st.error || null : null, differs: files };
}

/**
 * @param {object} o
 * @param {() => string|null} o.account      who is signed in
 * @param {() => object[]} o.conflicts        work.listConflicts
 * @param {{ post(kind, msg): void, on(fn): () => void }} o.tabs   device-records' tab messages
 * @param {() => boolean} [o.online]          navigator.onLine
 * @param {() => number} [o.now]
 * @param {{ set(fn, ms): any, clear(h): void }} [o.timers]
 * @param {() => string} [o.newId]
 */
export function createSyncStatus(o) {
  const now = o.now || (() => Date.now());
  const timers = o.timers || { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) };
  const online = o.online || (() => true);
  let seq = 0;
  const newId = o.newId || (() => now().toString(36) + '-' + (++seq) + '-' + Math.random().toString(36).slice(2, 8));
  const listeners = new Set();
  const asked = new Map(); // id -> resolve, while another tab runs the round
  let runner = null;
  let unsubscribeRunner = null;
  let local = null; // this tab's runner status
  let remote = null; // the syncing tab's, as it last said
  let lastKey = '';

  const leading = () => !!(local && local.leader);
  const current = () => (leading() ? local : remote || local);

  function summary() {
    return summarize({ account: o.account(), runner: current(), online: online(), differs: o.conflicts() });
  }

  function emit() {
    const s = summary();
    const key = JSON.stringify(s);
    if (key === lastKey) return;
    lastKey = key;
    for (const fn of [...listeners]) {
      try { fn(s); } catch (_) { /* one bad listener must not stop the rest */ }
    }
  }

  // `at` changes every time, so a message with the same content still reaches
  // the other tabs (they hear storage changes, and an equal value is none).
  function tell(st, answered) {
    o.tabs.post(STATUS_MESSAGE, {
      state: st.state, pending: !!st.pending, lastSync: st.lastSync || 0, error: st.error || null,
      safe: !!st.safe, held: !!st.held, at: now(), answered: answered || null,
    });
  }

  o.tabs.on((kind, msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (kind === STATUS_MESSAGE) {
      remote = msg;
      if (msg.answered && asked.has(msg.answered)) {
        const resolve = asked.get(msg.answered);
        asked.delete(msg.answered);
        resolve({ ok: !!msg.safe, reason: msg.safe ? null : msg.state || 'unsafe' });
      }
      emit();
    } else if (kind === ASK_MESSAGE && leading() && runner) {
      if (msg.release) {
        runner.release().then(() => tell(runner.status(), msg.id));
      } else if (msg.round) {
        runner.syncNow().then(() => tell(runner.status(), msg.id));
      } else {
        tell(local, null);
      }
    }
  });

  return {
    /** Follow this tab's runner (Persist.startSync); a non-syncing tab asks the syncing one how things are. */
    attach(r) {
      this.detach();
      runner = r;
      local = r.status();
      unsubscribeRunner = r.subscribe((st) => {
        local = st;
        // This tab first: telling the others must never be what keeps it stale.
        emit();
        if (st.leader) tell(st, null);
      });
      o.tabs.post(ASK_MESSAGE, { id: newId(), round: false, at: now() });
      emit();
    },

    detach() {
      if (unsubscribeRunner) unsubscribeRunner();
      unsubscribeRunner = null;
      runner = null;
      local = null;
      remote = null;
      emit();
    },

    summary,

    /** Something the summary reads changed (a conflict, the network, the account): tell whoever listens. */
    refresh: emit,

    /** fn(summary) on every change; returns the unsubscribe. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /**
     * Let held rounds run again (the person chose Upload): the syncing tab
     * releases its runner; any other asks it to. Resolves once it has.
     */
    release(timeoutMs = 15000) {
      if (!runner) return Promise.resolve({ ok: false, reason: 'not-syncing' });
      if (leading()) return runner.release().then(() => ({ ok: true, reason: null }));
      const id = newId();
      return new Promise((resolve) => {
        asked.set(id, () => resolve({ ok: true, reason: null }));
        o.tabs.post(ASK_MESSAGE, { id, release: true, at: now() });
        timers.set(() => {
          if (!asked.has(id)) return;
          asked.delete(id);
          resolve({ ok: false, reason: 'no-answer' });
        }, timeoutMs);
      });
    },

    /**
     * Sync now and say whether every project's work is on the server:
     * { ok, reason }. From the syncing tab it runs the round itself; from any
     * other it asks that tab, and waits at most `timeoutMs` for the answer.
     */
    confirm(timeoutMs = 15000) {
      if (!runner) return Promise.resolve({ ok: false, reason: 'not-syncing' });
      if (leading()) {
        return runner.syncNow().then((res) => ({ ok: roundIsSafe(res), reason: roundIsSafe(res) ? null : runner.status().state }));
      }
      const id = newId();
      return new Promise((resolve) => {
        asked.set(id, resolve);
        o.tabs.post(ASK_MESSAGE, { id, round: true, at: now() });
        timers.set(() => {
          if (!asked.has(id)) return;
          asked.delete(id);
          resolve({ ok: false, reason: 'no-answer' });
        }, timeoutMs);
      });
    },
  };
}
