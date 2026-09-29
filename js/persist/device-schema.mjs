/**
 * Every piece of device state, declared once (docs/PERSIST.md §4.3).
 *
 * Device state is what belongs to THIS browser, never synced: how the panels
 * are sized, which project to open next, what the graph panel looks like,
 * which hints were dismissed. It is a table like the settings (table.mjs) in
 * one record, `beljar/device`, read through `Device.get(id)`.
 *
 * Not a preference: nothing here is in the Settings dialog, nothing exports,
 * and a new device starts from the defaults. Pure data and pure functions:
 * early boot imports this to size the panels before first paint.
 *
 * A row is a table row, plus:
 *   group   'layout' rows are what Settings → Reset panel layout puts back
 *   cssVar  the custom property early boot and the resize handles paint a
 *           panel size into
 */
import { resolveRows, readBootRows, clone } from './table.mjs';

export const DEVICE_KEY = 'beljar/device';

function stringList(cap) {
  return (raw) => {
    if (!Array.isArray(raw)) return undefined;
    const out = [];
    for (const x of raw) {
      if (typeof x === 'string' && x && out.indexOf(x) === -1) out.push(x);
    }
    return cap ? out.slice(0, cap) : out;
  };
}

/** The run-time estimator's learned model (repl/run-progress.mjs). */
function runModel(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const { baseMs, msPerLine, sampleCount } = raw;
  if (!(typeof msPerLine === 'number' && msPerLine > 0) || !(typeof baseMs === 'number' && baseMs >= 0)) return undefined;
  return {
    baseMs,
    msPerLine,
    sampleCount: typeof sampleCount === 'number' && sampleCount >= 1 ? Math.floor(sampleCount) : 1,
  };
}

const PANEL_W = { group: 'layout', default: 250, min: 160, max: 512, integer: true, boot: true };
const PANEL_H = { group: 'layout', default: 190, min: 96, max: 384, integer: true, boot: true };

export const DEVICE = [
  // which project the next load opens (a page stays on the one it opened: work.mjs)
  { id: 'activeProject', type: 'string', default: '' },
  // the account this browser is signed in as ('' signed out): whose projects it
  // shows, and who owns a new one (work.mjs). An opaque id, never a credential.
  { id: 'account', type: 'string', default: '' },
  // durability.mjs: when this browser was last asked to keep BelJar's storage,
  // and when this device was told Safari may delete it (ms; 0: never)
  { id: 'persistAskedAt', type: 'number', default: 0 },
  { id: 'durabilityWarnedAt', type: 'number', default: 0 },

  // layout
  { id: 'editorSplit', group: 'layout', default: 0.5, min: 0.18, max: 0.82, boot: true },
  { id: 'explorerWidth', ...PANEL_W, cssVar: '--explorer-w' },
  { id: 'explorerHeight', ...PANEL_H, max: 320, cssVar: '--explorer-h' },
  { id: 'inspectorWidth', ...PANEL_W, cssVar: '--inspector-w' },
  { id: 'inspectorHeight', ...PANEL_H, cssVar: '--inspector-h' },
  { id: 'libraryWidth', ...PANEL_W, cssVar: '--library-w' },
  { id: 'libraryHeight', ...PANEL_H, cssVar: '--library-h' },
  { id: 'harpoonWidth', ...PANEL_W, cssVar: '--harpoon-w' },
  { id: 'harpoonHeight', ...PANEL_H, cssVar: '--harpoon-h' },
  { id: 'harpoonDetailsCollapsed', default: false },

  // the dependency graph panel
  { id: 'graphLayout', default: 'force', values: ['force', 'flat'] },
  { id: 'graphImpl', default: 'show', values: ['show', 'hide'] },
  { id: 'graphDepth', default: 1, values: [1, 2, 3] },
  { id: 'graphLabelDensity', default: 3, values: [1, 2, 3, 4, 5] },
  { id: 'graphSidebarCollapsed', default: false },

  // what this device has learned or been told
  { id: 'dismissedHints', type: 'json', default: [], normalize: stringList() },
  { id: 'commandLineHistory', type: 'json', default: [], normalize: stringList(50) },
  { id: 'runModel', type: 'json', default: null, normalize: runModel },
  { id: 'jumpLog', default: false },
];

const BY_ID = new Map(DEVICE.map((row) => [row.id, row]));

export function deviceRow(id) {
  return BY_ID.get(id) || null;
}

export function deviceDefault(id) {
  const row = deviceRow(id);
  if (!row) throw new Error(`device: no row "${id}" (declare it in device-schema.mjs)`);
  return clone(row.default);
}

/** Every row's effective value from a stored map (unknown or invalid → default). */
export function resolveDevice(stored) {
  return resolveRows(DEVICE, stored);
}

/**
 * For code that can run without the shell (the editor bundle under Node
 * tests): the live value when `Device` exists, the default when it does not.
 */
export function readDevice(id) {
  const D = globalThis.Device;
  return D ? D.get(id) : deviceDefault(id);
}

export function writeDevice(id, value) {
  const D = globalThis.Device;
  return D ? D.set(id, value) : false;
}

/** The device values early boot paints with, before the store exists. */
export function readBootDevice(storage, schema) {
  return readBootRows(storage, schema, DEVICE_KEY, DEVICE);
}
