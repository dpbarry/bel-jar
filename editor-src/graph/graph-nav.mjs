// Pure navigation + search helpers for the 3D dependency graph (DOM-free, tested).

export function buildNavEntry({ mode, rootId = null, depth = 1, camera = null } = {}) {
  return { mode, rootId, depth: depth || 1, camera };
}

export function createNavState(entry) {
  return { stack: [entry], index: 0 };
}

export function navPush(state, entry) {
  if (!state) return createNavState(entry);
  const cur = state.stack[state.index];
  if (cur && cur.mode === entry.mode && cur.rootId === entry.rootId && cur.depth === entry.depth) {
    return state;
  }
  const stack = state.stack.slice(0, state.index + 1);
  stack.push(entry);
  return { stack, index: stack.length - 1 };
}

export function navBack(state) {
  if (!state || state.index <= 0) return state;
  return { ...state, index: state.index - 1 };
}

export function navForward(state) {
  if (!state || state.index >= state.stack.length - 1) return state;
  return { ...state, index: state.index + 1 };
}

export function navGoTo(state, index) {
  if (!state || index < 0 || index >= state.stack.length) return state;
  return { ...state, index };
}

export function navCurrent(state) {
  return state?.stack[state.index] ?? null;
}

export function navCanBack(state) {
  return state != null && state.index > 0;
}

export function navCanForward(state) {
  return state != null && state.index < state.stack.length - 1;
}

export function navBreadcrumbLabel(entry, nameForId) {
  if (!entry) return '?';
  if (entry.mode === 'global') return 'whole file';
  return nameForId(entry.rootId) || 'symbol';
}

export function applyNavJump(state, engine, { buildGlobalModel, buildNeighborhood }) {
  const entry = navCurrent(state);
  if (!entry || !engine) return null;
  if (entry.mode === 'global') return buildGlobalModel(engine);
  return buildNeighborhood(engine, entry.rootId, { depth: entry.depth || 1 });
}

export function fuzzySearchNodes(nodes, query, limit = 12) {
  const q = (query || '').trim().toLowerCase();
  if (!q || !nodes?.length) return [];
  const scored = [];
  for (const n of nodes) {
    const name = (n.name || '').toLowerCase();
    const idx = name.indexOf(q);
    if (idx < 0) continue;
    const score = idx + (idx === 0 ? 0 : name.length * 0.001);
    scored.push({ node: n, score });
  }
  scored.sort((a, b) => a.score - b.score || (a.node.name || '').localeCompare(b.node.name || ''));
  return scored.slice(0, limit).map((s) => s.node);
}

export function graphKeyForEntry(entry) {
  if (!entry) return 'graph:__unknown__';
  if (entry.mode === 'global') return 'graph:__global__';
  return 'graph:' + entry.rootId;
}
