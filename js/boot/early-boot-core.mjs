import { SCHEMA } from '../persist/store.mjs';
import { readBootSettings } from '../persist/settings-schema.mjs';
import { applyDocumentSettings } from '../persist/settings-apply.mjs';
import { DEVICE, readBootDevice } from '../persist/device-schema.mjs';

export const SPLIT_STACK_MQ = '(max-width: 48rem)';

export function applySplitVars(rootStyle, ratio, stackMq, matchMedia) {
  const a = Math.round(ratio * 1e6) / 1e6;
  const b = Math.round((1 - ratio) * 1e6) / 1e6;
  if (matchMedia(stackMq).matches) {
    rootStyle.removeProperty('--workspace-split-cols');
    rootStyle.setProperty('--workspace-split-rows', `${a}fr ${b}fr`);
  } else {
    rootStyle.removeProperty('--workspace-split-rows');
    rootStyle.setProperty('--workspace-split-cols', `${a}fr ${b}fr`);
  }
}

/**
 * First paint from the stored settings, through the same function every later
 * change goes through (settings-apply.mjs), so boot can never paint a setting
 * one way and a live change paint it another.
 */
export function applyStoredSettings(docEl, storage) {
  applyDocumentSettings(docEl, readBootSettings(storage, SCHEMA));
}

/**
 * Panel sizes the user dragged, before first paint. Only sizes that differ
 * from the default are painted: the stylesheet already holds the defaults.
 * The custom property each size paints into is declared on its device row.
 */
export function applyPanelDimensionPrefs(rootStyle, device) {
  for (const row of DEVICE) {
    if (row.cssVar && device[row.id] !== row.default) rootStyle.setProperty(row.cssVar, `${device[row.id]}px`);
  }
}

export function installEarlyBoot(env) {
  const { document, window, localStorage } = env;
  const device = readBootDevice(localStorage, SCHEMA);
  applyStoredSettings(document.documentElement, localStorage);
  applyPanelDimensionPrefs(document.documentElement.style, device);
  applySplitVars(document.documentElement.style, device.editorSplit, SPLIT_STACK_MQ, window.matchMedia.bind(window));
}

export function registerServiceWorker(nav, loc) {
  if (!('serviceWorker' in nav)) return;
  const host = loc.hostname;
  const isLocalDev = host === 'localhost' || host === '127.0.0.1';
  if (isLocalDev) {
    nav.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => { r.unregister(); });
    });
    return;
  }
  nav.serviceWorker.register('sw.js');
}
