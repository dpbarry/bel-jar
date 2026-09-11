/**
 * The keys each style presses to record and replay a macro — as data, so the
 * code that BINDS them and every surface that NAMES them read one source.
 *
 * ⛔ This exists because of a question a user had to ask out loud: *"how do you
 * stop recording?"* REC was on the bar, and nothing anywhere said what ends it.
 * The keys were known — `installMacroBindings` maps them, `CX_MAP` lists them —
 * but only to the code that pressed them into the packages, so no surface could
 * repeat the fact without retyping it, and a retyped key is one package bump
 * away from being a lie. Available Keys, the strip's REC chip and the message
 * that starts a recording now all read from here.
 *
 * ⚠ A LEAF. Nothing here imports the setup modules that use it: `vim-setup`
 * imports `macro-engine`, so a hint that lived in either would close a cycle
 * around the engine.
 */
import { readableEmacsKey } from './emacs-keys.mjs';

/**
 * ⛔ `<register>` is the PACKAGE'S grammar, not a key. `Vim.mapCommand` expands
 * it into "one keystroke, handed to the action as `selectedCharacter`", which is
 * how `qa` and `@a` name a register. It has to be written this way where it is
 * mapped, and must never be printed that way — see `VIM_MACRO_ROWS`.
 */
export const VIM_MACRO_KEYS = {
  record: 'q<register>',
  /**
   * Bare `q` ends a recording, and it is armed only while one is running.
   * Vi's own rule, and the reason `stop` is separate from `record`: the package
   * used to intercept it inside `handleKey`, which our engine never enters.
   */
  stop: 'q',
  replay: '@<register>',
};

/** Emacs' kmacro keys. `C-x (` and `C-x )` are two faces of one toggle. */
export const EMACS_MACRO_KEYS = {
  record: 'C-x (',
  stop: 'C-x )',
  replay: 'C-x e',
};

/**
 * How Vim's macro keys read in a LIST, where `<register>` would be noise.
 *
 * Vim's own documentation writes the register as a brace class (`q{0-9a-zA-Z"}`);
 * `{reg}` is that, short enough for a keys column.
 */
export const VIM_MACRO_ROWS = [
  ['q{reg}', 'macro.record'],
  ['@{reg}', 'macro.replay'],
];

/**
 * Pure: the key that ENDS a recording in `style`, spelled for a reader.
 *
 * Standard has no macro key of its own — there is no cross-editor convention to
 * borrow and inventing one is how a keymap starts fighting the user's — so it
 * answers with whatever the user has bound, and '' when that is nothing. A
 * caller that gets '' must offer another way out rather than name a key.
 */
export function macroStopLabel(style, boundChord) {
  if (style === 'vim') return VIM_MACRO_KEYS.stop;
  if (style === 'emacs') return readableEmacsKey(EMACS_MACRO_KEYS.stop);
  return String(boundChord || '').trim();
}
