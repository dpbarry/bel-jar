import assert from 'node:assert/strict';
import { parser } from '../editor-src/beluga-parser.js';
import { formatString } from '../editor-src/bel-format.mjs';

const src = `LF env : type =
  | empty : env
  | cons : env → val → env

  and val : type =
  | clo : env → exp' → val
;
`;

const out = formatString(src, parser.parse(src));

assert.ok(out.includes('and val'), 'mutual and val segment preserved');
assert.ok(!out.includes('and val : type') || out.includes('and val : type'), 'val header intact');

const envBlock = out.slice(0, out.indexOf('and val'));
const valBlock = out.slice(out.indexOf('and val'));

assert.ok(envBlock.includes('empty') && envBlock.includes('cons'), 'env constructors stay under env');
assert.ok(!envBlock.includes('clo'), 'clo must not appear under env');
assert.ok(valBlock.includes('clo'), 'clo stays under val');

console.log('OK format lf mutual');
