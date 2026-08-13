/**
 * Active cfg, suite membership, dangling entries, afterSuiteEdit — injected into app.js.
 */

  export function create(deps) {
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
      if (typeof ProjectSource.inferActiveCfgByDir !== 'function') return;
      if (typeof Persist.backfillActiveCfgByDir !== 'function') return;
      const files = Persist.listFiles();
      const getText = (id) => projectFileText(id);
      Persist.backfillActiveCfgByDir(ProjectSource.inferActiveCfgByDir(files, getText));
    }

    function ensureActiveCfgForDir(dir) {
      if (Persist.getActiveCfgForDir(dir)) return;
      if (typeof ProjectSource.inferActiveCfgForDir !== 'function') return;
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
      const SL = ExplorerSuiteLayout
      if (!SL || typeof SL.computeDirLayout !== 'function') {
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
      const SL = ExplorerSuiteLayout

      if (active.includes(fileName)) {
        Persist.removeActiveCfgForDir(dir, fileName);
      } else if (SL) {
        const check = SL.canActivateCfg(fileName, active, files, getText, suiteMembersResolver);
        if (!check.ok) {
          showToast(check.reason || 'Cannot activate suite', { kind: 'warn' });
          return;
        }
        Persist.addActiveCfgForDir(dir, fileName);
      } else {
        Persist.setActiveCfgForDir(dir, fileName);
      }

      const activeId = Persist.getActiveFileId();
      const activeFile = Persist.getFileById(activeId);
      if (getEditor()?.remoduleContext && activeFile
        && ProjectSource.dirOf(activeFile.name) === dir) {
        getEditor().remoduleContext();
      }
      renderExplorerTree();
      updateHeaderContext();
      updateRunButtonTooltip();
    }

    // The module (.cfg basename) for the file's folder active cfg, or null when standalone.
    function moduleNameFor(fileId) {
      const files = Persist.listFiles();
      const getText = projectFileText;
      const id = fileId || Persist.getActiveFileId();
      const dev = ProjectSource.developmentForFile(files, id, getText);
      if (dev.kind !== 'module' || !dev.cfg) return null;
      return dev.cfg.slice(dev.cfg.lastIndexOf('/') + 1).replace(/\.cfg$/i, '');
    }

    // The active suite (.cfg) for a file's folder, whether the file is listed in it,
    // and its load-order index — drives the "Add to / Remove from / Move in suite"
    // context-menu actions.
    function activeSuiteMembership(fileName) {
      const cfg = owningActiveCfgForFile(fileName);
      if (!cfg) return { cfg: null, member: false, index: -1, count: 0 };
      const files = Persist.listFiles();
      const getText = projectFileText;
      const paths = ProjectSource.developmentFilesForCfg(files, cfg, getText).map((f) => f.name);
      const index = paths.indexOf(fileName);
      return { cfg, member: index !== -1, index, count: paths.length };
    }

    // Does a .cfg list an entry that doesn't resolve to a project file? Cheap and
    // project-wide — no Beluga — so the explorer can badge a broken suite definition
    // without opening it. Mirrors js/editor-src/cfg-lint.mjs.
    function cfgHasDanglingEntry(cfgName) {
      const files = Persist.listFiles();
      const cfgFile = files.find((f) => f.name === cfgName);
      if (!cfgFile) return false;
      const names = new Set(files.map((f) => f.name));
      const dir = ProjectSource.dirOf(cfgName);
      for (const entry of ProjectSource.parseCfg(projectFileText(cfgFile.id))) {
        if (!ProjectSource.isCfgEntryToken(entry)) continue;
        if (!names.has(dir ? dir + '/' + entry : entry)) return true;
      }
      return false;
    }

    // Explorer error indicator: .cfg via cfg lint cache; .bel/.elf via dev-check + live beluga (derived, not persisted).
    function explorerFileDiag(fileId, fileName) {
      const low = String(fileName || '').toLowerCase();
      if (low.endsWith('.cfg')) {
        if (cfgHasDanglingEntry(fileName)) return 'warning';
        const activeId = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
        const lint = fileId === activeId ? liveFileLint() : cfgTabLint.get(fileId);
        if (lint && lint.errors > 0) return 'error';
        if (lint && lint.warnings > 0) return 'warning';
        return null;
      }
      if (ProjectSource.isSignaturePath(fileName)) {
        const health = belFileHealth(fileId);
        if (health.errors > 0) return 'error';
        if (health.warnings > 0) return 'warning';
        return null;
      }
      return null;
    }

    // Refresh everything that depends on suite membership after a cfg-body edit:
    // the active file may have gained/lost a prelude, so re-module it.
    function afterSuiteEdit(dir, editedCfg) {
      if (!editedCfg) {
        const activeFile = Persist.getFileById(Persist.getActiveFileId());
        if (activeFile && /\.cfg$/i.test(activeFile.name)
          && ProjectSource.dirOf(activeFile.name) === dir) {
          editedCfg = activeFile.name;
        }
      }
      reconcileActiveCfgsInDir(dir, editedCfg);
      if (editedCfg && typeof BelEditor !== 'undefined'
        && typeof BelEditor.invalidateFileHealthAfterChange === 'function') {
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
      if (getLibraryController() && typeof getLibraryController().refresh === 'function') {
        getLibraryController().refresh();
      }
    }

    function activeFileRecord() {
      const id = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
      return id ? Persist.getFileById(id) : null;
    }

    function updateRunButtonTooltip() {
      const btn = document.getElementById('btn-load');
      if (!btn) return;
      const file = activeFileRecord();
      if (file && /\.cfg$/i.test(file.name)) {
        setTip(btn, 'Run suite');
      } else if (file && moduleNameFor(file.id)) {
        // First suite member has no prelude — ordinary Run, still Ctrl+click for the suite.
        const hasPrelude = !!(ProjectSource.buildPrelude
          && ProjectSource.buildPrelude(Persist.listFiles(), file.id, projectFileText));
        setTip(btn, hasPrelude
          ? 'Run suite to here\nCtrl+click: run suite'
          : 'Run\nCtrl+click: run suite');
      } else {
        setTip(btn, 'Run');
      }
    }

    return {
      ensureProjectActiveCfgs: ensureProjectActiveCfgs,
      ensureActiveCfgForDir: ensureActiveCfgForDir,
      activeCfgForDir: activeCfgForDir,
      activeCfgsForDir: activeCfgsForDir,
      suiteMembersResolver: suiteMembersResolver,
      suiteLayoutForDir: suiteLayoutForDir,
      owningActiveCfgForFile: owningActiveCfgForFile,
      reconcileActiveCfgsInDir: reconcileActiveCfgsInDir,
      makeActiveCfgForFile: makeActiveCfgForFile,
      moduleNameFor: moduleNameFor,
      activeSuiteMembership: activeSuiteMembership,
      cfgHasDanglingEntry: cfgHasDanglingEntry,
      explorerFileDiag: explorerFileDiag,
      afterSuiteEdit: afterSuiteEdit,
      activeFileRecord: activeFileRecord,
      updateRunButtonTooltip: updateRunButtonTooltip,

    };
  }
