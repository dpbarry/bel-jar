/**
 * The modal-editing assembler: given a style name, hand back the CodeMirror
 * extensions that make BelJar behave like it.
 *
 * ⛔ This file used to be 700 lines and hold four unrelated jobs — style policy,
 * the entire Emacs runtime, the entire Vim runtime, and the assembly. It is one
 * job now, and the parts live where their name says:
 *
 *   modal/style-policy.mjs    which style owns which chord; which style the
 *                             focused editor is in. Answers questions, installs
 *                             nothing. Read per keystroke, so it is memoized.
 *   modal/vim-runtime.mjs     everything that makes Vim work — the Normal-mode
 *                             edit guard, the caret chrome, the `:` seam into
 *                             the status strip, `:` names, which-key.
 *   modal/emacs-runtime.mjs   everything that makes Emacs work — the chords
 *                             Chromium eats and BelJar's substitutes, the
 *                             pending-chain badge, the dead-chain guard, chrome.
 *   modal/vim-setup.mjs       the Vim maps themselves (`gd`, `]h`, the leader).
 *   modal/emacs-setup.mjs     the Emacs maps themselves (`C-x`, `C-c`).
 *   modal/style-macros.mjs    those maps as DATA, so a surface can list them.
 *   modal/which-key.mjs       pure: what can follow a pending prefix.
 *   modal/which-key-hint.mjs  the same, named through the registry.
 *   modal/reserved-chords.mjs the measured table of what the browser takes.
 *   modal/undo-route.mjs      undo/redo through BelJar's own history first.
 *
 * Everything the rest of the app imported from here is re-exported below, so
 * this stays the one address for "the modal keymaps" without being the one file.
 */
import { Prec } from '@codemirror/state';
import { vim } from '@replit/codemirror-vim';
import { emacs } from '@replit/codemirror-emacs';

import { normalizeKeymapStyle } from './modal/style-policy.mjs';
import { installVimBindings } from './modal/vim-setup.mjs';
import { installEmacsBindings } from './modal/emacs-setup.mjs';
import {
  vimPendingSnapshot, vimEditGuard, vimChromeTheme, vimSlotAttacher,
  registerVimExCommands, vimOptions, ensureVimUndoBridge,
} from './modal/vim-runtime.mjs';
import {
  ensureEmacsKeys, ensureEmacsUndoBridge, emacsChainGuard, emacsChromeTheme,
} from './modal/emacs-runtime.mjs';

// ── the public surface, unchanged ────────────────────────────────────────────
export {
  KEYMAP_STYLES, EMACS_OMIT_COMMAND_IDS, EMACS_YIELD_GLOBAL_IDS, VIM_ALWAYS_COMMAND_IDS,
  policyIds, normalizeKeymapStyle, remappableOmitIds, shouldYieldGlobalForEmacs,
  isEmacsEditorFocused, isVimEditorFocused, isVimNormalEditorFocused, vimAllowsRemap,
} from './modal/style-policy.mjs';
export {
  EMACS_SUBSTITUTES, EMACS_LINE_DOWN_KEY, ensureEmacsKeys, applyBeljarEmacsOverrides,
  emacsMarkSet, reportEmacsChain, emacsChainShape, emacsKeysReady, emacsWhichKeyHint,
} from './modal/emacs-runtime.mjs';
export {
  registerVimExCommands, attachVimStatusSlot, vimStatus,
} from './modal/vim-runtime.mjs';
export { whichKeyHint } from './modal/which-key-hint.mjs';

/**
 * Re-apply the preference-driven half of the modal keymaps, live.
 *
 * ⛔ Vim's maps are global to the PACKAGE, not per-view, so changing the leader
 * needs no CodeMirror reconfigure — only a re-map. The style compartment is
 * rebuilt on a STYLE change and nothing else, so without this the leader
 * dropdown wrote a preference the keymap never read until the next reload, while
 * which-key immediately started advertising the new leader. The setting and the
 * keymap disagreed, silently, and nothing on screen said so.
 */
export function applyModalPrefs() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const p = g.Persist;
  const style = normalizeKeymapStyle(
    p && typeof p.readStoredKeymapStyle === 'function' ? p.readStoredKeymapStyle() : 'default'
  );
  if (style !== 'vim') return false;
  installVimBindings(vimOptions());
  return true;
}

/**
 * The extensions for one style.
 *
 * ⛔ `Prec.highest` for both, and the ORDER inside each block is load-bearing:
 * the snapshot handler runs before the package so it sees state the package is
 * about to clear, and the guards run after it so they only ever see keys the
 * package itself declined.
 */
export function buildKeymapStyleExtensions(style) {
  const s = normalizeKeymapStyle(style);
  if (s === 'default') return [];
  if (s === 'vim') {
    ensureVimUndoBridge();
    registerVimExCommands();
    installVimBindings(vimOptions());
    return [Prec.highest([
      vimPendingSnapshot(), ...vim(), vimEditGuard(), vimChromeTheme(), vimSlotAttacher(),
    ])];
  }
  if (s === 'emacs') {
    ensureEmacsUndoBridge();
    ensureEmacsKeys();
    installEmacsBindings();
    return [Prec.highest([...emacs(), emacsChainGuard(), emacsChromeTheme()])];
  }
  return [];
}
