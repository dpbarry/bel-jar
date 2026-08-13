/**
 * Header menus + project/edit/tools + tab/explorer context menus — injected into app.js.
 */

  export function create(deps) {
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
    var renderExplorerTree = deps.renderExplorerTree;
    var updateHeaderContext = deps.updateHeaderContext;
    var ensureEditorMatchesFileKind = deps.ensureEditorMatchesFileKind;
    var showToast = deps.showToast;
    var ensureExplorer = deps.ensureExplorer;
    var getExplorerController = deps.getExplorerController;
    var editorTabsEl = deps.editorTabsEl;
    var projectFileText = deps.projectFileText;

    // ── Header menus ──────────────────────────────────────────────────────────────

    function wireMenuTrigger(btn, menuOpts) {
      if (!btn) return;
      let suppressNextClick = false;

      function setOpen(open) {
        btn.classList.toggle('is-active', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      }

      function runMenuInteraction() {
        if (typeof Menu !== 'undefined' && Menu.isOpen() && Menu.rootAnchor() === btn) {
          Menu.closeAll();
          return;
        }
        if (typeof Menu === 'undefined') return;
        const items = typeof menuOpts.items === 'function' ? menuOpts.items() : menuOpts.items;
        Menu.open({
          anchor: btn,
          side: menuOpts.side,
          align: menuOpts.align,
          items,
          onClose: () => setOpen(false),
        });
        setOpen(true);
      }

      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        suppressNextClick = true;
        if (typeof Tooltips !== 'undefined') {
          Tooltips.suppressAnchor(btn);
          Tooltips.hide();
        }
        runMenuInteraction();
      });

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (suppressNextClick) {
          suppressNextClick = false;
          return;
        }
        if (typeof Tooltips !== 'undefined') {
          Tooltips.suppressAnchor(btn);
          Tooltips.hide();
        }
        runMenuInteraction();
      });
    }

    // Total signature files (.bel/.elf) in the workspace — gates "Run Project".
    function signatureFileCount() {
      const files = Persist.listFiles() || [];
      return files.filter((f) => ProjectSource.isSignaturePath(String(f.name || ''))).length;
    }

    function buildProjectMenuItems() {
      const currentId = getPersist() ? getPersist().getCurrentFileId() : null;
      const currentFile = currentId ? Persist.getFileById(currentId) : null;
      const switchSubmenu = buildSwitchProjectSubmenu();
      const deleteSubmenu = buildDeleteProjectSubmenu();

      return [
        {
          label: 'New project',
          onSelect: () => newProject(),
        },
        ...(switchSubmenu ? [{ label: 'Switch project', submenu: switchSubmenu }] : []),
        {
          label: 'Rename project…',
          onSelect: async () => {
            const cur = Persist.getProjectName();
            const next = await NamePrompt.open({
              ariaLabel: 'Rename project',
              message: 'Rename project',
              value: cur,
              normalize: normalizeProjectRenameName,
              validate: validateProjectRenameName,
              confirmLabel: 'Save',
            });
            if (!next) return;
            applyProjectRename(next);
          },
        },
        ...(deleteSubmenu ? [{ label: 'Delete project', submenu: deleteSubmenu }] : []),
        { type: 'separator' },
        {
          label: 'New file',
          onSelect: () => newFile(),
        },
        {
          label: 'Upload file',
          onSelect: () => fileInputEl.click(),
        },
        {
          label: 'Upload folder',
          onSelect: () => uploadFolderInputEl.click(),
        },
        {
          label: 'Import folder as new project',
          onSelect: () => folderInputEl.click(),
        },
        { type: 'separator' },
        {
          label: 'Download "' + (currentFile ? currentFile.name : 'file') + '"',
          onSelect: downloadCurrentFile,
        },
        { type: 'separator' },
        {
          label: 'Rename file…',
          disabled: !currentFile,
          onSelect: () => { if (currentId) renameFileInteractive(currentId); },
        },
        {
          label: 'Delete file…',
          disabled: !currentFile,
          onSelect: () => { if (currentId) deleteFileInteractive(currentId); },
        },
        { type: 'separator' },
        {
          label: 'Run project',
          disabled: signatureFileCount() <= 1,
          onSelect: () => {
            if (BelugaRun.runProject) {
              BelugaRun.runProject();
            }
          },
        },
      ];
    }

    function renameFileInteractive(id) {
      const file = Persist.getFileById(id);
      if (!file) return;
      ensureExplorer();
      if (!getExplorerController()) return;
      const IL = ExplorerInlineName;
      getExplorerController().beginInlineName({
        kind: 'file',
        mode: 'rename',
        parentDir: ProjectSource.dirOf(file.name),
        fileId: id,
        displayName: IL.lastSegment(file.name),
        originalPath: file.name,
      });
    }

    // ── File context menu (tabs + explorer rows) ──────────────────────────────────

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
          label: deleteCount === 1 ? 'Delete file…' : `Delete ${deleteCount} files…`,
          disabled: selectionDeleteDisabled(fileIds, folderPaths),
          onSelect: () => deleteSelectionInteractive(fileIds, folderPaths),
        });
      }

      const openIds = Persist.getOpenFileIds()
      const openSelected = fileIds.filter((id) => openIds.includes(id));
      if (openSelected.length) {
        items.push({
          label: openSelected.length === 1 ? 'Close tab' : `Close ${openSelected.length} tabs`,
          onSelect: () => closeTabsForFiles(openSelected),
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
        { label: 'Rename…', onSelect: () => renameFileInteractive(fileId) },
        {
          label: 'Download',
          onSelect: () => downloadFileById(fileId),
        },
      ];
      if (file.name.toLowerCase().endsWith('.cfg')) {
        const suiteState = typeof suiteDownloadState === 'function'
          ? suiteDownloadState(fileId)
          : { ok: false, reason: 'Suite download unavailable.' };
        manage.push({
          label: 'Download suite',
          disabled: !suiteState.ok,
          tooltip: suiteState.ok ? undefined : (suiteState.reason || 'A listed suite file is missing from the project.'),
          onSelect: () => downloadSuite(fileId),
        });
      }

      const run = [];
      const suiteEdit = [];
      const low = file.name.toLowerCase();
      const Run = BelugaRun
      if (low.endsWith('.cfg')) {
        if (Persist.getActiveCfgsForDir(ProjectSource.dirOf(file.name)).includes(file.name)) {
          run.push({
            label: 'Deactivate suite',
            onSelect: () => {
              makeActiveCfgForFile(file.name);
              renderTabs();
            },
          });
        } else {
          run.push({
            label: 'Make active suite',
            onSelect: () => {
              makeActiveCfgForFile(file.name);
              renderTabs();
            },
          });
        }
        if (Run && Run.runModuleCfg) {
          run.push({ label: 'Run suite', onSelect: () => Run.runModuleCfg(file.name) });
        }
      } else if (Run && ProjectSource.isSignaturePath(file.name)) {
        run.push({ label: 'Run file', onSelect: () => Run.runFile(fileId) });
        const moduleName = moduleNameFor(fileId);
        // Suite authoring: add/remove this file from its folder's active suite (.cfg)
        // without hand-editing the cfg text.
        const { cfg, member, index, count } = activeSuiteMembership(file.name);
        if (moduleName) {
          // "To here" only when predecessors exist; first member is already "Run file".
          if (member && index > 0) {
            run.push({ label: 'Run suite to here', onSelect: () => Run.runToHere(fileId) });
          }
          run.push({ label: 'Run suite', onSelect: () => Run.runModule(fileId) });
        }
        const dir = ProjectSource.dirOf(file.name);
        if (cfg && member) {
          if (index > 0) {
            suiteEdit.push({ label: 'Move up in suite', onSelect: () => { Persist.moveEntryInCfg(cfg, file.name, -1); afterSuiteEdit(dir, cfg); } });
          }
          if (index < count - 1) {
            suiteEdit.push({ label: 'Move down in suite', onSelect: () => { Persist.moveEntryInCfg(cfg, file.name, 1); afterSuiteEdit(dir, cfg); } });
          }
          suiteEdit.push({ label: 'Remove from suite', onSelect: () => { Persist.removeEntryFromCfg(cfg, file.name); afterSuiteEdit(dir, cfg); } });
        } else {
          const activeCfgs = activeCfgsForDir(dir);
          if (activeCfgs.length === 1) {
            suiteEdit.push({ label: 'Add to active suite', onSelect: () => { Persist.addEntryToCfg(activeCfgs[0], file.name); afterSuiteEdit(dir, activeCfgs[0]); } });
          } else {
            for (const c of activeCfgs) {
              const base = c.slice(c.lastIndexOf('/') + 1);
              suiteEdit.push({ label: 'Add to ' + base, onSelect: () => { Persist.addEntryToCfg(c, file.name); afterSuiteEdit(dir, c); } });
            }
          }
        }
      }

      const openIds = Persist.getOpenFileIds();
      const tabIdx = openIds.indexOf(fileId);
      const tabsToRight = tabIdx >= 0 ? openIds.slice(tabIdx + 1) : [];
      const destroy = [
        {
          label: 'Close tab',
          disabled: tabIdx === -1,
          onSelect: () => closeFile(fileId),
        },
      ];
      if (fromTab) {
        destroy.push({
          label: 'Close all to the right',
          disabled: tabsToRight.length === 0,
          onSelect: () => closeTabsForFiles(tabsToRight),
        });
      }
      destroy.push({
        label: 'Delete file…',
        onSelect: () => deleteFileInteractive(fileId),
      });

      const blocks = fromTab ? [manage] : [explorerCreateMenuItems(parentDir), manage];
      if (run.length) blocks.push(run);
      if (suiteEdit.length) blocks.push(suiteEdit);
      blocks.push(destroy);
      const out = [];
      for (let i = 0; i < blocks.length; i++) {
        const body = [];
        for (let j = 0; j < blocks[i].length; j++) {
          const item = blocks[i][j];
          if (item.type === 'separator') continue;
          body.push(item);
        }
        if (!body.length) continue;
        if (out.length) out.push({ type: 'separator' });
        for (let k = 0; k < body.length; k++) out.push(body[k]);
      }
      return out;
    }

    function explorerFolderContextItems(folderPath) {
      const create = explorerCreateMenuItems(folderPath);
      const rename = [
        { label: 'Rename…', onSelect: () => renameFolderInteractive(folderPath) },
        {
          label: 'Download folder',
          onSelect: () => downloadFolder(folderPath),
        },
        { type: 'separator' },
      ];
      const destroy = [
        {
          label: 'Delete folder…',
          onSelect: () => deleteFolderInteractive(folderPath),
        },
        { type: 'separator' },
      ];
      const run = folderRunItems(folderPath);
      const runBlock = run.length ? run.concat([{ type: 'separator' }]) : [];
      return create.concat(rename).concat(destroy).concat(runBlock);
    }

    // Run actions for an explorer folder row: its module if a .cfg lives there,
    // else the folder's signature files as one run.
    function folderRunItems(folderPath) {
      const files = Persist.listFiles() || [];
      const dirOf = ProjectSource.dirOf;
      const hasRunnable = files.some(
        (f) => dirOf(f.name) === folderPath && ProjectSource.isSignaturePath(String(f.name)),
      );
      if (!hasRunnable) return [];
      const cfg = files.find((f) => /\.cfg$/i.test(String(f.name)) && dirOf(f.name) === folderPath);
      return [{
        label: cfg ? 'Run suite' : 'Run folder',
        onSelect: () => BelugaRun.runFolder(folderPath),
      }];
    }

    // Run-everything action for empty explorer space.
    function backgroundRunItems() {
      const create = explorerCreateMenuItems('');
      if (signatureFileCount() < 1) return create;
      return create.concat([
        { label: 'Run project', onSelect: () => BelugaRun.runProject() },
        { type: 'separator' },
      ]);
    }

    if (typeof Menu !== 'undefined') {
      const contextItemsFromEvent = (e) => {
        const el = e.target.closest('[data-file-id]');
        return el ? fileContextItems(el.getAttribute('data-file-id'), { fromTab: true }) : [];
      };
      if (editorTabsEl) Menu.bindContextMenu(editorTabsEl, contextItemsFromEvent);
    }

    // ── Edit menu ─────────────────────────────────────────────────────────────────

    function editorExec(cmd) {
      if (!getEditor() || typeof getEditor()[cmd] !== 'function') return;
      getEditor().focus();
      getEditor()[cmd]();
    }

    function editorClipboard(action) {
      if (!getEditor()) return;
      getEditor().focus();
      try {
        document.execCommand(action);
      } catch (_) {}
    }

    function formatCurrentFile() {
      const ed = getEditor();
      if (!ed || typeof ed.format !== 'function') return;
      ed.focus();
      ed.format();
    }

    function formatProjectFiles() {
      const files = (Persist.listFiles() || []).filter((f) =>
        ProjectSource.isSignaturePath(String(f.name || ''))
      );
      if (!files.length) {
        showToast('No Beluga source files to format.', { kind: 'warn' });
        return;
      }
      const activeId = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
      const formatOffline = typeof BelEditor !== 'undefined' && typeof BelEditor.formatSource === 'function'
        ? BelEditor.formatSource
        : null;
      let changed = 0;
      for (const f of files) {
        if (f.id === activeId && getEditor() && typeof getEditor().format === 'function') {
          if (getEditor().format()) changed += 1;
          continue;
        }
        if (!formatOffline) continue;
        const next = formatOffline(projectFileText(f.id), { quiet: true });
        if (next == null) continue;
        Persist.setFileText(f.id, next);
        changed += 1;
      }
      if (changed === 0) {
        showToast('All files already formatted.', { kind: 'success' });
      } else if (changed === 1) {
        showToast('Formatted 1 file.', { kind: 'success' });
      } else {
        showToast('Formatted ' + changed + ' files.', { kind: 'success' });
      }
    }

    function buildEditMenuItems() {
      const currentId = getPersist() ? getPersist().getCurrentFileId() : null;
      const currentFile = currentId ? Persist.getFileById(currentId) : null;
      const canFormatFile = !!(
        currentFile
        && ProjectSource.isSignaturePath(String(currentFile.name || ''))
        && getEditor()
        && typeof getEditor().format === 'function'
      );
      return [
        { label: 'Undo', onSelect: () => editorExec('undo') },
        { label: 'Redo', onSelect: () => editorExec('redo') },
        { type: 'separator' },
        { label: 'Cut', onSelect: () => editorClipboard('cut') },
        { label: 'Copy', onSelect: () => editorClipboard('copy') },
        { label: 'Paste', onSelect: () => editorClipboard('paste') },
        { label: 'Select All', onSelect: () => editorExec('selectAll') },
        { type: 'separator' },
        { label: 'Find…', onSelect: () => editorExec('openSearch') },
        {
          label: 'Search in project…',
          onSelect: () => {
            CommandPalette.open({ mode: 'search' });
          },
        },
        { type: 'separator' },
        {
          label: 'Format file',
          disabled: !canFormatFile,
          onSelect: formatCurrentFile,
        },
        {
          label: 'Format project',
          disabled: signatureFileCount() === 0,
          onSelect: formatProjectFiles,
        },
      ];
    }

    // ── Tools menu ────────────────────────────────────────────────────────────────

    function buildToolsMenuItems() {
      return [
        {
          label: 'Open command palette…',
          shortcut: typeof CommandPalette !== 'undefined'
            ? CommandPalette.shortcutLabel('Mod+K')
            : 'Ctrl+K',
          onSelect: () => {
            CommandPalette.open();
          },
        },
        { type: 'separator' },
        {
          label: 'Dependency graph…',
          onSelect: () => window.CurrentEditor?.openDependencyGraph(),
        },
      ];
    }

    // ── Register all header menus ─────────────────────────────────────────────────

    const headerMenuDefs = [
      {
        id: 'menu-project',
        side: 'bottom',
        align: 'start',
        items: buildProjectMenuItems,  // function — rebuilt on each open
      },
      {
        id: 'menu-edit',
        side: 'bottom',
        align: 'start',
        items: buildEditMenuItems,
      },
      {
        id: 'menu-tools',
        side: 'bottom',
        align: 'start',
        items: buildToolsMenuItems,
      },
    ];

    headerMenuDefs.forEach((def) => {
      wireMenuTrigger(document.getElementById(def.id), def);
    });

    const explorerNewBtn = document.getElementById('btn-explorer-new');
    if (explorerNewBtn) {
      wireMenuTrigger(explorerNewBtn, {
        side: 'bottom',
        align: 'end',
        items: () => explorerCreateMenuItems('').filter((item) => item.type !== 'separator'),
      });
    }

    return {
      wireMenuTrigger: wireMenuTrigger,
      signatureFileCount: signatureFileCount,
      buildProjectMenuItems: buildProjectMenuItems,
      renameFileInteractive: renameFileInteractive,
      explorerSelectionContextItems: explorerSelectionContextItems,
      fileContextItems: fileContextItems,
      explorerFolderContextItems: explorerFolderContextItems,
      folderRunItems: folderRunItems,
      backgroundRunItems: backgroundRunItems,
      editorExec: editorExec,
      editorClipboard: editorClipboard,
      buildToolsMenuItems: buildToolsMenuItems,
    };
  }
