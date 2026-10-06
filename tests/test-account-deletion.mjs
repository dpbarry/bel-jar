// Deleting an account (server/deletion.mjs, plan v6 c3), on its own: what it
// covers, how its texts go, and the daily job finishing what a request left.
// The whole flow over HTTP, down to listing the bucket, is in
// tests/test-auth-worker.mjs.
//
// ⛔ What names an account is listed once (ACCOUNT_ROWS). A table a later
// migration adds must be listed there, or said to name no account: otherwise
// a deleted account would leave it behind and nothing would say so.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';
import {
  ACCOUNT_ROWS, NAMES_NO_ACCOUNT, DELETION_RECORD, TEXT_BATCH, REQUEST_BATCHES, GRACE_MS,
  deleteAccountRows, deleteTexts, dailySweep,
} from '../server/deletion.mjs';
import { textPrefix } from '../server/sync-store.mjs';
import { testConfig } from './_worker-env.mjs';
import { finalTables } from './_schema.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
let proxy = null;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  if (proxy) proxy.dispose().catch(() => {});
  process.exit(1);
}

// ── every table, accounted for ──────────────────────────────────────────────
const dir = path.join(root, 'server', 'migrations');
const sql = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
// The tables as the migrations leave them: one rebuilt under a passing name is the one it replaces.
const made = [...finalTables()].map(([name, body]) => ({ name, body }));
const listed = new Set(ACCOUNT_ROWS.map(([t]) => t));
expect(made.length >= 10, `the migrations' tables are read (${made.map((t) => t.name).join(', ')})`);
const unaccounted = made.filter((t) => !listed.has(t.name) && !NAMES_NO_ACCOUNT.includes(t.name) && t.name !== DELETION_RECORD);
expect(!unaccounted.length, `every table the migrations make is deleted with an account, or names none (${unaccounted.map((t) => t.name).join(', ')})`);
const gone = [...listed].filter((t) => !made.some((m) => m.name === t));
expect(!gone.length, `and every table the deletion names exists (${gone.join(', ')})`);
const naming = made.filter((t) => /\b(owner|account|user_id)\b/.test(t.body)).map((t) => t.name);
expect(naming.every((t) => listed.has(t) || t === DELETION_RECORD), `a table with an owner, account or user_id column is one the deletion covers (${naming.join(', ')})`);
expect(ACCOUNT_ROWS.findIndex(([t]) => t === 'versions') < ACCOUNT_ROWS.findIndex(([t]) => t === 'projects'),
  'versions go before projects: they are found through them');
expect(TEXT_BATCH === 1000 && REQUEST_BATCHES * TEXT_BATCH >= 20000 && GRACE_MS === 60 * 60 * 1000,
  'a thousand texts a batch (what R2 lists and deletes at once), 20,000 in a request, an hour of grace');

// ── texts, a thousand at a time ─────────────────────────────────────────────
/** R2 as the binding behaves for list and delete: keys in order, `limit` at most, `truncated` when there are more. */
function fakeR2(keys) {
  const all = new Set(keys);
  const calls = { list: 0, delete: 0, largest: 0 };
  return {
    calls,
    keys: () => [...all].sort(),
    async list({ prefix, limit }) {
      calls.list += 1;
      const hits = [...all].filter((k) => k.startsWith(prefix)).sort();
      return { objects: hits.slice(0, limit).map((key) => ({ key })), truncated: hits.length > limit };
    },
    async delete(ks) {
      calls.delete += 1;
      calls.largest = Math.max(calls.largest, ks.length);
      if (ks.length > 1000) throw new Error('R2 deletes at most 1000 keys at once');
      for (const k of ks) all.delete(k);
    },
  };
}
const many = (account, count) => Array.from({ length: count }, (_, i) => textPrefix(account) + String(i).padStart(64, '0'));
{
  const r2 = fakeR2([...many('u_a', 2500), ...many('u_ab', 3), ...many('u_b', 2)]);
  expect((await deleteTexts(r2, 'u_a', 2)) === false && r2.keys().filter((k) => k.startsWith('t/u_a/')).length === 500,
    'two batches take 2,000 and say there is more');
  expect((await deleteTexts(r2, 'u_a', 2)) === true && !r2.keys().some((k) => k.startsWith('t/u_a/')), 'the next call takes the rest, and says so');
  expect(r2.keys().length === 5 && r2.calls.largest === 1000, 'never more than a thousand at once, and nobody else\'s: not u_ab, whose id starts the same');
  expect((await deleteTexts(fakeR2([]), 'u_a', 1)) === true, 'an account with no texts is done at once');
}

// ── the daily job finishes what a closed tab left ───────────────────────────
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'beljar-deletion-'));
proxy = await getPlatformProxy({ configPath: testConfig(persist), persist: { path: persist } });
try {
  const db = proxy.env.DB;
  for (const stmt of sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';')) {
    if (stmt.trim()) await db.prepare(stmt).run();
  }
  const t0 = 1_800_000_000_000;
  for (const [id, handle] of [['u_gone', 'gone'], ['u_stays', 'stays']]) {
    await db.prepare('INSERT INTO users (id, handle, created_at) VALUES (?, ?, ?)').bind(id, handle, t0).run();
    await db.prepare("INSERT INTO identities (provider, subject, user_id, created_at) VALUES ('github', ?, ?, ?)").bind(handle, id, t0).run();
    await db.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind('h-' + id, id, t0, t0 + 1e10).run();
    await db.prepare('INSERT INTO projects (id, owner, head) VALUES (?, ?, 1)').bind('p-' + id, id).run();
    await db.prepare("INSERT INTO versions (project, version, base, commit_id, manifest, created_at) VALUES (?, 1, 0, 'c', '{}', ?)").bind('p-' + id, t0).run();
    await db.prepare("INSERT INTO texts (account, hash, size, created_at) VALUES (?, 'x', 1, ?)").bind(id, t0).run();
    await db.prepare('INSERT INTO settings_heads (account, head) VALUES (?, 1)').bind(id).run();
    await db.prepare("INSERT INTO settings_versions (account, version, commit_id, vals, created_at) VALUES (?, 1, 's', '{}', ?)").bind(id, t0).run();
  }
  const r2 = fakeR2([...many('u_gone', 2500), ...many('u_stays', 3)]);
  const env = { DB: db, TEXTS: r2 };

  // The request: the rows at once, then the tab closed before any text went.
  await deleteAccountRows(db, 'u_gone', t0);
  const count = async (account) => {
    let total = 0;
    for (const [table, where] of ACCOUNT_ROWS) {
      total += (await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).bind(account).first()).n;
    }
    return total;
  };
  expect((await count('u_gone')) === 0 && (await count('u_stays')) === 8, 'the rows go at once, in one transaction, and only the account\'s');
  const ended = await db.prepare('SELECT reason, expires_at FROM ended_sessions WHERE id_hash = ?').bind('h-u_gone').first();
  expect(ended && ended.reason === 'deleted' && ended.expires_at === t0 + 1e10, 'its session\'s browser will hear why, until the session would have expired');

  let run = await dailySweep(env, t0 + 10, { batches: 2 });
  expect(run.deletions === 1 && run.finished === 0 && r2.keys().filter((k) => k.includes('u_gone')).length === 500,
    'the daily job takes what it may in one run, and comes back for the rest');
  run = await dailySweep(env, t0 + 20, { batches: 2 });
  expect(!r2.keys().some((k) => k.includes('u_gone')) && run.finished === 0, 'the next run finishes the texts');
  expect((await db.prepare(`SELECT COUNT(*) AS n FROM ${DELETION_RECORD}`).first()).n === 1, 'and keeps the record while the hour runs');
  run = await dailySweep(env, t0 + GRACE_MS, { batches: 2 });
  expect(run.finished === 1 && (await db.prepare(`SELECT COUNT(*) AS n FROM ${DELETION_RECORD}`).first()).n === 0, 'then lets it go');
  expect(r2.keys().length === 3 && (await count('u_stays')) === 9, 'the other account is untouched throughout (its eight rows, and the count the daily job keeps for it)');
  // The count, drifted (a write by a Worker from before it), is right again after the daily job.
  await db.prepare("INSERT INTO usage (account, projects, text_bytes) VALUES ('u_stays', 40, 999) "
    + 'ON CONFLICT (account) DO UPDATE SET projects = 40, text_bytes = 999').run();
  await dailySweep(env, t0 + GRACE_MS + 1, {});
  const counted = await db.prepare("SELECT projects, text_bytes FROM usage WHERE account = 'u_stays'").first();
  expect(counted && counted.projects === 1 && counted.text_bytes === 1, `the daily job recounts what an account holds: one project, one byte (${JSON.stringify(counted)})`);
  expect(!(await db.prepare("SELECT 1 FROM usage WHERE account = 'u_gone'").first()), 'and counts nothing for an account that is gone');
  run = await dailySweep(env, t0 + 1e10 + 1, {});
  expect(run.deletions === 0 && !(await db.prepare('SELECT 1 FROM ended_sessions').first())
    && !(await db.prepare('SELECT 1 FROM sessions').first()), 'and once their time is past, the sessions and the reasons kept for them go too');
} finally {
  await proxy.dispose();
  proxy = null;
  try { fs.rmSync(persist, { recursive: true, force: true }); } catch (_) { /* a file may be held briefly */ }
}

console.log(`OK account deletion (${n} checks: every table accounted for, texts a thousand at a time, the daily job finishing a closed tab's deletion)`);
