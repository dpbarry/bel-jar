// 2D flat dependency view — a true Sugiyama layered diagram, rendered as SVG with
// its OWN visual language (not the 3D galaxy seen head-on). Foundational symbols
// (depend on nothing) sit at the TOP; dependents flow DOWNWARD, so an edge a→b
// ("a depends on b") points UP the page toward what it rests on, matching how you
// read an interface stack. Navigation is pure x/y pan + zoom.
//
// The pipeline is the classic four phases, tuned to stay orderly at ~200 nodes:
//   1. layer assignment — longest-path over signature (interface) edges, body
//      edges as a weak secondary so impl-only nodes still land sensibly.
//   2. ordering — insert dummy nodes on edges that span layers, then run weighted
//      median + adjacent-transpose sweeps to cut crossings.
//   3. coordinates — a priority/median horizontal placement that keeps long edge
//      chains straight and centers parents over their children.
//   4. routing — orthogonal elbows that travel along each dummy chain, so a long
//      edge reads as a clean vertical trunk with right-angle joins (img2 style).
//
// Exposes the same controller surface as the WebGL renderer so it is a drop-in for
// the 'flat' layout (getNodes / indexOfId / setFocus / getFocusedNode / countDeps /
// focusByName / flyToIndex / frameNode / frameAll / resize / dispose / camera I/O).

const SVG_NS = 'http://www.w3.org/2000/svg';

// Namespace → chip accent (matches the galaxy's NS_COLOR intent, expressed as
// CSS custom props so light/dark themes resolve correctly).
const NS_CLASS = {
  'lf-type-family': 'ns-type',
  'comp-type': 'ns-type',
  'lf-constant': 'ns-const',
  'lf-constructor': 'ns-const',
  'comp-constructor': 'ns-const',
  'rec-function': 'ns-fn',
  'schema': 'ns-schema',
  'typedef': 'ns-typedef',
};

const NODE_H = 26;
const NODE_RX = 5;  // crisp rectangle with gently rounded corners (not a pill)
const H_GAP = 22;   // min horizontal gap between nodes in a layer (breathing room)
const V_GAP = 62;   // vertical gap between layers (room for elbow routing)
const PAD = 64;     // world padding around the diagram
const CHAR_W = 7.2; // monospace advance at 12px (JetBrains Mono)
const CHIP_PAD_X = 11; // horizontal padding inside a chip, each side
const MIN_CHIP_W = 34;
const MAX_LABEL = 22;  // truncate longer labels (full name stays in <title>)

// Display label (truncated) and the chip width that fits it snugly.
function chipLabel(name) {
  const nm = name || '?';
  return nm.length > MAX_LABEL ? `${nm.slice(0, MAX_LABEL - 1)}…` : nm;
}
function chipWidth(name) {
  const label = chipLabel(name);
  return Math.max(MIN_CHIP_W, Math.round(label.length * CHAR_W + CHIP_PAD_X * 2));
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function statusClass(status) {
  if (status === 'syntax-fault' || status === 'erroring' || status === 'blocked') return 'error';
  // NOT 'stale-known': that is the healthy steady state (type known from a safe
  // earlier elaboration) — painting it as churn turns a settled graph amber.
  if (status === 'dirty' || status === 'checking') return 'recalculating';
  return 'settled';
}

// --- Sugiyama layout -------------------------------------------------------

// Returns { layout, routes, width, height } where layout maps node index →
// { x, y, layer, cx, cy }, and routes is per-edge orthogonal polyline points.
// Exported for headless layout tests (the render path needs the DOM).
export function computeFlatLayout(nodes, edges) {
  return computeLayout(nodes, edges);
}

function computeLayout(nodes, edges) {
  const n = nodes.length;
  const idOf = new Map();
  nodes.forEach((nd, i) => idOf.set(nd.id, i));
  // per-node chip width (variable: fit-to-label, monospace advance)
  const nodeW = nodes.map((nd) => chipWidth(nd.name));

  // Adjacency. Direction: a→b means "a depends on b". We layer so that things
  // depended-upon sit ABOVE. So treat b as the "upper" endpoint.
  const sigOut = Array.from({ length: n }, () => []); // a -> [b] over signature edges
  const sigIn = Array.from({ length: n }, () => []);
  const anyOut = Array.from({ length: n }, () => []);
  const anyIn = Array.from({ length: n }, () => []);
  const edgeList = [];
  for (const e of edges) {
    const a = idOf.get(e.from);
    const b = idOf.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    const sig = e.kind !== 'body';
    edgeList.push({ a, b, sig, kind: e.kind });
    anyOut[a].push(b); anyIn[b].push(a);
    if (sig) { sigOut[a].push(b); sigIn[b].push(a); }
  }

  // --- 1. layer assignment: longest path so b (depended-upon) is above a.
  // layer[i] = how deep DOWN the page. Foundational (no deps) → layer 0 (top).
  // We compute "height above foundation" = longest chain of dependencies.
  const layer = new Int32Array(n).fill(-1);
  const onStack = new Uint8Array(n);
  function rank(i) {
    if (layer[i] >= 0) return layer[i];
    if (onStack[i]) return 0; // cycle guard
    onStack[i] = 1;
    let best = 0;
    // i depends on its sigOut targets; prefer signature edges, fall back to any.
    const ups = sigOut[i].length ? sigOut[i] : anyOut[i];
    for (const j of ups) best = Math.max(best, rank(j) + 1);
    onStack[i] = 0;
    layer[i] = best;
    return best;
  }
  for (let i = 0; i < n; i++) rank(i);
  const maxLayer = n ? Math.max(0, ...layer) : 0;
  // Flip so foundational symbols (rank 0 = depend on nothing... actually rank 0 =
  // those at the bottom of the dep chain, i.e. depended-upon) sit at TOP.
  // rank counts dependencies, so a leaf dependency has rank 0 → top. Good.

  // --- 2. ordering with dummy nodes on long edges.
  // Build a layered graph: each real edge a→b with |layer diff|>1 gets dummies.
  // Node "slots": real indices 0..n-1, dummies are negative-coded via objects.
  const byLayer = Array.from({ length: maxLayer + 1 }, () => []);
  for (let i = 0; i < n; i++) byLayer[layer[i]].push({ real: i, id: i });

  let dummySeq = 0;
  // routedEdges[edgeIdx] = ordered list of slot-keys (real index or 'd<seq>')
  const segments = []; // { upper: slotKey, lower: slotKey, edgeIdx }
  const dummyLayer = new Map(); // slotKey -> layer
  const slotKeyOf = (real) => real;

  edgeList.forEach((e, edgeIdx) => {
    // upper endpoint = the one in the smaller layer index (closer to top).
    let hi = e.b, lo = e.a; // b is depended-upon → upper
    if (layer[hi] > layer[lo]) { const t = hi; hi = lo; lo = t; }
    const span = layer[lo] - layer[hi];
    if (span <= 1) {
      segments.push({ upper: slotKeyOf(hi), lower: slotKeyOf(lo), edgeIdx });
      e._chain = [slotKeyOf(hi), slotKeyOf(lo)];
      return;
    }
    // Insert dummies on each intermediate layer.
    const chain = [slotKeyOf(hi)];
    let prev = slotKeyOf(hi);
    for (let L = layer[hi] + 1; L < layer[lo]; L++) {
      const key = `d${dummySeq++}`;
      dummyLayer.set(key, L);
      byLayer[L].push({ real: -1, id: key, dummy: true });
      segments.push({ upper: prev, lower: key, edgeIdx });
      chain.push(key);
      prev = key;
    }
    segments.push({ upper: prev, lower: slotKeyOf(lo), edgeIdx });
    chain.push(slotKeyOf(lo));
    e._chain = chain;
  });

  // order index within each layer
  const orderIdx = new Map(); // slotKey -> position
  function reindex() {
    byLayer.forEach((row) => row.forEach((s, k) => orderIdx.set(s.id, k)));
  }
  // initial order: keep insertion (reals by rank, dummies appended). Seed reals by
  // degree so hubs gravitate central after sweeps.
  byLayer.forEach((row) => {
    row.sort((p, q) => {
      const dp = p.dummy ? 0 : (anyOut[p.real].length + anyIn[p.real].length);
      const dq = q.dummy ? 0 : (anyOut[q.real].length + anyIn[q.real].length);
      return dq - dp;
    });
  });
  reindex();

  // neighbor slot-keys in the adjacent layer, via segments
  const upNeighbors = new Map();  // slotKey -> [slotKey in layer-1]
  const downNeighbors = new Map();
  for (const seg of segments) {
    if (!upNeighbors.has(seg.lower)) upNeighbors.set(seg.lower, []);
    upNeighbors.get(seg.lower).push(seg.upper);
    if (!downNeighbors.has(seg.upper)) downNeighbors.set(seg.upper, []);
    downNeighbors.get(seg.upper).push(seg.lower);
  }

  function median(slotKey, neighborsMap) {
    const nb = neighborsMap.get(slotKey);
    if (!nb || !nb.length) return -1;
    const pos = nb.map((k) => orderIdx.get(k)).sort((a, b) => a - b);
    const m = pos.length;
    const mid = Math.floor(m / 2);
    if (m % 2 === 1) return pos[mid];
    if (m === 2) return (pos[0] + pos[1]) / 2;
    const left = pos[mid - 1] - pos[0];
    const right = pos[m - 1] - pos[mid];
    if (left + right === 0) return (pos[mid - 1] + pos[mid]) / 2;
    return (pos[mid - 1] * right + pos[mid] * left) / (left + right);
  }

  function medianSort(downward) {
    const range = downward
      ? [...Array(maxLayer + 1).keys()]
      : [...Array(maxLayer + 1).keys()].reverse();
    for (const L of range) {
      if (downward && L === 0) continue;
      if (!downward && L === maxLayer) continue;
      const map = downward ? upNeighbors : downNeighbors;
      const row = byLayer[L];
      const med = new Map();
      row.forEach((s) => med.set(s.id, median(s.id, map)));
      // keep fixed (median -1) nodes in place
      const withPos = row.map((s, k) => ({ s, k, m: med.get(s.id) }));
      withPos.sort((p, q) => {
        const mp = p.m < 0 ? p.k : p.m;
        const mq = q.m < 0 ? q.k : q.m;
        return mp - mq;
      });
      byLayer[L] = withPos.map((w) => w.s);
      byLayer[L].forEach((s, k) => orderIdx.set(s.id, k));
    }
  }

  // Bucket segments by the layer of their LOWER endpoint, so crossing counts
  // between layers L-1 and L only scan the relevant segments.
  const layerOfKey = (key) => (dummyLayer.has(key) ? dummyLayer.get(key) : layer[key]);
  const segsByLower = Array.from({ length: maxLayer + 1 }, () => []);
  for (const s of segments) segsByLower[layerOfKey(s.lower)].push(s);

  // Index segments incident on each slot (for O(deg) transpose deltas).
  const segsAtLower = new Map();
  const segsAtUpper = new Map();
  for (const s of segments) {
    if (!segsAtLower.has(s.lower)) segsAtLower.set(s.lower, []);
    segsAtLower.get(s.lower).push(s);
    if (!segsAtUpper.has(s.upper)) segsAtUpper.set(s.upper, []);
    segsAtUpper.get(s.upper).push(s);
  }

  // Crossing delta when swapping two adjacent slots in layer L. Each boundary is
  // updated in O(deg²) for the swapped pair only — not a full O(segs²) recount.
  function crossingDeltaLower(L, leftId, rightId) {
    const leftSegs = segsAtLower.get(leftId);
    const rightSegs = segsAtLower.get(rightId);
    if (!leftSegs?.length || !rightSegs?.length) return 0;
    let delta = 0;
    for (const sl of leftSegs) {
      const ul = orderIdx.get(sl.upper);
      for (const sr of rightSegs) {
        const ur = orderIdx.get(sr.upper);
        if (ul > ur) delta--;
        else if (ul < ur) delta++;
      }
    }
    return delta;
  }

  function crossingDeltaUpper(L, leftId, rightId) {
    const leftSegs = segsAtUpper.get(leftId);
    const rightSegs = segsAtUpper.get(rightId);
    if (!leftSegs?.length || !rightSegs?.length) return 0;
    let delta = 0;
    for (const sl of leftSegs) {
      const ll = orderIdx.get(sl.lower);
      for (const sr of rightSegs) {
        const lr = orderIdx.get(sr.lower);
        if (ll > lr) delta--;
        else if (ll < lr) delta++;
      }
    }
    return delta;
  }

  function swapAdjacent(L, i) {
    const row = byLayer[L];
    const left = row[i];
    const right = row[i + 1];
    const delta = (L > 0 ? crossingDeltaLower(L, left.id, right.id) : 0)
      + (L < maxLayer ? crossingDeltaUpper(L, left.id, right.id) : 0);
    if (delta >= 0) return false;
    row[i] = right;
    row[i + 1] = left;
    orderIdx.set(left.id, i + 1);
    orderIdx.set(right.id, i);
    return true;
  }

  function transpose() {
    let improved = true;
    let guard = 0;
    while (improved && guard++ < 6) {
      improved = false;
      for (let L = 0; L <= maxLayer; L++) {
        const row = byLayer[L];
        for (let i = 0; i < row.length - 1; i++) {
          if (swapAdjacent(L, i)) improved = true;
        }
      }
    }
  }

  // A few alternating median sweeps + transpose passes.
  const sweeps = n > 140 ? 4 : 8;
  for (let p = 0; p < sweeps; p++) {
    medianSort(p % 2 === 0);
    transpose();
  }
  reindex();

  // --- 3. x-coordinates: Brandes–Köpf alignment + compaction. This is what keeps
  // the diagram COMPACT (no stranded columns, no symmetric over-stretch): nodes are
  // grouped into vertical "blocks" that share an x (so long dummy chains read as
  // straight trunks and a chain link sits under the hub it feeds), then blocks are
  // packed as tightly as the min-gap allows and pulled together by class.
  // Width of a node: dummies are thin so trunks pack; chips are full width.
  const slotW = (s) => (s.dummy ? H_GAP * 0.55 : nodeW[s.real]);
  // min center-to-center separation between two adjacent slots in a layer
  const sep = (l, r) => slotW(l) / 2 + H_GAP + slotW(r) / 2;

  // Flatten slots to a stable id list; helpers to fetch a slot record by key.
  const slotOf = new Map();
  byLayer.forEach((row) => row.forEach((s) => slotOf.set(s.id, s)));

  // Single-direction BK (upper-median alignment, leftmost compaction). For dense
  // layered DAGs this alone removes the stranding the median-relaxation produced.
  function brandesKopf() {
    const root = new Map();   // slotKey -> block root key
    const align = new Map();  // slotKey -> next slot in block (cyclic)
    for (const [k] of slotOf) { root.set(k, k); align.set(k, k); }

    // Vertical alignment: walk layers top→down, align each node to the MEDIAN of
    // its upper neighbours when that edge doesn't cross an already-claimed one.
    for (let L = 1; L <= maxLayer; L++) {
      const row = byLayer[L];
      let r = -1; // last claimed upper position (enforces no crossing)
      for (const s of row) {
        const ups = (upNeighbors.get(s.id) || []).slice().sort((a, b) => orderIdx.get(a) - orderIdx.get(b));
        if (!ups.length) continue;
        const mids = [Math.floor((ups.length - 1) / 2), Math.ceil((ups.length - 1) / 2)];
        for (const mi of mids) {
          if (align.get(s.id) !== s.id) break; // already aligned this node
          const u = ups[mi];
          const upos = orderIdx.get(u);
          if (r < upos) {
            align.set(u, s.id);
            root.set(s.id, root.get(u));
            align.set(s.id, root.get(u));
            r = upos;
          }
        }
      }
    }

    // Horizontal compaction: place block roots left-to-right with sink/shift so
    // blocks pull together into the smallest width that respects separation.
    const sink = new Map();
    const shift = new Map();
    const x = new Map();
    for (const [k] of slotOf) { sink.set(k, k); shift.set(k, Infinity); }

    const placeBlock = (v) => {
      if (x.has(v)) return;
      x.set(v, 0);
      let w = v;
      do {
        const row = byLayer[slotOf.get(w).dummy ? dummyLayer.get(w) : layer[w]];
        const pos = orderIdx.get(w);
        if (pos > 0) {
          const pred = row[pos - 1];
          const u = root.get(pred.id);
          placeBlock(u);
          if (sink.get(v) === v) sink.set(v, sink.get(u));
          const minSep = sep(pred, slotOf.get(w));
          if (sink.get(v) !== sink.get(u)) {
            const s = x.get(v) - x.get(u) - minSep;
            shift.set(sink.get(u), Math.min(shift.get(sink.get(u)), s));
          } else {
            x.set(v, Math.max(x.get(v), x.get(u) + minSep));
          }
        }
        w = align.get(w);
      } while (w !== v);
    };

    // roots in order
    for (const row of byLayer) for (const s of row) if (root.get(s.id) === s.id) placeBlock(s.id);
    // absolute coordinates: x[block root] + class shift
    const xOut = new Map();
    for (const [k] of slotOf) {
      const r2 = root.get(k);
      let xv = x.get(r2);
      const sk = sink.get(r2);
      if (shift.get(sk) < Infinity) xv += shift.get(sk);
      xOut.set(k, xv);
    }
    return { xOut, root, align };
  }

  const { xOut: xOf, root: bkRoot } = brandesKopf();

  // --- Block-level leftward compaction. BK's one-directional compaction leaves
  // one-sided slack — a node whose left neighbour sits far away keeps a big dead
  // gap (the "lone node stranded on the right"). This closes it WITHOUT breaking
  // block straightness or order: each block can slide left by the SMALLEST slack
  // any of its nodes has to whatever sits immediately left of it in its layer.
  // Iterate to a fixed point so chains of blocks cascade leftward.
  {
    // group slot keys by block root
    const blocks = new Map(); // rootKey -> [slotKey...]
    for (const [k] of slotOf) {
      const r = bkRoot.get(k);
      if (!blocks.has(r)) blocks.set(r, []);
      blocks.get(r).push(k);
    }
    const layerOf = (k) => (slotOf.get(k).dummy ? dummyLayer.get(k) : layer[k]);
    // process blocks left→right by their current x so left space is settled first
    const order = [...blocks.keys()].sort((a, b) => xOf.get(a) - xOf.get(b));
    let moved = true;
    let guard = 0;
    while (moved && guard++ < 8) {
      moved = false;
      for (const r of order) {
        let slack = Infinity;
        for (const k of blocks.get(r)) {
          const row = byLayer[layerOf(k)];
          const pos = orderIdx.get(k);
          if (pos === 0) {
            // free left edge — limited only by the world's left margin (x=0-ish)
            slack = Math.min(slack, xOf.get(k) - slotW(slotOf.get(k)) / 2);
          } else {
            const pred = row[pos - 1];
            if (bkRoot.get(pred.id) === r) continue; // same block, no constraint
            const gap = xOf.get(k) - xOf.get(pred.id) - sep(slotOf.get(pred.id), slotOf.get(k));
            slack = Math.min(slack, gap);
          }
        }
        if (slack > 0.5 && isFinite(slack)) {
          for (const k of blocks.get(r)) xOf.set(k, xOf.get(k) - slack);
          moved = true;
        }
      }
    }
  }

  // BK shares one center-x per block; siblings on the same layer can inherit the
  // same coordinate and their chips collide. Re-space each layer by order index.
  for (let L = 0; L <= maxLayer; L++) {
    const row = byLayer[L];
    if (row.length < 2) continue;
    row.sort((a, b) => orderIdx.get(a.id) - orderIdx.get(b.id));
    for (let i = 1; i < row.length; i++) {
      const left = row[i - 1];
      const right = row[i];
      const minCx = xOf.get(left.id) + sep(left, right);
      const cx = xOf.get(right.id);
      if (cx < minCx) xOf.set(right.id, minCx);
    }
  }

  // normalize to >= 0 and compute y per layer
  let minX = Infinity;
  byLayer.forEach((row) => row.forEach((s) => { minX = Math.min(minX, xOf.get(s.id) - slotW(s) / 2); }));
  if (!isFinite(minX)) minX = 0;
  const yOf = (L) => L * (NODE_H + V_GAP);

  const layout = new Array(n);
  let maxX = 0, maxY = 0;
  byLayer.forEach((row, L) => {
    row.forEach((s) => {
      const x = xOf.get(s.id) - minX;
      const y = yOf(L);
      if (!s.dummy) layout[s.real] = { x, y, layer: L, cx: x, cy: y + NODE_H / 2, w: nodeW[s.real] };
      maxX = Math.max(maxX, x + slotW(s) / 2);
      maxY = Math.max(maxY, y + NODE_H);
    });
  });

  // dummy world positions for routing
  const dummyPos = new Map();
  byLayer.forEach((row, L) => row.forEach((s) => {
    if (s.dummy) dummyPos.set(s.id, { x: xOf.get(s.id) - minX, y: yOf(L) + NODE_H / 2 });
  }));

  // --- 4. orthogonal edge routes via fixed inter-layer tracks. Each boundary
  // between layer L and L+1 gets one shared horizontal bus at trackY(L); edges
  // rise from the dependent's top edge to the bus, jog horizontally, then climb
  // through dummy chains — never a single vertical through chip centres (which
  // hid the stem under opaque chips and left "floating" arrowheads).
  const routes = edgeList.map((e) => {
    const anchors = [];
    for (let c = 0; c < e._chain.length; c++) {
      const key = e._chain[c];
      if (typeof key === 'number') {
        const lay = layout[key];
        if (c === 0) anchors.push({ x: lay.x, y: lay.y + NODE_H + HEAD_GAP, layer: lay.layer });
        else anchors.push({ x: lay.x, y: lay.y, layer: lay.layer });
      } else {
        const L = dummyLayer.get(key);
        const p = dummyPos.get(key);
        anchors.push({ x: p.x, y: p.y, layer: L });
      }
    }
    anchors.reverse();
    return { pts: routeSugiyamaEdge(anchors, yOf), sig: e.sig, kind: e.kind, a: e.a, b: e.b };
  });

  return {
    layout, routes,
    width: maxX + PAD * 2,
    height: maxY + PAD * 2,
    pad: PAD,
  };
}

const HEAD_GAP = 5;

// Horizontal bus between layer L (above) and layer L+1 (below).
function trackY(L, yOf) {
  return yOf(L) + NODE_H + V_GAP / 2;
}

// Sugiyama edge routing: orthogonal polyline along the dummy chain. Between each
// consecutive pair (lower → upper) travel vertically to the inter-layer bus at
// trackY(upper.layer), jog horizontally on that bus if x differs, then climb to
// the next anchor. Every segment is axis-aligned — never diagonal.
function routeSugiyamaEdge(anchors, yOf) {
  if (!anchors.length) return [];
  const pts = [{ x: anchors[0].x, y: anchors[0].y }];
  for (let i = 1; i < anchors.length; i++) {
    const lo = anchors[i - 1];
    const up = anchors[i];
    const bus = trackY(up.layer, yOf);
    const last = pts[pts.length - 1];
    if (Math.abs(last.x - lo.x) > 0.5 || Math.abs(last.y - lo.y) > 0.5) {
      pts.push({ x: lo.x, y: lo.y });
    }
    if (Math.abs(pts[pts.length - 1].y - bus) > 0.5) {
      pts.push({ x: pts[pts.length - 1].x, y: bus });
    }
    if (Math.abs(pts[pts.length - 1].x - up.x) > 0.5) {
      pts.push({ x: up.x, y: bus });
    }
    if (Math.abs(pts[pts.length - 1].x - up.x) > 0.5 || Math.abs(pts[pts.length - 1].y - up.y) > 0.5) {
      pts.push({ x: up.x, y: up.y });
    }
  }
  return collapseCollinear(pts);
}

function collapseCollinear(pts) {
  if (pts.length <= 1) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    const cur = pts[i];
    if (Math.abs(prev.x - cur.x) < 0.5 && Math.abs(prev.y - cur.y) < 0.5) continue;
    out.push(cur);
  }
  return out;
}

function polylinePath(pts) {
  if (!pts.length) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
  return d;
}

const HEAD_W = 4.5; // half-width of the arrowhead base
const HEAD_H = 6;   // height of the arrowhead

function edgePaths(pts) {
  return { d: linePath(pts), head: arrowHead(pts) };
}

// Stroke path runs through the arrow base; only extend vertically (final segment
// is always vertical into the arrow tip).
function linePath(pts, headH = HEAD_H) {
  if (!pts.length) return '';
  if (pts.length < 2) return polylinePath(pts);
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const stem = pts.slice(0, -1);
  if (Math.abs(prev.x - tip.x) < 0.5) {
    stem.push({ x: tip.x, y: tip.y + headH });
  } else {
    stem.push(tip);
  }
  return polylinePath(stem);
}

// Arrowhead geometry baked into a filled triangle at the edge tip. We CANNOT use
// SVG markers here: `marker-end` only draws at the END of a whole <path>, and we
// merge many edges into one <path> for perf — so only the last subpath would get a
// head. A baked triangle is part of the merged fill path, so EVERY edge keeps its
// head. The final segment of every route is vertical pointing UP into the target,
// so the triangle points up: tip at the endpoint, base just below it.
function arrowHead(pts, headW = HEAD_W, headH = HEAD_H) {
  const tip = pts[pts.length - 1];
  const baseY = tip.y + headH;
  return `M ${tip.x} ${tip.y} L ${tip.x - headW} ${baseY} L ${tip.x + headW} ${baseY} Z`;
}

// createFlatGraph(canvasHostContainer, model, sim, opts) → controller.
// `stage` is the .bel-graph3d-stage element; we render an SVG sibling to the
// (hidden) canvas so the toolbar/labels overlay still composites on top.
export function createFlatGraph(stage, model, sim, opts = {}) {
  const {
    onJump = () => {}, onFocus = () => {}, onBeforeFocusChange = () => {},
    onDrill = null, onFly = null,
    implVisibility = 'show', skipInitialFrame = false,
  } = opts;

  const nodes = model.nodes;
  const N = nodes.length;
  const idToIdx = new Map();
  nodes.forEach((nd, i) => idToIdx.set(nd.id, i));

  let showBody = implVisibility === 'show' || implVisibility === 'all';

  const { layout, routes, width, height } = computeLayout(nodes, model.edges);

  const svg = svgEl('svg', { class: 'bel-flat-svg' });

  const viewport = svgEl('g', { class: 'bel-flat-viewport' });
  svg.appendChild(viewport);

  const edgeLayer = svgEl('g', { class: 'bel-flat-edges' });
  const nodeLayer = svgEl('g', { class: 'bel-flat-nodes' });
  viewport.append(edgeLayer, nodeLayer);

  // --- edges. MERGED into a handful of <path> elements (one stroked LINE path +
  // one filled HEAD path per kind) instead of hundreds of separate paths — this is
  // the main lever for smooth panning. Arrowheads are BAKED as filled triangles
  // into the head path (NOT SVG markers: `marker-end` only draws at the end of a
  // whole <path>, so on a merged path only the last edge would get a head — that
  // was the missing-arrowheads bug). Per-edge highlighting uses one separate
  // overlay redrawn on focus change, not by toggling hundreds of elements.
  const edges = routes
    .filter((r) => r.pts.length)
    .map((r) => ({
      a: r.a, b: r.b, sig: r.sig,
      kind: r.kind || (r.sig ? 'signature' : 'body'),
      pts: r.pts,
    }));

  const bulkLine = new Map(); // kind -> stroked <path> (merged lines)
  const bulkHead = new Map(); // kind -> filled <path> (merged arrowheads)
  function rebuildBulkEdges() {
    const lines = new Map(); const heads = new Map();
    for (const e of edges) {
      if (!e.sig && !showBody) continue;
      if (!lines.has(e.kind)) { lines.set(e.kind, []); heads.set(e.kind, []); }
      const { d, head } = edgePaths(e.pts);
      lines.get(e.kind).push(d);
      heads.get(e.kind).push(head);
    }
    const sync = (store, src, extraClass) => {
      for (const [kind, el] of store) {
        if (!src.has(kind)) { el.remove(); store.delete(kind); }
      }
      for (const [kind, ds] of src) {
        let el = store.get(kind);
        if (!el) {
          el = svgEl('path', { class: `bel-flat-edge bel-flat-edge--${kind}${extraClass}` });
          edgeLayer.appendChild(el);
          store.set(kind, el);
        }
        el.setAttribute('d', [...new Set(ds)].join(' '));
      }
    };
    sync(bulkLine, lines, '');
    sync(bulkHead, heads, ' bel-flat-edge--head');
  }
  // Focus overlay: one bright path pair per edge kind so body stays grey, sig stays blue.
  const focusLine = new Map();
  const focusHead = new Map();
  function ensureFocusOverlay(kind) {
    if (!focusLine.has(kind)) {
      const line = svgEl('path', { class: `bel-flat-edge bel-flat-edge--${kind} is-active` });
      const head = svgEl('path', { class: `bel-flat-edge bel-flat-edge--${kind} bel-flat-edge--head is-active` });
      line.style.display = 'none';
      head.style.display = 'none';
      edgeLayer.append(line, head);
      focusLine.set(kind, line);
      focusHead.set(kind, head);
    }
    return { line: focusLine.get(kind), head: focusHead.get(kind) };
  }
  function hideFocusOverlays() {
    for (const el of focusLine.values()) el.style.display = 'none';
    for (const el of focusHead.values()) el.style.display = 'none';
  }

  // --- nodes (variable-width chips, fit to label). Event handling is DELEGATED to
  // the SVG (one listener set, not 3×N) so big graphs stay light — each chip just
  // carries data-idx. We keep direct element refs for the focus spotlight.
  const nodeEls = new Array(N);
  nodes.forEach((nd, i) => {
    const p = layout[i];
    if (!p) return;
    const w = p.w;
    const g = svgEl('g', {
      class: `bel-flat-node is-${nd.role || 'node'} status-${statusClass(nd.status)} ${NS_CLASS[nd.namespace] || 'ns-default'}`,
      transform: `translate(${p.x - w / 2} ${p.y})`,
      tabindex: '0',
    });
    g.dataset.idx = i;
    g.appendChild(svgEl('rect', { width: w, height: NODE_H, rx: NODE_RX }));
    const text = svgEl('text', {
      x: w / 2, y: NODE_H / 2 + 0.5,
      'dominant-baseline': 'central', 'text-anchor': 'middle',
    });
    text.textContent = chipLabel(nd.name);
    g.appendChild(text);
    const titleEl = svgEl('title');
    titleEl.textContent = nd.label ? `${nd.label} ${nd.name || ''}`.trim() : (nd.name || '');
    g.appendChild(titleEl);
    nodeLayer.appendChild(g);
    nodeEls[i] = g;
  });

  // delegated click/dblclick/keydown on chips
  let lastClickIdx = -1, lastClickT = 0;
  const idxOfEvent = (ev) => {
    const g = ev.target.closest?.('.bel-flat-node');
    return g ? +g.dataset.idx : -1;
  };
  svg.addEventListener('click', (ev) => {
    const i = idxOfEvent(ev);
    if (i < 0) return;
    ev.stopPropagation();
    // Selection is .is-focused, not DOM focus — blur so the SVG <g> never shows
    // the browser's rectangular focus ring after a mouse click.
    ev.target.closest?.('.bel-flat-node')?.blur();
    const now = Date.now();
    if (i === lastClickIdx && now - lastClickT < 350) onJump(nodes[i], i);
    else handleActivate(i, ev.shiftKey);
    lastClickIdx = i; lastClickT = now;
  });
  svg.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    const i = idxOfEvent(ev);
    if (i < 0) return;
    ev.preventDefault();
    handleActivate(i, ev.shiftKey);
  });

  stage.appendChild(svg);

  // --- focus / spotlight: dim everything outside the focused node's direct
  // neighbourhood (its deps + dependents), brighten the rest. Edge highlighting
  // uses the single overlay path (no per-edge class churn); the bulk edges just
  // get one dim class on their shared layer.
  let focusedIdx = -1;
  function neighborsOf(idx) {
    const set = new Set([idx]);
    for (const { a, b } of edges) {
      if (a === idx) set.add(b);
      if (b === idx) set.add(a);
    }
    return set;
  }
  function applyFocus() {
    const nb = focusedIdx >= 0 ? neighborsOf(focusedIdx) : null;
    // Only touch nodes whose state actually changed isn't worth tracking here —
    // focus changes are user-paced (not per-frame), so a full pass is fine.
    nodeEls.forEach((el, i) => {
      if (!el) return;
      el.classList.toggle('is-focused', i === focusedIdx);
      el.classList.toggle('is-dimmed', !!nb && !nb.has(i));
    });
    edgeLayer.classList.toggle('is-focusing', focusedIdx >= 0);
    if (focusedIdx >= 0) {
      const byKind = new Map();
      for (const e of edges) {
        if (e.a !== focusedIdx && e.b !== focusedIdx) continue;
        if (!e.sig && !showBody) continue;
        const { d, head } = edgePaths(e.pts);
        if (!byKind.has(e.kind)) byKind.set(e.kind, { lines: [], heads: [] });
        byKind.get(e.kind).lines.push(d);
        byKind.get(e.kind).heads.push(head);
      }
      hideFocusOverlays();
      for (const [kind, { lines, heads }] of byKind) {
        const { line, head } = ensureFocusOverlay(kind);
        line.setAttribute('d', lines.join(' '));
        head.setAttribute('d', heads.join(' '));
        line.style.display = lines.length ? '' : 'none';
        head.style.display = heads.length ? '' : 'none';
      }
    } else {
      hideFocusOverlays();
    }
  }

  // --- camera (x/y pan + zoom). We pan/zoom by setting the SVG `transform`
  // ATTRIBUTE on the viewport group (NOT a CSS transform — a CSS transform +
  // will-change promotes the whole SVG to a compositor layer that Blink
  // re-rasterizes mid-gesture, which blinks/shudders). Writes are coalesced into
  // one per animation frame so a burst of pointermove events does a single layout.
  const cam = { x: 0, y: 0, scale: 1 };
  let tween = null;
  let applyQueued = false;
  let lastEdgeScale = 0;
  function syncEdgeZoom(scale) {
    if (scale === lastEdgeScale) return;
    lastEdgeScale = scale;
    const inv = 1 / scale;
    edgeLayer.style.setProperty('--flat-stroke-w', String(inv));
    edgeLayer.style.setProperty('--flat-stroke-w-active', String(1.75 * inv));
    edgeLayer.style.setProperty('--flat-edge-dash', `${3 * inv} ${3 * inv}`);
  }
  const writeTransform = () => {
    const s = cam.scale;
    viewport.setAttribute('transform', `translate(${cam.x} ${cam.y}) scale(${s})`);
    syncEdgeZoom(s);
    applyQueued = false;
  };
  const apply = () => {
    if (applyQueued) return;
    applyQueued = true;
    requestAnimationFrame(writeTransform);
  };

  function viewSize() {
    const r = stage.getBoundingClientRect();
    return { w: r.width || stage.clientWidth || 600, h: r.height || stage.clientHeight || 400 };
  }

  function clampScale(s) { return Math.min(2.5, Math.max(0.08, s)); }

  function frameAll({ animate = false } = {}) {
    const { w, h } = viewSize();
    const s = clampScale(Math.min((w - 40) / width, (h - 40) / height));
    const tx = (w - width * s) / 2;
    const ty = (h - height * s) / 2;
    setCamera({ x: tx, y: ty, scale: s }, animate);
  }

  function centerOn(wx, wy, { scale = null, animate = true } = {}) {
    const { w, h } = viewSize();
    const s = scale != null ? clampScale(scale) : cam.scale;
    setCamera({ x: w / 2 - wx * s, y: h / 2 - wy * s, scale: s }, animate);
  }

  // Zoom by `factor` (>1 in, <1 out) keeping the point (px,py) fixed on screen.
  function zoomAt(factor, px, py) {
    tween = null;
    const ns = clampScale(cam.scale * factor);
    cam.x = px - (px - cam.x) * (ns / cam.scale);
    cam.y = py - (py - cam.y) * (ns / cam.scale);
    cam.scale = ns;
    apply();
  }
  function zoomIn() { const { w, h } = viewSize(); zoomAt(1.2, w / 2, h / 2); }
  function zoomOut() { const { w, h } = viewSize(); zoomAt(1 / 1.2, w / 2, h / 2); }

  function setCamera(to, animate) {
    if (!animate) { cam.x = to.x; cam.y = to.y; cam.scale = to.scale; tween = null; apply(); return; }
    tween = { from: { ...cam }, to, start: performance.now(), dur: 320 };
    requestAnimationFrame(stepTween);
  }
  function stepTween() {
    if (!tween) return;
    const t = Math.min(1, (performance.now() - tween.start) / tween.dur);
    const e = 1 - (1 - t) ** 3;
    cam.x = tween.from.x + (tween.to.x - tween.from.x) * e;
    cam.y = tween.from.y + (tween.to.y - tween.from.y) * e;
    cam.scale = tween.from.scale + (tween.to.scale - tween.from.scale) * e;
    writeTransform(); // already inside rAF — write directly, no re-coalesce
    if (t < 1) requestAnimationFrame(stepTween); else tween = null;
  }

  // --- interaction: pan on empty drag, wheel zoom toward cursor
  let pan = null;
  svg.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.bel-flat-node')) return;
    tween = null;
    pan = { px: ev.clientX, py: ev.clientY, x0: cam.x, y0: cam.y, id: ev.pointerId, moved: false };
    svg.setPointerCapture(ev.pointerId);
    svg.classList.add('is-panning');
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!pan) return;
    cam.x = pan.x0 + (ev.clientX - pan.px);
    cam.y = pan.y0 + (ev.clientY - pan.py);
    if (Math.abs(ev.clientX - pan.px) + Math.abs(ev.clientY - pan.py) > 3) pan.moved = true;
    apply();
  });
  const endPan = (ev) => {
    if (!pan) return;
    const wasClick = !pan.moved;
    pan = null;
    svg.classList.remove('is-panning');
    if (wasClick && !ev.target.closest('.bel-flat-node') && onDrill == null) setFocus(-1);
  };
  svg.addEventListener('pointerup', endPan);
  svg.addEventListener('pointercancel', endPan);
  // Wheel zooms toward the cursor (trackpad pinch arrives as ctrl+wheel).
  svg.addEventListener('wheel', (ev) => {
    if (ev.target?.closest?.('input, textarea, .bel-graph3d-toolbar, .bel-graph3d-autocomplete')) return;
    ev.preventDefault();
    ev.stopPropagation();
    tween = null;
    const intensity = ev.ctrlKey ? 0.02 : 0.1;
    const factor = ev.deltaY < 0 ? 1 + intensity : 1 / (1 + intensity);
    const r = svg.getBoundingClientRect();
    zoomAt(factor, ev.clientX - r.left, ev.clientY - r.top);
  }, { passive: false });

  // --- controller surface (mirrors webgl-graph)
  function setFocus(idx) {
    const prev = focusedIdx;
    if (prev !== idx) onBeforeFocusChange(prev, idx);
    focusedIdx = idx;
    applyFocus();
    onFocus(idx >= 0 ? nodes[idx] : null, idx);
  }
  function handleActivate(idx, shift) {
    if (idx < 0) return;
    if (shift && onFly) onFly(nodes[idx], idx);
    else if (onDrill) onDrill(nodes[idx], idx);
    else flyToIndex(idx);
  }
  function flyToIndex(idx, { spotlight = true, animate = true, scale = null } = {}) {
    if (idx < 0 || !layout[idx]) return false;
    if (spotlight) setFocus(idx);
    centerOn(layout[idx].cx, layout[idx].cy, { scale: scale ?? Math.max(cam.scale, 0.9), animate });
    return true;
  }
  function frameNode(id, { animate = false } = {}) {
    const idx = idToIdx.get(id);
    if (idx == null) return false;
    return flyToIndex(idx, { spotlight: false, animate });
  }
  function focusByName(name, opts = {}) {
    let idx = nodes.findIndex((nd) => nd.name === name);
    if (idx < 0) {
      const q = (name || '').toLowerCase();
      idx = nodes.findIndex((nd) => (nd.name || '').toLowerCase().includes(q));
    }
    if (idx < 0) return false;
    return flyToIndex(idx, { animate: true, ...opts });
  }
  function countDeps(idx) {
    let deps = 0, dependents = 0;
    for (const { a, b } of edges) {
      if (a === idx) deps++;
      if (b === idx) dependents++;
    }
    return { deps, dependents };
  }
  function setImplVisibility(mode) {
    showBody = mode === 'show' || mode === 'all';
    rebuildBulkEdges();
    applyFocus();
  }
  function getCameraState() {
    return { flat: true, x: cam.x, y: cam.y, scale: cam.scale, focusedIdx };
  }
  function restoreCameraState(state, { animate = true } = {}) {
    if (!state) return;
    if (state.focusedIdx >= 0) setFocus(state.focusedIdx); else setFocus(-1);
    if (state.flat) setCamera({ x: state.x, y: state.y, scale: state.scale }, animate);
    else frameAll({ animate });
  }

  let disposed = false;
  let ro = null;
  function resize() {
    if (disposed) return;
    // keep the framing centered-ish on resize without yanking the user's pan: if
    // the diagram doesn't fit, leave as-is; only (re)fit when clearly uninitialized.
    if (cam.scale === 1 && cam.x === 0 && cam.y === 0) frameAll();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    ro?.disconnect();
    svg.remove();
  }

  // initial render: merge edges into bulk paths, then frame once laid out.
  rebuildBulkEdges();
  syncEdgeZoom(cam.scale);
  applyFocus();
  if (!skipInitialFrame) {
    requestAnimationFrame(() => { if (!disposed) frameAll(); });
  }

  return {
    isFlat: true,
    start: () => {},
    resize,
    frameAll,
    focusByName,
    flyToIndex,
    flyToId: (id, o) => flyToIndex(idToIdx.get(id) ?? -1, o),
    frameNode,
    focusIndex: (idx, o) => flyToIndex(idx, o),
    setFocus,
    getCameraState,
    restoreCameraState,
    indexOfId: (id) => idToIdx.get(id) ?? -1,
    getFocusedNode: () => (focusedIdx >= 0 ? { node: nodes[focusedIdx], idx: focusedIdx } : null),
    countDeps,
    getNodes: () => nodes,
    setImplVisibility,
    setLabelDensity: () => {}, // labels are always-on chips in flat view
    setLayout: () => {},       // layout switching is handled by re-mounting
    zoomIn,
    zoomOut,
    dispose,
  };
}

// --- inspector miniature ----------------------------------------------------

// Non-interactive miniature of the SAME flat diagram, for the inspector's GRAPH
// card: identical layout + chip/edge language as the windowed flat view, scaled
// to fit its container via viewBox (no pan/zoom/focus machinery). Click = jump.
export function renderFlatMini(container, model, { onJump = () => {} } = {}) {
  container.textContent = '';
  if (!model || !model.nodes.length) return false;
  const { layout, routes, width, height, pad } = computeLayout(model.nodes, model.edges);

  // The full view keeps a generous world pad for panning; the mini crops to the
  // content box plus a sliver so strokes and arrowheads aren't clipped.
  const M = 12;
  const cw = width - pad * 2;
  const ch = height - pad * 2;
  const svg = svgEl('svg', {
    class: 'bel-flat-svg bel-flat-svg--mini',
    viewBox: `${-M} ${-M} ${cw + M * 2} ${ch + M * 2}`,
    preserveAspectRatio: 'xMidYMid meet',
  });
  const edgeLayer = svgEl('g', { class: 'bel-flat-edges' });
  const nodeLayer = svgEl('g', { class: 'bel-flat-nodes' });
  svg.append(edgeLayer, nodeLayer);

  // Merged edge paths per kind, same as the full view (lines + baked heads).
  const lines = new Map();
  const heads = new Map();
  for (const r of routes) {
    if (!r.pts.length) continue;
    const kind = r.kind || (r.sig ? 'signature' : 'body');
    const { d, head } = edgePaths(r.pts);
    if (!lines.has(kind)) { lines.set(kind, []); heads.set(kind, []); }
    lines.get(kind).push(d);
    heads.get(kind).push(head);
  }
  for (const [kind, ds] of lines) {
    edgeLayer.appendChild(svgEl('path', {
      class: `bel-flat-edge bel-flat-edge--${kind}`, d: ds.join(' '),
    }));
    edgeLayer.appendChild(svgEl('path', {
      class: `bel-flat-edge bel-flat-edge--${kind} bel-flat-edge--head`, d: heads.get(kind).join(' '),
    }));
  }

  model.nodes.forEach((nd, i) => {
    const p = layout[i];
    if (!p) return;
    const g = svgEl('g', {
      class: `bel-flat-node is-${nd.role || 'node'} status-${statusClass(nd.status)} ${NS_CLASS[nd.namespace] || 'ns-default'}`,
      transform: `translate(${p.x - p.w / 2} ${p.y})`,
      tabindex: '0',
    });
    g.appendChild(svgEl('rect', { width: p.w, height: NODE_H, rx: NODE_RX }));
    const text = svgEl('text', {
      x: p.w / 2, y: NODE_H / 2 + 0.5,
      'dominant-baseline': 'central', 'text-anchor': 'middle',
    });
    text.textContent = chipLabel(nd.name);
    g.appendChild(text);
    const titleEl = svgEl('title');
    titleEl.textContent = nd.label ? `${nd.label} ${nd.name || ''}`.trim() : (nd.name || '');
    g.appendChild(titleEl);
    const fire = () => onJump(nd, i);
    g.addEventListener('click', fire);
    g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fire(); }
    });
    nodeLayer.appendChild(g);
  });

  container.appendChild(svg);
  return true;
}
