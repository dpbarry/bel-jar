(() => {
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
  function lowerFirst(text) {
    const t = String(text || "");
    return t.charAt(0).toLowerCase() + t.slice(1);
  }
  function settingId(slug) {
    return "set." + slug;
  }
  function settingEntries() {
    return SETTINGS.map((s) => ({
      id: settingId(s.slug),
      title: (s.kind === "bool" ? "Toggle " : "Cycle ") + lowerFirst(s.verb || s.title),
      section: "Settings",
      scope: "global",
      keybindable: true,
      palette: true
    }));
  }
  function optionNames() {
    const out = [];
    for (const s of SETTINGS) {
      out.push(s.slug);
      for (const a of s.aliases || []) out.push(a);
    }
    return out;
  }
  function optionCandidates() {
    const out = [];
    for (const s of SETTINGS) {
      out.push({ value: s.slug, label: s.title });
      for (const a of s.aliases || []) out.push({ value: a, label: s.title });
    }
    return out;
  }
  function findSetting(name) {
    const key = String(name == null ? "" : name).toLowerCase();
    if (!key) return null;
    const bare = key.startsWith("set.") ? key.slice(4) : key;
    return SETTINGS.find((s) => s.slug === bare) || SETTINGS.find((s) => (s.aliases || []).indexOf(bare) >= 0) || null;
  }
  function nextValue(spec, current, requested) {
    if (!spec) return null;
    if (spec.kind === "bool") {
      if (requested === true || requested === false) return requested;
      if (requested == null || requested === "") return !current;
      const word = String(requested).toLowerCase();
      if (["on", "true", "yes", "1"].indexOf(word) >= 0) return true;
      if (["off", "false", "no", "0"].indexOf(word) >= 0) return false;
      return null;
    }
    const values = spec.values || [];
    if (requested === true) return spec.on === void 0 ? null : spec.on;
    if (requested === false) return spec.off === void 0 ? null : spec.off;
    if (requested != null && requested !== "") {
      const wanted = values.find((v) => String(v) === String(requested));
      return wanted === void 0 ? null : wanted;
    }
    const at = values.findIndex((v) => String(v) === String(current));
    return values[(at + 1) % values.length];
  }
  function nearestSetting(name) {
    const lower = String(name || "").toLowerCase();
    if (!lower) return null;
    let best = null;
    let bestLen = 0;
    for (const n of optionNames()) {
      let i = 0;
      while (i < n.length && i < lower.length && n[i] === lower[i]) i += 1;
      if (i > bestLen || i === bestLen && best && n.length > best.length) {
        best = n;
        bestLen = i;
      }
    }
    return bestLen >= 2 ? best : null;
  }
  function parseSet(raw) {
    const text = String(raw == null ? "" : raw).trim();
    if (!text) return { error: "usage" };
    const eq = text.indexOf("=");
    const value = eq >= 0 ? text.slice(eq + 1).trim() : null;
    let name = (eq >= 0 ? text.slice(0, eq) : text).trim().toLowerCase();
    let toggle = false;
    if (name.endsWith("!")) {
      name = name.slice(0, -1);
      toggle = true;
    }
    let negated = false;
    if (!findSetting(name) && name.startsWith("no") && findSetting(name.slice(2))) {
      name = name.slice(2);
      negated = true;
    }
    const spec = findSetting(name);
    if (!spec) return { error: "unknown", name, near: nearestSetting(name) };
    if (value != null && value !== "" && spec.kind === "enum" && !(spec.values || []).some((v) => String(v) === String(value))) {
      return { error: "value", name, spec, value };
    }
    if (negated && spec.kind === "enum" && spec.off === void 0) {
      return { error: "not-boolean", name, spec };
    }
    let requested;
    if (value != null && value !== "") requested = value;
    else if (negated) requested = false;
    else if (toggle) requested = void 0;
    else if (spec.kind === "bool" || spec.on !== void 0) requested = true;
    else requested = void 0;
    return { spec, requested };
  }
  function describeChange(spec, value) {
    if (value === true) return spec.title + " on";
    if (value === false) return spec.title + " off";
    const labels = spec.labels || {};
    return spec.title + ": " + (labels[value] != null ? labels[value] : String(value));
  }

  // js/commands/command-catalog.mjs
  var CATALOG = [
    // ── File ───────────────────────────────────────────────────────────────────
    { id: "project.new", title: "New Project\u2026", section: "File", scope: "global", palette: true },
    { id: "file.new", title: "New file\u2026", section: "File", scope: "global", palette: true },
    { id: "file.upload", title: "Upload File", section: "File", scope: "global", palette: true },
    { id: "file.upload-folder", title: "Upload Folder", section: "File", scope: "global", palette: true },
    { id: "file.import-folder", title: "Import Folder as New Project", section: "File", scope: "global", palette: true },
    { id: "file.download", title: "Download Current File", section: "File", scope: "global", palette: true },
    { id: "tab.next", title: "Next Tab", section: "File", scope: "global", palette: true, keybindable: true, ex: ["bn"] },
    { id: "tab.prev", title: "Previous Tab", section: "File", scope: "global", palette: true, keybindable: true, ex: ["bp"] },
    { id: "tab.close", title: "Close Tab", section: "File", scope: "global", palette: true, keybindable: true },
    { id: "tab.close-others", title: "Close Other Tabs", section: "File", scope: "global", palette: true, keybindable: true },
    { id: "tab.close-right", title: "Close Tabs to the Right", section: "File", scope: "global", palette: true, keybindable: true },
    // `:w`. BelJar autosaves, so this is "commit it NOW" — including the
    // format-on-save and trim-trailing-whitespace transforms, which otherwise
    // wait for the debounce. `:wa` is the same act: there is one live buffer, so
    // a separate save-all would be a second name for one thing.
    {
      id: "file.save",
      title: "Save Now",
      section: "File",
      scope: "global",
      palette: true,
      keybindable: true,
      ex: ["w", "write", "wa", "wall"],
      styles: { vim: "always" }
    },
    // `:e util.bel` — open a project file by name, with completion. Opening one
    // that is already open just focuses its tab, which is what `:b` would do.
    {
      id: "file.open",
      title: "Open File",
      section: "File",
      scope: "global",
      palette: false,
      keybindable: false,
      ex: ["e", "edit"],
      args: [{ kind: "file", label: "file" }]
    },
    // Suite membership for the current file. Gated on the file's directory having
    // exactly ONE active suite: with two, the answer is a question, and a command
    // that guesses would be rewriting a .cfg on the user's behalf.
    {
      id: "suite.add-file",
      title: "Add to Suite",
      section: "File",
      scope: "global",
      palette: true,
      keybindable: true
    },
    {
      id: "suite.remove-file",
      title: "Remove from Suite",
      section: "File",
      scope: "global",
      palette: true,
      keybindable: true
    },
    // ── Edit ───────────────────────────────────────────────────────────────────
    {
      id: "edit.undo",
      title: "Undo",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+Z",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only" }
    },
    {
      id: "edit.redo",
      title: "Redo",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+Y",
      macDefaultSpec: "Mod+Shift+Z",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    {
      id: "edit.find",
      title: "Find\u2026",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+F",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    {
      id: "edit.search-project",
      title: "Search in Project\u2026",
      section: "Edit",
      scope: "global",
      defaultSpec: "Mod+Shift+F",
      keybindable: true,
      palette: true
    },
    {
      id: "edit.toggle-comment",
      title: "Toggle Line Comment",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+/",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    {
      id: "edit.format",
      title: "Format Document",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Alt+Shift+F",
      keybindable: true,
      palette: true,
      ex: ["fmt", "format"],
      styles: { vim: "always" }
    },
    {
      id: "edit.rename",
      title: "Rename Symbol",
      section: "Edit",
      scope: "editor",
      defaultSpec: "F2",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "edit.select-all",
      title: "Select All",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+A",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    {
      // Chord-only: "show me completions" is meaningless from a palette you had
      // to open with the keyboard anyway.
      id: "edit.autocomplete",
      title: "Show Autocomplete",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Control+Space",
      keybindable: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    { id: "edit.delete-line", title: "Delete Line", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.move-line-up", title: "Move Line Up", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.move-line-down", title: "Move Line Down", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.duplicate-line", title: "Duplicate Line", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.duplicate-line-up", title: "Duplicate Line Up", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.indent", title: "Indent", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.dedent", title: "Dedent", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.reindent", title: "Reindent Selection", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.transpose-chars", title: "Transpose Characters", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.split-line", title: "Split Line", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.blank-line", title: "Insert Blank Line", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.trim-whitespace", title: "Trim Trailing Whitespace", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    // ── Motion ─────────────────────────────────────────────────────────────────
    // Bindable, but in NEITHER the palette nor the command line: nobody searches
    // a command list for "move left", and `:motion-char-left` is not a thing
    // anyone types. They exist so "bind anything" is true — `cmdline: false` is what
    // keeps 31 of them out of the line's completion.
    //
    // ⛔ This is the only section that turns the flag off, and the reason it
    // exists. Anything else added here must earn the same argument.
    { id: "motion.char-left", title: "Move Left", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.char-right", title: "Move Right", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.word-left", title: "Move Word Left", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.word-right", title: "Move Word Right", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.line-up", title: "Move Up", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.line-down", title: "Move Down", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.line-start", title: "Move to Line Start", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.line-end", title: "Move to Line End", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.doc-start", title: "Move to Start of File", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.doc-end", title: "Move to End of File", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.page-up", title: "Move Page Up", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.page-down", title: "Move Page Down", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.match-bracket", title: "Move to Matching Bracket", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.syntax-left", title: "Move by Syntax Left", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.syntax-right", title: "Move by Syntax Right", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.char-left", title: "Select Left", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.char-right", title: "Select Right", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.word-left", title: "Select Word Left", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.word-right", title: "Select Word Right", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.line-up", title: "Select Up", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.line-down", title: "Select Down", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.line-start", title: "Select to Line Start", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.line-end", title: "Select to Line End", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.doc-start", title: "Select to Start of File", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.doc-end", title: "Select to End of File", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.page-up", title: "Select Page Up", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.page-down", title: "Select Page Down", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.match-bracket", title: "Select to Matching Bracket", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.line", title: "Select Line", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.parent-syntax", title: "Select Enclosing Syntax", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.collapse", title: "Collapse Selection", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    // ── Navigate ───────────────────────────────────────────────────────────────
    {
      id: "nav.symbol",
      title: "Go to Symbol\u2026",
      section: "Navigate",
      scope: "global",
      defaultSpec: "Mod+Shift+O",
      keybindable: true,
      palette: true,
      ex: ["sym"]
    },
    {
      id: "nav.anywhere",
      title: "Go to File\u2026",
      section: "Navigate",
      scope: "global",
      defaultSpec: "Mod+K",
      keybindable: true,
      styles: { emacs: "yield" }
    },
    {
      id: "nav.definition",
      title: "Go to Definition",
      section: "Navigate",
      scope: "editor",
      defaultSpec: "F12",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.references",
      title: "Find References",
      section: "Navigate",
      scope: "editor",
      defaultSpec: "Shift+F12",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.enclosing-decl",
      title: "Go to Enclosing Declaration",
      section: "Navigate",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.binder",
      title: "Go to Binder",
      section: "Navigate",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.inspector",
      title: "Reveal in Inspector",
      section: "Navigate",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    // Structure motions: a Beluga file is declarations containing case branches,
    // so `]d` and `]c` are the two that matter.
    { id: "nav.next-decl", title: "Go to Next Declaration", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    { id: "nav.prev-decl", title: "Go to Previous Declaration", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    { id: "nav.next-case", title: "Go to Next Case Branch", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    { id: "nav.prev-case", title: "Go to Previous Case Branch", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    // The jump list. Everything above jumps; these are the way back.
    { id: "nav.jump-back", title: "Jump Back", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    { id: "nav.jump-forward", title: "Jump Forward", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    {
      id: "nav.next-hole",
      title: "Go to Next Hole",
      section: "Navigate",
      scope: "editor",
      defaultSpec: "F8",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.prev-hole",
      title: "Go to Previous Hole",
      section: "Navigate",
      scope: "editor",
      defaultSpec: "Shift+F8",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.next-problem",
      title: "Go to Next Problem",
      section: "Navigate",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.prev-problem",
      title: "Go to Previous Problem",
      section: "Navigate",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    // ── Prover ─────────────────────────────────────────────────────────────────
    // Everything here is gated on the caret standing in a hole, so the palette
    // stays quiet unless there is actually a goal under the cursor.
    {
      id: "prover.hole-intro",
      title: "Intro at Hole",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "prover.hole-split",
      title: "Split at Hole",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "prover.hole-fill",
      title: "Fill Hole",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "prover.open-in-harpoon",
      title: "Open Hole in Harpoon",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      ex: ["harpoon"],
      styles: { vim: "always" }
    },
    // Reading the proof state, from the editor. Not gated on standing IN a hole:
    // "how many are left" is a question you ask from anywhere in the file.
    {
      id: "prover.count-holes",
      title: "Count Holes",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      ex: ["holes"],
      styles: { vim: "always" }
    },
    {
      id: "prover.goal-at-cursor",
      title: "Show Goal at Cursor",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      ex: ["goal"],
      styles: { vim: "always" }
    },
    // Driving the Harpoon lab itself. `when()` resolves the session the user is
    // looking at (`Harpoon.activeSession`), so with no lab open these vanish from
    // the palette rather than reporting a failure.
    {
      id: "harpoon.next-goal",
      title: "Next Goal",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "harpoon.prev-goal",
      title: "Previous Goal",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "harpoon.undo-move",
      title: "Undo Proof Move",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "harpoon.redo-move",
      title: "Redo Proof Move",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "harpoon.orca-start",
      title: "Run Orca",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      ex: ["orca"],
      styles: { vim: "always" }
    },
    {
      id: "harpoon.orca-pause",
      title: "Pause Orca",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "harpoon.orca-absorb",
      title: "Take Over from Orca",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    // ── Run ────────────────────────────────────────────────────────────────────
    // What the Run button does: a suite member runs the suite up to and including
    // itself; an isolated file runs alone. The status segment uses this so it can
    // never be a weaker Run than the button beside it.
    { id: "run.default", title: "Run", section: "Run", scope: "global", palette: true, keybindable: true },
    { id: "run.file", title: "Run File", section: "Run", scope: "global", palette: true, keybindable: true, ex: ["run"] },
    { id: "run.here", title: "Run Suite to Here", section: "Run", scope: "global", palette: true, keybindable: true },
    { id: "run.module", title: "Run Suite", section: "Run", scope: "global", palette: true, keybindable: true, ex: ["runs"] },
    { id: "run.project", title: "Run Project", section: "Run", scope: "global", palette: true, keybindable: true, ex: ["runp"] },
    { id: "run.clear-output", title: "Clear Output", section: "Run", scope: "global", palette: true, keybindable: true },
    // ── View ───────────────────────────────────────────────────────────────────
    { id: "view.theme", title: "Toggle Theme", section: "View", scope: "global", palette: true, keybindable: true },
    { id: "view.explorer", title: "Toggle Explorer", section: "View", scope: "global", palette: true, keybindable: true },
    { id: "view.library", title: "Toggle Library", section: "View", scope: "global", palette: true, keybindable: true },
    { id: "view.harpoon", title: "Toggle Harpoon", section: "View", scope: "global", palette: true, keybindable: true },
    // The `⟲` widget in the status strip is the same panel; a surface you can only
    // reach by clicking is one the palette and the `:` line cannot offer.
    { id: "view.edit-history", title: "Toggle Edit History", section: "View", scope: "global", palette: true, keybindable: true, ex: ["undolist"] },
    { id: "view.settings", title: "Open Settings\u2026", section: "View", scope: "global", palette: true, keybindable: true },
    { id: "fold.all", title: "Fold All", section: "View", scope: "editor", palette: true, keybindable: true },
    { id: "fold.unfold-all", title: "Unfold All", section: "View", scope: "editor", palette: true, keybindable: true },
    // ── Settings ───────────────────────────────────────────────────────────────
    // Generated from `command-settings.mjs`: one declaration behind the palette
    // row, the bindable chord and Vim's `:set`.
    ...settingEntries(),
    // The line's way in. Not in the palette: without an argument it does nothing,
    // and each preference already has its own palette row above.
    {
      id: "settings.set",
      title: "Set Option",
      section: "Settings",
      scope: "global",
      palette: false,
      keybindable: false,
      ex: ["set", "se"],
      args: [{ kind: "option", label: "option" }]
    },
    // ── Tools ──────────────────────────────────────────────────────────────────
    // Not keybindable: `nav.anywhere` owns Mod+K. The literal `shortcut` is the
    // palette's own display fallback for an entry with no chord of its own.
    // Fullscreen + `navigator.keyboard.lock()`. Measured by hand: under lock the
    // ten reserved chords reach the page AND their browser actions do not fire.
    { id: "keys.full-keyboard", title: "Toggle Full Keyboard", section: "Tools", scope: "global", palette: true, keybindable: true, ex: ["fullkeys"] },
    // Generated from `describe()`, so it is the keymap rather than a copy of it.
    // `keys.show-chords` from the original Wave G list folded in here: one sheet
    // that answers "what can I press" beats two that answer half each.
    { id: "keys.macros", title: "Available Macros\u2026", section: "Tools", scope: "global", palette: true, keybindable: true, ex: ["help", "macros"] },
    { id: "cmdline.repeat", title: "Repeat Last Command", section: "Tools", scope: "global", palette: true, keybindable: true },
    { id: "cmdline.open", title: "Command Line", section: "Tools", scope: "global", palette: true, keybindable: true },
    { id: "tools.palette", title: "Open Command Palette", section: "Tools", scope: "global", palette: true, shortcut: "Mod+K" },
    { id: "tools.graph", title: "Open Dependency Graph", section: "Tools", scope: "global", palette: true, keybindable: true, ex: ["graph"] },
    { id: "tools.inspector", title: "Open Inspector", section: "Tools", scope: "global", palette: true, keybindable: true },
    {
      id: "tools.commands",
      title: "Run Command\u2026",
      section: "Tools",
      scope: "global",
      // ⛔ NOT `Mod+Shift+P`. That was the shipped chord until `scripts/chord-audit.html`
      // measured Chrome on Windows taking it before the page ever sees it — a
      // default that simply did nothing for half our users. `Alt+X` was measured
      // arriving, and it reads as "execute a command" to anyone who has met M-x.
      defaultSpec: "Alt+X",
      // ⚠ Alt is Option on a Mac and composes characters — Option+X types "≈", so
      // the Windows chord cannot carry over. Cmd+Shift+P is free there (Chrome's
      // incognito chord is Cmd+Shift+N) and is what every editor uses anyway.
      macDefaultSpec: "Mod+Shift+P",
      keybindable: true,
      // …which is exactly what Emacs binds it to, so Emacs' own M-x wins there.
      styles: { emacs: "off" }
    }
  ];

  // js/commands/command-shadows.mjs
  var STYLE_TAKES = {
    emacs: [
      { spec: "Mod+F", key: "C-f", runs: "forward-char" },
      // ⛔ Not a no-op: the package binds `C-x C-p|C-x h` to selectAll, and
      // `probe-keymap.mjs` measures it selecting the whole document. A remembered
      // claim about a dependency once told Emacs users a working chord did not
      // exist. Read the package's key table, do not recall it.
      { spec: "Mod+A", key: "C-a", runs: "move-beginning-of-line" },
      { spec: "Control+Space", key: "C-Space", runs: "set-mark-command" },
      { spec: "Mod+Y", key: "C-y", runs: "yank" },
      { spec: "Mod+/", key: "C-/", runs: "undo" },
      { spec: "Mod+K", key: "C-k", runs: "kill-line" },
      // ⛔ `M-x` IS Run Command — Emacs reaches the same command through its own
      // binding. `sameCommand` stops it reading as a loss, because nothing is lost.
      { spec: "Alt+X", key: "M-x", runs: "execute-extended-command", sameCommand: "tools.commands" }
    ],
    // Vim takes no chord for itself: what it does is make BelJar's chords
    // Insert-only, which is a MODE caveat and carries its own tag.
    vim: []
  };
  var INSERT_ALTERNATIVE = {
    vim: {
      "edit.undo": "u",
      "edit.redo": "C-r",
      "edit.find": "/"
    }
  };
  var STYLE_CHORDS = {
    emacs: {
      "edit.find": "C-s",
      "edit.select-all": "C-x h",
      "edit.redo": "C-S-z",
      "tools.commands": "M-x",
      "nav.anywhere": "C-x C-f"
    },
    vim: {}
  };
  var STYLE_NAME = { emacs: "Emacs", vim: "Vim" };
  function readableStyleChord(keys) {
    const raw = String(keys == null ? "" : keys).trim();
    if (!raw) return "";
    if (raw.indexOf(" ") >= 0) return raw.split(/\s+/).map(readableStyleChord).join(" ");
    if (raw.indexOf("-") < 0) return raw.length === 1 ? raw.toUpperCase() : raw;
    const parts = raw.split("-");
    const last = parts.pop();
    const mods = parts.map((p) => ({ C: "Ctrl", S: "Shift", M: "Alt" })[p] || p);
    const rank = { Ctrl: 0, Alt: 1, Shift: 2 };
    mods.sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9));
    const name = last === "Space" ? "Space" : last.length === 1 ? last.toUpperCase() : last;
    return mods.concat([name]).join("+");
  }
  function specFromStyleKey(key) {
    const raw = String(key == null ? "" : key).trim();
    if (!raw || /\s/.test(raw)) return "";
    const sep = raw.indexOf("-") >= 0 ? "-" : "+";
    const parts = raw.split(sep);
    const last = parts.pop();
    if (!last) return "";
    const mods = { Mod: false, Alt: false, Shift: false };
    for (const part of parts) {
      if (part === "C" || part === "Ctrl" || part === "Mod") mods.Mod = true;
      else if (part === "M" || part === "Alt") mods.Alt = true;
      else if (part === "S" || part === "Shift") mods.Shift = true;
      else return "";
    }
    if (!mods.Mod && !mods.Alt && !mods.Shift) return "";
    const out = [];
    if (mods.Mod) out.push("Mod");
    if (mods.Alt) out.push("Alt");
    if (mods.Shift) out.push("Shift");
    out.push(last.length === 1 ? last.toUpperCase() : last);
    return out.join("+");
  }
  function takesChord(style, spec) {
    if (!spec) return null;
    const table = STYLE_TAKES[style] || [];
    for (const entry of table) {
      if (entry.spec === spec) return entry;
    }
    return null;
  }
  function chordShadow(opts) {
    const style = opts.style;
    if (!STYLE_NAME[style]) return null;
    const name = STYLE_NAME[style];
    if (opts.policy === "insert-only") {
      const instead = (INSERT_ALTERNATIVE[style] || {})[opts.commandId] || "";
      return {
        kind: "insert",
        tag: "insert",
        instead,
        tip: instead ? `Only while you are typing. In Normal mode, press ${instead}.` : `Only while you are typing, not in ${name}'s Normal mode.`
      };
    }
    const spec = opts.spec || "";
    const label = opts.label || spec;
    const taken = takesChord(style, spec);
    if (taken && taken.sameCommand !== opts.commandId) {
      return {
        kind: "shadowed",
        tag: "shadowed",
        key: taken.key,
        runs: taken.runs,
        // ⛔ A statement about the CHORD, naming both claimants. Never "without
        // Emacs this command would be…" — that describes a world you are not in.
        tip: `${name} uses ${label} for ${taken.runs}.`
      };
    }
    if (!opts.fromStyle) return null;
    const owner = typeof opts.baseOwnerOf === "function" ? opts.baseOwnerOf(spec) : null;
    if (owner && owner.id !== opts.commandId) {
      return {
        kind: "shadowing",
        tag: "shadowing",
        owner: owner.id,
        tip: `${name} uses ${label} here. In Standard, ${label} is ${owner.title}.`
      };
    }
    return null;
  }

  // js/commands/command-names.mjs
  var MX_PREFIX = "beljar-";
  function mxNameFor(id, explicit) {
    if (explicit) return String(explicit);
    const slug = String(id == null ? "" : id).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug ? MX_PREFIX + slug : "";
  }
  function exNamesFor(ex) {
    const raw = ex == null ? [] : Array.isArray(ex) ? ex : [ex];
    const out = [];
    for (const name of raw) {
      const clean = String(name == null ? "" : name).trim().replace(/^:+/, "");
      if (clean && out.indexOf(clean) < 0) out.push(clean);
    }
    return out;
  }
  function titleFor(id, explicit) {
    if (explicit) return String(explicit);
    const tail = String(id == null ? "" : id).split(".").pop() || "";
    const words = tail.replace(/[-_]+/g, " ").trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : String(id || "");
  }

  // js/commands/command-registry.mjs
  var global = globalThis;
  var POLICIES = ["off", "yield", "insert-only", "always"];
  var DEFAULT_POLICY = "always";
  var order = [];
  var byId = /* @__PURE__ */ Object.create(null);
  var version = 0;
  function normalize(record) {
    const id = String(record.id);
    return Object.assign({}, record, {
      id,
      title: titleFor(id, record.title),
      section: record.section || "",
      scope: record.scope || "global",
      keybindable: !!record.keybindable,
      palette: !!record.palette,
      cmdline: record.cmdline === false ? false : true,
      ex: exNamesFor(record.ex),
      mx: mxNameFor(id, record.mx),
      styles: record.styles || null
    });
  }
  function define(desc) {
    if (!desc || typeof desc !== "object") return false;
    const id = desc.id == null ? "" : String(desc.id);
    if (!id) return false;
    const prev = byId[id];
    if (!prev) order.push(id);
    byId[id] = normalize(Object.assign({}, prev || {}, desc, { id }));
    version += 1;
    return true;
  }
  function defineAll(list2) {
    if (!Array.isArray(list2)) return 0;
    let n = 0;
    for (const desc of list2) if (define(desc)) n += 1;
    return n;
  }
  function attach(id, behaviour) {
    if (!id || !behaviour) return false;
    const patch = { id: String(id) };
    if (typeof behaviour.run === "function") patch.run = behaviour.run;
    if (typeof behaviour.when === "function") patch.when = behaviour.when;
    if (typeof behaviour.preview === "function") patch.preview = behaviour.preview;
    return define(patch);
  }
  function unregister(id) {
    const key = String(id == null ? "" : id);
    if (!byId[key]) return false;
    delete byId[key];
    const at = order.indexOf(key);
    if (at >= 0) order.splice(at, 1);
    version += 1;
    return true;
  }
  function get(id) {
    return byId[String(id == null ? "" : id)] || null;
  }
  function has(id) {
    return !!get(id);
  }
  function isAvailable(cmd, ctx) {
    if (!cmd || typeof cmd.when !== "function") return true;
    try {
      return !!cmd.when(ctx);
    } catch (_) {
      return false;
    }
  }
  function list(filter) {
    const f = filter || {};
    const out = [];
    for (const id of order) {
      const cmd = byId[id];
      if (!cmd) continue;
      if (f.palette === true && !cmd.palette) continue;
      if (f.keybindable === true && !cmd.keybindable) continue;
      if (f.cmdline === true && !cmd.cmdline) continue;
      if (f.runnable === true && typeof cmd.run !== "function") continue;
      if (f.scope && cmd.scope !== f.scope) continue;
      if (f.section && cmd.section !== f.section) continue;
      if (f.available === true && !isAvailable(cmd, f.ctx)) continue;
      out.push(cmd);
    }
    return out;
  }
  function idsWithStyle(style, policy) {
    const out = [];
    for (const id of order) {
      const cmd = byId[id];
      if (cmd && cmd.styles && cmd.styles[style] === policy) out.push(id);
    }
    return out;
  }
  function styleFor(id, style) {
    const cmd = get(id);
    if (!cmd || !cmd.styles) return DEFAULT_POLICY;
    const p = cmd.styles[style];
    return POLICIES.indexOf(p) >= 0 ? p : DEFAULT_POLICY;
  }
  function styleChordFor(id, style) {
    return readableStyleChord((STYLE_CHORDS[style] || {})[id] || "");
  }
  function baseOwnerOf(spec, exceptId) {
    const KB = global.Keybindings;
    if (!spec || !KB || typeof KB.findConflict !== "function") return null;
    const id = KB.findConflict(spec, exceptId);
    if (!id) return null;
    const cmd = get(id);
    return cmd ? { id, title: cmd.title } : null;
  }
  function describe(id, opts) {
    const cmd = get(id);
    if (!cmd) return null;
    const o = opts || {};
    const style = o.style || "default";
    const KB = global.Keybindings;
    let spec = "";
    let chord = "";
    if (KB && typeof KB.has === "function" && KB.has(cmd.id)) {
      spec = KB.resolve(cmd.id, o.isMac) || "";
      chord = KB.labelFor(cmd.id, o.isMac) || "";
    } else if (cmd.shortcut && KB && typeof KB.formatShortcut === "function") {
      spec = KB.normalizeSpec ? KB.normalizeSpec(cmd.shortcut) : "";
      chord = KB.formatShortcut(cmd.shortcut, o.isMac) || "";
    }
    const policy = styleFor(cmd.id, style);
    const styleChord = styleChordFor(cmd.id, style);
    const showingStyle = o.showing === "style" && !!styleChord;
    const shownSpec = showingStyle ? specFromStyleKey(styleChord) : spec;
    const shownLabel = showingStyle ? styleChord : chord;
    return {
      id: cmd.id,
      title: cmd.title,
      section: cmd.section,
      scope: cmd.scope,
      chord,
      spec,
      styleChord,
      ex: cmd.ex.slice(),
      mx: cmd.mx,
      keybindable: cmd.keybindable,
      palette: cmd.palette,
      runnable: typeof cmd.run === "function",
      policy,
      availableInStyle: policy !== "off",
      shadow: chordShadow({
        style,
        policy,
        commandId: cmd.id,
        spec: shownSpec,
        label: shownLabel,
        fromStyle: showingStyle,
        baseOwnerOf: (s) => baseOwnerOf(s, cmd.id)
      })
    };
  }
  function defaults() {
    return list({ keybindable: true }).map((c) => ({
      id: c.id,
      title: c.title,
      section: c.section,
      scope: c.scope,
      defaultSpec: c.defaultSpec || "",
      macDefaultSpec: c.macDefaultSpec || ""
    }));
  }
  function run(id, ctx) {
    const cmd = get(id);
    if (!cmd || typeof cmd.run !== "function") return false;
    if (!isAvailable(cmd, ctx)) return false;
    return cmd.run(ctx) !== false;
  }
  defineAll(CATALOG);
  var Commands = {
    define,
    defineAll,
    attach,
    unregister,
    get,
    has,
    list,
    describe,
    defaults,
    run,
    styleFor,
    idsWithStyle,
    // The preference table, so the editor's `:set` resolves through the same
    // source as the palette rows without importing across the bundle seam.
    settings: {
      list: () => SETTINGS.slice(),
      find: findSetting,
      next: nextValue,
      nearest: nearestSetting,
      id: settingId,
      parse: parseSet,
      describe: describeChange,
      candidates: optionCandidates
    },
    /**
     * The tag for an arbitrary chord shown for a command — for surfaces that
     * render a style's OWN maps (`gd`, `C-x C-s`) rather than a catalogue chord.
     *
     * ⛔ One entry point, so nothing else decides when a chord is contested.
     */
    chordShadowFor(opts) {
      const o = opts || {};
      const cmd = get(o.commandId);
      return chordShadow({
        style: o.style,
        policy: "always",
        commandId: o.commandId,
        spec: specFromStyleKey(o.keys),
        label: o.keys,
        // Always: this entry point only ever describes a STYLE's own map.
        fromStyle: true,
        baseOwnerOf: (s) => baseOwnerOf(s, cmd ? cmd.id : null)
      });
    },
    isAvailable,
    version: () => version,
    _pure: { normalize, POLICIES, DEFAULT_POLICY, chordShadow, STYLE_TAKES, STYLE_CHORDS, specFromStyleKey, CATALOG }
  };
  global.Commands = Commands;
})();
