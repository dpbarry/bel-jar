const editorMount = document.getElementById('editor');
const cmdInput = document.getElementById('command-input');

const persist =
  typeof BelJarPersist !== 'undefined' ? BelJarPersist.createPersist() : null;

const editor =
  typeof BelJarEditor !== 'undefined' && BelJarEditor.mount
    ? BelJarEditor.mount(editorMount, {
        doc: persist ? persist.getEditorText() : '',
        onDocChange: function (text) {
          if (persist) persist.scheduleEditorPersist(text);
        },
      })
    : null;

window.BelJarCurrentEditor = editor;

function syncEditorCmTheme() {
  if (!editor || typeof editor.setDarkTheme !== 'function') return;
  editor.setDarkTheme(!document.documentElement.classList.contains('light'));
}
if (editor) syncEditorCmTheme();

if (typeof BelJarWorkspaceSplit !== 'undefined') {
  BelJarWorkspaceSplit.init({
    onResize: function () {
      if (editor && editor.getView) editor.getView().requestMeasure();
    },
  });
}

if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.insertWelcomeBanner();
if (typeof BelJarBelugaRun !== 'undefined') BelJarBelugaRun.init();

if (!editor) {
  if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.appendOutput('[FATAL] CodeMirror editor bundle failed to load.', 'fatal');
}

const TEMPLATES = {
  nd: `% Natural Deduction
LF o : type =
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
    if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.appendOutput('Error: could not copy to clipboard', 'error');
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
  getReplBeautify: function () {
    return typeof BelJarReplOutput !== 'undefined' ? BelJarReplOutput.getReplBeautify() : true;
  },
  setReplBeautify: function (on) {
    if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.setReplBeautify(on);
  },
  toggleReplBeautify: function () {
    if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.setReplBeautify(!BelJarReplOutput.getReplBeautify());
  },
};

const filesBtn = document.getElementById('btn-files');
const workspaceEl = document.querySelector('.workspace');
const explorerPanelEl = document.getElementById('explorer-panel');

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

const explorerTreeEl = explorerPanelEl && explorerPanelEl.querySelector('.explorer-tree');
if (explorerTreeEl && !explorerTreeEl.firstChild) {
  const placeholder = document.createElement('p');
  placeholder.className = 'explorer-empty';
  placeholder.textContent = 'No project files in browser mode.';
  explorerTreeEl.appendChild(placeholder);
}

if (filesBtn && workspaceEl) {
  const hideExplorerTooltipUntilLeave = wireSidebarOpenTooltip(filesBtn);
  filesBtn.addEventListener('click', () => {
    const wasOpen = workspaceEl.classList.contains('is-explorer-open');
    if (!wasOpen) hideExplorerTooltipUntilLeave();
    const open = workspaceEl.classList.toggle('is-explorer-open');
    filesBtn.classList.toggle('is-active', open);
    filesBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
    if (explorerPanelEl) explorerPanelEl.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (editor && editor.getView) editor.getView().requestMeasure();
    window.dispatchEvent(new Event('resize'));
  });
}

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
    Menu.open({
      anchor: btn,
      side: menuOpts.side,
      align: menuOpts.align,
      items: menuOpts.items,
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

const headerMenuDefs = [
  {
    id: 'menu-project',
    side: 'bottom',
    align: 'start',
    items: [
      { label: 'New project…' },
      { label: 'Open project…' },
      { label: 'Save' },
      { label: 'Close project' },
    ],
  },
  {
    id: 'menu-edit',
    side: 'bottom',
    align: 'start',
    items: [
      { label: 'Undo' },
      { label: 'Redo' },
      { label: 'Cut' },
      { label: 'Copy' },
      { label: 'Paste' },
      { label: 'Find…' },
    ],
  },
  {
    id: 'menu-insights',
    side: 'bottom',
    align: 'start',
    items: [
      { label: 'View diagnostics' },
      { label: 'Run lint' },
      { label: 'Coverage report…' },
    ],
  },
];

headerMenuDefs.forEach((def) => {
  wireMenuTrigger(document.getElementById(def.id), def);
});

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

const settingsBtn = document.getElementById('btn-settings');
if (settingsBtn && typeof BelJarDialog !== 'undefined') {
  settingsBtn.addEventListener('click', () => {
    if (typeof BelJarSettingsUI !== 'undefined') BelJarSettingsUI.open();
  });
}

document.getElementById('btn-theme').addEventListener('click', toggleTheme);
document.getElementById('btn-format').addEventListener('click', () => {
  if (editor && typeof editor.format === 'function') editor.format();
});
document.getElementById('btn-load').addEventListener('click', () => {
  if (typeof BelJarBelugaRun !== 'undefined') BelJarBelugaRun.loadCode();
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

window.addEventListener('beforeunload', () => { if (persist) persist.flushEditor(); });
window.addEventListener('pagehide', () => { if (persist) persist.flushEditor(); });

if (typeof RunProgress !== 'undefined') {
  RunProgress.bind({
    header: document.getElementById('output-panel-header'),
    fill: document.getElementById('output-header-progress'),
    status: document.getElementById('output-header-status'),
    output: document.getElementById('output'),
  });
}
