-- Tables stored by their key (plan v6 c8, docs/PERSIST.md §5.7).
--
-- A table with a key and a rowid keeps every row twice: once in the table and
-- again in the key's index, and D1 counts both as rows written. Stored WITHOUT
-- ROWID, the table is the key's index: a push writes four rows where it wrote
-- six, a new project six where it wrote nine. Same columns, same keys, same
-- answers: the Worker from before this reads and writes them unchanged, so the
-- migration may run before the code that follows it is deployed.

CREATE TABLE versions_by_key (
  project TEXT NOT NULL,
  version INTEGER NOT NULL,
  base INTEGER NOT NULL,
  commit_id TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  manifest TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project, version),
  UNIQUE (project, commit_id)
) WITHOUT ROWID;
INSERT INTO versions_by_key (project, version, base, commit_id, deleted, manifest, created_at)
  SELECT project, version, base, commit_id, deleted, manifest, created_at FROM versions;
DROP TABLE versions;
ALTER TABLE versions_by_key RENAME TO versions;

CREATE TABLE texts_by_key (
  account TEXT NOT NULL,
  hash TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account, hash)
) WITHOUT ROWID;
INSERT INTO texts_by_key (account, hash, size, created_at) SELECT account, hash, size, created_at FROM texts;
DROP TABLE texts;
ALTER TABLE texts_by_key RENAME TO texts;

CREATE TABLE projects_by_key (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  head INTEGER NOT NULL
) WITHOUT ROWID;
INSERT INTO projects_by_key (id, owner, head) SELECT id, owner, head FROM projects;
DROP TABLE projects;
ALTER TABLE projects_by_key RENAME TO projects;
CREATE INDEX projects_by_owner ON projects (owner);

CREATE TABLE settings_heads_by_key (
  account TEXT PRIMARY KEY,
  head INTEGER NOT NULL
) WITHOUT ROWID;
INSERT INTO settings_heads_by_key (account, head) SELECT account, head FROM settings_heads;
DROP TABLE settings_heads;
ALTER TABLE settings_heads_by_key RENAME TO settings_heads;

CREATE TABLE settings_versions_by_key (
  account TEXT NOT NULL,
  version INTEGER NOT NULL,
  commit_id TEXT NOT NULL,
  vals TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account, version),
  UNIQUE (account, commit_id)
) WITHOUT ROWID;
INSERT INTO settings_versions_by_key (account, version, commit_id, vals, created_at)
  SELECT account, version, commit_id, vals, created_at FROM settings_versions;
DROP TABLE settings_versions;
ALTER TABLE settings_versions_by_key RENAME TO settings_versions;
