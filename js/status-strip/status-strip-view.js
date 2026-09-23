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
    "holes",
    "problems",
    "orca",
    "symbols",
    "spacer",
    "tab",
    "history",
    "checker"
  ];
  var PRESETS = {
    compact: ["keymap", "position", "mode", "macro", "command", "goal", "holes", "problems", "orca", "spacer", "tab", "history", "checker"],
    standard: ["keymap", "position", "mode", "macro", "command", "selection", "goal", "holes", "problems", "orca", "spacer", "tab", "history", "checker"],
    detailed: SEGMENT_ORDER
  };
  var GOAL_MAX = 52;
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
     * file, because with no editor open there is no keymap to be in.
     */
    keymap(s) {
      if (!s.hasFile) return null;
      const name = s.style === "vim" ? "Vim" : s.style === "emacs" ? "Emacs" : "Standard";
      return { key: "keymap", text: name, tone: "plain", title: name + " keymap" };
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
     * The way into the edit-history panel.
     *
     * Silent until there is something to undo or redo, so an untouched file
     * carries no widget at all. A waiting redo branch is a tone change, spelled
     * out in the panel — not a second number beside the word.
     */
    history(s) {
      const undo = s.undoDepth || 0;
      const redo = s.redoDepth || 0;
      if (!undo && !redo) return null;
      return {
        key: "history",
        text: "History",
        // ⛔ `icon`, not `mark`. `.jar-strip__mark` is the goal segment's turnstile
        // and already carries the HOLES magenta — borrowing it painted the undo
        // arrow bright pink, which read as an error badge sitting next to the
        // checker. A widget that means something else gets its own mark.
        icon: "history",
        title: "Editor history",
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

  // js/commands/command-settings.mjs
  var SETTINGS = [
    // ── layout ────────────────────────────────────────────────────────────────
    {
      slug: "word-wrap",
      title: "Word wrap",
      kind: "bool",
      aliases: ["wrap"],
      read: "readStoredEditorWordWrap",
      write: "writeStoredEditorWordWrap"
    },
    {
      slug: "line-numbers",
      title: "Line numbers",
      kind: "bool",
      aliases: ["number", "nu"],
      read: "readStoredEditorLineNumbers",
      write: "writeStoredEditorLineNumbers"
    },
    {
      slug: "line-number-style",
      title: "Line number style",
      kind: "enum",
      values: ["absolute", "relative", "hybrid"],
      labels: { absolute: "Absolute", relative: "Relative", hybrid: "Relative + current" },
      aliases: ["relativenumber", "rnu"],
      read: "readStoredEditorLineNumberMode",
      write: "writeStoredEditorLineNumberMode"
    },
    {
      slug: "fold-gutter",
      title: "Code folding",
      kind: "bool",
      aliases: ["foldenable", "fen"],
      read: "readStoredEditorFoldGutter",
      write: "writeStoredEditorFoldGutter"
    },
    {
      slug: "active-line",
      title: "Active line highlight",
      kind: "bool",
      aliases: ["cursorline", "cul"],
      read: "readStoredEditorActiveLine",
      write: "writeStoredEditorActiveLine"
    },
    {
      slug: "scroll-past-end",
      title: "Scroll past end",
      kind: "bool",
      aliases: ["scrollpastend", "spe"],
      read: "readStoredEditorScrollPastEnd",
      write: "writeStoredEditorScrollPastEnd"
    },
    {
      slug: "rulers",
      title: "Print-width ruler",
      kind: "bool",
      aliases: ["colorcolumn", "cc"],
      read: "readStoredEditorRulers",
      write: "writeStoredEditorRulers"
    },
    {
      slug: "sticky-decl",
      title: "Structure path",
      kind: "bool",
      aliases: ["sticky"],
      read: "readStoredStickyDeclHeader",
      write: "writeStoredStickyDeclHeader"
    },
    {
      slug: "tab-size",
      title: "Tab size",
      kind: "enum",
      values: [2, 4],
      aliases: ["tabstop", "ts"],
      labels: { 2: "2 spaces", 4: "4 spaces" },
      read: "readStoredEditorTabSize",
      write: "writeStoredEditorTabSize"
    },
    {
      slug: "format-width",
      title: "Format print width",
      kind: "enum",
      values: [80, 100, 120],
      aliases: ["textwidth", "tw"],
      labels: { 80: "80 columns", 100: "100 columns", 120: "120 columns" },
      read: "readStoredEditorFormatWidth",
      write: "writeStoredEditorFormatWidth"
    },
    {
      slug: "whitespace",
      title: "Show whitespace",
      verb: "whitespace marks",
      kind: "enum",
      values: ["none", "trailing", "selection", "all"],
      on: "all",
      off: "none",
      aliases: ["list"],
      labels: { none: "Off", trailing: "Trailing only", selection: "In selection", all: "All" },
      read: "readStoredEditorWhitespace",
      write: "writeStoredEditorWhitespace"
    },
    // ── type ──────────────────────────────────────────────────────────────────
    {
      slug: "font-size",
      title: "Font size",
      kind: "enum",
      values: ["sm", "md", "lg", "xl"],
      labels: { sm: "Small", md: "Default", lg: "Large", xl: "Larger" },
      read: "readStoredEditorFontSize",
      write: "writeStoredEditorFontSize"
    },
    {
      slug: "line-height",
      title: "Line height",
      kind: "enum",
      values: ["compact", "normal", "relaxed"],
      labels: { compact: "Compact", normal: "Default", relaxed: "Relaxed" },
      read: "readStoredEditorLineHeight",
      write: "writeStoredEditorLineHeight"
    },
    {
      slug: "font-family",
      title: "Editor font",
      kind: "enum",
      values: ["jetbrains", "system"],
      labels: { jetbrains: "JetBrains Mono", system: "System monospace" },
      read: "readStoredEditorFontFamily",
      write: "writeStoredEditorFontFamily"
    },
    {
      slug: "cursor-blink",
      title: "Cursor blink",
      kind: "enum",
      values: ["off", "blink", "fast"],
      labels: { off: "Solid", blink: "Blink", fast: "Fast" },
      read: "readStoredEditorCursorBlink",
      write: "writeStoredEditorCursorBlink"
    },
    // ── highlighting ──────────────────────────────────────────────────────────
    {
      slug: "syntax-highlight",
      title: "Syntax highlighting",
      kind: "bool",
      aliases: ["syntax"],
      read: "readStoredEditorSyntaxHighlight",
      write: "writeStoredEditorSyntaxHighlight"
    },
    {
      slug: "semantic-highlight",
      title: "Semantic highlighting",
      kind: "bool",
      read: "readStoredEditorSemanticHighlight",
      write: "writeStoredEditorSemanticHighlight"
    },
    {
      slug: "parse-highlight",
      title: "Invalid parse styling",
      kind: "bool",
      read: "readStoredEditorParseHighlight",
      write: "writeStoredEditorParseHighlight"
    },
    {
      slug: "occurrence-highlight",
      title: "Occurrence highlight",
      kind: "bool",
      read: "readStoredEditorOccurrenceHighlight",
      write: "writeStoredEditorOccurrenceHighlight"
    },
    {
      slug: "selection-matches",
      title: "Selection matches",
      kind: "bool",
      aliases: ["hlsearch", "hls"],
      read: "readStoredEditorSelectionMatches",
      write: "writeStoredEditorSelectionMatches"
    },
    {
      slug: "bracket-match",
      title: "Bracket matching",
      kind: "bool",
      aliases: ["showmatch", "sm"],
      read: "readStoredEditorBracketMatch",
      write: "writeStoredEditorBracketMatch"
    },
    // ── editing behaviour ─────────────────────────────────────────────────────
    {
      slug: "auto-close-brackets",
      title: "Auto-close brackets",
      kind: "bool",
      aliases: ["autoclose"],
      read: "readStoredEditorAutoCloseBrackets",
      write: "writeStoredEditorAutoCloseBrackets"
    },
    {
      slug: "reindent-paste",
      title: "Re-indent on paste",
      kind: "bool",
      read: "readStoredEditorReindentPaste",
      write: "writeStoredEditorReindentPaste"
    },
    {
      slug: "format-on-save",
      title: "Format on save",
      kind: "bool",
      read: "readStoredFormatOnSave",
      write: "writeStoredFormatOnSave"
    },
    {
      slug: "trim-whitespace",
      title: "Trim trailing whitespace on save",
      kind: "bool",
      read: "readStoredTrimTrailingWs",
      write: "writeStoredTrimTrailingWs"
    },
    // ── proof surface ─────────────────────────────────────────────────────────
    {
      slug: "hole-gutter",
      title: "Hole gutter marks",
      kind: "bool",
      read: "readStoredEditorHoleGutter",
      write: "writeStoredEditorHoleGutter"
    },
    {
      slug: "hole-emphasis",
      title: "Hole gutter emphasis",
      kind: "enum",
      values: ["subtle", "normal", "loud"],
      labels: { subtle: "Subtle", normal: "Default", loud: "Loud" },
      read: "readStoredEditorHoleEmphasis",
      write: "writeStoredEditorHoleEmphasis"
    },
    {
      slug: "quiet-typing",
      title: "Quiet while typing",
      kind: "bool",
      aliases: ["quiet"],
      read: "readStoredQuietWhileTyping",
      write: "writeStoredQuietWhileTyping"
    },
    {
      slug: "hover-sticky",
      title: "Sticky hover",
      kind: "bool",
      read: "readStoredHoverSticky",
      write: "writeStoredHoverSticky"
    }
  ];
  function optionCandidates() {
    const out = [];
    for (const s of SETTINGS) {
      out.push({ value: s.slug, label: s.title });
      for (const a of s.aliases || []) out.push({ value: a, label: s.title });
    }
    for (const s of SETTINGS) {
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
    return SETTINGS.find((s) => s.slug === bare) || SETTINGS.find((s) => (s.aliases || []).indexOf(bare) >= 0) || null;
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
    let from = 0;
    for (let i = 0; i < q.length; i += 1) {
      const idx = tl.indexOf(q[i], from);
      if (idx < 0) return -1;
      let step2 = 1;
      if (idx === prev + 1) step2 += 4;
      const before = idx > 0 ? t[idx - 1] : "";
      if (idx === 0 || before === " " || before === "-" || before === "." || before === "/") step2 += 6;
      s += step2;
      prev = idx;
      from = idx + 1;
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
    const P = global.Persist;
    if (P && typeof P.readStoredCommandLineHistory === "function") {
      try {
        history = P.readStoredCommandLineHistory() || [];
      } catch (_) {
        history = [];
      }
    }
  }
  function saveHistory() {
    const P = global.Persist;
    if (P && typeof P.writeStoredCommandLineHistory === "function") {
      try {
        P.writeStoredCommandLineHistory(history);
      } catch (_) {
      }
    }
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
    const bar2 = host && host.closest ? host.closest(".jar-strip") : null;
    if (!bar2 || !listEl) return;
    const rect = bar2.getBoundingClientRect();
    listEl.style.bottom = Math.max(0, Math.round(window.innerHeight - rect.top)) + "px";
    const zone = host.parentNode && host.parentNode.getBoundingClientRect ? host.parentNode : null;
    const field = (open || exInput ? zone : null) || bar2.querySelector(".jar-strip__seg--command") || zone;
    const from = field && field.getBoundingClientRect ? field.getBoundingClientRect() : null;
    const pad = 6;
    let left = from && from.width ? from.left : rect.left + pad;
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
    const from = active < 0 ? delta > 0 ? -1 : 0 : active;
    active = (from + delta + items.length * 2) % items.length;
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
    const u = Number(undoCount) || 0;
    const r = Number(redoCount) || 0;
    if (!u && !r) return "Nothing to undo yet";
    const parts = [];
    if (u) parts.push(plural2(u, "step", "steps") + " to undo");
    if (r) parts.push(plural2(r, "step", "steps") + " to redo");
    return parts.join(" \xB7 ");
  }

  // js/status-strip/status-strip-history-ui.mjs
  var global2 = globalThis;
  var panelEl = null;
  var listEl2 = null;
  var footEl = null;
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
  function bar() {
    return document.querySelector(".jar-strip");
  }
  function anchor() {
    const strip = bar();
    if (!strip || !panelEl) return;
    const rect = strip.getBoundingClientRect();
    panelEl.style.bottom = Math.max(0, Math.round(window.innerHeight - rect.top)) + "px";
    const seg = strip.querySelector(".jar-strip__seg--history");
    const from = seg ? seg.getBoundingClientRect() : null;
    const pad = 6;
    const width = panelEl.offsetWidth || 0;
    let left = from ? from.right - width : rect.right - width - pad;
    left = Math.min(left, Math.max(pad, window.innerWidth - width - pad));
    panelEl.style.left = Math.max(pad, Math.round(left)) + "px";
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
    footEl = document.createElement("div");
    footEl.className = "jar-hist__foot";
    panelEl.appendChild(footEl);
    panelEl._count = count;
    document.body.appendChild(panelEl);
    return panelEl;
  }
  function liveKeymapStyle() {
    const P = global2.Persist;
    const raw = P && typeof P.readStoredKeymapStyle === "function" ? P.readStoredKeymapStyle() : "";
    const s = String(raw || "").toLowerCase();
    return s === "vim" || s === "emacs" ? s : "default";
  }
  var FIXED_STYLE_SPECS = {
    vim: { "edit.undo": "u", "edit.redo": "Control+R" },
    emacs: { "edit.undo": "Control+Z", "edit.redo": "Control+Shift+Z" }
  };
  function liveKeyLabel(commandId) {
    const K = global2.Keybindings;
    const style = liveKeymapStyle();
    const fixed = FIXED_STYLE_SPECS[style] && FIXED_STYLE_SPECS[style][commandId];
    if (fixed != null) {
      return K && typeof K.formatShortcut === "function" ? K.formatShortcut(fixed) : fixed;
    }
    if (!K || typeof K.labelFor !== "function") return "";
    try {
      return K.labelFor(commandId) || "";
    } catch (_) {
      return "";
    }
  }
  function hintRow(commandId, fallbackLabel) {
    const row = document.createElement("span");
    row.className = "jar-hist__hint";
    const C = global2.Commands;
    let label = fallbackLabel;
    try {
      const cmd = C && typeof C.get === "function" ? C.get(commandId) : null;
      if (cmd && cmd.title) label = cmd.title;
    } catch (_) {
    }
    const keys = liveKeyLabel(commandId);
    const name = document.createElement("span");
    name.className = "jar-hist__hint-name";
    name.textContent = label;
    row.appendChild(name);
    if (keys) {
      const kbd = document.createElement("kbd");
      kbd.className = "jar-hist__key";
      kbd.textContent = keys;
      row.appendChild(kbd);
    }
    return row;
  }
  function renderFoot() {
    if (!footEl) return;
    footEl.textContent = "";
    footEl.appendChild(hintRow("edit.undo", "Undo"));
    footEl.appendChild(hintRow("edit.redo", "Redo"));
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
    renderFoot();
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

  // js/status-strip/status-strip-view.mjs
  var global3 = globalThis;
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
    /** A second tab has this project open. Standing, not a toast. */
    tabConflict: false
  };
  var detail = "standard";
  var rendered = "";
  function persist() {
    return global3.Persist || null;
  }
  function storedMode() {
    const p = persist();
    try {
      const v = p && typeof p.readStoredStatusStrip === "function" ? p.readStoredStatusStrip() : null;
      if (v === "off" || v === "compact" || v === "standard" || v === "detailed") return v;
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
  function ownStatusDot(owned) {
    const root_ = typeof document !== "undefined" ? document.documentElement : null;
    if (root_) root_.classList.toggle("jar-strip-owns-status", !!owned);
  }
  function unmount() {
    close({ restore: false });
    close2();
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
    segmentHost = null;
    commandHost = null;
    messageEl = null;
    mounted = false;
    rendered = "";
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
    const ed = global3.BelEditor;
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
      { d: "M1.36 6.84 2.85 2.28 6.05 5.84Z", fill: true }
    ]
  };
  function iconEl(name) {
    const parts = ICONS[name];
    if (!parts) return null;
    const NS = "http://www.w3.org/2000/svg";
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
        p.setAttribute("stroke-width", "1.5");
        p.setAttribute("stroke-linecap", "round");
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
    el.className = "jar-strip__seg jar-strip__seg--" + seg.key + (seg.tone ? " is-" + seg.tone : "") + (seg.mono ? " is-mono" : "") + (seg.dot ? " is-dot" : "") + (seg.grow ? " is-grow" : "") + (seg.hint ? " is-hint" : "");
    if (seg.action) {
      el.type = "button";
      el.dataset.action = seg.action;
    }
    if (seg.title) {
      el.setAttribute("data-tooltip", seg.title);
      el.setAttribute("aria-label", seg.title);
      global3.Tooltips?.bind?.(el);
    }
    if (seg.pressed != null) el.setAttribute("aria-expanded", seg.pressed ? "true" : "false");
    if (seg.pressed) el.classList.add("is-open");
    if (seg.dot) el.appendChild(statusDot());
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
    const label = document.createElement("span");
    label.className = "jar-strip__label";
    if (seg.render === "type") renderType(label, seg.text);
    else label.textContent = seg.text || "";
    el.appendChild(label);
    return el;
  }
  var ACTIONS = {
    "focus-editor": () => global3.CurrentEditor?.focus?.(),
    "goto-line": () => global3.CommandPalette?.open({ mode: "line" }),
    "commands": () => global3.CommandPalette?.open({ mode: "commands" }),
    "next-problem": () => global3.Commands?.run("nav.next-problem"),
    "run-default": () => global3.Commands?.run("run.default") || global3.Commands?.run("run.file"),
    "next-hole": () => global3.Commands?.run("nav.next-hole"),
    "open-harpoon": () => global3.Commands?.run("prover.open-in-harpoon") || global3.Commands?.run("view.harpoon"),
    "run": () => global3.Commands?.run("run.file"),
    "edit-history": () => openHistory(),
    /**
     * Stop the recording, then hand the keyboard straight back.
     *
     * ⛔ `dropTrailing: 0`. The number is how many KEYSTROKES asked for the stop,
     * because the recorder sits on capture and has already seen them — a click is
     * none, and the default of 1 would eat the last key of the macro.
     */
    "macro-stop": () => {
      global3.Commands?.run("macro.record", { dropTrailing: 0 });
      global3.CurrentEditor?.focus?.();
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
    const H = global3.EditHistory;
    setEditorState({
      undoDepth: H && H.getUndoStack ? H.getUndoStack().length : 0,
      redoDepth: H && H.getRedoStack ? H.getRedoStack().length : 0,
      historyOpen: isOpen2()
    });
  }
  function paint() {
    frame = 0;
    if (!mounted) return;
    const host2 = ensureRoot();
    if (!host2) return;
    const segments = buildSegments(state, detail);
    const signature = segments.map((s) => s.key + ":" + s.text + ":" + s.tone + ":" + (s.pressed ? "1" : "") + ":" + (s.title || "")).join("|");
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
    if (!mounted) {
      detail = "standard";
      mounted = true;
      if (!ensureRoot()) {
        mounted = false;
        return false;
      }
      ownStatusDot(true);
      paint();
    }
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
      "tabConflict"
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
    const ed = global3.CurrentEditor;
    if (!ed || typeof ed.holeAtCursor !== "function") return "";
    try {
      const hit = ed.holeAtCursor();
      const goal = hit && hit.hole ? hit.hole.goal : null;
      if (!goal) return "";
      const norm = global3.BelEditor && typeof global3.BelEditor.normalizeType === "function" ? global3.BelEditor.normalizeType(String(goal)) : String(goal);
      return norm;
    } catch (_) {
      return "";
    }
  }
  function seedFromEditor() {
    const ed = global3.CurrentEditor;
    const view = ed && typeof ed.getView === "function" ? ed.getView() : null;
    if (!view) {
      setEditorState({ hasFile: false, line: NaN, col: NaN, selChars: 0, selLines: 0, goal: "" });
      return;
    }
    const sel = view.state.selection.main;
    const doc = view.state.doc;
    const head = doc.lineAt(sel.head);
    const selChars = Math.abs(sel.to - sel.from);
    const p = persist();
    setEditorState({
      style: p && typeof p.readStoredKeymapStyle === "function" ? p.readStoredKeymapStyle() : "default",
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
    const mode = storedMode();
    detail = mode === "off" ? "standard" : mode;
    if (mode === "off") {
      unmount();
      ownStatusDot(false);
      return;
    }
    mounted = true;
    if (!ensureRoot()) {
      mounted = false;
      ownStatusDot(false);
      return;
    }
    ownStatusDot(true);
    rendered = "";
    root.classList.remove("is-vim-line", "is-line-open");
    root.dataset.detail = detail;
    seedFromEditor();
    refreshProofState();
    syncHistory();
    paint();
  }
  function refreshProofState() {
    const ed = global3.CurrentEditor;
    if (!ed) {
      setEditorState({ holes: 0, symbols: NaN, goal: "", inHole: false, goalPending: false });
      return;
    }
    let holes = 0;
    let symbols = NaN;
    let goalState = { inHole: false, goal: "", goalPending: false };
    try {
      goalState = global3.BelEditor?.goalAtCaret?.() || goalState;
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
    setEditorState({
      holes,
      symbols,
      goal: goalState.goal,
      inHole: goalState.inHole,
      goalPending: !!goalState.goalPending
    });
    setDiagnostics({ errors: state.errors, warnings: state.warnings, checking, parsePercent });
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
    runAction(btn.dataset.action);
  }
  function init() {
    if (inited || typeof document === "undefined") return;
    inited = true;
    global3.addEventListener("beljar:hole-goals-updated", refreshProofState);
    global3.addEventListener("beljar:file-lint", onLint);
    global3.addEventListener("beljar:keybindings-changed", apply);
    document.addEventListener("click", onClick, true);
    apply();
  }
  global3.StatusStrip = {
    init,
    apply,
    setEditorState,
    setDiagnostics,
    storedMode,
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
      if (!mounted) {
        detail = storedMode() === "off" ? "standard" : storedMode();
        mounted = true;
        if (!ensureRoot()) {
          mounted = false;
          return false;
        }
        ownStatusDot(true);
        paint();
      }
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
    isMounted: () => mounted,
    element: () => root,
    _pure: { buildSegments, isResting }
  };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
