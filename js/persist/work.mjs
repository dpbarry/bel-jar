/**
 * The work model's records: projects, each project's tree, file text, session
 * and semantic cache (docs/PERSIST.md §4.2). Everything here goes through the
 * store; nothing here knows about the editor, the explorer or `.cfg` files.
 *
 * ⛔ A page is pinned to its project. `projectId()` is decided once, on first
 * use, and changes only through `setActiveProject` (after which the app
 * reloads). The device table's `activeProject` is which project to open NEXT time:
 * every tab shares it, so reading it per call let a second tab switching
 * projects redirect this tab's saves into the other project.
 *
 * ⛔ No record is shared by every project. Each project is its own `meta`
 * record, so two tabs creating or renaming projects at the same moment cannot
 * drop one another's (a single list record could: each tab wrote back the list
 * it had cached).
 *
 * Every project has an `owner`: the account it belongs to, or null for one
 * that lives only on this device. The list shows this device's own projects
 * and the signed-in account's, never another account's: one lab computer
 * serves many students (docs/PERSIST.md §5).
 *
 * Reads are cached per record and dropped on any store event for that record,
 * whoever wrote it (this tab, another tab, the online layer). Internal readers
 * (`peek*`) hand out the cached object and must not mutate it; everything
 * public returns a copy.
 */
import {
  projectPrefix,
  metaKey,
  treeKey,
  fileKey,
  sessionKey,
  cacheKey,
  conflictKey,
  syncKey,
  TOMBSTONES_KEY,
  SETTINGS_SYNC_KEY,
  parseKey,
  newId,
} from './keys.mjs';
import { createTable } from './table.mjs';
import { DEVICE, DEVICE_KEY } from './device-schema.mjs';

export const DEFAULT_PROJECT_NAME = 'Untitled Project';
export const FIRST_FILE_NAME = 'main.bel';

const CACHE_LIMIT = 1024;

function cleanName(name) {
  return String(name != null ? name : '').trim() || DEFAULT_PROJECT_NAME;
}

function stringList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const x of raw) {
    if (typeof x === 'string' && x && out.indexOf(x) === -1) out.push(x);
  }
  return out;
}

export function emptyTree() {
  return { files: [], folders: [], suites: {} };
}

function normalizeTree(raw) {
  const t = emptyTree();
  if (!raw || typeof raw !== 'object') return t;
  if (Array.isArray(raw.files)) {
    const seen = new Set();
    for (const f of raw.files) {
      if (!f || typeof f.id !== 'string' || !f.id || typeof f.name !== 'string' || seen.has(f.id)) continue;
      seen.add(f.id);
      t.files.push({ id: f.id, name: f.name });
    }
  }
  t.folders = stringList(raw.folders);
  if (raw.suites && typeof raw.suites === 'object' && !Array.isArray(raw.suites)) {
    for (const dir of Object.keys(raw.suites)) {
      const list = stringList(raw.suites[dir]);
      if (list.length) t.suites[dir] = list;
    }
  }
  return t;
}

function copyTree(t) {
  const suites = {};
  for (const dir of Object.keys(t.suites)) suites[dir] = t.suites[dir].slice();
  return {
    files: t.files.map((f) => ({ id: f.id, name: f.name })),
    folders: t.folders.slice(),
    suites,
  };
}

/**
 * A session with nothing recorded has `open: null`, not `[]`: "never chose"
 * (a project that arrived by import or sync) opens its active file, while
 * "closed every tab" opens nothing.
 */
function normalizeSession(raw) {
  const s = { open: null, active: null, views: {}, workspace: null, panel: null, explorerFolds: [] };
  if (!raw || typeof raw !== 'object') return s;
  if (Array.isArray(raw.open)) s.open = stringList(raw.open);
  if (typeof raw.active === 'string' && raw.active) s.active = raw.active;
  if (raw.views && typeof raw.views === 'object' && !Array.isArray(raw.views)) {
    for (const fid of Object.keys(raw.views)) {
      const v = raw.views[fid];
      if (v && typeof v === 'object') s.views[fid] = v;
    }
  }
  if (raw.workspace && typeof raw.workspace === 'object') s.workspace = raw.workspace;
  if (typeof raw.panel === 'string' && raw.panel) s.panel = raw.panel;
  s.explorerFolds = stringList(raw.explorerFolds);
  return s;
}

/**
 * A project's meta record: { name, createdAt, owner }. `owner` is the account
 * it belongs to, or null for a project that lives only on this device (the
 * sign-in claim flow and shared computers read it).
 */
function normalizeMeta(pid, raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: pid,
    name: cleanName(raw.name),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    owner: typeof raw.owner === 'string' && raw.owner ? raw.owner : null,
  };
}

function metaRecord(meta) {
  return { name: meta.name, createdAt: meta.createdAt, owner: meta.owner };
}

/**
 * Both versions of a file whose text changed on both sides in the same lines.
 * `source` is where theirs came from: 'tab' (another tab on this device) or
 * 'device' (another device, through sync).
 */
function normalizeConflict(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.theirs !== 'string' || typeof raw.mine !== 'string') return null;
  return {
    base: typeof raw.base === 'string' ? raw.base : '',
    mine: raw.mine,
    theirs: raw.theirs,
    at: typeof raw.at === 'number' ? raw.at : 0,
    source: raw.source === 'device' ? 'device' : 'tab',
  };
}

function sameTree(a, b) {
  return JSON.stringify(normalizeTree(a)) === JSON.stringify(normalizeTree(b));
}

/**
 * Synced projects deleted on this device, until the server has been told:
 * { pid: { version, owner, pending, at, name } }. `version` is the one this
 * device last synced; `pending` a commit sent but never answered (it may have
 * made the version after); `name` what it was called, for the person
 * (review-offline.mjs), '' in a tombstone written before it was kept.
 */
function normalizeTombstones(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const pid of Object.keys(raw)) {
    const t = raw[pid];
    if (!t || typeof t !== 'object' || typeof t.owner !== 'string' || !t.owner) continue;
    out[pid] = {
      version: Number.isInteger(t.version) && t.version > 0 ? t.version : 0,
      owner: t.owner,
      pending: typeof t.pending === 'string' && t.pending ? t.pending : null,
      at: typeof t.at === 'number' ? t.at : 0,
      name: typeof t.name === 'string' ? t.name : '',
    };
  }
  return out;
}

/**
 * @param {object} opts
 * @param {ReturnType<import('./store.mjs').createStore>} opts.store
 * @param {() => number} [opts.now]
 * @param {ReturnType<typeof createTable>} [opts.device]  the page's device table (one per page)
 */
export function createWork(opts) {
  const store = opts.store;
  const now = opts.now || (() => Date.now());
  const device = opts.device || createTable(store, { key: DEVICE_KEY, rows: DEVICE });

  // key → normalized record (trees, sessions) or text (files); plus the
  // project list under a name no storage key can have.
  const cache = new Map();
  const PROJECTS = ' projects';
  let pinned = null;

  store.subscribe((evt) => {
    if (evt.key == null) {
      cache.clear();
      return;
    }
    cache.delete(evt.key);
    const k = parseKey(evt.key);
    if (k && k.kind === 'meta') cache.delete(PROJECTS);
  });

  function remember(key, value) {
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, value);
    return value;
  }

  function cached(key, load) {
    if (cache.has(key)) return cache.get(key);
    return remember(key, load(store.get(key)));
  }

  /** Write, and on success cache what was written (the store's own event dropped the old entry). */
  function put(key, value, stored) {
    const res = store.set(key, stored !== undefined ? stored : value);
    if (res.ok) remember(key, value);
    return res;
  }

  // ── projects ──────────────────────────────────────────────────────────────

  /** Every project with a meta record, oldest first. */
  function peekProjects() {
    if (cache.has(PROJECTS)) return cache.get(PROJECTS);
    const list = [];
    for (const key of store.keys('beljar/p/')) {
      const k = parseKey(key);
      if (!k || k.kind !== 'meta') continue;
      const meta = normalizeMeta(k.pid, store.get(key));
      if (meta) list.push(meta);
    }
    list.sort((a, b) => (a.createdAt - b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return remember(PROJECTS, list);
  }

  function hasProject(pid) {
    return peekProjects().some((p) => p.id === pid);
  }

  // ── accounts: whose projects this browser shows ──────────────────────────

  /** The account this browser is signed in as, or null. */
  function account() {
    return device.get('account') || null;
  }

  /**
   * Signed in as `uid`, or signed out (null). The caller reloads: the list
   * changes. The account that kept its projects here signing in again takes
   * them back as its own (they sync again): nothing is kept for it any more.
   */
  function setAccount(uid) {
    if (uid && kept().includes(String(uid))) device.set('keptAccounts', kept().filter((id) => id !== String(uid)));
    // Signing in: once its work is here, the account's (not a blank
    // placeholder) is what this page should show. What it had open when it
    // signed out here is remembered by removeAccountProjects.
    if (uid && device.get('resumeAccount') !== String(uid)) setResume(String(uid), '');
    if (uid) return device.set('account', String(uid));
    return device.reset((row) => row.id === 'account');
  }

  function setResume(uid, pid) {
    device.set('resumeAccount', uid);
    if (pid) device.set('resumeProject', pid);
    else device.reset((row) => row.id === 'resumeProject');
  }

  /** Signed in as `uid` and not yet back at its work: { project } ('' the newest), or null. */
  function resumeFor(uid) {
    if (!uid || device.get('resumeAccount') !== String(uid)) return null;
    return { project: device.get('resumeProject') || '' };
  }

  function clearResume() {
    return device.reset((row) => row.id === 'resumeAccount' || row.id === 'resumeProject');
  }

  /**
   * A project BelJar made so the list is never empty, that nobody has written
   * in: no account, the default name, one empty first file, no folders or
   * suites. Dropping it loses nothing.
   */
  function isBlankProject(pid) {
    const meta = normalizeMeta(pid, store.get(metaKey(pid)));
    if (!meta || meta.owner !== null || meta.name !== DEFAULT_PROJECT_NAME) return false;
    const t = peekTree(pid);
    if (t.files.length !== 1 || t.files[0].name !== FIRST_FILE_NAME || t.folders.length) return false;
    if (t.suites && Object.keys(t.suites).length) return false;
    return getText(t.files[0].id, pid) === '';
  }

  /**
   * Signing out with "Keep in this browser": `uid`'s projects stay, with their
   * sync bookkeeping, and show while nobody is signed in. Another account that
   * signs in neither sees them nor adopts them (they are not ownerless).
   */
  function keepAccountProjects(uid) {
    return uid ? device.set('keptAccounts', kept().concat(String(uid))) : false;
  }

  function kept() {
    const ids = device.get('keptAccounts');
    return Array.isArray(ids) ? ids : [];
  }

  function isVisible(p) {
    if (p.owner === null || p.owner === account()) return true;
    return !account() && kept().includes(p.owner);
  }

  /** The projects this page may show: this device's own, and the account's. */
  function peekVisible() {
    return peekProjects().filter(isVisible);
  }

  /**
   * A project that lives only on this device becomes the account's (and
   * starts to sync). Refused signed out, or for another account's project.
   */
  function claimProject(pid) {
    const uid = account();
    const meta = normalizeMeta(pid, store.get(metaKey(pid)));
    if (!uid || !meta || meta.owner !== null) return false;
    meta.owner = uid;
    return put(metaKey(pid), metaRecord(meta)).ok;
  }

  /**
   * Signing out on a shared computer: remove every project `uid` owns from
   * this device, with the sync bookkeeping that went with them. The server
   * keeps them; signing in again brings them back. Returns how many went.
   */
  function removeAccountProjects(uid) {
    if (!uid) return 0;
    // What was open here, to come back to when the account signs in again.
    const open = pinned || device.get('activeProject');
    const wasTheirs = peekProjects().some((p) => p.id === open && p.owner === uid);
    setResume(String(uid), wasTheirs ? open : '');
    let n = 0;
    for (const p of peekProjects()) {
      if (p.owner !== uid) continue;
      store.remove(metaKey(p.id));
      store.removeAll(projectPrefix(p.id));
      if (pinned === p.id) pinned = null;
      n += 1;
    }
    const tombs = readTombstones();
    let dropped = false;
    for (const pid of Object.keys(tombs)) {
      if (tombs[pid].owner === uid) { delete tombs[pid]; dropped = true; }
    }
    if (dropped) writeTombstones(tombs);
    const synced = store.get(SETTINGS_SYNC_KEY);
    if (synced && synced.account === uid) store.remove(SETTINGS_SYNC_KEY);
    // Nothing of theirs is here now: nothing waits, and nothing is kept.
    if (device.get('syncHeldFor') === String(uid)) device.reset((row) => row.id === 'syncHeldFor');
    if (kept().includes(String(uid))) device.set('keptAccounts', kept().filter((id) => id !== String(uid)));
    return n;
  }

  function readTombstones() {
    return normalizeTombstones(store.get(TOMBSTONES_KEY));
  }

  function writeTombstones(tombs) {
    return Object.keys(tombs).length ? store.set(TOMBSTONES_KEY, tombs) : store.remove(TOMBSTONES_KEY);
  }

  function writeDevice(pid) {
    return device.set('activeProject', pid);
  }

  /**
   * A new project with one empty `main.bel`, open and active, or null when
   * storage refused it (full, or read-only). Its meta record is written LAST
   * and only after the tree and session landed: an interrupted create leaves
   * nothing listed, and a refused one leaves nothing at all. Signed in, it
   * belongs to the account; signed out, to this device.
   */
  function createProject(name) {
    const pid = newId('p', (id) => store.keys(projectPrefix(id)).length > 0);
    const fid = newId('f');
    const landed = put(treeKey(pid), normalizeTree({ files: [{ id: fid, name: FIRST_FILE_NAME }] })).ok
      && put(sessionKey(pid), normalizeSession({ open: [fid], active: fid })).ok
      && put(metaKey(pid), metaRecord({ name: cleanName(name), createdAt: now(), owner: account() })).ok;
    if (landed) return pid;
    store.removeAll(projectPrefix(pid));
    return null;
  }

  /** There is always at least one project this page can show: the first run creates it. */
  function ensureProjects() {
    if (!peekVisible().length) {
      const pid = createProject(DEFAULT_PROJECT_NAME);
      if (!pid) throw new Error('BelJar could not create a project: storage refused the write (full, or owned by another version)');
      writeDevice(pid);
    }
    return peekVisible();
  }

  function listProjects() {
    return ensureProjects().map((p) => Object.assign({}, p));
  }

  /** The project this page settled on, or null before it asked: never creates one. */
  function pinnedProject() {
    return pinned;
  }

  /** The project this page works on. See the header: pinned, not re-read. */
  function projectId() {
    if (pinned) return pinned;
    const list = ensureProjects();
    const want = device.get('activeProject');
    pinned = list.some((p) => p.id === want) ? want : list[0].id;
    if (want !== pinned) writeDevice(pinned);
    return pinned;
  }

  function getProject(pid) {
    const p = peekProjects().find((x) => x.id === (pid || projectId()));
    return p ? Object.assign({}, p) : null;
  }

  /** Make `pid` this page's project and the one the next load opens. The caller reloads. */
  function setActiveProject(pid) {
    if (!ensureProjects().some((p) => p.id === pid)) return false;
    writeDevice(pid);
    pinned = pid;
    return true;
  }

  /** Rename touches this project's record and nothing else. */
  function renameProject(pid, name) {
    const meta = normalizeMeta(pid, store.get(metaKey(pid)));
    if (!meta) return false;
    meta.name = cleanName(name);
    return put(metaKey(pid), metaRecord(meta)).ok;
  }

  /**
   * Delete a project and every record under it. Refuses the last project.
   * Returns the project to fall back to (the one before it), or null. The meta
   * record goes first, so an interrupted delete leaves nothing listed. A
   * project the server has leaves a tombstone, so sync can delete it there.
   */
  function deleteProject(pid) {
    const list = ensureProjects();
    if (list.length <= 1) return null;
    const idx = list.findIndex((p) => p.id === pid);
    if (idx === -1) return null;
    const others = list.filter((p) => p.id !== pid);
    const owner = list[idx].owner;
    const synced = store.get(syncKey(pid));
    if (owner && synced && typeof synced === 'object' && (synced.version > 0 || synced.pending)) {
      const tombs = readTombstones();
      tombs[pid] = {
        version: synced.version > 0 ? synced.version : 0,
        owner,
        pending: synced.pending && typeof synced.pending.id === 'string' ? synced.pending.id : null,
        at: now(),
        name: list[idx].name,
      };
      if (!writeTombstones(tombs).ok) return null;
    }
    store.remove(metaKey(pid));
    store.removeAll(projectPrefix(pid));
    const next = others[Math.max(0, idx - 1)].id;
    if (device.get('activeProject') === pid) writeDevice(next);
    if (pinned === pid) pinned = next;
    return next;
  }

  // ── the tree ──────────────────────────────────────────────────────────────

  function peekTree(pid) {
    return cached(treeKey(pid || projectId()), normalizeTree);
  }

  function readTree(pid) {
    return copyTree(peekTree(pid));
  }

  /** Replace the tree. A project that no longer exists (deleted in another tab) is not recreated. */
  function writeTree(tree, pid) {
    pid = pid || projectId();
    if (!hasProject(pid)) return { ok: false, error: { code: 'gone' } };
    return put(treeKey(pid), normalizeTree(tree));
  }

  /** `fn` gets a copy to change (or replace, by returning one). */
  function updateTree(fn, pid) {
    const draft = readTree(pid);
    const next = fn(draft);
    return writeTree(next || draft, pid);
  }

  function hasFile(fid, pid) {
    return peekTree(pid).files.some((f) => f.id === fid);
  }

  function newFileId(pid) {
    const files = peekTree(pid).files;
    return newId('f', (id) => files.some((f) => f.id === id));
  }

  // ── file text ─────────────────────────────────────────────────────────────

  function getText(fid, pid) {
    return cached(fileKey(pid || projectId(), fid), (d) => (d && typeof d.text === 'string' ? d.text : ''));
  }

  function setText(fid, text, pid) {
    const t = String(text != null ? text : '');
    return put(fileKey(pid || projectId(), fid), t, { text: t });
  }

  /**
   * Who wrote a file's text last: 'sync' when it came from another device,
   * 'local' when this device wrote it (this tab or another). A conflict names
   * the other side by it.
   */
  function textOrigin(fid, pid) {
    const d = store.get(fileKey(pid || projectId(), fid));
    return d && d.via === 'sync' ? 'sync' : 'local';
  }

  /** Drop everything stored for these files: text, cache, conflict and view. One session write, however many. */
  function removeFiles(fids, pid) {
    pid = pid || projectId();
    const views = peekSession(pid).views;
    let hadView = false;
    for (const fid of fids) {
      store.remove(fileKey(pid, fid));
      store.remove(cacheKey(pid, fid));
      store.remove(conflictKey(pid, fid));
      if (views[fid]) hadView = true;
    }
    if (hadView) {
      updateSession((draft) => {
        for (const fid of fids) delete draft.views[fid];
      }, pid);
    }
  }

  // ── the session (device: open tabs, active file, views, layout) ───────────

  function peekSession(pid) {
    return cached(sessionKey(pid || projectId()), normalizeSession);
  }

  function readSession(pid) {
    return JSON.parse(JSON.stringify(peekSession(pid)));
  }

  /** `fn` gets a copy to change. Ids that are not files of the project are dropped on write. */
  function updateSession(fn, pid) {
    pid = pid || projectId();
    if (!hasProject(pid)) return { ok: false, error: { code: 'gone' } };
    const draft = readSession(pid);
    const next = normalizeSession(fn(draft) || draft);
    const live = new Set(peekTree(pid).files.map((f) => f.id));
    if (next.open) next.open = next.open.filter((id) => live.has(id));
    if (next.active && !live.has(next.active)) next.active = null;
    for (const fid of Object.keys(next.views)) {
      if (!live.has(fid)) delete next.views[fid];
    }
    return put(sessionKey(pid), next);
  }

  // ── the semantic cache ────────────────────────────────────────────────────

  function readCache(fid, pid) {
    const d = store.get(cacheKey(pid || projectId(), fid));
    return d && typeof d === 'object' ? d : null;
  }

  function writeCache(fid, data, pid) {
    const key = cacheKey(pid || projectId(), fid);
    if (data == null) return store.remove(key);
    return store.set(key, data);
  }

  // ── conflicts: both versions, until a person chooses (device) ─────────────

  function readConflict(fid, pid) {
    return normalizeConflict(store.get(conflictKey(pid || projectId(), fid)));
  }

  function writeConflict(fid, conflict, pid) {
    return store.set(conflictKey(pid || projectId(), fid), conflict);
  }

  function removeConflict(fid, pid) {
    return store.remove(conflictKey(pid || projectId(), fid));
  }

  /**
   * Every file changed in two places and waiting for a person, in the projects
   * this page may show: [{ pid, project, fid, path, source, at }]. Keys and trees
   * only, never a file's text: the cloud and the strip read it on every change.
   */
  function listConflicts() {
    const out = [];
    for (const p of peekVisible()) {
      const prefix = projectPrefix(p.id) + 'conflict/';
      const keys = store.keys(prefix);
      if (!keys.length) continue;
      const names = new Map(peekTree(p.id).files.map((f) => [f.id, f.name]));
      for (const key of keys) {
        const fid = key.slice(prefix.length);
        const rec = normalizeConflict(store.get(key));
        if (!rec) continue;
        out.push({ pid: p.id, project: p.name, fid, path: names.get(fid) || fid, source: rec.source, at: rec.at });
      }
    }
    return out;
  }

  /**
   * Both sides of a file changed in two places: `mine` is kept in the conflict
   * record, `theirs` is what storage holds (docs/PERSIST.md §4.4). Null when the
   * file has no conflict.
   */
  function conflictSides(fid, pid) {
    const rec = readConflict(fid, pid);
    if (!rec) return null;
    return { base: rec.base, mine: rec.mine, theirs: getText(fid, pid), source: rec.source, at: rec.at };
  }

  /**
   * A person chose, for a file no editor on this page holds: 'mine' writes this
   * side over the other (sync carries it up), 'theirs' keeps what storage holds.
   * The open file goes through its document instead, which also moves the editor.
   */
  function resolveStoredConflict(fid, choice, pid) {
    const rec = readConflict(fid, pid);
    if (!rec || (choice !== 'mine' && choice !== 'theirs')) return false;
    if (choice === 'mine' && !setText(fid, rec.mine, pid).ok) return false;
    removeConflict(fid, pid);
    return true;
  }

  // ── the online layer's door (sync/engine.mjs) ─────────────────────────────

  /**
   * One project as it stands, read in one go: { meta, tree, texts: { fid:
   * text }, conflicted: Set<fid> } (files with a conflict waiting for a
   * person), or null when there is no such project.
   */
  function snapshotProject(pid) {
    const meta = normalizeMeta(pid, store.get(metaKey(pid)));
    if (!meta) return null;
    const tree = copyTree(peekTree(pid));
    const texts = {};
    for (const f of tree.files) texts[f.id] = getText(f.id, pid);
    const conflicted = new Set();
    const prefix = projectPrefix(pid) + 'conflict/';
    for (const key of store.keys(prefix)) conflicted.add(key.slice(prefix.length));
    return { meta, tree, texts, conflicted };
  }

  /**
   * Make a project what another device made it (a merge, or a download).
   * `next`: { name, createdAt, files: [{ id, path, text }], folders, suites }.
   * Conflict records land first (a side is kept before storage moves to the
   * other), then texts, then the tree, then the meta record (a new project is
   * listed only once it is whole), and only then do dropped files go. Only
   * what differs is written, through `applyRemote`: an open editor takes it
   * as it takes another tab's change. Returns false when storage refused a
   * write; nothing after it was attempted.
   */
  function applyProject(pid, next, opts) {
    const o = opts || {};
    const at = now();
    const before = normalizeMeta(pid, store.get(metaKey(pid)));
    const prev = before ? peekTree(pid) : emptyTree();
    for (const c of o.conflicts || []) {
      const rec = { base: c.base, mine: c.mine, theirs: c.theirs, at, source: 'device' };
      if (!store.set(conflictKey(pid, c.id), rec).ok) return false;
    }
    for (const f of next.files) {
      const key = fileKey(pid, f.id);
      if (before && store.get(key) !== undefined && getText(f.id, pid) === f.text) continue;
      if (!store.applyRemote(key, { text: f.text, via: 'sync' }, at).ok) return false;
    }
    const tree = normalizeTree({
      files: next.files.map((f) => ({ id: f.id, name: f.path })),
      folders: next.folders,
      suites: next.suites,
    });
    if (!before || !sameTree(tree, prev)) {
      if (!store.applyRemote(treeKey(pid), tree, at).ok) return false;
    }
    const meta = {
      name: cleanName(next.name),
      createdAt: next.createdAt || (before ? before.createdAt : at),
      owner: before ? before.owner : (o.owner || null),
    };
    if (!before || before.name !== meta.name || before.createdAt !== meta.createdAt) {
      if (!store.applyRemote(metaKey(pid), metaRecord(meta), at).ok) return false;
    }
    const keep = new Set(next.files.map((f) => f.id));
    for (const f of prev.files) {
      if (keep.has(f.id)) continue;
      store.applyRemote(fileKey(pid, f.id), null);
      store.remove(cacheKey(pid, f.id));
      store.remove(conflictKey(pid, f.id));
    }
    return true;
  }

  /**
   * Remove a project another device deleted. No tombstone: the server
   * already knows. The meta record goes first, as a change from elsewhere,
   * so a page showing the project learns it is gone.
   */
  function forgetProject(pid) {
    store.applyRemote(metaKey(pid), null);
    store.removeAll(projectPrefix(pid));
    if (pinned === pid) pinned = null;
  }

  /**
   * What a person needs to recognise a project: how many files, how much text
   * (UTF-16 code units, near enough to bytes for a label), and when any of its
   * work was last written (0 if never).
   */
  function projectStats(pid) {
    const tree = peekTree(pid);
    let size = 0;
    let editedAt = store.at(metaKey(pid));
    editedAt = Math.max(editedAt, store.at(treeKey(pid)));
    for (const f of tree.files) {
      size += getText(f.id, pid).length;
      editedAt = Math.max(editedAt, store.at(fileKey(pid, f.id)));
    }
    return { files: tree.files.length, size, editedAt };
  }

  /** Every project on this device, whoever owns it (the engine filters by account). */
  function allProjects() {
    return peekProjects().map((p) => Object.assign({}, p));
  }

  function dropTombstone(pid) {
    const tombs = readTombstones();
    if (!(pid in tombs)) return { ok: true };
    delete tombs[pid];
    return writeTombstones(tombs);
  }

  // ── changes to file text, from anywhere ───────────────────────────────────

  /**
   * fn({ pid, fid, origin }) whenever a file's text record changes: this tab,
   * another tab, or the online layer. A clear of the whole storage arrives as
   * { pid: null, fid: null }. Returns the unsubscribe.
   */
  function onFileChange(fn) {
    return store.subscribe((evt) => {
      if (evt.key == null) {
        fn({ pid: null, fid: null, origin: evt.origin });
        return;
      }
      const k = parseKey(evt.key);
      if (k && k.kind === 'f') fn({ pid: k.pid, fid: k.fid, origin: evt.origin });
    });
  }

  return {
    // projects
    listProjects,
    getProject,
    hasProject,
    projectId,
    pinnedProject,
    setActiveProject,
    createProject,
    renameProject,
    deleteProject,
    // tree
    peekTree,
    readTree,
    writeTree,
    updateTree,
    hasFile,
    newFileId,
    // text
    getText,
    setText,
    textOrigin,
    removeFiles,
    // session
    peekSession,
    readSession,
    updateSession,
    // cache
    readCache,
    writeCache,
    // conflicts
    readConflict,
    writeConflict,
    removeConflict,
    listConflicts,
    conflictSides,
    resolveStoredConflict,
    // accounts
    account,
    setAccount,
    resumeFor,
    clearResume,
    isBlankProject,
    claimProject,
    removeAccountProjects,
    keepAccountProjects,
    // the online layer
    allProjects,
    projectStats,
    snapshotProject,
    applyProject,
    forgetProject,
    readTombstones,
    dropTombstone,
    // events
    onFileChange,
  };
}
