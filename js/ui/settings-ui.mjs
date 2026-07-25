'use strict';

const global = globalThis;
  var settingsDialogEl = null;
  var keybindingsApi = null;
  var controls = {};

  function persist() {
    return Persist
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
    Dropdown.closeAll();
    applyLiveSettings(key);
    postSettingsApply(key);
  }

  function runCategoryReset(applyReset, notifyKey) {
    Dropdown.closeAll();
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

  function mountKeybindingsPanel(body) {
    body.classList.add('bj-settings__panel-body--kb');

    var root = document.createElement('div');
    root.className = 'bj-kb';

    var filterWrap = document.createElement('div');
    filterWrap.className = 'bj-kb__filter';

    var hint = document.createElement('p');
    hint.className = 'bj-kb__hint';
    hint.textContent = 'Click a row to change the keybindings.';

    var searchSlot = document.createElement('div');
    searchSlot.className = 'bj-kb__search-slot';

    var inputWrap = document.createElement('div');
    inputWrap.className = 'bel-palette-inputwrap bj-kb__search';

    var iconHost = document.createElement('span');
    iconHost.className = 'bel-palette-icon';
    iconHost.setAttribute('aria-hidden', 'true');
    iconHost.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

    var input = document.createElement('input');
    input.type = 'search';
    input.className = 'bel-palette-input';
    input.placeholder = 'Search commands';
    input.setAttribute('aria-label', 'Search commands');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', 'bj-kb-search-results');
    input.autocomplete = 'off';
    input.spellcheck = false;

    var results = document.createElement('div');
    results.className = 'bj-kb__results';
    results.id = 'bj-kb-search-results';
    results.setAttribute('role', 'listbox');
    results.hidden = true;

    inputWrap.appendChild(iconHost);
    inputWrap.appendChild(input);
    searchSlot.appendChild(inputWrap);
    filterWrap.appendChild(hint);
    filterWrap.appendChild(searchSlot);

    var list = document.createElement('div');
    list.className = 'bj-kb__list';
    list.setAttribute('role', 'list');

    root.appendChild(filterWrap);
    root.appendChild(list);
    body.appendChild(root);

    var recordingChord = null;
    var invalidTimer = null;
    var searchHits = [];
    var searchActive = -1;
    var flashTimer = null;

    function toastWarn(message) {
      if (global.Toasts && typeof global.Toasts.warn === 'function') {
        global.Toasts.warn(message);
      } else if (global.Toasts && typeof global.Toasts.show === 'function') {
        global.Toasts.show(message, { kind: 'warn' });
      }
    }

    function kb() {
      return Keybindings
    }

    function resultsMountEl() {
      var el = searchSlot.parentElement;
      while (el && el.tagName !== 'DIALOG') el = el.parentElement;
      return el || document.body;
    }

    function positionSearchResults() {
      if (results.hidden || !results.classList.contains('is-open')) return;
      var rect = inputWrap.getBoundingClientRect();
      var width = Math.max(Math.round(rect.width), 220);
      results.style.width = width + 'px';
      results.style.minWidth = width + 'px';
      var ph = results.offsetHeight || 1;
      if (typeof FloatingRectPlacement !== 'undefined' && FloatingRectPlacement.computePosition) {
        var pos = FloatingRectPlacement.computePosition({
          anchor: rect,
          width: width,
          height: ph,
          mode: 'menu',
          side: 'bottom',
          align: 'end',
          gap: 5,
          margin: 8,
        });
        results.style.top = pos.y + 'px';
        results.style.left = pos.x + 'px';
      } else {
        results.style.top = Math.round(rect.bottom + 5) + 'px';
        results.style.left = Math.round(rect.right - width) + 'px';
      }
    }

    function closeSearchResults() {
      searchHits = [];
      searchActive = -1;
      results.replaceChildren();
      results.hidden = true;
      results.classList.remove('is-open');
      input.setAttribute('aria-expanded', 'false');
      window.removeEventListener('resize', positionSearchResults);
      window.removeEventListener('scroll', positionSearchResults, true);
    }

    function openSearchResultsPanel() {
      var mount = resultsMountEl();
      if (results.parentElement !== mount) mount.appendChild(results);
      results.hidden = false;
      results.classList.add('is-open');
      input.setAttribute('aria-expanded', 'true');
      positionSearchResults();
      window.addEventListener('resize', positionSearchResults);
      window.addEventListener('scroll', positionSearchResults, true);
    }

    function setSearchActive(idx) {
      var items = results.querySelectorAll('.bj-kb__result');
      searchActive = idx;
      for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('is-active', i === idx);
        if (i === idx) items[i].setAttribute('aria-selected', 'true');
        else items[i].removeAttribute('aria-selected');
      }
    }

    function jumpToCommand(commandId) {
      if (!commandId) return;
      var row = list.querySelector('.bj-kb__row[data-command-id="' + commandId.replace(/"/g, '') + '"]');
      if (!row) return;
      closeSearchResults();
      input.value = '';
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      list.querySelectorAll('.bj-kb__row.is-flash').forEach(function (el) {
        el.classList.remove('is-flash');
      });
      row.classList.add('is-flash');
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(function () {
        flashTimer = null;
        row.classList.remove('is-flash');
      }, 1100);
    }

    function renderSearchResults(q) {
      var query = String(q || '').trim().toLowerCase();
      closeSearchResults();
      if (!query) return;

      var rows = list.querySelectorAll('.bj-kb__row');
      var hits = [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var title = row.dataset.title || '';
        if (title.indexOf(query) < 0) continue;
        hits.push({
          id: row.dataset.commandId || '',
          title: (row.querySelector('.bj-kb__title') || {}).textContent || title,
          section: row.dataset.section || '',
        });
        if (hits.length >= 12) break;
      }

      if (!hits.length) {
        var empty = document.createElement('div');
        empty.className = 'bj-kb__results-empty';
        empty.textContent = 'No matching commands';
        results.appendChild(empty);
        openSearchResultsPanel();
        return;
      }

      searchHits = hits;
      for (var h = 0; h < hits.length; h++) {
        (function (hit, index) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'bj-kb__result';
          btn.setAttribute('role', 'option');
          btn.dataset.commandId = hit.id;

          var head = document.createElement('span');
          head.className = 'bj-kb__result-head';

          var titleEl = document.createElement('span');
          titleEl.className = 'bj-kb__result-title';
          titleEl.textContent = hit.title;

          var sectionEl = document.createElement('span');
          sectionEl.className = 'bj-kb__result-section';
          sectionEl.textContent = hit.section;

          head.appendChild(titleEl);
          head.appendChild(sectionEl);
          btn.appendChild(head);
          btn.addEventListener('mousedown', function (e) {
            e.preventDefault();
          });
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            jumpToCommand(hit.id);
          });
          results.appendChild(btn);
        })(hits[h], h);
      }
      openSearchResultsPanel();
      setSearchActive(0);
    }

    function partsFor(spec) {
      var K = kb();
      if (K && typeof K.shortcutParts === 'function') return K.shortcutParts(spec);
      if (typeof CommandPalette.shortcutParts === 'function') {
        return CommandPalette.shortcutParts(spec);
      }
      return String(spec || '').split('+').filter(Boolean);
    }

    function labelFor(spec) {
      var K = kb();
      if (K && typeof K.formatShortcut === 'function') return K.formatShortcut(spec) || '';
      if (typeof CommandPalette.shortcutLabel === 'function') {
        return CommandPalette.shortcutLabel(spec) || '';
      }
      return String(spec || '');
    }

    function fillChord(chordBtn, spec, opts) {
      chordBtn.replaceChildren();
      chordBtn._shortcutSpec = spec || '';
      chordBtn.classList.remove('bj-kb__chord--conflict', 'is-recording', 'is-empty');
      if (opts && opts.conflict) chordBtn.classList.add('bj-kb__chord--conflict');
      var label = labelFor(spec);
      if (!spec) {
        chordBtn.classList.add('is-empty');
        chordBtn.setAttribute('aria-label', 'No keybinding');
        var empty = document.createElement('span');
        empty.className = 'bj-kb__empty-mark';
        empty.textContent = '\u2014';
        empty.setAttribute('aria-hidden', 'true');
        chordBtn.appendChild(empty);
        return;
      }
      chordBtn.setAttribute('aria-label', label || spec);
      var parts = partsFor(spec);
      for (var i = 0; i < parts.length; i++) {
        var k = document.createElement('kbd');
        k.className = 'bj-kb__key';
        k.textContent = parts[i];
        chordBtn.appendChild(k);
      }
    }

    function showRecordingHint(chordBtn) {
      chordBtn.classList.add('is-recording');
      chordBtn.classList.remove('is-empty', 'bj-kb__chord--conflict');
      chordBtn.replaceChildren();
      var hint = document.createElement('span');
      hint.className = 'bj-kb__record-hint';
      hint.textContent = 'Press keys\u2026';
      chordBtn.appendChild(hint);
    }

    function showRefuse(chordBtn, message) {
      toastWarn(message);
      showRecordingHint(chordBtn);
      chordBtn.classList.add('is-invalid');
      chordBtn.focus();
      if (invalidTimer) clearTimeout(invalidTimer);
      invalidTimer = setTimeout(function () {
        invalidTimer = null;
        if (chordBtn) chordBtn.classList.remove('is-invalid');
      }, 400);
    }

    function refuseMessage(K, result, spec) {
      var label = labelFor(spec) || String(spec || '');
      var quoted = '"' + label + '"';
      if (result && result.reason === 'conflict') {
        var title = (typeof K.titleFor === 'function' && result.conflictId)
          ? K.titleFor(result.conflictId)
          : result.conflictId || 'another command';
        return quoted + ' is already bound to "' + title + '"';
      }
      return quoted + ' is a reserved sequence';
    }

    function clearRecording() {
      if (invalidTimer) {
        clearTimeout(invalidTimer);
        invalidTimer = null;
      }
      if (!recordingChord) return;
      var btn = recordingChord;
      recordingChord = null;
      btn.classList.remove('is-recording', 'is-invalid');
      fillChord(btn, btn._shortcutSpec || '', {
        conflict: !!(kb() && btn._shortcutSpec && kb().findConflict(btn._shortcutSpec, btn._commandId)),
      });
    }

    function startRecording(chordBtn) {
      clearRecording();
      recordingChord = chordBtn;
      showRecordingHint(chordBtn);
      chordBtn.focus();
    }

    function commitRecording(chordBtn, spec) {
      var K = kb();
      var id = chordBtn._commandId;
      if (!K || !id) {
        clearRecording();
        return;
      }
      var result = K.setBinding(id, spec);
      if (!result || !result.ok) {
        showRefuse(chordBtn, refuseMessage(K, result, spec));
        return;
      }
      recordingChord = null;
      chordBtn.classList.remove('is-recording', 'is-invalid');
      refresh();
    }

    function unbindRecording(chordBtn) {
      var K = kb();
      var id = chordBtn._commandId;
      if (K && id) K.clearBinding(id);
      recordingChord = null;
      chordBtn.classList.remove('is-recording', 'is-invalid');
      refresh();
    }

    function buildRow(cmd) {
      var row = document.createElement('div');
      row.className = 'bj-kb__row' + (cmd.isUser ? ' bj-kb__row--user' : '');
      row.setAttribute('role', 'listitem');
      row.dataset.commandId = cmd.id || '';
      row.dataset.section = cmd.section || '';
      row.dataset.title = String(cmd.title || '').toLowerCase();

      var chordLabel = labelFor(cmd.spec);
      row.dataset.chord = chordLabel.toLowerCase();

      var main = document.createElement('div');
      main.className = 'bj-kb__main';
      var title = document.createElement('span');
      title.className = 'bj-kb__title';
      title.textContent = cmd.title || cmd.id || '';
      main.appendChild(title);

      var chord = document.createElement('button');
      chord.type = 'button';
      chord.className = 'bj-kb__chord';
      chord._commandId = cmd.id;
      var conflictId = kb() && cmd.spec ? kb().findConflict(cmd.spec, cmd.id) : null;
      fillChord(chord, cmd.spec || '', { conflict: !!conflictId });

      function activateRow() {
        if (recordingChord === chord) clearRecording();
        else startRecording(chord);
      }

      row.addEventListener('click', function () {
        activateRow();
      });
      chord.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        activateRow();
      });
      chord.addEventListener('keydown', function (e) {
        if (!chord.classList.contains('is-recording')) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') {
          clearRecording();
          return;
        }
        if (e.key === 'Backspace') {
          unbindRecording(chord);
          return;
        }
        var K = kb();
        if (!K) return;
        var spec = K.specFromEvent(e);
        if (!spec) return;
        commitRecording(chord, spec);
      });
      chord.addEventListener('blur', function () {
        if (recordingChord === chord) clearRecording();
      });

      row.appendChild(main);
      row.appendChild(chord);
      return row;
    }

    function refresh() {
      clearRecording();
      list.replaceChildren();

      var K = kb();
      var cmds = K && typeof K.list === 'function' ? K.list() : [];

      var empty = document.createElement('p');
      empty.className = 'bj-settings__empty bj-kb__empty';
      empty.hidden = true;
      list.appendChild(empty);

      if (!cmds.length) {
        empty.hidden = false;
        empty.textContent = 'No keybindings.';
        return;
      }

      var lastSection = null;
      for (var i = 0; i < cmds.length; i++) {
        var cmd = cmds[i];
        var section = cmd.section || 'Other';
        if (section !== lastSection) {
          var head = document.createElement('div');
          head.className = 'bj-settings__section-head bj-kb__section';
          head.dataset.section = section;
          head.textContent = section;
          list.appendChild(head);
          lastSection = section;
        }
        list.appendChild(buildRow(cmd));
      }
    }

    input.addEventListener('input', function () {
      renderSearchResults(input.value);
    });
    input.addEventListener('keydown', function (e) {
      if (results.hidden) {
        if (e.key === 'Escape') input.blur();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!searchHits.length) return;
        setSearchActive(Math.min(searchActive + 1, searchHits.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!searchHits.length) return;
        setSearchActive(Math.max(searchActive - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (searchActive >= 0 && searchHits[searchActive]) {
          jumpToCommand(searchHits[searchActive].id);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSearchResults();
        input.value = '';
      }
    });
    input.addEventListener('blur', function () {
      setTimeout(function () {
        var ae = document.activeElement;
        if (searchSlot.contains(ae) || results.contains(ae)) return;
        closeSearchResults();
      }, 0);
    });

    refresh();

    return {
      refresh: function () {
        closeSearchResults();
        input.value = '';
        refresh();
      },
      clearRecording: clearRecording,
      filterInput: input,
    };
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
    var toggle = Toggle.create({
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
      var dd = Dropdown.create(options, readFn(), function (v) {
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
      { id: 'keybindings', label: 'Keybindings' },
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
      if (id === 'keybindings' && keybindingsApi) keybindingsApi.refresh();
      else if (keybindingsApi) keybindingsApi.clearRecording();
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

    attachPanelReset(main.querySelector('[data-category="keybindings"]'), function () {
      Keybindings.resetAll();
      if (keybindingsApi) keybindingsApi.refresh();
    });

    attachPanelReset(main.querySelector('[data-category="beluga"]'), function () {
      runCategoryReset(function (p) {
        p.resetBelugaPrefs();
        BelugaRun.setBelugaMode('stable');
      }, 'beluga-reset');
    });

    attachPanelReset(main.querySelector('[data-category="repl"]'), function () {
      runCategoryReset(function (p) { p.resetReplPrefs(); }, 'repl-reset');
    });

    attachPanelReset(main.querySelector('[data-category="workspace"]'), function () {
      runCategoryReset(function (p) {
        p.resetWorkspacePrefs();
        global.dispatchEvent(new CustomEvent('beljar:inspector-follow-changed', { detail: { on: true } }));
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

    // Keybindings (UX shell — remapping wired later)
    keybindingsApi = mountKeybindingsPanel(panelBodies.keybindings);

    // Beluga
    addDropdownRow(panelBodies.beluga, 'beluga-mode', 'Engine',
      'Stable: background worker. Fast: main thread, blocks the UI.',
      [{ value: 'stable', label: 'Stable' }, { value: 'fast', label: 'Fast' }],
      function () {
        return BelugaRun.getBelugaMode()
      },
      function (_p, m) {
        BelugaRun.setBelugaMode(m);
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
    addSwitchRow(panelBodies.repl, 'repl-welcome', 'Banner after clear', 'Show the Beluga version line again after clear.',
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
    addDropdownRow(panelBodies.repl, 'repl-history-persist', 'Remember history',
      'Transcript and ↑/↓ commands: this session (sessionStorage), until reset (localStorage), or never.',
      [
        { value: 'session', label: 'Across sessions' },
        { value: 'local', label: 'Until reset' },
        { value: 'none', label: 'Never' },
      ],
      function () { return p0 ? p0.readStoredReplHistoryPersist() : 'local'; },
      function (p, v) { p.writeStoredReplHistoryPersist(v); }
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
        var ed = global.CurrentEditor;
        if (ed && typeof ed.getValue === 'function') {
          var activeId = p.getActiveFileId();
          if (activeId) p.setFileText(activeId, ed.getValue());
        }
        p.expandAliasesInAllFiles();
        if (!ed || typeof ed.getValue !== 'function' || typeof ed.setValue !== 'function') return;
        if (typeof BelEditor === 'undefined' || typeof BelEditor.expandBelAliases !== 'function') return;
        var cur = ed.getValue();
        var next = BelEditor.expandBelAliases(cur);
        if (next !== cur) ed.setValue(next);
      }
    );

    selectCategory(activeCategory);

    shell.appendChild(nav);
    shell.appendChild(main);

    settingsDialogEl = Dialog.createDialog({
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
    if (keybindingsApi) keybindingsApi.refresh();
    Dialog.openDialog(settingsDialogEl);
  }

  global.SettingsUI = {
    syncFromState: syncFromState,
    ensureSettingsDialog: ensureSettingsDialog,
    open: open,
    notifySettingsChanged: notifySettingsChanged,
  };
  global.BelJarSettingsUI = global.SettingsUI;
