/**
 * Project file registry + cfg rewrite — injected into Persist.
 */
export function create(deps) {
    var backendLoad = deps.backendLoad;
    var backendSave = deps.backendSave;
    var backendRemove = deps.backendRemove;
    var tryParse = deps.tryParse;
    var projKey = deps.projKey;
    var stateKeyFor = deps.stateKeyFor;
    var defaultBackend = deps.defaultBackend;
    var readState = deps.readState;
    var emptyState = deps.emptyState;
    var DEFAULT_DOCUMENT_ID = deps.DEFAULT_DOCUMENT_ID;
    var dirOf = deps.dirOf;
    var expandAliasesForStorage = deps.expandAliasesForStorage;
    var fileNameForId = deps.fileNameForId;
    var readStoredCfgAutoSync = deps.readStoredCfgAutoSync;
    var writeOpenFileIds = deps.writeOpenFileIds;
    var closeOpenFile = deps.closeOpenFile;
    var writeActiveCfgByDir = deps.writeActiveCfgByDir;
    var setActiveCfgForDir = deps.setActiveCfgForDir;
    var removeActiveCfgForDir = deps.removeActiveCfgForDir;
    var readActiveCfgByDir = deps.readActiveCfgByDir;
    var normalizeActiveCfgList = deps.normalizeActiveCfgList;
    var setProjectName = deps.setProjectName;

    // ── Project file registry (scoped to the active project) ──────────────────

    function readProjectFiles() {
      var raw = tryParse(backendLoad(projKey('files')));
      if (Array.isArray(raw)) return raw;
      return null;
    }

    function writeProjectFiles(files) {
      backendSave(projKey('files'), JSON.stringify(files));
    }

    function readEmptyFolders() {
      var raw = tryParse(backendLoad(projKey('empty-folders')));
      if (!Array.isArray(raw)) return [];
      return raw.filter(function (p) { return typeof p === 'string' && p; });
    }

    function writeEmptyFolders(paths) {
      backendSave(projKey('empty-folders'), JSON.stringify(paths || []));
    }

    function listEmptyFolders() {
      return readEmptyFolders();
    }

    function addEmptyFolder(path) {
      var p = String(path || '').trim();
      if (!p) return;
      var list = readEmptyFolders();
      if (list.indexOf(p) !== -1) return;
      list.push(p);
      list.sort();
      writeEmptyFolders(list);
    }

    function removeEmptyFolder(path) {
      var p = String(path || '');
      var list = readEmptyFolders();
      var next = list.filter(function (x) { return x !== p; });
      if (next.length === list.length) return;
      writeEmptyFolders(next);
    }

    function clearEmptyFolders() {
      writeEmptyFolders([]);
    }

    function pruneEmptyFoldersUnder(prefix) {
      var p = String(prefix || '').trim();
      if (!p) {
        clearEmptyFolders();
        return;
      }
      var list = readEmptyFolders();
      var kept = list.filter(function (x) {
        return x !== p && x.indexOf(p + '/') !== 0;
      });
      if (kept.length !== list.length) writeEmptyFolders(kept);
    }

    function renameEmptyFolderPrefix(from, to) {
      var list = readEmptyFolders();
      var changed = false;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (p === from || p.indexOf(from + '/') === 0) {
          list[i] = to ? to + p.slice(from.length) : p.slice(from.length + 1);
          changed = true;
        }
      }
      if (changed) {
        list = list.filter(function (x) { return x; });
        list.sort();
        writeEmptyFolders(list);
      }
    }

    function pruneEmptyFoldersForFile(filePath) {
      var name = String(filePath || '');
      if (!name) return;
      var list = readEmptyFolders();
      var next = list.filter(function (ef) {
        return name !== ef && name.indexOf(ef + '/') !== 0;
      });
      if (next.length !== list.length) writeEmptyFolders(next);
    }

    function folderSubtreeOccupied(folderPath, files, emptyFolders) {
      if (!folderPath) return files.length > 0 || emptyFolders.length > 0;
      var prefix = folderPath + '/';
      for (var i = 0; i < files.length; i++) {
        if (files[i].name.indexOf(prefix) === 0) return true;
      }
      for (var j = 0; j < emptyFolders.length; j++) {
        if (emptyFolders[j].indexOf(prefix) === 0) return true;
      }
      return false;
    }

    function preserveEmptyFoldersAfterPath(oldFilePath, skipPrefixes) {
      var name = String(oldFilePath || '');
      if (!name || name.indexOf('/') === -1) return;
      var parts = name.split('/');
      parts.pop();
      var files = ensureProject();
      var empty = readEmptyFolders();
      for (var i = parts.length - 1; i >= 0; i--) {
        var fp = parts.slice(0, i + 1).join('/');
        if (skipPrefixes && isPrefixUnderAny(fp, skipPrefixes)) continue;
        if (!folderSubtreeOccupied(fp, files, empty)) {
          addEmptyFolder(fp);
          empty = readEmptyFolders();
        }
      }
    }

    function isPrefixUnderAny(path, prefixes) {
      for (var p in prefixes) {
        if (path === p || path.indexOf(p + '/') === 0) return true;
      }
      return false;
    }

    function relocatedPrefixTarget(prefix, moves, files) {
      var ps = prefix + '/';
      for (var i = 0; i < files.length; i++) {
        var n = files[i].name;
        if (n === prefix || n.indexOf(ps) === 0) return null;
      }
      var related = [];
      for (var j = 0; j < moves.length; j++) {
        if (moves[j].from.indexOf(ps) === 0) related.push(moves[j]);
      }
      if (!related.length) return null;
      var newPrefix = null;
      for (var k = 0; k < related.length; k++) {
        var from = related[k].from;
        var to = related[k].to;
        var rel = from.slice(prefix.length + 1);
        var np = rel ? to.slice(0, to.length - rel.length - 1) : to;
        if (newPrefix === null) newPrefix = np;
        else if (newPrefix !== np) return null;
        if (to !== (rel ? np + '/' + rel : np)) return null;
      }
      return newPrefix;
    }

    function inferRelocatedFolderPrefixes(moves, files) {
      var candidates = {};
      for (var i = 0; i < moves.length; i++) {
        var from = moves[i].from;
        if (!from || from.indexOf('/') === -1) continue;
        var parts = from.split('/');
        parts.pop();
        var acc = '';
        for (var p = 0; p < parts.length; p++) {
          acc = acc ? acc + '/' + parts[p] : parts[p];
          candidates[acc] = true;
        }
      }
      var out = {};
      for (var prefix in candidates) {
        var target = relocatedPrefixTarget(prefix, moves, files);
        if (target != null) out[prefix] = target;
      }
      return out;
    }

    function preserveEmptyFoldersAfterMoves(moves) {
      if (!moves || !moves.length) return;
      var files = ensureProject();
      var reloc = inferRelocatedFolderPrefixes(moves, files);
      for (var oldP in reloc) {
        renameEmptyFolderPrefix(oldP, reloc[oldP]);
        removeEmptyFolder(oldP);
      }
      var skip = reloc;
      var seen = {};
      for (var i = 0; i < moves.length; i++) {
        var from = moves[i].from;
        if (!from || seen[from]) continue;
        seen[from] = true;
        preserveEmptyFoldersAfterPath(from, skip);
      }
    }

    function ensureProject() {
      var files = readProjectFiles();
      if (files !== null) return files;
      // First run only — an explicit empty registry ([]) is kept empty.
      var defaultFile = { id: DEFAULT_DOCUMENT_ID, name: 'main.bel' };
      files = [defaultFile];
      writeProjectFiles(files);
      backendSave(projKey('active-file'), DEFAULT_DOCUMENT_ID);
      return files;
    }

    function listFiles() {
      return ensureProject();
    }

    function getActiveFileId() {
      var files = listFiles();
      if (!files.length) return null;
      var id = backendLoad(projKey('active-file'));
      if (id && files.some(function (f) { return f.id === id; })) return id;
      return files[0].id;
    }

    function setActiveFileId(id) {
      backendSave(projKey('active-file'), id);
    }

    function uniqueFileId(name, used) {
      var id = 'workspace://' + (name || 'untitled.bel');
      var base = id;
      var counter = 1;
      while (used[id]) {
        var dot = base.lastIndexOf('.');
        id = dot > 10
          ? base.slice(0, dot) + '-' + counter + base.slice(dot)
          : base + '-' + counter;
        counter++;
      }
      used[id] = true;
      return id;
    }

    // Wipe the project and load a fresh file set (folder import). entries:
    // [{ name, text }]. Returns { files, activeId }.
    function replaceProject(entries, options) {
      options = options || {};
      var old = readProjectFiles() || [];
      for (var i = 0; i < old.length; i++) {
        backendRemove(stateKeyFor(old[i].id));
      }
      var used = {};
      var files = [];
      var list = entries || [];
      for (var j = 0; j < list.length; j++) {
        var ent = list[j];
        var name = String(ent.name || 'untitled.bel');
        var id = uniqueFileId(name, used);
        files.push({ id: id, name: name });
        var state = emptyState(id);
        state.editor.text = expandAliasesForStorage(ent.text, name);
        state.meta.updatedAt = Date.now();
        state.meta.revision = 1;
        backendSave(stateKeyFor(id), JSON.stringify(state));
      }
      writeProjectFiles(files);
      var activeId = options.activeId;
      if (!activeId || !files.some(function (f) { return f.id === activeId; })) {
        activeId = files.length ? files[0].id : null;
      }
      if (activeId) backendSave(projKey('active-file'), activeId);
      writeOpenFileIds(options.openIds && options.openIds.length
        ? options.openIds.filter(function (id) { return files.some(function (f) { return f.id === id; }); })
        : (activeId ? [activeId] : []));
      if (options.projectName) setProjectName(options.projectName);
      if (options.activeCfgByDir && typeof options.activeCfgByDir === 'object') {
        writeActiveCfgByDir(options.activeCfgByDir);
      } else if (options.defaultCfgPath) {
        setActiveCfgForDir(dirOf(options.defaultCfgPath), options.defaultCfgPath);
      } else {
        writeActiveCfgByDir({});
      }
      writeEmptyFolders([]);
      return { files: files, activeId: activeId };
    }

    function createFile(name) {
      var files = ensureProject();
      var used = {};
      for (var u = 0; u < files.length; u++) used[files[u].id] = true;
      var fileName = name || 'untitled.bel';
      var id = uniqueFileId(fileName, used);
      files.push({ id: id, name: fileName });
      writeProjectFiles(files);
      pruneEmptyFoldersForFile(fileName);
      return id;
    }

    // A cfg lists entries relative to its OWN directory. Reverse that: the entry
    // text for `fullPath` within a cfg living in `cfgDir`, or null when fullPath
    // is outside that cfg's directory subtree (so it cannot be a member).
    function relToCfgDir(cfgDir, fullPath) {
      if (!cfgDir) return fullPath;
      if (fullPath === cfgDir) return '';
      if (fullPath.indexOf(cfgDir + '/') === 0) return fullPath.slice(cfgDir.length + 1);
      return null;
    }

    function resolveCfgEntryPath(cfgDir, entry) {
      if (!cfgDir) return entry;
      if (!entry) return cfgDir;
      return cfgDir + '/' + entry;
    }

    function isCfgEntryToken(text) {
      var PS = typeof ProjectSource !== 'undefined' ? ProjectSource : null;
      if (PS && typeof PS.isCfgEntryToken === 'function') return PS.isCfgEntryToken(text);
      var t = String(text || '').trim();
      if (!t || t.charAt(0) === '%') return false;
      var low = t.toLowerCase();
      if (low.endsWith('.cfg') || low.endsWith('.elf') || low.endsWith('.bel')) return true;
      var base = t.indexOf('/') === -1 ? t : t.slice(t.lastIndexOf('/') + 1);
      return base.indexOf('.') === -1;
    }

    function isCfgEntryLine(text) {
      var t = String(text || '').trim();
      return t && t.charAt(0) !== '%' && isCfgEntryToken(t);
    }

    // Prefer the live editor buffer when the cfg tab is active — storage can lag
    // autosave and would otherwise miss entries the user just typed in.
    function cfgTextForRewrite(fileId) {
      var g = typeof window !== 'undefined' ? window : null;
      if (g) {
        var activeId = getActiveFileId();
        var ed = g.CurrentEditor;
        if (fileId === activeId && ed && typeof ed.getValue === 'function') {
          return String(ed.getValue() ?? '');
        }
      }
      return getFileText(fileId);
    }

    function notifyCfgRewritten(fileIds) {
      if (!fileIds.length) return;
      var g = typeof window !== 'undefined' ? window : null;
      if (g && typeof g.dispatchEvent === 'function') {
        g.dispatchEvent(new CustomEvent('beljar:cfg-rewritten', { detail: { fileIds: fileIds } }));
      }
    }

    // Rewrite a single cfg body so the entry resolving to `oldName` follows the
    // file op: same-folder rename → rewrite the entry; folder move → leave it
    // (dangling until the user re-points); deleted (`newName` null) → removed.
    // Comments, blank lines, ordering, and indentation are preserved; returns
    // null when nothing matched.
    function rewriteCfgBody(text, cfgDir, oldName, newName) {
      var lines = String(text == null ? '' : text).split('\n');
      var out = [];
      var changed = false;
      var oldDir = dirOf(oldName);
      var newDir = newName != null ? dirOf(newName) : null;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var t = line.trim();
        var low = t.toLowerCase();
        var isEntry = isCfgEntryLine(t);
        if (!isEntry) { out.push(line); continue; }
        var resolved = resolveCfgEntryPath(cfgDir, t);
        if (resolved !== oldName) { out.push(line); continue; }
        if (newName == null) { changed = true; continue; }
        if (oldDir !== newDir) { out.push(line); continue; }
        var rel = relToCfgDir(cfgDir, newName);
        if (rel == null || rel === '') { out.push(line); continue; }
        changed = true;
        out.push(line.slice(0, line.indexOf(t)) + rel);
      }
      return changed ? out.join('\n') : null;
    }

    function restoreDeletedFile(id, name, text) {
      var files = ensureProject();
      for (var i = 0; i < files.length; i++) {
        if (files[i].id === id) return false;
      }
      files.push({ id: id, name: name });
      writeProjectFiles(files);
      var state = emptyState(id);
      state.editor.text = expandAliasesForStorage(text, name);
      state.meta.updatedAt = Date.now();
      state.meta.revision = 1;
      backendSave(stateKeyFor(id), JSON.stringify(state));
      pruneEmptyFoldersForFile(name);
      return true;
    }

    function deleteFile(id) {
      var files = ensureProject();
      var idx = -1;
      for (var i = 0; i < files.length; i++) {
        if (files[i].id === id) { idx = i; break; }
      }
      if (idx === -1) return null;
      var deletedName = files[idx].name;
      if (/\.cfg$/i.test(deletedName)) {
        removeActiveCfgForDir(dirOf(deletedName), deletedName);
      }
      files.splice(idx, 1);
      writeProjectFiles(files);
      // Deleting a file drops its entry from any same-directory .cfg that lists it
      // (a within-suite op the user expects reflected). Runs after the splice so a
      // deleted .cfg is never asked to rewrite itself.
      rewriteCfgsForOp(deletedName, null);
      closeOpenFile(id);
      // Delete the stored state.
      defaultBackend.removeSync(stateKeyFor(id));
      preserveEmptyFoldersAfterPath(deletedName);
      if (!files.length) {
        backendRemove(projKey('active-file'));
        writeOpenFileIds([]);
      }
      // Return the id of the file to switch to (previous, next, or null).
      return files.length ? files[Math.max(0, idx - 1)].id : null;
    }

    // When auto-sync is on, rewrite every .cfg that lists `oldName`: same-folder
    // rename updates the entry; delete removes it; folder move leaves it dangling.
    function rewriteCfgsForOp(oldName, newName) {
      if (!readStoredCfgAutoSync()) return [];
      var files = ensureProject();
      var updatedIds = [];
      for (var i = 0; i < files.length; i++) {
        var fn = files[i].name;
        if (!/\.cfg$/i.test(fn)) continue;
        var cfgDir = dirOf(fn);
        var text = cfgTextForRewrite(files[i].id);
        if (!cfgListsEntry(text, cfgDir, oldName)) continue;
        var updated = rewriteCfgBody(text, cfgDir, oldName, newName);
        if (updated != null) {
          setFileText(files[i].id, updated);
          updatedIds.push(files[i].id);
        }
      }
      notifyCfgRewritten(updatedIds);
      return updatedIds;
    }
    function renameFile(id, newName) {
      var files = ensureProject();
      for (var i = 0; i < files.length; i++) {
        if (files[i].id === id) {
          var oldName = files[i].name;
          files[i].name = newName;
          writeProjectFiles(files);
          rewriteCfgsForOp(oldName, newName);
          var map = readActiveCfgByDir();
          var changed = false;
          for (var k in map) {
            if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
            var list = normalizeActiveCfgList(map[k]);
            for (var j = 0; j < list.length; j++) {
              if (list[j] === oldName) {
                list[j] = newName;
                changed = true;
              }
            }
            if (list.length) map[k] = list;
          }
          if (changed) writeActiveCfgByDir(map);
          pruneEmptyFoldersForFile(newName);
          if (oldName !== newName) preserveEmptyFoldersAfterPath(oldName);
          return;
        }
      }
    }

    function cfgFileByPath(cfgPath) {
      var files = ensureProject();
      for (var i = 0; i < files.length; i++) {
        if (files[i].name === cfgPath) return files[i];
      }
      return null;
    }

    function cfgListsEntry(text, cfgDir, fileName) {
      var lines = String(text == null ? '' : text).split('\n');
      for (var i = 0; i < lines.length; i++) {
        var t = lines[i].trim();
        if (!isCfgEntryToken(t)) continue;
        if (resolveCfgEntryPath(cfgDir, t) === fileName) return true;
      }
      return false;
    }

    // Append `fileName` to a suite's .cfg (load order) — the authoring counterpart
    // to hand-editing the cfg. Returns false when the file is already listed or
    // lives outside the cfg's directory subtree (so it cannot be a member).
    function addEntryToCfg(cfgPath, fileName) {
      var cfg = cfgFileByPath(cfgPath);
      if (!cfg) return false;
      var dir = dirOf(cfgPath);
      var rel = relToCfgDir(dir, fileName);
      if (rel == null || rel === '') return false;
      var text = String(getFileText(cfg.id) || '');
      if (cfgListsEntry(text, dir, fileName)) return false;
      var body = text.replace(/\s*$/, '');
      setFileText(cfg.id, (body ? body + '\n' : '') + rel + '\n');
      return true;
    }

    // Prepend `fileName` to a suite's .cfg (first load-order slot).
    function prependEntryToCfg(cfgPath, fileName) {
      var cfg = cfgFileByPath(cfgPath);
      if (!cfg) return false;
      var dir = dirOf(cfgPath);
      var rel = relToCfgDir(dir, fileName);
      if (rel == null || rel === '') return false;
      var text = String(getFileText(cfg.id) || '');
      if (cfgListsEntry(text, dir, fileName)) return false;
      var lines = text.split('\n');
      var firstEntry = -1;
      for (var i = 0; i < lines.length; i++) {
        var t = lines[i].trim();
        if (isCfgEntryLine(t)) {
          firstEntry = i;
          break;
        }
      }
      if (firstEntry === -1) {
        var body = text.replace(/\s*$/, '');
        setFileText(cfg.id, (body ? body + '\n' : '') + rel + '\n');
        return true;
      }
      var before = lines.slice(0, firstEntry).join('\n');
      var after = lines.slice(firstEntry).join('\n');
      var prefix = before.length ? before + '\n' : '';
      setFileText(cfg.id, prefix + rel + '\n' + after);
      return true;
    }

    // Drop `fileName` from a suite's .cfg (preserving comments/order). Returns
    // false when the entry was not present.
    function removeEntryFromCfg(cfgPath, fileName) {
      var cfg = cfgFileByPath(cfgPath);
      if (!cfg) return false;
      var updated = rewriteCfgBody(getFileText(cfg.id), dirOf(cfgPath), fileName, null);
      if (updated == null) return false;
      setFileText(cfg.id, updated);
      return true;
    }

    // Reorder a suite member by `delta` (-1 up / +1 down) within its .cfg — the
    // load order is what governs cross-file visibility, so reordering is a primary
    // authoring action. Swaps the target's ENTRY line with the adjacent entry line
    // (comments/blank lines hold their positions). Returns false at a boundary.
    function moveEntryInCfg(cfgPath, fileName, delta) {
      var cfg = cfgFileByPath(cfgPath);
      if (!cfg) return false;
      var dir = dirOf(cfgPath);
      var lines = String(getFileText(cfg.id) || '').split('\n');
      var entryLineIdx = [];
      var targetAt = -1;
      for (var i = 0; i < lines.length; i++) {
        var t = lines[i].trim();
        var low = t.toLowerCase();
        var isEntry = isCfgEntryLine(t);
        if (!isEntry) continue;
        if ((dir ? dir + '/' + t : t) === fileName) targetAt = entryLineIdx.length;
        entryLineIdx.push(i);
      }
      if (targetAt === -1) return false;
      var neighbor = targetAt + (delta < 0 ? -1 : 1);
      if (neighbor < 0 || neighbor >= entryLineIdx.length) return false;
      var a = entryLineIdx[targetAt];
      var b = entryLineIdx[neighbor];
      var tmp = lines[a]; lines[a] = lines[b]; lines[b] = tmp;
      setFileText(cfg.id, lines.join('\n'));
      return true;
    }

    function getFileById(id) {
      var files = listFiles();
      for (var i = 0; i < files.length; i++) {
        if (files[i].id === id) return files[i];
      }
      return null;
    }

    function moveFile(id, delta) {
      var files = ensureProject();
      var idx = -1;
      for (var i = 0; i < files.length; i++) {
        if (files[i].id === id) { idx = i; break; }
      }
      if (idx === -1) return false;
      var to = Math.max(0, Math.min(files.length - 1, idx + (delta || 0)));
      if (to === idx) return false;
      var entry = files.splice(idx, 1)[0];
      files.splice(to, 0, entry);
      writeProjectFiles(files);
      return true;
    }

    // Read a file's stored editor text without constructing a persist instance.
    // NOTE: for the ACTIVE file the live buffer may be ahead of storage (debounced
    // save) — callers should prefer the live editor value for that one.
    // getFileText is called for EVERY development member on every explorer/tab
    // health refresh (potentially O(files²) per navigation). readState JSON-parses
    // the whole per-file blob — including the large semantic checkpoint — which
    // dominated navigation cost. Cache the extracted text keyed by the raw stored
    // string: unchanged files (the common case during navigation) skip the parse
    // entirely, and any write changes the stored string so the entry auto-misses.
    var fileTextCache = new Map(); // id -> { raw, text }

    function getFileText(id) {
      var raw = defaultBackend.loadSync(stateKeyFor(id));
      var hit = fileTextCache.get(id);
      if (hit && hit.raw === raw) return hit.text;
      var state = readState(defaultBackend, id);
      var text = state && state.editor && typeof state.editor.text === 'string'
        ? state.editor.text
        : '';
      if (fileTextCache.size > 512) fileTextCache.clear();
      fileTextCache.set(id, { raw: raw, text: text });
      return text;
    }

    // Write a file's editor text directly (file import path). Preserves any
    // existing local/semantic state under the key.
    function setFileText(id, text) {
      var state = readState(defaultBackend, id);
      state.editor.text = expandAliasesForStorage(text, fileNameForId(id));
      state.meta.updatedAt = Date.now();
      state.meta.revision = (state.meta.revision || 0) + 1;
      backendSave(stateKeyFor(id), JSON.stringify(state));
      fileTextCache.delete(id);
      try {
        if (typeof BelEditor !== 'undefined'
          && typeof BelEditor.invalidateFileHealthAfterChange === 'function') {
          BelEditor.invalidateFileHealthAfterChange(id);
        }
      } catch (_) { /* editor not mounted */ }
    }

    return {
      readProjectFiles: readProjectFiles,
      writeProjectFiles: writeProjectFiles,
      readEmptyFolders: readEmptyFolders,
      writeEmptyFolders: writeEmptyFolders,
      listEmptyFolders: listEmptyFolders,
      addEmptyFolder: addEmptyFolder,
      removeEmptyFolder: removeEmptyFolder,
      clearEmptyFolders: clearEmptyFolders,
      pruneEmptyFoldersUnder: pruneEmptyFoldersUnder,
      renameEmptyFolderPrefix: renameEmptyFolderPrefix,
      pruneEmptyFoldersForFile: pruneEmptyFoldersForFile,
      folderSubtreeOccupied: folderSubtreeOccupied,
      preserveEmptyFoldersAfterPath: preserveEmptyFoldersAfterPath,
      isPrefixUnderAny: isPrefixUnderAny,
      relocatedPrefixTarget: relocatedPrefixTarget,
      inferRelocatedFolderPrefixes: inferRelocatedFolderPrefixes,
      preserveEmptyFoldersAfterMoves: preserveEmptyFoldersAfterMoves,
      ensureProject: ensureProject,
      listFiles: listFiles,
      getActiveFileId: getActiveFileId,
      setActiveFileId: setActiveFileId,
      uniqueFileId: uniqueFileId,
      replaceProject: replaceProject,
      createFile: createFile,
      relToCfgDir: relToCfgDir,
      resolveCfgEntryPath: resolveCfgEntryPath,
      isCfgEntryToken: isCfgEntryToken,
      isCfgEntryLine: isCfgEntryLine,
      cfgTextForRewrite: cfgTextForRewrite,
      notifyCfgRewritten: notifyCfgRewritten,
      rewriteCfgBody: rewriteCfgBody,
      restoreDeletedFile: restoreDeletedFile,
      deleteFile: deleteFile,
      rewriteCfgsForOp: rewriteCfgsForOp,
      renameFile: renameFile,
      cfgFileByPath: cfgFileByPath,
      cfgListsEntry: cfgListsEntry,
      addEntryToCfg: addEntryToCfg,
      prependEntryToCfg: prependEntryToCfg,
      removeEntryFromCfg: removeEntryFromCfg,
      moveEntryInCfg: moveEntryInCfg,
      getFileById: getFileById,
      moveFile: moveFile,
      getFileText: getFileText,
      setFileText: setFileText,
    };
  }
