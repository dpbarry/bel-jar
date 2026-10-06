/**
 * Signing in with GitHub, and sessions (plan Phase 02).
 *
 *   GET  /api/auth/github/start      → GitHub, with a one-time state in a cookie
 *   GET  /api/auth/github/callback   → checks the state, reads the profile once,
 *                                      starts a session, back to the site
 *   GET  /api/auth/me                → { user }, or { user: null } with why this
 *                                      browser's session ended when it should hear it
 *   POST /api/auth/signout           → ends this browser's session, here and on the server
 *   GET  /api/auth/sessions          → where the account is signed in (Settings > Account)
 *   POST /api/auth/sessions/end      → ends one of them, { id }: Sign out there
 *   POST /api/auth/delete            → deletes the account (deletion.mjs)
 *
 * ⛔ No GitHub token is stored anywhere. The callback exchanges the code, reads
 * the profile, and lets the token go: BelJar needs to know who someone is,
 * never to act for them on GitHub (no scopes are asked for).
 * ⛔ A session is a random token in an HttpOnly, SameSite=Lax cookie the page
 * cannot read; D1 keeps only its hash, and deleting the row ends it.
 * ⛔ The state cookie ties the callback to the browser that started it: a
 * callback without it, or with another state, starts no session.
 */
import { sha256 } from '../js/persist/sync/protocol.mjs';
import { deleteAccountRows, deleteTexts, REQUEST_BATCHES } from './deletion.mjs';

export const SESSION_MS = 90 * 24 * 60 * 60 * 1000;
/** A session's "last used" moves at most this often: one write an hour for a session in use. */
export const USED_STEP_MS = 60 * 60 * 1000;
const STATE_S = 10 * 60;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const B32 = '0123456789abcdefghjkmnpqrstvwxyz';

const GITHUB = {
  authorize: 'https://github.com/login/oauth/authorize',
  token: 'https://github.com/login/oauth/access_token',
  api: 'https://api.github.com',
};

/** Where GitHub is: the real one, unless the config points elsewhere (the tests' stand-in). */
function github(env) {
  return {
    authorize: env.GITHUB_AUTHORIZE_URL || GITHUB.authorize,
    token: env.GITHUB_TOKEN_URL || GITHUB.token,
    api: (env.GITHUB_API_URL || GITHUB.api).replace(/\/$/, ''),
  };
}

function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  let s = '';
  for (const b of a) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function newUserId() {
  const a = crypto.getRandomValues(new Uint8Array(26));
  let s = 'u_';
  for (const b of a) s += B32[b & 31];
  return s;
}

/**
 * Cookie names and attributes for this origin. Over https the __Host- prefix
 * pins a cookie to exactly this host, path / and Secure; local http (wrangler
 * dev) cannot carry Secure, so there the plain names are used.
 */
export function cookiePolicy(url) {
  const secure = new URL(url).protocol === 'https:';
  return {
    secure,
    session: secure ? '__Host-bj_session' : 'bj_session',
    state: secure ? '__Host-bj_state' : 'bj_state',
    back: secure ? '__Host-bj_return' : 'bj_return',
  };
}

/**
 * Where a sign-in may come back to: a path on this site (the page it was
 * started from, e.g. /edit?p=ID), or null. ⛔ Only a path. An absolute address,
 * a scheme-relative one (//host), a backslash a browser would read as a slash,
 * and anything under /api/ are refused: the sign-in would otherwise deliver a
 * freshly signed-in person to whatever address a link gave it.
 */
export function safeReturn(raw) {
  if (typeof raw !== 'string' || raw.length > 512) return null;
  if (!/^\/(?![/\\])[\x21-\x7e]*$/.test(raw) || raw.includes('\\')) return null;
  if (raw === '/api' || raw.startsWith('/api/') || raw.startsWith('/api?')) return null;
  return raw;
}

export function setCookie(name, value, maxAgeSeconds, secure) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

export function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function redirect(location, cookies = []) {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

function json(value, status = 200, cookies = []) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(JSON.stringify(value), { status, headers });
}

/**
 * A coarse name for the browser a session was started in ("Chrome on
 * Windows"), or null: what Settings > Account shows beside it. Only this is
 * kept, never the User-Agent itself.
 */
export function deviceOf(ua) {
  if (typeof ua !== 'string' || !ua) return null;
  const browser = /\bEdg(e|A|iOS)?\//.test(ua) ? 'Edge'
    : /\bOPR\/|\bOpera\b/.test(ua) ? 'Opera'
      : /\bSamsungBrowser\//.test(ua) ? 'Samsung Internet'
        : /\bFirefox\/|\bFxiOS\//.test(ua) ? 'Firefox'
          : /\bChrome\/|\bCriOS\//.test(ua) ? 'Chrome'
            : /\bSafari\//.test(ua) ? 'Safari'
              : null;
  const os = /\biPhone\b/.test(ua) ? 'iPhone'
    : /\biPad\b/.test(ua) ? 'iPad'
      : /\bAndroid\b/.test(ua) ? 'Android'
        : /\bCrOS\b/.test(ua) ? 'ChromeOS'
          : /\bWindows\b/.test(ua) ? 'Windows'
            : /\bMac OS X\b|\bMacintosh\b/.test(ua) ? 'macOS'
              : /\bLinux\b/.test(ua) ? 'Linux'
                : null;
  if (browser && os) return browser + ' on ' + os;
  return browser || os;
}

/** The hash of this request's session token, as D1 keeps it, or null. */
async function tokenHash(request) {
  const token = readCookie(request, cookiePolicy(request.url).session);
  return token && TOKEN.test(token) ? sha256(token) : null;
}

/**
 * This request's session: { userId, idHash }, or null. ⛔ Read beside its
 * account: a session whose account is gone (one a sign-in finished while the
 * account was being deleted) is nobody's. Marked used at most once an hour,
 * and named then if it has no name yet (one started before sessions had one).
 */
async function sessionOf(request, env, now = Date.now()) {
  const idHash = await tokenHash(request);
  if (!idHash) return null;
  const row = await env.DB.prepare('SELECT s.user_id, s.expires_at, s.used_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?')
    .bind(idHash).first();
  if (!row || !(row.expires_at > now)) return null;
  if (row.used_at == null || now - row.used_at >= USED_STEP_MS) {
    try {
      await env.DB.prepare('UPDATE sessions SET used_at = ?, device = COALESCE(device, ?) WHERE id_hash = ?')
        .bind(now, deviceOf(request.headers.get('user-agent')), idHash).run();
    } catch (_) { /* when it was last used is shown, not relied on: the request goes on */ }
  }
  return { userId: row.user_id, idHash };
}

/** The account this request's session belongs to, or null. */
export async function sessionAccount(request, env, now = Date.now()) {
  const s = await sessionOf(request, env, now);
  return s ? s.userId : null;
}

/**
 * Why this browser's session ended, when it was ended for a reason its browser
 * should hear: 'elsewhere' (Sign out there) or 'deleted' (the account). Null
 * for one that expired, or was never there.
 */
async function endedReason(request, env) {
  const idHash = await tokenHash(request);
  if (!idHash) return null;
  const row = await env.DB.prepare('SELECT reason FROM ended_sessions WHERE id_hash = ?').bind(idHash).first();
  return row && (row.reason === 'elsewhere' || row.reason === 'deleted') ? row.reason : null;
}

/** The account for a GitHub profile: the one this identity signed into before, or a new one. */
async function accountFor(env, profile, now) {
  const subject = String(profile.id);
  const find = () => env.DB.prepare("SELECT user_id FROM identities WHERE provider = 'github' AND subject = ?").bind(subject).first();
  const known = await find();
  if (known) {
    await env.DB.prepare('UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?')
      .bind(profile.name || null, profile.avatar_url || null, known.user_id).run();
    return known.user_id;
  }
  const base = String(profile.login || 'user').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 39) || 'user';
  const id = newUserId();
  for (let n = 1; n <= 20; n++) {
    const handle = n === 1 ? base : `${base}-${n}`;
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO users (id, handle, display_name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(id, handle, profile.name || null, profile.avatar_url || null, now),
        env.DB.prepare("INSERT INTO identities (provider, subject, user_id, created_at) VALUES ('github', ?, ?, ?)")
          .bind(subject, id, now),
      ]);
      return id;
    } catch (_) {
      // The identity arrived in a racing callback, or the handle is taken.
      const raced = await find();
      if (raced) return raced.user_id;
    }
  }
  throw new Error('auth: no free handle for ' + base);
}

/**
 * Back to the site, saying which step failed (why) and, where there is one, GitHub's own
 * answer (detail, e.g. incorrect_client_credentials): the page explains both. Workers Logs
 * keep the same line. ⛔ Never a code, a token or the secret: only these two words.
 */
function failed(why, detail, cookies = []) {
  const d = typeof detail === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(detail) ? detail : null;
  console.warn('auth: sign-in failed:', why, d || '-');
  return redirect('/?signin=failed&why=' + why + (d ? '&detail=' + d : ''), cookies);
}

async function start(request, env) {
  // Both, or nobody is sent through GitHub's consent only to fail the exchange on the way back.
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return failed('config');
  const url = new URL(request.url);
  const cookies = cookiePolicy(url);
  const state = randomToken(24);
  const target = new URL(github(env).authorize);
  target.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  target.searchParams.set('redirect_uri', url.origin + '/api/auth/github/callback');
  target.searchParams.set('state', state);
  target.searchParams.set('allow_signup', 'true');
  // Back to the page that asked, once signed in: kept beside the state, for as long.
  const back = safeReturn(url.searchParams.get('return'));
  return redirect(target.toString(), [
    setCookie(cookies.state, state, STATE_S, cookies.secure),
    setCookie(cookies.back, back ? encodeURIComponent(back) : '', back ? STATE_S : 0, cookies.secure),
  ]);
}

/** The page the sign-in was started from, as the start kept it; home when there is none. */
function returnOf(request, cookies) {
  let raw = readCookie(request, cookies.back);
  try { raw = raw ? decodeURIComponent(raw) : null; } catch (_) { raw = null; }
  return safeReturn(raw) || '/';
}

async function callback(request, env) {
  const url = new URL(request.url);
  const cookies = cookiePolicy(url);
  const clearState = setCookie(cookies.state, '', 0, cookies.secure);
  const clearBack = setCookie(cookies.back, '', 0, cookies.secure);
  const fail = (why, detail) => failed(why, detail, [clearState, clearBack]);
  const state = url.searchParams.get('state');
  const expected = readCookie(request, cookies.state);
  // The detail tells a browser that sent no cookie (blocked, expired after 10 minutes, another
  // browser) from one whose state is another sign-in's (two tabs).
  if (!state || !expected || state !== expected) return fail('state', !state ? 'no-state' : !expected ? 'no-cookie' : 'mismatch');
  const code = url.searchParams.get('code');
  if (!code) {
    const error = url.searchParams.get('error');
    return error === 'access_denied' ? fail('denied') : fail('code', error);
  }
  const gh = github(env);
  let profile;
  try {
    const tokenRes = await fetch(gh.token, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'BelJar' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: url.origin + '/api/auth/github/callback',
      }),
    });
    const token = await tokenRes.json().catch(() => null);
    // GitHub answers 200 with { error } when it refuses: incorrect_client_credentials (the
    // secret), bad_verification_code (expired or used), redirect_uri_mismatch.
    if (!token || typeof token.access_token !== 'string') return fail('exchange', token && token.error ? token.error : 'status-' + tokenRes.status);
    const userRes = await fetch(gh.api + '/user', {
      headers: { authorization: 'Bearer ' + token.access_token, accept: 'application/vnd.github+json', 'user-agent': 'BelJar' },
    });
    if (userRes.status !== 200) return fail('profile', 'status-' + userRes.status);
    profile = await userRes.json();
  } catch (_) {
    return fail('github');
  }
  if (!profile || profile.id == null) return fail('profile', 'no-id');
  const now = Date.now();
  const userId = await accountFor(env, profile, now);
  const session = randomToken(32);
  await env.DB.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at, device, used_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha256(session), userId, now, now + SESSION_MS, deviceOf(request.headers.get('user-agent')), now).run();
  return redirect(returnOf(request, cookies), [
    clearState, clearBack, setCookie(cookies.session, session, Math.floor(SESSION_MS / 1000), cookies.secure),
  ]);
}

async function me(request, env) {
  const s = await sessionOf(request, env);
  if (!s) {
    const ended = await endedReason(request, env);
    return json(ended ? { user: null, ended } : { user: null });
  }
  const u = await env.DB.prepare('SELECT id, handle, display_name, avatar_url FROM users WHERE id = ?').bind(s.userId).first();
  return json({ user: u ? { id: u.id, handle: u.handle, name: u.display_name, avatar: u.avatar_url } : null });
}

async function signout(request, env) {
  const cookies = cookiePolicy(request.url);
  const token = readCookie(request, cookies.session);
  if (token && TOKEN.test(token)) {
    await env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await sha256(token)).run();
  }
  return json({ ok: true }, 200, [setCookie(cookies.session, '', 0, cookies.secure)]);
}

/** Where the account is signed in, the most recently used first. */
async function sessions(request, env) {
  const now = Date.now();
  const s = await sessionOf(request, env, now);
  if (!s) return json({ error: 'signed-out' }, 401);
  const rows = await env.DB.prepare('SELECT id_hash, device, created_at, used_at FROM sessions WHERE user_id = ? AND expires_at > ? '
    + 'ORDER BY COALESCE(used_at, created_at) DESC').bind(s.userId, now).all();
  return json({
    sessions: rows.results.map((r) => ({
      id: r.id_hash,
      device: r.device || null,
      signedInAt: r.created_at,
      usedAt: r.used_at || r.created_at,
      current: r.id_hash === s.idHash,
    })),
  });
}

const SESSION_ID = /^[0-9a-f]{64}$/;

/**
 * Sign out there: ends another session of this account, and keeps why for its
 * browser to hear. ⛔ Not this browser's own: Sign out ends that one, once
 * what it has is in the cloud. Another account's session, or one already
 * gone, is answered the same as one ended, and nothing happens to it.
 */
async function endSession(request, env) {
  const s = await sessionOf(request, env);
  if (!s) return json({ error: 'signed-out' }, 401);
  const body = await request.json().catch(() => null);
  const id = body && typeof body.id === 'string' && SESSION_ID.test(body.id) ? body.id : null;
  if (!id) return json({ error: 'bad-request' }, 400);
  if (id === s.idHash) return json({ error: 'this-session' }, 400);
  const row = await env.DB.prepare('SELECT expires_at FROM sessions WHERE id_hash = ? AND user_id = ?').bind(id, s.userId).first();
  if (row) {
    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO ended_sessions (id_hash, reason, expires_at) VALUES (?, 'elsewhere', ?)").bind(id, row.expires_at),
      env.DB.prepare('DELETE FROM sessions WHERE id_hash = ? AND user_id = ?').bind(id, s.userId),
    ]);
  }
  return json({ ok: true });
}

/**
 * Delete account (deletion.mjs): the rows at once, then the stored texts while
 * this request lasts, carried on if the page goes first (waitUntil); the daily
 * job finishes what is left. ⛔ The session cookie stays: it is how this
 * browser hears, if this answer never reaches it, that the account was deleted
 * (me: ended 'deleted'), and keeps its projects instead of removing them as an
 * ended session's browser would.
 */
async function deleteAccount(request, env, ctx) {
  const s = await sessionOf(request, env);
  if (!s) return json({ error: 'signed-out' }, 401);
  await deleteAccountRows(env.DB, s.userId, Date.now());
  const texts = deleteTexts(env.TEXTS, s.userId, REQUEST_BATCHES).catch((err) => {
    console.error('auth: deleting an account\'s texts:', err && err.stack || err);
    return false;
  });
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(texts);
  return json({ ok: true, finished: await texts });
}

/** A POST that changes the account: same-site, and JSON (another site cannot send it without a preflight). */
function accountPost(request, sameSite) {
  if (!sameSite(request)) return json({ error: 'cross-site' }, 403);
  if (!/^application\/json\b/.test(request.headers.get('content-type') || '')) return json({ error: 'content-type' }, 415);
  return null;
}

/** The /api/auth/* routes; null for anything else. */
export async function handleAuth(request, env, path, sameSite, ctx) {
  if (path === '/api/auth/github/start' && request.method === 'GET') return start(request, env);
  if (path === '/api/auth/github/callback' && request.method === 'GET') return callback(request, env);
  if (path === '/api/auth/me' && request.method === 'GET') return me(request, env);
  if (path === '/api/auth/signout' && request.method === 'POST') {
    return sameSite(request) ? signout(request, env) : json({ error: 'cross-site' }, 403);
  }
  if (path === '/api/auth/sessions' && request.method === 'GET') return sessions(request, env);
  if (path === '/api/auth/sessions/end' && request.method === 'POST') return accountPost(request, sameSite) || endSession(request, env);
  if (path === '/api/auth/delete' && request.method === 'POST') return accountPost(request, sameSite) || deleteAccount(request, env, ctx);
  return null;
}
