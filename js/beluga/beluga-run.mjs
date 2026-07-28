const global = globalThis;
var belugaBusy = false;
  var belugaMode = Persist.readStoredBelugaMode();

  var btnLoad = null;
  var btnRun = null;
  var cmdInputEl = null;

  function ensureRunControls() {
    if (typeof document === 'undefined') return;
    if (!btnLoad) btnLoad = document.getElementById('btn-load');
    if (typeof ReplStream !== 'undefined') {
      if (ReplStream.getRunButton) btnRun = ReplStream.getRunButton();
      if (ReplStream.getCommandInput) cmdInputEl = ReplStream.getCommandInput();
    }
    if (!btnRun) btnRun = document.getElementById('btn-run');
    if (!cmdInputEl) cmdInputEl = document.getElementById('command-input');
  }

  function setBelugaBusy(busy) {
    belugaBusy = !!busy;
    ensureRunControls();
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

  function shouldShowRunProgress() {
    return belugaMode !== 'fast';
  }

  function setBelugaMode(m) {
    belugaMode = m;
    Persist.writeStoredBelugaMode(m);
    if (typeof BelugaClient !== 'undefined') {
      BelugaClient.configure(modeToConfig(m));
      BelugaClient.warm().catch(function () {});
    }
    SettingsUI.syncFromState();
  }

  function belugaProgressHook(msg) {
    if (msg && msg.phase === 'build-fallback') {
      if (!Persist.readStoredBelugaFallbackStable()) return;
      Toasts.warn(
        'Fast build hit the stack limit. Retrying with Stable; switch to Stable in Settings to avoid this.',
        { duration: 0, closable: true },
      );
      if (belugaBusy) RunProgress.start({ op: 'load' });
      return;
    }
    if (RunProgress.isRunning()) {
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
    return Persist.getFileText(fileId) || '';
  }

  function resolveDefaultCfgPath(files, getText) {
    var activeId = Persist.getActiveFileId();
    if (!activeId) return null;
    var dev = ProjectSource.developmentForFile(files, activeId, getText);
    return dev.kind === 'module' && dev.cfg ? dev.cfg : null;
  }

  function baseName(p) {
    var s = String(p || '');
    return s.slice(s.lastIndexOf('/') + 1);
  }

  // The checker always sees the assembled program as "input.bel". For output we
  // want a real name: the project (cfg, no extension) for a whole-project run,
  // or the active file for a single-file run.
  function projectDisplayName(cfgPath) {
    if (cfgPath) return baseName(cfgPath).replace(/\.cfg$/i, '');
    return activeFileName();
  }

  function activeFileName() {
    var id = Persist.getActiveFileId();
    var files = Persist.listFiles() || [];
    for (var i = 0; i < files.length; i++) {
      if (files[i].id === id) return baseName(files[i].name);
    }
    return 'input.bel';
  }

  // Remap locations back to real files/lines, then rename the synthetic
  // "input.bel" the checker echoes (status lines, single-file references).
  // `statusName` (e.g. &a.bel) stamps Type Reconstruction / Holes chatter only —
  // File "…" paths keep the plain displayName.
  function applyOutputNaming(raw, spans, prelude, displayName, statusName) {
    var out = String(raw == null ? '' : raw);
    if (spans) {
      out = ProjectSource.remapLocations(out, spans);
    } else if (prelude) {
      out = ProjectSource.shiftCheckerOutput(out, prelude).text;
    }
    if (displayName) out = out.replace(/input\.bel/g, displayName);
    if (statusName && typeof ReplRunCmd !== 'undefined' && ReplRunCmd.rewriteRunStatusLabel) {
      out = ReplRunCmd.rewriteRunStatusLabel(out, displayName || 'input.bel', statusName);
    } else if (statusName && displayName && statusName !== displayName) {
      out = out.replace(
        new RegExp(
          '(##\\s*(?:Type Reconstruction (?:begin|done)|Holes)\\s*:\\s*)'
            + displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            + '(\\s*##)',
          'gi',
        ),
        '$1' + statusName + '$2',
      );
    }
    return out;
  }

  function statusNameForFilePath(absPath, amalgam) {
    if (typeof ReplRunCmd !== 'undefined' && ReplRunCmd.formatRunStatusName) {
      return ReplRunCmd.formatRunStatusName(absPath, activeCwd(), !!amalgam);
    }
    var shown = absPath ? baseName(absPath) : 'input.bel';
    return amalgam ? '&' + shown : shown;
  }

  function makeGetText() {
    var activeId = Persist.getActiveFileId();
    var editor = typeof CurrentEditor !== 'undefined' ? CurrentEditor : null;
    return function (id) { return fileTextForRun(id, activeId, editor); };
  }

  function entriesForPaths(paths, files, getText) {
    var byName = {};
    for (var i = 0; i < files.length; i++) byName[files[i].name] = files[i];
    var out = [];
    for (var j = 0; j < paths.length; j++) {
      var f = byName[paths[j]];
      if (f) out.push({ id: f.id, name: f.name, text: getText(f.id) });
    }
    return out;
  }

  // Default-cfg project source, used only to detect whether a committed
  // whole-project load still matches the editor (REPL context preservation).
  function buildProjectSource() {
    var files = Persist.listFiles();
    if (!files || !files.length) return null;
    var getText = makeGetText();
    var cfgPath = resolveDefaultCfgPath(files, getText);
    if (!cfgPath) return null;
    return buildCfgSource(cfgPath);
  }

  // Assemble the full development chain of one .cfg into a single checker source.
  function buildCfgSource(cfgPath) {
    if (!cfgPath) return null;
    var files = Persist.listFiles();
    if (!files || !files.length) return null;
    var getText = makeGetText();
    var dev = ProjectSource.developmentFilesForCfg(files, cfgPath, getText);
    if (!dev || !dev.length) return null;
    var entries = dev.map(function (f) {
      return { id: f.id, name: f.name, text: getText(f.id) };
    });
    var assembled = ProjectSource.assembleProjectCode(entries);
    assembled.name = projectDisplayName(cfgPath);
    return assembled;
  }

  // Active file with same-folder predecessors prepended (Beluga project semantics).
  function buildActiveFileSource() {
    var editor = typeof CurrentEditor !== 'undefined' ? CurrentEditor : null;
    if (!editor) return null;
    var activeId = Persist.getActiveFileId();
    var files = Persist.listFiles();
    var prelude = ProjectSource.buildPrelude(files, activeId, function (id) {
      return fileTextForRun(id, activeId, editor);
    });
    var body = editor.getValue();
    var assembled = ProjectSource.assembleCheckerCode(body, prelude);
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
    var bundle = buildActiveFileSource();
    var loadCode = bundle && bundle.prelude ? bundle.code : code;
    var loadPinned = !!(bundle && bundle.prelude);
    if (editorMatchesCommitted(loadCode)) return;
    var lineCount = loadCode.split('\n').length;
    var t0 = performance.now();
    if (shouldShowRunProgress()) {
      RunProgress.start({ op: 'load', lineCount: lineCount });
    }
    try {
      var hooks = { onProgress: belugaProgressHook };
      if (loadPinned) hooks.pinned = true;
      await BelugaClient.load(loadCode, hooks);
      if (shouldShowRunProgress()) {
        void RunProgress.complete({ lines: lineCount, ms: performance.now() - t0 });
      }
    } catch (e) {
      RunProgress.fail();
      throw e;
    }
  }

  function formatLoadError(e, spans, prelude, displayName) {
    var msg = e && e.message ? String(e.message) : String(e);
    // Errors stay on real paths — never stamp amalgam `&` into File "…" lines.
    return applyOutputNaming(msg, spans, prelude, displayName, null);
  }

  function suiteNameFromCfg(cfgPath) {
    return baseName(cfgPath).replace(/\.cfg$/i, '') || 'suite';
  }

  function activeCwd() {
    var id = Persist.getActiveFileId && Persist.getActiveFileId();
    var path = id ? filePathOf(id) : null;
    return path && typeof ProjectSource !== 'undefined' && ProjectSource.dirOf
      ? ProjectSource.dirOf(path)
      : '';
  }

  function captionForFilePath(absPath, amalgam) {
    if (typeof ReplRunCmd !== 'undefined' && ReplRunCmd.formatRunCaption) {
      return ReplRunCmd.formatRunCaption(absPath, activeCwd(), !!amalgam);
    }
    var shown = absPath ? baseName(absPath) : 'input.bel';
    return amalgam ? 'run &' + shown : 'run ' + shown;
  }

  function beginRunTurn(caption) {
    var text = caption != null ? String(caption).trim() : '';
    if (text && typeof ReplCommands !== 'undefined' && ReplCommands.recordHistory) {
      ReplCommands.recordHistory(text);
    }
    if (typeof ReplStream !== 'undefined' && ReplStream.beginTurn) {
      ReplStream.beginTurn(caption);
    }
  }

  function endRunTurn() {
    if (typeof ReplStream !== 'undefined' && ReplStream.endTurn) {
      ReplStream.endTurn();
    }
  }

  // Shared load pipeline. `code` is what Beluga gets; `spans` is the line map
  // for whole-project remapping (null for single-file / prelude runs).
  async function runLoad(code, spans, opts) {
    opts = opts || {};
    if (typeof BelugaClient === 'undefined') {
      Toasts.error('Beluga is not available.');
      return;
    }
    var caption = opts.caption || ('run ' + (opts.displayName || 'input.bel'));
    beginRunTurn(caption);
    if (typeof ReplOutput !== 'undefined' && ReplOutput.beginRunSkeleton) {
      ReplOutput.beginRunSkeleton();
    }
    projectSpans = spans || null;
    var lineCount = code.split('\n').length;
    var t0 = performance.now();
    setBelugaBusy(true);
    if (shouldShowRunProgress()) {
      RunProgress.start({ op: 'load', lineCount: lineCount });
    }
    var hooks = { onProgress: belugaProgressHook };
    if (opts.pinned) hooks.pinned = true;
    try {
      var raw = await BelugaClient.load(code, hooks);
      // applyOutputNaming already remaps via `spans`; resolveRunOutput (unlike
      // appendBelugaResponse) does NOT remap again, so naming happens once.
      raw = applyOutputNaming(raw, spans, opts.prelude, opts.displayName, opts.statusName);
      if (!String(raw).trim()) {
        var name = opts.statusName || opts.displayName || 'input.bel';
        raw = '## Type Reconstruction begin: ' + name + ' ##\n## Type Reconstruction done:  ' + name + ' ##';
      } else if (typeof BelEditor !== 'undefined'
          && typeof BelEditor.normalizeUnlocatedBelugaRunOutput === 'function') {
        raw = BelEditor.normalizeUnlocatedBelugaRunOutput(raw, {
          code: code,
          fileName: opts.displayName || 'input.bel',
          spans: spans,
          prelude: opts.prelude || null,
        });
      }
      if (typeof ReplOutput !== 'undefined' && ReplOutput.resolveRunOutput) {
        await ReplOutput.resolveRunOutput(raw);
      } else {
        ReplOutput.appendRunOutput(raw);
      }
      setBelugaBusy(false);
      void RunProgress.complete({ lines: lineCount, ms: performance.now() - t0 });
    } catch (e) {
      setBelugaBusy(false);
      RunProgress.fail();
      if (typeof ReplOutput !== 'undefined' && ReplOutput.dismissRunSkeleton) {
        await ReplOutput.dismissRunSkeleton();
      }
      if (!isCancelled(e)) {
        Toasts.error(formatLoadError(e, spans, opts.prelude, opts.displayName), { duration: 0, closable: true });
      }
    } finally {
      endRunTurn();
    }
  }

  // ── Run scopes ─────────────────────────────────────────────────────────────
  // File ⊂ "suite to here" ⊂ Suite(one .cfg) ⊂ Project(whole workspace).
  // A "suite" = the files a .cfg lists (internally still kind:'module'). The
  // user-facing term is "suite" — Beluga's own `module` is a namespacing
  // construct, so this avoids the collision. The file-targeting variants
  // take an optional fileId so explorer/tab context menus can run a file other
  // than the active one (active uses the live buffer, others use stored text).

  function resolveTargetId(targetId) {
    return targetId || Persist.getActiveFileId();
  }

  function fileNameOf(id) {
    var files = Persist.listFiles() || [];
    for (var i = 0; i < files.length; i++) {
      if (files[i].id === id) return baseName(files[i].name);
    }
    return 'input.bel';
  }

  function filePathOf(id) {
    var files = Persist.listFiles() || [];
    for (var i = 0; i < files.length; i++) {
      if (files[i].id === id) return files[i].name;
    }
    return null;
  }

  function cfgPathForId(id) {
    var path = filePathOf(id);
    return path && /\.cfg$/i.test(path) ? path : null;
  }

  // Run File — one buffer alone, no prelude.
  async function runFile(targetId) {
    if (belugaBusy) return;
    var id = resolveTargetId(targetId);
    if (!id) return;
    var cfgPath = cfgPathForId(id);
    if (cfgPath) return runModuleCfg(cfgPath);
    var name = fileNameOf(id);
    var path = filePathOf(id) || name;
    var assembled = ProjectSource.assembleCheckerCode(makeGetText()(id), null);
    // pinned: explicit run scope — code may differ from the active editor buffer
    // (explorer/tab context menu). Without this, worker loads are cancelled as stale.
    return runLoad(assembled.code, null, {
      pinned: true,
      displayName: name,
      statusName: statusNameForFilePath(path, false),
      caption: captionForFilePath(path, false),
    });
  }

  // Run Module to Here — a file with its module predecessors prepended (cfg order).
  async function runToHere(targetId) {
    if (belugaBusy) return;
    var id = resolveTargetId(targetId);
    if (!id) return;
    var cfgPath = cfgPathForId(id);
    if (cfgPath) return runModuleCfg(cfgPath);
    var files = Persist.listFiles();
    var getText = makeGetText();
    var name = fileNameOf(id);
    var path = filePathOf(id) || name;
    var prelude = ProjectSource.buildPrelude(files, id, getText);
    var assembled = ProjectSource.assembleCheckerCode(getText(id), prelude);
    return runLoad(assembled.code, null, {
      pinned: true,
      prelude: assembled.prelude,
      displayName: name,
      statusName: statusNameForFilePath(path, true),
      caption: captionForFilePath(path, true),
    });
  }

  // Run Module — the entire .cfg a file belongs to (orphan file ⇒ to-here).
  async function runModule(targetId) {
    if (belugaBusy) return;
    var id = resolveTargetId(targetId);
    if (!id) return;
    var cfgPath = cfgPathForId(id);
    if (cfgPath) return runModuleCfg(cfgPath);
    var files = Persist.listFiles();
    var cfgPath2 = ProjectSource.cfgPathForActive(files, id, makeGetText());
    if (!cfgPath2) return runToHere(id);
    return runModuleCfg(cfgPath2);
  }

  // Run Module by explicit .cfg path (used by cfg-row / folder context menus).
  async function runModuleCfg(cfgPath) {
    if (belugaBusy) return;
    var src = buildCfgSource(cfgPath);
    if (!src) return;
    var suite = suiteNameFromCfg(cfgPath);
    return runLoad(src.code, src.spans, {
      pinned: true,
      displayName: src.name,
      caption: 'run suite ' + suite,
    });
  }

  // Run Folder — the development rooted at a folder: its .cfg module if one
  // lives there, else the folder's signature files (registry order) as one run.
  async function runFolder(folderPath) {
    if (belugaBusy) return;
    var activeCfg = Persist.getActiveCfgForDir(folderPath);
    if (activeCfg) return runModuleCfg(activeCfg);
    var files = Persist.listFiles();
    var dirOf = ProjectSource.dirOf;
    for (var i = 0; i < files.length; i++) {
      if (/\.cfg$/i.test(files[i].name) && dirOf(files[i].name) === folderPath) {
        return runModuleCfg(files[i].name);
      }
    }
    var paths = [];
    for (var j = 0; j < files.length; j++) {
      if (dirOf(files[j].name) === folderPath && ProjectSource.isSignaturePath(files[j].name)) paths.push(files[j].name);
    }
    if (!paths.length) return;
    var entries = entriesForPaths(paths, files, makeGetText());
    var assembled = ProjectSource.assembleProjectCode(entries);
    var folderLabel = folderPath || '(root)';
    return runLoad(assembled.code, assembled.spans, {
      pinned: true,
      displayName: folderLabel,
      caption: 'run folder ' + folderLabel,
    });
  }

  // Run Project — every independent development in the workspace, checked
  // separately and reported under its config/folder name. Errors in one
  // development don't stop the others.
  async function runProject() {
    if (belugaBusy) return;
    if (typeof BelugaClient === 'undefined') {
      Toasts.error('Beluga is not available.');
      return;
    }
    var files = Persist.listFiles();
    if (!files || !files.length) return;
    var getText = makeGetText();
    var devs = ProjectSource.workspaceDevelopments(files, getText);
    if (!devs || !devs.length) return runModule();

    var jobs = [];
    for (var i = 0; i < devs.length; i++) {
      var entries = entriesForPaths(devs[i].paths, files, getText);
      if (!entries.length) continue;
      var assembled = ProjectSource.assembleProjectCode(entries);
      jobs.push({ dev: devs[i], code: assembled.code, spans: assembled.spans });
    }
    if (!jobs.length) return;
    if (jobs.length === 1) {
      var only = jobs[0];
      var onlyCaption = only.dev.kind === 'config'
        ? 'run suite ' + only.dev.name
        : 'run ' + only.dev.name;
      return runLoad(only.code, only.spans, {
        pinned: true,
        displayName: only.dev.name,
        caption: onlyCaption,
      });
    }

    setBelugaBusy(true);
    var t0 = performance.now();
    if (shouldShowRunProgress()) RunProgress.start({ op: 'load' });
    var failures = 0;
    var lines = 0;
    for (var j = 0; j < jobs.length; j++) {
      var job = jobs[j];
      var caption = job.dev.kind === 'config'
        ? 'run suite ' + job.dev.name
        : 'run ' + job.dev.name;
      lines += job.code.split('\n').length;
      beginRunTurn(caption);
      if (typeof ReplOutput !== 'undefined' && ReplOutput.beginRunSkeleton) {
        ReplOutput.beginRunSkeleton();
      }
      try {
        var raw = await BelugaClient.load(job.code, { onProgress: belugaProgressHook, pinned: true });
        projectSpans = job.spans; // last development stays the REPL context
        raw = applyOutputNaming(raw, job.spans, null, job.dev.name);
        if (!String(raw).trim()) {
          raw = '## Type Reconstruction begin: ' + job.dev.name + ' ##\n## Type Reconstruction done:  ' + job.dev.name + ' ##';
        }
        if (typeof ReplOutput !== 'undefined' && ReplOutput.resolveRunOutput) {
          await ReplOutput.resolveRunOutput(raw);
        } else {
          ReplOutput.appendRunOutput(raw);
        }
      } catch (e) {
        if (isCancelled(e)) {
          if (typeof ReplOutput !== 'undefined' && ReplOutput.dismissRunSkeleton) {
            await ReplOutput.dismissRunSkeleton();
          }
          endRunTurn();
          break;
        }
        failures++;
        var msg = applyOutputNaming(e && e.message ? String(e.message) : String(e), job.spans, null, job.dev.name);
        if (typeof ReplOutput !== 'undefined' && ReplOutput.resolveRunOutput) {
          await ReplOutput.resolveRunOutput(msg);
        } else {
          ReplOutput.appendRunOutput(msg);
        }
      } finally {
        endRunTurn();
      }
    }
    setBelugaBusy(false);
    if (failures) RunProgress.fail();
    else void RunProgress.complete({ lines: lines, ms: performance.now() - t0 });
    if (failures) {
      Toasts.error(failures + ' of ' + jobs.length + ' developments failed type-checking.',
        { duration: 0, closable: true });
    }
  }

  // Back-compat aliases.
  var loadCode = runToHere;
  var loadProject = runModule;
  var runConfig = runModule;

  function init() {
    if (typeof BelugaClient === 'undefined') {
      Toasts.error('Beluga client failed to load.', { duration: 0, closable: true });
      return;
    }
    BelugaClient.setProgressHandler(belugaProgressHook);
    BelugaClient.configure(modeToConfig(belugaMode));
    BelugaClient.warm().catch(function (e) {
      Toasts.error('Beluga worker failed to load: ' + (e && e.message ? e.message : e), {
        duration: 0,
        closable: true,
      });
    });
  }

  global.BelugaRun = {
    init: init,
    setBelugaBusy: setBelugaBusy,
    isBelugaBusy: isBelugaBusy,
    getBelugaMode: getBelugaMode,
    shouldShowRunProgress: shouldShowRunProgress,
    setBelugaMode: setBelugaMode,
    belugaProgressHook: belugaProgressHook,
    runFile: runFile,
    runToHere: runToHere,
    runModule: runModule,
    runModuleCfg: runModuleCfg,
    runFolder: runFolder,
    runProject: runProject,
    runConfig: runConfig,
    loadCode: loadCode,
    loadProject: loadProject,
    ensureEditorLoadedForRun: ensureEditorLoadedForRun,
    getProjectSpans: getProjectSpans,
  };
  global.BelJarBelugaRun = global.BelugaRun;
