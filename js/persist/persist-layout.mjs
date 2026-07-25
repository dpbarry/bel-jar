/**
 * Panel layout + workspace snapshot — injected into Persist.
 */
export function create(deps) {
    var backendLoad = deps.backendLoad;
    var backendSave = deps.backendSave;
    var backendRemove = deps.backendRemove;
    var tryParse = deps.tryParse;
    var projectPrefix = deps.projectPrefix;
    var getActiveProjectId = deps.getActiveProjectId;
    var EDITOR_SPLIT_STORAGE_KEY = deps.EDITOR_SPLIT_STORAGE_KEY;
    var DEFAULT_EDITOR_SPLIT = deps.DEFAULT_EDITOR_SPLIT;
    var MIN_EDITOR_SPLIT = deps.MIN_EDITOR_SPLIT;
    var MAX_EDITOR_SPLIT = deps.MAX_EDITOR_SPLIT;
    var SIDE_PANEL_LAYOUT = deps.SIDE_PANEL_LAYOUT;
    var DEFAULT_SIDE_PANEL_WIDTH = deps.DEFAULT_SIDE_PANEL_WIDTH;
    var DEFAULT_SIDE_PANEL_HEIGHT = deps.DEFAULT_SIDE_PANEL_HEIGHT;
    var EXPLORER_OPEN_KEY = deps.EXPLORER_OPEN_KEY;
    var INSPECTOR_OPEN_KEY = deps.INSPECTOR_OPEN_KEY;
    var INSPECTOR_FOLLOW_KEY = deps.INSPECTOR_FOLLOW_KEY;
    var LIBRARY_OPEN_KEY = deps.LIBRARY_OPEN_KEY;
    var LOAD_STATS_KEY = deps.LOAD_STATS_KEY;
    var WORKSPACE_KEY = 'beljar-workspace-v1';
    var ACTIVE_SIDE_PANEL_KEY = 'beljar-active-side-panel';
    var SIDE_PANEL_IDS = ['explorer', 'inspector', 'library', 'harpoon'];
    var RESTORE_PANELS_KEY = 'beljar-restore-panels';
    var LIBRARY_EXPAND_DEFAULT_KEY = 'beljar-library-expand-default';

    function resetLayoutPrefs() {
      backendRemove(EDITOR_SPLIT_STORAGE_KEY);
      for (var panelId in SIDE_PANEL_LAYOUT) {
        if (!Object.prototype.hasOwnProperty.call(SIDE_PANEL_LAYOUT, panelId)) continue;
        var layout = SIDE_PANEL_LAYOUT[panelId];
        backendRemove(layout.widthKey);
        backendRemove(layout.heightKey);
      }
    }

    function workspaceKeyFor(pid) {
      var prefix = projectPrefix(pid);
      if (prefix === '') return WORKSPACE_KEY;
      return prefix + 'workspace-v1';
    }

    function activeSidePanelKey(pid) {
      var prefix = projectPrefix(pid);
      if (prefix === '') return ACTIVE_SIDE_PANEL_KEY;
      return prefix + 'active-side-panel';
    }

    function migrateActiveSidePanelFromLegacy(pid) {
      if (backendLoad(activeSidePanelKey(pid))) return null;
      if (readStoredHarpoonOpen()) return 'harpoon';
      if (readStoredLibraryOpen()) return 'library';
      if (readStoredInspectorOpen()) return 'inspector';
      if (readStoredExplorerOpen()) return 'explorer';
      return null;
    }

    function readStoredActiveSidePanel(pid) {
      pid = pid || getActiveProjectId();
      try {
        var raw = backendLoad(activeSidePanelKey(pid));
        if (raw && SIDE_PANEL_IDS.indexOf(raw) !== -1) return raw;
      } catch (_) { /* fall through */ }
      var migrated = migrateActiveSidePanelFromLegacy(pid);
      if (migrated) {
        writeStoredActiveSidePanel(migrated, pid);
        return migrated;
      }
      return null;
    }

    function writeStoredActiveSidePanel(id, pid) {
      pid = pid || getActiveProjectId();
      var key = activeSidePanelKey(pid);
      if (!id || SIDE_PANEL_IDS.indexOf(id) === -1) {
        backendRemove(key);
        writeStoredExplorerOpen(false);
        writeStoredInspectorOpen(false);
        writeStoredLibraryOpen(false);
        writeStoredHarpoonOpen(false);
        return;
      }
      backendSave(key, id);
      if (id === 'explorer') writeStoredExplorerOpen(true);
      else writeStoredExplorerOpen(false);
      if (id === 'inspector') writeStoredInspectorOpen(true);
      else writeStoredInspectorOpen(false);
      if (id === 'library') writeStoredLibraryOpen(true);
      else writeStoredLibraryOpen(false);
      if (id === 'harpoon') writeStoredHarpoonOpen(true);
      else writeStoredHarpoonOpen(false);
    }

    function readStoredWorkspace(pid) {
      pid = pid || getActiveProjectId();
      return tryParse(backendLoad(workspaceKeyFor(pid)));
    }

    function writeStoredWorkspace(snapshot, pid) {
      pid = pid || getActiveProjectId();
      try {
        backendSave(workspaceKeyFor(pid), JSON.stringify(snapshot));
        if (snapshot) {
          writeStoredActiveSidePanel(snapshot.activeSidePanel || null, pid);
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    function resetStoredWorkspace(pid) {
      pid = pid || getActiveProjectId();
      backendRemove(workspaceKeyFor(pid));
      backendRemove(activeSidePanelKey(pid));
    }

    function resetWorkspaceState(pid) {
      resetStoredWorkspace(pid);
    }

    function resetWorkspacePrefs() {
      resetStoredWorkspace();
      backendRemove(INSPECTOR_FOLLOW_KEY);
      backendRemove(RESTORE_PANELS_KEY);
      backendRemove(LIBRARY_EXPAND_DEFAULT_KEY);
    }

    function clampEditorSplit(ratio) {
      var n = Number(ratio);
      if (!isFinite(n)) return DEFAULT_EDITOR_SPLIT;
      if (n < MIN_EDITOR_SPLIT) return MIN_EDITOR_SPLIT;
      if (n > MAX_EDITOR_SPLIT) return MAX_EDITOR_SPLIT;
      return n;
    }

    function readStoredEditorSplit() {
      try {
        return clampEditorSplit(parseFloat(backendLoad(EDITOR_SPLIT_STORAGE_KEY)));
      } catch (_) {
        return DEFAULT_EDITOR_SPLIT;
      }
    }

    function writeStoredEditorSplit(ratio) {
      var clamped = clampEditorSplit(ratio);
      if (Math.abs(clamped - DEFAULT_EDITOR_SPLIT) < 0.001) {
        backendRemove(EDITOR_SPLIT_STORAGE_KEY);
      } else {
        backendSave(EDITOR_SPLIT_STORAGE_KEY, String(clamped));
      }
    }

    function clampPanelPx(n, min, max, fallback) {
      var v = Number(n);
      if (!isFinite(v)) return fallback;
      if (v < min) return min;
      if (v > max) return max;
      return Math.round(v);
    }

    function readStoredSidePanelWidth(layout) {
      try {
        return clampPanelPx(
          parseFloat(backendLoad(layout.widthKey)),
          layout.minW,
          layout.maxW,
          DEFAULT_SIDE_PANEL_WIDTH
        );
      } catch (_) {
        return DEFAULT_SIDE_PANEL_WIDTH;
      }
    }

    function writeStoredSidePanelWidth(layout, px) {
      var clamped = clampPanelPx(px, layout.minW, layout.maxW, DEFAULT_SIDE_PANEL_WIDTH);
      if (clamped === DEFAULT_SIDE_PANEL_WIDTH) backendRemove(layout.widthKey);
      else backendSave(layout.widthKey, String(clamped));
    }

    function readStoredSidePanelHeight(layout) {
      try {
        return clampPanelPx(
          parseFloat(backendLoad(layout.heightKey)),
          layout.minH,
          layout.maxH,
          DEFAULT_SIDE_PANEL_HEIGHT
        );
      } catch (_) {
        return DEFAULT_SIDE_PANEL_HEIGHT;
      }
    }

    function writeStoredSidePanelHeight(layout, px) {
      var clamped = clampPanelPx(px, layout.minH, layout.maxH, DEFAULT_SIDE_PANEL_HEIGHT);
      if (clamped === DEFAULT_SIDE_PANEL_HEIGHT) backendRemove(layout.heightKey);
      else backendSave(layout.heightKey, String(clamped));
    }

    function readStoredExplorerWidth() {
      return readStoredSidePanelWidth(SIDE_PANEL_LAYOUT.explorer);
    }

    function writeStoredExplorerWidth(px) {
      writeStoredSidePanelWidth(SIDE_PANEL_LAYOUT.explorer, px);
    }

    function readStoredInspectorWidth() {
      return readStoredSidePanelWidth(SIDE_PANEL_LAYOUT.inspector);
    }

    function writeStoredInspectorWidth(px) {
      writeStoredSidePanelWidth(SIDE_PANEL_LAYOUT.inspector, px);
    }

    function readStoredExplorerHeight() {
      return readStoredSidePanelHeight(SIDE_PANEL_LAYOUT.explorer);
    }

    function writeStoredExplorerHeight(px) {
      writeStoredSidePanelHeight(SIDE_PANEL_LAYOUT.explorer, px);
    }

    function readStoredInspectorHeight() {
      return readStoredSidePanelHeight(SIDE_PANEL_LAYOUT.inspector);
    }

    function writeStoredInspectorHeight(px) {
      writeStoredSidePanelHeight(SIDE_PANEL_LAYOUT.inspector, px);
    }

    function readStoredExplorerOpen() {
      try {
        return backendLoad(EXPLORER_OPEN_KEY) === '1';
      } catch (_) {
        return false;
      }
    }

    function loadStat() {
      try {
        var o = tryParse(backendLoad(LOAD_STATS_KEY));
        if (o && o.lines > 0 && o.ms > 0) return o;
      } catch (_) {}
      return null;
    }

    function saveStat(stat) {
      try {
        if (!stat || stat.lines <= 0 || stat.ms <= 0) return;
        backendSave(LOAD_STATS_KEY, JSON.stringify({ lines: stat.lines, ms: stat.ms }));
      } catch (_) {}
    }

    function writeStoredExplorerOpen(open) {
      if (open) backendSave(EXPLORER_OPEN_KEY, '1');
      else backendRemove(EXPLORER_OPEN_KEY);
    }

    function readStoredInspectorOpen() {
      try {
        return backendLoad(INSPECTOR_OPEN_KEY) === '1';
      } catch (_) {
        return false;
      }
    }

    function writeStoredInspectorOpen(open) {
      if (open) backendSave(INSPECTOR_OPEN_KEY, '1');
      else backendRemove(INSPECTOR_OPEN_KEY);
    }

    function readStoredInspectorFollow() {
      try {
        var v = backendLoad(INSPECTOR_FOLLOW_KEY);
        if (v === '1') return true;
        if (v === 'off') return false;
        if (globalThis.sessionStorage && globalThis.sessionStorage.getItem(INSPECTOR_FOLLOW_KEY) === '1') {
          writeStoredInspectorFollow(true);
          return true;
        }
        return true;
      } catch (_) {
        return true;
      }
    }

    function writeStoredInspectorFollow(on) {
      try {
        if (on) backendSave(INSPECTOR_FOLLOW_KEY, '1');
        else backendSave(INSPECTOR_FOLLOW_KEY, 'off');
        if (globalThis.sessionStorage) globalThis.sessionStorage.removeItem(INSPECTOR_FOLLOW_KEY);
      } catch (_) {}
    }

    function readStoredLibraryOpen() {
      try {
        return backendLoad(LIBRARY_OPEN_KEY) === '1';
      } catch (_) {
        return false;
      }
    }

    function writeStoredLibraryOpen(open) {
      if (open) backendSave(LIBRARY_OPEN_KEY, '1');
      else backendRemove(LIBRARY_OPEN_KEY);
    }

    function readStoredHarpoonOpen() {
      try {
        return backendLoad('beljar-harpoon-open') === '1';
      } catch (_) {
        return false;
      }
    }

    function writeStoredHarpoonOpen(open) {
      if (open) backendSave('beljar-harpoon-open', '1');
      else backendRemove('beljar-harpoon-open');
    }

    function readStoredHarpoonDetailsCollapsed() {
      try {
        return backendLoad('beljar-harpoon-details-collapsed') === '1';
      } catch (_) {
        return false;
      }
    }

    function writeStoredHarpoonDetailsCollapsed(collapsed) {
      if (collapsed) backendSave('beljar-harpoon-details-collapsed', '1');
      else backendRemove('beljar-harpoon-details-collapsed');
    }

    function readStoredLibraryWidth() {
      return readStoredSidePanelWidth(SIDE_PANEL_LAYOUT.library);
    }

    function writeStoredLibraryWidth(px) {
      writeStoredSidePanelWidth(SIDE_PANEL_LAYOUT.library, px);
    }

    function readStoredLibraryHeight() {
      return readStoredSidePanelHeight(SIDE_PANEL_LAYOUT.library);
    }

    function writeStoredLibraryHeight(px) {
      writeStoredSidePanelHeight(SIDE_PANEL_LAYOUT.library, px);
    }

    function readStoredHarpoonWidth() {
      return readStoredSidePanelWidth(SIDE_PANEL_LAYOUT.harpoon);
    }

    function writeStoredHarpoonWidth(px) {
      writeStoredSidePanelWidth(SIDE_PANEL_LAYOUT.harpoon, px);
    }

    function readStoredHarpoonHeight() {
      return readStoredSidePanelHeight(SIDE_PANEL_LAYOUT.harpoon);
    }

    function writeStoredHarpoonHeight(px) {
      writeStoredSidePanelHeight(SIDE_PANEL_LAYOUT.harpoon, px);
    }

    return {
      resetLayoutPrefs: resetLayoutPrefs,
      workspaceKeyFor: workspaceKeyFor,
      activeSidePanelKey: activeSidePanelKey,
      migrateActiveSidePanelFromLegacy: migrateActiveSidePanelFromLegacy,
      readStoredActiveSidePanel: readStoredActiveSidePanel,
      writeStoredActiveSidePanel: writeStoredActiveSidePanel,
      readStoredWorkspace: readStoredWorkspace,
      writeStoredWorkspace: writeStoredWorkspace,
      resetStoredWorkspace: resetStoredWorkspace,
      resetWorkspaceState: resetWorkspaceState,
      resetWorkspacePrefs: resetWorkspacePrefs,
      clampEditorSplit: clampEditorSplit,
      readStoredEditorSplit: readStoredEditorSplit,
      writeStoredEditorSplit: writeStoredEditorSplit,
      clampPanelPx: clampPanelPx,
      readStoredSidePanelWidth: readStoredSidePanelWidth,
      writeStoredSidePanelWidth: writeStoredSidePanelWidth,
      readStoredSidePanelHeight: readStoredSidePanelHeight,
      writeStoredSidePanelHeight: writeStoredSidePanelHeight,
      readStoredExplorerWidth: readStoredExplorerWidth,
      writeStoredExplorerWidth: writeStoredExplorerWidth,
      readStoredInspectorWidth: readStoredInspectorWidth,
      writeStoredInspectorWidth: writeStoredInspectorWidth,
      readStoredExplorerHeight: readStoredExplorerHeight,
      writeStoredExplorerHeight: writeStoredExplorerHeight,
      readStoredInspectorHeight: readStoredInspectorHeight,
      writeStoredInspectorHeight: writeStoredInspectorHeight,
      readStoredExplorerOpen: readStoredExplorerOpen,
      loadStat: loadStat,
      saveStat: saveStat,
      writeStoredExplorerOpen: writeStoredExplorerOpen,
      readStoredInspectorOpen: readStoredInspectorOpen,
      writeStoredInspectorOpen: writeStoredInspectorOpen,
      readStoredInspectorFollow: readStoredInspectorFollow,
      writeStoredInspectorFollow: writeStoredInspectorFollow,
      readStoredLibraryOpen: readStoredLibraryOpen,
      writeStoredLibraryOpen: writeStoredLibraryOpen,
      readStoredHarpoonOpen: readStoredHarpoonOpen,
      writeStoredHarpoonOpen: writeStoredHarpoonOpen,
      readStoredHarpoonDetailsCollapsed: readStoredHarpoonDetailsCollapsed,
      writeStoredHarpoonDetailsCollapsed: writeStoredHarpoonDetailsCollapsed,
      readStoredLibraryWidth: readStoredLibraryWidth,
      writeStoredLibraryWidth: writeStoredLibraryWidth,
      readStoredLibraryHeight: readStoredLibraryHeight,
      writeStoredLibraryHeight: writeStoredLibraryHeight,
      readStoredHarpoonWidth: readStoredHarpoonWidth,
      writeStoredHarpoonWidth: writeStoredHarpoonWidth,
      readStoredHarpoonHeight: readStoredHarpoonHeight,
      writeStoredHarpoonHeight: writeStoredHarpoonHeight,
    };
  }
