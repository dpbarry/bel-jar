'use strict';

const global = globalThis;
var output = document.getElementById('output');

  function normBelugaRaw(s) {
    return global.BelugaText
      ? global.BelugaText.normalizeBelugaRaw(s)
      : String(s != null ? s : '').replace(/\r\n/g, '\n');
  }
  function stripAnsi(s) {
    return global.BelugaText ? global.BelugaText.stripBelugaAnsi(s) : normBelugaRaw(s);
  }
  function isInternalQueryLine(trimmed) {
    if (global.BelugaText && global.BelugaText.isInternalQueryLine) {
      return global.BelugaText.isInternalQueryLine(trimmed);
    }
    return trimmed === '[]' || trimmed === '^.' || trimmed === '^'
      || /^\[[^\]]*(?:TClo|FREE BVar|\?[A-Za-z0-9_.]+)/i.test(trimmed);
  }

  // BelJar-useful subset of Beluga's classic %: interpreter. Help + allowlist.
  var REPL_HELP_ROWS = [
    { cmd: 'help', desc: 'Show this command reference.' },
    { cmd: 'constructors IDENTIFIER', desc: 'LF constructors for the given type.' },
    { cmd: 'constructors-comp IDENTIFIER', desc: 'Computational constructors for the given datatype.' },
    { cmd: 'countholes', desc: 'Print how many holes are open.' },
    { cmd: 'fdef IDENTIFIER', desc: 'Print a function definition (theorem-style).' },
    { cmd: 'fsig IDENTIFIER', desc: 'Print a program signature (name : type).' },
    { cmd: 'lookuphole NAME', desc: 'Map a hole name to its numeric id.' },
    { cmd: 'printhole N', desc: 'Full hole information for index N.' },
    { cmd: 'query EXPECTED TRIES [LABEL :]TYP', desc: 'Logic-programming query for an LF type. No trailing dot (unlike --query in source). Example: query 1 * D : oft z nat' },
    { cmd: 'type EXP', desc: 'Infer and print the type of a computation-level expression.' },
    { cmd: 'types', desc: 'List LF types currently in scope.' },
  ];

  // Beluga verbs that exist in CLI/Emacs but do not apply in the browser shell.
  var REPL_UNAVAILABLE_VERBS = {
    chatteroff: true,
    chatteron: true,
    clearholes: true,
    'get-type': true,
    intro: true,
    load: true,
    lochole: true,
    quit: true,
    reload: true,
    reset: true,
    'solve-lf-hole': true,
    split: true,
  };

  var REPL_VERB_SET = (function () {
    var set = Object.create(null);
    for (var i = 0; i < REPL_HELP_ROWS.length; i++) {
      var v = String(REPL_HELP_ROWS[i].cmd || '').split(/\s+/)[0].toLowerCase();
      if (v) set[v] = true;
    }
    return set;
  })();

  function normalizeReplVerb(verb) {
    return String(verb != null ? verb : '').trim().toLowerCase();
  }

  function isKnownReplVerb(verb) {
    var v = normalizeReplVerb(verb);
    return !!(v && REPL_VERB_SET[v]);
  }

  function isUnavailableReplVerb(verb) {
    var v = normalizeReplVerb(verb);
    return !!(v && REPL_UNAVAILABLE_VERBS[v]);
  }

  function unavailableReplVerbMessage(verb) {
    var v = normalizeReplVerb(verb) || String(verb != null ? verb : '');
    return 'Command "' + v + '" does not apply in BelJar.';
  }

  function inferLineKind(line) {
    if (line === '') return 'blank';
    var t = line.trimStart();
    if (/^\[JS ERROR\]/i.test(t)) return 'error';
    if (/^\[FATAL\]/i.test(t)) return 'fatal';
    if (/^Error:/i.test(t)) return 'error';
    if (/^warning:/i.test(t)) return 'warn';
    if (/^-\s*Unhandled exception:/i.test(t)) return 'error';
    if (/^-\s*Failed to execute command\.?$/i.test(t)) return 'error';
    if (/^-\s*Error\b/i.test(t)) return 'error';
    if (/^Unrecognized command with name/i.test(t)) return 'error';
    if (/^No load command to repeat\.?$/i.test(t)) return 'error';
    if (/^##/.test(t)) {
      if (/done/i.test(t)) return 'meta-done';
      if (/begin/i.test(t)) return 'meta-begin';
      return 'meta';
    }
    if (/^#\s+%:/.test(t)) return 'cmd';
    if (/^#\s+Welcome to BelJar/i.test(t)) return 'welcome';
    if (/^Welcome to BelJar\./i.test(t)) return 'welcome';
    if (/^#\s/.test(t)) return 'muted';
    return 'out';
  }

  function makeReplLine(line, kind) {
    var row = document.createElement('div');
    row.className = 'repl-line repl-line--' + kind;
    if (kind === 'cmd') {
      var chev = document.createElement('span');
      chev.className = 'repl-chevron';
      chev.textContent = '❯';
      var body = document.createElement('span');
      body.className = 'repl-cmd-body';
      body.textContent = line.replace(/^#\s*/, '').replace(/^%:\s*/, '');
      row.appendChild(chev);
      row.appendChild(body);
    } else {
      row.textContent = line;
    }
    return row;
  }

  function splitOutputLines(text) {
    return normBelugaRaw(text).replace(/\n+$/, '').split('\n');
  }

  function stripBelugaTrailingSemicolons(text) {
    return normBelugaRaw(text).replace(/\s*;\s*$/g, '').trim();
  }

  function splitFirstColonSpace(line) {
    var i = line.indexOf(' : ');
    if (i <= 0) return null;
    return { left: line.slice(0, i).trim(), right: line.slice(i + 3).trim() };
  }

  function streamAppend(node) {
    if (typeof ReplStream !== 'undefined' && ReplStream.appendBeforeLive) {
      ReplStream.appendBeforeLive(node);
    } else {
      output.appendChild(node);
    }
  }

  function createReplBlock() {
    var block = document.createElement('div');
    block.className = 'repl-block';
    return block;
  }

  function scrollReplBottom() {
    if (typeof Persist !== 'undefined' && !Persist.readStoredReplAutoscroll()) return;
    if (typeof ReplStream !== 'undefined' && ReplStream.ensureLiveLine) {
      ReplStream.ensureLiveLine();
    }
    output.scrollTop = output.scrollHeight;
  }

  function appendRichTitle(shell, text) {
    var t = document.createElement('div');
    t.className = 'repl-rich-title';
    t.textContent = text;
    shell.appendChild(t);
  }

  function appendRichShell(rawText, buildDom) {
    var block = createReplBlock();
    var shell = document.createElement('div');
    shell.className = 'repl-rich';
    buildDom(shell);
    block.appendChild(shell);
    streamAppend(block);
    scrollReplBottom();
  }

  function appendRichMsg(kind, displayText, rawPlain) {
    appendRichShell(rawPlain != null ? rawPlain : displayText, function (shell) {
      var d = document.createElement('div');
      d.className = 'repl-rich-msg repl-rich-msg--' + kind;
      d.textContent = displayText;
      shell.appendChild(d);
    });
  }

  function belugaCommandErrorInfo(text) {
    if (global.BelugaText && typeof global.BelugaText.parseBelugaCommandError === 'function') {
      return global.BelugaText.parseBelugaCommandError(text);
    }
    return null;
  }

  function tryAppendBelugaWrappedCommandError(text) {
    var info = belugaCommandErrorInfo(text);
    if (!info) return false;
    appendRichBelugaCommandError(text, info.detail, info.label);
    return true;
  }

  function appendRichBelugaCommandError(rawText, detail, labelOpt) {
    appendRichShell(rawText, function (shell) {
      var card = document.createElement('div');
      card.className = 'repl-rich-error';

      var head = document.createElement('div');
      head.className = 'repl-rich-error-head';

      var icon = document.createElement('span');
      icon.className = 'repl-rich-error-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '⚠';

      var ht = document.createElement('span');
      ht.className = 'repl-rich-error-label';
      ht.textContent = labelOpt || 'Command failed';

      head.append(icon, ht);

      var body = document.createElement('div');
      body.className = 'repl-rich-error-detail';
      body.textContent = detail;

      card.append(head, body);
      shell.appendChild(card);
    });
  }

  function renderCoverageWarning(text) {
    appendRichShell(text, function (shell) {
      var head = document.createElement('div');
      head.className = 'repl-rich-warning-head';
      var kind = document.createElement('span');
      kind.className = 'repl-rich-warning-kind';
      kind.textContent = 'Coverage warning';
      head.appendChild(kind);
      var sub = document.createElement('span');
      sub.className = 'repl-rich-warning-sub';
      sub.textContent = 'Cases not covered';
      head.appendChild(sub);
      shell.appendChild(head);

      var lines = text.split('\n');
      var bodyLines = [];
      for (var k = 0; k < lines.length; k++) {
        var ln = lines[k];
        if (/^WARNING:\s*Cases didn't cover:?/i.test(ln.trim())) {
          var rest = ln.replace(/^[^:]*:\s*[^:]*:?\s*/, '').trim();
          if (/^CASE\(S\) NOT COVERED:?/i.test(rest)) continue;
          if (rest) bodyLines.push(rest);
        } else {
          bodyLines.push(ln);
        }
      }
      while (bodyLines.length && bodyLines[0].trim() === '') bodyLines.shift();
      while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === '') bodyLines.pop();

      var pre = document.createElement('pre');
      pre.className = 'repl-rich-pre repl-rich-pre--warning';
      pre.textContent = bodyLines.join('\n');
      shell.appendChild(pre);
    });
  }

  function appendRichPre(raw, titleOpt) {
    var text = normBelugaRaw(raw);
    var body = stripBelugaTrailingSemicolons(text);
    appendRichShell(text, function (shell) {
      if (titleOpt) appendRichTitle(shell, titleOpt);
      var pre = document.createElement('pre');
      pre.className = 'repl-rich-pre';
      pre.textContent = body;
      shell.appendChild(pre);
    });
  }

  function appendRichKvGrid(raw, titleText) {
    var inner = stripBelugaTrailingSemicolons(normBelugaRaw(raw));
    var lines = inner.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    appendRichShell(raw, function (shell) {
      appendRichTitle(shell, titleText);
      var warnings = [];
      var kv = [];
      lines.forEach(function (line) {
        if (/^\s*-\s/.test(line)) warnings.push(line.replace(/^\s*-\s*/, '').replace(/;\s*$/, '').trim());
        else kv.push(line);
      });
      warnings.forEach(function (w) {
        var d = document.createElement('div');
        d.className = 'repl-rich-msg repl-rich-msg--warn';
        d.textContent = w;
        shell.appendChild(d);
      });
      if (!kv.length) return;
      var grid = document.createElement('div');
      grid.className = 'repl-rich-kv-grid';
      kv.forEach(function (line) {
        var row = document.createElement('div');
        row.className = 'repl-rich-kv-row';
        var parsed = splitFirstColonSpace(line);
        if (parsed) {
          var k = document.createElement('code');
          k.className = 'repl-rich-k';
          k.textContent = parsed.left;
          var v = document.createElement('div');
          v.className = 'repl-rich-v';
          v.textContent = parsed.right;
          row.appendChild(k);
          row.appendChild(v);
        } else {
          row.className = 'repl-rich-kv-row repl-rich-kv-row--full';
          row.textContent = line;
        }
        grid.appendChild(row);
      });
      shell.appendChild(grid);
    });
  }

  function appendLoadFormatted(raw) {
    var text = normBelugaRaw(raw);
    var m = text.match(/The file\s+(.+?)\s+has been successfully loaded;/);
    if (m) {
      appendRichShell(text, function (shell) {
        appendRichTitle(shell, 'Loaded');
        var d = document.createElement('div');
        d.className = 'repl-rich-msg repl-rich-msg--success';
        d.textContent = 'Loaded "' + m[1] + '".';
        shell.appendChild(d);
      });
    } else appendOutput(text);
  }

  function appendCountholesFormatted(raw) {
    var t = stripBelugaTrailingSemicolons(normBelugaRaw(raw));
    var n = t.match(/^(\d+)\s*$/);
    if (n) {
      appendRichShell(raw, function (shell) {
        var count = Number(n[1]);
        var stat = document.createElement('div');
        stat.className = 'repl-rich-countholes';
        var badge = document.createElement('span');
        badge.className = 'repl-rich-countholes-badge';
        badge.textContent = String(count);
        var countText = document.createElement('span');
        countText.className = 'repl-rich-countholes-text';
        countText.textContent = count === 1 ? 'open hole' : 'open holes';
        stat.append(badge, countText);
        shell.appendChild(stat);
      });
    } else appendOutput(raw);
  }

  function appendLookupholeFormatted(raw) {
    var t = stripBelugaTrailingSemicolons(normBelugaRaw(raw));
    if (!t) return appendRichMsg('muted', '(no result)', '');
    appendRichShell(raw, function (shell) {
      appendRichTitle(shell, 'Hole id');
      var c = document.createElement('code');
      c.className = 'repl-rich-badge';
      c.textContent = t;
      shell.appendChild(c);
    });
  }

  function appendChatterFormatted(raw) {
    var t = stripBelugaTrailingSemicolons(normBelugaRaw(raw));
    var on = /chatter is on/i.test(t);
    var off = /chatter is off/i.test(t);
    appendRichShell(raw, function (shell) {
      var d = document.createElement('div');
      d.className = 'repl-rich-msg repl-rich-msg--success' + (on ? ' repl-rich-msg--accent' : '');
      d.textContent = on ? 'Verbose chatter is on.' : off ? 'Verbose chatter is off.' : t || 'Ok.';
      shell.appendChild(d);
    });
  }

  function collectEditorQuerySourceLines() {
    var editor = global.CurrentEditor;
    if (!editor || typeof editor.getValue !== 'function') return [];
    var src = editor.getValue();
    var out = [];
    var lines = src.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*--query\b/.test(lines[i])) out.push(i + 1);
    }
    return out;
  }

  function attachQuerySourceLines(segs, sourceLines) {
    if (!sourceLines || !sourceLines.length) return segs;
    var qi = 0;
    return segs.map(function (seg) {
      if (seg.type !== 'query') return seg;
      var sourceLine = qi < sourceLines.length ? sourceLines[qi] : null;
      qi++;
      if (!sourceLine) return seg;
      return {
        type: 'query',
        query: Object.assign({}, seg.query, { sourceLine: sourceLine }),
      };
    });
  }

  function parseQuerySolutions(raw) {
    var text = stripBelugaTrailingSemicolons(normBelugaRaw(raw)).trim();
    var lines = text.split('\n');
    var solutions = [];
    var cur = null;
    var curBinding = null;
    var isDone = false;
    var queryLine = '';
    var queryError = '';

    function flushBinding() {
      if (curBinding && cur) {
        cur.bindings.push({
          key: curBinding.key,
          value: curBinding.lines.join('\n').replace(/[;.]+\s*$/, '').trim(),
        });
      }
      curBinding = null;
    }

    for (var li = 0; li < lines.length; li++) {
      var rawLine = lines[li];
      var trimmed = rawLine.trim();
      if (!trimmed) continue;
      if (/^--query\b/.test(trimmed)) {
        queryLine = trimmed.replace(/[;.]\s*$/, '');
        continue;
      }
      if (/^Query error/i.test(trimmed)) {
        queryError = trimmed;
        if (/Search incomplete/i.test(trimmed)) isDone = false;
        continue;
      }
      if (/^Skipping query/i.test(trimmed)) {
        queryError = trimmed;
        continue;
      }
      if (isInternalQueryLine(trimmed)) continue;

      var solM = trimmed.match(/^-+\s*Solution\s+(\d+)\s*-+$/i);
      if (solM) {
        flushBinding();
        cur = { n: parseInt(solM[1], 10), bindings: [] };
        solutions.push(cur);
        continue;
      }
      if (/^Done\.?\s*$/.test(trimmed)) { isDone = true; continue; }

      var bindM = trimmed.match(/^([A-Za-z_][A-Za-z0-9_']*)\s*=\s*([\s\S]*)$/);
      if (bindM && cur) {
        flushBinding();
        var firstVal = bindM[2].replace(/[;.]+\s*$/, '').trimEnd();
        curBinding = { key: bindM[1], lines: [firstVal] };
        continue;
      }
      if (curBinding) {
        curBinding.lines.push(rawLine.replace(/[;.]+\s*$/, '').trimEnd());
      }
    }
    flushBinding();
    return { solutions: solutions, isDone: isDone, queryLine: queryLine, queryError: queryError };
  }

  function queryDisplayRows(bindings) {
    return global.BelugaText && global.BelugaText.prettifyQueryBindings
      ? global.BelugaText.prettifyQueryBindings(bindings)
      : (bindings || []);
  }

  function displayQueryBindings(container, rows) {
    container.replaceChildren();
    rows.forEach(function (b) {
      var row = document.createElement('div');
      row.className = 'repl-query-binding';
      var key = document.createElement('code');
      key.className = 'repl-query-key';
      key.textContent = b.key;
      var eq = document.createElement('span');
      eq.className = 'repl-query-eq';
      eq.textContent = '=';
      var val = document.createElement('code');
      val.className = 'repl-query-val';
      val.textContent = b.value;
      row.appendChild(key);
      row.appendChild(eq);
      row.appendChild(val);
      container.appendChild(row);
    });
  }

  function buildQueryDom(meta) {
    var solutions = meta.solutions || [];
    var isDone = !!meta.isDone;
    var queryLine = meta.queryLine || '';
    var queryError = meta.queryError || '';
    var sourceLine = meta.sourceLine || null;

    appendRichShell('', function (shell) {
      var wrap = document.createElement('div');
      wrap.className = 'repl-query-result';
      if (queryError) wrap.classList.add('repl-query-result--error');

      if (queryLine || sourceLine) {
        var headRow = document.createElement('div');
        headRow.className = 'repl-query-head';
        if (queryLine) {
          var goal = document.createElement('div');
          goal.className = 'repl-query-goal';
          goal.textContent = queryLine;
          headRow.appendChild(goal);
        }
        if (sourceLine) {
          var badge = document.createElement('div');
          badge.className = 'repl-query-src-line';
          badge.textContent = 'line ' + sourceLine;
          headRow.appendChild(badge);
        }
        wrap.appendChild(headRow);
      }

      solutions.forEach(function (sol, idx) {
        var rows = queryDisplayRows(sol.bindings);
        if (!rows.length) return;

        var card = document.createElement('div');
        card.className = 'repl-query-sol' + (idx > 0 ? ' repl-query-sol--nth' : '');

        var head = document.createElement('div');
        head.className = 'repl-query-sol-head';
        head.textContent = solutions.length > 1 ? 'Solution ' + sol.n : 'Solution';
        card.appendChild(head);

        if (rows.length) {
          var bindEl = document.createElement('div');
          bindEl.className = 'repl-query-bindings';
          displayQueryBindings(bindEl, rows);
          card.appendChild(bindEl);
        }

        wrap.appendChild(card);
      });

      if (queryError) {
        var err = document.createElement('div');
        err.className = 'repl-query-error';
        err.textContent = queryError;
        wrap.appendChild(err);
      } else if (isDone) {
        var msg = document.createElement('div');
        msg.className = 'repl-query-summary';
        msg.textContent = solutions.length === 1 ? '1 solution.'
          : solutions.length + ' solutions.';
        wrap.appendChild(msg);
      } else if (!solutions.length) {
        var empty = document.createElement('div');
        empty.className = 'repl-query-summary repl-query-summary--empty';
        empty.textContent = queryLine
          ? 'Search stopped without a result (no Done, no error reported).'
          : 'No solutions found.';
        wrap.appendChild(empty);
      }

      shell.appendChild(wrap);
    });
  }

  function appendQueryFormatted(raw) {
    var text = normBelugaRaw(raw);
    var cmdErr = belugaCommandErrorInfo(text);
    if (cmdErr) {
      appendRichBelugaCommandError(text, cmdErr.detail, cmdErr.label);
      return;
    }
    var trimmed = stripBelugaTrailingSemicolons(text).trim();
    if (!trimmed) { appendRichMsg('success', 'Query completed.', raw); return; }

    var result = parseQuerySolutions(raw);

    if (!result.solutions.length && !result.queryError) {
      if (/Skipping query/i.test(trimmed)) {
        appendRichMsg('muted', 'Query skipped (tries = 0).', raw);
        return;
      }
      if (result.isDone && result.queryLine) {
        buildQueryDom(result);
        return;
      }
      var msg = result.isDone ? 'No solutions found.' : trimmed;
      appendRichMsg(result.isDone ? 'muted' : 'out', msg, raw);
      return;
    }

    buildQueryDom(result);
  }

  function segmentRunOutput(text) {
    var lines = text.split('\n');
    var segs = [];
    var i = 0;
    var otherLines = [];

    function flushOther() {
      var filtered = otherLines
        .filter(function (l) { return !/^Done\.?\s*$/.test(l.trim()) && !/^\s*;\s*$/.test(l.trim()); })
        .join('\n').trim();
      if (filtered) segs.push({ type: 'other', text: filtered });
      otherLines = [];
    }

    while (i < lines.length) {
      var trimmed = lines[i].trim();

      if (/^##\s/.test(trimmed)) {
        flushOther();
        var trLines = [];
        while (i < lines.length && /^##\s/.test(lines[i].trim())) { trLines.push(lines[i]); i++; }
        var trText = trLines.join('\n').trim();
        if (/##\s*Holes:/i.test(trText)) {
          var detailLines = [];
          while (i < lines.length && !/^##\s/.test(lines[i].trim())) { detailLines.push(lines[i]); i++; }
          // Split one message into a green success part (## Type Reconstruction …)
          // and a violet hole part (## Holes + its detail) — rendered as two
          // connected blocks (no divider) in appendRunOutput.
          var allTr = trLines.concat(detailLines);
          var holeStart = 0;
          for (var k = 0; k < allTr.length; k++) {
            if (/##\s*Holes:/i.test(allTr[k].trim())) { holeStart = k; break; }
          }
          segs.push({
            type: 'type-recon-holes',
            statusText: allTr.slice(0, holeStart).join('\n').trim(),
            holesText: allTr.slice(holeStart).join('\n').trim(),
          });
        } else {
          segs.push({ type: 'type-recon', text: trText });
        }
        continue;
      }

      if (/^WARNING:\s*Cases didn't cover/i.test(trimmed)) {
        flushOther();
        var wLines = [];
        while (i < lines.length) {
          var wt = lines[i].trim();
          if (i > 0 && (/^##\s/.test(wt) || /^--query\b/.test(wt))) break;
          if (wt === '' && wLines.length && wLines[wLines.length - 1].trim() === '') break;
          wLines.push(lines[i]);
          i++;
        }
        while (wLines.length && wLines[wLines.length - 1].trim() === '') wLines.pop();
        segs.push({ type: 'warning', text: wLines.join('\n').trim() });
        continue;
      }

      if (/^--query\b/.test(trimmed) || /^-{5,}\s*Solution\s+\d+\s*-{5,}$/i.test(trimmed)) {
        flushOther();
        var qLines = [];
        while (i < lines.length) {
          var qt = lines[i].trim();
          if (qLines.length > 0 && /^--query\b/.test(qt)) break;
          qLines.push(lines[i]);
          if (/^Done\.?\s*$/.test(qt) || /^Query error/i.test(qt) || /^Skipping query/i.test(qt)) {
            i++;
            break;
          }
          i++;
        }
        var qResult = parseQuerySolutions(qLines.join('\n'));
        segs.push({ type: 'query', query: qResult });
        continue;
      }

      if (!trimmed || trimmed === '[]' || trimmed === '^.' || trimmed === '^' || trimmed === ';') {
        var filterChatter = typeof Persist === 'undefined' || Persist.readStoredReplFilterChatter();
        if (filterChatter) { i++; continue; }
      }

      otherLines.push(lines[i]);
      i++;
    }

    flushOther();
    var merged = [];
    for (var s = 0; s < segs.length; s++) {
      var seg = segs[s];
      if (seg.type === 'type-recon' && merged.length > 0 && merged[merged.length - 1].type === 'type-recon') {
        merged[merged.length - 1].text += '\n' + seg.text;
      } else {
        merged.push(seg);
      }
    }
    return merged;
  }

  function appendBelugaFormattedOutput(raw, verb) {
    var text = normBelugaRaw(raw);
    var trimmed = text.trim();

    if (!trimmed) {
      if (verb === 'clearholes') appendRichMsg('success', 'Computation holes cleared.', '');
      return;
    }

    switch (verb) {
      case 'types':
        if (trimmed === ';') appendRichMsg('muted', 'No LF types in scope yet.', ';');
        else appendRichKvGrid(raw, 'LF types');
        return;
      case 'constructors':
      case 'constructors-comp':
        appendRichKvGrid(raw, verb === 'constructors' ? 'LF constructors' : 'Computation constructors');
        return;
      case 'fsig':
        appendRichKvGrid(raw, 'Signature');
        return;
      case 'countholes':
        appendCountholesFormatted(raw);
        return;
      case 'chatteron':
      case 'chatteroff':
        appendChatterFormatted(raw);
        return;
      case 'reset':
        appendRichMsg('success', 'Store reset.', raw);
        return;
      case 'clearholes':
        appendRichMsg('success', 'Computation holes cleared.', raw);
        return;
      case 'load':
        appendLoadFormatted(raw);
        return;
      case 'reload':
        appendOutput(raw);
        return;
      case 'lochole':
        appendRichPre(raw, 'Location');
        return;
      case 'printhole':
        appendRichPre(raw, 'Hole');
        return;
      case 'intro':
      case 'split':
        appendRichPre(raw, 'Expression');
        return;
      case 'solve-lf-hole':
        appendRichPre(raw, 'LF solutions');
        return;
      case 'fdef':
        appendRichPre(raw, 'Definition');
        return;
      case 'get-type':
        appendRichPre(raw, 'Type');
        return;
      case 'type':
        appendRichPre(raw, 'Type check');
        return;
      case 'lookuphole':
        appendLookupholeFormatted(raw);
        return;
      case 'query':
        appendQueryFormatted(raw);
        return;
      default:
        appendOutput(raw);
    }
  }

  function appendBelugaResponse(raw, verb) {
    // After a whole-project load, checker locations refer to the concatenated
    // source — rewrite them back to real file names + file-relative lines.
    if (typeof BelugaRun !== 'undefined' && typeof ProjectSource !== 'undefined'
        && typeof BelugaRun.getProjectSpans === 'function') {
      var spans = BelugaRun.getProjectSpans();
      if (spans) raw = ProjectSource.remapLocations(raw, spans);
    }
    if (verb == null || verb === '') appendRunOutput(raw);
    else appendBelugaFormattedOutput(raw, verb);
  }

  function classifyRunOtherKind(text) {
    var segLines = String(text || '').split('\n');
    var isTypeReconStatus =
      segLines.length > 0 &&
      segLines.every(function (line) {
        return /^##\s*Type Reconstruction (begin|done):/i.test(line.trim());
      });
    if (isTypeReconStatus) return 'success';
    if (/##\s*Holes:/i.test(text)) return 'holes';
    // Fail closed: Run must never leave a plain grey block. Beluga's unlocated
    // printers (e.g. Unbound_identifier → "Identifier & is unbound.") omit "Error:".
    return 'error';
  }

  function appendRunOutput(raw) {
    var clean = stripAnsi(raw).replace(/\n+$/, '');
    if (!clean.trim()) return;
    var segs = attachQuerySourceLines(segmentRunOutput(clean), collectEditorQuerySourceLines());
    segs.forEach(function (seg) {
      if (seg.type === 'query') {
        buildQueryDom(seg.query);
        return;
      }
      if (seg.type === 'warning') {
        renderCoverageWarning(seg.text);
        return;
      }
      if (seg.type === 'type-recon-holes') {
        // One message, two connected blocks: green success on top, violet holes
        // below. `.repl-rich--stacked` merges the seam (no dividing line).
        appendRichShell((seg.statusText + '\n' + seg.holesText).trim(), function (shell) {
          shell.classList.add('repl-rich--stacked');
          if (seg.statusText) {
            var sp = document.createElement('pre');
            sp.className = 'repl-rich-pre repl-rich-pre--run repl-rich-pre--run-success';
            sp.textContent = seg.statusText;
            shell.appendChild(sp);
          }
          var hp = document.createElement('pre');
          hp.className = 'repl-rich-pre repl-rich-pre--run repl-rich-pre--run-holes';
          hp.textContent = seg.holesText;
          shell.appendChild(hp);
        });
        return;
      }
      var text = seg.text;
      if (!text.trim()) return;
      appendRichShell(text, function (shell) {
        var pre = document.createElement('pre');
        pre.className = 'repl-rich-pre repl-rich-pre--run';
        var kind = classifyRunOtherKind(text);
        if (kind === 'success') pre.classList.add('repl-rich-pre--run-success');
        else if (kind === 'holes') pre.classList.add('repl-rich-pre--run-holes');
        else pre.classList.add('repl-rich-pre--run-error');
        pre.textContent = text;
        shell.appendChild(pre);
      });
    });
  }

  function appendOutput(text, forcedKind) {
    if (text == null || text === '' || !String(text).trim()) return;

    var useForce = forcedKind && forcedKind !== 'auto';
    if (!useForce && tryAppendBelugaWrappedCommandError(text)) return;

    var block = createReplBlock();
    var lines = splitOutputLines(text);

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var kind;
      if (useForce) kind = forcedKind;
      else kind = inferLineKind(line);
      block.appendChild(makeReplLine(line, kind));
    }
    streamAppend(block);
    scrollReplBottom();
  }

  function appendReplHelp() {
    var block = createReplBlock();
    var wrap = document.createElement('div');
    wrap.className = 'repl-help';

    var head = document.createElement('div');
    head.className = 'repl-help-head';
    head.textContent = 'Commands';

    var grid = document.createElement('div');
    grid.className = 'repl-help-grid';

    REPL_HELP_ROWS.forEach(function (rowSpec) {
      var row = document.createElement('div');
      row.className = 'repl-help-row';
      var cmdEl = document.createElement('code');
      cmdEl.className = 'repl-help-cmd';
      cmdEl.textContent = rowSpec.cmd;
      var descEl = document.createElement('div');
      descEl.className = 'repl-help-desc';
      descEl.textContent = rowSpec.desc;
      row.appendChild(cmdEl);
      row.appendChild(descEl);
      grid.appendChild(row);
    });

    wrap.append(head, grid);
    block.appendChild(wrap);
    streamAppend(block);
    scrollReplBottom();
  }

  function appendRichKvRow(grid, left, right) {
    var row = document.createElement('div');
    row.className = 'repl-rich-kv-row';
    var k = document.createElement('code');
    k.className = 'repl-rich-k';
    k.textContent = left;
    var v = document.createElement('div');
    v.className = 'repl-rich-v';
    v.textContent = right;
    row.append(k, v);
    grid.appendChild(row);
  }

  function projectFilesSummary(belCount, elfCount, cfgCount) {
    var parts = [];
    if (belCount) parts.push(belCount + ' .bel');
    if (elfCount) parts.push(elfCount + ' .elf (prelude)');
    if (cfgCount) parts.push(cfgCount + ' .cfg');
    return parts.join(' · ');
  }

  function appendProjectOpened(info) {
    info = info || {};
    var name = String(info.name != null ? info.name : 'Untitled Project');
    var belCount = Number(info.belCount) || 0;
    var elfCount = Number(info.elfCount) || 0;
    var cfgCount = Number(info.cfgCount) || 0;
    var defaultCfgPath = info.defaultCfgPath ? String(info.defaultCfgPath) : '';

    appendRichShell('', function (shell) {
      appendRichTitle(shell, 'Project');
      var grid = document.createElement('div');
      grid.className = 'repl-rich-kv-grid';
      appendRichKvRow(grid, 'Folder', name);
      var files = projectFilesSummary(belCount, elfCount, cfgCount);
      if (files) appendRichKvRow(grid, 'Files', files);
      if (defaultCfgPath) appendRichKvRow(grid, 'Flow', defaultCfgPath.split('/').pop());
      shell.appendChild(grid);
      var note = document.createElement('div');
      note.className = 'repl-rich-kv-row repl-rich-kv-row--full repl-rich-v';
      note.textContent = 'Run and lint prepend earlier files from the matching .cfg in each folder.';
      shell.appendChild(note);
    });
  }

  function appendProjectEmpty() {
    appendRichShell('', function (shell) {
      appendRichTitle(shell, 'Project');
      var msg = document.createElement('div');
      msg.className = 'repl-rich-msg repl-rich-msg--warn';
      msg.textContent = 'No .bel files in that folder.';
      shell.appendChild(msg);
    });
  }

  function insertWelcomeBanner() {
    if (typeof Persist !== 'undefined' && !Persist.readStoredReplWelcome()) return;
    var wrap = document.createElement('div');
    wrap.className = 'repl-banner';

    var lead = document.createElement('div');
    lead.className = 'repl-banner-line';
    lead.appendChild(document.createTextNode('Beluga 1.1.3 — '));

    var kHelp = document.createElement('span');
    kHelp.className = 'repl-banner-cmd';
    kHelp.textContent = 'help';
    lead.appendChild(kHelp);
    lead.appendChild(document.createTextNode(' to see commands.'));

    wrap.appendChild(lead);
    streamAppend(wrap);
  }

  function clearOutput() {
    if (typeof ReplStream !== 'undefined' && ReplStream.clearExceptLive) {
      ReplStream.clearExceptLive();
    } else {
      output.replaceChildren();
    }
    insertWelcomeBanner();
    if (typeof ReplStream !== 'undefined' && ReplStream.ensureLiveLine) {
      ReplStream.ensureLiveLine();
    }
    if (typeof ReplPersist !== 'undefined' && ReplPersist.saveNow) {
      ReplPersist.saveNow();
    }
  }

  function appendBuildFallbackNotice() {
    var block = createReplBlock();
    var shell = document.createElement('div');
    shell.className = 'repl-rich';
    var pre = document.createElement('pre');
    pre.className = 'repl-rich-pre repl-rich-pre--run repl-rich-pre--run-holes';
    pre.textContent = 'Fast build hit the stack limit. Retrying with Stable.\nTip: switch to Stable in Settings to avoid this for large files.';
    shell.appendChild(pre);
    block.appendChild(shell);
    streamAppend(block);
    scrollReplBottom();
  }

  global.ReplOutput = {
    appendOutput: appendOutput,
    appendReplHelp: appendReplHelp,
    appendRunOutput: appendRunOutput,
    appendBelugaResponse: appendBelugaResponse,
    appendBuildFallbackNotice: appendBuildFallbackNotice,
    appendRichMsg: appendRichMsg,
    appendProjectOpened: appendProjectOpened,
    appendProjectEmpty: appendProjectEmpty,
    insertWelcomeBanner: insertWelcomeBanner,
    clearOutput: clearOutput,
    scrollReplBottom: scrollReplBottom,
    parseQuerySolutions: parseQuerySolutions,
    segmentRunOutput: segmentRunOutput,
    classifyRunOtherKind: classifyRunOtherKind,
    createReplBlock: createReplBlock,
    isKnownReplVerb: isKnownReplVerb,
    isUnavailableReplVerb: isUnavailableReplVerb,
    unavailableReplVerbMessage: unavailableReplVerbMessage,
  };
  global.BelJarReplOutput = global.ReplOutput;
