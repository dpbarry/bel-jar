import { fuzzyScore } from './fuzzy.mjs';

// Tunable ranking weights. Audit-driven only (Phase 6.2) — change with a
// before/after MRR table, never by intuition alone.
export const WEIGHTS = Object.freeze({
  fuzzyScale: 100,
  justStep: 80,
  emptyBaseScale: 1000,
  prefixBonus: 400,
  exactBonus: 600,
  // Prefer labels whose length is close to the query (typo / short-name wins).
  lengthFitScale: 40,
  peerPenalty: 30,
});

// Compose LookupItem scores. Higher is better. Stable by original index on ties.
//
// scoreHints:
//   base       — contributor priority (snippets, locals, globals, peers)
//   proximity  — nearer / local boost
//   namespace  — reserved (hard filter happens upstream)

export function rankLookupItems(items, query, limit = 24, weights = WEIGHTS) {
  if (!items || !items.length) return [];
  // `limit <= 0` or non-finite → keep the full scored set (pool-for-filter path).
  // Note: `Infinity | 0 === 0` in JS — never use bitwise on an uncapped sentinel.
  const uncapped = limit == null || limit <= 0 || !Number.isFinite(limit);
  const cap = uncapped ? Infinity : Math.max(1, limit | 0);
  const w = weights || WEIGHTS;
  const q = String(query || '');
  const ql = q.toLowerCase();
  const scored = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!Number.isInteger(item.just) || item.just < 1 || item.just > 4) {
      throw new TypeError(`Completion item "${item.label || ''}" lacks a valid justification level`);
    }
    const hints = item.scoreHints || {};
    const base = Number(hints.base) || 0;
    const proximity = Number(hints.proximity) || 0;
    const justBoost = Math.max(0, (Number(item.just) || 2) - 2) * (w.justStep || 0);
    const peerPen = item.kind === 'peer' || item.source === 'peer' ? (w.peerPenalty || 0) : 0;
    let fuzzy = 0;
    let prefix = 0;
    let exact = 0;
    let lengthFit = 0;
    if (q) {
      const onLabel = fuzzyScore(q, item.label);
      if (!onLabel) continue;
      fuzzy = onLabel.score;
      const label = String(item.label || '');
      const ll = label.toLowerCase();
      if (ll === ql) exact = w.exactBonus || 0;
      else if (ll.startsWith(ql)) prefix = w.prefixBonus || 0;
      // Shorter surplus after the matched prefix → higher (query "id" prefers "id").
      const surplus = Math.max(0, label.length - q.length);
      lengthFit = Math.max(0, (w.lengthFitScale || 0) - surplus * 4);
    }
    const score = q
      ? fuzzy * (w.fuzzyScale || 100) + base + proximity + justBoost + prefix + exact + lengthFit - peerPen
      : base * (w.emptyBaseScale || 1000) + proximity + justBoost - peerPen;
    scored.push({ item, score, index: i });
  }
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  if (!uncapped && scored.length > cap) scored.length = cap;
  return scored.map((s) => s.item);
}
