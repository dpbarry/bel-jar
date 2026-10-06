// Signing in with GitHub, and sessions (server/auth.mjs, plan Phase 02), in
// the Worker as it runs: wrangler dev with the dev account header OFF, so the
// only way to be anyone is a session, and a stand-in for GitHub in Node
// (authorize, the code exchange, the profile), so the whole redirect dance
// runs without the real GitHub.
import fs from 'node:fs';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { cookiePolicy, setCookie, sessionAccount, handleAuth, deviceOf, SESSION_MS, USED_STEP_MS } from '../server/auth.mjs';
import { GRACE_MS } from '../server/deletion.mjs';
import { createSyncStore } from '../server/sync-store.mjs';
import worker from '../server/worker.mjs';
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
let proxy = null;
function finish(code) {
  if (dev) {
    if (code) console.error(dev.logs().split('\n').slice(-25).join('\n'));
    dev.stop();
  }
  if (gh) gh.close();
  if (proxy) proxy.dispose().catch(() => {});
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

  // "Last used" moves at most once an hour: one write an hour for a session in use.
  const writes = [];
  const recording = (row) => ({
    prepare: (sql) => ({ bind: (...args) => ({ first: async () => row, run: async () => { writes.push([sql, args]); return {}; } }) }),
  });
  await sessionAccount(req('__Host-bj_session=' + token), { DB: recording({ user_id: 'u_x', expires_at: now + 1, used_at: now - USED_STEP_MS + 1 }) }, now);
  expect(writes.length === 0, 'a session used within the hour is not written again');
  await sessionAccount(req('__Host-bj_session=' + token), { DB: recording({ user_id: 'u_x', expires_at: now + 1, used_at: now - USED_STEP_MS }) }, now);
  expect(writes.length === 1 && /UPDATE sessions SET used_at/.test(writes[0][0]) && writes[0][1][0] === now, 'one used an hour ago is marked used now');
  expect(writes[0][0].includes('device = COALESCE(device, ?)') && writes[0][1][1] === null,
    'and named then if it has none yet, from its own requests (a request with no browser to name names nothing)');
  const failing = { prepare: (sql) => ({ bind: () => ({ first: async () => ({ user_id: 'u_x', expires_at: now + 1, used_at: null }), run: async () => { throw new Error('D1 hiccup'); } }) }) };
  expect((await sessionAccount(req('__Host-bj_session=' + token), { DB: failing }, now)) === 'u_x', 'and a write that fails costs the request nothing');

  // What a session is called in Settings: a coarse name, never the header itself.
  const UA = {
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36': 'Chrome on Windows',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0': 'Edge on Windows',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15': 'Safari on macOS',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0': 'Firefox on macOS',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1': 'Safari on iPhone',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36': 'Chrome on Android',
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36': 'Chrome on ChromeOS',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0': 'Opera on Linux',
    'curl/8.4.0': null,
    '': null,
  };
  const named = Object.entries(UA).map(([ua, want]) => [deviceOf(ua), want]);
  expect(named.every(([got, want]) => got === want), `a browser is named by what it is and where (${JSON.stringify(named.filter(([g, w]) => g !== w))})`);
}

/** fn() with console.warn captured: the lines the Worker leaves in Workers Logs. */
async function logged(fn) {
  const lines = [];
  const warn = console.warn;
  console.warn = (...a) => lines.push(a.join(' '));
  try {
    return { res: await fn(), lines };
  } finally {
    console.warn = warn;
  }
}

// ── half-configured: deployed before `wrangler secret put` ───────────────────
{
  const start = new Request('https://beljar.deanbarry.com/api/auth/github/start');
  const at = (env) => logged(() => handleAuth(start, env, '/api/auth/github/start', () => true));
  const half = await at({ GITHUB_CLIENT_ID: 'Ov23x' });
  const none = await at({});
  expect(half.res.headers.get('location') === '/?signin=failed&why=config' && none.res.headers.get('location') === '/?signin=failed&why=config',
    'without its secret, sign-in refuses at the start, back to the page with the reason, before sending anyone through GitHub');
  const both = await at({ GITHUB_CLIENT_ID: 'Ov23x', GITHUB_CLIENT_SECRET: 's' });
  expect(new URL(both.res.headers.get('location')).origin === 'https://github.com', 'with both, it goes to GitHub');
}

// ── a stand-in for GitHub (tests/_fake-github.mjs) ───────────────────────────
gh = await startFakeGitHub();
const GH = gh.url;
const seen = gh.seen;

// ── a secret GitHub rejects, named as such (the handler in-process) ──────────
{
  const env = Object.assign({ GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'wrong-secret' }, gh.vars);
  const cb = new Request('https://beljar.deanbarry.com/api/auth/github/callback?state=st4te&code=c0de1',
    { headers: { cookie: '__Host-bj_state=st4te' } });
  const { res, lines } = await logged(() => handleAuth(cb, env, '/api/auth/github/callback', () => true));
  expect(res.headers.get('location') === '/?signin=failed&why=exchange&detail=incorrect_client_credentials',
    `a secret GitHub rejects comes back named, so the page can say it is the server's fault (${res.headers.get('location')})`);
  expect(lines.length === 1 && lines[0] === 'auth: sign-in failed: exchange incorrect_client_credentials' && !/wrong-secret|c0de1|st4te/.test(lines.join()),
    `and the Worker logs the step and GitHub's answer, never the secret, the code or the state (${lines.join(' | ')})`);
}

try {
  dev = await startWorker({
    vars: Object.assign({ DEV_ACCOUNT_HEADER: 'no' }, gh.vars),
  });
} catch (err) {
  console.error(String(err && err.message || err));
}
expect(!!dev, 'wrangler dev serves the Worker');
const W = dev.url;

/** One browser: a cookie jar, and a sign-in that follows the redirects as a browser would. `ua`: its User-Agent. */
function browser(ua) {
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
    const headers = url.startsWith(W) && jar.size ? { cookie: cookie() } : {};
    if (ua) headers['user-agent'] = ua;
    const res = await fetch(url, { redirect: 'manual', headers });
    if (url.startsWith(W)) take(res);
    return res;
  };
  return {
    jar,
    cookie,
    get,
    /** Start, GitHub, callback: where the callback sent the browser. `from`: the page it was started on. */
    async signIn(from) {
      const start = await get(W + '/api/auth/github/start' + (from == null ? '' : '?return=' + encodeURIComponent(from)));
      const atGitHub = await get(start.headers.get('location'));
      const back = await get(atGitHub.headers.get('location'));
      return { start, back, landed: back.headers.get('location') };
    },
    me: async () => (await (await fetch(W + '/api/auth/me', { headers: { cookie: cookie() } })).json()).user,
    /** The whole answer of me: { user, ended? }. */
    meAll: async () => (await fetch(W + '/api/auth/me', { headers: { cookie: cookie() } })).json(),
    sessions: async () => (await fetch(W + '/api/auth/sessions', { headers: { cookie: cookie() } })).json(),
    /** A POST to the account API, as the page sends it (same-site JSON), or as `headers` say. */
    post: (p, body, headers) => fetch(W + p, {
      method: 'POST',
      headers: Object.assign({ cookie: cookie(), 'content-type': 'application/json' }, headers || {}),
      body: JSON.stringify(body || {}),
    }),
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
  expect(res.headers.get('location') === '/?signin=failed&why=state&detail=mismatch' && !mallory.jar.has('bj_session'), 'a callback with another state starts no session');

  const stranger = browser();
  const s2 = await browser().get(W + '/api/auth/github/start');
  const g2 = await fetch(s2.headers.get('location'), { redirect: 'manual' });
  const r2 = await stranger.get(g2.headers.get('location'));
  expect(r2.headers.get('location') === '/?signin=failed&why=state&detail=no-cookie' && !stranger.jar.has('bj_session'),
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
  expect(r4.headers.get('location') === '/?signin=failed&why=exchange&detail=bad_verification_code' && !replay.jar.has('bj_session'), 'a code already used starts no session');

  gh.signIn(null);
  const declined = await browser().signIn();
  expect(declined.landed === '/?signin=failed&why=denied', 'declining at GitHub comes back as declined, signed out');
  gh.signIn('dean');
}

// ── back to the page the sign-in was started from ───────────────────────────
{
  const editor = '/edit?p=p_01m3xq1ph808nx8xjd4jj1rhcx';
  const there = browser();
  const went = await there.signIn(editor);
  const kept = went.start.headers.getSetCookie().find((c) => c.startsWith('bj_return='));
  expect(kept && /HttpOnly/.test(kept) && /Max-Age=600/.test(kept), 'where to come back to rides beside the state, for as long');
  expect(went.landed === editor && there.jar.has('bj_session') && !there.jar.has('bj_return'),
    `signing in from the editor comes back to the same project, and the note of it is gone (${went.landed})`);
  expect((await browser().signIn('/')).landed === '/' && (await browser().signIn()).landed === '/', 'from home, or from nowhere, it lands on home');

  // ⛔ Only a path on this site. A link that starts a sign-in must not choose where it ends.
  for (const bad of ['https://evil.example/', '//evil.example/x', '/\\evil.example', 'edit', '/api/auth/signout', '/edit?p=a b', '/' + 'x'.repeat(600)]) {
    const b = browser();
    const r = await b.signIn(bad);
    expect(r.landed === '/' && b.jar.has('bj_session'), `a return of ${JSON.stringify(bad.slice(0, 30))} is refused: signed in, on home`);
  }
  // ⛔ And the note is read by the rule it was written by: one planted by
  // something else (anything that can set a cookie for this site) chooses nothing.
  for (const planted of ['//evil.example/x', 'https%3A%2F%2Fevil.example%2F', '%2F%2Fevil.example', '%2Fapi%2Fauth%2Fsignout', '%E0%A4%A']) {
    const b = browser();
    const start = await b.get(W + '/api/auth/github/start?return=' + encodeURIComponent('/edit'));
    b.jar.set('bj_return', planted);
    const atGitHub = await b.get(start.headers.get('location'));
    const back = await b.get(atGitHub.headers.get('location'));
    expect(back.headers.get('location') === '/' && b.jar.has('bj_session'),
      `a planted return of ${JSON.stringify(planted)} is not followed: signed in, on home (${back.headers.get('location')})`);
  }
  const { safeReturn } = await import('../server/auth.mjs');
  expect(safeReturn('/edit.html?p=x#L3') === '/edit.html?p=x#L3' && safeReturn('/') === '/' && safeReturn(null) === null
    && safeReturn('/a\\b') === null && safeReturn('/api') === null && safeReturn('/api?x') === null,
    'the rule itself: a plain path, never a backslash, never the API');

  // A failed sign-in forgets where it was going: the failure is told on home.
  gh.signIn(null);
  const declined = browser();
  const d = await declined.signIn(editor);
  expect(d.landed === '/?signin=failed&why=denied' && !declined.jar.has('bj_return'), 'a declined sign-in lands on home and keeps no return');
  gh.signIn('dean');
  // One sign-in's return never leaks into the next.
  const twice = browser();
  await twice.signIn(editor);
  twice.jar.delete('bj_session');
  expect((await twice.signIn()).landed === '/', 'a later sign-in with no return goes home, not to the earlier one\'s page');
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

// ── where the account is signed in, and Sign out there (plan v6 c3) ────────
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0';
gh.signIn('newcomer');
const one = browser(WINDOWS);
await one.signIn();
const two = browser(MAC);
await two.signIn();
const three = browser(WINDOWS);
await three.signIn();
const them = await one.me();
{
  const listed = await one.sessions();
  const s = listed.sessions || [];
  expect(s.length === 3 && s.filter((x) => x.current).length === 1, `the account's three sessions are listed, this browser's marked (${JSON.stringify(s)})`);
  expect(s.some((x) => x.device === 'Firefox on macOS') && s.filter((x) => x.device === 'Chrome on Windows').length === 2,
    'each named by the browser it was started in');
  expect(s.every((x) => /^[0-9a-f]{64}$/.test(x.id) && x.usedAt >= x.signedInAt && x.signedInAt > 0), 'with when it was signed in and last used');
  const mine = (await desktop.sessions()).sessions || [];
  expect(mine.length >= 1 && mine.filter((x) => x.current).length === 1 && !mine.some((x) => s.some((y) => y.id === x.id)), 'another account lists only its own');
  expect((await fetch(W + '/api/auth/sessions')).status === 401, 'and nobody signed in lists nothing');

  const there = s.find((x) => x.device === 'Firefox on macOS');
  const self = s.find((x) => x.current);
  expect((await one.post('/api/auth/sessions/end', { id: there.id }, { origin: 'https://evil.example' })).status === 403
    && (await one.post('/api/auth/sessions/end', { id: there.id }, { 'content-type': 'text/plain' })).status === 415
    && !!(await two.me()), 'another site cannot sign a device out, nor a request that is not JSON');
  expect((await one.post('/api/auth/sessions/end', { id: self.id })).status === 400 && !!(await one.me()),
    'this browser does not end its own session here: Sign out does, once its work is in the cloud');
  expect((await desktop.post('/api/auth/sessions/end', { id: there.id })).status === 200 && !!(await two.me()),
    'another account naming the session ends nothing');
  expect((await one.post('/api/auth/sessions/end', { id: 'x'.repeat(64) })).status === 400, 'an id that is not one is refused');

  const ended = await one.post('/api/auth/sessions/end', { id: there.id });
  expect(ended.status === 200 && (await two.me()) === null, 'Sign out there ends that session');
  expect((await two.meAll()).ended === 'elsewhere', 'and its browser hears why when it next asks: signed out from another device');
  const blocked = await two.sync().heads().then(() => null, (e) => e);
  expect(blocked && blocked.status === 401, 'its sync is refused');
  expect(!!(await one.me()) && !!(await three.me()) && ((await one.sessions()).sessions || []).length === 2, 'the others stay signed in');
}

// ── Delete account (plan v6 c3) ─────────────────────────────────────────────
// Done when: after a delete, nothing in D1 or R2 names the account (the
// bucket is listed), and its old session is refused.
const textsOf = (n) => Array.from({ length: n }, (_, i) => `theorem t${i} : nat = 1.\n`);
{
  const t = one.sync();
  const texts = textsOf(3);
  const files = texts.map((x, i) => ({ id: 'f' + i, path: `f${i}.bel`, hash: sha256Now(x) }));
  const res = await t.commit('p_theirs', {
    id: 'n1', base: 0, texts: Object.fromEntries(texts.map((x) => [sha256Now(x), x])),
    manifest: { v: 1, name: 'Theirs', createdAt: 1, files, folders: [], suites: {} },
  });
  expect(res.ok, 'the account has a project, with its texts');
  await t.commit('p_gone', { id: 'n2', base: 0, manifest: { v: 1, name: 'Gone', createdAt: 1, files: [], folders: [], suites: {} } });
  expect((await t.remove('p_gone', { id: 'n3', base: 1 })).ok, 'and one it deleted (a version too)');
  expect((await t.commitSettings({ id: 's1', base: 0, values: { theme: 'dark' } })).ok, 'and its settings');

  expect((await one.post('/api/auth/delete', {}, { origin: 'https://evil.example' })).status === 403
    && (await one.post('/api/auth/delete', {}, { 'content-type': 'text/plain' })).status === 415
    && !!(await one.me()), 'another site cannot delete an account, nor a request that is not JSON');
  expect((await fetch(W + '/api/auth/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status === 401,
    'nor anybody signed out');

  const del = await one.post('/api/auth/delete');
  const body = await del.json();
  expect(del.status === 200 && body.ok && body.finished === true, `Delete account answers once the rows and the texts are gone (${JSON.stringify(body)})`);
  expect(!del.headers.getSetCookie().some((c) => /bj_session=;/.test(c)),
    'and leaves the session cookie: it is how the browser hears what happened if this answer is lost');
  expect((await one.me()) === null && (await one.meAll()).ended === 'deleted', 'its old session is refused, and says the account was deleted');
  expect((await three.me()) === null && (await three.meAll()).ended === 'deleted', 'every session of it ends, and each browser hears why');
  expect((await two.meAll()).ended === 'elsewhere', 'one ended before keeps its own reason');
  const refused = await one.sync().heads().then(() => null, (e) => e);
  expect(refused && refused.status === 401, 'the sync API refuses the old session');
  expect((await desktop.me()).id === dean.id && (await desktop.sync().heads()).some((h) => h.id === 'p_mine'),
    'another account is untouched: signed in, with its projects');
}

// Read what the Worker left: wrangler dev stopped, the same local D1 and R2 opened here.
const persist = dev.persist;
dev.stop({ keep: true });
dev = null;
proxy = await getPlatformProxy({ configPath: path.join(persist, 'wrangler.json'), persist: { path: path.join(persist, 'v3') } });
const { DB, TEXTS } = proxy.env;
const tables = (await DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'").all())
  .results.map((r) => r.name).sort();
expect(['deletions', 'ended_sessions', 'identities', 'projects', 'sessions', 'texts', 'users', 'versions'].every((x) => tables.includes(x)),
  `the Worker's own tables are here to read (${tables.join(', ')})`);

/**
 * Every cell of every table that names the deleted account, or holds its work:
 * its id, GitHub id, handle, name or picture, and its projects' ids (a version
 * names its project, never the account).
 */
const theirProjects = ['p_theirs', 'p_gone', 'p_late'];
async function naming(skip = []) {
  const hits = [];
  for (const table of tables) {
    if (skip.includes(table)) continue;
    for (const row of (await DB.prepare(`SELECT * FROM ${table}`).all()).results) {
      for (const [col, v] of Object.entries(row)) {
        const s = String(v);
        if (s.includes(them.id) || s === '303' || s === them.handle || s.includes(them.name) || (them.avatar && s.includes(them.avatar))
          || theirProjects.includes(s)) {
          hits.push(`${table}.${col}=${s.slice(0, 40)}`);
        }
      }
    }
  }
  return hits;
}
async function bucket() {
  const keys = [];
  let cursor;
  do {
    const page = await TEXTS.list({ cursor, limit: 1000 });
    keys.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}
{
  const left = await naming(['deletions']);
  expect(left.length === 0, `nothing in D1 names the account (${left.join(', ')})`);
  const keys = await bucket();
  expect(keys.length > 0 && !keys.some((k) => k.includes(them.id)), `nothing in R2 does: the whole bucket listed, ${keys.length} texts, none of it`);
  expect(keys.some((k) => k.startsWith('t/' + dean.id + '/')), 'and another account\'s texts are all still there');
  const rec = (await DB.prepare('SELECT account, requested_at FROM deletions').all()).results;
  expect(rec.length === 1 && rec[0].account === them.id, 'the deletion is recorded, for the daily job, until it lets it go');
  const ended = (await DB.prepare('SELECT reason, COUNT(*) AS n FROM ended_sessions GROUP BY reason ORDER BY reason').all()).results;
  expect(JSON.stringify(ended) === '[{"reason":"deleted","n":2},{"reason":"elsewhere","n":1}]',
    `why each session ended is kept by its hash alone (${JSON.stringify(ended)})`);
  const devices = (await DB.prepare('SELECT device FROM sessions').all()).results.map((r) => r.device);
  expect(!devices.some((d) => d && /Mozilla|AppleWebKit|Gecko/.test(d)), 'no session keeps a User-Agent, only its coarse name');

  // A request already under way when the account went (authenticated a moment
  // before) writes after it: a project, its texts, and a sign-in that found the
  // identity just before it went.
  const late = createSyncStore({ db: DB, texts: TEXTS }).transport(them.id);
  const lateText = 'late\n';
  await late.commit('p_late', {
    id: 'l1', base: 0, texts: { [sha256Now(lateText)]: lateText },
    manifest: { v: 1, name: 'Late', createdAt: 1, files: [{ id: 'f', path: 'late.bel', hash: sha256Now(lateText) }], folders: [], suites: {} },
  });
  const token = 'L'.repeat(43);
  await DB.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(sha256Now(token), them.id, Date.now(), Date.now() + SESSION_MS).run();
  expect((await naming(['deletions'])).length > 0 && (await bucket()).some((k) => k.includes(them.id)), 'written late, they name the account again');
  const lateReq = new Request('http://127.0.0.1/api/auth/me', { headers: { cookie: 'bj_session=' + token } });
  expect((await sessionAccount(lateReq, proxy.env)) === null, 'a session whose account is gone is nobody\'s: it is read beside its account');

  // A session past its time, of the account that stays.
  await DB.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind('e'.repeat(64), dean.id, 1, 2).run();

  const daily = async (at) => {
    const waits = [];
    await worker.scheduled({ scheduledTime: at, cron: '0 7 * * *' }, proxy.env, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  };
  const requested = rec[0].requested_at;
  await daily(requested + GRACE_MS - 1);
  expect((await naming(['deletions'])).length === 0 && !(await bucket()).some((k) => k.includes(them.id)),
    'the daily job sweeps up what was written late');
  expect((await DB.prepare('SELECT COUNT(*) AS n FROM deletions').first()).n === 1, 'and keeps the record within the hour: a request may still be under way');
  expect(!(await DB.prepare('SELECT 1 FROM sessions WHERE id_hash = ?').bind('e'.repeat(64)).first()), 'sessions past their time go');
  expect((await DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').bind(dean.id).first()).n >= 1, 'live ones stay');
  await daily(requested + GRACE_MS);
  const after = await naming();
  expect(after.length === 0 && (await DB.prepare('SELECT COUNT(*) AS n FROM deletions').first()).n === 0,
    `an hour on, the record goes too: nothing in D1 names the account, in any table (${after.join(', ')})`);
  expect(!(await bucket()).some((k) => k.includes(them.id)), 'nor anything in R2');
  const kept = await createSyncStore({ db: DB, texts: TEXTS }).transport(dean.id).head('p_mine');
  expect(kept && kept.version === 1, 'the other account\'s project is as it was');
}
await proxy.dispose();
proxy = null;
try { fs.rmSync(persist, { recursive: true, force: true }); } catch (_) { /* a file may be held briefly */ }

console.log(`OK auth worker (${n} checks: cookies, the GitHub round trip, sessions as accounts, forged and replayed callbacks, the way back, handles, signing out, where you are signed in, Sign out there, Delete account down to the bucket, the daily job)`);
finish(0);
