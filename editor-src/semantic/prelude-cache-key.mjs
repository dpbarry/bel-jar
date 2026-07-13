// The identity of a cached check-context is a PURE function of the sibling
// prelude texts and the active-file fingerprint — never of checker results or a
// settlement/overlay generation counter. Keying it on a generation that bumps on
// every settle start/complete made the LAST file in a suite re-join and re-parse
// all of its predecessors many times per second while typing (the late-file
// latency), because that file has the biggest prelude and the most checker churn.
//
// Kept as a tiny pure helper so the invariant is explicit and testable: given the
// same prelude ids + texts, the cache HITS regardless of how many settlement
// ticks happened in between.

// True when [cache] can be reused for a prelude with these ids + texts. Compares
// ids positionally and texts by string identity (persist hands back stable refs
// for untouched siblings, so this never scans prelude bytes on the hot path).
export function preludeCacheMatches(cache, preludeIds, preludeTexts) {
  if (!cache || !cache.preludeIds || !cache.preludeTexts) return false;
  if (cache.preludeIds.length !== preludeIds.length) return false;
  for (let i = 0; i < preludeIds.length; i += 1) {
    if (cache.preludeIds[i] !== preludeIds[i]) return false;
  }
  for (let i = 0; i < preludeTexts.length; i += 1) {
    if (cache.preludeTexts[i] !== preludeTexts[i]) return false;
  }
  return true;
}
