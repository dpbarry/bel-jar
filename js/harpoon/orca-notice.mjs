/**
 * Orca finished, or gave up (plan v6 phase 04, n3): with the goal's name,
 * opening the hole, and only when the search ran long enough for you to have
 * looked away and you could not see it end (Harpoon's panel or window closed,
 * or the tab out of sight). A search you stopped yourself says nothing.
 *
 * Pure, tested where it is written (tests/test-orca-notice.mjs); harpoon-lab.mjs
 * emits.
 */

/** Long enough to have looked away. */
export const LONG_MS = 10000;

/**
 * Whether the search's own lab is in front of you: a floating lab while its
 * window is open, the panel's while the side panel is.
 * @param {{ disposed?: boolean, host?: { kind?: string }, win?: object | null }} session
 * @param {boolean} sidePanelOpen
 */
export function harpoonInView(session, sidePanelOpen) {
  if (!session || session.disposed) return false;
  if (session.host && session.host.kind === 'float') return !!session.win;
  return !!sidePanelOpen;
}

/**
 * @param {{ complete: boolean, stuck?: { reason?: string } | null, name?: string,
 *   elapsedMs: number, panelOpen: boolean, hidden: boolean, link?: object | null,
 *   longMs?: number }} o
 * @returns {object | null} a notification, or null for nothing to say
 */
export function orcaNotice(o) {
  const reason = o.stuck && o.stuck.reason;
  if (!o.complete && (reason === 'stopped' || reason === 'cancelled')) return null;
  if (!(o.elapsedMs >= (o.longMs != null ? o.longMs : LONG_MS))) return null;
  if (o.panelOpen && !o.hidden) return null;
  const name = o.name ? o.name : 'a hole';
  const notice = o.complete
    ? { kind: 'success', title: 'Orca proved ' + name, body: 'The proof waits in Harpoon for you to place it.' }
    : { kind: 'warn', title: 'Orca gave up on ' + name, body: 'Harpoon shows how far it got.' };
  notice.category = 'ops';
  notice.source = 'orca.finished';
  if (o.link && o.link.fileId) notice.links = o.link;
  return notice;
}
