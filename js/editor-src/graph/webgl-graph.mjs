// WebGL1 3D dependency graph renderer (force-sim driven).

import { perspective, lookAt, multiply, project } from './mat4.mjs';

const NS_COLOR = {
  'lf-type-family': [0.34, 0.62, 0.97],   // azure  — types
  'comp-type': [0.34, 0.62, 0.97],
  'lf-constant': [0.32, 0.78, 0.58],      // emerald — constants/constructors
  'lf-constructor': [0.32, 0.78, 0.58],
  'comp-constructor': [0.32, 0.78, 0.58],
  'rec-function': [0.66, 0.52, 0.97],     // violet  — rec functions
  'schema': [0.97, 0.71, 0.36],           // amber   — schemas
  'typedef': [0.40, 0.80, 0.88],          // teal    — typedefs
};
const DEFAULT_COLOR = [0.62, 0.66, 0.74];
// Edge + comet colours come from CSS vars on .bel-graph3d-container (light-dark aware).
const _colorProbe = typeof document !== 'undefined' ? document.createElement('span') : null;
function cssRgba(el, varName) {
  if (!_colorProbe || !el) return null;
  const raw = getComputedStyle(el).getPropertyValue(varName).trim();
  if (!raw) return null;
  _colorProbe.style.color = raw;
  el.appendChild(_colorProbe);
  const m = getComputedStyle(_colorProbe).color.match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/,
  );
  _colorProbe.remove();
  if (!m) return null;
  return [+m[1] / 255, +m[2] / 255, +m[3] / 255, m[4] != null ? +m[4] : 1];
}
function readEdgePalette(canvas) {
  const host = canvas.closest?.('.bel-graph3d-container') || canvas.parentElement || document.documentElement;
  return {
    body: cssRgba(host, '--graph3d-edge-body') ?? [0.42, 0.46, 0.52, 0.52],
    sig: cssRgba(host, '--graph3d-edge-sig') ?? [0.28, 0.52, 0.88, 0.68],
    // Comet colours, contrasting the edge they ride: accent on grey body edges,
    // near-white on accent signature edges.
    cometBody: (cssRgba(host, '--graph3d-comet-body') ?? [0.30, 0.62, 1.0, 1]).slice(0, 3),
    cometSig: (cssRgba(host, '--graph3d-comet-sig') ?? [0.92, 0.97, 1.0, 1]).slice(0, 3),
  };
}

function readLightMode() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('light') ? 1 : 0;
}

const NODE_VERT = `
attribute vec3 aPos;
attribute vec3 aColor;
attribute float aSize;
attribute float aDim;
uniform mat4 uVP;
uniform float uDpr;
varying vec3 vColor;
varying float vDim;
void main() {
  gl_Position = uVP * vec4(aPos, 1.0);
  gl_PointSize = (aSize / max(gl_Position.w, 0.001)) * uDpr;
  vColor = aColor;
  vDim = aDim;
}`;

// Two-pass nodes: pass 1 writes a solid depth shell (occlusion); pass 0 adds the
// shaded disc with blending, back-to-front sorted, depth-tested against pass 1.
// The look is a CLEAN flat bead — a gentle centre-to-rim volume gradient and a
// crisp edge, no glossy offset highlight. Polished and simple, not a 3D asset.
const NODE_FRAG = `
precision mediump float;
varying vec3 vColor;
varying float vDim;
uniform float uPass; // 1 = depth prepass, 0 = shaded fill
uniform float uLight; // 1 = light theme
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c);
  if (r > 0.5) discard;

  const float bodyEdge = 0.5;

  if (uPass > 0.5) {              // opaque shell for occlusion (sphere body only)
    if (r > bodyEdge * 0.86) discard;
    gl_FragColor = vec4(vColor, 1.0);
    return;
  }

  // True diffuse volume: reconstruct the sphere's surface normal from the sprite
  // position and light it from the upper-left-front. This is MATTE (lambert), not a
  // glossy specular — gives honest roundness without the plasticky 3D-asset look.
  vec2  nxy = c / bodyEdge;                   // body-normalised, [-1,1]
  float nz  = sqrt(max(0.0, 1.0 - dot(nxy, nxy)));
  vec3  N   = vec3(nxy.x, -nxy.y, nz);        // flip y (sprite y points down)
  float diff = max(dot(N, normalize(vec3(-0.32, 0.46, 0.83))), 0.0);
  float lit = 0.34 + 0.66 * diff;             // ambient lift + diffuse, ~0.34..1.0

  vec3  dRGB = vColor * (0.46 + 0.72 * lit);           // dark: luminous matte bead
  vec3  lRGB = vColor * (0.64 + 0.36 * lit);           // light: gentle material disc
  vec3  rgb  = mix(dRGB, lRGB, uLight);

  float dimMin = mix(0.35, 0.2, uLight);
  float bodyA = smoothstep(bodyEdge, bodyEdge - 0.02, r) * mix(dimMin, 1.0, vDim);
  gl_FragColor = vec4(rgb, bodyA);
}`;

// Edges are quiet structure lines; comets show flow on labelled edges only — a
// sharp head + soft tail that CONTRASTS the line: accent on grey body edges,
// light on accent signature edges (uCometBody / uCometSig).
const EDGE_VERT = `
attribute vec3 aPos;
attribute vec4 aColor;
attribute float aT;
attribute float aComet;   // 1 only on edges touching a labelled node
attribute float aBody;    // 1 = body (grey) edge, 0 = signature (accent) edge
attribute float aLen;     // world-space edge length (same at both ends)
uniform mat4 uVP;
varying vec4 vColor;
varying float vT;
varying float vComet;
varying float vBody;
varying float vLen;
void main() {
  gl_Position = uVP * vec4(aPos, 1.0);
  vColor = aColor;
  vT = aT;
  vComet = aComet;
  vBody = aBody;
  vLen = aLen;
}`;

const EDGE_FRAG = `
precision mediump float;
varying vec4 vColor;
varying float vT;
varying float vComet;
varying float vBody;
varying float vLen;
uniform float uTime;
uniform float uSpeed;
uniform float uLight;
uniform float uHeadLen;
uniform float uTailLen;
uniform vec3 uCometBody;
uniform vec3 uCometSig;
void main() {
  float phase = fract(uTime * uSpeed - vT);
  float len = max(vLen, uHeadLen * 0.35);
  float headW = uHeadLen / len;
  float tailFar = uTailLen / len;
  float tailNear = headW * 0.35;
  float head = smoothstep(headW, 0.0, phase);
  float tail = smoothstep(tailFar, tailNear, phase) * 0.55;
  float comet = (head + tail) * vComet;
  vec3 cometCol = mix(uCometSig, uCometBody, vBody);
  bool sigLight = uLight > 0.5 && vBody < 0.5 && vComet > 0.5;
  float cometMix = comet * (sigLight ? 1.0 : mix(0.96, 1.0, uLight));
  vec3 col = mix(vColor.rgb, cometCol, cometMix);
  if (sigLight) {
    // Light sig: vivid blue line + bright silver head (mirror dark-mode punch).
    col = max(col, uCometSig * head);
    col = max(col, mix(vColor.rgb, uCometSig, head));
  }
  float alphaLift = mix(0.78, sigLight ? 0.98 : 0.90, uLight);
  float headBoost = mix(0.16, sigLight ? 0.58 : 0.38, uLight);
  float cometFloor = sigLight ? 0.78 : mix(0.38, 0.50, uLight);
  float cometBase = vComet > 0.5 ? max(vColor.a, cometFloor) : vColor.a;
  float a = vComet > 0.5
    ? clamp(cometBase + comet * (1.0 - cometBase) * alphaLift + head * headBoost, 0.0, 1.0)
    : vColor.a;
  gl_FragColor = vec4(col, a);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}
function program(gl, vsrc, fsrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsrc));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('program: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

// createGraph3D(canvas, sim, { labelLayer, onJump, onFocus }) → controller.
// Returns null if WebGL is unavailable (caller falls back to 2D).
export function createGraph3D(canvas, sim, opts = {}) {
  const gl = canvas.getContext('webgl', {
    antialias: true, alpha: true, premultipliedAlpha: false, depth: true,
  }) || canvas.getContext('experimental-webgl');
  if (!gl || gl.isContextLost()) return null;

  const {
    labelLayer = null, onJump = () => {}, onFocus = () => {}, onActivate = () => {},
    onBeforeFocusChange = () => {}, onDrill = null, onFly = null, focusEdgesOnly = false,
    implVisibility = 'show',
    labelDensity: initLabelDensity = 3,
    viewMode = 'neighborhood',
  } = opts;
  let labelDensity = initLabelDensity;
  const nodes = sim.nodes;
  const N = nodes.length;
  let palette = readEdgePalette(canvas);

  const nodeProg = program(gl, NODE_VERT, NODE_FRAG);
  const edgeProg = program(gl, EDGE_VERT, EDGE_FRAG);
  const uCometBody = gl.getUniformLocation(edgeProg, 'uCometBody');
  const uCometSig = gl.getUniformLocation(edgeProg, 'uCometSig');
  const uEdgeLight = gl.getUniformLocation(edgeProg, 'uLight');
  const uCometHeadLen = gl.getUniformLocation(edgeProg, 'uHeadLen');
  const uCometTailLen = gl.getUniformLocation(edgeProg, 'uTailLen');
  const uNodePass = gl.getUniformLocation(nodeProg, 'uPass');
  const uNodeLight = gl.getUniformLocation(nodeProg, 'uLight');
  let lightMode = readLightMode();
  const uintIdxExt = gl.getExtension('OES_element_index_uint');
  const sortKeys = new Float32Array(N);
  const sortIdx = N > 65535 && uintIdxExt ? new Uint32Array(N) : new Uint16Array(N);
  const sortIdxType = sortIdx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  const sortIdxBuf = gl.createBuffer();

  // --- static per-node attributes (color, size by degree) ---
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  const dim = new Float32Array(N).fill(1); // 1 = full, <1 = dimmed (focus spotlight)
  let maxDeg = 1;
  for (let i = 0; i < N; i++) maxDeg = Math.max(maxDeg, sim.degree[i]);
  for (let i = 0; i < N; i++) {
    const c = NS_COLOR[nodes[i].namespace] || DEFAULT_COLOR;
    colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
    // size: base + degree-scaled (hubs bigger). World-space-ish; divided by depth in shader.
    sizes[i] = 220 + 520 * Math.sqrt(sim.degree[i] / maxDeg);
    // The neighborhood root (the symbol you asked about) is emphasized: larger +
    // brightened, so a local graph clearly centers on it.
    if (nodes[i].role === 'root') {
      sizes[i] = Math.max(sizes[i], 760) * 1.25;
      colors[i * 3] = Math.min(1, c[0] * 1.15 + 0.12);
      colors[i * 3 + 1] = Math.min(1, c[1] * 1.15 + 0.12);
      colors[i * 3 + 2] = Math.min(1, c[2] * 1.15 + 0.12);
    }
  }

  const posBuf = gl.createBuffer();
  const colorBuf = gl.createBuffer();
  const sizeBuf = gl.createBuffer();
  const dimBuf = gl.createBuffer();
  let showBodyEdges = implVisibility !== 'hide' && implVisibility !== 'nodes' && implVisibility !== 'none';
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);

  // --- edge geometry: 2 endpoints per edge (lines) ---
  const E = sim.edges.length;
  const edgePos = new Float32Array(E * 6);
  const edgeColor = new Float32Array(E * 8);
  const edgeT = new Float32Array(E * 2);
  const edgeComet = new Float32Array(E * 2);
  const edgeBody = new Float32Array(E * 2); // 1 = body (grey), 0 = signature (accent)
  const edgeLen = new Float32Array(E * 2);
  function writeEdgeColor(i, col, a) {
    for (let v = 0; v < 2; v++) {
      edgeColor[i * 8 + v * 4] = col[0];
      edgeColor[i * 8 + v * 4 + 1] = col[1];
      edgeColor[i * 8 + v * 4 + 2] = col[2];
      edgeColor[i * 8 + v * 4 + 3] = a;
    }
  }
  for (let i = 0; i < E; i++) {
    const isBody = sim.edges[i].k < 0.02;
    const col = isBody ? palette.body : palette.sig;
    edgeT[i * 2] = 0; edgeT[i * 2 + 1] = 1;
    edgeBody[i * 2] = isBody ? 1 : 0; edgeBody[i * 2 + 1] = isBody ? 1 : 0;
    writeEdgeColor(i, col, col[3]);
  }
  const edgePosBuf = gl.createBuffer();
  const edgeColorBuf = gl.createBuffer();
  const edgeTBuf = gl.createBuffer();
  const edgeCometBuf = gl.createBuffer();
  const edgeBodyBuf = gl.createBuffer();
  const edgeLenBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, edgeColorBuf);
  gl.bufferData(gl.ARRAY_BUFFER, edgeColor, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, edgeTBuf);
  gl.bufferData(gl.ARRAY_BUFFER, edgeT, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, edgeBodyBuf);
  gl.bufferData(gl.ARRAY_BUFFER, edgeBody, gl.STATIC_DRAW);

  let focusedIdx = -1;
  let frozen = false;

  // Comets animate ONLY within the focused node's immediate neighbourhood — both
  // endpoints must be in `cometSet` (the focus + its direct neighbours). Gating on
  // "touches a neighbour" instead lights every edge of a hub neighbour (a burst);
  // requiring BOTH endpoints keeps it to the local star. No focus → no comets.
  let cometSet = new Set();
  function cometForEdge(e) {
    if (e.k < 0.02 && !showBodyEdges) return false;
    return cometSet.has(e.a) && cometSet.has(e.b);
  }
  function updateEdgeComet() {
    for (let i = 0; i < E; i++) {
      const on = cometForEdge(sim.edges[i]) ? 1 : 0;
      edgeComet[i * 2] = on; edgeComet[i * 2 + 1] = on;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, edgeCometBuf);
    gl.bufferData(gl.ARRAY_BUFFER, edgeComet, gl.DYNAMIC_DRAW);
  }

  // --- camera (orbit) ---
  const b = sim.bounds();
  const target = [...b.center];
  const cam = { az: 0.6, el: 0.4, dist: Math.max(b.radius * 2.6, 18) };
  let dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);

  function eye() {
    const ce = Math.cos(cam.el), se = Math.sin(cam.el);
    return [
      target[0] + cam.dist * ce * Math.sin(cam.az),
      target[1] + cam.dist * se,
      target[2] + cam.dist * ce * Math.cos(cam.az),
    ];
  }
  let vp = null;
  function updateVP() {
    const aspect = (canvas.width / dpr) / Math.max(1, canvas.height / dpr);
    const proj = perspective(Math.PI / 4, aspect, 0.1, b.radius * 12 + 100);
    vp = multiply(proj, lookAt(eye(), target, [0, 1, 0]));
  }

  function applyFocusEdges(fIdx, neighborSet) {
    cometSet = (fIdx >= 0 && neighborSet) ? neighborSet : new Set();
    for (let i = 0; i < E; i++) {
      const e = sim.edges[i];
      const isBody = e.k < 0.02;
      const base = isBody ? palette.body : palette.sig;
      let a = base[3];
      if (isBody && !showBodyEdges) {
        a = 0;
      } else if (cometForEdge(e)) {
        a = lightMode
          ? (isBody ? 0.55 : 0.92)
          : (isBody ? 0.62 : 0.72);
      } else if (fIdx >= 0) {
        const inNb = neighborSet.has(e.a) && neighborSet.has(e.b);
        const touches = e.a === fIdx || e.b === fIdx;
        const bgMult = lightMode
          ? (isBody ? 0.50 : 0.62)
          : (isBody ? 0.58 : 0.76);
        const farMult = viewMode === 'global'
          ? (lightMode ? (isBody ? 0.3 : 0.4) : (isBody ? 0.5 : 0.6))
          : bgMult;
        if (touches) {
          const boost = lightMode ? 1.15 : 1.35;
          const add = lightMode ? 0.08 : 0.18;
          const cap = lightMode ? 0.66 : 1.0;
          a = Math.min(cap, base[3] * boost + add);
        } else {
          a = base[3] * (inNb ? bgMult : farMult);
        }
      } else if (focusEdgesOnly && isBody) {
        a = 0;
      }
      writeEdgeColor(i, base, a);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, edgeColorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, edgeColor, gl.DYNAMIC_DRAW);
    if (neighborSet) {
      // Non-neighbours are DEPRIORITISED, not hidden — keep them clearly visible.
      for (let i = 0; i < N; i++) dim[i] = (fIdx < 0 || neighborSet.has(i)) ? 1 : 0.2;
    } else {
      dim.fill(1);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, dimBuf);
    gl.bufferData(gl.ARRAY_BUFFER, dim, gl.DYNAMIC_DRAW);
    updateEdgeComet();
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, dimBuf);
  gl.bufferData(gl.ARRAY_BUFFER, dim, gl.DYNAMIC_DRAW);
  applyFocusEdges(-1, null);

  function neighborsOf(idx) {
    const set = new Set([idx]);
    for (const e of sim.edges) {
      if (e.a === idx) set.add(e.b);
      if (e.b === idx) set.add(e.a);
    }
    return set;
  }

  function setFocus(idx) {
    const prev = focusedIdx;
    if (prev !== idx) onBeforeFocusChange(prev, idx);
    focusedIdx = idx;
    applyFocusEdges(idx, idx >= 0 ? neighborsOf(idx) : null);
    onFocus(idx >= 0 ? nodes[idx] : null, idx);
  }

  // --- labels (projected HTML overlay) ---
  const labelEls = new Map(); // idx -> element
  function ensureLabel(idx) {
    let el = labelEls.get(idx);
    if (!el && labelLayer) {
      el = document.createElement('button');
      el.className = 'bel-graph3d-label';
      el.type = 'button';
      el.textContent = nodes[idx].name || '?';
      el.dataset.idx = String(idx);
      // A label does NOT handle its own pointer gestures: capturing here would
      // swallow a drag begun on the label. The stage-level handler owns drag-vs-
      // click for the whole surface and reads dataset.idx to resolve a label click.
      labelLayer.appendChild(el);
      labelEls.set(idx, el);
    }
    return el;
  }
  function updateLabels() {
    if (!labelLayer) return;
    // density 1 = none, 2 = sparse, 3 = normal, 4 = dense, 5 = all
    if (labelDensity <= 1) {
      for (const el of labelEls.values()) el.style.display = 'none';
      return;
    }
    const w = canvas.width / dpr, h = canvas.height / dpr;
    const pos = sim.positions;
    const shown = new Set();

    // Spread labels across the view via a screen grid. The focused node uses the
    // same placement/collision rules — only its chip styling differs.
    const cellSizes = [0, 320, 210, 132, 80, 48];
    const CELL = cellSizes[labelDensity] ?? 132;
    const cols = Math.max(1, Math.round(w / CELL));
    const rows = Math.max(1, Math.round(h / (CELL * 0.5)));

    const densityCapScale = [0, 0.25, 0.5, 1, 1.8, 9999][labelDensity] ?? 1;
    const baseCap = Math.round(26 * densityCapScale);

    const ev = eye();
    let maxDeg = 1;
    for (let i = 0; i < N; i++) maxDeg = Math.max(maxDeg, sim.degree[i]);
    const best = new Map(); // cellKey -> { i, x, y, score, dist }
    for (let i = 0; i < N; i++) {
      const pr = project(vp, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      if (!pr.visible || pr.x < 0 || pr.x > 1 || pr.y < 0 || pr.y > 1) continue;
      const cx = Math.min(cols - 1, Math.floor(pr.x * cols));
      const cy = Math.min(rows - 1, Math.floor(pr.y * rows));
      const key = cy * cols + cx;
      const dx = pos[i * 3] - ev[0], dy = pos[i * 3 + 1] - ev[1], dz = pos[i * 3 + 2] - ev[2];
      const camDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const nearness = Math.max(0, 1 - camDist / (cam.dist + b.radius * 2));
      const score = nearness + 0.5 * (sim.degree[i] / maxDeg);
      const prev = best.get(key);
      if (!prev || score > prev.score) best.set(key, { i, x: pr.x * w, y: pr.y * h, score, dist: camDist });
    }
    const picks = [...best.values()].sort((a, c) => c.score - a.score);
    const placed = [];
    const pruneW = labelDensity >= 5 ? 0 : 64;
    const pruneH = labelDensity >= 5 ? 0 : 15;
    const paintOrder = [];
    const collides = (x, y) => pruneW > 0 && placed.some(
      (q) => Math.abs(q.x - x) < pruneW && Math.abs(q.y - y) < pruneH,
    );

    // Pin the focused label at its projected anchor when on-screen. It skips the
    // grid cap and won't be collision-pruned; other labels still compete normally.
    if (focusedIdx >= 0) {
      const pr = project(vp, pos[focusedIdx * 3], pos[focusedIdx * 3 + 1], pos[focusedIdx * 3 + 2]);
      if (pr.visible && pr.x >= 0 && pr.x <= 1 && pr.y >= 0 && pr.y <= 1) {
        const x = pr.x * w;
        const y = pr.y * h;
        const dx = pos[focusedIdx * 3] - ev[0];
        const dy = pos[focusedIdx * 3 + 1] - ev[1];
        const dz = pos[focusedIdx * 3 + 2] - ev[2];
        placeLabel(focusedIdx, x, y, true);
        placed.push({ x, y });
        shown.add(focusedIdx);
        paintOrder.push({ i: focusedIdx, dist: Math.sqrt(dx * dx + dy * dy + dz * dz) });
      }
    }

    let slots = baseCap;
    for (const { i, x, y, dist } of picks) {
      if (i === focusedIdx || slots <= 0) continue;
      if (collides(x, y)) continue;
      placeLabel(i, x, y, false);
      placed.push({ x, y });
      shown.add(i);
      paintOrder.push({ i, dist });
      slots--;
    }

    paintOrder.sort((a, b) => b.dist - a.dist);
    for (let z = 0; z < paintOrder.length; z++) {
      const el = labelEls.get(paintOrder[z].i);
      if (el) el.style.zIndex = String(z + 1);
    }

    for (const [i, el] of labelEls) if (!shown.has(i)) el.style.display = 'none';
  }

  function placeLabel(i, x, y, isFocus) {
    const el = ensureLabel(i);
    if (!el) return;
    el.style.display = '';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.classList.toggle('is-focus', isFocus);
  }

  // --- draw ---
  function bindAttr(prog, name, buf, size) {
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  // Wrapped at 100s so uTime*uSpeed (0.6) stays under 60 — keeps fract() precise in
  // the mediump shader, and 60 is an integer so the comet phase is continuous across
  // the wrap (no visible jump however long the window stays open).
  const clock = () => ((typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000) % 100;

  function sortNodesBackToFront() {
    const pos = sim.positions;
    const ev = eye();
    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      const dx = pos[ix] - ev[0], dy = pos[ix + 1] - ev[1], dz = pos[ix + 2] - ev[2];
      sortKeys[i] = dx * dx + dy * dy + dz * dz;
      sortIdx[i] = i;
    }
    sortIdx.sort((a, b) => sortKeys[b] - sortKeys[a]);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sortIdxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sortIdx, gl.DYNAMIC_DRAW);
  }

  function bindNodeAttrs() {
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, sim.positions, gl.DYNAMIC_DRAW);
    bindAttr(nodeProg, 'aPos', posBuf, 3);
    bindAttr(nodeProg, 'aColor', colorBuf, 3);
    bindAttr(nodeProg, 'aSize', sizeBuf, 1);
    bindAttr(nodeProg, 'aDim', dimBuf, 1);
  }

  function draw() {
    const edgeTime = clock();
    updateVP();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // edges — behind nodes; test depth but don't write (lines are thin + transparent).
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // edges — dim lines with a comet highlight flowing toward each dependency.
    gl.bindBuffer(gl.ARRAY_BUFFER, edgePosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, edgePos, gl.DYNAMIC_DRAW);
    gl.useProgram(edgeProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(edgeProg, 'uVP'), false, vp);
    gl.uniform1f(gl.getUniformLocation(edgeProg, 'uTime'), edgeTime);
    gl.uniform1f(gl.getUniformLocation(edgeProg, 'uSpeed'), 0.4);
    gl.uniform1f(uEdgeLight, lightMode);
    const bounds = sim.bounds();
    gl.uniform1f(uCometHeadLen, Math.max(2.0, bounds.radius * 0.06));
    gl.uniform1f(uCometTailLen, Math.max(6.5, bounds.radius * 0.18));
    gl.uniform3fv(uCometBody, palette.cometBody);
    gl.uniform3fv(uCometSig, palette.cometSig);
    bindAttr(edgeProg, 'aPos', edgePosBuf, 3);
    bindAttr(edgeProg, 'aColor', edgeColorBuf, 4);
    bindAttr(edgeProg, 'aT', edgeTBuf, 1);
    bindAttr(edgeProg, 'aComet', edgeCometBuf, 1);
    bindAttr(edgeProg, 'aBody', edgeBodyBuf, 1);
    bindAttr(edgeProg, 'aLen', edgeLenBuf, 1);
    gl.drawArrays(gl.LINES, 0, E * 2);

    // nodes — DEPTH-ONLY prepass (z occlusion, no colour: a coloured shell would
    // leak through as a flat disc on dimmed/transparent nodes), then the shaded
    // glow back-to-front. So every node keeps its 3D bead look even when dimmed.
    gl.useProgram(nodeProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(nodeProg, 'uVP'), false, vp);
    gl.uniform1f(gl.getUniformLocation(nodeProg, 'uDpr'), dpr);
    gl.uniform1f(uNodeLight, lightMode);
    bindNodeAttrs();

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.colorMask(false, false, false, false); // write depth only
    gl.uniform1f(uNodePass, 1);
    gl.drawArrays(gl.POINTS, 0, N);
    gl.colorMask(true, true, true, true);

    sortNodesBackToFront();
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.uniform1f(uNodePass, 0);
    if (N > 65535 && !uintIdxExt) gl.drawArrays(gl.POINTS, 0, N);
    else gl.drawElements(gl.POINTS, N, sortIdxType, 0);
  }

  // Sync edge line endpoints from the sim each frame.
  function syncEdges() {
    const pos = sim.positions;
    for (let i = 0; i < E; i++) {
      const e = sim.edges[i];
      const ax = pos[e.a * 3], ay = pos[e.a * 3 + 1], az = pos[e.a * 3 + 2];
      const bx = pos[e.b * 3], by = pos[e.b * 3 + 1], bz = pos[e.b * 3 + 2];
      edgePos[i * 6] = ax;
      edgePos[i * 6 + 1] = ay;
      edgePos[i * 6 + 2] = az;
      edgePos[i * 6 + 3] = bx;
      edgePos[i * 6 + 4] = by;
      edgePos[i * 6 + 5] = bz;
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      edgeLen[i * 2] = len;
      edgeLen[i * 2 + 1] = len;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, edgeLenBuf);
    gl.bufferData(gl.ARRAY_BUFFER, edgeLen, gl.DYNAMIC_DRAW);
  }

  // --- camera fly animation ---
  let flyTween = null;
  const FLY_MS = 350;

  function easeOutCubic(t) {
    return 1 - (1 - t) ** 3;
  }

  function cancelFly() {
    flyTween = null;
  }

  function tickFly() {
    if (!flyTween) return;
    const t = Math.min(1, ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - flyTween.start) / flyTween.dur);
    const e = easeOutCubic(t);
    target[0] = flyTween.from.t[0] + (flyTween.to.t[0] - flyTween.from.t[0]) * e;
    target[1] = flyTween.from.t[1] + (flyTween.to.t[1] - flyTween.from.t[1]) * e;
    target[2] = flyTween.from.t[2] + (flyTween.to.t[2] - flyTween.from.t[2]) * e;
    cam.dist = flyTween.from.d + (flyTween.to.d - flyTween.from.d) * e;
    if (flyTween.from.az != null) {
      cam.az = flyTween.from.az + (flyTween.to.az - flyTween.from.az) * e;
      cam.el = flyTween.from.el + (flyTween.to.el - flyTween.from.el) * e;
    }
    if (t >= 1) flyTween = null;
  }

  function handleNodeActivate(idx, shift) {
    if (idx < 0) return;
    onActivate(nodes[idx], idx);
    if (shift && onFly) onFly(nodes[idx], idx);
    else if (onDrill) onDrill(nodes[idx], idx);
    else flyToIndex(idx);
  }

  // --- picking: nearest projected node within a screen radius ---
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
    const pos = sim.positions;
    let best = -1, bestD = 0.04 * 0.04; // ~screen-fraction radius²
    for (let i = 0; i < N; i++) {
      const p = project(vp, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      if (!p.visible) continue;
      const dx = p.x - px, dy = p.y - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // --- interaction ---
  let drag = null;
  let toolbarPress = false;
  let lastClickIdx = -1;
  let lastClickT = 0;

  function onPointerDown(ev) {
    if (disposed) return;
    // The toolbar + its search field share the stage — let them behave normally
    // rather than starting an orbit. Everything else (canvas AND labels) drags.
    if (ev.target?.closest?.('.bel-graph3d-toolbar')) {
      toolbarPress = true;
      return;
    }
    toolbarPress = false;
    cancelFly();
    const labelEl = ev.target?.closest?.('.bel-graph3d-label');
    const li = labelEl ? Number(labelEl.dataset.idx) : -1;
    drag = {
      x: ev.clientX, y: ev.clientY,        // last frame (for incremental rotation)
      sx: ev.clientX, sy: ev.clientY,      // start (for total-displacement test)
      moved: false, id: ev.pointerId, pan: ev.shiftKey,
      labelIdx: Number.isInteger(li) ? li : -1, // node a press LANDED on, if any
    };
    surface.setPointerCapture(ev.pointerId);
    arm();
  }
  function onPointerMove(ev) {
    if (disposed || !drag) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    // A drag is detected by TOTAL displacement from the down point (latched), not
    // the per-frame delta — otherwise a slow orbit reads as a click on release.
    if (Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 4) drag.moved = true;
    if (drag.pan) {
      const k = cam.dist * 0.0016;
      const e = eye();
      // pan in camera right/up
      const fwd = [target[0] - e[0], target[1] - e[1], target[2] - e[2]];
      const fl = Math.hypot(...fwd); fwd[0] /= fl; fwd[1] /= fl; fwd[2] /= fl;
      const right = [fwd[2], 0, -fwd[0]];
      const rl = Math.hypot(...right) || 1; right[0] /= rl; right[2] /= rl;
      target[0] -= (dx * right[0]) * k; target[2] -= (dx * right[2]) * k;
      target[1] += dy * k;
    } else {
      cam.az -= dx * 0.008;
      cam.el = Math.max(-1.45, Math.min(1.45, cam.el + dy * 0.008));
    }
    drag.x = ev.clientX; drag.y = ev.clientY;
    arm();
  }
  function onPointerUp(ev) {
    if (disposed) return;
    // pointerdown on the toolbar skips drag setup; without this guard the bubbled
    // pointerup reads as an empty-canvas click and clears global-view focus before
    // toolbar buttons (e.g. "Open neighborhood view") handle their click.
    if (toolbarPress || ev.target?.closest?.('.bel-graph3d-toolbar')) {
      toolbarPress = false;
      return;
    }
    const wasDrag = drag && drag.moved;
    const downLabelIdx = drag ? drag.labelIdx : -1;
    drag = null;
    if (wasDrag) return;
    // A click (no drag past the 4px leeway): a press that LANDED on a label resolves
    // to that label's node directly — labels sit OFFSET from their sphere, so a
    // ray-pick would miss. Otherwise ray-pick the spheres. Focus, or jump on double.
    const idx = downLabelIdx >= 0 ? downLabelIdx : pick(ev.clientX, ev.clientY);
    const now = Date.now();
    if (idx >= 0 && idx === lastClickIdx && now - lastClickT < 350) {
      onJump(nodes[idx], idx);
    } else if (idx >= 0) {
      handleNodeActivate(idx, ev.shiftKey);
    } else if (viewMode === 'global') {
      // Global view: clicking empty space clears focus. Local view keeps a
      // selection (at least the neighborhood root) — no deselected state.
      setFocus(-1);
    }
    lastClickIdx = idx; lastClickT = now;
    arm();
  }
  function zoomBy(factor) {
    cam.dist = Math.max(Math.max(b.radius * 0.1, 1), Math.min(Math.max(b.radius * 6, 80), cam.dist * factor));
    arm();
  }
  function onWheel(ev) {
    if (disposed) return;
    // Let a real text field (the search box) scroll/behave normally.
    if (ev.target?.closest?.('input, textarea, .bel-graph3d-toolbar, .bel-graph3d-autocomplete')) return;
    // Capture EVERYTHING else over the graph (incl. wheeling over labels) so the
    // page never scrolls/zooms. Trackpad pinch arrives as wheel + ctrlKey.
    ev.preventDefault();
    ev.stopPropagation();
    const intensity = ev.ctrlKey ? 0.02 : 0.1; // pinch is finer-grained
    // deltaY < 0 (scroll up / pinch out) → zoom IN (dist *= <1), matching native.
    zoomBy(1 + Math.sign(ev.deltaY) * intensity);
  }

  // The interaction surface is the whole stage (canvas + label overlay +
  // toolbar), so gestures over a label are captured too — not just empty space.
  const surface = canvas.parentElement || canvas;

  surface.addEventListener('pointerdown', onPointerDown);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerup', onPointerUp);
  surface.addEventListener('wheel', onWheel, { passive: false });

  // Touch pinch-to-zoom (mobile): track two-finger distance over the surface.
  let pinchDist = 0;
  function touchDist(t) {
    const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  }
  function onTouchStart(ev) {
    if (disposed) return;
    if (ev.touches.length === 2) { pinchDist = touchDist(ev.touches); ev.preventDefault(); }
  }
  function onTouchMove(ev) {
    if (disposed) return;
    if (ev.touches.length === 2 && pinchDist > 0) {
      ev.preventDefault();
      const d = touchDist(ev.touches);
      zoomBy(pinchDist / d);
      pinchDist = d;
    }
  }
  function onTouchEnd() { pinchDist = 0; }
  surface.addEventListener('touchstart', onTouchStart, { passive: false });
  surface.addEventListener('touchmove', onTouchMove, { passive: false });
  surface.addEventListener('touchend', onTouchEnd);

  // --- render loop ---
  // The loop runs continuously while the window is open so the directional comet
  // flow keeps animating (rAF auto-pauses when the tab/window is hidden, so this
  // doesn't burn battery in the background). The PHYSICS still settles and stops
  // (sim.tick only while hot) — only the cheap draw keeps going.
  let raf = 0;
  let running = false;
  let disposed = false;
  function frame() {
    if (disposed || !running) return;
    if (!frozen && sim.alpha > sim.alphaMinReached) sim.tick();
    tickFly();
    syncEdges();
    updateVP();
    updateLabels();
    draw();
    if (!disposed && running) raf = requestAnimationFrame(frame);
  }
  // arm(): reheat the physics (after interaction/layout change) and ensure the
  // loop is running.
  function arm() {
    if (disposed) return;
    if (!frozen) sim.reheat(0.3);
    if (!running) { running = true; raf = requestAnimationFrame(frame); }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    arm();
  }

  function frameAll({ animate = false } = {}) {
    const nb = sim.bounds();
    // Clamp to a minimum distance so small neighbourhood graphs (2–3 nodes) that
    // have settled into a tight cluster don't produce a camera inside the cloud.
    // 18 world-units is generous enough to show a fully-settled 2-node graph.
    const dist = Math.max(nb.radius * 2.6, 18);
    if (animate) {
      flyToTarget(nb.center, dist, { animate: true });
      return;
    }
    cancelFly();
    target[0] = nb.center[0]; target[1] = nb.center[1]; target[2] = nb.center[2];
    cam.dist = dist;
    arm();
  }

  function flyToTarget(tgt, dist, { animate = true } = {}) {
    if (!animate) {
      cancelFly();
      target[0] = tgt[0]; target[1] = tgt[1]; target[2] = tgt[2];
      cam.dist = dist;
      arm();
      return true;
    }
    flyTween = {
      from: { t: [...target], d: cam.dist },
      to: { t: [...tgt], d: dist },
      start: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      dur: FLY_MS,
    };
    arm();
    return true;
  }

  function flyToIndex(idx, { tight = true, spotlight = true, animate = true } = {}) {
    if (idx < 0) return false;
    if (spotlight) setFocus(idx);
    const tx = sim.positions[idx * 3];
    const ty = sim.positions[idx * 3 + 1];
    const tz = sim.positions[idx * 3 + 2];
    const td = tight ? Math.max(b.radius * 1.1, cam.dist * 0.85) : cam.dist;
    return flyToTarget([tx, ty, tz], td, { animate });
  }

  // Switch between the force galaxy ('force') and the flat layered Sugiyama view
  // ('flat'). Flat snaps to layered coords and freezes the sim; force un-freezes
  // and reheats so it re-organizes. Re-frames the camera either way.
  function setLayout(mode) {
    if (mode === 'flat') {
      sim.setPositions(sim.layeredPositions());
      frozen = true;
      // Look at the slab head-on (front), not from an angle.
      cam.az = 0; cam.el = 0.12;
    } else {
      frozen = false;
      sim.reheat(1);
      cam.az = 0.6; cam.el = 0.4;
    }
    frameAll();
  }

  function focusIndex(idx, { tight = true, spotlight = true, animate = false } = {}) {
    if (idx < 0) return false;
    if (spotlight) setFocus(idx);
    return flyToIndex(idx, { tight, spotlight: false, animate });
  }
  function focusByName(name, opts = {}) {
    const idx = nodes.findIndex((n) => n.name === name);
    if (idx < 0) {
      const q = (name || '').toLowerCase();
      const partial = nodes.findIndex((n) => (n.name || '').toLowerCase().includes(q));
      if (partial < 0) return false;
      return flyToIndex(partial, { animate: true, ...opts });
    }
    return flyToIndex(idx, { animate: true, ...opts });
  }
  function frameNode(id, opts = {}) {
    const idx = nodes.findIndex((n) => n.id === id);
    return flyToIndex(idx, { tight: false, spotlight: false, animate: opts.animate ?? false });
  }

  function getCameraState() {
    return {
      target: [...target], az: cam.az, el: cam.el, dist: cam.dist, focusedIdx,
    };
  }

  function restoreCameraState(state, { animate = true } = {}) {
    if (!state || state.flat || !state.target) return;
    if (state.focusedIdx >= 0) setFocus(state.focusedIdx);
    else setFocus(-1);
    if (!animate) {
      cancelFly();
      target[0] = state.target[0]; target[1] = state.target[1]; target[2] = state.target[2];
      cam.az = state.az; cam.el = state.el; cam.dist = state.dist;
      arm();
      return;
    }
    flyTween = {
      from: { t: [...target], d: cam.dist, az: cam.az, el: cam.el },
      to: { t: [...state.target], d: state.dist, az: state.az, el: state.el },
      start: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      dur: FLY_MS,
    };
    arm();
  }

  function indexOfId(id) {
    return nodes.findIndex((n) => n.id === id);
  }

  function getFocusedNode() {
    return focusedIdx >= 0 ? { node: nodes[focusedIdx], idx: focusedIdx } : null;
  }

  function countDeps(idx) {
    let deps = 0, dependents = 0;
    for (const e of sim.edges) {
      if (e.a === idx) deps++;
      if (e.b === idx) dependents++;
    }
    return { deps, dependents };
  }

  function setImplVisibility(mode) {
    showBodyEdges = mode === 'show' || mode === 'all';
    applyFocusEdges(focusedIdx, focusedIdx >= 0 ? neighborsOf(focusedIdx) : null);
    arm();
  }

  function setLabelDensity(density) {
    labelDensity = Math.min(5, Math.max(1, density));
    arm();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    drag = null;
    flyTween = null;
    themeObs?.disconnect();
    themeObs = null;
    surface.removeEventListener('pointerdown', onPointerDown);
    surface.removeEventListener('pointermove', onPointerMove);
    surface.removeEventListener('pointerup', onPointerUp);
    surface.removeEventListener('wheel', onWheel);
    surface.removeEventListener('touchstart', onTouchStart);
    surface.removeEventListener('touchmove', onTouchMove);
    surface.removeEventListener('touchend', onTouchEnd);
    for (const el of labelEls.values()) el.remove();
    labelEls.clear();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // CRITICAL: release the WebGL context. Browsers cap live WebGL contexts
    // (~16 in Chrome); without an explicit loseContext, every closed graph window
    // leaks its context until getContext('webgl') returns null on the next open —
    // at which point createGraph3D bails and the caller drops to the ugly, shell-less
    // 2D fallback. Losing the context here keeps reopens on the real 3D renderer.
    try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (_) { /* ignore */ }
  }

  // Track the sim's settle floor for the idle check.
  sim.alphaMinReached = 0.03;

  let themeObs = null;
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    themeObs = new MutationObserver(() => {
      palette = readEdgePalette(canvas);
      lightMode = readLightMode();
      applyFocusEdges(focusedIdx, focusedIdx >= 0 ? neighborsOf(focusedIdx) : null);
    });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  resize();
  return {
    start: arm,
    resize,
    frameAll,
    focusByName,
    flyToIndex,
    flyToId: (id, opts) => flyToIndex(indexOfId(id), opts),
    frameNode,
    focusIndex,
    setFocus: (idx) => setFocus(idx),
    getCameraState,
    restoreCameraState,
    indexOfId,
    getFocusedNode,
    countDeps,
    getNodes: () => nodes,
    setImplVisibility,
    setLabelDensity,
    setLayout,
    // factor<1 brings the orbit camera closer (zoom in); >1 pulls back (zoom out).
    zoomIn: () => zoomBy(0.8),
    zoomOut: () => zoomBy(1.25),
    dispose,
  };
}
