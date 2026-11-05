/**
 * BelJar's addresses, and the one place that builds them.
 *
 *   home     /            index.html     your projects and the account
 *   editor   /edit?p=ID   edit.html      one project, named by its address
 *   privacy  /privacy     privacy.html   what BelJar keeps (a page to read)
 *   share    /s/ID        share.html     a project someone shared (share.html?s=ID on a static server)
 *
 * The deployed site answers the short forms (Cloudflare serves `edit.html` at
 * `/edit`). A plain static server (Live Server, the probes) has only the files,
 * so there the links are `edit.html?p=` and `index.html`, beside each other in
 * one folder. Both forms are read wherever they arrive.
 *
 * ⛔ Everything that navigates asks here (tests/test-routes.mjs finds every
 * call in js/), as everything that loads the runtime asks one owner. An address
 * typed twice is how two pages come to disagree about where a project lives.
 *
 * ⛔ The editor's address names its project. A page opened on `?p=ID` works on
 * that project or leaves for home (persist.mjs); it never opens another one
 * under that address.
 */

const g = typeof window !== 'undefined' ? window : globalThis;

/** A project id as keys.mjs makes them. Anything else in `?p=` names nothing. */
export const PROJECT_ID = /^p_[0-9a-hjkmnp-tv-z]{26}$/;

const EDIT_SHORT = /(?:^|\/)edit\/?$/;
const EDIT_ANY = /(?:^|\/)edit(?:\.html)?\/?$/;
const PRIVACY_ANY = /(?:^|\/)privacy(?:\.html)?\/?$/;
const SHARE_PATH = /(?:^|\/)s\/([^/]*)\/?$/;
const SHARE_PAGE = /(?:^|\/)share(?:\.html)?\/?$/;

/** A link's address as protocol.mjs makes them (SHARE_ID): 22 base64url characters. */
export const SHARE_ID = /^[A-Za-z0-9_-]{22}$/;

/**
 * The site answers `/edit`: a deployed host (each document sets
 * `BELJAR_DEPLOYED` from its host name), or the page is itself being served
 * there or at `/s/ID` (`npm run dev`).
 */
function short() {
  if (g.BELJAR_DEPLOYED) return true;
  const path = g.location && typeof g.location.pathname === 'string' ? g.location.pathname : '';
  // The reading page at /s/ID is served by the Worker too: relative files would land under /s/.
  return EDIT_SHORT.test(path) || SHARE_PATH.test(path);
}

function query(pairs) {
  const parts = [];
  for (const [k, v] of pairs) if (v) parts.push(k + '=' + encodeURIComponent(v));
  return parts.length ? '?' + parts.join('&') : '';
}

/**
 * "Start page: Last project" is on (js/boot/early-boot-core.mjs): a bare home
 * address then means "start", and goes on to the last project.
 */
function startsOnLast() {
  const S = g.Settings;
  try {
    return !!S && typeof S.get === 'function' && S.get('startPage') === 'last';
  } catch (_) {
    return false;
  }
}

/**
 * Home. `open`: a project to go on to once this browser has it (`pendingOf`).
 * ⛔ While the start page is the last project, every link to home says so
 * (`?home`): the home button, signing out, a deleted project. Without it the way
 * home would lead straight back to the editor.
 */
export function homeUrl(opts) {
  const base = short() ? '/' : 'index.html';
  if (opts && opts.open) return base + query([['open', opts.open]]);
  if (opts && opts.copy) return base + query([['copy', opts.copy]]);
  return base + (startsOnLast() ? '?home' : '');
}

/** The editor on project `pid`; with none, on the last one opened. */
export function editUrl(pid) {
  return (short() ? '/edit' : 'edit.html') + query([['p', pid]]);
}

/** What BelJar keeps: the page home's foot links to. */
export function privacyUrl() {
  return short() ? '/privacy' : 'privacy.html';
}

/**
 * The reading page of link `id` (docs/PERSIST.md §5.12). `absolute`: the whole
 * address, to copy and send.
 */
export function shareUrl(id, absolute) {
  const rel = short() ? '/s/' + encodeURIComponent(id) : 'share.html' + query([['s', id]]);
  if (!absolute) return rel;
  try {
    return new URL(rel, g.location && g.location.href ? g.location.href : 'https://beljar.deanbarry.com/').href;
  } catch (_) {
    return rel;
  }
}

/** Where sign-in starts, coming back to the page it was asked from. */
export function signInUrl(loc) {
  const l = loc || g.location;
  const back = l ? String(l.pathname || '/') + String(l.search || '') : '/';
  return '/api/auth/github/start' + query([['return', back]]);
}

/**
 * Which page an address is: 'edit', 'privacy', or 'home'. ⛔ The privacy page
 * is not home: a bare home address may go on to the last project (early boot),
 * and a page to read must never be sent on.
 */
export function pageOf(loc) {
  const p = String((loc && loc.pathname) || '');
  if (EDIT_ANY.test(p)) return 'edit';
  if (SHARE_PATH.test(p) || SHARE_PAGE.test(p)) return 'share';
  return PRIVACY_ANY.test(p) ? 'privacy' : 'home';
}

/** The first `name=` in the query, when it is a project id. */
function projectParam(loc, name) {
  const pairs = String((loc && loc.search) || '').replace(/^\?/, '').split('&');
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq === -1 || pair.slice(0, eq) !== name) continue;
    let v = pair.slice(eq + 1);
    try { v = decodeURIComponent(v); } catch (_) { return null; }
    return PROJECT_ID.test(v) ? v : null;
  }
  return null;
}

/** The project an editor address names, or null (none, or not a project id). */
export function projectOf(loc) {
  return pageOf(loc) === 'edit' ? projectParam(loc, 'p') : null;
}

/** The first `name=` in the query, raw, or null. */
function param(loc, name) {
  for (const pair of String((loc && loc.search) || '').replace(/^\?/, '').split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1 || pair.slice(0, eq) !== name) continue;
    try { return decodeURIComponent(pair.slice(eq + 1)); } catch (_) { return null; }
  }
  return null;
}

/** The link a reading page's address names (`/s/ID`, `share.html?s=ID`), or null. */
export function shareOf(loc) {
  if (pageOf(loc) !== 'share') return null;
  const m = SHARE_PATH.exec(String(loc.pathname || ''));
  let id = m ? m[1] : param(loc, 's');
  if (m) {
    try { id = decodeURIComponent(id); } catch (_) { return null; }
  }
  return id && SHARE_ID.test(id) ? id : null;
}

/** The link home was asked to copy into this browser (`?copy=ID`, Open in BelJar), or null. */
export function copyOf(loc) {
  if (pageOf(loc) !== 'home') return null;
  const id = param(loc, 'copy');
  return id && SHARE_ID.test(id) ? id : null;
}

/** The project a home address is waiting to open (`?open=ID`), or null. */
export function pendingOf(loc) {
  return pageOf(loc) === 'home' ? projectParam(loc, 'open') : null;
}

/** Where problems with BelJar are reported. */
export const ISSUES_URL = 'https://github.com/dpbarry/bel-jar/issues';

/** Where a person writes to whoever runs BelJar: home's "Email me" (Dean, 2026-10-06). */
export const CONTACT_EMAIL = 'dean.barry@mail.mcgill.ca';
export const CONTACT_URL = 'mailto:' + CONTACT_EMAIL;

/** The issue tracker, in a tab of its own: the work in this one stays. */
export function reportIssue() {
  if (typeof g.open === 'function') g.open(ISSUES_URL, '_blank', 'noopener');
}

/** Go there, as a new history entry (`replace`: in place of this one). */
export function go(url, opts) {
  if (!g.location) return;
  if (opts && opts.replace) g.location.replace(url);
  else g.location.assign(url);
}

/**
 * Make the address say what the page is on, without navigating: the editor
 * that opened on a bare `/edit` names its project; home, done waiting for a
 * project, drops the `?open=`.
 */
export function settle(url) {
  const h = g.history;
  const l = g.location;
  if (!h || !l || typeof h.replaceState !== 'function') return false;
  h.replaceState(h.state, '', url + String(l.hash || ''));
  return true;
}

/** The editor's address names `pid` from now on (no navigation). */
export function nameProject(pid) {
  const l = g.location;
  if (!l || pageOf(l) !== 'edit' || projectOf(l) === pid) return false;
  return settle(editUrl(pid));
}

export const Routes = {
  PROJECT_ID, SHARE_ID, ISSUES_URL, CONTACT_URL, homeUrl, editUrl, privacyUrl, shareUrl, signInUrl, pageOf, projectOf, pendingOf, shareOf, copyOf,
  go, settle, nameProject, reportIssue,
};

g.Routes = Routes;
