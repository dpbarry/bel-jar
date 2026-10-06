/**
 * Version history (plan v6 c6, docs/PERSIST.md §5): every version of the open
 * project that the cloud keeps, newest first; one opened read-only, set beside
 * the project as it is now; and Restore, which makes it the newest version.
 *
 * Restoring deletes nothing. It is an edit like any other (engine.mjs
 * `restoreVersion`): the next round commits it over the head, other devices
 * merge it, and the versions it replaces stay in the list. So it asks nothing.
 * ⛔ It waits for everything here to be in the cloud first: what this browser
 * had not sent would otherwise be gone from it, and from everywhere.
 *
 * Opened from Project > Version history, or the palette; signed in only.
 */
import { lineDiff, compactDiff } from './review-differences.mjs';
import { actionButton } from './prompt-dialog.mjs';

const g = typeof window !== 'undefined' ? window : globalThis;

const DAY = 24 * 60 * 60 * 1000;

/** When a version was made, as a list says it: "Today 14:05", "Yesterday 09:12", "2 Oct 16:40". */
export function versionTime(ms, now = Date.now()) {
  const at = new Date(ms);
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date(now);
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (ms >= midnight) return 'Today ' + time;
  if (ms >= midnight - DAY) return 'Yesterday ' + time;
  const opts = at.getFullYear() === today.getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return at.toLocaleDateString([], opts) + ' ' + time;
}

/** What a row says under its time: the current one, a deletion, a name it had then, its files. */
export function versionWords(v, o = {}) {
  if (v.deleted) return 'Deleted';
  const parts = [];
  if (o.current) parts.push('Current');
  if (v.name && o.name && v.name !== o.name) parts.push('Named ' + v.name);
  parts.push(v.files === 1 ? '1 file' : v.files + ' files');
  return parts.join(', ');
}

/**
 * What restoring `version` would do to the project as it is now (`current`:
 * [{ id, path, text }]): [{ path, change, before, after }], change one of
 * 'edited', 'renamed', 'back' (a file it brings back) and 'gone' (one it
 * removes). Files the same in both are left out.
 */
export function versionChanges(version, current) {
  const now = new Map(current.map((f) => [f.id, f]));
  const out = [];
  for (const f of version.files) {
    const c = now.get(f.id);
    now.delete(f.id);
    if (!c) out.push({ path: f.path, change: 'back', before: '', after: f.text });
    else if (c.text !== f.text) out.push({ path: f.path, change: 'edited', before: c.text, after: f.text });
    else if (c.path !== f.path) out.push({ path: f.path, change: 'renamed', before: c.path, after: f.path });
  }
  for (const c of now.values()) out.push({ path: c.path, change: 'gone', before: c.text, after: '' });
  return out;
}

const CHANGE_WORDS = { edited: 'edited', renamed: 'renamed', back: 'comes back', gone: 'goes' };

/** Why Restore could not go ahead, in a sentence. */
export function restoreProblem(error) {
  if (error === 'unsynced') return 'Not everything here is in the cloud yet, and restoring would lose it. Try again once it’s synced.';
  if (error === 'review') return 'Some files are waiting in Review differences. Settle them first.';
  if (error === 'no-version') return 'That version can’t be restored.';
  return 'Couldn’t reach the cloud. Try again.';
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function diffNode(before, after) {
  const box = el('div', 'review-diff');
  for (const r of compactDiff(lineDiff(before || '', after || ''), 1)) {
    if (r.kind === 'gap') {
      box.appendChild(el('div', 'review-diff__gap', r.count === 1 ? '1 unchanged line' : r.count + ' unchanged lines'));
      continue;
    }
    const line = el('div', 'review-diff__line is-' + r.kind);
    line.appendChild(el('span', 'review-diff__mark', r.kind === 'theirs' ? '−' : r.kind === 'mine' ? '+' : ''));
    line.appendChild(el('span', 'review-diff__text', r.text || ' '));
    box.appendChild(line);
  }
  return box;
}

/** The open project's files as they are now. */
function currentFiles() {
  const P = g.Persist;
  return (P.listFiles() || []).map((f) => ({ id: f.id, path: f.name, text: P.getFileText(f.id) || '' }));
}

let win = null;

function saveNow() {
  try {
    if (g.Commands && typeof g.Commands.run === 'function') g.Commands.run('file.save');
  } catch (_) { /* nothing open */ }
}

/** Open the window on the open project (or bring it up to date). */
export async function openVersionHistory() {
  const FW = g.FloatingWindow;
  const P = g.Persist;
  if (!FW || !P) return false;
  const pid = P.getActiveProjectId();
  if (win && win.pid === pid) {
    await win.load(true);
    return true;
  }
  if (win) win.close();

  const body = el('div', 'history');
  const list = el('div', 'history__list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Versions');
  const view = el('div', 'history__view');
  body.append(list, view);

  let versions = [];
  let more = false;
  let chosen = null;
  let busy = false;

  const state = { pid, load, close: () => handle.close() };

  function rowNode(v, i) {
    const row = el('button', 'history__row');
    row.type = 'button';
    row.setAttribute('role', 'option');
    row.dataset.version = String(v.version);
    row.setAttribute('aria-selected', chosen === v.version ? 'true' : 'false');
    row.appendChild(el('span', 'history__when', versionTime(v.createdAt)));
    row.appendChild(el('span', 'history__what', versionWords(v, { current: i === 0, name: P.getProjectName() })));
    row.addEventListener('click', () => choose(v.version));
    return row;
  }

  function drawList() {
    list.replaceChildren(...versions.map(rowNode));
    if (more) {
      const older = el('button', 'history__older', 'Show older');
      older.type = 'button';
      older.addEventListener('click', () => loadOlder());
      list.appendChild(older);
    }
  }

  function say(text, retry) {
    view.replaceChildren(el('p', 'history__note', text));
    if (retry) {
      const again = actionButton('Try again', 'retry', 'secondary');
      again.addEventListener('click', () => load(true));
      view.appendChild(again);
    }
  }

  async function load(fresh) {
    if (fresh) chosen = null;
    let page;
    try {
      page = await P.projectHistory(pid);
    } catch (_) {
      page = undefined;
    }
    if (page === null) {
      list.replaceChildren();
      say('Version history is kept in the cloud. Sign in to see it.');
      return;
    }
    if (!page) {
      list.replaceChildren();
      say('Couldn’t reach the cloud. Try again.', true);
      return;
    }
    versions = page;
    more = page.length >= 50;
    drawList();
    if (!versions.length) {
      say('This project has no versions in the cloud yet. One is made each time it syncs.');
      return;
    }
    if (chosen == null) await choose(versions.length > 1 ? versions[1].version : versions[0].version);
  }

  async function loadOlder() {
    const last = versions[versions.length - 1];
    let page = null;
    try {
      page = await P.projectHistory(pid, { before: last.version });
    } catch (_) { /* the button stays */ }
    if (!page) return;
    versions = versions.concat(page);
    more = page.length >= 50;
    drawList();
  }

  async function choose(n) {
    chosen = n;
    for (const r of list.querySelectorAll('.history__row')) r.setAttribute('aria-selected', r.dataset.version === String(n) ? 'true' : 'false');
    view.replaceChildren(el('p', 'history__note', 'Opening…'));
    let v = null;
    try {
      v = await P.readVersion(pid, n);
    } catch (_) {
      v = undefined;
    }
    if (chosen !== n) return;
    if (v === undefined) return say('Couldn’t reach the cloud. Try again.', true);
    if (!v) return say('That version can’t be read.');
    drawVersion(v);
  }

  function drawVersion(v, problem) {
    view.replaceChildren();
    const head = el('div', 'history__head');
    const title = el('div', 'history__title');
    title.appendChild(el('span', 'history__stamp', versionTime(v.createdAt)));
    title.appendChild(el('span', 'history__sub', v.deleted ? 'The project was deleted here' : 'Read only'));
    head.appendChild(title);
    const isCurrent = versions.length && versions[0].version === v.version;
    if (!v.deleted && !isCurrent) {
      const restore = actionButton('Restore this version', 'restore', 'primary');
      restore.addEventListener('click', () => doRestore(v, restore));
      head.appendChild(restore);
    }
    view.appendChild(head);
    if (problem) view.appendChild(el('p', 'review__problem', problem));
    if (v.deleted) return;
    const changes = versionChanges(v, currentFiles());
    if (!changes.length) {
      view.appendChild(el('p', 'history__note', 'The same as the project is now.'));
      return;
    }
    const legend = el('p', 'review__legend');
    legend.appendChild(el('span', 'review__key is-theirs', '− now'));
    legend.appendChild(el('span', 'review__key is-mine', '+ this version'));
    view.appendChild(legend);
    for (const c of changes) {
      const line = el('div', 'review__change');
      line.appendChild(el('span', 'review__path', c.path));
      line.appendChild(el('span', 'review__kind', CHANGE_WORDS[c.change]));
      view.appendChild(line);
      if (c.change === 'edited') view.appendChild(diffNode(c.before, c.after));
    }
  }

  async function doRestore(v, btn) {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    saveNow();
    let res;
    try {
      // What was typed here goes up first: it becomes a version, kept in the list.
      const synced = await P.confirmSynced();
      res = synced && synced.ok ? await P.restoreVersion(pid, v.version) : { ok: false, error: 'unsynced' };
    } catch (_) {
      res = { ok: false, error: 'network' };
    }
    busy = false;
    if (res && res.ok) {
      handle.close();
      return;
    }
    btn.disabled = false;
    drawVersion(v, restoreProblem(res && res.error));
  }

  const handle = FW.open({
    title: 'Version history',
    className: 'floating-window--history',
    content: body,
    width: 720,
    height: 460,
    minWidth: 480,
    minHeight: 260,
    onClose: () => { if (win === state) win = null; },
  });
  win = state;
  await load(true);
  return true;
}

/** Signed in, on one of the account's projects: the cloud has its versions. */
export function historyAvailable() {
  const P = g.Persist;
  const A = g.Account;
  if (!P || !A || typeof A.user !== 'function' || !A.user()) return false;
  const pid = P.getActiveProjectId();
  const p = (P.projects() || []).find((x) => x.id === pid);
  return !!p && !!p.owner && p.owner === P.getAccount();
}

export const VersionHistory = { open: openVersionHistory, available: historyAvailable };
g.VersionHistory = VersionHistory;
