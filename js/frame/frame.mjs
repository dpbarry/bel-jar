/**
 * The frame — chrome every BelJar page wears, whatever route it is.
 *
 * Theme, toasts, the notification inbox, tooltips, and the header buttons that
 * mean the same thing everywhere. A page that wants BelJar's look and its
 * ambient surfaces loads this and nothing else.
 *
 * ⛔ Nothing here may reach the editor, the workspace, the explorer or Beluga.
 * Booting the frame must never start a Beluga worker: that is what lets a
 * dashboard cost ~80 KB instead of 2.8 MB plus a 24 MB runtime.
 *
 * ⛔ This is the ONLY owner of the shared chrome. app.mjs calls Frame.mount()
 * rather than wiring these buttons itself — two owners is how a theme toggle
 * ends up working on one route and not another.
 */
import '../ui/tooltips.mjs';
import '../ui/toasts.mjs';
import '../ui/notifications.mjs';
import { settingRow } from '../persist/settings-schema.mjs';
import { applyDocumentSettings } from '../persist/settings-apply.mjs';
import { Routes } from './routes.mjs';

const global = globalThis;

const teardown = [];
let mounted = false;

function track(target, type, fn, opts) {
  if (!target) return;
  target.addEventListener(type, fn, opts);
  teardown.push(() => target.removeEventListener(type, fn, opts));
}

// Flip the ground and tell whoever cares. The frame's own subscription repaints
// the page; the editor re-themes CodeMirror off the one settings channel, and a
// page with no editor simply has no listener.
function toggleTheme() {
  const next = Settings.get('theme') === 'light' ? 'dark' : 'light';
  Settings.set('theme', next);
  global.dispatchEvent(new CustomEvent('beljar:settings-changed', {
    detail: { key: 'theme' },
  }));
  return next;
}

/**
 * ⛔ The page's look follows the settings wherever they change from: the
 * dialog, :set, a reset, an import, another tab, the online layer. Nothing else
 * applies them, so nothing can forget to.
 */
function repaint() {
  applyDocumentSettings(document.documentElement, Settings.values());
}

function onSettingsChanged(e) {
  if (e.ids.some((id) => settingRow(id).boot)) repaint();
  if (e.ids.includes('startPage')) nameHome();
}

/** The editor's brand goes home, by the address this server answers (routes.mjs), which follows the start page. */
function nameHome() {
  const home = document.getElementById('btn-home');
  if (home) home.setAttribute('href', Routes.homeUrl());
}

function onSettings() {
  if (global.SettingsUI && typeof global.SettingsUI.open === 'function') {
    global.SettingsUI.open();
  }
}

function mount() {
  if (mounted) return;
  mounted = true;

  repaint();
  teardown.push(Settings.subscribe(onSettingsChanged));

  if (global.Toasts && typeof global.Toasts.init === 'function') global.Toasts.init();
  if (global.Notifications && typeof global.Notifications.init === 'function') {
    global.Notifications.init();
  }

  track(document.getElementById('btn-theme'), 'click', toggleTheme);
  track(document.getElementById('btn-settings'), 'click', onSettings);
  nameHome();
}

function unmount() {
  if (!mounted) return;
  mounted = false;
  while (teardown.length) {
    const off = teardown.pop();
    try { off(); } catch (_) {}
  }
  for (const peer of [global.Notifications, global.Toasts]) {
    if (peer && typeof peer.dispose === 'function') {
      try { peer.dispose(); } catch (_) {}
    }
  }
}

export const Frame = {
  mount,
  unmount,
  toggleTheme,
  isMounted: () => mounted,
  pendingTeardown: () => teardown.length,
};

global.Frame = Frame;
global.BelJarFrame = global.Frame;
