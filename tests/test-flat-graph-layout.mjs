// Flat (2D Sugiyama) dependency layout: pins the pure layout algorithm (DOM-free).
// Top-down orientation: foundational symbols at layer 0 on top, dependents below;
// same-layer nodes spread horizontally. Verifies layer ordering, straight vertical
// trunks, no intra-layer overlap, compactness, and long-edge dummy routing.
import { readFileSync } from 'node:fs';
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSemanticEngine } from '../js/editor-src/semantic/semantic-engine.mjs';
import { buildGlobalModel } from '../js/editor-src/graph/graph-view.mjs';
import { computeFlatLayout } from '../js/editor-src/graph/flat-graph.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function expectNoChipOverlap(layout) {
  const byLayer = new Map();
  layout.forEach((p) => {
    if (!p) return;
    if (!byLayer.has(p.layer)) byLayer.set(p.layer, []);
    byLayer.get(p.layer).push(p);
  });
  for (const [, row] of byLayer) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) {
      const gap = (row[i].x - row[i].w / 2) - (row[i - 1].x + row[i - 1].w / 2);
      expect(gap >= -0.5, `chips in a layer don't overlap (edge gap ${gap.toFixed(1)})`);
    }
  }
}

// --- a small DAG: a depends on b and c; b depends on d; chain a→b→d spans 2 layers
{
  const nodes = [
    { id: 'a', name: 'a', namespace: 'rec-function' },
    { id: 'b', name: 'b', namespace: 'lf-type-family' },
    { id: 'c', name: 'c', namespace: 'lf-constant' },
    { id: 'd', name: 'd', namespace: 'lf-type-family' },
  ];
  const edges = [
    { from: 'a', to: 'b', kind: 'signature' },
    { from: 'a', to: 'c', kind: 'signature' },
    { from: 'b', to: 'd', kind: 'signature' },
  ];
  const { layout, routes, width, height } = computeFlatLayout(nodes, edges);

  expect(layout.length === 4, 'every node positioned');
  for (const p of layout) {
    expect(p && Number.isFinite(p.x) && Number.isFinite(p.y), 'finite coords');
  }
  expect(width > 0 && height > 0, 'positive extent');

  const lay = (id) => layout[nodes.findIndex((n) => n.id === id)];
  // "a depends on b/c/d" → those sit ABOVE a (smaller y). d is foundational → top.
  expect(lay('b').y < lay('a').y, 'b (depended-upon) is above a');
  expect(lay('c').y < lay('a').y, 'c (depended-upon) is above a');
  expect(lay('d').y < lay('b').y, 'd is above b (deeper dependency)');
  expect(lay('d').layer === 0, 'foundational d is layer 0 (top)');

  // routes: a→d is not present (a doesn't directly dep d), but a→b spans one layer,
  // b→d spans one layer. The longest direct edge here spans exactly one layer, so
  // no dummies — but every edge yields a polyline starting/ending at chip edges.
  expect(routes.length === 3, 'a route per edge');
  for (const r of routes) {
    expect(r.pts.length >= 2, 'route has at least 2 points');
    for (const pt of r.pts) expect(Number.isFinite(pt.x) && Number.isFinite(pt.y), 'finite route pt');
  }
}

// --- long edge: a→c directly while a→b→c also exists, forcing a 2-layer span that
// must route through a dummy (so the direct a→c edge gets >2 polyline points).
{
  const nodes = [
    { id: 'a', name: 'a', namespace: 'rec-function' },
    { id: 'b', name: 'b', namespace: 'lf-type-family' },
    { id: 'c', name: 'c', namespace: 'lf-type-family' },
  ];
  const edges = [
    { from: 'a', to: 'b', kind: 'signature' },
    { from: 'b', to: 'c', kind: 'signature' },
    { from: 'a', to: 'c', kind: 'signature' }, // spans two layers → dummy route
  ];
  const { layout, routes } = computeFlatLayout(nodes, edges);
  const li = (id) => nodes.findIndex((n) => n.id === id);
  expect(layout[li('c')].layer === 0, 'c foundational (top)');
  expect(layout[li('b')].layer === 1, 'b middle');
  expect(layout[li('a')].layer === 2, 'a bottom (dependent)');

  const longRoute = routes.find((r) => r.a === li('a') && r.b === li('c'));
  expect(longRoute, 'found the a→c route');
  expect(longRoute.pts.length >= 3, 'long edge routes through a dummy (>=3 points)');
}

// --- a straight dependency chain must lay out as a straight vertical trunk
// (Brandes–Köpf block alignment) — no horizontal drift between layers.
{
  const nodes = [], edges = [];
  for (let i = 0; i < 10; i++) nodes.push({ id: 'c' + i, name: 'c' + i, namespace: 'rec-function' });
  for (let i = 0; i < 9; i++) edges.push({ from: 'c' + i, to: 'c' + (i + 1), kind: 'signature' });
  const { layout } = computeFlatLayout(nodes, edges);
  const xs = layout.map((p) => p.x);
  const spread = Math.max(...xs) - Math.min(...xs);
  expect(spread < 1, `straight chain stays vertical (x spread ${spread.toFixed(1)})`);
}

// --- compactness: a wide fan-in must not over-stretch. With ~K nodes in the
// widest layer, total width should be within a small constant of K * (chip+gap),
// NOT several times that (the "crazy long stretch" regression).
{
  const nodes = [{ id: 'hub', name: 'hub', namespace: 'lf-type-family' }];
  const edges = [];
  const K = 30;
  for (let i = 0; i < K; i++) {
    nodes.push({ id: 'd' + i, name: 'd' + i, namespace: 'rec-function' });
    edges.push({ from: 'd' + i, to: 'hub', kind: 'signature' });
  }
  const { layout, width } = computeFlatLayout(nodes, edges);
  // tight bound = sum of the widest layer's actual chip widths + gaps + padding.
  const byLayer = new Map();
  layout.forEach((p) => { if (!byLayer.has(p.layer)) byLayer.set(p.layer, []); byLayer.get(p.layer).push(p); });
  let tight = 0;
  for (const [, row] of byLayer) {
    const sum = row.reduce((s, p) => s + p.w, 0) + (row.length - 1) * 22 + 64 * 2;
    tight = Math.max(tight, sum);
  }
  expect(width <= tight * 1.15, `fan-in is compact (width ${Math.round(width)} vs tight ${Math.round(tight)})`);
}

// --- no intra-layer overlap on a wider fan-out (chips are variable-width now, so
// check actual chip edges don't cross — center ± w/2 — with the min gap between).
{
  const nodes = [{ id: 'root', name: 'root', namespace: 'rec-function' }];
  const edges = [];
  for (let i = 0; i < 8; i++) {
    nodes.push({ id: 'k' + i, name: 'k' + i, namespace: 'lf-constant' });
    edges.push({ from: 'root', to: 'k' + i, kind: 'signature' });
  }
  const { layout } = computeFlatLayout(nodes, edges);
  expectNoChipOverlap(layout);
}

// --- cycle tolerance: a↔b mutual dependency must not hang or NaN
{
  const nodes = [
    { id: 'a', name: 'a', namespace: 'rec-function' },
    { id: 'b', name: 'b', namespace: 'rec-function' },
  ];
  const edges = [
    { from: 'a', to: 'b', kind: 'signature' },
    { from: 'b', to: 'a', kind: 'signature' },
  ];
  const { layout } = computeFlatLayout(nodes, edges);
  for (const p of layout) expect(p && Number.isFinite(p.x), 'cycle still lays out with finite coords');
}

// --- degenerate: empty + single node
{
  const empty = computeFlatLayout([], []);
  expect(empty.layout.length === 0, 'empty lays out to nothing');
  const one = computeFlatLayout([{ id: 'x', name: 'x', namespace: 'rec-function' }], []);
  expect(one.layout.length === 1 && Number.isFinite(one.layout[0].x), 'single node placed');
}

// --- routes use fixed inter-layer tracks; arrow approached from below on same x
{
  const NODE_H = 26, V_GAP = 62;
  const trackY = (L) => L * (NODE_H + V_GAP) + NODE_H + V_GAP / 2;
  const nodes = [
    { id: 'a', name: 'a', namespace: 'rec-function' },
    { id: 'b', name: 'b', namespace: 'lf-type-family' },
    { id: 'c', name: 'c', namespace: 'lf-type-family' },
  ];
  const edges = [
    { from: 'a', to: 'b', kind: 'signature' },
    { from: 'b', to: 'c', kind: 'signature' },
    { from: 'a', to: 'c', kind: 'signature' },
  ];
  const { routes } = computeFlatLayout(nodes, edges);
  for (const r of routes) {
    expect(r.pts.length >= 2, 'route has polyline');
    const tip = r.pts[r.pts.length - 1];
    const prev = r.pts[r.pts.length - 2];
    expect(Math.abs(prev.x - tip.x) < 0.5, 'final segment vertical into arrow');
    expect(prev.y > tip.y + 0.5, 'arrow approached from below');
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i];
      const ortho = Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5;
      expect(ortho, `every segment axis-aligned (${a.x},${a.y})→(${b.x},${b.y})`);
    }
    let hitsTrack = false;
    for (const pt of r.pts) {
      for (let L = 0; L < 8; L++) {
        if (Math.abs(pt.y - trackY(L)) < 1) { hitsTrack = true; break; }
      }
    }
    if (r.pts.length > 2) expect(hitsTrack, 'multi-hop route passes through a layer track');
  }
}

// --- fan-in: three dependents, one hub — still strictly orthogonal
{
  const nodes = [
    { id: 'h', name: 'hub', namespace: 'lf-type-family' },
    { id: 'a', name: 'aa', namespace: 'rec-function' },
    { id: 'b', name: 'bb', namespace: 'rec-function' },
    { id: 'c', name: 'cc', namespace: 'rec-function' },
  ];
  const edges = [
    { from: 'a', to: 'h', kind: 'signature' },
    { from: 'b', to: 'h', kind: 'signature' },
    { from: 'c', to: 'h', kind: 'signature' },
  ];
  const { routes } = computeFlatLayout(nodes, edges);
  expect(routes.length === 3, 'one route per edge');
  for (const r of routes) {
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i];
      expect(Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5, 'fan-in segment orthogonal');
    }
  }
}

// --- whole-file regression: BK block alignment must not leave colliding chips
{
  const bel = readFileSync(new URL('./fixtures/all.bel', import.meta.url), 'utf8');
  const engine = createSemanticEngine();
  engine.update(parser.parse(bel), Text.of(bel.split('\n')));
  const model = buildGlobalModel(engine);
  const { layout } = computeFlatLayout(model.nodes, model.edges);
  expectNoChipOverlap(layout);
}

console.log('OK flat-graph layout (layering, dummy routing, straight-trunk, compact-fan, no-overlap, cycle-safe, degenerate-safe, track-routing)');
