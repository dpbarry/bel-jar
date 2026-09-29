(() => {
  // js/persist/store.mjs
  var SCHEMA = 4;
  var SCHEMA_KEY = "beljar/schema";
  var CLASSES = [
    { pattern: /^beljar\/settings$/, cls: "settings" },
    { pattern: /^beljar\/device$/, cls: "device" },
    { pattern: /^beljar\/notifications$/, cls: "device" },
    { pattern: /^beljar\/repl\/(transcript|commands)$/, cls: "device" },
    // the tab guard's handshake, and sync telling the other tabs how it is (sync/sync-status.mjs)
    { pattern: /^beljar\/tabs\/(ping|pong|bye|sync-status|sync-ask)$/, cls: "device" },
    { pattern: /^beljar\/tombstones$/, cls: "device" },
    { pattern: /^beljar\/settings-sync$/, cls: "device" },
    { pattern: /^beljar\/p\/[^/]+\/meta$/, cls: "work" },
    { pattern: /^beljar\/p\/[^/]+\/tree$/, cls: "work" },
    { pattern: /^beljar\/p\/[^/]+\/f\/[^/]+$/, cls: "work" },
    { pattern: /^beljar\/p\/[^/]+\/session$/, cls: "device" },
    { pattern: /^beljar\/p\/[^/]+\/folds$/, cls: "device" },
    { pattern: /^beljar\/p\/[^/]+\/undo$/, cls: "device" },
    { pattern: /^beljar\/p\/[^/]+\/conflict\/[^/]+$/, cls: "device" },
    { pattern: /^beljar\/p\/[^/]+\/sync$/, cls: "device" },
    { pattern: /^beljar\/p\/[^/]+\/cache\/[^/]+$/, cls: "cache" }
  ];
  function classOf(key) {
    const k = String(key || "");
    for (const row of CLASSES) {
      if (row.pattern.test(k)) return row.cls;
    }
    return null;
  }
  function isCapacityError(err) {
    if (!err) return false;
    const name = String(err.name || "");
    if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
    if (err.code === 22 || err.code === 1014) return true;
    return /quota/i.test(String(err.message || ""));
  }
  function createMemoryStorage() {
    const m = /* @__PURE__ */ new Map();
    return {
      get length() {
        return m.size;
      },
      key(i) {
        return i >= 0 && i < m.size ? [...m.keys()][i] : null;
      },
      getItem(k) {
        return m.has(k) ? m.get(k) : null;
      },
      setItem(k, v) {
        m.set(String(k), String(v));
      },
      removeItem(k) {
        m.delete(k);
      },
      clear() {
        m.clear();
      }
    };
  }
  function isBeljarKey(key) {
    return typeof key === "string" && /^beljar[/:.-]/.test(key);
  }
  function allKeys(storage) {
    const out = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k != null) out.push(k);
    }
    return out;
  }
  function parseEnvelope(raw) {
    if (raw == null) return null;
    try {
      const env = JSON.parse(raw);
      if (!env || typeof env !== "object" || typeof env.at !== "number" || !("data" in env)) return null;
      return env;
    } catch (_) {
      return null;
    }
  }
  function createStore(opts = {}) {
    const storage = opts.storage || globalThis.localStorage;
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function" || typeof storage.removeItem !== "function" || typeof storage.key !== "function" || typeof storage.length !== "number") {
      throw new Error("store: storage must be a Storage (getItem, setItem, removeItem, key, length)");
    }
    const now = opts.now || (() => Date.now());
    const schema = opts.schema == null ? SCHEMA : opts.schema;
    const onCapacity = typeof opts.onCapacity === "function" ? opts.onCapacity : () => {
    };
    const events = opts.events || (typeof globalThis.addEventListener === "function" ? globalThis : null);
    const listeners = /* @__PURE__ */ new Set();
    let blocked = false;
    const onVersionAhead = typeof opts.onVersionAhead === "function" ? opts.onVersionAhead : () => {
    };
    const onCannotUpgrade = typeof opts.onCannotUpgrade === "function" ? opts.onCannotUpgrade : () => {
    };
    const migrations = opts.migrations || {};
    const missingPolicy = opts.onMissingMigration === "refuse" ? "refuse" : "wipe";
    let resetReason = null;
    let readOnly = false;
    const versionOf = (raw) => {
      const n = Number(raw);
      return raw != null && raw !== "" && Number.isInteger(n) ? n : null;
    };
    function wipeAndStamp() {
      for (const area of [storage, ...opts.alsoWipe || []]) {
        if (!area) continue;
        for (const k of allKeys(area)) {
          if (isBeljarKey(k)) area.removeItem(k);
        }
      }
      storage.setItem(SCHEMA_KEY, String(schema));
    }
    const storedRaw = storage.getItem(SCHEMA_KEY);
    const storedVersion = versionOf(storedRaw);
    if (storedRaw === String(schema)) {
    } else if (storedVersion != null && storedVersion > schema) {
      readOnly = true;
      resetReason = "newer";
      onVersionAhead(storedVersion);
    } else if (storedRaw == null) {
      resetReason = "fresh";
      wipeAndStamp();
    } else {
      let v = storedVersion;
      let failure = v == null ? "unreadable" : null;
      while (!failure && v < schema) {
        const step = migrations[v];
        if (typeof step !== "function") {
          failure = "missing";
          break;
        }
        try {
          step(storage);
        } catch (err) {
          failure = "threw";
          readOnly = true;
          resetReason = "refused";
          onCannotUpgrade("migration from " + v + " failed: " + String(err && err.message || err));
          break;
        }
        v += 1;
      }
      if (!failure) {
        resetReason = "migrated";
        storage.setItem(SCHEMA_KEY, String(schema));
      } else if (failure !== "threw") {
        if (missingPolicy === "wipe") {
          resetReason = "schema-changed";
          wipeAndStamp();
        } else {
          readOnly = true;
          resetReason = "refused";
          onCannotUpgrade("no migration from " + storedRaw + " to " + schema);
        }
      }
    }
    const READ_ONLY = { ok: false, error: { code: "read-only" } };
    function emit(evt) {
      for (const fn of [...listeners]) {
        try {
          fn(evt);
        } catch (_) {
        }
      }
    }
    function requireClass(key) {
      const cls = classOf(key);
      if (!cls) throw new Error(`store: "${key}" matches no class in CLASSES; add it there first`);
      return cls;
    }
    function envelopeOf(key) {
      return parseEnvelope(storage.getItem(key));
    }
    function evictionOrder(except) {
      return allKeys(storage).filter((k) => k !== except && classOf(k) === "cache").map((k) => ({ k, at: (envelopeOf(k) || { at: 0 }).at })).sort((a, b) => a.at - b.at).map((x) => x.k);
    }
    function markHealthy() {
      if (!blocked) return;
      blocked = false;
      onCapacity("clear");
    }
    function write(key, cls, env) {
      if (readOnly) return READ_ONLY;
      const raw = JSON.stringify(env);
      let lastErr = null;
      const victims = evictionOrder(key);
      for (let attempt = 0; attempt <= victims.length; attempt++) {
        try {
          storage.setItem(key, raw);
          if (cls !== "cache") markHealthy();
          return { ok: true };
        } catch (err) {
          if (!isCapacityError(err)) return { ok: false, error: { code: "unknown", detail: String(err && err.message || err) } };
          lastErr = err;
          if (attempt < victims.length) storage.removeItem(victims[attempt]);
        }
      }
      const detail = String(lastErr && (lastErr.message || lastErr.name) || "");
      if (cls !== "cache" && !blocked) {
        blocked = true;
        onCapacity("blocked", detail);
      }
      return { ok: false, error: { code: "capacity", detail } };
    }
    const store2 = {
      SCHEMA: schema,
      /** 'fresh' | 'schema-changed' | null — why this store started empty, if it did. */
      resetReason,
      classOf,
      /** The stored data, or undefined. Never throws: a corrupt record reads as absent. */
      get(key) {
        const env = envelopeOf(key);
        return env ? env.data : void 0;
      },
      /** When the record was last written, or 0 if it does not exist. */
      at(key) {
        const env = envelopeOf(key);
        return env ? env.at : 0;
      },
      set(key, data) {
        const cls = requireClass(key);
        if (data === void 0) return store2.remove(key);
        const res = write(key, cls, { at: now(), data });
        if (res.ok) emit({ key, cls, origin: "local" });
        return res;
      },
      update(key, fn) {
        return store2.set(key, fn(store2.get(key)));
      },
      remove(key) {
        const cls = requireClass(key);
        if (readOnly) return READ_ONLY;
        storage.removeItem(key);
        emit({ key, cls, origin: "local" });
        return { ok: true };
      },
      /** Every stored key under `prefix` (the schema key is not a record). */
      keys(prefix = "beljar/") {
        return allKeys(storage).filter((k) => k !== SCHEMA_KEY && k.startsWith(prefix)).sort();
      },
      /** Delete every record under `prefix`, e.g. a whole project. */
      removeAll(prefix) {
        if (!prefix || !prefix.startsWith("beljar/")) throw new Error("store.removeAll needs a beljar/ prefix");
        if (readOnly) return 0;
        const gone = store2.keys(prefix);
        for (const k of gone) storage.removeItem(k);
        for (const k of gone) emit({ key: k, cls: classOf(k), origin: "local" });
        return gone.length;
      },
      /**
       * The online layer's only way in. Writes what it pulled with the time the
       * other side stamped, and tells subscribers it came from elsewhere so the
       * editor treats it like another tab's change. `null` data deletes.
       */
      applyRemote(key, data, at) {
        const cls = requireClass(key);
        if (readOnly) return READ_ONLY;
        if (data === null || data === void 0) {
          storage.removeItem(key);
          emit({ key, cls, origin: "remote" });
          return { ok: true };
        }
        const res = write(key, cls, { at: Number(at) || now(), data });
        if (res.ok) emit({ key, cls, origin: "remote" });
        return res;
      },
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      /** True while a write that matters is failing for want of space. */
      isBlocked() {
        return blocked;
      },
      /**
       * True when this page must not write: the storage belongs to a newer
       * BelJar, or holds older data this code will neither migrate nor wipe.
       * Every write then answers { ok: false, error: { code: 'read-only' } }.
       */
      isReadOnly() {
        return readOnly;
      },
      dispose() {
        if (events && onStorageEvent) events.removeEventListener("storage", onStorageEvent);
        listeners.clear();
      }
    };
    let onStorageEvent = null;
    if (events) {
      onStorageEvent = (e) => {
        if (e.storageArea && e.storageArea !== storage) return;
        if (e.key === null) {
          if (!readOnly && storage.getItem(SCHEMA_KEY) == null) storage.setItem(SCHEMA_KEY, String(schema));
          emit({ key: null, cls: null, origin: "tab" });
          return;
        }
        if (e.key === SCHEMA_KEY) {
          const v = versionOf(e.newValue);
          if (v != null && v > schema && !readOnly) {
            readOnly = true;
            onVersionAhead(v);
          }
          return;
        }
        if (!e.key.startsWith("beljar/")) return;
        const env = parseEnvelope(e.newValue);
        emit({ key: e.key, cls: classOf(e.key), origin: "tab", data: env ? env.data : void 0 });
      };
      events.addEventListener("storage", onStorageEvent);
    }
    return store2;
  }

  // js/persist/table.mjs
  function typeOf(row) {
    if (row.values) return "enum";
    if (row.type) return row.type;
    if (typeof row.default === "boolean") return "bool";
    if (typeof row.default === "number") return "number";
    return "string";
  }
  function sameValue(a, b) {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }
  function clone(v) {
    return v !== null && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v;
  }
  function normalizeValue(row, raw) {
    switch (typeOf(row)) {
      case "enum": {
        if (row.values.includes(raw)) return raw;
        if (typeof raw === "string" && raw.trim() !== "" && row.values.some((v) => typeof v === "number")) {
          const n = Number(raw);
          if (row.values.includes(n)) return n;
        }
        return void 0;
      }
      case "bool":
        return typeof raw === "boolean" ? raw : void 0;
      case "string":
        return typeof raw === "string" && raw !== "" ? raw : void 0;
      case "number": {
        let n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
        if (!Number.isFinite(n)) return void 0;
        if (row.min != null && n < row.min) n = row.min;
        if (row.max != null && n > row.max) n = row.max;
        return row.integer ? Math.round(n) : n;
      }
      case "json":
        return row.normalize ? row.normalize(raw) : raw;
      default:
        return void 0;
    }
  }
  function resolveRows(rows, stored) {
    const src = stored && typeof stored === "object" ? stored : {};
    const out = {};
    for (const row of rows) {
      const n = Object.prototype.hasOwnProperty.call(src, row.id) ? normalizeValue(row, src[row.id]) : void 0;
      out[row.id] = clone(n === void 0 ? row.default : n);
    }
    return out;
  }
  function createTable(store2, opts) {
    const { key, rows } = opts;
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ids = rows.map((row) => row.id);
    const listeners = /* @__PURE__ */ new Set();
    const revisions = /* @__PURE__ */ new Map();
    function readOverrides() {
      const rec = store2.get(key);
      const values = rec && rec.values && typeof rec.values === "object" ? rec.values : {};
      const out = {};
      for (const [id, raw] of Object.entries(values)) {
        const row = byId.get(id);
        if (!row) continue;
        const v = normalizeValue(row, raw);
        if (v !== void 0 && !sameValue(v, row.default)) out[id] = v;
      }
      return out;
    }
    let overrides = readOverrides();
    function requireRow(id) {
      const row = byId.get(id);
      if (!row) throw new Error(opts.unknown ? opts.unknown(id) : `${key}: no row "${id}"`);
      return row;
    }
    function emit(changed, origin) {
      if (!changed.length) return;
      for (const id of changed) revisions.set(id, (revisions.get(id) || 0) + 1);
      for (const fn of [...listeners]) {
        try {
          fn({ ids: changed, origin });
        } catch (_) {
        }
      }
    }
    function commit(next) {
      const changed = ids.filter((id) => !sameValue(id in next ? next[id] : void 0, id in overrides ? overrides[id] : void 0));
      if (!changed.length) return { ok: true, changed };
      const res = store2.set(key, { values: next });
      if (!res.ok) return { ok: false, changed: [] };
      overrides = next;
      emit(changed, "local");
      return { ok: true, changed };
    }
    const unsubscribe = store2.subscribe((e) => {
      if (e.origin === "local") return;
      if (e.key !== key && e.key !== null) return;
      const before = overrides;
      overrides = readOverrides();
      emit(ids.filter((id) => !sameValue(before[id], overrides[id])), e.origin);
    });
    return {
      /** The row declaring `id`, or null. */
      rowOf(id) {
        return byId.get(id) || null;
      },
      /** The effective value: what was stored, or the default. Never touches storage. */
      get(id) {
        const row = requireRow(id);
        return clone(id in overrides ? overrides[id] : row.default);
      },
      /**
       * Store a value. Returns false, and stores nothing, when the value is not
       * one this row can hold or storage refused it. Setting a value back to its
       * default removes it from the record.
       */
      set(id, value) {
        const row = requireRow(id);
        const v = normalizeValue(row, value);
        if (v === void 0) return false;
        const next = { ...overrides };
        if (sameValue(v, row.default)) delete next[id];
        else next[id] = clone(v);
        return commit(next).ok;
      },
      /** A number that changes whenever `id`'s effective value does. */
      revision(id) {
        requireRow(id);
        return revisions.get(id) || 0;
      },
      isDefault(id) {
        requireRow(id);
        return !(id in overrides);
      },
      defaultOf(id) {
        return clone(requireRow(id).default);
      },
      /** Every row's effective value. */
      values() {
        return resolveRows(rows, overrides);
      },
      /** Only what differs from the defaults (a copy). */
      overrides() {
        return clone(overrides);
      },
      /** Back to the defaults for every id `pick(row)` selects (all when omitted). */
      reset(pick2) {
        const next = {};
        for (const [id, v] of Object.entries(overrides)) {
          if (pick2 && !pick2(byId.get(id))) next[id] = v;
        }
        return commit(next).ok;
      },
      commit,
      /** fn({ ids, origin: 'local' | 'tab' | 'remote' }) whenever effective values change. */
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      dispose() {
        unsubscribe();
        listeners.clear();
      }
    };
  }

  // js/persist/settings-schema.mjs
  var SETTINGS_KEY = "beljar/settings";
  var SECTIONS = ["appearance", "editor", "keybindings", "beluga", "harpoon", "repl", "workspace", "aliases"];
  function cleanKeybindings(map) {
    if (!map || typeof map !== "object" || Array.isArray(map)) return void 0;
    const out = {};
    for (const [id, v] of Object.entries(map)) {
      if (v === "" || v === null) out[id] = "";
      else if (typeof v === "string") out[id] = v;
    }
    return out;
  }
  function cleanAliasPairs(v) {
    if (v === null) return null;
    return Array.isArray(v) ? v : void 0;
  }
  var ON = true;
  var OFF = false;
  var SETTINGS = [
    // ── Appearance ──────────────────────────────────────────────────────────
    { id: "theme", section: "appearance", default: "dark", values: ["dark", "light"], boot: true },
    { id: "uiFontSize", section: "appearance", default: "md", values: ["sm", "md", "lg", "xl"], boot: true },
    { id: "uiTextContrast", section: "appearance", default: "medium", values: ["low", "medium", "high", "maximum"], boot: true },
    { id: "motionPref", section: "appearance", default: "system", values: ["system", "reduce", "full"], boot: true },
    { id: "toastDuration", section: "appearance", default: "normal", values: ["short", "normal", "long"] },
    // ── Editor: typography ──────────────────────────────────────────────────
    { id: "editorFontSize", section: "editor", default: "md", values: ["sm", "md", "lg", "xl"] },
    { id: "editorLineHeight", section: "editor", default: "normal", values: ["compact", "normal", "relaxed"] },
    { id: "editorWordWrap", section: "editor", default: OFF },
    { id: "editorFontFamily", section: "editor", default: "jetbrains", values: ["jetbrains", "system"], boot: true },
    { id: "editorCursorBlink", section: "editor", default: "blink", values: ["off", "blink", "fast"] },
    { id: "editorScrollPastEnd", section: "editor", default: ON },
    { id: "editorWhitespace", section: "editor", default: "none", values: ["none", "trailing", "selection", "all"] },
    { id: "editorRulers", section: "editor", default: OFF },
    // ── Editor: indentation and saving ──────────────────────────────────────
    { id: "editorTabSize", section: "editor", default: 2, values: [2, 4] },
    { id: "autosaveDelay", section: "editor", default: 320, values: [320, 1e3, 2e3] },
    { id: "editorFormatWidth", section: "editor", default: 80, values: [80, 100, 120] },
    { id: "editorReindentPaste", section: "editor", default: ON },
    { id: "cfgAutoSync", section: "editor", default: ON },
    { id: "formatOnSave", section: "editor", default: OFF },
    { id: "trimTrailingWs", section: "editor", default: OFF },
    // ── Editor: code insight ────────────────────────────────────────────────
    { id: "editorSyntaxHighlight", section: "editor", default: ON },
    { id: "editorSemanticHighlight", section: "editor", default: ON },
    { id: "editorParseHighlight", section: "editor", default: ON },
    { id: "editorOccurrenceHighlight", section: "editor", default: ON },
    { id: "editorBracketMatch", section: "editor", default: ON },
    { id: "editorAutoCloseBrackets", section: "editor", default: ON },
    { id: "editorSelectionMatches", section: "editor", default: ON },
    { id: "hoverScope", section: "editor", default: "all", values: ["all", "user-only", "none"] },
    { id: "hoverSticky", section: "editor", default: OFF },
    { id: "editorAutocompleteTrigger", section: "editor", default: "typing", values: ["typing", "none", "always"] },
    { id: "editorAutocompleteContinue", section: "editor", default: OFF },
    { id: "quietWhileTyping", section: "editor", default: OFF },
    // ── Editor: gutters and diagnostics ─────────────────────────────────────
    { id: "editorLineNumbers", section: "editor", default: ON },
    { id: "editorLineNumberMode", section: "editor", default: "absolute", values: ["absolute", "relative", "hybrid"] },
    { id: "editorFoldGutter", section: "editor", default: ON },
    { id: "editorFoldPersist", section: "editor", default: "session", values: ["session", "none", "local"], sync: false },
    { id: "editorActiveLine", section: "editor", default: ON },
    { id: "diagPresentation", section: "editor", default: "both", values: ["both", "underlines", "gutter", "none"] },
    { id: "diagSeverity", section: "editor", default: "all", values: ["all", "errors"] },
    { id: "editorHoleGutter", section: "editor", default: ON },
    { id: "editorHoleEmphasis", section: "editor", default: "normal", values: ["subtle", "normal", "loud"], boot: true },
    { id: "stickyDeclHeader", section: "editor", default: OFF },
    // ── Keybindings and the keyboard ────────────────────────────────────────
    { id: "keybindings", section: "keybindings", default: {}, type: "json", normalize: cleanKeybindings },
    { id: "keymapStyle", section: "keybindings", default: "default", values: ["default", "vim", "emacs"] },
    // null: the status strip picks its own default for the keymap style.
    { id: "statusStrip", section: "keybindings", default: null, values: [null, "off", "compact", "standard", "detailed"] },
    { id: "vimLeader", section: "keybindings", default: "\\", values: ["\\", ",", " "] },
    { id: "vimInsertEscape", section: "keybindings", default: "", values: ["", "jk", "jj", "kj"] },
    { id: "emacsYankSource", section: "keybindings", default: "system", values: ["system", "kill-ring"] },
    { id: "doubleTapTrigger", section: "keybindings", default: "off", values: ["off", "shift", "control", "alt"] },
    { id: "doubleTapCommand", section: "keybindings", default: "tools.palette", type: "string" },
    { id: "doubleTapSpeed", section: "keybindings", default: "normal", values: ["normal", "fast", "relaxed"] },
    // ── Beluga ──────────────────────────────────────────────────────────────
    // Which build this device downloads: a phone and a workstation differ.
    { id: "belugaMode", section: "beluga", default: "stable", values: ["stable", "fast"], sync: false },
    { id: "belugaFallbackStable", section: "beluga", default: ON },
    { id: "belugaCancelOnEdit", section: "beluga", default: ON },
    { id: "checkAggressiveness", section: "beluga", default: "balanced", values: ["responsive", "balanced", "thorough"] },
    { id: "suiteCheck", section: "beluga", default: "suite", values: ["suite", "active"] },
    // ── Harpoon ─────────────────────────────────────────────────────────────
    { id: "harpoonMode", section: "harpoon", default: "manual", values: ["manual", "orca"] },
    { id: "harpoonVerifyMoves", section: "harpoon", default: ON },
    { id: "autosolveFocusNext", section: "harpoon", default: ON },
    { id: "autosolveShowStats", section: "harpoon", default: ON },
    // ── REPL ────────────────────────────────────────────────────────────────
    { id: "replAutoscroll", section: "repl", default: ON },
    { id: "replWelcome", section: "repl", default: ON },
    { id: "replEcho", section: "repl", default: ON },
    { id: "replFilterChatter", section: "repl", default: ON },
    { id: "replHoverTimestamp", section: "repl", default: OFF },
    { id: "replAutocompleteTrigger", section: "repl", default: "typing", values: ["typing", "none", "always"] },
    { id: "replAutocompleteContinue", section: "repl", default: OFF },
    { id: "replHistoryCap", section: "repl", default: 1e3, values: [100, 250, 500, 1e3] },
    // Where this browser keeps history: a shared computer is not your laptop.
    { id: "replHistoryPersist", section: "repl", default: "local", values: ["local", "session", "none"], sync: false },
    // ── Workspace ───────────────────────────────────────────────────────────
    { id: "inspectorFollow", section: "workspace", default: ON },
    { id: "restorePanels", section: "workspace", default: ON },
    { id: "libraryExpandDefault", section: "workspace", default: OFF },
    // Signed in, settings follow you between devices; off here, this device keeps its own.
    { id: "syncSettings", section: "workspace", default: ON, sync: false },
    // A file changed here and in the cloud in the same lines: ask (the review
    // window), or settle it as soon as it appears (js/account/sync-ui.mjs).
    { id: "syncOverlap", section: "workspace", default: "ask", values: ["ask", "mine", "cloud"] },
    // ── Aliases ─────────────────────────────────────────────────────────────
    { id: "aliasActivation", section: "aliases", default: "greedy", values: ["greedy", "strict"] },
    // null: the built-in alias table.
    { id: "aliasPairs", section: "aliases", default: null, type: "json", normalize: cleanAliasPairs }
  ];
  var BY_ID = new Map(SETTINGS.map((row) => [row.id, row]));
  function settingRow(id) {
    return BY_ID.get(id) || null;
  }
  function isSyncedSetting(row) {
    return !!row && row.sync !== false;
  }
  var normalizeSetting = normalizeValue;
  function defaultOf(id) {
    const row = settingRow(id);
    if (!row) throw new Error(`settings: no setting "${id}"`);
    return clone(row.default);
  }

  // js/persist/settings.mjs
  var EXPORT_KIND = "beljar-settings";
  function createSettings(store2) {
    const table = createTable(store2, {
      key: SETTINGS_KEY,
      rows: SETTINGS,
      unknown: (id) => `settings: no setting "${id}" (declare it in settings-schema.mjs)`
    });
    return {
      SECTIONS,
      get: table.get,
      set: table.set,
      revision: table.revision,
      isDefault: table.isDefault,
      values: table.values,
      subscribe: table.subscribe,
      dispose: table.dispose,
      defaultOf,
      /** Back to defaults for one Settings category. */
      reset(section) {
        if (!SECTIONS.includes(section)) throw new Error(`settings: no section "${section}"`);
        return table.reset((row) => row.section === section);
      },
      resetAll() {
        return table.reset();
      },
      /** Exactly what the user changed, in a file they can keep. */
      exportBundle(now = Date.now()) {
        return { kind: EXPORT_KIND, exportedAt: now, values: table.overrides() };
      },
      /**
       * Apply an exported bundle. Unknown ids and values a setting cannot hold are
       * skipped and named, never half-applied: what is valid lands in one write.
       */
      importBundle(bundle) {
        if (!bundle || bundle.kind !== EXPORT_KIND || !bundle.values || typeof bundle.values !== "object") {
          return { ok: false, reason: "not a BelJar settings file", applied: [], skipped: [] };
        }
        const next = table.overrides();
        const applied = [];
        const skipped = [];
        for (const [id, raw] of Object.entries(bundle.values)) {
          const row = settingRow(id);
          const v = row ? normalizeSetting(row, raw) : void 0;
          if (v === void 0) {
            skipped.push(id);
            continue;
          }
          if (sameValue(v, row.default)) delete next[id];
          else next[id] = clone(v);
          applied.push(id);
        }
        const res = table.commit(next);
        return { ok: res.ok, applied: res.ok ? applied : [], skipped };
      }
    };
  }

  // js/persist/device-schema.mjs
  var DEVICE_KEY = "beljar/device";
  function stringList(cap) {
    return (raw) => {
      if (!Array.isArray(raw)) return void 0;
      const out = [];
      for (const x of raw) {
        if (typeof x === "string" && x && out.indexOf(x) === -1) out.push(x);
      }
      return cap ? out.slice(0, cap) : out;
    };
  }
  function runModel(raw) {
    if (!raw || typeof raw !== "object") return void 0;
    const { baseMs, msPerLine, sampleCount } = raw;
    if (!(typeof msPerLine === "number" && msPerLine > 0) || !(typeof baseMs === "number" && baseMs >= 0)) return void 0;
    return {
      baseMs,
      msPerLine,
      sampleCount: typeof sampleCount === "number" && sampleCount >= 1 ? Math.floor(sampleCount) : 1
    };
  }
  var PANEL_W = { group: "layout", default: 250, min: 160, max: 512, integer: true, boot: true };
  var PANEL_H = { group: "layout", default: 190, min: 96, max: 384, integer: true, boot: true };
  var DEVICE = [
    // which project the next load opens (a page stays on the one it opened: work.mjs)
    { id: "activeProject", type: "string", default: "" },
    // the account this browser is signed in as ('' signed out): whose projects it
    // shows, and who owns a new one (work.mjs). An opaque id, never a credential.
    { id: "account", type: "string", default: "" },
    // durability.mjs: when this browser was last asked to keep BelJar's storage,
    // and when this device was told Safari may delete it (ms; 0: never)
    { id: "persistAskedAt", type: "number", default: 0 },
    { id: "durabilityWarnedAt", type: "number", default: 0 },
    // layout
    { id: "editorSplit", group: "layout", default: 0.5, min: 0.18, max: 0.82, boot: true },
    { id: "explorerWidth", ...PANEL_W, cssVar: "--explorer-w" },
    { id: "explorerHeight", ...PANEL_H, max: 320, cssVar: "--explorer-h" },
    { id: "inspectorWidth", ...PANEL_W, cssVar: "--inspector-w" },
    { id: "inspectorHeight", ...PANEL_H, cssVar: "--inspector-h" },
    { id: "libraryWidth", ...PANEL_W, cssVar: "--library-w" },
    { id: "libraryHeight", ...PANEL_H, cssVar: "--library-h" },
    { id: "harpoonWidth", ...PANEL_W, cssVar: "--harpoon-w" },
    { id: "harpoonHeight", ...PANEL_H, cssVar: "--harpoon-h" },
    { id: "harpoonDetailsCollapsed", default: false },
    // the dependency graph panel
    { id: "graphLayout", default: "force", values: ["force", "flat"] },
    { id: "graphImpl", default: "show", values: ["show", "hide"] },
    { id: "graphDepth", default: 1, values: [1, 2, 3] },
    { id: "graphLabelDensity", default: 3, values: [1, 2, 3, 4, 5] },
    { id: "graphSidebarCollapsed", default: false },
    // what this device has learned or been told
    { id: "dismissedHints", type: "json", default: [], normalize: stringList() },
    { id: "commandLineHistory", type: "json", default: [], normalize: stringList(50) },
    { id: "runModel", type: "json", default: null, normalize: runModel },
    { id: "jumpLog", default: false }
  ];
  var BY_ID2 = new Map(DEVICE.map((row) => [row.id, row]));

  // js/persist/keys.mjs
  var NOTIFICATIONS_KEY = "beljar/notifications";
  var REPL_TRANSCRIPT_KEY = "beljar/repl/transcript";
  var REPL_COMMANDS_KEY = "beljar/repl/commands";
  var TOMBSTONES_KEY = "beljar/tombstones";
  var SETTINGS_SYNC_KEY = "beljar/settings-sync";
  function tabMessageKey(kind) {
    return "beljar/tabs/" + kind;
  }
  function projectPrefix(pid) {
    return "beljar/p/" + pid + "/";
  }
  function metaKey(pid) {
    return projectPrefix(pid) + "meta";
  }
  function treeKey(pid) {
    return projectPrefix(pid) + "tree";
  }
  function fileKey(pid, fid) {
    return projectPrefix(pid) + "f/" + fid;
  }
  function sessionKey(pid) {
    return projectPrefix(pid) + "session";
  }
  function cacheKey(pid, fid) {
    return projectPrefix(pid) + "cache/" + fid;
  }
  function foldsKey(pid) {
    return projectPrefix(pid) + "folds";
  }
  function syncKey(pid) {
    return projectPrefix(pid) + "sync";
  }
  function undoKey(pid) {
    return projectPrefix(pid) + "undo";
  }
  function conflictKey(pid, fid) {
    return projectPrefix(pid) + "conflict/" + fid;
  }
  var PROJECT_KEY = /^beljar\/p\/([^/]+)\/(meta|tree|session|folds|undo|sync|f|cache|conflict)(?:\/([^/]+))?$/;
  function parseKey(key) {
    var m = typeof key === "string" ? PROJECT_KEY.exec(key) : null;
    if (!m) return null;
    var hasFile = m[2] === "f" || m[2] === "cache" || m[2] === "conflict";
    if (hasFile !== (m[3] != null)) return null;
    return hasFile ? { pid: m[1], kind: m[2], fid: m[3] } : { pid: m[1], kind: m[2] };
  }
  var B32 = "0123456789abcdefghjkmnpqrstvwxyz";
  var lastTime = -1;
  var lastRand = null;
  function randomBytes(n) {
    var cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.getRandomValues === "function") return cryptoApi.getRandomValues(new Uint8Array(n));
    var out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
    return out;
  }
  function encodeTime(ms) {
    var s = "";
    var t = ms;
    for (var i = 0; i < 10; i++) {
      s = B32[t % 32] + s;
      t = Math.floor(t / 32);
    }
    return s;
  }
  function encodeRandom(bytes) {
    var s = "";
    var acc = 0;
    var bits = 0;
    for (var i = 0; i < bytes.length; i++) {
      acc = acc << 8 | bytes[i];
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        s += B32[acc >> bits & 31];
      }
      acc &= (1 << bits) - 1;
    }
    return s;
  }
  function increment(bytes) {
    for (var i = bytes.length - 1; i >= 0; i--) {
      if (bytes[i] < 255) {
        bytes[i] += 1;
        return true;
      }
      bytes[i] = 0;
    }
    return false;
  }
  function newId(kind, taken) {
    for (; ; ) {
      var now = Date.now();
      if (now > lastTime || !lastRand) {
        lastTime = now;
        lastRand = randomBytes(10);
      } else if (!increment(lastRand)) {
        lastTime += 1;
        lastRand = randomBytes(10);
      }
      var id = kind + "_" + encodeTime(lastTime) + encodeRandom(lastRand);
      if (!taken || !taken(id)) return id;
    }
  }

  // js/persist/work.mjs
  var DEFAULT_PROJECT_NAME = "Untitled Project";
  var FIRST_FILE_NAME = "main.bel";
  var CACHE_LIMIT = 1024;
  function cleanName(name) {
    return String(name != null ? name : "").trim() || DEFAULT_PROJECT_NAME;
  }
  function stringList2(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const x of raw) {
      if (typeof x === "string" && x && out.indexOf(x) === -1) out.push(x);
    }
    return out;
  }
  function emptyTree() {
    return { files: [], folders: [], suites: {} };
  }
  function normalizeTree(raw) {
    const t = emptyTree();
    if (!raw || typeof raw !== "object") return t;
    if (Array.isArray(raw.files)) {
      const seen = /* @__PURE__ */ new Set();
      for (const f of raw.files) {
        if (!f || typeof f.id !== "string" || !f.id || typeof f.name !== "string" || seen.has(f.id)) continue;
        seen.add(f.id);
        t.files.push({ id: f.id, name: f.name });
      }
    }
    t.folders = stringList2(raw.folders);
    if (raw.suites && typeof raw.suites === "object" && !Array.isArray(raw.suites)) {
      for (const dir of Object.keys(raw.suites)) {
        const list = stringList2(raw.suites[dir]);
        if (list.length) t.suites[dir] = list;
      }
    }
    return t;
  }
  function copyTree(t) {
    const suites = {};
    for (const dir of Object.keys(t.suites)) suites[dir] = t.suites[dir].slice();
    return {
      files: t.files.map((f) => ({ id: f.id, name: f.name })),
      folders: t.folders.slice(),
      suites
    };
  }
  function normalizeSession(raw) {
    const s = { open: null, active: null, views: {}, workspace: null, panel: null, explorerFolds: [] };
    if (!raw || typeof raw !== "object") return s;
    if (Array.isArray(raw.open)) s.open = stringList2(raw.open);
    if (typeof raw.active === "string" && raw.active) s.active = raw.active;
    if (raw.views && typeof raw.views === "object" && !Array.isArray(raw.views)) {
      for (const fid of Object.keys(raw.views)) {
        const v = raw.views[fid];
        if (v && typeof v === "object") s.views[fid] = v;
      }
    }
    if (raw.workspace && typeof raw.workspace === "object") s.workspace = raw.workspace;
    if (typeof raw.panel === "string" && raw.panel) s.panel = raw.panel;
    s.explorerFolds = stringList2(raw.explorerFolds);
    return s;
  }
  function normalizeMeta(pid, raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: pid,
      name: cleanName(raw.name),
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
      owner: typeof raw.owner === "string" && raw.owner ? raw.owner : null
    };
  }
  function metaRecord(meta) {
    return { name: meta.name, createdAt: meta.createdAt, owner: meta.owner };
  }
  function normalizeConflict(raw) {
    if (!raw || typeof raw !== "object" || typeof raw.theirs !== "string" || typeof raw.mine !== "string") return null;
    return {
      base: typeof raw.base === "string" ? raw.base : "",
      mine: raw.mine,
      theirs: raw.theirs,
      at: typeof raw.at === "number" ? raw.at : 0,
      source: raw.source === "device" ? "device" : "tab"
    };
  }
  function sameTree(a, b) {
    return JSON.stringify(normalizeTree(a)) === JSON.stringify(normalizeTree(b));
  }
  function normalizeTombstones(raw) {
    const out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const pid of Object.keys(raw)) {
      const t = raw[pid];
      if (!t || typeof t !== "object" || typeof t.owner !== "string" || !t.owner) continue;
      out[pid] = {
        version: Number.isInteger(t.version) && t.version > 0 ? t.version : 0,
        owner: t.owner,
        pending: typeof t.pending === "string" && t.pending ? t.pending : null,
        at: typeof t.at === "number" ? t.at : 0
      };
    }
    return out;
  }
  function createWork(opts) {
    const store2 = opts.store;
    const now = opts.now || (() => Date.now());
    const device = opts.device || createTable(store2, { key: DEVICE_KEY, rows: DEVICE });
    const cache = /* @__PURE__ */ new Map();
    const PROJECTS = " projects";
    let pinned = null;
    store2.subscribe((evt) => {
      if (evt.key == null) {
        cache.clear();
        return;
      }
      cache.delete(evt.key);
      const k = parseKey(evt.key);
      if (k && k.kind === "meta") cache.delete(PROJECTS);
    });
    function remember(key, value) {
      if (cache.size >= CACHE_LIMIT) cache.clear();
      cache.set(key, value);
      return value;
    }
    function cached(key, load) {
      if (cache.has(key)) return cache.get(key);
      return remember(key, load(store2.get(key)));
    }
    function put(key, value, stored) {
      const res = store2.set(key, stored !== void 0 ? stored : value);
      if (res.ok) remember(key, value);
      return res;
    }
    function peekProjects() {
      if (cache.has(PROJECTS)) return cache.get(PROJECTS);
      const list = [];
      for (const key of store2.keys("beljar/p/")) {
        const k = parseKey(key);
        if (!k || k.kind !== "meta") continue;
        const meta = normalizeMeta(k.pid, store2.get(key));
        if (meta) list.push(meta);
      }
      list.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return remember(PROJECTS, list);
    }
    function hasProject(pid) {
      return peekProjects().some((p) => p.id === pid);
    }
    function account() {
      return device.get("account") || null;
    }
    function setAccount(uid) {
      if (uid) return device.set("account", String(uid));
      return device.reset((row) => row.id === "account");
    }
    function isVisible(p) {
      return p.owner === null || p.owner === account();
    }
    function peekVisible() {
      return peekProjects().filter(isVisible);
    }
    function claimProject(pid) {
      const uid = account();
      const meta = normalizeMeta(pid, store2.get(metaKey(pid)));
      if (!uid || !meta || meta.owner !== null) return false;
      meta.owner = uid;
      return put(metaKey(pid), metaRecord(meta)).ok;
    }
    function removeAccountProjects(uid) {
      if (!uid) return 0;
      let n = 0;
      for (const p of peekProjects()) {
        if (p.owner !== uid) continue;
        store2.remove(metaKey(p.id));
        store2.removeAll(projectPrefix(p.id));
        if (pinned === p.id) pinned = null;
        n += 1;
      }
      const tombs = readTombstones();
      let dropped = false;
      for (const pid of Object.keys(tombs)) {
        if (tombs[pid].owner === uid) {
          delete tombs[pid];
          dropped = true;
        }
      }
      if (dropped) writeTombstones(tombs);
      const synced = store2.get(SETTINGS_SYNC_KEY);
      if (synced && synced.account === uid) store2.remove(SETTINGS_SYNC_KEY);
      return n;
    }
    function readTombstones() {
      return normalizeTombstones(store2.get(TOMBSTONES_KEY));
    }
    function writeTombstones(tombs) {
      return Object.keys(tombs).length ? store2.set(TOMBSTONES_KEY, tombs) : store2.remove(TOMBSTONES_KEY);
    }
    function writeDevice(pid) {
      return device.set("activeProject", pid);
    }
    function createProject(name) {
      const pid = newId("p", (id) => store2.keys(projectPrefix(id)).length > 0);
      const fid = newId("f");
      const landed = put(treeKey(pid), normalizeTree({ files: [{ id: fid, name: FIRST_FILE_NAME }] })).ok && put(sessionKey(pid), normalizeSession({ open: [fid], active: fid })).ok && put(metaKey(pid), metaRecord({ name: cleanName(name), createdAt: now(), owner: account() })).ok;
      if (landed) return pid;
      store2.removeAll(projectPrefix(pid));
      return null;
    }
    function ensureProjects() {
      if (!peekVisible().length) {
        const pid = createProject(DEFAULT_PROJECT_NAME);
        if (!pid) throw new Error("BelJar could not create a project: storage refused the write (full, or owned by another version)");
        writeDevice(pid);
      }
      return peekVisible();
    }
    function listProjects() {
      return ensureProjects().map((p) => Object.assign({}, p));
    }
    function pinnedProject() {
      return pinned;
    }
    function projectId() {
      if (pinned) return pinned;
      const list = ensureProjects();
      const want = device.get("activeProject");
      pinned = list.some((p) => p.id === want) ? want : list[0].id;
      if (want !== pinned) writeDevice(pinned);
      return pinned;
    }
    function getProject(pid) {
      const p = peekProjects().find((x) => x.id === (pid || projectId()));
      return p ? Object.assign({}, p) : null;
    }
    function setActiveProject(pid) {
      if (!ensureProjects().some((p) => p.id === pid)) return false;
      writeDevice(pid);
      pinned = pid;
      return true;
    }
    function renameProject(pid, name) {
      const meta = normalizeMeta(pid, store2.get(metaKey(pid)));
      if (!meta) return false;
      meta.name = cleanName(name);
      return put(metaKey(pid), metaRecord(meta)).ok;
    }
    function deleteProject(pid) {
      const list = ensureProjects();
      if (list.length <= 1) return null;
      const idx = list.findIndex((p) => p.id === pid);
      if (idx === -1) return null;
      const others = list.filter((p) => p.id !== pid);
      const owner = list[idx].owner;
      const synced = store2.get(syncKey(pid));
      if (owner && synced && typeof synced === "object" && (synced.version > 0 || synced.pending)) {
        const tombs = readTombstones();
        tombs[pid] = {
          version: synced.version > 0 ? synced.version : 0,
          owner,
          pending: synced.pending && typeof synced.pending.id === "string" ? synced.pending.id : null,
          at: now()
        };
        if (!writeTombstones(tombs).ok) return null;
      }
      store2.remove(metaKey(pid));
      store2.removeAll(projectPrefix(pid));
      const next = others[Math.max(0, idx - 1)].id;
      if (device.get("activeProject") === pid) writeDevice(next);
      if (pinned === pid) pinned = next;
      return next;
    }
    function peekTree(pid) {
      return cached(treeKey(pid || projectId()), normalizeTree);
    }
    function readTree(pid) {
      return copyTree(peekTree(pid));
    }
    function writeTree(tree, pid) {
      pid = pid || projectId();
      if (!hasProject(pid)) return { ok: false, error: { code: "gone" } };
      return put(treeKey(pid), normalizeTree(tree));
    }
    function updateTree(fn, pid) {
      const draft = readTree(pid);
      const next = fn(draft);
      return writeTree(next || draft, pid);
    }
    function hasFile(fid, pid) {
      return peekTree(pid).files.some((f) => f.id === fid);
    }
    function newFileId(pid) {
      const files2 = peekTree(pid).files;
      return newId("f", (id) => files2.some((f) => f.id === id));
    }
    function getText(fid, pid) {
      return cached(fileKey(pid || projectId(), fid), (d) => d && typeof d.text === "string" ? d.text : "");
    }
    function setText(fid, text, pid) {
      const t = String(text != null ? text : "");
      return put(fileKey(pid || projectId(), fid), t, { text: t });
    }
    function textOrigin(fid, pid) {
      const d = store2.get(fileKey(pid || projectId(), fid));
      return d && d.via === "sync" ? "sync" : "local";
    }
    function removeFiles(fids, pid) {
      pid = pid || projectId();
      const views = peekSession(pid).views;
      let hadView = false;
      for (const fid of fids) {
        store2.remove(fileKey(pid, fid));
        store2.remove(cacheKey(pid, fid));
        store2.remove(conflictKey(pid, fid));
        if (views[fid]) hadView = true;
      }
      if (hadView) {
        updateSession((draft) => {
          for (const fid of fids) delete draft.views[fid];
        }, pid);
      }
    }
    function peekSession(pid) {
      return cached(sessionKey(pid || projectId()), normalizeSession);
    }
    function readSession(pid) {
      return JSON.parse(JSON.stringify(peekSession(pid)));
    }
    function updateSession(fn, pid) {
      pid = pid || projectId();
      if (!hasProject(pid)) return { ok: false, error: { code: "gone" } };
      const draft = readSession(pid);
      const next = normalizeSession(fn(draft) || draft);
      const live = new Set(peekTree(pid).files.map((f) => f.id));
      if (next.open) next.open = next.open.filter((id) => live.has(id));
      if (next.active && !live.has(next.active)) next.active = null;
      for (const fid of Object.keys(next.views)) {
        if (!live.has(fid)) delete next.views[fid];
      }
      return put(sessionKey(pid), next);
    }
    function readCache(fid, pid) {
      const d = store2.get(cacheKey(pid || projectId(), fid));
      return d && typeof d === "object" ? d : null;
    }
    function writeCache(fid, data, pid) {
      const key = cacheKey(pid || projectId(), fid);
      if (data == null) return store2.remove(key);
      return store2.set(key, data);
    }
    function readConflict(fid, pid) {
      return normalizeConflict(store2.get(conflictKey(pid || projectId(), fid)));
    }
    function writeConflict(fid, conflict, pid) {
      return store2.set(conflictKey(pid || projectId(), fid), conflict);
    }
    function removeConflict(fid, pid) {
      return store2.remove(conflictKey(pid || projectId(), fid));
    }
    function listConflicts() {
      const out = [];
      for (const p of peekVisible()) {
        const prefix = projectPrefix(p.id) + "conflict/";
        const keys = store2.keys(prefix);
        if (!keys.length) continue;
        const names = new Map(peekTree(p.id).files.map((f) => [f.id, f.name]));
        for (const key of keys) {
          const fid = key.slice(prefix.length);
          const rec = normalizeConflict(store2.get(key));
          if (!rec) continue;
          out.push({ pid: p.id, project: p.name, fid, path: names.get(fid) || fid, source: rec.source, at: rec.at });
        }
      }
      return out;
    }
    function conflictSides(fid, pid) {
      const rec = readConflict(fid, pid);
      if (!rec) return null;
      return { base: rec.base, mine: rec.mine, theirs: getText(fid, pid), source: rec.source, at: rec.at };
    }
    function resolveStoredConflict(fid, choice, pid) {
      const rec = readConflict(fid, pid);
      if (!rec || choice !== "mine" && choice !== "theirs") return false;
      if (choice === "mine" && !setText(fid, rec.mine, pid).ok) return false;
      removeConflict(fid, pid);
      return true;
    }
    function snapshotProject(pid) {
      const meta = normalizeMeta(pid, store2.get(metaKey(pid)));
      if (!meta) return null;
      const tree = copyTree(peekTree(pid));
      const texts = {};
      for (const f of tree.files) texts[f.id] = getText(f.id, pid);
      const conflicted = /* @__PURE__ */ new Set();
      const prefix = projectPrefix(pid) + "conflict/";
      for (const key of store2.keys(prefix)) conflicted.add(key.slice(prefix.length));
      return { meta, tree, texts, conflicted };
    }
    function applyProject(pid, next, opts2) {
      const o = opts2 || {};
      const at = now();
      const before = normalizeMeta(pid, store2.get(metaKey(pid)));
      const prev = before ? peekTree(pid) : emptyTree();
      for (const c of o.conflicts || []) {
        const rec = { base: c.base, mine: c.mine, theirs: c.theirs, at, source: "device" };
        if (!store2.set(conflictKey(pid, c.id), rec).ok) return false;
      }
      for (const f of next.files) {
        const key = fileKey(pid, f.id);
        if (before && store2.get(key) !== void 0 && getText(f.id, pid) === f.text) continue;
        if (!store2.applyRemote(key, { text: f.text, via: "sync" }, at).ok) return false;
      }
      const tree = normalizeTree({
        files: next.files.map((f) => ({ id: f.id, name: f.path })),
        folders: next.folders,
        suites: next.suites
      });
      if (!before || !sameTree(tree, prev)) {
        if (!store2.applyRemote(treeKey(pid), tree, at).ok) return false;
      }
      const meta = {
        name: cleanName(next.name),
        createdAt: next.createdAt || (before ? before.createdAt : at),
        owner: before ? before.owner : o.owner || null
      };
      if (!before || before.name !== meta.name || before.createdAt !== meta.createdAt) {
        if (!store2.applyRemote(metaKey(pid), metaRecord(meta), at).ok) return false;
      }
      const keep = new Set(next.files.map((f) => f.id));
      for (const f of prev.files) {
        if (keep.has(f.id)) continue;
        store2.applyRemote(fileKey(pid, f.id), null);
        store2.remove(cacheKey(pid, f.id));
        store2.remove(conflictKey(pid, f.id));
      }
      return true;
    }
    function forgetProject(pid) {
      store2.applyRemote(metaKey(pid), null);
      store2.removeAll(projectPrefix(pid));
      if (pinned === pid) pinned = null;
    }
    function projectStats(pid) {
      const tree = peekTree(pid);
      let size = 0;
      let editedAt = store2.at(metaKey(pid));
      editedAt = Math.max(editedAt, store2.at(treeKey(pid)));
      for (const f of tree.files) {
        size += getText(f.id, pid).length;
        editedAt = Math.max(editedAt, store2.at(fileKey(pid, f.id)));
      }
      return { files: tree.files.length, size, editedAt };
    }
    function allProjects() {
      return peekProjects().map((p) => Object.assign({}, p));
    }
    function dropTombstone(pid) {
      const tombs = readTombstones();
      if (!(pid in tombs)) return { ok: true };
      delete tombs[pid];
      return writeTombstones(tombs);
    }
    function onFileChange(fn) {
      return store2.subscribe((evt) => {
        if (evt.key == null) {
          fn({ pid: null, fid: null, origin: evt.origin });
          return;
        }
        const k = parseKey(evt.key);
        if (k && k.kind === "f") fn({ pid: k.pid, fid: k.fid, origin: evt.origin });
      });
    }
    return {
      // projects
      listProjects,
      getProject,
      hasProject,
      projectId,
      pinnedProject,
      setActiveProject,
      createProject,
      renameProject,
      deleteProject,
      // tree
      peekTree,
      readTree,
      writeTree,
      updateTree,
      hasFile,
      newFileId,
      // text
      getText,
      setText,
      textOrigin,
      removeFiles,
      // session
      peekSession,
      readSession,
      updateSession,
      // cache
      readCache,
      writeCache,
      // conflicts
      readConflict,
      writeConflict,
      removeConflict,
      listConflicts,
      conflictSides,
      resolveStoredConflict,
      // accounts
      account,
      setAccount,
      claimProject,
      removeAccountProjects,
      // the online layer
      allProjects,
      projectStats,
      snapshotProject,
      applyProject,
      forgetProject,
      readTombstones,
      dropTombstone,
      // events
      onFileChange
    };
  }

  // js/persist/work-files.mjs
  function create(deps) {
    var work2 = deps.work;
    var settings = deps.settings;
    function dirOf(name) {
      var i = String(name || "").lastIndexOf("/");
      return i === -1 ? "" : name.slice(0, i);
    }
    function notifyProjectTreeChanged(kind) {
      var g2 = typeof window !== "undefined" ? window : null;
      if (g2 && typeof g2.dispatchEvent === "function") {
        g2.dispatchEvent(new CustomEvent("beljar:project-tree-changed", { detail: { kind } }));
      }
    }
    function listFiles() {
      return work2.peekTree().files.map(function(f) {
        return { id: f.id, name: f.name };
      });
    }
    function getFileById(id) {
      var files2 = work2.peekTree().files;
      for (var i = 0; i < files2.length; i++) {
        if (files2[i].id === id) return { id: files2[i].id, name: files2[i].name };
      }
      return null;
    }
    function fileNameForId(id) {
      var f = getFileById(id);
      return f ? f.name : "";
    }
    function writeFiles(files2) {
      work2.updateTree(function(t) {
        t.files = files2;
      });
    }
    function readEmptyFolders() {
      return work2.peekTree().folders.slice();
    }
    function writeEmptyFolders(paths) {
      work2.updateTree(function(t) {
        t.folders = paths || [];
      });
    }
    function listEmptyFolders() {
      return readEmptyFolders();
    }
    function addEmptyFolder(path) {
      var p = String(path || "").trim();
      if (!p) return;
      var list = readEmptyFolders();
      if (list.indexOf(p) !== -1) return;
      list.push(p);
      list.sort();
      writeEmptyFolders(list);
      notifyProjectTreeChanged("folder-add");
    }
    function removeEmptyFolder(path) {
      var p = String(path || "");
      var list = readEmptyFolders();
      var next = list.filter(function(x) {
        return x !== p;
      });
      if (next.length === list.length) return;
      writeEmptyFolders(next);
      notifyProjectTreeChanged("folder-remove");
    }
    function clearEmptyFolders() {
      if (!readEmptyFolders().length) return;
      writeEmptyFolders([]);
      notifyProjectTreeChanged("folder-clear");
    }
    function pruneEmptyFoldersUnder(prefix) {
      var p = String(prefix || "").trim();
      if (!p) {
        clearEmptyFolders();
        return;
      }
      var list = readEmptyFolders();
      var kept = list.filter(function(x) {
        return x !== p && x.indexOf(p + "/") !== 0;
      });
      if (kept.length !== list.length) {
        writeEmptyFolders(kept);
        notifyProjectTreeChanged("folder-prune");
      }
    }
    function renameEmptyFolderPrefix(from, to) {
      var list = readEmptyFolders();
      var changed = false;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (p === from || p.indexOf(from + "/") === 0) {
          list[i] = to ? to + p.slice(from.length) : p.slice(from.length + 1);
          changed = true;
        }
      }
      if (changed) {
        list = list.filter(function(x) {
          return x;
        });
        list.sort();
        writeEmptyFolders(list);
        notifyProjectTreeChanged("folder-rename");
      }
    }
    function pruneEmptyFoldersForFile(filePath) {
      var name = String(filePath || "");
      if (!name) return;
      var list = readEmptyFolders();
      var next = list.filter(function(ef) {
        return name !== ef && name.indexOf(ef + "/") !== 0;
      });
      if (next.length !== list.length) {
        writeEmptyFolders(next);
        notifyProjectTreeChanged("folder-prune");
      }
    }
    function folderSubtreeOccupied(folderPath, files2, emptyFolders) {
      if (!folderPath) return files2.length > 0 || emptyFolders.length > 0;
      var prefix = folderPath + "/";
      for (var i = 0; i < files2.length; i++) {
        if (files2[i].name.indexOf(prefix) === 0) return true;
      }
      for (var j = 0; j < emptyFolders.length; j++) {
        if (emptyFolders[j].indexOf(prefix) === 0) return true;
      }
      return false;
    }
    function preserveEmptyFoldersAfterPath(oldFilePath, skipPrefixes) {
      var name = String(oldFilePath || "");
      if (!name || name.indexOf("/") === -1) return;
      var parts = name.split("/");
      parts.pop();
      var files2 = listFiles();
      var empty = readEmptyFolders();
      for (var i = parts.length - 1; i >= 0; i--) {
        var fp = parts.slice(0, i + 1).join("/");
        if (skipPrefixes && isPrefixUnderAny(fp, skipPrefixes)) continue;
        if (!folderSubtreeOccupied(fp, files2, empty)) {
          addEmptyFolder(fp);
          empty = readEmptyFolders();
        }
      }
    }
    function isPrefixUnderAny(path, prefixes) {
      for (var p in prefixes) {
        if (path === p || path.indexOf(p + "/") === 0) return true;
      }
      return false;
    }
    function relocatedPrefixTarget(prefix, moves, files2) {
      var ps = prefix + "/";
      for (var i = 0; i < files2.length; i++) {
        var n = files2[i].name;
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
        if (to !== (rel ? np + "/" + rel : np)) return null;
      }
      return newPrefix;
    }
    function inferRelocatedFolderPrefixes(moves, files2) {
      var candidates = {};
      for (var i = 0; i < moves.length; i++) {
        var from = moves[i].from;
        if (!from || from.indexOf("/") === -1) continue;
        var parts = from.split("/");
        parts.pop();
        var acc = "";
        for (var p = 0; p < parts.length; p++) {
          acc = acc ? acc + "/" + parts[p] : parts[p];
          candidates[acc] = true;
        }
      }
      var out = {};
      for (var prefix in candidates) {
        var target = relocatedPrefixTarget(prefix, moves, files2);
        if (target != null) out[prefix] = target;
      }
      return out;
    }
    function preserveEmptyFoldersAfterMoves(moves) {
      if (!moves || !moves.length) return;
      var files2 = listFiles();
      var reloc = inferRelocatedFolderPrefixes(moves, files2);
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
    function getActiveFileId() {
      var files2 = work2.peekTree().files;
      if (!files2.length) return null;
      var id = work2.peekSession().active;
      for (var i = 0; i < files2.length; i++) {
        if (files2[i].id === id) return id;
      }
      return files2[0].id;
    }
    function setActiveFileId(id) {
      work2.updateSession(function(s) {
        s.active = id || null;
      });
    }
    function getOpenFileIds() {
      var files2 = work2.peekTree().files;
      if (!files2.length) return [];
      var open = work2.peekSession().open;
      if (open === null) {
        var active = getActiveFileId();
        return active ? [active] : [];
      }
      var valid = {};
      for (var i = 0; i < files2.length; i++) valid[files2[i].id] = true;
      return open.filter(function(id) {
        return valid[id];
      });
    }
    function setOpenFileIds(ids) {
      work2.updateSession(function(s) {
        s.open = (ids || []).slice();
      });
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
    function closeOpenFile(id) {
      var ids = getOpenFileIds();
      var idx = ids.indexOf(id);
      if (idx === -1) return ids;
      ids.splice(idx, 1);
      setOpenFileIds(ids);
      return ids;
    }
    function getProjectName() {
      var p = work2.getProject();
      return p ? p.name : DEFAULT_PROJECT_NAME;
    }
    function setProjectName(name) {
      work2.renameProject(work2.projectId(), name);
    }
    function normalizeActiveCfgList(val) {
      if (!val) return [];
      if (Array.isArray(val)) {
        var out = [];
        for (var i = 0; i < val.length; i++) {
          var s = String(val[i] != null ? val[i] : "").trim();
          if (s) out.push(s);
        }
        return out;
      }
      var one = String(val).trim();
      return one ? [one] : [];
    }
    function readActiveCfgByDir() {
      var suites = work2.peekTree().suites;
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
      work2.updateTree(function(t) {
        t.suites = out;
      });
    }
    function getActiveCfgsForDir(dir) {
      var map = readActiveCfgByDir();
      var d = dir != null ? String(dir) : "";
      return normalizeActiveCfgList(map[d]);
    }
    function getActiveCfgForDir(dir) {
      var list = getActiveCfgsForDir(dir);
      return list.length ? list[0] : null;
    }
    function setActiveCfgsForDir(dir, paths) {
      var map = readActiveCfgByDir();
      var d = dir != null ? String(dir) : "";
      var list = normalizeActiveCfgList(paths);
      if (list.length) map[d] = list;
      else delete map[d];
      writeActiveCfgByDir(map);
    }
    function setActiveCfgForDir(dir, path) {
      var trimmed = String(path != null ? path : "").trim();
      if (trimmed) setActiveCfgsForDir(dir, [trimmed]);
      else setActiveCfgsForDir(dir, []);
    }
    function addActiveCfgForDir(dir, path) {
      var trimmed = String(path != null ? path : "").trim();
      if (!trimmed) return;
      var list = getActiveCfgsForDir(dir);
      for (var i = 0; i < list.length; i++) {
        if (list[i] === trimmed) return;
      }
      list.push(trimmed);
      setActiveCfgsForDir(dir, list);
    }
    function removeActiveCfgForDir(dir, path) {
      var trimmed = String(path != null ? path : "").trim();
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
      if (!byDir || typeof byDir !== "object") return readActiveCfgByDir();
      var map = readActiveCfgByDir();
      var changed = false;
      for (var d in byDir) {
        if (!Object.prototype.hasOwnProperty.call(byDir, d)) continue;
        var path = String(byDir[d] != null ? byDir[d] : "").trim();
        if (!path || normalizeActiveCfgList(map[d]).length) continue;
        map[d] = [path];
        changed = true;
      }
      if (changed) writeActiveCfgByDir(map);
      return map;
    }
    function isAliasExpandablePath(name) {
      var PS = typeof ProjectSource !== "undefined" ? ProjectSource : null;
      if (PS && typeof PS.isSignaturePath === "function") return PS.isSignaturePath(name);
      var n = String(name || "").toLowerCase();
      if (n.endsWith(".cfg")) return false;
      if (n.endsWith(".bel") || n.endsWith(".elf")) return true;
      var base = String(name || "").slice(String(name || "").lastIndexOf("/") + 1);
      return base.indexOf(".") === -1;
    }
    function expandAliasesForStorage(text, fileName) {
      var s = String(text != null ? text : "");
      if (settings.get("aliasActivation") !== "greedy") return s;
      if (!isAliasExpandablePath(fileName)) return s;
      if (typeof BelEditor !== "undefined" && typeof BelEditor.expandBelAliases === "function") {
        return BelEditor.expandBelAliases(s);
      }
      return s;
    }
    function expandAliasesInAllFiles() {
      if (settings.get("aliasActivation") !== "greedy") return 0;
      var files2 = listFiles();
      var changed = 0;
      for (var i = 0; i < files2.length; i++) {
        var f = files2[i];
        if (!isAliasExpandablePath(f.name)) continue;
        var cur = work2.getText(f.id);
        var next = expandAliasesForStorage(cur, f.name);
        if (next !== cur) {
          work2.setText(f.id, next);
          changed += 1;
        }
      }
      return changed;
    }
    function getFileText(id) {
      return work2.getText(id);
    }
    function setFileText(id, text) {
      work2.setText(id, expandAliasesForStorage(text, fileNameForId(id)));
      try {
        if (typeof BelEditor !== "undefined" && typeof BelEditor.invalidateFileHealthAfterChange === "function") {
          BelEditor.invalidateFileHealthAfterChange(id);
        }
      } catch (_) {
      }
    }
    function createFile(name) {
      var fileName = name || "untitled.bel";
      var id = work2.newFileId();
      var files2 = listFiles();
      files2.push({ id, name: fileName });
      writeFiles(files2);
      pruneEmptyFoldersForFile(fileName);
      notifyProjectTreeChanged("create");
      return id;
    }
    function replaceProject(entries, options) {
      options = options || {};
      work2.removeFiles(work2.peekTree().files.map(function(f) {
        return f.id;
      }));
      var files2 = [];
      var list = entries || [];
      for (var j = 0; j < list.length; j++) {
        var name = String(list[j].name || "untitled.bel");
        var id = work2.newFileId();
        work2.setText(id, expandAliasesForStorage(list[j].text, name));
        files2.push({ id, name });
      }
      work2.writeTree({
        files: files2,
        folders: [],
        suites: normalizeActiveCfgByDir(options.activeCfgByDir)
      });
      var activeId = files2.length ? files2[0].id : null;
      work2.updateSession(function(s) {
        s.active = activeId;
        s.open = activeId ? [activeId] : [];
        s.views = {};
      });
      if (options.projectName) setProjectName(options.projectName);
      return { files: listFiles(), activeId };
    }
    function restoreDeletedFile(id, name, text) {
      if (getFileById(id)) return false;
      work2.setText(id, expandAliasesForStorage(text, name));
      var files2 = listFiles();
      files2.push({ id, name });
      writeFiles(files2);
      pruneEmptyFoldersForFile(name);
      notifyProjectTreeChanged("restore");
      return true;
    }
    function deleteFile(id) {
      var files2 = listFiles();
      var idx = -1;
      for (var i = 0; i < files2.length; i++) {
        if (files2[i].id === id) {
          idx = i;
          break;
        }
      }
      if (idx === -1) return null;
      var deletedName = files2[idx].name;
      if (/\.cfg$/i.test(deletedName)) {
        removeActiveCfgForDir(dirOf(deletedName), deletedName);
      }
      files2.splice(idx, 1);
      writeFiles(files2);
      rewriteCfgsForOp(deletedName, null);
      closeOpenFile(id);
      work2.removeFiles([id]);
      preserveEmptyFoldersAfterPath(deletedName);
      notifyProjectTreeChanged("delete");
      return files2.length ? files2[Math.max(0, idx - 1)].id : null;
    }
    function renameFile(id, newName) {
      var files2 = listFiles();
      for (var i = 0; i < files2.length; i++) {
        if (files2[i].id !== id) continue;
        var oldName = files2[i].name;
        files2[i].name = newName;
        writeFiles(files2);
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
        notifyProjectTreeChanged("rename");
        return;
      }
    }
    function relToCfgDir(cfgDir, fullPath) {
      if (!cfgDir) return fullPath;
      if (fullPath === cfgDir) return "";
      if (fullPath.indexOf(cfgDir + "/") === 0) return fullPath.slice(cfgDir.length + 1);
      return null;
    }
    function resolveCfgEntryPath(cfgDir, entry) {
      if (!cfgDir) return entry;
      if (!entry) return cfgDir;
      return cfgDir + "/" + entry;
    }
    function isCfgEntryToken(text) {
      var PS = typeof ProjectSource !== "undefined" ? ProjectSource : null;
      if (PS && typeof PS.isCfgEntryToken === "function") return PS.isCfgEntryToken(text);
      var t = String(text || "").trim();
      if (!t || t.charAt(0) === "%") return false;
      var low = t.toLowerCase();
      if (low.endsWith(".cfg") || low.endsWith(".elf") || low.endsWith(".bel")) return true;
      var base = t.indexOf("/") === -1 ? t : t.slice(t.lastIndexOf("/") + 1);
      return base.indexOf(".") === -1;
    }
    function isCfgEntryLine(text) {
      var t = String(text || "").trim();
      return t && t.charAt(0) !== "%" && isCfgEntryToken(t);
    }
    function cfgTextForRewrite(fileId) {
      var g2 = typeof window !== "undefined" ? window : null;
      if (g2) {
        var ed = g2.CurrentEditor;
        if (fileId === getActiveFileId() && ed && typeof ed.getValue === "function") {
          return String(ed.getValue() ?? "");
        }
      }
      return getFileText(fileId);
    }
    function notifyCfgRewritten(fileIds) {
      if (!fileIds.length) return;
      var g2 = typeof window !== "undefined" ? window : null;
      if (g2 && typeof g2.dispatchEvent === "function") {
        g2.dispatchEvent(new CustomEvent("beljar:cfg-rewritten", { detail: { fileIds } }));
      }
    }
    function rewriteCfgBody(text, cfgDir, oldName, newName) {
      var lines = String(text == null ? "" : text).split("\n");
      var out = [];
      var changed = false;
      var oldDir = dirOf(oldName);
      var newDir = newName != null ? dirOf(newName) : null;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var t = line.trim();
        if (!isCfgEntryLine(t)) {
          out.push(line);
          continue;
        }
        if (resolveCfgEntryPath(cfgDir, t) !== oldName) {
          out.push(line);
          continue;
        }
        if (newName == null) {
          changed = true;
          continue;
        }
        if (oldDir !== newDir) {
          out.push(line);
          continue;
        }
        var rel = relToCfgDir(cfgDir, newName);
        if (rel == null || rel === "") {
          out.push(line);
          continue;
        }
        changed = true;
        out.push(line.slice(0, line.indexOf(t)) + rel);
      }
      return changed ? out.join("\n") : null;
    }
    function rewriteCfgsForOp(oldName, newName) {
      if (!settings.get("cfgAutoSync")) return [];
      var files2 = listFiles();
      var updatedIds = [];
      for (var i = 0; i < files2.length; i++) {
        var fn = files2[i].name;
        if (!/\.cfg$/i.test(fn)) continue;
        var cfgDir = dirOf(fn);
        var text = cfgTextForRewrite(files2[i].id);
        if (!cfgListsEntry(text, cfgDir, oldName)) continue;
        var updated = rewriteCfgBody(text, cfgDir, oldName, newName);
        if (updated != null) {
          setFileText(files2[i].id, updated);
          updatedIds.push(files2[i].id);
        }
      }
      notifyCfgRewritten(updatedIds);
      return updatedIds;
    }
    function cfgFileByPath(cfgPath) {
      var files2 = work2.peekTree().files;
      for (var i = 0; i < files2.length; i++) {
        if (files2[i].name === cfgPath) return { id: files2[i].id, name: files2[i].name };
      }
      return null;
    }
    function cfgListsEntry(text, cfgDir, fileName) {
      var lines = String(text == null ? "" : text).split("\n");
      for (var i = 0; i < lines.length; i++) {
        var t = lines[i].trim();
        if (!isCfgEntryToken(t)) continue;
        if (resolveCfgEntryPath(cfgDir, t) === fileName) return true;
      }
      return false;
    }
    function addEntryToCfg(cfgPath, fileName) {
      var cfg = cfgFileByPath(cfgPath);
      if (!cfg) return false;
      var dir = dirOf(cfgPath);
      var rel = relToCfgDir(dir, fileName);
      if (rel == null || rel === "") return false;
      var text = String(getFileText(cfg.id) || "");
      if (cfgListsEntry(text, dir, fileName)) return false;
      var body = text.replace(/\s*$/, "");
      setFileText(cfg.id, (body ? body + "\n" : "") + rel + "\n");
      return true;
    }
    function prependEntryToCfg(cfgPath, fileName) {
      var cfg = cfgFileByPath(cfgPath);
      if (!cfg) return false;
      var dir = dirOf(cfgPath);
      var rel = relToCfgDir(dir, fileName);
      if (rel == null || rel === "") return false;
      var text = String(getFileText(cfg.id) || "");
      if (cfgListsEntry(text, dir, fileName)) return false;
      var lines = text.split("\n");
      var firstEntry = -1;
      for (var i = 0; i < lines.length; i++) {
        if (isCfgEntryLine(lines[i].trim())) {
          firstEntry = i;
          break;
        }
      }
      if (firstEntry === -1) {
        var body = text.replace(/\s*$/, "");
        setFileText(cfg.id, (body ? body + "\n" : "") + rel + "\n");
        return true;
      }
      var before = lines.slice(0, firstEntry).join("\n");
      var after = lines.slice(firstEntry).join("\n");
      var prefix = before.length ? before + "\n" : "";
      setFileText(cfg.id, prefix + rel + "\n" + after);
      return true;
    }
    function removeEntryFromCfg(cfgPath, fileName) {
      var cfg = cfgFileByPath(cfgPath);
      if (!cfg) return false;
      var updated = rewriteCfgBody(getFileText(cfg.id), dirOf(cfgPath), fileName, null);
      if (updated == null) return false;
      setFileText(cfg.id, updated);
      return true;
    }
    function moveEntryInCfg(cfgPath, fileName, delta) {
      var cfg = cfgFileByPath(cfgPath);
      if (!cfg) return false;
      var dir = dirOf(cfgPath);
      var lines = String(getFileText(cfg.id) || "").split("\n");
      var entryLineIdx = [];
      var targetAt = -1;
      for (var i = 0; i < lines.length; i++) {
        var t = lines[i].trim();
        if (!isCfgEntryLine(t)) continue;
        if ((dir ? dir + "/" + t : t) === fileName) targetAt = entryLineIdx.length;
        entryLineIdx.push(i);
      }
      if (targetAt === -1) return false;
      var neighbor = targetAt + (delta < 0 ? -1 : 1);
      if (neighbor < 0 || neighbor >= entryLineIdx.length) return false;
      var a = entryLineIdx[targetAt];
      var b = entryLineIdx[neighbor];
      var tmp = lines[a];
      lines[a] = lines[b];
      lines[b] = tmp;
      setFileText(cfg.id, lines.join("\n"));
      return true;
    }
    function newBlankProject(name) {
      var pid = work2.createProject(name);
      if (pid) work2.setActiveProject(pid);
      return pid;
    }
    function createProjectWithFiles(name, entries, options) {
      var pid = work2.createProject(name);
      if (!pid) return { projectId: null, files: [], activeId: null };
      work2.setActiveProject(pid);
      var result = replaceProject(entries, options || {});
      return { projectId: pid, files: result.files, activeId: result.activeId };
    }
    return {
      // files
      listFiles,
      getFileById,
      fileNameForId,
      getFileText,
      setFileText,
      createFile,
      replaceProject,
      restoreDeletedFile,
      deleteFile,
      renameFile,
      // folders
      listEmptyFolders,
      addEmptyFolder,
      removeEmptyFolder,
      clearEmptyFolders,
      pruneEmptyFoldersUnder,
      renameEmptyFolderPrefix,
      preserveEmptyFoldersAfterMoves,
      // session
      getActiveFileId,
      setActiveFileId,
      getOpenFileIds,
      setOpenFileIds,
      openFile,
      closeOpenFile,
      // project
      getProjectName,
      setProjectName,
      newBlankProject,
      createProjectWithFiles,
      // cfg
      addEntryToCfg,
      prependEntryToCfg,
      removeEntryFromCfg,
      moveEntryInCfg,
      getActiveCfgForDir,
      getActiveCfgsForDir,
      setActiveCfgForDir,
      setActiveCfgsForDir,
      addActiveCfgForDir,
      removeActiveCfgForDir,
      getActiveCfgByDir,
      backfillActiveCfgByDir,
      // aliases
      isAliasExpandablePath,
      expandAliasesForStorage,
      expandAliasesInAllFiles
    };
  }

  // js/persist/merge.mjs
  var MAX_DIFF_LINES = 4e4;
  function splitLines(text) {
    return String(text != null ? text : "").split("\n");
  }
  function lcsMatch(a, b) {
    const match = new Int32Array(a.length).fill(-1);
    let start = 0;
    let endA = a.length;
    let endB = b.length;
    while (start < endA && start < endB && a[start] === b[start]) {
      match[start] = start;
      start += 1;
    }
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
      endA -= 1;
      endB -= 1;
      match[endA] = endB;
    }
    const n = endA - start;
    const m = endB - start;
    if (n === 0 || m === 0 || n + m > MAX_DIFF_LINES) return match;
    const max = n + m;
    const off = max + 1;
    const v = new Int32Array(2 * max + 3);
    const trace = [];
    let found = -1;
    for (let d = 0; d <= max && found < 0; d++) {
      trace.push(v.slice(off - d - 1, off + d + 2));
      for (let k = -d; k <= d; k += 2) {
        let x2 = k === -d || k !== d && v[off + k - 1] < v[off + k + 1] ? v[off + k + 1] : v[off + k - 1] + 1;
        let y2 = x2 - k;
        while (x2 < n && y2 < m && a[start + x2] === b[start + y2]) {
          x2++;
          y2++;
        }
        v[off + k] = x2;
        if (x2 >= n && y2 >= m) {
          found = d;
          break;
        }
      }
    }
    let x = n;
    let y = m;
    for (let d = found; d >= 0; d--) {
      const vd = trace[d];
      const at = (k2) => vd[k2 + d + 1];
      const k = x - y;
      const prevK = k === -d || k !== d && at(k - 1) < at(k + 1) ? k + 1 : k - 1;
      const prevX = at(prevK);
      const prevY = prevX - prevK;
      while (x > prevX && y > prevY) {
        x -= 1;
        y -= 1;
        match[start + x] = start + y;
      }
      if (d > 0) {
        x = prevX;
        y = prevY;
      }
    }
    return match;
  }
  function sameLines(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function merge3(base, mine, theirs) {
    const b0 = String(base != null ? base : "");
    const m0 = String(mine != null ? mine : "");
    const t0 = String(theirs != null ? theirs : "");
    if (m0 === t0 || t0 === b0) return { ok: true, text: m0 };
    if (m0 === b0) return { ok: true, text: t0 };
    const O = splitLines(b0);
    const A = splitLines(m0);
    const B = splitLines(t0);
    const ma = lcsMatch(O, A);
    const mb = lcsMatch(O, B);
    const out = [];
    const conflicts = [];
    let i = 0;
    let j = 0;
    let k = 0;
    for (; ; ) {
      let o = i;
      while (o < O.length && !(ma[o] >= 0 && mb[o] >= 0)) o++;
      const aEnd = o < O.length ? ma[o] : A.length;
      const bEnd = o < O.length ? mb[o] : B.length;
      if (i < o || j < aEnd || k < bEnd) {
        const oc = O.slice(i, o);
        const ac = A.slice(j, aEnd);
        const bc = B.slice(k, bEnd);
        if (sameLines(ac, oc)) out.push(...bc);
        else if (sameLines(bc, oc) || sameLines(ac, bc)) out.push(...ac);
        else {
          conflicts.push({ line: out.length, base: oc, mine: ac, theirs: bc });
          out.push(...ac);
        }
      }
      if (o >= O.length) break;
      out.push(O[o]);
      i = o + 1;
      j = aEnd + 1;
      k = bEnd + 1;
    }
    const text = out.join("\n");
    return conflicts.length ? { ok: false, text, conflicts } : { ok: true, text };
  }
  function conflictedCopyName(name, taken) {
    const slash = name.lastIndexOf("/");
    const dir = slash === -1 ? "" : name.slice(0, slash + 1);
    const leaf = name.slice(slash + 1);
    const dot = leaf.lastIndexOf(".");
    const stem = dot > 0 ? leaf.slice(0, dot) : leaf;
    const ext = dot > 0 ? leaf.slice(dot) : "";
    for (let n = 1; ; n++) {
      const candidate = dir + stem + (n === 1 ? " (conflicted copy)" : " (conflicted copy " + n + ")") + ext;
      if (!taken.has(candidate)) return candidate;
    }
  }

  // js/persist/document.mjs
  var textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
  function utf8Bytes(text) {
    if (textEncoder) return textEncoder.encode(text);
    var encoded = unescape(encodeURIComponent(text));
    var bytes = new Uint8Array(encoded.length);
    for (var i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i);
    return bytes;
  }
  function documentFingerprint(code) {
    var bytes = utf8Bytes(String(code != null ? code : ""));
    var hash = 2166136261;
    for (var i = 0; i < bytes.length; i++) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return bytes.length + ":" + hash.toString(16).padStart(8, "0");
  }
  function normalizeViewportAnchor(raw) {
    if (!raw || typeof raw !== "object" || typeof raw.kind !== "string") return null;
    if (raw.kind === "decl") {
      var di = Number(raw.declIndex);
      var so = Number(raw.sigOffset);
      if (!isFinite(di) || di < 0 || !isFinite(so) || so < 0) return null;
      return { kind: "decl", declIndex: Math.floor(di), sigOffset: Math.floor(so) };
    }
    if (raw.kind === "doc") {
      var dso = Number(raw.sigOffset);
      if (!isFinite(dso) || dso < 0) return null;
      var out = { kind: "doc", sigOffset: Math.floor(dso) };
      var ln = Number(raw.line);
      if (isFinite(ln) && ln >= 1) out.line = Math.floor(ln);
      return out;
    }
    return null;
  }
  function normalizeView(raw) {
    if (!raw || typeof raw !== "object") return {};
    var out = {};
    if (raw.selection && typeof raw.selection === "object") {
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
    if (!raw || typeof raw !== "object") return null;
    var types = raw.types && typeof raw.types === "object" ? raw.types : null;
    if (!types && !raw.identity && !raw.deriveAttempted) return null;
    return {
      docFp: typeof raw.docFp === "string" ? raw.docFp : "",
      scopeKey: typeof raw.scopeKey === "string" ? raw.scopeKey : "",
      belugaBuild: raw.belugaBuild === "fast" ? "fast" : "stable",
      types: types || { v: 1, decls: [], metavars: [], reconstructed: [] },
      identity: Array.isArray(raw.identity) ? raw.identity : [],
      deriveAttempted: Array.isArray(raw.deriveAttempted) ? raw.deriveAttempted : []
    };
  }
  function semanticHasPayload(semantic) {
    if (!semantic || !semantic.types) return false;
    var t = semantic.types;
    return !!(t.decls && t.decls.length || t.metavars && t.metavars.length || t.reconstructed && t.reconstructed.length || semantic.identity && semantic.identity.length || semantic.deriveAttempted && semantic.deriveAttempted.length);
  }
  function createDocuments(deps) {
    var work2 = deps.work;
    var settings = deps.settings;
    var files2 = deps.files || null;
    var open = /* @__PURE__ */ new Set();
    work2.onFileChange(function(e) {
      open.forEach(function(doc) {
        doc.noteFileChange(e);
      });
    });
    function load(documentId) {
      var conflict = work2.readConflict(documentId);
      var stored = work2.getText(documentId);
      if (conflict && conflict.theirs !== stored) {
        conflict.theirs = stored;
        work2.writeConflict(documentId, conflict);
      }
      return {
        state: {
          meta: { documentId },
          editor: {
            text: conflict ? conflict.mine : stored,
            local: normalizeView(work2.peekSession().views[documentId])
          },
          semantic: normalizeSemantic(work2.readCache(documentId))
        },
        base: conflict ? conflict.base : stored,
        conflicted: !!conflict
      };
    }
    function copyName(name) {
      return conflictedCopyName(name, new Set((files2 ? files2.listFiles() : []).map(function(f) {
        return f.name;
      })));
    }
    function createPersist(opts) {
      opts = opts || {};
      var documentId = opts.documentId;
      if (!documentId) throw new Error("createPersist needs a documentId");
      var loaded = load(documentId);
      var state = loaded.state;
      var base = loaded.base;
      var conflicted = loaded.conflicted;
      var saveTimer = null;
      var providers = null;
      var reconciling = false;
      var reconcileQueued = false;
      var savedView = JSON.stringify(state.editor.local);
      var savedSemantic = JSON.stringify(state.semantic);
      function collectSemantic() {
        if (!providers || typeof providers.getSemantic !== "function") return state.semantic;
        var exported = providers.getSemantic();
        if (!exported) return state.semantic;
        var text = state.editor.text;
        var docFp = typeof providers.getDocFp === "function" ? providers.getDocFp(text) : documentFingerprint(text);
        var belugaBuild = typeof providers.getBelugaBuild === "function" ? providers.getBelugaBuild() : settings.get("belugaMode");
        var scopeKey = typeof exported.scopeKey === "string" ? exported.scopeKey : typeof providers.getScopeKey === "function" ? providers.getScopeKey() : "";
        var semantic = {
          docFp,
          scopeKey,
          belugaBuild,
          types: exported.types || { v: 1, decls: [], metavars: [], reconstructed: [] },
          identity: exported.identity || [],
          deriveAttempted: exported.deriveAttempted || []
        };
        return semanticHasPayload(semantic) ? semantic : null;
      }
      function collectView() {
        if (providers && typeof providers.getViewport === "function") {
          return normalizeView(providers.getViewport());
        }
        return state.editor.local || {};
      }
      function collectText() {
        if (providers && typeof providers.getText === "function") {
          try {
            var live = providers.getText();
            if (live != null) return String(live);
          } catch (_) {
          }
        }
        return state.editor.text;
      }
      function peekText() {
        var read = providers && (typeof providers.peekText === "function" ? providers.peekText : typeof providers.getText === "function" ? providers.getText : null);
        if (read) {
          try {
            var t = read();
            if (t != null) return String(t);
          } catch (_) {
          }
        }
        return state.editor.text;
      }
      function canShow() {
        return !providers || typeof providers.applyExternalText === "function";
      }
      function show(text) {
        state.editor.text = text;
        if (providers && typeof providers.applyExternalText === "function") providers.applyExternalText(text);
      }
      function announceConflict(source) {
        var g2 = typeof window !== "undefined" ? window : null;
        if (g2 && typeof g2.dispatchEvent === "function" && typeof CustomEvent === "function") {
          g2.dispatchEvent(new CustomEvent("beljar:text-conflict", { detail: { fileId: documentId, source } }));
        }
      }
      function reconcile() {
        reconcileQueued = false;
        if (reconciling || !work2.hasFile(documentId)) return;
        var stored = work2.getText(documentId);
        if (conflicted) {
          var rec = work2.readConflict(documentId);
          if (rec && rec.theirs !== stored) {
            rec.theirs = stored;
            work2.writeConflict(documentId, rec);
          }
          return;
        }
        if (stored === base) return;
        var found = work2.readConflict(documentId);
        if (found) {
          conflicted = true;
          base = found.base;
          work2.writeConflict(documentId, {
            base: found.base,
            mine: peekText(),
            theirs: stored,
            at: found.at,
            source: found.source
          });
          announceConflict(found.source);
          return;
        }
        reconciling = true;
        try {
          var mine = peekText();
          if (mine === stored) {
            base = stored;
          } else if (mine === base && canShow()) {
            base = stored;
            show(stored);
          } else {
            var m = merge3(base, mine, stored);
            if (m.ok && canShow()) {
              base = stored;
              show(m.text);
              scheduleSave();
            } else {
              var source = work2.textOrigin(documentId) === "sync" ? "device" : "tab";
              conflicted = true;
              work2.writeConflict(documentId, { base, mine, theirs: stored, at: Date.now(), source });
              announceConflict(source);
            }
          }
        } finally {
          reconciling = false;
        }
      }
      function noteFileChange(e) {
        if (e.fid !== null && (e.fid !== documentId || e.pid !== work2.projectId())) return;
        if (reconcileQueued) return;
        reconcileQueued = true;
        Promise.resolve().then(reconcile);
      }
      function persistNow() {
        clearTimeout(saveTimer);
        saveTimer = null;
        if (reconciling) {
          scheduleSave();
          return;
        }
        var exists = work2.hasFile(documentId);
        if (exists && !conflicted && work2.getText(documentId) !== base) reconcile();
        state.editor.text = collectText();
        state.editor.local = collectView();
        state.semantic = collectSemantic();
        if (!exists) return;
        if (conflicted) {
          var rec = work2.readConflict(documentId);
          if (rec && rec.mine !== state.editor.text) {
            rec.mine = state.editor.text;
            work2.writeConflict(documentId, rec);
          }
        } else if (state.editor.text !== base) {
          if (work2.setText(documentId, state.editor.text).ok) base = state.editor.text;
        }
        var view = JSON.stringify(state.editor.local);
        if (view !== savedView) {
          var local = state.editor.local;
          if (work2.updateSession(function(s) {
            s.views[documentId] = local;
          }).ok) savedView = view;
        }
        var semantic = JSON.stringify(state.semantic);
        if (semantic !== savedSemantic) {
          if (work2.writeCache(documentId, state.semantic).ok) savedSemantic = semantic;
        }
      }
      function scheduleSave() {
        clearTimeout(saveTimer);
        var delay = opts.debounceMs != null ? opts.debounceMs : settings.get("autosaveDelay");
        saveTimer = globalThis.setTimeout(persistNow, delay);
      }
      function scheduleEditorPersist(text) {
        if (text != null) state.editor.text = String(text);
        scheduleSave();
      }
      function markEditorDirty() {
        scheduleSave();
      }
      function cancelPendingSave() {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      function replaceEditorText(text) {
        cancelPendingSave();
        state.editor.text = String(text != null ? text : "");
        if (!conflicted && work2.getText(documentId) === state.editor.text) base = state.editor.text;
      }
      function hasPendingSave() {
        return saveTimer != null;
      }
      function flushCheckpointIfDirty() {
        if (saveTimer != null) persistNow();
      }
      function getInitialCheckpoint() {
        return JSON.parse(JSON.stringify(state));
      }
      function setCheckpointProviders(next) {
        providers = next || null;
      }
      function switchFile(newId2) {
        if (!newId2) return null;
        persistNow();
        providers = null;
        documentId = newId2;
        var next = load(documentId);
        state = next.state;
        base = next.base;
        conflicted = next.conflicted;
        savedView = JSON.stringify(state.editor.local);
        savedSemantic = JSON.stringify(state.semantic);
        return getInitialCheckpoint();
      }
      function getConflict() {
        if (!conflicted) return null;
        var rec = work2.readConflict(documentId);
        return {
          fileId: documentId,
          base: rec ? rec.base : base,
          mine: peekText(),
          theirs: work2.getText(documentId),
          source: rec ? rec.source : "tab"
        };
      }
      function resolveConflict(choice) {
        if (!conflicted) return { ok: false, reason: "no-conflict" };
        if (choice !== "mine" && choice !== "theirs" && choice !== "both") return { ok: false, reason: "unknown-choice" };
        cancelPendingSave();
        var theirs = work2.getText(documentId);
        var mine = peekText();
        if (choice === "theirs") {
          base = theirs;
          show(theirs);
          conflicted = false;
          work2.removeConflict(documentId);
          return { ok: true, copyId: null };
        }
        var copyId = null;
        if (choice === "both") {
          if (!files2) return { ok: false, reason: "no-files" };
          var file = work2.peekTree().files.find(function(f) {
            return f.id === documentId;
          });
          copyId = files2.createFile(copyName(file ? file.name : "untitled"));
          if (!work2.setText(copyId, theirs).ok) return { ok: false, reason: "write-failed" };
        }
        if (!work2.setText(documentId, mine).ok) return { ok: false, reason: "write-failed", copyId };
        base = mine;
        state.editor.text = mine;
        conflicted = false;
        work2.removeConflict(documentId);
        return { ok: true, copyId };
      }
      var handle = { noteFileChange };
      open.add(handle);
      return {
        getEditorText: function() {
          return state.editor.text;
        },
        getEditorLocal: function() {
          return normalizeView(state.editor.local);
        },
        getSemanticCheckpoint: function() {
          return state.semantic ? JSON.parse(JSON.stringify(state.semantic)) : null;
        },
        getInitialCheckpoint,
        getCurrentFileId: function() {
          return documentId;
        },
        scheduleEditorPersist,
        markEditorDirty,
        scheduleCheckpointSave: scheduleSave,
        cancelPendingSave,
        replaceEditorText,
        flushCheckpoint: persistNow,
        flushCheckpointIfDirty,
        hasPendingSave,
        setCheckpointProviders,
        switchFile,
        getConflict,
        resolveConflict,
        /** Stop listening for changes underneath (tests; a page never closes its document). */
        dispose: function() {
          cancelPendingSave();
          open.delete(handle);
        }
      };
    }
    return { createPersist };
  }

  // js/persist/device-records.mjs
  var TAB_PREFIX = "beljar/tabs/";
  var SIDE_PANEL_IDS = ["explorer", "inspector", "library", "harpoon"];
  function stringList3(raw) {
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string" && x) : [];
  }
  function create2(deps) {
    const { store: store2, tabStore: tabStore2, work: work2, settings } = deps;
    function storeFor(mode) {
      if (mode === "local") return store2;
      if (mode === "session") return tabStore2;
      return null;
    }
    function followSetting(settingId, keysIn) {
      let last = settings.get(settingId);
      settings.subscribe((e) => {
        if (e.ids.indexOf(settingId) === -1) return;
        const prev = last;
        const next = settings.get(settingId);
        last = next;
        if (prev === next) return;
        const from = storeFor(prev);
        const to = storeFor(next);
        if (!from) return;
        for (const key of keysIn(from)) {
          const data = from.get(key);
          if (to && data !== void 0 && to.get(key) === void 0) to.set(key, data);
          from.remove(key);
        }
      });
    }
    const replStore = () => storeFor(settings.get("replHistoryPersist"));
    followSetting("replHistoryPersist", () => [REPL_TRANSCRIPT_KEY, REPL_COMMANDS_KEY]);
    function readReplTranscript() {
      const s = replStore();
      const d = s && s.get(REPL_TRANSCRIPT_KEY);
      if (!d || typeof d !== "object" || typeof d.html !== "string") return null;
      return {
        html: d.html,
        scrollTop: typeof d.scrollTop === "number" ? d.scrollTop : 0,
        savedAt: typeof d.savedAt === "number" ? d.savedAt : 0
      };
    }
    function writeReplTranscript(snap) {
      const s = replStore();
      if (!s) return;
      if (!snap || typeof snap.html !== "string" || !snap.html) {
        s.remove(REPL_TRANSCRIPT_KEY);
        return;
      }
      s.set(REPL_TRANSCRIPT_KEY, {
        html: snap.html,
        scrollTop: typeof snap.scrollTop === "number" ? snap.scrollTop : 0,
        savedAt: typeof snap.savedAt === "number" ? snap.savedAt : Date.now()
      });
    }
    function clampCommands(list) {
      const arr = Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
      const cap = settings.get("replHistoryCap");
      return arr.length > cap ? arr.slice(arr.length - cap) : arr;
    }
    function readReplCommands() {
      const s = replStore();
      return s ? clampCommands(s.get(REPL_COMMANDS_KEY)) : [];
    }
    function writeReplCommands(list) {
      const s = replStore();
      if (!s) return;
      const arr = clampCommands(list);
      if (arr.length) s.set(REPL_COMMANDS_KEY, arr);
      else s.remove(REPL_COMMANDS_KEY);
    }
    const foldStore = () => storeFor(settings.get("editorFoldPersist"));
    followSetting("editorFoldPersist", (s) => s.keys("beljar/p/").filter((k) => k.endsWith("/folds")));
    function readFileFolds(fid) {
      const s = foldStore();
      const d = s && s.get(foldsKey(work2.projectId()));
      return d && typeof d === "object" ? stringList3(d[fid]) : [];
    }
    function writeFileFolds(fid, keys) {
      const s = foldStore();
      if (!s || !fid) return;
      const key = foldsKey(work2.projectId());
      const cur = s.get(key);
      const live = new Set(work2.peekTree().files.map((f) => f.id));
      const next = {};
      if (cur && typeof cur === "object") {
        for (const id of Object.keys(cur)) if (live.has(id)) next[id] = cur[id];
      }
      const clean = stringList3(keys);
      if (clean.length && live.has(fid)) next[fid] = clean;
      else delete next[fid];
      if (Object.keys(next).length) s.set(key, next);
      else s.remove(key);
    }
    function readNotifications() {
      const d = store2.get(NOTIFICATIONS_KEY);
      return Array.isArray(d) ? d : [];
    }
    function writeNotifications(items) {
      const list = Array.isArray(items) ? items : [];
      if (list.length) store2.set(NOTIFICATIONS_KEY, list);
      else store2.remove(NOTIFICATIONS_KEY);
    }
    function readUndoStack(pid) {
      const d = tabStore2.get(undoKey(pid));
      return d && typeof d === "object" ? d : null;
    }
    function writeUndoStack(pid, data) {
      return tabStore2.set(undoKey(pid), data).ok;
    }
    function clearUndoStack(pid) {
      tabStore2.remove(undoKey(pid));
    }
    function postTabMessage(kind, msg) {
      store2.set(tabMessageKey(kind), msg);
    }
    function onTabMessage(fn) {
      return store2.subscribe((e) => {
        if (e.origin !== "tab" || !e.key || e.key.indexOf(TAB_PREFIX) !== 0 || e.data === void 0) return;
        fn(e.key.slice(TAB_PREFIX.length), e.data);
      });
    }
    function sidePanelOrNull(id) {
      return id && SIDE_PANEL_IDS.indexOf(id) !== -1 ? id : null;
    }
    function readSidePanel(pid) {
      return sidePanelOrNull(work2.peekSession(pid || void 0).panel);
    }
    function writeSidePanel(id, pid) {
      const panel = sidePanelOrNull(id);
      work2.updateSession((s) => {
        s.panel = panel;
      }, pid || void 0);
    }
    function readWorkspace(pid) {
      return work2.readSession(pid || void 0).workspace;
    }
    function writeWorkspace(snapshot, pid) {
      return work2.updateSession((s) => {
        s.workspace = snapshot && typeof snapshot === "object" ? snapshot : null;
        if (s.workspace) s.panel = sidePanelOrNull(s.workspace.activeSidePanel);
      }, pid || void 0).ok;
    }
    function resetWorkspace(pid) {
      work2.updateSession((s) => {
        s.workspace = null;
        s.panel = null;
      }, pid || void 0);
    }
    function readExplorerFolds() {
      return work2.peekSession().explorerFolds.slice();
    }
    function writeExplorerFolds(paths) {
      work2.updateSession((s) => {
        s.explorerFolds = stringList3(paths);
      });
    }
    return {
      readReplTranscript,
      writeReplTranscript,
      readReplCommands,
      writeReplCommands,
      readFileFolds,
      writeFileFolds,
      readNotifications,
      writeNotifications,
      readUndoStack,
      writeUndoStack,
      clearUndoStack,
      postTabMessage,
      onTabMessage,
      readSidePanel,
      writeSidePanel,
      readWorkspace,
      writeWorkspace,
      resetWorkspace,
      readExplorerFolds,
      writeExplorerFolds
    };
  }

  // js/persist/sync/protocol.mjs
  var MANIFEST_VERSION = 1;
  function canonicalJson(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
    const keys = Object.keys(value).filter((k) => value[k] !== void 0).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
  }
  var HASH = /^[0-9a-f]{64}$/;
  function isHash(h) {
    return typeof h === "string" && HASH.test(h);
  }
  function hex(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
    return s;
  }
  async function sha256(text) {
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (!subtle) throw new Error("sync: Web Crypto is not available");
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
    return hex(new Uint8Array(digest));
  }
  function emptyManifest() {
    return { v: MANIFEST_VERSION, name: "", createdAt: 0, files: [], folders: [], suites: {} };
  }
  function stringList4(raw) {
    const out = [];
    if (!Array.isArray(raw)) return out;
    for (const x of raw) {
      if (typeof x === "string" && x && !out.includes(x)) out.push(x);
    }
    return out;
  }
  function normalizeManifest(raw) {
    if (!raw || typeof raw !== "object" || raw.v !== MANIFEST_VERSION || !Array.isArray(raw.files)) return null;
    if (typeof raw.name !== "string") return null;
    const ids = /* @__PURE__ */ new Set();
    const paths = /* @__PURE__ */ new Set();
    const files2 = [];
    for (const f of raw.files) {
      if (!f || typeof f.id !== "string" || !f.id || typeof f.path !== "string" || !f.path || !isHash(f.hash)) return null;
      if (ids.has(f.id) || paths.has(f.path)) return null;
      ids.add(f.id);
      paths.add(f.path);
      files2.push({ id: f.id, path: f.path, hash: f.hash });
    }
    const suites = {};
    if (raw.suites && typeof raw.suites === "object" && !Array.isArray(raw.suites)) {
      for (const dir of Object.keys(raw.suites).sort()) {
        const list = stringList4(raw.suites[dir]);
        if (list.length) suites[dir] = list;
      }
    }
    return {
      v: MANIFEST_VERSION,
      name: raw.name,
      createdAt: typeof raw.createdAt === "number" && raw.createdAt > 0 ? raw.createdAt : 0,
      files: files2,
      folders: stringList4(raw.folders).sort(),
      suites
    };
  }
  function manifestOf(meta, tree, hashes) {
    return normalizeManifest({
      v: MANIFEST_VERSION,
      name: meta.name,
      createdAt: meta.createdAt,
      files: tree.files.map((f) => ({ id: f.id, path: f.name, hash: hashes[f.id] })),
      folders: tree.folders,
      suites: tree.suites
    });
  }
  function sameManifest(a, b) {
    return canonicalJson(a) === canonicalJson(b);
  }
  function filesById(manifest) {
    const m = /* @__PURE__ */ new Map();
    for (const f of manifest.files) m.set(f.id, f);
    return m;
  }

  // js/persist/sync/merge-project.mjs
  function sameList(a, b) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  function pick(base, mine, theirs, same) {
    if (same(mine, theirs)) return mine;
    if (same(mine, base)) return theirs;
    return mine;
  }
  var is = (a, b) => a === b;
  function mergeProject(a) {
    const B = filesById(a.base);
    const M = filesById(a.mine);
    const T = filesById(a.theirs);
    const conflicted = a.conflicted || /* @__PURE__ */ new Set();
    const needs = /* @__PURE__ */ new Set();
    const out = [];
    const conflicts = [];
    const notices = [];
    const copies = [];
    function need(hash) {
      const t = a.text(hash);
      if (t === void 0) needs.add(hash);
      return t;
    }
    const changedHere = (id, m, b) => conflicted.has(id) || m.hash !== b.hash || m.path !== b.path;
    const changedThere = (t, b) => t.hash !== b.hash || t.path !== b.path;
    const order = [...T.keys()];
    for (const id of M.keys()) if (!T.has(id)) order.push(id);
    for (const id of order) {
      const b = B.get(id);
      const m = M.get(id);
      const t = T.get(id);
      if (m && t) {
        const path = pick(b ? b.path : void 0, m.path, t.path, is);
        const mine = a.mineTexts[id];
        if (m.hash === t.hash || b && t.hash === b.hash) {
          out.push({ id, path, text: mine });
        } else if (b && m.hash === b.hash) {
          const theirs = need(t.hash);
          if (theirs !== void 0) out.push({ id, path, text: theirs });
        } else {
          const baseText = b ? need(b.hash) : "";
          const theirs = need(t.hash);
          if (baseText === void 0 || theirs === void 0) continue;
          const r = merge3(baseText, mine, theirs);
          if (r.ok) {
            out.push({ id, path, text: r.text });
          } else {
            out.push({ id, path, text: theirs });
            if (conflicted.has(id)) {
              copies.push({ of: id, text: mine });
            } else {
              conflicts.push({ id, base: baseText, mine, theirs });
              notices.push({ kind: "conflict", path });
            }
          }
        }
      } else if (m) {
        if (!b) {
          out.push({ id, path: m.path, text: a.mineTexts[id] });
        } else if (changedHere(id, m, b)) {
          out.push({ id, path: m.path, text: a.mineTexts[id] });
          notices.push({ kind: "kept", path: m.path });
        }
      } else if (t) {
        if (!b || changedThere(t, b)) {
          const theirs = need(t.hash);
          if (theirs === void 0) continue;
          out.push({ id, path: t.path, text: theirs });
          if (b) notices.push({ kind: "restored", path: t.path });
        }
      }
    }
    if (needs.size) return { needs: [...needs] };
    for (const c of copies) {
      const at = out.findIndex((f) => f.id === c.of);
      out.splice(at + 1, 0, { id: a.newFileId(), path: out[at].path, text: c.text, copyOf: c.of });
    }
    const taken = new Set(out.map((f) => f.path));
    const seen = /* @__PURE__ */ new Set();
    for (const f of out) {
      if (seen.has(f.path)) {
        const from = f.path;
        f.path = conflictedCopyName(from, taken);
        taken.add(f.path);
        notices.push({ kind: f.copyOf ? "copied" : "renamed", path: f.path, from });
      }
      seen.add(f.path);
      delete f.copyOf;
    }
    const bf = new Set(a.base.folders);
    const mf = new Set(a.mine.folders);
    const tf = new Set(a.theirs.folders);
    const folders = [.../* @__PURE__ */ new Set([...a.theirs.folders, ...a.mine.folders])].filter((x) => mf.has(x) && tf.has(x) || mf.has(x) && !bf.has(x) || tf.has(x) && !bf.has(x)).filter((x) => !out.some((f) => f.path.startsWith(x + "/"))).sort();
    const suites = {};
    const dirs = /* @__PURE__ */ new Set([...Object.keys(a.base.suites), ...Object.keys(a.mine.suites), ...Object.keys(a.theirs.suites)]);
    for (const dir of [...dirs].sort()) {
      const v = pick(a.base.suites[dir] || [], a.mine.suites[dir] || [], a.theirs.suites[dir] || [], sameList);
      if (v.length) suites[dir] = v.slice();
    }
    return {
      project: {
        name: pick(a.base.name, a.mine.name, a.theirs.name, is),
        createdAt: a.theirs.createdAt || a.mine.createdAt,
        files: out,
        folders,
        suites
      },
      conflicts,
      notices
    };
  }

  // js/persist/sync/settings-sync.mjs
  function cleanSyncedValues(raw) {
    const out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const id of Object.keys(raw).sort()) {
      const row = settingRow(id);
      if (!isSyncedSetting(row)) continue;
      const v = normalizeSetting(row, raw[id]);
      if (v !== void 0 && !sameValue(v, row.default)) out[id] = v;
    }
    return out;
  }
  function sameValues(a, b) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((id) => id in b && sameValue(a[id], b[id]));
  }
  function mergeSettingValues(base, mine, theirs) {
    const out = {};
    const ids = /* @__PURE__ */ new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)]);
    for (const id of [...ids].sort()) {
      const b = base[id];
      const m = mine[id];
      const t = theirs[id];
      const v = sameValue(m, t) ? m : sameValue(m, b) ? t : m;
      if (v !== void 0) out[id] = v;
    }
    return out;
  }
  function readRecord(store2, account) {
    const r = store2.get(SETTINGS_SYNC_KEY);
    if (!r || typeof r !== "object" || r.account !== account) return null;
    const pending = r.pending && typeof r.pending === "object" && typeof r.pending.id === "string" ? { id: r.pending.id, base: Number(r.pending.base) || 0, values: cleanSyncedValues(r.pending.values) } : null;
    return {
      account,
      version: Number.isInteger(r.version) && r.version > 0 ? r.version : 0,
      values: cleanSyncedValues(r.values),
      pending
    };
  }
  function createSettingsSync(o) {
    const { store: store2, account } = o;
    const attempts = o.attempts || 8;
    function writeRecord(rec) {
      const res = store2.set(SETTINGS_SYNC_KEY, rec);
      if (!res.ok) throw Object.assign(new Error("sync: could not record the settings sync"), { storage: res.error });
    }
    function local() {
      const rec = store2.get(SETTINGS_KEY);
      return cleanSyncedValues(rec && rec.values);
    }
    function apply(values) {
      const rec = store2.get(SETTINGS_KEY);
      const cur = rec && rec.values && typeof rec.values === "object" ? rec.values : {};
      const next = {};
      for (const id of Object.keys(cur)) {
        const row = settingRow(id);
        if (row && !isSyncedSetting(row)) next[id] = cur[id];
      }
      Object.assign(next, values);
      const res = store2.applyRemote(SETTINGS_KEY, { values: next });
      if (!res.ok) throw Object.assign(new Error("sync: could not apply synced settings"), { storage: res.error });
    }
    function normalizeHead(raw) {
      if (raw == null) return null;
      if (typeof raw !== "object" || !Number.isInteger(raw.version) || raw.version < 1) {
        throw new Error("sync: the server sent settings this version cannot read");
      }
      return { version: raw.version, values: cleanSyncedValues(raw.values) };
    }
    async function sync() {
      if (!o.settings.get("syncSettings")) return { status: "off" };
      for (let i = 0; i < attempts; i++) {
        const rec = readRecord(store2, account);
        if (rec && rec.pending) {
          const res = await o.call("commitSettings", rec.pending);
          writeRecord(res && res.ok ? { account, version: res.version, values: rec.pending.values, pending: null } : { account, version: rec.version, values: rec.values, pending: null });
          continue;
        }
        const head = normalizeHead(await o.call("settings"));
        const mine = local();
        if (!head || rec && head.version === rec.version) {
          const synced = head ? rec.values : null;
          if (synced ? sameValues(mine, synced) : !Object.keys(mine).length) return { status: "clean" };
          const kept = { account, version: rec ? rec.version : 0, values: rec ? rec.values : {} };
          const pending = { id: o.commitId(), base: head ? head.version : 0, values: mine };
          writeRecord({ ...kept, pending });
          const res = await o.call("commitSettings", pending);
          if (res && res.ok) {
            writeRecord({ account, version: res.version, values: mine, pending: null });
            return { status: "pushed", version: res.version };
          }
          writeRecord({ ...kept, pending: null });
          continue;
        }
        const merged = mergeSettingValues(rec ? rec.values : {}, mine, head.values);
        if (!sameValues(merged, mine)) apply(merged);
        writeRecord({ account, version: head.version, values: head.values, pending: null });
      }
      return { status: "busy" };
    }
    return { sync };
  }

  // js/persist/sync/engine.mjs
  var ATTEMPTS = 8;
  function unreachable(method, err) {
    const e = new Error("sync: " + method + " could not reach the server" + (err && err.message ? " (" + err.message + ")" : ""));
    e.offline = true;
    e.cause = err;
    return e;
  }
  function bad(what) {
    return new Error("sync: " + what);
  }
  function refused(res) {
    return Object.assign(new Error("sync: the server refused (" + res.error + ")"), { code: res.error });
  }
  function storageFailure(what) {
    return Object.assign(new Error("sync: storage refused " + what), { storage: true });
  }
  function normalizeRecord(raw) {
    if (!raw || typeof raw !== "object") return null;
    let version = Number.isInteger(raw.version) && raw.version > 0 ? raw.version : 0;
    const manifest = version && raw.manifest ? normalizeManifest(raw.manifest) : null;
    if (!manifest) version = 0;
    let pending = null;
    if (raw.pending && typeof raw.pending === "object" && typeof raw.pending.id === "string" && raw.pending.id) {
      const m = normalizeManifest(raw.pending.manifest);
      const base = Number.isInteger(raw.pending.base) && raw.pending.base >= 0 ? raw.pending.base : -1;
      if (m && base >= 0) pending = { id: raw.pending.id, base, manifest: m };
    }
    return { version, manifest, pending };
  }
  function readHead(raw) {
    if (raw == null) return null;
    if (typeof raw !== "object" || !Number.isInteger(raw.version) || raw.version < 1) throw bad("the server sent a head this version cannot read");
    const deleted = raw.deleted === true;
    const manifest = deleted ? null : normalizeManifest(raw.manifest);
    if (!deleted && !manifest) throw bad("the server sent a manifest this version cannot read");
    return { version: raw.version, deleted, manifest, commit: typeof raw.commit === "string" ? raw.commit : null };
  }
  function readHeads(raw) {
    if (!Array.isArray(raw)) throw bad("the server sent a project list this version cannot read");
    const out = [];
    for (const h of raw) {
      if (!h || typeof h.id !== "string" || !h.id || !Number.isInteger(h.version) || h.version < 1) continue;
      out.push({ id: h.id, version: h.version, deleted: h.deleted === true });
    }
    return out;
  }
  function createSyncEngine(opts) {
    const { store: store2, work: work2, transport, account } = opts;
    if (!account) throw new Error("sync: an engine syncs one account; none was given");
    const hash = opts.hash || sha256;
    const notify = opts.notify || (() => {
    });
    const commitId = opts.commitId || (() => newId("c"));
    const trace = opts.trace || (() => {
    });
    function moved(pid, at) {
      trace({ kind: "moved", pid, at });
      return null;
    }
    const hashed = /* @__PURE__ */ new Map();
    async function call(method, ...args) {
      try {
        return await transport[method](...args);
      } catch (err) {
        throw unreachable(method, err);
      }
    }
    async function hashFile(pid, fid, text) {
      const key = pid + "/" + fid;
      const known = hashed.get(key);
      if (known && known.text === text) return known.hash;
      const h = await hash(text);
      hashed.set(key, { text, hash: h });
      return h;
    }
    function readRecord2(pid) {
      return normalizeRecord(store2.get(syncKey(pid)));
    }
    function writeRecord(pid, rec) {
      if (!store2.set(syncKey(pid), rec).ok) throw storageFailure("the sync record");
    }
    async function localSide(pid) {
      const snap = work2.snapshotProject(pid);
      if (!snap) return null;
      const hashes = {};
      for (const f of snap.tree.files) hashes[f.id] = await hashFile(pid, f.id, snap.texts[f.id]);
      snap.hashes = hashes;
      snap.manifest = manifestOf(snap.meta, snap.tree, hashes);
      return snap;
    }
    function unchangedSince(pid, snap) {
      const now = work2.snapshotProject(pid);
      if (!now) return false;
      if (now.meta.name !== snap.meta.name || now.meta.createdAt !== snap.meta.createdAt || now.meta.owner !== snap.meta.owner) return false;
      if (JSON.stringify(now.tree) !== JSON.stringify(snap.tree)) return false;
      for (const f of now.tree.files) if (now.texts[f.id] !== snap.texts[f.id]) return false;
      if (now.conflicted.size !== snap.conflicted.size) return false;
      for (const id of now.conflicted) if (!snap.conflicted.has(id)) return false;
      return true;
    }
    async function fetchTexts(pid, wanted) {
      const got = /* @__PURE__ */ new Map();
      if (!wanted.length) return got;
      const res = await call("blobs", pid, wanted);
      for (const h of wanted) {
        const text = res && typeof res[h] === "string" ? res[h] : void 0;
        if (text === void 0) throw bad("the server is missing a file its version lists");
        if (await hash(text) !== h) throw bad("a file arrived damaged");
        got.set(h, text);
      }
      return got;
    }
    function settle(pid, kept, pending, res) {
      if (res && res.ok && Number.isInteger(res.version) && res.version > 0) {
        writeRecord(pid, { version: res.version, manifest: pending.manifest, pending: null });
        return true;
      }
      if (res && res.error) throw refused(res);
      writeRecord(pid, { version: kept.version, manifest: kept.manifest, pending: null });
      return false;
    }
    async function push(pid, local, rec, base) {
      const texts = /* @__PURE__ */ new Map();
      for (const f of local.tree.files) texts.set(local.hashes[f.id], local.texts[f.id]);
      const missing = await call("missing", pid, [...texts.keys()]);
      if (!Array.isArray(missing)) throw bad("the server sent an answer this version cannot read");
      if (missing.length) {
        const up = {};
        for (const h of missing) {
          if (!texts.has(h)) throw bad("the server asked for a file this version never named");
          up[h] = texts.get(h);
        }
        const res = await call("putBlobs", pid, up);
        if (res && res.error) throw refused(res);
        if (!res || !res.ok) throw bad("the server did not take the files");
      }
      const kept = { version: rec ? rec.version : 0, manifest: rec ? rec.manifest : null };
      const pending = { id: commitId(), base, manifest: local.manifest };
      writeRecord(pid, { version: kept.version, manifest: kept.manifest, pending });
      return settle(pid, kept, pending, await call("commit", pid, pending));
    }
    async function pull(pid, local, rec, head) {
      const theirs = head.manifest;
      const base = rec && rec.version ? rec.manifest : emptyManifest();
      const texts = /* @__PURE__ */ new Map();
      for (const f of local.tree.files) texts.set(local.hashes[f.id], local.texts[f.id]);
      for (let fetched = false; ; ) {
        const r = mergeProject({
          base,
          mine: local.manifest,
          mineTexts: local.texts,
          theirs,
          text: (h) => texts.get(h),
          conflicted: local.conflicted,
          newFileId: () => work2.newFileId(pid)
        });
        if (r.needs) {
          if (fetched) throw bad("a merge needed a file the server did not send");
          for (const [h, t] of await fetchTexts(pid, r.needs)) texts.set(h, t);
          fetched = true;
          continue;
        }
        if (!unchangedSince(pid, local)) return moved(pid, "merge");
        if (!work2.applyProject(pid, r.project, { conflicts: r.conflicts })) throw storageFailure("a merged project");
        writeRecord(pid, { version: head.version, manifest: theirs, pending: null });
        for (const n of r.notices) notify(Object.assign({ pid, project: r.project.name }, n));
        return;
      }
    }
    async function download(pid, head) {
      const theirs = head.manifest;
      const got = await fetchTexts(pid, [...new Set(theirs.files.map((f) => f.hash))]);
      if (work2.snapshotProject(pid) || work2.readTombstones()[pid]) return moved(pid, "download");
      const project = {
        name: theirs.name,
        createdAt: theirs.createdAt,
        files: theirs.files.map((f) => ({ id: f.id, path: f.path, text: got.get(f.hash) })),
        folders: theirs.folders,
        suites: theirs.suites
      };
      if (!work2.applyProject(pid, project, { owner: account })) throw storageFailure("a downloaded project");
      writeRecord(pid, { version: head.version, manifest: theirs, pending: null });
      return { status: "downloaded" };
    }
    async function settleTombstone(pid, tomb, head) {
      if (!head || head.deleted) {
        work2.dropTombstone(pid);
        return { status: "deleted" };
      }
      if (head.version === tomb.version || tomb.pending && head.commit === tomb.pending) {
        const res = await call("remove", pid, { id: commitId(), base: head.version });
        if (res && res.ok) {
          work2.dropTombstone(pid);
          return { status: "deleted" };
        }
        if (res && res.error) throw refused(res);
        return null;
      }
      work2.dropTombstone(pid);
      notify({ kind: "project-restored", pid, project: head.manifest.name });
      return null;
    }
    async function step(pid, hint) {
      const rec = readRecord2(pid);
      if (rec && rec.pending) {
        const res = await call("commit", pid, rec.pending);
        settle(pid, rec, rec.pending, res);
        return null;
      }
      const tomb = work2.readTombstones()[pid];
      const local = await localSide(pid);
      if (local && local.meta.owner !== account) return { status: "not-ours" };
      if (local && !local.manifest) return { status: "error", message: "two files share a path" };
      if (hint && local && rec && rec.version && !tomb && !hint.deleted && hint.version === rec.version && sameManifest(local.manifest, rec.manifest)) {
        return { status: "clean" };
      }
      const head = readHead(await call("head", pid));
      if (!local) {
        if (tomb && tomb.owner === account) return settleTombstone(pid, tomb, head);
        if (!head || head.deleted) return { status: "absent" };
        return download(pid, head);
      }
      if (!head) {
        return await push(pid, local, rec, 0) ? { status: "pushed" } : null;
      }
      const synced = rec && rec.version ? rec : null;
      if (head.deleted) {
        if (synced && sameManifest(local.manifest, synced.manifest) && !local.conflicted.size) {
          if (!unchangedSince(pid, local)) return moved(pid, "forget");
          work2.forgetProject(pid);
          notify({ kind: "project-deleted", pid, project: local.meta.name });
          return { status: "forgot" };
        }
        if (!await push(pid, local, rec, head.version)) return null;
        notify({ kind: "project-kept", pid, project: local.meta.name });
        return { status: "restored" };
      }
      if (synced && head.version === synced.version) {
        if (sameManifest(local.manifest, synced.manifest)) return { status: "clean" };
        return await push(pid, local, rec, head.version) ? { status: "pushed" } : null;
      }
      await pull(pid, local, rec, head);
      return null;
    }
    async function syncProject(pid, hint) {
      for (let i = 0; i < ATTEMPTS; i++) {
        const r = await step(pid, i === 0 ? hint : null);
        if (r) return Object.assign({ pid }, r);
      }
      return { pid, status: "busy" };
    }
    const settingsSync = createSettingsSync({
      store: store2,
      settings: opts.settings,
      account,
      commitId,
      call
    });
    async function syncAll() {
      const heads = readHeads(await call("heads"));
      const byId = new Map(heads.map((h) => [h.id, h]));
      const ids = /* @__PURE__ */ new Set();
      for (const p of work2.allProjects()) if (p.owner === account) ids.add(p.id);
      const tombs = work2.readTombstones();
      for (const pid of Object.keys(tombs)) if (tombs[pid].owner === account) ids.add(pid);
      for (const h of heads) if (!h.deleted) ids.add(h.id);
      const projects = {};
      for (const pid of [...ids].sort()) {
        try {
          projects[pid] = await syncProject(pid, byId.get(pid) || null);
        } catch (err) {
          if (err && err.offline) throw err;
          projects[pid] = { pid, status: "error", message: String(err && err.message || err) };
        }
      }
      let settings;
      try {
        settings = await settingsSync.sync();
      } catch (err) {
        if (err && err.offline) throw err;
        settings = { status: "error", message: String(err && err.message || err) };
      }
      return { projects, settings };
    }
    return { account, syncAll, syncProject, syncSettings: settingsSync.sync };
  }

  // js/persist/sync/runner.mjs
  var SYNC_LOCK = "beljar/sync";
  var SAFE = /* @__PURE__ */ new Set(["clean", "pushed", "downloaded", "forgot", "deleted", "absent", "restored"]);
  function roundIsSafe(result) {
    return !!result && !!result.projects && Object.values(result.projects).every((r) => SAFE.has(r.status));
  }
  function createSyncRunner(o) {
    const engine = o.engine;
    const timers = o.timers || {
      set: (fn, ms) => globalThis.setTimeout(fn, ms),
      clear: (h) => globalThis.clearTimeout(h)
    };
    const now = o.now || (() => Date.now());
    const quietMs = o.quietMs != null ? o.quietMs : 5e3;
    const maxWaitMs = o.maxWaitMs != null ? o.maxWaitMs : 3e4;
    const pollMs = o.pollMs != null ? o.pollMs : 6e4;
    const backoff = o.backoff || [5e3, 15e3, 6e4, 3e5];
    const listeners = /* @__PURE__ */ new Set();
    let status = { state: "waiting", leader: false, lastSync: 0, error: null, pending: false, safe: false };
    let leader = false;
    let stopped = false;
    let running = null;
    let again = false;
    let timer = null;
    let firstChange = 0;
    let failures = 0;
    let dirty = false;
    let release = null;
    let abort = null;
    let unsubscribe = null;
    function update(patch) {
      status = Object.assign({}, status, patch);
      for (const fn of [...listeners]) {
        try {
          fn(status);
        } catch (_) {
        }
      }
    }
    function wakeIn(ms) {
      if (timer != null) timers.clear(timer);
      timer = timers.set(() => {
        timer = null;
        round();
      }, Math.max(0, ms));
    }
    function changed() {
      if (!leader || stopped) return;
      dirty = true;
      if (!status.pending) update({ pending: true });
      const t = now();
      if (!firstChange) firstChange = t;
      wakeIn(Math.min(quietMs, maxWaitMs - (t - firstChange)));
    }
    function problems(res) {
      const out = [];
      for (const r of Object.values(res.projects || {})) if (r.status === "error") out.push(r.message);
      if (res.settings && res.settings.status === "error") out.push(res.settings.message);
      return out;
    }
    function round() {
      if (!leader || stopped) return Promise.resolve(null);
      if (running) {
        again = true;
        return running;
      }
      firstChange = 0;
      if (timer != null) {
        timers.clear(timer);
        timer = null;
      }
      const carried = dirty;
      dirty = false;
      update({ state: "syncing" });
      running = engine.syncAll().then((res) => {
        failures = 0;
        const errs = problems(res);
        if (errs.length && carried) dirty = true;
        update({ state: errs.length ? "error" : "idle", lastSync: now(), error: errs[0] || null, result: res, pending: dirty, safe: roundIsSafe(res) });
        return res;
      }, (err) => {
        failures += 1;
        if (carried) dirty = true;
        update({ state: err && err.offline ? "offline" : "error", error: String(err && err.message || err), pending: dirty, safe: false });
        return null;
      }).then((res) => {
        running = null;
        if (stopped) return res;
        if (again) {
          again = false;
          round();
        } else {
          wakeIn(failures ? backoff[Math.min(failures, backoff.length) - 1] : pollMs);
        }
        return res;
      });
      return running;
    }
    return {
      SYNC_LOCK,
      /** Ask for the lock, and listen for changes (heard only while holding it). */
      start() {
        if (unsubscribe) return;
        unsubscribe = o.store.subscribe((e) => {
          if (e.origin === "remote") return;
          if (e.cls === "work" || e.cls === "settings" || e.key === TOMBSTONES_KEY) changed();
        });
        const locks = o.locks;
        if (!locks || typeof locks.request !== "function") {
          update({ state: "unsupported" });
          return;
        }
        abort = typeof AbortController === "function" ? new AbortController() : null;
        Promise.resolve(locks.request(SYNC_LOCK, abort ? { signal: abort.signal } : {}, () => {
          if (stopped) return void 0;
          leader = true;
          update({ state: "idle", leader: true });
          round();
          return new Promise((resolve) => {
            release = resolve;
          });
        })).catch(() => {
        });
      },
      /**
       * Sync now (this tab must hold the lock). Resolves to the result of a round
       * that STARTED after this call, or null: a round already running may have
       * begun before the change the caller wants synced.
       */
      async syncNow() {
        if (running) {
          again = true;
          await running;
          if (running) return running;
        }
        return round();
      },
      status() {
        return status;
      },
      /** fn(status) on every change: { state, leader, lastSync, error, result }. */
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      /**
       * Stop, and resolve once a round in flight has finished: nothing sync does
       * lands after this resolves (signing out removes projects right after).
       */
      stop() {
        stopped = true;
        if (timer != null) {
          timers.clear(timer);
          timer = null;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        if (abort) abort.abort();
        if (release) release();
        leader = false;
        update({ state: "stopped", leader: false });
        return Promise.resolve(running).then(() => void 0);
      }
    };
  }

  // js/persist/sync/sync-status.mjs
  var STATUS_MESSAGE = "sync-status";
  var ASK_MESSAGE = "sync-ask";
  function summarize({ account, runner, online, differs }) {
    const files2 = differs || [];
    if (!account) return { signedIn: false, state: files2.length ? "differs" : "off", lastSync: 0, error: null, differs: files2 };
    const st = runner || {};
    let state;
    if (files2.length) state = "differs";
    else if (online === false || st.state === "offline") state = "offline";
    else if (st.state === "error") state = "error";
    else if (st.state === "syncing") state = "syncing";
    else if (st.pending) state = "pending";
    else if (st.lastSync) state = "synced";
    else state = "syncing";
    return { signedIn: true, state, lastSync: st.lastSync || 0, error: st.state === "error" ? st.error || null : null, differs: files2 };
  }
  function createSyncStatus(o) {
    const now = o.now || (() => Date.now());
    const timers = o.timers || { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) };
    const online = o.online || (() => true);
    let seq = 0;
    const newId2 = o.newId || (() => now().toString(36) + "-" + ++seq + "-" + Math.random().toString(36).slice(2, 8));
    const listeners = /* @__PURE__ */ new Set();
    const asked = /* @__PURE__ */ new Map();
    let runner = null;
    let unsubscribeRunner = null;
    let local = null;
    let remote = null;
    let lastKey = "";
    const leading = () => !!(local && local.leader);
    const current = () => leading() ? local : remote || local;
    function summary() {
      return summarize({ account: o.account(), runner: current(), online: online(), differs: o.conflicts() });
    }
    function emit() {
      const s = summary();
      const key = JSON.stringify(s);
      if (key === lastKey) return;
      lastKey = key;
      for (const fn of [...listeners]) {
        try {
          fn(s);
        } catch (_) {
        }
      }
    }
    function tell(st, answered) {
      o.tabs.post(STATUS_MESSAGE, {
        state: st.state,
        pending: !!st.pending,
        lastSync: st.lastSync || 0,
        error: st.error || null,
        safe: !!st.safe,
        at: now(),
        answered: answered || null
      });
    }
    o.tabs.on((kind, msg) => {
      if (!msg || typeof msg !== "object") return;
      if (kind === STATUS_MESSAGE) {
        remote = msg;
        if (msg.answered && asked.has(msg.answered)) {
          const resolve = asked.get(msg.answered);
          asked.delete(msg.answered);
          resolve({ ok: !!msg.safe, reason: msg.safe ? null : msg.state || "unsafe" });
        }
        emit();
      } else if (kind === ASK_MESSAGE && leading() && runner) {
        if (msg.round) {
          runner.syncNow().then(() => tell(runner.status(), msg.id));
        } else {
          tell(local, null);
        }
      }
    });
    return {
      /** Follow this tab's runner (Persist.startSync); a non-syncing tab asks the syncing one how things are. */
      attach(r) {
        this.detach();
        runner = r;
        local = r.status();
        unsubscribeRunner = r.subscribe((st) => {
          local = st;
          emit();
          if (st.leader) tell(st, null);
        });
        o.tabs.post(ASK_MESSAGE, { id: newId2(), round: false, at: now() });
        emit();
      },
      detach() {
        if (unsubscribeRunner) unsubscribeRunner();
        unsubscribeRunner = null;
        runner = null;
        local = null;
        remote = null;
        emit();
      },
      summary,
      /** Something the summary reads changed (a conflict, the network, the account): tell whoever listens. */
      refresh: emit,
      /** fn(summary) on every change; returns the unsubscribe. */
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      /**
       * Sync now and say whether every project's work is on the server:
       * { ok, reason }. From the syncing tab it runs the round itself; from any
       * other it asks that tab, and waits at most `timeoutMs` for the answer.
       */
      confirm(timeoutMs = 15e3) {
        if (!runner) return Promise.resolve({ ok: false, reason: "not-syncing" });
        if (leading()) {
          return runner.syncNow().then((res) => ({ ok: roundIsSafe(res), reason: roundIsSafe(res) ? null : runner.status().state }));
        }
        const id = newId2();
        return new Promise((resolve) => {
          asked.set(id, resolve);
          o.tabs.post(ASK_MESSAGE, { id, round: true, at: now() });
          timers.set(() => {
            if (!asked.has(id)) return;
            asked.delete(id);
            resolve({ ok: false, reason: "no-answer" });
          }, timeoutMs);
        });
      }
    };
  }

  // js/persist/durability.mjs
  var WORK_TO_LOSE = 200;
  var ASK_EVERY = 30 * 24 * 60 * 60 * 1e3;
  var RECOUNT_MS = 5e3;
  function countWork(work2, limit) {
    let n = 0;
    for (const p of work2.allProjects()) {
      if (p.owner !== null) continue;
      const snap = work2.snapshotProject(p.id);
      if (!snap) continue;
      for (const f of snap.tree.files) {
        n += String(snap.texts[f.id]).replace(/\s+/g, "").length;
        if (n >= limit) return n;
      }
    }
    return n;
  }
  function createDurability(o) {
    const now = o.now || (() => Date.now());
    const timers = o.timers || {
      set: (fn, ms) => globalThis.setTimeout(fn, ms),
      clear: (h) => globalThis.clearTimeout(h)
    };
    const state = { persisted: null, workToLose: false, asked: false, warned: false };
    let unsubscribe = null;
    let recount = null;
    let onClick = null;
    let disposed = false;
    function warnIfAtRisk() {
      if (!o.sevenDayRule || state.persisted || o.device.get("durabilityWarnedAt")) return;
      o.device.set("durabilityWarnedAt", now());
      state.warned = true;
      o.warn();
    }
    function settle(granted) {
      state.persisted = !!granted;
      if (!state.persisted) warnIfAtRisk();
    }
    function askAtNextClick() {
      if (onClick || !o.events) return;
      onClick = () => {
        o.events.removeEventListener("pointerdown", onClick, true);
        onClick = null;
        if (disposed || askedLately()) return;
        o.device.set("persistAskedAt", now());
        state.asked = true;
        let answer;
        try {
          answer = o.storage.persist();
        } catch (err) {
          answer = Promise.reject(err);
        }
        Promise.resolve(answer).then(settle, () => settle(false));
      };
      o.events.addEventListener("pointerdown", onClick, true);
    }
    function askedLately() {
      const last = o.device.get("persistAskedAt");
      return !!last && now() - last < ASK_EVERY;
    }
    function thereIsWork() {
      state.workToLose = true;
      const canAsk = !!(o.storage && typeof o.storage.persist === "function");
      if (canAsk && !askedLately()) askAtNextClick();
      else warnIfAtRisk();
    }
    function count() {
      if (state.workToLose || disposed) return;
      if (countWork(o.work, WORK_TO_LOSE) < WORK_TO_LOSE) return;
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      thereIsWork();
    }
    return {
      /** Learn whether the browser already keeps the storage; then wait for work to lose. */
      async start() {
        try {
          state.persisted = !!(o.storage && typeof o.storage.persisted === "function" && await o.storage.persisted());
        } catch (_) {
          state.persisted = false;
        }
        if (state.persisted || disposed) return;
        count();
        if (state.workToLose) return;
        unsubscribe = o.store.subscribe((e) => {
          if (e.cls !== "work" || recount != null) return;
          recount = timers.set(() => {
            recount = null;
            count();
          }, RECOUNT_MS);
        });
      },
      /** { persisted: true | false | null (not known yet), workToLose, asked, warned } */
      status() {
        return Object.assign({}, state);
      },
      dispose() {
        disposed = true;
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        if (recount != null) {
          timers.clear(recount);
          recount = null;
        }
        if (onClick && o.events) o.events.removeEventListener("pointerdown", onClick, true);
        onClick = null;
      }
    };
  }

  // js/persist/persist.mjs
  var CAPACITY_DEDUPE = "persist.capacity";
  function reportCapacityFailure(detail) {
    if (typeof globalThis.Toasts !== "undefined" && globalThis.Toasts.error) {
      globalThis.Toasts.error("Couldn\u2019t save: storage full.", { duration: 0, closable: true });
    }
    if (typeof globalThis.Notifications !== "undefined" && globalThis.Notifications.emit) {
      globalThis.Notifications.emit({
        kind: "error",
        category: "ops",
        origin: "local",
        title: "Couldn\u2019t save: storage full",
        body: "Your last successful save is intact. Newer edits may be lost on reload until browser storage frees up.",
        detail: detail || null,
        source: "persist.capacity",
        dedupeKey: CAPACITY_DEDUPE
      });
    }
  }
  function whenPageReady(fn) {
    if (typeof document !== "undefined" && document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      setTimeout(fn, 0);
    }
  }
  function announceReadOnly(message) {
    whenPageReady(function() {
      var C = globalThis.ConfirmDialog;
      if (C && typeof C.confirm === "function") {
        C.confirm({
          ariaLabel: "Reload BelJar",
          message,
          confirmLabel: "Reload",
          cancelLabel: "Not now",
          danger: false
        }).then(function(yes) {
          if (yes && globalThis.location && typeof globalThis.location.reload === "function") globalThis.location.reload();
        });
      } else if (globalThis.Toasts && typeof globalThis.Toasts.error === "function") {
        globalThis.Toasts.error(message, { duration: 0, closable: true });
      }
    });
  }
  function clearCapacityFailure() {
    var N = globalThis.Notifications;
    if (!N || typeof N.list !== "function" || typeof N.dismiss !== "function") return;
    var list = N.list();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].dedupeKey === CAPACITY_DEDUPE) {
        N.dismiss(list[i].id);
        break;
      }
    }
  }
  function browserArea(name) {
    try {
      var area = globalThis[name];
      if (area) {
        area.getItem("beljar/schema");
        return area;
      }
    } catch (_) {
    }
    return null;
  }
  var sessionArea = browserArea("sessionStorage");
  var store = createStore({
    storage: browserArea("localStorage") || createMemoryStorage(),
    alsoWipe: [sessionArea].filter(Boolean),
    onCapacity: function(state, detail) {
      if (state === "blocked") reportCapacityFailure(detail);
      else clearCapacityFailure();
    },
    onVersionAhead: function() {
      announceReadOnly("BelJar was updated in another tab. Reload to keep editing: changes here are not being saved.");
    },
    onCannotUpgrade: function() {
      announceReadOnly("This BelJar can\u2019t open what an older one saved, so it changed nothing. Changes here are not being saved.");
    }
  });
  var tabStore = createStore({ storage: sessionArea || createMemoryStorage() });
  var Settings = createSettings(store);
  var Device = createTable(store, {
    key: DEVICE_KEY,
    rows: DEVICE,
    unknown: function(id) {
      return 'device: no row "' + id + '" (declare it in device-schema.mjs)';
    }
  });
  var work = createWork({ store, device: Device });
  var files = create({ work, settings: Settings });
  var documents = createDocuments({ work, settings: Settings, files });
  var records = create2({ store, tabStore, work, settings: Settings });
  var treeNoticeQueued = false;
  var projectGoneShown = false;
  function noteTreeChanged() {
    if (treeNoticeQueued) return;
    treeNoticeQueued = true;
    Promise.resolve().then(function() {
      treeNoticeQueued = false;
      var g2 = typeof window !== "undefined" ? window : null;
      if (g2 && typeof g2.dispatchEvent === "function" && typeof CustomEvent === "function") {
        g2.dispatchEvent(new CustomEvent("beljar:project-tree-changed", { detail: { kind: "external" } }));
      }
    });
  }
  function announceProjectGone() {
    if (projectGoneShown) return;
    projectGoneShown = true;
    var message = "This project was deleted in another tab or on another device. Changes here can\u2019t be saved.";
    whenPageReady(function() {
      var C = globalThis.ConfirmDialog;
      if (C && typeof C.confirm === "function") {
        C.confirm({
          ariaLabel: "Project deleted",
          message,
          confirmLabel: "Open another project",
          cancelLabel: "Not now",
          danger: false
        }).then(function(yes) {
          if (yes && globalThis.location && typeof globalThis.location.reload === "function") globalThis.location.reload();
        });
      } else if (globalThis.Toasts && typeof globalThis.Toasts.error === "function") {
        globalThis.Toasts.error(message, { duration: 0, closable: true });
      }
    });
  }
  store.subscribe(function(e) {
    if (e.origin === "local" || !e.key) return;
    var pid = work.pinnedProject();
    var k = pid ? parseKey(e.key) : null;
    if (!k || k.pid !== pid) return;
    if (k.kind === "meta" && !work.hasProject(pid)) announceProjectGone();
    else if (k.kind === "tree" || k.kind === "meta") noteTreeChanged();
  });
  var SYNC_NOTICES = {
    copied: function(n) {
      return { kind: "warn", title: "Saved this device\u2019s " + n.from + " as " + n.path, body: "Another device changed the same lines while a conflict here was still open." };
    },
    kept: function(n) {
      return { kind: "info", title: "Kept " + n.path, body: "Another device deleted it, but it had changes here." };
    },
    restored: function(n) {
      return { kind: "info", title: "Restored " + n.path, body: "It was deleted here, but another device changed it." };
    },
    renamed: function(n) {
      return { kind: "info", title: "Renamed " + n.from + " to " + n.path, body: "Another device added a file with the same name." };
    },
    "project-deleted": function(n) {
      return { kind: "info", title: "Removed " + n.project, body: "It was deleted on another device." };
    },
    "project-restored": function(n) {
      return { kind: "info", title: "Restored " + n.project, body: "It was deleted here, but another device changed it." };
    },
    "project-kept": function(n) {
      return { kind: "info", title: "Kept " + n.project, body: "Another device deleted it, but it had changes here." };
    }
  };
  function announceSync(notice) {
    var N = globalThis.Notifications;
    var make = SYNC_NOTICES[notice && notice.kind];
    if (!make || !N || typeof N.emit !== "function") return;
    var words = make(notice);
    N.emit({
      kind: words.kind,
      category: "ops",
      origin: "remote",
      source: "sync",
      title: words.title,
      body: words.body,
      detail: notice.project && notice.path ? "In " + notice.project + "." : null
    });
  }
  function underSevenDayRule() {
    var nav = globalThis.navigator;
    if (!nav || nav.vendor !== "Apple Computer, Inc.") return false;
    var app = nav.standalone === true || typeof globalThis.matchMedia === "function" && globalThis.matchMedia("(display-mode: standalone)").matches;
    return !app;
  }
  function announceSevenDays() {
    if (globalThis.Toasts && typeof globalThis.Toasts.warn === "function") {
      globalThis.Toasts.warn(
        "Safari deletes this site\u2019s data after 7 days without a visit. To keep a copy, download your projects from the Project menu.",
        { duration: 0, closable: true, notify: false }
      );
    }
    if (globalThis.Notifications && typeof globalThis.Notifications.emit === "function") {
      globalThis.Notifications.emit({
        kind: "warn",
        category: "ops",
        origin: "local",
        source: "persist.durability",
        dedupeKey: "persist.durability",
        title: "Safari may delete your projects",
        body: "Safari deletes a site\u2019s data after 7 days without a visit, and your projects live only in this browser. To keep a copy, download each project from the Project menu."
      });
    }
  }
  var nav0 = globalThis.navigator;
  var durability = createDurability({
    store,
    work,
    device: Device,
    storage: nav0 && nav0.storage || null,
    events: typeof window !== "undefined" ? window : null,
    sevenDayRule: underSevenDayRule(),
    warn: announceSevenDays
  });
  whenPageReady(function() {
    var idle = globalThis.requestIdleCallback;
    if (typeof idle === "function") idle(function() {
      durability.start();
    }, { timeout: 1e4 });
    else setTimeout(function() {
      durability.start();
    }, 2e3);
  });
  var syncRunner = null;
  var syncStatus = createSyncStatus({
    account: work.account,
    conflicts: work.listConflicts,
    tabs: { post: records.postTabMessage, on: records.onTabMessage },
    online: function() {
      var nav = globalThis.navigator;
      return !nav || nav.onLine !== false;
    }
  });
  store.subscribe(function(e) {
    var k = e && e.key ? parseKey(e.key) : null;
    if (k && k.kind === "conflict") syncStatus.refresh();
  });
  function startSync(opts) {
    var account = work.account();
    if (!account) throw new Error("Persist.startSync: nobody is signed in on this browser (Persist.setAccount first)");
    if (!opts || !opts.transport) throw new Error("Persist.startSync needs a transport (js/persist/sync/protocol.mjs)");
    stopSync();
    var nav = globalThis.navigator;
    var engine = createSyncEngine({
      store,
      work,
      settings: Settings,
      transport: opts.transport,
      account,
      notify: announceSync
    });
    syncRunner = createSyncRunner({
      engine,
      store,
      locks: opts.locks !== void 0 ? opts.locks : nav && nav.locks || null
    });
    syncRunner.start();
    syncStatus.attach(syncRunner);
    return syncRunner;
  }
  function stopSync() {
    const r = syncRunner;
    syncRunner = null;
    syncStatus.detach();
    return r ? r.stop() : Promise.resolve();
  }
  function syncNow() {
    return syncRunner ? syncRunner.syncNow() : Promise.resolve(null);
  }
  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("online", function() {
      syncStatus.refresh();
      syncNow();
    });
    globalThis.addEventListener("offline", function() {
      syncStatus.refresh();
    });
  }
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "visible") syncNow();
    });
  }
  var Persist = {
    DEFAULT_PROJECT_NAME,
    documentFingerprint,
    normalizeViewportAnchor,
    isSaveBlocked: store.isBlocked,
    isReadOnly: store.isReadOnly,
    // accounts and sync (docs/PERSIST.md §5)
    getAccount: work.account,
    setAccount: work.setAccount,
    claimProject: work.claimProject,
    projectStats: work.projectStats,
    onFileChange: work.onFileChange,
    removeAccountProjects: work.removeAccountProjects,
    startSync,
    stopSync,
    syncNow,
    syncSummary: syncStatus.summary,
    onSyncSummary: syncStatus.subscribe,
    confirmSynced: syncStatus.confirm,
    listConflicts: work.listConflicts,
    conflictSides: function(pid, fid) {
      return work.conflictSides(fid, pid);
    },
    resolveStoredConflict: function(pid, fid, choice) {
      return work.resolveStoredConflict(fid, choice, pid);
    },
    durabilityStatus: durability.status,
    // the open document
    createPersist: documents.createPersist,
    // projects
    listProjects: work.listProjects,
    getActiveProjectId: work.projectId,
    setActiveProjectId: work.setActiveProject,
    createProject: work.createProject,
    renameProject: work.renameProject,
    deleteProject: work.deleteProject,
    newBlankProject: files.newBlankProject,
    createProjectWithFiles: files.createProjectWithFiles,
    getProjectName: files.getProjectName,
    setProjectName: files.setProjectName,
    // files
    listFiles: files.listFiles,
    getFileById: files.getFileById,
    getFileText: files.getFileText,
    setFileText: files.setFileText,
    createFile: files.createFile,
    replaceProject: files.replaceProject,
    restoreDeletedFile: files.restoreDeletedFile,
    deleteFile: files.deleteFile,
    renameFile: files.renameFile,
    listEmptyFolders: files.listEmptyFolders,
    addEmptyFolder: files.addEmptyFolder,
    removeEmptyFolder: files.removeEmptyFolder,
    clearEmptyFolders: files.clearEmptyFolders,
    pruneEmptyFoldersUnder: files.pruneEmptyFoldersUnder,
    renameEmptyFolderPrefix: files.renameEmptyFolderPrefix,
    preserveEmptyFoldersAfterMoves: files.preserveEmptyFoldersAfterMoves,
    expandAliasesInAllFiles: files.expandAliasesInAllFiles,
    isAliasExpandablePath: files.isAliasExpandablePath,
    // .cfg membership and the active suite per directory
    addEntryToCfg: files.addEntryToCfg,
    prependEntryToCfg: files.prependEntryToCfg,
    removeEntryFromCfg: files.removeEntryFromCfg,
    moveEntryInCfg: files.moveEntryInCfg,
    getActiveCfgForDir: files.getActiveCfgForDir,
    getActiveCfgsForDir: files.getActiveCfgsForDir,
    setActiveCfgForDir: files.setActiveCfgForDir,
    setActiveCfgsForDir: files.setActiveCfgsForDir,
    addActiveCfgForDir: files.addActiveCfgForDir,
    removeActiveCfgForDir: files.removeActiveCfgForDir,
    getActiveCfgByDir: files.getActiveCfgByDir,
    backfillActiveCfgByDir: files.backfillActiveCfgByDir,
    // this project's session on this device: tabs, workspace, side panel, explorer folds
    getActiveFileId: files.getActiveFileId,
    setActiveFileId: files.setActiveFileId,
    getOpenFileIds: files.getOpenFileIds,
    setOpenFileIds: files.setOpenFileIds,
    openFile: files.openFile,
    closeOpenFile: files.closeOpenFile,
    readWorkspace: records.readWorkspace,
    writeWorkspace: records.writeWorkspace,
    resetWorkspace: records.resetWorkspace,
    readSidePanel: records.readSidePanel,
    writeSidePanel: records.writeSidePanel,
    readExplorerFolds: records.readExplorerFolds,
    writeExplorerFolds: records.writeExplorerFolds,
    // device records (device-records.mjs)
    readReplTranscript: records.readReplTranscript,
    writeReplTranscript: records.writeReplTranscript,
    readReplCommands: records.readReplCommands,
    writeReplCommands: records.writeReplCommands,
    readFileFolds: records.readFileFolds,
    writeFileFolds: records.writeFileFolds,
    readNotifications: records.readNotifications,
    writeNotifications: records.writeNotifications,
    readUndoStack: records.readUndoStack,
    writeUndoStack: records.writeUndoStack,
    clearUndoStack: records.clearUndoStack,
    postTabMessage: records.postTabMessage,
    onTabMessage: records.onTabMessage
  };
  var g = typeof window !== "undefined" ? window : globalThis;
  g.Persist = Persist;
  g.Settings = Settings;
  g.Device = Device;
  g.BelJarPersist = g.Persist;
})();
