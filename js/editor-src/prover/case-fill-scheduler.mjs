// case-fill-scheduler.mjs — when case completion runs, and on what. Main thread; the
// work itself happens in the case-fill worker.
//
// Starts on its own only when all of these hold (the person chose this, 2026-10-03):
//   - the setting is `auto`;
//   - a settled check reports a coverage failure AT a proof's outer case (an inner
//     case's failure is a different problem);
//   - typing has paused (PAUSE_MS since the last edit);
//   - Harpoon is not running Orca (one search at a time is enough for a laptop).
// The worker then decides whether the proof is one it may fill unasked (eligibility);
// forcing skips that, and the setting.
//
// Results are kept only while the proof reads exactly as it did when the job started
// (its text is the fingerprint). An edit to the proof cancels its job and drops its
// rows. Cancel is cooperative first; a worker that does not stop within GRACE_MS past a
// row's own deadline is terminated, which is the only way to stop a check that loops.
//
// Every dependency is injected, so the whole policy runs in Node with a fake worker and
// a fake clock (tests/test-case-fill-scheduler.mjs).

import { recsWithArms } from './case-arms.mjs';
import * as store from './case-fill-store.mjs';

export const PAUSE_MS = 1500;
export const GRACE_MS = 15000;
export const IDLE_MS = 120000;

/**
 * The proofs of a file's text, keyed the way the store keys them: by name and their
 * order among same-named proofs. The proof's own text is its fingerprint. Shared with
 * the ghost layer so both sides mean the same proof by the same key.
 */
export function proofsOfText(text) {
  const seen = new Map();
  return recsWithArms(text).map((r) => {
    const ordinal = seen.get(r.name) || 0;
    seen.set(r.name, ordinal + 1);
    return { ...r, ordinal, recKey: store.recKeyOf(r.name, ordinal), fingerprint: text.slice(r.from, r.to) };
  });
}

/**
 * deps: {
 *   makeWorker()            -> a Worker (postMessage, terminate, onmessage)
 *   runtimeUrl()            -> the Beluga runtime URL (BelugaClient.runtimeScriptUrl)
 *   getFileId(), getDocText()
 *   getProgram()            -> { code, fileStart }: the whole program the file checks in
 *   readSetting()           -> 'auto' | 'ask'
 *   isHarpoonBusy()         -> true while Harpoon's Orca runs
 *   declined(info)          -> a FORCED row that could not be filled: { recName, key, rule, why }
 *   now, setTimer, clearTimer
 * }
 */
export function createCaseFillScheduler(deps) {
  const now = deps.now || (() => Date.now());
  const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer || ((t) => clearTimeout(t));

  let worker = null;
  let current = null; // { item, reported: Set, watchdog, cancelled }
  const queue = [];
  let lastEdit = -Infinity;
  let pumpTimer = null;
  let idleTimer = null;
  let nextId = 1;

  // ── the worker ─────────────────────────────────────────────────────────────
  function ensureWorker() {
    if (worker) return worker;
    worker = deps.makeWorker();
    worker.onmessage = (e) => onMessage(e && e.data ? e.data : e);
    worker.postMessage({ type: 'init', script: deps.runtimeUrl() });
    return worker;
  }
  function killWorker() {
    if (!worker) return;
    try { worker.terminate(); } catch (_) { /* already gone */ }
    worker = null;
  }
  function armIdle() {
    if (idleTimer) clearTimer(idleTimer);
    idleTimer = setTimer(() => { idleTimer = null; if (!current && !queue.length) killWorker(); }, IDLE_MS);
  }

  // ── the queue ──────────────────────────────────────────────────────────────
  function schedulePump(delay) {
    if (pumpTimer) clearTimer(pumpTimer);
    pumpTimer = setTimer(() => { pumpTimer = null; pump(); }, Math.max(0, delay));
  }
  function pump() {
    if (current) return;
    if (!queue.length) { armIdle(); return; }
    if (deps.isHarpoonBusy && deps.isHarpoonBusy()) { schedulePump(2000); return; }
    const head = queue[0];
    const wait = lastEdit + PAUSE_MS - now();
    if (head.mode === 'auto' && wait > 0) { schedulePump(wait); return; }
    queue.shift();
    // The proof must still read as it did when it was queued.
    if (!stillCurrent(head)) { pump(); return; }
    const program = deps.getProgram();
    if (!program || !program.code) { pump(); return; }
    const fileStart = program.fileStart || 0;
    const same = recsWithArms(program.code).filter((r) => r.name === head.recName);
    let recOrdinal = same.findIndex((r) => r.from === fileStart + head.docFrom);
    if (recOrdinal < 0) recOrdinal = Math.min(head.ordinal, Math.max(0, same.length - 1));
    const job = { id: `cf${nextId++}`, code: program.code, recName: head.recName, recOrdinal, mode: head.mode, keys: head.keys || undefined };
    current = { item: { ...head, job }, reported: new Set(), watchdog: null, cancelled: false };
    if (idleTimer) { clearTimer(idleTimer); idleTimer = null; }
    ensureWorker().postMessage({ type: 'job', job });
  }
  function finishCurrent() {
    if (current && current.watchdog) clearTimer(current.watchdog);
    current = null;
    pump();
  }

  // ── the proofs of the open file ────────────────────────────────────────────
  const proofsOf = proofsOfText;
  function proofFor(fileId, recKey) {
    if (deps.getFileId() !== fileId) return null;
    return proofsOf(deps.getDocText()).find((p) => p.recKey === recKey) || null;
  }
  function stillCurrent(item) {
    const p = proofFor(item.fileId, item.recKey);
    return !!p && p.fingerprint === item.fingerprint;
  }

  // ── what the worker says ───────────────────────────────────────────────────
  function onMessage(msg) {
    if (!msg) return;
    if (msg.type === 'load-error') {
      // No runtime, no search: say nothing for automatic work, give up the queue.
      queue.length = 0;
      if (current && current.item.mode === 'force' && deps.declined) {
        deps.declined({ recName: current.item.recName, key: null, rule: null, why: 'checker-unavailable' });
      }
      current = null;
      killWorker();
      return;
    }
    if (!current || msg.id !== current.item.job.id) return; // a job we already let go
    const { item } = current;
    if (msg.type === 'plan') {
      if (current.cancelled || !stillCurrent(item)) return;
      store.setPlan(item.fileId, item.recKey, {
        recName: item.recName, ordinal: item.ordinal, fingerprint: item.fingerprint,
        eligibility: msg.eligibility, rows: msg.rows || [], unbuilt: msg.unbuilt, why: msg.why,
        forced: item.mode === 'force',
      });
      if (item.mode === 'force' && msg.unbuilt && deps.declined) {
        deps.declined({ recName: item.recName, key: null, rule: null, why: msg.why || 'cases-not-built' });
      }
    } else if (msg.type === 'row-start') {
      if (item.mode === 'force') store.setSearching(item.fileId, item.recKey, msg.key);
      if (current.watchdog) clearTimer(current.watchdog);
      const key = msg.key;
      current.watchdog = setTimer(() => overran(key), (msg.deadlineMs || 60000) + GRACE_MS);
    } else if (msg.type === 'row') {
      if (current.watchdog) { clearTimer(current.watchdog); current.watchdog = null; }
      current.reported.add(msg.key);
      if (current.cancelled || !stillCurrent(item)) return;
      store.setResult(item.fileId, item.recKey, msg);
      if (!msg.ok && item.mode === 'force' && deps.declined) {
        const e = store.entry(item.fileId, item.recKey);
        const row = e && e.rows.get(msg.key);
        deps.declined({ recName: item.recName, key: msg.key, rule: row ? row.rule : null, why: msg.why });
      }
    } else if (msg.type === 'done') {
      finishCurrent();
    }
  }

  // A row ran past its deadline and the grace: the worker is stuck in one call. Kill
  // it, record the row as out of time, and requeue the rest of the job.
  function overran(key) {
    if (!current) return;
    const { item, reported } = current;
    killWorker();
    if (!current.cancelled && stillCurrent(item)) {
      store.setResult(item.fileId, item.recKey, { key, ok: false, why: 'time-budget' });
      reported.add(key);
      const e = store.entry(item.fileId, item.recKey);
      const rest = e ? [...e.rows.values()].map((r) => r.key).filter((k) => !reported.has(k)) : [];
      if (rest.length) queue.unshift({ ...item, keys: rest, job: undefined });
    }
    current = null;
    pump();
  }

  function cancelRec(fileId, recKey) {
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (queue[i].fileId === fileId && queue[i].recKey === recKey) queue.splice(i, 1);
    }
    if (current && current.item.fileId === fileId && current.item.recKey === recKey && !current.cancelled) {
      current.cancelled = true;
      if (worker) worker.postMessage({ type: 'cancel', id: current.item.job.id });
      if (current.watchdog) clearTimer(current.watchdog);
      current.watchdog = setTimer(() => { killWorker(); current = null; pump(); }, GRACE_MS);
    }
  }

  // ── a proof put back as it was ─────────────────────────────────────────────
  // ⛔ An edit that puts the text back exactly as the last check read it (a space typed
  // and deleted, an undo) settles NOTHING: the checker has nothing new to check, so no
  // settled check arrives and the proof whose ghosts the edit dropped was never filled
  // again (measured in Chrome, 2026-10-05). So when a proof is dropped, look again after
  // the pause, and if the text is the last checked text, that check is still the verdict.
  let lastSettled = null; // { fileId, text, snap }
  let revisitTimer = null;
  function armRevisit() {
    if (revisitTimer) clearTimer(revisitTimer);
    revisitTimer = setTimer(() => {
      revisitTimer = null;
      const s = lastSettled;
      // Any other text has a check of its own on the way, and that check decides; read
      // against the old text, this one would drop what was found since (a forced fill).
      // A job for a file no longer open never starts (`stillCurrent`), and the queue
      // still waits for typing to pause before an automatic job starts.
      if (s && deps.getDocText() === s.text) settle(s.fileId, s.text, s.snap);
    }, PAUSE_MS);
  }

  // ── entry points ───────────────────────────────────────────────────────────
  return {
    /** The person typed. Starting waits for a pause. */
    noteEdit() { lastEdit = now(); },

    /** A settled check of the open file. */
    onSettlement(snap) {
      const fileId = deps.getFileId();
      const text = deps.getDocText();
      if (fileId == null || typeof text !== 'string') return;
      lastSettled = { fileId, text, snap };
      settle(fileId, text, snap);
    },

    /**
     * Fill the missing cases of the proof under `pos` now, with the forced budget, whatever
     * the setting and whatever the proof's strength. `keys` limits it to some rows.
     * Returns false when there is no proof with a case there.
     */
    force(pos, keys = null) {
      const fileId = deps.getFileId();
      const text = deps.getDocText();
      const p = proofsOf(text).find((x) => x.outerCase && pos >= x.from && pos <= x.to);
      if (!p) return false;
      cancelRec(fileId, p.recKey);
      queue.unshift({ mode: 'force', fileId, recKey: p.recKey, recName: p.name, ordinal: p.ordinal, docFrom: p.from, fingerprint: p.fingerprint, keys });
      pump();
      return true;
    },

    /** The setting changed. `ask` stops automatic work and drops what it produced. */
    onSettingChanged(value) {
      if (value === 'auto') return;
      const fileId = deps.getFileId();
      for (const q of [...queue]) if (q.mode === 'auto') cancelRec(q.fileId, q.recKey);
      if (current && current.item.mode === 'auto') cancelRec(current.item.fileId, current.item.recKey);
      for (const e of store.entries(fileId)) if (!e.forced) store.drop(fileId, e.recKey);
    },

    /** The ghost layer saw an edit inside a proof. */
    proofTouched(fileId, recKey) { cancelRec(fileId, recKey); store.drop(fileId, recKey); armRevisit(); },

    /** For tests and the probe. */
    state() { return { queued: queue.length, running: current ? current.item.job.id : null, worker: !!worker }; },
    dispose() {
      queue.length = 0; current = null; killWorker();
      if (revisitTimer) { clearTimer(revisitTimer); revisitTimer = null; }
    },
  };

  // ── a settled check of the open file ───────────────────────────────────────
  function settle(fileId, text, snap) {
    const proofs = proofsOf(text);
    // Anything planned for a proof that no longer reads the same is gone.
    for (const e of store.entries(fileId)) {
      const p = proofs.find((x) => x.recKey === e.recKey);
      if (!p || p.fingerprint !== e.fingerprint) { cancelRec(fileId, e.recKey); store.drop(fileId, e.recKey); }
    }
    if (current && current.item.fileId === fileId && !stillCurrent(current.item)) cancelRec(fileId, current.item.recKey);
    if (deps.readSetting() !== 'auto') return;
    if (!snap || snap.state !== 'ready') return;
    const coverage = (snap.belugaDiagnostics || []).filter((d) => /COVERAGE FAILURE/.test(String(d.message || '')));
    if (!coverage.length) return;
    for (const p of proofs) {
      if (!p.outerCase) continue;
      // At the OUTER case: the diagnostic is located at the `case` keyword.
      if (!coverage.some((d) => d.from >= p.outerCase.from && d.from <= p.outerCase.from + 4)) continue;
      const known = store.entry(fileId, p.recKey);
      if (known && known.fingerprint === p.fingerprint) continue;
      const busy = (current && current.item.recKey === p.recKey && current.item.fingerprint === p.fingerprint)
        || queue.some((q) => q.recKey === p.recKey && q.fingerprint === p.fingerprint);
      if (busy) continue;
      queue.push({ mode: 'auto', fileId, recKey: p.recKey, recName: p.name, ordinal: p.ordinal, docFrom: p.from, fingerprint: p.fingerprint });
    }
    pump();
  }
}
