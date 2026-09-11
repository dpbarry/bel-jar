import { createEditHistory, normalizeEntry, newEntryId, SESSION_KEY_PREFIX, editHistoryTxn } from '../js/editor-src/edit-history.mjs';
import { Transaction } from '@codemirror/state';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function mockAdapter(initial) {
  const state = {
    files: new Map(initial.files.map((f) => [f.id, { ...f }])),
    texts: new Map(Object.entries(initial.texts || {})),
    openFileIds: [...(initial.openFileIds || [])],
    activeFileId: initial.activeFileId || null,
    editor: initial.editor || null,
    toasts: [],
  };

  return {
    projectKey: 'test-project',
    sessionStorage: null,
    getFileText(id) { return state.texts.get(id) ?? ''; },
    setFileText(id, text) { state.texts.set(id, text); },
    listFiles() { return [...state.files.values()]; },
    getFileById(id) { return state.files.get(id) || null; },
    restoreDeletedFile(id, name, text) {
      if (state.files.has(id)) return false;
      state.files.set(id, { id, name });
      state.texts.set(id, text);
      return true;
    },
    deleteFile(id) {
      if (!state.files.has(id)) return false;
      state.files.delete(id);
      state.texts.delete(id);
      state.openFileIds = state.openFileIds.filter((x) => x !== id);
      return true;
    },
    getOpenFileIds() { return [...state.openFileIds]; },
    setOpenFileIds(ids) { state.openFileIds = [...ids]; },
    getActiveFileId() { return state.activeFileId; },
    setActiveFileId(id) { state.activeFileId = id; },
    getActiveEditor() { return state.editor; },
    renameFile(id, name) {
      const f = state.files.get(id);
      if (!f) return false;
      f.name = name;
      return true;
    },
    toast(msg) { state.toasts.push(msg); },
    _state: state,
  };
}

function snapTexts(adapter) {
  const out = {};
  for (const f of adapter.listFiles()) out[f.id] = adapter.getFileText(f.id);
  return out;
}

// invertibility: push entry, undo restores before
{
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }],
    texts: { a: 'one' },
    activeFileId: 'a',
  });
  const H = createEditHistory(adapter);
  H.pushEntry(normalizeEntry({
    id: newEntryId(),
    kind: 'typing',
    files: { a: { before: 'one', after: 'two' } },
    structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
  }));
  adapter.setFileText('a', 'two');
  expect(H.undo(), 'undo succeeds');
  expect(adapter.getFileText('a') === 'one', 'undo restores text');
  expect(H.redo(), 'redo succeeds');
  expect(adapter.getFileText('a') === 'two', 'redo restores after');
  expect(H.undo(), 'undo again');
  expect(adapter.getFileText('a') === 'one', 'undo+redo identity');
}

// stack order: A then B
{
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }],
    texts: { a: 'Y' },
    activeFileId: 'a',
  });
  const H = createEditHistory(adapter);
  H.pushEntry(normalizeEntry({
    id: 'A', kind: 'typing',
    files: { a: { before: 'Y', after: 'X' } },
    structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
  }));
  H.pushEntry(normalizeEntry({
    id: 'B', kind: 'typing',
    files: { a: { before: 'X', after: 'Z' } },
    structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
  }));
  adapter.setFileText('a', 'Z');
  expect(H.undo(), 'undo B');
  expect(adapter.getFileText('a') === 'X', 'state X after undo B');
  expect(H.undo(), 'undo A');
  expect(adapter.getFileText('a') === 'Y', 'state Y after undo A');
}

// multi-file atomic
{
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }, { id: 'b', name: 'b.bel' }],
    texts: { a: 'foo', b: 'foo' },
    activeFileId: 'a',
  });
  const H = createEditHistory(adapter);
  H.pushEntry(normalizeEntry({
    id: 'mf', kind: 'rename',
    files: {
      a: { before: 'foo', after: 'bar' },
      b: { before: 'foo', after: 'bar' },
    },
    structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
  }));
  adapter.setFileText('a', 'bar');
  adapter.setFileText('b', 'bar');
  expect(H.undo(), 'multi undo');
  expect(adapter.getFileText('a') === 'foo' && adapter.getFileText('b') === 'foo', 'both files restored');
}

// a project swap never inherits the last project's history
//
// ⛔ Found by a probe that could not reset itself: `loadStack` returned early
// when the new key had nothing stored, leaving the previous project's entries
// live against a workspace whose files they do not describe.
{
  const store = new Map();
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }],
    texts: { a: 'two' },
    activeFileId: 'a',
  });
  adapter.projectKey = 'proj-one';
  adapter.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  };
  const H = createEditHistory(adapter);
  H.pushEntry(normalizeEntry({
    id: 'e', kind: 'typing',
    files: { a: { before: 'one', after: 'two' } },
    structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
  }));
  expect(H.canUndo(), 'project one has a history');

  H.swapProject('proj-two-never-seen');
  expect(!H.canUndo(), 'swapping to an unseen project starts with no undo history');
  expect(!H.canRedo(), 'and no redo history');

  H.swapProject('proj-one');
  expect(H.canUndo(), 'swapping back restores that project own history');
}

// text drift is RECONCILED, never refused
//
// The old contract refused here, and refusing is what shipped the bug the user
// reported: one out-of-band rewrite (trim-on-save) and every undo for the rest
// of the session answered "the project changed since that edit". Drift now gets
// folded into the step, so undo still runs and redo still puts the drift back.
{
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }],
    texts: { a: 'drift' },
    activeFileId: 'a',
  });
  const H = createEditHistory(adapter);
  H.pushEntry(normalizeEntry({
    id: 'e', kind: 'typing',
    files: { a: { before: 'one', after: 'two' } },
    structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
  }));
  expect(H.undo(), 'undo runs despite drift');
  expect(adapter.getFileText('a') === 'one', 'undo reaches the recorded before-state');
  expect(H.canRedo(), 'the drifted state is redoable');
  expect(H.redo(), 'redo runs');
  expect(adapter.getFileText('a') === 'drift', 'redo restores the drifted text, losing nothing');
}

// structural impossibility DOES still refuse, and says so honestly
{
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }],
    texts: { a: 'two' },
    activeFileId: 'a',
  });
  const H = createEditHistory(adapter);
  H.pushEntry(normalizeEntry({
    id: 'e', kind: 'edit',
    files: { a: { before: 'one', after: 'two' } },
    structural: {
      created: [], deleted: [{ id: 'gone', name: 'gone.bel', text: 'x' }],
      cfg: {}, openFileIds: null, activeFileId: null,
    },
  }));
  adapter.restoreDeletedFile = () => false;
  expect(!H.undo(), 'refuse when a file the step needs cannot be restored');
  expect(adapter.getFileText('a') === 'two', 'no mutation left behind on refusal');
  expect(H.canUndo(), 'stack unchanged on refusal');
}

// redo invalidation
{
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }],
    texts: { a: 'two' },
    activeFileId: 'a',
  });
  const H = createEditHistory(adapter);
  H.pushEntry(normalizeEntry({
    id: 'e', kind: 'typing',
    files: { a: { before: 'one', after: 'two' } },
    structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
  }));
  expect(H.undo(), 'undo clears path to redo');
  expect(H.canRedo(), 'redo available');
  H.pushEntry(normalizeEntry({
    id: 'n', kind: 'typing',
    files: { a: { before: 'one', after: 'three' } },
    structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
  }));
  expect(!H.canRedo(), 'new edit clears redo');
}

// file delete then undo delete then undo edit
{
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }, { id: 'b', name: 'b.bel' }],
    texts: { a: 'AA', b: 'BB' },
    openFileIds: ['a', 'b'],
    activeFileId: 'a',
  });
  const H = createEditHistory(adapter);
  H.pushEntry(normalizeEntry({
    id: 'edit', kind: 'rename',
    files: {
      a: { before: 'AA', after: 'AA2' },
      b: { before: 'BB', after: 'BB2' },
    },
    structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
  }));
  adapter.setFileText('a', 'AA2');
  adapter.setFileText('b', 'BB2');

  H.pushEntry(normalizeEntry({
    id: 'del', kind: 'file-delete',
    files: { b: { before: 'BB2', after: '' } },
    structural: {
      created: [],
      deleted: [{ id: 'b', name: 'b.bel', text: 'BB2' }],
      cfg: {},
      openFileIds: { before: ['a', 'b'], after: ['a'] },
      activeFileId: null,
    },
  }));
  adapter.deleteFile('b');
  adapter.setOpenFileIds(['a']);

  expect(H.undo(), 'undo delete');
  expect(adapter.getFileById('b'), 'file restored');
  expect(adapter.getFileText('b') === 'BB2', 'deleted text restored');
  expect(H.undo(), 'undo multi edit');
  expect(adapter.getFileText('a') === 'AA' && adapter.getFileText('b') === 'BB', 'multi-file edit restored');
}

// session round-trip
{
  const store = new Map();
  const sessionStorage = {
    setItem(k, v) { store.set(k, v); },
    getItem(k) { return store.get(k) ?? null; },
  };
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }],
    texts: { a: 'two' },
    activeFileId: 'a',
  });
  adapter.sessionStorage = sessionStorage;
  const H1 = createEditHistory(adapter);
  H1.pushEntry(normalizeEntry({
    id: 'e', kind: 'typing',
    files: { a: { before: 'one', after: 'two' } },
    structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
  }));
  expect(store.has(SESSION_KEY_PREFIX + 'test-project'), 'persisted to session');

  const H2 = createEditHistory(adapter);
  expect(H2.canUndo(), 'reloaded stack has undo');
  expect(H2.undo(), 'undo after reload');
  expect(adapter.getFileText('a') === 'one', 'restored after reload undo');
}

// reload reconcile (mount reindent drift)
{
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }],
    texts: { a: 'two-indented' },
    activeFileId: 'a',
  });
  const H = createEditHistory(adapter);
  H.pushEntry(normalizeEntry({
    id: 'e', kind: 'typing',
    files: { a: { before: 'one', after: 'two' } },
    structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
  }));
  H.reconcileActiveFile('a', 'two-indented');
  expect(H.undo(), 'undo after reconcile');
  expect(adapter.getFileText('a') === 'one', 'undo works after reload drift');
}

// undo → edit → undo: an edit made right after an undo must still be historied
{
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }],
    texts: { a: 'hello' },
    activeFileId: 'a',
  });
  const editor = {
    _text: 'hello',
    getValue() { return this._text; },
    getCurrentFileId() { return 'a'; },
    replaceDocumentNonUndoable(t) { this._text = t; },
  };
  adapter._state.editor = editor;
  adapter.getActiveEditor = () => editor;
  adapter.syncActiveEditorCheckpoint = (text) => {
    adapter.setFileText('a', text);
    editor._text = text;
  };

  const H = createEditHistory(adapter);
  H.pushEntry(normalizeEntry({
    id: 'e', kind: 'typing',
    files: { a: { before: 'hi', after: 'hello' } },
    structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
  }));
  expect(H.undo(), 'first undo');
  expect(editor._text === 'hi', 'editor restored');

  H.onDocChange(
    {
      state: {
        doc: { toString: () => 'hi!' },
        selection: { main: { anchor: 3, head: 3 } },
      },
    },
    {
      docChanged: true,
      startState: {
        doc: { toString: () => 'hi' },
        selection: { main: { anchor: 2, head: 2 } },
      },
      transactions: [{
        annotation(ann) {
          if (ann === Transaction.addToHistory) return undefined;
          if (ann === editHistoryTxn) return undefined;
          if (ann === Transaction.userEvent) return 'input.type';
          return undefined;
        },
      }],
    },
    'a',
  );
  H.flushTypingGroup();
  editor._text = 'hi!';
  adapter.setFileText('a', 'hi!');
  expect(H.undo(), 'undo after post-undo edit');
  expect(editor._text === 'hi', 'second undo restores pre-burst text');
}

// typing undo restores cursor snapshot, not EOF
{
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }],
    texts: { a: 'hello' },
    activeFileId: 'a',
  });
  const editor = {
    _text: 'hello',
    _sel: null,
    _scroll: false,
    _viewport: null,
    getValue() { return this._text; },
    getCurrentFileId() { return 'a'; },
    replaceDocumentNonUndoable(t, opts) {
      this._text = t;
      this._sel = opts?.selection ?? null;
      this._scroll = !!opts?.scrollIntoView;
    },
    applyViewport(local) { this._viewport = local; },
  };
  adapter._state.editor = editor;
  adapter.getActiveEditor = () => editor;
  adapter.syncActiveEditorCheckpoint = (text) => {
    adapter.setFileText('a', text);
    editor._text = text;
  };

  const H = createEditHistory(adapter);
  H.pushEntry(normalizeEntry({
    id: 'e', kind: 'typing',
    files: {
      a: {
        before: 'hi',
        after: 'hello',
        beforeSel: { anchor: 1, head: 1 },
        afterSel: { anchor: 5, head: 5 },
        beforeLocal: { selection: { anchor: 1, head: 1 }, scrollTop: 240 },
        afterLocal: { selection: { anchor: 5, head: 5 }, scrollTop: 240 },
      },
    },
    structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
  }));
  expect(H.undo(), 'undo with selection snapshot');
  expect(editor._sel?.anchor === 1 && editor._sel?.head === 1, 'cursor restored to beforeSel');
  expect(editor._scroll, 'undo requests scrollIntoView');
  // ⛔ The caret ships INSIDE the replacement, and nothing follows it.
  // applyViewport dispatches a second selection and a raw scrollTop write two
  // animation frames later, from a snapshot of a document that may no longer
  // exist by then. Held-down Ctrl+Z queued one per press and they landed after
  // the run was over, each dragging the caret back into the middle of the
  // chain. scrollIntoView on the restored caret is the whole restore.
  expect(editor._viewport === null, 'undo schedules no late viewport dispatch');
}

// hole-shaped entry without prior sels still reveals on undo (EOF fallback + scroll)
{
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }],
    texts: { a: 'filled' },
    activeFileId: 'a',
  });
  const editor = {
    _text: 'filled',
    _sel: null,
    _scroll: false,
    _viewport: null,
    getValue() { return this._text; },
    getCurrentFileId() { return 'a'; },
    replaceDocumentNonUndoable(t, opts) {
      this._text = t;
      this._sel = opts?.selection ?? null;
      this._scroll = !!opts?.scrollIntoView;
    },
    applyViewport(local) { this._viewport = local; },
  };
  adapter._state.editor = editor;
  adapter.getActiveEditor = () => editor;
  adapter.syncActiveEditorCheckpoint = (text) => {
    adapter.setFileText('a', text);
    editor._text = text;
  };

  const H = createEditHistory(adapter);
  H.pushEntry(normalizeEntry({
    id: 'hole', kind: 'hole',
    files: { a: { before: '?', after: 'filled' } },
    structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
  }));
  expect(H.undo(), 'hole undo');
  expect(editor._text === '?', 'hole text restored');
  expect(editor._sel?.anchor === 1 && editor._sel?.head === 1, 'missing sel falls back to EOF of restored text');
  expect(editor._scroll, 'hole undo still scrolls');
  expect(editor._viewport === null, 'the reveal rides the replacement, not a later dispatch');
}

// beginEntry/commitEntry records selection snapshots for non-typing edits
{
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }],
    texts: { a: 'hello' },
    activeFileId: 'a',
  });
  adapter.captureViewport = () => ({
    selection: { anchor: 2, head: 2 },
    scrollTop: 120,
  });
  adapter.captureSelection = () => ({ anchor: 2, head: 2 });

  const H = createEditHistory(adapter);
  H.beginEntry('hole');
  H.touchFile('a');
  adapter.setFileText('a', 'hello!');
  adapter.captureViewport = () => ({
    selection: { anchor: 6, head: 6 },
    scrollTop: 120,
  });
  expect(H.commitEntry(), 'commit hole-shaped entry');
  const entry = H.getUndoStack()[0];
  expect(entry.files.a.beforeSel?.anchor === 2, 'beforeSel captured');
  expect(entry.files.a.afterSel?.anchor === 6, 'afterSel captured');
  expect(entry.files.a.beforeLocal?.scrollTop === 120, 'beforeLocal captured');
  expect(entry.files.a.afterLocal?.scrollTop === 120, 'afterLocal captured');
}

// reconcileActiveFile preserves selection/local fields
{
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }],
    texts: { a: 'two-indented' },
    activeFileId: 'a',
  });
  const H = createEditHistory(adapter);
  H.pushEntry(normalizeEntry({
    id: 'e', kind: 'typing',
    files: {
      a: {
        before: 'one',
        after: 'two',
        beforeSel: { anchor: 1, head: 1 },
        afterSel: { anchor: 3, head: 3 },
        beforeLocal: { selection: { anchor: 1, head: 1 }, scrollTop: 50 },
      },
    },
    structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
  }));
  H.reconcileActiveFile('a', 'two-indented');
  const entry = H.getUndoStack()[0];
  expect(entry.files.a.after === 'two-indented', 'after text updated');
  expect(entry.files.a.beforeSel?.anchor === 1, 'beforeSel preserved');
  expect(entry.files.a.afterSel?.anchor === 3, 'afterSel preserved');
  expect(entry.files.a.beforeLocal?.scrollTop === 50, 'beforeLocal preserved');
}

// ⛔ Structural sides are TARGETS, not expectations. Undo goes to `before`.
// Inverted, undoing a delete restored the file but left its tab closed, and the
// tab reappeared on REDO instead. The old test asserted the file came back and
// never looked at the projection the user actually sees.
{
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }, { id: 'b', name: 'b.bel' }],
    texts: { a: 'AA', b: 'BB' },
    openFileIds: ['a', 'b'],
    activeFileId: 'b',
  });
  const H = createEditHistory(adapter);
  H.pushEntry(normalizeEntry({
    id: 'del', kind: 'file-delete',
    files: {},
    structural: {
      created: [],
      deleted: [{ id: 'b', name: 'b.bel', text: 'BB' }],
      cfg: {},
      openFileIds: { before: ['a', 'b'], after: ['a'] },
      activeFileId: { before: 'b', after: 'a' },
    },
  }));
  adapter.deleteFile('b');
  adapter.setOpenFileIds(['a']);
  adapter.setActiveFileId('a');

  expect(H.undo(), 'undo the delete');
  expect(adapter.getFileById('b'), 'file is back');
  expect(adapter.getOpenFileIds().join(',') === 'a,b', 'and its TAB is back');
  expect(adapter.getActiveFileId() === 'b', 'and it is the tab in front');

  expect(H.redo(), 'redo the delete');
  expect(!adapter.getFileById('b'), 'file gone again');
  expect(adapter.getOpenFileIds().join(',') === 'a', 'tab gone again');
  expect(adapter.getActiveFileId() === 'a', 'front tab follows');
}

// A cfg patch must apply, not validate against the side it is about to write.
const CFG_BEFORE = ['a.bel', ''].join(String.fromCharCode(10));
const CFG_AFTER = ['a.bel', 'b.bel', ''].join(String.fromCharCode(10));
{
  const adapter = mockAdapter({
    files: [{ id: 'c', name: 'demo.cfg' }, { id: 'a', name: 'a.bel' }],
    texts: { c: CFG_BEFORE, a: 'AA' },
    openFileIds: ['a'],
    activeFileId: 'a',
  });
  const H = createEditHistory(adapter);
  H.pushEntry(normalizeEntry({
    id: 'cfg', kind: 'file-create',
    files: {},
    structural: {
      created: [], deleted: [],
      cfg: { c: { before: CFG_BEFORE, after: CFG_AFTER } },
      openFileIds: null, activeFileId: null,
    },
  }));
  adapter.setFileText('c', CFG_AFTER);
  expect(H.undo(), 'undo the cfg change');
  expect(adapter.getFileText('c') === CFG_BEFORE, 'cfg reverted');
  expect(H.redo(), 'redo the cfg change');
  expect(adapter.getFileText('c') === CFG_AFTER, 'cfg re-applied');
}

// The session write is budgeted: an over-quota stack persists its newest steps
// instead of throwing and persisting nothing at all.
{
  const store = new Map();
  const sessionStorage = {
    setItem(k, v) {
      if (v.length > 200_000) throw new Error('QuotaExceededError');
      store.set(k, v);
    },
    getItem(k) { return store.get(k) ?? null; },
    removeItem(k) { store.delete(k); },
  };
  const big = 'x'.repeat(60_000);
  const adapter = mockAdapter({
    files: [{ id: 'a', name: 'a.bel' }],
    texts: { a: big },
    activeFileId: 'a',
  });
  adapter.sessionStorage = sessionStorage;
  const H = createEditHistory(adapter);
  for (let i = 0; i < 40; i += 1) {
    H.pushEntry(normalizeEntry({
      id: `e${i}`, kind: 'typing',
      files: { a: { before: big + i, after: big + (i + 1) } },
      structural: { created: [], deleted: [], cfg: {}, openFileIds: null, activeFileId: null },
    }));
  }
  H.flushPersist();
  const raw = store.get(SESSION_KEY_PREFIX + 'test-project');
  expect(raw, 'an over-quota stack still persists something');
  const parsed = JSON.parse(raw);
  expect(parsed.undo.length > 0, 'with entries in it');
  expect(parsed.undo.length < 40, 'but not all of them');
  expect(parsed.undo[parsed.undo.length - 1].id === 'e39', 'keeping the NEWEST steps');
}


// ── ⛔ A RENAME IS A STEP ──────────────────────────────────────────
// A rename keeps the id and changes the name, so NOTHING else in an entry can
// see it: the text is identical and the id is in both file lists. `diffWorkspace`
// therefore recorded nothing at all — and the Ctrl+Z a user presses to take a
// rename back reached PAST it and silently reverted their last edit while the
// rename stood. Measured in the browser before it was fixed.
{
  const adapter = mockAdapter({
    files: [{ id: 'f1', name: 'a.bel' }, { id: 'f2', name: 'keep.bel' }],
    texts: { f1: 'AAA', f2: 'KEEP' },
    activeFileId: 'f2',
  });
  const h = createEditHistory(adapter);

  const res = h.transact('file-rename', () => adapter.renameFile('f1', 'b.bel'), 'Rename');
  expect(res.ok && res.entry, 'a rename produces an entry at all');
  expect(res.entry.structural.renamed.length === 1, 'and the entry carries the rename');
  expect(res.entry.structural.renamed[0].before === 'a.bel'
    && res.entry.structural.renamed[0].after === 'b.bel', 'with both names');
  // ⛔ It must NOT be filed as a delete-and-create: the id survives, so the file
  // keeps its tab, its viewport and its place in every .cfg.
  expect(!res.entry.structural.created.length && !res.entry.structural.deleted.length,
    'a rename is not a delete plus a create');
  expect(adapter.getFileById('f1').name === 'b.bel', 'the rename happened');

  expect(h.undo(), 'undo runs');
  expect(adapter.getFileById('f1').name === 'a.bel', 'undo puts the name back');
  expect(adapter.getFileText('f1') === 'AAA', 'and does not touch the text');
  expect(adapter.getFileText('f2') === 'KEEP', 'or any other file');
  expect(h.redo(), 'redo runs');
  expect(adapter.getFileById('f1').name === 'b.bel', 'redo renames it again');
  expect(h.undo() && adapter.getFileById('f1').name === 'a.bel', 'and it is stable both ways');
}

// A rename entry is not a no-op, or it would be dropped on the next amend.
{
  const entry = normalizeEntry({
    id: newEntryId(), kind: 'file-rename', ts: Date.now(), files: {},
    structural: { created: [], deleted: [], renamed: [{ id: 'f1', before: 'a', after: 'b' }], cfg: {} },
  });
  const adapter = mockAdapter({ files: [{ id: 'f1', name: 'b' }], texts: { f1: '' }, activeFileId: 'f1' });
  const h = createEditHistory(adapter);
  h.pushEntry(entry);
  h.reconcileActiveFile('f1', '');
  expect(h.getUndoStack().length === 1, 'a rename-only entry survives an amend');
}

// ⛔ A rename is gated on the file EXISTING and nothing else. Renaming twice and
// undoing once is ordinary; refusing because the name in hand is not the one
// recorded would be the "project changed since that edit" dead end all over
// again, for an operation that only sets a string.
{
  const adapter = mockAdapter({ files: [{ id: 'f1', name: 'c.bel' }], texts: { f1: '' }, activeFileId: 'f1' });
  const h = createEditHistory(adapter);
  const entry = normalizeEntry({
    id: newEntryId(), kind: 'file-rename', ts: Date.now(), files: {},
    structural: { created: [], deleted: [], renamed: [{ id: 'f1', before: 'a.bel', after: 'b.bel' }], cfg: {} },
  });
  expect(h.validateEntry(entry, 'undo').ok, 'a third name in hand does not block the undo');
  const gone = normalizeEntry({
    id: newEntryId(), kind: 'file-rename', ts: Date.now(), files: {},
    structural: { created: [], deleted: [], renamed: [{ id: 'nope', before: 'a', after: 'b' }], cfg: {} },
  });
  expect(!h.validateEntry(gone, 'undo').ok, 'but a file that is gone does');
}

console.log('OK edit-history (including renames)');
