// Back/forward (`Ctrl-O` / `Ctrl-I`, and the IDE's own nav) — the one thing a
// back button must never do is take you somewhere you have already left.
import { record, travel, state, reset, pushEntry, step } from '../js/editor-src/ide/jump-list.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const at = (pos, fileId = 'a') => ({ fileId, pos });

function walk(delta, from, limit = 8) {
  const seen = [];
  for (let i = 0; i < limit; i += 1) {
    if (!travel(delta, (e) => { seen.push(e.pos); return true; }, at(from))) break;
  }
  return seen;
}

// ── the cursor sits one past the end, so the first back is where you just were ─

reset();
record(at(10));
record(at(100));
expect(state().size === 2 && state().cursor === 2, 'the cursor rests one past the end');

// ── back, then forward, returns to where you started ──────────────────────────

reset();
record(at(10));
record(at(100));
record(at(200));
expect(walk(-1, 300, 1).join() === '200', 'the first back lands where you jumped FROM');
expect(walk(-1, 300, 1).join() === '100', 'the next goes further back');
expect(walk(1, 0, 1).join() === '200', 'forward retraces it');
expect(walk(1, 0, 1).join() === '300', 'and returns to where back started');
expect(walk(1, 0, 1).length === 0, 'forward stops at the end');

// ── ⛔ a new jump drops the forward tail, in BOTH directions ───────────────────
//
// This is the regression. Truncating at `entries.length - 1` instead of at the
// cursor made forward look right (the cursor lands past the end either way)
// while back walked the abandoned tail: A → B → C, back to A, jump to D, and
// pressing back went D → C → B → A instead of D → A.

reset();
record(at(10));
record(at(100));
record(at(200));
walk(-1, 300, 2);                 // back to 200, then to 100
record(at(500));                  // …and now jump somewhere new
expect(walk(1, 500, 3).length === 0, 'forward has nowhere to go after a new jump');
expect(walk(-1, 500, 6).join() === '100,10', 'and back does NOT retrace the abandoned tail');

// ── two jumps from the same spot are one entry ────────────────────────────────

reset();
record(at(40));
record(at(41));
expect(state().size === 1, 'a second jump from within a line of the first is not a new entry');

// ── the pure helpers ──────────────────────────────────────────────────────────

const capped = pushEntry(
  Array.from({ length: 5 }, (_, i) => at(i * 100)),
  4,
  at(999),
  4,
);
expect(capped.list.length === 4, 'the list is capped');
expect(capped.list[capped.list.length - 1].pos === 999, 'keeping the newest');
expect(capped.at === 3, 'with the cursor on it');

expect(step([at(1), at(2)], 0, -1) === null, 'no step before the first entry');
expect(step([at(1), at(2)], 1, 1) === null, 'no step past the last');
expect(step([at(1), at(2)], 0, 1).entry.pos === 2, 'a step forward lands on the next');

console.log('OK jump-list (back/forward retrace, new jump truncates the tail both ways)');
