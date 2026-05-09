/**
 * BelJar persistence: localStorage today, swappable adapter for a backend later.
 * Theme uses key `beljar-theme` — keep index.html FOUC preload in sync with THEME_STORAGE_KEY.
 * Raw REPL uses key `beljar-repl-raw` (`1` = plain terminal-style output).
 */
(function (global) {
  var SCHEMA_VERSION = 1;
  var STATE_KEY = 'beljar-state-v1';
  var THEME_STORAGE_KEY = 'beljar-theme';
  var REPL_RAW_STORAGE_KEY = 'beljar-repl-raw';
  var DEFAULT_REPL_OUTPUT =
    'Welcome to BelJar. Try help for a list of REPL commands.';

  function tryParse(json) {
    try {
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }

  function createLocalStorageAdapter(store) {
    store = store || global.localStorage;
    return {
      getItem: function (key) {
        try {
          return store.getItem(key);
        } catch (_) {
          return null;
        }
      },
      setItem: function (key, value) {
        try {
          store.setItem(key, value);
        } catch (_) {}
      },
      removeItem: function (key) {
        try {
          store.removeItem(key);
        } catch (_) {}
      },
    };
  }

  function emptyState() {
    return {
      v: SCHEMA_VERSION,
      editor: { text: '' },
    };
  }

  function normalizeLoaded(raw) {
    var base = emptyState();
    if (!raw || typeof raw !== 'object' || raw.v !== SCHEMA_VERSION) return base;
    if (raw.editor && typeof raw.editor.text === 'string') base.editor.text = raw.editor.text;
    return base;
  }

  function readState(adapter) {
    var parsed = tryParse(adapter.getItem(STATE_KEY));
    return normalizeLoaded(parsed);
  }

  function writeState(adapter, state) {
    adapter.setItem(STATE_KEY, JSON.stringify(state));
  }

  /**
   * @param {{ adapter?: ReturnType<createLocalStorageAdapter>, editorDebounceMs?: number }} [opts]
   */
  function createPersist(opts) {
    opts = opts || {};
    var adapter = opts.adapter || createLocalStorageAdapter();
    var editorMs = opts.editorDebounceMs != null ? opts.editorDebounceMs : 320;

    var state = readState(adapter);
    var editorTimer = null;

    function persistEditorNow() {
      clearTimeout(editorTimer);
      editorTimer = null;
      try {
        writeState(adapter, state);
      } catch (_) {}
    }

    function scheduleEditorPersist(text) {
      state.editor.text = text;
      clearTimeout(editorTimer);
      editorTimer = global.setTimeout(persistEditorNow, editorMs);
    }

    function flushEditor() {
      persistEditorNow();
    }

    function exportSnapshot() {
      return JSON.parse(JSON.stringify(state));
    }

    function importSnapshot(snapshot, flush) {
      state = normalizeLoaded(snapshot);
      if (flush) persistEditorNow();
    }

    return {
      getEditorText: function () {
        return state.editor.text;
      },
      scheduleEditorPersist: scheduleEditorPersist,
      flushEditor: flushEditor,
      exportSnapshot: exportSnapshot,
      importSnapshot: importSnapshot,
      /** Swap storage (e.g. sync layer); reloads state from the new adapter. */
      setAdapter: function (next) {
        adapter = next;
        state = readState(adapter);
      },
    };
  }

  function readStoredTheme() {
    try {
      return global.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
    } catch (_) {
      return 'dark';
    }
  }

  function writeStoredTheme(mode) {
    try {
      if (mode === 'light') global.localStorage.setItem(THEME_STORAGE_KEY, 'light');
      else global.localStorage.removeItem(THEME_STORAGE_KEY);
    } catch (_) {}
  }

  function readStoredReplRaw() {
    try {
      return global.localStorage.getItem(REPL_RAW_STORAGE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function writeStoredReplRaw(raw) {
    try {
      if (raw) global.localStorage.setItem(REPL_RAW_STORAGE_KEY, '1');
      else global.localStorage.removeItem(REPL_RAW_STORAGE_KEY);
    } catch (_) {}
  }

  global.BelJarPersist = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STATE_KEY: STATE_KEY,
    THEME_STORAGE_KEY: THEME_STORAGE_KEY,
    REPL_RAW_STORAGE_KEY: REPL_RAW_STORAGE_KEY,
    DEFAULT_REPL_OUTPUT: DEFAULT_REPL_OUTPUT,
    createLocalStorageAdapter: createLocalStorageAdapter,
    createPersist: createPersist,
    readStoredTheme: readStoredTheme,
    writeStoredTheme: writeStoredTheme,
    readStoredReplRaw: readStoredReplRaw,
    writeStoredReplRaw: writeStoredReplRaw,
  };
})(typeof window !== 'undefined' ? window : globalThis);
