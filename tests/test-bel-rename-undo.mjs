import { EditorState, Transaction } from '@codemirror/state';
import { history, undoDepth, historyField } from '@codemirror/commands';
import {
  belRename,
  buildRenameCommitChanges,
  renameActiveField,
  renameInternal,
  renameSessionEffect,
} from '../editor-src/bel-rename.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function buildRevertAllChanges(session, doc) {
  const changes = [];
  const anchorText = doc.sliceString(session.anchorFrom, session.anchorTo);
  if (anchorText !== session.originalName) {
    changes.push({
      from: session.anchorFrom,
      to: session.anchorTo,
      insert: session.originalName,
    });
  }
  for (const r of session.refRanges || []) {
    if (r.from >= r.to) continue;
    if (doc.sliceString(r.from, r.to) !== session.originalName) {
      changes.push({ from: r.from, to: r.to, insert: session.originalName });
    }
  }
  return changes.sort((a, b) => a.from - b.from || a.to - b.to);
}

function commitLikeRename(state, trimmed) {
  const session = state.field(renameActiveField, false);
  expect(session, 'session active');
  const revert = buildRevertAllChanges(session, state.doc);
  if (revert.length) {
    state = state.update({
      changes: revert,
      annotations: [Transaction.addToHistory.of(false), renameInternal.of(true)],
    }).state;
  }
  const ready = state.field(renameActiveField, false);
  return state.update({
    changes: buildRenameCommitChanges(ready, trimmed),
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
  doc: 'ton bar ton',
  extensions: [history(), ...belRename()],
});

state = state.update({ effects: renameSessionEffect.of(session) }).state;
expect(state.doc.toString() === 'ton bar ton', 'mid-rename doc');
expect(undoDepth(state) === 0, 'rename edits not in history');

state = commitLikeRename(state, 'ton');
expect(state.doc.toString() === 'ton bar ton', 'committed');
expect(undoDepth(state) > 0, 'commit is historied');

const hist = state.field(historyField, false);
const undoSpec = hist.pop(0, state, false);
expect(undoSpec, 'undo spec available');
const undone = state.update(undoSpec).state;
expect(
  undone.doc.toString() === 'foo bar foo',
  `undo restores all sites, got ${JSON.stringify(undone.doc.toString())}`,
);

console.log('OK bel-rename undo');
