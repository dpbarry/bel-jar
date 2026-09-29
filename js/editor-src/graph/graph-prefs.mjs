import { readDevice, writeDevice } from '../../persist/device-schema.mjs';

const listeners = new Set();

/** Each graph preference is a device row (device-schema.mjs). */
const ROWS = {
  layout: 'graphLayout',
  impl: 'graphImpl',
  depth: 'graphDepth',
  labelDensity: 'graphLabelDensity',
  sidebarCollapsed: 'graphSidebarCollapsed',
};

export function loadGraphPrefs() {
  const out = {};
  for (const [field, id] of Object.entries(ROWS)) out[field] = readDevice(id);
  return out;
}

export function saveGraphPrefs(partial) {
  const changes = partial || {};
  for (const [field, id] of Object.entries(ROWS)) {
    if (field in changes) writeDevice(id, changes[field]);
  }
  // Without the shell (Node tests) nothing is stored: answer with the change applied.
  const next = globalThis.Device ? loadGraphPrefs() : { ...loadGraphPrefs(), ...changes };
  for (const fn of listeners) fn(next);
  return next;
}

export function onGraphPrefsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
