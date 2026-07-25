'use strict';

const global = globalThis;

var outputEl = null;
var liveEl = null;
var cmdInputEl = null;
var btnRunEl = null;
var openTurnEl = null;
var openTurnBody = null;
var focusBound = false;
var timestampsOn = false;

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

function stampHost(host, ms) {
  if (!host || !host.appendChild) return null;
  var t = ms != null ? ms : Date.now();
  var el = null;
  for (var i = 0; i < host.children.length; i++) {
    if (host.children[i].classList && host.children[i].classList.contains('repl-ts')) {
      el = host.children[i];
      break;
    }
  }
  if (!el) {
    el = document.createElement('time');
    el.className = 'repl-ts';
    el.setAttribute('aria-hidden', 'true');
    host.appendChild(el);
  }
  el.dateTime = new Date(t).toISOString();
  el.dataset.ms = String(t);
  el.textContent = formatTs(t);
  return el;
}

function applyTimestampsClass() {
  var output = getOutput();
  if (!output) return;
  output.classList.toggle('is-timestamps', !!timestampsOn);
}

function setTimestampsVisible(on) {
  timestampsOn = !!on;
  applyTimestampsClass();
  return timestampsOn;
}

function isTimestampsVisible() {
  return !!timestampsOn;
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

  applyTimestampsClass();
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
  setTimestampsVisible: setTimestampsVisible,
  isTimestampsVisible: isTimestampsVisible,
};
global.BelJarReplStream = global.ReplStream;
