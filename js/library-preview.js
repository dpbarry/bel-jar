(function (global) {
  'use strict';

  var CHEVRON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var ICON_INSERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';

  var activeDialog = null;

  function actionBtn(applyTip, className, label, svg, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'library-action-btn' + (className ? ' ' + className : '');
    btn.innerHTML = svg;
    btn.setAttribute('aria-label', label);
    applyTip(btn, label);
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      onClick(btn);
    });
    return btn;
  }

  function firstFileInFolder(folder) {
    if (!folder || !folder.children) return null;
    for (var i = 0; i < folder.children.length; i++) {
      var child = folder.children[i];
      if (child.type === 'file') return child;
      if (child.type === 'folder') {
        var found = firstFileInFolder(child);
        if (found) return found;
      }
    }
    return null;
  }

  function folderContainsFolder(root, target) {
    if (!root || !target || root === target) return true;
    if (!root.children) return false;
    for (var i = 0; i < root.children.length; i++) {
      var child = root.children[i];
      if (child.type === 'folder' && folderContainsFolder(child, target)) return true;
    }
    return false;
  }

  function ancestorFolderIds(scopeFolder, targetFolder) {
    if (!scopeFolder || !targetFolder || scopeFolder === targetFolder) return [];
    function walk(folder, trail) {
      if (!folder || !folder.children) return null;
      for (var i = 0; i < folder.children.length; i++) {
        var child = folder.children[i];
        if (child.type !== 'folder') continue;
        var next = trail.concat(child.id);
        if (child === targetFolder) return next;
        var found = walk(child, next);
        if (found) return found;
      }
      return null;
    }
    return walk(scopeFolder, []) || [];
  }

  function renderHighlighted(codeEl, text, ext) {
    codeEl.textContent = '';
    if (ext === 'cfg') {
      codeEl.className = 'library-preview__code-source library-preview__code-source--plain';
      codeEl.textContent = text;
      return;
    }
    codeEl.className = 'library-preview__code-source bel-hl-source'
      + (ext === 'elf' ? ' bel-hl-source--elf' : '');
    if (global.BelJarEditor && typeof global.BelJarEditor.renderSourceInto === 'function') {
      global.BelJarEditor.renderSourceInto(codeEl, text, ext);
      return;
    }
    codeEl.textContent = text;
  }

  function updateGutter(gutterEl, text) {
    var lines = String(text || '').split('\n');
    gutterEl.textContent = lines.map(function (_, i) { return String(i + 1); }).join('\n');
  }

  function open(opts) {
    opts = opts || {};
    if (!opts.scopeFolder || typeof global.BelJarDialog === 'undefined') return;

    if (activeDialog && activeDialog.open) {
      global.BelJarDialog.requestDialogClose(activeDialog);
      activeDialog = null;
    }

    var scopeFolder = opts.scopeFolder;
    var scopeLabel = opts.scopeLabel || scopeFolder.name || 'Library';
    var fetchContent = opts.fetchContent;
    var applyTip = typeof opts.applyTip === 'function' ? opts.applyTip : function () {};
    var onCopyFile = typeof opts.onCopyFile === 'function' ? opts.onCopyFile : null;
    var onInsertFile = typeof opts.onInsertFile === 'function' ? opts.onInsertFile : null;
    var onInsertFolder = typeof opts.onInsertFolder === 'function' ? opts.onInsertFolder : null;

    var expanded = new Set();
    var fileIndex = Object.create(null);
    var searchFiles = [];
    var searchToken = 0;
    var LS = global.BelJarLibrarySearch;
    var treeRows = [];
    var selectedId = null;
    var loadToken = 0;

    if (opts.focusFolder && folderContainsFolder(scopeFolder, opts.focusFolder)) {
      ancestorFolderIds(scopeFolder, opts.focusFolder).forEach(function (id) { expanded.add(id); });
      if (opts.focusFolder.id) expanded.add(opts.focusFolder.id);
    } else {
      expanded.add(scopeFolder.id);
    }

    function indexFolder(folder, pathLabel) {
      if (!folder || !folder.children) return;
      for (var i = 0; i < folder.children.length; i++) {
        var child = folder.children[i];
        if (child.type === 'file') {
          fileIndex[child.id] = { item: child, pathLabel: pathLabel };
        } else if (child.type === 'folder') {
          indexFolder(child, pathLabel ? pathLabel + '/' + child.name : child.name);
        }
      }
    }
    indexFolder(scopeFolder, '');
    searchFiles = Object.keys(fileIndex).map(function (id) {
      var ent = fileIndex[id];
      return {
        item: ent.item,
        id: ent.item.id,
        label: ent.item.label,
        path: ent.item.path,
        ext: ent.item.ext || 'bel',
        pathLabel: ent.pathLabel,
        hay: LS ? LS.metadataHay({
          label: ent.item.label,
          description: ent.item.description,
          path: ent.item.path,
          pathLabel: ent.pathLabel,
        }) : '',
      };
    });
    searchFiles.sort(function (a, b) { return a.item.label.localeCompare(b.item.label); });

    var initial = opts.initialFile;
    if (!initial && opts.focusFolder) initial = firstFileInFolder(opts.focusFolder);
    if (!initial) initial = firstFileInFolder(scopeFolder);
    if (initial && initial.id) {
      selectedId = initial.id;
      var parts = (fileIndex[initial.id] && fileIndex[initial.id].pathLabel || '').split('/').filter(Boolean);
      var cur = scopeFolder;
      for (var p = 0; p < parts.length; p++) {
        if (cur && cur.id) expanded.add(cur.id);
        if (!cur || !cur.children) break;
        for (var c = 0; c < cur.children.length; c++) {
          if (cur.children[c].type === 'folder' && cur.children[c].name === parts[p]) {
            cur = cur.children[c];
            expanded.add(cur.id);
            break;
          }
        }
      }
    }

    var shell = document.createElement('div');
    shell.className = 'library-preview';

    var headerMeta = document.createElement('div');
    headerMeta.className = 'library-preview__header-meta';

    var headerLeft = document.createElement('div');
    headerLeft.className = 'library-preview__header-left';
    headerLeft.innerHTML =
      '<span class="library-preview__category"></span>'
      + '<span class="library-preview__sep" aria-hidden="true">·</span>'
      + '<span class="library-preview__file"></span>';
    var categoryEl = headerLeft.querySelector('.library-preview__category');
    var fileEl = headerLeft.querySelector('.library-preview__file');
    categoryEl.textContent = scopeLabel;

    var searchWrap = document.createElement('div');
    searchWrap.className = 'library-find library-find--preview';

    var searchIcon = document.createElement('span');
    searchIcon.className = 'library-find__icon';
    searchIcon.setAttribute('aria-hidden', 'true');
    searchIcon.innerHTML = LS ? LS.SEARCH_ICON : '';

    var searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'library-find__input';
    searchInput.placeholder = 'Search…';
    searchInput.setAttribute('aria-label', 'Search files in preview');
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;

    var searchResults = document.createElement('div');
    searchResults.className = 'library-find__results library-find__results--inline';
    searchResults.hidden = true;
    searchResults.setAttribute('role', 'listbox');

    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(searchInput);
    searchWrap.appendChild(searchResults);
    headerMeta.appendChild(headerLeft);
    headerMeta.appendChild(searchWrap);

    var split = document.createElement('div');
    split.className = 'library-preview__split';

    var treePane = document.createElement('div');
    treePane.className = 'library-preview__tree';
    treePane.setAttribute('role', 'tree');
    treePane.setAttribute('aria-label', scopeLabel + ' files');

    var codePane = document.createElement('div');
    codePane.className = 'library-preview__code';

    var codeEmpty = document.createElement('div');
    codeEmpty.className = 'library-preview__empty';
    codeEmpty.textContent = 'Select a file to preview.';

    var codeLoading = document.createElement('div');
    codeLoading.className = 'library-preview__loading';
    codeLoading.hidden = true;
    codeLoading.innerHTML = '<span class="library-preview__spinner" aria-hidden="true"></span>';

    var codeWrap = document.createElement('div');
    codeWrap.className = 'library-preview__code-wrap';
    codeWrap.hidden = true;

    var gutter = document.createElement('div');
    gutter.className = 'library-preview__gutter';
    gutter.setAttribute('aria-hidden', 'true');

    var codeScroll = document.createElement('div');
    codeScroll.className = 'library-preview__code-scroll';

    var pre = document.createElement('pre');
    pre.className = 'library-preview__pre';
    var codeEl = document.createElement('code');
    pre.appendChild(codeEl);
    codeScroll.appendChild(pre);

    codeWrap.appendChild(gutter);
    codeWrap.appendChild(codeScroll);

    codeScroll.addEventListener('scroll', function () {
      gutter.scrollTop = codeScroll.scrollTop;
    });

    codePane.appendChild(codeEmpty);
    codePane.appendChild(codeLoading);
    codePane.appendChild(codeWrap);

    split.appendChild(treePane);
    split.appendChild(codePane);
    shell.appendChild(headerMeta);
    shell.appendChild(split);

    function setHeaderFile(name) {
      if (name) {
        fileEl.textContent = name;
        fileEl.hidden = false;
        headerLeft.querySelector('.library-preview__sep').hidden = false;
      } else {
        fileEl.textContent = '';
        fileEl.hidden = true;
        headerLeft.querySelector('.library-preview__sep').hidden = true;
      }
    }

    function expandToFile(item) {
      var ent = fileIndex[item.id];
      if (!ent) return;
      var parts = (ent.pathLabel || '').split('/').filter(Boolean);
      expanded.add(scopeFolder.id);
      var cur = scopeFolder;
      for (var p = 0; p < parts.length; p++) {
        if (!cur || !cur.children) break;
        for (var c = 0; c < cur.children.length; c++) {
          if (cur.children[c].type === 'folder' && cur.children[c].name === parts[p]) {
            cur = cur.children[c];
            expanded.add(cur.id);
            break;
          }
        }
      }
    }

    var previewSearchTimer = null;

    function renderSearchResults() {
      if (!LS) return;
      var q = LS.normalizeQuery(searchInput.value);
      searchResults.innerHTML = '';
      if (!q) {
        searchWrap.classList.remove('is-searching');
        searchResults.hidden = true;
        return;
      }
      var token = ++searchToken;
      var metaHits = [];
      for (var i = 0; i < searchFiles.length; i++) {
        var ent = searchFiles[i];
        if (ent.hay.indexOf(q) !== -1) {
          metaHits.push({ entry: ent, metaMatch: true, snippet: null, line: null });
        }
      }
      if (metaHits.length) {
        LS.renderResults(searchResults, metaHits.slice(0, 20), 'inline', onPreviewHit);
        searchResults.hidden = false;
      } else {
        var pending = document.createElement('div');
        pending.className = 'library-find__empty';
        pending.textContent = 'Searching…';
        searchResults.appendChild(pending);
        searchResults.hidden = false;
        searchWrap.classList.add('is-searching');
      }

      LS.searchEntries(searchFiles, q, fetchContent, { limit: 20 }).then(function (hits) {
        if (token !== searchToken) return;
        searchWrap.classList.remove('is-searching');
        searchResults.innerHTML = '';
        if (!hits.length) {
          var empty = document.createElement('div');
          empty.className = 'library-find__empty';
          empty.textContent = 'No matches.';
          searchResults.appendChild(empty);
          searchResults.hidden = false;
          return;
        }
        LS.renderResults(searchResults, hits, 'inline', onPreviewHit);
        searchResults.hidden = false;
      });
    }

    function onPreviewHit(hit) {
      expandToFile(hit.entry.item);
      selectFile(hit.entry.item);
      searchResults.hidden = true;
      searchInput.blur();
    }

    function setSearchFocused(on) {
      searchWrap.classList.toggle('is-focused', on);
      if (!on) searchResults.hidden = true;
      else if (LS && LS.normalizeQuery(searchInput.value)) renderSearchResults();
    }

    searchInput.addEventListener('focus', function () { setSearchFocused(true); });
    searchInput.addEventListener('blur', function () {
      setTimeout(function () {
        if (!searchWrap.contains(document.activeElement)) setSearchFocused(false);
      }, 120);
    });
    searchInput.addEventListener('input', function () {
      if (previewSearchTimer) clearTimeout(previewSearchTimer);
      previewSearchTimer = setTimeout(renderSearchResults, 180);
    });

    function setCodeLoading(on) {
      codeLoading.hidden = !on;
      if (on) {
        codeEmpty.hidden = true;
        codeWrap.hidden = true;
      }
    }

    function showCode(text, item) {
      codeLoading.hidden = true;
      codeEmpty.hidden = true;
      codeWrap.hidden = false;
      renderHighlighted(codeEl, text, item.ext || 'bel');
      updateGutter(gutter, text);
      setHeaderFile(item.label);
    }

    function showEmpty() {
      codeLoading.hidden = true;
      codeWrap.hidden = true;
      codeEmpty.hidden = false;
      codeEmpty.textContent = 'Select a file to preview.';
      setHeaderFile(null);
    }

    function selectFile(item, opts2) {
      opts2 = opts2 || {};
      if (!item || !item.id) return;
      selectedId = item.id;
      renderTree();
      if (!opts2.skipScroll && fileIndex[item.id]) {
        var row = treePane.querySelector('[data-file-id="' + item.id + '"]');
        if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
      }
      if (typeof fetchContent !== 'function') {
        showEmpty();
        return;
      }
      var token = ++loadToken;
      setCodeLoading(true);
      fetchContent(item.path).then(function (text) {
        if (token !== loadToken || selectedId !== item.id) return;
        showCode(text, item);
      }).catch(function () {
        if (token !== loadToken) return;
        setCodeLoading(false);
        codeEmpty.hidden = false;
        codeEmpty.textContent = 'Could not load file.';
        codeWrap.hidden = true;
        setHeaderFile(item.label);
      });
    }

    function renderTreeFolder(folder, depth, pathLabel) {
      if (!folder || folder.type !== 'folder') return;
      var hasNamedRoot = !!scopeFolder.name;
      var displayRoot = folder === scopeFolder && hasNamedRoot;

      if (displayRoot || (folder.name && folder !== scopeFolder)) {
        var isCollapsed = folder !== scopeFolder && !expanded.has(folder.id);
        var foldRow = document.createElement('div');
        foldRow.className = 'library-preview-tree-folder' + (isCollapsed ? ' is-collapsed' : '');
        foldRow.setAttribute('role', 'treeitem');
        foldRow.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        foldRow.style.setProperty('--library-depth', String(depth));
        foldRow.dataset.folderId = folder.id;
        foldRow.tabIndex = -1;

        var toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'library-preview-tree-toggle';
        toggleBtn.tabIndex = 0;

        var chev = document.createElement('span');
        chev.className = 'library-category-chevron';
        chev.innerHTML = CHEVRON_SVG;
        toggleBtn.appendChild(chev);

        var label = document.createElement('span');
        label.className = 'library-preview-tree-label';
        label.textContent = folder.name;
        toggleBtn.appendChild(label);

        if (folder.description) applyTip(toggleBtn, folder.description);

        toggleBtn.addEventListener('click', function () {
          if (expanded.has(folder.id)) expanded.delete(folder.id);
          else expanded.add(folder.id);
          renderTree();
        });

        foldRow.appendChild(toggleBtn);

        if (onInsertFolder) {
          var foldActions = document.createElement('div');
          foldActions.className = 'library-actions';
          var folderPath = pathLabel || '';
          foldActions.appendChild(actionBtn(applyTip, '', 'Insert', ICON_INSERT, function (btn) {
            onInsertFolder(btn, folder, folderPath);
          }));
          foldRow.appendChild(foldActions);
        }

        treePane.appendChild(foldRow);
        treeRows.push(toggleBtn);

        if (isCollapsed) return;
        depth += 1;
      }

      if (!folder.children) return;
      for (var i = 0; i < folder.children.length; i++) {
        var child = folder.children[i];
        if (child.type === 'folder') {
          renderTreeFolder(child, depth, pathLabel ? pathLabel + '/' + child.name : child.name);
        } else {
          var fileRow = document.createElement('div');
          fileRow.className = 'library-preview-tree-file library-preview-tree-file--' + (child.ext || 'bel');
          if (child.id === selectedId) fileRow.classList.add('is-selected');
          fileRow.setAttribute('role', 'treeitem');
          fileRow.style.setProperty('--library-depth', String(depth));
          fileRow.dataset.fileId = child.id;
          fileRow.tabIndex = 0;

          var fileLabel = document.createElement('span');
          fileLabel.className = 'library-preview-tree-label';
          fileLabel.textContent = child.label;
          fileRow.appendChild(fileLabel);

          if (onCopyFile || onInsertFile) {
            var fileActions = document.createElement('div');
            fileActions.className = 'library-actions';
            if (onCopyFile) {
              fileActions.appendChild(actionBtn(applyTip, '', 'Copy to clipboard', ICON_COPY, function () {
                onCopyFile(child);
              }));
            }
            if (onInsertFile) {
              fileActions.appendChild(actionBtn(applyTip, '', 'Insert', ICON_INSERT, function (btn) {
                onInsertFile(btn, child);
              }));
            }
            fileRow.appendChild(fileActions);
          }

          if (child.description) applyTip(fileRow, child.description);

          fileRow.addEventListener('click', function (it) {
            return function (e) {
              if (e.target.closest('.library-actions')) return;
              selectFile(it);
            };
          }(child));

          treePane.appendChild(fileRow);
          treeRows.push(fileRow);
        }
      }
    }

    function renderTree() {
      treePane.innerHTML = '';
      treeRows = [];
      renderTreeFolder(scopeFolder, 0, '');
    }

    function focusRowIndex(idx) {
      if (!treeRows.length) return;
      var i = ((idx % treeRows.length) + treeRows.length) % treeRows.length;
      var row = treeRows[i];
      row.focus();
      if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    }

    function handleTreeKeydown(e) {
      var row = document.activeElement;
      var idx = treeRows.indexOf(row);
      if (idx === -1) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusRowIndex(idx + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusRowIndex(idx - 1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (row.classList.contains('library-preview-tree-toggle')) {
          e.preventDefault();
          row.click();
        } else if (row.classList.contains('library-preview-tree-file')) {
          e.preventDefault();
          var fid = row.dataset.fileId;
          if (fid && fileIndex[fid]) selectFile(fileIndex[fid].item);
        }
      } else if (e.key === 'ArrowRight') {
        var folderEl = row.closest('.library-preview-tree-folder');
        if (folderEl && folderEl.classList.contains('is-collapsed')) {
          e.preventDefault();
          var fid2 = folderEl.dataset.folderId;
          if (fid2) { expanded.add(fid2); renderTree(); }
        }
      } else if (e.key === 'ArrowLeft') {
        var folderEl2 = row.closest('.library-preview-tree-folder');
        if (folderEl2 && !folderEl2.classList.contains('is-collapsed')) {
          e.preventDefault();
          var fid3 = folderEl2.dataset.folderId;
          if (fid3) { expanded.delete(fid3); renderTree(); }
        }
      }
    }

    function handleDialogKeydown(e) {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'f') {
        e.preventDefault();
        e.stopPropagation();
        searchInput.focus();
        searchInput.select();
        setSearchFocused(true);
      }
    }

    treePane.addEventListener('keydown', handleTreeKeydown);

    var dialogEl = global.BelJarDialog.createDialog({
      ariaLabel: 'Library preview — ' + scopeLabel,
      content: shell,
      className: 'bj-library-preview-dialog',
      cardClass: 'bj-dialog__card bj-dialog__card--library-preview',
      removeOnClose: true,
    });

    activeDialog = dialogEl;

    dialogEl.addEventListener('close', function () {
      if (activeDialog === dialogEl) activeDialog = null;
      var libTree = document.querySelector('.library-tree');
      if (libTree && libTree.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    });

    dialogEl.addEventListener('keydown', handleDialogKeydown, true);

    global.BelJarDialog.openDialog(dialogEl);
    renderTree();

    if (selectedId && fileIndex[selectedId]) {
      selectFile(fileIndex[selectedId].item, { skipScroll: false });
    } else {
      showEmpty();
    }

    requestAnimationFrame(function () {
      var sel = treePane.querySelector('.library-preview-tree-file.is-selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    });
  }

  function close() {
    if (activeDialog && global.BelJarDialog) {
      global.BelJarDialog.requestDialogClose(activeDialog);
    }
  }

  global.BelJarLibraryPreview = { open: open, close: close };
})(typeof window !== 'undefined' ? window : globalThis);
