(function (global) {
  var SCHEMA_VERSION = 2;
  var LEGACY_SCHEMA_VERSION = 1;
  var STATE_KEY = 'beljar-state-v2';
  var LEGACY_STATE_KEY = 'beljar-state-v1';
  var LEGACY_SEMANTIC_TYPES_KEY = 'beljar:semantic-types';
  var DEFAULT_DOCUMENT_ID = 'workspace://main.bel';
  var THEME_STORAGE_KEY = 'beljar-theme';
  var REPL_RAW_STORAGE_KEY = 'beljar-repl-raw';
  var BELUGA_MODE_STORAGE_KEY = 'beljar-beluga-mode';
  var EDITOR_SPLIT_STORAGE_KEY = global.BELJAR_SPLIT_KEY || 'beljar-editor-split';
  var DEFAULT_EDITOR_SPLIT = global.BELJAR_SPLIT_DEFAULT != null ? global.BELJAR_SPLIT_DEFAULT : 0.5;
  var MIN_EDITOR_SPLIT = global.BELJAR_SPLIT_MIN != null ? global.BELJAR_SPLIT_MIN : 0.18;
  var MAX_EDITOR_SPLIT = global.BELJAR_SPLIT_MAX != null ? global.BELJAR_SPLIT_MAX : 0.82;

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
    var parsed = tryParse(b.loadSync(STATE_KEY));
    var state = normalizeLoaded(parsed, documentId);
    if (parsed && parsed.v === SCHEMA_VERSION) {
      return migrateLegacySemantic(state, b);
    }
    var legacy = tryParse(b.loadSync(LEGACY_STATE_KEY));
    if (legacy) {
      state = normalizeLoaded(legacy, documentId);
      b.removeSync(LEGACY_STATE_KEY);
    }
    return migrateLegacySemantic(state, b);
  }

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
    try {
      b.saveSync(STATE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      if (!err || err.name !== 'QuotaExceededError') return false;
      if (state.semantic) {
        state.semantic = trimSemanticForQuota(state.semantic);
        try {
          b.saveSync(STATE_KEY, JSON.stringify(state));
          return true;
        } catch (_) {}
      }
      return false;
    }
  }

  function createPersist(opts) {
    opts = opts || {};
    var backend = opts.backend || defaultBackend;
    var documentId = opts.documentId || DEFAULT_DOCUMENT_ID;
    var debounceMs = opts.debounceMs != null ? opts.debounceMs : 320;

    var state = readState(backend, documentId);
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
      state = readState(backend, documentId);
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

  function readStoredReplRaw() {
    try {
      return backendLoad(REPL_RAW_STORAGE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function writeStoredReplRaw(raw) {
    if (raw) backendSave(REPL_RAW_STORAGE_KEY, '1');
    else backendRemove(REPL_RAW_STORAGE_KEY);
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
    REPL_RAW_STORAGE_KEY: REPL_RAW_STORAGE_KEY,
    EDITOR_SPLIT_STORAGE_KEY: EDITOR_SPLIT_STORAGE_KEY,
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
    readStoredReplRaw: readStoredReplRaw,
    writeStoredReplRaw: writeStoredReplRaw,
    readStoredEditorSplit: readStoredEditorSplit,
    writeStoredEditorSplit: writeStoredEditorSplit,
    clampEditorSplit: clampEditorSplit,
    readStoredBelugaMode: readStoredBelugaMode,
    writeStoredBelugaMode: writeStoredBelugaMode,
    normalizeLoaded: normalizeLoaded,
    emptyState: emptyState,
  };
})(typeof window !== 'undefined' ? window : globalThis);
