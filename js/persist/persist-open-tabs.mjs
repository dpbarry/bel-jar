/**
 * Open-file tabs + active cfg-by-dir — injected into Persist.
 */
export function create(deps) {
    var backendLoad = deps.backendLoad;
    var backendSave = deps.backendSave;
    var backendRemove = deps.backendRemove;
    var tryParse = deps.tryParse;
    var projKey = deps.projKey;
    var listFiles = deps.listFiles;
    var getFileById = deps.getFileById;
    var readProjectFiles = deps.readProjectFiles;
    var getActiveProject = deps.getActiveProject;
    var renameProject = deps.renameProject;
    var getActiveProjectId = deps.getActiveProjectId;
    var DEFAULT_PROJECT_NAME = deps.DEFAULT_PROJECT_NAME;
    var dirOf = deps.dirOf;
    var defaultBackend = deps.defaultBackend;
    var getActiveFileId = deps.getActiveFileId;

    // ── Open files (tabs) ───────────────────────────────────────────────────────
    // The registry lists EVERY project file (explorer); the open list is the much
    // smaller set shown as tabs. A folder import of hundreds of files must not
    // produce hundreds of tabs.

    function writeOpenFileIds(ids) {
      backendSave(projKey('open-files'), JSON.stringify(ids));
    }

    function setOpenFileIds(ids) {
      writeOpenFileIds(ids || []);
    }

    function getOpenFileIds() {
      var files = listFiles();
      if (!files.length) return [];
      var valid = {};
      for (var i = 0; i < files.length; i++) valid[files[i].id] = true;
      var raw = tryParse(backendLoad(projKey('open-files')));
      if (!Array.isArray(raw)) {
        // Legacy projects predate the open list: every file was a tab.
        var all = files.map(function (f) { return f.id; });
        writeOpenFileIds(all);
        return all;
      }
      var out = [];
      for (var j = 0; j < raw.length; j++) {
        if (valid[raw[j]] && out.indexOf(raw[j]) === -1) out.push(raw[j]);
      }
      return out;
    }

    function openFile(id) {
      var ids = getOpenFileIds();
      if (!getFileById(id)) return ids;
      if (ids.indexOf(id) === -1) {
        ids.push(id);
        writeOpenFileIds(ids);
      }
      return ids;
    }

    // Close the TAB only — the file stays in the project registry.
    function closeOpenFile(id) {
      var ids = getOpenFileIds();
      var idx = ids.indexOf(id);
      if (idx === -1) return ids;
      ids.splice(idx, 1);
      writeOpenFileIds(ids);
      return ids;
    }

    // Project name lives in the projects registry (single source of truth).
    function getProjectName() {
      try {
        var p = getActiveProject();
        return p && p.name && String(p.name).trim() ? String(p.name).trim() : DEFAULT_PROJECT_NAME;
      } catch (_) {
        return DEFAULT_PROJECT_NAME;
      }
    }

    function setProjectName(name) {
      renameProject(getActiveProjectId(), name);
    }

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
      var raw = tryParse(backendLoad(projKey('active-cfg-by-dir')));
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        var normalized = {};
        var keys = Object.keys(raw);
        for (var ki = 0; ki < keys.length; ki++) {
          var k = keys[ki];
          normalized[k] = normalizeActiveCfgList(raw[k]);
        }
        return normalized;
      }
      var migrated = {};
      var legacy = backendLoad(projKey('default-cfg'));
      if (legacy && String(legacy).trim()) {
        migrated[dirOf(String(legacy).trim())] = [String(legacy).trim()];
        writeActiveCfgByDir(migrated);
        defaultBackend.removeSync(projKey('default-cfg'));
      }
      return migrated;
    }

    function writeActiveCfgByDir(map) {
      var out = {};
      var keys = Object.keys(map || {});
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var list = normalizeActiveCfgList(map[k]);
        if (list.length) out[k] = list;
      }
      if (!Object.keys(out).length) {
        backendRemove(projKey('active-cfg-by-dir'));
        return;
      }
      backendSave(projKey('active-cfg-by-dir'), JSON.stringify(out));
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

    /** Active cfg for the current file's folder (back-compat alias). */
    function getDefaultCfgPath() {
      try {
        var activeId = getActiveFileId();
        var files = readProjectFiles() || [];
        for (var i = 0; i < files.length; i++) {
          if (files[i].id === activeId) return getActiveCfgForDir(dirOf(files[i].name));
        }
        return null;
      } catch (_) {
        return null;
      }
    }

    function setDefaultCfgPath(path) {
      var trimmed = String(path != null ? path : '').trim();
      if (!trimmed) return;
      setActiveCfgForDir(dirOf(trimmed), trimmed);
    }

    return {
      writeOpenFileIds: writeOpenFileIds,
      setOpenFileIds: setOpenFileIds,
      getOpenFileIds: getOpenFileIds,
      openFile: openFile,
      closeOpenFile: closeOpenFile,
      getProjectName: getProjectName,
      setProjectName: setProjectName,
      normalizeActiveCfgList: normalizeActiveCfgList,
      readActiveCfgByDir: readActiveCfgByDir,
      writeActiveCfgByDir: writeActiveCfgByDir,
      getActiveCfgsForDir: getActiveCfgsForDir,
      getActiveCfgForDir: getActiveCfgForDir,
      setActiveCfgsForDir: setActiveCfgsForDir,
      setActiveCfgForDir: setActiveCfgForDir,
      addActiveCfgForDir: addActiveCfgForDir,
      removeActiveCfgForDir: removeActiveCfgForDir,
      getActiveCfgByDir: getActiveCfgByDir,
      backfillActiveCfgByDir: backfillActiveCfgByDir,
      getDefaultCfgPath: getDefaultCfgPath,
      setDefaultCfgPath: setDefaultCfgPath,
    };
  }
