import { create as createEmptyState } from './app-empty-state.mjs';
import { create as createSidePanels } from './app-side-panels.mjs';
import { create as createFileTabs } from './app-file-tabs.mjs';
import { create as createSuiteCfg } from './app-suite-cfg.mjs';
import { create as createUploadImport } from './app-upload-import.mjs';
import { create as createFileLifecycle } from './app-file-lifecycle.mjs';
import { create as createExplorerBootstrap } from './app-explorer-bootstrap.mjs';
import { create as createMenus } from './app-menus.mjs';
import { create as createCommandPalette } from './app-command-palette.mjs';

const editorMount = document.getElementById('editor');
const editorEmptyEl = document.getElementById('editor-empty');
const inspectorProjectEmptyEl = document.getElementById('inspector-project-empty');
const cmdInput = (typeof ReplStream !== 'undefined' && ReplStream.getCommandInput)
  ? ReplStream.getCommandInput()
  : document.getElementById('command-input');
const btnRun = (typeof ReplStream !== 'undefined' && ReplStream.getRunButton)
  ? ReplStream.getRunButton()
  : document.getElementById('btn-run');

// ── Project init ──────────────────────────────────────────────────────────────

Persist.ensureProject();
ensureProjectActiveCfgs();

if (typeof EditHistoryInstall !== 'undefined') {
  EditHistoryInstall.init();
}

const openFileIds = Persist.getOpenFileIds();
const activeFileId = openFileIds.length
  ? (openFileIds.includes(Persist.getActiveFileId())
    ? Persist.getActiveFileId()
    : openFileIds[0])
  : null;

let persist = activeFileId
  ? Persist.createPersist({ documentId: activeFileId })
  : null;

const initialCheckpoint = persist ? persist.getInitialCheckpoint() : null;

// Mount an editor for a persisted snapshot. Used at startup and on every file
// switch — each document gets a fresh editor + semantic engine so symbol
// identity, checkpoints, and providers are always keyed to the right file.
function mountEditorFor(snapshot, openOpts) {
  if (typeof BelEditor === 'undefined' || !BelEditor.mount) return null;
  const initialLocal = openOpts && openOpts.initialLocal != null
    ? openOpts.initialLocal
    : (snapshot ? snapshot.editor.local : null);
  const docId = (persist && persist.getCurrentFileId())
    || (snapshot && snapshot.meta && snapshot.meta.documentId)
    || undefined;
  const file = docId
    ? Persist.getFileById(docId)
    : null;
  const ed = BelEditor.mount(editorMount, {
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
  if (ed && typeof EditHistory !== 'undefined') {
    queueMicrotask(() => {
      const id = ed.getCurrentFileId?.();
      const text = ed.getValue?.();
      if (id != null && text != null) EditHistory.reconcileActiveFile(id, text);
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
  if (typeof BelEditor !== 'undefined') {
    if (BelEditor.collectFloatingInspectorWindows) {
      BelEditor.collectFloatingInspectorWindows(fileId, out);
    }
    if (BelEditor.collectFloatingGraphWindows) {
      BelEditor.collectFloatingGraphWindows(fileId, out);
    }
  }
  if (typeof Harpoon !== 'undefined' && Harpoon.collectFloatingHarpoonWindows) {
    Harpoon.collectFloatingHarpoonWindows(fileId, out);
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
    if (entry.kind === 'inspector' && typeof BelEditor !== 'undefined'
      && BelEditor.restoreFloatingInspectorWindow) {
      ok = BelEditor.restoreFloatingInspectorWindow(entry, view);
    } else if (entry.kind === 'graph' && typeof BelEditor !== 'undefined'
      && BelEditor.restoreFloatingGraphWindow) {
      ok = BelEditor.restoreFloatingGraphWindow(entry, view);
    } else if (entry.kind === 'harpoon' && typeof Harpoon !== 'undefined'
      && Harpoon.restoreFloatingHarpoonWindow) {
      ok = Harpoon.restoreFloatingHarpoonWindow(entry, view, engine);
    }
    if (!ok) skipped += 1;
  }
  if (skipped > 0 && Toasts.error) {
    Toasts.error(
      skipped === 1
        ? 'Could not restore a floating window after reload.'
        : `Could not restore ${skipped} floating windows after reload.`,
      { duration: 5000 },
    );
  }
}

function registerWorkspaceProviders() {
  WorkspaceState.registerProvider('inspector', {
    collect(out) {
      if (typeof BelEditor !== 'undefined' && BelEditor.collectWorkspaceInspector) {
        BelEditor.collectWorkspaceInspector(out);
      }
    },
    restoreSidebar(sidebar, deps) {
      if (typeof BelEditor !== 'undefined' && BelEditor.restoreWorkspaceInspector) {
        BelEditor.restoreWorkspaceInspector(sidebar, deps);
      }
    },
  });
  WorkspaceState.registerProvider('explorer', {
    collect(out) {
      if (getExplorerController() && getExplorerController().collectWorkspaceExplorer) {
        getExplorerController().collectWorkspaceExplorer(out);
      }
    },
    restoreSidebar(sidebar) {
      if (!workspaceEl?.classList.contains('is-explorer-open')) return;
      if (getExplorerController() && getExplorerController().restoreWorkspaceExplorer) {
        getExplorerController().restoreWorkspaceExplorer(sidebar);
      }
    },
  });
  WorkspaceState.registerProvider('harpoon-panel', {
    collect(out) {
      if (typeof HarpoonPanel !== 'undefined' && HarpoonPanel.collectWorkspaceHarpoon) {
        HarpoonPanel.collectWorkspaceHarpoon(out);
      }
    },
    restoreSidebar(sidebar, deps) {
      if (!workspaceEl?.classList.contains('is-harpoon-open')) return;
      if (typeof HarpoonPanel !== 'undefined' && HarpoonPanel.restoreWorkspaceHarpoon) {
        HarpoonPanel.restoreWorkspaceHarpoon(sidebar, deps);
      }
    },
  });
  WorkspaceState.registerProvider('floating', {
    collect(out) {
      const fileId = persist
        ? persist.getCurrentFileId()
        : Persist.getActiveFileId();
      collectWorkspaceFloating(fileId, out);
    },
  });
}

function applyStoredSidePanel(id) {
  if (!id) return;
  if (typeof Persist.readStoredRestorePanels === 'function'
    && !Persist.readStoredRestorePanels()) return;
  closeOtherSidePanels(id);
  setSidePanelOpen(id, true);
  notifySidePanelLayout();
}

let workspaceBootPending = true;
const restoredFloatIds = new Set();

function restoreWorkspaceForFile(fileId) {
  if (!fileId) return;
  const ws = WorkspaceState.readWorkspace();
  const openIds = Persist.getOpenFileIds();
  const floats = WorkspaceState.filterFloatingForFile(ws.floating, fileId, openIds)
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
  const ws = WorkspaceState.readWorkspace();
  WorkspaceState.applyWorkspace(ws, {
    projectId: Persist.getActiveProjectId(),
    openFileIds: Persist.getOpenFileIds(),
    activeFileId: persist ? persist.getCurrentFileId() : Persist.getActiveFileId(),
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
  window.CurrentEditor = editor;
  window.BelJarCurrentEditor = window.CurrentEditor
  syncEditorCmTheme();
  if (typeof BelugaClient !== 'undefined' && BelugaClient.noteEditorChange) {
    BelugaClient.noteEditorChange(editor ? editor.getValue() : '');
  }
  notifyActiveEditorView();
  refreshInspector();
  updateRunButtonTooltip();
}

function ensureEditorMatchesFileKind() {
  if (!persist || !editor) return;
  const id = persist.getCurrentFileId();
  if (!id) return;
  const file = Persist.getFileById(id);
  if (!file) return;
  if (isCfgFileName(file.name) !== editorViewIsCfg(editor)) remountActiveEditor();
}

let editor = activeFileId ? mountEditorFor(initialCheckpoint) : null;
ensureEditorMatchesFileKind();

window.CurrentEditor = editor;
window.BelJarCurrentEditor = window.CurrentEditor

let cfgExplorerRefreshTimer = null;

// Authoritative project text: the open editor buffer for the active file,
// otherwise the persisted checkpoint (backend may lag autosave).
function projectFileText(fileId) {
  if (!fileId) return '';
  const activeId = Persist.getActiveFileId();
  const ed = typeof window !== 'undefined' ? window.CurrentEditor : null;
  if (fileId === activeId && ed && typeof ed.getValue === 'function') {
    return ed.getValue();
  }
  return Persist.getFileText(fileId) ?? '';
}

function scheduleCfgExplorerRefresh(cfgName) {
  clearTimeout(cfgExplorerRefreshTimer);
  cfgExplorerRefreshTimer = setTimeout(() => onCfgContentChange(cfgName), 80);
}

// Live cfg edits change suite membership and dangling-entry state — refresh
// without reloadActiveEditorFromPersist (would fight the in-flight buffer).
function onCfgContentChange(cfgName) {
  const dir = ProjectSource.dirOf(cfgName);
  reconcileActiveCfgsInDir(dir, cfgName);
  const activeFile = activeFileRecord();
  if (editor?.remoduleContext && activeFile && ProjectSource.dirOf(activeFile.name) === dir) {
    editor.remoduleContext();
  }
  renderExplorerTree();
  updateHeaderContext();
  updateRunButtonTooltip();
}

function projectIsEmpty() {
  return Persist.listFiles().length === 0;
}

function projectTreeEmpty() {
  return Persist.listFiles().length === 0
    && Persist.listEmptyFolders().length === 0;
}

function editorCanvasIdle() {
  if (projectIsEmpty()) return true;
  return Persist.getOpenFileIds().length === 0;
}

function enterCanvasIdleView() {
  if (persist) persist.flushCheckpoint();
  WorkspaceState.flushWorkspace();
  if (editor && typeof editor.destroy === 'function') editor.destroy();
  editor = null;
  window.CurrentEditor = null;
  window.BelJarCurrentEditor = window.CurrentEditor
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
  if (Persist.clearEmptyFolders) {
    Persist.clearEmptyFolders();
  }
  enterCanvasIdleView();
}

function ensurePersistForFile(id) {
  if (!id) return null;
  if (!persist) persist = Persist.createPersist({ documentId: id });
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
WorkspaceSplit.init({ onResize: onWorkspaceLayoutResize });
SidePanelResize.init({ onResize: onWorkspaceLayoutResize });

var restoredTranscript = typeof ReplPersist !== 'undefined'
  && ReplPersist.restore
  && ReplPersist.restore();
if (!restoredTranscript) ReplOutput.insertWelcomeBanner();
BelugaRun.init();
Toasts.init();
Notifications.init();

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
    if (typeof BelEditor !== 'undefined' && typeof BelEditor.applyEditorPrefs === 'function') {
      BelEditor.applyEditorPrefs();
    }
  }
  if ((key === 'library-expand-default' || key === 'workspace-reset')
    && getLibraryController() && typeof getLibraryController().refresh === 'function') {
    getLibraryController().refresh();
  }
  if (key === 'repl-history-persist' || key === 'repl-reset') {
    if (typeof ReplPersist !== 'undefined' && ReplPersist.saveNow) {
      ReplPersist.saveNow();
    }
  }
}

window.beljarApplyLiveSettings = applyLiveSettings;
window.addEventListener('beljar:settings-changed', function (e) {
  applyLiveSettings(e && e.detail ? e.detail.key : '');
});

function showToast(message, opts) {
  return Toasts.show(message, opts);
}

if (!editor && (typeof BelEditor === 'undefined' || !BelEditor.mount)) {
  {
    Toasts.error('CodeMirror editor bundle failed to load.', { duration: 0, closable: true });
  }
}

function setTip(el, text, opts) {
  if (!el || typeof Tooltips === 'undefined' || !Tooltips.set) return;
  Tooltips.set(el, text, opts);
}

function toggleTheme() {
  document.documentElement.classList.toggle('light');
  var isLight = document.documentElement.classList.contains('light');
  Persist.writeStoredTheme(isLight ? 'light' : 'dark');
  syncEditorCmTheme();
}

window.Repl = {
  appendBuffered: function (text, kind) {
    ReplOutput.appendOutput(text, kind || 'auto');
  },
};
window.BelJarRepl = window.Repl;

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
      Persist.writeStoredExplorerOpen(open);
    },
  },
  inspector: {
    btn: inspectorBtn,
    panel: inspectorPanelEl,
    openClass: 'is-inspector-open',
    writeOpen: (open) => {
      Persist.writeStoredInspectorOpen(open);
    },
  },
  library: {
    btn: libraryBtn,
    panel: libraryPanelEl,
    openClass: 'is-library-open',
    writeOpen: (open) => {
      Persist.writeStoredLibraryOpen(open);
      if (!open) {
        const lib = getLibraryController();
        if (lib && typeof lib.collapseFolders === 'function') lib.collapseFolders();
      }
    },
  },
  harpoon: {
    btn: harpoonBtn,
    panel: harpoonPanelEl,
    openClass: 'is-harpoon-open',
    writeOpen: (open) => {
      if (Persist.writeStoredHarpoonOpen) {
        Persist.writeStoredHarpoonOpen(open);
      }
    },
  },
};

// ── File tabs ─────────────────────────────────────────────────────────────────

const editorTabsEl = document.getElementById('editor-tabs');
const cfgTabLint = new Map();

function liveFileLint() {
  const ed = window.CurrentEditor;
  if (!ed || typeof ed.getIdeStatus !== 'function') return null;
  const st = ed.getIdeStatus();
  return { errors: st.errors, warnings: st.warnings };
}

function belFileHealth(fileId) {
  if (typeof BelEditor === 'undefined' || typeof BelEditor.fileHealthFor !== 'function') {
    return { errors: 0, warnings: 0, items: [] };
  }
  const activeId = Persist.getActiveFileId();
  let live = null;
  if (fileId === activeId && window.CurrentEditor?.getValue) {
    live = window.CurrentEditor.getValue();
  }
  return BelEditor.fileHealthFor(fileId, live);
}

function fileLintCounts(fileId, activeId) {
  const file = Persist.getFileById(fileId)
  const name = file?.name || '';
  if (/\.cfg$/i.test(name)) {
    return fileId === activeId ? liveFileLint() : cfgTabLint.get(fileId);
  }
  if (ProjectSource.isSignaturePath(name)) {
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
    const activeId = Persist.getActiveFileId();
    const ed = window.CurrentEditor;
    if (fileId === activeId && ed && typeof ed.getLintTooltipItems === 'function') {
      return ed.getLintTooltipItems();
    }
    const cached = cfgTabLint.get(fileId);
    return cached && Array.isArray(cached.items) ? cached.items : null;
  }
  if (ProjectSource.isSignaturePath(fileName)) {
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
  setTip(el, diag === 'error' ? 'Has errors' : 'Has warnings', { ariaLabel: false });
}

function updateTabLintStyles() {
  if (!editorTabsEl) return;
  const activeId = persist ? persist.getCurrentFileId() : Persist.getActiveFileId();
  editorTabsEl.querySelectorAll('.editor-tab[data-file-id]').forEach((tab) => {
    const id = tab.getAttribute('data-file-id');
    tab.classList.toggle('has-errors', fileTabHasErrors(id, activeId));
  });
  // Mirror the error state into the explorer rows (in place, no re-render).
  if (getExplorerController() && typeof getExplorerController().refreshDiags === 'function') {
    getExplorerController().refreshDiags();
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

// Explorer tree (rendering, fold state, DnD) — see js/explorer/explorer.mjs

// ── Wave B peels ──────────────────────────────────────────────────────────────
// var (not let): ensureProjectActiveCfgs runs at top-of-file boot before this
// line would execute; let would TDZ on the early `if (suiteCfgApi)` check.
var suiteCfgApi = null;
var explorerBootstrapApi = null;
var fileLifecycleApi = null;
var uploadImportApi = null;
var menusApi = null;
var emptyStateApi = null;
var sidePanelsApi = null;
var fileTabsApi = null;

function getExplorerController() {
  return explorerBootstrapApi && explorerBootstrapApi.getExplorerController
    ? explorerBootstrapApi.getExplorerController() : null;
}
function getLibraryController() {
  return explorerBootstrapApi && explorerBootstrapApi.getLibraryController
    ? explorerBootstrapApi.getLibraryController() : null;
}

function ensureProjectActiveCfgs() {
  if (suiteCfgApi) return suiteCfgApi.ensureProjectActiveCfgs.apply(suiteCfgApi, arguments);
  // Early boot (before __initAppPeels): backfill only — same bytes as peel.
  if (typeof ProjectSource.inferActiveCfgByDir !== 'function') return;
  if (typeof Persist.backfillActiveCfgByDir !== 'function') return;
  const files = Persist.listFiles();
  const getText = (id) => projectFileText(id);
  Persist.backfillActiveCfgByDir(ProjectSource.inferActiveCfgByDir(files, getText));
}
function ensureActiveCfgForDir() { return suiteCfgApi.ensureActiveCfgForDir.apply(suiteCfgApi, arguments); }
function activeCfgForDir() { return suiteCfgApi.activeCfgForDir.apply(suiteCfgApi, arguments); }
function activeCfgsForDir() { return suiteCfgApi.activeCfgsForDir.apply(suiteCfgApi, arguments); }
function suiteMembersResolver() { return suiteCfgApi.suiteMembersResolver.apply(suiteCfgApi, arguments); }
function suiteLayoutForDir() { return suiteCfgApi.suiteLayoutForDir.apply(suiteCfgApi, arguments); }
function owningActiveCfgForFile() { return suiteCfgApi.owningActiveCfgForFile.apply(suiteCfgApi, arguments); }
function reconcileActiveCfgsInDir() { return suiteCfgApi.reconcileActiveCfgsInDir.apply(suiteCfgApi, arguments); }
function makeActiveCfgForFile() { return suiteCfgApi.makeActiveCfgForFile.apply(suiteCfgApi, arguments); }
function moduleNameFor() { return suiteCfgApi.moduleNameFor.apply(suiteCfgApi, arguments); }
function activeSuiteMembership() { return suiteCfgApi.activeSuiteMembership.apply(suiteCfgApi, arguments); }
function cfgHasDanglingEntry() { return suiteCfgApi.cfgHasDanglingEntry.apply(suiteCfgApi, arguments); }
function explorerFileDiag() { return suiteCfgApi.explorerFileDiag.apply(suiteCfgApi, arguments); }
function afterSuiteEdit() { return suiteCfgApi.afterSuiteEdit.apply(suiteCfgApi, arguments); }
function activeFileRecord() { return suiteCfgApi.activeFileRecord.apply(suiteCfgApi, arguments); }
function updateRunButtonTooltip() { return suiteCfgApi.updateRunButtonTooltip.apply(suiteCfgApi, arguments); }

function renameFolderPrefix() { return explorerBootstrapApi.renameFolderPrefix.apply(explorerBootstrapApi, arguments); }
function handleExplorerInlineCancel() { return explorerBootstrapApi.handleExplorerInlineCancel.apply(explorerBootstrapApi, arguments); }
function handleExplorerInlineCommit() { return explorerBootstrapApi.handleExplorerInlineCommit.apply(explorerBootstrapApi, arguments); }
function startExplorerCreateFile() { return explorerBootstrapApi.startExplorerCreateFile.apply(explorerBootstrapApi, arguments); }
function startExplorerCreateFolder() { return explorerBootstrapApi.startExplorerCreateFolder.apply(explorerBootstrapApi, arguments); }
function explorerCreateMenuItems() { return explorerBootstrapApi.explorerCreateMenuItems.apply(explorerBootstrapApi, arguments); }
function renameFolderInteractive() { return explorerBootstrapApi.renameFolderInteractive.apply(explorerBootstrapApi, arguments); }
function ensureExplorer() { return explorerBootstrapApi.ensureExplorer.apply(explorerBootstrapApi, arguments); }
function ensureExplorerSearch() { return explorerBootstrapApi.ensureExplorerSearch.apply(explorerBootstrapApi, arguments); }
function ensureLibrary() { return explorerBootstrapApi.ensureLibrary.apply(explorerBootstrapApi, arguments); }
function renderExplorerTree() { return explorerBootstrapApi.renderExplorerTree.apply(explorerBootstrapApi, arguments); }
function refreshExplorerActiveAndDiags() { return explorerBootstrapApi.refreshExplorerActiveAndDiags.apply(explorerBootstrapApi, arguments); }
function refreshInspector() { return explorerBootstrapApi.refreshInspector.apply(explorerBootstrapApi, arguments); }
function notifyActiveEditorView() { return explorerBootstrapApi.notifyActiveEditorView.apply(explorerBootstrapApi, arguments); }

function applyEditorJump() { return fileLifecycleApi.applyEditorJump.apply(fileLifecycleApi, arguments); }
function switchToFile() { return fileLifecycleApi.switchToFile.apply(fileLifecycleApi, arguments); }
function captureRefPeekRestore() { return fileLifecycleApi.captureRefPeekRestore.apply(fileLifecycleApi, arguments); }
function beginRefPeekSession() { return fileLifecycleApi.beginRefPeekSession.apply(fileLifecycleApi, arguments); }
function endRefPeekSession() { return fileLifecycleApi.endRefPeekSession.apply(fileLifecycleApi, arguments); }
function peekFileAt() { return fileLifecycleApi.peekFileAt.apply(fileLifecycleApi, arguments); }
function openFileAt() { return fileLifecycleApi.openFileAt.apply(fileLifecycleApi, arguments); }
function newFile() { return fileLifecycleApi.newFile.apply(fileLifecycleApi, arguments); }
function closeFile() { return fileLifecycleApi.closeFile.apply(fileLifecycleApi, arguments); }
function deleteFileInteractive() { return fileLifecycleApi.deleteFileInteractive.apply(fileLifecycleApi, arguments); }
function deleteFilesInteractive() { return fileLifecycleApi.deleteFilesInteractive.apply(fileLifecycleApi, arguments); }
function closeTabsForFiles() { return fileLifecycleApi.closeTabsForFiles.apply(fileLifecycleApi, arguments); }
function selectionDeleteFileIds() { return fileLifecycleApi.selectionDeleteFileIds.apply(fileLifecycleApi, arguments); }
function selectionDeleteDisabled() { return fileLifecycleApi.selectionDeleteDisabled.apply(fileLifecycleApi, arguments); }
function deleteSelectionInteractive() { return fileLifecycleApi.deleteSelectionInteractive.apply(fileLifecycleApi, arguments); }
function filesUnderFolder() { return fileLifecycleApi.filesUnderFolder.apply(fileLifecycleApi, arguments); }
function deleteFolderInteractive() { return fileLifecycleApi.deleteFolderInteractive.apply(fileLifecycleApi, arguments); }

function relPathFromPickerFile() { return uploadImportApi.relPathFromPickerFile.apply(uploadImportApi, arguments); }
function projectEntriesFromRawEntries() { return uploadImportApi.projectEntriesFromRawEntries.apply(uploadImportApi, arguments); }
function projectEntriesFromPickerFiles() { return uploadImportApi.projectEntriesFromPickerFiles.apply(uploadImportApi, arguments); }
function exportLibraryAsNewProject() { return uploadImportApi.exportLibraryAsNewProject.apply(uploadImportApi, arguments); }
function applyFileReplacement() { return uploadImportApi.applyFileReplacement.apply(uploadImportApi, arguments); }
function deleteProjectFilesById() { return uploadImportApi.deleteProjectFilesById.apply(uploadImportApi, arguments); }
function executeUploadPlan() { return uploadImportApi.executeUploadPlan.apply(uploadImportApi, arguments); }
function resolveAndApplyUpload() { return uploadImportApi.resolveAndApplyUpload.apply(uploadImportApi, arguments); }
function reloadActiveEditorFromPersist() { return uploadImportApi.reloadActiveEditorFromPersist.apply(uploadImportApi, arguments); }
function syncCfgEditorsAfterRewrite() { return uploadImportApi.syncCfgEditorsAfterRewrite.apply(uploadImportApi, arguments); }
function applyMovePlan() { return uploadImportApi.applyMovePlan.apply(uploadImportApi, arguments); }
function resolveAndApplyMove() { return uploadImportApi.resolveAndApplyMove.apply(uploadImportApi, arguments); }
function downloadCurrentFile() { return uploadImportApi.downloadCurrentFile.apply(uploadImportApi, arguments); }
function downloadFileById() { return uploadImportApi.downloadFileById.apply(uploadImportApi, arguments); }
function downloadFolder() { return uploadImportApi.downloadFolder.apply(uploadImportApi, arguments); }
function downloadSuite() { return uploadImportApi.downloadSuite.apply(uploadImportApi, arguments); }
function suiteDownloadState() { return uploadImportApi.suiteDownloadState.apply(uploadImportApi, arguments); }

function wireMenuTrigger() { return menusApi.wireMenuTrigger.apply(menusApi, arguments); }
function signatureFileCount() { return menusApi.signatureFileCount.apply(menusApi, arguments); }
function buildProjectMenuItems() { return menusApi.buildProjectMenuItems.apply(menusApi, arguments); }
function renameFileInteractive() { return menusApi.renameFileInteractive.apply(menusApi, arguments); }
function explorerSelectionContextItems() { return menusApi.explorerSelectionContextItems.apply(menusApi, arguments); }
function fileContextItems() { return menusApi.fileContextItems.apply(menusApi, arguments); }
function explorerFolderContextItems() { return menusApi.explorerFolderContextItems.apply(menusApi, arguments); }
function folderRunItems() { return menusApi.folderRunItems.apply(menusApi, arguments); }
function backgroundRunItems() { return menusApi.backgroundRunItems.apply(menusApi, arguments); }
function editorExec() { return menusApi.editorExec.apply(menusApi, arguments); }
function editorClipboard() { return menusApi.editorClipboard.apply(menusApi, arguments); }
function buildToolsMenuItems() { return menusApi.buildToolsMenuItems.apply(menusApi, arguments); }

function updateInspectorProjectEmpty() { return emptyStateApi.updateInspectorProjectEmpty.apply(emptyStateApi, arguments); }
function updateEditorEmptyState() { return emptyStateApi.updateEditorEmptyState.apply(emptyStateApi, arguments); }

function setSidePanelOpen() { return sidePanelsApi.setSidePanelOpen.apply(sidePanelsApi, arguments); }
function closeOtherSidePanels() { return sidePanelsApi.closeOtherSidePanels.apply(sidePanelsApi, arguments); }
function notifySidePanelLayout() { return sidePanelsApi.notifySidePanelLayout.apply(sidePanelsApi, arguments); }
function toggleSidePanel() { return sidePanelsApi.toggleSidePanel.apply(sidePanelsApi, arguments); }
function wireSidebarOpenTooltip() { return sidePanelsApi.wireSidebarOpenTooltip.apply(sidePanelsApi, arguments); }

function renderTabs() { return fileTabsApi.renderTabs.apply(fileTabsApi, arguments); }

const peelHub = {
  getEditor: () => editor,
  setEditor: (ed) => {
    editor = ed;
    window.CurrentEditor = ed;
    window.BelJarCurrentEditor = ed;
  },
  getPersist: () => persist,
  setPersist: (p) => { persist = p; },
};

function __initAppPeels() {
  emptyStateApi = createEmptyState({
    getInspectorPanelEl: () => inspectorPanelEl,
    getInspectorProjectEmptyEl: () => inspectorProjectEmptyEl,
    getEditorEmptyEl: () => editorEmptyEl,
    getEditorMount: () => editorMount,
    projectTreeEmpty,
    editorCanvasIdle,
  });

  sidePanelsApi = createSidePanels({
    workspaceEl,
    panels: SIDE_PANELS,
    onLayout: () => {
      if (editor && editor.getView) editor.getView().requestMeasure();
    },
    scheduleWorkspaceSave: () => {
      WorkspaceState.scheduleSave();
    },
  });

  fileTabsApi = createFileTabs({
    editorTabsEl,
    listOpenFiles: () => {
      return Persist.getOpenFileIds()
        .map((id) => Persist.getFileById(id))
        .filter(Boolean);
    },
    getActiveId: () => (persist ? persist.getCurrentFileId() : Persist.getActiveFileId()),
    fileHasErrors: (fileId) => {
      const activeId = persist ? persist.getCurrentFileId() : Persist.getActiveFileId();
      return fileTabHasErrors(fileId, activeId);
    },
    setTip: setTip,
    onSwitch: (id) => switchToFile(id),
    onClose: (id) => closeFile(id),
    onNew: () => newFile(),
  });

  suiteCfgApi = createSuiteCfg(Object.assign({}, peelHub, {
    projectFileText, showToast, belFileHealth, liveFileLint, cfgTabLint, setTip,
    renderExplorerTree, updateHeaderContext, reloadActiveEditorFromPersist,
    renderTabs, getLibraryController,
  }));

  uploadImportApi = createUploadImport(Object.assign({}, peelHub, {
    showToast, projectFileText, switchToFile, switchProjectAndReload,
    ensureEditorMatchesFileKind, updateEditorEmptyState, renderTabs,
    renderExplorerTree, updateHeaderContext, updateRunButtonTooltip,
    enterEmptyProjectView, enterCanvasIdleView, projectIsEmpty, onCfgContentChange,
    cfgTabLint,
  }));

  fileLifecycleApi = createFileLifecycle(Object.assign({}, peelHub, {
    mountEditorFor, ensurePersistForFile, syncEditorCmTheme, updateEditorEmptyState,
    renderTabs, renderExplorerTree, updateHeaderContext, updateRunButtonTooltip,
    notifyActiveEditorView, refreshInspector, refreshExplorerActiveAndDiags,
    scheduleTabLintStyles, liveFileLint, rememberCfgLint, cfgTabLint,
    ensureActiveCfgForDir, ensureEditorMatchesFileKind,
    showToast, projectIsEmpty, enterCanvasIdleView, enterEmptyProjectView,
    deleteProjectFilesById, getExplorerController,
    syncCfgEditorsAfterRewrite: uploadImportApi.syncCfgEditorsAfterRewrite,
  }));

  explorerBootstrapApi = createExplorerBootstrap(Object.assign({}, peelHub, {
    projectFileText, showToast, setTip,
    explorerPanelEl, libraryPanelEl, inspectorPanelEl, inspectorProjectEmptyEl,
    renderTabs, updateHeaderContext, updateRunButtonTooltip, reloadActiveEditorFromPersist,
    switchToFile, ensureEditorMatchesFileKind, activeCfgForDir, activeCfgsForDir,
    suiteLayoutForDir, explorerFileDiag, bindExplorerDiagTip, makeActiveCfgForFile,
    fileContextItems, explorerSelectionContextItems, explorerFolderContextItems,
    backgroundRunItems, resolveAndApplyMove, afterSuiteEdit, applyFileReplacement,
    executeUploadPlan, exportLibraryAsNewProject, projectIsEmpty, projectTreeEmpty,
    updateInspectorProjectEmpty,
    getWorkspaceBootPending: () => workspaceBootPending,
    restoreWorkspaceForFile,
  }));

  menusApi = createMenus(Object.assign({}, peelHub, {
    newProject, newFile, buildSwitchProjectSubmenu, buildDeleteProjectSubmenu,
    normalizeProjectRenameName, validateProjectRenameName, applyProjectRename,
    fileInputEl: uploadImportApi.fileInputEl,
    uploadFolderInputEl: uploadImportApi.uploadFolderInputEl,
    folderInputEl: uploadImportApi.folderInputEl,
    downloadCurrentFile, downloadFileById, downloadFolder, downloadSuite, suiteDownloadState,
    deleteFileInteractive, closeFile, closeTabsForFiles,
    selectionDeleteFileIds, selectionDeleteDisabled, deleteSelectionInteractive,
    deleteFolderInteractive, renameFolderInteractive, explorerCreateMenuItems,
    makeActiveCfgForFile, moduleNameFor, activeSuiteMembership, activeCfgsForDir,
    afterSuiteEdit, renderTabs, renderExplorerTree, updateHeaderContext,
    ensureEditorMatchesFileKind, showToast, ensureExplorer, getExplorerController,
    editorTabsEl,
  }));

  createCommandPalette(Object.assign({}, peelHub, {
    toggleSidePanel, toggleTheme, newProject, newFile,
    fileInputEl: uploadImportApi.fileInputEl,
    uploadFolderInputEl: uploadImportApi.uploadFolderInputEl,
    folderInputEl: uploadImportApi.folderInputEl,
    downloadCurrentFile, editorExec, moduleNameFor,
    signatureFileCount, switchToFile, openFileAt, projectFileText,
  }));
}

__initAppPeels();

if (filesBtn && workspaceEl) {
  const hideExplorerTooltipUntilLeave = wireSidebarOpenTooltip(filesBtn);
  filesBtn.addEventListener('click', () => {
    const wasOpen = workspaceEl.classList.contains('is-explorer-open');
    if (!wasOpen) hideExplorerTooltipUntilLeave();
    toggleSidePanel('explorer');
  });
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
  WorkspaceState.flushWorkspace();
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
  var projName = name;
  if (projName == null) {
    projName = await NamePrompt.open({
      ariaLabel: 'New project',
      message: 'New project',
      value: Persist.DEFAULT_PROJECT_NAME,
      selection: { start: 0, end: Persist.DEFAULT_PROJECT_NAME.length },
      normalize: NamePrompt.defaultNormalize,
      validate: function (n) { return n ? null : 'Name is required.'; },
      confirmLabel: 'Create',
    });
  }
  if (projName === null) return;
  switchProjectAndReload(() =>
    Persist.newBlankProject((projName && projName.trim()) || Persist.DEFAULT_PROJECT_NAME));
}

// Switch to another project (full reload boundary). No-op when already active.
function switchToProject(id) {
  if (id === Persist.getActiveProjectId()) return;
  switchProjectAndReload(() => Persist.setActiveProjectId(id));
}

// Delete a project and its entire silo (destructive, confirmed). Refuses the
// last project. When the active project is deleted, deleteProject hands back the
// next id to activate, so we reload into it.
async function deleteProjectInteractive(id) {
  const projects = Persist.listProjects();
  if (projects.length <= 1) return;
  const target = projects.find((p) => p.id === id);
  if (!target) return;
  if (!(await ConfirmDialog.confirm({
    subject: target.name,
    message: 'Delete this project and all of its files?',
    ariaLabel: 'Delete project',
  }))) return;
  const wasActive = id === Persist.getActiveProjectId();
  if (wasActive) {
    switchProjectAndReload(() => Persist.deleteProject(id));
    return;
  }
  Persist.deleteProject(id);
  showToast('Deleted project "' + target.name + '".');
}

// "Switch project" submenu: every project, active one checked. Null when there
// is only one project (nothing to switch between).
function buildSwitchProjectSubmenu() {
  const projects = Persist.listProjects();
  if (projects.length <= 1) return null;
  const activeId = Persist.getActiveProjectId();
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
  const projects = Persist.listProjects();
  if (projects.length <= 1) return null;
  const activeId = Persist.getActiveProjectId();
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
  const n = Persist.listFiles().length
  if (n === 0) return 'No files';
  return n === 1 ? '1 file' : n + ' files';
}

function normalizeProjectRenameName(raw) {
  if (NamePrompt.defaultNormalize) {
    return NamePrompt.defaultNormalize(raw);
  }
  return String(raw || '').trim();
}

function validateProjectRenameName(name) {
  return name ? null : 'Name is required.';
}

function applyProjectRename(name) {
  Persist.setProjectName(name);
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
  if (headerProjectRenameInput) return;
  const el = document.getElementById('header-context');
  const nameEl = document.getElementById('header-context-name');
  if (!el || !nameEl) return;

  const initial = Persist.getProjectName();
  el.classList.add('is-renaming');
  setTip(el, '');

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
    if (next === Persist.getProjectName()) {
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
  nameEl.textContent = Persist.getProjectName();
  const tip = headerContextFileHint();
  el.setAttribute('aria-label', tip);
  setTip(el, tip);
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

// Cheaply reflect the ACTIVE file's own error state on its tab, straight from
// the live status detail — NO fileHealthFor()/whole-development read. Typing the
// active file can only change the active file's own dot; every other tab/row
// reflects CHECKED results and refreshes on beljar:development-checked. The old
// code called scheduleTabLintStyles() here, which recomputed whole-development
// health (developmentMembersForFile does view.doc.toString() + reads every
// member, twice) on EVERY keystroke — ~57 ms on a late suite file, the dominant
// typing lag.
function setActiveTabErrorDot(id, hasErrors) {
  if (!editorTabsEl) return;
  const tab = editorTabsEl.querySelector('.editor-tab[data-file-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
  if (tab) tab.classList.toggle('has-errors', !!hasErrors);
}

window.addEventListener('beljar:file-lint', (ev) => {
  const id = persist ? persist.getCurrentFileId() : null;
  if (!id || !ev.detail) return;
  const file = Persist.getFileById(id)
  if (!file) return;
  if (/\.cfg$/i.test(file.name)) {
    rememberCfgLint(id, ev.detail);
    scheduleTabLintStyles();
    return;
  }
  if (ProjectSource.isSignaturePath(file.name)) {
    // Same source as explorer: observation store via belFileHealth / forFile.
    const health = belFileHealth(id);
    const errs = health.errors || 0;
    const warns = health.warnings || 0;
    setActiveTabErrorDot(id, errs > 0);
    if (getExplorerController() && typeof getExplorerController().setFileDiag === 'function') {
      getExplorerController().setFileDiag(id, errs > 0 ? 'error' : (warns > 0 ? 'warning' : null));
    }
  }
});

window.addEventListener('beljar:explorer-health-changed', () => scheduleTabLintStyles());
window.addEventListener('beljar:development-checked', () => scheduleTabLintStyles());

// Initial render.
if (activeFileId) Persist.openFile(activeFileId);
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
    if (Hint.dismiss) {
      Hint.dismiss('library');
    }
    const wasOpen = workspaceEl.classList.contains('is-library-open');
    if (!wasOpen) hideLibraryTooltipUntilLeave();
    const open = toggleSidePanel('library');
    if (open) {
      ensureLibrary();
      if (getLibraryController() && typeof getLibraryController().refresh === 'function') {
        getLibraryController().refresh();
      }
    }
  });
  if (Hint.show) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        Hint.show({
          id: 'library',
          anchor: libraryBtn,
          text: 'Check the library to view or insert Beluga examples',
        });
      });
    });
  }
}
ensureLibrary();

// ── Harpoon sidebar panel ────────────────────────────────────────────────
let harpoonPanelInited = false;
function ensureHarpoonPanel() {
  if (harpoonPanelInited || typeof HarpoonPanel === 'undefined') return;
  const bodyEl = harpoonPanelEl && harpoonPanelEl.querySelector('#harpoon-panel-body');
  if (!bodyEl) return;
  HarpoonPanel.init(bodyEl, { panelEl: harpoonPanelEl });
  harpoonPanelInited = true;
}
function refreshHarpoonPanelIfOpen() {
  if (workspaceEl && workspaceEl.classList.contains('is-harpoon-open') &&
      typeof HarpoonPanel !== 'undefined' && HarpoonPanel.refresh) {
    HarpoonPanel.refresh();
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


// ── Settings ──────────────────────────────────────────────────────────────────

const settingsBtn = document.getElementById('btn-settings');
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    SettingsUI.open();
  });
}

// ── Toolbar buttons ───────────────────────────────────────────────────────────

const reloadBtn = document.getElementById('btn-reload');
if (reloadBtn) {
  reloadBtn.addEventListener('click', () => { window.location.reload(); });
}
document.getElementById('btn-theme').addEventListener('click', toggleTheme);
document.getElementById('btn-load').addEventListener('click', (e) => {
  const file = activeFileRecord();
  if (file && /\.cfg$/i.test(file.name)) {
    BelugaRun.runModuleCfg(file.name);
    return;
  }
  // Isolated files: Run File. Suite members: click = to here, Ctrl/Cmd = whole suite.
  if (!file || !moduleNameFor(file.id)) {
    BelugaRun.runFile();
    return;
  }
  if (e.ctrlKey || e.metaKey) BelugaRun.runModule();
  else BelugaRun.runToHere();
});
document.getElementById('btn-clear').addEventListener('click', () => {
  ReplOutput.clearOutput();
  ReplCommands.resetHistoryIndex();
});
if (btnRun) {
  btnRun.addEventListener('click', () => {
    ReplCommands.runCmd();
  });
}

if (cmdInput) {
  if (typeof ReplAutocomplete !== 'undefined' && ReplAutocomplete.bind) {
    ReplAutocomplete.bind(cmdInput);
  }
  cmdInput.addEventListener('input', () => {
    ReplCommands.resetHistoryIndex();
    if (typeof ReplAutocomplete !== 'undefined' && ReplAutocomplete.refresh) {
      ReplAutocomplete.refresh();
    }
  });
  cmdInput.addEventListener('keydown', (e) => {
    if (typeof ReplAutocomplete !== 'undefined' && ReplAutocomplete.onKeyDown) {
      if (ReplAutocomplete.onKeyDown(e)) {
        e.preventDefault();
        return;
      }
    }
    if (e.key === 'Enter') {
      if (typeof ReplAutocomplete !== 'undefined' && ReplAutocomplete.hide) {
        ReplAutocomplete.hide();
      }
      ReplCommands.runCmd();
      return;
    }
    if (e.key === 'ArrowUp') {
      if (ReplCommands.historyUp()) e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      if (ReplCommands.historyDown()) e.preventDefault();
    }
  });
  cmdInput.addEventListener('blur', () => {
    // Delay so mousedown on a suggestion can accept first.
    setTimeout(() => {
      if (typeof ReplAutocomplete !== 'undefined' && ReplAutocomplete.hide) {
        ReplAutocomplete.hide();
      }
    }, 120);
  });
}
window.addEventListener('beforeunload', () => {
  if (typeof ReplPersist !== 'undefined' && ReplPersist.saveNow) {
    ReplPersist.saveNow();
  }
  if (persist && !suppressUnloadFlush) persist.flushCheckpoint();
  WorkspaceState.flushWorkspace();
});
window.addEventListener('pagehide', () => {
  if (typeof ReplPersist !== 'undefined' && ReplPersist.saveNow) {
    ReplPersist.saveNow();
  }
  if (persist && !suppressUnloadFlush) persist.flushCheckpoint();
  WorkspaceState.flushWorkspace();
});

{
  RunProgress.bind({
    header: document.getElementById('output-panel-header'),
    fill: document.getElementById('output-header-progress'),
    status: document.getElementById('output-header-status'),
    output: document.getElementById('output'),
  });
}
