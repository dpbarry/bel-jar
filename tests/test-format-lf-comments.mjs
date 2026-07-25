import assert from 'node:assert/strict';
import { parser } from '../js/editor-src/beluga-parser.js';
import { formatString } from '../js/editor-src/format/document-format.mjs';

const src = `LF exp' : type = %name exp' F.
  | one : exp'
;
`;

const out = formatString(src, parser.parse(src));

assert.ok(out.includes('%name exp\' F.'), 'inline %name comment preserved after =');
assert.ok(out.includes('| one'), 'constructors still formatted');

console.log('OK format lf comments');
