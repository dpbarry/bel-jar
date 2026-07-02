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

  function polishBelugaErrorDetail(detail) {
    return String(detail != null ? detail : '')
      .replace(/;\s*$/, '')
      .replace(
        /Failed to parse Expected the parser input to end here\.?/gi,
        'Failed to parse: unexpected text here.',
      )
      .replace(/parse Expected/g, 'parse.\nExpected')
      .replace(
        /Expected the parser input to end here\.?/gi,
        'Unexpected text here — remove stray tokens or finish the declaration.',
      )
      .trim();
  }

  function isBelugaCommandError(text) {
    var t = stripBelugaAnsi(text).trim();
    if (!t) return false;
    if (/^-\s*Error\b/i.test(t)) return true;
    if (/^-\s*Failed to execute command\.?$/im.test(t)) return true;
    if (/^Error:/im.test(t) && /^File "/im.test(t)) return true;
    return false;
  }

  function parseBelugaCommandError(text) {
    if (!isBelugaCommandError(text)) return null;
    var lines = stripBelugaAnsi(text).split('\n');
    var detail = [];
    var sawFailed = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line === ';') continue;
      if (/^-\s*Error in query\s*:\s*/i.test(line)) {
        line = line.replace(/^-\s*Error in query\s*:\s*/i, '').trim();
      }
      if (/^-\s*Failed to execute command\.?$/i.test(line)) {
        if (sawFailed) continue;
        sawFailed = true;
        continue;
      }
      if (/^-\s*Error\b/i.test(line) && !/^Error:/i.test(line)) {
        line = line.replace(/^-\s*Error\s*:\s*/i, '').trim();
        if (/^-\s*Failed to execute command\.?$/i.test(line)) continue;
      }
      if (line) detail.push(line);
    }
    var body = polishBelugaErrorDetail(detail.join('\n'));
    return {
      label: /^-\s*Error in query/im.test(stripBelugaAnsi(text)) ? 'Query failed' : 'Command failed',
      detail: body || 'Command failed.',
    };
  }

  function trimBindingValue(raw) {
    return String(raw != null ? raw : '').trim().replace(/[;.]+\s*$/, '');
  }

  function isInternalBindingValue(v) {
    if (!v || v === '^.' || v === '^' || v === '[]') return true;
    if (/^\?[A-Za-z0-9_.]+$/.test(v)) return true;
    if (/TClo\(|FREE BVar/i.test(v)) return true;
    if (/^\[[^\]]*(?:TClo|FREE BVar|\?[A-Za-z0-9_.]+)/i.test(v)) return true;
    return false;
  }

  function isInternalQueryLine(trimmed) {
    if (!trimmed || trimmed === '[]' || trimmed === '^.' || trimmed === '^') return true;
    return /^\[[^\]]*(?:TClo|FREE BVar|\?[A-Za-z0-9_.]+)/i.test(trimmed);
  }

  function normalizeWitnessTerm(v) {
    var out = v.replace(/\?[A-Za-z0-9_.]+/g, '?');
    var lam = out.match(/^\\([xX]\d*)\.\s*([\s\S]+)$/);
    if (lam) {
      var bvar = lam[1];
      var body = lam[2].replace(new RegExp('\\b' + bvar + '\\b', 'g'), 'x');
      body = body.replace(/\?[A-Za-z0-9_.]+/g, '?');
      return 'fn x => ' + body;
    }
    return out.replace(/\\x(\d+)/g, 'x');
  }

  function prettifyQueryBindings(bindings) {
    var out = [];
    for (var i = 0; i < (bindings || []).length; i++) {
      var key = bindings[i].key;
      var v = trimBindingValue(bindings[i].value);
      if (!v || isInternalBindingValue(v)) continue;
      out.push({ key: key, value: normalizeWitnessTerm(v) });
    }
    return out;
  }

  global.BelugaText = {
    normalizeBelugaRaw: normalizeBelugaRaw,
    stripBelugaAnsi: stripBelugaAnsi,
    isBelugaCommandError: isBelugaCommandError,
    parseBelugaCommandError: parseBelugaCommandError,
    isInternalQueryLine: isInternalQueryLine,
    prettifyQueryBindings: prettifyQueryBindings,
  };
})(typeof window !== 'undefined' ? window : self);
