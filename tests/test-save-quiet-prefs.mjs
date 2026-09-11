import assert from 'node:assert';
import { EditorState } from '@codemirror/state';
import {
  trimTrailingWhitespace,
  trailingWhitespaceEdits,
  linesUnderSelection,
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

// ⛔ Trim-on-save must not move the caret, and must not eat the space you are
// standing on.
//
// It used to replace the WHOLE document — and a position inside a whole-document
// replacement maps to one end of it, so every autosave that found a stray space
// threw the caret to offset 0. Autosave runs while you type, so switching the
// preference on moved the cursor to line 1 about once a second. Trimming the
// caret's own line is the other half: type `foo `, let the debounce land, and
// the next keystroke gives `foobar`.
{
  const doc = 'rec foo : nat =\nlet x = 1 in   \nbar   \nbaz\n';
  const at = (caret) => EditorState.create({ doc, selection: { anchor: caret, head: caret } });

  // Caret on an untouched line: the trims land and the caret keeps its place.
  const away = at(doc.length - 1);
  const edits = trailingWhitespaceEdits(away.doc, linesUnderSelection(away));
  assert.equal(edits.length, 2, 'both trailing runs are found');
  const after = away.update({ changes: edits });
  assert.equal(after.state.doc.toString(), 'rec foo : nat =\nlet x = 1 in\nbar\nbaz\n');
  assert.notEqual(after.state.selection.main.head, 0, 'the caret is NOT thrown to the top');
  assert.equal(
    after.state.doc.lineAt(after.state.selection.main.head).number,
    away.doc.lineAt(away.selection.main.head).number,
    'the caret stays on its line',
  );

  // Caret on a line with trailing space: that line is left alone.
  const onIt = at(doc.indexOf('\nbar'));
  const kept = trailingWhitespaceEdits(onIt.doc, linesUnderSelection(onIt));
  assert.equal(kept.length, 1, 'the caret line is not trimmed');
  const keptState = onIt.update({ changes: kept });
  assert.ok(keptState.state.doc.toString().includes('let x = 1 in   '),
    'the space under the cursor survives an autosave');
  assert.equal(keptState.state.selection.main.head, onIt.selection.main.head,
    'and the caret does not move');

  // The minimal edits and the pure whole-text trim agree about the result, so
  // the two cannot drift into meaning different things.
  const all = EditorState.create({ doc });
  const full = all.update({ changes: trailingWhitespaceEdits(all.doc) });
  assert.equal(full.state.doc.toString(), trimTrailingWhitespace(doc),
    'minimal edits produce exactly what the pure trim describes');
}

console.log('OK save-transforms / quiet-typing');
