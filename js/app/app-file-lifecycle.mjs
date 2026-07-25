/**
 * File switch/peek/openAt/new/close/delete — injected into app.js.
 */

  export function create(deps) {
    var getEditor = deps.getEditor;
    var setEditor = deps.setEditor;
    var getPersist = deps.getPersist;
    var setPersist = deps.setPersist;
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
    var ensureEditorMatchesFileKind = deps.ensureEditorMatchesFileKind;
    var showToast = deps.showToast;
    var projectIsEmpty = deps.projectIsEmpty;
    var enterCanvasIdleView = deps.enterCanvasIdleView;
    var enterEmptyProjectView = deps.enterEmptyProjectView;
    var deleteProjectFilesById = deps.deleteProjectFilesById;
    var getExplorerController = deps.getExplorerController;
    var syncCfgEditorsAfterRewrite = deps.syncCfgEditorsAfterRewrite;
    var refPeekRestore = null;

    function applyEditorJump(jumpAt) {
      if (!getEditor() || !jumpAt) return false;
      if (typeof getEditor().jumpToReference === 'function' && jumpAt.name) {
        return getEditor().jumpToReference(jumpAt, jumpAt.name);
      }
      if (typeof getEditor().jumpToRange === 'function') {
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
        const snapshot = getPersist().getInitialCheckpoint();
        setEditor(mountEditorFor(snapshot, openOpts));
        syncEditorCmTheme();
        if (typeof BelugaClient !== 'undefined' && BelugaClient.noteEditorChange) {
          BelugaClient.noteEditorChange(getEditor() ? getEditor().getValue() : '');
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
      const shouldClearSelection = !keepSelection
        && !(getExplorerController() && getExplorerController().shouldKeepSelectionOnOpen
          && getExplorerController().shouldKeepSelectionOnOpen());
      const peekAt = openOpts && openOpts.peekAt;
      const jumpAt = openOpts && openOpts.jumpAt;
      const initialLocal = openOpts && openOpts.initialLocal;
      Persist.openFile(id);
      const editorDocId = typeof getEditor().getDocumentId === 'function' ? getEditor().getDocumentId() : null;
      const persistId = getPersist().getCurrentFileId();
      if (id === persistId && editorDocId === id) {
        Persist.setActiveFileId(id);
        renderTabs();
        if (peekAt && getEditor() && typeof getEditor().peekRange === 'function') getEditor().peekRange(peekAt);
        else if (jumpAt) applyEditorJump(jumpAt);
        else if (initialLocal != null && getEditor() && typeof getEditor().applyViewport === 'function') {
          getEditor().applyViewport(initialLocal);
        } else if (shouldClearSelection && getExplorerController() && getExplorerController().clearSelection) {
          getExplorerController().clearSelection();
        }
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
      const lintItems = getEditor() && typeof getEditor().getLintTooltipItems === 'function'
        ? getEditor().getLintTooltipItems()
        : null;
      if (snap && leavingFile && /\.cfg$/i.test(leavingFile.name)) {
        rememberCfgLint(leavingId, { ...snap, items: lintItems });
      }
      WorkspaceState.flushWorkspace();
      if (getEditor() && typeof getEditor().cancelRename === 'function') getEditor().cancelRename();
      // Order matters: switchFile flushes the OLD file while its engine/providers
      // are still alive, then loads the new state and drops the stale providers.
      const snapshot = getPersist().switchFile(id);
      Persist.setActiveFileId(id);
      getEditor().destroy();
      setEditor(mountEditorFor(snapshot, {
        jumpAt,
        initialLocal: initialLocal != null ? initialLocal : (snapshot ? snapshot.editor.local : null),
      }));
      syncEditorCmTheme();
      if (typeof BelugaClient !== 'undefined' && BelugaClient.noteEditorChange) {
        BelugaClient.noteEditorChange(getEditor() ? getEditor().getValue() : '');
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
          if (getEditor() && typeof getEditor().peekRange === 'function') getEditor().peekRange(peekAt);
        } else if (jumpAt) {
          if (!applyEditorJump(jumpAt) && getEditor() && typeof getEditor().restoreViewport === 'function') {
            getEditor().restoreViewport();
          }
        }
      });
    }

    window.belJarSwitchToFileForHistory = function (id) {
      switchToFile(id);
    };

    window.addEventListener('beljar:edit-history-applied', function () {
      renderTabs();
      if (typeof renderExplorerTree === 'function') renderExplorerTree();
      refreshExplorerActiveAndDiags();
      updateHeaderContext();
    });

    // Find-references hover preview: switch tabs to peek cross-file rows, then
    // restore the pre-menu editor state when the menu closes without a click.

    function captureRefPeekRestore() {
      if (!getEditor() || !getPersist()) return null;
      const local = typeof getEditor().getViewport === 'function'
        ? getEditor().getViewport()
        : getPersist().getEditorLocal();
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
        if (getEditor() && typeof getEditor().applyViewport === 'function') {
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
        name: opts.name,
      };
      const currentId = getPersist().getCurrentFileId();
      if (currentId === fileId) {
        if (getEditor() && typeof getEditor().peekRange === 'function') getEditor().peekRange(peekAt);
        return;
      }
      switchToFile(fileId, { peekAt, keepSelection: true });
    }

    // Open a file (switching if needed) and jump to a position in it — the target
    // of cross-file go-to-definition, palette symbols, and project search.
    function openFileAt(fileId, from, to, opts) {
      if (from == null) return;
      opts = opts || {};
      if (typeof BelEditor !== 'undefined' && typeof BelEditor.logJumpRequest === 'function') {
        BelEditor.logJumpRequest({
          fileId, from, to, line: opts.line, col: opts.col, phase: 'openFileAt',
        });
      } else {
        console.warn('[bel-jar:jump] openFileAt (BelEditor.logJumpRequest missing)', { fileId, from, to });
      }
      const jumpAt = {
        from,
        to: to != null ? to : from,
        line: opts.line,
        col: opts.col,
        name: opts.name,
      };
      const editorDocId = getEditor() && typeof getEditor().getDocumentId === 'function'
        ? getEditor().getDocumentId()
        : (getPersist() ? getPersist().getCurrentFileId() : null);
      const needSwitch = editorDocId !== fileId;
      if (needSwitch) {
        switchToFile(fileId, { jumpAt });
        return;
      }
      if (!getEditor()) return;
      if (typeof getEditor().jumpToReference === 'function' && opts.name) {
        getEditor().jumpToReference(jumpAt, opts.name);
      } else if (typeof getEditor().jumpToRange === 'function') {
        getEditor().jumpToRange(jumpAt);
        if (typeof BelEditor !== 'undefined' && typeof BelEditor.logJumpResult === 'function'
          && typeof getEditor().getView === 'function') {
          const v = getEditor().getView();
          if (v) requestAnimationFrame(() => BelEditor.logJumpResult(v, jumpAt));
        }
      } else if (typeof getEditor().scheduleJumpToRange === 'function') {
        getEditor().scheduleJumpToRange(jumpAt);
      }
      notifyActiveEditorView();
    }

    // Fired by the editor layer (bel-ide-actions) when go-to-definition resolves
    // into ANOTHER project file.
    window.addEventListener('beljar:open-file-at', (ev) => {
      const d = ev.detail || {};
      if (d.fileId) {
        refPeekRestore = null;
        openFileAt(d.fileId, d.from, d.to, d);
      }
    });

    window.addEventListener('beljar:peek-file-at', (ev) => {
      const d = ev.detail || {};
      if (d.fileId) peekFileAt(d.fileId, d);
    });

    window.addEventListener('beljar:end-ref-peek', () => {
      endRefPeekSession();
    });

    window.addEventListener('beljar:cfg-rewritten', (ev) => {
      const ids = ev && ev.detail && ev.detail.fileIds;
      syncCfgEditorsAfterRewrite(ids);
    });

    async function newFile(name) {
      var baseName = name;
      if (!baseName) {
        var def = 'untitled.bel';
        var stemEnd = 8;
        {
          def = ExplorerInlineName.suggestDefaultFileName('', Persist.listFiles());
          var dot = def.lastIndexOf('.');
          stemEnd = dot > 0 ? dot : def.length;
        }
        baseName = await NamePrompt.open({
          ariaLabel: 'New file',
          message: 'New file',
          value: def,
          selection: { start: 0, end: stemEnd },
          mono: true,
          normalize: NamePrompt.normalizeBelFileName,
          validate: function (n) {
            if (!n) return 'Name is required.';
            if (NameConflicts.nameConflict(Persist.listFiles(), n)) {
              return 'A file with that name already exists in this folder.';
            }
            return null;
          },
          confirmLabel: 'Create',
        });
      }
      if (!baseName) return;
      if (NameConflicts.nameConflict(Persist.listFiles(), baseName)) {
        showToast('A file with that name already exists in this folder.', { kind: 'warn' });
        return;
      }
      const id = Persist.createFile(baseName);
      switchToFile(id);
    }

    // Close the TAB only — the file stays in the project (reopen via the explorer).
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
      const confirmOpts = unique.length === 1
        ? {
          subject: names[0],
          message: 'Remove this file from the project?',
          ariaLabel: 'Delete file',
        }
        : deletingAll
          ? {
            message: 'Remove every file from the project?',
            ariaLabel: 'Delete all files',
          }
          : {
            message: 'Remove ' + unique.length + ' files from the project?',
            ariaLabel: 'Delete files',
          };
      if (!(await ConfirmDialog.confirm(confirmOpts))) return;
      const H = typeof EditHistory !== 'undefined' ? EditHistory : null;
      const performDelete = function () {
        if (getPersist() && unique.includes(getPersist().getCurrentFileId())) {
          const fallback = Persist.getOpenFileIds().find((x) => !unique.includes(x))
            || (files.find((f) => !unique.includes(f.id)) || {}).id;
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
      if (H && typeof H.transact === 'function') H.transact('file-delete', performDelete);
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
        (f) => f.name === folderPath || f.name.startsWith(folderPath + '/'),
      );
    }

    async function deleteFolderInteractive(folderPath) {
      const IL = ExplorerInlineName
      const label = IL ? IL.lastSegment(folderPath) : folderPath;
      const allFiles = Persist.listFiles();
      const under = filesUnderFolder(folderPath);
      const emptyUnder = Persist.listEmptyFolders().filter(
        (p) => p === folderPath || p.startsWith(folderPath + '/'),
      );
      if (!under.length && !emptyUnder.length) return;

      const deletingAll = under.length >= allFiles.length && allFiles.length > 0;
      const confirmOpts = under.length
        ? {
          subject: label,
          message: deletingAll
            ? 'Remove this folder and all ' + under.length + ' file' + (under.length === 1 ? '' : 's') + '?'
            : 'Remove this folder and ' + under.length + ' file' + (under.length === 1 ? '' : 's') + ' inside it?',
          ariaLabel: 'Delete folder',
        }
        : {
          subject: label,
          message: 'Remove this empty folder?',
          ariaLabel: 'Delete folder',
        };
      if (!(await ConfirmDialog.confirm(confirmOpts))) return;

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
      applyEditorJump: applyEditorJump,
      switchToFile: switchToFile,
      captureRefPeekRestore: captureRefPeekRestore,
      beginRefPeekSession: beginRefPeekSession,
      endRefPeekSession: endRefPeekSession,
      peekFileAt: peekFileAt,
      openFileAt: openFileAt,
      newFile: newFile,
      closeFile: closeFile,
      deleteFileInteractive: deleteFileInteractive,
      deleteFilesInteractive: deleteFilesInteractive,
      closeTabsForFiles: closeTabsForFiles,
      selectionDeleteFileIds: selectionDeleteFileIds,
      selectionDeleteDisabled: selectionDeleteDisabled,
      deleteSelectionInteractive: deleteSelectionInteractive,
      filesUnderFolder: filesUnderFolder,
      deleteFolderInteractive: deleteFolderInteractive,

    };
  }
