// Shared header-search controller: drives the collapse-to-glass interaction for
// the panel-header search affordances (Library, Explorer). The visual morph is
// pure CSS (see `.hsearch` in style.css); this only toggles state classes and
// brokers the open/close lifecycle so every header behaves identically.
//
//   open():  add `is-open` to the field + `is-search-open` to the header,
//            focus the input, fire onOpen.
//   close(): collapse back to the glass — but only when empty unless forced
//            (Escape / explicit toggle), so an active query is never lost to a
//            stray blur. Clears the query and notifies onInput('').
const global = globalThis;
function init(opts) {
    opts = opts || {};
    var host = opts.host;
    var input = opts.input;
    if (!host || !input) return null;

    var header = opts.header || host.closest('.panel-header, .inspector-header-bar');
    var openClass = opts.openClass || 'is-search-open';
    var blurDelay = opts.blurDelay != null ? opts.blurDelay : 140;
    var isOpen = false;

    function emit(name, arg) {
      if (typeof opts[name] === 'function') opts[name](arg);
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      host.classList.add('is-open');
      if (header) header.classList.add(openClass);
      input.setAttribute('aria-expanded', 'true');
      // Focus on the next frame so the unfurl is the thing the eye tracks, not
      // a caret blink landing in a zero-width box.
      requestAnimationFrame(function () {
        if (isOpen) input.focus();
      });
      emit('onOpen');
    }

    // `force` collapses even with a live query (Escape / toggle); otherwise a
    // non-empty field stays open so click-away mid-search doesn't lose it.
    function close(force) {
      if (!isOpen) return;
      if (!force && input.value) return;
      isOpen = false;
      host.classList.remove('is-open');
      if (header) header.classList.remove(openClass);
      input.setAttribute('aria-expanded', 'false');
      var had = input.value;
      input.value = '';
      input.blur();
      if (had) emit('onInput', '');
      emit('onClose');
    }

    function toggle() {
      if (isOpen) close(true);
      else open();
    }

    // Pointer on the collapsed glass opens; on the open bar it's a no-op so the
    // caret lands where clicked.
    host.addEventListener('mousedown', function (e) {
      if (e.target === input) return;
      e.preventDefault();
      if (isOpen) input.focus();
      else open();
    });

    input.addEventListener('focus', open);
    input.addEventListener('input', function () { emit('onInput', input.value); });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (input.value) {
          // First Escape clears, second collapses — matches common search UX.
          input.value = '';
          emit('onInput', '');
        } else {
          close(true);
        }
        emit('onEscape', e);
        return;
      }
      emit('onKeydown', e);
    });

    input.addEventListener('blur', function () {
      setTimeout(function () {
        if (host.contains(document.activeElement)) return;
        if (typeof opts.keepOpenFor === 'function' && opts.keepOpenFor(document.activeElement)) return;
        close(false);
      }, blurDelay);
    });

    // Dropdown searches (those with a floating result list) dismiss on any
    // outside pointer — a click in the panel body, the tree, or the sidebar
    // switcher. A non-empty query no longer keeps it sticky. The dropdown's own
    // rows are excluded via keepOpenFor so a result click still lands. Gated on
    // keepOpenFor so in-place filters (the Library tree) keep their behaviour.
    if (typeof opts.keepOpenFor === 'function') {
      document.addEventListener('pointerdown', function (e) {
        if (!isOpen) return;
        if (host.contains(e.target)) return;
        if (opts.keepOpenFor(e.target)) return;
        close(true);
      }, true);
    }

    return {
      open: open,
      close: close,
      toggle: toggle,
      isOpen: function () { return isOpen; },
      input: input,
      host: host,
    };
  }

  global.HeaderSearch = { init: init };
  global.BelJarHeaderSearch = global.HeaderSearch
