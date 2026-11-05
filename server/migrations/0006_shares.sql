-- Links anyone can read (plan 05, docs/PERSIST.md §5.12). Additive only: the
-- Worker before it never reads this table, so it may be applied first.
--
-- A share points at a project of `owner`: at whatever its head is (`version`
-- 0, the project link, which follows) or at one version (fixed). `id` is the
-- address, 128 random bits: nothing else about a link names the person or the
-- project. Revoking deletes the row, and so do deleting the project (in the
-- transaction of its deletion version) and deleting the account.
CREATE TABLE shares (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  owner TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (project, version)
) WITHOUT ROWID;
