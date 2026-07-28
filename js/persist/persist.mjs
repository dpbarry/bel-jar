import { create as createUiPrefsApi } from './persist-ui-prefs.mjs';
import { create as createSettingsApi } from './persist-settings.mjs';
import { create as createLayoutApi } from './persist-layout.mjs';
import { create as createGraphPrefsApi } from './persist-graph-prefs.mjs';
import { create as createProjectsApi } from './persist-projects.mjs';
import { create as createFileRegistryApi } from './persist-file-registry.mjs';
import { create as createOpenTabsApi } from './persist-open-tabs.mjs';

var SCHEMA_VERSION = 3;
  var LEGACY_CHECKPOINT_V2 = 2;
  var LEGACY_SCHEMA_VERSION = 1;
  var STATE_KEY = 'beljar-state-v2';
  var LEGACY_STATE_KEY = 'beljar-state-v1';
  var LEGACY_SEMANTIC_TYPES_KEY = 'beljar:semantic-types';
  var DEFAULT_DOCUMENT_ID = 'workspace://main.bel';
  var THEME_STORAGE_KEY = 'beljar-theme';
  var UI_FONT_SIZE_KEY = 'beljar-ui-font-size';
  var UI_FONT_SCALES = { sm: 0.875, md: 1, lg: 1.125, xl: 1.25 };
  var UI_TEXT_CONTRAST_KEY = 'beljar-ui-text-contrast';
  var UI_TEXT_CONTRAST_MULTIPLIERS = { low: 1, medium: 1.6, high: 2.4, maximum: 4.5 };
  var BELUGA_MODE_STORAGE_KEY = 'beljar-beluga-mode';
  var EDITOR_SPLIT_STORAGE_KEY = globalThis.BELJAR_SPLIT_KEY || 'beljar-editor-split';
  var GRAPH_PREFS_STORAGE_KEY = 'beljar-graph-prefs';
  var LEGACY_GRAPH_LAYOUT_KEY = 'beljar:graph-layout';
  var LEGACY_GRAPH_IMPL_KEY = 'beljar:graph-impl';
  var LEGACY_GRAPH_DEPTH_KEY = 'beljar:graph-depth';
  var LEGACY_GRAPH_SIDEBAR_KEY = 'beljar:graph-sidebar';
  var PROJECT_FILES_KEY = 'beljar-project-files';
  var PROJECT_NAME_KEY = 'beljar-project-name';
  var DEFAULT_CFG_KEY = 'beljar-default-cfg';
  var ACTIVE_CFG_BY_DIR_KEY = 'beljar-active-cfg-by-dir';
  var ACTIVE_FILE_KEY = 'beljar-active-file';
  var OPEN_FILES_KEY = 'beljar-open-files';
  var DEFAULT_PROJECT_NAME = 'Untitled Project';
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
  var DEFAULT_EDITOR_SPLIT = globalThis.BELJAR_SPLIT_DEFAULT != null ? globalThis.BELJAR_SPLIT_DEFAULT : 0.5;
  var MIN_EDITOR_SPLIT = globalThis.BELJAR_SPLIT_MIN != null ? globalThis.BELJAR_SPLIT_MIN : 0.18;
  var MAX_EDITOR_SPLIT = globalThis.BELJAR_SPLIT_MAX != null ? globalThis.BELJAR_SPLIT_MAX : 0.82;
  var EXPLORER_WIDTH_KEY = 'beljar-explorer-w';
  var INSPECTOR_WIDTH_KEY = 'beljar-inspector-w';
  var EXPLORER_HEIGHT_KEY = 'beljar-explorer-h';
  var INSPECTOR_HEIGHT_KEY = 'beljar-inspector-h';
  var EXPLORER_OPEN_KEY = 'beljar-explorer-open';
  var LOAD_STATS_KEY = 'beljar.loadStats';
  var INSPECTOR_OPEN_KEY = 'beljar-inspector-open';
  var INSPECTOR_FOLLOW_KEY = 'beljar-inspector-follow';
  var LIBRARY_OPEN_KEY = 'beljar-library-open';
  var LIBRARY_WIDTH_KEY = 'beljar-library-w';
  var LIBRARY_HEIGHT_KEY = 'beljar-library-h';
  var HARPOON_WIDTH_KEY = 'beljar-harpoon-w';
  var HARPOON_HEIGHT_KEY = 'beljar-harpoon-h';
  var DEFAULT_SIDE_PANEL_WIDTH = 250;
  var DEFAULT_SIDE_PANEL_HEIGHT = 190;
  var SIDE_PANEL_LAYOUT = {
    explorer: {
      widthKey: EXPLORER_WIDTH_KEY,
      heightKey: EXPLORER_HEIGHT_KEY,
      minW: 160,
      maxW: 512,
      minH: 96,
      maxH: 320,
    },
    inspector: {
      widthKey: INSPECTOR_WIDTH_KEY,
      heightKey: INSPECTOR_HEIGHT_KEY,
      minW: 160,
      maxW: 512,
      minH: 96,
      maxH: 384,
    },
    library: {
      widthKey: LIBRARY_WIDTH_KEY,
      heightKey: LIBRARY_HEIGHT_KEY,
      minW: 160,
      maxW: 512,
      minH: 96,
      maxH: 384,
    },
    harpoon: {
      widthKey: HARPOON_WIDTH_KEY,
      heightKey: HARPOON_HEIGHT_KEY,
      minW: 160,
      maxW: 512,
      minH: 96,
      maxH: 384,
    },
  };

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
    store = store || globalThis.localStorage;
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
      if (suffix === 'active-cfg-by-dir') return ACTIVE_CFG_BY_DIR_KEY;
    }
    return prefix + suffix;
  }

  function dirOf(name) {
    var i = String(name || '').lastIndexOf('/');
    return i === -1 ? '' : name.slice(0, i);
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

  var _uiPrefsApi = createUiPrefsApi({
      THEME_STORAGE_KEY: THEME_STORAGE_KEY,
      UI_FONT_SIZE_KEY: UI_FONT_SIZE_KEY,
      UI_FONT_SCALES: UI_FONT_SCALES,
      UI_TEXT_CONTRAST_KEY: UI_TEXT_CONTRAST_KEY,
      UI_TEXT_CONTRAST_MULTIPLIERS: UI_TEXT_CONTRAST_MULTIPLIERS,
      backendLoad: backendLoad,
      backendSave: backendSave,
      backendRemove: backendRemove,
    });

  // Accidental character corruption seen in demo sessions (stray "a " before type).
  function healKnownCorruptEditorText(text) {
    if (typeof text !== 'string' || text.indexOf(': a o') === -1) return text;
    return text.replace(/\| ∨ : a o → o → o/g, '| ∨ : o → o → o')
      .replace(/\| ∨ : a o -> o -> o/g, '| ∨ : o -> o -> o')
      .replace(/\| v : a o → o → o/g, '| ∨ : o → o → o')
      .replace(/\| v : a o -> o -> o/g, '| ∨ : o -> o -> o');
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

  function normalizeViewportAnchor(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.kind !== 'string') return null;
    if (raw.kind === 'decl') {
      var di = Number(raw.declIndex);
      var so = Number(raw.sigOffset);
      if (!isFinite(di) || di < 0 || !isFinite(so) || so < 0) return null;
      return { kind: 'decl', declIndex: Math.floor(di), sigOffset: Math.floor(so) };
    }
    if (raw.kind === 'doc') {
      var dso = Number(raw.sigOffset);
      if (!isFinite(dso) || dso < 0) return null;
      var out = { kind: 'doc', sigOffset: Math.floor(dso) };
      var ln = Number(raw.line);
      if (isFinite(ln) && ln >= 1) out.line = Math.floor(ln);
      return out;
    }
    return null;
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
    var st = Number(raw.scrollTop);
    if (isFinite(st) && st >= 0) out.scrollTop = st;
    var sl = Number(raw.scrollLeft);
    if (isFinite(sl) && sl >= 0) out.scrollLeft = sl;
    var va = normalizeViewportAnchor(raw.viewportAnchor);
    if (va) out.viewportAnchor = va;
    return out;
  }

  function normalizeSemantic(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var types = raw.types && typeof raw.types === 'object' ? raw.types : null;
    if (!types && !raw.identity && !raw.deriveAttempted) return null;
    return {
      docFp: typeof raw.docFp === 'string' ? raw.docFp : '',
      scopeKey: typeof raw.scopeKey === 'string' ? raw.scopeKey : '',
      belugaBuild: raw.belugaBuild === 'fast' ? 'fast' : 'stable',
      types: types || { v: 1, decls: [], metavars: [], reconstructed: [] },
      identity: Array.isArray(raw.identity) ? raw.identity : [],
      deriveAttempted: Array.isArray(raw.deriveAttempted) ? raw.deriveAttempted : [],
    };
  }

  function normalizeLoaded(raw, documentId) {
    var base = emptyState(documentId);
    if (!raw || typeof raw !== 'object') return base;

    if (raw.v === SCHEMA_VERSION || raw.v === LEGACY_CHECKPOINT_V2) {
      if (raw.meta && typeof raw.meta === 'object') {
        if (typeof raw.meta.documentId === 'string') base.meta.documentId = raw.meta.documentId;
        if (typeof raw.meta.updatedAt === 'number') base.meta.updatedAt = raw.meta.updatedAt;
        if (typeof raw.meta.revision === 'number') base.meta.revision = raw.meta.revision;
      }
      if (raw.editor && typeof raw.editor.text === 'string') {
        base.editor.text = healKnownCorruptEditorText(raw.editor.text);
      }
      base.editor.local = normalizeLocal(raw.editor && raw.editor.local);
      base.semantic = normalizeSemantic(raw.semantic);
      return base;
    }

    if (raw.v === LEGACY_SCHEMA_VERSION && raw.editor && typeof raw.editor.text === 'string') {
      base.editor.text = healKnownCorruptEditorText(raw.editor.text);
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
      scopeKey: 'legacy',
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
    if (parsed && (parsed.v === SCHEMA_VERSION || parsed.v === LEGACY_CHECKPOINT_V2)) {
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
      if (typeof globalThis.Toasts !== 'undefined' && globalThis.Toasts.error) {
        globalThis.Toasts.error('Storage quota exceeded. Could not save.', {
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
    var debounceMs = opts.debounceMs != null ? opts.debounceMs : readStoredAutosaveDelay();

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
      var scopeKey = typeof exported.scopeKey === 'string' ? exported.scopeKey
        : (typeof providers.getScopeKey === 'function' ? providers.getScopeKey() : '');
      var semantic = {
        docFp: docFp,
        scopeKey: scopeKey,
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

    // Materialize the live document string. Prefer a lazy provider (the editor's
    // live doc) so the whole-buffer toString() happens HERE — at debounced save
    // time, off the input critical path — instead of on every keystroke.
    function collectEditorText() {
      if (providers && typeof providers.getText === 'function') {
        try {
          var live = providers.getText();
          if (live != null) return String(live);
        } catch (_) { /* fall through to last-known text */ }
      }
      return state.editor.text;
    }

    function persistNow() {
      clearTimeout(saveTimer);
      saveTimer = null;
      state.meta.updatedAt = Date.now();
      state.meta.revision += 1;
      state.editor.text = collectEditorText();
      state.editor.local = collectLocal();
      state.semantic = collectSemantic();
      writeState(backend, state);
    }

    function scheduleSave() {
      clearTimeout(saveTimer);
      var delay = opts.debounceMs != null ? debounceMs : readStoredAutosaveDelay();
      saveTimer = globalThis.setTimeout(persistNow, delay);
    }

    // Legacy push path: callers that already hold the string can still hand it
    // over. The lazy getText provider (when set) supersedes this at save time.
    function scheduleEditorPersist(text) {
      if (text != null) state.editor.text = String(text);
      scheduleSave();
    }

    // Input-path entry point: mark the buffer dirty and schedule a save WITHOUT
    // materializing the whole document. persistNow() pulls the live text lazily.
    function markEditorDirty() {
      scheduleSave();
    }

    function cancelPendingSave() {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    // Sync in-memory checkpoint text without scheduling a save (storage already updated).
    function replaceEditorText(text) {
      cancelPendingSave();
      state.editor.text = String(text != null ? text : '');
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
      markEditorDirty: markEditorDirty,
      cancelPendingSave: cancelPendingSave,
      replaceEditorText: replaceEditorText,
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
    return _uiPrefsApi.readStoredTheme();
  }

  function writeStoredTheme(mode) {
    return _uiPrefsApi.writeStoredTheme(mode);
  }

  function readStoredUiFontSize() {
    return _uiPrefsApi.readStoredUiFontSize();
  }

  function writeStoredUiFontSize(size) {
    return _uiPrefsApi.writeStoredUiFontSize(size);
  }

  function uiFontScaleForSize(size) {
    return _uiPrefsApi.uiFontScaleForSize(size);
  }

  function applyStoredUiFontSize(doc) {
    return _uiPrefsApi.applyStoredUiFontSize(doc);
  }

  function readStoredUiTextContrast() {
    return _uiPrefsApi.readStoredUiTextContrast();
  }

  function writeStoredUiTextContrast(contrast) {
    return _uiPrefsApi.writeStoredUiTextContrast(contrast);
  }

  function uiTextContrastMultiplierForLevel(contrast) {
    return _uiPrefsApi.uiTextContrastMultiplierForLevel(contrast);
  }

  function applyStoredUiTextContrast(doc) {
    return _uiPrefsApi.applyStoredUiTextContrast(doc);
  }

  var _settingsApi = createSettingsApi({
    backendLoad: backendLoad,
    backendSave: backendSave,
    backendRemove: backendRemove,
    tryParse: tryParse,
    THEME_STORAGE_KEY: THEME_STORAGE_KEY,
    UI_FONT_SIZE_KEY: UI_FONT_SIZE_KEY,
    UI_TEXT_CONTRAST_KEY: UI_TEXT_CONTRAST_KEY,
    BELUGA_MODE_STORAGE_KEY: BELUGA_MODE_STORAGE_KEY,
    DEFAULT_PROJECT_NAME: DEFAULT_PROJECT_NAME,
    ensureProject: function () { return ensureProject(); },
    getFileText: function (id) { return getFileText(id); },
    readState: readState,
    defaultBackend: defaultBackend,
    stateKeyFor: stateKeyFor,
  });

  function readStoredBelugaMode() {
    return _settingsApi.readStoredBelugaMode.apply(_settingsApi, arguments);
  }

  function writeStoredBelugaMode() {
    return _settingsApi.writeStoredBelugaMode.apply(_settingsApi, arguments);
  }

  function readStoredHoverScope() {
    return _settingsApi.readStoredHoverScope.apply(_settingsApi, arguments);
  }

  function writeStoredHoverScope() {
    return _settingsApi.writeStoredHoverScope.apply(_settingsApi, arguments);
  }

  function readStoredCfgAutoSync() {
    return _settingsApi.readStoredCfgAutoSync.apply(_settingsApi, arguments);
  }

  function writeStoredCfgAutoSync() {
    return _settingsApi.writeStoredCfgAutoSync.apply(_settingsApi, arguments);
  }

  function readStoredAliasActivation() {
    return _settingsApi.readStoredAliasActivation.apply(_settingsApi, arguments);
  }

  function writeStoredAliasActivation() {
    return _settingsApi.writeStoredAliasActivation.apply(_settingsApi, arguments);
  }

  function readStoredAliasPairs() {
    return _settingsApi.readStoredAliasPairs.apply(_settingsApi, arguments);
  }

  function writeStoredAliasPairs() {
    return _settingsApi.writeStoredAliasPairs.apply(_settingsApi, arguments);
  }

  function readBoolDefaultOn() {
    return _settingsApi.readBoolDefaultOn.apply(_settingsApi, arguments);
  }

  function writeBoolDefaultOn() {
    return _settingsApi.writeBoolDefaultOn.apply(_settingsApi, arguments);
  }

  function readBoolDefaultOff() {
    return _settingsApi.readBoolDefaultOff.apply(_settingsApi, arguments);
  }

  function writeBoolDefaultOff() {
    return _settingsApi.writeBoolDefaultOff.apply(_settingsApi, arguments);
  }

  function readStoredReplAutoscroll() {
    return _settingsApi.readStoredReplAutoscroll.apply(_settingsApi, arguments);
  }

  function writeStoredReplAutoscroll() {
    return _settingsApi.writeStoredReplAutoscroll.apply(_settingsApi, arguments);
  }

  function readStoredReplWelcome() {
    return _settingsApi.readStoredReplWelcome.apply(_settingsApi, arguments);
  }

  function writeStoredReplWelcome() {
    return _settingsApi.writeStoredReplWelcome.apply(_settingsApi, arguments);
  }

  function readStoredReplEcho() {
    return _settingsApi.readStoredReplEcho.apply(_settingsApi, arguments);
  }

  function writeStoredReplEcho() {
    return _settingsApi.writeStoredReplEcho.apply(_settingsApi, arguments);
  }

  function readStoredReplFilterChatter() {
    return _settingsApi.readStoredReplFilterChatter.apply(_settingsApi, arguments);
  }

  function writeStoredReplFilterChatter() {
    return _settingsApi.writeStoredReplFilterChatter.apply(_settingsApi, arguments);
  }

  function readStoredReplHistoryCap() {
    return _settingsApi.readStoredReplHistoryCap.apply(_settingsApi, arguments);
  }

  function writeStoredReplHistoryCap() {
    return _settingsApi.writeStoredReplHistoryCap.apply(_settingsApi, arguments);
  }

  function readStoredReplHistoryPersist() {
    return _settingsApi.readStoredReplHistoryPersist.apply(_settingsApi, arguments);
  }

  function writeStoredReplHistoryPersist() {
    return _settingsApi.writeStoredReplHistoryPersist.apply(_settingsApi, arguments);
  }

  function readStoredReplTranscript() {
    return _settingsApi.readStoredReplTranscript.apply(_settingsApi, arguments);
  }

  function writeStoredReplTranscript() {
    return _settingsApi.writeStoredReplTranscript.apply(_settingsApi, arguments);
  }

  function readStoredReplCommandHistory() {
    return _settingsApi.readStoredReplCommandHistory.apply(_settingsApi, arguments);
  }

  function writeStoredReplCommandHistory() {
    return _settingsApi.writeStoredReplCommandHistory.apply(_settingsApi, arguments);
  }

  function readStoredBelugaFallbackStable() {
    return _settingsApi.readStoredBelugaFallbackStable.apply(_settingsApi, arguments);
  }

  function writeStoredBelugaFallbackStable() {
    return _settingsApi.writeStoredBelugaFallbackStable.apply(_settingsApi, arguments);
  }

  function readStoredBelugaCancelOnEdit() {
    return _settingsApi.readStoredBelugaCancelOnEdit.apply(_settingsApi, arguments);
  }

  function writeStoredBelugaCancelOnEdit() {
    return _settingsApi.writeStoredBelugaCancelOnEdit.apply(_settingsApi, arguments);
  }

  function readStoredLibraryExpandDefault() {
    return _settingsApi.readStoredLibraryExpandDefault.apply(_settingsApi, arguments);
  }

  function writeStoredLibraryExpandDefault() {
    return _settingsApi.writeStoredLibraryExpandDefault.apply(_settingsApi, arguments);
  }

  function readStoredLibraryHintDismissed() {
    return _settingsApi.readStoredLibraryHintDismissed.apply(_settingsApi, arguments);
  }

  function writeStoredLibraryHintDismissed() {
    return _settingsApi.writeStoredLibraryHintDismissed.apply(_settingsApi, arguments);
  }

  function readStoredHintDismissed() {
    return _settingsApi.readStoredHintDismissed.apply(_settingsApi, arguments);
  }

  function writeStoredHintDismissed() {
    return _settingsApi.writeStoredHintDismissed.apply(_settingsApi, arguments);
  }

  function readStoredRestorePanels() {
    return _settingsApi.readStoredRestorePanels.apply(_settingsApi, arguments);
  }

  function writeStoredRestorePanels() {
    return _settingsApi.writeStoredRestorePanels.apply(_settingsApi, arguments);
  }

  function readStoredAutosaveDelay() {
    return _settingsApi.readStoredAutosaveDelay.apply(_settingsApi, arguments);
  }

  function writeStoredAutosaveDelay() {
    return _settingsApi.writeStoredAutosaveDelay.apply(_settingsApi, arguments);
  }

  function readStoredEditorFontSize() {
    return _settingsApi.readStoredEditorFontSize.apply(_settingsApi, arguments);
  }

  function writeStoredEditorFontSize() {
    return _settingsApi.writeStoredEditorFontSize.apply(_settingsApi, arguments);
  }

  function readStoredEditorLineHeight() {
    return _settingsApi.readStoredEditorLineHeight.apply(_settingsApi, arguments);
  }

  function writeStoredEditorLineHeight() {
    return _settingsApi.writeStoredEditorLineHeight.apply(_settingsApi, arguments);
  }

  function readStoredEditorWordWrap() {
    return _settingsApi.readStoredEditorWordWrap.apply(_settingsApi, arguments);
  }

  function writeStoredEditorWordWrap() {
    return _settingsApi.writeStoredEditorWordWrap.apply(_settingsApi, arguments);
  }

  function readStoredEditorTabSize() {
    return _settingsApi.readStoredEditorTabSize.apply(_settingsApi, arguments);
  }

  function writeStoredEditorTabSize() {
    return _settingsApi.writeStoredEditorTabSize.apply(_settingsApi, arguments);
  }

  function readStoredEditorLineNumbers() {
    return _settingsApi.readStoredEditorLineNumbers.apply(_settingsApi, arguments);
  }

  function writeStoredEditorLineNumbers() {
    return _settingsApi.writeStoredEditorLineNumbers.apply(_settingsApi, arguments);
  }

  function readStoredEditorFoldGutter() {
    return _settingsApi.readStoredEditorFoldGutter.apply(_settingsApi, arguments);
  }

  function writeStoredEditorFoldGutter() {
    return _settingsApi.writeStoredEditorFoldGutter.apply(_settingsApi, arguments);
  }

  function readStoredEditorFoldPersist() {
    return _settingsApi.readStoredEditorFoldPersist.apply(_settingsApi, arguments);
  }

  function writeStoredEditorFoldPersist() {
    return _settingsApi.writeStoredEditorFoldPersist.apply(_settingsApi, arguments);
  }

  function readStoredEditorActiveLine() {
    return _settingsApi.readStoredEditorActiveLine.apply(_settingsApi, arguments);
  }

  function writeStoredEditorActiveLine() {
    return _settingsApi.writeStoredEditorActiveLine.apply(_settingsApi, arguments);
  }

  function readStoredEditorDiagGutter() {
    return _settingsApi.readStoredEditorDiagGutter.apply(_settingsApi, arguments);
  }

  function writeStoredEditorDiagGutter() {
    return _settingsApi.writeStoredEditorDiagGutter.apply(_settingsApi, arguments);
  }

  function readStoredEditorHoleGutter() {
    return _settingsApi.readStoredEditorHoleGutter.apply(_settingsApi, arguments);
  }

  function writeStoredEditorHoleGutter() {
    return _settingsApi.writeStoredEditorHoleGutter.apply(_settingsApi, arguments);
  }

  function readStoredEditorSyntaxHighlight() {
    return _settingsApi.readStoredEditorSyntaxHighlight.apply(_settingsApi, arguments);
  }

  function writeStoredEditorSyntaxHighlight() {
    return _settingsApi.writeStoredEditorSyntaxHighlight.apply(_settingsApi, arguments);
  }

  function readStoredEditorSemanticHighlight() {
    return _settingsApi.readStoredEditorSemanticHighlight.apply(_settingsApi, arguments);
  }

  function writeStoredEditorSemanticHighlight() {
    return _settingsApi.writeStoredEditorSemanticHighlight.apply(_settingsApi, arguments);
  }

  function readStoredEditorParseHighlight() {
    return _settingsApi.readStoredEditorParseHighlight.apply(_settingsApi, arguments);
  }

  function writeStoredEditorParseHighlight() {
    return _settingsApi.writeStoredEditorParseHighlight.apply(_settingsApi, arguments);
  }

  function readStoredEditorOccurrenceHighlight() {
    return _settingsApi.readStoredEditorOccurrenceHighlight.apply(_settingsApi, arguments);
  }

  function writeStoredEditorOccurrenceHighlight() {
    return _settingsApi.writeStoredEditorOccurrenceHighlight.apply(_settingsApi, arguments);
  }

  function readStoredEditorBracketMatch() {
    return _settingsApi.readStoredEditorBracketMatch.apply(_settingsApi, arguments);
  }

  function writeStoredEditorBracketMatch() {
    return _settingsApi.writeStoredEditorBracketMatch.apply(_settingsApi, arguments);
  }

  function readStoredEditorAutoCloseBrackets() {
    return _settingsApi.readStoredEditorAutoCloseBrackets.apply(_settingsApi, arguments);
  }

  function writeStoredEditorAutoCloseBrackets() {
    return _settingsApi.writeStoredEditorAutoCloseBrackets.apply(_settingsApi, arguments);
  }

  function readStoredEditorSelectionMatches() {
    return _settingsApi.readStoredEditorSelectionMatches.apply(_settingsApi, arguments);
  }

  function writeStoredEditorSelectionMatches() {
    return _settingsApi.writeStoredEditorSelectionMatches.apply(_settingsApi, arguments);
  }

  function readStoredEditorReindentPaste() {
    return _settingsApi.readStoredEditorReindentPaste.apply(_settingsApi, arguments);
  }

  function writeStoredEditorReindentPaste() {
    return _settingsApi.writeStoredEditorReindentPaste.apply(_settingsApi, arguments);
  }

  function readStoredEditorFormatWidth() {
    return _settingsApi.readStoredEditorFormatWidth.apply(_settingsApi, arguments);
  }

  function writeStoredEditorFormatWidth() {
    return _settingsApi.writeStoredEditorFormatWidth.apply(_settingsApi, arguments);
  }

  function resetAppearancePrefs() {
    return _settingsApi.resetAppearancePrefs.apply(_settingsApi, arguments);
  }

  function resetEditorTypographyPrefs() {
    return _settingsApi.resetEditorTypographyPrefs.apply(_settingsApi, arguments);
  }

  function resetEditorIndentPrefs() {
    return _settingsApi.resetEditorIndentPrefs.apply(_settingsApi, arguments);
  }

  function resetEditorCodeInsightPrefs() {
    return _settingsApi.resetEditorCodeInsightPrefs.apply(_settingsApi, arguments);
  }

  function resetEditorGutterPrefs() {
    return _settingsApi.resetEditorGutterPrefs.apply(_settingsApi, arguments);
  }

  function resetEditorPrefs() {
    return _settingsApi.resetEditorPrefs.apply(_settingsApi, arguments);
  }

  function resetBelugaPrefs() {
    return _settingsApi.resetBelugaPrefs.apply(_settingsApi, arguments);
  }

  function resetReplPrefs() {
    return _settingsApi.resetReplPrefs.apply(_settingsApi, arguments);
  }

  function readStoredKeybindings() {
    return _settingsApi.readStoredKeybindings.apply(_settingsApi, arguments);
  }

  function writeStoredKeybindings() {
    return _settingsApi.writeStoredKeybindings.apply(_settingsApi, arguments);
  }

  function resetKeybindingPrefs() {
    return _settingsApi.resetKeybindingPrefs.apply(_settingsApi, arguments);
  }

  function resetAliasesPrefs() {
    return _settingsApi.resetAliasesPrefs.apply(_settingsApi, arguments);
  }

  function isAliasExpandablePath() {
    return _settingsApi.isAliasExpandablePath.apply(_settingsApi, arguments);
  }

  function fileNameForId() {
    return _settingsApi.fileNameForId.apply(_settingsApi, arguments);
  }

  function expandAliasesForStorage() {
    return _settingsApi.expandAliasesForStorage.apply(_settingsApi, arguments);
  }

  function expandAliasesInAllFiles() {
    return _settingsApi.expandAliasesInAllFiles.apply(_settingsApi, arguments);
  }

  function explorerFoldKey() {
    return _settingsApi.explorerFoldKey.apply(_settingsApi, arguments);
  }

  function getExplorerFold() {
    return _settingsApi.getExplorerFold.apply(_settingsApi, arguments);
  }

  function setExplorerFold() {
    return _settingsApi.setExplorerFold.apply(_settingsApi, arguments);
  }

  var _layoutApi = createLayoutApi({
    backendLoad: backendLoad,
    backendSave: backendSave,
    backendRemove: backendRemove,
    tryParse: tryParse,
    projectPrefix: projectPrefix,
    getActiveProjectId: function () { return getActiveProjectId(); },
    EDITOR_SPLIT_STORAGE_KEY: EDITOR_SPLIT_STORAGE_KEY,
    DEFAULT_EDITOR_SPLIT: DEFAULT_EDITOR_SPLIT,
    MIN_EDITOR_SPLIT: MIN_EDITOR_SPLIT,
    MAX_EDITOR_SPLIT: MAX_EDITOR_SPLIT,
    SIDE_PANEL_LAYOUT: SIDE_PANEL_LAYOUT,
    DEFAULT_SIDE_PANEL_WIDTH: DEFAULT_SIDE_PANEL_WIDTH,
    DEFAULT_SIDE_PANEL_HEIGHT: DEFAULT_SIDE_PANEL_HEIGHT,
    EXPLORER_OPEN_KEY: EXPLORER_OPEN_KEY,
    INSPECTOR_OPEN_KEY: INSPECTOR_OPEN_KEY,
    INSPECTOR_FOLLOW_KEY: INSPECTOR_FOLLOW_KEY,
    LIBRARY_OPEN_KEY: LIBRARY_OPEN_KEY,
    LOAD_STATS_KEY: LOAD_STATS_KEY,
  });

  function resetLayoutPrefs() {
    return _layoutApi.resetLayoutPrefs.apply(_layoutApi, arguments);
  }

  function workspaceKeyFor() {
    return _layoutApi.workspaceKeyFor.apply(_layoutApi, arguments);
  }

  function activeSidePanelKey() {
    return _layoutApi.activeSidePanelKey.apply(_layoutApi, arguments);
  }

  function migrateActiveSidePanelFromLegacy() {
    return _layoutApi.migrateActiveSidePanelFromLegacy.apply(_layoutApi, arguments);
  }

  function readStoredActiveSidePanel() {
    return _layoutApi.readStoredActiveSidePanel.apply(_layoutApi, arguments);
  }

  function writeStoredActiveSidePanel() {
    return _layoutApi.writeStoredActiveSidePanel.apply(_layoutApi, arguments);
  }

  function readStoredWorkspace() {
    return _layoutApi.readStoredWorkspace.apply(_layoutApi, arguments);
  }

  function writeStoredWorkspace() {
    return _layoutApi.writeStoredWorkspace.apply(_layoutApi, arguments);
  }

  function resetStoredWorkspace() {
    return _layoutApi.resetStoredWorkspace.apply(_layoutApi, arguments);
  }

  function resetWorkspaceState() {
    return _layoutApi.resetWorkspaceState.apply(_layoutApi, arguments);
  }

  function resetWorkspacePrefs() {
    return _layoutApi.resetWorkspacePrefs.apply(_layoutApi, arguments);
  }

  function clampEditorSplit() {
    return _layoutApi.clampEditorSplit.apply(_layoutApi, arguments);
  }

  function readStoredEditorSplit() {
    return _layoutApi.readStoredEditorSplit.apply(_layoutApi, arguments);
  }

  function writeStoredEditorSplit() {
    return _layoutApi.writeStoredEditorSplit.apply(_layoutApi, arguments);
  }

  function clampPanelPx() {
    return _layoutApi.clampPanelPx.apply(_layoutApi, arguments);
  }

  function readStoredSidePanelWidth() {
    return _layoutApi.readStoredSidePanelWidth.apply(_layoutApi, arguments);
  }

  function writeStoredSidePanelWidth() {
    return _layoutApi.writeStoredSidePanelWidth.apply(_layoutApi, arguments);
  }

  function readStoredSidePanelHeight() {
    return _layoutApi.readStoredSidePanelHeight.apply(_layoutApi, arguments);
  }

  function writeStoredSidePanelHeight() {
    return _layoutApi.writeStoredSidePanelHeight.apply(_layoutApi, arguments);
  }

  function readStoredExplorerWidth() {
    return _layoutApi.readStoredExplorerWidth.apply(_layoutApi, arguments);
  }

  function writeStoredExplorerWidth() {
    return _layoutApi.writeStoredExplorerWidth.apply(_layoutApi, arguments);
  }

  function readStoredInspectorWidth() {
    return _layoutApi.readStoredInspectorWidth.apply(_layoutApi, arguments);
  }

  function writeStoredInspectorWidth() {
    return _layoutApi.writeStoredInspectorWidth.apply(_layoutApi, arguments);
  }

  function readStoredExplorerHeight() {
    return _layoutApi.readStoredExplorerHeight.apply(_layoutApi, arguments);
  }

  function writeStoredExplorerHeight() {
    return _layoutApi.writeStoredExplorerHeight.apply(_layoutApi, arguments);
  }

  function readStoredInspectorHeight() {
    return _layoutApi.readStoredInspectorHeight.apply(_layoutApi, arguments);
  }

  function writeStoredInspectorHeight() {
    return _layoutApi.writeStoredInspectorHeight.apply(_layoutApi, arguments);
  }

  function readStoredExplorerOpen() {
    return _layoutApi.readStoredExplorerOpen.apply(_layoutApi, arguments);
  }

  function loadStat() {
    return _layoutApi.loadStat.apply(_layoutApi, arguments);
  }

  function saveStat() {
    return _layoutApi.saveStat.apply(_layoutApi, arguments);
  }

  function writeStoredExplorerOpen() {
    return _layoutApi.writeStoredExplorerOpen.apply(_layoutApi, arguments);
  }

  function readStoredInspectorOpen() {
    return _layoutApi.readStoredInspectorOpen.apply(_layoutApi, arguments);
  }

  function writeStoredInspectorOpen() {
    return _layoutApi.writeStoredInspectorOpen.apply(_layoutApi, arguments);
  }

  function readStoredInspectorFollow() {
    return _layoutApi.readStoredInspectorFollow.apply(_layoutApi, arguments);
  }

  function writeStoredInspectorFollow() {
    return _layoutApi.writeStoredInspectorFollow.apply(_layoutApi, arguments);
  }

  function readStoredLibraryOpen() {
    return _layoutApi.readStoredLibraryOpen.apply(_layoutApi, arguments);
  }

  function writeStoredLibraryOpen() {
    return _layoutApi.writeStoredLibraryOpen.apply(_layoutApi, arguments);
  }

  function readStoredHarpoonOpen() {
    return _layoutApi.readStoredHarpoonOpen.apply(_layoutApi, arguments);
  }

  function writeStoredHarpoonOpen() {
    return _layoutApi.writeStoredHarpoonOpen.apply(_layoutApi, arguments);
  }

  function readStoredHarpoonDetailsCollapsed() {
    return _layoutApi.readStoredHarpoonDetailsCollapsed.apply(_layoutApi, arguments);
  }

  function writeStoredHarpoonDetailsCollapsed() {
    return _layoutApi.writeStoredHarpoonDetailsCollapsed.apply(_layoutApi, arguments);
  }

  function readStoredLibraryWidth() {
    return _layoutApi.readStoredLibraryWidth.apply(_layoutApi, arguments);
  }

  function writeStoredLibraryWidth() {
    return _layoutApi.writeStoredLibraryWidth.apply(_layoutApi, arguments);
  }

  function readStoredLibraryHeight() {
    return _layoutApi.readStoredLibraryHeight.apply(_layoutApi, arguments);
  }

  function writeStoredLibraryHeight() {
    return _layoutApi.writeStoredLibraryHeight.apply(_layoutApi, arguments);
  }

  function readStoredHarpoonWidth() {
    return _layoutApi.readStoredHarpoonWidth.apply(_layoutApi, arguments);
  }

  function writeStoredHarpoonWidth() {
    return _layoutApi.writeStoredHarpoonWidth.apply(_layoutApi, arguments);
  }

  function readStoredHarpoonHeight() {
    return _layoutApi.readStoredHarpoonHeight.apply(_layoutApi, arguments);
  }

  function writeStoredHarpoonHeight() {
    return _layoutApi.writeStoredHarpoonHeight.apply(_layoutApi, arguments);
  }


  var _graphPrefsApi = createGraphPrefsApi({
      DEFAULT_GRAPH_PREFS: DEFAULT_GRAPH_PREFS,
      GRAPH_PREFS_STORAGE_KEY: GRAPH_PREFS_STORAGE_KEY,
      LEGACY_GRAPH_LAYOUT_KEY: LEGACY_GRAPH_LAYOUT_KEY,
      LEGACY_GRAPH_IMPL_KEY: LEGACY_GRAPH_IMPL_KEY,
      LEGACY_GRAPH_DEPTH_KEY: LEGACY_GRAPH_DEPTH_KEY,
      LEGACY_GRAPH_SIDEBAR_KEY: LEGACY_GRAPH_SIDEBAR_KEY,
      backendLoad: backendLoad,
      backendSave: backendSave,
      backendRemove: backendRemove,
      tryParse: tryParse,
    });

  function normalizeGraphPrefs(raw) {
    return _graphPrefsApi.normalizeGraphPrefs(raw);
  }

  function migrateLegacyGraphPrefs() {
    return _graphPrefsApi.migrateLegacyGraphPrefs();
  }

  function readStoredGraphPrefs() {
    return _graphPrefsApi.readStoredGraphPrefs();
  }

  function writeStoredGraphPrefs(partial) {
    return _graphPrefsApi.writeStoredGraphPrefs(partial);
  }

  // ── Projects (top-level containers) ───────────────────────────────────────

  var _projectsApi = createProjectsApi({
      PROJECTS_KEY: PROJECTS_KEY,
      ACTIVE_PROJECT_KEY: ACTIVE_PROJECT_KEY,
      DEFAULT_PROJECT_ID: DEFAULT_PROJECT_ID,
      DEFAULT_PROJECT_NAME: DEFAULT_PROJECT_NAME,
      DEFAULT_DOCUMENT_ID: DEFAULT_DOCUMENT_ID,
      PROJECT_NAME_KEY: PROJECT_NAME_KEY,
      backendLoad: backendLoad,
      backendSave: backendSave,
      backendRemove: backendRemove,
      tryParse: tryParse,
      projKey: projKey,
      stateKeyFor: stateKeyFor,
      replaceProject: function (entries, options) { return replaceProject(entries, options); },
    });

  function readProjects() {
    return _projectsApi.readProjects();
  }

  function writeProjects(projects) {
    return _projectsApi.writeProjects(projects);
  }

  function ensureProjects() {
    return _projectsApi.ensureProjects();
  }

  function listProjects() {
    return _projectsApi.listProjects();
  }

  function getActiveProjectId() {
    return _projectsApi.getActiveProjectId();
  }

  function setActiveProjectId(id) {
    return _projectsApi.setActiveProjectId(id);
  }

  function getActiveProject() {
    return _projectsApi.getActiveProject();
  }

  function createProject(name) {
    return _projectsApi.createProject(name);
  }

  function renameProject(id, name) {
    return _projectsApi.renameProject(id, name);
  }

  function deleteProject(id) {
    return _projectsApi.deleteProject(id);
  }

  var _openTabsApi = null;
  var _fileRegistryApi = null;

  _fileRegistryApi = createFileRegistryApi({
    backendLoad: backendLoad,
    backendSave: backendSave,
    backendRemove: backendRemove,
    tryParse: tryParse,
    projKey: projKey,
    stateKeyFor: stateKeyFor,
    defaultBackend: defaultBackend,
    readState: readState,
    emptyState: emptyState,
    DEFAULT_DOCUMENT_ID: DEFAULT_DOCUMENT_ID,
    dirOf: dirOf,
    expandAliasesForStorage: function (t, n) { return expandAliasesForStorage(t, n); },
    fileNameForId: function (id) { return fileNameForId(id); },
    readStoredCfgAutoSync: function () { return readStoredCfgAutoSync(); },
    writeOpenFileIds: function (ids) { return writeOpenFileIds(ids); },
    closeOpenFile: function (id) { return closeOpenFile(id); },
    writeActiveCfgByDir: function (m) { return writeActiveCfgByDir(m); },
    setActiveCfgForDir: function (d, p) { return setActiveCfgForDir(d, p); },
    removeActiveCfgForDir: function (d, p) { return removeActiveCfgForDir(d, p); },
    readActiveCfgByDir: function () { return readActiveCfgByDir(); },
    normalizeActiveCfgList: function (v) { return normalizeActiveCfgList(v); },
    setProjectName: function (n) { return setProjectName(n); },
  });

  function readProjectFiles() {
    return _fileRegistryApi.readProjectFiles.apply(_fileRegistryApi, arguments);
  }

  function writeProjectFiles() {
    return _fileRegistryApi.writeProjectFiles.apply(_fileRegistryApi, arguments);
  }

  function readEmptyFolders() {
    return _fileRegistryApi.readEmptyFolders.apply(_fileRegistryApi, arguments);
  }

  function writeEmptyFolders() {
    return _fileRegistryApi.writeEmptyFolders.apply(_fileRegistryApi, arguments);
  }

  function listEmptyFolders() {
    return _fileRegistryApi.listEmptyFolders.apply(_fileRegistryApi, arguments);
  }

  function addEmptyFolder() {
    return _fileRegistryApi.addEmptyFolder.apply(_fileRegistryApi, arguments);
  }

  function removeEmptyFolder() {
    return _fileRegistryApi.removeEmptyFolder.apply(_fileRegistryApi, arguments);
  }

  function clearEmptyFolders() {
    return _fileRegistryApi.clearEmptyFolders.apply(_fileRegistryApi, arguments);
  }

  function pruneEmptyFoldersUnder() {
    return _fileRegistryApi.pruneEmptyFoldersUnder.apply(_fileRegistryApi, arguments);
  }

  function renameEmptyFolderPrefix() {
    return _fileRegistryApi.renameEmptyFolderPrefix.apply(_fileRegistryApi, arguments);
  }

  function pruneEmptyFoldersForFile() {
    return _fileRegistryApi.pruneEmptyFoldersForFile.apply(_fileRegistryApi, arguments);
  }

  function folderSubtreeOccupied() {
    return _fileRegistryApi.folderSubtreeOccupied.apply(_fileRegistryApi, arguments);
  }

  function preserveEmptyFoldersAfterPath() {
    return _fileRegistryApi.preserveEmptyFoldersAfterPath.apply(_fileRegistryApi, arguments);
  }

  function isPrefixUnderAny() {
    return _fileRegistryApi.isPrefixUnderAny.apply(_fileRegistryApi, arguments);
  }

  function relocatedPrefixTarget() {
    return _fileRegistryApi.relocatedPrefixTarget.apply(_fileRegistryApi, arguments);
  }

  function inferRelocatedFolderPrefixes() {
    return _fileRegistryApi.inferRelocatedFolderPrefixes.apply(_fileRegistryApi, arguments);
  }

  function preserveEmptyFoldersAfterMoves() {
    return _fileRegistryApi.preserveEmptyFoldersAfterMoves.apply(_fileRegistryApi, arguments);
  }

  function ensureProject() {
    return _fileRegistryApi.ensureProject.apply(_fileRegistryApi, arguments);
  }

  function listFiles() {
    return _fileRegistryApi.listFiles.apply(_fileRegistryApi, arguments);
  }

  function getActiveFileId() {
    return _fileRegistryApi.getActiveFileId.apply(_fileRegistryApi, arguments);
  }

  function setActiveFileId() {
    return _fileRegistryApi.setActiveFileId.apply(_fileRegistryApi, arguments);
  }

  function uniqueFileId() {
    return _fileRegistryApi.uniqueFileId.apply(_fileRegistryApi, arguments);
  }

  function replaceProject() {
    return _fileRegistryApi.replaceProject.apply(_fileRegistryApi, arguments);
  }

  function createFile() {
    return _fileRegistryApi.createFile.apply(_fileRegistryApi, arguments);
  }

  function relToCfgDir() {
    return _fileRegistryApi.relToCfgDir.apply(_fileRegistryApi, arguments);
  }

  function resolveCfgEntryPath() {
    return _fileRegistryApi.resolveCfgEntryPath.apply(_fileRegistryApi, arguments);
  }

  function isCfgEntryToken() {
    return _fileRegistryApi.isCfgEntryToken.apply(_fileRegistryApi, arguments);
  }

  function isCfgEntryLine() {
    return _fileRegistryApi.isCfgEntryLine.apply(_fileRegistryApi, arguments);
  }

  function cfgTextForRewrite() {
    return _fileRegistryApi.cfgTextForRewrite.apply(_fileRegistryApi, arguments);
  }

  function notifyCfgRewritten() {
    return _fileRegistryApi.notifyCfgRewritten.apply(_fileRegistryApi, arguments);
  }

  function rewriteCfgBody() {
    return _fileRegistryApi.rewriteCfgBody.apply(_fileRegistryApi, arguments);
  }

  function restoreDeletedFile() {
    return _fileRegistryApi.restoreDeletedFile.apply(_fileRegistryApi, arguments);
  }

  function deleteFile() {
    return _fileRegistryApi.deleteFile.apply(_fileRegistryApi, arguments);
  }

  function rewriteCfgsForOp() {
    return _fileRegistryApi.rewriteCfgsForOp.apply(_fileRegistryApi, arguments);
  }

  function renameFile() {
    return _fileRegistryApi.renameFile.apply(_fileRegistryApi, arguments);
  }

  function cfgFileByPath() {
    return _fileRegistryApi.cfgFileByPath.apply(_fileRegistryApi, arguments);
  }

  function cfgListsEntry() {
    return _fileRegistryApi.cfgListsEntry.apply(_fileRegistryApi, arguments);
  }

  function addEntryToCfg() {
    return _fileRegistryApi.addEntryToCfg.apply(_fileRegistryApi, arguments);
  }

  function prependEntryToCfg() {
    return _fileRegistryApi.prependEntryToCfg.apply(_fileRegistryApi, arguments);
  }

  function removeEntryFromCfg() {
    return _fileRegistryApi.removeEntryFromCfg.apply(_fileRegistryApi, arguments);
  }

  function moveEntryInCfg() {
    return _fileRegistryApi.moveEntryInCfg.apply(_fileRegistryApi, arguments);
  }

  function getFileById() {
    return _fileRegistryApi.getFileById.apply(_fileRegistryApi, arguments);
  }

  function moveFile() {
    return _fileRegistryApi.moveFile.apply(_fileRegistryApi, arguments);
  }

  function getFileText() {
    return _fileRegistryApi.getFileText.apply(_fileRegistryApi, arguments);
  }

  function setFileText() {
    return _fileRegistryApi.setFileText.apply(_fileRegistryApi, arguments);
  }

  _openTabsApi = createOpenTabsApi({
    backendLoad: backendLoad,
    backendSave: backendSave,
    backendRemove: backendRemove,
    tryParse: tryParse,
    projKey: projKey,
    listFiles: function () { return listFiles(); },
    getFileById: function (id) { return getFileById(id); },
    readProjectFiles: function () { return readProjectFiles(); },
    getActiveProject: function () { return getActiveProject(); },
    renameProject: function (id, name) { return renameProject(id, name); },
    getActiveProjectId: function () { return getActiveProjectId(); },
    DEFAULT_PROJECT_NAME: DEFAULT_PROJECT_NAME,
    dirOf: dirOf,
    defaultBackend: defaultBackend,
    getActiveFileId: function () { return getActiveFileId(); },
  });

  function writeOpenFileIds() {
    return _openTabsApi.writeOpenFileIds.apply(_openTabsApi, arguments);
  }

  function setOpenFileIds() {
    return _openTabsApi.setOpenFileIds.apply(_openTabsApi, arguments);
  }

  function getOpenFileIds() {
    return _openTabsApi.getOpenFileIds.apply(_openTabsApi, arguments);
  }

  function openFile() {
    return _openTabsApi.openFile.apply(_openTabsApi, arguments);
  }

  function closeOpenFile() {
    return _openTabsApi.closeOpenFile.apply(_openTabsApi, arguments);
  }

  function getProjectName() {
    return _openTabsApi.getProjectName.apply(_openTabsApi, arguments);
  }

  function setProjectName() {
    return _openTabsApi.setProjectName.apply(_openTabsApi, arguments);
  }

  function normalizeActiveCfgList() {
    return _openTabsApi.normalizeActiveCfgList.apply(_openTabsApi, arguments);
  }

  function readActiveCfgByDir() {
    return _openTabsApi.readActiveCfgByDir.apply(_openTabsApi, arguments);
  }

  function writeActiveCfgByDir() {
    return _openTabsApi.writeActiveCfgByDir.apply(_openTabsApi, arguments);
  }

  function getActiveCfgsForDir() {
    return _openTabsApi.getActiveCfgsForDir.apply(_openTabsApi, arguments);
  }

  function getActiveCfgForDir() {
    return _openTabsApi.getActiveCfgForDir.apply(_openTabsApi, arguments);
  }

  function setActiveCfgsForDir() {
    return _openTabsApi.setActiveCfgsForDir.apply(_openTabsApi, arguments);
  }

  function setActiveCfgForDir() {
    return _openTabsApi.setActiveCfgForDir.apply(_openTabsApi, arguments);
  }

  function addActiveCfgForDir() {
    return _openTabsApi.addActiveCfgForDir.apply(_openTabsApi, arguments);
  }

  function removeActiveCfgForDir() {
    return _openTabsApi.removeActiveCfgForDir.apply(_openTabsApi, arguments);
  }

  function getActiveCfgByDir() {
    return _openTabsApi.getActiveCfgByDir.apply(_openTabsApi, arguments);
  }

  function backfillActiveCfgByDir() {
    return _openTabsApi.backfillActiveCfgByDir.apply(_openTabsApi, arguments);
  }

  function getDefaultCfgPath() {
    return _openTabsApi.getDefaultCfgPath.apply(_openTabsApi, arguments);
  }

  function setDefaultCfgPath() {
    return _openTabsApi.setDefaultCfgPath.apply(_openTabsApi, arguments);
  }


  // Create a blank project and make it active. The caller reloads so the new
  // (empty) silo becomes hot memory. Returns the new project id.
  function newBlankProject(name) {
    return _projectsApi.newBlankProject(name);
  }

  function createProjectWithFiles(name, entries, options) {
    return _projectsApi.createProjectWithFiles(name, entries, options);
  }

  function createAsyncPersistLayer() {
    return {
      push: function () { return Promise.resolve({ ok: false, reason: 'not-configured' }); },
      pull: function () { return Promise.resolve({ ok: false, reason: 'not-configured' }); },
    };
  }

  export const Persist = {
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
    UI_FONT_SIZE_KEY: UI_FONT_SIZE_KEY,
    UI_FONT_SCALES: UI_FONT_SCALES,
    readStoredUiFontSize: readStoredUiFontSize,
    writeStoredUiFontSize: writeStoredUiFontSize,
    uiFontScaleForSize: uiFontScaleForSize,
    applyStoredUiFontSize: applyStoredUiFontSize,
    UI_TEXT_CONTRAST_KEY: UI_TEXT_CONTRAST_KEY,
    UI_TEXT_CONTRAST_MULTIPLIERS: UI_TEXT_CONTRAST_MULTIPLIERS,
    readStoredUiTextContrast: readStoredUiTextContrast,
    writeStoredUiTextContrast: writeStoredUiTextContrast,
    uiTextContrastMultiplierForLevel: uiTextContrastMultiplierForLevel,
    applyStoredUiTextContrast: applyStoredUiTextContrast,
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
    DEFAULT_SIDE_PANEL_WIDTH: DEFAULT_SIDE_PANEL_WIDTH,
    DEFAULT_SIDE_PANEL_HEIGHT: DEFAULT_SIDE_PANEL_HEIGHT,
    SIDE_PANEL_LAYOUT: SIDE_PANEL_LAYOUT,
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
    readStoredAliasPairs: readStoredAliasPairs,
    writeStoredAliasPairs: writeStoredAliasPairs,
    readStoredCfgAutoSync: readStoredCfgAutoSync,
    writeStoredCfgAutoSync: writeStoredCfgAutoSync,
    readStoredReplAutoscroll: readStoredReplAutoscroll,
    writeStoredReplAutoscroll: writeStoredReplAutoscroll,
    readStoredReplWelcome: readStoredReplWelcome,
    writeStoredReplWelcome: writeStoredReplWelcome,
    readStoredReplEcho: readStoredReplEcho,
    writeStoredReplEcho: writeStoredReplEcho,
    readStoredReplFilterChatter: readStoredReplFilterChatter,
    writeStoredReplFilterChatter: writeStoredReplFilterChatter,
    readStoredReplHistoryCap: readStoredReplHistoryCap,
    writeStoredReplHistoryCap: writeStoredReplHistoryCap,
    readStoredReplHistoryPersist: readStoredReplHistoryPersist,
    writeStoredReplHistoryPersist: writeStoredReplHistoryPersist,
    readStoredReplTranscript: readStoredReplTranscript,
    writeStoredReplTranscript: writeStoredReplTranscript,
    readStoredReplCommandHistory: readStoredReplCommandHistory,
    writeStoredReplCommandHistory: writeStoredReplCommandHistory,
    readStoredBelugaFallbackStable: readStoredBelugaFallbackStable,
    writeStoredBelugaFallbackStable: writeStoredBelugaFallbackStable,
    readStoredBelugaCancelOnEdit: readStoredBelugaCancelOnEdit,
    writeStoredBelugaCancelOnEdit: writeStoredBelugaCancelOnEdit,
    readStoredLibraryExpandDefault: readStoredLibraryExpandDefault,
    writeStoredLibraryExpandDefault: writeStoredLibraryExpandDefault,
    readStoredLibraryHintDismissed: readStoredLibraryHintDismissed,
    writeStoredLibraryHintDismissed: writeStoredLibraryHintDismissed,
    readStoredHintDismissed: readStoredHintDismissed,
    writeStoredHintDismissed: writeStoredHintDismissed,
    readStoredRestorePanels: readStoredRestorePanels,
    writeStoredRestorePanels: writeStoredRestorePanels,
    readStoredActiveSidePanel: readStoredActiveSidePanel,
    writeStoredActiveSidePanel: writeStoredActiveSidePanel,
    readStoredWorkspace: readStoredWorkspace,
    writeStoredWorkspace: writeStoredWorkspace,
    resetStoredWorkspace: resetStoredWorkspace,
    resetWorkspaceState: resetWorkspaceState,
    workspaceKeyFor: workspaceKeyFor,
    normalizeViewportAnchor: normalizeViewportAnchor,
    readStoredAutosaveDelay: readStoredAutosaveDelay,
    writeStoredAutosaveDelay: writeStoredAutosaveDelay,
    readStoredEditorFontSize: readStoredEditorFontSize,
    writeStoredEditorFontSize: writeStoredEditorFontSize,
    readStoredEditorLineHeight: readStoredEditorLineHeight,
    writeStoredEditorLineHeight: writeStoredEditorLineHeight,
    readStoredEditorWordWrap: readStoredEditorWordWrap,
    writeStoredEditorWordWrap: writeStoredEditorWordWrap,
    readStoredEditorTabSize: readStoredEditorTabSize,
    writeStoredEditorTabSize: writeStoredEditorTabSize,
    readStoredEditorLineNumbers: readStoredEditorLineNumbers,
    writeStoredEditorLineNumbers: writeStoredEditorLineNumbers,
    readStoredEditorFoldGutter: readStoredEditorFoldGutter,
    writeStoredEditorFoldGutter: writeStoredEditorFoldGutter,
    readStoredEditorFoldPersist: readStoredEditorFoldPersist,
    writeStoredEditorFoldPersist: writeStoredEditorFoldPersist,
    readStoredEditorActiveLine: readStoredEditorActiveLine,
    writeStoredEditorActiveLine: writeStoredEditorActiveLine,
    readStoredEditorDiagGutter: readStoredEditorDiagGutter,
    writeStoredEditorDiagGutter: writeStoredEditorDiagGutter,
    readStoredEditorHoleGutter: readStoredEditorHoleGutter,
    writeStoredEditorHoleGutter: writeStoredEditorHoleGutter,
    readStoredEditorSyntaxHighlight: readStoredEditorSyntaxHighlight,
    writeStoredEditorSyntaxHighlight: writeStoredEditorSyntaxHighlight,
    readStoredEditorSemanticHighlight: readStoredEditorSemanticHighlight,
    writeStoredEditorSemanticHighlight: writeStoredEditorSemanticHighlight,
    readStoredEditorParseHighlight: readStoredEditorParseHighlight,
    writeStoredEditorParseHighlight: writeStoredEditorParseHighlight,
    readStoredEditorOccurrenceHighlight: readStoredEditorOccurrenceHighlight,
    writeStoredEditorOccurrenceHighlight: writeStoredEditorOccurrenceHighlight,
    readStoredEditorBracketMatch: readStoredEditorBracketMatch,
    writeStoredEditorBracketMatch: writeStoredEditorBracketMatch,
    readStoredEditorAutoCloseBrackets: readStoredEditorAutoCloseBrackets,
    writeStoredEditorAutoCloseBrackets: writeStoredEditorAutoCloseBrackets,
    readStoredEditorSelectionMatches: readStoredEditorSelectionMatches,
    writeStoredEditorSelectionMatches: writeStoredEditorSelectionMatches,
    readStoredEditorReindentPaste: readStoredEditorReindentPaste,
    writeStoredEditorReindentPaste: writeStoredEditorReindentPaste,
    readStoredEditorFormatWidth: readStoredEditorFormatWidth,
    writeStoredEditorFormatWidth: writeStoredEditorFormatWidth,
    resetLayoutPrefs: resetLayoutPrefs,
    resetAppearancePrefs: resetAppearancePrefs,
    resetEditorTypographyPrefs: resetEditorTypographyPrefs,
    resetEditorIndentPrefs: resetEditorIndentPrefs,
    resetEditorCodeInsightPrefs: resetEditorCodeInsightPrefs,
    resetEditorGutterPrefs: resetEditorGutterPrefs,
    resetEditorPrefs: resetEditorPrefs,
    resetBelugaPrefs: resetBelugaPrefs,
    resetReplPrefs: resetReplPrefs,
    resetWorkspacePrefs: resetWorkspacePrefs,
    resetAliasesPrefs: resetAliasesPrefs,
    KEYBINDINGS_KEY: 'beljar-keybindings',
    readStoredKeybindings: readStoredKeybindings,
    writeStoredKeybindings: writeStoredKeybindings,
    resetKeybindingPrefs: resetKeybindingPrefs,
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
    restoreDeletedFile: restoreDeletedFile,
    deleteFile: deleteFile,
    renameFile: renameFile,
    addEntryToCfg: addEntryToCfg,
    prependEntryToCfg: prependEntryToCfg,
    removeEntryFromCfg: removeEntryFromCfg,
    moveEntryInCfg: moveEntryInCfg,
    getFileById: getFileById,
    listEmptyFolders: listEmptyFolders,
    addEmptyFolder: addEmptyFolder,
    removeEmptyFolder: removeEmptyFolder,
    clearEmptyFolders: clearEmptyFolders,
    pruneEmptyFoldersUnder: pruneEmptyFoldersUnder,
    renameEmptyFolderPrefix: renameEmptyFolderPrefix,
    preserveEmptyFoldersAfterMoves: preserveEmptyFoldersAfterMoves,
    moveFile: moveFile,
    getFileText: getFileText,
    setFileText: setFileText,
    getOpenFileIds: getOpenFileIds,
    setOpenFileIds: setOpenFileIds,
    openFile: openFile,
    closeOpenFile: closeOpenFile,
    getProjectName: getProjectName,
    setProjectName: setProjectName,
    getDefaultCfgPath: getDefaultCfgPath,
    setDefaultCfgPath: setDefaultCfgPath,
    getActiveCfgForDir: getActiveCfgForDir,
    getActiveCfgsForDir: getActiveCfgsForDir,
    setActiveCfgForDir: setActiveCfgForDir,
    setActiveCfgsForDir: setActiveCfgsForDir,
    addActiveCfgForDir: addActiveCfgForDir,
    removeActiveCfgForDir: removeActiveCfgForDir,
    getActiveCfgByDir: getActiveCfgByDir,
    backfillActiveCfgByDir: backfillActiveCfgByDir,
    DEFAULT_PROJECT_NAME: DEFAULT_PROJECT_NAME,
  };

const g = typeof window !== 'undefined' ? window : globalThis;
g.Persist = Persist;
g.BelJarPersist = g.Persist
