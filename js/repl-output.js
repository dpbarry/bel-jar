'use strict';

// REPL rendering: output DOM, beautify toggle, all appendXxx helpers.
(function (global) {
  var output = document.getElementById('output');
  var replBeautifyEnabled = !(
    typeof BelJarPersist !== 'undefined' && BelJarPersist.readStoredReplRaw()
  );

  function normBelugaRaw(s) {
    return global.BelugaText
      ? global.BelugaText.normalizeBelugaRaw(s)
      : String(s != null ? s : '').replace(/\r\n/g, '\n');
  }
  function stripAnsi(s) {
    return global.BelugaText ? global.BelugaText.stripBelugaAnsi(s) : normBelugaRaw(s);
  }

  var REPL_HELP_ROWS = [
    { cmd: 'help', desc: 'Show this command reference.' },
    { cmd: 'chatteroff', desc: 'Turn off verbose solver chatter.' },
    { cmd: 'chatteron', desc: 'Turn chatter back on.' },
    { cmd: 'clearholes', desc: 'Clear all computation-level holes.' },
    { cmd: 'constructors IDENTIFIER', desc: 'LF constructors for the given type.' },
    { cmd: 'constructors-comp IDENTIFIER', desc: 'Computational constructors for the given datatype.' },
    { cmd: 'countholes', desc: 'Print how many holes are open.' },
    { cmd: 'fdef IDENTIFIER', desc: 'Print a function definition (theorem-style).' },
    { cmd: 'fsig IDENTIFIER', desc: 'Print a program signature (name : type).' },
    { cmd: 'get-type LINE COLUMN', desc: 'Type at position (primarily for Emacs integration).' },
    { cmd: 'intro N', desc: 'Introduce variables into computational hole N.' },
    { cmd: 'load FILE', desc: 'Reset state and load a file from disk (limited in the browser).' },
    { cmd: 'lochole N', desc: 'Source location tuple for hole N.' },
    { cmd: 'lookuphole NAME', desc: 'Map a hole name to its numeric id.' },
    { cmd: 'printhole N', desc: 'Full hole information for index N.' },
    { cmd: 'query EXPECTED TRIES TYP', desc: 'Logic-programming query for inhabitants of a type.' },
    { cmd: 'quit', desc: 'Exits Beluga CLI (disabled here in the browser).' },
    { cmd: 'reload', desc: 'Reset and repeat the last load command.' },
    { cmd: 'reset', desc: 'Clear store, type info, and holes.' },
    { cmd: 'solve-lf-hole N', desc: 'Solve an LF hole via logic programming.' },
    { cmd: 'split H V', desc: 'Split on variable V in computational hole H.' },
    { cmd: 'type EXP', desc: 'Infer and print the type of a computation-level expression.' },
    { cmd: 'types', desc: 'List LF types currently in scope.' },
  ];

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

  function createReplBlock() {
    var block = document.createElement('div');
    block.className = 'repl-block';
    return block;
  }

  function scrollReplBottom() {
    output.scrollTop = output.scrollHeight;
  }

  function appendRichTitle(shell, text) {
    var t = document.createElement('div');
    t.className = 'repl-rich-title';
    t.textContent = text;
    shell.appendChild(t);
  }

  function appendRichShell(rawText, buildDom) {
    if (!replBeautifyEnabled) {
      var plain = stripAnsi(normBelugaRaw(rawText));
      if (plain.trim()) appendOutput(plain);
      return;
    }
    var block = createReplBlock();
    var shell = document.createElement('div');
    shell.className = 'repl-rich';
    buildDom(shell);
    block.appendChild(shell);
    output.appendChild(block);
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

  function polishBelugaErrorDetail(detail) {
    return detail.replace(/;\s*$/, '').trim();
  }

  function tryAppendBelugaWrappedCommandError(text) {
    if (!replBeautifyEnabled) return false;
    var lines = normBelugaRaw(text).split('\n');
    var i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    if (i >= lines.length) return false;
    var hdr = lines[i].trim();
    if (!/^-\s*Failed to execute command\.?$/i.test(hdr)) return false;
    var detailRaw = lines.slice(i + 1).join('\n').trim();
    var detail = polishBelugaErrorDetail(detailRaw || 'Unknown error.');
    appendRichBelugaCommandError(text, detail);
    return true;
  }

  function appendRichBelugaCommandError(rawText, detail) {
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
      ht.textContent = 'Command failed';

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

  function parseQuerySolutions(raw) {
    var text = stripBelugaTrailingSemicolons(normBelugaRaw(raw)).trim();
    var lines = text.split('\n');
    var solutions = [];
    var cur = null;
    var curBinding = null;
    var isDone = false;

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
      if (/^--query\b/.test(trimmed)) continue;
      if (trimmed === '[]' || trimmed === '^.' || trimmed === '^') continue;

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
    return { solutions: solutions, isDone: isDone };
  }

  function buildQueryDom(solutions, isDone) {
    appendRichShell('', function (shell) {
      var wrap = document.createElement('div');
      wrap.className = 'repl-query-result';

      solutions.forEach(function (sol, idx) {
        var card = document.createElement('div');
        card.className = 'repl-query-sol' + (idx > 0 ? ' repl-query-sol--nth' : '');

        var head = document.createElement('div');
        head.className = 'repl-query-sol-head';
        head.textContent = solutions.length > 1 ? 'Solution ' + sol.n : 'Solution';
        card.appendChild(head);

        if (sol.bindings.length) {
          var rows = document.createElement('div');
          rows.className = 'repl-query-bindings';
          sol.bindings.forEach(function (b) {
            var row = document.createElement('div');
            row.className = 'repl-query-binding';
            var key = document.createElement('code');
            key.className = 'repl-query-key';
            key.textContent = b.key;
            var eq = document.createElement('span');
            eq.className = 'repl-query-eq';
            eq.textContent = '=';
            var val = document.createElement('pre');
            val.className = 'repl-query-val';
            val.textContent = b.value;
            row.appendChild(key);
            row.appendChild(eq);
            row.appendChild(val);
            rows.appendChild(row);
          });
          card.appendChild(rows);
        }
        wrap.appendChild(card);
      });

      if (isDone) {
        var msg = document.createElement('div');
        msg.className = 'repl-query-summary';
        msg.textContent = solutions.length === 1 ? '1 solution.' : solutions.length + ' solutions.';
        wrap.appendChild(msg);
      }

      shell.appendChild(wrap);
    });
  }

  function appendQueryFormatted(raw) {
    var text = normBelugaRaw(raw);
    if (/^\s*-\s*Error/i.test(text) || /^\s*-\s*Failed/i.test(text)) {
      appendOutput(raw);
      return;
    }
    var trimmed = stripBelugaTrailingSemicolons(text).trim();
    if (!trimmed) { appendRichMsg('success', 'Query completed.', raw); return; }

    var result = parseQuerySolutions(raw);
    var solutions = result.solutions;
    var isDone = result.isDone;

    if (!solutions.length) {
      var msg = /Skipping query/i.test(trimmed) ? 'Query skipped (tries = 0).'
               : isDone ? 'No solutions found.'
               : trimmed;
      appendRichMsg(isDone ? 'muted' : 'out', msg, raw);
      return;
    }

    buildQueryDom(solutions, isDone);
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
          segs.push({ type: 'type-recon', text: (trText + '\n' + detailLines.join('\n')).trim() });
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
          qLines.push(lines[i]);
          var qt = lines[i].trim();
          if (/^Done\.?\s*$/.test(qt) || /^Query error/i.test(qt) || /^Skipping query/i.test(qt)) { i++; break; }
          i++;
        }
        var qResult = parseQuerySolutions(qLines.join('\n'));
        segs.push({ type: 'query', solutions: qResult.solutions, isDone: qResult.isDone, queryError: !qResult.isDone && !qResult.solutions.length });
        continue;
      }

      if (!trimmed || trimmed === '[]' || trimmed === '^.' || trimmed === '^' || trimmed === ';') { i++; continue; }

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
    if (verb == null || verb === '') appendRunOutput(raw);
    else appendBelugaFormattedOutput(raw, verb);
  }

  function appendRunOutput(raw) {
    var clean = stripAnsi(raw).replace(/\n+$/, '');
    if (!clean.trim()) return;
    if (!replBeautifyEnabled) {
      appendOutput(clean);
      return;
    }
    var segs = segmentRunOutput(clean);
    segs.forEach(function (seg) {
      if (seg.type === 'query') {
        buildQueryDom(seg.solutions, seg.isDone);
        return;
      }
      if (seg.type === 'warning') {
        renderCoverageWarning(seg.text);
        return;
      }
      var text = seg.text;
      if (!text.trim()) return;
      appendRichShell(text, function (shell) {
        var pre = document.createElement('pre');
        pre.className = 'repl-rich-pre repl-rich-pre--run';
        var segLines = text.split('\n');
        var isRunError = /\b(error|failed|exception)\b/i.test(text);
        var isTypeReconStatus =
          segLines.length > 0 &&
          segLines.every(function (line) {
            return /^##\s*Type Reconstruction (begin|done):/i.test(line.trim());
          });
        var hasHolesSection = /##\s*Holes:/i.test(text);
        if (isRunError) pre.classList.add('repl-rich-pre--run-error');
        else if (isTypeReconStatus) pre.classList.add('repl-rich-pre--run-success');
        else if (hasHolesSection) pre.classList.add('repl-rich-pre--run-holes');
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
      else if (replBeautifyEnabled) kind = inferLineKind(line);
      else kind = line === '' ? 'blank' : 'out';
      block.appendChild(makeReplLine(line, kind));
    }
    output.appendChild(block);
    scrollReplBottom();
  }

  function appendReplHelp() {
    if (!replBeautifyEnabled) {
      var plainLines = ['Commands'].concat(
        REPL_HELP_ROWS.map(function (rowSpec) {
          return '  ' + rowSpec.cmd + ' — ' + rowSpec.desc;
        })
      );
      appendOutput(plainLines.join('\n'));
      return;
    }
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
    output.appendChild(block);
    scrollReplBottom();
  }

  function insertWelcomeBanner() {
    var wrap = document.createElement('div');
    wrap.className = 'repl-welcome';

    var lead = document.createElement('p');
    lead.className = 'repl-welcome-lead';

    lead.appendChild(document.createTextNode('Welcome to BelJar. Try '));

    var kHelp = document.createElement('kbd');
    kHelp.className = 'repl-welcome-kbd';
    kHelp.textContent = 'help';
    lead.appendChild(kHelp);
    lead.appendChild(document.createTextNode(' for a list of REPL commands.'));

    wrap.appendChild(lead);
    output.appendChild(wrap);
  }

  function clearOutput() {
    output.replaceChildren();
    insertWelcomeBanner();
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
    output.appendChild(block);
    scrollReplBottom();
  }

  function setReplBeautify(on) {
    replBeautifyEnabled = !!on;
    if (typeof BelJarPersist !== 'undefined') {
      BelJarPersist.writeStoredReplRaw(!replBeautifyEnabled);
    }
    if (typeof BelJarSettingsUI !== 'undefined') BelJarSettingsUI.syncFromState();
  }

  global.BelJarReplOutput = {
    appendOutput: appendOutput,
    appendReplHelp: appendReplHelp,
    appendRunOutput: appendRunOutput,
    appendBelugaResponse: appendBelugaResponse,
    appendBuildFallbackNotice: appendBuildFallbackNotice,
    appendRichMsg: appendRichMsg,
    insertWelcomeBanner: insertWelcomeBanner,
    clearOutput: clearOutput,
    scrollReplBottom: scrollReplBottom,
    setReplBeautify: setReplBeautify,
    getReplBeautify: function () { return replBeautifyEnabled; },
    parseQuerySolutions: parseQuerySolutions,
    segmentRunOutput: segmentRunOutput,
    createReplBlock: createReplBlock,
  };
})(typeof window !== 'undefined' ? window : globalThis);
