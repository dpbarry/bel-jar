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
// kept (privacy.html says so), never inside the repository.
//
// ⛔ The texts of files are in it too (Dean, 2026-10-06). They live in R2, where
// nothing turns back the clock: a database restored without them is projects and
// versions whose files say nothing. Each text is named by its content, so the
// copy is incremental: the texts the export lists that this folder lacks are
// fetched (`texts/<account>/<hash>`), each checked against its name before it
// is kept, and a text goes once no kept export lists it, so a deleted account's
// texts leave the backups with its rows.
//
// ⛔ Export only reads the live database, and restore never touches it: the
// scratch database is local (wrangler's local D1, in a temporary folder),
// thrown away once checked. It must hold every row the export file holds, table
// by table, counted from the file itself: a write to the live database while it
// was exported cannot make the check lie.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { textPrefix } from '../server/sync-store.mjs';
import { isHash } from '../js/persist/sync/protocol.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const DB = 'beljar-sync';
export const BUCKET = 'beljar-texts';
/** Reads from R2 at once: each is a wrangler of its own, mostly start-up. */
const FETCHING = 6;
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

/**
 * The texts an export lists, `${account}/${hash}`: its rows of `texts`. wrangler
 * writes each row with its columns named (`INSERT INTO "texts" ("account",
 * "hash","size","created_at") VALUES(…)`), so values are read by name; a row
 * without names is read in the table's own order.
 */
export function textsInExport(sql) {
  const out = new Set();
  for (const m of sql.matchAll(/^INSERT INTO "?texts"?\s*(?:\(([^)]*)\)\s*)?VALUES\((.*)\);?\s*$/gm)) {
    const cols = m[1] ? m[1].split(',').map((c) => c.trim().replace(/^"|"$/g, '')) : ['account', 'hash', 'size', 'created_at'];
    const vals = [...m[2].matchAll(/'((?:[^']|'')*)'|([^,]+)/g)].map((v) => (v[1] !== undefined ? v[1] : v[2].trim()));
    const account = vals[cols.indexOf('account')];
    const hash = vals[cols.indexOf('hash')];
    // An account is an opaque id and a hash is hex: anything else is not a path to make.
    if (/^[A-Za-z0-9_-]+$/.test(account || '') && isHash(hash)) out.add(account + '/' + hash);
  }
  return out;
}

/**
 * The texts an export lists, every one of its `texts` rows read, or an error:
 * a row that cannot be read is a text the backup would quietly miss (the first
 * live export listed none of its 13 while the reading expected another shape).
 */
export function readTexts(sql) {
  const wanted = textsInExport(sql);
  const rows = exportedRows(sql).texts || 0;
  if (wanted.size !== rows) throw new Error(`the export has ${rows} text rows and ${wanted.size} could be read: the backup would miss texts`);
  return wanted;
}

/** Where a text is kept, and where it lives in R2. */
export const textFile = (dir, id) => path.join(dir, 'texts', ...id.split('/'));
export const textObject = (id) => { const [account, hash] = id.split('/'); return BUCKET + '/' + textPrefix(account) + hash; };

/** The texts this folder holds, `${account}/${hash}`. */
export function textsHeld(dir = DIR) {
  const root = path.join(dir, 'texts');
  const out = new Set();
  if (!fs.existsSync(root)) return out;
  for (const account of fs.readdirSync(root)) {
    const sub = path.join(root, account);
    if (!fs.statSync(sub).isDirectory()) continue;
    for (const hash of fs.readdirSync(sub)) if (isHash(hash)) out.add(account + '/' + hash);
  }
  return out;
}

/** A text's content is what its name says: the name is the SHA-256 of its bytes. */
export function textIntact(file, hash) {
  return fs.existsSync(file) && createHash('sha256').update(fs.readFileSync(file)).digest('hex') === hash;
}

/** The texts to let go: held, and listed by none of the exports kept. */
export function textsToPrune(held, kept) {
  return [...held].filter((id) => !kept.some((listed) => listed.has(id)));
}

/** An object from the live bucket into a file: resolves whether wrangler said it did. */
function r2Get(object, file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [WRANGLER, 'r2', 'object', 'get', object, '--remote', '--file', file], { cwd: ROOT, env: ENV, stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

/**
 * One text from R2 into the folder, checked against its name first: true when it
 * is kept. Nothing half-written or damaged is ever left under a text's name.
 * `get(object, file)` is wrangler's read (a test hands in its own).
 */
export async function fetchText(dir, id, get = r2Get) {
  const file = textFile(dir, id);
  const part = file + '.part';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const got = await get(textObject(id), part);
  if (got && textIntact(part, id.split('/')[1])) {
    fs.renameSync(part, file);
    return true;
  }
  fs.rmSync(part, { force: true });
  return false;
}

/** The texts the newest export lists that the folder lacks, fetched; then those no kept export lists, let go. */
async function backUpTexts(sql) {
  const wanted = readTexts(sql);
  const held = textsHeld();
  const missing = [...wanted].filter((id) => !held.has(id));
  const failed = [];
  let next = 0;
  const worker = async () => {
    while (next < missing.length) {
      const id = missing[next++];
      if (!(await fetchText(DIR, id))) failed.push(id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(FETCHING, missing.length) }, worker));
  const kept = backups().map((f) => textsInExport(fs.readFileSync(f, 'utf8')));
  const gone = textsToPrune(textsHeld(), kept);
  for (const id of gone) fs.rmSync(textFile(DIR, id), { force: true });
  for (const account of new Set(gone.map((id) => id.split('/')[0]))) {
    const sub = path.join(DIR, 'texts', account);
    if (fs.existsSync(sub) && !fs.readdirSync(sub).length) fs.rmdirSync(sub);
  }
  console.log(`  texts: ${wanted.size} in the export, ${missing.length - failed.length} fetched, ${wanted.size - missing.length} already here, ${gone.length} let go`);
  // ⛔ Loud: a text the database lists and R2 cannot give is a file that is already lost.
  if (failed.length) throw new Error(`${failed.length} text${failed.length === 1 ? '' : 's'} could not be fetched or did not match ${failed.length === 1 ? 'its' : 'their'} name: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? ', …' : ''}`);
}

/** Every text an export lists is in the folder, and is what its name says. */
function checkTexts(sql) {
  const wanted = readTexts(sql);
  const bad = [...wanted].filter((id) => !textIntact(textFile(DIR, id), id.split('/')[1]));
  console.log(`  ${bad.length ? 'DIFF' : 'ok  '} texts: ${wanted.size - bad.length} of ${wanted.size} here, each what its name says`);
  if (bad.length) throw new Error(`${bad.length} text${bad.length === 1 ? '' : 's'} the export lists ${bad.length === 1 ? 'is' : 'are'} missing or damaged: ${bad.slice(0, 5).join(', ')}`);
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

async function exportNow() {
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
  await backUpTexts(sql);
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
    checkTexts(fs.readFileSync(target, 'utf8'));
    console.log(`restored ${path.basename(target)} into a scratch database: ${tables.length} tables, every row, and every text it lists`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [what, file] = process.argv.slice(2);
  try {
    if (what === 'export') await exportNow();
    else if (what === 'restore') restore(file);
    else if (what === 'rehearse') rehearse(file);
    else throw new Error('usage: node scripts/d1-backup.mjs export | restore [file] | rehearse [file]');
  } catch (err) {
    console.error(String(err && err.message || err));
    process.exit(1);
  }
}
