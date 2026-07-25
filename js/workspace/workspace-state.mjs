// Project-scoped workspace UI snapshot (sidebars, floating windows).
'use strict';

  var SCHEMA_VERSION = 1;
  var MAX_FLOATING = 8;
  var SAVE_DEBOUNCE_MS = 400;

  var SIDE_PANEL_IDS = ['explorer', 'inspector', 'library', 'harpoon'];
  var providers = Object.create(null);
  var saveTimer = null;
  var restoredForProject = null;

  function P() {
    return globalThis.Persist;
  }

  function clampGeom(geom) {
    if (!geom || typeof geom !== 'object') return null;
    var x = Number(geom.x);
    var y = Number(geom.y);
    var w = Number(geom.w != null ? geom.w : geom.width);
    var h = Number(geom.h != null ? geom.h : geom.height);
    if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return null;
    return {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.max(140, Math.round(w)),
      h: Math.max(96, Math.round(h)),
    };
  }

  function normalizeInspectorTarget(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.kind !== 'string') return null;
    var out = { kind: raw.kind };
    if (typeof raw.name === 'string') out.name = raw.name;
    if (typeof raw.fileId === 'string') out.fileId = raw.fileId;
    var ph = Number(raw.posHint != null ? raw.posHint : raw.pos);
    if (isFinite(ph) && ph >= 0) out.posHint = Math.floor(ph);
    if (raw.kind === 'global' && !out.fileId) return null;
    if (raw.kind === 'symbol' && !out.name) return null;
    return out;
  }

  function normalizeProvingDecl(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.fileId !== 'string' || typeof raw.declKey !== 'string') return null;
    return { fileId: raw.fileId, declKey: raw.declKey };
  }

  function normalizeFloatingEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var kind = raw.kind;
    if (kind !== 'inspector' && kind !== 'graph' && kind !== 'harpoon') return null;
    if (typeof raw.fileId !== 'string' || !raw.fileId) return null;
    var geom = clampGeom(raw.geom);
    if (!geom) return null;
    var anchor = raw.anchor && typeof raw.anchor === 'object' ? raw.anchor : null;
    if (!anchor) return null;
    return {
      id: typeof raw.id === 'string' ? raw.id : kind + ':' + raw.fileId + ':' + geom.x,
      kind: kind,
      geom: geom,
      fileId: raw.fileId,
      anchor: anchor,
      followEditor: !!raw.followEditor,
      zOrder: isFinite(Number(raw.zOrder)) ? Number(raw.zOrder) : 0,
    };
  }

  function emptyWorkspace(projectId) {
    return {
      v: SCHEMA_VERSION,
      projectId: projectId || 'default',
      updatedAt: 0,
      activeSidePanel: null,
      sidebar: {
        inspector: { target: null, histIndex: -1, scrollTop: 0 },
        explorer: { revealActiveFile: true, scrollActiveIntoView: true },
        library: { filterText: '' },
        harpoon: { provingDecl: null },
      },
      floating: [],
    };
  }

  function normalizeWorkspace(raw, projectId) {
    var base = emptyWorkspace(projectId);
    if (!raw || typeof raw !== 'object') return base;
    if (raw.v !== SCHEMA_VERSION) return base;

    if (typeof raw.projectId === 'string') base.projectId = raw.projectId;
    if (typeof raw.updatedAt === 'number') base.updatedAt = raw.updatedAt;

    var asp = raw.activeSidePanel;
    if (asp === null || SIDE_PANEL_IDS.indexOf(asp) !== -1) base.activeSidePanel = asp;

    if (raw.sidebar && typeof raw.sidebar === 'object') {
      var sb = raw.sidebar;
      if (sb.inspector && typeof sb.inspector === 'object') {
        base.sidebar.inspector.target = normalizeInspectorTarget(sb.inspector.target);
        var hi = Number(sb.inspector.histIndex);
        if (isFinite(hi)) base.sidebar.inspector.histIndex = Math.floor(hi);
        var st = Number(sb.inspector.scrollTop);
        if (isFinite(st) && st >= 0) base.sidebar.inspector.scrollTop = Math.floor(st);
      }
      if (sb.explorer && typeof sb.explorer === 'object') {
        if (typeof sb.explorer.revealActiveFile === 'boolean') {
          base.sidebar.explorer.revealActiveFile = sb.explorer.revealActiveFile;
        }
        if (typeof sb.explorer.scrollActiveIntoView === 'boolean') {
          base.sidebar.explorer.scrollActiveIntoView = sb.explorer.scrollActiveIntoView;
        }
      }
      if (sb.library && typeof sb.library === 'object' && typeof sb.library.filterText === 'string') {
        base.sidebar.library.filterText = sb.library.filterText.slice(0, 200);
      }
      if (sb.harpoon && typeof sb.harpoon === 'object') {
        base.sidebar.harpoon.provingDecl = normalizeProvingDecl(sb.harpoon.provingDecl);
      }
    }

    if (Array.isArray(raw.floating)) {
      var floats = [];
      for (var i = 0; i < raw.floating.length && floats.length < MAX_FLOATING; i++) {
        var entry = normalizeFloatingEntry(raw.floating[i]);
        if (entry) floats.push(entry);
      }
      base.floating = floats;
    }

    return base;
  }

  function readWorkspace(projectId) {
    var persist = P();
    if (!persist || typeof persist.readStoredWorkspace !== 'function') {
      return emptyWorkspace(projectId);
    }
    return normalizeWorkspace(persist.readStoredWorkspace(projectId), projectId);
  }

  function writeWorkspace(snapshot, projectId) {
    var persist = P();
    if (!persist || typeof persist.writeStoredWorkspace !== 'function') return false;
    var pid = projectId || (persist.getActiveProjectId ? persist.getActiveProjectId() : 'default');
    var next = normalizeWorkspace(snapshot, pid);
    next.projectId = pid;
    next.updatedAt = Date.now();
    return persist.writeStoredWorkspace(next, pid);
  }

  function registerProvider(name, hooks) {
    if (!name || !hooks) return;
    providers[name] = hooks;
  }

  function collectFromProviders(out) {
    for (var name in providers) {
      if (!Object.prototype.hasOwnProperty.call(providers, name)) continue;
      var hooks = providers[name];
      if (hooks && typeof hooks.collect === 'function') {
        try { hooks.collect(out); } catch (_) { /* ignore */ }
      }
    }
  }

  function mergeFloatingSnapshots(priorFloating, activeFileId, openFileIds, liveFloating) {
    var open = openFileIds || [];
    var live = Array.isArray(liveFloating) ? liveFloating : [];
    // Graph and Harpoon floats are not file-chrome: they stay open across tab
    // switches (graph rebinds; Harpoon keeps proving its hole). Keeping prior
    // per-file entries after close made them reopen when switching back.
    var kept = (priorFloating || []).filter(function (entry) {
      if (!entry || entry.fileId === activeFileId) return false;
      if (open.indexOf(entry.fileId) === -1) return false;
      if (entry.kind === 'graph' || entry.kind === 'harpoon') return false;
      return true;
    });
    var merged = kept.concat(live);
    return merged.filter(function (entry) {
      return entry && open.indexOf(entry.fileId) !== -1;
    }).slice(0, MAX_FLOATING);
  }

  function collectWorkspace() {
    var persist = P();
    var pid = persist && persist.getActiveProjectId ? persist.getActiveProjectId() : 'default';
    var prior = readWorkspace(pid);
    var snap = emptyWorkspace(pid);
    var openIds = persist && persist.getOpenFileIds ? persist.getOpenFileIds() : [];
    var activeFileId = persist && persist.getActiveFileId ? persist.getActiveFileId() : null;

    snap.activeSidePanel = persist && typeof persist.readStoredActiveSidePanel === 'function'
      ? persist.readStoredActiveSidePanel(pid)
      : null;

    snap.floating = [];
    collectFromProviders(snap);

    snap.floating = mergeFloatingSnapshots(prior.floating, activeFileId, openIds, snap.floating);
    snap.projectId = pid;
    snap.updatedAt = Date.now();
    snap.v = SCHEMA_VERSION;
    return snap;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = globalThis.setTimeout(function () {
      saveTimer = null;
      flushWorkspace();
    }, SAVE_DEBOUNCE_MS);
  }

  function flushWorkspace() {
    var snap = collectWorkspace();
    writeWorkspace(snap, snap.projectId);
  }

  function filterFloatingForFile(floating, fileId, openFileIds) {
    if (!Array.isArray(floating)) return [];
    var open = openFileIds || [];
    return floating.filter(function (entry) {
      if (!entry || entry.fileId !== fileId) return false;
      return open.indexOf(entry.fileId) !== -1;
    });
  }

  function applyWorkspace(snapshot, deps) {
    deps = deps || {};
    var persist = P();
    var pid = deps.projectId || (persist && persist.getActiveProjectId ? persist.getActiveProjectId() : 'default');
    var ws = normalizeWorkspace(snapshot, pid);
    if (restoredForProject === pid + ':' + ws.updatedAt) return;
    restoredForProject = pid + ':' + ws.updatedAt;

    var openIds = deps.openFileIds || (persist && persist.getOpenFileIds ? persist.getOpenFileIds() : []);
    var activeFileId = deps.activeFileId || (persist && persist.getActiveFileId ? persist.getActiveFileId() : null);

    if (typeof deps.applySidePanel === 'function' && ws.activeSidePanel) {
      deps.applySidePanel(ws.activeSidePanel);
    }

    for (var name in providers) {
      if (!Object.prototype.hasOwnProperty.call(providers, name)) continue;
      var hooks = providers[name];
      if (!hooks || typeof hooks.restoreSidebar !== 'function') continue;
      try { hooks.restoreSidebar(ws.sidebar, deps); } catch (_) { /* ignore */ }
    }

    if (typeof deps.restoreFloating === 'function') {
      var floats = filterFloatingForFile(ws.floating, activeFileId, openIds);
      deps.restoreFloating(floats, deps);
    }
  }

  function resetWorkspaceState(projectId) {
    var persist = P();
    if (persist && typeof persist.resetStoredWorkspace === 'function') {
      persist.resetStoredWorkspace(projectId);
    }
    restoredForProject = null;
  }

  export const WorkspaceState = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    MAX_FLOATING: MAX_FLOATING,
    SIDE_PANEL_IDS: SIDE_PANEL_IDS,
    normalizeWorkspace: normalizeWorkspace,
    normalizeFloatingEntry: normalizeFloatingEntry,
    normalizeInspectorTarget: normalizeInspectorTarget,
    readWorkspace: readWorkspace,
    writeWorkspace: writeWorkspace,
    collectWorkspace: collectWorkspace,
    flushWorkspace: flushWorkspace,
    scheduleSave: scheduleSave,
    registerProvider: registerProvider,
    applyWorkspace: applyWorkspace,
    filterFloatingForFile: filterFloatingForFile,
    resetWorkspaceState: resetWorkspaceState,
    mergeFloatingSnapshots: mergeFloatingSnapshots,
    clampGeom: clampGeom,
  };

const g = typeof window !== 'undefined' ? window : globalThis;
g.WorkspaceState = WorkspaceState;
g.BelJarWorkspaceState = g.WorkspaceState
