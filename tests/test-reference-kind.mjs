import assert from 'node:assert';
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { referenceKind } from '../editor-src/bel-resolve.mjs';

const SRC = `LF o : type =
  | imp : o → o → o
;
LF nd : o → type =
  | impI : (nd A → nd B) → nd (A imp B)
;
rec discharge : (g : ctx) [g |- nd A] → [g |- nd A] =
  fn d => d
;
`;

const doc = Text.of(SRC.split('\n'));
const tree = parser.parse(SRC);

assert.equal(referenceKind(tree, doc, SRC.indexOf('impI') + 1), 'global');
assert.equal(referenceKind(tree, doc, SRC.indexOf('nd A') + 4), 'implicit');
assert.equal(referenceKind(tree, doc, SRC.indexOf('=> d') + 3), 'local');
assert.equal(referenceKind(tree, doc, 0), null);

console.log('OK referenceKind');
