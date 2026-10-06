// Backups of the live database (scripts/d1-backup.mjs, plan v6 c5): how an
// export is counted, and how many are kept. The export and the restore
// themselves reach Cloudflare and are run by hand (AGENTS.md "Deploy"); this
// holds the rules they run by.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportedRows, backups, toPrune, KEEP } from '../scripts/d1-backup.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// An export as wrangler writes it: one INSERT a row, at the start of its line.
const sql = [
  'PRAGMA defer_foreign_keys=TRUE;',
  'CREATE TABLE users (',
  '  id TEXT PRIMARY KEY',
  ');',
  `INSERT INTO "users" ("id","handle") VALUES('u_a','a');`,
  `INSERT INTO "users" ("id","handle") VALUES('u_b','INSERT INTO "users" is only text here');`,
  `INSERT INTO "versions" ("project","manifest") VALUES('p','{"name":"x"}');`,
  `INSERT INTO "_cf_KV" VALUES('k','v');`,
  `INSERT INTO "sqlite_sequence" VALUES('d1_migrations',2);`,
].join('\n');
const rows = exportedRows(sql);
expect(rows.users === 2 && rows.versions === 1, `a row is an INSERT at the start of a line, whatever its text says (${JSON.stringify(rows)})`);
expect(!('_cf_KV' in rows) && !('sqlite_sequence' in rows), 'SQLite\'s and Cloudflare\'s own tables are not ours to count');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beljar-backups-'));
try {
  const names = ['2026-09-06T070000Z', '2026-09-13T070000Z', '2026-09-20T070000Z', '2026-09-27T070000Z', '2026-10-04T070000Z']
    .map((s) => `beljar-sync-${s}.sql`);
  for (const f of [...names, 'notes.txt', 'beljar-sync-latest.sql']) fs.writeFileSync(path.join(dir, f), '');
  const found = backups(dir).map((f) => path.basename(f));
  expect(found.length === 5 && found[0] === names[4] && found[4] === names[0], 'backups are found newest first, and nothing else in the folder is one');
  expect(KEEP === 4 && toPrune(backups(dir)).map((f) => path.basename(f)).join() === names[0], 'the newest four are kept: a fifth lets the oldest go');
  expect(toPrune(backups(dir).slice(0, 3)).length === 0, 'fewer than four, none goes');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

// What privacy.html promises is what the script keeps.
const page = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
expect(/a copy of it is saved each week and kept for four\s+weeks/.test(page) && KEEP === 4, 'four weekly copies, as the privacy page says');
const src = fs.readFileSync(path.join(root, 'scripts', 'd1-backup.mjs'), 'utf8');
expect(/'--remote', '--output'/.test(src) && !/execute', DB, '--remote/.test(src) && !/--remote[^\n]*--file/.test(src),
  'the live database is only ever exported from: nothing is executed against it');
expect(/os\.homedir\(\), 'beljar-backups'/.test(src), 'and the copies go outside the repository');

console.log(`OK d1 backup (${n} checks: rows counted from the export, the newest four kept, the live database only read)`);
