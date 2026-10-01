/**
 * The cloud beside the project name (js/account/sync-ui.mjs): how each sync
 * state is drawn. Pure: the page, the tests and the kit render the same marks.
 *
 * The outline is three circles on a flat base (a small left bump, a large
 * middle one, a right one between them), so the body is even and a mark can sit
 * in its optical middle. Stroke 1.75: beside the project name's text the
 * header's usual 1.5 read thinner than the words. The marks carry
 * `sync-cloud__mark`, which is what takes a colour (css/account.css): the
 * outline stays the name's quiet grey unless something needs the person.
 */

// Circles (6.75, 14.25) r4, (12, 10.75) r5.5, (17.25, 14) r4.25; base y = 18.25.
const CLOUD = 'M6.75 18.25A4 4 0 0 1 6.52 10.26A5.5 5.5 0 0 1 17.41 9.75A4.25 4.25 0 0 1 17.25 18.25Z';
const SLASH = 'M5.75 6.5 17.75 18.5';

const MARKS = {
  // pathLength 1: the check can draw itself in when a round lands (css).
  synced: '<path class="sync-cloud__mark sync-cloud__check" pathLength="1" d="M9.4 13.75l2 2 3.6-3.6"/>',
  syncing: '<path class="sync-cloud__mark sync-cloud__arrow" d="M12 16.25v-5m-2.25 2.25L12 11.25l2.25 2.25"/>',
  alert: '<path class="sync-cloud__mark" d="M12 11v3.25"/><path class="sync-cloud__mark" d="M12 16.75h.01"/>',
};

/** How the cloud looks for a state: waiting for a round and in one read the same. */
export function cloudLook(state) {
  if (state === 'pending' || state === 'syncing') return 'syncing';
  if (state === 'differs' || state === 'error' || state === 'held') return 'alert';
  return state === 'offline' ? 'offline' : 'synced';
}

/** The cloud's SVG for a look ('synced', 'syncing', 'offline', 'alert'). */
export function cloudSvg(look) {
  const open = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  if (look === 'offline') {
    // The slash cuts the outline rather than crossing it: a gap either side.
    return open
      + '<mask id="sync-cloud-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">'
      + '<rect width="24" height="24" fill="#fff"/><path d="' + SLASH + '" stroke="#000" stroke-width="5"/></mask>'
      + '<path d="' + CLOUD + '" mask="url(#sync-cloud-cut)"/><path class="sync-cloud__mark" d="' + SLASH + '"/></svg>';
  }
  return open + '<path d="' + CLOUD + '"/>' + (MARKS[look] || MARKS.synced) + '</svg>';
}
