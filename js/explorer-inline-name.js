// Validation and naming helpers for explorer inline create/rename.
(function (global) {
  'use strict';

  var NC = function () { return global.BelJarNameConflicts; };

  function lastSegment(path) {
    var s = String(path || '');
    var i = s.lastIndexOf('/');
    return i === -1 ? s : s.slice(i + 1);
  }

  function parentDir(path) {
    var s = String(path || '');
    var i = s.lastIndexOf('/');
    return i === -1 ? '' : s.slice(0, i);
  }

  function joinPath(dir, name) {
    var nc = NC();
    if (nc && nc.joinPath) return nc.joinPath(dir, name);
    if (!dir) return name;
    if (!name) return dir;
    return dir + '/' + name;
  }

  function invalidPathSegment(name) {
    var n = String(name || '').trim();
    if (!n) return 'Name is required.';
    if (n.indexOf('/') !== -1 || n.indexOf('\\') !== -1) return 'Name cannot contain slashes.';
    if (n === '.' || n === '..') return 'Invalid name.';
    return null;
  }

  function folderPathExists(files, emptyFolders, folderPath) {
    var fp = String(folderPath || '');
    if (!fp) return false;
    var empty = emptyFolders || [];
    for (var i = 0; i < empty.length; i++) {
      if (empty[i] === fp) return true;
    }
    for (var j = 0; j < files.length; j++) {
      var n = files[j].name;
      if (n === fp || n.indexOf(fp + '/') === 0) return true;
    }
    return false;
  }

  function normalizeInlineFileName(raw) {
    var name = String(raw || '').trim();
    if (!name) return '';
    return name;
  }

  function suggestDefaultFileName(parentDir, files) {
    var nc = NC();
    var base = 'untitled.bel';
    var full = joinPath(parentDir, base);
    if (nc && nc.nameConflict && !nc.nameConflict(files, full)) return full;
    if (nc && nc.suggestNewPath) {
      var paths = [];
      for (var i = 0; i < files.length; i++) paths.push(files[i].name);
      return nc.suggestNewPath(full, paths);
    }
    return full;
  }

  function suggestDefaultFolderName(parentDir, files, emptyFolders) {
    var nc = NC();
    var full = joinPath(parentDir, 'untitled');
    if (!folderPathExists(files, emptyFolders, full)) return full;
    if (nc && nc.suggestNewPath && nc.occupiedFolderPaths) {
      return nc.suggestNewPath(full, nc.occupiedFolderPaths(files, emptyFolders));
    }
    var n = 1;
    while (folderPathExists(files, emptyFolders, full)) {
      n += 1;
      full = joinPath(parentDir, 'untitled-' + n);
    }
    return full;
  }

  function validateFileCommit(rawName, parentDirPath, files, excludeId) {
    var err = invalidPathSegment(rawName);
    if (err) return { ok: false, error: err };
    var name = normalizeInlineFileName(rawName);
    if (!name) return { ok: false, error: 'Name is required.' };
    var full = joinPath(parentDirPath, name);
    var nc = NC();
    if (nc && nc.nameConflict(files, full, excludeId)) {
      return { ok: false, error: 'A file with that name already exists in this folder.' };
    }
    return { ok: true, fullPath: full, baseName: name };
  }

  function validateFolderCommit(rawName, parentDirPath, files, emptyFolders, excludeFolderPath) {
    var err = invalidPathSegment(rawName);
    if (err) return { ok: false, error: err };
    var seg = String(rawName || '').trim();
    if (!seg) return { ok: false, error: 'Name is required.' };
    var full = joinPath(parentDirPath, seg);
    if (excludeFolderPath && full === excludeFolderPath) {
      return { ok: true, fullPath: full, segment: seg };
    }
    if (folderPathExists(files, emptyFolders, full)) {
      return { ok: false, error: 'A folder with that name already exists.' };
    }
    return { ok: true, fullPath: full, segment: seg };
  }

  function resolveCreateParentFromRow(row) {
    if (!row) return '';
    if (row.hasAttribute('data-folder-path')) {
      return row.getAttribute('data-folder-path') || '';
    }
    var zone = row.getAttribute('data-drop-zone');
    return zone || '';
  }

  function resolveCreateParentDir(target) {
    if (!target) return '';
    if (target.kind === 'folder') return target.folderPath || '';
    if (target.kind === 'file') return target.parentDir != null ? target.parentDir : '';
    return '';
  }

  global.BelJarExplorerInlineName = {
    lastSegment: lastSegment,
    parentDir: parentDir,
    joinPath: joinPath,
    invalidPathSegment: invalidPathSegment,
    folderPathExists: folderPathExists,
    normalizeInlineFileName: normalizeInlineFileName,
    suggestDefaultFileName: suggestDefaultFileName,
    suggestDefaultFolderName: suggestDefaultFolderName,
    validateFileCommit: validateFileCommit,
    validateFolderCommit: validateFolderCommit,
    resolveCreateParentFromRow: resolveCreateParentFromRow,
    resolveCreateParentDir: resolveCreateParentDir,
  };
})(typeof window !== 'undefined' ? window : globalThis);
