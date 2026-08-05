'use strict';

const global = globalThis;

var SAVE_DEBOUNCE_MS = 300;
var HTML_CAP = 400 * 1024;
var saveTimer = null;
var restoring = false;

function getOutput() {
  return document.getElementById('output');
}

function getPersist() {
  return typeof Persist !== 'undefined' ? Persist : null;
}

function getStream() {
  return typeof ReplStream !== 'undefined' ? ReplStream : null;
}

function isPersistableChild(node) {
  return !!(
    node &&
    node.nodeType === 1 &&
    !(node.classList && node.classList.contains('repl-live'))
  );
}

function collectPersistableNodes(output) {
  var nodes = [];
  for (var i = 0; i < output.children.length; i++) {
    if (isPersistableChild(output.children[i])) nodes.push(output.children[i]);
  }
  return nodes;
}

function serializeHtml(nodes) {
  var parts = [];
  for (var i = 0; i < nodes.length; i++) parts.push(nodes[i].outerHTML);
  return parts.join('');
}

function trimOldest(nodes, html) {
  if (html.length <= HTML_CAP) return { nodes: nodes, html: html };
  var list = nodes.slice();
  var out = html;
  while (list.length > 1 && out.length > HTML_CAP) {
    list.shift();
    out = serializeHtml(list);
  }
  if (out.length > HTML_CAP && list.length === 1) {
    // Single oversized node — drop everything rather than store a truncated card.
    return { nodes: [], html: '' };
  }
  return { nodes: list, html: out };
}

function persistCommandHistory() {
  var p = getPersist();
  if (!p || typeof p.writeStoredReplCommandHistory !== 'function') return;
  if (typeof p.readStoredReplHistoryPersist === 'function' && p.readStoredReplHistoryPersist() === 'none') return;
  var cmds = typeof ReplCommands !== 'undefined' && ReplCommands.getHistory
    ? ReplCommands.getHistory()
    : null;
  if (cmds) p.writeStoredReplCommandHistory(cmds);
}

function writeSnapshot() {
  if (restoring) return;
  var p = getPersist();
  if (!p || typeof p.writeStoredReplTranscript !== 'function') return;
  if (typeof p.readStoredReplHistoryPersist === 'function' && p.readStoredReplHistoryPersist() === 'none') {
    return;
  }
  var output = getOutput();
  if (!output) return;

  var nodes = collectPersistableNodes(output);
  var html = serializeHtml(nodes);
  var trimmed = trimOldest(nodes, html);
  html = trimmed.html;

  if (!html) {
    p.writeStoredReplTranscript(null);
  } else {
    p.writeStoredReplTranscript({
      html: html,
      scrollTop: output.scrollTop || 0,
      savedAt: Date.now(),
    });
  }
  persistCommandHistory();
}

function scheduleSave() {
  if (restoring) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    saveTimer = null;
    writeSnapshot();
  }, SAVE_DEBOUNCE_MS);
}

function saveNow() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  writeSnapshot();
}

function restore() {
  var p = getPersist();
  if (!p || typeof p.readStoredReplTranscript !== 'function') return false;
  var snap = p.readStoredReplTranscript();
  if (!snap || !snap.html) return false;

  var stream = getStream();
  var output = getOutput();
  if (!output || !stream) return false;

  var ok = false;
  restoring = true;
  try {
    if (stream.endTurn) stream.endTurn();
    if (stream.clearExceptLive) stream.clearExceptLive();
    else {
      // Fallback: wipe non-live children manually.
      var kids = Array.from(output.childNodes);
      var live = stream.getLiveLine && stream.getLiveLine();
      for (var i = 0; i < kids.length; i++) {
        if (kids[i] !== live) output.removeChild(kids[i]);
      }
    }

    var wrap = document.createElement('div');
    wrap.innerHTML = snap.html;
    var liveEl = stream.getLiveLine ? stream.getLiveLine() : output.lastElementChild;
    var frag = document.createDocumentFragment();
    while (wrap.firstChild) frag.appendChild(wrap.firstChild);
    if (liveEl && liveEl.parentNode === output) output.insertBefore(frag, liveEl);
    else output.appendChild(frag);

    // Mid-run ghost cards cannot finish after a reload — freeze them.
    if (typeof ReplOutput !== 'undefined' && ReplOutput.settleInterruptedPendingRuns) {
      ReplOutput.settleInterruptedPendingRuns(output);
    }

    if (typeof snap.scrollTop === 'number') {
      output.scrollTop = snap.scrollTop;
    }
    if (stream.rebindStamps) stream.rebindStamps(output);
    else if (stream.migrateLegacyStamps) stream.migrateLegacyStamps(output);
    if (stream.endTurn) stream.endTurn();
    ok = collectPersistableNodes(output).length > 0;
    return ok;
  } catch (_) {
    try {
      if (stream && stream.clearExceptLive) stream.clearExceptLive();
    } catch (__) {}
    ok = false;
    return false;
  } finally {
    restoring = false;
    // Rewrite snapshot with rebound/retargeted stamp attrs while still deferred.
    if (ok) scheduleSave();
  }
}

global.ReplPersist = {
  scheduleSave: scheduleSave,
  saveNow: saveNow,
  restore: restore,
};
global.BelJarReplPersist = global.ReplPersist;
