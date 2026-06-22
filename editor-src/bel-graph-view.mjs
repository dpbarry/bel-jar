// Dependency graph view (local neighborhood + global file scope).


import { getEngine, jumpToRange } from './bel-ide-actions.mjs';
import { dependencyGraph } from './workspace-index.mjs';
import { createFollowWindowAction, registerEditorFollow } from './bel-follow-sync.mjs';
import { computeParseCoverage, formatGlobalGraphStaleBanner } from './bel-ide-status.mjs';
import { createForceSim } from './graph/force-sim.mjs';
import { createGraph3D } from './graph/webgl-graph.mjs';
import { createFlatGraph, renderFlatMini } from './graph/flat-graph.mjs';
import { loadGraphPrefs, saveGraphPrefs, onGraphPrefsChange } from './graph/graph-prefs.mjs';
import {
  buildNavEntry, createNavState, navPush, navBack, navForward, navGoTo,
  navCurrent, navCanBack, navCanForward, fuzzySearchNodes, graphKeyForEntry,
} from './graph/graph-nav.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
let markerSeq = 0;

// The graph snapshot's 'dirty' is a transition log frozen at the last engine
// update — decls that first appeared in the FINAL parse-milestone update stay
// 'dirty' there forever on an idle file. The scheduler queue is the live truth:
// only show churn while it actually has (re)elaboration work for the decl.
function uiStatus(engine, id, status) {
  if (status !== 'dirty') return status;
  const sched = engine.scheduler;
  if (sched && typeof sched.isPending === 'function' && !sched.isPending(id)) return 'stale-known';
  return status;
}

function nodeMeta(engine, id, fallbackName) {
  const snap = engine.getSnapshot && engine.getSnapshot();
  const gnode = snap && snap.graph && snap.graph.nodeMap.get(id);
  if (!gnode) return { id, name: fallbackName || null, namespace: null, label: null, status: 'unknown' };
  return {
    id, name: gnode.name, namespace: gnode.namespace, label: gnode.label,
    status: uiStatus(engine, id, gnode.status), nameRange: gnode.nameRange, fileId: gnode.fileId,
  };
}

// A suite-wide stand-in for the engine's graph API, so the dependency graph can
// show cross-file edges (a proof → its prelude constructors). Same method shape
// the view already calls on the engine; null when there's no project store.
function makeGroupSource(view, engine) {
  const g = typeof window !== 'undefined' ? window : self;
  const P = g.BelJarPersist;
  if (!P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function'
    || typeof P.getActiveFileId !== 'function') {
    return null;
  }
  let graph;
  try {
    const activeId = P.getActiveFileId();
    const getText = (id) => (id === activeId && view?.state?.doc
      ? view.state.doc.toString()
      : String(P.getFileText(id) ?? ''));
    const opts = typeof P.getActiveCfgForDir === 'function'
      ? { activeCfgForDir: (dir) => P.getActiveCfgForDir(dir) } : {};
    graph = dependencyGraph(P.listFiles(), activeId, getText, opts);
  } catch (_) {
    return null;
  }
  if (!graph.nodes || graph.nodes.size === 0) return null;
  const nodeMap = graph.nodes;
  return {
    __group: true,
    scheduler: null,
    dependenciesOf: (id) => graph.dependenciesOf(id),
    dependentsOf: (id) => graph.dependentsOf(id),
    graphFor: () => ({ nodes: [...nodeMap.values()], edges: graph.edges }),
    getSnapshot: () => ({ graph: { nodeMap }, symbols: { symbolsById: nodeMap } }),
    symbolRangeById: (id) => nodeMap.get(id)?.nameRange || null,
    navAt: (pos) => {
      const name = engine && typeof engine.intelSyncAt === 'function'
        ? (engine.intelSyncAt(pos) || {}).name : null;
      if (!name) return null;
      const node = graph.nodeForName(name);
      return node ? { symbolId: node.id, name } : null;
    },
    // Root the graph on a symbol by NAME (cross-file: the def lives in another
    // file, so a position in the active view can't resolve it).
    rootIdForName: (name) => graph.nodeForName(name)?.id || null,
  };
}

export function buildNeighborhood(engine, rootId, { depth = 1 } = {}) {
  if (!engine || !rootId) return null;
  const nodes = new Map();
  const edges = [];
  const seenEdge = new Set();

  const add = (meta, role, d, dir) => {
    if (!nodes.has(meta.id)) nodes.set(meta.id, { ...meta, role, depth: d, dir });
  };
  const pushEdge = (from, to, kind) => {
    const key = `${from}->${to}:${kind}`;
    if (seenEdge.has(key)) return;
    seenEdge.add(key);
    edges.push({ from, to, kind });
  };

  add(nodeMeta(engine, rootId), 'root', 0, 0);
  let frontier = [{ id: rootId, d: 0 }];
  while (frontier.length) {
    const next = [];
    for (const { id, d } of frontier) {
      if (d >= depth) continue;
      for (const dep of engine.dependenciesOf(id)) {
        pushEdge(id, dep.id, dep.kind);
        if (!nodes.has(dep.id)) {
          add(nodeMeta(engine, dep.id, dep.name), 'dependency', d + 1, +1);
          next.push({ id: dep.id, d: d + 1 });
        }
      }
      for (const dep of engine.dependentsOf(id)) {
        pushEdge(dep.id, id, dep.kind);
        if (!nodes.has(dep.id)) {
          add(nodeMeta(engine, dep.id, dep.name), 'dependent', d + 1, -1);
          next.push({ id: dep.id, d: d + 1 });
        }
      }
    }
    frontier = next;
  }
  return demoteNotation({ root: rootId, nodes: [...nodes.values()], edges });
}

export function demoteNotation(model) {
  if (!model || !model.nodes.length) return model;
  const pragmaIds = new Set(model.nodes.filter((n) => n.namespace === 'pragma').map((n) => n.id));
  if (!pragmaIds.size) return model;
  const carriesNotation = new Set();
  for (const e of model.edges) {
    if (pragmaIds.has(e.from) && !pragmaIds.has(e.to)) carriesNotation.add(e.to);
    if (pragmaIds.has(e.to) && !pragmaIds.has(e.from)) carriesNotation.add(e.from);
  }
  const nodes = model.nodes
    .filter((n) => !pragmaIds.has(n.id))
    .map((n) => (carriesNotation.has(n.id) ? { ...n, notation: true } : n));
  const edges = model.edges.filter((e) => !pragmaIds.has(e.from) && !pragmaIds.has(e.to));
  return { ...model, nodes, edges };
}

export function buildGlobalModel(engine) {
  if (!engine || typeof engine.graphFor !== 'function') return { root: null, nodes: [], edges: [] };
  const g = engine.graphFor();
  return demoteNotation({
    root: null,
    nodes: (g.nodes || []).map((n) => ({
      id: n.id, name: n.name, namespace: n.namespace, label: n.label,
      status: uiStatus(engine, n.id, n.status), role: 'node', depth: 0, dir: 0,
    })),
    edges: (g.edges || []).map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
  });
}

const NODE_W = 132;
const NODE_H = 30;
const COL_GAP = 28;
const ROW_GAP = 64;

function edgePath(a, b) {
  const x1 = a.x + a.w / 2;
  const y1 = a.y + a.h;
  const x2 = b.x + b.w / 2;
  const y2 = b.y;
  if (b.y < a.y) {
    const sy1 = a.y, sy2 = b.y + b.h;
    const my = (sy1 + sy2) / 2;
    return `M ${x1} ${sy1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${sy2}`;
  }
  const my = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
}

export function layoutGraph(model, { mode = 'neighborhood' } = {}) {
  if (!model || !model.nodes.length) return { nodes: [], edges: [], width: 0, height: 0 };
  const rowOf = new Map();
  if (mode === 'global') assignGlobalLevels(model, rowOf);
  else for (const n of model.nodes) rowOf.set(n.id, (n.dir || 0) * (n.depth || 0));

  const rows = new Map();
  for (const n of model.nodes) {
    const lvl = rowOf.get(n.id) ?? 0;
    if (!rows.has(lvl)) rows.set(lvl, []);
    rows.get(lvl).push(n);
  }
  const levels = [...rows.keys()].sort((a, b) => a - b);
  const widest = Math.max(...[...rows.values()].map((r) => r.length));
  const totalW = widest * NODE_W + (widest - 1) * COL_GAP;
  const positioned = new Map();

  levels.forEach((lvl, rowIdx) => {
    const row = rows.get(lvl);
    const rowW = row.length * NODE_W + (row.length - 1) * COL_GAP;
    const x0 = (totalW - rowW) / 2;
    row.forEach((n, i) => {
      positioned.set(n.id, { ...n, x: x0 + i * (NODE_W + COL_GAP), y: rowIdx * (NODE_H + ROW_GAP), w: NODE_W, h: NODE_H });
    });
  });

  const nodes = [...positioned.values()];
  const edges = model.edges
    .filter((e) => positioned.has(e.from) && positioned.has(e.to))
    .map((e) => ({ from: e.from, to: e.to, kind: e.kind, path: edgePath(positioned.get(e.from), positioned.get(e.to)) }));
  return { nodes, edges, width: Math.max(totalW, NODE_W), height: levels.length * NODE_H + Math.max(0, levels.length - 1) * ROW_GAP };
}

function assignGlobalLevels(model, rowOf) {
  const out = new Map();
  for (const e of model.edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from).push(e.to);
  }
  const memo = new Map();
  const stack = new Set();
  const levelOf = (id) => {
    if (memo.has(id)) return memo.get(id);
    if (stack.has(id)) return 0;
    stack.add(id);
    let lvl = 0;
    for (const to of out.get(id) || []) lvl = Math.max(lvl, levelOf(to) + 1);
    stack.delete(id);
    memo.set(id, lvl);
    return lvl;
  };
  for (const n of model.nodes) rowOf.set(n.id, levelOf(n.id));
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

const PAD = 16;

export function renderGraph(container, layout, { onJump, interactive = true, fit = false } = {}) {
  container.textContent = '';
  if (!layout.nodes.length) {
    const empty = document.createElement('p');
    empty.className = 'bel-graph-empty';
    empty.textContent = 'No dependencies to graph.';
    container.appendChild(empty);
    return null;
  }

  const svg = svgEl('svg', { class: 'bel-graph-svg' });
  const arrowId = `bel-graph-arrow-${++markerSeq}`;
  const defs = svgEl('defs');
  const marker = svgEl('marker', {
    id: arrowId, viewBox: '0 0 8 8', refX: '7', refY: '4',
    markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse',
  });
  marker.appendChild(svgEl('path', { d: 'M0 0 L8 4 L0 8 z', class: 'bel-graph-arrowhead' }));
  defs.appendChild(marker);
  svg.appendChild(defs);

  const viewport = svgEl('g', { class: 'bel-graph-viewport' });
  svg.appendChild(viewport);

  for (const e of layout.edges) {
    viewport.appendChild(svgEl('path', {
      d: e.path,
      class: `bel-graph-edge bel-graph-edge--${e.kind || 'body'}`,
      'marker-end': `url(#${arrowId})`,
    }));
  }

  for (const n of layout.nodes) {
    const g = svgEl('g', {
      class: `bel-graph-node is-${n.role} status-${statusClass(n.status)}`,
      transform: `translate(${n.x} ${n.y})`, tabindex: '0',
    });
    g.appendChild(svgEl('rect', { width: n.w, height: n.h, rx: '6' }));
    const text = svgEl('text', { x: n.w / 2, y: n.h / 2, 'dominant-baseline': 'central', 'text-anchor': 'middle' });
    text.textContent = n.name || '?';
    if (n.name) g.appendChild(svgEl('title')).textContent = n.label ? `${n.label} ${n.name}` : n.name;
    g.appendChild(text);
    if (onJump) {
      const fire = () => onJump(n);
      g.addEventListener('click', fire);
      g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fire(); } });
    }
    viewport.appendChild(g);
  }

  container.appendChild(svg);
  const view = { x: PAD, y: PAD, scale: 1 };
  const apply = () => viewport.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.scale})`);

  function fitAll() {
    const cw = container.clientWidth || 320;
    const ch = container.clientHeight || 280;
    const sx = (cw - PAD * 2) / Math.max(layout.width, 1);
    const sy = (ch - PAD * 2) / Math.max(layout.height, 1);
    view.scale = Math.min(1, Math.min(sx, sy));
    view.x = (cw - layout.width * view.scale) / 2;
    view.y = (ch - layout.height * view.scale) / 2;
    apply();
  }

  if (fit) requestAnimationFrame(fitAll);
  else apply();

  if (interactive) {
    svg.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const rect = svg.getBoundingClientRect();
      const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
      const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
      const ns = Math.min(2.5, Math.max(0.1, view.scale * factor));
      view.x = px - (px - view.x) * (ns / view.scale);
      view.y = py - (py - view.y) * (ns / view.scale);
      view.scale = ns;
      apply();
    }, { passive: false });

    let pan = null;
    svg.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('.bel-graph-node')) return;
      pan = { px: ev.clientX, py: ev.clientY, x0: view.x, y0: view.y, id: ev.pointerId };
      svg.setPointerCapture(ev.pointerId);
      svg.classList.add('is-panning');
    });
    svg.addEventListener('pointermove', (ev) => {
      if (!pan) return;
      view.x = pan.x0 + (ev.clientX - pan.px);
      view.y = pan.y0 + (ev.clientY - pan.py);
      apply();
    });
    const endPan = () => { pan = null; svg.classList.remove('is-panning'); };
    svg.addEventListener('pointerup', endPan);
    svg.addEventListener('pointercancel', endPan);
  }
  return { svg, fitAll };
}

function jumpToNode(view, engine, node) {
  const range = node.nameRange
    || (typeof engine.symbolRangeById === 'function' ? engine.symbolRangeById(node.id) : null);
  if (!range) return;
  // Cross-file node → open its file at the definition; same-file → flash-jump.
  const g = typeof window !== 'undefined' ? window : self;
  const activeId = g.BelJarPersist?.getActiveFileId?.();
  if (node.fileId && activeId && node.fileId !== activeId && typeof g.dispatchEvent === 'function') {
    g.dispatchEvent(new CustomEvent('beljar:open-file-at', {
      detail: { fileId: node.fileId, from: range.from, to: range.to, name: node.name },
    }));
    return;
  }
  jumpToRange(view, range);
}

const openGraphWindows = new Map();

function syncFollowFromEditor(view, engine, win, ctx) {
  if (!ctx.followEditor || ctx._followFromGraph || ctx._navRestoring) return;
  const ctrl = win._graph3d;
  if (!ctrl) return;
  const id = rootIdAt(engine, view, view.state.selection.main.head);
  if (!id) return;

  const cur = navCurrent(win._graphNav);
  if (!cur) return;

  ctx._followSyncing = true;
  try {
    if (cur.mode === 'global') {
      const idx = ctrl.indexOfId(id);
      if (idx < 0) return;
      ctrl.flyToIndex(idx, { animate: true, spotlight: true, tight: true });
      ctx.selectedNodeId = id;
      reflectPropSelection(ctx.propBar, ctx, ctrl);
      ctx.toolbar?.syncFocus?.(ctrl.getNodes()[idx], idx);
    } else if (cur.rootId === id) {
      ctrl.frameNode(id, { animate: true });
    } else {
      drillGraph(view, engine, win, ctx, id, { push: false });
    }
  } finally {
    ctx._followSyncing = false;
  }
}

function jumpOnGraphActivate(ctx, view, engine, node) {
  if (!ctx.followEditor || ctx._followFromGraph) return;
  ctx._followFromGraph = true;
  jumpToNode(view, engine, node);
  queueMicrotask(() => { ctx._followFromGraph = false; });
}

const GRAPH_SETTINGS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" '
  + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<g transform="translate(12 12) scale(1.08) translate(-12 -12)">'
  + '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>'
  + '<circle cx="12" cy="12" r="3"/></g></svg>';

let graphSettingsDialog = null;
const graphSettingsFields = {};

function createGraphPrefDropdown(options, currentValue, onChange) {
  let selected = currentValue;
  let focusedIdx = -1;
  const optionEls = [];

  const container = document.createElement('div');
  container.className = 'bj-dropdown';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'bj-dropdown__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const valueSpan = document.createElement('span');
  valueSpan.className = 'bj-dropdown__value';

  const chevronEl = document.createElement('span');
  chevronEl.className = 'bj-dropdown__chevron';
  chevronEl.setAttribute('aria-hidden', 'true');
  chevronEl.innerHTML = '<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  trigger.append(valueSpan, chevronEl);

  const panel = document.createElement('div');
  panel.className = 'bj-dropdown__panel';
  panel.setAttribute('role', 'listbox');

  for (const [idx, opt] of options.entries()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bj-dropdown__option';
    btn.setAttribute('role', 'option');
    btn.dataset.value = opt.value;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = opt.label;

    const checkEl = document.createElement('span');
    checkEl.className = 'bj-dropdown__option-check';
    checkEl.setAttribute('aria-hidden', 'true');
    checkEl.innerHTML = '<svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4.5 8L10 1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    btn.append(labelSpan, checkEl);
    btn.addEventListener('mouseenter', () => { focusedIdx = idx; updateFocus(); });
    btn.addEventListener('click', () => {
      if (opt.value !== selected) { setValue(opt.value); onChange(opt.value); }
      close();
    });
    panel.appendChild(btn);
    optionEls.push(btn);
  }

  container.appendChild(trigger);

  function updateFocus() {
    optionEls.forEach((el, i) => el.classList.toggle('is-focused', i === focusedIdx));
  }

  function setValue(val) {
    selected = val;
    const opt = options.find((o) => o.value === val);
    valueSpan.textContent = opt ? opt.label : val;
    optionEls.forEach((el) => el.classList.toggle('is-selected', el.dataset.value === val));
  }

  function reposition() {
    if (!panel.classList.contains('is-open')) return;
    const g = typeof window !== 'undefined' ? window : self;
    if (!g.FloatingRectPlacement) return;
    const rect = trigger.getBoundingClientRect();
    const pos = g.FloatingRectPlacement.computePosition({
      anchor: rect,
      width: panel.offsetWidth,
      height: panel.offsetHeight,
      mode: 'menu',
      side: 'bottom',
      align: 'end',
      gap: 4,
      margin: 8,
    });
    panel.style.top = pos.y + 'px';
    panel.style.left = pos.x + 'px';
  }

  function open() {
    let el = container.parentElement;
    while (el && el.tagName !== 'DIALOG') el = el.parentElement;
    const mountEl = el || document.body;
    if (panel.parentElement !== mountEl) mountEl.appendChild(panel);

    panel.style.visibility = 'hidden';
    panel.style.display = 'block';
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    panel.style.display = '';
    panel.style.visibility = '';

    const g = typeof window !== 'undefined' ? window : self;
    const rect = trigger.getBoundingClientRect();
    const pos = g.FloatingRectPlacement?.computePosition({
      anchor: rect,
      width: pw,
      height: ph,
      mode: 'menu',
      side: 'bottom',
      align: 'end',
      gap: 4,
      margin: 8,
    }) ?? { x: rect.left, y: rect.bottom + 4 };
    panel.style.top = pos.y + 'px';
    panel.style.left = pos.x + 'px';

    container.classList.add('is-open');
    panel.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    focusedIdx = options.findIndex((o) => o.value === selected);
    updateFocus();
  }

  function close() {
    container.classList.remove('is-open');
    panel.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
  }

  trigger.addEventListener('click', () => {
    if (container.classList.contains('is-open')) close(); else open();
  });

  trigger.addEventListener('keydown', (e) => {
    const isOpen = container.classList.contains('is-open');
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusedIdx = Math.min(focusedIdx + 1, options.length - 1); updateFocus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusedIdx = Math.max(focusedIdx - 1, 0); updateFocus(); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (focusedIdx >= 0) {
        const o = options[focusedIdx];
        if (o.value !== selected) { setValue(o.value); onChange(o.value); }
        close();
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (container.classList.contains('is-open') && !container.contains(e.target) && !panel.contains(e.target)) close();
  });

  setValue(currentValue);
  return { element: container, setValue };
}

const NUMERIC_PREF_KEYS = new Set(['depth', 'labelDensity']);

function addGraphSettingDropdown(parent, labelText, descText, options, key) {
  const prefs = loadGraphPrefs();
  const current = NUMERIC_PREF_KEYS.has(key) ? String(prefs[key]) : prefs[key];
  const row = document.createElement('div');
  row.className = 'bj-dialog__setting';
  const main = document.createElement('div');
  main.className = 'bj-dialog__setting-main';
  const label = document.createElement('span');
  label.className = 'bj-dialog__setting-label';
  label.textContent = labelText;
  const desc = document.createElement('span');
  desc.className = 'bj-dialog__setting-desc';
  desc.textContent = descText;
  main.append(label, desc);
  const dd = createGraphPrefDropdown(options, current, (val) => {
    saveGraphPrefs(NUMERIC_PREF_KEYS.has(key) ? { [key]: parseInt(val, 10) || 1 } : { [key]: val });
  });
  row.append(main, dd.element);
  parent.appendChild(row);
  graphSettingsFields[key] = dd;
  return dd;
}

function syncGraphSettingsFields() {
  const prefs = loadGraphPrefs();
  const numericKeys = new Set(['depth', 'labelDensity']);
  for (const [key, dd] of Object.entries(graphSettingsFields)) {
    if (dd?.setValue && prefs[key] != null) {
      dd.setValue(numericKeys.has(key) ? String(prefs[key]) : prefs[key]);
    }
  }
}

function ensureGraphSettingsDialog() {
  if (graphSettingsDialog) return graphSettingsDialog;
  const g = typeof window !== 'undefined' ? window : self;
  if (typeof g.BelJarDialog === 'undefined') return null;

  const shell = document.createElement('div');
  shell.className = 'bj-settings bj-settings--solo';

  const main = document.createElement('div');
  main.className = 'bj-settings__main';

  const panel = document.createElement('div');
  panel.className = 'bj-settings__panel is-active';

  const body = document.createElement('div');
  body.className = 'bj-settings__panel-body';

  addGraphSettingDropdown(
    body,
    'View',
    '3D galaxy or a flat layered diagram.',
    [{ value: 'force', label: '3D' }, { value: 'flat', label: 'Flat' }],
    'layout',
  );
  addGraphSettingDropdown(
    body,
    'Implementation edges',
    'Body edges link symbols to their implementation detail.',
    [{ value: 'show', label: 'Show edges' }, { value: 'hide', label: 'Hide edges' }],
    'impl',
  );
  addGraphSettingDropdown(
    body,
    'Neighborhood depth',
    'Default hop count when exploring a symbol\'s local graph (1–3).',
    [{ value: '1', label: '1 hop' }, { value: '2', label: '2 hops' }, { value: '3', label: '3 hops' }],
    'depth',
  );
  addGraphSettingDropdown(
    body,
    'Label density',
    'How many node labels are shown. Small graphs always show all labels regardless.',
    [
      { value: '1', label: 'None' },
      { value: '2', label: 'Sparse' },
      { value: '3', label: 'Normal' },
      { value: '4', label: 'Dense' },
      { value: '5', label: 'All' },
    ],
    'labelDensity',
  );
  panel.appendChild(body);
  main.appendChild(panel);
  shell.appendChild(main);

  graphSettingsDialog = g.BelJarDialog.createDialog({
    title: 'Dependency graph settings',
    content: shell,
    cardClass: 'bj-dialog__card--settings-compact',
    removeOnClose: false,
  });
  return graphSettingsDialog;
}

function openGraphSettingsDialog() {
  ensureGraphSettingsDialog();
  syncGraphSettingsFields();
  const g = typeof window !== 'undefined' ? window : self;
  if (graphSettingsDialog && g.BelJarDialog) g.BelJarDialog.openDialog(graphSettingsDialog);
}

// Flat and 3D cameras are incompatible shapes — only restore when the saved
// state matches the renderer being mounted.
function cameraForLayout(cam, layout) {
  if (!cam) return null;
  const wantFlat = layout === 'flat';
  return !!cam.flat === wantFlat ? cam : null;
}

function applyGraphPrefsToWindow(win, prefs = loadGraphPrefs()) {
  win._graphDepth = prefs.depth;
  const bundle = win._graphBundle;
  if (!bundle) return;
  const { view, engine, ctx } = bundle;
  ctx.sidebar?.setCollapsed?.(prefs.sidebarCollapsed, { save: false });
  const cur = navCurrent(win._graphNav);

  // Force ↔ flat are now two different renderers (WebGL galaxy vs. 2D SVG diagram),
  // so a layout change re-mounts rather than morphing one controller in place.
  if (win._graph3d && win._graphAppliedLayout !== prefs.layout) {
    const cur = navCurrent(win._graphNav);
    if (cur && win._graph3d.getCameraState) {
      cur.camera = win._graph3d.getCameraState();
      win._graphNav.stack[win._graphNav.index] = { ...cur };
    }
    win._graphAppliedLayout = prefs.layout;
    navigateGraph(view, engine, win, ctx, navCurrent(win._graphNav), { push: false });
    return;
  }

  if (win._graph3d) {
    win._graph3d.setImplVisibility(prefs.impl);
    win._graph3d.setLabelDensity?.(prefs.labelDensity ?? 3);
  }

  if (cur?.mode !== 'neighborhood') return;

  const stackDepth = cur.depth || 1;
  if (stackDepth !== prefs.depth) {
    win._graphNav.stack[win._graphNav.index] = { ...cur, depth: prefs.depth };
  }

  if (win._graph3d && stackDepth !== prefs.depth) {
    navigateGraph(
      view, engine, win, ctx,
      buildNavEntry({ mode: 'neighborhood', rootId: cur.rootId, depth: prefs.depth }),
      { push: false },
    );
  } else if (!win._graph3d) {
    ctx.model = buildNeighborhood(engine, cur.rootId, { depth: prefs.depth }) || ctx.model;
  }

  ctx.toolbar?.syncNavMode?.(win._graphNav);
}

function applyGraphPrefsToAll(prefs) {
  for (const win of openGraphWindows.values()) applyGraphPrefsToWindow(win, prefs);
}

onGraphPrefsChange(applyGraphPrefsToAll);

function rootIdAt(engine, view, pos) {
  if (typeof engine.navAt !== 'function') return null;
  const nav = engine.navAt(pos);
  if (!nav || !nav.symbolId) return null;
  const snap = engine.getSnapshot && engine.getSnapshot();
  const sym = snap && snap.symbols && snap.symbols.symbolsById
    ? snap.symbols.symbolsById.get(nav.symbolId) : null;
  if (sym && sym.namespace === 'pragma') return null;
  return nav.symbolId;
}

function nameForId(engine, id) {
  return nodeMeta(engine, id).name || 'symbol';
}

function collectGlobalGraphMeta(view, engine) {
  const snap = engine.getSnapshot?.() || null;
  const parseCoverage = view ? computeParseCoverage(view.state) : null;
  return {
    parseCoverage,
    symbolCount: snap?.summary?.symbols ?? snap?.symbols?.globalSymbols?.length ?? modelSymbolCount(engine),
  };
}

function modelSymbolCount(engine) {
  return engine.graphFor?.()?.nodes?.length ?? 0;
}

function makeStaleBanner(text) {
  if (!text) return null;
  const el = document.createElement('div');
  el.className = 'bel-graph-stale-banner';
  el.setAttribute('role', 'status');
  el.textContent = text;
  return el;
}

function graphWindowTitle(parseNote = '') {
  const t = document.createElement('span');
  t.className = 'bel-graph-title-name';
  t.textContent = parseNote ? `Dependency graph (${parseNote})` : 'Dependency graph';
  return t;
}

function viewMetaFor(engine, model, mode, depth = 1, { view } = {}) {
  const meta = {
    mode,
    depth,
    symbolCount: model?.nodes?.length ?? 0,
    edgeCount: model?.edges?.length ?? 0,
    rootName: model?.root ? nameForId(engine, model.root) : null,
  };
  if (mode === 'global' && model) {
    let sigEdges = 0;
    let bodyEdges = 0;
    for (const e of model.edges || []) {
      if (e.kind === 'body') bodyEdges++;
      else sigEdges++;
    }
    meta.sigEdges = sigEdges;
    meta.bodyEdges = bodyEdges;
    if (view) {
      const cov = computeParseCoverage(view.state);
      if (!cov.complete) meta.parsePercent = cov.percent;
    }
  }
  return meta;
}

function reflectPropBarIdle(propBar, ctx) {
  if (ctx.viewMeta?.mode === 'global') propBar?.showContext?.(ctx.viewMeta);
  else propBar?.showIdle?.();
}

function reflectPropSelection(propBar, ctx, ctrl) {
  const id = ctx.selectedNodeId;
  if (!id || !ctrl) {
    reflectPropBarIdle(propBar, ctx);
    return;
  }
  const idx = ctrl.indexOfId(id);
  if (idx < 0) {
    reflectPropBarIdle(propBar, ctx);
    return;
  }
  const node = ctrl.getNodes()[idx];
  if (!node) {
    reflectPropBarIdle(propBar, ctx);
    return;
  }
  ctrl.setFocus(idx);
  propBar.showFocus(node, idx, ctrl);
}

function clearPropSelection(propBar, ctx, ctrl) {
  const cur = navCurrent(ctx.win?._graphNav);
  if (cur?.mode === 'neighborhood') return; // no deselected state in local view
  ctx.selectedNodeId = null;
  ctrl?.setFocus?.(-1);
  reflectPropBarIdle(propBar, ctx);
}

export function formatPropContext(meta) {
  if (!meta) return '';
  if (meta.mode === 'global') {
    const parts = [`${meta.edgeCount} edges`, `${meta.sigEdges} sig`, `${meta.bodyEdges} body`];
    if (meta.parsePercent != null) parts.push(`parse ${meta.parsePercent}%`);
    return parts.join(' · ');
  }
  const hop = `${meta.depth || 1}-hop`;
  if (meta.rootName) return `${meta.rootName} · ${hop} neighborhood`;
  return `${hop} neighborhood`;
}

export function formatPropFocus(node, idx, ctrl) {
  const counts = ctrl?.countDeps?.(idx) || { deps: 0, dependents: 0 };
  const parts = [node.name || '?'];
  if (node.label) parts.push(node.label);
  parts.push(`${counts.dependents} used by`, `${counts.deps} deps`);
  return parts.join(' · ');
}

const ICONS = {
  force: '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>'
    + '<path d="M12 7v4m0 0-5.5 6m5.5-6 5.5 6"/>',
  flat: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  reset: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>'
    + '<path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/>',
  body: '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>'
    + '<path d="M18 9a9 9 0 0 1-9 9"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  forward: '<path d="m9 18 6-6-6-6"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>'
    + '<line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  explore: '<circle cx="10" cy="10" r="8.5"/><path d="m19.5 19.5-4-4"/>'
    + '<path d="M10 7v6"/><path d="M7 10h6"/>',
  global: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
};

function iconSvg(name) {
  const join = 'round';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
    + `stroke-linecap="round" stroke-linejoin="${join}" aria-hidden="true">` + ICONS[name] + '</svg>';
}

function setTip(el, text) {
  const g = typeof window !== 'undefined' ? window : self;
  if (g.Tooltips?.set) g.Tooltips.set(el, text);
  else if (text) {
    el.removeAttribute('title');
    el.setAttribute('data-tooltip', text);
    el.setAttribute('aria-label', text);
    g.Tooltips?.bind?.(el);
  }
}

function iconButton(name, title) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'bel-graph3d-iconbtn';
  b.innerHTML = iconSvg(name);
  setTip(b, title);
  return b;
}

function bareNavBtn(name, title) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'bel-graph3d-navbtn';
  b.innerHTML = iconSvg(name);
  setTip(b, title);
  return b;
}

function buildGraphPropBar() {
  const el = document.createElement('div');
  el.className = 'bel-graph3d-propbar';
  const text = document.createElement('div');
  text.className = 'bel-graph3d-propbar-text';
  const nav = document.createElement('div');
  nav.className = 'bel-graph3d-propbar-nav';
  const backBtn = bareNavBtn('back', 'Back (Alt+←)');
  const forwardBtn = bareNavBtn('forward', 'Forward (Alt+→)');
  nav.append(backBtn, forwardBtn);
  el.append(text, nav);
  return {
    el,
    wire({ onBack, onForward }) {
      backBtn.addEventListener('click', () => onBack?.());
      forwardBtn.addEventListener('click', () => onForward?.());
    },
    updateNav(navState) {
      backBtn.disabled = !navCanBack(navState);
      forwardBtn.disabled = !navCanForward(navState);
    },
    showIdle() {
      text.textContent = '';
      text.classList.remove('is-focus');
    },
    showContext(meta) {
      text.textContent = formatPropContext(meta);
      text.classList.add('is-focus');
    },
    showFocus(node, idx, ctrl) {
      text.textContent = formatPropFocus(node, idx, ctrl);
      text.classList.add('is-focus');
    },
  };
}

function buildGraphToolbar({ sidebar } = {}) {
  const el = document.createElement('div');
  el.className = 'bel-graph3d-toolbar';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'bel-graph3d-search-wrap';
  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'bel-graph3d-search';
  search.placeholder = 'Search…';
  search.setAttribute('autocomplete', 'off');
  const acList = document.createElement('div');
  acList.className = 'bel-graph3d-autocomplete';
  acList.hidden = true;
  searchWrap.append(search, acList);

  const scopeBtn = iconButton('global', 'Whole-file graph');
  scopeBtn.classList.add('bel-graph3d-scopebtn');
  const resetBtn = iconButton('reset', 'Reset view');
  const zoomOutBtn = iconButton('minus', 'Zoom out');
  const zoomInBtn = iconButton('plus', 'Zoom in');

  el.append(searchWrap, scopeBtn, resetBtn, zoomOutBtn, zoomInBtn);

  let nodes = [], nodeHandlers = null, acPick = -1, lastFilter = '';
  let ctrlRef = () => null;
  let scopeMode = 'global'; // 'global' btn → escape to file; 'explore' btn → drill in

  function reflectScopeBtn(isGlobal) {
    scopeMode = isGlobal ? 'explore' : 'global';
    scopeBtn.innerHTML = iconSvg(scopeMode);
    setTip(scopeBtn, isGlobal ? 'Open neighborhood view' : 'Whole-file graph');
  }

  function reflectActions() {
    const on = !!ctrlRef()?.getFocusedNode?.()?.node;
    scopeBtn.disabled = scopeMode === 'explore' && !on;
  }

  function nodeFromAcItem(item) {
    if (!item) return null;
    const id = item.dataset.id;
    if (id) {
      const byId = nodes.find((n) => String(n.id) === id);
      if (byId) return byId;
    }
    const name = item.dataset.name;
    return name ? nodes.find((n) => n.name === name) || null : null;
  }

  function resolveSearchNode(nodeOrName) {
    if (nodeOrName && typeof nodeOrName === 'object') return nodeOrName;
    const name = (nodeOrName || '').trim();
    return name ? nodes.find((n) => n.name === name) || null : null;
  }

  function clearSearch() {
    search.value = '';
    lastFilter = '';
    acList.hidden = true;
    acPick = -1;
    sidebar?.render(nodes, lastFilter, nodeHandlers);
    el.classList.remove('is-search-expanded');
    search.blur();
  }

  function jumpToSearch(nodeOrName) {
    if (nodeOrName && typeof nodeOrName === 'object') {
      const ctrl = ctrlRef();
      if (!ctrl) return false;
      const idx = ctrl.indexOfId?.(nodeOrName.id) ?? -1;
      if (idx < 0) return false;
      ctrl.flyToIndex(idx, { animate: true });
      return true;
    }
    const name = (nodeOrName || '').trim();
    if (!name) return false;
    const exact = resolveSearchNode(name);
    if (exact) return jumpToSearch(exact);
    return !!ctrlRef()?.focusByName?.(name);
  }

  function pickSearch(nodeOrName) {
    if (!jumpToSearch(nodeOrName)) return;
    clearSearch();
  }

  function renderAc(query) {
    const hits = fuzzySearchNodes(nodes, query);
    acList.textContent = '';
    if (!query.trim() || !hits.length) { acList.hidden = true; acPick = -1; return; }
    acList.hidden = false;
    hits.forEach((n, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'bel-graph3d-ac-item';
      row.dataset.name = n.name || '';
      if (n.id != null) row.dataset.id = String(n.id);
      row.textContent = n.name || '?';
      row.addEventListener('mousedown', (ev) => ev.preventDefault());
      row.addEventListener('click', (ev) => { ev.preventDefault(); pickSearch(n); });
      if (i === acPick) row.classList.add('is-active');
      acList.appendChild(row);
    });
  }

  return {
    el,
    focusSearch: () => search.focus(),
    syncNodes(nodeList, handlers) {
      nodes = nodeList || [];
      nodeHandlers = handlers;
      sidebar?.setCount?.(nodes.length);
      sidebar?.render(nodes, lastFilter, handlers);
    },
    syncFocus(node) {
      sidebar?.highlight?.(node?.id);
      sidebar?.render(nodes, lastFilter, nodeHandlers);
      reflectActions();
    },
    syncNavMode(navState) {
      const cur = navCurrent(navState);
      reflectScopeBtn(cur?.mode === 'global');
      reflectActions();
    },
    wire(getCtrl, { onReset, onExplore, onGlobal } = {}) {
      ctrlRef = getCtrl;
      reflectActions();
      search.addEventListener('input', () => {
        lastFilter = search.value;
        renderAc(search.value);
        sidebar?.render(nodes, lastFilter, nodeHandlers);
      });
      search.addEventListener('keydown', (ev) => {
        const items = acList.querySelectorAll('.bel-graph3d-ac-item');
        if (ev.key === 'ArrowDown' && items.length) { ev.preventDefault(); acPick = Math.min(items.length - 1, acPick + 1); renderAc(search.value); }
        else if (ev.key === 'ArrowUp' && items.length) { ev.preventDefault(); acPick = Math.max(0, acPick - 1); renderAc(search.value); }
        else if (ev.key === 'Enter') {
          if (acPick >= 0 && items[acPick]) pickSearch(nodeFromAcItem(items[acPick]));
          else pickSearch(search.value);
        } else if (ev.key === 'Escape') { acList.hidden = true; search.blur(); }
      });
      const scrollAc = (ev) => {
        if (acList.hidden) return;
        ev.preventDefault();
        ev.stopPropagation();
        acList.scrollTop += ev.deltaY;
      };
      // Keep focus in the search field when clicking items or the list scrollbar.
      acList.addEventListener('mousedown', (ev) => { ev.preventDefault(); });
      acList.addEventListener('wheel', scrollAc, { passive: false });
      searchWrap.addEventListener('wheel', scrollAc, { passive: false });
      search.addEventListener('focus', () => el.classList.add('is-search-expanded'));
      search.addEventListener('blur', () => {
        setTimeout(() => {
          if (searchWrap.contains(document.activeElement)) return;
          el.classList.remove('is-search-expanded');
          acList.hidden = true;
        }, 120);
      });

      scopeBtn.addEventListener('click', () => {
        if (scopeMode === 'explore') {
          const f = ctrlRef()?.getFocusedNode?.();
          if (f?.node) onExplore?.(f.node, f.idx);
        } else {
          onGlobal?.();
        }
      });

      resetBtn.addEventListener('click', () => {
        // onReset owns the framing decision (it knows the nav mode + selection):
        // global+selection → re-center on the node; otherwise reset to fit-all.
        onReset?.();
        reflectActions();
      });
      zoomOutBtn.addEventListener('click', () => ctrlRef()?.zoomOut?.());
      zoomInBtn.addEventListener('click', () => ctrlRef()?.zoomIn?.());
    },
  };
}

function buildGraphSidebar({ onLayoutChange } = {}) {
  const el = document.createElement('aside');
  el.className = 'bel-graph3d-sidebar';
  const head = document.createElement('div');
  head.className = 'bel-graph3d-sidebar-head';
  const headLabel = document.createElement('span');
  headLabel.className = 'bel-graph3d-sidebar-head-label';
  headLabel.textContent = 'Symbols (0)';
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'bel-graph3d-sidebar-toggle';
  collapseBtn.innerHTML = iconSvg('back');
  setTip(collapseBtn, 'Collapse symbol list');
  head.append(headLabel, collapseBtn);
  const list = document.createElement('div');
  list.className = 'bel-graph3d-sidebar-list';
  el.append(head, list);

  let collapsed = !!loadGraphPrefs().sidebarCollapsed;
  function reflectCollapse({ save = true } = {}) {
    el.classList.toggle('is-collapsed', collapsed);
    collapseBtn.innerHTML = iconSvg(collapsed ? 'forward' : 'back');
    setTip(collapseBtn, collapsed ? 'Expand symbol list' : 'Collapse symbol list');
    if (save) saveGraphPrefs({ sidebarCollapsed: collapsed });
    onLayoutChange?.();
  }
  function setCollapsed(next, { save = true } = {}) {
    const v = !!next;
    if (collapsed === v) return;
    collapsed = v;
    reflectCollapse({ save });
  }
  collapseBtn.addEventListener('click', () => { collapsed = !collapsed; reflectCollapse(); });
  reflectCollapse({ save: false });

  let handlers = null, hiId = null;
  function render(nodes, filter, h) {
    handlers = h || handlers;
    list.textContent = '';
    const q = (filter || '').trim().toLowerCase();
    const sorted = [...(nodes || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const items = sorted.filter((n) => !q || (n.name || '').toLowerCase().includes(q));
    for (const n of items) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'bel-graph3d-sidebar-item' + (n.id === hiId ? ' is-active' : '') + (n.role === 'root' ? ' is-root' : '');
      row.textContent = n.name || '?';
      row.addEventListener('click', () => handlers?.onPick?.(n));
      row.addEventListener('dblclick', (ev) => { ev.preventDefault(); handlers?.onJump?.(n); });
      list.appendChild(row);
    }
  }
  return {
    el,
    setCount(n) { headLabel.textContent = `Symbols (${n})`; },
    setCollapsed,
    render, highlight(id) { hiId = id; }, toggle() { setCollapsed(!collapsed); },
  };
}

// Initial camera after a (re)mount: keep the selected node in view when one is
// pinned; only fit-all when global view has no selection.
function globalFocusLeavingLocal(cur, ctx) {
  if (cur?.mode === 'neighborhood') return cur.rootId ?? ctx.selectedNodeId ?? null;
  return ctx.selectedNodeId ?? null;
}

function syncNavEntryFromView(win, ctx) {
  const cur = navCurrent(win._graphNav);
  const ctrl = win._graph3d;
  if (!cur || !ctrl?.getCameraState) return;
  const snap = { ...cur, camera: ctrl.getCameraState() };
  if (cur.mode === 'global') snap.focusId = ctx.selectedNodeId ?? cur.focusId ?? null;
  win._graphNav.stack[win._graphNav.index] = snap;
}

function snapshotGlobalNavCamera(win, ctx, ctrl) {
  const cur = navCurrent(win._graphNav);
  if (!cur || cur.mode !== 'global' || cur.focusId == null || !ctrl?.getCameraState) return;
  win._graphNav.stack[win._graphNav.index] = {
    ...cur,
    focusId: cur.focusId,
    camera: ctrl.getCameraState(),
  };
}

function recordGlobalFocusNav(win, ctx, prevFocusId, nextFocusId) {
  if (ctx._navRestoring) return;
  const cur = navCurrent(win._graphNav);
  if (cur?.mode !== 'global') return;
  const prev = prevFocusId ?? null;
  const next = nextFocusId ?? null;
  if (prev === next) return;

  const ctrl = win._graph3d;
  const leaving = {
    ...cur,
    focusId: prev,
    camera: ctrl?.getCameraState?.() ?? cur.camera,
  };
  win._graphNav.stack[win._graphNav.index] = leaving;
  win._graphNav = navPush(win._graphNav, buildNavEntry({ mode: 'global', focusId: next }));
  ctx.propBar?.updateNav?.(win._graphNav);
}

function applyGlobalNavEntry(win, ctx, entry, { animate = false } = {}) {
  ctx._navRestoring = true;
  try {
    ctx.selectedNodeId = entry.focusId ?? null;
    const ctrl = win._graph3d;
    if (!ctrl) return;
    const cam = cameraForLayout(entry.camera, win._graphAppliedLayout ?? loadGraphPrefs().layout);
    if (cam) {
      ctrl.restoreCameraState(cam, { animate });
    } else if (entry.focusId != null) {
      const idx = ctrl.indexOfId(entry.focusId);
      if (idx >= 0) ctrl.flyToIndex(idx, { animate, spotlight: true, tight: true });
      else ctrl.setFocus(-1);
    } else {
      ctrl.setFocus(-1);
    }
    const fidx = entry.focusId != null ? ctrl.indexOfId(entry.focusId) : -1;
    if (fidx >= 0) ctx.propBar?.showFocus?.(ctrl.getNodes()[fidx], fidx, ctrl);
    else reflectPropBarIdle(ctx.propBar, ctx);
    ctx.toolbar?.syncFocus?.(fidx >= 0 ? ctrl.getNodes()[fidx] : null, fidx);
    ctx.propBar?.updateNav?.(win._graphNav);
    ctx.toolbar?.syncNavMode?.(win._graphNav);
  } finally {
    ctx._navRestoring = false;
  }
}

function applyNavFromStack(view, engine, win, ctx) {
  const entry = navCurrent(win._graphNav);
  if (!entry) return;
  if (entry.mode === 'global' && ctx.mode === 'global' && win._graph3d) {
    applyGlobalNavEntry(win, ctx, entry, { animate: true });
    return;
  }
  navigateGraph(view, engine, win, ctx, entry, { push: false });
}

function frameInitialView(ctrl, ctx, model, mode) {
  const id = ctx.selectedNodeId;
  if (id != null) {
    const idx = ctrl.indexOfId(id);
    if (idx >= 0) {
      ctrl.flyToIndex(idx, { animate: false, spotlight: true, tight: true });
      return;
    }
  }
  if (mode === 'neighborhood' && model.root) {
    ctrl.frameNode(model.root, { animate: false });
    return;
  }
  ctrl.frameAll({ animate: false });
}

function mountGraph3DRenderer(view, engine, ctx) {
  const { win, canvas, labels, toolbar, model, mode, propBar, restoreCamera } = ctx;
  const prefs = loadGraphPrefs();
  const stage = canvas.parentElement;

  ctx.viewMeta = viewMetaFor(engine, model, mode, navCurrent(win._graphNav)?.depth || win._graphDepth || prefs.depth, { view });

  const drill = (node) => drillGraph(view, engine, win, ctx, node.id);
  const fly = (node, idx) => win._graph3d?.flyToIndex(idx, { animate: true });
  // win._graph3d isn't assigned until mount returns, so focus callbacks that fire
  // before then read the controller back through ctx._mountingCtrl.
  const onBeforeFocusChange = (prevIdx, nextIdx) => {
    if (ctx._navRestoring || ctx._followSyncing || mode !== 'global') return;
    const prevId = prevIdx >= 0 ? model.nodes[prevIdx]?.id : null;
    const nextId = nextIdx >= 0 ? model.nodes[nextIdx]?.id : null;
    recordGlobalFocusNav(win, ctx, prevId, nextId);
  };
  const onFocus = (node, idx) => {
    ctx.selectedNodeId = node?.id ?? null;
    if (node) propBar?.showFocus?.(node, idx, win._graph3d || ctx._mountingCtrl);
    else reflectPropBarIdle(propBar, ctx);
    toolbar?.syncFocus?.(node, idx);
  };

  const onActivate = (node) => jumpOnGraphActivate(ctx, view, engine, node);

  let ctrl;

  // The flat view is its own 2D SVG renderer with an x/y camera — not the galaxy
  // seen head-on. It hides the WebGL canvas/labels and draws an SVG into the stage.
  if (prefs.layout === 'flat') {
    stage.classList.add('is-flat');
    canvas.style.display = 'none';
    labels.style.display = 'none';
    ctrl = createFlatGraph(stage, model, null, {
      implVisibility: prefs.impl,
      skipInitialFrame: true,
      onJump: (node) => jumpToNode(view, engine, node),
      onDrill: mode === 'neighborhood' ? drill : null,
      onFly: fly,
      onActivate,
      onBeforeFocusChange,
      onFocus,
    });
  } else {
    stage.classList.remove('is-flat');
    canvas.style.display = '';
    labels.style.display = '';
    const sim = createForceSim(model, { seed: 0x1234 });
    sim.step(mode === 'global' ? 160 : 90);
    ctrl = createGraph3D(canvas, sim, {
      labelLayer: labels,
      implVisibility: prefs.impl,
      labelDensity: prefs.labelDensity ?? 3,
      viewMode: mode,
      onJump: (node) => jumpToNode(view, engine, node),
      onDrill: mode === 'neighborhood' ? drill : null,
      onFly: fly,
      onActivate,
      onBeforeFocusChange,
      onFocus,
    });
  }
  ctx._mountingCtrl = ctrl;
  if (!ctrl) return null;

  win._graphAppliedLayout = prefs.layout;
  ctrl.setImplVisibility(prefs.impl);

  toolbar.syncNodes?.(ctrl.getNodes(), {
    onPick: (node) => {
      onActivate(node);
      const idx = ctrl.indexOfId(node.id);
      if (idx >= 0) ctrl.flyToIndex(idx, { animate: true });
    },
    onJump: (node) => jumpToNode(view, engine, node),
  });

  requestAnimationFrame(() => {
    if (!ctrl) {
      ctx._navRestoring = false;
      return;
    }
    if (restoreCamera) {
      const cam = cameraForLayout(navCurrent(win._graphNav)?.camera, prefs.layout);
      if (cam) {
        ctrl.restoreCameraState(cam, { animate: !!ctx.restoreAnimate });
        reflectPropSelection(propBar, ctx, ctrl);
        ctx._navRestoring = false;
        return;
      }
    }
    frameInitialView(ctrl, ctx, model, mode);
    reflectPropSelection(propBar, ctx, ctrl);
    if (mode === 'global' && !restoreCamera) snapshotGlobalNavCamera(win, ctx, ctrl);
    ctx._navRestoring = false;
  });

  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => ctrl.resize());
    ro.observe(stage || canvas);
    if (!ctrl.isFlat) ro.observe(canvas);
    const prevDispose = ctrl.dispose;
    ctrl.dispose = () => { ro.disconnect(); prevDispose(); };
  }
  return ctrl;
}

function drillGraph(view, engine, win, ctx, newRootId, { push = true } = {}) {
  ctx.selectedNodeId = newRootId;
  const cur = navCurrent(win._graphNav);
  const depth = loadGraphPrefs().depth;
  if (cur?.mode === 'neighborhood' && cur.rootId === newRootId) {
    win._graph3d?.frameNode(newRootId, { animate: true });
    return;
  }
  const next = buildNavEntry({ mode: 'neighborhood', rootId: newRootId, depth });
  if (!push && cur?.mode === 'neighborhood') {
    win._graphNav.stack[win._graphNav.index] = next;
    navigateGraph(view, engine, win, ctx, next, { push: false });
    return;
  }
  navigateGraph(view, engine, win, ctx, next, { push });
}

function navigateToGlobalGraph(view, engine, win, ctx) {
  const cur = navCurrent(win._graphNav);
  if (cur?.mode === 'global') return;
  const focusId = globalFocusLeavingLocal(cur, ctx);
  navigateGraph(view, engine, win, ctx, buildNavEntry({ mode: 'global', focusId }), { push: true });
}

function navigateGraph(view, engine, win, ctx, entry, { push = true, restoreIndex = null } = {}) {
  if (push) {
    const dup = openGraphWindows.get(graphKeyForEntry(entry));
    if (dup && dup !== win) { dup.raise(); applyGraphPrefsToWindow(dup); return; }
    if (win._graph3d) {
      const cur = navCurrent(win._graphNav);
      if (cur) {
        const leaving = { ...cur, camera: win._graph3d.getCameraState() };
        if (cur.mode === 'global') leaving.focusId = ctx.selectedNodeId ?? cur.focusId ?? null;
        win._graphNav.stack[win._graphNav.index] = leaving;
      }
    }
    const from = navCurrent(win._graphNav);
    let globalFocus = entry.focusId ?? null;
    if (entry.mode === 'global' && globalFocus == null && from?.mode === 'neighborhood') {
      globalFocus = from.rootId ?? ctx.selectedNodeId ?? null;
    }
    const pushed = entry.mode === 'neighborhood'
      ? buildNavEntry({ mode: 'neighborhood', rootId: entry.rootId, depth: loadGraphPrefs().depth })
      : buildNavEntry({ mode: 'global', focusId: globalFocus });
    win._graphNav = navPush(win._graphNav, pushed);
  } else if (restoreIndex != null) {
    win._graphNav = navGoTo(win._graphNav, restoreIndex);
  }

  const current = navCurrent(win._graphNav);
  if (!current) return;

  const prefs = loadGraphPrefs();
  win._graphDepth = prefs.depth;
  if (current.mode === 'neighborhood') {
    current.depth = prefs.depth;
    win._graphNav.stack[win._graphNav.index] = { ...current };
    ctx.selectedNodeId = current.rootId;
  } else {
    ctx.selectedNodeId = current.focusId ?? null;
  }

  const model = current.mode === 'global'
    ? buildGlobalModel(engine)
    : buildNeighborhood(engine, current.rootId, { depth: prefs.depth });
  if (!model) return;

  openGraphWindows.delete(win._graphKey);
  openGraphWindows.set(graphKeyForEntry(current), win);
  win._graphKey = graphKeyForEntry(current);

  if (win._graph3d) win._graph3d.dispose();
  win._graph3d = null;
  ctx.labels.textContent = '';
  ctx.model = model;
  ctx.mode = current.mode === 'global' ? 'global' : 'neighborhood';
  ctx.graphKey = win._graphKey;
  ctx.restoreCamera = !push;
  ctx.restoreAnimate = !push;
  ctx._navRestoring = true;

  const ctrl = mountGraph3DRenderer(view, engine, ctx);
  if (ctrl) win._graph3d = ctrl;
  ctx.propBar?.updateNav?.(win._graphNav);
  ctx.toolbar?.syncNavMode?.(win._graphNav);
}

function navBackGraph(view, engine, win, ctx) {
  if (!navCanBack(win._graphNav)) return;
  syncNavEntryFromView(win, ctx);
  win._graphNav = navBack(win._graphNav);
  applyNavFromStack(view, engine, win, ctx);
}

function navForwardGraph(view, engine, win, ctx) {
  if (!navCanForward(win._graphNav)) return;
  syncNavEntryFromView(win, ctx);
  win._graphNav = navForward(win._graphNav);
  applyNavFromStack(view, engine, win, ctx);
}

function open3DGraph(view, engine, key, model, titleNode, { width, height, mode, staleBanner = null, rootId = null }) {
  const g = typeof window !== 'undefined' ? window : self;
  const existing = openGraphWindows.get(key);
  if (existing) {
    existing.raise();
    applyGraphPrefsToWindow(existing);
    return true;
  }

  const graphPrefs = loadGraphPrefs();
  if (mode === 'neighborhood') {
    const rid = rootId || model.root;
    model = buildNeighborhood(engine, rid, { depth: graphPrefs.depth }) || model;
  }

  const body = document.createElement('div');
  body.className = 'bel-graph3d-container';
  body.tabIndex = -1;
  if (staleBanner) body.appendChild(staleBanner);

  const main = document.createElement('div');
  main.className = 'bel-graph3d-main';
  const graphHost = { win: null };
  const sidebar = buildGraphSidebar({
    onLayoutChange: () => graphHost.win?._graph3d?.resize?.(),
  });
  const propBar = buildGraphPropBar();
  const stage = document.createElement('div');
  stage.className = 'bel-graph3d-stage';
  const canvas = document.createElement('canvas');
  canvas.className = 'bel-graph3d-canvas';
  const labels = document.createElement('div');
  labels.className = 'bel-graph3d-labels';
  const toolbar = buildGraphToolbar({ sidebar });

  stage.append(canvas, labels, toolbar.el);
  main.append(sidebar.el, stage);
  body.append(propBar.el, main);

  const initialEntry = mode === 'global'
    ? buildNavEntry({ mode: 'global' })
    : buildNavEntry({ mode: 'neighborhood', rootId: rootId || model.root, depth: graphPrefs.depth });

  const ctx = {
    win: null, canvas, labels, toolbar, propBar, sidebar, model, mode, graphKey: key,
    restoreCamera: false, viewMeta: null, followEditor: false,
    selectedNodeId: mode === 'neighborhood' ? (rootId || model.root) : null,
  };
  const graphBundle = { view, engine, ctx };
  const { ref: followRef, action: followAction } = createFollowWindowAction((on) => setGraphFollow(on));
  let unregisterGraphFollow = null;

  function setGraphFollow(on) {
    ctx.followEditor = !!on;
    followRef.setPressed?.(!!on);
    if (unregisterGraphFollow) {
      unregisterGraphFollow();
      unregisterGraphFollow = null;
    }
    if (ctx.followEditor) {
      unregisterGraphFollow = registerEditorFollow({
        view,
        isActive: () => ctx.followEditor,
        sync: () => syncFollowFromEditor(view, engine, ctx.win, ctx),
      });
      syncFollowFromEditor(view, engine, ctx.win, ctx);
    }
  }

  const onKey = (ev) => {
    if (ev.target?.closest?.('input, textarea, select')) {
      if (ev.key === 'Escape') ev.target.blur();
      return;
    }
    const ctrl = ctx.win?._graph3d;
    if (ev.key === '/' && !ev.metaKey && !ev.ctrlKey) { ev.preventDefault(); toolbar.focusSearch?.(); }
    else if (ev.key === 'Escape') clearPropSelection(propBar, ctx, ctrl);
    else if (ev.altKey && ev.key === 'ArrowLeft') { ev.preventDefault(); navBackGraph(view, engine, ctx.win, ctx); }
    else if (ev.altKey && ev.key === 'ArrowRight') { ev.preventDefault(); navForwardGraph(view, engine, ctx.win, ctx); }
    else if (ev.key === 'Enter' && !ev.shiftKey) {
      const f = ctrl?.getFocusedNode?.();
      if (f) { ev.preventDefault(); ctx.selectedNodeId = f.node.id; drillGraph(view, engine, ctx.win, ctx, f.node.id); }
    } else if (ev.key === 'Enter' && ev.shiftKey) {
      const f = ctrl?.getFocusedNode?.();
      if (f) { ev.preventDefault(); ctrl.flyToIndex(f.idx, { animate: true }); }
    }
  };

  const win = g.FloatingWindow.open({
    title: titleNode,
    content: body,
    className: 'bel-graph-window bel-graph3d-window',
    width, height,
    actions: [followAction, {
      label: 'Dependency graph settings',
      icon: GRAPH_SETTINGS_ICON,
      onClick: openGraphSettingsDialog,
    }],
    onClose: () => {
      body.removeEventListener('keydown', onKey);
      if (unregisterGraphFollow) unregisterGraphFollow();
      if (win._graph3d) win._graph3d.dispose();
      openGraphWindows.delete(win._graphKey ?? key);
      win._graphBundle = null;
    },
  });
  ctx.win = win;
  graphHost.win = win;
  win._graphKey = key;
  win._graphNav = createNavState(initialEntry);
  win._graphDepth = graphPrefs.depth;
  win._graphBundle = graphBundle;
  openGraphWindows.set(key, win);

  propBar.wire({
    onBack: () => navBackGraph(view, engine, win, ctx),
    onForward: () => navForwardGraph(view, engine, win, ctx),
  });

  toolbar.wire(() => win._graph3d, {
    onReset: () => {
      const ctrl = win._graph3d;
      const cur = navCurrent(win._graphNav);
      const focused = ctrl?.getFocusedNode?.();
      // In the whole-file (global) view, reset RE-CENTERS on the selected node (like
      // clicking it) instead of clearing it. With nothing selected — or in a
      // neighborhood view — reset zooms back out to fit the whole graph.
      if (cur?.mode === 'global' && focused) {
        ctrl.flyToIndex(focused.idx, { animate: true });
      } else {
        clearPropSelection(propBar, ctx, ctrl);
        ctrl?.frameAll?.({ animate: true });
      }
    },
    onExplore: (node) => {
      ctx.selectedNodeId = node.id;
      drillGraph(view, engine, win, ctx, node.id);
    },
    onGlobal: () => navigateToGlobalGraph(view, engine, win, ctx),
  });
  toolbar.syncNavMode?.(win._graphNav);

  body.addEventListener('keydown', onKey);

  requestAnimationFrame(() => {
    const ctrl = mountGraph3DRenderer(view, engine, ctx);
    if (!ctrl) {
      const keptBanner = body.querySelector('.bel-graph-stale-banner');
      body.textContent = '';
      if (keptBanner) body.appendChild(keptBanner);
      const fallback = document.createElement('div');
      fallback.className = 'bel-graph-container';
      body.appendChild(fallback);
      renderGraph(fallback, layoutGraph(model, { mode }), {
        interactive: true, fit: true, onJump: (node) => jumpToNode(view, engine, node),
      });
      return;
    }
    win._graph3d = ctrl;
    propBar.updateNav?.(win._graphNav);
    toolbar.syncNavMode?.(win._graphNav);
    applyGraphPrefsToWindow(win, graphPrefs);
  });
  return true;
}

export function openLocalGraphWindow(view, pos, opts = {}) {
  const g = typeof window !== 'undefined' ? window : self;
  if (typeof g.FloatingWindow === 'undefined') return false;
  const realEngine = getEngine(view);
  if (!realEngine) return false;
  const engine = makeGroupSource(view, realEngine) || realEngine;
  const at = pos ?? view.state.selection.main.head;
  const rootId = (opts.rootName && typeof engine.rootIdForName === 'function'
    ? engine.rootIdForName(opts.rootName) : null) || rootIdAt(engine, view, at);
  if (!rootId) return false;
  const prefs = loadGraphPrefs();
  const model = buildNeighborhood(engine, rootId, { depth: prefs.depth });
  return open3DGraph(view, engine, 'graph:' + rootId, model, graphWindowTitle(),
    { width: 520, height: 440, mode: 'neighborhood', rootId });
}

export function openGlobalGraphWindow(view) {
  const g = typeof window !== 'undefined' ? window : self;
  if (typeof g.FloatingWindow === 'undefined') return false;
  const realEngine = getEngine(view);
  if (!realEngine) return false;
  const engine = makeGroupSource(view, realEngine) || realEngine;
  const model = buildGlobalModel(engine);
  const meta = collectGlobalGraphMeta(view, engine);
  const staleBanner = makeStaleBanner(formatGlobalGraphStaleBanner(meta));
  const parseNote = meta.parseCoverage && !meta.parseCoverage.complete
    ? `parse ${meta.parseCoverage.percent}%` : '';
  return open3DGraph(view, engine, 'graph:__global__', model, graphWindowTitle(parseNote),
    { width: 780, height: 580, mode: 'global', staleBanner });
}

function rebindGraphWindowsToActiveEditor(view) {
  if (!view) return;
  const realEngine = getEngine(view);
  const engine = realEngine ? (makeGroupSource(view, realEngine) || realEngine) : null;
  for (const win of openGraphWindows.values()) {
    const bundle = win._graphBundle;
    if (!bundle?.ctx) continue;
    bundle.view = view;
    bundle.engine = engine;
    if (bundle.ctx.followEditor && engine) {
      syncFollowFromEditor(view, engine, win, bundle.ctx);
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beljar:active-editor-view', (e) => {
    rebindGraphWindowsToActiveEditor(e?.detail?.view);
  });
}

export function renderMiniGraph(container, view, pos, opts = {}) {
  const realEngine = getEngine(view);
  if (!realEngine) return false;
  const engine = makeGroupSource(view, realEngine) || realEngine;
  const at = pos ?? view.state.selection.main.head;
  const rootId = (opts.rootName && typeof engine.rootIdForName === 'function'
    ? engine.rootIdForName(opts.rootName) : null) || rootIdAt(engine, view, at);
  if (!rootId) { container.textContent = ''; return false; }
  const model = buildNeighborhood(engine, rootId, { depth: 1 });
  if (!model || model.nodes.length <= 1) { container.textContent = ''; return false; }
  // Same Sugiyama flat diagram as the dependency-graph window, miniaturised —
  // one visual language everywhere (the old curved-edge layered render is gone).
  return renderFlatMini(container, model, {
    onJump: (node) => jumpToNode(view, engine, node),
  });
}

export { nameForId as _nameForId, viewMetaFor };
export {
  buildNavEntry, createNavState, navPush, navBack, navForward, navGoTo,
  navCurrent, navCanBack, navCanForward, navBreadcrumbLabel, applyNavJump,
  fuzzySearchNodes,
} from './graph/graph-nav.mjs';
