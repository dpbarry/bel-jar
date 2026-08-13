import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import assert from 'node:assert';
import { runPersistStackInContext } from './persist-stack.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function quotaErr(msg) {
  const e = new Error(msg || 'quota');
  e.name = 'QuotaExceededError';
  return e;
}

function makeMapStorage() {
  const storage = new Map();
  return {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    _map: storage,
  };
}

function freshCtx(extra) {
  const fakeLocalStorage = makeMapStorage();
  const fakeSessionStorage = makeMapStorage();
  const toasts = [];
  const notifs = [];
  const dismissed = [];
  const ctx = vm.createContext({
    globalThis: {},
    clearTimeout,
    setTimeout,
    TextEncoder,
    localStorage: fakeLocalStorage,
    sessionStorage: fakeSessionStorage,
    ...(extra || {}),
  });
  ctx.globalThis = ctx;
  ctx.Toasts = {
    error(msg, opts) {
      toasts.push({ msg, opts });
    },
  };
  ctx.Notifications = {
    _items: notifs,
    emit(rec) {
      const existing = notifs.find((r) => r.dedupeKey && r.dedupeKey === rec.dedupeKey);
      if (existing) {
        Object.assign(existing, rec);
        return existing.id;
      }
      const id = 'n-' + (notifs.length + 1);
      notifs.push({ id, ...rec });
      return id;
    },
    list() {
      return notifs.slice();
    },
    dismiss(id) {
      const i = notifs.findIndex((r) => r.id === id);
      if (i >= 0) {
        dismissed.push(notifs[i]);
        notifs.splice(i, 1);
      }
    },
  };
  runPersistStackInContext(ctx);
  return { P: ctx.Persist, toasts, notifs, dismissed, localStorage: fakeLocalStorage };
}

{
  const { P } = freshCtx();
  assert.equal(typeof P.classifyPersistError, 'function');
  assert.equal(typeof P.isSaveBlocked, 'function');
  assert.equal(P.isSaveBlocked(), false);

  const q = P.classifyPersistError(quotaErr('full'));
  assert.equal(q.code, 'capacity');
  assert.equal(q.retryable, false);
  assert.ok(String(q.detail).includes('full'));

  const net = P.classifyPersistError({ code: 'network', retryable: true, detail: 'timeout' });
  assert.equal(net.code, 'network');
  assert.equal(net.retryable, true);

  const unk = P.classifyPersistError(new Error('boom'));
  assert.equal(unk.code, 'unknown');
}

{
  // Always-capacity: report + block; then allow save → clear.
  let allow = false;
  const store = new Map();
  const backend = {
    loadSync(key) {
      return store.has(key) ? store.get(key) : null;
    },
    saveSync(key, value) {
      if (!allow) throw quotaErr('denied');
      store.set(key, value);
    },
    removeSync(key) {
      store.delete(key);
    },
  };

  const { P, toasts, notifs, dismissed } = freshCtx();
  const cp = P.createPersist({ backend, debounceMs: 0 });
  cp.scheduleEditorPersist('LF a : type;');
  cp.flushCheckpoint();

  assert.equal(P.isSaveBlocked(), true);
  assert.equal(toasts.length, 1);
  assert.ok(toasts[0].msg.indexOf('storage full') !== -1);
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].dedupeKey, 'persist.capacity');
  assert.equal(notifs[0].category, 'ops');

  // Dedupe: second failure updates, does not stack.
  cp.flushCheckpoint();
  assert.equal(notifs.length, 1);

  allow = true;
  cp.flushCheckpoint();
  assert.equal(P.isSaveBlocked(), false);
  assert.equal(notifs.length, 0);
  assert.equal(dismissed.length, 1);
  assert.ok(store.size >= 1);
}

{
  // Trim-then-succeed: capacity only while deriveAttempted is non-empty.
  const store = new Map();
  const backend = {
    loadSync(key) {
      return store.has(key) ? store.get(key) : null;
    },
    saveSync(key, value) {
      const parsed = JSON.parse(value);
      const attempted = parsed.semantic && parsed.semantic.deriveAttempted;
      if (attempted && attempted.length > 0) throw quotaErr('too big');
      store.set(key, value);
    },
    removeSync(key) {
      store.delete(key);
    },
  };

  const { P, toasts, notifs } = freshCtx();
  const cp = P.createPersist({ backend, debounceMs: 0 });
  cp.setCheckpointProviders({
    getText: () => 'LF a : type;',
    getSemantic: () => ({
      types: { v: 1, decls: [], metavars: [], reconstructed: [] },
      identity: [],
      deriveAttempted: ['x', 'y', 'z'],
      scopeKey: '',
    }),
    getDocFp: () => '1:abc',
    getBelugaBuild: () => 'stable',
  });
  cp.flushCheckpoint();

  assert.equal(P.isSaveBlocked(), false);
  assert.equal(toasts.length, 0);
  assert.equal(notifs.length, 0);
  const saved = JSON.parse([...store.values()][0]);
  assert.deepEqual(saved.semantic.deriveAttempted, []);
}

console.log('OK persist-capacity (classify, block/report, trim-retry, clear)');
