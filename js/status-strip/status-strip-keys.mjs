/**
 * The key that ACTUALLY runs undo/redo right now, for the strip's tooltips.
 *
 * Read fresh every time: the style can change while the strip is up, and a
 * stale read here is a wrong instruction, not a cosmetic glitch.
 */
const global = globalThis;

export function liveKeymapStyle() {
  const s = String(global.Settings?.get?.('keymapStyle') || '').toLowerCase();
  return s === 'vim' || s === 'emacs' ? s : 'default';
}

/**
 * Vim's and Emacs' OWN undo/redo keys — not reachable through the Keybindings
 * sheet, so there is no override to read for them.
 *
 * `edit.undo`/`edit.redo` in the catalogue are the STANDARD chord only. Under
 * Vim, Normal-mode undo is the package's own fixed `u` / `Ctrl-R`
 * (`ensureVimUndoBridge` points what they DO at BelJar's history). Under Emacs
 * the bridge binds its own fixed aliases (`ensureEmacsUndoBridge`) — `edit.redo`
 * is policy-`off` there, so the registry chord would name Ctrl+Y, which is yank.
 *
 * ⛔ Emacs shows `Ctrl+Z` / `Ctrl+Shift+Z`, not `C-/`: both pairs are bound, and
 * a browser tab has no frame for `C-z` to suspend, so the hint names what
 * people actually press.
 */
const FIXED_STYLE_SPECS = {
  vim: { 'edit.undo': 'u', 'edit.redo': 'Control+R' },
  emacs: { 'edit.undo': 'Control+Z', 'edit.redo': 'Control+Shift+Z' },
};

export function liveKeyLabel(commandId) {
  const K = global.Keybindings;
  const fixed = FIXED_STYLE_SPECS[liveKeymapStyle()]?.[commandId];
  if (fixed != null) return typeof K?.formatShortcut === 'function' ? K.formatShortcut(fixed) : fixed;
  // Standard: the registry chord, WITH the user's own override if they rebound it.
  try {
    return typeof K?.labelFor === 'function' ? K.labelFor(commandId) || '' : '';
  } catch (_) {
    return '';
  }
}
