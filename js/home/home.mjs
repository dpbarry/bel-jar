/**
 * Home (index.html): your projects and the account, and nothing of the editor.
 *
 * One column (docs/UI.md §0): the name, the three ways to start, then the
 * projects, the last one opened first: it has the focus, so Enter resumes it.
 *
 * A row is a link to the editor on that project (js/frame/routes.mjs). It says
 * the project's name and when it was last touched, and nothing more unless
 * something needs you: files changed in two places. How
 * sync is doing is the cloud in the header, for every project at once
 * (docs/UI.md §2: one indicator per fact).
 *
 * ⛔ Home has no project of its own. It lists what the browser holds
 * (`Persist.projects`), which may be nothing: it never asks Persist which
 * project is open, because that settles the page on one and makes one when
 * there is none. Making a project is something a person does, with New project
 * or Import folder, and then the page leaves for it.
 *
 * The list follows storage (another tab, another device through sync), so it
 * is true without a reload; sync runs here as it does in the editor.
 */
import { Routes, ISSUES_URL } from '../frame/routes.mjs';
import { wireMenuTrigger } from '../ui/menu-trigger.mjs';
import { folderAsProject, createImportedProject } from '../workspace/import-project.mjs';
import { attachHomeCommands } from './home-commands.mjs';
import { preloadEditorWhenIdle } from './preload-editor.mjs';

const g = typeof window !== 'undefined' ? window : globalThis;

/** How long home waits for a project its address asked for (`?open=`). */
export const OPEN_WAIT_MS = 8000;

// ── what a row says (pure: tests/test-home.mjs) ─────────────────────────────

/** The last one opened first, then the most recently touched. */
export function orderProjects(projects, last, statsOf) {
  const at = new Map(projects.map((p) => [p.id, statsOf(p.id).editedAt || 0]));
  return projects.slice().sort((a, b) => {
    if ((a.id === last) !== (b.id === last)) return a.id === last ? -1 : 1;
    return (at.get(b.id) - at.get(a.id)) || String(a.name).localeCompare(String(b.name)) || (a.id < b.id ? -1 : 1);
  });
}

export function reviewWord(n) {
  return n === 1 ? '1 file to review' : n + ' files to review';
}

/** When a project was last touched, as a person would say it. '' when it never was. */
export function whenEdited(ms, now = Date.now()) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'Just now';
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? '1 minute ago' : m + ' minutes ago';
  const then = new Date(ms);
  const today = new Date(now);
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = Math.ceil((midnight - ms) / 86400000);
  if (days <= 0) {
    const h = Math.round(m / 60);
    return h === 1 ? '1 hour ago' : h + ' hours ago';
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return days + ' days ago';
  const opts = then.getFullYear() === today.getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return then.toLocaleDateString([], opts);
}

/**
 * What the page is: 'arriving' (an empty list that may be about to fill: the
 * keyboard waits for it), 'first' (no project in this browser: the ways to
 * start are all there is), or 'returning' (they, and the projects).
 */
export function homeMode(o) {
  if (o.count > 0) return 'returning';
  return o.arriving ? 'arriving' : 'first';
}

/** A key that starts a search when pressed on a row: a letter or a digit, typed plainly. */
export function findsByTyping(key) {
  return typeof key === 'string' && /^[\p{L}\p{N}]$/u.test(key);
}

/**
 * Which way a key moves through the list: 1, -1, or 0. The arrows always; j and
 * k in Vim; Ctrl+P and Ctrl+N in Emacs (and Ctrl+M, which stands in for the
 * Ctrl+N a browser keeps for itself: docs/COMMANDS.md).
 */
export function listMove(e, style) {
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
  if (plain && e.key === 'ArrowDown') return 1;
  if (plain && e.key === 'ArrowUp') return -1;
  if (style === 'vim' && plain && !e.shiftKey) {
    if (e.key === 'j') return 1;
    if (e.key === 'k') return -1;
  }
  if (style === 'emacs' && e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === 'n' || e.key === 'm') return 1;
    if (e.key === 'p') return -1;
  }
  return 0;
}

/**
 * What to do about the project the address asked for (`?open=`): 'open' it,
 * 'wait' for the round that may bring it, or give 'up' (it is not coming:
 * nobody is signed in, a round has finished without it, or time is out).
 */
export function pendingStep(o) {
  if (o.here) return 'open';
  if (o.timedOut || o.accountKnown && !o.signedIn) return 'up';
  if (o.signedIn && o.roundDone) return 'up';
  return 'wait';
}

/**
 * An empty list that may be about to fill: the page does not know yet who is
 * signed in (it asks as it comes up), or someone is and their first round is
 * not back. The first screen ("nothing here: start a project") would be a
 * guess, and the way on from it (Browse examples) would make a project a
 * moment before the real ones arrive. Nothing is shown until it is known; and
 * it is shown after all when nothing is coming (nobody signed in, offline, an
 * error) or time is out.
 */
export function listArriving(o) {
  if (o.count > 0 || o.timedOut) return false;
  if (!o.accountKnown) return true;
  if (!o.signedIn) return false;
  return o.state === 'syncing' && !(o.lastSync > 0);
}

/** How long an empty home waits to learn who is signed in before it says it is empty. */
export const ACCOUNT_WAIT_MS = 2500;

// ── the page ────────────────────────────────────────────────────────────────

let drawn = null; // what the list last drew, as a string: see render()
let renderQueued = false;
let pending = null; // { pid, since, gaveUp, asked, roundDone }
let accountKnown = false;
let folderInput = null;
let mountedAt = 0;
let unfocused = false; // nothing could take the focus when the page came up: the first thing drawn does

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function toast(message, kind) {
  const T = g.Toasts;
  if (!T) return;
  if (kind === 'warn' && typeof T.warn === 'function') T.warn(message);
  else if (typeof T.show === 'function') T.show(message);
}

function conflictsByProject() {
  const out = new Map();
  for (const c of g.Persist.listConflicts()) out.set(c.pid, (out.get(c.pid) || 0) + 1);
  return out;
}

// ── actions ─────────────────────────────────────────────────────────────────

async function newProject() {
  const P = g.Persist;
  const NP = g.NamePrompt;
  const name = await NP.open({
    ariaLabel: 'New project',
    message: 'New project',
    value: P.DEFAULT_PROJECT_NAME,
    selection: { start: 0, end: P.DEFAULT_PROJECT_NAME.length },
    normalize: NP.defaultNormalize,
    validate: (n) => (n ? null : 'Name is required.'),
    confirmLabel: 'Create',
  });
  if (name === null) return;
  const pid = P.createProject(String(name).trim() || P.DEFAULT_PROJECT_NAME);
  if (!pid) {
    toast('Couldn’t create the project: storage is full.', 'warn');
    return;
  }
  Routes.go(Routes.editUrl(pid));
}

function pickFolder() {
  if (!folderInput) {
    folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.webkitdirectory = true;
    folderInput.style.display = 'none';
    document.body.appendChild(folderInput);
    folderInput.addEventListener('change', async () => {
      const all = Array.from(folderInput.files || []);
      folderInput.value = '';
      if (!all.length) return;
      const plan = await folderAsProject(all);
      if (!plan) {
        toast('No .bel files in that folder.', 'warn');
        return;
      }
      const pid = createImportedProject(plan);
      if (!pid) {
        toast('Couldn’t import the folder: storage is full.', 'warn');
        return;
      }
      Routes.go(Routes.editUrl(pid));
    });
  }
  folderInput.click();
}

async function renameProject(p) {
  const NP = g.NamePrompt;
  const next = await NP.open({
    ariaLabel: 'Rename project',
    message: 'Rename project',
    value: p.name,
    normalize: NP.defaultNormalize,
    validate: (n) => (n ? null : 'Name is required.'),
    confirmLabel: 'Save',
  });
  if (next !== null && next !== p.name) {
    g.Persist.renameProject(p.id, next);
    render();
  }
  afterDialog(() => focusRow(p.id));
}

function downloadProject(p) {
  const src = g.Persist.projectFiles(p.id);
  if (!src || !g.DownloadZip) return;
  const archive = g.DownloadZip.projectArchive(src.name, src.files, src.folders);
  g.DownloadZip.downloadZip(archive.entries, archive.fileName);
}

async function deleteProject(p) {
  const yes = await g.ConfirmDialog.confirm({
    subject: p.name,
    message: 'Delete this project and all of its files?',
    ariaLabel: 'Delete project',
  });
  if (!yes) {
    afterDialog(() => focusRow(p.id));
    return;
  }
  const at = rowLinks().findIndex((a) => a.closest('.home-row').dataset.pid === p.id);
  g.Persist.removeProject(p.id);
  render();
  // The row that took its place, so the keyboard is still somewhere.
  afterDialog(() => {
    const left = rowLinks();
    if (left.length) left[Math.min(Math.max(at, 0), left.length - 1)].focus();
    else focusFirstAction();
  });
}

function rowMenu(p) {
  return [
    { label: 'Open', onSelect: () => Routes.go(Routes.editUrl(p.id)) },
    { label: 'Rename…', onSelect: () => renameProject(p) },
    { label: 'Download', onSelect: () => downloadProject(p) },
    { type: 'separator' },
    { label: 'Delete…', onSelect: () => deleteProject(p) },
  ];
}

// ── drawing ─────────────────────────────────────────────────────────────────

const ICONS = {
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.4a1.5 1.5 0 0 1 1.1.5L11.5 8h8A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z"/><path d="M12 11.25v4.5"/><path d="m10 13.9 2 1.95 2-1.95"/></svg>',
  // The editor's own Library glyph (edit.html #btn-library): the same place, from here.
  library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M3.5 8v12.25a1.75 1.75 0 0 0 1.75 1.75h14a1.75 1.75 0 0 0 1.75-1.75V8"/><path d="m8.65 12.6-2.2 2.1 2.2 2.1"/><path d="m15.35 12.6 2.2 2.1-2.2 2.1"/><path d="m12.85 11.6-1.7 6"/></svg>',
};

/** What a person can start with: the three tiles, in this order. */
const START = [
  { id: 'new', label: 'New project', icon: 'plus', run: () => newProject() },
  { id: 'import', label: 'Import folder', icon: 'folder', run: () => pickFolder() },
  { id: 'examples', label: 'Browse examples', icon: 'library', run: () => Routes.go(Routes.editUrl() + '#library') },
];

/** Where to read more, and where to say something is wrong. */
// Another site opens in a tab of its own; BelJar's own page (`here`) in this one.
const LINKS = [
  { label: 'Beluga', href: 'https://www.cs.mcgill.ca/~complogic/beluga/' },
  { label: 'Report an issue', href: ISSUES_URL },
  { label: 'GitHub', href: 'https://github.com/dpbarry/bel-jar' },
  { label: 'Privacy', href: Routes.privacyUrl(), here: true },
];

function rowLinks() {
  return Array.from(document.querySelectorAll('#home .home-row__open'));
}

function focusRow(pid) {
  const row = document.querySelector('#home .home-row[data-pid="' + pid + '"] .home-row__open');
  if (row) row.focus();
}

/**
 * Once the dialog has gone. A dialog closing hands the focus back to whatever
 * opened it, and by then the list may have been drawn again: the row that
 * opened it is no longer on the page, and the focus would fall to nothing.
 */
function afterDialog(fn) {
  let tries = 0;
  const look = () => {
    if (document.querySelector('dialog[open]') && tries++ < 40) setTimeout(look, 25);
    else fn();
  };
  setTimeout(look, 0);
}

function focusFirstAction() {
  const btn = document.querySelector('#home-actions .home-tile');
  if (btn) btn.focus();
}

/**
 * A project, as home shows it: its name and when it was last touched, a
 * marker only when files wait to be reviewed, and its menu (Open, Rename,
 * Download, Delete), which takes the date's place when the row is pointed at.
 */
function rowNode(p, stats, review) {
  const li = el('li', 'home-row');
  li.dataset.pid = p.id;
  const a = el('a', 'home-row__open');
  a.href = Routes.editUrl(p.id);
  a.appendChild(el('span', 'home-row__name', p.name));
  if (review) a.appendChild(el('span', 'home-row__mark', reviewWord(review)));
  a.appendChild(el('span', 'home-row__when', whenEdited(stats.editedAt)));
  li.appendChild(a);
  const more = el('button', 'icon-btn home-row__more');
  more.type = 'button';
  more.innerHTML = ICONS.more;
  more.setAttribute('aria-label', 'More for ' + p.name);
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-expanded', 'false');
  wireMenuTrigger(more, { side: 'bottom', align: 'end', items: () => rowMenu(p) });
  li.appendChild(more);
  return li;
}

/** The ways to start, as tiles: a glyph above the words. */
function startNodes() {
  return START.map((s) => {
    const btn = el('button', 'home-tile');
    btn.type = 'button';
    btn.dataset.action = s.id;
    const glyph = el('span', 'home-tile__icon');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.innerHTML = ICONS[s.icon];
    btn.append(glyph, el('span', 'home-tile__label', s.label));
    btn.addEventListener('click', s.run);
    return btn;
  });
}

function linkNodes() {
  return LINKS.map((l) => {
    const a = el('a', 'home-link', l.label);
    a.href = l.href;
    if (l.here) return a;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  });
}

/** The line under the name that offers to sign in, drawn into `box`. */
function signInLine(box, onSignIn) {
  const btn = el('button', 'home-link-btn', 'Sign in with GitHub');
  btn.type = 'button';
  btn.addEventListener('click', onSignIn);
  // What signing in keeps, beside the way to it (privacy.html).
  const more = el('a', 'home-head__more', 'What BelJar keeps');
  more.href = Routes.privacyUrl();
  box.append(btn, document.createTextNode(' to keep your projects on every device. '), more);
}

/** What Search says: the word, and the chord that does the same (where one is bound). */
function findNodes(chord) {
  const nodes = [el('span', null, 'Search')];
  if (chord) nodes.push(el('kbd', 'home-kbd', chord));
  return nodes;
}

/** The fixed parts: the mark beside the name, the ways to start, where to read more. Once. */
function drawFixed() {
  const mark = document.getElementById('home-mark');
  const logo = document.querySelector('header .header-logo');
  if (mark && logo && !mark.querySelector('svg')) mark.prepend(logo.cloneNode(true));
  const actions = document.getElementById('home-actions');
  if (actions && !actions.childElementCount) actions.append(...startNodes());
  const links = document.getElementById('home-links');
  if (links && !links.childElementCount) links.append(...linkNodes());
}

/**
 * Search, beside the list's heading: it opens the palette, which is the one
 * thing that searches. ⛔ Its chord is the one that works now, asked for at
 * every drawing: the editing style may have changed in another tab (Emacs gives
 * Ctrl+K to kill-line, and opens the palette with Ctrl+X Ctrl+F).
 */
function drawFind() {
  const btn = document.getElementById('home-find');
  if (!btn) return;
  btn.hidden = !g.CommandPalette;
  if (btn.hidden) return;
  const C = g.Commands;
  const chord = (C && typeof C.liveChord === 'function' && C.liveChord('nav.anywhere')) || '';
  if (btn.childElementCount && btn.dataset.chord === chord) return;
  btn.dataset.chord = chord;
  btn.replaceChildren(...findNodes(chord));
}

function drawSignIn() {
  const A = g.Account;
  const offer = !!A && A.available() && !A.user() && !A.unreachable();
  const box = document.getElementById('home-signin');
  if (!box) return;
  box.hidden = !offer;
  if (offer && !box.childElementCount) signInLine(box, () => A.signIn());
}

function drawRisk() {
  const note = document.getElementById('home-risk');
  if (!note) return;
  const P = g.Persist;
  const atRisk = !!(P.durabilityStatus && P.durabilityStatus().atRisk);
  note.hidden = !atRisk;
  if (atRisk) {
    const A = g.Account;
    note.textContent = A && A.available() && !A.user()
      ? 'Safari deletes this site’s data after 7 days without a visit. Sign in, or download your projects, to keep them.'
      : 'Safari deletes this site’s data after 7 days without a visit. Download your projects to keep a copy.';
  }
}

function render() {
  const P = g.Persist;
  const main = document.getElementById('home');
  const list = document.getElementById('home-list');
  if (!P || !main || !list) return;
  // What is being worked with keeps its place: a menu's anchor, the focused row.
  const active = document.activeElement;
  const focused = active && active.closest ? active.closest('.home-row') : null;
  const focusedPid = focused ? focused.dataset.pid : null;
  const onMore = !!(focused && active.classList.contains('home-row__more'));

  const projects = P.projects();
  const review = conflictsByProject();
  const stats = new Map(projects.map((p) => [p.id, P.projectStats(p.id)]));
  const ordered = orderProjects(projects, P.lastProjectId(), (id) => stats.get(id));

  const sync = P.syncSummary();
  const mode = homeMode({
    count: projects.length,
    arriving: listArriving({
      count: projects.length,
      accountKnown,
      signedIn: !!(g.Account && g.Account.user()),
      state: sync.state,
      lastSync: sync.lastSync,
      timedOut: Date.now() - mountedAt >= (accountKnown ? OPEN_WAIT_MS : ACCOUNT_WAIT_MS),
    }),
  });

  // ⛔ Drawn again only when what it says has changed. Storage moves often (a
  // sync round, a save in another tab), and replacing a row that has not
  // changed takes the focus off it: Enter then opens nothing.
  const says = JSON.stringify([mode, ordered.map((p) => [p.id, p.name, whenEdited(stats.get(p.id).editedAt), review.get(p.id) || 0])]);
  if (says !== drawn) {
    drawn = says;
    main.dataset.mode = mode;
    list.replaceChildren(...ordered.map((p) => rowNode(p, stats.get(p.id), review.get(p.id) || 0)));
    const section = document.getElementById('home-projects-section');
    if (section) section.hidden = !ordered.length;
  }
  drawFixed();
  drawFind();
  drawSignIn();
  drawRisk();

  if (focusedPid) {
    const again = main.querySelector('.home-row[data-pid="' + focusedPid + '"] ' + (onMore ? '.home-row__more' : '.home-row__open'));
    if (again) again.focus();
  } else if (unfocused && mode !== 'arriving' && !pending && (!document.activeElement || document.activeElement === document.body)) {
    unfocused = false;
    focusStart();
  }
  settlePending();
}

/**
 * Storage moves in bursts (a sync round, a save in another tab): one drawing
 * for each burst. A timer, not an animation frame: a tab in the background
 * gets no frames, and its list should be true the moment it is looked at.
 */
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    // Not under an open menu or dialog: its anchor would be swapped out from under it.
    if ((g.Menu && g.Menu.isOpen()) || document.querySelector('dialog[open]')) {
      setTimeout(queueRender, 300);
      return;
    }
    render();
  }, 30);
}

// ── a project the address asked for (`?open=ID`) ────────────────────────────
// The editor sends a page here when its address names a project this browser
// cannot show. Signed in, the first round may bring it (made on another device
// a moment ago): then home goes on to it. Otherwise the list is the answer.

function settlePending() {
  if (!pending || pending.gaveUp) return;
  const P = g.Persist;
  const A = g.Account;
  const signedIn = !!(A && A.user());
  // ⛔ A round asked for NOW, in whichever tab syncs, and waited for: "a round
  // has finished" read off the summary is true at once in a tab that does not
  // sync itself (it shows the syncing tab's last round, from before the
  // project was made), and home gave up on a project that was a round away.
  if (signedIn && !pending.asked) {
    pending.asked = true;
    const waiting = pending;
    P.confirmSynced(OPEN_WAIT_MS).then((res) => {
      if (res && res.reason === 'not-syncing') return; // sync had not started: the time limit decides
      waiting.roundDone = true;
      queueRender();
    });
  }
  const step = pendingStep({
    here: P.projects().some((p) => p.id === pending.pid),
    accountKnown,
    signedIn,
    roundDone: !!pending.roundDone,
    timedOut: Date.now() - pending.since >= OPEN_WAIT_MS,
  });
  const note = document.getElementById('home-waiting');
  if (step === 'open') {
    Routes.go(Routes.editUrl(pending.pid), { replace: true });
    pending.gaveUp = true;
    return;
  }
  if (step === 'wait') {
    if (note) { note.hidden = false; note.textContent = 'Opening your project…'; }
    return;
  }
  pending.gaveUp = true;
  Routes.settle(Routes.homeUrl());
  if (note) { note.hidden = false; note.textContent = 'That project isn’t in this browser.'; }
}

// ── keys ────────────────────────────────────────────────────────────────────

function keymapStyle() {
  return g.Settings ? g.Settings.get('keymapStyle') : 'default';
}

function onListKey(e) {
  const link = e.target && e.target.closest ? e.target.closest('.home-row__open') : null;
  if (!link) return;
  const links = rowLinks();
  const at = links.indexOf(link);
  const row = link.closest('.home-row');
  const p = g.Persist.projects().find((x) => x.id === row.dataset.pid);
  const move = listMove(e, keymapStyle());
  if (move) {
    e.preventDefault();
    const next = links[Math.min(Math.max(at + move, 0), links.length - 1)];
    if (next) next.focus();
    return;
  }
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
  if (plain && e.key === 'Home') { e.preventDefault(); links[0].focus(); return; }
  if (plain && e.key === 'End') { e.preventDefault(); links[links.length - 1].focus(); return; }
  if (!p) return;
  if (plain && e.key === 'F2') { e.preventDefault(); renameProject(p); return; }
  if (plain && e.key === 'Delete') { e.preventDefault(); deleteProject(p); return; }
  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
    e.preventDefault();
    row.querySelector('.home-row__more').click();
    return;
  }
  // Typing finds a project: the palette takes the first letter and the rest.
  if (plain && findsByTyping(e.key) && g.CommandPalette) {
    e.preventDefault();
    g.CommandPalette.open({ query: e.key });
  }
}

// ── news in passing ─────────────────────────────────────────────────────────
// What the strip's message slot is to the editor (docs/UI.md §3): one line, for
// a moment, when something a person just did has an answer worth a glance. A
// preference changed from the palette says what it is now, here.

/** How long a line of news stays. */
export const NEWS_MS = 4000;
let newsTimer = null;

function say(text) {
  const line = document.getElementById('home-news');
  if (!line || !text) return;
  line.textContent = String(text);
  line.hidden = false;
  clearTimeout(newsTimer);
  newsTimer = setTimeout(() => { line.hidden = true; }, NEWS_MS);
}

/** The projects as the palette lists them: home's own order, each with what its row says. */
function paletteProjects() {
  const P = g.Persist;
  const projects = P.projects();
  const stats = new Map(projects.map((p) => [p.id, P.projectStats(p.id)]));
  return orderProjects(projects, P.lastProjectId(), (id) => stats.get(id)).map((p) => ({
    id: p.id,
    name: p.name,
    detail: whenEdited(stats.get(p.id).editedAt),
  }));
}

// ── boot ────────────────────────────────────────────────────────────────────

/** Where the keyboard starts: the project last opened, else the first way to start. */
function focusStart() {
  const first = rowLinks()[0];
  if (first) first.focus();
  else focusFirstAction();
}

function mount() {
  const P = g.Persist;
  if (!P || !document.getElementById('home-list')) return;
  // On its way to the last project (the start page: js/boot/early-boot-core.mjs):
  // this page is never shown, so it draws nothing and starts nothing.
  if (g.BELJAR_LEAVING) return;
  if (g.Frame) g.Frame.mount();
  attachHomeCommands({ newProject, pickFolder, projects: paletteProjects, say });

  wireMenuTrigger(document.getElementById('btn-account'), {
    side: 'bottom', align: 'end', items: () => (g.Account ? g.Account.menuItems() : []),
  });
  wireMenuTrigger(document.getElementById('btn-sync'), {
    side: 'bottom', align: 'end', items: () => (g.SyncUI ? g.SyncUI.menuItems() : []),
  });

  const wanted = Routes.pendingOf(g.location);
  if (wanted) pending = { pid: wanted, since: Date.now(), gaveUp: false, asked: false, roundDone: false };

  mountedAt = Date.now();
  render();
  if (!pending) focusStart();
  unfocused = !document.activeElement || document.activeElement === document.body;
  // Waiting (for who is signed in, the first round, the project the address asked for) has an end.
  setTimeout(render, ACCOUNT_WAIT_MS + 50);
  setTimeout(render, OPEN_WAIT_MS + 50);

  const find = document.getElementById('home-find');
  if (find) find.addEventListener('click', () => { if (g.CommandPalette) g.CommandPalette.open(); });

  const home = document.getElementById('home');
  // Where the keyboard is, shown once it is used (css/home.css `data-keys`).
  document.addEventListener('keydown', () => { home.dataset.keys = ''; }, { capture: true, once: true });
  home.addEventListener('keydown', onListKey);
  home.addEventListener('contextmenu', (e) => {
    const row = e.target && e.target.closest ? e.target.closest('.home-row') : null;
    if (!row) return;
    e.preventDefault();
    row.querySelector('.home-row__more').click();
  });
  // A project being opened says so at once: with its scripts in the cache the
  // editor runs before it paints, and for that fifth of a second home is still
  // what is on screen. The same mark is what travels to the editor's header
  // (css/page-transition.css). Not for a click that opens it somewhere else.
  home.addEventListener('click', (e) => {
    const link = e.target && e.target.closest ? e.target.closest('.home-row__open') : null;
    if (!link || e.defaultPrevented || e.button > 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    link.closest('.home-row').setAttribute('data-opening', '');
  });

  P.onProjectsChange(queueRender);
  P.onSyncSummary(queueRender);
  g.addEventListener('beljar:account', () => { accountKnown = true; queueRender(); });
  // Back to this tab: the times have moved on, and so may the list. (Back from
  // the editor through the browser's page cache starts the page again: persist.mjs.)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') queueRender(); });
  // Whether Safari may delete what is here is learnt a moment after the page is up (durability.mjs).
  setTimeout(queueRender, 4000);
  // What comes next is a project being opened: the editor's scripts are fetched ahead.
  preloadEditorWhenIdle();
}

export const Home = { mount, render, say };
// Home's parts, for the kit page (dev/kit.html) to draw with the same code that
// draws them here: a row, the ways to start, the links, Search, the line that
// offers to sign in.
export { rowNode, startNodes, linkNodes, findNodes, signInLine };
g.Home = Home;

// Mounted as the script runs: it is the last thing in the document, so all it
// draws into is parsed, and the page's first frame (held back for this:
// index.html `rel="expect"`) already has the list in it.
if (typeof document !== 'undefined') {
  if (document.getElementById('home-list')) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}
