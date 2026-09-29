/**
 * BelJar's Worker: the static site, plus the sync API (docs/PERSIST.md §5).
 *
 *   POST /api/sync/<method>   body { args: [...] }   →   { result }
 *
 * `<method>` is one of the protocol's (js/persist/sync/protocol.mjs); the
 * answers are the reference server's, from D1 and R2 (sync-store.mjs).
 *
 * Who is asking: the session cookie of someone signed in with GitHub
 * (auth.mjs, the /api/auth/* routes). For tests and local development only,
 * where the config sets DEV_ACCOUNT_HEADER = "yes" (server/wrangler.jsonc),
 * the `X-BelJar-Account` header names the account instead. Anywhere else
 * that header means nothing, and without a session every call gets 401.
 *
 * ⛔ Only same-site requests. A browser always sends Origin with a POST from
 * another site, and the JSON content type forces a preflight this Worker
 * never answers, so a cookie session can never be used from elsewhere.
 */
import { createSyncStore } from './sync-store.mjs';
import { handleAuth, sessionAccount } from './auth.mjs';

const METHODS = new Set(['heads', 'head', 'blobs', 'missing', 'putBlobs', 'commit', 'remove', 'settings', 'commitSettings']);
const ACCOUNT = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BODY = 16 * 1024 * 1024;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function accountOf(request, env) {
  if (env.DEV_ACCOUNT_HEADER === 'yes') {
    const a = request.headers.get('x-beljar-account');
    if (a) return ACCOUNT.test(a) ? a : null;
  }
  return sessionAccount(request, env);
}

function sameSite(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function handleSync(request, env, method) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!METHODS.has(method)) return json({ error: 'unknown-method' }, 404);
  if (!sameSite(request)) return json({ error: 'cross-site' }, 403);
  if (!/^application\/json\b/.test(request.headers.get('content-type') || '')) return json({ error: 'content-type' }, 415);
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return json({ error: 'too-large' }, 413);
  const account = await accountOf(request, env);
  if (!account) return json({ error: 'signed-out' }, 401);
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: 'bad-request' }, 400);
  }
  if (!body || !Array.isArray(body.args) || body.args.length > 3) return json({ error: 'bad-request' }, 400);
  const store = createSyncStore({ db: env.DB, texts: env.TEXTS });
  try {
    const result = await store.transport(account)[method](...body.args);
    return json({ result: result === undefined ? null : result });
  } catch (err) {
    console.error('sync', method, err && err.stack || err);
    return json({ error: 'server' }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = /^\/api\/sync\/([A-Za-z]+)$/.exec(url.pathname);
    if (m) return handleSync(request, env, m[1]);
    if (url.pathname.startsWith('/api/auth/')) {
      const res = await handleAuth(request, env, url.pathname, sameSite);
      if (res) return res;
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'not-found' }, 404);
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  },
};
