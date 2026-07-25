import assert from 'node:assert';
import {
  collapseErrorNavStops,
  pickNextErrorStop,
  pickPrevErrorStop,
} from '../js/editor-src/ide/ide-actions.mjs';

const paired = collapseErrorNavStops([
  { from: 10, to: 12, line: 1 },
  { from: 22, to: 25, line: 1 },
  { from: 100, to: 103, line: 5 },
  { from: 110, to: 112, line: 5 },
]);
assert.deepEqual(paired, [
  { from: 10, to: 12, line: 1 },
  { from: 100, to: 103, line: 5 },
]);

let next = pickNextErrorStop(paired, 0);
assert.equal(next.line, 1);
next = pickNextErrorStop(paired, 1);
assert.equal(next.line, 5);
next = pickNextErrorStop(paired, 5);
assert.equal(next.line, 1);

let prev = pickPrevErrorStop(paired, 5);
assert.equal(prev.line, 1);
prev = pickPrevErrorStop(paired, 1);
assert.equal(prev.line, 5);
prev = pickPrevErrorStop(paired, 3);
assert.equal(prev.line, 1);

const sameBlockDiffLine = collapseErrorNavStops([
  { from: 10, to: 12, line: 1 },
  { from: 50, to: 55, line: 2 },
]);
assert.equal(sameBlockDiffLine.length, 2);

console.log('OK error-nav collapses to one stop per line');
