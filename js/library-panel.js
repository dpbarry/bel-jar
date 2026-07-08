(function (global) {
  'use strict';

  var FOLD_KEY = 'beljar-library-expanded';
  var CHEVRON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var ICON_PREVIEW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
  var ICON_INSERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';

  function readExpanded() {
    try {
      var raw = localStorage.getItem(FOLD_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (_) {
      return new Set();
    }
  }

  function writeExpanded(set) {
    try {
      localStorage.setItem(FOLD_KEY, JSON.stringify([].concat(Array.from(set))));
    } catch (_) {}
  }

  function stemOf(label) {
    return String(label || '').replace(/\.[^.]+$/, '');
  }

  function dirOf(path) {
    var i = String(path || '').lastIndexOf('/');
    return i === -1 ? '' : path.slice(0, i);
  }

  function init(opts) {
    opts = opts || {};
    var container = opts.container;
    var searchEl = opts.searchEl;
    if (!container) return null;

    var manifest = null;
    var expanded = readExpanded();
    var contentCache = Object.create(null);
    var filterText = '';
    var searchMatchIds = null;
    var searchSnippets = null;
    var searchPending = false;
    var searchToken = 0;
    var allFileEntries = [];
    var suitesCache = [];
    var searchWrap = document.getElementById('library-search-wrap');
    var LS = global.BelJarLibrarySearch;

    function readExpandDefault() {
      return typeof global.BelJarPersist !== 'undefined' && global.BelJarPersist.readStoredLibraryExpandDefault();
    }

    function isCategoryExpanded(foldKey, forceOpen) {
      if (forceOpen) return true;
      var inSet = expanded.has(foldKey);
      return readExpandDefault() ? !inSet : inSet;
    }

    function toggleCategoryExpanded(foldKey) {
      if (expanded.has(foldKey)) expanded.delete(foldKey);
      else expanded.add(foldKey);
      writeExpanded(expanded);
    }

    function applyTip(el, tip) {
      if (typeof opts.applyTip === 'function') opts.applyTip(el, tip);
    }

    function toast(msg, kind) {
      if (typeof opts.showToast === 'function') opts.showToast(msg, { kind: kind || 'info' });
    }

    function hasEditor() {
      return typeof opts.getEditor === 'function' && opts.getEditor()
        && typeof opts.getActiveFileId === 'function' && opts.getActiveFileId();
    }

    function hasActiveFile() {
      return typeof opts.getActiveFileId === 'function' && !!opts.getActiveFileId();
    }

    function activeFileDir() {
      if (!hasActiveFile() || typeof opts.listFiles !== 'function') return null;
      var id = opts.getActiveFileId();
      var files = opts.listFiles();
      for (var i = 0; i < files.length; i++) {
        if (files[i].id === id) return dirOf(files[i].name);
      }
      return null;
    }

    function refreshSuites() {
      if (typeof opts.listActiveSuites === 'function') {
        suitesCache = opts.listActiveSuites();
      } else if (global.BelJarLibrarySuites) {
        suitesCache = global.BelJarLibrarySuites.listActiveSuites({
          listFiles: opts.listFiles,
          getActiveCfgForDir: opts.getActiveCfgForDir,
        });
      } else {
        suitesCache = [];
      }
      return suitesCache;
    }

    function openLibraryPreview(previewOpts) {
      if (!global.BelJarLibraryPreview || typeof global.BelJarLibraryPreview.open !== 'function') return;
      global.BelJarLibraryPreview.open({
        scopeFolder: previewOpts.scopeFolder,
        scopeLabel: previewOpts.scopeLabel,
        initialFile: previewOpts.initialFile || null,
        focusFolder: previewOpts.focusFolder || null,
        fetchContent: fetchContent,
        applyTip: applyTip,
        onCopyFile: function (item) {
          fetchContent(item.path).then(function (code) {
            return navigator.clipboard.writeText(code);
          }).then(function () {
            toast('Copied to clipboard');
          }).catch(function () {
            toast('Could not copy to clipboard.', { kind: 'warn' });
          });
        },
        onInsertFile: function (anchor, item) {
          fetchContent(item.path).then(function (code) {
            openInsertMenu(anchor, code, item);
          }).catch(function () {
            toast('Could not load library sample.', { kind: 'warn' });
          });
        },
        onInsertFolder: function (anchor, folder) {
          openFolderInsertMenu(anchor, folder);
        },
      });
    }

    function fetchContent(path) {
      if (contentCache[path] != null) return Promise.resolve(contentCache[path]);
      return fetch('library/data/' + path).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      }).then(function (text) {
        contentCache[path] = text;
        return text;
      });
    }

    function libraryInsertPath(ref) {
      if (typeof ref === 'string') return ref;
      if (!ref) return '';
      return ref.path || ref.label || ref.name || '';
    }

    function prepareLibraryInsert(code, ref) {
      var path = libraryInsertPath(ref);
      if (!/\.(bel|elf)$/i.test(path)) return code;
      if (typeof BelJarEditor !== 'undefined' && typeof BelJarEditor.maybeExpandBelAliases === 'function') {
        return BelJarEditor.maybeExpandBelAliases(code);
      }
      return code;
    }

    function isLibraryProjectFile(item) {
      if (!item || item.type !== 'file') return false;
      var label = String(item.label || '').toLowerCase();
      var ext = String(item.ext || '').toLowerCase();
      return ext === 'bel' || ext === 'elf' || ext === 'cfg'
        || /\.(bel|elf|cfg)$/i.test(label);
    }

    function isSuiteSourceFile(item) {
      if (!item || item.type !== 'file') return false;
      var label = String(item.label || '').toLowerCase();
      var ext = String(item.ext || '').toLowerCase();
      return ext === 'bel' || ext === 'elf' || /\.(bel|elf)$/i.test(label);
    }

    function projectFileName(item) {
      if (item.label && /\.(bel|elf|cfg)$/i.test(item.label)) return item.label;
      var ext = item.ext === 'elf' ? 'elf' : (item.ext === 'cfg' ? 'cfg' : 'bel');
      return stemOf(item.label) + '.' + ext;
    }

    function joinProjectPath(base, rel) {
      var parts = [];
      if (base) parts.push(String(base).replace(/^\/+|\/+$/g, ''));
      if (rel) parts.push(String(rel).replace(/^\/+|\/+$/g, ''));
      return parts.join('/');
    }

    function targetPathInDir(item, dir) {
      var name = projectFileName(item);
      return dir ? dir + '/' + name : name;
    }

    function targetPathForSuite(item, suite) {
      var name = projectFileName(item);
      var d = suite.dir;
      return d ? d + '/' + name : name;
    }

    function resolveBulkPlan(incoming, existingFiles) {
      var NC = global.BelJarNameConflicts;
      var CD = global.BelJarConflictDialog;
      if (!NC) {
        return Promise.resolve({ create: incoming.slice(), replace: [], replaceFolder: [] });
      }
      if (!CD) {
        var names = existingFiles.map(function (f) { return f.name; });
        var resolved = incoming.map(function (entry) {
          var path = entry.name;
          if (NC.nameConflict(existingFiles, path)) {
            path = NC.suggestNewPath(path, names);
          }
          names.push(path);
          return { name: path, text: entry.text };
        });
        return Promise.resolve(NC.applyResolutions(existingFiles, resolved, [], []));
      }
      var batchRoots = typeof NC.uploadFolderBatchRoots === 'function'
        ? NC.uploadFolderBatchRoots(incoming)
        : [];
      var conflicts = NC.detectUploadConflicts(existingFiles, incoming, {
        folderBatchRoots: batchRoots,
      });
      if (!conflicts.length) {
        return Promise.resolve(NC.applyResolutions(existingFiles, incoming, [], []));
      }
      return CD.resolveConflicts(conflicts, { context: 'library' }).then(function (resolutions) {
        if (resolutions === null) return null;
        return NC.applyResolutions(existingFiles, incoming, conflicts, resolutions);
      });
    }

    function resolveMagicPlan(relPath, code, existingFiles) {
      var NC = global.BelJarNameConflicts;
      var CD = global.BelJarConflictDialog;
      var incoming = [{ name: relPath, text: code }];
      if (!NC) {
        return Promise.resolve({ create: [{ name: relPath, text: code }], replace: [], replaceFolder: [] });
      }
      if (!CD) {
        var names = existingFiles.map(function (f) { return f.name; });
        var path = relPath;
        if (NC.nameConflict(existingFiles, relPath)) {
          path = NC.suggestNewPath(relPath, names);
        }
        return Promise.resolve(NC.applyResolutions(
          existingFiles,
          [{ name: path, text: code }],
          [],
          [],
        ));
      }
      var conflicts = NC.detectUploadConflicts(existingFiles, incoming, { folderBatchRoots: [] });
      if (!conflicts.length) {
        return Promise.resolve(NC.applyResolutions(existingFiles, incoming, [], []));
      }
      return CD.resolveConflicts(conflicts, { context: 'library' }).then(function (resolutions) {
        if (resolutions === null) return null;
        return NC.applyResolutions(existingFiles, incoming, conflicts, resolutions);
      });
    }

    function applyFilePlan(plan, suite) {
      var P = global.BelJarPersist;
      if (!plan) return;
      var targetId = null;
      var targetPath = null;
      var created = false;

      if (plan.replace && plan.replace.length === 1) {
        targetId = plan.replace[0].id;
        targetPath = plan.replace[0].name;
        if (typeof opts.applyFileReplacement === 'function') {
          opts.applyFileReplacement(targetId, plan.replace[0].text);
        } else {
          P.setFileText(targetId, plan.replace[0].text);
        }
      } else if (plan.create && plan.create.length === 1) {
        targetPath = plan.create[0].name;
        targetId = P.createFile(targetPath);
        P.setFileText(targetId, plan.create[0].text);
        created = true;
      } else {
        return;
      }

      if (suite && typeof P.prependEntryToCfg === 'function') {
        if (!P.prependEntryToCfg(suite.cfgPath, targetPath)) {
          if (created) {
            P.deleteFile(targetId);
            toast('Could not add to suite (already listed or invalid path).', { kind: 'warn' });
            return;
          }
        }
      }
      if (suite && typeof opts.afterSuiteEdit === 'function') opts.afterSuiteEdit(suite.dir);
      if (typeof opts.onProjectChanged === 'function') {
        var activeId = typeof opts.getActiveFileId === 'function' ? opts.getActiveFileId() : null;
        opts.onProjectChanged({ modifiedActive: targetId === activeId && !created });
      }
      if (suite) {
        var suiteName = suite.cfgPath.slice(suite.cfgPath.lastIndexOf('/') + 1);
        toast('Added ' + targetPath.split('/').pop() + ' to prelude of ' + suiteName);
      } else {
        toast('Created ' + targetPath.split('/').pop());
      }
    }

    function syncActiveCfgsAfterBulk() {
      var P = global.BelJarPersist;
      var PS = global.BelJarProjectSource;
      if (!P || !PS || typeof PS.inferActiveCfgByDir !== 'function') return;
      if (typeof P.backfillActiveCfgByDir !== 'function') return;
      var files = P.listFiles();
      var byDir = PS.inferActiveCfgByDir(files, function (id) { return P.getFileText(id); });
      P.backfillActiveCfgByDir(byDir);
    }

    function applyBulkPlan(plan) {
      var P = global.BelJarPersist;
      if (!plan) return;

      if (typeof opts.applyUploadPlan === 'function') {
        var count = 0;
        if (plan.replaceFolder) {
          for (var rfi = 0; rfi < plan.replaceFolder.length; rfi++) {
            count += (plan.replaceFolder[rfi].entries || []).length;
          }
        }
        if (plan.replace) count += plan.replace.length;
        if (plan.create) count += plan.create.length;
        opts.applyUploadPlan(plan);
        syncActiveCfgsAfterBulk();
        if (typeof opts.afterSuiteEdit === 'function') {
          var dir = activeFileDir();
          opts.afterSuiteEdit(dir != null ? dir : '');
        }
        toast('Inserted ' + count + ' file' + (count === 1 ? '' : 's'));
        return;
      }

      var count = 0;

      if (plan.replaceFolder) {
        for (var rf = 0; rf < plan.replaceFolder.length; rf++) {
          var folder = plan.replaceFolder[rf];
          var deleteIds = folder.deleteIds || [];
          for (var di = 0; di < deleteIds.length; di++) {
            P.deleteFile(deleteIds[di]);
          }
          var folderEntries = folder.entries || [];
          for (var fe = 0; fe < folderEntries.length; fe++) {
            var newId = P.createFile(folderEntries[fe].name);
            P.setFileText(newId, folderEntries[fe].text);
            count += 1;
          }
        }
      }
      if (plan.replace) {
        for (var i = 0; i < plan.replace.length; i++) {
          if (typeof opts.applyFileReplacement === 'function') {
            opts.applyFileReplacement(plan.replace[i].id, plan.replace[i].text);
          } else {
            P.setFileText(plan.replace[i].id, plan.replace[i].text);
          }
          count += 1;
        }
      }
      if (plan.create) {
        for (var j = 0; j < plan.create.length; j++) {
          var id = P.createFile(plan.create[j].name);
          P.setFileText(id, plan.create[j].text);
          count += 1;
        }
      }
      syncActiveCfgsAfterBulk();
      if (typeof opts.afterSuiteEdit === 'function') {
        var d = activeFileDir();
        opts.afterSuiteEdit(d != null ? d : '');
      }
      if (typeof opts.onProjectChanged === 'function') {
        var activeId = typeof opts.getActiveFileId === 'function' ? opts.getActiveFileId() : null;
        var modifiedActive = false;
        if (activeId && plan.replace) {
          for (var k = 0; k < plan.replace.length; k++) {
            if (plan.replace[k].id === activeId) { modifiedActive = true; break; }
          }
        }
        opts.onProjectChanged({ modifiedActive: modifiedActive });
      }
      toast('Inserted ' + count + ' file' + (count === 1 ? '' : 's'));
    }

    function applyMagicPlan(plan, suite) {
      applyFilePlan(plan, suite);
    }

    function findParentFolder(item) {
      if (!manifest || !manifest.sections || !item) return null;
      var found = null;
      function walk(folder) {
        if (!folder || !folder.children) return false;
        for (var i = 0; i < folder.children.length; i++) {
          var child = folder.children[i];
          if (child.type === 'file' && child.id === item.id) {
            found = folder;
            return true;
          }
          if (child.type === 'folder' && walk(child)) return true;
        }
        return false;
      }
      for (var s = 0; s < manifest.sections.length; s++) {
        var section = manifest.sections[s];
        if (section.tree && walk(section.tree)) break;
      }
      return found;
    }

    function folderExportLabel(folder) {
      if (!folder) return 'Untitled';
      if (folder.name) return folder.name;
      return 'Untitled';
    }

    function projectRelForLibraryItem(item, folder) {
      if (!item) return null;
      if (folder) {
        var entries = collectFolderFiles(folder, '');
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].item.id === item.id) return entries[i].rel;
        }
      }
      return projectFileName(item);
    }

    function fetchFolderProjectEntries(folder) {
      var entries = collectFolderFiles(folder, '');
      if (!entries.length) return Promise.resolve([]);
      return Promise.all(entries.map(function (entry) {
        return fetchContent(entry.item.path).then(function (code) {
          return { name: entry.rel, text: prepareLibraryInsert(code, entry.rel) };
        });
      }));
    }

    function runExportAsNewProject(folder, activeItem) {
      if (typeof opts.onExportAsNewProject !== 'function') return;
      if (!folder) {
        toast('Could not locate library folder.', { kind: 'warn' });
        return;
      }
      fetchFolderProjectEntries(folder).then(function (rawEntries) {
        if (!rawEntries.length) {
          toast('No files to export.', { kind: 'warn' });
          return;
        }
        opts.onExportAsNewProject({
          defaultName: folderExportLabel(folder),
          entries: rawEntries,
          activeRelPath: activeItem ? projectRelForLibraryItem(activeItem, folder) : null,
        });
      }).catch(function () {
        toast('Could not load library samples.', { kind: 'warn' });
      });
    }

    function runInsertAtRoot(item) {
      var P = global.BelJarPersist;
      if (!P || typeof P.createFile !== 'function' || !isLibraryProjectFile(item)) return;

      fetchContent(item.path).then(function (code) {
        code = prepareLibraryInsert(code, item.path);
        var relPath = targetPathInDir(item, '');
        return resolveMagicPlan(relPath, code, P.listFiles()).then(function (plan) {
          if (!plan) return;
          applyFilePlan(plan, null);
        });
      }).catch(function () {
        toast('Could not load library sample.', { kind: 'warn' });
      });
    }

    function runInsertUnderCurrentFolder(item) {
      var P = global.BelJarPersist;
      if (!P || typeof P.createFile !== 'function' || !hasActiveFile() || !isLibraryProjectFile(item)) return;
      var dir = activeFileDir();
      if (dir === null) return;

      fetchContent(item.path).then(function (code) {
        code = prepareLibraryInsert(code, item.path);
        var relPath = targetPathInDir(item, dir);
        return resolveMagicPlan(relPath, code, P.listFiles()).then(function (plan) {
          if (!plan) return;
          applyFilePlan(plan, null);
        });
      }).catch(function () {
        toast('Could not load library sample.', { kind: 'warn' });
      });
    }

    function collectFolderFiles(folder, relPrefix) {
      var out = [];
      if (!folder || !folder.children) return out;
      for (var i = 0; i < folder.children.length; i++) {
        var child = folder.children[i];
        if (child.type === 'file') {
          if (!isLibraryProjectFile(child)) continue;
          var rel = relPrefix ? relPrefix + '/' + child.label : child.label;
          out.push({ item: child, rel: rel });
        } else if (child.type === 'folder') {
          var nextPrefix = relPrefix
            ? (child.name ? relPrefix + '/' + child.name : relPrefix)
            : (child.name || '');
          out = out.concat(collectFolderFiles(child, nextPrefix));
        }
      }
      return out;
    }

    function runFolderInsert(folder, mode) {
      var P = global.BelJarPersist;
      if (!P || typeof P.createFile !== 'function') return;

      var rootPrefix = folder.name || '';
      var entries = collectFolderFiles(folder, rootPrefix);
      if (!entries.length) {
        toast('No files in this folder.', { kind: 'warn' });
        return;
      }

      var projectBase = '';
      if (mode === 'under') {
        if (!hasActiveFile()) {
          toast('Open a project file first.', { kind: 'warn' });
          return;
        }
        projectBase = activeFileDir() || '';
      }

      Promise.all(entries.map(function (entry) {
        return fetchContent(entry.item.path).then(function (code) {
          return {
            name: joinProjectPath(projectBase, entry.rel),
            text: prepareLibraryInsert(code, entry.rel),
          };
        });
      })).then(function (incoming) {
        return resolveBulkPlan(incoming, P.listFiles());
      }).then(function (plan) {
        if (!plan) return;
        applyBulkPlan(plan);
      }).catch(function () {
        toast('Could not load library samples.', { kind: 'warn' });
      });
    }

    function libraryMenuRow(anchor) {
      if (!anchor || !anchor.closest) return null;
      return anchor.closest('.library-category-item')
        || anchor.closest('.library-example-item')
        || anchor.closest('.library-preview-tree-folder')
        || anchor.closest('.library-preview-tree-file');
    }

    function openLibraryMenu(anchor, menuOpts) {
      if (typeof global.Menu === 'undefined') return;
      var row = libraryMenuRow(anchor);
      if (row) row.classList.add('is-menu-open');
      var userOnClose = menuOpts.onClose;
      global.Menu.open({
        anchor: menuOpts.anchor != null ? menuOpts.anchor : anchor,
        side: menuOpts.side,
        align: menuOpts.align,
        items: menuOpts.items,
        onReady: menuOpts.onReady,
        onClose: function () {
          if (row) row.classList.remove('is-menu-open');
          if (typeof userOnClose === 'function') userOnClose();
        },
      });
    }

    function openFolderInsertMenu(anchor, folder) {
      openLibraryMenu(anchor, {
        side: 'right',
        align: 'start',
        items: [
          { label: 'Insert at root', onSelect: function () { runFolderInsert(folder, 'root'); } },
          { label: 'Insert under current folder', onSelect: function () { runFolderInsert(folder, 'under'); } },
          { label: 'Export as new project…', onSelect: function () { runExportAsNewProject(folder, null); } },
        ],
      });
    }

    function openFileInsertMenu(anchor, item, code) {
      if (typeof global.Menu === 'undefined') return;
      refreshSuites();
      var ed = typeof opts.getEditor === 'function' ? opts.getEditor() : null;
      var editorReady = !!(ed && hasEditor());
      var items = [
        { type: 'section', label: 'Create' },
        {
          label: 'Insert at root',
          disabled: !isLibraryProjectFile(item),
          onSelect: function () { runInsertAtRoot(item); },
        },
        {
          label: 'Insert under current folder',
          disabled: !hasActiveFile() || !isLibraryProjectFile(item),
          onSelect: function () { runInsertUnderCurrentFolder(item); },
        },
        {
          label: 'Insert to active suite',
          disabled: !suitesCache.length || !isSuiteSourceFile(item),
          onSelect: function () { openSuitePicker(anchor, item); },
        },
        {
          label: 'Export as new project…',
          disabled: !isLibraryProjectFile(item),
          onSelect: function () {
            var folder = findParentFolder(item);
            runExportAsNewProject(folder, item);
          },
        },
        { type: 'separator' },
        { type: 'section', label: 'Active file' },
        {
          label: 'Insert at top',
          disabled: !editorReady,
          onSelect: function () { ed.insertTop(code); ed.focus && ed.focus(); },
        },
        {
          label: 'Insert at bottom',
          disabled: !editorReady,
          onSelect: function () { ed.insertBottom(code); ed.focus && ed.focus(); },
        },
        {
          label: 'Insert at cursor',
          disabled: !editorReady,
          onSelect: function () {
            if (typeof ed.insertAtSelection === 'function') ed.insertAtSelection(code);
            ed.focus && ed.focus();
          },
        },
      ];
      openLibraryMenu(anchor, {
        side: 'right',
        align: 'start',
        items: items,
      });
    }

    function openInsertMenu(anchor, code, item) {
      openFileInsertMenu(anchor, item, prepareLibraryInsert(code, item));
    }

    function runMagic(item, suite) {
      if (!suite) return;
      if (!isSuiteSourceFile(item)) return;
      var P = global.BelJarPersist;
      if (!P || typeof P.createFile !== 'function') return;

      fetchContent(item.path).then(function (code) {
        code = prepareLibraryInsert(code, item.path);
        var relPath = targetPathForSuite(item, suite);
        return resolveMagicPlan(relPath, code, P.listFiles()).then(function (plan) {
          if (!plan) return;
          applyMagicPlan(plan, suite);
        });
      }).catch(function () {
        toast('Could not load library sample.', { kind: 'warn' });
      });
    }

    function openSuitePicker(anchor, item) {
      refreshSuites();
      if (!suitesCache.length) return;
      if (suitesCache.length === 1) {
        runMagic(item, suitesCache[0]);
        return;
      }
      if (typeof global.Menu === 'undefined') return;
      openLibraryMenu(anchor, {
        side: 'right',
        align: 'start',
        items: suitesCache.map(function (s) {
          return {
            label: s.label,
            onSelect: function () { runMagic(item, s); },
          };
        }),
      });
    }

    function actionBtn(className, label, svg, disabled, onClick) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'library-action-btn' + (className ? ' ' + className : '');
      btn.innerHTML = svg;
      btn.setAttribute('aria-label', label);
      applyTip(btn, label);
      if (disabled) btn.disabled = true;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!btn.disabled) onClick(btn);
      });
      return btn;
    }

    function nodeMatchesFile(item, ctx) {
      if (!filterText) return true;
      if (searchMatchIds) return searchMatchIds.has(item.id);
      var hay = [
        item.label,
        item.description || '',
        item.path || '',
        ctx.pathLabel,
        ctx.section.label,
      ].join(' ').toLowerCase();
      return hay.indexOf(filterText) !== -1;
    }

    function folderMatches(folder, ctx) {
      if (!filterText) return true;
      var hay = [folder.name, folder.description || '', ctx.pathLabel, ctx.section.label].join(' ').toLowerCase();
      if (hay.indexOf(filterText) !== -1) return true;
      return folder.children.some(function (child) {
        if (child.type === 'file') return nodeMatchesFile(child, ctx);
        return folderMatches(child, {
          section: ctx.section,
          pathLabel: ctx.pathLabel ? ctx.pathLabel + '/' + child.name : child.name,
        });
      });
    }

    function collectAllFiles(folder, section, pathLabel, topCategory, foldKeys) {
      if (!folder || folder.type !== 'folder') return;
      var category = topCategory;
      var keys = foldKeys ? foldKeys.slice() : [];
      if (folder.name && !topCategory) {
        category = { folder: folder, label: folder.name };
      }
      if (folder.name) {
        keys.push(section.id + '/' + folder.id);
      }
      if (!folder.children) return;
      for (var i = 0; i < folder.children.length; i++) {
        var child = folder.children[i];
        if (child.type === 'folder') {
          collectAllFiles(
            child,
            section,
            pathLabel ? pathLabel + '/' + child.name : child.name,
            category,
            keys,
          );
        } else if (child.type === 'file') {
          var pl = pathLabel || '';
          allFileEntries.push({
            item: child,
            id: child.id,
            label: child.label,
            path: child.path,
            ext: child.ext || 'bel',
            pathLabel: pl,
            sectionLabel: section.label,
            section: section,
            topCategory: category,
            foldKeys: keys.slice(),
            hay: LS ? LS.metadataHay({
              label: child.label,
              description: child.description,
              path: child.path,
              pathLabel: pl,
              sectionLabel: section.label,
            }) : '',
          });
        }
      }
    }

    function rebuildFileIndex() {
      allFileEntries = [];
      if (!manifest || !manifest.sections) return;
      manifest.sections.forEach(function (section) {
        if (section.tree) collectAllFiles(section.tree, section, '', null, []);
      });
    }

    function appendMatchContext(item, depth) {
      if (!filterText || !searchSnippets) return;
      var hit = searchSnippets[item.id];
      if (!hit || !hit.snippet) return;

      var ctxRow = document.createElement('div');
      ctxRow.className = 'library-match-context';
      ctxRow.style.setProperty('--library-depth', String(depth));
      ctxRow.setAttribute('aria-hidden', 'true');

      if (hit.line) {
        var lineEl = document.createElement('span');
        lineEl.className = 'library-match-context__line';
        lineEl.textContent = String(hit.line);
        ctxRow.appendChild(lineEl);
      }

      var sn = document.createElement('code');
      sn.className = 'library-match-context__snippet';
      sn.textContent = hit.snippet;
      ctxRow.appendChild(sn);

      container.appendChild(ctxRow);
    }

    function runSearch() {
      if (!searchEl || !LS) return;
      var q = LS.normalizeQuery(searchEl.value);
      filterText = q;
      if (!q) {
        searchMatchIds = null;
        searchSnippets = null;
        searchPending = false;
        if (searchWrap) searchWrap.classList.remove('is-searching');
        render();
        return;
      }

      var token = ++searchToken;
      var syncIds = new Set();
      for (var i = 0; i < allFileEntries.length; i++) {
        var e = allFileEntries[i];
        if (e.hay.indexOf(q) !== -1) syncIds.add(e.id);
      }
      searchMatchIds = syncIds;
      searchSnippets = Object.create(null);
      searchPending = true;
      if (searchWrap) searchWrap.classList.add('is-searching');
      render();

      LS.searchEntries(allFileEntries, q, fetchContent, { limit: 0 }).then(function (hits) {
        if (token !== searchToken) return;
        searchPending = false;
        if (searchWrap) searchWrap.classList.remove('is-searching');
        searchMatchIds = new Set();
        searchSnippets = Object.create(null);
        for (var j = 0; j < hits.length; j++) {
          var h = hits[j];
          searchMatchIds.add(h.entry.id);
          if (h.snippet) {
            searchSnippets[h.entry.id] = { snippet: h.snippet, line: h.line };
          }
        }
        render();
      });
    }

    var searchTimer = null;
    function scheduleSearch() {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 180);
    }

    function countVisibleFiles(folder, ctx) {
      var n = 0;
      for (var i = 0; i < folder.children.length; i++) {
        var child = folder.children[i];
        if (child.type === 'file') {
          if (nodeMatchesFile(child, ctx)) n += 1;
        } else {
          n += countVisibleFiles(child, {
            section: ctx.section,
            pathLabel: ctx.pathLabel ? ctx.pathLabel + '/' + child.name : child.name,
          });
        }
      }
      return n;
    }

    function renderFileItem(item, depth, topCategory) {
      var row = document.createElement('div');
      row.className = 'library-example-item library-example-item--' + (item.ext || 'bel');
      row.setAttribute('role', 'treeitem');
      row.tabIndex = 0;
      row.style.setProperty('--library-depth', String(depth));

      row.setAttribute('data-library-file-id', item.id);

      var body = document.createElement('div');
      body.className = 'library-example-body';

      var nameEl = document.createElement('span');
      nameEl.className = 'library-example-label';
      nameEl.textContent = item.label;
      body.appendChild(nameEl);

      row.appendChild(body);

      var actions = document.createElement('div');
      actions.className = 'library-actions';

      var copyBtn = actionBtn('', 'Copy to clipboard', ICON_COPY, false, function () {
        fetchContent(item.path).then(function (code) {
          return navigator.clipboard.writeText(code);
        }).then(function () {
          toast('Copied to clipboard');
          var ed = typeof opts.getEditor === 'function' ? opts.getEditor() : null;
          if (ed && ed.focus) ed.focus();
        }).catch(function () {
          toast('Could not copy to clipboard.', { kind: 'warn' });
        });
      });

      var insertBtn = actionBtn('', 'Insert', ICON_INSERT, false, function (btn) {
        fetchContent(item.path).then(function (code) {
          openInsertMenu(btn, code, item);
        }).catch(function () {
          toast('Could not load library sample.', { kind: 'warn' });
        });
      });

      actions.appendChild(copyBtn);
      actions.appendChild(insertBtn);
      row.appendChild(actions);

      row.addEventListener('click', function (e) {
        if (e.target.closest('.library-actions')) return;
        if (!topCategory) return;
        openLibraryPreview({
          scopeFolder: topCategory.folder,
          scopeLabel: topCategory.label,
          initialFile: item,
        });
        row.blur();
      });

      if (item.description) {
        applyTip(row, item.description);
      } else if (typeof global.Tooltips !== 'undefined' && global.Tooltips.bindOverflow) {
        global.Tooltips.bindOverflow(nameEl, function () { return item.label; });
      }

      container.appendChild(row);
      appendMatchContext(item, depth);
    }

    function renderFolder(folder, section, depth, pathLabel, topCategory) {
      if (!folder || folder.type !== 'folder') return false;
      var ctx = { section: section, pathLabel: pathLabel };
      if (!folderMatches(folder, ctx)) return false;

      var forceOpen = !!filterText;
      var rendered = false;
      var category = topCategory;
      if (folder.name && !topCategory) {
        category = { folder: folder, label: folder.name };
      }

      if (folder.name) {
        var foldKey = section.id + '/' + folder.id;
        var isCollapsed = !isCategoryExpanded(foldKey, forceOpen);
        var visibleCount = countVisibleFiles(folder, ctx);

        var catRow = document.createElement('div');
        catRow.className = 'library-category-item' + (isCollapsed ? ' is-collapsed' : '');
        catRow.style.setProperty('--library-depth', String(depth));

        var toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'library-category-toggle';
        toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');

        var chev = document.createElement('span');
        chev.className = 'library-category-chevron';
        chev.innerHTML = CHEVRON_SVG;
        toggleBtn.appendChild(chev);

        var catLabel = document.createElement('span');
        catLabel.className = 'library-category-label';
        catLabel.textContent = folder.name;
        toggleBtn.appendChild(catLabel);

        if (folder.description) applyTip(toggleBtn, folder.description);

        toggleBtn.addEventListener('click', function () {
          toggleCategoryExpanded(foldKey);
          render();
        });

        catRow.appendChild(toggleBtn);

        var previewBtn = actionBtn('library-category-preview', 'Preview', ICON_PREVIEW, false, function () {
          if (!category) return;
          openLibraryPreview({
            scopeFolder: category.folder,
            scopeLabel: category.label,
            focusFolder: folder,
          });
        });
        catRow.appendChild(previewBtn);

        var insertBtn = actionBtn('library-category-insert', 'Insert', ICON_INSERT, false, function (btn) {
          openFolderInsertMenu(btn, folder);
        });
        catRow.appendChild(insertBtn);

        var count = document.createElement('span');
        count.className = 'library-category-count';
        count.textContent = String(visibleCount);
        catRow.appendChild(count);

        container.appendChild(catRow);
        rendered = true;

        if (isCollapsed) return rendered;
        depth += 1;
      }

      for (var i = 0; i < folder.children.length; i++) {
        var child = folder.children[i];
        if (child.type === 'folder') {
          if (renderFolder(child, section, depth, pathLabel ? pathLabel + '/' + child.name : child.name, category)) {
            rendered = true;
          }
        } else if (nodeMatchesFile(child, {
          section: section,
          pathLabel: pathLabel,
        })) {
          renderFileItem(child, depth, category);
          rendered = true;
        }
      }

      return rendered;
    }

    function render() {
      container.innerHTML = '';
      if (!manifest || !manifest.sections || !manifest.sections.length) {
        var empty = document.createElement('p');
        empty.className = 'library-empty';
        empty.textContent = 'Library catalog unavailable.';
        container.appendChild(empty);
        return;
      }

      refreshSuites();
      var anyVisible = false;

      manifest.sections.forEach(function (section) {
        if (!section.tree) return;
        var sectionLabel = document.createElement('div');
        sectionLabel.className = 'library-section-label';
        sectionLabel.textContent = section.label;
        container.appendChild(sectionLabel);

        if (renderFolder(section.tree, section, 0, '', null)) {
          anyVisible = true;
        } else {
          sectionLabel.remove();
        }
      });

      if (!anyVisible) {
        container.innerHTML = '';
        var noMatch = document.createElement('p');
        noMatch.className = 'library-empty';
        if (filterText && searchPending) {
          noMatch.textContent = 'Searching…';
        } else if (filterText) {
          noMatch.textContent = 'No samples match your search.';
        } else {
          noMatch.textContent = 'Library catalog unavailable.';
        }
        container.appendChild(noMatch);
      }
    }

    function loadManifest() {
      return fetch('library/manifest.json').then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        manifest = data;
        rebuildFileIndex();
        render();
      }).catch(function () {
        manifest = null;
        allFileEntries = [];
        render();
      });
    }

    if (searchEl && searchWrap && global.BelJarHeaderSearch) {
      global.BelJarHeaderSearch.init({
        host: searchWrap,
        input: searchEl,
        onInput: scheduleSearch,
      });
    } else if (searchEl) {
      searchEl.addEventListener('input', scheduleSearch);
    }

    loadManifest();

    return {
      refresh: function () {
        refreshSuites();
        render();
      },
      reload: loadManifest,
    };
  }

  global.BelJarLibrary = { init: init };
})(typeof window !== 'undefined' ? window : globalThis);
