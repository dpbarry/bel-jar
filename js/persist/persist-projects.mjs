/**
 * Project registry helpers — injected into Persist.
 */
export function create(deps) {
    var PROJECTS_KEY = deps.PROJECTS_KEY;
    var ACTIVE_PROJECT_KEY = deps.ACTIVE_PROJECT_KEY;
    var DEFAULT_PROJECT_ID = deps.DEFAULT_PROJECT_ID;
    var DEFAULT_PROJECT_NAME = deps.DEFAULT_PROJECT_NAME;
    var DEFAULT_DOCUMENT_ID = deps.DEFAULT_DOCUMENT_ID;
    var PROJECT_NAME_KEY = deps.PROJECT_NAME_KEY;
    var backendLoad = deps.backendLoad;
    var backendSave = deps.backendSave;
    var backendRemove = deps.backendRemove;
    var tryParse = deps.tryParse;
    var projKey = deps.projKey;
    var stateKeyFor = deps.stateKeyFor;
    var replaceProject = deps.replaceProject;

    function readProjects() {
      var raw = tryParse(backendLoad(PROJECTS_KEY));
      return Array.isArray(raw) && raw.length ? raw : null;
    }

    function writeProjects(projects) {
      backendSave(PROJECTS_KEY, JSON.stringify(projects));
    }

    function ensureProjects() {
      var projects = readProjects();
      if (projects) return projects;
      var legacyName = backendLoad(PROJECT_NAME_KEY);
      projects = [{
        id: DEFAULT_PROJECT_ID,
        name: (legacyName && String(legacyName).trim()) || DEFAULT_PROJECT_NAME,
        createdAt: Date.now(),
      }];
      writeProjects(projects);
      if (!backendLoad(ACTIVE_PROJECT_KEY)) backendSave(ACTIVE_PROJECT_KEY, DEFAULT_PROJECT_ID);
      return projects;
    }

    function listProjects() {
      return ensureProjects();
    }

    function getActiveProjectId() {
      ensureProjects();
      var id = backendLoad(ACTIVE_PROJECT_KEY);
      var projects = readProjects() || [];
      if (id && projects.some(function (p) { return p.id === id; })) return id;
      return projects.length ? projects[0].id : DEFAULT_PROJECT_ID;
    }

    function setActiveProjectId(id) {
      ensureProjects();
      backendSave(ACTIVE_PROJECT_KEY, id);
    }

    function getActiveProject() {
      var id = getActiveProjectId();
      var projects = readProjects() || [];
      for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === id) return projects[i];
      }
      return projects[0] || null;
    }

    function createProject(name) {
      var projects = ensureProjects();
      var used = {};
      for (var i = 0; i < projects.length; i++) used[projects[i].id] = true;
      var base = 'p-' + Date.now().toString(36);
      var id = base;
      var n = 1;
      while (used[id]) { id = base + '-' + n; n += 1; }
      projects.push({
        id: id,
        name: String(name || DEFAULT_PROJECT_NAME).trim() || DEFAULT_PROJECT_NAME,
        createdAt: Date.now(),
      });
      writeProjects(projects);
      backendSave(projKey('files', id), JSON.stringify([{ id: DEFAULT_DOCUMENT_ID, name: 'main.bel' }]));
      backendSave(projKey('active-file', id), DEFAULT_DOCUMENT_ID);
      backendSave(projKey('open-files', id), JSON.stringify([DEFAULT_DOCUMENT_ID]));
      backendSave(projKey('empty-folders', id), JSON.stringify([]));
      return id;
    }

    function renameProject(id, name) {
      var projects = ensureProjects();
      var trimmed = String(name != null ? name : '').trim() || DEFAULT_PROJECT_NAME;
      for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === id) {
          projects[i].name = trimmed;
          writeProjects(projects);
          if (id === DEFAULT_PROJECT_ID) backendSave(PROJECT_NAME_KEY, trimmed);
          return true;
        }
      }
      return false;
    }

    function deleteProject(id) {
      var projects = ensureProjects();
      if (projects.length <= 1) return null;
      var idx = -1;
      for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === id) { idx = i; break; }
      }
      if (idx === -1) return null;
      var files = tryParse(backendLoad(projKey('files', id)));
      if (Array.isArray(files)) {
        for (var j = 0; j < files.length; j++) backendRemove(stateKeyFor(files[j].id, id));
      }
      backendRemove(projKey('files', id));
      backendRemove(projKey('active-file', id));
      backendRemove(projKey('open-files', id));
      backendRemove(projKey('default-cfg', id));
      backendRemove(projKey('active-cfg-by-dir', id));
      backendRemove(projKey('empty-folders', id));
      projects.splice(idx, 1);
      writeProjects(projects);
      var nextId = projects[Math.max(0, idx - 1)].id;
      if (getActiveProjectId() === id) setActiveProjectId(nextId);
      return nextId;
    }

    function newBlankProject(name) {
      var id = createProject(name);
      setActiveProjectId(id);
      return id;
    }

    function createProjectWithFiles(name, entries, options) {
      var id = createProject(name);
      setActiveProjectId(id);
      var result = replaceProject(entries, options || {});
      return { projectId: id, files: result.files, activeId: result.activeId };
    }

    return {
      readProjects: readProjects,
      writeProjects: writeProjects,
      ensureProjects: ensureProjects,
      listProjects: listProjects,
      getActiveProjectId: getActiveProjectId,
      setActiveProjectId: setActiveProjectId,
      getActiveProject: getActiveProject,
      createProject: createProject,
      renameProject: renameProject,
      deleteProject: deleteProject,
      newBlankProject: newBlankProject,
      createProjectWithFiles: createProjectWithFiles,
    };
  }
