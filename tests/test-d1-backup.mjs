// Backups of the live database and the texts of files (scripts/d1-backup.mjs,
// plan v6 c5): how an export is counted, how many are kept, and which texts go
// with them. The export and the restore themselves reach Cloudflare and are run
// by hand (AGENTS.md "Deploy"); this holds the rules they run by.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { exportedRows, backups, toPrune, KEEP, BUCKET, readTexts, fetchText, textsInExport, textFile, textObject, textsHeld, textIntact, textsToPrune } from '../scripts/d1-backup.mjs';
import { textPrefix } from '../server/sync-store.mjs';

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

// ── The texts (Dean, 2026-10-06): a database without them is files that say nothing ──
const sha = (t) => createHash('sha256').update(t).digest('hex');
const hA = sha('LF nat : type.\n');
const hB = sha('rec plus = ?;\n');
// As wrangler writes them: the columns named (a fixture without names passed while the
// first real export, which names them, listed none of its 13 texts; 2026-10-06).
const withTexts = [
  `INSERT INTO "texts" ("account","hash","size","created_at") VALUES('u_a','${hA}',15,1790000000000);`,
  `INSERT INTO "texts" ("hash","account","size","created_at") VALUES('${hB}','u_b',14,1790000000001);`,
  `INSERT INTO "texts" VALUES('../etc','${hA}',15,1);`,
  `INSERT INTO "texts" VALUES('u_a','not-a-hash',1,1);`,
  `INSERT INTO "users" ("id","handle") VALUES('u_c','INSERT INTO "texts" VALUES(''u_x'',''${hB}'')');`,
].join('\n');
const listed = textsInExport(withTexts);
expect(listed.size === 2 && listed.has('u_a/' + hA) && listed.has('u_b/' + hB),
  `an export lists its texts by account and hash; a path, or a name that is not a hash, is no text (${[...listed].join(', ')})`);
let threw = '';
try { readTexts(withTexts); } catch (e) { threw = e.message; }
expect(/4 text rows and 2 could be read/.test(threw), `a text row that cannot be read stops the backup rather than miss a text (${threw})`);
expect(readTexts(withTexts.split('\n').slice(0, 2).join('\n')).size === 2, 'and every row read, the texts are listed');
expect(textObject('u_a/' + hA) === BUCKET + '/' + textPrefix('u_a') + hA, 'a text is fetched from where the Worker writes it (sync-store textPrefix)');
const deploy = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8');
expect(new RegExp('"binding": "TEXTS", "bucket_name": "' + BUCKET + '"').test(deploy), `and from the bucket the Worker writes to (${BUCKET})`);
const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'beljar-texts-'));
try {
  const put = (id, text) => { const f = textFile(tdir, id); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  put('u_a/' + hA, 'LF nat : type.\n');
  put('u_b/' + hB, 'damaged on the disk');
  put('u_gone/' + sha('x'), 'x');
  expect(textsHeld(tdir).size === 3 && textFile(tdir, 'u_a/' + hA) === path.join(tdir, 'texts', 'u_a', hA), 'texts are kept by account, under their hash');
  expect(textIntact(textFile(tdir, 'u_a/' + hA), hA) && !textIntact(textFile(tdir, 'u_b/' + hB), hB) && !textIntact(path.join(tdir, 'nope'), hA),
    'a text is intact when its bytes hash to its name; damaged or missing, it is not');
  // Fetched: kept only when the bytes are what the name says, and never half-written.
  const answer = (bytes, ok = true) => async (object, file) => { fs.writeFileSync(file, bytes); return ok; };
  const idC = 'u_c/' + sha('lemma\n');
  const okFetch = await fetchText(tdir, idC, answer('lemma\n'));
  expect(okFetch && textIntact(textFile(tdir, idC), idC.split('/')[1]), 'a fetched text whose bytes match its name is kept');
  const idD = 'u_c/' + sha('theorem\n');
  const badFetch = await fetchText(tdir, idD, answer('not the theorem\n'));
  const failedFetch = await fetchText(tdir, idD, answer('theorem\n', false));
  expect(!badFetch && !failedFetch && !fs.existsSync(textFile(tdir, idD)) && !fs.existsSync(textFile(tdir, idD) + '.part'),
    'one whose bytes do not match, or that R2 did not give, leaves nothing under its name');
  fs.rmSync(textFile(tdir, idC));
  const gone = textsToPrune(textsHeld(tdir), [textsInExport(withTexts), new Set()]);
  expect(gone.length === 1 && gone[0] === 'u_gone/' + sha('x'),
    `a text goes once no kept export lists it: a deleted account's texts leave with its rows (${gone.join(', ')})`);
} finally {
  fs.rmSync(tdir, { recursive: true, force: true });
}

// What privacy.html promises is what the script keeps.
const page = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
expect(/a copy of it, with the text of your files, is saved\s+each week and kept for four\s+weeks/.test(page) && KEEP === 4,
  'four weekly copies, texts and all, as the privacy page says');
const src = fs.readFileSync(path.join(root, 'scripts', 'd1-backup.mjs'), 'utf8');
expect(/'--remote', '--output'/.test(src) && !/'d1', 'execute'[^\n]*'--remote'/.test(src) && !/execute', DB, '--remote/.test(src),
  'the live database is only ever exported from: nothing is executed against it');
expect(/'r2', 'object', 'get'/.test(src) && !/'r2', 'object', '(put|delete)'/.test(src), 'and the live texts are only ever read');
expect(/os\.homedir\(\), 'beljar-backups'/.test(src), 'and the copies go outside the repository');

console.log(`OK d1 backup (${n} checks: rows counted from the export, the newest four kept, the texts with them, the live database and texts only read)`);
