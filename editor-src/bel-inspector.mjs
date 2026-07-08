// Symbol Inspector — read-only view of engine.intelSyncAt (type, refs, deps, impact).

import { EditorView } from '@codemirror/view';
import { Text } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { forEachDiagnostic } from '@codemirror/lint';
import { crossFileDefinitionAt, getEngine, navInfoAt, termRangeAt } from './bel-ide-actions.mjs';
import {
  canFindReferences,
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
import { builtinTooltipAt } from './bel-builtins.mjs';
import { cfgDiagnostics } from './bel-cfg-lint.mjs';
import { developmentForFile } from './development.mjs';
import { getDevelopmentChecker, developmentSignature } from './development-check.mjs';
import { listGroupSymbols, defsOf, sourceSignatureOf } from './project-prelude.mjs';
import { fuzzySearchNodes } from './graph/graph-nav.mjs';
import { dependencyGraph } from './workspace-index.mjs';
import { belNavSemanticTick } from './bel-nav.mjs';
import { resolveReferenceJump, revealEditorCursor } from './bel-viewport.mjs';
import { setShimmerPhase } from './bel-hover.mjs';
import { scanFileHoles } from './harpoon-project-goals.mjs';
import {
  buildHoleDisplayRows,
  fileInActiveDevelopment,
  holesBannerFromRows,
  resolveGoalNearPos,
  resolveGoalStateNearPos,
  settlementGoalsByPos,
} from './hole-goal-display.mjs';
import {
  createCachedGoalHintIcon,
  CACHED_GOAL_TIP,
} from './cached-goal-hint.mjs';
import { mountHoleGoalTier } from './hole-goal-pending-ui.mjs';

const KIND_LABEL = {
  signature: 'In signature',
  body: 'In body',
  notation: 'In notation',
  module: 'In module',
  implicit: 'Implicit',
  coverage: 'Coverage',
};
const KIND_ORDER = ['signature', 'body', 'notation', 'module', 'implicit', 'coverage'];

// One-glyph badge per declaration namespace, for the outline rows.
const NS_GLYPH = {
  'lf-type-family': '◇',
  'comp-type': '◆',
  'rec-function': 'ƒ',
  schema: '§',
  typedef: '≔',
  module: '▸',
};

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

// True when the inspector can show a symbol at `pos` — definitions and uses share
// the same identity (nav.symbolId is definition-only; references carry symbolId
// separately or may be unresolved-but-named).
export function canInspectAt(view, pos) {
  const at = pos ?? view.state.selection.main.head;
  const nav = navInfoAt(view, at);
  if (nav?.symbolId || nav?.reference) return true;
  return canFindReferences(view, at);
}

function crossFileInspectTarget(view, at) {
  const cross = crossFileDefinitionAt(view, at);
  if (!cross) return null;
  const range = termRangeAt(view, at);
  const name = range ? view.state.sliceDoc(range.from, range.to) : '';
  if (!name) return null;
  return { ...cross, name, pos: cross.from };
}

export function resolveInspectModel(view, pos) {
  const at = pos ?? view.state.selection.main.head;
  const engine = getEngine(view);
  if (!engine) return null;
  const live = buildLiveModel(engine, at, view);
  if (live) return live;
  const g = typeof window !== 'undefined' ? window : self;
  const target = crossFileInspectTarget(view, at);
  return target ? buildCrossFileModel(g, target, view) : null;
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
  const userStatus = intel.userStatus || { state: 'checked', detail: '' };
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

const LOCAL_NAMESPACES = new Set(['local-lower', 'local-upper']);

// Replace the single-file dependency data with the suite-wide group graph so
// "Used by / Depends on / Impact" span files (a proof's prelude constructors,
// etc.). Mutates + returns the model. No-op for locals or when no project store.
export function enrichWithGroupGraph(model, view) {
  if (!model || !model.name || LOCAL_NAMESPACES.has(model.namespace)) return model;
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.BelJarPersist;
  if (!P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function'
    || typeof P.getActiveFileId !== 'function') {
    return model;
  }
  let graph;
  try {
    const activeId = P.getActiveFileId();
    const getText = (id) => (id === activeId && view?.state?.doc
      ? view.state.doc.toString()
      : String(P.getFileText(id) ?? ''));
    graph = dependencyGraph(P.listFiles(), activeId, getText, persistDevOpts(P));
  } catch (_) {
    return model;
  }
  const node = graph.nodeForName(model.name);
  if (!node) return model;
  model.dependsOn = groupByKind(graph.dependenciesOf(node.id));
  model.usedBy = groupByKind(graph.dependentsOf(node.id));
  model.impact = graph.impactOf(node.id);
  model.groupNodes = graph.nodes;
  if (node.fileId) model.fileId = node.fileId;
  if (node.fileName) model.fileName = node.fileName;
  return model;
}

// A `?` at `pos` is a HOLE first — its model carries the goal, and short-circuits
// the symbol resolver (which would otherwise bias back to a neighbouring binder).
function holeModelAt(engine, view, pos) {
  const doc = view?.state?.doc;
  if (!doc || pos == null) return null;
  const g = typeof window !== 'undefined' ? window : globalThis;
  const ctx = holeGoalContext(g, view, null, doc.toString());
  const P = persistOf(g);
  if (P && typeof P.getActiveFileId === 'function') {
    const active = P.listFiles?.()?.find((f) => f.id === P.getActiveFileId());
    if (active) ctx.fileName = active.name;
  }
  const goal = holeGoalNear(engine, doc, pos, ctx);
  const goalHit = resolveGoalStateNearPos(engine, doc, pos, ctx);
  if (goal == null && !holeTokenContains(engine, doc, pos)) return null;
  return {
    isHole: true,
    label: 'HOLE',
    token: '?',
    goal,
    goalState: goalHit?.state || (goal ? 'live' : 'pending'),
  };
}

// True when `pos` sits within some hole's `?` token (goal may still be pending).
function holeTokenContains(engine, doc, pos) {
  if (!engine || typeof engine.getHoles !== 'function') return false;
  for (const h of engine.getHoles()) {
    if (!h || h.line < 1 || h.line > doc.lines) continue;
    const off = doc.line(h.line).from + Math.max(0, (h.col || 1) - 1);
    if (off >= doc.length || doc.sliceString(off, off + 1) !== '?') continue;
    let end = off + 1;
    while (end < doc.length && /[^\s([{<:.,;|]/.test(doc.sliceString(end, end + 1))) end += 1;
    if (pos >= off && pos <= end) return true;
  }
  return false;
}

// buildInspectorModel + cross-file enrichment — the live render path.
function buildLiveModel(engine, pos, view) {
  const hole = holeModelAt(engine, view, pos);
  if (hole) return hole;
  return enrichWithGroupGraph(buildInspectorModel(engine, pos), view);
}

// Built-in token explainer — keyword / operator / pragma under the cursor that
// is NOT a user symbol. Pure given a view + pos; null when nothing builtin sits
// there. Surfaced only via cursor follow (these never appear in outline/search).
export function buildBuiltinModel(view, pos, engine = null) {
  if (!view || pos == null) return null;
  let tree;
  let doc;
  try {
    tree = syntaxTree(view.state);
    doc = view.state.doc;
  } catch (_) {
    return null;
  }
  const hit = builtinTooltipAt(tree, doc, pos);
  if (!hit) return null;
  // A `?` the checker has typed shows its GOAL instead of the generic blurb.
  const g = typeof window !== 'undefined' ? window : globalThis;
  const ctx = holeGoalContext(g, view, null, doc.toString());
  const P = persistOf(g);
  if (P && typeof P.getActiveFileId === 'function') {
    const active = P.listFiles?.()?.find((f) => f.id === P.getActiveFileId());
    if (active) ctx.fileName = active.name;
  }
  const goal = hit.label === 'HOLE' ? holeGoalNear(engine, doc, pos, ctx) : null;
  const goalHit = hit.label === 'HOLE' ? resolveGoalStateNearPos(engine, doc, pos, ctx) : null;
  return {
    label: hit.label,
    desc: hit.desc,
    token: hit.token,
    goal,
    goalState: goalHit?.state || (goal ? 'live' : undefined),
  };
}

function activeDevelopmentPaths(g, view) {
  const P = persistOf(g);
  if (!P || typeof P.listFiles !== 'function') return [];
  try {
    const files = P.listFiles();
    const activeId = activeFileId(g);
    const live = view?.state?.doc ? view.state.doc.toString() : null;
    const getText = (id) => (id === activeId && live != null ? live : String(P.getFileText(id) ?? ''));
    const dev = developmentForFile(files, activeId, getText, persistDevOpts(P));
    if (dev.paths?.length) return dev.paths.slice();
    const active = files.find((f) => f.id === activeId);
    return active ? [active.name] : [];
  } catch (_) {
    return [];
  }
}

function appendCachedHint(head, actionsEl, tip = CACHED_GOAL_TIP) {
  const icon = createCachedGoalHintIcon(tip);
  if (!icon) return;
  const stop = (e) => e.stopPropagation();
  icon.addEventListener('click', stop);
  icon.addEventListener('mousedown', stop);
  if (actionsEl) head.insertBefore(icon, actionsEl);
  else head.appendChild(icon);
  setTip(icon, tip);
}

function holeGoalContext(g, view, fileName, fileText) {
  const engine = view ? getEngine(view) : null;
  const devPaths = activeDevelopmentPaths(g, view);
  const inDevelopment = fileInActiveDevelopment(fileName, devPaths);
  const P = persistOf(g);
  const activeId = activeFileId(g);
  const active = P?.listFiles?.()?.find((f) => f.id === activeId);
  const liveFile = inDevelopment && active && fileName === active.name;
  return {
    fileName,
    fileText,
    inDevelopment,
    settleState: liveFile && engine ? engine.settleState?.() : null,
  };
}

// Goal of the hole whose `?` token contains `pos`, or null.
function holeGoalNear(engine, doc, pos, ctx) {
  if (!ctx) return null;
  return resolveGoalNearPos(engine, doc, pos, ctx);
}

function cfgBaseName(cfgPath) {
  if (!cfgPath) return null;
  const base = String(cfgPath).slice(String(cfgPath).lastIndexOf('/') + 1);
  return base.replace(/\.cfg$/i, '');
}

function persistDevOpts(P) {
  if (P && typeof P.getActiveCfgForDir === 'function') {
    return { activeCfgForDir: (dir) => P.getActiveCfgForDir(dir) };
  }
  return {};
}

// DOM-free assembly of the global-view model — the test seam. Takes already
// fetched pieces (outline, diagnostics, settle state, development, project size)
// and shapes them into the render model. Never spins or awaits.
export function assembleGlobalModel({
  fileName = null,
  outline = [],
  diagnostics = [],
  holes = [],
  holesCachedHint = false,
  settle = null,
  development = null,
  projectFileCount = 0,
  files = [],
} = {}) {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  const hasStaleErrors = diagnostics.some((d) => d.severity === 'error' && d.stale);
  const diagList = diagnostics
    .filter((d) => d.severity === 'error' || d.severity === 'warning')
    .map((d) => ({ severity: d.severity, message: d.message || d.text || '', from: d.from, to: d.to }))
    .sort((a, b) => (a.severity === b.severity
      ? a.from - b.from
      : (a.severity === 'error' ? -1 : 1)));
  let suite = null;
  if (development && development.kind === 'module' && Array.isArray(development.paths)) {
    const idByName = new Map((files || []).map((f) => [f.name, f.id]));
    suite = {
      cfg: development.cfg,
      name: cfgBaseName(development.cfg),
      paths: development.paths.slice(),
      activeIndex: development.activeIndex,
      entries: development.paths.map((p, i) => ({
        name: p,
        fileId: idByName.get(p) || null,
        isActive: i === development.activeIndex,
      })),
    };
  }
  return {
    fileName,
    errors,
    warnings,
    hasStaleErrors,
    diagnostics: diagList,
    holes: holes || [],
    holesCachedHint: !!holesCachedHint,
    checking: settle === 'checking' || settle === 'stale',
    outline: outline || [],
    suite,
    projectFileCount,
  };
}

// Global view fed from the live engine + project store. Mirrors how the rest of
// the bundle reads window.BelJarPersist for cross-file context.
export function buildGlobalModel(engine, view) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.BelJarPersist;
  const outline = engine && typeof engine.outlineSymbols === 'function' ? engine.outlineSymbols() : [];
  let diagnostics = engine && typeof engine.documentDiagnostics === 'function'
    ? engine.documentDiagnostics() : [];
  const settle = engine && typeof engine.settleState === 'function' ? engine.settleState() : null;
  let development = null;
  let fileName = null;
  let projectFileCount = 0;
  let files = [];
  if (P && typeof P.listFiles === 'function' && typeof P.getFileText === 'function') {
    files = P.listFiles();
    projectFileCount = files.length;
    const activeId = typeof P.getActiveFileId === 'function' ? P.getActiveFileId() : null;
    const active = files.find((f) => f.id === activeId);
    fileName = active ? active.name : null;
    try {
      development = developmentForFile(files, activeId, (id) => P.getFileText(id), persistDevOpts(P));
    } catch (_) {
      development = null;
    }
    if (fileName && /\.cfg$/i.test(fileName) && view?.state?.doc && activeId) {
      try {
        diagnostics = cfgDiagnostics(view.state.doc, activeId);
      } catch (_) { /* lint not ready */ }
    }
  }
  const rows = holeRows(g, engine, view);
  const ctx = holeGoalContext(g, view, fileName, view?.state?.doc?.toString() || '');
  return assembleGlobalModel({
    fileName,
    outline,
    diagnostics,
    holes: rows,
    holesCachedHint: !!holesBannerFromRows(rows, { inDevelopment: ctx.inDevelopment }),
    settle,
    development,
    projectFileCount,
    files,
  });
}

function holeRows(g, engine, view, fileId = null) {
  const P = persistOf(g);
  if (!P) return [];
  const doc = view?.state?.doc;
  const files = P.listFiles();
  const activeId = activeFileId(g);
  const targetId = fileId || activeId;
  const file = files.find((f) => f.id === targetId);
  if (!file) return [];
  const isActiveFile = targetId === activeId;
  if (isActiveFile && !doc) return [];
  const fileText = isActiveFile ? doc.toString() : String(P.getFileText(targetId) ?? '');
  const ctx = holeGoalContext(g, view, file.name, fileText);
  const syntactic = isActiveFile && engine?.getHoles
    ? engine.getHoles().map((h) => ({ ...h }))
    : scanFileHoles(fileText);
  if (!syntactic.length) return [];
  const settle = ctx.settleState;
  const rows = buildHoleDisplayRows({
    fileName: file.name,
    fileText,
    doc: isActiveFile ? doc : null,
    inDevelopment: ctx.inDevelopment,
    settleState: settle,
    syntacticHoles: syntactic,
    settlementGoalsByPos: isActiveFile ? settlementGoalsByPos(engine, settle) : new Map(),
  });
  return rows;
}

// Headline declaration namespaces shown in the outline (mirrors the engine's).
const OUTLINE_NS = new Set([
  'lf-type-family', 'comp-type', 'rec-function', 'schema', 'typedef', 'module',
]);

function persistOf(g) {
  return g && g.BelJarPersist ? g.BelJarPersist : null;
}
function activeFileId(g) {
  const P = persistOf(g);
  return P && typeof P.getActiveFileId === 'function' ? P.getActiveFileId() : null;
}

// A diagnostic belongs to a cross-file symbol when its (file-relative) line falls
// within the symbol's declaration span. The settlement publishes member findings
// as { line, message, severity }; here we map each to a jump position in the
// member file. Pure + exported so the attribution rule is unit-tested.
export function crossFileSymbolDiagnostics(diags, node, fileText) {
  if (!Array.isArray(diags) || !diags.length || !node) return [];
  const text = Text.of(String(fileText ?? '').split('\n'));
  const range = node.range || node.nameRange;
  let startLine = 1;
  let endLine = text.lines;
  if (range) {
    startLine = text.lineAt(Math.min(range.from, text.length)).number;
    endLine = text.lineAt(Math.min(range.to, text.length)).number;
  }
  const out = [];
  for (const d of diags) {
    if (typeof d.line !== 'number' || d.line < startLine || d.line > endLine) continue;
    const ln = Math.min(Math.max(1, d.line), text.lines);
    const line = text.line(ln);
    out.push({
      line: d.line,
      message: d.message,
      severity: d.severity || 'error',
      from: line.from,
      to: line.to,
    });
  }
  return out;
}

// A symbol model for a target in ANOTHER file, built from the project store +
// the suite-wide group graph for deps/used-by/impact. View-independent, so the
// panel can show it without that file being the active editor. References are
// gathered at render time by name (referenceGatherForInspector honours
// model.fileId). When the target is an EARLIER member of the active development
// (loaded + checked by the active file's session), it is checked here: we attach
// its real diagnostics and arrange a reconstructed-type upgrade, and the
// "stale / elsewhere" banner is suppressed. Only a member from a LATER file or a
// different development is genuinely uncovered — that keeps the banner.
function buildCrossFileModel(g, target, view = null) {
  const P = persistOf(g);
  if (!P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') return null;
  const files = P.listFiles();
  const getText = (id) => String(P.getFileText(id) ?? '');
  let graph;
  try {
    graph = dependencyGraph(files, target.fileId, getText, persistDevOpts(P));
  } catch (_) {
    return null;
  }
  const node = [...graph.nodes.values()]
    .find((n) => n.fileId === target.fileId && n.name === target.name) || graph.nodeForName(target.name);
  if (!node) return null;
  const fileName = (files.find((f) => f.id === target.fileId) || {}).name || null;
  let type = null;
  let label = node.label;
  try {
    // The symbol's defining file is known (target.fileId) — read the signature
    // straight from it. (findGroupSignature would skip it as the "active" id.)
    const sig = sourceSignatureOf(getText(target.fileId), target.name, fileName);
    if (sig) { type = sig.type; label = label || sig.label; }
  } catch (_) { /* no signature */ }

  // Where does the target sit relative to the ACTIVE file's development?
  //  - an EARLIER member (prelude): the active session already checked it, so its
  //    diagnostics + a reconstructed type are available right now (fast path);
  //  - a LATER member: the active session never loaded it, so its Tier-2 comes
  //    from the development-scoped check (whole development, cached);
  //  - any member at all → in-development → no "stale, elsewhere" banner.
  let isPrelude = false;
  let inDevelopment = false;
  try {
    const dev = developmentForFile(files, activeFileId(g), getText, persistDevOpts(P));
    isPrelude = !!fileName && dev.preludePaths.includes(fileName);
    inDevelopment = !!fileName && dev.paths.includes(fileName);
  } catch (_) { /* not in a development */ }

  const engine = view ? getEngine(view) : null;
  let crossFileDiagnostics = [];
  // crossDevState is only meaningful for a symbol OUTSIDE the active development:
  //   null         — in-development (active session or its dev-check covers it)
  //   'unchecked'  — a separate development, not yet checked here
  //   'checking'   — its development is being checked on demand
  //   'checked'    — its development was checked; diagnostics are real
  let crossDevState = null;
  if (isPrelude && engine && typeof engine.memberDiagnostics === 'function') {
    try {
      const byFile = engine.memberDiagnostics() || {};
      crossFileDiagnostics = crossFileSymbolDiagnostics(byFile[fileName] || [], node, getText(target.fileId));
    } catch (_) { crossFileDiagnostics = []; }
  } else if (inDevelopment) {
    // Later member: read the development-scoped check's cache; if it hasn't run
    // for this content yet, trigger it and refresh the pinned view when it lands.
    try {
      const dc = getDevelopmentChecker();
      if (dc) {
        const members = developmentMembers(g, view);
        const cached = dc.cachedFor(members);
        if (cached) {
          crossFileDiagnostics = crossFileSymbolDiagnostics(
            cached.memberDiagnostics[fileName] || [], node, getText(target.fileId),
          );
        } else {
          dc.check(members).then(() => refreshPinnedCrossFile()).catch(() => {});
        }
      }
    } catch (_) { crossFileDiagnostics = []; }
  } else {
    // A DIFFERENT development — a separate Beluga program. We don't auto-check it
    // (cost/UX); the user opts in. Surface its real health only once checked.
    crossDevState = 'unchecked';
    try {
      const dc = getDevelopmentChecker();
      const members = developmentMembers(g, view, target.fileId);
      if (dc && members.length) {
        const cached = dc.cachedFor(members);
        if (cached) {
          crossDevState = 'checked';
          crossFileDiagnostics = crossFileSymbolDiagnostics(
            cached.memberDiagnostics[fileName] || [], node, getText(target.fileId),
          );
        } else if (pendingDevChecks.has(developmentSignature(members))) {
          crossDevState = 'checking';
        }
      }
    } catch (_) { crossDevState = 'unchecked'; }
  }
  const hasError = crossFileDiagnostics.some((d) => d.severity === 'error');
  // Honest status: green only when we actually know it's clean (checked, here or
  // in its development); a yet-to-be-checked other development reads as unknown.
  let statusState = 'checked';
  if (hasError && crossDevState === 'checking') statusState = 'error-checking';
  else if (hasError) statusState = 'error';
  else if (crossDevState === 'unchecked') statusState = 'unknown';
  else if (crossDevState === 'checking') statusState = 'checking';

  return {
    name: node.name,
    label,
    namespace: node.namespace,
    isGlobal: true,
    definitionPos: node.nameRange ? node.nameRange.from : (target.pos ?? null),
    definitionRange: node.nameRange || (target.range || null),
    type,
    typeSource: type ? 'source' : null,
    typePending: false,
    statusState,
    statusDetail: hasError ? `${crossFileDiagnostics.length} diagnostic${crossFileDiagnostics.length === 1 ? '' : 's'}` : '',
    needsAsync: false,
    references: [],
    dependsOn: groupByKind(graph.dependenciesOf(node.id)),
    usedBy: groupByKind(graph.dependentsOf(node.id)),
    impact: graph.impactOf(node.id),
    groupNodes: graph.nodes,
    crossFile: true,
    inDevelopment,
    crossDevState,
    crossFileDiagnostics,
    // Only EARLIER members are loaded by the active session, so only they can be
    // upgraded to the reconstructed type via memberTypePromise; later members keep
    // their source signature (correct for LF constructors, the common case). When
    // an upgrade is pending we show the source type with a spinner.
    crossFileTypeName: isPrelude ? node.name : null,
    typeUpgrading: isPrelude && type != null,
    fileId: target.fileId,
    fileName,
  };
}

// The development containing `anchorId` (default: the active file) as
// [{ id, name, text }] in load order, with the active file's LIVE editor text
// spliced in wherever it's a member. The input the development-scoped checker
// keys on. A standalone (orphan) file is a singleton development — its one file.
function developmentMembers(g, view, anchorId = null) {
  const P = persistOf(g);
  if (!P || typeof P.listFiles !== 'function') return [];
  const files = P.listFiles();
  const activeId = activeFileId(g);
  const anchor = anchorId || activeId;
  const stored = (id) => String(P.getFileText(id) ?? '');
  let dev;
  try {
    dev = developmentForFile(files, anchor, stored, persistDevOpts(P));
  } catch (_) {
    return [];
  }
  const liveActive = view?.state?.doc ? view.state.doc.toString() : null;
  const textOf = (f) => ((f.id === activeId && liveActive != null) ? liveActive : stored(f.id));
  const byName = new Map(files.map((f) => [f.name, f]));
  const members = [];
  for (const path of dev.paths) {
    const f = byName.get(path);
    if (!f) continue;
    members.push({ id: f.id, name: f.name, text: textOf(f) });
  }
  // Standalone development: paths is empty, but the anchor file is its own
  // singleton development — check it alone.
  if (!members.length) {
    const f = files.find((x) => x.id === anchor);
    if (f) members.push({ id: f.id, name: f.name, text: textOf(f) });
  }
  return members;
}

// Module-scoped set of development signatures currently being checked on demand
// (cross-development "Check" action) — drives the 'checking' spinner state.
const pendingDevChecks = new Set();

// Opt-in check of the symbol's OWN development (a different Beluga program than
// the active one). Runs the development-scoped checker, showing a spinner while
// in flight, then re-inspects so the symbol's real health appears.
function checkCrossDevelopment(view, model) {
  const g = typeof window !== 'undefined' ? window : self;
  const dc = getDevelopmentChecker();
  if (!dc || !model || !model.fileId) return;
  const members = developmentMembers(g, view, model.fileId);
  if (!members.length) return;
  const sig = developmentSignature(members);
  if (pendingDevChecks.has(sig)) return;
  pendingDevChecks.add(sig);
  refreshPinnedCrossFile(); // re-render into the 'checking' state
  dc.check(members).finally(() => {
    pendingDevChecks.delete(sig);
    refreshPinnedCrossFile();
  });
}

// Re-inspect the pinned cross-file symbol in place (no history) — used when the
// development-scoped check finishes and the panel is still showing that symbol,
// so its freshly-attributed diagnostics appear.
function refreshPinnedCrossFile() {
  const view = dockView();
  if (!view || !panelOpen()) return;
  const target = lastRenderedTarget;
  if (!target || target.kind !== 'symbol' || !target.fileId) return;
  const g = typeof window !== 'undefined' ? window : self;
  if (target.fileId === activeFileId(g)) return; // now local; nothing to refresh here
  const model = buildCrossFileModel(g, target, view);
  if (!model) return;
  suppressHistory();
  rerender(view, { model, boundFile: target.fileId, pos: target.pos });
}

// Home/overview model for a specific file — the active file via the live engine,
// any other suite file via the store (outline from the group graph; no live
// diagnostics, which only the active file's engine produces).
function buildGlobalModelForFile(g, fileId, view) {
  const P = persistOf(g);
  if (!P || typeof P.listFiles !== 'function') return null;
  if (!fileId || fileId === activeFileId(g)) {
    return buildGlobalModel(view ? getEngine(view) : null, view);
  }
  const files = P.listFiles();
  const file = files.find((f) => f.id === fileId);
  const getText = (id) => String(P.getFileText(id) ?? '');
  let outline = [];
  let development = null;
  try {
    const graph = dependencyGraph(files, fileId, getText, persistDevOpts(P));
    outline = [...graph.nodes.values()]
      .filter((n) => n.fileId === fileId && OUTLINE_NS.has(n.namespace))
      .sort((a, b) => (a.nameRange?.from ?? 0) - (b.nameRange?.from ?? 0))
      .map((n) => ({
        id: n.id, name: n.name, label: n.label, namespace: n.namespace,
        nameRange: n.nameRange, fileId, hasError: false,
      }));
    development = developmentForFile(files, fileId, getText, persistDevOpts(P));
  } catch (_) { /* leave empties */ }
  const engine = view ? getEngine(view) : null;
  const rows = holeRows(g, engine, view, fileId);
  const fileText = file ? getText(fileId) : '';
  const ctx = holeGoalContext(g, view, file?.name || null, fileText);
  return assembleGlobalModel({
    fileName: file ? file.name : null,
    outline,
    diagnostics: [],
    holes: rows,
    holesCachedHint: !!holesBannerFromRows(rows, { inDevelopment: ctx.inDevelopment }),
    settle: null,
    development,
    projectFileCount: files.length,
    files,
  });
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

function fileBaseName(name) {
  if (!name) return '';
  const s = String(name);
  return s.slice(s.lastIndexOf('/') + 1);
}

function symbolDefFile(g, view, model) {
  const fileId = model.fileId || inspectorDefFileId(view, model) || editorFileId(g, view);
  if (!fileId) return null;
  let fileName = model.fileName || null;
  const P = g.BelJarPersist;
  if (!fileName && P && typeof P.getFileById === 'function') {
    fileName = (P.getFileById(fileId) || {}).name || null;
  }
  const baseName = fileBaseName(fileName);
  if (!baseName) return null;
  return { fileId, fileName, baseName };
}

function inspectSymbolDefFile(view, model) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const def = symbolDefFile(g, view, model);
  if (!def) return;
  const target = { kind: 'file', name: def.baseName, pos: 0, fileId: def.fileId };
  pushTarget(target);
  goToTarget(target, { moveEditor: followEditor });
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

export function isGlobalOverviewModel(model) {
  return model != null && model.name == null && typeof model.projectFileCount === 'number';
}

export function renderInspector(bodyEl, model, view, engine, opts = {}) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const activePos = opts.activePos ?? view?.state?.selection?.main?.head;
  const jumpOpts = {
    activePos,
    navigate: typeof opts.navigate === 'function' ? opts.navigate : null,
    onBeforeJump: () => {
      suppressInspectorFollow();
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
  const defFile = symbolDefFile(g, view, model);
  if (defFile) {
    const fileLink = el('button', 'inspector-def-file');
    fileLink.type = 'button';
    fileLink.textContent = defFile.baseName;
    setTip(fileLink, `Inspect ${defFile.fileName || defFile.baseName}`);
    fileLink.setAttribute('aria-label', `Inspect ${defFile.fileName || defFile.baseName}`);
    fileLink.addEventListener('click', (e) => {
      e.stopPropagation();
      inspectSymbolDefFile(view, model);
    });
    header.appendChild(fileLink);
  }
  const headerMain = el('div', 'inspector-header-main');
  headerMain.appendChild(statusDot(model.statusState, model.statusDetail));
  headerMain.appendChild(scrollFadeLine('inspector-name', model.name));
  if (model.label) headerMain.appendChild(el('span', 'inspector-kind-pill', model.label));
  header.appendChild(headerMain);
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
        checkCrossDevelopment(view, model);
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
      openCrossFileDefinition(view, model);
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

  const refGathered = referenceGatherForInspector(view, model);
  const usedByCount = groupItemCount(model.usedBy);
  const dependsOnCount = groupItemCount(model.dependsOn);
  beginInspectorSections(model.name, sectionsToCollapse({
    empty: [
      ...(!refGathered.total ? ['references'] : []),
      ...(!usedByCount ? ['used-by'] : []),
      ...(!dependsOnCount ? ['depends-on'] : []),
      ...(!model.impact.length ? ['impact'] : []),
    ],
    counts: {
      references: refGathered.total,
      'used-by': usedByCount,
      'depends-on': dependsOnCount,
      impact: model.impact.length,
    },
  }));

  // References.
  const { sec: refSec, body: refBody } = section('References', refGathered.total, 'references');
  renderReferenceGroups(view, model, refGathered, refBody, jumpOpts);
  scrollInner.appendChild(refSec);

  // Depends on (dependencies) — what this symbol references.
  scrollInner.appendChild(groupSection('Depends on', 'depends-on', model.dependsOn, g, engine,
    'No dependencies.', jumpOpts, model.groupNodes));

  // Used by (dependents) — who depends on this symbol.
  scrollInner.appendChild(groupSection('Used by', 'used-by', model.usedBy, g, engine,
    'Nothing depends on this.', jumpOpts, model.groupNodes));

  // Impact — the full blast radius: the transitive type-cascade first, then
  // terminal implementation uses (tagged, non-cascading). See group-graph.impactOf.
  const { sec: impactSec, body: impactBody, title: impactTitle } = section('Impact', model.impact.length, 'impact');
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
  header.appendChild(scrollFadeLine('inspector-name', model.token || ''));
  if (model.label) header.appendChild(el('span', 'inspector-kind-pill', model.label));
  scrollInner.appendChild(header);
  if (model.goal != null) {
    const row = el('div', 'inspector-builtin-goal');
    const head = el('div', 'inspector-builtin-goal-head');
    head.appendChild(el('span', 'inspector-builtin-goal-label', 'Goal'));
    if (model.goalState === 'cached') appendCachedHint(head, null);
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
    onBeforeJump: () => {
      suppressInspectorFollow();
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
    const { sec: holesSec, body: holesBody, head: holesHead, actions: holesActions } = section('Holes', model.holes.length, 'holes');
    if (model.holesCachedHint) appendCachedHint(holesHead, holesActions);
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

function diagnosticRow(g, d, view, opts) {
  const doc = view?.state?.doc;
  const from = doc ? Math.min(d.from, doc.length) : d.from;
  const line = doc ? doc.lineAt(from) : null;
  const loc = line ? `${line.number}:${from - line.from + 1}` : null;
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
    suppressInspectorFollow();
    opts.onBeforeJump?.();
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
  const loadingLive = hole.loadingLive
    || state === 'pending'
    || state === 'approximate'
    || state === 'rechecking';
  if (loadingLive || state === 'pending') node.classList.add('is-pending');
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
    goal.appendChild(el('span', 'harpoon-hole-unfocused', 'Out of scope: click to compute'));
  } else if (state === 'live' || state === 'cached') {
    if (hole.goal) renderTypeInto(goal, hole.goal, 'comp');
    if (state === 'cached') {
      const hint = createCachedGoalHintIcon();
      if (hint) goal.appendChild(hint);
    }
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
    if (state === 'out-of-scope' && jumpFileId) {
      const ed = g.BelJarEditor;
      if (ed && typeof ed.computeHoleGoalOnDemand === 'function' && view) {
        ed.computeHoleGoalOnDemand(view, jumpFileId, hole.line, hole.col || 1)
          .then(() => {
            g.dispatchEvent(new CustomEvent('beljar:inspector-refresh', { detail: { live: true } }));
          })
          .catch(() => {});
        return;
      }
    }
    suppressInspectorFollow();
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
    suppressInspectorFollow();
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
    const next = buildLiveModel(engine, pos, entry.view);
    if (next && next.type == null && type != null) {
      next.type = type;
      next.statusState = 'checked';
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
  const model = buildLiveModel(engine, pos, entry.view);
  renderInspector(entry.bodyEl, model, entry.view, engine, {
    activePos: pos,
    onBeforeJump: () => markInspectorJump(entry),
  });
  entry.win.setTitle(inspectorWindowTitle());
  if (model?.needsAsync) refreshInspectorAsync(entry, pos);
}

export function openInspectorWindow(view, pos, opts = {}) {
  const g = typeof window !== 'undefined' ? window : self;
  if (typeof g.FloatingWindow === 'undefined') return false;
  const at = pos ?? view.state.selection.main.head;
  const engine = getEngine(view);
  if (!engine) return false;
  const model = resolveInspectModel(view, at);
  if (!model) return false;

  const key = model.name + '@' + at;
  if (!opts.forceNew) {
    const existing = openWindows.get(key);
    if (existing) {
      existing.win.raise();
      return true;
    }
  }

  const bodyEl = document.createElement('div');
  bodyEl.className = 'inspector-body inspector-body-pinned';
  renderInspector(bodyEl, model, view, engine, { activePos: at });

  const title = inspectorWindowTitle();
  const { ref: followRef, action: followAction } = createFollowWindowAction((on) => setInspectorFollow(on));
  const fileId = editorFileId(g, view);
  const pinned = {
    view, engine, win: null, bodyEl, followEditor: false, lastPos: at, renderToken: 0,
    _followFromInspector: false, fileId, persistId: opts.persistId || null,
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
      revealEditorCursor(view, { pos: pinned.lastPos });
    }
    if (g.BelJarWorkspaceState?.scheduleSave) g.BelJarWorkspaceState.scheduleSave();
  }

  let coords = null;
  try {
    coords = view.coordsAtPos(at);
  } catch (_) {
    coords = null;
  }
  const geom = opts.geom;
  const win = g.FloatingWindow.open({
    title,
    content: bodyEl,
    className: 'inspector-window',
    x: geom?.x ?? (coords ? Math.round(coords.right + 12) : undefined),
    y: geom?.y ?? (coords ? Math.round(coords.top) : undefined),
    width: geom?.w ?? 340,
    height: geom?.h ?? 420,
    actions: [followAction],
    onGeometryChange: () => { if (g.BelJarWorkspaceState?.scheduleSave) g.BelJarWorkspaceState.scheduleSave(); },
    onClose: () => {
      openWindows.delete(key);
      if (unregisterInspectorFollow) unregisterInspectorFollow();
      if (g.BelJarWorkspaceState?.scheduleSave) g.BelJarWorkspaceState.scheduleSave();
    },
  });
  pinned.win = win;
  if (!pinned.persistId) pinned.persistId = `inspector:${fileId}:${at}`;
  openWindows.set(key, pinned);

  if (opts.followEditor) setInspectorFollow(true);

  if (model.needsAsync && typeof engine.intelTypePromise === 'function') {
    refreshInspectorAsync(pinned, at);
  }
  if (g.BelJarWorkspaceState?.scheduleSave) g.BelJarWorkspaceState.scheduleSave();
  return true;
}

function shouldHonorInspectorRefresh(detail = {}) {
  if (detail.afterJump) return true;
  if (detail.force) return true;
  if (detail.live) return true;
  if (panelOpen() && !everRendered) return true;
  return followEditor;
}

// Passive content refresh (parse progress, settlement, edits) for whatever the
// panel is currently showing — without chasing the cursor when follow is off.
function shouldRefreshInspectorContent(g, view) {
  if (!panelOpen() || inspectorRenderSuppressed()) return false;
  if (followEditor) return true;
  const active = editorFileId(g, view);
  if (active == null) return false;
  if (boundFile === active) return true;
  if (lastRenderedTarget?.kind === 'symbol' && lastRenderedTarget.fileId === active) return true;
  return false;
}

function liveRerenderOpts(view) {
  const g = typeof window !== 'undefined' ? window : self;
  // Re-inspect the pinned hole at its `?` (rerender rebuilds the hole model there).
  if (lastRenderedTarget?.kind === 'hole') return { pos: lastRenderedTarget.pos };
  if (lastRenderedTarget?.kind === 'symbol') {
    if (lastRenderedTarget.fileId && lastRenderedTarget.fileId !== activeFileId(g)) {
      const model = buildCrossFileModel(g, lastRenderedTarget, view);
      if (model) {
        return {
          model,
          boundFile: lastRenderedTarget.fileId,
          pos: lastRenderedTarget.pos,
        };
      }
    }
    return { pos: lastRenderedTarget.pos };
  }
  const active = editorFileId(g, view);
  if (boundFile && active && boundFile === active) {
    return {
      model: buildGlobalModelForFile(g, boundFile, view),
      boundFile,
      pos: 0,
    };
  }
  return { forceGlobal: true };
}

function rebindPinnedInspectorWindows(view) {
  if (!view) return;
  for (const pinned of openWindows.values()) {
    pinned.view = view;
    pinned.engine = getEngine(view);
    if (pinned.followEditor) syncPinnedInspector(pinned);
  }
}

let lastPos = null;
let suppressFollowUntil = 0;
// Set by a Ctrl/Cmd "jump, don't inspect" so the jump's resulting refresh /
// follow / re-lint does NOT re-render the panel (navigational only).
let suppressRenderUntil = 0;
let inspectorRetryTimer = null;
let lastDiagSig = '';

function suppressInspectorRender(ms = 700) {
  suppressRenderUntil = performance.now() + ms;
}
function inspectorRenderSuppressed() {
  return performance.now() < suppressRenderUntil;
}

// Cheap signature of the document's error/warning diagnostics, to detect when
// they change (e.g. async lint re-running after a tab switch) without a cursor
// or doc edit — which is exactly when the inspector would otherwise go stale.
function diagSignature(state) {
  let sig = '';
  try {
    forEachDiagnostic(state, (d, from, to) => {
      if (d.severity === 'error' || d.severity === 'warning') {
        sig += `${from}:${to}:${d.severity[0]};`;
      }
    });
  } catch (_) { /* lint state not ready */ }
  return sig;
}

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
// The pinned symbol target currently shown (null for home/global), and the
// active editor file when it was rendered — together they let a file switch
// re-evaluate cross-file staleness without changing which symbol is inspected.
let lastRenderedTarget = null;
let inspectorActiveFile = null;

function inspectorScrollOpts(body, model, opts = {}) {
  const sameSymbol = model?.name && model.name === lastInspectorSymbol;
  const preserve = opts.afterJump || (sameSymbol && body.scrollTop > 0);
  if (model?.name) lastInspectorSymbol = model.name;
  else if (!model) lastInspectorSymbol = null;
  return preserve ? { preserveScrollTop: body.scrollTop } : {};
}

// ── Docked-panel controller: sync toggle, panel-local history, search ────────
// Follow is OFF by default: the docked inspector is a deliberate repository, not
// a live lens. Passive editor signals (cursor, file switch, background re-lint)
// only move it when follow is ON; otherwise it changes only via explicit acts
// (open/inspect, panel clicks, search, back/forward, go-to-def jumps).
let followEditor = false;
let followEditorHydrated = false;
// The file id whose content the panel currently shows. Passive re-lint refreshes
// are honored only for THIS file, so switching tabs (follow off) leaves it be.
let boundFile = null;
let everRendered = false;
let history = [];
let histIndex = -1;
let suppressHistoryUntil = 0;
let headerWired = false;
let inspectorGlobalsBound = false;
let searchActive = false;
let searchTimer = null;
let searchHits = [];
let searchActiveIndex = -1;
let lastView = null;

function inspectorPanelEl() {
  return document.getElementById('inspector-panel');
}

function isCfgEditorView(view) {
  return !!view?.dom?.classList?.contains('bel-editor--cfg');
}

function dockView() {
  const g = typeof window !== 'undefined' ? window : self;
  const ed = g.BelJarCurrentEditor;
  if (ed && typeof ed.getView === 'function') {
    const v = ed.getView();
    if (v?.dom?.isConnected) return v;
  }
  return lastView?.dom?.isConnected ? lastView : null;
}

function targetsEqual(a, b) {
  return a && b && a.kind === b.kind && a.name === b.name
    && a.pos === b.pos && (a.fileId || null) === (b.fileId || null);
}

function suppressHistory(ms = 500) {
  suppressHistoryUntil = performance.now() + ms;
}
function historySuppressed() {
  return performance.now() < suppressHistoryUntil;
}

function pushTarget(target) {
  if (!target) return;
  if (targetsEqual(history[histIndex], target)) return;
  history = history.slice(0, histIndex + 1);
  history.push(target);
  if (history.length > 50) history = history.slice(history.length - 50);
  histIndex = history.length - 1;
  updateNavButtons();
  const g = typeof window !== 'undefined' ? window : self;
  if (g.BelJarWorkspaceState?.scheduleSave) g.BelJarWorkspaceState.scheduleSave();
}

function updateNavButtons() {
  const panel = inspectorPanelEl();
  if (!panel) return;
  const back = panel.querySelector('#inspector-nav-back');
  const fwd = panel.querySelector('#inspector-nav-fwd');
  if (back) back.disabled = histIndex <= 0;
  if (fwd) fwd.disabled = histIndex >= history.length - 1;
}

function updateSyncButton() {
  const panel = inspectorPanelEl();
  const btn = panel?.querySelector('#inspector-sync-toggle');
  if (!btn) return;
  btn.classList.toggle('is-on', followEditor);
  btn.setAttribute('aria-pressed', followEditor ? 'true' : 'false');
  const tip = followEditor ? 'Following editor selection' : 'Not following editor selection';
  btn.setAttribute('aria-label', tip);
  setTip(btn, tip);
}

// A panel row was activated. Ctrl/Cmd = pure navigation (jump, no inspect),
// regardless of follow. Plain click = follow ON jumps the editor (and inspects
// via follow); follow OFF inspects in the panel without moving the editor.
function dockedNavigate(target, event) {
  if (!target) return;
  if (event && (event.ctrlKey || event.metaKey)) {
    editorJumpTo(target, { suppressInspect: true });
    return;
  }
  pushTarget(target);
  goToTarget(target, { moveEditor: followEditor });
}

function editorJumpTo(target, { suppressInspect = false } = {}) {
  if (!target || target.kind === 'global') return; // home has no editor location
  const g = typeof window !== 'undefined' ? window : self;
  const fileId = target.fileId || editorFileId(g, dockView());
  if (suppressInspect) { suppressInspectorRender(); suppressInspectorFollow(); }
  dispatchOpenFileAt(g, fileId,
    target.range || { from: target.pos ?? 0, to: target.pos ?? 0 }, target.name);
}

function goToTarget(target, { moveEditor } = {}) {
  const view = dockView();
  if (!view) return;
  const g = typeof window !== 'undefined' ? window : self;
  if (target.kind === 'global') {
    suppressHistory();
    lastView = view;
    if (target.fileId && target.fileId !== editorFileId(g, view)) {
      rerender(view, { model: buildGlobalModelForFile(g, target.fileId, view), boundFile: target.fileId, pos: 0 });
    } else {
      rerender(view, { forceGlobal: true, pos: lastPos });
    }
    return;
  }
  if (moveEditor) {
    // Follow ON → jump the editor; the jump's refresh re-inspects the target.
    suppressHistory();
    editorJumpTo(target);
    return;
  }
  // Follow OFF → inspect in the panel WITHOUT moving the editor, view-independent
  // so it works even if the target lives in a non-active file.
  inspectInPanel(view, target);
}

// A file switch with follow OFF keeps the panel pinned (the inspected symbol
// doesn't change), but the symbol's STALENESS relative to the now-active file
// does — so re-inspect the SAME pinned symbol to refresh its banner / type /
// diagnostics. No-op unless the active file actually changed and a symbol (not
// the home view) is pinned. History is suppressed (it's the same target).
function reinspectPinnedForActiveFile(view) {
  if (!panelOpen() || !everRendered) return;
  const target = lastRenderedTarget;
  if (!target || target.kind !== 'symbol' || !target.fileId) return;
  const g = typeof window !== 'undefined' ? window : self;
  const nowActive = activeFileId(g);
  if (nowActive == null || nowActive === inspectorActiveFile) return;
  suppressHistory();
  if (target.fileId === nowActive) {
    // The pinned symbol now lives in the active file — inspect it live (no banner).
    rerender(view, { pos: target.pos, afterJump: true });
    return;
  }
  const model = buildCrossFileModel(g, target, view);
  if (model) rerender(view, { model, boundFile: target.fileId, pos: target.pos });
  else rerender(view, { pos: target.pos, afterJump: true });
}

function inspectInPanel(view, target) {
  const g = typeof window !== 'undefined' ? window : self;
  suppressHistory();
  if (target.kind === 'file') {
    rerender(view, { model: buildGlobalModelForFile(g, target.fileId, view), boundFile: target.fileId, pos: 0 });
    return;
  }
  if (!target.fileId || target.fileId === activeFileId(g)) {
    rerender(view, { pos: target.pos });
    return;
  }
  const model = buildCrossFileModel(g, target, view);
  if (model) rerender(view, { model, boundFile: target.fileId, pos: target.pos });
  else rerender(view, { pos: target.pos });
}

// The cross-file banner's "open" icon: an explicit go-to-definition. Move the
// editor to the definition regardless of follow state, then drop the cross-file
// framing — the symbol now lives in the active file, so the banner is dispelled.
// (Plain file switches never touch the banner; only this deliberate action does.)
function openCrossFileDefinition(view, model) {
  if (!model || !model.fileId) return;
  const target = {
    kind: 'symbol',
    name: model.name,
    pos: model.definitionPos,
    range: model.definitionRange,
    fileId: model.fileId,
  };
  pushTarget(target);
  suppressHistory();
  editorJumpTo(target, { suppressInspect: true });
  // Keep any later settle-driven refresh pinned to the definition we opened.
  if (model.definitionPos != null) lastPos = model.definitionPos;
  rerender(view, {
    model: { ...model, crossFile: false },
    boundFile: model.fileId,
    pos: model.definitionPos,
  });
}

function goBack() {
  if (histIndex <= 0) return;
  histIndex -= 1;
  updateNavButtons();
  goToTarget(history[histIndex], { moveEditor: followEditor });
}
function goForward() {
  if (histIndex >= history.length - 1) return;
  histIndex += 1;
  updateNavButtons();
  goToTarget(history[histIndex], { moveEditor: followEditor });
}

function goHome() {
  const view = dockView();
  if (!view) return;
  const g = typeof window !== 'undefined' ? window : self;
  const fileId = activeFileId(g);
  if (fileId == null) return;
  const target = { kind: 'global', fileId };
  pushTarget(target);
  goToTarget(target, { moveEditor: false });
}

function hydrateFollowEditor() {
  if (followEditorHydrated) return;
  followEditorHydrated = true;
  const g = typeof window !== 'undefined' ? window : self;
  const P = g.BelJarPersist;
  if (P && typeof P.readStoredInspectorFollow === 'function') {
    followEditor = !!P.readStoredInspectorFollow();
  }
}

function activateEditorFollow(view) {
  if (!view) return;
  const head = view.state.selection.main.head;
  rerender(view, { pos: head });
  revealEditorCursor(view, { pos: lastPos });
}

function setFollowEditor(on) {
  followEditor = !!on;
  updateSyncButton();
  const g = typeof window !== 'undefined' ? window : self;
  const P = g.BelJarPersist;
  if (P && typeof P.writeStoredInspectorFollow === 'function') {
    P.writeStoredInspectorFollow(followEditor);
  }
  if (g.BelJarSettingsUI && typeof g.BelJarSettingsUI.syncFromState === 'function') {
    g.BelJarSettingsUI.syncFromState();
  }
  if (followEditor) {
    clearInspectorFollowSuppress();
    activateEditorFollow(dockView());
  }
}

// ── In-panel suite search ────────────────────────────────────────────────────
// An expanding overlay: the search icon slides into a bar that commandeers the
// header to the left, leaving only the follow toggle. Results land in a floating
// dropdown — the panel body is NEVER touched, so following the cursor and the
// history stack keep working whether or not the search is open.
function searchEls() {
  const panel = inspectorPanelEl();
  if (!panel) return null;
  return {
    header: panel.querySelector('.inspector-header-bar'),
    wrap: panel.querySelector('#inspector-search'),
    input: panel.querySelector('#inspector-search-input'),
    ac: panel.querySelector('#inspector-search-ac'),
  };
}

// Focus expands the bar (the nav group slides away); blur/Escape collapse it.
function openSearch() {
  const e = searchEls();
  if (!e || !e.header || !e.input) return;
  searchActive = true;
  e.header.classList.add('is-search-open');
  e.wrap?.classList.add('is-open');
  e.input.setAttribute('aria-expanded', 'true');
  renderSearchAc(e.input.value);
}

function closeSearch() {
  const e = searchEls();
  searchActive = false;
  searchHits = [];
  searchActiveIndex = -1;
  if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
  if (!e) return;
  e.header?.classList.remove('is-search-open');
  e.wrap?.classList.remove('is-open');
  if (e.input) {
    e.input.value = '';
    e.input.setAttribute('aria-expanded', 'false');
    e.input.blur();
  }
  if (e.ac) { e.ac.hidden = true; e.ac.textContent = ''; }
}

// Every searchable definition visible to the active file — the ACTIVE file's
// own defs (via defsOf, the SAME index peers use, so constructors/lets are
// included, not just the headline outline) plus prelude/suite peers. The
// symmetry is the bug fix: a token must be findable from its own file exactly
// as it is when that file is a prelude of another.
function collectSuiteSymbols() {
  const g = typeof window !== 'undefined' ? window : self;
  const P = g.BelJarPersist;
  const out = [];
  const seen = new Set();
  if (!P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function'
    || typeof P.getActiveFileId !== 'function') {
    return out;
  }
  let files;
  let activeId;
  try {
    files = P.listFiles();
    activeId = P.getActiveFileId();
  } catch (_) {
    return out;
  }
  const active = files.find((f) => f.id === activeId);
  const activeName = active ? active.name : null;
  // Live editor text for the active file (accurate while unsaved), else stored.
  let activeText = '';
  if (lastView?.state?.doc) activeText = lastView.state.doc.toString();
  else { try { activeText = String(P.getFileText(activeId) ?? ''); } catch (_) { activeText = ''; } }
  try {
    for (const d of defsOf(activeText, activeName)) {
      const key = `${d.name}@${activeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: d.name, label: d.label || null, fileId: activeId, fileName: null,
        pos: d.from, range: { from: d.from, to: d.to },
      });
    }
  } catch (_) { /* ignore */ }
  try {
    for (const d of listGroupSymbols(files, activeId, (id) => P.getFileText(id), persistDevOpts(P))) {
      const key = `${d.name}@${d.fileId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: d.name, label: null, fileId: d.fileId, fileName: d.fileName,
        pos: d.from, range: { from: d.from, to: d.to },
      });
    }
  } catch (_) { /* ignore */ }
  return out;
}

function highlightedName(name, query) {
  const span = el('span', 'inspector-search-ac-name');
  const q = String(query || '').toLowerCase();
  const idx = q ? String(name).toLowerCase().indexOf(q) : -1;
  if (idx < 0) {
    span.textContent = name;
    return span;
  }
  if (idx > 0) span.appendChild(document.createTextNode(name.slice(0, idx)));
  span.appendChild(el('mark', 'inspector-search-ac-hl', name.slice(idx, idx + q.length)));
  span.appendChild(document.createTextNode(name.slice(idx + q.length)));
  return span;
}

function searchAcItem(hit, i, query) {
  const item = el('button', 'inspector-search-ac-item');
  item.type = 'button';
  item.setAttribute('role', 'option');
  item.dataset.index = String(i);
  if (i === searchActiveIndex) item.classList.add('is-active');
  item.appendChild(highlightedName(hit.name, query));
  if (hit.fileName) item.appendChild(el('span', 'inspector-search-ac-file', hit.fileName));
  else if (hit.label) item.appendChild(el('span', 'inspector-search-ac-kind', hit.label));
  // Keep the input focused so blur-to-close doesn't fire before the click lands.
  item.addEventListener('mousedown', (ev) => ev.preventDefault());
  item.addEventListener('click', (ev) => pickSearch(hit, ev));
  return item;
}

function renderSearchAc(query) {
  const e = searchEls();
  if (!e || !e.ac) return;
  const q = String(query || '').trim();
  e.ac.textContent = '';
  searchActiveIndex = -1;
  if (!q) {
    searchHits = [];
    e.ac.hidden = true;
    return;
  }
  searchHits = fuzzySearchNodes(collectSuiteSymbols(), q, 30);
  e.ac.hidden = false;
  if (!searchHits.length) {
    e.ac.appendChild(el('div', 'inspector-search-ac-empty', 'No matching symbols.'));
    return;
  }
  searchHits.forEach((hit, i) => e.ac.appendChild(searchAcItem(hit, i, q)));
}

function setSearchActiveIndex(next) {
  const e = searchEls();
  if (!e || !e.ac) return;
  const items = e.ac.querySelectorAll('.inspector-search-ac-item');
  if (!items.length) return;
  searchActiveIndex = ((next % items.length) + items.length) % items.length;
  items.forEach((it, i) => it.classList.toggle('is-active', i === searchActiveIndex));
  items[searchActiveIndex]?.scrollIntoView({ block: 'nearest' });
}

function pickSearch(hit, event) {
  if (!hit) return;
  closeSearch();
  dockedNavigate({ kind: 'symbol', name: hit.name, pos: hit.pos, range: hit.range, fileId: hit.fileId }, event);
}

function ensureHeaderWired() {
  hydrateFollowEditor();
  if (headerWired) return;
  const panel = inspectorPanelEl();
  if (!panel) return;
  const back = panel.querySelector('#inspector-nav-back');
  const fwd = panel.querySelector('#inspector-nav-fwd');
  const home = panel.querySelector('#inspector-nav-home');
  const syncToggle = panel.querySelector('#inspector-sync-toggle');
  const input = panel.querySelector('#inspector-search-input');
  if (!back || !fwd || !syncToggle) return;
  headerWired = true;
  home?.addEventListener('click', goHome);
  back.addEventListener('click', goBack);
  fwd.addEventListener('click', goForward);
  syncToggle.addEventListener('mousedown', (e) => e.preventDefault());
  syncToggle.addEventListener('click', () => setFollowEditor(!followEditor));
  const searchWrap = panel.querySelector('#inspector-search');
  searchWrap?.addEventListener('mousedown', (e) => {
    if (e.target === input) return;
    e.preventDefault();
    input?.focus();
  });
  if (input) {
    input.addEventListener('focus', openSearch);
    input.addEventListener('input', () => {
      const v = input.value;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { searchTimer = null; renderSearchAc(v); }, 110);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSearchActiveIndex(searchActiveIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSearchActiveIndex(searchActiveIndex - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const hit = searchActiveIndex >= 0 ? searchHits[searchActiveIndex] : searchHits[0];
        if (hit) pickSearch(hit, e);
      }
    });
    // Click-away / blur collapses the overlay (delayed so item clicks land first).
    input.addEventListener('blur', () => {
      setTimeout(() => {
        const e = searchEls();
        if (!e) return;
        if (e.wrap?.contains(document.activeElement) || e.ac?.contains(document.activeElement)) return;
        if (searchActive) closeSearch();
      }, 120);
    });
    // Outside pointer dismisses immediately — more reliable than blur for clicks
    // on the panel body or the sidebar switcher. The dropdown rows are excluded
    // so a result click still lands (its own handler closes after navigating).
    document.addEventListener('pointerdown', (e) => {
      if (!searchActive) return;
      const els = searchEls();
      if (!els) return;
      if (els.wrap?.contains(e.target) || els.ac?.contains(e.target)) return;
      closeSearch();
    }, true);
  }
  updateNavButtons();
  updateSyncButton();
}

function clearInspectorProjectEmptyOverlay() {
  const overlay = document.getElementById('inspector-project-empty');
  if (overlay) overlay.hidden = true;
  const body = inspectorBody();
  if (body) body.hidden = false;
}

function rerender(view, opts = {}) {
  const body = inspectorBody();
  if (!body || !view?.dom?.isConnected) return;
  clearInspectorProjectEmptyOverlay();
  lastView = view;
  ensureHeaderWired();
  const g = typeof window !== 'undefined' ? window : self;
  const engine = getEngine(view);
  const forceGlobal = !!opts.forceGlobal || (!engine && isCfgEditorView(view));
  // A caller can hand us a pre-built model (cross-file inspect / cross-file
  // home); otherwise build from the active engine at the resolved position.
  const provided = opts.model !== undefined;
  let model;
  let pos;
  if (provided) {
    model = opts.model;
    pos = opts.pos != null ? opts.pos : lastPos;
  } else {
    const hinted = opts.pos != null ? opts.pos : lastPos;
    // Check the RAW cursor for a hole BEFORE probeIntelPos biases it to a nearby
    // symbol (a `?` sits next to binders that would otherwise win).
    const hole = !forceGlobal && engine ? holeModelAt(engine, view, hinted) : null;
    if (hole) {
      pos = hinted;
      lastPos = pos;
      model = hole;
    } else {
      pos = probeIntelPos(engine, view, hinted);
      lastPos = pos;
      model = forceGlobal ? null : (engine ? buildLiveModel(engine, pos, view) : null);
    }
  }
  boundFile = opts.boundFile != null ? opts.boundFile : editorFileId(g, view);
  // The ACTIVE editor file at render time — distinct from boundFile (the
  // inspected symbol's file). A change here, on a file switch, is what re-arms
  // the cross-file staleness re-evaluation in reinspectPinnedForActiveFile.
  inspectorActiveFile = activeFileId(g);
  everRendered = true;
  const scrollOpts = inspectorScrollOpts(body, model, opts);
  const renderOpts = {
    ...scrollOpts,
    activePos: pos,
    forceGlobal,
    boundFile,
    navigate: dockedNavigate,
    onBeforeJump: () => suppressInspectorFollow(),
  };
  renderInspector(body, model, view, engine, renderOpts);

  if (isGlobalOverviewModel(model) && model.holes?.length) {
    const ed = g.BelJarEditor;
    if (ed && typeof ed.scheduleCertifyHoleGoalsScoped === 'function') {
      const hits = model.holes.map((h) => ({ hole: h, from: h.from, to: h.to }));
      ed.scheduleCertifyHoleGoalsScoped(view, hits);
    }
  }

  if (model && model.isHole) {
    // A hole isn't a symbol, but it IS a pinned target — so a background re-lint
    // re-inspects the `?` at this position instead of falling back to global.
    lastRenderedTarget = { kind: 'hole', pos };
  } else if (model && model.name) {
    // Remember the pinned symbol so a later file switch can re-evaluate its
    // cross-file staleness against the new active file (same symbol, fresh banner).
    lastRenderedTarget = {
      kind: 'symbol',
      name: model.name,
      pos: model.definitionPos != null ? model.definitionPos : pos,
      range: model.definitionRange || null,
      fileId: model.fileId || editorFileId(g, view),
    };
    if (!historySuppressed()) pushTarget(lastRenderedTarget);
  } else if (forceGlobal || isGlobalOverviewModel(model)) {
    const fileId = boundFile || editorFileId(g, view);
    if (fileId != null) {
      lastRenderedTarget = { kind: 'global', fileId };
      if (!historySuppressed()) pushTarget(lastRenderedTarget);
    } else {
      lastRenderedTarget = null;
    }
  } else if (model && model.fileName) {
    lastRenderedTarget = null;
  } else {
    lastRenderedTarget = null;
  }

  // Any newer render invalidates a pending async type upgrade. Bump once here so
  // both the active-model and cross-file paths capture the same generation.
  renderToken += 1;
  const myToken = renderToken;
  // Async type for the live active-engine model.
  if (!provided && model && model.needsAsync && engine && typeof engine.intelTypePromise === 'function') {
    Promise.resolve(engine.intelTypePromise(pos)).then((type) => {
      if (myToken !== renderToken) return;
      if (lastPos !== pos) return;
      if (inspectorBody() !== body || !body.isConnected) return;
      const next = buildLiveModel(engine, pos, view);
      if (next && next.type == null && type != null) {
        next.type = type;
        next.statusState = 'checked';
        next.needsAsync = false;
      }
      renderInspector(body, next, view, engine, renderOpts);
    }).catch(() => {});
  } else if (provided && model && model.crossFileTypeName && engine && typeof engine.memberTypePromise === 'function') {
    // In-development cross-file symbol: upgrade its source signature to the
    // reconstructed type the active session can supply (it loaded the prelude).
    // Always re-render on settle to clear the "reconstructing…" spinner, whether
    // or not a richer type came back.
    const clearUpgrade = (type) => {
      if (myToken !== renderToken) return;
      if (inspectorBody() !== body || !body.isConnected) return;
      const next = (type != null && type !== model.type)
        ? { ...model, type, typeSource: 'reconstructed', typeUpgrading: false }
        : { ...model, typeUpgrading: false };
      renderInspector(body, next, view, engine, renderOpts);
    };
    Promise.resolve(engine.memberTypePromise(model.crossFileTypeName))
      .then(clearUpgrade)
      .catch(() => clearUpgrade(null));
  } else if (!model && !forceGlobal && opts.afterJump && panelOpen()) {
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
    lastView = view;
    ensureHeaderWired();
    const explicit = e?.detail && typeof e.detail.pos === 'number';
    if (explicit) lastPos = e.detail.pos;
    if (explicit || followEditor || !everRendered) {
      requestAnimationFrame(() => rerender(view, explicit ? { pos: e.detail.pos } : {}));
    }
  };

  return EditorView.updateListener.of((update) => {
    boundView = update.view;
    lastView = update.view;
    const g = typeof window !== 'undefined' ? window : self;
    if (!inspectorGlobalsBound) {
      inspectorGlobalsBound = true;
      ensureHeaderWired();
      g.addEventListener('beljar:open-inspector', onOpenRequest);
      g.addEventListener('beljar:active-editor-view', (e) => {
        rebindPinnedInspectorWindows(e?.detail?.view);
      });
      g.addEventListener('beljar:development-checked', () => {
        const view = activeView();
        if (!view || !panelOpen() || inspectorRenderSuppressed()) return;
        if (shouldRefreshInspectorContent(g, view)) {
          rerender(view, liveRerenderOpts(view));
        }
      });
      g.addEventListener('beljar:hole-goals-updated', () => {
        const view = activeView();
        if (!view || !panelOpen() || inspectorRenderSuppressed()) return;
        if (shouldRefreshInspectorContent(g, view)) {
          rerender(view, liveRerenderOpts(view));
        }
      });
      g.addEventListener('beljar:inspector-refresh', (e) => {
        const view = activeView();
        if (!view) return;
        const detail = e?.detail || {};
        if (inspectorRenderSuppressed()) return;
        if (detail.live && shouldRefreshInspectorContent(g, view)) {
          rerender(view, liveRerenderOpts(view));
          return;
        }
        if (!shouldHonorInspectorRefresh(detail)) {
          // Follow off: don't chase the cursor, but DO refresh the pinned
          // symbol's cross-file staleness if the active file just changed.
          reinspectPinnedForActiveFile(view);
          return;
        }
        if (detail.afterJump) clearInspectorFollowSuppress();
        const sel = view.state.selection.main;
        const hinted = detail.pos != null
          ? detail.pos
          : (sel.empty ? sel.head : sel.from);
        lastPos = hinted;
        rerender(view, { pos: hinted, afterJump: !!detail.afterJump });
      });
    }
    const scheduleRerender = (ms, opts = null) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        rerender(update.view, opts || (followEditor ? {} : liveRerenderOpts(update.view)));
      }, ms);
    };

    // Seed once when the panel is open but has never rendered (e.g. it was
    // restored open on load) — regardless of follow, so it's never blank.
    if (panelOpen() && !everRendered) {
      scheduleRerender(0);
      return;
    }

    if (update.docChanged) lastDiagSig = diagSignature(update.state);
    if (update.docChanged && shouldRefreshInspectorContent(g, update.view)) {
      if (followEditor) lastPos = update.state.selection.main.head;
      const settle = getEngine(update.view)?.settleState?.();
      const settling = settle === 'checking' || settle === 'stale';
      scheduleRerender(settling ? 0 : (followEditor ? 120 : 150));
      return;
    }
    if (update.selectionSet) {
      if (!followEditor) return;
      if (performance.now() < suppressFollowUntil || inspectorRenderSuppressed()) return;
      lastPos = update.state.selection.main.head;
      if (!panelOpen()) return;
      scheduleRerender(120);
      return;
    }

    const semanticTicked = update.transactions.some((tr) =>
      tr.effects.some((e) => e.is(belNavSemanticTick)));
    if (semanticTicked && shouldRefreshInspectorContent(g, update.view)) {
      scheduleRerender(80);
      return;
    }

    // Diagnostics changed without a cursor/doc edit (async lint, settlement
    // passes). Refresh the health strip / Diagnostics section / symbol status.
    if (!update.transactions.length || !panelOpen()) return;
    const sig = diagSignature(update.state);
    if (sig === lastDiagSig) return;
    lastDiagSig = sig;
    if (shouldRefreshInspectorContent(g, update.view)) scheduleRerender(150);
  });
}

(function registerInspectorFollowListener() {
  const g = typeof globalThis !== 'undefined' ? globalThis : null;
  if (!g || typeof g.addEventListener !== 'function') return;
  g.addEventListener('beljar:inspector-follow-changed', (e) => {
    setFollowEditor(!!(e && e.detail && e.detail.on));
  });
})();

function serializeInspectorTarget(t) {
  if (!t) return null;
  const out = { kind: t.kind };
  if (t.name) out.name = t.name;
  if (t.fileId) out.fileId = t.fileId;
  if (t.pos != null) out.posHint = t.pos;
  else if (t.posHint != null) out.posHint = t.posHint;
  return out;
}

function resolveInspectorAnchorPos(view, anchor) {
  if (!anchor || !view) return null;
  const doc = view.state.doc;
  const hint = Number(anchor.posHint);
  if (anchor.kind === 'symbol' && anchor.name) {
    const from = isFinite(hint) ? hint : 0;
    const resolved = resolveReferenceJump(doc, { from, to: from }, anchor.name);
    return resolved?.from ?? (isFinite(hint) ? Math.max(0, Math.min(hint, doc.length)) : null);
  }
  if (isFinite(hint)) return Math.max(0, Math.min(hint, doc.length));
  return null;
}

export function collectWorkspaceInspector(out) {
  if (!out.sidebar) return;
  const body = inspectorBody();
  out.sidebar.inspector = {
    target: serializeInspectorTarget(lastRenderedTarget),
    histIndex,
    scrollTop: body ? body.scrollTop : 0,
  };
}

export function restoreWorkspaceInspector(sidebar, deps = {}) {
  const view = deps.view;
  if (!view || !sidebar?.inspector) return;
  const g = typeof window !== 'undefined' ? window : self;
  if (g.BelJarPersist?.readStoredInspectorFollow?.()) return;
  if (!panelOpen()) return;
  const target = sidebar.inspector.target;
  if (!target) return;

  if (target.kind === 'global') {
    if (target.fileId && target.fileId !== editorFileId(g, view)) {
      rerender(view, {
        model: buildGlobalModelForFile(g, target.fileId, view),
        boundFile: target.fileId,
        pos: 0,
      });
    } else {
      rerender(view, { forceGlobal: true, pos: lastPos });
    }
  } else if (target.kind === 'hole') {
    const pos = resolveInspectorAnchorPos(view, target);
    if (pos != null) rerender(view, { pos, afterJump: true });
  } else {
    const pos = resolveInspectorAnchorPos(view, target);
    if (target.kind === 'symbol' && target.fileId && target.fileId !== editorFileId(g, view)) {
      dockedNavigate({
        kind: 'symbol',
        name: target.name,
        fileId: target.fileId,
        pos: pos ?? target.posHint ?? 0,
      }, null);
    } else if (pos != null) {
      rerender(view, { pos, afterJump: true });
    }
  }

  const st = Number(sidebar.inspector.scrollTop);
  if (isFinite(st) && st > 0) {
    requestAnimationFrame(() => {
      const b = inspectorBody();
      if (b) b.scrollTop = st;
    });
  }
}

export function collectFloatingInspectorWindows(fileId, out) {
  if (!Array.isArray(out.floating)) out.floating = [];
  const g = typeof window !== 'undefined' ? window : self;
  for (const pinned of openWindows.values()) {
    const fid = pinned.fileId || editorFileId(g, pinned.view);
    if (fid !== fileId || !pinned.win?.getGeometry) continue;
    const geom = pinned.win.getGeometry();
    const at = pinned.lastPos;
    let name = '';
    try {
      const m = pinned.engine ? buildLiveModel(pinned.engine, at, pinned.view) : null;
      name = m?.name || '';
    } catch (_) { /* ignore */ }
    out.floating.push({
      id: pinned.persistId || `inspector:${fid}:${at}`,
      kind: 'inspector',
      geom,
      fileId: fid,
      anchor: { kind: 'symbol', name, posHint: at },
      followEditor: !!pinned.followEditor,
      zOrder: Number(pinned.win.el?.style?.zIndex) || 0,
    });
  }
}

export function restoreFloatingInspectorWindow(entry, view) {
  if (!entry?.anchor || entry.kind !== 'inspector') return false;
  const at = resolveInspectorAnchorPos(view, entry.anchor);
  if (at == null) return false;
  return openInspectorWindow(view, at, {
    geom: entry.geom,
    followEditor: entry.followEditor,
    persistId: entry.id,
    forceNew: true,
  });
}
