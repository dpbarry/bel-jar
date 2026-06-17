// Path-level name conflict detection and upload resolution planning.
(function (global) {
  'use strict';

  function parentDir(path) {
    var s = String(path || '');
    var i = s.lastIndexOf('/');
    return i === -1 ? '' : s.slice(0, i);
  }

  function baseName(path) {
    var s = String(path || '');
    var i = s.lastIndexOf('/');
    return i === -1 ? s : s.slice(i + 1);
  }

  function pathsUnderPrefix(paths, prefix) {
    var out = [];
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      if (p === prefix || p.indexOf(prefix + '/') === 0) out.push(p);
    }
    return out;
  }

  function nameConflict(existingFiles, targetPath, excludeId) {
    var target = String(targetPath || '');
    if (!target) return false;
    for (var i = 0; i < existingFiles.length; i++) {
      var f = existingFiles[i];
      if (excludeId && f.id === excludeId) continue;
      if (f.name === target) return true;
    }
    return false;
  }

  function pathTaken(path, reservedPaths) {
    for (var i = 0; i < reservedPaths.length; i++) {
      if (reservedPaths[i] === path) return true;
    }
    return false;
  }

  function splitNumberedStem(stem) {
    var s = String(stem || '');
    var match = s.match(/^(.*?)-(\d+)$/);
    if (!match || match[1] === '') return { prefix: s, start: 1 };
    return { prefix: match[1], start: parseInt(match[2], 10) + 1 };
  }

  function suggestNewPath(path, reservedPaths) {
    var dir = parentDir(path);
    var base = baseName(path);
    var stem = base;
    var ext = '';
    var dot = base.lastIndexOf('.');
    if (dot > 0) {
      stem = base.slice(0, dot);
      ext = base.slice(dot);
    }
    var split = splitNumberedStem(stem);
    var prefix = split.prefix;
    var n = split.start;
    var full;
    do {
      var candidate = prefix + '-' + n + ext;
      full = dir ? dir + '/' + candidate : candidate;
      n += 1;
    } while (pathTaken(full, reservedPaths));
    return full;
  }

  function folderPathsFromFilePaths(paths) {
    var set = {};
    for (var i = 0; i < paths.length; i++) {
      var parts = String(paths[i] || '').split('/');
      var acc = '';
      for (var j = 0; j < parts.length - 1; j++) {
        acc = acc ? acc + '/' + parts[j] : parts[j];
        set[acc] = true;
      }
    }
    return Object.keys(set);
  }

  function occupiedFolderPaths(files, emptyFolders) {
    var paths = folderPathsFromFilePaths(
      (files || []).map(function (f) { return f.name; }),
    );
    var set = {};
    for (var i = 0; i < paths.length; i++) set[paths[i]] = true;
    var empty = emptyFolders || [];
    for (var j = 0; j < empty.length; j++) set[empty[j]] = true;
    return Object.keys(set);
  }

  function joinPath(dir, name) {
    if (!dir) return name;
    if (!name) return dir;
    return dir + '/' + name;
  }

  function isDescendantPath(ancestor, path) {
    return path === ancestor || path.indexOf(ancestor + '/') === 0;
  }

  function filesUnderPrefix(files, prefix) {
    var out = [];
    for (var i = 0; i < files.length; i++) {
      var n = files[i].name;
      if (n === prefix || n.indexOf(prefix + '/') === 0) out.push(files[i]);
    }
    return out;
  }

  function computeMoveTargets(existingFiles, payload, dropTarget, getText) {
    if (!payload || !dropTarget) return [];
    var destDir = dropTarget.kind === 'root' ? '' : String(dropTarget.folderPath || '');
    var moves = [];
    getText = getText || function () { return ''; };

    if (payload.kind === 'file') {
      var file = null;
      for (var i = 0; i < existingFiles.length; i++) {
        if (existingFiles[i].id === payload.fileId) { file = existingFiles[i]; break; }
      }
      if (!file) return [];
      var base = baseName(file.name);
      var to = joinPath(destDir, base);
      if (to === file.name) return [];
      moves.push({ id: file.id, from: file.name, to: to, text: getText(file.id) });
      return moves;
    }

    if (payload.kind === 'files') {
      var ids = payload.fileIds || [];
      var destNames = {};
      for (var fi = 0; fi < ids.length; fi++) {
        var fileM = null;
        for (var im = 0; im < existingFiles.length; im++) {
          if (existingFiles[im].id === ids[fi]) { fileM = existingFiles[im]; break; }
        }
        if (!fileM) continue;
        var baseM = baseName(fileM.name);
        var toM = joinPath(destDir, baseM);
        if (destNames[toM]) return [];
        destNames[toM] = true;
        if (toM === fileM.name) continue;
        moves.push({ id: fileM.id, from: fileM.name, to: toM, text: getText(fileM.id) });
      }
      return moves;
    }

    if (payload.kind === 'selection') {
      var selFileIds = payload.fileIds || [];
      var selFolderPaths = payload.folderPaths || [];
      var selDestNames = {};
      for (var sfi = 0; sfi < selFileIds.length; sfi++) {
        var fileS = null;
        for (var si = 0; si < existingFiles.length; si++) {
          if (existingFiles[si].id === selFileIds[sfi]) { fileS = existingFiles[si]; break; }
        }
        if (!fileS) continue;
        var baseS = baseName(fileS.name);
        var toS = joinPath(destDir, baseS);
        if (selDestNames[toS]) return [];
        selDestNames[toS] = true;
        if (toS === fileS.name) continue;
        moves.push({ id: fileS.id, from: fileS.name, to: toS, text: getText(fileS.id) });
      }
      for (var sfo = 0; sfo < selFolderPaths.length; sfo++) {
        var prefixS = String(selFolderPaths[sfo] || '');
        if (!prefixS) continue;
        var folderNameS = baseName(prefixS);
        var underS = filesUnderPrefix(existingFiles, prefixS);
        for (var sj = 0; sj < underS.length; sj++) {
          var fS = underS[sj];
          var relS = fS.name.slice(prefixS.length + 1);
          var targetS = joinPath(joinPath(destDir, folderNameS), relS);
          if (selDestNames[targetS]) return [];
          selDestNames[targetS] = true;
          if (targetS === fS.name) continue;
          moves.push({ id: fS.id, from: fS.name, to: targetS, text: getText(fS.id) });
        }
      }
      return moves;
    }

    if (payload.kind === 'folder') {
      var prefix = String(payload.folderPath || '');
      if (!prefix) return [];
      var folderName = baseName(prefix);
      var under = filesUnderPrefix(existingFiles, prefix);
      for (var j = 0; j < under.length; j++) {
        var f = under[j];
        var rel = f.name.slice(prefix.length + 1);
        var target = joinPath(joinPath(destDir, folderName), rel);
        if (target === f.name) continue;
        moves.push({ id: f.id, from: f.name, to: target, text: getText(f.id) });
      }
    }
    return moves;
  }

  function canDropMove(payload, dropTarget, existingFiles) {
    if (!payload || !dropTarget) return false;
    if (payload.kind === 'folder') {
      var prefix = payload.folderPath;
      if (dropTarget.kind === 'folder') {
        if (prefix === dropTarget.folderPath) return false;
        if (isDescendantPath(prefix, dropTarget.folderPath)) return false;
      }
      var moves = computeMoveTargets(existingFiles, payload, dropTarget, function () { return ''; });
      return moves.length > 0;
    }
    if (payload.kind === 'file') {
      var movesF = computeMoveTargets(existingFiles, payload, dropTarget, function () { return ''; });
      return movesF.length > 0;
    }
    if (payload.kind === 'files') {
      var ids = payload.fileIds || [];
      var parent = null;
      for (var ci = 0; ci < ids.length; ci++) {
        var fileC = null;
        for (var cj = 0; cj < existingFiles.length; cj++) {
          if (existingFiles[cj].id === ids[ci]) { fileC = existingFiles[cj]; break; }
        }
        if (!fileC) return false;
        var pC = parentDir(fileC.name);
        if (parent === null) parent = pC;
        else if (parent !== pC) return false;
      }
      var movesFs = computeMoveTargets(existingFiles, payload, dropTarget, function () { return ''; });
      return movesFs.length > 0;
    }
    if (payload.kind === 'selection') {
      var selFolders = payload.folderPaths || [];
      for (var sfi = 0; sfi < selFolders.length; sfi++) {
        var prefixSel = selFolders[sfi];
        if (dropTarget.kind === 'folder') {
          if (prefixSel === dropTarget.folderPath) return false;
          if (isDescendantPath(prefixSel, dropTarget.folderPath)) return false;
        }
      }
      var movesSel = computeMoveTargets(existingFiles, payload, dropTarget, function () { return ''; });
      return movesSel.length > 0;
    }
    return false;
  }

  function detectMoveConflicts(existingFiles, moves) {
    var sourceIds = {};
    for (var i = 0; i < moves.length; i++) sourceIds[moves[i].id] = true;
    var remaining = existingFiles.filter(function (f) { return !sourceIds[f.id]; });
    var incoming = moves.map(function (m) {
      return { name: m.to, text: m.text, moveId: m.id, from: m.from };
    });
    var conflicts = detectUploadConflicts(remaining, incoming);
    for (var c = 0; c < conflicts.length; c++) {
      var conf = conflicts[c];
      if (conf.kind === 'file' && conf.entry) {
        for (var k = 0; k < incoming.length; k++) {
          if (incoming[k].name === conf.entry.name) {
            conf.moveId = incoming[k].moveId;
            conf.from = incoming[k].from;
            break;
          }
        }
      } else if (conf.kind === 'folder') {
        conf.moves = moves.filter(function (m) {
          for (var x = 0; x < conf.incoming.length; x++) {
            if (conf.incoming[x].moveId === m.id) return true;
          }
          return false;
        });
      }
    }
    return conflicts;
  }

  function applyMoveResolutions(existingFiles, moves, conflicts, resolutions) {
    if (resolutions === null) return null;

    var skipIds = {};
    var renames = {};
    var replaces = [];
    var replaceFolder = [];

    for (var i = 0; i < conflicts.length; i++) {
      var c = conflicts[i];
      var r = resolutions[i];
      if (!r || r.action === 'skip') {
        if (c.kind === 'folder' && c.moves) {
          for (var s = 0; s < c.moves.length; s++) skipIds[c.moves[s].id] = true;
        } else if (c.moveId) {
          skipIds[c.moveId] = true;
        }
        continue;
      }
      if (r.action === 'replace') {
        if (c.kind === 'folder') {
          var related = c.moves || moves.filter(function (m) {
            return m.from.indexOf(c.path + '/') === 0 || m.from === c.path;
          });
          var folderRenames = [];
          var deleteIds = [];
          var moveIdSet = {};
          for (var fr0 = 0; fr0 < related.length; fr0++) moveIdSet[related[fr0].id] = true;
          for (var d = 0; d < existingFiles.length; d++) {
            var nm = existingFiles[d].name;
            if ((nm === c.path || nm.indexOf(c.path + '/') === 0) && !moveIdSet[existingFiles[d].id]) {
              deleteIds.push(existingFiles[d].id);
            }
          }
          for (var fr = 0; fr < related.length; fr++) {
            if (!skipIds[related[fr].id]) folderRenames.push({ id: related[fr].id, to: related[fr].to });
            skipIds[related[fr].id] = true;
          }
          replaceFolder.push({ prefix: c.path, deleteIds: deleteIds, renames: folderRenames });
        } else if (c.moveId) {
          var targetFile = null;
          for (var t = 0; t < existingFiles.length; t++) {
            if (existingFiles[t].name === c.path) { targetFile = existingFiles[t]; break; }
          }
          if (targetFile) {
            replaces.push({
              targetId: targetFile.id,
              text: c.entry.text,
              deleteId: c.moveId,
            });
          }
          skipIds[c.moveId] = true;
        }
        continue;
      }
      if (r.action === 'rename') {
        var newPath = r.newPath || c.suggestedPath;
        if (c.kind === 'folder') {
          var rel = c.moves || moves.filter(function (m) { return m.from.indexOf(c.path + '/') === 0; });
          for (var rn = 0; rn < rel.length; rn++) {
            renames[rel[rn].id] = newPath + rel[rn].to.slice(c.path.length);
          }
        } else if (c.moveId) {
          renames[c.moveId] = newPath;
        }
      }
    }

    var plan = { renames: [], replaces: [], replaceFolder: [] };

    for (var m = 0; m < moves.length; m++) {
      var move = moves[m];
      if (skipIds[move.id]) continue;
      if (Object.prototype.hasOwnProperty.call(renames, move.id)) {
        plan.renames.push({ id: move.id, to: renames[move.id] });
      } else {
        var handled = false;
        for (var rf = 0; rf < replaceFolder.length; rf++) {
          for (var rr = 0; rr < replaceFolder[rf].renames.length; rr++) {
            if (replaceFolder[rf].renames[rr].id === move.id) { handled = true; break; }
          }
        }
        for (var rp = 0; rp < replaces.length; rp++) {
          if (replaces[rp].deleteId === move.id) { handled = true; break; }
        }
        if (!handled) plan.renames.push({ id: move.id, to: move.to });
      }
    }

    plan.replaces = replaces;
    plan.replaceFolder = replaceFolder;
    return plan;
  }

  function detectUploadConflicts(existingFiles, incomingEntries) {
    var existingPaths = existingFiles.map(function (f) { return f.name; });
    var existingSet = {};
    var pathToId = {};
    for (var i = 0; i < existingFiles.length; i++) {
      existingSet[existingFiles[i].name] = true;
      pathToId[existingFiles[i].name] = existingFiles[i].id;
    }

    var handled = {};
    var conflicts = [];
    var folderCandidates = {};

    for (var j = 0; j < incomingEntries.length; j++) {
      var parts = incomingEntries[j].name.split('/');
      for (var k = 0; k < parts.length - 1; k++) {
        folderCandidates[parts.slice(0, k + 1).join('/')] = true;
      }
    }

    for (var folderPath in folderCandidates) {
      if (!Object.prototype.hasOwnProperty.call(folderCandidates, folderPath)) continue;
      var incomingUnder = incomingEntries.filter(function (e) {
        return e.name.indexOf(folderPath + '/') === 0;
      });
      var existingUnder = pathsUnderPrefix(existingPaths, folderPath);
      if (incomingUnder.length < 2 || existingUnder.length === 0) continue;
      var hasCollision = incomingUnder.some(function (e) { return existingSet[e.name]; });
      if (!hasCollision) continue;

      conflicts.push({
        kind: 'folder',
        path: folderPath,
        label: baseName(folderPath),
        incoming: incomingUnder,
        existingPaths: existingUnder,
        suggestedPath: suggestNewPath(
          folderPath,
          folderPathsFromFilePaths(existingPaths),
        ),
      });
      for (var u = 0; u < incomingUnder.length; u++) handled[incomingUnder[u].name] = true;
    }

    for (var m = 0; m < incomingEntries.length; m++) {
      var entry = incomingEntries[m];
      if (handled[entry.name]) continue;
      if (existingSet[entry.name]) {
        conflicts.push({
          kind: 'file',
          path: entry.name,
          label: baseName(entry.name),
          entry: entry,
          existingId: pathToId[entry.name],
          suggestedPath: suggestNewPath(entry.name, existingPaths),
        });
      }
    }

    return conflicts;
  }

  function applyResolutions(existingFiles, incomingEntries, conflicts, resolutions) {
    if (resolutions === null) return null;

    var skipPaths = {};
    var replaceFiles = {};
    var replaceFolders = [];
    var renames = {};

    for (var i = 0; i < conflicts.length; i++) {
      var c = conflicts[i];
      var r = resolutions[i];
      if (!r || r.action === 'skip') {
        if (c.kind === 'folder') {
          for (var a = 0; a < c.incoming.length; a++) skipPaths[c.incoming[a].name] = true;
        } else {
          skipPaths[c.path] = true;
        }
        continue;
      }
      if (r.action === 'replace') {
        if (c.kind === 'folder') {
          replaceFolders.push({ prefix: c.path, entries: c.incoming.slice() });
          for (var b = 0; b < c.incoming.length; b++) skipPaths[c.incoming[b].name] = true;
        } else {
          replaceFiles[c.path] = c.entry.text;
          skipPaths[c.path] = true;
        }
        continue;
      }
      if (r.action === 'rename') {
        var newPath = r.newPath || c.suggestedPath;
        if (c.kind === 'folder') {
          for (var d = 0; d < c.incoming.length; d++) {
            var src = c.incoming[d];
            renames[src.name] = newPath + src.name.slice(c.path.length);
          }
        } else {
          renames[c.path] = newPath;
        }
      }
    }

    var pathToFile = {};
    for (var f = 0; f < existingFiles.length; f++) pathToFile[existingFiles[f].name] = existingFiles[f];

    var plan = { create: [], replace: [], replaceFolder: [] };

    for (var path in replaceFiles) {
      if (!Object.prototype.hasOwnProperty.call(replaceFiles, path)) continue;
      var file = pathToFile[path];
      if (file) plan.replace.push({ id: file.id, name: path, text: replaceFiles[path] });
    }

    for (var rf = 0; rf < replaceFolders.length; rf++) {
      var folder = replaceFolders[rf];
      var deleteIds = [];
      for (var g = 0; g < existingFiles.length; g++) {
        var nm = existingFiles[g].name;
        if (nm === folder.prefix || nm.indexOf(folder.prefix + '/') === 0) deleteIds.push(existingFiles[g].id);
      }
      plan.replaceFolder.push({
        prefix: folder.prefix,
        deleteIds: deleteIds,
        entries: folder.entries.map(function (e) { return { name: e.name, text: e.text }; }),
      });
    }

    for (var h = 0; h < incomingEntries.length; h++) {
      var ent = incomingEntries[h];
      if (skipPaths[ent.name]) continue;
      var targetName = Object.prototype.hasOwnProperty.call(renames, ent.name)
        ? renames[ent.name]
        : ent.name;
      if (pathToFile[targetName]) continue;
      plan.create.push({ name: targetName, text: ent.text });
    }

    return plan;
  }

  global.BelJarNameConflicts = {
    parentDir: parentDir,
    baseName: baseName,
    joinPath: joinPath,
    nameConflict: nameConflict,
    suggestNewPath: suggestNewPath,
    splitNumberedStem: splitNumberedStem,
    folderPathsFromFilePaths: folderPathsFromFilePaths,
    occupiedFolderPaths: occupiedFolderPaths,
    isDescendantPath: isDescendantPath,
    filesUnderPrefix: filesUnderPrefix,
    detectUploadConflicts: detectUploadConflicts,
    applyResolutions: applyResolutions,
    computeMoveTargets: computeMoveTargets,
    canDropMove: canDropMove,
    detectMoveConflicts: detectMoveConflicts,
    applyMoveResolutions: applyMoveResolutions,
  };
})(typeof window !== 'undefined' ? window : globalThis);
