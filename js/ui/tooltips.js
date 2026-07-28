(() => {
  // js/workspace/float-placement.mjs
  var DEFAULT_MARGIN = 8;
  var DEFAULT_GAP = 4;
  var OVERLAY_TRANSITION_FALLBACK_MS = 170;
  var PREFERENCE_TOOLTIP = Object.freeze(["right", "left", "bottom", "top"]);
  function prefersFineHover() {
    return globalThis.matchMedia("(hover: hover) and (pointer: fine)").matches;
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
    const g2 = gap;
    return x + w <= tr.left - g2 || x >= tr.right + g2 || y + h <= tr.top - g2 || y >= tr.bottom + g2;
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
  function computePointMenuPlacement(tw, th, vw, vh, m, g2, tr) {
    let x = tr.left + g2;
    let y = tr.top + g2;
    if (x + tw > vw - m) x = tr.left - g2 - tw;
    if (y + th > vh - m) y = tr.top - g2 - th;
    const c = clampToViewport(x, y, tw, th, vw, vh, m);
    return { x: c.x, y: c.y, placement: "menu" };
  }
  function computeSideMenuPlacement(tw, th, vw, vh, m, g2, tr, side, align) {
    const ah = tr.bottom - tr.top;
    const aw = tr.right - tr.left;
    const alignY = () => {
      if (align === "center") return tr.top + ah / 2 - th / 2;
      if (align === "end") return tr.bottom - th;
      return tr.top;
    };
    const alignX = () => {
      if (align === "center") return tr.left + aw / 2 - tw / 2;
      if (align === "end") return tr.right - tw;
      return tr.left;
    };
    let x;
    let y;
    if (side === "right") {
      x = tr.right + g2;
      if (x + tw > vw - m) x = tr.left - g2 - tw;
      y = alignY();
      y = Math.min(Math.max(m, y), Math.max(m, vh - m - th));
    } else if (side === "left") {
      x = tr.left - g2 - tw;
      if (x < m) x = tr.right + g2;
      y = alignY();
      y = Math.min(Math.max(m, y), Math.max(m, vh - m - th));
    } else if (side === "bottom") {
      y = tr.bottom + g2;
      if (y + th > vh - m) y = tr.top - g2 - th;
      x = alignX();
      x = Math.min(Math.max(m, x), Math.max(m, vw - m - tw));
    } else {
      y = tr.top - g2 - th;
      if (y < m) y = tr.bottom + g2;
      x = alignX();
      x = Math.min(Math.max(m, x), Math.max(m, vw - m - tw));
    }
    const c = clampToViewport(x, y, tw, th, vw, vh, m);
    return { x: c.x, y: c.y, placement: "menu" };
  }
  function computeMenuPlacementFull(opts, tw, th, vw, vh, m, g2, tr) {
    const side = opts.side;
    const align = opts.align ?? "start";
    if (!side) return computePointMenuPlacement(tw, th, vw, vh, m, g2, tr);
    return computeSideMenuPlacement(tw, th, vw, vh, m, g2, tr, side, align);
  }
  function computePosition(opts) {
    const tw = opts.width;
    const th = opts.height;
    const vw = opts.viewportWidth ?? (typeof globalThis.innerWidth === "number" ? globalThis.innerWidth : 800);
    const vh = opts.viewportHeight ?? (typeof globalThis.innerHeight === "number" ? globalThis.innerHeight : 600);
    const margin = opts.margin ?? DEFAULT_MARGIN;
    const gap = opts.gap ?? DEFAULT_GAP;
    const tr = normalizeAnchor(opts.anchor);
    const m = margin;
    const g2 = gap;
    if (opts.mode === "menu") {
      return computeMenuPlacementFull(opts, tw, th, vw, vh, m, g2, tr);
    }
    const preferPlacement = opts.preferPlacement ?? PREFERENCE_TOOLTIP;
    const requireSeparation = opts.requireSeparation !== false;
    const fits = (x, y) => fitsViewport(x, y, tw, th, vw, vh, m);
    const sep = (x, y) => !requireSeparation || separatedFromAnchor(x, y, tw, th, tr, g2);
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
        case "right": {
          const x = tr.right + g2;
          if (x + tw > vw - m) return null;
          const { y } = clampY(x, tr.top + (tr.bottom - tr.top) / 2 - th / 2);
          if (!fits(x, y) || !sep(x, y)) return null;
          return { x, y, placement: side };
        }
        case "left": {
          const x = tr.left - g2 - tw;
          if (x < m) return null;
          const { y } = clampY(x, tr.top + (tr.bottom - tr.top) / 2 - th / 2);
          if (!fits(x, y) || !sep(x, y)) return null;
          return { x, y, placement: side };
        }
        case "bottom": {
          const y = tr.bottom + g2;
          if (y + th > vh - m) return null;
          const { x } = clampX(tr.left + (tr.right - tr.left) / 2 - tw / 2, y);
          if (!fits(x, y) || !sep(x, y)) return null;
          return { x, y, placement: side };
        }
        case "top": {
          const y = tr.top - g2 - th;
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
      () => ({ x: m, y: tr.bottom + g2 }),
      () => ({ x: vw - m - tw, y: tr.bottom + g2 }),
      () => ({ x: tr.left - g2 - tw, y: vh - m - th }),
      () => ({ x: tr.right + g2, y: vh - m - th }),
      () => ({ x: m, y: m })
    ];
    let best = null;
    let bestOverlap = Infinity;
    let bestArea = -1;
    for (let i = 0; i < emergency.length; i++) {
      let { x, y } = emergency[i]();
      const c2 = clampToViewport(x, y, tw, th, vw, vh, m);
      x = c2.x;
      y = c2.y;
      if (!fits(x, y)) continue;
      const ov = overlapAreaWithAnchor(x, y, tw, th, tr);
      const area = visibleAreaInMargin(x, y, tw, th, vw, vh, m);
      if (ov < bestOverlap || ov === bestOverlap && area > bestArea) {
        best = { x, y, placement: "fallback" };
        bestOverlap = ov;
        bestArea = area;
      }
    }
    if (best) return best;
    const c = clampToViewport(tr.right + g2, tr.bottom + g2, tw, th, vw, vh, m);
    return { x: c.x, y: c.y, placement: "fallback" };
  }
  var FloatingRectPlacement = {
    DEFAULT_MARGIN,
    DEFAULT_GAP,
    OVERLAY_TRANSITION_FALLBACK_MS,
    PREFERENCE_TOOLTIP,
    prefersFineHover,
    normalizeAnchor,
    computePosition
  };
  var g = typeof window !== "undefined" ? window : globalThis;
  g.FloatingRectPlacement = FloatingRectPlacement;

  // js/ui/tooltips.mjs
  function frp() {
    return FloatingRectPlacement;
  }
  var TOOLTIP_SPOUT_SIZE = 6;
  var TOOLTIP_ARROW_MIN = 12;
  var TOUCH_SHOW_DELAY_MS = 400;
  function tooltipMargin() {
    return frp().DEFAULT_MARGIN;
  }
  function tooltipGap() {
    return Math.max(frp().DEFAULT_GAP, Math.ceil(TOOLTIP_SPOUT_SIZE * 0.65));
  }
  var PLACEMENT_SPOUT = Object.freeze({
    top: "above",
    bottom: "below",
    left: "left",
    right: "right"
  });
  var SPOUT_CLASSES = [
    "tooltip-spout-above",
    "tooltip-spout-below",
    "tooltip-spout-left",
    "tooltip-spout-right",
    "tooltip-spout-none"
  ];
  function clamp(v, min, max) {
    return Math.max(min, Math.min(v, max));
  }
  function inferSpoutSide(x, y, tw, th, tr) {
    const cx = tr.left + tr.width / 2;
    const cy = tr.top + tr.height / 2;
    const dx = cx - (x + tw / 2);
    const dy = cy - (y + th / 2);
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "left" : "right";
    return dy > 0 ? "above" : "below";
  }
  function clearSpout(tip) {
    for (let i = 0; i < SPOUT_CLASSES.length; i++) tip.classList.remove(SPOUT_CLASSES[i]);
    tip.style.removeProperty("--tooltip-arrow-x");
    tip.style.removeProperty("--tooltip-arrow-y");
  }
  function applySpout(tip, anchor, placement, x, y, tw, th, tr, arrowBox = null) {
    clearSpout(tip);
    if (anchor.hasAttribute("data-tooltip-no-spout")) {
      tip.classList.add("tooltip-spout-none");
      return;
    }
    let side = PLACEMENT_SPOUT[placement];
    if (!side && placement === "fallback") side = inferSpoutSide(x, y, tw, th, tr);
    if (!side) {
      tip.classList.add("tooltip-spout-none");
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
    if (side === "above" || side === "below") {
      tip.style.setProperty("--tooltip-arrow-x", `${clamp(cx - ax, min, aw - min)}px`);
    } else {
      tip.style.setProperty("--tooltip-arrow-y", `${clamp(cy - ay, min, ah - min)}px`);
    }
  }
  var tooltipRoot = null;
  var suppressedTooltipAnchors = /* @__PURE__ */ new Set();
  var tooltipHideFallbackTimer = null;
  var tooltipLeaveGen = 0;
  var tooltipTransitionEndHandler = null;
  var tooltipAnchor = null;
  var touchShowTimer = null;
  var tooltipSuppressLeaveUntilPointerUp = null;
  var tooltipPointerMoveHandler = null;
  function anchorHitAt(anchor, x, y) {
    const r = anchor.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  function stopTooltipPointerTracking() {
    if (!tooltipPointerMoveHandler) return;
    window.removeEventListener("pointermove", tooltipPointerMoveHandler);
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
    window.addEventListener("pointermove", tooltipPointerMoveHandler);
  }
  function cancelTooltipHideAnim() {
    if (tooltipHideFallbackTimer != null) {
      clearTimeout(tooltipHideFallbackTimer);
      tooltipHideFallbackTimer = null;
    }
    if (tooltipRoot && tooltipTransitionEndHandler) {
      const prevInner = tooltipRoot.querySelector(".tooltip-inner");
      if (prevInner) prevInner.removeEventListener("transitionend", tooltipTransitionEndHandler);
      tooltipTransitionEndHandler = null;
    }
    tooltipLeaveGen++;
  }
  function parseLintErrors(anchor) {
    const raw = anchor.getAttribute("data-tooltip-errors");
    if (!raw) return null;
    try {
      const items = JSON.parse(raw);
      return Array.isArray(items) && items.length ? items : null;
    } catch (_) {
      return null;
    }
  }
  function isStackedLintErrors(anchor) {
    return !!parseLintErrors(anchor) && !anchor.hasAttribute("data-tooltip-head");
  }
  function anchorHasTooltip(anchor) {
    if (!anchor) return false;
    return !!(anchor.getAttribute("data-tooltip") || anchor.getAttribute("data-tooltip-tone") || anchor.hasAttribute("data-tooltip-head") || anchor.hasAttribute("data-tooltip-rich") && typeof anchor._belTooltipRich === "function" || parseLintErrors(anchor));
  }
  function fillDiagnosticTooltip(tip, message, severity) {
    tip.classList.add("tooltip-inner--diagnostic", `tooltip-inner--${severity}`);
    tip.replaceChildren();
    const frame = document.createElement("div");
    frame.className = `cm-diagnostic cm-diagnostic-${severity}`;
    const head = document.createElement("div");
    head.className = "beljar-tip-head";
    const kind = document.createElement("span");
    kind.className = "beljar-tip-kind";
    kind.textContent = severity === "warning" ? "Warning" : "Error";
    head.appendChild(kind);
    const body = document.createElement("div");
    body.className = "beljar-tip-body";
    body.textContent = message || "";
    frame.append(head, body);
    tip.appendChild(frame);
  }
  function fillTooltipContent(tip, anchor) {
    const text = anchor.getAttribute("data-tooltip");
    const tone = anchor.getAttribute("data-tooltip-tone");
    const items = parseLintErrors(anchor);
    const headed = anchor.hasAttribute("data-tooltip-head");
    tip.classList.remove(
      "tooltip-inner--lint-errors",
      "tooltip-inner--diagnostic",
      "tooltip-inner--error",
      "tooltip-inner--warning",
      "tooltip-inner--rich"
    );
    if (anchor.hasAttribute("data-tooltip-rich") && typeof anchor._belTooltipRich === "function") {
      tip.classList.add("tooltip-inner--rich");
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
    if (tone === "error" || tone === "warning") {
      fillDiagnosticTooltip(tip, text, tone);
      return;
    }
    if (headed) {
      tip.classList.add("tooltip-inner--lint-errors");
      tip.replaceChildren();
      const head = document.createElement("div");
      head.className = "tooltip-lint-head";
      head.textContent = text || "Errors detected";
      tip.appendChild(head);
      if (items) {
        const body = document.createElement("div");
        body.className = "tooltip-lint-body";
        const list = document.createElement("ul");
        list.className = "tooltip-lint-list";
        for (const item of items) {
          const li = document.createElement("li");
          li.className = "tooltip-lint-item" + (item.kind === "warning" ? " tooltip-lint-item--warning" : "");
          const loc = item.prefix ? `${item.prefix}${item.line ?? "?"}` : String(item.line ?? "?");
          const line = document.createElement("span");
          line.className = "tooltip-lint-line";
          line.textContent = loc;
          const msg = document.createElement("span");
          msg.className = "tooltip-lint-msg";
          msg.textContent = item.msg || item.message || "Error";
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
    const raw = (anchor.getAttribute("data-tooltip-placement") || "").trim().toLowerCase();
    if (!raw) return frp().PREFERENCE_TOOLTIP;
    const side = raw === "below" ? "bottom" : raw === "above" ? "top" : raw;
    const order = ["bottom", "top", "right", "left"];
    if (!order.includes(side)) return frp().PREFERENCE_TOOLTIP;
    return [side, ...order.filter((s) => s !== side)];
  }
  function anchorConnected(anchor) {
    return !!(anchor && anchor.isConnected);
  }
  function tooltipRectEl(anchor) {
    const fn = anchor._belTooltipRectEl;
    if (typeof fn === "function") {
      const el = fn(anchor);
      if (el && el.nodeType === 1 && el.isConnected) return el;
    }
    return anchor;
  }
  function clearTooltipRoot() {
    tooltipRoot.replaceChildren();
  }
  function tooltipAnimatedEl() {
    return tooltipRoot.querySelector(".tooltip-stack") || tooltipRoot.querySelector(".tooltip-inner");
  }
  function buildStackedDiagnosticTooltips(anchor) {
    const items = parseLintErrors(anchor);
    clearTooltipRoot();
    const stack = document.createElement("div");
    stack.className = "tooltip-stack";
    for (const item of items) {
      const tip = document.createElement("div");
      tip.className = "tooltip-inner";
      const severity = item.kind === "warning" ? "warning" : "error";
      fillDiagnosticTooltip(tip, item.msg || item.message || "", severity);
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
    if (placement === "top") return inners[inners.length - 1];
    if (placement === "bottom") return inners[0];
    return verticallyClosestStackInner(inners, tr);
  }
  function applyStackSpout(stack, anchor, placement, x, y, tw, th, tr) {
    const inners = [...stack.querySelectorAll(".tooltip-inner")];
    for (let i = 0; i < inners.length; i++) clearSpout(inners[i]);
    if (anchor.hasAttribute("data-tooltip-no-spout")) {
      for (let i = 0; i < inners.length; i++) inners[i].classList.add("tooltip-spout-none");
      return;
    }
    let side = PLACEMENT_SPOUT[placement];
    if (!side && placement === "fallback") side = inferSpoutSide(x, y, tw, th, tr);
    if (!side) {
      for (let i = 0; i < inners.length; i++) inners[i].classList.add("tooltip-spout-none");
      return;
    }
    const target = stackSpoutTarget(inners, placement, tr);
    if (!target) return;
    const targetRect = target.getBoundingClientRect();
    applySpout(target, anchor, placement, x, y, tw, th, tr, {
      left: targetRect.left,
      top: targetRect.top,
      width: targetRect.width,
      height: targetRect.height
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
      tip = tooltipRoot.querySelector(".tooltip-inner");
      if (!tip) {
        ensureTooltipInner();
        tip = tooltipRoot.querySelector(".tooltip-inner");
      }
      fillTooltipContent(tip, anchor);
    }
    if (!tip) return;
    tooltipRoot.classList.add("is-measuring");
    const tw = tooltipRoot.offsetWidth;
    const th = tooltipRoot.offsetHeight;
    const tr = tooltipRectEl(anchor).getBoundingClientRect();
    const pos = frp().computePosition({
      anchor: tr,
      width: tw,
      height: th,
      margin: tooltipMargin(),
      gap: tooltipGap(),
      preferPlacement: tooltipPreferPlacement(anchor)
    });
    tooltipRoot.classList.remove("is-measuring");
    tooltipRoot.style.left = `${pos.x}px`;
    tooltipRoot.style.top = `${pos.y}px`;
    if (stacked) applyStackSpout(tip, anchor, pos.placement, pos.x, pos.y, tw, th, tr);
    else applySpout(tip, anchor, pos.placement, pos.x, pos.y, tw, th, tr);
    tooltipRoot.classList.add("is-visible");
  }
  function isPlainTextTooltip(anchor) {
    if (!anchor.getAttribute("data-tooltip")) return false;
    if (anchor.getAttribute("data-tooltip-tone")) return false;
    if (anchor.hasAttribute("data-tooltip-head")) return false;
    if (anchor.hasAttribute("data-tooltip-rich")) return false;
    if (parseLintErrors(anchor)) return false;
    return true;
  }
  function refreshTooltipIfAnchored(target) {
    if (!tooltipRoot || tooltipAnchor !== target) return;
    if (!anchorConnected(target)) {
      hideTooltip();
      return;
    }
    if (tooltipRoot.hidden || tooltipRoot.classList.contains("is-leaving")) return;
    if (!anchorHasTooltip(target)) {
      hideTooltip();
      return;
    }
    if (isPlainTextTooltip(target) && !tooltipRoot.querySelector(".tooltip-stack")) {
      const tip = tooltipRoot.querySelector(".tooltip-inner");
      if (tip) {
        const text = target.getAttribute("data-tooltip") || "";
        if (tip.textContent !== text) tip.textContent = text;
        return;
      }
    }
    layoutTooltip(target);
  }
  function ensureTooltipInner() {
    if (tooltipRoot.querySelector(".tooltip-stack")) return;
    if (!tooltipRoot.querySelector(".tooltip-inner")) {
      const inner = document.createElement("div");
      inner.className = "tooltip-inner";
      tooltipRoot.appendChild(inner);
    }
  }
  function showTooltip(anchor, opts) {
    opts = opts || {};
    if (suppressedTooltipAnchors.has(anchor)) return;
    if (!anchorConnected(anchor)) return;
    if (!anchorHasTooltip(anchor)) return;
    cancelTooltipHideAnim();
    if (tooltipAnchor === anchor && !tooltipRoot.hidden && !tooltipRoot.classList.contains("is-leaving")) {
      layoutTooltip(anchor);
      return;
    }
    clearTooltipRoot();
    if (!isStackedLintErrors(anchor)) ensureTooltipInner();
    tooltipRoot.classList.remove("is-leaving");
    tooltipAnchor = anchor;
    tooltipRoot.hidden = false;
    layoutTooltip(anchor);
    if (opts.trackPointer && frp().prefersFineHover()) startTooltipPointerTracking(anchor);
  }
  function hideTooltip() {
    stopTooltipPointerTracking();
    tooltipAnchor = null;
    if (!tooltipRoot) return;
    if (tooltipRoot.hidden && !tooltipRoot.classList.contains("is-leaving")) return;
    cancelTooltipHideAnim();
    const finishGen = tooltipLeaveGen;
    const fallbackMs = frp().OVERLAY_TRANSITION_FALLBACK_MS;
    const inner = tooltipAnimatedEl();
    if (!inner) {
      tooltipRoot.classList.remove("is-visible", "is-measuring", "is-leaving");
      tooltipRoot.hidden = true;
      tooltipRoot.style.left = "";
      tooltipRoot.style.top = "";
      return;
    }
    if (inner.classList.contains("tooltip-stack")) {
      for (const tip of inner.querySelectorAll(".tooltip-inner")) clearSpout(tip);
    } else clearSpout(inner);
    tooltipRoot.classList.remove("is-visible", "is-measuring");
    tooltipRoot.classList.add("is-leaving");
    void inner.offsetHeight;
    const finish = () => {
      if (finishGen !== tooltipLeaveGen) return;
      if (tooltipTransitionEndHandler && inner) {
        inner.removeEventListener("transitionend", tooltipTransitionEndHandler);
        tooltipTransitionEndHandler = null;
      }
      tooltipHideFallbackTimer = null;
      tooltipRoot.classList.remove("is-leaving");
      tooltipRoot.hidden = true;
      tooltipRoot.style.left = "";
      tooltipRoot.style.top = "";
    };
    const onEnd = (e) => {
      if (e.target !== inner || e.propertyName !== "transform") return;
      finish();
    };
    tooltipTransitionEndHandler = onEnd;
    inner.addEventListener("transitionend", onEnd);
    tooltipHideFallbackTimer = setTimeout(finish, fallbackMs);
  }
  function hideTooltipImmediate() {
    stopTooltipPointerTracking();
    tooltipAnchor = null;
    if (!tooltipRoot) return;
    cancelTooltipHideAnim();
    const inner = tooltipAnimatedEl();
    if (inner?.classList.contains("tooltip-stack")) {
      for (const tip of inner.querySelectorAll(".tooltip-inner")) clearSpout(tip);
    } else if (inner) clearSpout(inner);
    tooltipRoot.classList.remove("is-visible", "is-measuring", "is-leaving");
    tooltipRoot.hidden = true;
    tooltipRoot.style.left = "";
    tooltipRoot.style.top = "";
  }
  function bindTooltipEl(el) {
    if (!el || el.nodeType !== 1 || el._belTooltipBound) return;
    el._belTooltipBound = true;
    el.addEventListener("mouseenter", () => {
      if (!frp().prefersFineHover()) return;
      showTooltip(el, { trackPointer: !el.hasAttribute("data-tooltip-no-track") });
    });
    el.addEventListener("mouseleave", () => {
      if (!frp().prefersFineHover()) return;
      if (tooltipSuppressLeaveUntilPointerUp === el) return;
      if (tooltipAnchor !== el) return;
      hideTooltipImmediate();
    });
    el.addEventListener("focusin", () => {
      if (!el.matches(":focus-visible")) return;
      if (tooltipAnchor === el && !tooltipRoot.hidden && !tooltipRoot.classList.contains("is-leaving")) {
        return;
      }
      showTooltip(el);
    });
    el.addEventListener("focusout", () => {
      if (tooltipAnchor === el) hideTooltip();
    });
    el.addEventListener(
      "pointerdown",
      (e) => {
        if (!frp().prefersFineHover() || !e.isPrimary || e.button !== 0) return;
        if (e.pointerType === "touch") return;
        tooltipSuppressLeaveUntilPointerUp = el;
      },
      true
    );
    el.addEventListener(
      "touchstart",
      () => {
        if (frp().prefersFineHover()) return;
        clearTimeout(touchShowTimer);
        touchShowTimer = setTimeout(() => showTooltip(el), TOUCH_SHOW_DELAY_MS);
      },
      { passive: true }
    );
    el.addEventListener("touchend", () => {
      if (frp().prefersFineHover()) return;
      clearTimeout(touchShowTimer);
      if (tooltipAnchor === el) hideTooltip();
    });
    el.addEventListener("touchcancel", () => {
      if (frp().prefersFineHover()) return;
      clearTimeout(touchShowTimer);
      if (tooltipAnchor === el) hideTooltip();
    });
  }
  function bindTooltips() {
    if (!tooltipRoot) return;
    document.querySelectorAll("[data-tooltip]").forEach(bindTooltipEl);
    window.addEventListener("pointerup", (e) => {
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
    window.addEventListener("pointercancel", (e) => {
      if (!e.isPrimary) return;
      tooltipSuppressLeaveUntilPointerUp = null;
    });
    window.addEventListener("resize", () => {
      if (tooltipAnchor) layoutTooltip(tooltipAnchor);
    });
    window.addEventListener(
      "scroll",
      (e) => {
        if (!tooltipAnchor) return;
        if (tooltipRoot && e.target instanceof Node && tooltipRoot.contains(e.target)) return;
        hideTooltipImmediate();
      },
      true
    );
    const tooltipAttrObserver = new MutationObserver(function(records) {
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (r.type !== "attributes" || r.attributeName !== "data-tooltip" && r.attributeName !== "data-tooltip-errors" && r.attributeName !== "data-tooltip-tone" && r.attributeName !== "data-tooltip-head") continue;
        const el = r.target;
        if (!el || el.nodeType !== 1) continue;
        if (r.oldValue === el.getAttribute(r.attributeName)) continue;
        refreshTooltipIfAnchored(el);
      }
    });
    tooltipAttrObserver.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["data-tooltip", "data-tooltip-errors", "data-tooltip-tone", "data-tooltip-head"]
    });
  }
  function setTooltip(el, text, opts) {
    if (!el || el.nodeType !== 1) return;
    opts = opts || {};
    el.removeAttribute("title");
    const tip = text != null ? String(text).trim() : "";
    if (!tip) {
      el.removeAttribute("data-tooltip");
      if (opts.ariaLabel !== false) el.removeAttribute("aria-label");
      return;
    }
    const prev = el.getAttribute("data-tooltip");
    if (prev !== tip) el.setAttribute("data-tooltip", tip);
    if (opts.ariaLabel !== false) el.setAttribute("aria-label", tip);
    bindTooltipEl(el);
  }
  function setRichTooltip(el, buildFragment, ariaText) {
    if (!el || el.nodeType !== 1) return;
    el.removeAttribute("title");
    if (typeof buildFragment !== "function") {
      el._belTooltipRich = null;
      el.removeAttribute("data-tooltip-rich");
      return;
    }
    el._belTooltipRich = buildFragment;
    el.setAttribute("data-tooltip-rich", "");
    const aria = ariaText != null ? String(ariaText).trim() : "";
    if (aria) el.setAttribute("aria-label", aria);
    bindTooltipEl(el);
  }
  function bindOverflowTip(el, getText) {
    if (!el || el.nodeType !== 1 || el._belOverflowTipBound) return;
    el._belOverflowTipBound = true;
    el.addEventListener("mouseenter", function() {
      if (!frp().prefersFineHover()) return;
      const text = el.scrollWidth > el.clientWidth ? getText ? getText() : (el.textContent || "").trim() : "";
      if (text) el.setAttribute("data-tooltip", text);
      else el.removeAttribute("data-tooltip");
    });
    bindTooltipEl(el);
  }
  var Tooltips = {
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
      if (el && el.nodeType === 1) el._belTooltipRectEl = typeof fn === "function" ? fn : null;
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
    }
  };
  function installTooltips() {
    if (typeof document === "undefined") return;
    tooltipRoot = document.getElementById("tooltip-root");
    bindTooltips();
  }
  if (typeof document !== "undefined") {
    installTooltips();
    globalThis.Tooltips = Tooltips;
  }
})();
