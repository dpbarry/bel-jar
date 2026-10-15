// The x and the λ behind home's column (index.html, docs/UI.md §0). Built here,
// printed by `node scripts/home-letters.mjs`, and held to index.html by
// tests/test-home.mjs: change a number here, then paste what it prints.
//
// Both letters are drawn by one broad pen, as mathematical italic is: a stroke
// is as wide as the pen times the sine of the angle between them, so a stroke
// down to the right is the pen's whole width and one up to the right its thin
// weight. Every edge is the stroke's path moved half a pen along the nib, so
// the stem is two lines and two arcs of one radius, and an arm is a
// parallelogram. Two weights and no third: the stem square to the pen, and
// everything else THIN degrees off it (the arms, and the cut that ends the stem).
//
// A box is 1000 across, its 0 0 the page's corner; y runs down, and angles are
// degrees clockwise from the right. The λ is the x turned half a turn, without
// the arm that would leave by its right edge.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PEN = { width: 104, angle: -32 }; // the nib rises to the right
export const THIN = 22;                         // degrees off the pen: the thin weight
export const CROSSING = [330, 420];             // where the arms cross the stem
export const RUN = 290;                         // from the crossing to where the stem turns
export const RADIUS = 200;                      // of the turn
const PAST = 40;                                // a stroke ends this far off the page, its whole pen

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const along = (d, k) => [k * Math.cos(rad(d)), k * Math.sin(rad(d))];
const plus = (...ps) => ps.reduce((a, b) => [a[0] + b[0], a[1] + b[1]]);
const times = (p, k) => [p[0] * k, p[1] * k];
const num = (v) => String(Math.round(v * 10) / 10 || 0);
const pt = (p) => `${num(p[0])} ${num(p[1])}`;

export function letters() {
  const { width, angle } = PEN;
  const half = along(angle, width / 2);
  const stem = angle + 90;  // the whole pen
  const arm = angle - THIN; // up to the right
  const cut = angle + THIN; // the heading where the stem is cut, square
  const c = CROSSING;

  // The stem comes down from above the page, through the crossing, and turns up.
  const top = plus(c, along(stem, -(c[1] + PAST + Math.abs(half[1])) / Math.sin(rad(stem))));
  const bend = plus(c, along(stem, RUN));
  const centre = plus(bend, along(stem - 90, RADIUS));
  // An edge's circle (the centre moved by s half pens) meets the square cut
  // where cos(θ − cut) = −s · (width / 2r) · cos(pen − cut).
  const endAngle = (s) => cut + deg(Math.acos(-s * (width / 2 / RADIUS) * Math.cos(rad(angle - cut))));
  const onEdge = (s, a) => plus(centre, times(half, s), along(a, RADIUS));
  const edgeEnd = (s) => onEdge(s, endAngle(s));
  const r = RADIUS;
  const stemD = `M${pt(plus(top, half))}L${pt(plus(bend, half))}A${r} ${r} 0 0 0 ${pt(edgeEnd(1))}`
    + `L${pt(edgeEnd(-1))}A${r} ${r} 0 0 1 ${pt(plus(bend, times(half, -1)))}L${pt(plus(top, times(half, -1)))}Z`;

  // An arm runs from the crossing (its pen there lies across the stem, edge to
  // edge) until the whole pen is PAST the edge it leaves by.
  const armTo = (d, length) => {
    const end = plus(c, along(d, length));
    return `M${pt(plus(c, half))}L${pt(plus(end, half))}L${pt(plus(end, times(half, -1)))}L${pt(plus(c, times(half, -1)))}Z`;
  };
  const up = armTo(arm, (c[1] + PAST + Math.abs(half[1])) / -Math.sin(rad(arm)));
  const down = armTo(arm + 180, (c[0] + PAST + Math.abs(half[0])) / Math.cos(rad(arm)));

  // How far into the box the x reaches (its turn, sampled): it must leave only
  // by the page's own two edges, never by the box's others.
  let reach = [0, 0];
  for (const s of [1, -1]) {
    for (let i = 0; i <= 200; i++) {
      const p = onEdge(s, stem + 90 + ((endAngle(s) - stem - 90) * i) / 200);
      reach = [Math.max(reach[0], p[0]), Math.max(reach[1], p[1])];
    }
  }
  return { stem: stemD, up, down, cut: [edgeEnd(1), edgeEnd(-1)], reach };
}

/** The field's two boxes, as index.html carries them. */
export function markup() {
  const { stem, up, down } = letters();
  return [
    '<svg class="home-glyph home-glyph--x" viewBox="0 0 1000 1000" fill="none">',
    `  <path class="home-glyph__arm" d="${up}"/>`,
    `  <path class="home-glyph__arm" d="${down}"/>`,
    `  <path class="home-glyph__stem" d="${stem}"/>`,
    '</svg>',
    '<svg class="home-glyph home-glyph--lambda" viewBox="0 0 1000 1000" fill="none">',
    '  <g transform="rotate(180 500 500)">',
    `    <path class="home-glyph__arm" d="${up}"/>`,
    `    <path class="home-glyph__stem" d="${stem}"/>`,
    '  </g>',
    '</svg>',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(markup());
