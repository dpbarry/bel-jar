/**
 * Explorer/search/library bootstrap + inline create/rename — injected into app.js.
 */

  export function create(deps) {
    var getEditor = deps.getEditor;
    var setEditor = deps.setEditor;
    var getPersist = deps.getPersist;
    var setPersist = deps.setPersist;
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
    var projectIsEmpty = deps.projectIsEmpty;
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
        if (f.name !== from && !f.name.startsWith(from + '/')) continue;
        const rel = f.name === from ? '' : f.name.slice(from.length + 1);
        const newPath = to ? (rel ? to + '/' + rel : to) : rel;
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
      if (!session || session.mode !== 'create') return;
      if (session.kind === 'file') {
        Persist.deleteFile(session.fileId);
        renderTabs();
        updateHeaderContext();
      } else if (session.kind === 'folder') {
        Persist.removeEmptyFolder(session.folderPath);
      }
    }

    function handleExplorerInlineCommit(session, rawName) {
      const IL = ExplorerInlineName
      if (!IL) return false;
      const files = Persist.listFiles();
      const empty = Persist.listEmptyFolders();

      if (session.kind === 'file') {
        const file = Persist.getFileById(session.fileId);
        if (!file) return false;
        const parentDir = session.mode === 'rename'
          ? ProjectSource.dirOf(file.name)
          : session.parentDir;
        const result = IL.validateFileCommit(
          rawName,
          parentDir,
          files,
          session.fileId,
        );
        if (!result.ok) {
          showToast(result.error, { kind: 'warn' });
          return false;
        }
        if (result.fullPath !== file.name) {
          Persist.renameFile(session.fileId, result.fullPath);
          if (session.fileId === Persist.getActiveFileId()) {
            ensureEditorMatchesFileKind();
          }
        }
        if (session.mode === 'create') switchToFile(session.fileId);
        else {
          renderTabs();
          updateHeaderContext();
        }
        return true;
      }

      if (session.kind === 'folder') {
        const parentDir = session.mode === 'rename'
          ? IL.parentDir(session.folderPath)
          : session.parentDir;
        const result = IL.validateFolderCommit(
          rawName,
          parentDir,
          files,
          empty,
          session.folderPath,
        );
        if (!result.ok) {
          showToast(result.error, { kind: 'warn' });
          return false;
        }
        if (session.mode === 'create') {
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
        kind: 'file',
        mode: 'create',
        parentDir,
        fileId: id,
        folderPath: null,
        displayName: IL.lastSegment(fullPath),
        originalPath: fullPath,
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
        kind: 'folder',
        mode: 'create',
        parentDir,
        folderPath: fullPath,
        displayName: IL.lastSegment(fullPath),
        originalPath: fullPath,
      });
    }

    function explorerCreateMenuItems(parentDir) {
      return [
        { label: 'New file', onSelect: () => startExplorerCreateFile(parentDir) },
        { label: 'New folder', onSelect: () => startExplorerCreateFolder(parentDir) },
        { type: 'separator' },
      ];
    }

    function renameFolderInteractive(folderPath) {
      ensureExplorer();
      if (!explorerController) return;
      const IL = ExplorerInlineName;
      explorerController.beginInlineName({
        kind: 'folder',
        mode: 'rename',
        parentDir: IL.parentDir(folderPath),
        folderPath,
        displayName: IL.lastSegment(folderPath),
        originalPath: folderPath,
      });
    }

    function ensureExplorer() {
      if (explorerController) return;
      const treeEl = explorerPanelEl && explorerPanelEl.querySelector('.explorer-tree');
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
            Persist.listEmptyFolders(),
          );
        },
        onDrop: (payload, target) => { resolveAndApplyMove(payload, target); },
      });
      ensureExplorerSearch();
    }

    function ensureExplorerSearch() {
      if (explorerSearchController) return;
      if (!explorerPanelEl) return;
      const wrap = explorerPanelEl.querySelector('#explorer-search-wrap');
      const input = explorerPanelEl.querySelector('#explorer-search-input');
      const ac = explorerPanelEl.querySelector('#explorer-search-ac');
      if (!wrap || !input || !ac) return;
      explorerSearchController = ExplorerSearch.init({
        wrap,
        input,
        ac,
        header: wrap.closest('.panel-header'),
        listFiles: () => Persist.listFiles(),
        getFileText: projectFileText,
        onOpenFile: (id) => switchToFile(id),
      });
    }

    function ensureLibrary() {
      if (libraryController) return;
      const treeEl = libraryPanelEl && libraryPanelEl.querySelector('.library-tree');
      const searchEl = document.getElementById('library-search');
      if (!treeEl) return;
      libraryController = Library.init({
        container: treeEl,
        searchEl: searchEl,
        listFiles: () => Persist.listFiles(),
        getActiveCfgForDir: activeCfgForDir,
        listActiveSuites: () => LibrarySuites.listActiveSuites({
            listFiles: () => Persist.listFiles(),
            getActiveCfgsForDir: activeCfgsForDir,
            getActiveCfgForDir: activeCfgForDir,
          }),
        getActiveFileId: () => (getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId()),
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
        onExportAsNewProject: (payload) => { exportLibraryAsNewProject(payload); },
      });
    }

    function renderExplorerTree() {
      ensureExplorer();
      if (explorerController) explorerController.refresh();
      else updateRunButtonTooltip();
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
      const body = inspectorPanelEl?.querySelector('.inspector-body');
      if (body) body.hidden = false;
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('beljar:inspector-refresh', { detail: detail || {} })));
    }

    function notifyActiveEditorView() {
      if (!getEditor() || typeof getEditor().getView !== 'function') return;
      const view = getEditor().getView();
      if (!view?.dom?.isConnected) return;
      window.dispatchEvent(new CustomEvent('beljar:active-editor-view', { detail: { view } }));
      const fileId = getPersist()
        ? getPersist().getCurrentFileId()
        : Persist.getActiveFileId();
      if (!getWorkspaceBootPending()) {
        requestAnimationFrame(() => restoreWorkspaceForFile(fileId));
      }
    }

    return {
      renameFolderPrefix: renameFolderPrefix,
      handleExplorerInlineCancel: handleExplorerInlineCancel,
      handleExplorerInlineCommit: handleExplorerInlineCommit,
      startExplorerCreateFile: startExplorerCreateFile,
      startExplorerCreateFolder: startExplorerCreateFolder,
      explorerCreateMenuItems: explorerCreateMenuItems,
      renameFolderInteractive: renameFolderInteractive,
      ensureExplorer: ensureExplorer,
      ensureExplorerSearch: ensureExplorerSearch,
      ensureLibrary: ensureLibrary,
      renderExplorerTree: renderExplorerTree,
      refreshExplorerActiveAndDiags: refreshExplorerActiveAndDiags,
      refreshInspector: refreshInspector,
      notifyActiveEditorView: notifyActiveEditorView,
      getExplorerController: function () { return explorerController; },
      getLibraryController: function () { return libraryController; },
    };
  }
