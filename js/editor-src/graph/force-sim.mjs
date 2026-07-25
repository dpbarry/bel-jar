// Pure 3D force-directed simulation for the dependency graph. No DOM, no
// rendering — just physics on Float32Array position/velocity buffers indexed by
// node order. This is the heart of the graph layout and the test seam.
//
// Forces per tick:
//   - repulsion : all-pairs inverse-square (Coulomb), mass = 1 + log(1+degree)
//                 so hubs anchor and leaves orbit.
//   - attraction: per edge spring toward a rest length; SIGNATURE edges are
//                 stiff (the type-level skeleton), BODY edges soft.
//   - gravity   : weak pull to origin so the cloud stays framed.
// A global `alpha` cools each tick (alphaDecay) so it settles; reheat() on
// interaction. Deterministic given the same model order + seed.

// Small deterministic PRNG (mulberry32) so layouts/tests are reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fibonacci-sphere seed: an even, swirl-free initial spread on a sphere of
// radius r, jittered slightly by the PRNG so symmetric graphs don't lock up.
function seedPositions(n, r, rand) {
  const pos = new Float32Array(n * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const jitter = 0.92 + rand() * 0.16;
    pos[i * 3] = Math.cos(theta) * radius * r * jitter;
    pos[i * 3 + 1] = y * r * jitter;
    pos[i * 3 + 2] = Math.sin(theta) * radius * r * jitter;
  }
  return pos;
}

export function createForceSim(model, opts = {}) {
  const {
    repulsion = 0.6,
    signatureSpring = 0.03,
    bodySpring = 0.006,
    restLength = 1.6,
    gravity = 0.02,
    damping = 0.85,
    alphaDecay = 0.012,
    alphaMin = 0.02,
    seed = 0x9e3779b9,
    radius = 14,
  } = opts;

  const nodes = model.nodes;
  const n = nodes.length;
  const index = new Map();
  nodes.forEach((node, i) => index.set(node.id, i));

  // Edges as index pairs + stiffness, dropping any that reference unknown nodes.
  const edges = [];
  for (const e of model.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    edges.push({ a, b, k: e.kind === 'body' ? bodySpring : signatureSpring });
  }

  // Degree → mass (hubs heavier). Undirected degree.
  const degree = new Float32Array(n);
  for (const e of edges) { degree[e.a] += 1; degree[e.b] += 1; }
  const mass = new Float32Array(n);
  for (let i = 0; i < n; i++) mass[i] = 1 + Math.log(1 + degree[i]);

  const rand = mulberry32(seed);
  const pos = seedPositions(n, radius, rand);
  const vel = new Float32Array(n * 3);
  const force = new Float32Array(n * 3);
  const pinned = new Uint8Array(n);

  let alpha = 1;

  function tick() {
    if (n === 0) return alpha;
    force.fill(0);

    // Repulsion: all pairs, inverse-square, scaled by both masses.
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      for (let j = i + 1; j < n; j++) {
        const jx = j * 3;
        let dx = pos[ix] - pos[jx];
        let dy = pos[ix + 1] - pos[jx + 1];
        let dz = pos[ix + 2] - pos[jx + 2];
        let d2 = dx * dx + dy * dy + dz * dz + 0.01;
        const d = Math.sqrt(d2);
        const f = (repulsion * mass[i] * mass[j]) / d2;
        dx = (dx / d) * f; dy = (dy / d) * f; dz = (dz / d) * f;
        force[ix] += dx; force[ix + 1] += dy; force[ix + 2] += dz;
        force[jx] -= dx; force[jx + 1] -= dy; force[jx + 2] -= dz;
      }
    }

    // Attraction along edges: spring toward restLength, stiffness by kind.
    for (const e of edges) {
      const ax = e.a * 3;
      const bx = e.b * 3;
      let dx = pos[bx] - pos[ax];
      let dy = pos[bx + 1] - pos[ax + 1];
      let dz = pos[bx + 2] - pos[ax + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
      const f = e.k * (d - restLength);
      dx = (dx / d) * f; dy = (dy / d) * f; dz = (dz / d) * f;
      force[ax] += dx; force[ax + 1] += dy; force[ax + 2] += dz;
      force[bx] -= dx; force[bx + 1] -= dy; force[bx + 2] -= dz;
    }

    // Gravity to origin (keeps the cloud framed).
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      force[ix] -= pos[ix] * gravity;
      force[ix + 1] -= pos[ix + 1] * gravity;
      force[ix + 2] -= pos[ix + 2] * gravity;
    }

    // Integrate (alpha-scaled), skip pinned nodes.
    for (let i = 0; i < n; i++) {
      if (pinned[i]) { vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0; continue; }
      const ix = i * 3;
      const m = mass[i];
      vel[ix] = (vel[ix] + (force[ix] / m) * alpha) * damping;
      vel[ix + 1] = (vel[ix + 1] + (force[ix + 1] / m) * alpha) * damping;
      vel[ix + 2] = (vel[ix + 2] + (force[ix + 2] / m) * alpha) * damping;
      pos[ix] += vel[ix];
      pos[ix + 1] += vel[ix + 1];
      pos[ix + 2] += vel[ix + 2];
    }

    if (alpha > alphaMin) alpha = Math.max(alphaMin, alpha - alphaDecay);
    return alpha;
  }

  function step(count) {
    for (let s = 0; s < count; s++) tick();
    return alpha;
  }

  function reheat(to = 1) { alpha = Math.max(alpha, to); }

  function pin(id, xyz) {
    const i = index.get(id);
    if (i === undefined) return;
    pinned[i] = 1;
    if (xyz) { pos[i * 3] = xyz[0]; pos[i * 3 + 1] = xyz[1]; pos[i * 3 + 2] = xyz[2]; }
  }
  function release(id) {
    const i = index.get(id);
    if (i !== undefined) pinned[i] = 0;
  }

  // Sugiyama-style layered coordinates: y = topological layer (longest path over
  // signature edges, the interface DAG), x = barycentric within-layer order
  // (a crossing-reduction sweep), z = a slight spread so the slab still reads as
  // 3D. Returns a Float32Array of [x,y,z] per node WITHOUT mutating the sim — the
  // renderer pins these when the flat view is toggled on.
  function layeredPositions() {
    // Build signature-only adjacency (skeleton). out[a] = deps a needs.
    const out = Array.from({ length: n }, () => []);
    const inn = Array.from({ length: n }, () => []);
    for (const e of edges) {
      if (e.k < 0.02) continue; // body edge — not structural
      out[e.a].push(e.b);
      inn[e.b].push(e.a);
    }
    // Longest-path layer (cycle-tolerant via visited guard).
    const layer = new Int32Array(n).fill(-1);
    const stack = new Set();
    const depth = (i) => {
      if (layer[i] >= 0) return layer[i];
      if (stack.has(i)) return 0;
      stack.add(i);
      let d = 0;
      for (const j of out[i]) d = Math.max(d, depth(j) + 1);
      stack.delete(i);
      layer[i] = d;
      return d;
    };
    for (let i = 0; i < n; i++) depth(i);
    const maxLayer = Math.max(0, ...layer);

    // Group by layer, initial order by degree (hubs centered later).
    const byLayer = Array.from({ length: maxLayer + 1 }, () => []);
    for (let i = 0; i < n; i++) byLayer[layer[i]].push(i);

    // Crossing reduction: a few barycenter sweeps ordering each layer by the mean
    // x-index of its neighbors in the adjacent (lower) layer.
    const order = new Float32Array(n);
    byLayer.forEach((row) => row.forEach((i, k) => { order[i] = k; }));
    for (let pass = 0; pass < 4; pass++) {
      for (let L = 1; L <= maxLayer; L++) {
        const row = byLayer[L];
        const bary = row.map((i) => {
          const nb = out[i].concat(inn[i]).filter((j) => layer[j] === L - 1);
          if (!nb.length) return order[i];
          return nb.reduce((s, j) => s + order[j], 0) / nb.length;
        });
        const idx = row.map((_, k) => k).sort((a, b) => bary[a] - bary[b]);
        byLayer[L] = idx.map((k) => row[k]);
        byLayer[L].forEach((i, k) => { order[i] = k; });
      }
    }

    const SPAN = 24;     // horizontal extent
    const LGAP = 7;      // vertical gap between layers
    const out3 = new Float32Array(n * 3);
    byLayer.forEach((row, L) => {
      const w = Math.max(1, row.length - 1);
      row.forEach((i, k) => {
        out3[i * 3] = (k / w - 0.5) * SPAN * (1 + L * 0.04);
        // layer 0 = foundational (depends on nothing) → bottom; dependents rise.
        out3[i * 3 + 1] = (L - maxLayer / 2) * LGAP;
        out3[i * 3 + 2] = ((k % 3) - 1) * 1.6; // slight z so it's not pancake-flat
      });
    });
    return out3;
  }

  // Bounding sphere of the current layout (for camera auto-framing).
  function bounds() {
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
    if (n) { cx /= n; cy /= n; cz /= n; }
    let r = 0;
    for (let i = 0; i < n; i++) {
      const dx = pos[i * 3] - cx, dy = pos[i * 3 + 1] - cy, dz = pos[i * 3 + 2] - cz;
      r = Math.max(r, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    return { center: [cx, cy, cz], radius: r || 1 };
  }

  // Write arbitrary positions into the live buffer (used to snap to the layered
  // layout) and freeze velocity so it holds until reheated.
  function setPositions(buf) {
    if (buf.length !== pos.length) return;
    pos.set(buf);
    vel.fill(0);
  }

  return {
    nodes, edges, index, positions: pos, mass, degree,
    get alpha() { return alpha; },
    tick, step, reheat, pin, release, bounds, layeredPositions, setPositions,
  };
}
