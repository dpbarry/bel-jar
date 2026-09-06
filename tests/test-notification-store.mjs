import {
  createNotificationStore,
  createMemoryAdapter,
  createLocalPersistAdapter,
  linkTarget,
  normalizeRecord,
  migrateRecord,
  SCHEMA_VERSION,
  STORAGE_KEY,
} from '../js/ui/notification-store.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const r = normalizeRecord('hello');
expect(r && r.title === 'hello', 'string → title');
expect(r.v === SCHEMA_VERSION, 'schema version');
expect(r.kind === 'info' && r.category === 'ops', 'string defaults');
expect(r.origin === 'local', 'local origin');
expect(!!r.id, 'id assigned');

const structured = normalizeRecord({
  title: 'Split n declined',
  body: 'reason',
  detail: 'Beluga why',
  kind: 'error',
  category: 'teaching',
  source: 'prover.split',
  dedupeKey: 'prover.split:n',
  links: { line: 12, path: 'a.bel' },
});
expect(structured.body === 'reason', 'body kept');
expect(structured.detail === 'Beluga why', 'detail kept');
expect(structured.links.line === 12, 'links.line');
expect(migrateRecord({ ...structured, v: 1 }).title === structured.title, 'migrate v1');

const mem = createMemoryAdapter();
const store = createNotificationStore({ adapter: mem, cap: 3 });

const id1 = store.upsert({
  title: 'A',
  kind: 'error',
  category: 'teaching',
  source: 'prover.split',
  dedupeKey: 'k1',
  createdAt: 10,
}).id;
expect(store.count() === 1, 'upsert one');
expect(store.unreadCount() === 1, 'unread one');

store.upsert({
  title: 'A2',
  body: 'updated',
  kind: 'error',
  category: 'teaching',
  source: 'prover.split',
  dedupeKey: 'k1',
  createdAt: 20,
});
expect(store.count() === 1, 'dedupe merges');
expect(store.get(id1).body === 'updated', 'dedupe keeps id, updates body');
expect(store.get(id1).title === 'A2', 'dedupe updates title');
expect(store.get(id1).createdAt === 20, 'explicit createdAt on merge');
expect(store.get(id1).readAt == null, 'dedupe resets unread');

// A repeat refreshes the one card; it never becomes a stack or a tally.
store.upsert({
  title: 'A3', kind: 'error', source: 'prover.split', dedupeKey: 'k1', createdAt: 21,
});
expect(store.count() === 1, 'a third sighting is still one card');
expect(store.get(id1).title === 'A3', 'and it carries the latest wording');
expect(store.get(id1).count === undefined, 'nothing counts the repeats');
expect(normalizeRecord({ title: 'restored', count: 7 }).count === undefined,
  'a count from an older store is dropped, not honoured');

store.upsert({ title: 'B', source: 'ops', createdAt: 100 });
store.upsert({ title: 'C', source: 'ops', createdAt: 200 });
store.upsert({ title: 'D', source: 'ops', createdAt: 300 });
expect(store.count() === 3, 'cap enforced');
expect(store.list().map((x) => x.title).join(',') === 'D,C,B', 'kept newest three');

store.markAllRead();
expect(store.unreadCount() === 0, 'markAllRead');
store.dismiss(store.list()[0].id);
expect(store.count() === 2, 'dismiss');

let seen = 0;
const unsub = store.subscribe(() => { seen += 1; });
store.upsert({ title: 'E', createdAt: 400 });
expect(seen === 1, 'subscribe fires');
unsub();
store.clear();
expect(store.count() === 0, 'clear');
expect(seen === 1, 'unsub works');

const bag = new Map();
const persistAdapter = createLocalPersistAdapter({
  key: STORAGE_KEY,
  load: (k) => bag.get(k) || null,
  save: (k, v) => { bag.set(k, v); },
});
const s2 = createNotificationStore({ adapter: persistAdapter });
s2.upsert({ title: 'Persisted', source: 'test', category: 'ops' });
const s3 = createNotificationStore({ adapter: persistAdapter });
expect(s3.count() === 1, 'local persist round-trip');
expect(s3.list()[0].title === 'Persisted', 'persisted title');

// -- linkTarget: what the inbox can actually navigate to --------------------
expect(linkTarget(null) === null, 'linkTarget: no record');
expect(linkTarget(normalizeRecord('bare')) === null, 'linkTarget: no links');
expect(linkTarget(normalizeRecord({ title: 'x', links: { line: 4 } })) === null,
  'linkTarget: line without fileId is not addressable');
expect(linkTarget(normalizeRecord({ title: 'x', links: { fileId: 'f1' } })) === null,
  'linkTarget: fileId alone aims at nothing');

const byLine = linkTarget(normalizeRecord({
  title: 'x', links: { fileId: 'f1', path: 'proofs/weak-norm.bel', line: 42 },
}));
expect(byLine.fileId === 'f1', 'linkTarget: fileId');
expect(byLine.from === null && byLine.line === 42, 'linkTarget: line resolves later');
expect(byLine.label === 'weak-norm.bel:42', 'linkTarget: label is basename:line');

const byOffset = linkTarget(normalizeRecord({
  title: 'x', links: { fileId: 'f1', path: 'a.bel', from: 100, to: 120, line: 9 },
}));
expect(byOffset.from === 100 && byOffset.to === 120, 'linkTarget: offsets survive normalize');
expect(byOffset.label === 'a.bel:9', 'linkTarget: line still labels an offset target');

const noTo = linkTarget(normalizeRecord({ title: 'x', links: { fileId: 'f1', from: 7 } }));
expect(noTo.to === 7, 'linkTarget: to defaults to from');
expect(noTo.label === 'f1', 'linkTarget: falls back to fileId with no path');

expect(linkTarget(normalizeRecord({ title: 'x', links: { fileId: 'f1', line: 0 } })) === null,
  'linkTarget: line 0 is not a line');

const roundTrip = migrateRecord(normalizeRecord({
  title: 'x', links: { fileId: 'f1', from: 5, to: 8, path: 'a.bel' },
}));
expect(linkTarget(roundTrip).from === 5, 'linkTarget: survives migrate');

console.log('OK notification-store (normalize, dedupe, cap, persist, subscribe, linkTarget)');
