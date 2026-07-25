import { EditorState, Transaction } from '@codemirror/state';
import {
  rename,
  buildRenameCommitChanges,
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

// cp_linear-style: short name inside braces — commit must not corrupt surrounding text.
const SNIPPET = 'l_pcomp2: ({x:name}linear proc) & name;';
const session = {
  symbolId: 'sym:name',
  originalName: 'name',
  sites: [
    { from: 14, to: 18 },
    { from: 34, to: 38 },
  ],
  anchorSite: 0,
};

let state = EditorState.create({ doc: SNIPPET, extensions: rename() });
state = state.update({ effects: renameSessionEffect.of(session) }).state;
state = state.update({ changes: [{ from: 14, to: 18, insert: 'arthichoke' }] }).state;
const syncPlan = planReferenceSync(state, state.field(renameActiveField, false));
state = state.update({
  changes: syncPlan.changes,
  annotations: [renameSync.of(true), Transaction.addToHistory.of(false)],
}).state;

const mirrored = state.doc.toString();
expect(mirrored.includes('{x:arthichoke}'), `mirrored braces intact: ${mirrored}`);
expect(mirrored.endsWith('arthichoke;'), `trailing ref mirrored: ${mirrored}`);

const commit = buildRenameCommitChanges(
  state.field(renameActiveField, false),
  'arthichoke',
  state.doc,
);
let out = mirrored;
for (const e of [...commit].sort((a, b) => b.from - a.from)) {
  out = out.slice(0, e.from) + e.insert + out.slice(e.to);
}
expect(out.includes('{x:arthichoke}'), `commit preserves braces: ${out}`);
expect(!out.includes('x:name'), `no leftover name in braces: ${out}`);
expect(!out.includes('arthichokelinear'), `no mangled splice: ${out}`);

console.log('OK bel-rename short-name (name inside braces)');
