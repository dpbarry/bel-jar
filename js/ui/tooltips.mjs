import { FloatingRectPlacement } from '../workspace/float-placement.mjs';

function frp() {
  return FloatingRectPlacement;
}

const TOOLTIP_SPOUT_SIZE = 6;
const TOOLTIP_ARROW_MIN = 12;
const TOUCH_SHOW_DELAY_MS = 400;

function tooltipMargin() {
  return frp().DEFAULT_MARGIN;
}

function tooltipGap() {
  return Math.max(frp().DEFAULT_GAP, Math.ceil(TOOLTIP_SPOUT_SIZE * 0.65));
}

const PLACEMENT_SPOUT = Object.freeze({
  top: 'above',
  bottom: 'below',
  left: 'left',
  right: 'right',
});

const SPOUT_CLASSES = [
  'tooltip-spout-above',
  'tooltip-spout-below',
  'tooltip-spout-left',
  'tooltip-spout-right',
  'tooltip-spout-none',
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(v, max));
}

function inferSpoutSide(x, y, tw, th, tr) {
  const cx = tr.left + tr.width / 2;
  const cy = tr.top + tr.height / 2;
  const dx = cx - (x + tw / 2);
  const dy = cy - (y + th / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'left' : 'right';
  return dy > 0 ? 'above' : 'below';
}

function clearSpout(tip) {
  for (let i = 0; i < SPOUT_CLASSES.length; i++) tip.classList.remove(SPOUT_CLASSES[i]);
  tip.style.removeProperty('--tooltip-arrow-x');
  tip.style.removeProperty('--tooltip-arrow-y');
}

function applySpout(tip, anchor, placement, x, y, tw, th, tr, arrowBox = null) {
  clearSpout(tip);
  if (anchor.hasAttribute('data-tooltip-no-spout')) {
    tip.classList.add('tooltip-spout-none');
    return;
  }
  let side = PLACEMENT_SPOUT[placement];
  if (!side && placement === 'fallback') side = inferSpoutSide(x, y, tw, th, tr);
  if (!side) {
    tip.classList.add('tooltip-spout-none');
    return;
  }
  tip.classList.add(`tooltip-spout-${side}`);
  const cx = tr.left + tr.width / 2;
  const cy = tr.top + tr.height / 2;
  const min = TOOLTIP_ARROW_MIN;
  const ax = arrowBox?.left ?? x;
  const ay = arrowBox?.top ?? y;
  const aw = arrowBox?.width ?? tw;
  const ah = arrowBox?.height ?? th;
  if (side === 'above' || side === 'below') {
    tip.style.setProperty('--tooltip-arrow-x', `${clamp(cx - ax, min, aw - min)}px`);
  } else {
    tip.style.setProperty('--tooltip-arrow-y', `${clamp(cy - ay, min, ah - min)}px`);
  }
}

let tooltipRoot = null;
const suppressedTooltipAnchors = new Set();

let tooltipHideFallbackTimer = null;
let tooltipLeaveGen = 0;
let tooltipTransitionEndHandler = null;
let tooltipAnchor = null;
let touchShowTimer = null;
let tooltipSuppressLeaveUntilPointerUp = null;

let tooltipPointerMoveHandler = null;

function anchorHitAt(anchor, x, y) {
  const r = anchor.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function stopTooltipPointerTracking() {
  if (!tooltipPointerMoveHandler) return;
  window.removeEventListener('pointermove', tooltipPointerMoveHandler);
  tooltipPointerMoveHandler = null;
}

function startTooltipPointerTracking(anchor) {
  stopTooltipPointerTracking();
  tooltipPointerMoveHandler = (e) => {
    if (tooltipAnchor !== anchor) return;
    if (!anchorConnected(anchor)) {
      hideTooltipImmediate();
      return;
    }
    if (!anchorHitAt(anchor, e.clientX, e.clientY)) hideTooltipImmediate();
  };
  window.addEventListener('pointermove', tooltipPointerMoveHandler);
}

function cancelTooltipHideAnim() {
  if (tooltipHideFallbackTimer != null) {
    clearTimeout(tooltipHideFallbackTimer);
    tooltipHideFallbackTimer = null;
  }
  if (tooltipRoot && tooltipTransitionEndHandler) {
    const prevInner = tooltipRoot.querySelector('.tooltip-inner');
    if (prevInner) prevInner.removeEventListener('transitionend', tooltipTransitionEndHandler);
    tooltipTransitionEndHandler = null;
  }
  tooltipLeaveGen++;
}

function parseLintErrors(anchor) {
  const raw = anchor.getAttribute('data-tooltip-errors');
  if (!raw) return null;
  try {
    const items = JSON.parse(raw);
    return Array.isArray(items) && items.length ? items : null;
  } catch (_) {
    return null;
  }
}

function isStackedLintErrors(anchor) {
  return !!parseLintErrors(anchor) && !anchor.hasAttribute('data-tooltip-head');
}

function anchorHasTooltip(anchor) {
  if (!anchor) return false;
  return !!(
    anchor.getAttribute('data-tooltip')
    || anchor.getAttribute('data-tooltip-tone')
    || anchor.hasAttribute('data-tooltip-head')
    || (anchor.hasAttribute('data-tooltip-rich') && typeof anchor._belTooltipRich === 'function')
    || parseLintErrors(anchor)
  );
}

function fillDiagnosticTooltip(tip, message, severity) {
  tip.classList.add('tooltip-inner--diagnostic', `tooltip-inner--${severity}`);
  tip.replaceChildren();
  const frame = document.createElement('div');
  frame.className = `cm-diagnostic cm-diagnostic-${severity}`;
  const head = document.createElement('div');
  head.className = 'beljar-tip-head';
  const kind = document.createElement('span');
  kind.className = 'beljar-tip-kind';
  kind.textContent = severity === 'warning' ? 'Warning' : 'Error';
  head.appendChild(kind);
  const body = document.createElement('div');
  body.className = 'beljar-tip-body';
  body.textContent = message || '';
  frame.append(head, body);
  tip.appendChild(frame);
}

function fillTooltipContent(tip, anchor) {
  const text = anchor.getAttribute('data-tooltip');
  const tone = anchor.getAttribute('data-tooltip-tone');
  const items = parseLintErrors(anchor);
  const headed = anchor.hasAttribute('data-tooltip-head');
  tip.classList.remove(
    'tooltip-inner--lint-errors',
    'tooltip-inner--diagnostic',
    'tooltip-inner--error',
    'tooltip-inner--warning',
    'tooltip-inner--rich',
  );
  if (anchor.hasAttribute('data-tooltip-rich') && typeof anchor._belTooltipRich === 'function') {
    tip.classList.add('tooltip-inner--rich');
    tip.replaceChildren();
    let frag = null;
    try {
      frag = anchor._belTooltipRich(anchor);
    } catch (_) {
      frag = null;
    }
    if (frag) tip.appendChild(frag);
    else if (text) tip.textContent = text;
    return;
  }
  if (tone === 'error' || tone === 'warning') {
    fillDiagnosticTooltip(tip, text, tone);
    return;
  }
  if (headed) {
    tip.classList.add('tooltip-inner--lint-errors');
    tip.replaceChildren();
    const head = document.createElement('div');
    head.className = 'tooltip-lint-head';
    head.textContent = text || 'Errors detected';
    tip.appendChild(head);
    if (items) {
      const body = document.createElement('div');
      body.className = 'tooltip-lint-body';
      const list = document.createElement('ul');
      list.className = 'tooltip-lint-list';
      for (const item of items) {
        const li = document.createElement('li');
        li.className = 'tooltip-lint-item'
          + (item.kind === 'warning' ? ' tooltip-lint-item--warning' : '');
        const loc = item.prefix
          ? `${item.prefix}${item.line ?? '?'}`
          : String(item.line ?? '?');
        const line = document.createElement('span');
        line.className = 'tooltip-lint-line';
        line.textContent = loc;
        const msg = document.createElement('span');
        msg.className = 'tooltip-lint-msg';
        msg.textContent = item.msg || item.message || 'Error';
        li.append(line, msg);
        list.appendChild(li);
      }
      body.appendChild(list);
      tip.appendChild(body);
    }
    return;
  }
  if (!text) return;
  tip.textContent = text;
}

function tooltipPreferPlacement(anchor) {
  const raw = (anchor.getAttribute('data-tooltip-placement') || '').trim().toLowerCase();
  if (!raw) return frp().PREFERENCE_TOOLTIP;
  const side = raw === 'below' ? 'bottom' : raw === 'above' ? 'top' : raw;
  const order = ['bottom', 'top', 'right', 'left'];
  if (!order.includes(side)) return frp().PREFERENCE_TOOLTIP;
  return [side, ...order.filter((s) => s !== side)];
}

function anchorConnected(anchor) {
  return !!(anchor && anchor.isConnected);
}

// Geometry proxy: the tooltip positions against this element's rect while all
// hover/hide behaviour stays on the anchor itself (see Tooltips.setRectEl).
function tooltipRectEl(anchor) {
  const fn = anchor._belTooltipRectEl;
  if (typeof fn === 'function') {
    const el = fn(anchor);
    if (el && el.nodeType === 1 && el.isConnected) return el;
  }
  return anchor;
}

function clearTooltipRoot() {
  tooltipRoot.replaceChildren();
}

function tooltipAnimatedEl() {
  return tooltipRoot.querySelector('.tooltip-stack') || tooltipRoot.querySelector('.tooltip-inner');
}

function buildStackedDiagnosticTooltips(anchor) {
  const items = parseLintErrors(anchor);
  clearTooltipRoot();
  const stack = document.createElement('div');
  stack.className = 'tooltip-stack';
  for (const item of items) {
    const tip = document.createElement('div');
    tip.className = 'tooltip-inner';
    const severity = item.kind === 'warning' ? 'warning' : 'error';
    fillDiagnosticTooltip(tip, item.msg || item.message || '', severity);
    stack.appendChild(tip);
  }
  tooltipRoot.appendChild(stack);
  return stack;
}

function verticallyClosestStackInner(inners, tr) {
  if (!inners.length) return null;
  if (inners.length === 1) return inners[0];
  const acy = tr.top + tr.height / 2;
  let best = inners[0];
  let bestDist = Infinity;
  for (let i = 0; i < inners.length; i++) {
    const r = inners[i].getBoundingClientRect();
    const icy = r.top + r.height / 2;
    const dist = Math.abs(icy - acy);
    if (dist < bestDist) {
      bestDist = dist;
      best = inners[i];
    }
  }
  return best;
}

function stackSpoutTarget(inners, placement, tr) {
  if (!inners.length) return null;
  if (placement === 'top') return inners[inners.length - 1];
  if (placement === 'bottom') return inners[0];
  return verticallyClosestStackInner(inners, tr);
}

function applyStackSpout(stack, anchor, placement, x, y, tw, th, tr) {
  const inners = [...stack.querySelectorAll('.tooltip-inner')];
  for (let i = 0; i < inners.length; i++) clearSpout(inners[i]);
  if (anchor.hasAttribute('data-tooltip-no-spout')) {
    for (let i = 0; i < inners.length; i++) inners[i].classList.add('tooltip-spout-none');
    return;
  }
  let side = PLACEMENT_SPOUT[placement];
  if (!side && placement === 'fallback') side = inferSpoutSide(x, y, tw, th, tr);
  if (!side) {
    for (let i = 0; i < inners.length; i++) inners[i].classList.add('tooltip-spout-none');
    return;
  }
  const target = stackSpoutTarget(inners, placement, tr);
  if (!target) return;
  const targetRect = target.getBoundingClientRect();
  applySpout(target, anchor, placement, x, y, tw, th, tr, {
    left: targetRect.left,
    top: targetRect.top,
    width: targetRect.width,
    height: targetRect.height,
  });
}

function layoutTooltip(anchor) {
  if (!anchorConnected(anchor)) {
    hideTooltip();
    return;
  }
  if (!anchorHasTooltip(anchor) || tooltipRoot.hidden) return;

  const stacked = isStackedLintErrors(anchor);
  let tip;
  if (stacked) tip = buildStackedDiagnosticTooltips(anchor);
  else {
    tip = tooltipRoot.querySelector('.tooltip-inner');
    if (!tip) {
      ensureTooltipInner();
      tip = tooltipRoot.querySelector('.tooltip-inner');
    }
    fillTooltipContent(tip, anchor);
  }
  if (!tip) return;

  tooltipRoot.classList.add('is-measuring');

  const tw = tooltipRoot.offsetWidth;
  const th = tooltipRoot.offsetHeight;
  const tr = tooltipRectEl(anchor).getBoundingClientRect();
  const pos = frp().computePosition({
    anchor: tr,
    width: tw,
    height: th,
    margin: tooltipMargin(),
    gap: tooltipGap(),
    preferPlacement: tooltipPreferPlacement(anchor),
  });

  tooltipRoot.classList.remove('is-measuring');
  tooltipRoot.style.left = `${pos.x}px`;
  tooltipRoot.style.top = `${pos.y}px`;
  if (stacked) applyStackSpout(tip, anchor, pos.placement, pos.x, pos.y, tw, th, tr);
  else applySpout(tip, anchor, pos.placement, pos.x, pos.y, tw, th, tr);
  tooltipRoot.classList.add('is-visible');
}

function isPlainTextTooltip(anchor) {
  if (!anchor.getAttribute('data-tooltip')) return false;
  if (anchor.getAttribute('data-tooltip-tone')) return false;
  if (anchor.hasAttribute('data-tooltip-head')) return false;
  if (anchor.hasAttribute('data-tooltip-rich')) return false;
  if (parseLintErrors(anchor)) return false;
  return true;
}

function refreshTooltipIfAnchored(target) {
  if (!tooltipRoot || tooltipAnchor !== target) return;
  if (!anchorConnected(target)) {
    hideTooltip();
    return;
  }
  if (tooltipRoot.hidden || tooltipRoot.classList.contains('is-leaving')) return;
  if (!anchorHasTooltip(target)) {
    hideTooltip();
    return;
  }
  if (isPlainTextTooltip(target) && !tooltipRoot.querySelector('.tooltip-stack')) {
    const tip = tooltipRoot.querySelector('.tooltip-inner');
    if (tip) {
      const text = target.getAttribute('data-tooltip') || '';
      if (tip.textContent !== text) tip.textContent = text;
      return;
    }
  }
  layoutTooltip(target);
}

function ensureTooltipInner() {
  if (tooltipRoot.querySelector('.tooltip-stack')) return;
  if (!tooltipRoot.querySelector('.tooltip-inner')) {
    const inner = document.createElement('div');
    inner.className = 'tooltip-inner';
    tooltipRoot.appendChild(inner);
  }
}

function showTooltip(anchor, opts) {
  opts = opts || {};
  if (suppressedTooltipAnchors.has(anchor)) return;
  if (!anchorConnected(anchor)) return;
  if (!anchorHasTooltip(anchor)) return;
  cancelTooltipHideAnim();
  if (tooltipAnchor === anchor && !tooltipRoot.hidden && !tooltipRoot.classList.contains('is-leaving')) {
    layoutTooltip(anchor);
    return;
  }
  clearTooltipRoot();
  if (!isStackedLintErrors(anchor)) ensureTooltipInner();
  tooltipRoot.classList.remove('is-leaving');
  tooltipAnchor = anchor;
  tooltipRoot.hidden = false;
  layoutTooltip(anchor);
  if (opts.trackPointer && frp().prefersFineHover()) startTooltipPointerTracking(anchor);
}

function hideTooltip() {
  stopTooltipPointerTracking();
  tooltipAnchor = null;
  if (!tooltipRoot) return;
  if (tooltipRoot.hidden && !tooltipRoot.classList.contains('is-leaving')) return;
  cancelTooltipHideAnim();
  const finishGen = tooltipLeaveGen;
  const fallbackMs = frp().OVERLAY_TRANSITION_FALLBACK_MS;

  const inner = tooltipAnimatedEl();
  if (!inner) {
    tooltipRoot.classList.remove('is-visible', 'is-measuring', 'is-leaving');
    tooltipRoot.hidden = true;
    tooltipRoot.style.left = '';
    tooltipRoot.style.top = '';
    return;
  }

  if (inner.classList.contains('tooltip-stack')) {
    for (const tip of inner.querySelectorAll('.tooltip-inner')) clearSpout(tip);
  } else clearSpout(inner);
  tooltipRoot.classList.remove('is-visible', 'is-measuring');
  tooltipRoot.classList.add('is-leaving');
  void inner.offsetHeight;

  const finish = () => {
    if (finishGen !== tooltipLeaveGen) return;
    if (tooltipTransitionEndHandler && inner) {
      inner.removeEventListener('transitionend', tooltipTransitionEndHandler);
      tooltipTransitionEndHandler = null;
    }
    tooltipHideFallbackTimer = null;
    tooltipRoot.classList.remove('is-leaving');
    tooltipRoot.hidden = true;
    tooltipRoot.style.left = '';
    tooltipRoot.style.top = '';
  };
  const onEnd = (e) => {
    if (e.target !== inner || e.propertyName !== 'transform') return;
    finish();
  };
  tooltipTransitionEndHandler = onEnd;
  inner.addEventListener('transitionend', onEnd);
  tooltipHideFallbackTimer = setTimeout(finish, fallbackMs);
}

function hideTooltipImmediate() {
  stopTooltipPointerTracking();
  tooltipAnchor = null;
  if (!tooltipRoot) return;
  cancelTooltipHideAnim();
  const inner = tooltipAnimatedEl();
  if (inner?.classList.contains('tooltip-stack')) {
    for (const tip of inner.querySelectorAll('.tooltip-inner')) clearSpout(tip);
  } else if (inner) clearSpout(inner);
  tooltipRoot.classList.remove('is-visible', 'is-measuring', 'is-leaving');
  tooltipRoot.hidden = true;
  tooltipRoot.style.left = '';
  tooltipRoot.style.top = '';
}

// Wire one element for custom tooltips. Idempotent (guarded) so dynamically
// created elements (graph labels, toolbar buttons) can call it safely.
function bindTooltipEl(el) {
  if (!el || el.nodeType !== 1 || el._belTooltipBound) return;
  el._belTooltipBound = true;
    el.addEventListener('mouseenter', () => {
      if (!frp().prefersFineHover()) return;
      showTooltip(el, { trackPointer: !el.hasAttribute('data-tooltip-no-track') });
    });
    el.addEventListener('mouseleave', () => {
      if (!frp().prefersFineHover()) return;
      if (tooltipSuppressLeaveUntilPointerUp === el) return;
      if (tooltipAnchor !== el) return;
      hideTooltipImmediate();
    });
    el.addEventListener('focusin', () => {
      if (!el.matches(':focus-visible')) return;
      if (
        tooltipAnchor === el &&
        !tooltipRoot.hidden &&
        !tooltipRoot.classList.contains('is-leaving')
      ) {
        return;
      }
      showTooltip(el);
    });
    el.addEventListener('focusout', () => {
      if (tooltipAnchor === el) hideTooltip();
    });

    el.addEventListener(
      'pointerdown',
      (e) => {
        if (!frp().prefersFineHover() || !e.isPrimary || e.button !== 0) return;
        if (e.pointerType === 'touch') return;
        tooltipSuppressLeaveUntilPointerUp = el;
      },
      true
    );

    el.addEventListener(
      'touchstart',
      () => {
        if (frp().prefersFineHover()) return;
        clearTimeout(touchShowTimer);
        touchShowTimer = setTimeout(() => showTooltip(el), TOUCH_SHOW_DELAY_MS);
      },
      { passive: true }
    );
    el.addEventListener('touchend', () => {
      if (frp().prefersFineHover()) return;
      clearTimeout(touchShowTimer);
      if (tooltipAnchor === el) hideTooltip();
    });
    el.addEventListener('touchcancel', () => {
      if (frp().prefersFineHover()) return;
      clearTimeout(touchShowTimer);
      if (tooltipAnchor === el) hideTooltip();
    });
}

function bindTooltips() {
  if (!tooltipRoot) return;
  document.querySelectorAll('[data-tooltip]').forEach(bindTooltipEl);

  window.addEventListener('pointerup', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    const held = tooltipSuppressLeaveUntilPointerUp;
    tooltipSuppressLeaveUntilPointerUp = null;
    if (!held || tooltipAnchor !== held) return;
    if (!held.isConnected) {
      hideTooltip();
      return;
    }
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const stillOver = under && (held === under || held.contains(under));
    if (!stillOver) hideTooltip();
  });
  window.addEventListener('pointercancel', (e) => {
    if (!e.isPrimary) return;
    tooltipSuppressLeaveUntilPointerUp = null;
  });

  window.addEventListener('resize', () => {
    if (tooltipAnchor) layoutTooltip(tooltipAnchor);
  });
  // Any scroll (editor scroller, panels, window) dismisses — anchors move under a
  // still pointer, so mouseleave never fires. Repositioning would chase ghosts.
  // Scrolls inside the tip itself (e.g. overflow-x on rich code) do not dismiss.
  window.addEventListener(
    'scroll',
    (e) => {
      if (!tooltipAnchor) return;
      if (tooltipRoot && e.target instanceof Node && tooltipRoot.contains(e.target)) return;
      hideTooltipImmediate();
    },
    true
  );

  const tooltipAttrObserver = new MutationObserver(function (records) {
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (
        r.type !== 'attributes' ||
        (r.attributeName !== 'data-tooltip' && r.attributeName !== 'data-tooltip-errors'
          && r.attributeName !== 'data-tooltip-tone' && r.attributeName !== 'data-tooltip-head')
      ) continue;
      const el = r.target;
      if (!el || el.nodeType !== 1) continue;
      // No-op writes (same value re-set) must not re-layout an open tooltip
      // — that replays the pop-in transition and reads as flashing.
      if (r.oldValue === el.getAttribute(r.attributeName)) continue;
      refreshTooltipIfAnchored(el);
    }
  });
  tooltipAttrObserver.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['data-tooltip', 'data-tooltip-errors', 'data-tooltip-tone', 'data-tooltip-head'],
  });
}

// Set BelJar-native tooltip text on a (possibly dynamic) element. Never use
// the HTML title attribute — it shows the ugly browser default tooltip.
function setTooltip(el, text, opts) {
  if (!el || el.nodeType !== 1) return;
  opts = opts || {};
  el.removeAttribute('title');
  const tip = text != null ? String(text).trim() : '';
  if (!tip) {
    el.removeAttribute('data-tooltip');
    if (opts.ariaLabel !== false) el.removeAttribute('aria-label');
    return;
  }
  const prev = el.getAttribute('data-tooltip');
  if (prev !== tip) el.setAttribute('data-tooltip', tip);
  if (opts.ariaLabel !== false) el.setAttribute('aria-label', tip);
  bindTooltipEl(el);
}

// Set a RICH (custom DOM) BelJar-native tooltip on a (possibly dynamic)
// element. buildFragment(anchor) is called lazily on each show and must
// return a DocumentFragment / Node (e.g. a syntax-highlighted code fragment)
// or a falsy value to fall back to plain data-tooltip text. `ariaText` is an
// optional accessible label (rich DOM can't be an aria-label).
function setRichTooltip(el, buildFragment, ariaText) {
  if (!el || el.nodeType !== 1) return;
  el.removeAttribute('title');
  if (typeof buildFragment !== 'function') {
    el._belTooltipRich = null;
    el.removeAttribute('data-tooltip-rich');
    return;
  }
  el._belTooltipRich = buildFragment;
  el.setAttribute('data-tooltip-rich', '');
  const aria = ariaText != null ? String(ariaText).trim() : '';
  if (aria) el.setAttribute('aria-label', aria);
  bindTooltipEl(el);
}

// Show a tooltip with the element's full text only when its content overflows
// (scrollWidth > clientWidth). getText() defaults to the element's textContent.
// Must be called before any other bindTooltipEl call on the same element so
// the overflow check runs before the tooltip's own mouseenter handler.
function bindOverflowTip(el, getText) {
  if (!el || el.nodeType !== 1 || el._belOverflowTipBound) return;
  el._belOverflowTipBound = true;
  el.addEventListener('mouseenter', function () {
    if (!frp().prefersFineHover()) return;
    const text = el.scrollWidth > el.clientWidth
      ? (getText ? getText() : (el.textContent || '').trim())
      : '';
    if (text) el.setAttribute('data-tooltip', text);
    else el.removeAttribute('data-tooltip');
  });
  bindTooltipEl(el);
}

export const Tooltips = {
  hide: hideTooltip,
  hideImmediate: hideTooltipImmediate,
  set: setTooltip,
  setRich: setRichTooltip,
  show: showTooltip,
  // Wire a dynamically-created element (with data-tooltip) for custom tooltips.
  bind: bindTooltipEl,
  // Show full text as tooltip only when the element's content is clipped.
  bindOverflow: bindOverflowTip,
  // Position the tooltip against another element's rect (resolved lazily on
  // each show) while hover behaviour stays on `el`. Falsy result → own rect.
  setRectEl(el, fn) {
    if (el && el.nodeType === 1) el._belTooltipRectEl = typeof fn === 'function' ? fn : null;
  },
  // The element the visible tooltip is anchored to (null when hidden). Lets
  // external hover controllers hide only tooltips they own.
  activeAnchor() {
    return tooltipAnchor;
  },
  suppressAnchor(el) {
    suppressedTooltipAnchors.add(el);
  },
  releaseAnchor(el) {
    suppressedTooltipAnchors.delete(el);
  },
};


export function installTooltips() {
  if (typeof document === 'undefined') return;
  tooltipRoot = document.getElementById('tooltip-root');
  bindTooltips();
}

if (typeof document !== 'undefined') {
  installTooltips();
  globalThis.Tooltips = Tooltips;
}
