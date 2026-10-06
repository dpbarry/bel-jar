// Backups of the live database, D1 `beljar-sync` (plan v6 c5, docs/PERSIST.md §5.7).
//
//   npm run backup:export              a copy of the live database, to ~/beljar-backups
//   npm run backup:restore [file]      that copy (the newest, by default) restored into
//                                      a scratch database on this machine, and checked
//   npm run backup:rehearse [file]     restored, then every migration it has not had
//                                      applied to it, and no table may lose a row: a
//                                      migration tried on the live data before it runs there
//
// D1 keeps its own history: Time Travel restores the database to any minute of
// the last 7 days (30 on the paid plan), `npx wrangler d1 time-travel info
// beljar-sync`. This is the copy outside Cloudflare: one a week, the newest four
// kept (privacy.html says so), never inside the repository. The texts of files
// are not in it: they live in R2, each named by its content and never
// overwritten, and only Delete account removes them.
//
// ⛔ Export only reads the live database, and restore never touches it: the
// scratch database is local (wrangler's local D1, in a temporary folder),
// thrown away once checked. It must hold every row the export file holds, table
// by table, counted from the file itself: a write to the live database while it
// was exported cannot make the check lie.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const DB = 'beljar-sync';
const DIR = process.env.BELJAR_BACKUPS || path.join(os.homedir(), 'beljar-backups');
export const KEEP = 4;
const ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };

function wrangler(args, o = {}) {
  const r = spawnSync(process.execPath, [WRANGLER, ...args], { cwd: o.cwd || ROOT, env: ENV, encoding: 'utf8', timeout: 300000 });
  if (r.status !== 0) throw new Error(`wrangler ${args.slice(0, 3).join(' ')} failed:\n${(r.stdout || '') + (r.stderr || '')}`);
  return r.stdout || '';
}

/** Rows per table in an export: its INSERT lines, one a row (SQLite's and Cloudflare's own tables aside). */
export function exportedRows(sql) {
  const out = {};
  for (const m of sql.matchAll(/^INSERT INTO "?([A-Za-z0-9_]+)"?[ (]/gm)) {
    if (/^(sqlite_|_cf_)/.test(m[1])) continue;
    out[m[1]] = (out[m[1]] || 0) + 1;
  }
  return out;
}

/** The newest backups first. */
export function backups(dir = DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^beljar-sync-\d{4}-\d{2}-\d{2}T\d{6}Z\.sql$/.test(f)).sort().reverse()
    .map((f) => path.join(dir, f));
}

/** Which backups go once a new one is written: all but the newest KEEP. */
export function toPrune(files, keep = KEEP) {
  return files.slice(keep);
}

/** Rows per table in a database wrangler can reach (`where`: its name and --local/--remote flags). */
function counts(where, cwd) {
  const list = "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name";
  const names = JSON.parse(wrangler(['d1', 'execute', ...where, '--json', '--command', list], { cwd }))[0].results.map((r) => r.name);
  if (!names.length) return {};
  // One row, a column a table (D1 refuses a long UNION ALL).
  const sql = 'SELECT ' + names.map((t) => `(SELECT COUNT(*) FROM "${t}") AS "${t}"`).join(', ');
  return JSON.parse(wrangler(['d1', 'execute', ...where, '--json', '--command', sql], { cwd }))[0].results[0];
}

function exportNow() {
  fs.mkdirSync(DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '').replace(/T(\d{6})Z$/, 'T$1Z');
  const file = path.join(DIR, `beljar-sync-${stamp}.sql`);
  wrangler(['d1', 'export', DB, '--remote', '--output', file]);
  const sql = fs.readFileSync(file, 'utf8');
  if (!/CREATE TABLE/.test(sql)) throw new Error('the export holds no tables: ' + file);
  const rows = exportedRows(sql);
  const gone = toPrune(backups());
  for (const f of gone) fs.rmSync(f, { force: true });
  console.log(`exported ${DB}: ${Object.values(rows).reduce((a, b) => a + b, 0)} rows in ${Object.keys(rows).length} tables, ${sql.length} bytes, to ${file}`);
  if (gone.length) console.log(`  let go of ${gone.length} older (the newest ${KEEP} are kept)`);
  return file;
}

/** A backup restored into a scratch local D1 (never the live one): { where, scratch, target, want }. */
function restoreInto(file) {
  const target = file || backups()[0];
  if (!target || !fs.existsSync(target)) throw new Error('no backup to restore: run npm run backup:export first');
  const want = exportedRows(fs.readFileSync(target, 'utf8'));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'beljar-restore-'));
  const config = path.join(scratch, 'wrangler.json');
  fs.writeFileSync(config, JSON.stringify({
    name: 'beljar-restore',
    compatibility_date: '2026-09-21',
    d1_databases: [{ binding: 'DB', database_name: 'beljar-restore', database_id: '00000000-0000-0000-0000-00000000c5c5' }],
  }));
  const where = ['DB', '--local', '--config', config, '--persist-to', path.join(scratch, 'state')];
  wrangler(['d1', 'execute', ...where, '--yes', '--file', target], { cwd: scratch });
  return { where, scratch, target, want };
}

/** The newest backup, restored, then every migration it has not had: no table may lose a row. */
function rehearse(file) {
  const { where, scratch, target } = restoreInto(file);
  try {
    const had = new Set(JSON.parse(wrangler(['d1', 'execute', ...where, '--json', '--command', 'SELECT name FROM d1_migrations'], { cwd: scratch }))[0]
      .results.map((r) => r.name));
    const dir = path.join(ROOT, 'server', 'migrations');
    const pending = fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && !had.has(f)).sort();
    const before = counts(where, scratch);
    for (const f of pending) {
      wrangler(['d1', 'execute', ...where, '--yes', '--file', path.join(dir, f)], { cwd: scratch });
      console.log(`  applied ${f}`);
    }
    const after = counts(where, scratch);
    const lost = Object.keys(before).filter((t) => t !== 'd1_migrations' && (after[t] || 0) < before[t]);
    for (const t of Object.keys(before).sort()) console.log(`  ${lost.includes(t) ? 'LOST' : 'ok  '} ${t}: ${before[t]} rows before, ${after[t] ?? 'gone'} after`);
    if (!pending.length) console.log('  (every migration was already in it)');
    if (lost.length) throw new Error('a migration lost rows in ' + lost.join(', '));
    console.log(`rehearsed ${pending.length} migration${pending.length === 1 ? '' : 's'} on ${path.basename(target)}: every row kept`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function restore(file) {
  const { where, scratch, target, want } = restoreInto(file);
  try {
    const got = counts(where, scratch);
    const tables = [...new Set([...Object.keys(want), ...Object.keys(got)])].filter((t) => (want[t] || 0) + (got[t] || 0) > 0).sort();
    const off = tables.filter((t) => (want[t] || 0) !== (got[t] || 0));
    const rows = (k) => k + (k === 1 ? ' row' : ' rows');
    for (const t of tables) console.log(`  ${off.includes(t) ? 'DIFF' : 'ok  '} ${t}: ${rows(got[t] || 0)} restored, ${want[t] || 0} in the export`);
    if (!tables.length) throw new Error('the export has no rows to restore');
    if (off.length) throw new Error(`the restore differs from the export in ${off.join(', ')}`);
    console.log(`restored ${path.basename(target)} into a scratch database: ${tables.length} tables, every row`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [what, file] = process.argv.slice(2);
  try {
    if (what === 'export') exportNow();
    else if (what === 'restore') restore(file);
    else if (what === 'rehearse') rehearse(file);
    else throw new Error('usage: node scripts/d1-backup.mjs export | restore [file] | rehearse [file]');
  } catch (err) {
    console.error(String(err && err.message || err));
    process.exit(1);
  }
}
