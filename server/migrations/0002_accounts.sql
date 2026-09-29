-- Accounts, the identities that sign into them, and sessions (plan Phase 02).
--
-- One account, many identities: GitHub today, ORCID perhaps later. An
-- account's id (u_...) is what owns projects; a handle is the name people see
-- and can change. No provider token is ever stored: sign-in reads the
-- profile once and forgets the token.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_by_user ON identities (user_id);

-- A session is a random token in an HttpOnly cookie; only its hash is kept
-- here, so a copy of this table signs nobody in. Deleting the row signs that
-- browser out, wherever it is.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_by_user ON sessions (user_id);
