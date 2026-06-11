// Symbol Inspector — read-only view of engine.intelSyncAt (type, refs, deps, impact).

import { EditorView } from '@codemirror/view';
import { getEngine, goToDefinition } from './bel-ide-actions.mjs';
import { renderTypeInto } from './bel-type-render.mjs';
import { renderMiniGraph, openLocalGraphWindow } from './bel-graph-view.mjs';

const KIND_LABEL = {
  signature: 'In signature',
  body: 'In body',
  notation: 'In notation',
  module: 'In module',
  implicit: 'Implicit',
  coverage: 'Coverage',
};
const KIND_ORDER = ['signature', 'body', 'notation', 'module', 'implicit', 'coverage'];

export function groupByKind(edges) {
  const buckets = new Map();
  for (const edge of edges || []) {
    const kind = edge.kind || 'body';
    if (!buckets.has(kind)) buckets.set(kind, new Map());
    if (edge.id != null && !buckets.get(kind).has(edge.id)) {
      buckets.get(kind).set(edge.id, { id: edge.id, name: edge.name || '?' });
    }
  }
  const out = [];
  for (const kind of KIND_ORDER) {
    if (buckets.has(kind)) {
      out.push({ kind, label: KIND_LABEL[kind] || kind, items: [...buckets.get(kind).values()] });
    }
  }
  for (const [kind, items] of buckets) {
    if (!KIND_ORDER.includes(kind)) {
      out.push({ kind, label: KIND_LABEL[kind] || kind, items: [...items.values()] });
    }
  }
  return out;
}

export function buildInspectorModel(engine, pos) {
  if (!engine || typeof engine.intelSyncAt !== 'function') return null;
  let intel = null;
  try {
    intel = engine.intelSyncAt(pos);
  } catch (_) {
    return null;
  }
  if (!intel || !intel.name) return null;
  const userStatus = intel.userStatus || { state: 'settled', detail: '' };
  return {
    name: intel.name,
    label: intel.label,
    namespace: intel.namespace,
    isGlobal: !!(intel.definition && intel.definition.isGlobal),
    definitionPos: intel.definition && intel.definition.range
      ? intel.definition.range.from : null,
    type: intel.type,
    typeSource: intel.typeSource,
    typePending: intel.typePending,
    statusState: userStatus.state,
    statusDetail: userStatus.detail,
    needsAsync: !!intel.needsAsync,
    references: intel.references || [],
    dependsOn: groupByKind(intel.dependencies),
    usedBy: groupByKind(intel.dependents),
    impact: intel.impact || [],
  };
}

const TYPE_SOURCE_LABEL = {
  reconstructed: 'reconstructed (implicits expanded)',
  source: 'from source annotation',
  local: 'inferred binder type',
  'stale-cache': 'cached from a previous check',
  'fresh-cache': 'from the checker',
  beluga: 'from the checker',
};

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function scrollFadeLine(cls, child) {
  const node = el('div', `${cls} bel-scroll-x`);
  if (child instanceof Node) node.appendChild(child);
  else if (child != null) node.textContent = child;
  const g = typeof window !== 'undefined' ? window : self;
  if (g.ScrollFade && typeof g.ScrollFade.attach === 'function') {
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
    raf(() => { if (node.isConnected) g.ScrollFade.attach(node, { axis: 'x', size: 14 }); });
  }
  return node;
}

function lineColOf(view, from) {
  const line = view.state.doc.lineAt(from);
  return `${line.number}:${from - line.from + 1}`;
}

function snippetOf(view, from) {
  return view.state.doc.lineAt(from).text.trim().slice(0, 60);
}

function jumpRow(view, label, range, meta) {
  const row = el('button', 'inspector-row');
  row.type = 'button';
  const loc = el('span', 'inspector-row-loc', meta);
  const body = scrollFadeLine('inspector-row-label', label);
  if (meta) row.appendChild(loc);
  row.appendChild(body);
  row.addEventListener('click', () => {
    if (!range) return;
    view.dispatch({ selection: { anchor: range.from, head: range.from }, scrollIntoView: true });
    goToDefinition(view, range.from);
  });
  return row;
}

function section(title, count) {
  const sec = el('div', 'inspector-section');
  const head = el('div', 'inspector-section-head');
  head.appendChild(el('span', 'inspector-section-title', title));
  if (count != null) head.appendChild(el('span', 'inspector-section-count', String(count)));
  sec.appendChild(head);
  return sec;
}

function emptyNote(text) {
  return el('p', 'inspector-empty-note', text);
}

function rangeForId(engine, id) {
  if (!engine || typeof engine.symbolRangeById !== 'function') return null;
  try {
    return engine.symbolRangeById(id);
  } catch (_) {
    return null;
  }
}

const STATUS_WORD = {
  settled: 'Settled',
  recalculating: 'Recalculating',
  error: 'Error',
};
function statusDot(state, detail) {
  const dot = el('span', `inspector-status-dot is-${state || 'settled'}`);
  const word = STATUS_WORD[state] || 'Settled';
  dot.title = detail ? `${word} — ${detail}` : word;
  dot.setAttribute('aria-label', dot.title);
  return dot;
}

export function renderInspector(bodyEl, model, view, engine) {
  bodyEl.textContent = '';
  if (!model) {
    bodyEl.appendChild(emptyNote('Place the cursor on a symbol.'));
    return;
  }

  const header = el('div', 'inspector-header');
  header.appendChild(statusDot(model.statusState, model.statusDetail));
  if (model.label) header.appendChild(el('span', 'inspector-kind-pill', model.label));
  header.appendChild(scrollFadeLine('inspector-name', model.name));
  bodyEl.appendChild(header);

  if (model.type != null) {
    const typeEl = el('div', 'inspector-type bel-type');
    const srcLabel = model.typeSource && TYPE_SOURCE_LABEL[model.typeSource];
    if (srcLabel) typeEl.title = srcLabel;
    renderTypeInto(typeEl.appendChild(el('span', 'bel-type-text')), model.type, model.namespace);
    bodyEl.appendChild(typeEl);
  } else if (model.typePending || model.statusState === 'recalculating') {
    const typeEl = el('div', 'inspector-type bel-type is-pending');
    typeEl.appendChild(el('span', 'inspector-type-pending', 'reconstructing type…'));
    bodyEl.appendChild(typeEl);
  }

  // References.
  const refSec = section('References', model.references.length);
  refSec.dataset.section = 'references';
  if (model.references.length) {
    for (const ref of model.references) {
      refSec.appendChild(jumpRow(view, snippetOf(view, ref.from),
        { from: ref.from, to: ref.to }, lineColOf(view, ref.from)));
    }
  } else {
    refSec.appendChild(emptyNote('No references.'));
  }
  bodyEl.appendChild(refSec);

  // Used by (dependents) — who depends on this symbol.
  bodyEl.appendChild(groupSection('Used by', 'used-by', model.usedBy, view, engine,
    'Nothing depends on this.'));

  // Depends on (dependencies) — what this symbol references.
  bodyEl.appendChild(groupSection('Depends on', 'depends-on', model.dependsOn, view, engine,
    'No dependencies.'));

  // Impact — transitive signature-change cascade.
  const impactSec = section('Impact', model.impact.length);
  impactSec.dataset.section = 'impact';
  impactSec.querySelector('.inspector-section-head').title =
    'Declarations a change to this signature would cascade to';
  if (model.impact.length) {
    for (const node of model.impact) {
      const range = rangeForId(engine, node.id);
      impactSec.appendChild(jumpRow(view, node.name, range, null));
    }
  } else {
    impactSec.appendChild(emptyNote('No downstream impact.'));
  }
  bodyEl.appendChild(impactSec);

  // Graph — a small dependency neighborhood, with a pop-out to the full window.
  // Only meaningful for a global decl that has neighbours.
  if (model.isGlobal && model.definitionPos != null
    && (model.dependsOn.length || model.usedBy.length)) {
    const graphSec = section('Graph');
    graphSec.dataset.section = 'graph';
    const popOut = el('button', 'inspector-graph-popout');
    popOut.type = 'button';
    popOut.title = 'Open in a window';
    popOut.textContent = '⤢';
    popOut.addEventListener('click', () => openLocalGraphWindow(view, model.definitionPos));
    graphSec.querySelector('.inspector-section-head').appendChild(popOut);
    const mini = el('div', 'inspector-mini-graph bel-graph-mini');
    graphSec.appendChild(mini);
    bodyEl.appendChild(graphSec);
    // Render after attach so the container has measurable size for fit-to-view.
    requestAnimationFrame(() => {
      if (mini.isConnected) renderMiniGraph(mini, view, model.definitionPos);
    });
  }
}

function groupSection(title, key, groups, view, engine, emptyText) {
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const sec = section(title, total);
  sec.dataset.section = key;
  if (!total) {
    sec.appendChild(emptyNote(emptyText));
    return sec;
  }
  for (const group of groups) {
    if (groups.length > 1) sec.appendChild(el('div', 'inspector-group-label', group.label));
    for (const item of group.items) {
      const range = rangeForId(engine, item.id);
      sec.appendChild(jumpRow(view, item.name, range, null));
    }
  }
  return sec;
}

const openWindows = new Map();

export function openInspectorWindow(view, pos) {
  const g = typeof window !== 'undefined' ? window : self;
  if (typeof g.FloatingWindow === 'undefined') return false;
  const at = pos ?? view.state.selection.main.head;
  const engine = getEngine(view);
  if (!engine) return false;
  const model = buildInspectorModel(engine, at);
  if (!model) return false;

  const key = model.name + '@' + at;
  const existing = openWindows.get(key);
  if (existing) {
    existing.raise();
    return true;
  }

  const bodyEl = document.createElement('div');
  bodyEl.className = 'inspector-body inspector-body-pinned';
  renderInspector(bodyEl, model, view, engine);

  const title = buildWindowTitle(model);

  let coords = null;
  try {
    coords = view.coordsAtPos(at);
  } catch (_) {
    coords = null;
  }
  const win = g.FloatingWindow.open({
    title,
    content: bodyEl,
    className: 'inspector-window',
    x: coords ? Math.round(coords.right + 12) : undefined,
    y: coords ? Math.round(coords.top) : undefined,
    width: 340,
    height: 420,
    onClose: () => openWindows.delete(key),
  });
  openWindows.set(key, win);

  if (model.needsAsync && typeof engine.intelTypePromise === 'function') {
    Promise.resolve(engine.intelTypePromise(at)).then((type) => {
      if (openWindows.get(key) !== win) return;
      const next = buildInspectorModel(engine, at);
      if (next && next.type == null && type != null) {
        next.type = type;
        next.statusState = 'settled';
        next.needsAsync = false;
      }
      if (next) {
        renderInspector(bodyEl, next, view, engine);
        win.setTitle(buildWindowTitle(next));
      }
    }).catch(() => {});
  }
  return true;
}

function buildWindowTitle(model) {
  const title = document.createElement('span');
  title.className = 'inspector-window-title';
  title.appendChild(statusDot(model.statusState, model.statusDetail));
  if (model.label) {
    const k = document.createElement('span');
    k.className = 'inspector-window-kind';
    k.textContent = model.label;
    title.appendChild(k);
  }
  const nm = document.createElement('span');
  nm.className = 'inspector-window-name';
  nm.textContent = model.name;
  title.appendChild(nm);
  return title;
}

let lastPos = null;

function panelOpen() {
  const ws = document.querySelector('.workspace');
  return !!(ws && ws.classList.contains('is-inspector-open'));
}

function inspectorBody() {
  const panel = document.getElementById('inspector-panel');
  return panel ? panel.querySelector('.inspector-body') : null;
}

let renderToken = 0;

function rerender(view) {
  const body = inspectorBody();
  if (!body) return;
  const engine = getEngine(view);
  const pos = lastPos ?? view.state.selection.main.head;
  const model = engine ? buildInspectorModel(engine, pos) : null;
  renderInspector(body, model, view, engine);

  if (model && model.needsAsync && engine && typeof engine.intelTypePromise === 'function') {
    const myToken = ++renderToken;
    Promise.resolve(engine.intelTypePromise(pos)).then((type) => {
      if (myToken !== renderToken) return;
      if (lastPos !== pos) return;
      if (inspectorBody() !== body || !body.isConnected) return;
      const next = buildInspectorModel(engine, pos);
      if (next && next.type == null && type != null) {
        next.type = type;
        next.statusState = 'settled';
        next.needsAsync = false;
      }
      renderInspector(body, next, view, engine);
    }).catch(() => {});
  }
}

export function belInspector() {
  let timer = null;
  let boundView = null;

  const onOpenRequest = (e) => {
    if (!boundView) return;
    if (e && e.detail && typeof e.detail.pos === 'number') {
      lastPos = e.detail.pos;
    }
    requestAnimationFrame(() => rerender(boundView));
  };

  return EditorView.updateListener.of((update) => {
    boundView = update.view;
    const g = typeof window !== 'undefined' ? window : self;
    if (!boundView._belInspectorBound) {
      boundView._belInspectorBound = true;
      g.addEventListener('beljar:open-inspector', onOpenRequest);
      g.addEventListener('beljar:inspector-refresh', () => rerender(boundView));
    }
    if (update.selectionSet || update.docChanged) {
      lastPos = update.state.selection.main.head;
      if (!panelOpen()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        rerender(update.view);
      }, 120);
    }
  });
}
