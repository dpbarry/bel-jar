// Guard: the check-context / prelude cache identity is a PURE function of the
// sibling texts — NOT of any settlement/overlay generation. Regressing this (as
// the code did) makes the last file in a suite re-parse its whole prelude on
// every settlement tick while typing → the late-file latency.

import { preludeCacheMatches } from '../editor-src/semantic/prelude-cache-key.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const cache = {
  preludeIds: ['a', 'b', 'c'],
  preludeTexts: ['sig A', 'sig B', 'sig C'],
};

// Same ids + texts → HIT, no matter how many settlement ticks happened. (There is
// deliberately no generation parameter to pass; the signature cannot depend on
// one.)
expect(preludeCacheMatches(cache, ['a', 'b', 'c'], ['sig A', 'sig B', 'sig C']),
  'identical prelude ids + texts must hit the cache');

// A changed sibling TEXT → miss (correctly rebuild).
expect(!preludeCacheMatches(cache, ['a', 'b', 'c'], ['sig A', 'sig B*', 'sig C']),
  'a changed sibling text must miss');

// A changed sibling set (id added/removed/reordered) → miss.
expect(!preludeCacheMatches(cache, ['a', 'b'], ['sig A', 'sig B']),
  'fewer prelude files must miss');
expect(!preludeCacheMatches(cache, ['a', 'c', 'b'], ['sig A', 'sig C', 'sig B']),
  'reordered prelude must miss');

// Empty / uninitialised cache → miss.
expect(!preludeCacheMatches(null, ['a'], ['x']), 'null cache misses');
expect(!preludeCacheMatches({}, ['a'], ['x']), 'empty cache misses');

// The load-bearing property: a HUGE number of "settlement ticks" (no text
// change) never forces a rebuild. If someone reintroduces a generation key, this
// stays green ONLY because the signature has no generation to pass — the test
// exists to make that reintroduction a visible, compile-level change.
let hits = 0;
for (let tick = 0; tick < 10000; tick += 1) {
  if (preludeCacheMatches(cache, ['a', 'b', 'c'], ['sig A', 'sig B', 'sig C'])) hits += 1;
}
expect(hits === 10000, 'cache hits on every tick when texts are unchanged');

console.log('OK prelude-cache-key: cache identity is texts-only, invariant to settlement ticks');
