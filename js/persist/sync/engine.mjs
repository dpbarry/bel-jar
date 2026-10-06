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
 * ⛔ At most one commit of a project is in flight. A push is ONE request: the
 * commit carries the texts the last synced version did not have, and the
 * server answers what else it lacks. ⛔ A commit is sent again exactly as it
 * first went, texts and all (they are kept with it in the sync record): sent
 * again bare while the first was still on its way, it came back "missing",
 * the record let it go, and the first landed later as another device's change
 * to merge against this device's own work (seed 8 of the simulator). The page going out of sight sends what
 * waits for the quiet spell at once (`flush`), in a request that outlives the
 * page; a pass that finds a commit in flight settles it first and never
 * commits over it, and a flush that finds one leaves it to go on.
 *
 * Transport failures stop the round (`err.stopsRound`): one that never reached
 * the server is `offline`; one the server answered with a status that is not
 * an answer (a limit, an outage) is `status`, and reads as "couldn't sync",
 * with its reason, never as offline. The runner retries either way.
 * Anything wrong with one project is reported for that project and the rest
 * go on.
 */
import { sha256, sha256Sync, emptyManifest, normalizeManifest, manifestOf, sameManifest, isHash } from './protocol.mjs';
import { mergeProject } from './merge-project.mjs';
import { createSettingsSync } from './settings-sync.mjs';
import { syncKey, newId } from '../keys.mjs';

const ATTEMPTS = 8;

// What one commit carries with it (server/sync-store.mjs LIMITS: 200 texts):
// more goes up in batches before it. Kept small enough to keep with the
// pending commit in the sync record, which is what makes sending it again safe.
const CARRY_TEXTS = 200;
const CARRY_BYTES = 512 * 1024;

const utf8Bytes = (text) => new TextEncoder().encode(String(text)).length;

function unreachable(method, err) {
  const e = new Error('sync: ' + method + ' could not reach the server' + (err && err.message ? ' (' + err.message + ')' : ''));
  e.offline = true;
  e.stopsRound = true;
  e.cause = err;
  return e;
}

/** The server answered `method` with a status that is not an answer: a limit, an outage. */
function refusedByServer(method, err) {
  const e = new Error('sync: the server answered ' + err.status + ' to ' + method);
  e.status = err.status;
  e.stopsRound = true;
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
    if (m && base >= 0) {
      pending = { id: raw.pending.id, base, manifest: m };
      // The texts it carries, so it is sent again exactly as it went.
      const t = raw.pending.texts;
      if (t && typeof t === 'object' && !Array.isArray(t) && Object.entries(t).every(([h, x]) => isHash(h) && typeof x === 'string') && Object.keys(t).length) {
        pending.texts = Object.assign({}, t);
      }
    }
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

/**
 * The list a round starts from: { heads, settings } (settings: the account's
 * settings version, or null when the server did not say). A server from
 * before settings rode along answers the bare list.
 */
function readList(raw) {
  if (Array.isArray(raw)) return { heads: readHeads(raw), settings: null };
  if (!raw || !Array.isArray(raw.projects)) throw bad('the server sent a project list this version cannot read');
  return { heads: readHeads(raw.projects), settings: Number.isInteger(raw.settings) && raw.settings >= 0 ? raw.settings : null };
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
 * @param {(text: string) => string} [opts.hashSync]   the same, at once (`flush`): sha256Sync
 * @param {(notice: object) => void} [opts.notify]   what a person should hear about
 * @param {() => string} [opts.commitId]
 * @param {(fn: () => any) => any} [opts.own]   runs `fn`, a write the engine makes itself
 * @param {(event: { kind: 'moved', pid: string, at: string }) => void} [opts.trace]
 *   a pass that started again because the project moved while it waited
 */
export function createSyncEngine(opts) {
  const { store, work, transport, account } = opts;
  if (!account) throw new Error('sync: an engine syncs one account; none was given');
  const hash = opts.hash || sha256;
  const hashSync = opts.hashSync || sha256Sync;
  const notify = opts.notify || (() => {});
  const commitId = opts.commitId || (() => newId('c'));
  const trace = opts.trace || (() => {});

  // What the engine writes to settle a round (a merge applied, a project
  // forgotten, a deletion settled) is its own doing, not a change waiting to
  // sync. `own` says so to whoever times the rounds (persist.mjs, runner.mjs).
  const own = opts.own || ((fn) => fn());
  const applyProject = (pid, next, o) => own(() => work.applyProject(pid, next, o));
  const forgetProject = (pid) => own(() => work.forgetProject(pid));
  const dropTombstone = (pid) => own(() => work.dropTombstone(pid));
  const removeConflict = (fid, pid) => own(() => work.removeConflict(fid, pid));

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
      throw err && Number.isInteger(err.status) ? refusedByServer(method, err) : unreachable(method, err);
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

  /** As hashFile, at once (`flush`: a page being closed may have no later turn). */
  function hashFileSync(pid, fid, text) {
    const key = pid + '/' + fid;
    const known = hashed.get(key);
    if (known && known.text === text) return known.hash;
    const h = hashSync(text);
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

  /** As localSide, at once. */
  function localSideSync(pid) {
    const snap = work.snapshotProject(pid);
    if (!snap) return null;
    const hashes = {};
    for (const f of snap.tree.files) hashes[f.id] = hashFileSync(pid, f.id, snap.texts[f.id]);
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

  /** Texts by hash from the server, the ones it has, each checked against its hash. */
  async function fetchSome(pid, wanted) {
    const got = new Map();
    if (!wanted.length) return got;
    const res = await call('blobs', pid, wanted);
    for (const h of wanted) {
      const text = res && typeof res[h] === 'string' ? res[h] : undefined;
      if (text === undefined) continue;
      if ((await hash(text)) !== h) throw bad('a file arrived damaged');
      got.set(h, text);
    }
    return got;
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

  /** The texts a commit carries: the ones its last synced version did not have (the server most likely lacks them). */
  function freshTexts(local, rec) {
    const known = new Set(rec && rec.version && rec.manifest ? rec.manifest.files.map((f) => f.hash) : []);
    const out = {};
    for (const f of local.tree.files) {
      const h = local.hashes[f.id];
      if (!known.has(h)) out[h] = local.texts[f.id];
    }
    return out;
  }

  function tooMuchToCarry(texts) {
    const all = Object.values(texts);
    if (all.length > CARRY_TEXTS) return true;
    let size = 0;
    for (const t of all) if ((size += utf8Bytes(t)) > CARRY_BYTES) return true;
    return false;
  }

  /** Texts too many for one commit to carry, sent ahead in batches the server takes. */
  async function upload(pid, texts) {
    let batch = {};
    let count = 0;
    let size = 0;
    const send = async () => {
      if (!count) return;
      const res = await call('putBlobs', pid, batch);
      if (res && res.error) throw refused(res);
      if (!res || !res.ok) throw bad('the server did not take the files');
      batch = {};
      count = 0;
      size = 0;
    };
    for (const [h, t] of Object.entries(texts)) {
      const b = utf8Bytes(t);
      if (count && (count >= CARRY_TEXTS || size + b > CARRY_BYTES)) await send();
      batch[h] = t;
      count += 1;
      size += b;
    }
    await send();
  }

  /**
   * Commit this device's manifest over `base`, carrying the texts the server
   * most likely lacks: one request. The server answers what else it lacks, and
   * those go in a second.
   */
  async function push(pid, local, rec, base) {
    const texts = new Map();
    for (const f of local.tree.files) texts.set(local.hashes[f.id], local.texts[f.id]);
    let carried = freshTexts(local, rec);
    if (tooMuchToCarry(carried)) {
      await upload(pid, carried);
      carried = {};
    }
    // ⛔ It was deleted while its texts went up: nothing of it is committed.
    // A commit landing after the tombstone was written reads, next round, as
    // another device's edit, which beats the deletion: the project would come
    // back. Nothing is awaited from here to the commit being recorded as
    // pending, and a tombstone written after that names it.
    const still = work.getProject(pid);
    if (!still || still.owner !== account) return moved(pid, 'push') || false;
    // ⛔ And its record is as this pass read it: no commit of it in flight (the
    // page hid meanwhile, and `flush` sent one), none settled since. A second
    // commit over the same version would lose to the first and come back as
    // another device's change to merge against this device's own work.
    const now = readRecord(pid);
    if ((now && now.pending) || (now ? now.version : 0) !== (rec ? rec.version : 0)) return moved(pid, 'pending') || false;
    const kept = { version: rec ? rec.version : 0, manifest: rec ? rec.manifest : null };
    const pending = { id: commitId(), base, manifest: local.manifest };
    if (Object.keys(carried).length) pending.texts = carried;
    writeRecord(pid, { version: kept.version, manifest: kept.manifest, pending });
    let res = await call('commit', pid, pending);
    if (res && !res.ok && Array.isArray(res.missing) && res.missing.length) {
      const more = {};
      for (const h of res.missing) {
        if (!texts.has(h)) throw bad('the server asked for a file this version never named');
        more[h] = texts.get(h);
      }
      if (tooMuchToCarry(more)) {
        await upload(pid, more);
      } else {
        // Recorded before it is sent, as the first was: sent again, it goes whole.
        pending.texts = Object.assign({}, pending.texts || {}, more);
        writeRecord(pid, { version: kept.version, manifest: kept.manifest, pending });
      }
      res = await call('commit', pid, pending);
    }
    return settle(pid, kept, pending, res);
  }

  /**
   * The page is going out of sight, and may be closing (a tab closed, a phone
   * switching apps): every project changed here since it last synced goes up
   * NOW, without the quiet spell, its commit and new texts in one request each,
   * sent by `send` so that it outlives the page (http-transport.mjs
   * `commitOnHide`). ⛔ Synchronous up to the sends: a page being closed may
   * have no later turn. Each commit is recorded as pending first, as every
   * commit is, so one that never lands is sent again at the next open, and its
   * answer, if the page lives to hear it, settles it. ⛔ A project with a commit
   * already in flight is left alone: that request goes on, or, cut off with the
   * page, is sent again at the next open. Sent again from here without its texts
   * it came back "missing", which cleared the record while the first was still
   * on its way, and a commit made over it next was a merge against this device's
   * own work. What does not fit in `budget`
   * bytes (the browser lets a closing page send 64 KB) waits for the next
   * round, as it always did; the project open here goes first.
   * Returns the projects sent.
   */
  function flush(send, budget) {
    const sent = [];
    let left = budget == null ? Infinity : budget;
    const tombs = work.readTombstones();
    const open = typeof work.pinnedProject === 'function' ? work.pinnedProject() : null;
    const mine = work.allProjects().filter((x) => x.owner === account && !tombs[x.id]);
    mine.sort((a, b) => (a.id === open ? -1 : b.id === open ? 1 : 0));
    for (const { id: pid } of mine) {
      try {
        const rec = readRecord(pid);
        if (rec && rec.pending) continue;
        const local = localSideSync(pid);
        if (!local || !local.manifest) continue;
        if (rec && rec.version && sameManifest(local.manifest, rec.manifest)) continue;
        const kept = { version: rec ? rec.version : 0, manifest: rec ? rec.manifest : null };
        const body = { id: commitId(), base: kept.version, manifest: local.manifest, texts: freshTexts(local, rec) };
        const size = utf8Bytes(JSON.stringify({ args: [pid, body] }));
        if (size > left) continue;
        writeRecord(pid, { version: kept.version, manifest: kept.manifest, pending: body });
        left -= size;
        sent.push(pid);
        Promise.resolve(send(pid, body)).then((res) => {
          // Settled only if nothing else has settled it since (a round, sending it again).
          const now = readRecord(pid);
          if (now && now.pending && now.pending.id === body.id) settle(pid, kept, now.pending, res);
        }).catch(() => { /* no answer: the next round sends it again */ });
      } catch (_) {
        /* this project waits for the next round; the rest still go */
      }
    }
    return sent;
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
        // "Changed in two places: Ask about every file" (Settings > Account).
        askAll: !!(opts.settings && opts.settings.get('syncBothChanged') === 'ask'),
      });
      if (r.needs) {
        if (fetched) throw bad('a merge needed a file the server did not send');
        const got = await fetchSome(pid, r.needs);
        const named = new Set(theirs.files.map((f) => f.hash));
        for (const h of r.needs) {
          if (got.has(h)) texts.set(h, got.get(h));
          // A text the server's own version names must be there.
          else if (named.has(h)) throw bad('the server is missing a file its version lists');
          // A base the server no longer has (pruned): the merge keeps both sides.
          else texts.set(h, null);
        }
        fetched = true;
        continue;
      }
      // Nothing is awaited from here to the last write.
      if (!unchangedSince(pid, local)) return moved(pid, 'merge');
      if (!applyProject(pid, r.project, { conflicts: r.conflicts })) throw storageFailure('a merged project');
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
    if (!applyProject(pid, project, { owner: account })) throw storageFailure('a downloaded project');
    writeRecord(pid, { version: head.version, manifest: theirs, pending: null });
    return { status: 'downloaded' };
  }

  // ── "Back online: Ask me first" (hold.mjs, review-offline.mjs) ────────────

  /**
   * What this device changed in the account's projects since they last synced,
   * for the person to see before it goes up: [{ pid, name, isNew, deleted,
   * renamed, files: [{ fid, path, change }] }], `change` one of 'added',
   * 'edited', 'renamed', 'deleted'. `isNew`: the cloud never had it from here;
   * `deleted`: deleted here. Local records only; nothing is sent.
   */
  async function localChanges() {
    const out = [];
    for (const p of work.allProjects()) {
      if (p.owner !== account) continue;
      const local = await localSide(p.id);
      if (!local || !local.manifest) continue;
      const rec = readRecord(p.id);
      const base = rec && rec.version ? rec.manifest : null;
      if (base && sameManifest(local.manifest, base)) continue;
      const before = new Map((base ? base.files : []).map((f) => [f.id, f]));
      const files = [];
      for (const f of local.manifest.files) {
        const b = before.get(f.id);
        before.delete(f.id);
        if (!b) files.push({ fid: f.id, path: f.path, change: 'added' });
        else if (b.hash !== f.hash) files.push({ fid: f.id, path: f.path, change: 'edited' });
        else if (b.path !== f.path) files.push({ fid: f.id, path: f.path, change: 'renamed' });
      }
      for (const [fid, b] of before) files.push({ fid, path: b.path, change: 'deleted' });
      out.push({
        pid: p.id,
        name: local.meta.name,
        isNew: !base,
        deleted: false,
        renamed: !!base && base.name !== local.meta.name,
        files,
      });
    }
    const tombs = work.readTombstones();
    for (const pid of Object.keys(tombs).sort()) {
      if (tombs[pid].owner !== account) continue;
      out.push({ pid, name: tombs[pid].name, isNew: false, deleted: true, renamed: false, files: [] });
    }
    return out;
  }

  /**
   * The cloud's side of a project, to set beside this device's: { state, name,
   * texts }. `state` is 'absent' (it never had it), 'deleted' or 'present';
   * `texts` holds the cloud's text of each of `fids`, null where it has no
   * such file.
   */
  async function cloudSide(pid, fids = []) {
    const head = readHead(await call('head', pid));
    if (!head) return { state: 'absent', name: null, texts: {} };
    if (head.deleted) return { state: 'deleted', name: null, texts: {} };
    const byId = new Map(head.manifest.files.map((f) => [f.id, f]));
    const got = await fetchTexts(pid, [...new Set(fids.map((id) => byId.get(id)).filter(Boolean).map((f) => f.hash))]);
    const texts = {};
    for (const id of fids) {
      const f = byId.get(id);
      texts[id] = f ? got.get(f.hash) : null;
    }
    return { state: 'present', name: head.manifest.name, texts };
  }

  /**
   * Make this device's copy of a project the cloud's ("Use the cloud’s"). The
   * cloud has it: every text, the tree and the name become the head's, a
   * deletion here is undone, and files waiting for review stop waiting. The
   * cloud deleted it: it goes here too. Either way nothing of this device's is
   * left to send. False when the cloud never had it: there is nothing to take.
   * An open editor takes the change as it takes another device's.
   */
  async function useCloud(pid) {
    const head = readHead(await call('head', pid));
    if (!head) return false;
    if (head.deleted) {
      if (work.readTombstones()[pid]) dropTombstone(pid);
      if (work.snapshotProject(pid)) forgetProject(pid);
      return true;
    }
    const theirs = head.manifest;
    const got = await fetchTexts(pid, [...new Set(theirs.files.map((f) => f.hash))]);
    const project = {
      name: theirs.name,
      createdAt: theirs.createdAt,
      files: theirs.files.map((f) => ({ id: f.id, path: f.path, text: got.get(f.hash) })),
      folders: theirs.folders,
      suites: theirs.suites,
    };
    // Nothing is awaited from here to the last write.
    const snap = work.snapshotProject(pid);
    if (snap) for (const fid of snap.conflicted) removeConflict(fid, pid);
    if (work.readTombstones()[pid]) dropTombstone(pid);
    if (!applyProject(pid, project, { owner: account })) throw storageFailure('the cloud’s version of a project');
    writeRecord(pid, { version: head.version, manifest: theirs, pending: null });
    return true;
  }

  async function settleTombstone(pid, tomb, head) {
    if (!head || head.deleted) {
      dropTombstone(pid);
      return { status: 'deleted' };
    }
    // The version deleted here, or this device's own commit that was never
    // answered: nobody else has touched it, so the delete stands.
    if (head.version === tomb.version || (tomb.pending && head.commit === tomb.pending)) {
      const res = await call('remove', pid, { id: commitId(), base: head.version });
      if (res && res.ok) {
        dropTombstone(pid);
        return { status: 'deleted' };
      }
      if (res && res.error) throw refused(res);
      return null;
    }
    // Another device changed it after this one last synced it: an edit beats
    // a delete. The next pass downloads it again.
    dropTombstone(pid);
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
    // The round's list says the server is where this device left it: clean, or
    // pushed over it at once, with no head to ask for (one request). Another
    // device committing meanwhile refuses the commit, and the next pass reads.
    if (hint && local && rec && rec.version && !tomb && !hint.deleted && hint.version === rec.version) {
      if (sameManifest(local.manifest, rec.manifest)) return { status: 'clean' };
      return (await push(pid, local, rec, rec.version)) ? { status: 'pushed' } : null;
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
        forgetProject(pid);
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
    // ONE request when nothing changed: the settings' version rides with the list.
    const list = readList(await call('heads', { settings: true }));
    const heads = list.heads;
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
        if (err && err.stopsRound) throw err;
        projects[pid] = { pid, status: 'error', message: String(err && err.message || err), code: (err && err.code) || null };
      }
    }
    let settings;
    try {
      settings = await settingsSync.sync({ head: list.settings });
    } catch (err) {
      if (err && err.stopsRound) throw err;
      settings = { status: 'error', message: String(err && err.message || err), code: (err && err.code) || null };
    }
    return { projects, settings };
  }

  // ── Version history (plan v6 c6) ──────────────────────────────────────────

  /** The project's history, newest first, a page at a time (protocol.mjs `versions`). */
  async function history(pid, o) {
    const list = await call('versions', pid, o || {});
    return Array.isArray(list) ? list : [];
  }

  /**
   * One version, whole: { version, createdAt, deleted, name, files: [{ id,
   * path, text }], folders, suites }, or null when there is no such version.
   */
  async function readVersion(pid, n) {
    const v = await call('version', pid, n);
    if (!v) return null;
    if (v.deleted) return { version: v.version, createdAt: v.createdAt, deleted: true, name: null, files: [], folders: [], suites: {} };
    const m = normalizeManifest(v.manifest);
    if (!m) throw bad('the server sent a version that is not one');
    const got = await fetchTexts(pid, [...new Set(m.files.map((f) => f.hash))]);
    return {
      version: v.version,
      createdAt: v.createdAt,
      deleted: false,
      name: m.name,
      files: m.files.map((f) => ({ id: f.id, path: f.path, text: got.get(f.hash) })),
      folders: m.folders,
      suites: m.suites,
    };
  }

  /**
   * Restore: version `n`'s contents become the project's, here, written as
   * sync writes them (an open editor follows), and the next round commits
   * them over the head like any edit. Other devices merge it, and every
   * version stays in the history: nothing is deleted by restoring.
   * ⛔ Only when this device has nothing the cloud lacks, and nothing waits
   * in Review differences: what it had not sent would be gone from it, and so
   * from everywhere. { ok: true } | { ok: false, error: 'unsynced' | 'review' | 'no-version' }.
   */
  async function restoreVersion(pid, n) {
    const v = await readVersion(pid, n);
    if (!v || v.deleted) return { ok: false, error: 'no-version' };
    const local = await localSide(pid);
    const rec = readRecord(pid);
    if (!local || !rec || !rec.version || rec.pending || !sameManifest(local.manifest, rec.manifest)) return { ok: false, error: 'unsynced' };
    if (local.conflicted && local.conflicted.size) return { ok: false, error: 'review' };
    // Nothing may have moved while the version came.
    if (!unchangedSince(pid, local)) return { ok: false, error: 'unsynced' };
    const next = { name: v.name, createdAt: local.meta.createdAt, files: v.files, folders: v.folders, suites: v.suites };
    if (!work.applyProject(pid, next, { owner: account })) throw storageFailure('a restored version');
    return { ok: true };
  }

  return { account, syncAll, syncProject, syncSettings: settingsSync.sync, localChanges, cloudSide, useCloud, flush, history, readVersion, restoreVersion };
}
