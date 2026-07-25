// Inline rename (F2): live mirror to all symbol occurrences while drafting.

import { EditorView, ViewPlugin, keymap, Decoration } from '@codemirror/view';
import { forceLinting } from '@codemirror/lint';
import { EditorState, Prec, RangeSetBuilder, StateEffect, StateField, Transaction, Annotation } from '@codemirror/state';
import { getEngine, navInfoAt, crossFileDefinitionAt, termRangeAt } from './ide-actions.mjs';
import { scrollIntoViewCenter } from './viewport.mjs';
import {
  defsOf, usesOf, developmentDefinesName, groupRenameEdits, applyGroupRenameToFile,
  groupReferencesFor,
} from '../semantic/project-prelude.mjs';

const setRenameSession = StateEffect.define();
export const renameSync = Annotation.define();
const renameInternal = Annotation.define();

function clampSite(site, docLen) {
  const from = Math.max(0, Math.min(site.from, docLen));
  const to = Math.max(from, Math.min(site.to, docLen));
  return { from, to };
}

function sanitizeSites(sites, docLen) {
  return sites.map((s) => clampSite(s, docLen));
}

function mapSites(sites, changes, anchorSite, docLen) {
  const mapped = sites.map((s, i) => {
    if (i === anchorSite) {
      return {
        from: changes.mapPos(s.from, -1),
        to: changes.mapPos(s.to, 1),
      };
    }
    return {
      from: changes.mapPos(s.from, 1),
      to: changes.mapPos(s.to, -1),
    };
  });
  return docLen != null ? sanitizeSites(mapped, docLen) : mapped;
}

function normalizeSession(session) {
  if (!session) return null;
  if (session.sites) return session;
  const anchor = { from: session.anchorFrom, to: session.anchorTo };
  if (session.refRanges?.length) {
    const sites = session.refRanges.map((r) => ({ from: r.from, to: r.to }));
    let anchorSite = sites.findIndex((s) => s.from === anchor.from && s.to === anchor.to);
    if (anchorSite < 0) {
      sites.push(anchor);
      sites.sort((a, b) => a.from - b.from || a.to - b.to);
      anchorSite = sites.findIndex((s) => s.from === anchor.from && s.to === anchor.to);
    }
    return { ...session, sites, anchorSite: anchorSite >= 0 ? anchorSite : 0 };
  }
  const span = anchor.to - anchor.from;
  const sites = [
    anchor,
    ...(session.refFroms || []).map((from) => ({ from, to: from + span })),
  ].sort((a, b) => a.from - b.from || a.to - b.to);
  const anchorSite = sites.findIndex((s) => s.from === anchor.from && s.to === anchor.to);
  return { ...session, sites, anchorSite: anchorSite >= 0 ? anchorSite : 0 };
}

function anchorSiteOf(session) {
  session = normalizeSession(session);
  return session.sites[session.anchorSite] ?? session.sites[0];
}

function anchorFrom(session) {
  return anchorSiteOf(session).from;
}

function anchorTo(session) {
  return anchorSiteOf(session).to;
}

const renameSessionField = StateField.define({
  create: () => null,
  update(session, tr) {
    for (const e of tr.effects) {
      if (e.is(setRenameSession)) return normalizeSession(e.value);
    }
    if (!session || !tr.docChanged) return session;
    return {
      ...session,
      sites: mapSites(session.sites, tr.changes, session.anchorSite, tr.state.doc.length),
    };
  },
});

const renameMark = Decoration.mark({ class: 'cm-bel-rename-active' });
const renameInvalidMark = Decoration.mark({ class: 'cm-bel-rename-active is-invalid' });

const VALID_IDENT = /^[^\s()[\]{}.,;:%|"\\]+$/;

function showRenameToast(message, kind) {
  const T = typeof window !== 'undefined' ? window.Toasts : null;
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
  const P = g.Persist;
  if (!P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') return null;
  return { g, P };
}

function localDefNameConflict(session, trimmed, docText) {
  if (!trimmed) return false;
  session = normalizeSession(session);
  for (const d of defsOf(docText)) {
    if (d.name !== trimmed) continue;
    const atRenameSite = session.sites.some(
      (s) => d.from >= s.from && d.to <= s.to,
    );
    if (!atRenameSite) return true;
  }
  return false;
}

function developmentConflict(view, session, trimmed) {
  const docText = view.state.doc.toString();
  if (localDefNameConflict(session, trimmed, docText)) return true;
  const env = persistEnv();
  if (!env) return false;
  try {
    const files = env.P.listFiles();
    const activeId = env.P.getActiveFileId();
    const opts = session.crossFile ? { defFileId: session.crossFile.defFileId } : {};
    if (developmentDefinesName(files, activeId, trimmed, (id) => env.P.getFileText(id), opts)) return true;
  } catch (_) { /* conflict check is best-effort */ }
  return false;
}

function nameHasInvalidWhitespace(draft) {
  return /\s/.test(draft);
}

function evaluateName(view, session, draft, trimmed) {
  if (trimmed === session.originalName) return true;
  if (!trimmed) return false;
  if (nameHasInvalidWhitespace(draft)) return false;

  const conflict = developmentConflict(view, session, trimmed);

  if (session.crossFile) return VALID_IDENT.test(trimmed) && !conflict;

  const eng = getEngine(view);
  const preview = eng && typeof eng.renamePreview === 'function'
    ? eng.renamePreview(session.symbolId, trimmed)
    : { ok: false, reason: 'no-semantic-snapshot' };

  return resolveRenameOk(session, trimmed, preview, conflict);
}

function previewState(view, session) {
  const anchor = anchorSiteOf(session);
  const draft = view.state.doc.sliceString(anchor.from, anchor.to);
  const trimmed = draft.trim();
  return { draft, trimmed, ok: evaluateName(view, session, draft, trimmed) };
}

function commitRejectMessage(view, session, { draft, trimmed }) {
  if (!trimmed) return 'Enter a name to rename to.';
  if (nameHasInvalidWhitespace(draft)) return 'Name cannot contain whitespace.';
  if (!VALID_IDENT.test(trimmed)) {
    return `"${trimmed}" is not a valid name.`;
  }
  if (developmentConflict(view, session, trimmed)) {
    return `"${trimmed}" is already defined in this development.`;
  }
  if (!session.crossFile) {
    const eng = getEngine(view);
    const preview = eng && typeof eng.renamePreview === 'function'
      ? eng.renamePreview(session.symbolId, trimmed)
      : null;
    if (preview && preview.reason === 'name-conflict') {
      return `"${trimmed}" is already in use.`;
    }
    if (preview && preview.reason === 'invalid-name') {
      return `"${trimmed}" is not a valid name.`;
    }
  }
  return `"${trimmed}" cannot be used.`;
}

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

export function renameReachAt(view, pos) {
  const at = pos ?? view.state.selection.main.head;
  const nav = navInfoAt(view, at);
  if (nav && nav.symbolId && nav.name) {
    const range = termRangeAt(view, at);
    if (!range) return null;
    const eng = getEngine(view);
    const preview = eng && typeof eng.renamePreview === 'function'
      ? eng.renamePreview(nav.symbolId, nav.name || '')
      : null;
    const refCount = preview && preview.ok
      ? preview.edits.filter((e) => e.from !== range.from || e.to !== range.to).length
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

export function matchGroupRename(stack, direction, insertedTexts) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const e = stack[i];
    if (direction === 'undo' && !e.undone && insertedTexts.includes(e.originalName)) return e;
    if (direction === 'redo' && e.undone && insertedTexts.includes(e.newName)) return e;
  }
  return null;
}

function editHistory() {
  const g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : null);
  return g?.EditHistory ?? null;
}

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
    for (const plan of plans) {
      const before = env.P.getFileText(plan.fileId);
      const after = applyGroupRenameToFile(
        before, plan.fileName, plan.edits, newName, session.originalName,
      );
      env.P.setFileText(plan.fileId, after);
      refs += plan.edits.length;
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

function draftLooksInvalid(view, session, state) {
  const { draft, trimmed } = state;
  if (!trimmed) return false;
  if (trimmed === session.originalName) return false;
  if (nameHasInvalidWhitespace(draft)) return true;
  if (!VALID_IDENT.test(trimmed)) return true;
  if (developmentConflict(view, session, trimmed)) return true;
  if (!state.ok) return true;
  return false;
}

function buildRenameDecorations(view, session) {
  const state = previewState(view, session);
  const invalid = draftLooksInvalid(view, session, state);
  const mark = invalid ? renameInvalidMark : renameMark;
  const docLen = view.state.doc.length;
  const items = [];
  for (const site of sanitizeSites(session.sites, docLen)) {
    if (site.from > site.to) continue;
    const to = site.from === site.to ? Math.min(site.from + 1, docLen) : site.to;
    if (site.from >= docLen) continue;
    items.push({ from: site.from, to, deco: mark });
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

function docLenOf(doc, session) {
  if (typeof doc.length === 'number') return doc.length;
  return normalizeSession(session).sites.reduce((n, s) => Math.max(n, s.to), 0);
}

function buildRevertAllChanges(session, doc) {
  session = normalizeSession(session);
  const docLen = docLenOf(doc, session);
  const changes = [];
  for (const site of sanitizeSites(session.sites, docLen)) {
    if (site.from > site.to) continue;
    if (doc.sliceString(site.from, site.to) !== session.originalName) {
      changes.push({ from: site.from, to: site.to, insert: session.originalName });
    }
  }
  return sortedChanges(changes);
}

export function buildRenameCommitChanges(session, trimmed, doc) {
  session = normalizeSession(session);
  const docLen = docLenOf(doc, session);
  return sortedChanges(sanitizeSites(session.sites, docLen).map((site) => ({
    from: site.from,
    to: site.to,
    insert: trimmed,
  })));
}

export function buildReferenceSyncChanges(doc, session, draft) {
  session = normalizeSession(session);
  const docLen = typeof doc.length === 'number' ? doc.length : doc.doc.length;
  const slice = (from, to) => (
    typeof doc.sliceString === 'function' ? doc.sliceString(from, to) : doc.doc.sliceString(from, to)
  );
  const text = draft ?? slice(anchorFrom(session), anchorTo(session));
  const changes = [];
  for (let i = 0; i < session.sites.length; i++) {
    if (i === session.anchorSite) continue;
    const site = clampSite(session.sites[i], docLen);
    if (site.from > site.to) continue;
    if (site.from > docLen) continue;
    if (slice(site.from, site.to) !== text) {
      changes.push({ from: site.from, to: site.to, insert: text });
    }
  }
  return sortedChanges(changes);
}

export function planReferenceSync(state, session) {
  const norm = normalizeSession(session);
  const anchor = anchorSiteOf(norm);
  const draft = state.doc.sliceString(anchor.from, anchor.to);
  const changes = buildReferenceSyncChanges(state.doc, norm, draft);
  if (!changes.length) return null;
  return { changes };
}

function renameSyncExtender(tr) {
  if (!tr.docChanged) return null;
  if (tr.annotation(renameSync) || tr.annotation(renameInternal)) return null;
  if (tr.annotation(Transaction.userEvent) === 'rename') return null;
  const session = tr.startState.field(renameSessionField, false);
  if (!session) return null;

  const anchor = anchorSiteOf(session);
  let anchorEdited = false;
  tr.changes.iterChanges((fromA, toA) => {
    if (fromA < anchor.to && toA > anchor.from) anchorEdited = true;
  });
  if (!anchorEdited) return null;

  const mappedSession = {
    ...session,
    sites: mapSites(session.sites, tr.changes, session.anchorSite, tr.changes.newLength),
  };
  const newDoc = tr.changes.apply(tr.startState.doc);
  const anchorMapped = mappedSession.sites[mappedSession.anchorSite];
  const draft = newDoc.sliceString(anchorMapped.from, anchorMapped.to);
  const syncChanges = buildReferenceSyncChanges(newDoc, mappedSession, draft);
  if (!syncChanges.length) return null;
  return { changes: syncChanges, annotations: renameSync.of(true) };
}

export function cancelRename(view) {
  const session = view.state.field(renameSessionField, false);
  if (!session) return false;
  const changes = buildRevertAllChanges(session, view.state.doc);
  const anchor = anchorSiteOf(session);
  view.dispatch({
    changes: changes.length ? changes : undefined,
    effects: setRenameSession.of(null),
    selection: {
      anchor: anchor.from,
      head: anchor.from + session.originalName.length,
    },
    annotations: [Transaction.addToHistory.of(false), renameInternal.of(true)],
  });
  view.focus();
  return true;
}

export function cancelRenameIfActive(view) {
  if (!renameActive(view)) return false;
  return cancelRename(view);
}

export function cancelRenameIfFocusLost(view) {
  if (!view.dom?.isConnected) return false;
  if (view.hasFocus) return false;
  return cancelRenameIfActive(view);
}

function commitRename(view) {
  const session = view.state.field(renameSessionField, false);
  if (!session) return false;
  const state = previewState(view, session);
  const { trimmed, ok } = state;
  if (trimmed === session.originalName) return cancelRename(view);
  if (!ok || !trimmed) {
    showRenameToast(commitRejectMessage(view, session, state), 'error');
    return true;
  }

  const H = editHistory();
  const env = persistEnv();
  if (H) {
    H.beginEntry('rename');
    H.captureStructuralBefore();
    if (env) {
      const activeId = env.P.getActiveFileId();
      if (activeId) H.touchFile(activeId);
      if (session.propagate || session.crossFile) {
        const plans = groupRenameEdits(
          env.P.listFiles(), activeId, session.originalName,
          (id) => env.P.getFileText(id),
          session.crossFile ? session.crossFile.defFileId : null,
        );
        for (const plan of plans) H.touchFile(plan.fileId);
      }
    }
  }

  if (session.propagate || session.crossFile) propagateGroupRename(session, trimmed);
  view.dispatch({
    changes: buildRenameCommitChanges(session, trimmed, view.state.doc),
    effects: [setRenameSession.of(null), scrollIntoViewCenter(anchorFrom(session))],
    userEvent: 'rename',
    annotations: [Transaction.addToHistory.of(false)],
  });
  if (H) H.commitEntry();
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
  const anchor = anchorSiteOf(session);
  let allowed = true;
  tr.changes.iterChanges((fromA, toA) => {
    if (fromA < anchor.from || toA > anchor.to) allowed = false;
  });
  return allowed;
}

function deferRename(fn, view) {
  queueMicrotask(() => {
    if (view.dom.isConnected) fn(view);
  });
}

function findAnchorSite(sites, anchorFrom, anchorTo) {
  let idx = sites.findIndex((s) => s.from === anchorFrom && s.to === anchorTo);
  if (idx >= 0) return idx;
  idx = sites.findIndex((s) => anchorFrom >= s.from && anchorTo <= s.to);
  return idx >= 0 ? idx : 0;
}

function sitesForSymbol(view, symbolId, name, anchorFromPos, anchorToPos) {
  const eng = getEngine(view);
  const preview = eng && typeof eng.renamePreview === 'function'
    ? eng.renamePreview(symbolId, name)
    : null;
  if (!preview || !preview.ok) {
    return {
      sites: [{ from: anchorFromPos, to: anchorToPos }],
      anchorSite: 0,
    };
  }
  const sites = preview.edits.map((e) => ({ from: e.from, to: e.to }));
  return {
    sites,
    anchorSite: findAnchorSite(sites, anchorFromPos, anchorToPos),
  };
}

function sitesForCrossFile(doc, name, anchorFromPos, anchorToPos) {
  const anchor = { from: anchorFromPos, to: anchorToPos };
  const refs = usesOf(doc)
    .filter((u) => (
      u.name === name
      && (u.from !== anchorFromPos || u.to !== anchorToPos)
      && u.to - u.from === name.length
    ))
    .map((u) => ({ from: u.from, to: u.to }));
  const sites = [anchor, ...refs].sort((a, b) => a.from - b.from || a.to - b.to);
  return {
    sites,
    anchorSite: findAnchorSite(sites, anchorFromPos, anchorToPos),
  };
}

export const renameActiveField = renameSessionField;
export { renameInternal, setRenameSession as renameSessionEffect };

export function isRenaming(state) {
  return !!state.field(renameSessionField, false);
}

export function renameLocalDefConflict(session, trimmed, docText) {
  return localDefNameConflict(session, trimmed, docText);
}

export function renamePreviewState(view, session) {
  return previewState(view, session);
}

export function renameDraftIsInvalid(view, session, state) {
  return draftLooksInvalid(view, session, state);
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
  const range = termRangeAt(view, at);
  if (!range) return false;
  const { from, to } = range;
  const name = view.state.sliceDoc(from, to);
  if (!name) return false;

  if (!nav || !nav.symbolId) {
    return startCrossFileRename(view, range, name);
  }

  const { sites, anchorSite } = sitesForSymbol(view, nav.symbolId, nav.name || name, from, to);
  const eng = getEngine(view);
  const sym = eng && eng.getSnapshot && eng.getSnapshot()
    ? eng.getSnapshot().symbols?.symbolsById?.get(nav.symbolId)
    : null;
  const session = {
    symbolId: nav.symbolId,
    originalName: nav.name || name,
    sites,
    anchorSite,
    propagate: !!(sym && sym.isGlobal),
  };
  view.dispatch({
    effects: setRenameSession.of(session),
    selection: { anchor: from, head: to },
  });
  queueMicrotask(() => {
    if (view.dom.isConnected) forceLinting(view);
  });
  view.focus();
  return true;
}

function startCrossFileRename(view, range, name) {
  const cross = crossFileDefinitionAt(view, view.state.selection.main.head);
  if (!cross) return false;
  const { from, to } = range;
  const { sites, anchorSite } = sitesForCrossFile(view.state.doc.toString(), name, from, to);
  const session = {
    symbolId: null,
    originalName: name,
    sites,
    anchorSite,
    crossFile: { defFileId: cross.fileId },
  };
  view.dispatch({
    effects: setRenameSession.of(session),
    selection: { anchor: from, head: to },
  });
  queueMicrotask(() => {
    if (view.dom.isConnected) forceLinting(view);
  });
  view.focus();
  return true;
}

export function rename() {
  return [
    renameSessionField,
    renameHighlighter,
    EditorState.changeFilter.of(renameChangeFilter),
    EditorState.transactionExtender.of(renameSyncExtender),
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
          const anchor = anchorSiteOf(session);
          const sel = view.state.selection.main;
          if (sel.from < anchor.from || sel.to > anchor.to) {
            cancelRename(view);
          }
        });
        return false;
      },
      blur(_e, view) {
        if (!renameActive(view)) return false;
        requestAnimationFrame(() => {
          cancelRenameIfFocusLost(view);
        });
        return false;
      },
    }),
    EditorView.updateListener.of((update) => {
      if (!update.selectionSet || update.docChanged) return;
      const session = update.state.field(renameSessionField, false);
      if (!session) return;
      const anchor = anchorSiteOf(session);
      const sel = update.state.selection.main;
      if (sel.from < anchor.from || sel.to > anchor.to) {
        deferRename(cancelRename, update.view);
      }
    }),
    Prec.highest(keymap.of([
      { key: 'Enter', run: (view) => renameActive(view) && commitRename(view) },
      { key: 'Escape', run: (view) => renameActive(view) && cancelRename(view) },
      {
        key: 'Backspace',
        run(view) {
          const session = view.state.field(renameSessionField, false);
          if (!session) return false;
          const sel = view.state.selection.main;
          if (!sel.empty) return false;
          const anchor = anchorSiteOf(session);
          if (anchor.from < anchor.to) return false;
          return cancelRename(view);
        },
      },
    ])),
    EditorView.editorAttributes.of((view) => (
      view.state.field(renameSessionField, false) ? { class: 'cm-bel-renaming' } : null
    )),
  ];
}
