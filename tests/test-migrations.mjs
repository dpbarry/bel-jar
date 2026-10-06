// A format change never deletes anybody's work (docs/PERSIST.md §3.1).
//
// Two halves. The table: every format the live site has stored has its step to
// the next, so bumping SCHEMA without writing one fails here, before it ships.
// The backstop: older data no step reaches is left exactly as it was, and the
// page runs on memory and says so. It does not wipe, and it does not break.
import fs from 'node:fs';
import { SCHEMA, SCHEMA_KEY, createStore, migrateStorage } from '../js/persist/store.mjs';
import { MIGRATIONS, FIRST_LIVE_SCHEMA } from '../js/persist/migrations.mjs';
import { makeBrowserStorage, openTab } from './_persist-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── the table covers every format the live site has stored ─────────────────
expect(Number.isInteger(FIRST_LIVE_SCHEMA) && FIRST_LIVE_SCHEMA <= SCHEMA, `the first live format is not after the current one (${FIRST_LIVE_SCHEMA}, ${SCHEMA})`);
const missing = [];
for (let v = FIRST_LIVE_SCHEMA; v < SCHEMA; v++) if (typeof MIGRATIONS[v] !== 'function') missing.push(v);
expect(missing.length === 0,
  `every stored format has its step to the next: SCHEMA is ${SCHEMA} and migrations.mjs has no step from ${missing.join(', ')}`
  + ' (without it every browser holding that format opens read-only on memory)');
const stray = Object.keys(MIGRATIONS).filter((k) => !(Number(k) >= FIRST_LIVE_SCHEMA && Number(k) < SCHEMA));
expect(stray.length === 0, `and no step leads from a format that cannot be stored (${stray.join(', ')})`);

// ── the app's store is opened with the table, and refuses what it cannot reach ──
const source = fs.readFileSync(new URL('../js/persist/persist.mjs', import.meta.url), 'utf8');
expect(/migrations:\s*MIGRATIONS\b/.test(source) && /import \{ MIGRATIONS \} from '\.\/migrations\.mjs'/.test(source),
  'persist.mjs opens the store with the migrations table');

const older = String(FIRST_LIVE_SCHEMA - 1);
const seed = {
  [SCHEMA_KEY]: older,
  'beljar/projects': JSON.stringify({ at: 1, data: [{ id: 'p_old', name: 'Thesis' }] }),
  'beljar/device': JSON.stringify({ at: 1, data: { activeProject: 'p_old' } }),
  'beljar/p/p_old/f/f_old': JSON.stringify({ at: 1, data: { text: 'rec proof : [|- a] = ?;' } }),
  'beljar-state-v2': JSON.stringify({ v: 2 }),
  'unrelated-site-key': 'kept',
};
const untouched = (storage) => Object.entries(seed).every(([k, v]) => storage.getItem(k) === v)
  && storage.map.size === Object.keys(seed).length;
{
  const storage = makeBrowserStorage(seed);
  const said = [];
  const { P } = openTab(storage, { Toasts: { error: (m) => said.push(m) } });
  expect(untouched(storage), `older data no step reaches is left exactly as it was (${[...storage.map.keys()].sort().join(', ')})`);
  const projects = P.listProjects();
  expect(projects.length === 1 && projects[0].name === 'Untitled project' && P.listFiles().length === 1,
    'the page still opens, on a project of its own (it cannot run on records it does not understand)');
  const fid = P.listFiles()[0].id;
  P.setFileText(fid, 'typed today');
  P.createFile('more.bel');
  expect(P.getFileText(fid) === 'typed today' && P.listFiles().length === 2, 'and works: what is typed is there to read');
  expect(untouched(storage), 'none of it is written over the older data');
  await new Promise((r) => setTimeout(r, 20));
  expect(said.length === 1 && /not being saved/.test(said[0]), `the person is told, once (${said.join(' | ')})`);
  // The next load finds the same thing: the older data waits for a BelJar that reads it.
  const again = openTab(storage, { Toasts: { error() {} } }).P;
  expect(untouched(storage) && again.listProjects().length === 1, 'and a reload changes nothing either');
}

// ── with its step written, the same data is carried forward, not refused ────
{
  const storage = makeBrowserStorage({ [SCHEMA_KEY]: String(SCHEMA), 'beljar/device': JSON.stringify({ at: 1, data: { values: {} } }) });
  const next = createStore({
    storage,
    schema: SCHEMA + 1,
    events: null,
    onMissingMigration: 'refuse',
    migrations: { ...MIGRATIONS, [SCHEMA]: (area) => area.setItem('beljar/device', JSON.stringify({ at: 2, data: { values: { carried: true } } })) },
  });
  expect(next.resetReason === 'migrated' && !next.isReadOnly() && storage.getItem(SCHEMA_KEY) === String(SCHEMA + 1)
    && next.get('beljar/device').values.carried === true, 'a step in the table is what turns a refusal into an upgrade');
}

// ── the one step loop (store.mjs migrateStorage), as early boot runs it ──────
{
  const mem = (schema, extra) => {
    const m = new Map(Object.entries(Object.assign(schema == null ? {} : { [SCHEMA_KEY]: String(schema) }, extra || {})));
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
  };
  const ran = [];
  const steps = { 4: (s) => { ran.push(4); s.setItem('beljar/x', 'four'); }, 5: () => { ran.push(5); } };
  let s = mem(4);
  let r = migrateStorage(s, 6, steps);
  expect(r.result === 'migrated' && r.from === 4 && ran.join() === '4,5' && s.getItem(SCHEMA_KEY) === '6' && s.getItem('beljar/x') === 'four',
    'every step from the stored format, in order, then the new one stamped');
  expect(migrateStorage(s, 6, steps).result === 'current' && ran.length === 2, 'run again, nothing happens: the format is current');
  ran.length = 0;
  s = mem(4);
  r = migrateStorage(s, 6, { 4: steps[4] });
  expect(r.result === 'missing' && r.at === 5 && ran.length === 0 && s.getItem(SCHEMA_KEY) === '4' && s.getItem('beljar/x') === null,
    '⛔ a gap anywhere runs nothing at all: no half-migrated data, the format as it was');
  s = mem(4);
  r = migrateStorage(s, 6, { 4: () => { throw new Error('bad step'); }, 5: steps[5] });
  expect(r.result === 'threw' && r.at === 4 && /bad step/.test(r.error) && s.getItem(SCHEMA_KEY) === '4', 'a step that throws leaves the format unstamped, and says which');
  expect(migrateStorage(mem(7), 6, steps).result === 'newer' && migrateStorage(mem(null), 6, steps).result === 'fresh'
    && migrateStorage(mem('x'), 6, steps).result === 'unreadable', 'newer, fresh and unreadable storage is only named, never touched');
  const src = fs.readFileSync(new URL('../js/boot/early-boot-core.mjs', import.meta.url), 'utf8');
  const at = src.indexOf('export function installEarlyBoot');
  const mig = src.indexOf('migrateStorage(localStorage, SCHEMA, MIGRATIONS)', at);
  const read = src.indexOf('readBootDevice(localStorage, SCHEMA)', at);
  expect(at > 0 && mig > at && read > mig, '⛔ early boot migrates before it reads anything: the first paint shows the person\'s settings (scripts/probe-migration.mjs sees it in Chrome)');
}

console.log(`OK migrations (${n} checks: every live format has its step, older data is refused not wiped, the page still works)`);
