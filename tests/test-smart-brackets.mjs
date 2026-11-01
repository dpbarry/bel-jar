import assert from 'node:assert/strict';
import { EditorState, EditorSelection, Transaction } from '@codemirror/state';
import { history, undo } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { beluga } from '../js/editor-src/language.mjs';
import { inducedLayout } from '../js/editor-src/ide/induced-layout.mjs';
import { bracketDeleteEdit, bracketTypeEdit } from '../js/editor-src/ide/smart-brackets.mjs';
import { buildBracketKeymap } from '../js/editor-src/editor-prefs.mjs';

const exts = [beluga()];

function stateOf(marked, extra = []) {
  const caret = marked.indexOf('‸');
  assert.notEqual(caret, -1, marked);
  return EditorState.create({
    doc: marked.replace('‸', ''),
    selection: { anchor: caret },
    extensions: [...exts, ...extra],
  });
}

function shown(state) {
  const head = state.selection.main.head;
  const doc = state.doc.toString();
  return doc.slice(0, head) + '‸' + doc.slice(head);
}

function typeChar(marked, ch, pad) {
  const state = stateOf(marked);
  const tr = bracketTypeEdit(state, ch, pad);
  if (!tr) {
    const caret = marked.indexOf('‸');
    const doc = marked.replace('‸', '');
    return doc.slice(0, caret) + ch + '‸' + doc.slice(caret);
  }
  return shown(tr.state);
}

function erase(marked, forward) {
  const state = stateOf(marked);
  const tr = bracketDeleteEdit(state, forward);
  if (!tr) {
    const caret = marked.indexOf('‸');
    const doc = marked.replace('‸', '');
    if (!forward) {
      if (caret === 0) return marked;
      return doc.slice(0, caret - 1) + '‸' + doc.slice(caret);
    }
    if (caret >= doc.length) return marked;
    return doc.slice(0, caret) + '‸' + doc.slice(caret + 1);
  }
  return shown(tr.state);
}

const typed = [
  ['open paren pairs', '(', true, 'f ‸', 'f (‸)'],
  ['open brace pairs', '{', true, 'f ‸', 'f {‸}'],
  ['open box pads', '[', true, 'f ‸', 'f [ ‸ ]'],
  ['padding off stays tight', '[', false, 'f ‸', 'f [‸]'],
  ['paren is not padded', '(', true, 'f ‸', 'f (‸)'],
  ['box before a word stays open', '[', true, 'f ‸x', 'f [‸x'],
  ['box before a comma stays open', '(', true, 'f ‸,', 'f (‸,'],
  ['box before a semicolon pairs', '[', true, 'f ‸;', 'f [ ‸ ];'],
  ['paren before a semicolon pairs', '(', true, 'f ‸;', 'f (‸);'],
  ['box before its closer does not duplicate', '[', true, 'f ‸]', 'f [‸]'],
  ['box before a spaced closer does not duplicate', '[', true, 'f ‸ ]', 'f [‸ ]'],
  ['paren before its closer does not duplicate', '(', true, 'f ‸)', 'f (‸)'],
  ['paren nests inside an empty pair', '(', true, '(‸)', '((‸))'],
  ['brace nests inside an empty pair', '{', true, '{‸}', '{{‸}}'],
  ['box nests inside an empty pair', '[', true, '[‸]', '[[ ‸ ]]'],
  ['paren nests again', '(', true, '((‸))', '(((‸)))'],
  ['paren nests before a spaced closer', '(', true, '( ‸)', '( (‸))'],
  ['closer steps over the one already there', ')', true, 'f ‸)', 'f )‸'],
  ['a padded box closer steps over the padding too', ']', true, '[ x‸ ]', '[ x ]‸'],
  ['and so does an empty padded box', ']', true, '[ ‸ ]', '[  ]‸'],
  ['padding off: the space is the author\'s, so ] is typed', ']', false, '[ x‸ ]', '[ x]‸ ]'],
  ['closer in the open does not invent an opener', ')', true, 'f ‸', 'f )‸'],
  ['closer after an opener just closes', ')', true, 'f (‸', 'f ()‸'],
  ['quote is not a pair', "'", true, 'f ‸', "f '‸"],
  ['angle bracket is not a pair', '<', true, 'f ‸', 'f <‸'],
  ['closer on the next line is a different box', '[', true, 'f ‸\n]', 'f [ ‸ ]\n]'],
  ['tab then a closer is still that closer', '[', true, '‸\t]', '[‸\t]'],
];

for (const [name, ch, pad, from, to] of typed) {
  assert.equal(typeChar(from, ch, pad), to, name);
}

const deleted = [
  ['backspace between parens', false, '(‸)', '‸'],
  ['backspace after parens', false, '()‸', '‸'],
  ['delete before parens', true, '‸()', '‸'],
  ['delete between parens', true, '(‸)', '‸'],
  ['backspace between brackets', false, '[‸]', '‸'],
  ['delete before brackets', true, '‸[]', '‸'],
  ['backspace between braces', false, '{‸}', '‸'],
  ['delete before braces', true, '‸{}', '‸'],
  ['backspace after a filled pair deletes one', false, '(x)‸', '(x‸'],
  ['backspace of the closer with text inside deletes one', false, '(x‸)', '(‸)'],
  ['delete of the opener with text inside deletes one', true, '‸(x)', '‸x)'],
  ['whitespace-only pair backspace after closer', false, '( )‸', '‸'],
  ['whitespace-only pair delete of opener', true, '‸( )', '‸'],
  ['backspace of a space deletes only the space', false, '( ‸)', '(‸)'],
  ['padded box backspace of a space deletes only the space', false, '[ ‸ ]', '[‸ ]'],
  ['padded box delete of a space deletes only the space', true, '[ ‸ ]', '[ ‸]'],
  ['padded box backspace of the closer clears the pair', false, '[  ]‸', '‸'],
  ['padded box delete of the opener clears the pair', true, '‸[  ]', '‸'],
  ['padded box backspace of the opener clears the pair', false, '[‸  ]', '‸'],
  ['padded box delete of the closer clears the pair', true, '[  ‸]', '‸'],
  ['outside text stays', false, 'a(‸)b', 'a‸b'],
  ['forward delete of a later pair', true, 'a‸()b', 'a‸b'],
];

for (const [name, forward, from, to] of deleted) {
  assert.equal(erase(from, forward), to, name);
}

{
  const selected = EditorState.create({
    doc: 'ab',
    selection: EditorSelection.range(0, 2),
    extensions: exts,
  });
  const tr = bracketTypeEdit(selected, '[', true);
  assert.equal(tr.state.doc.toString(), '[ ab ]');
  assert.equal(tr.state.doc.sliceString(tr.state.selection.main.from, tr.state.selection.main.to), 'ab');
  const tight = bracketTypeEdit(selected, '(', true);
  assert.equal(tight.state.doc.toString(), '(ab)');
  assert.equal(tight.state.doc.sliceString(tight.state.selection.main.from, tight.state.selection.main.to), 'ab');
}

{
  const state = stateOf('f ‸');
  const tr = bracketTypeEdit(state, '(', true);
  assert.equal(tr.annotation(Transaction.userEvent), 'input.type');
  assert.equal(shown(tr.state), 'f (‸)');
  const gone = bracketDeleteEdit(tr.state, false);
  assert.equal(gone.annotation(Transaction.userEvent), 'delete.backward');
  assert.equal(shown(gone.state), 'f ‸');
}

{
  const locked = EditorState.create({
    doc: '()',
    selection: { anchor: 1 },
    extensions: [...exts, EditorState.readOnly.of(true)],
  });
  assert.equal(bracketTypeEdit(locked, ')', true), null);
  assert.equal(bracketDeleteEdit(locked, false), null);
}

assert.equal(buildBracketKeymap({ autoCloseBrackets: false }).length, 0);
assert.deepEqual(
  buildBracketKeymap({ autoCloseBrackets: true }).map((b) => b.key),
  ['Backspace', 'Delete'],
);

{
  const base = 'rec f : nat = ';
  let st = EditorState.create({
    doc: base,
    selection: { anchor: base.length },
    extensions: [indentUnit.of('  '), beluga(), inducedLayout(), history()],
  });
  st = bracketTypeEdit(st, '[', true).state;
  assert.equal(shown(st), 'rec f : nat =\n  [ ‸ ]');
  undo({ state: st, dispatch(tr) { st = tr.state; } });
  assert.equal(st.doc.toString(), base);
}

{
  const base = 'rec f : nat =\n  fn x => ';
  const st = EditorState.create({
    doc: base,
    selection: { anchor: base.length },
    extensions: [indentUnit.of('  '), beluga(), inducedLayout()],
  });
  assert.equal(shown(bracketTypeEdit(st, '[', true).state), 'rec f : nat =\n  fn x => [ ‸ ]');
}

console.log('OK smart brackets');
