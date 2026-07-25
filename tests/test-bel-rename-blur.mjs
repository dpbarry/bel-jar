import { EditorState, Transaction } from '@codemirror/state';
import {
  rename,
  cancelRenameIfFocusLost,
  planReferenceSync,
  renameActiveField,
  renameSessionEffect,
  renameSync,
} from '../js/editor-src/ide/rename.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const session = {
  symbolId: 'sym:foo',
  originalName: 'foo',
  sites: [{ from: 0, to: 3 }, { from: 8, to: 11 }],
  anchorSite: 0,
};

let state = EditorState.create({
  doc: 'foo bar foo',
  extensions: rename(),
});
state = state.update({ effects: renameSessionEffect.of(session) }).state;
state = state.update({ changes: [{ from: 0, to: 3, insert: 'baz' }] }).state;
const plan = planReferenceSync(state, state.field(renameActiveField, false));
state = state.update({
  changes: plan.changes,
  annotations: [renameSync.of(true), Transaction.addToHistory.of(false)],
}).state;
expect(state.doc.toString() === 'baz bar baz', 'draft mirrored before blur cancel');

let current = state;
const view = {
  dom: { isConnected: true },
  hasFocus: false,
  get state() { return current; },
  dispatch(spec) {
    current = current.update(spec).state;
  },
  focus() {},
};

expect(cancelRenameIfFocusLost(view), 'focus loss cancels active rename');
expect(!current.field(renameActiveField, false), 'rename session cleared');
expect(current.doc.toString() === 'foo bar foo', 'doc reverted to original name');

expect(!cancelRenameIfFocusLost({
  ...view,
  hasFocus: true,
  get state() { return current; },
}), 'focus still in editor does not cancel');

console.log('OK bel-rename blur (focus loss cancels + reverts)');
