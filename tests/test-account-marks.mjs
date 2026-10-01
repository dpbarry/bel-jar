// The header's account marks, their pure halves: how the cloud draws each sync
// state (js/account/cloud-glyphs.mjs) and which pictures are GitHub identicons
// to be inset rather than cropped (js/account/avatar.mjs). How they look is
// held by scratch/shot-header.mjs in both themes; what reaches the page, by
// probe-account.
import { cloudLook, cloudSvg } from '../js/account/cloud-glyphs.mjs';
import { identiconBackground } from '../js/account/avatar.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── the cloud ────────────────────────────────────────────────────────────────
{
  const looks = ['synced', 'syncing', 'offline', 'alert'];
  const outline = (svg) => (svg.match(/<path d="M6\.75 18\.25[^"]*"/g) || []).length;
  for (const look of looks) {
    const svg = cloudSvg(look);
    expect(svg.startsWith('<svg') && svg.endsWith('</svg>') && /aria-hidden="true"/.test(svg), `${look}: one svg, hidden from assistive tech (the button carries the words)`);
    expect(/stroke-width="1\.75"/.test(svg), `${look}: drawn at the cloud's stroke`);
  }
  expect(outline(cloudSvg('synced')) === 1 && outline(cloudSvg('syncing')) === 1 && outline(cloudSvg('alert')) === 1,
    'every state but offline draws the one outline once');
  expect(/sync-cloud__check" pathLength="1"/.test(cloudSvg('synced')), 'synced: a check that can draw itself in');
  expect(/sync-cloud__arrow/.test(cloudSvg('syncing')), 'syncing: the arrow that rises');
  expect((cloudSvg('alert').match(/sync-cloud__mark/g) || []).length === 2, 'alert: the bar and the dot, both marks');
  const off = cloudSvg('offline');
  expect(/<mask id="sync-cloud-cut"/.test(off) && /mask="url\(#sync-cloud-cut\)"/.test(off), 'offline: the slash cuts the outline, a gap either side');
  expect(cloudSvg('nonsense') === cloudSvg('synced'), 'an unknown look draws synced, never nothing');
  expect(cloudLook('pending') === 'syncing' && cloudLook('held') === 'alert' && cloudLook('off') === 'synced', 'states map onto the four looks');
}

// ── identicons ───────────────────────────────────────────────────────────────
function image(size, colourAt) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a = 255] = colourAt(x, y);
      data.set([r, g, b, a], (y * size + x) * 4);
    }
  }
  return data;
}
const ROWS = ['10101', '01110', '11011', '01010', '10001'];
function identicon(size, ink = [204, 84, 150], bg = [240, 240, 240]) {
  const m = size / 12;
  const block = (size - 2 * m) / 5;
  return image(size, (x, y) => {
    const bx = Math.floor((x - m) / block);
    const by = Math.floor((y - m) / block);
    return x >= m && y >= m && bx < 5 && by < 5 && ROWS[by][bx] === '1' ? ink : bg;
  });
}
{
  expect(identiconBackground(identicon(420), 420) === 'rgb(240, 240, 240)', 'GitHub’s identicon: inset on its own background');
  expect(identiconBackground(identicon(120, [80, 140, 90]), 120) === 'rgb(240, 240, 240)', 'at any size, in any ink');
  expect(identiconBackground(image(64, () => [240, 240, 240]), 64) === null, 'a blank light square is no identicon: nothing to show whole');
  expect(identiconBackground(image(16, () => [214, 92, 150]), 16) === null, 'a dark picture is a photo');
  expect(identiconBackground(identicon(120, [240, 240, 240], [30, 30, 40]), 120) === null,
    'a pattern on a dark ground is someone’s picture: GitHub draws identicons on light grey');
  const photo = image(96, (x, y) => [100 + (x % 50), 120 + (y % 60), 180 - ((x + y) % 70)]);
  expect(identiconBackground(photo, 96) === null, 'a photo, all shades, fills the circle');
  // One colour on a light ground, like an identicon, but reaching into the
  // margin (away from the corner, which names the background).
  const bleeding = image(120, (x, y) => (x >= 2 && x < 6 && y >= 50 && y < 70 ? [204, 84, 150] : [240, 240, 240]));
  expect(identiconBackground(bleeding, 120) === null, 'a mark in the margin: not an identicon');
  const three = identicon(120).map((v, i) => (i % 4 === 0 && v === 204 && (i / 4) % 120 > 60 ? 30 : v));
  expect(identiconBackground(three, 120) === null, 'three colours: not an identicon');
  const see = identicon(120);
  see[3] = 0; // the corner pixel, see-through
  expect(identiconBackground(see, 120) === null, 'a see-through corner: a picture of its own');
  expect(identiconBackground(null, 0) === null && identiconBackground(new Uint8ClampedArray(4), 12) === null, 'nothing, or too little: nothing');
}

console.log(`OK account marks (${n} checks: the cloud's four looks and their marks, identicons told from photos)`);
