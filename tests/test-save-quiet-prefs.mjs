import assert from 'node:assert';
import {
  trimTrailingWhitespace,
  isBelSavePath,
} from '../js/editor-src/ide/save-transforms.mjs';
import {
  isQuietTypingActive,
  quietWhileTypingEnabled,
} from '../js/editor-src/ide/quiet-typing.mjs';

assert.equal(trimTrailingWhitespace('a  \nb\t\n'), 'a\nb\n');
assert.equal(trimTrailingWhitespace('a  \nb\t'), 'a\nb');
assert.equal(trimTrailingWhitespace(''), '');
assert.equal(trimTrailingWhitespace('notrail'), 'notrail');

assert.equal(isBelSavePath('foo.bel'), true);
assert.equal(isBelSavePath('grp/bar.bel'), true);
assert.equal(isBelSavePath('suite.cfg'), false);
assert.equal(isBelSavePath('lib.elf'), false);
assert.equal(isBelSavePath('orphan'), true);

{
  const prev = globalThis.Persist;
  globalThis.Persist = { readStoredQuietWhileTyping: () => true };
  assert.equal(quietWhileTypingEnabled(), true);
  const eng = { isSettledFor: (v) => v === 2 };
  assert.equal(isQuietTypingActive(eng, 1), true);
  assert.equal(isQuietTypingActive(eng, 2), false);
  globalThis.Persist = { readStoredQuietWhileTyping: () => false };
  assert.equal(isQuietTypingActive(eng, 1), false);
  globalThis.Persist = prev;
}

console.log('OK save-transforms / quiet-typing');
