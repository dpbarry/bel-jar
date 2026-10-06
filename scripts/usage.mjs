// How big the live store has grown (plan v6 c11, docs/PERSIST.md §5.7):
//
//   npm run usage
//
// Four numbers, each beside the limit it grows towards, read only: accounts,
// versions, the database's size, and the text stored. Pruning old versions is
// not built until one of them reaches half its limit; this says when that is.
// Also the last day's rows read and written, which are what the plan bills.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };

/**
 * What each number may reach, and at half of which pruning is built. The
 * database's size is D1's own limit (500 MB on the free plan, 10 GB on Workers
 * Paid); the text is R2's free 10 GB; the others have no hard limit, and are
 * here because they are what the size is made of.
 */
export const LIMITS = {
  databaseBytes: { free: 500 * 1024 * 1024, paid: 10 * 1024 * 1024 * 1024 },
  textBytes: 10 * 1024 * 1024 * 1024,
};

function wrangler(args) {
  const r = spawnSync(process.execPath, [WRANGLER, ...args], { cwd: ROOT, env: ENV, encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0) throw new Error(`wrangler ${args.slice(0, 3).join(' ')} failed:\n${(r.stdout || '') + (r.stderr || '')}`);
  return r.stdout || '';
}

export function human(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' kB';
  return bytes + ' B';
}

/** The lines `npm run usage` prints, from the numbers. Pure, for the test. */
export function report(n, plan = 'free') {
  const dbLimit = LIMITS.databaseBytes[plan];
  const pct = (a, b) => Math.round((a / b) * 1000) / 10;
  const flag = (a, b) => (a / b >= 0.5 ? '  ⚠ past half: build pruning (docs/PERSIST.md §5.7)' : '');
  return [
    `accounts       ${n.accounts}`,
    `versions       ${n.versions}`,
    `database       ${human(n.databaseBytes)} of ${human(dbLimit)} (${pct(n.databaseBytes, dbLimit)}%, the ${plan} plan's limit)${flag(n.databaseBytes, dbLimit)}`,
    `stored text    ${human(n.textBytes)} of ${human(LIMITS.textBytes)} (${pct(n.textBytes, LIMITS.textBytes)}%, R2's free storage)${flag(n.textBytes, LIMITS.textBytes)}`,
    `last 24 hours  ${n.rowsRead} rows read, ${n.rowsWritten} rows written`,
  ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const info = JSON.parse(wrangler(['d1', 'info', 'beljar-sync', '--json']));
    const counts = JSON.parse(wrangler(['d1', 'execute', 'DB', '--remote', '--json', '--command',
      'SELECT (SELECT COUNT(*) FROM users) AS accounts, (SELECT COUNT(*) FROM versions) AS versions, '
      + '(SELECT COALESCE(SUM(text_bytes), 0) FROM usage) AS text_bytes']))[0].results[0];
    const plan = process.env.BELJAR_PLAN === 'paid' ? 'paid' : 'free';
    const lines = report({
      accounts: counts.accounts,
      versions: counts.versions,
      databaseBytes: info.database_size,
      textBytes: counts.text_bytes,
      rowsRead: info.rows_read_24h,
      rowsWritten: info.rows_written_24h,
    }, plan);
    for (const l of lines) console.log(l);
  } catch (err) {
    console.error(String(err && err.message || err));
    process.exit(1);
  }
}
