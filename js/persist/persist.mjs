/**
 * Persist: the page's one door to everything BelJar remembers (docs/PERSIST.md).
 *
 * This module only composes. Two stores (store.mjs) own browser storage: the
 * store over localStorage, and the tab store over sessionStorage for what
 * outlives a reload but not the tab. On them: Settings (preferences), Device
 * (this browser's state), the work model (projects, files, the open
 * document) and the device records. Nothing else in BelJar touches browser
 * storage (tests/test-store-ownership.mjs).
 *
 * Sync (docs/PERSIST.md §5) is started here once the page knows who is signed
 * in, and is a subscriber like any other: it can be missing, offline or broken
 * without costing local work anything.
 */
import { createStore, createMemoryStorage } from './store.mjs';
import { MIGRATIONS } from './migrations.mjs';
import { createSettings } from './settings.mjs';
import { createTable } from './table.mjs';
import { DEVICE, DEVICE_KEY } from './device-schema.mjs';
import { createWork, DEFAULT_PROJECT_NAME } from './work.mjs';
import { create as createWorkFiles } from './work-files.mjs';
import { createDocuments, documentFingerprint, normalizeViewportAnchor } from './document.mjs';
import { create as createDeviceRecords } from './device-records.mjs';
import { parseKey } from './keys.mjs';
import { createSyncEngine } from './sync/engine.mjs';
import { createSyncRunner } from './sync/runner.mjs';
import { createSyncStatus } from './sync/sync-status.mjs';
import { createHoldPolicy } from './sync/hold.mjs';
import { createDurability } from './durability.mjs';
import { Routes } from '../frame/routes.mjs';

// ── a full disk: reported once, cleared when writes succeed again ──────────

var CAPACITY_DEDUPE = 'persist.capacity';

function reportCapacityFailure(detail) {
  // ⛔ The toast is deliberately `duration: 0`: a full disk is not something
  // to glance at and lose. The store calls this on the TRANSITION only, so
  // autosave retrying on every debounce tick never stacks another one.
  if (typeof globalThis.Toasts !== 'undefined' && globalThis.Toasts.error) {
    globalThis.Toasts.error('Couldn’t save: storage full.', { duration: 0, closable: true });
  }
  if (typeof globalThis.Notifications !== 'undefined' && globalThis.Notifications.emit) {
    globalThis.Notifications.emit({
      kind: 'error',
      category: 'ops',
      origin: 'local',
      title: 'Couldn’t save: storage full',
      body: 'Your last successful save is intact. Newer edits may be lost on'
        + ' reload until browser storage frees up.',
      detail: detail || null,
      source: 'persist.capacity',
      dedupeKey: CAPACITY_DEDUPE,
    });
  }
}

// ── the storage belongs to another version of BelJar ────────────────────────
// The store has already stopped writing (store.mjs); this tells the person why,
// once the page can show a dialog.
function whenPageReady(fn) {
  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    setTimeout(fn, 0);
  }
}

function announceReadOnly(message) {
  whenPageReady(function () {
    var C = globalThis.ConfirmDialog;
    if (C && typeof C.confirm === 'function') {
      C.confirm({
        ariaLabel: 'Reload BelJar',
        message: message,
        confirmLabel: 'Reload',
        cancelLabel: 'Not now',
        danger: false,
      }).then(function (yes) {
        if (yes && globalThis.location && typeof globalThis.location.reload === 'function') globalThis.location.reload();
      });
    } else if (globalThis.Toasts && typeof globalThis.Toasts.error === 'function') {
      globalThis.Toasts.error(message, { duration: 0, closable: true });
    }
  });
}

function clearCapacityFailure() {
  var N = globalThis.Notifications;
  if (!N || typeof N.list !== 'function' || typeof N.dismiss !== 'function') return;
  var list = N.list();
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].dedupeKey === CAPACITY_DEDUPE) {
      N.dismiss(list[i].id);
      break;
    }
  }
}

// ── the stores, and everything on them: created once, here, for the page ───
// Browser storage can refuse access outright (sandboxed frames, some privacy
// modes); then the page keeps working on memory, and nothing is saved rather
// than everything failing.
function browserArea(name) {
  try {
    var area = globalThis[name];
    if (area) { area.getItem('beljar/schema'); return area; }
  } catch (_) {}
  return null;
}

var sessionArea = browserArea('sessionStorage');

// ⛔ Older data is migrated or left alone, never deleted: people's work lives
// here now. A format change ships its step in migrations.mjs.
function openStore(storage, alsoWipe) {
  return createStore({
    storage: storage,
    alsoWipe: alsoWipe,
    migrations: MIGRATIONS,
    onMissingMigration: 'refuse',
    onCapacity: function (state, detail) {
      if (state === 'blocked') reportCapacityFailure(detail);
      else clearCapacityFailure();
    },
    onVersionAhead: function () {
      announceReadOnly('BelJar was updated in another tab. Reload to keep editing: changes here are not being saved.');
    },
    onCannotUpgrade: function () {
      announceReadOnly('This BelJar can’t open what an older one saved, so it changed nothing. Changes here are not being saved.');
    },
  });
}

var store = openStore(browserArea('localStorage') || createMemoryStorage(), [sessionArea].filter(Boolean));
// Older data this code cannot migrate stays in the browser exactly as it was,
// for a BelJar that can read it. The page cannot run on records it does not
// understand, so it runs on memory, as it does when the browser refuses
// storage: it works, and saves nothing here (the person has been told).
if (store.resetReason === 'refused') {
  store.dispose();
  store = openStore(createMemoryStorage(), []);
}

// What outlives a reload but not the tab: the undo stack, and the REPL history
// and folds when their setting says "this tab". A full tab store fails quietly:
// everything in it is a convenience the tab is about to lose anyway.
var tabStore = createStore({ storage: sessionArea || createMemoryStorage() });

var Settings, Device, work, files, documents, records;
function compose() {
  Settings = createSettings(store);
  Device = createTable(store, {
    key: DEVICE_KEY,
    rows: DEVICE,
    unknown: function (id) { return 'device: no row "' + id + '" (declare it in device-schema.mjs)'; },
  });
  work = createWork({ store: store, device: Device });
  files = createWorkFiles({ work: work, settings: Settings });
  documents = createDocuments({ work: work, settings: Settings, files: files });
  records = createDeviceRecords({ store: store, tabStore: tabStore, work: work, settings: Settings });
}
compose();

// A sign-out that removes the account's projects does it here, as a page
// loads, before anything asks which project this is (work.mjs `leaveAccount`).
work.finishSignOut();

// ── the editor's address names its project (js/frame/routes.mjs) ───────────
// A page opened on ?p=ID is pinned to that project before anything asks which
// project this is. ⛔ When this browser cannot show it (deleted, another
// account's, not here yet), the page leaves for home, which waits for it or
// lists what there is. It never opens another project under that address.
// Until the browser has left, the rest of the page still runs: on memory, as
// when storage is refused, so a page nobody will see writes nothing and makes
// no project.
var leaving = null;
(function pinToAddress() {
  var loc = globalThis.location;
  if (!loc || Routes.pageOf(loc) !== 'edit') return;
  var named = Routes.projectOf(loc);
  if (!named || work.pinProject(named)) return;
  leaving = named;
  store.dispose();
  tabStore.dispose();
  store = openStore(createMemoryStorage(), []);
  tabStore = createStore({ storage: createMemoryStorage() });
  compose();
  Routes.go(Routes.homeUrl({ open: named }), { replace: true });
})();

// ── this page's project, changed elsewhere ──────────────────────────────────
// Another tab, or another device through sync. A new tree reaches the explorer
// and the tabs as a change made here does (once per tick, however many records
// moved). A project deleted elsewhere is not left on screen taking edits that
// can no longer be saved.
var treeNoticeQueued = false;
var projectGoneShown = false;

function noteTreeChanged() {
  if (treeNoticeQueued) return;
  treeNoticeQueued = true;
  Promise.resolve().then(function () {
    treeNoticeQueued = false;
    var g = typeof window !== 'undefined' ? window : null;
    if (g && typeof g.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      g.dispatchEvent(new CustomEvent('beljar:project-tree-changed', { detail: { kind: 'external' } }));
    }
  });
}

function announceProjectGone() {
  if (projectGoneShown) return;
  projectGoneShown = true;
  // Not deleted: its account signed out in another tab, and its projects left
  // with it. This page follows it home, and says nothing.
  if (work.ownerLeft()) {
    Routes.go(Routes.homeUrl(), { replace: true });
    return;
  }
  var message = 'This project was deleted in another tab or on another device. Changes here can’t be saved.';
  whenPageReady(function () {
    var C = globalThis.ConfirmDialog;
    if (C && typeof C.confirm === 'function') {
      C.confirm({
        ariaLabel: 'Project deleted',
        message: message,
        confirmLabel: 'Open another project',
        cancelLabel: 'Not now',
        danger: false,
      }).then(function (yes) {
        if (yes && globalThis.location && typeof globalThis.location.reload === 'function') globalThis.location.reload();
      });
    } else if (globalThis.Toasts && typeof globalThis.Toasts.error === 'function') {
      globalThis.Toasts.error(message, { duration: 0, closable: true });
    }
  });
}

store.subscribe(function (e) {
  if (e.origin === 'local' || !e.key) return;
  var pid = work.pinnedProject();
  var k = pid ? parseKey(e.key) : null;
  if (!k || k.pid !== pid) return;
  if (k.kind === 'meta' && !work.hasProject(pid)) announceProjectGone();
  else if (k.kind === 'tree' || k.kind === 'meta') noteTreeChanged();
});

// ── back from the browser's page cache ──────────────────────────────────────
// ⛔ Going Back can bring a page back exactly as it was frozen, without loading
// it. While it was frozen other pages wrote (the editor it went to, another
// tab, sync), and a frozen page hears none of it: storage events are not kept
// for it. Every record it has cached may be stale, and an editor in that state
// would save old text over new. With two pages, Back is an everyday way to
// arrive, so a page that comes back this way starts again from storage.
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('pageshow', function (e) {
    if (e && e.persisted && globalThis.location && typeof globalThis.location.reload === 'function') globalThis.location.reload();
  });
  // ⛔ And a page that is left lets go of sync as it goes. Kept in that cache, it
  // keeps the sync lock it held, and Chrome does not hand the lock to a tab
  // that was already waiting for it: with two tabs open, going from the editor
  // to home left NO tab syncing, and signing out in the other tab said "Not
  // everything is in the cloud yet" (measured 2026-10-02: navigator.locks
  // .query() showed nobody holding the lock and both tabs waiting for it).
  // ⛔ But first what waits for the quiet spell goes (sendOnHide): a tab being
  // closed fires pagehide BEFORE it goes out of sight (measured 2026-10-03), so
  // stopping here first left nothing to send by then.
  globalThis.addEventListener('pagehide', function () { sendOnHide(); stopSync(); });
}

// ── sync ────────────────────────────────────────────────────────────────────
// What sync did that a person may want to find again, in the notifications. A
// file changed in two places is not here: it is state, shown by the cloud and
// the strip until someone reviews it (docs/UI.md §2, §3).
var SYNC_NOTICES = {
  copied: function (n) {
    return { kind: 'warn', title: 'Saved this device’s ' + n.from + ' as ' + n.path, body: 'Another device changed the same lines while a conflict here was still open.' };
  },
  kept: function (n) {
    return { kind: 'info', title: 'Kept ' + n.path, body: 'Another device deleted it, but it had changes here.' };
  },
  restored: function (n) {
    return { kind: 'info', title: 'Restored ' + n.path, body: 'It was deleted here, but another device changed it.' };
  },
  renamed: function (n) {
    return { kind: 'info', title: 'Renamed ' + n.from + ' to ' + n.path, body: 'Another device added a file with the same name.' };
  },
  'project-deleted': function (n) {
    return { kind: 'info', title: 'Removed ' + n.project, body: 'It was deleted on another device.' };
  },
  'project-restored': function (n) {
    return { kind: 'info', title: 'Restored ' + n.project, body: 'It was deleted here, but another device changed it.' };
  },
  'project-kept': function (n) {
    return { kind: 'info', title: 'Kept ' + n.project, body: 'Another device deleted it, but it had changes here.' };
  },
};

function announceSync(notice) {
  var N = globalThis.Notifications;
  var make = SYNC_NOTICES[notice && notice.kind];
  if (!make || !N || typeof N.emit !== 'function') return;
  var words = make(notice);
  N.emit({
    kind: words.kind,
    category: 'ops',
    origin: 'remote',
    source: 'sync',
    title: words.title,
    body: words.body,
    detail: notice.project && notice.path ? 'In ' + notice.project + '.' : null,
  });
}

// ── durability: what keeps this browser's work (durability.mjs) ────────────

// Safari's tracking prevention deletes a site's storage after 7 days of Safari
// use without a click, tap or key on it; Home Screen and Dock web apps are
// exempt. Every browser on iOS is WebKit, and there is no feature to detect.
function underSevenDayRule() {
  var nav = globalThis.navigator;
  if (!nav || nav.vendor !== 'Apple Computer, Inc.') return false;
  var app = nav.standalone === true
    || (typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(display-mode: standalone)').matches);
  return !app;
}

// Said once per device: a toast that stays until closed, saying what to do,
// and the same in the notifications, where it can be found again.
function announceSevenDays() {
  // Home says it on the page, for as long as it holds (js/home/home.mjs): no toast there.
  var onHome = !!globalThis.location && Routes.pageOf(globalThis.location) === 'home';
  if (!onHome && globalThis.Toasts && typeof globalThis.Toasts.warn === 'function') {
    globalThis.Toasts.warn(
      'Safari deletes this site’s data after 7 days without a visit. To keep a copy, download your projects from the Project menu.',
      { duration: 0, closable: true, notify: false },
    );
  }
  if (globalThis.Notifications && typeof globalThis.Notifications.emit === 'function') {
    globalThis.Notifications.emit({
      kind: 'warn',
      category: 'ops',
      origin: 'local',
      source: 'persist.durability',
      dedupeKey: 'persist.durability',
      title: 'Safari may delete your projects',
      body: 'Safari deletes a site’s data after 7 days without a visit, and your projects live only in this browser. To keep a copy, download each project from the Project menu.',
    });
  }
}

var nav0 = globalThis.navigator;
var durability = createDurability({
  store: store,
  work: work,
  device: Device,
  storage: (nav0 && nav0.storage) || null,
  events: typeof window !== 'undefined' ? window : null,
  sevenDayRule: underSevenDayRule(),
  warn: announceSevenDays,
});

// Counting the work reads every project, so it waits for an idle moment after
// the page is up: never on the way to first paint.
whenPageReady(function () {
  var idle = globalThis.requestIdleCallback;
  if (typeof idle === 'function') idle(function () { durability.start(); }, { timeout: 10000 });
  else setTimeout(function () { durability.start(); }, 2000);
});

var syncRunner = null;
var syncEngine = null;
var syncTransport = null;
var holdPolicy = null;

// What all the requests a closing page sends may carry between them: the
// browser's 64 KB for keepalive requests, and room for its own headers.
var CLOSING_PAGE_BYTES = 60 * 1024;

// What sync is doing, the same in every tab (sync/sync-status.mjs).
var syncStatus = createSyncStatus({
  account: work.account,
  conflicts: work.listConflicts,
  tabs: { post: records.postTabMessage, on: records.onTabMessage },
  online: function () {
    var nav = globalThis.navigator;
    return !nav || nav.onLine !== false;
  },
});

// A file changed in two places, or settled: the summary lists them.
store.subscribe(function (e) {
  var k = e && e.key ? parseKey(e.key) : null;
  if (k && k.kind === 'conflict') syncStatus.refresh();
});

/**
 * Start syncing the account this browser is signed in as. `opts.transport`
 * speaks the protocol (sync/protocol.mjs); `opts.locks` stands in for
 * navigator.locks. Returns the runner: status(), subscribe(fn), syncNow(), stop().
 */
function startSync(opts) {
  var account = work.account();
  if (!account) throw new Error('Persist.startSync: nobody is signed in on this browser (Persist.setAccount first)');
  if (!opts || !opts.transport) throw new Error('Persist.startSync needs a transport (js/persist/sync/protocol.mjs)');
  stopSync();
  var nav = globalThis.navigator;
  var engineWrites = 0;
  var engine = createSyncEngine({
    store: store,
    work: work,
    settings: Settings,
    transport: opts.transport,
    account: account,
    notify: announceSync,
    own: function (fn) {
      engineWrites += 1;
      try { return fn(); } finally { engineWrites -= 1; }
    },
  });
  syncRunner = createSyncRunner({
    engine: engine,
    store: store,
    // A tab nobody can see does not poll (plan v6 c8): a phone in a pocket, a tab behind others.
    visible: function () { return typeof document === 'undefined' || document.visibilityState !== 'hidden'; },
    // Not a change waiting to sync: what the engine wrote settling a round (a
    // project forgotten, a deletion settled).
    ignore: function () { return engineWrites > 0; },
    locks: opts.locks !== undefined ? opts.locks : (nav && nav.locks) || null,
  });
  syncEngine = engine;
  // "Back online: Ask me first" (Settings > Account): what this device
  // did offline waits for the person before it goes up (sync/hold.mjs).
  holdPolicy = createHoldPolicy({
    runner: syncRunner,
    engine: engine,
    device: Device,
    settings: Settings,
    account: account,
    online: function () {
      var n = globalThis.navigator;
      return !n || n.onLine !== false;
    },
  });
  syncTransport = opts.transport;
  syncRunner.start();
  syncStatus.attach(syncRunner);
  startPollAsk();
  return syncRunner;
}

/**
 * Stop syncing; resolves once a round in flight has finished. `opts.hold`
 * (signing out): no more rounds, but the sync lock stays with this page until
 * it is left or sync stops outright, so no other tab takes over meanwhile
 * (runner.mjs `stop`).
 */
var heldRunner = null;
function stopSync(opts) {
  stopPollAsk();
  const r = syncRunner;
  syncRunner = null;
  syncEngine = null;
  syncTransport = null;
  if (holdPolicy) holdPolicy.stop();
  holdPolicy = null;
  syncStatus.detach();
  if (opts && opts.hold && r) {
    heldRunner = r;
    return r.stop({ hold: true });
  }
  if (heldRunner) {
    heldRunner.stop();
    heldRunner = null;
  }
  return r ? r.stop() : Promise.resolve();
}

/**
 * The projects of account `uid` in this browser with work the cloud lacks
 * (edited, new or renamed since they last synced, or a commit still on its
 * way): what must not leave with a session that ended elsewhere
 * (account.mjs `sessionEnded`). Local records only; nothing is sent.
 */
function unsyncedProjects(uid) {
  if (!uid) return Promise.resolve([]);
  var engine = createSyncEngine({ store: store, work: work, settings: Settings, transport: {}, account: uid });
  return engine.localChanges().then(function (list) {
    return list.filter(function (c) { return !c.deleted; }).map(function (c) { return c.pid; });
  });
}

/**
 * Restore a version of a project (engine.mjs `restoreVersion`). It is written
 * as sync writes, which no round hears as a change, so the tab that syncs is
 * asked for a round at once: the restore is in the cloud, as a new version,
 * in a moment.
 */
function restoreVersion(pid, n) {
  if (!syncEngine) return Promise.resolve({ ok: false, error: 'signed-out' });
  return syncEngine.restoreVersion(pid, n).then(function (res) {
    if (res && res.ok) syncStatus.confirm();
    return res;
  });
}

/** An explicit save, or the network coming back: sync now, not at the next poll. */
function syncNow() {
  return syncRunner ? syncRunner.syncNow() : Promise.resolve(null);
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('online', function () { syncStatus.refresh(); if (holdPolicy) holdPolicy.check(); syncNow(); });
  globalThis.addEventListener('offline', function () { syncStatus.refresh(); if (holdPolicy) holdPolicy.check(); });
}
// "Back online" changed, here, in another tab or on another device: back to
// "Upload them", what waits goes.
Settings.subscribe(function (e) {
  if (holdPolicy && e && Array.isArray(e.ids) && e.ids.indexOf('syncReconnect') >= 0) holdPolicy.check();
});
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') seenAgain();
  });
}

/**
 * Seen again: a round now, from whichever tab syncs. Hidden, it stopped
 * polling (createSyncRunner `visible`); this tab may not be the one that syncs,
 * so it asks.
 */
function seenAgain() {
  if (!syncRunner) return;
  if (syncRunner.status().leader) syncNow();
  else syncStatus.confirm();
}

// While this tab is seen and another, hidden, holds sync, this one asks it for
// the minute's round: polling goes on as long as any tab of the browser is in
// view, and stops when none is. ⛔ Only while sync runs (startSync, stopSync):
// a timer of the module's own kept every page, and every test that loads it,
// alive for good.
var POLL_ASK_MS = 60000;
var pollAsk = null;
function startPollAsk() {
  stopPollAsk();
  if (typeof globalThis.setInterval !== 'function' || typeof document === 'undefined') return;
  pollAsk = globalThis.setInterval(function () {
    if (!syncRunner || document.visibilityState === 'hidden' || syncRunner.status().leader) return;
    syncStatus.confirm();
  }, POLL_ASK_MS);
}
function stopPollAsk() {
  if (pollAsk != null && typeof globalThis.clearInterval === 'function') globalThis.clearInterval(pollAsk);
  pollAsk = null;
}

// ⛔ What you typed is in the cloud when the tab closes (docs/PERSIST.md §5).
// The page going (a tab closed: pagehide, then out of sight) or out of sight (a
// tab switched away from, a phone switching apps: it may never come back) sends
// what waits for the quiet spell NOW, each project in one request the browser
// finishes after the page has gone (engine.mjs `flush`). What was typed in the
// last moment is written to storage first (document.mjs `flushPending`),
// whichever hook runs first. Offline, nothing is sent.
function sendOnHide() {
  if (!syncRunner || !syncTransport) return;
  var nav = globalThis.navigator;
  if (nav && nav.onLine === false) return;
  documents.flushPending();
  var t = syncTransport;
  var send = typeof t.commitOnHide === 'function'
    ? function (pid, req) { return t.commitOnHide(pid, req); }
    : function (pid, req) { return t.commit(pid, req); };
  syncRunner.flush(send, CLOSING_PAGE_BYTES);
}

if (typeof globalThis.addEventListener === 'function' && typeof document !== 'undefined') {
  globalThis.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') sendOnHide();
  });
}

export const Persist = {
  DEFAULT_PROJECT_NAME: DEFAULT_PROJECT_NAME,
  documentFingerprint: documentFingerprint,
  normalizeViewportAnchor: normalizeViewportAnchor,
  isSaveBlocked: store.isBlocked,
  isReadOnly: store.isReadOnly,
  // The project the address named and this browser cannot show: the page is on its way home.
  leaving: function () { return leaving; },

  // accounts and sync (docs/PERSIST.md §5)
  getAccount: work.account,
  setAccount: work.setAccount,
  claimProject: work.claimProject,
  projectStats: work.projectStats,
  onFileChange: work.onFileChange,
  // home's list: fn() whenever a project, its files, a file's text, a file to
  // review or this browser's device state changes, from this tab or anywhere
  onProjectsChange: function (fn) {
    return store.subscribe(function (e) {
      var k = e && e.key ? parseKey(e.key) : null;
      if (!e || e.key == null || e.key === DEVICE_KEY
        || (k && (k.kind === 'meta' || k.kind === 'tree' || k.kind === 'f' || k.kind === 'conflict'))) fn();
    });
  },
  // fn(account) when another tab signs in or out: this tab follows (account.mjs)
  onAccountElsewhere: function (fn) {
    var seen = work.account();
    return store.subscribe(function (e) {
      if (!e || (e.key != null && e.key !== DEVICE_KEY)) return;
      var now = work.account();
      if (now === seen) return;
      seen = now;
      if (e.origin !== 'local') fn(now);
    });
  },
  ownerLeft: work.ownerLeft,
  removeAccountProjects: work.removeAccountProjects,
  leaveAccount: work.leaveAccount,
  keepAccountProjects: work.keepAccountProjects,
  releaseAccount: work.releaseAccount,
  unsyncedProjects: unsyncedProjects,
  noteSignedOut: work.noteSignedOut,
  takeSignedOutNote: work.takeSignedOutNote,
  // signing in again: back to the account's work, not a blank placeholder
  resumeFor: work.resumeFor,
  clearResume: work.clearResume,
  isBlankProject: work.isBlankProject,
  startSync: startSync,
  stopSync: stopSync,
  syncNow: syncNow,
  syncSummary: syncStatus.summary,
  onSyncSummary: syncStatus.subscribe,
  confirmSynced: syncStatus.confirm,
  listConflicts: work.listConflicts,
  conflictSides: function (pid, fid) { return work.conflictSides(fid, pid); },
  resolveStoredConflict: function (pid, fid, choice) { return work.resolveStoredConflict(fid, choice, pid); },
  // edits made offline, held for review ("Back online: Ask me first")
  offlineChanges: function () { return syncEngine ? syncEngine.localChanges() : Promise.resolve([]); },
  cloudSide: function (pid, fids) { return syncEngine ? syncEngine.cloudSide(pid, fids) : Promise.resolve({ state: 'unknown', name: null, texts: {} }); },
  // Version history (plan v6 c6, js/ui/version-history.mjs): signed in only.
  projectHistory: function (pid, o) { return syncEngine ? syncEngine.history(pid, o) : Promise.resolve(null); },
  readVersion: function (pid, n) { return syncEngine ? syncEngine.readVersion(pid, n) : Promise.resolve(null); },
  restoreVersion: restoreVersion,
  useCloud: function (pid) { return syncEngine ? syncEngine.useCloud(pid) : Promise.resolve(false); },
  projectFileText: function (pid, fid) { return work.getText(fid, pid); },
  releaseSync: function () { return syncStatus.release(); },
  durabilityStatus: durability.status,

  // the open document
  createPersist: documents.createPersist,

  // projects
  listProjects: work.listProjects,
  // home: what there is, without making one; the last one opened; a delete that may empty the list
  projects: work.visibleProjects,
  lastProjectId: work.lastProject,
  projectInUse: work.projectInUse,
  removeProject: work.removeProject,
  // a project as files, for its zip: { name, files: [{ path, text }], folders }, or null
  projectFiles: function (pid) {
    var snap = work.snapshotProject(pid);
    if (!snap) return null;
    return {
      name: snap.meta.name,
      files: snap.tree.files.map(function (f) { return { path: f.name, text: snap.texts[f.id] }; }),
      folders: snap.tree.folders.slice(),
    };
  },
  getActiveProjectId: work.projectId,
  setActiveProjectId: work.setActiveProject,
  createProject: work.createProject,
  renameProject: work.renameProject,
  deleteProject: work.deleteProject,
  newBlankProject: files.newBlankProject,
  createProjectWithFiles: files.createProjectWithFiles,
  getProjectName: files.getProjectName,
  setProjectName: files.setProjectName,

  // files
  listFiles: files.listFiles,
  getFileById: files.getFileById,
  getFileText: files.getFileText,
  setFileText: files.setFileText,
  createFile: files.createFile,
  replaceProject: files.replaceProject,
  restoreDeletedFile: files.restoreDeletedFile,
  deleteFile: files.deleteFile,
  renameFile: files.renameFile,
  listEmptyFolders: files.listEmptyFolders,
  addEmptyFolder: files.addEmptyFolder,
  removeEmptyFolder: files.removeEmptyFolder,
  clearEmptyFolders: files.clearEmptyFolders,
  pruneEmptyFoldersUnder: files.pruneEmptyFoldersUnder,
  renameEmptyFolderPrefix: files.renameEmptyFolderPrefix,
  preserveEmptyFoldersAfterMoves: files.preserveEmptyFoldersAfterMoves,
  expandAliasesInAllFiles: files.expandAliasesInAllFiles,
  isAliasExpandablePath: files.isAliasExpandablePath,

  // .cfg membership and the active suite per directory
  addEntryToCfg: files.addEntryToCfg,
  prependEntryToCfg: files.prependEntryToCfg,
  removeEntryFromCfg: files.removeEntryFromCfg,
  moveEntryInCfg: files.moveEntryInCfg,
  getActiveCfgForDir: files.getActiveCfgForDir,
  getActiveCfgsForDir: files.getActiveCfgsForDir,
  setActiveCfgForDir: files.setActiveCfgForDir,
  setActiveCfgsForDir: files.setActiveCfgsForDir,
  addActiveCfgForDir: files.addActiveCfgForDir,
  removeActiveCfgForDir: files.removeActiveCfgForDir,
  getActiveCfgByDir: files.getActiveCfgByDir,
  backfillActiveCfgByDir: files.backfillActiveCfgByDir,

  // this project's session on this device: tabs, workspace, side panel, explorer folds
  getActiveFileId: files.getActiveFileId,
  setActiveFileId: files.setActiveFileId,
  getOpenFileIds: files.getOpenFileIds,
  setOpenFileIds: files.setOpenFileIds,
  openFile: files.openFile,
  closeOpenFile: files.closeOpenFile,
  readWorkspace: records.readWorkspace,
  writeWorkspace: records.writeWorkspace,
  resetWorkspace: records.resetWorkspace,
  readSidePanel: records.readSidePanel,
  writeSidePanel: records.writeSidePanel,
  readExplorerFolds: records.readExplorerFolds,
  writeExplorerFolds: records.writeExplorerFolds,

  // device records (device-records.mjs)
  readReplTranscript: records.readReplTranscript,
  writeReplTranscript: records.writeReplTranscript,
  readReplCommands: records.readReplCommands,
  writeReplCommands: records.writeReplCommands,
  readFileFolds: records.readFileFolds,
  writeFileFolds: records.writeFileFolds,
  readNotifications: records.readNotifications,
  writeNotifications: records.writeNotifications,
  readUndoStack: records.readUndoStack,
  writeUndoStack: records.writeUndoStack,
  clearUndoStack: records.clearUndoStack,
  postTabMessage: records.postTabMessage,
  onTabMessage: records.onTabMessage,
};

const g = typeof window !== 'undefined' ? window : globalThis;
g.Persist = Persist;
g.Settings = Settings;
g.Device = Device;
g.BelJarPersist = g.Persist;
