import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { getIndentation, IndentContext, indentUnit } from '@codemirror/language';
import { beluga } from '../js/editor-src/language.mjs';

const enterAt = (marked) => {
  const pos = marked.indexOf('‸');
  const st = EditorState.create({ doc: marked.replace('‸', ''), extensions: [indentUnit.of('  '), beluga()] });
  return getIndentation(new IndentContext(st, { simulateBreak: pos }), pos);
};

const SIG = 'rec f : [|- a] -> [|- a] =\n';
const cases = [
  ['after a totality annotation', `${SIG}  / total 1 /‸`, 2],
  ['after the = of a rec', `${SIG.trimEnd()}‸`, 2],
  ['after fn =>, body at the same indent', `${SIG}  fn x =>‸`, 2],
  ['after case … of', `${SIG}  fn x => case x of‸`, 2],
  ['after an arm, the next bar', `${SIG}  fn x => case x of\n  | [|- z] => x‸`, 2],
  ['between arms', `${SIG}  fn x => case x of\n  | [|- z] => x‸\n  | [|- s N] => x;`, 2],
  ['after let … in', `${SIG}  fn x =>\n  let y = x in‸\n  y;`, 2],
  ['after a finished declaration', `${SIG}  fn x => x;‸`, 0],
  ['after LF … =', 'LF t : type =‸', 2],
  ['after an LF constructor, the next bar', 'LF t : type =\n  | z : t‸', 2],
  ['inside an LF constructor type, at its colon', 'LF t : type =\n  | s : t ->‸', 6],
  ['inside a rec signature', 'rec f : [|- a] ->‸', 2],
  ['inside an LF declaration', 'tm : tp ->‸', 2],
  ['a split line', `${SIG}  / total 1 /‸fn x => x;`, 2],
];
for (const [what, doc, want] of cases) assert.equal(enterAt(doc), want, what);

console.log(`OK format indent (${cases.length} Enter cases agree with the printer)`);
