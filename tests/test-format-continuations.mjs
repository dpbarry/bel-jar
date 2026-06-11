import assert from 'node:assert/strict';
import { parser } from '../editor-src/beluga-parser.js';
import { formatString } from '../editor-src/bel-format.mjs';

const src = `rec f : tp m/u → tp m/u =
  fn x ⇒ x
% helper for g
and rec g : tp m/u → tp m/u =
  fn x ⇒ f x
;

inductive T : tp m/u =
  | A : tp m/u
and inductive U : tp m/u =
  | B : tp m/u
;
`;

const tree = parser.parse(src);
const out = formatString(src, tree);

assert.ok(out.includes('and rec g'), 'and rec continuation preserved');
assert.ok(out.includes('% helper for g'), 'interleaved comment preserved');
assert.ok(out.includes('and inductive U'), 'datatype continuation preserved');
assert.ok(out.replace(/\s/g, '').length >= src.replace(/\s/g, '').length * 0.95, 'shrink guard should not block faithful format');

console.log('OK format continuations');
