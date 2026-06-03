'use strict';

// Beluga engine: busy state, mode selection, load/run orchestration.
(function (global) {
  var belugaBusy = false;
  var belugaMode =
    typeof BelJarPersist !== 'undefined' ? BelJarPersist.readStoredBelugaMode() : 'stable';

  var btnLoad = document.getElementById('btn-load');
  var btnRun = document.getElementById('btn-run');
  var cmdInputEl = document.getElementById('command-input');

  function setBelugaBusy(busy) {
    belugaBusy = !!busy;
    if (btnLoad) btnLoad.disabled = belugaBusy;
    if (btnRun) btnRun.disabled = belugaBusy;
    if (cmdInputEl) cmdInputEl.disabled = belugaBusy;
  }

  function isBelugaBusy() { return belugaBusy; }

  function modeToConfig(mode) {
    return mode === 'fast'
      ? { thread: 'main', build: 'fast' }
      : { thread: 'worker', build: 'stable' };
  }

  function getBelugaMode() { return belugaMode; }

  function setBelugaMode(m) {
    belugaMode = m;
    if (typeof BelJarPersist !== 'undefined') BelJarPersist.writeStoredBelugaMode(m);
    if (typeof BelugaClient !== 'undefined') {
      BelugaClient.configure(modeToConfig(m));
      BelugaClient.warm().catch(function () {});
    }
    if (typeof BelJarSettingsUI !== 'undefined') BelJarSettingsUI.syncFromState();
  }

  function belugaProgressHook(msg) {
    if (msg && msg.phase === 'build-fallback') {
      if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.appendBuildFallbackNotice();
      if (typeof RunProgress !== 'undefined' && belugaBusy) RunProgress.start({ op: 'load' });
      return;
    }
    if (typeof RunProgress !== 'undefined' && RunProgress.isRunning()) {
      RunProgress.onBelugaProgress(msg);
    }
  }

  function editorMatchesCommitted(code) {
    if (typeof BelugaClient === 'undefined') return false;
    var committed =
      typeof BelugaClient.getCommittedFingerprint === 'function'
        ? BelugaClient.getCommittedFingerprint()
        : null;
    var editorFp =
      typeof BelugaClient.fingerprint === 'function'
        ? BelugaClient.fingerprint(code)
        : null;
    return !!committed && !!editorFp && committed === editorFp;
  }

  function isCancelled(err) {
    return !!(
      typeof BelugaClient !== 'undefined' &&
      typeof BelugaClient.isCancelledError === 'function' &&
      BelugaClient.isCancelledError(err)
    );
  }

  async function ensureEditorLoadedForRun(code) {
    if (!code.trim()) return;
    if (editorMatchesCommitted(code)) return;
    var lineCount = code.split('\n').length;
    var t0 = performance.now();
    if (typeof RunProgress !== 'undefined' && belugaMode !== 'fast') {
      RunProgress.start({ op: 'load', lineCount: lineCount });
    }
    try {
      await BelugaClient.load(code, { onProgress: belugaProgressHook });
      if (typeof RunProgress !== 'undefined' && belugaMode !== 'fast') {
        void RunProgress.complete({ lines: lineCount, ms: performance.now() - t0 });
      }
    } catch (e) {
      if (typeof RunProgress !== 'undefined') RunProgress.fail();
      throw e;
    }
  }

  async function loadCode() {
    var editor = typeof BelJarCurrentEditor !== 'undefined' ? BelJarCurrentEditor : null;
    if (!editor || belugaBusy) return;
    var code = editor.getValue();
    if (!code.trim()) return;
    if (typeof BelugaClient === 'undefined') {
      if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.appendOutput('Error: Beluga is not available.', 'error');
      return;
    }
    var lineCount = code.split('\n').length;
    var t0 = performance.now();
    setBelugaBusy(true);
    if (typeof RunProgress !== 'undefined' && belugaMode !== 'fast') {
      RunProgress.start({ op: 'load', lineCount: lineCount });
    }
    try {
      var raw = await BelugaClient.load(code, { onProgress: belugaProgressHook });
      if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.appendBelugaResponse(raw, null);
      setBelugaBusy(false);
      if (typeof RunProgress !== 'undefined') {
        void RunProgress.complete({ lines: lineCount, ms: performance.now() - t0 });
      }
    } catch (e) {
      setBelugaBusy(false);
      if (typeof RunProgress !== 'undefined') RunProgress.fail();
      if (typeof BelJarReplOutput !== 'undefined') {
        if (isCancelled(e)) BelJarReplOutput.appendOutput('Load cancelled because the editor changed.', 'muted');
        else BelJarReplOutput.appendOutput('Error: ' + e.message, 'error');
      }
    }
  }

  function init() {
    if (typeof BelugaClient === 'undefined') {
      if (typeof BelJarReplOutput !== 'undefined') {
        BelJarReplOutput.appendOutput('[FATAL] Beluga client failed to load.', 'fatal');
      }
      return;
    }
    BelugaClient.setProgressHandler(belugaProgressHook);
    BelugaClient.configure(modeToConfig(belugaMode));
    BelugaClient.warm().catch(function (e) {
      if (typeof BelJarReplOutput !== 'undefined') {
        BelJarReplOutput.appendOutput('[FATAL] Beluga worker failed to load: ' + e.message, 'fatal');
      }
    });
  }

  global.BelJarBelugaRun = {
    init: init,
    setBelugaBusy: setBelugaBusy,
    isBelugaBusy: isBelugaBusy,
    getBelugaMode: getBelugaMode,
    setBelugaMode: setBelugaMode,
    belugaProgressHook: belugaProgressHook,
    loadCode: loadCode,
    ensureEditorLoadedForRun: ensureEditorLoadedForRun,
  };
})(typeof window !== 'undefined' ? window : globalThis);
