(() => {
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
      detail: o.detail != null ? String(o.detail) : null,
      source: o.source != null ? String(o.source) : null,
      dedupeKey: o.dedupeKey != null ? String(o.dedupeKey) : null,
      category: o.category != null ? String(o.category) : null
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
        detail: parsed.detail,
        source: parsed.source,
        dedupeKey: parsed.dedupeKey,
        category: parsed.category
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
      document.body.appendChild(stackEl);
    }
    if (!stackEl.hasAttribute("popover")) stackEl.setAttribute("popover", "manual");
  }
  global.Toasts = {
    init,
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
})();
