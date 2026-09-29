/**
 * What the app does with a project's files (docs/PERSIST.md §4.2): create,
 * rename, move, delete, restore, import; empty folders; `.cfg` membership and
 * which cfg is active per directory; open tabs; greedy alias expansion on the
 * way in. `Persist`'s file API is this module. Storage is `work.mjs`'s business:
 * nothing here builds a key.
 */
import { DEFAULT_PROJECT_NAME } from './work.mjs';

export function create(deps) {
  var work = deps.work;
  var settings = deps.settings;

  function dirOf(name) {
    var i = String(name || '').lastIndexOf('/');
    return i === -1 ? '' : name.slice(0, i);
  }

  function notifyProjectTreeChanged(kind) {
    var g = typeof window !== 'undefined' ? window : null;
    if (g && typeof g.dispatchEvent === 'function') {
      g.dispatchEvent(new CustomEvent('beljar:project-tree-changed', { detail: { kind: kind } }));
    }
  }

  // ── the file list ─────────────────────────────────────────────────────────

  function listFiles() {
    return work.peekTree().files.map(function (f) { return { id: f.id, name: f.name }; });
  }

  function getFileById(id) {
    var files = work.peekTree().files;
    for (var i = 0; i < files.length; i++) {
      if (files[i].id === id) return { id: files[i].id, name: files[i].name };
    }
    return null;
  }

  function fileNameForId(id) {
    var f = getFileById(id);
    return f ? f.name : '';
  }

  function writeFiles(files) {
    work.updateTree(function (t) { t.files = files; });
  }

  // ── empty folders ─────────────────────────────────────────────────────────

  function readEmptyFolders() {
    return work.peekTree().folders.slice();
  }

  function writeEmptyFolders(paths) {
    work.updateTree(function (t) { t.folders = paths || []; });
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
    notifyProjectTreeChanged('folder-add');
  }

  function removeEmptyFolder(path) {
    var p = String(path || '');
    var list = readEmptyFolders();
    var next = list.filter(function (x) { return x !== p; });
    if (next.length === list.length) return;
    writeEmptyFolders(next);
    notifyProjectTreeChanged('folder-remove');
  }

  function clearEmptyFolders() {
    if (!readEmptyFolders().length) return;
    writeEmptyFolders([]);
    notifyProjectTreeChanged('folder-clear');
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
    if (kept.length !== list.length) {
      writeEmptyFolders(kept);
      notifyProjectTreeChanged('folder-prune');
    }
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
      notifyProjectTreeChanged('folder-rename');
    }
  }

  function pruneEmptyFoldersForFile(filePath) {
    var name = String(filePath || '');
    if (!name) return;
    var list = readEmptyFolders();
    var next = list.filter(function (ef) {
      return name !== ef && name.indexOf(ef + '/') !== 0;
    });
    if (next.length !== list.length) {
      writeEmptyFolders(next);
      notifyProjectTreeChanged('folder-prune');
    }
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
    var files = listFiles();
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
    var files = listFiles();
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

  // ── the session: active file and open tabs ────────────────────────────────
  // The tree lists EVERY file (explorer); the open list is the much smaller set
  // shown as tabs. A folder import of hundreds of files must not produce
  // hundreds of tabs.

  function getActiveFileId() {
    var files = work.peekTree().files;
    if (!files.length) return null;
    var id = work.peekSession().active;
    for (var i = 0; i < files.length; i++) {
      if (files[i].id === id) return id;
    }
    return files[0].id;
  }

  function setActiveFileId(id) {
    work.updateSession(function (s) { s.active = id || null; });
  }

  function getOpenFileIds() {
    var files = work.peekTree().files;
    if (!files.length) return [];
    var open = work.peekSession().open;
    if (open === null) {
      // Nothing recorded on this device yet (an import, or a project that
      // arrived by sync): open the active file.
      var active = getActiveFileId();
      return active ? [active] : [];
    }
    var valid = {};
    for (var i = 0; i < files.length; i++) valid[files[i].id] = true;
    return open.filter(function (id) { return valid[id]; });
  }

  function setOpenFileIds(ids) {
    work.updateSession(function (s) { s.open = (ids || []).slice(); });
  }

  function openFile(id) {
    var ids = getOpenFileIds();
    if (!getFileById(id)) return ids;
    if (ids.indexOf(id) === -1) {
      ids.push(id);
      setOpenFileIds(ids);
    }
    return ids;
  }

  // Close the TAB only; the file stays in the project.
  function closeOpenFile(id) {
    var ids = getOpenFileIds();
    var idx = ids.indexOf(id);
    if (idx === -1) return ids;
    ids.splice(idx, 1);
    setOpenFileIds(ids);
    return ids;
  }

  // ── the project ───────────────────────────────────────────────────────────

  function getProjectName() {
    var p = work.getProject();
    return p ? p.name : DEFAULT_PROJECT_NAME;
  }

  function setProjectName(name) {
    work.renameProject(work.projectId(), name);
  }

  // ── which .cfg is active in each directory ────────────────────────────────

  function normalizeActiveCfgList(val) {
    if (!val) return [];
    if (Array.isArray(val)) {
      var out = [];
      for (var i = 0; i < val.length; i++) {
        var s = String(val[i] != null ? val[i] : '').trim();
        if (s) out.push(s);
      }
      return out;
    }
    var one = String(val).trim();
    return one ? [one] : [];
  }

  function readActiveCfgByDir() {
    var suites = work.peekTree().suites;
    var out = {};
    for (var dir in suites) out[dir] = suites[dir].slice();
    return out;
  }

  function normalizeActiveCfgByDir(map) {
    var out = {};
    var keys = Object.keys(map || {});
    for (var i = 0; i < keys.length; i++) {
      var list = normalizeActiveCfgList(map[keys[i]]);
      if (list.length) out[keys[i]] = list;
    }
    return out;
  }

  function writeActiveCfgByDir(map) {
    var out = normalizeActiveCfgByDir(map);
    work.updateTree(function (t) { t.suites = out; });
  }

  function getActiveCfgsForDir(dir) {
    var map = readActiveCfgByDir();
    var d = dir != null ? String(dir) : '';
    return normalizeActiveCfgList(map[d]);
  }

  function getActiveCfgForDir(dir) {
    var list = getActiveCfgsForDir(dir);
    return list.length ? list[0] : null;
  }

  function setActiveCfgsForDir(dir, paths) {
    var map = readActiveCfgByDir();
    var d = dir != null ? String(dir) : '';
    var list = normalizeActiveCfgList(paths);
    if (list.length) map[d] = list;
    else delete map[d];
    writeActiveCfgByDir(map);
  }

  function setActiveCfgForDir(dir, path) {
    var trimmed = String(path != null ? path : '').trim();
    if (trimmed) setActiveCfgsForDir(dir, [trimmed]);
    else setActiveCfgsForDir(dir, []);
  }

  function addActiveCfgForDir(dir, path) {
    var trimmed = String(path != null ? path : '').trim();
    if (!trimmed) return;
    var list = getActiveCfgsForDir(dir);
    for (var i = 0; i < list.length; i++) {
      if (list[i] === trimmed) return;
    }
    list.push(trimmed);
    setActiveCfgsForDir(dir, list);
  }

  function removeActiveCfgForDir(dir, path) {
    var trimmed = String(path != null ? path : '').trim();
    if (!trimmed) return;
    var list = getActiveCfgsForDir(dir);
    var next = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] !== trimmed) next.push(list[i]);
    }
    setActiveCfgsForDir(dir, next);
  }

  function getActiveCfgByDir() {
    return readActiveCfgByDir();
  }

  function backfillActiveCfgByDir(byDir) {
    if (!byDir || typeof byDir !== 'object') return readActiveCfgByDir();
    var map = readActiveCfgByDir();
    var changed = false;
    for (var d in byDir) {
      if (!Object.prototype.hasOwnProperty.call(byDir, d)) continue;
      var path = String(byDir[d] != null ? byDir[d] : '').trim();
      if (!path || normalizeActiveCfgList(map[d]).length) continue;
      map[d] = [path];
      changed = true;
    }
    if (changed) writeActiveCfgByDir(map);
    return map;
  }

  // ── greedy alias expansion, on text arriving from outside the editor ──────

  // Which files greedy alias expansion rewrites in storage (import, upload, switching to
  // greedy). Every source file, signature files included: greedy means always, and the
  // editor already expands one when it opens it. Only project manifests are left alone:
  // they hold file paths, and their editor has no aliases.
  function isAliasExpandablePath(name) {
    var PS = typeof ProjectSource !== 'undefined' ? ProjectSource : null;
    if (PS && typeof PS.isSignaturePath === 'function') return PS.isSignaturePath(name);
    var n = String(name || '').toLowerCase();
    if (n.endsWith('.cfg')) return false;
    if (n.endsWith('.bel') || n.endsWith('.elf')) return true;
    var base = String(name || '').slice(String(name || '').lastIndexOf('/') + 1);
    return base.indexOf('.') === -1;
  }

  function expandAliasesForStorage(text, fileName) {
    var s = String(text != null ? text : '');
    if (settings.get('aliasActivation') !== 'greedy') return s;
    if (!isAliasExpandablePath(fileName)) return s;
    if (typeof BelEditor !== 'undefined' && typeof BelEditor.expandBelAliases === 'function') {
      return BelEditor.expandBelAliases(s);
    }
    return s;
  }

  function expandAliasesInAllFiles() {
    if (settings.get('aliasActivation') !== 'greedy') return 0;
    var files = listFiles();
    var changed = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!isAliasExpandablePath(f.name)) continue;
      var cur = work.getText(f.id);
      var next = expandAliasesForStorage(cur, f.name);
      if (next !== cur) {
        work.setText(f.id, next);
        changed += 1;
      }
    }
    return changed;
  }

  // ── text ──────────────────────────────────────────────────────────────────

  // A file's stored text. For the ACTIVE file the live buffer may be ahead of
  // storage (debounced save): callers that need the latest prefer the editor.
  function getFileText(id) {
    return work.getText(id);
  }

  // Text arriving from outside the editor (import, conflict resolution, a cfg
  // rewrite). Greedy alias expansion applies; the file's view and semantic
  // cache are separate records and are left alone.
  function setFileText(id, text) {
    work.setText(id, expandAliasesForStorage(text, fileNameForId(id)));
    try {
      if (typeof BelEditor !== 'undefined'
        && typeof BelEditor.invalidateFileHealthAfterChange === 'function') {
        BelEditor.invalidateFileHealthAfterChange(id);
      }
    } catch (_) { /* editor not mounted */ }
  }

  // ── file operations ───────────────────────────────────────────────────────

  function createFile(name) {
    var fileName = name || 'untitled.bel';
    var id = work.newFileId();
    var files = listFiles();
    files.push({ id: id, name: fileName });
    writeFiles(files);
    pruneEmptyFoldersForFile(fileName);
    notifyProjectTreeChanged('create');
    return id;
  }

  /**
   * Wipe this project's files and load a fresh set (folder import). entries:
   * [{ name, text }]. options: { projectName, activeCfgByDir }. The first file
   * becomes active and the only open tab. Returns { files, activeId }.
   */
  function replaceProject(entries, options) {
    options = options || {};
    work.removeFiles(work.peekTree().files.map(function (f) { return f.id; }));
    var files = [];
    var list = entries || [];
    for (var j = 0; j < list.length; j++) {
      var name = String(list[j].name || 'untitled.bel');
      var id = work.newFileId();
      // Text before the tree: a listed file never lacks its record.
      work.setText(id, expandAliasesForStorage(list[j].text, name));
      files.push({ id: id, name: name });
    }
    work.writeTree({
      files: files,
      folders: [],
      suites: normalizeActiveCfgByDir(options.activeCfgByDir),
    });
    var activeId = files.length ? files[0].id : null;
    work.updateSession(function (s) {
      s.active = activeId;
      s.open = activeId ? [activeId] : [];
      s.views = {};
    });
    if (options.projectName) setProjectName(options.projectName);
    return { files: listFiles(), activeId: activeId };
  }

  function restoreDeletedFile(id, name, text) {
    if (getFileById(id)) return false;
    work.setText(id, expandAliasesForStorage(text, name));
    var files = listFiles();
    files.push({ id: id, name: name });
    writeFiles(files);
    pruneEmptyFoldersForFile(name);
    notifyProjectTreeChanged('restore');
    return true;
  }

  function deleteFile(id) {
    var files = listFiles();
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
    writeFiles(files);
    // Deleting a file drops its entry from any same-directory .cfg that lists it
    // (a within-suite op the user expects reflected). Runs after the splice so a
    // deleted .cfg is never asked to rewrite itself.
    rewriteCfgsForOp(deletedName, null);
    closeOpenFile(id);
    work.removeFiles([id]);
    preserveEmptyFoldersAfterPath(deletedName);
    notifyProjectTreeChanged('delete');
    // The file to switch to (previous, next, or null).
    return files.length ? files[Math.max(0, idx - 1)].id : null;
  }

  function renameFile(id, newName) {
    var files = listFiles();
    for (var i = 0; i < files.length; i++) {
      if (files[i].id !== id) continue;
      var oldName = files[i].name;
      files[i].name = newName;
      writeFiles(files);
      rewriteCfgsForOp(oldName, newName);
      var map = readActiveCfgByDir();
      var changed = false;
      for (var k in map) {
        var cfgs = map[k];
        for (var j = 0; j < cfgs.length; j++) {
          if (cfgs[j] === oldName) {
            cfgs[j] = newName;
            changed = true;
          }
        }
      }
      if (changed) writeActiveCfgByDir(map);
      pruneEmptyFoldersForFile(newName);
      if (oldName !== newName) preserveEmptyFoldersAfterPath(oldName);
      notifyProjectTreeChanged('rename');
      return;
    }
  }

  // ── .cfg membership ───────────────────────────────────────────────────────

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

  // Prefer the live editor buffer when the cfg tab is active: storage can lag
  // autosave and would otherwise miss entries the user just typed in.
  function cfgTextForRewrite(fileId) {
    var g = typeof window !== 'undefined' ? window : null;
    if (g) {
      var ed = g.CurrentEditor;
      if (fileId === getActiveFileId() && ed && typeof ed.getValue === 'function') {
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
      if (!isCfgEntryLine(t)) { out.push(line); continue; }
      if (resolveCfgEntryPath(cfgDir, t) !== oldName) { out.push(line); continue; }
      if (newName == null) { changed = true; continue; }
      if (oldDir !== newDir) { out.push(line); continue; }
      var rel = relToCfgDir(cfgDir, newName);
      if (rel == null || rel === '') { out.push(line); continue; }
      changed = true;
      out.push(line.slice(0, line.indexOf(t)) + rel);
    }
    return changed ? out.join('\n') : null;
  }

  // When auto-sync is on, rewrite every .cfg that lists `oldName`: same-folder
  // rename updates the entry; delete removes it; folder move leaves it dangling.
  function rewriteCfgsForOp(oldName, newName) {
    if (!settings.get('cfgAutoSync')) return [];
    var files = listFiles();
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

  function cfgFileByPath(cfgPath) {
    var files = work.peekTree().files;
    for (var i = 0; i < files.length; i++) {
      if (files[i].name === cfgPath) return { id: files[i].id, name: files[i].name };
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

  // Append `fileName` to a suite's .cfg (load order): the authoring counterpart
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
      if (isCfgEntryLine(lines[i].trim())) {
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

  // Reorder a suite member by `delta` (-1 up / +1 down) within its .cfg: the
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
      if (!isCfgEntryLine(t)) continue;
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

  // ── projects, as the app sees them ────────────────────────────────────────

  // A blank project, made active. The caller reloads into it.
  function newBlankProject(name) {
    var pid = work.createProject(name);
    if (pid) work.setActiveProject(pid);
    return pid;
  }

  // A project from a file set (folder import), made active. The caller reloads.
  function createProjectWithFiles(name, entries, options) {
    var pid = work.createProject(name);
    if (!pid) return { projectId: null, files: [], activeId: null };
    work.setActiveProject(pid);
    var result = replaceProject(entries, options || {});
    return { projectId: pid, files: result.files, activeId: result.activeId };
  }

  return {
    // files
    listFiles: listFiles,
    getFileById: getFileById,
    fileNameForId: fileNameForId,
    getFileText: getFileText,
    setFileText: setFileText,
    createFile: createFile,
    replaceProject: replaceProject,
    restoreDeletedFile: restoreDeletedFile,
    deleteFile: deleteFile,
    renameFile: renameFile,
    // folders
    listEmptyFolders: listEmptyFolders,
    addEmptyFolder: addEmptyFolder,
    removeEmptyFolder: removeEmptyFolder,
    clearEmptyFolders: clearEmptyFolders,
    pruneEmptyFoldersUnder: pruneEmptyFoldersUnder,
    renameEmptyFolderPrefix: renameEmptyFolderPrefix,
    preserveEmptyFoldersAfterMoves: preserveEmptyFoldersAfterMoves,
    // session
    getActiveFileId: getActiveFileId,
    setActiveFileId: setActiveFileId,
    getOpenFileIds: getOpenFileIds,
    setOpenFileIds: setOpenFileIds,
    openFile: openFile,
    closeOpenFile: closeOpenFile,
    // project
    getProjectName: getProjectName,
    setProjectName: setProjectName,
    newBlankProject: newBlankProject,
    createProjectWithFiles: createProjectWithFiles,
    // cfg
    addEntryToCfg: addEntryToCfg,
    prependEntryToCfg: prependEntryToCfg,
    removeEntryFromCfg: removeEntryFromCfg,
    moveEntryInCfg: moveEntryInCfg,
    getActiveCfgForDir: getActiveCfgForDir,
    getActiveCfgsForDir: getActiveCfgsForDir,
    setActiveCfgForDir: setActiveCfgForDir,
    setActiveCfgsForDir: setActiveCfgsForDir,
    addActiveCfgForDir: addActiveCfgForDir,
    removeActiveCfgForDir: removeActiveCfgForDir,
    getActiveCfgByDir: getActiveCfgByDir,
    backfillActiveCfgByDir: backfillActiveCfgByDir,
    // aliases
    isAliasExpandablePath: isAliasExpandablePath,
    expandAliasesForStorage: expandAliasesForStorage,
    expandAliasesInAllFiles: expandAliasesInAllFiles,
  };
}
