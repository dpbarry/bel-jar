import assert from 'node:assert/strict';
import { parser } from '../js/editor-src/beluga-parser.js';
import { formatString } from '../js/editor-src/format/document-format.mjs';

const src = `LF step : type =
  % Variables
  | c_1 : tm
  | c_2 : tm

  % Natural Numbers
  | c_z : tm
  | c_s : tm
;
`;

const out = formatString(src, parser.parse(src));
const c1 = out.indexOf('| c_1');
const vars = out.indexOf('% Variables');
const nums = out.indexOf('% Natural Numbers');
const cz = out.indexOf('| c_z');

assert.ok(vars >= 0 && c1 >= 0 && vars < c1, '% Variables stays before first ctor');
assert.ok(c1 >= 0 && nums >= 0 && nums > c1, '% Natural Numbers stays between ctor groups');
assert.ok(nums >= 0 && cz >= 0 && nums < cz, '% Natural Numbers stays before c_z');
assert.ok(!out.trimEnd().endsWith('% Natural Numbers'), 'section comments not dumped at end');

console.log('OK format lf section comments');
