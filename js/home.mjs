/**
 * Home's graph: one IIFE for index.html (js/home.js). The frame, persistence,
 * the account and sync, the dialogs and menus home uses, and home itself.
 *
 * ⛔ Nothing of the editor, the workspace, the explorer or Beluga may be
 * imported here, directly or through anything below: home must cost a
 * fraction of the editor and start no Beluga worker (tests/test-home.mjs holds
 * the size and what the bundle may contain).
 *
 * Import order is load-bearing, as in shell.mjs: persist before anything that
 * reads Persist or Settings at load.
 */
import './frame/routes.mjs';
import './persist/persist.mjs';
import './ui/tooltips.mjs';
import './ui/menu.mjs';
import './ui/menu-trigger.mjs';
import './ui/floating-window.mjs';
import './ui/dialogs.mjs';
import './ui/download-zip.mjs';
import './ui/toasts.mjs';
import './ui/notifications.mjs';
import './frame/frame.mjs';
import './account/account.mjs';
import './account/sync-ui.mjs';
import './home/home.mjs';
