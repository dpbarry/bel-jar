/**
 * Product shell graph — one IIFE for index.html after clients + editor.
 * Domain leaves stay in SHELL_ENTRIES for focused tests; this is the boot assembly.
 *
 * Import order is load-bearing: persist / workspace / repl chrome must load before
 * beluga-run (top-level Persist / ProjectSource reads). Do not reorder casually —
 * tests/test-shell-boot.mjs catches ReferenceError from wrong order after typeof burns.
 */
import './repl/run-progress.mjs';
import './persist/persist.mjs';
import './persist/install-edit-history.mjs';
import './commands/command-registry.mjs';
import './status-strip/status-strip-view.mjs';
import './ui/keybindings.mjs';
import './ui/perf-hud.mjs';
import './workspace/workspace.mjs';
import './ui/tooltips.mjs';
import './ui/hint.mjs';
import './ui/menu.mjs';
import './ui/command-palette.mjs';
import './ui/floating-window.mjs';
import './ui/available-macros.mjs';
import './ui/full-keyboard.mjs';
import './ui/double-tap.mjs';
import './ui/scroll-fade.mjs';
import './ui/text-slide.mjs';
import './ui/dialogs.mjs';
import './ui/name-conflicts.mjs';
import './ui/download-zip.mjs';
import './ui/tree-dnd.mjs';
import './ui/header-search.mjs';
import './explorer/explorer.mjs';
import './library/library.mjs';
import './ui/toasts.mjs';
import './ui/notifications.mjs';
import './frame/frame.mjs';
import './repl/repl-stream.mjs';
import './repl/repl-output.mjs';
import './repl/repl-run-cmd.mjs';
import './repl/repl-autocomplete.mjs';
import './repl/repl-commands.mjs';
import './repl/repl-persist.mjs';
import './ui/bj-toggle.mjs';
import './ui/bj-dropdown.mjs';
import './ui/settings-ui.mjs';
import './harpoon/harpoon-ui.mjs';
import './beluga/beluga-run-boot.mjs';
import './app/app.mjs';
import './compat/beljar-window-aliases.mjs';
