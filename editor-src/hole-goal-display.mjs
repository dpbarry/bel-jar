// Shared hole-goal freshness for Inspector + Harpoon: content-signature store first,
// settlement goals only when ready — never carried checker snapshots mid-recheck.

import { fileContentSig } from './development-check.mjs';
import { getHoleGoalsStore } from './hole-goals-store.mjs';
import { showCachedGoalHint } from './cached-goal-hint.mjs';
import { approximateHoleGoal } from './bel-prover-bridge.mjs';
import { normalizeType } from './bel-type-render.mjs';

export function goalsSemanticallyEqual(a, b) {
  if (!a || !b) return false;
  const strip = (s) => normalizeType(s).replace(/\s+/g, '');
  return strip(a) === strip(b);
}

function pickStableGoal(primary, ...fallbacks) {
  if (!primary) {
    for (const fb of fallbacks) if (fb) return fb;
    return null;
  }
  for (const fb of fallbacks) {
    if (fb && goalsSemanticallyEqual(primary, fb)) return fb;
  }
  return primary;
}

export function storedGoalAt(fileName, fileText, line, col) {
  if (!fileName) return null;
  const holes = getHoleGoalsStore().fresh(fileName, fileContentSig(fileText));
  if (!holes?.length) return null;
  const wantCol = col || 1;
  for (const h of holes) {
    if (h.line === line && (h.col || 1) === wantCol && h.goal) return h.goal;
  }
  for (const h of holes) {
    if (h.line === line && h.goal) return h.goal;
  }
  return null;
}

export function fileInActiveDevelopment(fileName, activeDevPaths) {
  if (!fileName || !activeDevPaths?.length) return false;
  return activeDevPaths.includes(fileName);
}

export function resolveHoleGoalDisplay({
  inDevelopment,
  settleState,
  storedGoal,
  settlementGoal,
  approximateGoal,
}) {
  const checking = settleState === 'checking' || settleState === 'stale';

  if (storedGoal) {
    if (!inDevelopment) return { goal: storedGoal, state: 'cached', loadingLive: false };
    if (checking) {
      const goal = pickStableGoal(storedGoal, approximateGoal, settlementGoal);
      return { goal, state: 'rechecking', loadingLive: true };
    }
    return { goal: storedGoal, state: 'live', loadingLive: false };
  }

  if (inDevelopment) {
    if (settlementGoal && settleState === 'ready') {
      const goal = pickStableGoal(settlementGoal, approximateGoal);
      return { goal, state: 'live', loadingLive: false };
    }
    if (approximateGoal) {
      const goal = pickStableGoal(approximateGoal, settlementGoal);
      return { goal, state: 'approximate', loadingLive: true };
    }
    return { goal: null, state: 'pending', loadingLive: true };
  }

  return { goal: null, state: 'out-of-scope', loadingLive: false };
}

function holeStillAtDoc(doc, h) {
  if (!doc || !h || h.line < 1 || h.line > doc.lines) return false;
  const line = doc.line(h.line);
  const from = line.from + Math.max(0, (h.col || 1) - 1);
  return from < doc.length && doc.sliceString(from, from + 1) === '?';
}

export function settlementGoalsByPos(engine, settleState) {
  const map = new Map();
  if (!engine || settleState !== 'ready' || typeof engine.getHoles !== 'function') return map;
  for (const h of engine.getHoles()) {
    if (h?.goal) map.set(`${h.line}:${h.col || 1}`, h.goal);
  }
  return map;
}

export function buildHoleDisplayRows({
  fileName,
  fileText,
  doc = null,
  inDevelopment,
  settleState,
  syntacticHoles,
  settlementGoalsByPos: goalsByPos = new Map(),
}) {
  const rows = [];
  for (const h of syntacticHoles || []) {
    if (doc && !holeStillAtDoc(doc, h)) continue;
    const key = `${h.line}:${h.col || 1}`;
    const approx = inDevelopment ? approximateHoleGoal(fileText, h.line, h.col) : null;
    const { goal, state, loadingLive } = resolveHoleGoalDisplay({
      inDevelopment,
      settleState,
      storedGoal: storedGoalAt(fileName, fileText, h.line, h.col),
      settlementGoal: goalsByPos.get(key) || null,
      approximateGoal: approx,
    });
    let from = h.from;
    let to = h.to;
    if (doc) {
      const line = doc.line(h.line);
      from = line.from + Math.max(0, (h.col || 1) - 1);
      to = from + 1;
    }
    rows.push({
      index: h.index,
      goal,
      goalState: state,
      loadingLive,
      ctxCount: (h.ctx || []).length,
      line: h.line,
      col: h.col || 1,
      from,
      to,
    });
  }
  return rows;
}

export function resolveHoleGoalForPosition({
  fileName,
  fileText,
  line,
  col,
  inDevelopment,
  settleState,
  settlementGoal = null,
}) {
  const approx = inDevelopment ? approximateHoleGoal(fileText, line, col) : null;
  return resolveHoleGoalDisplay({
    inDevelopment,
    settleState,
    storedGoal: storedGoalAt(fileName, fileText, line, col),
    settlementGoal,
    approximateGoal: approx,
  });
}

export function holesBannerFromRows(rows, opts = {}) {
  return showCachedGoalHint(rows, opts) ? true : null;
}

export function resolveGoalStateNearPos(engine, doc, pos, ctx) {
  if (!engine || typeof engine.getHoles !== 'function' || !doc || pos == null) return null;
  for (const h of engine.getHoles()) {
    if (!holeStillAtDoc(doc, h)) continue;
    const off = doc.line(h.line).from + Math.max(0, (h.col || 1) - 1);
    let end = off + 1;
    while (end < doc.length && /[^\s([{<:.,;|]/.test(doc.sliceString(end, end + 1))) end += 1;
    if (pos < off || pos > end) continue;
    const approx = ctx.inDevelopment
      ? approximateHoleGoal(ctx.fileText, h.line, h.col)
      : null;
    return resolveHoleGoalDisplay({
      inDevelopment: ctx.inDevelopment,
      settleState: ctx.settleState,
      storedGoal: storedGoalAt(ctx.fileName, ctx.fileText, h.line, h.col),
      settlementGoal: ctx.settleState === 'ready' ? (h.goal || null) : null,
      approximateGoal: approx,
    });
  }
  return null;
}

export function resolveGoalNearPos(engine, doc, pos, ctx) {
  const hit = resolveGoalStateNearPos(engine, doc, pos, ctx);
  return hit?.goal ?? null;
}
