import { EditorView } from '@codemirror/view';
import { Annotation, Transaction } from '@codemirror/state';
import { historyField } from '@codemirror/commands';

export const EDIT_HISTORY_CAP = 100;
export const SESSION_KEY_PREFIX = 'beljar-edit-history-v1:';
export const TYPING_GROUP_MS = 150;

export const editHistoryTxn = Annotation.define();

function emptyStructural() {
  return {
    created: [],
    deleted: [],
    cfg: {},
    openFileIds: null,
    activeFileId: null,
  };
}

export function newEntryId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const files = raw.files && typeof raw.files === 'object' ? raw.files : {};
  const structural = raw.structural && typeof raw.structural === 'object'
    ? {
      created: Array.isArray(raw.structural.created) ? raw.structural.created : [],
      deleted: Array.isArray(raw.structural.deleted) ? raw.structural.deleted : [],
      cfg: raw.structural.cfg && typeof raw.structural.cfg === 'object' ? raw.structural.cfg : {},
      openFileIds: raw.structural.openFileIds ?? null,
      activeFileId: raw.structural.activeFileId ?? null,
    }
    : emptyStructural();
  return {
    id: typeof raw.id === 'string' ? raw.id : newEntryId(),
    kind: typeof raw.kind === 'string' ? raw.kind : 'edit',
    label: typeof raw.label === 'string' ? raw.label : undefined,
    ts: typeof raw.ts === 'number' ? raw.ts : Date.now(),
    files,
    structural,
    editorLocal: raw.editorLocal && typeof raw.editorLocal === 'object' ? raw.editorLocal : {},
  };
}

function fileIdsOf(entry) {
  return Object.keys(entry.files || {});
}

function listsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function captureOpenIds(adapter) {
  return adapter.getOpenFileIds?.() ?? null;
}

function captureActiveId(adapter) {
  return adapter.getActiveFileId?.() ?? null;
}

function readFileText(adapter, fileId, preferEditor) {
  const ed = preferEditor ? adapter.getActiveEditor?.() : null;
  const activeId = ed?.getCurrentFileId?.() ?? adapter.getActiveFileId?.();
  if (preferEditor && ed && activeId === fileId && typeof ed.getValue === 'function') {
    return String(ed.getValue() ?? '');
  }
  return String(adapter.getFileText?.(fileId) ?? '');
}

function structuralSide(entry, direction) {
  const s = entry.structural || emptyStructural();
  const undo = direction === 'undo';
  return {
    created: undo ? s.created : s.deleted,
    deleted: undo ? s.deleted : s.created,
    cfgTarget: (fileId) => {
      const patch = s.cfg[fileId];
      if (!patch) return null;
      return undo ? patch.after : patch.before;
    },
    cfgExpect: (fileId) => {
      const patch = s.cfg[fileId];
      if (!patch) return null;
      return undo ? patch.after : patch.before;
    },
    openFileIds: s.openFileIds
      ? (undo ? s.openFileIds.after : s.openFileIds.before)
      : null,
    openFileIdsExpect: s.openFileIds
      ? (undo ? s.openFileIds.after : s.openFileIds.before)
      : null,
    activeFileId: s.activeFileId
      ? (undo ? s.activeFileId.after : s.activeFileId.before)
      : null,
    activeFileIdExpect: s.activeFileId
      ? (undo ? s.activeFileId.after : s.activeFileId.before)
      : null,
  };
}

function fileTextSide(entry, fileId, direction) {
  const rec = entry.files[fileId];
  if (!rec) return null;
  return direction === 'undo' ? rec.before : rec.after;
}

function selectionSnapshot(view, state = null) {
  const st = state ?? view?.state;
  if (!st?.selection?.main) return null;
  const s = st.selection.main;
  return { anchor: s.anchor, head: s.head };
}

function clampSelection(sel, len) {
  if (!sel || !isFinite(sel.anchor) || !isFinite(sel.head)) {
    return { anchor: len, head: len };
  }
  return {
    anchor: Math.max(0, Math.min(sel.anchor, len)),
    head: Math.max(0, Math.min(sel.head, len)),
  };
}

function isViewportLocal(local) {
  return !!(local && typeof local === 'object'
    && (local.selection || isFinite(local.scrollTop) || local.viewportAnchor || local.centerLine != null));
}

function selectionForFile(rec, direction, len) {
  if (!rec) return clampSelection(null, len);
  const local = direction === 'undo' ? rec.beforeLocal : rec.afterLocal;
  if (local?.selection) return clampSelection(local.selection, len);
  const raw = direction === 'undo' ? rec.beforeSel : rec.afterSel;
  return clampSelection(raw, len);
}

function viewportLocalForFile(rec, direction, entry, fileId) {
  if (rec) {
    const side = direction === 'undo' ? rec.beforeLocal : rec.afterLocal;
    if (isViewportLocal(side)) return side;
  }
  const legacy = entry?.editorLocal?.[fileId];
  if (isViewportLocal(legacy)) return legacy;
  return null;
}

function captureAdapterViewport(adapter) {
  return adapter.captureViewport?.() ?? null;
}

function captureAdapterSelection(adapter) {
  const local = captureAdapterViewport(adapter);
  if (local?.selection) return { ...local.selection };
  return adapter.captureSelection?.() ?? null;
}

function enrichFileRecord(rec, snaps) {
  if (!rec || !snaps) return;
  if (snaps.beforeSel) rec.beforeSel = snaps.beforeSel;
  if (snaps.afterSel) rec.afterSel = snaps.afterSel;
  if (isViewportLocal(snaps.beforeLocal)) rec.beforeLocal = snaps.beforeLocal;
  if (isViewportLocal(snaps.afterLocal)) rec.afterLocal = snaps.afterLocal;
}

function enrichEntryActiveFile(entry, adapter, snaps) {
  if (!entry?.files || !snaps) return entry;
  const activeId = captureActiveId(adapter);
  const ids = Object.keys(entry.files);
  const targetId = (activeId && entry.files[activeId])
    ? activeId
    : (ids.length === 1 ? ids[0] : null);
  if (!targetId) return entry;
  enrichFileRecord(entry.files[targetId], snaps);
  return entry;
}

function fileTextExpect(entry, fileId, direction) {
  const rec = entry.files[fileId];
  if (!rec) return null;
  return direction === 'undo' ? rec.after : rec.before;
}

function entryTouchesFile(entry, fileId) {
  if (entry.files[fileId]) return true;
  const s = entry.structural || emptyStructural();
  if (s.cfg[fileId]) return true;
  if (s.created.some((f) => f.id === fileId)) return true;
  if (s.deleted.some((f) => f.id === fileId)) return true;
  return false;
}

function validateEntry(adapter, entry, direction) {
  const side = structuralSide(entry, direction);
  const s = entry.structural || emptyStructural();
  const deletedAfterIds = new Set(s.deleted.map((f) => f.id));
  const createdAfterIds = new Set(s.created.map((f) => f.id));

  for (const fileId of fileIdsOf(entry)) {
    const expect = fileTextExpect(entry, fileId, direction);
    if (expect == null) continue;
    const exists = !!adapter.getFileById?.(fileId);
    if (direction === 'undo' && deletedAfterIds.has(fileId)) {
      if (exists) return { ok: false, reason: `still-present:${fileId}` };
      continue;
    }
    if (direction === 'redo' && createdAfterIds.has(fileId)) {
      if (!exists) return { ok: false, reason: `missing-created:${fileId}` };
      const cur = readFileText(adapter, fileId, true);
      if (cur !== expect) return { ok: false, reason: `text-mismatch:${fileId}` };
      continue;
    }
    if (!exists) return { ok: false, reason: `missing-file:${fileId}` };
    const cur = readFileText(adapter, fileId, true);
    if (cur !== expect) return { ok: false, reason: `text-mismatch:${fileId}` };
  }

  for (const f of side.created) {
    if (!adapter.getFileById?.(f.id)) {
      return { ok: false, reason: `missing-created:${f.id}` };
    }
  }
  for (const f of side.deleted) {
    if (adapter.getFileById?.(f.id)) {
      return { ok: false, reason: `still-present:${f.id}` };
    }
  }

  for (const fileId of Object.keys(entry.structural?.cfg || {})) {
    const expect = side.cfgExpect(fileId);
    if (expect == null) continue;
    if (!adapter.getFileById?.(fileId)) {
      return { ok: false, reason: `missing-cfg:${fileId}` };
    }
    const cur = readFileText(adapter, fileId, true);
    if (cur !== expect) {
      return { ok: false, reason: `cfg-mismatch:${fileId}` };
    }
  }

  if (side.openFileIdsExpect != null) {
    const curOpen = captureOpenIds(adapter);
    if (!listsEqual(curOpen, side.openFileIdsExpect)) {
      return { ok: false, reason: 'open-tabs-mismatch' };
    }
  }

  if (side.activeFileIdExpect != null) {
    const curActive = captureActiveId(adapter);
    if (curActive !== side.activeFileIdExpect) {
      return { ok: false, reason: 'active-file-mismatch' };
    }
  }

  return { ok: true };
}

function snapshotWorkspace(adapter) {
  const files = {};
  for (const f of adapter.listFiles?.() ?? []) {
    files[f.id] = readFileText(adapter, f.id, true);
  }
  return {
    files,
    openFileIds: captureOpenIds(adapter),
    activeFileId: captureActiveId(adapter),
    fileRecords: (adapter.listFiles?.() ?? []).map((f) => ({ id: f.id, name: f.name })),
  };
}

function diffWorkspace(before, after, kind, label) {
  const files = {};
  const allIds = new Set([
    ...Object.keys(before.files),
    ...Object.keys(after.files),
  ]);
  for (const id of allIds) {
    const b = before.files[id];
    const a = after.files[id];
    if (b === a) continue;
    if (b != null && a != null) files[id] = { before: b, after: a };
  }

  const beforeRec = new Map(before.fileRecords.map((f) => [f.id, f]));
  const afterRec = new Map(after.fileRecords.map((f) => [f.id, f]));
  const structural = emptyStructural();
  for (const [id, rec] of afterRec) {
    if (!beforeRec.has(id)) {
      structural.created.push({ id: rec.id, name: rec.name, text: after.files[id] ?? '' });
    }
  }
  for (const [id, rec] of beforeRec) {
    if (!afterRec.has(id)) {
      structural.deleted.push({ id: rec.id, name: rec.name, text: before.files[id] ?? '' });
    }
  }

  if (!listsEqual(before.openFileIds, after.openFileIds)) {
    structural.openFileIds = { before: before.openFileIds, after: after.openFileIds };
  }
  if (before.activeFileId !== after.activeFileId) {
    structural.activeFileId = { before: before.activeFileId, after: after.activeFileId };
  }

  const hasFiles = Object.keys(files).length > 0;
  const hasStruct = structural.created.length || structural.deleted.length
    || Object.keys(structural.cfg).length
    || structural.openFileIds || structural.activeFileId;
  if (!hasFiles && !hasStruct) return null;

  return normalizeEntry({
    id: newEntryId(),
    kind,
    label,
    ts: Date.now(),
    files,
    structural,
    editorLocal: {},
  });
}

export function createEditHistory(adapter) {
  let undoStack = [];
  let redoStack = [];
  let openEntry = null;
  let typingGroup = null;
  let typingTimer = null;
  let nonUndoableUntil = 0;
  let applying = false;

  function persistStack() {
    const store = adapter.sessionStorage;
    if (!store || !adapter.projectKey) return;
    try {
      const key = SESSION_KEY_PREFIX + adapter.projectKey;
      store.setItem(key, JSON.stringify({ undo: undoStack, redo: redoStack }));
    } catch (_) { /* quota */ }
  }

  function loadStack() {
    const store = adapter.sessionStorage;
    if (!store || !adapter.projectKey) return;
    try {
      const raw = store.getItem(SESSION_KEY_PREFIX + adapter.projectKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      undoStack = Array.isArray(parsed.undo)
        ? parsed.undo.map(normalizeEntry).filter(Boolean)
        : [];
      redoStack = Array.isArray(parsed.redo)
        ? parsed.redo.map(normalizeEntry).filter(Boolean)
        : [];
    } catch (_) {
      undoStack = [];
      redoStack = [];
    }
  }

  function trimStack() {
    if (undoStack.length > EDIT_HISTORY_CAP) {
      undoStack = undoStack.slice(undoStack.length - EDIT_HISTORY_CAP);
    }
  }

  function toast(msg, kind = 'error') {
    adapter.toast?.(msg, kind);
  }

  function markNonUndoable(ms = 800) {
    nonUndoableUntil = Date.now() + ms;
  }

  function isNonUndoable() {
    return Date.now() < nonUndoableUntil || applying;
  }

  function flushTypingGroup() {
    if (typingTimer) {
      clearTimeout(typingTimer);
      typingTimer = null;
    }
    if (!typingGroup) return;
    const g = typingGroup;
    typingGroup = null;
    // Materialize the before/after strings HERE (once per typing burst, ~150ms
    // after the last key), never per-keystroke. `beforeDoc`/`view` hold cheap
    // references to CM Text objects; stringifying is deferred off the input path.
    const before = g.before != null
      ? g.before
      : (g.beforeDoc ? g.beforeDoc.toString() : readFileText(adapter, g.fileId, true));
    const after = g.pendingAfter != null
      ? g.pendingAfter
      : (g.view?.state?.doc ? g.view.state.doc.toString() : readFileText(adapter, g.fileId, true));
    if (before === after) return;
    const afterLocal = g.afterLocal ?? captureAdapterViewport(adapter);
    const entry = normalizeEntry({
      id: newEntryId(),
      kind: 'typing',
      ts: Date.now(),
      files: {
        [g.fileId]: {
          before,
          after,
          beforeSel: g.beforeSel ?? null,
          afterSel: g.afterSel ?? g.beforeSel ?? null,
          beforeLocal: g.beforeLocal ?? null,
          afterLocal: afterLocal ?? null,
        },
      },
      structural: emptyStructural(),
      editorLocal: {},
    });
    pushEntry(entry);
    adapter.flushCheckpoint?.();
  }

  function scheduleTypingFlush() {
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(flushTypingGroup, TYPING_GROUP_MS);
  }

  function pushEntry(entry) {
    if (!entry) return false;
    undoStack.push(entry);
    redoStack = [];
    trimStack();
    persistStack();
    adapter.onStackChange?.();
    return true;
  }

  function beginEntry(kind, label, snaps = null) {
    flushTypingGroup();
    const beforeLocal = snaps?.beforeLocal ?? captureAdapterViewport(adapter);
    const beforeSel = snaps?.beforeSel
      ?? (beforeLocal?.selection ? { ...beforeLocal.selection } : null)
      ?? captureAdapterSelection(adapter);
    openEntry = {
      kind: kind || 'edit',
      label,
      filesBefore: {},
      structuralBefore: null,
      editorLocalBefore: {},
      beforeSel,
      beforeLocal,
      activeFileIdAtStart: captureActiveId(adapter),
    };
  }

  function touchFile(fileId) {
    if (!openEntry || !fileId) return;
    if (!(fileId in openEntry.filesBefore)) {
      openEntry.filesBefore[fileId] = readFileText(adapter, fileId, true);
    }
  }

  function recordCfgBefore(fileId) {
    if (!openEntry || !fileId) return;
    if (!openEntry.structuralBefore) {
      openEntry.structuralBefore = {
        openFileIds: captureOpenIds(adapter),
        activeFileId: captureActiveId(adapter),
        fileRecords: (adapter.listFiles?.() ?? []).map((f) => ({ id: f.id, name: f.name })),
        cfg: {},
      };
    }
    if (!(fileId in openEntry.structuralBefore.cfg)) {
      openEntry.structuralBefore.cfg[fileId] = readFileText(adapter, fileId, true);
    }
  }

  function captureStructuralBefore() {
    if (!openEntry) return;
    if (!openEntry.structuralBefore) {
      openEntry.structuralBefore = {
        openFileIds: captureOpenIds(adapter),
        activeFileId: captureActiveId(adapter),
        fileRecords: (adapter.listFiles?.() ?? []).map((f) => ({ id: f.id, name: f.name })),
        cfg: {},
      };
    }
  }

  function commitEntry(extra = {}) {
    if (!openEntry) return false;
    const beforeSnap = {
      files: { ...openEntry.filesBefore },
      openFileIds: openEntry.structuralBefore?.openFileIds ?? captureOpenIds(adapter),
      activeFileId: openEntry.structuralBefore?.activeFileId ?? captureActiveId(adapter),
      fileRecords: openEntry.structuralBefore?.fileRecords
        ?? (adapter.listFiles?.() ?? []).map((f) => ({ id: f.id, name: f.name })),
    };
    for (const [fileId, text] of Object.entries(openEntry.structuralBefore?.cfg || {})) {
      if (!(fileId in beforeSnap.files)) beforeSnap.files[fileId] = text;
    }
    for (const id of Object.keys(openEntry.filesBefore)) {
      if (!(id in beforeSnap.files)) {
        beforeSnap.files[id] = openEntry.filesBefore[id];
      }
    }

    const afterSnap = snapshotWorkspace(adapter);
    const beforeSnaps = {
      beforeSel: openEntry.beforeSel ?? null,
      beforeLocal: openEntry.beforeLocal ?? null,
    };
    const afterLocal = extra.afterLocal ?? captureAdapterViewport(adapter);
    const afterSel = extra.afterSel
      ?? (afterLocal?.selection ? { ...afterLocal.selection } : null)
      ?? captureAdapterSelection(adapter);
    const entry = diffWorkspace(beforeSnap, afterSnap, openEntry.kind, openEntry.label);
    openEntry = null;
    if (!entry) return false;
    if (extra.editorLocal) entry.editorLocal = extra.editorLocal;
    enrichEntryActiveFile(entry, adapter, {
      ...beforeSnaps,
      afterSel,
      afterLocal,
    });
    return pushEntry(entry);
  }

  function cancelEntry() {
    openEntry = null;
  }

  function transact(kind, fn, label) {
    flushTypingGroup();
    const beforeLocal = captureAdapterViewport(adapter);
    const beforeSel = beforeLocal?.selection
      ? { ...beforeLocal.selection }
      : captureAdapterSelection(adapter);
    const before = snapshotWorkspace(adapter);
    let result;
    try {
      result = fn();
    } catch (err) {
      toast(`Edit failed — ${err?.message || 'unknown error'}`);
      return { ok: false, error: err };
    }
    const after = snapshotWorkspace(adapter);
    const afterLocal = captureAdapterViewport(adapter);
    const afterSel = afterLocal?.selection
      ? { ...afterLocal.selection }
      : captureAdapterSelection(adapter);
    const entry = diffWorkspace(before, after, kind, label);
    if (entry) {
      enrichEntryActiveFile(entry, adapter, {
        beforeSel,
        beforeLocal,
        afterSel,
        afterLocal,
      });
      pushEntry(entry);
    }
    return { ok: true, result, entry };
  }

  function applyWorkspacePatch(entry, direction, rollback) {
    const side = structuralSide(entry, direction);
    const touchedActive = new Set();
    const activeId = adapter.getActiveFileId?.();
    const ed = adapter.getActiveEditor?.();

    for (const f of side.deleted) {
      if (!adapter.restoreDeletedFile?.(f.id, f.name, f.text)) {
        throw new Error(`Could not restore ${f.name}`);
      }
      rollback.deleted.push(f.id);
    }

    for (const f of side.created) {
      const cur = adapter.getFileById?.(f.id);
      if (!cur) throw new Error(`Missing file ${f.id}`);
      rollback.files[f.id] = readFileText(adapter, f.id, true);
      rollback.fileRecords.push({ id: f.id, name: cur.name });
      if (!adapter.deleteFile?.(f.id)) throw new Error(`Could not remove ${cur.name}`);
      rollback.removed.push(f.id);
    }

    for (const fileId of Object.keys(entry.structural?.cfg || {})) {
      const target = side.cfgTarget(fileId);
      if (target == null) continue;
      rollback.files[fileId] = readFileText(adapter, fileId, true);
      adapter.setFileText?.(fileId, target);
      touchedActive.add(fileId);
    }

    for (const fileId of fileIdsOf(entry)) {
      const target = fileTextSide(entry, fileId, direction);
      if (target == null) continue;
      rollback.files[fileId] = readFileText(adapter, fileId, fileId === activeId);
      if (fileId === activeId && ed) {
        touchedActive.add(fileId);
      } else {
        adapter.setFileText?.(fileId, target);
        touchedActive.add(fileId);
      }
    }

    if (side.openFileIds != null && adapter.setOpenFileIds) {
      rollback.openFileIds = captureOpenIds(adapter);
      adapter.setOpenFileIds(side.openFileIds);
    }

    if (side.activeFileId != null && adapter.setActiveFileId) {
      rollback.activeFileId = captureActiveId(adapter);
      adapter.setActiveFileId(side.activeFileId);
    }

    if (ed && activeId && touchedActive.has(activeId)) {
      const target = fileTextSide(entry, activeId, direction);
      if (target == null) return true;
      const len = target.length;
      const rec = entry.files[activeId];
      const viewportLocal = viewportLocalForFile(rec, direction, entry, activeId);
      let sel = selectionForFile(rec, direction, len);
      if (viewportLocal?.selection) {
        sel = clampSelection(viewportLocal.selection, len);
      }
      const ue = direction === 'undo' ? 'undo' : 'redo';
      const replaceOpts = {
        userEvent: ue,
        selection: sel,
        scrollIntoView: true,
      };
      if (typeof ed.replaceDocumentNonUndoable === 'function') {
        ed.replaceDocumentNonUndoable(target, replaceOpts);
      } else {
        markNonUndoable();
        ed.setValueNonUndoable?.(target, replaceOpts)
          ?? ed.setValue?.(target);
      }
      adapter.syncActiveEditorCheckpoint?.(ed.getValue?.() ?? target);
      if (ed.applyViewport) {
        const localToApply = isViewportLocal(viewportLocal)
          ? { ...viewportLocal, selection: sel }
          : { selection: sel };
        if (typeof ed.getValue !== 'function' || ed.getValue() === target) {
          ed.applyViewport(localToApply);
        }
      }
    }

    return true;
  }

  function rollbackPatch(rollback) {
    for (const id of rollback.removed) {
      const rec = rollback.fileRecords.find((f) => f.id === id);
      const text = rollback.files[id];
      if (rec) adapter.restoreDeletedFile?.(rec.id, rec.name, text ?? '');
    }
    for (const id of rollback.deleted) {
      adapter.deleteFile?.(id);
    }
    for (const [fileId, text] of Object.entries(rollback.files)) {
      if (adapter.getFileById?.(fileId)) adapter.setFileText?.(fileId, text);
    }
    if (rollback.openFileIds != null && adapter.setOpenFileIds) {
      adapter.setOpenFileIds(rollback.openFileIds);
    }
    if (rollback.activeFileId != null && adapter.setActiveFileId) {
      adapter.setActiveFileId(rollback.activeFileId);
    }
  }

  function applyStackEntry(direction) {
    flushTypingGroup();
    const stack = direction === 'undo' ? undoStack : redoStack;
    const other = direction === 'undo' ? redoStack : undoStack;
    if (!stack.length) return false;

    const entry = stack[stack.length - 1];
    const check = validateEntry(adapter, entry, direction);
    if (!check.ok) {
      toast("Can't undo — the project changed since that edit.");
      return false;
    }

    applying = true;
    markNonUndoable(2000);
    const rollback = { files: {}, deleted: [], removed: [], fileRecords: [], openFileIds: null, activeFileId: null };
    try {
      applyWorkspacePatch(entry, direction, rollback);
    } catch (err) {
      rollbackPatch(rollback);
      toast("Can't undo — the project changed since that edit.");
      applying = false;
      return false;
    }

    stack.pop();
    other.push(entry);
    persistStack();
    applying = false;
    adapter.onStackChange?.();
    adapter.onApplied?.(entry, direction);
    return true;
  }

  function onDocChange(view, update, fileId) {
    if (!update.docChanged || !fileId || openEntry || applying) return;
    if (update.transactions.some((tr) => {
      if (tr.annotation(Transaction.addToHistory) === false) return true;
      if (tr.annotation(editHistoryTxn)) return true;
      const ue = tr.annotation(Transaction.userEvent);
      return ue === 'undo' || ue === 'redo';
    })) return;

    // No toString() on the keystroke path: hold cheap references to the live
    // view (for the final "after") and the burst's starting doc (for "before").
    // Both are stringified once in flushTypingGroup, ~150ms after typing stops.
    if (typingGroup && typingGroup.fileId === fileId) {
      typingGroup.view = view;
      typingGroup.pendingAfter = null;
      typingGroup.afterSel = selectionSnapshot(view);
      typingGroup.afterLocal = null;
      scheduleTypingFlush();
      return;
    }

    flushTypingGroup();
    typingGroup = {
      fileId,
      view,
      before: null,
      beforeDoc: update.startState.doc,
      pendingAfter: null,
      beforeSel: selectionSnapshot(view, update.startState),
      afterSel: selectionSnapshot(view),
      beforeLocal: captureAdapterViewport(adapter),
      afterLocal: null,
    };
    scheduleTypingFlush();
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  function undo() { return applyStackEntry('undo'); }
  function redo() { return applyStackEntry('redo'); }

  function reconcileActiveFile(fileId, text) {
    if (!fileId || text == null) return;
    if (typingGroup?.fileId === fileId) typingGroup.pendingAfter = text;
    if (!undoStack.length) return;
    const entry = undoStack[undoStack.length - 1];
    const rec = entry.files?.[fileId];
    if (!rec || rec.after === text) return;
    entry.files[fileId] = {
      before: rec.before,
      after: text,
      beforeSel: rec.beforeSel,
      afterSel: rec.afterSel,
      beforeLocal: rec.beforeLocal,
      afterLocal: rec.afterLocal,
    };
    persistStack();
  }

  function swapProject(projectKey) {
    flushTypingGroup();
    adapter.projectKey = projectKey;
    loadStack();
    adapter.onStackChange?.();
  }

  loadStack();

  return {
    beginEntry,
    touchFile,
    recordCfgBefore,
    captureStructuralBefore,
    commitEntry,
    cancelEntry,
    transact,
    pushEntry,
    flushTypingGroup,
    reconcileActiveFile,
    flushCheckpoint: () => adapter.flushCheckpoint?.(),
    onDocChange,
    markNonUndoable,
    isNonUndoable,
    isApplying: () => applying,
    canUndo,
    canRedo,
    undo,
    redo,
    swapProject,
    getUndoStack: () => undoStack.slice(),
    getRedoStack: () => redoStack.slice(),
    validateEntry: (entry, direction) => validateEntry(adapter, entry, direction),
    applyEntryForTest: (entry, direction) => {
      const check = validateEntry(adapter, entry, direction);
      if (!check.ok) return false;
      applying = true;
      const rollback = { files: {}, deleted: [], removed: [], fileRecords: [], openFileIds: null, activeFileId: null };
      try {
        applyWorkspacePatch(entry, direction, rollback);
      } catch (_) {
        rollbackPatch(rollback);
        applying = false;
        return false;
      }
      applying = false;
      return true;
    },
  };
}

export function editHistoryKeymap() {
  return [
    {
      key: 'Mod-z',
      run: (view) => {
        const H = globalRef().EditHistory;
        if (H?.undo()) return true;
        return false;
      },
    },
    {
      key: 'Mod-y',
      mac: 'Mod-Shift-z',
      run: (view) => {
        const H = globalRef().EditHistory;
        if (H?.redo()) return true;
        return false;
      },
    },
  ];
}

function globalRef() {
  return typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
}

export function dispatchEdit(view, spec, meta = {}) {
  const H = globalRef().EditHistory;
  const fileId = meta.fileId;
  const beforeSel = selectionSnapshot(view);
  const beforeLocal = typeof view?.scrollDOM !== 'undefined'
    ? (() => {
      try {
        const scroller = view.scrollDOM;
        const sel = view.state.selection.main;
        return {
          selection: { anchor: sel.anchor, head: sel.head },
          scrollTop: scroller.scrollTop,
          scrollLeft: scroller.scrollLeft,
        };
      } catch (_) {
        return null;
      }
    })()
    : null;
  if (H && fileId && meta.kind) {
    H.flushTypingGroup();
    H.beginEntry(meta.kind, meta.label, { beforeSel, beforeLocal });
    H.touchFile(fileId);
    if (meta.touchFiles) for (const id of meta.touchFiles) H.touchFile(id);
    if (meta.captureStructural) H.captureStructuralBefore();
  }

  const anns = [...(spec.annotations || [])];
  if (meta.nonHistory) anns.push(Transaction.addToHistory.of(false));
  if (meta.editHistory !== false) anns.push(editHistoryTxn.of(true));

  view.dispatch({
    ...spec,
    userEvent: meta.userEvent ?? spec.userEvent,
    annotations: anns.length ? anns : undefined,
  });

  if (meta.followUp) {
    const fu = meta.followUp(view);
    if (fu) {
      view.dispatch({
        ...fu,
        annotations: [
          ...(fu.annotations || []),
          editHistoryTxn.of(true),
          ...(meta.nonHistory ? [Transaction.addToHistory.of(false)] : []),
        ],
      });
    }
  }

  if (H && fileId && meta.kind) {
    const afterSel = selectionSnapshot(view);
    let afterLocal = null;
    try {
      const scroller = view.scrollDOM;
      const sel = view.state.selection.main;
      afterLocal = {
        selection: { anchor: sel.anchor, head: sel.head },
        scrollTop: scroller.scrollTop,
        scrollLeft: scroller.scrollLeft,
      };
    } catch (_) { /* ignore */ }
    if (isViewportLocal(meta.editorLocal)) {
      afterLocal = { ...afterLocal, ...meta.editorLocal };
      if (!afterLocal.selection && afterSel) afterLocal.selection = afterSel;
    }
    const extra = { afterSel, afterLocal };
    if (meta.editorLocal) extra.editorLocal = { [fileId]: meta.editorLocal };
    H.commitEntry(extra);
  }
}

export function editHistoryListener(fileId) {
  return EditorView.updateListener.of((update) => {
    const H = globalRef().EditHistory;
    if (!H || !fileId) return;
    H.onDocChange(update.view, update, fileId);
  });
}

export function clearCmHistory(view) {
  try {
    const json = view.state.toJSON({ history: historyField });
    delete json.history;
    // noop — CM history stays but BelJar stack is authoritative
  } catch (_) { /* ignore */ }
}
