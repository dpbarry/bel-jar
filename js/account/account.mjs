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
 * Offline-first stays true: nothing on the page waits for this. Where the site
 * has no server (local development, the probes' static server), the account
 * button stays hidden and BelJar is exactly what it was.
 */
import { avatarImage } from './avatar.mjs';
import { createHttpTransport } from '../persist/sync/http-transport.mjs';

export { roundIsSafe } from '../persist/sync/runner.mjs';

const g = typeof window !== 'undefined' ? window : globalThis;

let user = null; // { id, handle, name, avatar } | null
let available = false; // the button shows: the server answered, or this host must have one
let unreachable = null; // why a deployed host's server could not be asked ('network', 'status-503', ...)
let adopting = false; // the write listener is on (once per page: Try again connects anew)

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
 * "Untitled Project" in the account per device. It joins at its first character.
 */
export function adoptable(projects, sizeOf) {
  return projects.filter((p) => p.owner === null && sizeOf(p.id) > 0).map((p) => p.id);
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
        return body && 'user' in body ? { user: body.user } : { error: 'not-json' };
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
    if (img.parentNode) img.replaceWith(initialNode(cls));
  }, { once: true });
  return img;
}

function render() {
  const btn = document.getElementById('btn-account');
  if (!btn) return;
  btn.hidden = !available;
  if (!available) return;
  btn.replaceChildren();
  btn.classList.toggle('is-signed-in', !!user);
  btn.classList.toggle('is-unreachable', !!unreachable);
  if (user) {
    btn.setAttribute('aria-label', 'Account: @' + user.handle);
    btn.setAttribute('data-tooltip', '@' + user.handle);
    btn.appendChild(avatarNode('account-avatar'));
  } else {
    const label = unreachable ? 'Can’t reach BelJar’s server' : 'Sign in';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('data-tooltip', label);
    btn.insertAdjacentHTML('beforeend',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>');
  }
}

/** The avatar's popover: who, then what you can do. State, then actions (docs/UI.md §1). */
function menuItems() {
  if (unreachable) {
    return [
      { type: 'status', title: 'Can’t reach BelJar’s server', detail: unreachableWords(unreachable), tone: 'warning' },
      { type: 'separator' },
      { label: 'Try again', onSelect: () => connect() },
    ];
  }
  if (!user) return [{ label: 'Sign in with GitHub', onSelect: signIn }];
  return [
    {
      type: 'status',
      title: user.name || '@' + user.handle,
      detail: user.name ? '@' + user.handle : null,
      media: avatarNode('account-avatar account-avatar--menu'),
    },
    { type: 'separator' },
    { label: 'Settings', onSelect: () => g.SettingsUI && g.SettingsUI.open('account') },
    { label: 'Sign out', onSelect: signOut },
  ];
}

// ── signing in: every project here joins the account ───────────────────────

function signIn() {
  saveNow();
  g.location.assign('/api/auth/github/start');
}

/** Every project in this browser with something in it and no account becomes the account's, and syncs. */
function adopt(projects) {
  const P = g.Persist;
  let n = 0;
  const sizeOf = (pid) => P.projectStats(pid).size;
  for (const pid of adoptable(projects || P.listProjects(), sizeOf)) if (P.claimProject(pid)) n += 1;
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
    const p = P.listProjects().find((x) => x.id === pid);
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
      message: 'Not everything is in the cloud yet.',
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
  // anything is removed: nothing can land on this browser afterwards.
  await P.stopSync();
  try {
    await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
  } catch (_) { /* the session ends here either way */ }
  // ⛔ The page is still live while the projects go, and reading the project
  // list creates one when none is visible (work.mjs `ensureProjects`), for
  // whoever is signed in. Removing while still signed in made an empty
  // project FOR THE ACCOUNT every time, and the next sign-in uploaded it.
  // So: adopt nothing from here on; removing, sign out first (anything read
  // into existence is this browser's own); keeping, keep first (the list is
  // never empty).
  const uid = user.id;
  user = null;
  if (keep) {
    P.keepAccountProjects(uid);
    P.setAccount(null);
  } else {
    P.setAccount(null);
    P.removeAccountProjects(uid);
  }
  g.location.reload();
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
    const target = resumeTarget(P.listProjects(), user.id, r.project);
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

async function boot() {
  noteFailedSignIn();
  await connect();
}

/** Ask who is signed in, and set the page up for the answer. Try again runs it anew. */
async function connect() {
  const answer = await askServer();
  const where = reach(answer, !!g.BELJAR_DEPLOYED);
  if (where === 'none') return; // no server here: BelJar stays as it was
  available = true;
  if (where === 'unreachable') {
    unreachable = answer.error || 'status-404';
    user = null;
    render();
    noteUnreachable(unreachable);
    return;
  }
  unreachable = null;
  const me = answer.user;
  user = me;
  const P = g.Persist;
  const step = accountStep(me, P.getAccount());
  if (step === 'first' || step === 'switched') {
    P.setAccount(me.id);
    // Another account's projects were on screen: start again as this one.
    if (step === 'switched') { g.location.reload(); return; }
  }
  render();
  g.dispatchEvent(new CustomEvent('beljar:account', { detail: { user: user ? Object.assign({}, user) : null } }));
  if (!me) return;
  adopt();
  if (!adopting) adoptOnWrite();
  adopting = true;
  P.startSync({ transport: createHttpTransport() });
  resumeAfterSignIn();
}

export const Account = {
  user: () => (user ? Object.assign({}, user) : null),
  available: () => available,
  menuItems,
  signIn,
  signOut,
  _boot: boot,
};

g.Account = Account;

if (typeof document !== 'undefined') {
  const go = () => {
    const idle = g.requestIdleCallback;
    if (typeof idle === 'function') idle(() => { boot(); }, { timeout: 2000 });
    else setTimeout(boot, 0);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
  else go();
}
