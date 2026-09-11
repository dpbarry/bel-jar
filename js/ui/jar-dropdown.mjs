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

/**
 * ⛔ ONE outside-click listener for every dropdown there will ever be.
 *
 * Each instance used to add its own `document` click handler and never take it
 * off. Settings rebuilds its rows on every open, and it holds a dozen
 * dropdowns — so an ordinary week's worth of visits to Settings left hundreds
 * of permanent listeners on `document`, each keeping a dead panel and its
 * option list alive and each running on every click anywhere in the app.
 *
 * `openDropdowns` already tracks exactly the ones that could need closing, so
 * the shared listener is also strictly less work than one of the old ones.
 */
if (typeof document !== 'undefined') {
  document.addEventListener('click', function (e) {
    if (!openDropdowns.length) return;
    for (var i = openDropdowns.length - 1; i >= 0; i--) {
      var d = openDropdowns[i];
      if (d && typeof d.containsTarget === 'function' && !d.containsTarget(e.target)) d.close();
    }
  });
}

function create(options, currentValue, onChange) {
  var selected = currentValue;
  var focusedIdx = -1;
  var optionEls = [];

  var container = document.createElement('div');
  container.className = 'jar-dropdown';

  var trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'jar-dropdown__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  var valueSpan = document.createElement('span');
  valueSpan.className = 'jar-dropdown__value';

  var chevronEl = document.createElement('span');
  chevronEl.className = 'jar-dropdown__chevron';
  chevronEl.setAttribute('aria-hidden', 'true');
  chevronEl.innerHTML = '<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  trigger.appendChild(valueSpan);
  trigger.appendChild(chevronEl);

  var panel = document.createElement('div');
  panel.className = 'jar-dropdown__panel';
  panel.setAttribute('role', 'listbox');

  options.forEach(function (opt, idx) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'jar-dropdown__option';
    btn.setAttribute('role', 'option');
    btn.dataset.value = opt.value;

    var labelSpan = document.createElement('span');
    labelSpan.textContent = opt.label;

    var checkEl = document.createElement('span');
    checkEl.className = 'jar-dropdown__option-check';
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
    // The panel is mounted OUT of the dropdown (onto the dialog or the body) so
    // it can escape a scroll container, which means closing has to take it back
    // out — otherwise every dropdown ever opened leaves a hidden panel behind
    // in a dialog that gets rebuilt every time it is shown. There is no exit
    // transition to cut short: the panel is display:none when not open.
    if (panel.parentElement) panel.parentElement.removeChild(panel);
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

  setValue(currentValue);
  var api = {
    element: container,
    setValue: setValue,
    close: close,
    containsTarget: function (target) {
      return container.contains(target) || panel.contains(target);
    },
  };
  return api;
}

global.Dropdown = { create: create, closeAll: closeAll };
global.BelJarDropdown = global.Dropdown;
