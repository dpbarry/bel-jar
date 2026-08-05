import assert from 'node:assert';
import { EditorState } from '@codemirror/state';
import { beluga } from '../js/editor-src/language.mjs';
import {
  enclosingTopLevelDecl,
  stickyDeclLabel,
  structurePathAt,
  truncateCrumb,
} from '../js/editor-src/ide/sticky-decl.mjs';
import {
  selectionWhitespaceRanges,
  whitespaceMarksInRanges,
} from '../js/editor-src/ide/whitespace-selection.mjs';

const src = `LF nat : type =
| z : nat
| s : nat -> nat
;

rec plus : [⊢ nat] -> [⊢ nat] -> [⊢ nat] =
mlam N => mlam M =>
  case [⊢ N] of
  | [⊢ z] => [⊢ M]
  | [⊢ s N'] => let [⊢ R] = plus [⊢ N'] [⊢ M] in [⊢ s R]
;

rec and also : [⊢ nat] -> [⊢ nat] =
fn x => [⊢ x]
;
`;

const state = EditorState.create({
  doc: src,
  extensions: [beluga()],
});

function labelsAt(needle) {
  const pos = src.indexOf(needle);
  assert.ok(pos >= 0, `needle ${JSON.stringify(needle)}`);
  return structurePathAt(state, pos).map((c) => c.label);
}

{
  const plusPos = src.indexOf('plus');
  const node = enclosingTopLevelDecl(state, plusPos);
  assert.ok(node, 'enclosing RecDeclaration');
  assert.equal(node.name, 'RecDeclaration');
  assert.equal(stickyDeclLabel(state, node), 'plus');
}

{
  const natPos = src.indexOf('nat : type');
  const node = enclosingTopLevelDecl(state, natPos);
  assert.ok(node);
  assert.equal(node.name, 'LFDatatypeDeclaration');
  assert.equal(stickyDeclLabel(state, node), 'nat');
}

{
  assert.deepEqual(labelsAt('z :'), ['nat', 'z']);
  assert.deepEqual(labelsAt('s : nat'), ['nat', 's']);
}

{
  assert.deepEqual(labelsAt('plus :'), ['plus']);
  const arm = labelsAt("[⊢ s N']");
  assert.equal(arm[0], 'plus');
  assert.ok(arm.some((l) => l.startsWith('mlam')), 'mlam crumb');
  assert.ok(arm.some((l) => l.includes("s N'")), 'case pattern crumb');
}

{
  const deep = labelsAt('[⊢ s R]');
  assert.equal(deep[0], 'plus');
  assert.ok(deep.some((l) => l.startsWith('let')), 'let crumb');
}

{
  assert.deepEqual(labelsAt('also :'), ['also']);
  const fnPath = labelsAt('fn x');
  assert.deepEqual(fnPath, ['also', 'fn x']);
}

{
  assert.equal(truncateCrumb('abcdefghij', 8), 'abcdefg…');
  assert.equal(truncateCrumb('short', 24), 'short');
}

{
  const ranges = selectionWhitespaceRanges([
    { empty: true, from: 0, to: 0 },
    { empty: false, from: 2, to: 5 },
    { empty: false, from: 10, to: 8 },
  ]);
  assert.deepEqual(ranges, [{ from: 2, to: 5 }, { from: 8, to: 10 }]);
}

{
  const doc = EditorState.create({ doc: 'a  b\tc' }).doc;
  const deco = whitespaceMarksInRanges(doc, [{ from: 1, to: 5 }]);
  let n = 0;
  deco.between(0, doc.length, () => { n += 1; });
  assert.equal(n, 3, 'two spaces + one tab in selection');
}

console.log('OK sticky-decl whitespace-selection');
