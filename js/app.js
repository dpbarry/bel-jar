const output = document.getElementById('output');
const editorMount = document.getElementById('editor');
const cmdInput = document.getElementById('command-input');

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
      if (/^\s*-\s*Error/i.test(text)) appendOutput(raw);
      else if (/^\s*;\s*$/.test(trimmed)) appendRichMsg('success', 'Query completed.', raw);
      else appendRichPre(raw, 'Query');
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
  appendRichShell(clean, function (shell) {
    const blocks = clean.split(/\n{2,}/);
    blocks.forEach(function (blockText) {
      const trimmed = blockText.trim();
      if (!trimmed) return;
      const pre = document.createElement('pre');
      pre.className = 'repl-rich-pre repl-rich-pre--run';
      const lines = trimmed.split('\n');
      const isRunError = /\b(error|failed|exception)\b/i.test(trimmed);
      const isTypeReconStatus =
        lines.length > 0 &&
        lines.every(function (line) {
          return /^##\s*Type Reconstruction (begin|done):/i.test(line.trim());
        });
      const hasHolesSection = /##\s*Holes:/i.test(trimmed);
      if (isRunError) {
        pre.classList.add('repl-rich-pre--run-error');
      } else if (isTypeReconStatus) {
        pre.classList.add('repl-rich-pre--run-success');
      } else if (hasHolesSection) {
        pre.classList.add('repl-rich-pre--run-holes');
      }
      pre.textContent = trimmed;
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
;

rec p0 : [ ⊢ nd (A ∧ B ⊃ A)] =
[ ⊢ ⊃I (\\u. ∧El u)] ;

rec p1 : [ ⊢ nd ((A ∧ B) ⊃ (B ∧ A))] =
[ ⊢ ⊃I \\u. ∧I (∧Er u) (∧El u)];`,
};

function loadCode() {
  if (!editor) return;
  const code = editor.getValue();
  if (!code.trim()) return;
  try {
    appendBelugaResponse(Beluga.loadFromString(code), null);
  } catch (e) {
    appendOutput('Error: ' + e.message, 'error');
  }
}

function formatShownCmd(raw) {
  return raw.startsWith('%:') ? raw : '%:' + raw;
}

function runCmd() {
  let cmd = cmdInput.value.trim();
  if (!cmd) return;
  const rawForHistory = cmd;
  if (!cmd.startsWith('%:')) cmd = '%:' + cmd;
  replHistoryIndex = null;
  const bareCmd = rawForHistory.replace(/^%:\s*/, '').trim().toLowerCase();
  const isHelp = bareCmd === 'help';
  const { verb } = parseBelugaCmd(cmd);
  try {
    appendOutput('# ' + formatShownCmd(rawForHistory), replBeautifyEnabled ? 'cmd' : 'out');
    if (isHelp) appendReplHelp();
    else if (verb === 'quit') {
      appendRichMsg(
        'muted',
        'Quit is not available in the browser shell (nothing to exit).',
        ''
      );
    } else appendBelugaResponse(Beluga.runCommand(cmd), verb);
  } catch (e) {
    appendOutput('Error: ' + e.message, 'error');
  }
  cmdInput.value = '';
  replHistory.push(rawForHistory);
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

function syncSettingsDialogFromState() {
  if (settingsReplBeautifyInput) settingsReplBeautifyInput.checked = replBeautifyEnabled;
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

if (typeof Beluga === 'undefined') {
  appendOutput('[FATAL] Beluga module failed to load.', 'fatal');
}
if (!editor) {
  appendOutput('[FATAL] CodeMirror editor bundle failed to load.', 'fatal');
}
