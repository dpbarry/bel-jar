/**
 * The sync engine (docs/PERSIST.md §5): this device's projects and settings,
 * kept in step with the account's copy on the server.
 *
 * Local stays the truth the app reads; the server is a replica. For each
 * project the device keeps the version it last synced and that version's
 * manifest (`beljar/p/<pid>/sync`). One pass over a project:
 *
 *   the server is where this device left it   push, if anything here hashes
 *                                              differently (dirty is exact)
 *   the server moved on                        merge file by file against the
 *                                              synced version (merge-project),
 *                                              apply, then push the result
 *   the server deleted it                      forget it here, unless it changed
 *                                              here: an edit beats a delete
 *   it is not here yet                         download it
 *   it was deleted here (a tombstone)          delete it there, unless it changed
 *                                              there since: then it comes back
 *
 * ⛔ Never apply a merge to a project that moved while the engine waited.
 * Every change lands synchronously, right after checking that the project is
 * exactly as it was when its manifest was taken; if not, the pass starts
 * again. A write in this tab can therefore never be lost between reading and
 * writing (another tab's write in the same instant is the one window left,
 * and the tab guard warns about two tabs on one project).
 *
 * ⛔ A commit is recorded as pending before it is sent. A response that never
 * arrives is settled next time by sending the same commit again: the server
 * answers a commit id it has seen with the version it made, so nothing is
 * committed twice and no merge is run against this device's own work.
 *
 * Transport failures stop the round (`err.offline`); the runner retries.
 * Anything wrong with one project is reported for that project and the rest
 * go on.
 */
import { sha256, emptyManifest, normalizeManifest, manifestOf, sameManifest } from './protocol.mjs';
import { mergeProject } from './merge-project.mjs';
import { createSettingsSync } from './settings-sync.mjs';
import { syncKey, newId } from '../keys.mjs';

const ATTEMPTS = 8;

function unreachable(method, err) {
  const e = new Error('sync: ' + method + ' could not reach the server' + (err && err.message ? ' (' + err.message + ')' : ''));
  e.offline = true;
  e.cause = err;
  return e;
}

function bad(what) {
  return new Error('sync: ' + what);
}

function refused(res) {
  return Object.assign(new Error('sync: the server refused (' + res.error + ')'), { code: res.error });
}

function storageFailure(what) {
  return Object.assign(new Error('sync: storage refused ' + what), { storage: true });
}

/** A project's sync record, as far as it can be trusted. */
function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  let version = Number.isInteger(raw.version) && raw.version > 0 ? raw.version : 0;
  const manifest = version && raw.manifest ? normalizeManifest(raw.manifest) : null;
  if (!manifest) version = 0;
  let pending = null;
  if (raw.pending && typeof raw.pending === 'object' && typeof raw.pending.id === 'string' && raw.pending.id) {
    const m = normalizeManifest(raw.pending.manifest);
    const base = Number.isInteger(raw.pending.base) && raw.pending.base >= 0 ? raw.pending.base : -1;
    if (m && base >= 0) pending = { id: raw.pending.id, base, manifest: m };
  }
  return { version, manifest, pending };
}

function readHead(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object' || !Number.isInteger(raw.version) || raw.version < 1) throw bad('the server sent a head this version cannot read');
  const deleted = raw.deleted === true;
  const manifest = deleted ? null : normalizeManifest(raw.manifest);
  if (!deleted && !manifest) throw bad('the server sent a manifest this version cannot read');
  return { version: raw.version, deleted, manifest, commit: typeof raw.commit === 'string' ? raw.commit : null };
}

function readHeads(raw) {
  if (!Array.isArray(raw)) throw bad('the server sent a project list this version cannot read');
  const out = [];
  for (const h of raw) {
    if (!h || typeof h.id !== 'string' || !h.id || !Number.isInteger(h.version) || h.version < 1) continue;
    out.push({ id: h.id, version: h.version, deleted: h.deleted === true });
  }
  return out;
}

/**
 * @param {object} opts
 * @param {object} opts.store
 * @param {object} opts.work        work.mjs
 * @param {{ get(id: string): any }} opts.settings
 * @param {object} opts.transport   protocol.mjs describes it
 * @param {string} opts.account     whose projects these are
 * @param {(text: string) => Promise<string>} [opts.hash]   sha256 by default
 * @param {(notice: object) => void} [opts.notify]   what a person should hear about
 * @param {() => string} [opts.commitId]
 * @param {(event: { kind: 'moved', pid: string, at: string }) => void} [opts.trace]
 *   a pass that started again because the project moved while it waited
 */
export function createSyncEngine(opts) {
  const { store, work, transport, account } = opts;
  if (!account) throw new Error('sync: an engine syncs one account; none was given');
  const hash = opts.hash || sha256;
  const notify = opts.notify || (() => {});
  const commitId = opts.commitId || (() => newId('c'));
  const trace = opts.trace || (() => {});

  /** The project moved while the engine waited: this pass is void, and starts again. */
  function moved(pid, at) {
    trace({ kind: 'moved', pid, at });
    return null;
  }

  // file → { text, hash } for the last text hashed: one entry per file, so
  // memory stays one text per file however long the session runs.
  const hashed = new Map();

  async function call(method, ...args) {
    try {
      return await transport[method](...args);
    } catch (err) {
      throw unreachable(method, err);
    }
  }

  async function hashFile(pid, fid, text) {
    const key = pid + '/' + fid;
    const known = hashed.get(key);
    if (known && known.text === text) return known.hash;
    const h = await hash(text);
    hashed.set(key, { text, hash: h });
    return h;
  }

  function readRecord(pid) {
    return normalizeRecord(store.get(syncKey(pid)));
  }

  function writeRecord(pid, rec) {
    if (!store.set(syncKey(pid), rec).ok) throw storageFailure('the sync record');
  }

  /** This device's side of a project: a snapshot and the manifest its contents hash to. */
  async function localSide(pid) {
    const snap = work.snapshotProject(pid);
    if (!snap) return null;
    const hashes = {};
    for (const f of snap.tree.files) hashes[f.id] = await hashFile(pid, f.id, snap.texts[f.id]);
    snap.hashes = hashes;
    snap.manifest = manifestOf(snap.meta, snap.tree, hashes);
    return snap;
  }

  /** The project is exactly as `snap` found it. Synchronous: nothing can move while it runs. */
  function unchangedSince(pid, snap) {
    const now = work.snapshotProject(pid);
    if (!now) return false;
    if (now.meta.name !== snap.meta.name || now.meta.createdAt !== snap.meta.createdAt || now.meta.owner !== snap.meta.owner) return false;
    if (JSON.stringify(now.tree) !== JSON.stringify(snap.tree)) return false;
    for (const f of now.tree.files) if (now.texts[f.id] !== snap.texts[f.id]) return false;
    if (now.conflicted.size !== snap.conflicted.size) return false;
    for (const id of now.conflicted) if (!snap.conflicted.has(id)) return false;
    return true;
  }

  /** Texts by hash from the server, each checked against its hash. */
  async function fetchTexts(pid, wanted) {
    const got = new Map();
    if (!wanted.length) return got;
    const res = await call('blobs', pid, wanted);
    for (const h of wanted) {
      const text = res && typeof res[h] === 'string' ? res[h] : undefined;
      if (text === undefined) throw bad('the server is missing a file its version lists');
      if ((await hash(text)) !== h) throw bad('a file arrived damaged');
      got.set(h, text);
    }
    return got;
  }

  // ── commits ───────────────────────────────────────────────────────────────

  /** Settle a commit's answer. True when it made a version. */
  function settle(pid, kept, pending, res) {
    if (res && res.ok && Number.isInteger(res.version) && res.version > 0) {
      writeRecord(pid, { version: res.version, manifest: pending.manifest, pending: null });
      return true;
    }
    if (res && res.error) throw refused(res);
    // Refused because the server moved on, or a text went missing there: it
    // never landed. The next pass merges, or uploads again.
    writeRecord(pid, { version: kept.version, manifest: kept.manifest, pending: null });
    return false;
  }

  /** Upload what the server lacks, then commit this device's manifest over `base`. */
  async function push(pid, local, rec, base) {
    const texts = new Map();
    for (const f of local.tree.files) texts.set(local.hashes[f.id], local.texts[f.id]);
    const missing = await call('missing', pid, [...texts.keys()]);
    if (!Array.isArray(missing)) throw bad('the server sent an answer this version cannot read');
    if (missing.length) {
      const up = {};
      for (const h of missing) {
        if (!texts.has(h)) throw bad('the server asked for a file this version never named');
        up[h] = texts.get(h);
      }
      const res = await call('putBlobs', pid, up);
      if (res && res.error) throw refused(res);
      if (!res || !res.ok) throw bad('the server did not take the files');
    }
    const kept = { version: rec ? rec.version : 0, manifest: rec ? rec.manifest : null };
    const pending = { id: commitId(), base, manifest: local.manifest };
    writeRecord(pid, { version: kept.version, manifest: kept.manifest, pending });
    return settle(pid, kept, pending, await call('commit', pid, pending));
  }

  // ── one pass over one project ─────────────────────────────────────────────

  async function pull(pid, local, rec, head) {
    const theirs = head.manifest;
    const base = rec && rec.version ? rec.manifest : emptyManifest();
    const texts = new Map();
    for (const f of local.tree.files) texts.set(local.hashes[f.id], local.texts[f.id]);
    for (let fetched = false; ;) {
      const r = mergeProject({
        base,
        mine: local.manifest,
        mineTexts: local.texts,
        theirs,
        text: (h) => texts.get(h),
        conflicted: local.conflicted,
        newFileId: () => work.newFileId(pid),
      });
      if (r.needs) {
        if (fetched) throw bad('a merge needed a file the server did not send');
        for (const [h, t] of await fetchTexts(pid, r.needs)) texts.set(h, t);
        fetched = true;
        continue;
      }
      // Nothing is awaited from here to the last write.
      if (!unchangedSince(pid, local)) return moved(pid, 'merge');
      if (!work.applyProject(pid, r.project, { conflicts: r.conflicts })) throw storageFailure('a merged project');
      writeRecord(pid, { version: head.version, manifest: theirs, pending: null });
      for (const n of r.notices) notify(Object.assign({ pid, project: r.project.name }, n));
      return;
    }
  }

  async function download(pid, head) {
    const theirs = head.manifest;
    const got = await fetchTexts(pid, [...new Set(theirs.files.map((f) => f.hash))]);
    // Still not here, and not deleted here while the texts came.
    if (work.snapshotProject(pid) || work.readTombstones()[pid]) return moved(pid, 'download');
    const project = {
      name: theirs.name,
      createdAt: theirs.createdAt,
      files: theirs.files.map((f) => ({ id: f.id, path: f.path, text: got.get(f.hash) })),
      folders: theirs.folders,
      suites: theirs.suites,
    };
    if (!work.applyProject(pid, project, { owner: account })) throw storageFailure('a downloaded project');
    writeRecord(pid, { version: head.version, manifest: theirs, pending: null });
    return { status: 'downloaded' };
  }

  async function settleTombstone(pid, tomb, head) {
    if (!head || head.deleted) {
      work.dropTombstone(pid);
      return { status: 'deleted' };
    }
    // The version deleted here, or this device's own commit that was never
    // answered: nobody else has touched it, so the delete stands.
    if (head.version === tomb.version || (tomb.pending && head.commit === tomb.pending)) {
      const res = await call('remove', pid, { id: commitId(), base: head.version });
      if (res && res.ok) {
        work.dropTombstone(pid);
        return { status: 'deleted' };
      }
      if (res && res.error) throw refused(res);
      return null;
    }
    // Another device changed it after this one last synced it: an edit beats
    // a delete. The next pass downloads it again.
    work.dropTombstone(pid);
    notify({ kind: 'project-restored', pid, project: head.manifest.name });
    return null;
  }

  /** A result once the project is settled, or null to go round again. */
  async function step(pid, hint) {
    const rec = readRecord(pid);
    if (rec && rec.pending) {
      const res = await call('commit', pid, rec.pending);
      settle(pid, rec, rec.pending, res);
      return null;
    }
    const tomb = work.readTombstones()[pid];
    const local = await localSide(pid);
    if (local && local.meta.owner !== account) return { status: 'not-ours' };
    if (local && !local.manifest) return { status: 'error', message: 'two files share a path' };
    if (hint && local && rec && rec.version && !tomb && !hint.deleted && hint.version === rec.version
      && sameManifest(local.manifest, rec.manifest)) {
      return { status: 'clean' };
    }

    const head = readHead(await call('head', pid));
    if (!local) {
      if (tomb && tomb.owner === account) return settleTombstone(pid, tomb, head);
      if (!head || head.deleted) return { status: 'absent' };
      return download(pid, head);
    }
    if (!head) {
      // The server never had it, or no longer has it: all of it goes up.
      return (await push(pid, local, rec, 0)) ? { status: 'pushed' } : null;
    }
    const synced = rec && rec.version ? rec : null;
    if (head.deleted) {
      if (synced && sameManifest(local.manifest, synced.manifest) && !local.conflicted.size) {
        if (!unchangedSince(pid, local)) return moved(pid, 'forget');
        work.forgetProject(pid);
        notify({ kind: 'project-deleted', pid, project: local.meta.name });
        return { status: 'forgot' };
      }
      // Changed here since it was last synced: it goes back up over the deletion.
      if (!(await push(pid, local, rec, head.version))) return null;
      notify({ kind: 'project-kept', pid, project: local.meta.name });
      return { status: 'restored' };
    }
    if (synced && head.version === synced.version) {
      if (sameManifest(local.manifest, synced.manifest)) return { status: 'clean' };
      return (await push(pid, local, rec, head.version)) ? { status: 'pushed' } : null;
    }
    await pull(pid, local, rec, head);
    return null;
  }

  async function syncProject(pid, hint) {
    for (let i = 0; i < ATTEMPTS; i++) {
      const r = await step(pid, i === 0 ? hint : null);
      if (r) return Object.assign({ pid }, r);
    }
    return { pid, status: 'busy' };
  }

  const settingsSync = createSettingsSync({
    store,
    settings: opts.settings,
    account,
    commitId,
    call,
  });

  /**
   * One round: every project the account has here or there, and the
   * settings. Resolves to { projects: { pid: result }, settings: result };
   * rejects only when the server could not be reached (`err.offline`).
   */
  async function syncAll() {
    const heads = readHeads(await call('heads'));
    const byId = new Map(heads.map((h) => [h.id, h]));
    const ids = new Set();
    for (const p of work.allProjects()) if (p.owner === account) ids.add(p.id);
    const tombs = work.readTombstones();
    for (const pid of Object.keys(tombs)) if (tombs[pid].owner === account) ids.add(pid);
    for (const h of heads) if (!h.deleted) ids.add(h.id);
    const projects = {};
    for (const pid of [...ids].sort()) {
      try {
        projects[pid] = await syncProject(pid, byId.get(pid) || null);
      } catch (err) {
        if (err && err.offline) throw err;
        projects[pid] = { pid, status: 'error', message: String(err && err.message || err) };
      }
    }
    let settings;
    try {
      settings = await settingsSync.sync();
    } catch (err) {
      if (err && err.offline) throw err;
      settings = { status: 'error', message: String(err && err.message || err) };
    }
    return { projects, settings };
  }

  return { account, syncAll, syncProject, syncSettings: settingsSync.sync };
}
