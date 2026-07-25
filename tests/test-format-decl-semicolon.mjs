import assert from 'node:assert/strict';
import { parser } from '../js/editor-src/beluga-parser.js';
import { formatString } from '../js/editor-src/format/document-format.mjs';

const src = `rec f : [ ⊢ tm] → [ ⊢ tm] =
  lem4-closure-exp LrmRmVQ
    (concat↦* [Φ ⊢ ↦*/step (↦/match/K ▷/pair) ↦*/refl])
;
`;

const out = formatString(src, parser.parse(src));
assert.match(out, /↦\*\/refl\]\)\n;/, 'declaration ; on its own line');
assert.ok(!out.includes('refl]);'), 'semicolon must not fold onto expression line');

console.log('OK format decl semicolon');
