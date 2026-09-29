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
import { createHttpTransport } from '../persist/sync/http-transport.mjs';

export { roundIsSafe } from '../persist/sync/runner.mjs';

const g = typeof window !== 'undefined' ? window : globalThis;

let user = null; // { id, handle, name, avatar } | null
let available = false; // the server answered

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
 * Who the server says is signed in: a user, null (nobody), or undefined (no
 * server here: the account stays out of sight). A 404 is a host without the
 * API and is final; a network failure or a server error may pass, so it is
 * asked once more before the page decides there is no server.
 */
async function fetchMe() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (res.status === 200 && /application\/json/.test(res.headers.get('content-type') || '')) {
        const body = await res.json();
        return body && 'user' in body ? body.user : undefined;
      }
      if (res.status < 500) return undefined;
    } catch (_) { /* the network: once more */ }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
  }
  return undefined;
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
  const img = document.createElement('img');
  img.className = cls;
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => {
    if (img.parentNode) img.replaceWith(initialNode(cls));
  }, { once: true });
  img.src = user.avatar;
  return img;
}

function render() {
  const btn = document.getElementById('btn-account');
  if (!btn) return;
  btn.hidden = !available;
  if (!available) return;
  btn.replaceChildren();
  btn.classList.toggle('is-signed-in', !!user);
  if (user) {
    btn.setAttribute('aria-label', 'Account: @' + user.handle);
    btn.setAttribute('data-tooltip', '@' + user.handle);
    btn.appendChild(avatarNode('account-avatar'));
  } else {
    btn.setAttribute('aria-label', 'Sign in');
    btn.setAttribute('data-tooltip', 'Sign in');
    btn.insertAdjacentHTML('beforeend',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>');
  }
}

/** The avatar's popover: who, then what you can do. State, then actions (docs/UI.md §1). */
function menuItems() {
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
  // The last round, run by whichever tab syncs, must say everything is in the
  // cloud: removing the projects is what signing out does.
  const check = await P.confirmSynced();
  if (!check.ok) {
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
  P.removeAccountProjects(user.id);
  P.setAccount(null);
  g.location.reload();
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

async function boot() {
  noteFailedSignIn();
  const me = await fetchMe();
  if (me === undefined) return; // no server here: BelJar stays as it was
  available = true;
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
  adoptOnWrite();
  P.startSync({ transport: createHttpTransport() });
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
