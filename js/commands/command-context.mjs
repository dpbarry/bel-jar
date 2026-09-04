/**
 * Command context — which surface owns the keyboard right now, and under which
 * editing style. One resolver, so dispatch decisions stop being re-derived by
 * every caller from its own `closest()` probe.
 *
 * Every lookup is defensive: this runs inside `keybindings.js` under `vm` in
 * tests, where `document` may be a stub or absent entirely.
 */

const SCOPE_SELECTORS = [
  ['editor', '.cm-editor'],
  ['repl', '#command-input, .repl-log, .repl-stream'],
  ['harpoon', '#harpoon-panel'],
  ['explorer', '#explorer-panel, .explorer-tree'],
];

function doc(given) {
  if (given) return given;
  return typeof document !== 'undefined' ? document : null;
}

function activeElement(given) {
  const d = doc(given);
  return d && d.activeElement ? d.activeElement : null;
}

function closestFrom(el, selector) {
  if (!el || typeof el.closest !== 'function') return null;
  try {
    return el.closest(selector);
  } catch (_) {
    return null;
  }
}

/** `default` | `vim` | `emacs`, from stored settings. */
export function editingStyle() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const p = g.Persist;
  try {
    const v = p && typeof p.readStoredKeymapStyle === 'function' ? p.readStoredKeymapStyle() : '';
    return v === 'vim' || v === 'emacs' ? v : 'default';
  } catch (_) {
    return 'default';
  }
}

/** True when focus is inside a Beluga editor running the Emacs keymap. */
export function isEmacsEditorFocused(given) {
  const ed = closestFrom(activeElement(given), '.cm-editor');
  if (!ed || typeof ed.querySelector !== 'function') return false;
  try {
    return !!ed.querySelector('.cm-emacsMode');
  } catch (_) {
    return false;
  }
}

/** True when focus is inside a Beluga editor running the Vim keymap. */
export function isVimEditorFocused(given) {
  const scroller = closestFrom(activeElement(given), '.cm-scroller');
  return !!(scroller && scroller.classList && scroller.classList.contains('cm-vimMode'));
}

/** `editor` | `repl` | `harpoon` | `explorer` | `global`. */
export function activeScope(given) {
  const el = activeElement(given);
  if (!el) return 'global';
  for (const [scope, selector] of SCOPE_SELECTORS) {
    if (closestFrom(el, selector)) return scope;
  }
  return 'global';
}

/**
 * The object handed to a command's `run` / `when`. Callers merge in whatever
 * they own (view, editor, selection, parsed args); this fills the ambient part.
 */
export function buildContext(extra) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const base = {
    scope: activeScope(),
    style: editingStyle(),
    emacsFocused: isEmacsEditorFocused(),
    vimFocused: isVimEditorFocused(),
    editor: g.CurrentEditor || null,
  };
  return extra ? Object.assign(base, extra) : base;
}
