import assert from 'node:assert/strict';
import { parser } from '../js/editor-src/beluga-parser.js';
import { formatString } from '../js/editor-src/format/document-format.mjs';

const src = `inductive t : ctype = | a : t
and inductive u : ctype = | b : u
;
`;

const out = formatString(src, parser.parse(src));

assert.ok(out.includes('inductive t : ctype'), 'lowercase inductive family preserved');
assert.ok(out.includes('and inductive u'), 'lowercase mutual continuation preserved');

console.log('OK format inductive lower');
