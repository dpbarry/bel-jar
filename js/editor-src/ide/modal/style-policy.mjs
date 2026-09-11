/**
 * Which style owns which chord, and which style the focused editor is in.
 *
 * The policy itself is DECLARED in the shell's command catalogue
 * (`js/commands/command-catalog.mjs`) so the Keybindings sheet and the live
 * keymap can never disagree about what a style takes away. This module is the
 * lookup: it reads the catalogue at runtime, memoizes against the registry's
 * version counter (`vimAllowsRemap` runs per keystroke for every bound editor
 * chord), and falls back to the arrays below when the registry is not on the
 * page yet. `tests/test-command-catalog.mjs` pins the fallbacks against the
 * catalogue.
 *
 * No CodeMirror extensions, no package patching, no DOM writes — this answers
 * questions, it does not install anything.
 */
import { getCM } from '@replit/codemirror-vim';

export const KEYMAP_STYLES = ['default', 'vim', 'emacs'];

// Style policy is DECLARED in the shell's command catalogue
// (`js/commands/command-catalog.mjs`) so the Keybindings sheet and the live
// keymap can never disagree about which chords a style takes away. The arrays
// below are the fallback for when the registry is not on the page yet — they
// cover the chords BelJar has always shipped, and `tests/test-command-catalog.mjs`
// pins them against the catalogue.

/** BelJar remaps that steal Emacs Ctrl chords on Win/Linux (Mod = Ctrl). */
export const EMACS_OMIT_COMMAND_IDS = [
  'edit.find',
  'edit.select-all',
  'edit.autocomplete',
  'edit.redo',
  'edit.toggle-comment',
  // Alt+X is M-x; Emacs' own binding wins.
  'tools.commands',
  // Alt+Shift+F is S-M-f — forward-word-selecting in the package's key table.
  // `C-c q` is BelJar's substitute for Format Document.
  'edit.format',
  // Ctrl+X/Ctrl+C/Ctrl+V are real Emacs prefix/scroll keys (C-x, C-c, C-v);
  // Emacs' own kill-ring (C-w/M-w/C-y) already covers cut/copy/paste and is
  // already listed in Available Keys.
  'edit.cut',
  'edit.copy',
  'edit.paste',
  // `Mod+G` is Go to Line everywhere else; under Emacs `C-g` is keyboard-quit,
  // the one chord that must always mean "stop". `M-g g` is the substitute, and
  // it is Emacs' own spelling. (Global scope, so the yield happens in
  // `shouldYieldGlobalForEmacs`; the editor keymap has nothing to omit.)
  'nav.goto-line',
];

/** Globals that must yield to Emacs when a Beluga emacs-mode editor is focused. */
export const EMACS_YIELD_GLOBAL_IDS = ['nav.anywhere'];

/** Remappable commands that stay live in Vim Normal (function keys / IDE nav). */
export const VIM_ALWAYS_COMMAND_IDS = [
  'edit.rename',
  'edit.format',
  'nav.definition',
  'nav.references',
  'nav.next-hole',
  'nav.prev-hole',
];

// ⛔ Every id above is on a FUNCTION KEY, and that is not a coincidence — it is
// the condition. Vim runs at `Prec.highest` and preventDefaults whatever it
// matched, so `always` can only be honoured for a chord the vim package does not
// bind; declare it for one vim owns and the chord silently keeps doing vim's
// thing while every surface reports it as live. Cut/Copy/Paste were declared
// here on exactly that mistaken basis — `<C-x>` decrements a number, `<C-v>` is
// blockwise visual, `<C-c>` is `<Esc>` — and they are insert-only now.
// `tests/test-command-catalog.mjs` reads the package's keymap and fails if a
// future `always` collides with it.

// `vimAllowsRemap` runs per keystroke for every bound editor chord, so the
// lookup is memoized against the registry's version counter rather than
// rebuilding an array each time.
const policyCache = new Map();
let policyCacheVersion = -1;

function commandRegistry() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const C = g.Commands;
  return C && typeof C.idsWithStyle === 'function' ? C : null;
}

/** Ids whose declared policy under `style` is `policy`; `fallback` when offline. */
export function policyIds(style, policy, fallback) {
  const C = commandRegistry();
  if (!C) return fallback;
  const version = typeof C.version === 'function' ? C.version() : 0;
  if (version !== policyCacheVersion) {
    policyCache.clear();
    policyCacheVersion = version;
  }
  const key = style + ':' + policy;
  let ids = policyCache.get(key);
  if (!ids) {
    ids = C.idsWithStyle(style, policy);
    policyCache.set(key, ids);
  }
  return ids.length ? ids : fallback;
}

export function normalizeKeymapStyle(v) {
  const s = String(v == null ? '' : v).toLowerCase();
  return KEYMAP_STYLES.includes(s) ? s : 'default';
}

export function remappableOmitIds(style) {
  return normalizeKeymapStyle(style) === 'emacs'
    ? policyIds('emacs', 'off', EMACS_OMIT_COMMAND_IDS).slice()
    : [];
}

/** Pure helper for tests + global listener. */
export function shouldYieldGlobalForEmacs(commandId, emacsFocused) {
  if (!emacsFocused) return false;
  return policyIds('emacs', 'yield', EMACS_YIELD_GLOBAL_IDS).indexOf(commandId) >= 0;
}

export function isEmacsEditorFocused(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || !d.activeElement) return false;
  const ed = d.activeElement.closest && d.activeElement.closest('.cm-editor');
  if (!ed) return false;
  return !!ed.querySelector('.cm-emacsMode');
}

export function isVimEditorFocused(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || !d.activeElement) return false;
  const scroller = d.activeElement.closest && d.activeElement.closest('.cm-scroller');
  return !!(scroller && scroller.classList.contains('cm-vimMode'));
}

/** True when a vim-mode editor is focused and remappable IDE chords should stay off. */
export function isVimNormalEditorFocused(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || !d.activeElement) return false;
  const scroller = d.activeElement.closest && d.activeElement.closest('.cm-scroller');
  if (!scroller || !scroller.classList.contains('cm-vimMode')) return false;
  const ed = scroller.closest('.cm-editor');
  return !!ed;
}

export function vimAllowsRemap(view, commandId) {
  if (policyIds('vim', 'always', VIM_ALWAYS_COMMAND_IDS).indexOf(commandId) >= 0) return true;
  const cm = getCM(view);
  const vimState = cm?.state?.vim;
  if (!vimState) return true;
  return !!vimState.insertMode;
}
