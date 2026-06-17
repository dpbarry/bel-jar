import assert from 'node:assert';
import { collapseErrorNavStops, pickNextErrorStop } from '../editor-src/bel-ide-actions.mjs';

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

const sameBlockDiffLine = collapseErrorNavStops([
  { from: 10, to: 12, line: 1 },
  { from: 50, to: 55, line: 2 },
]);
assert.equal(sameBlockDiffLine.length, 2);

console.log('OK error-nav collapses to one stop per line');
