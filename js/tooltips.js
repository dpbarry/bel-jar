(function (global) {
  'use strict';

  const FRP = global.FloatingRectPlacement;
  const TOOLTIP_MARGIN = FRP.DEFAULT_MARGIN;
  const TOOLTIP_SPOUT_SIZE = 6;
  const TOOLTIP_GAP = Math.max(FRP.DEFAULT_GAP, Math.ceil(TOOLTIP_SPOUT_SIZE * 0.65));
  const TOOLTIP_ARROW_MIN = 12;
  const TOUCH_SHOW_DELAY_MS = 400;

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

  function applySpout(tip, anchor, placement, x, y, tw, th, tr) {
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
    if (side === 'above' || side === 'below') {
      tip.style.setProperty('--tooltip-arrow-x', `${clamp(cx - x, min, tw - min)}px`);
    } else {
      tip.style.setProperty('--tooltip-arrow-y', `${clamp(cy - y, min, th - min)}px`);
    }
  }

  const tooltipRoot = document.getElementById('tooltip-root');
  const suppressedTooltipAnchors = new Set();

  let tooltipHideFallbackTimer = null;
  let tooltipLeaveGen = 0;
  let tooltipTransitionEndHandler = null;
  let tooltipAnchor = null;
  let touchShowTimer = null;
  let tooltipSuppressLeaveUntilPointerUp = null;

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

  function fillTooltipContent(tip, anchor) {
    const text = anchor.getAttribute('data-tooltip');
    const items = parseLintErrors(anchor);
    const headed = anchor.hasAttribute('data-tooltip-head');
    tip.classList.remove('tooltip-inner--lint-errors');
    if (headed || items) {
      tip.classList.add('tooltip-inner--lint-errors');
      tip.replaceChildren();
      const head = document.createElement('div');
      head.className = 'tooltip-lint-head';
      head.textContent = text || 'Errors detected';
      tip.appendChild(head);
      if (items) {
        const list = document.createElement('ul');
        list.className = 'tooltip-lint-list';
        for (const item of items) {
          const li = document.createElement('li');
          li.className = 'tooltip-lint-item'
            + (item.kind === 'warning' ? ' tooltip-lint-item--warning' : '');
          const line = document.createElement('span');
          line.className = 'tooltip-lint-line';
          line.textContent = String(item.line ?? '?');
          const msg = document.createElement('span');
          msg.className = 'tooltip-lint-msg';
          msg.textContent = item.msg || item.message || 'Error';
          li.append(line, msg);
          list.appendChild(li);
        }
        tip.appendChild(list);
      }
      return;
    }
    if (!text) return;
    tip.textContent = text;
  }

  function layoutTooltip(anchor) {
    const tip = tooltipRoot.firstElementChild;
    if (!tip || tooltipRoot.hidden) return;

    const text = anchor.getAttribute('data-tooltip');
    if (!text && !parseLintErrors(anchor) && !anchor.hasAttribute('data-tooltip-head')) return;
    fillTooltipContent(tip, anchor);

    tooltipRoot.classList.add('is-measuring');

    const tw = tooltipRoot.offsetWidth;
    const th = tooltipRoot.offsetHeight;
    const tr = anchor.getBoundingClientRect();
    const pos = FRP.computePosition({
      anchor: tr,
      width: tw,
      height: th,
      margin: TOOLTIP_MARGIN,
      gap: TOOLTIP_GAP,
      preferPlacement: FRP.PREFERENCE_TOOLTIP,
    });

    tooltipRoot.classList.remove('is-measuring');
    tooltipRoot.style.left = `${pos.x}px`;
    tooltipRoot.style.top = `${pos.y}px`;
    applySpout(tip, anchor, pos.placement, pos.x, pos.y, tw, th, tr);
    tooltipRoot.classList.add('is-visible');
  }

  function refreshTooltipIfAnchored(target) {
    if (!tooltipRoot || tooltipAnchor !== target) return;
    if (tooltipRoot.hidden || tooltipRoot.classList.contains('is-leaving')) return;
    const text = target.getAttribute('data-tooltip');
    if (!text) {
      hideTooltip();
      return;
    }
    layoutTooltip(target);
  }

  function ensureTooltipInner() {
    if (!tooltipRoot.querySelector('.tooltip-inner')) {
      const inner = document.createElement('div');
      inner.className = 'tooltip-inner';
      tooltipRoot.appendChild(inner);
    }
  }

  function showTooltip(anchor) {
    if (suppressedTooltipAnchors.has(anchor)) return;
    const text = anchor.getAttribute('data-tooltip');
    if (!text) return;
    cancelTooltipHideAnim();
    ensureTooltipInner();
    tooltipRoot.classList.remove('is-leaving');
    tooltipAnchor = anchor;
    tooltipRoot.hidden = false;
    layoutTooltip(anchor);
  }

  function hideTooltip() {
    tooltipAnchor = null;
    if (!tooltipRoot) return;
    if (tooltipRoot.hidden && !tooltipRoot.classList.contains('is-leaving')) return;
    cancelTooltipHideAnim();
    const finishGen = tooltipLeaveGen;
    const fallbackMs = FRP.OVERLAY_TRANSITION_FALLBACK_MS;

    const inner = tooltipRoot.querySelector('.tooltip-inner');
    if (!inner) {
      tooltipRoot.classList.remove('is-visible', 'is-measuring', 'is-leaving');
      tooltipRoot.hidden = true;
      tooltipRoot.style.left = '';
      tooltipRoot.style.top = '';
      return;
    }

    clearSpout(inner);
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
    tooltipAnchor = null;
    if (!tooltipRoot) return;
    cancelTooltipHideAnim();
    const inner = tooltipRoot.querySelector('.tooltip-inner');
    if (inner) clearSpout(inner);
    tooltipRoot.classList.remove('is-visible', 'is-measuring', 'is-leaving');
    tooltipRoot.hidden = true;
    tooltipRoot.style.left = '';
    tooltipRoot.style.top = '';
  }

  function bindTooltips() {
    if (!tooltipRoot) return;
    document.querySelectorAll('[data-tooltip]').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        if (!FRP.prefersFineHover()) return;
        showTooltip(el);
      });
      el.addEventListener('mouseleave', (e) => {
        if (!FRP.prefersFineHover()) return;
        if (tooltipSuppressLeaveUntilPointerUp === el) return;
        if (tooltipAnchor !== el) return;
        hideTooltip();
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
          if (!FRP.prefersFineHover() || !e.isPrimary || e.button !== 0) return;
          if (e.pointerType === 'touch') return;
          tooltipSuppressLeaveUntilPointerUp = el;
        },
        true
      );

      el.addEventListener(
        'touchstart',
        () => {
          if (FRP.prefersFineHover()) return;
          clearTimeout(touchShowTimer);
          touchShowTimer = setTimeout(() => showTooltip(el), TOUCH_SHOW_DELAY_MS);
        },
        { passive: true }
      );
      el.addEventListener('touchend', () => {
        if (FRP.prefersFineHover()) return;
        clearTimeout(touchShowTimer);
        if (tooltipAnchor === el) hideTooltip();
      });
      el.addEventListener('touchcancel', () => {
        if (FRP.prefersFineHover()) return;
        clearTimeout(touchShowTimer);
        if (tooltipAnchor === el) hideTooltip();
      });
    });

    window.addEventListener('pointerup', (e) => {
      if (!e.isPrimary || e.button !== 0) return;
      const held = tooltipSuppressLeaveUntilPointerUp;
      tooltipSuppressLeaveUntilPointerUp = null;
      if (!held || tooltipAnchor !== held) return;
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
    window.addEventListener(
      'scroll',
      () => {
        if (tooltipAnchor) layoutTooltip(tooltipAnchor);
      },
      true
    );

    const tooltipAttrObserver = new MutationObserver(function (records) {
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (
          r.type !== 'attributes' ||
          (r.attributeName !== 'data-tooltip' && r.attributeName !== 'data-tooltip-errors')
        ) continue;
        const el = r.target;
        if (el && el.nodeType === 1) refreshTooltipIfAnchored(el);
      }
    });
    tooltipAttrObserver.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tooltip', 'data-tooltip-errors'],
    });
  }

  global.Tooltips = {
    hide: hideTooltip,
    hideImmediate: hideTooltipImmediate,
    suppressAnchor(el) {
      suppressedTooltipAnchors.add(el);
    },
    releaseAnchor(el) {
      suppressedTooltipAnchors.delete(el);
    },
  };

  bindTooltips();
})(typeof globalThis !== 'undefined' ? globalThis : window);
