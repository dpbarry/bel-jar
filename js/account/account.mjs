/**
 * The account on this page (docs/PERSIST.md §5, docs/UI.md): who is signed in,
 * the header's avatar, and signing in and out.
 *
 * Signing in is the whole setup. Every project in this browser joins the account
 * and syncs, on every load while signed in, so "everything here syncs" always
 * holds; nobody is asked which projects, and nothing says it went well.
 * Signing out, once a last round has put everything in the cloud, removes the
 * account's projects from this browser; signing in again brings them back. The
 * only question it ever asks is when that cannot be confirmed.
 *
 * Offline-first stays true: nothing on the page waits for this. The header's
 * account button is always there, a placeholder picture until the server
 * answers, and its menu says where the account stands at that moment
 * (`accountState`, `accountMenu`): checking, no server here (local
 * development, the probes' static server), the server out of reach, signed
 * out, or signed in.
 *
 * A session can also end without this browser signing out: from another
 * device (Settings > Account, Sign out there), with the account (Delete
 * account), or by time. The browser follows when it next hears so
 * (`followEndedSession`).
 *
 * Both pages load this (js/frame/routes.mjs). ⛔ Home has no project of its own,
 * and asking Persist which project is open settles a page on one and makes one
 * when there is none: nothing here does on home. Signing in happens from the
 * account menu on either page, or from the palette.
 */
import { avatarImage, revealAvatar } from './avatar.mjs';
import { createHttpTransport } from '../persist/sync/http-transport.mjs';
import { Routes } from '../frame/routes.mjs';

export { roundIsSafe } from '../persist/sync/runner.mjs';

const g = typeof window !== 'undefined' ? window : globalThis;

let user = null; // { id, handle, name, avatar } | null
let available = false; // this host has a server: it answered, or a deployed host must have one
let unreachable = null; // why a deployed host's server could not be asked ('network', 'status-503', ...)
let asked = false; // the server has answered (or there is none to ask) since the last time it was asked
let adopting = false; // the write listener is on (once per page: Try again connects anew)
let placeholder = null; // the header's placeholder picture, as the page ships it

/**
 * Where the account stands, for the header's button and its menu. ⛔ The button
 * is always there (Dean, 2026-10-06): a placeholder picture until the server
 * answers, and a menu that says what is true at that moment.
 *   'checking'    the server has not answered yet
 *   'none'        this copy of BelJar has no server (a static server, local development)
 *   'unreachable' it has one, and it could not be reached
 *   'signed-out' | 'signed-in'
 */
export function accountState(o) {
  if (!o.asked) return 'checking';
  if (!o.available) return 'none';
  if (o.unreachable) return 'unreachable';
  return o.user ? 'signed-in' : 'signed-out';
}

/**
 * The account menu for a state: a status row, then what can be done from it,
 * each named by what it does (`act`), and nothing that is not about the
 * account. Pure (tests/test-account.mjs); `menuItems` gives each act its work.
 * @param {string} state  accountState()
 * @param {{ user?: object, reason?: string, reasonWords?: string, settings?: boolean }} o
 */
export function accountMenu(state, o = {}) {
  if (state === 'checking') return [{ type: 'status', title: 'Checking your account…' }];
  if (state === 'none') {
    return [{ type: 'status', title: 'No accounts here', detail: 'This copy of BelJar has no server, so your projects stay in this browser.' }];
  }
  if (state === 'unreachable') {
    return [
      { type: 'status', title: 'Can’t reach BelJar’s server', detail: o.reasonWords || null, tone: 'warning' },
      { type: 'separator' },
      { label: 'Try again', act: 'try-again' },
    ];
  }
  if (state === 'signed-out') {
    return [
      { type: 'status', title: 'Not signed in', detail: 'Sign in to keep your projects on every device.' },
      { type: 'separator' },
      { label: 'Sign in with GitHub', act: 'sign-in' },
    ];
  }
  const u = o.user || {};
  return [
    { type: 'status', title: u.name || '@' + u.handle, detail: u.name ? '@' + u.handle : null, media: 'avatar' },
    { type: 'separator' },
    // Only where there is a Settings dialog to open (home has none).
    ...(o.settings ? [{ label: 'Account settings', act: 'settings' }] : []),
    { label: 'Sign out', act: 'sign-out' },
  ];
}

/**
 * What to do with who the server says is signed in (`me`) and who this browser
 * last knew (`local`, the device's account): 'signed-out' | 'ended' (a session
 * that ended elsewhere) | 'same' | 'first' (a first sign-in here) | 'switched'.
 */
export function accountStep(me, local) {
  if (!me) return local ? 'ended' : 'signed-out';
  if (local === me.id) return 'same';
  return local ? 'switched' : 'first';
}

/**
 * The projects a signed-in page adopts: every one in this browser that belongs to
 * no account and has something written in it. An empty one waits: every browser
 * starts with an empty project, and adopting it would leave one more empty
 * "Untitled project" in the account per device. It joins at its first character.
 */
export function adoptable(projects, sizeOf) {
  return projects.filter((p) => p.owner === null && sizeOf(p.id) > 0).map((p) => p.id);
}

/**
 * What a browser does with the account's projects when its session ended
 * without it signing out (`reason`: 'elsewhere', 'deleted', or null for one
 * that ran out): 'release' (the account was deleted: they stay, as this
 * browser's own, since the cloud no longer has them), 'keep' (Projects in this
 * browser: Keep them), or 'leave' (they leave as a sign-out's would, but those
 * with work the cloud lacks stay, kept for the account).
 */
export function endedStep(reason, keepSetting) {
  if (reason === 'deleted') return 'release';
  return keepSetting === 'keep' ? 'keep' : 'leave';
}

/** What this browser says once it has followed a session that ended elsewhere. */
export function endedWords(reason, left) {
  if (reason === 'deleted') return 'Your account was deleted. Its projects stay in this browser.';
  const first = reason === 'elsewhere' ? 'This browser was signed out from another device.' : 'Your session in this browser ended.';
  return left ? first + ' Sign in to bring your projects back.' : first;
}

const HOUR = 60 * 60 * 1000;

/**
 * A session as Settings > Account lists it: { label, detail }. "Last used"
 * moves at most once an hour on the server (server/auth.mjs), so nothing
 * finer than that is said.
 */
export function sessionWords(s, now = Date.now()) {
  const label = s.device || 'A browser';
  if (s.current) return { label, detail: 'This browser' };
  const h = Math.floor((now - s.usedAt) / HOUR);
  if (h < 1) return { label, detail: 'Used in the last hour' };
  if (h < 24) return { label, detail: 'Last used ' + (h === 1 ? '1 hour' : h + ' hours') + ' ago' };
  const d = Math.floor(h / 24);
  if (d < 7) return { label, detail: 'Last used ' + (d === 1 ? 'yesterday' : d + ' days ago') };
  const then = new Date(s.usedAt);
  const opts = then.getFullYear() === new Date(now).getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return { label, detail: 'Last used ' + then.toLocaleDateString([], opts) };
}

/**
 * What a failed sign-in means, from where the server says it stopped (`why`) and, where
 * there is one, GitHub's own answer (`detail`): server/auth.mjs `failed()`. null for a
 * sign-in the person cancelled, which is not a failure. Every step the server can name
 * has its own sentence (tests/test-account.mjs holds that).
 */
export function signInFailure(why, detail) {
  switch (why) {
    case 'denied':
      return null;
    case 'config':
      return 'Sign-in isn’t set up on this server yet: it has no GitHub secret. Nothing is wrong with your account.';
    case 'state':
      if (detail === 'no-cookie') {
        return 'BelJar couldn’t match GitHub’s answer to this browser: the sign-in cookie was missing. It lasts 10 minutes and has to stay in the browser that started, so check that cookies are allowed for this site, then try again.';
      }
      if (detail === 'mismatch') return 'A newer sign-in started after this one, in another tab. Finish that one, or try again.';
      return 'GitHub’s answer came back incomplete. Try again.';
    case 'code':
      return 'GitHub sent you back without a sign-in code.';
    case 'exchange':
      if (detail === 'incorrect_client_credentials') {
        return 'GitHub rejected BelJar’s app credentials: the server’s GitHub secret is wrong. This is the server’s fault, not your account’s.';
      }
      if (detail === 'bad_verification_code') return 'GitHub’s one-time sign-in code had expired or was already used. Try again.';
      if (detail === 'redirect_uri_mismatch') return 'This site’s address doesn’t match the one BelJar’s GitHub app is registered with.';
      if (detail === 'status-429') return 'GitHub is turning away sign-ins from BelJar’s server for a while (too many requests). Wait a few minutes, then try again.';
      return 'GitHub didn’t hand over a sign-in token.';
    case 'profile':
      return 'GitHub signed you in, but BelJar couldn’t read your public profile.';
    case 'github':
      return 'BelJar’s server couldn’t reach GitHub. Try again in a minute.';
    default:
      return 'Sign-in stopped at a step this page doesn’t know.';
  }
}

/**
 * Who the server says is signed in: { user } (null: nobody), { none: true } (a
 * host without the API: a 404, final), or { error } when the asking failed:
 * 'network' (the request never came back: the network, or an extension that
 * stopped it), 'status-503', 'not-json'. A failure may pass, so it is asked
 * once more first.
 */
async function askServer() {
  let error = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (res.status === 404) return { none: true };
      if (res.status === 200 && /application\/json/.test(res.headers.get('content-type') || '')) {
        const body = await res.json();
        return body && 'user' in body ? { user: body.user, ended: body.ended || null } : { error: 'not-json' };
      }
      error = res.status === 200 ? 'not-json' : 'status-' + res.status;
    } catch (_) {
      error = 'network';
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
  }
  return { error };
}

/**
 * What an answer means on this host: 'signed' (the server answered), 'none' (no
 * server here: the account stays out of sight, as on a local static server), or
 * 'unreachable'. ⛔ A deployed host always has a server, so there nothing is
 * ever "none": a failure is shown and explained, never a button that vanishes.
 */
export function reach(answer, deployed) {
  if (answer && 'user' in answer) return 'signed';
  if (!deployed) return 'none';
  return 'unreachable';
}

/** Why the server could not be reached, in one sentence. */
export function unreachableWords(error) {
  if (error === 'network') return 'The request never came back: the network, or a browser extension, stopped it.';
  if (error === 'not-json') return 'The server answered with something other than an account.';
  if (/^status-4/.test(error || '')) return 'This address has no account service (' + error.slice(7) + ').';
  if (/^status-/.test(error || '')) return 'The server answered with an error (' + error.slice(7) + ').';
  return 'The server did not answer.';
}

function toast(kind, message) {
  const T = g.Toasts;
  if (T && typeof T[kind] === 'function') T[kind](message);
}

/** The sync transport: it tells this page when the server says nobody is signed in. */
function syncTransport() {
  return createHttpTransport({ onSignedOut: () => { recheck(); } });
}

function saveNow() {
  try {
    if (g.Commands && typeof g.Commands.run === 'function') g.Commands.run('file.save');
  } catch (_) { /* nothing open */ }
}

// ── the header's avatar ─────────────────────────────────────────────────────

function initialNode(cls) {
  const initial = document.createElement('span');
  initial.className = cls + ' account-initial';
  initial.textContent = (user && (user.name || user.handle) || '?').trim().charAt(0).toUpperCase();
  return initial;
}

/**
 * The picture, or the initial when there is none. ⛔ A picture that cannot load
 * (a blocker, a network, a deleted avatar) becomes the initial too: an <img>
 * that fails with an empty alt draws nothing, and the account button was an
 * invisible empty circle in a browser whose extension stopped GitHub's image.
 */
function avatarNode(cls) {
  if (!(user && user.avatar)) return initialNode(cls);
  // An identicon is inset on its own background, a photo fills the circle (avatar.mjs).
  const img = avatarImage(user.avatar, cls);
  img.addEventListener('error', () => {
    // A reveal still in flight owns the failure: the picture is not in the
    // button yet, and swapping here would race it.
    if (img.classList.contains('is-arriving')) return;
    if (img.parentNode) img.replaceWith(initialNode(cls));
  }, { once: true });
  return img;
}

function onEditor() {
  return Routes.pageOf(g.location) === 'edit';
}

const state = () => accountState({ asked, available, unreachable, user });

/** What the button is called in each state (its tooltip and its name). */
const BUTTON_WORDS = {
  checking: 'Account',
  none: 'Account',
  unreachable: 'Can’t reach BelJar’s server',
  'signed-out': 'Sign in',
};

function render() {
  const btn = document.getElementById('btn-account');
  if (!btn) return;
  // The page ships the placeholder in the button, so it is there from the first
  // paint: kept here, it stands in whenever there is no picture to show.
  if (!placeholder) {
    const shipped = btn.querySelector('.account-avatar--placeholder');
    if (shipped) placeholder = shipped.cloneNode(true);
  }
  const s = state();
  btn.hidden = false;
  btn.dataset.state = s;
  btn.classList.toggle('is-signed-in', s === 'signed-in');
  btn.classList.toggle('is-unreachable', s === 'unreachable');
  if (s === 'signed-in') {
    btn.setAttribute('aria-label', 'Account: @' + user.handle);
    btn.setAttribute('data-tooltip', '@' + user.handle);
    const face = avatarNode('account-avatar');
    // Over the placeholder the page shipped with. A later render leaves a
    // reveal already running alone; anything else replaces the face at once.
    if (!revealAvatar(btn, face, () => {
      btn.replaceChildren(initialNode('account-avatar'));
    })) btn.replaceChildren(face);
  } else {
    btn.setAttribute('aria-label', BUTTON_WORDS[s]);
    btn.setAttribute('data-tooltip', BUTTON_WORDS[s]);
    btn._avatarReveal = null;
    btn.replaceChildren(...(placeholder ? [placeholder.cloneNode(true)] : []));
  }
  // Open, its menu follows: opened while checking, it shows the answer when it comes.
  if (g.Menu && g.Menu.update && g.Menu.rootAnchor && g.Menu.rootAnchor() === btn) g.Menu.update(btn, menuItems());
}

/** The avatar's popover: where the account stands, then what you can do about it (docs/UI.md §1). */
function menuItems() {
  const acts = {
    'try-again': () => connect(),
    'sign-in': signIn,
    settings: () => g.SettingsUI.open('account'),
    'sign-out': signOut,
  };
  return accountMenu(state(), {
    user,
    reasonWords: unreachable ? unreachableWords(unreachable) : null,
    settings: !!g.SettingsUI,
  }).map((item) => {
    if (item.media === 'avatar') return Object.assign({}, item, { media: avatarNode('account-avatar account-avatar--menu') });
    if (item.act) return { label: item.label, onSelect: acts[item.act] };
    return item;
  });
}

/** Leave the editor for home, with what is typed saved first. */
function goHome() {
  saveNow();
  Routes.go(Routes.homeUrl());
}

// ── signing in: every project here joins the account ───────────────────────

function signIn() {
  saveNow();
  // Back to this page afterwards: from the editor, to the same project.
  Routes.go(Routes.signInUrl());
}

/** Every project in this browser with something in it and no account becomes the account's, and syncs. */
function adopt(projects) {
  const P = g.Persist;
  let n = 0;
  const sizeOf = (pid) => P.projectStats(pid).size;
  for (const pid of adoptable(projects || P.projects(), sizeOf)) if (P.claimProject(pid)) n += 1;
  if (n) {
    g.dispatchEvent(new CustomEvent('beljar:project-tree-changed', { detail: { kind: 'external' } }));
    P.syncNow();
  }
  return n;
}

// An empty project joins at its first character. This runs on every file write,
// so a project already known to be the account's is skipped before any read.
function adoptOnWrite() {
  const P = g.Persist;
  const owned = new Set();
  P.onFileChange(({ pid }) => {
    if (!user || !pid || owned.has(pid)) return;
    const p = P.projects().find((x) => x.id === pid);
    if (!p) return;
    if (p.owner !== null) { owned.add(pid); return; }
    adopt([p]);
  });
}

// ── signing out ─────────────────────────────────────────────────────────────

async function signOut() {
  if (!user) return;
  const P = g.Persist;
  saveNow();
  // "Your projects: Keep in this browser" (Settings > Account): nothing leaves,
  // so nothing can be lost and nothing is asked. One last round still brings
  // the cloud up to date where it can, but signing out does not wait on it.
  const keep = !!(g.Settings && g.Settings.get('signOutKeep') === 'keep');
  // Removing: the last round, run by whichever tab syncs, must say everything
  // is in the cloud first.
  const check = await P.confirmSynced(keep ? 5000 : undefined);
  if (!keep && !check.ok) {
    const choice = await g.PromptDialog.open({
      ariaLabel: 'Sign out',
      message: 'Not everything is in the cloud yet',
      note: check.reason === 'offline'
        ? 'You’re offline. Signing out removes your projects from this browser, with what hasn’t synced.'
        : 'Signing out removes your projects from this browser, with what hasn’t synced.',
      layout: 'row',
      buttons: [
        { action: 'out', label: 'Sign out anyway', variant: 'secondary' },
        { action: 'stay', label: 'Stay signed in', variant: 'primary' },
      ],
    });
    if (choice !== 'out') return;
  }
  // Sync stops, and a round in flight finishes, before the session ends and
  // anything is removed: nothing can land on this browser afterwards. It stops
  // holding the sync lock (it goes with the page): let go here, another tab
  // would take over syncing for a session that is about to end.
  await P.stopSync({ hold: true });
  try {
    await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
  } catch (_) { /* the session ends here either way */ }
  // ⛔ The page is still live until the browser has left it, and reading the
  // project list creates one when none is visible (work.mjs `ensureProjects`).
  // Removing while still signed in made an empty project FOR THE ACCOUNT
  // every time, and the next sign-in uploaded it; removing under a live editor
  // at all left a stray blank one for home to list. So: adopt nothing from
  // here on; keeping, keep first (the list is never empty); removing, sign out
  // and leave: the projects go as the next page loads (`Persist.leaveAccount`).
  const uid = user.id;
  user = null;
  if (keep) {
    P.keepAccountProjects(uid);
    P.setAccount(null);
  } else {
    P.setAccount(null);
    P.leaveAccount(uid);
  }
  // Home: what this browser still has, and the way back in.
  Routes.go(Routes.homeUrl(), { replace: true });
}

// ── a session that ended elsewhere ──────────────────────────────────────────

let following = null;

/**
 * This browser's session ended without it signing out: from another device
 * ('elsewhere'), with the account ('deleted'), or by time (null). The server
 * has signed it out already; the browser follows, once (`endedStep`).
 * ⛔ Deleted, the projects stay as this browser's own: the cloud no longer
 * has them, and removing them as a sign-out would lost the work. Otherwise
 * nothing the cloud lacks leaves with the session.
 */
function followEndedSession(uid, reason) {
  if (!following) following = followEnded(uid, reason).finally(() => { following = null; });
  return following;
}

async function followEnded(uid, reason) {
  const P = g.Persist;
  user = null;
  await P.stopSync();
  const step = endedStep(reason, g.Settings && g.Settings.get('signOutKeep'));
  if (step === 'leave') {
    // Work the cloud lacks stays; if that cannot be read, nothing leaves.
    const stay = await P.unsyncedProjects(uid).catch(() => null);
    if (stay) {
      P.setAccount(null);
      P.leaveAccount(uid, stay);
      P.noteSignedOut(reason === 'elsewhere' ? 'elsewhere' : 'ended');
      // The projects go as the next page loads (work.mjs `finishSignOut`).
      Routes.go(Routes.homeUrl(), { replace: true });
      return;
    }
  }
  if (step === 'release') P.releaseAccount(uid);
  else P.keepAccountProjects(uid);
  P.setAccount(null);
  render();
  announce();
  toast('info', endedWords(reason, false));
}

/** Said once by the page after one that followed an ended session home. */
function noteEndedSession() {
  const note = g.Persist.takeSignedOutNote();
  if (note) toast('info', endedWords(note === 'elsewhere' ? 'elsewhere' : null, true));
}

let rechecking = false;

/**
 * A sync call was answered 401: this browser's session may have ended
 * elsewhere. Ask who is signed in, and follow if nobody is.
 */
async function recheck() {
  if (rechecking || !user) return;
  rechecking = true;
  try {
    const answer = await askServer();
    const uid = g.Persist.getAccount();
    if (user && uid && answer && 'user' in answer && !answer.user) await followEndedSession(uid, answer.ended);
  } finally {
    rechecking = false;
  }
}

// ── where the account is signed in, and deleting it (Settings > Account) ─────

/** Where the account is signed in: [{ id, device, signedInAt, usedAt, current }], or null when that could not be asked. */
async function sessions() {
  if (!user) return [];
  try {
    const res = await fetch('/api/auth/sessions', { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (res.status === 401) {
      recheck();
      return null;
    }
    if (res.status !== 200) return null;
    const body = await res.json();
    return body && Array.isArray(body.sessions) ? body.sessions : null;
  } catch (_) {
    return null;
  }
}

/** Sign out there: ends another of the account's sessions. True when the server took it. */
async function signOutThere(id) {
  try {
    const res = await fetch('/api/auth/sessions/end', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }),
    });
    return res.status === 200;
  } catch (_) {
    return false;
  }
}

/**
 * Delete account: asked once, then everything the server keeps for the
 * account goes (server/deletion.mjs) and every device signed in to it is
 * signed out. Projects in this browser stay, as its own.
 */
async function deleteAccount() {
  if (!user) return;
  const who = user;
  const P = g.Persist;
  const yes = await g.ConfirmDialog.confirm({
    ariaLabel: 'Delete account',
    subject: '@' + who.handle,
    message: 'Delete your account?',
    note: 'Everything in the cloud is deleted: your projects, every version of them, and your settings. Every device is signed out. Projects in this browser stay here.',
    confirmLabel: 'Delete account',
  });
  if (!yes || user !== who) return;
  saveNow();
  const nav = g.navigator;
  if (nav && nav.onLine === false) {
    toast('error', 'You’re offline. Deleting your account needs BelJar’s server.');
    return;
  }
  // Sync stops, and a round in flight finishes, before the account goes:
  // nothing this browser sends lands after it.
  await P.stopSync({ hold: true });
  let deleted = false;
  try {
    const res = await fetch('/api/auth/delete', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    deleted = res.status === 200;
  } catch (_) { /* asked below */ }
  if (!deleted) {
    // What was lost may be only the answer: the server says whether it happened.
    const answer = await askServer();
    deleted = !!answer && 'user' in answer && !answer.user && answer.ended === 'deleted';
  }
  if (!deleted) {
    P.startSync({ transport: syncTransport() });
    toast('error', 'Couldn’t delete your account. Nothing was changed.');
    return;
  }
  user = null;
  P.releaseAccount(who.id);
  P.setAccount(null);
  Routes.go(Routes.homeUrl(), { replace: true });
}

// ── signing in again: back to the work ──────────────────────────────────────

/**
 * Where a page that has just signed in should be: the project the account had
 * open when it signed out here, else its newest. Null: stay. Only ever in
 * place of a blank placeholder (Persist.isBlankProject), which is all a
 * browser has once the account's projects left it.
 */
export function resumeTarget(projects, uid, remembered) {
  const mine = (projects || []).filter((p) => p.owner === uid);
  if (!mine.length) return null;
  const back = remembered && mine.find((p) => p.id === remembered);
  if (back) return back.id;
  // Made in the same millisecond: the later in the list (it sorts by time, then id).
  return mine.reduce((a, b) => (b.createdAt >= a.createdAt ? b : a)).id;
}

/**
 * Signed in and showing a blank placeholder: once the account's work is here
 * (the first round brings it), open it and drop the placeholder. Once per
 * sign-in (work.mjs `resumeFor`): a page where the person is already at work
 * stays, and so does one where a finished round brought nothing.
 */
function resumeAfterSignIn() {
  const P = g.Persist;
  // The editor only: home lists the account's projects as they arrive.
  if (!onEditor()) {
    if (user && P.resumeFor(user.id)) P.clearResume();
    return;
  }
  if (!user || !P.resumeFor(user.id)) return;
  let done = false;
  let off = null;
  const settle = () => {
    done = true;
    if (off) off();
  };
  const attempt = (s) => {
    if (done || !user) return;
    const r = P.resumeFor(user.id);
    if (!r) return settle();
    const active = P.getActiveProjectId();
    const ed = g.CurrentEditor;
    const typing = !!ed && typeof ed.getValue === 'function' && ed.getValue() !== '';
    if (!P.isBlankProject(active) || typing) {
      P.clearResume();
      return settle();
    }
    const target = resumeTarget(P.projects(), user.id, r.project);
    if (!target) {
      // Nothing of the account's here yet: wait for a round to finish.
      if (s && s.lastSync > 0 && s.state !== 'syncing') {
        P.clearResume();
        settle();
      }
      return undefined;
    }
    P.clearResume();
    settle();
    if (g.App && typeof g.App.resumeProject === 'function') g.App.resumeProject(target, active);
    return undefined;
  };
  off = P.onSyncSummary(attempt);
  attempt(P.syncSummary());
}

// ── boot ────────────────────────────────────────────────────────────────────

function noteFailedSignIn() {
  const search = g.location && g.location.search;
  if (!search) return; // an ordinary load: no query at all
  const params = new URLSearchParams(search);
  if (params.get('signin') !== 'failed') return;
  const why = params.get('why') || '';
  const detail = params.get('detail') || '';
  const explained = signInFailure(why, detail);
  if (!explained) {
    toast('info', 'Sign-in was cancelled.');
  } else {
    // The toast goes; the notification stays, with the reason, where it can be found again.
    toast('error', 'Couldn’t sign in with GitHub. The notifications say why.');
    const N = g.Notifications;
    if (N && typeof N.emit === 'function') {
      N.emit({
        kind: 'error',
        category: 'ops',
        origin: 'local',
        source: 'account.signin',
        title: 'Couldn’t sign in with GitHub',
        body: explained + ` (step: ${why}${detail ? ', ' + detail : ''})`,
      });
    }
  }
  params.delete('signin');
  params.delete('why');
  params.delete('detail');
  const rest = params.toString();
  g.history.replaceState(null, '', g.location.pathname + (rest ? '?' + rest : '') + g.location.hash);
}

// A deployed host whose server could not be asked: said once, with the reason,
// where it can be found again; the button stays, marked (docs/UI.md §3).
function noteUnreachable(error) {
  const N = g.Notifications;
  if (!N || typeof N.emit !== 'function') return;
  N.emit({
    kind: 'warn',
    category: 'ops',
    origin: 'local',
    source: 'account.reach',
    dedupeKey: 'account.reach',
    title: 'Can’t reach BelJar’s server',
    body: unreachableWords(error) + ' Sign-in and sync are off until it can. (' + error + ')',
  });
}

/**
 * Signed in or out in another tab. Signing out is for the browser, not for a
 * tab: an editor on one of the account's projects goes home with it (the
 * project is leaving this browser), and any other page asks again who is
 * signed in and becomes that, where it is.
 */
async function follow() {
  const P = g.Persist;
  if (onEditor() && P.ownerLeft()) {
    Routes.go(Routes.homeUrl(), { replace: true });
    return;
  }
  await P.stopSync();
  await connect();
}

async function boot() {
  noteFailedSignIn();
  noteEndedSession();
  g.Persist.onAccountElsewhere(() => { follow(); });
  await connect();
}

/**
 * A static server (Live Server, the probes) has no /api: sign-in and sync are
 * off, by design and silently. On this machine, say where they are, once, in
 * the console: the page itself says nothing.
 */
function noteNoServer() {
  const host = g.location && g.location.hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') return;
  console.info('BelJar: no server here (a static server has no /api), so sign-in and sync are off. For them locally: npm run dev, then http://127.0.0.1:8787');
}

/** The page now knows who is signed in, or that nobody can be: whoever waited on that goes on. */
function announce() {
  g.dispatchEvent(new CustomEvent('beljar:account', { detail: { user: user ? Object.assign({}, user) : null } }));
}

/** Ask who is signed in, and set the page up for the answer. Try again runs it anew. */
async function connect() {
  // Asked again (Try again): the button says it is checking until the answer comes.
  if (asked) {
    asked = false;
    render();
  }
  const answer = await askServer();
  const where = reach(answer, !!g.BELJAR_DEPLOYED);
  asked = true;
  if (where === 'none') { // no server here: BelJar is what it was, and the menu says why
    noteNoServer();
    render();
    announce();
    return;
  }
  available = true;
  if (where === 'unreachable') {
    unreachable = answer.error || 'status-404';
    user = null;
    render();
    noteUnreachable(unreachable);
    announce();
    return;
  }
  unreachable = null;
  const me = answer.user;
  user = me;
  const P = g.Persist;
  const step = accountStep(me, P.getAccount());
  if (step === 'ended') {
    await followEndedSession(P.getAccount(), answer.ended);
    return;
  }
  if (step === 'first' || step === 'switched') {
    P.setAccount(me.id);
    // Another account's projects were on screen: start again as this one.
    if (step === 'switched') { g.location.reload(); return; }
  }
  render();
  announce();
  if (!me) return;
  adopt();
  if (!adopting) adoptOnWrite();
  adopting = true;
  P.startSync({ transport: syncTransport() });
  resumeAfterSignIn();
}

export const Account = {
  user: () => (user ? Object.assign({}, user) : null),
  available: () => available,
  unreachable: () => unreachable,
  menuItems,
  signIn,
  signOut,
  goHome,
  sessions,
  sessionWords,
  signOutThere,
  deleteAccount,
  _boot: boot,
};

g.Account = Account;

if (typeof document !== 'undefined') {
  const go = () => {
    // A home that is only passing through to the last project asks nothing.
    if (g.BELJAR_LEAVING) return;
    const idle = g.requestIdleCallback;
    if (typeof idle === 'function') idle(() => { boot(); }, { timeout: 2000 });
    else setTimeout(boot, 0);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
  else go();
}
