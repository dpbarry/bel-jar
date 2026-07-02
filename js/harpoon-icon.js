'use strict';

(function (global) {
  var MARKUP =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<circle cx="5" cy="5" r="1.6"/>'
    + '<path d="M6.2 6.2 16.5 16.5"/>'
    + '<path d="M20.5 20.5 19.5 12 16.5 16.5 12 19.5Z"/>'
    + '</svg>';

  function appendGlyph(parent, className) {
    var span = document.createElement('span');
    if (className) span.className = className;
    span.innerHTML = MARKUP;
    parent.appendChild(span);
    return span;
  }

  global.BelJarHarpoonIcon = { markup: MARKUP, appendGlyph: appendGlyph };
})(typeof window !== 'undefined' ? window : self);
