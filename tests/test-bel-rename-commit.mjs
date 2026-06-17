import { EditorState, Transaction } from '@codemirror/state';
import {
  belRename,
  buildReferenceSyncChanges,
  buildRenameCommitChanges,
  renameActiveField,
  renameSessionEffect,
} from '../editor-src/bel-rename.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const setRenameSession = renameSessionEffect;

const session = {
  symbolId: 'sym:foo',
  originalName: 'foo',
  anchorFrom: 0,
  anchorTo: 3,
  refRanges: [{ from: 8, to: 11 }],
};

const edits = buildRenameCommitChanges(session, 'baz');
expect(edits.length === 2, 'commit should touch anchor + one reference');
expect(edits.every((e) => e.insert === 'baz'), 'both sites get the new name');

const state = EditorState.create({
  doc: 'foo bar foo',
  extensions: belRename(),
});

const withSession = state.update({
  effects: setRenameSession.of(session),
}).state;

expect(withSession.field(renameActiveField, false), 'rename session installed');

const blocked = withSession.update({
  changes: [{ from: 8, to: 11, insert: 'baz' }],
});
expect(blocked.state.doc.toString() === 'foo bar foo', 'reference-only edit blocked during rename');

const committed = withSession.update({
  changes: buildRenameCommitChanges(session, 'baz'),
  annotations: Transaction.userEvent.of('rename'),
});
expect(committed.state.doc.toString() === 'baz bar baz', 'all occurrences rewritten on commit');

const midRename = EditorState.create({ doc: 'ton bar foo' });
const sync = buildReferenceSyncChanges(midRename, session);
expect(sync.length === 1 && sync[0].insert === 'ton', 'sync picks up anchor draft');
const synced = midRename.update({ changes: sync }).state;
expect(synced.doc.toString() === 'ton bar ton', 'reference sync rewrites refs to match anchor');

console.log('OK bel-rename commit (anchor + refs, rename userEvent allowed)');
