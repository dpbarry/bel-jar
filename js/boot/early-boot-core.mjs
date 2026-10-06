import { SCHEMA, migrateStorage } from '../persist/store.mjs';
import { MIGRATIONS } from '../persist/migrations.mjs';
import { readBootSettings } from '../persist/settings-schema.mjs';
import { applyDocumentSettings } from '../persist/settings-apply.mjs';
import { DEVICE, readBootDevice } from '../persist/device-schema.mjs';
import { pageOf, editUrl, go } from '../frame/routes.mjs';
import { showableProject } from './boot-project.mjs';
import { installPageTransitions } from './page-transition-core.mjs';

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

/**
 * The start page (Settings > Workspace). With "Last project", a plain arrival
 * at BelJar goes straight to the project last opened, the way an IDE reopens
 * its last window. Decided here, before first paint, by REPLACING the address:
 * home never flashes, and Back does not return to a page that would send you
 * forward again.
 *
 * Only a bare home address is a plain arrival. Anything in it says what was
 * asked for: `?home` (every link to home BelJar makes while this setting is
 * on: js/frame/routes.mjs `homeUrl`), a sign-in coming back, a project to wait
 * for. And only a fresh navigation: a reload, or Back, shows the page that was
 * there. Returns the project to open, or null: stay.
 */
export function startTarget({ settings, device, storage, loc, navType }) {
  if (!settings || settings.startPage !== 'last') return null;
  if (!loc || pageOf(loc) !== 'home' || loc.search || loc.hash) return null;
  if (navType === 'reload' || navType === 'back_forward') return null;
  const pid = device && device.activeProject;
  // Only a project this browser can show. One that left with its account, or
  // was deleted, would send the editor straight back here.
  return pid && showableProject(storage, device, pid) ? pid : null;
}

export function installEarlyBoot(env) {
  const { document, window, localStorage } = env;
  // ⛔ A format change is migrated before anything is read: read in the old
  // format, every setting would be the default for this one paint (a light
  // theme painted dark, then light). The store finds it current after.
  try {
    migrateStorage(localStorage, SCHEMA, MIGRATIONS);
  } catch (_) { /* the store tries again, and says why */ }
  const device = readBootDevice(localStorage, SCHEMA);
  // The navigation between the two pages is animated by the browser; what a
  // stylesheet cannot decide about it is decided here, before either page is shown.
  installPageTransitions({ window, document, bootMotion: () => readBootSettings(localStorage, SCHEMA).motionPref });
  const nav = window.performance && typeof window.performance.getEntriesByType === 'function'
    ? window.performance.getEntriesByType('navigation')[0] : null;
  const pid = startTarget({
    settings: readBootSettings(localStorage, SCHEMA),
    device,
    storage: localStorage,
    loc: window.location,
    navType: nav ? nav.type : 'navigate',
  });
  if (pid) {
    // On its way to the editor: nothing of home is shown, and home's script
    // starts nothing (js/home/home.mjs, js/account/account.mjs read this).
    window.BELJAR_LEAVING = true;
    document.documentElement.style.display = 'none';
    go(editUrl(pid), { replace: true });
    return;
  }
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
