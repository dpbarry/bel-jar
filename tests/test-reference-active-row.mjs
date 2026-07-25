import { EditorState } from '@codemirror/state';
import { referenceRowMatchesPos } from '../js/editor-src/ide/refs-panel.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const doc = EditorState.create({ doc: 'rec foo : term = lam x. foo;\n' });
const fooFrom = doc.doc.toString().indexOf('foo');
const useFrom = doc.doc.toString().lastIndexOf('foo');

expect(
  referenceRowMatchesPos({ from: useFrom, to: useFrom + 3, fileId: 'f1' }, 'f1', useFrom, doc.doc),
  'cursor on use row matches by offset',
);
expect(
  !referenceRowMatchesPos({ from: fooFrom, to: fooFrom + 3, fileId: 'f1' }, 'f1', useFrom, doc.doc),
  'cursor on use does not match def row',
);
expect(
  referenceRowMatchesPos({ line: 1, col: 5, fileId: 'f1' }, 'f1', fooFrom, doc.doc),
  'cursor matches by line:col',
);
expect(
  !referenceRowMatchesPos({ from: 0, to: 3, fileId: 'f2' }, 'f1', useFrom, doc.doc),
  'different file does not match',
);

console.log('OK reference active row matching');
