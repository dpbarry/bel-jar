(() => {
  // js/persist/store.mjs
  var SCHEMA = 5;
  var SCHEMA_KEY = "beljar/schema";
  function migrateStorage(storage, schema, migrations) {
    const raw = storage.getItem(SCHEMA_KEY);
    if (raw === String(schema)) return { result: "current", from: schema };
    if (raw == null) return { result: "fresh", from: null };
    const n = Number(raw);
    const from = raw !== "" && Number.isInteger(n) ? n : null;
    if (from == null) return { result: "unreadable", from: null };
    if (from > schema) return { result: "newer", from };
    const steps = migrations || {};
    for (let v = from; v < schema; v++) if (typeof steps[v] !== "function") return { result: "missing", from, at: v };
    for (let v = from; v < schema; v++) {
      try {
        steps[v](storage);
      } catch (err) {
        return { result: "threw", from, at: v, error: String(err && err.message || err) };
      }
    }
    storage.setItem(SCHEMA_KEY, String(schema));
    return { result: "migrated", from };
  }

  // js/persist/migrations.mjs
  var MIGRATIONS = {
    // The REPL was one transcript for the whole browser. It belongs to the
    // project that was open; every other project starts with none.
    4: function moveReplOntoItsProject(storage) {
      const transcriptRaw = storage.getItem("beljar/repl/transcript");
      const commandsRaw = storage.getItem("beljar/repl/commands");
      if (transcriptRaw == null && commandsRaw == null) return;
      let transcript = null;
      let commands = null;
      let device = null;
      try {
        transcript = JSON.parse(transcriptRaw || "null");
        commands = JSON.parse(commandsRaw || "null");
        device = JSON.parse(storage.getItem("beljar/device") || "null");
      } catch (_) {
        return;
      }
      const values = device && device.data && device.data.values;
      const pid = values && typeof values.activeProject === "string" ? values.activeProject : "";
      if (!pid) return;
      const html = transcript && transcript.data && typeof transcript.data.html === "string" ? transcript.data.html : "";
      const list = commands && Array.isArray(commands.data) ? commands.data.filter((x) => typeof x === "string") : [];
      const dest = "beljar/p/" + pid + "/repl";
      if ((html || list.length) && storage.getItem(dest) == null) {
        const at = Math.max(
          transcript && typeof transcript.at === "number" ? transcript.at : 0,
          commands && typeof commands.at === "number" ? commands.at : 0
        ) || Date.now();
        storage.setItem(dest, JSON.stringify({
          at,
          data: {
            html,
            scrollTop: transcript && transcript.data && typeof transcript.data.scrollTop === "number" ? transcript.data.scrollTop : 0,
            savedAt: transcript && transcript.data && typeof transcript.data.savedAt === "number" ? transcript.data.savedAt : at,
            commands: list
          }
        }));
      }
      storage.removeItem("beljar/repl/transcript");
      storage.removeItem("beljar/repl/commands");
    }
  };

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
  function readBootRecord(storage, schema, key) {
    try {
      if (storage.getItem("beljar/schema") !== String(schema)) return null;
      const env = JSON.parse(storage.getItem(key) || "null");
      return env && env.data && typeof env.data === "object" ? env.data : null;
    } catch (_) {
      return null;
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
  function cleanDismissed(raw) {
    if (!Array.isArray(raw)) return void 0;
    const out = [];
    for (const id of raw) {
      if (typeof id === "string" && id && !out.includes(id)) out.push(id);
    }
    return out;
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
    // How much the status strip says. It is always there: no Off (2026-09-30).
    { id: "statusStrip", section: "keybindings", default: "standard", values: ["compact", "standard", "detailed"] },
    { id: "vimLeader", section: "keybindings", default: "\\", values: ["\\", ",", " "] },
    { id: "vimInsertEscape", section: "keybindings", default: "", values: ["", "jk", "jj", "kj"] },
    { id: "emacsYankSource", section: "keybindings", default: "system", values: ["system", "kill-ring"] },
    // Clipboard dialogs this browser has closed. The grant is per browser, so it
    // does not follow the account, and Reset does not ask again.
    { id: "clipboardReadDismissed", section: "keybindings", default: [], type: "json", normalize: cleanDismissed, sync: false, reset: false },
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
    // Case completion: fill a proof's missing cases when typing pauses, or only on a command.
    { id: "caseFill", section: "harpoon", default: "auto", values: ["auto", "ask"] },
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
    // What a plain arrival at BelJar opens: home, or the project last opened, the
    // way an IDE reopens its last window. Early boot decides, before first paint
    // (js/boot/early-boot-core.mjs `startTarget`).
    { id: "startPage", section: "workspace", default: "home", values: ["home", "last"] },
    { id: "inspectorFollow", section: "workspace", default: OFF },
    { id: "restorePanels", section: "workspace", default: ON },
    { id: "libraryExpandDefault", section: "workspace", default: OFF },
    // Tips seen once on any computer stay seen on all of them (js/ui/hint-seen.mjs):
    // one row per tip, so two computers that each saw a different one never disagree.
    { id: "hintSeenLibrary", section: "workspace", default: OFF, reset: false },
    { id: "hintSeenInspectorCursor", section: "workspace", default: OFF, reset: false },
    { id: "hintSeenSignIn", section: "workspace", default: OFF, reset: false },
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

  // js/persist/settings-apply.mjs
  var UI_FONT_SCALES = { sm: 0.875, md: 1, lg: 1.125, xl: 1.25 };
  var UI_TEXT_CONTRAST = { low: 1, medium: 1.6, high: 2.4, maximum: 4.5 };
  var EDITOR_MONO = {
    jetbrains: "'JetBrains Mono', monospace",
    system: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  };
  function prefersReducedMotion(motionPref) {
    if (motionPref === "reduce") return true;
    if (motionPref === "full") return false;
    try {
      return typeof globalThis.matchMedia === "function" && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  }
  function applyDocumentSettings(docEl, values) {
    if (!docEl || !values) return;
    docEl.classList.toggle("light", values.theme === "light");
    docEl.style.setProperty("--ui-font-scale", String(UI_FONT_SCALES[values.uiFontSize] || 1));
    docEl.style.setProperty("--ui-text-contrast", String(UI_TEXT_CONTRAST[values.uiTextContrast] || UI_TEXT_CONTRAST.medium));
    docEl.classList.toggle("jar-motion-reduce", values.motionPref === "reduce");
    docEl.classList.toggle("jar-motion-full", values.motionPref === "full");
    docEl.style.setProperty("--editor-mono", EDITOR_MONO[values.editorFontFamily] || EDITOR_MONO.jetbrains);
    docEl.style.setProperty("--editor-ligatures", "none");
    docEl.classList.toggle("jar-hole-subtle", values.editorHoleEmphasis === "subtle");
    docEl.classList.toggle("jar-hole-loud", values.editorHoleEmphasis === "loud");
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
  var idList = accountIds;
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
    // Signed out with "Remove": the account whose projects are still to leave
    // this browser ('' none). They go when the next page loads (work.mjs
    // `finishSignOut`), never under the page that signed out, which is still live.
    { id: "leftAccount", type: "string", default: "" },
    // And the projects of it that stay, kept for it: a session that ended
    // elsewhere leaves behind nothing the cloud lacks (account.mjs `sessionEnded`).
    { id: "leftKeep", type: "json", default: [], normalize: idList },
    // Why this browser was signed out without asking ('' none): 'elsewhere' or
    // 'ended'. Said once, by the page that loads next (account.mjs).
    { id: "signedOutNote", type: "string", default: "" },
    // Signing in again: the account whose work this browser should come back
    // to, and the project it had open when it signed out here ('' the newest).
    // Used once, by the first load that finds a blank placeholder open
    // (account.mjs `resumeAfterSignIn`, work.mjs `isBlankProject`).
    { id: "resumeAccount", type: "string", default: "" },
    { id: "resumeProject", type: "string", default: "" },
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

  // js/frame/routes.mjs
  var g = typeof window !== "undefined" ? window : globalThis;
  var PROJECT_ID = /^p_[0-9a-hjkmnp-tv-z]{26}$/;
  var EDIT_SHORT = /(?:^|\/)edit\/?$/;
  var EDIT_ANY = /(?:^|\/)edit(?:\.html)?\/?$/;
  var PRIVACY_ANY = /(?:^|\/)privacy(?:\.html)?\/?$/;
  function short() {
    if (g.BELJAR_DEPLOYED) return true;
    const path = g.location && typeof g.location.pathname === "string" ? g.location.pathname : "";
    return EDIT_SHORT.test(path);
  }
  function query(pairs) {
    const parts = [];
    for (const [k, v] of pairs) if (v) parts.push(k + "=" + encodeURIComponent(v));
    return parts.length ? "?" + parts.join("&") : "";
  }
  function startsOnLast() {
    const S = g.Settings;
    try {
      return !!S && typeof S.get === "function" && S.get("startPage") === "last";
    } catch (_) {
      return false;
    }
  }
  function homeUrl(opts) {
    const base = short() ? "/" : "index.html";
    if (opts && opts.open) return base + query([["open", opts.open]]);
    return base + (startsOnLast() ? "?home" : "");
  }
  function editUrl(pid) {
    return (short() ? "/edit" : "edit.html") + query([["p", pid]]);
  }
  function privacyUrl() {
    return short() ? "/privacy" : "privacy.html";
  }
  function signInUrl(loc) {
    const l = loc || g.location;
    const back = l ? String(l.pathname || "/") + String(l.search || "") : "/";
    return "/api/auth/github/start" + query([["return", back]]);
  }
  function pageOf(loc) {
    const p = String(loc && loc.pathname || "");
    if (EDIT_ANY.test(p)) return "edit";
    return PRIVACY_ANY.test(p) ? "privacy" : "home";
  }
  function projectParam(loc, name) {
    const pairs = String(loc && loc.search || "").replace(/^\?/, "").split("&");
    for (const pair of pairs) {
      const eq = pair.indexOf("=");
      if (eq === -1 || pair.slice(0, eq) !== name) continue;
      let v = pair.slice(eq + 1);
      try {
        v = decodeURIComponent(v);
      } catch (_) {
        return null;
      }
      return PROJECT_ID.test(v) ? v : null;
    }
    return null;
  }
  function projectOf(loc) {
    return pageOf(loc) === "edit" ? projectParam(loc, "p") : null;
  }
  function pendingOf(loc) {
    return pageOf(loc) === "home" ? projectParam(loc, "open") : null;
  }
  var ISSUES_URL = "https://github.com/dpbarry/bel-jar/issues";
  var CONTACT_EMAIL = "dean.barry@mail.mcgill.ca";
  var CONTACT_URL = "mailto:" + CONTACT_EMAIL;
  function reportIssue() {
    if (typeof g.open === "function") g.open(ISSUES_URL, "_blank", "noopener");
  }
  function go(url, opts) {
    if (!g.location) return;
    if (opts && opts.replace) g.location.replace(url);
    else g.location.assign(url);
  }
  function settle(url) {
    const h = g.history;
    const l = g.location;
    if (!h || !l || typeof h.replaceState !== "function") return false;
    h.replaceState(h.state, "", url + String(l.hash || ""));
    return true;
  }
  function nameProject(pid) {
    const l = g.location;
    if (!l || pageOf(l) !== "edit" || projectOf(l) === pid) return false;
    return settle(editUrl(pid));
  }
  var Routes = {
    PROJECT_ID,
    ISSUES_URL,
    CONTACT_URL,
    homeUrl,
    editUrl,
    privacyUrl,
    signInUrl,
    pageOf,
    projectOf,
    pendingOf,
    go,
    settle,
    nameProject,
    reportIssue
  };
  g.Routes = Routes;

  // js/persist/keys.mjs
  function projectPrefix(pid) {
    return "beljar/p/" + pid + "/";
  }
  function metaKey(pid) {
    return projectPrefix(pid) + "meta";
  }

  // js/boot/boot-project.mjs
  function showableProject(storage, device, pid) {
    if (!pid) return null;
    const meta = readBootRecord(storage, SCHEMA, metaKey(pid));
    if (!meta) return null;
    const owner = meta.owner == null ? null : meta.owner;
    const account = device && device.account || null;
    const kept = device && Array.isArray(device.keptAccounts) ? device.keptAccounts : [];
    if (owner !== null && owner !== account && !(!account && kept.includes(owner))) return null;
    return meta;
  }

  // js/boot/page-transition-core.mjs
  function projectOfUrl(url) {
    try {
      const u = new URL(String(url));
      return projectOf({ pathname: u.pathname, search: u.search });
    } catch (_) {
      return null;
    }
  }
  function pageOfUrl(url) {
    try {
      const u = new URL(String(url));
      return pageOf({ pathname: u.pathname });
    } catch (_) {
      return null;
    }
  }
  function transitionStep(o) {
    if (o.reduced || o.unseen) return "skip";
    if (o.here === "privacy" || pageOfUrl(o.other) === "privacy") return "skip";
    return { row: o.here === "home" ? projectOfUrl(o.other) : null };
  }
  var NAMED = {
    "proj-title": "#header-context-name, .home-row[data-opening] .home-row__name, .home-row[data-landing] .home-row__name",
    "proj-row": ".home-row[data-opening], .home-row[data-landing]",
    "proj-surface": "body:not(.home-page) > .workspace"
  };
  var MORPHS = {
    "proj-title": NAMED["proj-title"]
  };
  function transformOnly(from, rect) {
    if (!from || !rect || !(rect.width > 0) || !(rect.height > 0)) return null;
    const w = parseFloat(from.width);
    const h = parseFloat(from.height);
    if (!from.transform || from.transform === "none" || !(w > 0) || !(h > 0)) return null;
    const sx = Math.round(w / rect.width * 1e5) / 1e5;
    const sy = Math.round(h / rect.height * 1e5) / 1e5;
    const easing = from.easing || "ease";
    return [
      { transform: from.transform + " scale(" + sx + ", " + sy + ")", easing },
      { transform: "translate(" + rect.left + "px, " + rect.top + "px)", easing }
    ];
  }
  function compositeGroups(document2) {
    let done = 0;
    try {
      const root = document2.documentElement;
      for (const anim of document2.getAnimations()) {
        const effect = anim.effect;
        const m = /^::view-transition-group\((.+)\)$/.exec(effect && effect.pseudoElement || "");
        if (!m || !MORPHS[m[1]] || effect.target !== root) continue;
        const el = document2.querySelector(MORPHS[m[1]]);
        if (!el) continue;
        const frames = transformOnly(effect.getKeyframes()[0], el.getBoundingClientRect());
        if (!frames) continue;
        effect.setKeyframes(frames);
        done += 1;
      }
    } catch (_) {
    }
    return done;
  }
  function zoomFrames(row, area, dir) {
    if (!row || !area || !(row.width > 0) || !(area.width > 0)) return null;
    const s = Math.round(row.width / area.width * 1e5) / 1e5;
    const full = "translate(" + area.left + "px, " + area.top + "px)";
    const small = "translate(" + row.left + "px, " + row.top + "px) scale(" + s + ")";
    if (dir === "in") {
      return { transform: [{ transform: small }, { transform: full }], opacity: [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1 }] };
    }
    return {
      transform: [{ transform: full }, { transform: small }],
      opacity: [{ opacity: 1 }, { opacity: 1, offset: 0.2 }, { opacity: 0, offset: 0.55 }, { opacity: 0 }]
    };
  }
  function groupBox(view, root, name) {
    const cs = view.getComputedStyle(root, "::view-transition-group(" + name + ")");
    const m = /matrix\(([^)]+)\)/.exec(cs.transform || "");
    const width = parseFloat(cs.width);
    if (!m || !(width > 0)) return null;
    const v = m[1].split(",").map(Number);
    return { left: v[4], top: v[5], width };
  }
  function zoomSurface(document2) {
    try {
      const root = document2.documentElement;
      const view = document2.defaultView;
      const row = groupBox(view, root, "proj-row");
      const area = groupBox(view, root, "proj-surface");
      const dir = document2.querySelector(NAMED["proj-surface"]) ? "in" : "out";
      const frames = zoomFrames(row, area, dir);
      if (!frames) return 0;
      const css = view.getComputedStyle(root);
      const duration = parseFloat(css.getPropertyValue("--page-morph")) || 300;
      const easing = css.getPropertyValue("--ease-in-out").trim() || "ease-in-out";
      for (const a of document2.getAnimations()) {
        const pe = a.effect && a.effect.pseudoElement;
        if (pe === "::view-transition-old(proj-surface)" || pe === "::view-transition-new(proj-surface)") a.cancel();
      }
      const group = "::view-transition-group(proj-surface)";
      root.animate(frames.transform, { pseudoElement: group, duration, easing, fill: "both" });
      root.animate(frames.opacity, { pseudoElement: group, duration, easing: "linear", fill: "both" });
      return 1;
    } catch (_) {
      return 0;
    }
  }
  var HOLD_MS = 1200;
  function holdUntil(window2, document2, isReady, maxMs) {
    try {
      if (isReady()) return false;
      const anims = document2.getAnimations().filter((a) => a.effect && /^::view-transition/.test(a.effect.pseudoElement || ""));
      if (!anims.length) return false;
      for (const a of anims) a.pause();
      const t0 = window2.performance.now();
      const run = () => {
        for (const a of anims) {
          try {
            a.play();
          } catch (_) {
          }
        }
      };
      const look = () => {
        let done = true;
        try {
          done = isReady() || window2.performance.now() - t0 >= maxMs;
        } catch (_) {
        }
        if (done) run();
        else window2.requestAnimationFrame(look);
      };
      window2.requestAnimationFrame(look);
      return true;
    } catch (_) {
      return false;
    }
  }
  function quiet(vt) {
    for (const p of [vt.ready, vt.finished, vt.updateCallbackDone]) {
      if (p && typeof p.catch === "function") p.catch(() => {
      });
    }
  }
  function installPageTransitions(env) {
    const { window: window2, document: document2 } = env;
    if (!window2 || typeof window2.addEventListener !== "function") return;
    const reduced = () => {
      let pref = "system";
      try {
        pref = window2.Settings && typeof window2.Settings.get === "function" ? window2.Settings.get("motionPref") : typeof env.bootMotion === "function" ? env.bootMotion() : "system";
      } catch (_) {
      }
      return prefersReducedMotion(pref);
    };
    const unseen = () => window2.BELJAR_LEAVING === true || !!(window2.Persist && typeof window2.Persist.leaving === "function" && window2.Persist.leaving());
    const mark = (pid, as) => {
      const row = pid ? document2.querySelector('.home-row[data-pid="' + pid + '"]') : null;
      if (row) row.setAttribute(as, "");
      return row;
    };
    const editorBuilt = () => !!(window2.Frame && typeof window2.Frame.isMounted === "function" && window2.Frame.isMounted() && window2.CurrentEditor);
    const whenReady = (vt) => {
      if (!vt.ready || typeof vt.ready.then !== "function") return;
      vt.ready.then(() => {
        compositeGroups(document2);
        zoomSurface(document2);
        if (pageOf(window2.location) === "edit") holdUntil(window2, document2, editorBuilt, HOLD_MS);
      }, () => {
      });
    };
    window2.addEventListener("pageswap", (e) => {
      const vt = e && e.viewTransition;
      if (!vt) return;
      quiet(vt);
      const to = e.activation && e.activation.entry ? e.activation.entry.url : "";
      const step = transitionStep({ reduced: reduced(), unseen: unseen(), here: pageOf(window2.location), other: to });
      if (step === "skip") vt.skipTransition();
      else mark(step.row, "data-opening");
    });
    window2.addEventListener("pagereveal", (e) => {
      const vt = e && e.viewTransition;
      if (!vt) return;
      quiet(vt);
      const nav = window2.navigation;
      const from = nav && nav.activation && nav.activation.from ? nav.activation.from.url : "";
      const step = transitionStep({ reduced: reduced(), unseen: false, here: pageOf(window2.location), other: from });
      if (step === "skip") {
        vt.skipTransition();
        return;
      }
      const row = mark(step.row, "data-landing");
      whenReady(vt);
      if (!row || !vt.finished || typeof vt.finished.then !== "function") return;
      const clear = () => row.removeAttribute("data-landing");
      vt.finished.then(clear, clear);
    });
  }

  // js/boot/early-boot-core.mjs
  var SPLIT_STACK_MQ = "(max-width: 48rem)";
  function applySplitVars(rootStyle, ratio, stackMq, matchMedia) {
    const a = Math.round(ratio * 1e6) / 1e6;
    const b = Math.round((1 - ratio) * 1e6) / 1e6;
    if (matchMedia(stackMq).matches) {
      rootStyle.removeProperty("--workspace-split-cols");
      rootStyle.setProperty("--workspace-split-rows", `${a}fr ${b}fr`);
    } else {
      rootStyle.removeProperty("--workspace-split-rows");
      rootStyle.setProperty("--workspace-split-cols", `${a}fr ${b}fr`);
    }
  }
  function applyStoredSettings(docEl, storage) {
    applyDocumentSettings(docEl, readBootSettings(storage, SCHEMA));
  }
  function applyPanelDimensionPrefs(rootStyle, device) {
    for (const row of DEVICE) {
      if (row.cssVar && device[row.id] !== row.default) rootStyle.setProperty(row.cssVar, `${device[row.id]}px`);
    }
  }
  function startTarget({ settings, device, storage, loc, navType }) {
    if (!settings || settings.startPage !== "last") return null;
    if (!loc || pageOf(loc) !== "home" || loc.search || loc.hash) return null;
    if (navType === "reload" || navType === "back_forward") return null;
    const pid = device && device.activeProject;
    return pid && showableProject(storage, device, pid) ? pid : null;
  }
  function installEarlyBoot(env) {
    const { document: document2, window: window2, localStorage: localStorage2 } = env;
    try {
      migrateStorage(localStorage2, SCHEMA, MIGRATIONS);
    } catch (_) {
    }
    const device = readBootDevice(localStorage2, SCHEMA);
    installPageTransitions({ window: window2, document: document2, bootMotion: () => readBootSettings(localStorage2, SCHEMA).motionPref });
    const nav = window2.performance && typeof window2.performance.getEntriesByType === "function" ? window2.performance.getEntriesByType("navigation")[0] : null;
    const pid = startTarget({
      settings: readBootSettings(localStorage2, SCHEMA),
      device,
      storage: localStorage2,
      loc: window2.location,
      navType: nav ? nav.type : "navigate"
    });
    if (pid) {
      window2.BELJAR_LEAVING = true;
      document2.documentElement.style.display = "none";
      go(editUrl(pid), { replace: true });
      return;
    }
    applyStoredSettings(document2.documentElement, localStorage2);
    applyPanelDimensionPrefs(document2.documentElement.style, device);
    applySplitVars(document2.documentElement.style, device.editorSplit, SPLIT_STACK_MQ, window2.matchMedia.bind(window2));
  }
  function registerServiceWorker(nav, loc) {
    if (!("serviceWorker" in nav)) return;
    const host = loc.hostname;
    const isLocalDev = host === "localhost" || host === "127.0.0.1";
    if (isLocalDev) {
      nav.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => {
          r.unregister();
        });
      });
      return;
    }
    nav.serviceWorker.register("sw.js");
  }

  // js/boot/early-boot.mjs
  try {
    installEarlyBoot({ document, window, localStorage });
  } catch (_) {
  }
  registerServiceWorker(navigator, location);
})();
