'use strict';

(function (global) {
  var settingsDialogEl = null;
  var settingsModeDropdown = null;
  var settingsHoverDropdown = null;
  var settingsAliasDropdown = null;

  function syncFromState() {
    if (settingsModeDropdown) {
      settingsModeDropdown.setValue(
        typeof BelJarBelugaRun !== 'undefined' ? BelJarBelugaRun.getBelugaMode() : 'stable'
      );
    }
    if (settingsHoverDropdown) {
      settingsHoverDropdown.setValue(
        typeof BelJarPersist !== 'undefined' ? BelJarPersist.readStoredHoverScope() : 'all'
      );
    }
    if (settingsAliasDropdown) {
      settingsAliasDropdown.setValue(
        typeof BelJarPersist !== 'undefined' ? BelJarPersist.readStoredAliasActivation() : 'strict'
      );
    }
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
        if (opt.value !== selected) { setValue(opt.value); onChange(opt.value); }
        close();
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
    }

    function close() {
      container.classList.remove('is-open');
      panel.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
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
    return { element: container, setValue: setValue };
  }

  function ensureSettingsDialog() {
    if (settingsDialogEl) return settingsDialogEl;

    var currentMode = typeof BelJarBelugaRun !== 'undefined' ? BelJarBelugaRun.getBelugaMode() : 'stable';
    var currentHoverScope = typeof BelJarPersist !== 'undefined'
      ? BelJarPersist.readStoredHoverScope()
      : 'all';
    var currentAliasActivation = typeof BelJarPersist !== 'undefined'
      ? BelJarPersist.readStoredAliasActivation()
      : 'strict';

    function addDropdownRow(parent, labelText, descText, options, currentVal, onChange) {
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
      var dd = createDropdown(options, currentVal, onChange);
      r.appendChild(m);
      r.appendChild(dd.element);
      parent.appendChild(r);
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
      { id: 'beluga', label: 'Beluga' },
      { id: 'editor', label: 'Editor' },
      { id: 'repl', label: 'REPL' },
      { id: 'keybindings', label: 'Keybindings' },
      { id: 'aliases', label: 'Aliases' },
    ];

    var panelBodies = {};
    var activeCategory = 'beluga';

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
      head.textContent = cat.label;
      panel.appendChild(head);

      var body = document.createElement('div');
      body.className = 'bj-settings__panel-body';
      panel.appendChild(body);

      panelBodies[cat.id] = body;
      main.appendChild(panel);
    });

    settingsModeDropdown = addDropdownRow(
      panelBodies.beluga,
      'Engine',
      'Stable runs in a worker and never crashes. Fast runs on the main thread and may be quicker for small files.',
      [{ value: 'stable', label: 'Stable' }, { value: 'fast', label: 'Fast' }],
      currentMode,
      function (m) {
        if (typeof BelJarBelugaRun !== 'undefined') BelJarBelugaRun.setBelugaMode(m);
      }
    );

    settingsHoverDropdown = addDropdownRow(
      panelBodies.editor,
      'Hover tooltips',
      'Choose which tokens show a tooltip on hover.',
      [
        { value: 'all',       label: 'All symbols' },
        { value: 'user-only', label: 'Identifiers only' },
      ],
      currentHoverScope,
      function (v) {
        if (typeof BelJarPersist !== 'undefined') BelJarPersist.writeStoredHoverScope(v);
      }
    );

    settingsAliasDropdown = addDropdownRow(
      panelBodies.aliases,
      'Substitution activation',
      'Strict expands only when you type an alias character by character without backspace or interruption. Greedy expands whenever an alias sequence appears, including paste, upload, folder import, and library insertion.',
      [
        { value: 'strict', label: 'Strict' },
        { value: 'greedy', label: 'Greedy' },
      ],
      currentAliasActivation,
      function (v) {
        if (typeof BelJarPersist !== 'undefined') BelJarPersist.writeStoredAliasActivation(v);
        if (v !== 'greedy') return;
        var ed = global.BelJarCurrentEditor;
        if (ed && typeof ed.getValue === 'function' && typeof BelJarPersist !== 'undefined') {
          var activeId = BelJarPersist.getActiveFileId();
          if (activeId) BelJarPersist.setFileText(activeId, ed.getValue());
        }
        if (typeof BelJarPersist !== 'undefined') BelJarPersist.expandAliasesInAllFiles();
        if (!ed || typeof ed.getValue !== 'function' || typeof ed.setValue !== 'function') return;
        if (typeof BelJarEditor === 'undefined' || typeof BelJarEditor.expandBelAliases !== 'function') return;
        var cur = ed.getValue();
        var next = BelJarEditor.expandBelAliases(cur);
        if (next !== cur) ed.setValue(next);
      }
    );

    ['repl', 'keybindings'].forEach(function (id) {
      var empty = document.createElement('p');
      empty.className = 'bj-settings__empty';
      empty.textContent = 'No settings in this category yet.';
      panelBodies[id].appendChild(empty);
    });

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
  };
})(typeof window !== 'undefined' ? window : globalThis);
