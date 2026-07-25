// Project file explorer: nested tree, persisted fold state, context menus, DnD hooks.
const global = globalThis;
var EXPLORER_CHEVRON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

  function explorerFileBucket(name) {
    var PS = global.ProjectSource;
    if (PS && PS.isCfgPath(name)) return 0;
    if (PS && PS.isSignaturePath(name)) return 1;
    var low = String(name).toLowerCase();
    if (low.endsWith('.cfg')) return 0;
    if (low.endsWith('.bel')) return 1;
    return 2;
  }

  // Legacy fallback when no suite layout resolver is wired (tests / bare model).
  function sortExplorerFilesLegacy(files, orderedNames) {
    var orderIndex = {};
    if (orderedNames) for (var k = 0; k < orderedNames.length; k++) orderIndex[orderedNames[k]] = k;
    var cfg = [];
    var members = [];
    var bel = [];
    var other = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var bucket = explorerFileBucket(f.name);
      if (bucket === 0) cfg.push(f);
      else if (orderIndex[f.name] !== undefined) members.push(f);
      else if (bucket === 1) bel.push(f);
      else other.push(f);
    }
    var byName = function (a, b) { return a.baseName.localeCompare(b.baseName); };
    cfg.sort(byName);
    bel.sort(byName);
    other.sort(byName);
    members.sort(function (a, b) { return orderIndex[a.name] - orderIndex[b.name]; });
    return cfg.concat(members, bel, other);
  }

  function sortExplorerNode(node, layoutForDir, dir) {
    if (layoutForDir) {
      var layout = layoutForDir(dir || '', node.files);
      node.files = layout && layout.orderedFiles ? layout.orderedFiles : node.files;
      node.suiteByFile = layout && layout.suiteByFile ? layout.suiteByFile : {};
    } else {
      node.files = sortExplorerFilesLegacy(node.files, null);
      node.suiteByFile = {};
    }
    node.folders.forEach(function (folder) { sortExplorerNode(folder, layoutForDir, folder.path); });
  }

  function buildExplorerModel(files, emptyFolders, layoutForDir) {
    var root = { folders: new Map(), files: [] };
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var parts = file.name.split('/');
      var node = root;
      var path = '';
      for (var j = 0; j < parts.length - 1; j++) {
        path = path ? path + '/' + parts[j] : parts[j];
        if (!node.folders.has(parts[j])) {
          node.folders.set(parts[j], { path: path, folders: new Map(), files: [] });
        }
        node = node.folders.get(parts[j]);
      }
      node.files.push({ id: file.id, name: file.name, baseName: parts[parts.length - 1] });
    }
    var empty = emptyFolders || [];
    for (var k = 0; k < empty.length; k++) {
      var folderPath = empty[k];
      if (!folderPath) continue;
      var segs = folderPath.split('/');
      var node2 = root;
      var path2 = '';
      for (var m = 0; m < segs.length; m++) {
        path2 = path2 ? path2 + '/' + segs[m] : segs[m];
        if (!node2.folders.has(segs[m])) {
          node2.folders.set(segs[m], { path: path2, folders: new Map(), files: [] });
        }
        node2 = node2.folders.get(segs[m]);
      }
    }
    sortExplorerNode(root, layoutForDir, '');
    return root;
  }

  function resolveCreateParentFromRow(row) {
    var IL = global.ExplorerInlineName;
    if (IL && IL.resolveCreateParentFromRow) return IL.resolveCreateParentFromRow(row);
    if (!row) return '';
    if (row.hasAttribute('data-folder-path')) return row.getAttribute('data-folder-path') || '';
    return row.getAttribute('data-drop-zone') || '';
  }

  function resolveCreateParentDir(target) {
    var IL = global.ExplorerInlineName;
    if (IL && IL.resolveCreateParentDir) return IL.resolveCreateParentDir(target);
    if (!target) return '';
    if (target.kind === 'folder') return target.folderPath || '';
    if (target.kind === 'file') return target.parentDir != null ? target.parentDir : '';
    return '';
  }

  function collectFolderPaths(node, out) {
    out = out || [];
    node.folders.forEach(function (folder) {
      out.push(folder.path);
      collectFolderPaths(folder, out);
    });
    return out;
  }

  function collectSubtreeFolderPaths(model, folderPath) {
    var out = [];
    function walk(node) {
      node.folders.forEach(function (folder) {
        if (!folderPath || folder.path === folderPath || folder.path.indexOf(folderPath + '/') === 0) {
          out.push(folder.path);
          walk(folder);
        }
      });
    }
    walk(model);
    return out;
  }

  function parentDirFromName(name) {
    var s = String(name || '');
    var i = s.lastIndexOf('/');
    return i === -1 ? '' : s.slice(0, i);
  }

  function rowKeyFromEl(row) {
    if (!row) return null;
    var fid = row.getAttribute && row.getAttribute('data-file-id');
    if (fid) return { kind: 'file', key: fid };
    var fp = row.getAttribute && row.getAttribute('data-folder-path');
    if (fp != null) return { kind: 'folder', key: fp };
    return null;
  }

  function rowKeyEqual(a, b) {
    return a && b && a.kind === b.kind && a.key === b.key;
  }

  function findRowIndex(rows, key) {
    for (var i = 0; i < rows.length; i++) {
      var rk = typeof rows[i].getAttribute === 'function'
        ? rowKeyFromEl(rows[i])
        : rows[i];
      if (rowKeyEqual(rk, key)) return i;
    }
    return -1;
  }

  function rangeSelectVisibleRows(rows, anchorKey, endKey) {
    var fileIds = new Set();
    var folderPaths = new Set();
    if (!rows.length || !endKey) return { fileIds: fileIds, folderPaths: folderPaths };
    var endIdx = findRowIndex(rows, endKey);
    if (endIdx === -1) return { fileIds: fileIds, folderPaths: folderPaths };
    var anchorIdx = anchorKey ? findRowIndex(rows, anchorKey) : endIdx;
    if (anchorIdx === -1) anchorIdx = endIdx;
    var lo = Math.min(anchorIdx, endIdx);
    var hi = Math.max(anchorIdx, endIdx);
    for (var j = lo; j <= hi; j++) {
      var rk = typeof rows[j].getAttribute === 'function'
        ? rowKeyFromEl(rows[j])
        : rows[j];
      if (!rk) continue;
      if (rk.kind === 'file') fileIds.add(rk.key);
      else folderPaths.add(rk.key);
    }
    return { fileIds: fileIds, folderPaths: folderPaths };
  }

  function toggleCtrlSelection(selectedFiles, selectedFolders, clickedKey, activeId) {
    var files = new Set(selectedFiles);
    var folders = new Set(selectedFolders);
    if (!files.size && !folders.size) {
      if (activeId) files.add(activeId);
      if (clickedKey.kind === 'file') files.add(clickedKey.key);
      else folders.add(clickedKey.key);
      return { fileIds: files, folderPaths: folders };
    }
    if (clickedKey.kind === 'file') {
      if (files.has(clickedKey.key)) files.delete(clickedKey.key);
      else files.add(clickedKey.key);
    } else if (folders.has(clickedKey.key)) folders.delete(clickedKey.key);
    else folders.add(clickedKey.key);
    return { fileIds: files, folderPaths: folders };
  }

  function isPathUnderFolder(path, folderPath) {
    if (!folderPath) return path.indexOf('/') !== -1;
    return path === folderPath || path.indexOf(folderPath + '/') === 0;
  }

  function directChildrenOfFolder(folderPath, existingFiles, emptyFolders) {
    var childFiles = {};
    var childFolders = {};
    var prefix = folderPath ? folderPath + '/' : '';
    for (var i = 0; i < existingFiles.length; i++) {
      var name = existingFiles[i].name;
      var rel = folderPath === '' ? name : (name.indexOf(prefix) === 0 ? name.slice(prefix.length) : '');
      if (!rel) continue;
      var slash = rel.indexOf('/');
      if (slash === -1) childFiles[existingFiles[i].id] = true;
      else {
        var fp = folderPath ? folderPath + '/' + rel.slice(0, slash) : rel.slice(0, slash);
        childFolders[fp] = true;
      }
    }
    var empty = emptyFolders || [];
    for (var j = 0; j < empty.length; j++) {
      var ep = empty[j];
      if (parentDirFromName(ep) === folderPath) childFolders[ep] = true;
    }
    return {
      fileIds: Object.keys(childFiles),
      folderPaths: Object.keys(childFolders),
    };
  }

  function dragRootsFromSelection(fileIds, folderPaths, existingFiles) {
    var fps = folderPaths || [];
    var rootFileIds = [];
    var rootFolderPaths = [];
    for (var i = 0; i < (fileIds || []).length; i++) {
      var file = null;
      for (var j = 0; j < existingFiles.length; j++) {
        if (existingFiles[j].id === fileIds[i]) { file = existingFiles[j]; break; }
      }
      if (!file) continue;
      var covered = false;
      for (var k = 0; k < fps.length; k++) {
        if (isPathUnderFolder(file.name, fps[k])) { covered = true; break; }
      }
      if (!covered) rootFileIds.push(fileIds[i]);
    }
    for (var f = 0; f < fps.length; f++) {
      var fp = fps[f];
      var nested = false;
      for (var g = 0; g < fps.length; g++) {
        if (fps[g] !== fp && isPathUnderFolder(fp, fps[g])) { nested = true; break; }
      }
      if (!nested) rootFolderPaths.push(fp);
    }
    return { fileIds: rootFileIds, folderPaths: rootFolderPaths };
  }

  function selectionDragCapability(fileIds, folderPaths, existingFiles, emptyFolders) {
    var fids = fileIds || [];
    var fps = folderPaths || [];
    var total = fids.length + fps.length;
    if (total < 2) return { ok: false };
    var fileSet = {};
    for (var i = 0; i < fids.length; i++) fileSet[fids[i]] = true;
    var folderSet = {};
    for (var j = 0; j < fps.length; j++) folderSet[fps[j]] = true;

    for (var fi = 0; fi < fps.length; fi++) {
      var children = directChildrenOfFolder(fps[fi], existingFiles, emptyFolders);
      for (var ci = 0; ci < children.fileIds.length; ci++) {
        if (!fileSet[children.fileIds[ci]]) return { ok: false };
      }
      for (var cj = 0; cj < children.folderPaths.length; cj++) {
        if (!folderSet[children.folderPaths[cj]]) return { ok: false };
      }
    }

    var roots = dragRootsFromSelection(fids, fps, existingFiles);
    var rootTotal = roots.fileIds.length + roots.folderPaths.length;
    if (!rootTotal) return { ok: false };

    var parent = null;
    for (var ri = 0; ri < roots.fileIds.length; ri++) {
      var fileR = null;
      for (var rj = 0; rj < existingFiles.length; rj++) {
        if (existingFiles[rj].id === roots.fileIds[ri]) { fileR = existingFiles[rj]; break; }
      }
      if (!fileR) return { ok: false };
      var pR = parentDirFromName(fileR.name);
      if (parent === null) parent = pR;
      else if (parent !== pR) return { ok: false };
    }
    for (var rk = 0; rk < roots.folderPaths.length; rk++) {
      var pF = parentDirFromName(roots.folderPaths[rk]);
      if (parent === null) parent = pF;
      else if (parent !== pF) return { ok: false };
    }

    return { ok: true, fileIds: roots.fileIds, folderPaths: roots.folderPaths };
  }

  function sameParentFileIdsForDrag(fileIds, rowKey, existingFiles) {
    var ids = fileIds || [];
    if (!rowKey || rowKey.kind !== 'file') return null;
    if (ids.length < 2) return null;
    var cap = selectionDragCapability(ids, [], existingFiles);
    if (cap.ok) return cap.fileIds;
    var dragged = null;
    for (var i = 0; i < existingFiles.length; i++) {
      if (existingFiles[i].id === rowKey.key) { dragged = existingFiles[i]; break; }
    }
    if (!dragged) return null;
    var parent = parentDirFromName(dragged.name);
    var subset = [];
    for (var j = 0; j < ids.length; j++) {
      var f = null;
      for (var k = 0; k < existingFiles.length; k++) {
        if (existingFiles[k].id === ids[j]) { f = existingFiles[k]; break; }
      }
      if (f && parentDirFromName(f.name) === parent) subset.push(ids[j]);
    }
    if (subset.length < 2) return null;
    var cap2 = selectionDragCapability(subset, [], existingFiles);
    return cap2.ok ? cap2.fileIds : null;
  }

  // Y coordinate (viewport) where the move-to-root zone begins — see resolveDrop.
  function rootZoneTopFromLastRow(kind, depth, top, bottom) {
    if (kind === 'file' && depth === 0) return top;
    return bottom;
  }

  function computeRootZoneBoundary(container) {
    var rows = container.querySelectorAll('.explorer-folder-item, .explorer-file-item');
    var pad = container.querySelector('.explorer-tree-root-pad');
    if (!rows.length) {
      return { rootTop: container.getBoundingClientRect().top, pad: pad, tailRow: null };
    }
    var last = rows[rows.length - 1];
    var rect = last.getBoundingClientRect();
    var depth = parseInt(last.getAttribute('data-tree-depth') || '0', 10);
    var kind = last.classList.contains('explorer-file-item') ? 'file' : 'folder';
    return {
      rootTop: rootZoneTopFromLastRow(kind, depth, rect.top, rect.bottom),
      pad: pad,
      tailRow: kind === 'file' && depth === 0 ? last : null,
    };
  }

  function loadCollapsed(projectName) {
    var P = global.Persist;
    if (!P) return new Set();
    return new Set(P.getExplorerFold(projectName));
  }

  function saveCollapsed(projectName, collapsed) {
    var P = global.Persist;
    if (!P) return;
    P.setExplorerFold(projectName, [].slice.call(collapsed));
  }

  function init(opts) {
    opts = opts || {};
    var container = opts.container;
    if (!container) return null;

    var collapsed = loadCollapsed(opts.getProjectName ? opts.getProjectName() : 'Untitled Project');
    var saveTimer = null;
    var dndDetach = null;
    var focusedRow = null;
    var inlineSession = null;
    var inlineInputEl = null;
    var selectedFiles = new Set();
    var selectedFolders = new Set();
    var pendingShiftSelect = null;
    var suppressClearSelection = false;

    function listEmptyFolders() {
      return opts.listEmptyFolders ? opts.listEmptyFolders() : [];
    }

    function expandParentChain(parentDirPath) {
      if (!parentDirPath) return;
      var parts = parentDirPath.split('/');
      var acc = '';
      for (var i = 0; i < parts.length; i++) {
        acc = acc ? acc + '/' + parts[i] : parts[i];
        collapsed.delete(acc);
      }
    }

    function clearInlineSession() {
      inlineSession = null;
      inlineInputEl = null;
    }

    function beginInlineName(session) {
      selectedFiles.clear();
      selectedFolders.clear();
      inlineSession = session;
      if (session.parentDir) expandParentChain(session.parentDir);
      refresh();
    }

    function cancelInlineName() {
      if (!inlineSession) return;
      if (typeof opts.onInlineCancel === 'function') opts.onInlineCancel(inlineSession);
      clearInlineSession();
      refresh();
    }

    function commitInlineName(rawName) {
      if (!inlineSession) return false;
      if (typeof opts.onInlineCommit !== 'function') return false;
      var ok = opts.onInlineCommit(inlineSession, rawName);
      if (ok) {
        clearInlineSession();
        refresh();
      } else if (inlineInputEl) {
        inlineInputEl.classList.add('is-invalid');
        inlineInputEl.focus();
        inlineInputEl.select();
        setTimeout(function () {
          if (inlineInputEl) inlineInputEl.classList.remove('is-invalid');
        }, 400);
      }
      return ok;
    }

    function mountInlineInput(row, initialValue) {
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'explorer-inline-name';
      input.value = initialValue;
      input.spellcheck = false;
      row.classList.add('is-renaming');
      row.removeAttribute('data-draggable');

      var settled = false;
      var suppressBlurDismiss = false;

      function dismiss() {
        if (settled) return;
        settled = true;
        cancelInlineName();
      }

      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          suppressBlurDismiss = true;
          if (commitInlineName(input.value)) {
            settled = true;
          } else {
            setTimeout(function () { suppressBlurDismiss = false; }, 0);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          dismiss();
        }
      });
      input.addEventListener('click', function (e) { e.stopPropagation(); });
      input.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      input.addEventListener('blur', function () {
        if (settled) return;
        setTimeout(function () {
          if (!settled && !suppressBlurDismiss) dismiss();
        }, 0);
      });

      inlineInputEl = input;
      return input;
    }

    function isEditingFolder(folderPath) {
      return inlineSession && inlineSession.kind === 'folder' && inlineSession.folderPath === folderPath;
    }

    function isEditingFile(fileId) {
      return inlineSession && inlineSession.kind === 'file' && inlineSession.fileId === fileId;
    }

    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        saveTimer = null;
        saveCollapsed(opts.getProjectName ? opts.getProjectName() : 'Untitled Project', collapsed);
        if (global.WorkspaceState && global.WorkspaceState.scheduleSave) {
          global.WorkspaceState.scheduleSave();
        }
      }, 120);
    }

    function toggleFolder(path, expand) {
      if (expand === true) collapsed.delete(path);
      else if (expand === false) collapsed.add(path);
      else if (collapsed.has(path)) collapsed.delete(path);
      else collapsed.add(path);
      scheduleSave();
      refresh();
    }

    function collapseSubtree(folderPath) {
      var files = opts.listFiles ? opts.listFiles() : [];
      var model = buildExplorerModel(files, listEmptyFolders());
      if (!folderPath) {
        collectFolderPaths(model).forEach(function (p) { collapsed.add(p); });
      } else {
        collapsed.add(folderPath);
        collectSubtreeFolderPaths(model, folderPath).forEach(function (p) { collapsed.add(p); });
      }
      scheduleSave();
      refresh();
    }

    function expandSubtree(folderPath) {
      if (!folderPath) {
        collapsed.clear();
      } else {
        collapsed.delete(folderPath);
        var m2 = buildExplorerModel(opts.listFiles ? opts.listFiles() : [], listEmptyFolders());
        collectSubtreeFolderPaths(m2, folderPath).forEach(function (p) { collapsed.delete(p); });
      }
      scheduleSave();
      refresh();
    }

    function indent(depth) {
      return (0.6 + depth * 0.75) + 'rem';
    }

    function visibleRows() {
      return [].slice.call(container.querySelectorAll('.explorer-folder-item, .explorer-file-item'));
    }

    function syncSelectionClasses() {
      var rows = visibleRows();
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var fid = row.getAttribute('data-file-id');
        var fp = row.getAttribute('data-folder-path');
        var sel = fid ? selectedFiles.has(fid) : (fp != null && selectedFolders.has(fp));
        row.classList.toggle('is-selected', sel);
        row.setAttribute('aria-selected', sel ? 'true' : 'false');
      }
    }

    function clearSelection() {
      if (!selectedFiles.size && !selectedFolders.size) return;
      selectedFiles.clear();
      selectedFolders.clear();
      syncSelectionClasses();
    }

    function setSelection(fileIds, folderPaths) {
      selectedFiles = new Set(fileIds || []);
      selectedFolders = new Set(folderPaths || []);
      syncSelectionClasses();
    }

    function getSelection() {
      return {
        fileIds: Array.from(selectedFiles),
        folderPaths: Array.from(selectedFolders),
      };
    }

    function pruneSelection(files) {
      var fileIdSet = {};
      for (var i = 0; i < files.length; i++) fileIdSet[files[i].id] = true;
      selectedFiles.forEach(function (id) {
        if (!fileIdSet[id]) selectedFiles.delete(id);
      });
      var model = buildExplorerModel(files, listEmptyFolders());
      var allPaths = collectFolderPaths(model);
      var pathSet = {};
      for (var j = 0; j < allPaths.length; j++) pathSet[allPaths[j]] = true;
      selectedFolders.forEach(function (p) {
        if (!pathSet[p]) selectedFolders.delete(p);
      });
    }

    function expandForRowKey(key) {
      if (!key) return;
      var files = opts.listFiles ? opts.listFiles() : [];
      if (key.kind === 'file') {
        for (var i = 0; i < files.length; i++) {
          if (files[i].id === key.key) {
            expandParentChain(parentDirFromName(files[i].name));
            return;
          }
        }
      } else {
        var parts = key.key.split('/');
        var acc = '';
        for (var j = 0; j < parts.length; j++) {
          acc = acc ? acc + '/' + parts[j] : parts[j];
          collapsed.delete(acc);
        }
      }
    }

    function applyShiftSelect(anchorKey, endKey) {
      var range = rangeSelectVisibleRows(visibleRows(), anchorKey, endKey);
      selectedFiles = range.fileIds;
      selectedFolders = range.folderPaths;
      syncSelectionClasses();
    }

    function rowInSelection(rowKey) {
      if (!rowKey) return false;
      if (rowKey.kind === 'file') return selectedFiles.has(rowKey.key);
      return selectedFolders.has(rowKey.key);
    }

    function getSelectionDragEls(fileIds, folderPaths, sourceRow) {
      var idSet = {};
      for (var i = 0; i < fileIds.length; i++) idSet[fileIds[i]] = true;
      var pathSet = {};
      for (var j = 0; j < folderPaths.length; j++) pathSet[folderPaths[j]] = true;
      var out = [];
      var rows = visibleRows();
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var fid = row.getAttribute('data-file-id');
        var fp = row.getAttribute('data-folder-path');
        if (fid && idSet[fid]) out.push(row);
        else if (fp && pathSet[fp]) out.push(row);
      }
      return out.length ? out : (sourceRow ? [sourceRow] : []);
    }

    function singleRowDragPayload(row) {
      if (row.hasAttribute('data-file-id')) {
        var fid = row.getAttribute('data-file-id');
        var label = row.querySelector('.explorer-file-item-label');
        return { kind: 'file', fileId: fid, label: label ? label.textContent : '' };
      }
      if (row.hasAttribute('data-folder-path')) {
        var fp = row.getAttribute('data-folder-path');
        var lbl = row.querySelector('.explorer-folder-label');
        return { kind: 'folder', folderPath: fp, label: lbl ? lbl.textContent : fp };
      }
      return null;
    }

    function buildDragPayload(row) {
      var rowKey = rowKeyFromEl(row);
      var fileIds = Array.from(selectedFiles);
      var folderPaths = Array.from(selectedFolders);
      var inSelection = rowInSelection(rowKey);
      var selCount = fileIds.length + folderPaths.length;
      var existingFiles = opts.listFiles ? opts.listFiles() : [];

      if (inSelection && selCount >= 2) {
        var cap = selectionDragCapability(fileIds, folderPaths, existingFiles, listEmptyFolders());
        if (cap.ok) {
          var rf = cap.fileIds;
          var rfp = cap.folderPaths;
          var dragEls = getSelectionDragEls(fileIds, folderPaths, row);
          if (rf.length === 1 && rfp.length === 0) {
            var row0 = dragEls[0] || row;
            var lbl0 = row0.querySelector('.explorer-file-item-label');
            return {
              kind: 'file',
              fileId: rf[0],
              label: lbl0 ? lbl0.textContent : '',
              dragEls: dragEls,
            };
          }
          if (rf.length === 0 && rfp.length === 1) {
            var row1 = dragEls[0] || row;
            var lbl1 = row1.querySelector('.explorer-folder-label');
            return {
              kind: 'folder',
              folderPath: rfp[0],
              label: lbl1 ? lbl1.textContent : rfp[0],
              dragEls: dragEls,
            };
          }
          return {
            kind: 'selection',
            fileIds: rf,
            folderPaths: rfp,
            label: selCount + ' items',
            dragEls: dragEls,
          };
        }
        return {
          dragBlocked: true,
          label: selCount + ' items',
          dragEls: getSelectionDragEls(fileIds, folderPaths, row),
        };
      }

      var single = singleRowDragPayload(row);
      if (single) single.dragEls = [row];
      return single;
    }

    function handleRowClick(e, row) {
      if (inlineSession) return;
      var key = rowKeyFromEl(row);
      if (!key) return;
      var isCtrl = e.ctrlKey || e.metaKey;
      var isShift = e.shiftKey;

      if (isShift) {
        e.preventDefault();
        e.stopPropagation();
        var activeId = opts.getActiveId ? opts.getActiveId() : null;
        var anchorKey = activeId ? { kind: 'file', key: activeId } : key;
        var beforeSize = collapsed.size;
        expandForRowKey(anchorKey);
        expandForRowKey(key);
        if (collapsed.size !== beforeSize) {
          pendingShiftSelect = {
            anchorKey: anchorKey,
            endKey: key,
          };
          scheduleSave();
          refresh();
          return;
        }
        applyShiftSelect(anchorKey, key);
        return;
      }

      if (isCtrl) {
        e.preventDefault();
        e.stopPropagation();
        var activeId2 = opts.getActiveId ? opts.getActiveId() : null;
        var toggled = toggleCtrlSelection(selectedFiles, selectedFolders, key, activeId2);
        selectedFiles = toggled.fileIds;
        selectedFolders = toggled.folderPaths;
        syncSelectionClasses();
        return;
      }

      clearSelection();
      if (key.kind === 'file') {
        if (typeof opts.onOpenFile === 'function') opts.onOpenFile(key.key);
      } else {
        toggleFolder(key.key);
      }
    }

    function focusRow(row) {
      if (!row) return;
      focusedRow = row;
      row.focus();
    }

    function onTreeKeydown(e) {
      if (inlineSession) return;
      var row = e.target.closest('.explorer-folder-item, .explorer-file-item');
      if (!row || !container.contains(row)) return;
      var rows = visibleRows();
      var idx = rows.indexOf(row);
      if (idx === -1) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx < rows.length - 1) focusRow(rows[idx + 1]);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) focusRow(rows[idx - 1]);
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (rows.length) focusRow(rows[0]);
      } else if (e.key === 'End') {
        e.preventDefault();
        if (rows.length) focusRow(rows[rows.length - 1]);
      } else if (e.key === 'ArrowRight') {
        var fp = row.getAttribute('data-folder-path');
        if (fp && collapsed.has(fp)) {
          e.preventDefault();
          toggleFolder(fp, true);
        }
      } else if (e.key === 'ArrowLeft') {
        var fp2 = row.getAttribute('data-folder-path');
        if (fp2 && !collapsed.has(fp2)) {
          e.preventDefault();
          toggleFolder(fp2, false);
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        row.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clearSelection();
      }
    }

    function endsWithSeparator(items) {
      return items.length && items[items.length - 1].type === 'separator';
    }

    function withLeadingItems(extra, base) {
      if (extra && extra.length) {
        return endsWithSeparator(extra)
          ? extra.concat(base)
          : extra.concat([{ type: 'separator' }], base);
      }
      return base;
    }

    function folderContextItems(folderPath) {
      var extra = typeof opts.getFolderContextItems === 'function'
        ? opts.getFolderContextItems(folderPath) : null;
      return extra && extra.length ? extra : [];
    }

    function treeBackgroundItems() {
      var base = [
        { label: 'Expand all', onSelect: function () { expandSubtree(''); } },
        { label: 'Collapse all', onSelect: function () { collapseSubtree(''); } },
      ];
      var extra = typeof opts.getBackgroundContextItems === 'function'
        ? opts.getBackgroundContextItems() : null;
      return withLeadingItems(extra, base);
    }

    function renderNode(treeEl, node, depth, zonePath) {
      zonePath = zonePath || '';
      node.folders.forEach(function (folder, name) {
        var isCollapsed = collapsed.has(folder.path);
        var editing = isEditingFolder(folder.path);
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'explorer-folder-item'
          + (isCollapsed ? ' is-collapsed' : '')
          + (editing ? ' is-renaming' : '')
          + (selectedFolders.has(folder.path) ? ' is-selected' : '');
        row.style.paddingLeft = indent(depth);
        row.setAttribute('role', 'treeitem');
        row.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        row.setAttribute('aria-selected', selectedFolders.has(folder.path) ? 'true' : 'false');
        row.setAttribute('data-folder-path', folder.path);
        row.setAttribute('data-tree-depth', String(depth));
        row.setAttribute('data-drop-zone', folder.path);
        if (!editing) row.setAttribute('data-draggable', 'folder');

        var chevron = document.createElement('span');
        chevron.className = 'explorer-folder-chevron';
        chevron.innerHTML = EXPLORER_CHEVRON_SVG;
        if (!editing) {
          chevron.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleFolder(folder.path);
          });
        }

        row.appendChild(chevron);
        if (editing) {
          var folderInput = mountInlineInput(row, inlineSession.displayName || name);
          row.appendChild(folderInput);
        } else {
          var label = document.createElement('span');
          label.className = 'explorer-folder-label';
          label.textContent = name;
          label.addEventListener('click', function (e) {
            e.stopPropagation();
            handleRowClick(e, row);
          });
          row.appendChild(label);
          row.addEventListener('click', function (e) { handleRowClick(e, row); });
        }
        treeEl.appendChild(row);
        if (!isCollapsed) renderNode(treeEl, folder, depth + 1, folder.path);
      });

      var suiteByFile = node.suiteByFile || {};

      for (var i = 0; i < node.files.length; i++) {
        var file = node.files[i];
        var editingFile = isEditingFile(file.id);
        var btn = document.createElement('button');
        btn.type = 'button';
        var low = file.name.toLowerCase();
        var isCfg = low.endsWith('.cfg');
        var isElf = low.endsWith('.elf');
        var activeId = opts.getActiveId ? opts.getActiveId() : null;
        var suiteMeta = suiteByFile[file.name];
        btn.className = 'explorer-file-item'
          + (file.id === activeId ? ' is-active' : '')
          + (selectedFiles.has(file.id) ? ' is-selected' : '')
          + (isCfg ? ' explorer-file-item--cfg' : '')
          + (isElf ? ' explorer-file-item--elf' : '')
          + (suiteMeta && (suiteMeta.role === 'head' || suiteMeta.role === 'solo')
            ? ' explorer-file-item--suite-cfg' : '')
          + (suiteMeta && (suiteMeta.role === 'mid' || suiteMeta.role === 'tail')
            ? ' explorer-file-item--suite' : '')
          + (suiteMeta && suiteMeta.suiteIndex > 0 && suiteMeta.role === 'head' ? ' explorer-suite-block-sep' : '')
          + (editingFile ? ' is-renaming' : '');
        btn.style.paddingLeft = indent(depth);
        btn.setAttribute('role', 'treeitem');
        btn.setAttribute('aria-selected', selectedFiles.has(file.id) ? 'true' : 'false');
        btn.setAttribute('data-file-id', file.id);
        btn.setAttribute('data-file-name', file.name);
        btn.setAttribute('data-tree-depth', String(depth));
        if (zonePath) btn.setAttribute('data-drop-zone', zonePath);
        if (!editingFile) btn.setAttribute('data-draggable', 'file');
        btn.setAttribute('aria-label', file.baseName);

        if (editingFile) {
          var fileInput = mountInlineInput(btn, inlineSession.displayName || file.baseName);
          btn.appendChild(fileInput);
        } else {
          var fileLabel = document.createElement('span');
          fileLabel.className = 'explorer-file-item-label';
          var nameSpan = document.createElement('span');
          nameSpan.className = 'explorer-file-item-name';
          nameSpan.textContent = file.baseName;
          fileLabel.appendChild(nameSpan);
          if (typeof Tooltips !== 'undefined') Tooltips.bindOverflow(nameSpan, function () { return file.baseName; });
          btn.appendChild(fileLabel);

          var diag = opts.getFileDiag ? opts.getFileDiag(file.id, file.name) : null;
          if (diag) {
            btn.classList.add('has-diag', 'has-diag--' + diag);
            var diagDot = document.createElement('span');
            diagDot.className = 'explorer-file-diag explorer-file-diag--' + diag;
            diagDot.setAttribute('aria-hidden', 'true');
            applyFileDiagTip(diagDot, file.id, file.name, diag);
            btn.appendChild(diagDot);
          }

          btn.addEventListener('click', function (fileRow) {
            return function (ev) { handleRowClick(ev, fileRow); };
          }(btn));
        }
        treeEl.appendChild(btn);
      }
    }

    function refresh() {
      if (!opts.listFiles) return;
      var files = opts.listFiles();
      pruneSelection(files);
      var prevFocus = !inlineSession && focusedRow
        && (focusedRow.getAttribute('data-file-id') || focusedRow.getAttribute('data-folder-path'));
      var shiftPending = pendingShiftSelect;
      container.innerHTML = '';

      var model = buildExplorerModel(files, listEmptyFolders(), opts.getSuiteLayoutForDir || null);
      var isEmpty = model.files.length === 0 && model.folders.size === 0;
      container.classList.toggle('is-project-empty', isEmpty);
      if (isEmpty) {
        var emptyNote = document.createElement('p');
        emptyNote.className = 'explorer-empty';
        emptyNote.textContent = 'Project empty';
        container.appendChild(emptyNote);
      } else {
        renderNode(container, model, 0, '');
      }

      var rootPad = document.createElement('div');
      rootPad.className = 'explorer-tree-root-pad';
      rootPad.setAttribute('aria-hidden', 'true');
      container.appendChild(rootPad);

      if (typeof opts.onRefresh === 'function') opts.onRefresh();

      if (inlineInputEl) {
        inlineInputEl.focus();
        inlineInputEl.select();
      } else if (prevFocus) {
        var sel = prevFocus.indexOf('/') !== -1 || !prevFocus.includes('.')
          ? '[data-folder-path="' + prevFocus + '"]'
          : '[data-file-id="' + prevFocus + '"]';
        var row = container.querySelector(sel);
        if (row) focusRow(row);
      }

      if (shiftPending) {
        pendingShiftSelect = null;
        applyShiftSelect(shiftPending.anchorKey, shiftPending.endKey);
      }
    }

    container.setAttribute('role', 'tree');
    container.tabIndex = -1;
    container.addEventListener('keydown', onTreeKeydown);
    function onBackgroundClick(e) {
      if (e.target.closest('.explorer-folder-item, .explorer-file-item')) return;
      clearSelection();
    }
    container.addEventListener('click', onBackgroundClick);

    if (typeof global.Menu !== 'undefined') {
      global.Menu.bindContextMenu(container, function (e) {
        var fileEl = e.target.closest('[data-file-id]');
        var folderEl = e.target.closest('[data-folder-path]');
        var hasSelection = selectedFiles.size + selectedFolders.size > 0;
        if (hasSelection && typeof opts.getSelectionContextItems === 'function') {
          var selItems = opts.getSelectionContextItems(getSelection());
          if (selItems && selItems.length) return selItems;
        }
        if (fileEl && typeof opts.getFileContextItems === 'function') {
          return opts.getFileContextItems(fileEl.getAttribute('data-file-id'));
        }
        if (folderEl) return folderContextItems(folderEl.getAttribute('data-folder-path'));
        return treeBackgroundItems();
      });
    }

    function zoneHighlightEls(zonePath) {
      var rows = container.querySelectorAll('.explorer-folder-item, .explorer-file-item');
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('data-drop-zone') === zonePath) out.push(rows[i]);
      }
      return out;
    }

    function resolveDrop(clientX, clientY) {
      var rect = container.getBoundingClientRect();
      if (clientY < rect.top || clientY > rect.bottom
        || clientX < rect.left || clientX > rect.right) return null;

      var row = null;
      if (typeof document.elementsFromPoint === 'function') {
        var stack = document.elementsFromPoint(clientX, clientY);
        for (var si = 0; si < stack.length; si++) {
          var candidate = stack[si].closest
            && stack[si].closest('.explorer-folder-item, .explorer-file-item');
          if (candidate && container.contains(candidate)
            && !candidate.classList.contains('is-dragging')) {
            row = candidate;
            break;
          }
        }
      } else {
        var hit = document.elementFromPoint(clientX, clientY);
        row = hit && hit.closest('.explorer-folder-item, .explorer-file-item');
        if (row && row.classList.contains('is-dragging')) row = null;
      }
      if (row && container.contains(row)) {
        var zonePath = row.getAttribute('data-drop-zone');
        if (zonePath) {
          return {
            target: { kind: 'folder', folderPath: zonePath },
            highlightEls: zoneHighlightEls(zonePath),
          };
        }
      }

      var boundary = computeRootZoneBoundary(container);
      if (clientY >= boundary.rootTop) {
        var els = [];
        if (boundary.pad) els.push(boundary.pad);
        if (boundary.tailRow) els.unshift(boundary.tailRow);
        return { target: { kind: 'root' }, highlightEls: els };
      }
      return null;
    }

    if (typeof global.TreeDnD !== 'undefined' && typeof opts.onDrop === 'function') {
      dndDetach = global.TreeDnD.attach(container, {
        getDragPayload: buildDragPayload,
        resolveDrop: resolveDrop,
        canDrop: opts.canDrop,
        onDrop: function (payload, target) {
          opts.onDrop(payload, target);
          clearSelection();
        },
        onAutoExpand: function (folderPath) {
          if (collapsed.has(folderPath)) toggleFolder(folderPath, true);
        },
      });
    }

    // Update error/warning dots in place without a full re-render (which would
    // disrupt focus/selection). Called when lint state changes.
    function applyFileDiagTip(el, fileId, fileName, diag) {
      if (!el || !diag) return;
      if (typeof opts.bindFileDiagTip === 'function') {
        opts.bindFileDiagTip(el, fileId, fileName, diag);
      } else if (typeof opts.applyTip === 'function') {
        opts.applyTip(el, diag === 'error' ? 'Has errors' : 'Has warnings');
      }
    }

    function clearFileDiagTip(el) {
      if (!el) return;
      el.removeAttribute('data-tooltip-errors');
      el.removeAttribute('data-tooltip-head');
      el.removeAttribute('data-tooltip');
    }

    // Update one row's diag dot in place (no re-render). `diag` is 'error',
    // 'warning', or falsy.
    function applyRowDiag(row, fid, fname, diag) {
      var dot = row.querySelector('.explorer-file-diag');
      row.classList.toggle('has-diag', !!diag);
      row.classList.toggle('has-diag--error', diag === 'error');
      row.classList.toggle('has-diag--warning', diag === 'warning');
      if (!diag) {
        if (dot) {
          clearFileDiagTip(dot);
          dot.remove();
        }
        return;
      }
      if (!dot) {
        dot = document.createElement('span');
        dot.setAttribute('aria-hidden', 'true');
        row.appendChild(dot);
      }
      dot.className = 'explorer-file-diag explorer-file-diag--' + diag;
      applyFileDiagTip(dot, fid, fname, diag);
    }

    function refreshDiags() {
      if (!opts.getFileDiag) return;
      var rows = container.querySelectorAll('.explorer-file-item[data-file-id]');
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.classList.contains('is-renaming')) continue;
        var fid = row.getAttribute('data-file-id');
        var fname = row.getAttribute('data-file-name');
        applyRowDiag(row, fid, fname, opts.getFileDiag(fid, fname));
      }
    }

    // Set a SINGLE file's diag dot directly (e.g. the active file's live error
    // state from a lint event) without recomputing the whole development. `diag`
    // is 'error' | 'warning' | null.
    function setFileDiag(fileId, diag) {
      if (!fileId) return;
      var row = container.querySelector('.explorer-file-item[data-file-id="' + (window.CSS && CSS.escape ? CSS.escape(fileId) : fileId) + '"]');
      if (!row || row.classList.contains('is-renaming')) return;
      applyRowDiag(row, fileId, row.getAttribute('data-file-name'), diag);
    }

    function refreshActiveAndDiags() {
      var activeId = opts.getActiveId ? opts.getActiveId() : null;
      var rows = container.querySelectorAll('.explorer-file-item[data-file-id]');
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        row.classList.toggle('is-active', row.getAttribute('data-file-id') === activeId);
      }
      refreshDiags();
    }

    return {
      refresh: refresh,
      refreshDiags: refreshDiags,
      setFileDiag: setFileDiag,
      refreshActiveAndDiags: refreshActiveAndDiags,
      toggleFolder: toggleFolder,
      collapseSubtree: collapseSubtree,
      expandSubtree: expandSubtree,
      beginInlineName: beginInlineName,
      cancelInlineName: cancelInlineName,
      getInlineSession: function () { return inlineSession; },
      getCollapsed: function () { return collapsed; },
      getSelection: getSelection,
      clearSelection: clearSelection,
      setSelection: setSelection,
      shouldKeepSelectionOnOpen: function () { return suppressClearSelection; },
      collectWorkspaceExplorer: function (out) {
        if (!out.sidebar) return;
        out.sidebar.explorer = {
          revealActiveFile: true,
          scrollActiveIntoView: true,
        };
      },
      restoreWorkspaceExplorer: function (sidebar) {
        if (!sidebar || !sidebar.explorer || !sidebar.explorer.revealActiveFile) return;
        var activeId = opts.getActiveId ? opts.getActiveId() : null;
        if (!activeId) return;
        var files = opts.listFiles ? opts.listFiles() : [];
        var file = null;
        for (var fi = 0; fi < files.length; fi++) {
          if (files[fi].id === activeId) { file = files[fi]; break; }
        }
        if (!file) return;
        var parent = parentDirFromName(file.name);
        if (parent) {
          expandParentChain(parent);
          scheduleSave();
        }
        refresh();
        if (sidebar.explorer.scrollActiveIntoView) {
          requestAnimationFrame(function () {
            var row = container.querySelector('.explorer-file-item[data-file-id="' + activeId + '"]');
            if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
          });
        }
      },
      reloadFoldState: function () {
        collapsed = loadCollapsed(opts.getProjectName ? opts.getProjectName() : 'Untitled Project');
      },
      destroy: function () {
        if (dndDetach) dndDetach();
        container.removeEventListener('keydown', onTreeKeydown);
        container.removeEventListener('click', onBackgroundClick);
      },
    };
  }

  global.Explorer = {
    buildExplorerModel: buildExplorerModel,
    collectFolderPaths: collectFolderPaths,
    collectSubtreeFolderPaths: collectSubtreeFolderPaths,
    rootZoneTopFromLastRow: rootZoneTopFromLastRow,
    resolveCreateParentFromRow: resolveCreateParentFromRow,
    resolveCreateParentDir: resolveCreateParentDir,
    parentDirFromName: parentDirFromName,
    rowKeyFromEl: rowKeyFromEl,
    rangeSelectVisibleRows: rangeSelectVisibleRows,
    toggleCtrlSelection: toggleCtrlSelection,
    selectionDragCapability: selectionDragCapability,
    sameParentFileIdsForDrag: sameParentFileIdsForDrag,
    init: init,
  };
  global.BelJarExplorer = global.Explorer;
