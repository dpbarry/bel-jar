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

const global = globalThis;

const teardown = [];
let mounted = false;

function track(target, type, fn, opts) {
  if (!target) return;
  target.addEventListener(type, fn, opts);
  teardown.push(() => target.removeEventListener(type, fn, opts));
}

// Flip the ground and tell whoever cares. The editor re-themes CodeMirror off
// this; a page with no editor simply has no listener. Reuses the one settings
// channel rather than adding a second one that only the frame knows about.
function toggleTheme() {
  const root = document.documentElement;
  root.classList.toggle('light');
  const isLight = root.classList.contains('light');
  if (global.Persist && typeof global.Persist.writeStoredTheme === 'function') {
    global.Persist.writeStoredTheme(isLight ? 'light' : 'dark');
  }
  global.dispatchEvent(new CustomEvent('beljar:settings-changed', {
    detail: { key: 'theme' },
  }));
  return isLight ? 'light' : 'dark';
}

function onReload() {
  global.location.reload();
}

function onSettings() {
  if (global.SettingsUI && typeof global.SettingsUI.open === 'function') {
    global.SettingsUI.open();
  }
}

function mount() {
  if (mounted) return;
  mounted = true;

  if (global.Toasts && typeof global.Toasts.init === 'function') global.Toasts.init();
  if (global.Notifications && typeof global.Notifications.init === 'function') {
    global.Notifications.init();
  }

  track(document.getElementById('btn-theme'), 'click', toggleTheme);
  track(document.getElementById('btn-reload'), 'click', onReload);
  track(document.getElementById('btn-settings'), 'click', onSettings);
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
