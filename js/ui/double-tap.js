(() => {
  // js/ui/double-tap.mjs
  var global = globalThis;
  var TRIGGERS = {
    off: null,
    shift: { key: "Shift", flag: "shiftKey" },
    control: { key: "Control", flag: "ctrlKey" },
    alt: { key: "Alt", flag: "altKey" }
  };
  var SPEEDS = { fast: 250, normal: 350, relaxed: 500 };
  var lastUpAt = 0;
  var sawOtherKey = false;
  var listening = false;
  function persist() {
    return global.Persist || null;
  }
  function settings() {
    const p = persist();
    const read = (name, fallback) => {
      try {
        return p && typeof p[name] === "function" ? p[name]() : fallback;
      } catch (_) {
        return fallback;
      }
    };
    return {
      trigger: read("readStoredDoubleTapTrigger", "off"),
      target: read("readStoredDoubleTapCommand", "tools.palette"),
      windowMs: SPEEDS[read("readStoredDoubleTapSpeed", "normal")] || SPEEDS.normal
    };
  }
  function shouldFire(state) {
    const s = state || {};
    if (!s.trigger || s.trigger === "off") return false;
    if (s.repeat) return false;
    if (s.otherKeySeen) return false;
    if (s.otherModifier) return false;
    if (!(s.gap > 0)) return false;
    return s.gap <= s.windowMs;
  }
  function blockReason(state) {
    const s = state || {};
    if (s.composing) return "composing";
    if (s.recordingChord) return "chord-recorder";
    if (s.modalOpen) return "modal";
    if (s.commandLineOpen) return "command-line";
    return "";
  }
  function blocked(e) {
    const doc = typeof document !== "undefined" ? document : null;
    const t = e && e.target || (doc ? doc.activeElement : null);
    const B = global.StatusStrip;
    return !!blockReason({
      composing: !!(e && (e.isComposing || e.keyCode === 229)),
      recordingChord: !!(t && t.classList && t.classList.contains("bj-kb__chord") && t.classList.contains("is-recording")),
      // A modal owns the screen; opening the palette behind or over it is wrong.
      // This also covers the settings search field, which lives inside one.
      modalOpen: !!(doc && doc.querySelector("dialog[open]")),
      commandLineOpen: !!(B && typeof B.isCommandLineOpen === "function" && B.isCommandLineOpen())
    });
  }
  function otherModifierHeld(e, flag) {
    const held = [];
    if (e.shiftKey) held.push("shiftKey");
    if (e.ctrlKey) held.push("ctrlKey");
    if (e.altKey) held.push("altKey");
    if (e.metaKey) held.push("metaKey");
    return held.some((f) => f !== flag);
  }
  function onKeyDown(e) {
    const cfg = settings();
    const trigger = TRIGGERS[cfg.trigger];
    if (!trigger || e.key !== trigger.key) {
      sawOtherKey = true;
      return;
    }
    if (e.repeat) sawOtherKey = true;
  }
  function onKeyUp(e) {
    const cfg = settings();
    const trigger = TRIGGERS[cfg.trigger];
    if (!trigger || e.key !== trigger.key) return;
    const now = Date.now();
    const fire = shouldFire({
      trigger: cfg.trigger,
      repeat: !!e.repeat,
      otherKeySeen: sawOtherKey,
      otherModifier: otherModifierHeld(e, trigger.flag),
      gap: lastUpAt ? now - lastUpAt : 0,
      windowMs: cfg.windowMs
    });
    if (fire && !blocked(e)) {
      lastUpAt = 0;
      sawOtherKey = false;
      run(cfg.target);
      return;
    }
    lastUpAt = now;
    sawOtherKey = false;
  }
  var PALETTE_OPENERS = /* @__PURE__ */ new Set([
    "tools.palette",
    "tools.commands",
    "nav.anywhere",
    "nav.symbol",
    "edit.search-project"
  ]);
  function resolveAction(id, paletteOpen) {
    if (!paletteOpen) return { close: false, run: id };
    if (PALETTE_OPENERS.has(id)) return { close: true, run: null };
    return { close: true, run: id };
  }
  function run(id) {
    const C = global.Commands;
    const P = global.CommandPalette;
    const paletteOpen = !!(P && typeof P.isOpen === "function" && P.isOpen());
    const action = resolveAction(id, paletteOpen);
    if (action.close && P && typeof P.close === "function") P.close();
    if (action.run && C && typeof C.run === "function") C.run(action.run);
  }
  function init() {
    if (listening || typeof global.addEventListener !== "function") return false;
    listening = true;
    global.addEventListener("keydown", onKeyDown, true);
    global.addEventListener("keyup", onKeyUp, true);
    return true;
  }
  var GESTURE_TARGETS = [
    "tools.palette",
    "tools.commands",
    "nav.anywhere",
    "nav.symbol",
    "edit.search-project",
    "cmdline.open",
    "run.default",
    "view.harpoon",
    "keys.macros"
  ];
  var _pure = {
    TRIGGERS,
    SPEEDS,
    shouldFire,
    blockReason,
    resolveAction,
    PALETTE_OPENERS,
    GESTURE_TARGETS
  };
  global.DoubleTap = {
    init,
    shouldFire,
    targets: () => GESTURE_TARGETS.slice(),
    _pure: {
      TRIGGERS,
      SPEEDS,
      shouldFire,
      blockReason,
      resolveAction,
      PALETTE_OPENERS,
      GESTURE_TARGETS
    }
  };
  if (typeof document !== "undefined") init();
})();
