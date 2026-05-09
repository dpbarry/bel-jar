(function (global) {
  'use strict';

  const FRP = global.FloatingRectPlacement;
  const TOOLTIP_MARGIN = FRP.DEFAULT_MARGIN;
  const TOOLTIP_GAP = FRP.DEFAULT_GAP;
  const TOUCH_SHOW_DELAY_MS = 400;

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

  function layoutTooltip(anchor) {
    const tip = tooltipRoot.firstElementChild;
    if (!tip || tooltipRoot.hidden) return;

    const text = anchor.getAttribute('data-tooltip');
    if (!text) return;
    tip.textContent = text;

    tooltipRoot.classList.add('is-measuring');

    const tw = tooltipRoot.offsetWidth;
    const th = tooltipRoot.offsetHeight;
    const tr = anchor.getBoundingClientRect();
    const { x, y } = FRP.computePosition({
      anchor: tr,
      width: tw,
      height: th,
      margin: TOOLTIP_MARGIN,
      gap: TOOLTIP_GAP,
      preferPlacement: FRP.PREFERENCE_TOOLTIP,
    });

    tooltipRoot.classList.remove('is-measuring');
    tooltipRoot.style.left = `${x}px`;
    tooltipRoot.style.top = `${y}px`;
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
        if (r.type !== 'attributes' || r.attributeName !== 'data-tooltip') continue;
        const el = r.target;
        if (el && el.nodeType === 1) refreshTooltipIfAnchored(el);
      }
    });
    tooltipAttrObserver.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tooltip'],
    });
  }

  global.Tooltips = {
    hide: hideTooltip,
    suppressAnchor(el) {
      suppressedTooltipAnchors.add(el);
    },
    releaseAnchor(el) {
      suppressedTooltipAnchors.delete(el);
    },
  };

  bindTooltips();
})(typeof globalThis !== 'undefined' ? globalThis : window);
