// Version history and restore (plan v6 c6, js/persist/sync/engine.mjs
// `history`, `readVersion`, `restoreVersion`): every version the server keeps
// is read back, and Restore makes an old one the newest, as a commit like any
// other. Done when: "a restore on one device reaches the other".
import { createMemoryServer } from '../js/persist/sync/memory-server.mjs';
import { syncKey } from '../js/persist/keys.mjs';
import { makeDevice, syncHash, fileId, addFile, projectState } from './_sync-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const texts = (dev, pid) => Object.fromEntries((projectState(dev.work, pid) || { files: [] }).files.map((f) => [f.path, f.text]));

// ── 1. history, read back ───────────────────────────────────────────────────
let clock = 1_800_000_000_000;
const server = createMemoryServer({ hash: syncHash, now: () => (clock += 60_000) });
const a = makeDevice(server, { name: 'HA' });
const b = makeDevice(server, { name: 'HB' });
const pid = a.work.projectId();
const main = fileId(a.work, pid, 'main.bel');
a.work.setText(main, 'one\n', pid);
await a.engine.syncAll();
a.work.setText(main, 'two\n', pid);
const extra = addFile(a.work, pid, 'later.bel', 'added later\n');
await a.engine.syncAll();
a.work.setText(main, 'three\n', pid);
await a.engine.syncAll();
await b.engine.syncAll();
expect(texts(b, pid)['main.bel'] === 'three\n', 'two devices on the same project, at version 3');

const hist = await a.engine.history(pid);
expect(JSON.stringify(hist.map((v) => [v.version, v.files])) === '[[3,2],[2,2],[1,1]]', `the history, newest first, with each version's files (${JSON.stringify(hist)})`);
expect(hist[0].createdAt > hist[1].createdAt && hist[1].createdAt > hist[2].createdAt, 'and when each was made');
expect(JSON.stringify((await a.engine.history(pid, { before: 3, limit: 1 })).map((v) => v.version)) === '[2]', 'a page at a time');
const v1 = await a.engine.readVersion(pid, 1);
expect(v1 && v1.files.length === 1 && v1.files[0].path === 'main.bel' && v1.files[0].text === 'one\n' && v1.name === projectState(a.work, pid).name,
  'an old version reads back whole, with its texts');
expect((await a.engine.readVersion(pid, 7)) === null, 'a version that never was reads as none');

// ── 2. restore on one device, and it reaches the other ──────────────────────
let res = await a.engine.restoreVersion(pid, 1);
expect(res.ok, `version 1 restores (${JSON.stringify(res)})`);
expect(texts(a, pid)['main.bel'] === 'one\n' && !texts(a, pid)['later.bel'], 'here at once: its text, and a file added since is gone with it');
await a.engine.syncAll();
const after = server.history(pid).versions;
expect(after.length === 4 && after[3].base === 3, 'the next round commits it over the head: a fourth version, nothing deleted');
await b.engine.syncAll();
expect(texts(b, pid)['main.bel'] === 'one\n' && !texts(b, pid)['later.bel'], 'and the other device has it, as it would any edit');
expect(!b.work.listConflicts().length, 'with nothing to choose between');

// Restoring the version before the restore brings the file back too.
res = await b.engine.restoreVersion(pid, 3);
await b.engine.syncAll();
await a.engine.syncAll();
expect(res.ok && texts(a, pid)['main.bel'] === 'three\n' && texts(a, pid)['later.bel'] === 'added later\n',
  'nothing is lost by restoring: version 3, file and all, comes back from the other device');
expect(fileId(a.work, pid, 'later.bel') === extra, 'as the same file, not a copy of it');

// ── 3. another device's edits meanwhile are merged, not overwritten ─────────
const notes = addFile(b.work, pid, 'notes.bel', 'b was here\n');
await b.engine.syncAll();
await a.engine.syncAll();
const hist2 = await a.engine.history(pid);
const withNotes = hist2[0].version;
b.work.setText(notes, 'b was here, and wrote more\n', pid);
res = await a.engine.restoreVersion(pid, 1);
await a.engine.syncAll();
await b.engine.syncAll();
await a.engine.syncAll();
expect(res.ok && texts(a, pid)['main.bel'] === 'one\n' && texts(b, pid)['main.bel'] === 'one\n', 'restored on one device while the other was typing');
expect(texts(b, pid)['notes.bel'] === 'b was here, and wrote more\n' && texts(a, pid)['notes.bel'] === 'b was here, and wrote more\n',
  'what the other device typed meanwhile survives on both: the restore removed that file, and an edit beats a delete');
expect((await a.engine.history(pid)).some((v) => v.version === withNotes), 'and every version stays in the history');

// ── 4. refused while this device has what the cloud lacks ──────────────────
{
  const c = makeDevice(server, { name: 'HC' });
  await c.engine.syncAll();
  c.work.setText(main, 'typed, not yet synced\n', pid);
  const r = await c.engine.restoreVersion(pid, 2);
  expect(!r.ok && r.error === 'unsynced' && texts(c, pid)['main.bel'] === 'typed, not yet synced\n',
    'with an edit not yet in the cloud, restoring is refused and the edit is untouched');
  await c.engine.syncAll();
  const t = Object.assign({}, server.transport('u_dean'), { commit: async () => { throw new Error('timed out'); } });
  const d = makeDevice(server, { name: 'HD', storage: c.storage, transport: t });
  d.work.setText(main, 'sent, never answered\n', pid);
  await d.engine.syncAll().catch(() => null);
  expect(!!(c.store.get(syncKey(pid)) || {}).pending, 'a commit is on its way');
  const r2 = await c.engine.restoreVersion(pid, 2);
  expect(!r2.ok && r2.error === 'unsynced', 'and while one is, restoring waits for it');
}
{
  const r = await a.engine.restoreVersion(pid, 99);
  expect(!r.ok && r.error === 'no-version', 'a version that never was cannot be restored');
}

console.log(`OK sync history (${n} checks: the history read back, a restore reaching the other device, nothing deleted by restoring, concurrent edits merged, refused with work the cloud lacks)`);
