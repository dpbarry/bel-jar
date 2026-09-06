// The edit-history panel's model: rows, labels, travel distances.
//
// ⛔ This is the table every surface names a step from. A `kind:` that reaches
// EditHistory without a row in KIND_LABELS renders as a guessed title-case
// string, which is why `every shipped kind is named` is here: the kinds listed
// below are the ones the app actually produces, and they are checked against the
// table rather than against each other.
import {
  KIND_LABELS, labelForKind, describeEntry, filesTouched, relativeTime,
  buildHistoryRows, historySummary,
} from '../js/status-strip/status-strip-history.mjs';
import { buildSegments } from '../js/status-strip/status-strip-segments.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const NO_STRUCT = { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null, emptyFolders: null };
const entry = (over) => ({
  id: 'e', kind: 'typing', ts: Date.now(), files: {}, structural: { ...NO_STRUCT }, editorLocal: {}, ...over,
});

// ── every kind the app can produce has a name ────────────────────────────────
// Grepped from the `meta.kind` of every dispatchEdit, every transact() and every
// beginEntry(), plus the recorder's own 'typing' and normalizeEntry's 'edit'.
{
  const SHIPPED = [
    'typing', 'edit', 'format', 'rename', 'hole',
    'proof-commit', 'library-insert', 'file-batch', 'file-delete',
  ];
  for (const kind of SHIPPED) {
    expect(KIND_LABELS[kind], `kind '${kind}' has a row in KIND_LABELS`);
  }
  expect(labelForKind('typing') === 'Typing', 'a known kind reads from the table');
  expect(labelForKind('') === 'Edit', 'a missing kind still names something');
  // A future kind nobody added a row for must still render as words, never blank.
  expect(labelForKind('some-new-thing') === 'Some new thing', 'an unknown kind is spelled out');
}

// ── file names come from the entry when the file is gone ─────────────────────
{
  const e = entry({
    kind: 'file-delete',
    structural: { ...NO_STRUCT, deleted: [{ id: 'x', name: 'pkg/gone.bel', text: '' }] },
  });
  // The delete is the case that matters: `nameOf` cannot resolve a file that no
  // longer exists, and the panel still has to say which one it was.
  expect(filesTouched(e, () => null)[0] === 'pkg/gone.bel', 'a deleted file is named from the entry');
  const d = describeEntry(e, () => null);
  expect(d.label === 'Delete 1 file', `singular count reads right (got ${d.label})`);
  expect(d.where === 'gone.bel', `one file shows its base name (got ${d.where})`);
}

{
  const e = entry({
    kind: 'file-batch',
    structural: {
      ...NO_STRUCT,
      created: [
        { id: 'a', name: 'demo/a.bel', text: '' },
        { id: 'b', name: 'demo/b.bel', text: '' },
        { id: 'c', name: 'demo/lib.cfg', text: '' },
      ],
    },
  });
  const d = describeEntry(e, () => null);
  expect(d.label === 'Add 3 files', `bulk adds are counted (got ${d.label})`);
  expect(d.where === '3 files', 'several files are counted, not listed');
  expect(d.files.length === 3, 'but the full list survives for the tooltip');
}

{
  const e = entry({ kind: 'typing', files: { 'workspace://demo/a.bel': { before: '', after: 'x' } } });
  const named = describeEntry(e, (id) => (id === 'workspace://demo/a.bel' ? 'demo/a.bel' : null));
  expect(named.label === 'Typing' && named.where === 'a.bel', 'a live file resolves through nameOf');
  const unnamed = describeEntry(e, () => null);
  expect(unnamed.where === 'a.bel', 'and falls back to the id tail when it cannot');
}

{
  const e = entry({ kind: 'format', label: 'Format project' });
  expect(describeEntry(e, () => null).label === 'Format project', 'an explicit label wins over the kind');
}

// ── relative time ────────────────────────────────────────────────────────────
{
  const now = 1_000_000_000;
  expect(relativeTime(now, now) === 'now', 'a fresh step reads "now"');
  expect(relativeTime(now - 59_000, now) === 'now', 'under a minute is still "now"');
  expect(relativeTime(now - 5 * 60_000, now) === '5m', 'minutes');
  expect(relativeTime(now - 3 * 3_600_000, now) === '3h', 'hours');
  expect(relativeTime(now - 2 * 86_400_000, now) === '2d', 'days');
  expect(relativeTime(null, now) === '', 'a step with no timestamp says nothing');
}

// ── the rows, and what clicking one has to do ────────────────────────────────
{
  const mk = (id, kind) => entry({ id, kind, ts: 1_000 });
  const undo = [mk('u1', 'typing'), mk('u2', 'format'), mk('u3', 'typing')];
  const redo = [mk('r1', 'typing'), mk('r2', 'rename')];
  const rows = buildHistoryRows(undo, redo, { nameOf: () => null, now: 1_000 });

  expect(rows.length === 6, `every step plus the marker (got ${rows.length})`);
  const nowAt = rows.findIndex((r) => r.now);
  expect(nowAt === 2, `the marker sits below the redo branch (at ${nowAt})`);

  // Newest-first: the top row is the FURTHEST redo, so reading down walks
  // backwards in time all the way through the undo stack.
  // ⛔ Undo PUSHES onto the redo stack, so the stack reads backwards in time:
  // `redo[0]` is the edit undone first, which is furthest into the future.
  expect(rows[0].id === 'r1' && rows[0].direction === 'redo' && rows[0].distance === 2,
    `the top row is the furthest redo, two steps away (got ${rows[0].id}/${rows[0].distance})`);
  expect(rows[1].id === 'r2' && rows[1].distance === 1,
    'the redo stack top is the one step away');
  expect(rows[3].id === 'u3' && rows[3].direction === 'undo' && rows[3].distance === 1,
    'the row under the marker is the most recent edit, one undo away');
  expect(rows[5].id === 'u1' && rows[5].distance === 3, 'the oldest edit is three undos away');
  expect(rows.slice(0, 2).every((r) => r.ahead), 'redo rows are flagged as ahead');
  expect(rows.slice(3).every((r) => !r.ahead), 'undo rows are not');
}

{
  const rows = buildHistoryRows([], [], { nameOf: () => null });
  expect(rows.length === 1 && rows[0].now, 'an empty history is just the marker');
}

// ── the summary the strip tooltip shows ──────────────────────────────────────
{
  expect(historySummary(0, 0) === 'Nothing to undo yet', 'empty reads as a sentence');
  expect(historySummary(1, 0) === '1 step to undo', 'singular');
  expect(historySummary(4, 2) === '4 steps to undo · 2 steps to redo', 'both directions');
}

// ── the strip segment ────────────────────────────────────────────────────────
{
  const base = { hasFile: true, line: 1, col: 1 };
  const quiet = buildSegments({ ...base }, 'standard');
  expect(!quiet.find((s) => s.key === 'history'), 'no history widget before the first edit');

  const some = buildSegments({ ...base, undoDepth: 7 }, 'standard');
  const seg = some.find((s) => s.key === 'history');
  expect(seg, 'the widget appears once there is something to undo');
  expect(seg.text === '7', `it counts the undo depth (got ${seg.text})`);
  expect(seg.action === 'edit-history', 'and it opens the panel');
  expect(seg.tone === 'plain', 'no branch, no accent');
  expect(seg.title.indexOf('7 steps to undo') > 0, 'the tooltip spells the summary out');

  const branched = buildSegments({ ...base, undoDepth: 7, redoDepth: 2 }, 'standard');
  expect(branched.find((s) => s.key === 'history').tone === 'branched',
    'a waiting redo branch changes the tone');

  // Where it sits: immediately left of the checker, in the right-hand group.
  const keys = branched.map((s) => s.key);
  expect(keys.indexOf('history') === keys.indexOf('checker') - 1,
    `the widget sits directly left of the checker (${keys.join(',')})`);
  expect(keys.indexOf('spacer') < keys.indexOf('history'),
    'on the right-hand side of the spacer');

  // Redo-only: you undid everything, so there is nothing to undo but plenty to
  // get back. The widget must not vanish and strand the branch.
  const onlyRedo = buildSegments({ ...base, undoDepth: 0, redoDepth: 3 }, 'standard');
  const r = onlyRedo.find((s) => s.key === 'history');
  expect(r && r.text === '0', 'a pure redo branch still shows the widget');

  for (const level of ['compact', 'standard', 'detailed']) {
    const at = buildSegments({ ...base, undoDepth: 2 }, level).map((s) => s.key);
    expect(at.indexOf('history') === at.indexOf('checker') - 1, `${level} keeps it beside the checker`);
  }
}

console.log('OK status-strip history (rows, labels, distances, segment placement)');
