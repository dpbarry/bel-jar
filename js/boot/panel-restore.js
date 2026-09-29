(() => {
  // js/persist/store.mjs
  var SCHEMA = 4;

  // js/persist/table.mjs
  function typeOf(row) {
    if (row.values) return "enum";
    if (row.type) return row.type;
    if (typeof row.default === "boolean") return "bool";
    if (typeof row.default === "number") return "number";
    return "string";
  }
  function clone(v) {
    return v !== null && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v;
  }
  function normalizeValue(row, raw) {
    switch (typeOf(row)) {
      case "enum": {
        if (row.values.includes(raw)) return raw;
        if (typeof raw === "string" && raw.trim() !== "" && row.values.some((v) => typeof v === "number")) {
          const n = Number(raw);
          if (row.values.includes(n)) return n;
        }
        return void 0;
      }
      case "bool":
        return typeof raw === "boolean" ? raw : void 0;
      case "string":
        return typeof raw === "string" && raw !== "" ? raw : void 0;
      case "number": {
        let n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
        if (!Number.isFinite(n)) return void 0;
        if (row.min != null && n < row.min) n = row.min;
        if (row.max != null && n > row.max) n = row.max;
        return row.integer ? Math.round(n) : n;
      }
      case "json":
        return row.normalize ? row.normalize(raw) : raw;
      default:
        return void 0;
    }
  }
  function resolveRows(rows, stored) {
    const src = stored && typeof stored === "object" ? stored : {};
    const out = {};
    for (const row of rows) {
      const n = Object.prototype.hasOwnProperty.call(src, row.id) ? normalizeValue(row, src[row.id]) : void 0;
      out[row.id] = clone(n === void 0 ? row.default : n);
    }
    return out;
  }
  function readBootRows(storage, schema, key, rows) {
    try {
      if (storage.getItem("beljar/schema") !== String(schema)) return resolveRows(rows, {});
      const env = JSON.parse(storage.getItem(key) || "null");
      return resolveRows(rows, env && env.data && env.data.values);
    } catch (_) {
      return resolveRows(rows, {});
    }
  }

  // js/persist/settings-schema.mjs
  var SETTINGS_KEY = "beljar/settings";
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
    // ── Account: how sync behaves (docs/PERSIST.md §5.7) ─────────────────────
    // Signed in, settings follow you between devices; off here, this device keeps its own.
    { id: "syncSettings", section: "account", default: ON, sync: false },
    // A file changed on this device and in the cloud since they last synced:
    // 'merge' what merges, or 'ask' about every such file (nothing merges by
    // itself: sync/merge-project.mjs `askAll`).
    { id: "syncBothChanged", section: "account", default: "merge", values: ["merge", "ask"] },
    // Merging, the lines changed on both sides: 'ask' (the review window), or
    // settle them to 'mine' or the 'cloud' as they appear (js/account/sync-ui.mjs).
    { id: "syncOverlap", section: "account", default: "ask", values: ["ask", "mine", "cloud"] },
    // Edits made while offline, once back online: 'upload' on their own, or 'ask'
    // first (held until the person uploads them or takes the cloud's instead).
    { id: "syncReconnect", section: "account", default: "upload", values: ["upload", "ask"] },
    // "Offline" in the strip, and "Back online" when it returns. The cloud beside
    // the project name says it either way.
    { id: "syncNotices", section: "account", default: ON },
    // Signing out on this browser: 'remove' the account's projects (safe on a
    // shared computer), or 'keep' them here to work on signed out; they sync
    // again when the same account signs in (work.mjs `keptAccounts`).
    { id: "signOutKeep", section: "account", default: "remove", values: ["remove", "keep"], sync: false },
    // ── Aliases ─────────────────────────────────────────────────────────────
    { id: "aliasActivation", section: "aliases", default: "greedy", values: ["greedy", "strict"] },
    // null: the built-in alias table.
    { id: "aliasPairs", section: "aliases", default: null, type: "json", normalize: cleanAliasPairs }
  ];
  var BY_ID = new Map(SETTINGS.map((row) => [row.id, row]));
  function readBootSettings(storage, schema) {
    return readBootRows(storage, schema, SETTINGS_KEY, SETTINGS);
  }

  // js/persist/device-schema.mjs
  var DEVICE_KEY = "beljar/device";
  function stringList(cap) {
    return (raw) => {
      if (!Array.isArray(raw)) return void 0;
      const out = [];
      for (const x of raw) {
        if (typeof x === "string" && x && out.indexOf(x) === -1) out.push(x);
      }
      return cap ? out.slice(0, cap) : out;
    };
  }
  function runModel(raw) {
    if (!raw || typeof raw !== "object") return void 0;
    const { baseMs, msPerLine, sampleCount } = raw;
    if (!(typeof msPerLine === "number" && msPerLine > 0) || !(typeof baseMs === "number" && baseMs >= 0)) return void 0;
    return {
      baseMs,
      msPerLine,
      sampleCount: typeof sampleCount === "number" && sampleCount >= 1 ? Math.floor(sampleCount) : 1
    };
  }
  function accountIds(raw) {
    if (!Array.isArray(raw)) return void 0;
    return [...new Set(raw.filter((id) => typeof id === "string" && id !== ""))];
  }
  var PANEL_W = { group: "layout", default: 250, min: 160, max: 512, integer: true, boot: true };
  var PANEL_H = { group: "layout", default: 190, min: 96, max: 384, integer: true, boot: true };
  var DEVICE = [
    // which project the next load opens (a page stays on the one it opened: work.mjs)
    { id: "activeProject", type: "string", default: "" },
    // the account this browser is signed in as ('' signed out): whose projects it
    // shows, and who owns a new one (work.mjs). An opaque id, never a credential.
    { id: "account", type: "string", default: "" },
    // signed out with "Keep in this browser": the accounts whose projects stay
    // here, usable signed out and never adopted by another account (work.mjs
    // `isVisible`). Each leaves the list when it signs in again.
    { id: "keptAccounts", type: "json", default: [], normalize: accountIds },
    // "Back online: Ask me first": the account whose offline edits wait
    // for the person ('' none). Outlives a reload (sync/hold.mjs).
    { id: "syncHeldFor", type: "string", default: "" },
    // durability.mjs: when this browser was last asked to keep BelJar's storage,
    // and when this device was told Safari may delete it (ms; 0: never)
    { id: "persistAskedAt", type: "number", default: 0 },
    { id: "durabilityWarnedAt", type: "number", default: 0 },
    // layout
    { id: "editorSplit", group: "layout", default: 0.5, min: 0.18, max: 0.82, boot: true },
    { id: "explorerWidth", ...PANEL_W, cssVar: "--explorer-w" },
    { id: "explorerHeight", ...PANEL_H, max: 320, cssVar: "--explorer-h" },
    { id: "inspectorWidth", ...PANEL_W, cssVar: "--inspector-w" },
    { id: "inspectorHeight", ...PANEL_H, cssVar: "--inspector-h" },
    { id: "libraryWidth", ...PANEL_W, cssVar: "--library-w" },
    { id: "libraryHeight", ...PANEL_H, cssVar: "--library-h" },
    { id: "harpoonWidth", ...PANEL_W, cssVar: "--harpoon-w" },
    { id: "harpoonHeight", ...PANEL_H, cssVar: "--harpoon-h" },
    { id: "harpoonDetailsCollapsed", default: false },
    // the dependency graph panel
    { id: "graphLayout", default: "force", values: ["force", "flat"] },
    { id: "graphImpl", default: "show", values: ["show", "hide"] },
    { id: "graphDepth", default: 1, values: [1, 2, 3] },
    { id: "graphLabelDensity", default: 3, values: [1, 2, 3, 4, 5] },
    { id: "graphSidebarCollapsed", default: false },
    // what this device has learned or been told
    { id: "dismissedHints", type: "json", default: [], normalize: stringList() },
    { id: "commandLineHistory", type: "json", default: [], normalize: stringList(50) },
    { id: "runModel", type: "json", default: null, normalize: runModel },
    { id: "jumpLog", default: false }
  ];
  var BY_ID2 = new Map(DEVICE.map((row) => [row.id, row]));
  function readBootDevice(storage, schema) {
    return readBootRows(storage, schema, DEVICE_KEY, DEVICE);
  }

  // js/persist/keys.mjs
  function projectPrefix(pid) {
    return "beljar/p/" + pid + "/";
  }
  function sessionKey(pid) {
    return projectPrefix(pid) + "session";
  }
  function readBootSession(storage, schema) {
    try {
      var pid = readBootDevice(storage, schema).activeProject;
      if (!pid) return null;
      var env = JSON.parse(storage.getItem(sessionKey(pid)) || "null");
      return env && env.data && typeof env.data === "object" ? env.data : null;
    } catch (_) {
      return null;
    }
  }

  // js/boot/panel-restore-core.mjs
  var PANEL_CONFIG = {
    harpoon: {
      workspaceClass: "is-harpoon-open",
      panelId: "harpoon-panel",
      buttonId: "btn-harpoon"
    },
    library: {
      workspaceClass: "is-library-open",
      panelId: "library-panel",
      buttonId: "btn-library"
    },
    inspector: {
      workspaceClass: "is-inspector-open",
      panelId: "inspector-panel",
      buttonId: "btn-inspector"
    },
    explorer: {
      workspaceClass: "is-explorer-open",
      panelId: "explorer-panel",
      buttonId: "btn-files"
    }
  };
  function resolveActivePanel(storage) {
    if (!readBootSettings(storage, SCHEMA).restorePanels) return null;
    const session = readBootSession(storage, SCHEMA);
    const panel = session && session.panel;
    return typeof panel === "string" && PANEL_CONFIG[panel] ? panel : null;
  }
  function applyActivePanel(document2, activePanel) {
    const cfg = PANEL_CONFIG[activePanel];
    if (!cfg) return false;
    const workspace = document2.querySelector(".workspace");
    if (!workspace) return false;
    workspace.classList.add(cfg.workspaceClass);
    const panel = document2.getElementById(cfg.panelId);
    if (panel) panel.setAttribute("aria-hidden", "false");
    const button = document2.getElementById(cfg.buttonId);
    if (button) {
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
    }
    return true;
  }
  function restorePanelState(document2, storage) {
    const activePanel = resolveActivePanel(storage);
    if (!activePanel) return false;
    return applyActivePanel(document2, activePanel);
  }

  // js/boot/panel-restore.mjs
  try {
    restorePanelState(document, localStorage);
  } catch (_) {
  }
})();
