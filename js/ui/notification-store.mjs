// Notification store — pure model + adapters. UI lives in notifications.mjs;
// what a card SHOWS is decided in notification-view.mjs.
// Cloud later = new adapter + inbound emit({ origin: 'remote' }); no schema break.

export const SCHEMA_VERSION = 1;
export const DEFAULT_CAP = 100;
export const STORAGE_KEY = 'beljar-notifications';

const KINDS = new Set(['error', 'warn', 'info', 'success', 'system']);
const CATEGORIES = new Set(['teaching', 'ops', 'product', 'remote']);
const ORIGINS = new Set(['local', 'remote']);

export function newId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return 'notif-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function migrateRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw.v == null ? 1 : Number(raw.v);
  if (v === 1) return normalizeRecord(raw);
  // Future: v2+ transforms land here.
  return normalizeRecord(raw);
}

export function normalizeRecord(input) {
  if (input == null) return null;
  if (typeof input === 'string') {
    const title = String(input).trim();
    if (!title) return null;
    return {
      id: newId(),
      v: SCHEMA_VERSION,
      kind: 'info',
      category: 'ops',
      title,
      body: null,
      detail: null,
      source: 'legacy',
      createdAt: Date.now(),
      readAt: null,
      dismissedAt: null,
      dedupeKey: null,
      links: null,
      origin: 'local',
      remoteId: null,
      expiresAt: null,
    };
  }
  if (typeof input !== 'object') return null;

  const title = String(input.title != null ? input.title : input.message || '').trim();
  if (!title && !input.body && !input.detail) return null;

  const kind = KINDS.has(input.kind) ? input.kind : 'info';
  const category = CATEGORIES.has(input.category) ? input.category : 'ops';
  const origin = ORIGINS.has(input.origin) ? input.origin : 'local';
  const createdAt = Number.isFinite(input.createdAt)
    ? input.createdAt
    : (Number.isFinite(input.time) ? input.time : Date.now());

  let links = null;
  if (input.links && typeof input.links === 'object') {
    links = {
      fileId: input.links.fileId != null ? String(input.links.fileId) : undefined,
      path: input.links.path != null ? String(input.links.path) : undefined,
      line: Number.isFinite(input.links.line) ? input.links.line : undefined,
      hole: input.links.hole != null ? String(input.links.hole) : undefined,
      from: Number.isFinite(input.links.from) ? input.links.from : undefined,
      to: Number.isFinite(input.links.to) ? input.links.to : undefined,
    };
  }

  return {
    id: input.id && String(input.id) || newId(),
    v: SCHEMA_VERSION,
    kind,
    category,
    title: title || String(input.body || 'Notification').slice(0, 120),
    body: input.body != null ? String(input.body) : null,
    detail: input.detail != null ? String(input.detail) : null,
    source: input.source != null ? String(input.source) : 'unknown',
    createdAt,
    readAt: input.readAt != null ? Number(input.readAt) : null,
    dismissedAt: input.dismissedAt != null ? Number(input.dismissedAt) : null,
    dedupeKey: input.dedupeKey != null ? String(input.dedupeKey) : null,
    links,
    origin,
    remoteId: input.remoteId != null ? String(input.remoteId) : null,
    expiresAt: input.expiresAt != null ? Number(input.expiresAt) : null,
  };
}

// Where a notification points, or null when it points nowhere. A target needs a
// fileId plus something to aim at: an offset from the emitter, or a line.
// Offsets win when both are present; a line is resolved against the document at
// jump time, since the emitter may not have had one.
export function linkTarget(rec) {
  const l = rec && rec.links;
  if (!l || !l.fileId) return null;
  const from = Number.isFinite(l.from) ? l.from : null;
  const line = Number.isFinite(l.line) && l.line >= 1 ? Math.floor(l.line) : null;
  if (from == null && line == null) return null;
  const path = l.path != null ? String(l.path) : '';
  const base = path ? path.slice(path.lastIndexOf('/') + 1) : String(l.fileId);
  return {
    fileId: String(l.fileId),
    from,
    to: Number.isFinite(l.to) ? l.to : from,
    line,
    label: line != null ? base + ':' + line : base,
  };
}

export function createMemoryAdapter(seed) {
  let items = Array.isArray(seed) ? seed.slice() : [];
  return {
    load() {
      return items.slice();
    },
    save(next) {
      items = Array.isArray(next) ? next.slice() : [];
    },
  };
}

export function createLocalPersistAdapter(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const key = o.key || STORAGE_KEY;
  const loadFn = typeof o.load === 'function' ? o.load : null;
  const saveFn = typeof o.save === 'function' ? o.save : null;

  function readRaw() {
    if (loadFn) {
      try {
        return loadFn(key);
      } catch (_) {
        return null;
      }
    }
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function writeRaw(text) {
    if (saveFn) {
      try {
        saveFn(key, text);
        return;
      } catch (_) {
        return;
      }
    }
    try {
      if (typeof localStorage === 'undefined') return;
      if (text == null) localStorage.removeItem(key);
      else localStorage.setItem(key, text);
    } catch (_) {}
  }

  return {
    load() {
      const raw = readRaw();
      if (!raw) return [];
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const list = Array.isArray(parsed)
          ? parsed
          : (parsed && Array.isArray(parsed.items) ? parsed.items : []);
        return list.map(migrateRecord).filter(Boolean);
      } catch (_) {
        return [];
      }
    },
    save(next) {
      const items = Array.isArray(next) ? next : [];
      writeRaw(JSON.stringify({ v: SCHEMA_VERSION, items }));
    },
  };
}

export function createNotificationStore(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const cap = Number.isFinite(o.cap) && o.cap > 0 ? o.cap : DEFAULT_CAP;
  const adapter = o.adapter || createMemoryAdapter();
  const listeners = new Set();

  let items = [];
  try {
    items = (adapter.load() || []).map(migrateRecord).filter(Boolean);
    items = prune(items, cap);
  } catch (_) {
    items = [];
  }

  function prune(list, max) {
    const now = Date.now();
    let next = list.filter((r) => !r.dismissedAt);
    next = next.filter((r) => r.expiresAt == null || r.expiresAt > now);
    next.sort((a, b) => b.createdAt - a.createdAt);
    if (next.length > max) next = next.slice(0, max);
    return next;
  }

  function persist() {
    try {
      adapter.save(items);
    } catch (_) {}
  }

  function notify() {
    for (const fn of listeners) {
      try {
        fn(items.slice());
      } catch (_) {}
    }
  }

  function list() {
    return items.slice().sort((a, b) => b.createdAt - a.createdAt);
  }

  function get(id) {
    return items.find((r) => r.id === id) || null;
  }

  function unreadCount() {
    return items.filter((r) => !r.readAt).length;
  }

  function count() {
    return items.length;
  }

  function upsert(input) {
    const rec = normalizeRecord(input);
    if (!rec) return null;

    // A dedupe key means one card, refreshed — the same thing happening again
    // is not new news, and it is not a tally either.
    if (rec.dedupeKey) {
      const idx = items.findIndex((r) => r.dedupeKey === rec.dedupeKey && !r.dismissedAt);
      if (idx >= 0) {
        const prev = items[idx];
        const merged = {
          ...prev,
          ...rec,
          id: prev.id,
          createdAt: Number.isFinite(input.createdAt) ? rec.createdAt : Date.now(),
          readAt: null,
          dismissedAt: null,
          body: rec.body != null ? rec.body : prev.body,
          detail: rec.detail != null ? rec.detail : prev.detail,
        };
        items[idx] = merged;
        items = prune(items, cap);
        persist();
        notify();
        return merged;
      }
    }

    items.push(rec);
    items = prune(items, cap);
    persist();
    notify();
    return rec;
  }

  function dismiss(id) {
    const idx = items.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    items.splice(idx, 1);
    persist();
    notify();
    return true;
  }

  function clear() {
    if (items.length === 0) return;
    items = [];
    persist();
    notify();
  }

  function markRead(id) {
    const rec = get(id);
    if (!rec || rec.readAt) return false;
    rec.readAt = Date.now();
    persist();
    notify();
    return true;
  }

  function markAllRead() {
    const now = Date.now();
    let changed = false;
    for (const r of items) {
      if (!r.readAt) {
        r.readAt = now;
        changed = true;
      }
    }
    if (changed) {
      persist();
      notify();
    }
    return changed;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }

  return {
    list,
    get,
    upsert,
    dismiss,
    clear,
    markRead,
    markAllRead,
    count,
    unreadCount,
    subscribe,
    _pure: { items: () => items },
  };
}
