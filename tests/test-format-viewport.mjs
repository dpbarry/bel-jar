import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { beluga } from '../js/editor-src/language.mjs';
import { formatString } from '../js/editor-src/format/document-format.mjs';
import { resolveFormatViewportAnchor } from '../js/editor-src/ide/viewport.mjs';
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
