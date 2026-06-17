// Inline rename (F2): edit the declaration; references sync in the document on each keystroke.

import { EditorView, ViewPlugin, keymap, Decoration } from '@codemirror/view';
import { EditorState, Prec, RangeSetBuilder, StateEffect, StateField, Transaction, Annotation } from '@codemirror/state';
import { getEngine, navInfoAt, crossFileDefinitionAt } from './bel-ide-actions.mjs';
import { scrollIntoViewCenter } from './bel-viewport.mjs';
import {
  defsOf, usesOf, groupDefinesName, groupRenameEdits, applyTextEdits, groupReferencesFor,
} from './project-prelude.mjs';

const setRenameSession = StateEffect.define();
const renameSync = Annotation.define();
const renameInternal = Annotation.define();

function mapRanges(ranges, changes) {
  return ranges.map((r) => ({
    from: changes.mapPos(r.from, 1),
    to: changes.mapPos(r.to, -1),
  }));
}

const renameSessionField = StateField.define({
  create: () => null,
  update(session, tr) {
    for (const e of tr.effects) {
      if (e.is(setRenameSession)) return e.value;
    }
    if (!session || !tr.docChanged) return session;
    return {
      ...session,
      anchorFrom: tr.changes.mapPos(session.anchorFrom, -1),
      anchorTo: tr.changes.mapPos(session.anchorTo, 1),
      refRanges: mapRanges(session.refRanges || [], tr.changes),
    };
  },
});

const renameMark = Decoration.mark({ class: 'cm-bel-rename-active' });
const renameInvalidMark = Decoration.mark({ class: 'cm-bel-rename-active is-invalid' });

const VALID_IDENT = /^[^\s()[\]{}.,;:%|"\\]+$/;

function showRenameToast(message, kind) {
  const T = typeof window !== 'undefined' ? window.BelJarToasts : null;
  if (!T) return;
  const k = typeof kind === 'string' ? kind : 'info';
  if (k === 'error' && T.error) T.error(message);
  else if (k === 'warn' && T.warn) T.warn(message);
  else if (k === 'success' && T.success) T.success(message);
  else if (k === 'info' && T.info) T.info(message);
  else if (T.show) T.show(message, { kind: k });
}

function persistEnv() {
  const g = typeof window !== 'undefined'
    ? window
    : (typeof self !== 'undefined' ? self : null);
  if (!g) return null;
  const P = g.BelJarPersist;
  if (!P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') return null;
  return { g, P };
}

// Would `trimmed` collide with a definition elsewhere in the project group
// (or, for cross-file sessions where the engine isn't consulted, with a
// definition in this document)?
function groupConflict(view, session, trimmed) {
  const env = persistEnv();
  if (!env) return false;
  try {
    const files = env.P.listFiles();
    const activeId = env.P.getActiveFileId();
    if (groupDefinesName(files, activeId, trimmed, (id) => env.P.getFileText(id))) return true;
    if (session.crossFile) {
      return defsOf(view.state.doc.toString()).some((d) => d.name === trimmed);
    }
  } catch (_) { /* conflict check is best-effort */ }
  return false;
}

// Is `trimmed` an acceptable target name for this rename session? Shared by the
// live preview and by conflict-aware suggestion (which probes candidate names).
function evaluateName(view, session, trimmed) {
  if (trimmed === session.originalName) return true;
  if (!trimmed) return false;

  const conflict = groupConflict(view, session, trimmed);

  if (session.crossFile) return VALID_IDENT.test(trimmed) && !conflict;

  const eng = getEngine(view);
  const preview = eng && typeof eng.renamePreview === 'function'
    ? eng.renamePreview(session.symbolId, trimmed)
    : { ok: false, reason: 'no-semantic-snapshot' };

  return resolveRenameOk(session, trimmed, preview, conflict);
}

function previewState(view, session) {
  const draft = view.state.doc.sliceString(session.anchorFrom, session.anchorTo);
  const trimmed = draft.trim();
  return { draft, trimmed, ok: evaluateName(view, session, trimmed) };
}

// First free name near `base`: a primed variant (idiomatic in Beluga), then
// base1, base2, … `isTaken(candidate)` reports whether a candidate is invalid or
// already in use. Returns null if nothing is free within `limit`.
export function suggestRenameName(base, isTaken, limit = 50) {
  if (!base) return null;
  const prime = `${base}'`;
  if (!isTaken(prime)) return prime;
  for (let i = 1; i <= limit; i++) {
    const candidate = `${base}${i}`;
    if (!isTaken(candidate)) return candidate;
  }
  return null;
}

// One-line preview of a rename's reach: occurrences in this file plus, when the
// symbol is global, occurrences across the rest of the suite.
export function renamePreviewMessage(name, here, group) {
  const occ = (n) => `${n} occurrence${n === 1 ? '' : 's'}`;
  let msg = `Renaming "${name}" — ${occ(here)} here`;
  if (group > 0) msg += `, ${occ(group)} across the suite`;
  return `${msg}.`;
}

export function renameReachTooltip(total) {
  if (!total || total < 1) return '';
  return `${total} occurrence${total === 1 ? '' : 's'} across the suite`;
}

// How many occurrences of the renamed name live in the rest of the group.
function countGroupReferences(name, crossFile) {
  const env = persistEnv();
  if (!env) return 0;
  try {
    const opts = crossFile ? { defFileId: crossFile.defFileId } : {};
    return groupReferencesFor(
      env.P.listFiles(), env.P.getActiveFileId(), name,
      (id) => env.P.getFileText(id), opts,
    ).length;
  } catch (_) {
    return 0;
  }
}

// Suite-wide occurrence count for a rename at `pos` (context-menu preview).
export function renameReachAt(view, pos) {
  const at = pos ?? view.state.selection.main.head;
  const nav = navInfoAt(view, at);
  if (nav && nav.symbolId && nav.nameRange) {
    const { from } = nav.nameRange;
    const eng = getEngine(view);
    const preview = eng && typeof eng.renamePreview === 'function'
      ? eng.renamePreview(nav.symbolId, nav.name || '')
      : null;
    const refCount = preview && preview.ok
      ? preview.edits.filter((e) => e.from !== from).length
      : 0;
    const here = 1 + refCount;
    const sym = eng && eng.getSnapshot && eng.getSnapshot()
      ? eng.getSnapshot().symbols?.symbolsById?.get(nav.symbolId)
      : null;
    const group = sym && sym.isGlobal
      ? countGroupReferences(nav.name || '', null)
      : 0;
    return { total: here + group };
  }
  const cross = crossFileDefinitionAt(view, at);
  if (!cross || !cross.sourceRange) return null;
  const { from, to } = cross.sourceRange;
  const name = view.state.sliceDoc(from, to);
  if (!name) return null;
  const refCount = usesOf(view.state.doc.toString())
    .filter((u) => u.name === name && u.from !== from).length;
  const here = 1 + refCount;
  const group = countGroupReferences(name, { defFileId: cross.fileId });
  return { total: here + group };
}

export function resolveRenameOk(session, trimmed, preview, conflict) {
  if (preview.ok) return !(session.propagate && conflict);
  const identOk = VALID_IDENT.test(trimmed);
  const engineLost = preview.reason === 'unknown-symbol'
    || preview.reason === 'no-semantic-snapshot';
  return identOk && !conflict && engineLost;
}

// ── Group-rename history: Ctrl+Z must undo the WHOLE rename ──────────────────
// The editor's history only covers this document; the other files' before/after
// texts are recorded here, and undo/redo of the local rename step replays them.
const groupRenameHistory = [];
const GROUP_HISTORY_CAP = 20;

// Pure matcher (exported for tests): which stack entry does this undo/redo
// correspond to? An UNDO of a rename re-inserts the original name; a REDO
// re-inserts the new name. Most recent first.
export function matchGroupRename(stack, direction, insertedTexts) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const e = stack[i];
    if (direction === 'undo' && !e.undone && insertedTexts.includes(e.originalName)) return e;
    if (direction === 'redo' && e.undone && insertedTexts.includes(e.newName)) return e;
  }
  return null;
}

function insertedTextsOf(tr) {
  const out = [];
  tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    const s = inserted.toString();
    if (s) out.push(s);
  });
  return out;
}

function watchGroupRenameHistory(update) {
  if (!update.docChanged || !groupRenameHistory.length) return;
  for (const tr of update.transactions) {
    const dir = tr.isUserEvent('undo') ? 'undo' : (tr.isUserEvent('redo') ? 'redo' : null);
    if (!dir) continue;
    const entry = matchGroupRename(groupRenameHistory, dir, insertedTextsOf(tr));
    if (!entry) continue;
    const env = persistEnv();
    if (!env || typeof env.P.setFileText !== 'function') continue;
    try {
      for (const f of entry.files) {
        env.P.setFileText(f.fileId, dir === 'undo' ? f.before : f.after);
      }
      entry.undone = dir === 'undo';
      showRenameToast(
        `${dir === 'undo' ? 'Undid' : 'Redid'} rename ${entry.originalName} → ${entry.newName}`
        + ` across ${entry.files.length} other file${entry.files.length === 1 ? '' : 's'}.`,
        'info',
      );
    } catch (_) { /* keep the local undo even if the group replay fails */ }
  }
}

// After the local commit, rewrite the rest of the group: free uses everywhere
// (plus the definition tokens when it lives in another file). Files defining
// the same name themselves are untouched — their occurrences bind locally.
function propagateGroupRename(session, newName) {
  const env = persistEnv();
  if (!env) return;
  try {
    const files = env.P.listFiles();
    const activeId = env.P.getActiveFileId();
    const plans = groupRenameEdits(
      files, activeId, session.originalName,
      (id) => env.P.getFileText(id),
      session.crossFile ? session.crossFile.defFileId : null
    );
    let refs = 0;
    const fileChanges = [];
    for (const plan of plans) {
      const before = env.P.getFileText(plan.fileId);
      const after = applyTextEdits(before, plan.edits, newName);
      env.P.setFileText(plan.fileId, after);
      fileChanges.push({ fileId: plan.fileId, before, after });
      refs += plan.edits.length;
    }
    if (fileChanges.length) {
      groupRenameHistory.push({
        originalName: session.originalName,
        newName,
        files: fileChanges,
        undone: false,
      });
      if (groupRenameHistory.length > GROUP_HISTORY_CAP) groupRenameHistory.shift();
    }
    if (plans.length) {
      showRenameToast(
        `Renamed ${session.originalName} → ${newName} in ${plans.length} other file${plans.length === 1 ? '' : 's'}`
        + ` (${refs} occurrence${refs === 1 ? '' : 's'}).`,
        'info',
      );
    }
  } catch (_) { /* group propagation is best-effort; the local rename stands */ }
}

function buildRenameDecorations(view, session) {
  const { ok, trimmed } = previewState(view, session);
  const invalid = !ok && !!trimmed;
  const mark = invalid ? renameInvalidMark : renameMark;
  const items = [];
  if (session.anchorFrom < session.anchorTo) {
    items.push({ from: session.anchorFrom, to: session.anchorTo, deco: mark });
  }
  for (const r of session.refRanges || []) {
    if (r.from >= r.to) continue;
    items.push({ from: r.from, to: r.to, deco: mark });
  }
  items.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder();
  for (const item of items) builder.add(item.from, item.to, item.deco);
  return builder.finish();
}

const renameHighlighter = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = Decoration.none;
      this.rebuild(view);
    }

    update(update) {
      const had = !!update.startState.field(renameSessionField, false);
      const has = !!update.state.field(renameSessionField, false);
      if (!has) {
        if (this.decorations.size) this.decorations = Decoration.none;
        return;
      }
      if (had !== has || update.docChanged || update.transactions.some(
        (t) => t.effects.some((e) => e.is(setRenameSession)),
      )) {
        this.rebuild(update.view);
      }
    }

    rebuild(view) {
      const session = view.state.field(renameSessionField, false);
      this.decorations = session
        ? buildRenameDecorations(view, session)
        : Decoration.none;
    }
  },
  { decorations: (v) => v.decorations },
);

function renameActive(view) {
  return !!view.state.field(renameSessionField, false);
}

function sortedChanges(changes) {
  return changes.sort((a, b) => a.from - b.from || a.to - b.to);
}

function buildRevertAllChanges(session, doc) {
  const changes = [];
  const anchorText = doc.sliceString(session.anchorFrom, session.anchorTo);
  if (anchorText !== session.originalName) {
    changes.push({
      from: session.anchorFrom,
      to: session.anchorTo,
      insert: session.originalName,
    });
  }
  for (const r of session.refRanges || []) {
    if (r.from >= r.to) continue;
    if (doc.sliceString(r.from, r.to) !== session.originalName) {
      changes.push({ from: r.from, to: r.to, insert: session.originalName });
    }
  }
  return sortedChanges(changes);
}

function buildRenameCommitChanges(session, trimmed) {
  const changes = [{
    from: session.anchorFrom,
    to: session.anchorTo,
    insert: trimmed,
  }];
  for (const r of session.refRanges || []) {
    if (r.from >= r.to) continue;
    changes.push({ from: r.from, to: r.to, insert: trimmed });
  }
  return sortedChanges(changes);
}

function cancelRename(view) {
  const session = view.state.field(renameSessionField, false);
  if (!session) return false;
  const changes = buildRevertAllChanges(session, view.state.doc);
  view.dispatch({
    changes: changes.length ? changes : undefined,
    effects: setRenameSession.of(null),
    selection: {
      anchor: session.anchorFrom,
      head: session.anchorFrom + session.originalName.length,
    },
    annotations: [Transaction.addToHistory.of(false), renameInternal.of(true)],
  });
  view.focus();
  return true;
}

function commitRename(view) {
  const session = view.state.field(renameSessionField, false);
  if (!session) return false;
  const { trimmed, ok } = previewState(view, session);
  if (trimmed === session.originalName) return cancelRename(view);
  if (!ok || !trimmed) {
    if (!trimmed) {
      showRenameToast('Enter a name to rename to.', 'warn');
    } else if (!VALID_IDENT.test(trimmed)) {
      showRenameToast(`Rename blocked: "${trimmed}" is not a valid name.`, 'warn');
    } else {
      const suggestion = suggestRenameName(
        session.originalName, (c) => !evaluateName(view, session, c),
      );
      showRenameToast(
        `Rename blocked: "${trimmed}" is already in use`
        + (suggestion ? `. Try "${suggestion}"?` : '.'),
        'warn',
      );
    }
    return true;
  }

  const revert = buildRevertAllChanges(session, view.state.doc);
  if (revert.length) {
    view.dispatch({
      changes: revert,
      annotations: [Transaction.addToHistory.of(false), renameInternal.of(true)],
    });
  }

  const ready = view.state.field(renameSessionField, false);
  if (!ready) return true;

  view.dispatch({
    changes: buildRenameCommitChanges(ready, trimmed),
    effects: [setRenameSession.of(null), scrollIntoViewCenter(ready.anchorFrom)],
    userEvent: 'rename',
  });
  // Global symbols ripple through the rest of the project group. (Other files
  // are updated in storage — the editor's undo only covers this document.)
  if (ready.propagate || ready.crossFile) propagateGroupRename(ready, trimmed);
  view.focus();
  return true;
}

function renameChangeFilter(tr) {
  if (!tr.docChanged) return true;
  if (tr.annotation(Transaction.userEvent) === 'rename') return true;
  if (tr.annotation(renameSync)) return true;
  if (tr.annotation(renameInternal)) return true;
  const session = tr.startState.field(renameSessionField, false);
  if (!session) return true;
  let allowed = true;
  tr.changes.iterChanges((fromA, toA) => {
    if (fromA < session.anchorFrom || toA > session.anchorTo) allowed = false;
  });
  return allowed;
}

function buildReferenceSyncChanges(state, session) {
  const draft = state.doc.sliceString(session.anchorFrom, session.anchorTo);
  const changes = [];
  for (const r of session.refRanges || []) {
    if (r.from >= r.to) continue;
    if (state.doc.sliceString(r.from, r.to) !== draft) {
      changes.push({ from: r.from, to: r.to, insert: draft });
    }
  }
  return sortedChanges(changes);
}

function anchorEditedInTransactions(transactions) {
  return transactions.some((tr) => {
    if (!tr.docChanged) return false;
    const s = tr.startState.field(renameSessionField, false);
    if (!s) return false;
    let hit = false;
    tr.changes.iterChanges((fromA, toA) => {
      if (fromA >= s.anchorFrom && toA <= s.anchorTo) hit = true;
    });
    return hit;
  });
}

function syncReferences(update) {
  if (!update.docChanged) return;
  if (update.transactions.some((tr) => tr.annotation(renameSync))) return;
  if (update.transactions.some((tr) => tr.annotation(renameInternal))) return;
  if (update.transactions.some((tr) => tr.annotation(Transaction.userEvent) === 'rename')) return;
  const session = update.state.field(renameSessionField, false);
  if (!session || !anchorEditedInTransactions(update.transactions)) return;
  const changes = buildReferenceSyncChanges(update.state, session);
  if (!changes.length) return;
  update.view.dispatch({
    changes,
    annotations: [Transaction.addToHistory.of(false), renameSync.of(true)],
  });
}

function deferRename(fn, view) {
  queueMicrotask(() => {
    if (view.dom.isConnected) fn(view);
  });
}

export const renameActiveField = renameSessionField;
export { buildRenameCommitChanges, buildReferenceSyncChanges, renameInternal, setRenameSession as renameSessionEffect };

export function isRenaming(state) {
  return !!state.field(renameSessionField, false);
}

export function renamePreviewState(view, session) {
  return previewState(view, session);
}

export function renameDraftIsInvalid(session, state) {
  return !state.ok && !!state.trimmed;
}

export function renameSessionChanged(update) {
  return isRenaming(update.state) !== isRenaming(update.startState);
}

export function startRename(view, pos) {
  if (renameActive(view)) {
    const session = view.state.field(renameSessionField, false);
    if (session) {
      const revert = buildRevertAllChanges(session, view.state.doc);
      if (revert.length) {
        view.dispatch({
          changes: revert,
          effects: setRenameSession.of(null),
          annotations: [Transaction.addToHistory.of(false), renameInternal.of(true)],
        });
      } else {
        view.dispatch({ effects: setRenameSession.of(null) });
      }
    }
  }
  const at = pos ?? view.state.selection.main.head;
  const nav = navInfoAt(view, at);
  if (!nav || !nav.symbolId || !nav.nameRange) {
    return startCrossFileRename(view, at);
  }
  const { from, to } = nav.nameRange;
  const eng = getEngine(view);
  const preview = eng && typeof eng.renamePreview === 'function'
    ? eng.renamePreview(nav.symbolId, nav.name || '')
    : null;
  const refRanges = preview && preview.ok
    ? preview.edits.filter((e) => e.from !== from).map((e) => ({ from: e.from, to: e.to }))
    : [];
  // Renaming a GLOBAL ripples to the rest of the project group on commit.
  const sym = eng && eng.getSnapshot && eng.getSnapshot()
    ? eng.getSnapshot().symbols?.symbolsById?.get(nav.symbolId)
    : null;
  const session = {
    symbolId: nav.symbolId,
    originalName: nav.name || '',
    anchorFrom: from,
    anchorTo: to,
    refRanges,
    propagate: !!(sym && sym.isGlobal),
  };
  view.dispatch({
    effects: setRenameSession.of(session),
    selection: { anchor: from, head: to },
  });
  view.focus();
  return true;
}

// F2 on a name DEFINED IN ANOTHER FILE: rename it across the whole group. The
// inline session edits this document's free occurrences live; the defining
// file and the rest of the group are rewritten on commit.
function startCrossFileRename(view, at) {
  const cross = crossFileDefinitionAt(view, at);
  if (!cross || !cross.sourceRange) return false;
  const { from, to } = cross.sourceRange;
  const name = view.state.sliceDoc(from, to);
  if (!name) return false;
  const refRanges = usesOf(view.state.doc.toString())
    .filter((u) => u.name === name && u.from !== from)
    .map((u) => ({ from: u.from, to: u.to }));
  const session = {
    symbolId: null,
    originalName: name,
    anchorFrom: from,
    anchorTo: to,
    refRanges,
    crossFile: { defFileId: cross.fileId },
  };
  view.dispatch({
    effects: setRenameSession.of(session),
    selection: { anchor: from, head: to },
  });
  view.focus();
  return true;
}

export function belRename() {
  return [
    renameSessionField,
    renameHighlighter,
    EditorState.changeFilter.of(renameChangeFilter),
    EditorView.updateListener.of(syncReferences),
    EditorView.updateListener.of(watchGroupRenameHistory),
    EditorState.transactionExtender.of((tr) => {
      if (!tr.docChanged) return null;
      if (tr.annotation(renameSync)) return null;
      if (tr.annotation(renameInternal)) return null;
      if (tr.annotation(Transaction.userEvent) === 'rename') return null;
      if (tr.annotation(Transaction.addToHistory) === false) return null;
      if (!tr.startState.field(renameSessionField, false)) return null;
      return { annotations: Transaction.addToHistory.of(false) };
    }),
    EditorView.domEventHandlers({
      mousedown(_e, view) {
        if (!renameActive(view)) return false;
        requestAnimationFrame(() => {
          if (!renameActive(view)) return;
          const session = view.state.field(renameSessionField, false);
          if (!session) return;
          const sel = view.state.selection.main;
          if (sel.from < session.anchorFrom || sel.to > session.anchorTo) {
            cancelRename(view);
          }
        });
        return false;
      },
    }),
    EditorView.updateListener.of((update) => {
      if (!update.selectionSet || update.docChanged) return;
      const session = update.state.field(renameSessionField, false);
      if (!session) return;
      const sel = update.state.selection.main;
      if (sel.from < session.anchorFrom || sel.to > session.anchorTo) {
        deferRename(cancelRename, update.view);
      }
    }),
    Prec.highest(keymap.of([
      { key: 'Enter', run: (view) => renameActive(view) && commitRename(view) },
      { key: 'Escape', run: (view) => renameActive(view) && cancelRename(view) },
      { key: 'F2', run: (view) => startRename(view) },
    ])),
    EditorView.editorAttributes.of((view) => (
      view.state.field(renameSessionField, false) ? { class: 'cm-bel-renaming' } : null
    )),
  ];
}
