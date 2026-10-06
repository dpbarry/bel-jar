/**
 * The cloud beside the project name (js/account/sync-ui.mjs): how each sync
 * state is drawn. Pure: the page, the tests and the kit render the same marks.
 *
 * The outline is three circles on a flat base (a small left bump, a large
 * middle one, a right one between them), so the body is even and a mark can sit
 * in its optical middle, with room around it: the marks are drawn small inside a
 * cloud drawn large (css/account.css sizes it). Stroke 1.5 at that size is the
 * name's own stem weight. The marks carry `sync-cloud__mark`, which is what
 * takes a colour: the outline stays the name's quiet grey unless something
 * needs the person.
 */

// Circles (6.75, 14.25) r4, (12, 10.75) r5.5, (17.25, 14) r4.25; base y = 18.25.
const CLOUD = 'M6.75 18.25A4 4 0 0 1 6.52 10.26A5.5 5.5 0 0 1 17.41 9.75A4.25 4.25 0 0 1 17.25 18.25Z';
const SLASH = 'M5.75 6.5 17.75 18.5';

const MARKS = {
  // pathLength 1: the check can draw itself in when a round lands (css).
  synced: '<path class="sync-cloud__mark sync-cloud__check" pathLength="1" d="M9.9 14.05l1.5 1.5 3-3"/>',
  syncing: '<path class="sync-cloud__mark sync-cloud__arrow" d="M12 15.75v-4m-1.75 1.75L12 11.75l1.75 1.75"/>',
  alert: '<path class="sync-cloud__mark" d="M12 11.5v2.75"/><path class="sync-cloud__mark" d="M12 16.5h.01"/>',
};

/** How the cloud looks for a state: waiting for a round and in one read the same. */
export function cloudLook(state) {
  if (state === 'pending' || state === 'syncing') return 'syncing';
  if (state === 'differs' || state === 'error' || state === 'held') return 'alert';
  return state === 'offline' ? 'offline' : 'synced';
}

/** The cloud's SVG for a look ('synced', 'syncing', 'offline', 'alert'). */
export function cloudSvg(look) {
  const open = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  if (look === 'offline') {
    // The slash cuts the outline rather than crossing it: a gap either side.
    return open
      + '<mask id="sync-cloud-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">'
      + '<rect width="24" height="24" fill="#fff"/><path d="' + SLASH + '" stroke="#000" stroke-width="5"/></mask>'
      + '<path d="' + CLOUD + '" mask="url(#sync-cloud-cut)"/><path class="sync-cloud__mark" d="' + SLASH + '"/></svg>';
  }
  return open + '<path d="' + CLOUD + '"/>' + (MARKS[look] || MARKS.synced) + '</svg>';
}
