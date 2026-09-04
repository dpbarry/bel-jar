const PANEL_CONFIG = {
  harpoon: {
    workspaceClass: 'is-harpoon-open',
    panelId: 'harpoon-panel',
    buttonId: 'btn-harpoon',
  },
  library: {
    workspaceClass: 'is-library-open',
    panelId: 'library-panel',
    buttonId: 'btn-library',
  },
  inspector: {
    workspaceClass: 'is-inspector-open',
    panelId: 'inspector-panel',
    buttonId: 'btn-inspector',
  },
  explorer: {
    workspaceClass: 'is-explorer-open',
    panelId: 'explorer-panel',
    buttonId: 'btn-files',
  },
};

const LEGACY_OPEN_KEYS = [
  ['beljar-harpoon-open', 'harpoon'],
  ['beljar-library-open', 'library'],
  ['beljar-inspector-open', 'inspector'],
  ['beljar-explorer-open', 'explorer'],
];

export function panelStorageKey(projectId) {
  if (!projectId || projectId === 'default') return 'beljar-active-side-panel';
  const safe = String(projectId).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `beljar-proj:${safe}:active-side-panel`;
}

export function resolveActivePanel(storage, projectId) {
  if (storage.getItem('beljar-restore-panels') === 'off') return null;

  const panelKey = panelStorageKey(projectId);
  let activePanel = storage.getItem(panelKey);
  if (activePanel) return activePanel;

  for (const [legacyKey, panel] of LEGACY_OPEN_KEYS) {
    if (storage.getItem(legacyKey) === '1') return panel;
  }
  return null;
}

export function applyActivePanel(document, activePanel) {
  const cfg = PANEL_CONFIG[activePanel];
  if (!cfg) return false;

  const workspace = document.querySelector('.workspace');
  if (!workspace) return false;

  workspace.classList.add(cfg.workspaceClass);

  const panel = document.getElementById(cfg.panelId);
  if (panel) panel.setAttribute('aria-hidden', 'false');

  const button = document.getElementById(cfg.buttonId);
  if (button) {
    button.classList.add('is-active');
    button.setAttribute('aria-pressed', 'true');
  }
  return true;
}

export function restorePanelState(document, storage) {
  const projectId = storage.getItem('beljar-active-project') || 'default';
  const activePanel = resolveActivePanel(storage, projectId);
  if (!activePanel) return false;
  return applyActivePanel(document, activePanel);
}
