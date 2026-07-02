// Yellow info-circle for cached hole goals / types outside the active development.

export const CACHED_GOAL_TIP = 'Not in active development: may be out of date.';

export const CACHED_GOAL_HINT_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.75"/><rect x="11" y="10" width="2" height="7.5" rx="0.5" fill="currentColor" stroke="none"/><circle cx="12" cy="7.25" r="1.15" fill="currentColor" stroke="none"/></svg>';

export function bindCachedGoalHintTooltip(el, tip = CACHED_GOAL_TIP) {
  if (!el) return;
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  el.removeAttribute('title');
  el.setAttribute('data-tooltip-no-track', '');
  if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
  if (g.Tooltips?.set) {
    g.Tooltips.set(el, tip);
    return;
  }
  el.setAttribute('data-tooltip', tip);
  el.setAttribute('aria-label', tip);
  g.Tooltips?.bind?.(el);
}

export function createCachedGoalHintIcon(tip = CACHED_GOAL_TIP) {
  if (typeof document === 'undefined') return null;
  const icon = document.createElement('span');
  icon.className = 'bel-cached-hint';
  icon.setAttribute('role', 'img');
  icon.innerHTML = CACHED_GOAL_HINT_SVG;
  bindCachedGoalHintTooltip(icon, tip);
  return icon;
}

export function showCachedGoalHint(rows, { inDevelopment } = {}) {
  if (!rows?.length || inDevelopment) return false;
  return rows.some((r) => r.goal && r.goalState === 'cached');
}
