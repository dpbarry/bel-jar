'use strict';

const global = globalThis;
const openDropdowns = [];

function closeAll() {
  for (var i = openDropdowns.length - 1; i >= 0; i--) {
    if (openDropdowns[i] && typeof openDropdowns[i].close === 'function') {
      openDropdowns[i].close();
    }
  }
}

function create(options, currentValue, onChange) {
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

global.Dropdown = { create: create, closeAll: closeAll };
global.BelJarDropdown = global.Dropdown;
