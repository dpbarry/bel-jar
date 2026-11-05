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
import { diffNode } from './review-differences.mjs';
import { actionButton } from './prompt-dialog.mjs';
import { versionTime, dayWords, clockTime } from './when.mjs';
import { glyphButton, shareVersion } from './share-window.mjs';

const g = typeof window !== 'undefined' ? window : globalThis;

export { versionTime };

/** The word at a row's right, if any: the newest is "Current", a deletion says so. */
export function rowTag(v, newest) {
  if (v.deleted) return 'Deleted';
  return newest ? 'Current' : '';
}

/** The list's headings and times, newest first: each version's day, and its time to the second. */
export function listTimes(versions, now = Date.now()) {
  return versions.map((v) => ({ day: dayWords(v.createdAt, now), time: clockTime(v.createdAt, true) }));
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

/**
 * What became of a file after the version shown, beside its path: "edited
 * since", "renamed since, now" and its name now, "deleted since" (in the version, not in
 * the project now) and "added since" (the other way round).
 */
export function changeWords(c) {
  if (c.change === 'renamed') return 'renamed since, now ' + c.before;
  if (c.change === 'back') return 'deleted since';
  if (c.change === 'gone') return 'added since';
  return 'edited since';
}

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
  // Both panes fade at an edge with more beyond it (scroll-fade.mjs). What they
  // hold changes under them, so every drawing ends in fit().
  const SF = g.ScrollFade;
  const fades = SF && typeof SF.attach === 'function'
    ? [SF.attach(list, { axis: 'y', size: 14 }), SF.attach(view, { axis: 'y', size: 14 })]
    : [];
  const fit = () => { for (const f of fades) f.update(); };

  let versions = [];
  let more = false;
  let chosen = null;
  let busy = false;

  const state = { pid, load, close: () => handle.close() };

  function rowNode(v, i, time) {
    const row = el('button', 'history__row');
    row.type = 'button';
    row.setAttribute('role', 'option');
    row.dataset.version = String(v.version);
    row.appendChild(el('span', 'history__when', time));
    const tag = rowTag(v, i === 0);
    if (tag) row.appendChild(el('span', 'history__tag', tag));
    row.addEventListener('click', () => choose(v.version));
    return row;
  }

  /** The versions under their days: a heading, then each one's time. */
  function drawList() {
    const times = listTimes(versions);
    const days = [];
    versions.forEach((v, i) => {
      let day = days[days.length - 1];
      if (!day || day.name !== times[i].day) {
        day = { name: times[i].day, node: el('div', 'history__day') };
        day.node.setAttribute('role', 'group');
        day.node.setAttribute('aria-label', day.name);
        day.node.appendChild(el('div', 'history__day-name', day.name));
        days.push(day);
      }
      day.node.appendChild(rowNode(v, i, times[i].time));
    });
    list.replaceChildren(...days.map((d) => d.node));
    markChosen();
    if (more) {
      const older = el('button', 'history__older', 'Show older');
      older.type = 'button';
      older.addEventListener('click', () => loadOlder());
      list.appendChild(older);
    }
    fit();
  }

  function say(text, retry) {
    view.replaceChildren(el('p', 'history__note', text));
    if (retry) {
      const again = actionButton('Try again', 'retry', 'secondary');
      again.addEventListener('click', () => load(true));
      view.appendChild(again);
    }
    fit();
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

  /** The chosen row is selected, and the only one in the tab order: the arrows move between rows. */
  function markChosen() {
    const rows = [...list.querySelectorAll('.history__row')];
    for (const r of rows) {
      const on = r.dataset.version === String(chosen);
      r.setAttribute('aria-selected', on ? 'true' : 'false');
      r.tabIndex = on ? 0 : -1;
    }
    if (rows.length && !rows.some((r) => r.tabIndex === 0)) rows[0].tabIndex = 0;
  }

  // A listbox: Up and Down choose the next version, Home and End the first and
  // last listed. Held down, the version opens once the key stops, not at every row.
  let soon = null;
  list.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const rows = [...list.querySelectorAll('.history__row')];
    const at = rows.indexOf(document.activeElement);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: rows.length - 1 }[e.key];
    if (at < 0 || to == null) return;
    e.preventDefault();
    const row = rows[Math.max(0, Math.min(rows.length - 1, to))];
    if (row === rows[at]) return;
    row.focus();
    choose(Number(row.dataset.version), true);
  });

  async function choose(n, later) {
    chosen = n;
    markChosen();
    clearTimeout(soon);
    if (later) {
      soon = setTimeout(() => { if (chosen === n) open(n); }, 160);
      return;
    }
    await open(n);
  }

  async function open(n) {
    view.replaceChildren(el('p', 'history__note', 'Opening…'));
    fit();
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
    view.scrollTop = 0;
    const head = el('div', 'history__head');
    head.appendChild(el('span', 'history__stamp', versionTime(v.createdAt)));
    const isCurrent = versions.length && versions[0].version === v.version;
    // A link to this version, as it is (docs/PERSIST.md §5.12): made, copied, and said what it is.
    const shared = el('div', 'history__shared');
    if (!v.deleted) {
      const share = glyphButton('Share this version', 'share', 'secondary', 'link');
      share.addEventListener('click', async () => {
        share.disabled = true;
        await shareVersion(pid, v.version, v.createdAt, shared);
        share.disabled = false;
        fit();
      });
      head.appendChild(share);
    }
    if (!v.deleted && !isCurrent) {
      const restore = actionButton('Restore this version', 'restore', 'primary');
      restore.addEventListener('click', () => doRestore(v, restore));
      head.appendChild(restore);
    }
    view.appendChild(head);
    view.appendChild(shared);
    if (problem) view.appendChild(el('p', 'review__problem', problem));
    drawChanges(v);
    fit();
  }

  /** What changed since this version, file by file: − is the project now, + this version. */
  function drawChanges(v) {
    if (v.deleted) {
      view.appendChild(el('p', 'history__note', 'The project was deleted here.'));
      return;
    }
    const changes = versionChanges(v, currentFiles());
    if (!changes.length) {
      view.appendChild(el('p', 'history__note', 'The same as the project is now.'));
      return;
    }
    for (const c of changes) {
      const line = el('div', 'review__change');
      line.appendChild(el('span', 'review__path', c.path));
      line.appendChild(el('span', 'review__kind', changeWords(c)));
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
    onClose: () => {
      clearTimeout(soon);
      for (const f of fades) f.destroy();
      if (win === state) win = null;
    },
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
