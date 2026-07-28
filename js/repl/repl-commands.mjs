'use strict';

const global = globalThis;
var replHistory = [];
  var replHistoryIndex = null;
  var historyLoaded = false;

  function loadHistory() {
    if (historyLoaded) return;
    historyLoaded = true;
    if (typeof Persist === 'undefined' || !Persist.readStoredReplCommandHistory) return;
    try {
      var stored = Persist.readStoredReplCommandHistory();
      if (Array.isArray(stored) && stored.length) replHistory = stored.slice();
    } catch (_) {}
  }

  function persistHistory() {
    if (typeof Persist === 'undefined' || !Persist.writeStoredReplCommandHistory) return;
    Persist.writeStoredReplCommandHistory(replHistory);
  }

  function getHistory() {
    loadHistory();
    return replHistory.slice();
  }

  /** Record a transmitted command for ↑/↓ (typed REPL or shell actions like Run). */
  function recordHistory(raw) {
    if (raw == null) return;
    var s = String(raw).trim();
    if (!s) return;
    loadHistory();
    replHistoryIndex = null;
    replHistory.push(s);
    var cap = typeof Persist !== 'undefined' ? Persist.readStoredReplHistoryCap() : 0;
    if (cap > 0 && replHistory.length > cap) {
      replHistory.splice(0, replHistory.length - cap);
    } else if (!cap && replHistory.length > 500) {
      replHistory.splice(0, replHistory.length - 500);
    }
    persistHistory();
  }

  function getCmdInput() {
    if (typeof ReplStream !== 'undefined' && ReplStream.getCommandInput) {
      return ReplStream.getCommandInput();
    }
    return document.getElementById('command-input');
  }

  function parseBelugaCmd(prefixed) {
    var norm = global.BelugaText
      ? global.BelugaText.normalizeBelugaRaw(prefixed)
      : String(prefixed != null ? prefixed : '').replace(/\r\n/g, '\n');
    var inner = norm.replace(/^%:/, '').trim();
    if (!inner) return { verb: '', args: '' };
    var sp = inner.search(/\s/);
    if (sp === -1) return { verb: inner, args: '' };
    return { verb: inner.slice(0, sp), args: inner.slice(sp + 1).trim() };
  }

  function formatShownCmd(raw) {
    return raw.startsWith('%:') ? raw : '%:' + raw;
  }

  function resetHistoryIndex() {
    replHistoryIndex = null;
  }

  function historyUp() {
    loadHistory();
    var cmdInputEl = getCmdInput();
    if (!replHistory.length) return false;
    if (replHistoryIndex === null) replHistoryIndex = replHistory.length - 1;
    else replHistoryIndex = Math.max(0, replHistoryIndex - 1);
    if (cmdInputEl) cmdInputEl.value = replHistory[replHistoryIndex];
    return true;
  }

  function historyDown() {
    loadHistory();
    var cmdInputEl = getCmdInput();
    if (replHistoryIndex === null) return false;
    replHistoryIndex++;
    if (replHistoryIndex >= replHistory.length) {
      replHistoryIndex = null;
      if (cmdInputEl) cmdInputEl.value = '';
    } else {
      if (cmdInputEl) cmdInputEl.value = replHistory[replHistoryIndex];
    }
    return true;
  }

  function isCancelled(err) {
    return !!(
      typeof BelugaClient !== 'undefined' &&
      typeof BelugaClient.isCancelledError === 'function' &&
      BelugaClient.isCancelledError(err)
    );
  }

  function beginCmdTurn(echoText) {
    if (typeof ReplStream === 'undefined' || !ReplStream.beginTurn) return;
    ReplStream.beginTurn(echoText != null ? echoText : '');
  }

  function endCmdTurn() {
    if (typeof ReplStream !== 'undefined' && ReplStream.endTurn) {
      ReplStream.endTurn();
    }
  }

  async function runCmd() {
    if (typeof BelugaRun !== 'undefined' && BelugaRun.isBelugaBusy()) return;
    var cmdInputEl = getCmdInput();
    if (!cmdInputEl) return;
    var cmd = cmdInputEl.value.trim();
    if (!cmd) return;

    var rawForHistory = cmd;
    if (!cmd.startsWith('%:')) cmd = '%:' + cmd;

    var bareText = rawForHistory.replace(/^%:\s*/, '').trim();
    var bareCmd = bareText.toLowerCase();
    var isHelp = bareCmd === 'help';
    var parsed = parseBelugaCmd(cmd);
    var verb = parsed.verb;

    var echoOn = typeof Persist === 'undefined' || Persist.readStoredReplEcho();

    // BelJar-local `run` — BelugaRun owns turn + history on success.
    if (/^run$/i.test(verb)) {
      cmdInputEl.value = '';
      replHistoryIndex = null;
      var runResult = { ok: false, error: 'Run is not available.' };
      try {
        if (typeof ReplRunCmd !== 'undefined' && ReplRunCmd.executeRunCommand) {
          runResult = await ReplRunCmd.executeRunCommand(bareText);
        }
      } catch (runErr) {
        runResult = {
          ok: false,
          error: runErr && runErr.message ? String(runErr.message) : String(runErr),
        };
      }
      if (runResult && runResult.ok) {
        if (typeof ReplStream !== 'undefined' && ReplStream.focusLive) {
          ReplStream.focusLive();
        }
        return;
      }
      beginCmdTurn(echoOn ? formatShownCmd(rawForHistory) : '');
      recordHistory(rawForHistory);
      try {
        if (typeof ReplOutput !== 'undefined') {
          ReplOutput.appendOutput(runResult && runResult.error
            ? String(runResult.error)
            : 'Run failed.', 'error');
        }
      } finally {
        endCmdTurn();
        if (typeof ReplStream !== 'undefined' && ReplStream.focusLive) {
          ReplStream.focusLive();
        }
      }
      return;
    }

    beginCmdTurn(echoOn ? formatShownCmd(rawForHistory) : '');

    cmdInputEl.value = '';
    recordHistory(rawForHistory);

    try {
      if (isHelp) {
        if (typeof ReplOutput !== 'undefined') ReplOutput.appendReplHelp();
        return;
      }
      // Beluga CLI/Emacs verbs that exist but do not apply in the browser shell.
      if (
        typeof ReplOutput !== 'undefined' &&
        typeof ReplOutput.isUnavailableReplVerb === 'function' &&
        ReplOutput.isUnavailableReplVerb(verb)
      ) {
        var unavailableMsg =
          typeof ReplOutput.unavailableReplVerbMessage === 'function'
            ? ReplOutput.unavailableReplVerbMessage(verb)
            : 'Command "' + String(verb) + '" does not apply in BelJar.';
        ReplOutput.appendOutput(unavailableMsg, 'error');
        return;
      }
      // Reject unknown verbs before any Beluga load — otherwise typos like `bob`
      // pay for a full program load just to hear "Unrecognized command".
      if (
        typeof ReplOutput !== 'undefined' &&
        typeof ReplOutput.isKnownReplVerb === 'function' &&
        !ReplOutput.isKnownReplVerb(verb)
      ) {
        ReplOutput.appendOutput(
          'Unrecognized command with name "' + String(verb) + '".',
          'error',
        );
        return;
      }
      if (typeof BelugaClient === 'undefined') {
        if (typeof ReplOutput !== 'undefined') ReplOutput.appendOutput('Error: Beluga is not available.', 'error');
        return;
      }

      if (typeof BelugaRun !== 'undefined') BelugaRun.setBelugaBusy(true);
      try {
        var editor = typeof CurrentEditor !== 'undefined' ? CurrentEditor : null;
        if (editor) {
          var code = editor.getValue();
          if (typeof BelugaRun !== 'undefined') await BelugaRun.ensureEditorLoadedForRun(code);
        }
        var progressHook = typeof BelugaRun !== 'undefined' ? BelugaRun.belugaProgressHook : null;
        if (typeof RunProgress !== 'undefined' && typeof BelugaRun !== 'undefined'
          && BelugaRun.shouldShowRunProgress()) {
          RunProgress.start({ op: 'run', lineCount: 1 });
        }
        var raw = await BelugaClient.run(cmd, { onProgress: progressHook });
        if (typeof ReplOutput !== 'undefined') ReplOutput.appendBelugaResponse(raw, verb);
        if (typeof BelugaRun !== 'undefined') BelugaRun.setBelugaBusy(false);
        if (typeof RunProgress !== 'undefined') void RunProgress.complete();
      } catch (e) {
        if (typeof BelugaRun !== 'undefined') BelugaRun.setBelugaBusy(false);
        if (typeof RunProgress !== 'undefined') RunProgress.fail();
        if (typeof ReplOutput !== 'undefined') {
          if (isCancelled(e)) {
            ReplOutput.appendOutput('Run cancelled because the editor changed during loading.', 'muted');
          } else {
            ReplOutput.appendOutput('Error: ' + e.message, 'error');
          }
        }
      }
    } finally {
      endCmdTurn();
      if (typeof ReplStream !== 'undefined' && ReplStream.focusLive) {
        ReplStream.focusLive();
      }
    }
  }

  global.ReplCommands = {
    runCmd: runCmd,
    resetHistoryIndex: resetHistoryIndex,
    historyUp: historyUp,
    historyDown: historyDown,
    getHistory: getHistory,
    recordHistory: recordHistory,
  };
  global.BelJarReplCommands = global.ReplCommands;
