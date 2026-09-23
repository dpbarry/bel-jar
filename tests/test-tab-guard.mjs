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
  const tab = {
    listeners: [],
    pagehide: [],
    pageshow: [],
    warnings: [],
    notifications: [],
    projectId,
    tabConflict: false,
  };
  tabs.push(tab);

  const prevAdd = globalThis.addEventListener;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevPersist = globalThis.Persist;
  const prevToasts = globalThis.Toasts;
  const prevStatusStrip = globalThis.StatusStrip;
  const prevNotifications = globalThis.Notifications;

  globalThis.addEventListener = (type, fn) => {
    if (type === 'storage') tab.listeners.push(fn);
    else if (type === 'pagehide') tab.pagehide.push(fn);
    else if (type === 'pageshow') tab.pageshow.push(fn);
  };
  // A no-op, not null: null falls through to a boot timer, and that timer
  // announces with whichever tab's Persist happens to be installed when it
  // fires. The tests call announce() themselves.
  globalThis.requestAnimationFrame = () => 0;
  globalThis.Persist = { getActiveProjectId: () => tab.projectId };
  globalThis.Toasts = { warn: (m) => tab.warnings.push(m) };
  globalThis.StatusStrip = { setTabConflict: (on) => { tab.tabConflict = !!on; } };
  globalThis.Notifications = { emit: (n) => tab.notifications.push(n) };

  // A fresh query string is a fresh module instance: a second tab.
  const mod = await import(`${MODULE}?tab=${tabs.length}`);
  tab.announce = () => { writer = tab; mod.announce(); writer = null; };

  // The module's own listeners are captured; restore the globals but keep the
  // per-tab surfaces reachable by re-pointing them at call time.
  const wrap = (fn) => (...args) => {
    const savedPersist = globalThis.Persist;
    const savedToasts = globalThis.Toasts;
    const savedStatusStrip = globalThis.StatusStrip;
    const savedNotifications = globalThis.Notifications;
    globalThis.Persist = { getActiveProjectId: () => tab.projectId };
    globalThis.Toasts = { warn: (m) => tab.warnings.push(m) };
    globalThis.StatusStrip = { setTabConflict: (on) => { tab.tabConflict = !!on; } };
    globalThis.Notifications = { emit: (n) => tab.notifications.push(n) };
    const prevWriter = writer;
    writer = tab;
    try { return fn(...args); } finally {
      writer = prevWriter;
      globalThis.Persist = savedPersist;
      globalThis.Toasts = savedToasts;
      globalThis.StatusStrip = savedStatusStrip;
      globalThis.Notifications = savedNotifications;
    }
  };
  tab.listeners = tab.listeners.map(wrap);
  tab.pagehide = tab.pagehide.map(wrap);
  tab.pageshow = tab.pageshow.map(wrap);
  tab.announce = wrap(() => mod.announce());
  tab.hide = () => { for (const fn of tab.pagehide) fn(); };
  tab.show = (e) => { for (const fn of tab.pageshow) fn(e); };

  globalThis.addEventListener = prevAdd;
  globalThis.requestAnimationFrame = prevRaf;
  globalThis.Persist = prevPersist;
  globalThis.Toasts = prevToasts;
  globalThis.StatusStrip = prevStatusStrip;
  globalThis.Notifications = prevNotifications;
  return tab;
}

// ── one tab alone hears nothing ───────────────────────────────────────────────

const a = await openTab('proj-1');
a.announce();
expect(a.warnings.length === 0, 'a tab on its own never warns');
expect(a.tabConflict !== true, 'and raises no strip warning');
expect(a.notifications.length === 0, 'and does not bank a notification');

// ── a second tab on the SAME project: both learn about each other ─────────────

const b = await openTab('proj-1');
b.announce();
expect(b.warnings.length === 0 && a.warnings.length === 0, 'it is not a toast');
expect(a.tabConflict === true && b.tabConflict === true,
  'both raise the standing strip warning');
expect(a.notifications.length === 0 && b.notifications.length === 0,
  'it is not a notification');

// ── said once, not on every handshake ─────────────────────────────────────────

b.announce();
a.announce();
expect(a.tabConflict === true && b.tabConflict === true, 'the strip warning stays up');
expect(a.warnings.length === 0 && b.warnings.length === 0, 'and still no toast');

// ── a tab on a DIFFERENT project is not company ───────────────────────────────

const c = await openTab('proj-2');
c.announce();
expect(c.tabConflict !== true, 'a tab on another project is not a conflict');

const d = await openTab('proj-2');
d.announce();
expect(d.tabConflict === true, 'but a second tab on THAT project is');
expect(c.tabConflict === true, 'and it tells the incumbent');
expect(c.warnings.length === 0 && d.warnings.length === 0, 'still not a toast');

// ── closing a tab takes the warning down, and only for its project ───────────

d.hide();
expect(c.tabConflict === false, 'the last companion leaving clears the strip');
expect(a.tabConflict === true && b.tabConflict === true,
  'a goodbye on another project does not clear this one');
expect(c.warnings.length === 0, 'clearing is not a toast either');

const e = await openTab('proj-1');
e.announce();
expect(a.tabConflict === true && b.tabConflict === true && e.tabConflict === true,
  'a third tab on the project joins the warning');

e.hide();
expect(a.tabConflict === true && b.tabConflict === true,
  'one of three leaving leaves the other two warned');
expect(e.warnings.length === 0, 'the leaving tab does not toast');

b.hide();
expect(a.tabConflict === false, 'the last other tab closing clears the one that remains');
b.hide();
expect(a.tabConflict === false, 'a second goodbye from an already-gone tab changes nothing');

const f = await openTab('proj-1');
f.announce();
expect(a.tabConflict === true && f.tabConflict === true,
  'a new tab after a close raises the warning again');

// ── a reload is a goodbye and then a fresh handshake ─────────────────────────

f.hide();
expect(a.tabConflict === false, 'pagehide drops the chip — the other tab is not open');
f.show({ persisted: false });
expect(a.tabConflict === false && f.tabConflict === true,
  'an ordinary pageshow is not a return from the frozen page');

f.show({ persisted: true });
expect(a.tabConflict === true && f.tabConflict === true,
  'coming back from the back-forward cache handshakes again');

f.hide();
expect(a.tabConflict === false, 'and leaving again clears it');

console.log('OK tab-guard (handshake warns both tabs, and a goodbye clears the strip)');
