// What a relative gutter puts on each line.
//
// The rendering half needs a browser (`npm run probe:keymap` drives it); this is
// the arithmetic, which is where an off-by-one would be invisible until someone
// deleted the wrong three lines with `d3k`.
import { lineLabel } from '../js/editor-src/ide/relative-line-numbers.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── relative: 0 on the caret, distance everywhere else ───────────────────────
expect(lineLabel(10, 10, 'relative') === '0', 'the caret line is 0');
expect(lineLabel(7, 10, 'relative') === '3', 'three lines above reads 3');
expect(lineLabel(13, 10, 'relative') === '3', 'three lines below also reads 3');
expect(lineLabel(1, 10, 'relative') === '9', 'distance, not signed offset');
// The count you type is the number you read: `d3k` must delete to the line
// showing 3 above, so distance is absolute on both sides.
expect(lineLabel(9, 10, 'relative') === lineLabel(11, 10, 'relative'), 'symmetric about the caret');

// ── hybrid: the caret line shows where you ARE ───────────────────────────────
expect(lineLabel(10, 10, 'hybrid') === '10', 'hybrid puts the absolute number on the caret line');
expect(lineLabel(7, 10, 'hybrid') === '3', 'and stays relative everywhere else');
expect(lineLabel(13, 10, 'hybrid') === '3', 'on both sides');

// An unknown mode must not silently become hybrid: `relative` is the fallback
// the gutter passes, and anything else is a caller bug, not a new style.
expect(lineLabel(10, 10, 'nonsense') === '0', 'only "hybrid" changes the caret line');

// ── first and last lines ─────────────────────────────────────────────────────
expect(lineLabel(1, 1, 'relative') === '0', 'line 1 with the caret on it');
expect(lineLabel(1, 1, 'hybrid') === '1', 'and in hybrid it reads 1, never 0');
expect(lineLabel(500, 1, 'relative') === '499', 'a long way down still counts');

console.log('OK relative line numbers (distance is symmetric; hybrid keeps the caret absolute)');
