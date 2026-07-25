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

// precondition refusal
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
  expect(!H.undo(), 'refuse when drifted');
  expect(adapter.getFileText('a') === 'drift', 'no mutation on refuse');
  expect(H.canUndo(), 'stack unchanged');
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

// undo → edit during markNonUndoable window → undo (post-undo edits must be historied)
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

  H.markNonUndoable(5000);
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
  expect(editor._viewport?.scrollTop === 240, 'viewport restored for typing undo');
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
  expect(editor._viewport?.selection?.anchor === 1, 'viewport reveal applied for non-format kind');
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

console.log('OK edit-history');
