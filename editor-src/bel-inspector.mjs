// Symbol Inspector — read-only view of engine.intelSyncAt (type, refs, deps, impact).

import { EditorView } from '@codemirror/view';
import { getEngine } from './bel-ide-actions.mjs';
import {
  gatherReferenceGroups,
  referenceFileHeaderLabel,
  shouldShowReferenceFileHeader,
  editorFileId,
  resolveDefFileId,
  referenceRowMatchesPos,
} from './bel-refs-panel.mjs';
import { createFollowWindowAction, registerEditorFollow } from './bel-follow-sync.mjs';
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

function setTip(el, text) {
  if (!el) return;
  const g = typeof window !== 'undefined' ? window : globalThis;
  if (g.Tooltips?.set) g.Tooltips.set(el, text);
  else if (text) {
    el.removeAttribute('title');
    el.setAttribute('data-tooltip', text);
    el.setAttribute('aria-label', text);
    g.Tooltips?.bind?.(el);
  }
}

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
    definitionRange: intel.definition && intel.definition.range
      ? { from: intel.definition.range.from, to: intel.definition.range.to }
      : null,
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
  else if (child != null) node.appendChild(el('span', 'bel-scroll-x-text', child));
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
  const line = view.state.doc.lineAt(from);
  const col = from - line.from;
  let text = line.text.trim();
  if (text.length > 60) {
    const start = Math.max(0, col - 24);
    text = (start > 0 ? '…' : '') + line.text.slice(start, start + 60).trim() + '…';
  }
  return text;
}

function dispatchOpenFileAt(g, fileId, row, name) {
  if (!fileId || typeof g.dispatchEvent !== 'function') return;
  g.dispatchEvent(new CustomEvent('beljar:open-file-at', {
    detail: {
      fileId,
      from: row.from,
      to: row.to,
      line: row.line,
      col: row.col,
      name,
    },
  }));
}

function referenceRow(g, row, label, jumpOpts) {
  if (!row) return scrollFadeLine('inspector-row-label', label);
  let text = label || row.lineText || '';
  if (text.length > 60) text = `${text.slice(0, 59)}…`;
  const meta = row.line != null && row.col != null ? `${row.line}:${row.col}` : null;
  const active = jumpOpts.activePos != null
    && referenceRowMatchesPos(row, jumpOpts.fileId, jumpOpts.activePos, jumpOpts.doc);
  const node = el('div', 'inspector-row' + (active ? ' is-ref-active' : ''));
  node.setAttribute('role', 'button');
  node.tabIndex = 0;
  if (meta) node.appendChild(el('span', 'inspector-row-loc', meta));
  const body = jumpOpts.ellipsis
    ? el('span', 'inspector-row-label inspector-row-snippet', text)
    : scrollFadeLine('inspector-row-label', text);
  node.appendChild(body);
  if (g.Tooltips?.bindOverflow) g.Tooltips.bindOverflow(body, () => String(text ?? ''));
  const jump = () => {
    jumpOpts.onBeforeJump?.();
    dispatchOpenFileAt(g, row.fileId ?? jumpOpts.fileId, row, jumpOpts.symbolName);
  };
  node.addEventListener('click', jump);
  node.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    jump();
  });
  return node;
}

function jumpRowSymbol(g, label, range, jumpOpts) {
  const node = el('div', 'inspector-row');
  node.setAttribute('role', 'button');
  node.tabIndex = 0;
  node.appendChild(scrollFadeLine('inspector-row-label', label));
  if (g.Tooltips?.bindOverflow) g.Tooltips.bindOverflow(node.querySelector('.inspector-row-label'), () => String(label ?? ''));
  const jump = () => {
    if (!range) return;
    jumpOpts.onBeforeJump?.();
    const fileId = editorFileId(g);
    if (!fileId) return;
    dispatchOpenFileAt(g, fileId, range, label);
  };
  node.addEventListener('click', jump);
  node.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    jump();
  });
  return node;
}

function inspectorNavFromModel(model) {
  if (!model || !model.name) return null;
  return {
    nameRange: model.definitionRange,
    references: (model.references || []).map((r) => ({ from: r.from, to: r.to })),
  };
}

function inspectorDefFileId(view, model) {
  return resolveDefFileId(view, inspectorNavFromModel(model));
}

function renderReferenceGroups(view, model, gathered, body, jumpOpts) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const nav = inspectorNavFromModel(model);
  const editorId = editorFileId(g, view);
  const activePos = jumpOpts.activePos ?? view.state.selection.main.head;
  const opts = {
    ...jumpOpts,
    symbolName: model.name,
    fileId: editorId,
    activePos,
    doc: view.state.doc,
    ellipsis: true,
  };
  if (!gathered.total) {
    body.appendChild(emptyNote('No references.'));
    return;
  }
  for (const group of gathered.groups) {
    if (shouldShowReferenceFileHeader(group, gathered, nav)) {
      body.appendChild(el('div', 'inspector-group-label', referenceFileHeaderLabel(group, gathered, nav)));
    }
    for (const row of group.rows) {
      const fileId = row.fileId ?? group.fileId;
      const label = group.isCurrent ? snippetOf(view, row.from) : (row.lineText || '');
      body.appendChild(referenceRow(g, { ...row, fileId }, label, opts));
    }
  }
}

function referenceGatherForInspector(view, model) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const nav = inspectorNavFromModel(model);
  const defFileId = inspectorDefFileId(view, model);
  return gatherReferenceGroups(view, g, nav, model.name, defFileId);
}

const SECTION_CHEVRON_SVG = '<svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let collapsedSections = new Set();
let collapsedSectionsSymbol = null;

function beginInspectorSections(symbolName, emptyKeys) {
  if (collapsedSectionsSymbol !== symbolName) {
    collapsedSectionsSymbol = symbolName;
    collapsedSections = new Set(emptyKeys);
  }
}

function groupItemCount(groups) {
  return (groups || []).reduce((n, g) => n + g.items.length, 0);
}

function section(title, count, sectionKey) {
  const sec = el('div', 'inspector-section');
  if (sectionKey) sec.dataset.section = sectionKey;
  const collapsed = sectionKey ? collapsedSections.has(sectionKey) : false;
  if (collapsed) sec.classList.add('is-collapsed');

  const head = el('div', 'inspector-section-head');
  head.setAttribute('role', 'button');
  head.tabIndex = 0;
  head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  const titleEl = el('span', 'inspector-section-title', title);
  head.appendChild(titleEl);
  if (count != null) head.appendChild(el('span', 'inspector-section-count', String(count)));

  const actions = el('div', 'inspector-section-actions');
  const chevron = el('span', 'inspector-section-chevron');
  chevron.innerHTML = SECTION_CHEVRON_SVG;
  actions.appendChild(chevron);
  head.appendChild(actions);

  const bodyWrap = el('div', 'inspector-section-body');
  const body = el('div', 'inspector-section-inner');
  bodyWrap.appendChild(body);
  sec.append(head, bodyWrap);

  function toggle() {
    const nowCollapsed = sec.classList.toggle('is-collapsed');
    head.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
    if (sectionKey) {
      if (nowCollapsed) collapsedSections.add(sectionKey);
      else collapsedSections.delete(sectionKey);
    }
  }
  head.addEventListener('click', (e) => {
    if (e.target.closest('.inspector-graph-popout')) return;
    toggle();
  });
  head.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    toggle();
  });

  return { sec, body, head, actions, title: titleEl };
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
  setTip(dot, detail ? `${word}: ${detail}` : word);
  return dot;
}

export function renderInspector(bodyEl, model, view, engine, opts = {}) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const activePos = opts.activePos ?? view?.state?.selection?.main?.head;
  const jumpOpts = {
    activePos,
    onBeforeJump: () => {
      suppressInspectorFollow();
      opts.onBeforeJump?.();
    },
  };
  const scrollTop = opts.preserveScrollTop ?? 0;
  bodyEl.textContent = '';
  const scrollInner = el('div', 'inspector-scroll-inner');
  bodyEl.appendChild(scrollInner);
  if (!model) {
    scrollInner.appendChild(emptyNote('Place the cursor on a symbol.'));
    return;
  }

  const header = el('div', 'inspector-header');
  header.appendChild(statusDot(model.statusState, model.statusDetail));
  if (model.label) header.appendChild(el('span', 'inspector-kind-pill', model.label));
  header.appendChild(scrollFadeLine('inspector-name', model.name));
  scrollInner.appendChild(header);

  if (model.type != null) {
    const typeEl = el('div', 'inspector-type bel-type');
    const srcLabel = model.typeSource && TYPE_SOURCE_LABEL[model.typeSource];
    if (srcLabel) setTip(typeEl, srcLabel);
    renderTypeInto(typeEl.appendChild(el('span', 'bel-type-text')), model.type, model.namespace);
    scrollInner.appendChild(typeEl);
  } else if (model.typePending || model.statusState === 'recalculating') {
    const typeEl = el('div', 'inspector-type bel-type is-pending');
    typeEl.appendChild(el('span', 'inspector-type-pending', 'reconstructing type…'));
    scrollInner.appendChild(typeEl);
  }

  const refGathered = referenceGatherForInspector(view, model);
  const emptySections = [];
  if (!refGathered.total) emptySections.push('references');
  if (!groupItemCount(model.usedBy)) emptySections.push('used-by');
  if (!groupItemCount(model.dependsOn)) emptySections.push('depends-on');
  if (!model.impact.length) emptySections.push('impact');
  beginInspectorSections(model.name, emptySections);

  // References.
  const { sec: refSec, body: refBody } = section('References', refGathered.total, 'references');
  renderReferenceGroups(view, model, refGathered, refBody, jumpOpts);
  scrollInner.appendChild(refSec);

  // Used by (dependents) — who depends on this symbol.
  scrollInner.appendChild(groupSection('Used by', 'used-by', model.usedBy, g, engine,
    'Nothing depends on this.', jumpOpts));

  // Depends on (dependencies) — what this symbol references.
  scrollInner.appendChild(groupSection('Depends on', 'depends-on', model.dependsOn, g, engine,
    'No dependencies.', jumpOpts));

  // Impact — transitive signature-change cascade.
  const { sec: impactSec, body: impactBody, title: impactTitle } = section('Impact', model.impact.length, 'impact');
  setTip(impactTitle, 'Declarations a change to this signature would cascade to');
  if (model.impact.length) {
    for (const node of model.impact) {
      const range = rangeForId(engine, node.id);
      impactBody.appendChild(jumpRowSymbol(g, node.name, range, jumpOpts));
    }
  } else {
    impactBody.appendChild(emptyNote('No downstream impact.'));
  }
  scrollInner.appendChild(impactSec);

  // Graph — a small dependency neighborhood, with a pop-out to the full window.
  // Only meaningful for a global decl that has neighbours.
  if (model.isGlobal && model.definitionPos != null
    && (model.dependsOn.length || model.usedBy.length)) {
    const { sec: graphSec, body: graphBody, actions: graphActions } = section('Dependency graph', null, 'graph');
    const popOut = el('button', 'inspector-graph-popout');
    popOut.type = 'button';
    setTip(popOut, 'Open in a window');
    popOut.textContent = '⤢';
    popOut.addEventListener('click', (e) => {
      e.stopPropagation();
      openLocalGraphWindow(view, model.definitionPos);
    });
    graphActions.insertBefore(popOut, graphActions.firstChild);
    const mini = el('div', 'inspector-mini-graph bel-graph-mini');
    graphBody.appendChild(mini);
    scrollInner.appendChild(graphSec);
    // Render after attach so the container has measurable size for fit-to-view.
    requestAnimationFrame(() => {
      if (mini.isConnected) renderMiniGraph(mini, view, model.definitionPos);
    });
  }

  if (scrollTop > 0) {
    requestAnimationFrame(() => {
      if (bodyEl.isConnected) bodyEl.scrollTop = scrollTop;
    });
  } else if (activePos != null) {
    requestAnimationFrame(() => {
      const active = bodyEl.querySelector('.inspector-row.is-ref-active');
      if (active?.isConnected) active.scrollIntoView({ block: 'nearest' });
    });
  }
}

function groupSection(title, key, groups, g, engine, emptyText, jumpOpts = {}) {
  const total = groupItemCount(groups);
  const { sec, body } = section(title, total, key);
  if (!total) {
    body.appendChild(emptyNote(emptyText));
    return sec;
  }
  for (const group of groups) {
    if (groups.length > 1) body.appendChild(el('div', 'inspector-group-label', group.label));
    for (const item of group.items) {
      const range = rangeForId(engine, item.id);
      body.appendChild(jumpRowSymbol(g, item.name, range, jumpOpts));
    }
  }
  return sec;
}

const openWindows = new Map();

function inspectorWindowTitle() {
  const t = document.createElement('span');
  t.className = 'inspector-window-title';
  t.textContent = 'Inspect';
  return t;
}

function markInspectorJump(entry) {
  entry._followFromInspector = true;
  queueMicrotask(() => { entry._followFromInspector = false; });
}

function refreshInspectorAsync(entry, pos) {
  const engine = getEngine(entry.view);
  if (!engine || typeof engine.intelTypePromise !== 'function') return;
  const myToken = ++entry.renderToken;
  Promise.resolve(engine.intelTypePromise(pos)).then((type) => {
    if (myToken !== entry.renderToken) return;
    if (entry._followFromInspector) return;
    if (!entry.followEditor && entry.lastPos !== pos) return;
    if (!entry.bodyEl.isConnected) return;
    const next = buildInspectorModel(engine, pos);
    if (next && next.type == null && type != null) {
      next.type = type;
      next.statusState = 'settled';
      next.needsAsync = false;
    }
    if (next) {
      renderInspector(entry.bodyEl, next, entry.view, engine, {
        activePos: pos,
        onBeforeJump: () => markInspectorJump(entry),
      });
      entry.win.setTitle(inspectorWindowTitle());
    }
  }).catch(() => {});
}

function syncPinnedInspector(entry) {
  if (!entry.followEditor || entry._followFromInspector) return;
  const pos = entry.view.state.selection.main.head;
  entry.lastPos = pos;
  const engine = getEngine(entry.view);
  if (!engine) return;
  const model = buildInspectorModel(engine, pos);
  renderInspector(entry.bodyEl, model, entry.view, engine, {
    activePos: pos,
    onBeforeJump: () => markInspectorJump(entry),
  });
  entry.win.setTitle(inspectorWindowTitle());
  if (model?.needsAsync) refreshInspectorAsync(entry, pos);
}

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
  renderInspector(bodyEl, model, view, engine, { activePos: at });

  const title = inspectorWindowTitle();
  const { ref: followRef, action: followAction } = createFollowWindowAction((on) => setInspectorFollow(on));
  const pinned = {
    view, engine, win: null, bodyEl, followEditor: false, lastPos: at, renderToken: 0,
    _followFromInspector: false,
  };
  let unregisterInspectorFollow = null;

  function setInspectorFollow(on) {
    pinned.followEditor = !!on;
    followRef.setPressed?.(!!on);
    if (unregisterInspectorFollow) {
      unregisterInspectorFollow();
      unregisterInspectorFollow = null;
    }
    if (pinned.followEditor) {
      unregisterInspectorFollow = registerEditorFollow({
        view,
        isActive: () => pinned.followEditor,
        sync: () => syncPinnedInspector(pinned),
      });
      syncPinnedInspector(pinned);
    }
  }

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
    actions: [followAction],
    onClose: () => {
      openWindows.delete(key);
      if (unregisterInspectorFollow) unregisterInspectorFollow();
    },
  });
  pinned.win = win;
  openWindows.set(key, win);

  if (model.needsAsync && typeof engine.intelTypePromise === 'function') {
    refreshInspectorAsync(pinned, at);
  }
  return true;
}

let lastPos = null;
let suppressFollowUntil = 0;
let inspectorRetryTimer = null;

function suppressInspectorFollow(ms = 600) {
  suppressFollowUntil = performance.now() + ms;
}

function clearInspectorFollowSuppress() {
  suppressFollowUntil = 0;
}

function probeIntelPos(engine, view, hint) {
  if (!engine || typeof engine.intelSyncAt !== 'function') {
    const sel = view.state.selection.main;
    return hint ?? (sel.empty ? sel.head : sel.from);
  }
  const sel = view.state.selection.main;
  const candidates = [];
  if (hint != null) candidates.push(hint);
  if (!sel.empty) {
    candidates.push(sel.from, sel.to > sel.from ? sel.to - 1 : sel.from);
  }
  candidates.push(sel.head, sel.anchor);
  const seen = new Set();
  for (const p of candidates) {
    if (p == null || p < 0 || p > view.state.doc.length || seen.has(p)) continue;
    seen.add(p);
    try {
      const intel = engine.intelSyncAt(p);
      if (intel?.name) return p;
    } catch (_) { /* ignore */ }
  }
  return hint ?? sel.head;
}

function scheduleInspectorRetry(view, pos, attempt = 0) {
  if (inspectorRetryTimer) clearTimeout(inspectorRetryTimer);
  if (attempt > 6) return;
  const delay = attempt === 0 ? 0 : Math.min(200, 40 * attempt);
  inspectorRetryTimer = setTimeout(() => {
    inspectorRetryTimer = null;
    if (!view?.dom?.isConnected) return;
    const g = typeof window !== 'undefined' ? window : self;
    const ed = g.BelJarCurrentEditor;
    if (ed && typeof ed.syncIntelAt === 'function') ed.syncIntelAt(pos);
    const engine = getEngine(view);
    const resolved = probeIntelPos(engine, view, pos);
    lastPos = resolved;
    const model = engine ? buildInspectorModel(engine, resolved) : null;
    if (model) {
      if (panelOpen()) rerender(view, { pos: resolved, afterJump: true });
      return;
    }
    scheduleInspectorRetry(view, pos, attempt + 1);
  }, delay);
}

function panelOpen() {
  const ws = document.querySelector('.workspace');
  return !!(ws && ws.classList.contains('is-inspector-open'));
}

function inspectorBody() {
  const panel = document.getElementById('inspector-panel');
  return panel ? panel.querySelector('.inspector-body') : null;
}

let renderToken = 0;
let lastInspectorSymbol = null;

function inspectorScrollOpts(body, model, opts = {}) {
  const sameSymbol = model?.name && model.name === lastInspectorSymbol;
  const preserve = opts.afterJump || (sameSymbol && body.scrollTop > 0);
  if (model?.name) lastInspectorSymbol = model.name;
  else if (!model) lastInspectorSymbol = null;
  return preserve ? { preserveScrollTop: body.scrollTop } : {};
}

function rerender(view, opts = {}) {
  const body = inspectorBody();
  if (!body || !view?.dom?.isConnected) return;
  const engine = getEngine(view);
  const hinted = opts.pos != null ? opts.pos : lastPos;
  const pos = probeIntelPos(engine, view, hinted);
  lastPos = pos;
  const model = engine ? buildInspectorModel(engine, pos) : null;
  const scrollOpts = inspectorScrollOpts(body, model, opts);
  renderInspector(body, model, view, engine, { ...scrollOpts, activePos: pos });

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
      renderInspector(body, next, view, engine, { ...scrollOpts, activePos: pos });
    }).catch(() => {});
  } else if (!model && opts.afterJump && panelOpen()) {
    scheduleInspectorRetry(view, pos);
  }
}

export function belInspector() {
  let timer = null;
  let boundView = null;

  function activeView() {
    const g = typeof window !== 'undefined' ? window : self;
    const ed = g.BelJarCurrentEditor;
    if (ed && typeof ed.getView === 'function') {
      const v = ed.getView();
      if (v?.dom?.isConnected) return v;
    }
    return boundView?.dom?.isConnected ? boundView : null;
  }

  const onOpenRequest = (e) => {
    const view = activeView();
    if (!view) return;
    if (e && e.detail && typeof e.detail.pos === 'number') {
      lastPos = e.detail.pos;
    }
    requestAnimationFrame(() => rerender(view));
  };

  return EditorView.updateListener.of((update) => {
    boundView = update.view;
    const g = typeof window !== 'undefined' ? window : self;
    if (!boundView._belInspectorBound) {
      boundView._belInspectorBound = true;
      g.addEventListener('beljar:open-inspector', onOpenRequest);
      g.addEventListener('beljar:inspector-refresh', (e) => {
        const view = activeView();
        if (!view) return;
        const detail = e?.detail || {};
        if (detail.afterJump) clearInspectorFollowSuppress();
        const sel = view.state.selection.main;
        const hinted = detail.pos != null
          ? detail.pos
          : (sel.empty ? sel.head : sel.from);
        lastPos = hinted;
        rerender(view, { pos: hinted, afterJump: !!detail.afterJump });
      });
    }
    if (update.selectionSet || update.docChanged) {
      if (performance.now() < suppressFollowUntil) return;
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
