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

var store = createStore({
  storage: browserArea('localStorage') || createMemoryStorage(),
  alsoWipe: [sessionArea].filter(Boolean),
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

// What outlives a reload but not the tab: the undo stack, and the REPL history
// and folds when their setting says "this tab". A full tab store fails quietly:
// everything in it is a convenience the tab is about to lose anyway.
var tabStore = createStore({ storage: sessionArea || createMemoryStorage() });

var Settings = createSettings(store);
var Device = createTable(store, {
  key: DEVICE_KEY,
  rows: DEVICE,
  unknown: function (id) { return 'device: no row "' + id + '" (declare it in device-schema.mjs)'; },
});
var work = createWork({ store: store, device: Device });
var files = createWorkFiles({ work: work, settings: Settings });
var documents = createDocuments({ work: work, settings: Settings, files: files });
var records = createDeviceRecords({ store: store, tabStore: tabStore, work: work, settings: Settings });

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
  if (globalThis.Toasts && typeof globalThis.Toasts.warn === 'function') {
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
var holdPolicy = null;

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
  var engine = createSyncEngine({
    store: store,
    work: work,
    settings: Settings,
    transport: opts.transport,
    account: account,
    notify: announceSync,
  });
  syncRunner = createSyncRunner({
    engine: engine,
    store: store,
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
  syncRunner.start();
  syncStatus.attach(syncRunner);
  return syncRunner;
}

/** Stop syncing; resolves once a round in flight has finished. */
function stopSync() {
  const r = syncRunner;
  syncRunner = null;
  syncEngine = null;
  if (holdPolicy) holdPolicy.stop();
  holdPolicy = null;
  syncStatus.detach();
  return r ? r.stop() : Promise.resolve();
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
    if (document.visibilityState === 'visible') syncNow();
  });
}

export const Persist = {
  DEFAULT_PROJECT_NAME: DEFAULT_PROJECT_NAME,
  documentFingerprint: documentFingerprint,
  normalizeViewportAnchor: normalizeViewportAnchor,
  isSaveBlocked: store.isBlocked,
  isReadOnly: store.isReadOnly,

  // accounts and sync (docs/PERSIST.md §5)
  getAccount: work.account,
  setAccount: work.setAccount,
  claimProject: work.claimProject,
  projectStats: work.projectStats,
  onFileChange: work.onFileChange,
  removeAccountProjects: work.removeAccountProjects,
  keepAccountProjects: work.keepAccountProjects,
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
  useCloud: function (pid) { return syncEngine ? syncEngine.useCloud(pid) : Promise.resolve(false); },
  projectFileText: function (pid, fid) { return work.getText(fid, pid); },
  releaseSync: function () { return syncStatus.release(); },
  durabilityStatus: durability.status,

  // the open document
  createPersist: documents.createPersist,

  // projects
  listProjects: work.listProjects,
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
