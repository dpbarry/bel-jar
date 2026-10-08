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
export const MIGRATIONS = {
  // The REPL was one transcript for the whole browser. It belongs to the
  // project that was open; every other project starts with none.
  4: function moveReplOntoItsProject(storage) {
    const transcriptRaw = storage.getItem('beljar/repl/transcript');
    const commandsRaw = storage.getItem('beljar/repl/commands');
    if (transcriptRaw == null && commandsRaw == null) return;
    let transcript = null;
    let commands = null;
    let device = null;
    try {
      transcript = JSON.parse(transcriptRaw || 'null');
      commands = JSON.parse(commandsRaw || 'null');
      device = JSON.parse(storage.getItem('beljar/device') || 'null');
    } catch (_) {
      return;
    }
    const values = device && device.data && device.data.values;
    const pid = values && typeof values.activeProject === 'string' ? values.activeProject : '';
    if (!pid) return;
    const html = transcript && transcript.data && typeof transcript.data.html === 'string' ? transcript.data.html : '';
    const list = commands && Array.isArray(commands.data) ? commands.data.filter((x) => typeof x === 'string') : [];
    const dest = 'beljar/p/' + pid + '/repl';
    if ((html || list.length) && storage.getItem(dest) == null) {
      const at = Math.max(
        transcript && typeof transcript.at === 'number' ? transcript.at : 0,
        commands && typeof commands.at === 'number' ? commands.at : 0,
      ) || Date.now();
      storage.setItem(dest, JSON.stringify({
        at,
        data: {
          html,
          scrollTop: transcript && transcript.data && typeof transcript.data.scrollTop === 'number' ? transcript.data.scrollTop : 0,
          savedAt: transcript && transcript.data && typeof transcript.data.savedAt === 'number' ? transcript.data.savedAt : at,
          commands: list,
        },
      }));
    }
    storage.removeItem('beljar/repl/transcript');
    storage.removeItem('beljar/repl/commands');
  },
};
