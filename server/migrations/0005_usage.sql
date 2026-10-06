-- What an account holds, counted (plan v6 c10, docs/PERSIST.md §5.7): one row
-- per account, so a limit is one read, not a sum over its texts.
--
-- `projects` counts the ones that are not deleted, and moves in the same
-- transaction as the head that makes or deletes one. `text_bytes` is every
-- text the account has stored: texts are kept while the account lasts (version
-- history reads them), so it only grows. Additive: the Worker before this never
-- reads it.
CREATE TABLE usage (
  account TEXT PRIMARY KEY,
  projects INTEGER NOT NULL DEFAULT 0,
  text_bytes INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

-- Every account that has anything, counted as it stands.
INSERT INTO usage (account, projects, text_bytes)
  SELECT account, SUM(projects), SUM(text_bytes) FROM (
    SELECT p.owner AS account, COUNT(*) AS projects, 0 AS text_bytes
      FROM projects p JOIN versions v ON v.project = p.id AND v.version = p.head
      WHERE v.deleted = 0 GROUP BY p.owner
    UNION ALL
    SELECT account, 0 AS projects, SUM(size) AS text_bytes FROM texts GROUP BY account
  ) GROUP BY account;
