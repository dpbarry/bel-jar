// Owns how BelJar answers hole goals and file health across settlement,
// development-check, and the hole-goals store. Not CM mount, not the prover
// search loop — those stay in bel-editor / prover-orchestrator.
//
// Callers (shell / harpoon / inspector) reach public APIs via BelEditor
// re-exports from editor.mjs. Mount imports developmentMembersForFile and
// publishMemberSyntax for settlement/suite wiring that shares the same members.

import { syntaxTree } from '@codemirror/language';
import { isCfgPath, isSignaturePath } from '../project-paths.mjs';
import { cfgFileDiagnostics } from '../ide/cfg-lint.mjs';
import { checkerSnapshot } from '../semantic/checker-snapshot.mjs';
import { parseDecl, locateMember } from '../harpoon/harpoon-program.mjs';
import { memberSpanFromTree } from '../harpoon/scan-file-holes.mjs';
import { listDevelopmentMembers, developmentForFile } from '../semantic/development.mjs';
import {
  getDevelopmentChecker,
  findMemberHole,
  fileContentSig,
  developmentSignature,
} from '../semantic/development-check.mjs';
import {
  getProjectDiagnostics,
  computeFileHealthKey,
} from '../semantic/project-diagnostics.mjs';
import { assembleCheckerCode, buildPrelude } from '../semantic/project-prelude.mjs';
import { healthFromDiagnostics } from '../semantic/file-health-store.mjs';
import { getCheckTrace } from '../perf/check-trace.mjs';
import { parseHoles } from './hole-report.mjs';
import {
  syncHoleGoalsFromDevelopment,
  getHoleGoalsStore,
} from './hole-goals-store.mjs';
import {
  buildHoleDisplayRows,
  settlementGoalsByPos,
  fileInActiveDevelopment,
  resolveHoleGoalForPosition,
} from './hole-goal-display.mjs';
import { proveOrchestrationCode, mapProveHolesToDocHits } from './prover-orchestrator.mjs';

function persistDevOptsFromGlobal() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
  if (!P) return {};
  return {
    getActiveCfgsForDir: typeof P.getActiveCfgsForDir === 'function'
      ? (dir) => P.getActiveCfgsForDir(dir)
      : undefined,
    getActiveCfgForDir: typeof P.getActiveCfgForDir === 'function'
      ? (dir) => P.getActiveCfgForDir(dir)
      : undefined,
  };
}

/** Members of the development containing [fileId]. Live editor text is spliced in
 * only when [fileId] is the file currently open — never from another buffer. */
export function developmentMembersForFile(view, fileId) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
  if (!P || !fileId) return { members: [], paths: [] };
  const files = P.listFiles();
  const editorActiveId = P.getActiveFileId();
  const live = view?.state?.doc ? view.state.doc.toString() : null;
  const getText = (id) => (id === editorActiveId && live != null ? live : P.getFileText(id));
  const liveFor = fileId === editorActiveId ? live : null;
  return listDevelopmentMembers(
    files, fileId, getText, persistDevOptsFromGlobal(), liveFor,
  );
}

function dispatchDevelopmentChecked() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  g.dispatchEvent(new CustomEvent('beljar:development-checked'));
}

let devCheckInflight = null;
let devCheckInflightSig = '';

/** @deprecated Index publishes push updates; kept as a no-op for callers. */
export function invalidateFileHealthCache() {}

function lineOfOffset(text, offset) {
  let line = 1;
  const end = Math.min(Math.max(0, offset), text.length);
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/** Drop observations for a changed file and every suite peer that could depend on it. */
export function invalidateFileHealthAfterChange(fileId) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
  const index = getProjectDiagnostics();
  if (!P || !fileId) {
    if (fileId) index.forget(fileId);
    return;
  }
  const files = P.listFiles();
  const changed = files.find((f) => f.id === fileId);
  if (!changed) {
    index.forget(fileId);
    return;
  }
  const getText = (id) => String(P.getFileText(id) ?? '');
  const opts = persistDevOptsFromGlobal();
  const touched = new Set([fileId]);
  const changedIsCfg = isCfgPath(changed.name);

  for (const f of files) {
    if (!isSignaturePath(f.name) && !isCfgPath(f.name)) continue;
    if (f.id === fileId) continue;
    let dev;
    try {
      dev = developmentForFile(files, f.id, getText, opts);
    } catch (_) {
      continue;
    }
    if (changedIsCfg && (dev.cfg === changed.name || String(dev.scopeKey || '').includes(changed.name))) {
      touched.add(f.id);
      continue;
    }
    if ((dev.paths || []).includes(changed.name) || (dev.preludePaths || []).includes(changed.name)) {
      touched.add(f.id);
    }
  }

  for (const id of touched) index.forget(id, { quiet: true });
  // One notify for explorer refresh.
  index.forget(fileId);
}

/** Quiet no-op — observations replace syntax-layer bootstrap. */
export function publishMemberSyntax(_members, _opts = {}) {}

function publishDevelopmentDiagnostics(members, result) {
  const index = getProjectDiagnostics();
  const list = Array.isArray(members) ? members : [];
  index.registerFiles(list);
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
  const files = P?.listFiles?.() || list.map((m) => ({ id: m.id, name: m.name }));
  const getText = (id) => {
    const m = list.find((x) => x.id === id);
    return m ? String(m.text ?? '') : String(P?.getFileText?.(id) ?? '');
  };
  const byName = result?.memberDiagnostics || {};
  const seen = new Set();
  let scopeKey = '';
  for (const m of list) {
    seen.add(m.id);
    const diags = byName[m.name] || [];
    const rows = diags.map((d) => ({
      line: d.line,
      message: d.message || '',
      severity: d.severity || 'error',
    }));
    const key = computeFileHealthKey(m.id, {
      files,
      getText,
      text: m.text,
      members: list,
      developmentOptions: persistDevOptsFromGlobal(),
    });
    if (!scopeKey) {
      try {
        scopeKey = developmentForFile(files, m.id, getText, persistDevOptsFromGlobal()).scopeKey || '';
      } catch (_) { scopeKey = ''; }
    }
    index.setObservation(m.id, rows, {
      fileName: m.name,
      key,
      source: 'development',
      quiet: true,
    });
  }
  if (scopeKey) {
    const prefix = `${scopeKey}|`;
    index.forgetWhere((id, obs) => !seen.has(id) && String(obs.key || '').startsWith(prefix), { quiet: true });
  }
}

function runDevelopmentCheck(dc, members) {
  const perf = getCheckTrace();
  const span = perf.enabled ? perf.spanStart('dev-check:total', { members: members.length }) : null;
  return dc.check(members).then((result) => {
    if (span) perf.spanEnd(span, { ok: result?.ok });
    syncHoleGoalsFromDevelopment(members, result?.memberHoles);
    publishDevelopmentDiagnostics(members, result);
    dispatchDevelopmentChecked();
    return result;
  }).catch((err) => {
    if (span) perf.spanEnd(span, { ok: false });
    throw err;
  });
}

/** Read health from the observation store (keyed; drops stale on mismatch). */
export function fileHealthFor(fileId, liveText = null) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
  const index = getProjectDiagnostics();
  if (!P || !fileId) return { errors: 0, warnings: 0, items: [], stale: false };
  const file = P.getFileById(fileId);
  if (!file) return { errors: 0, warnings: 0, items: [], stale: false };
  index.registerFiles([file]);

  if (isCfgPath(file.name)) {
    const text = liveText != null ? liveText : String(P.getFileText(fileId) ?? '');
    const diags = cfgFileDiagnostics(text, file.name).map((d) => ({
      line: lineOfOffset(text, d.from),
      message: d.message,
      severity: d.severity,
    }));
    // Cfg: prefer live active if this is the open cfg; else observation / bootstrap.
    const activeId = P.getActiveFileId?.();
    if (fileId === activeId) {
      return healthFromDiagnostics(diags);
    }
    const key = `cfg|${fileContentSig(text)}|`;
    const health = index.forFile(fileId, { currentKey: key, quiet: true });
    if (health.errors || health.warnings || health.items?.length) return health;
    // Never opened: surface current cfg lint without durable write on every explorer paint.
    return healthFromDiagnostics(diags);
  }

  if (!isSignaturePath(file.name)) {
    return { errors: 0, warnings: 0, items: [], stale: false };
  }

  // Open file: activeLive is authoritative — skip key recomputation on the
  // keystroke path (file-lint → belFileHealth).
  const activeId = P.getActiveFileId?.();
  if (fileId === activeId) {
    const health = index.forFile(fileId, { quiet: true });
    return {
      errors: health.errors,
      warnings: health.warnings,
      items: health.items,
      stale: !!health.stale,
    };
  }

  const text = liveText != null ? liveText : String(P.getFileText(fileId) ?? '');
  const files = P.listFiles();
  const { members } = listDevelopmentMembers(
    files, fileId, (id) => (id === fileId ? text : P.getFileText(id)),
    persistDevOptsFromGlobal(),
    null,
  );
  const currentKey = computeFileHealthKey(fileId, {
    files,
    getText: (id) => (id === fileId ? text : String(P.getFileText(id) ?? '')),
    text,
    members,
    developmentOptions: persistDevOptsFromGlobal(),
  });
  const health = index.forFile(fileId, { currentKey, quiet: true });
  return {
    errors: health.errors,
    warnings: health.warnings,
    items: health.items,
    stale: !!health.stale,
  };
}

export function ensureDevelopmentChecked(view) {
  const dc = getDevelopmentChecker();
  const P = typeof window !== 'undefined' ? window : globalThis;
  const persist = P.Persist;
  if (!dc || !persist || !view) return;
  const activeId = persist.getActiveFileId();
  const { members } = developmentMembersForFile(view, activeId);
  if (!members.length) return;
  const sig = developmentSignature(members);
  if (dc.cachedFor(members)) return;
  if (devCheckInflight && devCheckInflightSig === sig) return devCheckInflight;
  devCheckInflightSig = sig;
  devCheckInflight = runDevelopmentCheck(dc, members).finally(() => {
    devCheckInflight = null;
    devCheckInflightSig = '';
  });
  return devCheckInflight;
}

export function ensureDevelopmentCheckedForFile(view, fileId) {
  const dc = getDevelopmentChecker();
  if (!dc || !view || !fileId) return;
  const { members } = developmentMembersForFile(view, fileId);
  if (!members.length || dc.cachedFor(members)) return;
  runDevelopmentCheck(dc, members).catch(() => {});
}

/** Settlement first, then development-check, then settlement again. */
export async function computeHoleGoalOnDemand(view, fileId, line, col) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const dc = getDevelopmentChecker();
  const P = g.Persist;
  if (!dc || !P || !fileId) return null;
  const files = P.listFiles();
  const file = files.find((f) => f.id === fileId);
  if (!file) return null;
  const { members } = developmentMembersForFile(view, fileId);
  if (!members.length) return null;

  const holesFor = (map) => findMemberHole(map?.[file.name], line, col);

  const api = g.CurrentEditor;
  const eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
  if (eng && typeof eng.memberHoles === 'function') {
    const settled = holesFor(eng.memberHoles());
    if (settled) return settled;
  }

  let result = dc.cachedFor(members);
  if (result?.memberHoles) syncHoleGoalsFromDevelopment(members, result.memberHoles);
  if (!result) {
    try {
      result = await runDevelopmentCheck(dc, members);
    } catch (_) {
      return null;
    }
  }
  const fromDev = holesFor(result?.memberHoles);
  if (fromDev) return fromDev;

  if (eng && typeof eng.memberHoles === 'function') {
    return holesFor(eng.memberHoles());
  }
  return null;
}

/** File-scoped twin of the active editor's getHoleActionContext(). */
export function holeActionContextForFile(fileId) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
  if (!P || !fileId) return null;
  const files = P.listFiles();
  const file = files.find((f) => f.id === fileId);
  if (!file) return null;
  const api = g.CurrentEditor;
  const live = fileId === P.getActiveFileId() && api && typeof api.getValue === 'function'
    ? api.getValue()
    : null;
  const getText = (id) => (id === fileId && live != null ? live : String(P.getFileText(id) ?? ''));
  const fileText = getText(fileId);
  const prelude = buildPrelude(files, fileId, getText);
  const assembled = assembleCheckerCode(fileText, prelude);
  return {
    code: assembled.code,
    offsetLines: assembled.prelude ? assembled.prelude.offsetLines : 0,
    fileStart: assembled.fileOffset != null ? assembled.fileOffset : 0,
    fileText,
  };
}

export function cachedDevelopmentMemberHoles(view) {
  const dc = getDevelopmentChecker();
  const P = typeof window !== 'undefined' ? window : globalThis;
  const persist = P.Persist;
  if (!dc || !persist) return {};
  const { members } = developmentMembersForFile(view, persist.getActiveFileId());
  const cached = dc.cachedFor(members);
  if (cached?.memberHoles) syncHoleGoalsFromDevelopment(members, cached.memberHoles);
  return getHoleGoalsStore().freshMap(members.map((m) => ({ name: m.name, text: m.text })));
}

export function cachedMemberHolesForFile(view, fileId) {
  const dc = getDevelopmentChecker();
  if (!dc || !fileId) return {};
  const { members } = developmentMembersForFile(view, fileId);
  const cached = dc.cachedFor(members);
  if (cached?.memberHoles) syncHoleGoalsFromDevelopment(members, cached.memberHoles);
  return getHoleGoalsStore().freshMap(members.map((m) => ({ name: m.name, text: m.text })));
}

export function freshHoleGoalsForProject(view) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
  if (!P || typeof P.listFiles !== 'function') return {};
  const files = P.listFiles();
  const activeId = P.getActiveFileId();
  const live = view?.state?.doc ? view.state.doc.toString() : null;
  const entries = files.map((f) => ({
    name: f.name,
    text: (f.id === activeId && live != null) ? live : String(P.getFileText(f.id) ?? ''),
  }));
  return getHoleGoalsStore().freshMap(entries);
}

export function freshHoleGoalsForDevelopment(view) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
  if (!P) return {};
  const activeId = P.getActiveFileId();
  const { members } = developmentMembersForFile(view, activeId);
  return getHoleGoalsStore().freshMap(members.map((m) => ({ name: m.name, text: m.text })));
}

export function freshHoleGoalsForFile(view, fileId) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
  if (!P || !fileId) return {};
  const files = P.listFiles();
  const file = files.find((f) => f.id === fileId);
  if (!file) return {};
  const activeId = P.getActiveFileId();
  const live = view?.state?.doc ? view.state.doc.toString() : null;
  const text = (file.id === activeId && live != null) ? live : String(P.getFileText(file.id) ?? '');
  const holes = getHoleGoalsStore().fresh(file.name, fileContentSig(text));
  return holes?.length ? { [file.name]: holes } : {};
}

export function developmentMemberPaths(view) {
  const P = typeof window !== 'undefined' ? window : globalThis;
  if (!P.Persist) return [];
  const activeId = P.Persist.getActiveFileId();
  const { members, paths } = developmentMembersForFile(view, activeId);
  if (paths.length) return paths;
  return members.map((m) => m.name);
}

function declSpanAt(view, pos) {
  if (!view?.state) return null;
  const tree = syntaxTree(view.state);
  const member = memberSpanFromTree(tree, pos);
  if (member) return member;
  let node = tree.resolveInner(pos, 1);
  while (node && node.parent && node.parent.name !== 'Program') {
    node = node.parent;
  }
  if (!node || node.name === 'Program') return null;
  return { from: node.from, to: node.to };
}

export function enrichHoleHitsWithGoalState(view, hits, fileName, engine, opts = {}) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
  const activeId = P?.getActiveFileId?.();
  const isActive = opts.isActiveFile != null
    ? opts.isActiveFile
    : !!(view && P && opts.fileId && opts.fileId === activeId);
  const doc = isActive && view?.state?.doc ? view.state.doc : null;
  const fileText = doc
    ? doc.toString()
    : String(opts.fileText ?? '');
  const devPaths = opts.developmentPaths
    || (view ? developmentMemberPaths(view) : []);
  const inDevelopment = opts.inDevelopment != null
    ? opts.inDevelopment
    : fileInActiveDevelopment(fileName, devPaths);
  const settle = isActive && engine ? engine.settleState?.() : null;
  const goalsByPos = isActive ? settlementGoalsByPos(engine, settle) : new Map();
  const syntactic = (hits || []).map((hit, i) => ({
    index: hit.hole?.index ?? i,
    line: hit.hole?.line,
    col: hit.hole?.col || 1,
    from: hit.from,
    to: hit.to,
  }));
  const rows = buildHoleDisplayRows({
    fileName,
    fileText,
    doc,
    inDevelopment,
    settleState: settle,
    syntacticHoles: syntactic,
    settlementGoalsByPos: goalsByPos,
  });
  const byKey = new Map(rows.map((r) => [`${r.line}:${r.col}`, r]));
  return (hits || []).map((hit) => {
    const key = `${hit.hole.line}:${hit.hole.col || 1}`;
    const row = byKey.get(key);
    if (!row) return hit;
    return {
      ...hit,
      hole: {
        ...hit.hole,
        goal: row.goal ?? hit.hole.goal ?? null,
        goalState: row.goalState,
        loadingLive: row.loadingLive,
      },
    };
  });
}

let certifyHoleGoalsTimer = null;
let certifyHoleGoalsInflight = null;
let certifyHoleGoalsAttemptKey = null;

function certifyHoleGoalsNeedKey(view, hits) {
  const P = typeof window !== 'undefined' ? window.Persist : null;
  if (!view?.state?.doc || !P || !hits?.length) return '';
  const need = hits.filter((h) => {
    const st = h.hole?.goalState;
    return st === 'pending' || st === 'approximate';
  });
  if (!need.length) return '';
  const sig = fileContentSig(view.state.doc.toString());
  const pos = need.map((h) => `${h.hole.line}:${h.hole.col || 1}`).sort().join(',');
  return `${sig}|${pos}`;
}

export function scheduleCertifyHoleGoalsScoped(view, hits) {
  const attemptKey = certifyHoleGoalsNeedKey(view, hits);
  if (!attemptKey) return;
  if (attemptKey === certifyHoleGoalsAttemptKey && (certifyHoleGoalsInflight || certifyHoleGoalsTimer)) return;
  if (certifyHoleGoalsTimer) clearTimeout(certifyHoleGoalsTimer);
  certifyHoleGoalsTimer = setTimeout(() => {
    certifyHoleGoalsTimer = null;
    if (!view?.state?.doc) return;
    const liveHits = hits.filter((h) => {
      if (h.from == null || h.from >= view.state.doc.length) return false;
      if (view.state.doc.sliceString(h.from, h.from + 1) !== '?') return false;
      const st = h.hole?.goalState;
      return st === 'pending' || st === 'approximate';
    });
    if (!liveHits.length) return;
    const freshKey = certifyHoleGoalsNeedKey(view, liveHits);
    if (!freshKey || freshKey !== attemptKey) return;
    certifyHoleGoalsScoped(view, liveHits, freshKey).catch(() => {});
  }, 150);
}

export async function certifyHoleGoalsScoped(view, hits, attemptKey) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const client = g.BelugaClient;
  const P = g.Persist;
  if (!view || !client || !P || !hits?.length) return;
  const need = hits.filter((h) => {
    const st = h.hole?.goalState;
    return st === 'pending' || st === 'approximate';
  });
  if (!need.length) return;
  const key = attemptKey || certifyHoleGoalsNeedKey(view, hits);
  if (!key) return;
  if (key === certifyHoleGoalsAttemptKey && certifyHoleGoalsInflight) return certifyHoleGoalsInflight;
  if (certifyHoleGoalsInflight) return certifyHoleGoalsInflight;

  const activeId = P.getActiveFileId();
  const files = P.listFiles();
  const active = files.find((f) => f.id === activeId);
  if (!active) return;

  const doc = view.state.doc;
  const fileCode = checkerSnapshot(syntaxTree(view.state), doc).code;
  const getText = (id) => (id === activeId ? doc.toString() : P.getFileText(id));
  const prelude = buildPrelude(files, activeId, getText);
  const assembled = assembleCheckerCode(fileCode, prelude);
  const assembledCode = assembled.code;
  const fileStart = assembled.fileOffset != null ? assembled.fileOffset : 0;

  const byDecl = new Map();
  for (const hit of need) {
    const span = declSpanAt(view, hit.from);
    if (!span) continue;
    const decl = parseDecl(doc.sliceString(span.from, span.to));
    if (!decl) continue;
    const declKey = decl.kw + ':' + decl.name;
    if (!byDecl.has(declKey)) {
      const loc = locateMember(assembledCode, decl.name, fileStart);
      if (!loc) continue;
      const blockStart = loc.blockFrom != null ? loc.blockFrom : loc.from;
      const blockEnd = loc.blockTo != null ? loc.blockTo : loc.to;
      byDecl.set(declKey, { decl, declStart: blockStart, declEnd: blockEnd, hits: [] });
    }
    byDecl.get(declKey).hits.push(hit);
  }
  if (!byDecl.size) return;

  const contentSig = fileContentSig(doc.toString());
  certifyHoleGoalsInflight = (async () => {
    let changed = false;
    try {
      if (client.beginProverSession) await client.beginProverSession();
      for (const { decl, declStart, declEnd, hits: declHits } of byDecl.values()) {
        const proveCode = proveOrchestrationCode(assembledCode, decl.name, declStart, declEnd, fileStart);
        if (client.loadProverChecker) await client.loadProverChecker(proveCode);
        const res = client.checkResultForProver
          ? await client.checkResultForProver(proveCode)
          : await client.checkResult(proveCode);
        if (!res?.ok || !res.output) continue;
        const parsed = parseHoles(res.output);
        if (!parsed.length) continue;
        const docHoles = mapProveHolesToDocHits(parsed, proveCode, decl.name, declHits);
        if (!docHoles.length) continue;
        if (getHoleGoalsStore().merge(active.name, contentSig, docHoles)) changed = true;
      }
      if (changed) g.dispatchEvent?.(new CustomEvent('beljar:hole-goals-updated'));
    } finally {
      certifyHoleGoalsAttemptKey = key;
      if (client.endProverSession) client.endProverSession();
      certifyHoleGoalsInflight = null;
    }
  })();
  return certifyHoleGoalsInflight;
}

export function resolveHoleGoalForHit(view, engine, hit) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.Persist;
  if (!view?.state?.doc || !hit?.hole || !P) {
    return { goal: null, state: 'pending', loadingLive: true };
  }
  const active = P.listFiles?.()?.find((f) => f.id === P.getActiveFileId());
  if (!active) return { goal: null, state: 'pending', loadingLive: true };
  const settle = engine?.settleState?.() ?? null;
  let settlementGoal = null;
  if (settle === 'ready' && typeof engine.getHoles === 'function') {
    for (const h of engine.getHoles()) {
      if (h.line === hit.hole.line && (h.col || 1) === (hit.hole.col || 1)) {
        settlementGoal = h.goal || null;
        break;
      }
    }
  }
  return resolveHoleGoalForPosition({
    fileName: active.name,
    fileText: view.state.doc.toString(),
    line: hit.hole.line,
    col: hit.hole.col,
    inDevelopment: true,
    settleState: settle,
    settlementGoal,
  });
}
