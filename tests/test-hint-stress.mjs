import assert from 'node:assert';
import fs from 'node:fs';
import { parser } from '../editor-src/beluga-parser.js';
import { resolveHoverDoc } from '../editor-src/bel-resolve.mjs';
import { Text } from '@codemirror/state';

const SRC = fs.readFileSync(new URL('../hint-stress.bel', import.meta.url), 'utf8');
const doc = Text.of(SRC.split('\n'));
const tree = parser.parse(SRC);

function hover(needle, nth = 0) {
  let from = -1;
  for (let i = 0; i <= nth; i++) {
    from = SRC.indexOf(needle, from + 1);
    assert.ok(from >= 0, `missing marker: ${needle}`);
  }
  return resolveHoverDoc(tree, doc, from + 1);
}

assert.ok(tree.length > 0, 'hint-stress.bel should parse');

assert.equal(hover('stepBind', 0).sourceType, '[⊢ pf A]');
assert.ok(hover('stepPW', 0).sourceType?.includes('↦'));
assert.equal(hover('PatW', 0).sourceType, 'tm K[] A[]');
assert.ok(hover('stepU', 0).sourceType?.includes('pat/unit'));
assert.ok(hover('stepP', 0).sourceType?.includes('↦'));

console.log('OK hint-stress.bel parses and core ★ markers resolve structurally');
