// Symbol Inspector chrome — floating windows, docked panel, history, search, follow.
// Model building lives in inspector-model.mjs; DOM rendering in inspector-render.mjs.
// This module owns window/panel lifecycle and re-exports the public inspector API.

import { EditorView } from '@codemirror/view';
import { forEachDiagnostic } from '@codemirror/lint';
import { getEngine } from './ide-actions.mjs';
import {
  editorFileId,
} from './refs-panel.mjs';
import { createFollowWindowAction, registerEditorFollow } from './follow-sync.mjs';
import { listGroupSymbols, defsOf } from '../semantic/project-prelude.mjs';
import { fuzzySearchNodes } from '../graph/graph-nav.mjs';
import { navSemanticTick } from './navigation.mjs';
import { resolveReferenceJump, revealEditorCursor } from './viewport.mjs';
import { getDevelopmentChecker, developmentSignature } from '../semantic/development-check.mjs';
import {
  buildInspectorModel,
  isGlobalOverviewModel,
  resolveInspectModel,
  buildLiveModel,
  buildCrossFileModel,
  buildGlobalModelForFile,
  holeModelAt,
  developmentMembers,
  pendingDevChecks,
  persistDevOpts,
  activeFileId,
} from './inspector-model.mjs';
import {
  renderInspector,
  setTip,
  el,
  dispatchOpenFileAt,
} from './inspector-render.mjs';

export {
  groupByKind,
  canInspectAt,
  buildInspectorModel,
  isNotationPragmaModel,
  assembleGlobalModel,
  buildGlobalModel,
  crossFileSymbolDiagnostics,
  isGlobalOverviewModel,
  resolveInspectModel,
  buildBuiltinModel,
  enrichWithGroupGraph,
} from './inspector-model.mjs';
export { renderInspector } from './inspector-render.mjs';

// Opt-in check of the symbol's OWN development (a different Beluga program than
// the active one). Runs the development-scoped checker, showing a spinner while
// in flight, then re-inspects so the symbol's real health appears.
function checkCrossDevelopment(view, model) {
  const g = typeof window !== 'undefined' ? window : self;
  const dc = getDevelopmentChecker();
  if (!dc || !model || !model.fileId) return;
  const members = developmentMembers(g, view, model.fileId);
  if (!members.length) return;
  const sig = developmentSignature(members);
  if (pendingDevChecks.has(sig)) return;
  pendingDevChecks.add(sig);
  refreshPinnedCrossFile(); // re-render into the 'checking' state
  dc.check(members).finally(() => {
    pendingDevChecks.delete(sig);
    refreshPinnedCrossFile();
  });
}

// Re-inspect the pinned cross-file symbol in place (no history) — used when the
// development-scoped check finishes and the panel is still showing that symbol,
// so its freshly-attributed diagnostics appear.
function refreshPinnedCrossFile() {
  const view = dockView();
  if (!view || !panelOpen()) return;
  const target = lastRenderedTarget;
  if (!target || target.kind !== 'symbol' || !target.fileId) return;
  const g = typeof window !== 'undefined' ? window : self;
  if (target.fileId === activeFileId(g)) return; // now local; nothing to refresh here
  const model = buildCrossFileModel(g, target, view, { onDevChecked: refreshPinnedCrossFile });
  if (!model) return;
  suppressHistory();
  rerender(view, { model, boundFile: target.fileId, pos: target.pos });
}

const openWindows = new Map();

function inspectorWindowTitle() {
  const t = document.createElement('span');
  t.className = 'inspector-window-title';
  t.textContent = 'Inspect';
  return t;
}

function markInspectorJump(entry) {
  entry._followFromInspector = true;
  queueMicrotask(() => { entry._followFromInspector = false; });
}

function refreshInspectorAsync(entry, pos) {
  const engine = getEngine(entry.view);
  if (!engine || typeof engine.intelTypePromise !== 'function') return;
  const myToken = ++entry.renderToken;
  Promise.resolve(engine.intelTypePromise(pos)).then((type) => {
    if (myToken !== entry.renderToken) return;
    if (entry._followFromInspector) return;
    if (!entry.followEditor && entry.lastPos !== pos) return;
    if (!entry.bodyEl.isConnected) return;
    const next = buildLiveModel(engine, pos, entry.view);
    if (next && next.type == null && type != null) {
      next.type = type;
      next.statusState = 'checked';
      next.needsAsync = false;
    }
    if (next) {
      renderInspector(entry.bodyEl, next, entry.view, engine, {
        activePos: pos,
        onBeforeJump: () => markInspectorJump(entry),
        suppressFollow: () => suppressInspectorFollow(),
        onCheckCrossDev: checkCrossDevelopment,
        onOpenCrossFile: openCrossFileDefinition,
      });
      entry.win.setTitle(inspectorWindowTitle());
    }
  }).catch(() => {});
}

function syncPinnedInspector(entry) {
  if (!entry.followEditor || entry._followFromInspector) return;
  const pos = entry.view.state.selection.main.head;
  entry.lastPos = pos;
  const engine = getEngine(entry.view);
  if (!engine) return;
  const model = buildLiveModel(engine, pos, entry.view);
  renderInspector(entry.bodyEl, model, entry.view, engine, {
    activePos: pos,
    onBeforeJump: () => markInspectorJump(entry),
    suppressFollow: () => suppressInspectorFollow(),
    onCheckCrossDev: checkCrossDevelopment,
    onOpenCrossFile: openCrossFileDefinition,
  });
  entry.win.setTitle(inspectorWindowTitle());
  if (model?.needsAsync) refreshInspectorAsync(entry, pos);
}

export function openInspectorWindow(view, pos, opts = {}) {
  const g = typeof window !== 'undefined' ? window : self;
  if (typeof g.FloatingWindow === 'undefined') return false;
  const at = pos ?? view.state.selection.main.head;
  const engine = getEngine(view);
  if (!engine) return false;
  const model = resolveInspectModel(view, at, { onDevChecked: refreshPinnedCrossFile });
  if (!model) return false;

  const key = model.name + '@' + at;
  if (!opts.forceNew) {
    const existing = openWindows.get(key);
    if (existing) {
      existing.win.raise();
      return true;
    }
  }

  const bodyEl = document.createElement('div');
  bodyEl.className = 'inspector-body inspector-body-pinned';
  renderInspector(bodyEl, model, view, engine, {
    activePos: at,
    suppressFollow: () => suppressInspectorFollow(),
    onCheckCrossDev: checkCrossDevelopment,
    onOpenCrossFile: openCrossFileDefinition,
  });

  const title = inspectorWindowTitle();
  const { ref: followRef, action: followAction } = createFollowWindowAction((on) => setInspectorFollow(on));
  const fileId = editorFileId(g, view);
  const pinned = {
    view, engine, win: null, bodyEl, followEditor: false, lastPos: at, renderToken: 0,
    _followFromInspector: false, fileId, persistId: opts.persistId || null,
  };
  let unregisterInspectorFollow = null;

  function setInspectorFollow(on) {
    pinned.followEditor = !!on;
    followRef.setPressed?.(!!on);
    if (unregisterInspectorFollow) {
      unregisterInspectorFollow();
      unregisterInspectorFollow = null;
    }
    if (pinned.followEditor) {
      unregisterInspectorFollow = registerEditorFollow({
        view,
        isActive: () => pinned.followEditor,
        sync: () => syncPinnedInspector(pinned),
      });
      syncPinnedInspector(pinned);
      revealEditorCursor(view, { pos: pinned.lastPos });
    }
    if (g.WorkspaceState?.scheduleSave) g.WorkspaceState.scheduleSave();
  }

  let coords = null;
  try {
    coords = view.coordsAtPos(at);
  } catch (_) {
    coords = null;
  }
  const geom = opts.geom;
  const win = g.FloatingWindow.open({
    title,
    content: bodyEl,
    className: 'inspector-window',
    x: geom?.x ?? (coords ? Math.round(coords.right + 12) : undefined),
    y: geom?.y ?? (coords ? Math.round(coords.top) : undefined),
    width: geom?.w ?? 340,
    height: geom?.h ?? 420,
    actions: [followAction],
    onGeometryChange: () => { if (g.WorkspaceState?.scheduleSave) g.WorkspaceState.scheduleSave(); },
    onClose: () => {
      openWindows.delete(key);
      if (unregisterInspectorFollow) unregisterInspectorFollow();
      if (g.WorkspaceState?.scheduleSave) g.WorkspaceState.scheduleSave();
    },
  });
  pinned.win = win;
  if (!pinned.persistId) pinned.persistId = `inspector:${fileId}:${at}`;
  openWindows.set(key, pinned);

  if (opts.followEditor) setInspectorFollow(true);

  if (model.needsAsync && typeof engine.intelTypePromise === 'function') {
    refreshInspectorAsync(pinned, at);
  }
  if (g.WorkspaceState?.scheduleSave) g.WorkspaceState.scheduleSave();
  return true;
}

function shouldHonorInspectorRefresh(detail = {}) {
  if (detail.afterJump) return true;
  if (detail.force) return true;
  if (detail.live) return true;
  if (panelOpen() && !everRendered) return true;
  return followEditor;
}

// Passive content refresh (parse progress, settlement, edits) for whatever the
// panel is currently showing — without chasing the cursor when follow is off.
function shouldRefreshInspectorContent(g, view) {
  if (!panelOpen() || inspectorRenderSuppressed()) return false;
  if (followEditor) return true;
  const active = editorFileId(g, view);
  if (active == null) return false;
  if (boundFile === active) return true;
  if (lastRenderedTarget?.kind === 'symbol' && lastRenderedTarget.fileId === active) return true;
  return false;
}

function liveRerenderOpts(view) {
  const g = typeof window !== 'undefined' ? window : self;
  // Re-inspect the pinned hole at its `?` (rerender rebuilds the hole model there).
  if (lastRenderedTarget?.kind === 'hole') return { pos: lastRenderedTarget.pos };
  if (lastRenderedTarget?.kind === 'symbol') {
    if (lastRenderedTarget.fileId && lastRenderedTarget.fileId !== activeFileId(g)) {
      const model = buildCrossFileModel(g, lastRenderedTarget, view, { onDevChecked: refreshPinnedCrossFile });
      if (model) {
        return {
          model,
          boundFile: lastRenderedTarget.fileId,
          pos: lastRenderedTarget.pos,
        };
      }
    }
    return { pos: lastRenderedTarget.pos };
  }
  const active = editorFileId(g, view);
  if (boundFile && active && boundFile === active) {
    return {
      model: buildGlobalModelForFile(g, boundFile, view),
      boundFile,
      pos: 0,
    };
  }
  return { forceGlobal: true };
}

function rebindPinnedInspectorWindows(view) {
  if (!view) return;
  for (const pinned of openWindows.values()) {
    pinned.view = view;
    pinned.engine = getEngine(view);
    if (pinned.followEditor) syncPinnedInspector(pinned);
  }
}

let lastPos = null;
let suppressFollowUntil = 0;
// Set by a Ctrl/Cmd "jump, don't inspect" so the jump's resulting refresh /
// follow / re-lint does NOT re-render the panel (navigational only).
let suppressRenderUntil = 0;
let inspectorRetryTimer = null;
let lastDiagSig = '';

function suppressInspectorRender(ms = 700) {
  suppressRenderUntil = performance.now() + ms;
}
function inspectorRenderSuppressed() {
  return performance.now() < suppressRenderUntil;
}

// Cheap signature of the document's error/warning diagnostics, to detect when
// they change (e.g. async lint re-running after a tab switch) without a cursor
// or doc edit — which is exactly when the inspector would otherwise go stale.
function diagSignature(state) {
  let sig = '';
  try {
    forEachDiagnostic(state, (d, from, to) => {
      if (d.severity === 'error' || d.severity === 'warning') {
        sig += `${from}:${to}:${d.severity[0]};`;
      }
    });
  } catch (_) { /* lint state not ready */ }
  return sig;
}

function suppressInspectorFollow(ms = 600) {
  suppressFollowUntil = performance.now() + ms;
}

function clearInspectorFollowSuppress() {
  suppressFollowUntil = 0;
}

function probeIntelPos(engine, view, hint) {
  if (!engine || typeof engine.intelSyncAt !== 'function') {
    const sel = view.state.selection.main;
    return hint ?? (sel.empty ? sel.head : sel.from);
  }
  const sel = view.state.selection.main;
  const candidates = [];
  if (hint != null) candidates.push(hint);
  if (!sel.empty) {
    candidates.push(sel.from, sel.to > sel.from ? sel.to - 1 : sel.from);
  }
  candidates.push(sel.head, sel.anchor);
  const seen = new Set();
  for (const p of candidates) {
    if (p == null || p < 0 || p > view.state.doc.length || seen.has(p)) continue;
    seen.add(p);
    try {
      const intel = engine.intelSyncAt(p);
      if (intel?.name) return p;
    } catch (_) { /* ignore */ }
  }
  return hint ?? sel.head;
}

function scheduleInspectorRetry(view, pos, attempt = 0) {
  if (inspectorRetryTimer) clearTimeout(inspectorRetryTimer);
  if (attempt > 6) return;
  const delay = attempt === 0 ? 0 : Math.min(200, 40 * attempt);
  inspectorRetryTimer = setTimeout(() => {
    inspectorRetryTimer = null;
    if (!view?.dom?.isConnected) return;
    const g = typeof window !== 'undefined' ? window : self;
    const ed = g.CurrentEditor;
    if (ed && typeof ed.syncIntelAt === 'function') ed.syncIntelAt(pos);
    const engine = getEngine(view);
    const resolved = probeIntelPos(engine, view, pos);
    lastPos = resolved;
    const model = engine ? buildInspectorModel(engine, resolved) : null;
    if (model) {
      if (panelOpen()) rerender(view, { pos: resolved, afterJump: true });
      return;
    }
    scheduleInspectorRetry(view, pos, attempt + 1);
  }, delay);
}

function panelOpen() {
  const ws = document.querySelector('.workspace');
  return !!(ws && ws.classList.contains('is-inspector-open'));
}

function inspectorBody() {
  const panel = document.getElementById('inspector-panel');
  return panel ? panel.querySelector('.inspector-body') : null;
}

let renderToken = 0;
let lastInspectorSymbol = null;
// The pinned symbol target currently shown (null for home/global), and the
// active editor file when it was rendered — together they let a file switch
// re-evaluate cross-file staleness without changing which symbol is inspected.
let lastRenderedTarget = null;
let inspectorActiveFile = null;

function inspectorScrollOpts(body, model, opts = {}) {
  const sameSymbol = model?.name && model.name === lastInspectorSymbol;
  const preserve = opts.afterJump || (sameSymbol && body.scrollTop > 0);
  if (model?.name) lastInspectorSymbol = model.name;
  else if (!model) lastInspectorSymbol = null;
  return preserve ? { preserveScrollTop: body.scrollTop } : {};
}

// ── Docked-panel controller: sync toggle, panel-local history, search ────────
// Follow is OFF by default: the docked inspector is a deliberate repository, not
// a live lens. Passive editor signals (cursor, file switch, background re-lint)
// only move it when follow is ON; otherwise it changes only via explicit acts
// (open/inspect, panel clicks, search, back/forward, go-to-def jumps).
let followEditor = true;
let followEditorHydrated = false;
// The file id whose content the panel currently shows. Passive re-lint refreshes
// are honored only for THIS file, so switching tabs (follow off) leaves it be.
let boundFile = null;
let everRendered = false;
let history = [];
let histIndex = -1;
let suppressHistoryUntil = 0;
let headerWired = false;
let inspectorGlobalsBound = false;
let searchActive = false;
let searchTimer = null;
let searchHits = [];
let searchActiveIndex = -1;
let lastView = null;

function inspectorPanelEl() {
  return document.getElementById('inspector-panel');
}

function isCfgEditorView(view) {
  return !!view?.dom?.classList?.contains('bel-editor--cfg');
}

function dockView() {
  const g = typeof window !== 'undefined' ? window : self;
  const ed = g.CurrentEditor;
  if (ed && typeof ed.getView === 'function') {
    const v = ed.getView();
    if (v?.dom?.isConnected) return v;
  }
  return lastView?.dom?.isConnected ? lastView : null;
}

function targetsEqual(a, b) {
  return a && b && a.kind === b.kind && a.name === b.name
    && a.pos === b.pos && (a.fileId || null) === (b.fileId || null);
}

function suppressHistory(ms = 500) {
  suppressHistoryUntil = performance.now() + ms;
}
function historySuppressed() {
  return performance.now() < suppressHistoryUntil;
}

function pushTarget(target) {
  if (!target) return;
  if (targetsEqual(history[histIndex], target)) return;
  history = history.slice(0, histIndex + 1);
  history.push(target);
  if (history.length > 50) history = history.slice(history.length - 50);
  histIndex = history.length - 1;
  updateNavButtons();
  const g = typeof window !== 'undefined' ? window : self;
  if (g.WorkspaceState?.scheduleSave) g.WorkspaceState.scheduleSave();
}

function updateNavButtons() {
  const panel = inspectorPanelEl();
  if (!panel) return;
  const back = panel.querySelector('#inspector-nav-back');
  const fwd = panel.querySelector('#inspector-nav-fwd');
  if (back) back.disabled = histIndex <= 0;
  if (fwd) fwd.disabled = histIndex >= history.length - 1;
}

function updateSyncButton() {
  const panel = inspectorPanelEl();
  const btn = panel?.querySelector('#inspector-sync-toggle');
  if (!btn) return;
  btn.classList.toggle('is-on', followEditor);
  btn.setAttribute('aria-pressed', followEditor ? 'true' : 'false');
  const tip = followEditor ? 'Following editor selection' : 'Not following editor selection';
  btn.setAttribute('aria-label', tip);
  setTip(btn, tip);
}

// A panel row was activated. Ctrl/Cmd = pure navigation (jump, no inspect),
// regardless of follow. Plain click = follow ON jumps the editor (and inspects
// via follow); follow OFF inspects in the panel without moving the editor.
function dockedNavigate(target, event) {
  if (!target) return;
  if (event && (event.ctrlKey || event.metaKey)) {
    editorJumpTo(target, { suppressInspect: true });
    return;
  }
  pushTarget(target);
  goToTarget(target, { moveEditor: followEditor });
}

function editorJumpTo(target, { suppressInspect = false } = {}) {
  if (!target || target.kind === 'global') return; // home has no editor location
  const g = typeof window !== 'undefined' ? window : self;
  const fileId = target.fileId || editorFileId(g, dockView());
  if (suppressInspect) { suppressInspectorRender(); suppressInspectorFollow(); }
  dispatchOpenFileAt(g, fileId,
    target.range || { from: target.pos ?? 0, to: target.pos ?? 0 }, target.name);
}

function goToTarget(target, { moveEditor } = {}) {
  const view = dockView();
  if (!view) return;
  const g = typeof window !== 'undefined' ? window : self;
  if (target.kind === 'global') {
    suppressHistory();
    lastView = view;
    if (target.fileId && target.fileId !== editorFileId(g, view)) {
      rerender(view, { model: buildGlobalModelForFile(g, target.fileId, view), boundFile: target.fileId, pos: 0 });
    } else {
      rerender(view, { forceGlobal: true, pos: lastPos });
    }
    return;
  }
  if (moveEditor) {
    // Follow ON → jump the editor; the jump's refresh re-inspects the target.
    suppressHistory();
    editorJumpTo(target);
    return;
  }
  // Follow OFF → inspect in the panel WITHOUT moving the editor, view-independent
  // so it works even if the target lives in a non-active file.
  inspectInPanel(view, target);
}

// A file switch with follow OFF keeps the panel pinned (the inspected symbol
// doesn't change), but the symbol's STALENESS relative to the now-active file
// does — so re-inspect the SAME pinned symbol to refresh its banner / type /
// diagnostics. No-op unless the active file actually changed and a symbol (not
// the home view) is pinned. History is suppressed (it's the same target).
function reinspectPinnedForActiveFile(view) {
  if (!panelOpen() || !everRendered) return;
  const target = lastRenderedTarget;
  if (!target || target.kind !== 'symbol' || !target.fileId) return;
  const g = typeof window !== 'undefined' ? window : self;
  const nowActive = activeFileId(g);
  if (nowActive == null || nowActive === inspectorActiveFile) return;
  suppressHistory();
  if (target.fileId === nowActive) {
    // The pinned symbol now lives in the active file — inspect it live (no banner).
    rerender(view, { pos: target.pos, afterJump: true });
    return;
  }
  const model = buildCrossFileModel(g, target, view, { onDevChecked: refreshPinnedCrossFile });
  if (model) rerender(view, { model, boundFile: target.fileId, pos: target.pos });
  else rerender(view, { pos: target.pos, afterJump: true });
}

function inspectInPanel(view, target) {
  const g = typeof window !== 'undefined' ? window : self;
  suppressHistory();
  if (target.kind === 'file') {
    rerender(view, { model: buildGlobalModelForFile(g, target.fileId, view), boundFile: target.fileId, pos: 0 });
    return;
  }
  if (!target.fileId || target.fileId === activeFileId(g)) {
    rerender(view, { pos: target.pos });
    return;
  }
  const model = buildCrossFileModel(g, target, view, { onDevChecked: refreshPinnedCrossFile });
  if (model) rerender(view, { model, boundFile: target.fileId, pos: target.pos });
  else rerender(view, { pos: target.pos });
}

// The cross-file banner's "open" icon: an explicit go-to-definition. Move the
// editor to the definition regardless of follow state, then drop the cross-file
// framing — the symbol now lives in the active file, so the banner is dispelled.
// (Plain file switches never touch the banner; only this deliberate action does.)
function openCrossFileDefinition(view, model) {
  if (!model || !model.fileId) return;
  const target = {
    kind: 'symbol',
    name: model.name,
    pos: model.definitionPos,
    range: model.definitionRange,
    fileId: model.fileId,
  };
  pushTarget(target);
  suppressHistory();
  editorJumpTo(target, { suppressInspect: true });
  // Keep any later settle-driven refresh pinned to the definition we opened.
  if (model.definitionPos != null) lastPos = model.definitionPos;
  rerender(view, {
    model: { ...model, crossFile: false },
    boundFile: model.fileId,
    pos: model.definitionPos,
  });
}

function goBack() {
  if (histIndex <= 0) return;
  histIndex -= 1;
  updateNavButtons();
  goToTarget(history[histIndex], { moveEditor: followEditor });
}
function goForward() {
  if (histIndex >= history.length - 1) return;
  histIndex += 1;
  updateNavButtons();
  goToTarget(history[histIndex], { moveEditor: followEditor });
}

function goHome() {
  const view = dockView();
  if (!view) return;
  const g = typeof window !== 'undefined' ? window : self;
  const fileId = activeFileId(g);
  if (fileId == null) return;
  const target = { kind: 'global', fileId };
  pushTarget(target);
  goToTarget(target, { moveEditor: false });
}

function hydrateFollowEditor() {
  if (followEditorHydrated) return;
  followEditorHydrated = true;
  const g = typeof window !== 'undefined' ? window : self;
  const P = g.Persist;
  if (P && typeof P.readStoredInspectorFollow === 'function') {
    followEditor = !!P.readStoredInspectorFollow();
  }
}

function activateEditorFollow(view) {
  if (!view) return;
  const head = view.state.selection.main.head;
  rerender(view, { pos: head });
  revealEditorCursor(view, { pos: lastPos });
}

function setFollowEditor(on) {
  followEditor = !!on;
  updateSyncButton();
  const g = typeof window !== 'undefined' ? window : self;
  const P = g.Persist;
  if (P && typeof P.writeStoredInspectorFollow === 'function') {
    P.writeStoredInspectorFollow(followEditor);
  }
  if (g.SettingsUI && typeof g.SettingsUI.syncFromState === 'function') {
    g.SettingsUI.syncFromState();
  }
  if (followEditor) {
    clearInspectorFollowSuppress();
    activateEditorFollow(dockView());
  }
}

// ── In-panel suite search ────────────────────────────────────────────────────
// An expanding overlay: the search icon slides into a bar that commandeers the
// header to the left, leaving only the follow toggle. Results land in a floating
// dropdown — the panel body is NEVER touched, so following the cursor and the
// history stack keep working whether or not the search is open.
function searchEls() {
  const panel = inspectorPanelEl();
  if (!panel) return null;
  return {
    header: panel.querySelector('.inspector-header-bar'),
    wrap: panel.querySelector('#inspector-search'),
    input: panel.querySelector('#inspector-search-input'),
    ac: panel.querySelector('#inspector-search-ac'),
  };
}

// Focus expands the bar (the nav group slides away); blur/Escape collapse it.
function openSearch() {
  const e = searchEls();
  if (!e || !e.header || !e.input) return;
  searchActive = true;
  e.header.classList.add('is-search-open');
  e.wrap?.classList.add('is-open');
  e.input.setAttribute('aria-expanded', 'true');
  renderSearchAc(e.input.value);
}

function closeSearch() {
  const e = searchEls();
  searchActive = false;
  searchHits = [];
  searchActiveIndex = -1;
  if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
  if (!e) return;
  e.header?.classList.remove('is-search-open');
  e.wrap?.classList.remove('is-open');
  if (e.input) {
    e.input.value = '';
    e.input.setAttribute('aria-expanded', 'false');
    e.input.blur();
  }
  if (e.ac) { e.ac.hidden = true; e.ac.textContent = ''; }
}

// Every searchable definition visible to the active file — the ACTIVE file's
// own defs (via defsOf, the SAME index peers use, so constructors/lets are
// included, not just the headline outline) plus prelude/suite peers. The
// symmetry is the bug fix: a token must be findable from its own file exactly
// as it is when that file is a prelude of another.
function collectSuiteSymbols() {
  const g = typeof window !== 'undefined' ? window : self;
  const P = g.Persist;
  const out = [];
  const seen = new Set();
  if (!P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function'
    || typeof P.getActiveFileId !== 'function') {
    return out;
  }
  let files;
  let activeId;
  try {
    files = P.listFiles();
    activeId = P.getActiveFileId();
  } catch (_) {
    return out;
  }
  const active = files.find((f) => f.id === activeId);
  const activeName = active ? active.name : null;
  // Live editor text for the active file (accurate while unsaved), else stored.
  let activeText = '';
  if (lastView?.state?.doc) activeText = lastView.state.doc.toString();
  else { try { activeText = String(P.getFileText(activeId) ?? ''); } catch (_) { activeText = ''; } }
  try {
    for (const d of defsOf(activeText, activeName)) {
      const key = `${d.name}@${activeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: d.name, label: d.label || null, fileId: activeId, fileName: null,
        pos: d.from, range: { from: d.from, to: d.to },
      });
    }
  } catch (_) { /* ignore */ }
  try {
    for (const d of listGroupSymbols(files, activeId, (id) => P.getFileText(id), persistDevOpts(P))) {
      const key = `${d.name}@${d.fileId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: d.name, label: null, fileId: d.fileId, fileName: d.fileName,
        pos: d.from, range: { from: d.from, to: d.to },
      });
    }
  } catch (_) { /* ignore */ }
  return out;
}

function highlightedName(name, query) {
  const span = el('span', 'inspector-search-ac-name');
  const q = String(query || '').toLowerCase();
  const idx = q ? String(name).toLowerCase().indexOf(q) : -1;
  if (idx < 0) {
    span.textContent = name;
    return span;
  }
  if (idx > 0) span.appendChild(document.createTextNode(name.slice(0, idx)));
  span.appendChild(el('mark', 'inspector-search-ac-hl', name.slice(idx, idx + q.length)));
  span.appendChild(document.createTextNode(name.slice(idx + q.length)));
  return span;
}

function searchAcItem(hit, i, query) {
  const item = el('button', 'inspector-search-ac-item');
  item.type = 'button';
  item.setAttribute('role', 'option');
  item.dataset.index = String(i);
  if (i === searchActiveIndex) item.classList.add('is-active');
  item.appendChild(highlightedName(hit.name, query));
  if (hit.fileName) item.appendChild(el('span', 'inspector-search-ac-file', hit.fileName));
  else if (hit.label) item.appendChild(el('span', 'inspector-search-ac-kind', hit.label));
  // Keep the input focused so blur-to-close doesn't fire before the click lands.
  item.addEventListener('mousedown', (ev) => ev.preventDefault());
  item.addEventListener('click', (ev) => pickSearch(hit, ev));
  return item;
}

function renderSearchAc(query) {
  const e = searchEls();
  if (!e || !e.ac) return;
  const q = String(query || '').trim();
  e.ac.textContent = '';
  searchActiveIndex = -1;
  if (!q) {
    searchHits = [];
    e.ac.hidden = true;
    return;
  }
  searchHits = fuzzySearchNodes(collectSuiteSymbols(), q, 30);
  e.ac.hidden = false;
  if (!searchHits.length) {
    e.ac.appendChild(el('div', 'inspector-search-ac-empty', 'No matching symbols.'));
    return;
  }
  searchHits.forEach((hit, i) => e.ac.appendChild(searchAcItem(hit, i, q)));
}

function setSearchActiveIndex(next) {
  const e = searchEls();
  if (!e || !e.ac) return;
  const items = e.ac.querySelectorAll('.inspector-search-ac-item');
  if (!items.length) return;
  searchActiveIndex = ((next % items.length) + items.length) % items.length;
  items.forEach((it, i) => it.classList.toggle('is-active', i === searchActiveIndex));
  items[searchActiveIndex]?.scrollIntoView({ block: 'nearest' });
}

function pickSearch(hit, event) {
  if (!hit) return;
  closeSearch();
  dockedNavigate({ kind: 'symbol', name: hit.name, pos: hit.pos, range: hit.range, fileId: hit.fileId }, event);
}

function ensureHeaderWired() {
  hydrateFollowEditor();
  if (headerWired) return;
  const panel = inspectorPanelEl();
  if (!panel) return;
  const back = panel.querySelector('#inspector-nav-back');
  const fwd = panel.querySelector('#inspector-nav-fwd');
  const home = panel.querySelector('#inspector-nav-home');
  const syncToggle = panel.querySelector('#inspector-sync-toggle');
  const input = panel.querySelector('#inspector-search-input');
  if (!back || !fwd || !syncToggle) return;
  headerWired = true;
  home?.addEventListener('click', goHome);
  back.addEventListener('click', goBack);
  fwd.addEventListener('click', goForward);
  syncToggle.addEventListener('mousedown', (e) => e.preventDefault());
  syncToggle.addEventListener('click', () => setFollowEditor(!followEditor));
  const searchWrap = panel.querySelector('#inspector-search');
  searchWrap?.addEventListener('mousedown', (e) => {
    if (e.target === input) return;
    e.preventDefault();
    openSearch();
    requestAnimationFrame(() => input?.focus());
  });
  if (input) {
    input.addEventListener('focus', openSearch);
    input.addEventListener('input', () => {
      const v = input.value;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { searchTimer = null; renderSearchAc(v); }, 110);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSearchActiveIndex(searchActiveIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSearchActiveIndex(searchActiveIndex - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const hit = searchActiveIndex >= 0 ? searchHits[searchActiveIndex] : searchHits[0];
        if (hit) pickSearch(hit, e);
      }
    });
    // Click-away / blur collapses the overlay (delayed so item clicks land first).
    input.addEventListener('blur', () => {
      setTimeout(() => {
        const e = searchEls();
        if (!e) return;
        if (e.wrap?.contains(document.activeElement) || e.ac?.contains(document.activeElement)) return;
        if (searchActive) closeSearch();
      }, 120);
    });
    // Outside pointer dismisses immediately — more reliable than blur for clicks
    // on the panel body or the sidebar switcher. The dropdown rows are excluded
    // so a result click still lands (its own handler closes after navigating).
    document.addEventListener('pointerdown', (e) => {
      if (!searchActive) return;
      const els = searchEls();
      if (!els) return;
      if (els.wrap?.contains(e.target) || els.ac?.contains(e.target)) return;
      closeSearch();
    }, true);
  }
  updateNavButtons();
  updateSyncButton();
}

function clearInspectorProjectEmptyOverlay() {
  const overlay = document.getElementById('inspector-project-empty');
  if (overlay) {
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    if ('inert' in overlay) overlay.inert = true;
  }
  const body = inspectorBody();
  if (body) {
    body.hidden = false;
    body.setAttribute('aria-hidden', 'false');
  }
}

function rerender(view, opts = {}) {
  const body = inspectorBody();
  if (!body || !view?.dom?.isConnected) return;
  clearInspectorProjectEmptyOverlay();
  lastView = view;
  ensureHeaderWired();
  const g = typeof window !== 'undefined' ? window : self;
  const engine = getEngine(view);
  const forceGlobal = !!opts.forceGlobal || (!engine && isCfgEditorView(view));
  // A caller can hand us a pre-built model (cross-file inspect / cross-file
  // home); otherwise build from the active engine at the resolved position.
  const provided = opts.model !== undefined;
  let model;
  let pos;
  if (provided) {
    model = opts.model;
    pos = opts.pos != null ? opts.pos : lastPos;
  } else {
    const hinted = opts.pos != null ? opts.pos : lastPos;
    // Check the RAW cursor for a hole BEFORE probeIntelPos biases it to a nearby
    // symbol (a `?` sits next to binders that would otherwise win).
    const hole = !forceGlobal && engine ? holeModelAt(engine, view, hinted) : null;
    if (hole) {
      pos = hinted;
      lastPos = pos;
      model = hole;
    } else {
      pos = probeIntelPos(engine, view, hinted);
      lastPos = pos;
      model = forceGlobal ? null : (engine ? buildLiveModel(engine, pos, view) : null);
    }
  }
  boundFile = opts.boundFile != null ? opts.boundFile : editorFileId(g, view);
  // The ACTIVE editor file at render time — distinct from boundFile (the
  // inspected symbol's file). A change here, on a file switch, is what re-arms
  // the cross-file staleness re-evaluation in reinspectPinnedForActiveFile.
  inspectorActiveFile = activeFileId(g);
  everRendered = true;
  const scrollOpts = inspectorScrollOpts(body, model, opts);
  const renderOpts = {
    ...scrollOpts,
    activePos: pos,
    forceGlobal,
    boundFile,
    navigate: dockedNavigate,
    onBeforeJump: () => suppressInspectorFollow(),
    suppressFollow: () => suppressInspectorFollow(),
    onCheckCrossDev: checkCrossDevelopment,
    onOpenCrossFile: openCrossFileDefinition,
  };
  renderInspector(body, model, view, engine, renderOpts);

  if (isGlobalOverviewModel(model) && model.holes?.length) {
    const ed = g.BelEditor;
    if (ed && typeof ed.scheduleCertifyHoleGoalsScoped === 'function') {
      const hits = model.holes.map((h) => ({ hole: h, from: h.from, to: h.to }));
      ed.scheduleCertifyHoleGoalsScoped(view, hits);
    }
  }

  if (model && model.isHole) {
    // A hole isn't a symbol, but it IS a pinned target — so a background re-lint
    // re-inspects the `?` at this position instead of falling back to global.
    lastRenderedTarget = { kind: 'hole', pos };
  } else if (model && model.name) {
    // Remember the pinned symbol so a later file switch can re-evaluate its
    // cross-file staleness against the new active file (same symbol, fresh banner).
    lastRenderedTarget = {
      kind: 'symbol',
      name: model.name,
      pos: model.definitionPos != null ? model.definitionPos : pos,
      range: model.definitionRange || null,
      fileId: model.fileId || editorFileId(g, view),
    };
    if (!historySuppressed()) pushTarget(lastRenderedTarget);
  } else if (forceGlobal || isGlobalOverviewModel(model)) {
    const fileId = boundFile || editorFileId(g, view);
    if (fileId != null) {
      lastRenderedTarget = { kind: 'global', fileId };
      if (!historySuppressed()) pushTarget(lastRenderedTarget);
    } else {
      lastRenderedTarget = null;
    }
  } else if (model && model.fileName) {
    lastRenderedTarget = null;
  } else {
    lastRenderedTarget = null;
  }

  // Any newer render invalidates a pending async type upgrade. Bump once here so
  // both the active-model and cross-file paths capture the same generation.
  renderToken += 1;
  const myToken = renderToken;
  // Async type for the live active-engine model.
  if (!provided && model && model.needsAsync && engine && typeof engine.intelTypePromise === 'function') {
    Promise.resolve(engine.intelTypePromise(pos)).then((type) => {
      if (myToken !== renderToken) return;
      if (lastPos !== pos) return;
      if (inspectorBody() !== body || !body.isConnected) return;
      const next = buildLiveModel(engine, pos, view);
      if (next && next.type == null && type != null) {
        next.type = type;
        next.statusState = 'checked';
        next.needsAsync = false;
      }
      renderInspector(body, next, view, engine, renderOpts);
    }).catch(() => {});
  } else if (provided && model && model.crossFileTypeName && engine && typeof engine.memberTypePromise === 'function') {
    // In-development cross-file symbol: upgrade its source signature to the
    // reconstructed type the active session can supply (it loaded the prelude).
    // Always re-render on settle to clear the "reconstructing…" spinner, whether
    // or not a richer type came back.
    const clearUpgrade = (type) => {
      if (myToken !== renderToken) return;
      if (inspectorBody() !== body || !body.isConnected) return;
      const next = (type != null && type !== model.type)
        ? { ...model, type, typeSource: 'reconstructed', typeUpgrading: false }
        : { ...model, typeUpgrading: false };
      renderInspector(body, next, view, engine, renderOpts);
    };
    Promise.resolve(engine.memberTypePromise(model.crossFileTypeName))
      .then(clearUpgrade)
      .catch(() => clearUpgrade(null));
  } else if (!model && !forceGlobal && opts.afterJump && panelOpen()) {
    scheduleInspectorRetry(view, pos);
  }
}

export function inspector() {
  let timer = null;
  let boundView = null;

  function activeView() {
    const g = typeof window !== 'undefined' ? window : self;
    const ed = g.CurrentEditor;
    if (ed && typeof ed.getView === 'function') {
      const v = ed.getView();
      if (v?.dom?.isConnected) return v;
    }
    return boundView?.dom?.isConnected ? boundView : null;
  }

  const onOpenRequest = (e) => {
    const view = activeView();
    if (!view) return;
    lastView = view;
    ensureHeaderWired();
    const explicit = e?.detail && typeof e.detail.pos === 'number';
    if (explicit) lastPos = e.detail.pos;
    if (explicit || followEditor || !everRendered) {
      requestAnimationFrame(() => rerender(view, explicit ? { pos: e.detail.pos } : {}));
    }
  };

  return EditorView.updateListener.of((update) => {
    boundView = update.view;
    lastView = update.view;
    const g = typeof window !== 'undefined' ? window : self;
    if (!inspectorGlobalsBound) {
      inspectorGlobalsBound = true;
      ensureHeaderWired();
      g.addEventListener('beljar:open-inspector', onOpenRequest);
      g.addEventListener('beljar:active-editor-view', (e) => {
        rebindPinnedInspectorWindows(e?.detail?.view);
      });
      g.addEventListener('beljar:development-checked', () => {
        const view = activeView();
        if (!view || !panelOpen() || inspectorRenderSuppressed()) return;
        if (shouldRefreshInspectorContent(g, view)) {
          rerender(view, liveRerenderOpts(view));
        }
      });
      g.addEventListener('beljar:hole-goals-updated', () => {
        const view = activeView();
        if (!view || !panelOpen() || inspectorRenderSuppressed()) return;
        if (shouldRefreshInspectorContent(g, view)) {
          rerender(view, liveRerenderOpts(view));
        }
      });
      g.addEventListener('beljar:inspector-refresh', (e) => {
        const view = activeView();
        if (!view) return;
        const detail = e?.detail || {};
        if (inspectorRenderSuppressed()) return;
        if (detail.live && shouldRefreshInspectorContent(g, view)) {
          rerender(view, liveRerenderOpts(view));
          return;
        }
        if (!shouldHonorInspectorRefresh(detail)) {
          // Follow off: don't chase the cursor, but DO refresh the pinned
          // symbol's cross-file staleness if the active file just changed.
          reinspectPinnedForActiveFile(view);
          return;
        }
        if (detail.afterJump) clearInspectorFollowSuppress();
        const sel = view.state.selection.main;
        const hinted = detail.pos != null
          ? detail.pos
          : (sel.empty ? sel.head : sel.from);
        lastPos = hinted;
        rerender(view, { pos: hinted, afterJump: !!detail.afterJump });
      });
    }
    const scheduleRerender = (ms, opts = null) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        rerender(update.view, opts || (followEditor ? {} : liveRerenderOpts(update.view)));
      }, ms);
    };

    // Seed once when the panel is open but has never rendered (e.g. it was
    // restored open on load) — regardless of follow, so it's never blank.
    if (panelOpen() && !everRendered) {
      scheduleRerender(0);
      return;
    }

    if (update.docChanged) lastDiagSig = diagSignature(update.state);
    if (update.docChanged && shouldRefreshInspectorContent(g, update.view)) {
      if (followEditor) lastPos = update.state.selection.main.head;
      const settle = getEngine(update.view)?.settleState?.();
      const settling = settle === 'checking' || settle === 'stale';
      scheduleRerender(settling ? 0 : (followEditor ? 120 : 150));
      return;
    }
    if (update.selectionSet) {
      if (!followEditor) return;
      if (performance.now() < suppressFollowUntil || inspectorRenderSuppressed()) return;
      lastPos = update.state.selection.main.head;
      if (!panelOpen()) return;
      scheduleRerender(120);
      return;
    }

    const semanticTicked = update.transactions.some((tr) =>
      tr.effects.some((e) => e.is(navSemanticTick)));
    if (semanticTicked && shouldRefreshInspectorContent(g, update.view)) {
      scheduleRerender(80);
      return;
    }

    // Diagnostics changed without a cursor/doc edit (async lint, settlement
    // passes). Refresh the health strip / Diagnostics section / symbol status.
    if (!update.transactions.length || !panelOpen()) return;
    const sig = diagSignature(update.state);
    if (sig === lastDiagSig) return;
    lastDiagSig = sig;
    if (shouldRefreshInspectorContent(g, update.view)) scheduleRerender(150);
  });
}

(function registerInspectorFollowListener() {
  const g = typeof globalThis !== 'undefined' ? globalThis : null;
  if (!g || typeof g.addEventListener !== 'function') return;
  g.addEventListener('beljar:inspector-follow-changed', (e) => {
    setFollowEditor(!!(e && e.detail && e.detail.on));
  });
})();

function serializeInspectorTarget(t) {
  if (!t) return null;
  const out = { kind: t.kind };
  if (t.name) out.name = t.name;
  if (t.fileId) out.fileId = t.fileId;
  if (t.pos != null) out.posHint = t.pos;
  else if (t.posHint != null) out.posHint = t.posHint;
  return out;
}

function resolveInspectorAnchorPos(view, anchor) {
  if (!anchor || !view) return null;
  const doc = view.state.doc;
  const hint = Number(anchor.posHint);
  if (anchor.kind === 'symbol' && anchor.name) {
    const from = isFinite(hint) ? hint : 0;
    const resolved = resolveReferenceJump(doc, { from, to: from }, anchor.name);
    return resolved?.from ?? (isFinite(hint) ? Math.max(0, Math.min(hint, doc.length)) : null);
  }
  if (isFinite(hint)) return Math.max(0, Math.min(hint, doc.length));
  return null;
}

export function collectWorkspaceInspector(out) {
  if (!out.sidebar) return;
  const body = inspectorBody();
  out.sidebar.inspector = {
    target: serializeInspectorTarget(lastRenderedTarget),
    histIndex,
    scrollTop: body ? body.scrollTop : 0,
  };
}

export function restoreWorkspaceInspector(sidebar, deps = {}) {
  const view = deps.view;
  if (!view || !sidebar?.inspector) return;
  const g = typeof window !== 'undefined' ? window : self;
  if (g.Persist?.readStoredInspectorFollow?.()) return;
  if (!panelOpen()) return;
  const target = sidebar.inspector.target;
  if (!target) return;

  if (target.kind === 'global') {
    if (target.fileId && target.fileId !== editorFileId(g, view)) {
      rerender(view, {
        model: buildGlobalModelForFile(g, target.fileId, view),
        boundFile: target.fileId,
        pos: 0,
      });
    } else {
      rerender(view, { forceGlobal: true, pos: lastPos });
    }
  } else if (target.kind === 'hole') {
    const pos = resolveInspectorAnchorPos(view, target);
    if (pos != null) rerender(view, { pos, afterJump: true });
  } else {
    const pos = resolveInspectorAnchorPos(view, target);
    if (target.kind === 'symbol' && target.fileId && target.fileId !== editorFileId(g, view)) {
      dockedNavigate({
        kind: 'symbol',
        name: target.name,
        fileId: target.fileId,
        pos: pos ?? target.posHint ?? 0,
      }, null);
    } else if (pos != null) {
      rerender(view, { pos, afterJump: true });
    }
  }

  const st = Number(sidebar.inspector.scrollTop);
  if (isFinite(st) && st > 0) {
    requestAnimationFrame(() => {
      const b = inspectorBody();
      if (b) b.scrollTop = st;
    });
  }
}

export function collectFloatingInspectorWindows(fileId, out) {
  if (!Array.isArray(out.floating)) out.floating = [];
  const g = typeof window !== 'undefined' ? window : self;
  for (const pinned of openWindows.values()) {
    const fid = pinned.fileId || editorFileId(g, pinned.view);
    if (fid !== fileId || !pinned.win?.getGeometry) continue;
    const geom = pinned.win.getGeometry();
    const at = pinned.lastPos;
    let name = '';
    try {
      const m = pinned.engine ? buildLiveModel(pinned.engine, at, pinned.view) : null;
      name = m?.name || '';
    } catch (_) { /* ignore */ }
    out.floating.push({
      id: pinned.persistId || `inspector:${fid}:${at}`,
      kind: 'inspector',
      geom,
      fileId: fid,
      anchor: { kind: 'symbol', name, posHint: at },
      followEditor: !!pinned.followEditor,
      zOrder: Number(pinned.win.el?.style?.zIndex) || 0,
    });
  }
}

export function restoreFloatingInspectorWindow(entry, view) {
  if (!entry?.anchor || entry.kind !== 'inspector') return false;
  const at = resolveInspectorAnchorPos(view, entry.anchor);
  if (at == null) return false;
  return openInspectorWindow(view, at, {
    geom: entry.geom,
    followEditor: entry.followEditor,
    persistId: entry.id,
    forceNew: true,
  });
}
