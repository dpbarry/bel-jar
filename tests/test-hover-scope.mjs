import assert from 'node:assert';
import { readHoverScope, showSymbolTooltips, showBuiltinTooltips, diagnosticMatchesPos } from '../js/editor-src/ide/hover.mjs';

function scope(v) {
  return { Persist: { readStoredHoverScope: () => v } };
}

assert.equal(readHoverScope(scope('all')), 'all');
assert.equal(readHoverScope(scope('user-only')), 'user-only');
assert.equal(readHoverScope(scope('none')), 'none');
assert.equal(readHoverScope({}), 'all');
assert.equal(showSymbolTooltips(scope('all')), true);
assert.equal(showSymbolTooltips(scope('user-only')), true);
assert.equal(showSymbolTooltips(scope('none')), false);
assert.equal(showBuiltinTooltips(scope('all')), true);
assert.equal(showBuiltinTooltips(scope('user-only')), false);
assert.equal(showBuiltinTooltips(scope('none')), false);

// Single-char diagnostics: match from either boundary that covers the char.
assert.equal(diagnosticMatchesPos(10, 1, 10, 11), true);
assert.equal(diagnosticMatchesPos(11, -1, 10, 11), true);
assert.equal(diagnosticMatchesPos(10, -1, 10, 11), false);
assert.equal(diagnosticMatchesPos(9, 1, 10, 11), false);
// Multi-char: any interior position matches regardless of side.
assert.equal(diagnosticMatchesPos(15, -1, 10, 20), true);

console.log('OK hover scope (readHoverScope + showSymbolTooltips + diagnosticMatchesPos)');
