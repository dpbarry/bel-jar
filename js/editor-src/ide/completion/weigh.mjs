import { fuzzyScore } from './fuzzy.mjs';

// Compose LookupItem scores. Higher is better. Stable by original index on ties.
//
// scoreHints:
//   base       — contributor priority (hole fill emission order inverted, etc.)
//   proximity  — nearer / local boost
//   namespace  — reserved (hard filter happens upstream)

export function rankLookupItems(items, query, limit = 24) {
  const cap = Math.max(1, limit | 0);
  if (!items || !items.length) return [];
  const q = String(query || '');
  const scored = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!Number.isInteger(item.just) || item.just < 1 || item.just > 4) {
      throw new TypeError(`Completion item "${item.label || ''}" lacks a valid justification level`);
    }
    const hints = item.scoreHints || {};
    const base = Number(hints.base) || 0;
    const proximity = Number(hints.proximity) || 0;
    const justBoost = Math.max(0, (Number(item.just) || 2) - 2) * 80;
    let fuzzy = 0;
    if (q) {
      const onLabel = fuzzyScore(q, item.label);
      if (!onLabel) continue;
      fuzzy = onLabel.score;
    }
    // Peers lack sourceText in the index — stay J2; never J3-filtered out.
    const score = q
      ? fuzzy * 100 + base + proximity + justBoost
      : base * 1000 + proximity + fuzzy + justBoost;
    scored.push({ item, score, index: i });
  }
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, cap).map((s) => s.item);
}
