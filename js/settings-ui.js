'use strict';

(function (global) {
  var settingsDialogEl = null;
  var settingsReplBeautifyInput = null;
  var settingsModeDropdown = null;

  function syncFromState() {
    if (settingsReplBeautifyInput) {
      settingsReplBeautifyInput.checked =
        typeof BelJarReplOutput !== 'undefined' ? BelJarReplOutput.getReplBeautify() : true;
    }
    if (settingsModeDropdown) {
      settingsModeDropdown.setValue(
        typeof BelJarBelugaRun !== 'undefined' ? BelJarBelugaRun.getBelugaMode() : 'stable'
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
      var pos = FloatingRectPlacement.computePosition({
        anchor: rect,
        width: panel.offsetWidth,
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
      var pw = panel.offsetWidth;
      var ph = panel.offsetHeight;
      panel.style.display = '';
      panel.style.visibility = '';

      var rect = trigger.getBoundingClientRect();
      var pos = FloatingRectPlacement.computePosition({
        anchor: rect,
        width: pw,
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

    var replBeautify = typeof BelJarReplOutput !== 'undefined' ? BelJarReplOutput.getReplBeautify() : true;
    var currentMode = typeof BelJarBelugaRun !== 'undefined' ? BelJarBelugaRun.getBelugaMode() : 'stable';

    var stack = document.createElement('div');
    stack.className = 'bj-dialog__stack';

    var section = document.createElement('div');
    section.className = 'bj-dialog__section';

    var row = document.createElement('label');
    row.className = 'bj-dialog__setting';

    var main = document.createElement('div');
    main.className = 'bj-dialog__setting-main';
    var labelEl = document.createElement('span');
    labelEl.className = 'bj-dialog__setting-label';
    labelEl.textContent = 'Beautified REPL';
    var desc = document.createElement('span');
    desc.className = 'bj-dialog__setting-desc';
    desc.textContent = 'Turn off for plain terminal-style output.';
    main.appendChild(labelEl);
    main.appendChild(desc);

    settingsReplBeautifyInput = document.createElement('input');
    settingsReplBeautifyInput.type = 'checkbox';
    settingsReplBeautifyInput.className = 'bj-switch-input';
    settingsReplBeautifyInput.checked = replBeautify;
    settingsReplBeautifyInput.addEventListener('change', function () {
      if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.setReplBeautify(settingsReplBeautifyInput.checked);
    });

    var sw = document.createElement('span');
    sw.className = 'bj-switch';
    var thumb = document.createElement('span');
    thumb.className = 'bj-switch__thumb';
    sw.appendChild(thumb);

    row.appendChild(main);
    row.appendChild(settingsReplBeautifyInput);
    row.appendChild(sw);
    section.appendChild(row);
    stack.appendChild(section);

    var engineSection = document.createElement('div');
    engineSection.className = 'bj-dialog__section';

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

    settingsModeDropdown = addDropdownRow(
      engineSection,
      'Engine',
      'Stable runs in a worker and never crashes. Fast runs on the main thread and may be quicker for small files.',
      [{ value: 'stable', label: 'Stable' }, { value: 'fast', label: 'Fast' }],
      currentMode,
      function (m) {
        if (typeof BelJarBelugaRun !== 'undefined') BelJarBelugaRun.setBelugaMode(m);
      }
    );

    stack.appendChild(engineSection);

    if (typeof BelJarDialog === 'undefined') return null;
    settingsDialogEl = BelJarDialog.createDialog({
      title: 'Settings',
      content: stack,
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
