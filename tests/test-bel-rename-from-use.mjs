import { EditorState, Transaction } from '@codemirror/state';
import { defsOf, usesOf } from '../editor-src/project-prelude.mjs';
import {
  belRename,
  buildRenameCommitChanges,
  planReferenceSync,
  renameActiveField,
  renameLocalDefConflict,
  renameSessionEffect,
  renameSync,
} from '../editor-src/bel-rename.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const doc = `LF foo : type.
  bar : foo.
`;
const def = defsOf(doc).find((d) => d.name === 'foo');
const use = usesOf(doc).find((u) => u.name === 'foo' && u.from !== def.from);
expect(def && use, 'fixture has foo def and use');

const session = {
  symbolId: 'sym:foo',
  originalName: 'foo',
  sites: [{ from: def.from, to: def.to }, { from: use.from, to: use.to }],
  anchorSite: 1,
};

let state = EditorState.create({ doc, extensions: belRename() });
state = state.update({ effects: renameSessionEffect.of(session) }).state;

state = state.update({
  changes: [{ from: use.from, to: use.to, insert: 'baz' }],
}).state;
const plan = planReferenceSync(state, state.field(renameActiveField, false));
expect(plan && plan.changes.length === 1, 'mirror updates definition when anchor is a use');
state = state.update({
  changes: plan.changes,
  annotations: [renameSync.of(true), Transaction.addToHistory.of(false)],
}).state;

const mirrored = state.doc.toString();
const defAfter = defsOf(mirrored).find((d) => d.name === 'baz');
expect(defAfter, 'definition mirrors to draft name');
expect(mirrored.slice(use.from, use.to) === 'baz', 'use site keeps draft name');

const active = state.field(renameActiveField, false);
expect(
  !renameLocalDefConflict(active, 'baz', mirrored),
  'no phantom local def conflict after def mirrors with uses',
);

const committed = state.update({
  changes: buildRenameCommitChanges(active, 'baz', state.doc),
  effects: renameSessionEffect.of(null),
  annotations: Transaction.userEvent.of('rename'),
});
expect(committed.state.doc.toString() === mirrored, 'commit preserves mirrored doc');
expect(!committed.state.field(renameActiveField, false), 'rename session cleared on commit');
const committedDef = defsOf(committed.state.doc.toString()).find((d) => d.name === 'baz');
expect(committedDef, 'definition still correct after commit');

console.log('OK bel-rename from use (def mirrors + commit + no phantom invalid)');
