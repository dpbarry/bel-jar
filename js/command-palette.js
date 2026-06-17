// Command palette — VS Code-style overlay opened from Ctrl/Cmd+K or the
// Tools menu. Three result sources:
//   commands  — registered via CommandPalette.register({id,title,section,...})
//   files     — provider; listed under a "Files" section in commands mode
//   symbols   — provider; entered with an "@" prefix (or Ctrl+Shift+O)
// Pure logic (fuzzy scorer, input parsing, ranking) is exposed on ._pure for
// DOM-free tests.
(function (global) {
  'use strict';

  // ── Pure logic ──────────────────────────────────────────────────────────────

  // Subsequence fuzzy matcher. Returns { score, positions } or null when the
  // query is not a subsequence of the text. Greedy forward pass with bonuses
  // for word starts, camelCase humps, consecutive runs, and a whole-prefix
  // match; penalised by the spread between first and last matched char.
  function fuzzyScore(query, text) {
    if (!query) return { score: 0, positions: [] };
    const t = String(text || '');
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
      if (idx === prev + 1) s += 4; // consecutive run
      const before = idx > 0 ? t[idx - 1] : '';
      const isWordStart =
        idx === 0 || before === ' ' || before === '-' || before === '_' ||
        before === '.' || before === '/' || before === ':';
      const isHump = t[idx] >= 'A' && t[idx] <= 'Z' && before >= 'a' && before <= 'z';
      if (isWordStart || isHump) s += 6;
      score += s;
      positions.push(idx);
      prev = idx;
      from = idx + 1;
    }
    const spread = positions[positions.length - 1] - positions[0] - (q.length - 1);
    score -= Math.floor(spread * 0.5);
    if (positions[0] === 0) score += 3; // prefix bonus
    return { score, positions };
  }

  // "@foo" → symbols; "#foo" → project text search; ">foo" → commands (VS Code
  // muscle memory); else commands.
  function parseInput(raw) {
    const s = String(raw || '');
    if (s.startsWith('@')) return { mode: 'symbols', query: s.slice(1).trim() };
    if (s.startsWith('#')) return { mode: 'search', query: s.slice(1).trim() };
    if (s.startsWith('>')) return { mode: 'commands', query: s.slice(1).trim() };
    return { mode: 'commands', query: s.trim() };
  }

  // Rank items by fuzzy score on title (detail matches count at half weight as
  // a fallback). Empty query → original order. Each hit gains _match positions
  // for highlight rendering.
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

  function formatShortcut(spec, isMac) {
    if (!spec) return '';
    return spec
      .split('+')
      .map((part) => {
        if (part === 'Mod') return isMac ? '⌘' : 'Ctrl';
        if (part === 'Shift') return isMac ? '⇧' : 'Shift';
        if (part === 'Alt') return isMac ? '⌥' : 'Alt';
        return part;
      })
      .join(isMac ? '' : '+');
  }

  // ── Registry ────────────────────────────────────────────────────────────────

  const commands = [];
  const providers = { files: null, symbols: null, search: null };

  function register(cmd) {
    if (!cmd || !cmd.id || typeof cmd.run !== 'function') return;
    const at = commands.findIndex((c) => c.id === cmd.id);
    if (at >= 0) commands[at] = cmd;
    else commands.push(cmd);
  }

  function unregister(id) {
    const at = commands.findIndex((c) => c.id === id);
    if (at >= 0) commands.splice(at, 1);
  }

  function setProvider(kind, fn) {
    if (kind in providers) providers[kind] = fn;
  }

  function activeCommands() {
    return commands.filter((c) => !c.when || safeWhen(c));
  }

  function safeWhen(c) {
    try { return !!c.when(); } catch { return false; }
  }

  function providerItems(kind, arg) {
    const fn = providers[kind];
    if (!fn) return [];
    try { return fn(arg) || []; } catch { return []; }
  }

  // ── Overlay UI ──────────────────────────────────────────────────────────────

  const IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || '');

  let ui = null;          // { backdrop, panel, input, list, empty }
  let isOpen = false;
  let flatItems = [];     // currently rendered selectable items
  let activeIndex = 0;
  let restoreFocusTo = null;

  const SEARCH_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

  function buildUi() {
    const backdrop = document.createElement('div');
    backdrop.className = 'bel-palette-backdrop';
    backdrop.addEventListener('pointerdown', close);

    const panel = document.createElement('div');
    panel.className = 'bel-palette';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Command palette');

    const inputWrap = document.createElement('div');
    inputWrap.className = 'bel-palette-inputwrap';
    inputWrap.innerHTML = SEARCH_ICON;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'bel-palette-input';
    input.placeholder = 'Type a command,  @ for symbols,  # to search project…';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', 'bel-palette-list');
    inputWrap.appendChild(input);

    const list = document.createElement('div');
    list.className = 'bel-palette-list';
    list.id = 'bel-palette-list';
    list.setAttribute('role', 'listbox');

    const empty = document.createElement('div');
    empty.className = 'bel-palette-empty';
    empty.textContent = 'No matching results';
    empty.hidden = true;

    panel.append(inputWrap, list, empty);

    input.addEventListener('input', renderResults);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(activeIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(activeIndex - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        runActive();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        e.preventDefault(); // keep focus in the palette
      }
    });

    document.body.append(backdrop, panel);
    ui = { backdrop, panel, input, list, empty };
    return ui;
  }

  function gatherItems(parsed) {
    if (parsed.mode === 'symbols') {
      return rankItems(providerItems('symbols'), parsed.query, 80);
    }
    if (parsed.mode === 'search') {
      // Provider does the matching (substring across project files); results
      // arrive in file/line order — no fuzzy re-ranking, no highlights.
      return providerItems('search', parsed.query)
        .slice(0, 60)
        .map((item) => ({ ...item, _match: null }));
    }
    const cmds = activeCommands().map((c) => ({
      title: c.title,
      section: c.section || 'Commands',
      shortcut: c.shortcut ? formatShortcut(c.shortcut, IS_MAC) : '',
      detail: c.detail || '',
      run: c.run,
    }));
    const files = providerItems('files').map((f) => ({ ...f, section: 'Files' }));
    return rankItems(cmds.concat(files), parsed.query, 50);
  }

  function renderResults() {
    if (!ui) return;
    const parsed = parseInput(ui.input.value);
    flatItems = gatherItems(parsed);
    const grouped = !parsed.query; // section headers only when unfiltered
    ui.list.innerHTML = '';
    ui.empty.hidden = flatItems.length > 0;

    let lastSection = null;
    flatItems.forEach((item, i) => {
      if (grouped && parsed.mode === 'commands' && item.section !== lastSection) {
        lastSection = item.section;
        const head = document.createElement('div');
        head.className = 'bel-palette-section';
        head.textContent = item.section;
        ui.list.appendChild(head);
      }
      const row = document.createElement('div');
      row.className = 'bel-palette-item';
      row.id = 'bel-palette-opt-' + i;
      row.setAttribute('role', 'option');
      row.setAttribute('data-index', String(i));

      const title = document.createElement('span');
      title.className = 'bel-palette-item-title' + (item.mono ? ' is-mono' : '');
      appendHighlighted(title, item.title, item._match);
      row.appendChild(title);

      const side = item.shortcut || item.detail;
      if (side) {
        const meta = document.createElement('span');
        meta.className = item.shortcut ? 'bel-palette-item-shortcut' : 'bel-palette-item-detail';
        meta.textContent = side;
        row.appendChild(meta);
      }

      row.addEventListener('pointerdown', (e) => e.preventDefault()); // keep input focus
      row.addEventListener('click', () => {
        activeIndex = i;
        runActive();
      });
      row.addEventListener('pointermove', () => {
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
    let run = '';
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
        const b = document.createElement('b');
        b.textContent = run;
        el.appendChild(b);
      } else {
        el.appendChild(document.createTextNode(run));
      }
      run = '';
    }
  }

  function setActive(index, opts) {
    if (!ui || !flatItems.length) {
      activeIndex = 0;
      if (ui) ui.input.removeAttribute('aria-activedescendant');
      return;
    }
    const n = flatItems.length;
    activeIndex = ((index % n) + n) % n; // wrap both directions
    const rows = ui.list.querySelectorAll('.bel-palette-item');
    rows.forEach((row) => {
      const on = Number(row.getAttribute('data-index')) === activeIndex;
      row.classList.toggle('is-active', on);
      row.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ui.input.setAttribute('aria-activedescendant', 'bel-palette-opt-' + activeIndex);
    if (!opts || opts.scroll !== false) {
      const row = ui.list.querySelector('.bel-palette-item.is-active');
      if (row) row.scrollIntoView({ block: 'nearest' });
    }
  }

  function runActive() {
    const item = flatItems[activeIndex];
    if (!item) return;
    close();
    try { item.run(); } catch (err) {
      if (global.console && console.error) console.error('[palette]', err);
      if (global.BelJarToasts && global.BelJarToasts.warn) {
        const msg = err && err.message ? String(err.message) : String(err);
        global.BelJarToasts.warn('Command failed: ' + msg);
      }
    }
  }

  const MODE_PREFIX = { symbols: '@', search: '#', commands: '' };

  function open(opts) {
    const mode = opts && MODE_PREFIX[opts.mode] != null ? opts.mode : 'commands';
    if (!ui) buildUi();
    restoreFocusTo = document.activeElement;
    isOpen = true;
    ui.backdrop.classList.add('is-open');
    ui.panel.classList.add('is-open');
    ui.input.value = MODE_PREFIX[mode];
    renderResults();
    ui.input.focus();
  }

  function close() {
    if (!ui || !isOpen) return;
    isOpen = false;
    ui.backdrop.classList.remove('is-open');
    ui.panel.classList.remove('is-open');
    const back = restoreFocusTo;
    restoreFocusTo = null;
    if (back && typeof back.focus === 'function' && document.contains(back)) back.focus();
  }

  function toggle(opts) {
    if (isOpen) close();
    else open(opts);
  }

  // ── Global wiring (called once from app.js) ────────────────────────────────

  function init() {
    window.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = (e.key || '').toLowerCase();
      if (key === 'k' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggle();
      } else if (key === 'o' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggle({ mode: 'symbols' });
      } else if (key === 'f' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggle({ mode: 'search' });
      }
    }, true);
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
    shortcutLabel: (spec) => formatShortcut(spec, IS_MAC),
    _pure: { fuzzyScore, parseInput, rankItems, formatShortcut },
    _registry: { activeCommands },
  };
})(typeof window !== 'undefined' ? window : globalThis);
