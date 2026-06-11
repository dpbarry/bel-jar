// Edge fade masks for overflowing scroll containers. Global: ScrollFade.
(function (global) {
  'use strict';

  var EPS = 1; // ignore sub-pixel overflow

  // Pure: given scroll metrics, return which edges overflow (and thus fade).
  // metrics: { scrollTop, scrollLeft, scrollWidth, scrollHeight,
  //            clientWidth, clientHeight, axis }
  function computeSides(m) {
    var axis = m.axis || 'both';
    var sides = { top: false, bottom: false, left: false, right: false };
    if (axis === 'y' || axis === 'both') {
      var maxY = m.scrollHeight - m.clientHeight;
      if (maxY > EPS) {
        sides.top = m.scrollTop > EPS;
        sides.bottom = m.scrollTop < maxY - EPS;
      }
    }
    if (axis === 'x' || axis === 'both') {
      var maxX = m.scrollWidth - m.clientWidth;
      if (maxX > EPS) {
        sides.left = m.scrollLeft > EPS;
        sides.right = m.scrollLeft < maxX - EPS;
      }
    }
    return sides;
  }

  // Build a CSS mask-image gradient for one axis given the two edge flags.
  // Returns null when neither edge of that axis fades (no mask needed → full).
  function axisMask(dir, startFades, endFades, size) {
    if (!startFades && !endFades) return null;
    var start = startFades ? 'transparent 0, #000 ' + size + 'px' : '#000 0';
    var end = endFades ? '#000 calc(100% - ' + size + 'px), transparent 100%' : '#000 100%';
    return 'linear-gradient(' + dir + ', ' + start + ', ' + end + ')';
  }

  function applyMask(el, sides, size) {
    var masks = [];
    var mx = axisMask('to right', sides.left, sides.right, size);
    var my = axisMask('to bottom', sides.top, sides.bottom, size);
    if (mx) masks.push(mx);
    if (my) masks.push(my);
    var value = masks.length ? masks.join(', ') : '';
    // When both axes fade, the two gradients intersect (mask-composite default is
    // intersect via multiple layers in most engines); a single layer is the
    // common case and renders cleanly.
    el.style.webkitMaskImage = value;
    el.style.maskImage = value;
    // Reflect state for styling/debugging.
    if (value) {
      el.setAttribute('data-scroll-fade',
        [sides.top && 'top', sides.bottom && 'bottom',
         sides.left && 'left', sides.right && 'right'].filter(Boolean).join(' '));
    } else {
      el.removeAttribute('data-scroll-fade');
    }
  }

  function attach(el, opts) {
    if (!el) return { update: function () {}, destroy: function () {} };
    opts = opts || {};
    var size = opts.size || 16;
    var axis = opts.axis || 'both';

    function update() {
      var sides = computeSides({
        scrollTop: el.scrollTop,
        scrollLeft: el.scrollLeft,
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        axis: axis,
      });
      applyMask(el, sides, size);
    }

    var onScroll = function () { update(); };
    el.addEventListener('scroll', onScroll, { passive: true });

    var ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(function () { update(); });
      ro.observe(el);
    }

    // Initial pass (after layout settles).
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(update);
    else update();

    return {
      update: update,
      destroy: function () {
        el.removeEventListener('scroll', onScroll);
        if (ro) ro.disconnect();
        el.style.webkitMaskImage = '';
        el.style.maskImage = '';
        el.removeAttribute('data-scroll-fade');
      },
    };
  }

  global.ScrollFade = { attach: attach, computeSides: computeSides };
})(typeof window !== 'undefined' ? window : this);
