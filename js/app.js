const editorMount = document.getElementById('editor');
const cmdInput = document.getElementById('command-input');

// ── Project init ──────────────────────────────────────────────────────────────

if (typeof BelJarPersist !== 'undefined') BelJarPersist.ensureProject();

const activeFileId =
  typeof BelJarPersist !== 'undefined' ? BelJarPersist.getActiveFileId() : null;

const persist =
  typeof BelJarPersist !== 'undefined'
    ? BelJarPersist.createPersist({ documentId: activeFileId || undefined })
    : null;

const initialCheckpoint = persist ? persist.getInitialCheckpoint() : null;

// Mount an editor for a persisted snapshot. Used at startup and on every file
// switch — each document gets a fresh editor + semantic engine so symbol
// identity, checkpoints, and providers are always keyed to the right file.
function mountEditorFor(snapshot) {
  if (typeof BelJarEditor === 'undefined' || !BelJarEditor.mount) return null;
  return BelJarEditor.mount(editorMount, {
    doc: snapshot ? snapshot.editor.text : (persist ? persist.getEditorText() : ''),
    initialLocal: snapshot ? snapshot.editor.local : null,
    semanticCheckpoint: snapshot ? snapshot.semantic : null,
    documentId: snapshot ? snapshot.meta.documentId : undefined,
    persist,
    onDocChange: function (text) {
      if (persist) persist.scheduleEditorPersist(text);
    },
  });
}

let editor = mountEditorFor(initialCheckpoint);

window.BelJarCurrentEditor = editor;

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

if (!editor) {
  if (typeof BelJarToasts !== 'undefined') {
    BelJarToasts.error('CodeMirror editor bundle failed to load.', { duration: 0, closable: true });
  }
}

function setBelJarTip(el, text, opts) {
  if (!el || typeof Tooltips === 'undefined' || !Tooltips.set) return;
  Tooltips.set(el, text, opts);
}

// Extra tooltip for a row that already shows a name — never repeat the label.
function nameRowExtraTip(visibleName, fullName, kind) {
  if (kind === 'elf') return 'LF prelude';
  if (fullName && visibleName && fullName !== visibleName) return fullName;
  return '';
}

const TEMPLATES = {
  nd: `LF o : type =
  | ⊃ : o → o → o
  | ⊤ : o
  | ∧ : o → o → o
  | ∨ : o → o → o
  | ¬ : o → o
;

--prefix ¬ 10.
--infix ∧ 5 right.
--infix ∨ 4 right.
--infix ⊃ 3 right.

LF nd : o → type =
  | ⊃I : (nd A → nd B) → nd (A ⊃ B)
  | ⊃E : nd (A ⊃ B) → nd A → nd B
  | ¬I : ({p:o} nd A → nd p) → nd (¬ A)
  | ¬E : nd (¬ A) → nd A → nd C
  | ∧I : nd A → nd B → nd (A ∧ B)
  | ∧El : nd (A ∧ B) → nd A
  | ∧Er : nd (A ∧ B) → nd B
  | ∨Il : nd A → nd (A ∨ B)
  | ∨Ir : nd B → nd (A ∨ B)
  | ∨E : nd (A ∨ B) → (nd A → nd C) → (nd B → nd C) → nd C
  | ⊤I : nd ⊤
;`,
};

function insertNd(where) {
  const code = TEMPLATES.nd;
  if (!code || !editor) return;
  if (where === 'top') editor.insertTop(code);
  else editor.insertBottom(code);
}

function insertNdAtSelection() {
  const code = TEMPLATES.nd;
  if (!code || !editor || typeof editor.insertAtSelection !== 'function') return;
  editor.insertAtSelection(code);
}

async function copyNd() {
  try {
    await navigator.clipboard.writeText(TEMPLATES.nd);
  } catch {
    showToast('Could not copy to clipboard.', { kind: 'warn' });
  }
  if (editor) editor.focus();
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
const workspaceEl = document.querySelector('.workspace');
const explorerPanelEl = document.getElementById('explorer-panel');
const inspectorPanelEl = document.getElementById('inspector-panel');

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

function resolvedDefaultCfgPath() {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return null;
  const files = BelJarPersist.listFiles();
  const getText = (id) => BelJarPersist.getFileText(id);
  const stored = BelJarPersist.getDefaultCfgPath();
  if (stored && files.some((f) => f.name === stored)) return stored;
  return BelJarProjectSource.inferDefaultCfgPath(files, getText);
}

function updateRunButtonTooltip() {
  const btn = document.getElementById('btn-load');
  if (!btn) return;
  let tip = 'Run';
  if (developmentFileCount() > 1) tip += '\nCtrl+click to run project';
  setBelJarTip(btn, tip);
}

function ensureExplorer() {
  if (explorerController || typeof BelJarExplorer === 'undefined') return;
  const treeEl = explorerPanelEl && explorerPanelEl.querySelector('.explorer-tree');
  if (!treeEl || typeof BelJarPersist === 'undefined') return;
  explorerController = BelJarExplorer.init({
    container: treeEl,
    listFiles: () => BelJarPersist.listFiles(),
    getActiveId: () => (persist ? persist.getCurrentFileId() : BelJarPersist.getActiveFileId()),
    getDefaultCfgPath: resolvedDefaultCfgPath,
    getProjectName: () => BelJarPersist.getProjectName(),
    getRowTip: nameRowExtraTip,
    applyTip: (el, tip) => setBelJarTip(el, tip, { ariaLabel: false }),
    getFileContextItems: (fileId) => fileContextItems(fileId),
    onOpenFile: (id) => switchToFile(id),
    onRefresh: updateRunButtonTooltip,
    canDrop: (payload, target) => {
      if (typeof BelJarNameConflicts === 'undefined') return false;
      return BelJarNameConflicts.canDropMove(payload, target, BelJarPersist.listFiles());
    },
    onDrop: (payload, target) => { resolveAndApplyMove(payload, target); },
  });
}

function renderExplorerTree() {
  ensureExplorer();
  if (explorerController) explorerController.refresh();
  else updateRunButtonTooltip();
}

function switchToFile(id) {
  if (!persist || !editor) return;
  if (typeof BelJarPersist !== 'undefined') BelJarPersist.openFile(id);
  if (id === persist.getCurrentFileId()) {
    renderTabs();
    return;
  }
  const leavingId = persist.getCurrentFileId();
  const snap = liveFileLint();
  if (snap) rememberFileLint(leavingId, snap);
  // Order matters: switchFile flushes the OLD file while its engine/providers
  // are still alive, then loads the new state and drops the stale providers.
  const snapshot = persist.switchFile(id);
  BelJarPersist.setActiveFileId(id);
  // Pinned inspector/graph windows reference the old editor view.
  if (typeof FloatingWindow !== 'undefined' && FloatingWindow.closeAll) FloatingWindow.closeAll();
  editor.destroy();
  editor = mountEditorFor(snapshot);
  window.BelJarCurrentEditor = editor;
  syncEditorCmTheme();
  if (typeof BelugaClient !== 'undefined' && BelugaClient.noteEditorChange) {
    BelugaClient.noteEditorChange(editor ? editor.getValue() : '');
  }
  if (editor) editor.focus();
  renderTabs();
  renderExplorerTree();
  updateHeaderContext();
}

// Open a file (switching if needed) and jump to a position in it — the target
// of cross-file go-to-definition, palette symbols, and project search.
function openFileAt(fileId, from, to) {
  if (typeof BelJarPersist === 'undefined') return;
  if (persist && persist.getCurrentFileId() !== fileId) switchToFile(fileId);
  if (editor && typeof editor.jumpToRange === 'function' && from != null) {
    editor.jumpToRange({ from, to: to != null ? to : from });
  }
}

// Fired by the editor layer (bel-ide-actions) when go-to-definition resolves
// into ANOTHER project file.
window.addEventListener('beljar:open-file-at', (ev) => {
  const d = ev.detail || {};
  if (d.fileId) openFileAt(d.fileId, d.from, d.to);
});

function newFile(name) {
  if (typeof BelJarPersist === 'undefined') return;
  var baseName = name || promptFileName('untitled.bel');
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
  if (openIds.length <= 1) return; // keep at least one tab alive
  if (persist && persist.getCurrentFileId() === id) {
    const idx = openIds.indexOf(id);
    const neighborId = openIds[idx - 1] || openIds[idx + 1];
    if (!neighborId) return;
    switchToFile(neighborId);
  }
  BelJarPersist.closeOpenFile(id);
  renderTabs();
}

// Remove the file from the project entirely (destructive, confirmed).
function deleteFileInteractive(id) {
  if (typeof BelJarPersist === 'undefined') return;
  const file = BelJarPersist.getFileById(id);
  if (!file) return;
  const files = BelJarPersist.listFiles();
  if (files.length <= 1) {
    // Can't delete the last file — clear it instead.
    if (editor) editor.setValue('');
    return;
  }
  if (!window.confirm('Delete "' + file.name + '" from the project? This cannot be undone.')) return;
  // If deleting the active file, switch AWAY first (the remount path), THEN
  // delete — otherwise switchFile's flush would resurrect the deleted state.
  if (persist && persist.getCurrentFileId() === id) {
    const fallback = BelJarPersist.getOpenFileIds().find((x) => x !== id)
      || (files.find((f) => f.id !== id) || {}).id;
    if (fallback) switchToFile(fallback);
  }
  BelJarPersist.deleteFile(id);
  fileTabLint.delete(id);
  renderTabs();
  renderExplorerTree();
  updateHeaderContext();
}

function promptFileName(defaultName) {
  var name = window.prompt('File name:', defaultName || 'untitled.bel');
  if (!name) return null;
  name = name.trim();
  if (!name) return null;
  if (!name.endsWith('.bel')) name += '.bel';
  return name;
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

function newProject(name) {
  if (typeof BelJarPersist === 'undefined') return;
  const projName = name != null ? name : window.prompt('New project name:', 'Untitled');
  if (projName === null) return; // cancelled
  switchProjectAndReload(() =>
    BelJarPersist.newBlankProject((projName && projName.trim()) || 'Untitled'));
}

// ── Header project title ──────────────────────────────────────────────────────

function headerContextFileHint() {
  const n = typeof BelJarPersist !== 'undefined' ? BelJarPersist.listFiles().length : 1;
  return n === 1 ? '1 file' : n + ' files';
}

function updateHeaderContext() {
  const el = document.getElementById('header-context');
  const nameEl = document.getElementById('header-context-name');
  if (!el || !nameEl) return;
  const projectName = typeof BelJarPersist !== 'undefined'
    ? BelJarPersist.getProjectName()
    : 'Untitled';
  nameEl.textContent = projectName;
  el.setAttribute('aria-label', projectName);
  setBelJarTip(el, headerContextFileHint());
}

window.addEventListener('beljar:file-lint', (ev) => {
  const id = persist ? persist.getCurrentFileId() : null;
  if (!id || !ev.detail) return;
  rememberFileLint(id, ev.detail);
  updateTabLintStyles();
});

// Initial render. The active file always has a tab.
if (typeof BelJarPersist !== 'undefined' && activeFileId) BelJarPersist.openFile(activeFileId);
renderTabs();
renderExplorerTree();
updateHeaderContext();

function openInspector() {
  if (!workspaceEl) return;
  if (!workspaceEl.classList.contains('is-inspector-open')) {
    closeOtherSidePanels('inspector');
    setSidePanelOpen('inspector', true);
    notifySidePanelLayout();
  }
  requestAnimationFrame(() => window.dispatchEvent(new Event('beljar:inspector-refresh')));
}
if (inspectorBtn && workspaceEl) {
  const hideInspectorTooltipUntilLeave = wireSidebarOpenTooltip(inspectorBtn);
  inspectorBtn.addEventListener('click', () => {
    const wasOpen = workspaceEl.classList.contains('is-inspector-open');
    if (!wasOpen) hideInspectorTooltipUntilLeave();
    const open = toggleSidePanel('inspector');
    if (open) requestAnimationFrame(() => window.dispatchEvent(new Event('beljar:inspector-refresh')));
  });
  window.addEventListener('beljar:open-inspector', openInspector);
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
});

function relPathFromPickerFile(file) {
  const rel = file.webkitRelativePath || file.name;
  const parts = rel.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : rel;
}

async function projectEntriesFromPickerFiles(all) {
  const belEntries = [];
  const elfEntries = [];
  const cfgEntries = [];
  for (const file of all) {
    const low = file.name.toLowerCase();
    const name = relPathFromPickerFile(file);
    const text = await file.text();
    if (low.endsWith('.bel')) belEntries.push({ name, text });
    else if (low.endsWith('.elf')) elfEntries.push({ name, text });
    else if (low.endsWith('.cfg')) cfgEntries.push({ name, text });
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
  return { projectEntries, belCount: belPaths.length };
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
}

function executeUploadPlan(plan, options) {
  if (!plan || typeof BelJarPersist === 'undefined' || !persist) return { added: 0, replaced: 0 };
  options = options || {};
  let added = 0;
  let replaced = 0;
  let lastCreatedId = null;

  for (const folder of plan.replaceFolder || []) {
    deleteProjectFilesById(folder.deleteIds || []);
    for (const entry of folder.entries || []) {
      const id = BelJarPersist.createFile(entry.name);
      BelJarPersist.setFileText(id, entry.text);
      added += 1;
      lastCreatedId = id;
      if (options.openTabs) BelJarPersist.openFile(id);
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

  if (options.openTabs && lastCreatedId) switchToFile(lastCreatedId);
  renderTabs();
  renderExplorerTree();
  updateHeaderContext();
  return { added, replaced };
}

async function resolveAndApplyUpload(entries, options) {
  if (typeof BelJarPersist === 'undefined' || !persist || !entries.length) return null;
  const existing = BelJarPersist.listFiles();
  if (typeof BelJarNameConflicts === 'undefined' || typeof BelJarConflictDialog === 'undefined') {
    return executeUploadPlan({
      create: entries.map((e) => ({ name: e.name, text: e.text })),
      replace: [],
      replaceFolder: [],
    }, options);
  }

  const conflicts = BelJarNameConflicts.detectUploadConflicts(existing, entries);
  let resolutions = [];
  if (conflicts.length) {
    resolutions = await BelJarConflictDialog.resolveConflicts(conflicts);
    if (resolutions === null) return null;
  }
  const plan = BelJarNameConflicts.applyResolutions(existing, entries, conflicts, resolutions);
  if (!plan) return null;
  return executeUploadPlan(plan, options);
}

function applyMovePlan(plan) {
  if (!plan || typeof BelJarPersist === 'undefined' || !persist) return;
  for (const folder of plan.replaceFolder || []) {
    deleteProjectFilesById(folder.deleteIds || []);
    for (const r of folder.renames || []) {
      BelJarPersist.renameFile(r.id, r.to);
    }
  }
  for (const rep of plan.replaces || []) {
    BelJarPersist.setFileText(rep.targetId, rep.text);
    deleteProjectFilesById([rep.deleteId]);
  }
  for (const r of plan.renames || []) {
    BelJarPersist.renameFile(r.id, r.to);
  }
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
    const conflicts = BelJarNameConflicts.detectMoveConflicts(existing, moves);
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
// tree to the current project, keeping paths (minus the selected root).
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
  const result = await resolveAndApplyUpload(projectEntries, { openTabs: false });
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

// Hidden directory input for "Import folder as new project" — replaces the
// project with every .bel/.elf/.cfg in the tree.
const folderInputEl = document.createElement('input');
folderInputEl.type = 'file';
folderInputEl.webkitdirectory = true;
folderInputEl.style.display = 'none';
document.body.appendChild(folderInputEl);

folderInputEl.addEventListener('change', async () => {
  const all = Array.from(folderInputEl.files || []);
  folderInputEl.value = '';
  if (typeof BelJarPersist === 'undefined' || !persist) return;
  const { projectEntries, belCount } = await projectEntriesFromPickerFiles(all);
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
  const defaultCfgPath = typeof BelJarProjectSource.inferDefaultCfgPath === 'function'
    ? BelJarProjectSource.inferDefaultCfgPath(
      projectEntries.map((e, i) => ({ id: 'tmp-' + i, name: e.name })),
      (id) => projectEntries[Number(id.slice(4))]?.text ?? '',
    )
    : null;
  // Imports into a fresh PROJECT silo — the current project is untouched, and
  // the reload boots into the new (now active) project.
  switchProjectAndReload(() => {
    BelJarPersist.createProjectWithFiles(rootName, projectEntries, {
      projectName: rootName,
      defaultCfgPath: defaultCfgPath || undefined,
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

function developmentFileCount() {
  if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return 0;
  const files = BelJarPersist.listFiles();
  const getText = (id) => BelJarPersist.getFileText(id);
  const cfgPath = resolvedDefaultCfgPath();
  if (!cfgPath) return 0;
  const dev = BelJarProjectSource.developmentFilesForCfg(files, cfgPath, getText);
  return dev ? dev.length : 0;
}

function buildProjectMenuItems() {
  const files = typeof BelJarPersist !== 'undefined' ? BelJarPersist.listFiles() : [];
  const currentId = persist ? persist.getCurrentFileId() : null;
  const currentFile = currentId ? BelJarPersist.getFileById(currentId) : null;

  return [
    {
      label: 'New project',
      onSelect: () => newProject(),
    },
    {
      label: 'Rename project…',
      onSelect: () => {
        if (typeof BelJarPersist === 'undefined') return;
        const cur = BelJarPersist.getProjectName();
        const next = window.prompt('Project name:', cur);
        if (!next || !next.trim()) return;
        BelJarPersist.setProjectName(next.trim());
        updateHeaderContext();
      },
    },
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
      disabled: !currentFile || files.length <= 1,
      onSelect: () => { if (currentId) deleteFileInteractive(currentId); },
    },
    { type: 'separator' },
    {
      label: 'Run whole project',
      disabled: developmentFileCount() <= 1,
      onSelect: () => {
        if (typeof BelJarBelugaRun !== 'undefined' && BelJarBelugaRun.loadProject) {
          BelJarBelugaRun.loadProject();
        }
      },
    },
  ];
}

function renameFileInteractive(id) {
  if (typeof BelJarPersist === 'undefined') return;
  const file = BelJarPersist.getFileById(id);
  if (!file) return;
  const newName = window.prompt('Rename file:', file.name);
  if (!newName || !newName.trim()) return;
  const trimmed = newName.trim();
  if (typeof BelJarNameConflicts !== 'undefined'
    && BelJarNameConflicts.nameConflict(BelJarPersist.listFiles(), trimmed, id)) {
    showToast('A file with that name already exists in this folder.', { kind: 'warn' });
    return;
  }
  BelJarPersist.renameFile(id, trimmed);
  renderTabs();
  renderExplorerTree();
}

// ── File context menu (tabs + explorer rows) ──────────────────────────────────

function fileContextItems(fileId) {
  if (typeof BelJarPersist === 'undefined') return [];
  const files = BelJarPersist.listFiles();
  const file = files.find((f) => f.id === fileId);
  if (!file) return [];
  const refresh = () => { renderTabs(); renderExplorerTree(); };
  const items = [
    { label: 'Rename…', onSelect: () => renameFileInteractive(fileId) },
    { type: 'separator' },
    {
      label: 'Close tab',
      disabled: BelJarPersist.getOpenFileIds().indexOf(fileId) === -1
        || BelJarPersist.getOpenFileIds().length <= 1,
      onSelect: () => closeFile(fileId),
    },
    {
      label: 'Delete file…',
      disabled: files.length <= 1,
      onSelect: () => deleteFileInteractive(fileId),
    },
  ];
  if (file.name.toLowerCase().endsWith('.cfg')
    && BelJarPersist.getDefaultCfgPath() !== file.name) {
    items.unshift(
      {
        label: 'Make active CFG',
        onSelect: () => {
          BelJarPersist.setDefaultCfgPath(file.name);
          refresh();
        },
      },
      { type: 'separator' },
    );
  }
  return items;
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

// ── Command palette ───────────────────────────────────────────────────────────

if (typeof CommandPalette !== 'undefined') {
  CommandPalette.init();
  const reg = CommandPalette.register;

  reg({ id: 'project.new', title: 'New Project…', section: 'File', run: () => newProject() });
  reg({ id: 'file.new', title: 'New File…', section: 'File', run: () => newFile() });
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
    id: 'run.check',
    title: 'Run File',
    section: 'Run',
    run: () => { if (typeof BelJarBelugaRun !== 'undefined') BelJarBelugaRun.loadCode(); },
  });
  reg({
    id: 'run.project',
    title: 'Run Whole Project',
    section: 'Run',
    when: () => developmentFileCount() > 1,
    run: () => { if (typeof BelJarBelugaRun !== 'undefined' && BelJarBelugaRun.loadProject) BelJarBelugaRun.loadProject(); },
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

// ── Prefabs sidebar button ────────────────────────────────────────────────────

const prefabsBtn = document.getElementById('btn-prefabs');
if (prefabsBtn) {
  let prefabsSuppressNextClick = false;
  const hidePrefabsTooltipUntilLeave = wireSidebarOpenTooltip(prefabsBtn);

  function runPrefabsMenuInteraction() {
    if (typeof Menu !== 'undefined' && Menu.isOpen() && Menu.rootAnchor() === prefabsBtn) {
      Menu.closeAll();
      return;
    }
    if (typeof Menu === 'undefined') return;
    hidePrefabsTooltipUntilLeave();
    Menu.open({
      anchor: prefabsBtn,
      side: 'right',
      align: 'start',
      items: [
        {
          label: 'Natural Deduction',
          submenu: [
            { label: 'Insert at top', onSelect: () => insertNd('top') },
            { label: 'Insert at bottom', onSelect: () => insertNd('bottom') },
            { label: 'Insert at cursor', onSelect: () => insertNdAtSelection() },
            { label: 'Copy to clipboard', onSelect: () => void copyNd() },
          ],
        },
      ],
    });
  }

  prefabsBtn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    prefabsSuppressNextClick = true;
    runPrefabsMenuInteraction();
  });

  prefabsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (prefabsSuppressNextClick) {
      prefabsSuppressNextClick = false;
      return;
    }
    runPrefabsMenuInteraction();
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
  // Plain click runs the whole project (falls back to the file when there is no
  // .cfg); Ctrl/Cmd+click runs only the prelude up to and including this file.
  if (e.ctrlKey || e.metaKey) BelJarBelugaRun.loadCode();
  else BelJarBelugaRun.loadProject();
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
