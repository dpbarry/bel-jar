/**
 * Everything that makes Emacs work in BelJar.
 *
 * The package gives us the key table and the handler; this supplies the four
 * things it cannot know about — the chords Chromium eats and what BelJar answers
 * instead, the pending-chain badge and which-key, the guard that stops a dead
 * chain reaching the browser, and the caret chrome.
 *
 * ⛔ Read the laws in the doc comments below before changing any of it. Every one
 * was bought with a bug: a substitute that named another reserved chord, a
 * `C-x C-g` that opened Chrome's find bar, two carets stacked in one place.
 */
import { Prec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cursorLineDown, selectLineDown, transposeChars } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { EmacsHandler, emacsKeys } from '@replit/codemirror-emacs';
import { emacsMaps } from './which-key.mjs';
import { _pure as emacsBindings } from './emacs-setup.mjs';
import { beljarUndo, beljarRedo } from './undo-route.mjs';
import { whichKeyHint, WHICH_KEY_MS } from './which-key-hint.mjs';

let bridged = false;
let emacsKeysBound = false;

/**
 * The chords the browser eats, and what BelJar answers to instead.
 *
 * ⛔ Every one of these is a promise `BROWSER_RESERVED_PC` already makes in the
 * Keybindings sheet. A substitute the sheet names and no layer binds is the same
 * lie as advertising a chord the browser will eat — and harder to spot, because
 * the sheet reads correct. `C-m` was bound; `M-t` and `C-q` were printed for
 * weeks and answered to nothing. `probe-keymap.mjs` presses all three.
 *
 * ⚠ Keep this table and `BROWSER_RESERVED_PC` in step. The probe fails if a
 * substitute named there does nothing here.
 */
export const EMACS_SUBSTITUTES = [
  // Ctrl+N — new window.
  ['C-m', { command: 'goOrSelect', args: [cursorLineDown, selectLineDown] }],
  // Ctrl+T — new tab. `M-t` is in the package's own "todo" list, unbound.
  ['M-t', transposeChars],
  // Ctrl+W AND Ctrl+Shift+W — close tab. Both spellings of kill-region are
  // reserved, so without this the single most-used Emacs edit is unreachable.
  ['C-q', 'killRegion'],
];

/** Kept for the reserved-chord sheet and the tests that name it. */
export const EMACS_LINE_DOWN_KEY = 'C-m';

/**
 * Replit's emacs package registers keys at module load behind @__PURE__ bindKey calls;
 * esbuild minify drops them. Re-bind here so C-f/C-n/etc. actually work.
 */
export function ensureEmacsKeys() {
  if (emacsKeysBound) return;
  emacsKeysBound = true;
  for (const spec of Object.keys(emacsKeys)) {
    EmacsHandler.bindKey(spec, emacsKeys[spec]);
  }
  applyBeljarEmacsOverrides();
}

/** Win/Linux browser chords that cannot be overridden in-page. */
export function applyBeljarEmacsOverrides() {
  for (const [spec, action] of EMACS_SUBSTITUTES) EmacsHandler.bindKey(spec, action);
  // `M-x` is bound to `focusCommandLine`, which calls this method — and the
  // package ships it as `console.error("TODO")`. Implementing it IS M-x.
  EmacsHandler.prototype.showCommandLine = function showCommandLine() {
    const g = typeof window !== 'undefined' ? window : globalThis;
    if (g.StatusStrip && typeof g.StatusStrip.openCommandLine === 'function') {
      // `M-x` is not `:`; the prompt says which line you are on.
      g.StatusStrip.openCommandLine('', { prompt: 'M-x' });
    }
  };
  reportEmacsChain();
}

/**
 * The Emacs pending prefix in the mode badge — the same thing Vim's `2d` gets.
 *
 * ⛔ `$data.keyChain` is a package internal and there is no public hook for it.
 * `handleKeyboard` IS on the prototype, so wrapping it is the least fragile way
 * in: no plugin instance to reach for, no private field to guess at. Guarded so
 * a version bump degrades to "no badge" instead of throwing, and
 * `tests/test-emacs-setup.mjs` asserts the shape so a bump fails loudly rather
 * than silently dropping the feature.
 */
let emacsChainReported = false;
/** The handler that last saw a key, so the delayed hint can re-check the chain. */
let lastEmacsHandler = null;
let emacsWhichKeyTimer = 0;
let emacsWhichKeyShown = false;
/** `$data.keyChain` as it was when the current keydown arrived. */
let emacsChainAtKeydown = '';

/**
 * Is the Emacs mark set?
 *
 * ⛔ Not "is there a selection". `C-Space` sets the mark with the caret where it
 * is and nothing selected — which is precisely the state worth announcing, since
 * the next motion will select. Once text IS selected you can see it, and the
 * badge is telling you what your eyes already know.
 */
export function emacsMarkSet() {
  return !!(lastEmacsHandler && lastEmacsHandler.$emacsMark);
}

/**
 * A key that ends a chain going nowhere must still be swallowed.
 *
 * ⛔ The package's keydown handler is `return !!result`, so an UNMATCHED second
 * key reports "not handled" and Chrome gets it: `C-x C-g` opened the browser's
 * find bar. `C-g` is bound to `keyboardQuit`, but once `keyChain` is `C-x` the
 * lookup becomes `C-x C-g`, which is not.
 *
 * Registered AFTER `emacs()`, so it only ever sees keys the handler declined —
 * and only fires when a chain was pending, because a bare unbound chord must
 * still reach BelJar's own global keymap.
 */
export function emacsChainGuard() {
  return EditorView.domEventHandlers({
    keydown() {
      const pending = emacsChainAtKeydown;
      emacsChainAtKeydown = '';
      if (!pending) return false;
      // The chain is over either way; take the hint down with it.
      scheduleEmacsWhichKey('');
      return true;
    },
  });
}

/**
 * Say what `C-x` or `C-c` can become, after the same pause Vim's prefixes get.
 * Cancelled the moment the chain changes, so typing a chain fluently is silent.
 */
function scheduleEmacsWhichKey(chain) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  if (emacsWhichKeyTimer) clearTimeout(emacsWhichKeyTimer);
  emacsWhichKeyTimer = 0;
  if (!chain) {
    // The chain ended — take the hint down with it, but never touch a message
    // somebody else put there.
    if (emacsWhichKeyShown && g.StatusStrip && g.StatusStrip.hideKeyHints) g.StatusStrip.hideKeyHints();
    emacsWhichKeyShown = false;
    return;
  }
  emacsWhichKeyTimer = setTimeout(() => {
    emacsWhichKeyTimer = 0;
    const still = lastEmacsHandler && lastEmacsHandler.$data
      ? lastEmacsHandler.$data.keyChain || '' : '';
    if (still !== chain) return;
    const rows = emacsWhichKeyHint(chain);
    if (!rows.length || !g.StatusStrip || !g.StatusStrip.showKeyHints) return;
    emacsWhichKeyShown = g.StatusStrip.showKeyHints(rows);
  }, WHICH_KEY_MS);
}

export function reportEmacsChain() {
  if (emacsChainReported) return false;
  const proto = EmacsHandler.prototype;
  if (!proto || typeof proto.handleKeyboard !== 'function') return false;
  emacsChainReported = true;
  const original = proto.handleKeyboard;
  proto.handleKeyboard = function beljarHandleKeyboard() {
    // The chain as it stood when the key ARRIVED. The package clears it while
    // handling, so after the call there is no way to tell that this keystroke
    // was the second half of a chain.
    emacsChainAtKeydown = (this.$data && this.$data.keyChain) || '';
    const out = original.apply(this, arguments);
    try {
      lastEmacsHandler = this;
      const data = this.$data || {};
      // A universal argument is pending state too: `C-u 4` should show as 4.
      const chain = data.keyChain || (data.count ? String(data.count) : '');
      const g = typeof window !== 'undefined' ? window : globalThis;
      const B = g.StatusStrip;
      // ⛔ The mark rides here, not on the editor's update listener. `C-Space`
      // sets it without moving the caret or touching the document, so the
      // listener's "did anything change" guard returns before it can be read.
      if (B && B.setEditorState) B.setEditorState({ pending: chain, mark: emacsMarkSet() });
      // Only a real chain has continuations; a count has none.
      scheduleEmacsWhichKey(data.keyChain || '');
    } catch (_) { /* the badge must never break a keystroke */ }
    return out;
  };
  return true;
}

/** What `reportEmacsChain` depends on, so a package bump fails in a test. */
export function emacsChainShape() {
  const proto = EmacsHandler.prototype;
  return {
    hasHandleKeyboard: !!proto && typeof proto.handleKeyboard === 'function',
    hasFindCommand: !!proto && typeof proto.findCommand === 'function',
  };
}

export function emacsKeysReady() {
  return emacsKeysBound;
}

/**
 * Emacs' undo, redo and incremental search.
 *
 * ⛔ `C-s` is a real incremental search in the status strip, not the find
 * PANEL: a panel cannot put the caret back where it started when you press
 * `C-g`, and that is the half of `C-s` that matters.
 */
export function ensureEmacsUndoBridge() {
  if (bridged) return;
  bridged = true;
  EmacsHandler.bindKey('C-/|C-x u|S-C--|C-z', (view) => {
    beljarUndo(view);
  });
  EmacsHandler.bindKey('S-C-/|S-C-x u|C--|S-C-z', (view) => {
    beljarRedo(view);
  });
  // Real incremental search in the bar: type to match live, C-s/C-r to step,
  // C-g or Escape to abort back to where you were. A find PANEL cannot do the
  // last part, which is the half of `C-s` that matters.
  EmacsHandler.bindKey('C-s', (view) => {
    const g = typeof window !== 'undefined' ? window : globalThis;
    if (g.StatusStrip && g.StatusStrip.openSearchLine) g.StatusStrip.openSearchLine(true);
    else openSearchPanel(view);
  });
  EmacsHandler.bindKey('C-r', (view) => {
    const g = typeof window !== 'undefined' ? window : globalThis;
    if (g.StatusStrip && g.StatusStrip.openSearchLine) g.StatusStrip.openSearchLine(false);
    else openSearchPanel(view);
  });
}

export function emacsChromeTheme() {
  return Prec.highest(EditorView.theme({
    '.cm-emacsMode .cm-vimCursorLayer': { display: 'none !important' },
    '.cm-emacsMode .cm-cursorLayer:not(.cm-vimCursorLayer)': { display: 'block !important' },
    // ⛔ Do NOT set `caret-color` here. `drawSelection()` draws the caret itself
    // and keeps the native one transparent; colouring it back in put TWO carets
    // in the same place, which reads as a fatter cursor in Vim and Emacs while
    // Standard looked right. Style the drawn one only.
    '.cm-emacsMode .cm-cursor, .cm-emacsMode .cm-dropCursor': {
      borderLeftColor: 'var(--accent-high) !important',
    },
    '.cm-emacsMode .cm-fat-cursor': { display: 'none !important' },
  }));
}

/** Emacs gets the same hint Vim does — `C-x` and `C-c` are prefixes too. */
export function emacsWhichKeyHint(chain) {
  return whichKeyHint(chain, emacsMaps(emacsBindings.CX_MAP, emacsBindings.CC_MAP));
}
