// Inspector render — DOM rendering of inspector view-models.
// Owns building the panel/window body from a model. Chrome callbacks arrive via opts
// (onCheckCrossDev, onOpenCrossFile, suppressFollow, navigate, onBeforeJump) — never
// import dock chrome by name.

import { Text } from '@codemirror/state';
import {
  gatherReferenceGroups,
  referenceFileHeaderLabel,
  shouldShowReferenceFileHeader,
  editorFileId,
  resolveDefFileId,
  referenceRowMatchesPos,
} from './refs-panel.mjs';
import { renderTypeInto } from '../format/type-render.mjs';
import { renderMiniGraph, openLocalGraphWindow } from '../graph/graph-view.mjs';
import { setShimmerPhase } from './hover.mjs';
import {
  createCachedGoalHintIcon,
} from '../prover/cached-goal-hint.mjs';
import { mountHoleGoalTier } from '../prover/hole-goal-pending-ui.mjs';
import {
  NS_GLYPH,
  persistOf,
  isNotationPragmaModel,
  isGlobalOverviewModel,
  buildBuiltinModel,
  buildGlobalModel,
  holeModelAt,
} from './inspector-model.mjs';

function isCfgEditorView(view) {
  return !!view?.dom?.classList?.contains('bel-editor--cfg');
}

export function setTip(el, text) {
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

const TYPE_SOURCE_LABEL = {
  reconstructed: 'reconstructed (implicits expanded)',
  source: 'from source annotation',
  local: 'inferred binder type',
  'stale-cache': 'cached from a previous check',
  'fresh-cache': 'from the checker',
  beluga: 'from the checker',
};

export function el(tag, cls, text) {
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

/** Name + kind pill on one baseline — no scroll-fade wrapper (it skews flex centering). */
function inspectorTitle(name, label) {
  const title = el('div', 'inspector-title');
  const nameEl = el('span', 'inspector-name', name ?? '');
  title.appendChild(nameEl);
  if (label) title.appendChild(el('span', 'inspector-kind-pill', label));
  const g = typeof window !== 'undefined' ? window : self;
  if (g.Tooltips?.bindOverflow) g.Tooltips.bindOverflow(nameEl, () => String(name ?? ''));
  return title;
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

export function dispatchOpenFileAt(g, fileId, row, name) {
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

function fileBaseName(name) {
  if (!name) return '';
  const s = String(name);
  return s.slice(s.lastIndexOf('/') + 1);
}

function symbolDefFile(g, view, model) {
  const fileId = model.fileId || inspectorDefFileId(view, model) || editorFileId(g, view);
  if (!fileId) return null;
  let fileName = model.fileName || null;
  const P = g.Persist;
  if (!fileName && P && typeof P.getFileById === 'function') {
    fileName = (P.getFileById(fileId) || {}).name || null;
  }
  const baseName = fileBaseName(fileName);
  if (!baseName) return null;
  return { fileId, fileName, baseName };
}

function inspectSymbolDefFile(view, model, opts = {}) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const def = symbolDefFile(g, view, model);
  if (!def) return;
  const target = { kind: 'file', name: def.baseName, pos: 0, fileId: def.fileId };
  if (typeof opts.onInspectDefFile === 'function') {
    opts.onInspectDefFile(view, model, target);
    return;
  }
  if (typeof opts.navigate === 'function') {
    opts.navigate(target);
    return;
  }
  dispatchOpenFileAt(g, def.fileId, { from: 0, to: 0 }, null);
}

function jumpRowSymbol(g, label, range, jumpOpts, rowFile = null) {
  const node = el('div', 'inspector-row');
  node.setAttribute('role', 'button');
  node.tabIndex = 0;
  node.appendChild(scrollFadeLine('inspector-row-label', label));
  if (rowFile && rowFile.fileId && rowFile.fileId !== editorFileId(g) && rowFile.fileName) {
    node.appendChild(el('span', 'inspector-row-file', fileBaseName(rowFile.fileName)));
  }
  if (g.Tooltips?.bindOverflow) g.Tooltips.bindOverflow(node.querySelector('.inspector-row-label'), () => String(label ?? ''));
  const jump = (event) => {
    if (!range) return;
    const fileId = (rowFile && rowFile.fileId) || jumpOpts.fileId || editorFileId(g);
    if (typeof jumpOpts.navigate === 'function') {
      jumpOpts.navigate({ kind: 'symbol', name: label, pos: range.from, range, fileId }, event);
      return;
    }
    jumpOpts.onBeforeJump?.();
    if (!fileId) return;
    dispatchOpenFileAt(g, fileId, range, label);
  };
  node.addEventListener('click', (e) => jump(e));
  node.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    jump(e);
  });
  return node;
}

function inspectorNavFromModel(model) {
  if (!model || !model.name) return null;
  return {
    // For a cross-file symbol the definition lives in ANOTHER file, so its range
    // is not a position in the active doc — null it so the active-file row builder
    // doesn't plant a spurious "def" row at that offset. The real def still shows
    // under its own file via the suite-wide reference scan (defFileId).
    nameRange: model.crossFile ? null : model.definitionRange,
    references: (model.references || []).map((r) => ({ from: r.from, to: r.to })),
  };
}

function inspectorDefFileId(view, model) {
  return resolveDefFileId(view, inspectorNavFromModel(model));
}

function refFileHeaderEl(group, gathered, nav) {
  const label = referenceFileHeaderLabel(group, gathered, nav);
  const node = el('div', 'inspector-ref-file-name');
  const m = /^(.+)\s+\((\d+)\)$/.exec(label);
  if (m) {
    node.appendChild(el('span', 'inspector-ref-file-name-base', m[1]));
    node.appendChild(el('span', 'inspector-ref-file-name-count', ` (${m[2]})`));
  } else {
    node.textContent = label;
  }
  return node;
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
    const showHeader = shouldShowReferenceFileHeader(group, gathered, nav);
    const block = showHeader ? el('div', 'inspector-ref-file-group') : body;
    if (showHeader) {
      block.appendChild(refFileHeaderEl(group, gathered, nav));
    }
    for (const row of group.rows) {
      const fileId = row.fileId ?? group.fileId;
      const label = group.isCurrent ? snippetOf(view, row.from) : (row.lineText || '');
      block.appendChild(referenceRow(g, { ...row, fileId }, label, opts));
    }
    if (showHeader) body.appendChild(block);
  }
}

function referenceGatherForInspector(view, model) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const nav = inspectorNavFromModel(model);
  const defFileId = model.crossFile && model.fileId ? model.fileId : inspectorDefFileId(view, model);
  return gatherReferenceGroups(view, g, nav, model.name, defFileId);
}

const SECTION_CHEVRON_SVG = '<svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const XFILE_OPEN_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5"/></svg>';
let collapsedSections = new Set();
let collapsedSectionsSymbol = null;

// Sections with more rows than this start collapsed when first opened for a symbol/view.
const SECTION_COLLAPSE_AT = {
  references: 30,
  'used-by': 25,
  'depends-on': 25,
  impact: 20,
  outline: 25,
  suite: 15,
};

function sectionsToCollapse({ empty = [], counts = {} } = {}) {
  const keys = new Set(empty);
  for (const [key, threshold] of Object.entries(SECTION_COLLAPSE_AT)) {
    const n = counts[key];
    if (typeof n === 'number' && n > threshold) keys.add(key);
  }
  return keys;
}

function beginInspectorSections(symbolName, collapsedKeys) {
  if (collapsedSectionsSymbol !== symbolName) {
    collapsedSectionsSymbol = symbolName;
    collapsedSections = collapsedKeys instanceof Set ? collapsedKeys : new Set(collapsedKeys);
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
  if (count != null) {
    const countEl = el('span', `inspector-section-count${count > 0 ? ' has-items' : ''}`, String(count));
    head.appendChild(countEl);
  }

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
    if (e.target.closest('.inspector-graph-popout') || e.target.closest('.bel-cached-hint')) return;
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

// A small inline loading spinner (matches the app's spinner idiom) for async
// states: a reconstructed type still resolving, a development being checked.
function inlineSpinner(tip) {
  const s = el('span', 'inspector-spinner');
  s.setAttribute('aria-hidden', 'true');
  if (tip) setTip(s, tip);
  return s;
}

function typeRecalcShimmer(text = 'Reconstructing type…') {
  const sh = el('span', 'inspector-type-recalc beljar-tip-shimmer');
  sh.textContent = text;
  setShimmerPhase(sh);
  return sh;
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
  checked: 'Checked',
  checking: 'Checking',
  'error-checking': 'Checking',
  error: 'Error',
  unknown: 'Not checked here',
};
function statusDot(state, detail) {
  const dot = el('span', `inspector-status-dot is-${state || 'checked'}`);
  const word = STATUS_WORD[state] || 'Checked';
  setTip(dot, detail ? `${word}: ${detail}` : word);
  return dot;
}

export function renderInspector(bodyEl, model, view, engine, opts = {}) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const activePos = opts.activePos ?? view?.state?.selection?.main?.head;
  const jumpOpts = {
    activePos,
    navigate: typeof opts.navigate === 'function' ? opts.navigate : null,
    suppressFollow: opts.suppressFollow,
    onBeforeJump: () => {
      opts.suppressFollow?.();
      opts.onBeforeJump?.();
    },
  };
  const scrollTop = opts.preserveScrollTop ?? 0;
  bodyEl.textContent = '';
  const scrollInner = el('div', 'inspector-scroll-inner');
  bodyEl.appendChild(scrollInner);
  // A `?` under the RAW cursor is a HOLE first — show its goal regardless of how
  // `model` was resolved (the symbol resolver / probeIntelPos may have biased past
  // the `?`; a settlement refresh may hand us a global model). Single authoritative
  // hole gate, keyed off the cursor head so a jump that lands ON a `?` always wins.
  const cursorHead = view?.state?.selection?.main?.head;
  const holeModel = (model && model.isHole)
    ? model
    : (view && cursorHead != null && !opts.forceGlobal && !isCfgEditorView(view)
      ? holeModelAt(engine, view, cursorHead)
      : null);
  if (holeModel) {
    renderBuiltinView(scrollInner, holeModel);
    return;
  }
  if (!model || isGlobalOverviewModel(model)) {
    // Never a dead end: a built-in token under the cursor gets a one-line
    // explainer; otherwise the global (file / suite / project) overview.
    if (!model && !opts.forceGlobal && view && activePos != null && !isCfgEditorView(view)) {
      const builtin = buildBuiltinModel(view, activePos, engine);
      if (builtin) {
        renderBuiltinView(scrollInner, builtin);
        return;
      }
    }
    renderGlobalView(scrollInner, model || buildGlobalModel(engine, view), view, engine, opts);
    return;
  }

  const header = el('div', 'inspector-header');
  const headerMain = el('div', 'inspector-header-main');
  headerMain.appendChild(statusDot(model.statusState, model.statusDetail));
  headerMain.appendChild(inspectorTitle(model.name, model.label));
  header.appendChild(headerMain);

  const defFile = symbolDefFile(g, view, model);
  if (defFile) {
    const locus = el('div', 'inspector-locus');
    locus.appendChild(el('span', 'inspector-locus-prep', 'in'));
    const fileLink = el('button', 'inspector-def-file');
    fileLink.type = 'button';
    fileLink.textContent = defFile.baseName;
    const fullName = defFile.fileName || defFile.baseName;
    fileLink.setAttribute('aria-label', `Go to ${fullName}`);
    if (defFile.fileName && defFile.fileName !== defFile.baseName) {
      setTip(fileLink, defFile.fileName);
    } else if (g.Tooltips?.bindOverflow) {
      g.Tooltips.bindOverflow(fileLink, () => defFile.baseName);
    }
    fileLink.addEventListener('click', (e) => {
      e.stopPropagation();
      inspectSymbolDefFile(view, model, opts);
    });
    locus.appendChild(fileLink);
    header.appendChild(locus);
  }
  scrollInner.appendChild(header);

  // Cross-DEVELOPMENT honesty: a symbol from a different Beluga program is not
  // checked here until you opt in. The header already names its file, so the
  // banner is purely the STATE + action: "Not checked here · Check" → a spinner
  // while its development is checked → gone once checked (real diagnostics show).
  // In-development members (earlier or later) are covered and get no banner.
  if (model.crossFile && model.crossDevState && model.crossDevState !== 'checked') {
    const banner = el('div', 'inspector-xfile-note');
    if (model.crossDevState === 'checking') {
      banner.appendChild(inlineSpinner('Checking this development…'));
      banner.appendChild(el('span', 'inspector-xfile-text', 'Checking…'));
    } else {
      banner.appendChild(el('span', 'inspector-xfile-text', 'Not checked here'));
      const checkBtn = el('button', 'inspector-xfile-check', 'Check');
      checkBtn.type = 'button';
      setTip(checkBtn, 'Check this development');
      checkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onCheckCrossDev?.(view, model);
      });
      banner.appendChild(checkBtn);
    }
    const openBtn = el('button', 'inspector-xfile-open');
    openBtn.type = 'button';
    openBtn.innerHTML = XFILE_OPEN_SVG;
    const base = model.fileName ? fileBaseName(model.fileName) : 'another file';
    setTip(openBtn, `Open ${base}`);
    openBtn.setAttribute('aria-label', `Open ${base}`);
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onOpenCrossFile?.(view, model);
    });
    banner.appendChild(openBtn);
    scrollInner.appendChild(banner);
  }

  if (model.type != null) {
    const typeEl = el('div', 'inspector-type bel-type');
    const srcLabel = model.typeSource && TYPE_SOURCE_LABEL[model.typeSource];
    if (srcLabel) setTip(typeEl, srcLabel);
    renderTypeInto(typeEl.appendChild(el('span', 'bel-type-text')), model.type, model.namespace);
    if (model.typeUpgrading) typeEl.appendChild(typeRecalcShimmer());
    if (model.typeSource === 'stale-cache') {
      const hint = createCachedGoalHintIcon(TYPE_SOURCE_LABEL['stale-cache']);
      if (hint) {
        typeEl.appendChild(hint);
        setTip(hint, TYPE_SOURCE_LABEL['stale-cache']);
      }
    }
    scrollInner.appendChild(typeEl);
  } else if (model.typePending || model.statusState === 'checking') {
    const typeEl = el('div', 'inspector-type bel-type is-pending');
    typeEl.appendChild(typeRecalcShimmer());
    scrollInner.appendChild(typeEl);
  }

  // Diagnostics for an in-development cross-file symbol — the same nude list as
  // the home view, but each row jumps to the line in the MEMBER file. (Active-file
  // symbols surface their diagnostics through the editor/gutter, not here.)
  if (model.crossFile && model.crossFileDiagnostics && model.crossFileDiagnostics.length) {
    const diagList = el('div', 'inspector-diag-list');
    for (const d of model.crossFileDiagnostics) {
      diagList.appendChild(crossFileDiagRow(g, d, model.fileId, jumpOpts));
    }
    scrollInner.appendChild(diagList);
  }

  const notationPragma = isNotationPragmaModel(model);
  const refGathered = referenceGatherForInspector(view, model);
  const usedByCount = notationPragma ? 0 : groupItemCount(model.usedBy);
  const dependsOnCount = groupItemCount(model.dependsOn);
  const impactCount = notationPragma ? 0 : model.impact.length;
  beginInspectorSections(model.name, sectionsToCollapse({
    empty: [
      ...(!refGathered.total ? ['references'] : []),
      ...(!dependsOnCount ? ['depends-on'] : []),
      ...(!notationPragma && !usedByCount ? ['used-by'] : []),
      ...(!notationPragma && !impactCount ? ['impact'] : []),
    ],
    counts: {
      references: refGathered.total,
      'depends-on': dependsOnCount,
      ...(!notationPragma ? { 'used-by': usedByCount, impact: impactCount } : {}),
    },
  }));

  // References.
  const { sec: refSec, body: refBody } = section('References', refGathered.total, 'references');
  renderReferenceGroups(view, model, refGathered, refBody, jumpOpts);
  scrollInner.appendChild(refSec);

  // Depends on (dependencies) — what this symbol references.
  scrollInner.appendChild(groupSection('Depends on', 'depends-on', model.dependsOn, g, engine,
    'No dependencies.', jumpOpts, model.groupNodes));

  // Fixity pragmas reference an operator but nothing can depend on them.
  if (!notationPragma) {
    // Used by (dependents) — who depends on this symbol.
    scrollInner.appendChild(groupSection('Used by', 'used-by', model.usedBy, g, engine,
      'Nothing depends on this.', jumpOpts, model.groupNodes));

    // Impact — the full blast radius: the transitive type-cascade first, then
    // terminal implementation uses (tagged, non-cascading). See group-graph.impactOf.
    const { sec: impactSec, body: impactBody, title: impactTitle } = section('Impact', impactCount, 'impact');
    setTip(impactTitle, 'Everything a change here would force you to revisit: the type-level cascade, plus implementations that use it (tagged “uses”)');
    if (model.impact.length) {
      for (const node of model.impact) {
        const { range, rowFile } = depRowTarget(engine, model.groupNodes, node.id, g);
        const row = jumpRowSymbol(g, node.name, range, jumpOpts, rowFile);
        const isUses = node.kind === 'uses';
        // Tier shown by text colour: signature cascade = blue, implementation use = grey.
        row.classList.add(isUses ? 'inspector-impact-uses' : 'inspector-impact-sig');
        setTip(row, isUses ? 'uses' : 'signature');
        impactBody.appendChild(row);
      }
    } else {
      impactBody.appendChild(emptyNote('No downstream impact.'));
    }
    scrollInner.appendChild(impactSec);

    // Graph — a small dependency neighborhood, with a pop-out to the full window.
    // Rooted at the definition when local, else at the cursor (cross-file symbols
    // have no local def but still have a suite-wide neighborhood).
    const graphPos = model.definitionPos != null ? model.definitionPos : activePos;
    // Cross-file symbols root the graph by NAME (their def is in another file).
    const graphOpts = model.crossFile ? { rootName: model.name } : undefined;
    if (graphPos != null && (model.dependsOn.length || model.usedBy.length)) {
      const { sec: graphSec, body: graphBody, actions: graphActions } = section('Dependency graph', null, 'graph');
      const popOut = el('button', 'inspector-graph-popout');
      popOut.type = 'button';
      setTip(popOut, 'Open in a window');
      popOut.textContent = '⤢';
      popOut.addEventListener('click', (e) => {
        e.stopPropagation();
        openLocalGraphWindow(view, graphPos, graphOpts);
      });
      graphActions.insertBefore(popOut, graphActions.firstChild);
      const mini = el('div', 'inspector-mini-graph bel-graph-mini');
      graphBody.appendChild(mini);
      scrollInner.appendChild(graphSec);
      // Render after attach so the container has measurable size for fit-to-view.
      requestAnimationFrame(() => {
        if (mini.isConnected) renderMiniGraph(mini, view, graphPos, graphOpts);
      });
    }
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

function depRowTarget(engine, groupNodes, id, g) {
  const node = groupNodes && groupNodes.get(id);
  if (node) return { range: node.nameRange, rowFile: { fileId: node.fileId, fileName: node.fileName } };
  return { range: rangeForId(engine, id), rowFile: null };
}

function groupSection(title, key, groups, g, engine, emptyText, jumpOpts = {}, groupNodes = null) {
  const total = groupItemCount(groups);
  const { sec, body } = section(title, total, key);
  if (!total) {
    body.appendChild(emptyNote(emptyText));
    return sec;
  }
  for (const group of groups) {
    if (groups.length > 1) body.appendChild(el('div', 'inspector-group-label', group.label));
    for (const item of group.items) {
      const { range, rowFile } = depRowTarget(engine, groupNodes, item.id, g);
      body.appendChild(jumpRowSymbol(g, item.name, range, jumpOpts, rowFile));
    }
  }
  return sec;
}

function renderBuiltinView(scrollInner, model) {
  const header = el('div', 'inspector-header');
  const headerMain = el('div', 'inspector-header-main');
  headerMain.appendChild(inspectorTitle(model.token || '', model.label));
  header.appendChild(headerMain);
  scrollInner.appendChild(header);
  if (model.goal != null) {
    const row = el('div', 'inspector-builtin-goal');
    const head = el('div', 'inspector-builtin-goal-head');
    head.appendChild(el('span', 'inspector-builtin-goal-label', 'Goal'));
    row.appendChild(head);
    renderTypeInto(row.appendChild(el('span', 'inspector-builtin-goal-type')), model.goal, 'comp');
    scrollInner.appendChild(row);
  } else if (model.desc) {
    scrollInner.appendChild(el('p', 'inspector-builtin-desc', model.desc));
  }
}

function outlineRow(g, item, jumpOpts) {
  const node = el('div', `inspector-row inspector-outline-row${item.hasError ? ' is-error' : ''}`);
  node.dataset.ns = item.namespace || '';
  node.setAttribute('role', 'button');
  node.tabIndex = 0;
  node.appendChild(el('span', 'inspector-outline-glyph', NS_GLYPH[item.namespace] || '•'));
  const main = el('div', 'inspector-outline-main');
  main.appendChild(scrollFadeLine('inspector-row-label', item.name));
  if (item.label) main.appendChild(el('span', 'inspector-outline-kind', item.label));
  node.appendChild(main);
  const jump = (event) => {
    if (!item.nameRange) return;
    const fileId = item.fileId || editorFileId(g);
    if (typeof jumpOpts.navigate === 'function') {
      jumpOpts.navigate({ kind: 'symbol', name: item.name, pos: item.nameRange.from, range: item.nameRange, fileId }, event);
      return;
    }
    jumpOpts.onBeforeJump?.();
    if (!fileId) return;
    dispatchOpenFileAt(g, fileId, item.nameRange, item.name);
  };
  node.addEventListener('click', (e) => jump(e));
  node.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    jump(e);
  });
  return node;
}

function renderGlobalView(scrollInner, model, view, engine, opts = {}) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const jumpOpts = {
    activePos: opts.activePos,
    navigate: typeof opts.navigate === 'function' ? opts.navigate : null,
    suppressFollow: opts.suppressFollow,
    onBeforeJump: () => {
      opts.suppressFollow?.();
      opts.onBeforeJump?.();
    },
  };

  // Health strip — the file name is the star; status is a quiet dot, with a
  // small count only when something actually needs attention.
  const health = el('div', 'inspector-global-health');
  const showError = model.errors > 0 || (model.checking && model.hasStaleErrors);
  const dotState = showError
    ? (model.checking ? 'is-error-checking' : 'is-error')
    : model.warnings > 0 ? 'is-warning'
      : model.checking ? 'is-checking' : 'is-checked';
  const dot = el('span', `inspector-global-dot ${dotState}`);
  const errTip = model.errors === 1 ? '1 error' : `${model.errors} errors`;
  setTip(dot, showError
    ? (model.checking ? `Checking… · ${errTip}` : errTip)
    : model.warnings > 0 ? (model.warnings === 1 ? '1 warning' : `${model.warnings} warnings`)
      : model.checking ? 'Checking…' : 'Checked');
  health.appendChild(dot);
  if (model.fileName) health.appendChild(el('span', 'inspector-global-file', model.fileName));
  const holeCount = model.holes ? model.holes.length : 0;
  if (model.errors || model.warnings || holeCount) {
    const counts = el('span', 'inspector-global-counts');
    if (model.errors) counts.appendChild(el('span', 'inspector-global-count is-error', String(model.errors)));
    if (model.warnings) counts.appendChild(el('span', 'inspector-global-count is-warning', String(model.warnings)));
    if (holeCount) {
      const hc = el('span', 'inspector-global-count is-holes', `?${holeCount}`);
      setTip(hc, holeCount === 1 ? '1 hole' : `${holeCount} holes`);
      counts.appendChild(hc);
    }
    health.appendChild(counts);
  }
  scrollInner.appendChild(health);

  beginInspectorSections('__global__', sectionsToCollapse({
    counts: {
      outline: model.outline?.length ?? 0,
      suite: model.suite?.entries?.length ?? 0,
    },
  }));

  // Diagnostics — a nude list right under the header (no section chrome; the
  // header's count already telegraphs how many). Absent entirely when clean.
  if (model.diagnostics && model.diagnostics.length) {
    const diagList = el('div', 'inspector-diag-list');
    for (const d of model.diagnostics) diagList.appendChild(diagnosticRow(g, d, view, opts));
    scrollInner.appendChild(diagList);
  }

  if (model.outline.length) {
    const { sec: outlineSec, body: outlineBody } = section('Outline', model.outline.length, 'outline');
    for (const item of model.outline) outlineBody.appendChild(outlineRow(g, item, jumpOpts));
    scrollInner.appendChild(outlineSec);
  }

  // Holes — incomplete `?` spots with their goal type; click jumps to the `?`.
  if (model.holes && model.holes.length) {
    const { sec: holesSec, body: holesBody } = section('Holes', model.holes.length, 'holes');
    for (const hole of model.holes) holesBody.appendChild(holeRow(g, hole, view, opts));
    scrollInner.appendChild(holesSec);
  }

  if (model.suite) {
    const { sec: suiteSec, body: suiteBody, head: suiteHead } = section('Suite', null, 'suite');
    if (model.suite.name) {
      const nameEl = el('span', 'inspector-section-sub', model.suite.name);
      suiteHead.insertBefore(nameEl, suiteHead.querySelector('.inspector-section-actions'));
    }
    model.suite.entries.forEach((entry, i) => {
      const row = el('div', `inspector-suite-row${entry.isActive ? ' is-current' : ''}`);
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.appendChild(el('span', 'inspector-suite-pos', String(i + 1)));
      row.appendChild(scrollFadeLine('inspector-suite-name', entry.name));
      const target = {
        kind: 'file', name: entry.name, pos: 0, range: { from: 0, to: 0 }, fileId: entry.fileId,
      };
      const activate = (event) => {
        if (!entry.fileId) return;
        if (typeof jumpOpts.navigate === 'function') { jumpOpts.navigate(target, event); return; }
        jumpOpts.onBeforeJump?.();
        dispatchOpenFileAt(g, entry.fileId, { from: 0, to: 0 }, null);
      };
      row.addEventListener('click', (e) => activate(e));
      row.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        activate(e);
      });
      suiteBody.appendChild(row);
    });
    scrollInner.appendChild(suiteSec);
  }
}

// A diagnostic that points into ANOTHER file (e.g. the suite-prelude banner)
// jumps to the actual error line in that file, not the banner's line-1 anchor.
function crossFileDiagJumpRow(g, target) {
  if (!target?.fileId) return null;
  const P = persistOf(g);
  const text = String(P?.getFileText?.(target.fileId) ?? '');
  const t = Text.of(text.split('\n'));
  const ln = Math.min(Math.max(1, target.line || 1), t.lines);
  const line = t.line(ln);
  return { from: line.from, to: line.to, line: ln };
}

function diagnosticRow(g, d, view, opts) {
  const doc = view?.state?.doc;
  const from = doc ? Math.min(d.from, doc.length) : d.from;
  const line = doc ? doc.lineAt(from) : null;
  const loc = d.target?.fileId
    ? `${String(d.target.fileName || '').split('/').pop()}:${d.target.line || 1}`
    : (line ? `${line.number}:${from - line.from + 1}` : null);
  const node = el('div', `inspector-diag-item is-${d.severity}`);
  node.setAttribute('role', 'button');
  node.tabIndex = 0;

  const head = el('div', 'inspector-diag-head');
  head.appendChild(el('span', `inspector-diag-tag is-${d.severity}`, d.severity === 'error' ? 'Error' : 'Warning'));
  if (loc) head.appendChild(el('span', 'inspector-diag-loc', loc));
  node.appendChild(head);

  // Full message — wrapped, line breaks preserved (Beluga errors can be multi-line).
  const text = String(d.message || '').trim() || (d.severity === 'error' ? 'Error' : 'Warning');
  node.appendChild(el('p', 'inspector-diag-text', text));

  const jump = () => {
    opts.suppressFollow?.();
    opts.onBeforeJump?.();
    const crossRow = crossFileDiagJumpRow(g, d.target);
    if (crossRow) {
      dispatchOpenFileAt(g, d.target.fileId, crossRow, null);
      return;
    }
    dispatchOpenFileAt(g, editorFileId(g, view), { from: d.from, to: d.to }, null);
  };
  node.addEventListener('click', jump);
  node.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    jump();
  });
  return node;
}

// Hole row in the global view: source-order number + goal type (signature-fresh).
function holeRow(g, hole, view, opts) {
  const node = el('div', 'inspector-row inspector-hole-row');
  node.setAttribute('role', 'button');
  node.tabIndex = 0;
  const state = hole.goalState || (hole.goal ? 'live' : 'pending');
  // Approximate is only "pending" while Beluga is still coming (loadingLive).
  if (hole.loadingLive || state === 'pending' || state === 'rechecking') {
    node.classList.add('is-pending');
  }
  if (state === 'cached') node.classList.add('is-cached');
  if (state === 'out-of-scope') node.classList.add('is-unfocused');
  const id = el('span', 'harpoon-hole-id');
  id.appendChild(el('span', 'harpoon-hole-num', `?${hole.index}`));
  if (hole.line != null) {
    const ln = el('span', 'harpoon-hole-line', String(hole.line));
    setTip(id, `Jump to ?${hole.index} at line ${hole.line}`);
    id.appendChild(ln);
  }
  node.appendChild(id);
  const goal = el('span', 'inspector-hole-goal harpoon-hole-goal');
  if (state === 'out-of-scope') {
    goal.appendChild(el('span', 'harpoon-hole-unfocused', 'Not computable outside scope'));
  } else if (state === 'live' || state === 'cached'
    || (state === 'approximate' && hole.goal && !hole.loadingLive)) {
    if (hole.goal) renderTypeInto(goal, hole.goal, 'comp');
  } else {
    mountHoleGoalTier(goal, {
      surface: 'inspector',
      goalState: state,
      goal: hole.goal,
    });
  }
  node.appendChild(goal);
  const jumpFileId = opts.boundFile || editorFileId(g, view);
  const jump = () => {
    opts.suppressFollow?.();
    opts.onBeforeJump?.();
    dispatchOpenFileAt(g, jumpFileId, { from: hole.from, to: hole.to }, null);
  };
  node.addEventListener('click', jump);
  node.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    jump();
  });
  return node;
}

// Diagnostic row for an in-development cross-file symbol: same chrome as
// diagnosticRow, but its finding is a member-file (line, message) so the location
// is a bare line number and the jump opens the MEMBER file at that line.
function crossFileDiagRow(g, d, fileId, jumpOpts) {
  const node = el('div', `inspector-diag-item is-${d.severity}`);
  node.setAttribute('role', 'button');
  node.tabIndex = 0;
  const head = el('div', 'inspector-diag-head');
  head.appendChild(el('span', `inspector-diag-tag is-${d.severity}`, d.severity === 'error' ? 'Error' : 'Warning'));
  if (d.line != null) head.appendChild(el('span', 'inspector-diag-loc', String(d.line)));
  node.appendChild(head);
  const text = String(d.message || '').trim() || (d.severity === 'error' ? 'Error' : 'Warning');
  node.appendChild(el('p', 'inspector-diag-text', text));
  const jump = () => {
    if (!fileId) return;
    jumpOpts?.suppressFollow?.();
    jumpOpts?.onBeforeJump?.();
    dispatchOpenFileAt(g, fileId, { from: d.from, to: d.to }, null);
  };
  node.addEventListener('click', jump);
  node.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    jump();
  });
  return node;
}
