/**
 * The account on this page (plan Phase 02, docs/PERSIST.md §5): who is signed
 * in, the header's account button, the claim flow after a first sign-in on a
 * device, and signing out.
 *
 * Offline-first stays true: nothing on the page waits for this. Where the site
 * has no server (local development, the probes' static server), the account
 * button stays hidden and BelJar is exactly what it was.
 *
 * ⛔ The claim flow never merges or discards on its own: each of this device's
 * projects is offered, with its size and when it was last edited, and "Keep on
 * this device only" is always there. It is asked once per account per device;
 * a project kept here can still be added from the Project menu.
 * ⛔ Signing out with "remove them" removes nothing until a sync has confirmed
 * that every project of the account is on the server.
 */
import { createHttpTransport } from '../persist/sync/http-transport.mjs';

const g = typeof window !== 'undefined' ? window : globalThis;

// What a finished sync round may say of a project for its work to be safe on the server.
const SAFE = new Set(['clean', 'pushed', 'downloaded', 'forgot', 'deleted', 'absent', 'restored']);

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

/** The projects to offer after a first sign-in: this device's own, with some work in them. */
export function claimCandidates(projects, statsOf) {
  return projects
    .filter((p) => p.owner === null)
    .map((p) => Object.assign({ id: p.id, name: p.name }, statsOf(p.id)))
    .filter((p) => p.size > 0);
}

/** A round's result says every project's work is on the server. */
export function roundIsSafe(result) {
  return !!result && !!result.projects && Object.values(result.projects).every((r) => SAFE.has(r.status));
}

function sizeLabel(chars) {
  if (chars < 1024) return chars + ' characters';
  return (chars / 1024).toFixed(chars < 10240 ? 1 : 0) + ' KB';
}

function whenLabel(ms, now) {
  if (!ms) return 'never edited';
  const days = Math.floor((now - ms) / 86400000);
  if (days <= 0) return 'edited today';
  if (days === 1) return 'edited yesterday';
  if (days < 30) return 'edited ' + days + ' days ago';
  return 'edited ' + new Date(ms).toLocaleDateString();
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

/** One line under a project's name: "3 files · 4.2 KB · edited today". */
export function projectLine(p, now = Date.now()) {
  return [p.files === 1 ? '1 file' : p.files + ' files', sizeLabel(p.size), whenLabel(p.editedAt, now)].join(' · ');
}

async function fetchMe() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (res.status !== 200 || !/application\/json/.test(res.headers.get('content-type') || '')) return undefined;
    const body = await res.json();
    return body && 'user' in body ? body.user : undefined;
  } catch (_) {
    return undefined;
  }
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

// ── the header's account button ─────────────────────────────────────────────

function render() {
  const btn = document.getElementById('btn-account');
  if (!btn) return;
  btn.hidden = !available;
  if (!available) return;
  btn.replaceChildren();
  const label = user ? 'Account: @' + user.handle : 'Sign in';
  btn.setAttribute('aria-label', label);
  btn.setAttribute('data-tooltip', user ? '@' + user.handle : 'Sign in');
  btn.classList.toggle('is-signed-in', !!user);
  if (user && user.avatar) {
    const img = document.createElement('img');
    img.className = 'account-avatar';
    img.alt = '';
    img.src = user.avatar;
    img.referrerPolicy = 'no-referrer';
    btn.appendChild(img);
  } else if (user) {
    const initial = document.createElement('span');
    initial.className = 'account-initial';
    initial.textContent = (user.name || user.handle || '?').trim().charAt(0).toUpperCase();
    btn.appendChild(initial);
  } else {
    btn.insertAdjacentHTML('beforeend',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>');
  }
}

function menuItems() {
  if (!user) {
    return [
      { type: 'section', label: 'Sync your projects between devices' },
      { label: 'Sign in with GitHub', onSelect: signIn },
    ];
  }
  return [
    { type: 'section', label: 'Signed in as @' + user.handle },
    { label: 'Sign out…', onSelect: signOutInteractive },
  ];
}

// ── signing in, and the claim flow ──────────────────────────────────────────

function signIn() {
  saveNow();
  g.location.assign('/api/auth/github/start');
}

async function askToClaim() {
  const P = g.Persist;
  const candidates = claimCandidates(P.listProjects(), P.projectStats);
  if (!candidates.length) {
    g.Device.set('claimAskedFor', user.id);
    return;
  }
  const D = g.PromptDialog;
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const body = el('div', 'account-claim');
  body.appendChild(el('p', 'jar-prompt-dialog__message', 'Add this browser’s projects to your account?'));
  body.appendChild(el('p', 'jar-prompt-dialog__note', 'Projects you add sync to your other devices. The rest stay in this browser only.'));
  const list = el('ul', 'account-claim__list');
  const now = Date.now();
  for (const p of candidates) {
    const row = el('li', 'account-claim__row');
    const label = el('label', 'account-claim__label');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = true;
    box.value = p.id;
    label.appendChild(box);
    const text = el('span', 'account-claim__text');
    text.appendChild(el('span', 'account-claim__name', p.name));
    text.appendChild(el('span', 'account-claim__meta', projectLine(p, now)));
    label.appendChild(text);
    row.appendChild(label);
    list.appendChild(row);
  }
  body.appendChild(list);
  body.appendChild(D.buildActions([
    { action: 'keep', label: 'Keep on this device only', variant: 'secondary' },
    { action: 'add', label: 'Add to my account', variant: 'primary' },
  ], 'row'));
  const choice = await D.open({ ariaLabel: 'Add projects to your account', body });
  if (choice !== 'add' && choice !== 'keep') return; // dismissed: asked again next time
  g.Device.set('claimAskedFor', user.id);
  if (choice === 'keep') return;
  const picked = [...list.querySelectorAll('input:checked')].map((b) => b.value);
  let added = 0;
  for (const pid of picked) if (P.claimProject(pid)) added += 1;
  if (added) {
    P.syncNow();
    g.dispatchEvent(new CustomEvent('beljar:project-tree-changed', { detail: { kind: 'external' } }));
    toast('success', added === 1 ? 'Added 1 project to your account.' : 'Added ' + added + ' projects to your account.');
  }
}

/** Add this page's project to the account (the Project menu, after "Keep on this device only"). */
function claimActiveProject() {
  const P = g.Persist;
  if (!user || !P.claimProject(P.getActiveProjectId())) return false;
  P.syncNow();
  toast('success', 'Added this project to your account.');
  return true;
}

// ── signing out ─────────────────────────────────────────────────────────────

async function signOutInteractive() {
  if (!user) return;
  const choice = await g.PromptDialog.open({
    ariaLabel: 'Sign out',
    message: 'Sign out of BelJar in this browser?',
    note: 'Your projects stay in your account. On a shared computer, remove them from this browser too.',
    layout: 'row',
    buttons: [
      { action: 'keep', label: 'Sign out', variant: 'secondary' },
      { action: 'remove', label: 'Sign out and remove them', variant: 'primary' },
    ],
  });
  if (choice !== 'keep' && choice !== 'remove') return;
  const P = g.Persist;
  saveNow();
  if (choice === 'remove' && !roundIsSafe(await P.syncNow())) {
    toast('error', 'Couldn’t confirm your projects are in your account, so nothing was removed. You’re still signed in.');
    return;
  }
  // Sync stops, and a round in flight finishes, before the session ends and
  // anything is removed: nothing can land on this browser afterwards.
  await P.stopSync();
  try {
    await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
  } catch (_) { /* the session ends here either way */ }
  if (choice === 'remove') P.removeAccountProjects(user.id);
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
  if (!me) return;
  P.startSync({ transport: createHttpTransport() });
  if (g.Device.get('claimAskedFor') !== me.id) askToClaim();
}

export const Account = {
  user: () => (user ? Object.assign({}, user) : null),
  available: () => available,
  menuItems,
  signIn,
  signOut: signOutInteractive,
  claimActiveProject,
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
