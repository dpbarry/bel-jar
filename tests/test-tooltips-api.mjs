import { Tooltips, installTooltips } from '../js/ui/tooltips.mjs';
import assert from 'node:assert/strict';

const required = [
  'set',
  'setRich',
  'bind',
  'bindOverflow',
  'show',
  'hide',
  'hideImmediate',
  'setRectEl',
  'activeAnchor',
  'suppressAnchor',
  'releaseAnchor',
];

assert.equal(typeof Tooltips, 'object');
assert.equal(typeof installTooltips, 'function');
for (const name of required) {
  assert.equal(typeof Tooltips[name], 'function', `Tooltips.${name}`);
}

console.log('OK tooltips API (ESM export surface)');
