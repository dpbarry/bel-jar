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
  function prepareOverflow(el) {
    if (!el._belOverflowTipBound) return;
    const getText = el._belOverflowGetText;
    const text = el.scrollWidth > el.clientWidth ? getText ? getText() : (el.textContent || "").trim() : "";
    if (text) el.setAttribute("data-tooltip", text);
    else el.removeAttribute("data-tooltip");
  }
  function tooltipIsShowing() {
    return !!(tooltipRoot && !tooltipRoot.hidden && !tooltipRoot.classList.contains("is-leaving"));
  }
  function tippableAt(x, y) {
    let n = document.elementFromPoint(x, y);
    while (n && n.nodeType === 1) {
      if (n._belOverflowTipBound) prepareOverflow(n);
      if (!suppressedTooltipAnchors.has(n) && anchorHasTooltip(n)) return n;
      n = n.parentElement;
    }
    return null;
  }
  function syncTooltipToPointer(x, y) {
    if (!frp().prefersFineHover()) return;
    if (!tooltipRoot) return;
    if (tooltipSuppressLeaveUntilPointerUp) return;
    const next = tippableAt(x, y);
    if (next) {
      if (next._belTooltipBound) {
        if (tooltipAnchor === next && tooltipIsShowing()) return;
        showTooltip(next);
      }
      return;
    }
    if (tooltipAnchor && tooltipAnchor._belTooltipBound) hideTooltipImmediate();
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
  }
  function hideTooltip() {
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
    el.addEventListener("mouseenter", (ev) => {
      if (!frp().prefersFineHover()) return;
      syncTooltipToPointer(ev.clientX, ev.clientY);
    });
    el.addEventListener("mouseleave", (ev) => {
      if (!frp().prefersFineHover()) return;
      if (tooltipSuppressLeaveUntilPointerUp === el) return;
      syncTooltipToPointer(ev.clientX, ev.clientY);
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
    window.addEventListener("pointermove", (e) => {
      syncTooltipToPointer(e.clientX, e.clientY);
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
    el._belOverflowGetText = getText || null;
    el.addEventListener("mouseenter", function() {
      if (!frp().prefersFineHover()) return;
      const text = el.scrollWidth > el.clientWidth ? getText ? getText() : (el.textContent || "").trim() : "";
      if (text) el.setAttribute("data-tooltip", text);
      else el.removeAttribute("data-tooltip");
    });
    bindTooltipEl(el);
  }
  var Tooltips2 = {
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
    globalThis.Tooltips = Tooltips2;
  }

  // js/ui/toasts.mjs
  var global = globalThis;
  var DEFAULT_DURATION_MS = 3500;
  var LEAVE_MS = 280;
  var UNTIL_POLL_MS = 120;
  var stackEl = null;
  var seq = 0;
  var live = /* @__PURE__ */ new Map();
  function nextId() {
    seq += 1;
    return "toast-" + seq;
  }
  function durationForMode(mode) {
    try {
      if (typeof Persist !== "undefined" && typeof Persist.toastDurationForMode === "function") {
        return Persist.toastDurationForMode(mode);
      }
    } catch (_) {
    }
    if (mode === "short") return 2e3;
    if (mode === "long") return 5e3;
    return DEFAULT_DURATION_MS;
  }
  function normalizeDuration(opts) {
    var fallback = DEFAULT_DURATION_MS;
    try {
      if (typeof Persist !== "undefined" && typeof Persist.toastDurationMs === "function") {
        fallback = Persist.toastDurationMs();
      }
    } catch (_) {
    }
    if (!opts || opts.duration === void 0) return fallback;
    const d = opts.duration;
    if (d === false || d === null || d === 0 || d === Infinity) return null;
    if (d === "short" || d === "normal" || d === "long") return durationForMode(d);
    if (typeof d === "number" && d > 0) return d;
    return fallback;
  }
  function parseOpts(message, opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    return {
      message: String(message || ""),
      duration: normalizeDuration(o),
      closable: !!o.closable,
      kind: o.kind || "default",
      until: typeof o.until === "function" ? o.until : null,
      onDismiss: typeof o.onDismiss === "function" ? o.onDismiss : null,
      notify: o.notify,
      durable: o.durable,
      body: o.body != null ? String(o.body) : null,
      detail: o.detail != null ? String(o.detail) : null,
      source: o.source != null ? String(o.source) : null,
      dedupeKey: o.dedupeKey != null ? String(o.dedupeKey) : null,
      category: o.category != null ? String(o.category) : null,
      links: o.links && typeof o.links === "object" ? o.links : null
    };
  }
  function shouldNotify(kind, notifyOpt, durableOpt) {
    if (notifyOpt === false || durableOpt === false) return false;
    if (notifyOpt === true || durableOpt === true) return true;
    return false;
  }
  function pushNotification(message, parsed) {
    const N = global.Notifications;
    if (!N) return;
    if (typeof N.fromToast === "function") {
      N.fromToast(message, {
        kind: parsed.kind,
        body: parsed.body,
        detail: parsed.detail,
        source: parsed.source,
        dedupeKey: parsed.dedupeKey,
        category: parsed.category,
        links: parsed.links
      });
      return;
    }
    if (typeof N.push === "function") N.push(message);
  }
  function kindClass(kind) {
    if (kind === "success" || kind === "error" || kind === "info" || kind === "warn") {
      return "toast--" + kind;
    }
    return "toast--default";
  }
  function clearTimers(entry) {
    if (entry.autoTimer != null) {
      clearTimeout(entry.autoTimer);
      entry.autoTimer = null;
    }
    if (entry.untilTimer != null) {
      clearInterval(entry.untilTimer);
      entry.untilTimer = null;
    }
    if (entry.untilPromise) entry.untilPromise = null;
  }
  function removeNode(entry) {
    if (!entry || !entry.el || !entry.el.parentNode) return;
    entry.el.parentNode.removeChild(entry.el);
  }
  function finishDismiss(id, entry) {
    if (!entry || entry.dismissed) return;
    entry.dismissed = true;
    clearTimers(entry);
    live.delete(id);
    try {
      if (entry.onDismiss) entry.onDismiss();
    } catch (err) {
      if (global.console && console.error) console.error("[toast]", err);
    }
    removeNode(entry);
    if (live.size === 0) hideToastLayer();
  }
  function showToastLayer() {
    if (!stackEl || typeof stackEl.showPopover !== "function") return;
    try {
      if (!stackEl.matches(":popover-open")) stackEl.showPopover();
    } catch (_) {
    }
  }
  function hideToastLayer() {
    if (!stackEl || typeof stackEl.hidePopover !== "function") return;
    try {
      if (stackEl.matches(":popover-open")) stackEl.hidePopover();
    } catch (_) {
    }
  }
  function animateOut(id, entry) {
    if (!entry || entry.leaving || entry.dismissed) return;
    entry.leaving = true;
    clearTimers(entry);
    const el = entry.el;
    el.classList.remove("is-visible");
    el.classList.add("is-leaving");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener("transitionend", onEnd);
      finishDismiss(id, entry);
    };
    const onEnd = (e) => {
      if (e.target !== el) return;
      finish();
    };
    el.addEventListener("transitionend", onEnd);
    setTimeout(finish, LEAVE_MS + 40);
  }
  function wireUntil(id, entry, untilFn) {
    const result = untilFn();
    if (result && typeof result.then === "function") {
      entry.untilPromise = result;
      result.then(() => animateOut(id, entry)).catch(() => animateOut(id, entry));
      return;
    }
    entry.untilTimer = setInterval(() => {
      try {
        if (untilFn()) animateOut(id, entry);
      } catch (err) {
        if (global.console && console.error) console.error("[toast]", err);
        animateOut(id, entry);
      }
    }, UNTIL_POLL_MS);
  }
  function show(message, opts) {
    if (!stackEl) init();
    const parsed = parseOpts(message, opts);
    if (!parsed.message) return null;
    if (shouldNotify(parsed.kind, parsed.notify, parsed.durable)) {
      pushNotification(parsed.message, parsed);
    }
    const id = nextId();
    const el = document.createElement("div");
    el.className = "toast " + kindClass(parsed.kind);
    el.setAttribute("role", parsed.kind === "error" ? "alert" : "status");
    el.dataset.toastId = id;
    const body = document.createElement("div");
    body.className = "toast-body";
    body.textContent = parsed.message;
    el.appendChild(body);
    if (parsed.closable) {
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "icon-btn toast-close";
      closeBtn.setAttribute("aria-label", "Dismiss");
      closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        animateOut(id, entry);
      });
      el.appendChild(closeBtn);
    }
    const entry = {
      id,
      el,
      dismissed: false,
      leaving: false,
      onDismiss: parsed.onDismiss,
      autoTimer: null,
      untilTimer: null,
      untilPromise: null
    };
    live.set(id, entry);
    showToastLayer();
    stackEl.appendChild(el);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add("is-visible"));
    });
    if (parsed.until) {
      wireUntil(id, entry, parsed.until);
    } else if (parsed.duration != null) {
      entry.autoTimer = setTimeout(() => animateOut(id, entry), parsed.duration);
    }
    return id;
  }
  function typed(kind, message, opts) {
    const o = opts && typeof opts === "object" ? Object.assign({}, opts) : {};
    o.kind = kind;
    return show(message, o);
  }
  function dismiss(id) {
    const entry = live.get(id);
    if (entry) animateOut(id, entry);
  }
  function dismissAll() {
    Array.from(live.keys()).forEach(dismiss);
  }
  function init() {
    stackEl = document.getElementById("toast-stack");
    if (!stackEl) {
      stackEl = document.createElement("div");
      stackEl.id = "toast-stack";
      stackEl.className = "toast-stack";
      stackEl.setAttribute("aria-live", "polite");
      stackEl.setAttribute("aria-relevant", "additions");
      stackEl.dataset.toastsOwned = "yes";
      document.body.appendChild(stackEl);
    }
    if (!stackEl.hasAttribute("popover")) stackEl.setAttribute("popover", "manual");
  }
  function dispose() {
    dismissAll();
    if (stackEl && stackEl.dataset && stackEl.dataset.toastsOwned === "yes") {
      try {
        stackEl.remove();
      } catch (_) {
      }
    }
    stackEl = null;
  }
  global.Toasts = {
    init,
    dispose,
    show,
    error: (message, opts) => typed("error", message, opts),
    warn: (message, opts) => typed("warn", message, opts),
    success: (message, opts) => typed("success", message, opts),
    info: (message, opts) => typed("info", message, opts),
    dismiss,
    dismissAll,
    _pure: { normalizeDuration, parseOpts, shouldNotify, DEFAULT_DURATION_MS }
  };
  global.BelJarToasts = global.Toasts;

  // js/ui/notification-store.mjs
  var SCHEMA_VERSION = 1;
  var DEFAULT_CAP = 100;
  var STORAGE_KEY = "beljar-notifications";
  var KINDS = /* @__PURE__ */ new Set(["error", "warn", "info", "success", "system"]);
  var CATEGORIES = /* @__PURE__ */ new Set(["teaching", "ops", "product", "remote"]);
  var ORIGINS = /* @__PURE__ */ new Set(["local", "remote"]);
  function newId() {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
    } catch (_) {
    }
    return "notif-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function migrateRecord(raw) {
    if (!raw || typeof raw !== "object") return null;
    const v = raw.v == null ? 1 : Number(raw.v);
    if (v === 1) return normalizeRecord(raw);
    return normalizeRecord(raw);
  }
  function normalizeRecord(input) {
    if (input == null) return null;
    if (typeof input === "string") {
      const title2 = String(input).trim();
      if (!title2) return null;
      return {
        id: newId(),
        v: SCHEMA_VERSION,
        kind: "info",
        category: "ops",
        title: title2,
        body: null,
        detail: null,
        source: "legacy",
        createdAt: Date.now(),
        readAt: null,
        dismissedAt: null,
        dedupeKey: null,
        links: null,
        origin: "local",
        remoteId: null,
        expiresAt: null
      };
    }
    if (typeof input !== "object") return null;
    const title = String(input.title != null ? input.title : input.message || "").trim();
    if (!title && !input.body && !input.detail) return null;
    const kind = KINDS.has(input.kind) ? input.kind : "info";
    const category = CATEGORIES.has(input.category) ? input.category : "ops";
    const origin = ORIGINS.has(input.origin) ? input.origin : "local";
    const createdAt = Number.isFinite(input.createdAt) ? input.createdAt : Number.isFinite(input.time) ? input.time : Date.now();
    let links = null;
    if (input.links && typeof input.links === "object") {
      links = {
        fileId: input.links.fileId != null ? String(input.links.fileId) : void 0,
        path: input.links.path != null ? String(input.links.path) : void 0,
        line: Number.isFinite(input.links.line) ? input.links.line : void 0,
        hole: input.links.hole != null ? String(input.links.hole) : void 0,
        from: Number.isFinite(input.links.from) ? input.links.from : void 0,
        to: Number.isFinite(input.links.to) ? input.links.to : void 0
      };
    }
    return {
      id: input.id && String(input.id) || newId(),
      v: SCHEMA_VERSION,
      kind,
      category,
      title: title || String(input.body || "Notification").slice(0, 120),
      body: input.body != null ? String(input.body) : null,
      detail: input.detail != null ? String(input.detail) : null,
      source: input.source != null ? String(input.source) : "unknown",
      createdAt,
      readAt: input.readAt != null ? Number(input.readAt) : null,
      dismissedAt: input.dismissedAt != null ? Number(input.dismissedAt) : null,
      dedupeKey: input.dedupeKey != null ? String(input.dedupeKey) : null,
      links,
      origin,
      remoteId: input.remoteId != null ? String(input.remoteId) : null,
      expiresAt: input.expiresAt != null ? Number(input.expiresAt) : null
    };
  }
  function linkTarget(rec) {
    const l = rec && rec.links;
    if (!l || !l.fileId) return null;
    const from = Number.isFinite(l.from) ? l.from : null;
    const line = Number.isFinite(l.line) && l.line >= 1 ? Math.floor(l.line) : null;
    if (from == null && line == null) return null;
    const path = l.path != null ? String(l.path) : "";
    const base = path ? path.slice(path.lastIndexOf("/") + 1) : String(l.fileId);
    return {
      fileId: String(l.fileId),
      from,
      to: Number.isFinite(l.to) ? l.to : from,
      line,
      label: line != null ? base + ":" + line : base
    };
  }
  function createMemoryAdapter(seed) {
    let items = Array.isArray(seed) ? seed.slice() : [];
    return {
      load() {
        return items.slice();
      },
      save(next) {
        items = Array.isArray(next) ? next.slice() : [];
      }
    };
  }
  function createLocalPersistAdapter(opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    const key = o.key || STORAGE_KEY;
    const loadFn = typeof o.load === "function" ? o.load : null;
    const saveFn = typeof o.save === "function" ? o.save : null;
    function readRaw() {
      if (loadFn) {
        try {
          return loadFn(key);
        } catch (_) {
          return null;
        }
      }
      try {
        if (typeof localStorage === "undefined") return null;
        return localStorage.getItem(key);
      } catch (_) {
        return null;
      }
    }
    function writeRaw(text) {
      if (saveFn) {
        try {
          saveFn(key, text);
          return;
        } catch (_) {
          return;
        }
      }
      try {
        if (typeof localStorage === "undefined") return;
        if (text == null) localStorage.removeItem(key);
        else localStorage.setItem(key, text);
      } catch (_) {
      }
    }
    return {
      load() {
        const raw = readRaw();
        if (!raw) return [];
        try {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          const list = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.items) ? parsed.items : [];
          return list.map(migrateRecord).filter(Boolean);
        } catch (_) {
          return [];
        }
      },
      save(next) {
        const items = Array.isArray(next) ? next : [];
        writeRaw(JSON.stringify({ v: SCHEMA_VERSION, items }));
      }
    };
  }
  function createNotificationStore(opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    const cap = Number.isFinite(o.cap) && o.cap > 0 ? o.cap : DEFAULT_CAP;
    const adapter = o.adapter || createMemoryAdapter();
    const listeners = /* @__PURE__ */ new Set();
    let items = [];
    try {
      items = (adapter.load() || []).map(migrateRecord).filter(Boolean);
      items = prune(items, cap);
    } catch (_) {
      items = [];
    }
    function prune(list2, max) {
      const now = Date.now();
      let next = list2.filter((r) => !r.dismissedAt);
      next = next.filter((r) => r.expiresAt == null || r.expiresAt > now);
      next.sort((a, b) => b.createdAt - a.createdAt);
      if (next.length > max) next = next.slice(0, max);
      return next;
    }
    function persist() {
      try {
        adapter.save(items);
      } catch (_) {
      }
    }
    function notify() {
      for (const fn of listeners) {
        try {
          fn(items.slice());
        } catch (_) {
        }
      }
    }
    function list() {
      return items.slice().sort((a, b) => b.createdAt - a.createdAt);
    }
    function get(id) {
      return items.find((r) => r.id === id) || null;
    }
    function unreadCount() {
      return items.filter((r) => !r.readAt).length;
    }
    function count() {
      return items.length;
    }
    function upsert(input) {
      const rec = normalizeRecord(input);
      if (!rec) return null;
      if (rec.dedupeKey) {
        const idx = items.findIndex((r) => r.dedupeKey === rec.dedupeKey && !r.dismissedAt);
        if (idx >= 0) {
          const prev = items[idx];
          const merged = {
            ...prev,
            ...rec,
            id: prev.id,
            createdAt: Number.isFinite(input.createdAt) ? rec.createdAt : Date.now(),
            readAt: null,
            dismissedAt: null,
            body: rec.body != null ? rec.body : prev.body,
            detail: rec.detail != null ? rec.detail : prev.detail
          };
          items[idx] = merged;
          items = prune(items, cap);
          persist();
          notify();
          return merged;
        }
      }
      items.push(rec);
      items = prune(items, cap);
      persist();
      notify();
      return rec;
    }
    function dismiss3(id) {
      const idx = items.findIndex((r) => r.id === id);
      if (idx < 0) return false;
      items.splice(idx, 1);
      persist();
      notify();
      return true;
    }
    function clear2() {
      if (items.length === 0) return;
      items = [];
      persist();
      notify();
    }
    function markRead(id) {
      const rec = get(id);
      if (!rec || rec.readAt) return false;
      rec.readAt = Date.now();
      persist();
      notify();
      return true;
    }
    function markAllRead() {
      const now = Date.now();
      let changed = false;
      for (const r of items) {
        if (!r.readAt) {
          r.readAt = now;
          changed = true;
        }
      }
      if (changed) {
        persist();
        notify();
      }
      return changed;
    }
    function subscribe(fn) {
      if (typeof fn !== "function") return () => {
      };
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    }
    return {
      list,
      get,
      upsert,
      dismiss: dismiss3,
      clear: clear2,
      markRead,
      markAllRead,
      count,
      unreadCount,
      subscribe,
      _pure: { items: () => items }
    };
  }

  // js/ui/notification-view.mjs
  var WEEK = 7 * 24 * 36e5;
  var KIND_META = {
    error: { accent: "var(--notif-kind-error)", label: "Error" },
    warn: { accent: "var(--notif-kind-warn)", label: "Warning" },
    info: { accent: "var(--notif-kind-info)", label: "Info" },
    success: { accent: "var(--notif-kind-success)", label: "Done" },
    system: { accent: "var(--notif-kind-system)", label: "System" }
  };
  function kindMeta(kind) {
    return KIND_META[kind] || KIND_META.system;
  }
  function clock(ts) {
    try {
      return new Intl.DateTimeFormat(void 0, { hour: "numeric", minute: "2-digit" }).format(new Date(ts));
    } catch (_) {
      return "";
    }
  }
  function weekday(ts) {
    try {
      return new Intl.DateTimeFormat(void 0, { weekday: "short" }).format(new Date(ts));
    } catch (_) {
      return "";
    }
  }
  function calendarDay(ts) {
    try {
      return new Intl.DateTimeFormat(void 0, { month: "short", day: "numeric" }).format(new Date(ts));
    } catch (_) {
      return "";
    }
  }
  function sameDay(a, b) {
    const x = new Date(a);
    const y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  }
  function formatStamp(ts, now) {
    if (!Number.isFinite(ts)) return "";
    const at = Number.isFinite(now) ? now : Date.now();
    if (sameDay(ts, at)) return clock(ts);
    if (at - ts >= 0 && at - ts < WEEK) return weekday(ts) + " " + clock(ts);
    return calendarDay(ts) + ", " + clock(ts);
  }
  function formatStampFull(ts) {
    if (!Number.isFinite(ts)) return "";
    try {
      return new Intl.DateTimeFormat(void 0, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date(ts));
    } catch (_) {
      return "";
    }
  }
  function labelTitle(text) {
    const t = text == null ? "" : String(text).trim();
    if (t.length < 2 || !t.endsWith(".") || t.endsWith("..")) return t;
    return t.slice(0, -1);
  }
  function splitText(rec) {
    const title = labelTitle(rec.title);
    const rawBody = rec.body != null ? String(rec.body).trim() : "";
    const rawDetail = rec.detail != null ? String(rec.detail).trim() : "";
    const body = rawBody && rawBody !== title ? rawBody : "";
    const detail = rawDetail && rawDetail !== title && rawDetail !== body ? rawDetail : "";
    if (!body && detail) return { body: detail, detail: "", promoted: true };
    return { body, detail, promoted: false };
  }
  function inlineSegments(text) {
    const src = text == null ? "" : String(text);
    if (src.indexOf("`") < 0) return src ? [{ code: false, text: src }] : [];
    const out = [];
    let rest = src;
    while (rest) {
      const open2 = rest.indexOf("`");
      if (open2 < 0) break;
      const close = rest.indexOf("`", open2 + 1);
      if (close < 0) break;
      if (open2 > 0) out.push({ code: false, text: rest.slice(0, open2) });
      const code = rest.slice(open2 + 1, close);
      if (code) out.push({ code: true, text: code });
      rest = rest.slice(close + 1);
    }
    if (rest) out.push({ code: false, text: rest });
    return out;
  }
  function itemView(rec, now) {
    if (!rec || typeof rec !== "object") return null;
    const kind = KIND_META[rec.kind] ? rec.kind : "system";
    const text = splitText(rec);
    return {
      id: rec.id,
      kind,
      meta: kindMeta(kind),
      title: labelTitle(rec.title),
      body: text.body,
      bodySegments: inlineSegments(text.body),
      detail: text.detail,
      promotedDetail: text.promoted,
      unread: !rec.readAt,
      remote: rec.origin === "remote",
      teaching: rec.category === "teaching",
      stamp: formatStamp(rec.createdAt, now),
      stampFull: formatStampFull(rec.createdAt),
      target: linkTarget(rec)
    };
  }
  function panelView(list, now) {
    const items = Array.isArray(list) ? list : [];
    return {
      total: items.length,
      unread: items.filter((r) => r && !r.readAt).length,
      empty: items.length === 0,
      items: items.map((r) => itemView(r, now)).filter(Boolean)
    };
  }

  // js/ui/notifications.mjs
  var global2 = globalThis;
  var bellBtn = null;
  var panelEl = null;
  var listEl = null;
  var emptyEl = null;
  var clearBtn = null;
  var countEl = null;
  var open = false;
  var unsub = null;
  var fade = null;
  var diagSeq = 0;
  var teardown = [];
  function track(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    teardown.push(() => target.removeEventListener(type, fn, opts));
  }
  function onBellClick(e) {
    e.stopPropagation();
    toggle();
  }
  function onClearClick(e) {
    e.stopPropagation();
    clear();
  }
  function onWindowResize() {
    if (open) positionPanel();
  }
  var store = createNotificationStore({
    adapter: typeof localStorage !== "undefined" ? createLocalPersistAdapter() : createMemoryAdapter()
  });
  function svgMarkup(paths, cls) {
    return "<svg" + (cls ? ' class="' + cls + '"' : "") + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
  }
  function bindTooltip(el, text) {
    if (!el || !text) return;
    el.setAttribute("data-tooltip", text);
    try {
      if (typeof Tooltips !== "undefined" && typeof Tooltips.bind === "function") Tooltips.bind(el);
    } catch (_) {
    }
  }
  function updateBellState() {
    if (!bellBtn) return;
    const total = store.count();
    const unread = store.unreadCount();
    if (total > 0) bellBtn.setAttribute("data-has-notifications", "");
    else bellBtn.removeAttribute("data-has-notifications");
    if (unread > 0) bellBtn.setAttribute("data-has-unread", "");
    else bellBtn.removeAttribute("data-has-unread");
    bellBtn.setAttribute(
      "aria-label",
      unread > 0 ? "Notifications, " + unread + " unread" : "Notifications"
    );
  }
  function kindClass2(kind) {
    return "notif-item--" + (KIND_META[kind] ? kind : "system");
  }
  function buildDiagToggle(pre) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "notif-item-more";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", pre.id);
    btn.innerHTML = svgMarkup('<path d="m9 6 6 6-6 6"/>', "notif-item-chevron") + "<span>Diagnostic</span>";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const show2 = pre.hidden;
      pre.hidden = !show2;
      btn.setAttribute("aria-expanded", show2 ? "true" : "false");
      btn.classList.toggle("is-open", show2);
      if (fade) fade.update();
    });
    return btn;
  }
  function buildFoot(view) {
    const foot = document.createElement("div");
    foot.className = "notif-item-foot";
    if (view.unread) {
      const dot = document.createElement("span");
      dot.className = "notif-item-dot";
      dot.setAttribute("role", "img");
      dot.setAttribute("aria-label", "Unread");
      foot.appendChild(dot);
    }
    const stamp = document.createElement("span");
    stamp.className = "notif-item-stamp";
    stamp.textContent = view.stamp;
    bindTooltip(stamp, view.stampFull);
    foot.appendChild(stamp);
    if (view.target) {
      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "notif-item-link";
      jump.textContent = view.target.label;
      jump.setAttribute("aria-label", "Open " + view.target.label);
      jump.addEventListener("click", (e) => {
        e.stopPropagation();
        openTarget(view.id, view.target);
      });
      foot.appendChild(jump);
    }
    if (view.teaching || view.remote) {
      const tag = document.createElement("span");
      tag.className = "notif-item-tag";
      tag.textContent = view.teaching ? "teaching" : "remote";
      foot.appendChild(tag);
    }
    return foot;
  }
  function buildItem(view) {
    const li = document.createElement("li");
    li.className = "notif-item " + kindClass2(view.kind);
    if (view.unread) li.classList.add("is-unread");
    li.dataset.notifId = view.id;
    li.dataset.notifKind = view.kind;
    const title = document.createElement("p");
    title.className = "notif-item-title";
    const kindWord = document.createElement("span");
    kindWord.className = "notif-item-kind";
    kindWord.textContent = view.meta.label + ": ";
    title.appendChild(kindWord);
    title.appendChild(document.createTextNode(view.title));
    li.appendChild(title);
    if (view.body) {
      const body = document.createElement("p");
      body.className = "notif-item-body";
      if (view.promotedDetail) body.classList.add("is-diagnostic");
      for (const seg of view.bodySegments) {
        if (!seg.code) {
          body.appendChild(document.createTextNode(seg.text));
          continue;
        }
        const code = document.createElement("code");
        code.className = "notif-item-code";
        code.textContent = seg.text;
        body.appendChild(code);
      }
      li.appendChild(body);
    }
    let toggleBtn = null;
    let pre = null;
    if (view.detail) {
      diagSeq += 1;
      pre = document.createElement("pre");
      pre.className = "notif-item-diag";
      pre.id = "notif-diag-" + diagSeq;
      pre.textContent = view.detail;
      pre.hidden = true;
      toggleBtn = buildDiagToggle(pre);
    }
    const foot = buildFoot(view);
    if (toggleBtn) foot.appendChild(toggleBtn);
    li.appendChild(foot);
    if (pre) li.appendChild(pre);
    const dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.className = "icon-btn notif-item-dismiss";
    dismissBtn.setAttribute("aria-label", "Dismiss notification");
    dismissBtn.innerHTML = svgMarkup('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
    dismissBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dismiss2(view.id);
    });
    li.appendChild(dismissBtn);
    return li;
  }
  function renderList() {
    if (!listEl || !emptyEl) return;
    const records = store.list();
    const view = panelView(records, Date.now());
    listEl.textContent = "";
    for (const item of view.items) listEl.appendChild(buildItem(item));
    emptyEl.hidden = !view.empty;
    listEl.hidden = view.empty;
    if (clearBtn) clearBtn.hidden = view.empty;
    if (countEl) {
      countEl.textContent = view.total ? String(view.total) : "";
      countEl.hidden = !view.total;
    }
    if (fade) fade.update();
    updateBellState();
  }
  function openTarget(id, target) {
    if (!target) return;
    store.markRead(id);
    try {
      window.dispatchEvent(new CustomEvent("beljar:open-file-at", {
        detail: {
          fileId: target.fileId,
          from: target.from,
          to: target.to,
          line: target.line,
          source: "notification"
        }
      }));
    } catch (_) {
    }
    setOpen(false);
  }
  function emit(partial) {
    const rec = store.upsert(partial);
    return rec ? rec.id : null;
  }
  function push(message, opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    if (typeof message === "object" && message !== null) {
      return emit(message);
    }
    return emit({
      id: o.id,
      title: String(message || ""),
      kind: o.kind || "info",
      category: o.category || "ops",
      source: o.source || "legacy",
      createdAt: o.time != null ? o.time : Date.now(),
      body: o.body || null,
      detail: o.detail || null,
      dedupeKey: o.dedupeKey || null,
      links: o.links || null,
      origin: o.origin || "local"
    });
  }
  function teaching(partial) {
    const o = partial && typeof partial === "object" ? partial : { title: String(partial || "") };
    return emit({
      kind: o.kind || "error",
      category: "teaching",
      origin: "local",
      source: o.source || "prover",
      title: o.title,
      body: o.body || null,
      detail: o.detail || null,
      dedupeKey: o.dedupeKey || null,
      links: o.links || null
    });
  }
  function fromToast(message, opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    const kind = o.kind || "error";
    return emit({
      kind: kind === "default" ? "info" : kind,
      category: o.category || "ops",
      title: String(message || ""),
      body: o.body || null,
      detail: o.detail || null,
      source: o.source || "toast",
      dedupeKey: o.dedupeKey || null,
      links: o.links || null,
      origin: "local"
    });
  }
  function dismiss2(id) {
    store.dismiss(id);
  }
  function clear() {
    store.clear();
  }
  function positionPanel() {
    if (!bellBtn || !panelEl) return;
    const anchor = bellBtn.closest(".header-end") || bellBtn;
    const r = anchor.getBoundingClientRect();
    const right = Math.max(0, window.innerWidth - r.right);
    panelEl.style.setProperty("--notif-panel-right", right + "px");
  }
  function setOpen(next) {
    if (!panelEl || !bellBtn) return;
    open = !!next;
    if (open) {
      positionPanel();
      renderList();
      store.markAllRead();
    }
    panelEl.classList.toggle("is-open", open);
    panelEl.setAttribute("aria-hidden", open ? "false" : "true");
    bellBtn.setAttribute("aria-expanded", open ? "true" : "false");
    bellBtn.classList.toggle("is-active", open);
    if (open && typeof Tooltips !== "undefined") {
      Tooltips.hide();
      Tooltips.suppressAnchor(bellBtn);
    }
  }
  function toggle() {
    setOpen(!open);
  }
  function onDocPointerDown(e) {
    if (!open) return;
    const t = e.target;
    if (panelEl && panelEl.contains(t)) return;
    if (bellBtn && bellBtn.contains(t)) return;
    setOpen(false);
  }
  function onDocKeyDown(e) {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      bellBtn.focus();
    }
  }
  function init2() {
    dispose2();
    bellBtn = document.getElementById("btn-notifications");
    panelEl = document.getElementById("notif-panel");
    listEl = document.getElementById("notif-panel-list");
    emptyEl = document.getElementById("notif-panel-empty");
    clearBtn = document.getElementById("btn-notif-clear");
    countEl = document.getElementById("notif-panel-count");
    if (!bellBtn || !panelEl) return;
    unsub = store.subscribe(() => renderList());
    track(bellBtn, "click", onBellClick);
    if (clearBtn) track(clearBtn, "click", onClearClick);
    track(document, "pointerdown", onDocPointerDown, true);
    track(document, "keydown", onDocKeyDown, true);
    track(window, "resize", onWindowResize);
    if (listEl && global2.ScrollFade && typeof global2.ScrollFade.attach === "function") {
      fade = global2.ScrollFade.attach(listEl, { axis: "y", size: 14 });
    }
    positionPanel();
    renderList();
  }
  function dispose2() {
    if (unsub) {
      unsub();
      unsub = null;
    }
    while (teardown.length) {
      const off = teardown.pop();
      try {
        off();
      } catch (_) {
      }
    }
    if (fade) {
      try {
        fade.destroy();
      } catch (_) {
      }
      fade = null;
    }
    setOpen(false);
    bellBtn = null;
    panelEl = null;
    listEl = null;
    emptyEl = null;
    clearBtn = null;
    countEl = null;
  }
  global2.Notifications = {
    init: init2,
    dispose: dispose2,
    emit,
    push,
    teaching,
    fromToast,
    dismiss: dismiss2,
    clear,
    markRead: (id) => store.markRead(id),
    markAllRead: () => store.markAllRead(),
    toggle,
    isOpen: () => open,
    count: () => store.count(),
    unreadCount: () => store.unreadCount(),
    list: () => store.list(),
    store,
    _pure: {
      normalizeRecord,
      linkTarget,
      itemView,
      panelView,
      kindMeta,
      labelTitle,
      inlineSegments,
      formatStamp,
      formatStampFull,
      SCHEMA_VERSION
    }
  };
  global2.BelJarNotifications = global2.Notifications;

  // js/frame/frame.mjs
  var global3 = globalThis;
  var teardown2 = [];
  var mounted = false;
  function track2(target, type, fn, opts) {
    if (!target) return;
    target.addEventListener(type, fn, opts);
    teardown2.push(() => target.removeEventListener(type, fn, opts));
  }
  function toggleTheme() {
    const root = document.documentElement;
    root.classList.toggle("light");
    const isLight = root.classList.contains("light");
    if (global3.Persist && typeof global3.Persist.writeStoredTheme === "function") {
      global3.Persist.writeStoredTheme(isLight ? "light" : "dark");
    }
    global3.dispatchEvent(new CustomEvent("beljar:settings-changed", {
      detail: { key: "theme" }
    }));
    return isLight ? "light" : "dark";
  }
  function onReload() {
    global3.location.reload();
  }
  function onSettings() {
    if (global3.SettingsUI && typeof global3.SettingsUI.open === "function") {
      global3.SettingsUI.open();
    }
  }
  function mount() {
    if (mounted) return;
    mounted = true;
    if (global3.Toasts && typeof global3.Toasts.init === "function") global3.Toasts.init();
    if (global3.Notifications && typeof global3.Notifications.init === "function") {
      global3.Notifications.init();
    }
    track2(document.getElementById("btn-theme"), "click", toggleTheme);
    track2(document.getElementById("btn-reload"), "click", onReload);
    track2(document.getElementById("btn-settings"), "click", onSettings);
  }
  function unmount() {
    if (!mounted) return;
    mounted = false;
    while (teardown2.length) {
      const off = teardown2.pop();
      try {
        off();
      } catch (_) {
      }
    }
    for (const peer of [global3.Notifications, global3.Toasts]) {
      if (peer && typeof peer.dispose === "function") {
        try {
          peer.dispose();
        } catch (_) {
        }
      }
    }
  }
  var Frame = {
    mount,
    unmount,
    toggleTheme,
    isMounted: () => mounted,
    pendingTeardown: () => teardown2.length
  };
  global3.Frame = Frame;
  global3.BelJarFrame = global3.Frame;
})();
