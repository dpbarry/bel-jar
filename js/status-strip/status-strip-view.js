(() => {
  // js/status-strip/status-strip-segments.mjs
  var SEGMENT_ORDER = [
    "keymap",
    "position",
    "mode",
    "macro",
    "command",
    "selection",
    "goal",
    "progress",
    "holes",
    "problems",
    "orca",
    "run",
    "runstop",
    "symbols",
    "spacer",
    "tab",
    "sync",
    "suite",
    "undo",
    "redo",
    "history",
    "checker"
  ];
  var PRESETS = {
    compact: ["keymap", "position", "mode", "macro", "command", "goal", "holes", "problems", "orca", "run", "runstop", "spacer", "tab", "sync", "undo", "redo", "history", "checker"],
    standard: ["keymap", "position", "mode", "macro", "command", "selection", "goal", "progress", "holes", "problems", "orca", "run", "runstop", "spacer", "tab", "sync", "suite", "undo", "redo", "history", "checker"],
    detailed: SEGMENT_ORDER
  };
  var GOAL_MAX = 52;
  var RUN_QUIET_MS = 2e3;
  function runClock(ms) {
    const s = Math.floor(Math.max(0, ms) / 1e3);
    return s < 60 ? s + "s" : Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function nameList(names, max = 3) {
    if (names.length <= max) {
      return names.length < 2 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
    }
    return names.slice(0, max).join(", ") + " and " + (names.length - max) + " more";
  }
  var runVisible = (s) => !!(s.run && s.run.elapsedMs >= RUN_QUIET_MS);
  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }
  function truncate(text, max) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    return t.length > max ? t.slice(0, max - 1) + "\u2026" : t;
  }
  function vimTone(mode) {
    const m = String(mode || "").toUpperCase();
    if (m.indexOf("INSERT") >= 0) return "insert";
    if (m.indexOf("VISUAL") >= 0 || m.indexOf("V-") >= 0) return "visual";
    if (m.indexOf("REPLACE") >= 0) return "replace";
    return "normal";
  }
  function stopSentence(s) {
    const stop = s.macro && s.macro.stop || "";
    if (!stop) return "Click to stop, or run the command again.";
    const needsNormal = s.style === "vim" && vimTone(s.mode) !== "normal";
    return "Press " + (needsNormal ? "Esc then " : "") + stop + " to stop, or click.";
  }
  var BUILDERS = {
    /**
     * Which keymap. Stable, so it carries no colour and no chip — and gated on a
     * file, because with no editor open there is no keymap to be in. Clicking it
     * opens the picker.
     */
    keymap(s) {
      if (!s.hasFile) return null;
      const name = s.style === "vim" ? "Vim" : s.style === "emacs" ? "Emacs" : "Standard";
      return {
        key: "keymap",
        text: name,
        tone: "plain",
        title: "Editing style",
        action: "keymap-menu",
        pressed: !!s.keymapOpen
      };
    },
    /** The mode WITHIN the keymap — only where there is one to be in. */
    mode(s) {
      if (s.style === "vim") {
        const mode = s.mode || "NORMAL";
        return { key: "mode", text: mode, tone: vimTone(mode), title: "Vim mode" };
      }
      if (s.style === "emacs" && s.mark) {
        return { key: "mode", text: "MARK", tone: "visual", title: "The mark is set" };
      }
      return null;
    },
    /**
     * Recording a keyboard macro.
     *
     * ⛔ In EVERY preset, including compact. Recording is a mode you can forget
     * you are in — the one piece of state where being told costs a few pixels and
     * not being told costs you the macro. Vim names the register (`@a`); Emacs and
     * Standard have none to name, so it just says REC.
     */
    macro(s) {
      if (!s.macro || !s.macro.recording) return null;
      return {
        key: "macro",
        text: s.macro.label ? "REC " + s.macro.label : "REC",
        // ⚠ `error` for two weeks, and NOTHING WAS STYLED FOR IT: `is-error` has
        // rules under `--problems` and `--checker` only, so the one chip that must
        // not be missed rendered in the resting muted grey. A tone is a claim on a
        // stylesheet; naming one nobody honours is the same as naming none.
        tone: "recording",
        title: "Recording a keyboard macro. " + stopSentence(s),
        mono: true,
        // ⛔ A way out that works from any mode. Vim's `q` is a NORMAL-mode key
        // and Emacs' `C-x )` is a chord a macro is busy swallowing; a chip that
        // reports a state you cannot leave is a trap, not a status.
        action: "macro-stop"
      };
    },
    /** A half-typed chord. The command LINE mounts beside this, same zone. */
    command(s) {
      if (!s.pending) return null;
      return { key: "command", text: s.pending, tone: "pending", title: "Waiting for the next key", mono: true };
    },
    position(s) {
      if (!s.hasFile || !Number.isFinite(s.line) || !Number.isFinite(s.col)) return null;
      return {
        key: "position",
        text: s.line + ":" + s.col,
        title: "Go to line",
        action: "goto-line",
        mono: true
      };
    },
    selection(s) {
      const chars = s.selChars || 0;
      if (chars <= 0) return null;
      const lines = s.selLines || 1;
      return {
        key: "selection",
        text: lines > 1 ? plural(lines, "line", "lines") : plural(chars, "char", "chars"),
        title: plural(chars, "character", "characters") + " selected"
      };
    },
    /**
     * The whole reason this bar exists: the goal under the caret, inline.
     *
     * ⛔ THREE states, not two. Being in a hole and knowing that hole's goal are
     * different facts (`inHole` / `goal`, split in `status-strip-feed.mjs`), and
     * folding them into one string meant a hole whose goal the checker had not
     * produced yet was reported as *no hole at all*: you stood on a fresh `?` and
     * the bar said nothing, with no way to say the honest thing.
     *
     *   not in a hole            → no chip
     *   in a hole, goal known    → the type, syntax-highlighted
     *   in a hole, goal not yet  → the same chip, holding a placeholder
     *
     * The placeholder keeps the hole wash and the turnstile so the chip does not
     * appear and jump when the real goal lands — only its text changes. It is NOT
     * a button: an action that cannot work yet is worse than no action.
     */
    goal(s) {
      if (!s.inHole) return null;
      if (!s.goal) {
        const busy = !!s.goalPending;
        return {
          key: "goal",
          text: busy ? "Computing\u2026" : "No goal",
          mark: "\u22A2",
          tone: "pending",
          title: busy ? "Working out this hole\u2019s goal" : "No goal for this hole. It is inside something that has not checked.",
          mono: true
        };
      }
      return {
        key: "goal",
        // The bare type, so it can be syntax-highlighted like everywhere else in
        // BelJar; the turnstile is a separate marker, not part of the type.
        text: truncate(s.goal, GOAL_MAX),
        mark: "\u22A2",
        render: "type",
        title: "Open in Harpoon\n\n" + s.goal,
        tone: "goal",
        action: "open-harpoon",
        mono: true,
        grow: true
      };
    },
    /**
     * How many PROOFS are finished — `rec`s and `proof`s with no hole and no
     * error. ⛔ Not a hole count: that is the next segment's fact, and one
     * unfinished proof can hold many holes, or none and a type error.
     *
     * Only while there is something left to do, and only with two proofs or more:
     * `0/1` says no more than the hole or error beside it.
     */
    progress(s) {
      const p = s.proofs;
      if (!s.hasFile || !p || p.total < 2 || p.done >= p.total) return null;
      const names = (p.unfinished || []).map((u) => u.name).filter(Boolean);
      return {
        key: "progress",
        text: p.done + "/" + p.total,
        sub: "proved",
        meter: p.done / p.total,
        title: (names.length ? "Unfinished: " + nameList(names) + "\n" : "") + "Go to the next unfinished proof",
        command: "nav.next-unfinished",
        action: "next-unfinished"
      };
    },
    holes(s) {
      const n = s.holes || 0;
      if (!n) return null;
      const rest = s.inHole ? n - 1 : n;
      return {
        key: "holes",
        text: s.inHole ? rest > 0 ? "+" + rest + " more" : "last hole" : plural(n, "hole", "holes"),
        title: "Go to the next hole",
        tone: "holes",
        action: "next-hole"
      };
    },
    problems(s) {
      const errors = s.errors || 0;
      const warnings = s.warnings || 0;
      if (errors + warnings <= 0) return null;
      const parts = [];
      if (errors) parts.push(errors + "\xD7");
      if (warnings) parts.push(warnings + "\u26A0");
      return {
        key: "problems",
        text: parts.join(" "),
        title: "Go to the next problem",
        tone: errors ? "error" : "warning",
        action: "next-problem",
        mono: true
      };
    },
    /** Orca is a long search; while it runs, the bar is where you watch it. */
    orca(s) {
      if (!s.orca) return null;
      return {
        key: "orca",
        text: s.orcaDetail ? "Orca \xB7 " + s.orcaDetail : "Orca searching\u2026",
        title: "Open Harpoon",
        tone: "busy",
        action: "open-harpoon"
      };
    },
    /**
     * An explicit Run, once it has gone on long enough to wonder about. The
     * output panel has its own progress bar; this is the one that is always on
     * screen, and the only place with a way to stop.
     */
    run(s) {
      if (!runVisible(s)) return null;
      return {
        key: "run",
        text: "Running",
        sub: runClock(s.run.elapsedMs),
        tone: "busy",
        title: s.run.label ? "Running " + s.run.label : "Running"
      };
    },
    runstop(s) {
      if (!runVisible(s)) return null;
      return { key: "runstop", icon: "stop", title: "Stop run", command: "run.stop", action: "run-stop" };
    },
    symbols(s) {
      if (!Number.isFinite(s.symbols) || s.symbols <= 0) return null;
      return { key: "symbols", text: plural(s.symbols, "decl", "decls"), title: s.symbols + " declarations in this file" };
    },
    spacer() {
      return { key: "spacer", spacer: true };
    },
    /**
     * A second tab has this project open. Standing condition, not an event —
     * leftmost of the right-hand group, before History, so it is the first thing
     * you read on that side. Not a notification: a notification can be cleared
     * while the other tab is still writing.
     */
    tab(s) {
      if (!s.tabConflict) return null;
      return {
        key: "tab",
        text: "Open in another tab",
        tone: "warning",
        title: "Both tabs save to the same files. The later save overwrites the other."
      };
    },
    /**
     * Sync, only when it needs you (docs/UI.md §2): files changed here and
     * somewhere else, offline, or a round that keeps failing. Its steady state,
     * synced, is the cloud's beside the project name and never repeated here.
     * Files to review show signed out too: two tabs can differ with no account.
     */
    sync(s) {
      const x = s.sync;
      if (!x) return null;
      if (x.differs && x.differs.length) {
        const n = x.differs.length;
        return {
          key: "sync",
          text: n === 1 ? "1 file to review" : n + " files to review",
          tone: "warning",
          title: "Review differences",
          action: "review-differences"
        };
      }
      if (!x.signedIn) return null;
      if (x.state === "held") {
        return { key: "sync", text: "Changes made offline", tone: "warning", title: "Review changes made offline", action: "review-offline" };
      }
      if (x.state === "offline" && x.notices !== false) {
        return { key: "sync", text: "Offline", tone: "warning", title: "Changes sync when you\u2019re back online" };
      }
      if (x.state === "error") {
        return { key: "sync", text: "Couldn\u2019t sync", tone: "error", title: "Sync now", action: "sync-now" };
      }
      return null;
    },
    /**
     * The suite this file is checked in, and where in it. Nothing else on screen
     * says so: the tabs and the header name files and the project, never the
     * .cfg whose earlier members this file is checked after. An earlier member
     * that fails is this file's problem too, so it turns the segment amber.
     */
    suite(s) {
      const x = s.suite;
      if (!s.hasFile || !x || !x.name) return null;
      const upstream = x.upstreamErrors || [];
      const placed = x.count > 1 && x.index >= 0;
      const lines = [
        placed ? "File " + (x.index + 1) + " of " + x.count + " in suite " + x.name : "Suite " + x.name,
        upstream.length ? (upstream.length === 1 ? "An earlier file has errors: " : "Earlier files have errors: ") + nameList(upstream) : "",
        "Reveal in Explorer"
      ];
      return {
        key: "suite",
        text: x.name,
        sub: placed ? x.index + 1 + "/" + x.count : "",
        tone: upstream.length ? "warning" : "plain",
        title: lines.filter(Boolean).join("\n"),
        command: "view.reveal-file",
        action: "reveal-file"
      };
    },
    /**
     * Undo and redo, as one tray with the history beside them. The tray appears
     * whole or not at all, so a direction with nothing in it is disabled rather
     * than missing — a button that comes and goes shoves its neighbours. The
     * view appends the live key to `title` from `command`.
     */
    undo(s) {
      if (!s.undoDepth && !s.redoDepth) return null;
      return { key: "undo", icon: "undo", title: "Undo", command: "edit.undo", action: "undo", disabled: !s.undoDepth };
    },
    redo(s) {
      if (!s.undoDepth && !s.redoDepth) return null;
      return { key: "redo", icon: "redo", title: "Redo", command: "edit.redo", action: "redo", disabled: !s.redoDepth };
    },
    /**
     * The way into the edit-history panel. A waiting redo branch is a tone
     * change, spelled out in the panel — not a number beside the icon.
     */
    history(s) {
      const undo = s.undoDepth || 0;
      const redo = s.redoDepth || 0;
      if (!undo && !redo) return null;
      return {
        key: "history",
        // ⛔ `icon`, not `mark`. `.jar-strip__mark` is the goal segment's turnstile
        // and already carries the HOLES magenta — borrowing it painted the arrow
        // bright pink, which read as an error badge sitting next to the checker.
        icon: "history",
        title: "Edit history",
        tone: redo ? "branched" : "plain",
        action: "edit-history",
        pressed: !!s.historyOpen
      };
    },
    /** Always speaks: silence about the checker reads as "is it even on?". */
    checker(s) {
      if (!s.hasFile) return null;
      const errors = s.errors || 0;
      const warnings = s.warnings || 0;
      let tone = "checked";
      let text = "Checked";
      if (s.checking) {
        tone = errors ? "error-checking" : "checking";
        text = Number.isFinite(s.parsePercent) && s.parsePercent < 100 ? "Parsing " + s.parsePercent + "%" : "Checking\u2026";
      } else if (errors) {
        tone = "error";
        text = plural(errors, "error", "errors");
      } else if (warnings) {
        tone = "warning";
        text = plural(warnings, "warning", "warnings");
      }
      const broken = errors + warnings > 0;
      return {
        key: "checker",
        text,
        title: broken ? "Go to the next problem" : "Run",
        tone,
        action: broken ? "next-problem" : "run-default",
        dot: true
      };
    }
  };
  function buildSegments(state2, detail2) {
    const s = state2 || {};
    const keys = PRESETS[detail2] || PRESETS.standard;
    const out = [];
    for (const key of keys) {
      const seg = BUILDERS[key](s);
      if (seg) out.push(seg);
    }
    while (out.length && out[out.length - 1].spacer) out.pop();
    return out;
  }
  function isResting(segments) {
    return segments.filter((s) => !s.spacer).length <= 1;
  }

  // js/status-strip/status-strip-parse.mjs
  var LINE_RE = /^(\d+)(?::(\d+))?$/;
  function tokenize(text) {
    const out = [];
    const re = /\S+/g;
    let m;
    while (m = re.exec(text)) out.push({ text: m[0], from: m.index, to: m.index + m[0].length });
    return out;
  }
  function parseCommandLine(raw, caret) {
    const text = String(raw == null ? "" : raw);
    const at = Number.isFinite(caret) ? Math.max(0, Math.min(caret, text.length)) : text.length;
    const tokens = tokenize(text);
    const base = { raw: text, caret: at, tokens, bang: false, name: "", args: [], argText: "" };
    if (!tokens.length) return { ...base, kind: "empty", slot: 0 };
    const head = tokens[0].text;
    const lineHit = LINE_RE.exec(head);
    if (lineHit && tokens.length === 1) {
      const line = parseInt(lineHit[1], 10);
      const col = lineHit[2] != null ? parseInt(lineHit[2], 10) : 1;
      return { ...base, kind: "line", line, col: Number.isFinite(col) && col > 0 ? col : 1, slot: 0 };
    }
    const bang = head.endsWith("!") && head.length > 1;
    const name = bang ? head.slice(0, -1) : head;
    const args = tokens.slice(1).map((t) => t.text);
    const argText = tokens.length > 1 ? text.slice(tokens[1].from) : "";
    let slot = 0;
    for (let i = 0; i < tokens.length; i += 1) {
      if (at >= tokens[i].from) slot = i;
    }
    if (at > tokens[tokens.length - 1].to) slot = tokens.length;
    return { ...base, kind: "command", bang, name, args, argText, slot };
  }
  function tokenAtCaret(parsed) {
    const { tokens, caret } = parsed;
    for (const t of tokens) {
      if (caret >= t.from && caret <= t.to) return t;
    }
    return { text: "", from: caret, to: caret };
  }
  function lineTarget(parsed) {
    if (!parsed || parsed.kind !== "line") return null;
    return { line: parsed.line, col: parsed.col };
  }

  // js/persist/table.mjs
  function typeOf(row) {
    if (row.values) return "enum";
    if (row.type) return row.type;
    if (typeof row.default === "boolean") return "bool";
    if (typeof row.default === "number") return "number";
    return "string";
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
    // How much the status strip says. It is always there: no Off (2026-09-30).
    { id: "statusStrip", section: "keybindings", default: "standard", values: ["compact", "standard", "detailed"] },
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
  function settingRow(id) {
    return BY_ID.get(id) || null;
  }

  // js/commands/command-settings.mjs
  var ROWS = [
    // ── layout ────────────────────────────────────────────────────────────────
    {
      slug: "word-wrap",
      title: "Word wrap",
      aliases: ["wrap"],
      setting: "editorWordWrap"
    },
    {
      slug: "line-numbers",
      title: "Line numbers",
      aliases: ["number", "nu"],
      setting: "editorLineNumbers"
    },
    {
      slug: "line-number-style",
      title: "Line number style",
      labels: { absolute: "Absolute", relative: "Relative", hybrid: "Relative + current" },
      aliases: ["relativenumber", "rnu"],
      setting: "editorLineNumberMode"
    },
    {
      slug: "fold-gutter",
      title: "Code folding",
      aliases: ["foldenable", "fen"],
      setting: "editorFoldGutter"
    },
    {
      slug: "active-line",
      title: "Active line highlight",
      aliases: ["cursorline", "cul"],
      setting: "editorActiveLine"
    },
    {
      slug: "scroll-past-end",
      title: "Scroll past end",
      aliases: ["scrollpastend", "spe"],
      setting: "editorScrollPastEnd"
    },
    {
      slug: "rulers",
      title: "Print-width ruler",
      aliases: ["colorcolumn", "cc"],
      setting: "editorRulers"
    },
    {
      slug: "sticky-decl",
      title: "Structure path",
      aliases: ["sticky"],
      setting: "stickyDeclHeader"
    },
    {
      slug: "tab-size",
      title: "Tab size",
      aliases: ["tabstop", "ts"],
      labels: { 2: "2 spaces", 4: "4 spaces" },
      setting: "editorTabSize"
    },
    {
      slug: "format-width",
      title: "Format print width",
      aliases: ["textwidth", "tw"],
      labels: { 80: "80 columns", 100: "100 columns", 120: "120 columns" },
      setting: "editorFormatWidth"
    },
    {
      slug: "whitespace",
      title: "Show whitespace",
      verb: "whitespace marks",
      on: "all",
      off: "none",
      aliases: ["list"],
      labels: { none: "Off", trailing: "Trailing only", selection: "In selection", all: "All" },
      setting: "editorWhitespace"
    },
    // ── type ──────────────────────────────────────────────────────────────────
    {
      slug: "font-size",
      title: "Font size",
      labels: { sm: "Small", md: "Default", lg: "Large", xl: "Larger" },
      setting: "editorFontSize"
    },
    {
      slug: "line-height",
      title: "Line height",
      labels: { compact: "Compact", normal: "Default", relaxed: "Relaxed" },
      setting: "editorLineHeight"
    },
    {
      slug: "font-family",
      title: "Editor font",
      labels: { jetbrains: "JetBrains Mono", system: "System monospace" },
      setting: "editorFontFamily"
    },
    {
      slug: "cursor-blink",
      title: "Cursor blink",
      labels: { off: "Solid", blink: "Blink", fast: "Fast" },
      setting: "editorCursorBlink"
    },
    // ── highlighting ──────────────────────────────────────────────────────────
    {
      slug: "syntax-highlight",
      title: "Syntax highlighting",
      aliases: ["syntax"],
      setting: "editorSyntaxHighlight"
    },
    {
      slug: "semantic-highlight",
      title: "Semantic highlighting",
      setting: "editorSemanticHighlight"
    },
    {
      slug: "parse-highlight",
      title: "Invalid parse styling",
      setting: "editorParseHighlight"
    },
    {
      slug: "occurrence-highlight",
      title: "Occurrence highlight",
      setting: "editorOccurrenceHighlight"
    },
    {
      slug: "selection-matches",
      title: "Selection matches",
      aliases: ["hlsearch", "hls"],
      setting: "editorSelectionMatches"
    },
    {
      slug: "bracket-match",
      title: "Bracket matching",
      aliases: ["showmatch", "sm"],
      setting: "editorBracketMatch"
    },
    // ── editing behaviour ─────────────────────────────────────────────────────
    {
      slug: "auto-close-brackets",
      title: "Auto-close brackets",
      aliases: ["autoclose"],
      setting: "editorAutoCloseBrackets"
    },
    {
      slug: "reindent-paste",
      title: "Re-indent on paste",
      setting: "editorReindentPaste"
    },
    {
      slug: "format-on-save",
      title: "Format on save",
      setting: "formatOnSave"
    },
    {
      slug: "trim-whitespace",
      title: "Trim trailing whitespace on save",
      setting: "trimTrailingWs"
    },
    // ── proof surface ─────────────────────────────────────────────────────────
    {
      slug: "hole-gutter",
      title: "Hole gutter marks",
      setting: "editorHoleGutter"
    },
    {
      slug: "hole-emphasis",
      title: "Hole gutter emphasis",
      labels: { subtle: "Subtle", normal: "Default", loud: "Loud" },
      setting: "editorHoleEmphasis"
    },
    {
      slug: "quiet-typing",
      title: "Quiet while typing",
      aliases: ["quiet"],
      setting: "quietWhileTyping"
    },
    {
      slug: "hover-sticky",
      title: "Sticky hover",
      setting: "hoverSticky"
    }
  ];
  var SETTINGS2 = ROWS.map((r) => {
    const row = settingRow(r.setting);
    if (!row) throw new Error(`command-settings: "${r.slug}" names no setting "${r.setting}"`);
    return typeOf(row) === "bool" ? { ...r, kind: "bool" } : { ...r, kind: "enum", values: row.values };
  });
  function optionCandidates() {
    const out = [];
    for (const s of SETTINGS2) {
      out.push({ value: s.slug, label: s.title });
      for (const a of s.aliases || []) out.push({ value: a, label: s.title });
    }
    for (const s of SETTINGS2) {
      if (s.kind !== "bool" && s.off === void 0) continue;
      out.push({ value: "no" + s.slug, label: s.title + " (off)" });
      for (const a of s.aliases || []) out.push({ value: "no" + a, label: s.title + " (off)" });
    }
    return out;
  }
  function optionValueCandidates(name) {
    const spec = findSetting(String(name || "").replace(/^no/, "")) || findSetting(name);
    if (!spec || spec.kind !== "enum") return [];
    return (spec.values || []).map((v) => ({
      value: String(v),
      label: spec.labels && spec.labels[v] || String(v)
    }));
  }
  function findSetting(name) {
    const key = String(name == null ? "" : name).toLowerCase();
    if (!key) return null;
    const bare = key.startsWith("set.") ? key.slice(4) : key;
    return SETTINGS2.find((s) => s.slug === bare) || SETTINGS2.find((s) => (s.aliases || []).indexOf(bare) >= 0) || null;
  }

  // js/status-strip/status-strip-complete.mjs
  function score(query2, text) {
    const q = String(query2 || "").toLowerCase();
    const t = String(text || "");
    const tl = t.toLowerCase();
    if (!q) return 0;
    if (q.length > tl.length) return -1;
    let s = 0;
    let prev = -2;
    let from2 = 0;
    for (let i = 0; i < q.length; i += 1) {
      const idx = tl.indexOf(q[i], from2);
      if (idx < 0) return -1;
      let step2 = 1;
      if (idx === prev + 1) step2 += 4;
      const before = idx > 0 ? t[idx - 1] : "";
      if (idx === 0 || before === " " || before === "-" || before === "." || before === "/") step2 += 6;
      s += step2;
      prev = idx;
      from2 = idx + 1;
    }
    if (tl.startsWith(q)) s += 8;
    return s;
  }
  function labelScore(query2, label) {
    const t = String(label || "").toLowerCase();
    const at = t.indexOf(String(query2 || "").toLowerCase());
    if (at < 0) return -1;
    const before = at > 0 ? t[at - 1] : "";
    return at === 0 ? 6 : before === " " || before === "-" ? 4 : 1;
  }
  function rank(query2, entries, limit) {
    if (!query2) return entries.slice(0, limit || 30);
    const scored = [];
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      let best = score(query2, e.value);
      for (const alias of e.aliases || []) best = Math.max(best, score(query2, alias));
      best = Math.max(best, labelScore(query2, e.label));
      if (best >= 0) scored.push({ e, best, i });
    }
    scored.sort((a, b) => b.best - a.best || a.i - b.i);
    return scored.slice(0, limit || 30).map((x) => x.e);
  }
  function complete(raw, caret, sources) {
    const src = sources || {};
    const parsed = parseCommandLine(raw, caret);
    const token = tokenAtCaret(parsed);
    if (parsed.kind === "line") {
      return { parsed, kind: "line", items: [], ghost: "", token };
    }
    if (parsed.kind === "empty" || parsed.slot === 0) {
      const all2 = src.commands && src.commands() || [];
      const bang = !!parsed.bang && token.text.endsWith("!");
      const typed = bang ? token.text.slice(0, -1) : token.text;
      const items3 = rank(typed, all2, 30);
      return {
        parsed,
        kind: "command",
        items: items3,
        // A completion cannot land after the `!` without eating it.
        ghost: bang ? "" : ghostFor(typed, items3),
        token: bang ? { text: typed, from: token.from, to: token.to - 1 } : token
      };
    }
    const all = src.commands && src.commands() || [];
    const cmd = all.find((c) => c.value === parsed.name) || all.find((c) => Array.isArray(c.aliases) && c.aliases.indexOf(parsed.name) >= 0);
    const argKind = cmd && cmd.args && cmd.args[parsed.slot - 1] ? cmd.args[parsed.slot - 1].kind : null;
    const known = !!cmd;
    if (argKind === "option") return { ...completeOption(parsed, token, src), known };
    let pool = [];
    if (argKind === "file") pool = src.files && src.files() || [];
    else if (argKind === "command") pool = src.commandNames && src.commandNames() || [];
    const items2 = rank(token.text, pool, 30);
    return { parsed, kind: argKind || "none", items: items2, ghost: ghostFor(token.text, items2), token, known };
  }
  function completeOption(parsed, token, src) {
    const eq = token.text.indexOf("=");
    if (eq >= 0) {
      const name = token.text.slice(0, eq);
      const typed2 = token.text.slice(eq + 1);
      const pool2 = src.optionValues && src.optionValues(name) || [];
      const items3 = rank(typed2, pool2, 30);
      return {
        parsed,
        kind: "option-value",
        option: name,
        items: items3,
        ghost: ghostFor(typed2, items3),
        token: { text: typed2, from: token.from + eq + 1, to: token.to }
      };
    }
    const bang = token.text.endsWith("!");
    const typed = bang ? token.text.slice(0, -1) : token.text;
    const pool = src.options && src.options() || [];
    const items2 = rank(typed, pool, 30);
    return {
      parsed,
      kind: "option",
      items: items2,
      // A completion cannot land after the `!` without eating it.
      ghost: bang ? "" : ghostFor(typed, items2),
      token: bang ? { text: typed, from: token.from, to: token.to - 1 } : token
    };
  }
  function ghostFor(typed, items2) {
    const q = String(typed || "");
    if (!q || !items2 || !items2.length) return "";
    const best = items2[0].value || "";
    if (!best.toLowerCase().startsWith(q.toLowerCase())) return "";
    return best.slice(q.length);
  }
  function applyCompletion(raw, caret, value, token) {
    const text = String(raw == null ? "" : raw);
    const span = token || tokenAtCaret(parseCommandLine(raw, caret));
    const next = text.slice(0, span.from) + value + text.slice(span.to);
    return { text: next, caret: span.from + String(value).length };
  }

  // js/status-strip/status-strip-line-ui.mjs
  var global = globalThis;
  var HISTORY_CAP = 50;
  var LIST_CAP = 30;
  var LIST_STEP = { n: 1, m: 1, p: -1 };
  var LIST_PAGE = 8;
  function stepLetter(e) {
    if (!e.ctrlKey || e.shiftKey) return "";
    if (e.key && e.key.length === 1) return e.key.toLowerCase();
    if (e.code && e.code.length === 4 && e.code.startsWith("Key")) return e.code[3].toLowerCase();
    return "";
  }
  function listStepDelta(e, opts) {
    if (!e || e.altKey || e.metaKey) return 0;
    const arrows = !opts || opts.arrows !== false;
    if (e.key === "PageDown") return LIST_PAGE;
    if (e.key === "PageUp") return -LIST_PAGE;
    if (arrows && !e.ctrlKey && !e.shiftKey) {
      if (e.key === "ArrowDown") return 1;
      if (e.key === "ArrowUp") return -1;
    }
    const letter = stepLetter(e);
    if (letter && LIST_STEP[letter] !== void 0) return LIST_STEP[letter];
    const KB = typeof globalThis !== "undefined" ? globalThis.Keybindings : null;
    if (KB && typeof KB.matchesId === "function") {
      if (!arrows && (e.key === "ArrowDown" || e.key === "ArrowUp")) return 0;
      if (KB.matchesId(e, "motion.line-down")) return 1;
      if (KB.matchesId(e, "motion.line-up")) return -1;
    }
    return 0;
  }
  var host = null;
  var input = null;
  var ghostEl = null;
  var listEl = null;
  var open = false;
  var items = [];
  var active = -1;
  var chosen = false;
  var query = "";
  var lastToken = null;
  var lastKind = "";
  var lastKnown = null;
  var onCloseCb = null;
  var history = [];
  var historyAt = -1;
  var historyLoaded = false;
  var savedScroll = null;
  var savedSelection = null;
  var searchDir = "";
  var searchAnchor = 0;
  var promptEl = null;
  function setPrompt(text) {
    if (!promptEl) return;
    const t = String(text == null ? "" : text);
    promptEl.textContent = t;
    const field = promptEl.parentNode;
    if (field && field.classList) field.classList.toggle("is-sigil", t.length === 1 && !/\w/.test(t));
  }
  var countEl = null;
  var previewTimer = 0;
  var PREVIEW_MS = 90;
  var listListeners = false;
  var listPad = { top: 0, bottom: 0 };
  var hinting = false;
  var forced = false;
  function blurRestoreOnClose(wasSearch) {
    return !!wasSearch;
  }
  function loadHistory() {
    if (historyLoaded) return;
    historyLoaded = true;
    const D = global.Device;
    if (D) history = D.get("commandLineHistory");
  }
  function saveHistory() {
    const D = global.Device;
    if (D) D.set("commandLineHistory", history);
  }
  function commandSources(face) {
    const C = global.Commands;
    const P = global.Persist;
    const forVim = face === "vim";
    return {
      commands() {
        if (!C || typeof C.list !== "function") return [];
        const rows2 = C.list({ cmdline: true, runnable: true, available: true }).filter((c) => !forVim || c.ex && c.ex.length).map((c) => ({
          value: c.ex && c.ex[0] || c.id,
          label: c.title,
          detail: c.section,
          // The id and `M-x` name are not names vim's dispatcher has, so on that
          // face they must not even be MATCHABLE — matching one puts a string on
          // the line that Enter cannot run.
          aliases: forVim ? (c.ex || []).slice() : (c.ex || []).concat([c.id], c.mx ? [c.mx] : []),
          args: c.args || [],
          id: c.id
        }));
        if (!forVim) return rows2;
        const taken = new Set(rows2.map((r) => r.value));
        const E = global.BelEditor;
        let vimRows = [];
        try {
          vimRows = typeof E?.vimExCandidates === "function" ? E.vimExCandidates() : [];
        } catch (_) {
          vimRows = [];
        }
        rows2.push({
          value: "BJ",
          label: "Run a BelJar command\u2026",
          detail: "BelJar",
          aliases: [],
          args: [{ kind: "command", label: "command" }],
          id: "vim:BJ"
        });
        return rows2.concat(vimRows.filter((r) => !taken.has(r.value)));
      },
      /**
       * Every BelJar command by id, for `:BJ <command>`.
       *
       * ⚠ The VALUE is the id, because that is what `:BJ` resolves FIRST — it
       * tries id, then ex alias, then exact title, then a title substring. A row
       * whose value it would resolve by the fuzzy last rule is a row that can
       * land on a different command than the one you picked.
       */
      commandNames() {
        if (!C || typeof C.list !== "function") return [];
        return C.list({ cmdline: true, runnable: true, available: true }).map((c) => ({
          value: c.id,
          label: c.title,
          detail: c.section,
          aliases: (c.ex || []).concat(c.mx ? [c.mx] : [])
        }));
      },
      files() {
        if (!P || typeof P.listFiles !== "function") return [];
        return (P.listFiles() || []).map((f) => ({ value: f.name, label: f.name }));
      },
      // `:set ` completes over every preference name, vi abbreviation and `no`
      // form; `:set ts=` completes over that setting's own values.
      options: () => optionCandidates(),
      optionValues: (name) => optionValueCandidates(name)
    };
  }
  function resolveCommand(name) {
    const all = commandSources().commands();
    const want = String(name == null ? "" : name).toLowerCase();
    if (!want) return null;
    return all.find((c) => String(c.value).toLowerCase() === want) || all.find((c) => c.aliases.some((a) => String(a).toLowerCase() === want)) || all.find((c) => (c.label || "").toLowerCase() === want) || null;
  }
  function jumpToLine(target) {
    const ed = global.CurrentEditor;
    const view = ed && typeof ed.getView === "function" ? ed.getView() : null;
    if (!view || !target) return false;
    const doc = view.state.doc;
    const line = doc.line(Math.max(1, Math.min(target.line, doc.lines)));
    const pos = Math.min(line.from + Math.max(0, target.col - 1), line.to);
    if (typeof ed.jumpToRange === "function") ed.jumpToRange({ from: pos, to: pos });
    else view.dispatch({ selection: { anchor: pos, head: pos }, scrollIntoView: true });
    if (typeof ed.focus === "function") ed.focus();
    return true;
  }
  function message(text) {
    const B = global.StatusStrip;
    if (B && typeof B.setMessage === "function") B.setMessage(text);
  }
  function runLine(raw, closing) {
    const parsed = parseCommandLine(raw);
    remember(raw);
    if (parsed.kind === "empty") {
      closing();
      return false;
    }
    if (parsed.kind === "line") {
      savedScroll = null;
      closing();
      if (jumpToLine(lineTarget(parsed))) return true;
      message("No file open.");
      return false;
    }
    const cmd = resolveCommand(parsed.name);
    closing();
    if (!cmd) {
      const near = complete(parsed.name, parsed.name.length, commandSources()).items[0];
      message(near ? `Unknown command "${parsed.name}". Did you mean "${near.value}"?` : `Unknown command "${parsed.name}".`);
      return false;
    }
    const C = global.Commands;
    try {
      const ok = C && C.run(cmd.id, { args: parsed.args, bang: parsed.bang, argText: parsed.argText });
      if (!ok) message(`"${cmd.label}" is not available right now.`);
      return !!ok;
    } catch (err) {
      if (global.console && console.error) console.error("[cmdline]", err);
      if (global.Toasts && global.Toasts.warn) {
        const msg = err && err.message ? String(err.message) : String(err);
        global.Toasts.warn("Command failed: " + msg);
      }
      return false;
    }
  }
  function submit() {
    runLine(input ? input.value : "", () => close());
  }
  function remember(raw) {
    const text = String(raw || "").trim();
    if (!text) return;
    loadHistory();
    const at = history.indexOf(text);
    if (at >= 0) history.splice(at, 1);
    history.unshift(text);
    if (history.length > HISTORY_CAP) history.length = HISTORY_CAP;
    historyAt = -1;
    saveHistory();
  }
  function previewLine(parsed) {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = 0;
    if (!parsed || parsed.kind !== "line") return;
    previewTimer = setTimeout(() => {
      previewTimer = 0;
      const ed = global.CurrentEditor;
      const view = ed && typeof ed.getView === "function" ? ed.getView() : null;
      if (!view || typeof ed.peekRange !== "function") return;
      const doc = view.state.doc;
      const line = doc.line(Math.max(1, Math.min(parsed.line, doc.lines)));
      ed.peekRange({ from: line.from, to: line.from });
    }, PREVIEW_MS);
  }
  function restoreViewport() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = 0;
    if (savedScroll == null) return;
    const ed = global.CurrentEditor;
    const view = ed && typeof ed.getView === "function" ? ed.getView() : null;
    const target = savedScroll;
    savedScroll = null;
    if (!view || !view.scrollDOM) return;
    view.scrollDOM.scrollTop = target;
    const settle = () => {
      if (view.dom.isConnected) view.scrollDOM.scrollTop = target;
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(settle);
    setTimeout(settle, 40);
  }
  function fitWholeRows(cap) {
    const first = listEl && listEl.firstElementChild;
    if (!first || !cap) return;
    const rowH = first.offsetHeight;
    if (!rowH || cap < rowH * 2) return;
    const rows2 = Math.max(2, Math.floor((cap - listPad.top - listPad.bottom) / rowH));
    listEl.style.maxHeight = rows2 * rowH + listPad.top + listPad.bottom + "px";
  }
  function anchorList() {
    const bar = host && host.closest ? host.closest(".jar-strip") : null;
    if (!bar || !listEl) return;
    const rect = bar.getBoundingClientRect();
    listEl.style.bottom = Math.max(0, Math.round(window.innerHeight - rect.top)) + "px";
    const zone = host.parentNode && host.parentNode.getBoundingClientRect ? host.parentNode : null;
    const field = (open || exInput ? zone : null) || bar.querySelector(".jar-strip__seg--command") || zone;
    const from2 = field && field.getBoundingClientRect ? field.getBoundingClientRect() : null;
    const pad = 6;
    let left = from2 && from2.width ? from2.left : rect.left + pad;
    const width = listEl.offsetWidth || 0;
    left = Math.min(left, Math.max(pad, window.innerWidth - width - pad));
    listEl.style.left = Math.max(pad, Math.round(left)) + "px";
  }
  function activeInput() {
    return exInput || input;
  }
  function syncActiveDescendant() {
    const el = activeInput();
    if (!el || !listEl) return;
    if (active < 0 || listEl.hidden) {
      el.removeAttribute("aria-activedescendant");
      return;
    }
    el.setAttribute("aria-activedescendant", "jar-cmdline-opt-" + active);
  }
  function bindListListeners() {
    if (listListeners || typeof window === "undefined") return;
    listListeners = true;
    window.addEventListener("resize", anchorList);
    window.addEventListener("scroll", anchorList, { passive: true, capture: true });
  }
  function unbindListListeners() {
    if (!listListeners || typeof window === "undefined") return;
    listListeners = false;
    window.removeEventListener("resize", anchorList);
    window.removeEventListener("scroll", anchorList, { capture: true });
  }
  function scrollRowIntoView(row) {
    if (!row || !listEl) return;
    const top = row.offsetTop - listPad.top;
    const bottom = row.offsetTop + row.offsetHeight + listPad.bottom;
    if (top < listEl.scrollTop) listEl.scrollTop = Math.max(0, top);
    else if (bottom > listEl.scrollTop + listEl.clientHeight) {
      listEl.scrollTop = bottom - listEl.clientHeight;
    }
  }
  function paintActive() {
    if (!listEl) return;
    for (const row of listEl.children) {
      if (!row.dataset || row.dataset.index == null) continue;
      const on = Number(row.dataset.index) === active;
      row.classList.toggle("is-active", on);
      row.setAttribute("aria-selected", on ? "true" : "false");
      if (on) scrollRowIntoView(row);
    }
    syncActiveDescendant();
  }
  function hideList() {
    forced = false;
    if (!listEl) return;
    listEl.replaceChildren();
    listEl.hidden = true;
    listEl.scrollTop = 0;
    unbindListListeners();
    syncActiveDescendant();
  }
  var EMPTY_LEGEND = {
    option: "No matching option",
    "option-value": "No matching value",
    file: "No matching file",
    command: "No matching command",
    none: "This command takes no further argument"
  };
  function renderList() {
    if (!listEl) return;
    if (searchDir || !query.trim() && !forced && !hinting) {
      hideList();
      return;
    }
    listEl.replaceChildren();
    listEl.hidden = false;
    listEl.scrollTop = 0;
    bindListListeners();
    if (!items.length) {
      const none = document.createElement("div");
      none.className = "jar-cmdline__none";
      none.textContent = EMPTY_LEGEND[lastKind] || "No matching command";
      listEl.appendChild(none);
      anchorList();
      syncActiveDescendant();
      return;
    }
    listEl.style.maxHeight = "";
    const cs = typeof getComputedStyle === "function" ? getComputedStyle(listEl) : null;
    listPad = {
      top: cs ? parseFloat(cs.paddingTop) || 0 : 0,
      bottom: cs ? parseFloat(cs.paddingBottom) || 0 : 0
    };
    const cap = cs ? parseFloat(cs.maxHeight) || 0 : 0;
    items.forEach((it, i) => {
      const row = document.createElement("div");
      row.className = "jar-cmdline__item";
      row.id = "jar-cmdline-opt-" + i;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", "false");
      row.dataset.index = String(i);
      const name = document.createElement("span");
      name.className = "jar-cmdline__item-name";
      name.textContent = it.value;
      row.appendChild(name);
      if (it.label && it.label !== it.value) {
        const label = document.createElement("span");
        label.className = "jar-cmdline__item-label";
        label.textContent = it.label;
        row.appendChild(label);
      }
      row.addEventListener("pointerdown", (e) => e.preventDefault());
      if (!hinting) row.addEventListener("click", () => {
        chosen = true;
        accept(i);
      });
      else row.classList.add("is-legend");
      listEl.appendChild(row);
    });
    fitWholeRows(cap);
    anchorList();
    paintActive();
  }
  function searchStep(fromCaret, forward) {
    const ed = global.CurrentEditor;
    if (!ed || typeof ed.searchFrom !== "function") return;
    const hit = ed.searchFrom(input.value, fromCaret, forward);
    countEl.textContent = input.value ? hit ? hit.index + "/" + hit.total : "no match" : "";
    countEl.classList.toggle("is-empty", !!input.value && !hit);
    if (!hit) return;
    searchAnchor = hit.from;
    const view = typeof ed.getView === "function" ? ed.getView() : null;
    if (!view) return;
    view.dispatch({ selection: { anchor: hit.from, head: hit.to }, scrollIntoView: true });
  }
  function completeInto(el) {
    const caret = el.selectionStart == null ? el.value.length : el.selectionStart;
    const res = complete(el.value, caret, commandSources(el === exInput ? "vim" : "own"));
    query = el.value;
    items = res.items.slice(0, LIST_CAP);
    lastToken = res.token || null;
    lastKnown = res.parsed && res.parsed.slot > 0 ? !!res.known : null;
    lastKind = lastKnown === false ? "command" : res.kind || "";
    active = items.length ? 0 : -1;
    chosen = false;
    return res;
  }
  function markUnknown() {
    if (!input) return;
    const typed = query.trim();
    if (!typed || /^\d/.test(typed)) {
      input.classList.remove("is-unknown");
      return;
    }
    const unknown = lastKnown === null ? !items.length : !lastKnown;
    input.classList.toggle("is-unknown", unknown);
  }
  function forceList() {
    const el = activeInput();
    if (!el || searchDir) return false;
    forced = true;
    hinting = false;
    if (el === exInput) refreshEx();
    else refresh();
    return true;
  }
  function isForceKey(e) {
    const K = (typeof window !== "undefined" ? window : globalThis).Keybindings;
    if (K && typeof K.matchesId === "function") return K.matchesId(e, "edit.autocomplete");
    return e.ctrlKey && (e.key === " " || e.code === "Space");
  }
  function refresh() {
    if (!open) return;
    if (searchDir) {
      searchStep(searchDir === "/" ? searchAnchor - 1 : searchAnchor, searchDir === "/");
      query = "";
      items = [];
      active = -1;
      hideList();
      return;
    }
    const res = completeInto(input);
    previewLine(res.parsed);
    ghostEl.textContent = res.ghost ? input.value + res.ghost : "";
    markUnknown();
    renderList();
  }
  function accept(index) {
    const el = activeInput();
    const it = items[index == null ? Math.max(active, 0) : index];
    if (!it || !el) return false;
    const caret = el.selectionStart == null ? el.value.length : el.selectionStart;
    const next = applyCompletion(el.value, caret, it.value, lastToken);
    el.value = next.text;
    el.setSelectionRange(next.caret, next.caret);
    resetCycle();
    if (el === exInput) refreshEx();
    else refresh();
    return true;
  }
  var wildStem = null;
  var wildAt = -1;
  var wildItems = [];
  function resetCycle() {
    wildStem = null;
    wildAt = -1;
    wildItems = [];
  }
  function tabCycle(back) {
    const el = activeInput();
    if (!el) return false;
    if (wildStem == null) {
      if (!items.length) return false;
      const caret = el.selectionStart == null ? el.value.length : el.selectionStart;
      const token = tokenAtCaret(parseCommandLine(el.value, caret));
      wildStem = { from: token.from, to: token.to };
      wildItems = items.slice();
      wildAt = back ? wildItems.length - 1 : 0;
    } else {
      wildAt = (wildAt + (back ? -1 : 1) + wildItems.length) % wildItems.length;
    }
    const it = wildItems[wildAt];
    if (!it) {
      resetCycle();
      return false;
    }
    const caretAt = wildStem.from + it.value.length;
    el.value = el.value.slice(0, wildStem.from) + it.value + el.value.slice(wildStem.to);
    el.setSelectionRange(caretAt, caretAt);
    wildStem = { from: wildStem.from, to: caretAt };
    lastToken = { text: it.value, from: wildStem.from, to: caretAt };
    active = items.indexOf(it);
    chosen = true;
    if (ghostEl && el === input) ghostEl.textContent = "";
    paintActive();
    return true;
  }
  function step(delta) {
    if (!items.length) return false;
    const from2 = active < 0 ? delta > 0 ? -1 : 0 : active;
    active = (from2 + delta + items.length * 2) % items.length;
    chosen = true;
    resetCycle();
    paintActive();
    return true;
  }
  var exInput = null;
  var exOnInput = null;
  var exOnKeydown = null;
  var exOnBlur = null;
  function refreshEx() {
    if (!exInput) return;
    if (!exInput.isConnected) {
      detachExCompletion();
      return;
    }
    completeInto(exInput);
    renderList();
  }
  function attachExCompletion(el) {
    if (!el) return false;
    if (exInput === el) {
      refreshEx();
      return true;
    }
    detachExCompletion();
    exInput = el;
    exOnInput = () => {
      resetCycle();
      refreshEx();
    };
    exOnKeydown = (e) => {
      if (isForceKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        forceList();
        return;
      }
      if (e.altKey || e.metaKey) return;
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        tabCycle(e.shiftKey);
        return;
      }
      const delta = listStepDelta(e, { arrows: false });
      if (delta) {
        if (!step(delta)) return;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === "Enter" && chosen && active >= 0) {
        accept();
        hideList();
        remember(el.value);
        return;
      }
      if (e.key === "Enter") remember(el.value);
      if (e.key === "Escape") {
        hideList();
        return;
      }
    };
    exOnBlur = () => hideList();
    el.addEventListener("input", exOnInput);
    el.addEventListener("keydown", exOnKeydown, true);
    el.addEventListener("blur", exOnBlur);
    refreshEx();
    return true;
  }
  function detachExCompletion() {
    if (!exInput) return false;
    exInput.removeEventListener("input", exOnInput);
    exInput.removeEventListener("keydown", exOnKeydown, true);
    exInput.removeEventListener("blur", exOnBlur);
    exInput = null;
    exOnInput = null;
    exOnKeydown = null;
    exOnBlur = null;
    items = [];
    active = -1;
    query = "";
    chosen = false;
    resetCycle();
    hideList();
    return true;
  }
  function recall(delta) {
    loadHistory();
    if (!history.length) return;
    historyAt = Math.max(-1, Math.min(history.length - 1, historyAt + delta));
    input.value = historyAt < 0 ? "" : history[historyAt];
    input.setSelectionRange(input.value.length, input.value.length);
    resetCycle();
    refresh();
  }
  function onKey(e) {
    if (e.key === "Escape" || e.ctrlKey && e.key === "g") {
      e.preventDefault();
      close({ restore: true });
      return;
    }
    if (searchDir) {
      if (e.key === "Enter") {
        e.preventDefault();
        savedSelection = null;
        savedScroll = null;
        close({ restore: false });
        return;
      }
      const fwd = e.ctrlKey && e.key === "s" || e.key === "ArrowDown";
      const back = e.ctrlKey && e.key === "r" || e.key === "ArrowUp";
      if (fwd || back) {
        e.preventDefault();
        searchStep(fwd ? searchAnchor : searchAnchor, fwd);
        return;
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (chosen && active >= 0) accept();
      submit();
      return;
    }
    if (isForceKey(e)) {
      e.preventDefault();
      forceList();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      tabCycle(e.shiftKey);
      return;
    }
    const delta = listStepDelta(e, { arrows: false });
    if (delta) {
      if (step(delta)) e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (input.value) step(1);
      else recall(-1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (input.value) step(-1);
      else recall(1);
      return;
    }
    if (e.key === "ArrowRight" && input.selectionStart === input.value.length && ghostEl.textContent) {
      e.preventDefault();
      accept(0);
    }
  }
  function build(fieldParent, listParent) {
    host = document.createElement("div");
    host.className = "jar-cmdline";
    host.hidden = true;
    listEl = document.createElement("div");
    listEl.className = "jar-cmdline__list";
    listEl.setAttribute("role", "listbox");
    listEl.hidden = true;
    const field = document.createElement("div");
    field.className = "jar-cmdline__field";
    const prompt = document.createElement("span");
    prompt.className = "jar-cmdline__prompt";
    prompt.textContent = ":";
    promptEl = prompt;
    countEl = document.createElement("span");
    countEl.className = "jar-cmdline__count";
    ghostEl = document.createElement("span");
    ghostEl.className = "jar-cmdline__ghost";
    ghostEl.setAttribute("aria-hidden", "true");
    input = document.createElement("input");
    input.type = "text";
    input.className = "jar-cmdline__input";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Command line");
    input.addEventListener("input", () => {
      historyAt = -1;
      resetCycle();
      refresh();
    });
    input.addEventListener("keydown", onKey);
    input.addEventListener("blur", () => {
      if (open) close({ restore: blurRestoreOnClose(!!searchDir) });
    });
    const wrap = document.createElement("span");
    wrap.className = "jar-cmdline__inputwrap";
    wrap.append(ghostEl, input);
    field.append(prompt, wrap, countEl);
    host.append(field);
    fieldParent.appendChild(host);
    (listParent || fieldParent).appendChild(listEl);
    return host;
  }
  function isOpen() {
    return open;
  }
  function openSearch(forward, onClose) {
    if (!openLine("", onClose)) return false;
    searchDir = forward === false ? "?" : "/";
    setPrompt(searchDir);
    countEl.textContent = "";
    items = [];
    active = -1;
    query = "";
    hideList();
    const ed = global.CurrentEditor;
    const view = ed && typeof ed.getView === "function" ? ed.getView() : null;
    searchAnchor = view ? view.state.selection.main.head : 0;
    return true;
  }
  function openLine(prefix, onClose, opts) {
    if (!host) return false;
    onCloseCb = onClose || null;
    loadHistory();
    const ed = global.CurrentEditor;
    const view = ed && typeof ed.getView === "function" ? ed.getView() : null;
    savedScroll = view && view.scrollDOM ? view.scrollDOM.scrollTop : null;
    savedSelection = view ? { anchor: view.state.selection.main.anchor, head: view.state.selection.main.head } : null;
    searchDir = "";
    setPrompt(opts && opts.prompt || ":");
    if (countEl) countEl.textContent = "";
    hinting = false;
    forced = false;
    open = true;
    host.hidden = false;
    if (host.parentNode) host.parentNode.classList.add("is-line-open");
    input.value = prefix || "";
    resetCycle();
    refresh();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    return true;
  }
  function close(opts) {
    if (host && host.parentNode) host.parentNode.classList.remove("is-line-open");
    if (!open) return;
    open = false;
    host.hidden = true;
    if (host.parentNode) host.parentNode.classList.remove("is-line-open");
    input.value = "";
    input.classList.remove("is-unknown");
    ghostEl.textContent = "";
    items = [];
    active = -1;
    chosen = false;
    query = "";
    resetCycle();
    hideList();
    if (countEl) countEl.textContent = "";
    const wasSearch = !!searchDir;
    searchDir = "";
    setPrompt(":");
    if (wasSearch && savedSelection && (!opts || opts.restore !== false)) {
      const ed = global.CurrentEditor;
      const view = ed && typeof ed.getView === "function" ? ed.getView() : null;
      if (view) view.dispatch({ selection: savedSelection });
    }
    savedSelection = null;
    restoreViewport();
    if (opts && opts.restore !== false) {
      const ed = global.CurrentEditor;
      if (ed && typeof ed.focus === "function") ed.focus();
    }
    if (onCloseCb) onCloseCb();
  }
  function lastEntry() {
    loadHistory();
    return history.length ? history[0] : "";
  }
  function repeatLast() {
    const text = lastEntry();
    if (!text) {
      message("Nothing to repeat yet.");
      return false;
    }
    return runLine(text, () => {
    });
  }
  function showKeyHints(rows2) {
    if (!listEl || open || exInput) return false;
    if (!rows2 || !rows2.length) {
      hideKeyHints();
      return false;
    }
    hinting = true;
    query = "";
    items = rows2.map((r) => ({ value: r.key, label: r.title }));
    active = -1;
    chosen = false;
    renderList();
    return true;
  }
  function hideKeyHints() {
    if (!hinting) return false;
    hinting = false;
    items = [];
    active = -1;
    query = "";
    hideList();
    return true;
  }

  // js/status-strip/status-strip-history.mjs
  var KIND_LABELS = {
    typing: "Typing",
    edit: "Edit",
    format: "Format",
    rename: "Rename",
    hole: "Fill hole",
    "proof-commit": "Commit proof",
    "library-insert": "Insert from library",
    "file-batch": "Add files",
    "file-delete": "Delete files"
  };
  function labelForKind(kind) {
    const k = String(kind || "");
    if (KIND_LABELS[k]) return KIND_LABELS[k];
    if (!k) return "Edit";
    return k.charAt(0).toUpperCase() + k.slice(1).replace(/-/g, " ");
  }
  function baseName(path) {
    const p = String(path || "");
    const cut = p.lastIndexOf("/");
    return cut >= 0 ? p.slice(cut + 1) : p;
  }
  function nameFromId(id) {
    return baseName(String(id || "").replace(/^[a-z]+:\/\//i, ""));
  }
  function structuralOf(entry) {
    return entry.structural || {};
  }
  function filesTouched(entry, nameOf2) {
    const resolve = typeof nameOf2 === "function" ? nameOf2 : () => null;
    const s = structuralOf(entry);
    const names = [];
    const seen = /* @__PURE__ */ new Set();
    const add = (name) => {
      const n = String(name || "");
      if (!n || seen.has(n)) return;
      seen.add(n);
      names.push(n);
    };
    for (const f of s.created || []) add(f.name);
    for (const f of s.deleted || []) add(f.name);
    for (const id of Object.keys(entry.files || {})) add(resolve(id) || nameFromId(id));
    for (const id of Object.keys(s.cfg || {})) add(resolve(id) || nameFromId(id));
    return names;
  }
  function plural2(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }
  function describeEntry(entry, nameOf2) {
    const e = entry || {};
    const s = structuralOf(e);
    const names = filesTouched(e, nameOf2);
    let label = e.label || labelForKind(e.kind);
    if (!e.label) {
      const created = (s.created || []).length;
      const deleted = (s.deleted || []).length;
      if (e.kind === "file-batch" && created) label = "Add " + plural2(created, "file", "files");
      else if (e.kind === "file-delete" && deleted) label = "Delete " + plural2(deleted, "file", "files");
      else if (created && deleted) label = "Replace " + plural2(created, "file", "files");
      else if (created) label = "Add " + plural2(created, "file", "files");
      else if (deleted) label = "Delete " + plural2(deleted, "file", "files");
    }
    const where = names.length === 1 ? baseName(names[0]) : names.length > 1 ? plural2(names.length, "file", "files") : "";
    let preview = null;
    if (!e.label && PREVIEWABLE[e.kind]) {
      const ids = Object.keys(e.files || {});
      if (ids.length === 1) {
        const rec = e.files[ids[0]];
        preview = changePreview(rec && rec.before, rec && rec.after);
      }
    }
    return { label, where, files: names, preview };
  }
  var PREVIEW_MAX = 34;
  function changePreview(before, after) {
    const b = String(before == null ? "" : before);
    const a = String(after == null ? "" : after);
    if (b === a) return null;
    let p = 0;
    const max = Math.min(b.length, a.length);
    while (p < max && b[p] === a[p]) p += 1;
    let sfx = 0;
    while (sfx < max - p && b[b.length - 1 - sfx] === a[a.length - 1 - sfx]) sfx += 1;
    const added = a.slice(p, a.length - sfx);
    const removed = b.slice(p, b.length - sfx);
    const sign = added && removed ? "\xB1" : added ? "+" : "\u2212";
    const body = added || removed;
    const flat = body.replace(/\s+/g, " ").trim();
    if (!flat) {
      const n = body.length;
      if (!n) return null;
      return { sign, text: n === 1 ? "newline" : n + " spaces", faded: true };
    }
    const text = flat.length > PREVIEW_MAX ? flat.slice(0, PREVIEW_MAX - 1) + "\u2026" : flat;
    return { sign, text };
  }
  var PREVIEWABLE = { typing: true, edit: true };
  var MINUTE = 6e4;
  var HOUR = 60 * MINUTE;
  var DAY = 24 * HOUR;
  function relativeTime(ts, now) {
    const then = Number(ts);
    const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    if (!Number.isFinite(then) || then <= 0) return "";
    const ago = Math.max(0, at - then);
    if (ago < MINUTE) return "now";
    if (ago < HOUR) return Math.floor(ago / MINUTE) + "m";
    if (ago < DAY) return Math.floor(ago / HOUR) + "h";
    return Math.floor(ago / DAY) + "d";
  }
  function buildHistoryRows(undoStack, redoStack, opts) {
    const o = opts || {};
    const nameOf2 = o.nameOf;
    const at = o.now;
    const undo = Array.isArray(undoStack) ? undoStack : [];
    const redo = Array.isArray(redoStack) ? redoStack : [];
    const rows2 = [];
    for (let i = 0; i < redo.length; i += 1) {
      const entry = redo[i];
      const d = describeEntry(entry, nameOf2);
      rows2.push({
        id: entry.id,
        kind: entry.kind,
        label: d.label,
        preview: d.preview,
        where: d.where,
        files: d.files,
        when: relativeTime(entry.ts, at),
        direction: "redo",
        distance: redo.length - i,
        ahead: true
      });
    }
    rows2.push({ id: "__now__", now: true, label: "Current", direction: null, distance: 0 });
    for (let i = undo.length - 1; i >= 0; i -= 1) {
      const entry = undo[i];
      const d = describeEntry(entry, nameOf2);
      rows2.push({
        id: entry.id,
        kind: entry.kind,
        label: d.label,
        preview: d.preview,
        where: d.where,
        files: d.files,
        when: relativeTime(entry.ts, at),
        direction: "undo",
        distance: undo.length - i,
        ahead: false
      });
    }
    return rows2;
  }
  function historySummary(undoCount, redoCount) {
    const n = (Number(undoCount) || 0) + (Number(redoCount) || 0);
    return n ? plural2(n, "step", "steps") : "No steps yet";
  }

  // js/status-strip/status-strip-popup.mjs
  var PAD = 6;
  function anchorAbove(panel, segSelector, align, textSel) {
    const strip = document.querySelector(".jar-strip");
    if (!strip || !panel) return;
    const bar = strip.getBoundingClientRect();
    panel.style.bottom = Math.max(0, Math.round(window.innerHeight - bar.top)) + "px";
    const segEl = strip.querySelector(segSelector);
    const seg = segEl?.getBoundingClientRect();
    const width = panel.offsetWidth || 0;
    const label = segEl?.querySelector(".jar-strip__label")?.getBoundingClientRect();
    const text = textSel && panel.querySelector(textSel)?.getBoundingClientRect();
    const inset = label && text ? text.left - panel.getBoundingClientRect().left - (label.left - seg.left) : 0;
    const want = align === "left" ? seg ? seg.left - inset : bar.left + PAD : seg ? seg.right - width : bar.right - width - PAD;
    panel.style.left = Math.max(PAD, Math.round(Math.min(want, window.innerWidth - width - PAD))) + "px";
  }

  // js/status-strip/status-strip-history-ui.mjs
  var global2 = globalThis;
  var panelEl = null;
  var listEl2 = null;
  var open2 = false;
  var active2 = -1;
  var rows = [];
  var listeners = false;
  var onChanged = null;
  function history2() {
    return global2.EditHistory || null;
  }
  function nameOf(id) {
    const P = global2.Persist;
    if (!P || typeof P.getFileById !== "function") return null;
    const f = P.getFileById(id);
    return f ? f.name : null;
  }
  function anchor() {
    anchorAbove(panelEl, ".jar-strip__seg--history", "right");
  }
  function ensurePanel() {
    if (panelEl && panelEl.isConnected) return panelEl;
    panelEl = document.createElement("div");
    panelEl.className = "jar-hist";
    panelEl.setAttribute("role", "dialog");
    panelEl.setAttribute("aria-label", "Edit history");
    const head = document.createElement("div");
    head.className = "jar-hist__head";
    const title = document.createElement("span");
    title.className = "jar-hist__title";
    title.textContent = "Edit history";
    const count = document.createElement("span");
    count.className = "jar-hist__count";
    head.appendChild(title);
    head.appendChild(count);
    panelEl.appendChild(head);
    listEl2 = document.createElement("div");
    listEl2.className = "jar-hist__list";
    listEl2.setAttribute("role", "listbox");
    panelEl.appendChild(listEl2);
    panelEl._count = count;
    document.body.appendChild(panelEl);
    return panelEl;
  }
  function rowEl(row, index) {
    if (row.now) {
      const marker = document.createElement("div");
      marker.className = "jar-hist__now";
      marker.setAttribute("role", "option");
      marker.setAttribute("aria-selected", "true");
      marker.dataset.index = String(index);
      const dot = document.createElement("span");
      dot.className = "jar-hist__now-dot";
      const text = document.createElement("span");
      text.className = "jar-hist__now-text";
      text.textContent = row.label;
      marker.appendChild(dot);
      marker.appendChild(text);
      return marker;
    }
    const el = document.createElement("button");
    el.type = "button";
    el.className = "jar-hist__row" + (row.ahead ? " is-ahead" : "");
    el.setAttribute("role", "option");
    el.setAttribute("aria-selected", "false");
    el.dataset.index = String(index);
    el.dataset.direction = row.direction;
    el.dataset.distance = String(row.distance);
    const label = document.createElement("span");
    label.className = "jar-hist__label";
    if (row.preview) {
      label.classList.add("is-preview");
      const sign = document.createElement("span");
      sign.className = "jar-hist__sign is-" + (row.preview.sign === "+" ? "add" : row.preview.sign === "\u2212" ? "cut" : "swap");
      sign.textContent = row.preview.sign;
      label.appendChild(sign);
      const text = document.createElement("span");
      text.className = "jar-hist__text" + (row.preview.faded ? " is-faded" : "");
      text.textContent = row.preview.text;
      label.appendChild(text);
    } else {
      label.textContent = row.label;
    }
    el.appendChild(label);
    if (row.where) {
      const where = document.createElement("span");
      where.className = "jar-hist__where";
      where.textContent = row.where;
      el.appendChild(where);
    }
    const when = document.createElement("span");
    when.className = "jar-hist__when";
    when.textContent = row.when || "";
    el.appendChild(when);
    const tipLines = [row.label];
    if (row.files && row.files.length > 1) tipLines.push("", ...row.files);
    el.setAttribute("data-tooltip", tipLines.join("\n"));
    el.setAttribute("aria-label", row.label + (row.where ? ", " + row.where : ""));
    global2.Tooltips?.bind?.(el);
    return el;
  }
  function render() {
    const H = history2();
    if (!H) return;
    const panel = ensurePanel();
    const undo = H.getUndoStack ? H.getUndoStack() : [];
    const redo = H.getRedoStack ? H.getRedoStack() : [];
    rows = buildHistoryRows(undo, redo, { nameOf, now: Date.now() });
    panel._count.textContent = historySummary(undo.length, redo.length);
    listEl2.textContent = "";
    rows.forEach((row, i) => listEl2.appendChild(rowEl(row, i)));
    if (active2 < 0 || active2 >= rows.length) active2 = rows.findIndex((r) => r.now);
    paintActive2();
    const now = listEl2.querySelector(".jar-hist__now");
    if (now && typeof now.scrollIntoView === "function") {
      now.scrollIntoView({ block: "center" });
    }
    anchor();
  }
  function paintActive2() {
    const nodes = listEl2.children;
    for (let i = 0; i < nodes.length; i += 1) {
      const on = i === active2;
      nodes[i].classList.toggle("is-active", on);
      nodes[i].setAttribute("aria-selected", on ? "true" : "false");
    }
    const el = nodes[active2];
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }
  function travelTo(index) {
    const row = rows[index];
    const H = history2();
    if (!row || !H || !row.direction || !row.distance) return false;
    const step2 = row.direction === "undo" ? H.undo : H.redo;
    for (let i = 0; i < row.distance; i += 1) {
      if (!step2.call(H)) break;
    }
    active2 = -1;
    render();
    if (onChanged) onChanged();
    return true;
  }
  function onKeyDown(e) {
    if (!open2) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close2({ focusStrip: true });
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      active2 = Math.max(0, Math.min(rows.length - 1, active2 + dir));
      paintActive2();
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      active2 = e.key === "Home" ? 0 : rows.length - 1;
      paintActive2();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      travelTo(active2);
    }
  }
  function onDocPointerDown(e) {
    if (!open2) return;
    const t = e.target;
    if (panelEl && panelEl.contains(t)) return;
    if (t && t.closest && t.closest(".jar-strip__seg--history")) return;
    close2();
  }
  function onListClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest(".jar-hist__row") : null;
    if (!btn) return;
    e.preventDefault();
    travelTo(Number(btn.dataset.index));
  }
  function bind() {
    if (listeners) return;
    listeners = true;
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onDocPointerDown, true);
    window.addEventListener("resize", anchor);
    window.addEventListener("scroll", anchor, { passive: true, capture: true });
    listEl2.addEventListener("click", onListClick);
  }
  function unbind() {
    if (!listeners) return;
    listeners = false;
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    window.removeEventListener("resize", anchor);
    window.removeEventListener("scroll", anchor, { capture: true });
    if (listEl2) listEl2.removeEventListener("click", onListClick);
  }
  function isOpen2() {
    return open2;
  }
  function close2(opts) {
    if (!open2) return false;
    open2 = false;
    unbind();
    if (panelEl && panelEl.parentNode) panelEl.parentNode.removeChild(panelEl);
    panelEl = null;
    listEl2 = null;
    active2 = -1;
    if (onChanged) onChanged();
    if (opts && opts.focusStrip) global2.CurrentEditor?.focus?.();
    return true;
  }
  function openPanel(changed) {
    const H = history2();
    if (!H) return false;
    const undo = H.getUndoStack ? H.getUndoStack().length : 0;
    const redo = H.getRedoStack ? H.getRedoStack().length : 0;
    if (!undo && !redo) return false;
    onChanged = changed || null;
    open2 = true;
    ensurePanel();
    bind();
    active2 = -1;
    render();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(anchor);
    if (onChanged) onChanged();
    return true;
  }
  function toggle(changed) {
    return open2 ? (close2(), false) : openPanel(changed);
  }
  function refresh2() {
    if (!open2) return;
    const H = history2();
    if (!H) {
      close2();
      return;
    }
    const undo = H.getUndoStack ? H.getUndoStack().length : 0;
    const redo = H.getRedoStack ? H.getRedoStack().length : 0;
    if (!undo && !redo) {
      close2();
      return;
    }
    render();
  }

  // js/status-strip/status-strip-keys.mjs
  var global3 = globalThis;
  function liveKeymapStyle() {
    const s = String(global3.Settings?.get?.("keymapStyle") || "").toLowerCase();
    return s === "vim" || s === "emacs" ? s : "default";
  }
  var FIXED_STYLE_SPECS = {
    vim: { "edit.undo": "u", "edit.redo": "Control+R" },
    emacs: { "edit.undo": "Control+Z", "edit.redo": "Control+Shift+Z" }
  };
  function liveKeyLabel(commandId) {
    const K = global3.Keybindings;
    const fixed = FIXED_STYLE_SPECS[liveKeymapStyle()]?.[commandId];
    if (fixed != null) return typeof K?.formatShortcut === "function" ? K.formatShortcut(fixed) : fixed;
    try {
      return typeof K?.labelFor === "function" ? K.labelFor(commandId) || "" : "";
    } catch (_) {
      return "";
    }
  }

  // js/status-strip/status-strip-keymap-ui.mjs
  var global4 = globalThis;
  var STYLES = [
    { value: "default", name: "Standard" },
    { value: "vim", name: "Vim" },
    { value: "emacs", name: "Emacs" }
  ];
  var panelEl2 = null;
  var listEl3 = null;
  var active3 = -1;
  var onChanged2 = null;
  var anchor2 = () => anchorAbove(panelEl2, ".jar-strip__seg--keymap", "left", ".jar-style__name");
  function rowEl2(style, index, current) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "jar-style__row" + (current ? " is-current" : "");
    el.setAttribute("role", "option");
    el.setAttribute("aria-selected", current ? "true" : "false");
    el.dataset.index = String(index);
    const name = document.createElement("span");
    name.className = "jar-style__name";
    name.textContent = style.name;
    el.appendChild(name);
    return el;
  }
  function build2() {
    panelEl2 = document.createElement("div");
    panelEl2.className = "jar-hist jar-hist--style";
    panelEl2.setAttribute("role", "dialog");
    panelEl2.setAttribute("aria-label", "Editing style");
    const head = document.createElement("div");
    head.className = "jar-hist__head";
    const title = document.createElement("span");
    title.className = "jar-hist__title";
    title.textContent = "Editing style";
    head.appendChild(title);
    listEl3 = document.createElement("div");
    listEl3.className = "jar-hist__list";
    listEl3.setAttribute("role", "listbox");
    const current = liveKeymapStyle();
    STYLES.forEach((s, i) => listEl3.appendChild(rowEl2(s, i, s.value === current)));
    active3 = -1;
    panelEl2.append(head, listEl3);
    document.body.appendChild(panelEl2);
    paintActive3();
  }
  function paintActive3() {
    Array.from(listEl3.children).forEach((n, i) => n.classList.toggle("is-active", i === active3));
  }
  function choose(index) {
    const style = STYLES[index];
    close3();
    if (style && style.value !== liveKeymapStyle()) {
      global4.Settings.set("keymapStyle", style.value);
      global4.dispatchEvent(new CustomEvent("beljar:settings-changed", { detail: { key: "keymap-style" } }));
      global4.StatusStrip?.setEditorState?.({ style: style.value });
    }
    global4.CurrentEditor?.focus?.();
  }
  var from = () => active3 < 0 ? Math.max(0, STYLES.findIndex((s) => s.value === liveKeymapStyle())) : active3;
  var moveTo = (i) => {
    active3 = (i + STYLES.length) % STYLES.length;
    paintActive3();
  };
  var KEYS = {
    Escape: () => close3({ focusEditor: true }),
    ArrowDown: () => moveTo(active3 < 0 ? from() : active3 + 1),
    ArrowUp: () => moveTo(active3 < 0 ? from() : active3 - 1),
    Home: () => moveTo(0),
    End: () => moveTo(STYLES.length - 1),
    Enter: () => choose(from()),
    " ": () => choose(from())
  };
  function onKeyDown2(e) {
    const fn = KEYS[e.key];
    if (!fn) return;
    e.preventDefault();
    e.stopPropagation();
    fn();
  }
  function onDocPointerDown2(e) {
    const t = e.target;
    if (panelEl2?.contains(t) || t?.closest?.(".jar-strip__seg--keymap")) return;
    close3();
  }
  function onListClick2(e) {
    const row = e.target?.closest?.(".jar-style__row");
    if (row) choose(Number(row.dataset.index));
  }
  function onListMove(e) {
    if (e.pointerType === "touch") return;
    const row = e.target?.closest?.(".jar-style__row");
    if (row && Number(row.dataset.index) !== active3) moveTo(Number(row.dataset.index));
  }
  function onListLeave() {
    if (active3 >= 0) {
      active3 = -1;
      paintActive3();
    }
  }
  var isOpen3 = () => !!panelEl2;
  function close3(opts) {
    if (!panelEl2) return false;
    document.removeEventListener("keydown", onKeyDown2, true);
    document.removeEventListener("pointerdown", onDocPointerDown2, true);
    window.removeEventListener("resize", anchor2);
    panelEl2.remove();
    panelEl2 = null;
    listEl3 = null;
    onChanged2?.();
    if (opts?.focusEditor) global4.CurrentEditor?.focus?.();
    return true;
  }
  function toggle2(changed) {
    if (panelEl2) return close3(), false;
    onChanged2 = changed || null;
    build2();
    listEl3.addEventListener("click", onListClick2);
    listEl3.addEventListener("pointermove", onListMove);
    listEl3.addEventListener("pointerleave", onListLeave);
    document.addEventListener("keydown", onKeyDown2, true);
    document.addEventListener("pointerdown", onDocPointerDown2, true);
    window.addEventListener("resize", anchor2);
    anchor2();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(anchor2);
    onChanged2?.();
    return true;
  }

  // js/status-strip/status-strip-view.mjs
  var global5 = globalThis;
  var root = null;
  var segmentHost = null;
  var vimSlotEl = null;
  var commandHost = null;
  var messageTimer = 0;
  var messageEl = null;
  var MESSAGE_HOLD_MS = 3200;
  var MESSAGE_FADE_MS = 200;
  var mounted = false;
  var frame = 0;
  var inited = false;
  var state = {
    style: "default",
    mode: "",
    pending: "",
    mark: false,
    /** `{ recording, label, stop }` while a keyboard macro is being recorded. */
    macro: null,
    hasFile: false,
    line: NaN,
    col: NaN,
    selChars: 0,
    selLines: 0,
    errors: 0,
    warnings: 0,
    checking: false,
    parsePercent: NaN,
    /**
     * The caret is inside a hole. ⛔ SEPARATE from `goal`: a hole whose goal has
     * not been computed yet is still a hole, and folding the two into one string
     * is what made a fresh `?` look like ordinary code.
     */
    inHole: false,
    /** A goal may still arrive for the hole at the caret (the engine's own say). */
    goalPending: false,
    goal: "",
    holes: 0,
    symbols: NaN,
    orca: false,
    orcaDetail: "",
    undoDepth: 0,
    redoDepth: 0,
    historyOpen: false,
    keymapOpen: false,
    /** A second tab has this project open. Standing, not a toast. */
    tabConflict: false,
    /** What sync is doing (Persist.syncSummary, pushed by js/account/sync-ui.mjs). */
    sync: null,
    /** `{ total, done, unfinished }` — the engine's `proofProgress()`. */
    proofs: null,
    /** `{ name, index, count, upstreamErrors }` while the file is a suite member. */
    suite: null,
    /** `{ label, elapsedMs }` while an explicit Run can be stopped. */
    run: null
  };
  var suiteBase = null;
  var upstreamErrors = [];
  var detail = "standard";
  var rendered = "";
  function detailLevel() {
    try {
      const v = Settings.get("statusStrip");
      if (v === "compact" || v === "standard" || v === "detailed") return v;
    } catch (_) {
    }
    return "standard";
  }
  function hostPane() {
    return document.body || null;
  }
  function ensureRoot() {
    if (root && root.isConnected) return root;
    const pane = hostPane();
    if (!pane) return null;
    root = document.createElement("div");
    root.className = "jar-strip";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "off");
    segmentHost = document.createElement("div");
    segmentHost.className = "jar-strip__segments";
    root.appendChild(segmentHost);
    commandHost = document.createElement("div");
    commandHost.className = "jar-strip__command";
    vimSlotEl = document.createElement("div");
    vimSlotEl.className = "jar-strip__vim";
    commandHost.appendChild(vimSlotEl);
    build(commandHost, root);
    pane.appendChild(root);
    return root;
  }
  var dotEl = null;
  function statusDot() {
    if (!dotEl) {
      dotEl = document.createElement("span");
      dotEl.className = "ide-status-dot jar-strip__statusdot";
      dotEl.setAttribute("data-status-silent", "");
      dotEl.setAttribute("role", "status");
    }
    return dotEl;
  }
  function renderType(host2, text) {
    const ed = global5.BelEditor;
    const norm = ed && typeof ed.normalizeType === "function" ? ed.normalizeType(text) : String(text == null ? "" : text);
    host2.textContent = "";
    if (!norm) return;
    if (ed && typeof ed.renderTypeInto === "function") {
      try {
        ed.renderTypeInto(host2, norm, "comp");
        if (host2.textContent.indexOf("|-") < 0) return;
      } catch (_) {
      }
    }
    host2.textContent = norm;
  }
  var ICONS = {
    history: [
      { d: "M2.78 8.92A5.3 5.3 0 1 0 4.45 4.06", stroke: true },
      { d: "M1.36 6.84 2.85 2.28 6.05 5.84Z", fill: true },
      { d: "M8 5.4V8.2l1.9 1.2", stroke: true, width: 1.3 }
    ],
    // A straight shaft hooking back, so the chevron meets a line, not an arc.
    undo: [
      { d: "M5.4 2.9 2.4 5.9l3 3", stroke: true },
      { d: "M2.6 5.9h6.9a3.4 3.4 0 0 1 0 6.8H7.2", stroke: true }
    ],
    redo: [
      { d: "M10.6 2.9l3 3-3 3", stroke: true },
      { d: "M13.4 5.9H6.5a3.4 3.4 0 0 0 0 6.8h2.3", stroke: true }
    ],
    stop: [
      { d: "M5.5 4.5h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z", fill: true }
    ]
  };
  var SVG_NS = "http://www.w3.org/2000/svg";
  function meterEl(ratio) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "jar-strip__meter");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const filled = Math.max(0, Math.min(1, ratio)) * 100;
    for (const [cls, dash] of filled > 0 ? [["track", 100], ["fill", filled]] : [["track", 100]]) {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("class", "jar-strip__meter-" + cls);
      c.setAttribute("cx", "8");
      c.setAttribute("cy", "8");
      c.setAttribute("r", "5.75");
      c.setAttribute("pathLength", "100");
      c.setAttribute("stroke-dasharray", dash + " 100");
      c.setAttribute("transform", "rotate(-90 8 8)");
      svg.appendChild(c);
    }
    return svg;
  }
  function iconEl(name) {
    const parts = ICONS[name];
    if (!parts) return null;
    const NS = SVG_NS;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "jar-strip__icon");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    for (const part of parts) {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", part.d);
      p.setAttribute("fill", part.fill ? "currentColor" : "none");
      if (part.stroke) {
        p.setAttribute("stroke", "currentColor");
        p.setAttribute("stroke-width", String(part.width || 1.5));
        p.setAttribute("stroke-linecap", "round");
        p.setAttribute("stroke-linejoin", "round");
      }
      svg.appendChild(p);
    }
    return svg;
  }
  function segmentEl(seg) {
    if (seg.spacer) {
      const gap = document.createElement("span");
      gap.className = "jar-strip__spacer";
      return gap;
    }
    const el = document.createElement(seg.action ? "button" : "span");
    el.className = "jar-strip__seg jar-strip__seg--" + seg.key + (seg.tone ? " is-" + seg.tone : "") + (seg.mono ? " is-mono" : "") + (seg.dot ? " is-dot" : "") + (seg.grow ? " is-grow" : "") + (seg.hint ? " is-hint" : "") + (seg.text || seg.render ? "" : " is-icon");
    if (seg.action) {
      el.type = "button";
      el.dataset.action = seg.action;
    }
    if (seg.disabled) el.setAttribute("aria-disabled", "true");
    if (seg.title) {
      el.setAttribute("data-tooltip", seg.title);
      el.setAttribute("aria-label", seg.title);
      global5.Tooltips?.bind?.(el);
    }
    if (seg.pressed != null) el.setAttribute("aria-expanded", seg.pressed ? "true" : "false");
    if (seg.pressed) el.classList.add("is-open");
    if (seg.dot) el.appendChild(statusDot());
    if (seg.meter != null) el.appendChild(meterEl(seg.meter));
    if (seg.icon) {
      const glyph = iconEl(seg.icon);
      if (glyph) el.appendChild(glyph);
    }
    if (seg.mark) {
      const mark = document.createElement("span");
      mark.className = "jar-strip__mark";
      mark.textContent = seg.mark;
      el.appendChild(mark);
    }
    if (!seg.text && !seg.render) return el;
    const label = document.createElement("span");
    label.className = "jar-strip__label";
    if (seg.render === "type") renderType(label, seg.text);
    else label.textContent = seg.text || "";
    el.appendChild(label);
    if (seg.sub) {
      const sub = document.createElement("span");
      sub.className = "jar-strip__sub";
      sub.textContent = seg.sub;
      el.appendChild(sub);
    }
    return el;
  }
  function withKeys(seg) {
    const keys = seg.command ? liveKeyLabel(seg.command) : "";
    return keys ? { ...seg, title: seg.title + " (" + keys + ")" } : seg;
  }
  function stepHistory(dir) {
    const ed = global5.CurrentEditor;
    if (typeof ed?.[dir] !== "function") return global5.EditHistory?.[dir]?.();
    ed.focus?.();
    return ed[dir]();
  }
  var ACTIONS = {
    "focus-editor": () => global5.CurrentEditor?.focus?.(),
    "goto-line": () => global5.CommandPalette?.open({ mode: "line" }),
    "commands": () => global5.CommandPalette?.open({ mode: "commands" }),
    "next-problem": () => global5.Commands?.run("nav.next-problem"),
    "run-default": () => global5.Commands?.run("run.default") || global5.Commands?.run("run.file"),
    "next-hole": () => global5.Commands?.run("nav.next-hole"),
    "open-harpoon": () => global5.Commands?.run("prover.open-in-harpoon") || global5.Commands?.run("view.harpoon"),
    "run": () => global5.Commands?.run("run.file"),
    "edit-history": () => openHistory(),
    "review-differences": () => global5.Commands?.run("sync.review"),
    "review-offline": () => global5.Commands?.run("sync.review-offline"),
    "sync-now": () => global5.Commands?.run("sync.now"),
    "next-unfinished": () => global5.Commands?.run("nav.next-unfinished"),
    "reveal-file": () => global5.Commands?.run("view.reveal-file"),
    "run-stop": () => global5.Commands?.run("run.stop"),
    "undo": () => stepHistory("undo"),
    "redo": () => stepHistory("redo"),
    "keymap-menu": () => {
      toggle2(syncKeymap);
      syncKeymap();
    },
    /**
     * Stop the recording, then hand the keyboard straight back.
     *
     * ⛔ `dropTrailing: 0`. The number is how many KEYSTROKES asked for the stop,
     * because the recorder sits on capture and has already seen them — a click is
     * none, and the default of 1 would eat the last key of the macro.
     */
    "macro-stop": () => {
      global5.Commands?.run("macro.record", { dropTrailing: 0 });
      global5.CurrentEditor?.focus?.();
    }
  };
  function runAction(action) {
    const fn = ACTIONS[action];
    if (fn) fn();
  }
  function openHistory() {
    toggle(syncHistory);
    syncHistory();
  }
  function syncHistory() {
    const H = global5.EditHistory;
    setEditorState({
      undoDepth: H && H.getUndoStack ? H.getUndoStack().length : 0,
      redoDepth: H && H.getRedoStack ? H.getRedoStack().length : 0,
      historyOpen: isOpen2()
    });
  }
  function syncKeymap() {
    setEditorState({ keymapOpen: isOpen3() });
  }
  function paint() {
    frame = 0;
    if (!mounted) return;
    const host2 = ensureRoot();
    if (!host2) return;
    const segments = buildSegments(state, detail).map(withKeys);
    const signature = segments.map((s) => s.key + ":" + s.text + ":" + (s.sub || "") + ":" + (s.meter ?? "") + ":" + s.tone + ":" + (s.pressed ? "1" : "") + (s.disabled ? "d" : "") + ":" + (s.title || "")).join("|");
    if (signature === rendered) return;
    rendered = signature;
    const els = segments.map(segmentEl);
    const spacerAt = segments.findIndex((seg) => seg.spacer);
    placeSegments(els, spacerAt < 0 ? els.length : spacerAt);
    placeMessage();
    host2.classList.toggle("is-resting", isResting(segments));
    const modeSeg = segments.find((x) => x.key === "mode");
    if (modeSeg) host2.dataset.mode = modeSeg.tone;
    else delete host2.dataset.mode;
  }
  function messageNode() {
    if (!messageEl) {
      messageEl = document.createElement("span");
      messageEl.className = "jar-strip__message";
      messageEl.setAttribute("role", "status");
      messageEl.setAttribute("aria-live", "polite");
    }
    return messageEl;
  }
  function placeSegments(els, at) {
    if (commandHost.parentNode !== segmentHost) segmentHost.appendChild(commandHost);
    for (const node of Array.from(segmentHost.childNodes)) {
      if (node !== commandHost && node !== messageEl) segmentHost.removeChild(node);
    }
    for (let i = 0; i < at; i += 1) segmentHost.insertBefore(els[i], commandHost);
    for (let i = at; i < els.length; i += 1) segmentHost.appendChild(els[i]);
  }
  function placeMessage() {
    if (!segmentHost) return;
    const node = messageNode();
    const spacer = segmentHost.querySelector(".jar-strip__spacer");
    if (spacer) {
      if (node.previousSibling !== spacer) spacer.after(node);
    } else if (node.parentNode !== segmentHost) {
      segmentHost.appendChild(node);
    }
  }
  function setMessage(text, opts) {
    const next = String(text || "");
    const node = messageNode();
    placeMessage();
    if (messageTimer) clearTimeout(messageTimer);
    messageTimer = 0;
    if (!next) {
      node.classList.remove("is-visible");
      messageTimer = setTimeout(() => {
        messageTimer = 0;
        node.textContent = "";
      }, MESSAGE_FADE_MS);
      return;
    }
    node.textContent = next;
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => node.classList.add("is-visible"));
    else node.classList.add("is-visible");
    if (opts && opts.hold) return;
    messageTimer = setTimeout(() => {
      messageTimer = 0;
      setMessage("");
    }, MESSAGE_HOLD_MS);
  }
  function openCommandLine(prefix, opts) {
    if (!mounted) apply();
    if (!mounted) return false;
    return openLine(prefix || "", () => {
      rendered = "";
      paint();
    }, opts);
  }
  function schedule() {
    if (!mounted || frame) return;
    frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(paint) : setTimeout(paint, 16);
  }
  function setEditorState(next) {
    if (!next) return;
    let changed = false;
    if (next.style && next.style !== state.style) next = { ...next, pending: "", mark: false };
    for (const key of [
      "style",
      "mode",
      "pending",
      "mark",
      "macro",
      "hasFile",
      "line",
      "col",
      "selChars",
      "selLines",
      "inHole",
      "goalPending",
      "goal",
      "holes",
      "symbols",
      "orca",
      "orcaDetail",
      "undoDepth",
      "redoDepth",
      "historyOpen",
      "keymapOpen",
      "tabConflict",
      "sync",
      "proofs",
      "suite",
      "run"
    ]) {
      if (!(key in next) || state[key] === next[key]) continue;
      state[key] = next[key];
      changed = true;
    }
    if (changed) schedule();
  }
  function setDiagnostics(next) {
    if (!next) return;
    const errors = Number(next.errors) || 0;
    const warnings = Number(next.warnings) || 0;
    const checking = !!next.checking;
    const parsePercent = "parsePercent" in next ? next.parsePercent : state.parsePercent;
    if (errors === state.errors && warnings === state.warnings && checking === state.checking && parsePercent === state.parsePercent) return;
    state.errors = errors;
    state.warnings = warnings;
    state.checking = checking;
    state.parsePercent = parsePercent;
    schedule();
  }
  function goalAtCaret() {
    const ed = global5.CurrentEditor;
    if (!ed || typeof ed.holeAtCursor !== "function") return "";
    try {
      const hit = ed.holeAtCursor();
      const goal = hit && hit.hole ? hit.hole.goal : null;
      if (!goal) return "";
      const norm = global5.BelEditor && typeof global5.BelEditor.normalizeType === "function" ? global5.BelEditor.normalizeType(String(goal)) : String(goal);
      return norm;
    } catch (_) {
      return "";
    }
  }
  function seedFromEditor() {
    const ed = global5.CurrentEditor;
    const view = ed && typeof ed.getView === "function" ? ed.getView() : null;
    if (!view) {
      setEditorState({ hasFile: false, line: NaN, col: NaN, selChars: 0, selLines: 0, goal: "" });
      return;
    }
    const sel = view.state.selection.main;
    const doc = view.state.doc;
    const head = doc.lineAt(sel.head);
    const selChars = Math.abs(sel.to - sel.from);
    setEditorState({
      style: Settings.get("keymapStyle"),
      hasFile: true,
      line: head.number,
      col: sel.head - head.from + 1,
      selChars,
      selLines: selChars ? doc.lineAt(sel.to).number - doc.lineAt(sel.from).number + 1 : 0,
      goal: goalAtCaret()
    });
  }
  function setOrca(running, detailText) {
    setEditorState({ orca: !!running, orcaDetail: running ? detailText || "" : "" });
  }
  function apply() {
    detail = detailLevel();
    mounted = true;
    if (!ensureRoot()) {
      mounted = false;
      return;
    }
    rendered = "";
    root.classList.remove("is-vim-line", "is-line-open");
    root.dataset.detail = detail;
    seedFromEditor();
    refreshProofState();
    syncHistory();
    paint();
  }
  function refreshProofState() {
    const ed = global5.CurrentEditor;
    if (!ed) {
      upstreamErrors = [];
      setEditorState({ holes: 0, symbols: NaN, goal: "", inHole: false, goalPending: false, proofs: null, suite: suiteState() });
      return;
    }
    let holes = 0;
    let symbols = NaN;
    let goalState = { inHole: false, goal: "", goalPending: false };
    try {
      goalState = global5.BelEditor?.goalAtCaret?.() || goalState;
    } catch (_) {
    }
    let checking = state.checking;
    let parsePercent = NaN;
    try {
      const eng = ed.getSemanticEngine?.();
      const list = eng && typeof eng.getHoles === "function" ? eng.getHoles() : null;
      holes = list ? list.length : 0;
    } catch (_) {
      holes = 0;
    }
    try {
      const st = ed.getIdeStatus?.();
      if (st) {
        symbols = Number.isFinite(st.symbolCount) ? st.symbolCount : NaN;
        checking = !!st.belugaChecking || !(st.parse?.complete ?? true);
        parsePercent = st.parse && !st.parse.complete ? st.parse.percent : NaN;
      }
    } catch (_) {
    }
    let proofs = null;
    try {
      const eng = ed.getSemanticEngine?.();
      proofs = eng?.proofProgress?.() || null;
      upstreamErrors = Object.entries(eng?.memberDiagnostics?.() || {}).filter(([, diags]) => (diags || []).some((d) => d.severity === "error")).map(([name]) => name.slice(name.lastIndexOf("/") + 1));
    } catch (_) {
      upstreamErrors = [];
    }
    setEditorState({
      holes,
      symbols,
      goal: goalState.goal,
      inHole: goalState.inHole,
      goalPending: !!goalState.goalPending,
      proofs: sameProofs(state.proofs, proofs) ? state.proofs : proofs,
      suite: suiteState()
    });
    setDiagnostics({ errors: state.errors, warnings: state.warnings, checking, parsePercent });
  }
  var proofKey = (p) => p ? p.done + "/" + p.total + ":" + p.unfinished.map((u) => u.name).join(",") : "";
  var sameProofs = (a, b) => proofKey(a) === proofKey(b);
  function suiteState() {
    if (!suiteBase) return null;
    const prev = state.suite;
    const same = prev && prev.name === suiteBase.name && prev.index === suiteBase.index && prev.count === suiteBase.count && prev.upstreamErrors.join("\n") === upstreamErrors.join("\n");
    return same ? prev : { ...suiteBase, upstreamErrors: upstreamErrors.slice() };
  }
  function setSuite(next) {
    suiteBase = next && next.name ? { name: next.name, index: next.index, count: next.count } : null;
    if (!suiteBase) upstreamErrors = [];
    setEditorState({ suite: suiteState() });
  }
  var runTimer = 0;
  function setRun(next) {
    if (runTimer) clearInterval(runTimer);
    runTimer = 0;
    if (!next) {
      setEditorState({ run: null });
      return;
    }
    const label = String(next.label || "");
    const startedAt = Date.now();
    const tick = () => setEditorState({ run: { label, elapsedMs: Date.now() - startedAt } });
    tick();
    runTimer = setInterval(tick, 1e3);
  }
  function onLint(e) {
    const d = e && e.detail || {};
    setDiagnostics({ errors: d.errors, warnings: d.warnings, checking: state.checking });
    refreshProofState();
  }
  function onClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest(".jar-strip__seg[data-action]") : null;
    if (!btn) return;
    e.preventDefault();
    if (btn.getAttribute("aria-disabled") !== "true") runAction(btn.dataset.action);
  }
  function init() {
    if (inited || typeof document === "undefined") return;
    inited = true;
    global5.addEventListener("beljar:hole-goals-updated", refreshProofState);
    global5.addEventListener("beljar:file-lint", onLint);
    global5.addEventListener("beljar:keybindings-changed", apply);
    document.addEventListener("click", onClick, true);
    apply();
  }
  global5.StatusStrip = {
    init,
    apply,
    setEditorState,
    setDiagnostics,
    refreshProofState,
    /**
     * The node Vim's own `:` and `/` inputs are mounted into. We keep the chrome;
     * the package keeps its input, its focus handling and its ex parsing — which
     * is the whole point of Vim mode being Vim.
     */
    vimSlot: () => ensureRoot() ? vimSlotEl : null,
    setVimLine: (on) => {
      if (!root) return;
      root.classList.toggle("is-vim-line", !!on);
    },
    setMessage,
    openCommandLine,
    openSearchLine: (forward) => {
      if (!mounted) apply();
      if (!mounted) return false;
      return openSearch(forward, () => {
        rendered = "";
        paint();
      });
    },
    isCommandLineOpen: isOpen,
    repeatLastCommand: repeatLast,
    attachExCompletion,
    detachExCompletion,
    showKeyHints,
    hideKeyHints,
    forceList,
    lastCommandLine: lastEntry,
    closeCommandLine: close,
    setOrca,
    /**
     * A second tab has this project open. The tab guard raises it when that tab
     * answers, and lowers it when the tab says goodbye.
     */
    setTabConflict: (on) => setEditorState({ tabConflict: !!on }),
    /** `{ name, index, count }` while the active file is a member of a suite, else null. */
    setSuite,
    /** `{ label }` while an explicit Run can be stopped, else null. */
    setRun,
    /**
     * Pushed by `install-edit-history.mjs` whenever the stack moves. ⛔ The strip
     * never polls the history: a widget that counts something has to be told when
     * the count changes, or it shows a stale number until the caret happens to
     * move.
     */
    setHistoryDepth: (undoDepth, redoDepth) => {
      setEditorState({ undoDepth: undoDepth || 0, redoDepth: redoDepth || 0 });
      refresh2();
    },
    openHistory,
    closeHistory: close2,
    isHistoryOpen: isOpen2,
    element: () => root,
    _pure: { buildSegments, isResting }
  };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
