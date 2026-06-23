const editorMount = document.getElementById('editor');
const editorEmptyEl = document.getElementById('editor-empty');
const cmdInput = document.getElementById('command-input');

// ── Project init ──────────────────────────────────────────────────────────────

if (typeof BelJarPersist !== 'undefined') {
  BelJarPersist.ensureProject();
  ensureProjectActiveCfgs();
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
  return BelJarEditor.mount(editorMount, {
    doc: snapshot ? snapshot.editor.text : (persist ? persist.getEditorText() : ''),
    initialLocal,
    semanticCheckpoint: snapshot ? snapshot.semantic : null,
    documentId: snapshot ? snapshot.meta.documentId : undefined,
    jumpAt: openOpts && openOpts.jumpAt,
    persist,
    onDocChange: function (text) {
      if (persist) persist.scheduleEditorPersist(text);
    },
  });
}

let editor = activeFileId ? mountEditorFor(initialCheckpoint) : null;

window.BelJarCurrentEditor = editor;

function projectIsEmpty() {
  return typeof BelJarPersist !== 'undefined' && BelJarPersist.listFiles().length === 0;
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
  if (editor && typeof editor.destroy === 'function') editor.destroy();
  editor = null;
  window.BelJarCurrentEditor = null;
  if (projectIsEmpty()) persist = null;
  if (typeof FloatingWindow !== 'undefined' && FloatingWindow.closeAll) FloatingWindow.closeAll();
  if (typeof BelugaClient !== 'undefined' && BelugaClient.noteEditorChange) {
    BelugaClient.noteEditorChange('');
  }
  updateEditorEmptyState();
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
const workspaceEl = document.querySelector('.workspace');
const explorerPanelEl = document.getElementById('explorer-panel');
const inspectorPanelEl = document.getElementById('inspector-panel');
const libraryPanelEl = document.getElementById('library-panel');

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
const fileTabLint = new Map();

function liveFileLint() {
  const ed = window.BelJarCurrentEditor;
  if (!ed || typeof ed.getIdeStatus !== 'function') return null;
  const st = ed.getIdeStatus();
  return { errors: st.errors, warnings: st.warnings };
}

function fileTabHasErrors(fileId, activeId) {
  const lint = fileId === activeId
    ? liveFileLint()
    : fileTabLint.get(fileId);
  return !!(lint && lint.errors > 0);
}

function rememberFileLint(fileId, lint) {
  if (!fileId || !lint) return;
  fileTabLint.set(fileId, { errors: lint.errors || 0, warnings: lint.warnings || 0 });
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
  const getText = (id) => BelJarPersist.getFileText(id);
  BelJarPersist.backfillActiveCfgByDir(BelJarProjectSource.inferActiveCfgByDir(files, getText));
}

function ensureActiveCfgForDir(dir) {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return;
  if (BelJarPersist.getActiveCfgForDir(dir)) return;
  if (typeof BelJarProjectSource.inferActiveCfgForDir !== 'function') return;
  const files = BelJarPersist.listFiles();
  const path = BelJarProjectSource.inferActiveCfgForDir(files, (id) => BelJarPersist.getFileText(id), dir);
  if (path) BelJarPersist.setActiveCfgForDir(dir, path);
}

function activeCfgForDir(dir) {
  if (typeof BelJarPersist === 'undefined') return null;
  const path = BelJarPersist.getActiveCfgForDir(dir);
  if (!path) return null;
  return BelJarPersist.listFiles().some((f) => f.name === path) ? path : null;
}

// Ordered member file names of a folder's active suite (.cfg), or null when the
// folder has no active suite. Suite members are listed in load order with a
// position badge; filenames stay aligned with siblings in the same folder.
function suiteOrderForDir(dir) {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return null;
  const cfg = activeCfgForDir(dir);
  if (!cfg) return null;
  const files = BelJarPersist.listFiles();
  const getText = (id) => BelJarPersist.getFileText(id);
  return BelJarProjectSource.developmentFilesForCfg(files, cfg, getText).map((f) => f.name);
}

function makeActiveCfgForFile(fileName) {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return;
  const dir = BelJarProjectSource.dirOf(fileName);
  if (BelJarPersist.getActiveCfgForDir(dir) === fileName) return;
  BelJarPersist.setActiveCfgForDir(dir, fileName);
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
  const getText = (id) => BelJarPersist.getFileText(id);
  const id = fileId || BelJarPersist.getActiveFileId();
  const dev = BelJarProjectSource.developmentForFile(files, id, getText);
  if (dev.kind !== 'module' || !dev.cfg) return null;
  return dev.cfg.slice(dev.cfg.lastIndexOf('/') + 1).replace(/\.cfg$/i, '');
}

// Suite name for the header title — only when the active file is listed in its
// folder's active cfg, or when the active file is that cfg itself.
function headerSuiteName(fileId) {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return null;
  const id = fileId || BelJarPersist.getActiveFileId();
  const file = BelJarPersist.getFileById(id);
  if (!file) return null;
  const dir = BelJarProjectSource.dirOf(file.name);
  const activeCfg = BelJarPersist.getActiveCfgForDir(dir);
  if (!activeCfg) return null;
  const cfgBase = activeCfg.slice(activeCfg.lastIndexOf('/') + 1).replace(/\.cfg$/i, '');
  if (file.name === activeCfg) return cfgBase;
  const { member } = activeSuiteMembership(file.name);
  return member ? cfgBase : null;
}

// The active suite (.cfg) for a file's folder, whether the file is listed in it,
// and its load-order index — drives the "Add to / Remove from / Move in suite"
// context-menu actions.
function activeSuiteMembership(fileName) {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') {
    return { cfg: null, member: false, index: -1, count: 0 };
  }
  const dir = BelJarProjectSource.dirOf(fileName);
  const cfg = BelJarPersist.getActiveCfgForDir(dir);
  if (!cfg) return { cfg: null, member: false, index: -1, count: 0 };
  const files = BelJarPersist.listFiles();
  const getText = (id) => BelJarPersist.getFileText(id);
  const paths = BelJarProjectSource.developmentFilesForCfg(files, cfg, getText).map((f) => f.name);
  const index = paths.indexOf(fileName);
  return { cfg, member: index !== -1, index, count: paths.length };
}

// Does a .cfg list an entry that doesn't resolve to a project file (or a junk
// line)? Cheap and project-wide — no Beluga — so the explorer can badge a broken
// suite definition without opening it. Mirrors editor-src/bel-cfg-lint.mjs.
function cfgHasDanglingEntry(cfgName) {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return false;
  const files = BelJarPersist.listFiles();
  const cfgFile = files.find((f) => f.name === cfgName);
  if (!cfgFile) return false;
  const names = new Set(files.map((f) => f.name));
  const dir = BelJarProjectSource.dirOf(cfgName);
  for (const entry of BelJarProjectSource.parseCfg(BelJarPersist.getFileText(cfgFile.id))) {
    const low = entry.toLowerCase();
    if (!(low.endsWith('.bel') || low.endsWith('.elf') || low.endsWith('.cfg'))) return true;
    if (!names.has(dir ? dir + '/' + entry : entry)) return true;
  }
  return false;
}

// Explorer error indicator for a row: a .cfg with lint problems (dangling entries
// or suite-composition warnings once checked), or a .bel/.elf whose last check
// reported errors (known only for files that have been checked).
function explorerFileDiag(fileId, fileName) {
  const low = String(fileName || '').toLowerCase();
  if (low.endsWith('.cfg')) {
    if (cfgHasDanglingEntry(fileName)) return 'error';
    const activeId = persist ? persist.getCurrentFileId() : BelJarPersist.getActiveFileId();
    const lint = fileId === activeId ? liveFileLint() : fileTabLint.get(fileId);
    if (lint && lint.errors > 0) return 'error';
    if (lint && lint.warnings > 0) return 'warning';
    return null;
  }
  if (low.endsWith('.bel') || low.endsWith('.elf')) {
    const activeId = persist ? persist.getCurrentFileId() : BelJarPersist.getActiveFileId();
    return fileTabHasErrors(fileId, activeId) ? 'error' : null;
  }
  return null;
}

// Refresh everything that depends on suite membership after a cfg-body edit:
// the active file may have gained/lost a prelude, so re-module it.
function afterSuiteEdit(dir) {
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
    if (result.fullPath !== file.name) BelJarPersist.renameFile(session.fileId, result.fullPath);
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
    getSuiteOrderForDir: suiteOrderForDir,
    getFileDiag: explorerFileDiag,
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
      return BelJarNameConflicts.canDropMove(payload, target, BelJarPersist.listFiles());
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
    getFileText: (id) => BelJarPersist.getFileText(id),
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
        getActiveCfgForDir: activeCfgForDir,
      })
      : []),
    getActiveFileId: () => (persist ? persist.getCurrentFileId() : BelJarPersist.getActiveFileId()),
    getEditor: () => editor,
    applyTip: (el, tip) => setBelJarTip(el, tip, { ariaLabel: false }),
    showToast,
    afterSuiteEdit,
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

function refreshInspector(detail) {
  requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('beljar:inspector-refresh', { detail: detail || {} })));
}

function notifyActiveEditorView() {
  if (!editor || typeof editor.getView !== 'function') return;
  const view = editor.getView();
  if (!view?.dom?.isConnected) return;
  window.dispatchEvent(new CustomEvent('beljar:active-editor-view', { detail: { view } }));
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
    renderTabs();
    if (peekAt && editor && typeof editor.peekRange === 'function') editor.peekRange(peekAt);
    else if (jumpAt) applyEditorJump(jumpAt);
    else if (initialLocal != null && editor && typeof editor.applyViewport === 'function') {
      editor.applyViewport(initialLocal);
    } else if (shouldClearSelection && explorerController && explorerController.clearSelection) {
      explorerController.clearSelection();
    }
    return;
  }
  if (typeof BelJarPersist !== 'undefined' && typeof BelJarProjectSource !== 'undefined') {
    const file = BelJarPersist.getFileById(id);
    if (file) ensureActiveCfgForDir(BelJarProjectSource.dirOf(file.name));
  }
  const leavingId = persist.getCurrentFileId();
  const snap = liveFileLint();
  if (snap) rememberFileLint(leavingId, snap);
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
  renderExplorerTree();
  updateHeaderContext();
  updateRunButtonTooltip();
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
      title: 'New file',
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

function deleteFilesInteractive(ids) {
  if (typeof BelJarPersist === 'undefined') return;
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return;
  const files = BelJarPersist.listFiles();
  const names = unique.map((id) => BelJarPersist.getFileById(id)).filter(Boolean).map((f) => f.name);
  if (!names.length) return;
  const deletingAll = unique.length >= files.length;
  const prompt = unique.length === 1
    ? `Delete "${names[0]}" from the project? This cannot be undone.`
    : deletingAll
      ? `Delete all ${unique.length} files from the project? This cannot be undone.`
      : `Delete ${unique.length} files from the project? This cannot be undone.`;
  if (!window.confirm(prompt)) return;
  if (persist && unique.includes(persist.getCurrentFileId())) {
    const fallback = BelJarPersist.getOpenFileIds().find((x) => !unique.includes(x))
      || (files.find((f) => !unique.includes(f.id)) || {}).id;
    if (fallback) switchToFile(fallback);
  }
  for (const id of unique) {
    BelJarPersist.deleteFile(id);
    fileTabLint.delete(id);
  }
  if (explorerController && explorerController.clearSelection) explorerController.clearSelection();
  if (projectIsEmpty()) {
    enterEmptyProjectView();
    return;
  }
  renderTabs();
  renderExplorerTree();
  updateHeaderContext();
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

function deleteFolderInteractive(folderPath) {
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
  const msg = under.length
    ? deletingAll
      ? `Delete folder "${label}" and all ${under.length} file${under.length === 1 ? '' : 's'} in the project? This cannot be undone.`
      : `Delete folder "${label}" and ${under.length} file${under.length === 1 ? '' : 's'} inside? This cannot be undone.`
    : `Delete empty folder "${label}"?`;
  if (!window.confirm(msg)) return;

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
      title: 'New project',
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
function deleteProjectInteractive(id) {
  if (typeof BelJarPersist === 'undefined') return;
  const projects = BelJarPersist.listProjects();
  if (projects.length <= 1) return;
  const target = projects.find((p) => p.id === id);
  if (!target) return;
  if (!window.confirm('Delete project "' + target.name + '" and all its files? This cannot be undone.')) return;
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

function updateHeaderContext() {
  const el = document.getElementById('header-context');
  const nameEl = document.getElementById('header-context-name');
  if (!el || !nameEl) return;
  const projectName = typeof BelJarPersist !== 'undefined'
    ? BelJarPersist.getProjectName()
    : 'Untitled Project';
  const suite = headerSuiteName();
  nameEl.textContent = suite ? `${projectName} > ${suite}` : projectName;
  const tip = headerContextFileHint();
  el.setAttribute('aria-label', tip);
  setBelJarTip(el, tip);
}

window.addEventListener('beljar:file-lint', (ev) => {
  const id = persist ? persist.getCurrentFileId() : null;
  if (!id || !ev.detail) return;
  rememberFileLint(id, ev.detail);
  updateTabLintStyles();
});

// Initial render.
if (typeof BelJarPersist !== 'undefined' && activeFileId) BelJarPersist.openFile(activeFileId);
renderTabs();
renderExplorerTree();
updateHeaderContext();
updateEditorEmptyState();

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
    const low = String(entry.name || '').toLowerCase();
    if (low.endsWith('.bel')) belEntries.push(entry);
    else if (low.endsWith('.elf')) elfEntries.push(entry);
    else if (low.endsWith('.cfg')) cfgEntries.push(entry);
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
    if (!low.endsWith('.bel') && !low.endsWith('.elf') && !low.endsWith('.cfg')) continue;
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
      title: 'Export as new project',
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
    const orderedBel = projectEntries.filter((e) => e.name.toLowerCase().endsWith('.bel')).map((e) => e.name);
    activePath = orderedBel[0]
      || projectEntries.find((e) => /\.(?:bel|elf)$/i.test(e.name))?.name
      || projectEntries.find((e) => /\.cfg$/i.test(e.name))?.name
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
    fileTabLint.delete(id);
  }
  if (projectIsEmpty()) enterEmptyProjectView();
}

function executeUploadPlan(plan, options) {
  if (!plan || typeof BelJarPersist === 'undefined') return { added: 0, replaced: 0 };
  options = options || {};
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
    BelJarPersist.setFileText(item.id, item.text);
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
  const text = BelJarPersist.getFileText(id);
  if (text == null) return;
  if (editor.getValue() !== text) {
    editor.setValue(text);
    persist.scheduleEditorPersist(text);
  }
  if (file && /\.cfg$/i.test(file.name) && typeof editor.refreshLint === 'function') {
    editor.refreshLint();
  }
}

function applyMovePlan(plan) {
  if (!plan || typeof BelJarPersist === 'undefined' || !persist) return;
  // Collect from→to for every rename for empty-folder bookkeeping. Cfg bodies
  // are deliberately NOT rewritten — a now-dangling entry is surfaced by the
  // cfg lint, not silently edited.
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
    BelJarPersist.setFileText(rep.targetId, rep.text);
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
  const getText = (id) => BelJarPersist.getFileText(id);
  const moves = BelJarNameConflicts.computeMoveTargets(existing, payload, dropTarget, getText);
  if (!moves.length) return;

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
    .filter((e) => e.name.toLowerCase().endsWith('.bel'))
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
  return files.filter((f) => /\.(?:bel|elf)$/i.test(String(f.name || ''))).length;
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
          title: 'Rename project',
          value: cur,
          normalize: BelJarNamePrompt.defaultNormalize,
          validate: function (n) { return n ? null : 'Name is required.'; },
          confirmLabel: 'Save',
        });
        if (!next) return;
        BelJarPersist.setProjectName(next);
        updateHeaderContext();
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
    if (BelJarPersist.getActiveCfgForDir(BelJarProjectSource.dirOf(file.name)) !== file.name) {
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
  } else if (Run && (low.endsWith('.bel') || low.endsWith('.elf'))) {
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
    if (cfg) {
      const dir = BelJarProjectSource.dirOf(file.name);
      if (member) {
        if (index > 0) {
          runItems.push({ label: 'Move up in suite', onSelect: () => { BelJarPersist.moveEntryInCfg(cfg, file.name, -1); afterSuiteEdit(dir); } });
        }
        if (index < count - 1) {
          runItems.push({ label: 'Move down in suite', onSelect: () => { BelJarPersist.moveEntryInCfg(cfg, file.name, 1); afterSuiteEdit(dir); } });
        }
        runItems.push({ label: 'Remove from suite', onSelect: () => { BelJarPersist.removeEntryFromCfg(cfg, file.name); afterSuiteEdit(dir); } });
      } else {
        runItems.push({ label: 'Add to active suite', onSelect: () => { BelJarPersist.addEntryToCfg(cfg, file.name); afterSuiteEdit(dir); } });
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
    (f) => dirOf(f.name) === folderPath && /\.(?:bel|elf)$/i.test(String(f.name)),
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
      text: f.id === activeId && editor ? editor.getValue() : BelJarPersist.getFileText(f.id),
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

window.addEventListener('beforeunload', () => { if (persist && !suppressUnloadFlush) persist.flushCheckpoint(); });
window.addEventListener('pagehide', () => { if (persist && !suppressUnloadFlush) persist.flushCheckpoint(); });

if (typeof RunProgress !== 'undefined') {
  RunProgress.bind({
    header: document.getElementById('output-panel-header'),
    fill: document.getElementById('output-header-progress'),
    status: document.getElementById('output-header-status'),
    output: document.getElementById('output'),
  });
}
