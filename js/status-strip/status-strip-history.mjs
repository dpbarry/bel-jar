/**
 * What the edit-history panel says, as data. Pure: no DOM, no globals.
 *
 * The panel is a timeline of the workspace, newest at the top, with a marker
 * for where you are standing. Rows above the marker are ahead of you (redo);
 * rows below are behind you (undo). Clicking any row travels there, which is
 * the whole interaction: a history you can only step through one keypress at a
 * time is a keyboard shortcut with a picture next to it.
 *
 * ⛔ ONE table names the steps. `EditHistory` entries carry a `kind` string set
 * at the call site, and every surface that names a step — this panel, the
 * segment tooltip — reads `KIND_LABELS`. Adding a new `kind:` to a
 * `dispatchEdit`, `transact` or `beginEntry` call means adding a row here, and
 * `test-status-strip-history.mjs` fails until you do.
 */

/**
 * Every `kind` the history can hold, and what to call it in front of a user.
 *
 * Sentence case, verb-first where the step is an action you took. Kept short
 * enough for a compact panel: the file column beside it says *where*, so the
 * label only has to say *what*.
 */
export const KIND_LABELS = {
  typing: 'Typing',
  edit: 'Edit',
  format: 'Format',
  rename: 'Rename',
  hole: 'Fill hole',
  'proof-commit': 'Commit proof',
  'library-insert': 'Insert from library',
  'file-batch': 'Add files',
  'file-delete': 'Delete files',
};

export function labelForKind(kind) {
  const k = String(kind || '');
  if (KIND_LABELS[k]) return KIND_LABELS[k];
  if (!k) return 'Edit';
  // An unknown kind is a bug, but a panel that renders a blank row is a worse
  // one: spell it out rather than drop the step the user is looking for.
  return k.charAt(0).toUpperCase() + k.slice(1).replace(/-/g, ' ');
}

function baseName(path) {
  const p = String(path || '');
  const cut = p.lastIndexOf('/');
  return cut >= 0 ? p.slice(cut + 1) : p;
}

/** File ids are opaque; strip the scheme so a fallback still reads as a path. */
function nameFromId(id) {
  return baseName(String(id || '').replace(/^[a-z]+:\/\//i, ''));
}

function structuralOf(entry) {
  return entry.structural || {};
}

/**
 * Which files this step touched, by name, deduped and in a stable order.
 *
 * `nameOf` resolves a live file id. Deleted files never resolve — their names
 * are carried in the entry itself, which is exactly why undo can restore them.
 */
export function filesTouched(entry, nameOf) {
  const resolve = typeof nameOf === 'function' ? nameOf : () => null;
  const s = structuralOf(entry);
  const names = [];
  const seen = new Set();
  const add = (name) => {
    const n = String(name || '');
    if (!n || seen.has(n)) return;
    seen.add(n);
    names.push(n);
  };
  for (const f of s.created || []) add(f.name);
  for (const f of s.deleted || []) add(f.name);
  for (const id of Object.keys(entry.files || {})) add(resolve(id) || nameFromId(id));
  for (const id of Object.keys(s.cfg || {})) add(resolve(id) || nameFromId(id));
  return names;
}

function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

/**
 * One row's worth of words.
 *
 * The bulk file steps say how many, because "Add files" next to one filename is
 * a worse sentence than "Add 3 files". Everything else keeps a fixed label and
 * lets the file column carry the specifics.
 */
export function describeEntry(entry, nameOf) {
  const e = entry || {};
  const s = structuralOf(e);
  const names = filesTouched(e, nameOf);
  let label = e.label || labelForKind(e.kind);

  if (!e.label) {
    const created = (s.created || []).length;
    const deleted = (s.deleted || []).length;
    if (e.kind === 'file-batch' && created) label = 'Add ' + plural(created, 'file', 'files');
    else if (e.kind === 'file-delete' && deleted) label = 'Delete ' + plural(deleted, 'file', 'files');
    else if (created && deleted) label = 'Replace ' + plural(created, 'file', 'files');
    else if (created) label = 'Add ' + plural(created, 'file', 'files');
    else if (deleted) label = 'Delete ' + plural(deleted, 'file', 'files');
  }

  // One file: name it. Several: count them, because four filenames in a 20rem
  // panel is a paragraph, and the label already said what happened to them.
  const where = names.length === 1
    ? baseName(names[0])
    : (names.length > 1 ? plural(names.length, 'file', 'files') : '');

  // A named action keeps its name: "Format" says more than the 400 characters
  // it rewrote. Only the anonymous edits borrow their text.
  let preview = null;
  if (!e.label && PREVIEWABLE[e.kind]) {
    const ids = Object.keys(e.files || {});
    if (ids.length === 1) {
      const rec = e.files[ids[0]];
      preview = changePreview(rec && rec.before, rec && rec.after);
    }
  }

  return { label, where, files: names, preview };
}

/** How much of a typed run the row shows before it gives up and ellipsises. */
const PREVIEW_MAX = 34;

/**
 * What a plain edit actually DID, as text you can recognise.
 *
 * ⛔ Without this the panel is a wall. A typing burst closes after 150ms of
 * quiet, so a minute of work is a dozen rows all reading "Typing main.bel now",
 * and picking the right one means counting rather than reading. The point of a
 * history you can see is that you can find a moment in it, so a plain edit shows
 * the text it inserted or removed and only falls back to its kind when there is
 * nothing legible to show.
 *
 * Diffed by common prefix and suffix, which is exact for the single contiguous
 * run a typing burst actually is, and good enough for anything else — the row is
 * a label, not a patch.
 */
export function changePreview(before, after) {
  const b = String(before == null ? '' : before);
  const a = String(after == null ? '' : after);
  if (b === a) return null;
  let p = 0;
  const max = Math.min(b.length, a.length);
  while (p < max && b[p] === a[p]) p += 1;
  let sfx = 0;
  while (sfx < max - p && b[b.length - 1 - sfx] === a[a.length - 1 - sfx]) sfx += 1;
  const added = a.slice(p, a.length - sfx);
  const removed = b.slice(p, b.length - sfx);
  const sign = added && removed ? '±' : (added ? '+' : '−');
  const body = added || removed;
  // Whitespace-only runs (an Enter, a re-indent) have nothing to show, and a row
  // reading `+ ` is worse than one reading "Typing".
  const flat = body.replace(/\s+/g, ' ').trim();
  if (!flat) {
    const n = body.length;
    if (!n) return null;
    return { sign, text: n === 1 ? 'newline' : n + ' spaces', faded: true };
  }
  const text = flat.length > PREVIEW_MAX ? flat.slice(0, PREVIEW_MAX - 1) + '…' : flat;
  return { sign, text };
}

/** Kinds that are better described by what they typed than by their name. */
const PREVIEWABLE = { typing: true, edit: true };

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago, in the fewest characters that stay honest.
 *
 * ⛔ No "0m" and no seconds ticking down. A history panel is read in glances;
 * a column that changes while you look at it pulls the eye off the row you were
 * actually reading.
 */
export function relativeTime(ts, now) {
  const then = Number(ts);
  const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  if (!Number.isFinite(then) || then <= 0) return '';
  const ago = Math.max(0, at - then);
  if (ago < MINUTE) return 'now';
  if (ago < HOUR) return Math.floor(ago / MINUTE) + 'm';
  if (ago < DAY) return Math.floor(ago / HOUR) + 'h';
  return Math.floor(ago / DAY) + 'd';
}

/**
 * The panel's rows, newest first, with the standing position marked.
 *
 * `distance` is how many steps away a row is, and `direction` which way to
 * travel — so acting on a row is `direction` applied `distance` times, and the
 * view needs no arithmetic of its own.
 *
 * The `now` row is a real row, not a divider drawn between two others: it is
 * where clicking takes you back to after you have wandered up into the redo
 * branch, and a marker you cannot click is a marker you cannot use.
 */
export function buildHistoryRows(undoStack, redoStack, opts) {
  const o = opts || {};
  const nameOf = o.nameOf;
  const at = o.now;
  const undo = Array.isArray(undoStack) ? undoStack : [];
  const redo = Array.isArray(redoStack) ? redoStack : [];
  const rows = [];

  // Redo entries, furthest-ahead first.
  //
  // ⛔ The redo stack's TOP is the next redo, and undo pushes onto it, so the
  // stack reads backwards in time: `redo[0]` is the edit you undid FIRST, which
  // is the furthest into the future and therefore the top row of the panel. Its
  // distance is the whole stack; the top of the stack is one step away.
  for (let i = 0; i < redo.length; i += 1) {
    const entry = redo[i];
    const d = describeEntry(entry, nameOf);
    rows.push({
      id: entry.id,
      kind: entry.kind,
      label: d.label,
      preview: d.preview,
      where: d.where,
      files: d.files,
      when: relativeTime(entry.ts, at),
      direction: 'redo',
      distance: redo.length - i,
      ahead: true,
    });
  }

  rows.push({ id: '__now__', now: true, label: 'Current', direction: null, distance: 0 });

  for (let i = undo.length - 1; i >= 0; i -= 1) {
    const entry = undo[i];
    const d = describeEntry(entry, nameOf);
    rows.push({
      id: entry.id,
      kind: entry.kind,
      label: d.label,
      preview: d.preview,
      where: d.where,
      files: d.files,
      when: relativeTime(entry.ts, at),
      direction: 'undo',
      distance: undo.length - i,
      ahead: false,
    });
  }

  return rows;
}

/** The one-line summary the strip segment shows in its tooltip. */
export function historySummary(undoCount, redoCount) {
  const u = Number(undoCount) || 0;
  const r = Number(redoCount) || 0;
  if (!u && !r) return 'Nothing to undo yet';
  const parts = [];
  if (u) parts.push(plural(u, 'step', 'steps') + ' to undo');
  if (r) parts.push(plural(r, 'step', 'steps') + ' to redo');
  return parts.join(' · ');
}
