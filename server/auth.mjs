/**
 * Signing in with GitHub, and sessions (plan Phase 02).
 *
 *   GET  /api/auth/github/start      → GitHub, with a one-time state in a cookie
 *   GET  /api/auth/github/callback   → checks the state, reads the profile once,
 *                                      starts a session, back to the site
 *   GET  /api/auth/me                → { user } or { user: null }
 *   POST /api/auth/signout           → ends this browser's session, here and on the server
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

export const SESSION_MS = 90 * 24 * 60 * 60 * 1000;
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
  };
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

/** The account this request's session belongs to, or null. */
export async function sessionAccount(request, env, now = Date.now()) {
  const token = readCookie(request, cookiePolicy(request.url).session);
  if (!token || !TOKEN.test(token)) return null;
  const row = await env.DB.prepare('SELECT user_id, expires_at FROM sessions WHERE id_hash = ?').bind(await sha256(token)).first();
  return row && row.expires_at > now ? row.user_id : null;
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
  return redirect(target.toString(), [setCookie(cookies.state, state, STATE_S, cookies.secure)]);
}

async function callback(request, env) {
  const url = new URL(request.url);
  const cookies = cookiePolicy(url);
  const clearState = setCookie(cookies.state, '', 0, cookies.secure);
  const fail = (why, detail) => failed(why, detail, [clearState]);
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
  await env.DB.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(session), userId, now, now + SESSION_MS).run();
  return redirect('/', [clearState, setCookie(cookies.session, session, Math.floor(SESSION_MS / 1000), cookies.secure)]);
}

async function me(request, env) {
  const userId = await sessionAccount(request, env);
  if (!userId) return json({ user: null });
  const u = await env.DB.prepare('SELECT id, handle, display_name, avatar_url FROM users WHERE id = ?').bind(userId).first();
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

/** The /api/auth/* routes; null for anything else. */
export async function handleAuth(request, env, path, sameSite) {
  if (path === '/api/auth/github/start' && request.method === 'GET') return start(request, env);
  if (path === '/api/auth/github/callback' && request.method === 'GET') return callback(request, env);
  if (path === '/api/auth/me' && request.method === 'GET') return me(request, env);
  if (path === '/api/auth/signout' && request.method === 'POST') {
    return sameSite(request) ? signout(request, env) : json({ error: 'cross-site' }, 403);
  }
  return null;
}
