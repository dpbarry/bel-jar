/**
 * Sync needs you, kept findable (plan v6 phase 04, n4). The cloud already says
 * when a round fails, and it is easy to miss: rounds failing for ten minutes
 * leave one notice with the reason, and the next round that succeeds takes it
 * away. Offline is not failing (the strip says so, and nothing is wrong), and
 * routine sync never lands in the notifications. A quota refused is noted at
 * once (sync-ui.mjs noteRefusal); storage full is the store's own notice.
 *
 * Pure: a watch fed each summary (sync-status.mjs), saying what to do.
 */

export const FAILING_MS = 10 * 60 * 1000;

/**
 * @param {{ now?: () => number, after?: number }} [o]
 * @returns {{ observe(summary): 'emit' | 'clear' | null, since(): number }}
 */
export function createFailureWatch(o = {}) {
  const now = o.now || (() => Date.now());
  const after = o.after != null ? o.after : FAILING_MS;
  let since = null; // when rounds began failing, null: they are not
  let told = false;

  return {
    observe(s) {
      const state = s && s.state;
      if (state === 'error') {
        if (since === null) since = now();
        if (!told && now() - since >= after) {
          told = true;
          return 'emit';
        }
        return null;
      }
      // A round that went through: whatever was said is over.
      if (state === 'synced') {
        since = null;
        if (told) {
          told = false;
          return 'clear';
        }
        return null;
      }
      // Offline, held, syncing, waiting: neither failing nor through.
      return null;
    },
    since: () => since,
  };
}
