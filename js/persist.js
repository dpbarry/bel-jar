(function (global) {
  var SCHEMA_VERSION = 2;
  var LEGACY_SCHEMA_VERSION = 1;
  var STATE_KEY = 'beljar-state-v2';
  var LEGACY_STATE_KEY = 'beljar-state-v1';
  var LEGACY_SEMANTIC_TYPES_KEY = 'beljar:semantic-types';
  var DEFAULT_DOCUMENT_ID = 'workspace://main.bel';
  var THEME_STORAGE_KEY = 'beljar-theme';
  var BELUGA_MODE_STORAGE_KEY = 'beljar-beluga-mode';
  var EDITOR_SPLIT_STORAGE_KEY = global.BELJAR_SPLIT_KEY || 'beljar-editor-split';
  var GRAPH_PREFS_STORAGE_KEY = 'beljar-graph-prefs';
  var LEGACY_GRAPH_LAYOUT_KEY = 'beljar:graph-layout';
  var LEGACY_GRAPH_IMPL_KEY = 'beljar:graph-impl';
  var LEGACY_GRAPH_DEPTH_KEY = 'beljar:graph-depth';
  var LEGACY_GRAPH_SIDEBAR_KEY = 'beljar:graph-sidebar';
  var PROJECT_FILES_KEY = 'beljar-project-files';
  var PROJECT_NAME_KEY = 'beljar-project-name';
  var DEFAULT_CFG_KEY = 'beljar-default-cfg';
  var ACTIVE_FILE_KEY = 'beljar-active-file';
  var OPEN_FILES_KEY = 'beljar-open-files';
  var DEFAULT_PROJECT_NAME = 'Untitled';
  // Projects are the top container: files live in folders live in a project,
  // and every project is saved in main storage. Only the ACTIVE project is
  // loaded into the editor/engine (hot memory); the rest sit dormant in
  // localStorage under namespaced keys. The first/legacy project keeps the
  // historical flat keys so existing data migrates with zero loss.
  var PROJECTS_KEY = 'beljar-projects';
  var ACTIVE_PROJECT_KEY = 'beljar-active-project';
  var DEFAULT_PROJECT_ID = 'default';
  var DEFAULT_GRAPH_PREFS = Object.freeze({
    layout: 'force',
    impl: 'show',
    depth: 1,
    labelDensity: 3,
    sidebarCollapsed: false,
  });
  var DEFAULT_EDITOR_SPLIT = global.BELJAR_SPLIT_DEFAULT != null ? global.BELJAR_SPLIT_DEFAULT : 0.5;
  var MIN_EDITOR_SPLIT = global.BELJAR_SPLIT_MIN != null ? global.BELJAR_SPLIT_MIN : 0.18;
  var MAX_EDITOR_SPLIT = global.BELJAR_SPLIT_MAX != null ? global.BELJAR_SPLIT_MAX : 0.82;
  var EXPLORER_WIDTH_KEY = 'beljar-explorer-w';
  var INSPECTOR_WIDTH_KEY = 'beljar-inspector-w';
  var EXPLORER_HEIGHT_KEY = 'beljar-explorer-h';
  var INSPECTOR_HEIGHT_KEY = 'beljar-inspector-h';
  var EXPLORER_OPEN_KEY = 'beljar-explorer-open';
  var LOAD_STATS_KEY = 'beljar.loadStats';
  var INSPECTOR_OPEN_KEY = 'beljar-inspector-open';
  var DEFAULT_EXPLORER_WIDTH = 224;
  var DEFAULT_INSPECTOR_WIDTH = 256;
  var MIN_EXPLORER_WIDTH = 160;
  var MAX_EXPLORER_WIDTH = 512;
  var MIN_INSPECTOR_WIDTH = 160;
  var MAX_INSPECTOR_WIDTH = 512;
  var DEFAULT_EXPLORER_HEIGHT = 160;
  var DEFAULT_INSPECTOR_HEIGHT = 192;
  var MIN_EXPLORER_HEIGHT = 96;
  var MAX_EXPLORER_HEIGHT = 320;
  var MIN_INSPECTOR_HEIGHT = 96;
  var MAX_INSPECTOR_HEIGHT = 384;

  var textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

  function tryParse(json) {
    try {
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }

  function utf8Bytes(text) {
    if (textEncoder) return textEncoder.encode(text);
    var encoded = unescape(encodeURIComponent(text));
    var bytes = new Uint8Array(encoded.length);
    for (var i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i);
    return bytes;
  }

  function documentFingerprint(code) {
    var text = String(code != null ? code : '');
    var bytes = utf8Bytes(text);
    var hash = 0x811c9dc5;
    for (var i = 0; i < bytes.length; i++) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return bytes.length + ':' + hash.toString(16).padStart(8, '0');
  }

  function createLocalStorageBackend(store) {
    store = store || global.localStorage;
    return {
      loadSync: function (key) {
        try {
          return store.getItem(key);
        } catch (_) {
          return null;
        }
      },
      saveSync: function (key, value) {
        store.setItem(key, value);
      },
      removeSync: function (key) {
        try {
          store.removeItem(key);
        } catch (_) {}
      },
    };
  }

  function createMemoryBackend(initial) {
    var store = initial ? Object.assign({}, initial) : {};
    return {
      loadSync: function (key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      saveSync: function (key, value) {
        store[key] = value;
      },
      removeSync: function (key) {
        delete store[key];
      },
      _dump: function () {
        return Object.assign({}, store);
      },
    };
  }

  /** @deprecated use createLocalStorageBackend */
  function createLocalStorageAdapter(store) {
    var backend = createLocalStorageBackend(store);
    return {
      getItem: function (key) { return backend.loadSync(key); },
      setItem: function (key, value) {
        try { backend.saveSync(key, value); } catch (_) {}
      },
      removeItem: function (key) { backend.removeSync(key); },
    };
  }

  var defaultBackend = createLocalStorageBackend();

  function slugify(s) {
    return String(s).replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  // Storage-key prefix for the active (or given) project. The default project
  // resolves to '' — its keys stay flat (historical names) so existing data
  // never needs migrating; other projects are siloed under their own prefix.
  function projectPrefix(pid) {
    pid = pid || getActiveProjectId();
    return pid === DEFAULT_PROJECT_ID ? '' : 'beljar-proj:' + slugify(pid) + ':';
  }

  // Map a logical project-scoped resource to its storage key.
  function projKey(suffix, pid) {
    var prefix = projectPrefix(pid);
    if (prefix === '') {
      if (suffix === 'files') return PROJECT_FILES_KEY;
      if (suffix === 'active-file') return ACTIVE_FILE_KEY;
      if (suffix === 'open-files') return OPEN_FILES_KEY;
      if (suffix === 'default-cfg') return DEFAULT_CFG_KEY;
    }
    return prefix + suffix;
  }

  function stateKeyFor(id, pid) {
    var prefix = projectPrefix(pid);
    if (prefix === '') {
      if (!id || id === DEFAULT_DOCUMENT_ID) return STATE_KEY;
      return 'beljar-file:' + slugify(id);
    }
    if (!id || id === DEFAULT_DOCUMENT_ID) return prefix + 'state-v2';
    return prefix + 'file:' + slugify(id);
  }

  function backendLoad(key) {
    return defaultBackend.loadSync(key);
  }

  function backendSave(key, value) {
    try {
      defaultBackend.saveSync(key, value);
    } catch (_) {}
  }

  function backendRemove(key) {
    defaultBackend.removeSync(key);
  }

  function emptyState(documentId) {
    return {
      v: SCHEMA_VERSION,
      meta: {
        documentId: documentId || DEFAULT_DOCUMENT_ID,
        updatedAt: 0,
        revision: 0,
      },
      editor: {
        text: '',
        local: {},
      },
      semantic: null,
    };
  }

  function normalizeLocal(raw) {
    if (!raw || typeof raw !== 'object') return {};
    var out = {};
    if (raw.selection && typeof raw.selection === 'object') {
      var a = Number(raw.selection.anchor);
      var h = Number(raw.selection.head);
      if (isFinite(a) && isFinite(h)) out.selection = { anchor: a, head: h };
    }
    var cl = Number(raw.centerLine);
    if (isFinite(cl) && cl >= 1) out.centerLine = Math.floor(cl);
    return out;
  }

  function normalizeSemantic(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var types = raw.types && typeof raw.types === 'object' ? raw.types : null;
    if (!types && !raw.identity && !raw.deriveAttempted) return null;
    return {
      docFp: typeof raw.docFp === 'string' ? raw.docFp : '',
      belugaBuild: raw.belugaBuild === 'fast' ? 'fast' : 'stable',
      types: types || { v: 1, decls: [], metavars: [], reconstructed: [] },
      identity: Array.isArray(raw.identity) ? raw.identity : [],
      deriveAttempted: Array.isArray(raw.deriveAttempted) ? raw.deriveAttempted : [],
    };
  }

  function normalizeLoaded(raw, documentId) {
    var base = emptyState(documentId);
    if (!raw || typeof raw !== 'object') return base;

    if (raw.v === SCHEMA_VERSION) {
      if (raw.meta && typeof raw.meta === 'object') {
        if (typeof raw.meta.documentId === 'string') base.meta.documentId = raw.meta.documentId;
        if (typeof raw.meta.updatedAt === 'number') base.meta.updatedAt = raw.meta.updatedAt;
        if (typeof raw.meta.revision === 'number') base.meta.revision = raw.meta.revision;
      }
      if (raw.editor && typeof raw.editor.text === 'string') base.editor.text = raw.editor.text;
      base.editor.local = normalizeLocal(raw.editor && raw.editor.local);
      base.semantic = normalizeSemantic(raw.semantic);
      return base;
    }

    if (raw.v === LEGACY_SCHEMA_VERSION && raw.editor && typeof raw.editor.text === 'string') {
      base.editor.text = raw.editor.text;
    }
    return base;
  }

  function migrateLegacySemantic(state, backend) {
    if (state.semantic) return state;
    var raw = backend.loadSync(LEGACY_SEMANTIC_TYPES_KEY);
    if (!raw) return state;
    var types = tryParse(raw);
    if (!types) return state;
    state.semantic = {
      docFp: documentFingerprint(state.editor.text),
      belugaBuild: readStoredBelugaMode(),
      types: types,
      identity: [],
      deriveAttempted: [],
    };
    backend.removeSync(LEGACY_SEMANTIC_TYPES_KEY);
    return state;
  }

  function readState(backend, documentId) {
    var b = backend || defaultBackend;
    var key = stateKeyFor(documentId);
    var parsed = tryParse(b.loadSync(key));
    var state = normalizeLoaded(parsed, documentId);
    if (parsed && parsed.v === SCHEMA_VERSION) {
      return migrateLegacySemantic(state, b);
    }
    // Only check legacy key for the default document.
    if (key === STATE_KEY) {
      var legacy = tryParse(b.loadSync(LEGACY_STATE_KEY));
      if (legacy) {
        state = normalizeLoaded(legacy, documentId);
        b.removeSync(LEGACY_STATE_KEY);
      }
    }
    return migrateLegacySemantic(state, b);
  }

  var readStateForId = readState;

  function semanticHasPayload(semantic) {
    if (!semantic || !semantic.types) return false;
    var t = semantic.types;
    return !!(
      (t.decls && t.decls.length) ||
      (t.metavars && t.metavars.length) ||
      (t.reconstructed && t.reconstructed.length) ||
      (semantic.identity && semantic.identity.length) ||
      (semantic.deriveAttempted && semantic.deriveAttempted.length)
    );
  }

  function trimSemanticForQuota(semantic) {
    if (!semantic) return null;
    var next = JSON.parse(JSON.stringify(semantic));
    next.deriveAttempted = [];
    if (next.types && next.types.metavars && next.types.metavars.length > 32) {
      next.types.metavars = next.types.metavars.slice(-32);
    }
    return next;
  }

  function writeState(backend, state) {
    var b = backend || defaultBackend;
    var key = stateKeyFor(state.meta && state.meta.documentId);
    try {
      b.saveSync(key, JSON.stringify(state));
      return true;
    } catch (err) {
      if (!err || err.name !== 'QuotaExceededError') return false;
      if (state.semantic) {
        state.semantic = trimSemanticForQuota(state.semantic);
        try {
          b.saveSync(key, JSON.stringify(state));
          return true;
        } catch (_) {}
      }
      if (typeof global.BelJarToasts !== 'undefined' && global.BelJarToasts.error) {
        global.BelJarToasts.error('Storage quota exceeded — could not save.', {
          duration: 0,
          closable: true,
        });
      }
      return false;
    }
  }

  function createPersist(opts) {
    opts = opts || {};
    var backend = opts.backend || defaultBackend;
    var documentId = opts.documentId || DEFAULT_DOCUMENT_ID;
    var debounceMs = opts.debounceMs != null ? opts.debounceMs : 320;

    var state = readStateForId(backend, documentId);
    var saveTimer = null;
    var providers = null;

    function collectSemantic() {
      if (!providers || typeof providers.getSemantic !== 'function') return state.semantic;
      var exported = providers.getSemantic();
      if (!exported) return state.semantic;
      var text = state.editor.text;
      var docFp = typeof providers.getDocFp === 'function'
        ? providers.getDocFp(text)
        : documentFingerprint(text);
      var belugaBuild = typeof providers.getBelugaBuild === 'function'
        ? providers.getBelugaBuild()
        : readStoredBelugaMode();
      var semantic = {
        docFp: docFp,
        belugaBuild: belugaBuild,
        types: exported.types || { v: 1, decls: [], metavars: [], reconstructed: [] },
        identity: exported.identity || [],
        deriveAttempted: exported.deriveAttempted || [],
      };
      return semanticHasPayload(semantic) ? semantic : null;
    }

    function collectLocal() {
      if (providers && typeof providers.getViewport === 'function') {
        return normalizeLocal(providers.getViewport());
      }
      return state.editor.local || {};
    }

    function persistNow() {
      clearTimeout(saveTimer);
      saveTimer = null;
      state.meta.updatedAt = Date.now();
      state.meta.revision += 1;
      state.editor.local = collectLocal();
      state.semantic = collectSemantic();
      writeState(backend, state);
    }

    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = global.setTimeout(persistNow, debounceMs);
    }

    function scheduleEditorPersist(text) {
      state.editor.text = String(text != null ? text : '');
      scheduleSave();
    }

    function flushCheckpoint() {
      persistNow();
    }

    /** @deprecated use flushCheckpoint */
    function flushEditor() {
      flushCheckpoint();
    }

    function exportSnapshot() {
      return JSON.parse(JSON.stringify(state));
    }

    function importSnapshot(snapshot, flush) {
      state = normalizeLoaded(snapshot, documentId);
      if (flush) persistNow();
    }

    function setCheckpointProviders(next) {
      providers = next || null;
    }

    function setBackend(next) {
      backend = next || defaultBackend;
      state = readStateForId(backend, documentId);
    }

    function switchFile(newId) {
      if (!newId) return null;
      // Flush current file before switching (providers still reflect it).
      persistNow();
      // Drop the providers: they point at the OLD document's engine. If a save
      // fires before the new editor remounts and re-sets them, it must fall
      // back to the freshly loaded state, never collect old-engine data under
      // the new key.
      providers = null;
      documentId = newId;
      state = readStateForId(backend, documentId);
      return exportSnapshot();
    }

    function getCurrentFileId() {
      return documentId;
    }

    return {
      getEditorText: function () {
        return state.editor.text;
      },
      getEditorLocal: function () {
        return normalizeLocal(state.editor.local);
      },
      getSemanticCheckpoint: function () {
        return state.semantic ? JSON.parse(JSON.stringify(state.semantic)) : null;
      },
      getInitialCheckpoint: exportSnapshot,
      scheduleEditorPersist: scheduleEditorPersist,
      scheduleCheckpointSave: scheduleSave,
      flushCheckpoint: flushCheckpoint,
      flushEditor: flushEditor,
      exportSnapshot: exportSnapshot,
      importSnapshot: importSnapshot,
      setCheckpointProviders: setCheckpointProviders,
      setBackend: setBackend,
      switchFile: switchFile,
      getCurrentFileId: getCurrentFileId,
      /** @deprecated use setBackend */
      setAdapter: function (adapter) {
        if (!adapter) return;
        setBackend({
          loadSync: function (k) { return adapter.getItem(k); },
          saveSync: function (k, v) { adapter.setItem(k, v); },
          removeSync: function (k) { adapter.removeItem(k); },
        });
      },
    };
  }

  function readStoredTheme() {
    try {
      return backendLoad(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
    } catch (_) {
      return 'dark';
    }
  }

  function writeStoredTheme(mode) {
    if (mode === 'light') backendSave(THEME_STORAGE_KEY, 'light');
    else backendRemove(THEME_STORAGE_KEY);
  }

  function readStoredBelugaMode() {
    try {
      var v = backendLoad(BELUGA_MODE_STORAGE_KEY);
      if (v === 'fast' || v === 'stable') return v;
      var old = backendLoad('beljar-beluga-build');
      return (old === 'fast' || old === 'auto') ? 'fast' : 'stable';
    } catch (_) {
      return 'stable';
    }
  }

  function writeStoredBelugaMode(mode) {
    backendSave(BELUGA_MODE_STORAGE_KEY, mode);
  }

  var HOVER_SCOPE_KEY = 'beljar-hover-scope';

  function readStoredHoverScope() {
    try {
      var v = backendLoad(HOVER_SCOPE_KEY);
      return v === 'user-only' ? 'user-only' : 'all';
    } catch (_) {
      return 'all';
    }
  }

  function writeStoredHoverScope(scope) {
    if (scope === 'all') {
      backendRemove(HOVER_SCOPE_KEY);
    } else {
      backendSave(HOVER_SCOPE_KEY, scope);
    }
  }

  var ALIAS_ACTIVATION_KEY = 'beljar-alias-activation';

  function readStoredAliasActivation() {
    try {
      var v = backendLoad(ALIAS_ACTIVATION_KEY);
      return v === 'greedy' ? 'greedy' : 'strict';
    } catch (_) {
      return 'strict';
    }
  }

  function writeStoredAliasActivation(mode) {
    if (mode === 'greedy') backendSave(ALIAS_ACTIVATION_KEY, 'greedy');
    else backendRemove(ALIAS_ACTIVATION_KEY);
  }

  function isAliasExpandablePath(name) {
    var n = String(name || '').toLowerCase();
    return n.endsWith('.bel') || n.endsWith('.elf');
  }

  function fileNameForId(id) {
    var files = ensureProject();
    for (var i = 0; i < files.length; i++) {
      if (files[i].id === id) return files[i].name || '';
    }
    return '';
  }

  function expandAliasesForStorage(text, fileName) {
    if (readStoredAliasActivation() !== 'greedy') return String(text != null ? text : '');
    if (!isAliasExpandablePath(fileName)) return String(text != null ? text : '');
    if (typeof BelJarEditor !== 'undefined' && typeof BelJarEditor.expandBelAliases === 'function') {
      return BelJarEditor.expandBelAliases(text);
    }
    return String(text != null ? text : '');
  }

  function expandAliasesInAllFiles() {
    if (readStoredAliasActivation() !== 'greedy') return 0;
    var files = ensureProject();
    var changed = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!isAliasExpandablePath(f.name)) continue;
      var cur = getFileText(f.id);
      var next = expandAliasesForStorage(cur, f.name);
      if (next !== cur) {
        var state = readState(defaultBackend, f.id);
        state.editor.text = next;
        state.meta.updatedAt = Date.now();
        state.meta.revision = (state.meta.revision || 0) + 1;
        backendSave(stateKeyFor(f.id), JSON.stringify(state));
        changed += 1;
      }
    }
    return changed;
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

  function readStoredExplorerWidth() {
    try {
      return clampPanelPx(
        parseFloat(backendLoad(EXPLORER_WIDTH_KEY)),
        MIN_EXPLORER_WIDTH,
        MAX_EXPLORER_WIDTH,
        DEFAULT_EXPLORER_WIDTH
      );
    } catch (_) {
      return DEFAULT_EXPLORER_WIDTH;
    }
  }

  function writeStoredExplorerWidth(px) {
    var clamped = clampPanelPx(px, MIN_EXPLORER_WIDTH, MAX_EXPLORER_WIDTH, DEFAULT_EXPLORER_WIDTH);
    if (clamped === DEFAULT_EXPLORER_WIDTH) backendRemove(EXPLORER_WIDTH_KEY);
    else backendSave(EXPLORER_WIDTH_KEY, String(clamped));
  }

  function readStoredInspectorWidth() {
    try {
      return clampPanelPx(
        parseFloat(backendLoad(INSPECTOR_WIDTH_KEY)),
        MIN_INSPECTOR_WIDTH,
        MAX_INSPECTOR_WIDTH,
        DEFAULT_INSPECTOR_WIDTH
      );
    } catch (_) {
      return DEFAULT_INSPECTOR_WIDTH;
    }
  }

  function writeStoredInspectorWidth(px) {
    var clamped = clampPanelPx(px, MIN_INSPECTOR_WIDTH, MAX_INSPECTOR_WIDTH, DEFAULT_INSPECTOR_WIDTH);
    if (clamped === DEFAULT_INSPECTOR_WIDTH) backendRemove(INSPECTOR_WIDTH_KEY);
    else backendSave(INSPECTOR_WIDTH_KEY, String(clamped));
  }

  function readStoredExplorerHeight() {
    try {
      return clampPanelPx(
        parseFloat(backendLoad(EXPLORER_HEIGHT_KEY)),
        MIN_EXPLORER_HEIGHT,
        MAX_EXPLORER_HEIGHT,
        DEFAULT_EXPLORER_HEIGHT
      );
    } catch (_) {
      return DEFAULT_EXPLORER_HEIGHT;
    }
  }

  function writeStoredExplorerHeight(px) {
    var clamped = clampPanelPx(px, MIN_EXPLORER_HEIGHT, MAX_EXPLORER_HEIGHT, DEFAULT_EXPLORER_HEIGHT);
    if (clamped === DEFAULT_EXPLORER_HEIGHT) backendRemove(EXPLORER_HEIGHT_KEY);
    else backendSave(EXPLORER_HEIGHT_KEY, String(clamped));
  }

  function readStoredInspectorHeight() {
    try {
      return clampPanelPx(
        parseFloat(backendLoad(INSPECTOR_HEIGHT_KEY)),
        MIN_INSPECTOR_HEIGHT,
        MAX_INSPECTOR_HEIGHT,
        DEFAULT_INSPECTOR_HEIGHT
      );
    } catch (_) {
      return DEFAULT_INSPECTOR_HEIGHT;
    }
  }

  function writeStoredInspectorHeight(px) {
    var clamped = clampPanelPx(px, MIN_INSPECTOR_HEIGHT, MAX_INSPECTOR_HEIGHT, DEFAULT_INSPECTOR_HEIGHT);
    if (clamped === DEFAULT_INSPECTOR_HEIGHT) backendRemove(INSPECTOR_HEIGHT_KEY);
    else backendSave(INSPECTOR_HEIGHT_KEY, String(clamped));
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

  function explorerFoldKey(projectName) {
    return 'beljar-explorer-fold:' + String(projectName || DEFAULT_PROJECT_NAME);
  }

  function getExplorerFold(projectName) {
    try {
      var arr = tryParse(backendLoad(explorerFoldKey(projectName)));
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function setExplorerFold(projectName, paths) {
    try {
      backendSave(explorerFoldKey(projectName), JSON.stringify(Array.isArray(paths) ? paths : []));
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

  // ── Projects (top-level containers) ───────────────────────────────────────

  function readProjects() {
    var raw = tryParse(backendLoad(PROJECTS_KEY));
    return Array.isArray(raw) && raw.length ? raw : null;
  }

  function writeProjects(projects) {
    backendSave(PROJECTS_KEY, JSON.stringify(projects));
  }

  // First run / migration: wrap whatever is already stored under the flat keys
  // as the "default" project, so existing work survives untouched.
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

  // Create an empty project silo: registry entry + one blank main.bel. Does NOT
  // switch the active project (the caller activates + reloads). Returns its id.
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
    // Seed the silo with a single empty file under its namespaced keys.
    backendSave(projKey('files', id), JSON.stringify([{ id: DEFAULT_DOCUMENT_ID, name: 'main.bel' }]));
    backendSave(projKey('active-file', id), DEFAULT_DOCUMENT_ID);
    backendSave(projKey('open-files', id), JSON.stringify([DEFAULT_DOCUMENT_ID]));
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

  // Remove a project and every key it owns. Refuses to delete the last project.
  // Returns the id to make active next (or null on refusal).
  function deleteProject(id) {
    var projects = ensureProjects();
    if (projects.length <= 1) return null;
    var idx = -1;
    for (var i = 0; i < projects.length; i++) {
      if (projects[i].id === id) { idx = i; break; }
    }
    if (idx === -1) return null;
    // Drop every per-file state key, then the control keys.
    var files = tryParse(backendLoad(projKey('files', id)));
    if (Array.isArray(files)) {
      for (var j = 0; j < files.length; j++) backendRemove(stateKeyFor(files[j].id, id));
    }
    backendRemove(projKey('files', id));
    backendRemove(projKey('active-file', id));
    backendRemove(projKey('open-files', id));
    backendRemove(projKey('default-cfg', id));
    projects.splice(idx, 1);
    writeProjects(projects);
    var nextId = projects[Math.max(0, idx - 1)].id;
    if (getActiveProjectId() === id) setActiveProjectId(nextId);
    return nextId;
  }

  // ── Project file registry (scoped to the active project) ──────────────────

  function readProjectFiles() {
    var raw = tryParse(backendLoad(projKey('files')));
    if (Array.isArray(raw)) return raw;
    return null;
  }

  function writeProjectFiles(files) {
    backendSave(projKey('files'), JSON.stringify(files));
  }

  function ensureProject() {
    var files = readProjectFiles();
    if (files && files.length) return files;
    // First run: create a default file entry from whatever is already stored.
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
    ensureProject();
    var id = backendLoad(projKey('active-file'));
    if (!id) return DEFAULT_DOCUMENT_ID;
    var files = readProjectFiles() || [];
    if (files.some(function (f) { return f.id === id; })) return id;
    return files.length ? files[0].id : DEFAULT_DOCUMENT_ID;
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
    if (options.defaultCfgPath) setDefaultCfgPath(options.defaultCfgPath);
    else setDefaultCfgPath(null);
    return { files: files, activeId: activeId };
  }

  function createFile(name) {
    var files = ensureProject();
    var used = {};
    for (var u = 0; u < files.length; u++) used[files[u].id] = true;
    var id = uniqueFileId(name || 'untitled.bel', used);
    files.push({ id: id, name: name || 'untitled.bel' });
    writeProjectFiles(files);
    return id;
  }

  function deleteFile(id) {
    var files = ensureProject();
    var idx = -1;
    for (var i = 0; i < files.length; i++) {
      if (files[i].id === id) { idx = i; break; }
    }
    if (idx === -1) return null;
    if (getDefaultCfgPath() === files[idx].name) setDefaultCfgPath(null);
    files.splice(idx, 1);
    writeProjectFiles(files);
    closeOpenFile(id);
    // Delete the stored state.
    defaultBackend.removeSync(stateKeyFor(id));
    // Return the id of the file to switch to (previous, next, or null).
    return files.length ? files[Math.max(0, idx - 1)].id : null;
  }

  function renameFile(id, newName) {
    var files = ensureProject();
    for (var i = 0; i < files.length; i++) {
      if (files[i].id === id) {
        if (getDefaultCfgPath() === files[i].name) setDefaultCfgPath(newName);
        files[i].name = newName;
        writeProjectFiles(files);
        return;
      }
    }
  }

  function getFileById(id) {
    var files = ensureProject();
    for (var i = 0; i < files.length; i++) {
      if (files[i].id === id) return files[i];
    }
    return null;
  }

  // ── Open files (tabs) ───────────────────────────────────────────────────────
  // The registry lists EVERY project file (explorer); the open list is the much
  // smaller set shown as tabs. A folder import of hundreds of files must not
  // produce hundreds of tabs.

  function writeOpenFileIds(ids) {
    backendSave(projKey('open-files'), JSON.stringify(ids));
  }

  function getOpenFileIds() {
    var files = ensureProject();
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

  // Registry order IS project order (the order files are concatenated for a
  // whole-project run). Move a file up (-1) or down (+1); clamped at the ends.
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
  function getFileText(id) {
    var state = readState(defaultBackend, id);
    return state && state.editor && typeof state.editor.text === 'string'
      ? state.editor.text
      : '';
  }

  // Write a file's editor text directly (file import path). Preserves any
  // existing local/semantic state under the key.
  function setFileText(id, text) {
    var state = readState(defaultBackend, id);
    state.editor.text = expandAliasesForStorage(text, fileNameForId(id));
    state.meta.updatedAt = Date.now();
    state.meta.revision = (state.meta.revision || 0) + 1;
    backendSave(stateKeyFor(id), JSON.stringify(state));
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

  function getDefaultCfgPath() {
    try {
      var path = backendLoad(projKey('default-cfg'));
      return path && String(path).trim() ? String(path).trim() : null;
    } catch (_) {
      return null;
    }
  }

  function setDefaultCfgPath(path) {
    var trimmed = String(path != null ? path : '').trim();
    if (trimmed) backendSave(projKey('default-cfg'), trimmed);
    else defaultBackend.removeSync(projKey('default-cfg'));
  }

  // Create a blank project and make it active. The caller reloads so the new
  // (empty) silo becomes hot memory. Returns the new project id.
  function newBlankProject(name) {
    var id = createProject(name);
    setActiveProjectId(id);
    return id;
  }

  // Create a new project from an imported file set and make it active. entries:
  // [{ name, text }]. Returns { projectId, files, activeId }.
  function createProjectWithFiles(name, entries, options) {
    var id = createProject(name);
    setActiveProjectId(id); // replaceProject below writes into the new silo
    var result = replaceProject(entries, options || {});
    return { projectId: id, files: result.files, activeId: result.activeId };
  }

  function createAsyncPersistLayer() {
    return {
      push: function () { return Promise.resolve({ ok: false, reason: 'not-configured' }); },
      pull: function () { return Promise.resolve({ ok: false, reason: 'not-configured' }); },
    };
  }

  global.BelJarPersist = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STATE_KEY: STATE_KEY,
    LEGACY_STATE_KEY: LEGACY_STATE_KEY,
    LEGACY_SEMANTIC_TYPES_KEY: LEGACY_SEMANTIC_TYPES_KEY,
    DEFAULT_DOCUMENT_ID: DEFAULT_DOCUMENT_ID,
    THEME_STORAGE_KEY: THEME_STORAGE_KEY,
    EDITOR_SPLIT_STORAGE_KEY: EDITOR_SPLIT_STORAGE_KEY,
    GRAPH_PREFS_STORAGE_KEY: GRAPH_PREFS_STORAGE_KEY,
    DEFAULT_GRAPH_PREFS: DEFAULT_GRAPH_PREFS,
    DEFAULT_EDITOR_SPLIT: DEFAULT_EDITOR_SPLIT,
    MIN_EDITOR_SPLIT: MIN_EDITOR_SPLIT,
    MAX_EDITOR_SPLIT: MAX_EDITOR_SPLIT,
    documentFingerprint: documentFingerprint,
    createLocalStorageBackend: createLocalStorageBackend,
    createMemoryBackend: createMemoryBackend,
    createLocalStorageAdapter: createLocalStorageAdapter,
    createPersist: createPersist,
    createAsyncPersistLayer: createAsyncPersistLayer,
    readStoredTheme: readStoredTheme,
    writeStoredTheme: writeStoredTheme,
    readStoredEditorSplit: readStoredEditorSplit,
    writeStoredEditorSplit: writeStoredEditorSplit,
    readStoredExplorerWidth: readStoredExplorerWidth,
    writeStoredExplorerWidth: writeStoredExplorerWidth,
    readStoredInspectorWidth: readStoredInspectorWidth,
    writeStoredInspectorWidth: writeStoredInspectorWidth,
    readStoredExplorerHeight: readStoredExplorerHeight,
    writeStoredExplorerHeight: writeStoredExplorerHeight,
    readStoredInspectorHeight: readStoredInspectorHeight,
    writeStoredInspectorHeight: writeStoredInspectorHeight,
    readStoredExplorerOpen: readStoredExplorerOpen,
    writeStoredExplorerOpen: writeStoredExplorerOpen,
    loadStat: loadStat,
    saveStat: saveStat,
    getExplorerFold: getExplorerFold,
    setExplorerFold: setExplorerFold,
    readStoredInspectorOpen: readStoredInspectorOpen,
    writeStoredInspectorOpen: writeStoredInspectorOpen,
    readStoredGraphPrefs: readStoredGraphPrefs,
    writeStoredGraphPrefs: writeStoredGraphPrefs,
    normalizeGraphPrefs: normalizeGraphPrefs,
    clampEditorSplit: clampEditorSplit,
    readStoredBelugaMode: readStoredBelugaMode,
    writeStoredBelugaMode: writeStoredBelugaMode,
    readStoredHoverScope: readStoredHoverScope,
    writeStoredHoverScope: writeStoredHoverScope,
    readStoredAliasActivation: readStoredAliasActivation,
    writeStoredAliasActivation: writeStoredAliasActivation,
    expandAliasesInAllFiles: expandAliasesInAllFiles,
    normalizeLoaded: normalizeLoaded,
    emptyState: emptyState,
    // Projects (top-level containers):
    DEFAULT_PROJECT_ID: DEFAULT_PROJECT_ID,
    listProjects: listProjects,
    getActiveProjectId: getActiveProjectId,
    setActiveProjectId: setActiveProjectId,
    getActiveProject: getActiveProject,
    createProject: createProject,
    renameProject: renameProject,
    deleteProject: deleteProject,
    newBlankProject: newBlankProject,
    createProjectWithFiles: createProjectWithFiles,
    // Project/multi-file management:
    ensureProject: ensureProject,
    listFiles: listFiles,
    getActiveFileId: getActiveFileId,
    setActiveFileId: setActiveFileId,
    replaceProject: replaceProject,
    createFile: createFile,
    deleteFile: deleteFile,
    renameFile: renameFile,
    getFileById: getFileById,
    moveFile: moveFile,
    getFileText: getFileText,
    setFileText: setFileText,
    getOpenFileIds: getOpenFileIds,
    openFile: openFile,
    closeOpenFile: closeOpenFile,
    getProjectName: getProjectName,
    setProjectName: setProjectName,
    getDefaultCfgPath: getDefaultCfgPath,
    setDefaultCfgPath: setDefaultCfgPath,
    DEFAULT_PROJECT_NAME: DEFAULT_PROJECT_NAME,
  };
})(typeof window !== 'undefined' ? window : globalThis);
