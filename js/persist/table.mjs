/**
 * A declared table of values kept in one store record (docs/PERSIST.md §3.5).
 *
 * Settings (settings-schema.mjs) and device state (device-schema.mjs) are both
 * tables: every value is a row with an id, a default and the values it may
 * hold, declared once. Reading, writing, defaults and the value early boot
 * paints with all derive from the rows. Only values that differ from their
 * default are stored.
 *
 * A row: { id, default, values?, type?, min?, max?, integer?, normalize?, boot? }
 *   values     the complete list of allowed values (an enum)
 *   type       'bool' | 'string' | 'number' | 'json' when there is no `values`
 *              (a boolean or numeric default implies 'bool' or 'number')
 *   min, max   numbers: out-of-range values are clamped, not refused (a drag
 *              past the edge means "as far as it goes")
 *   integer    numbers: rounded
 *   normalize  json rows: (raw) => clean value, or undefined to refuse
 *   boot       early boot needs it before first paint
 *
 * The value rules are pure so early boot can import them before anything
 * else has loaded.
 */

export function typeOf(row) {
  if (row.values) return 'enum';
  if (row.type) return row.type;
  if (typeof row.default === 'boolean') return 'bool';
  if (typeof row.default === 'number') return 'number';
  return 'string';
}

/** Deep-enough equality for table values (primitives, arrays, plain objects). */
export function sameValue(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function clone(v) {
  return v !== null && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
}

/**
 * The clean value `raw` stands for under `row`, or undefined when it is not a
 * value the row can hold. Numeric choices accept their string spelling,
 * because every dropdown hands back a string.
 */
export function normalizeValue(row, raw) {
  switch (typeOf(row)) {
    case 'enum': {
      if (row.values.includes(raw)) return raw;
      if (typeof raw === 'string' && raw.trim() !== '' && row.values.some((v) => typeof v === 'number')) {
        const n = Number(raw);
        if (row.values.includes(n)) return n;
      }
      return undefined;
    }
    case 'bool':
      return typeof raw === 'boolean' ? raw : undefined;
    case 'string':
      return typeof raw === 'string' && raw !== '' ? raw : undefined;
    case 'number': {
      let n = typeof raw === 'number' ? raw : (typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN);
      if (!Number.isFinite(n)) return undefined;
      if (row.min != null && n < row.min) n = row.min;
      if (row.max != null && n > row.max) n = row.max;
      return row.integer ? Math.round(n) : n;
    }
    case 'json':
      return row.normalize ? row.normalize(raw) : raw;
    default:
      return undefined;
  }
}

/**
 * Every row's effective value, from a stored `{ id: value }` map that may hold
 * anything: unknown ids and values a row cannot hold fall back to its default,
 * so a bad record can never reach the app.
 */
export function resolveRows(rows, stored) {
  const src = stored && typeof stored === 'object' ? stored : {};
  const out = {};
  for (const row of rows) {
    const n = Object.prototype.hasOwnProperty.call(src, row.id) ? normalizeValue(row, src[row.id]) : undefined;
    out[row.id] = clone(n === undefined ? row.default : n);
  }
  return out;
}

/**
 * Early boot's read of a table, straight from browser storage before the
 * store exists. A missing or different schema reads as defaults: that data is
 * in another format (the store is about to migrate it, or leave it alone), and
 * painting from it would flash.
 */
export function readBootRows(storage, schema, key, rows) {
  try {
    if (storage.getItem('beljar/schema') !== String(schema)) return resolveRows(rows, {});
    const env = JSON.parse(storage.getItem(key) || 'null');
    return resolveRows(rows, env && env.data && env.data.values);
  } catch (_) {
    return resolveRows(rows, {});
  }
}

/**
 * Early boot's read of one record's data (a project's meta, to know whether the
 * start page can open it), under the same rule: another schema reads as absent.
 */
export function readBootRecord(storage, schema, key) {
  try {
    if (storage.getItem('beljar/schema') !== String(schema)) return null;
    const env = JSON.parse(storage.getItem(key) || 'null');
    return env && env.data && typeof env.data === 'object' ? env.data : null;
  } catch (_) {
    return null;
  }
}

/**
 * The live table over one store record, `{ values: { id: value } }`.
 *
 * Reads come from memory, never from storage: the editor asks on every
 * keystroke. Memory is refreshed when another tab or the online layer changes
 * the record, so it cannot go stale. One table per record per page.
 *
 * @param {object} store
 * @param {{ key: string, rows: object[], unknown: (id: string) => string }} opts
 *   unknown: the error message for an id no row declares
 */
export function createTable(store, opts) {
  const { key, rows } = opts;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ids = rows.map((row) => row.id);
  const listeners = new Set();
  // Bumped for every id whose effective value changes, from ANY source: this
  // tab, another tab, the online layer, a reset, an import. A per-keystroke
  // cache can compare one integer instead of re-reading anything.
  const revisions = new Map();

  /** The stored overrides: only valid, non-default values. */
  function readOverrides() {
    const rec = store.get(key);
    const values = rec && rec.values && typeof rec.values === 'object' ? rec.values : {};
    const out = {};
    for (const [id, raw] of Object.entries(values)) {
      const row = byId.get(id);
      if (!row) continue;
      const v = normalizeValue(row, raw);
      if (v !== undefined && !sameValue(v, row.default)) out[id] = v;
    }
    return out;
  }

  let overrides = readOverrides();

  function requireRow(id) {
    const row = byId.get(id);
    if (!row) throw new Error(opts.unknown ? opts.unknown(id) : `${key}: no row "${id}"`);
    return row;
  }

  function emit(changed, origin) {
    if (!changed.length) return;
    for (const id of changed) revisions.set(id, (revisions.get(id) || 0) + 1);
    for (const fn of [...listeners]) {
      try { fn({ ids: changed, origin }); } catch (_) { /* one bad listener must not stop the rest */ }
    }
  }

  /** Replace the overrides wholesale; returns the ids whose effective value changed. */
  function commit(next) {
    const changed = ids.filter((id) => !sameValue(id in next ? next[id] : undefined, id in overrides ? overrides[id] : undefined));
    if (!changed.length) return { ok: true, changed };
    const res = store.set(key, { values: next });
    if (!res.ok) return { ok: false, changed: [] };
    overrides = next;
    emit(changed, 'local');
    return { ok: true, changed };
  }

  // Another tab, or the online layer: refresh memory, report what moved.
  const unsubscribe = store.subscribe((e) => {
    if (e.origin === 'local') return;
    if (e.key !== key && e.key !== null) return;
    const before = overrides;
    overrides = readOverrides();
    emit(ids.filter((id) => !sameValue(before[id], overrides[id])), e.origin);
  });

  return {
    /** The row declaring `id`, or null. */
    rowOf(id) {
      return byId.get(id) || null;
    },

    /** The effective value: what was stored, or the default. Never touches storage. */
    get(id) {
      const row = requireRow(id);
      return clone(id in overrides ? overrides[id] : row.default);
    },

    /**
     * Store a value. Returns false, and stores nothing, when the value is not
     * one this row can hold or storage refused it. Setting a value back to its
     * default removes it from the record.
     */
    set(id, value) {
      const row = requireRow(id);
      const v = normalizeValue(row, value);
      if (v === undefined) return false;
      const next = { ...overrides };
      if (sameValue(v, row.default)) delete next[id];
      else next[id] = clone(v);
      return commit(next).ok;
    },

    /** A number that changes whenever `id`'s effective value does. */
    revision(id) {
      requireRow(id);
      return revisions.get(id) || 0;
    },

    isDefault(id) {
      requireRow(id);
      return !(id in overrides);
    },

    defaultOf(id) {
      return clone(requireRow(id).default);
    },

    /** Every row's effective value. */
    values() {
      return resolveRows(rows, overrides);
    },

    /** Only what differs from the defaults (a copy). */
    overrides() {
      return clone(overrides);
    },

    /** Back to the defaults for every id `pick(row)` selects (all when omitted). */
    reset(pick) {
      const next = {};
      for (const [id, v] of Object.entries(overrides)) {
        if (pick && !pick(byId.get(id))) next[id] = v;
      }
      return commit(next).ok;
    },

    commit,

    /** fn({ ids, origin: 'local' | 'tab' | 'remote' }) whenever effective values change. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    dispose() {
      unsubscribe();
      listeners.clear();
    },
  };
}
