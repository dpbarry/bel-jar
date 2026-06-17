import assert from 'node:assert/strict';
import { parser } from '../editor-src/beluga-parser.js';
import { formatString } from '../editor-src/bel-format.mjs';

const src = `LF T : type = | a : T
and U : type = | b : U
;
`;

const out = formatString(src, parser.parse(src));

assert.ok(out.includes('LF T : type'), 'uppercase LF type family preserved');
assert.ok(out.includes('and U : type'), 'uppercase mutual continuation preserved');
assert.ok(out.includes('| a : T') && out.includes('| b : U'), 'constructors preserved');

console.log('OK format lf upper');
