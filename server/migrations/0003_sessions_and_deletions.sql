-- Where you are signed in, and deleting an account (plan v6 c3, docs/PERSIST.md §5.7).
--
-- Additive only: the Worker before it reads and writes the same tables as before.

-- Settings > Account lists an account's sessions, each with Sign out there.
-- `device` is a coarse name read from the browser's User-Agent at sign-in
-- ("Chrome on Windows"); the header itself is never kept. `used_at` moves at
-- most once an hour, so a session in use costs one write an hour.
ALTER TABLE sessions ADD COLUMN device TEXT;
ALTER TABLE sessions ADD COLUMN used_at INTEGER;

-- A session that was ended for a reason its browser should hear when it next
-- asks: 'elsewhere' (signed out from another device) or 'deleted' (the account
-- was deleted). The browser does the right thing with its copies of the
-- account's projects by it. Only the session's hash: the row names no account,
-- and it goes when the session would have expired.
CREATE TABLE ended_sessions (
  id_hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- An account being deleted. Its rows went at once, in the transaction that
-- wrote this one; its stored texts go a thousand at a time. The daily job
-- (server/deletion.mjs) finishes what a request did not, sweeps up anything a
-- request already under way wrote after, and lets this row go once an hour has
-- passed.
CREATE TABLE deletions (
  account TEXT PRIMARY KEY,
  requested_at INTEGER NOT NULL
);
