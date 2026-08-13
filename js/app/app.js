(() => {
  // js/app/app-empty-state.mjs
  function create(opts) {
    var getInspectorPanelEl = opts.getInspectorPanelEl;
    var getInspectorProjectEmptyEl = opts.getInspectorProjectEmptyEl;
    var getEditorEmptyEl = opts.getEditorEmptyEl;
    var getEditorMount = opts.getEditorMount;
    var projectTreeEmpty2 = opts.projectTreeEmpty;
    var editorCanvasIdle2 = opts.editorCanvasIdle;
    function setEmptyOverlayVisible(el, visible) {
      if (!el) return;
      el.hidden = !visible;
      el.setAttribute("aria-hidden", visible ? "false" : "true");
      if ("inert" in el) el.inert = !visible;
    }
    function updateInspectorProjectEmpty2() {
      var inspectorPanelEl2 = getInspectorPanelEl && getInspectorPanelEl();
      if (!inspectorPanelEl2) return;
      var body = inspectorPanelEl2.querySelector(".inspector-body");
      var empty = projectTreeEmpty2();
      setEmptyOverlayVisible(getInspectorProjectEmptyEl && getInspectorProjectEmptyEl(), empty);
      if (body) {
        body.hidden = empty;
        body.setAttribute("aria-hidden", empty ? "true" : "false");
      }
    }
    function updateEditorEmptyState2() {
      var idle = editorCanvasIdle2();
      setEmptyOverlayVisible(getEditorEmptyEl && getEditorEmptyEl(), idle);
      var mount = getEditorMount && getEditorMount();
      if (mount) mount.classList.toggle("is-inactive", idle);
      var runBtn = document.getElementById("btn-load");
      if (runBtn) runBtn.disabled = idle;
      var statusDot = document.getElementById("ide-status-dot");
      if (statusDot) statusDot.hidden = idle;
    }
    return {
      updateInspectorProjectEmpty: updateInspectorProjectEmpty2,
      updateEditorEmptyState: updateEditorEmptyState2
    };
  }

  // js/app/app-side-panels.mjs
  function create2(opts) {
    var workspaceEl2 = opts.workspaceEl;
    var panels = opts.panels || {};
    var onLayout = opts.onLayout || function() {
    };
    var scheduleWorkspaceSave = opts.scheduleWorkspaceSave || function() {
    };
    function getOpenSidePanelId() {
      if (!workspaceEl2) return null;
      var order = ["harpoon", "library", "inspector", "explorer"];
      for (var i = 0; i < order.length; i++) {
        var id = order[i];
        var cfg = panels[id];
        if (cfg && workspaceEl2.classList.contains(cfg.openClass)) return id;
      }
      return null;
    }
    function setSidePanelOpen2(id, open) {
      var cfg = panels[id];
      if (!workspaceEl2 || !cfg) return;
      workspaceEl2.classList.toggle(cfg.openClass, open);
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
    function closeOtherSidePanels2(id) {
      Object.keys(panels).forEach(function(otherId) {
        if (otherId !== id) setSidePanelOpen2(otherId, false);
      });
    }
    function notifySidePanelLayout2() {
      onLayout();
      window.dispatchEvent(new Event("resize"));
    }
    function toggleSidePanel2(id) {
      var cfg = panels[id];
      if (!workspaceEl2 || !cfg) return false;
      var open = !workspaceEl2.classList.contains(cfg.openClass);
      if (open) closeOtherSidePanels2(id);
      setSidePanelOpen2(id, open);
      notifySidePanelLayout2();
      return open;
    }
    function wireSidebarOpenTooltip2(btn) {
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
      setSidePanelOpen: setSidePanelOpen2,
      getOpenSidePanelId,
      closeOtherSidePanels: closeOtherSidePanels2,
      notifySidePanelLayout: notifySidePanelLayout2,
      toggleSidePanel: toggleSidePanel2,
      wireSidebarOpenTooltip: wireSidebarOpenTooltip2
    };
  }

  // js/app/app-file-tabs.mjs
  function create3(opts) {
    var editorTabsEl2 = opts.editorTabsEl;
    var listOpenFiles = opts.listOpenFiles;
    var getActiveId = opts.getActiveId;
    var fileHasErrors = opts.fileHasErrors;
    var setTip2 = opts.setTip;
    var onSwitch = opts.onSwitch;
    var onClose = opts.onClose;
    var onNew = opts.onNew;
    function renderTabs2() {
      if (!editorTabsEl2) return;
      var files = listOpenFiles() || [];
      var activeId = getActiveId();
      editorTabsEl2.innerHTML = "";
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
        if (setTip2) setTip2(closeBtn, "Close");
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
        editorTabsEl2.appendChild(tab);
      });
      var newBtn = document.createElement("button");
      newBtn.type = "button";
      newBtn.className = "editor-tab-new";
      if (setTip2) setTip2(newBtn, "New file");
      newBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
      newBtn.addEventListener("click", function() {
        onNew();
      });
      editorTabsEl2.appendChild(newBtn);
      var activeTab = editorTabsEl2.querySelector(".editor-tab.is-active");
      if (activeTab) activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    return { renderTabs: renderTabs2 };
  }

  // js/app/app-suite-cfg.mjs
  function create4(deps) {
    var getEditor = deps.getEditor;
    var getPersist = deps.getPersist;
    var projectFileText2 = deps.projectFileText;
    var showToast2 = deps.showToast;
    var belFileHealth2 = deps.belFileHealth;
    var liveFileLint2 = deps.liveFileLint;
    var cfgTabLint2 = deps.cfgTabLint;
    var setTip2 = deps.setTip;
    var renderExplorerTree2 = deps.renderExplorerTree;
    var updateHeaderContext2 = deps.updateHeaderContext;
    var reloadActiveEditorFromPersist2 = deps.reloadActiveEditorFromPersist;
    var renderTabs2 = deps.renderTabs;
    var getLibraryController2 = deps.getLibraryController;
    function ensureProjectActiveCfgs2() {
      if (typeof ProjectSource.inferActiveCfgByDir !== "function") return;
      if (typeof Persist.backfillActiveCfgByDir !== "function") return;
      const files = Persist.listFiles();
      const getText = (id) => projectFileText2(id);
      Persist.backfillActiveCfgByDir(ProjectSource.inferActiveCfgByDir(files, getText));
    }
    function ensureActiveCfgForDir2(dir) {
      if (Persist.getActiveCfgForDir(dir)) return;
      if (typeof ProjectSource.inferActiveCfgForDir !== "function") return;
      const files = Persist.listFiles();
      const path = ProjectSource.inferActiveCfgForDir(files, projectFileText2, dir);
      if (path) Persist.setActiveCfgForDir(dir, path);
    }
    function activeCfgForDir2(dir) {
      const path = Persist.getActiveCfgForDir(dir);
      if (!path) return null;
      return Persist.listFiles().some((f) => f.name === path) ? path : null;
    }
    function activeCfgsForDir2(dir) {
      const names = new Set(Persist.listFiles().map((f) => f.name));
      return Persist.getActiveCfgsForDir(dir).filter((p) => names.has(p));
    }
    function suiteMembersResolver(all, cfgPath, gt) {
      return ProjectSource.orderedPathsForCfg(all, cfgPath, gt);
    }
    function suiteLayoutForDir2(dir, filesInDir) {
      const SL = ExplorerSuiteLayout;
      if (!SL || typeof SL.computeDirLayout !== "function") {
        return { orderedFiles: filesInDir, suiteByFile: {} };
      }
      const active = activeCfgsForDir2(dir);
      const allFiles = Persist.listFiles();
      const getText = projectFileText2;
      return SL.computeDirLayout(filesInDir, active, suiteMembersResolver, allFiles, getText);
    }
    function owningActiveCfgForFile(fileName) {
      const dir = ProjectSource.dirOf(fileName);
      const activeCfgs = activeCfgsForDir2(dir);
      if (!activeCfgs.length) return null;
      const files = Persist.listFiles();
      const getText = projectFileText2;
      return ProjectSource.resolveOwningActiveCfg(files, fileName, getText, activeCfgs);
    }
    function reconcileActiveCfgsInDir2(dir, editedCfg) {
      const active = activeCfgsForDir2(dir);
      if (active.length < 2) return;
      const SL = ExplorerSuiteLayout;
      const files = Persist.listFiles();
      const getText = projectFileText2;
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
    function makeActiveCfgForFile2(fileName) {
      const dir = ProjectSource.dirOf(fileName);
      const active = activeCfgsForDir2(dir);
      const files = Persist.listFiles();
      const getText = projectFileText2;
      const SL = ExplorerSuiteLayout;
      if (active.includes(fileName)) {
        Persist.removeActiveCfgForDir(dir, fileName);
      } else if (SL) {
        const check = SL.canActivateCfg(fileName, active, files, getText, suiteMembersResolver);
        if (!check.ok) {
          showToast2(check.reason || "Cannot activate suite", { kind: "warn" });
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
      renderExplorerTree2();
      updateHeaderContext2();
      updateRunButtonTooltip2();
    }
    function moduleNameFor2(fileId) {
      const files = Persist.listFiles();
      const getText = projectFileText2;
      const id = fileId || Persist.getActiveFileId();
      const dev = ProjectSource.developmentForFile(files, id, getText);
      if (dev.kind !== "module" || !dev.cfg) return null;
      return dev.cfg.slice(dev.cfg.lastIndexOf("/") + 1).replace(/\.cfg$/i, "");
    }
    function activeSuiteMembership2(fileName) {
      const cfg = owningActiveCfgForFile(fileName);
      if (!cfg) return { cfg: null, member: false, index: -1, count: 0 };
      const files = Persist.listFiles();
      const getText = projectFileText2;
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
      for (const entry of ProjectSource.parseCfg(projectFileText2(cfgFile.id))) {
        if (!ProjectSource.isCfgEntryToken(entry)) continue;
        if (!names.has(dir ? dir + "/" + entry : entry)) return true;
      }
      return false;
    }
    function explorerFileDiag2(fileId, fileName) {
      const low = String(fileName || "").toLowerCase();
      if (low.endsWith(".cfg")) {
        if (cfgHasDanglingEntry(fileName)) return "warning";
        const activeId = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
        const lint = fileId === activeId ? liveFileLint2() : cfgTabLint2.get(fileId);
        if (lint && lint.errors > 0) return "error";
        if (lint && lint.warnings > 0) return "warning";
        return null;
      }
      if (ProjectSource.isSignaturePath(fileName)) {
        const health = belFileHealth2(fileId);
        if (health.errors > 0) return "error";
        if (health.warnings > 0) return "warning";
        return null;
      }
      return null;
    }
    function afterSuiteEdit2(dir, editedCfg) {
      if (!editedCfg) {
        const activeFile2 = Persist.getFileById(Persist.getActiveFileId());
        if (activeFile2 && /\.cfg$/i.test(activeFile2.name) && ProjectSource.dirOf(activeFile2.name) === dir) {
          editedCfg = activeFile2.name;
        }
      }
      reconcileActiveCfgsInDir2(dir, editedCfg);
      if (editedCfg && typeof BelEditor !== "undefined" && typeof BelEditor.invalidateFileHealthAfterChange === "function") {
        const cfgFile = Persist.listFiles().find((f) => f.name === editedCfg);
        if (cfgFile) BelEditor.invalidateFileHealthAfterChange(cfgFile.id);
      }
      const activeId = Persist.getActiveFileId();
      const activeFile = Persist.getFileById(activeId);
      if (getEditor()?.remoduleContext && activeFile && ProjectSource.dirOf(activeFile.name) === dir) {
        getEditor().remoduleContext();
      }
      reloadActiveEditorFromPersist2();
      renderExplorerTree2();
      renderTabs2();
      updateHeaderContext2();
      updateRunButtonTooltip2();
      if (getLibraryController2() && typeof getLibraryController2().refresh === "function") {
        getLibraryController2().refresh();
      }
    }
    function activeFileRecord2() {
      const id = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
      return id ? Persist.getFileById(id) : null;
    }
    function updateRunButtonTooltip2() {
      const btn = document.getElementById("btn-load");
      if (!btn) return;
      const file = activeFileRecord2();
      if (file && /\.cfg$/i.test(file.name)) {
        setTip2(btn, "Run suite");
      } else if (file && moduleNameFor2(file.id)) {
        const hasPrelude = !!(ProjectSource.buildPrelude && ProjectSource.buildPrelude(Persist.listFiles(), file.id, projectFileText2));
        setTip2(btn, hasPrelude ? "Run suite to here\nCtrl+click: run suite" : "Run\nCtrl+click: run suite");
      } else {
        setTip2(btn, "Run");
      }
    }
    return {
      ensureProjectActiveCfgs: ensureProjectActiveCfgs2,
      ensureActiveCfgForDir: ensureActiveCfgForDir2,
      activeCfgForDir: activeCfgForDir2,
      activeCfgsForDir: activeCfgsForDir2,
      suiteMembersResolver,
      suiteLayoutForDir: suiteLayoutForDir2,
      owningActiveCfgForFile,
      reconcileActiveCfgsInDir: reconcileActiveCfgsInDir2,
      makeActiveCfgForFile: makeActiveCfgForFile2,
      moduleNameFor: moduleNameFor2,
      activeSuiteMembership: activeSuiteMembership2,
      cfgHasDanglingEntry,
      explorerFileDiag: explorerFileDiag2,
      afterSuiteEdit: afterSuiteEdit2,
      activeFileRecord: activeFileRecord2,
      updateRunButtonTooltip: updateRunButtonTooltip2
    };
  }

  // js/app/app-upload-import.mjs
  function create5(deps) {
    var getEditor = deps.getEditor;
    var setEditor = deps.setEditor;
    var getPersist = deps.getPersist;
    var setPersist = deps.setPersist;
    var showToast2 = deps.showToast;
    var projectFileText2 = deps.projectFileText;
    var switchToFile2 = deps.switchToFile;
    var switchProjectAndReload2 = deps.switchProjectAndReload;
    var ensureEditorMatchesFileKind2 = deps.ensureEditorMatchesFileKind;
    var updateEditorEmptyState2 = deps.updateEditorEmptyState;
    var renderTabs2 = deps.renderTabs;
    var renderExplorerTree2 = deps.renderExplorerTree;
    var updateHeaderContext2 = deps.updateHeaderContext;
    var updateRunButtonTooltip2 = deps.updateRunButtonTooltip;
    var enterEmptyProjectView2 = deps.enterEmptyProjectView;
    var enterCanvasIdleView2 = deps.enterCanvasIdleView;
    var projectIsEmpty2 = deps.projectIsEmpty;
    var onCfgContentChange2 = deps.onCfgContentChange;
    var cfgTabLint2 = deps.cfgTabLint;
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
        showToast2("Replaced existing file.", { kind: "success" });
      } else if (result.added > 0) {
        showToast2(
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
    async function exportLibraryAsNewProject2(payload) {
      if (!getPersist() || !payload) return;
      const { projectEntries } = projectEntriesFromRawEntries(payload.entries || []);
      if (!projectEntries.length) {
        showToast2("No files to export.", { kind: "warn" });
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
      switchProjectAndReload2(() => {
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
    function applyFileReplacement2(id, text) {
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
      ensureEditorMatchesFileKind2();
      const file = Persist.getFileById(id);
      if (file && /\.cfg$/i.test(file.name) && typeof getEditor().refreshLint === "function") {
        getEditor().refreshLint();
      }
    }
    function deleteProjectFilesById2(ids) {
      const unique = [...new Set(ids)];
      if (!unique.length) return;
      const currentId = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
      if (currentId && unique.includes(currentId)) {
        const openIds = Persist.getOpenFileIds().filter((x) => !unique.includes(x));
        const files = Persist.listFiles();
        const fallback = openIds[0] || (files.find((f) => !unique.includes(f.id)) || {}).id;
        if (fallback) switchToFile2(fallback);
      }
      for (const id of unique) {
        Persist.deleteFile(id);
        cfgTabLint2.delete(id);
      }
      if (getPersist()) {
        const cur = getPersist().getCurrentFileId();
        if (cur && unique.includes(cur) && !Persist.getFileById(cur)) {
          const open = Persist.getOpenFileIds().find((openId) => Persist.getFileById(openId));
          if (open) switchToFile2(open);
          else if (projectIsEmpty2()) enterEmptyProjectView2();
          else enterCanvasIdleView2();
        }
      }
      if (projectIsEmpty2()) enterEmptyProjectView2();
    }
    function executeUploadPlan2(plan, options) {
      if (!plan) return { added: 0, replaced: 0 };
      const H = typeof EditHistory !== "undefined" ? EditHistory : null;
      const run = () => executeUploadPlanInner(plan, options || {});
      if (H && typeof H.transact === "function") {
        const r = H.transact("file-batch", run);
        return r.ok ? r.result || { added: 0, replaced: 0 } : { added: 0, replaced: 0 };
      }
      return run();
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
        deleteProjectFilesById2(folder.deleteIds || []);
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
        applyFileReplacement2(item.id, item.text);
        replaced += 1;
      }
      for (const entry of plan.create || []) {
        const id = Persist.createFile(entry.name);
        Persist.setFileText(id, entry.text);
        added += 1;
        lastCreatedId = id;
        if (options.openTabs) Persist.openFile(id);
      }
      if (switchedActiveId) switchToFile2(switchedActiveId);
      else if (options.openTabs && lastCreatedId) switchToFile2(lastCreatedId);
      else reloadActiveEditorFromPersist2();
      updateEditorEmptyState2();
      renderTabs2();
      renderExplorerTree2();
      updateHeaderContext2();
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
      return executeUploadPlan2(plan, options);
    }
    function reloadActiveEditorFromPersist2() {
      if (!getPersist() || !getEditor()) return;
      const id = getPersist().getCurrentFileId();
      if (!id) return;
      const file = Persist.getFileById(id);
      if (!file) {
        const fallback = Persist.getOpenFileIds().find((openId) => Persist.getFileById(openId));
        if (fallback) switchToFile2(fallback);
        else if (!projectIsEmpty2()) enterCanvasIdleView2();
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
      ensureEditorMatchesFileKind2();
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
        ensureEditorMatchesFileKind2();
        if (getEditor() && typeof getEditor().refreshLint === "function") getEditor().refreshLint();
        const activeFile = Persist.getFileById(activeId);
        if (activeFile && /\.cfg$/i.test(activeFile.name)) {
          onCfgContentChange2(activeFile.name);
          return;
        }
      }
      renderExplorerTree2();
      updateHeaderContext2();
      updateRunButtonTooltip2();
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
        deleteProjectFilesById2(folder.deleteIds || []);
        for (const r of folder.renames || []) recordMove(r.id, r.to);
      }
      for (const rep of plan.replaces || []) {
        applyFileReplacement2(rep.targetId, rep.text);
        deleteProjectFilesById2([rep.deleteId]);
      }
      for (const r of plan.renames || []) recordMove(r.id, r.to);
      Persist.preserveEmptyFoldersAfterMoves(moves);
      reloadActiveEditorFromPersist2();
      renderTabs2();
      renderExplorerTree2();
      updateHeaderContext2();
    }
    async function resolveAndApplyMove2(payload, dropTarget) {
      if (!getPersist()) return;
      const existing = Persist.listFiles();
      const empty = Persist.listEmptyFolders();
      const getText = projectFileText2;
      const moves = NameConflicts.computeMoveTargets(existing, payload, dropTarget, getText);
      const emptyMoves = NameConflicts.computeEmptyFolderMoves(existing, payload, dropTarget, empty);
      if (!moves.length) {
        if (!emptyMoves.length) return;
        for (const m of emptyMoves) Persist.renameEmptyFolderPrefix(m.from, m.to);
        renderExplorerTree2();
        updateHeaderContext2();
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
      if (emptyMoves.length) renderExplorerTree2();
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
        showToast2("No .bel files in that folder.", { kind: "warn" });
        return;
      }
      const result = await resolveAndApplyUpload(projectEntries, {
        openTabs: false,
        folderBatchRoots: typeof NameConflicts.uploadFolderBatchRoots === "function" ? NameConflicts.uploadFolderBatchRoots(projectEntries) : []
      });
      if (result === null) return;
      const nAdded = result.added;
      if (nAdded > 0) {
        showToast2(
          "Added " + nAdded + " file" + (nAdded === 1 ? "" : "s") + " to the project.",
          { kind: "success" }
        );
      } else if (result.replaced > 0) {
        showToast2("Updated existing project files.", { kind: "success" });
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
        showToast2("No .bel files in that folder.", { kind: "warn" });
        return;
      }
      const rootName = all[0] && all[0].webkitRelativePath ? all[0].webkitRelativePath.split("/")[0] : "Imported";
      const orderedPaths = projectEntries.filter((e) => ProjectSource.isBelPath(e.name)).map((e) => e.name);
      const firstBel = orderedPaths.length ? orderedPaths[0] : null;
      const tmpFiles = projectEntries.map((e, i) => ({ id: "tmp-" + i, name: e.name }));
      const tmpText = (id) => projectEntries[Number(id.slice(4))]?.text ?? "";
      const activeCfgByDir = typeof ProjectSource.inferActiveCfgByDir === "function" ? ProjectSource.inferActiveCfgByDir(tmpFiles, tmpText) : null;
      switchProjectAndReload2(() => {
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
    function downloadFileById2(fileId) {
      if (!fileId) return;
      const file = Persist.getFileById(fileId);
      if (!file) return;
      const text = typeof projectFileText2 === "function" ? projectFileText2(fileId) : Persist.getFileText(fileId) || "";
      DownloadZip.downloadTextFile(text, baseName(file.name) || "download.bel");
    }
    function downloadCurrentFile2() {
      const id = Persist.getActiveFileId && Persist.getActiveFileId();
      if (id) downloadFileById2(id);
    }
    function downloadFolder2(folderPath) {
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
        const text = typeof projectFileText2 === "function" ? projectFileText2(file.id) : Persist.getFileText(file.id) || "";
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
    function suiteDownloadState2(cfgFileId) {
      if (!cfgFileId) {
        return { ok: false, reason: "Suite unavailable." };
      }
      const cfgFile = Persist.getFileById(cfgFileId);
      if (!cfgFile || !/\.cfg$/i.test(String(cfgFile.name))) {
        return { ok: false, reason: "Not a suite .cfg file." };
      }
      const allFiles = Persist.listFiles() || [];
      const byName = new Map(allFiles.map((f) => [f.name, f]));
      const cfgText = typeof projectFileText2 === "function" ? projectFileText2(cfgFileId) : Persist.getFileText(cfgFileId) || "";
      if (typeof ExplorerSuiteLayout.cfgHasDanglingEntry === "function") {
        if (ExplorerSuiteLayout.cfgHasDanglingEntry(allFiles, cfgFile.name, projectFileText2)) {
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
        const text = typeof projectFileText2 === "function" ? projectFileText2(file.id) : Persist.getFileText(file.id) || "";
        pack.push({
          path: stem + "/" + mem.entry.replace(/\\/g, "/"),
          data: enc ? enc.encode(text) : text
        });
      }
      return { ok: true, zipName: stem + ".zip", entries: pack };
    }
    function downloadSuite2(cfgFileId) {
      const state = suiteDownloadState2(cfgFileId);
      if (!state.ok) return;
      DownloadZip.downloadZip(state.entries, state.zipName);
    }
    return {
      fileInputEl,
      relPathFromPickerFile,
      projectEntriesFromRawEntries,
      projectEntriesFromPickerFiles,
      exportLibraryAsNewProject: exportLibraryAsNewProject2,
      applyFileReplacement: applyFileReplacement2,
      deleteProjectFilesById: deleteProjectFilesById2,
      executeUploadPlan: executeUploadPlan2,
      resolveAndApplyUpload,
      reloadActiveEditorFromPersist: reloadActiveEditorFromPersist2,
      syncCfgEditorsAfterRewrite,
      applyMovePlan,
      resolveAndApplyMove: resolveAndApplyMove2,
      uploadFolderInputEl,
      folderInputEl,
      downloadCurrentFile: downloadCurrentFile2,
      downloadFileById: downloadFileById2,
      downloadFolder: downloadFolder2,
      downloadSuite: downloadSuite2,
      suiteDownloadState: suiteDownloadState2
    };
  }

  // js/app/app-file-lifecycle.mjs
  function create6(deps) {
    var getEditor = deps.getEditor;
    var setEditor = deps.setEditor;
    var getPersist = deps.getPersist;
    var setPersist = deps.setPersist;
    var mountEditorFor2 = deps.mountEditorFor;
    var ensurePersistForFile2 = deps.ensurePersistForFile;
    var syncEditorCmTheme2 = deps.syncEditorCmTheme;
    var updateEditorEmptyState2 = deps.updateEditorEmptyState;
    var renderTabs2 = deps.renderTabs;
    var renderExplorerTree2 = deps.renderExplorerTree;
    var updateHeaderContext2 = deps.updateHeaderContext;
    var updateRunButtonTooltip2 = deps.updateRunButtonTooltip;
    var notifyActiveEditorView2 = deps.notifyActiveEditorView;
    var refreshInspector2 = deps.refreshInspector;
    var refreshExplorerActiveAndDiags2 = deps.refreshExplorerActiveAndDiags;
    var scheduleTabLintStyles2 = deps.scheduleTabLintStyles;
    var liveFileLint2 = deps.liveFileLint;
    var rememberCfgLint2 = deps.rememberCfgLint;
    var cfgTabLint2 = deps.cfgTabLint;
    var ensureActiveCfgForDir2 = deps.ensureActiveCfgForDir;
    var ensureEditorMatchesFileKind2 = deps.ensureEditorMatchesFileKind;
    var showToast2 = deps.showToast;
    var projectIsEmpty2 = deps.projectIsEmpty;
    var enterCanvasIdleView2 = deps.enterCanvasIdleView;
    var enterEmptyProjectView2 = deps.enterEmptyProjectView;
    var deleteProjectFilesById2 = deps.deleteProjectFilesById;
    var getExplorerController2 = deps.getExplorerController;
    var syncCfgEditorsAfterRewrite = deps.syncCfgEditorsAfterRewrite;
    var refPeekRestore = null;
    function applyEditorJump(jumpAt) {
      if (!getEditor() || !jumpAt) return false;
      if (typeof getEditor().jumpToReference === "function" && jumpAt.name) {
        return getEditor().jumpToReference(jumpAt, jumpAt.name);
      }
      if (typeof getEditor().jumpToRange === "function") {
        return getEditor().jumpToRange(jumpAt);
      }
      return false;
    }
    function switchToFile2(id, openOpts) {
      if (!id) return;
      ensurePersistForFile2(id);
      if (!getPersist()) return;
      if (!getEditor()) {
        Persist.openFile(id);
        Persist.setActiveFileId(id);
        const curId = getPersist().getCurrentFileId();
        const snapshot2 = curId === id ? getPersist().getInitialCheckpoint() : getPersist().switchFile(id);
        setEditor(mountEditorFor2(snapshot2, openOpts));
        syncEditorCmTheme2();
        if (typeof BelugaClient !== "undefined" && BelugaClient.noteEditorChange) {
          BelugaClient.noteEditorChange(getEditor() ? getEditor().getValue() : "");
        }
        updateEditorEmptyState2();
        if (getEditor()) getEditor().focus();
        renderTabs2();
        renderExplorerTree2();
        updateHeaderContext2();
        updateRunButtonTooltip2();
        notifyActiveEditorView2();
        refreshInspector2();
        return;
      }
      const keepSelection = openOpts && openOpts.keepSelection;
      const shouldClearSelection = !keepSelection && !(getExplorerController2() && getExplorerController2().shouldKeepSelectionOnOpen && getExplorerController2().shouldKeepSelectionOnOpen());
      const peekAt = openOpts && openOpts.peekAt;
      const jumpAt = openOpts && openOpts.jumpAt;
      const initialLocal = openOpts && openOpts.initialLocal;
      Persist.openFile(id);
      const editorDocId = typeof getEditor().getDocumentId === "function" ? getEditor().getDocumentId() : null;
      const persistId = getPersist().getCurrentFileId();
      if (id === persistId && editorDocId === id) {
        Persist.setActiveFileId(id);
        renderTabs2();
        if (peekAt && getEditor() && typeof getEditor().peekRange === "function") getEditor().peekRange(peekAt);
        else if (jumpAt) applyEditorJump(jumpAt);
        else if (initialLocal != null && getEditor() && typeof getEditor().applyViewport === "function") {
          getEditor().applyViewport(initialLocal);
        } else if (shouldClearSelection && getExplorerController2() && getExplorerController2().clearSelection) {
          getExplorerController2().clearSelection();
        }
        refreshExplorerActiveAndDiags2();
        notifyActiveEditorView2();
        return;
      }
      {
        const file = Persist.getFileById(id);
        if (file) ensureActiveCfgForDir2(ProjectSource.dirOf(file.name));
      }
      const leavingId = getPersist().getCurrentFileId();
      const leavingFile = Persist.getFileById(leavingId);
      const snap = liveFileLint2();
      const lintItems = getEditor() && typeof getEditor().getLintTooltipItems === "function" ? getEditor().getLintTooltipItems() : null;
      if (snap && leavingFile && /\.cfg$/i.test(leavingFile.name)) {
        rememberCfgLint2(leavingId, { ...snap, items: lintItems });
      }
      WorkspaceState.flushWorkspace();
      if (getEditor() && typeof getEditor().cancelRename === "function") getEditor().cancelRename();
      const snapshot = getPersist().switchFile(id);
      Persist.setActiveFileId(id);
      getEditor().destroy();
      setEditor(mountEditorFor2(snapshot, {
        jumpAt,
        initialLocal: initialLocal != null ? initialLocal : snapshot ? snapshot.editor.local : null
      }));
      syncEditorCmTheme2();
      if (typeof BelugaClient !== "undefined" && BelugaClient.noteEditorChange) {
        BelugaClient.noteEditorChange(getEditor() ? getEditor().getValue() : "");
      }
      if (getEditor()) getEditor().focus();
      renderTabs2();
      if (shouldClearSelection && getExplorerController2() && getExplorerController2().clearSelection) {
        getExplorerController2().clearSelection();
      }
      refreshExplorerActiveAndDiags2();
      updateHeaderContext2();
      updateRunButtonTooltip2();
      scheduleTabLintStyles2();
      notifyActiveEditorView2();
      refreshInspector2();
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
      switchToFile2(id);
    };
    window.addEventListener("beljar:edit-history-applied", function() {
      renderTabs2();
      if (typeof renderExplorerTree2 === "function") renderExplorerTree2();
      refreshExplorerActiveAndDiags2();
      updateHeaderContext2();
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
      switchToFile2(snap.fileId, { initialLocal: snap.local, keepSelection: true });
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
      switchToFile2(fileId, { peekAt, keepSelection: true });
    }
    function openFileAt2(fileId, from, to, opts) {
      if (from == null) return;
      opts = opts || {};
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
        switchToFile2(fileId, { jumpAt });
        return;
      }
      if (!getEditor()) return;
      if (typeof getEditor().jumpToReference === "function" && opts.name) {
        getEditor().jumpToReference(jumpAt, opts.name);
      } else if (typeof getEditor().jumpToRange === "function") {
        getEditor().jumpToRange(jumpAt);
        if (typeof BelEditor !== "undefined" && typeof BelEditor.logJumpResult === "function" && typeof getEditor().getView === "function") {
          const v = getEditor().getView();
          if (v) requestAnimationFrame(() => BelEditor.logJumpResult(v, jumpAt));
        }
      } else if (typeof getEditor().scheduleJumpToRange === "function") {
        getEditor().scheduleJumpToRange(jumpAt);
      }
      notifyActiveEditorView2();
    }
    window.addEventListener("beljar:open-file-at", (ev) => {
      const d = ev.detail || {};
      if (d.fileId) {
        refPeekRestore = null;
        openFileAt2(d.fileId, d.from, d.to, d);
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
    async function newFile2(name) {
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
        showToast2("A file with that name already exists in this folder.", { kind: "warn" });
        return;
      }
      const id = Persist.createFile(baseName);
      switchToFile2(id);
    }
    function closeFile2(id) {
      const openIds = Persist.getOpenFileIds();
      if (!openIds.includes(id)) return;
      if (openIds.length <= 1) {
        Persist.closeOpenFile(id);
        enterCanvasIdleView2();
        return;
      }
      if (getPersist() && getPersist().getCurrentFileId() === id) {
        const idx = openIds.indexOf(id);
        const neighborId = openIds[idx - 1] || openIds[idx + 1];
        if (neighborId) switchToFile2(neighborId);
      }
      Persist.closeOpenFile(id);
      renderTabs2();
    }
    function deleteFileInteractive2(id) {
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
          if (fallback) switchToFile2(fallback);
        }
        for (const id of unique) {
          Persist.deleteFile(id);
          cfgTabLint2.delete(id);
        }
        if (getExplorerController2() && getExplorerController2().clearSelection) getExplorerController2().clearSelection();
        if (projectIsEmpty2()) {
          enterEmptyProjectView2();
          return;
        }
        renderTabs2();
        renderExplorerTree2();
        updateHeaderContext2();
      };
      if (H && typeof H.transact === "function") H.transact("file-delete", performDelete);
      else performDelete();
    }
    function closeTabsForFiles2(ids) {
      const unique = [...new Set((ids || []).filter(Boolean))];
      const openIds = Persist.getOpenFileIds();
      const targets = unique.filter((id) => openIds.includes(id));
      if (!targets.length) return;
      if (targets.length >= openIds.length) {
        for (const id of targets) Persist.closeOpenFile(id);
        enterCanvasIdleView2();
        return;
      }
      for (const id of targets) closeFile2(id);
    }
    function selectionDeleteFileIds2(fileIds, folderPaths) {
      const ids = new Set(fileIds || []);
      for (const folderPath of folderPaths || []) {
        for (const file of filesUnderFolder(folderPath)) ids.add(file.id);
      }
      return [...ids];
    }
    function selectionDeleteDisabled2(fileIds, folderPaths) {
      return !selectionDeleteFileIds2(fileIds, folderPaths).length;
    }
    function deleteSelectionInteractive2(fileIds, folderPaths) {
      deleteFilesInteractive(selectionDeleteFileIds2(fileIds, folderPaths));
      if (folderPaths && folderPaths.length) {
        for (const folderPath of folderPaths) {
          Persist.pruneEmptyFoldersUnder(folderPath);
        }
        renderExplorerTree2();
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
    async function deleteFolderInteractive2(folderPath) {
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
      deleteProjectFilesById2(under.map((f) => f.id));
      Persist.pruneEmptyFoldersUnder(folderPath);
      if (projectIsEmpty2()) {
        enterEmptyProjectView2();
        return;
      }
      renderTabs2();
      renderExplorerTree2();
      updateHeaderContext2();
    }
    return {
      applyEditorJump,
      switchToFile: switchToFile2,
      captureRefPeekRestore,
      beginRefPeekSession,
      endRefPeekSession,
      peekFileAt,
      openFileAt: openFileAt2,
      newFile: newFile2,
      closeFile: closeFile2,
      deleteFileInteractive: deleteFileInteractive2,
      deleteFilesInteractive,
      closeTabsForFiles: closeTabsForFiles2,
      selectionDeleteFileIds: selectionDeleteFileIds2,
      selectionDeleteDisabled: selectionDeleteDisabled2,
      deleteSelectionInteractive: deleteSelectionInteractive2,
      filesUnderFolder,
      deleteFolderInteractive: deleteFolderInteractive2
    };
  }

  // js/app/app-explorer-bootstrap.mjs
  function create7(deps) {
    var getEditor = deps.getEditor;
    var setEditor = deps.setEditor;
    var getPersist = deps.getPersist;
    var setPersist = deps.setPersist;
    var projectFileText2 = deps.projectFileText;
    var showToast2 = deps.showToast;
    var setTip2 = deps.setTip;
    var explorerPanelEl2 = deps.explorerPanelEl;
    var libraryPanelEl2 = deps.libraryPanelEl;
    var inspectorPanelEl2 = deps.inspectorPanelEl;
    var inspectorProjectEmptyEl2 = deps.inspectorProjectEmptyEl;
    var renderTabs2 = deps.renderTabs;
    var updateHeaderContext2 = deps.updateHeaderContext;
    var updateRunButtonTooltip2 = deps.updateRunButtonTooltip;
    var reloadActiveEditorFromPersist2 = deps.reloadActiveEditorFromPersist;
    var switchToFile2 = deps.switchToFile;
    var ensureEditorMatchesFileKind2 = deps.ensureEditorMatchesFileKind;
    var activeCfgForDir2 = deps.activeCfgForDir;
    var activeCfgsForDir2 = deps.activeCfgsForDir;
    var suiteLayoutForDir2 = deps.suiteLayoutForDir;
    var explorerFileDiag2 = deps.explorerFileDiag;
    var bindExplorerDiagTip2 = deps.bindExplorerDiagTip;
    var makeActiveCfgForFile2 = deps.makeActiveCfgForFile;
    var fileContextItems2 = deps.fileContextItems;
    var explorerSelectionContextItems2 = deps.explorerSelectionContextItems;
    var explorerFolderContextItems2 = deps.explorerFolderContextItems;
    var backgroundRunItems2 = deps.backgroundRunItems;
    var resolveAndApplyMove2 = deps.resolveAndApplyMove;
    var afterSuiteEdit2 = deps.afterSuiteEdit;
    var applyFileReplacement2 = deps.applyFileReplacement;
    var executeUploadPlan2 = deps.executeUploadPlan;
    var exportLibraryAsNewProject2 = deps.exportLibraryAsNewProject;
    var projectIsEmpty2 = deps.projectIsEmpty;
    var projectTreeEmpty2 = deps.projectTreeEmpty;
    var updateInspectorProjectEmpty2 = deps.updateInspectorProjectEmpty;
    var getWorkspaceBootPending = deps.getWorkspaceBootPending;
    var restoreWorkspaceForFile2 = deps.restoreWorkspaceForFile;
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
      reloadActiveEditorFromPersist2();
      Persist.renameEmptyFolderPrefix(from, to);
      renderTabs2();
      updateHeaderContext2();
    }
    function handleExplorerInlineCancel(session) {
      if (!session || session.mode !== "create") return;
      if (session.kind === "file") {
        Persist.deleteFile(session.fileId);
        renderTabs2();
        updateHeaderContext2();
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
          showToast2(result.error, { kind: "warn" });
          return false;
        }
        if (result.fullPath !== file.name) {
          Persist.renameFile(session.fileId, result.fullPath);
          if (session.fileId === Persist.getActiveFileId()) {
            ensureEditorMatchesFileKind2();
          }
        }
        if (session.mode === "create") switchToFile2(session.fileId);
        else {
          renderTabs2();
          updateHeaderContext2();
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
          showToast2(result.error, { kind: "warn" });
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
      ensureExplorer2();
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
      ensureExplorer2();
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
    function explorerCreateMenuItems2(parentDir) {
      return [
        { label: "New file", onSelect: () => startExplorerCreateFile(parentDir) },
        { label: "New folder", onSelect: () => startExplorerCreateFolder(parentDir) },
        { type: "separator" }
      ];
    }
    function renameFolderInteractive2(folderPath) {
      ensureExplorer2();
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
    function ensureExplorer2() {
      if (explorerController) return;
      const treeEl = explorerPanelEl2 && explorerPanelEl2.querySelector(".explorer-tree");
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
        getActiveCfgForDir: activeCfgForDir2,
        getActiveCfgsForDir: activeCfgsForDir2,
        getSuiteLayoutForDir: suiteLayoutForDir2,
        getFileDiag: explorerFileDiag2,
        bindFileDiagTip: bindExplorerDiagTip2,
        getProjectName: () => Persist.getProjectName(),
        applyTip: (el, tip) => setTip2(el, tip, { ariaLabel: false }),
        getFileContextItems: (fileId) => fileContextItems2(fileId),
        getSelectionContextItems: (selection) => explorerSelectionContextItems2(selection),
        getFolderContextItems: (folderPath) => explorerFolderContextItems2(folderPath),
        getBackgroundContextItems: () => backgroundRunItems2(),
        onOpenFile: (id, openOpts) => switchToFile2(id, openOpts),
        onMakeActiveCfg: makeActiveCfgForFile2,
        onRefresh: updateRunButtonTooltip2,
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
          resolveAndApplyMove2(payload, target);
        }
      });
      ensureExplorerSearch();
    }
    function ensureExplorerSearch() {
      if (explorerSearchController) return;
      if (!explorerPanelEl2) return;
      const wrap = explorerPanelEl2.querySelector("#explorer-search-wrap");
      const input = explorerPanelEl2.querySelector("#explorer-search-input");
      const ac = explorerPanelEl2.querySelector("#explorer-search-ac");
      if (!wrap || !input || !ac) return;
      explorerSearchController = ExplorerSearch.init({
        wrap,
        input,
        ac,
        header: wrap.closest(".panel-header"),
        listFiles: () => Persist.listFiles(),
        getFileText: projectFileText2,
        onOpenFile: (id) => switchToFile2(id)
      });
    }
    function ensureLibrary2() {
      if (libraryController) return;
      const treeEl = libraryPanelEl2 && libraryPanelEl2.querySelector(".library-tree");
      const searchEl = document.getElementById("library-search");
      if (!treeEl) return;
      libraryController = Library.init({
        container: treeEl,
        searchEl,
        listFiles: () => Persist.listFiles(),
        getActiveCfgForDir: activeCfgForDir2,
        listActiveSuites: () => LibrarySuites.listActiveSuites({
          listFiles: () => Persist.listFiles(),
          getActiveCfgsForDir: activeCfgsForDir2,
          getActiveCfgForDir: activeCfgForDir2
        }),
        getActiveFileId: () => getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId(),
        getEditor: () => getEditor(),
        applyTip: (el, tip) => setTip2(el, tip, { ariaLabel: false }),
        showToast: showToast2,
        afterSuiteEdit: afterSuiteEdit2,
        applyFileReplacement: (id, text) => applyFileReplacement2(id, text),
        applyUploadPlan: (plan) => executeUploadPlan2(plan, { openTabs: false }),
        onProjectChanged: ({ modifiedActive } = {}) => {
          renderTabs2();
          renderExplorerTree2();
          updateHeaderContext2();
          if (modifiedActive) reloadActiveEditorFromPersist2();
        },
        onExportAsNewProject: (payload) => {
          exportLibraryAsNewProject2(payload);
        }
      });
    }
    function renderExplorerTree2() {
      ensureExplorer2();
      if (explorerController) explorerController.refresh();
      else updateRunButtonTooltip2();
    }
    function refreshExplorerActiveAndDiags2() {
      ensureExplorer2();
      if (explorerController?.refreshActiveAndDiags) explorerController.refreshActiveAndDiags();
      else if (explorerController?.refreshDiags) explorerController.refreshDiags();
    }
    function refreshInspector2(detail) {
      if (projectTreeEmpty2()) {
        updateInspectorProjectEmpty2();
        return;
      }
      if (inspectorProjectEmptyEl2) inspectorProjectEmptyEl2.hidden = true;
      const body = inspectorPanelEl2?.querySelector(".inspector-body");
      if (body) body.hidden = false;
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("beljar:inspector-refresh", { detail: detail || {} })));
    }
    function notifyActiveEditorView2() {
      if (!getEditor() || typeof getEditor().getView !== "function") return;
      const view = getEditor().getView();
      if (!view?.dom?.isConnected) return;
      window.dispatchEvent(new CustomEvent("beljar:active-editor-view", { detail: { view } }));
      const fileId = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
      if (!getWorkspaceBootPending()) {
        requestAnimationFrame(() => restoreWorkspaceForFile2(fileId));
      }
    }
    return {
      renameFolderPrefix,
      handleExplorerInlineCancel,
      handleExplorerInlineCommit,
      startExplorerCreateFile,
      startExplorerCreateFolder,
      explorerCreateMenuItems: explorerCreateMenuItems2,
      renameFolderInteractive: renameFolderInteractive2,
      ensureExplorer: ensureExplorer2,
      ensureExplorerSearch,
      ensureLibrary: ensureLibrary2,
      renderExplorerTree: renderExplorerTree2,
      refreshExplorerActiveAndDiags: refreshExplorerActiveAndDiags2,
      refreshInspector: refreshInspector2,
      notifyActiveEditorView: notifyActiveEditorView2,
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
    var newProject2 = deps.newProject;
    var newFile2 = deps.newFile;
    var buildSwitchProjectSubmenu2 = deps.buildSwitchProjectSubmenu;
    var buildDeleteProjectSubmenu2 = deps.buildDeleteProjectSubmenu;
    var normalizeProjectRenameName2 = deps.normalizeProjectRenameName;
    var validateProjectRenameName2 = deps.validateProjectRenameName;
    var applyProjectRename2 = deps.applyProjectRename;
    var fileInputEl = deps.fileInputEl;
    var uploadFolderInputEl = deps.uploadFolderInputEl;
    var folderInputEl = deps.folderInputEl;
    var downloadCurrentFile2 = deps.downloadCurrentFile;
    var downloadFileById2 = deps.downloadFileById;
    var downloadFolder2 = deps.downloadFolder;
    var downloadSuite2 = deps.downloadSuite;
    var suiteDownloadState2 = deps.suiteDownloadState;
    var deleteFileInteractive2 = deps.deleteFileInteractive;
    var closeFile2 = deps.closeFile;
    var closeTabsForFiles2 = deps.closeTabsForFiles;
    var selectionDeleteFileIds2 = deps.selectionDeleteFileIds;
    var selectionDeleteDisabled2 = deps.selectionDeleteDisabled;
    var deleteSelectionInteractive2 = deps.deleteSelectionInteractive;
    var deleteFolderInteractive2 = deps.deleteFolderInteractive;
    var renameFolderInteractive2 = deps.renameFolderInteractive;
    var explorerCreateMenuItems2 = deps.explorerCreateMenuItems;
    var makeActiveCfgForFile2 = deps.makeActiveCfgForFile;
    var moduleNameFor2 = deps.moduleNameFor;
    var activeSuiteMembership2 = deps.activeSuiteMembership;
    var activeCfgsForDir2 = deps.activeCfgsForDir;
    var afterSuiteEdit2 = deps.afterSuiteEdit;
    var renderTabs2 = deps.renderTabs;
    var renderExplorerTree2 = deps.renderExplorerTree;
    var updateHeaderContext2 = deps.updateHeaderContext;
    var ensureEditorMatchesFileKind2 = deps.ensureEditorMatchesFileKind;
    var showToast2 = deps.showToast;
    var ensureExplorer2 = deps.ensureExplorer;
    var getExplorerController2 = deps.getExplorerController;
    var editorTabsEl2 = deps.editorTabsEl;
    var projectFileText2 = deps.projectFileText;
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
    function signatureFileCount2() {
      const files = Persist.listFiles() || [];
      return files.filter((f) => ProjectSource.isSignaturePath(String(f.name || ""))).length;
    }
    function buildProjectMenuItems() {
      const currentId = getPersist() ? getPersist().getCurrentFileId() : null;
      const currentFile = currentId ? Persist.getFileById(currentId) : null;
      const switchSubmenu = buildSwitchProjectSubmenu2();
      const deleteSubmenu = buildDeleteProjectSubmenu2();
      return [
        {
          label: "New project",
          onSelect: () => newProject2()
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
              normalize: normalizeProjectRenameName2,
              validate: validateProjectRenameName2,
              confirmLabel: "Save"
            });
            if (!next) return;
            applyProjectRename2(next);
          }
        },
        ...deleteSubmenu ? [{ label: "Delete project", submenu: deleteSubmenu }] : [],
        { type: "separator" },
        {
          label: "New file",
          onSelect: () => newFile2()
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
          onSelect: downloadCurrentFile2
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
            if (currentId) deleteFileInteractive2(currentId);
          }
        },
        { type: "separator" },
        {
          label: "Run project",
          disabled: signatureFileCount2() <= 1,
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
      ensureExplorer2();
      if (!getExplorerController2()) return;
      const IL = ExplorerInlineName;
      getExplorerController2().beginInlineName({
        kind: "file",
        mode: "rename",
        parentDir: ProjectSource.dirOf(file.name),
        fileId: id,
        displayName: IL.lastSegment(file.name),
        originalPath: file.name
      });
    }
    function explorerSelectionContextItems2(selection) {
      const fileIds = selection && selection.fileIds ? selection.fileIds : [];
      const folderPaths = selection && selection.folderPaths ? selection.folderPaths : [];
      const total = fileIds.length + folderPaths.length;
      if (total <= 1) {
        if (fileIds.length === 1) return fileContextItems2(fileIds[0]);
        if (folderPaths.length === 1) return explorerFolderContextItems2(folderPaths[0]);
        return null;
      }
      const items = [];
      const deleteCount = selectionDeleteFileIds2(fileIds, folderPaths).length;
      if (deleteCount > 0) {
        items.push({
          label: deleteCount === 1 ? "Delete file\u2026" : `Delete ${deleteCount} files\u2026`,
          disabled: selectionDeleteDisabled2(fileIds, folderPaths),
          onSelect: () => deleteSelectionInteractive2(fileIds, folderPaths)
        });
      }
      const openIds = Persist.getOpenFileIds();
      const openSelected = fileIds.filter((id) => openIds.includes(id));
      if (openSelected.length) {
        items.push({
          label: openSelected.length === 1 ? "Close tab" : `Close ${openSelected.length} tabs`,
          onSelect: () => closeTabsForFiles2(openSelected)
        });
      }
      return items;
    }
    function fileContextItems2(fileId, opts) {
      const fromTab = !!(opts && opts.fromTab);
      const files = Persist.listFiles();
      const file = files.find((f) => f.id === fileId);
      if (!file) return [];
      const parentDir = ProjectSource.dirOf(file.name);
      const manage = [
        { label: "Rename\u2026", onSelect: () => renameFileInteractive(fileId) },
        {
          label: "Download",
          onSelect: () => downloadFileById2(fileId)
        }
      ];
      if (file.name.toLowerCase().endsWith(".cfg")) {
        const suiteState = typeof suiteDownloadState2 === "function" ? suiteDownloadState2(fileId) : { ok: false, reason: "Suite download unavailable." };
        manage.push({
          label: "Download suite",
          disabled: !suiteState.ok,
          tooltip: suiteState.ok ? void 0 : suiteState.reason || "A listed suite file is missing from the project.",
          onSelect: () => downloadSuite2(fileId)
        });
      }
      const run = [];
      const suiteEdit = [];
      const low = file.name.toLowerCase();
      const Run = BelugaRun;
      if (low.endsWith(".cfg")) {
        if (Persist.getActiveCfgsForDir(ProjectSource.dirOf(file.name)).includes(file.name)) {
          run.push({
            label: "Deactivate suite",
            onSelect: () => {
              makeActiveCfgForFile2(file.name);
              renderTabs2();
            }
          });
        } else {
          run.push({
            label: "Make active suite",
            onSelect: () => {
              makeActiveCfgForFile2(file.name);
              renderTabs2();
            }
          });
        }
        if (Run && Run.runModuleCfg) {
          run.push({ label: "Run suite", onSelect: () => Run.runModuleCfg(file.name) });
        }
      } else if (Run && ProjectSource.isSignaturePath(file.name)) {
        run.push({ label: "Run file", onSelect: () => Run.runFile(fileId) });
        const moduleName = moduleNameFor2(fileId);
        const { cfg, member, index, count } = activeSuiteMembership2(file.name);
        if (moduleName) {
          if (member && index > 0) {
            run.push({ label: "Run suite to here", onSelect: () => Run.runToHere(fileId) });
          }
          run.push({ label: "Run suite", onSelect: () => Run.runModule(fileId) });
        }
        const dir = ProjectSource.dirOf(file.name);
        if (cfg && member) {
          if (index > 0) {
            suiteEdit.push({ label: "Move up in suite", onSelect: () => {
              Persist.moveEntryInCfg(cfg, file.name, -1);
              afterSuiteEdit2(dir, cfg);
            } });
          }
          if (index < count - 1) {
            suiteEdit.push({ label: "Move down in suite", onSelect: () => {
              Persist.moveEntryInCfg(cfg, file.name, 1);
              afterSuiteEdit2(dir, cfg);
            } });
          }
          suiteEdit.push({ label: "Remove from suite", onSelect: () => {
            Persist.removeEntryFromCfg(cfg, file.name);
            afterSuiteEdit2(dir, cfg);
          } });
        } else {
          const activeCfgs = activeCfgsForDir2(dir);
          if (activeCfgs.length === 1) {
            suiteEdit.push({ label: "Add to active suite", onSelect: () => {
              Persist.addEntryToCfg(activeCfgs[0], file.name);
              afterSuiteEdit2(dir, activeCfgs[0]);
            } });
          } else {
            for (const c of activeCfgs) {
              const base = c.slice(c.lastIndexOf("/") + 1);
              suiteEdit.push({ label: "Add to " + base, onSelect: () => {
                Persist.addEntryToCfg(c, file.name);
                afterSuiteEdit2(dir, c);
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
          onSelect: () => closeFile2(fileId)
        }
      ];
      if (fromTab) {
        destroy.push({
          label: "Close all to the right",
          disabled: tabsToRight.length === 0,
          onSelect: () => closeTabsForFiles2(tabsToRight)
        });
      }
      destroy.push({
        label: "Delete file\u2026",
        onSelect: () => deleteFileInteractive2(fileId)
      });
      const blocks = fromTab ? [manage] : [explorerCreateMenuItems2(parentDir), manage];
      if (run.length) blocks.push(run);
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
    function explorerFolderContextItems2(folderPath) {
      const create10 = explorerCreateMenuItems2(folderPath);
      const rename = [
        { label: "Rename\u2026", onSelect: () => renameFolderInteractive2(folderPath) },
        {
          label: "Download folder",
          onSelect: () => downloadFolder2(folderPath)
        },
        { type: "separator" }
      ];
      const destroy = [
        {
          label: "Delete folder\u2026",
          onSelect: () => deleteFolderInteractive2(folderPath)
        },
        { type: "separator" }
      ];
      const run = folderRunItems(folderPath);
      const runBlock = run.length ? run.concat([{ type: "separator" }]) : [];
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
    function backgroundRunItems2() {
      const create10 = explorerCreateMenuItems2("");
      if (signatureFileCount2() < 1) return create10;
      return create10.concat([
        { label: "Run project", onSelect: () => BelugaRun.runProject() },
        { type: "separator" }
      ]);
    }
    if (typeof Menu !== "undefined") {
      const contextItemsFromEvent = (e) => {
        const el = e.target.closest("[data-file-id]");
        return el ? fileContextItems2(el.getAttribute("data-file-id"), { fromTab: true }) : [];
      };
      if (editorTabsEl2) Menu.bindContextMenu(editorTabsEl2, contextItemsFromEvent);
    }
    function editorExec2(cmd) {
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
        showToast2("No Beluga source files to format.", { kind: "warn" });
        return;
      }
      const activeId = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
      const formatOffline = typeof BelEditor !== "undefined" && typeof BelEditor.formatSource === "function" ? BelEditor.formatSource : null;
      let changed = 0;
      for (const f of files) {
        if (f.id === activeId && getEditor() && typeof getEditor().format === "function") {
          if (getEditor().format()) changed += 1;
          continue;
        }
        if (!formatOffline) continue;
        const next = formatOffline(projectFileText2(f.id), { quiet: true });
        if (next == null) continue;
        Persist.setFileText(f.id, next);
        changed += 1;
      }
      if (changed === 0) {
        showToast2("All files already formatted.", { kind: "success" });
      } else if (changed === 1) {
        showToast2("Formatted 1 file.", { kind: "success" });
      } else {
        showToast2("Formatted " + changed + " files.", { kind: "success" });
      }
    }
    function buildEditMenuItems() {
      const currentId = getPersist() ? getPersist().getCurrentFileId() : null;
      const currentFile = currentId ? Persist.getFileById(currentId) : null;
      const canFormatFile = !!(currentFile && ProjectSource.isSignaturePath(String(currentFile.name || "")) && getEditor() && typeof getEditor().format === "function");
      return [
        { label: "Undo", onSelect: () => editorExec2("undo") },
        { label: "Redo", onSelect: () => editorExec2("redo") },
        { type: "separator" },
        { label: "Cut", onSelect: () => editorClipboard("cut") },
        { label: "Copy", onSelect: () => editorClipboard("copy") },
        { label: "Paste", onSelect: () => editorClipboard("paste") },
        { label: "Select All", onSelect: () => editorExec2("selectAll") },
        { type: "separator" },
        { label: "Find\u2026", onSelect: () => editorExec2("openSearch") },
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
          disabled: signatureFileCount2() === 0,
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
        items: () => explorerCreateMenuItems2("").filter((item) => item.type !== "separator")
      });
    }
    return {
      wireMenuTrigger,
      signatureFileCount: signatureFileCount2,
      buildProjectMenuItems,
      renameFileInteractive,
      explorerSelectionContextItems: explorerSelectionContextItems2,
      fileContextItems: fileContextItems2,
      explorerFolderContextItems: explorerFolderContextItems2,
      folderRunItems,
      backgroundRunItems: backgroundRunItems2,
      editorExec: editorExec2,
      editorClipboard,
      buildToolsMenuItems
    };
  }

  // js/app/app-command-palette.mjs
  function create9(deps) {
    var getPersist = deps.getPersist;
    var toggleSidePanel2 = deps.toggleSidePanel;
    var toggleTheme2 = deps.toggleTheme;
    var newProject2 = deps.newProject;
    var newFile2 = deps.newFile;
    var fileInputEl = deps.fileInputEl;
    var uploadFolderInputEl = deps.uploadFolderInputEl;
    var folderInputEl = deps.folderInputEl;
    var downloadCurrentFile2 = deps.downloadCurrentFile;
    var editorExec2 = deps.editorExec;
    var moduleNameFor2 = deps.moduleNameFor;
    var signatureFileCount2 = deps.signatureFileCount;
    var switchToFile2 = deps.switchToFile;
    var openFileAt2 = deps.openFileAt;
    var projectFileText2 = deps.projectFileText;
    {
      CommandPalette.init();
      const reg = CommandPalette.register;
      reg({ id: "project.new", title: "New Project\u2026", section: "File", run: () => newProject2() });
      reg({ id: "file.new", title: "New file\u2026", section: "File", run: () => newFile2() });
      reg({ id: "file.upload", title: "Upload File", section: "File", run: () => fileInputEl.click() });
      reg({ id: "file.upload-folder", title: "Upload Folder", section: "File", run: () => uploadFolderInputEl.click() });
      reg({ id: "file.import-folder", title: "Import Folder as New Project", section: "File", run: () => folderInputEl.click() });
      reg({ id: "file.download", title: "Download Current File", section: "File", run: downloadCurrentFile2 });
      reg({ id: "edit.undo", title: "Undo", section: "Edit", shortcut: "Mod+Z", run: () => editorExec2("undo") });
      reg({ id: "edit.redo", title: "Redo", section: "Edit", shortcut: "Mod+Y", run: () => editorExec2("redo") });
      reg({ id: "edit.find", title: "Find\u2026", section: "Edit", shortcut: "Mod+F", run: () => editorExec2("openSearch") });
      reg({
        id: "edit.search-project",
        title: "Search in Project\u2026",
        section: "Edit",
        shortcut: "Mod+Shift+F",
        run: () => CommandPalette.open({ mode: "search" })
      });
      reg({ id: "edit.toggle-comment", title: "Toggle Line Comment", section: "Edit", shortcut: "Mod+/", run: () => editorExec2("toggleComment") });
      reg({
        id: "edit.format",
        title: "Format Document",
        section: "Edit",
        shortcut: "Alt+Shift+F",
        run: () => editorExec2("format")
      });
      reg({
        id: "nav.symbol",
        title: "Go to Symbol\u2026",
        section: "Navigate",
        shortcut: "Mod+Shift+O",
        run: () => CommandPalette.open({ mode: "symbols" })
      });
      reg({
        id: "tools.palette",
        title: "Open Command Palette",
        section: "Tools",
        shortcut: "Mod+K",
        run: () => CommandPalette.open()
      });
      reg({
        id: "tools.graph",
        title: "Open Dependency Graph",
        section: "Tools",
        run: () => window.CurrentEditor?.openDependencyGraph()
      });
      reg({
        id: "tools.inspector",
        title: "Open Inspector",
        section: "Tools",
        run: () => window.dispatchEvent(new Event("beljar:open-inspector"))
      });
      reg({
        id: "run.file",
        title: "Run File",
        section: "Run",
        run: () => {
          if (BelugaRun.runFile) BelugaRun.runFile();
        }
      });
      reg({
        id: "run.here",
        title: "Run Suite to Here",
        section: "Run",
        run: () => {
          if (BelugaRun.runToHere) BelugaRun.runToHere();
        }
      });
      reg({
        id: "run.module",
        title: "Run Suite",
        section: "Run",
        when: () => !!moduleNameFor2(),
        run: () => {
          if (BelugaRun.runModule) BelugaRun.runModule();
        }
      });
      reg({
        id: "run.project",
        title: "Run Project",
        section: "Run",
        when: () => signatureFileCount2() > 1,
        run: () => {
          if (BelugaRun.runProject) BelugaRun.runProject();
        }
      });
      reg({
        id: "run.clear-output",
        title: "Clear Output",
        section: "Run",
        run: () => {
          ReplOutput.clearOutput();
        }
      });
      reg({ id: "view.theme", title: "Toggle Theme", section: "View", run: toggleTheme2 });
      reg({ id: "view.explorer", title: "Toggle Explorer", section: "View", run: () => toggleSidePanel2("explorer") });
      reg({
        id: "view.settings",
        title: "Open Settings\u2026",
        section: "View",
        run: () => {
          SettingsUI.open();
        }
      });
      CommandPalette.setProvider("files", () => {
        const currentId = getPersist() ? getPersist().getCurrentFileId() : null;
        return Persist.listFiles().filter((f) => f.id !== currentId).map((f) => ({ title: f.name, detail: "Switch to file", run: () => switchToFile2(f.id) }));
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
            run: () => openFileAt2(s.fileId, s.from, s.to)
          });
        }
        return items;
      });
      CommandPalette.setProvider("search", (query) => {
        if (!query || query.length < 2) return [];
        const activeId = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
        const entries = Persist.listFiles().map((f) => ({
          id: f.id,
          name: f.name,
          text: projectFileText2(f.id)
        }));
        return ProjectSource.scanProjectText(entries, query, 60).map((m) => ({
          title: m.lineText,
          mono: true,
          detail: m.name.split("/").pop() + ":" + m.line,
          run: () => openFileAt2(m.id, m.from, m.to)
        }));
      });
    }
  }

  // js/app/app.mjs
  var editorMount = document.getElementById("editor");
  var editorEmptyEl = document.getElementById("editor-empty");
  var inspectorProjectEmptyEl = document.getElementById("inspector-project-empty");
  var cmdInput = typeof ReplStream !== "undefined" && ReplStream.getCommandInput ? ReplStream.getCommandInput() : document.getElementById("command-input");
  var btnRun = typeof ReplStream !== "undefined" && ReplStream.getRunButton ? ReplStream.getRunButton() : document.getElementById("btn-run");
  Persist.ensureProject();
  ensureProjectActiveCfgs();
  if (typeof EditHistoryInstall !== "undefined") {
    EditHistoryInstall.init();
  }
  var openFileIds = Persist.getOpenFileIds();
  var activeFileId = openFileIds.length ? openFileIds.includes(Persist.getActiveFileId()) ? Persist.getActiveFileId() : openFileIds[0] : null;
  var persist = activeFileId ? Persist.createPersist({ documentId: activeFileId }) : null;
  var initialCheckpoint = persist ? persist.getInitialCheckpoint() : null;
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
        { duration: 5e3 }
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
  var workspaceBootPending = true;
  var restoredFloatIds = /* @__PURE__ */ new Set();
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
  var editor = activeFileId ? mountEditorFor(initialCheckpoint) : null;
  ensureEditorMatchesFileKind();
  window.CurrentEditor = editor;
  window.BelJarCurrentEditor = window.CurrentEditor;
  var cfgExplorerRefreshTimer = null;
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
  Toasts.init();
  Notifications.init();
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
    if (/^autosolve-/.test(key)) return false;
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
  window.addEventListener("beljar:settings-changed", function(e) {
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
    document.documentElement.classList.toggle("light");
    var isLight = document.documentElement.classList.contains("light");
    Persist.writeStoredTheme(isLight ? "light" : "dark");
    syncEditorCmTheme();
  }
  window.Repl = {
    appendBuffered: function(text, kind) {
      ReplOutput.appendOutput(text, kind || "auto");
    }
  };
  window.BelJarRepl = window.Repl;
  var filesBtn = document.getElementById("btn-files");
  var inspectorBtn = document.getElementById("btn-inspector");
  var libraryBtn = document.getElementById("btn-library");
  var harpoonBtn = document.getElementById("btn-harpoon");
  var workspaceEl = document.querySelector(".workspace");
  var explorerPanelEl = document.getElementById("explorer-panel");
  var inspectorPanelEl = document.getElementById("inspector-panel");
  var libraryPanelEl = document.getElementById("library-panel");
  var harpoonPanelEl = document.getElementById("harpoon-panel");
  var SIDE_PANELS = {
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
  var editorTabsEl = document.getElementById("editor-tabs");
  var cfgTabLint = /* @__PURE__ */ new Map();
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
  var tabLintStyleRaf = 0;
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
  var peelHub = {
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
  var suppressUnloadFlush = false;
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
  var headerProjectRenameInput = null;
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
  var headerContextEl = document.getElementById("header-context");
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
  window.addEventListener("beljar:file-lint", (ev) => {
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
  window.addEventListener("beljar:explorer-health-changed", () => scheduleTabLintStyles());
  window.addEventListener("beljar:development-checked", () => scheduleTabLintStyles());
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
    window.addEventListener("beljar:open-inspector", openInspector);
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
  var harpoonPanelInited = false;
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
    window.addEventListener("beljar:doc-changed", debouncedHarpoonRefresh);
    window.addEventListener("beljar:file-lint", debouncedHarpoonRefresh);
    window.addEventListener("beljar:active-editor-view", debouncedHarpoonRefresh);
    window.addEventListener("beljar:development-checked", debouncedHarpoonRefresh);
    window.addEventListener("beljar:hole-goals-updated", debouncedHarpoonRefresh);
    if (workspaceEl.classList.contains("is-harpoon-open")) {
      ensureHarpoonPanel();
      refreshHarpoonPanelIfOpen();
    }
  }
  var settingsBtn = document.getElementById("btn-settings");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      SettingsUI.open();
    });
  }
  var reloadBtn = document.getElementById("btn-reload");
  if (reloadBtn) {
    reloadBtn.addEventListener("click", () => {
      window.location.reload();
    });
  }
  document.getElementById("btn-theme").addEventListener("click", toggleTheme);
  document.getElementById("btn-load").addEventListener("click", (e) => {
    const file = activeFileRecord();
    if (file && /\.cfg$/i.test(file.name)) {
      BelugaRun.runModuleCfg(file.name);
      return;
    }
    if (!file || !moduleNameFor(file.id)) {
      BelugaRun.runFile();
      return;
    }
    if (e.ctrlKey || e.metaKey) BelugaRun.runModule();
    else BelugaRun.runToHere();
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
      if (typeof ReplAutocomplete !== "undefined" && ReplAutocomplete.refresh) {
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
  window.addEventListener("beforeunload", () => {
    if (typeof ReplPersist !== "undefined" && ReplPersist.saveNow) {
      ReplPersist.saveNow();
    }
    if (persist && !suppressUnloadFlush) persist.flushCheckpoint();
    WorkspaceState.flushWorkspace();
  });
  window.addEventListener("pagehide", () => {
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
})();
