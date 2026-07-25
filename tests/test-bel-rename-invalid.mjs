import { EditorState, Transaction } from '@codemirror/state';
import {
  rename,
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

function applySync(state) {
  const session = state.field(renameActiveField, false);
  const plan = planReferenceSync(state, session);
  if (!plan) return state;
  return state.update({
    changes: plan.changes,
    annotations: [renameSync.of(true), Transaction.addToHistory.of(false)],
  }).state;
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

state = state.update({ changes: [{ from: 0, to: 3, insert: '' }] }).state;
state = applySync(state);
expect(state.doc.toString() === ' bar ', 'empty anchor mirrors to references');

state = state.update({ changes: [{ from: 0, to: 0, insert: 'foo!' }] }).state;
state = applySync(state);
expect(state.doc.toString() === 'foo! bar foo!', 'illegal draft mirrors to references');

let restore = EditorState.create({
  doc: 'foo bar foo',
  extensions: rename(),
});
restore = restore.update({ effects: renameSessionEffect.of(session) }).state;
restore = restore.update({ changes: [{ from: 0, to: 3, insert: 'baz' }] }).state;
restore = applySync(restore);
expect(restore.doc.toString() === 'baz bar baz', 'draft mirrors on rename-length edits');
restore = restore.update({ changes: [{ from: 0, to: 3, insert: 'foo' }] }).state;
restore = applySync(restore);
expect(restore.doc.toString() === 'foo bar foo', 'anchor can be restored while drafting');
expect(restore.field(renameActiveField, false), 'session still active after invalid drafts');

console.log('OK bel-rename invalid draft (live mirror, stay in rename mode)');
