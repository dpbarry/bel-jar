/**
 * BelJar's caret rule, applied to Vim's Normal mode: the caret is a CARET.
 *
 * ## The opinion
 *
 * BelJar does not draw Vim's block cursor. `vimChromeTheme()` has hidden
 * `.cm-fat-cursor` and `.cm-vimCursorLayer` since modal editing shipped, so
 * every mode shows the same thin caret as the rest of the editor — "Vim looks
 * like the rest of the editor instead of like a second editor".
 *
 * That decision was only ever half made. The MOTION still behaved as though the
 * block were there:
 *
 *   · `l` / `→` stopped ON the last character, because a block cursor covers a
 *     cell and there is no cell after the last one.
 *   · `h` / `←` and `l` / `→` never crossed a line boundary.
 *   · `End` landed on the last character too — the package maps it to `$`.
 *
 * A thin caret that cannot reach the end of its own line is not a style choice,
 * it is two designs disagreeing on screen. This finishes the decision.
 *
 * ## Where the line is drawn
 *
 * ⛔ **Moving the caret moves a real caret — one press or with a count, letters
 * or arrows, plus `End`. Vi's TARGET vocabulary keeps vi's meaning.**
 *
 * `$`, `0`, `w`, `b`, `e` are not caret keys, they are what vi commands are
 * built out of: `d$`, `2dw`, and above all `$x` — delete the last character of a
 * line — all mean what they mean because those keys land where vi puts them.
 * With `dl` there is pending state that says a command is being built, so this
 * layer can stand aside; with `$x` there is none, because the two commands run
 * separately. A key whose vi meaning cannot be told apart from a caret move is
 * left to vi.
 *
 * ## Why it cannot be a vim option
 *
 * Real vi has exactly the two knobs for this — `virtualedit=onemore` and
 * `whichwrap` — and `@replit/codemirror-vim` ships NEITHER. Its whole option
 * table is `filetype`, `textwidth`, `langmap`, `pcre` and
 * `insertModeEscKeysTimeout`. The rule lives in `clipCursorToContent`, a
 * module-local function applied to the result of every bare motion:
 *
 *     var includeLineBreak = vim.insertMode || vim.visualMode;
 *     var maxCh = text.length - 1 + Number(!!includeLineBreak);
 *
 * Insert and Visual get the extra cell; Normal does not, and the line is clipped
 * to itself so nothing can wrap. There is no hook, and re-pointing the motion
 * with `defineMotion` does not help: the clamp runs on whatever the motion
 * returns.
 *
 * ## So the key is taken BEFORE vim sees it
 *
 * A `domEventHandlers` keydown registered ahead of `vim()` in the same
 * precedence block — the same seam `vimPendingSnapshot` uses — and CodeMirror's
 * own `cursorCharLeft` / `cursorCharRight` / `cursorLineEnd`, which already do
 * the ordinary thing.
 */
import { EditorView } from '@codemirror/view';
import { cursorCharLeft, cursorCharRight, cursorLineEnd } from '@codemirror/commands';
import { CodeMirror, getCM } from '@replit/codemirror-vim';

/** A count so large it can only be a stuck key; nobody means `999999l`. */
const MAX_COUNT = 10000;

/** The keys this owns, and which way they go. */
const CARET_KEYS = {
  ArrowLeft: false,
  ArrowRight: true,
  h: false,
  l: true,
};

/**
 * Pure: would the BROWSER call this a bare caret move?
 *
 * ⛔ A MODIFIER makes it a different key. `Ctrl+l`, `Alt+h` and Shift+arrow are
 * vim's or the browser's; taking them would swallow chords this layer knows
 * nothing about — and `<S-Right>` in particular already extends a selection
 * across lines by falling through to CodeMirror, which is exactly right.
 */
export function caretDirectionFor(event) {
  if (!event || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return null;
  const dir = CARET_KEYS[event.key];
  return dir === undefined ? null : dir;
}

/**
 * Pure: `End`, but NOT `$`.
 *
 * The package maps `<End>` to `$`, so End landed on the last character while
 * every other caret key had just learned to go past it. End is a plain editor's
 * key with no vi idiom built on it, so it follows the caret rule; `$` is vi's
 * target and keeps vi's meaning. See the note at the top of this file.
 */
export function isLineEndKey(event) {
  if (!event || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false;
  return event.key === 'End';
}

/**
 * Pure: is vim mid-command?
 *
 * ⛔ Every field here is a way for a key to mean something other than "move the
 * caret". An operator (`dl`), a half-typed sequence (`gl`), a register (`"al`),
 * a motion count (`d3l`) — take the key in any of those states and the command
 * the user was building is destroyed.
 *
 * A bare PREFIX count is the one exception, handled by `vimPendingCount`: `3l`
 * is not a different kind of thing from `lll`.
 */
export function vimIsMidCommand(vim) {
  if (!vim) return true;
  const is = vim.inputState;
  if (!is) return true;
  return !!(is.operator
    || (is.prefixRepeat && is.prefixRepeat.length)
    || (is.motionRepeat && is.motionRepeat.length)
    || (is.keyBuffer && is.keyBuffer.length)
    || is.registerName
    || vim.status);
}

/**
 * Pure: how many times, when a bare COUNT is the only thing pending.
 *
 * 1 for a clear state, the count for `3l`, null when anything else is going on.
 *
 * ⛔ `3l` has to land where `lll` lands. Leaving counts to vim meant one key
 * moving the caret by two different rules depending on whether a digit came
 * first — one stopping on the last character and the other going past it. That
 * is a worse inconsistency than the one this layer set out to fix.
 *
 * ⚠ `status` must be exactly those digits. It is the pending-key display, so
 * anything else in it means the digits belong to some other command being typed.
 */
export function vimPendingCount(vim) {
  if (!vim || !vim.inputState) return null;
  const is = vim.inputState;
  if (is.operator || is.registerName) return null;
  if (is.motionRepeat && is.motionRepeat.length) return null;
  // ⚠ The digits of `3l` live in the KEY BUFFER while the `3` is still a
  // partial match — `pushRepeatDigit` does not run until the whole command
  // resolves, so `prefixRepeat` is empty at the moment this is asked. Measured
  // in the browser: after pressing `3`, keyBuffer is `['3']` and prefixRepeat
  // is `[]`. Both are read anyway, so a different order cannot make this lie.
  const digits = (is.prefixRepeat || []).join('') + (is.keyBuffer || []).join('');
  const status = vim.status || '';
  if (!digits) return status ? null : 1;
  // A count never starts with 0 — `0` is vi's start-of-line motion.
  if (!/^[1-9][0-9]*$/.test(digits)) return null;
  if (status !== digits) return null;
  const n = parseInt(digits, 10);
  return Math.min(n, MAX_COUNT);
}

/**
 * Hand the command back to vim as finished.
 *
 * ⛔ Mirrors the package's own `clearInputState`, and builds the new state from
 * `inputState.constructor` rather than blanking fields by name — a field the
 * package adds later would otherwise be left stale. The signal is what clears
 * the pending-key display, and the status strip with it.
 */
function endVimCommand(cm) {
  const vim = cm && cm.state ? cm.state.vim : null;
  if (!vim || !vim.inputState) return;
  try {
    vim.inputState = new vim.inputState.constructor();
    vim.expectLiteralNext = false;
    CodeMirror.signal(cm, 'vim-command-done');
  } catch (_) { /* a stale count is better than a thrown keystroke */ }
}

/**
 * Take the key, or say it is not ours. True when the caret moved.
 *
 * ⛔ Exported because a DOM handler is not the only way a vim key arrives. Macro
 * REPLAY calls `Vim.handleKey` directly (`macro-engine.mjs`), which skips every
 * DOM listener — so without this seam a recorded `l` at the end of a line would
 * wrap when you pressed it and clamp when the macro replayed it. A macro that
 * does something other than the keys you typed is worse than no macro.
 */
export function handleVimCaretKey(view, event) {
  const dir = caretDirectionFor(event);
  const lineEnd = dir === null && isLineEndKey(event);
  if (dir === null && !lineEnd) return false;
  const cm = getCM(view);
  const vim = cm && cm.state ? cm.state.vim : null;
  // Insert already behaves. Visual is vi's own selection model — see the foot
  // of this file for why it is left alone.
  if (!vim || vim.insertMode || vim.visualMode) return false;

  if (lineEnd) {
    // No count: `3<End>` is `3$`, three lines down, and that is vi's.
    if (vimIsMidCommand(vim)) return false;
    return !!cursorLineEnd(view);
  }

  const count = vimPendingCount(vim);
  if (count == null) return false;
  const move = dir ? cursorCharRight : cursorCharLeft;
  let moved = false;
  for (let i = 0; i < count; i += 1) {
    if (!move(view)) break;
    moved = true;
  }
  // ⚠ The count is consumed EVEN IF the caret could not move — pressing `3l` at
  // the end of the document must not leave a `3` armed for the next key.
  if (count > 1) endVimCommand(cm);
  return moved || count > 1;
}

export function vimCaretMotion() {
  return EditorView.domEventHandlers({
    keydown(event, view) {
      if (!handleVimCaretKey(view, event)) return false;
      event.preventDefault();
      return true;
    },
  });
}

/**
 * ⚠ VISUAL MODE IS LEFT TO VI, and that is a measurement rather than a shrug.
 *
 * The plain-editor path there is already normal: `<S-Right>` is not in vim's
 * keymap at all, so it falls through to CodeMirror and extends the selection
 * across line boundaries exactly as it does everywhere else — driven in a real
 * editor, the selection went `b` → `bc` → `bcd` → over the boundary.
 *
 * What stops at the line end is `v` then `l`, and vi's visual selection is
 * INCLUSIVE by construction: `v` on one character selects that character, and
 * `makeCmSelection` adds the extra cell that shows it. Wrapping only the motion
 * while leaving that model in place would produce a third behaviour belonging to
 * neither; changing the model would change what every visual operator deletes.
 * So the keys a plain editor has behave plainly, and `v` is vi's.
 */
