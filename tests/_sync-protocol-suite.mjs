// The sync server's rules, as a suite any server is held to: the reference
// server in memory (tests/test-sync-protocol.mjs) and the Worker on D1 and R2
// (tests/test-sync-worker.mjs). Only the protocol's own methods are used, so
// what passes here is what a device can rely on (docs/PERSIST.md §5.7).
//
// `dean` and `other` are transports for two accounts on one fresh server.
import { sha256Now } from './_sync-env.mjs';

const h = (t) => sha256Now(t);

export async function serverRules({ dean, other }, expect) {
  const manifest = (files, name = 'P') => ({ v: 1, name, createdAt: 1, files, folders: [], suites: {} });
  const fa = { id: 'f1', path: 'a.bel', hash: h('alpha') };

  expect(JSON.stringify(await dean.missing('p1', [h('alpha'), h('alpha')])) === JSON.stringify([h('alpha')]), 'missing names each absent text once');
  let r = await dean.commit('p1', { id: 'c1', base: 0, manifest: manifest([fa]) });
  expect(!r.ok && JSON.stringify(r.missing) === JSON.stringify([h('alpha')]), 'a manifest may only name texts the server has');
  r = await dean.putBlobs('p1', { [h('alpha')]: 'not alpha' });
  expect(!r.ok && r.error === 'bad-text', 'a text that does not hash to its name is refused');
  r = await dean.putBlobs('p1', { [h('alpha')]: 'alpha' });
  expect(r.ok, 'a text that hashes to its name is taken');
  r = await dean.commit('p1', { id: 'c1', base: 0, manifest: manifest([fa]) });
  expect(r.ok && r.version === 1, 'the first commit makes version 1');
  r = await dean.commit('p1', { id: 'c1', base: 0, manifest: manifest([fa]) });
  expect(r.ok && r.version === 1 && r.replay, 'the same commit again answers with the version it made: nothing is committed twice');
  r = await dean.commit('p1', { id: 'c2', base: 0, manifest: manifest([fa], 'Q') });
  expect(!r.ok && r.head && r.head.version === 1 && r.head.manifest.name === 'P', 'a commit over a version that is no longer the head is refused, with the head');
  r = await dean.commit('p1', { id: 'c3', base: 1, manifest: manifest([fa], 'Q') });
  expect(r.ok && r.version === 2, 'over the head, it lands');
  r = await dean.commit('p1', { id: 'c4', base: 2, manifest: { v: 1, name: 'P', files: [fa, { ...fa, id: 'f2' }] } });
  expect(!r.ok && r.error === 'bad-manifest', 'a malformed manifest is refused');
  const head = await dean.head('p1');
  expect(head.version === 2 && !head.deleted && head.manifest.name === 'Q' && head.commit === 'c3', 'the head carries its version, manifest and the commit that made it');
  head.manifest.name = 'mutated';
  expect((await dean.head('p1')).manifest.name === 'Q', 'answers are copies: a client cannot reach into the server');
  expect(JSON.stringify(await dean.heads()) === JSON.stringify([{ id: 'p1', version: 2, deleted: false }]), 'heads lists the account\'s projects');
  const withSettings = await dean.heads({ settings: true });
  expect(JSON.stringify(withSettings) === JSON.stringify({ projects: [{ id: 'p1', version: 2, deleted: false }], settings: 0 }),
    `asked, the list says where the settings are too (0: none yet), so an idle round is one request (${JSON.stringify(withSettings)})`);
  expect((await dean.blobs('p1', [h('alpha'), h('nothing')]))[h('alpha')] === 'alpha', 'texts come back by hash; unknown ones are absent');

  // Another account can neither see nor touch it.
  expect((await other.head('p1')) === null, 'another account cannot learn the project exists');
  expect(!(await other.heads()).length, 'nor list it');
  expect(!Object.keys(await other.blobs('p1', [h('alpha')])).length, 'nor read its texts');
  r = await other.commit('p1', { id: 'x1', base: 2, manifest: manifest([]) });
  expect(!r.ok && r.error === 'forbidden', 'nor commit to it');
  r = await other.remove('p1', { id: 'x2', base: 2 });
  expect(!r.ok && r.error === 'forbidden', 'nor delete it');
  r = await other.putBlobs('p1', { [h('beta')]: 'beta' });
  expect(!r.ok && r.error === 'forbidden', 'nor add texts under it');
  expect(JSON.stringify(await other.missing('p2', [h('alpha')])) === JSON.stringify([h('alpha')]),
    'texts are pooled per account: another account holding the same file learns nothing');

  // Deleting is a version too.
  r = await dean.remove('p1', { id: 'd1', base: 1 });
  expect(!r.ok && r.head.version === 2, 'a delete over an old version is refused');
  r = await dean.remove('p1', { id: 'd1', base: 2 });
  expect(r.ok && r.version === 3, 'a delete over the head makes a version');
  r = await dean.remove('p1', { id: 'd1', base: 2 });
  expect(r.ok && r.version === 3 && r.replay, 'and is answered the same way twice');
  const gone = await dean.head('p1');
  expect(gone.deleted && gone.manifest === null && gone.version === 3, 'the head says it was deleted');
  expect(JSON.stringify(await dean.heads()) === JSON.stringify([{ id: 'p1', version: 3, deleted: true }]), 'heads says so too, so other devices learn it');
  r = await dean.commit('p1', { id: 'c5', base: 3, manifest: manifest([fa], 'Back') });
  expect(r.ok && r.version === 4, 'a commit over the deletion brings it back (an edit beats a delete)');

  // Settings.
  expect((await dean.settings()) === null, 'no settings until some are committed');
  r = await dean.commitSettings({ id: 's1', base: 0, values: { theme: 'light' } });
  expect(r.ok && r.version === 1, 'settings commit like projects');
  r = await dean.commitSettings({ id: 's1', base: 0, values: { theme: 'light' } });
  expect(r.ok && r.version === 1 && r.replay, 'and replay like them');
  r = await dean.commitSettings({ id: 's2', base: 0, values: { theme: 'dark' } });
  expect(!r.ok && r.head.version === 1 && r.head.values.theme === 'light', 'and are compare-and-swapped like them');
  expect((await other.settings()) === null, 'settings are per account');
  expect((await dean.heads({ settings: true })).settings === 1 && (await other.heads({ settings: true })).settings === 0,
    'and the list carries the account\'s own settings version, nobody else\'s');

  // A push is one request: the texts travel with the commit (protocol.mjs).
  const fb = { id: 'f1', path: 'b.bel', hash: h('bravo') };
  const fc = { id: 'f2', path: 'c.bel', hash: h('charlie') };
  const fd = { id: 'f3', path: 'd.bel', hash: h('delta') };
  r = await dean.commit('p3', { id: 't1', base: 0, manifest: manifest([fb]), texts: { [h('bravo')]: 'bravo' } });
  expect(r.ok && r.version === 1, 'a commit that carries the texts it names lands in one request');
  expect((await dean.blobs('p3', [h('bravo')]))[h('bravo')] === 'bravo', 'and the texts it carried are stored');
  r = await dean.commit('p3', { id: 't2', base: 1, manifest: manifest([fb, fc]), texts: { [h('charlie')]: 'not charlie' } });
  expect(!r.ok && r.error === 'bad-text' && (await dean.head('p3')).version === 1, 'a carried text that does not hash to its name refuses the commit, and nothing moves');
  r = await dean.commit('p3', { id: 't3', base: 1, manifest: manifest([fb, fc, fd]), texts: { [h('charlie')]: 'charlie' } });
  expect(!r.ok && JSON.stringify(r.missing) === JSON.stringify([h('delta')]), 'what it still lacks, it was not sent, is answered as missing');
  expect(JSON.stringify(await dean.missing('p3', [h('charlie')])) === '[]', 'and the texts it did carry are kept for the next try');
  r = await dean.commit('p3', { id: 't3', base: 1, manifest: manifest([fb, fc, fd]), texts: { [h('delta')]: 'delta' } });
  expect(r.ok && r.version === 2, 'sent again with the rest, it lands');
  r = await dean.commit('p3', { id: 't3', base: 1, manifest: manifest([fb, fc, fd]), texts: { [h('foxtrot')]: 'not foxtrot' } });
  expect(r.ok && r.version === 2 && r.replay, 'a commit seen before is answered as before, whatever it carries');
  r = await dean.commit('p3', { id: 't4', base: 2, manifest: manifest([fb]), texts: { [h('echo')]: 'echo' } });
  expect(r.ok && JSON.stringify(await dean.missing('p3', [h('echo')])) === JSON.stringify([h('echo')]), 'a carried text the manifest does not name is not kept');
  r = await other.commit('p3', { id: 'x3', base: 3, manifest: manifest([fb]), texts: { [h('golf')]: 'golf' } });
  expect(!r.ok && r.error === 'forbidden' && JSON.stringify(await other.missing('p9', [h('golf')])) === JSON.stringify([h('golf')]),
    'and another account can carry nothing into it');

  // Version history: every version is read back, newest first (plan v6 c6).
  const hist = await dean.versions('p1');
  expect(JSON.stringify(hist.map((v) => [v.version, v.deleted, v.name, v.files])) === JSON.stringify([[4, false, 'Back', 1], [3, true, null, 0], [2, false, 'Q', 1], [1, false, 'P', 1]]),
    `the history lists every version, newest first, deletions too (${JSON.stringify(hist)})`);
  expect(hist.every((v) => Number.isFinite(v.createdAt) && v.createdAt > 0) && hist[0].createdAt >= hist[3].createdAt,
    'each with when it was made');
  const page = await dean.versions('p1', { before: 4, limit: 2 });
  expect(JSON.stringify(page.map((v) => v.version)) === '[3,2]', 'a page at a time: the ones below `before`, as many as asked');
  expect((await dean.versions('p1', { limit: 1000 })).length === 4 && (await dean.versions('p1', { limit: -3 })).length === 4,
    'a page size out of bounds is held to its bounds');
  const old = await dean.version('p1', 2);
  expect(old && old.version === 2 && !old.deleted && old.manifest.name === 'Q' && old.manifest.files[0].hash === h('alpha'),
    'one version reads back whole');
  expect((await dean.blobs('p1', [old.manifest.files[0].hash]))[h('alpha')] === 'alpha', 'and its texts are still there to read');
  const was = await dean.version('p1', 3);
  expect(was.deleted && was.manifest === null, 'a deletion reads as one');
  expect((await dean.version('p1', 9)) === null && (await dean.version('p1', 'x')) === null, 'a version that never was is null');
  old.manifest.name = 'mutated';
  expect((await dean.version('p1', 2)).manifest.name === 'Q', 'and is a copy');
  expect(!(await other.versions('p1')).length && (await other.version('p1', 1)) === null,
    'another account can read none of it, nor learn there is any');

}

/**
 * What an account may hold (plan v6 c10), on a server made with small limits:
 * { projects: 2, textBytes: 20 }. `dean` and `other` are two accounts on it.
 */
export async function quotaRules({ dean, other }, expect) {
  const manifest = (files, name = 'Q') => ({ v: 1, name, createdAt: 1, files, folders: [], suites: {} });
  let r = await dean.commit('q1', { id: 'q1-1', base: 0, manifest: manifest([]) });
  expect(r.ok, 'a first project');
  r = await dean.commit('q2', { id: 'q2-1', base: 0, manifest: manifest([]) });
  expect(r.ok, 'a second, the most this account may have');
  r = await dean.commit('q3', { id: 'q3-1', base: 0, manifest: manifest([]) });
  expect(!r.ok && r.error === 'quota-projects' && (await dean.head('q3')) === null, 'a third is refused, and said why: nothing is made');
  r = await dean.commit('q2', { id: 'q2-2', base: 1, manifest: manifest([], 'edited') });
  expect(r.ok, 'a project already there goes on: the limit is on making one');
  r = await dean.remove('q1', { id: 'q1-d', base: 1 });
  expect(r.ok, 'deleting one');
  r = await dean.commit('q3', { id: 'q3-1', base: 0, manifest: manifest([]) });
  expect(r.ok, 'frees its place: the new one is taken now');
  r = await dean.commit('q4', { id: 'q4-1', base: 0, manifest: manifest([]) });
  expect(!r.ok && r.error === 'quota-projects', 'and the next is refused again');
  r = await other.commit('q9', { id: 'q9-1', base: 0, manifest: manifest([]) });
  expect(r.ok, 'another account counts its own');

  const ten = 'a'.repeat(10);
  const eleven = 'b'.repeat(11);
  r = await dean.putBlobs('q2', { [h(ten)]: ten });
  expect(r.ok, 'ten bytes of text, under the twenty this account may store');
  r = await dean.putBlobs('q2', { [h(ten)]: ten });
  expect(r.ok, 'the same text again is not counted twice: it is held once');
  r = await dean.putBlobs('q2', { [h(eleven)]: eleven });
  expect(!r.ok && r.error === 'quota-texts' && JSON.stringify(await dean.missing('q2', [h(eleven)])) === JSON.stringify([h(eleven)]),
    'eleven more would pass the limit: refused, said why, and nothing of it kept');
  r = await dean.commit('q2', {
    id: 'q2-3', base: 2, texts: { [h(eleven)]: eleven },
    manifest: manifest([{ id: 'f', path: 'f.bel', hash: h(eleven) }]),
  });
  expect(!r.ok && r.error === 'quota-texts' && (await dean.head('q2')).version === 2, 'a commit carrying them is refused the same way, and its head stays');
  r = await other.putBlobs('q9', { [h(eleven)]: eleven });
  expect(r.ok, 'while another account stores them under its own limit');
}
