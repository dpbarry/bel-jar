// The server's schema as the migrations leave it (server/migrations/*.sql, in
// order): CREATE TABLE adds a table, DROP TABLE takes it away, ALTER TABLE …
// RENAME TO moves it. For the tests that hold something to every table the
// server keeps (test-account-deletion, test-privacy-page): a table rebuilt
// under a passing name (0004) is the table it replaces, not another.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every migration's SQL, in order, without its comments. */
export function migrationsSql() {
  const dir = path.join(ROOT, 'server', 'migrations');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n'))
    .join('\n');
}

/** name → its CREATE TABLE body, for every table there is once the migrations have run. */
export function finalTables(sql = migrationsSql()) {
  const tables = new Map();
  for (const raw of sql.split(';')) {
    const stmt = raw.trim();
    let m = /^CREATE TABLE\s+(\w+)\s*\(([\s\S]*)\)\s*(WITHOUT ROWID)?$/i.exec(stmt);
    if (m) { tables.set(m[1], m[2]); continue; }
    m = /^DROP TABLE\s+(?:IF EXISTS\s+)?(\w+)$/i.exec(stmt);
    if (m) { tables.delete(m[1]); continue; }
    m = /^ALTER TABLE\s+(\w+)\s+RENAME TO\s+(\w+)$/i.exec(stmt);
    if (m && tables.has(m[1])) {
      tables.set(m[2], tables.get(m[1]));
      tables.delete(m[1]);
    }
  }
  return tables;
}
