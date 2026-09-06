(() => {
  // js/app/app-empty-state.mjs
  function create(opts) {
    var getInspectorPanelEl = opts.getInspectorPanelEl;
    var getInspectorProjectEmptyEl = opts.getInspectorProjectEmptyEl;
    var getEditorEmptyEl = opts.getEditorEmptyEl;
    var getEditorMount = opts.getEditorMount;
    var projectTreeEmpty = opts.projectTreeEmpty;
    var editorCanvasIdle = opts.editorCanvasIdle;
    function setEmptyOverlayVisible(el, visible) {
      if (!el) return;
      el.hidden = !visible;
      el.setAttribute("aria-hidden", visible ? "false" : "true");
      if ("inert" in el) el.inert = !visible;
    }
    function updateInspectorProjectEmpty() {
      var inspectorPanelEl = getInspectorPanelEl && getInspectorPanelEl();
      if (!inspectorPanelEl) return;
      var body = inspectorPanelEl.querySelector(".inspector-body");
      var empty = projectTreeEmpty();
      setEmptyOverlayVisible(getInspectorProjectEmptyEl && getInspectorProjectEmptyEl(), empty);
      if (body) {
        body.hidden = empty;
        body.setAttribute("aria-hidden", empty ? "true" : "false");
      }
    }
    function updateEditorEmptyState() {
      var idle = editorCanvasIdle();
      setEmptyOverlayVisible(getEditorEmptyEl && getEditorEmptyEl(), idle);
      var mount2 = getEditorMount && getEditorMount();
      if (mount2) mount2.classList.toggle("is-inactive", idle);
      var runBtn = document.getElementById("btn-load");
      if (runBtn) runBtn.disabled = idle;
      var statusDot = document.getElementById("ide-status-dot");
      if (statusDot) statusDot.hidden = idle;
    }
    return {
      updateInspectorProjectEmpty,
      updateEditorEmptyState
    };
  }

  // js/app/app-side-panels.mjs
  function create2(opts) {
    var workspaceEl = opts.workspaceEl;
    var panels = opts.panels || {};
    var onLayout = opts.onLayout || function() {
    };
    var scheduleWorkspaceSave = opts.scheduleWorkspaceSave || function() {
    };
    function getOpenSidePanelId() {
      if (!workspaceEl) return null;
      var order2 = ["harpoon", "library", "inspector", "explorer"];
      for (var i = 0; i < order2.length; i++) {
        var id = order2[i];
        var cfg = panels[id];
        if (cfg && workspaceEl.classList.contains(cfg.openClass)) return id;
      }
      return null;
    }
    function setSidePanelOpen(id, open) {
      var cfg = panels[id];
      if (!workspaceEl || !cfg) return;
      workspaceEl.classList.toggle(cfg.openClass, open);
      if (cfg.btn) {
        cfg.btn.classList.toggle("is-active", open);
        cfg.btn.setAttribute("aria-pressed", open ? "true" : "false");
      }
      if (cfg.panel) cfg.panel.setAttribute("aria-hidden", open ? "false" : "true");
      if (typeof cfg.writeOpen === "function") cfg.writeOpen(open);
      if (typeof Persist !== "undefined" && Persist.writeStoredActiveSidePanel) {
        if (open) Persist.writeStoredActiveSidePanel(id);
        else if (!getOpenSidePanelId()) Persist.writeStoredActiveSidePanel(null);
      }
      scheduleWorkspaceSave();
    }
    function closeOtherSidePanels(id) {
      Object.keys(panels).forEach(function(otherId) {
        if (otherId !== id) setSidePanelOpen(otherId, false);
      });
    }
    function notifySidePanelLayout() {
      onLayout();
      window.dispatchEvent(new Event("resize"));
    }
    function toggleSidePanel(id) {
      var cfg = panels[id];
      if (!workspaceEl || !cfg) return false;
      var open = !workspaceEl.classList.contains(cfg.openClass);
      if (open) closeOtherSidePanels(id);
      setSidePanelOpen(id, open);
      notifySidePanelLayout();
      return open;
    }
    function wireSidebarOpenTooltip(btn) {
      if (!btn || typeof Tooltips === "undefined") return function() {
      };
      btn.addEventListener("mouseleave", function() {
        Tooltips.releaseAnchor(btn);
      });
      return function() {
        Tooltips.suppressAnchor(btn);
        Tooltips.hideImmediate();
      };
    }
    return {
      setSidePanelOpen,
      getOpenSidePanelId,
      closeOtherSidePanels,
      notifySidePanelLayout,
      toggleSidePanel,
      wireSidebarOpenTooltip
    };
  }

  // js/app/app-file-tabs.mjs
  function create3(opts) {
    var editorTabsEl = opts.editorTabsEl;
    var listOpenFiles = opts.listOpenFiles;
    var getActiveId = opts.getActiveId;
    var fileHasErrors = opts.fileHasErrors;
    var setTip = opts.setTip;
    var onSwitch = opts.onSwitch;
    var onClose = opts.onClose;
    var onNew = opts.onNew;
    function renderTabs() {
      if (!editorTabsEl) return;
      var files = listOpenFiles() || [];
      var activeId = getActiveId();
      editorTabsEl.innerHTML = "";
      files.forEach(function(file) {
        var tab = document.createElement("button");
        tab.type = "button";
        tab.role = "tab";
        tab.className = "editor-tab" + (file.id === activeId ? " is-active" : "") + (fileHasErrors(file.id) ? " has-errors" : "");
        tab.setAttribute("aria-selected", file.id === activeId ? "true" : "false");
        tab.setAttribute("data-file-id", file.id);
        var baseName = file.name.split("/").pop();
        tab.setAttribute("aria-label", baseName);
        var nameSpan = document.createElement("span");
        nameSpan.className = "editor-tab-name";
        nameSpan.textContent = baseName;
        if (typeof Tooltips !== "undefined") Tooltips.bindOverflow(nameSpan, function() {
          return baseName;
        });
        var closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "editor-tab-close";
        if (setTip) setTip(closeBtn, "Close");
        closeBtn.setAttribute("tabindex", "-1");
        closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
        closeBtn.addEventListener("click", function(e) {
          e.stopPropagation();
          onClose(file.id);
        });
        tab.appendChild(nameSpan);
        tab.appendChild(closeBtn);
        tab.addEventListener("click", function() {
          onSwitch(file.id);
        });
        editorTabsEl.appendChild(tab);
      });
      var newBtn = document.createElement("button");
      newBtn.type = "button";
      newBtn.className = "editor-tab-new";
      if (setTip) setTip(newBtn, "New file");
      newBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
      newBtn.addEventListener("click", function() {
        onNew();
      });
      editorTabsEl.appendChild(newBtn);
      var activeTab = editorTabsEl.querySelector(".editor-tab.is-active");
      if (activeTab) activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    return { renderTabs };
  }

  // js/app/app-suite-cfg.mjs
  function create4(deps) {
    var getEditor = deps.getEditor;
    var getPersist = deps.getPersist;
    var projectFileText = deps.projectFileText;
    var showToast = deps.showToast;
    var belFileHealth = deps.belFileHealth;
    var liveFileLint = deps.liveFileLint;
    var cfgTabLint = deps.cfgTabLint;
    var setTip = deps.setTip;
    var renderExplorerTree = deps.renderExplorerTree;
    var updateHeaderContext = deps.updateHeaderContext;
    var reloadActiveEditorFromPersist = deps.reloadActiveEditorFromPersist;
    var renderTabs = deps.renderTabs;
    var getLibraryController = deps.getLibraryController;
    function ensureProjectActiveCfgs() {
      if (typeof ProjectSource.inferActiveCfgByDir !== "function") return;
      if (typeof Persist.backfillActiveCfgByDir !== "function") return;
      const files = Persist.listFiles();
      const getText = (id) => projectFileText(id);
      Persist.backfillActiveCfgByDir(ProjectSource.inferActiveCfgByDir(files, getText));
    }
    function ensureActiveCfgForDir(dir) {
      if (Persist.getActiveCfgForDir(dir)) return;
      if (typeof ProjectSource.inferActiveCfgForDir !== "function") return;
      const files = Persist.listFiles();
      const path = ProjectSource.inferActiveCfgForDir(files, projectFileText, dir);
      if (path) Persist.setActiveCfgForDir(dir, path);
    }
    function activeCfgForDir(dir) {
      const path = Persist.getActiveCfgForDir(dir);
      if (!path) return null;
      return Persist.listFiles().some((f) => f.name === path) ? path : null;
    }
    function activeCfgsForDir(dir) {
      const names = new Set(Persist.listFiles().map((f) => f.name));
      return Persist.getActiveCfgsForDir(dir).filter((p) => names.has(p));
    }
    function suiteMembersResolver(all, cfgPath, gt) {
      return ProjectSource.orderedPathsForCfg(all, cfgPath, gt);
    }
    function suiteLayoutForDir(dir, filesInDir) {
      const SL = ExplorerSuiteLayout;
      if (!SL || typeof SL.computeDirLayout !== "function") {
        return { orderedFiles: filesInDir, suiteByFile: {} };
      }
      const active = activeCfgsForDir(dir);
      const allFiles = Persist.listFiles();
      const getText = projectFileText;
      return SL.computeDirLayout(filesInDir, active, suiteMembersResolver, allFiles, getText);
    }
    function owningActiveCfgForFile(fileName) {
      const dir = ProjectSource.dirOf(fileName);
      const activeCfgs = activeCfgsForDir(dir);
      if (!activeCfgs.length) return null;
      const files = Persist.listFiles();
      const getText = projectFileText;
      return ProjectSource.resolveOwningActiveCfg(files, fileName, getText, activeCfgs);
    }
    function reconcileActiveCfgsInDir(dir, editedCfg) {
      const active = activeCfgsForDir(dir);
      if (active.length < 2) return;
      const SL = ExplorerSuiteLayout;
      const files = Persist.listFiles();
      const getText = projectFileText;
      if (editedCfg && active.includes(editedCfg)) {
        const others = active.filter((c) => c !== editedCfg);
        if (SL.findCfgIntersection(editedCfg, others, files, getText, suiteMembersResolver).length) {
          Persist.removeActiveCfgForDir(dir, editedCfg);
          return;
        }
      }
      for (let i = 1; i < active.length; i++) {
        const cfg = active[i];
        const earlier = active.slice(0, i);
        if (SL.findCfgIntersection(cfg, earlier, files, getText, suiteMembersResolver).length) {
          Persist.removeActiveCfgForDir(dir, cfg);
        }
      }
    }
    function makeActiveCfgForFile(fileName) {
      const dir = ProjectSource.dirOf(fileName);
      const active = activeCfgsForDir(dir);
      const files = Persist.listFiles();
      const getText = projectFileText;
      const SL = ExplorerSuiteLayout;
      if (active.includes(fileName)) {
        Persist.removeActiveCfgForDir(dir, fileName);
      } else if (SL) {
        const check = SL.canActivateCfg(fileName, active, files, getText, suiteMembersResolver);
        if (!check.ok) {
          showToast(check.reason || "Cannot activate suite", { kind: "warn" });
          return;
        }
        Persist.addActiveCfgForDir(dir, fileName);
      } else {
        Persist.setActiveCfgForDir(dir, fileName);
      }
      const activeId = Persist.getActiveFileId();
      const activeFile = Persist.getFileById(activeId);
      if (getEditor()?.remoduleContext && activeFile && ProjectSource.dirOf(activeFile.name) === dir) {
        getEditor().remoduleContext();
      }
      renderExplorerTree();
      updateHeaderContext();
      updateRunButtonTooltip();
    }
    function moduleNameFor(fileId) {
      const files = Persist.listFiles();
      const getText = projectFileText;
      const id = fileId || Persist.getActiveFileId();
      const dev = ProjectSource.developmentForFile(files, id, getText);
      if (dev.kind !== "module" || !dev.cfg) return null;
      return dev.cfg.slice(dev.cfg.lastIndexOf("/") + 1).replace(/\.cfg$/i, "");
    }
    function activeSuiteMembership(fileName) {
      const cfg = owningActiveCfgForFile(fileName);
      if (!cfg) return { cfg: null, member: false, index: -1, count: 0 };
      const files = Persist.listFiles();
      const getText = projectFileText;
      const paths = ProjectSource.developmentFilesForCfg(files, cfg, getText).map((f) => f.name);
      const index = paths.indexOf(fileName);
      return { cfg, member: index !== -1, index, count: paths.length };
    }
    function cfgHasDanglingEntry(cfgName) {
      const files = Persist.listFiles();
      const cfgFile = files.find((f) => f.name === cfgName);
      if (!cfgFile) return false;
      const names = new Set(files.map((f) => f.name));
      const dir = ProjectSource.dirOf(cfgName);
      for (const entry of ProjectSource.parseCfg(projectFileText(cfgFile.id))) {
        if (!ProjectSource.isCfgEntryToken(entry)) continue;
        if (!names.has(dir ? dir + "/" + entry : entry)) return true;
      }
      return false;
    }
    function explorerFileDiag(fileId, fileName) {
      const low = String(fileName || "").toLowerCase();
      if (low.endsWith(".cfg")) {
        if (cfgHasDanglingEntry(fileName)) return "warning";
        const activeId = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
        const lint = fileId === activeId ? liveFileLint() : cfgTabLint.get(fileId);
        if (lint && lint.errors > 0) return "error";
        if (lint && lint.warnings > 0) return "warning";
        return null;
      }
      if (ProjectSource.isSignaturePath(fileName)) {
        const health = belFileHealth(fileId);
        if (health.errors > 0) return "error";
        if (health.warnings > 0) return "warning";
        return null;
      }
      return null;
    }
    function afterSuiteEdit(dir, editedCfg) {
      if (!editedCfg) {
        const activeFile2 = Persist.getFileById(Persist.getActiveFileId());
        if (activeFile2 && /\.cfg$/i.test(activeFile2.name) && ProjectSource.dirOf(activeFile2.name) === dir) {
          editedCfg = activeFile2.name;
        }
      }
      reconcileActiveCfgsInDir(dir, editedCfg);
      if (editedCfg && typeof BelEditor !== "undefined" && typeof BelEditor.invalidateFileHealthAfterChange === "function") {
        const cfgFile = Persist.listFiles().find((f) => f.name === editedCfg);
        if (cfgFile) BelEditor.invalidateFileHealthAfterChange(cfgFile.id);
      }
      const activeId = Persist.getActiveFileId();
      const activeFile = Persist.getFileById(activeId);
      if (getEditor()?.remoduleContext && activeFile && ProjectSource.dirOf(activeFile.name) === dir) {
        getEditor().remoduleContext();
      }
      reloadActiveEditorFromPersist();
      renderExplorerTree();
      renderTabs();
      updateHeaderContext();
      updateRunButtonTooltip();
      if (getLibraryController() && typeof getLibraryController().refresh === "function") {
        getLibraryController().refresh();
      }
    }
    function activeFileRecord() {
      const id = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
      return id ? Persist.getFileById(id) : null;
    }
    function updateRunButtonTooltip() {
      const btn = document.getElementById("btn-load");
      if (!btn) return;
      const file = activeFileRecord();
      if (file && /\.cfg$/i.test(file.name)) {
        setTip(btn, "Run suite");
      } else if (file && moduleNameFor(file.id)) {
        const hasPrelude = !!(ProjectSource.buildPrelude && ProjectSource.buildPrelude(Persist.listFiles(), file.id, projectFileText));
        setTip(btn, hasPrelude ? "Run suite to here\nCtrl+click: run suite" : "Run\nCtrl+click: run suite");
      } else {
        setTip(btn, "Run");
      }
    }
    return {
      ensureProjectActiveCfgs,
      ensureActiveCfgForDir,
      activeCfgForDir,
      activeCfgsForDir,
      suiteMembersResolver,
      suiteLayoutForDir,
      owningActiveCfgForFile,
      reconcileActiveCfgsInDir,
      makeActiveCfgForFile,
      moduleNameFor,
      activeSuiteMembership,
      cfgHasDanglingEntry,
      explorerFileDiag,
      afterSuiteEdit,
      activeFileRecord,
      updateRunButtonTooltip
    };
  }

  // js/app/app-upload-import.mjs
  function create5(deps) {
    var getEditor = deps.getEditor;
    var setEditor = deps.setEditor;
    var getPersist = deps.getPersist;
    var setPersist = deps.setPersist;
    var showToast = deps.showToast;
    var projectFileText = deps.projectFileText;
    var switchToFile = deps.switchToFile;
    var switchProjectAndReload = deps.switchProjectAndReload;
    var ensureEditorMatchesFileKind = deps.ensureEditorMatchesFileKind;
    var updateEditorEmptyState = deps.updateEditorEmptyState;
    var renderTabs = deps.renderTabs;
    var renderExplorerTree = deps.renderExplorerTree;
    var updateHeaderContext = deps.updateHeaderContext;
    var updateRunButtonTooltip = deps.updateRunButtonTooltip;
    var enterEmptyProjectView = deps.enterEmptyProjectView;
    var enterCanvasIdleView = deps.enterCanvasIdleView;
    var projectIsEmpty = deps.projectIsEmpty;
    var onCfgContentChange = deps.onCfgContentChange;
    var cfgTabLint = deps.cfgTabLint;
    const fileInputEl = document.createElement("input");
    fileInputEl.type = "file";
    fileInputEl.accept = ".bel";
    fileInputEl.style.display = "none";
    fileInputEl.multiple = true;
    document.body.appendChild(fileInputEl);
    fileInputEl.addEventListener("change", async () => {
      const files = Array.from(fileInputEl.files || []);
      fileInputEl.value = "";
      if (!getPersist()) return;
      const entries = [];
      for (const file of files) {
        entries.push({ name: file.name, text: await file.text() });
      }
      const result = await resolveAndApplyUpload(entries, { openTabs: true });
      if (result === null) return;
      if (result.replaced > 0 && result.added === 0) {
        showToast("Replaced existing file.", { kind: "success" });
      } else if (result.added > 0) {
        showToast(
          "Added " + result.added + " file" + (result.added === 1 ? "" : "s") + " to the project.",
          { kind: "success" }
        );
      }
    });
    function relPathFromPickerFile(file, opts) {
      const rel = file.webkitRelativePath || file.name;
      const parts = rel.split("/");
      if (opts && opts.stripRoot && parts.length > 1) return parts.slice(1).join("/");
      return rel;
    }
    function projectEntriesFromRawEntries(rawEntries) {
      const belEntries = [];
      const elfEntries = [];
      const cfgEntries = [];
      for (const entry of rawEntries) {
        if (ProjectSource.isCfgPath(entry.name)) cfgEntries.push(entry);
        else if (ProjectSource.isElfPath(entry.name)) elfEntries.push(entry);
        else if (ProjectSource.isBelPath(entry.name)) belEntries.push(entry);
      }
      const belPaths = belEntries.map((e) => e.name);
      const sigPaths = belPaths.concat(elfEntries.map((e) => e.name));
      const cfgByDir = {};
      for (const entry of cfgEntries) {
        const dir = ProjectSource.dirOf(entry.name);
        const base = entry.name.slice(entry.name.lastIndexOf("/") + 1);
        if (!cfgByDir[dir]) cfgByDir[dir] = {};
        cfgByDir[dir][base] = entry.text;
      }
      const byPath = new Map([...belEntries, ...elfEntries, ...cfgEntries].map((e) => [e.name, e]));
      const orderedSig = typeof ProjectSource.orderSignaturePaths === "function" ? ProjectSource.orderSignaturePaths(sigPaths, cfgByDir) : sigPaths.slice().sort();
      const projectEntries = orderedSig.map((p) => byPath.get(p)).filter(Boolean);
      for (const cfg of cfgEntries) projectEntries.push(cfg);
      return { projectEntries, belCount: belPaths.length, sigCount: sigPaths.length };
    }
    async function projectEntriesFromPickerFiles(all, opts) {
      const rawEntries = [];
      for (const file of all) {
        const low = file.name.toLowerCase();
        if (!ProjectSource.isProjectSourcePath(file.name)) continue;
        rawEntries.push({ name: relPathFromPickerFile(file, opts), text: await file.text() });
      }
      return projectEntriesFromRawEntries(rawEntries);
    }
    async function exportLibraryAsNewProject(payload) {
      if (!getPersist() || !payload) return;
      const { projectEntries } = projectEntriesFromRawEntries(payload.entries || []);
      if (!projectEntries.length) {
        showToast("No files to export.", { kind: "warn" });
        return;
      }
      let projName = payload.defaultName || Persist.DEFAULT_PROJECT_NAME;
      projName = await NamePrompt.open({
        ariaLabel: "Export as new project",
        message: "New project",
        value: projName,
        normalize: NamePrompt.defaultNormalize,
        validate: (n) => n ? null : "Name is required.",
        confirmLabel: "Create"
      });
      if (projName === null) return;
      const tmpFiles = projectEntries.map((e, i) => ({ id: "tmp-" + i, name: e.name }));
      const tmpText = (id) => projectEntries[Number(id.slice(4))]?.text ?? "";
      const activeCfgByDir = typeof ProjectSource.inferActiveCfgByDir === "function" ? ProjectSource.inferActiveCfgByDir(tmpFiles, tmpText) : null;
      let activePath = payload.activeRelPath || null;
      if (!activePath) {
        const orderedBel = projectEntries.filter((e) => ProjectSource.isBelPath(e.name)).map((e) => e.name);
        activePath = orderedBel[0] || projectEntries.find((e) => ProjectSource.isSignaturePath(e.name))?.name || projectEntries.find((e) => ProjectSource.isCfgPath(e.name))?.name || null;
      }
      switchProjectAndReload(() => {
        Persist.createProjectWithFiles(projName, projectEntries, {
          projectName: projName,
          activeCfgByDir: activeCfgByDir || void 0
        });
        if (activePath) {
          const created = Persist.listFiles().find((f) => f.name === activePath);
          if (created) Persist.setActiveFileId(created.id);
        }
      });
    }
    function applyFileReplacement(id, text) {
      if (!id || text == null) return;
      const activeId = getPersist() ? getPersist().getCurrentFileId() : null;
      const registryActiveId = Persist.getActiveFileId();
      const isActive = !!(getEditor() && getPersist() && (id === activeId || id === registryActiveId));
      if (isActive && getPersist().cancelPendingSave) getPersist().cancelPendingSave();
      Persist.setFileText(id, text);
      if (!isActive) return;
      const stored = Persist.getFileText(id);
      if (stored == null) return;
      if (getPersist().replaceEditorText) getPersist().replaceEditorText(stored);
      if (getEditor().setValueNonUndoable) getEditor().setValueNonUndoable(stored);
      else getEditor().setValue(stored);
      ensureEditorMatchesFileKind();
      const file = Persist.getFileById(id);
      if (file && /\.cfg$/i.test(file.name) && typeof getEditor().refreshLint === "function") {
        getEditor().refreshLint();
      }
    }
    function deleteProjectFilesById(ids) {
      const unique = [...new Set(ids)];
      if (!unique.length) return;
      const currentId = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
      if (currentId && unique.includes(currentId)) {
        const openIds = Persist.getOpenFileIds().filter((x) => !unique.includes(x));
        const files = Persist.listFiles();
        const fallback = openIds[0] || (files.find((f) => !unique.includes(f.id)) || {}).id;
        if (fallback) switchToFile(fallback);
      }
      for (const id of unique) {
        Persist.deleteFile(id);
        cfgTabLint.delete(id);
      }
      if (getPersist()) {
        const cur = getPersist().getCurrentFileId();
        if (cur && unique.includes(cur) && !Persist.getFileById(cur)) {
          const open = Persist.getOpenFileIds().find((openId) => Persist.getFileById(openId));
          if (open) switchToFile(open);
          else if (projectIsEmpty()) enterEmptyProjectView();
          else enterCanvasIdleView();
        }
      }
      if (projectIsEmpty()) enterEmptyProjectView();
    }
    function executeUploadPlan(plan, options) {
      if (!plan) return { added: 0, replaced: 0 };
      const H = typeof EditHistory !== "undefined" ? EditHistory : null;
      const run2 = () => executeUploadPlanInner(plan, options || {});
      if (H && typeof H.transact === "function") {
        const r = H.transact("file-batch", run2);
        return r.ok ? r.result || { added: 0, replaced: 0 } : { added: 0, replaced: 0 };
      }
      return run2();
    }
    function executeUploadPlanInner(plan, options) {
      let added = 0;
      let replaced = 0;
      let lastCreatedId = null;
      let switchedActiveId = null;
      for (const folder of plan.replaceFolder || []) {
        const deleteSet = new Set(folder.deleteIds || []);
        const reopenPaths = [];
        const activeId = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
        const activePath = activeId ? (Persist.getFileById(activeId) || {}).name : null;
        for (const openId of Persist.getOpenFileIds()) {
          if (!deleteSet.has(openId)) continue;
          const f = Persist.getFileById(openId);
          if (f) reopenPaths.push(f.name);
        }
        deleteProjectFilesById(folder.deleteIds || []);
        for (const entry of folder.entries || []) {
          const id = Persist.createFile(entry.name);
          Persist.setFileText(id, entry.text);
          added += 1;
          lastCreatedId = id;
          if (options.openTabs) Persist.openFile(id);
          if (activePath && entry.name === activePath) switchedActiveId = id;
        }
        for (const path of reopenPaths) {
          const f = Persist.listFiles().find((x) => x.name === path);
          if (f) Persist.openFile(f.id);
        }
        replaced += 1;
      }
      for (const item of plan.replace || []) {
        applyFileReplacement(item.id, item.text);
        replaced += 1;
      }
      for (const entry of plan.create || []) {
        const id = Persist.createFile(entry.name);
        Persist.setFileText(id, entry.text);
        added += 1;
        lastCreatedId = id;
        if (options.openTabs) Persist.openFile(id);
      }
      if (switchedActiveId) switchToFile(switchedActiveId);
      else if (options.openTabs && lastCreatedId) switchToFile(lastCreatedId);
      else reloadActiveEditorFromPersist();
      updateEditorEmptyState();
      renderTabs();
      renderExplorerTree();
      updateHeaderContext();
      return { added, replaced };
    }
    async function resolveAndApplyUpload(entries, options) {
      if (!entries.length) return null;
      const existing = Persist.listFiles();
      const conflicts = NameConflicts.detectUploadConflicts(existing, entries, {
        folderBatchRoots: options.folderBatchRoots != null ? options.folderBatchRoots : []
      });
      let resolutions = [];
      if (conflicts.length) {
        resolutions = await ConflictDialog.resolveConflicts(conflicts);
        if (resolutions === null) return null;
      }
      const plan = NameConflicts.applyResolutions(existing, entries, conflicts, resolutions);
      if (!plan) return null;
      return executeUploadPlan(plan, options);
    }
    function reloadActiveEditorFromPersist() {
      if (!getPersist() || !getEditor()) return;
      const id = getPersist().getCurrentFileId();
      if (!id) return;
      const file = Persist.getFileById(id);
      if (!file) {
        const fallback = Persist.getOpenFileIds().find((openId) => Persist.getFileById(openId));
        if (fallback) switchToFile(fallback);
        else if (!projectIsEmpty()) enterCanvasIdleView();
        return;
      }
      const stored = Persist.getFileText(id);
      if (stored == null) return;
      const live = getEditor().getValue();
      if (live === stored) return;
      if (getPersist().cancelPendingSave) getPersist().cancelPendingSave();
      if (getPersist().replaceEditorText) getPersist().replaceEditorText(stored);
      if (getEditor().setValueNonUndoable) getEditor().setValueNonUndoable(stored);
      else getEditor().setValue(stored);
      ensureEditorMatchesFileKind();
      if (file && /\.cfg$/i.test(file.name) && typeof getEditor().refreshLint === "function") {
        getEditor().refreshLint();
      }
    }
    function syncCfgEditorsAfterRewrite(fileIds) {
      if (!fileIds || !fileIds.length) return;
      const activeId = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
      let touchedActiveCfg = false;
      for (let i = 0; i < fileIds.length; i++) {
        const id = fileIds[i];
        const stored = Persist.getFileText(id);
        if (stored == null) continue;
        if (id === activeId && getEditor()) {
          const live = getEditor().getValue();
          if (live !== stored) {
            getEditor().setValue(stored);
            if (getPersist()) getPersist().scheduleEditorPersist(stored);
            touchedActiveCfg = true;
          }
        }
      }
      if (touchedActiveCfg) {
        ensureEditorMatchesFileKind();
        if (getEditor() && typeof getEditor().refreshLint === "function") getEditor().refreshLint();
        const activeFile = Persist.getFileById(activeId);
        if (activeFile && /\.cfg$/i.test(activeFile.name)) {
          onCfgContentChange(activeFile.name);
          return;
        }
      }
      renderExplorerTree();
      updateHeaderContext();
      updateRunButtonTooltip();
    }
    function applyMovePlan(plan) {
      if (!plan || !getPersist()) return;
      const moves = [];
      const recordMove = (id, to) => {
        const f = Persist.getFileById(id);
        if (f) moves.push({ from: f.name, to });
        Persist.renameFile(id, to);
      };
      for (const folder of plan.replaceFolder || []) {
        deleteProjectFilesById(folder.deleteIds || []);
        for (const r of folder.renames || []) recordMove(r.id, r.to);
      }
      for (const rep of plan.replaces || []) {
        applyFileReplacement(rep.targetId, rep.text);
        deleteProjectFilesById([rep.deleteId]);
      }
      for (const r of plan.renames || []) recordMove(r.id, r.to);
      Persist.preserveEmptyFoldersAfterMoves(moves);
      reloadActiveEditorFromPersist();
      renderTabs();
      renderExplorerTree();
      updateHeaderContext();
    }
    async function resolveAndApplyMove(payload, dropTarget) {
      if (!getPersist()) return;
      const existing = Persist.listFiles();
      const empty = Persist.listEmptyFolders();
      const getText = projectFileText;
      const moves = NameConflicts.computeMoveTargets(existing, payload, dropTarget, getText);
      const emptyMoves = NameConflicts.computeEmptyFolderMoves(existing, payload, dropTarget, empty);
      if (!moves.length) {
        if (!emptyMoves.length) return;
        for (const m of emptyMoves) Persist.renameEmptyFolderPrefix(m.from, m.to);
        renderExplorerTree();
        updateHeaderContext();
        return;
      }
      let plan;
      {
        const conflicts = NameConflicts.detectMoveConflicts(existing, moves, {
          moveKind: payload.kind,
          folderPaths: payload.folderPaths
        });
        let resolutions = [];
        if (conflicts.length) {
          resolutions = await ConflictDialog.resolveConflicts(conflicts, { context: "move" });
          if (resolutions === null) return;
        }
        plan = NameConflicts.applyMoveResolutions(existing, moves, conflicts, resolutions);
      }
      if (!plan) return;
      applyMovePlan(plan);
      for (const m of emptyMoves) Persist.renameEmptyFolderPrefix(m.from, m.to);
      if (emptyMoves.length) renderExplorerTree();
    }
    const uploadFolderInputEl = document.createElement("input");
    uploadFolderInputEl.type = "file";
    uploadFolderInputEl.webkitdirectory = true;
    uploadFolderInputEl.style.display = "none";
    document.body.appendChild(uploadFolderInputEl);
    uploadFolderInputEl.addEventListener("change", async () => {
      const all = Array.from(uploadFolderInputEl.files || []);
      uploadFolderInputEl.value = "";
      if (!getPersist()) return;
      const { projectEntries, belCount } = await projectEntriesFromPickerFiles(all);
      if (!belCount) {
        showToast("No .bel files in that folder.", { kind: "warn" });
        return;
      }
      const result = await resolveAndApplyUpload(projectEntries, {
        openTabs: false,
        folderBatchRoots: typeof NameConflicts.uploadFolderBatchRoots === "function" ? NameConflicts.uploadFolderBatchRoots(projectEntries) : []
      });
      if (result === null) return;
      const nAdded = result.added;
      if (nAdded > 0) {
        showToast(
          "Added " + nAdded + " file" + (nAdded === 1 ? "" : "s") + " to the project.",
          { kind: "success" }
        );
      } else if (result.replaced > 0) {
        showToast("Updated existing project files.", { kind: "success" });
      }
    });
    const folderInputEl = document.createElement("input");
    folderInputEl.type = "file";
    folderInputEl.webkitdirectory = true;
    folderInputEl.style.display = "none";
    document.body.appendChild(folderInputEl);
    folderInputEl.addEventListener("change", async () => {
      const all = Array.from(folderInputEl.files || []);
      folderInputEl.value = "";
      if (!getPersist()) return;
      const { projectEntries, belCount } = await projectEntriesFromPickerFiles(all, { stripRoot: true });
      if (!belCount) {
        showToast("No .bel files in that folder.", { kind: "warn" });
        return;
      }
      const rootName = all[0] && all[0].webkitRelativePath ? all[0].webkitRelativePath.split("/")[0] : "Imported";
      const orderedPaths = projectEntries.filter((e) => ProjectSource.isBelPath(e.name)).map((e) => e.name);
      const firstBel = orderedPaths.length ? orderedPaths[0] : null;
      const tmpFiles = projectEntries.map((e, i) => ({ id: "tmp-" + i, name: e.name }));
      const tmpText = (id) => projectEntries[Number(id.slice(4))]?.text ?? "";
      const activeCfgByDir = typeof ProjectSource.inferActiveCfgByDir === "function" ? ProjectSource.inferActiveCfgByDir(tmpFiles, tmpText) : null;
      switchProjectAndReload(() => {
        Persist.createProjectWithFiles(rootName, projectEntries, {
          projectName: rootName,
          activeCfgByDir: activeCfgByDir || void 0
        });
        if (firstBel) {
          const created = Persist.listFiles().find((f) => f.name === firstBel);
          if (created) Persist.setActiveFileId(created.id);
        }
      });
    });
    function baseName(path) {
      const s = String(path || "");
      const i = s.lastIndexOf("/");
      return i === -1 ? s : s.slice(i + 1);
    }
    function relativeUnderPrefix(fullPath, prefix) {
      const path = String(fullPath || "");
      const root = String(prefix || "");
      if (!root) return path;
      if (path === root) return "";
      if (path.indexOf(root + "/") === 0) return path.slice(root.length + 1);
      return path;
    }
    function downloadFileById(fileId) {
      if (!fileId) return;
      const file = Persist.getFileById(fileId);
      if (!file) return;
      const text = typeof projectFileText === "function" ? projectFileText(fileId) : Persist.getFileText(fileId) || "";
      DownloadZip.downloadTextFile(text, baseName(file.name) || "download.bel");
    }
    function downloadCurrentFile() {
      const id = Persist.getActiveFileId && Persist.getActiveFileId();
      if (id) downloadFileById(id);
    }
    function downloadFolder(folderPath) {
      if (!folderPath) return;
      const allFiles = Persist.listFiles() || [];
      const under = NameConflicts.filesUnderPrefix(allFiles, folderPath);
      const emptyFolders = Persist.listEmptyFolders ? Persist.listEmptyFolders() : [];
      const emptyUnder = NameConflicts.emptyFoldersUnderPrefix(emptyFolders, folderPath);
      const dirSet = /* @__PURE__ */ new Set();
      const entries = [];
      const enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
      for (let i = 0; i < under.length; i++) {
        const file = under[i];
        const rel = relativeUnderPrefix(file.name, folderPath);
        if (!rel) continue;
        const text = typeof projectFileText === "function" ? projectFileText(file.id) : Persist.getFileText(file.id) || "";
        entries.push({
          path: rel,
          data: enc ? enc.encode(text) : text
        });
        const parts = rel.split("/");
        for (let d = 1; d < parts.length; d++) {
          dirSet.add(parts.slice(0, d).join("/"));
        }
      }
      for (let j = 0; j < emptyUnder.length; j++) {
        const relDir = relativeUnderPrefix(emptyUnder[j], folderPath);
        if (relDir) dirSet.add(relDir);
      }
      dirSet.forEach((dirPath) => {
        const coveredByFile = entries.some((e) => e.path.indexOf(dirPath + "/") === 0);
        if (!coveredByFile) entries.push({ path: dirPath + "/", directory: true });
      });
      entries.sort((a, b) => String(a.path).localeCompare(String(b.path)));
      DownloadZip.downloadZip(entries, (baseName(folderPath) || "folder") + ".zip");
    }
    function suiteStem(cfgPath) {
      return String(baseName(cfgPath) || "suite").replace(/\.cfg$/i, "") || "suite";
    }
    function suiteMemberPaths(cfgPath, cfgText) {
      const PS = ProjectSource;
      if (!PS || typeof PS.parseCfg !== "function") return [];
      const dir = PS.dirOf(cfgPath);
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      const entries = PS.parseCfg(cfgText);
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (typeof PS.isCfgEntryToken === "function" && !PS.isCfgEntryToken(entry)) continue;
        const full = dir ? dir + "/" + entry : entry;
        if (seen.has(full)) continue;
        seen.add(full);
        out.push({ entry, full });
      }
      return out;
    }
    function suiteDownloadState(cfgFileId) {
      if (!cfgFileId) {
        return { ok: false, reason: "Suite unavailable." };
      }
      const cfgFile = Persist.getFileById(cfgFileId);
      if (!cfgFile || !/\.cfg$/i.test(String(cfgFile.name))) {
        return { ok: false, reason: "Not a suite .cfg file." };
      }
      const allFiles = Persist.listFiles() || [];
      const byName = new Map(allFiles.map((f) => [f.name, f]));
      const cfgText = typeof projectFileText === "function" ? projectFileText(cfgFileId) : Persist.getFileText(cfgFileId) || "";
      if (typeof ExplorerSuiteLayout.cfgHasDanglingEntry === "function") {
        if (ExplorerSuiteLayout.cfgHasDanglingEntry(allFiles, cfgFile.name, projectFileText)) {
          return { ok: false, reason: "A listed suite file is missing from the project." };
        }
      } else {
        const members2 = suiteMemberPaths(cfgFile.name, cfgText);
        for (let i = 0; i < members2.length; i++) {
          if (!byName.has(members2[i].full)) {
            return { ok: false, reason: "A listed suite file is missing from the project." };
          }
        }
      }
      const stem = suiteStem(cfgFile.name);
      const members = suiteMemberPaths(cfgFile.name, cfgText);
      const pack = [];
      const enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
      pack.push({
        path: stem + "/" + baseName(cfgFile.name),
        data: enc ? enc.encode(cfgText) : cfgText
      });
      for (let j = 0; j < members.length; j++) {
        const mem = members[j];
        const file = byName.get(mem.full);
        if (!file) continue;
        const text = typeof projectFileText === "function" ? projectFileText(file.id) : Persist.getFileText(file.id) || "";
        pack.push({
          path: stem + "/" + mem.entry.replace(/\\/g, "/"),
          data: enc ? enc.encode(text) : text
        });
      }
      return { ok: true, zipName: stem + ".zip", entries: pack };
    }
    function downloadSuite(cfgFileId) {
      const state = suiteDownloadState(cfgFileId);
      if (!state.ok) return;
      DownloadZip.downloadZip(state.entries, state.zipName);
    }
    return {
      fileInputEl,
      relPathFromPickerFile,
      projectEntriesFromRawEntries,
      projectEntriesFromPickerFiles,
      exportLibraryAsNewProject,
      applyFileReplacement,
      deleteProjectFilesById,
      executeUploadPlan,
      resolveAndApplyUpload,
      reloadActiveEditorFromPersist,
      syncCfgEditorsAfterRewrite,
      applyMovePlan,
      resolveAndApplyMove,
      uploadFolderInputEl,
      folderInputEl,
      downloadCurrentFile,
      downloadFileById,
      downloadFolder,
      downloadSuite,
      suiteDownloadState
    };
  }

  // js/app/app-file-lifecycle.mjs
  function create6(deps) {
    var getEditor = deps.getEditor;
    var setEditor = deps.setEditor;
    var getPersist = deps.getPersist;
    var mountEditorFor = deps.mountEditorFor;
    var ensurePersistForFile = deps.ensurePersistForFile;
    var syncEditorCmTheme = deps.syncEditorCmTheme;
    var updateEditorEmptyState = deps.updateEditorEmptyState;
    var renderTabs = deps.renderTabs;
    var renderExplorerTree = deps.renderExplorerTree;
    var updateHeaderContext = deps.updateHeaderContext;
    var updateRunButtonTooltip = deps.updateRunButtonTooltip;
    var notifyActiveEditorView = deps.notifyActiveEditorView;
    var refreshInspector = deps.refreshInspector;
    var refreshExplorerActiveAndDiags = deps.refreshExplorerActiveAndDiags;
    var scheduleTabLintStyles = deps.scheduleTabLintStyles;
    var liveFileLint = deps.liveFileLint;
    var rememberCfgLint = deps.rememberCfgLint;
    var cfgTabLint = deps.cfgTabLint;
    var ensureActiveCfgForDir = deps.ensureActiveCfgForDir;
    var showToast = deps.showToast;
    var projectIsEmpty = deps.projectIsEmpty;
    var enterCanvasIdleView = deps.enterCanvasIdleView;
    var enterEmptyProjectView = deps.enterEmptyProjectView;
    var deleteProjectFilesById = deps.deleteProjectFilesById;
    var getExplorerController = deps.getExplorerController;
    var syncCfgEditorsAfterRewrite = deps.syncCfgEditorsAfterRewrite;
    var refPeekRestore = null;
    function resolveLineOffset(line) {
      var ed = getEditor();
      var view = ed && typeof ed.getView === "function" ? ed.getView() : null;
      var doc = view && view.state ? view.state.doc : null;
      if (!doc || !doc.lines || !Number.isFinite(line)) return null;
      var n = Math.min(Math.max(1, Math.floor(line)), doc.lines);
      return doc.line(n).from;
    }
    function withResolvedOffset(jumpAt) {
      if (!jumpAt || jumpAt.from != null) return jumpAt;
      var at = resolveLineOffset(jumpAt.line);
      if (at == null) return jumpAt;
      return Object.assign({}, jumpAt, { from: at, to: at });
    }
    function applyEditorJump(jumpAt) {
      if (!getEditor() || !jumpAt) return false;
      jumpAt = withResolvedOffset(jumpAt);
      if (jumpAt.from == null) return false;
      if (typeof getEditor().jumpToReference === "function" && jumpAt.name) {
        return getEditor().jumpToReference(jumpAt, jumpAt.name);
      }
      if (typeof getEditor().jumpToRange === "function") {
        return getEditor().jumpToRange(jumpAt);
      }
      return false;
    }
    function switchToFile(id, openOpts) {
      if (!id) return;
      ensurePersistForFile(id);
      if (!getPersist()) return;
      if (!getEditor()) {
        Persist.openFile(id);
        Persist.setActiveFileId(id);
        const curId = getPersist().getCurrentFileId();
        const snapshot2 = curId === id ? getPersist().getInitialCheckpoint() : getPersist().switchFile(id);
        setEditor(mountEditorFor(snapshot2, openOpts));
        syncEditorCmTheme();
        if (typeof BelugaClient !== "undefined" && BelugaClient.noteEditorChange) {
          BelugaClient.noteEditorChange(getEditor() ? getEditor().getValue() : "");
        }
        updateEditorEmptyState();
        if (getEditor()) getEditor().focus();
        renderTabs();
        renderExplorerTree();
        updateHeaderContext();
        updateRunButtonTooltip();
        notifyActiveEditorView();
        refreshInspector();
        return;
      }
      const keepSelection = openOpts && openOpts.keepSelection;
      const shouldClearSelection = !keepSelection && !(getExplorerController() && getExplorerController().shouldKeepSelectionOnOpen && getExplorerController().shouldKeepSelectionOnOpen());
      const peekAt = openOpts && openOpts.peekAt;
      const jumpAt = openOpts && openOpts.jumpAt;
      const initialLocal = openOpts && openOpts.initialLocal;
      Persist.openFile(id);
      const editorDocId = typeof getEditor().getDocumentId === "function" ? getEditor().getDocumentId() : null;
      const persistId = getPersist().getCurrentFileId();
      if (id === persistId && editorDocId === id) {
        Persist.setActiveFileId(id);
        renderTabs();
        if (peekAt && getEditor() && typeof getEditor().peekRange === "function") getEditor().peekRange(peekAt);
        else if (jumpAt) applyEditorJump(jumpAt);
        else if (initialLocal != null && getEditor() && typeof getEditor().applyViewport === "function") {
          getEditor().applyViewport(initialLocal);
        } else if (shouldClearSelection && getExplorerController() && getExplorerController().clearSelection) {
          getExplorerController().clearSelection();
        }
        refreshExplorerActiveAndDiags();
        notifyActiveEditorView();
        return;
      }
      {
        const file = Persist.getFileById(id);
        if (file) ensureActiveCfgForDir(ProjectSource.dirOf(file.name));
      }
      const leavingId = getPersist().getCurrentFileId();
      const leavingFile = Persist.getFileById(leavingId);
      const snap = liveFileLint();
      const lintItems = getEditor() && typeof getEditor().getLintTooltipItems === "function" ? getEditor().getLintTooltipItems() : null;
      if (snap && leavingFile && /\.cfg$/i.test(leavingFile.name)) {
        rememberCfgLint(leavingId, { ...snap, items: lintItems });
      }
      WorkspaceState.flushWorkspace();
      if (getEditor() && typeof getEditor().cancelRename === "function") getEditor().cancelRename();
      const snapshot = getPersist().switchFile(id);
      Persist.setActiveFileId(id);
      getEditor().destroy();
      setEditor(mountEditorFor(snapshot, {
        jumpAt,
        initialLocal: initialLocal != null ? initialLocal : snapshot ? snapshot.editor.local : null
      }));
      syncEditorCmTheme();
      if (typeof BelugaClient !== "undefined" && BelugaClient.noteEditorChange) {
        BelugaClient.noteEditorChange(getEditor() ? getEditor().getValue() : "");
      }
      if (getEditor()) getEditor().focus();
      renderTabs();
      if (shouldClearSelection && getExplorerController() && getExplorerController().clearSelection) {
        getExplorerController().clearSelection();
      }
      refreshExplorerActiveAndDiags();
      updateHeaderContext();
      updateRunButtonTooltip();
      scheduleTabLintStyles();
      notifyActiveEditorView();
      refreshInspector();
      requestAnimationFrame(() => {
        if (peekAt) {
          if (getEditor() && typeof getEditor().peekRange === "function") getEditor().peekRange(peekAt);
        } else if (jumpAt) {
          if (!applyEditorJump(jumpAt) && getEditor() && typeof getEditor().restoreViewport === "function") {
            getEditor().restoreViewport();
          }
        }
      });
    }
    window.belJarSwitchToFileForHistory = function(id) {
      switchToFile(id);
    };
    function resyncEditorAfterHistory() {
      if (!getPersist()) return false;
      const mounted2 = getEditor() && typeof getEditor().getDocumentId === "function" ? getEditor().getDocumentId() : null;
      const mountedIsGone = !!mounted2 && !Persist.getFileById(mounted2);
      if (projectIsEmpty()) {
        if (mounted2 || getEditor()) enterEmptyProjectView();
        return true;
      }
      let target = Persist.getActiveFileId();
      if (!target || !Persist.getFileById(target)) {
        target = Persist.getOpenFileIds().find((id) => Persist.getFileById(id)) || (Persist.listFiles()[0] || {}).id || null;
      }
      if (!target) {
        enterCanvasIdleView();
        return true;
      }
      if (!mountedIsGone && mounted2 === target && getPersist().getCurrentFileId() === target) {
        return false;
      }
      switchToFile(target);
      return true;
    }
    window.addEventListener("beljar:edit-history-applied", function() {
      resyncEditorAfterHistory();
      renderTabs();
      if (typeof renderExplorerTree === "function") renderExplorerTree();
      refreshExplorerActiveAndDiags();
      updateHeaderContext();
    });
    window.addEventListener("beljar:project-tree-changed", function() {
      if (!getPersist() || !getEditor()) return;
      const mounted2 = typeof getEditor().getDocumentId === "function" ? getEditor().getDocumentId() : null;
      if (!mounted2 || Persist.getFileById(mounted2)) return;
      resyncEditorAfterHistory();
    });
    function captureRefPeekRestore() {
      if (!getEditor() || !getPersist()) return null;
      const local = typeof getEditor().getViewport === "function" ? getEditor().getViewport() : getPersist().getEditorLocal();
      return { fileId: getPersist().getCurrentFileId(), local };
    }
    function beginRefPeekSession() {
      if (!refPeekRestore) refPeekRestore = captureRefPeekRestore();
    }
    function endRefPeekSession() {
      const snap = refPeekRestore;
      refPeekRestore = null;
      if (!snap || !getPersist()) return;
      const currentId = getPersist().getCurrentFileId();
      if (currentId === snap.fileId) {
        if (getEditor() && typeof getEditor().applyViewport === "function") {
          getEditor().applyViewport(snap.local);
        }
        return;
      }
      switchToFile(snap.fileId, { initialLocal: snap.local, keepSelection: true });
    }
    function peekFileAt(fileId, opts) {
      if (!getPersist() || !fileId || opts.from == null) return;
      opts = opts || {};
      beginRefPeekSession();
      const peekAt = {
        from: opts.from,
        to: opts.to,
        line: opts.line,
        col: opts.col,
        name: opts.name
      };
      const currentId = getPersist().getCurrentFileId();
      if (currentId === fileId) {
        if (getEditor() && typeof getEditor().peekRange === "function") getEditor().peekRange(peekAt);
        return;
      }
      switchToFile(fileId, { peekAt, keepSelection: true });
    }
    function openFileAt(fileId, from, to, opts) {
      opts = opts || {};
      if (from == null && !Number.isFinite(opts.line)) return;
      if (typeof BelEditor !== "undefined" && typeof BelEditor.logJumpRequest === "function") {
        BelEditor.logJumpRequest({
          fileId,
          from,
          to,
          line: opts.line,
          col: opts.col,
          phase: "openFileAt"
        });
      } else {
        console.warn("[bel-jar:jump] openFileAt (BelEditor.logJumpRequest missing)", { fileId, from, to });
      }
      const jumpAt = {
        from,
        to: to != null ? to : from,
        line: opts.line,
        col: opts.col,
        name: opts.name
      };
      const editorDocId = getEditor() && typeof getEditor().getDocumentId === "function" ? getEditor().getDocumentId() : getPersist() ? getPersist().getCurrentFileId() : null;
      const needSwitch = editorDocId !== fileId;
      if (needSwitch) {
        switchToFile(fileId, { jumpAt });
        return;
      }
      if (!getEditor()) return;
      const at = withResolvedOffset(jumpAt);
      if (at.from == null) return;
      if (typeof getEditor().jumpToReference === "function" && opts.name) {
        getEditor().jumpToReference(at, opts.name);
      } else if (typeof getEditor().jumpToRange === "function") {
        getEditor().jumpToRange(at);
        if (typeof BelEditor !== "undefined" && typeof BelEditor.logJumpResult === "function" && typeof getEditor().getView === "function") {
          const v = getEditor().getView();
          if (v) requestAnimationFrame(() => BelEditor.logJumpResult(v, at));
        }
      } else if (typeof getEditor().scheduleJumpToRange === "function") {
        getEditor().scheduleJumpToRange(at);
      }
      notifyActiveEditorView();
    }
    window.addEventListener("beljar:open-file-at", (ev) => {
      const d = ev.detail || {};
      if (d.fileId) {
        refPeekRestore = null;
        openFileAt(d.fileId, d.from, d.to, d);
      }
    });
    window.addEventListener("beljar:peek-file-at", (ev) => {
      const d = ev.detail || {};
      if (d.fileId) peekFileAt(d.fileId, d);
    });
    window.addEventListener("beljar:end-ref-peek", () => {
      endRefPeekSession();
    });
    window.addEventListener("beljar:cfg-rewritten", (ev) => {
      const ids = ev && ev.detail && ev.detail.fileIds;
      syncCfgEditorsAfterRewrite(ids);
    });
    async function newFile(name) {
      var baseName = name;
      if (!baseName) {
        var def = "untitled.bel";
        var stemEnd = 8;
        {
          def = ExplorerInlineName.suggestDefaultFileName("", Persist.listFiles());
          var dot = def.lastIndexOf(".");
          stemEnd = dot > 0 ? dot : def.length;
        }
        baseName = await NamePrompt.open({
          ariaLabel: "New file",
          message: "New file",
          value: def,
          selection: { start: 0, end: stemEnd },
          mono: true,
          normalize: NamePrompt.normalizeBelFileName,
          validate: function(n) {
            if (!n) return "Name is required.";
            if (NameConflicts.nameConflict(Persist.listFiles(), n)) {
              return "A file with that name already exists in this folder.";
            }
            return null;
          },
          confirmLabel: "Create"
        });
      }
      if (!baseName) return;
      if (NameConflicts.nameConflict(Persist.listFiles(), baseName)) {
        showToast("A file with that name already exists in this folder.", { kind: "warn" });
        return;
      }
      const id = Persist.createFile(baseName);
      switchToFile(id);
    }
    function closeFile(id) {
      const openIds = Persist.getOpenFileIds();
      if (!openIds.includes(id)) return;
      if (openIds.length <= 1) {
        Persist.closeOpenFile(id);
        enterCanvasIdleView();
        return;
      }
      if (getPersist() && getPersist().getCurrentFileId() === id) {
        const idx = openIds.indexOf(id);
        const neighborId = openIds[idx - 1] || openIds[idx + 1];
        if (neighborId) switchToFile(neighborId);
      }
      Persist.closeOpenFile(id);
      renderTabs();
    }
    function deleteFileInteractive(id) {
      deleteFilesInteractive([id]);
    }
    async function deleteFilesInteractive(ids) {
      const unique = [...new Set((ids || []).filter(Boolean))];
      if (!unique.length) return;
      const files = Persist.listFiles();
      const names = unique.map((id) => Persist.getFileById(id)).filter(Boolean).map((f) => f.name);
      if (!names.length) return;
      const deletingAll = unique.length >= files.length;
      const confirmOpts = unique.length === 1 ? {
        subject: names[0],
        message: "Remove this file from the project?",
        ariaLabel: "Delete file"
      } : deletingAll ? {
        message: "Remove every file from the project?",
        ariaLabel: "Delete all files"
      } : {
        message: "Remove " + unique.length + " files from the project?",
        ariaLabel: "Delete files"
      };
      if (!await ConfirmDialog.confirm(confirmOpts)) return;
      const H = typeof EditHistory !== "undefined" ? EditHistory : null;
      const performDelete = function() {
        if (getPersist() && unique.includes(getPersist().getCurrentFileId())) {
          const fallback = Persist.getOpenFileIds().find((x) => !unique.includes(x)) || (files.find((f) => !unique.includes(f.id)) || {}).id;
          if (fallback) switchToFile(fallback);
        }
        for (const id of unique) {
          Persist.deleteFile(id);
          cfgTabLint.delete(id);
        }
        if (getExplorerController() && getExplorerController().clearSelection) getExplorerController().clearSelection();
        if (projectIsEmpty()) {
          enterEmptyProjectView();
          return;
        }
        renderTabs();
        renderExplorerTree();
        updateHeaderContext();
      };
      if (H && typeof H.transact === "function") H.transact("file-delete", performDelete);
      else performDelete();
    }
    function closeTabsForFiles(ids) {
      const unique = [...new Set((ids || []).filter(Boolean))];
      const openIds = Persist.getOpenFileIds();
      const targets = unique.filter((id) => openIds.includes(id));
      if (!targets.length) return;
      if (targets.length >= openIds.length) {
        for (const id of targets) Persist.closeOpenFile(id);
        enterCanvasIdleView();
        return;
      }
      for (const id of targets) closeFile(id);
    }
    function selectionDeleteFileIds(fileIds, folderPaths) {
      const ids = new Set(fileIds || []);
      for (const folderPath of folderPaths || []) {
        for (const file of filesUnderFolder(folderPath)) ids.add(file.id);
      }
      return [...ids];
    }
    function selectionDeleteDisabled(fileIds, folderPaths) {
      return !selectionDeleteFileIds(fileIds, folderPaths).length;
    }
    function deleteSelectionInteractive(fileIds, folderPaths) {
      deleteFilesInteractive(selectionDeleteFileIds(fileIds, folderPaths));
      if (folderPaths && folderPaths.length) {
        for (const folderPath of folderPaths) {
          Persist.pruneEmptyFoldersUnder(folderPath);
        }
        renderExplorerTree();
      }
    }
    function filesUnderFolder(folderPath) {
      const allFiles = Persist.listFiles();
      {
        return NameConflicts.filesUnderPrefix(allFiles, folderPath);
      }
      return allFiles.filter(
        (f) => f.name === folderPath || f.name.startsWith(folderPath + "/")
      );
    }
    async function deleteFolderInteractive(folderPath) {
      const IL = ExplorerInlineName;
      const label = IL ? IL.lastSegment(folderPath) : folderPath;
      const allFiles = Persist.listFiles();
      const under = filesUnderFolder(folderPath);
      const emptyUnder = Persist.listEmptyFolders().filter(
        (p) => p === folderPath || p.startsWith(folderPath + "/")
      );
      if (!under.length && !emptyUnder.length) return;
      const deletingAll = under.length >= allFiles.length && allFiles.length > 0;
      const confirmOpts = under.length ? {
        subject: label,
        message: deletingAll ? "Remove this folder and all " + under.length + " file" + (under.length === 1 ? "" : "s") + "?" : "Remove this folder and " + under.length + " file" + (under.length === 1 ? "" : "s") + " inside it?",
        ariaLabel: "Delete folder"
      } : {
        subject: label,
        message: "Remove this empty folder?",
        ariaLabel: "Delete folder"
      };
      if (!await ConfirmDialog.confirm(confirmOpts)) return;
      deleteProjectFilesById(under.map((f) => f.id));
      Persist.pruneEmptyFoldersUnder(folderPath);
      if (projectIsEmpty()) {
        enterEmptyProjectView();
        return;
      }
      renderTabs();
      renderExplorerTree();
      updateHeaderContext();
    }
    return {
      applyEditorJump,
      switchToFile,
      captureRefPeekRestore,
      beginRefPeekSession,
      endRefPeekSession,
      peekFileAt,
      openFileAt,
      newFile,
      closeFile,
      deleteFileInteractive,
      deleteFilesInteractive,
      closeTabsForFiles,
      selectionDeleteFileIds,
      selectionDeleteDisabled,
      deleteSelectionInteractive,
      filesUnderFolder,
      deleteFolderInteractive
    };
  }

  // js/app/app-explorer-bootstrap.mjs
  var projectTreeListenerBound = false;
  function create7(deps) {
    var getEditor = deps.getEditor;
    var getPersist = deps.getPersist;
    var projectFileText = deps.projectFileText;
    var showToast = deps.showToast;
    var setTip = deps.setTip;
    var explorerPanelEl = deps.explorerPanelEl;
    var libraryPanelEl = deps.libraryPanelEl;
    var inspectorPanelEl = deps.inspectorPanelEl;
    var inspectorProjectEmptyEl = deps.inspectorProjectEmptyEl;
    var renderTabs = deps.renderTabs;
    var updateHeaderContext = deps.updateHeaderContext;
    var updateRunButtonTooltip = deps.updateRunButtonTooltip;
    var reloadActiveEditorFromPersist = deps.reloadActiveEditorFromPersist;
    var switchToFile = deps.switchToFile;
    var ensureEditorMatchesFileKind = deps.ensureEditorMatchesFileKind;
    var activeCfgForDir = deps.activeCfgForDir;
    var activeCfgsForDir = deps.activeCfgsForDir;
    var suiteLayoutForDir = deps.suiteLayoutForDir;
    var explorerFileDiag = deps.explorerFileDiag;
    var bindExplorerDiagTip = deps.bindExplorerDiagTip;
    var makeActiveCfgForFile = deps.makeActiveCfgForFile;
    var fileContextItems = deps.fileContextItems;
    var explorerSelectionContextItems = deps.explorerSelectionContextItems;
    var explorerFolderContextItems = deps.explorerFolderContextItems;
    var backgroundRunItems = deps.backgroundRunItems;
    var resolveAndApplyMove = deps.resolveAndApplyMove;
    var afterSuiteEdit = deps.afterSuiteEdit;
    var applyFileReplacement = deps.applyFileReplacement;
    var executeUploadPlan = deps.executeUploadPlan;
    var exportLibraryAsNewProject = deps.exportLibraryAsNewProject;
    var projectTreeEmpty = deps.projectTreeEmpty;
    var updateInspectorProjectEmpty = deps.updateInspectorProjectEmpty;
    var getWorkspaceBootPending = deps.getWorkspaceBootPending;
    var restoreWorkspaceForFile = deps.restoreWorkspaceForFile;
    var explorerController = null;
    var explorerSearchController = null;
    var libraryController = null;
    function renameFolderPrefix(from, to) {
      if (!from || from === to) return;
      const files = Persist.listFiles();
      const moves = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.name !== from && !f.name.startsWith(from + "/")) continue;
        const rel = f.name === from ? "" : f.name.slice(from.length + 1);
        const newPath = to ? rel ? to + "/" + rel : to : rel;
        if (newPath !== f.name) {
          moves.push({ from: f.name, to: newPath });
          Persist.renameFile(f.id, newPath);
        }
      }
      Persist.preserveEmptyFoldersAfterMoves(moves);
      reloadActiveEditorFromPersist();
      Persist.renameEmptyFolderPrefix(from, to);
      renderTabs();
      updateHeaderContext();
    }
    function handleExplorerInlineCancel(session) {
      if (!session || session.mode !== "create") return;
      if (session.kind === "file") {
        Persist.deleteFile(session.fileId);
        renderTabs();
        updateHeaderContext();
      } else if (session.kind === "folder") {
        Persist.removeEmptyFolder(session.folderPath);
      }
    }
    function handleExplorerInlineCommit(session, rawName) {
      const IL = ExplorerInlineName;
      if (!IL) return false;
      const files = Persist.listFiles();
      const empty = Persist.listEmptyFolders();
      if (session.kind === "file") {
        const file = Persist.getFileById(session.fileId);
        if (!file) return false;
        const parentDir = session.mode === "rename" ? ProjectSource.dirOf(file.name) : session.parentDir;
        const result = IL.validateFileCommit(
          rawName,
          parentDir,
          files,
          session.fileId
        );
        if (!result.ok) {
          showToast(result.error, { kind: "warn" });
          return false;
        }
        if (result.fullPath !== file.name) {
          Persist.renameFile(session.fileId, result.fullPath);
          if (session.fileId === Persist.getActiveFileId()) {
            ensureEditorMatchesFileKind();
          }
        }
        if (session.mode === "create") switchToFile(session.fileId);
        else {
          renderTabs();
          updateHeaderContext();
        }
        return true;
      }
      if (session.kind === "folder") {
        const parentDir = session.mode === "rename" ? IL.parentDir(session.folderPath) : session.parentDir;
        const result = IL.validateFolderCommit(
          rawName,
          parentDir,
          files,
          empty,
          session.folderPath
        );
        if (!result.ok) {
          showToast(result.error, { kind: "warn" });
          return false;
        }
        if (session.mode === "create") {
          if (result.fullPath !== session.folderPath) {
            Persist.removeEmptyFolder(session.folderPath);
            Persist.addEmptyFolder(result.fullPath);
          }
        } else if (result.fullPath !== session.folderPath) {
          renameFolderPrefix(session.folderPath, result.fullPath);
        }
        return true;
      }
      return false;
    }
    function startExplorerCreateFile(parentDir) {
      ensureExplorer();
      if (!explorerController) return;
      const IL = ExplorerInlineName;
      const files = Persist.listFiles();
      const fullPath = IL.suggestDefaultFileName(parentDir, files);
      const id = Persist.createFile(fullPath);
      explorerController.beginInlineName({
        kind: "file",
        mode: "create",
        parentDir,
        fileId: id,
        folderPath: null,
        displayName: IL.lastSegment(fullPath),
        originalPath: fullPath
      });
    }
    function startExplorerCreateFolder(parentDir) {
      ensureExplorer();
      if (!explorerController) return;
      const IL = ExplorerInlineName;
      const files = Persist.listFiles();
      const empty = Persist.listEmptyFolders();
      const fullPath = IL.suggestDefaultFolderName(parentDir, files, empty);
      Persist.addEmptyFolder(fullPath);
      explorerController.beginInlineName({
        kind: "folder",
        mode: "create",
        parentDir,
        folderPath: fullPath,
        displayName: IL.lastSegment(fullPath),
        originalPath: fullPath
      });
    }
    function explorerCreateMenuItems(parentDir) {
      return [
        { label: "New file", onSelect: () => startExplorerCreateFile(parentDir) },
        { label: "New folder", onSelect: () => startExplorerCreateFolder(parentDir) },
        { type: "separator" }
      ];
    }
    function renameFolderInteractive(folderPath) {
      ensureExplorer();
      if (!explorerController) return;
      const IL = ExplorerInlineName;
      explorerController.beginInlineName({
        kind: "folder",
        mode: "rename",
        parentDir: IL.parentDir(folderPath),
        folderPath,
        displayName: IL.lastSegment(folderPath),
        originalPath: folderPath
      });
    }
    function ensureExplorer() {
      if (explorerController) return;
      const treeEl = explorerPanelEl && explorerPanelEl.querySelector(".explorer-tree");
      if (!treeEl) return;
      explorerController = Explorer.init({
        container: treeEl,
        listFiles: () => Persist.listFiles(),
        listEmptyFolders: () => Persist.listEmptyFolders(),
        getActiveId: () => {
          const open = Persist.getOpenFileIds();
          if (!open.length) return null;
          const cur = getPersist() ? getPersist().getCurrentFileId() : null;
          if (cur && open.includes(cur)) return cur;
          const active = Persist.getActiveFileId();
          if (active && open.includes(active)) return active;
          return open[open.length - 1] || null;
        },
        getActiveCfgForDir: activeCfgForDir,
        getActiveCfgsForDir: activeCfgsForDir,
        getSuiteLayoutForDir: suiteLayoutForDir,
        getFileDiag: explorerFileDiag,
        bindFileDiagTip: bindExplorerDiagTip,
        getProjectName: () => Persist.getProjectName(),
        applyTip: (el, tip) => setTip(el, tip, { ariaLabel: false }),
        getFileContextItems: (fileId) => fileContextItems(fileId),
        getSelectionContextItems: (selection) => explorerSelectionContextItems(selection),
        getFolderContextItems: (folderPath) => explorerFolderContextItems(folderPath),
        getBackgroundContextItems: () => backgroundRunItems(),
        onOpenFile: (id, openOpts) => switchToFile(id, openOpts),
        onMakeActiveCfg: makeActiveCfgForFile,
        onRefresh: updateRunButtonTooltip,
        onInlineCommit: handleExplorerInlineCommit,
        onInlineCancel: handleExplorerInlineCancel,
        canDrop: (payload, target) => {
          return NameConflicts.canDropMove(
            payload,
            target,
            Persist.listFiles(),
            Persist.listEmptyFolders()
          );
        },
        onDrop: (payload, target) => {
          resolveAndApplyMove(payload, target);
        }
      });
      ensureExplorerSearch();
    }
    function ensureExplorerSearch() {
      if (explorerSearchController) return;
      if (!explorerPanelEl) return;
      const wrap = explorerPanelEl.querySelector("#explorer-search-wrap");
      const input = explorerPanelEl.querySelector("#explorer-search-input");
      const ac = explorerPanelEl.querySelector("#explorer-search-ac");
      if (!wrap || !input || !ac) return;
      explorerSearchController = ExplorerSearch.init({
        wrap,
        input,
        ac,
        header: wrap.closest(".panel-header"),
        listFiles: () => Persist.listFiles(),
        getFileText: projectFileText,
        onOpenFile: (id) => switchToFile(id)
      });
    }
    function ensureLibrary() {
      if (libraryController) return;
      const treeEl = libraryPanelEl && libraryPanelEl.querySelector(".library-tree");
      const searchEl = document.getElementById("library-search");
      if (!treeEl) return;
      libraryController = Library.init({
        container: treeEl,
        searchEl,
        listFiles: () => Persist.listFiles(),
        getActiveCfgForDir: activeCfgForDir,
        listActiveSuites: () => LibrarySuites.listActiveSuites({
          listFiles: () => Persist.listFiles(),
          getActiveCfgsForDir: activeCfgsForDir,
          getActiveCfgForDir: activeCfgForDir
        }),
        getActiveFileId: () => getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId(),
        getEditor: () => getEditor(),
        applyTip: (el, tip) => setTip(el, tip, { ariaLabel: false }),
        showToast,
        afterSuiteEdit,
        applyFileReplacement: (id, text) => applyFileReplacement(id, text),
        applyUploadPlan: (plan) => executeUploadPlan(plan, { openTabs: false }),
        onProjectChanged: ({ modifiedActive } = {}) => {
          renderTabs();
          renderExplorerTree();
          updateHeaderContext();
          if (modifiedActive) reloadActiveEditorFromPersist();
        },
        onExportAsNewProject: (payload) => {
          exportLibraryAsNewProject(payload);
        }
      });
    }
    function renderExplorerTree() {
      ensureExplorer();
      if (explorerController) explorerController.refresh();
      else updateRunButtonTooltip();
    }
    if (!projectTreeListenerBound && typeof window !== "undefined") {
      projectTreeListenerBound = true;
      window.addEventListener("beljar:project-tree-changed", function() {
        renderExplorerTree();
      });
    }
    function refreshExplorerActiveAndDiags() {
      ensureExplorer();
      if (explorerController?.refreshActiveAndDiags) explorerController.refreshActiveAndDiags();
      else if (explorerController?.refreshDiags) explorerController.refreshDiags();
    }
    function refreshInspector(detail) {
      if (projectTreeEmpty()) {
        updateInspectorProjectEmpty();
        return;
      }
      if (inspectorProjectEmptyEl) inspectorProjectEmptyEl.hidden = true;
      const body = inspectorPanelEl?.querySelector(".inspector-body");
      if (body) body.hidden = false;
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("beljar:inspector-refresh", { detail: detail || {} })));
    }
    function notifyActiveEditorView() {
      if (!getEditor() || typeof getEditor().getView !== "function") return;
      const view = getEditor().getView();
      if (!view?.dom?.isConnected) return;
      window.dispatchEvent(new CustomEvent("beljar:active-editor-view", { detail: { view } }));
      const fileId = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
      if (!getWorkspaceBootPending()) {
        requestAnimationFrame(() => restoreWorkspaceForFile(fileId));
      }
    }
    return {
      renameFolderPrefix,
      handleExplorerInlineCancel,
      handleExplorerInlineCommit,
      startExplorerCreateFile,
      startExplorerCreateFolder,
      explorerCreateMenuItems,
      renameFolderInteractive,
      ensureExplorer,
      ensureExplorerSearch,
      ensureLibrary,
      renderExplorerTree,
      refreshExplorerActiveAndDiags,
      refreshInspector,
      notifyActiveEditorView,
      getExplorerController: function() {
        return explorerController;
      },
      getLibraryController: function() {
        return libraryController;
      }
    };
  }

  // js/app/app-menus.mjs
  function create8(deps) {
    var getEditor = deps.getEditor;
    var getPersist = deps.getPersist;
    var newProject = deps.newProject;
    var newFile = deps.newFile;
    var buildSwitchProjectSubmenu = deps.buildSwitchProjectSubmenu;
    var buildDeleteProjectSubmenu = deps.buildDeleteProjectSubmenu;
    var normalizeProjectRenameName = deps.normalizeProjectRenameName;
    var validateProjectRenameName = deps.validateProjectRenameName;
    var applyProjectRename = deps.applyProjectRename;
    var fileInputEl = deps.fileInputEl;
    var uploadFolderInputEl = deps.uploadFolderInputEl;
    var folderInputEl = deps.folderInputEl;
    var downloadCurrentFile = deps.downloadCurrentFile;
    var downloadFileById = deps.downloadFileById;
    var downloadFolder = deps.downloadFolder;
    var downloadSuite = deps.downloadSuite;
    var suiteDownloadState = deps.suiteDownloadState;
    var deleteFileInteractive = deps.deleteFileInteractive;
    var closeFile = deps.closeFile;
    var closeTabsForFiles = deps.closeTabsForFiles;
    var selectionDeleteFileIds = deps.selectionDeleteFileIds;
    var selectionDeleteDisabled = deps.selectionDeleteDisabled;
    var deleteSelectionInteractive = deps.deleteSelectionInteractive;
    var deleteFolderInteractive = deps.deleteFolderInteractive;
    var renameFolderInteractive = deps.renameFolderInteractive;
    var explorerCreateMenuItems = deps.explorerCreateMenuItems;
    var makeActiveCfgForFile = deps.makeActiveCfgForFile;
    var moduleNameFor = deps.moduleNameFor;
    var activeSuiteMembership = deps.activeSuiteMembership;
    var activeCfgsForDir = deps.activeCfgsForDir;
    var afterSuiteEdit = deps.afterSuiteEdit;
    var renderTabs = deps.renderTabs;
    var showToast = deps.showToast;
    var ensureExplorer = deps.ensureExplorer;
    var getExplorerController = deps.getExplorerController;
    var editorTabsEl = deps.editorTabsEl;
    var projectFileText = deps.projectFileText;
    function wireMenuTrigger(btn, menuOpts) {
      if (!btn) return;
      let suppressNextClick = false;
      function setOpen(open) {
        btn.classList.toggle("is-active", open);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      }
      function runMenuInteraction() {
        if (typeof Menu !== "undefined" && Menu.isOpen() && Menu.rootAnchor() === btn) {
          Menu.closeAll();
          return;
        }
        if (typeof Menu === "undefined") return;
        const items = typeof menuOpts.items === "function" ? menuOpts.items() : menuOpts.items;
        Menu.open({
          anchor: btn,
          side: menuOpts.side,
          align: menuOpts.align,
          items,
          onClose: () => setOpen(false)
        });
        setOpen(true);
      }
      btn.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        suppressNextClick = true;
        if (typeof Tooltips !== "undefined") {
          Tooltips.suppressAnchor(btn);
          Tooltips.hide();
        }
        runMenuInteraction();
      });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (suppressNextClick) {
          suppressNextClick = false;
          return;
        }
        if (typeof Tooltips !== "undefined") {
          Tooltips.suppressAnchor(btn);
          Tooltips.hide();
        }
        runMenuInteraction();
      });
    }
    function signatureFileCount() {
      const files = Persist.listFiles() || [];
      return files.filter((f) => ProjectSource.isSignaturePath(String(f.name || ""))).length;
    }
    function buildProjectMenuItems() {
      const currentId = getPersist() ? getPersist().getCurrentFileId() : null;
      const currentFile = currentId ? Persist.getFileById(currentId) : null;
      const switchSubmenu = buildSwitchProjectSubmenu();
      const deleteSubmenu = buildDeleteProjectSubmenu();
      return [
        {
          label: "New project",
          onSelect: () => newProject()
        },
        ...switchSubmenu ? [{ label: "Switch project", submenu: switchSubmenu }] : [],
        {
          label: "Rename project\u2026",
          onSelect: async () => {
            const cur = Persist.getProjectName();
            const next = await NamePrompt.open({
              ariaLabel: "Rename project",
              message: "Rename project",
              value: cur,
              normalize: normalizeProjectRenameName,
              validate: validateProjectRenameName,
              confirmLabel: "Save"
            });
            if (!next) return;
            applyProjectRename(next);
          }
        },
        ...deleteSubmenu ? [{ label: "Delete project", submenu: deleteSubmenu }] : [],
        { type: "separator" },
        {
          label: "New file",
          onSelect: () => newFile()
        },
        {
          label: "Upload file",
          onSelect: () => fileInputEl.click()
        },
        {
          label: "Upload folder",
          onSelect: () => uploadFolderInputEl.click()
        },
        {
          label: "Import folder as new project",
          onSelect: () => folderInputEl.click()
        },
        { type: "separator" },
        {
          label: 'Download "' + (currentFile ? currentFile.name : "file") + '"',
          onSelect: downloadCurrentFile
        },
        { type: "separator" },
        {
          label: "Rename file\u2026",
          disabled: !currentFile,
          onSelect: () => {
            if (currentId) renameFileInteractive(currentId);
          }
        },
        {
          label: "Delete file\u2026",
          disabled: !currentFile,
          onSelect: () => {
            if (currentId) deleteFileInteractive(currentId);
          }
        },
        { type: "separator" },
        {
          label: "Run project",
          disabled: signatureFileCount() <= 1,
          onSelect: () => {
            if (BelugaRun.runProject) {
              BelugaRun.runProject();
            }
          }
        }
      ];
    }
    function renameFileInteractive(id) {
      const file = Persist.getFileById(id);
      if (!file) return;
      ensureExplorer();
      if (!getExplorerController()) return;
      const IL = ExplorerInlineName;
      getExplorerController().beginInlineName({
        kind: "file",
        mode: "rename",
        parentDir: ProjectSource.dirOf(file.name),
        fileId: id,
        displayName: IL.lastSegment(file.name),
        originalPath: file.name
      });
    }
    function explorerSelectionContextItems(selection) {
      const fileIds = selection && selection.fileIds ? selection.fileIds : [];
      const folderPaths = selection && selection.folderPaths ? selection.folderPaths : [];
      const total = fileIds.length + folderPaths.length;
      if (total <= 1) {
        if (fileIds.length === 1) return fileContextItems(fileIds[0]);
        if (folderPaths.length === 1) return explorerFolderContextItems(folderPaths[0]);
        return null;
      }
      const items = [];
      const deleteCount = selectionDeleteFileIds(fileIds, folderPaths).length;
      if (deleteCount > 0) {
        items.push({
          label: deleteCount === 1 ? "Delete file\u2026" : `Delete ${deleteCount} files\u2026`,
          disabled: selectionDeleteDisabled(fileIds, folderPaths),
          onSelect: () => deleteSelectionInteractive(fileIds, folderPaths)
        });
      }
      const openIds = Persist.getOpenFileIds();
      const openSelected = fileIds.filter((id) => openIds.includes(id));
      if (openSelected.length) {
        items.push({
          label: openSelected.length === 1 ? "Close tab" : `Close ${openSelected.length} tabs`,
          onSelect: () => closeTabsForFiles(openSelected)
        });
      }
      return items;
    }
    function fileContextItems(fileId, opts) {
      const fromTab = !!(opts && opts.fromTab);
      const files = Persist.listFiles();
      const file = files.find((f) => f.id === fileId);
      if (!file) return [];
      const parentDir = ProjectSource.dirOf(file.name);
      const manage = [
        { label: "Rename\u2026", onSelect: () => renameFileInteractive(fileId) },
        {
          label: "Download",
          onSelect: () => downloadFileById(fileId)
        }
      ];
      if (file.name.toLowerCase().endsWith(".cfg")) {
        const suiteState = typeof suiteDownloadState === "function" ? suiteDownloadState(fileId) : { ok: false, reason: "Suite download unavailable." };
        manage.push({
          label: "Download suite",
          disabled: !suiteState.ok,
          tooltip: suiteState.ok ? void 0 : suiteState.reason || "A listed suite file is missing from the project.",
          onSelect: () => downloadSuite(fileId)
        });
      }
      const run2 = [];
      const suiteEdit = [];
      const low = file.name.toLowerCase();
      const Run = BelugaRun;
      if (low.endsWith(".cfg")) {
        if (Persist.getActiveCfgsForDir(ProjectSource.dirOf(file.name)).includes(file.name)) {
          run2.push({
            label: "Deactivate suite",
            onSelect: () => {
              makeActiveCfgForFile(file.name);
              renderTabs();
            }
          });
        } else {
          run2.push({
            label: "Make active suite",
            onSelect: () => {
              makeActiveCfgForFile(file.name);
              renderTabs();
            }
          });
        }
        if (Run && Run.runModuleCfg) {
          run2.push({ label: "Run suite", onSelect: () => Run.runModuleCfg(file.name) });
        }
      } else if (Run && ProjectSource.isSignaturePath(file.name)) {
        run2.push({ label: "Run file", onSelect: () => Run.runFile(fileId) });
        const moduleName = moduleNameFor(fileId);
        const { cfg, member, index, count } = activeSuiteMembership(file.name);
        if (moduleName) {
          if (member && index > 0) {
            run2.push({ label: "Run suite to here", onSelect: () => Run.runToHere(fileId) });
          }
          run2.push({ label: "Run suite", onSelect: () => Run.runModule(fileId) });
        }
        const dir = ProjectSource.dirOf(file.name);
        if (cfg && member) {
          if (index > 0) {
            suiteEdit.push({ label: "Move up in suite", onSelect: () => {
              Persist.moveEntryInCfg(cfg, file.name, -1);
              afterSuiteEdit(dir, cfg);
            } });
          }
          if (index < count - 1) {
            suiteEdit.push({ label: "Move down in suite", onSelect: () => {
              Persist.moveEntryInCfg(cfg, file.name, 1);
              afterSuiteEdit(dir, cfg);
            } });
          }
          suiteEdit.push({ label: "Remove from suite", onSelect: () => {
            Persist.removeEntryFromCfg(cfg, file.name);
            afterSuiteEdit(dir, cfg);
          } });
        } else {
          const activeCfgs = activeCfgsForDir(dir);
          if (activeCfgs.length === 1) {
            suiteEdit.push({ label: "Add to active suite", onSelect: () => {
              Persist.addEntryToCfg(activeCfgs[0], file.name);
              afterSuiteEdit(dir, activeCfgs[0]);
            } });
          } else {
            for (const c of activeCfgs) {
              const base = c.slice(c.lastIndexOf("/") + 1);
              suiteEdit.push({ label: "Add to " + base, onSelect: () => {
                Persist.addEntryToCfg(c, file.name);
                afterSuiteEdit(dir, c);
              } });
            }
          }
        }
      }
      const openIds = Persist.getOpenFileIds();
      const tabIdx = openIds.indexOf(fileId);
      const tabsToRight = tabIdx >= 0 ? openIds.slice(tabIdx + 1) : [];
      const destroy = [
        {
          label: "Close tab",
          disabled: tabIdx === -1,
          onSelect: () => closeFile(fileId)
        }
      ];
      if (fromTab) {
        destroy.push({
          label: "Close all to the right",
          disabled: tabsToRight.length === 0,
          onSelect: () => closeTabsForFiles(tabsToRight)
        });
      }
      destroy.push({
        label: "Delete file\u2026",
        onSelect: () => deleteFileInteractive(fileId)
      });
      const blocks = fromTab ? [manage] : [explorerCreateMenuItems(parentDir), manage];
      if (run2.length) blocks.push(run2);
      if (suiteEdit.length) blocks.push(suiteEdit);
      blocks.push(destroy);
      const out = [];
      for (let i = 0; i < blocks.length; i++) {
        const body = [];
        for (let j = 0; j < blocks[i].length; j++) {
          const item = blocks[i][j];
          if (item.type === "separator") continue;
          body.push(item);
        }
        if (!body.length) continue;
        if (out.length) out.push({ type: "separator" });
        for (let k = 0; k < body.length; k++) out.push(body[k]);
      }
      return out;
    }
    function explorerFolderContextItems(folderPath) {
      const create10 = explorerCreateMenuItems(folderPath);
      const rename = [
        { label: "Rename\u2026", onSelect: () => renameFolderInteractive(folderPath) },
        {
          label: "Download folder",
          onSelect: () => downloadFolder(folderPath)
        },
        { type: "separator" }
      ];
      const destroy = [
        {
          label: "Delete folder\u2026",
          onSelect: () => deleteFolderInteractive(folderPath)
        },
        { type: "separator" }
      ];
      const run2 = folderRunItems(folderPath);
      const runBlock = run2.length ? run2.concat([{ type: "separator" }]) : [];
      return create10.concat(rename).concat(destroy).concat(runBlock);
    }
    function folderRunItems(folderPath) {
      const files = Persist.listFiles() || [];
      const dirOf = ProjectSource.dirOf;
      const hasRunnable = files.some(
        (f) => dirOf(f.name) === folderPath && ProjectSource.isSignaturePath(String(f.name))
      );
      if (!hasRunnable) return [];
      const cfg = files.find((f) => /\.cfg$/i.test(String(f.name)) && dirOf(f.name) === folderPath);
      return [{
        label: cfg ? "Run suite" : "Run folder",
        onSelect: () => BelugaRun.runFolder(folderPath)
      }];
    }
    function backgroundRunItems() {
      const create10 = explorerCreateMenuItems("");
      if (signatureFileCount() < 1) return create10;
      return create10.concat([
        { label: "Run project", onSelect: () => BelugaRun.runProject() },
        { type: "separator" }
      ]);
    }
    if (typeof Menu !== "undefined") {
      const contextItemsFromEvent = (e) => {
        const el = e.target.closest("[data-file-id]");
        return el ? fileContextItems(el.getAttribute("data-file-id"), { fromTab: true }) : [];
      };
      if (editorTabsEl) Menu.bindContextMenu(editorTabsEl, contextItemsFromEvent);
    }
    function editorExec(cmd) {
      if (!getEditor() || typeof getEditor()[cmd] !== "function") return;
      getEditor().focus();
      getEditor()[cmd]();
    }
    function editorClipboard(action) {
      if (!getEditor()) return;
      getEditor().focus();
      try {
        document.execCommand(action);
      } catch (_) {
      }
    }
    function formatCurrentFile() {
      const ed = getEditor();
      if (!ed || typeof ed.format !== "function") return;
      ed.focus();
      ed.format();
    }
    function formatProjectFiles() {
      const files = (Persist.listFiles() || []).filter(
        (f) => ProjectSource.isSignaturePath(String(f.name || ""))
      );
      if (!files.length) {
        showToast("No Beluga source files to format.", { kind: "warn" });
        return;
      }
      const formatOffline = typeof BelEditor !== "undefined" && typeof BelEditor.formatSource === "function" ? BelEditor.formatSource : null;
      if (!formatOffline) {
        showToast("Formatter is not available.", { kind: "error" });
        return;
      }
      const ed = getEditor();
      const persist = getPersist();
      if (persist && typeof persist.flushCheckpoint === "function") persist.flushCheckpoint();
      else if (ed && typeof ed.flushCheckpoint === "function") ed.flushCheckpoint();
      const liveId = ed && typeof ed.getCurrentFileId === "function" ? ed.getCurrentFileId() : null;
      const applyFormatted = (id, next) => {
        if (ed && id === liveId) {
          const view = typeof ed.getView === "function" ? ed.getView() : null;
          const sel = view && view.state ? view.state.selection.main : null;
          const head = sel ? Math.min(sel.head, next.length) : next.length;
          if (typeof ed.replaceDocumentNonUndoable === "function") {
            ed.replaceDocumentNonUndoable(next, {
              selection: { anchor: head, head },
              userEvent: "format"
            });
          } else if (typeof ed.setValueNonUndoable === "function") {
            ed.setValueNonUndoable(next);
          } else if (typeof ed.setValue === "function") {
            ed.setValue(next);
          }
          const applied = typeof ed.getValue === "function" ? ed.getValue() : next;
          if (persist && typeof persist.replaceEditorText === "function") persist.replaceEditorText(applied);
          if (persist && typeof persist.flushCheckpoint === "function") persist.flushCheckpoint();
          else Persist.setFileText(id, applied);
          return;
        }
        Persist.setFileText(id, next);
      };
      const run2 = () => {
        let changed2 = 0;
        let refused2 = 0;
        for (const f of files) {
          const src = projectFileText(f.id);
          const next = formatOffline(src, { quiet: true });
          if (next == null) {
            refused2 += 1;
            continue;
          }
          if (next === src) continue;
          applyFormatted(f.id, next);
          changed2 += 1;
        }
        return { changed: changed2, refused: refused2, total: files.length };
      };
      let stats;
      if (typeof EditHistory !== "undefined" && typeof EditHistory.transact === "function") {
        stats = EditHistory.transact("format", run2, "Format project").result || { changed: 0, refused: 0, total: files.length };
      } else {
        stats = run2();
      }
      const { changed, refused, total } = stats;
      if (changed === 0 && refused === 0) {
        showToast("All files already formatted.", { kind: "success" });
      } else if (refused === 0) {
        showToast(changed === 1 ? "Formatted 1 file." : "Formatted " + changed + " files.", { kind: "success" });
      } else if (changed === 0) {
        showToast(
          refused === total ? "Format refused for every file." : "Format refused for " + refused + " file" + (refused === 1 ? "" : "s") + ".",
          { kind: "warn" }
        );
      } else {
        showToast(
          "Formatted " + changed + " of " + total + " files (" + refused + " refused).",
          { kind: "warn" }
        );
      }
    }
    function buildEditMenuItems() {
      const currentId = getPersist() ? getPersist().getCurrentFileId() : null;
      const currentFile = currentId ? Persist.getFileById(currentId) : null;
      const canFormatFile = !!(currentFile && ProjectSource.isSignaturePath(String(currentFile.name || "")) && getEditor() && typeof getEditor().format === "function");
      return [
        { label: "Undo", onSelect: () => editorExec("undo") },
        { label: "Redo", onSelect: () => editorExec("redo") },
        { type: "separator" },
        { label: "Cut", onSelect: () => editorClipboard("cut") },
        { label: "Copy", onSelect: () => editorClipboard("copy") },
        { label: "Paste", onSelect: () => editorClipboard("paste") },
        { label: "Select All", onSelect: () => editorExec("selectAll") },
        { type: "separator" },
        { label: "Find\u2026", onSelect: () => editorExec("openSearch") },
        {
          label: "Search in project\u2026",
          onSelect: () => {
            CommandPalette.open({ mode: "search" });
          }
        },
        { type: "separator" },
        {
          label: "Format file",
          disabled: !canFormatFile,
          onSelect: formatCurrentFile
        },
        {
          label: "Format project",
          disabled: signatureFileCount() === 0,
          onSelect: formatProjectFiles
        }
      ];
    }
    function buildToolsMenuItems() {
      return [
        {
          label: "Open command palette\u2026",
          shortcut: typeof CommandPalette !== "undefined" ? CommandPalette.shortcutLabel("Mod+K") : "Ctrl+K",
          onSelect: () => {
            CommandPalette.open();
          }
        },
        { type: "separator" },
        {
          label: "Dependency graph\u2026",
          onSelect: () => window.CurrentEditor?.openDependencyGraph()
        }
      ];
    }
    const headerMenuDefs = [
      {
        id: "menu-project",
        side: "bottom",
        align: "start",
        items: buildProjectMenuItems
        // function — rebuilt on each open
      },
      {
        id: "menu-edit",
        side: "bottom",
        align: "start",
        items: buildEditMenuItems
      },
      {
        id: "menu-tools",
        side: "bottom",
        align: "start",
        items: buildToolsMenuItems
      }
    ];
    headerMenuDefs.forEach((def) => {
      wireMenuTrigger(document.getElementById(def.id), def);
    });
    const explorerNewBtn = document.getElementById("btn-explorer-new");
    if (explorerNewBtn) {
      wireMenuTrigger(explorerNewBtn, {
        side: "bottom",
        align: "end",
        items: () => explorerCreateMenuItems("").filter((item) => item.type !== "separator")
      });
    }
    return {
      wireMenuTrigger,
      signatureFileCount,
      buildProjectMenuItems,
      renameFileInteractive,
      explorerSelectionContextItems,
      fileContextItems,
      explorerFolderContextItems,
      folderRunItems,
      backgroundRunItems,
      editorExec,
      editorClipboard,
      buildToolsMenuItems
    };
  }

  // js/commands/command-settings.mjs
  var SETTINGS = [
    // ── layout ────────────────────────────────────────────────────────────────
    {
      slug: "word-wrap",
      title: "Word wrap",
      kind: "bool",
      aliases: ["wrap"],
      read: "readStoredEditorWordWrap",
      write: "writeStoredEditorWordWrap"
    },
    {
      slug: "line-numbers",
      title: "Line numbers",
      kind: "bool",
      aliases: ["number", "nu"],
      read: "readStoredEditorLineNumbers",
      write: "writeStoredEditorLineNumbers"
    },
    {
      slug: "line-number-style",
      title: "Line number style",
      kind: "enum",
      values: ["absolute", "relative", "hybrid"],
      labels: { absolute: "Absolute", relative: "Relative", hybrid: "Relative + current" },
      aliases: ["relativenumber", "rnu"],
      read: "readStoredEditorLineNumberMode",
      write: "writeStoredEditorLineNumberMode"
    },
    {
      slug: "fold-gutter",
      title: "Code folding",
      kind: "bool",
      aliases: ["foldenable", "fen"],
      read: "readStoredEditorFoldGutter",
      write: "writeStoredEditorFoldGutter"
    },
    {
      slug: "active-line",
      title: "Active line highlight",
      kind: "bool",
      aliases: ["cursorline", "cul"],
      read: "readStoredEditorActiveLine",
      write: "writeStoredEditorActiveLine"
    },
    {
      slug: "scroll-past-end",
      title: "Scroll past end",
      kind: "bool",
      aliases: ["scrollpastend", "spe"],
      read: "readStoredEditorScrollPastEnd",
      write: "writeStoredEditorScrollPastEnd"
    },
    {
      slug: "rulers",
      title: "Print-width ruler",
      kind: "bool",
      aliases: ["colorcolumn", "cc"],
      read: "readStoredEditorRulers",
      write: "writeStoredEditorRulers"
    },
    {
      slug: "sticky-decl",
      title: "Structure path",
      kind: "bool",
      aliases: ["sticky"],
      read: "readStoredStickyDeclHeader",
      write: "writeStoredStickyDeclHeader"
    },
    {
      slug: "tab-size",
      title: "Tab size",
      kind: "enum",
      values: [2, 4],
      aliases: ["tabstop", "ts"],
      labels: { 2: "2 spaces", 4: "4 spaces" },
      read: "readStoredEditorTabSize",
      write: "writeStoredEditorTabSize"
    },
    {
      slug: "format-width",
      title: "Format print width",
      kind: "enum",
      values: [80, 100, 120],
      aliases: ["textwidth", "tw"],
      labels: { 80: "80 columns", 100: "100 columns", 120: "120 columns" },
      read: "readStoredEditorFormatWidth",
      write: "writeStoredEditorFormatWidth"
    },
    {
      slug: "whitespace",
      title: "Show whitespace",
      verb: "whitespace marks",
      kind: "enum",
      values: ["none", "trailing", "selection", "all"],
      on: "all",
      off: "none",
      aliases: ["list"],
      labels: { none: "Off", trailing: "Trailing only", selection: "In selection", all: "All" },
      read: "readStoredEditorWhitespace",
      write: "writeStoredEditorWhitespace"
    },
    // ── type ──────────────────────────────────────────────────────────────────
    {
      slug: "font-size",
      title: "Font size",
      kind: "enum",
      values: ["sm", "md", "lg", "xl"],
      labels: { sm: "Small", md: "Default", lg: "Large", xl: "Larger" },
      read: "readStoredEditorFontSize",
      write: "writeStoredEditorFontSize"
    },
    {
      slug: "line-height",
      title: "Line height",
      kind: "enum",
      values: ["compact", "normal", "relaxed"],
      labels: { compact: "Compact", normal: "Default", relaxed: "Relaxed" },
      read: "readStoredEditorLineHeight",
      write: "writeStoredEditorLineHeight"
    },
    {
      slug: "font-family",
      title: "Editor font",
      kind: "enum",
      values: ["jetbrains", "system"],
      labels: { jetbrains: "JetBrains Mono", system: "System monospace" },
      read: "readStoredEditorFontFamily",
      write: "writeStoredEditorFontFamily"
    },
    {
      slug: "cursor-blink",
      title: "Cursor blink",
      kind: "enum",
      values: ["off", "blink", "fast"],
      labels: { off: "Solid", blink: "Blink", fast: "Fast" },
      read: "readStoredEditorCursorBlink",
      write: "writeStoredEditorCursorBlink"
    },
    // ── highlighting ──────────────────────────────────────────────────────────
    {
      slug: "syntax-highlight",
      title: "Syntax highlighting",
      kind: "bool",
      aliases: ["syntax"],
      read: "readStoredEditorSyntaxHighlight",
      write: "writeStoredEditorSyntaxHighlight"
    },
    {
      slug: "semantic-highlight",
      title: "Semantic highlighting",
      kind: "bool",
      read: "readStoredEditorSemanticHighlight",
      write: "writeStoredEditorSemanticHighlight"
    },
    {
      slug: "parse-highlight",
      title: "Invalid parse styling",
      kind: "bool",
      read: "readStoredEditorParseHighlight",
      write: "writeStoredEditorParseHighlight"
    },
    {
      slug: "occurrence-highlight",
      title: "Occurrence highlight",
      kind: "bool",
      read: "readStoredEditorOccurrenceHighlight",
      write: "writeStoredEditorOccurrenceHighlight"
    },
    {
      slug: "selection-matches",
      title: "Selection matches",
      kind: "bool",
      aliases: ["hlsearch", "hls"],
      read: "readStoredEditorSelectionMatches",
      write: "writeStoredEditorSelectionMatches"
    },
    {
      slug: "bracket-match",
      title: "Bracket matching",
      kind: "bool",
      aliases: ["showmatch", "sm"],
      read: "readStoredEditorBracketMatch",
      write: "writeStoredEditorBracketMatch"
    },
    // ── editing behaviour ─────────────────────────────────────────────────────
    {
      slug: "auto-close-brackets",
      title: "Auto-close brackets",
      kind: "bool",
      aliases: ["autoclose"],
      read: "readStoredEditorAutoCloseBrackets",
      write: "writeStoredEditorAutoCloseBrackets"
    },
    {
      slug: "reindent-paste",
      title: "Re-indent on paste",
      kind: "bool",
      read: "readStoredEditorReindentPaste",
      write: "writeStoredEditorReindentPaste"
    },
    {
      slug: "format-on-save",
      title: "Format on save",
      kind: "bool",
      read: "readStoredFormatOnSave",
      write: "writeStoredFormatOnSave"
    },
    {
      slug: "trim-whitespace",
      title: "Trim trailing whitespace on save",
      kind: "bool",
      read: "readStoredTrimTrailingWs",
      write: "writeStoredTrimTrailingWs"
    },
    // ── proof surface ─────────────────────────────────────────────────────────
    {
      slug: "hole-gutter",
      title: "Hole gutter marks",
      kind: "bool",
      read: "readStoredEditorHoleGutter",
      write: "writeStoredEditorHoleGutter"
    },
    {
      slug: "hole-emphasis",
      title: "Hole gutter emphasis",
      kind: "enum",
      values: ["subtle", "normal", "loud"],
      labels: { subtle: "Subtle", normal: "Default", loud: "Loud" },
      read: "readStoredEditorHoleEmphasis",
      write: "writeStoredEditorHoleEmphasis"
    },
    {
      slug: "quiet-typing",
      title: "Quiet while typing",
      kind: "bool",
      aliases: ["quiet"],
      read: "readStoredQuietWhileTyping",
      write: "writeStoredQuietWhileTyping"
    },
    {
      slug: "hover-sticky",
      title: "Sticky hover",
      kind: "bool",
      read: "readStoredHoverSticky",
      write: "writeStoredHoverSticky"
    }
  ];
  function lowerFirst(text) {
    const t = String(text || "");
    return t.charAt(0).toLowerCase() + t.slice(1);
  }
  function settingId(slug) {
    return "set." + slug;
  }
  function settingEntries() {
    return SETTINGS.map((s) => ({
      id: settingId(s.slug),
      title: (s.kind === "bool" ? "Toggle " : "Cycle ") + lowerFirst(s.verb || s.title),
      section: "Settings",
      scope: "global",
      keybindable: true,
      palette: true
    }));
  }
  function optionNames() {
    const out = [];
    for (const s of SETTINGS) {
      out.push(s.slug);
      for (const a of s.aliases || []) out.push(a);
    }
    return out;
  }
  function optionCandidates() {
    const out = [];
    for (const s of SETTINGS) {
      out.push({ value: s.slug, label: s.title });
      for (const a of s.aliases || []) out.push({ value: a, label: s.title });
    }
    return out;
  }
  function findSetting(name) {
    const key = String(name == null ? "" : name).toLowerCase();
    if (!key) return null;
    const bare = key.startsWith("set.") ? key.slice(4) : key;
    return SETTINGS.find((s) => s.slug === bare) || SETTINGS.find((s) => (s.aliases || []).indexOf(bare) >= 0) || null;
  }
  function nextValue(spec, current, requested) {
    if (!spec) return null;
    if (spec.kind === "bool") {
      if (requested === true || requested === false) return requested;
      if (requested == null || requested === "") return !current;
      const word = String(requested).toLowerCase();
      if (["on", "true", "yes", "1"].indexOf(word) >= 0) return true;
      if (["off", "false", "no", "0"].indexOf(word) >= 0) return false;
      return null;
    }
    const values = spec.values || [];
    if (requested === true) return spec.on === void 0 ? null : spec.on;
    if (requested === false) return spec.off === void 0 ? null : spec.off;
    if (requested != null && requested !== "") {
      const wanted = values.find((v) => String(v) === String(requested));
      return wanted === void 0 ? null : wanted;
    }
    const at = values.findIndex((v) => String(v) === String(current));
    return values[(at + 1) % values.length];
  }
  function nearestSetting(name) {
    const lower = String(name || "").toLowerCase();
    if (!lower) return null;
    let best = null;
    let bestLen = 0;
    for (const n of optionNames()) {
      let i = 0;
      while (i < n.length && i < lower.length && n[i] === lower[i]) i += 1;
      if (i > bestLen || i === bestLen && best && n.length > best.length) {
        best = n;
        bestLen = i;
      }
    }
    return bestLen >= 2 ? best : null;
  }
  function parseSet(raw) {
    const text = String(raw == null ? "" : raw).trim();
    if (!text) return { error: "usage" };
    const eq = text.indexOf("=");
    const value = eq >= 0 ? text.slice(eq + 1).trim() : null;
    let name = (eq >= 0 ? text.slice(0, eq) : text).trim().toLowerCase();
    let toggle = false;
    if (name.endsWith("!")) {
      name = name.slice(0, -1);
      toggle = true;
    }
    let negated = false;
    if (!findSetting(name) && name.startsWith("no") && findSetting(name.slice(2))) {
      name = name.slice(2);
      negated = true;
    }
    const spec = findSetting(name);
    if (!spec) return { error: "unknown", name, near: nearestSetting(name) };
    if (value != null && value !== "" && spec.kind === "enum" && !(spec.values || []).some((v) => String(v) === String(value))) {
      return { error: "value", name, spec, value };
    }
    if (negated && spec.kind === "enum" && spec.off === void 0) {
      return { error: "not-boolean", name, spec };
    }
    let requested;
    if (value != null && value !== "") requested = value;
    else if (negated) requested = false;
    else if (toggle) requested = void 0;
    else if (spec.kind === "bool" || spec.on !== void 0) requested = true;
    else requested = void 0;
    return { spec, requested };
  }
  function orList(values) {
    const all = (values || []).map(String);
    if (all.length < 2) return all.join("");
    return all.slice(0, -1).join(", ") + " or " + all[all.length - 1];
  }
  function describeChange(spec, value) {
    if (value === true) return spec.title + " on";
    if (value === false) return spec.title + " off";
    const labels = spec.labels || {};
    return spec.title + ": " + (labels[value] != null ? labels[value] : String(value));
  }
  function applyValue(persist, spec, requested) {
    if (!persist || !spec) return { ok: false, message: "Settings are not ready yet." };
    if (typeof persist[spec.read] !== "function" || typeof persist[spec.write] !== "function") {
      return { ok: false, message: `${spec.title} cannot be changed here.` };
    }
    const value = nextValue(spec, persist[spec.read](), requested);
    if (value === null) return { ok: false, message: `${spec.title}: no such value.` };
    persist[spec.write](value);
    return { ok: true, applied: true, spec, value, message: describeChange(spec, value) };
  }
  function runSetOn(persist, raw) {
    const res = parseSet(raw);
    if (res.error === "usage") {
      return { ok: false, message: "Usage: :set nu, :set nowrap, :set ts=4" };
    }
    if (res.error === "unknown") {
      return {
        ok: false,
        message: res.near ? `Unknown option "${res.name}". Did you mean "${res.near}"?` : `Unknown option "${res.name}".`
      };
    }
    if (res.error === "value") {
      return { ok: false, message: `${res.name} takes ${orList(res.spec.values)}.` };
    }
    if (res.error === "not-boolean") {
      return {
        ok: false,
        message: `${res.spec.title} is not on or off. Try :set ${res.name}=${res.spec.values[0]}.`
      };
    }
    return applyValue(persist, res.spec, res.requested);
  }

  // js/commands/command-catalog.mjs
  var CATALOG = [
    // ── File ───────────────────────────────────────────────────────────────────
    { id: "project.new", title: "New Project\u2026", section: "File", scope: "global", palette: true },
    { id: "file.new", title: "New file\u2026", section: "File", scope: "global", palette: true },
    { id: "file.upload", title: "Upload File", section: "File", scope: "global", palette: true },
    { id: "file.upload-folder", title: "Upload Folder", section: "File", scope: "global", palette: true },
    { id: "file.import-folder", title: "Import Folder as New Project", section: "File", scope: "global", palette: true },
    { id: "file.download", title: "Download Current File", section: "File", scope: "global", palette: true },
    { id: "tab.next", title: "Next Tab", section: "File", scope: "global", palette: true, keybindable: true, ex: ["bn"] },
    { id: "tab.prev", title: "Previous Tab", section: "File", scope: "global", palette: true, keybindable: true, ex: ["bp"] },
    { id: "tab.close", title: "Close Tab", section: "File", scope: "global", palette: true, keybindable: true },
    { id: "tab.close-others", title: "Close Other Tabs", section: "File", scope: "global", palette: true, keybindable: true },
    { id: "tab.close-right", title: "Close Tabs to the Right", section: "File", scope: "global", palette: true, keybindable: true },
    // `:w`. BelJar autosaves, so this is "commit it NOW" — including the
    // format-on-save and trim-trailing-whitespace transforms, which otherwise
    // wait for the debounce. `:wa` is the same act: there is one live buffer, so
    // a separate save-all would be a second name for one thing.
    {
      id: "file.save",
      title: "Save Now",
      section: "File",
      scope: "global",
      palette: true,
      keybindable: true,
      ex: ["w", "write", "wa", "wall"],
      styles: { vim: "always" }
    },
    // `:e util.bel` — open a project file by name, with completion. Opening one
    // that is already open just focuses its tab, which is what `:b` would do.
    {
      id: "file.open",
      title: "Open File",
      section: "File",
      scope: "global",
      palette: false,
      keybindable: false,
      ex: ["e", "edit"],
      args: [{ kind: "file", label: "file" }]
    },
    // Suite membership for the current file. Gated on the file's directory having
    // exactly ONE active suite: with two, the answer is a question, and a command
    // that guesses would be rewriting a .cfg on the user's behalf.
    {
      id: "suite.add-file",
      title: "Add to Suite",
      section: "File",
      scope: "global",
      palette: true,
      keybindable: true
    },
    {
      id: "suite.remove-file",
      title: "Remove from Suite",
      section: "File",
      scope: "global",
      palette: true,
      keybindable: true
    },
    // ── Edit ───────────────────────────────────────────────────────────────────
    {
      id: "edit.undo",
      title: "Undo",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+Z",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only" }
    },
    {
      id: "edit.redo",
      title: "Redo",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+Y",
      macDefaultSpec: "Mod+Shift+Z",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    {
      id: "edit.find",
      title: "Find\u2026",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+F",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    {
      id: "edit.search-project",
      title: "Search in Project\u2026",
      section: "Edit",
      scope: "global",
      defaultSpec: "Mod+Shift+F",
      keybindable: true,
      palette: true
    },
    {
      id: "edit.toggle-comment",
      title: "Toggle Line Comment",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+/",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    {
      id: "edit.format",
      title: "Format Document",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Alt+Shift+F",
      keybindable: true,
      palette: true,
      ex: ["fmt", "format"],
      styles: { vim: "always" }
    },
    {
      id: "edit.rename",
      title: "Rename Symbol",
      section: "Edit",
      scope: "editor",
      defaultSpec: "F2",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "edit.select-all",
      title: "Select All",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+A",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    {
      // Chord-only: "show me completions" is meaningless from a palette you had
      // to open with the keyboard anyway.
      id: "edit.autocomplete",
      title: "Show Autocomplete",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Control+Space",
      keybindable: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    { id: "edit.delete-line", title: "Delete Line", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.move-line-up", title: "Move Line Up", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.move-line-down", title: "Move Line Down", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.duplicate-line", title: "Duplicate Line", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.duplicate-line-up", title: "Duplicate Line Up", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.indent", title: "Indent", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.dedent", title: "Dedent", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.reindent", title: "Reindent Selection", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.transpose-chars", title: "Transpose Characters", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.split-line", title: "Split Line", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.blank-line", title: "Insert Blank Line", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.trim-whitespace", title: "Trim Trailing Whitespace", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    // ── Motion ─────────────────────────────────────────────────────────────────
    // Bindable, but in NEITHER the palette nor the command line: nobody searches
    // a command list for "move left", and `:motion-char-left` is not a thing
    // anyone types. They exist so "bind anything" is true — `cmdline: false` is what
    // keeps 31 of them out of the line's completion.
    //
    // ⛔ This is the only section that turns the flag off, and the reason it
    // exists. Anything else added here must earn the same argument.
    { id: "motion.char-left", title: "Move Left", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.char-right", title: "Move Right", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.word-left", title: "Move Word Left", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.word-right", title: "Move Word Right", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.line-up", title: "Move Up", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.line-down", title: "Move Down", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.line-start", title: "Move to Line Start", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.line-end", title: "Move to Line End", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.doc-start", title: "Move to Start of File", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.doc-end", title: "Move to End of File", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.page-up", title: "Move Page Up", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.page-down", title: "Move Page Down", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.match-bracket", title: "Move to Matching Bracket", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.syntax-left", title: "Move by Syntax Left", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.syntax-right", title: "Move by Syntax Right", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.char-left", title: "Select Left", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.char-right", title: "Select Right", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.word-left", title: "Select Word Left", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.word-right", title: "Select Word Right", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.line-up", title: "Select Up", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.line-down", title: "Select Down", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.line-start", title: "Select to Line Start", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.line-end", title: "Select to Line End", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.doc-start", title: "Select to Start of File", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.doc-end", title: "Select to End of File", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.page-up", title: "Select Page Up", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.page-down", title: "Select Page Down", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.match-bracket", title: "Select to Matching Bracket", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.line", title: "Select Line", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.parent-syntax", title: "Select Enclosing Syntax", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.collapse", title: "Collapse Selection", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    // ── Navigate ───────────────────────────────────────────────────────────────
    {
      id: "nav.symbol",
      title: "Go to Symbol\u2026",
      section: "Navigate",
      scope: "global",
      defaultSpec: "Mod+Shift+O",
      keybindable: true,
      palette: true,
      ex: ["sym"]
    },
    {
      id: "nav.anywhere",
      title: "Go to File\u2026",
      section: "Navigate",
      scope: "global",
      defaultSpec: "Mod+K",
      keybindable: true,
      styles: { emacs: "yield" }
    },
    {
      id: "nav.definition",
      title: "Go to Definition",
      section: "Navigate",
      scope: "editor",
      defaultSpec: "F12",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.references",
      title: "Find References",
      section: "Navigate",
      scope: "editor",
      defaultSpec: "Shift+F12",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.enclosing-decl",
      title: "Go to Enclosing Declaration",
      section: "Navigate",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.binder",
      title: "Go to Binder",
      section: "Navigate",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.inspector",
      title: "Reveal in Inspector",
      section: "Navigate",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    // Structure motions: a Beluga file is declarations containing case branches,
    // so `]d` and `]c` are the two that matter.
    { id: "nav.next-decl", title: "Go to Next Declaration", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    { id: "nav.prev-decl", title: "Go to Previous Declaration", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    { id: "nav.next-case", title: "Go to Next Case Branch", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    { id: "nav.prev-case", title: "Go to Previous Case Branch", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    // The jump list. Everything above jumps; these are the way back.
    { id: "nav.jump-back", title: "Jump Back", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    { id: "nav.jump-forward", title: "Jump Forward", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    {
      id: "nav.next-hole",
      title: "Go to Next Hole",
      section: "Navigate",
      scope: "editor",
      defaultSpec: "F8",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.prev-hole",
      title: "Go to Previous Hole",
      section: "Navigate",
      scope: "editor",
      defaultSpec: "Shift+F8",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.next-problem",
      title: "Go to Next Problem",
      section: "Navigate",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.prev-problem",
      title: "Go to Previous Problem",
      section: "Navigate",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    // ── Prover ─────────────────────────────────────────────────────────────────
    // Everything here is gated on the caret standing in a hole, so the palette
    // stays quiet unless there is actually a goal under the cursor.
    {
      id: "prover.hole-intro",
      title: "Intro at Hole",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "prover.hole-split",
      title: "Split at Hole",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "prover.hole-fill",
      title: "Fill Hole",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "prover.open-in-harpoon",
      title: "Open Hole in Harpoon",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      ex: ["harpoon"],
      styles: { vim: "always" }
    },
    // Reading the proof state, from the editor. Not gated on standing IN a hole:
    // "how many are left" is a question you ask from anywhere in the file.
    {
      id: "prover.count-holes",
      title: "Count Holes",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      ex: ["holes"],
      styles: { vim: "always" }
    },
    {
      id: "prover.goal-at-cursor",
      title: "Show Goal at Cursor",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      ex: ["goal"],
      styles: { vim: "always" }
    },
    // Driving the Harpoon lab itself. `when()` resolves the session the user is
    // looking at (`Harpoon.activeSession`), so with no lab open these vanish from
    // the palette rather than reporting a failure.
    {
      id: "harpoon.next-goal",
      title: "Next Goal",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "harpoon.prev-goal",
      title: "Previous Goal",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "harpoon.undo-move",
      title: "Undo Proof Move",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "harpoon.redo-move",
      title: "Redo Proof Move",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "harpoon.orca-start",
      title: "Run Orca",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      ex: ["orca"],
      styles: { vim: "always" }
    },
    {
      id: "harpoon.orca-pause",
      title: "Pause Orca",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "harpoon.orca-absorb",
      title: "Take Over from Orca",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    // ── Run ────────────────────────────────────────────────────────────────────
    // What the Run button does: a suite member runs the suite up to and including
    // itself; an isolated file runs alone. The status segment uses this so it can
    // never be a weaker Run than the button beside it.
    { id: "run.default", title: "Run", section: "Run", scope: "global", palette: true, keybindable: true },
    { id: "run.file", title: "Run File", section: "Run", scope: "global", palette: true, keybindable: true, ex: ["run"] },
    { id: "run.here", title: "Run Suite to Here", section: "Run", scope: "global", palette: true, keybindable: true },
    { id: "run.module", title: "Run Suite", section: "Run", scope: "global", palette: true, keybindable: true, ex: ["runs"] },
    { id: "run.project", title: "Run Project", section: "Run", scope: "global", palette: true, keybindable: true, ex: ["runp"] },
    { id: "run.clear-output", title: "Clear Output", section: "Run", scope: "global", palette: true, keybindable: true },
    // ── View ───────────────────────────────────────────────────────────────────
    { id: "view.theme", title: "Toggle Theme", section: "View", scope: "global", palette: true, keybindable: true },
    { id: "view.explorer", title: "Toggle Explorer", section: "View", scope: "global", palette: true, keybindable: true },
    { id: "view.library", title: "Toggle Library", section: "View", scope: "global", palette: true, keybindable: true },
    { id: "view.harpoon", title: "Toggle Harpoon", section: "View", scope: "global", palette: true, keybindable: true },
    // The `⟲` widget in the status strip is the same panel; a surface you can only
    // reach by clicking is one the palette and the `:` line cannot offer.
    { id: "view.edit-history", title: "Toggle Edit History", section: "View", scope: "global", palette: true, keybindable: true, ex: ["undolist"] },
    { id: "view.settings", title: "Open Settings\u2026", section: "View", scope: "global", palette: true, keybindable: true },
    { id: "fold.all", title: "Fold All", section: "View", scope: "editor", palette: true, keybindable: true },
    { id: "fold.unfold-all", title: "Unfold All", section: "View", scope: "editor", palette: true, keybindable: true },
    // ── Settings ───────────────────────────────────────────────────────────────
    // Generated from `command-settings.mjs`: one declaration behind the palette
    // row, the bindable chord and Vim's `:set`.
    ...settingEntries(),
    // The line's way in. Not in the palette: without an argument it does nothing,
    // and each preference already has its own palette row above.
    {
      id: "settings.set",
      title: "Set Option",
      section: "Settings",
      scope: "global",
      palette: false,
      keybindable: false,
      ex: ["set", "se"],
      args: [{ kind: "option", label: "option" }]
    },
    // ── Tools ──────────────────────────────────────────────────────────────────
    // Not keybindable: `nav.anywhere` owns Mod+K. The literal `shortcut` is the
    // palette's own display fallback for an entry with no chord of its own.
    // Fullscreen + `navigator.keyboard.lock()`. Measured by hand: under lock the
    // ten reserved chords reach the page AND their browser actions do not fire.
    { id: "keys.full-keyboard", title: "Toggle Full Keyboard", section: "Tools", scope: "global", palette: true, keybindable: true, ex: ["fullkeys"] },
    // Generated from `describe()`, so it is the keymap rather than a copy of it.
    // `keys.show-chords` from the original Wave G list folded in here: one sheet
    // that answers "what can I press" beats two that answer half each.
    { id: "keys.macros", title: "Available Macros\u2026", section: "Tools", scope: "global", palette: true, keybindable: true, ex: ["help", "macros"] },
    { id: "cmdline.repeat", title: "Repeat Last Command", section: "Tools", scope: "global", palette: true, keybindable: true },
    { id: "cmdline.open", title: "Command Line", section: "Tools", scope: "global", palette: true, keybindable: true },
    { id: "tools.palette", title: "Open Command Palette", section: "Tools", scope: "global", palette: true, shortcut: "Mod+K" },
    { id: "tools.graph", title: "Open Dependency Graph", section: "Tools", scope: "global", palette: true, keybindable: true, ex: ["graph"] },
    { id: "tools.inspector", title: "Open Inspector", section: "Tools", scope: "global", palette: true, keybindable: true },
    {
      id: "tools.commands",
      title: "Run Command\u2026",
      section: "Tools",
      scope: "global",
      // ⛔ NOT `Mod+Shift+P`. That was the shipped chord until `scripts/chord-audit.html`
      // measured Chrome on Windows taking it before the page ever sees it — a
      // default that simply did nothing for half our users. `Alt+X` was measured
      // arriving, and it reads as "execute a command" to anyone who has met M-x.
      defaultSpec: "Alt+X",
      // ⚠ Alt is Option on a Mac and composes characters — Option+X types "≈", so
      // the Windows chord cannot carry over. Cmd+Shift+P is free there (Chrome's
      // incognito chord is Cmd+Shift+N) and is what every editor uses anyway.
      macDefaultSpec: "Mod+Shift+P",
      keybindable: true,
      // …which is exactly what Emacs binds it to, so Emacs' own M-x wins there.
      styles: { emacs: "off" }
    }
  ];

  // js/commands/command-shadows.mjs
  var STYLE_TAKES = {
    emacs: [
      { spec: "Mod+F", key: "C-f", runs: "forward-char" },
      // ⛔ Not a no-op: the package binds `C-x C-p|C-x h` to selectAll, and
      // `probe-keymap.mjs` measures it selecting the whole document. A remembered
      // claim about a dependency once told Emacs users a working chord did not
      // exist. Read the package's key table, do not recall it.
      { spec: "Mod+A", key: "C-a", runs: "move-beginning-of-line" },
      { spec: "Control+Space", key: "C-Space", runs: "set-mark-command" },
      { spec: "Mod+Y", key: "C-y", runs: "yank" },
      { spec: "Mod+/", key: "C-/", runs: "undo" },
      { spec: "Mod+K", key: "C-k", runs: "kill-line" },
      // ⛔ `M-x` IS Run Command — Emacs reaches the same command through its own
      // binding. `sameCommand` stops it reading as a loss, because nothing is lost.
      { spec: "Alt+X", key: "M-x", runs: "execute-extended-command", sameCommand: "tools.commands" }
    ],
    // Vim takes no chord for itself: what it does is make BelJar's chords
    // Insert-only, which is a MODE caveat and carries its own tag.
    vim: []
  };
  var INSERT_ALTERNATIVE = {
    vim: {
      "edit.undo": "u",
      "edit.redo": "C-r",
      "edit.find": "/"
    }
  };
  var STYLE_CHORDS = {
    emacs: {
      "edit.find": "C-s",
      "edit.select-all": "C-x h",
      "edit.redo": "C-S-z",
      "tools.commands": "M-x",
      "nav.anywhere": "C-x C-f"
    },
    vim: {}
  };
  var STYLE_NAME = { emacs: "Emacs", vim: "Vim" };
  function readableStyleChord(keys) {
    const raw = String(keys == null ? "" : keys).trim();
    if (!raw) return "";
    if (raw.indexOf(" ") >= 0) return raw.split(/\s+/).map(readableStyleChord).join(" ");
    if (raw.indexOf("-") < 0) return raw.length === 1 ? raw.toUpperCase() : raw;
    const parts = raw.split("-");
    const last = parts.pop();
    const mods = parts.map((p) => ({ C: "Ctrl", S: "Shift", M: "Alt" })[p] || p);
    const rank = { Ctrl: 0, Alt: 1, Shift: 2 };
    mods.sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9));
    const name = last === "Space" ? "Space" : last.length === 1 ? last.toUpperCase() : last;
    return mods.concat([name]).join("+");
  }
  function specFromStyleKey(key) {
    const raw = String(key == null ? "" : key).trim();
    if (!raw || /\s/.test(raw)) return "";
    const sep = raw.indexOf("-") >= 0 ? "-" : "+";
    const parts = raw.split(sep);
    const last = parts.pop();
    if (!last) return "";
    const mods = { Mod: false, Alt: false, Shift: false };
    for (const part of parts) {
      if (part === "C" || part === "Ctrl" || part === "Mod") mods.Mod = true;
      else if (part === "M" || part === "Alt") mods.Alt = true;
      else if (part === "S" || part === "Shift") mods.Shift = true;
      else return "";
    }
    if (!mods.Mod && !mods.Alt && !mods.Shift) return "";
    const out = [];
    if (mods.Mod) out.push("Mod");
    if (mods.Alt) out.push("Alt");
    if (mods.Shift) out.push("Shift");
    out.push(last.length === 1 ? last.toUpperCase() : last);
    return out.join("+");
  }
  function takesChord(style, spec) {
    if (!spec) return null;
    const table = STYLE_TAKES[style] || [];
    for (const entry of table) {
      if (entry.spec === spec) return entry;
    }
    return null;
  }
  function chordShadow(opts) {
    const style = opts.style;
    if (!STYLE_NAME[style]) return null;
    const name = STYLE_NAME[style];
    if (opts.policy === "insert-only") {
      const instead = (INSERT_ALTERNATIVE[style] || {})[opts.commandId] || "";
      return {
        kind: "insert",
        tag: "insert",
        instead,
        tip: instead ? `Only while you are typing. In Normal mode, press ${instead}.` : `Only while you are typing, not in ${name}'s Normal mode.`
      };
    }
    const spec = opts.spec || "";
    const label = opts.label || spec;
    const taken = takesChord(style, spec);
    if (taken && taken.sameCommand !== opts.commandId) {
      return {
        kind: "shadowed",
        tag: "shadowed",
        key: taken.key,
        runs: taken.runs,
        // ⛔ A statement about the CHORD, naming both claimants. Never "without
        // Emacs this command would be…" — that describes a world you are not in.
        tip: `${name} uses ${label} for ${taken.runs}.`
      };
    }
    if (!opts.fromStyle) return null;
    const owner = typeof opts.baseOwnerOf === "function" ? opts.baseOwnerOf(spec) : null;
    if (owner && owner.id !== opts.commandId) {
      return {
        kind: "shadowing",
        tag: "shadowing",
        owner: owner.id,
        tip: `${name} uses ${label} here. In Standard, ${label} is ${owner.title}.`
      };
    }
    return null;
  }

  // js/commands/command-names.mjs
  var MX_PREFIX = "beljar-";
  function mxNameFor(id, explicit) {
    if (explicit) return String(explicit);
    const slug = String(id == null ? "" : id).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug ? MX_PREFIX + slug : "";
  }
  function exNamesFor(ex) {
    const raw = ex == null ? [] : Array.isArray(ex) ? ex : [ex];
    const out = [];
    for (const name of raw) {
      const clean = String(name == null ? "" : name).trim().replace(/^:+/, "");
      if (clean && out.indexOf(clean) < 0) out.push(clean);
    }
    return out;
  }
  function titleFor(id, explicit) {
    if (explicit) return String(explicit);
    const tail = String(id == null ? "" : id).split(".").pop() || "";
    const words = tail.replace(/[-_]+/g, " ").trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : String(id || "");
  }

  // js/commands/command-registry.mjs
  var global = globalThis;
  var POLICIES = ["off", "yield", "insert-only", "always"];
  var DEFAULT_POLICY = "always";
  var order = [];
  var byId = /* @__PURE__ */ Object.create(null);
  var version = 0;
  function normalize(record) {
    const id = String(record.id);
    return Object.assign({}, record, {
      id,
      title: titleFor(id, record.title),
      section: record.section || "",
      scope: record.scope || "global",
      keybindable: !!record.keybindable,
      palette: !!record.palette,
      cmdline: record.cmdline === false ? false : true,
      ex: exNamesFor(record.ex),
      mx: mxNameFor(id, record.mx),
      styles: record.styles || null
    });
  }
  function define(desc) {
    if (!desc || typeof desc !== "object") return false;
    const id = desc.id == null ? "" : String(desc.id);
    if (!id) return false;
    const prev = byId[id];
    if (!prev) order.push(id);
    byId[id] = normalize(Object.assign({}, prev || {}, desc, { id }));
    version += 1;
    return true;
  }
  function defineAll(list2) {
    if (!Array.isArray(list2)) return 0;
    let n = 0;
    for (const desc of list2) if (define(desc)) n += 1;
    return n;
  }
  function attach(id, behaviour) {
    if (!id || !behaviour) return false;
    const patch = { id: String(id) };
    if (typeof behaviour.run === "function") patch.run = behaviour.run;
    if (typeof behaviour.when === "function") patch.when = behaviour.when;
    if (typeof behaviour.preview === "function") patch.preview = behaviour.preview;
    return define(patch);
  }
  function unregister(id) {
    const key = String(id == null ? "" : id);
    if (!byId[key]) return false;
    delete byId[key];
    const at = order.indexOf(key);
    if (at >= 0) order.splice(at, 1);
    version += 1;
    return true;
  }
  function get(id) {
    return byId[String(id == null ? "" : id)] || null;
  }
  function has(id) {
    return !!get(id);
  }
  function isAvailable(cmd, ctx) {
    if (!cmd || typeof cmd.when !== "function") return true;
    try {
      return !!cmd.when(ctx);
    } catch (_) {
      return false;
    }
  }
  function list(filter) {
    const f = filter || {};
    const out = [];
    for (const id of order) {
      const cmd = byId[id];
      if (!cmd) continue;
      if (f.palette === true && !cmd.palette) continue;
      if (f.keybindable === true && !cmd.keybindable) continue;
      if (f.cmdline === true && !cmd.cmdline) continue;
      if (f.runnable === true && typeof cmd.run !== "function") continue;
      if (f.scope && cmd.scope !== f.scope) continue;
      if (f.section && cmd.section !== f.section) continue;
      if (f.available === true && !isAvailable(cmd, f.ctx)) continue;
      out.push(cmd);
    }
    return out;
  }
  function idsWithStyle(style, policy) {
    const out = [];
    for (const id of order) {
      const cmd = byId[id];
      if (cmd && cmd.styles && cmd.styles[style] === policy) out.push(id);
    }
    return out;
  }
  function styleFor(id, style) {
    const cmd = get(id);
    if (!cmd || !cmd.styles) return DEFAULT_POLICY;
    const p = cmd.styles[style];
    return POLICIES.indexOf(p) >= 0 ? p : DEFAULT_POLICY;
  }
  function styleChordFor(id, style) {
    return readableStyleChord((STYLE_CHORDS[style] || {})[id] || "");
  }
  function baseOwnerOf(spec, exceptId) {
    const KB = global.Keybindings;
    if (!spec || !KB || typeof KB.findConflict !== "function") return null;
    const id = KB.findConflict(spec, exceptId);
    if (!id) return null;
    const cmd = get(id);
    return cmd ? { id, title: cmd.title } : null;
  }
  function describe(id, opts) {
    const cmd = get(id);
    if (!cmd) return null;
    const o = opts || {};
    const style = o.style || "default";
    const KB = global.Keybindings;
    let spec = "";
    let chord = "";
    if (KB && typeof KB.has === "function" && KB.has(cmd.id)) {
      spec = KB.resolve(cmd.id, o.isMac) || "";
      chord = KB.labelFor(cmd.id, o.isMac) || "";
    } else if (cmd.shortcut && KB && typeof KB.formatShortcut === "function") {
      spec = KB.normalizeSpec ? KB.normalizeSpec(cmd.shortcut) : "";
      chord = KB.formatShortcut(cmd.shortcut, o.isMac) || "";
    }
    const policy = styleFor(cmd.id, style);
    const styleChord = styleChordFor(cmd.id, style);
    const showingStyle = o.showing === "style" && !!styleChord;
    const shownSpec = showingStyle ? specFromStyleKey(styleChord) : spec;
    const shownLabel = showingStyle ? styleChord : chord;
    return {
      id: cmd.id,
      title: cmd.title,
      section: cmd.section,
      scope: cmd.scope,
      chord,
      spec,
      styleChord,
      ex: cmd.ex.slice(),
      mx: cmd.mx,
      keybindable: cmd.keybindable,
      palette: cmd.palette,
      runnable: typeof cmd.run === "function",
      policy,
      availableInStyle: policy !== "off",
      shadow: chordShadow({
        style,
        policy,
        commandId: cmd.id,
        spec: shownSpec,
        label: shownLabel,
        fromStyle: showingStyle,
        baseOwnerOf: (s) => baseOwnerOf(s, cmd.id)
      })
    };
  }
  function defaults() {
    return list({ keybindable: true }).map((c) => ({
      id: c.id,
      title: c.title,
      section: c.section,
      scope: c.scope,
      defaultSpec: c.defaultSpec || "",
      macDefaultSpec: c.macDefaultSpec || ""
    }));
  }
  function run(id, ctx) {
    const cmd = get(id);
    if (!cmd || typeof cmd.run !== "function") return false;
    if (!isAvailable(cmd, ctx)) return false;
    return cmd.run(ctx) !== false;
  }
  defineAll(CATALOG);
  var Commands2 = {
    define,
    defineAll,
    attach,
    unregister,
    get,
    has,
    list,
    describe,
    defaults,
    run,
    styleFor,
    idsWithStyle,
    // The preference table, so the editor's `:set` resolves through the same
    // source as the palette rows without importing across the bundle seam.
    settings: {
      list: () => SETTINGS.slice(),
      find: findSetting,
      next: nextValue,
      nearest: nearestSetting,
      id: settingId,
      parse: parseSet,
      describe: describeChange,
      candidates: optionCandidates
    },
    /**
     * The tag for an arbitrary chord shown for a command — for surfaces that
     * render a style's OWN maps (`gd`, `C-x C-s`) rather than a catalogue chord.
     *
     * ⛔ One entry point, so nothing else decides when a chord is contested.
     */
    chordShadowFor(opts) {
      const o = opts || {};
      const cmd = get(o.commandId);
      return chordShadow({
        style: o.style,
        policy: "always",
        commandId: o.commandId,
        spec: specFromStyleKey(o.keys),
        label: o.keys,
        // Always: this entry point only ever describes a STYLE's own map.
        fromStyle: true,
        baseOwnerOf: (s) => baseOwnerOf(s, cmd ? cmd.id : null)
      });
    },
    isAvailable,
    version: () => version,
    _pure: { normalize, POLICIES, DEFAULT_POLICY, chordShadow, STYLE_TAKES, STYLE_CHORDS, specFromStyleKey, CATALOG }
  };
  global.Commands = Commands2;

  // js/app/app-command-palette.mjs
  function create9(deps) {
    var getPersist = deps.getPersist;
    var toggleSidePanel = deps.toggleSidePanel;
    var toggleTheme = deps.toggleTheme;
    var newProject = deps.newProject;
    var newFile = deps.newFile;
    var fileInputEl = deps.fileInputEl;
    var uploadFolderInputEl = deps.uploadFolderInputEl;
    var folderInputEl = deps.folderInputEl;
    var downloadCurrentFile = deps.downloadCurrentFile;
    var editorExec = deps.editorExec;
    var moduleNameFor = deps.moduleNameFor;
    var signatureFileCount = deps.signatureFileCount;
    var switchToFile = deps.switchToFile;
    var openFileAt = deps.openFileAt;
    var projectFileText = deps.projectFileText;
    var closeFile = deps.closeFile;
    var closeTabsForFiles = deps.closeTabsForFiles;
    var activeSuiteMembership = deps.activeSuiteMembership;
    var afterSuiteEdit = deps.afterSuiteEdit;
    {
      CommandPalette.init();
      const on = (id, run2, when) => Commands2.attach(id, when ? { run: run2, when } : { run: run2 });
      const say = (text) => {
        if (typeof StatusStrip !== "undefined" && StatusStrip.setMessage) StatusStrip.setMessage(text);
      };
      const reapplyPrefs = () => {
        if (typeof Persist.applyStoredEditorChrome === "function") Persist.applyStoredEditorChrome();
        if (typeof BelEditor !== "undefined" && BelEditor.applyEditorPrefs) BelEditor.applyEditorPrefs();
      };
      const toggleSetting = (spec) => {
        const res = applyValue(Persist, spec, void 0);
        if (res.applied) reapplyPrefs();
        say(res.message);
        return res.ok;
      };
      const runSet = (argText) => {
        const res = runSetOn(Persist, argText);
        if (res.applied) reapplyPrefs();
        say(res.message);
        return res.ok;
      };
      Commands2.runSet = runSet;
      const currentEditor = () => window.CurrentEditor;
      const onEditor = (id, fn, ready) => Commands2.attach(id, {
        run: () => {
          const e = currentEditor();
          if (!e) return false;
          if (typeof e.focus === "function") e.focus();
          return fn(e);
        },
        when: () => {
          const e = currentEditor();
          if (!e) return false;
          return ready ? !!ready(e) : true;
        }
      });
      const holeAtCaret = (e) => typeof e.holeAtCursor === "function" ? e.holeAtCursor() : null;
      const caretHead = (e) => {
        const view = typeof e.getView === "function" ? e.getView() : null;
        return view ? view.state.selection.main.head : null;
      };
      const openTabIds = () => {
        if (typeof Persist.getOpenFileIds !== "function") return [];
        return Persist.getOpenFileIds() || [];
      };
      const stepTab = (delta) => {
        const ids = openTabIds();
        if (ids.length < 2) return false;
        const current = getPersist() ? getPersist().getCurrentFileId() : null;
        const at = ids.indexOf(current);
        const next = ids[((at < 0 ? 0 : at + delta) % ids.length + ids.length) % ids.length];
        if (!next || next === current) return false;
        switchToFile(next);
        return true;
      };
      on("project.new", () => newProject());
      on("file.new", () => newFile());
      on("file.upload", () => fileInputEl.click());
      on("file.upload-folder", () => uploadFolderInputEl.click());
      on("file.import-folder", () => folderInputEl.click());
      on("file.download", downloadCurrentFile);
      on("tab.next", () => stepTab(1), () => openTabIds().length > 1);
      on("tab.prev", () => stepTab(-1), () => openTabIds().length > 1);
      on(
        "tab.close",
        () => {
          const id = getPersist() ? getPersist().getCurrentFileId() : null;
          if (!id) return false;
          closeFile(id);
          return true;
        },
        () => !!(getPersist() && getPersist().getCurrentFileId())
      );
      const tabsRightOf = () => {
        const ids = openTabIds();
        const at = ids.indexOf(getPersist() ? getPersist().getCurrentFileId() : null);
        return at < 0 ? [] : ids.slice(at + 1);
      };
      const otherTabs = () => {
        const current = getPersist() ? getPersist().getCurrentFileId() : null;
        return openTabIds().filter((id) => id !== current);
      };
      on(
        "tab.close-others",
        () => {
          closeTabsForFiles(otherTabs());
          return true;
        },
        () => otherTabs().length > 0
      );
      on(
        "tab.close-right",
        () => {
          closeTabsForFiles(tabsRightOf());
          return true;
        },
        () => tabsRightOf().length > 0
      );
      on("file.save", () => {
        const p = getPersist();
        if (!p || typeof p.flushCheckpoint !== "function") return false;
        p.flushCheckpoint();
        const file = Persist.getFileById ? Persist.getFileById(p.getCurrentFileId()) : null;
        say(file && file.name ? "Saved " + file.name : "Saved.");
        return true;
      }, () => !!(getPersist() && getPersist().getCurrentFileId() && typeof getPersist().flushCheckpoint === "function"));
      on("file.open", (ctx) => {
        const wanted = String(ctx && ctx.argText || "").trim();
        if (!wanted) {
          say("Usage: :e <file>");
          return false;
        }
        const files = Persist.listFiles() || [];
        const lower = wanted.toLowerCase();
        const base = (n) => n.slice(n.lastIndexOf("/") + 1).toLowerCase();
        const hit = files.find((f) => f.name.toLowerCase() === lower) || files.find((f) => base(f.name) === lower) || files.find((f) => f.name.toLowerCase().indexOf(lower) >= 0);
        if (!hit) {
          say(`No file matching "${wanted}".`);
          return false;
        }
        switchToFile(hit.id);
        return true;
      });
      const membership = () => {
        const id = getPersist() ? getPersist().getCurrentFileId() : null;
        const file = id && Persist.getFileById ? Persist.getFileById(id) : null;
        if (!file || !file.name || !activeSuiteMembership) return null;
        const m = activeSuiteMembership(file.name);
        return m && m.cfg ? { ...m, file } : null;
      };
      const editSuite = (add) => {
        const m = membership();
        if (!m) return false;
        const dir = ProjectSource.dirOf(m.file.name);
        if (add) Persist.addEntryToCfg(m.cfg, m.file.name);
        else Persist.removeEntryFromCfg(m.cfg, m.file.name);
        afterSuiteEdit(dir, m.cfg);
        const cfgName = m.cfg.slice(m.cfg.lastIndexOf("/") + 1);
        say((add ? "Added to " : "Removed from ") + cfgName);
        return true;
      };
      on("suite.add-file", () => editSuite(true), () => {
        const m = membership();
        return !!m && !m.member;
      });
      on("suite.remove-file", () => editSuite(false), () => {
        const m = membership();
        return !!m && m.member;
      });
      on("edit.undo", () => editorExec("undo"));
      on("edit.redo", () => editorExec("redo"));
      on("edit.find", () => editorExec("openSearch"));
      on("edit.search-project", () => CommandPalette.open({ mode: "search" }));
      on("edit.toggle-comment", () => editorExec("toggleComment"));
      on("edit.format", () => editorExec("format"));
      onEditor("edit.rename", (e) => e.rename());
      onEditor("edit.select-all", (e) => e.selectAll());
      on("nav.symbol", () => CommandPalette.open({ mode: "symbols" }));
      onEditor("nav.definition", (e) => e.goToDefinition());
      onEditor("nav.references", (e) => e.findReferences());
      onEditor("nav.enclosing-decl", (e) => {
        const head = caretHead(e);
        if (head == null) return false;
        const span = e.getDeclSpan(head);
        if (!span) return false;
        return e.jumpToRange({ from: span.from, to: span.from });
      });
      onEditor("nav.binder", (e) => e.revealBinder());
      onEditor("nav.inspector", (e) => e.revealInInspector());
      onEditor("nav.next-hole", (e) => e.cycleHole(1));
      onEditor("nav.prev-hole", (e) => e.cycleHole(-1));
      onEditor("nav.next-problem", (e) => e.jumpToNextError());
      onEditor("nav.prev-problem", (e) => e.jumpToPrevError());
      onEditor("prover.hole-intro", (e) => e.runHoleIntro(), holeAtCaret);
      onEditor("prover.hole-split", (e) => e.runHoleSplit(), holeAtCaret);
      onEditor("prover.hole-fill", (e) => e.runHoleFill(), holeAtCaret);
      onEditor("prover.open-in-harpoon", (e) => e.openHoleInHarpoon(), holeAtCaret);
      const lab = () => {
        const H = window.Harpoon;
        return H && typeof H.activeSession === "function" ? H.activeSession() : null;
      };
      const manualState = () => {
        const s = lab();
        return s && s.manual && s.manual.state || null;
      };
      const onLab = (id, fn, ready) => Commands2.attach(id, {
        run: () => {
          const s = lab();
          if (!s) return false;
          return fn(s) !== false;
        },
        when: () => {
          const s = lab();
          return !!s && (!ready || ready(s));
        }
      });
      const stepGoal = (delta) => (s) => {
        const st = s.manual && s.manual.state;
        if (!st || !st.holes || st.holes.length < 2) return false;
        const n = st.holes.length;
        s.manualFocus(((st.focusIdx < 0 ? 0 : st.focusIdx) + delta + n) % n);
        return true;
      };
      const manyGoals = (s) => {
        const st = s.manual && s.manual.state;
        return !!st && !!st.holes && st.holes.length > 1;
      };
      onLab("harpoon.next-goal", stepGoal(1), manyGoals);
      onLab("harpoon.prev-goal", stepGoal(-1), manyGoals);
      const editorApi = () => window.BelEditor || null;
      const canUndoMove = (s) => {
        const E = editorApi();
        const st = s.manual && s.manual.state;
        return !!(E && st && typeof E.manualCanUndo === "function" && E.manualCanUndo(st));
      };
      const canRedoMove = (s) => {
        const E = editorApi();
        const st = s.manual && s.manual.state;
        return !!(E && st && typeof E.manualCanRedo === "function" && E.manualCanRedo(st));
      };
      onLab("harpoon.undo-move", (s) => {
        s.manualStepBack();
        return true;
      }, canUndoMove);
      onLab("harpoon.redo-move", (s) => {
        s.manualStepForward();
        return true;
      }, canRedoMove);
      const searching = (s) => !!s.nativeAuto;
      onLab(
        "harpoon.orca-start",
        (s) => {
          s.runOrca();
          return true;
        },
        (s) => !s.nativeAuto && !!(s.manual && s.manual.state)
      );
      onLab("harpoon.orca-pause", (s) => {
        s.toggleOrcaPause();
        return true;
      }, searching);
      onLab("harpoon.orca-absorb", (s) => {
        s.backToManual();
        return true;
      }, searching);
      for (const spec of SETTINGS) {
        on(settingId(spec.slug), () => toggleSetting(spec));
      }
      on("settings.set", (ctx) => runSet(ctx && ctx.argText));
      on("cmdline.open", () => StatusStrip.openCommandLine(""));
      on(
        "keys.full-keyboard",
        () => {
          FullKeyboard.toggle();
          return true;
        },
        () => FullKeyboard.isSupported()
      );
      on("keys.macros", () => AvailableMacros.open());
      on(
        "cmdline.repeat",
        () => StatusStrip.repeatLastCommand(),
        () => !!(typeof StatusStrip !== "undefined" && StatusStrip.lastCommandLine && StatusStrip.lastCommandLine())
      );
      on("tools.palette", () => CommandPalette.open());
      on("nav.anywhere", () => CommandPalette.open());
      on("tools.commands", () => CommandPalette.runCommandEntry());
      onEditor("edit.autocomplete", (e) => e.toggleAutocomplete() !== false);
      on("tools.graph", () => window.CurrentEditor?.openDependencyGraph());
      on("tools.inspector", () => window.dispatchEvent(new Event("beljar:open-inspector")));
      const runDefault = () => {
        const id = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
        const file = (Persist.listFiles() || []).filter((f) => f.id === id)[0] || null;
        if (file && /\.cfg$/i.test(file.name)) {
          BelugaRun.runModuleCfg(file.name);
          return true;
        }
        if (!file || !moduleNameFor(file.id)) {
          BelugaRun.runFile();
          return true;
        }
        BelugaRun.runToHere();
        return true;
      };
      on("run.default", runDefault);
      on("run.file", () => {
        if (BelugaRun.runFile) BelugaRun.runFile();
      });
      on("run.here", () => {
        if (BelugaRun.runToHere) BelugaRun.runToHere();
      });
      on("run.module", () => {
        if (BelugaRun.runModule) BelugaRun.runModule();
      }, () => !!moduleNameFor());
      on("run.project", () => {
        if (BelugaRun.runProject) BelugaRun.runProject();
      }, () => signatureFileCount() > 1);
      on("run.clear-output", () => {
        ReplOutput.clearOutput();
      });
      on("view.theme", toggleTheme);
      on("view.explorer", () => toggleSidePanel("explorer"));
      on("view.library", () => toggleSidePanel("library"));
      on("view.harpoon", () => toggleSidePanel("harpoon"));
      on("view.edit-history", () => {
        window.StatusStrip?.openHistory?.();
      });
      on("view.settings", () => {
        SettingsUI.open();
      });
      onEditor("fold.all", (e) => e.foldAll());
      onEditor("fold.unfold-all", (e) => e.unfoldAll());
      CommandPalette.setProvider("files", () => {
        const currentId = getPersist() ? getPersist().getCurrentFileId() : null;
        return Persist.listFiles().filter((f) => f.id !== currentId).map((f) => ({ title: f.name, detail: "Switch to file", run: () => switchToFile(f.id) }));
      });
      CommandPalette.setProvider("symbols", () => {
        const ed = window.CurrentEditor;
        const engine = ed && ed.getSemanticEngine ? ed.getSemanticEngine() : null;
        const snap = engine && engine.getSnapshot ? engine.getSnapshot() : null;
        const symbols = snap && snap.symbols ? snap.symbols.globalSymbols : [];
        function statusPrefix(symbolId) {
          const node = snap && snap.graph && snap.graph.nodeMap ? snap.graph.nodeMap.get(symbolId) : null;
          const st = node && node.status;
          if (st === "syntax-fault" || st === "erroring") return "\u26A0 ";
          if (st === "blocked") return "\u2298 ";
          return "";
        }
        const items = symbols.map((s) => ({
          title: statusPrefix(s.id) + s.name,
          detail: s.label || "",
          run: () => ed.jumpToRange(s.nameRange || s.range)
        }));
        const cross = ed && typeof ed.listProjectSymbols === "function" ? ed.listProjectSymbols() : [];
        for (const s of cross) {
          items.push({
            title: s.name,
            detail: s.fileName.split("/").pop(),
            run: () => openFileAt(s.fileId, s.from, s.to)
          });
        }
        return items;
      });
      CommandPalette.setProvider("search", (query) => {
        if (!query) return [];
        const activeId = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
        const entries = Persist.listFiles().map((f) => ({
          id: f.id,
          name: f.name,
          text: projectFileText(f.id)
        }));
        return ProjectSource.scanProjectText(entries, query, 60).map((m) => ({
          title: m.lineText,
          mono: true,
          detail: m.name.split("/").pop() + ":" + m.line,
          run: () => openFileAt(m.id, m.from, m.to)
        }));
      });
    }
  }

  // js/app/app.mjs
  var teardown = [];
  var mounted = false;
  var editor = null;
  function onWin(type, fn, opts) {
    window.addEventListener(type, fn, opts);
    teardown.push(() => window.removeEventListener(type, fn, opts));
  }
  function mount() {
    if (mounted) return;
    mounted = true;
    const editorMount = document.getElementById("editor");
    const editorEmptyEl = document.getElementById("editor-empty");
    const inspectorProjectEmptyEl = document.getElementById("inspector-project-empty");
    const cmdInput = typeof ReplStream !== "undefined" && ReplStream.getCommandInput ? ReplStream.getCommandInput() : document.getElementById("command-input");
    const btnRun = typeof ReplStream !== "undefined" && ReplStream.getRunButton ? ReplStream.getRunButton() : document.getElementById("btn-run");
    Persist.ensureProject();
    ensureProjectActiveCfgs();
    if (typeof EditHistoryInstall !== "undefined") {
      EditHistoryInstall.init();
    }
    const openFileIds = Persist.getOpenFileIds();
    const activeFileId = openFileIds.length ? openFileIds.includes(Persist.getActiveFileId()) ? Persist.getActiveFileId() : openFileIds[0] : null;
    let persist = activeFileId ? Persist.createPersist({ documentId: activeFileId }) : null;
    const initialCheckpoint = persist ? persist.getInitialCheckpoint() : null;
    function mountEditorFor(snapshot, openOpts) {
      if (typeof BelEditor === "undefined" || !BelEditor.mount) return null;
      const initialLocal = openOpts && openOpts.initialLocal != null ? openOpts.initialLocal : snapshot ? snapshot.editor.local : null;
      const docId = persist && persist.getCurrentFileId() || snapshot && snapshot.meta && snapshot.meta.documentId || void 0;
      const file = docId ? Persist.getFileById(docId) : null;
      const ed = BelEditor.mount(editorMount, {
        doc: snapshot ? snapshot.editor.text : persist ? persist.getEditorText() : "",
        initialLocal,
        semanticCheckpoint: snapshot ? snapshot.semantic : null,
        documentId: docId,
        filePath: file ? file.name : void 0,
        jumpAt: openOpts && openOpts.jumpAt,
        persist,
        onDocChange: function(text) {
          if (persist) {
            if (text == null && typeof persist.markEditorDirty === "function") {
              persist.markEditorDirty();
            } else {
              persist.scheduleEditorPersist(text);
            }
          }
          if (file && /\.cfg$/i.test(file.name)) scheduleCfgExplorerRefresh(file.name);
        }
      });
      if (ed && typeof EditHistory !== "undefined") {
        queueMicrotask(() => {
          const id = ed.getCurrentFileId?.();
          const text = ed.getValue?.();
          if (id != null && text != null) EditHistory.reconcileActiveFile(id, text);
        });
      }
      return ed;
    }
    function getActiveEditorView() {
      return editor && editor.getView ? editor.getView() : null;
    }
    function getSemanticEngine() {
      return editor && editor.getSemanticEngine ? editor.getSemanticEngine() : null;
    }
    function collectWorkspaceFloating(fileId, out) {
      if (!fileId || !out) return;
      if (typeof BelEditor !== "undefined") {
        if (BelEditor.collectFloatingInspectorWindows) {
          BelEditor.collectFloatingInspectorWindows(fileId, out);
        }
        if (BelEditor.collectFloatingGraphWindows) {
          BelEditor.collectFloatingGraphWindows(fileId, out);
        }
      }
      if (typeof Harpoon !== "undefined" && Harpoon.collectFloatingHarpoonWindows) {
        Harpoon.collectFloatingHarpoonWindows(fileId, out);
      }
    }
    function restoreWorkspaceFloating(floats, deps) {
      const view = deps && deps.view;
      const engine = deps && deps.engine;
      if (!view || !Array.isArray(floats)) return;
      const sorted = floats.slice().sort((a, b) => (a.zOrder || 0) - (b.zOrder || 0));
      let skipped = 0;
      for (const entry of sorted) {
        let ok = false;
        if (entry.kind === "inspector" && typeof BelEditor !== "undefined" && BelEditor.restoreFloatingInspectorWindow) {
          ok = BelEditor.restoreFloatingInspectorWindow(entry, view);
        } else if (entry.kind === "graph" && typeof BelEditor !== "undefined" && BelEditor.restoreFloatingGraphWindow) {
          ok = BelEditor.restoreFloatingGraphWindow(entry, view);
        } else if (entry.kind === "harpoon" && typeof Harpoon !== "undefined" && Harpoon.restoreFloatingHarpoonWindow) {
          ok = Harpoon.restoreFloatingHarpoonWindow(entry, view, engine);
        }
        if (!ok) skipped += 1;
      }
      if (skipped > 0 && Toasts.error) {
        Toasts.error(
          skipped === 1 ? "Could not restore a floating window after reload." : `Could not restore ${skipped} floating windows after reload.`,
          { duration: "long" }
        );
      }
    }
    function registerWorkspaceProviders() {
      WorkspaceState.registerProvider("inspector", {
        collect(out) {
          if (typeof BelEditor !== "undefined" && BelEditor.collectWorkspaceInspector) {
            BelEditor.collectWorkspaceInspector(out);
          }
        },
        restoreSidebar(sidebar, deps) {
          if (typeof BelEditor !== "undefined" && BelEditor.restoreWorkspaceInspector) {
            BelEditor.restoreWorkspaceInspector(sidebar, deps);
          }
        }
      });
      WorkspaceState.registerProvider("explorer", {
        collect(out) {
          if (getExplorerController() && getExplorerController().collectWorkspaceExplorer) {
            getExplorerController().collectWorkspaceExplorer(out);
          }
        },
        restoreSidebar(sidebar) {
          if (!workspaceEl?.classList.contains("is-explorer-open")) return;
          if (getExplorerController() && getExplorerController().restoreWorkspaceExplorer) {
            getExplorerController().restoreWorkspaceExplorer(sidebar);
          }
        }
      });
      WorkspaceState.registerProvider("harpoon-panel", {
        collect(out) {
          if (typeof HarpoonPanel !== "undefined" && HarpoonPanel.collectWorkspaceHarpoon) {
            HarpoonPanel.collectWorkspaceHarpoon(out);
          }
        },
        restoreSidebar(sidebar, deps) {
          if (!workspaceEl?.classList.contains("is-harpoon-open")) return;
          if (typeof HarpoonPanel !== "undefined" && HarpoonPanel.restoreWorkspaceHarpoon) {
            HarpoonPanel.restoreWorkspaceHarpoon(sidebar, deps);
          }
        }
      });
      WorkspaceState.registerProvider("floating", {
        collect(out) {
          const fileId = persist ? persist.getCurrentFileId() : Persist.getActiveFileId();
          collectWorkspaceFloating(fileId, out);
        }
      });
    }
    function applyStoredSidePanel(id) {
      if (!id) return;
      if (typeof Persist.readStoredRestorePanels === "function" && !Persist.readStoredRestorePanels()) return;
      closeOtherSidePanels(id);
      setSidePanelOpen(id, true);
      notifySidePanelLayout();
    }
    let workspaceBootPending = true;
    const restoredFloatIds = /* @__PURE__ */ new Set();
    function restoreWorkspaceForFile(fileId) {
      if (!fileId) return;
      const ws = WorkspaceState.readWorkspace();
      const openIds = Persist.getOpenFileIds();
      const floats = WorkspaceState.filterFloatingForFile(ws.floating, fileId, openIds).filter((entry) => !restoredFloatIds.has(entry.id));
      if (!floats.length) return;
      restoreWorkspaceFloating(floats, {
        view: getActiveEditorView(),
        engine: getSemanticEngine(),
        activeFileId: fileId
      });
      floats.forEach((entry) => restoredFloatIds.add(entry.id));
    }
    function restoreWorkspaceState() {
      const ws = WorkspaceState.readWorkspace();
      WorkspaceState.applyWorkspace(ws, {
        projectId: Persist.getActiveProjectId(),
        openFileIds: Persist.getOpenFileIds(),
        activeFileId: persist ? persist.getCurrentFileId() : Persist.getActiveFileId(),
        view: getActiveEditorView(),
        engine: getSemanticEngine(),
        applySidePanel: applyStoredSidePanel,
        restoreFloating: (floats, deps) => {
          const pending = (floats || []).filter((entry) => !restoredFloatIds.has(entry.id));
          if (!pending.length) return;
          restoreWorkspaceFloating(pending, deps);
          pending.forEach((entry) => restoredFloatIds.add(entry.id));
        }
      });
    }
    function isCfgFileName(name) {
      return /\.cfg$/i.test(String(name || ""));
    }
    function editorViewIsCfg(ed) {
      if (!ed || typeof ed.getView !== "function") return false;
      const view = ed.getView();
      return !!(view && view.dom && view.dom.classList.contains("bel-editor--cfg"));
    }
    function remountActiveEditor(openOpts) {
      if (!persist || !editor) return;
      const id = persist.getCurrentFileId();
      if (!id) return;
      persist.flushCheckpoint();
      const snapshot = persist.getInitialCheckpoint();
      editor.destroy();
      editor = mountEditorFor(snapshot, openOpts || {});
      window.CurrentEditor = editor;
      window.BelJarCurrentEditor = window.CurrentEditor;
      syncEditorCmTheme();
      if (typeof BelugaClient !== "undefined" && BelugaClient.noteEditorChange) {
        BelugaClient.noteEditorChange(editor ? editor.getValue() : "");
      }
      notifyActiveEditorView();
      refreshInspector();
      updateRunButtonTooltip();
    }
    function ensureEditorMatchesFileKind() {
      if (!persist || !editor) return;
      const id = persist.getCurrentFileId();
      if (!id) return;
      const file = Persist.getFileById(id);
      if (!file) return;
      if (isCfgFileName(file.name) !== editorViewIsCfg(editor)) remountActiveEditor();
    }
    editor = activeFileId ? mountEditorFor(initialCheckpoint) : null;
    ensureEditorMatchesFileKind();
    window.CurrentEditor = editor;
    window.BelJarCurrentEditor = window.CurrentEditor;
    let cfgExplorerRefreshTimer = null;
    function projectFileText(fileId) {
      if (!fileId) return "";
      const activeId = Persist.getActiveFileId();
      const ed = typeof window !== "undefined" ? window.CurrentEditor : null;
      if (fileId === activeId && ed && typeof ed.getValue === "function") {
        return ed.getValue();
      }
      return Persist.getFileText(fileId) ?? "";
    }
    function scheduleCfgExplorerRefresh(cfgName) {
      clearTimeout(cfgExplorerRefreshTimer);
      cfgExplorerRefreshTimer = setTimeout(() => onCfgContentChange(cfgName), 80);
    }
    function onCfgContentChange(cfgName) {
      const dir = ProjectSource.dirOf(cfgName);
      reconcileActiveCfgsInDir(dir, cfgName);
      const activeFile = activeFileRecord();
      if (editor?.remoduleContext && activeFile && ProjectSource.dirOf(activeFile.name) === dir) {
        editor.remoduleContext();
      }
      renderExplorerTree();
      updateHeaderContext();
      updateRunButtonTooltip();
    }
    function projectIsEmpty() {
      return Persist.listFiles().length === 0;
    }
    function projectTreeEmpty() {
      return Persist.listFiles().length === 0 && Persist.listEmptyFolders().length === 0;
    }
    function editorCanvasIdle() {
      if (projectIsEmpty()) return true;
      return Persist.getOpenFileIds().length === 0;
    }
    function enterCanvasIdleView() {
      if (persist) persist.flushCheckpoint();
      WorkspaceState.flushWorkspace();
      if (editor && typeof editor.destroy === "function") editor.destroy();
      editor = null;
      window.CurrentEditor = null;
      window.BelJarCurrentEditor = window.CurrentEditor;
      persist = null;
      if (typeof FloatingWindow !== "undefined" && FloatingWindow.closeAll) FloatingWindow.closeAll();
      if (typeof BelugaClient !== "undefined" && BelugaClient.noteEditorChange) {
        BelugaClient.noteEditorChange("");
      }
      const ex = getExplorerController();
      if (ex && typeof ex.clearSelection === "function") ex.clearSelection();
      updateEditorEmptyState();
      updateInspectorProjectEmpty();
      renderTabs();
      renderExplorerTree();
      updateHeaderContext();
    }
    function enterEmptyProjectView() {
      if (Persist.clearEmptyFolders) {
        Persist.clearEmptyFolders();
      }
      enterCanvasIdleView();
    }
    function ensurePersistForFile(id) {
      if (!id) return null;
      if (!persist) persist = Persist.createPersist({ documentId: id });
      return persist;
    }
    function syncEditorCmTheme() {
      if (!editor || typeof editor.setDarkTheme !== "function") return;
      editor.setDarkTheme(!document.documentElement.classList.contains("light"));
    }
    window.syncEditorCmTheme = syncEditorCmTheme;
    if (editor) syncEditorCmTheme();
    function onWorkspaceLayoutResize() {
      if (editor && editor.getView) editor.getView().requestMeasure();
    }
    WorkspaceSplit.init({ onResize: onWorkspaceLayoutResize });
    SidePanelResize.init({ onResize: onWorkspaceLayoutResize });
    var restoredTranscript = typeof ReplPersist !== "undefined" && ReplPersist.restore && ReplPersist.restore();
    if (!restoredTranscript) ReplOutput.insertWelcomeBanner();
    BelugaRun.init();
    Frame.mount();
    if (typeof Persist !== "undefined") {
      if (Persist.applyStoredMotionPref) Persist.applyStoredMotionPref();
      if (Persist.applyStoredEditorChrome) Persist.applyStoredEditorChrome();
    }
    function shouldApplyEditorPrefs(key) {
      if (!key || key === "layout-reset") return false;
      if (key === "theme") return false;
      if (/^repl-/.test(key) || key === "repl-reset") return false;
      if (/^beluga-/.test(key) || key === "beluga-reset") return false;
      if (key === "check-aggressiveness" || key === "suite-check") return false;
      if (/^autosolve-/.test(key) || /^harpoon-/.test(key) || key === "harpoon-reset") return false;
      if (key === "workspace-reset" || key === "restore-panels" || key === "library-expand-default" || key === "inspector-follow") return false;
      if (key === "motion-pref" || key === "toast-duration") return false;
      if (/^alias/.test(key) || key === "aliases-reset") return false;
      return true;
    }
    function applyLiveSettings(key) {
      if (!key || key === "layout-reset") return;
      if (key === "theme" || key === "appearance-reset" || key === "settings-import") syncEditorCmTheme();
      if (key === "appearance-reset" || key === "motion-pref" || key === "settings-import") {
        if (typeof Persist !== "undefined" && Persist.applyStoredMotionPref) Persist.applyStoredMotionPref();
      }
      if (key === "appearance-reset" || key === "editor-reset" || key === "settings-import" || key === "editor-font-family" || key === "editor-hole-emphasis") {
        if (typeof Persist !== "undefined" && Persist.applyStoredEditorChrome) Persist.applyStoredEditorChrome();
      }
      if (shouldApplyEditorPrefs(key) || key === "editor-reset" || key === "settings-import") {
        if (typeof BelEditor !== "undefined" && typeof BelEditor.applyEditorPrefs === "function") {
          BelEditor.applyEditorPrefs();
        }
      }
      if (key === "keymap-style" || key === "status-strip" || key === "keybindings-reset" || key === "settings-import" || key === "settings-reset-all") {
        if (typeof StatusStrip !== "undefined" && typeof StatusStrip.apply === "function") StatusStrip.apply();
      }
      if ((key === "library-expand-default" || key === "workspace-reset") && getLibraryController() && typeof getLibraryController().refresh === "function") {
        getLibraryController().refresh();
      }
      if (key === "repl-history-persist" || key === "repl-reset") {
        if (typeof ReplPersist !== "undefined" && ReplPersist.saveNow) {
          ReplPersist.saveNow();
        }
      }
    }
    window.beljarApplyLiveSettings = applyLiveSettings;
    onWin("beljar:settings-changed", function(e) {
      applyLiveSettings(e && e.detail ? e.detail.key : "");
    });
    function showToast(message, opts) {
      return Toasts.show(message, opts);
    }
    if (!editor && (typeof BelEditor === "undefined" || !BelEditor.mount)) {
      {
        Toasts.error("CodeMirror editor bundle failed to load.", { duration: 0, closable: true });
      }
    }
    function setTip(el, text, opts) {
      if (!el || typeof Tooltips === "undefined" || !Tooltips.set) return;
      Tooltips.set(el, text, opts);
    }
    function toggleTheme() {
      return Frame.toggleTheme();
    }
    window.Repl = {
      appendBuffered: function(text, kind) {
        ReplOutput.appendOutput(text, kind || "auto");
      }
    };
    window.BelJarRepl = window.Repl;
    const filesBtn = document.getElementById("btn-files");
    const inspectorBtn = document.getElementById("btn-inspector");
    const libraryBtn = document.getElementById("btn-library");
    const harpoonBtn = document.getElementById("btn-harpoon");
    const workspaceEl = document.querySelector(".workspace");
    const explorerPanelEl = document.getElementById("explorer-panel");
    const inspectorPanelEl = document.getElementById("inspector-panel");
    const libraryPanelEl = document.getElementById("library-panel");
    const harpoonPanelEl = document.getElementById("harpoon-panel");
    const SIDE_PANELS = {
      explorer: {
        btn: filesBtn,
        panel: explorerPanelEl,
        openClass: "is-explorer-open",
        writeOpen: (open) => {
          Persist.writeStoredExplorerOpen(open);
        }
      },
      inspector: {
        btn: inspectorBtn,
        panel: inspectorPanelEl,
        openClass: "is-inspector-open",
        writeOpen: (open) => {
          Persist.writeStoredInspectorOpen(open);
        }
      },
      library: {
        btn: libraryBtn,
        panel: libraryPanelEl,
        openClass: "is-library-open",
        writeOpen: (open) => {
          Persist.writeStoredLibraryOpen(open);
          if (!open) {
            const lib = getLibraryController();
            if (lib && typeof lib.collapseFolders === "function") lib.collapseFolders();
          }
        }
      },
      harpoon: {
        btn: harpoonBtn,
        panel: harpoonPanelEl,
        openClass: "is-harpoon-open",
        writeOpen: (open) => {
          if (Persist.writeStoredHarpoonOpen) {
            Persist.writeStoredHarpoonOpen(open);
          }
        }
      }
    };
    const editorTabsEl = document.getElementById("editor-tabs");
    const cfgTabLint = /* @__PURE__ */ new Map();
    function liveFileLint() {
      const ed = window.CurrentEditor;
      if (!ed || typeof ed.getIdeStatus !== "function") return null;
      const st = ed.getIdeStatus();
      return { errors: st.errors, warnings: st.warnings };
    }
    function belFileHealth(fileId) {
      if (typeof BelEditor === "undefined" || typeof BelEditor.fileHealthFor !== "function") {
        return { errors: 0, warnings: 0, items: [] };
      }
      const activeId = Persist.getActiveFileId();
      let live = null;
      if (fileId === activeId && window.CurrentEditor?.getValue) {
        live = window.CurrentEditor.getValue();
      }
      return BelEditor.fileHealthFor(fileId, live);
    }
    function fileLintCounts(fileId, activeId) {
      const file = Persist.getFileById(fileId);
      const name = file?.name || "";
      if (/\.cfg$/i.test(name)) {
        return fileId === activeId ? liveFileLint() : cfgTabLint.get(fileId);
      }
      if (ProjectSource.isSignaturePath(name)) {
        return belFileHealth(fileId);
      }
      return null;
    }
    function fileTabHasErrors(fileId, activeId) {
      const lint = fileLintCounts(fileId, activeId);
      return !!(lint && lint.errors > 0);
    }
    function rememberCfgLint(fileId, lint) {
      if (!fileId || !lint) return;
      cfgTabLint.set(fileId, {
        errors: lint.errors || 0,
        warnings: lint.warnings || 0,
        items: Array.isArray(lint.items) ? lint.items : cfgTabLint.get(fileId)?.items
      });
    }
    function lintTooltipHead(items) {
      if (!items || !items.length) return "";
      const errs = items.filter((d) => d.kind === "error").length;
      const warns = items.length - errs;
      const parts = [];
      if (errs) parts.push(errs === 1 ? "1 error" : `${errs} errors`);
      if (warns) parts.push(warns === 1 ? "1 warning" : `${warns} warnings`);
      return parts.join(" \xB7 ");
    }
    function explorerFileDiagItems(fileId, fileName) {
      const low = String(fileName || "").toLowerCase();
      if (low.endsWith(".cfg")) {
        const activeId = Persist.getActiveFileId();
        const ed = window.CurrentEditor;
        if (fileId === activeId && ed && typeof ed.getLintTooltipItems === "function") {
          return ed.getLintTooltipItems();
        }
        const cached = cfgTabLint.get(fileId);
        return cached && Array.isArray(cached.items) ? cached.items : null;
      }
      if (ProjectSource.isSignaturePath(fileName)) {
        const health = belFileHealth(fileId);
        return health?.items?.length ? health.items : null;
      }
      return null;
    }
    function bindExplorerDiagTip(el, fileId, fileName, diag) {
      if (!el || !diag) return;
      el.removeAttribute("title");
      const items = explorerFileDiagItems(fileId, fileName);
      if (items && items.length) {
        el.setAttribute("data-tooltip", lintTooltipHead(items));
        el.setAttribute("data-tooltip-head", "");
        el.setAttribute("data-tooltip-errors", JSON.stringify(items));
        if (typeof Tooltips !== "undefined" && Tooltips.bind) Tooltips.bind(el);
        return;
      }
      setTip(el, diag === "error" ? "Has errors" : "Has warnings", { ariaLabel: false });
    }
    function updateTabLintStyles() {
      if (!editorTabsEl) return;
      const activeId = persist ? persist.getCurrentFileId() : Persist.getActiveFileId();
      editorTabsEl.querySelectorAll(".editor-tab[data-file-id]").forEach((tab) => {
        const id = tab.getAttribute("data-file-id");
        tab.classList.toggle("has-errors", fileTabHasErrors(id, activeId));
      });
      if (getExplorerController() && typeof getExplorerController().refreshDiags === "function") {
        getExplorerController().refreshDiags();
      }
    }
    let tabLintStyleRaf = 0;
    function scheduleTabLintStyles() {
      if (tabLintStyleRaf) return;
      tabLintStyleRaf = requestAnimationFrame(() => {
        tabLintStyleRaf = 0;
        updateTabLintStyles();
      });
    }
    var suiteCfgApi = null;
    var explorerBootstrapApi = null;
    var fileLifecycleApi = null;
    var uploadImportApi = null;
    var menusApi = null;
    var emptyStateApi = null;
    var sidePanelsApi = null;
    var fileTabsApi = null;
    function getExplorerController() {
      return explorerBootstrapApi && explorerBootstrapApi.getExplorerController ? explorerBootstrapApi.getExplorerController() : null;
    }
    function getLibraryController() {
      return explorerBootstrapApi && explorerBootstrapApi.getLibraryController ? explorerBootstrapApi.getLibraryController() : null;
    }
    function ensureProjectActiveCfgs() {
      if (suiteCfgApi) return suiteCfgApi.ensureProjectActiveCfgs.apply(suiteCfgApi, arguments);
      if (typeof ProjectSource.inferActiveCfgByDir !== "function") return;
      if (typeof Persist.backfillActiveCfgByDir !== "function") return;
      const files = Persist.listFiles();
      const getText = (id) => projectFileText(id);
      Persist.backfillActiveCfgByDir(ProjectSource.inferActiveCfgByDir(files, getText));
    }
    function ensureActiveCfgForDir() {
      return suiteCfgApi.ensureActiveCfgForDir.apply(suiteCfgApi, arguments);
    }
    function activeCfgForDir() {
      return suiteCfgApi.activeCfgForDir.apply(suiteCfgApi, arguments);
    }
    function activeCfgsForDir() {
      return suiteCfgApi.activeCfgsForDir.apply(suiteCfgApi, arguments);
    }
    function suiteLayoutForDir() {
      return suiteCfgApi.suiteLayoutForDir.apply(suiteCfgApi, arguments);
    }
    function reconcileActiveCfgsInDir() {
      return suiteCfgApi.reconcileActiveCfgsInDir.apply(suiteCfgApi, arguments);
    }
    function makeActiveCfgForFile() {
      return suiteCfgApi.makeActiveCfgForFile.apply(suiteCfgApi, arguments);
    }
    function moduleNameFor() {
      return suiteCfgApi.moduleNameFor.apply(suiteCfgApi, arguments);
    }
    function activeSuiteMembership() {
      return suiteCfgApi.activeSuiteMembership.apply(suiteCfgApi, arguments);
    }
    function explorerFileDiag() {
      return suiteCfgApi.explorerFileDiag.apply(suiteCfgApi, arguments);
    }
    function afterSuiteEdit() {
      return suiteCfgApi.afterSuiteEdit.apply(suiteCfgApi, arguments);
    }
    function activeFileRecord() {
      return suiteCfgApi.activeFileRecord.apply(suiteCfgApi, arguments);
    }
    function updateRunButtonTooltip() {
      return suiteCfgApi.updateRunButtonTooltip.apply(suiteCfgApi, arguments);
    }
    function explorerCreateMenuItems() {
      return explorerBootstrapApi.explorerCreateMenuItems.apply(explorerBootstrapApi, arguments);
    }
    function renameFolderInteractive() {
      return explorerBootstrapApi.renameFolderInteractive.apply(explorerBootstrapApi, arguments);
    }
    function ensureExplorer() {
      return explorerBootstrapApi.ensureExplorer.apply(explorerBootstrapApi, arguments);
    }
    function ensureLibrary() {
      return explorerBootstrapApi.ensureLibrary.apply(explorerBootstrapApi, arguments);
    }
    function renderExplorerTree() {
      return explorerBootstrapApi.renderExplorerTree.apply(explorerBootstrapApi, arguments);
    }
    function refreshExplorerActiveAndDiags() {
      return explorerBootstrapApi.refreshExplorerActiveAndDiags.apply(explorerBootstrapApi, arguments);
    }
    function refreshInspector() {
      return explorerBootstrapApi.refreshInspector.apply(explorerBootstrapApi, arguments);
    }
    function notifyActiveEditorView() {
      return explorerBootstrapApi.notifyActiveEditorView.apply(explorerBootstrapApi, arguments);
    }
    function switchToFile() {
      return fileLifecycleApi.switchToFile.apply(fileLifecycleApi, arguments);
    }
    function openFileAt() {
      return fileLifecycleApi.openFileAt.apply(fileLifecycleApi, arguments);
    }
    function newFile() {
      return fileLifecycleApi.newFile.apply(fileLifecycleApi, arguments);
    }
    function closeFile() {
      return fileLifecycleApi.closeFile.apply(fileLifecycleApi, arguments);
    }
    function deleteFileInteractive() {
      return fileLifecycleApi.deleteFileInteractive.apply(fileLifecycleApi, arguments);
    }
    function closeTabsForFiles() {
      return fileLifecycleApi.closeTabsForFiles.apply(fileLifecycleApi, arguments);
    }
    function selectionDeleteFileIds() {
      return fileLifecycleApi.selectionDeleteFileIds.apply(fileLifecycleApi, arguments);
    }
    function selectionDeleteDisabled() {
      return fileLifecycleApi.selectionDeleteDisabled.apply(fileLifecycleApi, arguments);
    }
    function deleteSelectionInteractive() {
      return fileLifecycleApi.deleteSelectionInteractive.apply(fileLifecycleApi, arguments);
    }
    function deleteFolderInteractive() {
      return fileLifecycleApi.deleteFolderInteractive.apply(fileLifecycleApi, arguments);
    }
    function exportLibraryAsNewProject() {
      return uploadImportApi.exportLibraryAsNewProject.apply(uploadImportApi, arguments);
    }
    function applyFileReplacement() {
      return uploadImportApi.applyFileReplacement.apply(uploadImportApi, arguments);
    }
    function deleteProjectFilesById() {
      return uploadImportApi.deleteProjectFilesById.apply(uploadImportApi, arguments);
    }
    function executeUploadPlan() {
      return uploadImportApi.executeUploadPlan.apply(uploadImportApi, arguments);
    }
    function reloadActiveEditorFromPersist() {
      return uploadImportApi.reloadActiveEditorFromPersist.apply(uploadImportApi, arguments);
    }
    function resolveAndApplyMove() {
      return uploadImportApi.resolveAndApplyMove.apply(uploadImportApi, arguments);
    }
    function downloadCurrentFile() {
      return uploadImportApi.downloadCurrentFile.apply(uploadImportApi, arguments);
    }
    function downloadFileById() {
      return uploadImportApi.downloadFileById.apply(uploadImportApi, arguments);
    }
    function downloadFolder() {
      return uploadImportApi.downloadFolder.apply(uploadImportApi, arguments);
    }
    function downloadSuite() {
      return uploadImportApi.downloadSuite.apply(uploadImportApi, arguments);
    }
    function suiteDownloadState() {
      return uploadImportApi.suiteDownloadState.apply(uploadImportApi, arguments);
    }
    function signatureFileCount() {
      return menusApi.signatureFileCount.apply(menusApi, arguments);
    }
    function explorerSelectionContextItems() {
      return menusApi.explorerSelectionContextItems.apply(menusApi, arguments);
    }
    function fileContextItems() {
      return menusApi.fileContextItems.apply(menusApi, arguments);
    }
    function explorerFolderContextItems() {
      return menusApi.explorerFolderContextItems.apply(menusApi, arguments);
    }
    function backgroundRunItems() {
      return menusApi.backgroundRunItems.apply(menusApi, arguments);
    }
    function editorExec() {
      return menusApi.editorExec.apply(menusApi, arguments);
    }
    function updateInspectorProjectEmpty() {
      return emptyStateApi.updateInspectorProjectEmpty.apply(emptyStateApi, arguments);
    }
    function updateEditorEmptyState() {
      return emptyStateApi.updateEditorEmptyState.apply(emptyStateApi, arguments);
    }
    function setSidePanelOpen() {
      return sidePanelsApi.setSidePanelOpen.apply(sidePanelsApi, arguments);
    }
    function closeOtherSidePanels() {
      return sidePanelsApi.closeOtherSidePanels.apply(sidePanelsApi, arguments);
    }
    function notifySidePanelLayout() {
      return sidePanelsApi.notifySidePanelLayout.apply(sidePanelsApi, arguments);
    }
    function toggleSidePanel() {
      return sidePanelsApi.toggleSidePanel.apply(sidePanelsApi, arguments);
    }
    function wireSidebarOpenTooltip() {
      return sidePanelsApi.wireSidebarOpenTooltip.apply(sidePanelsApi, arguments);
    }
    function renderTabs() {
      return fileTabsApi.renderTabs.apply(fileTabsApi, arguments);
    }
    const peelHub = {
      getEditor: () => editor,
      setEditor: (ed) => {
        editor = ed;
        window.CurrentEditor = ed;
        window.BelJarCurrentEditor = ed;
      },
      getPersist: () => persist,
      setPersist: (p) => {
        persist = p;
      }
    };
    function __initAppPeels() {
      emptyStateApi = create({
        getInspectorPanelEl: () => inspectorPanelEl,
        getInspectorProjectEmptyEl: () => inspectorProjectEmptyEl,
        getEditorEmptyEl: () => editorEmptyEl,
        getEditorMount: () => editorMount,
        projectTreeEmpty,
        editorCanvasIdle
      });
      sidePanelsApi = create2({
        workspaceEl,
        panels: SIDE_PANELS,
        onLayout: () => {
          if (editor && editor.getView) editor.getView().requestMeasure();
        },
        scheduleWorkspaceSave: () => {
          WorkspaceState.scheduleSave();
        }
      });
      fileTabsApi = create3({
        editorTabsEl,
        listOpenFiles: () => {
          return Persist.getOpenFileIds().map((id) => Persist.getFileById(id)).filter(Boolean);
        },
        getActiveId: () => persist ? persist.getCurrentFileId() : Persist.getActiveFileId(),
        fileHasErrors: (fileId) => {
          const activeId = persist ? persist.getCurrentFileId() : Persist.getActiveFileId();
          return fileTabHasErrors(fileId, activeId);
        },
        setTip,
        onSwitch: (id) => switchToFile(id),
        onClose: (id) => closeFile(id),
        onNew: () => newFile()
      });
      suiteCfgApi = create4(Object.assign({}, peelHub, {
        projectFileText,
        showToast,
        belFileHealth,
        liveFileLint,
        cfgTabLint,
        setTip,
        renderExplorerTree,
        updateHeaderContext,
        reloadActiveEditorFromPersist,
        renderTabs,
        getLibraryController
      }));
      uploadImportApi = create5(Object.assign({}, peelHub, {
        showToast,
        projectFileText,
        switchToFile,
        switchProjectAndReload,
        ensureEditorMatchesFileKind,
        updateEditorEmptyState,
        renderTabs,
        renderExplorerTree,
        updateHeaderContext,
        updateRunButtonTooltip,
        enterEmptyProjectView,
        enterCanvasIdleView,
        projectIsEmpty,
        onCfgContentChange,
        cfgTabLint
      }));
      fileLifecycleApi = create6(Object.assign({}, peelHub, {
        mountEditorFor,
        ensurePersistForFile,
        syncEditorCmTheme,
        updateEditorEmptyState,
        renderTabs,
        renderExplorerTree,
        updateHeaderContext,
        updateRunButtonTooltip,
        notifyActiveEditorView,
        refreshInspector,
        refreshExplorerActiveAndDiags,
        scheduleTabLintStyles,
        liveFileLint,
        rememberCfgLint,
        cfgTabLint,
        ensureActiveCfgForDir,
        ensureEditorMatchesFileKind,
        showToast,
        projectIsEmpty,
        enterCanvasIdleView,
        enterEmptyProjectView,
        deleteProjectFilesById,
        getExplorerController,
        syncCfgEditorsAfterRewrite: uploadImportApi.syncCfgEditorsAfterRewrite
      }));
      explorerBootstrapApi = create7(Object.assign({}, peelHub, {
        projectFileText,
        showToast,
        setTip,
        explorerPanelEl,
        libraryPanelEl,
        inspectorPanelEl,
        inspectorProjectEmptyEl,
        renderTabs,
        updateHeaderContext,
        updateRunButtonTooltip,
        reloadActiveEditorFromPersist,
        switchToFile,
        ensureEditorMatchesFileKind,
        activeCfgForDir,
        activeCfgsForDir,
        suiteLayoutForDir,
        explorerFileDiag,
        bindExplorerDiagTip,
        makeActiveCfgForFile,
        fileContextItems,
        explorerSelectionContextItems,
        explorerFolderContextItems,
        backgroundRunItems,
        resolveAndApplyMove,
        afterSuiteEdit,
        applyFileReplacement,
        executeUploadPlan,
        exportLibraryAsNewProject,
        projectIsEmpty,
        projectTreeEmpty,
        updateInspectorProjectEmpty,
        getWorkspaceBootPending: () => workspaceBootPending,
        restoreWorkspaceForFile
      }));
      menusApi = create8(Object.assign({}, peelHub, {
        newProject,
        newFile,
        buildSwitchProjectSubmenu,
        buildDeleteProjectSubmenu,
        normalizeProjectRenameName,
        validateProjectRenameName,
        applyProjectRename,
        fileInputEl: uploadImportApi.fileInputEl,
        uploadFolderInputEl: uploadImportApi.uploadFolderInputEl,
        folderInputEl: uploadImportApi.folderInputEl,
        downloadCurrentFile,
        downloadFileById,
        downloadFolder,
        downloadSuite,
        suiteDownloadState,
        deleteFileInteractive,
        closeFile,
        closeTabsForFiles,
        selectionDeleteFileIds,
        selectionDeleteDisabled,
        deleteSelectionInteractive,
        deleteFolderInteractive,
        renameFolderInteractive,
        explorerCreateMenuItems,
        makeActiveCfgForFile,
        moduleNameFor,
        activeSuiteMembership,
        activeCfgsForDir,
        afterSuiteEdit,
        renderTabs,
        renderExplorerTree,
        updateHeaderContext,
        ensureEditorMatchesFileKind,
        showToast,
        ensureExplorer,
        getExplorerController,
        editorTabsEl,
        projectFileText
      }));
      create9(Object.assign({}, peelHub, {
        toggleSidePanel,
        toggleTheme,
        newProject,
        newFile,
        fileInputEl: uploadImportApi.fileInputEl,
        uploadFolderInputEl: uploadImportApi.uploadFolderInputEl,
        folderInputEl: uploadImportApi.folderInputEl,
        downloadCurrentFile,
        editorExec,
        moduleNameFor,
        closeFile,
        closeTabsForFiles,
        activeSuiteMembership,
        afterSuiteEdit,
        signatureFileCount,
        switchToFile,
        openFileAt,
        projectFileText
      }));
    }
    __initAppPeels();
    if (filesBtn && workspaceEl) {
      const hideExplorerTooltipUntilLeave = wireSidebarOpenTooltip(filesBtn);
      filesBtn.addEventListener("click", () => {
        const wasOpen = workspaceEl.classList.contains("is-explorer-open");
        if (!wasOpen) hideExplorerTooltipUntilLeave();
        toggleSidePanel("explorer");
      });
    }
    let suppressUnloadFlush = false;
    function switchProjectAndReload(mutate) {
      if (persist) persist.flushCheckpoint();
      WorkspaceState.flushWorkspace();
      suppressUnloadFlush = true;
      try {
        mutate();
      } catch (e) {
        suppressUnloadFlush = false;
        throw e;
      }
      window.location.reload();
    }
    async function newProject(name) {
      var projName = name;
      if (projName == null) {
        projName = await NamePrompt.open({
          ariaLabel: "New project",
          message: "New project",
          value: Persist.DEFAULT_PROJECT_NAME,
          selection: { start: 0, end: Persist.DEFAULT_PROJECT_NAME.length },
          normalize: NamePrompt.defaultNormalize,
          validate: function(n) {
            return n ? null : "Name is required.";
          },
          confirmLabel: "Create"
        });
      }
      if (projName === null) return;
      switchProjectAndReload(() => Persist.newBlankProject(projName && projName.trim() || Persist.DEFAULT_PROJECT_NAME));
    }
    function switchToProject(id) {
      if (id === Persist.getActiveProjectId()) return;
      switchProjectAndReload(() => Persist.setActiveProjectId(id));
    }
    async function deleteProjectInteractive(id) {
      const projects = Persist.listProjects();
      if (projects.length <= 1) return;
      const target = projects.find((p) => p.id === id);
      if (!target) return;
      if (!await ConfirmDialog.confirm({
        subject: target.name,
        message: "Delete this project and all of its files?",
        ariaLabel: "Delete project"
      })) return;
      const wasActive = id === Persist.getActiveProjectId();
      if (wasActive) {
        switchProjectAndReload(() => Persist.deleteProject(id));
        return;
      }
      Persist.deleteProject(id);
      showToast('Deleted project "' + target.name + '".');
    }
    function buildSwitchProjectSubmenu() {
      const projects = Persist.listProjects();
      if (projects.length <= 1) return null;
      const activeId = Persist.getActiveProjectId();
      return projects.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).map((p) => ({
        label: p.name,
        checked: p.id === activeId,
        onSelect: () => switchToProject(p.id)
      }));
    }
    function buildDeleteProjectSubmenu() {
      const projects = Persist.listProjects();
      if (projects.length <= 1) return null;
      const activeId = Persist.getActiveProjectId();
      return projects.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).map((p) => ({
        label: p.name,
        checked: p.id === activeId,
        onSelect: () => deleteProjectInteractive(p.id)
      }));
    }
    function headerContextFileHint() {
      const n = Persist.listFiles().length;
      if (n === 0) return "No files";
      return n === 1 ? "1 file" : n + " files";
    }
    function normalizeProjectRenameName(raw) {
      if (NamePrompt.defaultNormalize) {
        return NamePrompt.defaultNormalize(raw);
      }
      return String(raw || "").trim();
    }
    function validateProjectRenameName(name) {
      return name ? null : "Name is required.";
    }
    function applyProjectRename(name) {
      Persist.setProjectName(name);
      updateHeaderContext();
    }
    let headerProjectRenameInput = null;
    function endHeaderProjectRename() {
      const el = document.getElementById("header-context");
      if (!el || !headerProjectRenameInput) return;
      const nameEl = document.createElement("span");
      nameEl.className = "header-context-name";
      nameEl.id = "header-context-name";
      headerProjectRenameInput.replaceWith(nameEl);
      headerProjectRenameInput = null;
      el.classList.remove("is-renaming");
    }
    function startHeaderProjectRename() {
      if (headerProjectRenameInput) return;
      const el = document.getElementById("header-context");
      const nameEl = document.getElementById("header-context-name");
      if (!el || !nameEl) return;
      const initial = Persist.getProjectName();
      el.classList.add("is-renaming");
      setTip(el, "");
      const input = document.createElement("input");
      input.type = "text";
      input.className = "header-context-inline-name";
      input.value = initial;
      input.spellcheck = false;
      input.setAttribute("aria-label", "Project name");
      input.size = Math.max(initial.length, 6);
      nameEl.replaceWith(input);
      headerProjectRenameInput = input;
      let settled = false;
      let suppressBlurDismiss = false;
      function dismiss() {
        if (settled) return;
        settled = true;
        endHeaderProjectRename();
        updateHeaderContext();
      }
      function commit() {
        const next = normalizeProjectRenameName(input.value);
        const err = validateProjectRenameName(next);
        if (err) {
          showToast(err, { kind: "warn" });
          input.classList.add("is-invalid");
          input.focus();
          input.select();
          setTimeout(() => input.classList.remove("is-invalid"), 400);
          return false;
        }
        if (next === Persist.getProjectName()) {
          dismiss();
          return true;
        }
        settled = true;
        endHeaderProjectRename();
        applyProjectRename(next);
        return true;
      }
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          suppressBlurDismiss = true;
          if (commit()) {
            settled = true;
          } else {
            setTimeout(() => {
              suppressBlurDismiss = false;
            }, 0);
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          dismiss();
        }
      });
      input.addEventListener("input", () => {
        input.size = Math.max(input.value.length, 6);
      });
      input.addEventListener("click", (e) => {
        e.stopPropagation();
      });
      input.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
      });
      input.addEventListener("blur", () => {
        if (settled) return;
        setTimeout(() => {
          if (!settled && !suppressBlurDismiss) dismiss();
        }, 0);
      });
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    }
    function updateHeaderContext() {
      const el = document.getElementById("header-context");
      const nameEl = document.getElementById("header-context-name");
      if (!el || !nameEl) return;
      if (headerProjectRenameInput) return;
      nameEl.textContent = Persist.getProjectName();
      const tip = headerContextFileHint();
      el.setAttribute("aria-label", tip);
      setTip(el, tip);
    }
    const headerContextEl = document.getElementById("header-context");
    if (headerContextEl) {
      headerContextEl.addEventListener("click", (e) => {
        if (headerProjectRenameInput) return;
        const nameEl = e.target.closest("#header-context-name");
        if (!nameEl) return;
        e.stopPropagation();
        startHeaderProjectRename();
      });
    }
    function setActiveTabErrorDot(id, hasErrors) {
      if (!editorTabsEl) return;
      const tab = editorTabsEl.querySelector('.editor-tab[data-file-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      if (tab) tab.classList.toggle("has-errors", !!hasErrors);
    }
    onWin("beljar:file-lint", (ev) => {
      const id = persist ? persist.getCurrentFileId() : null;
      if (!id || !ev.detail) return;
      const file = Persist.getFileById(id);
      if (!file) return;
      if (/\.cfg$/i.test(file.name)) {
        rememberCfgLint(id, ev.detail);
        scheduleTabLintStyles();
        return;
      }
      if (ProjectSource.isSignaturePath(file.name)) {
        const health = belFileHealth(id);
        const errs = health.errors || 0;
        const warns = health.warnings || 0;
        setActiveTabErrorDot(id, errs > 0);
        if (getExplorerController() && typeof getExplorerController().setFileDiag === "function") {
          getExplorerController().setFileDiag(id, errs > 0 ? "error" : warns > 0 ? "warning" : null);
        }
      }
    });
    onWin("beljar:explorer-health-changed", () => scheduleTabLintStyles());
    onWin("beljar:development-checked", () => scheduleTabLintStyles());
    if (activeFileId) Persist.openFile(activeFileId);
    registerWorkspaceProviders();
    renderTabs();
    renderExplorerTree();
    updateHeaderContext();
    updateEditorEmptyState();
    updateInspectorProjectEmpty();
    if (editor) notifyActiveEditorView();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        restoreWorkspaceState();
        workspaceBootPending = false;
      });
    });
    function openInspector() {
      if (!workspaceEl) return;
      if (!workspaceEl.classList.contains("is-inspector-open")) {
        closeOtherSidePanels("inspector");
        setSidePanelOpen("inspector", true);
        notifySidePanelLayout();
      }
      requestAnimationFrame(() => refreshInspector({ live: true }));
    }
    if (inspectorBtn && workspaceEl) {
      const hideInspectorTooltipUntilLeave = wireSidebarOpenTooltip(inspectorBtn);
      inspectorBtn.addEventListener("click", () => {
        const wasOpen = workspaceEl.classList.contains("is-inspector-open");
        if (!wasOpen) hideInspectorTooltipUntilLeave();
        const open = toggleSidePanel("inspector");
        if (open) refreshInspector({ live: true });
      });
      onWin("beljar:open-inspector", openInspector);
    }
    function openLibrary() {
      if (!workspaceEl) return;
      if (!workspaceEl.classList.contains("is-library-open")) {
        closeOtherSidePanels("library");
        setSidePanelOpen("library", true);
        notifySidePanelLayout();
      }
      ensureLibrary();
      if (getLibraryController() && typeof getLibraryController().refresh === "function") {
        getLibraryController().refresh();
      }
    }
    if (libraryBtn && workspaceEl) {
      const hideLibraryTooltipUntilLeave = wireSidebarOpenTooltip(libraryBtn);
      libraryBtn.addEventListener("click", () => {
        if (Hint.dismiss) {
          Hint.dismiss("library");
        }
        const wasOpen = workspaceEl.classList.contains("is-library-open");
        if (!wasOpen) hideLibraryTooltipUntilLeave();
        const open = toggleSidePanel("library");
        if (open) {
          ensureLibrary();
          if (getLibraryController() && typeof getLibraryController().refresh === "function") {
            getLibraryController().refresh();
          }
        }
      });
      if (Hint.show) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            Hint.show({
              id: "library",
              anchor: libraryBtn,
              text: "Check the library to view or insert Beluga examples",
              onClick: openLibrary
            });
          });
        });
      }
    }
    ensureLibrary();
    let harpoonPanelInited = false;
    function ensureHarpoonPanel() {
      if (harpoonPanelInited || typeof HarpoonPanel === "undefined") return;
      const bodyEl = harpoonPanelEl && harpoonPanelEl.querySelector("#harpoon-panel-body");
      if (!bodyEl) return;
      HarpoonPanel.init(bodyEl, { panelEl: harpoonPanelEl });
      harpoonPanelInited = true;
    }
    function refreshHarpoonPanelIfOpen() {
      if (workspaceEl && workspaceEl.classList.contains("is-harpoon-open") && typeof HarpoonPanel !== "undefined" && HarpoonPanel.refresh) {
        HarpoonPanel.refresh();
      }
    }
    if (harpoonBtn && workspaceEl) {
      const hideProofTooltipUntilLeave = wireSidebarOpenTooltip(harpoonBtn);
      harpoonBtn.addEventListener("click", () => {
        const wasOpen = workspaceEl.classList.contains("is-harpoon-open");
        if (!wasOpen) hideProofTooltipUntilLeave();
        const open = toggleSidePanel("harpoon");
        if (open) {
          ensureHarpoonPanel();
          refreshHarpoonPanelIfOpen();
        }
      });
      let harpoonRefreshTimer = null;
      const debouncedHarpoonRefresh = () => {
        if (harpoonRefreshTimer) clearTimeout(harpoonRefreshTimer);
        harpoonRefreshTimer = setTimeout(refreshHarpoonPanelIfOpen, 120);
      };
      onWin("beljar:doc-changed", debouncedHarpoonRefresh);
      onWin("beljar:file-lint", debouncedHarpoonRefresh);
      onWin("beljar:active-editor-view", debouncedHarpoonRefresh);
      onWin("beljar:development-checked", debouncedHarpoonRefresh);
      onWin("beljar:hole-goals-updated", debouncedHarpoonRefresh);
      if (workspaceEl.classList.contains("is-harpoon-open")) {
        ensureHarpoonPanel();
        refreshHarpoonPanelIfOpen();
      }
    }
    document.getElementById("btn-load").addEventListener("click", (e) => {
      const file = activeFileRecord();
      if (file && /\.cfg$/i.test(file.name)) {
        BelugaRun.runModuleCfg(file.name);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && file && moduleNameFor(file.id)) {
        BelugaRun.runModule();
        return;
      }
      Commands.run("run.default");
    });
    document.getElementById("btn-clear").addEventListener("click", () => {
      ReplOutput.clearOutput();
      ReplCommands.resetHistoryIndex();
    });
    if (btnRun) {
      btnRun.addEventListener("click", () => {
        ReplCommands.runCmd();
      });
    }
    if (cmdInput) {
      if (typeof ReplAutocomplete !== "undefined" && ReplAutocomplete.bind) {
        ReplAutocomplete.bind(cmdInput);
      }
      cmdInput.addEventListener("input", () => {
        ReplCommands.resetHistoryIndex();
        if (typeof ReplAutocomplete !== "undefined" && ReplAutocomplete.onInput) {
          ReplAutocomplete.onInput();
        } else if (typeof ReplAutocomplete !== "undefined" && ReplAutocomplete.refresh) {
          ReplAutocomplete.refresh();
        }
      });
      cmdInput.addEventListener("keydown", (e) => {
        if (typeof ReplAutocomplete !== "undefined" && ReplAutocomplete.onKeyDown) {
          if (ReplAutocomplete.onKeyDown(e)) {
            e.preventDefault();
            return;
          }
        }
        if (e.key === "Enter") {
          if (typeof ReplAutocomplete !== "undefined" && ReplAutocomplete.hide) {
            ReplAutocomplete.hide();
          }
          ReplCommands.runCmd();
          return;
        }
        if (e.key === "ArrowUp") {
          if (ReplCommands.historyUp()) e.preventDefault();
          return;
        }
        if (e.key === "ArrowDown") {
          if (ReplCommands.historyDown()) e.preventDefault();
        }
      });
      cmdInput.addEventListener("blur", () => {
        setTimeout(() => {
          if (typeof ReplAutocomplete !== "undefined" && ReplAutocomplete.hide) {
            ReplAutocomplete.hide();
          }
        }, 120);
      });
    }
    onWin("beforeunload", () => {
      if (typeof ReplPersist !== "undefined" && ReplPersist.saveNow) {
        ReplPersist.saveNow();
      }
      if (persist && !suppressUnloadFlush) persist.flushCheckpoint();
      WorkspaceState.flushWorkspace();
    });
    onWin("pagehide", () => {
      if (typeof ReplPersist !== "undefined" && ReplPersist.saveNow) {
        ReplPersist.saveNow();
      }
      if (persist && !suppressUnloadFlush) persist.flushCheckpoint();
      WorkspaceState.flushWorkspace();
    });
    {
      RunProgress.bind({
        header: document.getElementById("output-panel-header"),
        fill: document.getElementById("output-header-progress"),
        status: document.getElementById("output-header-status"),
        output: document.getElementById("output")
      });
    }
  }
  function unmount() {
    if (!mounted) return;
    mounted = false;
    while (teardown.length) {
      const off = teardown.pop();
      try {
        off();
      } catch (_) {
      }
    }
    const peers = [
      globalThis.Notifications,
      globalThis.Toasts,
      globalThis.WorkspaceSplit,
      globalThis.SidePanelResize,
      globalThis.CommandPalette,
      globalThis.HarpoonPanel,
      globalThis.Explorer,
      globalThis.Library
    ];
    for (const peer of peers) {
      if (peer && typeof peer.dispose === "function") {
        try {
          peer.dispose();
        } catch (_) {
        }
      }
    }
    if (editor && typeof editor.destroy === "function") {
      try {
        editor.destroy();
      } catch (_) {
      }
    }
    editor = null;
    window.CurrentEditor = null;
    window.BelJarCurrentEditor = null;
  }
  window.App = {
    mount,
    unmount,
    isMounted: () => mounted,
    // Test seam: how many registrations unmount still has to undo.
    pendingTeardown: () => teardown.length
  };
  window.BelJarApp = window.App;
  mount();
})();
