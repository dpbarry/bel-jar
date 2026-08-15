import assert from 'node:assert/strict';
import { formatSource } from '../js/editor-src/format/document-format.mjs';

const messy = 'lf a:type.\nlf b:type.\n';
const once = formatSource(messy);
assert.equal(typeof once, 'string');
assert.notEqual(once, messy);

const twice = formatSource(once);
assert.equal(twice, once);

const refused = formatSource('lf a : type.\n', {
  minSignificantRatio: 2,
  quiet: true,
});
assert.equal(refused, null);

console.log('OK format source');
