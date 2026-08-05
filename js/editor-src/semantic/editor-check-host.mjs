// Live open-buffer ↔ Beluga / project-health host.
// Owns check context, suite-prelude overlay, file-health sync, and when
// whole-development check may run. CM mount and semantic sync coalesce stay
// in bel-editor; hole goals stay in hole-goal-system.

import { syntaxTree } from '@codemirror/language';
import { checkerSnapshot } from './checker-snapshot.mjs';
import { analyzeSuite, findingMessage, suiteFileDiagnostics } from '../ide/suite-lint.mjs';
import { getCheckTrace } from '../perf/check-trace.mjs';
import {
  developmentMembersForFile,
  ensureDevelopmentChecked,
} from '../prover/hole-goal-system.mjs';
import { syncHoleGoalsFromSettlement } from '../prover/hole-goals-store.mjs';
import { developmentForFile } from './development.mjs';
import { getDevelopmentChecker, developmentSignature } from './development-check.mjs';
import { ownDiagRowsFromDiagnostics } from './file-health-store.mjs';
import { preludeCacheMatches } from './prelude-cache-key.mjs';
import {
  getProjectDiagnostics,
  computeFileHealthKey,
} from './project-diagnostics.mjs';
import {
  assembleCheckerCode,
  buildPrelude,
  preludeFilesFor,
} from './project-prelude.mjs';
import { computeSettleDelayMs, SETTLE_DELAY_MS } from './settle-delay.mjs';
import { suitePreludeBannerForActive } from './suite-prelude-banner.mjs';

function fnv1a(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${s.length.toString(16)}:${h.toString(16).padStart(8, '0')}`;
}

function emptyCheckContextCache() {
  return {
    preludeIds: null,
    preludeTexts: null,
    prelude: null,
    preludeFp: '',
    activeDoc: null,
    activeFp: '',
    value: null,
  };
}

/**
 * @param {object} deps
 * @param {() => any} deps.getGlobal
 * @param {() => import('@codemirror/view').EditorView | null} deps.getView
 * @param {() => any} deps.getEngine
 * @param {(view: any) => void} deps.refreshSettlementLint
 * @param {() => (view: any) => void} deps.getRefreshIdeStatus
 */
export function createEditorCheckHost(deps) {
  const getGlobal = deps.getGlobal;
  const getView = deps.getView;
  const getEngine = deps.getEngine;
  const refreshSettlementLint = deps.refreshSettlementLint;
  const getRefreshIdeStatus = deps.getRefreshIdeStatus;

  let checkContextCache = emptyCheckContextCache();
  let lastSettledNonActiveDevSig = '';
  let suiteOverlayGeneration = 0;
  let suiteOverlayValue = [];
  let devCheckDebounceTimer = null;

  function persist() {
    return getGlobal().Persist;
  }

  function healthySnapshotForView() {
    const view = getView();
    if (!view) return '';
    const doc = view.state.doc;
    return checkerSnapshot(syntaxTree(view.state), doc).code;
  }

  function suiteAnalysisFor(files, activeId, getText, doc) {
    const pre = preludeFilesFor(files, activeId, getText);
    if (!pre.length) return { diagnostics: [], findings: [] };
    const active = files.find((f) => f.id === activeId);
    const ordered = [...pre, active].filter(Boolean);
    const entries = ordered.map((f) => ({
      key: f.id, name: f.name, text: String(getText(f.id) ?? ''),
    }));
    const lineSpan = (lineIdx0) => {
      const n = Math.min(Math.max(1, lineIdx0 + 1), doc.lines);
      const line = doc.line(n);
      return { from: line.from, to: Math.max(line.to, line.from + 1) };
    };
    const nameOf = new Map(ordered.map((f) => [f.id, f.name]));
    const findings = analyzeSuite(entries).map((f) => ({
      ...f,
      atName: nameOf.get(f.at) || f.at,
      atIsActive: f.at === activeId,
      affectedNames: (f.affected || []).map((k) => nameOf.get(k) || k),
    }));
    return { diagnostics: suiteFileDiagnostics(entries, activeId, lineSpan), findings };
  }

  // Cache by CONTENT fingerprints (prelude siblings + active snapshot), not doc
  // object identity — and never on suiteOverlayGeneration (settlement ticks).
  function buildCheckContext(doc) {
    const P = persist();
    if (!P || !doc) return null;
    const files = P.listFiles();
    const activeId = P.getActiveFileId();
    const getText = (id) => (id === activeId ? doc.toString() : P.getFileText(id));
    const pre = preludeFilesFor(files, activeId, getText);
    const preludeIds = pre.map((f) => f.id);
    const preludeTexts = pre.map((f) => String(P.getFileText(f.id) ?? ''));
    const preludeSame = preludeCacheMatches(checkContextCache, preludeIds, preludeTexts);

    if (preludeSame && checkContextCache.activeDoc === doc && checkContextCache.value) {
      return checkContextCache.value;
    }

    let prelude = checkContextCache.prelude;
    let preludeFp = checkContextCache.preludeFp;
    if (!preludeSame) {
      prelude = buildPrelude(files, activeId, getText);
      preludeFp = prelude ? fnv1a(prelude.code) : '';
    }

    const activeText = doc.toString();
    const activeFp = fnv1a(activeText);
    if (preludeSame
      && checkContextCache.activeFp === activeFp
      && checkContextCache.value) {
      const reused = { ...checkContextCache.value, doc };
      checkContextCache = {
        ...checkContextCache,
        activeDoc: doc,
        value: reused,
      };
      return reused;
    }

    const view = getView();
    const fileCode = view
      ? checkerSnapshot(syntaxTree(view.state), doc).code
      : activeText;
    const suite = suiteAnalysisFor(files, activeId, getText, doc);
    const active = files.find((f) => f.id === activeId);
    const value = {
      doc,
      prelude,
      fileCode,
      activeFileName: active ? active.name : null,
      suiteDiagnostics: suite.diagnostics,
      suiteFindings: suite.findings,
      preludeFp,
      contentKey: `${preludeIds.join(',')}|${activeFp}`,
    };
    checkContextCache = {
      preludeIds,
      preludeTexts,
      prelude,
      preludeFp,
      activeDoc: doc,
      activeFp,
      value,
    };
    return value;
  }

  function invalidateCheckContextCache() {
    checkContextCache = emptyCheckContextCache();
  }

  function resetDevelopmentCheckGate() {
    lastSettledNonActiveDevSig = '';
  }

  function nonActiveDevSignature(view, activeId) {
    const { members } = developmentMembersForFile(view, activeId);
    const nonActive = members.filter((m) => m.id !== activeId);
    return developmentSignature(nonActive);
  }

  function scheduleDevelopmentCheckIfNeeded(view) {
    const P = persist();
    if (P?.readStoredSuiteCheck?.() === 'active') return;
    const activeId = P?.getActiveFileId?.();
    if (!activeId) return;
    const sig = nonActiveDevSignature(view, activeId);
    if (sig === lastSettledNonActiveDevSig) return;
    lastSettledNonActiveDevSig = sig;
    ensureDevelopmentChecked(view);
  }

  function scheduleDevelopmentCheck(view) {
    if (persist()?.readStoredSuiteCheck?.() === 'active') return;
    ensureDevelopmentChecked(view);
  }

  function scheduleDebouncedDevelopmentCheck(view) {
    if (devCheckDebounceTimer != null) clearTimeout(devCheckDebounceTimer);
    devCheckDebounceTimer = setTimeout(() => {
      devCheckDebounceTimer = null;
      if (view.dom?.isConnected) scheduleDevelopmentCheckIfNeeded(view);
    }, SETTLE_DELAY_MS);
  }

  function healthyCodeWithPrelude() {
    const view = getView();
    if (!view) return '';
    const ctx = buildCheckContext(view.state.doc);
    return ctx ? assembleCheckerCode(ctx.fileCode, ctx.prelude).code : healthySnapshotForView();
  }

  function holeActionContext() {
    const view = getView();
    if (!view) return null;
    const ctx = buildCheckContext(view.state.doc);
    if (!ctx) return { code: healthySnapshotForView(), offsetLines: 0 };
    const assembled = assembleCheckerCode(ctx.fileCode, ctx.prelude);
    return {
      code: assembled.code,
      offsetLines: assembled.prelude ? assembled.prelude.offsetLines : 0,
      fileStart: assembled.fileOffset != null ? assembled.fileOffset : 0,
    };
  }

  function currentScopeKey() {
    const P = persist();
    if (!P) return '';
    return developmentForFile(
      P.listFiles(),
      P.getActiveFileId(),
      (id) => P.getFileText(id),
    ).scopeKey;
  }

  function mergedMemberDiagnostics(members) {
    const dc = getDevelopmentChecker();
    const fromDev = dc?.cachedFor(members)?.memberDiagnostics || {};
    const fromSettled = getEngine()?.memberDiagnostics?.() || {};
    const out = { ...fromDev };
    for (const [name, list] of Object.entries(fromSettled)) {
      if (!list?.length || out[name]?.length) continue;
      out[name] = list;
    }
    return out;
  }

  function persistDevOpts() {
    const P = persist();
    return {
      getActiveCfgsForDir: typeof P?.getActiveCfgsForDir === 'function'
        ? (dir) => P.getActiveCfgsForDir(dir) : undefined,
      getActiveCfgForDir: typeof P?.getActiveCfgForDir === 'function'
        ? (dir) => P.getActiveCfgForDir(dir) : undefined,
    };
  }

  function healthKeyForMember(m, members, files) {
    const P = persist();
    const getText = (id) => {
      const hit = members.find((x) => x.id === id);
      return hit ? String(hit.text ?? '') : String(P.getFileText(id) ?? '');
    };
    return computeFileHealthKey(m.id, {
      files,
      getText,
      text: m.text,
      members,
      developmentOptions: persistDevOpts(),
    });
  }

  function syncSettlementFileHealth(view, checkerSnap) {
    if (!view?.state || !checkerSnap) return;
    if (checkerSnap.state !== 'ready' && checkerSnap.state !== 'stale') return;
    const P = persist();
    if (!P) return;
    const activeId = P.getActiveFileId();
    const { members } = developmentMembersForFile(view, activeId);
    if (!members.length) return;
    const files = P.listFiles();
    const getText = (id) => {
      const m = members.find((x) => x.id === id);
      return m ? String(m.text ?? '') : String(P.getFileText(id) ?? '');
    };
    const suite = suiteAnalysisFor(files, activeId, getText, view.state.doc);
    const index = getProjectDiagnostics();
    index.registerFiles(members);
    const nameOf = (id) => (files.find((f) => f.id === id)?.name || id);
    for (const f of suite.findings || []) {
      const id = f.at;
      if (!id) continue;
      const member = members.find((m) => m.id === id);
      if (!member) continue;
      const line = f.useLine || f.pragmaLine || 1;
      const rows = [{
        line,
        message: findingMessage(f, nameOf),
        severity: f.severity || 'warning',
      }];
      index.setObservation(id, rows, {
        fileName: member.name,
        key: healthKeyForMember(member, members, files),
        source: 'live',
        quiet: true,
      });
    }
  }

  function publishActiveLiveDiagnostics(view, diags) {
    const P = persist();
    if (!P?.getActiveFileId || !view?.state) return;
    const activeId = P.getActiveFileId();
    if (!activeId) return;
    const file = typeof P.getFileById === 'function' ? P.getFileById(activeId) : null;
    const text = view.state.doc.toString();
    const rows = ownDiagRowsFromDiagnostics(diags, view.state.doc);
    const index = getProjectDiagnostics();
    index.setActiveLive(activeId, rows, { fileName: file?.name });

    const settle = getEngine()?.settleState?.();
    const liveReady = settle === 'ready' || settle === 'stale' || settle === 'failed';
    if (!liveReady) return;

    const { members } = developmentMembersForFile(view, activeId);
    const files = P.listFiles();
    const key = computeFileHealthKey(activeId, {
      files,
      getText: (id) => {
        if (id === activeId) return text;
        const m = members.find((x) => x.id === id);
        return m ? String(m.text ?? '') : String(P.getFileText(id) ?? '');
      },
      text,
      members,
      developmentOptions: persistDevOpts(),
    });
    index.setObservation(activeId, rows, {
      fileName: file?.name,
      key,
      source: 'live',
    });
  }

  function computeSuitePreludeBanner(view) {
    const P = persist();
    if (!P || !view?.state) return null;
    const activeId = P.getActiveFileId();
    const { members } = developmentMembersForFile(view, activeId);
    if (members.length < 2) return null;
    const live = view.state.doc.toString();
    const getText = (id) => (id === activeId ? live : P.getFileText(id));
    const files = P.listFiles();
    const suite = suiteAnalysisFor(files, activeId, getText, view.state.doc);
    return suitePreludeBannerForActive({
      doc: view.state.doc,
      members,
      activeId,
      memberDiagnostics: mergedMemberDiagnostics(members),
      getText,
      suiteFindings: suite.findings,
    });
  }

  // Eager recompute off the input path — getOverlayDiags during keystroke is O(1).
  function recomputeSuiteOverlay() {
    const view = getView();
    if (!view?.state) { suiteOverlayValue = []; return; }
    const banner = computeSuitePreludeBanner(view);
    suiteOverlayValue = banner ? [banner] : [];
  }

  function bumpSuiteOverlay() {
    suiteOverlayGeneration += 1;
    recomputeSuiteOverlay();
  }

  function suiteOverlayDiagnostics() {
    return suiteOverlayValue;
  }

  function getSettleDelay(syntaxSnap) {
    const P = persist();
    const files = P?.listFiles?.() || [];
    const activeId = P?.getActiveFileId?.();
    const pre = preludeFilesFor(files, activeId, (id) => P.getFileText(id));
    return computeSettleDelayMs(syntaxSnap, { preludePaths: pre.length });
  }

  function handleSettlement(checkerSnap) {
    const view = getView();
    const P = persist();
    if (view && checkerSnap) {
      const doc = view.state.doc;
      const ctx = buildCheckContext(doc);
      const files = P?.listFiles?.() || [];
      const activeId = P?.getActiveFileId?.();
      const byName = new Map(files.map((f) => [f.name, f]));
      syncHoleGoalsFromSettlement(ctx, checkerSnap, (name) => {
        const f = byName.get(name);
        if (!f) return '';
        if (f.id === activeId) return doc.toString();
        return String(P.getFileText(f.id) ?? '');
      });
    }
    if (view) {
      bumpSuiteOverlay();
      scheduleDevelopmentCheckIfNeeded(view);
      const code = (checkerSnap && checkerSnap.checkedCode)
        || healthyCodeWithPrelude();
      const client = getGlobal().BelugaClient;
      if (code && client?.warmIntel) client.warmIntel(code).catch(() => {});
      refreshSettlementLint(view);
      getRefreshIdeStatus()?.(view);
      syncSettlementFileHealth(view, checkerSnap);
    }
  }

  function handleSettlementChecking() {
    const view = getView();
    if (!view) return;
    bumpSuiteOverlay();
    getRefreshIdeStatus()?.(view);
    refreshSettlementLint(view);
  }

  function onRenameEnded() {
    bumpSuiteOverlay();
    invalidateCheckContextCache();
    resetDevelopmentCheckGate();
  }

  return {
    buildCheckContext,
    healthyCodeWithPrelude,
    holeActionContext,
    currentScopeKey,
    suiteOverlayDiagnostics,
    bumpSuiteOverlay,
    scheduleDevelopmentCheck,
    scheduleDebouncedDevelopmentCheck,
    scheduleDevelopmentCheckIfNeeded,
    publishActiveLiveDiagnostics,
    getSettleDelay,
    handleSettlement,
    handleSettlementChecking,
    onRenameEnded,
    // Exposed for tests / diagnostics; generation is not a cache key.
    get suiteOverlayGeneration() { return suiteOverlayGeneration; },
  };
}
