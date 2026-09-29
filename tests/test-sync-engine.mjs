// The sync engine, scenario by scenario (js/persist/sync/engine.mjs,
// docs/PERSIST.md §5): devices with their own storage, one memory server,
// and the network made to fail at exactly the wrong moment.
import { createMemoryServer } from '../js/persist/sync/memory-server.mjs';
import { createDocuments } from '../js/persist/document.mjs';
import { syncKey, SETTINGS_SYNC_KEY, TOMBSTONES_KEY } from '../js/persist/keys.mjs';
import {
  makeDevice, signIn, syncHash, accountState, projectState, addFile, renameFile, deleteFile, fileId,
} from './_sync-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const statusOf = (res, pid) => res.projects[pid] && res.projects[pid].status;

/** A transport that behaves like `real`, except where `over` says otherwise. */
function wrap(real, over) {
  const t = {};
  for (const k of Object.keys(real)) t[k] = over[k] ? (...a) => over[k](real[k], ...a) : real[k];
  return t;
}

function world() {
  const server = createMemoryServer({ hash: syncHash });
  return { server, a: makeDevice(server, { name: 'A' }), b: makeDevice(server, { name: 'B' }) };
}

// ── 1. the first push, a download, and a round with nothing to do ────────────
{
  const { server, a, b } = world();
  const pid = a.work.projectId();
  const main = fileId(a.work, pid, 'main.bel');
  a.work.setText(main, 'rec nat : type.\n', pid);
  let res = await a.engine.syncAll();
  expect(statusOf(res, pid) === 'pushed', 'a new project goes up whole');
  res = await b.engine.syncAll();
  expect(statusOf(res, pid) === 'downloaded', 'and comes down whole');
  expect(same(projectState(b.work, pid), projectState(a.work, pid)), 'the same project on both devices');
  expect(b.work.getProject(pid).owner === 'u_dean', 'owned by the account it came from');
  expect(b.work.listProjects().some((p) => p.id === pid), 'and listed');
  const versions = server.history(pid).versions.length;
  res = await a.engine.syncAll();
  expect(statusOf(res, pid) === 'clean' && server.history(pid).versions.length === versions, 'nothing changed: no version is made');
  a.work.setText(main, 'rec nat : type.\n', pid);
  res = await a.engine.syncAll();
  expect(statusOf(res, pid) === 'clean', 'saving the same text again is not a change (dirty is by content, not by clock)');
}

// ── 2. pulls and merges ──────────────────────────────────────────────────────
{
  const { server, a, b } = world();
  const pid = a.work.projectId();
  const main = fileId(a.work, pid, 'main.bel');
  a.work.setText(main, 'one\ntwo\nthree\nfour\n', pid);
  await a.engine.syncAll();
  await b.engine.syncAll();

  a.work.setText(main, 'ONE\ntwo\nthree\nfour\n', pid);
  await a.engine.syncAll();
  let res = await b.engine.syncAll();
  expect(b.work.getText(main, pid) === 'ONE\ntwo\nthree\nfour\n' && statusOf(res, pid) === 'clean', 'nothing changed here: the other side is taken as it is');

  a.work.setText(main, 'ONE!\ntwo\nthree\nfour\n', pid);
  b.work.setText(main, 'ONE\ntwo\nthree\nFOUR\n', pid);
  const lemma = addFile(b.work, pid, 'lemma.bel', 'lemma\n');
  await a.engine.syncAll();
  res = await b.engine.syncAll();
  expect(statusOf(res, pid) === 'pushed', 'changes on both sides: merged here, then pushed');
  await a.engine.syncAll();
  expect(a.work.getText(main, pid) === 'ONE!\ntwo\nthree\nFOUR\n' && b.work.getText(main, pid) === 'ONE!\ntwo\nthree\nFOUR\n',
    'different lines of one file merge without asking');
  expect(a.work.getText(lemma, pid) === 'lemma\n', 'a file made on one side arrives on the other');
  expect(!a.work.readConflict(main, pid) && !b.work.readConflict(main, pid), 'nobody was asked anything');
  expect(same(accountState(a), accountState(b)), 'both devices converge');
  const hist = server.history(pid).versions;
  expect(hist.every((v, i) => v.version === i + 1 && v.base === i), 'the server\'s history is a line');

  // Renamed here, edited there: one file, both changes.
  renameFile(a.work, pid, lemma, 'proofs/lemma.bel');
  b.work.setText(lemma, 'lemma, proved\n', pid);
  await a.engine.syncAll();
  await b.engine.syncAll();
  await a.engine.syncAll();
  expect(same(projectState(a.work, pid), projectState(b.work, pid)) && projectState(a.work, pid).files.some((f) => f.path === 'proofs/lemma.bel' && f.text === 'lemma, proved\n'),
    'a rename on one side and an edit on the other are one file with both');

  // The project's name.
  a.work.renameProject(pid, 'Lambda');
  await a.engine.syncAll();
  await b.engine.syncAll();
  expect(b.work.getProject(pid).name === 'Lambda', 'a renamed project is renamed everywhere');
}

// ── 3. the same lines on both sides: kept, and asked ─────────────────────────
{
  const { a, b } = world();
  const pid = a.work.projectId();
  const main = fileId(a.work, pid, 'main.bel');
  a.work.setText(main, 'theorem\nproof\n', pid);
  await a.engine.syncAll();
  await b.engine.syncAll();
  a.work.setText(main, 'theorem by A\nproof\n', pid);
  b.work.setText(main, 'theorem by B\nproof\n', pid);
  await a.engine.syncAll();
  await b.engine.syncAll();
  const rec = b.work.readConflict(main, pid);
  expect(rec && rec.mine === 'theorem by B\nproof\n' && rec.theirs === 'theorem by A\nproof\n' && rec.base === 'theorem\nproof\n',
    'the second device to sync keeps both: mine in the record, with the base');
  expect(rec.source === 'device', 'the record says the other side came from another device');
  expect(b.work.getText(main, pid) === 'theorem by A\nproof\n', 'storage takes theirs, so nothing of mine is pushed over it');
  expect(b.notices.some((x) => x.kind === 'conflict' && x.path === 'main.bel' && x.pid === pid), 'a person is told');
  let res = await b.engine.syncAll();
  expect(statusOf(res, pid) === 'clean', 'while it waits, nothing is pushed');
  // Keep mine.
  b.work.setText(main, rec.mine, pid);
  b.work.removeConflict(main, pid);
  res = await b.engine.syncAll();
  expect(statusOf(res, pid) === 'pushed', 'the choice is an edit like any other, and goes up');
  await a.engine.syncAll();
  expect(a.work.getText(main, pid) === 'theorem by B\nproof\n', 'and reaches the other device');
}

// ── 4. deletes: an edit beats a delete, everywhere ───────────────────────────
{
  const { a, b } = world();
  const pid = a.work.projectId();
  const extra = addFile(a.work, pid, 'extra.bel', 'x\n');
  await a.engine.syncAll();
  await b.engine.syncAll();

  deleteFile(a.work, pid, extra);
  b.work.setText(extra, 'x, edited\n', pid);
  await a.engine.syncAll();
  await b.engine.syncAll();
  await a.engine.syncAll();
  expect(a.work.getText(extra, pid) === 'x, edited\n' && b.work.getText(extra, pid) === 'x, edited\n', 'a file deleted on one device and edited on the other is kept, with the edit');
  expect(b.notices.some((x) => x.kind === 'kept' && x.path === 'extra.bel'), 'and the device that kept it says why');

  deleteFile(a.work, pid, extra);
  await a.engine.syncAll();
  await b.engine.syncAll();
  expect(!b.work.hasFile(extra, pid), 'deleted on one side, untouched on the other: gone everywhere');
}
{
  // A whole project deleted where the other device has not touched it.
  const { server, a, b } = world();
  const keep = a.work.projectId();
  const doomed = a.work.createProject('Doomed');
  await a.engine.syncAll();
  await b.engine.syncAll();
  expect(b.work.getProject(doomed), 'both devices have it');
  expect(a.work.deleteProject(doomed) === keep, 'deleted on A');
  expect(a.work.readTombstones()[doomed] && a.work.readTombstones()[doomed].version === 1, 'A remembers to tell the server');
  let res = await a.engine.syncAll();
  expect(statusOf(res, doomed) === 'deleted' && !a.work.readTombstones()[doomed], 'the server is told, and A forgets the tombstone');
  expect(server.history(doomed).versions.at(-1).deleted, 'the server records the deletion as a version');
  res = await b.engine.syncAll();
  expect(statusOf(res, doomed) === 'forgot' && !b.work.getProject(doomed), 'B, which had not touched it, lets it go');
  expect(b.notices.some((x) => x.kind === 'project-deleted' && x.project === 'Doomed'), 'and says so');
  expect(!b.store.keys('beljar/p/' + doomed + '/').length, 'nothing of it is left on B');
}
{
  // Deleted on A, edited on B, and B synced first: A gets it back.
  const { a, b } = world();
  a.work.projectId();
  const pid = a.work.createProject('Contested');
  await a.engine.syncAll();
  await b.engine.syncAll();
  const main = fileId(b.work, pid, 'main.bel');
  a.work.deleteProject(pid);
  b.work.setText(main, 'worked on it\n', pid);
  await b.engine.syncAll();
  const res = await a.engine.syncAll();
  expect(statusOf(res, pid) === 'downloaded' && a.work.getText(main, pid) === 'worked on it\n', 'deleted here but changed there since: it comes back, changed');
  expect(a.notices.some((x) => x.kind === 'project-restored' && x.project === 'Contested'), 'and a person is told why');
  expect(!a.work.readTombstones()[pid], 'the tombstone is gone');
}
{
  // Deleted on A and synced; B had unsynced edits: B keeps it, and it comes back.
  const { a, b } = world();
  a.work.projectId();
  const pid = a.work.createProject('Mine still');
  await a.engine.syncAll();
  await b.engine.syncAll();
  const main = fileId(b.work, pid, 'main.bel');
  a.work.deleteProject(pid);
  await a.engine.syncAll();
  b.work.setText(main, 'unsynced work\n', pid);
  let res = await b.engine.syncAll();
  expect(statusOf(res, pid) === 'restored' && b.work.getText(main, pid) === 'unsynced work\n', 'deleted there, changed here: kept, and pushed back over the deletion');
  expect(b.notices.some((x) => x.kind === 'project-kept'), 'and a person is told');
  res = await a.engine.syncAll();
  expect(statusOf(res, pid) === 'downloaded' && a.work.getText(main, pid) === 'unsynced work\n', 'the device that deleted it gets it back with the work');
}

// ── 5. whose projects ────────────────────────────────────────────────────────
{
  const server = createMemoryServer({ hash: syncHash });
  const a = makeDevice(server, { name: 'A', account: null });
  const local = a.work.projectId();
  expect(a.work.getProject(local).owner === null, 'signed out, a project belongs to this device');
  const engineA = signIn(a, server, 'u_dean');
  const owned = a.work.createProject('Owned');
  expect(a.work.getProject(owned).owner === 'u_dean', 'signed in, a new project belongs to the account');
  let res = await engineA.syncAll();
  expect(statusOf(res, owned) === 'pushed' && !(local in res.projects), 'only the account\'s projects sync; this device\'s own stay here');
  expect(a.work.claimProject(local) && a.work.getProject(local).owner === 'u_dean', 'claiming a project makes it the account\'s');
  res = await engineA.syncAll();
  expect(statusOf(res, local) === 'pushed', 'and it syncs from then on');

  // Someone else signs in on the same computer.
  a.work.setAccount('u_guest');
  const shown = a.work.listProjects().map((p) => p.id);
  expect(!shown.includes(owned) && !shown.includes(local), 'another account never sees them');
  a.work.setAccount(null);
  expect(!a.work.listProjects().some((p) => p.owner === 'u_dean'), 'signed out, only this device\'s own projects are listed');
  expect(a.work.removeAccountProjects('u_dean') === 2, 'signing out can remove the account\'s projects from the device');
  expect(!a.work.allProjects().some((p) => p.owner === 'u_dean'), 'and they are gone');
  res = await signIn(a, server, 'u_dean').syncAll();
  expect(statusOf(res, owned) === 'downloaded' && statusOf(res, local) === 'downloaded', 'signing in again brings them back from the server');
}

// ── 6. lost answers: nothing twice, no conflict with oneself ─────────────────
{
  const server = createMemoryServer({ hash: syncHash });
  let lose = 0;
  const transport = wrap(server.transport('u_dean'), {
    commit: async (real, ...args) => {
      const res = await real(...args);
      if (lose > 0) { lose -= 1; throw new Error('the answer was lost'); }
      return res;
    },
  });
  const a = makeDevice(server, { name: 'A', transport });
  const pid = a.work.projectId();
  const main = fileId(a.work, pid, 'main.bel');
  a.work.setText(main, 'line one\nline two\n', pid);
  lose = 1;
  let failed = null;
  try { await a.engine.syncAll(); } catch (err) { failed = err; }
  expect(failed && failed.offline, 'a lost answer ends the round as a network failure');
  expect(a.store.get(syncKey(pid)).pending, 'the commit is remembered as pending');
  expect(server.history(pid).versions.length === 1, 'the server made the version');
  a.work.setText(main, 'line one, more\nline two\n', pid);
  const res = await a.engine.syncAll();
  expect(statusOf(res, pid) === 'pushed', 'next round: the pending commit is settled, then the new edit goes up');
  expect(server.history(pid).versions.length === 2, 'no version was made twice');
  expect(!a.work.readConflict(main, pid), 'and the device never conflicted with its own lost commit');
  expect(!a.store.get(syncKey(pid)).pending, 'nothing is left pending');
}
{
  const server = createMemoryServer({ hash: syncHash });
  let drop = 1;
  const transport = wrap(server.transport('u_dean'), {
    commit: async (real, ...args) => {
      if (drop > 0) { drop -= 1; throw new Error('the request never arrived'); }
      return real(...args);
    },
  });
  const a = makeDevice(server, { name: 'A', transport });
  const pid = a.work.projectId();
  try { await a.engine.syncAll(); } catch (_) { /* dropped */ }
  expect(!server.history(pid), 'a dropped request made nothing');
  await a.engine.syncAll();
  expect(server.history(pid).versions.length === 1, 'sent again, it lands once');
}
{
  // The first push's answer is lost, and then the project is deleted here.
  const server = createMemoryServer({ hash: syncHash });
  let lose = 0;
  const transport = wrap(server.transport('u_dean'), {
    commit: async (real, ...args) => {
      const res = await real(...args);
      if (lose > 0) { lose -= 1; throw new Error('lost'); }
      return res;
    },
  });
  const a = makeDevice(server, { name: 'A', transport });
  a.work.projectId();
  await a.engine.syncAll();
  const pid = a.work.createProject('Short-lived');
  lose = 1;
  try { await a.engine.syncAll(); } catch (_) { /* lost */ }
  expect(a.store.get(syncKey(pid)).pending && !a.store.get(syncKey(pid)).version, 'its first commit is pending, never answered');
  a.work.deleteProject(pid);
  expect(a.work.readTombstones()[pid] && a.work.readTombstones()[pid].pending, 'the tombstone remembers the unanswered commit');
  const res = await a.engine.syncAll();
  expect(statusOf(res, pid) === 'deleted' && server.history(pid).versions.at(-1).deleted,
    'the head is that commit, so the delete stands (it is not mistaken for another device\'s change)');
}
{
  // A delete whose answer is lost.
  const server = createMemoryServer({ hash: syncHash });
  let lose = 0;
  const transport = wrap(server.transport('u_dean'), {
    remove: async (real, ...args) => {
      const res = await real(...args);
      if (lose > 0) { lose -= 1; throw new Error('lost'); }
      return res;
    },
  });
  const a = makeDevice(server, { name: 'A', transport });
  a.work.projectId();
  const pid = a.work.createProject('Gone');
  await a.engine.syncAll();
  a.work.deleteProject(pid);
  lose = 1;
  try { await a.engine.syncAll(); } catch (_) { /* lost */ }
  expect(a.work.readTombstones()[pid], 'the tombstone stays while the answer is unknown');
  const res = await a.engine.syncAll();
  expect(statusOf(res, pid) === 'deleted' && !a.work.readTombstones()[pid], 'the next round sees the deletion and lets the tombstone go');
  expect(server.history(pid).versions.filter((v) => v.deleted).length === 1, 'deleted once');
}

// ── 7. offline, and a server that sends something wrong ──────────────────────
{
  const server = createMemoryServer({ hash: syncHash });
  const offline = wrap(server.transport('u_dean'), { heads: async () => { throw new Error('no network'); } });
  const a = makeDevice(server, { name: 'A', transport: offline });
  const pid = a.work.projectId();
  const before = JSON.stringify(accountState(a));
  let failed = null;
  try { await a.engine.syncAll(); } catch (err) { failed = err; }
  expect(failed && failed.offline, 'unreachable: the round fails as offline');
  expect(JSON.stringify(accountState(a)) === before && !a.store.get(syncKey(pid)), 'and nothing here changed');
}
{
  const server = createMemoryServer({ hash: syncHash });
  const a = makeDevice(server, { name: 'A' });
  const pid = a.work.projectId();
  const other = a.work.createProject('Other');
  await a.engine.syncAll();
  const damaged = wrap(server.transport('u_dean'), {
    blobs: async (real, p, hashes) => {
      const res = await real(p, hashes);
      if (p === pid) for (const h of Object.keys(res)) res[h] += ' tampered';
      return res;
    },
  });
  const b = makeDevice(server, { name: 'B', transport: damaged });
  const res = await b.engine.syncAll();
  expect(statusOf(res, pid) === 'error' && /damaged/.test(res.projects[pid].message), 'a text that does not match its hash is refused');
  expect(!b.work.getProject(pid), 'and nothing of that project is written');
  expect(statusOf(res, other) === 'downloaded', 'the other projects go on');
}

// ── 8. this device moves while the engine waits ──────────────────────────────
{
  const { server, a } = world();
  const pid = a.work.projectId();
  const main = fileId(a.work, pid, 'main.bel');
  const side = addFile(a.work, pid, 'side.bel', 'side\n');
  a.work.setText(main, 'one\ntwo\n', pid);
  await a.engine.syncAll();
  let typing = null;
  const b = makeDevice(server, {
    name: 'B',
    transport: wrap(server.transport('u_dean'), {
      blobs: async (real, ...args) => {
        const res = await real(...args);
        if (typing) { typing(); typing = null; }
        return res;
      },
    }),
  });
  await b.engine.syncAll();
  a.work.setText(main, 'one\ntwo\nthree from A\n', pid);
  await a.engine.syncAll();
  // B pulls; while the texts are on their way, B saves an edit to another file.
  typing = () => b.work.setText(side, 'side, typed during the sync\n', pid);
  await b.engine.syncAll();
  expect(b.work.getText(side, pid) === 'side, typed during the sync\n', 'an edit saved while the engine waited is never overwritten');
  expect(b.work.getText(main, pid) === 'one\ntwo\nthree from A\n', 'and the pull still lands');
  await a.engine.syncAll();
  expect(a.work.getText(side, pid) === 'side, typed during the sync\n', 'the edit reaches the other device');
}

// ── 9. an open editor ────────────────────────────────────────────────────────
{
  globalThis.window = new EventTarget();
  const events = [];
  window.addEventListener('beljar:text-conflict', (e) => events.push(e.detail));
  const { a, b } = world();
  const pid = a.work.projectId();
  const main = fileId(a.work, pid, 'main.bel');
  a.work.setText(main, 'first\nsecond\nthird\n', pid);
  await a.engine.syncAll();
  await b.engine.syncAll();
  b.work.setActiveProject(pid);

  const docs = createDocuments({ work: b.work, settings: b.settings, files: b.files });
  const doc = docs.createPersist({ documentId: main, debounceMs: 1e9 });
  let buffer = doc.getEditorText();
  doc.setCheckpointProviders({
    getText: () => buffer,
    peekText: () => buffer,
    applyExternalText: (t) => { buffer = t; },
  });

  // Unsaved typing here on one line; another device changed another.
  buffer = 'first\nsecond\nthird, typing\n';
  a.work.setText(main, 'first, from A\nsecond\nthird\n', pid);
  await a.engine.syncAll();
  await b.engine.syncAll();
  await Promise.resolve();
  expect(buffer === 'first, from A\nsecond\nthird, typing\n', 'the open editor shows the other device\'s line beside the unsaved typing');
  doc.flushCheckpoint();
  await b.engine.syncAll();
  await a.engine.syncAll();
  expect(a.work.getText(main, pid) === 'first, from A\nsecond\nthird, typing\n', 'the typing is saved and reaches the other device');

  // Unsaved typing on the same line another device changed.
  buffer = 'first, from A\nsecond, B typing\nthird, typing\n';
  a.work.setText(main, 'first, from A\nsecond, A\nthird, typing\n', pid);
  await a.engine.syncAll();
  await b.engine.syncAll();
  await Promise.resolve();
  const c = doc.getConflict();
  expect(c && c.source === 'device', 'the open file is in conflict, from another device');
  expect(c.mine === 'first, from A\nsecond, B typing\nthird, typing\n', 'mine is the editor as it stands, unsaved typing included');
  expect(c.theirs === 'first, from A\nsecond, A\nthird, typing\n', 'theirs is what the other device saved');
  expect(buffer === c.mine, 'the editor keeps showing mine');
  expect(events.some((d) => d.fileId === main && d.source === 'device'), 'and the dialog is asked for, saying where theirs came from');
  expect(b.work.readConflict(main, pid).mine === buffer, 'the record holds the unsaved typing, not the older save');
  const r = doc.resolveConflict('mine');
  expect(r.ok && b.work.getText(main, pid) === buffer && !b.work.readConflict(main, pid), 'keep mine: saved, and the record goes');
  await b.engine.syncAll();
  await a.engine.syncAll();
  expect(a.work.getText(main, pid) === 'first, from A\nsecond, B typing\nthird, typing\n', 'and the choice reaches the other device');

  // Saved here but not yet synced, and the same line changed there: the
  // engine records the conflict, and the open document takes it up.
  events.length = 0;
  buffer = 'first, B saved\nsecond, B typing\nthird, typing\n';
  doc.flushCheckpoint();
  buffer = 'first, B saved\nsecond, B typing\nthird, typing more\n';
  a.work.setText(main, 'first, A again\nsecond, B typing\nthird, typing\n', pid);
  await a.engine.syncAll();
  await b.engine.syncAll();
  await Promise.resolve();
  const d = doc.getConflict();
  expect(d && d.source === 'device' && d.theirs === 'first, A again\nsecond, B typing\nthird, typing\n',
    'a conflict the engine recorded is taken up by the open document');
  expect(d.mine === 'first, B saved\nsecond, B typing\nthird, typing more\n' && buffer === d.mine,
    'with the editor as it stands as mine: the save and the typing after it');
  expect(b.work.readConflict(main, pid).mine === d.mine && d.base === 'first, from A\nsecond, B typing\nthird, typing\n',
    'the record holds that, over the version both started from');
  expect(events.length === 1 && events[0].source === 'device', 'the dialog is asked for once, naming another device');
  expect(doc.resolveConflict('both').ok, 'keep both');
  await b.engine.syncAll();
  await a.engine.syncAll();
  const names = projectState(a.work, pid).files.map((f) => f.path);
  expect(names.includes('main (conflicted copy).bel') && a.work.getText(main, pid) === d.mine,
    'both versions reach the other device: mine in the file, theirs beside it');
  doc.dispose();
  delete globalThis.window;
}

// ── 10. settings ─────────────────────────────────────────────────────────────
{
  const { server, a, b } = world();
  a.work.projectId();
  a.settings.set('theme', 'light');
  a.settings.set('keymapStyle', 'vim');
  a.settings.set('belugaMode', 'fast');
  let res = await a.engine.syncAll();
  expect(res.settings.status === 'pushed', 'changed settings go up');
  expect(!('belugaMode' in server.settingsHistory('u_dean').at(-1).values), 'a setting that belongs to one device never leaves it');
  const seen = [];
  b.settings.subscribe((e) => seen.push(e));
  b.settings.set('editorFontSize', 'lg');
  res = await b.engine.syncAll();
  expect(b.settings.get('theme') === 'light' && b.settings.get('keymapStyle') === 'vim', 'another device takes them');
  expect(b.settings.get('belugaMode') === 'stable', 'but not the one that stays on its device');
  expect(b.settings.get('editorFontSize') === 'lg', 'and keeps what it changed itself');
  expect(seen.some((e) => e.origin === 'remote' && e.ids.includes('theme')), 'the page hears about it as a change from elsewhere');
  res = await a.engine.syncAll();
  expect(a.settings.get('editorFontSize') === 'lg' && a.settings.get('belugaMode') === 'fast', 'different settings changed on two devices: both kept');

  a.settings.set('editorFontSize', 'sm');
  b.settings.set('editorFontSize', 'xl');
  b.settings.set('keymapStyle', 'emacs');
  await a.engine.syncAll();
  await b.engine.syncAll();
  await a.engine.syncAll();
  expect(a.settings.get('editorFontSize') === 'xl' && b.settings.get('editorFontSize') === 'xl', 'one setting changed on both: the later change wins, everywhere');
  expect(a.settings.get('keymapStyle') === 'emacs', 'and the rest still merge');

  b.settings.set('syncSettings', false);
  b.settings.set('theme', 'dark');
  res = await b.engine.syncAll();
  expect(res.settings.status === 'off' && a.settings.get('theme') === 'light', 'settings sync off: this device keeps its own');
  await a.engine.syncAll();
  const hist = server.settingsHistory('u_dean').length;
  a.settings.set('uiFontSize', 'lg');
  await a.engine.syncAll();
  await b.engine.syncAll();
  expect(b.settings.get('uiFontSize') === 'md' && server.settingsHistory('u_dean').length === hist + 1, 'and takes nothing from elsewhere');

  // A new device takes the account's settings as they are.
  const c = makeDevice(server, { name: 'C' });
  await c.engine.syncAll();
  expect(c.settings.get('theme') === 'light' && c.settings.get('uiFontSize') === 'lg', 'a fresh device adopts the account\'s settings');
  expect(c.store.get(SETTINGS_SYNC_KEY).account === 'u_dean', 'and remembers whose they were');
}

// ── 11. bookkeeping stays with its account ──────────────────────────────────
{
  const { a } = world();
  a.work.projectId();
  const pid = a.work.createProject('Tomb');
  await a.engine.syncAll();
  a.work.deleteProject(pid);
  a.store.set(SETTINGS_SYNC_KEY, { account: 'u_dean', version: 3, values: {} });
  expect(a.store.get(TOMBSTONES_KEY)[pid], 'a tombstone is waiting');
  a.work.removeAccountProjects('u_dean');
  expect(!a.store.get(TOMBSTONES_KEY) && !a.store.get(SETTINGS_SYNC_KEY), 'removing an account\'s projects takes its tombstones and settings bookkeeping too');
}

console.log(`OK sync engine (${n} checks: push, pull, merge, conflict, deletes both ways, owners, lost answers, offline, damage, moving targets, an open editor, settings)`);
