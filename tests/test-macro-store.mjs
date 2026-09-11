// Keyboard-macro registers, and the two pure rules the engine leans on.
//
// ⛔ ONE engine for all three editing styles — the rule undo already lives by.
// Before it, macros existed only in Vim because only Vim's package shipped
// them, and Emacs' `C-x (` did nothing at all.
import {
  createMacroStore, registerName, registerLabel, isVimRegister, DEFAULT_REGISTER, KEY_CAP,
} from '../js/editor-src/ide/macro-store.mjs';
import { keyRecord, isTypedCharacter } from '../js/editor-src/ide/macro-engine.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── register naming ──────────────────────────────────────────────────────────
// Vim names registers a–z/0–9; Emacs and Standard have none. The default name
// is deliberately something vim cannot type, so the two schemes never collide.
expect(isVimRegister('a') && isVimRegister('Z') && isVimRegister('7'), 'vim registers are a-zA-Z0-9');
expect(!isVimRegister('') && !isVimRegister('ab') && !isVimRegister('@'), 'nothing else is one');
expect(registerName('a') === 'a', 'a vim register is kept');
expect(registerName('') === DEFAULT_REGISTER, 'everything else lands in the default');
expect(!isVimRegister(DEFAULT_REGISTER),
  'and the default is a name vim CANNOT type, so `q<default>` can never collide with it');
expect(registerLabel('a') === '@a', 'vim names the register in the strip');
expect(registerLabel(DEFAULT_REGISTER) === '', 'Emacs and Standard have none to name');

// ── the store carries the STYLE, not just the keys ───────────────────────────
// A keystroke only means something inside the keymap it was pressed in: `j` in
// Vim's Normal mode is a motion, and the letter j anywhere else.
{
  const s = createMacroStore();
  s.set('a', [{ key: 'j' }], 'vim');
  expect(s.get('a').style === 'vim', 'the style is stored with the keys');
  expect(s.get('a').keys.length === 1, 'and so are the keys');
  expect(s.last() === 'a', 'recording sets the register `@@` repeats');
  s.set('b', [{ key: 'x' }], 'emacs');
  expect(s.last() === 'b', 'and the newest wins');
  s.touch('a');
  expect(s.last() === 'a', 'replaying sets it too');
  s.set('a', [], 'vim');
  expect(s.get('a') === null, 'an empty recording clears the register');
  expect(s.names().join(',') === 'b', 'and leaves the others alone');
}

// A stuck key is not a macro.
{
  const s = createMacroStore();
  s.set('a', new Array(KEY_CAP + 500).fill({ key: 'x' }), 'vim');
  expect(s.get('a').keys.length === KEY_CAP, 'a register is capped');
}

// ── what gets recorded, and what gets inserted on replay ─────────────────────
{
  const rec = keyRecord({ key: 'j', code: 'KeyJ', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false });
  expect(rec.key === 'j' && rec.code === 'KeyJ' && rec.ctrl === true && rec.shift === false,
    'a keystroke is recorded with its modifiers', JSON.stringify(rec));

  // ⛔ Only a key the BROWSER would have typed may be inserted when no style
  // claimed it. A modified chord nobody handled is a chord that does nothing,
  // not a character — inserting it would put `s` in the buffer for every
  // unhandled Ctrl+S.
  expect(isTypedCharacter({ key: 'a' }), 'a bare letter is typed text');
  expect(isTypedCharacter({ key: ' ' }), 'so is a space');
  expect(!isTypedCharacter({ key: 'a', ctrl: true }), 'Ctrl+A is not');
  expect(!isTypedCharacter({ key: 'a', meta: true }), 'nor Cmd+A');
  expect(!isTypedCharacter({ key: 'a', alt: true }), 'nor Alt+A');
  expect(!isTypedCharacter({ key: 'Enter' }), 'nor a named key');
  expect(!isTypedCharacter({ key: 'ArrowDown' }), 'nor a motion key');
  expect(isTypedCharacter({ key: 'A', shift: true }), 'but Shift+a IS the character A');
}

console.log('OK macro store (registers, per-style keys, what replay may insert)');
