import { normalizeType, renderTypeInto } from './bel-type-render.mjs';
import { setShimmerPhase } from './bel-hover.mjs';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function createInlineSpinner() {
  const s = el('span', 'inspector-spinner');
  s.setAttribute('aria-hidden', 'true');
  return s;
}

function createRecalcShimmer(text = 'Recalculating…') {
  const sh = el('span', 'harpoon-hole-recalc beljar-tip-shimmer', text);
  setShimmerPhase(sh);
  return sh;
}

function tierMountKey(surface, goalState, goal) {
  const recalc = goalState === 'pending' || !goal;
  const probable = !recalc && (goalState === 'approximate' || goalState === 'rechecking');
  const norm = goal ? normalizeType(goal).replace(/\s+/g, '') : '';
  const bucket = recalc ? 'recalc' : (probable ? 'probable' : 'live');
  return `${surface}|${bucket}|${norm}`;
}

function mountType(parent, goal, opts = {}) {
  const tag = opts.tag || 'span';
  const extraCls = opts.extraCls || '';
  const typeEl = document.createElement(tag);
  typeEl.className = 'hole-goal-type bel-type' + (extraCls ? ` ${extraCls}` : '');
  renderTypeInto(typeEl.appendChild(el('span', 'bel-type-text')), goal, 'comp');
  parent.appendChild(typeEl);
  return typeEl;
}

function mountRecalc(host, surface) {
  if (surface === 'inspector') {
    host.classList.add('inspector-hole-goal--tiered');
    const inline = el('span', 'hole-goal-inline');
    inline.appendChild(createInlineSpinner());
    host.appendChild(inline);
    return;
  }
  if (surface === 'harpoon-card') {
    host.classList.add('harpoon-hole-goal--tiered');
  }
  const status = el('div', 'hole-goal-status');
  status.appendChild(createRecalcShimmer());
  host.appendChild(status);
}

export function mountHoleGoalTier(host, opts = {}) {
  if (!host || typeof document === 'undefined') return host;
  const {
    surface = 'inspector',
    goalState = 'pending',
    goal = null,
  } = opts;
  const recalc = goalState === 'pending' || !goal;
  const mountKey = tierMountKey(surface, goalState, goal);
  if (host.dataset.holeGoalKey === mountKey) return host;
  host.dataset.holeGoalKey = mountKey;
  host.textContent = '';
  host.classList.remove('inspector-hole-goal--tiered', 'harpoon-hole-goal--tiered');

  if (recalc) {
    mountRecalc(host, surface);
    return host;
  }

  if (surface === 'inspector') {
    host.classList.add('inspector-hole-goal--tiered');
    const inline = el('span', 'hole-goal-inline');
    mountType(inline, goal);
    host.appendChild(inline);
    return host;
  }

  if (surface === 'lab') {
    mountType(host, goal, { tag: 'div', extraCls: 'harpoon-lab-auto-goal-type' });
    return host;
  }

  mountType(host, goal);
  return host;
}
