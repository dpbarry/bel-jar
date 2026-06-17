'use strict';

(function (global) {
  var replHistory = [];
  var replHistoryIndex = null;
  var cmdInputEl = document.getElementById('command-input');

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
    if (!replHistory.length) return false;
    if (replHistoryIndex === null) replHistoryIndex = replHistory.length - 1;
    else replHistoryIndex = Math.max(0, replHistoryIndex - 1);
    if (cmdInputEl) cmdInputEl.value = replHistory[replHistoryIndex];
    return true;
  }

  function historyDown() {
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

  async function runCmd() {
    if (typeof BelJarBelugaRun !== 'undefined' && BelJarBelugaRun.isBelugaBusy()) return;
    if (!cmdInputEl) return;
    var cmd = cmdInputEl.value.trim();
    if (!cmd) return;

    var rawForHistory = cmd;
    if (!cmd.startsWith('%:')) cmd = '%:' + cmd;
    replHistoryIndex = null;

    var bareCmd = rawForHistory.replace(/^%:\s*/, '').trim().toLowerCase();
    var isHelp = bareCmd === 'help';
    var parsed = parseBelugaCmd(cmd);
    var verb = parsed.verb;

    if (typeof BelJarReplOutput !== 'undefined') {
      BelJarReplOutput.appendOutput('# ' + formatShownCmd(rawForHistory), 'cmd');
    }
    cmdInputEl.value = '';
    replHistory.push(rawForHistory);

    if (isHelp) {
      if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.appendReplHelp();
      return;
    }
    if (verb === 'quit') {
      if (typeof BelJarReplOutput !== 'undefined') {
        BelJarReplOutput.appendRichMsg('muted', 'Quit is not available in the browser shell (nothing to exit).', '');
      }
      return;
    }
    if (typeof BelugaClient === 'undefined') {
      if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.appendOutput('Error: Beluga is not available.', 'error');
      return;
    }

    if (typeof BelJarBelugaRun !== 'undefined') BelJarBelugaRun.setBelugaBusy(true);
    try {
      var editor = typeof BelJarCurrentEditor !== 'undefined' ? BelJarCurrentEditor : null;
      if (editor) {
        var code = editor.getValue();
        if (typeof BelJarBelugaRun !== 'undefined') await BelJarBelugaRun.ensureEditorLoadedForRun(code);
      }
      var belugaMode = typeof BelJarBelugaRun !== 'undefined' ? BelJarBelugaRun.getBelugaMode() : 'stable';
      var progressHook = typeof BelJarBelugaRun !== 'undefined' ? BelJarBelugaRun.belugaProgressHook : null;
      if (typeof RunProgress !== 'undefined' && belugaMode !== 'fast') {
        RunProgress.start({ op: 'run', lineCount: 1 });
      }
      var raw = await BelugaClient.run(cmd, { onProgress: progressHook });
      if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.appendBelugaResponse(raw, verb);
      if (typeof BelJarBelugaRun !== 'undefined') BelJarBelugaRun.setBelugaBusy(false);
      if (typeof RunProgress !== 'undefined') void RunProgress.complete();
    } catch (e) {
      if (typeof BelJarBelugaRun !== 'undefined') BelJarBelugaRun.setBelugaBusy(false);
      if (typeof RunProgress !== 'undefined') RunProgress.fail();
      if (typeof BelJarReplOutput !== 'undefined') {
        if (isCancelled(e)) {
          BelJarReplOutput.appendOutput('Run cancelled because the editor changed during loading.', 'muted');
        } else {
          BelJarReplOutput.appendOutput('Error: ' + e.message, 'error');
        }
      }
    }
  }

  global.BelJarReplCommands = {
    runCmd: runCmd,
    resetHistoryIndex: resetHistoryIndex,
    historyUp: historyUp,
    historyDown: historyDown,
  };
})(typeof window !== 'undefined' ? window : globalThis);
