import assert from 'node:assert';
import fs from 'node:fs';
import { parser } from '../js/editor-src/beluga-parser.js';
import { resolveHoverDoc } from '../js/editor-src/name-resolve.mjs';
import { Text } from '@codemirror/state';

const bel = fs.readFileSync(new URL('./fixtures/all.bel', import.meta.url), 'utf8');
const doc = Text.of(bel.split('\n'));
const tree = parser.parse(bel);

function atLine(lineNo, needle) {
  const lines = bel.split('\n');
  const line = lines[lineNo - 1];
  const col = line.indexOf(needle);
  assert.ok(col >= 0, `needle ${needle} not on line ${lineNo}: ${line.slice(0, 80)}`);
  let pos = 0;
  for (let i = 0; i < lineNo - 1; i++) pos += lines[i].length + 1;
  pos += col + Math.floor(needle.length / 2);
  return resolveHoverDoc(tree, doc, pos);
}

// Line 1559: annotated unit case — stepP'Q' type is the ↦ redex in the pattern annotation
const unit = atLine(1559, "stepP'Q'");
assert.ok(unit?.sourceType?.includes('↦'), `unit stepP'Q' should be a ↦ step, got ${unit?.sourceType}`);
assert.ok(unit?.sourceType?.includes('pat/unit'), `unit stepP'Q' should mention pat/unit, got ${unit?.sourceType}`);
assert.notEqual(unit?.needsElaboration, true);

// Line 1566: unannotated pair case — type from ↦/match/R/pair constructor arg + lambda peel
const pair = atLine(1566, "stepP'Q'");
assert.ok(pair?.sourceType?.includes('↦'), `pair stepP'Q' should be a ↦ step, got ${pair?.sourceType}`);
assert.notEqual(pair?.needsElaboration, true);

// Line 410: ascription in ↦*/step pattern (stepPW)
const stepPW = atLine(410, 'stepPW');
assert.equal(stepPW?.kind, 'local');
assert.ok(stepPW?.sourceType?.includes('↦'));

console.log('OK all.bel implicit binders (stepP\'Q\', stepPW)');
