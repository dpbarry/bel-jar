import assert from 'node:assert';
import { readHoverScope, showSymbolTooltips, showBuiltinTooltips, diagnosticMatchesPos } from '../js/editor-src/ide/hover.mjs';
import { withSettings } from './_settings.mjs';

const under = (v, fn) => withSettings({ hoverScope: v }, fn);

assert.equal(under('all', readHoverScope), 'all');
assert.equal(under('user-only', readHoverScope), 'user-only');
assert.equal(under('none', readHoverScope), 'none');
assert.equal(readHoverScope(), 'all', 'no Settings on the page: the table default');
assert.equal(under('all', showSymbolTooltips), true);
assert.equal(under('user-only', showSymbolTooltips), true);
assert.equal(under('none', showSymbolTooltips), false);
assert.equal(under('all', showBuiltinTooltips), true);
assert.equal(under('user-only', showBuiltinTooltips), false);
assert.equal(under('none', showBuiltinTooltips), false);

// Single-char diagnostics: match from either boundary that covers the char.
assert.equal(diagnosticMatchesPos(10, 1, 10, 11), true);
assert.equal(diagnosticMatchesPos(11, -1, 10, 11), true);
assert.equal(diagnosticMatchesPos(10, -1, 10, 11), false);
assert.equal(diagnosticMatchesPos(9, 1, 10, 11), false);
// Multi-char: any interior position matches regardless of side.
assert.equal(diagnosticMatchesPos(15, -1, 10, 20), true);

console.log('OK hover scope (readHoverScope + showSymbolTooltips + diagnosticMatchesPos)');
