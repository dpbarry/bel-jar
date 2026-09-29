// A browser's localStorage for persistence tests, shared between simulated
// tabs: each `openTab` runs its own Persist over the same storage, and a write
// in one tab fires a `storage` event in every OTHER tab, as a browser does.
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { runPersistStackInContext } from './persist-stack.mjs';

/**
 * @param {Record<string, string>} [seed]
 * @param {{ maxChars?: number }} [opts]  maxChars: throw QuotaExceededError past this many stored chars
 */
export function makeBrowserStorage(seed, opts = {}) {
  const m = new Map(Object.entries(seed || {}));
  const tabs = new Set();
  const limit = () => (opts.maxChars == null ? Infinity : opts.maxChars);
  let writer = null;
  const used = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  function broadcast(key, newValue = null) {
    for (const tab of tabs) {
      if (tab === writer) continue;
      for (const fn of tab.listeners) fn({ key, newValue, storageArea: tab.storage });
    }
  }
  const storage = {
    get length() { return m.size; },
    key(i) { return i >= 0 && i < m.size ? [...m.keys()][i] : null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) {
      k = String(k); v = String(v);
      const next = used() - (m.has(k) ? k.length + m.get(k).length : 0) + k.length + v.length;
      if (next > limit()) {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      }
      m.set(k, v);
      broadcast(k, v);
    },
    removeItem(k) {
      if (!m.delete(k)) return;
      broadcast(k);
    },
    clear() { m.clear(); broadcast(null); },
    /** Test access: the raw map, and the tabs attached. */
    map: m,
    tabs,
    /** Change the quota mid-test (null: unlimited). */
    set maxChars(n) { opts.maxChars = n; },
  };
  // Each tab's `storage` must be the same object the store compares against.
  storage._attach = (tab) => { tabs.add(tab); };
  storage._as = (tab, fn) => { const prev = writer; writer = tab; try { return fn(); } finally { writer = prev; } };
  return storage;
}

/**
 * Open a "tab": a fresh vm realm running the Persist bundle over `storage`.
 * Returns { P, S, ctx, tab }. Every write through this tab's storage is heard
 * by the other tabs as a `storage` event, and not by this one.
 */
export function openTab(storage, extras = {}) {
  const listeners = new Set();
  const tab = { listeners, storage: null };
  // Writes made while this tab's code runs are this tab's: other tabs hear them.
  const scoped = new Proxy(storage, {
    get(target, prop) {
      if (prop === 'setItem' || prop === 'removeItem' || prop === 'clear') {
        return (...args) => storage._as(tab, () => target[prop](...args));
      }
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  tab.storage = scoped;
  storage._attach(tab);
  const ctx = vm.createContext({
    clearTimeout,
    setTimeout,
    queueMicrotask,
    TextEncoder,
    crypto: webcrypto,
    localStorage: scoped,
    addEventListener(type, fn) { if (type === 'storage') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'storage') listeners.delete(fn); },
    ...extras,
  });
  ctx.globalThis = ctx;
  runPersistStackInContext(ctx);
  return { P: ctx.Persist, S: ctx.Settings, ctx, tab };
}

/** A value from a vm realm, copied into this one (so deepEqual compares data, not prototypes). */
export function here(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}
