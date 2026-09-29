// Signing in with GitHub, and sessions (server/auth.mjs, plan Phase 02), in
// the Worker as it runs: wrangler dev with the dev account header OFF, so the
// only way to be anyone is a session, and a stand-in for GitHub in Node
// (authorize, the code exchange, the profile), so the whole redirect dance
// runs without the real GitHub.
import { cookiePolicy, setCookie, sessionAccount, handleAuth, SESSION_MS } from '../server/auth.mjs';
import { createHttpTransport } from '../js/persist/sync/http-transport.mjs';
import { startWorker } from './_worker-env.mjs';
import { startFakeGitHub, PEOPLE } from './_fake-github.mjs';
import { sha256Now } from './_sync-env.mjs';

let n = 0;
let dev = null;
let gh = null;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  finish(1);
}
function finish(code) {
  if (dev) {
    if (code) console.error(dev.logs().split('\n').slice(-25).join('\n'));
    dev.stop();
  }
  if (gh) gh.close();
  process.exit(code);
}

// ── the cookie rules, on their own ───────────────────────────────────────────
{
  const https = cookiePolicy('https://beljar.deanbarry.com/x');
  expect(https.secure && https.session === '__Host-bj_session' && https.state === '__Host-bj_state',
    'over https the cookies are __Host- (this host only, path /, Secure)');
  const local = cookiePolicy('http://127.0.0.1:8787/');
  expect(!local.secure && local.session === 'bj_session', 'local http cannot carry Secure, so plain names');
  const c = setCookie('__Host-bj_session', 'tok', 60, true);
  expect(/HttpOnly/.test(c) && /SameSite=Lax/.test(c) && /Path=\//.test(c) && /Secure/.test(c) && !/Domain/i.test(c),
    'a session cookie is HttpOnly, SameSite=Lax, Path=/, Secure, and names no Domain');
  const req = (cookie) => new Request('https://beljar.deanbarry.com/api/sync/heads', { headers: { cookie } });
  const token = 'A'.repeat(43);
  const db = (row) => ({ prepare: () => ({ bind: () => ({ first: async () => row }) }) });
  const now = 1_800_000_000_000;
  expect((await sessionAccount(req('__Host-bj_session=' + token), { DB: db({ user_id: 'u_x', expires_at: now + 1 }) }, now)) === 'u_x',
    'a live session names its account');
  expect((await sessionAccount(req('__Host-bj_session=' + token), { DB: db({ user_id: 'u_x', expires_at: now }) }, now)) === null,
    'an expired session names nobody');
  expect((await sessionAccount(req('bj_session=' + token), { DB: db({ user_id: 'u_x', expires_at: now + 1 }) }, now)) === null,
    'over https, only the __Host- cookie counts');
  expect(SESSION_MS === 90 * 24 * 60 * 60 * 1000, 'sessions last 90 days');
}

// ── half-configured: deployed before `wrangler secret put` ───────────────────
{
  const start = new Request('https://beljar.deanbarry.com/api/auth/github/start');
  const at = (env) => handleAuth(start, env, '/api/auth/github/start', () => true);
  expect((await at({ GITHUB_CLIENT_ID: 'Ov23x' })).status === 503 && (await at({})).status === 503,
    'without its secret, sign-in refuses at the start, before sending anyone through GitHub to fail on the way back');
  expect((await at({ GITHUB_CLIENT_ID: 'Ov23x', GITHUB_CLIENT_SECRET: 's' })).status === 302, 'with both, it goes to GitHub');
}

// ── a stand-in for GitHub (tests/_fake-github.mjs) ───────────────────────────
gh = await startFakeGitHub();
const GH = gh.url;
const seen = gh.seen;

try {
  dev = await startWorker({
    vars: Object.assign({ DEV_ACCOUNT_HEADER: 'no' }, gh.vars),
  });
} catch (err) {
  console.error(String(err && err.message || err));
}
expect(!!dev, 'wrangler dev serves the Worker');
const W = dev.url;

/** One browser: a cookie jar, and a sign-in that follows the redirects as a browser would. */
function browser() {
  const jar = new Map();
  const take = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (/max-age=0/i.test(attrs.join(';')) || value === '') jar.delete(name);
      else jar.set(name, value);
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const get = async (url) => {
    const res = await fetch(url, { redirect: 'manual', headers: url.startsWith(W) && jar.size ? { cookie: cookie() } : {} });
    if (url.startsWith(W)) take(res);
    return res;
  };
  return {
    jar,
    cookie,
    get,
    /** Start, GitHub, callback: where the callback sent the browser. */
    async signIn() {
      const start = await get(W + '/api/auth/github/start');
      const atGitHub = await get(start.headers.get('location'));
      const back = await get(atGitHub.headers.get('location'));
      return { start, back, landed: back.headers.get('location') };
    },
    me: async () => (await (await fetch(W + '/api/auth/me', { headers: { cookie: cookie() } })).json()).user,
    sync: () => createHttpTransport({ base: W + '/api/sync', headers: { cookie: cookie() } }),
  };
}

// ── signing in ───────────────────────────────────────────────────────────────
const laptop = browser();
expect((await laptop.me()) === null, 'before signing in, nobody');
const first = await laptop.signIn();
const startUrl = new URL(first.start.headers.get('location'));
expect(first.start.status === 302 && startUrl.origin === GH && startUrl.searchParams.get('client_id') === 'test-client'
  && startUrl.searchParams.get('redirect_uri') === W + '/api/auth/github/callback' && !startUrl.searchParams.get('scope'),
  'start sends the browser to GitHub with the client id and our callback, asking for no scopes');
const stateCookie = first.start.headers.getSetCookie().find((c) => c.startsWith('bj_state='));
expect(stateCookie && /HttpOnly/.test(stateCookie) && /SameSite=Lax/.test(stateCookie) && /Max-Age=600/.test(stateCookie),
  'the one-time state rides in an HttpOnly cookie for ten minutes');
expect(first.landed === '/', 'the callback lands back on the site');
expect(laptop.jar.has('bj_session') && !laptop.jar.has('bj_state'), 'with a session cookie, and the state cookie gone');
const dean = await laptop.me();
expect(dean && /^u_[0-9a-z]{26}$/.test(dean.id) && dean.handle === 'dean-b' && dean.name === 'Dean', `me names the account (${JSON.stringify(dean)})`);
expect(seen.exchanges.at(-1).client_secret === 'test-secret' && seen.exchanges.at(-1).redirect_uri === W + '/api/auth/github/callback',
  'the code is exchanged with the secret, server to server');
expect(!/gho_/.test(JSON.stringify(dean)) && !dev.logs().includes('gho_'), 'the GitHub token appears nowhere: not in the answer, not in the logs');

// ── the session is the account ───────────────────────────────────────────────
{
  const t = laptop.sync();
  const text = 'rec nat : type.\n';
  expect((await t.putBlobs('p_mine', { [sha256Now(text)]: text })).ok, 'signed in, the sync API answers');
  const r = await t.commit('p_mine', { id: 'c1', base: 0, manifest: { v: 1, name: 'Mine', createdAt: 1, files: [{ id: 'f1', path: 'main.bel', hash: sha256Now(text) }], folders: [], suites: {} } });
  expect(r.ok && r.version === 1, 'and a project goes up under this account');
  const headerOnly = await fetch(W + '/api/sync/heads', { method: 'POST', headers: { 'content-type': 'application/json', 'x-beljar-account': dean.id }, body: '{"args":[]}' });
  expect(headerOnly.status === 401, 'without the dev flag, naming the account in a header gets nothing');
}

// ── another browser, the same person ─────────────────────────────────────────
PEOPLE.dean.name = 'Dean P. B.';
const desktop = browser();
await desktop.signIn();
const again = await desktop.me();
expect(again && again.id === dean.id, 'the same GitHub account signs into the same BelJar account');
expect(again.name === 'Dean P. B.', 'and its name is refreshed from GitHub at each sign-in');
expect((await desktop.sync().heads()).some((h) => h.id === 'p_mine'), 'and sees its projects');

// ── refusals ─────────────────────────────────────────────────────────────────
{
  const mallory = browser();
  const start = await mallory.get(W + '/api/auth/github/start');
  const atGitHub = await mallory.get(start.headers.get('location'));
  const forged = new URL(atGitHub.headers.get('location'));
  forged.searchParams.set('state', 'not-the-state');
  const res = await mallory.get(forged.toString());
  expect(res.headers.get('location') === '/?signin=failed&why=state' && !mallory.jar.has('bj_session'), 'a callback with another state starts no session');

  const stranger = browser();
  const s2 = await browser().get(W + '/api/auth/github/start');
  const g2 = await fetch(s2.headers.get('location'), { redirect: 'manual' });
  const r2 = await stranger.get(g2.headers.get('location'));
  expect(r2.headers.get('location') === '/?signin=failed&why=state' && !stranger.jar.has('bj_session'),
    'a callback in a browser that did not start the sign-in starts no session (a link sent to someone)');

  const replay = browser();
  const s3 = await replay.get(W + '/api/auth/github/start');
  const g3 = await replay.get(s3.headers.get('location'));
  const cb = g3.headers.get('location');
  await replay.get(cb);
  replay.jar.delete('bj_session');
  const s4 = await replay.get(W + '/api/auth/github/start');
  const reused = new URL(cb);
  reused.searchParams.set('state', new URL(s4.headers.get('location')).searchParams.get('state'));
  const r4 = await replay.get(reused.toString());
  expect(r4.headers.get('location') === '/?signin=failed&why=exchange' && !replay.jar.has('bj_session'), 'a code already used starts no session');

  gh.signIn(null);
  const declined = await browser().signIn();
  expect(declined.landed === '/?signin=failed&why=denied', 'declining at GitHub comes back as declined, signed out');
  gh.signIn('dean');
}

// ── a different person with a clashing handle ────────────────────────────────
{
  gh.signIn('renamed');
  const other = browser();
  await other.signIn();
  const them = await other.me();
  expect(them && them.id !== dean.id && them.handle === 'dean-b-2', 'another GitHub account is another BelJar account, with a handle of its own');
  expect(!(await other.sync().heads()).length && (await other.sync().head('p_mine')) === null, 'and cannot see, or learn of, the first one\'s projects');
  gh.signIn('dean');
}

// ── signing out ──────────────────────────────────────────────────────────────
{
  const cross = await fetch(W + '/api/auth/signout', { method: 'POST', headers: { cookie: laptop.cookie(), origin: 'https://evil.example' } });
  expect(cross.status === 403 && (await laptop.me()) !== null, 'another site cannot sign anyone out');
  const cookieBefore = laptop.cookie();
  const res = await fetch(W + '/api/auth/signout', { method: 'POST', headers: { cookie: cookieBefore } });
  expect(res.status === 200 && res.headers.getSetCookie().some((c) => c.startsWith('bj_session=;') && /Max-Age=0/.test(c)),
    'signing out clears the cookie');
  const kept = await fetch(W + '/api/auth/me', { headers: { cookie: cookieBefore } });
  expect((await kept.json()).user === null, 'and ends the session on the server: the old cookie, kept by someone, is worth nothing');
  const blocked = await createHttpTransport({ base: W + '/api/sync', headers: { cookie: cookieBefore } }).heads().then(() => null, (e) => e);
  expect(blocked && blocked.status === 401, 'the sync API refuses it too');
  expect((await desktop.me()).id === dean.id, 'the other browser stays signed in');
}

console.log(`OK auth worker (${n} checks: cookies, the GitHub round trip, sessions as accounts, forged and replayed callbacks, handles, signing out)`);
finish(0);
