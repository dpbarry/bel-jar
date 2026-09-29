// Two BelJar tabs on one project destroy each other's work silently. The guard
// cannot prevent that, so it has to SAY it — and it has to say it without ever
// crying wolf, because a false "another tab has this open" is worse than
// silence.
//
// The whole design rests on one property of the `storage` event: it fires in
// the OTHER tabs of an origin, never in the writer, and only on a real write.
// Each simulated tab here runs a real Persist over one shared browser storage
// (_persist-env.mjs), so the handshake travels through the real store and its
// real cross-tab events, not a stand-in.
import { makeBrowserStorage, openTab as openPersistTab } from './_persist-env.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const MODULE = new URL('../js/persist/tab-guard.mjs', import.meta.url).href;

const browser = makeBrowserStorage();
const tabs = [];

/** Load one more instance of the module, on its own Persist over the shared storage. */
async function openTab(projectId) {
  const tab = {
    pagehide: [],
    pageshow: [],
    warnings: [],
    notifications: [],
    projectId,
    tabConflict: false,
  };
  tabs.push(tab);
  const env = openPersistTab(browser);

  // The guard reads its globals at call time; point them at THIS tab for the
  // length of every call into it, including messages arriving from others.
  let tabPersist = null;
  const surfaces = () => ({
    Persist: tabPersist,
    Toasts: { warn: (m) => tab.warnings.push(m) },
    StatusStrip: { setTabConflict: (on) => { tab.tabConflict = !!on; } },
    Notifications: { emit: (n) => tab.notifications.push(n) },
  });
  const wrap = (fn) => (...args) => {
    const names = ['Persist', 'Toasts', 'StatusStrip', 'Notifications'];
    const saved = names.map((n) => globalThis[n]);
    Object.assign(globalThis, surfaces());
    try { return fn(...args); } finally {
      names.forEach((n, i) => { globalThis[n] = saved[i]; });
    }
  };
  tabPersist = Object.create(env.P);
  tabPersist.getActiveProjectId = () => tab.projectId;
  tabPersist.onTabMessage = (fn) => env.P.onTabMessage(wrap(fn));

  const prevAdd = globalThis.addEventListener;
  const prevRaf = globalThis.requestAnimationFrame;
  globalThis.addEventListener = (type, fn) => {
    if (type === 'pagehide') tab.pagehide.push(wrap(fn));
    else if (type === 'pageshow') tab.pageshow.push(wrap(fn));
  };
  // A no-op, not null: null falls through to a boot timer, and that timer
  // announces with whichever tab's Persist happens to be installed when it
  // fires. The tests call announce() themselves.
  globalThis.requestAnimationFrame = () => 0;

  // A fresh query string is a fresh module instance: a second tab. Its body
  // runs after import() returns, so this tab's globals stay up until it has.
  const names = ['Persist', 'Toasts', 'StatusStrip', 'Notifications'];
  const saved = names.map((n) => globalThis[n]);
  Object.assign(globalThis, surfaces());
  let mod;
  try {
    mod = await import(`${MODULE}?tab=${tabs.length}`);
  } finally {
    names.forEach((n, i) => { globalThis[n] = saved[i]; });
    globalThis.addEventListener = prevAdd;
    globalThis.requestAnimationFrame = prevRaf;
  }

  tab.announce = wrap(() => mod.announce());
  tab.hide = () => { for (const fn of tab.pagehide) fn(); };
  tab.show = (e) => { for (const fn of tab.pageshow) fn(e); };
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
