/**
 * Graph preference storage — used by Persist facade.
 * Keys and backend accessors are injected so persist.js stays the single Persist owner.
 */
export function create(deps) {
    var DEFAULT_GRAPH_PREFS = deps.DEFAULT_GRAPH_PREFS;
    var GRAPH_PREFS_STORAGE_KEY = deps.GRAPH_PREFS_STORAGE_KEY;
    var LEGACY_GRAPH_LAYOUT_KEY = deps.LEGACY_GRAPH_LAYOUT_KEY;
    var LEGACY_GRAPH_IMPL_KEY = deps.LEGACY_GRAPH_IMPL_KEY;
    var LEGACY_GRAPH_DEPTH_KEY = deps.LEGACY_GRAPH_DEPTH_KEY;
    var LEGACY_GRAPH_SIDEBAR_KEY = deps.LEGACY_GRAPH_SIDEBAR_KEY;
    var backendLoad = deps.backendLoad;
    var backendSave = deps.backendSave;
    var backendRemove = deps.backendRemove;
    var tryParse = deps.tryParse;

    function normalizeGraphPrefs(raw) {
      if (!raw || typeof raw !== 'object') {
        return {
          layout: DEFAULT_GRAPH_PREFS.layout,
          impl: DEFAULT_GRAPH_PREFS.impl,
          depth: DEFAULT_GRAPH_PREFS.depth,
          labelDensity: DEFAULT_GRAPH_PREFS.labelDensity,
          sidebarCollapsed: DEFAULT_GRAPH_PREFS.sidebarCollapsed,
        };
      }
      var depth = parseInt(raw.depth, 10);
      if (!isFinite(depth)) depth = DEFAULT_GRAPH_PREFS.depth;
      depth = Math.min(3, Math.max(1, depth));
      var labelDensity = parseInt(raw.labelDensity, 10);
      if (!isFinite(labelDensity)) labelDensity = DEFAULT_GRAPH_PREFS.labelDensity;
      labelDensity = Math.min(5, Math.max(1, labelDensity));
      return {
        layout: raw.layout === 'flat' ? 'flat' : 'force',
        impl: raw.impl === 'hide' ? 'hide' : 'show',
        depth: depth,
        labelDensity: labelDensity,
        sidebarCollapsed: !!raw.sidebarCollapsed,
      };
    }

    function migrateLegacyGraphPrefs() {
      var prefs = normalizeGraphPrefs(null);
      var touched = false;
      try {
        var layout = backendLoad(LEGACY_GRAPH_LAYOUT_KEY);
        if (layout === 'flat') { prefs.layout = 'flat'; touched = true; }
        var impl = backendLoad(LEGACY_GRAPH_IMPL_KEY);
        if (impl === 'hide' || impl === 'nodes' || impl === 'none') { prefs.impl = 'hide'; touched = true; }
        var depth = parseInt(backendLoad(LEGACY_GRAPH_DEPTH_KEY) || '', 10);
        if (isFinite(depth)) { prefs.depth = Math.min(3, Math.max(1, depth)); touched = true; }
        var sidebar = backendLoad(LEGACY_GRAPH_SIDEBAR_KEY);
        if (sidebar === 'collapsed') { prefs.sidebarCollapsed = true; touched = true; }
        if (touched) {
          backendSave(GRAPH_PREFS_STORAGE_KEY, JSON.stringify(prefs));
          backendRemove(LEGACY_GRAPH_LAYOUT_KEY);
          backendRemove(LEGACY_GRAPH_IMPL_KEY);
          backendRemove(LEGACY_GRAPH_DEPTH_KEY);
          backendRemove(LEGACY_GRAPH_SIDEBAR_KEY);
        }
      } catch (_) {}
      return prefs;
    }

    function readStoredGraphPrefs() {
      try {
        var parsed = tryParse(backendLoad(GRAPH_PREFS_STORAGE_KEY));
        if (parsed) return normalizeGraphPrefs(parsed);
        return migrateLegacyGraphPrefs();
      } catch (_) {
        return normalizeGraphPrefs(null);
      }
    }

    function writeStoredGraphPrefs(partial) {
      var next = normalizeGraphPrefs(Object.assign({}, readStoredGraphPrefs(), partial || {}));
      backendSave(GRAPH_PREFS_STORAGE_KEY, JSON.stringify(next));
      return next;
    }

    return {
      normalizeGraphPrefs: normalizeGraphPrefs,
      migrateLegacyGraphPrefs: migrateLegacyGraphPrefs,
      readStoredGraphPrefs: readStoredGraphPrefs,
      writeStoredGraphPrefs: writeStoredGraphPrefs,
    };
  }
