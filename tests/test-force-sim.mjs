// Pure 3D force-directed simulation (force-sim.mjs). No DOM. Pins the physics
// that makes the dependency galaxy good: determinism, NaN-freedom, signature
// edges stiffer than body edges, hubs settling toward the centroid, pinning.
import { createForceSim } from '../js/editor-src/graph/force-sim.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const dist = (p, i, j) => {
  const dx = p[i * 3] - p[j * 3];
  const dy = p[i * 3 + 1] - p[j * 3 + 1];
  const dz = p[i * 3 + 2] - p[j * 3 + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};
const finite = (arr) => Array.prototype.every.call(arr, Number.isFinite);

// --- determinism: same seed → identical layout -------------------------
{
  const model = {
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    edges: [
      { from: 'a', to: 'b', kind: 'signature' },
      { from: 'b', to: 'c', kind: 'body' },
      { from: 'c', to: 'd', kind: 'signature' },
    ],
  };
  const s1 = createForceSim(model, { seed: 123 });
  const s2 = createForceSim(model, { seed: 123 });
  s1.step(200); s2.step(200);
  let same = true;
  for (let i = 0; i < s1.positions.length; i++) {
    if (Math.abs(s1.positions[i] - s2.positions[i]) > 1e-9) { same = false; break; }
  }
  expect(same, 'same seed yields identical layout (deterministic)');
  expect(finite(s1.positions), 'positions are all finite (no NaN/Inf)');

  const s3 = createForceSim(model, { seed: 999 });
  s3.step(200);
  let diff = false;
  for (let i = 0; i < s1.positions.length; i++) {
    if (Math.abs(s1.positions[i] - s3.positions[i]) > 1e-6) { diff = true; break; }
  }
  expect(diff, 'a different seed yields a different layout');
}

// --- convergence: alpha cools to its floor -----------------------------
{
  const model = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b', kind: 'signature' }] };
  const s = createForceSim(model, { alphaMin: 0.02 });
  expect(s.alpha === 1, 'alpha starts hot at 1');
  s.step(500);
  expect(s.alpha <= 0.02 + 1e-9, `alpha cools to the floor, got ${s.alpha}`);
  s.reheat();
  expect(s.alpha === 1, 'reheat restores alpha');
}

// --- edge stiffness: signature pulls tighter than body -----------------
{
  // Two identical 2-node graphs, one joined by a signature edge, one by body.
  const sig = createForceSim(
    { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b', kind: 'signature' }] },
    { seed: 7 },
  );
  const body = createForceSim(
    { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b', kind: 'body' }] },
    { seed: 7 },
  );
  sig.step(400); body.step(400);
  const dSig = dist(sig.positions, 0, 1);
  const dBody = dist(body.positions, 0, 1);
  expect(dSig < dBody,
    `signature edge settles tighter than body edge (sig ${dSig.toFixed(3)} < body ${dBody.toFixed(3)})`);
}

// --- hub centrality: a high-degree node ends nearer the centroid -------
{
  // A star: hub h connected to 8 leaves; plus an isolated-ish leaf far out.
  const nodes = [{ id: 'h' }];
  const edges = [];
  for (let i = 0; i < 8; i++) { nodes.push({ id: 'l' + i }); edges.push({ from: 'h', to: 'l' + i, kind: 'signature' }); }
  const s = createForceSim({ nodes, edges }, { seed: 3 });
  s.step(400);
  const p = s.positions;
  // centroid
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < nodes.length; i++) { cx += p[i * 3]; cy += p[i * 3 + 1]; cz += p[i * 3 + 2]; }
  cx /= nodes.length; cy /= nodes.length; cz /= nodes.length;
  const distToCentroid = (i) => Math.hypot(p[i * 3] - cx, p[i * 3 + 1] - cy, p[i * 3 + 2] - cz);
  const hubD = distToCentroid(0);
  let leafAvg = 0;
  for (let i = 1; i < nodes.length; i++) leafAvg += distToCentroid(i);
  leafAvg /= (nodes.length - 1);
  expect(hubD < leafAvg, `hub sits nearer the centroid than its leaves (hub ${hubD.toFixed(2)} < leaves ${leafAvg.toFixed(2)})`);
  expect(s.degree[0] === 8, 'hub degree recorded as 8');
  expect(s.mass[0] > s.mass[1], 'hub has greater mass than a leaf');
}

// --- pinning holds a node fixed ----------------------------------------
{
  const model = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b', kind: 'signature' }] };
  const s = createForceSim(model, { seed: 1 });
  s.pin('a', [5, 5, 5]);
  s.step(100);
  expect(s.positions[0] === 5 && s.positions[1] === 5 && s.positions[2] === 5,
    'pinned node stays exactly where pinned');
  s.release('a');
  s.reheat();
  s.step(50);
  expect(!(s.positions[0] === 5 && s.positions[1] === 5),
    'released node is free to move again');
}

// --- bounds returns a sane sphere --------------------------------------
{
  const model = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [] };
  const s = createForceSim(model, { seed: 2 });
  s.step(50);
  const b = s.bounds();
  expect(b.center.length === 3 && b.center.every(Number.isFinite), 'bounds center is a finite xyz');
  expect(b.radius > 0 && Number.isFinite(b.radius), 'bounds radius is positive + finite');
}

// --- layered (Sugiyama) positions: foundational nodes sink, layers separate ---
{
  // a → b → c chain (a depends on b depends on c). c is foundational (no deps).
  const model = {
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [
      { from: 'a', to: 'b', kind: 'signature' },
      { from: 'b', to: 'c', kind: 'signature' },
    ],
  };
  const s = createForceSim(model, { seed: 5 });
  const lp = s.layeredPositions();
  expect(lp.length === 9 && finite(lp), 'layeredPositions returns finite xyz per node');
  const y = (i) => lp[i * 3 + 1];
  // c (foundational, layer 0) sits below b below a.
  expect(y(2) < y(1) && y(1) < y(0),
    `foundational c sinks below b below a (got y: a=${y(0)} b=${y(1)} c=${y(2)})`);
  // setPositions snaps the live buffer to the layout.
  s.setPositions(lp);
  expect(s.positions[7] === lp[7], 'setPositions writes the layered buffer into the sim');
}

// --- empty + single-node never throw -----------------------------------
{
  const empty = createForceSim({ nodes: [], edges: [] });
  empty.step(10);
  expect(empty.positions.length === 0, 'empty model: no positions, no throw');
  const one = createForceSim({ nodes: [{ id: 'x' }], edges: [] });
  one.step(10);
  expect(finite(one.positions), 'single node stays finite');
}

console.log('OK force-sim (deterministic, NaN-free, signature>body stiffness, hub centrality, pin/release, bounds, degenerate-safe)');
