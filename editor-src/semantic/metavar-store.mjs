import { STATUS } from './ids.mjs';

export function createMetavarStore() {
  const cache = new Map();
  const keyOf = (declId, name) => declId + '::' + name;
  const declOf = (key) => key.slice(0, key.lastIndexOf('::'));

  function reconcile(dirty, removed) {
    const drop = removed instanceof Set ? removed : new Set(removed || []);
    const stale = dirty instanceof Set ? dirty : new Set(dirty || []);
    for (const key of [...cache.keys()]) {
      const declId = declOf(key);
      if (drop.has(declId)) { cache.delete(key); continue; }
      const entry = cache.get(key);
      if (stale.has(declId) && entry.status === STATUS.FRESH) entry.status = STATUS.STALE_KNOWN;
    }
  }

  function apply(declId, name, result) {
    const key = keyOf(declId, name);
    if (!result || result.ok === false) {
      const prev = cache.get(key);
      cache.set(key, { type: prev ? prev.type : null, status: STATUS.ERRORING });
      return;
    }
    cache.set(key, { type: result.type != null ? result.type : null, status: STATUS.FRESH });
  }

  return {
    reconcile,
    apply,
    get: (declId, name) => cache.get(keyOf(declId, name)) || null,
    entries: () => cache.entries(),
    clear: () => cache.clear(),
    get size() { return cache.size; },
  };
}
