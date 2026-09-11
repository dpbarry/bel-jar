/**
 * Keyboard macros — ONE implementation, all three editing styles.
 *
 * ⛔ This is the same rule undo already lives by. `COMMANDS.md`: *"Undo and redo
 * have exactly one owner."* BelJar owns the history and BOTH packages' undo keys
 * are re-pointed at it (`ensureVimUndoBridge`, `ensureEmacsUndoBridge`). Macros
 * are the same shape of thing — a cross-cutting facility, not part of any one
 * style's editing model — and until now only Vim had them, because only Vim's
 * package shipped them. Emacs' `C-x (` did nothing at all.
 *
 * ## Why keystrokes, and why at the DOM
 *
 * A macro replays what you TYPED. It is not a list of commands: the `w` of `dw`
 * is an operator argument, and the literal characters of an insert are not
 * commands at all, so nothing in the registry can stand in for them.
 *
 * The vim package records at the VIM KEY level, which is why it needs a second
 * channel (`insertModeChanges`) glued alongside — insert-mode typing never
 * passes through its `handleKey`. Recording at the DOM instead removes that
 * whole problem: insert-mode text is just more keydowns. One channel, and the
 * same one for every style.
 *
 * ## Replay
 *
 * Each recorded key is offered to the style that is loaded, through that style's
 * own public entry point, and inserted by us only if nothing claimed it:
 *
 *   vim       `Vim.vimKeyFromEvent` → `Vim.handleKey(cm, key, 'macro')`
 *   emacs     `EmacsHandler.handleKeyboard(event)`
 *   standard  `runScopeHandlers(view, event, 'editor')`
 *
 * That last step is what makes typing work: in Vim's Insert mode and in Standard
 * a printable key is unhandled and the BROWSER would normally insert it — and a
 * synthetic event is untrusted, so the browser will not. Emacs is the exception
 * and needs no help: its handler maps a bare printable key to `insertstring`
 * itself, so claiming it is correct and inserting again would double it.
 *
 * ⚠ A replayed key that starts ASYNC work (a prover move, a check) is not
 * awaited — the same limitation vim's own macro has, for the same reason.
 */
import { ViewPlugin, runScopeHandlers } from '@codemirror/view';
import { Vim, getCM } from '@replit/codemirror-vim';
import { activeEmacsHandler } from './modal/emacs-runtime.mjs';
import { normalizeKeymapStyle } from './modal/style-policy.mjs';
import { handleVimCaretKey } from './modal/vim-caret.mjs';
import { createMacroStore, registerName, registerLabel, KEY_CAP } from './macro-store.mjs';
import { macroStopLabel } from './modal/macro-keys.mjs';

/** A replay that goes this deep is recursing; stop rather than hang the tab. */
const MAX_DEPTH = 32;
/** Total keys one replay may feed, however many repeats were asked for. */
const MAX_KEYS = 20000;

const store = createMacroStore();

/** `{ name, keys }` while recording, else null. */
let recording = null;
/** Depth of the replay we are inside; 0 when not replaying. */
let depth = 0;
let overrun = false;

function globalRef() {
  return typeof window !== 'undefined' ? window : globalThis;
}

function say(text) {
  const B = globalRef().StatusStrip;
  if (B && typeof B.setMessage === 'function') B.setMessage(text);
}

/**
 * Tell the strip what to show; recording is a STATE, not an event.
 *
 * ⛔ The STOP KEY travels with the state. The strip cannot work it out: the
 * keys live in the style modules on this side of the bundle seam, and a shell
 * copy of them is a copy that goes stale on a package bump. Sending it means the
 * REC chip can say how to end what it is reporting — which it could not, and a
 * user had to ask.
 */
function publish() {
  const B = globalRef().StatusStrip;
  if (!B || typeof B.setEditorState !== 'function') return;
  B.setEditorState({
    macro: recording
      ? { recording: true, label: registerLabel(recording.name), stop: stopKey() }
      : null,
  });
}

/** The key that ends the recording now running, or '' if nothing is bound. */
function stopKey() {
  const C = globalRef().Commands;
  let bound = '';
  try {
    bound = C && typeof C.liveChord === 'function' ? C.liveChord('macro.record') : '';
  } catch (_) { /* an unbound command is the same answer as a missing registry */ }
  return macroStopLabel(styleNow(), bound);
}

function styleNow() {
  const p = globalRef().Persist;
  try {
    return normalizeKeymapStyle(p && p.readStoredKeymapStyle ? p.readStoredKeymapStyle() : '');
  } catch (_) {
    return 'default';
  }
}

const STYLE_NAMES = { default: 'Standard', vim: 'Vim', emacs: 'Emacs' };

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'OS', 'CapsLock', 'Dead']);

/** Pure: the compact record kept for one keystroke. Exported for tests. */
export function keyRecord(e) {
  return {
    key: e.key,
    code: e.code || '',
    ctrl: !!e.ctrlKey,
    alt: !!e.altKey,
    shift: !!e.shiftKey,
    meta: !!e.metaKey,
  };
}

/**
 * Pure: would the BROWSER have inserted this key as text?
 *
 * Only then may we insert it ourselves when no style claimed it. A modified
 * chord that nothing handled is a chord that does nothing, not a character.
 */
export function isTypedCharacter(k) {
  return !!k && typeof k.key === 'string' && k.key.length === 1
    && !k.ctrl && !k.meta && !k.alt;
}

// ── recording ────────────────────────────────────────────────────────────────

/**
 * ⛔ Registered on `contentDOM` at CAPTURE, not as a CodeMirror handler.
 *
 * Vim and Emacs both sit at `Prec.highest` and consume what they match, and a
 * CodeMirror `domEventHandlers` entry never runs once a higher one has returned
 * true — so a recorder wired that way would have missed exactly the keys worth
 * recording. Capture on the DOM node sees every keystroke before any of them,
 * and never consumes anything.
 */
export function macroRecorder() {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.onKey = (e) => noteKey(e);
      view.contentDOM.addEventListener('keydown', this.onKey, true);
    }

    destroy() {
      this.view.contentDOM.removeEventListener('keydown', this.onKey, true);
      // The buffer these keys were meant for is going away with the editor.
      abortRecording();
    }
  });
}

function noteKey(e) {
  if (!recording || depth > 0) return;
  if (e.isComposing || MODIFIER_KEYS.has(e.key)) return;
  if (recording.keys.length >= KEY_CAP) {
    const name = recording.name;
    recording = null;
    publish();
    say(`Macro ${registerLabel(name) || 'recording'} stopped: too many keys.`);
    return;
  }
  recording.keys.push(keyRecord(e));
}

export function isRecording() {
  return !!recording;
}

export function recordingRegister() {
  return recording ? recording.name : '';
}

export function startRecording(name) {
  if (recording) return false;
  recording = { name: registerName(name), keys: [], style: styleNow() };
  publish();
  const label = registerLabel(recording.name);
  const stop = stopKey();
  // ⛔ Say how it ENDS, here, once. Everything else about a recording is
  // visible on the bar; the way out of it is the one fact that was nowhere.
  say(`recording${label ? ' ' + label : ''}, ${stop ? `press ${stop}` : 'click REC'} to stop`);
  return true;
}

/**
 * Stop, keeping everything but the keystrokes that asked us to stop.
 *
 * ⛔ `dropTrailing` is not a fudge. The recorder is on capture, so the chord
 * that ENDS a recording is seen before the command it triggers runs — vim's `q`
 * is one keystroke, Emacs' `C-x )` is two. The caller knows which it was; the
 * recorder cannot.
 */
export function stopRecording(dropTrailing = 0) {
  if (!recording) return false;
  const { name, keys, style } = recording;
  recording = null;
  const kept = dropTrailing > 0 ? keys.slice(0, Math.max(0, keys.length - dropTrailing)) : keys;
  store.set(name, kept, style);
  publish();
  const label = registerLabel(name);
  say(kept.length
    ? `recorded ${kept.length} key${kept.length === 1 ? '' : 's'}${label ? ' into ' + label : ''}`
    : 'nothing recorded');
  return true;
}

/** One command for both edges, so a toggle chord and a pair both work. */
export function toggleRecording(name, dropTrailing = 0) {
  return recording ? stopRecording(dropTrailing) : startRecording(name);
}

/**
 * Throw the recording away — the editor or the keymap under it has gone.
 *
 * ⛔ Not `stopRecording`. Half a macro, saved, is worse than none: recording in
 * Vim and then switching to Emacs used to leave the recording live, so the next
 * `C-x (` STOPPED it and filed a sequence of vim Normal-mode keys under `@a`.
 * Keystrokes only mean something inside the keymap they were pressed in.
 */
export function abortRecording(why) {
  if (!recording) return false;
  recording = null;
  publish();
  if (why) say(why);
  return true;
}

// ── replay ───────────────────────────────────────────────────────────────────

function syntheticEvent(k) {
  const init = {
    key: k.key,
    code: k.code || '',
    ctrlKey: k.ctrl,
    altKey: k.alt,
    shiftKey: k.shift,
    metaKey: k.meta,
    bubbles: true,
    cancelable: true,
  };
  const g = globalRef();
  if (typeof g.KeyboardEvent === 'function') {
    try {
      return new g.KeyboardEvent('keydown', init);
    } catch (_) { /* fall through to the plain object */ }
  }
  return Object.assign({
    type: 'keydown',
    isComposing: false,
    preventDefault() {},
    stopPropagation() {},
  }, init);
}

function feedVim(view, event) {
  const cm = getCM(view);
  if (!cm) return false;
  // ⛔ The caret layer FIRST, exactly as a real keypress meets it. It is a DOM
  // handler ahead of the package, and `Vim.handleKey` below skips every DOM
  // listener — so without this a recorded `l` at the end of a line would wrap
  // when pressed and clamp when replayed.
  if (handleVimCaretKey(view, event)) return true;
  const key = Vim.vimKeyFromEvent(event, cm.state && cm.state.vim);
  if (!key) return false;
  // `handleKey` answers `undefined` when nothing matched — including a bare
  // printable key in Insert mode, which is exactly when we must insert it.
  return Vim.handleKey(cm, key, 'macro') !== undefined;
}

function feedEmacs(view, event) {
  const handler = activeEmacsHandler();
  if (!handler || typeof handler.handleKeyboard !== 'function') return false;
  return !!handler.handleKeyboard(event);
}

function feedKey(view, style, k) {
  const event = syntheticEvent(k);
  let handled = false;
  try {
    if (style === 'vim') handled = feedVim(view, event);
    else if (style === 'emacs') handled = feedEmacs(view, event);
    else handled = !!runScopeHandlers(view, event, 'editor');
  } catch (_) {
    // One key that throws must not abandon the rest of the macro.
    handled = false;
  }
  if (handled || !isTypedCharacter(k)) return;
  view.dispatch(view.state.replaceSelection(k.key), {
    userEvent: 'input.type',
    scrollIntoView: true,
  });
}

/**
 * Replay `name` `count` times. Returns false when there is nothing to replay.
 *
 * ⛔ Bounded twice — by depth and by total keys. A macro that replays itself is
 * legal in vi and useful, and it is also the shortest route to a hung tab.
 */
export function replayMacro(view, name, count = 1) {
  if (!view) return false;
  const want = registerName(name === '@' ? store.last() : name);
  const entry = store.get(want);
  if (!entry || !entry.keys.length) {
    say(registerLabel(want) ? `${registerLabel(want)} is empty.` : 'No macro recorded yet.');
    return false;
  }
  const style = styleNow();
  // ⛔ Refuse rather than corrupt. `j` from a Vim recording is a MOTION there
  // and the letter j anywhere else; replaying it into the wrong keymap types
  // gibberish into the buffer and calls it a macro.
  if (entry.style !== style) {
    say(`That macro was recorded in ${STYLE_NAMES[entry.style] || entry.style}.`);
    return false;
  }
  const keys = entry.keys;
  if (depth >= MAX_DEPTH) {
    overrun = true;
    return false;
  }
  store.touch(want);
  const times = Math.max(1, Math.floor(count) || 1);
  const top = depth === 0;
  if (top) overrun = false;
  depth += 1;
  try {
    let budget = MAX_KEYS;
    for (let i = 0; i < times; i += 1) {
      for (const k of keys) {
        if (budget-- <= 0) { overrun = true; return true; }
        feedKey(view, style, k);
      }
    }
  } finally {
    depth -= 1;
    if (top && overrun) say('Macro stopped: it ran too long.');
  }
  return true;
}

export function isReplaying() {
  return depth > 0;
}

/** For tests and for the surfaces that list what exists. */
export const _macroStore = store;
export const _pure = { keyRecord, isTypedCharacter };
