// Marquee-style text slide for overflowing labels on hover. Global: TextSlide.
(function (global) {
  'use strict';

  var SPEED_PX_PER_S = 90;
  var MIN_SLIDE_S = 0.5;
  // Fraction of total cycle duration spent sliding each way (rest is pauses).
  var SLIDE_FRAC = 0.38;
  var RETURN_MS = 300;

  function prefersFineHover() {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }

  // opts.triggerEl — optional alternate element that drives hover (e.g. a parent
  // row button), so the slide starts when the whole row is hovered, not just the
  // text label itself.
  function bind(el, opts) {
    if (!el || el.nodeType !== 1 || el._textSlideBound) return;
    el._textSlideBound = true;

    opts = opts || {};
    var triggerEl = (opts.triggerEl && opts.triggerEl.nodeType === 1) ? opts.triggerEl : el;

    var inner = el.querySelector('.text-slide-inner');
    if (!inner) {
      inner = document.createElement('span');
      inner.className = 'text-slide-inner';
      while (el.firstChild) inner.appendChild(el.firstChild);
      el.appendChild(inner);
    }

    var active = false;
    var returnHandler = null;

    function measure() {
      var overflow = inner.scrollWidth - el.clientWidth;
      if (overflow <= 1) return 0;
      var slideS = Math.max(MIN_SLIDE_S, overflow / SPEED_PX_PER_S);
      el.style.setProperty('--text-slide-offset', '-' + overflow + 'px');
      el.style.setProperty('--text-slide-duration', (slideS / SLIDE_FRAC).toFixed(3) + 's');
      return overflow;
    }

    function cancelReturn() {
      if (!returnHandler) return;
      inner.removeEventListener('transitionend', returnHandler);
      returnHandler = null;
    }

    function start() {
      if (!prefersFineHover()) return;
      active = true;
      cancelReturn();
      inner.style.transition = '';
      inner.style.transform = '';
      if (measure() > 1) el.classList.add('text-slide--playing');
    }

    function stop() {
      active = false;
      if (!el.classList.contains('text-slide--playing')) return;
      // Freeze at the current animated position before removing the animation.
      var cur = window.getComputedStyle(inner).transform;
      el.classList.remove('text-slide--playing');
      inner.style.transform = cur;
      void inner.offsetWidth; // force reflow to commit frozen position
      inner.style.transition = 'transform ' + RETURN_MS + 'ms ease-out';
      inner.style.transform = 'translateX(0)';

      returnHandler = function (e) {
        if (e.propertyName !== 'transform') return;
        cancelReturn();
        if (!active) {
          inner.style.transition = '';
          inner.style.transform = '';
        }
      };
      inner.addEventListener('transitionend', returnHandler);
    }

    triggerEl.addEventListener('mouseenter', start);
    triggerEl.addEventListener('mouseleave', stop);

    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () { if (active) measure(); });
      ro.observe(el);
    }
  }

  function bindAll() {
    document.querySelectorAll('[data-text-slide]').forEach(bind);
  }

  global.TextSlide = { bind: bind, bindAll: bindAll };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAll);
  } else {
    bindAll();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
