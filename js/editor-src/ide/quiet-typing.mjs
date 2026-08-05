/** Quiet-while-typing: suppress thrashy IDE chrome until settlement catches up. */

function persistApi() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  return g.Persist;
}

export function quietWhileTypingEnabled() {
  try {
    return !!persistApi()?.readStoredQuietWhileTyping?.();
  } catch (_) {
    return false;
  }
}

/** True when quiet mode is on and the engine has not settled this syntax version. */
export function isQuietTypingActive(engine, syntaxVersion) {
  if (!quietWhileTypingEnabled()) return false;
  if (syntaxVersion == null) return false;
  if (!engine || typeof engine.isSettledFor !== 'function') return false;
  return !engine.isSettledFor(syntaxVersion);
}

export function isQuietTypingActiveForView(engine, state) {
  const ver = engine?.getSnapshot?.()?.syntax?.version;
  return isQuietTypingActive(engine, ver);
}
