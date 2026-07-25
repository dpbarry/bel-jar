/**
 * Upload/import/move/download + cfg reload helpers — injected into app.js.
 */

  export function create(deps) {
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

    // Hidden file input for "Upload file".
    const fileInputEl = document.createElement('input');
    fileInputEl.type = 'file';
    fileInputEl.accept = '.bel';
    fileInputEl.style.display = 'none';
    fileInputEl.multiple = true;
    document.body.appendChild(fileInputEl);

    fileInputEl.addEventListener('change', async () => {
      const files = Array.from(fileInputEl.files || []);
      fileInputEl.value = '';
      if (!getPersist()) return;
      const entries = [];
      for (const file of files) {
        entries.push({ name: file.name, text: await file.text() });
      }
      const result = await resolveAndApplyUpload(entries, { openTabs: true });
      if (result === null) return;
      if (result.replaced > 0 && result.added === 0) {
        showToast('Replaced existing file.', { kind: 'success' });
      } else if (result.added > 0) {
        showToast(
          'Added ' + result.added + ' file' + (result.added === 1 ? '' : 's') + ' to the project.',
          { kind: 'success' },
        );
      }
    });

    function relPathFromPickerFile(file, opts) {
      const rel = file.webkitRelativePath || file.name;
      const parts = rel.split('/');
      if (opts && opts.stripRoot && parts.length > 1) return parts.slice(1).join('/');
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
        const base = entry.name.slice(entry.name.lastIndexOf('/') + 1);
        if (!cfgByDir[dir]) cfgByDir[dir] = {};
        cfgByDir[dir][base] = entry.text;
      }
      const byPath = new Map([...belEntries, ...elfEntries, ...cfgEntries].map((e) => [e.name, e]));
      const orderedSig = typeof ProjectSource.orderSignaturePaths === 'function'
        ? ProjectSource.orderSignaturePaths(sigPaths, cfgByDir)
        : sigPaths.slice().sort();
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
        showToast('No files to export.', { kind: 'warn' });
        return;
      }
      let projName = payload.defaultName || Persist.DEFAULT_PROJECT_NAME;
      projName = await NamePrompt.open({
          ariaLabel: 'Export as new project',
          message: 'New project',
          value: projName,
          normalize: NamePrompt.defaultNormalize,
          validate: (n) => (n ? null : 'Name is required.'),
          confirmLabel: 'Create',
        });
      if (projName === null) return;
      const tmpFiles = projectEntries.map((e, i) => ({ id: 'tmp-' + i, name: e.name }));
      const tmpText = (id) => projectEntries[Number(id.slice(4))]?.text ?? '';
      const activeCfgByDir = typeof ProjectSource.inferActiveCfgByDir === 'function'
        ? ProjectSource.inferActiveCfgByDir(tmpFiles, tmpText)
        : null;
      let activePath = payload.activeRelPath || null;
      if (!activePath) {
        const orderedBel = projectEntries.filter((e) => ProjectSource.isBelPath(e.name)).map((e) => e.name);
        activePath = orderedBel[0]
          || projectEntries.find((e) => ProjectSource.isSignaturePath(e.name))?.name
          || projectEntries.find((e) => ProjectSource.isCfgPath(e.name))?.name
          || null;
      }
      switchProjectAndReload(() => {
        Persist.createProjectWithFiles(projName, projectEntries, {
          projectName: projName,
          activeCfgByDir: activeCfgByDir || undefined,
        });
        if (activePath) {
          const created = Persist.listFiles().find((f) => f.name === activePath);
          if (created) Persist.setActiveFileId(created.id);
        }
      });
    }

    // Conflict-resolution replace writes storage directly; cancel any debounced autosave
    // on the active checkpoint first so it cannot stomp the new body afterward.
    function applyFileReplacement(id, text) {
      if (!id || text == null) return;
      const activeId = getPersist() ? getPersist().getCurrentFileId() : null;
      const registryActiveId = Persist.getActiveFileId();
      const isActive = !!(
        getEditor() && getPersist()
        && (id === activeId || id === registryActiveId)
      );
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
      if (file && /\.cfg$/i.test(file.name) && typeof getEditor().refreshLint === 'function') {
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
        const fallback = openIds[0]
          || (files.find((f) => !unique.includes(f.id)) || {}).id;
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
      const H = typeof EditHistory !== 'undefined' ? EditHistory : null;
      const run = () => executeUploadPlanInner(plan, options || {});
      if (H && typeof H.transact === 'function') {
        const r = H.transact('file-batch', run);
        return r.ok ? (r.result || { added: 0, replaced: 0 }) : { added: 0, replaced: 0 };
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
        folderBatchRoots: options.folderBatchRoots != null
          ? options.folderBatchRoots
          : [],
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

    // After batch moves, cfg bodies are updated via Persist.setFileText while the
    // live editor may still hold the pre-sync buffer — reload when storage diverges.
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
      if (file && /\.cfg$/i.test(file.name) && typeof getEditor().refreshLint === 'function') {
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
        if (getEditor() && typeof getEditor().refreshLint === 'function') getEditor().refreshLint();
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
          folderPaths: payload.folderPaths,
        });
        let resolutions = [];
        if (conflicts.length) {
          resolutions = await ConflictDialog.resolveConflicts(conflicts, { context: 'move' });
          if (resolutions === null) return;
        }
        plan = NameConflicts.applyMoveResolutions(existing, moves, conflicts, resolutions);
      }
      if (!plan) return;
      applyMovePlan(plan);
      for (const m of emptyMoves) Persist.renameEmptyFolderPrefix(m.from, m.to);
      if (emptyMoves.length) renderExplorerTree();
    }

    // Hidden directory input for "Upload folder" — adds every .bel/.elf/.cfg in the
    // tree to the current project, including the selected folder as a path prefix.
    const uploadFolderInputEl = document.createElement('input');
    uploadFolderInputEl.type = 'file';
    uploadFolderInputEl.webkitdirectory = true;
    uploadFolderInputEl.style.display = 'none';
    document.body.appendChild(uploadFolderInputEl);

    uploadFolderInputEl.addEventListener('change', async () => {
      const all = Array.from(uploadFolderInputEl.files || []);
      uploadFolderInputEl.value = '';
      if (!getPersist()) return;
      const { projectEntries, belCount } = await projectEntriesFromPickerFiles(all);
      if (!belCount) {
        showToast('No .bel files in that folder.', { kind: 'warn' });
        return;
      }
      const result = await resolveAndApplyUpload(projectEntries, {
        openTabs: false,
        folderBatchRoots: typeof NameConflicts.uploadFolderBatchRoots === 'function'
          ? NameConflicts.uploadFolderBatchRoots(projectEntries)
          : [],
      });
      if (result === null) return;
      const nAdded = result.added;
      if (nAdded > 0) {
        showToast(
          'Added ' + nAdded + ' file' + (nAdded === 1 ? '' : 's') + ' to the project.',
          { kind: 'success' },
        );
      } else if (result.replaced > 0) {
        showToast('Updated existing project files.', { kind: 'success' });
      }
    });

    // Hidden directory input for "Import folder as new project" — creates a project
    // named after the selected folder; file paths omit that outermost segment.
    const folderInputEl = document.createElement('input');
    folderInputEl.type = 'file';
    folderInputEl.webkitdirectory = true;
    folderInputEl.style.display = 'none';
    document.body.appendChild(folderInputEl);

    folderInputEl.addEventListener('change', async () => {
      const all = Array.from(folderInputEl.files || []);
      folderInputEl.value = '';
      if (!getPersist()) return;
      const { projectEntries, belCount } = await projectEntriesFromPickerFiles(all, { stripRoot: true });
      if (!belCount) {
        showToast('No .bel files in that folder.', { kind: 'warn' });
        return;
      }
      const rootName = (all[0] && all[0].webkitRelativePath)
        ? all[0].webkitRelativePath.split('/')[0]
        : 'Imported';
      const orderedPaths = projectEntries
        .filter((e) => ProjectSource.isBelPath(e.name))
        .map((e) => e.name);
      const firstBel = orderedPaths.length ? orderedPaths[0] : null;
      const tmpFiles = projectEntries.map((e, i) => ({ id: 'tmp-' + i, name: e.name }));
      const tmpText = (id) => projectEntries[Number(id.slice(4))]?.text ?? '';
      const activeCfgByDir = typeof ProjectSource.inferActiveCfgByDir === 'function'
        ? ProjectSource.inferActiveCfgByDir(tmpFiles, tmpText)
        : null;
      // Imports into a fresh PROJECT silo — the current project is untouched, and
      // the reload boots into the new (now active) project.
      switchProjectAndReload(() => {
        Persist.createProjectWithFiles(rootName, projectEntries, {
          projectName: rootName,
          activeCfgByDir: activeCfgByDir || undefined,
        });
        if (firstBel) {
          const created = Persist.listFiles().find((f) => f.name === firstBel);
          if (created) Persist.setActiveFileId(created.id);
        }
      });
    });

    function baseName(path) {
      const s = String(path || '');
      const i = s.lastIndexOf('/');
      return i === -1 ? s : s.slice(i + 1);
    }

    function relativeUnderPrefix(fullPath, prefix) {
      const path = String(fullPath || '');
      const root = String(prefix || '');
      if (!root) return path;
      if (path === root) return '';
      if (path.indexOf(root + '/') === 0) return path.slice(root.length + 1);
      return path;
    }

    function downloadFileById(fileId) {
      if (!fileId) return;
      const file = Persist.getFileById(fileId);
      if (!file) return;
      const text = typeof projectFileText === 'function' ? projectFileText(fileId) : (Persist.getFileText(fileId) || '');
      DownloadZip.downloadTextFile(text, baseName(file.name) || 'download.bel');
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

      const dirSet = new Set();
      const entries = [];
      const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

      for (let i = 0; i < under.length; i++) {
        const file = under[i];
        const rel = relativeUnderPrefix(file.name, folderPath);
        if (!rel) continue;
        const text = typeof projectFileText === 'function'
          ? projectFileText(file.id)
          : (Persist.getFileText(file.id) || '');
        entries.push({
          path: rel,
          data: enc ? enc.encode(text) : text,
        });
        const parts = rel.split('/');
        for (let d = 1; d < parts.length; d++) {
          dirSet.add(parts.slice(0, d).join('/'));
        }
      }

      for (let j = 0; j < emptyUnder.length; j++) {
        const relDir = relativeUnderPrefix(emptyUnder[j], folderPath);
        if (relDir) dirSet.add(relDir);
      }

      dirSet.forEach((dirPath) => {
        const coveredByFile = entries.some((e) => e.path.indexOf(dirPath + '/') === 0);
        if (!coveredByFile) entries.push({ path: dirPath + '/', directory: true });
      });

      entries.sort((a, b) => String(a.path).localeCompare(String(b.path)));
      DownloadZip.downloadZip(entries, (baseName(folderPath) || 'folder') + '.zip');
    }

    function suiteStem(cfgPath) {
      return String(baseName(cfgPath) || 'suite').replace(/\.cfg$/i, '') || 'suite';
    }

    function suiteMemberPaths(cfgPath, cfgText) {
      const PS = ProjectSource
      if (!PS || typeof PS.parseCfg !== 'function') return [];
      const dir = PS.dirOf(cfgPath);
      const out = [];
      const seen = new Set();
      const entries = PS.parseCfg(cfgText);
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (typeof PS.isCfgEntryToken === 'function' && !PS.isCfgEntryToken(entry)) continue;
        const full = dir ? dir + '/' + entry : entry;
        if (seen.has(full)) continue;
        seen.add(full);
        out.push({ entry: entry, full: full });
      }
      return out;
    }

    function suiteDownloadState(cfgFileId) {
      if (!cfgFileId) {
        return { ok: false, reason: 'Suite unavailable.' };
      }
      const cfgFile = Persist.getFileById(cfgFileId);
      if (!cfgFile || !/\.cfg$/i.test(String(cfgFile.name))) {
        return { ok: false, reason: 'Not a suite .cfg file.' };
      }
      const allFiles = Persist.listFiles() || [];
      const byName = new Map(allFiles.map((f) => [f.name, f]));
      const cfgText = typeof projectFileText === 'function'
        ? projectFileText(cfgFileId)
        : (Persist.getFileText(cfgFileId) || '');

      if (typeof ExplorerSuiteLayout.cfgHasDanglingEntry === 'function') {
        if (ExplorerSuiteLayout.cfgHasDanglingEntry(allFiles, cfgFile.name, projectFileText)) {
          return { ok: false, reason: 'A listed suite file is missing from the project.' };
        }
      } else {
        const members = suiteMemberPaths(cfgFile.name, cfgText);
        for (let i = 0; i < members.length; i++) {
          if (!byName.has(members[i].full)) {
            return { ok: false, reason: 'A listed suite file is missing from the project.' };
          }
        }
      }

      const stem = suiteStem(cfgFile.name);
      const members = suiteMemberPaths(cfgFile.name, cfgText);
      const pack = [];
      const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
      pack.push({
        path: stem + '/' + baseName(cfgFile.name),
        data: enc ? enc.encode(cfgText) : cfgText,
      });
      for (let j = 0; j < members.length; j++) {
        const mem = members[j];
        const file = byName.get(mem.full);
        if (!file) continue;
        const text = typeof projectFileText === 'function'
          ? projectFileText(file.id)
          : (Persist.getFileText(file.id) || '');
        pack.push({
          path: stem + '/' + mem.entry.replace(/\\/g, '/'),
          data: enc ? enc.encode(text) : text,
        });
      }
      return { ok: true, zipName: stem + '.zip', entries: pack };
    }

    function downloadSuite(cfgFileId) {
      const state = suiteDownloadState(cfgFileId);
      if (!state.ok) return;
      DownloadZip.downloadZip(state.entries, state.zipName);
    }

    return {
      fileInputEl: fileInputEl,
      relPathFromPickerFile: relPathFromPickerFile,
      projectEntriesFromRawEntries: projectEntriesFromRawEntries,
      projectEntriesFromPickerFiles: projectEntriesFromPickerFiles,
      exportLibraryAsNewProject: exportLibraryAsNewProject,
      applyFileReplacement: applyFileReplacement,
      deleteProjectFilesById: deleteProjectFilesById,
      executeUploadPlan: executeUploadPlan,
      resolveAndApplyUpload: resolveAndApplyUpload,
      reloadActiveEditorFromPersist: reloadActiveEditorFromPersist,
      syncCfgEditorsAfterRewrite: syncCfgEditorsAfterRewrite,
      applyMovePlan: applyMovePlan,
      resolveAndApplyMove: resolveAndApplyMove,
      uploadFolderInputEl: uploadFolderInputEl,
      folderInputEl: folderInputEl,
      downloadCurrentFile: downloadCurrentFile,
      downloadFileById: downloadFileById,
      downloadFolder: downloadFolder,
      downloadSuite: downloadSuite,
      suiteDownloadState: suiteDownloadState,
    };
  }
