// A session that ends without this browser signing out (plan v6 c3,
// js/account/account.mjs `followEndedSession`): Sign out there from another
// device, the account deleted, or a session that ran out. Run on the page's
// own Persist (the built bundle), as the page runs it.
//
// ⛔ Deleted, the account's projects stay, as this browser's own, with no sync
// bookkeeping left: the cloud no longer has them, and a record still naming
// its versions would read, at the next sign-in, as the cloud having deleted
// them. Otherwise nothing the cloud lacks leaves with the session.
import { createMemoryServer } from '../js/persist/sync/memory-server.mjs';
import { syncKey, SETTINGS_SYNC_KEY, TOMBSTONES_KEY } from '../js/persist/keys.mjs';
import { DEVICE_KEY } from '../js/persist/device-schema.mjs';
import { endedStep, endedWords, sessionWords, adoptable } from '../js/account/account.mjs';
import { syncHash } from './_sync-env.mjs';
import { makeBrowserStorage, openTab, here } from './_persist-env.mjs';
import { flush, lockManager } from './_runner-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── 1. what the browser does, and says ──────────────────────────────────────
expect(endedStep('deleted', 'remove') === 'release' && endedStep('deleted', 'keep') === 'release',
  'the account deleted: its projects stay as this browser\'s own, whatever the sign-out setting');
expect(endedStep('elsewhere', 'remove') === 'leave' && endedStep(null, 'remove') === 'leave' && endedStep('elsewhere', 'keep') === 'keep',
  'signed out from another device, or run out: as this browser\'s own sign-out would');
expect(endedWords('elsewhere', true) === 'This browser was signed out from another device. Sign in to bring your projects back.'
  && endedWords(null, false) === 'Your session in this browser ended.'
  && endedWords('deleted', false) === 'Your account was deleted. Its projects stay in this browser.',
'each case says what happened, and where the work is');
const words = [endedWords('elsewhere', true), endedWords(null, true), endedWords('deleted', false)].join(' ');
expect(!/—|–/.test(words), 'in the house voice: no dashes');

const now = new Date(2026, 9, 3, 15, 0).getTime();
const H = 60 * 60 * 1000;
const at = (ms, current) => sessionWords({ device: 'Chrome on Windows', usedAt: now - ms, signedInAt: now - 10 * 24 * H, current }, now).detail;
expect(at(0, true) === 'This browser', 'this browser is named as such');
expect(at(59 * 60 * 1000) === 'Used in the last hour' && at(H) === 'Last used 1 hour ago' && at(5 * H) === 'Last used 5 hours ago',
  'another is said to the hour, never finer: the server marks use once an hour');
expect(at(24 * H) === 'Last used yesterday' && at(3 * 24 * H) === 'Last used 3 days ago' && /^Last used \S+ \S+$/.test(at(9 * 24 * H)),
  'then by day, then by date');
expect(sessionWords({ device: null, usedAt: now, current: false }, now).label === 'A browser', 'one it could not name is "A browser"');

// ── 2. the account deleted: its projects stay, as this browser's own ────────
const doc = () => ({ visibilityState: 'visible', readyState: 'complete', addEventListener() {}, removeEventListener() {} });
/** What the page stored under `key`, read as the store wrote it. */
const stored = (storage, key) => {
  const raw = storage.getItem(key);
  return raw == null ? null : JSON.parse(raw).data;
};
const deviceRow = (storage, id) => ((stored(storage, DEVICE_KEY) || {}).values || {})[id];
/** A project made with one file, and that file's id. */
function make(P, name, text) {
  const res = P.createProjectWithFiles(name, [{ name: 'main.bel', text }]);
  return { pid: res.projectId, fid: res.files[0].id };
}
function edit(P, pid, fid, text) {
  P.setActiveProjectId(pid);
  P.setFileText(fid, text);
}
function textOf(P, pid, fid) {
  P.setActiveProjectId(pid);
  return P.getFileText(fid);
}
async function signedIn(storage, server, account) {
  const t = openTab(storage, { document: doc(), navigator: { onLine: true } });
  t.P.setAccount(account);
  const runner = t.P.startSync({ transport: server.transport(account), locks: lockManager() });
  await flush();
  await runner.syncNow();
  return t;
}
{
  const server = createMemoryServer({ hash: syncHash });
  const storage = makeBrowserStorage();
  const { P, S } = await signedIn(storage, server, 'u_dean');
  S.set('theme', 'light');
  const one = make(P, 'Mine', 'mine\n');
  const two = make(P, 'Second', 'second\n');
  const three = make(P, 'Deleted here', 'third\n');
  await P.syncNow();
  expect([one, two, three].every((x) => !!stored(storage, syncKey(x.pid))) && !!stored(storage, SETTINGS_SYNC_KEY),
    'synced: each project has its record');
  await P.stopSync();
  P.setActiveProjectId(one.pid);
  P.removeProject(three.pid);
  expect(Object.keys(stored(storage, TOMBSTONES_KEY) || {}).includes(three.pid), 'a deletion waits to go up');
  P.keepAccountProjects('u_dean');
  expect((deviceRow(storage, 'keptAccounts') || []).includes('u_dean') && !!P.resumeFor('u_dean'),
    'marks for the account stand: kept, and to come back to (as a sign-out with Keep, or a first sign-in, leaves them)');

  // As account.mjs does once the server says the account is gone.
  const stayed = P.releaseAccount('u_dean');
  P.setAccount(null);
  const listed = here(P.projects());
  const mine = listed.filter((x) => x.id === one.pid || x.id === two.pid);
  expect(stayed >= 2 && mine.length === 2 && listed.every((x) => x.owner === null), `its projects stay, as this browser's own (${stayed})`);
  expect(![one, two].some((x) => stored(storage, syncKey(x.pid))) && !stored(storage, SETTINGS_SYNC_KEY) && !stored(storage, TOMBSTONES_KEY),
    'with nothing of the account beside them: no sync records, no settings record, no deletion waiting');
  expect(!(deviceRow(storage, 'keptAccounts') || []).length && !P.resumeFor('u_dean'), 'nor a mark to keep them for it, or to come back to it');
  expect(textOf(P, one.pid, one.fid) === 'mine\n', 'their texts as they were');

  // Signing in later, as a new account (the old one is gone from the cloud):
  // they are this browser's own, so they join it and go up whole.
  const cloud = createMemoryServer({ hash: syncHash });
  P.setAccount('u_new');
  const joining = adoptable(here(P.projects()), (pid) => P.projectStats(pid).size);
  expect(joining.includes(one.pid) && joining.includes(two.pid), 'a later sign-in adopts them like any of this browser\'s own');
  for (const pid of joining) P.claimProject(pid);
  const runner = P.startSync({ transport: cloud.transport('u_new'), locks: lockManager() });
  await flush();
  await runner.syncNow();
  const head = await cloud.transport('u_new').head(one.pid);
  expect(head && head.version === 1 && here(P.projects()).some((x) => x.id === one.pid),
    'and go up whole: no record of the deleted account\'s versions made the new cloud look as if it had deleted them');
  await P.stopSync();
}

// ── 3. signed out from another device: only what the cloud has leaves ───────
{
  const server = createMemoryServer({ hash: syncHash });
  const storage = makeBrowserStorage();
  const { P } = await signedIn(storage, server, 'u_dean');
  const synced = make(P, 'In the cloud', 'in the cloud\n');
  const edited = make(P, 'Edited after', 'before\n');
  await P.syncNow();
  // The session ends elsewhere; until this browser hears so, its edits cannot go up.
  await P.stopSync();
  edit(P, edited.pid, edited.fid, 'typed after the last round\n');
  const made = make(P, 'Made after', 'new\n');
  expect(here(P.projects()).find((x) => x.id === made.pid).owner === 'u_dean', 'a project made signed in is the account\'s');

  const stay = here(await P.unsyncedProjects('u_dean')).sort();
  expect(stay.includes(edited.pid) && stay.includes(made.pid) && !stay.includes(synced.pid), `what the cloud lacks is read from this browser alone (${stay.length})`);
  P.setAccount(null);
  P.leaveAccount('u_dean', stay);
  P.noteSignedOut('elsewhere');

  // The next page: the projects the cloud has are gone; the rest stay, kept.
  const next = openTab(storage, { document: doc(), navigator: { onLine: true } }).P;
  const ids = here(next.projects()).map((x) => x.id);
  expect(!ids.includes(synced.pid) && ids.includes(edited.pid) && ids.includes(made.pid),
    'the synced project left; the two with work the cloud lacks stayed');
  expect(textOf(next, edited.pid, edited.fid) === 'typed after the last round\n', 'with that work');
  expect((deviceRow(storage, 'keptAccounts') || []).includes('u_dean') && !(deviceRow(storage, 'leftKeep') || []).length,
    'kept for the account, and the note of which used');
  expect(next.takeSignedOutNote() === 'elsewhere' && next.takeSignedOutNote() === '', 'the page says why, once');

  // Another account on this browser neither sees nor takes them.
  next.setAccount('u_other');
  expect(!here(next.projects()).some((x) => x.id === edited.pid)
    && !adoptable(here(next.projects()), (pid) => next.projectStats(pid).size).includes(edited.pid),
  'another account signing in here neither sees them nor adopts them');
  next.setAccount(null);
  expect(here(next.projects()).some((x) => x.id === edited.pid), 'signed out, they show again');

  // The same account signing in again: they go up, and the synced one comes back.
  next.setAccount('u_dean');
  const runner = next.startSync({ transport: server.transport('u_dean'), locks: lockManager() });
  await flush();
  await runner.syncNow();
  await runner.syncNow();
  const t = server.transport('u_dean');
  const head = await t.head(edited.pid);
  const h = head && head.manifest.files[0].hash;
  const text = h && (await t.blobs(edited.pid, [h]))[h];
  expect(text === 'typed after the last round\n' && !!(await t.head(made.pid)), 'signing in again, the work kept here goes up');
  expect(here(next.projects()).some((x) => x.id === synced.pid), 'and what left comes back from the cloud');
  await next.stopSync();
}

// ── 4. a commit still on its way is work the cloud may lack ─────────────────
{
  const server = createMemoryServer({ hash: syncHash });
  const storage = makeBrowserStorage();
  const { P } = await signedIn(storage, server, 'u_dean');
  const x = make(P, 'Sent', 'first\n');
  await P.syncNow();
  await P.stopSync();
  edit(P, x.pid, x.fid, 'sent, never answered\n');
  const lost = Object.assign({}, server.transport('u_dean'), { commit: async () => { throw new Error('timed out'); } });
  const runner = P.startSync({ transport: lost, locks: lockManager() });
  await flush();
  await runner.syncNow();
  await P.stopSync();
  expect(!!(stored(storage, syncKey(x.pid)) || {}).pending, 'a commit given up on stays pending');
  expect(here(await P.unsyncedProjects('u_dean')).includes(x.pid), 'and its project counts as work the cloud lacks: it does not leave');
  expect(here(await P.unsyncedProjects('u_nobody')).length === 0 && here(await P.unsyncedProjects('')).length === 0,
    'another account\'s, or nobody\'s, is not asked about');
}

console.log(`OK account ended (${n} checks: what each ending does and says, a deleted account's projects kept as this browser's own and going up whole later, only what the cloud has leaving with a session ended elsewhere, a commit on its way kept)`);
