// ⛔ BelJar's caret rule inside Vim's Normal mode: the caret is a CARET.
//
// BelJar has never drawn vim's block cursor — `vimChromeTheme()` hides
// `.cm-fat-cursor` and `.cm-vimCursorLayer` so every mode shows the same thin
// caret as the rest of the editor. The MOTION never followed: `l` stopped ON the
// last character and nothing crossed a line boundary, because the package's
// `clipCursorToContent` gives the extra cell to Insert and Visual only. A thin
// caret that cannot reach the end of its own line is two designs disagreeing on
// screen.
//
// These are the two pure decisions the layer rests on. The MOTION itself is
// gated in `probe:keymap` — it needs a real editor, and the whole point of this
// layer is which keys it declines to take.
import {
  caretDirectionFor, isLineEndKey, vimIsMidCommand, vimPendingCount,
} from '../js/editor-src/ide/modal/vim-caret.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const ev = (over) => ({ key: 'l', ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...over });

// ── which keys are ours ──────────────────────────────────────────────────────
expect(caretDirectionFor(ev({ key: 'l' })) === true, '`l` moves forward');
expect(caretDirectionFor(ev({ key: 'h' })) === false, '`h` moves back');
expect(caretDirectionFor(ev({ key: 'ArrowRight' })) === true, 'and so does the right arrow');
expect(caretDirectionFor(ev({ key: 'ArrowLeft' })) === false, 'and the left one');
expect(caretDirectionFor(ev({ key: 'j' })) === null, 'vertical motion is vim\'s');
expect(caretDirectionFor(ev({ key: 'w' })) === null, 'so is every word motion');

// ⛔ A MODIFIER makes it a different key. `Ctrl+l`, `Alt+h` and Shift+arrow are
// vim's (or the browser's); taking them would swallow chords this layer knows
// nothing about.
for (const mod of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey']) {
  expect(caretDirectionFor(ev({ [mod]: true })) === null, `${mod} makes it not ours`);
  expect(caretDirectionFor(ev({ key: 'ArrowRight', [mod]: true })) === null,
    `${mod} on an arrow makes it not ours`);
}
expect(caretDirectionFor(null) === null, 'and nothing at all is not ours');

// ── ⛔ and ONLY when vim has nothing pending ─────────────────────────────────
// `h` and `l` are also operator motions. `dl`, `2l`, `c3l`, `"ay l` all reach
// these keys, and taking one mid-command destroys the command being built.
const clear = { inputState: { operator: null, prefixRepeat: [], motionRepeat: [], keyBuffer: [], registerName: undefined }, status: '' };
expect(vimIsMidCommand(clear) === false, 'a clear input state is ours to act on');
expect(vimIsMidCommand(null) === true, 'no vim state at all is never ours');
expect(vimIsMidCommand({}) === true, 'nor a vim state with no input state');
expect(vimIsMidCommand({ ...clear, inputState: { ...clear.inputState, operator: 'delete' } }),
  '`dl` \u2014 an operator is pending, so the key is vim\'s');
expect(vimIsMidCommand({ ...clear, inputState: { ...clear.inputState, prefixRepeat: ['2'] } }),
  '`2l` \u2014 a count is pending');
expect(vimIsMidCommand({ ...clear, inputState: { ...clear.inputState, motionRepeat: ['3'] } }),
  '`d3l` \u2014 a motion count is pending');
expect(vimIsMidCommand({ ...clear, inputState: { ...clear.inputState, keyBuffer: ['g'] } }),
  '`gl` \u2014 a sequence is half typed');
expect(vimIsMidCommand({ ...clear, inputState: { ...clear.inputState, registerName: 'a' } }),
  '`"al` \u2014 a register is named');
expect(vimIsMidCommand({ ...clear, status: 'g' }),
  'and a pending status means vim is showing the user a half-typed key');


// ── ⛔ `End`, but NOT `$` ───────────────────────────────────────────
// The package maps `<End>` to `$`, so End landed ON the last character while
// every other caret key had just learned to go past it. End is a plain editor's
// key with no vi idiom built on it. `$` is vi's TARGET — `d$`, `c$` and `$x`
// all mean what they mean because `$` lands on that character, and unlike `dl`
// there is no pending state that could tell `$x` apart from a caret move.
expect(isLineEndKey({ key: 'End' }) === true, '`End` follows the caret rule');
expect(isLineEndKey({ key: 'End', shiftKey: true }) === false, 'but Shift+End is a selection, not ours');
expect(isLineEndKey({ key: 'Home' }) === false, '`Home` already lands where a caret would');
expect(isLineEndKey({ key: '$' }) === false, "and `$` stays vi's");

// ── ⛔ a bare COUNT is not a different kind of thing ────────────────────
// `3l` has to land where `lll` lands. Left to vim, one key moved the caret by
// two different rules depending on whether a digit came first.
//
// ⚠ The digits live in the KEY BUFFER while the count is still a partial match:
// `pushRepeatDigit` does not run until the whole command resolves. Measured in
// the browser — after pressing `3`, keyBuffer is `['3']` and prefixRepeat `[]`.
const withBuf = (buf, extra) => ({ ...clear, status: buf.join(''), inputState: { ...clear.inputState, keyBuffer: buf, ...extra } });
expect(vimPendingCount(clear) === 1, 'a clear state is one move');
expect(vimPendingCount(withBuf(['3'])) === 3, '`3l` is three moves');
expect(vimPendingCount(withBuf(['1', '2'])) === 12, 'and `12l` is twelve');
expect(vimPendingCount(withBuf(['9'.repeat(9)])) === 10000,
  'an absurd count is capped rather than freezing the tab');
expect(vimPendingCount(withBuf(['0'])) === null,
  "`0` is vi's start-of-line motion, never the start of a count");
expect(vimPendingCount(withBuf(['g'])) === null, 'a half-typed sequence is not a count');
expect(vimPendingCount(withBuf(['3'], { operator: 'delete' })) === null,
  "`d3l` is an operator command and stays vi's");
expect(vimPendingCount(withBuf(['3'], { registerName: 'a' })) === null, 'so is `"a3l`');
expect(vimPendingCount({ ...withBuf(['3']), status: 'g3' }) === null,
  'and the status must be exactly the digits — anything else means another command');
expect(vimPendingCount({ ...clear, status: 'g' }) === null, 'a pending prefix is never a bare move');
expect(vimPendingCount(null) === null, 'no state at all is not a count');

console.log('OK vim caret (keys, End vs $, counts, and every way vim can be mid-command)');
