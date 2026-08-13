(() => {
  // js/ui/command-palette.mjs
  var global = globalThis;
  function fuzzyScore(query, text) {
    if (!query) return { score: 0, positions: [] };
    const t = String(text || "");
    const q = query.toLowerCase();
    const tl = t.toLowerCase();
    if (q.length > tl.length) return null;
    let score = 0;
    let prev = -2;
    let from = 0;
    const positions = [];
    for (let qi = 0; qi < q.length; qi++) {
      const idx = tl.indexOf(q[qi], from);
      if (idx < 0) return null;
      let s = 1;
      if (idx === prev + 1) s += 4;
      const before = idx > 0 ? t[idx - 1] : "";
      const isWordStart = idx === 0 || before === " " || before === "-" || before === "_" || before === "." || before === "/" || before === ":";
      const isHump = t[idx] >= "A" && t[idx] <= "Z" && before >= "a" && before <= "z";
      if (isWordStart || isHump) s += 6;
      score += s;
      positions.push(idx);
      prev = idx;
      from = idx + 1;
    }
    const spread = positions[positions.length - 1] - positions[0] - (q.length - 1);
    score -= Math.floor(spread * 0.5);
    if (positions[0] === 0) score += 3;
    return { score, positions };
  }
  function substringPositions(query, text) {
    if (!query) return null;
    const t = String(text || "");
    const q = String(query);
    const idx = t.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return null;
    const positions = [];
    for (let i = 0; i < q.length; i++) positions.push(idx + i);
    return positions;
  }
  function parseInput(raw) {
    const s = String(raw || "");
    if (s.startsWith(">")) return { mode: "commands", query: s.slice(1).trim() };
    if (s.startsWith("@")) return { mode: "symbols", query: s.slice(1).trim() };
    if (s.startsWith("%")) return { mode: "search", query: s.slice(1).trim() };
    if (s.startsWith("#")) {
      return { mode: "search", query: s.slice(1).trim(), legacyHash: true };
    }
    if (s.startsWith(":")) return { mode: "line", query: s.slice(1).trim() };
    if (s.startsWith("!")) return { mode: "problems", query: s.slice(1).trim() };
    if (s.startsWith("/")) return { mode: "library", query: s.slice(1).trim() };
    if (s.startsWith("?")) return { mode: "help", query: s.slice(1).trim() };
    return { mode: "anywhere", query: s.trim() };
  }
  function rankItems(items, query, limit) {
    const cap = limit || 50;
    if (!query) {
      return items.slice(0, cap).map((item) => ({ ...item, _match: null }));
    }
    const scored = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const onTitle = fuzzyScore(query, item.title);
      if (onTitle) {
        scored.push({ item, score: onTitle.score, positions: onTitle.positions, index: i });
        continue;
      }
      if (item.detail) {
        const onDetail = fuzzyScore(query, item.detail);
        if (onDetail) scored.push({ item, score: onDetail.score * 0.5, positions: null, index: i });
      }
    }
    scored.sort((a, b) => b.score - a.score || a.index - b.index);
    return scored.slice(0, cap).map((s) => ({ ...s.item, _match: s.positions }));
  }
  function formatShortcutPart(part, isMac) {
    if (part === "Mod") return isMac ? "\u2318" : "Ctrl";
    if (part === "Shift") return isMac ? "\u21E7" : "Shift";
    if (part === "Alt") return isMac ? "\u2325" : "Alt";
    return part;
  }
  function shortcutParts(spec, isMac) {
    if (!spec) return [];
    return String(spec).split("+").map((part) => formatShortcutPart(part, isMac));
  }
  function formatShortcut(spec, isMac) {
    if (!spec) return "";
    const parts = shortcutParts(spec, isMac);
    return parts.join(isMac ? "" : "+");
  }
  function parseLineQuery(query) {
    const m = String(query || "").match(/^(\d+)(?::(\d+))?$/);
    if (!m) return null;
    const line = parseInt(m[1], 10);
    const col = m[2] != null ? parseInt(m[2], 10) : 1;
    if (!Number.isFinite(line) || line < 1) return null;
    return { line, col: Number.isFinite(col) && col >= 1 ? col : 1 };
  }
  var HELP_CATALOG = [
    { title: "Anywhere", detail: "Go to files & symbols", prefix: "", shortcut: "Mod+K" },
    { title: "Commands", detail: "Run a command", prefix: ">", shortcut: "Mod+Shift+P" },
    { title: "Symbols", detail: "Go to symbol", prefix: "@", shortcut: "Mod+Shift+O" },
    { title: "Search project", detail: "Find text across files", prefix: "%", shortcut: "Mod+Shift+F" },
    { title: "Go to line", detail: "Jump to line[:column]", prefix: ":" },
    { title: "Problems", detail: "Errors & warnings", prefix: "!" },
    { title: "Library", detail: "Browse library samples", prefix: "/" },
    { title: "Help", detail: "This mode list", prefix: "?" }
  ];
  var MODE_META = {
    anywhere: { label: "Anywhere", placeholder: "Go to file/symbol or change mode\u2026" },
    commands: { label: "Commands", placeholder: "Type a command\u2026" },
    symbols: { label: "Symbols", placeholder: "Go to symbol\u2026" },
    search: { label: "Search", placeholder: "Search project text\u2026" },
    line: { label: "Line", placeholder: "Line number, or line:column\u2026" },
    problems: { label: "Problems", placeholder: "Filter errors & warnings\u2026" },
    library: { label: "Library", placeholder: "Search library samples\u2026" },
    help: { label: "Help", placeholder: "Filter modes\u2026" }
  };
  var MODE_PREFIX = {
    anywhere: "",
    commands: ">",
    symbols: "@",
    search: "%",
    line: ":",
    problems: "!",
    library: "/",
    help: "?"
  };
  var PROVIDER_KINDS = ["files", "symbols", "search", "problems", "library"];
  var commands = [];
  var providers = /* @__PURE__ */ Object.create(null);
  for (const k of PROVIDER_KINDS) providers[k] = null;
  function register(cmd) {
    if (!cmd || !cmd.id || typeof cmd.run !== "function") return;
    const at = commands.findIndex((c) => c.id === cmd.id);
    if (at >= 0) commands[at] = cmd;
    else commands.push(cmd);
  }
  function unregister(id) {
    const at = commands.findIndex((c) => c.id === id);
    if (at >= 0) commands.splice(at, 1);
  }
  function setProvider(kind, fn) {
    if (PROVIDER_KINDS.indexOf(kind) < 0) return;
    providers[kind] = fn;
  }
  function activeCommands() {
    return commands.filter((c) => !c.when || safeWhen(c));
  }
  function listCommands() {
    return commands.map((c) => ({
      id: c.id,
      title: c.title || c.id,
      section: c.section || "",
      shortcut: c.shortcut || "",
      detail: c.detail || ""
    }));
  }
  function safeWhen(c) {
    try {
      return !!c.when();
    } catch {
      return false;
    }
  }
  function providerItems(kind, arg) {
    const fn = providers[kind];
    if (!fn) return [];
    try {
      return fn(arg) || [];
    } catch {
      return [];
    }
  }
  var IS_MAC = typeof navigator !== "undefined" && /Mac/.test(navigator.platform || "");
  var ui = null;
  var isOpen = false;
  var flatItems = [];
  var activeIndex = 0;
  var restoreFocusTo = null;
  var SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  function buildUi() {
    const backdrop = document.createElement("div");
    backdrop.className = "bel-palette-backdrop";
    backdrop.addEventListener("pointerdown", close);
    const panel = document.createElement("div");
    panel.className = "bel-palette";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Command palette");
    const inputWrap = document.createElement("div");
    inputWrap.className = "bel-palette-inputwrap";
    const modeChip = document.createElement("span");
    modeChip.className = "bel-palette-mode";
    modeChip.setAttribute("aria-hidden", "true");
    const iconHost = document.createElement("span");
    iconHost.className = "bel-palette-icon";
    iconHost.innerHTML = SEARCH_ICON;
    iconHost.setAttribute("aria-hidden", "true");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "bel-palette-input";
    input.placeholder = MODE_META.anywhere.placeholder;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("data-surface-find", "");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-controls", "bel-palette-list");
    inputWrap.append(modeChip, iconHost, input);
    const list = document.createElement("div");
    list.className = "bel-palette-list";
    list.id = "bel-palette-list";
    list.setAttribute("role", "listbox");
    const empty = document.createElement("div");
    empty.className = "bel-palette-empty";
    empty.textContent = "No matching results";
    empty.hidden = true;
    const hint = document.createElement("div");
    hint.className = "bel-palette-hint";
    hint.hidden = true;
    panel.append(inputWrap, list, empty, hint);
    input.addEventListener("input", renderResults);
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive(activeIndex + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive(activeIndex - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        runActive();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab") {
        e.preventDefault();
      }
    });
    document.body.append(backdrop, panel);
    ui = { backdrop, panel, input, list, empty, hint, modeChip };
    return ui;
  }
  function commandItems() {
    return activeCommands().map((c) => {
      let shortcut = "";
      if (typeof Keybindings !== "undefined" && Keybindings.has(c.id)) {
        shortcut = Keybindings.labelFor(c.id) || "";
      } else if (c.shortcut) {
        shortcut = formatShortcut(c.shortcut, IS_MAC);
      }
      return {
        title: c.title,
        section: c.section || "Commands",
        shortcut,
        detail: c.detail || "",
        run: c.run
      };
    });
  }
  function helpItems() {
    return HELP_CATALOG.map((h) => {
      let shortcut = h.prefix || "bare";
      if (h.shortcut) {
        if (typeof Keybindings !== "undefined") {
          const id = h.shortcut === "Mod+K" ? "nav.anywhere" : h.shortcut === "Mod+Shift+P" ? "tools.commands" : h.shortcut === "Mod+Shift+O" ? "nav.symbol" : h.shortcut === "Mod+Shift+F" ? "edit.search-project" : "";
          if (id && Keybindings.has(id)) shortcut = Keybindings.labelFor(id) || formatShortcut(h.shortcut, IS_MAC);
          else shortcut = formatShortcut(h.shortcut, IS_MAC);
        } else {
          shortcut = formatShortcut(h.shortcut, IS_MAC);
        }
      }
      return {
        title: (h.prefix ? h.prefix + "  " : "") + h.title,
        detail: h.detail,
        shortcut,
        section: "Modes",
        run: () => {
          open({ mode: h.prefix === "" ? "anywhere" : h.prefix === ">" ? "commands" : h.prefix === "@" ? "symbols" : h.prefix === "%" ? "search" : h.prefix === ":" ? "line" : h.prefix === "!" ? "problems" : h.prefix === "/" ? "library" : "help" });
        }
      };
    });
  }
  function lineJumpItems(query) {
    const parsed = parseLineQuery(query);
    if (!parsed) {
      if (!query) return [];
      return [];
    }
    return [{
      title: "Go to line " + parsed.line + (query.indexOf(":") >= 0 ? ", column " + parsed.col : ""),
      detail: "Current file",
      mono: false,
      run: () => {
        const ed = global.CurrentEditor;
        if (!ed || typeof ed.getView !== "function") return;
        const view = ed.getView();
        if (!view) return;
        const doc = view.state.doc;
        const line = Math.min(Math.max(1, parsed.line), doc.lines);
        const lineObj = doc.line(line);
        const col = Math.min(Math.max(1, parsed.col), lineObj.length + 1);
        const pos = Math.min(lineObj.from + col - 1, lineObj.to);
        if (typeof ed.jumpToRange === "function") ed.jumpToRange({ from: pos, to: pos });
        else {
          view.dispatch({ selection: { anchor: pos, head: pos }, scrollIntoView: true });
          view.focus();
        }
      }
    }];
  }
  function gatherItems(parsed) {
    if (parsed.mode === "symbols") {
      return rankItems(providerItems("symbols"), parsed.query, 80);
    }
    if (parsed.mode === "search") {
      return providerItems("search", parsed.query).slice(0, 60).map((item) => {
        const positions = substringPositions(parsed.query, item.title);
        return { ...item, _match: positions };
      });
    }
    if (parsed.mode === "commands") {
      return rankItems(commandItems(), parsed.query, 50);
    }
    if (parsed.mode === "line") {
      return lineJumpItems(parsed.query);
    }
    if (parsed.mode === "problems") {
      return rankItems(providerItems("problems", parsed.query), parsed.query, 60);
    }
    if (parsed.mode === "library") {
      return rankItems(providerItems("library", parsed.query), parsed.query, 40);
    }
    if (parsed.mode === "help") {
      return rankItems(helpItems(), parsed.query, 20);
    }
    const files = providerItems("files").map((f) => ({ ...f, section: "Files" }));
    const symbols = providerItems("symbols").map((s) => ({ ...s, section: "Symbols" }));
    return rankItems(files.concat(symbols), parsed.query, 50);
  }
  function emptyMessage(parsed) {
    if (parsed.legacyHash) return "Project search is now %. Type after % to search.";
    if (parsed.mode === "search" && (!parsed.query || parsed.query.length < 2)) {
      return "Type at least 2 characters to search the project";
    }
    if (parsed.mode === "line") {
      return parsed.query ? "Enter a line number (e.g. 42 or 42:8)" : "Type a line number\u2026";
    }
    if (parsed.mode === "problems") return "No problems in the project";
    if (parsed.mode === "library") {
      return parsed.query ? "No matching library samples" : "Type to search the library\u2026";
    }
    if (parsed.mode === "help") return "No matching modes";
    return "No matching results";
  }
  function syncModeChrome(parsed) {
    const meta = MODE_META[parsed.mode] || MODE_META.anywhere;
    ui.modeChip.textContent = meta.label;
    ui.input.placeholder = meta.placeholder;
    ui.panel.setAttribute("data-mode", parsed.mode);
  }
  function renderResults() {
    if (!ui) return;
    const parsed = parseInput(ui.input.value);
    syncModeChrome(parsed);
    flatItems = gatherItems(parsed);
    const grouped = !parsed.query && (parsed.mode === "commands" || parsed.mode === "anywhere" || parsed.mode === "help" || parsed.mode === "problems");
    ui.list.innerHTML = "";
    ui.empty.hidden = flatItems.length > 0;
    ui.empty.textContent = emptyMessage(parsed);
    const showHint = parsed.mode === "anywhere" && !parsed.query;
    ui.hint.hidden = !showHint;
    if (showHint) ui.hint.textContent = "> for commands \xB7 % to search project \xB7 ? to see modes";
    let lastSection = null;
    flatItems.forEach((item, i) => {
      if (grouped && item.section && item.section !== lastSection) {
        lastSection = item.section;
        const head = document.createElement("div");
        head.className = "bel-palette-section";
        head.textContent = item.section;
        ui.list.appendChild(head);
      }
      const row = document.createElement("div");
      row.className = "bel-palette-item";
      if (item.severity === "error") row.classList.add("is-severity-error");
      if (item.severity === "warning") row.classList.add("is-severity-warning");
      if (item.kind === "library") row.classList.add("is-library");
      row.id = "bel-palette-opt-" + i;
      row.setAttribute("role", "option");
      row.setAttribute("data-index", String(i));
      const title = document.createElement("span");
      title.className = "bel-palette-item-title" + (item.mono ? " is-mono" : "");
      appendHighlighted(title, item.title, item._match);
      row.appendChild(title);
      const side = item.shortcut || item.detail;
      if (side) {
        const meta = document.createElement("span");
        meta.className = item.shortcut ? "bel-palette-item-shortcut" : "bel-palette-item-detail";
        meta.textContent = side;
        row.appendChild(meta);
      }
      row.addEventListener("pointerdown", (e) => e.preventDefault());
      row.addEventListener("click", () => {
        activeIndex = i;
        runActive();
      });
      row.addEventListener("pointermove", () => {
        if (activeIndex !== i) setActive(i, { scroll: false });
      });
      ui.list.appendChild(row);
    });
    setActive(0, { scroll: true });
  }
  function appendHighlighted(el, text, positions) {
    if (!positions || !positions.length) {
      el.textContent = text;
      return;
    }
    const set = new Set(positions);
    let run = "";
    let runHit = set.has(0);
    for (let i = 0; i < text.length; i++) {
      const hit = set.has(i);
      if (hit !== runHit) {
        flush();
        runHit = hit;
      }
      run += text[i];
    }
    flush();
    function flush() {
      if (!run) return;
      if (runHit) {
        const b = document.createElement("b");
        b.textContent = run;
        el.appendChild(b);
      } else {
        el.appendChild(document.createTextNode(run));
      }
      run = "";
    }
  }
  function setActive(index, opts) {
    if (!ui || !flatItems.length) {
      activeIndex = 0;
      if (ui) ui.input.removeAttribute("aria-activedescendant");
      return;
    }
    const n = flatItems.length;
    activeIndex = (index % n + n) % n;
    const rows = ui.list.querySelectorAll(".bel-palette-item");
    rows.forEach((row) => {
      const on = Number(row.getAttribute("data-index")) === activeIndex;
      row.classList.toggle("is-active", on);
      row.setAttribute("aria-selected", on ? "true" : "false");
    });
    ui.input.setAttribute("aria-activedescendant", "bel-palette-opt-" + activeIndex);
    if (!opts || opts.scroll !== false) {
      const row = ui.list.querySelector(".bel-palette-item.is-active");
      if (row) row.scrollIntoView({ block: "nearest" });
    }
  }
  function runActive() {
    const item = flatItems[activeIndex];
    if (!item) return;
    close();
    try {
      item.run();
    } catch (err) {
      if (global.console && console.error) console.error("[palette]", err);
      if (global.Toasts && global.Toasts.warn) {
        const msg = err && err.message ? String(err.message) : String(err);
        global.Toasts.warn("Command failed: " + msg);
      }
    }
  }
  function open(opts) {
    let mode = "anywhere";
    if (opts && opts.mode && MODE_PREFIX[opts.mode] != null) mode = opts.mode;
    if (!ui) buildUi();
    restoreFocusTo = document.activeElement;
    isOpen = true;
    ui.backdrop.classList.add("is-open");
    ui.panel.classList.add("is-open");
    ui.input.value = MODE_PREFIX[mode];
    renderResults();
    ui.input.focus();
    const len = ui.input.value.length;
    try {
      ui.input.setSelectionRange(len, len);
    } catch (_) {
    }
  }
  function close() {
    if (!ui || !isOpen) return;
    isOpen = false;
    ui.backdrop.classList.remove("is-open");
    ui.panel.classList.remove("is-open");
    const back = restoreFocusTo;
    restoreFocusTo = null;
    if (back && typeof back.focus === "function" && document.contains(back)) back.focus();
  }
  function toggle(opts) {
    if (isOpen) close();
    else open(opts);
  }
  function init() {
    if (typeof Keybindings !== "undefined" && typeof Keybindings.initGlobals === "function") {
      Keybindings.initGlobals({
        "nav.anywhere": () => toggle({ mode: "anywhere" }),
        "tools.commands": () => toggle({ mode: "commands" }),
        "nav.symbol": () => toggle({ mode: "symbols" }),
        "edit.search-project": () => toggle({ mode: "search" })
      });
      return;
    }
    window.addEventListener("keydown", (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = (e.key || "").toLowerCase();
      if (key === "k" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggle({ mode: "anywhere" });
      } else if (key === "p" && e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggle({ mode: "commands" });
      } else if (key === "o" && e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggle({ mode: "symbols" });
      } else if (key === "f" && e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggle({ mode: "search" });
      }
    }, true);
  }
  function shortcutLabelFor(idOrSpec) {
    if (typeof Keybindings !== "undefined" && Keybindings.has(idOrSpec)) {
      return Keybindings.labelFor(idOrSpec);
    }
    return formatShortcut(idOrSpec, IS_MAC);
  }
  global.CommandPalette = {
    register,
    unregister,
    setProvider,
    open,
    close,
    toggle,
    init,
    isOpen: () => isOpen,
    shortcutLabel: shortcutLabelFor,
    shortcutParts: (spec) => shortcutParts(spec, IS_MAC),
    listCommands,
    _pure: {
      fuzzyScore,
      parseInput,
      rankItems,
      formatShortcut,
      shortcutParts,
      parseLineQuery,
      substringPositions,
      HELP_CATALOG,
      MODE_PREFIX
    },
    _registry: { activeCommands }
  };
})();
