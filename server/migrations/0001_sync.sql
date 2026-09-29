-- The sync server's tables (docs/PERSIST.md §5.7). D1 holds the small, often
-- read facts: who owns each project, where its head is, every version's
-- manifest, and which texts an account has. The texts themselves live in R2,
-- once per account and content hash.

-- A project belongs to the account that first committed it. `head` is its
-- current version; every move of the head inserts the version row below in
-- the same transaction, so the head is always the newest version.
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  head INTEGER NOT NULL
);
CREATE INDEX projects_by_owner ON projects (owner);

-- Every version of every project, a line: version n was committed over n - 1.
-- `commit_id` answers a retried commit with the version it made. A deletion
-- is a version too (deleted = 1, no manifest).
CREATE TABLE versions (
  project TEXT NOT NULL,
  version INTEGER NOT NULL,
  base INTEGER NOT NULL,
  commit_id TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  manifest TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project, version),
  UNIQUE (project, commit_id)
);

-- Which texts an account holds in R2 (key t/<account>/<hash>): `missing` is
-- one query instead of a request per file. A row is written only after its
-- object landed, so the index never names a text R2 lacks.
CREATE TABLE texts (
  account TEXT NOT NULL,
  hash TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account, hash)
);

-- Settings: one line of versions per account, like a project's.
CREATE TABLE settings_heads (
  account TEXT PRIMARY KEY,
  head INTEGER NOT NULL
);
CREATE TABLE settings_versions (
  account TEXT NOT NULL,
  version INTEGER NOT NULL,
  commit_id TEXT NOT NULL,
  vals TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account, version),
  UNIQUE (account, commit_id)
);
