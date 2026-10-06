// The server's migrations on data (server/migrations): the tables as the ones
// before left them, filled as a class leaves them, then migrated. The Worker
// tests run the migrations on an empty database; this one is about what was
// already there.
//   0004 (tables stored by their key, plan v6 c8): every row survives as it
//        was, every key still refuses what it refused.
//   0005 (what an account holds, counted, plan v6 c10): every account that has
//        anything starts with its count right.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
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

const dir = path.join(ROOT, 'server', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const statements = (f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  .split(';').map((s) => s.trim()).filter(Boolean);
expect(files.includes('0004_tables_by_key.sql'), 'the migration is there');

const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'beljar-mig4-'));
proxy = await getPlatformProxy({ configPath: testConfig(persist), persist: { path: persist } });
try {
  const db = proxy.env.DB;
  const run = async (f) => { for (const s of statements(f)) await db.prepare(s).run(); };
  for (const f of files.filter((x) => x < '0004')) await run(f);

  // What a class leaves after a while: two accounts, projects with histories, texts, settings.
  for (const a of ['u_a', 'u_b']) {
    await db.prepare('INSERT INTO users (id, handle, created_at) VALUES (?, ?, 1)').bind(a, a.slice(2)).run();
    await db.prepare('INSERT INTO settings_heads (account, head) VALUES (?, 2)').bind(a).run();
    for (let v = 1; v <= 2; v++) {
      await db.prepare('INSERT INTO settings_versions (account, version, commit_id, vals, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(a, v, a + '-s' + v, JSON.stringify({ theme: v === 1 ? 'dark' : 'light' }), 100 + v).run();
    }
    for (let p = 1; p <= 3; p++) {
      const pid = `p_${a}_${p}`;
      await db.prepare('INSERT INTO projects (id, owner, head) VALUES (?, ?, 4)').bind(pid, a).run();
      for (let v = 1; v <= 4; v++) {
        await db.prepare('INSERT INTO versions (project, version, base, commit_id, deleted, manifest, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(pid, v, v - 1, `${pid}-c${v}`, v === 3 ? 1 : 0, v === 3 ? null : JSON.stringify({ v: 1, name: pid, files: [] }), 1000 + v).run();
      }
    }
    for (let t = 0; t < 5; t++) {
      await db.prepare('INSERT INTO texts (account, hash, size, created_at) VALUES (?, ?, ?, ?)').bind(a, String(t).repeat(64), 10 + t, 50).run();
    }
  }
  const TABLES = ['projects', 'versions', 'texts', 'settings_heads', 'settings_versions', 'users'];
  const dump = async () => {
    const out = {};
    for (const t of TABLES) out[t] = JSON.stringify((await db.prepare(`SELECT * FROM ${t}`).all()).results.map((r) => JSON.stringify(r)).sort());
    return out;
  };
  const before = await dump();

  await run('0004_tables_by_key.sql');
  const after = await dump();
  for (const t of TABLES) expect(after[t] === before[t], `${t}: every row survives, as it was (${JSON.parse(after[t]).length} rows)`);
  const master = (await db.prepare("SELECT name, type, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all()).results;
  for (const t of ['projects', 'versions', 'texts', 'settings_heads', 'settings_versions']) {
    const m = master.find((x) => x.name === t && x.type === 'table');
    expect(m && /WITHOUT ROWID/i.test(m.sql), `${t} is stored by its key`);
  }
  expect(!master.some((x) => /_by_key$/.test(x.name)), 'and no table is left under the passing name');
  expect(master.some((x) => x.name === 'projects_by_owner' && x.type === 'index'), 'the index for listing an account\'s projects is back');

  // The keys refuse what they refused.
  const refuses = async (sql, ...args) => db.prepare(sql).bind(...args).run().then(() => false, () => true);
  expect(await refuses('INSERT INTO versions (project, version, base, commit_id, deleted, manifest, created_at) VALUES (?, 1, 0, ?, 0, NULL, 1)', 'p_u_a_1', 'new-commit'),
    'a second version 1 of a project is refused');
  expect(await refuses('INSERT INTO versions (project, version, base, commit_id, deleted, manifest, created_at) VALUES (?, 9, 8, ?, 0, NULL, 1)', 'p_u_a_1', 'p_u_a_1-c2'),
    'and a commit id seen before (the replay guard)');
  expect(await refuses('INSERT INTO texts (account, hash, size, created_at) VALUES (?, ?, 1, 1)', 'u_a', '0'.repeat(64)), 'a text twice is refused');
  expect(!(await refuses('INSERT OR IGNORE INTO texts (account, hash, size, created_at) VALUES (?, ?, 1, 1)', 'u_a', '0'.repeat(64))), 'and quietly ignored where the store asks it to be');
  expect(await refuses('INSERT INTO projects (id, owner, head) VALUES (?, ?, 0)', 'p_u_a_1', 'u_b'), 'a project id twice is refused');
  const head = await db.prepare('UPDATE projects SET head = ? WHERE id = ? AND head = ? AND owner = ?').bind(5, 'p_u_a_1', 4, 'u_a').run();
  expect(head.meta.changes === 1, 'a head moves as it did (the compare-and-swap reads the same)');
  const listed = (await db.prepare('SELECT id FROM projects WHERE owner = ? ORDER BY id').bind('u_b').all()).results.map((r) => r.id);
  expect(listed.join() === 'p_u_b_1,p_u_b_2,p_u_b_3', 'and an account\'s projects list as they did');

  // 0005: the counts, from what is there. u_a: its first project deleted at
  // its head; u_b: all three live; and an account with texts and no project.
  await db.prepare('UPDATE projects SET head = 3 WHERE id = ?').bind('p_u_a_1').run();
  await db.prepare('INSERT INTO texts (account, hash, size, created_at) VALUES (?, ?, ?, 1)').bind('u_c', 'c'.repeat(64), 7).run();
  await run('0005_usage.sql');
  const usage = Object.fromEntries((await db.prepare('SELECT account, projects, text_bytes FROM usage').all()).results
    .map((r) => [r.account, [r.projects, r.text_bytes]]));
  expect(JSON.stringify(usage) === JSON.stringify({ u_a: [2, 60], u_b: [3, 60], u_c: [0, 7] }),
    `0005 counts each account as it stands: projects not deleted at their head, every text's bytes (${JSON.stringify(usage)})`);
  const usageSql = (await db.prepare("SELECT sql FROM sqlite_master WHERE name = 'usage'").first()).sql;
  expect(/WITHOUT ROWID/i.test(usageSql), 'and its one row per account is stored by key');
} finally {
  await proxy.dispose();
  proxy = null;
  try { fs.rmSync(persist, { recursive: true, force: true }); } catch (_) { /* a file may be held briefly */ }
}

console.log(`OK server migrations (${n} checks: 0004 keeps every row and key of the tables before it, stored by key; 0005 counts every account as it stands)`);
