import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { beluga } from '../js/editor-src/language.mjs';
import { formatString } from '../js/editor-src/format/document-format.mjs';
import { captureFormatViewportAnchor, resolveFormatViewportAnchor } from '../js/editor-src/ide/viewport.mjs';
import { childrenArr } from '../js/editor-src/format/basics.mjs';

const src = `a : type.

b : type.

c : type.
`;

const tree = parser.parse(src);
const formatted = formatString(src, tree);
const state = EditorState.create({ doc: formatted, extensions: [beluga()] });

let declIndex = 0;
let anchorPos = 0;
for (const c of childrenArr(tree.topNode)) {
  if (c.name !== 'Declaration') continue;
  if (declIndex === 1) {
    anchorPos = src.indexOf('b', c.from);
    break;
  }
  declIndex++;
}

function sigOffset(text, pos, from, to) {
  let n = 0;
  for (let i = from; i < Math.min(pos, to); i++) {
    if (!/\s/.test(text[i])) n++;
  }
  return n;
}

const decl = [...childrenArr(tree.topNode)].filter((c) => c.name === 'Declaration')[1];
const anchor = {
  kind: 'decl',
  declIndex: 1,
  sigOffset: sigOffset(src, anchorPos, decl.from, decl.to),
};

const resolved = resolveFormatViewportAnchor(anchor, state, formatted);
assert.ok(formatted.slice(resolved, resolved + 1) === 'b', 'viewport anchor should land on the same declaration');

console.log('OK format viewport');

// ⛔ The CARET gets the same anchor as the viewport.
//
// Formatting rewrites the whole document, so the old `Math.min(head, newLength)`
// read a position in the OLD text against the NEW one. On a file with generous
// indentation it clamped the caret to the very end of the document — press
// Format Document and your cursor is at the bottom of the file. The
// declaration-relative, whitespace-insensitive anchor that already kept the
// right code on screen puts the caret back on the token it was on.
{
  const pad = ' '.repeat(24);
  const messy = [
    'LF nat : type =',
    pad + '| z : nat',
    pad + '| s : nat -> nat',
    ';',
    '',
    'LF tp : type =',
    pad + '| unit : tp',
    pad + '| arr : tp -> tp -> tp',
    ';',
    '',
    'LF marker : type =',
    pad + '| here : marker',
    ';',
    '',
  ].join(String.fromCharCode(10));

  const out = formatString(messy, parser.parse(messy));
  const caret = messy.indexOf('here');
  const before = EditorState.create({ doc: messy, extensions: [beluga()] });
  const caretAnchor = captureFormatViewportAnchor({ state: before }, caret);
  const after = EditorState.create({ doc: out, extensions: [beluga()] });

  const resolved = resolveFormatViewportAnchor(caretAnchor, after, out);
  assert.equal(resolved, out.indexOf('here'), 'the caret lands back on the token it was on');

  const crude = Math.min(caret, out.length);
  assert.notEqual(crude, resolved, 'and the raw offset would NOT have');
  assert.equal(crude, out.length, 'it clamped to the end of the document');
}
