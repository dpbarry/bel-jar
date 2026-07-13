const editorMount = document.getElementById('editor');
const editorEmptyEl = document.getElementById('editor-empty');
const inspectorProjectEmptyEl = document.getElementById('inspector-project-empty');
const cmdInput = document.getElementById('command-input');

// ── Project init ──────────────────────────────────────────────────────────────

if (typeof BelJarPersist !== 'undefined') {
  BelJarPersist.ensureProject();
  ensureProjectActiveCfgs();
}

if (typeof BelJarEditHistoryBridge !== 'undefined') {
  BelJarEditHistoryBridge.init();
}

const openFileIds =
  typeof BelJarPersist !== 'undefined' ? BelJarPersist.getOpenFileIds() : [];
const activeFileId = openFileIds.length
  ? (openFileIds.includes(BelJarPersist.getActiveFileId())
    ? BelJarPersist.getActiveFileId()
    : openFileIds[0])
  : null;

let persist =
  activeFileId && typeof BelJarPersist !== 'undefined'
    ? BelJarPersist.createPersist({ documentId: activeFileId })
    : null;

const initialCheckpoint = persist ? persist.getInitialCheckpoint() : null;

// Mount an editor for a persisted snapshot. Used at startup and on every file
// switch — each document gets a fresh editor + semantic engine so symbol
// identity, checkpoints, and providers are always keyed to the right file.
function mountEditorFor(snapshot, openOpts) {
  if (typeof BelJarEditor === 'undefined' || !BelJarEditor.mount) return null;
  const initialLocal = openOpts && openOpts.initialLocal != null
    ? openOpts.initialLocal
    : (snapshot ? snapshot.editor.local : null);
  const docId = (persist && persist.getCurrentFileId())
    || (snapshot && snapshot.meta && snapshot.meta.documentId)
    || undefined;
  const file = docId && typeof BelJarPersist !== 'undefined'
    ? BelJarPersist.getFileById(docId)
    : null;
  const ed = BelJarEditor.mount(editorMount, {
    doc: snapshot ? snapshot.editor.text : (persist ? persist.getEditorText() : ''),
    initialLocal,
    semanticCheckpoint: snapshot ? snapshot.semantic : null,
    documentId: docId,
    filePath: file ? file.name : undefined,
    jumpAt: openOpts && openOpts.jumpAt,
    persist,
    onDocChange: function (text) {
      // text === null on the main editor's input path: persist materializes the
      // live doc lazily at save time (getText provider), so we only mark dirty.
      if (persist) {
        if (text == null && typeof persist.markEditorDirty === 'function') {
          persist.markEditorDirty();
        } else {
          persist.scheduleEditorPersist(text);
        }
      }
      if (file && /\.cfg$/i.test(file.name)) scheduleCfgExplorerRefresh(file.name);
    },
  });
  if (ed && typeof BelJarEditHistory !== 'undefined') {
    queueMicrotask(() => {
      const id = ed.getCurrentFileId?.();
      const text = ed.getValue?.();
      if (id != null && text != null) BelJarEditHistory.reconcileActiveFile(id, text);
    });
  }
  return ed;
}

// ── Workspace state restore ───────────────────────────────────────────────────

function getActiveEditorView() {
  return editor && editor.getView ? editor.getView() : null;
}

function getSemanticEngine() {
  return editor && editor.getSemanticEngine ? editor.getSemanticEngine() : null;
}

function collectWorkspaceFloating(fileId, out) {
  if (!fileId || !out) return;
  if (typeof BelJarEditor !== 'undefined') {
    if (BelJarEditor.collectFloatingInspectorWindows) {
      BelJarEditor.collectFloatingInspectorWindows(fileId, out);
    }
    if (BelJarEditor.collectFloatingGraphWindows) {
      BelJarEditor.collectFloatingGraphWindows(fileId, out);
    }
  }
  if (typeof BelJarHarpoon !== 'undefined' && BelJarHarpoon.collectFloatingHarpoonWindows) {
    BelJarHarpoon.collectFloatingHarpoonWindows(fileId, out);
  }
}

function restoreWorkspaceFloating(floats, deps) {
  const view = deps && deps.view;
  const engine = deps && deps.engine;
  if (!view || !Array.isArray(floats)) return;
  const sorted = floats.slice().sort((a, b) => (a.zOrder || 0) - (b.zOrder || 0));
  let skipped = 0;
  for (const entry of sorted) {
    let ok = false;
    if (entry.kind === 'inspector' && typeof BelJarEditor !== 'undefined'
      && BelJarEditor.restoreFloatingInspectorWindow) {
      ok = BelJarEditor.restoreFloatingInspectorWindow(entry, view);
    } else if (entry.kind === 'graph' && typeof BelJarEditor !== 'undefined'
      && BelJarEditor.restoreFloatingGraphWindow) {
      ok = BelJarEditor.restoreFloatingGraphWindow(entry, view);
    } else if (entry.kind === 'harpoon' && typeof BelJarHarpoon !== 'undefined'
      && BelJarHarpoon.restoreFloatingHarpoonWindow) {
      ok = BelJarHarpoon.restoreFloatingHarpoonWindow(entry, view, engine);
    }
    if (!ok) skipped += 1;
  }
  if (skipped > 0 && typeof BelJarToasts !== 'undefined' && BelJarToasts.error) {
    BelJarToasts.error(
      skipped === 1
        ? 'Could not restore a floating window after reload.'
        : `Could not restore ${skipped} floating windows after reload.`,
      { duration: 5000 },
    );
  }
}

function registerWorkspaceProviders() {
  if (typeof BelJarWorkspaceState === 'undefined') return;
  BelJarWorkspaceState.registerProvider('inspector', {
    collect(out) {
      if (typeof BelJarEditor !== 'undefined' && BelJarEditor.collectWorkspaceInspector) {
        BelJarEditor.collectWorkspaceInspector(out);
      }
    },
    restoreSidebar(sidebar, deps) {
      if (typeof BelJarEditor !== 'undefined' && BelJarEditor.restoreWorkspaceInspector) {
        BelJarEditor.restoreWorkspaceInspector(sidebar, deps);
      }
    },
  });
  BelJarWorkspaceState.registerProvider('explorer', {
    collect(out) {
      if (explorerController && explorerController.collectWorkspaceExplorer) {
        explorerController.collectWorkspaceExplorer(out);
      }
    },
    restoreSidebar(sidebar) {
      if (!workspaceEl?.classList.contains('is-explorer-open')) return;
      if (explorerController && explorerController.restoreWorkspaceExplorer) {
        explorerController.restoreWorkspaceExplorer(sidebar);
      }
    },
  });
  BelJarWorkspaceState.registerProvider('harpoon-panel', {
    collect(out) {
      if (typeof BelJarHarpoonPanel !== 'undefined' && BelJarHarpoonPanel.collectWorkspaceHarpoon) {
        BelJarHarpoonPanel.collectWorkspaceHarpoon(out);
      }
    },
    restoreSidebar(sidebar, deps) {
      if (!workspaceEl?.classList.contains('is-harpoon-open')) return;
      if (typeof BelJarHarpoonPanel !== 'undefined' && BelJarHarpoonPanel.restoreWorkspaceHarpoon) {
        BelJarHarpoonPanel.restoreWorkspaceHarpoon(sidebar, deps);
      }
    },
  });
  BelJarWorkspaceState.registerProvider('floating', {
    collect(out) {
      const fileId = persist
        ? persist.getCurrentFileId()
        : (typeof BelJarPersist !== 'undefined' ? BelJarPersist.getActiveFileId() : null);
      collectWorkspaceFloating(fileId, out);
    },
  });
}

function applyStoredSidePanel(id) {
  if (!id || typeof BelJarPersist === 'undefined') return;
  if (typeof BelJarPersist.readStoredRestorePanels === 'function'
    && !BelJarPersist.readStoredRestorePanels()) return;
  closeOtherSidePanels(id);
  setSidePanelOpen(id, true);
  notifySidePanelLayout();
}

let workspaceBootPending = true;
const restoredFloatIds = new Set();

function restoreWorkspaceForFile(fileId) {
  if (!fileId || typeof BelJarWorkspaceState === 'undefined') return;
  const ws = BelJarWorkspaceState.readWorkspace();
  const openIds = typeof BelJarPersist !== 'undefined' ? BelJarPersist.getOpenFileIds() : [];
  const floats = BelJarWorkspaceState.filterFloatingForFile(ws.floating, fileId, openIds)
    .filter((entry) => !restoredFloatIds.has(entry.id));
  if (!floats.length) return;
  restoreWorkspaceFloating(floats, {
    view: getActiveEditorView(),
    engine: getSemanticEngine(),
    activeFileId: fileId,
  });
  floats.forEach((entry) => restoredFloatIds.add(entry.id));
}

function restoreWorkspaceState() {
  if (typeof BelJarWorkspaceState === 'undefined' || typeof BelJarPersist === 'undefined') return;
  const ws = BelJarWorkspaceState.readWorkspace();
  BelJarWorkspaceState.applyWorkspace(ws, {
    projectId: BelJarPersist.getActiveProjectId(),
    openFileIds: BelJarPersist.getOpenFileIds(),
    activeFileId: persist ? persist.getCurrentFileId() : BelJarPersist.getActiveFileId(),
    view: getActiveEditorView(),
    engine: getSemanticEngine(),
    applySidePanel: applyStoredSidePanel,
    restoreFloating: (floats, deps) => {
      const pending = (floats || []).filter((entry) => !restoredFloatIds.has(entry.id));
      if (!pending.length) return;
      restoreWorkspaceFloating(pending, deps);
      pending.forEach((entry) => restoredFloatIds.add(entry.id));
    },
  });
}

function isCfgFileName(name) {
  return /\.cfg$/i.test(String(name || ''));
}

function editorViewIsCfg(ed) {
  if (!ed || typeof ed.getView !== 'function') return false;
  const view = ed.getView();
  return !!(view && view.dom && view.dom.classList.contains('bel-editor--cfg'));
}

function remountActiveEditor(openOpts) {
  if (!persist || !editor) return;
  const id = persist.getCurrentFileId();
  if (!id) return;
  // Flush while the live-text provider still points at the current editor, so
  // the snapshot below carries the up-to-date doc (text is now pulled lazily).
  persist.flushCheckpoint();
  const snapshot = persist.getInitialCheckpoint();
  editor.destroy();
  editor = mountEditorFor(snapshot, openOpts || {});
  window.BelJarCurrentEditor = editor;
  syncEditorCmTheme();
  if (typeof BelugaClient !== 'undefined' && BelugaClient.noteEditorChange) {
    BelugaClient.noteEditorChange(editor ? editor.getValue() : '');
  }
  notifyActiveEditorView();
  refreshInspector();
  updateRunButtonTooltip();
}

function ensureEditorMatchesFileKind() {
  if (!persist || !editor || typeof BelJarPersist === 'undefined') return;
  const id = persist.getCurrentFileId();
  if (!id) return;
  const file = BelJarPersist.getFileById(id);
  if (!file) return;
  if (isCfgFileName(file.name) !== editorViewIsCfg(editor)) remountActiveEditor();
}

let editor = activeFileId ? mountEditorFor(initialCheckpoint) : null;
ensureEditorMatchesFileKind();

window.BelJarCurrentEditor = editor;

let cfgExplorerRefreshTimer = null;

// Authoritative project text: the open editor buffer for the active file,
// otherwise the persisted checkpoint (backend may lag autosave).
function projectFileText(fileId) {
  if (!fileId || typeof BelJarPersist === 'undefined') return '';
  const activeId = BelJarPersist.getActiveFileId();
  const ed = typeof window !== 'undefined' ? window.BelJarCurrentEditor : null;
  if (fileId === activeId && ed && typeof ed.getValue === 'function') {
    return ed.getValue();
  }
  return BelJarPersist.getFileText(fileId) ?? '';
}

function scheduleCfgExplorerRefresh(cfgName) {
  clearTimeout(cfgExplorerRefreshTimer);
  cfgExplorerRefreshTimer = setTimeout(() => onCfgContentChange(cfgName), 80);
}

// Live cfg edits change suite membership and dangling-entry state — refresh
// without reloadActiveEditorFromPersist (would fight the in-flight buffer).
function onCfgContentChange(cfgName) {
  if (typeof BelJarProjectSource === 'undefined') return;
  const dir = BelJarProjectSource.dirOf(cfgName);
  reconcileActiveCfgsInDir(dir, cfgName);
  const activeFile = activeFileRecord();
  if (editor?.remoduleContext && activeFile && BelJarProjectSource.dirOf(activeFile.name) === dir) {
    editor.remoduleContext();
  }
  renderExplorerTree();
  updateHeaderContext();
  updateRunButtonTooltip();
}

function projectIsEmpty() {
  return typeof BelJarPersist !== 'undefined' && BelJarPersist.listFiles().length === 0;
}

function projectTreeEmpty() {
  return typeof BelJarPersist !== 'undefined'
    && BelJarPersist.listFiles().length === 0
    && BelJarPersist.listEmptyFolders().length === 0;
}

function updateInspectorProjectEmpty() {
  if (!inspectorPanelEl) return;
  const body = inspectorPanelEl.querySelector('.inspector-body');
  const empty = projectTreeEmpty();
  if (inspectorProjectEmptyEl) inspectorProjectEmptyEl.hidden = !empty;
  if (body) body.hidden = empty;
}

function editorCanvasIdle() {
  if (typeof BelJarPersist === 'undefined') return false;
  if (projectIsEmpty()) return true;
  return BelJarPersist.getOpenFileIds().length === 0;
}

function updateEditorEmptyState() {
  const idle = editorCanvasIdle();
  if (editorEmptyEl) editorEmptyEl.hidden = !idle;
  if (editorMount) editorMount.classList.toggle('is-inactive', idle);
  const runBtn = document.getElementById('btn-load');
  if (runBtn) runBtn.disabled = idle;
  const statusDot = document.getElementById('ide-status-dot');
  if (statusDot) statusDot.hidden = idle;
}

function enterCanvasIdleView() {
  if (persist) persist.flushCheckpoint();
  if (typeof BelJarWorkspaceState !== 'undefined') BelJarWorkspaceState.flushWorkspace();
  if (editor && typeof editor.destroy === 'function') editor.destroy();
  editor = null;
  window.BelJarCurrentEditor = null;
  if (projectIsEmpty()) persist = null;
  if (typeof FloatingWindow !== 'undefined' && FloatingWindow.closeAll) FloatingWindow.closeAll();
  if (typeof BelugaClient !== 'undefined' && BelugaClient.noteEditorChange) {
    BelugaClient.noteEditorChange('');
  }
  updateEditorEmptyState();
  updateInspectorProjectEmpty();
  renderTabs();
  renderExplorerTree();
  updateHeaderContext();
}

function enterEmptyProjectView() {
  if (typeof BelJarPersist !== 'undefined' && BelJarPersist.clearEmptyFolders) {
    BelJarPersist.clearEmptyFolders();
  }
  enterCanvasIdleView();
}

function ensurePersistForFile(id) {
  if (!id || typeof BelJarPersist === 'undefined') return null;
  if (!persist) persist = BelJarPersist.createPersist({ documentId: id });
  return persist;
}

function syncEditorCmTheme() {
  if (!editor || typeof editor.setDarkTheme !== 'function') return;
  editor.setDarkTheme(!document.documentElement.classList.contains('light'));
}
window.syncEditorCmTheme = syncEditorCmTheme;
if (editor) syncEditorCmTheme();

function onWorkspaceLayoutResize() {
  if (editor && editor.getView) editor.getView().requestMeasure();
}
if (typeof BelJarWorkspaceSplit !== 'undefined') {
  BelJarWorkspaceSplit.init({ onResize: onWorkspaceLayoutResize });
}
if (typeof BelJarSidePanelResize !== 'undefined') {
  BelJarSidePanelResize.init({ onResize: onWorkspaceLayoutResize });
}

if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.insertWelcomeBanner();
if (typeof BelJarBelugaRun !== 'undefined') BelJarBelugaRun.init();
if (typeof BelJarToasts !== 'undefined') BelJarToasts.init();
if (typeof BelJarNotifications !== 'undefined') BelJarNotifications.init();

function shouldApplyEditorPrefs(key) {
  if (!key || key === 'layout-reset') return false;
  if (key === 'theme') return false;
  if (/^repl-/.test(key) || key === 'repl-reset') return false;
  if (/^beluga-/.test(key) || key === 'beluga-reset') return false;
  if (key === 'workspace-reset' || key === 'restore-panels' || key === 'library-expand-default') return false;
  if (/^alias/.test(key) || key === 'aliases-reset') return false;
  return true;
}

function applyLiveSettings(key) {
  if (!key || key === 'layout-reset') return;
  if (key === 'theme' || key === 'appearance-reset') syncEditorCmTheme();
  if (shouldApplyEditorPrefs(key)) {
    if (typeof BelJarEditor !== 'undefined' && typeof BelJarEditor.applyEditorPrefs === 'function') {
      BelJarEditor.applyEditorPrefs();
    }
  }
  if ((key === 'library-expand-default' || key === 'workspace-reset')
    && libraryController && typeof libraryController.refresh === 'function') {
    libraryController.refresh();
  }
}

window.beljarApplyLiveSettings = applyLiveSettings;
window.addEventListener('beljar:settings-changed', function (e) {
  applyLiveSettings(e && e.detail ? e.detail.key : '');
});

function showToast(message, opts) {
  if (typeof BelJarToasts === 'undefined') return null;
  return BelJarToasts.show(message, opts);
}

if (!editor && (typeof BelJarEditor === 'undefined' || !BelJarEditor.mount)) {
  if (typeof BelJarToasts !== 'undefined') {
    BelJarToasts.error('CodeMirror editor bundle failed to load.', { duration: 0, closable: true });
  }
}

function setBelJarTip(el, text, opts) {
  if (!el || typeof Tooltips === 'undefined' || !Tooltips.set) return;
  Tooltips.set(el, text, opts);
}

function toggleTheme() {
  document.documentElement.classList.toggle('light');
  var isLight = document.documentElement.classList.contains('light');
  if (typeof BelJarPersist !== 'undefined') BelJarPersist.writeStoredTheme(isLight ? 'light' : 'dark');
  syncEditorCmTheme();
}

window.BelJarRepl = {
  appendBuffered: function (text, kind) {
    if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.appendOutput(text, kind || 'auto');
  },
};

// ── Sidebar: Explorer / Inspector (shared slot) ───────────────────────────────

const filesBtn = document.getElementById('btn-files');
const inspectorBtn = document.getElementById('btn-inspector');
const libraryBtn = document.getElementById('btn-library');
const harpoonBtn = document.getElementById('btn-harpoon');
const workspaceEl = document.querySelector('.workspace');
const explorerPanelEl = document.getElementById('explorer-panel');
const inspectorPanelEl = document.getElementById('inspector-panel');
const libraryPanelEl = document.getElementById('library-panel');
const harpoonPanelEl = document.getElementById('harpoon-panel');

const SIDE_PANELS = {
  explorer: {
    btn: filesBtn,
    panel: explorerPanelEl,
    openClass: 'is-explorer-open',
    writeOpen: (open) => {
      if (typeof BelJarPersist !== 'undefined') BelJarPersist.writeStoredExplorerOpen(open);
    },
  },
  inspector: {
    btn: inspectorBtn,
    panel: inspectorPanelEl,
    openClass: 'is-inspector-open',
    writeOpen: (open) => {
      if (typeof BelJarPersist !== 'undefined') BelJarPersist.writeStoredInspectorOpen(open);
    },
  },
  library: {
    btn: libraryBtn,
    panel: libraryPanelEl,
    openClass: 'is-library-open',
    writeOpen: (open) => {
      if (typeof BelJarPersist !== 'undefined') BelJarPersist.writeStoredLibraryOpen(open);
    },
  },
  harpoon: {
    btn: harpoonBtn,
    panel: harpoonPanelEl,
    openClass: 'is-harpoon-open',
    writeOpen: (open) => {
      if (typeof BelJarPersist !== 'undefined' && BelJarPersist.writeStoredHarpoonOpen) {
        BelJarPersist.writeStoredHarpoonOpen(open);
      }
    },
  },
};

function wireSidebarOpenTooltip(btn) {
  if (!btn || typeof Tooltips === 'undefined') return () => {};
  btn.addEventListener('mouseleave', () => {
    Tooltips.releaseAnchor(btn);
  });
  return () => {
    Tooltips.suppressAnchor(btn);
    Tooltips.hideImmediate();
  };
}

function setSidePanelOpen(id, open) {
  const cfg = SIDE_PANELS[id];
  if (!workspaceEl || !cfg) return;
  workspaceEl.classList.toggle(cfg.openClass, open);
  if (cfg.btn) {
    cfg.btn.classList.toggle('is-active', open);
    cfg.btn.setAttribute('aria-pressed', open ? 'true' : 'false');
  }
  if (cfg.panel) cfg.panel.setAttribute('aria-hidden', open ? 'false' : 'true');
  cfg.writeOpen(open);
  if (typeof BelJarPersist !== 'undefined' && BelJarPersist.writeStoredActiveSidePanel) {
    if (open) BelJarPersist.writeStoredActiveSidePanel(id);
    else if (!getOpenSidePanelId()) BelJarPersist.writeStoredActiveSidePanel(null);
  }
  if (typeof BelJarWorkspaceState !== 'undefined') BelJarWorkspaceState.scheduleSave();
}

function getOpenSidePanelId() {
  if (!workspaceEl) return null;
  for (const id of ['harpoon', 'library', 'inspector', 'explorer']) {
    const cfg = SIDE_PANELS[id];
    if (cfg && workspaceEl.classList.contains(cfg.openClass)) return id;
  }
  return null;
}

function closeOtherSidePanels(id) {
  for (const otherId of Object.keys(SIDE_PANELS)) {
    if (otherId !== id) setSidePanelOpen(otherId, false);
  }
}

function notifySidePanelLayout() {
  if (editor && editor.getView) editor.getView().requestMeasure();
  window.dispatchEvent(new Event('resize'));
}

function toggleSidePanel(id) {
  const cfg = SIDE_PANELS[id];
  if (!workspaceEl || !cfg) return false;
  const open = !workspaceEl.classList.contains(cfg.openClass);
  if (open) closeOtherSidePanels(id);
  setSidePanelOpen(id, open);
  notifySidePanelLayout();
  return open;
}

if (filesBtn && workspaceEl) {
  const hideExplorerTooltipUntilLeave = wireSidebarOpenTooltip(filesBtn);
  filesBtn.addEventListener('click', () => {
    const wasOpen = workspaceEl.classList.contains('is-explorer-open');
    if (!wasOpen) hideExplorerTooltipUntilLeave();
    toggleSidePanel('explorer');
  });
}

// ── File tabs ─────────────────────────────────────────────────────────────────

const editorTabsEl = document.getElementById('editor-tabs');
const cfgTabLint = new Map();

function liveFileLint() {
  const ed = window.BelJarCurrentEditor;
  if (!ed || typeof ed.getIdeStatus !== 'function') return null;
  const st = ed.getIdeStatus();
  return { errors: st.errors, warnings: st.warnings };
}

function belFileHealth(fileId) {
  if (typeof BelJarEditor === 'undefined' || typeof BelJarEditor.fileHealthFor !== 'function') {
    return { errors: 0, warnings: 0, items: [] };
  }
  const activeId = typeof BelJarPersist !== 'undefined' ? BelJarPersist.getActiveFileId() : null;
  let live = null;
  if (fileId === activeId && window.BelJarCurrentEditor?.getValue) {
    live = window.BelJarCurrentEditor.getValue();
  }
  return BelJarEditor.fileHealthFor(fileId, live);
}

function fileLintCounts(fileId, activeId) {
  const file = typeof BelJarPersist !== 'undefined' ? BelJarPersist.getFileById(fileId) : null;
  const name = file?.name || '';
  if (/\.cfg$/i.test(name)) {
    return fileId === activeId ? liveFileLint() : cfgTabLint.get(fileId);
  }
  if (BelJarProjectSource.isSignaturePath(name)) {
    return belFileHealth(fileId);
  }
  return null;
}

function fileTabHasErrors(fileId, activeId) {
  const lint = fileLintCounts(fileId, activeId);
  return !!(lint && lint.errors > 0);
}

function rememberCfgLint(fileId, lint) {
  if (!fileId || !lint) return;
  cfgTabLint.set(fileId, {
    errors: lint.errors || 0,
    warnings: lint.warnings || 0,
    items: Array.isArray(lint.items) ? lint.items : cfgTabLint.get(fileId)?.items,
  });
}

function lintTooltipHead(items) {
  if (!items || !items.length) return '';
  const errs = items.filter((d) => d.kind === 'error').length;
  const warns = items.length - errs;
  const parts = [];
  if (errs) parts.push(errs === 1 ? '1 error' : `${errs} errors`);
  if (warns) parts.push(warns === 1 ? '1 warning' : `${warns} warnings`);
  return parts.join(' · ');
}

function explorerFileDiagItems(fileId, fileName) {
  const low = String(fileName || '').toLowerCase();
  if (low.endsWith('.cfg')) {
    const activeId = BelJarPersist.getActiveFileId();
    const ed = window.BelJarCurrentEditor;
    if (fileId === activeId && ed && typeof ed.getLintTooltipItems === 'function') {
      return ed.getLintTooltipItems();
    }
    const cached = cfgTabLint.get(fileId);
    return cached && Array.isArray(cached.items) ? cached.items : null;
  }
  if (BelJarProjectSource.isSignaturePath(fileName)) {
    const health = belFileHealth(fileId);
    return health?.items?.length ? health.items : null;
  }
  return null;
}

function bindExplorerDiagTip(el, fileId, fileName, diag) {
  if (!el || !diag) return;
  el.removeAttribute('title');
  const items = explorerFileDiagItems(fileId, fileName);
  if (items && items.length) {
    el.setAttribute('data-tooltip', lintTooltipHead(items));
    el.setAttribute('data-tooltip-head', '');
    el.setAttribute('data-tooltip-errors', JSON.stringify(items));
    if (typeof Tooltips !== 'undefined' && Tooltips.bind) Tooltips.bind(el);
    return;
  }
  setBelJarTip(el, diag === 'error' ? 'Has errors' : 'Has warnings', { ariaLabel: false });
}

function updateTabLintStyles() {
  if (!editorTabsEl) return;
  const activeId = persist ? persist.getCurrentFileId() : BelJarPersist.getActiveFileId();
  editorTabsEl.querySelectorAll('.editor-tab[data-file-id]').forEach((tab) => {
    const id = tab.getAttribute('data-file-id');
    tab.classList.toggle('has-errors', fileTabHasErrors(id, activeId));
  });
  // Mirror the error state into the explorer rows (in place, no re-render).
  if (explorerController && typeof explorerController.refreshDiags === 'function') {
    explorerController.refreshDiags();
  }
}

let tabLintStyleRaf = 0;
function scheduleTabLintStyles() {
  if (tabLintStyleRaf) return;
  tabLintStyleRaf = requestAnimationFrame(() => {
    tabLintStyleRaf = 0;
    updateTabLintStyles();
  });
}

function renderTabs() {
  if (!editorTabsEl || typeof BelJarPersist === 'undefined') return;
  // Tabs show OPEN files only — the explorer lists the whole project. (A folder
  // import of hundreds of files must not produce hundreds of tabs.)
  const files = BelJarPersist.getOpenFileIds()
    .map((id) => BelJarPersist.getFileById(id))
    .filter(Boolean);
  const activeId = persist ? persist.getCurrentFileId() : BelJarPersist.getActiveFileId();
  editorTabsEl.innerHTML = '';

  files.forEach((file) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.role = 'tab';
    tab.className = 'editor-tab'
      + (file.id === activeId ? ' is-active' : '')
      + (fileTabHasErrors(file.id, activeId) ? ' has-errors' : '');
    tab.setAttribute('aria-selected', file.id === activeId ? 'true' : 'false');
    tab.setAttribute('data-file-id', file.id);

    const baseName = file.name.split('/').pop();
    tab.setAttribute('aria-label', baseName);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'editor-tab-name';
    nameSpan.textContent = baseName;
    if (typeof Tooltips !== 'undefined') Tooltips.bindOverflow(nameSpan, () => baseName);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'editor-tab-close';
    setBelJarTip(closeBtn, 'Close');
    closeBtn.setAttribute('tabindex', '-1');
    closeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFile(file.id);
    });

    tab.appendChild(nameSpan);
    tab.appendChild(closeBtn);
    tab.addEventListener('click', () => switchToFile(file.id));
    editorTabsEl.appendChild(tab);
  });

  // + new-file button
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'editor-tab-new';
  setBelJarTip(newBtn, 'New file');
  newBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  newBtn.addEventListener('click', () => newFile());
  editorTabsEl.appendChild(newBtn);

  // Scroll active tab into view.
  const activeTab = editorTabsEl.querySelector('.editor-tab.is-active');
  if (activeTab) activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// Explorer tree (rendering, fold state, DnD) — see js/explorer-tree.js
let explorerController = null;
let explorerSearchController = null;
let libraryController = null;

function ensureProjectActiveCfgs() {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return;
  if (typeof BelJarProjectSource.inferActiveCfgByDir !== 'function') return;
  if (typeof BelJarPersist.backfillActiveCfgByDir !== 'function') return;
  const files = BelJarPersist.listFiles();
  const getText = (id) => projectFileText(id);
  BelJarPersist.backfillActiveCfgByDir(BelJarProjectSource.inferActiveCfgByDir(files, getText));
}

function ensureActiveCfgForDir(dir) {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return;
  if (BelJarPersist.getActiveCfgForDir(dir)) return;
  if (typeof BelJarProjectSource.inferActiveCfgForDir !== 'function') return;
  const files = BelJarPersist.listFiles();
  const path = BelJarProjectSource.inferActiveCfgForDir(files, projectFileText, dir);
  if (path) BelJarPersist.setActiveCfgForDir(dir, path);
}

function activeCfgForDir(dir) {
  if (typeof BelJarPersist === 'undefined') return null;
  const path = BelJarPersist.getActiveCfgForDir(dir);
  if (!path) return null;
  return BelJarPersist.listFiles().some((f) => f.name === path) ? path : null;
}

function activeCfgsForDir(dir) {
  if (typeof BelJarPersist === 'undefined') return [];
  const names = new Set(BelJarPersist.listFiles().map((f) => f.name));
  return BelJarPersist.getActiveCfgsForDir(dir).filter((p) => names.has(p));
}

function suiteMembersResolver(all, cfgPath, gt) {
  return BelJarProjectSource.orderedPathsForCfg(all, cfgPath, gt);
}

function suiteLayoutForDir(dir, filesInDir) {
  const SL = typeof BelJarExplorerSuiteLayout !== 'undefined' ? BelJarExplorerSuiteLayout : null;
  if (!SL || typeof SL.computeDirLayout !== 'function') {
    return { orderedFiles: filesInDir, suiteByFile: {} };
  }
  const active = activeCfgsForDir(dir);
  const allFiles = BelJarPersist.listFiles();
  const getText = projectFileText;
  return SL.computeDirLayout(filesInDir, active, suiteMembersResolver, allFiles, getText);
}

function owningActiveCfgForFile(fileName) {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return null;
  const dir = BelJarProjectSource.dirOf(fileName);
  const activeCfgs = activeCfgsForDir(dir);
  if (!activeCfgs.length) return null;
  const files = BelJarPersist.listFiles();
  const getText = projectFileText;
  return BelJarProjectSource.resolveOwningActiveCfg(files, fileName, getText, activeCfgs);
}

function reconcileActiveCfgsInDir(dir, editedCfg) {
  if (typeof BelJarExplorerSuiteLayout === 'undefined') return;
  const active = activeCfgsForDir(dir);
  if (active.length < 2) return;
  const SL = BelJarExplorerSuiteLayout;
  const files = BelJarPersist.listFiles();
  const getText = projectFileText;
  if (editedCfg && active.includes(editedCfg)) {
    const others = active.filter((c) => c !== editedCfg);
    if (SL.findCfgIntersection(editedCfg, others, files, getText, suiteMembersResolver).length) {
      BelJarPersist.removeActiveCfgForDir(dir, editedCfg);
      return;
    }
  }
  for (let i = 1; i < active.length; i++) {
    const cfg = active[i];
    const earlier = active.slice(0, i);
    if (SL.findCfgIntersection(cfg, earlier, files, getText, suiteMembersResolver).length) {
      BelJarPersist.removeActiveCfgForDir(dir, cfg);
    }
  }
}

function makeActiveCfgForFile(fileName) {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return;
  const dir = BelJarProjectSource.dirOf(fileName);
  const active = activeCfgsForDir(dir);
  const files = BelJarPersist.listFiles();
  const getText = projectFileText;
  const SL = typeof BelJarExplorerSuiteLayout !== 'undefined' ? BelJarExplorerSuiteLayout : null;

  if (active.includes(fileName)) {
    BelJarPersist.removeActiveCfgForDir(dir, fileName);
  } else if (SL) {
    const check = SL.canActivateCfg(fileName, active, files, getText, suiteMembersResolver);
    if (!check.ok) {
      showToast(check.reason || 'Cannot activate suite', { kind: 'warn' });
      return;
    }
    BelJarPersist.addActiveCfgForDir(dir, fileName);
  } else {
    BelJarPersist.setActiveCfgForDir(dir, fileName);
  }

  const activeId = BelJarPersist.getActiveFileId();
  const activeFile = BelJarPersist.getFileById(activeId);
  if (editor?.remoduleContext && activeFile
    && BelJarProjectSource.dirOf(activeFile.name) === dir) {
    editor.remoduleContext();
  }
  renderExplorerTree();
  updateHeaderContext();
  updateRunButtonTooltip();
}

// The module (.cfg basename) for the file's folder active cfg, or null when standalone.
function moduleNameFor(fileId) {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return null;
  const files = BelJarPersist.listFiles();
  const getText = projectFileText;
  const id = fileId || BelJarPersist.getActiveFileId();
  const dev = BelJarProjectSource.developmentForFile(files, id, getText);
  if (dev.kind !== 'module' || !dev.cfg) return null;
  return dev.cfg.slice(dev.cfg.lastIndexOf('/') + 1).replace(/\.cfg$/i, '');
}

// The active suite (.cfg) for a file's folder, whether the file is listed in it,
// and its load-order index — drives the "Add to / Remove from / Move in suite"
// context-menu actions.
function activeSuiteMembership(fileName) {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') {
    return { cfg: null, member: false, index: -1, count: 0 };
  }
  const cfg = owningActiveCfgForFile(fileName);
  if (!cfg) return { cfg: null, member: false, index: -1, count: 0 };
  const files = BelJarPersist.listFiles();
  const getText = projectFileText;
  const paths = BelJarProjectSource.developmentFilesForCfg(files, cfg, getText).map((f) => f.name);
  const index = paths.indexOf(fileName);
  return { cfg, member: index !== -1, index, count: paths.length };
}

// Does a .cfg list an entry that doesn't resolve to a project file? Cheap and
// project-wide — no Beluga — so the explorer can badge a broken suite definition
// without opening it. Mirrors editor-src/bel-cfg-lint.mjs.
function cfgHasDanglingEntry(cfgName) {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return false;
  const files = BelJarPersist.listFiles();
  const cfgFile = files.find((f) => f.name === cfgName);
  if (!cfgFile) return false;
  const names = new Set(files.map((f) => f.name));
  const dir = BelJarProjectSource.dirOf(cfgName);
  for (const entry of BelJarProjectSource.parseCfg(projectFileText(cfgFile.id))) {
    if (!BelJarProjectSource.isCfgEntryToken(entry)) continue;
    if (!names.has(dir ? dir + '/' + entry : entry)) return true;
  }
  return false;
}

// Explorer error indicator: .cfg via cfg lint cache; .bel/.elf via dev-check + live beluga (derived, not persisted).
function explorerFileDiag(fileId, fileName) {
  const low = String(fileName || '').toLowerCase();
  if (low.endsWith('.cfg')) {
    if (cfgHasDanglingEntry(fileName)) return 'warning';
    const activeId = persist ? persist.getCurrentFileId() : BelJarPersist.getActiveFileId();
    const lint = fileId === activeId ? liveFileLint() : cfgTabLint.get(fileId);
    if (lint && lint.errors > 0) return 'error';
    if (lint && lint.warnings > 0) return 'warning';
    return null;
  }
  if (BelJarProjectSource.isSignaturePath(fileName)) {
    const health = belFileHealth(fileId);
    if (health.errors > 0) return 'error';
    if (health.warnings > 0) return 'warning';
    return null;
  }
  return null;
}

// Refresh everything that depends on suite membership after a cfg-body edit:
// the active file may have gained/lost a prelude, so re-module it.
function afterSuiteEdit(dir, editedCfg) {
  if (!editedCfg) {
    const activeFile = BelJarPersist.getFileById(BelJarPersist.getActiveFileId());
    if (activeFile && /\.cfg$/i.test(activeFile.name)
      && BelJarProjectSource.dirOf(activeFile.name) === dir) {
      editedCfg = activeFile.name;
    }
  }
  reconcileActiveCfgsInDir(dir, editedCfg);
  const activeId = BelJarPersist.getActiveFileId();
  const activeFile = BelJarPersist.getFileById(activeId);
  if (editor?.remoduleContext && activeFile && BelJarProjectSource.dirOf(activeFile.name) === dir) {
    editor.remoduleContext();
  }
  reloadActiveEditorFromPersist();
  renderExplorerTree();
  renderTabs();
  updateHeaderContext();
  updateRunButtonTooltip();
  if (libraryController && typeof libraryController.refresh === 'function') {
    libraryController.refresh();
  }
}

function activeFileRecord() {
  if (typeof BelJarPersist === 'undefined') return null;
  const id = persist ? persist.getCurrentFileId() : BelJarPersist.getActiveFileId();
  return id ? BelJarPersist.getFileById(id) : null;
}

function updateRunButtonTooltip() {
  const btn = document.getElementById('btn-load');
  if (!btn) return;
  const file = activeFileRecord();
  if (file && /\.cfg$/i.test(file.name)) {
    setBelJarTip(btn, 'Run suite');
  } else {
    setBelJarTip(btn, 'Run suite to here\nCtrl+click: run suite');
  }
}

function renameFolderPrefix(from, to) {
  if (typeof BelJarPersist === 'undefined' || !from || from === to) return;
  const files = BelJarPersist.listFiles();
  const moves = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f.name !== from && !f.name.startsWith(from + '/')) continue;
    const rel = f.name === from ? '' : f.name.slice(from.length + 1);
    const newPath = to ? (rel ? to + '/' + rel : to) : rel;
    if (newPath !== f.name) {
      moves.push({ from: f.name, to: newPath });
      BelJarPersist.renameFile(f.id, newPath);
    }
  }
  BelJarPersist.preserveEmptyFoldersAfterMoves(moves);
  reloadActiveEditorFromPersist();
  BelJarPersist.renameEmptyFolderPrefix(from, to);
  renderTabs();
  updateHeaderContext();
}

function handleExplorerInlineCancel(session) {
  if (!session || session.mode !== 'create') return;
  if (session.kind === 'file') {
    BelJarPersist.deleteFile(session.fileId);
    renderTabs();
    updateHeaderContext();
  } else if (session.kind === 'folder') {
    BelJarPersist.removeEmptyFolder(session.folderPath);
  }
}

function handleExplorerInlineCommit(session, rawName) {
  const IL = typeof BelJarExplorerInlineName !== 'undefined' ? BelJarExplorerInlineName : null;
  if (!IL || typeof BelJarPersist === 'undefined') return false;
  const files = BelJarPersist.listFiles();
  const empty = BelJarPersist.listEmptyFolders();

  if (session.kind === 'file') {
    const file = BelJarPersist.getFileById(session.fileId);
    if (!file) return false;
    const parentDir = session.mode === 'rename'
      ? BelJarProjectSource.dirOf(file.name)
      : session.parentDir;
    const result = IL.validateFileCommit(
      rawName,
      parentDir,
      files,
      session.fileId,
    );
    if (!result.ok) {
      showToast(result.error, { kind: 'warn' });
      return false;
    }
    if (result.fullPath !== file.name) {
      BelJarPersist.renameFile(session.fileId, result.fullPath);
      if (session.fileId === BelJarPersist.getActiveFileId()) {
        ensureEditorMatchesFileKind();
      }
    }
    if (session.mode === 'create') switchToFile(session.fileId);
    else {
      renderTabs();
      updateHeaderContext();
    }
    return true;
  }

  if (session.kind === 'folder') {
    const parentDir = session.mode === 'rename'
      ? IL.parentDir(session.folderPath)
      : session.parentDir;
    const result = IL.validateFolderCommit(
      rawName,
      parentDir,
      files,
      empty,
      session.folderPath,
    );
    if (!result.ok) {
      showToast(result.error, { kind: 'warn' });
      return false;
    }
    if (session.mode === 'create') {
      if (result.fullPath !== session.folderPath) {
        BelJarPersist.removeEmptyFolder(session.folderPath);
        BelJarPersist.addEmptyFolder(result.fullPath);
      }
    } else if (result.fullPath !== session.folderPath) {
      renameFolderPrefix(session.folderPath, result.fullPath);
    }
    return true;
  }
  return false;
}

function startExplorerCreateFile(parentDir) {
  ensureExplorer();
  if (!explorerController || typeof BelJarExplorerInlineName === 'undefined') return;
  const IL = BelJarExplorerInlineName;
  const files = BelJarPersist.listFiles();
  const fullPath = IL.suggestDefaultFileName(parentDir, files);
  const id = BelJarPersist.createFile(fullPath);
  explorerController.beginInlineName({
    kind: 'file',
    mode: 'create',
    parentDir,
    fileId: id,
    folderPath: null,
    displayName: IL.lastSegment(fullPath),
    originalPath: fullPath,
  });
}

function startExplorerCreateFolder(parentDir) {
  ensureExplorer();
  if (!explorerController || typeof BelJarExplorerInlineName === 'undefined') return;
  const IL = BelJarExplorerInlineName;
  const files = BelJarPersist.listFiles();
  const empty = BelJarPersist.listEmptyFolders();
  const fullPath = IL.suggestDefaultFolderName(parentDir, files, empty);
  BelJarPersist.addEmptyFolder(fullPath);
  explorerController.beginInlineName({
    kind: 'folder',
    mode: 'create',
    parentDir,
    folderPath: fullPath,
    displayName: IL.lastSegment(fullPath),
    originalPath: fullPath,
  });
}

function explorerCreateMenuItems(parentDir) {
  return [
    { label: 'New file', onSelect: () => startExplorerCreateFile(parentDir) },
    { label: 'New folder', onSelect: () => startExplorerCreateFolder(parentDir) },
    { type: 'separator' },
  ];
}

function renameFolderInteractive(folderPath) {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarExplorerInlineName === 'undefined') return;
  ensureExplorer();
  if (!explorerController) return;
  const IL = BelJarExplorerInlineName;
  explorerController.beginInlineName({
    kind: 'folder',
    mode: 'rename',
    parentDir: IL.parentDir(folderPath),
    folderPath,
    displayName: IL.lastSegment(folderPath),
    originalPath: folderPath,
  });
}

function ensureExplorer() {
  if (explorerController || typeof BelJarExplorer === 'undefined') return;
  const treeEl = explorerPanelEl && explorerPanelEl.querySelector('.explorer-tree');
  if (!treeEl || typeof BelJarPersist === 'undefined') return;
  explorerController = BelJarExplorer.init({
    container: treeEl,
    listFiles: () => BelJarPersist.listFiles(),
    listEmptyFolders: () => BelJarPersist.listEmptyFolders(),
    getActiveId: () => (persist ? persist.getCurrentFileId() : BelJarPersist.getActiveFileId()),
    getActiveCfgForDir: activeCfgForDir,
    getActiveCfgsForDir: activeCfgsForDir,
    getSuiteLayoutForDir: suiteLayoutForDir,
    getFileDiag: explorerFileDiag,
    bindFileDiagTip: bindExplorerDiagTip,
    getProjectName: () => BelJarPersist.getProjectName(),
    applyTip: (el, tip) => setBelJarTip(el, tip, { ariaLabel: false }),
    getFileContextItems: (fileId) => fileContextItems(fileId),
    getSelectionContextItems: (selection) => explorerSelectionContextItems(selection),
    getFolderContextItems: (folderPath) => explorerFolderContextItems(folderPath),
    getBackgroundContextItems: () => backgroundRunItems(),
    onOpenFile: (id, openOpts) => switchToFile(id, openOpts),
    onMakeActiveCfg: makeActiveCfgForFile,
    onRefresh: updateRunButtonTooltip,
    onInlineCommit: handleExplorerInlineCommit,
    onInlineCancel: handleExplorerInlineCancel,
    canDrop: (payload, target) => {
      if (typeof BelJarNameConflicts === 'undefined') return false;
      return BelJarNameConflicts.canDropMove(
        payload,
        target,
        BelJarPersist.listFiles(),
        BelJarPersist.listEmptyFolders(),
      );
    },
    onDrop: (payload, target) => { resolveAndApplyMove(payload, target); },
  });
  ensureExplorerSearch();
}

function ensureExplorerSearch() {
  if (explorerSearchController || typeof BelJarExplorerSearch === 'undefined') return;
  if (!explorerPanelEl || typeof BelJarPersist === 'undefined') return;
  const wrap = explorerPanelEl.querySelector('#explorer-search-wrap');
  const input = explorerPanelEl.querySelector('#explorer-search-input');
  const ac = explorerPanelEl.querySelector('#explorer-search-ac');
  if (!wrap || !input || !ac) return;
  explorerSearchController = BelJarExplorerSearch.init({
    wrap,
    input,
    ac,
    header: wrap.closest('.panel-header'),
    listFiles: () => BelJarPersist.listFiles(),
    getFileText: projectFileText,
    onOpenFile: (id) => switchToFile(id),
  });
}

function ensureLibrary() {
  if (libraryController || typeof BelJarLibrary === 'undefined') return;
  const treeEl = libraryPanelEl && libraryPanelEl.querySelector('.library-tree');
  const searchEl = document.getElementById('library-search');
  if (!treeEl) return;
  libraryController = BelJarLibrary.init({
    container: treeEl,
    searchEl: searchEl,
    listFiles: () => BelJarPersist.listFiles(),
    getActiveCfgForDir: activeCfgForDir,
    listActiveSuites: () => (typeof BelJarLibrarySuites !== 'undefined'
      ? BelJarLibrarySuites.listActiveSuites({
        listFiles: () => BelJarPersist.listFiles(),
        getActiveCfgsForDir: activeCfgsForDir,
        getActiveCfgForDir: activeCfgForDir,
      })
      : []),
    getActiveFileId: () => (persist ? persist.getCurrentFileId() : BelJarPersist.getActiveFileId()),
    getEditor: () => editor,
    applyTip: (el, tip) => setBelJarTip(el, tip, { ariaLabel: false }),
    showToast,
    afterSuiteEdit,
    applyFileReplacement: (id, text) => applyFileReplacement(id, text),
    applyUploadPlan: (plan) => executeUploadPlan(plan, { openTabs: false }),
    onProjectChanged: ({ modifiedActive } = {}) => {
      renderTabs();
      renderExplorerTree();
      updateHeaderContext();
      if (modifiedActive) reloadActiveEditorFromPersist();
    },
    onExportAsNewProject: (payload) => { exportLibraryAsNewProject(payload); },
  });
}

function renderExplorerTree() {
  ensureExplorer();
  if (explorerController) explorerController.refresh();
  else updateRunButtonTooltip();
}

function refreshExplorerActiveAndDiags() {
  ensureExplorer();
  if (explorerController?.refreshActiveAndDiags) explorerController.refreshActiveAndDiags();
  else if (explorerController?.refreshDiags) explorerController.refreshDiags();
}

function refreshInspector(detail) {
  if (projectTreeEmpty()) {
    updateInspectorProjectEmpty();
    return;
  }
  if (inspectorProjectEmptyEl) inspectorProjectEmptyEl.hidden = true;
  const body = inspectorPanelEl?.querySelector('.inspector-body');
  if (body) body.hidden = false;
  requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('beljar:inspector-refresh', { detail: detail || {} })));
}

function notifyActiveEditorView() {
  if (!editor || typeof editor.getView !== 'function') return;
  const view = editor.getView();
  if (!view?.dom?.isConnected) return;
  window.dispatchEvent(new CustomEvent('beljar:active-editor-view', { detail: { view } }));
  const fileId = persist
    ? persist.getCurrentFileId()
    : (typeof BelJarPersist !== 'undefined' ? BelJarPersist.getActiveFileId() : null);
  if (!workspaceBootPending) {
    requestAnimationFrame(() => restoreWorkspaceForFile(fileId));
  }
}

function applyEditorJump(jumpAt) {
  if (!editor || !jumpAt) return false;
  if (typeof editor.jumpToReference === 'function' && jumpAt.name) {
    return editor.jumpToReference(jumpAt, jumpAt.name);
  }
  if (typeof editor.jumpToRange === 'function') {
    return editor.jumpToRange(jumpAt);
  }
  return false;
}

function switchToFile(id, openOpts) {
  if (typeof BelJarPersist === 'undefined' || !id) return;
  ensurePersistForFile(id);
  if (!persist) return;

  if (!editor) {
    BelJarPersist.openFile(id);
    BelJarPersist.setActiveFileId(id);
    const snapshot = persist.getInitialCheckpoint();
    editor = mountEditorFor(snapshot, openOpts);
    window.BelJarCurrentEditor = editor;
    syncEditorCmTheme();
    if (typeof BelugaClient !== 'undefined' && BelugaClient.noteEditorChange) {
      BelugaClient.noteEditorChange(editor ? editor.getValue() : '');
    }
    updateEditorEmptyState();
    if (editor) editor.focus();
    renderTabs();
    renderExplorerTree();
    updateHeaderContext();
    updateRunButtonTooltip();
    notifyActiveEditorView();
    refreshInspector();
    return;
  }

  const keepSelection = openOpts && openOpts.keepSelection;
  const shouldClearSelection = !keepSelection
    && !(explorerController && explorerController.shouldKeepSelectionOnOpen
      && explorerController.shouldKeepSelectionOnOpen());
  const peekAt = openOpts && openOpts.peekAt;
  const jumpAt = openOpts && openOpts.jumpAt;
  const initialLocal = openOpts && openOpts.initialLocal;
  if (typeof BelJarPersist !== 'undefined') BelJarPersist.openFile(id);
  const editorDocId = typeof editor.getDocumentId === 'function' ? editor.getDocumentId() : null;
  const persistId = persist.getCurrentFileId();
  if (id === persistId && editorDocId === id) {
    BelJarPersist.setActiveFileId(id);
    renderTabs();
    if (peekAt && editor && typeof editor.peekRange === 'function') editor.peekRange(peekAt);
    else if (jumpAt) applyEditorJump(jumpAt);
    else if (initialLocal != null && editor && typeof editor.applyViewport === 'function') {
      editor.applyViewport(initialLocal);
    } else if (shouldClearSelection && explorerController && explorerController.clearSelection) {
      explorerController.clearSelection();
    }
    notifyActiveEditorView();
    return;
  }
  if (typeof BelJarPersist !== 'undefined' && typeof BelJarProjectSource !== 'undefined') {
    const file = BelJarPersist.getFileById(id);
    if (file) ensureActiveCfgForDir(BelJarProjectSource.dirOf(file.name));
  }
  const leavingId = persist.getCurrentFileId();
  const leavingFile = typeof BelJarPersist !== 'undefined'
    ? BelJarPersist.getFileById(leavingId)
    : null;
  const snap = liveFileLint();
  const lintItems = editor && typeof editor.getLintTooltipItems === 'function'
    ? editor.getLintTooltipItems()
    : null;
  if (snap && leavingFile && /\.cfg$/i.test(leavingFile.name)) {
    rememberCfgLint(leavingId, { ...snap, items: lintItems });
  }
  if (typeof BelJarWorkspaceState !== 'undefined') BelJarWorkspaceState.flushWorkspace();
  if (editor && typeof editor.cancelRename === 'function') editor.cancelRename();
  // Order matters: switchFile flushes the OLD file while its engine/providers
  // are still alive, then loads the new state and drops the stale providers.
  const snapshot = persist.switchFile(id);
  BelJarPersist.setActiveFileId(id);
  editor.destroy();
  editor = mountEditorFor(snapshot, {
    jumpAt,
    initialLocal: initialLocal != null ? initialLocal : (snapshot ? snapshot.editor.local : null),
  });
  window.BelJarCurrentEditor = editor;
  syncEditorCmTheme();
  if (typeof BelugaClient !== 'undefined' && BelugaClient.noteEditorChange) {
    BelugaClient.noteEditorChange(editor ? editor.getValue() : '');
  }
  if (editor) editor.focus();
  renderTabs();
  if (shouldClearSelection && explorerController && explorerController.clearSelection) {
    explorerController.clearSelection();
  }
  refreshExplorerActiveAndDiags();
  updateHeaderContext();
  updateRunButtonTooltip();
  scheduleTabLintStyles();
  notifyActiveEditorView();
  refreshInspector();
  requestAnimationFrame(() => {
    if (peekAt) {
      if (editor && typeof editor.peekRange === 'function') editor.peekRange(peekAt);
    } else if (jumpAt) {
      if (!applyEditorJump(jumpAt) && editor && typeof editor.restoreViewport === 'function') {
        editor.restoreViewport();
      }
    }
  });
}

window.belJarSwitchToFileForHistory = function (id) {
  switchToFile(id);
};

window.addEventListener('beljar:edit-history-applied', function () {
  renderTabs();
  if (typeof renderExplorerTree === 'function') renderExplorerTree();
  refreshExplorerActiveAndDiags();
  updateHeaderContext();
});

// Find-references hover preview: switch tabs to peek cross-file rows, then
// restore the pre-menu editor state when the menu closes without a click.
let refPeekRestore = null;

function captureRefPeekRestore() {
  if (!editor || !persist) return null;
  const local = typeof editor.getViewport === 'function'
    ? editor.getViewport()
    : persist.getEditorLocal();
  return { fileId: persist.getCurrentFileId(), local };
}

function beginRefPeekSession() {
  if (!refPeekRestore) refPeekRestore = captureRefPeekRestore();
}

function endRefPeekSession() {
  const snap = refPeekRestore;
  refPeekRestore = null;
  if (!snap || !persist) return;
  const currentId = persist.getCurrentFileId();
  if (currentId === snap.fileId) {
    if (editor && typeof editor.applyViewport === 'function') {
      editor.applyViewport(snap.local);
    }
    return;
  }
  switchToFile(snap.fileId, { initialLocal: snap.local, keepSelection: true });
}

function peekFileAt(fileId, opts) {
  if (!persist || !fileId || opts.from == null) return;
  opts = opts || {};
  beginRefPeekSession();
  const peekAt = {
    from: opts.from,
    to: opts.to,
    line: opts.line,
    col: opts.col,
    name: opts.name,
  };
  const currentId = persist.getCurrentFileId();
  if (currentId === fileId) {
    if (editor && typeof editor.peekRange === 'function') editor.peekRange(peekAt);
    return;
  }
  switchToFile(fileId, { peekAt, keepSelection: true });
}

// Open a file (switching if needed) and jump to a position in it — the target
// of cross-file go-to-definition, palette symbols, and project search.
function openFileAt(fileId, from, to, opts) {
  if (typeof BelJarPersist === 'undefined') return;
  if (from == null) return;
  opts = opts || {};
  if (typeof BelJarEditor !== 'undefined' && typeof BelJarEditor.logJumpRequest === 'function') {
    BelJarEditor.logJumpRequest({
      fileId, from, to, line: opts.line, col: opts.col, phase: 'openFileAt',
    });
  } else {
    console.warn('[bel-jar:jump] openFileAt (BelJarEditor.logJumpRequest missing)', { fileId, from, to });
  }
  const jumpAt = {
    from,
    to: to != null ? to : from,
    line: opts.line,
    col: opts.col,
    name: opts.name,
  };
  const editorDocId = editor && typeof editor.getDocumentId === 'function'
    ? editor.getDocumentId()
    : (persist ? persist.getCurrentFileId() : null);
  const needSwitch = editorDocId !== fileId;
  if (needSwitch) {
    switchToFile(fileId, { jumpAt });
    return;
  }
  if (!editor) return;
  if (typeof editor.jumpToReference === 'function' && opts.name) {
    editor.jumpToReference(jumpAt, opts.name);
  } else if (typeof editor.jumpToRange === 'function') {
    editor.jumpToRange(jumpAt);
    if (typeof BelJarEditor !== 'undefined' && typeof BelJarEditor.logJumpResult === 'function'
      && typeof editor.getView === 'function') {
      const v = editor.getView();
      if (v) requestAnimationFrame(() => BelJarEditor.logJumpResult(v, jumpAt));
    }
  } else if (typeof editor.scheduleJumpToRange === 'function') {
    editor.scheduleJumpToRange(jumpAt);
  }
  notifyActiveEditorView();
}

// Fired by the editor layer (bel-ide-actions) when go-to-definition resolves
// into ANOTHER project file.
window.addEventListener('beljar:open-file-at', (ev) => {
  const d = ev.detail || {};
  if (d.fileId) {
    refPeekRestore = null;
    openFileAt(d.fileId, d.from, d.to, d);
  }
});

window.addEventListener('beljar:peek-file-at', (ev) => {
  const d = ev.detail || {};
  if (d.fileId) peekFileAt(d.fileId, d);
});

window.addEventListener('beljar:end-ref-peek', () => {
  endRefPeekSession();
});

window.addEventListener('beljar:cfg-rewritten', (ev) => {
  const ids = ev && ev.detail && ev.detail.fileIds;
  syncCfgEditorsAfterRewrite(ids);
});

async function newFile(name) {
  if (typeof BelJarPersist === 'undefined') return;
  var baseName = name;
  if (!baseName) {
    var def = 'untitled.bel';
    var stemEnd = 8;
    if (typeof BelJarExplorerInlineName !== 'undefined') {
      def = BelJarExplorerInlineName.suggestDefaultFileName('', BelJarPersist.listFiles());
      var dot = def.lastIndexOf('.');
      stemEnd = dot > 0 ? dot : def.length;
    } else if (typeof BelJarNameConflicts !== 'undefined') {
      var paths = BelJarPersist.listFiles().map(function (f) { return f.name; });
      if (!BelJarNameConflicts.nameConflict(BelJarPersist.listFiles(), 'untitled.bel')) {
        def = 'untitled.bel';
      } else {
        def = BelJarNameConflicts.suggestNewPath('untitled.bel', paths);
      }
      var dot2 = def.lastIndexOf('.');
      stemEnd = dot2 > 0 ? dot2 : def.length;
    }
    if (typeof BelJarNamePrompt === 'undefined') return;
    baseName = await BelJarNamePrompt.open({
      ariaLabel: 'New file',
      message: 'New file',
      value: def,
      selection: { start: 0, end: stemEnd },
      mono: true,
      normalize: BelJarNamePrompt.normalizeBelFileName,
      validate: function (n) {
        if (!n) return 'Name is required.';
        if (typeof BelJarNameConflicts !== 'undefined'
          && BelJarNameConflicts.nameConflict(BelJarPersist.listFiles(), n)) {
          return 'A file with that name already exists in this folder.';
        }
        return null;
      },
      confirmLabel: 'Create',
    });
  }
  if (!baseName) return;
  if (typeof BelJarNameConflicts !== 'undefined'
    && BelJarNameConflicts.nameConflict(BelJarPersist.listFiles(), baseName)) {
    showToast('A file with that name already exists in this folder.', { kind: 'warn' });
    return;
  }
  const id = BelJarPersist.createFile(baseName);
  switchToFile(id);
}

// Close the TAB only — the file stays in the project (reopen via the explorer).
function closeFile(id) {
  if (typeof BelJarPersist === 'undefined') return;
  const openIds = BelJarPersist.getOpenFileIds();
  if (!openIds.includes(id)) return;
  if (openIds.length <= 1) {
    BelJarPersist.closeOpenFile(id);
    enterCanvasIdleView();
    return;
  }
  if (persist && persist.getCurrentFileId() === id) {
    const idx = openIds.indexOf(id);
    const neighborId = openIds[idx - 1] || openIds[idx + 1];
    if (neighborId) switchToFile(neighborId);
  }
  BelJarPersist.closeOpenFile(id);
  renderTabs();
}

function deleteFileInteractive(id) {
  deleteFilesInteractive([id]);
}

async function deleteFilesInteractive(ids) {
  if (typeof BelJarPersist === 'undefined') return;
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return;
  const files = BelJarPersist.listFiles();
  const names = unique.map((id) => BelJarPersist.getFileById(id)).filter(Boolean).map((f) => f.name);
  if (!names.length) return;
  const deletingAll = unique.length >= files.length;
  if (typeof BelJarConfirmDialog === 'undefined') return;
  const confirmOpts = unique.length === 1
    ? {
      subject: names[0],
      message: 'Remove this file from the project?',
      ariaLabel: 'Delete file',
    }
    : deletingAll
      ? {
        message: 'Remove every file from the project?',
        ariaLabel: 'Delete all files',
      }
      : {
        message: 'Remove ' + unique.length + ' files from the project?',
        ariaLabel: 'Delete files',
      };
  if (!(await BelJarConfirmDialog.confirm(confirmOpts))) return;
  const H = typeof BelJarEditHistory !== 'undefined' ? BelJarEditHistory : null;
  const performDelete = function () {
    if (persist && unique.includes(persist.getCurrentFileId())) {
      const fallback = BelJarPersist.getOpenFileIds().find((x) => !unique.includes(x))
        || (files.find((f) => !unique.includes(f.id)) || {}).id;
      if (fallback) switchToFile(fallback);
    }
    for (const id of unique) {
      BelJarPersist.deleteFile(id);
      cfgTabLint.delete(id);
    }
    if (explorerController && explorerController.clearSelection) explorerController.clearSelection();
    if (projectIsEmpty()) {
      enterEmptyProjectView();
      return;
    }
    renderTabs();
    renderExplorerTree();
    updateHeaderContext();
  };
  if (H && typeof H.transact === 'function') H.transact('file-delete', performDelete);
  else performDelete();
}

function closeTabsForFiles(ids) {
  if (typeof BelJarPersist === 'undefined') return;
  const unique = [...new Set((ids || []).filter(Boolean))];
  const openIds = BelJarPersist.getOpenFileIds();
  const targets = unique.filter((id) => openIds.includes(id));
  if (!targets.length) return;
  if (targets.length >= openIds.length) {
    for (const id of targets) BelJarPersist.closeOpenFile(id);
    enterCanvasIdleView();
    return;
  }
  for (const id of targets) closeFile(id);
}

function selectionDeleteFileIds(fileIds, folderPaths) {
  const ids = new Set(fileIds || []);
  for (const folderPath of folderPaths || []) {
    for (const file of filesUnderFolder(folderPath)) ids.add(file.id);
  }
  return [...ids];
}

function selectionDeleteDisabled(fileIds, folderPaths) {
  return !selectionDeleteFileIds(fileIds, folderPaths).length;
}

function deleteSelectionInteractive(fileIds, folderPaths) {
  deleteFilesInteractive(selectionDeleteFileIds(fileIds, folderPaths));
  if (folderPaths && folderPaths.length && typeof BelJarPersist !== 'undefined') {
    for (const folderPath of folderPaths) {
      BelJarPersist.pruneEmptyFoldersUnder(folderPath);
    }
    renderExplorerTree();
  }
}

function filesUnderFolder(folderPath) {
  if (typeof BelJarPersist === 'undefined') return [];
  const allFiles = BelJarPersist.listFiles();
  if (typeof BelJarNameConflicts !== 'undefined') {
    return BelJarNameConflicts.filesUnderPrefix(allFiles, folderPath);
  }
  return allFiles.filter(
    (f) => f.name === folderPath || f.name.startsWith(folderPath + '/'),
  );
}

async function deleteFolderInteractive(folderPath) {
  if (typeof BelJarPersist === 'undefined') return;
  const IL = typeof BelJarExplorerInlineName !== 'undefined' ? BelJarExplorerInlineName : null;
  const label = IL ? IL.lastSegment(folderPath) : folderPath;
  const allFiles = BelJarPersist.listFiles();
  const under = filesUnderFolder(folderPath);
  const emptyUnder = BelJarPersist.listEmptyFolders().filter(
    (p) => p === folderPath || p.startsWith(folderPath + '/'),
  );
  if (!under.length && !emptyUnder.length) return;

  const deletingAll = under.length >= allFiles.length && allFiles.length > 0;
  if (typeof BelJarConfirmDialog === 'undefined') return;
  const confirmOpts = under.length
    ? {
      subject: label,
      message: deletingAll
        ? 'Remove this folder and all ' + under.length + ' file' + (under.length === 1 ? '' : 's') + '?'
        : 'Remove this folder and ' + under.length + ' file' + (under.length === 1 ? '' : 's') + ' inside it?',
      ariaLabel: 'Delete folder',
    }
    : {
      subject: label,
      message: 'Remove this empty folder?',
      ariaLabel: 'Delete folder',
    };
  if (!(await BelJarConfirmDialog.confirm(confirmOpts))) return;

  deleteProjectFilesById(under.map((f) => f.id));
  BelJarPersist.pruneEmptyFoldersUnder(folderPath);
  if (projectIsEmpty()) {
    enterEmptyProjectView();
    return;
  }
  renderTabs();
  renderExplorerTree();
  updateHeaderContext();
}

// Switching projects swaps the entire hot-memory container (editor, engine,
// Beluga session). A full reload is the clean boundary — the new active project
// boots fresh while the previous one rests in storage. Order matters: flush the
// current editor while the OLD project is still active (so the work lands in the
// right silo), THEN run `mutate` (which switches the active project), then stop
// beforeunload from re-flushing the stale buffer into the NEW project.
let suppressUnloadFlush = false;
function switchProjectAndReload(mutate) {
  if (persist) persist.flushCheckpoint();
  if (typeof BelJarWorkspaceState !== 'undefined') BelJarWorkspaceState.flushWorkspace();
  suppressUnloadFlush = true;
  try {
    mutate();
  } catch (e) {
    suppressUnloadFlush = false;
    throw e;
  }
  window.location.reload();
}

async function newProject(name) {
  if (typeof BelJarPersist === 'undefined') return;
  var projName = name;
  if (projName == null) {
    if (typeof BelJarNamePrompt === 'undefined') return;
    projName = await BelJarNamePrompt.open({
      ariaLabel: 'New project',
      message: 'New project',
      value: BelJarPersist.DEFAULT_PROJECT_NAME,
      selection: { start: 0, end: BelJarPersist.DEFAULT_PROJECT_NAME.length },
      normalize: BelJarNamePrompt.defaultNormalize,
      validate: function (n) { return n ? null : 'Name is required.'; },
      confirmLabel: 'Create',
    });
  }
  if (projName === null) return;
  switchProjectAndReload(() =>
    BelJarPersist.newBlankProject((projName && projName.trim()) || BelJarPersist.DEFAULT_PROJECT_NAME));
}

// Switch to another project (full reload boundary). No-op when already active.
function switchToProject(id) {
  if (typeof BelJarPersist === 'undefined') return;
  if (id === BelJarPersist.getActiveProjectId()) return;
  switchProjectAndReload(() => BelJarPersist.setActiveProjectId(id));
}

// Delete a project and its entire silo (destructive, confirmed). Refuses the
// last project. When the active project is deleted, deleteProject hands back the
// next id to activate, so we reload into it.
async function deleteProjectInteractive(id) {
  if (typeof BelJarPersist === 'undefined') return;
  const projects = BelJarPersist.listProjects();
  if (projects.length <= 1) return;
  const target = projects.find((p) => p.id === id);
  if (!target) return;
  if (typeof BelJarConfirmDialog === 'undefined') return;
  if (!(await BelJarConfirmDialog.confirm({
    subject: target.name,
    message: 'Delete this project and all of its files?',
    ariaLabel: 'Delete project',
  }))) return;
  const wasActive = id === BelJarPersist.getActiveProjectId();
  if (wasActive) {
    switchProjectAndReload(() => BelJarPersist.deleteProject(id));
    return;
  }
  BelJarPersist.deleteProject(id);
  showToast('Deleted project "' + target.name + '".');
}

// "Switch project" submenu: every project, active one checked. Null when there
// is only one project (nothing to switch between).
function buildSwitchProjectSubmenu() {
  if (typeof BelJarPersist === 'undefined') return null;
  const projects = BelJarPersist.listProjects();
  if (projects.length <= 1) return null;
  const activeId = BelJarPersist.getActiveProjectId();
  return projects
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((p) => ({
      label: p.name,
      checked: p.id === activeId,
      onSelect: () => switchToProject(p.id),
    }));
}

// "Delete project" submenu: pick any project to delete (not necessarily active).
function buildDeleteProjectSubmenu() {
  if (typeof BelJarPersist === 'undefined') return null;
  const projects = BelJarPersist.listProjects();
  if (projects.length <= 1) return null;
  const activeId = BelJarPersist.getActiveProjectId();
  return projects
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((p) => ({
      label: p.name,
      checked: p.id === activeId,
      onSelect: () => deleteProjectInteractive(p.id),
    }));
}

// ── Header project title ──────────────────────────────────────────────────────

function headerContextFileHint() {
  const n = typeof BelJarPersist !== 'undefined' ? BelJarPersist.listFiles().length : 1;
  if (n === 0) return 'No files';
  return n === 1 ? '1 file' : n + ' files';
}

function normalizeProjectRenameName(raw) {
  if (typeof BelJarNamePrompt !== 'undefined' && BelJarNamePrompt.defaultNormalize) {
    return BelJarNamePrompt.defaultNormalize(raw);
  }
  return String(raw || '').trim();
}

function validateProjectRenameName(name) {
  return name ? null : 'Name is required.';
}

function applyProjectRename(name) {
  if (typeof BelJarPersist === 'undefined') return;
  BelJarPersist.setProjectName(name);
  updateHeaderContext();
}

let headerProjectRenameInput = null;

function endHeaderProjectRename() {
  const el = document.getElementById('header-context');
  if (!el || !headerProjectRenameInput) return;
  const nameEl = document.createElement('span');
  nameEl.className = 'header-context-name';
  nameEl.id = 'header-context-name';
  headerProjectRenameInput.replaceWith(nameEl);
  headerProjectRenameInput = null;
  el.classList.remove('is-renaming');
}

function startHeaderProjectRename() {
  if (headerProjectRenameInput || typeof BelJarPersist === 'undefined') return;
  const el = document.getElementById('header-context');
  const nameEl = document.getElementById('header-context-name');
  if (!el || !nameEl) return;

  const initial = BelJarPersist.getProjectName();
  el.classList.add('is-renaming');
  setBelJarTip(el, '');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'header-context-inline-name';
  input.value = initial;
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Project name');
  input.size = Math.max(initial.length, 6);
  nameEl.replaceWith(input);
  headerProjectRenameInput = input;

  let settled = false;
  let suppressBlurDismiss = false;

  function dismiss() {
    if (settled) return;
    settled = true;
    endHeaderProjectRename();
    updateHeaderContext();
  }

  function commit() {
    const next = normalizeProjectRenameName(input.value);
    const err = validateProjectRenameName(next);
    if (err) {
      showToast(err, { kind: 'warn' });
      input.classList.add('is-invalid');
      input.focus();
      input.select();
      setTimeout(() => input.classList.remove('is-invalid'), 400);
      return false;
    }
    if (next === BelJarPersist.getProjectName()) {
      dismiss();
      return true;
    }
    settled = true;
    endHeaderProjectRename();
    applyProjectRename(next);
    return true;
  }

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      suppressBlurDismiss = true;
      if (commit()) {
        settled = true;
      } else {
        setTimeout(() => { suppressBlurDismiss = false; }, 0);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
    }
  });
  input.addEventListener('input', () => {
    input.size = Math.max(input.value.length, 6);
  });
  input.addEventListener('click', (e) => { e.stopPropagation(); });
  input.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
  input.addEventListener('blur', () => {
    if (settled) return;
    setTimeout(() => {
      if (!settled && !suppressBlurDismiss) dismiss();
    }, 0);
  });

  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function updateHeaderContext() {
  const el = document.getElementById('header-context');
  const nameEl = document.getElementById('header-context-name');
  if (!el || !nameEl) return;
  if (headerProjectRenameInput) return;
  nameEl.textContent = typeof BelJarPersist !== 'undefined'
    ? BelJarPersist.getProjectName()
    : 'Untitled Project';
  const tip = headerContextFileHint();
  el.setAttribute('aria-label', tip);
  setBelJarTip(el, tip);
}

const headerContextEl = document.getElementById('header-context');
if (headerContextEl) {
  headerContextEl.addEventListener('click', (e) => {
    if (headerProjectRenameInput) return;
    const nameEl = e.target.closest('#header-context-name');
    if (!nameEl) return;
    e.stopPropagation();
    startHeaderProjectRename();
  });
}

window.addEventListener('beljar:file-lint', (ev) => {
  const id = persist ? persist.getCurrentFileId() : null;
  if (!id || !ev.detail) return;
  const file = typeof BelJarPersist !== 'undefined' ? BelJarPersist.getFileById(id) : null;
  if (!file) return;
  if (/\.cfg$/i.test(file.name)) {
    rememberCfgLint(id, ev.detail);
  }
  if (/\.cfg$/i.test(file.name) || BelJarProjectSource.isSignaturePath(file.name)) {
    scheduleTabLintStyles();
  }
});

window.addEventListener('beljar:explorer-health-changed', () => scheduleTabLintStyles());
window.addEventListener('beljar:development-checked', () => scheduleTabLintStyles());

// Initial render.
if (typeof BelJarPersist !== 'undefined' && activeFileId) BelJarPersist.openFile(activeFileId);
registerWorkspaceProviders();
renderTabs();
renderExplorerTree();
updateHeaderContext();
updateEditorEmptyState();
updateInspectorProjectEmpty();
if (editor) notifyActiveEditorView();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    restoreWorkspaceState();
    workspaceBootPending = false;
  });
});

function openInspector() {
  if (!workspaceEl) return;
  if (!workspaceEl.classList.contains('is-inspector-open')) {
    closeOtherSidePanels('inspector');
    setSidePanelOpen('inspector', true);
    notifySidePanelLayout();
  }
  requestAnimationFrame(() => refreshInspector({ live: true }));
}
if (inspectorBtn && workspaceEl) {
  const hideInspectorTooltipUntilLeave = wireSidebarOpenTooltip(inspectorBtn);
  inspectorBtn.addEventListener('click', () => {
    const wasOpen = workspaceEl.classList.contains('is-inspector-open');
    if (!wasOpen) hideInspectorTooltipUntilLeave();
    const open = toggleSidePanel('inspector');
    if (open) refreshInspector({ live: true });
  });
  window.addEventListener('beljar:open-inspector', openInspector);
}

if (libraryBtn && workspaceEl) {
  const hideLibraryTooltipUntilLeave = wireSidebarOpenTooltip(libraryBtn);
  libraryBtn.addEventListener('click', () => {
    const wasOpen = workspaceEl.classList.contains('is-library-open');
    if (!wasOpen) hideLibraryTooltipUntilLeave();
    const open = toggleSidePanel('library');
    if (open) {
      ensureLibrary();
      if (libraryController && typeof libraryController.refresh === 'function') {
        libraryController.refresh();
      }
    }
  });
}
ensureLibrary();

// ── Harpoon sidebar panel ────────────────────────────────────────────────
let harpoonPanelInited = false;
function ensureHarpoonPanel() {
  if (harpoonPanelInited || typeof BelJarHarpoonPanel === 'undefined') return;
  const bodyEl = harpoonPanelEl && harpoonPanelEl.querySelector('#harpoon-panel-body');
  if (!bodyEl) return;
  BelJarHarpoonPanel.init(bodyEl, { panelEl: harpoonPanelEl });
  harpoonPanelInited = true;
}
function refreshHarpoonPanelIfOpen() {
  if (workspaceEl && workspaceEl.classList.contains('is-harpoon-open') &&
      typeof BelJarHarpoonPanel !== 'undefined' && BelJarHarpoonPanel.refresh) {
    BelJarHarpoonPanel.refresh();
  }
}
if (harpoonBtn && workspaceEl) {
  const hideProofTooltipUntilLeave = wireSidebarOpenTooltip(harpoonBtn);
  harpoonBtn.addEventListener('click', () => {
    const wasOpen = workspaceEl.classList.contains('is-harpoon-open');
    if (!wasOpen) hideProofTooltipUntilLeave();
    const open = toggleSidePanel('harpoon');
    if (open) { ensureHarpoonPanel(); refreshHarpoonPanelIfOpen(); }
  });
  // Keep the goal list fresh as the editor changes (holes are syntactic, so they
  // appear immediately on edit — no wait for the Beluga checker), settles (goals
  // fill in), or the active file changes.
  let harpoonRefreshTimer = null;
  const debouncedHarpoonRefresh = () => {
    if (harpoonRefreshTimer) clearTimeout(harpoonRefreshTimer);
    harpoonRefreshTimer = setTimeout(refreshHarpoonPanelIfOpen, 120);
  };
  window.addEventListener('beljar:doc-changed', debouncedHarpoonRefresh);
  window.addEventListener('beljar:file-lint', debouncedHarpoonRefresh);
  window.addEventListener('beljar:active-editor-view', debouncedHarpoonRefresh);
  window.addEventListener('beljar:development-checked', debouncedHarpoonRefresh);
  window.addEventListener('beljar:hole-goals-updated', debouncedHarpoonRefresh);

  // Restored-open on page load: the inline boot script adds `is-harpoon-open`
  // but never inits the body, so initialize it here (mirrors ensureLibrary()'s
  // unconditional startup call) — otherwise a refresh with Harpoon open leaves a
  // blank panel until the user toggles it.
  if (workspaceEl.classList.contains('is-harpoon-open')) {
    ensureHarpoonPanel();
    refreshHarpoonPanelIfOpen();
  }
}

// ── Header menus ──────────────────────────────────────────────────────────────

function wireMenuTrigger(btn, menuOpts) {
  if (!btn) return;
  let suppressNextClick = false;

  function setOpen(open) {
    btn.classList.toggle('is-active', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function runMenuInteraction() {
    if (typeof Menu !== 'undefined' && Menu.isOpen() && Menu.rootAnchor() === btn) {
      Menu.closeAll();
      return;
    }
    if (typeof Menu === 'undefined') return;
    const items = typeof menuOpts.items === 'function' ? menuOpts.items() : menuOpts.items;
    Menu.open({
      anchor: btn,
      side: menuOpts.side,
      align: menuOpts.align,
      items,
      onClose: () => setOpen(false),
    });
    setOpen(true);
  }

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    suppressNextClick = true;
    if (typeof Tooltips !== 'undefined') {
      Tooltips.suppressAnchor(btn);
      Tooltips.hide();
    }
    runMenuInteraction();
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (typeof Tooltips !== 'undefined') {
      Tooltips.suppressAnchor(btn);
      Tooltips.hide();
    }
    runMenuInteraction();
  });
}

// ── Project menu ──────────────────────────────────────────────────────────────

// Hidden file input for "Upload file".
const fileInputEl = document.createElement('input');
fileInputEl.type = 'file';
fileInputEl.accept = '.bel';
fileInputEl.style.display = 'none';
fileInputEl.multiple = true;
document.body.appendChild(fileInputEl);

fileInputEl.addEventListener('change', async () => {
  const files = Array.from(fileInputEl.files || []);
  fileInputEl.value = '';
  if (typeof BelJarPersist === 'undefined' || !persist) return;
  const entries = [];
  for (const file of files) {
    entries.push({ name: file.name, text: await file.text() });
  }
  const result = await resolveAndApplyUpload(entries, { openTabs: true });
  if (result === null) return;
  if (result.replaced > 0 && result.added === 0) {
    showToast('Replaced existing file.', { kind: 'success' });
  } else if (result.added > 0) {
    showToast(
      'Added ' + result.added + ' file' + (result.added === 1 ? '' : 's') + ' to the project.',
      { kind: 'success' },
    );
  }
});

function relPathFromPickerFile(file, opts) {
  const rel = file.webkitRelativePath || file.name;
  const parts = rel.split('/');
  if (opts && opts.stripRoot && parts.length > 1) return parts.slice(1).join('/');
  return rel;
}

function projectEntriesFromRawEntries(rawEntries) {
  const belEntries = [];
  const elfEntries = [];
  const cfgEntries = [];
  for (const entry of rawEntries) {
    if (BelJarProjectSource.isCfgPath(entry.name)) cfgEntries.push(entry);
    else if (BelJarProjectSource.isElfPath(entry.name)) elfEntries.push(entry);
    else if (BelJarProjectSource.isBelPath(entry.name)) belEntries.push(entry);
  }
  const belPaths = belEntries.map((e) => e.name);
  const sigPaths = belPaths.concat(elfEntries.map((e) => e.name));
  const cfgByDir = {};
  for (const entry of cfgEntries) {
    const dir = typeof BelJarProjectSource !== 'undefined'
      ? BelJarProjectSource.dirOf(entry.name)
      : (entry.name.includes('/') ? entry.name.slice(0, entry.name.lastIndexOf('/')) : '');
    const base = entry.name.slice(entry.name.lastIndexOf('/') + 1);
    if (!cfgByDir[dir]) cfgByDir[dir] = {};
    cfgByDir[dir][base] = entry.text;
  }
  const byPath = new Map([...belEntries, ...elfEntries, ...cfgEntries].map((e) => [e.name, e]));
  const orderedSig = typeof BelJarProjectSource.orderSignaturePaths === 'function'
    ? BelJarProjectSource.orderSignaturePaths(sigPaths, cfgByDir)
    : sigPaths.slice().sort();
  const projectEntries = orderedSig.map((p) => byPath.get(p)).filter(Boolean);
  for (const cfg of cfgEntries) projectEntries.push(cfg);
  return { projectEntries, belCount: belPaths.length, sigCount: sigPaths.length };
}

async function projectEntriesFromPickerFiles(all, opts) {
  const rawEntries = [];
  for (const file of all) {
    const low = file.name.toLowerCase();
    if (!BelJarProjectSource.isProjectSourcePath(file.name)) continue;
    rawEntries.push({ name: relPathFromPickerFile(file, opts), text: await file.text() });
  }
  return projectEntriesFromRawEntries(rawEntries);
}

async function exportLibraryAsNewProject(payload) {
  if (typeof BelJarPersist === 'undefined' || !persist || !payload) return;
  const { projectEntries } = projectEntriesFromRawEntries(payload.entries || []);
  if (!projectEntries.length) {
    showToast('No files to export.', { kind: 'warn' });
    return;
  }
  let projName = payload.defaultName || BelJarPersist.DEFAULT_PROJECT_NAME;
  if (typeof BelJarNamePrompt !== 'undefined') {
    projName = await BelJarNamePrompt.open({
      ariaLabel: 'Export as new project',
      message: 'New project',
      value: projName,
      normalize: BelJarNamePrompt.defaultNormalize,
      validate: (n) => (n ? null : 'Name is required.'),
      confirmLabel: 'Create',
    });
  }
  if (projName === null) return;
  const tmpFiles = projectEntries.map((e, i) => ({ id: 'tmp-' + i, name: e.name }));
  const tmpText = (id) => projectEntries[Number(id.slice(4))]?.text ?? '';
  const activeCfgByDir = typeof BelJarProjectSource.inferActiveCfgByDir === 'function'
    ? BelJarProjectSource.inferActiveCfgByDir(tmpFiles, tmpText)
    : null;
  let activePath = payload.activeRelPath || null;
  if (!activePath) {
    const orderedBel = projectEntries.filter((e) => BelJarProjectSource.isBelPath(e.name)).map((e) => e.name);
    activePath = orderedBel[0]
      || projectEntries.find((e) => BelJarProjectSource.isSignaturePath(e.name))?.name
      || projectEntries.find((e) => BelJarProjectSource.isCfgPath(e.name))?.name
      || null;
  }
  switchProjectAndReload(() => {
    BelJarPersist.createProjectWithFiles(projName, projectEntries, {
      projectName: projName,
      activeCfgByDir: activeCfgByDir || undefined,
    });
    if (activePath) {
      const created = BelJarPersist.listFiles().find((f) => f.name === activePath);
      if (created) BelJarPersist.setActiveFileId(created.id);
    }
  });
}

// Conflict-resolution replace writes storage directly; cancel any debounced autosave
// on the active checkpoint first so it cannot stomp the new body afterward.
function applyFileReplacement(id, text) {
  if (!id || text == null || typeof BelJarPersist === 'undefined') return;
  const activeId = persist ? persist.getCurrentFileId() : null;
  const registryActiveId = BelJarPersist.getActiveFileId();
  const isActive = !!(
    editor && persist
    && (id === activeId || id === registryActiveId)
  );
  if (isActive && persist.cancelPendingSave) persist.cancelPendingSave();
  BelJarPersist.setFileText(id, text);
  if (!isActive) return;
  const stored = BelJarPersist.getFileText(id);
  if (stored == null) return;
  if (persist.replaceEditorText) persist.replaceEditorText(stored);
  if (editor.setValueNonUndoable) editor.setValueNonUndoable(stored);
  else editor.setValue(stored);
  ensureEditorMatchesFileKind();
  const file = BelJarPersist.getFileById(id);
  if (file && /\.cfg$/i.test(file.name) && typeof editor.refreshLint === 'function') {
    editor.refreshLint();
  }
}

function deleteProjectFilesById(ids) {
  const unique = [...new Set(ids)];
  if (!unique.length || typeof BelJarPersist === 'undefined') return;
  const currentId = persist ? persist.getCurrentFileId() : BelJarPersist.getActiveFileId();
  if (currentId && unique.includes(currentId)) {
    const openIds = BelJarPersist.getOpenFileIds().filter((x) => !unique.includes(x));
    const files = BelJarPersist.listFiles();
    const fallback = openIds[0]
      || (files.find((f) => !unique.includes(f.id)) || {}).id;
    if (fallback) switchToFile(fallback);
  }
  for (const id of unique) {
    BelJarPersist.deleteFile(id);
    cfgTabLint.delete(id);
  }
  if (persist) {
    const cur = persist.getCurrentFileId();
    if (cur && unique.includes(cur) && !BelJarPersist.getFileById(cur)) {
      const open = BelJarPersist.getOpenFileIds().find((openId) => BelJarPersist.getFileById(openId));
      if (open) switchToFile(open);
      else if (projectIsEmpty()) enterEmptyProjectView();
      else enterCanvasIdleView();
    }
  }
  if (projectIsEmpty()) enterEmptyProjectView();
}

function executeUploadPlan(plan, options) {
  if (!plan || typeof BelJarPersist === 'undefined') return { added: 0, replaced: 0 };
  const H = typeof BelJarEditHistory !== 'undefined' ? BelJarEditHistory : null;
  const run = () => executeUploadPlanInner(plan, options || {});
  if (H && typeof H.transact === 'function') {
    const r = H.transact('file-batch', run);
    return r.ok ? (r.result || { added: 0, replaced: 0 }) : { added: 0, replaced: 0 };
  }
  return run();
}

function executeUploadPlanInner(plan, options) {
  let added = 0;
  let replaced = 0;
  let lastCreatedId = null;
  let switchedActiveId = null;

  for (const folder of plan.replaceFolder || []) {
    const deleteSet = new Set(folder.deleteIds || []);
    const reopenPaths = [];
    const activeId = persist ? persist.getCurrentFileId() : BelJarPersist.getActiveFileId();
    const activePath = activeId ? (BelJarPersist.getFileById(activeId) || {}).name : null;
    for (const openId of BelJarPersist.getOpenFileIds()) {
      if (!deleteSet.has(openId)) continue;
      const f = BelJarPersist.getFileById(openId);
      if (f) reopenPaths.push(f.name);
    }
    deleteProjectFilesById(folder.deleteIds || []);
    for (const entry of folder.entries || []) {
      const id = BelJarPersist.createFile(entry.name);
      BelJarPersist.setFileText(id, entry.text);
      added += 1;
      lastCreatedId = id;
      if (options.openTabs) BelJarPersist.openFile(id);
      if (activePath && entry.name === activePath) switchedActiveId = id;
    }
    for (const path of reopenPaths) {
      const f = BelJarPersist.listFiles().find((x) => x.name === path);
      if (f) BelJarPersist.openFile(f.id);
    }
    replaced += 1;
  }

  for (const item of plan.replace || []) {
    applyFileReplacement(item.id, item.text);
    replaced += 1;
  }

  for (const entry of plan.create || []) {
    const id = BelJarPersist.createFile(entry.name);
    BelJarPersist.setFileText(id, entry.text);
    added += 1;
    lastCreatedId = id;
    if (options.openTabs) BelJarPersist.openFile(id);
  }

  if (switchedActiveId) switchToFile(switchedActiveId);
  else if (options.openTabs && lastCreatedId) switchToFile(lastCreatedId);
  else reloadActiveEditorFromPersist();
  updateEditorEmptyState();
  renderTabs();
  renderExplorerTree();
  updateHeaderContext();
  return { added, replaced };
}

async function resolveAndApplyUpload(entries, options) {
  if (typeof BelJarPersist === 'undefined' || !entries.length) return null;
  const existing = BelJarPersist.listFiles();
  if (typeof BelJarNameConflicts === 'undefined' || typeof BelJarConflictDialog === 'undefined') {
    return executeUploadPlan({
      create: entries.map((e) => ({ name: e.name, text: e.text })),
      replace: [],
      replaceFolder: [],
    }, options);
  }

  const conflicts = BelJarNameConflicts.detectUploadConflicts(existing, entries, {
    folderBatchRoots: options.folderBatchRoots != null
      ? options.folderBatchRoots
      : [],
  });
  let resolutions = [];
  if (conflicts.length) {
    resolutions = await BelJarConflictDialog.resolveConflicts(conflicts);
    if (resolutions === null) return null;
  }
  const plan = BelJarNameConflicts.applyResolutions(existing, entries, conflicts, resolutions);
  if (!plan) return null;
  return executeUploadPlan(plan, options);
}

// After batch moves, cfg bodies are updated via BelJarPersist.setFileText while the
// live editor may still hold the pre-sync buffer — reload when storage diverges.
function reloadActiveEditorFromPersist() {
  if (!persist || !editor || typeof BelJarPersist === 'undefined') return;
  const id = persist.getCurrentFileId();
  if (!id) return;
  const file = BelJarPersist.getFileById(id);
  if (!file) {
    const fallback = BelJarPersist.getOpenFileIds().find((openId) => BelJarPersist.getFileById(openId));
    if (fallback) switchToFile(fallback);
    else if (!projectIsEmpty()) enterCanvasIdleView();
    return;
  }
  const stored = BelJarPersist.getFileText(id);
  if (stored == null) return;
  const live = editor.getValue();
  if (live === stored) return;
  if (persist.cancelPendingSave) persist.cancelPendingSave();
  if (persist.replaceEditorText) persist.replaceEditorText(stored);
  if (editor.setValueNonUndoable) editor.setValueNonUndoable(stored);
  else editor.setValue(stored);
  ensureEditorMatchesFileKind();
  if (file && /\.cfg$/i.test(file.name) && typeof editor.refreshLint === 'function') {
    editor.refreshLint();
  }
}

function syncCfgEditorsAfterRewrite(fileIds) {
  if (!fileIds || !fileIds.length || typeof BelJarPersist === 'undefined') return;
  const activeId = persist ? persist.getCurrentFileId() : BelJarPersist.getActiveFileId();
  let touchedActiveCfg = false;
  for (let i = 0; i < fileIds.length; i++) {
    const id = fileIds[i];
    const stored = BelJarPersist.getFileText(id);
    if (stored == null) continue;
    if (id === activeId && editor) {
      const live = editor.getValue();
      if (live !== stored) {
        editor.setValue(stored);
        if (persist) persist.scheduleEditorPersist(stored);
        touchedActiveCfg = true;
      }
    }
  }
  if (touchedActiveCfg) {
    ensureEditorMatchesFileKind();
    if (editor && typeof editor.refreshLint === 'function') editor.refreshLint();
    const activeFile = BelJarPersist.getFileById(activeId);
    if (activeFile && /\.cfg$/i.test(activeFile.name)) {
      onCfgContentChange(activeFile.name);
      return;
    }
  }
  renderExplorerTree();
  updateHeaderContext();
  updateRunButtonTooltip();
}

function applyMovePlan(plan) {
  if (!plan || typeof BelJarPersist === 'undefined' || !persist) return;
  const moves = [];
  const recordMove = (id, to) => {
    const f = BelJarPersist.getFileById(id);
    if (f) moves.push({ from: f.name, to });
    BelJarPersist.renameFile(id, to);
  };
  for (const folder of plan.replaceFolder || []) {
    deleteProjectFilesById(folder.deleteIds || []);
    for (const r of folder.renames || []) recordMove(r.id, r.to);
  }
  for (const rep of plan.replaces || []) {
    applyFileReplacement(rep.targetId, rep.text);
    deleteProjectFilesById([rep.deleteId]);
  }
  for (const r of plan.renames || []) recordMove(r.id, r.to);
  BelJarPersist.preserveEmptyFoldersAfterMoves(moves);
  reloadActiveEditorFromPersist();
  renderTabs();
  renderExplorerTree();
  updateHeaderContext();
}

async function resolveAndApplyMove(payload, dropTarget) {
  if (typeof BelJarPersist === 'undefined' || !persist || typeof BelJarNameConflicts === 'undefined') return;
  const existing = BelJarPersist.listFiles();
  const empty = BelJarPersist.listEmptyFolders();
  const getText = projectFileText;
  const moves = BelJarNameConflicts.computeMoveTargets(existing, payload, dropTarget, getText);
  const emptyMoves = BelJarNameConflicts.computeEmptyFolderMoves(existing, payload, dropTarget, empty);

  if (!moves.length) {
    if (!emptyMoves.length) return;
    for (const m of emptyMoves) BelJarPersist.renameEmptyFolderPrefix(m.from, m.to);
    renderExplorerTree();
    updateHeaderContext();
    return;
  }

  let plan;
  if (typeof BelJarConflictDialog !== 'undefined') {
    const conflicts = BelJarNameConflicts.detectMoveConflicts(existing, moves, {
      moveKind: payload.kind,
      folderPaths: payload.folderPaths,
    });
    let resolutions = [];
    if (conflicts.length) {
      resolutions = await BelJarConflictDialog.resolveConflicts(conflicts, { context: 'move' });
      if (resolutions === null) return;
    }
    plan = BelJarNameConflicts.applyMoveResolutions(existing, moves, conflicts, resolutions);
  } else {
    plan = {
      renames: moves.map((m) => ({ id: m.id, to: m.to })),
      replaces: [],
      replaceFolder: [],
    };
  }
  if (!plan) return;
  applyMovePlan(plan);
  for (const m of emptyMoves) BelJarPersist.renameEmptyFolderPrefix(m.from, m.to);
  if (emptyMoves.length) renderExplorerTree();
}

// Hidden directory input for "Upload folder" — adds every .bel/.elf/.cfg in the
// tree to the current project, including the selected folder as a path prefix.
const uploadFolderInputEl = document.createElement('input');
uploadFolderInputEl.type = 'file';
uploadFolderInputEl.webkitdirectory = true;
uploadFolderInputEl.style.display = 'none';
document.body.appendChild(uploadFolderInputEl);

uploadFolderInputEl.addEventListener('change', async () => {
  const all = Array.from(uploadFolderInputEl.files || []);
  uploadFolderInputEl.value = '';
  if (typeof BelJarPersist === 'undefined' || !persist) return;
  const { projectEntries, belCount } = await projectEntriesFromPickerFiles(all);
  if (!belCount) {
    showToast('No .bel files in that folder.', { kind: 'warn' });
    return;
  }
  const result = await resolveAndApplyUpload(projectEntries, {
    openTabs: false,
    folderBatchRoots: typeof BelJarNameConflicts.uploadFolderBatchRoots === 'function'
      ? BelJarNameConflicts.uploadFolderBatchRoots(projectEntries)
      : [],
  });
  if (result === null) return;
  const nAdded = result.added;
  if (nAdded > 0) {
    showToast(
      'Added ' + nAdded + ' file' + (nAdded === 1 ? '' : 's') + ' to the project.',
      { kind: 'success' },
    );
  } else if (result.replaced > 0) {
    showToast('Updated existing project files.', { kind: 'success' });
  }
});

// Hidden directory input for "Import folder as new project" — creates a project
// named after the selected folder; file paths omit that outermost segment.
const folderInputEl = document.createElement('input');
folderInputEl.type = 'file';
folderInputEl.webkitdirectory = true;
folderInputEl.style.display = 'none';
document.body.appendChild(folderInputEl);

folderInputEl.addEventListener('change', async () => {
  const all = Array.from(folderInputEl.files || []);
  folderInputEl.value = '';
  if (typeof BelJarPersist === 'undefined' || !persist) return;
  const { projectEntries, belCount } = await projectEntriesFromPickerFiles(all, { stripRoot: true });
  if (!belCount) {
    showToast('No .bel files in that folder.', { kind: 'warn' });
    return;
  }
  const rootName = (all[0] && all[0].webkitRelativePath)
    ? all[0].webkitRelativePath.split('/')[0]
    : 'Imported';
  const orderedPaths = projectEntries
    .filter((e) => BelJarProjectSource.isBelPath(e.name))
    .map((e) => e.name);
  const firstBel = orderedPaths.length ? orderedPaths[0] : null;
  const tmpFiles = projectEntries.map((e, i) => ({ id: 'tmp-' + i, name: e.name }));
  const tmpText = (id) => projectEntries[Number(id.slice(4))]?.text ?? '';
  const activeCfgByDir = typeof BelJarProjectSource.inferActiveCfgByDir === 'function'
    ? BelJarProjectSource.inferActiveCfgByDir(tmpFiles, tmpText)
    : null;
  // Imports into a fresh PROJECT silo — the current project is untouched, and
  // the reload boots into the new (now active) project.
  switchProjectAndReload(() => {
    BelJarPersist.createProjectWithFiles(rootName, projectEntries, {
      projectName: rootName,
      activeCfgByDir: activeCfgByDir || undefined,
    });
    if (firstBel) {
      const created = BelJarPersist.listFiles().find((f) => f.name === firstBel);
      if (created) BelJarPersist.setActiveFileId(created.id);
    }
  });
});

function downloadCurrentFile() {
  if (!editor || typeof BelJarPersist === 'undefined') return;
  const text = editor.getValue ? editor.getValue() : (editor.getView ? editor.getView().state.doc.toString() : '');
  const fileInfo = persist ? BelJarPersist.getFileById(persist.getCurrentFileId()) : null;
  const name = fileInfo ? fileInfo.name : 'main.bel';
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Total signature files (.bel/.elf) in the workspace — gates "Run Project".
function signatureFileCount() {
  if (typeof BelJarPersist === 'undefined') return 0;
  const files = BelJarPersist.listFiles() || [];
  return files.filter((f) => BelJarProjectSource.isSignaturePath(String(f.name || ''))).length;
}

function buildProjectMenuItems() {
  const currentId = persist ? persist.getCurrentFileId() : null;
  const currentFile = currentId ? BelJarPersist.getFileById(currentId) : null;
  const switchSubmenu = buildSwitchProjectSubmenu();
  const deleteSubmenu = buildDeleteProjectSubmenu();

  return [
    {
      label: 'New project',
      onSelect: () => newProject(),
    },
    ...(switchSubmenu ? [{ label: 'Switch project', submenu: switchSubmenu }] : []),
    {
      label: 'Rename project…',
      onSelect: async () => {
        if (typeof BelJarPersist === 'undefined' || typeof BelJarNamePrompt === 'undefined') return;
        const cur = BelJarPersist.getProjectName();
        const next = await BelJarNamePrompt.open({
          ariaLabel: 'Rename project',
          message: 'Rename project',
          value: cur,
          normalize: normalizeProjectRenameName,
          validate: validateProjectRenameName,
          confirmLabel: 'Save',
        });
        if (!next) return;
        applyProjectRename(next);
      },
    },
    ...(deleteSubmenu ? [{ label: 'Delete project', submenu: deleteSubmenu }] : []),
    { type: 'separator' },
    {
      label: 'New file',
      onSelect: () => newFile(),
    },
    {
      label: 'Upload file',
      onSelect: () => fileInputEl.click(),
    },
    {
      label: 'Upload folder',
      onSelect: () => uploadFolderInputEl.click(),
    },
    {
      label: 'Import folder as new project',
      onSelect: () => folderInputEl.click(),
    },
    { type: 'separator' },
    {
      label: 'Download "' + (currentFile ? currentFile.name : 'file') + '"',
      onSelect: downloadCurrentFile,
    },
    { type: 'separator' },
    {
      label: 'Rename file…',
      disabled: !currentFile,
      onSelect: () => { if (currentId) renameFileInteractive(currentId); },
    },
    {
      label: 'Delete file…',
      disabled: !currentFile,
      onSelect: () => { if (currentId) deleteFileInteractive(currentId); },
    },
    { type: 'separator' },
    {
      label: 'Run project',
      disabled: signatureFileCount() <= 1,
      onSelect: () => {
        if (typeof BelJarBelugaRun !== 'undefined' && BelJarBelugaRun.runProject) {
          BelJarBelugaRun.runProject();
        }
      },
    },
  ];
}

function renameFileInteractive(id) {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarExplorerInlineName === 'undefined') return;
  const file = BelJarPersist.getFileById(id);
  if (!file) return;
  ensureExplorer();
  if (!explorerController) return;
  const IL = BelJarExplorerInlineName;
  explorerController.beginInlineName({
    kind: 'file',
    mode: 'rename',
    parentDir: BelJarProjectSource.dirOf(file.name),
    fileId: id,
    displayName: IL.lastSegment(file.name),
    originalPath: file.name,
  });
}

// ── File context menu (tabs + explorer rows) ──────────────────────────────────

function explorerSelectionContextItems(selection) {
  const fileIds = selection && selection.fileIds ? selection.fileIds : [];
  const folderPaths = selection && selection.folderPaths ? selection.folderPaths : [];
  const total = fileIds.length + folderPaths.length;

  if (total <= 1) {
    if (fileIds.length === 1) return fileContextItems(fileIds[0]);
    if (folderPaths.length === 1) return explorerFolderContextItems(folderPaths[0]);
    return null;
  }

  const items = [];
  const deleteCount = selectionDeleteFileIds(fileIds, folderPaths).length;
  if (deleteCount > 0) {
    items.push({
      label: deleteCount === 1 ? 'Delete file…' : `Delete ${deleteCount} files…`,
      disabled: selectionDeleteDisabled(fileIds, folderPaths),
      onSelect: () => deleteSelectionInteractive(fileIds, folderPaths),
    });
  }

  const openIds = typeof BelJarPersist !== 'undefined' ? BelJarPersist.getOpenFileIds() : [];
  const openSelected = fileIds.filter((id) => openIds.includes(id));
  if (openSelected.length) {
    items.push({
      label: openSelected.length === 1 ? 'Close tab' : `Close ${openSelected.length} tabs`,
      onSelect: () => closeTabsForFiles(openSelected),
    });
  }

  return items;
}

function fileContextItems(fileId) {
  if (typeof BelJarPersist === 'undefined') return [];
  const files = BelJarPersist.listFiles();
  const file = files.find((f) => f.id === fileId);
  if (!file) return [];
  const parentDir = typeof BelJarProjectSource !== 'undefined'
    ? BelJarProjectSource.dirOf(file.name) : '';
  const items = [
    { label: 'Rename…', onSelect: () => renameFileInteractive(fileId) },
    { type: 'separator' },
    {
      label: 'Close tab',
      disabled: BelJarPersist.getOpenFileIds().indexOf(fileId) === -1,
      onSelect: () => closeFile(fileId),
    },
    {
      label: 'Delete file…',
      onSelect: () => deleteFileInteractive(fileId),
    },
  ];
  const low = file.name.toLowerCase();
  const Run = typeof BelJarBelugaRun !== 'undefined' ? BelJarBelugaRun : null;
  if (low.endsWith('.cfg')) {
    if (Run && Run.runModuleCfg) {
      items.unshift(
        { label: 'Run suite', onSelect: () => Run.runModuleCfg(file.name) },
        { type: 'separator' },
      );
    }
    if (BelJarPersist.getActiveCfgsForDir(BelJarProjectSource.dirOf(file.name)).includes(file.name)) {
      items.unshift(
        {
          label: 'Deactivate suite',
          onSelect: () => {
            makeActiveCfgForFile(file.name);
            renderTabs();
          },
        },
        { type: 'separator' },
      );
    } else {
      items.unshift(
        {
          label: 'Make active suite',
          onSelect: () => {
            makeActiveCfgForFile(file.name);
            renderTabs();
          },
        },
        { type: 'separator' },
      );
    }
  } else if (Run && BelJarProjectSource.isSignaturePath(file.name)) {
    const runItems = [{ label: 'Run file', onSelect: () => Run.runFile(fileId) }];
    const moduleName = moduleNameFor(fileId);
    if (moduleName) {
      runItems.push(
        { label: 'Run suite to here', onSelect: () => Run.runToHere(fileId) },
        { label: `Run suite “${moduleName}”`, onSelect: () => Run.runModule(fileId) },
      );
    }
    // Suite authoring: add/remove this file from its folder's active suite (.cfg)
    // without hand-editing the cfg text.
    const { cfg, member, index, count } = activeSuiteMembership(file.name);
    const dir = BelJarProjectSource.dirOf(file.name);
    if (cfg && member) {
      if (index > 0) {
        runItems.push({ label: 'Move up in suite', onSelect: () => { BelJarPersist.moveEntryInCfg(cfg, file.name, -1); afterSuiteEdit(dir, cfg); } });
      }
      if (index < count - 1) {
        runItems.push({ label: 'Move down in suite', onSelect: () => { BelJarPersist.moveEntryInCfg(cfg, file.name, 1); afterSuiteEdit(dir, cfg); } });
      }
      runItems.push({ label: 'Remove from suite', onSelect: () => { BelJarPersist.removeEntryFromCfg(cfg, file.name); afterSuiteEdit(dir, cfg); } });
    } else {
      const activeCfgs = activeCfgsForDir(dir);
      if (activeCfgs.length === 1) {
        runItems.push({ label: 'Add to active suite', onSelect: () => { BelJarPersist.addEntryToCfg(activeCfgs[0], file.name); afterSuiteEdit(dir, activeCfgs[0]); } });
      } else {
        for (const c of activeCfgs) {
          const base = c.slice(c.lastIndexOf('/') + 1);
          runItems.push({ label: 'Add to ' + base, onSelect: () => { BelJarPersist.addEntryToCfg(c, file.name); afterSuiteEdit(dir, c); } });
        }
      }
    }
    items.unshift(...runItems, { type: 'separator' });
  }
  return explorerCreateMenuItems(parentDir).concat(items);
}

function explorerFolderContextItems(folderPath) {
  const create = explorerCreateMenuItems(folderPath);
  const rename = [
    { label: 'Rename…', onSelect: () => renameFolderInteractive(folderPath) },
    { type: 'separator' },
  ];
  const destroy = [
    {
      label: 'Delete folder…',
      onSelect: () => deleteFolderInteractive(folderPath),
    },
    { type: 'separator' },
  ];
  const run = folderRunItems(folderPath);
  const runBlock = run.length ? run.concat([{ type: 'separator' }]) : [];
  return create.concat(rename).concat(destroy).concat(runBlock);
}

// Run actions for an explorer folder row: its module if a .cfg lives there,
// else the folder's signature files as one run.
function folderRunItems(folderPath) {
  if (typeof BelJarBelugaRun === 'undefined' || typeof BelJarProjectSource === 'undefined') return [];
  const files = BelJarPersist.listFiles() || [];
  const dirOf = BelJarProjectSource.dirOf;
  const hasRunnable = files.some(
    (f) => dirOf(f.name) === folderPath && BelJarProjectSource.isSignaturePath(String(f.name)),
  );
  if (!hasRunnable) return [];
  const cfg = files.find((f) => /\.cfg$/i.test(String(f.name)) && dirOf(f.name) === folderPath);
  return [{
    label: cfg ? 'Run suite' : 'Run folder',
    onSelect: () => BelJarBelugaRun.runFolder(folderPath),
  }];
}

// Run-everything action for empty explorer space.
function backgroundRunItems() {
  const create = explorerCreateMenuItems('');
  if (typeof BelJarBelugaRun === 'undefined' || signatureFileCount() < 1) return create;
  return create.concat([
    { label: 'Run project', onSelect: () => BelJarBelugaRun.runProject() },
    { type: 'separator' },
  ]);
}

if (typeof Menu !== 'undefined') {
  const contextItemsFromEvent = (e) => {
    const el = e.target.closest('[data-file-id]');
    return el ? fileContextItems(el.getAttribute('data-file-id')) : [];
  };
  if (editorTabsEl) Menu.bindContextMenu(editorTabsEl, contextItemsFromEvent);
}

// ── Edit menu ─────────────────────────────────────────────────────────────────

function editorExec(cmd) {
  if (!editor || typeof editor[cmd] !== 'function') return;
  editor.focus();
  editor[cmd]();
}

function editorClipboard(action) {
  if (!editor) return;
  editor.focus();
  try {
    document.execCommand(action);
  } catch (_) {}
}

const editMenuItems = [
  { label: 'Undo', onSelect: () => editorExec('undo') },
  { label: 'Redo', onSelect: () => editorExec('redo') },
  { type: 'separator' },
  { label: 'Cut', onSelect: () => editorClipboard('cut') },
  { label: 'Copy', onSelect: () => editorClipboard('copy') },
  { label: 'Paste', onSelect: () => editorClipboard('paste') },
  { label: 'Select All', onSelect: () => editorExec('selectAll') },
  { type: 'separator' },
  { label: 'Find…', onSelect: () => editorExec('openSearch') },
  {
    label: 'Search in project…',
    onSelect: () => {
      if (typeof CommandPalette !== 'undefined') CommandPalette.open({ mode: 'search' });
    },
  },
];

// ── Tools menu ────────────────────────────────────────────────────────────────

function buildToolsMenuItems() {
  return [
    {
      label: 'Open command palette…',
      shortcut: typeof CommandPalette !== 'undefined'
        ? CommandPalette.shortcutLabel('Mod+K')
        : 'Ctrl+K',
      onSelect: () => {
        if (typeof CommandPalette !== 'undefined') CommandPalette.open();
      },
    },
    { type: 'separator' },
    {
      label: 'Dependency graph…',
      onSelect: () => window.BelJarCurrentEditor?.openDependencyGraph(),
    },
  ];
}

// ── Register all header menus ─────────────────────────────────────────────────

const headerMenuDefs = [
  {
    id: 'menu-project',
    side: 'bottom',
    align: 'start',
    items: buildProjectMenuItems,  // function — rebuilt on each open
  },
  {
    id: 'menu-edit',
    side: 'bottom',
    align: 'start',
    items: editMenuItems,
  },
  {
    id: 'menu-tools',
    side: 'bottom',
    align: 'start',
    items: buildToolsMenuItems,
  },
];

headerMenuDefs.forEach((def) => {
  wireMenuTrigger(document.getElementById(def.id), def);
});

const explorerNewBtn = document.getElementById('btn-explorer-new');
if (explorerNewBtn) {
  wireMenuTrigger(explorerNewBtn, {
    side: 'bottom',
    align: 'end',
    items: () => explorerCreateMenuItems('').filter((item) => item.type !== 'separator'),
  });
}

// ── Command palette ───────────────────────────────────────────────────────────

if (typeof CommandPalette !== 'undefined') {
  CommandPalette.init();
  const reg = CommandPalette.register;

  reg({ id: 'project.new', title: 'New Project…', section: 'File', run: () => newProject() });
  reg({ id: 'file.new', title: 'New file…', section: 'File', run: () => newFile() });
  reg({ id: 'file.upload', title: 'Upload File', section: 'File', run: () => fileInputEl.click() });
  reg({ id: 'file.upload-folder', title: 'Upload Folder', section: 'File', run: () => uploadFolderInputEl.click() });
  reg({ id: 'file.import-folder', title: 'Import Folder as New Project', section: 'File', run: () => folderInputEl.click() });
  reg({ id: 'file.download', title: 'Download Current File', section: 'File', run: downloadCurrentFile });

  reg({ id: 'edit.undo', title: 'Undo', section: 'Edit', shortcut: 'Mod+Z', run: () => editorExec('undo') });
  reg({ id: 'edit.redo', title: 'Redo', section: 'Edit', shortcut: 'Mod+Y', run: () => editorExec('redo') });
  reg({ id: 'edit.find', title: 'Find…', section: 'Edit', shortcut: 'Mod+F', run: () => editorExec('openSearch') });
  reg({
    id: 'edit.search-project',
    title: 'Search in Project…',
    section: 'Edit',
    shortcut: 'Mod+Shift+F',
    run: () => CommandPalette.open({ mode: 'search' }),
  });
  reg({ id: 'edit.toggle-comment', title: 'Toggle Line Comment', section: 'Edit', shortcut: 'Mod+/', run: () => editorExec('toggleComment') });
  reg({
    id: 'edit.format',
    title: 'Format Document',
    section: 'Edit',
    shortcut: 'Alt+Shift+F',
    run: () => editorExec('format'),
  });

  reg({
    id: 'nav.symbol',
    title: 'Go to Symbol…',
    section: 'Navigate',
    shortcut: 'Mod+Shift+O',
    run: () => CommandPalette.open({ mode: 'symbols' }),
  });
  reg({
    id: 'tools.palette',
    title: 'Open Command Palette',
    section: 'Tools',
    shortcut: 'Mod+K',
    run: () => CommandPalette.open(),
  });
  reg({
    id: 'tools.graph',
    title: 'Open Dependency Graph',
    section: 'Tools',
    run: () => window.BelJarCurrentEditor?.openDependencyGraph(),
  });
  reg({
    id: 'tools.inspector',
    title: 'Open Inspector',
    section: 'Tools',
    run: () => window.dispatchEvent(new Event('beljar:open-inspector')),
  });

  reg({
    id: 'run.file',
    title: 'Run File',
    section: 'Run',
    run: () => { if (typeof BelJarBelugaRun !== 'undefined' && BelJarBelugaRun.runFile) BelJarBelugaRun.runFile(); },
  });
  reg({
    id: 'run.here',
    title: 'Run Suite to Here',
    section: 'Run',
    run: () => { if (typeof BelJarBelugaRun !== 'undefined' && BelJarBelugaRun.runToHere) BelJarBelugaRun.runToHere(); },
  });
  reg({
    id: 'run.module',
    title: 'Run Suite',
    section: 'Run',
    when: () => !!moduleNameFor(),
    run: () => { if (typeof BelJarBelugaRun !== 'undefined' && BelJarBelugaRun.runModule) BelJarBelugaRun.runModule(); },
  });
  reg({
    id: 'run.project',
    title: 'Run Project',
    section: 'Run',
    when: () => signatureFileCount() > 1,
    run: () => { if (typeof BelJarBelugaRun !== 'undefined' && BelJarBelugaRun.runProject) BelJarBelugaRun.runProject(); },
  });
  reg({
    id: 'run.clear-output',
    title: 'Clear Output',
    section: 'Run',
    run: () => { if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.clearOutput(); },
  });

  reg({ id: 'view.theme', title: 'Toggle Theme', section: 'View', run: toggleTheme });
  reg({ id: 'view.explorer', title: 'Toggle Explorer', section: 'View', run: () => { if (filesBtn) filesBtn.click(); } });
  reg({
    id: 'view.settings',
    title: 'Open Settings…',
    section: 'View',
    run: () => { if (typeof BelJarSettingsUI !== 'undefined') BelJarSettingsUI.open(); },
  });

  // Files: switch tabs straight from the palette (active file excluded).
  CommandPalette.setProvider('files', () => {
    if (typeof BelJarPersist === 'undefined') return [];
    const currentId = persist ? persist.getCurrentFileId() : null;
    return BelJarPersist.listFiles()
      .filter((f) => f.id !== currentId)
      .map((f) => ({ title: f.name, detail: 'Switch to file', run: () => switchToFile(f.id) }));
  });

  // Symbols ("@" mode): global declarations in the active file, jump on select.
  CommandPalette.setProvider('symbols', () => {
    const ed = window.BelJarCurrentEditor;
    const engine = ed && ed.getSemanticEngine ? ed.getSemanticEngine() : null;
    const snap = engine && engine.getSnapshot ? engine.getSnapshot() : null;
    const symbols = snap && snap.symbols ? snap.symbols.globalSymbols : [];
    function statusPrefix(symbolId) {
      const node = snap && snap.graph && snap.graph.nodeMap
        ? snap.graph.nodeMap.get(symbolId)
        : null;
      const st = node && node.status;
      if (st === 'syntax-fault' || st === 'erroring') return '\u26a0 ';
      if (st === 'blocked') return '\u2298 ';
      return '';
    }
    const items = symbols.map((s) => ({
      title: statusPrefix(s.id) + s.name,
      detail: s.label || '',
      run: () => ed.jumpToRange(s.nameRange || s.range),
    }));
    // Then every definition in the rest of the file's development group —
    // selecting one opens that file and jumps to the definition.
    const cross = ed && typeof ed.listProjectSymbols === 'function' ? ed.listProjectSymbols() : [];
    for (const s of cross) {
      items.push({
        title: s.name,
        detail: s.fileName.split('/').pop(),
        run: () => openFileAt(s.fileId, s.from, s.to),
      });
    }
    return items;
  });

  // Project text search ("#" mode / Ctrl+Shift+F): substring match across every
  // project file (live buffer for the active one), jump on select.
  CommandPalette.setProvider('search', (query) => {
    if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return [];
    if (!query || query.length < 2) return [];
    const activeId = persist ? persist.getCurrentFileId() : BelJarPersist.getActiveFileId();
    const entries = BelJarPersist.listFiles().map((f) => ({
      id: f.id,
      name: f.name,
      text: projectFileText(f.id),
    }));
    return BelJarProjectSource.scanProjectText(entries, query, 60).map((m) => ({
      title: m.lineText,
      mono: true,
      detail: m.name.split('/').pop() + ':' + m.line,
      run: () => openFileAt(m.id, m.from, m.to),
    }));
  });

}

// ── Settings ──────────────────────────────────────────────────────────────────

const settingsBtn = document.getElementById('btn-settings');
if (settingsBtn && typeof BelJarDialog !== 'undefined') {
  settingsBtn.addEventListener('click', () => {
    if (typeof BelJarSettingsUI !== 'undefined') BelJarSettingsUI.open();
  });
}

// ── Toolbar buttons ───────────────────────────────────────────────────────────

document.getElementById('btn-theme').addEventListener('click', toggleTheme);
document.getElementById('btn-load').addEventListener('click', (e) => {
  if (typeof BelJarBelugaRun === 'undefined') return;
  const file = activeFileRecord();
  if (file && /\.cfg$/i.test(file.name)) {
    BelJarBelugaRun.runModuleCfg(file.name);
    return;
  }
  // Plain click = Run Module to Here (active file + its module predecessors).
  // Ctrl/Cmd+click = Run Module (the whole module the active file belongs to).
  // Run File and Run Project (workspace) live in the command palette.
  if (e.ctrlKey || e.metaKey) BelJarBelugaRun.runModule();
  else BelJarBelugaRun.runToHere();
});
document.getElementById('btn-clear').addEventListener('click', () => {
  if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.clearOutput();
  if (typeof BelJarReplCommands !== 'undefined') BelJarReplCommands.resetHistoryIndex();
});
document.getElementById('btn-run').addEventListener('click', () => {
  if (typeof BelJarReplCommands !== 'undefined') BelJarReplCommands.runCmd();
});

cmdInput.addEventListener('input', () => {
  if (typeof BelJarReplCommands !== 'undefined') BelJarReplCommands.resetHistoryIndex();
});
cmdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (typeof BelJarReplCommands !== 'undefined') BelJarReplCommands.runCmd();
    return;
  }
  if (e.key === 'ArrowUp') {
    if (typeof BelJarReplCommands !== 'undefined' && BelJarReplCommands.historyUp()) e.preventDefault();
    return;
  }
  if (e.key === 'ArrowDown') {
    if (typeof BelJarReplCommands !== 'undefined' && BelJarReplCommands.historyDown()) e.preventDefault();
  }
});

window.addEventListener('beforeunload', () => {
  if (persist && !suppressUnloadFlush) persist.flushCheckpoint();
  if (typeof BelJarWorkspaceState !== 'undefined') BelJarWorkspaceState.flushWorkspace();
});
window.addEventListener('pagehide', () => {
  if (persist && !suppressUnloadFlush) persist.flushCheckpoint();
  if (typeof BelJarWorkspaceState !== 'undefined') BelJarWorkspaceState.flushWorkspace();
});

if (typeof RunProgress !== 'undefined') {
  RunProgress.bind({
    header: document.getElementById('output-panel-header'),
    fill: document.getElementById('output-header-progress'),
    status: document.getElementById('output-header-status'),
    output: document.getElementById('output'),
  });
}
