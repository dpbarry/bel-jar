'use strict';

(function (global) {
  function normalizeBelugaRaw(s) {
    return String(s != null ? s : '').replace(/\r\n/g, '\n');
  }

  function stripBelugaAnsi(s) {
    return normalizeBelugaRaw(s)
      .replace(/\u001b\[[0-9;]*m/g, '')
      .replace(/\u009b[0-9;]*m/g, '')
      .replace(/Ø\[[0-9;]*m/g, '');
  }

  global.BelugaText = { normalizeBelugaRaw: normalizeBelugaRaw, stripBelugaAnsi: stripBelugaAnsi };
})(typeof window !== 'undefined' ? window : self);
