import { EditorState, Transaction } from '@codemirror/state';
import {
  belRename,
  buildRenameCommitChanges,
  planReferenceSync,
  renameActiveField,
  renameSessionEffect,
  renameSync,
} from '../editor-src/bel-rename.mjs';

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

const mirrored = 'baz bar baz';
const edits = buildRenameCommitChanges(session, 'baz', { sliceString: (f, t) => mirrored.slice(f, t) });
expect(edits.length === 2, 'commit should touch anchor + one reference');
expect(edits.every((e) => e.insert === 'baz'), 'both sites get the new name');
expect(edits[0].from === 0 && edits[0].to === 3, 'anchor site exact range');
expect(edits[1].from === 8 && edits[1].to === 11, 'ref site exact range');

let state = EditorState.create({
  doc: 'foo bar foo',
  extensions: belRename(),
});

state = state.update({
  effects: renameSessionEffect.of(session),
}).state;

expect(state.field(renameActiveField, false), 'rename session installed');

const blocked = state.update({
  changes: [{ from: 8, to: 11, insert: 'baz' }],
});
expect(blocked.state.doc.toString() === 'foo bar foo', 'reference-only edit blocked during rename');

state = state.update({
  changes: [{ from: 0, to: 3, insert: 'baz' }],
}).state;
const live = planReferenceSync(state, state.field(renameActiveField, false));
state = state.update({
  changes: live.changes,
  annotations: [renameSync.of(true), Transaction.addToHistory.of(false)],
}).state;
expect(state.doc.toString() === 'baz bar baz', 'draft mirrors to all references while typing');

const committed = state.update({
  changes: buildRenameCommitChanges(
    state.field(renameActiveField, false),
    'baz',
    state.doc,
  ),
  annotations: Transaction.userEvent.of('rename'),
});
expect(committed.state.doc.toString() === 'baz bar baz', 'all occurrences rewritten on commit');

// Length change: foo -> longername must not mangle on commit after live mirror
const longSession = {
  symbolId: 'sym:foo',
  originalName: 'foo',
  sites: [{ from: 0, to: 3 }, { from: 8, to: 11 }],
  anchorSite: 0,
};
let longState = EditorState.create({ doc: 'foo bar foo', extensions: belRename() });
longState = longState.update({ effects: renameSessionEffect.of(longSession) }).state;
longState = longState.update({ changes: [{ from: 0, to: 3, insert: 'longername' }] }).state;
const longPlan = planReferenceSync(longState, longState.field(renameActiveField, false));
longState = longState.update({
  changes: longPlan.changes,
  annotations: [renameSync.of(true), Transaction.addToHistory.of(false)],
}).state;
expect(longState.doc.toString() === 'longername bar longername', 'longer draft mirrors correctly');
const longCommit = buildRenameCommitChanges(
  longState.field(renameActiveField, false),
  'longername',
  longState.doc,
);
let longDoc = longState.doc.toString();
for (const e of [...longCommit].sort((a, b) => b.from - a.from)) {
  longDoc = longDoc.slice(0, e.from) + e.insert + longDoc.slice(e.to);
}
expect(longDoc === 'longername bar longername', 'length-change commit does not mangle');

console.log('OK bel-rename commit (live mirror + symbol commit)');
