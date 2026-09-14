import { candidateMoves } from './prover-candidates.mjs';
import { collectMovesAt } from './prover-moves-at.mjs';

function onUiThread() {
  return typeof document !== 'undefined';
}

function workerUrl() {
  if (typeof document === 'undefined') return '';
  const scripts = document.getElementsByTagName('script');
  for (let i = 0; i < scripts.length; i += 1) {
    const src = scripts[i].src || '';
    if (/editor-cm\.bundle\.js/.test(src)) {
      return src.replace(/editor-cm\.bundle\.js/, 'prover-moves.worker.js');
    }
  }
  try {
    return new URL('js/prover-moves.worker.js', document.baseURI).href;
  } catch {
    return '';
  }
}

let worker = null;
let aborting = false;
let busy = false;
let jobId = 0;
let generation = 0;
const queue = [];
let current = null;

function settle(job, moves) {
  if (!job) return;
  try { job.resolve(moves || []); } catch (_) { /* ignore */ }
}

export function abortMovesWorkload() {
  generation += 1;
  aborting = true;
  if (current) settle(current, []);
  while (queue.length) settle(queue.shift(), []);
  current = null;
  busy = false;
  if (worker) {
    try { worker.terminate(); } catch (_) { /* ignore */ }
    worker = null;
  }
  aborting = false;
}

function ensureWorker() {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  const url = workerUrl();
  if (!url) return null;
  let w;
  try {
    w = new Worker(url);
  } catch (_) {
    return null;
  }
  worker = w;
  w.onerror = () => {
    // A late error from a worker already replaced must not tear down its successor.
    if (aborting || worker !== w) return;
    recoverFromWorkerError();
  };
  return w;
}

// A worker error (a crash, or running out of memory on one hard hole) must not end move
// synthesis for the page, and a dead worker must not push the work back onto the UI thread.
// The job in flight gets one fresh worker; a job that crashes that one too settles empty.
// Every later request starts a fresh worker again.
function recoverFromWorkerError() {
  const job = current;
  current = null;
  busy = false;
  if (worker) {
    try { worker.terminate(); } catch (_) { /* ignore */ }
    worker = null;
  }
  if (job) {
    if (job.retried) {
      settle(job, []);
    } else {
      job.retried = true;
      queue.unshift(job);
    }
  }
  pump();
}

function settleWithoutUiWork(job) {
  if (onUiThread()) {
    settle(job, []);
    return;
  }
  Promise.resolve(job.syncFn()).then((moves) => settle(job, moves), () => settle(job, []));
}

function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  if (job.gen !== generation || (job.opts.shouldCancel && job.opts.shouldCancel())) {
    settle(job, []);
    pump();
    return;
  }
  const w = ensureWorker();
  if (!w) {
    settleWithoutUiWork(job);
    pump();
    return;
  }
  busy = true;
  current = job;
  const id = (jobId += 1);
  const onMsg = (e) => {
    const data = e && e.data;
    if (!data || data.id !== id) return;
    w.removeEventListener('message', onMsg);
    busy = false;
    current = null;
    if (job.gen !== generation || (job.opts.shouldCancel && job.opts.shouldCancel())) {
      settle(job, []);
    } else if (data.error) {
      settle(job, []);
    } else {
      settle(job, data.moves || []);
    }
    pump();
  };
  w.addEventListener('message', onMsg);
  try {
    w.postMessage({ id, ...job.msg });
  } catch (_) {
    w.removeEventListener('message', onMsg);
    busy = false;
    current = null;
    settleWithoutUiWork(job);
    pump();
  }
}

function runJob(msg, syncFn, opts = {}) {
  if (opts.shouldCancel && opts.shouldCancel()) return Promise.resolve([]);
  if (typeof Worker === 'undefined') {
    return Promise.resolve(syncFn());
  }
  return new Promise((resolve) => {
    queue.push({
      msg, syncFn, opts, resolve, gen: generation,
    });
    pump();
  });
}

export function candidateMovesAsync(hole, code, thm, opts = {}) {
  return runJob(
    { op: 'candidateMoves', hole, code, thm },
    () => candidateMoves(hole, code, thm) || [],
    opts,
  );
}

export function movesAtAsync(state, thm, opts = {}) {
  if (!state || state.focusIdx < 0) return Promise.resolve([]);
  const hole = state.holes && state.holes[state.focusIdx];
  if (!hole) return Promise.resolve([]);
  if (opts.shouldCancel && opts.shouldCancel()) return Promise.resolve([]);
  if (typeof Worker === 'undefined') {
    return Promise.resolve(collectMovesAt(hole, state.code, thm));
  }
  return runJob(
    { op: 'movesAt', hole, code: state.code, thm },
    () => collectMovesAt(hole, state.code, thm),
    opts,
  );
}

export { collectMovesAt };
