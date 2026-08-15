'use strict';

const global = globalThis;
  var settingsDialogEl = null;
  var keybindingsApi = null;
  var aliasesApi = null;
  var controls = {};
  var settingsSearchInput = null;
  var closeSettingsSearch = null;

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

  function resetAllSettings() {
    runCategoryReset(function (p) {
      p.resetAppearancePrefs();
      document.documentElement.classList.remove('light');
      if (typeof p.applyStoredUiFontSize === 'function') p.applyStoredUiFontSize();
      if (typeof p.applyStoredUiTextContrast === 'function') p.applyStoredUiTextContrast();
      if (typeof p.applyStoredMotionPref === 'function') p.applyStoredMotionPref();
      if (typeof global.syncEditorCmTheme === 'function') global.syncEditorCmTheme();

      p.resetEditorPrefs();
      if (typeof p.applyStoredEditorChrome === 'function') p.applyStoredEditorChrome();

      p.resetBelugaPrefs();
      BelugaRun.setBelugaMode('stable');

      p.resetReplPrefs();

      p.resetWorkspacePrefs();
      var on = typeof p.readStoredInspectorFollow === 'function' ? p.readStoredInspectorFollow() : true;
      global.dispatchEvent(new CustomEvent('beljar:inspector-follow-changed', { detail: { on: on } }));

      p.resetAliasesPrefs();
    }, 'settings-reset-all');
    Keybindings.resetAll();
    if (keybindingsApi) keybindingsApi.refresh();
    if (aliasesApi) aliasesApi.refresh();
    if (global.Toasts && typeof global.Toasts.success === 'function') {
      global.Toasts.success('All settings reset.');
    }
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

  function addActionRow(parent, labelText, descText, actionLabel, onClick) {
    var row = document.createElement('div');
    row.className = 'bj-dialog__setting bj-settings__action-row';
    var main = document.createElement('div');
    main.className = 'bj-dialog__setting-main';
    var lbl = document.createElement('span');
    lbl.className = 'bj-dialog__setting-label';
    lbl.textContent = labelText;
    var dsc = document.createElement('span');
    dsc.className = 'bj-dialog__setting-desc';
    dsc.textContent = descText;
    main.appendChild(lbl);
    main.appendChild(dsc);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bj-settings__action-btn';
    btn.textContent = actionLabel;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    row.appendChild(main);
    row.appendChild(btn);
    parent.appendChild(row);
    return row;
  }

  function makeSearchField(opts) {
    var slot = document.createElement('div');
    slot.className = opts.slotClass;

    var inputWrap = document.createElement('div');
    inputWrap.className = 'library-find library-find--preview ' + opts.wrapClass;

    var iconHost = document.createElement('span');
    iconHost.className = 'library-find__icon';
    iconHost.setAttribute('aria-hidden', 'true');
    iconHost.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

    var input = document.createElement('input');
    input.type = 'search';
    input.className = 'library-find__input';
    input.placeholder = opts.placeholder;
    input.setAttribute('aria-label', opts.ariaLabel);
    input.autocomplete = 'off';
    input.spellcheck = false;
    if (opts.ariaControls) {
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-controls', opts.ariaControls);
    }

    input.addEventListener('focus', function () {
      inputWrap.classList.add('is-focused');
    });
    input.addEventListener('blur', function () {
      inputWrap.classList.remove('is-focused');
    });

    inputWrap.appendChild(iconHost);
    inputWrap.appendChild(input);
    slot.appendChild(inputWrap);
    return { slot: slot, inputWrap: inputWrap, input: input };
  }

  function addEditorUnit(parent, opts) {
    var unit = document.createElement('div');
    unit.className = 'bj-settings__unit' + (opts.kind ? ' bj-settings__unit--' + opts.kind : '');

    var body = document.createElement('div');
    body.className = 'bj-settings__unit-body';

    if (opts.searchText) unit.dataset.search = opts.searchText;

    unit.appendChild(body);
    parent.appendChild(unit);
    return { unit: unit, body: body };
  }

  function mountKeybindingsSheet(body) {
    var root = document.createElement('div');
    root.className = 'bj-kb';

    var list = document.createElement('div');
    list.className = 'bj-kb__list';
    list.setAttribute('role', 'list');

    root.appendChild(list);
    body.appendChild(root);

    var recordingChord = null;
    var invalidTimer = null;

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

      if (!cmds.length) {
        var empty = document.createElement('p');
        empty.className = 'bj-settings__empty bj-kb__empty';
        empty.textContent = 'No keybindings.';
        list.appendChild(empty);
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

    refresh();

    return {
      refresh: refresh,
      clearRecording: clearRecording,
    };
  }

  function mountAliasesSheet(body) {
    var root = document.createElement('div');
    root.className = 'bj-alias';

    var list = document.createElement('div');
    list.className = 'bj-alias__list';
    list.setAttribute('role', 'list');

    var footer = document.createElement('div');
    footer.className = 'bj-alias__footer';

    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'bj-alias__add';
    addBtn.textContent = 'Add alias';
    footer.appendChild(addBtn);

    root.appendChild(list);
    root.appendChild(footer);
    body.appendChild(root);

    var nextRowId = 1;
    var rows = [];
    var CLOSE_SVG =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

    function toastWarn(message) {
      if (global.Toasts && typeof global.Toasts.warn === 'function') {
        global.Toasts.warn(message);
      } else if (global.Toasts && typeof global.Toasts.show === 'function') {
        global.Toasts.show(message, { kind: 'warn' });
      }
    }

    function setTip(el, text) {
      if (global.Tooltips && typeof global.Tooltips.set === 'function') {
        global.Tooltips.set(el, text);
      } else {
        el.setAttribute('aria-label', text);
      }
    }

    function normalizePairs(raw) {
      if (typeof BelEditor !== 'undefined' && typeof BelEditor.normalizeAliasPairs === 'function') {
        return BelEditor.normalizeAliasPairs(raw);
      }
      var seen = Object.create(null);
      var out = [];
      (Array.isArray(raw) ? raw : []).forEach(function (item) {
        var from = '';
        var to = '';
        if (Array.isArray(item)) {
          from = String(item[0] || '');
          to = String(item[1] || '');
        }
        from = from.trim();
        if (!from || to === '' || seen[from]) return;
        seen[from] = true;
        out.push([from, to]);
      });
      return out.sort(function (a, b) {
        return b[0].length - a[0].length || a[0].localeCompare(b[0]);
      });
    }

    function defaultPairs() {
      if (typeof BelEditor !== 'undefined' && typeof BelEditor.defaultAliasPairs === 'function') {
        return BelEditor.defaultAliasPairs();
      }
      if (typeof BelEditor !== 'undefined' && Array.isArray(BelEditor.ALIAS_PAIRS)) {
        return BelEditor.ALIAS_PAIRS.slice();
      }
      return [];
    }

    function loadPairs() {
      var p = persist();
      var stored = p && typeof p.readStoredAliasPairs === 'function' ? p.readStoredAliasPairs() : null;
      return stored == null ? defaultPairs() : normalizePairs(stored);
    }

    function pairsFromRows() {
      return normalizePairs(rows.map(function (r) { return [r.from, r.to]; }));
    }

    function rowsFromPairs(pairs) {
      var sorted = pairs.slice().sort(function (a, b) {
        return a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]);
      });
      return sorted.map(function (pair) {
        return { id: nextRowId++, from: pair[0], to: pair[1] };
      });
    }

    function commit(notifyKey) {
      writePersist(notifyKey || 'alias-pairs', function (p) {
        if (typeof p.writeStoredAliasPairs === 'function') {
          p.writeStoredAliasPairs(pairsFromRows());
        }
      });
    }

    function findDuplicate(from, exceptId) {
      var needle = String(from || '').trim();
      if (!needle) return null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === exceptId) continue;
        if (rows[i].from.trim() === needle) return rows[i];
      }
      return null;
    }

    function buildRow(row) {
      var el = document.createElement('div');
      el.className = 'bj-alias__row';
      el.setAttribute('role', 'listitem');
      el.dataset.rowId = String(row.id);

      var trigger = document.createElement('input');
      trigger.type = 'text';
      trigger.className = 'bj-alias__input bj-alias__input--trigger';
      trigger.value = row.from;
      trigger.placeholder = 'trigger';
      trigger.spellcheck = false;
      trigger.autocomplete = 'off';
      trigger.setAttribute('aria-label', 'Alias trigger');

      var arrow = document.createElement('span');
      arrow.className = 'bj-alias__arrow';
      arrow.textContent = '\u2192';
      arrow.setAttribute('aria-hidden', 'true');

      var expansion = document.createElement('input');
      expansion.type = 'text';
      expansion.className = 'bj-alias__input bj-alias__input--expansion';
      expansion.value = row.to;
      expansion.placeholder = 'expansion';
      expansion.spellcheck = false;
      expansion.autocomplete = 'off';
      expansion.setAttribute('aria-label', 'Alias expansion');

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn bj-alias__delete';
      del.innerHTML = CLOSE_SVG;
      setTip(del, 'Delete alias');

      var touchedFrom = false;
      var touchedTo = false;

      function refreshInvalid() {
        var hasFrom = !!row.from.trim();
        var hasTo = row.to !== '';
        if (!hasFrom && !hasTo) {
          trigger.classList.remove('is-invalid');
          expansion.classList.remove('is-invalid');
          return;
        }
        trigger.classList.toggle('is-invalid', touchedFrom && !hasFrom);
        expansion.classList.toggle('is-invalid', touchedTo && !hasTo);
      }

      function applyField(field, value) {
        var prevFrom = row.from;
        var prevTo = row.to;
        if (field === 'from') {
          touchedFrom = true;
          var nextFrom = String(value || '').trim();
          if (nextFrom && findDuplicate(nextFrom, row.id)) {
            toastWarn('Alias "' + nextFrom + '" already exists');
            trigger.value = row.from;
            refreshInvalid();
            return false;
          }
          row.from = nextFrom;
          trigger.value = nextFrom;
        } else {
          touchedTo = true;
          row.to = String(value || '');
        }
        refreshInvalid();
        if (row.from === prevFrom && row.to === prevTo) return false;
        if (row.from.trim() && row.to !== '') commit();
        return true;
      }

      trigger.addEventListener('input', function () {
        if (String(trigger.value || '').trim()) trigger.classList.remove('is-invalid');
      });
      expansion.addEventListener('input', function () {
        if (expansion.value !== '') expansion.classList.remove('is-invalid');
      });
      trigger.addEventListener('change', function () {
        applyField('from', trigger.value);
      });
      trigger.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyField('from', trigger.value);
          expansion.focus();
          expansion.select();
        }
      });
      expansion.addEventListener('change', function () {
        applyField('to', expansion.value);
      });
      expansion.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyField('to', expansion.value);
          expansion.blur();
        }
      });

      del.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        rows = rows.filter(function (r) { return r.id !== row.id; });
        commit();
        render();
      });

      el.appendChild(trigger);
      el.appendChild(arrow);
      el.appendChild(expansion);
      el.appendChild(del);
      return el;
    }

    function render() {
      list.replaceChildren();
      footer.hidden = false;

      if (!rows.length) {
        var emptyAll = document.createElement('p');
        emptyAll.className = 'bj-settings__empty bj-alias__empty';
        emptyAll.textContent = 'No aliases. Add one to expand text while typing.';
        list.appendChild(emptyAll);
        return;
      }

      rows.forEach(function (row) {
        list.appendChild(buildRow(row));
      });
    }

    function reload() {
      rows = rowsFromPairs(loadPairs());
      render();
    }

    addBtn.addEventListener('click', function () {
      if (typeof closeSettingsSearch === 'function') closeSettingsSearch(true);
      var row = { id: nextRowId++, from: '', to: '' };
      rows.push(row);
      render();
      var triggerEl = list.querySelector('[data-row-id="' + row.id + '"] .bj-alias__input--trigger');
      if (triggerEl) triggerEl.focus();
    });

    reload();

    return {
      refresh: reload,
      list: function () {
        return rows.filter(function (r) {
          return !!(r.from && r.from.trim() && r.to !== '');
        }).map(function (r) {
          return { id: r.id, from: r.from, to: r.to };
        });
      },
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
    nav.setAttribute('aria-label', 'Settings');

    var navList = document.createElement('div');
    navList.className = 'bj-settings__nav-list';
    navList.setAttribute('role', 'tablist');
    navList.setAttribute('aria-label', 'Settings categories');

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
      if (id !== 'keybindings' && keybindingsApi) keybindingsApi.clearRecording();
      if (searchResults && !searchResults.hidden && settingsSearchInput && settingsSearchInput.value) {
        runSettingsSearch(settingsSearchInput.value);
      }
    }

    function visibleCategoryIds() {
      return categories.map(function (c) { return c.id; }).filter(function (id) {
        var btn = nav.querySelector('.bj-settings__nav-item[data-category="' + id + '"]');
        return btn && !btn.hidden;
      });
    }

    function moveCategory(fromId, delta) {
      var ids = visibleCategoryIds();
      var idx = ids.indexOf(fromId);
      if (idx < 0) idx = 0;
      var next = ids[Math.max(0, Math.min(ids.length - 1, idx + delta))];
      if (!next) return;
      selectCategory(next);
      var focusBtn = nav.querySelector('[data-category="' + activeCategory + '"]');
      if (focusBtn) focusBtn.focus();
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
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveCategory(cat.id, 1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveCategory(cat.id, -1);
        }
      });
      navList.appendChild(btn);

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

    nav.appendChild(navList);

    var navFoot = document.createElement('div');
    navFoot.className = 'bj-settings__nav-foot';
    var resetAllBtn = document.createElement('button');
    resetAllBtn.type = 'button';
    resetAllBtn.className = 'bj-settings__reset-all';
    resetAllBtn.textContent = 'Reset all';
    resetAllBtn.setAttribute('aria-label', 'Reset all settings');
    resetAllBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      resetAllSettings();
    });
    navFoot.appendChild(resetAllBtn);
    nav.appendChild(navFoot);

    attachPanelReset(main.querySelector('[data-category="appearance"]'), function () {
      runCategoryReset(function (p) {
        p.resetAppearancePrefs();
        document.documentElement.classList.remove('light');
        if (typeof p.applyStoredUiFontSize === 'function') p.applyStoredUiFontSize();
        if (typeof p.applyStoredUiTextContrast === 'function') p.applyStoredUiTextContrast();
        if (typeof p.applyStoredMotionPref === 'function') p.applyStoredMotionPref();
        if (typeof global.syncEditorCmTheme === 'function') global.syncEditorCmTheme();
      }, 'appearance-reset');
    });

    attachPanelReset(main.querySelector('[data-category="editor"]'), function () {
      runCategoryReset(function (p) {
        p.resetEditorPrefs();
        if (typeof p.applyStoredEditorChrome === 'function') p.applyStoredEditorChrome();
      }, 'editor-reset');
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
        var on = typeof p.readStoredInspectorFollow === 'function' ? p.readStoredInspectorFollow() : true;
        global.dispatchEvent(new CustomEvent('beljar:inspector-follow-changed', { detail: { on: on } }));
      }, 'workspace-reset');
    });

    attachPanelReset(main.querySelector('[data-category="aliases"]'), function () {
      runCategoryReset(function (p) { p.resetAliasesPrefs(); }, 'aliases-reset');
      if (aliasesApi) aliasesApi.refresh();
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

    addDropdownRow(
      panelBodies.appearance,
      'motion-pref',
      'Motion',
      'Respect OS reduced-motion, always reduce, or keep animations on.',
      [
        { value: 'system', label: 'Follow system' },
        { value: 'reduce', label: 'Reduce' },
        { value: 'full', label: 'Full' },
      ],
      function () { return p0 ? p0.readStoredMotionPref() : 'system'; },
      function (p, v) {
        p.writeStoredMotionPref(v);
        if (typeof p.applyStoredMotionPref === 'function') p.applyStoredMotionPref();
      }
    );

    addDropdownRow(
      panelBodies.appearance,
      'toast-duration',
      'Toast duration',
      'How long ephemeral toasts stay visible.',
      [
        { value: 'short', label: 'Short' },
        { value: 'normal', label: 'Default' },
        { value: 'long', label: 'Long' },
      ],
      function () { return p0 ? p0.readStoredToastDuration() : 'normal'; },
      function (p, v) { p.writeStoredToastDuration(v); }
    );

    // Editor — Typography
    addSectionHead(panelBodies.editor, 'Typography');
    addDropdownRow(panelBodies.editor, 'editor-font-family', 'Font', 'Editor monospace face.',
      [
        { value: 'jetbrains', label: 'JetBrains Mono' },
        { value: 'system', label: 'System monospace' },
      ],
      function () { return p0 ? p0.readStoredEditorFontFamily() : 'jetbrains'; },
      function (p, v) {
        p.writeStoredEditorFontFamily(v);
        if (typeof p.applyStoredEditorChrome === 'function') p.applyStoredEditorChrome();
      }
    );
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
    addDropdownRow(panelBodies.editor, 'editor-cursor-blink', 'Cursor blink', '',
      [
        { value: 'blink', label: 'Blink' },
        { value: 'fast', label: 'Fast' },
        { value: 'off', label: 'Solid' },
      ],
      function () { return p0 ? p0.readStoredEditorCursorBlink() : 'blink'; },
      function (p, v) { p.writeStoredEditorCursorBlink(v); }
    );
    addSwitchRow(panelBodies.editor, 'editor-scroll-past-end', 'Scroll past end', 'Allow scrolling the last line to mid-viewport.',
      function () { return p0 ? p0.readStoredEditorScrollPastEnd() : true; },
      function (p, on) { p.writeStoredEditorScrollPastEnd(on); }
    );
    addDropdownRow(panelBodies.editor, 'editor-whitespace', 'Show whitespace', '',
      [
        { value: 'none', label: 'Nowhere' },
        { value: 'trailing', label: 'Trailing only' },
        { value: 'selection', label: 'In selection' },
        { value: 'all', label: 'All' },
      ],
      function () { return p0 ? p0.readStoredEditorWhitespace() : 'none'; },
      function (p, v) { p.writeStoredEditorWhitespace(v); }
    );
    addSwitchRow(panelBodies.editor, 'editor-rulers', 'Print-width ruler', 'Vertical guide at the format print width.',
      function () { return p0 ? p0.readStoredEditorRulers() : false; },
      function (p, on) { p.writeStoredEditorRulers(on); }
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
    addSwitchRow(panelBodies.editor, 'format-on-save', 'Format on save',
      'Run Alt+Shift+F formatting when auto-save flushes a .bel file.',
      function () { return p0 ? p0.readStoredFormatOnSave() : false; },
      function (p, on) { p.writeStoredFormatOnSave(on); }
    );
    addSwitchRow(panelBodies.editor, 'trim-trailing-ws', 'Trim trailing whitespace on save',
      'Strip spaces and tabs at line ends when auto-save flushes a .bel file.',
      function () { return p0 ? p0.readStoredTrimTrailingWs() : false; },
      function (p, on) { p.writeStoredTrimTrailingWs(on); }
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
    addDropdownRow(panelBodies.editor, 'editor-autocomplete-trigger', 'Autocomplete',
      'When the completion popup opens. Show Autocomplete still opens it explicitly.',
      [
        { value: 'none', label: 'Nowhere' },
        { value: 'typing', label: 'Only after keystroke' },
        { value: 'always', label: 'Always at token end' },
      ],
      function () { return p0 ? p0.readStoredEditorAutocompleteTrigger() : 'typing'; },
      function (p, v) { p.writeStoredEditorAutocompleteTrigger(v); }
    );
    addSwitchRow(panelBodies.editor, 'editor-autocomplete-continue', 'Continue after accept',
      'Keep showing completions after Tab or click when more options remain.',
      function () { return p0 ? p0.readStoredEditorAutocompleteContinue() : false; },
      function (p, on) { p.writeStoredEditorAutocompleteContinue(on); }
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
    addSwitchRow(panelBodies.editor, 'hover-sticky', 'Sticky hover',
      'Keep type hover open until Escape or click outside. Scroll and pointer leave do not dismiss.',
      function () { return p0 ? p0.readStoredHoverSticky() : false; },
      function (p, on) { p.writeStoredHoverSticky(on); }
    );
    addSwitchRow(panelBodies.editor, 'quiet-while-typing', 'Quiet while typing',
      'Hold hover, occurrence highlight, and auto-complete until checking settles. Explicit Ctrl+Space still works.',
      function () { return p0 ? p0.readStoredQuietWhileTyping() : false; },
      function (p, on) { p.writeStoredQuietWhileTyping(on); }
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
      function () { return p0 ? p0.readStoredEditorFoldPersist() : 'session'; },
      function (p, v) { p.writeStoredEditorFoldPersist(v); }
    );
    addSwitchRow(panelBodies.editor, 'editor-active-line', 'Active line highlight', 'Background on the current line.',
      function () { return p0 ? p0.readStoredEditorActiveLine() : true; },
      function (p, on) { p.writeStoredEditorActiveLine(on); }
    );
    addSwitchRow(panelBodies.editor, 'sticky-decl-header', 'Structure path',
      'Show the enclosing declaration path (a > b > c) at the top of the editor, driven by the cursor.',
      function () { return p0 ? p0.readStoredStickyDeclHeader() : false; },
      function (p, on) { p.writeStoredStickyDeclHeader(on); }
    );
    addDropdownRow(panelBodies.editor, 'diag-presentation', 'Diagnostics',
      'Where errors and warnings appear in the editor.',
      [
        { value: 'both', label: 'Underlines and gutter' },
        { value: 'underlines', label: 'Underlines only' },
        { value: 'gutter', label: 'Gutter only' },
        { value: 'none', label: 'Nowhere' },
      ],
      function () { return p0 ? p0.readStoredDiagPresentation() : 'both'; },
      function (p, v) { p.writeStoredDiagPresentation(v); }
    );
    addSwitchRow(panelBodies.editor, 'diag-show-warnings', 'Show warnings',
      'When off, only errors appear as underlines and gutter marks.',
      function () { return p0 ? p0.readStoredDiagSeverity() !== 'errors' : true; },
      function (p, on) { p.writeStoredDiagSeverity(on ? 'all' : 'errors'); }
    );
    addSwitchRow(panelBodies.editor, 'editor-hole-gutter', 'Hole gutter marks', 'Mark lines with proof holes.',
      function () { return p0 ? p0.readStoredEditorHoleGutter() : true; },
      function (p, on) { p.writeStoredEditorHoleGutter(on); }
    );
    addDropdownRow(panelBodies.editor, 'editor-hole-emphasis', 'Hole gutter emphasis', 'How strongly hole lines stand out.',
      [
        { value: 'subtle', label: 'Subtle' },
        { value: 'normal', label: 'Default' },
        { value: 'loud', label: 'Loud' },
      ],
      function () { return p0 ? p0.readStoredEditorHoleEmphasis() : 'normal'; },
      function (p, v) {
        p.writeStoredEditorHoleEmphasis(v);
        if (typeof p.applyStoredEditorChrome === 'function') p.applyStoredEditorChrome();
      }
    );

    // Keybindings
    var kbUnit = addEditorUnit(panelBodies.keybindings, {
      kind: 'kb',
      searchText: 'Customize keybindings Remap commands and chords',
    });
    keybindingsApi = mountKeybindingsSheet(kbUnit.body);

    // Beluga
    addDropdownRow(panelBodies.beluga, 'beluga-mode', 'Run / Load',
      'Stable: worker (non-blocking). Fast: main thread for Run/Load only — background checking always stays on the Stable worker.',
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
    addDropdownRow(panelBodies.beluga, 'check-aggressiveness', 'Check aggressiveness',
      'How quickly background checking settles after edits. Modes only — not raw timers.',
      [
        { value: 'responsive', label: 'Responsive' },
        { value: 'balanced', label: 'Balanced' },
        { value: 'thorough', label: 'Thorough' },
      ],
      function () { return p0 ? p0.readStoredCheckAggressiveness() : 'balanced'; },
      function (p, v) { p.writeStoredCheckAggressiveness(v); }
    );
    addDropdownRow(panelBodies.beluga, 'suite-check', 'Suite check',
      'Settlement always checks the active file (with prelude). Suite mode also type-checks sibling files for explorer/inspector health.',
      [
        { value: 'suite', label: 'Active + suite' },
        { value: 'active', label: 'Active file only' },
      ],
      function () { return p0 ? p0.readStoredSuiteCheck() : 'suite'; },
      function (p, v) { p.writeStoredSuiteCheck(v); }
    );
    addSectionHead(panelBodies.beluga, 'Autosolve');
    addDropdownRow(panelBodies.beluga, 'harpoon-mode', 'Harpoon opens in',
      'Manual lets you pick each tactic yourself, with Brutus (the search) one click away. '
      + 'Brutus starts searching immediately.',
      [{ value: 'manual', label: 'Manual' }, { value: 'brutus', label: 'Brutus' }],
      function () { return p0 ? p0.readStoredHarpoonMode() : 'manual'; },
      function (p, v) { p.writeStoredHarpoonMode(v); }
    );
    addSwitchRow(panelBodies.beluga, 'harpoon-verify-moves', 'Pre-verify offered tactics',
      'Check the top tactics against Beluga in the background so each shows whether it holds '
      + 'before you pick it. Costs a few checker calls per goal.',
      function () { return p0 ? p0.readStoredHarpoonVerifyMoves() : true; },
      function (p, on) { p.writeStoredHarpoonVerifyMoves(on); }
    );
    addSwitchRow(panelBodies.beluga, 'autosolve-focus-next', 'Focus next hole after place',
      'After placing a solved proof, jump the editor to the next open hole.',
      function () { return p0 ? p0.readStoredAutosolveFocusNext() : true; },
      function (p, on) { p.writeStoredAutosolveFocusNext(on); }
    );
    addSwitchRow(panelBodies.beluga, 'autosolve-show-stats', 'Show checker call counts',
      'Show how many Beluga certifies ran per hole in the proof tree.',
      function () { return p0 ? p0.readStoredAutosolveShowStats() : true; },
      function (p, on) { p.writeStoredAutosolveShowStats(on); }
    );

    // REPL
    addSwitchRow(panelBodies.repl, 'repl-autoscroll', 'Auto-scroll output', 'Scroll to new output.',
      function () { return p0 ? p0.readStoredReplAutoscroll() : true; },
      function (p, on) { p.writeStoredReplAutoscroll(on); }
    );
    addDropdownRow(panelBodies.repl, 'repl-autocomplete-trigger', 'Autocomplete',
      'When the completion popup opens. Show Autocomplete still opens it explicitly.',
      [
        { value: 'none', label: 'Nowhere' },
        { value: 'typing', label: 'Only after keystroke' },
        { value: 'always', label: 'Always at token end' },
      ],
      function () { return p0 ? p0.readStoredReplAutocompleteTrigger() : 'typing'; },
      function (p, v) { p.writeStoredReplAutocompleteTrigger(v); }
    );
    addSwitchRow(panelBodies.repl, 'repl-autocomplete-continue', 'Continue after accept',
      'Keep showing completions after Tab or click when more options remain.',
      function () { return p0 ? p0.readStoredReplAutocompleteContinue() : false; },
      function (p, on) { p.writeStoredReplAutocompleteContinue(on); }
    );
    addSwitchRow(panelBodies.repl, 'repl-welcome', 'Banner after clear', 'Show the Beluga version line again after clear.',
      function () { return p0 ? p0.readStoredReplWelcome() : true; },
      function (p, on) { p.writeStoredReplWelcome(on); }
    );
    addSwitchRow(panelBodies.repl, 'repl-echo', 'Echo commands', 'Repeat typed commands in the transcript.',
      function () { return p0 ? p0.readStoredReplEcho() : true; },
      function (p, on) { p.writeStoredReplEcho(on); }
    );
    addSwitchRow(panelBodies.repl, 'repl-filter-chatter', 'Filter chatter', 'Hide noisy Beluga status lines in the transcript.',
      function () { return p0 ? p0.readStoredReplFilterChatter() : true; },
      function (p, on) { p.writeStoredReplFilterChatter(on); }
    );
    addSwitchRow(panelBodies.repl, 'repl-hover-timestamp', 'Hover for timestamp',
      'Show the time a command or output was logged when hovering it.',
      function () { return p0 ? p0.readStoredReplHoverTimestamp() : false; },
      function (p, on) { p.writeStoredReplHoverTimestamp(on); }
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
        { value: '100', label: '100 commands' },
        { value: '250', label: '250 commands' },
        { value: '500', label: '500 commands' },
        { value: '1000', label: '1000 commands' },
      ],
      function () { return p0 ? String(p0.readStoredReplHistoryCap()) : '1000'; },
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
    addSwitchRow(panelBodies.workspace, 'inspector-follow', 'Inspector follows cursor',
      'Update the inspector as the editor cursor moves.',
      function () { return p0 ? p0.readStoredInspectorFollow() : true; },
      function (p, on) {
        p.writeStoredInspectorFollow(on);
        global.dispatchEvent(new CustomEvent('beljar:inspector-follow-changed', { detail: { on: !!on } }));
      }
    );

    addActionRow(
      panelBodies.workspace,
      'Reset panel layout',
      'Reset split panes and side panel sizes.',
      'Reset',
      function () {
        if (!persist()) return;
        persist().resetLayoutPrefs();
        postSettingsApply('layout-reset');
        if (typeof global.location !== 'undefined') global.location.reload();
      }
    );

    addActionRow(
      panelBodies.workspace,
      'Export settings',
      'Download editor, appearance, keybindings, and aliases as JSON.',
      'Export\u2026',
      function () {
        var p = persist();
        if (!p || typeof p.exportUserSettings !== 'function') return;
        var bundle = p.exportUserSettings();
        var blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'beljar-settings.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }
    );

    addActionRow(
      panelBodies.workspace,
      'Import settings',
      'Load a previously exported settings JSON file.',
      'Import\u2026',
      function () {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.addEventListener('change', function () {
          var file = input.files && input.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function () {
            var p = persist();
            if (!p || typeof p.importUserSettings !== 'function') return;
            try {
              var bundle = JSON.parse(String(reader.result || ''));
              var result = p.importUserSettings(bundle);
              if (!result || !result.ok) {
                if (global.Toasts && global.Toasts.warn) global.Toasts.warn('Could not import settings.');
                return;
              }
              if (typeof p.applyStoredUiFontSize === 'function') p.applyStoredUiFontSize();
              if (typeof p.applyStoredUiTextContrast === 'function') p.applyStoredUiTextContrast();
              if (typeof p.applyStoredMotionPref === 'function') p.applyStoredMotionPref();
              if (typeof p.applyStoredEditorChrome === 'function') p.applyStoredEditorChrome();
              if (p.readStoredTheme && document.documentElement) {
                document.documentElement.classList.toggle('light', p.readStoredTheme() === 'light');
              }
              syncFromState();
              applyLiveSettings('settings-import');
              postSettingsApply('settings-import');
              if (global.Toasts && global.Toasts.success) {
                global.Toasts.success('Imported ' + (result.applied || 0) + ' settings.');
              }
            } catch (_) {
              if (global.Toasts && global.Toasts.warn) global.Toasts.warn('Invalid settings file.');
            }
          };
          reader.readAsText(file);
        });
        input.click();
      }
    );

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
    var aliasUnit = addEditorUnit(panelBodies.aliases, {
      kind: 'alias',
      searchText: 'Customize aliases Define trigger expansion pairs used while typing',
    });
    aliasesApi = mountAliasesSheet(aliasUnit.body);

    selectCategory(activeCategory);

    shell.appendChild(nav);
    shell.appendChild(main);

    var search = makeSearchField({
      slotClass: 'bj-settings__search-slot',
      wrapClass: 'bj-settings__search',
      placeholder: 'Search\u2026',
      ariaLabel: 'Search settings',
      ariaControls: 'bj-settings-search-results',
    });
    settingsSearchInput = search.input;
    var searchWrap = search.inputWrap;

    var searchHits = [];
    var searchActive = -1;
    var flashTimer = null;
    var searchResults = document.createElement('div');
    searchResults.className = 'hsearch-ac bj-settings__results';
    searchResults.id = 'bj-settings-search-results';
    searchResults.setAttribute('role', 'listbox');
    searchResults.hidden = true;

    function positionSearchResults() {
      if (searchResults.hidden || !searchResults.classList.contains('is-open')) return;
      var rect = searchWrap.getBoundingClientRect();
      var width = Math.max(Math.round(rect.width), 220);
      searchResults.style.width = width + 'px';
      searchResults.style.minWidth = width + 'px';
      var ph = searchResults.offsetHeight || 1;
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
        searchResults.style.top = pos.y + 'px';
        searchResults.style.left = pos.x + 'px';
      } else {
        searchResults.style.top = Math.round(rect.bottom + 5) + 'px';
        searchResults.style.left = Math.round(rect.right - width) + 'px';
      }
    }

    function closeSettingsSearchPanel(clearInput) {
      searchHits = [];
      searchActive = -1;
      searchResults.replaceChildren();
      searchResults.hidden = true;
      searchResults.classList.remove('is-open');
      search.input.setAttribute('aria-expanded', 'false');
      window.removeEventListener('resize', positionSearchResults);
      window.removeEventListener('scroll', positionSearchResults, true);
      if (clearInput && settingsSearchInput) settingsSearchInput.value = '';
    }

    closeSettingsSearch = closeSettingsSearchPanel;

    function openSearchResults() {
      var mount = settingsDialogEl || document.body;
      if (searchResults.parentElement !== mount) mount.appendChild(searchResults);
      searchResults.hidden = false;
      searchResults.classList.add('is-open');
      search.input.setAttribute('aria-expanded', 'true');
      window.removeEventListener('resize', positionSearchResults);
      window.removeEventListener('scroll', positionSearchResults, true);
      positionSearchResults();
      window.addEventListener('resize', positionSearchResults);
      window.addEventListener('scroll', positionSearchResults, true);
    }

    function flashEl(el) {
      if (!el) return;
      main.querySelectorAll('.is-flash').forEach(function (node) {
        node.classList.remove('is-flash');
      });
      el.classList.add('is-flash');
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(function () {
        flashTimer = null;
        el.classList.remove('is-flash');
      }, 1100);
    }

    function hitRank(title, q) {
      var t = String(title || '').toLowerCase();
      if (t.indexOf(q) === 0) return 0;
      if (t.indexOf(q) >= 0) return 1;
      return 2;
    }

    function collectHits(q) {
      var hits = [];
      categories.forEach(function (cat) {
        var body = panelBodies[cat.id];
        if (!body) return;
        var section = '';
        Array.prototype.forEach.call(body.children, function (el) {
          if (el.classList.contains('bj-settings__section-head')) {
            section = String(el.textContent || '').trim();
            return;
          }
          if (el.classList.contains('bj-settings__unit')) return;
          if (!el.classList.contains('bj-dialog__setting')) return;
          var titleEl = el.querySelector('.bj-dialog__setting-label');
          var descEl = el.querySelector('.bj-dialog__setting-desc');
          var title = titleEl ? String(titleEl.textContent || '') : '';
          var desc = descEl ? String(descEl.textContent || '') : '';
          var hay = (title + ' ' + desc + ' ' + section + ' ' + cat.label).replace(/\s+/g, ' ').toLowerCase();
          if (hay.indexOf(q) < 0) return;
          hits.push({
            kind: 'setting',
            categoryId: cat.id,
            title: title,
            meta: section || cat.label,
            el: el,
            rank: hitRank(title, q),
          });
        });
      });

      if (activeCategory === 'keybindings') {
        var K = Keybindings;
        var cmds = K && typeof K.list === 'function' ? K.list() : [];
        cmds.forEach(function (cmd) {
          var title = cmd.title || cmd.id || '';
          var section = cmd.section || '';
          var hay = (title + ' ' + section).toLowerCase();
          if (hay.indexOf(q) < 0) return;
          hits.push({
            kind: 'command',
            categoryId: 'keybindings',
            title: title,
            meta: 'Keybindings',
            id: cmd.id,
            rank: hitRank(title, q),
          });
        });
      }

      if (activeCategory === 'aliases' && aliasesApi && typeof aliasesApi.list === 'function') {
        aliasesApi.list().forEach(function (pair) {
          var from = String(pair.from || '');
          var to = String(pair.to || '');
          var hay = (from + ' ' + to).toLowerCase();
          if (hay.indexOf(q) < 0) return;
          var fromL = from.toLowerCase();
          hits.push({
            kind: 'alias',
            categoryId: 'aliases',
            title: from + ' \u2192 ' + to,
            meta: 'Aliases',
            rowId: pair.id,
            focus: fromL.indexOf(q) >= 0 ? 'from' : 'to',
            rank: hitRank(from, q) < 2 ? hitRank(from, q) : hitRank(to, q),
          });
        });
      }

      hits.sort(function (a, b) {
        var aHere = a.categoryId === activeCategory ? 0 : 1;
        var bHere = b.categoryId === activeCategory ? 0 : 1;
        if (aHere !== bHere) return aHere - bHere;
        if (a.rank !== b.rank) return a.rank - b.rank;
        return String(a.title).localeCompare(String(b.title));
      });
      return hits.slice(0, 20);
    }

    function setSearchActive(idx) {
      var items = searchResults.querySelectorAll('.hsearch-ac-item');
      searchActive = idx;
      for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('is-active', i === idx);
        if (i === idx) {
          items[i].setAttribute('aria-selected', 'true');
          items[i].scrollIntoView({ block: 'nearest' });
        } else {
          items[i].removeAttribute('aria-selected');
        }
      }
    }

    function pickHit(hit) {
      if (!hit) return;
      closeSettingsSearchPanel(true);
      if (hit.categoryId) selectCategory(hit.categoryId);
      requestAnimationFrame(function () {
        var target = null;
        if (hit.kind === 'setting') {
          target = hit.el;
        } else if (hit.kind === 'command' && hit.id) {
          target = main.querySelector('.bj-kb__row[data-command-id="' + String(hit.id).replace(/"/g, '') + '"]');
        } else if (hit.kind === 'alias' && hit.rowId != null) {
          target = main.querySelector('.bj-alias__row[data-row-id="' + String(hit.rowId).replace(/"/g, '') + '"]');
        }
        if (!target) return;
        target.scrollIntoView({ block: 'center' });
        flashEl(target);
        if (hit.kind === 'alias') {
          var sel = hit.focus === 'to' ? '.bj-alias__input--expansion' : '.bj-alias__input--trigger';
          var field = target.querySelector(sel);
          if (field) field.focus();
        }
      });
    }

    function renderSearchResults() {
      searchResults.replaceChildren();
      if (!searchHits.length) {
        var empty = document.createElement('div');
        empty.className = 'hsearch-ac-empty';
        empty.textContent = 'No settings match.';
        searchResults.appendChild(empty);
        openSearchResults();
        return;
      }
      searchHits.forEach(function (hit, index) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hsearch-ac-item' + (index === searchActive ? ' is-active' : '');
        btn.setAttribute('role', 'option');
        if (index === searchActive) btn.setAttribute('aria-selected', 'true');

        var head = document.createElement('span');
        head.className = 'hsearch-ac-head';

        var name = document.createElement('span');
        name.className = 'hsearch-ac-name';
        name.textContent = hit.title;
        head.appendChild(name);

        if (hit.meta) {
          var meta = document.createElement('span');
          meta.className = 'hsearch-ac-path';
          meta.textContent = hit.meta;
          head.appendChild(meta);
        }
        btn.appendChild(head);
        btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          pickHit(hit);
        });
        searchResults.appendChild(btn);
      });
      openSearchResults();
    }

    function runSettingsSearch(raw) {
      var q = String(raw || '').trim().toLowerCase();
      if (!q) {
        closeSettingsSearchPanel(false);
        return;
      }
      searchHits = collectHits(q);
      searchActive = searchHits.length ? 0 : -1;
      renderSearchResults();
    }

    search.input.setAttribute('aria-expanded', 'false');
    search.input.addEventListener('input', function () {
      runSettingsSearch(search.input.value);
    });
    search.input.addEventListener('search', function () {
      runSettingsSearch(search.input.value);
    });
    search.input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        if (searchResults.hidden) return;
        e.preventDefault();
        if (!searchHits.length) return;
        setSearchActive(Math.min(searchActive + 1, searchHits.length - 1));
      } else if (e.key === 'ArrowUp') {
        if (searchResults.hidden) return;
        e.preventDefault();
        if (!searchHits.length) return;
        setSearchActive(Math.max(searchActive - 1, 0));
      } else if (e.key === 'Enter') {
        if (searchResults.hidden) return;
        e.preventDefault();
        if (searchActive >= 0 && searchHits[searchActive]) pickHit(searchHits[searchActive]);
      } else if (e.key === 'Escape') {
        if (!search.input.value && searchResults.hidden) return;
        e.preventDefault();
        e.stopPropagation();
        closeSettingsSearchPanel(true);
      }
    });
    search.input.addEventListener('blur', function () {
      setTimeout(function () {
        var ae = document.activeElement;
        if (search.slot.contains(ae) || searchResults.contains(ae)) return;
        closeSettingsSearchPanel(false);
      }, 0);
    });

    settingsDialogEl = Dialog.createDialog({
      title: 'Settings',
      headerExtra: search.slot,
      content: shell,
      cardClass: 'bj-dialog__card--settings',
      removeOnClose: false,
    });
    settingsDialogEl.addEventListener('close', function () {
      if (keybindingsApi) {
        keybindingsApi.clearRecording();
        keybindingsApi.refresh();
      }
      if (aliasesApi) aliasesApi.refresh();
      closeSettingsSearchPanel(true);
    });
    return settingsDialogEl;
  }

  function open() {
    ensureSettingsDialog();
    if (typeof closeSettingsSearch === 'function') closeSettingsSearch(true);
    syncFromState();
    Dialog.openDialog(settingsDialogEl);
  }

  global.SettingsUI = {
    syncFromState: syncFromState,
    ensureSettingsDialog: ensureSettingsDialog,
    open: open,
    notifySettingsChanged: notifySettingsChanged,
  };
  global.BelJarSettingsUI = global.SettingsUI;
