(() => {
  // js/persist/table.mjs
  function clone(v) {
    return v !== null && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v;
  }

  // js/persist/settings-schema.mjs
  function cleanKeybindings(map) {
    if (!map || typeof map !== "object" || Array.isArray(map)) return void 0;
    const out = {};
    for (const [id, v] of Object.entries(map)) {
      if (v === "" || v === null) out[id] = "";
      else if (typeof v === "string") out[id] = v;
    }
    return out;
  }
  function cleanAliasPairs(v) {
    if (v === null) return null;
    return Array.isArray(v) ? v : void 0;
  }
  var ON = true;
  var OFF = false;
  var SETTINGS = [
    // ── Appearance ──────────────────────────────────────────────────────────
    { id: "theme", section: "appearance", default: "dark", values: ["dark", "light"], boot: true },
    { id: "uiFontSize", section: "appearance", default: "md", values: ["sm", "md", "lg", "xl"], boot: true },
    { id: "uiTextContrast", section: "appearance", default: "medium", values: ["low", "medium", "high", "maximum"], boot: true },
    { id: "motionPref", section: "appearance", default: "system", values: ["system", "reduce", "full"], boot: true },
    { id: "toastDuration", section: "appearance", default: "normal", values: ["short", "normal", "long"] },
    // ── Editor: typography ──────────────────────────────────────────────────
    { id: "editorFontSize", section: "editor", default: "md", values: ["sm", "md", "lg", "xl"] },
    { id: "editorLineHeight", section: "editor", default: "normal", values: ["compact", "normal", "relaxed"] },
    { id: "editorWordWrap", section: "editor", default: OFF },
    { id: "editorFontFamily", section: "editor", default: "jetbrains", values: ["jetbrains", "system"], boot: true },
    { id: "editorCursorBlink", section: "editor", default: "blink", values: ["off", "blink", "fast"] },
    { id: "editorScrollPastEnd", section: "editor", default: ON },
    { id: "editorWhitespace", section: "editor", default: "none", values: ["none", "trailing", "selection", "all"] },
    { id: "editorRulers", section: "editor", default: OFF },
    // ── Editor: indentation and saving ──────────────────────────────────────
    { id: "editorTabSize", section: "editor", default: 2, values: [2, 4] },
    { id: "autosaveDelay", section: "editor", default: 320, values: [320, 1e3, 2e3] },
    { id: "editorFormatWidth", section: "editor", default: 80, values: [80, 100, 120] },
    { id: "editorReindentPaste", section: "editor", default: ON },
    { id: "cfgAutoSync", section: "editor", default: ON },
    { id: "formatOnSave", section: "editor", default: OFF },
    { id: "trimTrailingWs", section: "editor", default: OFF },
    // ── Editor: code insight ────────────────────────────────────────────────
    { id: "editorSyntaxHighlight", section: "editor", default: ON },
    { id: "editorSemanticHighlight", section: "editor", default: ON },
    { id: "editorParseHighlight", section: "editor", default: ON },
    { id: "editorOccurrenceHighlight", section: "editor", default: ON },
    { id: "editorBracketMatch", section: "editor", default: ON },
    { id: "editorAutoCloseBrackets", section: "editor", default: ON },
    { id: "editorSelectionMatches", section: "editor", default: ON },
    { id: "hoverScope", section: "editor", default: "all", values: ["all", "user-only", "none"] },
    { id: "hoverSticky", section: "editor", default: OFF },
    { id: "editorAutocompleteTrigger", section: "editor", default: "typing", values: ["typing", "none", "always"] },
    { id: "editorAutocompleteContinue", section: "editor", default: OFF },
    { id: "quietWhileTyping", section: "editor", default: OFF },
    // ── Editor: gutters and diagnostics ─────────────────────────────────────
    { id: "editorLineNumbers", section: "editor", default: ON },
    { id: "editorLineNumberMode", section: "editor", default: "absolute", values: ["absolute", "relative", "hybrid"] },
    { id: "editorFoldGutter", section: "editor", default: ON },
    { id: "editorFoldPersist", section: "editor", default: "session", values: ["session", "none", "local"], sync: false },
    { id: "editorActiveLine", section: "editor", default: ON },
    { id: "diagPresentation", section: "editor", default: "both", values: ["both", "underlines", "gutter", "none"] },
    { id: "diagSeverity", section: "editor", default: "all", values: ["all", "errors"] },
    { id: "editorHoleGutter", section: "editor", default: ON },
    { id: "editorHoleEmphasis", section: "editor", default: "normal", values: ["subtle", "normal", "loud"], boot: true },
    { id: "stickyDeclHeader", section: "editor", default: OFF },
    // ── Keybindings and the keyboard ────────────────────────────────────────
    { id: "keybindings", section: "keybindings", default: {}, type: "json", normalize: cleanKeybindings },
    { id: "keymapStyle", section: "keybindings", default: "default", values: ["default", "vim", "emacs"] },
    // null: the status strip picks its own default for the keymap style.
    { id: "statusStrip", section: "keybindings", default: null, values: [null, "off", "compact", "standard", "detailed"] },
    { id: "vimLeader", section: "keybindings", default: "\\", values: ["\\", ",", " "] },
    { id: "vimInsertEscape", section: "keybindings", default: "", values: ["", "jk", "jj", "kj"] },
    { id: "emacsYankSource", section: "keybindings", default: "system", values: ["system", "kill-ring"] },
    { id: "doubleTapTrigger", section: "keybindings", default: "off", values: ["off", "shift", "control", "alt"] },
    { id: "doubleTapCommand", section: "keybindings", default: "tools.palette", type: "string" },
    { id: "doubleTapSpeed", section: "keybindings", default: "normal", values: ["normal", "fast", "relaxed"] },
    // ── Beluga ──────────────────────────────────────────────────────────────
    // Which build this device downloads: a phone and a workstation differ.
    { id: "belugaMode", section: "beluga", default: "stable", values: ["stable", "fast"], sync: false },
    { id: "belugaFallbackStable", section: "beluga", default: ON },
    { id: "belugaCancelOnEdit", section: "beluga", default: ON },
    { id: "checkAggressiveness", section: "beluga", default: "balanced", values: ["responsive", "balanced", "thorough"] },
    { id: "suiteCheck", section: "beluga", default: "suite", values: ["suite", "active"] },
    // ── Harpoon ─────────────────────────────────────────────────────────────
    { id: "harpoonMode", section: "harpoon", default: "manual", values: ["manual", "orca"] },
    { id: "harpoonVerifyMoves", section: "harpoon", default: ON },
    { id: "autosolveFocusNext", section: "harpoon", default: ON },
    { id: "autosolveShowStats", section: "harpoon", default: ON },
    // ── REPL ────────────────────────────────────────────────────────────────
    { id: "replAutoscroll", section: "repl", default: ON },
    { id: "replWelcome", section: "repl", default: ON },
    { id: "replEcho", section: "repl", default: ON },
    { id: "replFilterChatter", section: "repl", default: ON },
    { id: "replHoverTimestamp", section: "repl", default: OFF },
    { id: "replAutocompleteTrigger", section: "repl", default: "typing", values: ["typing", "none", "always"] },
    { id: "replAutocompleteContinue", section: "repl", default: OFF },
    { id: "replHistoryCap", section: "repl", default: 1e3, values: [100, 250, 500, 1e3] },
    // Where this browser keeps history: a shared computer is not your laptop.
    { id: "replHistoryPersist", section: "repl", default: "local", values: ["local", "session", "none"], sync: false },
    // ── Workspace ───────────────────────────────────────────────────────────
    { id: "inspectorFollow", section: "workspace", default: ON },
    { id: "restorePanels", section: "workspace", default: ON },
    { id: "libraryExpandDefault", section: "workspace", default: OFF },
    // Signed in, settings follow you between devices; off here, this device keeps its own.
    { id: "syncSettings", section: "workspace", default: ON, sync: false },
    // ── Aliases ─────────────────────────────────────────────────────────────
    { id: "aliasActivation", section: "aliases", default: "greedy", values: ["greedy", "strict"] },
    // null: the built-in alias table.
    { id: "aliasPairs", section: "aliases", default: null, type: "json", normalize: cleanAliasPairs }
  ];
  var BY_ID = new Map(SETTINGS.map((row) => [row.id, row]));
  function settingRow(id) {
    return BY_ID.get(id) || null;
  }
  function defaultOf(id) {
    const row = settingRow(id);
    if (!row) throw new Error(`settings: no setting "${id}"`);
    return clone(row.default);
  }
  function readSetting(id) {
    const S = globalThis.Settings;
    return S ? S.get(id) : defaultOf(id);
  }

  // js/persist/settings-apply.mjs
  var TOAST_DURATION_MS = { short: 2e3, normal: 3500, long: 5e3 };

  // js/ui/toasts.mjs
  var global = globalThis;
  var DEFAULT_DURATION_MS = TOAST_DURATION_MS.normal;
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
    return TOAST_DURATION_MS[mode] || DEFAULT_DURATION_MS;
  }
  function normalizeDuration(opts) {
    var fallback = durationForMode(readSetting("toastDuration"));
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
})();
