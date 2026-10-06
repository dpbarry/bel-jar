import { SCHEMA } from '../persist/store.mjs';
import { readBootSettings } from '../persist/settings-schema.mjs';
import { readBootSession } from '../persist/keys.mjs';
import { readBootDevice } from '../persist/device-schema.mjs';
import { projectOf } from '../frame/routes.mjs';
import { showableProject } from './boot-project.mjs';

/**
 * The project's name, in the header, before first paint. The document ships
 * with a placeholder there, and the editor's own scripts replace it only once
 * three megabytes of them have run: every load showed the wrong name first.
 * It is also what the transition from home lands the name on
 * (css/page-transition.css): a target with the wrong text in it would show.
 *
 * The project is the one the address names; a bare address means the last one
 * opened. Returns the name painted, or null (nothing known: the placeholder stays).
 */
export function paintProjectName(document, storage, loc) {
  const el = document.getElementById('header-context-name');
  if (!el) return null;
  const device = readBootDevice(storage, SCHEMA);
  const meta = showableProject(storage, device, projectOf(loc) || device.activeProject);
  if (!meta || typeof meta.name !== 'string' || !meta.name) return null;
  el.textContent = meta.name;
  return meta.name;
}

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
