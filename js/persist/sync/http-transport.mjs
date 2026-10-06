/**
 * The sync protocol over HTTP (server/worker.mjs): each method is
 * POST <base>/<method> with { args }, answered with { result }.
 *
 * A transport that cannot get an answer throws, and the engine treats that
 * as offline (protocol.mjs): a network failure, an answer that does not come
 * in time, and any status that is not 200 (a server error, or 401 while nobody
 * is signed in), are all "no answer", never a result the engine could act on.
 *
 * ⛔ Every call has a time limit. Rounds never overlap (runner.mjs), so one
 * request that never answers (a connection that stalls without closing: a
 * captive portal, a server restarting) held its round open, and with it every
 * round after: sync stopped, with nothing to say so, until the page reloaded.
 * A call that runs out is abandoned, the round fails as offline, and the runner
 * backs off and tries again. Sending a commit twice is safe: the server answers
 * a commit id it has seen with the version it made (engine.mjs).
 *
 * `onSignedOut` hears a 401: the session may have ended elsewhere (Sign out
 * there, the account deleted), and the page asks who is signed in
 * (account.mjs). The call still fails as "no answer".
 *
 * `commitOnHide` is a commit sent as the page goes out of sight (engine.mjs
 * `flush`): with `keepalive`, so the browser finishes it after the page has
 * gone. A browser lets such requests carry 64 KB between them; the caller keeps
 * under that.
 */

const METHODS = ['heads', 'head', 'blobs', 'missing', 'putBlobs', 'commit', 'remove', 'settings', 'commitSettings', 'versions', 'version'];

/** How long a call may take. Texts travel in two of them, and a slow link needs the room. */
export const TIMEOUT_MS = 30000;
export const TEXTS_TIMEOUT_MS = 120000;
const CARRIES_TEXTS = new Set(['blobs', 'putBlobs']);

/**
 * @param {object} [o]
 * @param {string} [o.base]        where the API lives ('/api/sync' on the site itself)
 * @param {typeof fetch} [o.fetch]
 * @param {Record<string, string>} [o.headers]   extra headers (local development's account header)
 * @param {number} [o.timeoutMs]        the limit for a call
 * @param {number} [o.textsTimeoutMs]   and for one that carries texts
 * @param {{ set(fn, ms): any, clear(h): void }} [o.timers]
 * @param {() => void} [o.onSignedOut]   the server answered 401
 */
export function createHttpTransport(o = {}) {
  const base = (o.base || '/api/sync').replace(/\/$/, '');
  const doFetch = o.fetch || ((...a) => globalThis.fetch(...a));
  const headers = Object.assign({ 'content-type': 'application/json' }, o.headers || {});
  const timers = o.timers || { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) };
  const limitFor = (method) => (CARRIES_TEXTS.has(method)
    ? (o.textsTimeoutMs != null ? o.textsTimeoutMs : TEXTS_TIMEOUT_MS)
    : (o.timeoutMs != null ? o.timeoutMs : TIMEOUT_MS));

  async function call(method, args, extra) {
    const abort = new AbortController();
    let late = false;
    // The limit covers the body too: a response whose headers came and whose
    // body never does is the same silence.
    const timer = timers.set(() => { late = true; abort.abort(); }, limitFor(method));
    try {
      const res = await doFetch(base + '/' + method, {
        method: 'POST',
        headers,
        body: JSON.stringify({ args }),
        credentials: 'same-origin',
        signal: abort.signal,
        keepalive: !!(extra && extra.keepalive),
      });
      if (res.status === 401 && typeof o.onSignedOut === 'function') {
        try { o.onSignedOut(); } catch (_) { /* the call fails either way */ }
      }
      if (res.status !== 200) {
        throw Object.assign(new Error('sync server answered ' + res.status + ' to ' + method), { status: res.status });
      }
      const body = await res.json();
      if (!body || !('result' in body)) throw new Error('sync server sent no result for ' + method);
      return body.result;
    } catch (err) {
      if (late) throw Object.assign(new Error('sync server did not answer ' + method + ' in time'), { timeout: true });
      throw err;
    } finally {
      timers.clear(timer);
    }
  }

  const transport = {};
  for (const m of METHODS) transport[m] = (...args) => call(m, args);
  transport.commitOnHide = (pid, req) => call('commit', [pid, req], { keepalive: true });
  return transport;
}
