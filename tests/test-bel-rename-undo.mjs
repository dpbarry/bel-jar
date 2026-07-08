import { EditorState, Transaction } from '@codemirror/state';
import { history, undoDepth, historyField } from '@codemirror/commands';
import {
  belRename,
  buildRenameCommitChanges,
  renameActiveField,
  renameSessionEffect,
} from '../editor-src/bel-rename.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function commitLikeRename(state, trimmed) {
  const session = state.field(renameActiveField, false);
  expect(session, 'session active');
  return state.update({
    changes: buildRenameCommitChanges(session, trimmed, state.doc),
    effects: renameSessionEffect.of(null),
    userEvent: 'rename',
  }).state;
}

const session = {
  symbolId: 'sym:foo',
  originalName: 'foo',
  anchorFrom: 0,
  anchorTo: 3,
  refRanges: [{ from: 8, to: 11 }],
};

let state = EditorState.create({
  doc: 'foo bar foo',
  extensions: [history(), ...belRename()],
});

state = state.update({ effects: renameSessionEffect.of(session) }).state;
state = state.update({ changes: [{ from: 0, to: 3, insert: 'ton' }] }).state;
expect(state.doc.toString() === 'ton bar foo', 'mid-rename: anchor draft only');
expect(undoDepth(state) === 0, 'rename edits not in history');

state = commitLikeRename(state, 'ton');
expect(state.doc.toString() === 'ton bar ton', 'committed');
expect(undoDepth(state) > 0, 'commit is historied');

const hist = state.field(historyField, false);
const undoSpec = hist.pop(0, state, false);
expect(undoSpec, 'undo spec available');
const undone = state.update(undoSpec).state;
expect(
  undone.doc.toString() === 'ton bar foo',
  `undo restores reference sites, got ${JSON.stringify(undone.doc.toString())}`,
);

console.log('OK bel-rename undo');
