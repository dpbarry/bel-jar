(() => {
  // js/beluga/beluga-text.mjs
  var global = globalThis;
  function normalizeBelugaRaw(s) {
    return String(s != null ? s : "").replace(/\r\n/g, "\n");
  }
  function stripBelugaAnsi(s) {
    return normalizeBelugaRaw(s).replace(/\u001b\[[0-9;]*m/g, "").replace(/\u009b[0-9;]*m/g, "").replace(/Ø\[[0-9;]*m/g, "");
  }
  function polishBelugaErrorDetail(detail) {
    return String(detail != null ? detail : "").replace(/;\s*$/, "").replace(
      /Failed to parse Expected the parser input to end here\.?/gi,
      "Failed to parse: unexpected text here."
    ).replace(/parse Expected/g, "parse.\nExpected").replace(
      /Expected the parser input to end here\.?/gi,
      "Unexpected text here \u2014 remove stray tokens or finish the declaration."
    ).trim();
  }
  function isBelugaCommandError(text) {
    var t = stripBelugaAnsi(text).trim();
    if (!t) return false;
    if (/^-\s*Error\b/i.test(t)) return true;
    if (/^-\s*Failed to execute command\.?$/im.test(t)) return true;
    if (/^Error:/im.test(t) && /^File "/im.test(t)) return true;
    return false;
  }
  function parseBelugaCommandError(text) {
    if (!isBelugaCommandError(text)) return null;
    var lines = stripBelugaAnsi(text).split("\n");
    var detail = [];
    var sawFailed = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line === ";") continue;
      if (/^-\s*Error in query\s*:\s*/i.test(line)) {
        line = line.replace(/^-\s*Error in query\s*:\s*/i, "").trim();
      }
      if (/^-\s*Failed to execute command\.?$/i.test(line)) {
        if (sawFailed) continue;
        sawFailed = true;
        continue;
      }
      if (/^-\s*Error\b/i.test(line) && !/^Error:/i.test(line)) {
        line = line.replace(/^-\s*Error\s*:\s*/i, "").trim();
        if (/^-\s*Failed to execute command\.?$/i.test(line)) continue;
      }
      if (line) detail.push(line);
    }
    var body = polishBelugaErrorDetail(detail.join("\n"));
    return {
      label: /^-\s*Error in query/im.test(stripBelugaAnsi(text)) ? "Query failed" : "Command failed",
      detail: body || "Command failed."
    };
  }
  function trimBindingValue(raw) {
    return String(raw != null ? raw : "").trim().replace(/[;.]+\s*$/, "");
  }
  function isInternalBindingValue(v) {
    if (!v || v === "^." || v === "^" || v === "[]") return true;
    if (/^\?[A-Za-z0-9_.]+$/.test(v)) return true;
    if (/TClo\(|FREE BVar/i.test(v)) return true;
    if (/^\[[^\]]*(?:TClo|FREE BVar|\?[A-Za-z0-9_.]+)/i.test(v)) return true;
    return false;
  }
  function isInternalQueryLine(trimmed) {
    if (!trimmed || trimmed === "[]" || trimmed === "^." || trimmed === "^") return true;
    return /^\[[^\]]*(?:TClo|FREE BVar|\?[A-Za-z0-9_.]+)/i.test(trimmed);
  }
  function normalizeWitnessTerm(v) {
    var out = v.replace(/\?[A-Za-z0-9_.]+/g, "?");
    var lam = out.match(/^\\([xX]\d*)\.\s*([\s\S]+)$/);
    if (lam) {
      var bvar = lam[1];
      var body = lam[2].replace(new RegExp("\\b" + bvar + "\\b", "g"), "x");
      body = body.replace(/\?[A-Za-z0-9_.]+/g, "?");
      return "fn x => " + body;
    }
    return out.replace(/\\x(\d+)/g, "x");
  }
  function prettifyQueryBindings(bindings) {
    var out = [];
    for (var i = 0; i < (bindings || []).length; i++) {
      var key = bindings[i].key;
      var v = trimBindingValue(bindings[i].value);
      if (!v || isInternalBindingValue(v)) continue;
      out.push({ key, value: normalizeWitnessTerm(v) });
    }
    return out;
  }
  global.BelugaText = {
    normalizeBelugaRaw,
    stripBelugaAnsi,
    isBelugaCommandError,
    parseBelugaCommandError,
    isInternalQueryLine,
    prettifyQueryBindings
  };

  // js/beluga/beluga-run.mjs
  var global2 = globalThis;
  var belugaBusy = false;
  var belugaMode = Persist.readStoredBelugaMode();
  var btnLoad = null;
  var btnRun = null;
  var cmdInputEl = null;
  function ensureRunControls() {
    if (typeof document === "undefined") return;
    if (!btnLoad) btnLoad = document.getElementById("btn-load");
    if (typeof ReplStream !== "undefined") {
      if (ReplStream.getRunButton) btnRun = ReplStream.getRunButton();
      if (ReplStream.getCommandInput) cmdInputEl = ReplStream.getCommandInput();
    }
    if (!btnRun) btnRun = document.getElementById("btn-run");
    if (!cmdInputEl) cmdInputEl = document.getElementById("command-input");
  }
  function setBelugaBusy(busy) {
    belugaBusy = !!busy;
    ensureRunControls();
    if (btnLoad) btnLoad.disabled = belugaBusy;
    if (btnRun) btnRun.disabled = belugaBusy;
    if (cmdInputEl) cmdInputEl.disabled = belugaBusy;
  }
  function isBelugaBusy() {
    return belugaBusy;
  }
  function modeToConfig(mode) {
    return mode === "fast" ? { thread: "main", build: "fast" } : { thread: "worker", build: "stable" };
  }
  function getBelugaMode() {
    return belugaMode;
  }
  function shouldShowRunProgress() {
    return belugaMode !== "fast";
  }
  function setBelugaMode(m) {
    belugaMode = m;
    Persist.writeStoredBelugaMode(m);
    if (typeof BelugaClient !== "undefined") {
      BelugaClient.configure(modeToConfig(m));
      BelugaClient.warm().catch(function() {
      });
    }
    SettingsUI.syncFromState();
  }
  function belugaProgressHook(msg) {
    if (msg && msg.phase === "build-fallback") {
      if (!Persist.readStoredBelugaFallbackStable()) return;
      Toasts.warn(
        "Fast build hit the stack limit. Retrying with Stable; switch to Stable in Settings to avoid this.",
        { duration: 0, closable: true }
      );
      if (belugaBusy) RunProgress.start({ op: "load" });
      return;
    }
    if (RunProgress.isRunning()) {
      RunProgress.onBelugaProgress(msg);
    }
  }
  function editorMatchesCommitted(code) {
    if (typeof BelugaClient === "undefined") return false;
    var committed = typeof BelugaClient.getCommittedFingerprint === "function" ? BelugaClient.getCommittedFingerprint() : null;
    var editorFp = typeof BelugaClient.fingerprint === "function" ? BelugaClient.fingerprint(code) : null;
    return !!committed && !!editorFp && committed === editorFp;
  }
  function isCancelled(err) {
    return !!(typeof BelugaClient !== "undefined" && typeof BelugaClient.isCancelledError === "function" && BelugaClient.isCancelledError(err));
  }
  var projectSpans = null;
  function getProjectSpans() {
    return projectSpans;
  }
  function fileTextForRun(fileId, activeId, editor) {
    if (fileId === activeId && editor) return editor.getValue();
    return Persist.getFileText(fileId) || "";
  }
  function resolveDefaultCfgPath(files, getText) {
    var activeId = Persist.getActiveFileId();
    if (!activeId) return null;
    var dev = ProjectSource.developmentForFile(files, activeId, getText);
    return dev.kind === "module" && dev.cfg ? dev.cfg : null;
  }
  function baseName(p) {
    var s = String(p || "");
    return s.slice(s.lastIndexOf("/") + 1);
  }
  function projectDisplayName(cfgPath) {
    if (cfgPath) return baseName(cfgPath).replace(/\.cfg$/i, "");
    return activeFileName();
  }
  function activeFileName() {
    var id = Persist.getActiveFileId();
    var files = Persist.listFiles() || [];
    for (var i = 0; i < files.length; i++) {
      if (files[i].id === id) return baseName(files[i].name);
    }
    return "input.bel";
  }
  function applyOutputNaming(raw, spans, prelude, displayName, statusName) {
    var out = String(raw == null ? "" : raw);
    if (spans) {
      out = ProjectSource.remapLocations(out, spans);
    } else if (prelude) {
      out = ProjectSource.shiftCheckerOutput(out, prelude).text;
    }
    if (displayName) out = out.replace(/input\.bel/g, displayName);
    if (statusName && typeof ReplRunCmd !== "undefined" && ReplRunCmd.rewriteRunStatusLabel) {
      out = ReplRunCmd.rewriteRunStatusLabel(out, displayName || "input.bel", statusName);
    } else if (statusName && displayName && statusName !== displayName) {
      out = out.replace(
        new RegExp(
          "(##\\s*(?:Type Reconstruction (?:begin|done)|Holes)\\s*:\\s*)" + displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s*##)",
          "gi"
        ),
        "$1" + statusName + "$2"
      );
    }
    return out;
  }
  function statusNameForFilePath(absPath, amalgam) {
    if (typeof ReplRunCmd !== "undefined" && ReplRunCmd.formatRunStatusName) {
      return ReplRunCmd.formatRunStatusName(absPath, activeCwd(), !!amalgam);
    }
    var shown = absPath ? baseName(absPath) : "input.bel";
    return amalgam ? "&" + shown : shown;
  }
  function makeGetText() {
    var activeId = Persist.getActiveFileId();
    var editor = typeof CurrentEditor !== "undefined" ? CurrentEditor : null;
    return function(id) {
      return fileTextForRun(id, activeId, editor);
    };
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
  function buildProjectSource() {
    var files = Persist.listFiles();
    if (!files || !files.length) return null;
    var getText = makeGetText();
    var cfgPath = resolveDefaultCfgPath(files, getText);
    if (!cfgPath) return null;
    return buildCfgSource(cfgPath);
  }
  function buildCfgSource(cfgPath) {
    if (!cfgPath) return null;
    var files = Persist.listFiles();
    if (!files || !files.length) return null;
    var getText = makeGetText();
    var dev = ProjectSource.developmentFilesForCfg(files, cfgPath, getText);
    if (!dev || !dev.length) return null;
    var entries = dev.map(function(f) {
      return { id: f.id, name: f.name, text: getText(f.id) };
    });
    var assembled = ProjectSource.assembleProjectCode(entries);
    assembled.name = projectDisplayName(cfgPath);
    return assembled;
  }
  function buildActiveFileSource() {
    var editor = typeof CurrentEditor !== "undefined" ? CurrentEditor : null;
    if (!editor) return null;
    var activeId = Persist.getActiveFileId();
    var files = Persist.listFiles();
    var prelude = ProjectSource.buildPrelude(files, activeId, function(id) {
      return fileTextForRun(id, activeId, editor);
    });
    var body = editor.getValue();
    var assembled = ProjectSource.assembleCheckerCode(body, prelude);
    if (!assembled.prelude) return { code: assembled.code, prelude: null, pinned: false };
    return {
      code: assembled.code,
      prelude: assembled.prelude,
      pinned: true
    };
  }
  async function ensureEditorLoadedForRun(code) {
    if (projectSpans) {
      var project = buildProjectSource();
      if (project && editorMatchesCommitted(project.code)) {
        projectSpans = project.spans;
        return;
      }
      projectSpans = null;
    }
    var bundle = buildActiveFileSource();
    var loadCode2 = bundle && bundle.prelude ? bundle.code : code;
    var loadPinned = !!(bundle && bundle.prelude);
    if (editorMatchesCommitted(loadCode2)) return;
    var lineCount = loadCode2.split("\n").length;
    var t0 = performance.now();
    if (shouldShowRunProgress()) {
      RunProgress.start({ op: "load", lineCount });
    }
    try {
      var hooks = { onProgress: belugaProgressHook };
      if (loadPinned) hooks.pinned = true;
      await BelugaClient.load(loadCode2, hooks);
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
    return applyOutputNaming(msg, spans, prelude, displayName, null);
  }
  function suiteNameFromCfg(cfgPath) {
    return baseName(cfgPath).replace(/\.cfg$/i, "") || "suite";
  }
  function activeCwd() {
    var id = Persist.getActiveFileId && Persist.getActiveFileId();
    var path = id ? filePathOf(id) : null;
    return path && typeof ProjectSource !== "undefined" && ProjectSource.dirOf ? ProjectSource.dirOf(path) : "";
  }
  function captionForFilePath(absPath, amalgam) {
    if (typeof ReplRunCmd !== "undefined" && ReplRunCmd.formatRunCaption) {
      return ReplRunCmd.formatRunCaption(absPath, activeCwd(), !!amalgam);
    }
    var shown = absPath ? baseName(absPath) : "input.bel";
    return amalgam ? "run &" + shown : "run " + shown;
  }
  function beginRunTurn(caption) {
    var text = caption != null ? String(caption).trim() : "";
    if (text && typeof ReplCommands !== "undefined" && ReplCommands.recordHistory) {
      ReplCommands.recordHistory(text);
    }
    if (typeof ReplStream !== "undefined" && ReplStream.beginTurn) {
      ReplStream.beginTurn(caption);
    }
  }
  function endRunTurn() {
    if (typeof ReplStream !== "undefined" && ReplStream.endTurn) {
      ReplStream.endTurn();
    }
  }
  async function runLoad(code, spans, opts) {
    opts = opts || {};
    if (typeof BelugaClient === "undefined") {
      Toasts.error("Beluga is not available.");
      return;
    }
    var caption = opts.caption || "run " + (opts.displayName || "input.bel");
    beginRunTurn(caption);
    if (typeof ReplOutput !== "undefined" && ReplOutput.beginRunSkeleton) {
      ReplOutput.beginRunSkeleton();
    }
    projectSpans = spans || null;
    var lineCount = code.split("\n").length;
    var t0 = performance.now();
    setBelugaBusy(true);
    if (shouldShowRunProgress()) {
      RunProgress.start({ op: "load", lineCount });
    }
    var hooks = { onProgress: belugaProgressHook };
    if (opts.pinned) hooks.pinned = true;
    try {
      var raw = await BelugaClient.load(code, hooks);
      raw = applyOutputNaming(raw, spans, opts.prelude, opts.displayName, opts.statusName);
      if (!String(raw).trim()) {
        var name = opts.statusName || opts.displayName || "input.bel";
        raw = "## Type Reconstruction begin: " + name + " ##\n## Type Reconstruction done:  " + name + " ##";
      } else if (typeof BelEditor !== "undefined" && typeof BelEditor.normalizeUnlocatedBelugaRunOutput === "function") {
        raw = BelEditor.normalizeUnlocatedBelugaRunOutput(raw, {
          code,
          fileName: opts.displayName || "input.bel",
          spans,
          prelude: opts.prelude || null
        });
      }
      if (typeof ReplOutput !== "undefined" && ReplOutput.resolveRunOutput) {
        await ReplOutput.resolveRunOutput(raw);
      } else {
        ReplOutput.appendRunOutput(raw);
      }
      setBelugaBusy(false);
      void RunProgress.complete({ lines: lineCount, ms: performance.now() - t0 });
    } catch (e) {
      setBelugaBusy(false);
      RunProgress.fail();
      if (typeof ReplOutput !== "undefined" && ReplOutput.dismissRunSkeleton) {
        await ReplOutput.dismissRunSkeleton();
      }
      if (!isCancelled(e)) {
        Toasts.error(formatLoadError(e, spans, opts.prelude, opts.displayName), { duration: 0, closable: true });
      }
    } finally {
      endRunTurn();
    }
  }
  function resolveTargetId(targetId) {
    return targetId || Persist.getActiveFileId();
  }
  function fileNameOf(id) {
    var files = Persist.listFiles() || [];
    for (var i = 0; i < files.length; i++) {
      if (files[i].id === id) return baseName(files[i].name);
    }
    return "input.bel";
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
  async function runFile(targetId) {
    if (belugaBusy) return;
    var id = resolveTargetId(targetId);
    if (!id) return;
    var cfgPath = cfgPathForId(id);
    if (cfgPath) return runModuleCfg(cfgPath);
    var name = fileNameOf(id);
    var path = filePathOf(id) || name;
    var assembled = ProjectSource.assembleCheckerCode(makeGetText()(id), null);
    return runLoad(assembled.code, null, {
      pinned: true,
      displayName: name,
      statusName: statusNameForFilePath(path, false),
      caption: captionForFilePath(path, false)
    });
  }
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
    var amalgam = !!assembled.prelude;
    return runLoad(assembled.code, null, {
      pinned: true,
      prelude: assembled.prelude,
      displayName: name,
      statusName: statusNameForFilePath(path, amalgam),
      caption: captionForFilePath(path, amalgam)
    });
  }
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
  async function runModuleCfg(cfgPath) {
    if (belugaBusy) return;
    var src = buildCfgSource(cfgPath);
    if (!src) return;
    var suite = suiteNameFromCfg(cfgPath);
    return runLoad(src.code, src.spans, {
      pinned: true,
      displayName: src.name,
      caption: "run suite " + suite
    });
  }
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
    var folderLabel = folderPath || "(root)";
    return runLoad(assembled.code, assembled.spans, {
      pinned: true,
      displayName: folderLabel,
      caption: "run folder " + folderLabel
    });
  }
  async function runProject() {
    if (belugaBusy) return;
    if (typeof BelugaClient === "undefined") {
      Toasts.error("Beluga is not available.");
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
      var onlyCaption = only.dev.kind === "config" ? "run suite " + only.dev.name : "run " + only.dev.name;
      return runLoad(only.code, only.spans, {
        pinned: true,
        displayName: only.dev.name,
        caption: onlyCaption
      });
    }
    setBelugaBusy(true);
    var t0 = performance.now();
    if (shouldShowRunProgress()) RunProgress.start({ op: "load" });
    var failures = 0;
    var lines = 0;
    for (var j = 0; j < jobs.length; j++) {
      var job = jobs[j];
      var caption = job.dev.kind === "config" ? "run suite " + job.dev.name : "run " + job.dev.name;
      lines += job.code.split("\n").length;
      beginRunTurn(caption);
      if (typeof ReplOutput !== "undefined" && ReplOutput.beginRunSkeleton) {
        ReplOutput.beginRunSkeleton();
      }
      try {
        var raw = await BelugaClient.load(job.code, { onProgress: belugaProgressHook, pinned: true });
        projectSpans = job.spans;
        raw = applyOutputNaming(raw, job.spans, null, job.dev.name);
        if (!String(raw).trim()) {
          raw = "## Type Reconstruction begin: " + job.dev.name + " ##\n## Type Reconstruction done:  " + job.dev.name + " ##";
        }
        if (typeof ReplOutput !== "undefined" && ReplOutput.resolveRunOutput) {
          await ReplOutput.resolveRunOutput(raw);
        } else {
          ReplOutput.appendRunOutput(raw);
        }
      } catch (e) {
        if (isCancelled(e)) {
          if (typeof ReplOutput !== "undefined" && ReplOutput.dismissRunSkeleton) {
            await ReplOutput.dismissRunSkeleton();
          }
          endRunTurn();
          break;
        }
        failures++;
        var msg = applyOutputNaming(e && e.message ? String(e.message) : String(e), job.spans, null, job.dev.name);
        if (typeof ReplOutput !== "undefined" && ReplOutput.resolveRunOutput) {
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
    else void RunProgress.complete({ lines, ms: performance.now() - t0 });
    if (failures) {
      Toasts.error(
        failures + " of " + jobs.length + " developments failed type-checking.",
        { duration: 0, closable: true }
      );
    }
  }
  var loadCode = runToHere;
  var loadProject = runModule;
  var runConfig = runModule;
  function init() {
    if (typeof BelugaClient === "undefined") {
      Toasts.error("Beluga client failed to load.", {
        duration: 0,
        closable: true,
        durable: true,
        body: "The checker script never arrived, so nothing can be run or type-checked. Reload the page to retry.",
        source: "beluga.client",
        dedupeKey: "beluga.client.load"
      });
      return;
    }
    BelugaClient.setProgressHandler(belugaProgressHook);
    BelugaClient.configure(modeToConfig(belugaMode));
    BelugaClient.warm().catch(function(e) {
      var detail = e && e.message ? e.message : String(e);
      Toasts.error("Beluga worker failed to load.", {
        duration: 0,
        closable: true,
        durable: true,
        body: "Type-checking is unavailable until it loads. Reload the page to retry.",
        detail,
        source: "beluga.worker",
        dedupeKey: "beluga.worker.load"
      });
    });
  }
  global2.BelugaRun = {
    init,
    setBelugaBusy,
    isBelugaBusy,
    getBelugaMode,
    shouldShowRunProgress,
    setBelugaMode,
    belugaProgressHook,
    runFile,
    runToHere,
    runModule,
    runModuleCfg,
    runFolder,
    runProject,
    runConfig,
    loadCode,
    loadProject,
    ensureEditorLoadedForRun,
    getProjectSpans
  };
  global2.BelJarBelugaRun = global2.BelugaRun;
})();
