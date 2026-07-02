'use strict';

(function (global) {
  function createParts(opts) {
    opts = opts || {};
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'bj-toggle__input';
    if (opts.id) input.id = opts.id;
    if (opts.ariaLabel) input.setAttribute('aria-label', opts.ariaLabel);
    input.checked = !!opts.checked;

    var track = document.createElement('span');
    track.className = 'bj-toggle__track';
    track.setAttribute('aria-hidden', 'true');
    var thumb = document.createElement('span');
    thumb.className = 'bj-toggle__thumb';
    track.appendChild(thumb);

    input.addEventListener('change', function () {
      if (opts.onChange) opts.onChange(input.checked);
    });

    function setChecked(on) {
      input.checked = !!on;
    }

    return { input: input, track: track, setChecked: setChecked };
  }

  function create(opts) {
    opts = opts || {};
    var wrap = document.createElement('label');
    wrap.className = 'bj-toggle';
    if (opts.className) wrap.className += ' ' + opts.className;
    var parts = createParts(opts);
    wrap.appendChild(parts.input);
    wrap.appendChild(parts.track);
    parts.element = wrap;
    return parts;
  }

  global.BelJarToggle = { create: create, createParts: createParts };
})(typeof window !== 'undefined' ? window : globalThis);
