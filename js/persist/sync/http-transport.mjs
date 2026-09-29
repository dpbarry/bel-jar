/**
 * The sync protocol over HTTP (server/worker.mjs): each method is
 * POST <base>/<method> with { args }, answered with { result }.
 *
 * A transport that cannot get an answer throws, and the engine treats that
 * as offline (protocol.mjs): a network failure, and any status that is not
 * 200 (a server error, or 401 while nobody is signed in), are both "no
 * answer", never a result the engine could act on.
 */

const METHODS = ['heads', 'head', 'blobs', 'missing', 'putBlobs', 'commit', 'remove', 'settings', 'commitSettings'];

/**
 * @param {object} [o]
 * @param {string} [o.base]        where the API lives ('/api/sync' on the site itself)
 * @param {typeof fetch} [o.fetch]
 * @param {Record<string, string>} [o.headers]   extra headers (local development's account header)
 */
export function createHttpTransport(o = {}) {
  const base = (o.base || '/api/sync').replace(/\/$/, '');
  const doFetch = o.fetch || ((...a) => globalThis.fetch(...a));
  const headers = Object.assign({ 'content-type': 'application/json' }, o.headers || {});

  async function call(method, args) {
    const res = await doFetch(base + '/' + method, {
      method: 'POST',
      headers,
      body: JSON.stringify({ args }),
      credentials: 'same-origin',
    });
    if (res.status !== 200) {
      throw Object.assign(new Error('sync server answered ' + res.status + ' to ' + method), { status: res.status });
    }
    const body = await res.json();
    if (!body || !('result' in body)) throw new Error('sync server sent no result for ' + method);
    return body.result;
  }

  const transport = {};
  for (const m of METHODS) transport[m] = (...args) => call(m, args);
  return transport;
}
