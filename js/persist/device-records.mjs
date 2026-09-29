/**
 * Device state too large or too structured for the device table
 * (docs/PERSIST.md §4.3): the REPL transcript and command history, editor
 * folds, notifications, the undo stack, the tab guard's handshake, and this
 * project's workspace, side panel and explorer folds.
 *
 * Two stores: `store` (localStorage: survives the browser closing) and
 * `tabStore` (sessionStorage: survives a reload, dies with the tab). A setting
 * that reads "local | session | none" picks between them.
 *
 * ⛔ A setting that decides WHERE records live moves them when it changes,
 * whoever changed it (the dialog, `:set`, an import, another tab). Switching the
 * REPL history from this device to this tab carries the history across.
 */
import {
  NOTIFICATIONS_KEY,
  REPL_TRANSCRIPT_KEY,
  REPL_COMMANDS_KEY,
  tabMessageKey,
  foldsKey,
  undoKey,
} from './keys.mjs';

const TAB_PREFIX = 'beljar/tabs/';
const SIDE_PANEL_IDS = ['explorer', 'inspector', 'library', 'harpoon'];

function stringList(raw) {
  return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string' && x) : [];
}

export function create(deps) {
  const { store, tabStore, work, settings } = deps;

  function storeFor(mode) {
    if (mode === 'local') return store;
    if (mode === 'session') return tabStore;
    return null;
  }

  /** When `settingId` moves, carry the records `keysIn(store)` names to the new store. */
  function followSetting(settingId, keysIn) {
    let last = settings.get(settingId);
    settings.subscribe((e) => {
      if (e.ids.indexOf(settingId) === -1) return;
      const prev = last;
      const next = settings.get(settingId);
      last = next;
      if (prev === next) return;
      const from = storeFor(prev);
      const to = storeFor(next);
      if (!from) return;
      for (const key of keysIn(from)) {
        const data = from.get(key);
        if (to && data !== undefined && to.get(key) === undefined) to.set(key, data);
        from.remove(key);
      }
    });
  }

  // ── the REPL: transcript and command history ───────────────────────────────

  const replStore = () => storeFor(settings.get('replHistoryPersist'));
  followSetting('replHistoryPersist', () => [REPL_TRANSCRIPT_KEY, REPL_COMMANDS_KEY]);

  function readReplTranscript() {
    const s = replStore();
    const d = s && s.get(REPL_TRANSCRIPT_KEY);
    if (!d || typeof d !== 'object' || typeof d.html !== 'string') return null;
    return {
      html: d.html,
      scrollTop: typeof d.scrollTop === 'number' ? d.scrollTop : 0,
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
    };
  }

  function writeReplTranscript(snap) {
    const s = replStore();
    if (!s) return;
    if (!snap || typeof snap.html !== 'string' || !snap.html) {
      s.remove(REPL_TRANSCRIPT_KEY);
      return;
    }
    s.set(REPL_TRANSCRIPT_KEY, {
      html: snap.html,
      scrollTop: typeof snap.scrollTop === 'number' ? snap.scrollTop : 0,
      savedAt: typeof snap.savedAt === 'number' ? snap.savedAt : Date.now(),
    });
  }

  function clampCommands(list) {
    const arr = Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
    const cap = settings.get('replHistoryCap');
    return arr.length > cap ? arr.slice(arr.length - cap) : arr;
  }

  function readReplCommands() {
    const s = replStore();
    return s ? clampCommands(s.get(REPL_COMMANDS_KEY)) : [];
  }

  function writeReplCommands(list) {
    const s = replStore();
    if (!s) return;
    const arr = clampCommands(list);
    if (arr.length) s.set(REPL_COMMANDS_KEY, arr);
    else s.remove(REPL_COMMANDS_KEY);
  }

  // ── editor folds, per file of this project ────────────────────────────────

  const foldStore = () => storeFor(settings.get('editorFoldPersist'));
  followSetting('editorFoldPersist', (s) => s.keys('beljar/p/').filter((k) => k.endsWith('/folds')));

  function readFileFolds(fid) {
    const s = foldStore();
    const d = s && s.get(foldsKey(work.projectId()));
    return d && typeof d === 'object' ? stringList(d[fid]) : [];
  }

  /** Files that no longer exist are dropped on every write. */
  function writeFileFolds(fid, keys) {
    const s = foldStore();
    if (!s || !fid) return;
    const key = foldsKey(work.projectId());
    const cur = s.get(key);
    const live = new Set(work.peekTree().files.map((f) => f.id));
    const next = {};
    if (cur && typeof cur === 'object') {
      for (const id of Object.keys(cur)) if (live.has(id)) next[id] = cur[id];
    }
    const clean = stringList(keys);
    if (clean.length && live.has(fid)) next[fid] = clean;
    else delete next[fid];
    if (Object.keys(next).length) s.set(key, next);
    else s.remove(key);
  }

  // ── notifications ─────────────────────────────────────────────────────────

  function readNotifications() {
    const d = store.get(NOTIFICATIONS_KEY);
    return Array.isArray(d) ? d : [];
  }

  function writeNotifications(items) {
    const list = Array.isArray(items) ? items : [];
    if (list.length) store.set(NOTIFICATIONS_KEY, list);
    else store.remove(NOTIFICATIONS_KEY);
  }

  // ── the undo stack: the tab store, per project ────────────────────────────

  function readUndoStack(pid) {
    const d = tabStore.get(undoKey(pid));
    return d && typeof d === 'object' ? d : null;
  }

  /** False when the tab store refused it (full): the caller sheds and retries. */
  function writeUndoStack(pid, data) {
    return tabStore.set(undoKey(pid), data).ok;
  }

  function clearUndoStack(pid) {
    tabStore.remove(undoKey(pid));
  }

  // ── the tab guard's handshake ─────────────────────────────────────────────

  function postTabMessage(kind, msg) {
    store.set(tabMessageKey(kind), msg);
  }

  /** fn(kind, msg) for every message ANOTHER tab posts; returns the unsubscribe. */
  function onTabMessage(fn) {
    return store.subscribe((e) => {
      if (e.origin !== 'tab' || !e.key || e.key.indexOf(TAB_PREFIX) !== 0 || e.data === undefined) return;
      fn(e.key.slice(TAB_PREFIX.length), e.data);
    });
  }

  // ── this project's workspace, side panel and explorer folds (its session) ──
  // Early boot reads `panel` straight from the session (keys.readBootSession)
  // to open the panel before first paint.

  function sidePanelOrNull(id) {
    return id && SIDE_PANEL_IDS.indexOf(id) !== -1 ? id : null;
  }

  function readSidePanel(pid) {
    return sidePanelOrNull(work.peekSession(pid || undefined).panel);
  }

  function writeSidePanel(id, pid) {
    const panel = sidePanelOrNull(id);
    work.updateSession((s) => { s.panel = panel; }, pid || undefined);
  }

  function readWorkspace(pid) {
    return work.readSession(pid || undefined).workspace;
  }

  function writeWorkspace(snapshot, pid) {
    return work.updateSession((s) => {
      s.workspace = snapshot && typeof snapshot === 'object' ? snapshot : null;
      if (s.workspace) s.panel = sidePanelOrNull(s.workspace.activeSidePanel);
    }, pid || undefined).ok;
  }

  function resetWorkspace(pid) {
    work.updateSession((s) => {
      s.workspace = null;
      s.panel = null;
    }, pid || undefined);
  }

  function readExplorerFolds() {
    return work.peekSession().explorerFolds.slice();
  }

  function writeExplorerFolds(paths) {
    work.updateSession((s) => { s.explorerFolds = stringList(paths); });
  }

  return {
    readReplTranscript,
    writeReplTranscript,
    readReplCommands,
    writeReplCommands,
    readFileFolds,
    writeFileFolds,
    readNotifications,
    writeNotifications,
    readUndoStack,
    writeUndoStack,
    clearUndoStack,
    postTabMessage,
    onTabMessage,
    readSidePanel,
    writeSidePanel,
    readWorkspace,
    writeWorkspace,
    resetWorkspace,
    readExplorerFolds,
    writeExplorerFolds,
  };
}
