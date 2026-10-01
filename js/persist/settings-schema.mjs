/**
 * Every BelJar setting, declared once.
 *
 * Reading, writing, resetting a section, exporting, importing, the Settings
 * dialog's defaults and the values early boot paints with ALL derive from this
 * table. A default written anywhere else is a second copy waiting to drift.
 * Pure data and pure functions: early boot imports this before anything else
 * has loaded. Design: docs/PERSIST.md §3.5.
 *
 * A row is a table row (table.mjs) plus `section`, the Settings dialog
 * category it resets with, and `sync: false` on a row that only makes sense
 * on one device (settings sync never carries it: sync/settings-sync.mjs).
 * `values` are listed in the order `:set` and a palette chord cycle through
 * them.
 */
import { typeOf, sameValue, clone, normalizeValue, resolveRows, readBootRows } from './table.mjs';

export { typeOf, sameValue };

export const SETTINGS_KEY = 'beljar/settings';

/** The Settings dialog's categories; each has its own Reset. */
export const SECTIONS = ['appearance', 'editor', 'keybindings', 'beluga', 'harpoon', 'repl', 'workspace', 'aliases', 'account'];

function cleanKeybindings(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return undefined;
  const out = {};
  for (const [id, v] of Object.entries(map)) {
    if (v === '' || v === null) out[id] = '';
    else if (typeof v === 'string') out[id] = v;
  }
  return out;
}

function cleanAliasPairs(v) {
  if (v === null) return null;
  return Array.isArray(v) ? v : undefined;
}

const ON = true;
const OFF = false;

export const SETTINGS = [
  // ── Appearance ──────────────────────────────────────────────────────────
  { id: 'theme', section: 'appearance', default: 'dark', values: ['dark', 'light'], boot: true },
  { id: 'uiFontSize', section: 'appearance', default: 'md', values: ['sm', 'md', 'lg', 'xl'], boot: true },
  { id: 'uiTextContrast', section: 'appearance', default: 'medium', values: ['low', 'medium', 'high', 'maximum'], boot: true },
  { id: 'motionPref', section: 'appearance', default: 'system', values: ['system', 'reduce', 'full'], boot: true },
  { id: 'toastDuration', section: 'appearance', default: 'normal', values: ['short', 'normal', 'long'] },

  // ── Editor: typography ──────────────────────────────────────────────────
  { id: 'editorFontSize', section: 'editor', default: 'md', values: ['sm', 'md', 'lg', 'xl'] },
  { id: 'editorLineHeight', section: 'editor', default: 'normal', values: ['compact', 'normal', 'relaxed'] },
  { id: 'editorWordWrap', section: 'editor', default: OFF },
  { id: 'editorFontFamily', section: 'editor', default: 'jetbrains', values: ['jetbrains', 'system'], boot: true },
  { id: 'editorCursorBlink', section: 'editor', default: 'blink', values: ['off', 'blink', 'fast'] },
  { id: 'editorScrollPastEnd', section: 'editor', default: ON },
  { id: 'editorWhitespace', section: 'editor', default: 'none', values: ['none', 'trailing', 'selection', 'all'] },
  { id: 'editorRulers', section: 'editor', default: OFF },

  // ── Editor: indentation and saving ──────────────────────────────────────
  { id: 'editorTabSize', section: 'editor', default: 2, values: [2, 4] },
  { id: 'autosaveDelay', section: 'editor', default: 320, values: [320, 1000, 2000] },
  { id: 'editorFormatWidth', section: 'editor', default: 80, values: [80, 100, 120] },
  { id: 'editorReindentPaste', section: 'editor', default: ON },
  { id: 'cfgAutoSync', section: 'editor', default: ON },
  { id: 'formatOnSave', section: 'editor', default: OFF },
  { id: 'trimTrailingWs', section: 'editor', default: OFF },

  // ── Editor: code insight ────────────────────────────────────────────────
  { id: 'editorSyntaxHighlight', section: 'editor', default: ON },
  { id: 'editorSemanticHighlight', section: 'editor', default: ON },
  { id: 'editorParseHighlight', section: 'editor', default: ON },
  { id: 'editorOccurrenceHighlight', section: 'editor', default: ON },
  { id: 'editorBracketMatch', section: 'editor', default: ON },
  { id: 'editorAutoCloseBrackets', section: 'editor', default: ON },
  { id: 'editorSelectionMatches', section: 'editor', default: ON },
  { id: 'hoverScope', section: 'editor', default: 'all', values: ['all', 'user-only', 'none'] },
  { id: 'hoverSticky', section: 'editor', default: OFF },
  { id: 'editorAutocompleteTrigger', section: 'editor', default: 'typing', values: ['typing', 'none', 'always'] },
  { id: 'editorAutocompleteContinue', section: 'editor', default: OFF },
  { id: 'quietWhileTyping', section: 'editor', default: OFF },

  // ── Editor: gutters and diagnostics ─────────────────────────────────────
  { id: 'editorLineNumbers', section: 'editor', default: ON },
  { id: 'editorLineNumberMode', section: 'editor', default: 'absolute', values: ['absolute', 'relative', 'hybrid'] },
  { id: 'editorFoldGutter', section: 'editor', default: ON },
  { id: 'editorFoldPersist', section: 'editor', default: 'session', values: ['session', 'none', 'local'], sync: false },
  { id: 'editorActiveLine', section: 'editor', default: ON },
  { id: 'diagPresentation', section: 'editor', default: 'both', values: ['both', 'underlines', 'gutter', 'none'] },
  { id: 'diagSeverity', section: 'editor', default: 'all', values: ['all', 'errors'] },
  { id: 'editorHoleGutter', section: 'editor', default: ON },
  { id: 'editorHoleEmphasis', section: 'editor', default: 'normal', values: ['subtle', 'normal', 'loud'], boot: true },
  { id: 'stickyDeclHeader', section: 'editor', default: OFF },

  // ── Keybindings and the keyboard ────────────────────────────────────────
  { id: 'keybindings', section: 'keybindings', default: {}, type: 'json', normalize: cleanKeybindings },
  { id: 'keymapStyle', section: 'keybindings', default: 'default', values: ['default', 'vim', 'emacs'] },
  // How much the status strip says. It is always there: no Off (2026-09-30).
  { id: 'statusStrip', section: 'keybindings', default: 'standard', values: ['compact', 'standard', 'detailed'] },
  { id: 'vimLeader', section: 'keybindings', default: '\\', values: ['\\', ',', ' '] },
  { id: 'vimInsertEscape', section: 'keybindings', default: '', values: ['', 'jk', 'jj', 'kj'] },
  { id: 'emacsYankSource', section: 'keybindings', default: 'system', values: ['system', 'kill-ring'] },
  { id: 'doubleTapTrigger', section: 'keybindings', default: 'off', values: ['off', 'shift', 'control', 'alt'] },
  { id: 'doubleTapCommand', section: 'keybindings', default: 'tools.palette', type: 'string' },
  { id: 'doubleTapSpeed', section: 'keybindings', default: 'normal', values: ['normal', 'fast', 'relaxed'] },

  // ── Beluga ──────────────────────────────────────────────────────────────
  // Which build this device downloads: a phone and a workstation differ.
  { id: 'belugaMode', section: 'beluga', default: 'stable', values: ['stable', 'fast'], sync: false },
  { id: 'belugaFallbackStable', section: 'beluga', default: ON },
  { id: 'belugaCancelOnEdit', section: 'beluga', default: ON },
  { id: 'checkAggressiveness', section: 'beluga', default: 'balanced', values: ['responsive', 'balanced', 'thorough'] },
  { id: 'suiteCheck', section: 'beluga', default: 'suite', values: ['suite', 'active'] },

  // ── Harpoon ─────────────────────────────────────────────────────────────
  { id: 'harpoonMode', section: 'harpoon', default: 'manual', values: ['manual', 'orca'] },
  { id: 'harpoonVerifyMoves', section: 'harpoon', default: ON },
  { id: 'autosolveFocusNext', section: 'harpoon', default: ON },
  { id: 'autosolveShowStats', section: 'harpoon', default: ON },

  // ── REPL ────────────────────────────────────────────────────────────────
  { id: 'replAutoscroll', section: 'repl', default: ON },
  { id: 'replWelcome', section: 'repl', default: ON },
  { id: 'replEcho', section: 'repl', default: ON },
  { id: 'replFilterChatter', section: 'repl', default: ON },
  { id: 'replHoverTimestamp', section: 'repl', default: OFF },
  { id: 'replAutocompleteTrigger', section: 'repl', default: 'typing', values: ['typing', 'none', 'always'] },
  { id: 'replAutocompleteContinue', section: 'repl', default: OFF },
  { id: 'replHistoryCap', section: 'repl', default: 1000, values: [100, 250, 500, 1000] },
  // Where this browser keeps history: a shared computer is not your laptop.
  { id: 'replHistoryPersist', section: 'repl', default: 'local', values: ['local', 'session', 'none'], sync: false },

  // ── Workspace ───────────────────────────────────────────────────────────
  { id: 'inspectorFollow', section: 'workspace', default: ON },
  { id: 'restorePanels', section: 'workspace', default: ON },
  { id: 'libraryExpandDefault', section: 'workspace', default: OFF },

  // ── Account: how sync behaves (docs/PERSIST.md §5.7) ─────────────────────
  // Signed in, settings follow you between devices; off here, this device keeps its own.
  { id: 'syncSettings', section: 'account', default: ON, sync: false },
  // A file changed on this device and in the cloud since they last synced:
  // 'merge' what merges, or 'ask' about every such file (nothing merges by
  // itself: sync/merge-project.mjs `askAll`).
  { id: 'syncBothChanged', section: 'account', default: 'merge', values: ['merge', 'ask'] },
  // Merging, the lines changed on both sides: 'ask' (the review window), or
  // settle them to 'mine' or the 'cloud' as they appear (js/account/sync-ui.mjs).
  { id: 'syncOverlap', section: 'account', default: 'ask', values: ['ask', 'mine', 'cloud'] },
  // Edits made while offline, once back online: 'upload' on their own, or 'ask'
  // first (held until the person uploads them or takes the cloud's instead).
  { id: 'syncReconnect', section: 'account', default: 'upload', values: ['upload', 'ask'] },
  // "Offline" in the strip, and "Back online" when it returns. The cloud beside
  // the project name says it either way.
  { id: 'syncNotices', section: 'account', default: ON },
  // Signing out on this browser: 'remove' the account's projects (safe on a
  // shared computer), or 'keep' them here to work on signed out; they sync
  // again when the same account signs in (work.mjs `keptAccounts`).
  { id: 'signOutKeep', section: 'account', default: 'remove', values: ['remove', 'keep'], sync: false },

  // ── Aliases ─────────────────────────────────────────────────────────────
  { id: 'aliasActivation', section: 'aliases', default: 'greedy', values: ['greedy', 'strict'] },
  // null: the built-in alias table.
  { id: 'aliasPairs', section: 'aliases', default: null, type: 'json', normalize: cleanAliasPairs },
];

const BY_ID = new Map(SETTINGS.map((row) => [row.id, row]));

export function settingRow(id) {
  return BY_ID.get(id) || null;
}

/** Settings sync carries this row (every row but the `sync: false` ones). */
export function isSyncedSetting(row) {
  return !!row && row.sync !== false;
}

/** The clean value `raw` stands for under `row`, or undefined (table.mjs). */
export const normalizeSetting = normalizeValue;

export function defaultOf(id) {
  const row = settingRow(id);
  if (!row) throw new Error(`settings: no setting "${id}"`);
  return clone(row.default);
}

/**
 * Every setting's effective value, from a stored `{ id: value }` map that may
 * hold anything: unknown ids and values a setting cannot hold fall back to its
 * default, so a bad record can never reach the app.
 */
export function resolveValues(stored) {
  return resolveRows(SETTINGS, stored);
}

/**
 * For code that can run without the shell (the editor bundle under Node
 * tests): the live value when `Settings` exists, the default when it does not.
 * The default still comes from this table, so there is no second copy.
 */
export function readSetting(id) {
  const S = globalThis.Settings;
  return S ? S.get(id) : defaultOf(id);
}

export function writeSetting(id, value) {
  const S = globalThis.Settings;
  return S ? S.set(id, value) : false;
}

/**
 * The values early boot paints with, read straight from browser storage before
 * the store exists. A missing or different schema reads as defaults: the store
 * is about to wipe that data anyway, and painting from it would flash.
 */
export function readBootSettings(storage, schema) {
  return readBootRows(storage, schema, SETTINGS_KEY, SETTINGS);
}
