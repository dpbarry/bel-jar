// case-fill-worker.mjs — the case-completion worker. Built to js/case-fill.worker.js as
// a CLASSIC worker (iife): it needs importScripts for the Beluga runtime.
//
// Why a worker of its own: the search runs here synchronously, exactly as the harness
// measured it, with its own constructor scope and its own Beluga. Nothing it does can
// slow the editor, collide with a Harpoon run, or be killed by Harpoon's cancel; and if
// a single check loops, terminating this worker stops it and nothing else.
//
// Messages in:  { type: 'init', script }   the runtime URL (BelugaClient.runtimeScriptUrl)
//               { type: 'job', job }       see runJob in case-fill-job.mjs
//               { type: 'cancel', id }
// Messages out: whatever runJob posts, plus { type: 'ready' } / { type: 'load-error', error }.

import { runJob } from './case-fill-job.mjs';

let ready = null;
const cancelled = new Set();
const queue = [];
let running = false;

// The oracle: Beluga's synchronous check, as the promise the filler expects. A throw
// (a stack overflow included) is a failed check, never an exception out of the search;
// `ok` is normalised the way the checker's own worker does it.
// Each check first yields a macrotask: a run of checks resolving as microtasks would
// never let a `cancel` message in, and checks take hundreds of milliseconds anyway.
function check(code) {
  return new Promise((resolve) => setTimeout(() => {
    try {
      const r = self.Beluga.checkFromString(code);
      const ok = r && (r.ok === true || r.ok === 1 || String(r.ok) === 'true');
      resolve({ ok: !!ok, output: r && r.output != null ? String(r.output) : '' });
    } catch (e) {
      resolve({ ok: false, output: 'Error: ' + (e && e.message ? e.message : String(e)) });
    }
  }, 0));
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      if (cancelled.has(job.id)) { self.postMessage({ id: job.id, type: 'done', cancelled: true }); continue; }
      try {
        await ready;
        await runJob(job, check, (msg) => self.postMessage(msg), () => cancelled.has(job.id));
      } catch (e) {
        self.postMessage({ id: job.id, type: 'done', cancelled: false, error: e && e.message ? e.message : String(e) });
      }
      cancelled.delete(job.id);
    }
  } finally {
    running = false;
  }
}

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === 'init' && !ready) {
    self.importScripts(new URL('beluga/beluga-runtime-load.js', self.location.href).href);
    ready = self.loadBelugaRuntime(msg.script).then(
      () => self.postMessage({ type: 'ready' }),
      (err) => { self.postMessage({ type: 'load-error', error: err && err.message ? err.message : String(err) }); throw err; },
    );
  } else if (msg.type === 'job' && msg.job) {
    queue.push(msg.job);
    pump();
  } else if (msg.type === 'cancel') {
    cancelled.add(msg.id);
  }
};
