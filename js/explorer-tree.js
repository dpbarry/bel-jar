// Project file explorer: nested tree, persisted fold state, context menus, DnD hooks.
(function (global) {
  'use strict';

  var NC = function () { return global.BelJarNameConflicts; };

  var EXPLORER_CHEVRON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

  var EXPLORER_DEFAULT_CFG_STAR_SVG =
    '<svg class="explorer-default-cfg-star" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';

  function explorerFileBucket(name) {
    var low = String(name).toLowerCase();
    if (low.endsWith('.cfg')) return 0;
    if (low.endsWith('.bel')) return 1;
    return 2;
  }

  function sortExplorerFiles(files) {
    var cfg = [];
    var bel = [];
    var other = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var bucket = explorerFileBucket(f.name);
      if (bucket === 0) cfg.push(f);
      else if (bucket === 1) bel.push(f);
      else other.push(f);
    }
    var byName = function (a, b) { return a.baseName.localeCompare(b.baseName); };
    cfg.sort(byName);
    bel.sort(byName);
    other.sort(byName);
    return cfg.concat(bel, other);
  }

  function sortExplorerNode(node) {
    node.files = sortExplorerFiles(node.files);
    node.folders.forEach(function (folder) { sortExplorerNode(folder); });
  }

  function buildExplorerModel(files) {
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
    sortExplorerNode(root);
    return root;
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
    var P = global.BelJarPersist;
    if (!P) return new Set();
    return new Set(P.getExplorerFold(projectName));
  }

  function saveCollapsed(projectName, collapsed) {
    var P = global.BelJarPersist;
    if (!P) return;
    P.setExplorerFold(projectName, [].slice.call(collapsed));
  }

  function init(opts) {
    opts = opts || {};
    var container = opts.container;
    if (!container) return null;

    var collapsed = loadCollapsed(opts.getProjectName ? opts.getProjectName() : 'Untitled');
    var saveTimer = null;
    var dndDetach = null;
    var focusedRow = null;

    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        saveTimer = null;
        saveCollapsed(opts.getProjectName ? opts.getProjectName() : 'Untitled', collapsed);
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
      var model = buildExplorerModel(files);
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
        var m2 = buildExplorerModel(opts.listFiles ? opts.listFiles() : []);
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

    function focusRow(row) {
      if (!row) return;
      focusedRow = row;
      row.focus();
    }

    function onTreeKeydown(e) {
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
      }
    }

    function folderContextItems(folderPath) {
      var isCollapsed = collapsed.has(folderPath);
      return [
        {
          label: isCollapsed ? 'Expand' : 'Collapse',
          onSelect: function () { toggleFolder(folderPath); },
        },
        { type: 'separator' },
        {
          label: 'Expand all inside',
          onSelect: function () { expandSubtree(folderPath); },
        },
        {
          label: 'Collapse all inside',
          onSelect: function () { collapseSubtree(folderPath); },
        },
      ];
    }

    function treeBackgroundItems() {
      return [
        { label: 'Expand all', onSelect: function () { expandSubtree(''); } },
        { label: 'Collapse all', onSelect: function () { collapseSubtree(''); } },
      ];
    }

    function renderNode(treeEl, node, depth, zonePath) {
      zonePath = zonePath || '';
      node.folders.forEach(function (folder, name) {
        var isCollapsed = collapsed.has(folder.path);
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'explorer-folder-item' + (isCollapsed ? ' is-collapsed' : '');
        row.style.paddingLeft = indent(depth);
        row.setAttribute('role', 'treeitem');
        row.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        row.setAttribute('data-folder-path', folder.path);
        row.setAttribute('data-tree-depth', String(depth));
        row.setAttribute('data-drop-zone', folder.path);
        row.setAttribute('data-draggable', 'folder');

        var chevron = document.createElement('span');
        chevron.className = 'explorer-folder-chevron';
        chevron.innerHTML = EXPLORER_CHEVRON_SVG;
        chevron.addEventListener('click', function (e) {
          e.stopPropagation();
          toggleFolder(folder.path);
        });

        var label = document.createElement('span');
        label.className = 'explorer-folder-label';
        label.textContent = name;
        label.addEventListener('click', function (e) {
          e.stopPropagation();
          toggleFolder(folder.path);
        });

        row.appendChild(chevron);
        row.appendChild(label);
        row.addEventListener('click', function () { toggleFolder(folder.path); });
        treeEl.appendChild(row);
        if (!isCollapsed) renderNode(treeEl, folder, depth + 1, folder.path);
      });

      for (var i = 0; i < node.files.length; i++) {
        var file = node.files[i];
        var btn = document.createElement('button');
        btn.type = 'button';
        var low = file.name.toLowerCase();
        var isCfg = low.endsWith('.cfg');
        var isElf = low.endsWith('.elf');
        var isBel = low.endsWith('.bel');
        var activeId = opts.getActiveId ? opts.getActiveId() : null;
        var defaultCfg = opts.getDefaultCfgPath ? opts.getDefaultCfgPath() : null;
        btn.className = 'explorer-file-item'
          + (file.id === activeId ? ' is-active' : '')
          + (isBel ? ' explorer-file-item--bel' : '')
          + (isCfg ? ' explorer-file-item--cfg' : '')
          + (isElf ? ' explorer-file-item--elf' : '');
        btn.style.paddingLeft = indent(depth);
        btn.setAttribute('role', 'treeitem');
        btn.setAttribute('data-file-id', file.id);
        btn.setAttribute('data-tree-depth', String(depth));
        if (zonePath) btn.setAttribute('data-drop-zone', zonePath);
        btn.setAttribute('data-draggable', 'file');
        btn.setAttribute('aria-label', file.baseName);

        if (typeof opts.getRowTip === 'function' && typeof opts.applyTip === 'function') {
          var tip = opts.getRowTip(file.baseName, file.name, isElf ? 'elf' : '');
          opts.applyTip(btn, tip);
        }

        var fileLabel = document.createElement('span');
        fileLabel.className = 'explorer-file-item-label';
        fileLabel.textContent = file.baseName;
        btn.appendChild(fileLabel);

        if (isCfg && file.name === defaultCfg) {
          var starMark = document.createElement('span');
          starMark.className = 'explorer-default-cfg-mark';
          starMark.setAttribute('aria-label', 'Active');
          starMark.innerHTML = EXPLORER_DEFAULT_CFG_STAR_SVG;
          if (typeof opts.applyTip === 'function') opts.applyTip(starMark, 'Active');
          btn.appendChild(starMark);
        }

        btn.addEventListener('click', function (id) {
          return function () {
            if (typeof opts.onOpenFile === 'function') opts.onOpenFile(id);
          };
        }(file.id));
        treeEl.appendChild(btn);
      }
    }

    function refresh() {
      if (!opts.listFiles) return;
      var files = opts.listFiles();
      var prevFocus = focusedRow
        && (focusedRow.getAttribute('data-file-id') || focusedRow.getAttribute('data-folder-path'));
      container.innerHTML = '';

      var model = buildExplorerModel(files);
      renderNode(container, model, 0, '');

      var rootPad = document.createElement('div');
      rootPad.className = 'explorer-tree-root-pad';
      rootPad.setAttribute('aria-hidden', 'true');
      container.appendChild(rootPad);

      if (typeof opts.onRefresh === 'function') opts.onRefresh();

      if (prevFocus) {
        var sel = prevFocus.indexOf('/') !== -1 || !prevFocus.includes('.')
          ? '[data-folder-path="' + prevFocus + '"]'
          : '[data-file-id="' + prevFocus + '"]';
        var row = container.querySelector(sel);
        if (row) focusRow(row);
      }
    }

    container.setAttribute('role', 'tree');
    container.tabIndex = -1;
    container.addEventListener('keydown', onTreeKeydown);

    if (typeof global.Menu !== 'undefined') {
      global.Menu.bindContextMenu(container, function (e) {
        var fileEl = e.target.closest('[data-file-id]');
        if (fileEl && typeof opts.getFileContextItems === 'function') {
          return opts.getFileContextItems(fileEl.getAttribute('data-file-id'));
        }
        var folderEl = e.target.closest('[data-folder-path]');
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

      var hit = document.elementFromPoint(clientX, clientY);
      var row = hit && hit.closest('.explorer-folder-item, .explorer-file-item');
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

    if (typeof global.BelJarTreeDnD !== 'undefined' && typeof opts.onDrop === 'function') {
      dndDetach = global.BelJarTreeDnD.attach(container, {
        getDragPayload: function (row) {
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
        },
        resolveDrop: resolveDrop,
        canDrop: opts.canDrop,
        onDrop: opts.onDrop,
        onAutoExpand: function (folderPath) {
          if (collapsed.has(folderPath)) toggleFolder(folderPath, true);
        },
      });
    }

    return {
      refresh: refresh,
      toggleFolder: toggleFolder,
      collapseSubtree: collapseSubtree,
      expandSubtree: expandSubtree,
      getCollapsed: function () { return collapsed; },
      reloadFoldState: function () {
        collapsed = loadCollapsed(opts.getProjectName ? opts.getProjectName() : 'Untitled');
      },
      destroy: function () {
        if (dndDetach) dndDetach();
        container.removeEventListener('keydown', onTreeKeydown);
      },
    };
  }

  global.BelJarExplorer = {
    buildExplorerModel: buildExplorerModel,
    collectFolderPaths: collectFolderPaths,
    collectSubtreeFolderPaths: collectSubtreeFolderPaths,
    rootZoneTopFromLastRow: rootZoneTopFromLastRow,
    init: init,
  };
})(typeof window !== 'undefined' ? window : globalThis);
