// Two BelJar tabs on one project destroy each other's work silently. The guard
// cannot prevent that, so it has to SAY it — and it has to say it without ever
// crying wolf, because a false "another tab has this open" is worse than
// silence.
//
// The whole design rests on one property of the `storage` event: it fires in
// the OTHER tabs of an origin, never in the writer, and only on a real write.
// This harness reproduces exactly that — two module instances, one shared
// storage, and each tab's listener wired to a bus that skips its own writes.

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const MODULE = new URL('../js/persist/tab-guard.mjs', import.meta.url).href;

const store = new Map();
const tabs = [];
let writer = null;

const localStorage = {
  getItem(k) { return store.has(k) ? store.get(k) : null; },
  removeItem(k) { store.delete(k); },
  setItem(k, v) {
    const old = store.has(k) ? store.get(k) : null;
    store.set(k, String(v));
    // Every tab but the one that wrote.
    for (const t of tabs) {
      if (t === writer) continue;
      for (const fn of t.listeners) fn({ key: k, newValue: String(v), oldValue: old });
    }
  },
};

globalThis.localStorage = localStorage;

/** Load one more instance of the module, wired to its own listener list. */
async function openTab(projectId) {
  const tab = { listeners: [], warnings: [], notifications: [], projectId };
  tabs.push(tab);

  const prevAdd = globalThis.addEventListener;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevPersist = globalThis.Persist;
  const prevToasts = globalThis.Toasts;
  const prevNotifications = globalThis.Notifications;

  globalThis.addEventListener = (type, fn) => { if (type === 'storage') tab.listeners.push(fn); };
  globalThis.requestAnimationFrame = null;
  globalThis.Persist = { getActiveProjectId: () => tab.projectId };
  globalThis.Toasts = { warn: (m) => tab.warnings.push(m) };
  globalThis.Notifications = { emit: (n) => tab.notifications.push(n) };

  // A fresh query string is a fresh module instance: a second tab.
  const mod = await import(`${MODULE}?tab=${tabs.length}`);
  tab.announce = () => { writer = tab; mod.announce(); writer = null; };

  // The module's own listeners are captured; restore the globals but keep the
  // per-tab surfaces reachable by re-pointing them at call time.
  const wrap = (fn) => (...args) => {
    const savedPersist = globalThis.Persist;
    const savedToasts = globalThis.Toasts;
    const savedNotifications = globalThis.Notifications;
    globalThis.Persist = { getActiveProjectId: () => tab.projectId };
    globalThis.Toasts = { warn: (m) => tab.warnings.push(m) };
    globalThis.Notifications = { emit: (n) => tab.notifications.push(n) };
    const prevWriter = writer;
    writer = tab;
    try { return fn(...args); } finally {
      writer = prevWriter;
      globalThis.Persist = savedPersist;
      globalThis.Toasts = savedToasts;
      globalThis.Notifications = savedNotifications;
    }
  };
  tab.listeners = tab.listeners.map(wrap);
  tab.announce = wrap(() => mod.announce());

  globalThis.addEventListener = prevAdd;
  globalThis.requestAnimationFrame = prevRaf;
  globalThis.Persist = prevPersist;
  globalThis.Toasts = prevToasts;
  globalThis.Notifications = prevNotifications;
  return tab;
}

// ── one tab alone hears nothing ───────────────────────────────────────────────

const a = await openTab('proj-1');
a.announce();
expect(a.warnings.length === 0, 'a tab on its own never warns');
expect(a.notifications.length === 0, 'and raises no notification');

// ── a second tab on the SAME project: both learn about each other ─────────────

const b = await openTab('proj-1');
b.announce();
expect(b.warnings.length === 1, 'the tab that just opened is told');
expect(a.warnings.length === 1, 'and so is the one that was already there');
expect(a.notifications[0].dedupeKey === b.notifications[0].dedupeKey,
  'both raise the same deduped notification');
expect(/another tab/i.test(String(a.warnings[0])), 'the warning says what is wrong');

// ── said once, not on every handshake ─────────────────────────────────────────

b.announce();
a.announce();
expect(a.warnings.length === 1, 'a standing condition is stated once, not repeated');
expect(b.warnings.length === 1, 'in both tabs');

// ── a tab on a DIFFERENT project is not company ───────────────────────────────

const c = await openTab('proj-2');
c.announce();
expect(c.warnings.length === 0, 'a tab on another project is not a conflict');

const d = await openTab('proj-2');
d.announce();
expect(d.warnings.length === 1, 'but a second tab on THAT project is');
expect(c.warnings.length === 1, 'and it tells the incumbent');

console.log('OK tab-guard (handshake warns both tabs, once, and only on a shared project)');
