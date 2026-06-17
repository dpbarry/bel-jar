'use strict';

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
      if (typeof BelJarToasts !== 'undefined') {
        BelJarToasts.warn(
          'Fast build hit the stack limit — retrying with Stable. Switch to Stable in Settings to avoid this.',
          { duration: 0, closable: true },
        );
      }
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

  // ── Whole-project source ────────────────────────────────────────────────────
  // "Whole project" = the active folder's .cfg chain (like `beluga foo.cfg`),
  // NOT every file in the workspace. Legacy files omitted from the cfg are skipped.

  var projectSpans = null; // span map of the last project load, null = single-file

  function getProjectSpans() { return projectSpans; }

  function fileTextForRun(fileId, activeId, editor) {
    if (fileId === activeId && editor) return editor.getValue();
    return BelJarPersist.getFileText(fileId) || '';
  }

  function resolveDefaultCfgPath(files, getText) {
    var path = BelJarPersist.getDefaultCfgPath();
    if (path && files.some(function (f) { return f.name === path; })) return path;
    return BelJarProjectSource.inferDefaultCfgPath(files, getText);
  }

  function buildProjectSource() {
    if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return null;
    var files = BelJarPersist.listFiles();
    if (!files || !files.length) return null;
    var activeId = BelJarPersist.getActiveFileId();
    var editor = typeof BelJarCurrentEditor !== 'undefined' ? BelJarCurrentEditor : null;
    var getText = function (id) { return fileTextForRun(id, activeId, editor); };
    var cfgPath = resolveDefaultCfgPath(files, getText);
    var dev = cfgPath
      ? BelJarProjectSource.developmentFilesForCfg(files, cfgPath, getText)
      : [];
    if (!dev || dev.length <= 1) return null;
    var entries = dev.map(function (f) {
      return { id: f.id, name: f.name, text: getText(f.id) };
    });
    return BelJarProjectSource.assembleProjectCode(entries);
  }

  // Active file with same-folder predecessors prepended (Beluga project semantics).
  function buildActiveFileSource() {
    if (typeof BelJarPersist === 'undefined' || typeof BelJarProjectSource === 'undefined') return null;
    var editor = typeof BelJarCurrentEditor !== 'undefined' ? BelJarCurrentEditor : null;
    if (!editor) return null;
    var activeId = BelJarPersist.getActiveFileId();
    var files = BelJarPersist.listFiles();
    var prelude = BelJarProjectSource.buildPrelude(files, activeId, function (id) {
      return fileTextForRun(id, activeId, editor);
    });
    var body = editor.getValue();
    var assembled = BelJarProjectSource.assembleCheckerCode(body, prelude);
    if (!assembled.prelude) return { code: assembled.code, prelude: null, pinned: false };
    return {
      code: assembled.code,
      prelude: assembled.prelude,
      pinned: true,
    };
  }

  async function ensureEditorLoadedForRun(code) {
    // If a whole-project load is still committed, leave it — REPL commands keep
    // running in project context instead of stomping it with the active buffer.
    if (projectSpans) {
      var project = buildProjectSource();
      if (project && editorMatchesCommitted(project.code)) {
        projectSpans = project.spans;
        return;
      }
      projectSpans = null;
    }
    if (!code.trim()) return;
    var bundle = buildActiveFileSource();
    var loadCode = bundle && bundle.prelude ? bundle.code : code;
    var loadPinned = !!(bundle && bundle.prelude);
    if (editorMatchesCommitted(loadCode)) return;
    var lineCount = loadCode.split('\n').length;
    var t0 = performance.now();
    if (typeof RunProgress !== 'undefined' && belugaMode !== 'fast') {
      RunProgress.start({ op: 'load', lineCount: lineCount });
    }
    try {
      var hooks = { onProgress: belugaProgressHook };
      if (loadPinned) hooks.pinned = true;
      await BelugaClient.load(loadCode, hooks);
      if (typeof RunProgress !== 'undefined' && belugaMode !== 'fast') {
        void RunProgress.complete({ lines: lineCount, ms: performance.now() - t0 });
      }
    } catch (e) {
      if (typeof RunProgress !== 'undefined') RunProgress.fail();
      throw e;
    }
  }

  function formatLoadError(e, spans, prelude) {
    var msg = e && e.message ? String(e.message) : String(e);
    if (spans && typeof BelJarProjectSource !== 'undefined') {
      msg = BelJarProjectSource.remapLocations(msg, spans);
    } else if (prelude && typeof BelJarProjectSource !== 'undefined') {
      msg = BelJarProjectSource.shiftCheckerOutput(msg, prelude).text;
    }
    return msg;
  }

  // Shared load pipeline. `code` is what Beluga gets; `spans` is the line map
  // for whole-project remapping (null for single-file / prelude runs).
  async function runLoad(code, spans, opts) {
    opts = opts || {};
    if (!code.trim()) return;
    if (typeof BelugaClient === 'undefined') {
      if (typeof BelJarToasts !== 'undefined') BelJarToasts.error('Beluga is not available.');
      return;
    }
    projectSpans = spans || null;
    var lineCount = code.split('\n').length;
    var t0 = performance.now();
    setBelugaBusy(true);
    if (typeof RunProgress !== 'undefined' && belugaMode !== 'fast') {
      RunProgress.start({ op: 'load', lineCount: lineCount });
    }
    var hooks = { onProgress: belugaProgressHook };
    if (opts.pinned) hooks.pinned = true;
    try {
      var raw = await BelugaClient.load(code, hooks);
      if (opts.prelude && typeof BelJarProjectSource !== 'undefined') {
        raw = BelJarProjectSource.shiftCheckerOutput(raw, opts.prelude).text;
      }
      if (typeof BelJarReplOutput !== 'undefined') BelJarReplOutput.appendBelugaResponse(raw, null);
      setBelugaBusy(false);
      if (typeof RunProgress !== 'undefined') {
        void RunProgress.complete({ lines: lineCount, ms: performance.now() - t0 });
      }
    } catch (e) {
      setBelugaBusy(false);
      if (typeof RunProgress !== 'undefined') RunProgress.fail();
      if (!isCancelled(e) && typeof BelJarToasts !== 'undefined') {
        BelJarToasts.error(formatLoadError(e, spans, opts.prelude), { duration: 0, closable: true });
      }
    }
  }

  // Run button / Ctrl-Enter: active file with same-folder prelude (cfg order).
  async function loadCode() {
    if (belugaBusy) return;
    var bundle = buildActiveFileSource();
    if (!bundle) return;
    return runLoad(bundle.code, null, { pinned: bundle.pinned, prelude: bundle.prelude });
  }

  // Explicit whole-project run: ordered concatenation of every project file,
  // with checker output remapped back to real files/lines.
  async function loadProject() {
    if (belugaBusy) return;
    var project = buildProjectSource();
    if (!project) return loadCode(); // single-file project
    return runLoad(project.code, project.spans, { pinned: true });
  }

  function init() {
    if (typeof BelugaClient === 'undefined') {
      if (typeof BelJarToasts !== 'undefined') {
        BelJarToasts.error('Beluga client failed to load.', { duration: 0, closable: true });
      }
      return;
    }
    BelugaClient.setProgressHandler(belugaProgressHook);
    BelugaClient.configure(modeToConfig(belugaMode));
    BelugaClient.warm().catch(function (e) {
      if (typeof BelJarToasts !== 'undefined') {
        BelJarToasts.error('Beluga worker failed to load: ' + (e && e.message ? e.message : e), {
          duration: 0,
          closable: true,
        });
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
    loadProject: loadProject,
    ensureEditorLoadedForRun: ensureEditorLoadedForRun,
    getProjectSpans: getProjectSpans,
  };
})(typeof window !== 'undefined' ? window : globalThis);
