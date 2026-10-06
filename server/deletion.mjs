/**
 * Deleting an account (plan v6 c3, docs/PERSIST.md §5.7): Settings > Account >
 * Delete account, and the daily job that finishes what a request did not.
 *
 * ⛔ Every row that names the account goes at once, in one transaction, and
 * every session with it: from that moment nobody is signed in as the account,
 * and its identity, projects, versions and settings are gone. Each session's
 * browser is told why when it next asks (`ended_sessions`, 'deleted'): it keeps
 * its copies of the projects as its own instead of removing them as a sign-out
 * would, since the cloud no longer has them.
 *
 * The stored texts (R2) go after, a thousand at a time (a list returns, and a
 * delete takes, at most a thousand keys), while the request lasts. The
 * transaction also records the deletion (`deletions`). The daily job finishes
 * the texts a closed tab left, sweeps up anything a request that was already
 * under way wrote after the account went, and lets the record go once an hour
 * has passed: no request lives that long.
 *
 * ⛔ What names an account is listed once, here (ACCOUNT_ROWS):
 * tests/test-account-deletion.mjs fails for a table the migrations make that is
 * neither here nor in NAMES_NO_ACCOUNT.
 */
import { textPrefix } from './sync-store.mjs';

export const TEXT_BATCH = 1000;
/** Batches a delete request removes before it answers (20,000 texts). */
export const REQUEST_BATCHES = 20;
/** Per account, per run of the daily job. */
export const SWEEP_BATCHES = 50;
/** Accounts per run of the daily job: the oldest deletions first. */
export const SWEEP_ACCOUNTS = 20;
/** How long a deletion's record outlives its request, for the sweep to catch late writes. */
export const GRACE_MS = 60 * 60 * 1000;

/**
 * Every table that names an account, and the rows of it that do. Versions
 * first: they are found through their projects.
 */
export const ACCOUNT_ROWS = [
  ['versions', 'project IN (SELECT id FROM projects WHERE owner = ?)'],
  ['projects', 'owner = ?'],
  ['texts', 'account = ?'],
  ['settings_versions', 'account = ?'],
  ['settings_heads', 'account = ?'],
  ['usage', 'account = ?'],
  ['sessions', 'user_id = ?'],
  ['identities', 'user_id = ?'],
  ['users', 'id = ?'],
];

/** Tables that name no account: a session's hash and why it ended. */
export const NAMES_NO_ACCOUNT = ['ended_sessions'];

/** The record of a deletion: it names the account until the daily job lets it go. */
export const DELETION_RECORD = 'deletions';

function rowStatements(db, account) {
  return ACCOUNT_ROWS.map(([table, where]) => db.prepare(`DELETE FROM ${table} WHERE ${where}`).bind(account));
}

/**
 * The rows, at once, in one transaction: each session's browser will hear
 * that the account was deleted, everything that names the account goes, and
 * the deletion is recorded.
 */
export async function deleteAccountRows(db, account, now) {
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO ended_sessions (id_hash, reason, expires_at) SELECT id_hash, 'deleted', expires_at FROM sessions WHERE user_id = ?")
      .bind(account),
    ...rowStatements(db, account),
    db.prepare(`INSERT OR REPLACE INTO ${DELETION_RECORD} (account, requested_at) VALUES (?, ?)`).bind(account, now),
  ]);
}

/**
 * The account's stored texts, a thousand at a time, for at most `batches`
 * batches. True when none are left. Each list starts from the top: what the
 * last batch deleted is no longer there.
 */
export async function deleteTexts(r2, account, batches, size = TEXT_BATCH) {
  const prefix = textPrefix(account);
  for (let i = 0; i < batches; i++) {
    const page = await r2.list({ prefix, limit: size });
    const keys = page.objects.map((o) => o.key);
    if (keys.length) await r2.delete(keys);
    if (!page.truncated) return true;
  }
  return false;
}

/**
 * Every account's count (migration 0005), from what it holds: projects not
 * deleted at their head, and the bytes of every text. The count moves with
 * each write; recounted daily, whatever drifted (writes by a Worker from
 * before the count, two requests at once) is right again by the next day.
 * Only rows that differ are written.
 */
export const RECOUNT_SQL = 'INSERT INTO usage (account, projects, text_bytes) '
  + 'SELECT account, SUM(projects), SUM(text_bytes) FROM ('
  + 'SELECT p.owner AS account, SUM(CASE WHEN v.deleted = 0 THEN 1 ELSE 0 END) AS projects, 0 AS text_bytes '
  + 'FROM projects p JOIN versions v ON v.project = p.id AND v.version = p.head GROUP BY p.owner '
  + 'UNION ALL SELECT account, 0 AS projects, SUM(size) AS text_bytes FROM texts GROUP BY account'
  + ') WHERE true GROUP BY account '
  + 'ON CONFLICT (account) DO UPDATE SET projects = excluded.projects, text_bytes = excluded.text_bytes '
  + 'WHERE usage.projects != excluded.projects OR usage.text_bytes != excluded.text_bytes';

/**
 * The daily job (wrangler.jsonc `triggers`). For each deletion, oldest first:
 * the rows again (a request already under way when the account went may have
 * written some since), the texts, and the record once nothing is left and
 * GRACE_MS has passed. Then sessions past their time, the reasons kept for
 * ended ones, and every account recounted (RECOUNT_SQL).
 */
export async function dailySweep(env, now, o = {}) {
  const db = env.DB;
  const due = await db.prepare(`SELECT account, requested_at FROM ${DELETION_RECORD} ORDER BY requested_at LIMIT ?`)
    .bind(SWEEP_ACCOUNTS).all();
  let finished = 0;
  for (const d of due.results) {
    await db.batch(rowStatements(db, d.account));
    const done = await deleteTexts(env.TEXTS, d.account, o.batches || SWEEP_BATCHES, o.size || TEXT_BATCH);
    if (done && now - d.requested_at >= GRACE_MS) {
      await db.prepare(`DELETE FROM ${DELETION_RECORD} WHERE account = ? AND requested_at = ?`).bind(d.account, d.requested_at).run();
      finished += 1;
    }
  }
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    db.prepare('DELETE FROM ended_sessions WHERE expires_at <= ?').bind(now),
    db.prepare(RECOUNT_SQL),
  ]);
  return { deletions: due.results.length, finished };
}
