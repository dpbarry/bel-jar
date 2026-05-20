const output = document.getElementById('output');
const editorMount = document.getElementById('editor');
const cmdInput = document.getElementById('command-input');
const btnLoad = document.getElementById('btn-load');
const btnRun = document.getElementById('btn-run');

let belugaBusy = false;

function setBelugaBusy(busy) {
  belugaBusy = !!busy;
  if (btnLoad) btnLoad.disabled = belugaBusy;
  if (btnRun) btnRun.disabled = belugaBusy;
  if (cmdInput) cmdInput.disabled = belugaBusy;
}

function appendBuildFallbackNotice() {
  const block = createReplBlock();
  const shell = document.createElement('div');
  shell.className = 'repl-rich';
  const pre = document.createElement('pre');
  pre.className = 'repl-rich-pre repl-rich-pre--run repl-rich-pre--run-holes';
  pre.textContent = 'Fast build hit the stack limit. Retrying with Stable.\nTip: switch to Stable in Settings to avoid this for large files.';
  shell.appendChild(pre);
  block.appendChild(shell);
  output.appendChild(block);
  scrollReplBottom();
}

function belugaProgressHook(msg) {
  if (msg && msg.phase === 'build-fallback') {
    appendBuildFallbackNotice();
    if (typeof RunProgress !== 'undefined') RunProgress.start({ op: 'load' });
    return;
  }
  if (typeof RunProgress !== 'undefined') RunProgress.onBelugaProgress(msg);
}

const persist =
  typeof BelJarPersist !== 'undefined' ? BelJarPersist.createPersist() : null;

const editor =
  typeof BelJarEditor !== 'undefined' && BelJarEditor.mount
    ? BelJarEditor.mount(editorMount, {
        doc: persist ? persist.getEditorText() : '',
        onDocChange: persist
          ? function (text) {
              persist.scheduleEditorPersist(text);
            }
          : function () {},
      })
    : null;

if (typeof BelJarWorkspaceSplit !== 'undefined') {
  BelJarWorkspaceSplit.init({
    onResize: function () {
      if (editor && editor.getView) editor.getView().requestMeasure();
    },
  });
}

let replBeautifyEnabled = !(
  typeof BelJarPersist !== 'undefined' && BelJarPersist.readStoredReplRaw()
);

function setReplBeautify(on) {
  replBeautifyEnabled = !!on;
  if (typeof BelJarPersist !== 'undefined') {
    BelJarPersist.writeStoredReplRaw(!replBeautifyEnabled);
  }
  syncSettingsDialogFromState();
}

const BELUGA_MODE_KEY = 'beljar-beluga-mode';

let belugaMode = (() => {
  try {
    const v = localStorage.getItem(BELUGA_MODE_KEY);
    if (v === 'fast' || v === 'stable') return v;
    // Migrate from old build key
    const old = localStorage.getItem('beljar-beluga-build');
    return (old === 'fast' || old === 'auto') ? 'fast' : 'stable';
  } catch (_) { return 'stable'; }
})();

function modeToConfig(mode) {
  return mode === 'fast'
    ? { thread: 'main', build: 'fast' }
    : { thread: 'worker', build: 'stable' };
}

function setBelugaMode(m) {
  belugaMode = m;
  try { localStorage.setItem(BELUGA_MODE_KEY, m); } catch (_) {}
  if (typeof BelugaClient !== 'undefined') {
    BelugaClient.configure(modeToConfig(m));
    BelugaClient.warm().catch(function () {});
  }
  syncSettingsDialogFromState();
}

const REPL_HELP_ROWS = [
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
  { cmd: 'lookuphole NAME', desc: "Map a hole name to its numeric id." },
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
  const t = line.trimStart();
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
  const row = document.createElement('div');
  row.className = 'repl-line repl-line--' + kind;

  if (kind === 'cmd') {
    const chev = document.createElement('span');
    chev.className = 'repl-chevron';
    chev.textContent = '\u276F';
    const body = document.createElement('span');
    body.className = 'repl-cmd-body';
    body.textContent = line.replace(/^#\s*/, '').replace(/^%:\s*/, '');
    row.appendChild(chev);
    row.appendChild(body);
  } else {
    row.textContent = line;
  }
  return row;
}

function normalizeBelugaRaw(raw) {
  return String(raw != null ? raw : '').replace(/\r\n/g, '\n');
}

function stripBelugaAnsi(raw) {
  return normalizeBelugaRaw(raw)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\u009b[0-9;]*m/g, '')
    .replace(/Ø\[[0-9;]*m/g, '');
}

function splitOutputLines(text) {
  return normalizeBelugaRaw(text)
    .replace(/\n+$/, '')
    .split('\n');
}

function stripBelugaTrailingSemicolons(text) {
  return normalizeBelugaRaw(text)
    .replace(/\s*;\s*$/g, '')
    .trim();
}

function parseBelugaCmd(prefixed) {
  const inner = normalizeBelugaRaw(prefixed).replace(/^%\:/, '').trim();
  if (!inner) return { verb: '', args: '' };
  const sp = inner.search(/\s/);
  if (sp === -1) return { verb: inner, args: '' };
  return { verb: inner.slice(0, sp), args: inner.slice(sp + 1).trim() };
}

function splitFirstColonSpace(line) {
  const i = line.indexOf(' : ');
  if (i <= 0) return null;
  return { left: line.slice(0, i).trim(), right: line.slice(i + 3).trim() };
}

function appendRichTitle(shell, text) {
  const t = document.createElement('div');
  t.className = 'repl-rich-title';
  t.textContent = text;
  shell.appendChild(t);
}

function appendRichShell(rawText, buildDom) {
  if (!replBeautifyEnabled) {
    const plain = stripBelugaAnsi(normalizeBelugaRaw(rawText));
    if (plain.trim()) appendOutput(plain);
    return;
  }
  const block = createReplBlock();
  const shell = document.createElement('div');
  shell.className = 'repl-rich';
  buildDom(shell);
  block.appendChild(shell);
  output.appendChild(block);
  scrollReplBottom();
}

function appendRichMsg(kind, displayText, rawPlain) {
  appendRichShell(rawPlain != null ? rawPlain : displayText, function (shell) {
    const d = document.createElement('div');
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
  const lines = normalizeBelugaRaw(text).split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length) return false;
  const hdr = lines[i].trim();
  if (!/^-\s*Failed to execute command\.?$/i.test(hdr)) return false;
  const detailRaw = lines.slice(i + 1).join('\n').trim();
  const detail = polishBelugaErrorDetail(detailRaw || 'Unknown error.');
  appendRichBelugaCommandError(text, detail);
  return true;
}

function appendRichBelugaCommandError(rawText, detail) {
  appendRichShell(rawText, function (shell) {
    const card = document.createElement('div');
    card.className = 'repl-rich-error';

    const head = document.createElement('div');
    head.className = 'repl-rich-error-head';

    const icon = document.createElement('span');
    icon.className = 'repl-rich-error-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '\u26A0';

    const ht = document.createElement('span');
    ht.className = 'repl-rich-error-label';
    ht.textContent = 'Command failed';

    head.append(icon, ht);

    const body = document.createElement('div');
    body.className = 'repl-rich-error-detail';
    body.textContent = detail;

    card.append(head, body);
    shell.appendChild(card);
  });
}

function appendRichPre(raw, titleOpt) {
  const text = normalizeBelugaRaw(raw);
  const body = stripBelugaTrailingSemicolons(text);
  appendRichShell(text, function (shell) {
    if (titleOpt) appendRichTitle(shell, titleOpt);
    const pre = document.createElement('pre');
    pre.className = 'repl-rich-pre';
    pre.textContent = body;
    shell.appendChild(pre);
  });
}

function appendRichKvGrid(raw, titleText) {
  const inner = stripBelugaTrailingSemicolons(normalizeBelugaRaw(raw));
  const lines = inner
    .split('\n')
    .map(function (l) {
      return l.trim();
    })
    .filter(Boolean);
  appendRichShell(raw, function (shell) {
    appendRichTitle(shell, titleText);
    const warnings = [];
    const kv = [];
    lines.forEach(function (line) {
      if (/^\s*-\s/.test(line)) warnings.push(line.replace(/^\s*-\s*/, '').replace(/;\s*$/, '').trim());
      else kv.push(line);
    });
    warnings.forEach(function (w) {
      const d = document.createElement('div');
      d.className = 'repl-rich-msg repl-rich-msg--warn';
      d.textContent = w;
      shell.appendChild(d);
    });
    if (!kv.length) return;
    const grid = document.createElement('div');
    grid.className = 'repl-rich-kv-grid';
    kv.forEach(function (line) {
      const row = document.createElement('div');
      row.className = 'repl-rich-kv-row';
      const parsed = splitFirstColonSpace(line);
      if (parsed) {
        const k = document.createElement('code');
        k.className = 'repl-rich-k';
        k.textContent = parsed.left;
        const v = document.createElement('div');
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
  const text = normalizeBelugaRaw(raw);
  const m = text.match(/The file\s+(.+?)\s+has been successfully loaded;/);
  if (m) {
    appendRichShell(text, function (shell) {
      appendRichTitle(shell, 'Loaded');
      const d = document.createElement('div');
      d.className = 'repl-rich-msg repl-rich-msg--success';
      d.textContent = 'Loaded “' + m[1] + '”.';
      shell.appendChild(d);
    });
  } else appendOutput(text);
}

function appendCountholesFormatted(raw) {
  const t = stripBelugaTrailingSemicolons(normalizeBelugaRaw(raw));
  const n = t.match(/^(\d+)\s*$/);
  if (n)
    appendRichShell(raw, function (shell) {
      const count = Number(n[1]);
      const stat = document.createElement('div');
      stat.className = 'repl-rich-countholes';

      const badge = document.createElement('span');
      badge.className = 'repl-rich-countholes-badge';
      badge.textContent = String(count);

      const text = document.createElement('span');
      text.className = 'repl-rich-countholes-text';
      text.textContent = count === 1 ? 'open hole' : 'open holes';

      stat.append(badge, text);
      shell.appendChild(stat);
    });
  else appendOutput(raw);
}

function appendLookupholeFormatted(raw) {
  const t = stripBelugaTrailingSemicolons(normalizeBelugaRaw(raw));
  if (!t) return appendRichMsg('muted', '(no result)', '');
  appendRichShell(raw, function (shell) {
    appendRichTitle(shell, 'Hole id');
    const c = document.createElement('code');
    c.className = 'repl-rich-badge';
    c.textContent = t;
    shell.appendChild(c);
  });
}

function appendChatterFormatted(raw) {
  const t = stripBelugaTrailingSemicolons(normalizeBelugaRaw(raw));
  const on = /chatter is on/i.test(t);
  const off = /chatter is off/i.test(t);
  appendRichShell(raw, function (shell) {
    const d = document.createElement('div');
    d.className =
      'repl-rich-msg repl-rich-msg--success' + (on ? ' repl-rich-msg--accent' : '');
    d.textContent = on ? 'Verbose chatter is on.' : off ? 'Verbose chatter is off.' : t || 'Ok.';
    shell.appendChild(d);
  });
}

function parseQuerySolutions(raw) {
  const text = stripBelugaTrailingSemicolons(normalizeBelugaRaw(raw)).trim();
  const lines = text.split('\n');
  const solutions = [];
  let cur = null;
  let curBinding = null;
  let isDone = false;

  function flushBinding() {
    if (curBinding && cur) {
      cur.bindings.push({
        key: curBinding.key,
        value: curBinding.lines.join('\n').replace(/[;.]+\s*$/, '').trim(),
      });
    }
    curBinding = null;
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (/^--query\b/.test(trimmed)) continue;
    if (trimmed === '[]' || trimmed === '^.' || trimmed === '^') continue;

    const solM = trimmed.match(/^-+\s*Solution\s+(\d+)\s*-+$/i);
    if (solM) {
      flushBinding();
      cur = { n: parseInt(solM[1], 10), bindings: [] };
      solutions.push(cur);
      continue;
    }
    if (/^Done\.?\s*$/.test(trimmed)) { isDone = true; continue; }

    const bindM = trimmed.match(/^([A-Za-z_][A-Za-z0-9_']*)\s*=\s*([\s\S]*)$/);
    if (bindM && cur) {
      flushBinding();
      const firstVal = bindM[2].replace(/[;.]+\s*$/, '').trimEnd();
      curBinding = { key: bindM[1], lines: [firstVal] };
      continue;
    }
    if (curBinding) {
      curBinding.lines.push(rawLine.replace(/[;.]+\s*$/, '').trimEnd());
    }
  }
  flushBinding();
  return { solutions, isDone };
}

function buildQueryDom(solutions, isDone) {
  appendRichShell('', function (shell) {
    const wrap = document.createElement('div');
    wrap.className = 'repl-query-result';

    solutions.forEach(function (sol, idx) {
      const card = document.createElement('div');
      card.className = 'repl-query-sol' + (idx > 0 ? ' repl-query-sol--nth' : '');

      const head = document.createElement('div');
      head.className = 'repl-query-sol-head';
      head.textContent = solutions.length > 1 ? 'Solution ' + sol.n : 'Solution';
      card.appendChild(head);

      if (sol.bindings.length) {
        const rows = document.createElement('div');
        rows.className = 'repl-query-bindings';
        sol.bindings.forEach(function (b) {
          const row = document.createElement('div');
          row.className = 'repl-query-binding';
          const key = document.createElement('code');
          key.className = 'repl-query-key';
          key.textContent = b.key;
          const eq = document.createElement('span');
          eq.className = 'repl-query-eq';
          eq.textContent = '=';
          const val = document.createElement('pre');
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
      const msg = document.createElement('div');
      msg.className = 'repl-query-summary';
      msg.textContent = solutions.length === 1 ? '1 solution.' : solutions.length + ' solutions.';
      wrap.appendChild(msg);
    }

    shell.appendChild(wrap);
  });
}

function appendQueryFormatted(raw) {
  const text = normalizeBelugaRaw(raw);
  if (/^\s*-\s*Error/i.test(text) || /^\s*-\s*Failed/i.test(text)) {
    appendOutput(raw);
    return;
  }
  const trimmed = stripBelugaTrailingSemicolons(text).trim();
  if (!trimmed) { appendRichMsg('success', 'Query completed.', raw); return; }

  const { solutions, isDone } = parseQuerySolutions(raw);

  if (!solutions.length) {
    const msg = /Skipping query/i.test(trimmed) ? 'Query skipped (tries = 0).'
              : isDone ? 'No solutions found.'
              : trimmed;
    appendRichMsg(isDone ? 'muted' : 'out', msg, raw);
    return;
  }

  buildQueryDom(solutions, isDone);
}

function segmentRunOutput(text) {
  const lines = text.split('\n');
  const segs = [];
  let i = 0;
  let otherLines = [];

  function flushOther() {
    const filtered = otherLines
      .filter(function (l) { return !/^Done\.?\s*$/.test(l.trim()) && !/^\s*;\s*$/.test(l.trim()); })
      .join('\n').trim();
    if (filtered) segs.push({ type: 'other', text: filtered });
    otherLines = [];
  }

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (/^##\s/.test(trimmed)) {
      flushOther();
      const trLines = [];
      while (i < lines.length && /^##\s/.test(lines[i].trim())) { trLines.push(lines[i]); i++; }
      const trText = trLines.join('\n').trim();
      if (/##\s*Holes:/i.test(trText)) {
        const detailLines = [];
        while (i < lines.length && !/^##\s/.test(lines[i].trim())) { detailLines.push(lines[i]); i++; }
        segs.push({ type: 'type-recon', text: (trText + '\n' + detailLines.join('\n')).trim() });
      } else {
        segs.push({ type: 'type-recon', text: trText });
      }
      continue;
    }

    if (/^--query\b/.test(trimmed) || /^-{5,}\s*Solution\s+\d+\s*-{5,}$/i.test(trimmed)) {
      flushOther();
      const qLines = [];
      while (i < lines.length) {
        qLines.push(lines[i]);
        const t = lines[i].trim();
        if (/^Done\.?\s*$/.test(t) || /^Query error/i.test(t) || /^Skipping query/i.test(t)) { i++; break; }
        i++;
      }
      const { solutions, isDone } = parseQuerySolutions(qLines.join('\n'));
      segs.push({ type: 'query', solutions, isDone, queryError: !isDone && !solutions.length });
      continue;
    }

    if (!trimmed || trimmed === '[]' || trimmed === '^.' || trimmed === '^' || trimmed === ';') { i++; continue; }

    otherLines.push(lines[i]);
    i++;
  }

  flushOther();
  const merged = [];
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s];
    if (seg.type === 'type-recon' && merged.length > 0 && merged[merged.length - 1].type === 'type-recon') {
      merged[merged.length - 1].text += '\n' + seg.text;
    } else {
      merged.push(seg);
    }
  }
  return merged;
}

function appendBelugaFormattedOutput(raw, verb) {
  const text = normalizeBelugaRaw(raw);
  const trimmed = text.trim();

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
  const clean = stripBelugaAnsi(raw).replace(/\n+$/, '');
  if (!clean.trim()) return;
  if (!replBeautifyEnabled) {
    appendOutput(clean);
    return;
  }
  const segs = segmentRunOutput(clean);
  segs.forEach(function (seg) {
    if (seg.type === 'query') {
      buildQueryDom(seg.solutions, seg.isDone);
      return;
    }
    const text = seg.text;
    if (!text.trim()) return;
    appendRichShell(text, function (shell) {
      const pre = document.createElement('pre');
      pre.className = 'repl-rich-pre repl-rich-pre--run';
      const lines = text.split('\n');
      const isRunError = /\b(error|failed|exception)\b/i.test(text);
      const isTypeReconStatus =
        lines.length > 0 &&
        lines.every(function (line) {
          return /^##\s*Type Reconstruction (begin|done):/i.test(line.trim());
        });
      const hasHolesSection = /##\s*Holes:/i.test(text);
      if (isRunError) pre.classList.add('repl-rich-pre--run-error');
      else if (isTypeReconStatus) pre.classList.add('repl-rich-pre--run-success');
      else if (hasHolesSection) pre.classList.add('repl-rich-pre--run-holes');
      pre.textContent = text;
      shell.appendChild(pre);
    });
  });
}

function createReplBlock() {
  const block = document.createElement('div');
  block.className = 'repl-block';
  return block;
}

function scrollReplBottom() {
  output.scrollTop = output.scrollHeight;
}

function appendReplHelp() {
  if (!replBeautifyEnabled) {
    const lines = ['Commands'].concat(
      REPL_HELP_ROWS.map(function (rowSpec) {
        return '  ' + rowSpec.cmd + ' — ' + rowSpec.desc;
      })
    );
    appendOutput(lines.join('\n'));
    return;
  }
  const block = createReplBlock();
  const wrap = document.createElement('div');
  wrap.className = 'repl-help';

  const head = document.createElement('div');
  head.className = 'repl-help-head';
  head.textContent = 'Commands';

  const grid = document.createElement('div');
  grid.className = 'repl-help-grid';

  REPL_HELP_ROWS.forEach(function (rowSpec) {
    const row = document.createElement('div');
    row.className = 'repl-help-row';
    const cmdEl = document.createElement('code');
    cmdEl.className = 'repl-help-cmd';
    cmdEl.textContent = rowSpec.cmd;
    const descEl = document.createElement('div');
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
  const wrap = document.createElement('div');
  wrap.className = 'repl-welcome';

  const lead = document.createElement('p');
  lead.className = 'repl-welcome-lead';

  lead.appendChild(document.createTextNode('Welcome to BelJar. Try '));

  const kHelp = document.createElement('kbd');
  kHelp.className = 'repl-welcome-kbd';
  kHelp.textContent = 'help';
  lead.appendChild(kHelp);
  lead.appendChild(document.createTextNode(' for a list of REPL commands.'));

  wrap.appendChild(lead);
  output.appendChild(wrap);
}

function appendOutput(text, forcedKind) {
  if (text == null || text === '' || !String(text).trim()) return;

  const useForce = forcedKind && forcedKind !== 'auto';
  if (!useForce && tryAppendBelugaWrappedCommandError(text)) return;

  const block = createReplBlock();
  const lines = splitOutputLines(text);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let kind;
    if (useForce) kind = forcedKind;
    else if (replBeautifyEnabled) kind = inferLineKind(line);
    else kind = line === '' ? 'blank' : 'out';
    block.appendChild(makeReplLine(line, kind));
  }
  output.appendChild(block);
  scrollReplBottom();
}

function clearOutput() {
  output.replaceChildren();
  replHistoryIndex = null;
  insertWelcomeBanner();
}

let replHistory = [];
let replHistoryIndex = null;

insertWelcomeBanner();

const TEMPLATES = {
  nd: `% Natural Deduction
LF o : type =
  | ⊃ : o → o → o
  | ⊤ : o
  | ∧ : o → o → o
  | ∨ : o → o → o
  | ¬ : o → o
;

--prefix ¬ 10.
--infix ∧ 5 right.
--infix ∨ 4 right.
--infix ⊃ 3 right.

LF nd : o → type =
  | ⊃I : (nd A → nd B) → nd (A ⊃ B)
  | ⊃E : nd (A ⊃ B) → nd A → nd B
  | ∧I : nd A → nd B → nd (A ∧ B)
  | ∧El : nd (A ∧ B) → nd A
  | ∧Er : nd (A ∧ B) → nd B
  | ∨Il : nd A → nd (A ∨ B)
  | ∨Ir : nd B → nd (A ∨ B)
  | ∨E : nd (A ∨ B) → (nd A → nd C) → (nd B → nd C) → nd C
  | ⊤I : nd ⊤
;`};

async function loadCode() {
  if (!editor || belugaBusy) return;
  const code = editor.getValue();
  if (!code.trim()) return;
  if (typeof BelugaClient === 'undefined') {
    appendOutput('Error: Beluga is not available.', 'error');
    return;
  }
  const lineCount = code.split('\n').length;
  const t0 = performance.now();
  setBelugaBusy(true);
  if (typeof RunProgress !== 'undefined' && belugaMode !== 'fast') RunProgress.start({ op: 'load', lineCount });
  try {
    const raw = await BelugaClient.load(code, { onProgress: belugaProgressHook });
    appendBelugaResponse(raw, null);
    setBelugaBusy(false);
    if (typeof RunProgress !== 'undefined') {
      void RunProgress.complete({ lines: lineCount, ms: performance.now() - t0 });
    }
  } catch (e) {
    setBelugaBusy(false);
    if (typeof RunProgress !== 'undefined') RunProgress.fail();
    appendOutput('Error: ' + e.message, 'error');
  }
}

function formatShownCmd(raw) {
  return raw.startsWith('%:') ? raw : '%:' + raw;
}

async function runCmd() {
  if (belugaBusy) return;
  let cmd = cmdInput.value.trim();
  if (!cmd) return;
  const rawForHistory = cmd;
  if (!cmd.startsWith('%:')) cmd = '%:' + cmd;
  replHistoryIndex = null;
  const bareCmd = rawForHistory.replace(/^%:\s*/, '').trim().toLowerCase();
  const isHelp = bareCmd === 'help';
  const { verb } = parseBelugaCmd(cmd);
  appendOutput('# ' + formatShownCmd(rawForHistory), replBeautifyEnabled ? 'cmd' : 'out');
  cmdInput.value = '';
  replHistory.push(rawForHistory);

  if (isHelp) {
    appendReplHelp();
    return;
  }
  if (verb === 'quit') {
    appendRichMsg(
      'muted',
      'Quit is not available in the browser shell (nothing to exit).',
      ''
    );
    return;
  }
  if (typeof BelugaClient === 'undefined') {
    appendOutput('Error: Beluga is not available.', 'error');
    return;
  }
  setBelugaBusy(true);
  if (typeof RunProgress !== 'undefined' && belugaMode !== 'fast') RunProgress.start({ op: 'run', lineCount: 1 });
  try {
    const raw = await BelugaClient.run(cmd, { onProgress: belugaProgressHook });
    appendBelugaResponse(raw, verb);
    setBelugaBusy(false);
    if (typeof RunProgress !== 'undefined') void RunProgress.complete();
  } catch (e) {
    setBelugaBusy(false);
    if (typeof RunProgress !== 'undefined') RunProgress.fail();
    appendOutput('Error: ' + e.message, 'error');
  }
}

function insertNd(where) {
  const code = TEMPLATES.nd;
  if (!code || !editor) return;
  if (where === 'top') editor.insertTop(code);
  else editor.insertBottom(code);
}

function insertNdAtSelection() {
  const code = TEMPLATES.nd;
  if (!code || !editor || typeof editor.insertAtSelection !== 'function') return;
  editor.insertAtSelection(code);
}

async function copyNd() {
  try {
    await navigator.clipboard.writeText(TEMPLATES.nd);
  } catch {
    appendOutput('Error: could not copy to clipboard', 'error');
  }
  if (editor) editor.focus();
}

function toggleTheme() {
  document.documentElement.classList.toggle('light');
  var isLight = document.documentElement.classList.contains('light');
  if (typeof BelJarPersist !== 'undefined') {
    BelJarPersist.writeStoredTheme(isLight ? 'light' : 'dark');
  }
}

window.BelJarRepl = {
  appendBuffered: function (text, kind) {
    appendOutput(text, kind || 'auto');
  },
  getReplBeautify: function () {
    return replBeautifyEnabled;
  },
  setReplBeautify: setReplBeautify,
  toggleReplBeautify: function () {
    setReplBeautify(!replBeautifyEnabled);
  },
};

const prefabsBtn = document.getElementById('btn-prefabs');
if (prefabsBtn) {
  let prefabsSuppressNextClick = false;

  function runPrefabsMenuInteraction() {
    if (typeof Menu !== 'undefined' && Menu.isOpen() && Menu.rootAnchor() === prefabsBtn) {
      Menu.closeAll();
      return;
    }
    if (typeof Menu === 'undefined') return;
    Menu.open({
      anchor: prefabsBtn,
      side: 'right',
      align: 'start',
      items: [
        {
          label: 'Natural Deduction',
          submenu: [
            { label: 'Insert at top', onSelect: () => insertNd('top') },
            { label: 'Insert at bottom', onSelect: () => insertNd('bottom') },
            { label: 'Insert at cursor', onSelect: () => insertNdAtSelection() },
            { label: 'Copy to clipboard', onSelect: () => void copyNd() },
          ],
        },
      ],
      onClose: () => {
        if (typeof Tooltips !== 'undefined') Tooltips.releaseAnchor(prefabsBtn);
      },
    });
  }

  prefabsBtn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    prefabsSuppressNextClick = true;
    if (typeof Tooltips !== 'undefined') {
      Tooltips.suppressAnchor(prefabsBtn);
      Tooltips.hide();
    }
    runPrefabsMenuInteraction();
  });

  prefabsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (prefabsSuppressNextClick) {
      prefabsSuppressNextClick = false;
      return;
    }
    if (typeof Tooltips !== 'undefined') {
      Tooltips.suppressAnchor(prefabsBtn);
      Tooltips.hide();
    }
    runPrefabsMenuInteraction();
  });
}

const settingsBtn = document.getElementById('btn-settings');
/** @type {HTMLDialogElement|null} */
let settingsDialogEl = null;
/** @type {HTMLInputElement|null} */
let settingsReplBeautifyInput = null;
let settingsModeDropdown = null;

function syncSettingsDialogFromState() {
  if (settingsReplBeautifyInput) settingsReplBeautifyInput.checked = replBeautifyEnabled;
  if (settingsModeDropdown) settingsModeDropdown.setValue(belugaMode);
}

function createDropdown(options, currentValue, onChange) {
  var selected = currentValue;
  var focusedIdx = -1;
  var optionEls = [];

  var container = document.createElement('div');
  container.className = 'bj-dropdown';

  var trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'bj-dropdown__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  var valueSpan = document.createElement('span');
  valueSpan.className = 'bj-dropdown__value';

  var chevronEl = document.createElement('span');
  chevronEl.className = 'bj-dropdown__chevron';
  chevronEl.setAttribute('aria-hidden', 'true');
  chevronEl.innerHTML = '<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  trigger.appendChild(valueSpan);
  trigger.appendChild(chevronEl);

  var panel = document.createElement('div');
  panel.className = 'bj-dropdown__panel';
  panel.setAttribute('role', 'listbox');

  options.forEach(function (opt, idx) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bj-dropdown__option';
    btn.setAttribute('role', 'option');
    btn.dataset.value = opt.value;

    var labelSpan = document.createElement('span');
    labelSpan.textContent = opt.label;

    var checkEl = document.createElement('span');
    checkEl.className = 'bj-dropdown__option-check';
    checkEl.setAttribute('aria-hidden', 'true');
    checkEl.innerHTML = '<svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4.5 8L10 1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    btn.appendChild(labelSpan);
    btn.appendChild(checkEl);

    btn.addEventListener('mouseenter', function () {
      focusedIdx = idx;
      updateFocus();
    });
    btn.addEventListener('click', function () {
      if (opt.value !== selected) { setValue(opt.value); onChange(opt.value); }
      close();
    });

    panel.appendChild(btn);
    optionEls.push(btn);
  });

  container.appendChild(trigger);

  function updateFocus() {
    optionEls.forEach(function (el, i) { el.classList.toggle('is-focused', i === focusedIdx); });
  }

  function setValue(val) {
    selected = val;
    var opt = options.filter(function (o) { return o.value === val; })[0];
    valueSpan.textContent = opt ? opt.label : val;
    optionEls.forEach(function (el) { el.classList.toggle('is-selected', el.dataset.value === val); });
  }

  function reposition() {
    if (!panel.classList.contains('is-open')) return;
    var rect = trigger.getBoundingClientRect();
    var pos = FloatingRectPlacement.computePosition({
      anchor: rect,
      width: panel.offsetWidth,
      height: panel.offsetHeight,
      mode: 'menu',
      side: 'bottom',
      align: 'end',
      gap: 4,
      margin: 8,
    });
    panel.style.top = pos.y + 'px';
    panel.style.left = pos.x + 'px';
  }

  function open() {
    // Mount inside the nearest <dialog> so we're in the top layer above its backdrop
    var el = container.parentElement;
    while (el && el.tagName !== 'DIALOG') el = el.parentElement;
    var mountEl = el || document.body;
    if (panel.parentElement !== mountEl) mountEl.appendChild(panel);

    // Measure true dimensions while invisible
    panel.style.visibility = 'hidden';
    panel.style.display = 'block';
    var pw = panel.offsetWidth;
    var ph = panel.offsetHeight;
    panel.style.display = '';
    panel.style.visibility = '';

    var rect = trigger.getBoundingClientRect();
    var pos = FloatingRectPlacement.computePosition({
      anchor: rect,
      width: pw,
      height: ph,
      mode: 'menu',
      side: 'bottom',
      align: 'end',
      gap: 4,
      margin: 8,
    });
    panel.style.top = pos.y + 'px';
    panel.style.left = pos.x + 'px';

    container.classList.add('is-open');
    panel.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    focusedIdx = options.findIndex(function (o) { return o.value === selected; });
    updateFocus();
  }

  function close() {
    container.classList.remove('is-open');
    panel.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
  }

  trigger.addEventListener('click', function () {
    if (container.classList.contains('is-open')) close(); else open();
  });

  trigger.addEventListener('keydown', function (e) {
    var isOpen = container.classList.contains('is-open');
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusedIdx = Math.min(focusedIdx + 1, options.length - 1); updateFocus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusedIdx = Math.max(focusedIdx - 1, 0); updateFocus(); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (focusedIdx >= 0) { var o = options[focusedIdx]; if (o.value !== selected) { setValue(o.value); onChange(o.value); } close(); }
    }
  });

  document.addEventListener('click', function (e) {
    if (container.classList.contains('is-open') && !container.contains(e.target) && !panel.contains(e.target)) close();
  });

  setValue(currentValue);
  return { element: container, setValue: setValue };
}

function ensureSettingsDialog() {
  if (settingsDialogEl) return settingsDialogEl;

  const stack = document.createElement('div');
  stack.className = 'bj-dialog__stack';

  const section = document.createElement('div');
  section.className = 'bj-dialog__section';

  const row = document.createElement('label');
  row.className = 'bj-dialog__setting';

  const main = document.createElement('div');
  main.className = 'bj-dialog__setting-main';
  const labelEl = document.createElement('span');
  labelEl.className = 'bj-dialog__setting-label';
  labelEl.textContent = 'Beautified REPL';
  const desc = document.createElement('span');
  desc.className = 'bj-dialog__setting-desc';
  desc.textContent =
    'Turn off for plain terminal-style output.';
  main.appendChild(labelEl);
  main.appendChild(desc);

  settingsReplBeautifyInput = document.createElement('input');
  settingsReplBeautifyInput.type = 'checkbox';
  settingsReplBeautifyInput.className = 'bj-switch-input';
  settingsReplBeautifyInput.checked = replBeautifyEnabled;
  settingsReplBeautifyInput.addEventListener('change', () =>
    setReplBeautify(settingsReplBeautifyInput.checked)
  );

  const sw = document.createElement('span');
  sw.className = 'bj-switch';
  const thumb = document.createElement('span');
  thumb.className = 'bj-switch__thumb';
  sw.appendChild(thumb);

  row.appendChild(main);
  row.appendChild(settingsReplBeautifyInput);
  row.appendChild(sw);
  section.appendChild(row);
  stack.appendChild(section);

  const engineSection = document.createElement('div');
  engineSection.className = 'bj-dialog__section';

  function addDropdownRow(parent, labelText, descText, options, currentVal, onChange) {
    const r = document.createElement('div');
    r.className = 'bj-dialog__setting';
    const m = document.createElement('div');
    m.className = 'bj-dialog__setting-main';
    const lbl = document.createElement('span');
    lbl.className = 'bj-dialog__setting-label';
    lbl.textContent = labelText;
    const dsc = document.createElement('span');
    dsc.className = 'bj-dialog__setting-desc';
    dsc.textContent = descText;
    m.appendChild(lbl);
    m.appendChild(dsc);
    const dd = createDropdown(options, currentVal, onChange);
    r.appendChild(m);
    r.appendChild(dd.element);
    parent.appendChild(r);
    return dd;
  }

  settingsModeDropdown = addDropdownRow(
    engineSection,
    'Engine',
    'Stable runs in a worker and never crashes. Fast runs on the main thread and may be quicker for small files.',
    [{ value: 'stable', label: 'Stable' }, { value: 'fast', label: 'Fast' }],
    belugaMode,
    setBelugaMode
  );

  stack.appendChild(engineSection);

  settingsDialogEl = BelJarDialog.createDialog({
    title: 'Settings',
    content: stack,
    cardClass: 'bj-dialog__card--settings',
    removeOnClose: false,
  });
  return settingsDialogEl;
}

if (settingsBtn && typeof BelJarDialog !== 'undefined') {
  settingsBtn.addEventListener('click', () => {
    ensureSettingsDialog();
    syncSettingsDialogFromState();
    BelJarDialog.openDialog(settingsDialogEl);
  });
}

document.getElementById('btn-theme').addEventListener('click', toggleTheme);
document.getElementById('btn-format').addEventListener('click', () => {
  if (editor && typeof editor.format === 'function') editor.format();
});
document.getElementById('btn-load').addEventListener('click', loadCode);
document.getElementById('btn-clear').addEventListener('click', clearOutput);
document.getElementById('btn-run').addEventListener('click', runCmd);

cmdInput.addEventListener('input', () => {
  replHistoryIndex = null;
});

cmdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    runCmd();
    return;
  }
  if (e.key === 'ArrowUp') {
    if (!replHistory.length) return;
    e.preventDefault();
    if (replHistoryIndex === null) replHistoryIndex = replHistory.length - 1;
    else replHistoryIndex = Math.max(0, replHistoryIndex - 1);
    cmdInput.value = replHistory[replHistoryIndex];
    return;
  }
  if (e.key === 'ArrowDown') {
    if (replHistoryIndex === null) return;
    e.preventDefault();
    replHistoryIndex++;
    if (replHistoryIndex >= replHistory.length) {
      replHistoryIndex = null;
      cmdInput.value = '';
    } else {
      cmdInput.value = replHistory[replHistoryIndex];
    }
  }
});

window.addEventListener('beforeunload', () => {
  if (persist) persist.flushEditor();
});
window.addEventListener('pagehide', () => {
  if (persist) persist.flushEditor();
});

if (typeof RunProgress !== 'undefined') {
  RunProgress.bind({
    header: document.getElementById('output-panel-header'),
    fill: document.getElementById('output-header-progress'),
    status: document.getElementById('output-header-status'),
    output: output,
  });
}

if (typeof BelugaClient !== 'undefined') {
  BelugaClient.setProgressHandler(belugaProgressHook);
  BelugaClient.configure(modeToConfig(belugaMode));
  if (typeof RunProgress !== 'undefined') RunProgress.start({ op: 'init' });
  BelugaClient.warm()
    .then(function () {
      if (typeof RunProgress !== 'undefined') return RunProgress.complete();
    })
    .catch(function (e) {
      if (typeof RunProgress !== 'undefined') RunProgress.fail();
      appendOutput('[FATAL] Beluga worker failed to load: ' + e.message, 'fatal');
    });
} else {
  appendOutput('[FATAL] Beluga client failed to load.', 'fatal');
}

if (!editor) {
  appendOutput('[FATAL] CodeMirror editor bundle failed to load.', 'fatal');
}
