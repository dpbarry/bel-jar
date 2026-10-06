/**
 * The stored format's migrations (docs/PERSIST.md §3.1).
 *
 * `MIGRATIONS[n]` turns format n into n + 1: synchronously, in place, on the
 * raw Storage it is handed (store.mjs runs each step in order, then stamps the
 * new version). A step that throws leaves the page read-only and the data
 * where it was.
 *
 * ⛔ Bumping SCHEMA (store.mjs) means adding the step here in the same change.
 * The app opens its store with `onMissingMigration: 'refuse'`, so a format
 * change with no step does not delete anybody's work: it leaves every browser
 * that holds the old format read-only, which is a release nobody can use.
 * tests/test-migrations.mjs fails before that can ship.
 */

/**
 * The first format the live site stored (2026-09-29). Anything older lived only
 * on development machines and is refused like any other gap.
 */
export const FIRST_LIVE_SCHEMA = 4;

/** @type {Record<number, (storage: Storage) => void>} */
export const MIGRATIONS = {};
