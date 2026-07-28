'use strict';

const global = globalThis;

var outputEl = null;
var liveEl = null;
var cmdInputEl = null;
var btnRunEl = null;
var openTurnEl = null;
var openTurnBody = null;
var focusBound = false;

function getOutput() {
  if (!outputEl) outputEl = document.getElementById('output');
  return outputEl;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function pad3(n) {
  return String(n).padStart(3, '0');
}

function formatTs(ms) {
  var d = new Date(ms);
  return (
    pad2(d.getHours()) + ':' +
    pad2(d.getMinutes()) + ':' +
    pad2(d.getSeconds()) + '.' +
    pad3(d.getMilliseconds())
  );
}

function setStampTooltip(host, tip) {
  host.setAttribute('data-tooltip-placement', 'above');
  host.setAttribute('data-tooltip-no-track', '');
  if (typeof Tooltips !== 'undefined' && Tooltips.set) {
    Tooltips.set(host, tip, { ariaLabel: false });
  } else {
    host.setAttribute('data-tooltip', tip);
  }
}

function clearStamp(el) {
  if (!el || el.nodeType !== 1) return;
  if (el.dataset) delete el.dataset.ms;
  el.removeAttribute('data-ms');
  el.removeAttribute('data-tooltip');
  el.removeAttribute('data-tooltip-placement');
  el.removeAttribute('data-tooltip-no-track');
}

/** Prefer the visible card/prompt content over full-width stream wrappers. */
function resolveStampTarget(host) {
  if (!host || host.nodeType !== 1) return null;

  if (host.classList.contains('repl-turn-cmd')) {
    return host;
  }

  if (host.classList.contains('repl-block')) {
    var rich = null;
    for (var i = 0; i < host.children.length; i++) {
      var child = host.children[i];
      if (child.classList && child.classList.contains('repl-rich')) {
        rich = child;
        break;
      }
    }
    if (rich) {
      var prefer = [
        'repl-rich-error',
        'repl-rich-pre',
        'repl-rich-msg',
        'repl-query-result',
        'repl-rich-countholes',
        'repl-help',
        'repl-line',
      ];
      for (var p = 0; p < prefer.length; p++) {
        for (var c = 0; c < rich.children.length; c++) {
          var kid = rich.children[c];
          if (kid.classList && kid.classList.contains(prefer[p])) return kid;
        }
      }
      for (var j = 0; j < rich.children.length; j++) {
        var ch = rich.children[j];
        if (ch.classList && ch.classList.contains('repl-rich-title')) continue;
        return ch;
      }
      return rich;
    }
    for (var k = 0; k < host.children.length; k++) {
      var line = host.children[k];
      if (line.classList && (line.classList.contains('repl-line') || line.classList.contains('repl-help'))) {
        return line;
      }
    }
  }

  return host;
}

function stampHost(host, ms) {
  if (!host || host.nodeType !== 1) return null;
  var t = ms != null ? ms : Date.now();
  var target = resolveStampTarget(host) || host;

  for (var i = host.children.length - 1; i >= 0; i--) {
    var child = host.children[i];
    if (child.classList && child.classList.contains('repl-ts')) {
      host.removeChild(child);
    }
  }
  if (target !== host) {
    for (var j = target.children.length - 1; j >= 0; j--) {
      var tc = target.children[j];
      if (tc.classList && tc.classList.contains('repl-ts')) {
        target.removeChild(tc);
      }
    }
    if (host.dataset && host.dataset.ms) clearStamp(host);
  }

  target.dataset.ms = String(t);
  setStampTooltip(target, formatTs(t));
  return target;
}

/** Lift legacy visible `<time class="repl-ts">` nodes into host tooltips. */
function migrateLegacyStamps(root) {
  var scope = root || getOutput();
  if (!scope || !scope.querySelectorAll) return;
  var stamps = scope.querySelectorAll('.repl-ts');
  for (var i = 0; i < stamps.length; i++) {
    var el = stamps[i];
    var parent = el.parentElement;
    var ms = NaN;
    if (el.dataset && el.dataset.ms) ms = Number(el.dataset.ms);
    if (!Number.isFinite(ms) && el.dateTime) ms = Date.parse(el.dateTime);
    if (el.parentNode) el.parentNode.removeChild(el);
    if (parent) stampHost(parent, Number.isFinite(ms) ? ms : Date.now());
  }
}

/**
 * After transcript restore (or legacy HTML), retarget oversized hosts and
 * rebind native tooltips — `data-ms`/`data-tooltip` survive in outerHTML, but
 * Tooltips.bind does not auto-wire inserted nodes.
 */
function rebindStamps(root) {
  var scope = root || getOutput();
  if (!scope || !scope.querySelectorAll) return;

  migrateLegacyStamps(scope);

  var blocks = scope.querySelectorAll('.repl-block[data-ms]');
  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];
    var ms = Number(block.dataset.ms);
    var target = resolveStampTarget(block);
    if (target && target !== block && Number.isFinite(ms)) {
      clearStamp(block);
      stampHost(target, ms);
    }
  }

  var stamped = scope.querySelectorAll('[data-ms]');
  for (var j = 0; j < stamped.length; j++) {
    var el = stamped[j];
    var t = Number(el.dataset.ms);
    if (!Number.isFinite(t)) continue;
    setStampTooltip(el, formatTs(t));
  }
}

function buildLiveLine() {
  var live = document.createElement('div');
  live.className = 'repl-live';

  var prompt = document.createElement('span');
  prompt.className = 'repl-chevron';
  prompt.setAttribute('aria-hidden', 'true');
  prompt.textContent = '❯';

  var input = document.createElement('input');
  input.id = 'command-input';
  input.type = 'text';
  input.className = 'repl-live-input';
  input.autocomplete = 'off';
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'off');
  input.spellcheck = false;
  input.placeholder = '';
  input.setAttribute('aria-label', 'Command');

  // Kept for BelugaRun busy disable + existing listeners; not shown.
  var btn = document.createElement('button');
  btn.id = 'btn-run';
  btn.type = 'button';
  btn.className = 'repl-send';
  btn.tabIndex = -1;
  btn.setAttribute('aria-label', 'Run command');
  btn.hidden = true;

  live.append(prompt, input, btn);
  liveEl = live;
  cmdInputEl = input;
  btnRunEl = btn;
  return live;
}

function ensureLiveLine() {
  var output = getOutput();
  if (!output) return null;

  if (!liveEl) buildLiveLine();

  if (liveEl.parentNode !== output) {
    output.appendChild(liveEl);
  } else if (output.lastElementChild !== liveEl) {
    output.appendChild(liveEl);
  }

  bindFocusDelegation();
  return liveEl;
}

function getCommandInput() {
  ensureLiveLine();
  return cmdInputEl;
}

function getRunButton() {
  ensureLiveLine();
  return btnRunEl;
}

function getLiveLine() {
  return ensureLiveLine();
}

function focusLive() {
  var input = getCommandInput();
  if (input && !input.disabled) input.focus();
}

function isSelectingText() {
  var sel = global.getSelection && global.getSelection();
  return !!(sel && !sel.isCollapsed && String(sel).length);
}

function bindFocusDelegation() {
  var output = getOutput();
  if (!output || focusBound) return;
  focusBound = true;

  output.addEventListener('click', function (e) {
    if (!liveEl || !cmdInputEl) return;
    if (liveEl.contains(e.target)) return;
    if (isSelectingText()) return;
    focusLive();
  });
}

function clearExceptLive() {
  var output = getOutput();
  if (!output) return;
  ensureLiveLine();
  var kids = Array.from(output.childNodes);
  for (var i = 0; i < kids.length; i++) {
    if (kids[i] !== liveEl) output.removeChild(kids[i]);
  }
  openTurnEl = null;
  openTurnBody = null;
  ensureLiveLine();
}

function appendBeforeLive(node) {
  if (!node) return null;
  var output = getOutput();
  if (!output) return null;
  ensureLiveLine();

  if (openTurnBody) {
    openTurnBody.appendChild(node);
  } else {
    output.insertBefore(node, liveEl);
  }
  if (
    node.nodeType === 1 &&
    node.classList &&
    !node.classList.contains('repl-banner') &&
    !node.classList.contains('repl-live')
  ) {
    stampHost(node);
  }
  if (typeof ReplPersist !== 'undefined' && ReplPersist.scheduleSave) {
    ReplPersist.scheduleSave();
  }
  return node;
}

function makeFrozenCmdLine(cmdText) {
  var row = document.createElement('div');
  row.className = 'repl-turn-cmd';
  var chev = document.createElement('span');
  chev.className = 'repl-chevron';
  chev.textContent = '❯';
  var body = document.createElement('span');
  body.className = 'repl-cmd-body';
  body.textContent = String(cmdText != null ? cmdText : '').replace(/^#\s*/, '').replace(/^%:\s*/, '');
  row.append(chev, body);
  return row;
}

function beginTurn(cmdText) {
  endTurn();
  var output = getOutput();
  if (!output) return null;
  ensureLiveLine();

  var turn = document.createElement('div');
  turn.className = 'repl-turn';
  var at = Date.now();

  if (cmdText != null && String(cmdText).trim() !== '') {
    var cmdRow = makeFrozenCmdLine(cmdText);
    turn.appendChild(cmdRow);
    stampHost(cmdRow, at);
  }

  var body = document.createElement('div');
  body.className = 'repl-turn-body';
  turn.appendChild(body);

  output.insertBefore(turn, liveEl);
  openTurnEl = turn;
  openTurnBody = body;
  if (typeof ReplPersist !== 'undefined' && ReplPersist.scheduleSave) {
    ReplPersist.scheduleSave();
  }
  return turn;
}

function endTurn() {
  openTurnEl = null;
  openTurnBody = null;
}

function currentTurnBody() {
  return openTurnBody;
}

ensureLiveLine();

global.ReplStream = {
  ensureLiveLine: ensureLiveLine,
  getLiveLine: getLiveLine,
  getCommandInput: getCommandInput,
  getRunButton: getRunButton,
  focusLive: focusLive,
  appendBeforeLive: appendBeforeLive,
  clearExceptLive: clearExceptLive,
  beginTurn: beginTurn,
  endTurn: endTurn,
  currentTurnBody: currentTurnBody,
  migrateLegacyStamps: migrateLegacyStamps,
  rebindStamps: rebindStamps,
};
global.BelJarReplStream = global.ReplStream;
