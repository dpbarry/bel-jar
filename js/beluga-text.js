'use strict';

// Shared text utilities for Beluga output -- used by both REPL formatting (app.js)
// and error parsing (live-intel.js) to ensure consistent stripping.
(function (global) {
  function normalizeBelugaRaw(s) {
    return String(s != null ? s : '').replace(/\r\n/g, '\n');
  }

  // Strips ANSI SGR sequences: standard ESC[ form (U+001B), C1 CSI form (U+009B),
  // and the Beluga-specific O[ variant produced by js_of_ocaml's ANSITerminal binding.
  function stripBelugaAnsi(s) {
    return normalizeBelugaRaw(s)
      .replace(/\u001b\[[0-9;]*m/g, '')
      .replace(/\u009b[0-9;]*m/g, '')
      .replace(/Ø\[[0-9;]*m/g, '');
  }

  global.BelugaText = { normalizeBelugaRaw: normalizeBelugaRaw, stripBelugaAnsi: stripBelugaAnsi };
})(typeof window !== 'undefined' ? window : self);
