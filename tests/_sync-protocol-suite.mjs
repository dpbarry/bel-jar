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

}
