// What sync costs, measured (plan v6 c7, docs/PERSIST.md §5.7): requests in an
// hour of typing and an hour idle, on a fake clock, through the real runner and
// engine; and the rows D1 itself says it wrote, on a real local database, for
// each kind of round. Printed, and held: a change that makes sync dearer fails
// here, and the numbers in PERSIST.md are these.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { createMemoryServer } from '../js/persist/sync/memory-server.mjs';
import { createSyncRunner } from '../js/persist/sync/runner.mjs';
import { createSyncStore } from '../server/sync-store.mjs';
import { makeDevice, syncHash, fileId } from './_sync-env.mjs';
import { flush, clock, lockManager } from './_runner-env.mjs';
import { testConfig, ROOT } from './_worker-env.mjs';

let n = 0;
let proxy = null;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  if (proxy) proxy.dispose().catch(() => {});
  process.exit(1);
}

/** A transport that counts each call by method. */
function counting(real) {
  const calls = {};
  const t = {};
  for (const k of Object.keys(real)) {
    t[k] = (...a) => { calls[k] = (calls[k] || 0) + 1; return real[k](...a); };
  }
  return { t, calls, total: () => Object.values(calls).reduce((a, b) => a + b, 0), reset: () => { for (const k of Object.keys(calls)) delete calls[k]; } };
}

const HOUR = 60 * 60 * 1000;
const fmt = (calls) => Object.entries(calls).sort().map(([k, v]) => `${k} ${v}`).join(', ');

// ── 1. requests: an hour of typing, an hour idle ────────────────────────────
const server = createMemoryServer({ hash: syncHash });
const counter = counting(server.transport('u_dean'));
const dev = makeDevice(server, { name: 'BUDGET', transport: counter.t });
const pid = dev.work.projectId();
const main = fileId(dev.work, pid, 'main.bel');
const c = clock();
const runner = createSyncRunner({ engine: dev.engine, store: dev.store, locks: lockManager(), timers: c.timers, now: c.now });
dev.work.setText(main, 'rec nat : type.\n', pid);
runner.start();
await flush();
await c.advance(10_000);
expect(server.projectIds().includes(pid), 'a project in the cloud to begin with');

// Typing: a keystroke saved every two seconds, for an hour.
counter.reset();
let rounds = 0;
const off = runner.subscribe((st) => { if (st.state === 'syncing') rounds += 1; });
let text = 'rec nat : type.\n';
for (let t = 0; t < HOUR; t += 2000) {
  text += 'x';
  dev.work.setText(main, text, pid);
  await c.advance(2000);
}
await c.advance(60_000);
const typing = { rounds, requests: counter.total(), calls: { ...counter.calls } };

// Idle: an hour with nothing typed.
counter.reset();
rounds = 0;
await c.advance(HOUR);
const idle = { rounds, requests: counter.total(), calls: { ...counter.calls } };
off();
await runner.stop();

console.log(`  an hour of typing (a keystroke every 2 s): ${typing.rounds} rounds, ${typing.requests} requests (${fmt(typing.calls)})`);
console.log(`  an hour idle: ${idle.rounds} rounds, ${idle.requests} requests (${fmt(idle.calls)})`);
expect(typing.rounds >= 110 && typing.rounds <= 125, `typing, a round every 30 s at most (the longest a change waits), so about 120 an hour (${typing.rounds})`);
expect(typing.requests <= typing.rounds * 2, `each typing round is at most two requests: the list (with the settings' version riding on it) and the push (${typing.requests})`);
expect(idle.rounds >= 59 && idle.rounds <= 61, `idle, a round a minute for other devices' changes (${idle.rounds})`);
expect(idle.requests === idle.rounds, `each idle round is ONE request: the settings' version rides with the list (${idle.requests})`);

// Hidden: nobody is looking, so nobody polls; a change still goes up.
{
  const sv = createMemoryServer({ hash: syncHash });
  const cnt = counting(sv.transport('u_dean'));
  const d = makeDevice(sv, { name: 'HIDDEN', transport: cnt.t });
  const dpid = d.work.projectId();
  const df = fileId(d.work, dpid, 'main.bel');
  const ck = clock();
  let seen = false;
  const r = createSyncRunner({ engine: d.engine, store: d.store, locks: lockManager(), timers: ck.timers, now: ck.now, visible: () => seen });
  d.work.setText(df, 'rec nat : type.\n', dpid);
  r.start();
  await flush();
  await ck.advance(10_000);
  cnt.reset();
  await ck.advance(HOUR);
  const hidden = cnt.total();
  console.log(`  an hour hidden: ${hidden} requests`);
  expect(hidden === 0, `an hour hidden makes no request: no poll while nobody can see the page (${hidden})`);
  d.work.setText(df, 'typed in a hidden tab\n', dpid);
  await ck.advance(6000);
  const vs = sv.history(dpid).versions;
  expect(sv.text('u_dean', vs[vs.length - 1].manifest.files[0].hash) === 'typed in a hidden tab\n', 'a change made hidden still goes up, after the same quiet spell');
  cnt.reset();
  await ck.advance(HOUR);
  expect(cnt.total() === 0, 'and then it waits again');
  seen = true;
  await r.syncNow();
  expect(cnt.total() === 1, `seen again, one round at once catches up (${cnt.total()})`);
  await ck.advance(60_000);
  expect(cnt.total() === 2, 'and polling resumes while it is seen');
  await r.stop();
}
expect(server.text('u_dean', server.history(pid).versions.at(-1).manifest.files[0].hash) === text, 'and all of it reached the cloud');

// The page's own runner is told when it cannot be seen (persist.mjs), and asks again when it is.
{
  const src = fs.readFileSync(path.join(ROOT, 'js', 'persist', 'persist.mjs'), 'utf8');
  // ⛔ The seen tab's minute ask runs only while sync does: a timer of the module's
  // own kept every page and every test that loads it alive (test-shell-boot hung).
  const intervals = src.split('setInterval(').length - 1;
  const inStart = src.slice(src.indexOf('function startPollAsk()'), src.indexOf('function stopPollAsk()')).includes('setInterval(');
  expect(intervals === 1 && inStart && /startPollAsk\(\);\n  return syncRunner;/.test(src) && /function stopSync\(opts\) \{\n  stopPollAsk\(\);/.test(src),
    'the one interval the page sets starts with sync and stops with it');
  const runnerAt = src.indexOf('syncRunner = createSyncRunner({');
  expect(runnerAt > 0
    && src.slice(runnerAt, runnerAt + 600).includes("visible: function () { return typeof document === 'undefined' || document.visibilityState !== 'hidden'; }")
    && src.includes("if (document.visibilityState === 'visible') seenAgain();"),
  'the page tells its runner when nobody can see it, and asks for a round when it is seen again');
}

// ── 2. rows written, as D1 counts them ──────────────────────────────────────
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'beljar-budget-'));
proxy = await getPlatformProxy({ configPath: testConfig(persist), persist: { path: persist } });
try {
  const raw = proxy.env.DB;
  const sql = fs.readdirSync(path.join(ROOT, 'server', 'migrations')).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => fs.readFileSync(path.join(ROOT, 'server', 'migrations', f), 'utf8')).join('\n');
  for (const stmt of sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';')) {
    if (stmt.trim()) await raw.prepare(stmt).run();
  }
  // D1's own figure: every write's meta.rows_written, summed, through the
  // four calls the store makes (prepare, bind, first/all/run, batch).
  let written = 0;
  let queries = 0;
  const stmt = (real) => ({
    real,
    bind: (...a) => stmt(real.bind(...a)),
    first: async (...a) => { queries += 1; return real.first(...a); },
    all: async () => { queries += 1; const r = await real.all(); written += (r.meta && r.meta.rows_written) || 0; return r; },
    run: async () => { queries += 1; const r = await real.run(); written += (r.meta && r.meta.rows_written) || 0; return r; },
  });
  const db = {
    prepare: (q) => stmt(raw.prepare(q)),
    batch: async (list) => {
      queries += 1;
      const res = await raw.batch(list.map((x) => x.real));
      for (const r of res) written += (r.meta && r.meta.rows_written) || 0;
      return res;
    },
  };
  const store = createSyncStore({ db, texts: proxy.env.TEXTS });
  const measure = async (fn) => {
    written = 0;
    queries = 0;
    await fn();
    return { rows: written, queries };
  };
  const d = makeDevice(null, { name: 'BUDGET-D1', transport: store.transport('u_budget') });
  const dp = d.work.projectId();
  const df = fileId(d.work, dp, 'main.bel');
  d.work.setText(df, 'rec nat : type.\n', dp);
  const first = await measure(() => d.engine.syncAll());
  d.work.setText(df, 'rec nat : type.\n% one more line\n', dp);
  const edit = await measure(() => d.engine.syncAll());
  const quiet = await measure(() => d.engine.syncAll());
  d.settings.set('theme', 'light');
  const setting = await measure(() => d.engine.syncAll());
  console.log(`  rows written (D1's own count): a new project ${first.rows}, an edit ${edit.rows}, an idle round ${quiet.rows}, a setting ${setting.rows}`);
  console.log(`  queries: a new project ${first.queries}, an edit ${edit.queries}, an idle round ${quiet.queries}, a setting ${setting.queries}`);
  expect(quiet.rows === 0, `an idle round writes nothing (${quiet.rows})`);
  // Tables stored by their key (migration 0004): a row is written once, not again in its key's
  // index. And the account's count (0005, the quota) moves with every text it stores.
  expect(edit.rows > 0 && edit.rows <= 5, `an edit writes at most five rows: its text, its version and the version's commit id, the head, the account's count (${edit.rows}; six before 0004, without the count)`);
  expect(first.rows <= 8, `a new project at most eight (${first.rows}; nine before 0004, without the count)`);
  expect(setting.rows <= 4, `a setting at most four (${setting.rows}; six before 0004)`);
  globalThis.__budget = { typing, idle, first, edit, quiet, setting };
} finally {
  await proxy.dispose();
  proxy = null;
  try { fs.rmSync(persist, { recursive: true, force: true }); } catch (_) { /* a file may be held briefly */ }
}

console.log(`OK sync budget (${n} checks: requests in an hour of typing and an hour idle, rows written per round as D1 counts them)`);
