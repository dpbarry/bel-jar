import { SCHEMA } from '../persist/store.mjs';
import { readBootSettings } from '../persist/settings-schema.mjs';
import { readBootSession } from '../persist/keys.mjs';

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

/** The side panel the page's project had open, or null (also when Restore panels is off). */
export function resolveActivePanel(storage) {
  if (!readBootSettings(storage, SCHEMA).restorePanels) return null;
  const session = readBootSession(storage, SCHEMA);
  const panel = session && session.panel;
  return typeof panel === 'string' && PANEL_CONFIG[panel] ? panel : null;
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
  const activePanel = resolveActivePanel(storage);
  if (!activePanel) return false;
  return applyActivePanel(document, activePanel);
}
