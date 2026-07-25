// Reference jump routing: resolve by name+line on prepared doc; local rows carry fileId.
import { EditorState } from '@codemirror/state';
import { resolveReferenceJump } from '../js/editor-src/ide/viewport.mjs';
import { prepareEditorDoc } from '../js/editor-src/editor-doc-prep.mjs';
import { gatherReferenceGroups } from '../js/editor-src/ide/refs-panel.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const SRC = `LF term : type =
| lam : (term -> term) -> term
;
rec foo : term = lam x. x;
`;

const doc = prepareEditorDoc(SRC, 'group/test.bel');
const line = doc.split('\n').findIndex((l) => /\bfoo\b/.test(l)) + 1;
expect(line >= 1, `fixture should contain foo on a line, got line ${line}`);

const state = EditorState.create({ doc });
const view = { state };
const fooFrom = doc.indexOf('foo');
const wrongFrom = doc.indexOf('rec');
const resolved = resolveReferenceJump(
  state.doc,
  { from: wrongFrom, to: wrongFrom + 3 },
  'foo',
  line,
  5,
);
expect(
  resolved && state.doc.sliceString(resolved.from, resolved.to) === 'foo',
  `resolveReferenceJump should land on foo, got ${resolved && state.doc.sliceString(resolved.from, resolved.to)}`,
);

const g = {
  CurrentEditor: { getDocumentId: () => 'f1' },
  Persist: {
    getActiveFileId: () => 'f1',
    listFiles: () => [{ id: 'f1', name: 'group/test.bel' }],
    getFileText: (id) => (id === 'f1' ? SRC : ''),
  },
};
const nav = {
  nameRange: null,
  references: [{ from: fooFrom, to: fooFrom + 3 }],
};
const gathered = gatherReferenceGroups(view, g, nav, 'foo', null);
const local = gathered.groups.find((gr) => gr.isCurrent);
expect(local && local.rows.length > 0, 'expected local reference group');
expect(
  local.rows.every((r) => r.fileId === 'f1'),
  `local rows should carry fileId f1, got ${local.rows.map((r) => r.fileId).join(',')}`,
);

console.log('OK reference jump routing (resolveReferenceJump + local row fileId)');
