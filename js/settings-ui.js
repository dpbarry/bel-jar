'use strict';

(function (global) {
  var settingsDialogEl = null;
  var controls = {};
  var openDropdowns = [];

  function persist() {
    return typeof BelJarPersist !== 'undefined' ? BelJarPersist : null;
  }

  function closeAllDropdowns() {
    for (var i = openDropdowns.length - 1; i >= 0; i--) {
      if (openDropdowns[i] && typeof openDropdowns[i].close === 'function') {
        openDropdowns[i].close();
      }
    }
  }

  function notifySettingsChanged(key) {
    try {
      global.dispatchEvent(new CustomEvent('beljar:settings-changed', { detail: { key: key || '' } }));
    } catch (_) {}
  }

  function postSettingsApply(key) {
    queueMicrotask(function () {
      notifySettingsChanged(key);
    });
  }

  function applyLiveSettings(key) {
    if (typeof global.beljarApplyLiveSettings === 'function') global.beljarApplyLiveSettings(key);
  }

  function writePersist(key, fn) {
    var p = persist();
    if (p) fn(p);
    closeAllDropdowns();
    applyLiveSettings(key);
    postSettingsApply(key);
  }

  function runCategoryReset(applyReset, notifyKey) {
    closeAllDropdowns();
    var p = persist();
    if (p && applyReset) applyReset(p);
    syncFromState();
    var key = notifyKey || 'category-reset';
    applyLiveSettings(key);
    postSettingsApply(key);
  }

  function syncFromState() {
    var p = persist();
    if (!p) return;
    Object.keys(controls).forEach(function (id) {
      var c = controls[id];
      if (!c) return;
      if (c.type === 'dropdown') c.setValue(c.read());
      else if (c.type === 'switch') {
        if (typeof c.setChecked === 'function') c.setChecked(c.read());
        else c.input.checked = c.read();
      }
    });
  }

  function createDropdown(options, currentValue, onChange) {
    var selected = currentValue;
    var focusedIdx = -1;
    var optionEls = [];

    var container = document.createElement('div');
    container.className = 'bj-dropdown';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'bj-dropdown__trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    var valueSpan = document.createElement('span');
    valueSpan.className = 'bj-dropdown__value';

    var chevronEl = document.createElement('span');
    chevronEl.className = 'bj-dropdown__chevron';
    chevronEl.setAttribute('aria-hidden', 'true');
    chevronEl.innerHTML = '<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    trigger.appendChild(valueSpan);
    trigger.appendChild(chevronEl);

    var panel = document.createElement('div');
    panel.className = 'bj-dropdown__panel';
    panel.setAttribute('role', 'listbox');

    options.forEach(function (opt, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bj-dropdown__option';
      btn.setAttribute('role', 'option');
      btn.dataset.value = opt.value;

      var labelSpan = document.createElement('span');
      labelSpan.textContent = opt.label;

      var checkEl = document.createElement('span');
      checkEl.className = 'bj-dropdown__option-check';
      checkEl.setAttribute('aria-hidden', 'true');
      checkEl.innerHTML = '<svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4.5 8L10 1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      btn.appendChild(labelSpan);
      btn.appendChild(checkEl);

      btn.addEventListener('mouseenter', function () {
        focusedIdx = idx;
        updateFocus();
      });
      btn.addEventListener('click', function () {
        if (opt.value !== selected) {
          setValue(opt.value);
          close();
          onChange(opt.value);
        } else {
          close();
        }
      });

      panel.appendChild(btn);
      optionEls.push(btn);
    });

    container.appendChild(trigger);

    function updateFocus() {
      optionEls.forEach(function (el, i) { el.classList.toggle('is-focused', i === focusedIdx); });
    }

    function setValue(val) {
      selected = val;
      var opt = options.filter(function (o) { return o.value === val; })[0];
      valueSpan.textContent = opt ? opt.label : val;
      optionEls.forEach(function (el) { el.classList.toggle('is-selected', el.dataset.value === val); });
    }

    function reposition() {
      if (!panel.classList.contains('is-open')) return;
      var rect = trigger.getBoundingClientRect();
      panel.style.width = rect.width + 'px';
      panel.style.minWidth = rect.width + 'px';
      var pos = FloatingRectPlacement.computePosition({
        anchor: rect,
        width: rect.width,
        height: panel.offsetHeight,
        mode: 'menu',
        side: 'bottom',
        align: 'end',
        gap: 4,
        margin: 8,
      });
      panel.style.top = pos.y + 'px';
      panel.style.left = pos.x + 'px';
    }

    function open() {
      var el = container.parentElement;
      while (el && el.tagName !== 'DIALOG') el = el.parentElement;
      var mountEl = el || document.body;
      if (panel.parentElement !== mountEl) mountEl.appendChild(panel);

      panel.style.visibility = 'hidden';
      panel.style.display = 'block';
      var rect = trigger.getBoundingClientRect();
      panel.style.width = rect.width + 'px';
      panel.style.minWidth = rect.width + 'px';
      var ph = panel.offsetHeight;
      panel.style.display = '';
      panel.style.visibility = '';

      var pos = FloatingRectPlacement.computePosition({
        anchor: rect,
        width: rect.width,
        height: ph,
        mode: 'menu',
        side: 'bottom',
        align: 'end',
        gap: 4,
        margin: 8,
      });
      panel.style.top = pos.y + 'px';
      panel.style.left = pos.x + 'px';

      container.classList.add('is-open');
      panel.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      window.addEventListener('scroll', reposition, true);
      window.addEventListener('resize', reposition);
      focusedIdx = options.findIndex(function (o) { return o.value === selected; });
      updateFocus();
      if (openDropdowns.indexOf(api) === -1) openDropdowns.push(api);
    }

    function close() {
      container.classList.remove('is-open');
      panel.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      var idx = openDropdowns.indexOf(api);
      if (idx !== -1) openDropdowns.splice(idx, 1);
    }

    trigger.addEventListener('click', function () {
      if (container.classList.contains('is-open')) close(); else open();
    });

    trigger.addEventListener('keydown', function (e) {
      var isOpen = container.classList.contains('is-open');
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); focusedIdx = Math.min(focusedIdx + 1, options.length - 1); updateFocus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); focusedIdx = Math.max(focusedIdx - 1, 0); updateFocus(); }
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (focusedIdx >= 0) { var o = options[focusedIdx]; if (o.value !== selected) { setValue(o.value); onChange(o.value); } close(); }
      }
    });

    document.addEventListener('click', function (e) {
      if (container.classList.contains('is-open') && !container.contains(e.target) && !panel.contains(e.target)) close();
    });

    setValue(currentValue);
    var api = { element: container, setValue: setValue, close: close };
    return api;
  }

  function makeResetLink(onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bj-settings__reset-link';
    btn.textContent = 'Reset';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function addSectionHead(parent, title) {
    var h = document.createElement('div');
    h.className = 'bj-settings__section-head';
    h.textContent = title;
    parent.appendChild(h);
  }

  function attachPanelReset(panel, onReset) {
    var head = panel.querySelector('.bj-settings__panel-head');
    if (!head || !onReset) return;
    head.appendChild(makeResetLink(onReset));
  }

  function addSwitchRow(parent, id, labelText, descText, readFn, writeFn) {
    var inputId = 'bj-setting-' + id;
    var r = document.createElement('div');
    r.className = 'bj-dialog__setting bj-dialog__setting--switch';
    var m = document.createElement('div');
    m.className = 'bj-dialog__setting-main';
    var lbl = document.createElement('span');
    lbl.className = 'bj-dialog__setting-label';
    lbl.textContent = labelText;
    var dsc = document.createElement('span');
    dsc.className = 'bj-dialog__setting-desc';
    dsc.textContent = descText;
    m.appendChild(lbl);
    m.appendChild(dsc);
    var toggle = BelJarToggle.create({
      id: inputId,
      checked: readFn(),
      ariaLabel: labelText,
      onChange: function (on) { writePersist(id, function (p) { writeFn(p, on); }); },
    });
    r.appendChild(m);
    r.appendChild(toggle.element);
    parent.appendChild(r);
    controls[id] = { type: 'switch', input: toggle.input, setChecked: toggle.setChecked, read: readFn };
    return toggle.input;
  }

  function ensureSettingsDialog() {
    if (settingsDialogEl) return settingsDialogEl;

    var p0 = persist();

    function addDropdownRow(parent, id, labelText, descText, options, readFn, writeFn) {
      var r = document.createElement('div');
      r.className = 'bj-dialog__setting';
      var m = document.createElement('div');
      m.className = 'bj-dialog__setting-main';
      var lbl = document.createElement('span');
      lbl.className = 'bj-dialog__setting-label';
      lbl.textContent = labelText;
      var dsc = document.createElement('span');
      dsc.className = 'bj-dialog__setting-desc';
      dsc.textContent = descText;
      m.appendChild(lbl);
      m.appendChild(dsc);
      var dd = createDropdown(options, readFn(), function (v) {
        writePersist(id, function (p) { writeFn(p, v); });
      });
      r.appendChild(m);
      r.appendChild(dd.element);
      parent.appendChild(r);
      controls[id] = { type: 'dropdown', setValue: dd.setValue, read: readFn };
      return dd;
    }

    var shell = document.createElement('div');
    shell.className = 'bj-settings';

    var nav = document.createElement('nav');
    nav.className = 'bj-settings__nav';
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', 'Settings categories');

    var main = document.createElement('div');
    main.className = 'bj-settings__main';

    var categories = [
      { id: 'appearance', label: 'Appearance' },
      { id: 'editor', label: 'Editor' },
      { id: 'beluga', label: 'Beluga' },
      { id: 'repl', label: 'REPL' },
      { id: 'workspace', label: 'Workspace' },
      { id: 'aliases', label: 'Aliases' },
    ];

    var panelBodies = {};
    var activeCategory = 'appearance';

    function selectCategory(id) {
      activeCategory = id;
      nav.querySelectorAll('.bj-settings__nav-item').forEach(function (el) {
        var on = el.dataset.category === id;
        el.classList.toggle('is-active', on);
        el.setAttribute('aria-selected', on ? 'true' : 'false');
        el.tabIndex = on ? 0 : -1;
      });
      main.querySelectorAll('.bj-settings__panel').forEach(function (el) {
        var on = el.dataset.category === id;
        el.hidden = !on;
        el.classList.toggle('is-active', on);
      });
    }

    categories.forEach(function (cat) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bj-settings__nav-item';
      btn.textContent = cat.label;
      btn.dataset.category = cat.id;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', cat.id === activeCategory ? 'true' : 'false');
      btn.tabIndex = cat.id === activeCategory ? 0 : -1;
      btn.addEventListener('click', function () { selectCategory(cat.id); });
      btn.addEventListener('keydown', function (e) {
        var idx = categories.findIndex(function (c) { return c.id === cat.id; });
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectCategory(categories[Math.min(idx + 1, categories.length - 1)].id);
          nav.querySelector('[data-category="' + activeCategory + '"]').focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectCategory(categories[Math.max(idx - 1, 0)].id);
          nav.querySelector('[data-category="' + activeCategory + '"]').focus();
        }
      });
      nav.appendChild(btn);

      var panel = document.createElement('div');
      panel.className = 'bj-settings__panel';
      panel.dataset.category = cat.id;
      panel.setAttribute('role', 'tabpanel');
      panel.hidden = cat.id !== activeCategory;

      var head = document.createElement('div');
      head.className = 'bj-settings__panel-head';
      var headLabel = document.createElement('span');
      headLabel.className = 'bj-settings__panel-head-label';
      headLabel.textContent = cat.label;
      head.appendChild(headLabel);
      panel.appendChild(head);

      var body = document.createElement('div');
      body.className = 'bj-settings__panel-body';
      panel.appendChild(body);

      panelBodies[cat.id] = body;
      main.appendChild(panel);
    });

    attachPanelReset(main.querySelector('[data-category="appearance"]'), function () {
      runCategoryReset(function (p) {
        p.resetAppearancePrefs();
        document.documentElement.classList.remove('light');
        if (typeof p.applyStoredUiFontSize === 'function') p.applyStoredUiFontSize();
        if (typeof p.applyStoredUiTextContrast === 'function') p.applyStoredUiTextContrast();
        if (typeof global.syncEditorCmTheme === 'function') global.syncEditorCmTheme();
      }, 'appearance-reset');
    });

    attachPanelReset(main.querySelector('[data-category="editor"]'), function () {
      runCategoryReset(function (p) { p.resetEditorPrefs(); }, 'editor-reset');
    });

    attachPanelReset(main.querySelector('[data-category="beluga"]'), function () {
      runCategoryReset(function (p) {
        p.resetBelugaPrefs();
        if (typeof BelJarBelugaRun !== 'undefined') BelJarBelugaRun.setBelugaMode('stable');
      }, 'beluga-reset');
    });

    attachPanelReset(main.querySelector('[data-category="repl"]'), function () {
      runCategoryReset(function (p) { p.resetReplPrefs(); }, 'repl-reset');
    });

    attachPanelReset(main.querySelector('[data-category="workspace"]'), function () {
      runCategoryReset(function (p) {
        p.resetWorkspacePrefs();
        global.dispatchEvent(new CustomEvent('beljar:inspector-follow-changed', { detail: { on: false } }));
      }, 'workspace-reset');
    });

    attachPanelReset(main.querySelector('[data-category="aliases"]'), function () {
      runCategoryReset(function (p) { p.resetAliasesPrefs(); }, 'aliases-reset');
    });

    // Appearance
    addDropdownRow(
      panelBodies.appearance,
      'theme',
      'Theme',
      'Light or dark interface.',
      [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }],
      function () {
        return p0 && p0.readStoredTheme() === 'light' ? 'light' : 'dark';
      },
      function (p, v) {
        var isLight = v === 'light';
        document.documentElement.classList.toggle('light', isLight);
        p.writeStoredTheme(isLight ? 'light' : 'dark');
        if (typeof global.syncEditorCmTheme === 'function') global.syncEditorCmTheme();
      }
    );

    addDropdownRow(
      panelBodies.appearance,
      'ui-font-size',
      'UI font size',
      'Scales both text and content size of UI.',
      [
        { value: 'sm', label: 'Small' },
        { value: 'md', label: 'Default' },
        { value: 'lg', label: 'Large' },
        { value: 'xl', label: 'Larger' },
      ],
      function () { return p0 ? p0.readStoredUiFontSize() : 'md'; },
      function (p, v) {
        p.writeStoredUiFontSize(v);
        if (typeof p.applyStoredUiFontSize === 'function') p.applyStoredUiFontSize();
      }
    );

    addDropdownRow(
      panelBodies.appearance,
      'ui-text-contrast',
      'Text contrast',
      'Higher contrast makes UI text and controls more readable.',
      [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Default' },
        { value: 'high', label: 'High' },
        { value: 'maximum', label: 'Maximum' },
      ],
      function () { return p0 ? p0.readStoredUiTextContrast() : 'medium'; },
      function (p, v) {
        p.writeStoredUiTextContrast(v);
        if (typeof p.applyStoredUiTextContrast === 'function') p.applyStoredUiTextContrast();
      }
    );

    // Editor — Typography
    addSectionHead(panelBodies.editor, 'Typography');
    addDropdownRow(panelBodies.editor, 'editor-font-size', 'Font size', '',
      [
        { value: 'sm', label: 'Small (12px)' },
        { value: 'md', label: 'Default (13px)' },
        { value: 'lg', label: 'Large (14px)' },
        { value: 'xl', label: 'Larger (16px)' },
      ],
      function () { return p0 ? p0.readStoredEditorFontSize() : 'md'; },
      function (p, v) { p.writeStoredEditorFontSize(v); }
    );
    addDropdownRow(panelBodies.editor, 'editor-line-height', 'Line height', '',
      [
        { value: 'compact', label: 'Compact' },
        { value: 'normal', label: 'Default' },
        { value: 'relaxed', label: 'Relaxed' },
      ],
      function () { return p0 ? p0.readStoredEditorLineHeight() : 'normal'; },
      function (p, v) { p.writeStoredEditorLineHeight(v); }
    );
    addSwitchRow(panelBodies.editor, 'editor-word-wrap', 'Word wrap', 'Wraps lines that would be longer than the viewport.',
      function () { return p0 ? p0.readStoredEditorWordWrap() : false; },
      function (p, on) { p.writeStoredEditorWordWrap(on); }
    );

    // Editor — Indentation & saving
    addSectionHead(panelBodies.editor, 'Indentation & saving');
    addDropdownRow(panelBodies.editor, 'editor-tab-size', 'Tab size', 'Spaces per tab.',
      [{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }],
      function () { return p0 ? String(p0.readStoredEditorTabSize()) : '2'; },
      function (p, v) { p.writeStoredEditorTabSize(parseInt(v, 10)); }
    );
    addDropdownRow(panelBodies.editor, 'editor-autosave', 'Auto-save delay', 'Pause after typing before save.',
      [
        { value: '320', label: 'Fast (320ms)' },
        { value: '1000', label: 'Normal (1s)' },
        { value: '2000', label: 'Slow (2s)' },
      ],
      function () { return p0 ? String(p0.readStoredAutosaveDelay()) : '320'; },
      function (p, v) { p.writeStoredAutosaveDelay(parseInt(v, 10)); }
    );
    addDropdownRow(panelBodies.editor, 'editor-format-width', 'Format print width', 'Max width for Alt+Shift+F.',
      [
        { value: '80', label: '80 columns' },
        { value: '100', label: '100 columns' },
        { value: '120', label: '120 columns' },
      ],
      function () { return p0 ? String(p0.readStoredEditorFormatWidth()) : '80'; },
      function (p, v) { p.writeStoredEditorFormatWidth(parseInt(v, 10)); }
    );
    addSwitchRow(panelBodies.editor, 'editor-reindent-paste', 'Re-indent on paste', 'Re-indent pasted text.',
      function () { return p0 ? p0.readStoredEditorReindentPaste() : true; },
      function (p, on) { p.writeStoredEditorReindentPaste(on); }
    );
    addSwitchRow(panelBodies.editor, 'cfg-auto-sync', 'Sync suite .cfg on file ops',
      'Rewrite suite .cfg entries on same-folder rename or delete. Moves leave entries for cfg lint.',
      function () { return p0 ? p0.readStoredCfgAutoSync() : true; },
      function (p, on) { p.writeStoredCfgAutoSync(on); }
    );

    // Editor — Code insight
    addSectionHead(panelBodies.editor, 'Code insight');
    addSwitchRow(panelBodies.editor, 'editor-syntax-highlight', 'Syntax highlighting', 'Color keywords, strings, and comments.',
      function () { return p0 ? p0.readStoredEditorSyntaxHighlight() : true; },
      function (p, on) { p.writeStoredEditorSyntaxHighlight(on); }
    );
    addSwitchRow(panelBodies.editor, 'editor-semantic-highlight', 'Semantic highlighting', 'Color bound variables and declarations.',
      function () { return p0 ? p0.readStoredEditorSemanticHighlight() : true; },
      function (p, on) { p.writeStoredEditorSemanticHighlight(on); }
    );
    addSwitchRow(panelBodies.editor, 'editor-parse-highlight', 'Invalid parse styling', 'Dim tokens in broken or incomplete declarations.',
      function () { return p0 ? p0.readStoredEditorParseHighlight() : true; },
      function (p, on) { p.writeStoredEditorParseHighlight(on); }
    );
    addSwitchRow(panelBodies.editor, 'editor-occurrence-highlight', 'Occurrence highlight', 'Underline other uses of the word at the cursor.',
      function () { return p0 ? p0.readStoredEditorOccurrenceHighlight() : true; },
      function (p, on) { p.writeStoredEditorOccurrenceHighlight(on); }
    );
    addSwitchRow(panelBodies.editor, 'editor-bracket-match', 'Bracket matching', 'Highlight matching brackets.',
      function () { return p0 ? p0.readStoredEditorBracketMatch() : true; },
      function (p, on) { p.writeStoredEditorBracketMatch(on); }
    );
    addSwitchRow(panelBodies.editor, 'editor-auto-close-brackets', 'Auto-close brackets', 'Insert closing brackets automatically.',
      function () { return p0 ? p0.readStoredEditorAutoCloseBrackets() : true; },
      function (p, on) { p.writeStoredEditorAutoCloseBrackets(on); }
    );
    addSwitchRow(panelBodies.editor, 'editor-selection-matches', 'Selection matches', 'Highlight other matches of the selection.',
      function () { return p0 ? p0.readStoredEditorSelectionMatches() : true; },
      function (p, on) { p.writeStoredEditorSelectionMatches(on); }
    );
    addDropdownRow(panelBodies.editor, 'hover-scope', 'Hover tooltips',
      'Which symbols get hover tooltips. UI tooltips are unaffected.',
      [
        { value: 'all', label: 'All symbols' },
        { value: 'user-only', label: 'Identifiers only' },
        { value: 'none', label: 'Nowhere' },
      ],
      function () { return p0 ? p0.readStoredHoverScope() : 'all'; },
      function (p, v) { p.writeStoredHoverScope(v); }
    );

    // Editor — Gutter
    addSectionHead(panelBodies.editor, 'Gutter');
    addSwitchRow(panelBodies.editor, 'editor-line-numbers', 'Line numbers', 'Show line numbers in the gutter.',
      function () { return p0 ? p0.readStoredEditorLineNumbers() : true; },
      function (p, on) { p.writeStoredEditorLineNumbers(on); }
    );
    addSwitchRow(panelBodies.editor, 'editor-fold-gutter', 'Code folding', 'Fold markers in the gutter.',
      function () { return p0 ? p0.readStoredEditorFoldGutter() : true; },
      function (p, on) { p.writeStoredEditorFoldGutter(on); }
    );
    addDropdownRow(panelBodies.editor, 'editor-fold-persist', 'Remember folds', 'Where to store which blocks are folded per file.',
      [
        { value: 'none', label: 'Don\'t remember' },
        { value: 'session', label: 'This session' },
        { value: 'local', label: 'Always (local)' },
      ],
      function () { return p0 ? p0.readStoredEditorFoldPersist() : 'none'; },
      function (p, v) { p.writeStoredEditorFoldPersist(v); }
    );
    addSwitchRow(panelBodies.editor, 'editor-active-line', 'Active line highlight', 'Background on the current line.',
      function () { return p0 ? p0.readStoredEditorActiveLine() : true; },
      function (p, on) { p.writeStoredEditorActiveLine(on); }
    );
    addSwitchRow(panelBodies.editor, 'editor-diag-gutter', 'Diagnostic gutter marks', 'Mark lines with errors or warnings.',
      function () { return p0 ? p0.readStoredEditorDiagGutter() : true; },
      function (p, on) { p.writeStoredEditorDiagGutter(on); }
    );
    addSwitchRow(panelBodies.editor, 'editor-hole-gutter', 'Hole gutter marks', 'Mark lines with proof holes.',
      function () { return p0 ? p0.readStoredEditorHoleGutter() : true; },
      function (p, on) { p.writeStoredEditorHoleGutter(on); }
    );

    // Beluga
    addDropdownRow(panelBodies.beluga, 'beluga-mode', 'Engine',
      'Stable: background worker. Fast: main thread, blocks the UI.',
      [{ value: 'stable', label: 'Stable' }, { value: 'fast', label: 'Fast' }],
      function () {
        return typeof BelJarBelugaRun !== 'undefined' ? BelJarBelugaRun.getBelugaMode() : 'stable';
      },
      function (_p, m) {
        if (typeof BelJarBelugaRun !== 'undefined') BelJarBelugaRun.setBelugaMode(m);
      }
    );
    addSwitchRow(panelBodies.beluga, 'beluga-fallback-stable', 'Retry with Stable on stack overflow',
      'Fall back to Stable if Fast overflows the stack.',
      function () { return p0 ? p0.readStoredBelugaFallbackStable() : true; },
      function (p, on) { p.writeStoredBelugaFallbackStable(on); }
    );
    addSwitchRow(panelBodies.beluga, 'beluga-cancel-on-edit', 'Cancel load on edit',
      'Abort a pending load when the buffer changes.',
      function () { return p0 ? p0.readStoredBelugaCancelOnEdit() : true; },
      function (p, on) { p.writeStoredBelugaCancelOnEdit(on); }
    );

    // REPL
    addSwitchRow(panelBodies.repl, 'repl-autoscroll', 'Auto-scroll output', 'Scroll to new output.',
      function () { return p0 ? p0.readStoredReplAutoscroll() : true; },
      function (p, on) { p.writeStoredReplAutoscroll(on); }
    );
    addSwitchRow(panelBodies.repl, 'repl-welcome', 'Welcome after clear', 'Show welcome text again after /clear.',
      function () { return p0 ? p0.readStoredReplWelcome() : true; },
      function (p, on) { p.writeStoredReplWelcome(on); }
    );
    addSwitchRow(panelBodies.repl, 'repl-echo', 'Echo commands in output', 'Log each REPL command as # %:… before it runs.',
      function () { return p0 ? p0.readStoredReplEcho() : true; },
      function (p, on) { p.writeStoredReplEcho(on); }
    );
    addSwitchRow(panelBodies.repl, 'repl-filter-chatter', 'Filter run noise',
      'Hide empty [] and caret lines in output.',
      function () { return p0 ? p0.readStoredReplFilterChatter() : true; },
      function (p, on) { p.writeStoredReplFilterChatter(on); }
    );
    addDropdownRow(panelBodies.repl, 'repl-history-cap', 'Command history size', 'Commands remembered for ↑/↓.',
      [
        { value: '0', label: 'Unlimited' },
        { value: '100', label: '100 commands' },
        { value: '250', label: '250 commands' },
        { value: '500', label: '500 commands' },
      ],
      function () { return p0 ? String(p0.readStoredReplHistoryCap()) : '0'; },
      function (p, v) { p.writeStoredReplHistoryCap(parseInt(v, 10)); }
    );

    // Workspace
    addSwitchRow(panelBodies.workspace, 'restore-panels', 'Restore panel on reload',
      'Reopen the last side panel after reload.',
      function () { return p0 ? p0.readStoredRestorePanels() : true; },
      function (p, on) { p.writeStoredRestorePanels(on); }
    );
    addSwitchRow(panelBodies.workspace, 'library-expand-default', 'Expand library by default',
      'Expand all library categories on load.',
      function () { return p0 ? p0.readStoredLibraryExpandDefault() : false; },
      function (p, on) { p.writeStoredLibraryExpandDefault(on); }
    );

    var resetRow = document.createElement('div');
    resetRow.className = 'bj-dialog__setting bj-settings__action-row';
    var resetMain = document.createElement('div');
    resetMain.className = 'bj-dialog__setting-main';
    var resetLbl = document.createElement('span');
    resetLbl.className = 'bj-dialog__setting-label';
    resetLbl.textContent = 'Reset panel layout';
    var resetDesc = document.createElement('span');
    resetDesc.className = 'bj-dialog__setting-desc';
    resetDesc.textContent = 'Reset split panes and side panel sizes.';
    resetMain.appendChild(resetLbl);
    resetMain.appendChild(resetDesc);
    var resetBtn = makeResetLink(function () {
      if (!persist()) return;
      persist().resetLayoutPrefs();
      postSettingsApply('layout-reset');
      if (typeof global.location !== 'undefined') global.location.reload();
    });
    resetRow.appendChild(resetMain);
    resetRow.appendChild(resetBtn);
    panelBodies.workspace.appendChild(resetRow);

    // Aliases
    addDropdownRow(panelBodies.aliases, 'alias-activation', 'Alias expansion',
      'Strict: while typing. Greedy: also on paste, import, and library insert.',
      [{ value: 'strict', label: 'Strict' }, { value: 'greedy', label: 'Greedy' }],
      function () { return p0 ? p0.readStoredAliasActivation() : 'strict'; },
      function (p, v) {
        p.writeStoredAliasActivation(v);
        if (v !== 'greedy') return;
        var ed = global.BelJarCurrentEditor;
        if (ed && typeof ed.getValue === 'function') {
          var activeId = p.getActiveFileId();
          if (activeId) p.setFileText(activeId, ed.getValue());
        }
        p.expandAliasesInAllFiles();
        if (!ed || typeof ed.getValue !== 'function' || typeof ed.setValue !== 'function') return;
        if (typeof BelJarEditor === 'undefined' || typeof BelJarEditor.expandBelAliases !== 'function') return;
        var cur = ed.getValue();
        var next = BelJarEditor.expandBelAliases(cur);
        if (next !== cur) ed.setValue(next);
      }
    );

    selectCategory(activeCategory);

    shell.appendChild(nav);
    shell.appendChild(main);

    if (typeof BelJarDialog === 'undefined') return null;
    settingsDialogEl = BelJarDialog.createDialog({
      title: 'Settings',
      content: shell,
      cardClass: 'bj-dialog__card--settings',
      removeOnClose: false,
    });
    return settingsDialogEl;
  }

  function open() {
    ensureSettingsDialog();
    syncFromState();
    if (typeof BelJarDialog !== 'undefined') BelJarDialog.openDialog(settingsDialogEl);
  }

  global.BelJarSettingsUI = {
    syncFromState: syncFromState,
    ensureSettingsDialog: ensureSettingsDialog,
    open: open,
    notifySettingsChanged: notifySettingsChanged,
  };
})(typeof window !== 'undefined' ? window : globalThis);
