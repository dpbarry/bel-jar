// The store (js/persist/store.mjs): the one owner of browser storage.
// docs/PERSIST.md §3–§5. Every behaviour here is one the rest of BelJar will
// lean on without re-checking: the schema (upgrade what is older, never touch
// what is newer), the classes, quota eviction, report-once, and the three
// origins a change can come from.
import { createStore, classOf, SCHEMA_KEY, isCapacityError } from '../js/persist/store.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

/** A Storage with an optional byte budget, throwing like Chrome when it is spent. */
function fakeStorage(maxChars = Infinity) {
  const m = new Map();
  const used = () => [...m].reduce((a, [k, v]) => a + k.length + v.length, 0);
  return {
    get length() { return m.size; },
    key(i) { return [...m.keys()][i] ?? null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) {
      v = String(v);
      const next = used() - (m.has(k) ? k.length + m.get(k).length : 0) + k.length + v.length;
      if (next > maxChars) {
        const e = new Error('The quota has been exceeded.');
        e.name = 'QuotaExceededError';
        throw e;
      }
      m.set(k, v);
    },
    removeItem(k) { m.delete(k); },
    _map: m,
  };
}

function fakeEvents() {
  const ls = new Set();
  return {
    addEventListener(t, fn) { if (t === 'storage') ls.add(fn); },
    removeEventListener(t, fn) { if (t === 'storage') ls.delete(fn); },
    fire(e) { for (const fn of ls) fn(e); },
    get count() { return ls.size; },
  };
}

let clock = 1000;
const now = () => ++clock;

// ── 1. schema: one format or a clean slate ───────────────────────────────────
{
  const s = fakeStorage();
  const st = createStore({ storage: s, now, events: fakeEvents() });
  expect(st.resetReason === 'fresh', 'an empty browser is a fresh start');
  expect(s.getItem(SCHEMA_KEY) === String(st.SCHEMA), 'the schema is written');
}
{
  const s = fakeStorage();
  for (const k of ['beljar-state-v2', 'beljar:semantic-types', 'beljar-proj:p1:files', 'beljar.loadStats',
    'beljar/p/p1/f/f1', 'other-app-key', 'beljarish']) s.setItem(k, '1');
  const session = fakeStorage();
  session.setItem('beljar-undo:x', '1');
  session.setItem('unrelated', '1');
  const st = createStore({ storage: s, alsoWipe: [session], now, events: fakeEvents() });
  expect(st.resetReason === 'fresh', 'old keys without a schema count as a fresh start');
  expect(['beljar-state-v2', 'beljar:semantic-types', 'beljar-proj:p1:files', 'beljar.loadStats', 'beljar/p/p1/f/f1']
    .every((k) => s.getItem(k) === null), 'every BelJar key of every era is wiped');
  expect(s.getItem('other-app-key') === '1', "another app's key on the same origin survives");
  expect(s.getItem('beljarish') === '1', 'a key that merely starts with the letters survives');
  expect(session.getItem('beljar-undo:x') === null && session.getItem('unrelated') === '1',
    'the session area is wiped of BelJar keys only');
}
{
  const s = fakeStorage();
  const a = createStore({ storage: s, now, events: fakeEvents() });
  a.set('beljar/settings', { values: { theme: 'light' } });
  const b = createStore({ storage: s, now, events: fakeEvents() });
  expect(b.resetReason === null, 'the same schema does not wipe');
  expect(b.get('beljar/settings').values.theme === 'light', 'data survives a reload');
  const c = createStore({ storage: s, now, schema: 99, events: fakeEvents() });
  expect(c.resetReason === 'schema-changed', "an older schema with no migration is wiped under the default policy (a store of conveniences; the app's store refuses: test-migrations)");
  expect(c.get('beljar/settings') === undefined, 'and starts empty');
}

// ── 1b. ⛔ never touch data from a NEWER BelJar ─────────────────────────────
{
  const s = fakeStorage();
  const newer = createStore({ storage: s, now, schema: 99, events: fakeEvents() });
  newer.set('beljar/settings', { values: { theme: 'light' } });
  let ahead = null;
  const old = createStore({ storage: s, now, events: fakeEvents(), onVersionAhead: (v) => { ahead = v; } });
  expect(old.resetReason === 'newer' && old.isReadOnly(), 'an older page meeting newer data opens read-only');
  expect(ahead === 99, 'and is told which version owns the storage');
  expect(old.get('beljar/settings').values.theme === 'light', 'the newer data is intact and still readable');
  expect(s.getItem(SCHEMA_KEY) === '99', 'the newer version stamp is left alone');
  const w = old.set('beljar/settings', { values: {} });
  expect(!w.ok && w.error.code === 'read-only', 'every write is refused');
  expect(!old.remove('beljar/settings').ok && old.removeAll('beljar/') === 0 && !old.applyRemote('beljar/device', {}, 1).ok,
    'removes, whole-prefix removes and pulled writes too');
  expect(newer.get('beljar/settings').values.theme === 'light', 'so the newer tab loses nothing');
}

// ── 1c. another tab upgrades while this one runs: stop writing at once ──────
{
  const s = fakeStorage();
  const ev = fakeEvents();
  let ahead = null;
  const st = createStore({ storage: s, now, events: ev, onVersionAhead: (v) => { ahead = v; } });
  expect(st.set('beljar/device', { values: {} }).ok, 'writes work before the upgrade');
  ev.fire({ storageArea: s, key: SCHEMA_KEY, newValue: String(st.SCHEMA) });
  expect(!st.isReadOnly() && ahead === null, 'the same version stamped again is not an upgrade');
  ev.fire({ storageArea: s, key: SCHEMA_KEY, newValue: String(st.SCHEMA + 1) });
  expect(st.isReadOnly() && ahead === st.SCHEMA + 1, 'a newer version stamped by another tab makes this page read-only');
  expect(!st.set('beljar/device', { values: { late: 1 } }).ok, 'and its next write is refused, not mixed into the new format');
}

// ── 1d. older data: migrated step by step, or refused, never half-wiped ─────
{
  const s = fakeStorage();
  s.setItem(SCHEMA_KEY, '2');
  s.setItem('beljar/device', JSON.stringify({ at: 1, data: { v2: true } }));
  const ran = [];
  const migrations = {
    2: (area) => { ran.push(2); area.setItem('beljar/device', JSON.stringify({ at: 1, data: { v3: true } })); },
    3: (area) => { ran.push(3); area.setItem('beljar/device', JSON.stringify({ at: 1, data: { v4: true } })); },
  };
  const st = createStore({ storage: s, now, schema: 4, events: fakeEvents(), migrations });
  expect(ran.join() === '2,3' && st.resetReason === 'migrated', 'each step runs once, in order');
  expect(st.get('beljar/device').v4 === true && s.getItem(SCHEMA_KEY) === '4', 'and the data arrives in the current format');

  const r = fakeStorage();
  r.setItem(SCHEMA_KEY, '2');
  r.setItem('beljar/device', JSON.stringify({ at: 1, data: { keep: true } }));
  let why = null;
  const refused = createStore({ storage: r, now, schema: 4, events: fakeEvents(), onMissingMigration: 'refuse', onCannotUpgrade: (w) => { why = w; } });
  expect(refused.isReadOnly() && refused.resetReason === 'refused' && /no migration/.test(why || ''), "with the 'refuse' policy, a gap no migration covers opens read-only");
  expect(r.getItem(SCHEMA_KEY) === '2' && JSON.parse(r.getItem('beljar/device')).data.keep, 'and touches nothing');

  const t = fakeStorage();
  t.setItem(SCHEMA_KEY, '3');
  t.setItem('beljar/device', JSON.stringify({ at: 1, data: { keep: true } }));
  const broken = createStore({ storage: t, now, schema: 4, events: fakeEvents(), migrations: { 3: () => { throw new Error('bug'); } } });
  expect(broken.isReadOnly() && JSON.parse(t.getItem('beljar/device')).data.keep,
    'a migration that throws is never followed by a wipe, even under the wipe policy: the data may be half-way');
}

// ── 1e. cleared elsewhere: the version goes back, so the next load keeps new writes ──
{
  const s = fakeStorage();
  const ev = fakeEvents();
  const st = createStore({ storage: s, now, events: ev });
  s._map.clear();
  ev.fire({ storageArea: s, key: null });
  expect(s.getItem(SCHEMA_KEY) === String(st.SCHEMA), 'a clear from another tab re-stamps the version');
  st.set('beljar/device', { values: { after: 1 } });
  const next = createStore({ storage: s, now, events: fakeEvents() });
  expect(next.get('beljar/device').values.after === 1, 'so what was written after the clear survives the next load');
}

// ── 1f. a stand-in that cannot list its keys is refused, loudly ────────────
{
  let why = null;
  try {
    createStore({ storage: { getItem: () => null, setItem() {}, removeItem() {} }, now, events: fakeEvents() });
  } catch (e) { why = String(e.message); }
  expect(why && /length/.test(why), 'a storage without key() and length throws at creation, instead of silently listing nothing');
}

// ── 2. classes come from the key, never the caller ───────────────────────────
{
  const table = {
    'beljar/settings': 'settings', 'beljar/device': 'device', 'beljar/notifications': 'device',
    'beljar/p/p_1/sync': 'device', 'beljar/p/p_1/meta': 'work', 'beljar/p/p_1/tree': 'work',
    'beljar/p/p_1/f/f_9': 'work', 'beljar/p/p_1/session': 'device', 'beljar/p/p_1/cache/f_9': 'cache',
    'beljar/p/p_1/conflict/f_9': 'device',
  };
  for (const [k, cls] of Object.entries(table)) expect(classOf(k) === cls, `${k} is ${cls}`);
  for (const k of ['beljar/p/p_1/f/a/b', 'beljar/p//tree', 'beljar/projects', 'beljar/whatever', 'beljar-theme', SCHEMA_KEY, ''])
    expect(classOf(k) === null, `"${k}" matches no class`);
  const st = createStore({ storage: fakeStorage(), now, events: fakeEvents() });
  let threw = false;
  try { st.set('beljar/whatever', 1); } catch (_) { threw = true; }
  expect(threw, 'storing an unclassified key throws: add it to CLASSES first');
}

// ── 3. records ───────────────────────────────────────────────────────────────
{
  const s = fakeStorage();
  const st = createStore({ storage: s, now, events: fakeEvents() });
  expect(st.get('beljar/device') === undefined, 'a missing record reads as undefined');
  const before = clock;
  expect(st.set('beljar/device', { panel: 'explorer' }).ok, 'a write succeeds');
  expect(st.get('beljar/device').panel === 'explorer', 'and reads back');
  expect(st.at('beljar/device') > before, 'the write is stamped with the clock');
  st.update('beljar/device', (d) => ({ ...d, width: 240 }));
  expect(st.get('beljar/device').width === 240 && st.get('beljar/device').panel === 'explorer', 'update merges via its function');
  s.setItem('beljar/p/p_1/meta', '{not json');
  expect(st.get('beljar/p/p_1/meta') === undefined, 'a corrupt record reads as absent instead of throwing');
  s.setItem('beljar/p/p_1/meta', JSON.stringify({ name: 'x' }));
  expect(st.get('beljar/p/p_1/meta') === undefined, 'a value without an envelope reads as absent');
  st.set('beljar/p/a/f/1', { text: 'x' });
  st.set('beljar/p/a/f/2', { text: 'y' });
  st.set('beljar/p/b/f/1', { text: 'z' });
  expect(st.keys('beljar/p/a/').join() === 'beljar/p/a/f/1,beljar/p/a/f/2', 'keys lists one prefix, sorted');
  expect(!st.keys().includes(SCHEMA_KEY), 'the schema key is not a record');
  expect(st.removeAll('beljar/p/a/') === 2 && st.get('beljar/p/b/f/1').text === 'z', 'removeAll takes exactly one prefix');
  expect(st.set('beljar/device', undefined).ok && st.get('beljar/device') === undefined, 'setting undefined removes');
}

// ── 4. file text can never share a key: ids are opaque, paths are data ───────
{
  const st = createStore({ storage: fakeStorage(), now, events: fakeEvents() });
  // The old bug: 'proofs/nat.bel' and 'proofs_nat.bel' slugified to one key.
  // With opaque ids the two files are two keys whatever their paths say.
  st.set('beljar/p/p_1/tree', { files: { f_a: { path: 'proofs/nat.bel' }, f_b: { path: 'proofs_nat.bel' } } });
  st.set('beljar/p/p_1/f/f_a', { text: 'first' });
  st.set('beljar/p/p_1/f/f_b', { text: 'second' });
  expect(st.get('beljar/p/p_1/f/f_a').text === 'first' && st.get('beljar/p/p_1/f/f_b').text === 'second',
    'two files whose paths flatten alike keep their own text');
}

// ── 5. quota: caches go first, a write that matters is reported once ─────────
{
  const s = fakeStorage(900);
  const reports = [];
  const st = createStore({ storage: s, now, events: fakeEvents(), onCapacity: (state) => reports.push(state) });
  const blob = (c) => c.repeat(150);
  st.set('beljar/p/p/cache/old', { t: blob('a') });
  st.set('beljar/p/p/cache/mid', { t: blob('b') });
  st.set('beljar/p/p/cache/new', { t: blob('c') });
  expect(st.keys('beljar/p/p/cache/').length === 3, 'three caches fit');
  const res = st.set('beljar/p/p/f/f1', { text: blob('w') + blob('w') });
  expect(res.ok, 'a work write that does not fit still lands, by evicting caches');
  expect(st.get('beljar/p/p/cache/old') === undefined, 'the oldest cache went first');
  expect(st.get('beljar/p/p/cache/new') !== undefined, 'the newest cache survived when it could');
  expect(reports.length === 0, 'eviction that succeeds is not a report');
}
{
  const s = fakeStorage(400);
  const reports = [];
  const st = createStore({ storage: s, now, events: fakeEvents(), onCapacity: (state) => reports.push(state) });
  const big = { text: 'x'.repeat(500) };
  expect(!st.set('beljar/p/p/f/f1', big).ok, 'a work write that cannot fit fails');
  expect(st.set('beljar/p/p/f/f1', big).error.code === 'capacity', 'with a capacity error');
  expect(reports.join() === 'blocked', 'reported ONCE across repeated failures, not per keystroke');
  expect(st.isBlocked(), 'and the store says so');
  expect(st.set('beljar/p/p/f/f1', { text: 'ok' }).ok, 'a write that fits succeeds again');
  expect(reports.join() === 'blocked,clear', 'and the all-clear is reported once');
  expect(!st.isBlocked(), 'the store is healthy again');
}
{
  const s = fakeStorage(400);
  const reports = [];
  const st = createStore({ storage: s, now, events: fakeEvents(), onCapacity: (state) => reports.push(state) });
  const res = st.set('beljar/p/p/cache/f1', { t: 'x'.repeat(500) });
  expect(!res.ok && res.error.code === 'capacity', 'a cache that cannot fit fails');
  expect(reports.length === 0 && !st.isBlocked(), 'quietly: a cache is recomputable, nobody is told');
}
expect(isCapacityError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }) && isCapacityError({ code: 22 })
  && isCapacityError({ code: 1014 }) && !isCapacityError(new Error('nope')), 'every spelling of a full disk is recognised');

// ── 6. who changed it: local, remote, another tab ────────────────────────────
{
  const s = fakeStorage();
  const ev = fakeEvents();
  const st = createStore({ storage: s, now, events: ev });
  const seen = [];
  const off = st.subscribe((e) => seen.push(`${e.origin}:${e.key}:${e.cls}`));
  st.set('beljar/settings', { values: {} });
  st.applyRemote('beljar/p/p/f/f1', { text: 'from the cloud' }, 42);
  expect(st.at('beljar/p/p/f/f1') === 42, 'a pulled record keeps the time the other side stamped');
  ev.fire({ storageArea: s, key: 'beljar/p/p/session' });
  ev.fire({ storageArea: s, key: 'other-app-key' });
  ev.fire({ storageArea: s, key: SCHEMA_KEY });
  ev.fire({ storageArea: {}, key: 'beljar/settings' });
  st.applyRemote('beljar/p/p/f/f1', null, 43);
  expect(st.get('beljar/p/p/f/f1') === undefined, 'a pulled deletion deletes');
  expect(seen.join(' | ') === [
    'local:beljar/settings:settings',
    'remote:beljar/p/p/f/f1:work',
    'tab:beljar/p/p/session:device',
    'remote:beljar/p/p/f/f1:work',
  ].join(' | '), `every change says where it came from; foreign keys, the schema and other areas are ignored (${seen.join(' | ')})`);
  off();
  st.set('beljar/device', {});
  expect(seen.length === 4, 'unsubscribe stops delivery');
  const bad = st.subscribe(() => { throw new Error('boom'); });
  let reached = false;
  st.subscribe(() => { reached = true; });
  st.set('beljar/device', { a: 1 });
  expect(reached, 'one throwing listener does not stop the rest');
  bad();
  expect(ev.count === 1, 'the store listens for other tabs');
  st.dispose();
  expect(ev.count === 0, 'and dispose stops listening');
}

console.log(`OK store (${n} checks: schema upgrade and never-touch-newer, migrations, read-only, classes, quota eviction + report-once, origins)`);
