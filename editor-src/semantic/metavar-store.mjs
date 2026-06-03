import { STATUS } from './ids.mjs';

// Reconstructed types of implicit metavariables that have NO source
// annotation — free uppercase variables like `R` in `c : … (ifc M N R)`, which
// the scope model cannot type (there is no `(R : …)` binder to read). Beluga
// only answers `%:get-type` at such a variable's USE-SITE occurrence (never at
// the declaration name, never in `%:fsig`), so these types come from the
// oracle, and we cache them.
//
// Keyed by `${enclosingDeclId}::${name}`, which gives three properties for
// free, all from the stable identity work:
//   * every occurrence of one metavar in one declaration shares a single entry
//     (resolve `R` once, all `R`s in that decl are instant),
//   * the entry survives edits to OTHER declarations (the decl's SymbolId is
//     unchanged), and
//   * it carries the same stale-known discipline as the declaration cache —
//     editing the owning declaration demotes it, it is never silently wiped.
export function createMetavarStore() {
  const cache = new Map();
  const keyOf = (declId, name) => declId + '::' + name;
  const declOf = (key) => key.slice(0, key.lastIndexOf('::'));

  // After an edit: drop entries whose owning declaration was removed, demote
  // entries whose owning declaration is dirty to stale-known (kept, flagged),
  // leave everything else FRESH.
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

  // Fold an oracle result for one metavar in. On failure the last-known type
  // is preserved (marked erroring), never blanked.
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
