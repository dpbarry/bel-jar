/**
 * The store: the only thing in BelJar that touches browser storage.
 *
 * Every read is synchronous and local; every write lands locally first. The
 * online layer, when it exists, is a subscriber that pushes what changed and
 * enters through `applyRemote` — it is never a second place things are saved.
 * Design and invariants: docs/PERSIST.md.
 */

/** Bump when the stored format changes. A mismatch wipes every BelJar key. */
export const SCHEMA = 4;

export const SCHEMA_KEY = 'beljar/schema';

/**
 * What each key IS, decided by its shape — never by the caller, who could
 * mislabel it. The class decides what sync does with a record and what quota
 * pressure may drop. First match wins; a key matching nothing cannot be stored.
 */
export const CLASSES = [
  { pattern: /^beljar\/settings$/, cls: 'settings' },
  { pattern: /^beljar\/device$/, cls: 'device' },
  { pattern: /^beljar\/notifications$/, cls: 'device' },
  { pattern: /^beljar\/repl\/(transcript|commands)$/, cls: 'device' },
  // the tab guard's handshake, and sync telling the other tabs how it is (sync/sync-status.mjs)
  { pattern: /^beljar\/tabs\/(ping|pong|bye|sync-status|sync-ask)$/, cls: 'device' },
  { pattern: /^beljar\/tombstones$/, cls: 'device' },
  { pattern: /^beljar\/settings-sync$/, cls: 'device' },
  { pattern: /^beljar\/p\/[^/]+\/meta$/, cls: 'work' },
  { pattern: /^beljar\/p\/[^/]+\/tree$/, cls: 'work' },
  { pattern: /^beljar\/p\/[^/]+\/f\/[^/]+$/, cls: 'work' },
  { pattern: /^beljar\/p\/[^/]+\/session$/, cls: 'device' },
  { pattern: /^beljar\/p\/[^/]+\/folds$/, cls: 'device' },
  { pattern: /^beljar\/p\/[^/]+\/undo$/, cls: 'device' },
  { pattern: /^beljar\/p\/[^/]+\/conflict\/[^/]+$/, cls: 'device' },
  { pattern: /^beljar\/p\/[^/]+\/sync$/, cls: 'device' },
  { pattern: /^beljar\/p\/[^/]+\/cache\/[^/]+$/, cls: 'cache' },
];

export function classOf(key) {
  const k = String(key || '');
  for (const row of CLASSES) {
    if (row.pattern.test(k)) return row.cls;
  }
  return null;
}

/**
 * ⛔ "Storage is full" is not spelled the same way twice. Chrome and Safari
 * throw QuotaExceededError, Firefox NS_ERROR_DOM_QUOTA_REACHED, and older
 * engines only the numeric codes. Missing one means a full disk on that browser
 * is never reported: silent data loss in the browser nobody named.
 */
export function isCapacityError(err) {
  if (!err) return false;
  const name = String(err.name || '');
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  if (err.code === 22 || err.code === 1014) return true;
  return /quota/i.test(String(err.message || ''));
}

/**
 * A Storage that lives in memory: for Node, where there is no localStorage,
 * and for tests that want a real store without a browser.
 */
export function createMemoryStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key(i) { return i >= 0 && i < m.size ? [...m.keys()][i] : null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(String(k), String(v)); },
    removeItem(k) { m.delete(k); },
    clear() { m.clear(); },
  };
}

/** Every key any version of BelJar ever wrote: `beljar/…`, `beljar-…`, `beljar:…`, `beljar.…`. */
function isBeljarKey(key) {
  return typeof key === 'string' && /^beljar[/:.-]/.test(key);
}

function allKeys(storage) {
  const out = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k != null) out.push(k);
  }
  return out;
}

function parseEnvelope(raw) {
  if (raw == null) return null;
  try {
    const env = JSON.parse(raw);
    if (!env || typeof env !== 'object' || typeof env.at !== 'number' || !('data' in env)) return null;
    return env;
  } catch (_) {
    return null;
  }
}

/**
 * @param {object} opts
 * @param {Storage} [opts.storage]      localStorage by default
 * @param {Storage[]} [opts.alsoWipe]   other areas cleared on a schema reset (sessionStorage)
 * @param {() => number} [opts.now]
 * @param {number} [opts.schema]
 * @param {(state: 'blocked'|'clear', detail?: string) => void} [opts.onCapacity]
 *   Called on TRANSITIONS only: once when a write that matters first fails for
 *   want of space, once when writes succeed again. Never per keystroke.
 * @param {EventTarget} [opts.events]  where the browser's `storage` event arrives
 * @param {Record<number, (storage: Storage) => void>} [opts.migrations]
 *   `migrations[n]` turns stored format n into n + 1, synchronously, in place.
 * @param {'wipe'|'refuse'} [opts.onMissingMigration]
 *   Older data no migration reaches: 'wipe' (the default while nobody's work
 *   depends on it) or 'refuse' (open read-only, touch nothing; the policy once
 *   users exist).
 * @param {(version: number) => void} [opts.onVersionAhead]
 *   The stored data is from a NEWER BelJar (another tab updated): this page is
 *   read-only from now on and should ask to be reloaded.
 * @param {(reason: string) => void} [opts.onCannotUpgrade]
 *   Older data this code will not wipe and cannot migrate: read-only.
 */
export function createStore(opts = {}) {
  const storage = opts.storage || globalThis.localStorage;
  // Listing keys is not optional: the schema wipe, whole-project deletes,
  // eviction and the project list all enumerate. A stand-in without it fails
  // here, loudly, instead of silently finding nothing.
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function'
    || typeof storage.removeItem !== 'function' || typeof storage.key !== 'function'
    || typeof storage.length !== 'number') {
    throw new Error('store: storage must be a Storage (getItem, setItem, removeItem, key, length)');
  }
  const now = opts.now || (() => Date.now());
  const schema = opts.schema == null ? SCHEMA : opts.schema;
  const onCapacity = typeof opts.onCapacity === 'function' ? opts.onCapacity : () => {};
  const events = opts.events || (typeof globalThis.addEventListener === 'function' ? globalThis : null);
  const listeners = new Set();
  let blocked = false;

  // ── schema: upgrade what is older, never touch what is newer ─────────────
  // ⛔ A mismatch used to wipe in BOTH directions, so a tab still running the
  // previous release, loading after a newer one, destroyed the newer data. And
  // a tab left open across a deploy kept writing the old format into upgraded
  // storage, with nothing to tell it. Older data is migrated (or wiped while
  // that is the policy); newer data is never touched, and this page stops
  // writing the moment it learns a newer BelJar owns the storage.
  const onVersionAhead = typeof opts.onVersionAhead === 'function' ? opts.onVersionAhead : () => {};
  const onCannotUpgrade = typeof opts.onCannotUpgrade === 'function' ? opts.onCannotUpgrade : () => {};
  const migrations = opts.migrations || {};
  const missingPolicy = opts.onMissingMigration === 'refuse' ? 'refuse' : 'wipe';
  let resetReason = null;
  let readOnly = false;

  const versionOf = (raw) => {
    const n = Number(raw);
    return raw != null && raw !== '' && Number.isInteger(n) ? n : null;
  };

  function wipeAndStamp() {
    for (const area of [storage, ...(opts.alsoWipe || [])]) {
      if (!area) continue;
      for (const k of allKeys(area)) {
        if (isBeljarKey(k)) area.removeItem(k);
      }
    }
    storage.setItem(SCHEMA_KEY, String(schema));
  }

  const storedRaw = storage.getItem(SCHEMA_KEY);
  const storedVersion = versionOf(storedRaw);
  if (storedRaw === String(schema)) {
    // current
  } else if (storedVersion != null && storedVersion > schema) {
    readOnly = true;
    resetReason = 'newer';
    onVersionAhead(storedVersion);
  } else if (storedRaw == null) {
    resetReason = 'fresh';
    wipeAndStamp();
  } else {
    let v = storedVersion;
    let failure = v == null ? 'unreadable' : null;
    while (!failure && v < schema) {
      const step = migrations[v];
      if (typeof step !== 'function') { failure = 'missing'; break; }
      try {
        step(storage);
      } catch (err) {
        // Half-migrated data is still the user's data: never wipe it.
        failure = 'threw';
        readOnly = true;
        resetReason = 'refused';
        onCannotUpgrade('migration from ' + v + ' failed: ' + String(err && err.message || err));
        break;
      }
      v += 1;
    }
    if (!failure) {
      resetReason = 'migrated';
      storage.setItem(SCHEMA_KEY, String(schema));
    } else if (failure !== 'threw') {
      if (missingPolicy === 'wipe') {
        resetReason = 'schema-changed';
        wipeAndStamp();
      } else {
        readOnly = true;
        resetReason = 'refused';
        onCannotUpgrade('no migration from ' + storedRaw + ' to ' + schema);
      }
    }
  }

  const READ_ONLY = { ok: false, error: { code: 'read-only' } };

  function emit(evt) {
    for (const fn of [...listeners]) {
      try { fn(evt); } catch (_) { /* one bad listener must not stop the rest */ }
    }
  }

  function requireClass(key) {
    const cls = classOf(key);
    if (!cls) throw new Error(`store: "${key}" matches no class in CLASSES; add it there first`);
    return cls;
  }

  function envelopeOf(key) {
    return parseEnvelope(storage.getItem(key));
  }

  /** Cache records, oldest first, never including `except`. */
  function evictionOrder(except) {
    return allKeys(storage)
      .filter((k) => k !== except && classOf(k) === 'cache')
      .map((k) => ({ k, at: (envelopeOf(k) || { at: 0 }).at }))
      .sort((a, b) => a.at - b.at)
      .map((x) => x.k);
  }

  function markHealthy() {
    if (!blocked) return;
    blocked = false;
    onCapacity('clear');
  }

  /**
   * Write one envelope. On a full disk, evict caches oldest-first and retry
   * after each; a cache that cannot fit fails quietly (it is recomputable),
   * anything else is reported once.
   */
  function write(key, cls, env) {
    if (readOnly) return READ_ONLY;
    const raw = JSON.stringify(env);
    let lastErr = null;
    const victims = evictionOrder(key);
    for (let attempt = 0; attempt <= victims.length; attempt++) {
      try {
        storage.setItem(key, raw);
        if (cls !== 'cache') markHealthy();
        return { ok: true };
      } catch (err) {
        if (!isCapacityError(err)) return { ok: false, error: { code: 'unknown', detail: String(err && err.message || err) } };
        lastErr = err;
        if (attempt < victims.length) storage.removeItem(victims[attempt]);
      }
    }
    const detail = String(lastErr && (lastErr.message || lastErr.name) || '');
    if (cls !== 'cache' && !blocked) {
      blocked = true;
      onCapacity('blocked', detail);
    }
    return { ok: false, error: { code: 'capacity', detail } };
  }

  const store = {
    SCHEMA: schema,
    /** 'fresh' | 'schema-changed' | null — why this store started empty, if it did. */
    resetReason,

    classOf,

    /** The stored data, or undefined. Never throws: a corrupt record reads as absent. */
    get(key) {
      const env = envelopeOf(key);
      return env ? env.data : undefined;
    },

    /** When the record was last written, or 0 if it does not exist. */
    at(key) {
      const env = envelopeOf(key);
      return env ? env.at : 0;
    },

    set(key, data) {
      const cls = requireClass(key);
      if (data === undefined) return store.remove(key);
      const res = write(key, cls, { at: now(), data });
      if (res.ok) emit({ key, cls, origin: 'local' });
      return res;
    },

    update(key, fn) {
      return store.set(key, fn(store.get(key)));
    },

    remove(key) {
      const cls = requireClass(key);
      if (readOnly) return READ_ONLY;
      storage.removeItem(key);
      emit({ key, cls, origin: 'local' });
      return { ok: true };
    },

    /** Every stored key under `prefix` (the schema key is not a record). */
    keys(prefix = 'beljar/') {
      return allKeys(storage).filter((k) => k !== SCHEMA_KEY && k.startsWith(prefix)).sort();
    },

    /** Delete every record under `prefix`, e.g. a whole project. */
    removeAll(prefix) {
      if (!prefix || !prefix.startsWith('beljar/')) throw new Error('store.removeAll needs a beljar/ prefix');
      if (readOnly) return 0;
      const gone = store.keys(prefix);
      for (const k of gone) storage.removeItem(k);
      for (const k of gone) emit({ key: k, cls: classOf(k), origin: 'local' });
      return gone.length;
    },

    /**
     * The online layer's only way in. Writes what it pulled with the time the
     * other side stamped, and tells subscribers it came from elsewhere so the
     * editor treats it like another tab's change. `null` data deletes.
     */
    applyRemote(key, data, at) {
      const cls = requireClass(key);
      if (readOnly) return READ_ONLY;
      if (data === null || data === undefined) {
        storage.removeItem(key);
        emit({ key, cls, origin: 'remote' });
        return { ok: true };
      }
      const res = write(key, cls, { at: Number(at) || now(), data });
      if (res.ok) emit({ key, cls, origin: 'remote' });
      return res;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** True while a write that matters is failing for want of space. */
    isBlocked() {
      return blocked;
    },

    /**
     * True when this page must not write: the storage belongs to a newer
     * BelJar, or holds older data this code will neither migrate nor wipe.
     * Every write then answers { ok: false, error: { code: 'read-only' } }.
     */
    isReadOnly() {
      return readOnly;
    },

    dispose() {
      if (events && onStorageEvent) events.removeEventListener('storage', onStorageEvent);
      listeners.clear();
    },
  };

  // ── another tab wrote: an event, not a surprise ──────────────────────────
  let onStorageEvent = null;
  if (events) {
    onStorageEvent = (e) => {
      if (e.storageArea && e.storageArea !== storage) return;
      if (e.key === null) {
        // Cleared elsewhere (another tab, the browser's site-data button). Put
        // the version back, or the next load reads everything written from now
        // on as unversioned and wipes it.
        if (!readOnly && storage.getItem(SCHEMA_KEY) == null) storage.setItem(SCHEMA_KEY, String(schema));
        emit({ key: null, cls: null, origin: 'tab' });
        return;
      }
      if (e.key === SCHEMA_KEY) {
        // Another tab running a newer BelJar upgraded the storage: stop now.
        const v = versionOf(e.newValue);
        if (v != null && v > schema && !readOnly) {
          readOnly = true;
          onVersionAhead(v);
        }
        return;
      }
      if (!e.key.startsWith('beljar/')) return;
      // The value the other tab wrote, as it wrote it: by the time this runs
      // the key may already hold a newer one (the tab guard's handshake needs
      // every message, not the latest).
      const env = parseEnvelope(e.newValue);
      emit({ key: e.key, cls: classOf(e.key), origin: 'tab', data: env ? env.data : undefined });
    };
    events.addEventListener('storage', onStorageEvent);
  }

  return store;
}
