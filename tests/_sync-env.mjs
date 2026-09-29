// Devices for sync tests: each is a whole local persistence stack (store,
// device table, work model, settings) on its own memory storage, with an
// engine speaking to a shared memory server. No browser, no timers: every
// step is a promise the test awaits, so a run is exactly repeatable.
import { createHash } from 'node:crypto';
import { createStore, createMemoryStorage } from '../js/persist/store.mjs';
import { createTable } from '../js/persist/table.mjs';
import { DEVICE, DEVICE_KEY } from '../js/persist/device-schema.mjs';
import { createWork } from '../js/persist/work.mjs';
import { create as createWorkFiles } from '../js/persist/work-files.mjs';
import { createSettings } from '../js/persist/settings.mjs';
import { createSyncEngine } from '../js/persist/sync/engine.mjs';

/** SHA-256 resolved at once: the same value as Web Crypto's, with no thread-pool timing. */
export const syncHash = (text) => Promise.resolve(createHash('sha256').update(String(text), 'utf8').digest('hex'));

export function sha256Now(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

let deviceCount = 0;

/**
 * @param {object} server  memory-server.mjs
 * @param {{ account?: string, name?: string, transport?: object, storage?: object }} [o]
 */
export function makeDevice(server, o = {}) {
  const account = o.account === undefined ? 'u_dean' : o.account;
  const name = o.name || 'd' + (++deviceCount);
  const storage = o.storage || createMemoryStorage();
  const store = createStore({ storage, events: null });
  const device = createTable(store, { key: DEVICE_KEY, rows: DEVICE });
  const work = createWork({ store, device });
  if (account) work.setAccount(account);
  const settings = createSettings(store);
  const files = createWorkFiles({ work, settings });
  const notices = [];
  let n = 0;
  const engine = account ? createSyncEngine({
    store,
    work,
    settings,
    transport: o.transport || server.transport(account),
    account,
    hash: syncHash,
    notify: (x) => notices.push(x),
    commitId: () => name + '-c' + (++n),
    trace: o.trace,
  }) : null;
  return { name, account, storage, store, device, work, settings, files, engine, notices };
}

/** Sign a device in (or in again) and give it an engine for that account. */
export function signIn(dev, server, account, transport) {
  dev.work.setAccount(account);
  dev.account = account;
  // One count per device, never per sign-in: a commit id the server has seen
  // is answered as a replay, so a second sign-in must not reuse the first's.
  dev.signIns = (dev.signIns || 0) + 1;
  const tag = dev.name + '-' + account + '-s' + dev.signIns + '-c';
  let n = 0;
  dev.engine = createSyncEngine({
    store: dev.store,
    work: dev.work,
    settings: dev.settings,
    transport: transport || server.transport(account),
    account,
    hash: syncHash,
    notify: (x) => dev.notices.push(x),
    commitId: () => tag + (++n),
  });
  return dev.engine;
}

/** A project as a plain value: name, files in order with their texts, folders, suites. */
export function projectState(work, pid) {
  const snap = work.snapshotProject(pid);
  if (!snap) return null;
  return {
    name: snap.meta.name,
    files: snap.tree.files.map((f) => ({ id: f.id, path: f.name, text: snap.texts[f.id] })),
    folders: snap.tree.folders.slice().sort(),
    suites: snap.tree.suites,
  };
}

/** Every project a device's account owns, by id. */
export function accountState(dev) {
  const out = {};
  for (const p of dev.work.allProjects()) {
    if (p.owner === dev.account) out[p.id] = projectState(dev.work, p.id);
  }
  return out;
}

export function addFile(work, pid, path, text) {
  const id = work.newFileId(pid);
  work.setText(id, text, pid);
  work.updateTree((t) => { t.files.push({ id, name: path }); }, pid);
  return id;
}

export function renameFile(work, pid, fid, path) {
  work.updateTree((t) => {
    const f = t.files.find((x) => x.id === fid);
    if (f) f.name = path;
  }, pid);
}

export function deleteFile(work, pid, fid) {
  work.updateTree((t) => { t.files = t.files.filter((x) => x.id !== fid); }, pid);
  work.removeFiles([fid], pid);
}

export function fileId(work, pid, path) {
  const f = work.readTree(pid).files.find((x) => x.name === path);
  return f ? f.id : null;
}
