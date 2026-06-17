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
// stepU is the 2nd argument of `↦/match/u : neu R → ↦ P P' → …`, so its source
// type is that argument slot, `↦ P P'`. (It is NOT the constructor's RESULT type
// `↦ (match R (pat/unit …)) …`, which is the type of the whole application — an
// earlier off-by-one in term-app arg indexing landed there by mistake.)
assert.equal(hover('stepU', 0).sourceType, "↦ P P'");
assert.ok(hover('stepP', 0).sourceType?.includes('↦'));

console.log('OK hint-stress.bel parses and core ★ markers resolve structurally');
