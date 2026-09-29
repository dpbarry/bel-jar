// Fakes for the sync runner (js/persist/sync/runner.mjs): a clock whose timers
// run only when a test advances it, the Web Locks API as far as the runner uses
// it, and a store that says what changed. Shared by test-sync-runner and
// test-sync-hold.

export const flush = () => new Promise((r) => setImmediate(r));

export function clock() {
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
export function lockManager() {
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

export function storeStub() {
  const fns = new Set();
  return {
    subscribe(fn) { fns.add(fn); return () => fns.delete(fn); },
    emit(e) { for (const fn of [...fns]) fn(e); },
  };
}
