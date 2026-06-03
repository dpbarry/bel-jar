/** Fixed-layer rects vs viewport + anchor (DOMRect / position:fixed space). */
(function (global) {
  'use strict';

  /** @typedef {'right'|'left'|'bottom'|'top'} PlacementSide */

  const DEFAULT_MARGIN = 8;
  const DEFAULT_GAP = 4;
  const OVERLAY_TRANSITION_FALLBACK_MS = 170;
  const PREFERENCE_TOOLTIP = Object.freeze(['right', 'left', 'bottom', 'top']);

  function prefersFineHover() {
    return global.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }

  function normalizeAnchor(a) {
    const left = Number(a.left);
    const top = Number(a.top);
    const w = a.width != null ? Number(a.width) : Number(a.right) - left;
    const h = a.height != null ? Number(a.height) : Number(a.bottom) - top;
    return { left, top, right: left + w, bottom: top + h };
  }

  function clampToViewport(x, y, w, h, vw, vh, margin) {
    const m = margin;
    const maxX = Math.max(m, vw - m - w);
    const maxY = Math.max(m, vh - m - h);
    return { x: Math.min(Math.max(m, x), maxX), y: Math.min(Math.max(m, y), maxY) };
  }

  function fitsViewport(x, y, w, h, vw, vh, margin) {
    const m = margin;
    return x >= m && y >= m && x + w <= vw - m && y + h <= vh - m;
  }

  function separatedFromAnchor(x, y, w, h, anchor, gap) {
    const tr = anchor;
    const g = gap;
    return (
      x + w <= tr.left - g ||
      x >= tr.right + g ||
      y + h <= tr.top - g ||
      y >= tr.bottom + g
    );
  }

  function overlapAreaWithAnchor(x, y, w, h, anchor) {
    const tr = anchor;
    const ix = Math.max(x, tr.left);
    const iy = Math.max(y, tr.top);
    const ax = Math.min(x + w, tr.right);
    const ay = Math.min(y + h, tr.bottom);
    return Math.max(0, ax - ix) * Math.max(0, ay - iy);
  }

  function visibleAreaInMargin(x, y, w, h, vw, vh, margin) {
    const m = margin;
    const x2 = Math.min(vw - m, x + w) - Math.max(m, x);
    const y2 = Math.min(vh - m, y + h) - Math.max(m, y);
    return Math.max(0, x2) * Math.max(0, y2);
  }

  /** Point anchor: top-left + gap; flip left/up if overflow. */
  function computePointMenuPlacement(tw, th, vw, vh, m, g, tr) {
    let x = tr.left + g;
    let y = tr.top + g;
    if (x + tw > vw - m) x = tr.left - g - tw;
    if (y + th > vh - m) y = tr.top - g - th;
    const c = clampToViewport(x, y, tw, th, vw, vh, m);
    return { x: c.x, y: c.y, placement: 'menu' };
  }

  /** Rect anchor + side + align; flip primary axis if overflow; clamp cross-axis. */
  function computeSideMenuPlacement(tw, th, vw, vh, m, g, tr, side, align) {
    const ah = tr.bottom - tr.top;
    const aw = tr.right - tr.left;
    const alignY = () => {
      if (align === 'center') return tr.top + ah / 2 - th / 2;
      if (align === 'end') return tr.bottom - th;
      return tr.top;
    };
    const alignX = () => {
      if (align === 'center') return tr.left + aw / 2 - tw / 2;
      if (align === 'end') return tr.right - tw;
      return tr.left;
    };

    let x;
    let y;

    if (side === 'right') {
      x = tr.right + g;
      if (x + tw > vw - m) x = tr.left - g - tw;
      y = alignY();
      y = Math.min(Math.max(m, y), Math.max(m, vh - m - th));
    } else if (side === 'left') {
      x = tr.left - g - tw;
      if (x < m) x = tr.right + g;
      y = alignY();
      y = Math.min(Math.max(m, y), Math.max(m, vh - m - th));
    } else if (side === 'bottom') {
      y = tr.bottom + g;
      if (y + th > vh - m) y = tr.top - g - th;
      x = alignX();
      x = Math.min(Math.max(m, x), Math.max(m, vw - m - tw));
    } else {
      y = tr.top - g - th;
      if (y < m) y = tr.bottom + g;
      x = alignX();
      x = Math.min(Math.max(m, x), Math.max(m, vw - m - tw));
    }

    const c = clampToViewport(x, y, tw, th, vw, vh, m);
    return { x: c.x, y: c.y, placement: 'menu' };
  }

  function computeMenuPlacementFull(opts, tw, th, vw, vh, m, g, tr) {
    const side = opts.side;
    const align = opts.align ?? 'start';
    if (!side) return computePointMenuPlacement(tw, th, vw, vh, m, g, tr);
    return computeSideMenuPlacement(tw, th, vw, vh, m, g, tr, side, align);
  }

  /** @param {object} opts — anchor, width, height; optional mode, viewport, margin, gap, preferPlacement, requireSeparation, side, align */
  function computePosition(opts) {
    const tw = opts.width;
    const th = opts.height;
    const vw =
      opts.viewportWidth ??
      (typeof global.innerWidth === 'number' ? global.innerWidth : 800);
    const vh =
      opts.viewportHeight ??
      (typeof global.innerHeight === 'number' ? global.innerHeight : 600);
    const margin = opts.margin ?? DEFAULT_MARGIN;
    const gap = opts.gap ?? DEFAULT_GAP;
    const tr = normalizeAnchor(opts.anchor);
    const m = margin;
    const g = gap;

    if (opts.mode === 'menu') {
      return computeMenuPlacementFull(opts, tw, th, vw, vh, m, g, tr);
    }

    const preferPlacement = opts.preferPlacement ?? PREFERENCE_TOOLTIP;
    const requireSeparation = opts.requireSeparation !== false;

    const fits = (x, y) => fitsViewport(x, y, tw, th, vw, vh, m);
    const sep = (x, y) =>
      !requireSeparation || separatedFromAnchor(x, y, tw, th, tr, g);

    const clampY = (x, y) => {
      const iy = Math.min(Math.max(m, y), Math.max(m, vh - m - th));
      return { x, y: iy };
    };
    const clampX = (x, y) => {
      const ix = Math.min(Math.max(m, x), Math.max(m, vw - m - tw));
      return { x: ix, y };
    };

    function tryPlacement(side) {
      switch (side) {
        case 'right': {
          const x = tr.right + g;
          if (x + tw > vw - m) return null;
          const { y } = clampY(x, tr.top + (tr.bottom - tr.top) / 2 - th / 2);
          if (!fits(x, y) || !sep(x, y)) return null;
          return { x, y, placement: side };
        }
        case 'left': {
          const x = tr.left - g - tw;
          if (x < m) return null;
          const { y } = clampY(x, tr.top + (tr.bottom - tr.top) / 2 - th / 2);
          if (!fits(x, y) || !sep(x, y)) return null;
          return { x, y, placement: side };
        }
        case 'bottom': {
          const y = tr.bottom + g;
          if (y + th > vh - m) return null;
          const { x } = clampX(tr.left + (tr.right - tr.left) / 2 - tw / 2, y);
          if (!fits(x, y) || !sep(x, y)) return null;
          return { x, y, placement: side };
        }
        case 'top': {
          const y = tr.top - g - th;
          if (y < m) return null;
          const { x } = clampX(tr.left + (tr.right - tr.left) / 2 - tw / 2, y);
          if (!fits(x, y) || !sep(x, y)) return null;
          return { x, y, placement: side };
        }
        default:
          return null;
      }
    }

    for (let i = 0; i < preferPlacement.length; i++) {
      const pos = tryPlacement(preferPlacement[i]);
      if (pos) return pos;
    }

    const emergency = [
      () => ({ x: m, y: tr.bottom + g }),
      () => ({ x: vw - m - tw, y: tr.bottom + g }),
      () => ({ x: tr.left - g - tw, y: vh - m - th }),
      () => ({ x: tr.right + g, y: vh - m - th }),
      () => ({ x: m, y: m }),
    ];

    let best = null;
    let bestOverlap = Infinity;
    let bestArea = -1;

    for (let i = 0; i < emergency.length; i++) {
      let { x, y } = emergency[i]();
      const c = clampToViewport(x, y, tw, th, vw, vh, m);
      x = c.x;
      y = c.y;
      if (!fits(x, y)) continue;
      const ov = overlapAreaWithAnchor(x, y, tw, th, tr);
      const area = visibleAreaInMargin(x, y, tw, th, vw, vh, m);
      if (ov < bestOverlap || (ov === bestOverlap && area > bestArea)) {
        best = { x, y, placement: /** @type {'fallback'} */ ('fallback') };
        bestOverlap = ov;
        bestArea = area;
      }
    }

    if (best) return best;

    const c = clampToViewport(tr.right + g, tr.bottom + g, tw, th, vw, vh, m);
    return { x: c.x, y: c.y, placement: 'fallback' };
  }

  global.FloatingRectPlacement = {
    DEFAULT_MARGIN,
    DEFAULT_GAP,
    OVERLAY_TRANSITION_FALLBACK_MS,
    PREFERENCE_TOOLTIP,
    prefersFineHover,
    normalizeAnchor,
    computePosition,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
