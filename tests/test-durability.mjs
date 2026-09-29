// Keeping the work this browser holds (js/persist/durability.mjs,
// docs/PERSIST.md §5.9): when BelJar asks the browser to keep its storage,
// when it says Safari may delete it, and when it stays quiet.
import { createStore, createMemoryStorage } from '../js/persist/store.mjs';
import { createTable } from '../js/persist/table.mjs';
import { DEVICE, DEVICE_KEY } from '../js/persist/device-schema.mjs';
import { createWork } from '../js/persist/work.mjs';
import { createDurability, countWork, WORK_TO_LOSE, ASK_EVERY } from '../js/persist/durability.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const flush = () => new Promise((r) => setImmediate(r));
const DAY = 24 * 60 * 60 * 1000;

/** A device: its storage, the store on it, the device table and the work model. */
function device(storage, events) {
  const store = createStore({ storage: storage || createMemoryStorage(), events: events || null });
  const table = createTable(store, { key: DEVICE_KEY, rows: DEVICE });
  const work = createWork({ store, device: table });
  return { storage, store, device: table, work };
}

/**
 * One browser's storage seen from several tabs: a write in one tab reaches
 * the others as a `storage` event, as a browser delivers it.
 */
function browser() {
  const base = createMemoryStorage();
  const tabs = [];
  return {
    tab() {
      const events = new EventTarget();
      tabs.push(events);
      const tell = (key, newValue) => {
        for (const t of tabs) {
          if (t === events) continue;
          t.dispatchEvent(Object.assign(new Event('storage'), { key, newValue }));
        }
      };
      const area = {
        get length() { return base.length; },
        key: (i) => base.key(i),
        getItem: (k) => base.getItem(k),
        setItem(k, v) { base.setItem(k, v); tell(k, String(v)); },
        removeItem(k) { base.removeItem(k); tell(k, null); },
        clear() { base.clear(); tell(null, null); },
      };
      return device(area, events);
    },
  };
}

/** navigator.storage, as far as durability uses it. */
function manager(o = {}) {
  const m = { asked: 0, persistedNow: !!o.persisted };
  m.persisted = async () => m.persistedNow;
  m.persist = () => {
    m.asked += 1;
    if (o.throws) throw new Error('not allowed');
    m.persistedNow = !!o.grant;
    return Promise.resolve(!!o.grant);
  };
  return m;
}

function clock(start) {
  let t = start;
  const due = [];
  return {
    now: () => t,
    timers: {
      set(fn, ms) { const h = { at: t + ms, fn }; due.push(h); return h; },
      clear(h) { const i = due.indexOf(h); if (i >= 0) due.splice(i, 1); },
    },
    async advance(ms) {
      t += ms;
      for (const h of due.splice(0).filter((x) => x.at <= t)) h.fn();
      await flush();
    },
  };
}

const click = async (events) => { events.dispatchEvent(new Event('pointerdown')); await flush(); };

function write(d, chars) {
  const pid = d.work.projectId();
  const fid = d.work.readTree(pid).files[0].id;
  d.work.setText(fid, 'x'.repeat(chars), pid);
}

function make(d, o = {}) {
  const c = o.clock || clock(1_800_000_000_000);
  const events = new EventTarget();
  const warned = [];
  const dur = createDurability({
    store: d.store,
    work: d.work,
    device: d.device,
    storage: o.storage === undefined ? manager() : o.storage,
    events,
    sevenDayRule: !!o.sevenDayRule,
    warn: () => warned.push(1),
    now: c.now,
    timers: c.timers,
  });
  return { dur, events, warned, clock: c };
}

// ── counting ─────────────────────────────────────────────────────────────────
{
  const d = device();
  write(d, 10);
  expect(countWork(d.work, WORK_TO_LOSE) === 10, 'work is counted in characters');
  const pid = d.work.projectId();
  const fid = d.work.readTree(pid).files[0].id;
  d.work.setText(fid, '  x \n\t y  \n\n', pid);
  expect(countWork(d.work, WORK_TO_LOSE) === 2, 'blank space is not work');
  const other = d.work.createProject('Other');
  d.work.setText(d.work.readTree(other).files[0].id, 'z'.repeat(WORK_TO_LOSE), other);
  expect(countWork(d.work, WORK_TO_LOSE) >= WORK_TO_LOSE, 'every project that lives only here counts');
  d.work.setAccount('u_dean');
  d.work.claimProject(other);
  expect(countWork(d.work, WORK_TO_LOSE) === 2, 'a project that belongs to an account (and so is on the server) does not');
}

// ── nothing to lose: nothing asked ───────────────────────────────────────────
{
  const d = device();
  write(d, 20);
  const storage = manager();
  const { dur, events } = make(d, { storage });
  await dur.start();
  await click(events);
  expect(storage.asked === 0 && !dur.status().workToLose, 'with no work to lose, a click asks nothing');
}

// ── work arrives: asked at the next click, once ──────────────────────────────
{
  const d = device();
  write(d, 20);
  const storage = manager({ grant: true });
  const { dur, events, warned, clock: c } = make(d, { storage, sevenDayRule: true });
  await dur.start();
  write(d, WORK_TO_LOSE + 50);
  await click(events);
  expect(storage.asked === 0, 'the count waits for a quiet moment after the work is saved');
  await c.advance(5000);
  expect(dur.status().workToLose && storage.asked === 0, 'work to lose, and still nothing asked until the next click');
  await click(events);
  expect(storage.asked === 1, 'the next click asks the browser to keep the storage');
  expect(d.device.get('persistAskedAt') === c.now(), 'the device remembers when it asked');
  expect(dur.status().persisted === true && warned.length === 0, 'granted: nothing to warn about, even in Safari');
  await click(events);
  expect(storage.asked === 1, 'asked once, not on every click');
}

// ── work that came through sync is on the server as well ─────────────────────
{
  const d = device();
  write(d, 20);
  const pid = d.work.projectId();
  d.work.setAccount('u_dean');
  d.work.claimProject(pid);
  const storage = manager();
  const { dur, events, clock: c } = make(d, { storage });
  await dur.start();
  const fid = d.work.readTree(pid).files[0].id;
  d.store.applyRemote(`beljar/p/${pid}/f/${fid}`, { text: 'y'.repeat(WORK_TO_LOSE * 2), via: 'sync' });
  await c.advance(5000);
  await click(events);
  expect(!dur.status().workToLose && storage.asked === 0, 'sync filling a project of the account is not work to lose: it is on the server');
}

// ── already kept: nothing asked, nothing said ────────────────────────────────
{
  const d = device();
  write(d, WORK_TO_LOSE * 2);
  const storage = manager({ persisted: true });
  let reads = 0;
  const all = d.work.allProjects;
  d.work.allProjects = () => { reads += 1; return all(); };
  const { dur, events, warned } = make(d, { storage, sevenDayRule: true });
  await dur.start();
  await click(events);
  expect(storage.asked === 0 && warned.length === 0 && dur.status().persisted === true, 'storage the browser already keeps is left alone');
  expect(reads === 0, 'and costs nothing: not one project is read to count the work');
}

// ── refused ──────────────────────────────────────────────────────────────────
{
  const d = device();
  write(d, WORK_TO_LOSE * 2);
  const storage = manager({ grant: false });
  const { dur, events, warned } = make(d, { storage });
  await dur.start();
  await click(events);
  expect(storage.asked === 1 && dur.status().persisted === false && warned.length === 0,
    'refused outside Safari: nothing is said (only disk pressure clears it there)');
}
{
  const d = device();
  write(d, WORK_TO_LOSE * 2);
  const storage = manager({ grant: false });
  const first = make(d, { storage, sevenDayRule: true });
  await first.dur.start();
  await click(first.events);
  expect(first.warned.length === 1 && d.device.get('durabilityWarnedAt') > 0, 'refused in Safari: the 7 days are said, once');
  first.dur.dispose();
  const again = make(d, { storage, sevenDayRule: true, clock: clock(first.clock.now() + DAY) });
  await again.dur.start();
  await click(again.events);
  expect(again.warned.length === 0 && storage.asked === 1, 'the next day: not asked again, not said again');

  const later = make(d, { storage, sevenDayRule: true, clock: clock(first.clock.now() + ASK_EVERY + DAY) });
  await later.dur.start();
  await click(later.events);
  expect(storage.asked === 2 && later.warned.length === 0, 'a month on, the browser is asked again (Chrome decides by use), and nothing is said twice');
}
{
  const d = device();
  write(d, WORK_TO_LOSE * 2);
  const { dur, warned } = make(d, { storage: null, sevenDayRule: true });
  await dur.start();
  expect(warned.length === 1, 'Safari with no way to ask: said at once');
}
{
  const d = device();
  write(d, WORK_TO_LOSE * 2);
  const storage = manager({ throws: true });
  const { dur, events, warned } = make(d, { storage, sevenDayRule: true });
  await dur.start();
  await click(events);
  expect(storage.asked === 1 && warned.length === 1 && dur.status().persisted === false, 'a request that throws is a refusal');
}

// ── two tabs, one device ─────────────────────────────────────────────────────
{
  const one = browser();
  const tabA = one.tab();
  write(tabA, WORK_TO_LOSE * 2);
  const tabB = one.tab();
  const manager1 = manager({ grant: false });
  const c = clock(1_800_000_000_000);
  const a = make(tabA, { storage: manager1, clock: c });
  const b = make(tabB, { storage: manager1, clock: c });
  await a.dur.start();
  await b.dur.start();
  await click(a.events);
  await click(b.events);
  expect(manager1.asked === 1, 'two tabs both ready to ask: the first click asks, the other tab does not ask again');
}

// ── stopping ─────────────────────────────────────────────────────────────────
{
  const d = device();
  write(d, WORK_TO_LOSE * 2);
  const storage = manager();
  const { dur, events } = make(d, { storage });
  await dur.start();
  dur.dispose();
  await click(events);
  expect(storage.asked === 0, 'disposed: a click asks nothing');
}

console.log(`OK durability (${n} checks: work to lose, asked at the next click, once a month at most, Safari's 7 days said once, two tabs)`);
