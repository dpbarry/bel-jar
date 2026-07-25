// Inspector model — DOM-free view-models for the Symbol Inspector.
// Owns building/enriching inspect models (live, builtin, global, cross-file, holes).
// No DOM. Side effects only via optional hooks (e.g. buildCrossFileModel's onDevChecked).

import { Text } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { crossFileDefinitionAt, getEngine, navInfoAt, termRangeAt } from './ide-actions.mjs';
import { canFindReferences } from './refs-panel.mjs';
import { builtinTooltipAt } from './builtins.mjs';
import { cfgDiagnostics } from './cfg-lint.mjs';
import { developmentForFile } from '../semantic/development.mjs';
import { getDevelopmentChecker, developmentSignature } from '../semantic/development-check.mjs';
import { getProjectDiagnostics } from '../semantic/project-diagnostics.mjs';
import { sourceSignatureOf } from '../semantic/project-prelude.mjs';
import { dependencyGraph } from '../semantic/workspace-index.mjs';
import { scanFileHoles } from '../harpoon/scan-file-holes.mjs';
import {
  buildHoleDisplayRows,
  fileInActiveDevelopment,
  resolveGoalNearPos,
  resolveGoalStateNearPos,
  settlementGoalsByPos,
} from '../prover/hole-goal-display.mjs';

export const KIND_LABEL = {
  signature: 'In signature',
  body: 'In body',
  notation: 'In notation',
  module: 'In module',
  implicit: 'Implicit',
  coverage: 'Coverage',
};
export const KIND_ORDER = ['signature', 'body', 'notation', 'module', 'implicit', 'coverage'];

// One-glyph badge per declaration namespace, for the outline rows.
export const NS_GLYPH = {
  'lf-type-family': '◇',
  'comp-type': '◆',
  'rec-function': 'ƒ',
  schema: '§',
  typedef: '≔',
  module: '▸',
};

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

export function crossFileInspectTarget(view, at) {
  const cross = crossFileDefinitionAt(view, at);
  if (!cross) return null;
  const range = termRangeAt(view, at);
  const name = range ? view.state.sliceDoc(range.from, range.to) : '';
  if (!name) return null;
  return { ...cross, name, pos: cross.from };
}

export function resolveInspectModel(view, pos, hooks = {}) {
  const at = pos ?? view.state.selection.main.head;
  const engine = getEngine(view);
  if (!engine) return null;
  const live = buildLiveModel(engine, at, view);
  if (live) return live;
  const g = typeof window !== 'undefined' ? window : self;
  const target = crossFileInspectTarget(view, at);
  return target ? buildCrossFileModel(g, target, view, hooks) : null;
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

// Fixity pragmas (`--infix` / `--prefix`) name a user operator but are not
// themselves referable — no used-by, impact, or neighborhood graph.
export function isNotationPragmaModel(model) {
  return !!(model && model.namespace === 'pragma'
    && (model.label === 'infix pragma' || model.label === 'prefix pragma'));
}

// Replace the single-file dependency data with the suite-wide group graph so
// "Used by / Depends on / Impact" span files (a proof's prelude constructors,
// etc.). Mutates + returns the model. No-op for locals or when no project store.
export function enrichWithGroupGraph(model, view) {
  if (!model || !model.name || LOCAL_NAMESPACES.has(model.namespace)) return model;
  if (isNotationPragmaModel(model)) return model;
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
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
export function holeModelAt(engine, view, pos) {
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
export function holeTokenContains(engine, doc, pos) {
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
export function buildLiveModel(engine, pos, view) {
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

export function activeDevelopmentPaths(g, view) {
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

export function holeGoalContext(g, view, fileName, fileText) {
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
export function holeGoalNear(engine, doc, pos, ctx) {
  if (!ctx) return null;
  return resolveGoalNearPos(engine, doc, pos, ctx);
}

export function cfgBaseName(cfgPath) {
  if (!cfgPath) return null;
  const base = String(cfgPath).slice(String(cfgPath).lastIndexOf('/') + 1);
  return base.replace(/\.cfg$/i, '');
}

export function persistDevOpts(P) {
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
    .map((d) => ({
      severity: d.severity,
      message: d.message || d.text || '',
      from: d.from,
      to: d.to,
      target: d.target || null,
    }))
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
    checking: settle === 'checking' || settle === 'stale',
    outline: outline || [],
    suite,
    projectFileCount,
  };
}

// Global view fed from the live engine + project store. Mirrors how the rest of
// the bundle reads window.Persist for cross-file context.
export function buildGlobalModel(engine, view) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
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
  return assembleGlobalModel({
    fileName,
    outline,
    diagnostics,
    holes: rows,
    settle,
    development,
    projectFileCount,
    files,
  });
}

export function holeRows(g, engine, view, fileId = null) {
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

export function persistOf(g) {
  return g && g.Persist ? g.Persist : null;
}
export function activeFileId(g) {
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
export function buildCrossFileModel(g, target, view = null, hooks = {}) {
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

  // Prefer the central project index (settlement + development triangulation).
  const indexHealth = getProjectDiagnostics().forFile(target.fileId);
  const indexDiags = (indexHealth.diagnostics || []).map((d) => ({
    line: d.line,
    message: d.message,
    severity: d.severity,
  }));
  if (indexDiags.length) {
    crossFileDiagnostics = crossFileSymbolDiagnostics(indexDiags, node, getText(target.fileId));
  }

  if (isPrelude && !crossFileDiagnostics.length && engine && typeof engine.memberDiagnostics === 'function') {
    try {
      const byFile = engine.memberDiagnostics() || {};
      crossFileDiagnostics = crossFileSymbolDiagnostics(byFile[fileName] || [], node, getText(target.fileId));
    } catch (_) { crossFileDiagnostics = []; }
  } else if (inDevelopment && !isPrelude) {
    // Later member: ensure development-check has run; index will pick it up.
    try {
      const dc = getDevelopmentChecker();
      if (dc) {
        const members = developmentMembers(g, view);
        const cached = dc.cachedFor(members);
        if (!cached) {
          dc.check(members).then(() => hooks?.onDevChecked?.()).catch(() => {});
        } else if (!crossFileDiagnostics.length) {
          crossFileDiagnostics = crossFileSymbolDiagnostics(
            cached.memberDiagnostics[fileName] || [], node, getText(target.fileId),
          );
        }
      }
    } catch (_) { /* keep index result */ }
  } else if (!inDevelopment) {
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
          if (!crossFileDiagnostics.length) {
            crossFileDiagnostics = crossFileSymbolDiagnostics(
              cached.memberDiagnostics[fileName] || [], node, getText(target.fileId),
            );
          }
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
export function developmentMembers(g, view, anchorId = null) {
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
export const pendingDevChecks = new Set();
export function buildGlobalModelForFile(g, fileId, view) {
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
  return assembleGlobalModel({
    fileName: file ? file.name : null,
    outline,
    diagnostics: [],
    holes: rows,
    settle: null,
    development,
    projectFileCount: files.length,
    files,
  });
}

export function isGlobalOverviewModel(model) {
  return model != null && model.name == null && typeof model.projectFileCount === 'number';
}
