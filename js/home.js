(() => {
  // js/frame/routes.mjs
  var g = typeof window !== "undefined" ? window : globalThis;
  var PROJECT_ID = /^p_[0-9a-hjkmnp-tv-z]{26}$/;
  var EDIT_SHORT = /(?:^|\/)edit\/?$/;
  var EDIT_ANY = /(?:^|\/)edit(?:\.html)?\/?$/;
  var PRIVACY_ANY = /(?:^|\/)privacy(?:\.html)?\/?$/;
  function short() {
    if (g.BELJAR_DEPLOYED) return true;
    const path = g.location && typeof g.location.pathname === "string" ? g.location.pathname : "";
    return EDIT_SHORT.test(path);
  }
  function query(pairs) {
    const parts = [];
    for (const [k, v] of pairs) if (v) parts.push(k + "=" + encodeURIComponent(v));
    return parts.length ? "?" + parts.join("&") : "";
  }
  function startsOnLast() {
    const S = g.Settings;
    try {
      return !!S && typeof S.get === "function" && S.get("startPage") === "last";
    } catch (_) {
      return false;
    }
  }
  function homeUrl(opts) {
    const base = short() ? "/" : "index.html";
    if (opts && opts.open) return base + query([["open", opts.open]]);
    return base + (startsOnLast() ? "?home" : "");
  }
  function editUrl(pid) {
    return (short() ? "/edit" : "edit.html") + query([["p", pid]]);
  }
  function privacyUrl() {
    return short() ? "/privacy" : "privacy.html";
  }
  function signInUrl(loc) {
    const l = loc || g.location;
    const back = l ? String(l.pathname || "/") + String(l.search || "") : "/";
    return "/api/auth/github/start" + query([["return", back]]);
  }
  function pageOf(loc) {
    const p = String(loc && loc.pathname || "");
    if (EDIT_ANY.test(p)) return "edit";
    return PRIVACY_ANY.test(p) ? "privacy" : "home";
  }
  function projectParam(loc, name) {
    const pairs = String(loc && loc.search || "").replace(/^\?/, "").split("&");
    for (const pair of pairs) {
      const eq = pair.indexOf("=");
      if (eq === -1 || pair.slice(0, eq) !== name) continue;
      let v = pair.slice(eq + 1);
      try {
        v = decodeURIComponent(v);
      } catch (_) {
        return null;
      }
      return PROJECT_ID.test(v) ? v : null;
    }
    return null;
  }
  function projectOf(loc) {
    return pageOf(loc) === "edit" ? projectParam(loc, "p") : null;
  }
  function pendingOf(loc) {
    return pageOf(loc) === "home" ? projectParam(loc, "open") : null;
  }
  var ISSUES_URL = "https://github.com/dpbarry/bel-jar/issues";
  var CONTACT_EMAIL = "dean.barry@mail.mcgill.ca";
  var CONTACT_URL = "mailto:" + CONTACT_EMAIL;
  function reportIssue() {
    if (typeof g.open === "function") g.open(ISSUES_URL, "_blank", "noopener");
  }
  function go(url, opts) {
    if (!g.location) return;
    if (opts && opts.replace) g.location.replace(url);
    else g.location.assign(url);
  }
  function settle(url) {
    const h = g.history;
    const l = g.location;
    if (!h || !l || typeof h.replaceState !== "function") return false;
    h.replaceState(h.state, "", url + String(l.hash || ""));
    return true;
  }
  function nameProject(pid) {
    const l = g.location;
    if (!l || pageOf(l) !== "edit" || projectOf(l) === pid) return false;
    return settle(editUrl(pid));
  }
  var Routes = {
    PROJECT_ID,
    ISSUES_URL,
    CONTACT_URL,
    homeUrl,
    editUrl,
    privacyUrl,
    signInUrl,
    pageOf,
    projectOf,
    pendingOf,
    go,
    settle,
    nameProject,
    reportIssue
  };
  g.Routes = Routes;

  // js/persist/store.mjs
  var SCHEMA = 5;
  var SCHEMA_KEY = "beljar/schema";
  function migrateStorage(storage, schema, migrations) {
    const raw = storage.getItem(SCHEMA_KEY);
    if (raw === String(schema)) return { result: "current", from: schema };
    if (raw == null) return { result: "fresh", from: null };
    const n = Number(raw);
    const from = raw !== "" && Number.isInteger(n) ? n : null;
    if (from == null) return { result: "unreadable", from: null };
    if (from > schema) return { result: "newer", from };
    const steps = migrations || {};
    for (let v = from; v < schema; v++) if (typeof steps[v] !== "function") return { result: "missing", from, at: v };
    for (let v = from; v < schema; v++) {
      try {
        steps[v](storage);
      } catch (err) {
        return { result: "threw", from, at: v, error: String(err && err.message || err) };
      }
    }
    storage.setItem(SCHEMA_KEY, String(schema));
    return { result: "migrated", from };
  }
  var CLASSES = [
    { pattern: /^beljar\/settings$/, cls: "settings" },
    { pattern: /^beljar\/device$/, cls: "device" },
    { pattern: /^beljar\/notifications$/, cls: "device" },
    { pattern: /^beljar\/repl\/(transcript|commands)$/, cls: "device" },
    { pattern: /^beljar\/p\/[^/]+\/repl$/, cls: "device" },
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
    let blocked2 = false;
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
    const up = migrateStorage(storage, schema, migrations);
    if (up.result === "newer") {
      readOnly = true;
      resetReason = "newer";
      onVersionAhead(up.from);
    } else if (up.result === "fresh") {
      resetReason = "fresh";
      wipeAndStamp();
    } else if (up.result === "migrated") {
      resetReason = "migrated";
    } else if (up.result === "threw") {
      readOnly = true;
      resetReason = "refused";
      onCannotUpgrade("migration from " + up.at + " failed: " + up.error);
    } else if (up.result === "missing" || up.result === "unreadable") {
      if (missingPolicy === "wipe") {
        resetReason = "schema-changed";
        wipeAndStamp();
      } else {
        readOnly = true;
        resetReason = "refused";
        onCannotUpgrade("no migration from " + storedRaw + " to " + schema);
      }
    }
    const READ_ONLY = { ok: false, error: { code: "read-only" } };
    function emit2(evt) {
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
      if (!blocked2) return;
      blocked2 = false;
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
      if (cls !== "cache" && !blocked2) {
        blocked2 = true;
        onCapacity("blocked", detail);
      }
      return { ok: false, error: { code: "capacity", detail } };
    }
    const store3 = {
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
        if (data === void 0) return store3.remove(key);
        const res = write(key, cls, { at: now(), data });
        if (res.ok) emit2({ key, cls, origin: "local" });
        return res;
      },
      update(key, fn) {
        return store3.set(key, fn(store3.get(key)));
      },
      remove(key) {
        const cls = requireClass(key);
        if (readOnly) return READ_ONLY;
        storage.removeItem(key);
        emit2({ key, cls, origin: "local" });
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
        const gone = store3.keys(prefix);
        for (const k of gone) storage.removeItem(k);
        for (const k of gone) emit2({ key: k, cls: classOf(k), origin: "local" });
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
          emit2({ key, cls, origin: "remote" });
          return { ok: true };
        }
        const res = write(key, cls, { at: Number(at) || now(), data });
        if (res.ok) emit2({ key, cls, origin: "remote" });
        return res;
      },
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      /** True while a write that matters is failing for want of space. */
      isBlocked() {
        return blocked2;
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
          emit2({ key: null, cls: null, origin: "tab" });
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
        emit2({ key: e.key, cls: classOf(e.key), origin: "tab", data: env ? env.data : void 0 });
      };
      events.addEventListener("storage", onStorageEvent);
    }
    return store3;
  }

  // js/persist/migrations.mjs
  var MIGRATIONS = {
    // The REPL was one transcript for the whole browser. It belongs to the
    // project that was open; every other project starts with none.
    4: function moveReplOntoItsProject(storage) {
      const transcriptRaw = storage.getItem("beljar/repl/transcript");
      const commandsRaw = storage.getItem("beljar/repl/commands");
      if (transcriptRaw == null && commandsRaw == null) return;
      let transcript = null;
      let commands = null;
      let device = null;
      try {
        transcript = JSON.parse(transcriptRaw || "null");
        commands = JSON.parse(commandsRaw || "null");
        device = JSON.parse(storage.getItem("beljar/device") || "null");
      } catch (_) {
        return;
      }
      const values = device && device.data && device.data.values;
      const pid = values && typeof values.activeProject === "string" ? values.activeProject : "";
      if (!pid) return;
      const html = transcript && transcript.data && typeof transcript.data.html === "string" ? transcript.data.html : "";
      const list3 = commands && Array.isArray(commands.data) ? commands.data.filter((x) => typeof x === "string") : [];
      const dest = "beljar/p/" + pid + "/repl";
      if ((html || list3.length) && storage.getItem(dest) == null) {
        const at = Math.max(
          transcript && typeof transcript.at === "number" ? transcript.at : 0,
          commands && typeof commands.at === "number" ? commands.at : 0
        ) || Date.now();
        storage.setItem(dest, JSON.stringify({
          at,
          data: {
            html,
            scrollTop: transcript && transcript.data && typeof transcript.data.scrollTop === "number" ? transcript.data.scrollTop : 0,
            savedAt: transcript && transcript.data && typeof transcript.data.savedAt === "number" ? transcript.data.savedAt : at,
            commands: list3
          }
        }));
      }
      storage.removeItem("beljar/repl/transcript");
      storage.removeItem("beljar/repl/commands");
    }
  };

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
  function createTable(store3, opts) {
    const { key, rows } = opts;
    const byId2 = new Map(rows.map((row) => [row.id, row]));
    const ids = rows.map((row) => row.id);
    const listeners = /* @__PURE__ */ new Set();
    const revisions = /* @__PURE__ */ new Map();
    function readOverrides2() {
      const rec = store3.get(key);
      const values = rec && rec.values && typeof rec.values === "object" ? rec.values : {};
      const out = {};
      for (const [id, raw] of Object.entries(values)) {
        const row = byId2.get(id);
        if (!row) continue;
        const v = normalizeValue(row, raw);
        if (v !== void 0 && !sameValue(v, row.default)) out[id] = v;
      }
      return out;
    }
    let overrides = readOverrides2();
    function requireRow(id) {
      const row = byId2.get(id);
      if (!row) throw new Error(opts.unknown ? opts.unknown(id) : `${key}: no row "${id}"`);
      return row;
    }
    function emit2(changed, origin) {
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
      const res = store3.set(key, { values: next });
      if (!res.ok) return { ok: false, changed: [] };
      overrides = next;
      emit2(changed, "local");
      return { ok: true, changed };
    }
    const unsubscribe = store3.subscribe((e) => {
      if (e.origin === "local") return;
      if (e.key !== key && e.key !== null) return;
      const before = overrides;
      overrides = readOverrides2();
      emit2(ids.filter((id) => !sameValue(before[id], overrides[id])), e.origin);
    });
    return {
      /** The row declaring `id`, or null. */
      rowOf(id) {
        return byId2.get(id) || null;
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
          if (pick2 && !pick2(byId2.get(id))) next[id] = v;
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
  var SECTIONS = ["appearance", "editor", "keybindings", "beluga", "harpoon", "repl", "workspace", "aliases", "account"];
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
  function cleanDismissed(raw) {
    if (!Array.isArray(raw)) return void 0;
    const out = [];
    for (const id of raw) {
      if (typeof id === "string" && id && !out.includes(id)) out.push(id);
    }
    return out;
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
    // How much the status strip says. It is always there: no Off (2026-09-30).
    { id: "statusStrip", section: "keybindings", default: "standard", values: ["compact", "standard", "detailed"] },
    { id: "vimLeader", section: "keybindings", default: "\\", values: ["\\", ",", " "] },
    { id: "vimInsertEscape", section: "keybindings", default: "", values: ["", "jk", "jj", "kj"] },
    { id: "emacsYankSource", section: "keybindings", default: "system", values: ["system", "kill-ring"] },
    // Clipboard dialogs this browser has closed. The grant is per browser, so it
    // does not follow the account, and Reset does not ask again.
    { id: "clipboardReadDismissed", section: "keybindings", default: [], type: "json", normalize: cleanDismissed, sync: false, reset: false },
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
    // Case completion: fill a proof's missing cases when typing pauses, or only on a command.
    { id: "caseFill", section: "harpoon", default: "auto", values: ["auto", "ask"] },
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
    // What a plain arrival at BelJar opens: home, or the project last opened, the
    // way an IDE reopens its last window. Early boot decides, before first paint
    // (js/boot/early-boot-core.mjs `startTarget`).
    { id: "startPage", section: "workspace", default: "home", values: ["home", "last"] },
    { id: "inspectorFollow", section: "workspace", default: OFF },
    { id: "restorePanels", section: "workspace", default: ON },
    { id: "libraryExpandDefault", section: "workspace", default: OFF },
    // Tips seen once on any computer stay seen on all of them (js/ui/hint-seen.mjs):
    // one row per tip, so two computers that each saw a different one never disagree.
    { id: "hintSeenLibrary", section: "workspace", default: OFF, reset: false },
    { id: "hintSeenInspectorCursor", section: "workspace", default: OFF, reset: false },
    { id: "hintSeenSignIn", section: "workspace", default: OFF, reset: false },
    // ── Account: how sync behaves (docs/PERSIST.md §5.7) ─────────────────────
    // Signed in, settings follow you between devices; off here, this device keeps its own.
    { id: "syncSettings", section: "account", default: ON, sync: false },
    // A file changed on this device and in the cloud since they last synced:
    // 'merge' what merges, or 'ask' about every such file (nothing merges by
    // itself: sync/merge-project.mjs `askAll`).
    { id: "syncBothChanged", section: "account", default: "merge", values: ["merge", "ask"] },
    // Merging, the lines changed on both sides: 'ask' (the review window), or
    // settle them to 'mine' or the 'cloud' as they appear (js/account/sync-ui.mjs).
    { id: "syncOverlap", section: "account", default: "ask", values: ["ask", "mine", "cloud"] },
    // Edits made while offline, once back online: 'upload' on their own, or 'ask'
    // first (held until the person uploads them or takes the cloud's instead).
    { id: "syncReconnect", section: "account", default: "upload", values: ["upload", "ask"] },
    // "Offline" in the strip, and "Back online" when it returns. The cloud beside
    // the project name says it either way.
    { id: "syncNotices", section: "account", default: ON },
    // Signing out on this browser: 'remove' the account's projects (safe on a
    // shared computer), or 'keep' them here to work on signed out; they sync
    // again when the same account signs in (work.mjs `keptAccounts`).
    { id: "signOutKeep", section: "account", default: "remove", values: ["remove", "keep"], sync: false },
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
  function readSetting(id) {
    const S = globalThis.Settings;
    return S ? S.get(id) : defaultOf(id);
  }

  // js/persist/settings.mjs
  var EXPORT_KIND = "beljar-settings";
  function createSettings(store3) {
    const table = createTable(store3, {
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
        return table.reset((row) => row.section === section && row.reset !== false);
      },
      resetAll() {
        return table.reset((row) => row.reset !== false);
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
  function accountIds(raw) {
    if (!Array.isArray(raw)) return void 0;
    return [...new Set(raw.filter((id) => typeof id === "string" && id !== ""))];
  }
  var idList = accountIds;
  var PANEL_W = { group: "layout", default: 250, min: 160, max: 512, integer: true, boot: true };
  var PANEL_H = { group: "layout", default: 190, min: 96, max: 384, integer: true, boot: true };
  var DEVICE = [
    // which project the next load opens (a page stays on the one it opened: work.mjs)
    { id: "activeProject", type: "string", default: "" },
    // the account this browser is signed in as ('' signed out): whose projects it
    // shows, and who owns a new one (work.mjs). An opaque id, never a credential.
    { id: "account", type: "string", default: "" },
    // signed out with "Keep in this browser": the accounts whose projects stay
    // here, usable signed out and never adopted by another account (work.mjs
    // `isVisible`). Each leaves the list when it signs in again.
    { id: "keptAccounts", type: "json", default: [], normalize: accountIds },
    // Signed out with "Remove": the account whose projects are still to leave
    // this browser ('' none). They go when the next page loads (work.mjs
    // `finishSignOut`), never under the page that signed out, which is still live.
    { id: "leftAccount", type: "string", default: "" },
    // And the projects of it that stay, kept for it: a session that ended
    // elsewhere leaves behind nothing the cloud lacks (account.mjs `sessionEnded`).
    { id: "leftKeep", type: "json", default: [], normalize: idList },
    // Why this browser was signed out without asking ('' none): 'elsewhere' or
    // 'ended'. Said once, by the page that loads next (account.mjs).
    { id: "signedOutNote", type: "string", default: "" },
    // Signing in again: the account whose work this browser should come back
    // to, and the project it had open when it signed out here ('' the newest).
    // Used once, by the first load that finds a blank placeholder open
    // (account.mjs `resumeAfterSignIn`, work.mjs `isBlankProject`).
    { id: "resumeAccount", type: "string", default: "" },
    { id: "resumeProject", type: "string", default: "" },
    // "Back online: Ask me first": the account whose offline edits wait
    // for the person ('' none). Outlives a reload (sync/hold.mjs).
    { id: "syncHeldFor", type: "string", default: "" },
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
  function replKey(pid) {
    return projectPrefix(pid) + "repl";
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
  var PROJECT_KEY = /^beljar\/p\/([^/]+)\/(meta|tree|session|folds|undo|sync|repl|f|cache|conflict)(?:\/([^/]+))?$/;
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
  var DEFAULT_PROJECT_NAME = "Untitled project";
  var DEFAULT_NAME_BEFORE = "Untitled Project";
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
      const seen2 = /* @__PURE__ */ new Set();
      for (const f of raw.files) {
        if (!f || typeof f.id !== "string" || !f.id || typeof f.name !== "string" || seen2.has(f.id)) continue;
        seen2.add(f.id);
        t.files.push({ id: f.id, name: f.name });
      }
    }
    t.folders = stringList2(raw.folders);
    if (raw.suites && typeof raw.suites === "object" && !Array.isArray(raw.suites)) {
      for (const dir of Object.keys(raw.suites)) {
        const list3 = stringList2(raw.suites[dir]);
        if (list3.length) t.suites[dir] = list3;
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
        at: typeof t.at === "number" ? t.at : 0,
        name: typeof t.name === "string" ? t.name : ""
      };
    }
    return out;
  }
  function createWork(opts) {
    const store3 = opts.store;
    const now = opts.now || (() => Date.now());
    const device = opts.device || createTable(store3, { key: DEVICE_KEY, rows: DEVICE });
    const cache = /* @__PURE__ */ new Map();
    const PROJECTS = " projects";
    let pinned = null;
    let pinnedOwner = null;
    let closing = false;
    store3.subscribe((evt) => {
      if (evt.key == null) {
        cache.clear();
        return;
      }
      cache.delete(evt.key);
      const k = parseKey(evt.key);
      if (k && k.kind === "meta") {
        cache.delete(PROJECTS);
        if (k.pid === pinned) noteOwner();
      }
    });
    function noteOwner() {
      const meta = pinned ? normalizeMeta(pinned, store3.get(metaKey(pinned))) : null;
      if (meta) pinnedOwner = meta.owner;
    }
    function remember(key, value) {
      if (cache.size >= CACHE_LIMIT) cache.clear();
      cache.set(key, value);
      return value;
    }
    function cached(key, load) {
      if (cache.has(key)) return cache.get(key);
      return remember(key, load(store3.get(key)));
    }
    function put(key, value, stored) {
      const res = store3.set(key, stored !== void 0 ? stored : value);
      if (res.ok) remember(key, value);
      return res;
    }
    function peekProjects() {
      if (cache.has(PROJECTS)) return cache.get(PROJECTS);
      const list3 = [];
      for (const key of store3.keys("beljar/p/")) {
        const k = parseKey(key);
        if (!k || k.kind !== "meta") continue;
        const meta = normalizeMeta(k.pid, store3.get(key));
        if (meta) list3.push(meta);
      }
      list3.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return remember(PROJECTS, list3);
    }
    function hasProject(pid) {
      return peekProjects().some((p) => p.id === pid);
    }
    function account() {
      return device.get("account") || null;
    }
    function setAccount(uid) {
      if (uid && kept().includes(String(uid))) device.set("keptAccounts", kept().filter((id) => id !== String(uid)));
      if (uid && device.get("resumeAccount") !== String(uid)) setResume(String(uid), "");
      if (uid) return device.set("account", String(uid));
      return device.reset((row) => row.id === "account");
    }
    function setResume(uid, pid) {
      device.set("resumeAccount", uid);
      if (pid) device.set("resumeProject", pid);
      else device.reset((row) => row.id === "resumeProject");
    }
    function resumeFor(uid) {
      if (!uid || device.get("resumeAccount") !== String(uid)) return null;
      return { project: device.get("resumeProject") || "" };
    }
    function clearResume() {
      return device.reset((row) => row.id === "resumeAccount" || row.id === "resumeProject");
    }
    function isBlankProject(pid) {
      const meta = normalizeMeta(pid, store3.get(metaKey(pid)));
      if (!meta || meta.owner !== null || meta.name !== DEFAULT_PROJECT_NAME && meta.name !== DEFAULT_NAME_BEFORE) return false;
      const t = peekTree(pid);
      if (t.files.length !== 1 || t.files[0].name !== FIRST_FILE_NAME || t.folders.length) return false;
      if (t.suites && Object.keys(t.suites).length) return false;
      return getText(t.files[0].id, pid) === "";
    }
    function keepAccountProjects(uid) {
      return uid ? device.set("keptAccounts", kept().concat(String(uid))) : false;
    }
    function kept() {
      const ids = device.get("keptAccounts");
      return Array.isArray(ids) ? ids : [];
    }
    function isVisible(p) {
      return ownerShown(p.owner);
    }
    function ownerShown(owner) {
      if (owner === null || owner === account()) return true;
      return !account() && kept().includes(owner);
    }
    function ownerLeft() {
      if (!pinned) return false;
      noteOwner();
      if (ownerShown(pinnedOwner)) return false;
      closing = true;
      return true;
    }
    function peekVisible() {
      return peekProjects().filter(isVisible);
    }
    function claimProject(pid) {
      const uid = account();
      const meta = normalizeMeta(pid, store3.get(metaKey(pid)));
      if (!uid || !meta || meta.owner !== null) return false;
      meta.owner = uid;
      return put(metaKey(pid), metaRecord(meta)).ok;
    }
    function leaveAccount(uid, keep) {
      closing = true;
      if (!uid) return false;
      const stay = Array.isArray(keep) ? keep.filter((pid) => typeof pid === "string" && pid) : [];
      if (stay.length) device.set("leftKeep", stay);
      else device.reset((row) => row.id === "leftKeep");
      return device.set("leftAccount", String(uid));
    }
    function noteSignedOut(reason) {
      return device.set("signedOutNote", String(reason || ""));
    }
    function takeSignedOutNote() {
      const note = device.get("signedOutNote");
      if (note) device.reset((row) => row.id === "signedOutNote");
      return note || "";
    }
    function finishSignOut() {
      const uid = device.get("leftAccount");
      if (!uid) return 0;
      const keep = new Set(device.get("leftKeep"));
      device.reset((row) => row.id === "leftAccount" || row.id === "leftKeep");
      if (account() === uid) return 0;
      const n = removeAccountProjects(uid, keep);
      if (peekProjects().some((p) => p.owner === uid)) keepAccountProjects(uid);
      return n;
    }
    function removeAccountProjects(uid, keep) {
      if (!uid) return 0;
      const open6 = pinned || device.get("activeProject");
      const wasTheirs = peekProjects().some((p) => p.id === open6 && p.owner === uid);
      setResume(String(uid), wasTheirs ? open6 : "");
      let n = 0;
      for (const p of peekProjects()) {
        if (p.owner !== uid || keep && keep.has(p.id)) continue;
        store3.remove(metaKey(p.id));
        store3.removeAll(projectPrefix(p.id));
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
      const synced = store3.get(SETTINGS_SYNC_KEY);
      if (synced && synced.account === uid) store3.remove(SETTINGS_SYNC_KEY);
      if (device.get("syncHeldFor") === String(uid)) device.reset((row) => row.id === "syncHeldFor");
      if (kept().includes(String(uid))) device.set("keptAccounts", kept().filter((id) => id !== String(uid)));
      return n;
    }
    function releaseAccount(uid) {
      if (!uid) return 0;
      let n = 0;
      for (const p of peekProjects()) {
        if (p.owner !== uid) continue;
        const meta = normalizeMeta(p.id, store3.get(metaKey(p.id)));
        if (!meta) continue;
        meta.owner = null;
        if (!put(metaKey(p.id), metaRecord(meta)).ok) continue;
        store3.remove(syncKey(p.id));
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
      const synced = store3.get(SETTINGS_SYNC_KEY);
      if (synced && synced.account === uid) store3.remove(SETTINGS_SYNC_KEY);
      const id = String(uid);
      if (device.get("syncHeldFor") === id) device.reset((row) => row.id === "syncHeldFor");
      if (device.get("resumeAccount") === id) clearResume();
      if (device.get("leftAccount") === id) device.reset((row) => row.id === "leftAccount" || row.id === "leftKeep");
      if (kept().includes(id)) device.set("keptAccounts", kept().filter((k) => k !== id));
      return n;
    }
    function readTombstones() {
      return normalizeTombstones(store3.get(TOMBSTONES_KEY));
    }
    function writeTombstones(tombs) {
      return Object.keys(tombs).length ? store3.set(TOMBSTONES_KEY, tombs) : store3.remove(TOMBSTONES_KEY);
    }
    function writeDevice(pid) {
      return device.set("activeProject", pid);
    }
    function createProject(name) {
      const pid = newId("p", (id) => store3.keys(projectPrefix(id)).length > 0);
      const fid = newId("f");
      const landed = put(treeKey(pid), normalizeTree({ files: [{ id: fid, name: FIRST_FILE_NAME }] })).ok && put(sessionKey(pid), normalizeSession({ open: [fid], active: fid })).ok && put(metaKey(pid), metaRecord({ name: cleanName(name), createdAt: now(), owner: account() })).ok;
      if (landed) return pid;
      store3.removeAll(projectPrefix(pid));
      return null;
    }
    function ensureProjects() {
      if (!peekVisible().length && !closing) {
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
    function projectInUse() {
      if (pinned && device.get("activeProject") !== pinned && peekVisible().some((p) => p.id === pinned)) writeDevice(pinned);
    }
    function visibleProjects() {
      return peekVisible().map((p) => Object.assign({}, p));
    }
    function lastProject() {
      const want = device.get("activeProject");
      return want && peekVisible().some((p) => p.id === want) ? want : null;
    }
    function pinProject(pid) {
      if (pinned) return pinned === pid;
      if (!pid || !peekVisible().some((p) => p.id === pid)) return false;
      pinned = pid;
      noteOwner();
      if (device.get("activeProject") !== pid) writeDevice(pid);
      return true;
    }
    function projectId() {
      if (pinned) return pinned;
      const list3 = ensureProjects();
      const want = device.get("activeProject");
      pinned = list3.some((p) => p.id === want) ? want : list3[0].id;
      noteOwner();
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
      noteOwner();
      return true;
    }
    function renameProject2(pid, name) {
      const meta = normalizeMeta(pid, store3.get(metaKey(pid)));
      if (!meta) return false;
      meta.name = cleanName(name);
      return put(metaKey(pid), metaRecord(meta)).ok;
    }
    function deleteProject2(pid) {
      const list3 = ensureProjects();
      if (list3.length <= 1) return null;
      return dropProject(pid, list3);
    }
    function removeProject(pid) {
      const list3 = peekVisible();
      if (!list3.some((p) => p.id === pid)) return false;
      const next = dropProject(pid, list3);
      return next !== null || !peekVisible().some((p) => p.id === pid);
    }
    function dropProject(pid, list3) {
      const idx = list3.findIndex((p) => p.id === pid);
      if (idx === -1) return null;
      const others = list3.filter((p) => p.id !== pid);
      const owner = list3[idx].owner;
      const synced = store3.get(syncKey(pid));
      if (owner && synced && typeof synced === "object" && (synced.version > 0 || synced.pending)) {
        const tombs = readTombstones();
        tombs[pid] = {
          version: synced.version > 0 ? synced.version : 0,
          owner,
          pending: synced.pending && typeof synced.pending.id === "string" ? synced.pending.id : null,
          at: now(),
          name: list3[idx].name
        };
        if (!writeTombstones(tombs).ok) return null;
      }
      store3.remove(metaKey(pid));
      store3.removeAll(projectPrefix(pid));
      const next = others.length ? others[Math.max(0, idx - 1)].id : null;
      if (device.get("activeProject") === pid) {
        if (next) writeDevice(next);
        else device.reset((row) => row.id === "activeProject");
      }
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
      const d = store3.get(fileKey(pid || projectId(), fid));
      return d && d.via === "sync" ? "sync" : "local";
    }
    function removeFiles(fids, pid) {
      pid = pid || projectId();
      const views = peekSession(pid).views;
      let hadView = false;
      for (const fid of fids) {
        store3.remove(fileKey(pid, fid));
        store3.remove(cacheKey(pid, fid));
        store3.remove(conflictKey(pid, fid));
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
      const live2 = new Set(peekTree(pid).files.map((f) => f.id));
      if (next.open) next.open = next.open.filter((id) => live2.has(id));
      if (next.active && !live2.has(next.active)) next.active = null;
      for (const fid of Object.keys(next.views)) {
        if (!live2.has(fid)) delete next.views[fid];
      }
      return put(sessionKey(pid), next);
    }
    function readCache(fid, pid) {
      const d = store3.get(cacheKey(pid || projectId(), fid));
      return d && typeof d === "object" ? d : null;
    }
    function writeCache(fid, data, pid) {
      const key = cacheKey(pid || projectId(), fid);
      if (data == null) return store3.remove(key);
      return store3.set(key, data);
    }
    function readConflict(fid, pid) {
      return normalizeConflict(store3.get(conflictKey(pid || projectId(), fid)));
    }
    function writeConflict(fid, conflict, pid) {
      return store3.set(conflictKey(pid || projectId(), fid), conflict);
    }
    function removeConflict(fid, pid) {
      return store3.remove(conflictKey(pid || projectId(), fid));
    }
    function listConflicts() {
      const out = [];
      for (const p of peekVisible()) {
        const prefix = projectPrefix(p.id) + "conflict/";
        const keys = store3.keys(prefix);
        if (!keys.length) continue;
        const names = new Map(peekTree(p.id).files.map((f) => [f.id, f.name]));
        for (const key of keys) {
          const fid = key.slice(prefix.length);
          const rec = normalizeConflict(store3.get(key));
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
      const meta = normalizeMeta(pid, store3.get(metaKey(pid)));
      if (!meta) return null;
      const tree = copyTree(peekTree(pid));
      const texts = {};
      for (const f of tree.files) texts[f.id] = getText(f.id, pid);
      const conflicted = /* @__PURE__ */ new Set();
      const prefix = projectPrefix(pid) + "conflict/";
      for (const key of store3.keys(prefix)) conflicted.add(key.slice(prefix.length));
      return { meta, tree, texts, conflicted };
    }
    function applyProject(pid, next, opts2) {
      const o = opts2 || {};
      const at = now();
      const before = normalizeMeta(pid, store3.get(metaKey(pid)));
      const prev = before ? peekTree(pid) : emptyTree();
      for (const c of o.conflicts || []) {
        const rec = { base: c.base, mine: c.mine, theirs: c.theirs, at, source: "device" };
        if (!store3.set(conflictKey(pid, c.id), rec).ok) return false;
      }
      for (const f of next.files) {
        const key = fileKey(pid, f.id);
        if (before && store3.get(key) !== void 0 && getText(f.id, pid) === f.text) continue;
        if (!store3.applyRemote(key, { text: f.text, via: "sync" }, at).ok) return false;
      }
      const tree = normalizeTree({
        files: next.files.map((f) => ({ id: f.id, name: f.path })),
        folders: next.folders,
        suites: next.suites
      });
      if (!before || !sameTree(tree, prev)) {
        if (!store3.applyRemote(treeKey(pid), tree, at).ok) return false;
      }
      const meta = {
        name: cleanName(next.name),
        createdAt: next.createdAt || (before ? before.createdAt : at),
        owner: before ? before.owner : o.owner || null
      };
      if (!before || before.name !== meta.name || before.createdAt !== meta.createdAt) {
        if (!store3.applyRemote(metaKey(pid), metaRecord(meta), at).ok) return false;
      }
      const keep = new Set(next.files.map((f) => f.id));
      for (const f of prev.files) {
        if (keep.has(f.id)) continue;
        store3.applyRemote(fileKey(pid, f.id), null);
        store3.remove(cacheKey(pid, f.id));
        store3.remove(conflictKey(pid, f.id));
      }
      return true;
    }
    function forgetProject(pid) {
      store3.applyRemote(metaKey(pid), null);
      store3.removeAll(projectPrefix(pid));
      if (pinned === pid) pinned = null;
    }
    function projectStats(pid) {
      const tree = peekTree(pid);
      let size = 0;
      let editedAt = store3.at(metaKey(pid));
      editedAt = Math.max(editedAt, store3.at(treeKey(pid)));
      for (const f of tree.files) {
        size += getText(f.id, pid).length;
        editedAt = Math.max(editedAt, store3.at(fileKey(pid, f.id)));
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
      return store3.subscribe((evt) => {
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
      pinProject,
      projectInUse,
      lastProject,
      visibleProjects,
      removeProject,
      setActiveProject,
      createProject,
      renameProject: renameProject2,
      deleteProject: deleteProject2,
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
      resumeFor,
      clearResume,
      isBlankProject,
      claimProject,
      removeAccountProjects,
      leaveAccount,
      finishSignOut,
      releaseAccount,
      noteSignedOut,
      takeSignedOutNote,
      ownerLeft,
      keepAccountProjects,
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
    var settings2 = deps.settings;
    function dirOf2(name) {
      var i = String(name || "").lastIndexOf("/");
      return i === -1 ? "" : name.slice(0, i);
    }
    function notifyProjectTreeChanged(kind) {
      var g20 = typeof window !== "undefined" ? window : null;
      if (g20 && typeof g20.dispatchEvent === "function") {
        g20.dispatchEvent(new CustomEvent("beljar:project-tree-changed", { detail: { kind } }));
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
      var list3 = readEmptyFolders();
      if (list3.indexOf(p) !== -1) return;
      list3.push(p);
      list3.sort();
      writeEmptyFolders(list3);
      notifyProjectTreeChanged("folder-add");
    }
    function removeEmptyFolder(path) {
      var p = String(path || "");
      var list3 = readEmptyFolders();
      var next = list3.filter(function(x) {
        return x !== p;
      });
      if (next.length === list3.length) return;
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
      var list3 = readEmptyFolders();
      var kept = list3.filter(function(x) {
        return x !== p && x.indexOf(p + "/") !== 0;
      });
      if (kept.length !== list3.length) {
        writeEmptyFolders(kept);
        notifyProjectTreeChanged("folder-prune");
      }
    }
    function renameEmptyFolderPrefix(from, to) {
      var list3 = readEmptyFolders();
      var changed = false;
      for (var i = 0; i < list3.length; i++) {
        var p = list3[i];
        if (p === from || p.indexOf(from + "/") === 0) {
          list3[i] = to ? to + p.slice(from.length) : p.slice(from.length + 1);
          changed = true;
        }
      }
      if (changed) {
        list3 = list3.filter(function(x) {
          return x;
        });
        list3.sort();
        writeEmptyFolders(list3);
        notifyProjectTreeChanged("folder-rename");
      }
    }
    function pruneEmptyFoldersForFile(filePath) {
      var name = String(filePath || "");
      if (!name) return;
      var list3 = readEmptyFolders();
      var next = list3.filter(function(ef) {
        return name !== ef && name.indexOf(ef + "/") !== 0;
      });
      if (next.length !== list3.length) {
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
      var seen2 = {};
      for (var i = 0; i < moves.length; i++) {
        var from = moves[i].from;
        if (!from || seen2[from]) continue;
        seen2[from] = true;
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
      var open6 = work2.peekSession().open;
      if (open6 === null) {
        var active = getActiveFileId();
        return active ? [active] : [];
      }
      var valid = {};
      for (var i = 0; i < files2.length; i++) valid[files2[i].id] = true;
      return open6.filter(function(id) {
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
        var list3 = normalizeActiveCfgList(map[keys[i]]);
        if (list3.length) out[keys[i]] = list3;
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
      var list3 = getActiveCfgsForDir(dir);
      return list3.length ? list3[0] : null;
    }
    function setActiveCfgsForDir(dir, paths) {
      var map = readActiveCfgByDir();
      var d = dir != null ? String(dir) : "";
      var list3 = normalizeActiveCfgList(paths);
      if (list3.length) map[d] = list3;
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
      var list3 = getActiveCfgsForDir(dir);
      for (var i = 0; i < list3.length; i++) {
        if (list3[i] === trimmed) return;
      }
      list3.push(trimmed);
      setActiveCfgsForDir(dir, list3);
    }
    function removeActiveCfgForDir(dir, path) {
      var trimmed = String(path != null ? path : "").trim();
      if (!trimmed) return;
      var list3 = getActiveCfgsForDir(dir);
      var next = [];
      for (var i = 0; i < list3.length; i++) {
        if (list3[i] !== trimmed) next.push(list3[i]);
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
      if (settings2.get("aliasActivation") !== "greedy") return s;
      if (!isAliasExpandablePath(fileName)) return s;
      if (typeof BelEditor !== "undefined" && typeof BelEditor.expandBelAliases === "function") {
        return BelEditor.expandBelAliases(s);
      }
      return s;
    }
    function expandAliasesInAllFiles() {
      if (settings2.get("aliasActivation") !== "greedy") return 0;
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
      var list3 = entries || [];
      for (var j = 0; j < list3.length; j++) {
        var name = String(list3[j].name || "untitled.bel");
        var id = work2.newFileId();
        work2.setText(id, expandAliasesForStorage(list3[j].text, name));
        files2.push({ id, name });
      }
      work2.writeTree({
        files: files2,
        folders: [],
        suites: normalizeActiveCfgByDir(options.activeCfgByDir)
      });
      var activeId2 = files2.length ? files2[0].id : null;
      work2.updateSession(function(s) {
        s.active = activeId2;
        s.open = activeId2 ? [activeId2] : [];
        s.views = {};
      });
      if (options.projectName) setProjectName(options.projectName);
      return { files: listFiles(), activeId: activeId2 };
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
        removeActiveCfgForDir(dirOf2(deletedName), deletedName);
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
    function isCfgEntryToken2(text) {
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
      return t && t.charAt(0) !== "%" && isCfgEntryToken2(t);
    }
    function cfgTextForRewrite(fileId) {
      var g20 = typeof window !== "undefined" ? window : null;
      if (g20) {
        var ed = g20.CurrentEditor;
        if (fileId === getActiveFileId() && ed && typeof ed.getValue === "function") {
          return String(ed.getValue() ?? "");
        }
      }
      return getFileText(fileId);
    }
    function notifyCfgRewritten(fileIds) {
      if (!fileIds.length) return;
      var g20 = typeof window !== "undefined" ? window : null;
      if (g20 && typeof g20.dispatchEvent === "function") {
        g20.dispatchEvent(new CustomEvent("beljar:cfg-rewritten", { detail: { fileIds } }));
      }
    }
    function rewriteCfgBody(text, cfgDir, oldName, newName) {
      var lines = String(text == null ? "" : text).split("\n");
      var out = [];
      var changed = false;
      var oldDir = dirOf2(oldName);
      var newDir = newName != null ? dirOf2(newName) : null;
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
      if (!settings2.get("cfgAutoSync")) return [];
      var files2 = listFiles();
      var updatedIds = [];
      for (var i = 0; i < files2.length; i++) {
        var fn = files2[i].name;
        if (!/\.cfg$/i.test(fn)) continue;
        var cfgDir = dirOf2(fn);
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
        if (!isCfgEntryToken2(t)) continue;
        if (resolveCfgEntryPath(cfgDir, t) === fileName) return true;
      }
      return false;
    }
    function addEntryToCfg(cfgPath, fileName) {
      var cfg = cfgFileByPath(cfgPath);
      if (!cfg) return false;
      var dir = dirOf2(cfgPath);
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
      var dir = dirOf2(cfgPath);
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
      var updated = rewriteCfgBody(getFileText(cfg.id), dirOf2(cfgPath), fileName, null);
      if (updated == null) return false;
      setFileText(cfg.id, updated);
      return true;
    }
    function moveEntryInCfg(cfgPath, fileName, delta) {
      var cfg = cfgFileByPath(cfgPath);
      if (!cfg) return false;
      var dir = dirOf2(cfgPath);
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
    var settings2 = deps.settings;
    var files2 = deps.files || null;
    var open6 = /* @__PURE__ */ new Set();
    work2.onFileChange(function(e) {
      open6.forEach(function(doc2) {
        doc2.noteFileChange(e);
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
      var state2 = loaded.state;
      var base = loaded.base;
      var conflicted = loaded.conflicted;
      var saveTimer = null;
      var providers2 = null;
      var reconciling = false;
      var reconcileQueued = false;
      var savedView = JSON.stringify(state2.editor.local);
      var savedSemantic = JSON.stringify(state2.semantic);
      function collectSemantic() {
        if (!providers2 || typeof providers2.getSemantic !== "function") return state2.semantic;
        var exported = providers2.getSemantic();
        if (!exported) return state2.semantic;
        var text = state2.editor.text;
        var docFp = typeof providers2.getDocFp === "function" ? providers2.getDocFp(text) : documentFingerprint(text);
        var belugaBuild = typeof providers2.getBelugaBuild === "function" ? providers2.getBelugaBuild() : settings2.get("belugaMode");
        var scopeKey = typeof exported.scopeKey === "string" ? exported.scopeKey : typeof providers2.getScopeKey === "function" ? providers2.getScopeKey() : "";
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
        if (providers2 && typeof providers2.getViewport === "function") {
          return normalizeView(providers2.getViewport());
        }
        return state2.editor.local || {};
      }
      function collectText() {
        if (providers2 && typeof providers2.getText === "function") {
          try {
            var live2 = providers2.getText();
            if (live2 != null) return String(live2);
          } catch (_) {
          }
        }
        return state2.editor.text;
      }
      function peekText() {
        var read2 = providers2 && (typeof providers2.peekText === "function" ? providers2.peekText : typeof providers2.getText === "function" ? providers2.getText : null);
        if (read2) {
          try {
            var t = read2();
            if (t != null) return String(t);
          } catch (_) {
          }
        }
        return state2.editor.text;
      }
      function canShow() {
        return !providers2 || typeof providers2.applyExternalText === "function";
      }
      function show3(text) {
        state2.editor.text = text;
        if (providers2 && typeof providers2.applyExternalText === "function") providers2.applyExternalText(text);
      }
      function announceConflict(source) {
        var g20 = typeof window !== "undefined" ? window : null;
        if (g20 && typeof g20.dispatchEvent === "function" && typeof CustomEvent === "function") {
          g20.dispatchEvent(new CustomEvent("beljar:text-conflict", { detail: { fileId: documentId, source } }));
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
            show3(stored);
          } else {
            var m = merge3(base, mine, stored);
            if (m.ok && canShow()) {
              base = stored;
              show3(m.text);
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
        state2.editor.text = collectText();
        state2.editor.local = collectView();
        state2.semantic = collectSemantic();
        if (!exists) return;
        if (conflicted) {
          var rec = work2.readConflict(documentId);
          if (rec && rec.mine !== state2.editor.text) {
            rec.mine = state2.editor.text;
            work2.writeConflict(documentId, rec);
          }
        } else if (state2.editor.text !== base) {
          if (work2.setText(documentId, state2.editor.text).ok) base = state2.editor.text;
        }
        var view = JSON.stringify(state2.editor.local);
        if (view !== savedView) {
          var local = state2.editor.local;
          if (work2.updateSession(function(s) {
            s.views[documentId] = local;
          }).ok) savedView = view;
        }
        var semantic = JSON.stringify(state2.semantic);
        if (semantic !== savedSemantic) {
          if (work2.writeCache(documentId, state2.semantic).ok) savedSemantic = semantic;
        }
      }
      function scheduleSave() {
        clearTimeout(saveTimer);
        var delay = opts.debounceMs != null ? opts.debounceMs : settings2.get("autosaveDelay");
        saveTimer = globalThis.setTimeout(persistNow, delay);
      }
      function scheduleEditorPersist(text) {
        if (text != null) state2.editor.text = String(text);
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
        state2.editor.text = String(text != null ? text : "");
        if (!conflicted && work2.getText(documentId) === state2.editor.text) base = state2.editor.text;
      }
      function hasPendingSave() {
        return saveTimer != null;
      }
      function flushCheckpointIfDirty() {
        if (saveTimer != null) persistNow();
      }
      function getInitialCheckpoint() {
        return JSON.parse(JSON.stringify(state2));
      }
      function setCheckpointProviders(next) {
        providers2 = next || null;
      }
      function switchFile(newId3) {
        if (!newId3) return null;
        persistNow();
        providers2 = null;
        documentId = newId3;
        var next = load(documentId);
        state2 = next.state;
        base = next.base;
        conflicted = next.conflicted;
        savedView = JSON.stringify(state2.editor.local);
        savedSemantic = JSON.stringify(state2.semantic);
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
          show3(theirs);
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
        state2.editor.text = mine;
        conflicted = false;
        work2.removeConflict(documentId);
        return { ok: true, copyId };
      }
      var handle = { noteFileChange, flushIfDirty: flushCheckpointIfDirty };
      open6.add(handle);
      return {
        getEditorText: function() {
          return state2.editor.text;
        },
        getEditorLocal: function() {
          return normalizeView(state2.editor.local);
        },
        getSemanticCheckpoint: function() {
          return state2.semantic ? JSON.parse(JSON.stringify(state2.semantic)) : null;
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
          open6.delete(handle);
        }
      };
    }
    function flushPending() {
      open6.forEach(function(doc2) {
        try {
          if (doc2.flushIfDirty) doc2.flushIfDirty();
        } catch (_) {
        }
      });
    }
    return { createPersist, flushPending };
  }

  // js/persist/device-records.mjs
  var TAB_PREFIX = "beljar/tabs/";
  var SIDE_PANEL_IDS = ["explorer", "inspector", "library", "harpoon"];
  function stringList3(raw) {
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string" && x) : [];
  }
  function create2(deps) {
    const { store: store3, tabStore: tabStore2, work: work2, settings: settings2 } = deps;
    function storeFor(mode) {
      if (mode === "local") return store3;
      if (mode === "session") return tabStore2;
      return null;
    }
    function followSetting(settingId2, keysIn) {
      let last = settings2.get(settingId2);
      settings2.subscribe((e) => {
        if (e.ids.indexOf(settingId2) === -1) return;
        const prev = last;
        const next = settings2.get(settingId2);
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
    const replStore = () => storeFor(settings2.get("replHistoryPersist"));
    followSetting("replHistoryPersist", (s) => {
      const keys = s.keys("beljar/p/").filter((k) => k.endsWith("/repl"));
      if (s.get(REPL_TRANSCRIPT_KEY) !== void 0) keys.push(REPL_TRANSCRIPT_KEY);
      if (s.get(REPL_COMMANDS_KEY) !== void 0) keys.push(REPL_COMMANDS_KEY);
      return keys;
    });
    function asRepl(d) {
      if (!d || typeof d !== "object") return null;
      const commands = Array.isArray(d.commands) ? d.commands.filter((x) => typeof x === "string") : [];
      const html = typeof d.html === "string" ? d.html : "";
      if (!html && !commands.length) return null;
      return {
        html,
        scrollTop: typeof d.scrollTop === "number" ? d.scrollTop : 0,
        savedAt: typeof d.savedAt === "number" ? d.savedAt : 0,
        commands
      };
    }
    function adoptShared(s, key) {
      const transcript = s.get(REPL_TRANSCRIPT_KEY);
      const commands = s.get(REPL_COMMANDS_KEY);
      const html = transcript && typeof transcript === "object" && typeof transcript.html === "string" ? transcript.html : "";
      const list3 = Array.isArray(commands) ? commands.filter((x) => typeof x === "string") : [];
      if (!html && !list3.length) {
        s.remove(REPL_TRANSCRIPT_KEY);
        s.remove(REPL_COMMANDS_KEY);
        return null;
      }
      const rec = {
        html,
        scrollTop: transcript && typeof transcript.scrollTop === "number" ? transcript.scrollTop : 0,
        savedAt: transcript && typeof transcript.savedAt === "number" ? transcript.savedAt : Date.now(),
        commands: list3
      };
      if (!s.set(key, rec).ok) return rec;
      s.remove(REPL_TRANSCRIPT_KEY);
      s.remove(REPL_COMMANDS_KEY);
      return rec;
    }
    function clampCommands(list3) {
      const arr = Array.isArray(list3) ? list3.filter((x) => typeof x === "string") : [];
      const cap = settings2.get("replHistoryCap");
      return arr.length > cap ? arr.slice(arr.length - cap) : arr;
    }
    function readRepl() {
      const s = replStore();
      if (!s) return null;
      const key = replKey(work2.projectId());
      const own = asRepl(s.get(key));
      if (own) return own;
      if (s.get(REPL_TRANSCRIPT_KEY) === void 0 && s.get(REPL_COMMANDS_KEY) === void 0) return null;
      return adoptShared(s, key);
    }
    function writeRepl(rec) {
      const s = replStore();
      if (!s) return;
      const key = replKey(work2.projectId());
      const html = rec && typeof rec.html === "string" ? rec.html : "";
      const commands = clampCommands(rec && rec.commands);
      if (!html && !commands.length) {
        s.remove(key);
        return;
      }
      s.set(key, {
        html,
        scrollTop: rec && typeof rec.scrollTop === "number" ? rec.scrollTop : 0,
        savedAt: rec && typeof rec.savedAt === "number" ? rec.savedAt : Date.now(),
        commands
      });
    }
    function readReplTranscript() {
      const rec = readRepl();
      if (!rec || !rec.html) return null;
      return { html: rec.html, scrollTop: rec.scrollTop, savedAt: rec.savedAt };
    }
    function writeReplTranscript(snap) {
      if (!replStore()) return;
      const cur = readRepl() || { html: "", scrollTop: 0, savedAt: 0, commands: [] };
      if (!snap || typeof snap.html !== "string" || !snap.html) {
        cur.html = "";
        cur.scrollTop = 0;
        cur.savedAt = 0;
      } else {
        cur.html = snap.html;
        cur.scrollTop = typeof snap.scrollTop === "number" ? snap.scrollTop : 0;
        cur.savedAt = typeof snap.savedAt === "number" ? snap.savedAt : Date.now();
      }
      writeRepl(cur);
    }
    function readReplCommands() {
      const rec = readRepl();
      return rec ? clampCommands(rec.commands) : [];
    }
    function writeReplCommands(list3) {
      if (!replStore()) return;
      const cur = readRepl() || { html: "", scrollTop: 0, savedAt: 0, commands: [] };
      cur.commands = clampCommands(list3);
      writeRepl(cur);
    }
    const foldStore = () => storeFor(settings2.get("editorFoldPersist"));
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
      const live2 = new Set(work2.peekTree().files.map((f) => f.id));
      const next = {};
      if (cur && typeof cur === "object") {
        for (const id of Object.keys(cur)) if (live2.has(id)) next[id] = cur[id];
      }
      const clean = stringList3(keys);
      if (clean.length && live2.has(fid)) next[fid] = clean;
      else delete next[fid];
      if (Object.keys(next).length) s.set(key, next);
      else s.remove(key);
    }
    function readNotifications() {
      const d = store3.get(NOTIFICATIONS_KEY);
      return Array.isArray(d) ? d : [];
    }
    function writeNotifications(items) {
      const list3 = Array.isArray(items) ? items : [];
      if (list3.length) store3.set(NOTIFICATIONS_KEY, list3);
      else store3.remove(NOTIFICATIONS_KEY);
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
      store3.set(tabMessageKey(kind), msg);
    }
    function onTabMessage(fn) {
      return store3.subscribe((e) => {
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
  var QUOTA = { projects: 1e3, textBytes: 1024 * 1024 * 1024 };
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
  function sha256Sync(text) {
    const bytes = new TextEncoder().encode(String(text));
    const n = bytes.length;
    const words = new Uint32Array(n + 9 + 63 >> 6 << 4);
    for (let i = 0; i < n; i++) words[i >> 2] |= bytes[i] << 24 - (i & 3) * 8;
    words[n >> 2] |= 128 << 24 - (n & 3) * 8;
    words[words.length - 1] = n * 8;
    words[words.length - 2] = Math.floor(n / 536870912);
    const h = new Uint32Array(SHA_INIT);
    const w = new Uint32Array(64);
    for (let off = 0; off < words.length; off += 16) {
      for (let t = 0; t < 16; t++) w[t] = words[off + t];
      for (let t = 16; t < 64; t++) {
        const x = w[t - 15];
        const y = w[t - 2];
        const s0 = (x >>> 7 | x << 25) ^ (x >>> 18 | x << 14) ^ x >>> 3;
        const s1 = (y >>> 17 | y << 15) ^ (y >>> 19 | y << 13) ^ y >>> 10;
        w[t] = w[t - 16] + s0 + w[t - 7] + s1 | 0;
      }
      let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g20 = h[6], k = h[7];
      for (let t = 0; t < 64; t++) {
        const S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
        const t1 = k + S1 + (e & f ^ ~e & g20) + SHA_K[t] + w[t] | 0;
        const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
        const t2 = S0 + (a & b ^ a & c ^ b & c) | 0;
        k = g20;
        g20 = f;
        f = e;
        e = d + t1 | 0;
        d = c;
        c = b;
        b = a;
        a = t1 + t2 | 0;
      }
      h[0] += a;
      h[1] += b;
      h[2] += c;
      h[3] += d;
      h[4] += e;
      h[5] += f;
      h[6] += g20;
      h[7] += k;
    }
    let s = "";
    for (let i = 0; i < 8; i++) s += h[i].toString(16).padStart(8, "0");
    return s;
  }
  var SHA_INIT = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
  var SHA_K = new Uint32Array([
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ]);
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
        const list3 = stringList4(raw.suites[dir]);
        if (list3.length) suites[dir] = list3;
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
    const notices2 = [];
    const copies = [];
    function need(hash) {
      const t = a.text(hash);
      if (t === void 0) needs.add(hash);
      return t;
    }
    const changedHere = (id, m, b) => conflicted.has(id) || m.hash !== b.hash || m.path !== b.path;
    const changedThere = (t, b) => t.hash !== b.hash || t.path !== b.path;
    const order2 = [...T.keys()];
    for (const id of M.keys()) if (!T.has(id)) order2.push(id);
    for (const id of order2) {
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
          const r = baseText === null ? { ok: false } : merge3(baseText, mine, theirs);
          if (r.ok && !a.askAll) {
            out.push({ id, path, text: r.text });
          } else {
            out.push({ id, path, text: theirs });
            if (conflicted.has(id)) {
              copies.push({ of: id, text: mine });
            } else {
              conflicts.push({ id, base: baseText === null ? "" : baseText, mine, theirs });
              notices2.push({ kind: "conflict", path });
            }
          }
        }
      } else if (m) {
        if (!b) {
          out.push({ id, path: m.path, text: a.mineTexts[id] });
        } else if (changedHere(id, m, b)) {
          out.push({ id, path: m.path, text: a.mineTexts[id] });
          notices2.push({ kind: "kept", path: m.path });
        }
      } else if (t) {
        if (!b || changedThere(t, b)) {
          const theirs = need(t.hash);
          if (theirs === void 0) continue;
          out.push({ id, path: t.path, text: theirs });
          if (b) notices2.push({ kind: "restored", path: t.path });
        }
      }
    }
    if (needs.size) return { needs: [...needs] };
    for (const c of copies) {
      const at = out.findIndex((f) => f.id === c.of);
      out.splice(at + 1, 0, { id: a.newFileId(), path: out[at].path, text: c.text, copyOf: c.of });
    }
    const taken = new Set(out.map((f) => f.path));
    const seen2 = /* @__PURE__ */ new Set();
    for (const f of out) {
      if (seen2.has(f.path)) {
        const from = f.path;
        f.path = conflictedCopyName(from, taken);
        taken.add(f.path);
        notices2.push({ kind: f.copyOf ? "copied" : "renamed", path: f.path, from });
      }
      seen2.add(f.path);
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
      notices: notices2
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
  function readRecord(store3, account) {
    const r = store3.get(SETTINGS_SYNC_KEY);
    if (!r || typeof r !== "object" || r.account !== account) return null;
    const pending2 = r.pending && typeof r.pending === "object" && typeof r.pending.id === "string" ? { id: r.pending.id, base: Number(r.pending.base) || 0, values: cleanSyncedValues(r.pending.values) } : null;
    return {
      account,
      version: Number.isInteger(r.version) && r.version > 0 ? r.version : 0,
      values: cleanSyncedValues(r.values),
      pending: pending2
    };
  }
  function createSettingsSync(o) {
    const { store: store3, account } = o;
    const attempts = o.attempts || 8;
    function writeRecord(rec) {
      const res = store3.set(SETTINGS_SYNC_KEY, rec);
      if (!res.ok) throw Object.assign(new Error("sync: could not record the settings sync"), { storage: res.error });
    }
    function local() {
      const rec = store3.get(SETTINGS_KEY);
      return cleanSyncedValues(rec && rec.values);
    }
    function apply2(values) {
      const rec = store3.get(SETTINGS_KEY);
      const cur = rec && rec.values && typeof rec.values === "object" ? rec.values : {};
      const next = {};
      for (const id of Object.keys(cur)) {
        const row = settingRow(id);
        if (row && !isSyncedSetting(row)) next[id] = cur[id];
      }
      Object.assign(next, values);
      const res = store3.applyRemote(SETTINGS_KEY, { values: next });
      if (!res.ok) throw Object.assign(new Error("sync: could not apply synced settings"), { storage: res.error });
    }
    function normalizeHead(raw) {
      if (raw == null) return null;
      if (typeof raw !== "object" || !Number.isInteger(raw.version) || raw.version < 1) {
        throw new Error("sync: the server sent settings this version cannot read");
      }
      return { version: raw.version, values: cleanSyncedValues(raw.values) };
    }
    async function sync(hint) {
      if (!o.settings.get("syncSettings")) return { status: "off" };
      const told = hint && Number.isInteger(hint.head) ? hint.head : null;
      if (told !== null) {
        const rec = readRecord(store3, account);
        const mine = local();
        if (rec && !rec.pending && rec.version === told && sameValues(mine, rec.values)) return { status: "clean" };
        if (!rec && told === 0 && !Object.keys(mine).length) return { status: "clean" };
      }
      for (let i = 0; i < attempts; i++) {
        const rec = readRecord(store3, account);
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
          const pending2 = { id: o.commitId(), base: head ? head.version : 0, values: mine };
          writeRecord({ ...kept, pending: pending2 });
          const res = await o.call("commitSettings", pending2);
          if (res && res.ok) {
            writeRecord({ account, version: res.version, values: mine, pending: null });
            return { status: "pushed", version: res.version };
          }
          writeRecord({ ...kept, pending: null });
          continue;
        }
        const merged = mergeSettingValues(rec ? rec.values : {}, mine, head.values);
        if (!sameValues(merged, mine)) apply2(merged);
        writeRecord({ account, version: head.version, values: head.values, pending: null });
      }
      return { status: "busy" };
    }
    return { sync };
  }

  // js/persist/sync/engine.mjs
  var ATTEMPTS = 8;
  var CARRY_TEXTS = 200;
  var CARRY_BYTES = 512 * 1024;
  var utf8Bytes2 = (text) => new TextEncoder().encode(String(text)).length;
  function unreachable(method, err) {
    const e = new Error("sync: " + method + " could not reach the server" + (err && err.message ? " (" + err.message + ")" : ""));
    e.offline = true;
    e.stopsRound = true;
    e.cause = err;
    return e;
  }
  function refusedByServer(method, err) {
    const e = new Error("sync: the server answered " + err.status + " to " + method);
    e.status = err.status;
    e.stopsRound = true;
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
    let version2 = Number.isInteger(raw.version) && raw.version > 0 ? raw.version : 0;
    const manifest = version2 && raw.manifest ? normalizeManifest(raw.manifest) : null;
    if (!manifest) version2 = 0;
    let pending2 = null;
    if (raw.pending && typeof raw.pending === "object" && typeof raw.pending.id === "string" && raw.pending.id) {
      const m = normalizeManifest(raw.pending.manifest);
      const base = Number.isInteger(raw.pending.base) && raw.pending.base >= 0 ? raw.pending.base : -1;
      if (m && base >= 0) {
        pending2 = { id: raw.pending.id, base, manifest: m };
        const t = raw.pending.texts;
        if (t && typeof t === "object" && !Array.isArray(t) && Object.entries(t).every(([h, x]) => isHash(h) && typeof x === "string") && Object.keys(t).length) {
          pending2.texts = Object.assign({}, t);
        }
      }
    }
    return { version: version2, manifest, pending: pending2 };
  }
  function readHead(raw) {
    if (raw == null) return null;
    if (typeof raw !== "object" || !Number.isInteger(raw.version) || raw.version < 1) throw bad("the server sent a head this version cannot read");
    const deleted = raw.deleted === true;
    const manifest = deleted ? null : normalizeManifest(raw.manifest);
    if (!deleted && !manifest) throw bad("the server sent a manifest this version cannot read");
    return { version: raw.version, deleted, manifest, commit: typeof raw.commit === "string" ? raw.commit : null };
  }
  function readList(raw) {
    if (Array.isArray(raw)) return { heads: readHeads(raw), settings: null };
    if (!raw || !Array.isArray(raw.projects)) throw bad("the server sent a project list this version cannot read");
    return { heads: readHeads(raw.projects), settings: Number.isInteger(raw.settings) && raw.settings >= 0 ? raw.settings : null };
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
    const { store: store3, work: work2, transport, account } = opts;
    if (!account) throw new Error("sync: an engine syncs one account; none was given");
    const hash = opts.hash || sha256;
    const hashSync = opts.hashSync || sha256Sync;
    const notify = opts.notify || (() => {
    });
    const commitId = opts.commitId || (() => newId("c"));
    const trace = opts.trace || (() => {
    });
    const own = opts.own || ((fn) => fn());
    const applyProject = (pid, next, o) => own(() => work2.applyProject(pid, next, o));
    const forgetProject = (pid) => own(() => work2.forgetProject(pid));
    const dropTombstone = (pid) => own(() => work2.dropTombstone(pid));
    const removeConflict = (fid, pid) => own(() => work2.removeConflict(fid, pid));
    function moved(pid, at) {
      trace({ kind: "moved", pid, at });
      return null;
    }
    const hashed = /* @__PURE__ */ new Map();
    async function call(method, ...args) {
      try {
        return await transport[method](...args);
      } catch (err) {
        throw err && Number.isInteger(err.status) ? refusedByServer(method, err) : unreachable(method, err);
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
    function hashFileSync(pid, fid, text) {
      const key = pid + "/" + fid;
      const known = hashed.get(key);
      if (known && known.text === text) return known.hash;
      const h = hashSync(text);
      hashed.set(key, { text, hash: h });
      return h;
    }
    function readRecord2(pid) {
      return normalizeRecord(store3.get(syncKey(pid)));
    }
    function writeRecord(pid, rec) {
      if (!store3.set(syncKey(pid), rec).ok) throw storageFailure("the sync record");
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
    function localSideSync(pid) {
      const snap = work2.snapshotProject(pid);
      if (!snap) return null;
      const hashes = {};
      for (const f of snap.tree.files) hashes[f.id] = hashFileSync(pid, f.id, snap.texts[f.id]);
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
    async function fetchSome(pid, wanted) {
      const got = /* @__PURE__ */ new Map();
      if (!wanted.length) return got;
      const res = await call("blobs", pid, wanted);
      for (const h of wanted) {
        const text = res && typeof res[h] === "string" ? res[h] : void 0;
        if (text === void 0) continue;
        if (await hash(text) !== h) throw bad("a file arrived damaged");
        got.set(h, text);
      }
      return got;
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
    function settle2(pid, kept, pending2, res) {
      if (res && res.ok && Number.isInteger(res.version) && res.version > 0) {
        writeRecord(pid, { version: res.version, manifest: pending2.manifest, pending: null });
        return true;
      }
      if (res && res.error) throw refused(res);
      writeRecord(pid, { version: kept.version, manifest: kept.manifest, pending: null });
      return false;
    }
    function freshTexts(local, rec) {
      const known = new Set(rec && rec.version && rec.manifest ? rec.manifest.files.map((f) => f.hash) : []);
      const out = {};
      for (const f of local.tree.files) {
        const h = local.hashes[f.id];
        if (!known.has(h)) out[h] = local.texts[f.id];
      }
      return out;
    }
    function tooMuchToCarry(texts) {
      const all = Object.values(texts);
      if (all.length > CARRY_TEXTS) return true;
      let size = 0;
      for (const t of all) if ((size += utf8Bytes2(t)) > CARRY_BYTES) return true;
      return false;
    }
    async function upload(pid, texts) {
      let batch = {};
      let count = 0;
      let size = 0;
      const send = async () => {
        if (!count) return;
        const res = await call("putBlobs", pid, batch);
        if (res && res.error) throw refused(res);
        if (!res || !res.ok) throw bad("the server did not take the files");
        batch = {};
        count = 0;
        size = 0;
      };
      for (const [h, t] of Object.entries(texts)) {
        const b = utf8Bytes2(t);
        if (count && (count >= CARRY_TEXTS || size + b > CARRY_BYTES)) await send();
        batch[h] = t;
        count += 1;
        size += b;
      }
      await send();
    }
    async function push2(pid, local, rec, base) {
      const texts = /* @__PURE__ */ new Map();
      for (const f of local.tree.files) texts.set(local.hashes[f.id], local.texts[f.id]);
      let carried = freshTexts(local, rec);
      if (tooMuchToCarry(carried)) {
        await upload(pid, carried);
        carried = {};
      }
      const still = work2.getProject(pid);
      if (!still || still.owner !== account) return moved(pid, "push") || false;
      const now = readRecord2(pid);
      if (now && now.pending || (now ? now.version : 0) !== (rec ? rec.version : 0)) return moved(pid, "pending") || false;
      const kept = { version: rec ? rec.version : 0, manifest: rec ? rec.manifest : null };
      const pending2 = { id: commitId(), base, manifest: local.manifest };
      if (Object.keys(carried).length) pending2.texts = carried;
      writeRecord(pid, { version: kept.version, manifest: kept.manifest, pending: pending2 });
      let res = await call("commit", pid, pending2);
      if (res && !res.ok && Array.isArray(res.missing) && res.missing.length) {
        const more = {};
        for (const h of res.missing) {
          if (!texts.has(h)) throw bad("the server asked for a file this version never named");
          more[h] = texts.get(h);
        }
        if (tooMuchToCarry(more)) {
          await upload(pid, more);
        } else {
          pending2.texts = Object.assign({}, pending2.texts || {}, more);
          writeRecord(pid, { version: kept.version, manifest: kept.manifest, pending: pending2 });
        }
        res = await call("commit", pid, pending2);
      }
      return settle2(pid, kept, pending2, res);
    }
    function flush(send, budget) {
      const sent = [];
      let left = budget == null ? Infinity : budget;
      const tombs = work2.readTombstones();
      const open6 = typeof work2.pinnedProject === "function" ? work2.pinnedProject() : null;
      const mine = work2.allProjects().filter((x) => x.owner === account && !tombs[x.id]);
      mine.sort((a, b) => a.id === open6 ? -1 : b.id === open6 ? 1 : 0);
      for (const { id: pid } of mine) {
        try {
          const rec = readRecord2(pid);
          if (rec && rec.pending) continue;
          const local = localSideSync(pid);
          if (!local || !local.manifest) continue;
          if (rec && rec.version && sameManifest(local.manifest, rec.manifest)) continue;
          const kept = { version: rec ? rec.version : 0, manifest: rec ? rec.manifest : null };
          const body = { id: commitId(), base: kept.version, manifest: local.manifest, texts: freshTexts(local, rec) };
          const size = utf8Bytes2(JSON.stringify({ args: [pid, body] }));
          if (size > left) continue;
          writeRecord(pid, { version: kept.version, manifest: kept.manifest, pending: body });
          left -= size;
          sent.push(pid);
          Promise.resolve(send(pid, body)).then((res) => {
            const now = readRecord2(pid);
            if (now && now.pending && now.pending.id === body.id) settle2(pid, kept, now.pending, res);
          }).catch(() => {
          });
        } catch (_) {
        }
      }
      return sent;
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
          newFileId: () => work2.newFileId(pid),
          // "Changed in two places: Ask about every file" (Settings > Account).
          askAll: !!(opts.settings && opts.settings.get("syncBothChanged") === "ask")
        });
        if (r.needs) {
          if (fetched) throw bad("a merge needed a file the server did not send");
          const got = await fetchSome(pid, r.needs);
          const named = new Set(theirs.files.map((f) => f.hash));
          for (const h of r.needs) {
            if (got.has(h)) texts.set(h, got.get(h));
            else if (named.has(h)) throw bad("the server is missing a file its version lists");
            else texts.set(h, null);
          }
          fetched = true;
          continue;
        }
        if (!unchangedSince(pid, local)) return moved(pid, "merge");
        if (!applyProject(pid, r.project, { conflicts: r.conflicts })) throw storageFailure("a merged project");
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
      if (!applyProject(pid, project, { owner: account })) throw storageFailure("a downloaded project");
      writeRecord(pid, { version: head.version, manifest: theirs, pending: null });
      return { status: "downloaded" };
    }
    async function localChanges() {
      const out = [];
      for (const p of work2.allProjects()) {
        if (p.owner !== account) continue;
        const local = await localSide(p.id);
        if (!local || !local.manifest) continue;
        const rec = readRecord2(p.id);
        const base = rec && rec.version ? rec.manifest : null;
        if (base && sameManifest(local.manifest, base)) continue;
        const before = new Map((base ? base.files : []).map((f) => [f.id, f]));
        const files2 = [];
        for (const f of local.manifest.files) {
          const b = before.get(f.id);
          before.delete(f.id);
          if (!b) files2.push({ fid: f.id, path: f.path, change: "added" });
          else if (b.hash !== f.hash) files2.push({ fid: f.id, path: f.path, change: "edited" });
          else if (b.path !== f.path) files2.push({ fid: f.id, path: f.path, change: "renamed" });
        }
        for (const [fid, b] of before) files2.push({ fid, path: b.path, change: "deleted" });
        out.push({
          pid: p.id,
          name: local.meta.name,
          isNew: !base,
          deleted: false,
          renamed: !!base && base.name !== local.meta.name,
          files: files2
        });
      }
      const tombs = work2.readTombstones();
      for (const pid of Object.keys(tombs).sort()) {
        if (tombs[pid].owner !== account) continue;
        out.push({ pid, name: tombs[pid].name, isNew: false, deleted: true, renamed: false, files: [] });
      }
      return out;
    }
    async function cloudSide(pid, fids = []) {
      const head = readHead(await call("head", pid));
      if (!head) return { state: "absent", name: null, texts: {} };
      if (head.deleted) return { state: "deleted", name: null, texts: {} };
      const byId2 = new Map(head.manifest.files.map((f) => [f.id, f]));
      const got = await fetchTexts(pid, [...new Set(fids.map((id) => byId2.get(id)).filter(Boolean).map((f) => f.hash))]);
      const texts = {};
      for (const id of fids) {
        const f = byId2.get(id);
        texts[id] = f ? got.get(f.hash) : null;
      }
      return { state: "present", name: head.manifest.name, texts };
    }
    async function useCloud(pid) {
      const head = readHead(await call("head", pid));
      if (!head) return false;
      if (head.deleted) {
        if (work2.readTombstones()[pid]) dropTombstone(pid);
        if (work2.snapshotProject(pid)) forgetProject(pid);
        return true;
      }
      const theirs = head.manifest;
      const got = await fetchTexts(pid, [...new Set(theirs.files.map((f) => f.hash))]);
      const project = {
        name: theirs.name,
        createdAt: theirs.createdAt,
        files: theirs.files.map((f) => ({ id: f.id, path: f.path, text: got.get(f.hash) })),
        folders: theirs.folders,
        suites: theirs.suites
      };
      const snap = work2.snapshotProject(pid);
      if (snap) for (const fid of snap.conflicted) removeConflict(fid, pid);
      if (work2.readTombstones()[pid]) dropTombstone(pid);
      if (!applyProject(pid, project, { owner: account })) throw storageFailure("the cloud\u2019s version of a project");
      writeRecord(pid, { version: head.version, manifest: theirs, pending: null });
      return true;
    }
    async function settleTombstone(pid, tomb, head) {
      if (!head || head.deleted) {
        dropTombstone(pid);
        return { status: "deleted" };
      }
      if (head.version === tomb.version || tomb.pending && head.commit === tomb.pending) {
        const res = await call("remove", pid, { id: commitId(), base: head.version });
        if (res && res.ok) {
          dropTombstone(pid);
          return { status: "deleted" };
        }
        if (res && res.error) throw refused(res);
        return null;
      }
      dropTombstone(pid);
      notify({ kind: "project-restored", pid, project: head.manifest.name });
      return null;
    }
    async function step(pid, hint) {
      const rec = readRecord2(pid);
      if (rec && rec.pending) {
        const res = await call("commit", pid, rec.pending);
        settle2(pid, rec, rec.pending, res);
        return null;
      }
      const tomb = work2.readTombstones()[pid];
      const local = await localSide(pid);
      if (local && local.meta.owner !== account) return { status: "not-ours" };
      if (local && !local.manifest) return { status: "error", message: "two files share a path" };
      if (hint && local && rec && rec.version && !tomb && !hint.deleted && hint.version === rec.version) {
        if (sameManifest(local.manifest, rec.manifest)) return { status: "clean" };
        return await push2(pid, local, rec, rec.version) ? { status: "pushed" } : null;
      }
      const head = readHead(await call("head", pid));
      if (!local) {
        if (tomb && tomb.owner === account) return settleTombstone(pid, tomb, head);
        if (!head || head.deleted) return { status: "absent" };
        return download(pid, head);
      }
      if (!head) {
        return await push2(pid, local, rec, 0) ? { status: "pushed" } : null;
      }
      const synced = rec && rec.version ? rec : null;
      if (head.deleted) {
        if (synced && sameManifest(local.manifest, synced.manifest) && !local.conflicted.size) {
          if (!unchangedSince(pid, local)) return moved(pid, "forget");
          forgetProject(pid);
          notify({ kind: "project-deleted", pid, project: local.meta.name });
          return { status: "forgot" };
        }
        if (!await push2(pid, local, rec, head.version)) return null;
        notify({ kind: "project-kept", pid, project: local.meta.name });
        return { status: "restored" };
      }
      if (synced && head.version === synced.version) {
        if (sameManifest(local.manifest, synced.manifest)) return { status: "clean" };
        return await push2(pid, local, rec, head.version) ? { status: "pushed" } : null;
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
      store: store3,
      settings: opts.settings,
      account,
      commitId,
      call
    });
    async function syncAll() {
      const list3 = readList(await call("heads", { settings: true }));
      const heads = list3.heads;
      const byId2 = new Map(heads.map((h) => [h.id, h]));
      const ids = /* @__PURE__ */ new Set();
      for (const p of work2.allProjects()) if (p.owner === account) ids.add(p.id);
      const tombs = work2.readTombstones();
      for (const pid of Object.keys(tombs)) if (tombs[pid].owner === account) ids.add(pid);
      for (const h of heads) if (!h.deleted) ids.add(h.id);
      const projects = {};
      for (const pid of [...ids].sort()) {
        try {
          projects[pid] = await syncProject(pid, byId2.get(pid) || null);
        } catch (err) {
          if (err && err.stopsRound) throw err;
          projects[pid] = { pid, status: "error", message: String(err && err.message || err), code: err && err.code || null };
        }
      }
      let settings2;
      try {
        settings2 = await settingsSync.sync({ head: list3.settings });
      } catch (err) {
        if (err && err.stopsRound) throw err;
        settings2 = { status: "error", message: String(err && err.message || err), code: err && err.code || null };
      }
      return { projects, settings: settings2 };
    }
    async function history(pid, o) {
      const list3 = await call("versions", pid, o || {});
      return Array.isArray(list3) ? list3 : [];
    }
    async function readVersion(pid, n) {
      const v = await call("version", pid, n);
      if (!v) return null;
      if (v.deleted) return { version: v.version, createdAt: v.createdAt, deleted: true, name: null, files: [], folders: [], suites: {} };
      const m = normalizeManifest(v.manifest);
      if (!m) throw bad("the server sent a version that is not one");
      const got = await fetchTexts(pid, [...new Set(m.files.map((f) => f.hash))]);
      return {
        version: v.version,
        createdAt: v.createdAt,
        deleted: false,
        name: m.name,
        files: m.files.map((f) => ({ id: f.id, path: f.path, text: got.get(f.hash) })),
        folders: m.folders,
        suites: m.suites
      };
    }
    async function restoreVersion2(pid, n) {
      const v = await readVersion(pid, n);
      if (!v || v.deleted) return { ok: false, error: "no-version" };
      const local = await localSide(pid);
      const rec = readRecord2(pid);
      if (!local || !rec || !rec.version || rec.pending || !sameManifest(local.manifest, rec.manifest)) return { ok: false, error: "unsynced" };
      if (local.conflicted && local.conflicted.size) return { ok: false, error: "review" };
      if (!unchangedSince(pid, local)) return { ok: false, error: "unsynced" };
      const next = { name: v.name, createdAt: local.meta.createdAt, files: v.files, folders: v.folders, suites: v.suites };
      if (!work2.applyProject(pid, next, { owner: account })) throw storageFailure("a restored version");
      return { ok: true };
    }
    return { account, syncAll, syncProject, syncSettings: settingsSync.sync, localChanges, cloudSide, useCloud, flush, history, readVersion, restoreVersion: restoreVersion2 };
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
    const visible2 = typeof o.visible === "function" ? o.visible : () => true;
    const listeners = /* @__PURE__ */ new Set();
    let status = { state: "waiting", leader: false, lastSync: 0, error: null, reason: null, pending: false, safe: false, held: false };
    let leader = false;
    let stopped = false;
    let running = null;
    let again = false;
    let timer = null;
    let firstChange = 0;
    let failures = 0;
    let dirty = false;
    let heard = false;
    let held = false;
    let release2 = null;
    let abort = null;
    let unsubscribe = null;
    function update2(patch) {
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
        if (!dirty && !failures && !visible2()) return;
        round();
      }, Math.max(0, ms));
    }
    function changed() {
      if (!leader || stopped) return;
      dirty = true;
      if (running) heard = true;
      if (!status.pending) update2({ pending: true });
      const t = now();
      if (!firstChange) firstChange = t;
      wakeIn(Math.min(quietMs, maxWaitMs - (t - firstChange)));
    }
    function problems(res) {
      const out = [];
      for (const r of Object.values(res.projects || {})) if (r.status === "error") out.push(r);
      if (res.settings && res.settings.status === "error") out.push(res.settings);
      return out;
    }
    function round() {
      if (!leader || stopped || held) return Promise.resolve(null);
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
      update2({ state: "syncing" });
      running = engine.syncAll().then((res) => {
        failures = 0;
        const errs = problems(res);
        if (errs.length && carried) dirty = true;
        update2({
          state: errs.length ? "error" : "idle",
          lastSync: now(),
          error: errs.length ? errs[0].message : null,
          reason: errs.length && errs[0].code ? "refused-" + errs[0].code : null,
          result: res,
          pending: dirty,
          safe: roundIsSafe(res)
        });
        return res;
      }, (err) => {
        failures += 1;
        if (carried) dirty = true;
        update2({
          state: err && err.offline ? "offline" : "error",
          error: String(err && err.message || err),
          reason: err && Number.isInteger(err.status) ? "status-" + err.status : null,
          pending: dirty,
          safe: false
        });
        return null;
      }).then((res) => {
        running = null;
        const timed = heard && !failures && timer != null;
        heard = false;
        if (stopped) return res;
        if (again) {
          again = false;
          round();
        } else if (!timed) {
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
          if (o.ignore && o.ignore(e)) return;
          if (e.cls === "work" || e.cls === "settings" || e.key === TOMBSTONES_KEY) changed();
        });
        const locks = o.locks;
        if (!locks || typeof locks.request !== "function") {
          update2({ state: "unsupported" });
          return;
        }
        abort = typeof AbortController === "function" ? new AbortController() : null;
        Promise.resolve(locks.request(SYNC_LOCK, abort ? { signal: abort.signal } : {}, () => {
          if (stopped) return void 0;
          leader = true;
          update2({ state: "idle", leader: true });
          round();
          return new Promise((resolve2) => {
            release2 = resolve2;
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
      /**
       * The page is going out of sight, and may be closing: what waits for the
       * quiet spell goes now, each project in one request `send` makes outlive
       * the page (engine.mjs `flush`). Only the tab that syncs, and never while
       * rounds are held for the person ("Back online: Ask me first"): what waits
       * then is theirs to look at first. Returns the projects sent.
       */
      flush(send, budget) {
        if (!leader || stopped || held || typeof engine.flush !== "function") return [];
        return engine.flush(send, budget);
      },
      status() {
        return status;
      },
      /**
       * No round runs until release(): the edits made offline wait for the person
       * to upload them, or take the cloud's instead (persist.mjs holds it when the
       * connection drops, with "Back online: Ask me first").
       */
      hold() {
        if (held) return;
        held = true;
        if (timer != null) {
          timers.clear(timer);
          timer = null;
        }
        update2({ held: true });
      },
      /** Let rounds run again, starting one now. */
      release() {
        if (!held) return Promise.resolve(null);
        held = false;
        if (leader && !stopped && !running) {
          status = Object.assign({}, status, { held: false });
          return round();
        }
        update2({ held: false });
        return round();
      },
      /** fn(status) on every change: { state, leader, lastSync, error, result }. */
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      /**
       * Stop, and resolve once a round in flight has finished: nothing sync does
       * lands after this resolves (signing out removes projects right after).
       *
       * `hold`: stop, but keep the lock until stop() is called again or the page
       * goes. Signing out stops this way: letting go at once handed the lock to
       * another tab, which began a round for an account whose session was ending
       * (every request of it refused). Held, no tab syncs until this one has
       * said, to all of them, that nobody is signed in.
       */
      stop(opts) {
        stopped = true;
        if (timer != null) {
          timers.clear(timer);
          timer = null;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        if (!(opts && opts.hold)) {
          if (abort) abort.abort();
          if (release2) {
            release2();
            release2 = null;
          }
        }
        leader = false;
        update2({ state: "stopped", leader: false });
        return Promise.resolve(running).then(() => void 0);
      }
    };
  }

  // js/persist/sync/sync-status.mjs
  var STATUS_MESSAGE = "sync-status";
  var ASK_MESSAGE = "sync-ask";
  function summarize({ account, runner, online, differs }) {
    const files2 = differs || [];
    if (!account) return { signedIn: false, state: files2.length ? "differs" : "off", lastSync: 0, error: null, reason: null, differs: files2 };
    const st = runner || {};
    let state2;
    if (files2.length) state2 = "differs";
    else if (online === false) state2 = "offline";
    else if (st.held) state2 = "held";
    else if (st.state === "offline") state2 = "offline";
    else if (st.state === "error") state2 = "error";
    else if (st.state === "syncing") state2 = "syncing";
    else if (st.pending) state2 = "pending";
    else if (st.lastSync) state2 = "synced";
    else state2 = "syncing";
    const failing2 = state2 === "error";
    return { signedIn: true, state: state2, lastSync: st.lastSync || 0, error: failing2 ? st.error || null : null, reason: failing2 ? st.reason || null : null, differs: files2 };
  }
  function createSyncStatus(o) {
    const now = o.now || (() => Date.now());
    const timers = o.timers || { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) };
    const online = o.online || (() => true);
    let seq2 = 0;
    const newId3 = o.newId || (() => now().toString(36) + "-" + ++seq2 + "-" + Math.random().toString(36).slice(2, 8));
    const listeners = /* @__PURE__ */ new Set();
    const asked2 = /* @__PURE__ */ new Map();
    let runner = null;
    let unsubscribeRunner = null;
    let local = null;
    let remote = null;
    let lastKey = "";
    const leading = () => !!(local && local.leader);
    const current = () => leading() ? local : remote || local;
    function summary2() {
      return summarize({ account: o.account(), runner: current(), online: online(), differs: o.conflicts() });
    }
    function emit2() {
      const s = summary2();
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
        reason: st.reason || null,
        safe: !!st.safe,
        held: !!st.held,
        at: now(),
        answered: answered || null
      });
    }
    o.tabs.on((kind, msg) => {
      if (!msg || typeof msg !== "object") return;
      if (kind === STATUS_MESSAGE) {
        remote = msg;
        if (msg.answered && asked2.has(msg.answered)) {
          const resolve2 = asked2.get(msg.answered);
          asked2.delete(msg.answered);
          resolve2({ ok: !!msg.safe, reason: msg.safe ? null : msg.state || "unsafe" });
        }
        emit2();
      } else if (kind === ASK_MESSAGE && leading() && runner) {
        if (msg.release) {
          runner.release().then(() => tell(runner.status(), msg.id));
        } else if (msg.round) {
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
          emit2();
          if (st.leader) tell(st, null);
        });
        o.tabs.post(ASK_MESSAGE, { id: newId3(), round: false, at: now() });
        emit2();
      },
      detach() {
        if (unsubscribeRunner) unsubscribeRunner();
        unsubscribeRunner = null;
        runner = null;
        local = null;
        remote = null;
        emit2();
      },
      summary: summary2,
      /** Something the summary reads changed (a conflict, the network, the account): tell whoever listens. */
      refresh: emit2,
      /** fn(summary) on every change; returns the unsubscribe. */
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      /**
       * Let held rounds run again (the person chose Upload): the syncing tab
       * releases its runner; any other asks it to. Resolves once it has.
       */
      release(timeoutMs = 15e3) {
        if (!runner) return Promise.resolve({ ok: false, reason: "not-syncing" });
        if (leading()) return runner.release().then(() => ({ ok: true, reason: null }));
        const id = newId3();
        return new Promise((resolve2) => {
          asked2.set(id, () => resolve2({ ok: true, reason: null }));
          o.tabs.post(ASK_MESSAGE, { id, release: true, at: now() });
          timers.set(() => {
            if (!asked2.has(id)) return;
            asked2.delete(id);
            resolve2({ ok: false, reason: "no-answer" });
          }, timeoutMs);
        });
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
        const id = newId3();
        return new Promise((resolve2) => {
          asked2.set(id, resolve2);
          o.tabs.post(ASK_MESSAGE, { id, round: true, at: now() });
          timers.set(() => {
            if (!asked2.has(id)) return;
            asked2.delete(id);
            resolve2({ ok: false, reason: "no-answer" });
          }, timeoutMs);
        });
      }
    };
  }

  // js/persist/sync/hold.mjs
  var HELD_ROW = "syncHeldFor";
  function createHoldPolicy(o) {
    const online = o.online || (() => true);
    let wasHeld = false;
    let checking = null;
    let stopped = false;
    const asking = () => o.settings.get("syncReconnect") === "ask";
    const heldHere = () => o.device.get(HELD_ROW) === String(o.account);
    const offline = (st) => st.state === "offline" || !online();
    function hold() {
      o.device.set(HELD_ROW, String(o.account));
      o.runner.hold();
    }
    function waiting2() {
      if (!checking) {
        checking = Promise.resolve().then(() => o.engine.localChanges()).then((list3) => list3.length > 0, () => true).finally(() => {
          checking = null;
        });
      }
      return checking;
    }
    function onStatus(st) {
      if (stopped) return;
      if (wasHeld && !st.held && heldHere()) o.device.reset((row) => row.id === HELD_ROW);
      wasHeld = !!st.held;
      if (!st.leader) return;
      if (st.held) {
        if (!asking()) {
          o.runner.release();
          return;
        }
        if (offline(st)) return;
        waiting2().then((any) => {
          const now = o.runner.status();
          if (!stopped && !any && now.held && !offline(now)) o.runner.release();
        });
        return;
      }
      if (heldHere()) {
        o.runner.hold();
        return;
      }
      if (!asking() || !offline(st)) return;
      if (st.pending) {
        hold();
        return;
      }
      waiting2().then((any) => {
        const now = o.runner.status();
        if (!stopped && any && now.leader && !now.held && asking() && offline(now) && !heldHere()) hold();
      });
    }
    const unsubscribe = o.runner.subscribe(onStatus);
    onStatus(o.runner.status());
    return {
      /** Look again: the network or the setting changed. */
      check: () => onStatus(o.runner.status()),
      stop() {
        stopped = true;
        unsubscribe();
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
    const state2 = { persisted: null, workToLose: false, asked: false, warned: false };
    let unsubscribe = null;
    let recount = null;
    let onClick = null;
    let disposed = false;
    function warnIfAtRisk() {
      if (!o.sevenDayRule || state2.persisted || o.device.get("durabilityWarnedAt")) return;
      o.device.set("durabilityWarnedAt", now());
      state2.warned = true;
      o.warn();
    }
    function settle2(granted) {
      state2.persisted = !!granted;
      if (!state2.persisted) warnIfAtRisk();
    }
    function askAtNextClick() {
      if (onClick || !o.events) return;
      onClick = () => {
        o.events.removeEventListener("pointerdown", onClick, true);
        onClick = null;
        if (disposed || askedLately()) return;
        o.device.set("persistAskedAt", now());
        state2.asked = true;
        let answer;
        try {
          answer = o.storage.persist();
        } catch (err) {
          answer = Promise.reject(err);
        }
        Promise.resolve(answer).then(settle2, () => settle2(false));
      };
      o.events.addEventListener("pointerdown", onClick, true);
    }
    function askedLately() {
      const last = o.device.get("persistAskedAt");
      return !!last && now() - last < ASK_EVERY;
    }
    function thereIsWork() {
      state2.workToLose = true;
      const canAsk = !!(o.storage && typeof o.storage.persist === "function");
      if (canAsk && !askedLately()) askAtNextClick();
      else warnIfAtRisk();
    }
    function count() {
      if (state2.workToLose || disposed) return;
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
          state2.persisted = !!(o.storage && typeof o.storage.persisted === "function" && await o.storage.persisted());
        } catch (_) {
          state2.persisted = false;
        }
        if (state2.persisted || disposed) return;
        count();
        if (state2.workToLose) return;
        unsubscribe = o.store.subscribe((e) => {
          if (e.cls !== "work" || recount != null) return;
          recount = timers.set(() => {
            recount = null;
            count();
          }, RECOUNT_MS);
        });
      },
      /** { persisted: true | false | null (not known yet), workToLose, asked, warned } */
      /**
       * `atRisk`: Safari may delete what is here (its 7-day rule applies, there
       * is work to lose, and the browser has not agreed to keep the storage).
       * That is state, not news: home shows it for as long as it holds.
       */
      status() {
        return Object.assign({ atRisk: !!o.sevenDayRule && state2.workToLose && !state2.persisted }, state2);
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
    var list3 = N.list();
    for (var i = 0; i < list3.length; i++) {
      if (list3[i] && list3[i].dedupeKey === CAPACITY_DEDUPE) {
        N.dismiss(list3[i].id);
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
  function openStore(storage, alsoWipe) {
    return createStore({
      storage,
      alsoWipe,
      migrations: MIGRATIONS,
      onMissingMigration: "refuse",
      onCapacity: function(state2, detail) {
        if (state2 === "blocked") reportCapacityFailure(detail);
        else clearCapacityFailure();
      },
      onVersionAhead: function() {
        announceReadOnly("BelJar was updated in another tab. Reload to keep editing: changes here are not being saved.");
      },
      onCannotUpgrade: function() {
        announceReadOnly("This BelJar can\u2019t open what an older one saved, so it changed nothing. Changes here are not being saved.");
      }
    });
  }
  var store = openStore(browserArea("localStorage") || createMemoryStorage(), [sessionArea].filter(Boolean));
  if (store.resetReason === "refused") {
    store.dispose();
    store = openStore(createMemoryStorage(), []);
  }
  var tabStore = createStore({ storage: sessionArea || createMemoryStorage() });
  var Settings2;
  var Device2;
  var work;
  var files;
  var documents;
  var records;
  function compose() {
    Settings2 = createSettings(store);
    Device2 = createTable(store, {
      key: DEVICE_KEY,
      rows: DEVICE,
      unknown: function(id) {
        return 'device: no row "' + id + '" (declare it in device-schema.mjs)';
      }
    });
    work = createWork({ store, device: Device2 });
    files = create({ work, settings: Settings2 });
    documents = createDocuments({ work, settings: Settings2, files });
    records = create2({ store, tabStore, work, settings: Settings2 });
  }
  compose();
  work.finishSignOut();
  var leaving = null;
  (function pinToAddress() {
    var loc = globalThis.location;
    if (!loc || Routes.pageOf(loc) !== "edit") return;
    var named = Routes.projectOf(loc);
    if (!named || work.pinProject(named)) return;
    leaving = named;
    store.dispose();
    tabStore.dispose();
    store = openStore(createMemoryStorage(), []);
    tabStore = createStore({ storage: createMemoryStorage() });
    compose();
    Routes.go(Routes.homeUrl({ open: named }), { replace: true });
  })();
  var treeNoticeQueued = false;
  var projectGoneShown = false;
  function noteTreeChanged() {
    if (treeNoticeQueued) return;
    treeNoticeQueued = true;
    Promise.resolve().then(function() {
      treeNoticeQueued = false;
      var g20 = typeof window !== "undefined" ? window : null;
      if (g20 && typeof g20.dispatchEvent === "function" && typeof CustomEvent === "function") {
        g20.dispatchEvent(new CustomEvent("beljar:project-tree-changed", { detail: { kind: "external" } }));
      }
    });
  }
  function announceProjectGone() {
    if (projectGoneShown) return;
    projectGoneShown = true;
    if (work.ownerLeft()) {
      Routes.go(Routes.homeUrl(), { replace: true });
      return;
    }
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
  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("pageshow", function(e) {
      if (e && e.persisted && globalThis.location && typeof globalThis.location.reload === "function") globalThis.location.reload();
    });
    globalThis.addEventListener("pagehide", function() {
      sendOnHide();
      stopSync();
    });
  }
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
    var onHome = !!globalThis.location && Routes.pageOf(globalThis.location) === "home";
    if (!onHome && globalThis.Toasts && typeof globalThis.Toasts.warn === "function") {
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
    device: Device2,
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
  var syncEngine = null;
  var syncTransport = null;
  var holdPolicy = null;
  var CLOSING_PAGE_BYTES = 60 * 1024;
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
    var engineWrites = 0;
    var engine = createSyncEngine({
      store,
      work,
      settings: Settings2,
      transport: opts.transport,
      account,
      notify: announceSync,
      own: function(fn) {
        engineWrites += 1;
        try {
          return fn();
        } finally {
          engineWrites -= 1;
        }
      }
    });
    syncRunner = createSyncRunner({
      engine,
      store,
      // A tab nobody can see does not poll (plan v6 c8): a phone in a pocket, a tab behind others.
      visible: function() {
        return typeof document === "undefined" || document.visibilityState !== "hidden";
      },
      // Not a change waiting to sync: what the engine wrote settling a round (a
      // project forgotten, a deletion settled).
      ignore: function() {
        return engineWrites > 0;
      },
      locks: opts.locks !== void 0 ? opts.locks : nav && nav.locks || null
    });
    syncEngine = engine;
    holdPolicy = createHoldPolicy({
      runner: syncRunner,
      engine,
      device: Device2,
      settings: Settings2,
      account,
      online: function() {
        var n = globalThis.navigator;
        return !n || n.onLine !== false;
      }
    });
    syncTransport = opts.transport;
    syncRunner.start();
    syncStatus.attach(syncRunner);
    startPollAsk();
    return syncRunner;
  }
  var heldRunner = null;
  function stopSync(opts) {
    stopPollAsk();
    const r = syncRunner;
    syncRunner = null;
    syncEngine = null;
    syncTransport = null;
    if (holdPolicy) holdPolicy.stop();
    holdPolicy = null;
    syncStatus.detach();
    if (opts && opts.hold && r) {
      heldRunner = r;
      return r.stop({ hold: true });
    }
    if (heldRunner) {
      heldRunner.stop();
      heldRunner = null;
    }
    return r ? r.stop() : Promise.resolve();
  }
  function unsyncedProjects(uid) {
    if (!uid) return Promise.resolve([]);
    var engine = createSyncEngine({ store, work, settings: Settings2, transport: {}, account: uid });
    return engine.localChanges().then(function(list3) {
      return list3.filter(function(c) {
        return !c.deleted;
      }).map(function(c) {
        return c.pid;
      });
    });
  }
  function restoreVersion(pid, n) {
    if (!syncEngine) return Promise.resolve({ ok: false, error: "signed-out" });
    return syncEngine.restoreVersion(pid, n).then(function(res) {
      if (res && res.ok) syncStatus.confirm();
      return res;
    });
  }
  function syncNow() {
    return syncRunner ? syncRunner.syncNow() : Promise.resolve(null);
  }
  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("online", function() {
      syncStatus.refresh();
      if (holdPolicy) holdPolicy.check();
      syncNow();
    });
    globalThis.addEventListener("offline", function() {
      syncStatus.refresh();
      if (holdPolicy) holdPolicy.check();
    });
  }
  Settings2.subscribe(function(e) {
    if (holdPolicy && e && Array.isArray(e.ids) && e.ids.indexOf("syncReconnect") >= 0) holdPolicy.check();
  });
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "visible") seenAgain();
    });
  }
  function seenAgain() {
    if (!syncRunner) return;
    if (syncRunner.status().leader) syncNow();
    else syncStatus.confirm();
  }
  var POLL_ASK_MS = 6e4;
  var pollAsk = null;
  function startPollAsk() {
    stopPollAsk();
    if (typeof globalThis.setInterval !== "function" || typeof document === "undefined") return;
    pollAsk = globalThis.setInterval(function() {
      if (!syncRunner || document.visibilityState === "hidden" || syncRunner.status().leader) return;
      syncStatus.confirm();
    }, POLL_ASK_MS);
  }
  function stopPollAsk() {
    if (pollAsk != null && typeof globalThis.clearInterval === "function") globalThis.clearInterval(pollAsk);
    pollAsk = null;
  }
  function sendOnHide() {
    if (!syncRunner || !syncTransport) return;
    var nav = globalThis.navigator;
    if (nav && nav.onLine === false) return;
    documents.flushPending();
    var t = syncTransport;
    var send = typeof t.commitOnHide === "function" ? function(pid, req) {
      return t.commitOnHide(pid, req);
    } : function(pid, req) {
      return t.commit(pid, req);
    };
    syncRunner.flush(send, CLOSING_PAGE_BYTES);
  }
  if (typeof globalThis.addEventListener === "function" && typeof document !== "undefined") {
    globalThis.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "hidden") sendOnHide();
    });
  }
  var Persist2 = {
    DEFAULT_PROJECT_NAME,
    documentFingerprint,
    normalizeViewportAnchor,
    isSaveBlocked: store.isBlocked,
    isReadOnly: store.isReadOnly,
    // The project the address named and this browser cannot show: the page is on its way home.
    leaving: function() {
      return leaving;
    },
    // accounts and sync (docs/PERSIST.md §5)
    getAccount: work.account,
    setAccount: work.setAccount,
    claimProject: work.claimProject,
    projectStats: work.projectStats,
    onFileChange: work.onFileChange,
    // home's list: fn() whenever a project, its files, a file's text, a file to
    // review or this browser's device state changes, from this tab or anywhere
    onProjectsChange: function(fn) {
      return store.subscribe(function(e) {
        var k = e && e.key ? parseKey(e.key) : null;
        if (!e || e.key == null || e.key === DEVICE_KEY || k && (k.kind === "meta" || k.kind === "tree" || k.kind === "f" || k.kind === "conflict")) fn();
      });
    },
    // fn(account) when another tab signs in or out: this tab follows (account.mjs)
    onAccountElsewhere: function(fn) {
      var seen2 = work.account();
      return store.subscribe(function(e) {
        if (!e || e.key != null && e.key !== DEVICE_KEY) return;
        var now = work.account();
        if (now === seen2) return;
        seen2 = now;
        if (e.origin !== "local") fn(now);
      });
    },
    ownerLeft: work.ownerLeft,
    removeAccountProjects: work.removeAccountProjects,
    leaveAccount: work.leaveAccount,
    keepAccountProjects: work.keepAccountProjects,
    releaseAccount: work.releaseAccount,
    unsyncedProjects,
    noteSignedOut: work.noteSignedOut,
    takeSignedOutNote: work.takeSignedOutNote,
    // signing in again: back to the account's work, not a blank placeholder
    resumeFor: work.resumeFor,
    clearResume: work.clearResume,
    isBlankProject: work.isBlankProject,
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
    // edits made offline, held for review ("Back online: Ask me first")
    offlineChanges: function() {
      return syncEngine ? syncEngine.localChanges() : Promise.resolve([]);
    },
    cloudSide: function(pid, fids) {
      return syncEngine ? syncEngine.cloudSide(pid, fids) : Promise.resolve({ state: "unknown", name: null, texts: {} });
    },
    // Version history (plan v6 c6, js/ui/version-history.mjs): signed in only.
    projectHistory: function(pid, o) {
      return syncEngine ? syncEngine.history(pid, o) : Promise.resolve(null);
    },
    readVersion: function(pid, n) {
      return syncEngine ? syncEngine.readVersion(pid, n) : Promise.resolve(null);
    },
    restoreVersion,
    useCloud: function(pid) {
      return syncEngine ? syncEngine.useCloud(pid) : Promise.resolve(false);
    },
    projectFileText: function(pid, fid) {
      return work.getText(fid, pid);
    },
    releaseSync: function() {
      return syncStatus.release();
    },
    durabilityStatus: durability.status,
    // the open document
    createPersist: documents.createPersist,
    // projects
    listProjects: work.listProjects,
    // home: what there is, without making one; the last one opened; a delete that may empty the list
    projects: work.visibleProjects,
    lastProjectId: work.lastProject,
    projectInUse: work.projectInUse,
    removeProject: work.removeProject,
    // a project as files, for its zip: { name, files: [{ path, text }], folders }, or null
    projectFiles: function(pid) {
      var snap = work.snapshotProject(pid);
      if (!snap) return null;
      return {
        name: snap.meta.name,
        files: snap.tree.files.map(function(f) {
          return { path: f.name, text: snap.texts[f.id] };
        }),
        folders: snap.tree.folders.slice()
      };
    },
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
  var g2 = typeof window !== "undefined" ? window : globalThis;
  g2.Persist = Persist2;
  g2.Settings = Settings2;
  g2.Device = Device2;
  g2.BelJarPersist = g2.Persist;

  // js/workspace/float-placement.mjs
  var DEFAULT_MARGIN = 8;
  var DEFAULT_GAP = 4;
  var OVERLAY_TRANSITION_FALLBACK_MS = 170;
  var PREFERENCE_TOOLTIP = Object.freeze(["right", "left", "bottom", "top"]);
  function prefersFineHover() {
    return globalThis.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }
  function normalizeAnchor(a) {
    const left = Number(a.left);
    const top = Number(a.top);
    const w = a.width != null ? Number(a.width) : Number(a.right) - left;
    const h = a.height != null ? Number(a.height) : Number(a.bottom) - top;
    return { left, top, right: left + w, bottom: top + h };
  }
  function clampToViewport(x, y, w, h, vw, vh, margin) {
    const m = margin;
    const maxX = Math.max(m, vw - m - w);
    const maxY = Math.max(m, vh - m - h);
    return { x: Math.min(Math.max(m, x), maxX), y: Math.min(Math.max(m, y), maxY) };
  }
  function fitsViewport(x, y, w, h, vw, vh, margin) {
    const m = margin;
    return x >= m && y >= m && x + w <= vw - m && y + h <= vh - m;
  }
  function separatedFromAnchor(x, y, w, h, anchor, gap) {
    const tr = anchor;
    const g20 = gap;
    return x + w <= tr.left - g20 || x >= tr.right + g20 || y + h <= tr.top - g20 || y >= tr.bottom + g20;
  }
  function overlapAreaWithAnchor(x, y, w, h, anchor) {
    const tr = anchor;
    const ix = Math.max(x, tr.left);
    const iy = Math.max(y, tr.top);
    const ax = Math.min(x + w, tr.right);
    const ay = Math.min(y + h, tr.bottom);
    return Math.max(0, ax - ix) * Math.max(0, ay - iy);
  }
  function visibleAreaInMargin(x, y, w, h, vw, vh, margin) {
    const m = margin;
    const x2 = Math.min(vw - m, x + w) - Math.max(m, x);
    const y2 = Math.min(vh - m, y + h) - Math.max(m, y);
    return Math.max(0, x2) * Math.max(0, y2);
  }
  function computePointMenuPlacement(tw, th, vw, vh, m, g20, tr) {
    let x = tr.left + g20;
    let y = tr.top + g20;
    if (x + tw > vw - m) x = tr.left - g20 - tw;
    if (y + th > vh - m) y = tr.top - g20 - th;
    const c = clampToViewport(x, y, tw, th, vw, vh, m);
    return { x: c.x, y: c.y, placement: "menu" };
  }
  function computeSideMenuPlacement(tw, th, vw, vh, m, g20, tr, side, align) {
    const ah = tr.bottom - tr.top;
    const aw = tr.right - tr.left;
    const alignY = () => {
      if (align === "center") return tr.top + ah / 2 - th / 2;
      if (align === "end") return tr.bottom - th;
      return tr.top;
    };
    const alignX = () => {
      if (align === "center") return tr.left + aw / 2 - tw / 2;
      if (align === "end") return tr.right - tw;
      return tr.left;
    };
    let x;
    let y;
    if (side === "right") {
      x = tr.right + g20;
      if (x + tw > vw - m) x = tr.left - g20 - tw;
      y = alignY();
      y = Math.min(Math.max(m, y), Math.max(m, vh - m - th));
    } else if (side === "left") {
      x = tr.left - g20 - tw;
      if (x < m) x = tr.right + g20;
      y = alignY();
      y = Math.min(Math.max(m, y), Math.max(m, vh - m - th));
    } else if (side === "bottom") {
      y = tr.bottom + g20;
      if (y + th > vh - m) y = tr.top - g20 - th;
      x = alignX();
      x = Math.min(Math.max(m, x), Math.max(m, vw - m - tw));
    } else {
      y = tr.top - g20 - th;
      if (y < m) y = tr.bottom + g20;
      x = alignX();
      x = Math.min(Math.max(m, x), Math.max(m, vw - m - tw));
    }
    const c = clampToViewport(x, y, tw, th, vw, vh, m);
    return { x: c.x, y: c.y, placement: "menu" };
  }
  function computeMenuPlacementFull(opts, tw, th, vw, vh, m, g20, tr) {
    const side = opts.side;
    const align = opts.align ?? "start";
    if (!side) return computePointMenuPlacement(tw, th, vw, vh, m, g20, tr);
    return computeSideMenuPlacement(tw, th, vw, vh, m, g20, tr, side, align);
  }
  function computePosition(opts) {
    const tw = opts.width;
    const th = opts.height;
    const vw = opts.viewportWidth ?? (typeof globalThis.innerWidth === "number" ? globalThis.innerWidth : 800);
    const vh = opts.viewportHeight ?? (typeof globalThis.innerHeight === "number" ? globalThis.innerHeight : 600);
    const margin = opts.margin ?? DEFAULT_MARGIN;
    const gap = opts.gap ?? DEFAULT_GAP;
    const tr = normalizeAnchor(opts.anchor);
    const m = margin;
    const g20 = gap;
    if (opts.mode === "menu") {
      return computeMenuPlacementFull(opts, tw, th, vw, vh, m, g20, tr);
    }
    const preferPlacement = opts.preferPlacement ?? PREFERENCE_TOOLTIP;
    const requireSeparation = opts.requireSeparation !== false;
    const fits = (x, y) => fitsViewport(x, y, tw, th, vw, vh, m);
    const sep = (x, y) => !requireSeparation || separatedFromAnchor(x, y, tw, th, tr, g20);
    const clampY = (x, y) => {
      const iy = Math.min(Math.max(m, y), Math.max(m, vh - m - th));
      return { x, y: iy };
    };
    const clampX = (x, y) => {
      const ix = Math.min(Math.max(m, x), Math.max(m, vw - m - tw));
      return { x: ix, y };
    };
    function tryPlacement(side) {
      switch (side) {
        case "right": {
          const x = tr.right + g20;
          if (x + tw > vw - m) return null;
          const { y } = clampY(x, tr.top + (tr.bottom - tr.top) / 2 - th / 2);
          if (!fits(x, y) || !sep(x, y)) return null;
          return { x, y, placement: side };
        }
        case "left": {
          const x = tr.left - g20 - tw;
          if (x < m) return null;
          const { y } = clampY(x, tr.top + (tr.bottom - tr.top) / 2 - th / 2);
          if (!fits(x, y) || !sep(x, y)) return null;
          return { x, y, placement: side };
        }
        case "bottom": {
          const y = tr.bottom + g20;
          if (y + th > vh - m) return null;
          const { x } = clampX(tr.left + (tr.right - tr.left) / 2 - tw / 2, y);
          if (!fits(x, y) || !sep(x, y)) return null;
          return { x, y, placement: side };
        }
        case "top": {
          const y = tr.top - g20 - th;
          if (y < m) return null;
          const { x } = clampX(tr.left + (tr.right - tr.left) / 2 - tw / 2, y);
          if (!fits(x, y) || !sep(x, y)) return null;
          return { x, y, placement: side };
        }
        default:
          return null;
      }
    }
    for (let i = 0; i < preferPlacement.length; i++) {
      const pos = tryPlacement(preferPlacement[i]);
      if (pos) return pos;
    }
    const emergency = [
      () => ({ x: m, y: tr.bottom + g20 }),
      () => ({ x: vw - m - tw, y: tr.bottom + g20 }),
      () => ({ x: tr.left - g20 - tw, y: vh - m - th }),
      () => ({ x: tr.right + g20, y: vh - m - th }),
      () => ({ x: m, y: m })
    ];
    let best = null;
    let bestOverlap = Infinity;
    let bestArea = -1;
    for (let i = 0; i < emergency.length; i++) {
      let { x, y } = emergency[i]();
      const c2 = clampToViewport(x, y, tw, th, vw, vh, m);
      x = c2.x;
      y = c2.y;
      if (!fits(x, y)) continue;
      const ov = overlapAreaWithAnchor(x, y, tw, th, tr);
      const area = visibleAreaInMargin(x, y, tw, th, vw, vh, m);
      if (ov < bestOverlap || ov === bestOverlap && area > bestArea) {
        best = { x, y, placement: "fallback" };
        bestOverlap = ov;
        bestArea = area;
      }
    }
    if (best) return best;
    const c = clampToViewport(tr.right + g20, tr.bottom + g20, tw, th, vw, vh, m);
    return { x: c.x, y: c.y, placement: "fallback" };
  }
  var FloatingRectPlacement = {
    DEFAULT_MARGIN,
    DEFAULT_GAP,
    OVERLAY_TRANSITION_FALLBACK_MS,
    PREFERENCE_TOOLTIP,
    prefersFineHover,
    normalizeAnchor,
    computePosition
  };
  var g3 = typeof window !== "undefined" ? window : globalThis;
  g3.FloatingRectPlacement = FloatingRectPlacement;

  // js/ui/tooltips.mjs
  function frp() {
    return FloatingRectPlacement;
  }
  var TOOLTIP_SPOUT_SIZE = 6;
  var TOOLTIP_ARROW_MIN = 12;
  var TOUCH_SHOW_DELAY_MS = 400;
  function tooltipMargin() {
    return frp().DEFAULT_MARGIN;
  }
  function tooltipGap() {
    return Math.max(frp().DEFAULT_GAP, Math.ceil(TOOLTIP_SPOUT_SIZE * 0.65));
  }
  var PLACEMENT_SPOUT = Object.freeze({
    top: "above",
    bottom: "below",
    left: "left",
    right: "right"
  });
  var SPOUT_CLASSES = [
    "tooltip-spout-above",
    "tooltip-spout-below",
    "tooltip-spout-left",
    "tooltip-spout-right",
    "tooltip-spout-none"
  ];
  function clamp(v, min, max) {
    return Math.max(min, Math.min(v, max));
  }
  function inferSpoutSide(x, y, tw, th, tr) {
    const cx = tr.left + tr.width / 2;
    const cy = tr.top + tr.height / 2;
    const dx = cx - (x + tw / 2);
    const dy = cy - (y + th / 2);
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "left" : "right";
    return dy > 0 ? "above" : "below";
  }
  function clearSpout(tip) {
    for (let i = 0; i < SPOUT_CLASSES.length; i++) tip.classList.remove(SPOUT_CLASSES[i]);
    tip.style.removeProperty("--tooltip-arrow-x");
    tip.style.removeProperty("--tooltip-arrow-y");
  }
  function applySpout(tip, anchor, placement, x, y, tw, th, tr, arrowBox = null) {
    clearSpout(tip);
    if (anchor.hasAttribute("data-tooltip-no-spout")) {
      tip.classList.add("tooltip-spout-none");
      return;
    }
    let side = PLACEMENT_SPOUT[placement];
    if (!side && placement === "fallback") side = inferSpoutSide(x, y, tw, th, tr);
    if (!side) {
      tip.classList.add("tooltip-spout-none");
      return;
    }
    tip.classList.add(`tooltip-spout-${side}`);
    const cx = tr.left + tr.width / 2;
    const cy = tr.top + tr.height / 2;
    const min = TOOLTIP_ARROW_MIN;
    const ax = arrowBox?.left ?? x;
    const ay = arrowBox?.top ?? y;
    const aw = arrowBox?.width ?? tw;
    const ah = arrowBox?.height ?? th;
    if (side === "above" || side === "below") {
      tip.style.setProperty("--tooltip-arrow-x", `${clamp(cx - ax, min, aw - min)}px`);
    } else {
      tip.style.setProperty("--tooltip-arrow-y", `${clamp(cy - ay, min, ah - min)}px`);
    }
  }
  var tooltipRoot = null;
  var suppressedTooltipAnchors = /* @__PURE__ */ new Set();
  var tooltipHideFallbackTimer = null;
  var tooltipLeaveGen = 0;
  var tooltipTransitionEndHandler = null;
  var tooltipAnchor = null;
  var touchShowTimer = null;
  var tooltipSuppressLeaveUntilPointerUp = null;
  function prepareOverflow(el5) {
    if (!el5._belOverflowTipBound) return;
    const getText = el5._belOverflowGetText;
    const text = el5.scrollWidth > el5.clientWidth ? getText ? getText() : (el5.textContent || "").trim() : "";
    if (text) el5.setAttribute("data-tooltip", text);
    else el5.removeAttribute("data-tooltip");
  }
  function tooltipIsShowing() {
    return !!(tooltipRoot && !tooltipRoot.hidden && !tooltipRoot.classList.contains("is-leaving"));
  }
  function tippableAt(x, y) {
    let n = document.elementFromPoint(x, y);
    while (n && n.nodeType === 1) {
      if (n._belOverflowTipBound) prepareOverflow(n);
      if (!suppressedTooltipAnchors.has(n) && anchorHasTooltip(n)) return n;
      n = n.parentElement;
    }
    return null;
  }
  function syncTooltipToPointer(x, y) {
    if (!frp().prefersFineHover()) return;
    if (!tooltipRoot) return;
    if (tooltipSuppressLeaveUntilPointerUp) return;
    const next = tippableAt(x, y);
    if (next) {
      if (next._belTooltipBound) {
        if (tooltipAnchor === next && tooltipIsShowing()) return;
        showTooltip(next);
      }
      return;
    }
    if (tooltipAnchor && tooltipAnchor._belTooltipBound) hideTooltipImmediate();
  }
  function cancelTooltipHideAnim() {
    if (tooltipHideFallbackTimer != null) {
      clearTimeout(tooltipHideFallbackTimer);
      tooltipHideFallbackTimer = null;
    }
    if (tooltipRoot && tooltipTransitionEndHandler) {
      const prevInner = tooltipRoot.querySelector(".tooltip-inner");
      if (prevInner) prevInner.removeEventListener("transitionend", tooltipTransitionEndHandler);
      tooltipTransitionEndHandler = null;
    }
    tooltipLeaveGen++;
  }
  function parseLintErrors(anchor) {
    const raw = anchor.getAttribute("data-tooltip-errors");
    if (!raw) return null;
    try {
      const items = JSON.parse(raw);
      return Array.isArray(items) && items.length ? items : null;
    } catch (_) {
      return null;
    }
  }
  function isStackedLintErrors(anchor) {
    return !!parseLintErrors(anchor) && !anchor.hasAttribute("data-tooltip-head");
  }
  function anchorHasTooltip(anchor) {
    if (!anchor) return false;
    return !!(anchor.getAttribute("data-tooltip") || anchor.getAttribute("data-tooltip-tone") || anchor.hasAttribute("data-tooltip-head") || anchor.hasAttribute("data-tooltip-rich") && typeof anchor._belTooltipRich === "function" || parseLintErrors(anchor));
  }
  function fillDiagnosticTooltip(tip, message, severity) {
    tip.classList.add("tooltip-inner--diagnostic", `tooltip-inner--${severity}`);
    tip.replaceChildren();
    const frame = document.createElement("div");
    frame.className = `cm-diagnostic cm-diagnostic-${severity}`;
    const head = document.createElement("div");
    head.className = "beljar-tip-head";
    const kind = document.createElement("span");
    kind.className = "beljar-tip-kind";
    kind.textContent = severity === "warning" ? "Warning" : "Error";
    head.appendChild(kind);
    const body = document.createElement("div");
    body.className = "beljar-tip-body";
    body.textContent = message || "";
    frame.append(head, body);
    tip.appendChild(frame);
  }
  function fillTooltipContent(tip, anchor) {
    const text = anchor.getAttribute("data-tooltip");
    const tone = anchor.getAttribute("data-tooltip-tone");
    const items = parseLintErrors(anchor);
    const headed = anchor.hasAttribute("data-tooltip-head");
    tip.classList.remove(
      "tooltip-inner--lint-errors",
      "tooltip-inner--diagnostic",
      "tooltip-inner--error",
      "tooltip-inner--warning",
      "tooltip-inner--rich"
    );
    if (anchor.hasAttribute("data-tooltip-rich") && typeof anchor._belTooltipRich === "function") {
      tip.classList.add("tooltip-inner--rich");
      tip.replaceChildren();
      let frag = null;
      try {
        frag = anchor._belTooltipRich(anchor);
      } catch (_) {
        frag = null;
      }
      if (frag) tip.appendChild(frag);
      else if (text) tip.textContent = text;
      return;
    }
    if (tone === "error" || tone === "warning") {
      fillDiagnosticTooltip(tip, text, tone);
      return;
    }
    if (headed) {
      tip.classList.add("tooltip-inner--lint-errors");
      tip.replaceChildren();
      const head = document.createElement("div");
      head.className = "tooltip-lint-head";
      head.textContent = text || "Errors detected";
      tip.appendChild(head);
      if (items) {
        const body = document.createElement("div");
        body.className = "tooltip-lint-body";
        const list3 = document.createElement("ul");
        list3.className = "tooltip-lint-list";
        for (const item of items) {
          const li = document.createElement("li");
          li.className = "tooltip-lint-item" + (item.kind === "warning" ? " tooltip-lint-item--warning" : "");
          const loc = item.prefix ? `${item.prefix}${item.line ?? "?"}` : String(item.line ?? "?");
          const line = document.createElement("span");
          line.className = "tooltip-lint-line";
          line.textContent = loc;
          const msg = document.createElement("span");
          msg.className = "tooltip-lint-msg";
          msg.textContent = item.msg || item.message || "Error";
          li.append(line, msg);
          list3.appendChild(li);
        }
        body.appendChild(list3);
        tip.appendChild(body);
      }
      return;
    }
    if (!text) return;
    tip.textContent = text;
  }
  function tooltipPreferPlacement(anchor) {
    const raw = (anchor.getAttribute("data-tooltip-placement") || "").trim().toLowerCase();
    if (!raw) return frp().PREFERENCE_TOOLTIP;
    const side = raw === "below" ? "bottom" : raw === "above" ? "top" : raw;
    const order2 = ["bottom", "top", "right", "left"];
    if (!order2.includes(side)) return frp().PREFERENCE_TOOLTIP;
    return [side, ...order2.filter((s) => s !== side)];
  }
  function anchorConnected(anchor) {
    return !!(anchor && anchor.isConnected);
  }
  function tooltipRectEl(anchor) {
    const fn = anchor._belTooltipRectEl;
    if (typeof fn === "function") {
      const el5 = fn(anchor);
      if (el5 && el5.nodeType === 1 && el5.isConnected) return el5;
    }
    return anchor;
  }
  function clearTooltipRoot() {
    tooltipRoot.replaceChildren();
  }
  function tooltipAnimatedEl() {
    return tooltipRoot.querySelector(".tooltip-stack") || tooltipRoot.querySelector(".tooltip-inner");
  }
  function buildStackedDiagnosticTooltips(anchor) {
    const items = parseLintErrors(anchor);
    clearTooltipRoot();
    const stack = document.createElement("div");
    stack.className = "tooltip-stack";
    for (const item of items) {
      const tip = document.createElement("div");
      tip.className = "tooltip-inner";
      const severity = item.kind === "warning" ? "warning" : "error";
      fillDiagnosticTooltip(tip, item.msg || item.message || "", severity);
      stack.appendChild(tip);
    }
    tooltipRoot.appendChild(stack);
    return stack;
  }
  function verticallyClosestStackInner(inners, tr) {
    if (!inners.length) return null;
    if (inners.length === 1) return inners[0];
    const acy = tr.top + tr.height / 2;
    let best = inners[0];
    let bestDist = Infinity;
    for (let i = 0; i < inners.length; i++) {
      const r = inners[i].getBoundingClientRect();
      const icy = r.top + r.height / 2;
      const dist = Math.abs(icy - acy);
      if (dist < bestDist) {
        bestDist = dist;
        best = inners[i];
      }
    }
    return best;
  }
  function stackSpoutTarget(inners, placement, tr) {
    if (!inners.length) return null;
    if (placement === "top") return inners[inners.length - 1];
    if (placement === "bottom") return inners[0];
    return verticallyClosestStackInner(inners, tr);
  }
  function applyStackSpout(stack, anchor, placement, x, y, tw, th, tr) {
    const inners = [...stack.querySelectorAll(".tooltip-inner")];
    for (let i = 0; i < inners.length; i++) clearSpout(inners[i]);
    if (anchor.hasAttribute("data-tooltip-no-spout")) {
      for (let i = 0; i < inners.length; i++) inners[i].classList.add("tooltip-spout-none");
      return;
    }
    let side = PLACEMENT_SPOUT[placement];
    if (!side && placement === "fallback") side = inferSpoutSide(x, y, tw, th, tr);
    if (!side) {
      for (let i = 0; i < inners.length; i++) inners[i].classList.add("tooltip-spout-none");
      return;
    }
    const target = stackSpoutTarget(inners, placement, tr);
    if (!target) return;
    const targetRect = target.getBoundingClientRect();
    applySpout(target, anchor, placement, x, y, tw, th, tr, {
      left: targetRect.left,
      top: targetRect.top,
      width: targetRect.width,
      height: targetRect.height
    });
  }
  function layoutTooltip(anchor) {
    if (!anchorConnected(anchor)) {
      hideTooltip();
      return;
    }
    if (!anchorHasTooltip(anchor) || tooltipRoot.hidden) return;
    const stacked = isStackedLintErrors(anchor);
    let tip;
    if (stacked) tip = buildStackedDiagnosticTooltips(anchor);
    else {
      tip = tooltipRoot.querySelector(".tooltip-inner");
      if (!tip) {
        ensureTooltipInner();
        tip = tooltipRoot.querySelector(".tooltip-inner");
      }
      fillTooltipContent(tip, anchor);
    }
    if (!tip) return;
    tooltipRoot.classList.add("is-measuring");
    const tw = tooltipRoot.offsetWidth;
    const th = tooltipRoot.offsetHeight;
    const tr = tooltipRectEl(anchor).getBoundingClientRect();
    const pos = frp().computePosition({
      anchor: tr,
      width: tw,
      height: th,
      margin: tooltipMargin(),
      gap: tooltipGap(),
      preferPlacement: tooltipPreferPlacement(anchor)
    });
    tooltipRoot.classList.remove("is-measuring");
    tooltipRoot.style.left = `${pos.x}px`;
    tooltipRoot.style.top = `${pos.y}px`;
    if (stacked) applyStackSpout(tip, anchor, pos.placement, pos.x, pos.y, tw, th, tr);
    else applySpout(tip, anchor, pos.placement, pos.x, pos.y, tw, th, tr);
    tooltipRoot.classList.add("is-visible");
  }
  function isPlainTextTooltip(anchor) {
    if (!anchor.getAttribute("data-tooltip")) return false;
    if (anchor.getAttribute("data-tooltip-tone")) return false;
    if (anchor.hasAttribute("data-tooltip-head")) return false;
    if (anchor.hasAttribute("data-tooltip-rich")) return false;
    if (parseLintErrors(anchor)) return false;
    return true;
  }
  function refreshTooltipIfAnchored(target) {
    if (!tooltipRoot || tooltipAnchor !== target) return;
    if (!anchorConnected(target)) {
      hideTooltip();
      return;
    }
    if (tooltipRoot.hidden || tooltipRoot.classList.contains("is-leaving")) return;
    if (!anchorHasTooltip(target)) {
      hideTooltip();
      return;
    }
    if (isPlainTextTooltip(target) && !tooltipRoot.querySelector(".tooltip-stack")) {
      const tip = tooltipRoot.querySelector(".tooltip-inner");
      if (tip) {
        const text = target.getAttribute("data-tooltip") || "";
        if (tip.textContent !== text) tip.textContent = text;
        return;
      }
    }
    layoutTooltip(target);
  }
  function ensureTooltipInner() {
    if (tooltipRoot.querySelector(".tooltip-stack")) return;
    if (!tooltipRoot.querySelector(".tooltip-inner")) {
      const inner = document.createElement("div");
      inner.className = "tooltip-inner";
      tooltipRoot.appendChild(inner);
    }
  }
  function showTooltip(anchor, opts) {
    opts = opts || {};
    if (suppressedTooltipAnchors.has(anchor)) return;
    if (!anchorConnected(anchor)) return;
    if (!anchorHasTooltip(anchor)) return;
    cancelTooltipHideAnim();
    if (tooltipAnchor === anchor && !tooltipRoot.hidden && !tooltipRoot.classList.contains("is-leaving")) {
      layoutTooltip(anchor);
      return;
    }
    clearTooltipRoot();
    if (!isStackedLintErrors(anchor)) ensureTooltipInner();
    tooltipRoot.classList.remove("is-leaving");
    tooltipAnchor = anchor;
    tooltipRoot.hidden = false;
    layoutTooltip(anchor);
  }
  function hideTooltip() {
    tooltipAnchor = null;
    if (!tooltipRoot) return;
    if (tooltipRoot.hidden && !tooltipRoot.classList.contains("is-leaving")) return;
    cancelTooltipHideAnim();
    const finishGen = tooltipLeaveGen;
    const fallbackMs = frp().OVERLAY_TRANSITION_FALLBACK_MS;
    const inner = tooltipAnimatedEl();
    if (!inner) {
      tooltipRoot.classList.remove("is-visible", "is-measuring", "is-leaving");
      tooltipRoot.hidden = true;
      tooltipRoot.style.left = "";
      tooltipRoot.style.top = "";
      return;
    }
    if (inner.classList.contains("tooltip-stack")) {
      for (const tip of inner.querySelectorAll(".tooltip-inner")) clearSpout(tip);
    } else clearSpout(inner);
    tooltipRoot.classList.remove("is-visible", "is-measuring");
    tooltipRoot.classList.add("is-leaving");
    void inner.offsetHeight;
    const finish = () => {
      if (finishGen !== tooltipLeaveGen) return;
      if (tooltipTransitionEndHandler && inner) {
        inner.removeEventListener("transitionend", tooltipTransitionEndHandler);
        tooltipTransitionEndHandler = null;
      }
      tooltipHideFallbackTimer = null;
      tooltipRoot.classList.remove("is-leaving");
      tooltipRoot.hidden = true;
      tooltipRoot.style.left = "";
      tooltipRoot.style.top = "";
    };
    const onEnd = (e) => {
      if (e.target !== inner || e.propertyName !== "transform") return;
      finish();
    };
    tooltipTransitionEndHandler = onEnd;
    inner.addEventListener("transitionend", onEnd);
    tooltipHideFallbackTimer = setTimeout(finish, fallbackMs);
  }
  function hideTooltipImmediate() {
    tooltipAnchor = null;
    if (!tooltipRoot) return;
    cancelTooltipHideAnim();
    const inner = tooltipAnimatedEl();
    if (inner?.classList.contains("tooltip-stack")) {
      for (const tip of inner.querySelectorAll(".tooltip-inner")) clearSpout(tip);
    } else if (inner) clearSpout(inner);
    tooltipRoot.classList.remove("is-visible", "is-measuring", "is-leaving");
    tooltipRoot.hidden = true;
    tooltipRoot.style.left = "";
    tooltipRoot.style.top = "";
  }
  function bindTooltipEl(el5) {
    if (!el5 || el5.nodeType !== 1 || el5._belTooltipBound) return;
    el5._belTooltipBound = true;
    el5.addEventListener("mouseenter", (ev) => {
      if (!frp().prefersFineHover()) return;
      syncTooltipToPointer(ev.clientX, ev.clientY);
    });
    el5.addEventListener("mouseleave", (ev) => {
      if (!frp().prefersFineHover()) return;
      if (tooltipSuppressLeaveUntilPointerUp === el5) return;
      syncTooltipToPointer(ev.clientX, ev.clientY);
    });
    el5.addEventListener("focusin", () => {
      if (!el5.matches(":focus-visible")) return;
      if (tooltipAnchor === el5 && !tooltipRoot.hidden && !tooltipRoot.classList.contains("is-leaving")) {
        return;
      }
      showTooltip(el5);
    });
    el5.addEventListener("focusout", () => {
      if (tooltipAnchor === el5) hideTooltip();
    });
    el5.addEventListener(
      "pointerdown",
      (e) => {
        if (!frp().prefersFineHover() || !e.isPrimary || e.button !== 0) return;
        if (e.pointerType === "touch") return;
        tooltipSuppressLeaveUntilPointerUp = el5;
      },
      true
    );
    el5.addEventListener(
      "touchstart",
      () => {
        if (frp().prefersFineHover()) return;
        clearTimeout(touchShowTimer);
        touchShowTimer = setTimeout(() => showTooltip(el5), TOUCH_SHOW_DELAY_MS);
      },
      { passive: true }
    );
    el5.addEventListener("touchend", () => {
      if (frp().prefersFineHover()) return;
      clearTimeout(touchShowTimer);
      if (tooltipAnchor === el5) hideTooltip();
    });
    el5.addEventListener("touchcancel", () => {
      if (frp().prefersFineHover()) return;
      clearTimeout(touchShowTimer);
      if (tooltipAnchor === el5) hideTooltip();
    });
  }
  function bindTooltips() {
    if (!tooltipRoot) return;
    document.querySelectorAll("[data-tooltip]").forEach(bindTooltipEl);
    window.addEventListener("pointerup", (e) => {
      if (!e.isPrimary || e.button !== 0) return;
      const held = tooltipSuppressLeaveUntilPointerUp;
      tooltipSuppressLeaveUntilPointerUp = null;
      if (!held || tooltipAnchor !== held) return;
      if (!held.isConnected) {
        hideTooltip();
        return;
      }
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const stillOver = under && (held === under || held.contains(under));
      if (!stillOver) hideTooltip();
    });
    window.addEventListener("pointercancel", (e) => {
      if (!e.isPrimary) return;
      tooltipSuppressLeaveUntilPointerUp = null;
    });
    window.addEventListener("pointermove", (e) => {
      syncTooltipToPointer(e.clientX, e.clientY);
    });
    window.addEventListener("resize", () => {
      if (tooltipAnchor) layoutTooltip(tooltipAnchor);
    });
    window.addEventListener(
      "scroll",
      (e) => {
        if (!tooltipAnchor) return;
        if (tooltipRoot && e.target instanceof Node && tooltipRoot.contains(e.target)) return;
        hideTooltipImmediate();
      },
      true
    );
    const tooltipAttrObserver = new MutationObserver(function(records2) {
      for (let i = 0; i < records2.length; i++) {
        const r = records2[i];
        if (r.type !== "attributes" || r.attributeName !== "data-tooltip" && r.attributeName !== "data-tooltip-errors" && r.attributeName !== "data-tooltip-tone" && r.attributeName !== "data-tooltip-head") continue;
        const el5 = r.target;
        if (!el5 || el5.nodeType !== 1) continue;
        if (r.oldValue === el5.getAttribute(r.attributeName)) continue;
        refreshTooltipIfAnchored(el5);
      }
    });
    tooltipAttrObserver.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["data-tooltip", "data-tooltip-errors", "data-tooltip-tone", "data-tooltip-head"]
    });
  }
  function setTooltip(el5, text, opts) {
    if (!el5 || el5.nodeType !== 1) return;
    opts = opts || {};
    el5.removeAttribute("title");
    const tip = text != null ? String(text).trim() : "";
    if (!tip) {
      el5.removeAttribute("data-tooltip");
      if (opts.ariaLabel !== false) el5.removeAttribute("aria-label");
      return;
    }
    const prev = el5.getAttribute("data-tooltip");
    if (prev !== tip) el5.setAttribute("data-tooltip", tip);
    if (opts.ariaLabel !== false) el5.setAttribute("aria-label", tip);
    bindTooltipEl(el5);
  }
  function setRichTooltip(el5, buildFragment, ariaText) {
    if (!el5 || el5.nodeType !== 1) return;
    el5.removeAttribute("title");
    if (typeof buildFragment !== "function") {
      el5._belTooltipRich = null;
      el5.removeAttribute("data-tooltip-rich");
      return;
    }
    el5._belTooltipRich = buildFragment;
    el5.setAttribute("data-tooltip-rich", "");
    const aria = ariaText != null ? String(ariaText).trim() : "";
    if (aria) el5.setAttribute("aria-label", aria);
    bindTooltipEl(el5);
  }
  function bindOverflowTip(el5, getText) {
    if (!el5 || el5.nodeType !== 1 || el5._belOverflowTipBound) return;
    el5._belOverflowTipBound = true;
    el5._belOverflowGetText = getText || null;
    el5.addEventListener("mouseenter", function() {
      if (!frp().prefersFineHover()) return;
      const text = el5.scrollWidth > el5.clientWidth ? getText ? getText() : (el5.textContent || "").trim() : "";
      if (text) el5.setAttribute("data-tooltip", text);
      else el5.removeAttribute("data-tooltip");
    });
    bindTooltipEl(el5);
  }
  var Tooltips2 = {
    hide: hideTooltip,
    hideImmediate: hideTooltipImmediate,
    set: setTooltip,
    setRich: setRichTooltip,
    show: showTooltip,
    // Wire a dynamically-created element (with data-tooltip) for custom tooltips.
    bind: bindTooltipEl,
    // Show full text as tooltip only when the element's content is clipped.
    bindOverflow: bindOverflowTip,
    // Position the tooltip against another element's rect (resolved lazily on
    // each show) while hover behaviour stays on `el`. Falsy result → own rect.
    setRectEl(el5, fn) {
      if (el5 && el5.nodeType === 1) el5._belTooltipRectEl = typeof fn === "function" ? fn : null;
    },
    // The element the visible tooltip is anchored to (null when hidden). Lets
    // external hover controllers hide only tooltips they own.
    activeAnchor() {
      return tooltipAnchor;
    },
    suppressAnchor(el5) {
      suppressedTooltipAnchors.add(el5);
    },
    releaseAnchor(el5) {
      suppressedTooltipAnchors.delete(el5);
    }
  };
  function installTooltips() {
    if (typeof document === "undefined") return;
    tooltipRoot = document.getElementById("tooltip-root");
    bindTooltips();
  }
  if (typeof document !== "undefined") {
    installTooltips();
    globalThis.Tooltips = Tooltips2;
  }

  // js/ui/hint-seen.mjs
  var SEEN_SETTING = {
    library: "hintSeenLibrary",
    "inspector-cursor": "hintSeenInspectorCursor",
    "sign-in": "hintSeenSignIn"
  };
  function seenSetting(id) {
    return Object.prototype.hasOwnProperty.call(SEEN_SETTING, id) ? SEEN_SETTING[id] : null;
  }
  function wasSeen(id, o) {
    const row = seenSetting(id);
    if (row && o.setting(row) === true) return true;
    return (o.deviceList || []).indexOf(id) !== -1;
  }
  function carryForward(deviceList, setting2) {
    return (deviceList || []).map(seenSetting).filter((row) => row && setting2(row) !== true);
  }
  function settingsKnown(summary2, syncSettingsOn) {
    if (!summary2 || !summary2.signedIn || !syncSettingsOn) return true;
    return summary2.lastSync > 0;
  }

  // js/ui/hint.mjs
  var global = globalThis;
  var DEFAULT_DURATION_MS = 1e4;
  var GAP_PX = 10;
  var LEAVE_MS = 160;
  var CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var rootEl = null;
  var cardEl = null;
  var bodyEl = null;
  var closeBtn = null;
  var anchorEl = null;
  var activeId = null;
  var autoTimer = null;
  var leaveTimer = null;
  var visible = false;
  var dismissing = false;
  var resizeBound = false;
  var actionFn = null;
  var placeSide = "right";
  var placeAlign = "end";
  function setting(row) {
    return typeof Settings !== "undefined" && Settings.get ? Settings.get(row) : void 0;
  }
  function wasDismissed(id) {
    if (!id) return false;
    return wasSeen(id, { setting, deviceList: typeof Device !== "undefined" ? Device.get("dismissedHints") : [] });
  }
  function persistDismissed(id) {
    if (!id) return;
    var row = seenSetting(id);
    if (row && typeof Settings !== "undefined") {
      if (Settings.get(row) !== true) Settings.set(row, true);
      return;
    }
    if (typeof Device === "undefined") return;
    var list3 = Device.get("dismissedHints");
    if (list3.indexOf(id) !== -1) return;
    list3.push(id);
    Device.set("dismissedHints", list3);
  }
  function clearTimers() {
    if (autoTimer != null) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
    if (leaveTimer != null) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
  }
  function releaseTooltip() {
    if (anchorEl && global.Tooltips && Tooltips.releaseAnchor) Tooltips.releaseAnchor(anchorEl);
  }
  function suppressTooltip() {
    if (anchorEl && global.Tooltips && Tooltips.suppressAnchor) Tooltips.suppressAnchor(anchorEl);
    if (anchorEl && global.Tooltips && Tooltips.hideImmediate) Tooltips.hideImmediate();
  }
  function progressBar() {
    return rootEl && rootEl.querySelector(".hint-progress-bar");
  }
  function freezeProgressBar() {
    const bar = progressBar();
    if (!bar) return;
    const t = getComputedStyle(bar).transform;
    bar.style.animation = "none";
    bar.style.transition = "none";
    bar.style.transform = t && t !== "none" ? t : "scaleX(0)";
  }
  function clearProgressBarFreeze() {
    const bar = progressBar();
    if (!bar) return;
    bar.style.removeProperty("animation");
    bar.style.removeProperty("transition");
    bar.style.removeProperty("transform");
  }
  function ensureDom() {
    if (rootEl) return true;
    rootEl = document.getElementById("hint-root");
    if (!rootEl) {
      rootEl = document.createElement("div");
      rootEl.id = "hint-root";
      rootEl.className = "hint-root";
      rootEl.setAttribute("role", "status");
      rootEl.setAttribute("aria-live", "polite");
      rootEl.setAttribute("aria-hidden", "true");
      rootEl.hidden = true;
      rootEl.innerHTML = '<div class="hint-card"><div class="hint-top"><div class="hint-body"></div><button type="button" class="icon-btn hint-close" aria-label="Dismiss">' + CLOSE_SVG + '</button></div><div class="hint-progress" aria-hidden="true"><span class="hint-progress-bar"></span></div></div>';
      document.body.appendChild(rootEl);
    }
    cardEl = rootEl.querySelector(".hint-card");
    bodyEl = rootEl.querySelector(".hint-body");
    closeBtn = rootEl.querySelector(".hint-close");
    if (closeBtn && !closeBtn._belHintBound) {
      closeBtn._belHintBound = true;
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
      });
    }
    if (cardEl && !cardEl._belHintActionBound) {
      cardEl._belHintActionBound = true;
      cardEl.addEventListener("click", (e) => {
        if (e.target && e.target.closest && e.target.closest(".hint-close")) return;
        if (!actionFn) return;
        e.preventDefault();
        e.stopPropagation();
        runAction();
      });
      cardEl.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (e.repeat || !actionFn) return;
        e.preventDefault();
        e.stopPropagation();
        runAction();
      });
    }
    if (!resizeBound) {
      resizeBound = true;
      window.addEventListener("resize", onResize);
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", onResize);
      }
    }
    return true;
  }
  function finishHide() {
    if (!rootEl) return;
    rootEl.classList.remove("is-visible", "is-leaving");
    clearProgressBarFreeze();
    rootEl.style.removeProperty("width");
    rootEl.hidden = true;
    rootEl.setAttribute("aria-hidden", "true");
    visible = false;
    dismissing = false;
    actionFn = null;
    rootEl.classList.remove("is-hold");
    delete rootEl.dataset.side;
    rootEl.style.removeProperty("--hint-arrow-x");
    if (cardEl) {
      cardEl.classList.remove("is-action");
      cardEl.removeAttribute("role");
      cardEl.removeAttribute("tabindex");
    }
    releaseTooltip();
    anchorEl = null;
    activeId = null;
  }
  function fitWidth() {
    if (!rootEl) return;
    rootEl.style.removeProperty("width");
    const cs = getComputedStyle(rootEl);
    let maxW = parseFloat(cs.maxWidth);
    if (!Number.isFinite(maxW) || maxW <= 0) {
      maxW = Math.min(352, window.innerWidth - 20);
    }
    maxW = Math.min(Math.floor(maxW), window.innerWidth - 16);
    if (maxW < 48) maxW = 48;
    rootEl.style.width = maxW + "px";
    const targetH = rootEl.offsetHeight;
    let lo = 48;
    let hi = maxW;
    let best = maxW;
    while (lo <= hi) {
      const mid = lo + hi >> 1;
      rootEl.style.width = mid + "px";
      if (rootEl.offsetHeight > targetH) {
        lo = mid + 1;
      } else {
        best = mid;
        hi = mid - 1;
      }
    }
    rootEl.style.width = best + "px";
  }
  function headerDrop(anchor) {
    const header = anchor.closest && anchor.closest("header");
    if (!header) return null;
    const v = getComputedStyle(header).getPropertyValue("--header-menu-gap").trim();
    const n = parseFloat(v);
    let gap = GAP_PX;
    if (Number.isFinite(n)) {
      gap = /rem$/.test(v) ? n * parseFloat(getComputedStyle(document.documentElement).fontSize) : n;
    }
    return { bottom: header.getBoundingClientRect().bottom, gap };
  }
  function runAction() {
    if (!actionFn || dismissing) return;
    const fn = actionFn;
    actionFn = null;
    dismiss();
    fn();
  }
  function place() {
    if (!rootEl || !cardEl || !anchorEl) return;
    rootEl.hidden = false;
    rootEl.style.left = "0px";
    rootEl.style.top = "0px";
    rootEl.style.visibility = "hidden";
    rootEl.style.opacity = "0";
    rootEl.style.pointerEvents = "none";
    fitWidth();
    const ar = anchorEl.getBoundingClientRect();
    const width = rootEl.offsetWidth;
    const height = rootEl.offsetHeight;
    const margin = 8;
    let left;
    let top;
    if (placeSide === "below") {
      const drop = headerDrop(anchorEl);
      const anchorBottom = drop ? drop.bottom : ar.bottom;
      const gap = drop ? drop.gap : GAP_PX;
      if (placeAlign === "start") left = Math.round(ar.left);
      else if (placeAlign === "center") left = Math.round(ar.left + ar.width / 2 - width / 2);
      else left = Math.round(ar.right - width);
      top = Math.round(anchorBottom + gap);
      rootEl.dataset.side = "below";
      cardEl.style.removeProperty("--hint-arrow-y");
    } else {
      left = Math.round(ar.right + GAP_PX);
      top = Math.round(ar.top + ar.height / 2 - height / 2);
      rootEl.dataset.side = "right";
      rootEl.style.removeProperty("--hint-arrow-x");
    }
    const maxLeft = window.innerWidth - width - margin;
    const maxTop = window.innerHeight - height - margin;
    if (left < margin) left = margin;
    if (left > maxLeft) left = Math.max(margin, maxLeft);
    if (top < margin) top = margin;
    if (top > maxTop) top = Math.max(margin, maxTop);
    if (placeSide === "below") {
      const arrowX = Math.max(12, Math.min(width - 12, ar.left + ar.width / 2 - left));
      rootEl.style.setProperty("--hint-arrow-x", arrowX + "px");
    } else {
      const arrowY = Math.max(12, Math.min(height - 12, ar.top + ar.height / 2 - top));
      cardEl.style.setProperty("--hint-arrow-y", arrowY + "px");
    }
    rootEl.style.left = left + "px";
    rootEl.style.top = top + "px";
    rootEl.style.removeProperty("visibility");
    rootEl.style.removeProperty("opacity");
    rootEl.style.removeProperty("pointer-events");
  }
  function dismiss(id) {
    if (id != null && activeId != null && id !== activeId) {
      persistDismissed(id);
      return;
    }
    const dismissId = activeId || id;
    if (!visible || dismissing) {
      if (dismissId) persistDismissed(dismissId);
      return;
    }
    dismissing = true;
    if (dismissId) persistDismissed(dismissId);
    clearTimers();
    freezeProgressBar();
    rootEl.classList.remove("is-visible");
    rootEl.classList.add("is-leaving");
    const finish = () => {
      rootEl.removeEventListener("transitionend", onEnd);
      finishHide();
    };
    const onEnd = (e) => {
      if (e.target !== rootEl) return;
      finish();
    };
    rootEl.addEventListener("transitionend", onEnd);
    leaveTimer = setTimeout(finish, LEAVE_MS + 40);
  }
  function accountAnswered() {
    var P = global.Persist;
    var summary2 = P && typeof P.syncSummary === "function" ? P.syncSummary() : null;
    return settingsKnown(summary2, setting("syncSettings") !== false);
  }
  var waiting = /* @__PURE__ */ new Map();
  var waitUnsub = null;
  function release() {
    if (waitUnsub) {
      waitUnsub();
      waitUnsub = null;
    }
    var queued = Array.from(waiting.values());
    waiting.clear();
    for (var i = 0; i < queued.length; i++) {
      var a = queued[i].anchor;
      var box = a && a.isConnected ? a.getBoundingClientRect() : null;
      if (box && box.width > 0 && box.height > 0 && show(Object.assign({}, queued[i], { waited: true }))) return;
    }
  }
  function waitForAccount(o) {
    waiting.set(String(o.id), o);
    if (waitUnsub) return;
    var P = global.Persist;
    if (P && typeof P.onSyncSummary === "function") {
      waitUnsub = P.onSyncSummary(function() {
        if (accountAnswered()) release();
      });
    }
  }
  function show(opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    const id = o.id != null ? String(o.id) : null;
    const anchor = o.anchor;
    const text = o.text != null ? String(o.text) : "";
    const duration = typeof o.duration === "number" && o.duration > 0 ? o.duration : DEFAULT_DURATION_MS;
    const once = o.once !== false;
    if (!anchor || !text) return false;
    if (once && id && wasDismissed(id)) return false;
    if (once && id && seenSetting(id) && o.wait !== false && !o.waited && !accountAnswered()) {
      waitForAccount(o);
      return false;
    }
    if (!ensureDom()) return false;
    if (visible || dismissing) {
      clearTimers();
      finishHide();
    }
    activeId = id;
    anchorEl = anchor;
    placeSide = o.side === "below" ? "below" : "right";
    placeAlign = o.align === "start" || o.align === "center" ? o.align : "end";
    actionFn = typeof o.onClick === "function" ? o.onClick : null;
    if (cardEl) {
      if (actionFn) {
        cardEl.classList.add("is-action");
        cardEl.setAttribute("role", "button");
        cardEl.tabIndex = 0;
      } else {
        cardEl.classList.remove("is-action");
        cardEl.removeAttribute("role");
        cardEl.removeAttribute("tabindex");
      }
    }
    bodyEl.textContent = text;
    rootEl.classList.toggle("is-hold", !!o.hold);
    rootEl.style.setProperty("--hint-duration", duration / 1e3 + "s");
    clearProgressBarFreeze();
    place();
    suppressTooltip();
    rootEl.setAttribute("aria-hidden", "false");
    void rootEl.offsetWidth;
    rootEl.classList.remove("is-leaving");
    rootEl.classList.add("is-visible");
    visible = true;
    dismissing = false;
    const placeId = activeId;
    const fonts = document.fonts;
    if (fonts && fonts.status !== "loaded" && fonts.ready) {
      fonts.ready.then(() => {
        if (!visible || dismissing || activeId !== placeId) return;
        place();
      });
    }
    if (once && id) persistDismissed(id);
    if (!o.hold) {
      autoTimer = setTimeout(() => {
        autoTimer = null;
        dismiss();
      }, duration);
    }
    return true;
  }
  function onResize() {
    if (!visible || dismissing) return;
    place();
  }
  if (typeof Settings !== "undefined" && typeof Settings.subscribe === "function") {
    Settings.subscribe(function(e) {
      if (!visible || dismissing || !activeId || !e || e.origin === "local") return;
      var row = seenSetting(activeId);
      if (row && e && Array.isArray(e.ids) && e.ids.indexOf(row) !== -1 && setting(row) === true) dismiss();
    });
  }
  if (typeof Settings !== "undefined" && typeof Device !== "undefined") {
    carryForward(Device.get("dismissedHints"), setting).forEach(function(row) {
      Settings.set(row, true);
    });
  }
  global.Hint = {
    show,
    dismiss,
    wasDismissed,
    isVisible: function(id) {
      if (!visible || dismissing) return false;
      if (id == null) return true;
      return activeId === String(id);
    }
  };
  global.BelJarHint = global.Hint;

  // js/ui/menu.mjs
  var global2 = globalThis;
  var FRP = global2.FloatingRectPlacement;
  var MARGIN = FRP.DEFAULT_MARGIN;
  var customRowTypes = /* @__PURE__ */ Object.create(null);
  var allControllers = /* @__PURE__ */ new Set();
  var sharedGlobalsBound = false;
  var activeController = null;
  function submenuHoverOpen() {
    return FRP.prefersFineHover();
  }
  function onSharedPointerDown(e) {
    const c = activeController;
    if (!c || !c.menuRoot) return;
    const t = e.target;
    if (c.menuRoot.contains(t)) return;
    const ra = typeof c.rootAnchor === "function" ? c.rootAnchor() : null;
    if (ra && ra instanceof Node && ra.contains(t)) return;
    c.closeAll();
  }
  function onSharedKeydown(e) {
    if (e.key === "Escape" && activeController && activeController.isOpen()) {
      activeController.closeAll();
    }
  }
  function onSharedResize() {
    if (activeController && activeController.isOpen()) activeController.relayoutAll();
  }
  function attachSharedGlobals() {
    if (sharedGlobalsBound) return;
    document.addEventListener("pointerdown", onSharedPointerDown, true);
    document.addEventListener("keydown", onSharedKeydown, true);
    window.addEventListener("resize", onSharedResize);
    window.addEventListener("scroll", onSharedResize, true);
    sharedGlobalsBound = true;
  }
  function detachSharedGlobalsIfIdle() {
    if (!sharedGlobalsBound) return;
    if (activeController && activeController.isOpen()) return;
    document.removeEventListener("pointerdown", onSharedPointerDown, true);
    document.removeEventListener("keydown", onSharedKeydown, true);
    window.removeEventListener("resize", onSharedResize);
    window.removeEventListener("scroll", onSharedResize, true);
    sharedGlobalsBound = false;
  }
  function setActiveController(c) {
    activeController = c;
    if (c && c.isOpen()) attachSharedGlobals();
    else detachSharedGlobalsIfIdle();
  }
  function registerRowType(type, fn) {
    if (typeof type !== "string" || typeof fn !== "function") {
      throw new TypeError("Menu.registerRowType(type, fn): type string and fn required");
    }
    customRowTypes[type] = fn;
  }
  function createMenuController(menuRoot) {
    if (!menuRoot || !(menuRoot instanceof Element)) {
      throw new TypeError("Menu.create({ root }) requires a DOM element");
    }
    let openMenus = [];
    let rootAnchorEl = null;
    let rootOnClose = null;
    let submenuSourceRow = null;
    let submenuOpenTimer = null;
    const SUBMENU_OPEN_DELAY_MS = 90;
    const MENU_ITEM_TIP_DELAY_MS = 300;
    function hideMenuTooltips() {
      const T = global2.Tooltips;
      if (T && T.hide) T.hide();
    }
    function bindMenuItemTooltip(btn, item) {
      const text = item.tooltip;
      if (!text) return;
      const T = global2.Tooltips;
      if (!T) return;
      let timer = null;
      btn.addEventListener("mouseenter", () => {
        if (!FRP.prefersFineHover()) return;
        timer = setTimeout(() => {
          timer = null;
          if (!btn.isConnected) return;
          if (item.tooltipPlacement) {
            btn.setAttribute("data-tooltip-placement", item.tooltipPlacement);
          }
          T.set(btn, text, { ariaLabel: false });
          if (T.show) T.show(btn, { trackPointer: true });
        }, MENU_ITEM_TIP_DELAY_MS);
      });
      btn.addEventListener("mouseleave", () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        btn.removeAttribute("data-tooltip");
        btn.removeAttribute("data-tooltip-placement");
        hideMenuTooltips();
      });
    }
    const controller = { menuRoot };
    function isOpen2() {
      return openMenus.length > 0;
    }
    function rootAnchor() {
      return rootAnchorEl;
    }
    function anchorRect(anchor) {
      if (anchor instanceof Element) return anchor.getBoundingClientRect();
      return FRP.normalizeAnchor(anchor);
    }
    function submenuPlacementAnchor(anchorRowEl) {
      const parentMenuEl = anchorRowEl.closest(".menu");
      if (!parentMenuEl) {
        return { anchorRef: anchorRect(anchorRowEl), align: "start" };
      }
      const rowEls = Array.from(parentMenuEl.querySelectorAll(".menu-item"));
      const rowIdx = rowEls.indexOf(anchorRowEl);
      const rowRect = anchorRowEl.getBoundingClientRect();
      const menuRect = parentMenuEl.getBoundingClientRect();
      const anchorRef = {
        left: menuRect.left,
        right: menuRect.right,
        top: rowRect.top,
        bottom: rowRect.bottom
      };
      let align = "start";
      if (rowIdx === 0) {
        anchorRef.top = menuRect.top;
      } else if (rowIdx === rowEls.length - 1) {
        anchorRef.bottom = menuRect.bottom;
        align = "end";
      }
      return { anchorRef, align };
    }
    function dropGap(from) {
      const v = getComputedStyle(from).getPropertyValue("--header-menu-gap").trim();
      const n = parseFloat(v);
      if (!Number.isFinite(n)) return 0;
      return /rem$/.test(v) ? n * parseFloat(getComputedStyle(document.documentElement).fontSize) : n;
    }
    function layoutMenuEl(menuEl, anchor, side, align, isSubmenu, dropFrom) {
      let ar;
      if (isSubmenu && anchor instanceof Element) {
        const placed = submenuPlacementAnchor(anchor);
        ar = placed.anchorRef;
        align = placed.align;
      } else {
        ar = anchorRect(anchor);
      }
      if (dropFrom && !isSubmenu) {
        const bar = dropFrom.getBoundingClientRect();
        ar = { left: ar.left, right: ar.right, top: ar.top, bottom: bar.bottom + dropGap(dropFrom) };
      }
      const alreadyVisible = menuEl.classList.contains("is-visible");
      if (!alreadyVisible) {
        menuEl.classList.add("is-measuring");
        menuEl.style.left = "-9999px";
        menuEl.style.top = "0";
      }
      const tw = menuEl.offsetWidth;
      const th = menuEl.offsetHeight;
      const pos = FRP.computePosition({
        mode: "menu",
        anchor: ar,
        width: tw,
        height: th,
        margin: MARGIN,
        // Submenus sit flush against the parent's right edge (IDE style); root
        // menus sit flush against their trigger too.
        gap: 0,
        side,
        align
      });
      menuEl.classList.remove("is-measuring");
      menuEl.style.left = `${pos.x}px`;
      menuEl.style.top = `${pos.y}px`;
      menuEl.classList.add("is-visible");
    }
    function animateMenuOut(menuEl, done) {
      if (!menuEl.parentNode) {
        done();
        return;
      }
      menuEl.classList.remove("is-visible", "is-measuring");
      menuEl.classList.add("is-leaving");
      void menuEl.offsetHeight;
      const prop = "transform";
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        menuEl.removeEventListener("transitionend", onEnd);
        menuEl.remove();
        done();
      };
      const onEnd = (e) => {
        if (e.target !== menuEl || e.propertyName !== prop) return;
        finish();
      };
      menuEl.addEventListener("transitionend", onEnd);
      setTimeout(finish, FRP.OVERLAY_TRANSITION_FALLBACK_MS);
    }
    function relayoutAll() {
      for (let i = 0; i < openMenus.length; i++) {
        const { el: el5, anchorRef, side, align, isSubmenu, dropFrom } = openMenus[i];
        layoutMenuEl(el5, anchorRef, side, align, isSubmenu, dropFrom);
      }
    }
    function rovingTabIndexForPanel(menuEl) {
      const items = focusableMenuItems(menuEl);
      for (let i = 0; i < items.length; i++) {
        items[i].tabIndex = i === 0 ? 0 : -1;
      }
    }
    function focusableMenuItems(menuEl) {
      return Array.from(menuEl.querySelectorAll(":scope > .menu-item")).filter(
        (el5) => !el5.disabled && !el5.hasAttribute("data-menu-skip-focus")
      );
    }
    function focusMenuItem(menuEl, index) {
      const items = focusableMenuItems(menuEl);
      if (!items.length) return;
      const i = Math.max(0, Math.min(index, items.length - 1));
      for (let j = 0; j < items.length; j++) {
        items[j].tabIndex = j === i ? 0 : -1;
      }
      items[i].focus();
    }
    function handlePanelKeydown(e, wrap, level) {
      if (e.defaultPrevented) return;
      const key = e.key;
      const items = focusableMenuItems(wrap);
      if (!items.length) return;
      let idx = items.indexOf(document.activeElement);
      if (idx < 0) idx = 0;
      if (key === "ArrowDown") {
        e.preventDefault();
        focusMenuItem(wrap, idx + 1 >= items.length ? 0 : idx + 1);
        return;
      }
      if (key === "ArrowUp") {
        e.preventDefault();
        focusMenuItem(wrap, idx - 1 < 0 ? items.length - 1 : idx - 1);
        return;
      }
      if (key === "Home") {
        e.preventDefault();
        focusMenuItem(wrap, 0);
        return;
      }
      if (key === "End") {
        e.preventDefault();
        focusMenuItem(wrap, items.length - 1);
        return;
      }
      if (key === "ArrowRight") {
        const cur = items[idx];
        if (cur && cur.classList.contains("menu-item-has-submenu")) {
          e.preventDefault();
          const itemData = cur._menuItemData;
          if (itemData && itemData.submenu) openSubmenu(itemData.submenu, cur, level);
        }
        return;
      }
      if (key === "ArrowLeft") {
        if (openMenus.length > 1 && openMenus[openMenus.length - 1].el === wrap) {
          const top = openMenus[openMenus.length - 1];
          const parentTrigger = top.triggerEl;
          e.preventDefault();
          closeFromLevel(top.level, () => {
            if (parentTrigger && parentTrigger.isConnected) {
              const parentMenu = parentTrigger.closest(".menu");
              if (parentMenu) {
                const pitems = focusableMenuItems(parentMenu);
                const pi = pitems.indexOf(parentTrigger);
                if (pi >= 0) focusMenuItem(parentMenu, pi);
                else parentTrigger.focus();
              }
            }
          });
        }
        return;
      }
      if (key === "Enter" || key === " ") {
        const cur = items[idx];
        if (!cur) return;
        e.preventDefault();
        if (cur.classList.contains("menu-item-has-submenu")) {
          const itemData = cur._menuItemData;
          if (itemData && itemData.submenu) openSubmenu(itemData.submenu, cur, level);
        } else {
          cur.click();
        }
        return;
      }
      if (key === "Tab") {
        e.preventDefault();
        closeAll2();
        if (rootAnchorEl && rootAnchorEl.isConnected) rootAnchorEl.focus();
        return;
      }
    }
    function closeFromLevel(minLevel, done) {
      const batch = [];
      while (openMenus.length && openMenus[openMenus.length - 1].level >= minLevel) {
        batch.push(openMenus.pop());
      }
      if (!batch.length) {
        if (openMenus.length === 0 && menuRoot.querySelector(".menu")) {
          menuRoot.replaceChildren();
        }
        if (openMenus.length === 0) {
          setActiveController(null);
          hideMenuTooltips();
          const cb = rootOnClose;
          rootAnchorEl = null;
          rootOnClose = null;
          if (cb) cb();
        }
        if (done) done();
        return;
      }
      for (let i = 0; i < batch.length; i++) {
        if (batch[i].level >= 1) {
          submenuSourceRow = null;
          const trig = batch[i].triggerEl;
          if (trig) trig.classList.remove("is-submenu-open");
        }
      }
      let remaining = batch.length;
      const tick = () => {
        remaining--;
        if (remaining > 0) return;
        if (openMenus.length === 0) {
          setActiveController(null);
          hideMenuTooltips();
          const cb = rootOnClose;
          rootAnchorEl = null;
          rootOnClose = null;
          if (cb) cb();
        }
        if (done) done();
      };
      for (let i = 0; i < batch.length; i++) {
        animateMenuOut(batch[i].el, tick);
      }
    }
    function closeAll2(done) {
      closeFromLevel(0, done);
    }
    function forceCloseSync() {
      cancelScheduledSubmenuOpen();
      while (openMenus.length) {
        const entry = openMenus.pop();
        if (entry.triggerEl) entry.triggerEl.classList.remove("is-submenu-open");
        if (entry.el && entry.el.parentNode) entry.el.remove();
      }
      submenuSourceRow = null;
      if (menuRoot) menuRoot.replaceChildren();
      hideMenuTooltips();
      if (activeController === controller) setActiveController(null);
      const cb = rootOnClose;
      rootAnchorEl = null;
      rootOnClose = null;
      if (cb) cb();
    }
    function closeOtherControllers() {
      for (const inst of allControllers) {
        if (inst !== controller && inst.isOpen()) inst.forceCloseSync();
      }
    }
    function chevronSvg() {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "menu-item-chevron");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "m9 18 6-6-6-6");
      svg.appendChild(p);
      return svg;
    }
    function checkSvg() {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2.4");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M20 6 9 17l-5-5");
      svg.appendChild(p);
      return svg;
    }
    function buildIconSlot(icon) {
      const slot = document.createElement("span");
      slot.className = "menu-item-icon";
      slot.setAttribute("aria-hidden", "true");
      if (icon === "check") {
        slot.appendChild(checkSvg());
      } else if (icon instanceof Node) {
        slot.appendChild(icon);
      } else if (typeof icon === "string") {
        slot.innerHTML = icon;
      }
      return slot;
    }
    function buildDefaultMenuItem(item, wrap, level, usesCheckGutter) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "menu-item";
      btn.setAttribute("role", "menuitem");
      btn.tabIndex = -1;
      if (item.disabled) {
        btn.disabled = true;
      }
      const iconSource = item.checked ? "check" : item.icon;
      if (iconSource || usesCheckGutter) {
        btn.classList.add("menu-item-has-icon");
        btn.appendChild(buildIconSlot(iconSource || null));
      }
      if (item.checked) {
        btn.classList.add("is-checked");
        btn.setAttribute("role", "menuitemcheckbox");
        btn.setAttribute("aria-checked", "true");
      }
      const label = document.createElement("span");
      label.className = "menu-item-label";
      label.textContent = item.label ?? "";
      btn.appendChild(label);
      if (item.submenu && item.submenu.length) {
        btn.classList.add("menu-item-has-submenu");
        btn.appendChild(chevronSvg());
        btn._menuItemData = { submenu: item.submenu };
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openSubmenu(item.submenu, btn, level);
        });
      } else {
        btn._menuItemData = { submenu: null };
        if (item.shortcut) {
          btn.classList.add("menu-item-has-shortcut");
          const sc = document.createElement("span");
          sc.className = "menu-item-shortcut";
          sc.textContent = item.shortcut;
          btn.appendChild(sc);
        }
      }
      if (level === 0) {
        btn.addEventListener("mouseenter", () => {
          if (submenuSourceRow && submenuSourceRow !== btn) {
            if (!(item.submenu && item.submenu.length && submenuHoverOpen())) {
              scheduleCloseSubmenus();
            }
          }
          if (item.submenu && item.submenu.length && submenuHoverOpen()) {
            scheduleOpenSubmenu(item.submenu, btn, level);
          }
        });
        btn.addEventListener("mouseleave", cancelScheduledSubmenuOpen);
      } else if (item.submenu && item.submenu.length) {
        btn.addEventListener("mouseenter", () => {
          if (submenuHoverOpen()) scheduleOpenSubmenu(item.submenu, btn, level);
        });
        btn.addEventListener("mouseleave", cancelScheduledSubmenuOpen);
      }
      if (!(item.submenu && item.submenu.length) && typeof item.onSelect === "function") {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          item.onSelect();
          closeAll2();
        });
      }
      if (item.tooltip) bindMenuItemTooltip(btn, item);
      wrap.appendChild(btn);
    }
    function buildSeparator() {
      const sep = document.createElement("div");
      sep.className = "menu-separator";
      sep.setAttribute("role", "separator");
      return sep;
    }
    function buildSection(item) {
      const sec = document.createElement("div");
      sec.className = "menu-section" + (item.className ? ` ${item.className}` : "");
      sec.setAttribute("role", "presentation");
      sec.textContent = item.label ?? "";
      return sec;
    }
    function buildStatus(item) {
      const row = document.createElement("div");
      row.className = "menu-status" + (item.tone ? ` is-${item.tone}` : "") + (item.className ? ` ${item.className}` : "");
      row.setAttribute("role", "presentation");
      if (item.media) row.appendChild(item.media);
      const text = document.createElement("div");
      text.className = "menu-status-text";
      const title = document.createElement("div");
      title.className = "menu-status-title";
      title.textContent = item.title ?? item.label ?? "";
      text.appendChild(title);
      if (item.detail) {
        const detail = document.createElement("div");
        detail.className = "menu-status-detail";
        detail.textContent = item.detail;
        text.appendChild(detail);
      }
      row.appendChild(text);
      return row;
    }
    function normalizeMenuItems(items) {
      if (!items || !items.length) return [];
      var out = [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var rowType = item.type || "item";
        if (rowType === "separator") {
          if (!out.length) continue;
          if ((out[out.length - 1].type || "item") === "separator") continue;
          out.push(item);
        } else {
          out.push(item);
        }
      }
      if (out.length && (out[out.length - 1].type || "item") === "separator") out.pop();
      return out;
    }
    function buildMenu(items, level) {
      items = normalizeMenuItems(items);
      const wrap = document.createElement("div");
      wrap.className = level > 0 ? "menu is-submenu" : "menu";
      wrap.setAttribute("role", "menu");
      wrap.addEventListener("keydown", (e) => handlePanelKeydown(e, wrap, level));
      let hasIcons = false;
      const usesCheckGutter = items.some((item) => {
        const rowType = item.type || "item";
        return rowType === "item" && item.checked;
      });
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const rowType = item.type || "item";
        if (rowType === "separator") {
          wrap.appendChild(buildSeparator());
          continue;
        }
        if (rowType === "section") {
          wrap.appendChild(buildSection(item));
          continue;
        }
        if (rowType === "status") {
          wrap.appendChild(buildStatus(item));
          continue;
        }
        if (rowType !== "item" && customRowTypes[rowType]) {
          const node = customRowTypes[rowType](item, wrap, level, controller);
          if (node) wrap.appendChild(node);
          continue;
        }
        if (rowType !== "item") {
          console.warn("[Menu] unknown row type:", rowType, "\u2014 using default item row");
        }
        if (item.icon || item.checked || usesCheckGutter) hasIcons = true;
        buildDefaultMenuItem(item, wrap, level, usesCheckGutter);
      }
      if (hasIcons) wrap.classList.add("menu--has-icons");
      return wrap;
    }
    function isSubmenuOpenForRow(anchorRowEl, parentLevel) {
      const lvl = parentLevel + 1;
      for (let i = 0; i < openMenus.length; i++) {
        const m = openMenus[i];
        if (m.level === lvl && m.triggerEl === anchorRowEl) return true;
      }
      return false;
    }
    function cancelScheduledSubmenuOpen() {
      if (submenuOpenTimer !== null) {
        clearTimeout(submenuOpenTimer);
        submenuOpenTimer = null;
      }
    }
    function scheduleOpenSubmenu(items, anchorRowEl, parentLevel) {
      cancelScheduledSubmenuOpen();
      submenuOpenTimer = setTimeout(() => {
        submenuOpenTimer = null;
        if (anchorRowEl.isConnected) openSubmenu(items, anchorRowEl, parentLevel);
      }, SUBMENU_OPEN_DELAY_MS);
    }
    function scheduleCloseSubmenus() {
      cancelScheduledSubmenuOpen();
      submenuOpenTimer = setTimeout(() => {
        submenuOpenTimer = null;
        closeFromLevel(1);
      }, SUBMENU_OPEN_DELAY_MS);
    }
    function openSubmenu(items, anchorRowEl, parentLevel) {
      cancelScheduledSubmenuOpen();
      if (isSubmenuOpenForRow(anchorRowEl, parentLevel)) return;
      closeFromLevel(parentLevel + 1, () => {
        submenuSourceRow = anchorRowEl;
        anchorRowEl.classList.add("is-submenu-open");
        const level = parentLevel + 1;
        const placed = submenuPlacementAnchor(anchorRowEl);
        const menuEl = buildMenu(items, level);
        menuEl.classList.add("is-flyout");
        menuRoot.appendChild(menuEl);
        openMenus.push({
          el: menuEl,
          level,
          anchorRef: anchorRowEl,
          triggerEl: anchorRowEl,
          side: "right",
          align: placed.align,
          isSubmenu: true
        });
        layoutMenuEl(menuEl, anchorRowEl, "right", placed.align, true);
        rovingTabIndexForPanel(menuEl);
        focusMenuItem(menuEl, 0);
      });
    }
    function open6(opts) {
      closeOtherControllers();
      const items = opts.items;
      const anchor = opts.anchor;
      const side = opts.side;
      const align = opts.align ?? "start";
      const launch = () => {
        rootOnClose = opts.onClose || null;
        rootAnchorEl = anchor instanceof Element ? anchor : null;
        const menuEl = buildMenu(items, 0);
        if (side === "bottom") {
          menuEl.classList.add("is-drop-down");
          if (align === "end") menuEl.classList.add("is-align-end");
        } else if (side === "right") {
          menuEl.classList.add("is-flyout");
        }
        menuRoot.appendChild(menuEl);
        openMenus.push({
          el: menuEl,
          level: 0,
          anchorRef: anchor,
          triggerEl: null,
          side,
          align,
          isSubmenu: false,
          dropFrom: opts.dropFrom || null
        });
        layoutMenuEl(menuEl, anchor, side, align, false, opts.dropFrom || null);
        setActiveController(controller);
        rovingTabIndexForPanel(menuEl);
        focusMenuItem(menuEl, 0);
        if (typeof opts.onReady === "function") opts.onReady();
      };
      if (openMenus.length > 0 || menuRoot.querySelector(".menu")) {
        closeFromLevel(0, launch);
      } else {
        launch();
      }
    }
    function openContext(opts) {
      const x = opts.x;
      const y = opts.y;
      open6({
        anchor: { left: x, right: x, top: y, bottom: y },
        side: opts.side || "bottom",
        align: opts.align || "start",
        items: opts.items,
        onClose: opts.onClose,
        onReady: opts.onReady
      });
    }
    function bindContextMenu(targetEl, itemsOrFn, opts) {
      if (!(targetEl instanceof Element)) {
        throw new TypeError("bindContextMenu(targetEl, items): targetEl must be an element");
      }
      const handler = (e) => {
        const items = typeof itemsOrFn === "function" ? itemsOrFn(e) : itemsOrFn;
        if (!items || !items.length) return;
        e.preventDefault();
        openContext({
          x: e.clientX,
          y: e.clientY,
          items,
          side: opts && opts.side,
          align: opts && opts.align,
          onClose: opts && opts.onClose
        });
      };
      targetEl.addEventListener("contextmenu", handler);
      return () => targetEl.removeEventListener("contextmenu", handler);
    }
    function update2(anchor, items) {
      if (!openMenus.length || !anchor || rootAnchorEl !== anchor) return false;
      const root = openMenus[0];
      while (openMenus.length > 1) openMenus.pop().el.remove();
      submenuSourceRow = null;
      const fresh = buildMenu(items, 0);
      for (const c of root.el.classList) if (c !== "menu" && c !== "menu--has-icons") fresh.classList.add(c);
      fresh.style.left = root.el.style.left;
      fresh.style.top = root.el.style.top;
      const hadFocus = root.el.contains(document.activeElement);
      root.el.replaceWith(fresh);
      root.el = fresh;
      layoutMenuEl(fresh, root.anchorRef, root.side, root.align, false, root.dropFrom);
      rovingTabIndexForPanel(fresh);
      if (hadFocus) focusMenuItem(fresh, 0);
      return true;
    }
    function destroy() {
      allControllers.delete(controller);
      if (activeController === controller) setActiveController(null);
      forceCloseSync();
    }
    controller.open = open6;
    controller.openContext = openContext;
    controller.bindContextMenu = bindContextMenu;
    controller.closeAll = closeAll2;
    controller.isOpen = isOpen2;
    controller.rootAnchor = rootAnchor;
    controller.update = update2;
    controller.relayoutAll = relayoutAll;
    controller.forceCloseSync = forceCloseSync;
    controller.destroy = destroy;
    allControllers.add(controller);
    return controller;
  }
  var defaultRoot = document.getElementById("menu-root");
  var defaultMenu = defaultRoot ? createMenuController(defaultRoot) : null;
  var dialogMenuControllers = /* @__PURE__ */ new WeakMap();
  function menuControllerForAnchor(anchor) {
    if (!(anchor instanceof Element)) return defaultMenu;
    const dlg = anchor.closest("dialog.jar-dialog[open]");
    if (!dlg) return defaultMenu;
    let ctrl = dialogMenuControllers.get(dlg);
    if (ctrl) return ctrl;
    let root = dlg.querySelector(":scope > .menu-root");
    if (!root) {
      root = document.createElement("div");
      root.className = "menu-root menu-root--dialog";
      dlg.appendChild(root);
    }
    ctrl = createMenuController(root);
    dialogMenuControllers.set(dlg, ctrl);
    dlg.addEventListener("close", function() {
      const c = dialogMenuControllers.get(dlg);
      if (c) {
        c.forceCloseSync();
        c.destroy();
      }
      dialogMenuControllers.delete(dlg);
    }, { once: true });
    return ctrl;
  }
  global2.Menu = {
    open(opts) {
      const anchor = opts && opts.anchor;
      const ctrl = menuControllerForAnchor(anchor instanceof Element ? anchor : null);
      if (ctrl) ctrl.open(opts);
    },
    openContext(opts) {
      if (defaultMenu) defaultMenu.openContext(opts);
    },
    /** The open menu anchored at `anchor`, rebuilt from `items` in place: false when it is not open. */
    update(anchor, items) {
      const ctrl = menuControllerForAnchor(anchor instanceof Element ? anchor : null);
      return ctrl ? ctrl.update(anchor, items) : false;
    },
    bindContextMenu(targetEl, itemsOrFn, opts) {
      if (defaultMenu) return defaultMenu.bindContextMenu(targetEl, itemsOrFn, opts);
      return () => {
      };
    },
    closeAll(done) {
      if (defaultMenu) defaultMenu.closeAll(done);
    },
    isOpen() {
      return defaultMenu ? defaultMenu.isOpen() : false;
    },
    rootAnchor() {
      return defaultMenu ? defaultMenu.rootAnchor() : null;
    },
    create(opts) {
      return createMenuController(opts.root);
    },
    registerRowType
  };

  // js/ui/menu-trigger.mjs
  var g4 = typeof window !== "undefined" ? window : globalThis;
  function wireMenuTrigger(btn, menuOpts) {
    if (!btn) return;
    let suppressNextClick = false;
    function setOpen2(open6) {
      btn.classList.toggle("is-active", open6);
      btn.setAttribute("aria-expanded", open6 ? "true" : "false");
    }
    function quietTooltip() {
      if (!g4.Tooltips) return;
      g4.Tooltips.suppressAnchor(btn);
      g4.Tooltips.hide();
    }
    function runMenuInteraction() {
      const Menu = g4.Menu;
      if (!Menu) return;
      if (Menu.isOpen() && Menu.rootAnchor() === btn) {
        Menu.closeAll();
        return;
      }
      const items = typeof menuOpts.items === "function" ? menuOpts.items() : menuOpts.items;
      Menu.open({
        anchor: btn,
        side: menuOpts.side,
        align: menuOpts.align,
        // ⛔ A button in the top bar drops its menu from the bar's bottom edge, the
        // same for every one of them (`--header-menu-gap`, css/tokens.css). The
        // menu bar's own items (Project, Edit, Tools) open flush under themselves,
        // as a menu bar's do (Dean tried both, 2026-10-06).
        dropFrom: btn.closest(".header-menu") ? null : btn.closest("body > header") || null,
        items,
        onClose: () => setOpen2(false)
      });
      setOpen2(true);
    }
    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      suppressNextClick = true;
      quietTooltip();
      runMenuInteraction();
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      quietTooltip();
      runMenuInteraction();
    });
  }
  g4.MenuTrigger = { wire: wireMenuTrigger };

  // js/ui/floating-window.mjs
  var global3 = globalThis;
  var MARGIN2 = 8;
  var open = /* @__PURE__ */ new Set();
  var zTop = 4e3;
  function clamp2(v, lo, hi) {
    return Math.min(Math.max(v, lo), hi);
  }
  function viewportW() {
    return typeof global3.innerWidth === "number" ? global3.innerWidth : 1024;
  }
  function viewportH() {
    return typeof global3.innerHeight === "number" ? global3.innerHeight : 768;
  }
  function makeEl(tag, cls) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }
  function openWindow(opts) {
    opts = opts || {};
    const minWidth = opts.minWidth || 220;
    const minHeight = opts.minHeight || 140;
    let width = clamp2(opts.width || 320, minWidth, viewportW() - MARGIN2 * 2);
    let height = clamp2(opts.height || 380, minHeight, viewportH() - MARGIN2 * 2);
    const root = makeEl("div", "floating-window" + (opts.className ? " " + opts.className : ""));
    root.style.width = width + "px";
    root.style.height = height + "px";
    const bar = makeEl("div", "floating-window-bar");
    const titleEl = makeEl("span", "floating-window-title");
    setTitleContent(titleEl, opts.title);
    const barActions = makeEl("div", "floating-window-actions");
    const actionBtns = [];
    if (Array.isArray(opts.actions)) {
      for (const act2 of opts.actions) {
        const btn = makeEl("button", "floating-window-action");
        btn.type = "button";
        btn.innerHTML = act2.icon || "";
        const tip = (on) => on && act2.labelOn ? act2.labelOn : act2.label;
        if (act2.toggle) {
          const setPressed = (on) => {
            btn.classList.toggle("is-on", !!on);
            btn.setAttribute("aria-pressed", on ? "true" : "false");
            const t = tip(on);
            if (t) btn.setAttribute("aria-label", t);
            if (global3.Tooltips?.set) global3.Tooltips.set(btn, t);
          };
          setPressed(!!act2.pressed);
          if (act2.ref) act2.ref.setPressed = setPressed;
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const next = !btn.classList.contains("is-on");
            setPressed(next);
            if (typeof act2.onToggle === "function") act2.onToggle(next);
          });
        } else {
          if (act2.label) btn.setAttribute("aria-label", act2.label);
          if (typeof act2.tooltip === "function" && global3.Tooltips?.setRich) {
            global3.Tooltips.setRich(btn, act2.tooltip, act2.label);
            btn.classList.add("floating-window-action--info");
          } else if (global3.Tooltips?.set && act2.label) {
            global3.Tooltips.set(btn, act2.label);
          }
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (typeof act2.onClick === "function") act2.onClick();
          });
        }
        actionBtns.push(btn);
        barActions.appendChild(btn);
      }
    }
    const closeBtn2 = makeEl("button", "floating-window-close");
    closeBtn2.type = "button";
    closeBtn2.setAttribute("aria-label", "Close");
    closeBtn2.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    bar.append(titleEl, barActions, closeBtn2);
    const body = makeEl("div", "floating-window-body");
    if (opts.content) body.appendChild(opts.content);
    const grip = makeEl("div", "floating-window-grip");
    grip.setAttribute("aria-hidden", "true");
    root.append(bar, body, grip);
    document.body.appendChild(root);
    let x = typeof opts.x === "number" ? opts.x : Math.round((viewportW() - width) / 2);
    let y = typeof opts.y === "number" ? opts.y : Math.round(viewportH() * 0.18);
    x = clamp2(x, MARGIN2, viewportW() - width - MARGIN2);
    y = clamp2(y, MARGIN2, viewportH() - height - MARGIN2);
    root.style.left = x + "px";
    root.style.top = y + "px";
    function notifyGeometryChange() {
      if (typeof opts.onGeometryChange === "function") {
        try {
          opts.onGeometryChange(getGeometry());
        } catch (_) {
        }
      }
    }
    function getGeometry() {
      return {
        x: Math.round(parseFloat(root.style.left) || x),
        y: Math.round(parseFloat(root.style.top) || y),
        w: root.offsetWidth,
        h: root.offsetHeight
      };
    }
    function raise() {
      zTop += 1;
      root.style.zIndex = String(zTop);
    }
    raise();
    root.addEventListener("pointerdown", raise, true);
    let dragP = null;
    function onDragMove(e) {
      if (!dragP) return;
      e.preventDefault();
      x = clamp2(dragP.startX + (e.clientX - dragP.px), MARGIN2, viewportW() - root.offsetWidth - MARGIN2);
      y = clamp2(dragP.startY + (e.clientY - dragP.py), MARGIN2, viewportH() - root.offsetHeight - MARGIN2);
      root.style.left = x + "px";
      root.style.top = y + "px";
    }
    function onDragUp() {
      if (!dragP) return;
      dragP = null;
      global3.removeEventListener("pointermove", onDragMove);
      global3.removeEventListener("pointerup", onDragUp);
      global3.removeEventListener("pointercancel", onDragUp);
      document.body.classList.remove("floating-window-dragging");
      notifyGeometryChange();
    }
    bar.addEventListener("pointerdown", (e) => {
      if (e.target === closeBtn2 || closeBtn2.contains(e.target)) return;
      for (const b of actionBtns) {
        if (e.target === b || b.contains(e.target)) return;
      }
      if (e.button !== 0) return;
      dragP = { px: e.clientX, py: e.clientY, startX: x, startY: y };
      document.body.classList.add("floating-window-dragging");
      global3.addEventListener("pointermove", onDragMove);
      global3.addEventListener("pointerup", onDragUp);
      global3.addEventListener("pointercancel", onDragUp);
      e.preventDefault();
    });
    let rez = null;
    function onRezMove(e) {
      if (!rez) return;
      e.preventDefault();
      width = clamp2(rez.startW + (e.clientX - rez.px), minWidth, viewportW() - x - MARGIN2);
      height = clamp2(rez.startH + (e.clientY - rez.py), minHeight, viewportH() - y - MARGIN2);
      root.style.width = width + "px";
      root.style.height = height + "px";
    }
    function onRezUp() {
      if (!rez) return;
      rez = null;
      global3.removeEventListener("pointermove", onRezMove);
      global3.removeEventListener("pointerup", onRezUp);
      global3.removeEventListener("pointercancel", onRezUp);
      document.body.classList.remove("floating-window-resizing");
      notifyGeometryChange();
    }
    grip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      rez = { px: e.clientX, py: e.clientY, startW: root.offsetWidth, startH: root.offsetHeight };
      document.body.classList.add("floating-window-resizing");
      global3.addEventListener("pointermove", onRezMove);
      global3.addEventListener("pointerup", onRezUp);
      global3.addEventListener("pointercancel", onRezUp);
      e.preventDefault();
      e.stopPropagation();
    });
    let closed = false;
    function close2() {
      if (closed) return;
      closed = true;
      onDragUp();
      onRezUp();
      root.removeEventListener("pointerdown", raise, true);
      if (root.parentNode) root.parentNode.removeChild(root);
      open.delete(handle);
      if (typeof opts.onClose === "function") {
        try {
          opts.onClose();
        } catch (_) {
        }
      }
    }
    closeBtn2.addEventListener("click", close2);
    function setTitleContent(target, title) {
      target.textContent = "";
      if (title == null) return;
      if (title instanceof Node) target.appendChild(title);
      else target.textContent = String(title);
    }
    const handle = {
      el: root,
      body,
      close: close2,
      getGeometry,
      setContent(node) {
        body.textContent = "";
        if (node) body.appendChild(node);
      },
      setTitle(title) {
        setTitleContent(titleEl, title);
      },
      raise
    };
    open.add(handle);
    return handle;
  }
  function closeAll() {
    for (const h of [...open]) h.close();
  }
  global3.FloatingWindow = { open: openWindow, closeAll };

  // js/ui/dialog.mjs
  var DIALOG_ROOT_CLASS = "jar-dialog";
  var dialogs = /* @__PURE__ */ new WeakMap();
  var SURFACE_SEARCH_SELECTOR = 'input[type="search"]:not([disabled]), [data-surface-find]';
  var PALETTE_PREFIXES = "/@>%#!?:";
  function isRecordingChordTarget(e) {
    const t = e && e.target || (typeof document !== "undefined" ? document.activeElement : null);
    return !!(t && t.classList && t.classList.contains("jar-kb__chord") && t.classList.contains("is-recording"));
  }
  function isFindEvent(e) {
    const KB = globalThis.Keybindings;
    if (KB && typeof KB.matchesId === "function") return KB.matchesId(e, "edit.find");
    if (!e || e.altKey || e.shiftKey) return false;
    if (!(e.ctrlKey || e.metaKey)) return false;
    return String(e.key).toLowerCase() === "f";
  }
  function findSurfaceSearchInput(root) {
    if (!root || typeof root.querySelector !== "function") return null;
    const el5 = root.querySelector(SURFACE_SEARCH_SELECTOR);
    if (!el5 || el5.disabled) return null;
    return el5;
  }
  function capturingSearchInput() {
    if (typeof document === "undefined") return null;
    const open6 = document.querySelectorAll("dialog." + DIALOG_ROOT_CLASS + "[open]:not(.is-leaving)");
    for (let i = open6.length - 1; i >= 0; i--) {
      const input = findSurfaceSearchInput(open6[i]);
      if (input) return input;
    }
    const palette = document.querySelector(".jar-palette.is-open");
    return palette ? findSurfaceSearchInput(palette) : null;
  }
  function focusSurfaceSearch(input) {
    if (!input || typeof input.focus !== "function") return false;
    input.focus();
    const v = String(input.value || "");
    if (input.classList && input.classList.contains("jar-palette-input")) {
      const start = v.length && PALETTE_PREFIXES.includes(v[0]) ? 1 : 0;
      try {
        input.setSelectionRange(start, v.length);
      } catch (_) {
      }
      return true;
    }
    try {
      input.select();
    } catch (_) {
    }
    return true;
  }
  function onCapturingFind(e) {
    if (!e || e.isComposing || e.defaultPrevented) return;
    if (isRecordingChordTarget(e)) return;
    if (!isFindEvent(e)) return;
    const input = capturingSearchInput();
    if (!input) return;
    e.preventDefault();
    e.stopPropagation();
    focusSurfaceSearch(input);
  }
  if (typeof document !== "undefined") {
    document.addEventListener("keydown", onCapturingFind, true);
  }
  function parseMs(cssValue, fallback) {
    const n = parseFloat(String(cssValue || "").trim());
    return Number.isFinite(n) ? n : fallback;
  }
  function closeDurationMs() {
    return parseMs(getComputedStyle(document.documentElement).getPropertyValue("--dialog-ms-out"), 132);
  }
  function dialogInfo(dialogEl) {
    return dialogs.get(dialogEl);
  }
  function registerDialog(dialogEl, removeOnClose) {
    if (!dialogEl || dialogs.has(dialogEl)) return dialogEl || null;
    const info = {
      removeOnClose: !!removeOnClose,
      isClosing: false,
      timer: null
    };
    dialogEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target !== dialogEl) return;
      function cleanup() {
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", cleanup);
      }
      function onPointerUp(upE) {
        if (upE.target === dialogEl) requestDialogClose(dialogEl);
        cleanup();
      }
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", cleanup);
    });
    dialogEl.addEventListener("cancel", (e) => {
      e.preventDefault();
      requestDialogClose(dialogEl);
    });
    dialogEl.addEventListener("close", () => {
      info.isClosing = false;
      if (info.timer) {
        clearTimeout(info.timer);
        info.timer = null;
      }
      dialogEl.classList.remove("is-leaving");
      if (info.removeOnClose) {
        dialogs.delete(dialogEl);
        dialogEl.remove();
      }
    });
    dialogs.set(dialogEl, info);
    return dialogEl;
  }
  function openDialog(dialogEl) {
    if (!dialogEl) return null;
    registerDialog(dialogEl);
    const info = dialogInfo(dialogEl);
    if (!info) return dialogEl;
    info.isClosing = false;
    dialogEl.classList.remove("is-leaving");
    if (info.timer) {
      clearTimeout(info.timer);
      info.timer = null;
    }
    if (!dialogEl.open) dialogEl.showModal();
    return dialogEl;
  }
  function requestDialogClose(dialogEl) {
    if (!dialogEl) return;
    const info = dialogInfo(dialogEl);
    if (!info || !dialogEl.open || info.isClosing) return;
    info.isClosing = true;
    dialogEl.classList.add("is-leaving");
    if (info.timer) {
      clearTimeout(info.timer);
      info.timer = null;
    }
    const ms = closeDurationMs();
    info.timer = setTimeout(() => {
      info.timer = null;
      if (dialogEl.open) dialogEl.close();
    }, ms);
  }
  function applyDialogBodyContent(body, opts) {
    const c = opts.content;
    const isNode = c != null && typeof c === "object" && typeof c.nodeType === "number";
    if (isNode) {
      body.appendChild(c);
    } else if (opts.htmlContent != null) {
      body.innerHTML = String(opts.htmlContent);
    } else if (c != null) {
      body.textContent = String(c);
    }
  }
  function createDialog(opts) {
    opts = opts || {};
    const className = opts.className || "";
    const cardClass = opts.cardClass || "";
    const title = opts.title;
    const closeButton = opts.closeButton !== false;
    const closeLabel = opts.closeLabel || "Close dialog";
    const removeOnClose = opts.removeOnClose !== false;
    const dialogEl = document.createElement("dialog");
    dialogEl.className = [DIALOG_ROOT_CLASS, className].filter(Boolean).join(" ");
    const card = document.createElement("div");
    card.className = ["jar-dialog__card", cardClass].filter(Boolean).join(" ");
    if (closeButton) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "jar-dialog__close icon-btn";
      btn.setAttribute("aria-label", closeLabel);
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        requestDialogClose(dialogEl);
      });
      card.appendChild(btn);
    }
    const headerExtra = opts.headerExtra instanceof Node ? opts.headerExtra : null;
    if (title || headerExtra) {
      let titleEl = null;
      if (title) {
        titleEl = document.createElement("div");
        titleEl.className = "jar-dialog__title";
        titleEl.id = "jar-dialog-title-" + Math.random().toString(36).slice(2);
        titleEl.textContent = title;
        dialogEl.setAttribute("aria-labelledby", titleEl.id);
      }
      if (headerExtra) {
        const header = document.createElement("div");
        header.className = "jar-dialog__header";
        if (titleEl) header.appendChild(titleEl);
        header.appendChild(headerExtra);
        card.appendChild(header);
      } else {
        card.appendChild(titleEl);
      }
    } else if (opts.ariaLabel) {
      dialogEl.setAttribute("aria-label", opts.ariaLabel);
    }
    const body = document.createElement("div");
    body.className = "jar-dialog__body";
    applyDialogBodyContent(body, opts);
    card.appendChild(body);
    dialogEl.appendChild(card);
    document.body.appendChild(dialogEl);
    registerDialog(dialogEl, removeOnClose);
    return dialogEl;
  }
  function closeAllDialogs() {
    document.querySelectorAll(`dialog.${DIALOG_ROOT_CLASS}[open]`).forEach((dlg) => {
      requestDialogClose(dlg);
    });
  }
  function setDialogFooterError(root, message) {
    if (!root) return;
    const foot = root.querySelector("[data-dialog-foot]") || (root.matches && root.matches("[data-dialog-foot]") ? root : null);
    if (!foot) return;
    const preview = foot.querySelector("[data-dialog-foot-preview]");
    const warn = foot.querySelector("[data-dialog-foot-warning]");
    if (!preview || !warn) return;
    if (message) {
      warn.textContent = message;
      warn.hidden = false;
      preview.hidden = true;
    } else {
      warn.textContent = "";
      warn.hidden = true;
      preview.hidden = false;
    }
  }
  var Dialog = {
    registerDialog,
    openDialog,
    requestDialogClose,
    createDialog,
    closeAllDialogs,
    setDialogFooterError,
    findSurfaceSearchInput,
    focusSurfaceSearch
  };
  var g5 = typeof window !== "undefined" ? window : globalThis;
  g5.Dialog = Dialog;
  g5.BelJarDialog = g5.Dialog;

  // js/ui/prompt-dialog.mjs
  var CARD_CLASS = "jar-dialog__card jar-prompt-dialog__card";
  var WRAP_CLASS = "jar-prompt-dialog-wrap";
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function markMono(name) {
    const span = el("span", "jar-prompt-dialog__mono");
    span.textContent = name;
    return span;
  }
  function actionButton(label, action, variant, opts) {
    opts = opts || {};
    const btn = el("button", "jar-prompt-dialog__btn" + (variant ? ` is-${variant}` : ""));
    btn.type = "button";
    btn.dataset.action = action;
    if (opts.monoSuffix) {
      if (opts.labelPrefix) {
        btn.appendChild(el("span", "jar-prompt-dialog__btn-prefix", opts.labelPrefix));
      }
      const mono = el("span", "jar-prompt-dialog__btn-mono");
      mono.textContent = opts.monoSuffix;
      btn.appendChild(mono);
    } else {
      btn.textContent = label;
    }
    return btn;
  }
  function buildActions(buttons, layout) {
    const actions = el("div", "jar-prompt-dialog__actions");
    if (layout === "row") actions.classList.add("is-row");
    for (const b of buttons) {
      const btnOpts = {};
      if (b.monoSuffix != null) {
        btnOpts.monoSuffix = b.monoSuffix;
        if (b.labelPrefix) btnOpts.labelPrefix = b.labelPrefix;
      }
      actions.appendChild(actionButton(b.label, b.action, b.variant, btnOpts));
    }
    return actions;
  }
  function buildRowActions(buttons) {
    return buildActions(buttons, "row");
  }
  function appendBody(shell, opts) {
    if (opts.body instanceof Node) {
      shell.appendChild(opts.body);
      return;
    }
    if (opts.step) {
      shell.appendChild(el("p", "jar-prompt-dialog__step", opts.step));
    }
    if (opts.subject) {
      const subject = el("p", "jar-prompt-dialog__subject");
      subject.appendChild(markMono(opts.subject));
      shell.appendChild(subject);
    }
    if (opts.message != null) {
      const intro = el("p", "jar-prompt-dialog__message");
      if (opts.message instanceof Node) intro.appendChild(opts.message);
      else intro.textContent = String(opts.message);
      shell.appendChild(intro);
    }
    if (opts.note) {
      shell.appendChild(el("p", "jar-prompt-dialog__note", opts.note));
    }
  }
  function open2(opts) {
    opts = opts || {};
    return new Promise((resolve2) => {
      let settled = false;
      const shell = el("div", "jar-prompt-dialog");
      appendBody(shell, opts);
      const buttons = opts.buttons || [];
      if (buttons.length) {
        shell.appendChild(buildActions(buttons, opts.layout));
      }
      const dialogEl = createDialog({
        ariaLabel: opts.ariaLabel || opts.title || "Prompt",
        title: opts.title,
        content: shell,
        className: opts.className || WRAP_CLASS,
        cardClass: opts.cardClass || CARD_CLASS,
        closeButton: opts.closeButton !== false,
        removeOnClose: true
      });
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve2(value);
        requestDialogClose(dialogEl);
      }
      shell.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        finish(btn.dataset.action);
      });
      dialogEl.addEventListener("close", () => {
        if (!settled) finish(null);
      });
      openDialog(dialogEl);
      if (typeof opts.onOpen === "function") {
        requestAnimationFrame(() => {
          opts.onOpen(dialogEl, shell);
        });
      }
    });
  }
  var PromptDialog = {
    CARD_CLASS,
    WRAP_CLASS,
    el,
    markMono,
    actionButton,
    buildActions,
    buildRowActions,
    appendBody,
    open: open2
  };
  var g6 = typeof window !== "undefined" ? window : globalThis;
  g6.PromptDialog = PromptDialog;
  g6.BelJarPromptDialog = g6.PromptDialog;

  // js/ui/confirm-dialog.mjs
  function normalizeOpts(messageOrOpts, maybeOpts) {
    if (messageOrOpts != null && typeof messageOrOpts === "object" && !(messageOrOpts instanceof Node)) {
      return messageOrOpts;
    }
    return Object.assign({}, maybeOpts || {}, { message: messageOrOpts });
  }
  function confirm(messageOrOpts, maybeOpts) {
    const opts = normalizeOpts(messageOrOpts, maybeOpts);
    const danger = opts.danger !== false;
    return open2({
      ariaLabel: opts.ariaLabel || "Confirm",
      subject: opts.subject,
      message: opts.message,
      note: opts.note,
      className: opts.className || "jar-confirm-dialog-wrap",
      closeButton: opts.closeButton,
      layout: "row",
      buttons: [
        { action: "no", label: opts.cancelLabel || "Cancel", variant: "ghost" },
        {
          action: "yes",
          label: opts.confirmLabel || (danger ? "Delete" : "OK"),
          variant: danger ? "danger" : "primary"
        }
      ]
    }).then((action) => action === "yes");
  }
  var ConfirmDialog = { confirm };
  var g7 = typeof window !== "undefined" ? window : globalThis;
  g7.ConfirmDialog = ConfirmDialog;
  g7.BelJarConfirmDialog = g7.ConfirmDialog;

  // js/ui/name-prompt.mjs
  function defaultNormalize(raw) {
    return String(raw || "").trim();
  }
  function defaultValidate(name) {
    if (!name) return "Name is required.";
    return null;
  }
  function selectionForValue(value, selection) {
    const v = String(value || "");
    if (!selection) return { start: 0, end: v.length };
    let start = selection.start != null ? selection.start : 0;
    let end = selection.end != null ? selection.end : v.length;
    start = Math.max(0, Math.min(start, v.length));
    end = Math.max(start, Math.min(end, v.length));
    return { start, end };
  }
  function normalizeBelFileName(raw) {
    let name = String(raw || "").trim();
    if (!name) return "";
    if (name.indexOf(".") === -1) name += ".bel";
    return name;
  }
  function open3(opts) {
    opts = opts || {};
    const { el: el5, buildRowActions: buildRowActions2, CARD_CLASS: CARD_CLASS2 } = PromptDialog;
    const normalize2 = typeof opts.normalize === "function" ? opts.normalize : defaultNormalize;
    const validate = typeof opts.validate === "function" ? opts.validate : defaultValidate;
    const initialValue = opts.value != null ? String(opts.value) : "";
    const sel = selectionForValue(initialValue, opts.selection);
    let settled = false;
    return new Promise((resolve2) => {
      const wrap = el5("div", "jar-name-prompt");
      const leadEl = opts.message ? el5("p", "jar-name-prompt__message", opts.message) : null;
      const input = el5("input", "jar-name-prompt__input");
      input.type = "text";
      input.value = initialValue;
      input.autofocus = true;
      input.spellcheck = false;
      input.autocomplete = "off";
      if (opts.mono) input.classList.add("is-mono");
      if (opts.placeholder) input.placeholder = opts.placeholder;
      wrap.appendChild(input);
      const errorEl = el5("p", "jar-name-prompt__error");
      errorEl.hidden = true;
      wrap.appendChild(errorEl);
      if (opts.hint) {
        const hint = el5("p", "jar-name-prompt__hint");
        hint.textContent = opts.hint;
        wrap.appendChild(hint);
      }
      const actions = buildRowActions2([
        { action: "cancel", label: opts.cancelLabel || "Cancel", variant: "ghost" },
        { action: "confirm", label: opts.confirmLabel || "Create", variant: "primary" }
      ]);
      actions.classList.add("jar-name-prompt__actions");
      const cancelBtn = actions.querySelector('[data-action="cancel"]');
      const confirmBtn = actions.querySelector('[data-action="confirm"]');
      wrap.appendChild(actions);
      const dialogEl = createDialog({
        ariaLabel: opts.ariaLabel || "Name",
        content: wrap,
        className: "jar-name-prompt-dialog",
        cardClass: CARD_CLASS2,
        removeOnClose: true
      });
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve2(value);
        requestDialogClose(dialogEl);
      }
      function showError(msg) {
        if (msg) {
          errorEl.textContent = msg;
          errorEl.hidden = false;
          input.classList.add("is-invalid");
          confirmBtn.disabled = true;
        } else {
          errorEl.textContent = "";
          errorEl.hidden = true;
          input.classList.remove("is-invalid");
          confirmBtn.disabled = false;
        }
      }
      function currentNormalized() {
        return normalize2(input.value);
      }
      function tryConfirm() {
        const name = currentNormalized();
        const err = validate(name);
        if (err) {
          showError(err);
          return;
        }
        finish(name);
      }
      input.addEventListener("input", () => {
        showError(validate(currentNormalized()));
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          tryConfirm();
        }
      });
      cancelBtn.addEventListener("click", () => {
        finish(null);
      });
      confirmBtn.addEventListener("click", () => {
        tryConfirm();
      });
      if (leadEl) {
        const card = dialogEl.querySelector(".jar-dialog__card");
        const body = dialogEl.querySelector(".jar-dialog__body");
        if (card && body) card.insertBefore(leadEl, body);
      }
      dialogEl.addEventListener("close", () => {
        if (!settled) finish(null);
      });
      openDialog(dialogEl);
      if (document.activeElement !== input) input.focus();
      input.setSelectionRange(sel.start, sel.end);
      showError(validate(currentNormalized()));
    });
  }
  var NamePrompt = {
    open: open3,
    normalizeBelFileName,
    defaultNormalize,
    defaultValidate,
    selectionForValue
  };
  var g8 = typeof window !== "undefined" ? window : globalThis;
  g8.NamePrompt = NamePrompt;
  g8.BelJarNamePrompt = g8.NamePrompt;

  // js/ui/conflict-dialog.mjs
  function suggestedBase(conflict) {
    const path = conflict.suggestedPath;
    const NC = globalThis.NameConflicts;
    if (NC && typeof NC.baseName === "function") {
      return NC.baseName(path);
    }
    const slash = path.lastIndexOf("/");
    return slash === -1 ? path : path.slice(slash + 1);
  }
  function buildConflictBody(conflict, total, index) {
    const { el: el5, markMono: markMono2 } = PromptDialog;
    const wrap = el5("div", "jar-conflict-dialog__panel");
    if (total > 1) {
      wrap.appendChild(el5("p", "jar-prompt-dialog__step", `${index + 1} of ${total}`));
    }
    const subject = el5("p", "jar-prompt-dialog__subject");
    subject.appendChild(markMono2(conflict.label));
    wrap.appendChild(subject);
    const message = el5("p", "jar-prompt-dialog__message");
    message.textContent = conflict.kind === "folder" ? "A folder with this name is already in the project." : "A file with this name is already in the project.";
    wrap.appendChild(message);
    return wrap;
  }
  function buildActions2(conflict, total) {
    const suggested = suggestedBase(conflict);
    return PromptDialog.buildActions([
      {
        action: "rename",
        label: `Keep as ${suggested}`,
        labelPrefix: "Keep as",
        monoSuffix: suggested,
        variant: "primary"
      },
      {
        action: "replace",
        label: conflict.kind === "folder" ? "Replace existing folder" : "Replace existing file",
        variant: "secondary"
      },
      {
        action: total === 1 ? "cancel" : "skip",
        label: total === 1 ? "Cancel" : "Skip",
        variant: "ghost"
      }
    ]);
  }
  function resolveConflicts(conflicts, options) {
    options = options || {};
    if (!conflicts || !conflicts.length) return Promise.resolve([]);
    const { el: el5, WRAP_CLASS: WRAP_CLASS2, CARD_CLASS: CARD_CLASS2 } = PromptDialog;
    return new Promise((resolve2) => {
      let index = 0;
      const resolutions = [];
      let settled = false;
      const shell = el5("div", "jar-prompt-dialog");
      const dialogEl = createDialog({
        ariaLabel: "Name conflict",
        content: shell,
        className: WRAP_CLASS2,
        cardClass: CARD_CLASS2,
        removeOnClose: true
      });
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve2(value);
        requestDialogClose(dialogEl);
      }
      function renderStep() {
        shell.replaceChildren();
        const conflict = conflicts[index];
        shell.appendChild(buildConflictBody(conflict, conflicts.length, index));
        shell.appendChild(buildActions2(conflict, conflicts.length));
      }
      shell.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.action;
        const conflict = conflicts[index];
        if (action === "cancel") {
          finish(null);
          return;
        }
        if (action === "skip") {
          resolutions.push({ action: "skip" });
        } else if (action === "replace") {
          resolutions.push({ action: "replace" });
        } else if (action === "rename") {
          resolutions.push({ action: "rename", newPath: conflict.suggestedPath });
        }
        index += 1;
        if (index >= conflicts.length) finish(resolutions);
        else renderStep();
      });
      dialogEl.addEventListener("close", () => {
        if (!settled) finish(null);
      });
      renderStep();
      openDialog(dialogEl);
    });
  }
  var ConflictDialog = {
    resolveConflicts
  };
  var g9 = typeof window !== "undefined" ? window : globalThis;
  g9.ConflictDialog = ConflictDialog;
  g9.BelJarConflictDialog = g9.ConflictDialog;

  // js/ui/download-zip.mjs
  var global4 = globalThis;
  var CRC_TABLE = (function() {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes) {
    var c = 4294967295;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ c >>> 8;
    return (c ^ 4294967295) >>> 0;
  }
  function u16(n) {
    return new Uint8Array([n & 255, n >>> 8 & 255]);
  }
  function u32(n) {
    return new Uint8Array([n & 255, n >>> 8 & 255, n >>> 16 & 255, n >>> 24 & 255]);
  }
  function concatBytes(parts) {
    var total = 0;
    for (var i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total);
    var off = 0;
    for (var j = 0; j < parts.length; j++) {
      out.set(parts[j], off);
      off += parts[j].length;
    }
    return out;
  }
  function dosDateTime(date) {
    var d = date || /* @__PURE__ */ new Date();
    var time = (d.getHours() & 31) << 11 | (d.getMinutes() & 63) << 5 | Math.floor(d.getSeconds() / 2) & 31;
    var day = (d.getFullYear() - 1980 & 127) << 9 | (d.getMonth() + 1 & 15) << 5 | d.getDate() & 31;
    return { time, date: day };
  }
  function buildZip(entries) {
    var enc = new TextEncoder();
    var stamp = dosDateTime(/* @__PURE__ */ new Date());
    var localParts = [];
    var centralParts = [];
    var offset = 0;
    var count = 0;
    for (var i = 0; i < entries.length; i++) {
      var ent = entries[i];
      if (!ent || !ent.path) continue;
      var isDir = !!ent.directory || /\/$/.test(ent.path);
      var path = String(ent.path).replace(/\\/g, "/");
      if (isDir && path.slice(-1) !== "/") path += "/";
      if (!path || path === "/") continue;
      var nameBytes = enc.encode(path);
      var data = isDir ? new Uint8Array(0) : ent.data instanceof Uint8Array ? ent.data : enc.encode(ent.data == null ? "" : String(ent.data));
      var crc = crc32(data);
      var gpFlag = 2048;
      var method = 0;
      var local = concatBytes([
        u32(67324752),
        u16(20),
        u16(gpFlag),
        u16(method),
        u16(stamp.time),
        u16(stamp.date),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        nameBytes,
        data
      ]);
      var central = concatBytes([
        u32(33639248),
        u16(20),
        u16(20),
        u16(gpFlag),
        u16(method),
        u16(stamp.time),
        u16(stamp.date),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(isDir ? 16 : 0),
        u32(offset),
        nameBytes
      ]);
      localParts.push(local);
      centralParts.push(central);
      offset += local.length;
      count += 1;
    }
    var centralDir = concatBytes(centralParts);
    var end = concatBytes([
      u32(101010256),
      u16(0),
      u16(0),
      u16(count),
      u16(count),
      u32(centralDir.length),
      u32(offset),
      u16(0)
    ]);
    return new Blob([concatBytes(localParts.concat([centralDir, end]))], {
      type: "application/zip"
    });
  }
  function triggerDownload(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName || "download";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function downloadTextFile(text, fileName) {
    triggerDownload(new Blob([text == null ? "" : String(text)], { type: "text/plain;charset=utf-8" }), fileName);
  }
  function downloadZip(entries, fileName) {
    triggerDownload(buildZip(entries), fileName || "download.zip");
  }
  function fileSafeName(name) {
    var s = String(name == null ? "" : name).replace(/[\/\\:*?"<>|\u0000-\u001f]/g, "-").replace(/^[\s.]+|[\s.]+$/g, "").slice(0, 120);
    if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s += "-project";
    return s;
  }
  function projectArchive(projectName, files2, folders) {
    var root = fileSafeName(projectName) || "project";
    var byPath = function(a, b) {
      return a < b ? -1 : a > b ? 1 : 0;
    };
    var entries = (files2 || []).slice().sort(function(a, b) {
      return byPath(a.path, b.path);
    }).map(function(f) {
      return { path: root + "/" + f.path, data: f.text == null ? "" : String(f.text) };
    });
    (folders || []).slice().sort(byPath).forEach(function(dir) {
      var holds = (files2 || []).some(function(f) {
        return f.path.indexOf(dir + "/") === 0;
      });
      if (!holds) entries.push({ path: root + "/" + dir + "/", directory: true });
    });
    return { fileName: root + ".zip", entries };
  }
  global4.DownloadZip = {
    buildZip,
    triggerDownload,
    downloadTextFile,
    downloadZip,
    fileSafeName,
    projectArchive
  };
  global4.BelJarDownloadZip = global4.DownloadZip;

  // js/persist/settings-apply.mjs
  var UI_FONT_SCALES = { sm: 0.875, md: 1, lg: 1.125, xl: 1.25 };
  var UI_TEXT_CONTRAST = { low: 1, medium: 1.6, high: 2.4, maximum: 4.5 };
  var EDITOR_MONO = {
    jetbrains: "'JetBrains Mono', monospace",
    system: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  };
  var TOAST_DURATION_MS = { short: 2e3, normal: 3500, long: 5e3 };
  function applyDocumentSettings(docEl, values) {
    if (!docEl || !values) return;
    docEl.classList.toggle("light", values.theme === "light");
    docEl.style.setProperty("--ui-font-scale", String(UI_FONT_SCALES[values.uiFontSize] || 1));
    docEl.style.setProperty("--ui-text-contrast", String(UI_TEXT_CONTRAST[values.uiTextContrast] || UI_TEXT_CONTRAST.medium));
    docEl.classList.toggle("jar-motion-reduce", values.motionPref === "reduce");
    docEl.classList.toggle("jar-motion-full", values.motionPref === "full");
    docEl.style.setProperty("--editor-mono", EDITOR_MONO[values.editorFontFamily] || EDITOR_MONO.jetbrains);
    docEl.style.setProperty("--editor-ligatures", "none");
    docEl.classList.toggle("jar-hole-subtle", values.editorHoleEmphasis === "subtle");
    docEl.classList.toggle("jar-hole-loud", values.editorHoleEmphasis === "loud");
  }

  // js/ui/toasts.mjs
  var global5 = globalThis;
  var DEFAULT_DURATION_MS2 = TOAST_DURATION_MS.normal;
  var LEAVE_MS2 = 280;
  var UNTIL_POLL_MS = 120;
  var stackEl = null;
  var seq = 0;
  var live = /* @__PURE__ */ new Map();
  function nextId() {
    seq += 1;
    return "toast-" + seq;
  }
  function durationForMode(mode) {
    return TOAST_DURATION_MS[mode] || DEFAULT_DURATION_MS2;
  }
  function normalizeDuration(opts) {
    var fallback = durationForMode(readSetting("toastDuration"));
    if (!opts || opts.duration === void 0) return fallback;
    const d = opts.duration;
    if (d === false || d === null || d === 0 || d === Infinity) return null;
    if (d === "short" || d === "normal" || d === "long") return durationForMode(d);
    if (typeof d === "number" && d > 0) return d;
    return fallback;
  }
  function parseOpts(message, opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    return {
      message: String(message || ""),
      duration: normalizeDuration(o),
      closable: !!o.closable,
      kind: o.kind || "default",
      until: typeof o.until === "function" ? o.until : null,
      onDismiss: typeof o.onDismiss === "function" ? o.onDismiss : null,
      notify: o.notify,
      durable: o.durable,
      body: o.body != null ? String(o.body) : null,
      detail: o.detail != null ? String(o.detail) : null,
      source: o.source != null ? String(o.source) : null,
      dedupeKey: o.dedupeKey != null ? String(o.dedupeKey) : null,
      category: o.category != null ? String(o.category) : null,
      links: o.links && typeof o.links === "object" ? o.links : null
    };
  }
  function shouldNotify(kind, notifyOpt, durableOpt) {
    if (notifyOpt === false || durableOpt === false) return false;
    if (notifyOpt === true || durableOpt === true) return true;
    return false;
  }
  function pushNotification(message, parsed) {
    const N = global5.Notifications;
    if (!N) return;
    if (typeof N.fromToast === "function") {
      N.fromToast(message, {
        kind: parsed.kind,
        body: parsed.body,
        detail: parsed.detail,
        source: parsed.source,
        dedupeKey: parsed.dedupeKey,
        category: parsed.category,
        links: parsed.links
      });
      return;
    }
    if (typeof N.push === "function") N.push(message);
  }
  function kindClass(kind) {
    if (kind === "success" || kind === "error" || kind === "info" || kind === "warn") {
      return "toast--" + kind;
    }
    return "toast--default";
  }
  function clearTimers2(entry) {
    if (entry.autoTimer != null) {
      clearTimeout(entry.autoTimer);
      entry.autoTimer = null;
    }
    if (entry.untilTimer != null) {
      clearInterval(entry.untilTimer);
      entry.untilTimer = null;
    }
    if (entry.untilPromise) entry.untilPromise = null;
  }
  function removeNode(entry) {
    if (!entry || !entry.el || !entry.el.parentNode) return;
    entry.el.parentNode.removeChild(entry.el);
  }
  function finishDismiss(id, entry) {
    if (!entry || entry.dismissed) return;
    entry.dismissed = true;
    clearTimers2(entry);
    live.delete(id);
    try {
      if (entry.onDismiss) entry.onDismiss();
    } catch (err) {
      if (global5.console && console.error) console.error("[toast]", err);
    }
    removeNode(entry);
    if (live.size === 0) hideToastLayer();
  }
  function showToastLayer() {
    if (!stackEl || typeof stackEl.showPopover !== "function") return;
    try {
      if (!stackEl.matches(":popover-open")) stackEl.showPopover();
    } catch (_) {
    }
  }
  function hideToastLayer() {
    if (!stackEl || typeof stackEl.hidePopover !== "function") return;
    try {
      if (stackEl.matches(":popover-open")) stackEl.hidePopover();
    } catch (_) {
    }
  }
  function animateOut(id, entry) {
    if (!entry || entry.leaving || entry.dismissed) return;
    entry.leaving = true;
    clearTimers2(entry);
    const el5 = entry.el;
    el5.classList.remove("is-visible");
    el5.classList.add("is-leaving");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el5.removeEventListener("transitionend", onEnd);
      finishDismiss(id, entry);
    };
    const onEnd = (e) => {
      if (e.target !== el5) return;
      finish();
    };
    el5.addEventListener("transitionend", onEnd);
    setTimeout(finish, LEAVE_MS2 + 40);
  }
  function wireUntil(id, entry, untilFn) {
    const result = untilFn();
    if (result && typeof result.then === "function") {
      entry.untilPromise = result;
      result.then(() => animateOut(id, entry)).catch(() => animateOut(id, entry));
      return;
    }
    entry.untilTimer = setInterval(() => {
      try {
        if (untilFn()) animateOut(id, entry);
      } catch (err) {
        if (global5.console && console.error) console.error("[toast]", err);
        animateOut(id, entry);
      }
    }, UNTIL_POLL_MS);
  }
  function show2(message, opts) {
    if (!stackEl) init();
    const parsed = parseOpts(message, opts);
    if (!parsed.message) return null;
    if (shouldNotify(parsed.kind, parsed.notify, parsed.durable)) {
      pushNotification(parsed.message, parsed);
    }
    const id = nextId();
    const el5 = document.createElement("div");
    el5.className = "toast " + kindClass(parsed.kind);
    el5.setAttribute("role", parsed.kind === "error" ? "alert" : "status");
    el5.dataset.toastId = id;
    const body = document.createElement("div");
    body.className = "toast-body";
    body.textContent = parsed.message;
    el5.appendChild(body);
    if (parsed.closable) {
      const closeBtn2 = document.createElement("button");
      closeBtn2.type = "button";
      closeBtn2.className = "icon-btn toast-close";
      closeBtn2.setAttribute("aria-label", "Dismiss");
      closeBtn2.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      closeBtn2.addEventListener("click", (e) => {
        e.stopPropagation();
        animateOut(id, entry);
      });
      el5.appendChild(closeBtn2);
    }
    const entry = {
      id,
      el: el5,
      dismissed: false,
      leaving: false,
      onDismiss: parsed.onDismiss,
      autoTimer: null,
      untilTimer: null,
      untilPromise: null
    };
    live.set(id, entry);
    showToastLayer();
    stackEl.appendChild(el5);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el5.classList.add("is-visible"));
    });
    if (parsed.until) {
      wireUntil(id, entry, parsed.until);
    } else if (parsed.duration != null) {
      entry.autoTimer = setTimeout(() => animateOut(id, entry), parsed.duration);
    }
    return id;
  }
  function typed(kind, message, opts) {
    const o = opts && typeof opts === "object" ? Object.assign({}, opts) : {};
    o.kind = kind;
    return show2(message, o);
  }
  function dismiss2(id) {
    const entry = live.get(id);
    if (entry) animateOut(id, entry);
  }
  function dismissAll() {
    Array.from(live.keys()).forEach(dismiss2);
  }
  function init() {
    stackEl = document.getElementById("toast-stack");
    if (!stackEl) {
      stackEl = document.createElement("div");
      stackEl.id = "toast-stack";
      stackEl.className = "toast-stack";
      stackEl.setAttribute("aria-live", "polite");
      stackEl.setAttribute("aria-relevant", "additions");
      stackEl.dataset.toastsOwned = "yes";
      document.body.appendChild(stackEl);
    }
    if (!stackEl.hasAttribute("popover")) stackEl.setAttribute("popover", "manual");
  }
  function dispose() {
    dismissAll();
    if (stackEl && stackEl.dataset && stackEl.dataset.toastsOwned === "yes") {
      try {
        stackEl.remove();
      } catch (_) {
      }
    }
    stackEl = null;
  }
  global5.Toasts = {
    init,
    dispose,
    show: show2,
    error: (message, opts) => typed("error", message, opts),
    warn: (message, opts) => typed("warn", message, opts),
    success: (message, opts) => typed("success", message, opts),
    info: (message, opts) => typed("info", message, opts),
    dismiss: dismiss2,
    dismissAll,
    _pure: { normalizeDuration, parseOpts, shouldNotify, DEFAULT_DURATION_MS: DEFAULT_DURATION_MS2 }
  };
  global5.BelJarToasts = global5.Toasts;

  // js/ui/notification-store.mjs
  var SCHEMA_VERSION = 1;
  var DEFAULT_CAP = 100;
  var KINDS = /* @__PURE__ */ new Set(["error", "warn", "info", "success", "system"]);
  var CATEGORIES = /* @__PURE__ */ new Set(["teaching", "ops", "product", "remote"]);
  var ORIGINS = /* @__PURE__ */ new Set(["local", "remote"]);
  function newId2() {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
    } catch (_) {
    }
    return "notif-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function migrateRecord(raw) {
    if (!raw || typeof raw !== "object") return null;
    const v = raw.v == null ? 1 : Number(raw.v);
    if (v === 1) return normalizeRecord2(raw);
    return normalizeRecord2(raw);
  }
  function normalizeRecord2(input) {
    if (input == null) return null;
    if (typeof input === "string") {
      const title2 = String(input).trim();
      if (!title2) return null;
      return {
        id: newId2(),
        v: SCHEMA_VERSION,
        kind: "info",
        category: "ops",
        title: title2,
        body: null,
        detail: null,
        source: "legacy",
        createdAt: Date.now(),
        readAt: null,
        dismissedAt: null,
        dedupeKey: null,
        links: null,
        origin: "local",
        remoteId: null,
        expiresAt: null
      };
    }
    if (typeof input !== "object") return null;
    const title = String(input.title != null ? input.title : input.message || "").trim();
    if (!title && !input.body && !input.detail) return null;
    const kind = KINDS.has(input.kind) ? input.kind : "info";
    const category = CATEGORIES.has(input.category) ? input.category : "ops";
    const origin = ORIGINS.has(input.origin) ? input.origin : "local";
    const createdAt = Number.isFinite(input.createdAt) ? input.createdAt : Number.isFinite(input.time) ? input.time : Date.now();
    let links = null;
    if (input.links && typeof input.links === "object") {
      links = {
        fileId: input.links.fileId != null ? String(input.links.fileId) : void 0,
        path: input.links.path != null ? String(input.links.path) : void 0,
        line: Number.isFinite(input.links.line) ? input.links.line : void 0,
        hole: input.links.hole != null ? String(input.links.hole) : void 0,
        from: Number.isFinite(input.links.from) ? input.links.from : void 0,
        to: Number.isFinite(input.links.to) ? input.links.to : void 0
      };
    }
    return {
      id: input.id && String(input.id) || newId2(),
      v: SCHEMA_VERSION,
      kind,
      category,
      title: title || String(input.body || "Notification").slice(0, 120),
      body: input.body != null ? String(input.body) : null,
      detail: input.detail != null ? String(input.detail) : null,
      source: input.source != null ? String(input.source) : "unknown",
      createdAt,
      readAt: input.readAt != null ? Number(input.readAt) : null,
      dismissedAt: input.dismissedAt != null ? Number(input.dismissedAt) : null,
      dedupeKey: input.dedupeKey != null ? String(input.dedupeKey) : null,
      links,
      origin,
      remoteId: input.remoteId != null ? String(input.remoteId) : null,
      expiresAt: input.expiresAt != null ? Number(input.expiresAt) : null
    };
  }
  function linkTarget(rec) {
    const l = rec && rec.links;
    if (!l || !l.fileId) return null;
    const from = Number.isFinite(l.from) ? l.from : null;
    const line = Number.isFinite(l.line) && l.line >= 1 ? Math.floor(l.line) : null;
    if (from == null && line == null) return null;
    const path = l.path != null ? String(l.path) : "";
    const base = path ? path.slice(path.lastIndexOf("/") + 1) : String(l.fileId);
    return {
      fileId: String(l.fileId),
      from,
      to: Number.isFinite(l.to) ? l.to : from,
      line,
      label: line != null ? base + ":" + line : base
    };
  }
  function createMemoryAdapter(seed) {
    let items = Array.isArray(seed) ? seed.slice() : [];
    return {
      load() {
        return items.slice();
      },
      save(next) {
        items = Array.isArray(next) ? next.slice() : [];
      }
    };
  }
  function createNotificationStore(opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    const cap = Number.isFinite(o.cap) && o.cap > 0 ? o.cap : DEFAULT_CAP;
    const adapter = o.adapter || createMemoryAdapter();
    const listeners = /* @__PURE__ */ new Set();
    let items = [];
    try {
      items = (adapter.load() || []).map(migrateRecord).filter(Boolean);
      items = prune(items, cap);
    } catch (_) {
      items = [];
    }
    function prune(list4, max) {
      const now = Date.now();
      let next = list4.filter((r) => !r.dismissedAt);
      next = next.filter((r) => r.expiresAt == null || r.expiresAt > now);
      next.sort((a, b) => b.createdAt - a.createdAt);
      if (next.length > max) next = next.slice(0, max);
      return next;
    }
    function persist() {
      try {
        adapter.save(items);
      } catch (_) {
      }
    }
    function notify() {
      for (const fn of listeners) {
        try {
          fn(items.slice());
        } catch (_) {
        }
      }
    }
    function list3() {
      return items.slice().sort((a, b) => b.createdAt - a.createdAt);
    }
    function get2(id) {
      return items.find((r) => r.id === id) || null;
    }
    function unreadCount() {
      return items.filter((r) => !r.readAt).length;
    }
    function count() {
      return items.length;
    }
    function upsert(input) {
      const rec = normalizeRecord2(input);
      if (!rec) return null;
      if (rec.dedupeKey) {
        const idx = items.findIndex((r) => r.dedupeKey === rec.dedupeKey && !r.dismissedAt);
        if (idx >= 0) {
          const prev = items[idx];
          const merged = {
            ...prev,
            ...rec,
            id: prev.id,
            createdAt: Number.isFinite(input.createdAt) ? rec.createdAt : Date.now(),
            readAt: null,
            dismissedAt: null,
            body: rec.body != null ? rec.body : prev.body,
            detail: rec.detail != null ? rec.detail : prev.detail
          };
          items[idx] = merged;
          items = prune(items, cap);
          persist();
          notify();
          return merged;
        }
      }
      items.push(rec);
      items = prune(items, cap);
      persist();
      notify();
      return rec;
    }
    function dismiss4(id) {
      const idx = items.findIndex((r) => r.id === id);
      if (idx < 0) return false;
      items.splice(idx, 1);
      persist();
      notify();
      return true;
    }
    function clear2() {
      if (items.length === 0) return;
      items = [];
      persist();
      notify();
    }
    function markRead(id) {
      const rec = get2(id);
      if (!rec || rec.readAt) return false;
      rec.readAt = Date.now();
      persist();
      notify();
      return true;
    }
    function markAllRead() {
      const now = Date.now();
      let changed = false;
      for (const r of items) {
        if (!r.readAt) {
          r.readAt = now;
          changed = true;
        }
      }
      if (changed) {
        persist();
        notify();
      }
      return changed;
    }
    function subscribe(fn) {
      if (typeof fn !== "function") return () => {
      };
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    }
    return {
      list: list3,
      get: get2,
      upsert,
      dismiss: dismiss4,
      clear: clear2,
      markRead,
      markAllRead,
      count,
      unreadCount,
      subscribe,
      _pure: { items: () => items }
    };
  }

  // js/ui/notification-view.mjs
  var WEEK = 7 * 24 * 36e5;
  var KIND_META = {
    error: { accent: "var(--notif-kind-error)", label: "Error" },
    warn: { accent: "var(--notif-kind-warn)", label: "Warning" },
    info: { accent: "var(--notif-kind-info)", label: "Info" },
    success: { accent: "var(--notif-kind-success)", label: "Done" },
    system: { accent: "var(--notif-kind-system)", label: "System" }
  };
  function kindMeta(kind) {
    return KIND_META[kind] || KIND_META.system;
  }
  function clock(ts) {
    try {
      return new Intl.DateTimeFormat(void 0, { hour: "numeric", minute: "2-digit" }).format(new Date(ts));
    } catch (_) {
      return "";
    }
  }
  function weekday(ts) {
    try {
      return new Intl.DateTimeFormat(void 0, { weekday: "short" }).format(new Date(ts));
    } catch (_) {
      return "";
    }
  }
  function calendarDay(ts) {
    try {
      return new Intl.DateTimeFormat(void 0, { month: "short", day: "numeric" }).format(new Date(ts));
    } catch (_) {
      return "";
    }
  }
  function sameDay(a, b) {
    const x = new Date(a);
    const y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  }
  function formatStamp(ts, now) {
    if (!Number.isFinite(ts)) return "";
    const at = Number.isFinite(now) ? now : Date.now();
    if (sameDay(ts, at)) return clock(ts);
    if (at - ts >= 0 && at - ts < WEEK) return weekday(ts) + " " + clock(ts);
    return calendarDay(ts) + ", " + clock(ts);
  }
  function formatStampFull(ts) {
    if (!Number.isFinite(ts)) return "";
    try {
      return new Intl.DateTimeFormat(void 0, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date(ts));
    } catch (_) {
      return "";
    }
  }
  function labelTitle(text) {
    const t = text == null ? "" : String(text).trim();
    if (t.length < 2 || !t.endsWith(".") || t.endsWith("..")) return t;
    return t.slice(0, -1);
  }
  function splitText(rec) {
    const title = labelTitle(rec.title);
    const rawBody = rec.body != null ? String(rec.body).trim() : "";
    const rawDetail = rec.detail != null ? String(rec.detail).trim() : "";
    const body = rawBody && rawBody !== title ? rawBody : "";
    const detail = rawDetail && rawDetail !== title && rawDetail !== body ? rawDetail : "";
    if (!body && detail) return { body: detail, detail: "", promoted: true };
    return { body, detail, promoted: false };
  }
  function inlineSegments(text) {
    const src = text == null ? "" : String(text);
    if (src.indexOf("`") < 0) return src ? [{ code: false, text: src }] : [];
    const out = [];
    let rest = src;
    while (rest) {
      const open6 = rest.indexOf("`");
      if (open6 < 0) break;
      const close2 = rest.indexOf("`", open6 + 1);
      if (close2 < 0) break;
      if (open6 > 0) out.push({ code: false, text: rest.slice(0, open6) });
      const code = rest.slice(open6 + 1, close2);
      if (code) out.push({ code: true, text: code });
      rest = rest.slice(close2 + 1);
    }
    if (rest) out.push({ code: false, text: rest });
    return out;
  }
  function itemView(rec, now) {
    if (!rec || typeof rec !== "object") return null;
    const kind = KIND_META[rec.kind] ? rec.kind : "system";
    const text = splitText(rec);
    return {
      id: rec.id,
      kind,
      meta: kindMeta(kind),
      title: labelTitle(rec.title),
      body: text.body,
      bodySegments: inlineSegments(text.body),
      detail: text.detail,
      promotedDetail: text.promoted,
      unread: !rec.readAt,
      remote: rec.origin === "remote",
      teaching: rec.category === "teaching",
      stamp: formatStamp(rec.createdAt, now),
      stampFull: formatStampFull(rec.createdAt),
      target: linkTarget(rec)
    };
  }
  function panelView(list3, now) {
    const items = Array.isArray(list3) ? list3 : [];
    return {
      total: items.length,
      unread: items.filter((r) => r && !r.readAt).length,
      empty: items.length === 0,
      items: items.map((r) => itemView(r, now)).filter(Boolean)
    };
  }

  // js/ui/notifications.mjs
  var global6 = globalThis;
  var bellBtn = null;
  var panelEl = null;
  var listEl = null;
  var emptyEl = null;
  var clearBtn = null;
  var countEl = null;
  var open4 = false;
  var unsub = null;
  var fade = null;
  var diagSeq = 0;
  var teardown = [];
  function track(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    teardown.push(() => target.removeEventListener(type, fn, opts));
  }
  function onBellClick(e) {
    e.stopPropagation();
    toggle();
  }
  function onClearClick(e) {
    e.stopPropagation();
    clear();
  }
  function onWindowResize() {
    if (open4) positionPanel();
  }
  var store2 = createNotificationStore({
    adapter: typeof Persist !== "undefined" && Persist.readNotifications ? { load: () => Persist.readNotifications(), save: (items) => Persist.writeNotifications(items) } : createMemoryAdapter()
  });
  function svgMarkup(paths, cls) {
    return "<svg" + (cls ? ' class="' + cls + '"' : "") + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
  }
  function bindTooltip(el5, text) {
    if (!el5 || !text) return;
    el5.setAttribute("data-tooltip", text);
    try {
      if (typeof Tooltips !== "undefined" && typeof Tooltips.bind === "function") Tooltips.bind(el5);
    } catch (_) {
    }
  }
  function updateBellState() {
    if (!bellBtn) return;
    const total = store2.count();
    const unread = store2.unreadCount();
    if (total > 0) bellBtn.setAttribute("data-has-notifications", "");
    else bellBtn.removeAttribute("data-has-notifications");
    if (unread > 0) bellBtn.setAttribute("data-has-unread", "");
    else bellBtn.removeAttribute("data-has-unread");
    bellBtn.setAttribute(
      "aria-label",
      unread > 0 ? "Notifications, " + unread + " unread" : "Notifications"
    );
  }
  function kindClass2(kind) {
    return "notif-item--" + (KIND_META[kind] ? kind : "system");
  }
  function buildDiagToggle(pre) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "notif-item-more";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", pre.id);
    btn.innerHTML = '<svg class="notif-item-chevron" viewBox="0 0 8 10" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.15 1.2 6.35 5 1.15 8.8"/></svg><span>Diagnostic</span>';
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const show3 = pre.hidden;
      pre.hidden = !show3;
      btn.setAttribute("aria-expanded", show3 ? "true" : "false");
      btn.classList.toggle("is-open", show3);
      if (fade) fade.update();
    });
    return btn;
  }
  function buildFoot(view, toggleBtn) {
    const foot = document.createElement("div");
    foot.className = "notif-item-foot";
    if (toggleBtn) foot.appendChild(toggleBtn);
    if (view.target) {
      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "notif-item-link";
      jump.textContent = view.target.label;
      jump.setAttribute("aria-label", "Open " + view.target.label);
      jump.addEventListener("click", (e) => {
        e.stopPropagation();
        openTarget(view.id, view.target);
      });
      foot.appendChild(jump);
    }
    if (view.teaching || view.remote) {
      const tag = document.createElement("span");
      tag.className = "notif-item-tag";
      tag.textContent = view.teaching ? "teaching" : "remote";
      foot.appendChild(tag);
    }
    const stamp = document.createElement("span");
    stamp.className = "notif-item-stamp";
    stamp.textContent = view.stamp;
    bindTooltip(stamp, view.stampFull);
    foot.appendChild(stamp);
    return foot;
  }
  function buildItem(view) {
    const li = document.createElement("li");
    li.className = "notif-item " + kindClass2(view.kind);
    if (view.unread) li.classList.add("is-unread");
    li.dataset.notifId = view.id;
    li.dataset.notifKind = view.kind;
    const title = document.createElement("p");
    title.className = "notif-item-title";
    const kindWord = document.createElement("span");
    kindWord.className = "notif-item-kind";
    kindWord.textContent = view.meta.label + ": ";
    title.appendChild(kindWord);
    title.appendChild(document.createTextNode(view.title));
    li.appendChild(title);
    if (view.body) {
      const body = document.createElement("p");
      body.className = "notif-item-body";
      if (view.promotedDetail) body.classList.add("is-diagnostic");
      for (const seg of view.bodySegments) {
        if (!seg.code) {
          body.appendChild(document.createTextNode(seg.text));
          continue;
        }
        const code = document.createElement("code");
        code.className = "notif-item-code";
        code.textContent = seg.text;
        body.appendChild(code);
      }
      li.appendChild(body);
    }
    let toggleBtn = null;
    let pre = null;
    if (view.detail) {
      diagSeq += 1;
      pre = document.createElement("pre");
      pre.className = "notif-item-diag";
      pre.id = "notif-diag-" + diagSeq;
      pre.textContent = view.detail;
      pre.hidden = true;
      toggleBtn = buildDiagToggle(pre);
    }
    li.appendChild(buildFoot(view, toggleBtn));
    if (pre) li.appendChild(pre);
    if (view.unread) {
      const dot = document.createElement("span");
      dot.className = "notif-item-dot";
      dot.setAttribute("role", "img");
      dot.setAttribute("aria-label", "Unread");
      li.appendChild(dot);
    }
    const dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.className = "icon-btn notif-item-dismiss";
    dismissBtn.setAttribute("aria-label", "Dismiss notification");
    dismissBtn.innerHTML = svgMarkup('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
    dismissBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dismiss3(view.id);
    });
    li.appendChild(dismissBtn);
    return li;
  }
  function renderList() {
    if (!listEl || !emptyEl) return;
    const records2 = store2.list();
    const view = panelView(records2, Date.now());
    listEl.textContent = "";
    for (const item of view.items) listEl.appendChild(buildItem(item));
    emptyEl.hidden = !view.empty;
    listEl.hidden = view.empty;
    if (clearBtn) clearBtn.hidden = view.empty;
    if (countEl) {
      countEl.textContent = view.total ? String(view.total) : "";
      countEl.hidden = !view.total;
    }
    if (fade) fade.update();
    updateBellState();
  }
  function openTarget(id, target) {
    if (!target) return;
    store2.markRead(id);
    try {
      window.dispatchEvent(new CustomEvent("beljar:open-file-at", {
        detail: {
          fileId: target.fileId,
          from: target.from,
          to: target.to,
          line: target.line,
          source: "notification"
        }
      }));
    } catch (_) {
    }
    setOpen(false);
  }
  function emit(partial) {
    const rec = store2.upsert(partial);
    return rec ? rec.id : null;
  }
  function push(message, opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    if (typeof message === "object" && message !== null) {
      return emit(message);
    }
    return emit({
      id: o.id,
      title: String(message || ""),
      kind: o.kind || "info",
      category: o.category || "ops",
      source: o.source || "legacy",
      createdAt: o.time != null ? o.time : Date.now(),
      body: o.body || null,
      detail: o.detail || null,
      dedupeKey: o.dedupeKey || null,
      links: o.links || null,
      origin: o.origin || "local"
    });
  }
  function teaching(partial) {
    const o = partial && typeof partial === "object" ? partial : { title: String(partial || "") };
    return emit({
      kind: o.kind || "error",
      category: "teaching",
      origin: "local",
      source: o.source || "prover",
      title: o.title,
      body: o.body || null,
      detail: o.detail || null,
      dedupeKey: o.dedupeKey || null,
      links: o.links || null
    });
  }
  function fromToast(message, opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    const kind = o.kind || "error";
    return emit({
      kind: kind === "default" ? "info" : kind,
      category: o.category || "ops",
      title: String(message || ""),
      body: o.body || null,
      detail: o.detail || null,
      source: o.source || "toast",
      dedupeKey: o.dedupeKey || null,
      links: o.links || null,
      origin: "local"
    });
  }
  function dismiss3(id) {
    store2.dismiss(id);
  }
  function clear() {
    store2.clear();
  }
  function positionPanel() {
    if (!bellBtn || !panelEl) return;
    const anchor = bellBtn.closest(".header-end") || bellBtn;
    const r = anchor.getBoundingClientRect();
    const right = Math.max(0, window.innerWidth - r.right);
    panelEl.style.setProperty("--notif-panel-right", right + "px");
  }
  function setOpen(next) {
    if (!panelEl || !bellBtn) return;
    open4 = !!next;
    if (open4) {
      positionPanel();
      renderList();
      store2.markAllRead();
    }
    panelEl.classList.toggle("is-open", open4);
    panelEl.setAttribute("aria-hidden", open4 ? "false" : "true");
    bellBtn.setAttribute("aria-expanded", open4 ? "true" : "false");
    bellBtn.classList.toggle("is-active", open4);
    if (open4 && typeof Tooltips !== "undefined") {
      Tooltips.hide();
      Tooltips.suppressAnchor(bellBtn);
    }
  }
  function toggle() {
    setOpen(!open4);
  }
  function onDocPointerDown(e) {
    if (!open4) return;
    const t = e.target;
    if (panelEl && panelEl.contains(t)) return;
    if (bellBtn && bellBtn.contains(t)) return;
    setOpen(false);
  }
  function onDocKeyDown(e) {
    if (e.key === "Escape" && open4) {
      e.preventDefault();
      setOpen(false);
      bellBtn.focus();
    }
  }
  function init2() {
    dispose2();
    bellBtn = document.getElementById("btn-notifications");
    panelEl = document.getElementById("notif-panel");
    listEl = document.getElementById("notif-panel-list");
    emptyEl = document.getElementById("notif-panel-empty");
    clearBtn = document.getElementById("btn-notif-clear");
    countEl = document.getElementById("notif-panel-count");
    if (!bellBtn || !panelEl) return;
    unsub = store2.subscribe(() => renderList());
    track(bellBtn, "click", onBellClick);
    if (clearBtn) track(clearBtn, "click", onClearClick);
    track(document, "pointerdown", onDocPointerDown, true);
    track(document, "keydown", onDocKeyDown, true);
    track(window, "resize", onWindowResize);
    if (listEl && global6.ScrollFade && typeof global6.ScrollFade.attach === "function") {
      fade = global6.ScrollFade.attach(listEl, { axis: "y", size: 14 });
    }
    positionPanel();
    renderList();
  }
  function dispose2() {
    if (unsub) {
      unsub();
      unsub = null;
    }
    while (teardown.length) {
      const off = teardown.pop();
      try {
        off();
      } catch (_) {
      }
    }
    if (fade) {
      try {
        fade.destroy();
      } catch (_) {
      }
      fade = null;
    }
    setOpen(false);
    bellBtn = null;
    panelEl = null;
    listEl = null;
    emptyEl = null;
    clearBtn = null;
    countEl = null;
  }
  global6.Notifications = {
    init: init2,
    dispose: dispose2,
    emit,
    push,
    teaching,
    fromToast,
    dismiss: dismiss3,
    clear,
    markRead: (id) => store2.markRead(id),
    markAllRead: () => store2.markAllRead(),
    toggle,
    isOpen: () => open4,
    count: () => store2.count(),
    unreadCount: () => store2.unreadCount(),
    list: () => store2.list(),
    store: store2,
    _pure: {
      normalizeRecord: normalizeRecord2,
      linkTarget,
      itemView,
      panelView,
      kindMeta,
      labelTitle,
      inlineSegments,
      formatStamp,
      formatStampFull,
      SCHEMA_VERSION
    }
  };
  global6.BelJarNotifications = global6.Notifications;

  // js/frame/frame.mjs
  var global7 = globalThis;
  var teardown2 = [];
  var mounted = false;
  function track2(target, type, fn, opts) {
    if (!target) return;
    target.addEventListener(type, fn, opts);
    teardown2.push(() => target.removeEventListener(type, fn, opts));
  }
  function toggleTheme() {
    const next = Settings.get("theme") === "light" ? "dark" : "light";
    Settings.set("theme", next);
    global7.dispatchEvent(new CustomEvent("beljar:settings-changed", {
      detail: { key: "theme" }
    }));
    return next;
  }
  function repaint() {
    applyDocumentSettings(document.documentElement, Settings.values());
  }
  function onSettingsChanged(e) {
    if (e.ids.some((id) => settingRow(id).boot)) repaint();
    if (e.ids.includes("startPage")) nameHome();
  }
  function nameHome() {
    const home = document.getElementById("btn-home");
    if (home) home.setAttribute("href", Routes.homeUrl());
  }
  function onSettings() {
    if (global7.SettingsUI && typeof global7.SettingsUI.open === "function") {
      global7.SettingsUI.open();
    }
  }
  function mount() {
    if (mounted) return;
    mounted = true;
    repaint();
    teardown2.push(Settings.subscribe(onSettingsChanged));
    if (global7.Toasts && typeof global7.Toasts.init === "function") global7.Toasts.init();
    if (global7.Notifications && typeof global7.Notifications.init === "function") {
      global7.Notifications.init();
    }
    track2(document.getElementById("btn-theme"), "click", toggleTheme);
    track2(document.getElementById("btn-settings"), "click", onSettings);
    track2(document.getElementById("btn-go-home"), "click", () => {
      if (global7.Commands && global7.Commands.run("app.home")) return;
      if (global7.Account && global7.Account.goHome) global7.Account.goHome();
    });
    nameHome();
  }
  function unmount() {
    if (!mounted) return;
    mounted = false;
    while (teardown2.length) {
      const off = teardown2.pop();
      try {
        off();
      } catch (_) {
      }
    }
    for (const peer of [global7.Notifications, global7.Toasts]) {
      if (peer && typeof peer.dispose === "function") {
        try {
          peer.dispose();
        } catch (_) {
        }
      }
    }
  }
  var Frame = {
    mount,
    unmount,
    toggleTheme,
    isMounted: () => mounted,
    pendingTeardown: () => teardown2.length
  };
  global7.Frame = Frame;
  global7.BelJarFrame = global7.Frame;

  // js/account/avatar.mjs
  var seen = /* @__PURE__ */ new Map();
  function rgb(c) {
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }
  function identiconColours(data, size) {
    if (!data || !size || data.length < size * size * 4) return null;
    const px = (x, y) => (y * size + x) * 4;
    const b = px(0, 0);
    const bg = [data[b], data[b + 1], data[b + 2]];
    if (data[b + 3] < 250 || bg[0] + bg[1] + bg[2] < 600) return null;
    const near = (i, c) => Math.abs(data[i] - c[0]) + Math.abs(data[i + 1] - c[1]) + Math.abs(data[i + 2] - c[2]) <= 12;
    const band = Math.max(1, Math.round(size / 12) - 1);
    const counts = /* @__PURE__ */ new Map();
    let ink = null;
    let bestKey = 0;
    let bestN = 0;
    let bestFar = -1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = px(x, y);
        if (near(i, bg)) continue;
        if (x < band || y < band || x >= size - band || y >= size - band) return null;
        if (!ink) ink = [data[i], data[i + 1], data[i + 2]];
        else if (!near(i, ink)) return null;
        const key = data[i] << 16 | data[i + 1] << 8 | data[i + 2];
        const n = (counts.get(key) || 0) + 1;
        counts.set(key, n);
        if (n < bestN) continue;
        const far = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
        if (n > bestN || far > bestFar) {
          bestN = n;
          bestFar = far;
          bestKey = key;
        }
      }
    }
    if (!ink) return null;
    return {
      background: rgb(bg),
      ink: rgb([bestKey >> 16 & 255, bestKey >> 8 & 255, bestKey & 255])
    };
  }
  function read(img) {
    const size = img.naturalWidth;
    if (!size || size !== img.naturalHeight || size > 1024) return null;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const cx = c.getContext("2d", { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    return identiconColours(cx.getImageData(0, 0, size, size).data, size);
  }
  function apply(img, colours) {
    if (!colours) return;
    img.classList.add("is-identicon");
    img.style.setProperty("--avatar-bg", colours.background);
    img.style.setProperty("--avatar-ink", colours.ink);
  }
  function decorateAvatar(img) {
    const src = img.currentSrc || img.src;
    if (seen.has(src)) {
      apply(img, seen.get(src));
      return;
    }
    let colours = null;
    try {
      colours = read(img);
    } catch (_) {
    }
    seen.set(src, colours);
    apply(img, colours);
  }
  function motionHeld() {
    const root = typeof document !== "undefined" ? document.documentElement : null;
    if (!root) return false;
    if (root.classList.contains("jar-motion-full")) return false;
    if (root.classList.contains("jar-motion-reduce")) return true;
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  }
  function whenPaintable(face) {
    if (!face || face.tagName !== "IMG") return Promise.resolve(true);
    if (typeof face.decode === "function") return face.decode().then(() => true, () => false);
    if (face.complete) return Promise.resolve(face.naturalWidth > 0);
    return new Promise((resolve2) => {
      face.addEventListener("load", () => resolve2(true), { once: true });
      face.addEventListener("error", () => resolve2(false), { once: true });
    });
  }
  function revealAvatar(btn, face, onFail) {
    const prior = btn && btn.querySelector(":scope > .account-avatar--placeholder");
    if (btn && btn._avatarReveal) return true;
    if (!prior || motionHeld()) return false;
    const token = {};
    btn._avatarReveal = token;
    face.classList.add("is-arriving");
    let settled = false;
    const alive = () => btn._avatarReveal === token;
    const finish = () => {
      if (settled || !alive()) return;
      settled = true;
      btn._avatarReveal = null;
      face.classList.remove("is-arriving", "is-shown");
      if (prior.isConnected) prior.remove();
    };
    const fail = () => {
      if (settled || !alive()) return;
      settled = true;
      btn._avatarReveal = null;
      if (onFail) onFail();
    };
    const start = () => {
      if (!alive()) return;
      if (!prior.isConnected) {
        btn._avatarReveal = null;
        return;
      }
      if (face.tagName === "IMG" && face.complete && face.naturalWidth) decorateAvatar(face);
      btn.appendChild(face);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!alive() || !face.isConnected) {
          if (alive()) btn._avatarReveal = null;
          return;
        }
        face.classList.add("is-shown");
        face.addEventListener("transitionend", (ev) => {
          if (ev.target === face && ev.propertyName === "opacity") finish();
        });
        window.setTimeout(finish, 800);
      }));
    };
    whenPaintable(face).then((ok) => {
      (ok ? start : fail)();
    });
    return true;
  }
  function avatarImage(src, cls) {
    const img = document.createElement("img");
    img.className = cls;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.crossOrigin = "anonymous";
    if (seen.has(src)) apply(img, seen.get(src));
    else img.addEventListener("load", () => decorateAvatar(img), { once: true });
    img.src = src;
    return img;
  }

  // js/persist/sync/http-transport.mjs
  var METHODS = ["heads", "head", "blobs", "missing", "putBlobs", "commit", "remove", "settings", "commitSettings", "versions", "version"];
  var TIMEOUT_MS = 3e4;
  var TEXTS_TIMEOUT_MS = 12e4;
  var CARRIES_TEXTS = /* @__PURE__ */ new Set(["blobs", "putBlobs"]);
  function createHttpTransport(o = {}) {
    const base = (o.base || "/api/sync").replace(/\/$/, "");
    const doFetch = o.fetch || ((...a) => globalThis.fetch(...a));
    const headers = Object.assign({ "content-type": "application/json" }, o.headers || {});
    const timers = o.timers || { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) };
    const limitFor = (method) => CARRIES_TEXTS.has(method) ? o.textsTimeoutMs != null ? o.textsTimeoutMs : TEXTS_TIMEOUT_MS : o.timeoutMs != null ? o.timeoutMs : TIMEOUT_MS;
    async function call(method, args, extra) {
      const abort = new AbortController();
      let late = false;
      const timer = timers.set(() => {
        late = true;
        abort.abort();
      }, limitFor(method));
      try {
        const res = await doFetch(base + "/" + method, {
          method: "POST",
          headers,
          body: JSON.stringify({ args }),
          credentials: "same-origin",
          signal: abort.signal,
          keepalive: !!(extra && extra.keepalive)
        });
        if (res.status === 401 && typeof o.onSignedOut === "function") {
          try {
            o.onSignedOut();
          } catch (_) {
          }
        }
        if (res.status !== 200) {
          throw Object.assign(new Error("sync server answered " + res.status + " to " + method), { status: res.status });
        }
        const body = await res.json();
        if (!body || !("result" in body)) throw new Error("sync server sent no result for " + method);
        return body.result;
      } catch (err) {
        if (late) throw Object.assign(new Error("sync server did not answer " + method + " in time"), { timeout: true });
        throw err;
      } finally {
        timers.clear(timer);
      }
    }
    const transport = {};
    for (const m of METHODS) transport[m] = (...args) => call(m, args);
    transport.commitOnHide = (pid, req) => call("commit", [pid, req], { keepalive: true });
    return transport;
  }

  // js/account/account.mjs
  var g10 = typeof window !== "undefined" ? window : globalThis;
  var user = null;
  var available = false;
  var unreachable2 = null;
  var asked = false;
  var adopting = false;
  var placeholder = null;
  function accountState(o) {
    if (!o.asked) return "checking";
    if (!o.available) return "none";
    if (o.unreachable) return "unreachable";
    return o.user ? "signed-in" : "signed-out";
  }
  function accountMenu(state2, o = {}) {
    if (state2 === "checking") return [{ type: "status", title: "Checking your account\u2026" }];
    if (state2 === "none") {
      return [{ type: "status", title: "No accounts here", detail: "This copy of BelJar has no server, so your projects stay in this browser." }];
    }
    if (state2 === "unreachable") {
      return [
        { type: "status", title: "Can\u2019t reach BelJar\u2019s server", detail: o.reasonWords || null, tone: "warning" },
        { type: "separator" },
        { label: "Try again", act: "try-again" }
      ];
    }
    if (state2 === "signed-out") {
      return [
        { type: "status", title: "Not signed in", detail: "Sign in to keep your projects on every device." },
        { type: "separator" },
        { label: "Sign in with GitHub", act: "sign-in" }
      ];
    }
    const u = o.user || {};
    return [
      { type: "status", title: u.name || "@" + u.handle, detail: u.name ? "@" + u.handle : null, media: "avatar" },
      { type: "separator" },
      // Only where there is a Settings dialog to open (home has none).
      ...o.settings ? [{ label: "Account settings", act: "settings" }] : [],
      { label: "Sign out", act: "sign-out" }
    ];
  }
  function accountStep(me, local) {
    if (!me) return local ? "ended" : "signed-out";
    if (local === me.id) return "same";
    return local ? "switched" : "first";
  }
  function adoptable(projects, sizeOf) {
    return projects.filter((p) => p.owner === null && sizeOf(p.id) > 0).map((p) => p.id);
  }
  function endedStep(reason, keepSetting) {
    if (reason === "deleted") return "release";
    return keepSetting === "keep" ? "keep" : "leave";
  }
  function endedWords(reason, left) {
    if (reason === "deleted") return "Your account was deleted. Its projects stay in this browser.";
    const first = reason === "elsewhere" ? "This browser was signed out from another device." : "Your session in this browser ended.";
    return left ? first + " Sign in to bring your projects back." : first;
  }
  var HOUR = 60 * 60 * 1e3;
  function sessionWords(s, now = Date.now()) {
    const label = s.device || "A browser";
    if (s.current) return { label, detail: "This browser" };
    const h = Math.floor((now - s.usedAt) / HOUR);
    if (h < 1) return { label, detail: "Used in the last hour" };
    if (h < 24) return { label, detail: "Last used " + (h === 1 ? "1 hour" : h + " hours") + " ago" };
    const d = Math.floor(h / 24);
    if (d < 7) return { label, detail: "Last used " + (d === 1 ? "yesterday" : d + " days ago") };
    const then = new Date(s.usedAt);
    const opts = then.getFullYear() === new Date(now).getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" };
    return { label, detail: "Last used " + then.toLocaleDateString([], opts) };
  }
  function signInFailure(why, detail) {
    switch (why) {
      case "denied":
        return null;
      case "config":
        return "Sign-in isn\u2019t set up on this server yet: it has no GitHub secret. Nothing is wrong with your account.";
      case "state":
        if (detail === "no-cookie") {
          return "BelJar couldn\u2019t match GitHub\u2019s answer to this browser: the sign-in cookie was missing. It lasts 10 minutes and has to stay in the browser that started, so check that cookies are allowed for this site, then try again.";
        }
        if (detail === "mismatch") return "A newer sign-in started after this one, in another tab. Finish that one, or try again.";
        return "GitHub\u2019s answer came back incomplete. Try again.";
      case "code":
        return "GitHub sent you back without a sign-in code.";
      case "exchange":
        if (detail === "incorrect_client_credentials") {
          return "GitHub rejected BelJar\u2019s app credentials: the server\u2019s GitHub secret is wrong. This is the server\u2019s fault, not your account\u2019s.";
        }
        if (detail === "bad_verification_code") return "GitHub\u2019s one-time sign-in code had expired or was already used. Try again.";
        if (detail === "redirect_uri_mismatch") return "This site\u2019s address doesn\u2019t match the one BelJar\u2019s GitHub app is registered with.";
        if (detail === "status-429") return "GitHub is turning away sign-ins from BelJar\u2019s server for a while (too many requests). Wait a few minutes, then try again.";
        return "GitHub didn\u2019t hand over a sign-in token.";
      case "profile":
        return "GitHub signed you in, but BelJar couldn\u2019t read your public profile.";
      case "github":
        return "BelJar\u2019s server couldn\u2019t reach GitHub. Try again in a minute.";
      default:
        return "Sign-in stopped at a step this page doesn\u2019t know.";
    }
  }
  async function askServer() {
    let error = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("/api/auth/me", { credentials: "same-origin", headers: { accept: "application/json" } });
        if (res.status === 404) return { none: true };
        if (res.status === 200 && /application\/json/.test(res.headers.get("content-type") || "")) {
          const body = await res.json();
          return body && "user" in body ? { user: body.user, ended: body.ended || null } : { error: "not-json" };
        }
        error = res.status === 200 ? "not-json" : "status-" + res.status;
      } catch (_) {
        error = "network";
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
    return { error };
  }
  function reach(answer, deployed) {
    if (answer && "user" in answer) return "signed";
    if (!deployed) return "none";
    return "unreachable";
  }
  function unreachableWords(error) {
    if (error === "network") return "The request never came back: the network, or a browser extension, stopped it.";
    if (error === "not-json") return "The server answered with something other than an account.";
    if (/^status-4/.test(error || "")) return "This address has no account service (" + error.slice(7) + ").";
    if (/^status-/.test(error || "")) return "The server answered with an error (" + error.slice(7) + ").";
    return "The server did not answer.";
  }
  function toast(kind, message) {
    const T = g10.Toasts;
    if (T && typeof T[kind] === "function") T[kind](message);
  }
  function syncTransport2() {
    return createHttpTransport({ onSignedOut: () => {
      recheck();
    } });
  }
  function saveNow() {
    try {
      if (g10.Commands && typeof g10.Commands.run === "function") g10.Commands.run("file.save");
    } catch (_) {
    }
  }
  function initialNode(cls) {
    const initial = document.createElement("span");
    initial.className = cls + " account-initial";
    initial.textContent = (user && (user.name || user.handle) || "?").trim().charAt(0).toUpperCase();
    return initial;
  }
  function avatarNode(cls) {
    if (!(user && user.avatar)) return initialNode(cls);
    const img = avatarImage(user.avatar, cls);
    img.addEventListener("error", () => {
      if (img.classList.contains("is-arriving")) return;
      if (img.parentNode) img.replaceWith(initialNode(cls));
    }, { once: true });
    return img;
  }
  function onEditor() {
    return Routes.pageOf(g10.location) === "edit";
  }
  var state = () => accountState({ asked, available, unreachable: unreachable2, user });
  var BUTTON_WORDS = {
    checking: "Account",
    none: "Account",
    unreachable: "Can\u2019t reach BelJar\u2019s server",
    "signed-out": "Sign in"
  };
  function render() {
    const btn = document.getElementById("btn-account");
    if (!btn) return;
    if (!placeholder) {
      const shipped = btn.querySelector(".account-avatar--placeholder");
      if (shipped) placeholder = shipped.cloneNode(true);
    }
    const s = state();
    btn.hidden = false;
    btn.dataset.state = s;
    btn.classList.toggle("is-signed-in", s === "signed-in");
    btn.classList.toggle("is-unreachable", s === "unreachable");
    if (s === "signed-in") {
      btn.setAttribute("aria-label", "Account: @" + user.handle);
      btn.setAttribute("data-tooltip", "@" + user.handle);
      const face = avatarNode("account-avatar");
      if (!revealAvatar(btn, face, () => {
        btn.replaceChildren(initialNode("account-avatar"));
      })) btn.replaceChildren(face);
    } else {
      btn.setAttribute("aria-label", BUTTON_WORDS[s]);
      btn.setAttribute("data-tooltip", BUTTON_WORDS[s]);
      btn._avatarReveal = null;
      btn.replaceChildren(...placeholder ? [placeholder.cloneNode(true)] : []);
    }
    if (g10.Menu && g10.Menu.update && g10.Menu.rootAnchor && g10.Menu.rootAnchor() === btn) g10.Menu.update(btn, menuItems());
  }
  function menuItems() {
    const acts = {
      "try-again": () => connect(),
      "sign-in": signIn,
      settings: () => g10.SettingsUI.open("account"),
      "sign-out": signOut
    };
    return accountMenu(state(), {
      user,
      reasonWords: unreachable2 ? unreachableWords(unreachable2) : null,
      settings: !!g10.SettingsUI
    }).map((item) => {
      if (item.media === "avatar") return Object.assign({}, item, { media: avatarNode("account-avatar account-avatar--menu") });
      if (item.act) return { label: item.label, onSelect: acts[item.act] };
      return item;
    });
  }
  function goHome() {
    saveNow();
    Routes.go(Routes.homeUrl());
  }
  function signIn() {
    saveNow();
    Routes.go(Routes.signInUrl());
  }
  function adopt(projects) {
    const P = g10.Persist;
    let n = 0;
    const sizeOf = (pid) => P.projectStats(pid).size;
    for (const pid of adoptable(projects || P.projects(), sizeOf)) if (P.claimProject(pid)) n += 1;
    if (n) {
      g10.dispatchEvent(new CustomEvent("beljar:project-tree-changed", { detail: { kind: "external" } }));
      P.syncNow();
    }
    return n;
  }
  function adoptOnWrite() {
    const P = g10.Persist;
    const owned = /* @__PURE__ */ new Set();
    P.onFileChange(({ pid }) => {
      if (!user || !pid || owned.has(pid)) return;
      const p = P.projects().find((x) => x.id === pid);
      if (!p) return;
      if (p.owner !== null) {
        owned.add(pid);
        return;
      }
      adopt([p]);
    });
  }
  async function signOut() {
    if (!user) return;
    const P = g10.Persist;
    saveNow();
    const keep = !!(g10.Settings && g10.Settings.get("signOutKeep") === "keep");
    const check = await P.confirmSynced(keep ? 5e3 : void 0);
    if (!keep && !check.ok) {
      const choice = await g10.PromptDialog.open({
        ariaLabel: "Sign out",
        message: "Not everything is in the cloud yet",
        note: check.reason === "offline" ? "You\u2019re offline. Signing out removes your projects from this browser, with what hasn\u2019t synced." : "Signing out removes your projects from this browser, with what hasn\u2019t synced.",
        layout: "row",
        buttons: [
          { action: "out", label: "Sign out anyway", variant: "secondary" },
          { action: "stay", label: "Stay signed in", variant: "primary" }
        ]
      });
      if (choice !== "out") return;
    }
    await P.stopSync({ hold: true });
    try {
      await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
    } catch (_) {
    }
    const uid = user.id;
    user = null;
    if (keep) {
      P.keepAccountProjects(uid);
      P.setAccount(null);
    } else {
      P.setAccount(null);
      P.leaveAccount(uid);
    }
    Routes.go(Routes.homeUrl(), { replace: true });
  }
  var following = null;
  function followEndedSession(uid, reason) {
    if (!following) following = followEnded(uid, reason).finally(() => {
      following = null;
    });
    return following;
  }
  async function followEnded(uid, reason) {
    const P = g10.Persist;
    user = null;
    await P.stopSync();
    const step = endedStep(reason, g10.Settings && g10.Settings.get("signOutKeep"));
    if (step === "leave") {
      const stay = await P.unsyncedProjects(uid).catch(() => null);
      if (stay) {
        P.setAccount(null);
        P.leaveAccount(uid, stay);
        P.noteSignedOut(reason === "elsewhere" ? "elsewhere" : "ended");
        Routes.go(Routes.homeUrl(), { replace: true });
        return;
      }
    }
    if (step === "release") P.releaseAccount(uid);
    else P.keepAccountProjects(uid);
    P.setAccount(null);
    render();
    announce();
    toast("info", endedWords(reason, false));
  }
  function noteEndedSession() {
    const note = g10.Persist.takeSignedOutNote();
    if (note) toast("info", endedWords(note === "elsewhere" ? "elsewhere" : null, true));
  }
  var rechecking = false;
  async function recheck() {
    if (rechecking || !user) return;
    rechecking = true;
    try {
      const answer = await askServer();
      const uid = g10.Persist.getAccount();
      if (user && uid && answer && "user" in answer && !answer.user) await followEndedSession(uid, answer.ended);
    } finally {
      rechecking = false;
    }
  }
  async function sessions() {
    if (!user) return [];
    try {
      const res = await fetch("/api/auth/sessions", { credentials: "same-origin", headers: { accept: "application/json" } });
      if (res.status === 401) {
        recheck();
        return null;
      }
      if (res.status !== 200) return null;
      const body = await res.json();
      return body && Array.isArray(body.sessions) ? body.sessions : null;
    } catch (_) {
      return null;
    }
  }
  async function signOutThere(id) {
    try {
      const res = await fetch("/api/auth/sessions/end", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id })
      });
      return res.status === 200;
    } catch (_) {
      return false;
    }
  }
  async function deleteAccount() {
    if (!user) return;
    const who = user;
    const P = g10.Persist;
    const yes = await g10.ConfirmDialog.confirm({
      ariaLabel: "Delete account",
      subject: "@" + who.handle,
      message: "Delete your account?",
      note: "Everything in the cloud is deleted: your projects, every version of them, and your settings. Every device is signed out. Projects in this browser stay here.",
      confirmLabel: "Delete account"
    });
    if (!yes || user !== who) return;
    saveNow();
    const nav = g10.navigator;
    if (nav && nav.onLine === false) {
      toast("error", "You\u2019re offline. Deleting your account needs BelJar\u2019s server.");
      return;
    }
    await P.stopSync({ hold: true });
    let deleted = false;
    try {
      const res = await fetch("/api/auth/delete", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
      deleted = res.status === 200;
    } catch (_) {
    }
    if (!deleted) {
      const answer = await askServer();
      deleted = !!answer && "user" in answer && !answer.user && answer.ended === "deleted";
    }
    if (!deleted) {
      P.startSync({ transport: syncTransport2() });
      toast("error", "Couldn\u2019t delete your account. Nothing was changed.");
      return;
    }
    user = null;
    P.releaseAccount(who.id);
    P.setAccount(null);
    Routes.go(Routes.homeUrl(), { replace: true });
  }
  function resumeTarget(projects, uid, remembered) {
    const mine = (projects || []).filter((p) => p.owner === uid);
    if (!mine.length) return null;
    const back = remembered && mine.find((p) => p.id === remembered);
    if (back) return back.id;
    return mine.reduce((a, b) => b.createdAt >= a.createdAt ? b : a).id;
  }
  function resumeAfterSignIn() {
    const P = g10.Persist;
    if (!onEditor()) {
      if (user && P.resumeFor(user.id)) P.clearResume();
      return;
    }
    if (!user || !P.resumeFor(user.id)) return;
    let done = false;
    let off = null;
    const settle2 = () => {
      done = true;
      if (off) off();
    };
    const attempt = (s) => {
      if (done || !user) return;
      const r = P.resumeFor(user.id);
      if (!r) return settle2();
      const active = P.getActiveProjectId();
      const ed = g10.CurrentEditor;
      const typing = !!ed && typeof ed.getValue === "function" && ed.getValue() !== "";
      if (!P.isBlankProject(active) || typing) {
        P.clearResume();
        return settle2();
      }
      const target = resumeTarget(P.projects(), user.id, r.project);
      if (!target) {
        if (s && s.lastSync > 0 && s.state !== "syncing") {
          P.clearResume();
          settle2();
        }
        return void 0;
      }
      P.clearResume();
      settle2();
      if (g10.App && typeof g10.App.resumeProject === "function") g10.App.resumeProject(target, active);
      return void 0;
    };
    off = P.onSyncSummary(attempt);
    attempt(P.syncSummary());
  }
  function noteFailedSignIn() {
    const search = g10.location && g10.location.search;
    if (!search) return;
    const params = new URLSearchParams(search);
    if (params.get("signin") !== "failed") return;
    const why = params.get("why") || "";
    const detail = params.get("detail") || "";
    const explained = signInFailure(why, detail);
    if (!explained) {
      toast("info", "Sign-in was cancelled.");
    } else {
      toast("error", "Couldn\u2019t sign in with GitHub. The notifications say why.");
      const N = g10.Notifications;
      if (N && typeof N.emit === "function") {
        N.emit({
          kind: "error",
          category: "ops",
          origin: "local",
          source: "account.signin",
          title: "Couldn\u2019t sign in with GitHub",
          body: explained + ` (step: ${why}${detail ? ", " + detail : ""})`
        });
      }
    }
    params.delete("signin");
    params.delete("why");
    params.delete("detail");
    const rest = params.toString();
    g10.history.replaceState(null, "", g10.location.pathname + (rest ? "?" + rest : "") + g10.location.hash);
  }
  function noteUnreachable(error) {
    const N = g10.Notifications;
    if (!N || typeof N.emit !== "function") return;
    N.emit({
      kind: "warn",
      category: "ops",
      origin: "local",
      source: "account.reach",
      dedupeKey: "account.reach",
      title: "Can\u2019t reach BelJar\u2019s server",
      body: unreachableWords(error) + " Sign-in and sync are off until it can. (" + error + ")"
    });
  }
  async function follow() {
    const P = g10.Persist;
    if (onEditor() && P.ownerLeft()) {
      Routes.go(Routes.homeUrl(), { replace: true });
      return;
    }
    await P.stopSync();
    await connect();
  }
  async function boot() {
    noteFailedSignIn();
    noteEndedSession();
    g10.Persist.onAccountElsewhere(() => {
      follow();
    });
    await connect();
  }
  function noteNoServer() {
    const host = g10.location && g10.location.hostname;
    if (host !== "127.0.0.1" && host !== "localhost") return;
    console.info("BelJar: no server here (a static server has no /api), so sign-in and sync are off. For them locally: npm run dev, then http://127.0.0.1:8787");
  }
  function announce() {
    g10.dispatchEvent(new CustomEvent("beljar:account", { detail: { user: user ? Object.assign({}, user) : null } }));
  }
  async function connect() {
    if (asked) {
      asked = false;
      render();
    }
    const answer = await askServer();
    const where = reach(answer, !!g10.BELJAR_DEPLOYED);
    asked = true;
    if (where === "none") {
      noteNoServer();
      render();
      announce();
      return;
    }
    available = true;
    if (where === "unreachable") {
      unreachable2 = answer.error || "status-404";
      user = null;
      render();
      noteUnreachable(unreachable2);
      announce();
      return;
    }
    unreachable2 = null;
    const me = answer.user;
    user = me;
    const P = g10.Persist;
    const step = accountStep(me, P.getAccount());
    if (step === "ended") {
      await followEndedSession(P.getAccount(), answer.ended);
      return;
    }
    if (step === "first" || step === "switched") {
      P.setAccount(me.id);
      if (step === "switched") {
        g10.location.reload();
        return;
      }
    }
    render();
    announce();
    if (!me) return;
    adopt();
    if (!adopting) adoptOnWrite();
    adopting = true;
    P.startSync({ transport: syncTransport2() });
    resumeAfterSignIn();
  }
  var Account = {
    user: () => user ? Object.assign({}, user) : null,
    available: () => available,
    unreachable: () => unreachable2,
    menuItems,
    signIn,
    signOut,
    goHome,
    sessions,
    sessionWords,
    signOutThere,
    deleteAccount,
    _boot: boot
  };
  g10.Account = Account;
  if (typeof document !== "undefined") {
    const go2 = () => {
      if (g10.BELJAR_LEAVING) return;
      const idle = g10.requestIdleCallback;
      if (typeof idle === "function") idle(() => {
        boot();
      }, { timeout: 2e3 });
      else setTimeout(boot, 0);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go2, { once: true });
    else go2();
  }

  // js/ui/review-differences.mjs
  var g11 = typeof window !== "undefined" ? window : globalThis;
  function lineDiff(theirs, mine) {
    const a = splitLines(theirs);
    const b = splitLines(mine);
    const match = lcsMatch(a, b);
    const rows = [];
    let j = 0;
    for (let i = 0; i < a.length; i++) {
      const m = match[i];
      if (m < 0) {
        rows.push({ kind: "theirs", text: a[i] });
        continue;
      }
      while (j < m) rows.push({ kind: "mine", text: b[j++] });
      rows.push({ kind: "same", text: a[i] });
      j = m + 1;
    }
    while (j < b.length) rows.push({ kind: "mine", text: b[j++] });
    return rows;
  }
  function compactDiff(rows, context = 1) {
    const keep = new Array(rows.length).fill(false);
    rows.forEach((r, i) => {
      if (r.kind === "same") return;
      for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) keep[k] = true;
    });
    const out = [];
    let gap = 0;
    rows.forEach((r, i) => {
      if (!keep[i]) {
        gap += 1;
        return;
      }
      if (gap) out.push({ kind: "gap", count: gap });
      gap = 0;
      out.push(r);
    });
    if (gap && out.length) out.push({ kind: "gap", count: gap });
    return out;
  }
  function otherSide(source) {
    return source === "tab" ? { where: "here and in another tab", theirs: "the other tab\u2019s", use: "Use other tab", all: "Use other tabs" } : { where: "here and in the cloud", theirs: "the cloud\u2019s", use: "Use cloud", all: "Use cloud for all" };
  }
  function reviewWords(files2) {
    const sources = new Set(files2.map((c) => c.source === "tab" ? "tab" : "device"));
    if (sources.size === 1) {
      const w = otherSide([...sources][0]);
      return { intro: (files2.length === 1 ? "This file changed " : "These files changed ") + w.where + ".", theirs: w.theirs, all: w.all };
    }
    return { intro: "These files changed here and somewhere else.", theirs: "the other version", all: "Use the other versions" };
  }
  function el2(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function sidesOf(c) {
    const App = g11.App;
    const open6 = App && typeof App.openConflictSides === "function" ? App.openConflictSides(c.pid, c.fid) : null;
    return open6 || g11.Persist.conflictSides(c.pid, c.fid);
  }
  function resolveDifference(c, choice) {
    const App = g11.App;
    const open6 = App && typeof App.resolveOpenConflict === "function" ? App.resolveOpenConflict(c.pid, c.fid, choice) : null;
    if (open6 !== null && open6 !== void 0) return open6;
    return g11.Persist.resolveStoredConflict(c.pid, c.fid, choice);
  }
  function diffNode(sides) {
    const pre = el2("div", "review-diff");
    const rows = compactDiff(lineDiff(sides.theirs, sides.mine), 1);
    if (!rows.length) {
      pre.appendChild(el2("div", "review-diff__none", "Both sides are the same now. Either choice keeps it."));
      return pre;
    }
    for (const r of rows) {
      if (r.kind === "gap") {
        pre.appendChild(el2("div", "review-diff__gap", r.count === 1 ? "1 unchanged line" : r.count + " unchanged lines"));
        continue;
      }
      const line = el2("div", "review-diff__line is-" + r.kind);
      line.appendChild(el2("span", "review-diff__mark", r.kind === "theirs" ? "\u2212" : r.kind === "mine" ? "+" : ""));
      line.appendChild(el2("span", "review-diff__text", r.text || " "));
      pre.appendChild(line);
    }
    return pre;
  }
  var win = null;
  function render2(body) {
    const P = g11.Persist;
    const files2 = P.listConflicts();
    body.replaceChildren();
    if (!files2.length) {
      if (win) win.close();
      return;
    }
    const all = reviewWords(files2);
    body.appendChild(el2("p", "review__intro", all.intro + " Both versions are kept until you choose."));
    const legend = el2("p", "review__legend");
    legend.appendChild(el2("span", "review__key is-theirs", "\u2212 " + all.theirs));
    legend.appendChild(el2("span", "review__key is-mine", "+ yours"));
    body.appendChild(legend);
    for (const c of files2) {
      const sides = sidesOf(c);
      if (!sides) continue;
      const words = otherSide(sides.source || c.source);
      const section = el2("section", "review__file");
      section.dataset.pid = c.pid;
      section.dataset.fid = c.fid;
      const head = el2("div", "review__head");
      const name = el2("div", "review__name");
      name.appendChild(el2("span", "review__path", c.path));
      head.appendChild(name);
      const actions = el2("div", "review__actions");
      const theirsBtn = actionButton(words.use, "theirs", "secondary");
      const mineBtn = actionButton("Keep mine", "mine", "primary");
      for (const btn of [theirsBtn, mineBtn]) {
        btn.addEventListener("click", () => {
          resolveDifference(c, btn.dataset.action);
          render2(body);
        });
        actions.appendChild(btn);
      }
      head.appendChild(actions);
      section.appendChild(head);
      section.appendChild(diffNode(sides));
      body.appendChild(section);
    }
    if (files2.length > 1) {
      const bar = el2("div", "review__all");
      const theirsAll = actionButton(all.all, "theirs", "secondary");
      const mineAll = actionButton("Keep all mine", "mine", "primary");
      for (const btn of [theirsAll, mineAll]) {
        btn.addEventListener("click", () => {
          for (const c of g11.Persist.listConflicts()) resolveDifference(c, btn.dataset.action);
          render2(body);
        });
        bar.appendChild(btn);
      }
      body.appendChild(bar);
    }
  }
  function fittingHeight(files2) {
    let rows = 0;
    for (const c of files2) {
      const sides = sidesOf(c);
      if (sides) rows += compactDiff(lineDiff(sides.theirs, sides.mine), 1).length;
    }
    return Math.max(220, Math.min(540, 124 + files2.length * 52 + rows * 18 + (files2.length > 1 ? 44 : 0)));
  }
  function openReviewDifferences() {
    const FW = g11.FloatingWindow;
    if (!FW || !g11.Persist) return false;
    if (!g11.Persist.listConflicts().length) return false;
    if (win) {
      render2(win.body);
      return true;
    }
    const body = el2("div", "review");
    const handle = FW.open({
      title: "Review differences",
      className: "floating-window--review",
      content: body,
      width: 560,
      height: fittingHeight(g11.Persist.listConflicts()),
      minWidth: 360,
      minHeight: 220,
      onClose: () => {
        win = null;
      }
    });
    win = { close: () => handle.close(), body };
    render2(body);
    return true;
  }
  function refreshReviewDifferences() {
    if (win) render2(win.body);
  }
  var ReviewDifferences = { open: openReviewDifferences, refresh: refreshReviewDifferences, resolve: resolveDifference };
  g11.ReviewDifferences = ReviewDifferences;

  // js/ui/review-offline.mjs
  var g12 = typeof window !== "undefined" ? window : globalThis;
  var CHANGE_WORDS = { added: "new", edited: "edited", renamed: "renamed", deleted: "deleted" };
  function changeSummary(p) {
    if (p.isNew) return "new here";
    if (p.deleted) return "deleted here";
    const counts = {};
    for (const f of p.files) counts[f.change] = (counts[f.change] || 0) + 1;
    const parts = ["edited", "added", "renamed", "deleted"].filter((k) => counts[k]).map((k) => counts[k] + " " + CHANGE_WORDS[k]);
    if (p.renamed) parts.unshift("name changed");
    return parts.length ? parts.join(", ") : "folders or suites changed";
  }
  function offlineRows(changes, sides) {
    const out = [];
    for (const p of changes) {
      const side = sides[p.pid] || { state: "unknown", name: null, texts: {} };
      if (p.deleted && (side.state === "deleted" || side.state === "absent")) continue;
      out.push({
        p,
        side,
        name: p.name || side.name || "A deleted project",
        words: changeSummary(p) + (side.state === "deleted" && !p.deleted ? ", deleted in the cloud" : ""),
        // Only what the cloud has (or deleted) can be taken from it.
        canUseCloud: side.state === "present" || side.state === "deleted" || side.state === "unknown"
      });
    }
    return out;
  }
  function el3(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function diffNode2(theirs, mine) {
    const box = el3("div", "review-diff");
    for (const r of compactDiff(lineDiff(theirs || "", mine || ""), 1)) {
      if (r.kind === "gap") {
        box.appendChild(el3("div", "review-diff__gap", r.count === 1 ? "1 unchanged line" : r.count + " unchanged lines"));
        continue;
      }
      const line = el3("div", "review-diff__line is-" + r.kind);
      line.appendChild(el3("span", "review-diff__mark", r.kind === "theirs" ? "\u2212" : r.kind === "mine" ? "+" : ""));
      line.appendChild(el3("span", "review-diff__text", r.text || " "));
      box.appendChild(line);
    }
    return box;
  }
  var win2 = null;
  var busy = false;
  var problem = null;
  function projectSection(row) {
    const P = g12.Persist;
    const { p, side } = row;
    const section = el3("section", "review__file");
    section.dataset.pid = p.pid;
    const head = el3("div", "review__head");
    const name = el3("div", "review__name");
    name.appendChild(el3("span", "review__project", row.name));
    name.appendChild(el3("span", "review__changes", row.words));
    head.appendChild(name);
    const actions = el3("div", "review__actions");
    if (row.canUseCloud) {
      const cloud = actionButton("Use the cloud\u2019s", "cloud", "secondary");
      cloud.addEventListener("click", () => act(() => P.useCloud(p.pid)));
      actions.appendChild(cloud);
    }
    head.appendChild(actions);
    section.appendChild(head);
    for (const f of p.files) {
      const line = el3("div", "review__change");
      line.appendChild(el3("span", "review__path", f.path));
      line.appendChild(el3("span", "review__kind", CHANGE_WORDS[f.change]));
      section.appendChild(line);
      const theirs = side.texts && side.texts[f.fid];
      if (f.change === "edited" && typeof theirs === "string") {
        section.appendChild(diffNode2(theirs, P.projectFileText(p.pid, f.fid)));
      }
    }
    return section;
  }
  async function cloudSides(changes) {
    const P = g12.Persist;
    const sides = {};
    for (const p of changes) {
      if (p.isNew) {
        sides[p.pid] = { state: "absent", name: null, texts: {} };
        continue;
      }
      try {
        sides[p.pid] = await P.cloudSide(p.pid, p.files.filter((f) => f.change === "edited").map((f) => f.fid));
      } catch (_) {
        sides[p.pid] = { state: "unknown", name: null, texts: {} };
      }
    }
    return sides;
  }
  async function render3(body) {
    const P = g12.Persist;
    const changes = await P.offlineChanges();
    const rows = offlineRows(changes, await cloudSides(changes));
    body.replaceChildren();
    if (!rows.length) {
      await P.releaseSync();
      if (win2) win2.close();
      return;
    }
    body.appendChild(el3("p", "review__intro", rows.length === 1 ? "This project changed here while you were offline. Upload the changes, or use the cloud\u2019s version instead." : "These projects changed here while you were offline. Upload the changes, or use the cloud\u2019s version instead."));
    if (rows.some((r) => r.p.files.some((f) => f.change === "edited"))) {
      const legend = el3("p", "review__legend");
      legend.appendChild(el3("span", "review__key is-theirs", "\u2212 the cloud\u2019s"));
      legend.appendChild(el3("span", "review__key is-mine", "+ yours"));
      body.appendChild(legend);
    }
    for (const row of rows) body.appendChild(projectSection(row));
    if (problem) body.appendChild(el3("p", "review__problem", problem));
    const bar = el3("div", "review__all");
    const cloudable = rows.filter((r) => r.canUseCloud);
    if (rows.length > 1 && cloudable.length) {
      const cloudAll = actionButton("Use the cloud\u2019s for all", "cloud", "secondary");
      cloudAll.addEventListener("click", () => act(async () => {
        for (const r of cloudable) await P.useCloud(r.p.pid);
      }));
      bar.appendChild(cloudAll);
    }
    const upload = actionButton("Upload", "upload", "primary");
    upload.addEventListener("click", () => act(async () => {
      await P.releaseSync();
      if (win2) win2.close();
    }));
    bar.appendChild(upload);
    body.appendChild(bar);
  }
  async function act(fn) {
    if (busy) return;
    busy = true;
    problem = null;
    try {
      await fn();
    } catch (_) {
      problem = "Couldn\u2019t reach the cloud. Try again.";
    } finally {
      busy = false;
    }
    if (win2) await render3(win2.body);
  }
  async function openReviewOffline() {
    const FW = g12.FloatingWindow;
    if (!FW || !g12.Persist) return false;
    if (win2) {
      await render3(win2.body);
      return true;
    }
    const body = el3("div", "review");
    const handle = FW.open({
      title: "Changes made offline",
      className: "floating-window--review",
      content: body,
      width: 560,
      height: 380,
      minWidth: 360,
      minHeight: 220,
      onClose: () => {
        win2 = null;
        problem = null;
      }
    });
    win2 = { close: () => handle.close(), body };
    await render3(body);
    return true;
  }
  var ReviewOffline = { open: openReviewOffline };
  g12.ReviewOffline = ReviewOffline;

  // js/account/cloud-glyphs.mjs
  var CLOUD = "M6.75 18.25A4 4 0 0 1 6.52 10.26A5.5 5.5 0 0 1 17.41 9.75A4.25 4.25 0 0 1 17.25 18.25Z";
  var SLASH = "M5.75 6.5 17.75 18.5";
  var MARKS = {
    // pathLength 1: the check can draw itself in when a round lands (css).
    synced: '<path class="sync-cloud__mark sync-cloud__check" pathLength="1" d="M9.9 14.05l1.5 1.5 3-3"/>',
    syncing: '<path class="sync-cloud__mark sync-cloud__arrow" d="M12 15.75v-4m-1.75 1.75L12 11.75l1.75 1.75"/>',
    alert: '<path class="sync-cloud__mark" d="M12 11.5v2.75"/><path class="sync-cloud__mark" d="M12 16.5h.01"/>'
  };
  function cloudLook(state2) {
    if (state2 === "pending" || state2 === "syncing") return "syncing";
    if (state2 === "differs" || state2 === "error" || state2 === "held") return "alert";
    return state2 === "offline" ? "offline" : "synced";
  }
  function cloudSvg(look) {
    const open6 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    if (look === "offline") {
      return open6 + '<mask id="sync-cloud-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><path d="' + SLASH + '" stroke="#000" stroke-width="5"/></mask><path d="' + CLOUD + '" mask="url(#sync-cloud-cut)"/><path class="sync-cloud__mark" d="' + SLASH + '"/></svg>';
    }
    return open6 + '<path d="' + CLOUD + '"/>' + (MARKS[look] || MARKS.synced) + "</svg>";
  }

  // js/account/sync-watch.mjs
  var FAILING_MS = 10 * 60 * 1e3;
  function createFailureWatch(o = {}) {
    const now = o.now || (() => Date.now());
    const after = o.after != null ? o.after : FAILING_MS;
    let since = null;
    let told = false;
    return {
      observe(s) {
        const state2 = s && s.state;
        if (state2 === "error") {
          if (since === null) since = now();
          if (!told && now() - since >= after) {
            told = true;
            return "emit";
          }
          return null;
        }
        if (state2 === "synced") {
          since = null;
          if (told) {
            told = false;
            return "clear";
          }
          return null;
        }
        return null;
      },
      since: () => since
    };
  }

  // js/account/sync-ui.mjs
  var g13 = typeof window !== "undefined" ? window : globalThis;
  var summary = null;
  var wasOffline = false;
  var marks = null;
  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }
  function ago(ms, now = Date.now()) {
    const s = Math.max(0, Math.round((now - ms) / 1e3));
    if (s < 45) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return plural(m, "minute", "minutes") + " ago";
    return "at " + new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  function failureWords(reason) {
    const m = /^status-(\d+)$/.exec(reason || "");
    if (m) {
      const code = Number(m[1]);
      if (code === 429) return "BelJar\u2019s server is busy (429). It tries again on its own; nothing here is lost.";
      if (code >= 500) return "BelJar\u2019s server had a problem (" + code + "). It tries again on its own; nothing here is lost.";
      if (code === 413) return "A change was too large for the server to take (413). It stays here.";
      if (code === 401) return "This browser\u2019s session has ended. Sign in again to sync.";
      return "BelJar\u2019s server refused the request (" + code + "). It tries again on its own; nothing here is lost.";
    }
    if (reason === "refused-quota-projects") {
      return "Your account has " + QUOTA.projects.toLocaleString("en") + " projects, BelJar\u2019s limit. Delete projects you no longer need, and new ones sync.";
    }
    if (reason === "refused-quota-texts") {
      return "Your account has stored as much text as BelJar allows (" + Math.round(QUOTA.textBytes / (1024 * 1024 * 1024)) + " GB), which usually means something has gone wrong. Report an issue; nothing here is lost.";
    }
    if (reason === "refused-too-many" || reason === "refused-bad-manifest") return "The server refused a change it could not take. It stays here.";
    return null;
  }
  function cloudWords(s, now = Date.now()) {
    switch (s.state) {
      case "differs": {
        const n = s.differs.length;
        return { tip: plural(n, "file", "files") + " to review", title: plural(n, "file", "files") + " to review", detail: "Changed here and somewhere else.", tone: "warning" };
      }
      case "offline":
        return { tip: "Offline", title: "Offline", detail: "Changes sync when you\u2019re back online." };
      case "held":
        return { tip: "Changes made offline", title: "Changes made offline", detail: "They wait for you to upload them, or use the cloud\u2019s version.", tone: "warning" };
      case "error":
        return { tip: "Couldn\u2019t sync", title: "Couldn\u2019t sync", detail: failureWords(s.reason) || "BelJar keeps trying.", tone: "error" };
      case "syncing":
      case "pending":
        return { tip: "Syncing", title: "Syncing", detail: s.lastSync ? "Last synced " + ago(s.lastSync, now) : null };
      default:
        return { tip: "All changes synced", title: "All changes synced", detail: s.lastSync ? "Synced " + ago(s.lastSync, now) : null };
    }
  }
  var shownLook = null;
  function renderCloud(s) {
    const btn = document.getElementById("btn-sync");
    if (!btn) return;
    btn.hidden = !s.signedIn;
    if (!s.signedIn) {
      shownLook = null;
      return;
    }
    const look = cloudLook(s.state);
    btn.dataset.state = s.state === "differs" || s.state === "held" ? "differs" : s.state === "pending" ? "pending" : look;
    if (look !== shownLook) {
      btn.classList.toggle("is-arriving", look === "synced" && shownLook !== null);
      btn.innerHTML = cloudSvg(look);
      shownLook = look;
    }
    const tip = cloudWords(s).tip;
    btn.setAttribute("aria-label", tip);
    if (g13.Tooltips && typeof g13.Tooltips.set === "function") g13.Tooltips.set(btn, tip);
    else btn.setAttribute("data-tooltip", tip);
    if (g13.Menu && g13.Menu.update && g13.Menu.rootAnchor && g13.Menu.rootAnchor() === btn) g13.Menu.update(btn, menuItems2());
  }
  function menuItems2() {
    const s = summary || g13.Persist.syncSummary();
    const words = cloudWords(s);
    const items = [{ type: "status", title: words.title, detail: words.detail, tone: words.tone }];
    if (s.differs.length) {
      items.push({ type: "separator" }, { label: "Review differences", onSelect: () => openReviewDifferences() });
    }
    if (s.state === "held") {
      items.push({ type: "separator" }, { label: "Review changes made offline", onSelect: () => openReviewOffline() });
      return items;
    }
    items.push({ type: "separator" }, {
      label: "Sync now",
      disabled: s.state === "offline" || s.state === "syncing",
      onSelect: () => g13.Persist.confirmSynced()
    });
    return items;
  }
  function markExplorer(s) {
    if (!g13.Routes || g13.Routes.pageOf(g13.location) !== "edit") return;
    if (!marks) {
      marks = document.createElement("style");
      marks.id = "sync-differs-marks";
      document.head.appendChild(marks);
    }
    const pid = g13.Persist.getActiveProjectId();
    const ids = s.differs.filter((d) => d.pid === pid).map((d) => d.fid);
    const esc = (id) => g13.CSS && typeof g13.CSS.escape === "function" ? g13.CSS.escape(id) : String(id).replace(/"/g, "");
    marks.textContent = ids.length ? ids.map((id) => `.explorer-file-item[data-file-id="${esc(id)}"] .explorer-file-item-name`).join(",\n") + " { color: var(--ide-status-warning); }\n" + ids.map((id) => `.explorer-file-item[data-file-id="${esc(id)}"] .explorer-file-item-name::after`).join(",\n") + ' { content: " \\2260"; opacity: 0.85; }' : "";
  }
  function applyPreference(s) {
    const S = g13.Settings;
    if (!S || S.get("syncBothChanged") !== "merge") return false;
    const how = S.get("syncOverlap");
    if (how !== "mine" && how !== "cloud") return false;
    let settled = false;
    for (const c of s.differs) {
      if (c.source !== "device") continue;
      if (resolveDifference(c, how === "mine" ? "mine" : "theirs")) settled = true;
    }
    return settled;
  }
  function say(text) {
    if (g13.StatusStrip && typeof g13.StatusStrip.setMessage === "function") g13.StatusStrip.setMessage(text);
  }
  function notices() {
    return !g13.Settings || g13.Settings.get("syncNotices") !== false;
  }
  function noteRefusal(s) {
    const reason = s && s.state === "error" ? s.reason : null;
    if (!reason || !/^refused-quota-/.test(reason)) return;
    const N = g13.Notifications;
    if (!N || typeof N.emit !== "function") return;
    N.emit({
      kind: "error",
      category: "ops",
      origin: "local",
      source: "sync.quota",
      dedupeKey: "sync." + reason,
      title: reason === "refused-quota-projects" ? "Too many projects to sync" : "Your account is full",
      body: failureWords(reason)
    });
  }
  function noteFailing(action, s, N = g13.Notifications) {
    if (!N || typeof N.emit !== "function") return;
    if (action === "emit") {
      N.emit({
        kind: "error",
        category: "ops",
        origin: "local",
        source: "sync.failing",
        dedupeKey: "sync.failing",
        title: "Couldn\u2019t sync for ten minutes",
        body: failureWords(s && s.reason) || "BelJar keeps trying. Everything stays in this browser meanwhile."
      });
    } else if (action === "clear") {
      const card = (typeof N.list === "function" ? N.list() : []).find((r) => r.dedupeKey === "sync.failing" && !r.dismissedAt);
      if (card && typeof N.dismiss === "function") N.dismiss(card.id);
    }
  }
  var failing = createFailureWatch({ after: typeof g13.BELJAR_SYNC_FAILING_MS === "number" ? g13.BELJAR_SYNC_FAILING_MS : void 0 });
  function update(s) {
    if (applyPreference(s)) return;
    const before = summary;
    summary = s;
    noteRefusal(s);
    const act2 = failing.observe(s);
    if (act2) noteFailing(act2, s);
    if (s.state === "offline") wasOffline = true;
    else if (wasOffline && s.state === "synced") {
      wasOffline = false;
      if (before && notices()) say("Back online. Everything is synced.");
    }
    renderCloud(s);
    markExplorer(s);
    refreshReviewDifferences();
    if (g13.StatusStrip && typeof g13.StatusStrip.setEditorState === "function") {
      g13.StatusStrip.setEditorState({ sync: Object.assign({}, s, { notices: notices() }) });
    }
  }
  var SyncUI = {
    menuItems: menuItems2,
    review: () => openReviewDifferences(),
    reviewOffline: () => openReviewOffline(),
    summary: () => summary || (g13.Persist ? g13.Persist.syncSummary() : null)
  };
  g13.SyncUI = SyncUI;
  if (typeof document !== "undefined") {
    const go2 = () => {
      const P = g13.Persist;
      if (!P || typeof P.onSyncSummary !== "function") return;
      P.onSyncSummary(update);
      update(P.syncSummary());
      g13.addEventListener("beljar:account", () => update(P.syncSummary()));
      if (g13.Settings && typeof g13.Settings.subscribe === "function") {
        g13.Settings.subscribe((e) => {
          if (e && Array.isArray(e.ids) && e.ids.some((id) => /^sync/.test(id))) update(P.syncSummary());
        });
      }
      g13.addEventListener("beljar:project-tree-changed", () => {
        if (summary) markExplorer(summary);
      });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go2, { once: true });
    else go2();
  }

  // js/editor-src/project-paths.mjs
  function fileBase(name) {
    const s = String(name || "");
    return s.slice(s.lastIndexOf("/") + 1);
  }
  function isExtensionless(name) {
    return !fileBase(name).includes(".");
  }
  function isCfgPath(name) {
    return String(name || "").toLowerCase().endsWith(".cfg");
  }
  function isElfPath(name) {
    return String(name || "").toLowerCase().endsWith(".elf");
  }
  function isBelPath(name) {
    const low = String(name || "").toLowerCase();
    if (isCfgPath(name) || isElfPath(name)) return false;
    if (low.endsWith(".bel")) return true;
    return isExtensionless(name);
  }
  function isSignaturePath(name) {
    return isBelPath(name) || isElfPath(name);
  }
  function isProjectSourcePath(name) {
    return isSignaturePath(name) || isCfgPath(name);
  }
  function isCfgEntryToken(text) {
    const t = String(text || "").trim();
    if (!t || t.charAt(0) === "%") return false;
    const low = t.toLowerCase();
    if (low.endsWith(".cfg") || low.endsWith(".elf") || low.endsWith(".bel")) return true;
    const base = t.includes("/") ? t.slice(t.lastIndexOf("/") + 1) : t;
    return !base.includes(".");
  }
  function isCfgSourceEntry(text) {
    return isCfgEntryToken(text) && !String(text || "").trim().toLowerCase().endsWith(".cfg");
  }

  // js/editor-src/semantic/development.mjs
  function dirOf(name) {
    const i = String(name || "").lastIndexOf("/");
    return i === -1 ? "" : name.slice(0, i);
  }
  function baseNoExt(name) {
    const s = String(name || "");
    const base = s.slice(s.lastIndexOf("/") + 1);
    const dot = base.lastIndexOf(".");
    return dot === -1 ? base : base.slice(0, dot);
  }
  function joinPath(dir, entry) {
    if (!dir) return entry;
    if (!entry) return dir;
    return `${dir}/${entry}`;
  }
  function parseCfg(text) {
    const out = [];
    for (const line of String(text || "").split("\n")) {
      const t = line.trim();
      if (!t || t.charAt(0) === "%") continue;
      out.push(t);
    }
    return out;
  }
  function cfgByDirFromFiles(files2, getText) {
    const cfgByDir = {};
    for (const f of files2) {
      const n = String(f.name || "");
      if (!n.toLowerCase().endsWith(".cfg")) continue;
      const dir = dirOf(n);
      const base = n.slice(n.lastIndexOf("/") + 1);
      if (!cfgByDir[dir]) cfgByDir[dir] = {};
      cfgByDir[dir][base] = String(getText(f.id) ?? "");
    }
    return cfgByDir;
  }
  function allSignaturePaths(files2) {
    const out = [];
    for (const f of files2) {
      const fn = String(f.name || "");
      if (isSignaturePath(fn)) out.push(fn);
    }
    return out;
  }
  function pathSetFrom(paths) {
    return Object.fromEntries(paths.map((p) => [p, true]));
  }
  function cfgHash(text) {
    let hash = 2166136261;
    const s = String(text || "");
    for (let i = 0; i < s.length; i += 1) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(16);
  }
  function resolveCfgOrder(cfgDir, cfgText, cfgByDir, pathSet, seenCfg) {
    seenCfg = seenCfg || /* @__PURE__ */ new Set();
    const key = `${cfgDir}\0${cfgHash(cfgText)}`;
    if (seenCfg.has(key)) return [];
    seenCfg.add(key);
    const ordered = [];
    const seen2 = /* @__PURE__ */ new Set();
    for (const entry of parseCfg(cfgText)) {
      const low = entry.toLowerCase();
      if (low.endsWith(".cfg")) {
        const slash = entry.lastIndexOf("/");
        const subDir = slash === -1 ? cfgDir : joinPath(cfgDir, entry.slice(0, slash));
        const subName = slash === -1 ? entry : entry.slice(slash + 1);
        const subMap = cfgByDir[subDir];
        if (subMap?.[subName]) {
          for (const p of resolveCfgOrder(subDir, subMap[subName], cfgByDir, pathSet, seenCfg)) {
            if (!seen2.has(p)) {
              seen2.add(p);
              ordered.push(p);
            }
          }
        }
      } else if (isCfgSourceEntry(entry)) {
        const full = joinPath(cfgDir, entry);
        if (pathSet[full] && !seen2.has(full)) {
          seen2.add(full);
          ordered.push(full);
        }
      }
    }
    return ordered;
  }
  function topLevelCfgPaths(files2, getText) {
    const referenced = {};
    const cfgPaths = [];
    for (const f of files2) {
      const n = String(f.name || "");
      if (!n.toLowerCase().endsWith(".cfg")) continue;
      cfgPaths.push(n);
      const cdir = dirOf(n);
      for (const entry of parseCfg(getText(f.id))) {
        if (entry.toLowerCase().endsWith(".cfg")) {
          referenced[joinPath(cdir, entry)] = true;
        }
      }
    }
    cfgPaths.sort();
    return cfgPaths.filter((p) => !referenced[p]);
  }
  function resolveActiveChain(files2, cfgPath, getText) {
    if (!cfgPath) return [];
    const allSet = pathSetFrom(allSignaturePaths(files2));
    const cfgByDir = cfgByDirFromFiles(files2, getText);
    const dir = dirOf(cfgPath);
    const base = cfgPath.slice(cfgPath.lastIndexOf("/") + 1);
    const map = cfgByDir[dir];
    if (!map?.[base]) return [];
    return resolveCfgOrder(dir, map[base], cfgByDir, allSet, /* @__PURE__ */ new Set());
  }
  function owningCfgForFile(files2, fileName, getText, preferredCfg = null) {
    const dir = dirOf(fileName);
    const cfgs = files2.filter((f) => /\.cfg$/i.test(String(f.name || "")) && dirOf(f.name) === dir).map((f) => f.name);
    if (!cfgs.length) return null;
    const owning = cfgs.filter((cfg) => resolveActiveChain(files2, cfg, getText).includes(fileName));
    if (!owning.length) return null;
    if (preferredCfg && owning.includes(preferredCfg)) return preferredCfg;
    return owning[0];
  }
  function bestCfgInDir(files2, getText, dir) {
    const cfgByDir = cfgByDirFromFiles(files2, getText);
    const map = cfgByDir[dir != null ? String(dir) : ""];
    if (!map) return null;
    const pathSet = pathSetFrom(allSignaturePaths(files2).filter((p) => dirOf(p) === dir));
    let best = null;
    let bestCount = -1;
    for (const cfgName of Object.keys(map)) {
      const cfgPath = joinPath(dir, cfgName);
      const ord = resolveCfgOrder(dir, map[cfgName], cfgByDir, pathSet, /* @__PURE__ */ new Set());
      if (ord.length > bestCount || ord.length === bestCount && cfgPath < (best || "")) {
        bestCount = ord.length;
        best = cfgPath;
      }
    }
    return best;
  }
  function inferActiveCfgForDir(files2, getText, dir) {
    return bestCfgInDir(files2, getText, dir);
  }
  function inferActiveCfgByDir(files2, getText) {
    const cfgByDir = cfgByDirFromFiles(files2, getText);
    const out = {};
    for (const dir of Object.keys(cfgByDir)) {
      const best = bestCfgInDir(files2, getText, dir);
      if (best) out[dir] = best;
    }
    return out;
  }
  function defaultActiveCfgForDir(dir) {
    const d = dir != null ? String(dir) : "";
    const g20 = typeof globalThis !== "undefined" ? globalThis : {};
    const P = g20.Persist;
    if (P && typeof P.getActiveCfgForDir === "function") {
      const path = P.getActiveCfgForDir(d);
      if (path) {
        if (typeof P.listFiles === "function") {
          const files2 = P.listFiles();
          if (files2.some((f) => f.name === path)) return path;
        } else return path;
      }
    }
    if (P && typeof P.listFiles === "function" && typeof P.getFileText === "function") {
      return inferActiveCfgForDir(P.listFiles(), (id) => P.getFileText(id), d);
    }
    return null;
  }
  function activeCfgResolver(map) {
    const byDir = map || {};
    return (dir) => byDir[dir != null ? String(dir) : ""] || null;
  }
  function resolveActiveCfgForDir(options) {
    if (typeof options?.activeCfgForDir === "function") return options.activeCfgForDir;
    return defaultActiveCfgForDir;
  }
  function defaultActiveCfgsForDir(dir) {
    const d = dir != null ? String(dir) : "";
    const g20 = typeof globalThis !== "undefined" ? globalThis : {};
    const P = g20.Persist;
    if (P && typeof P.getActiveCfgsForDir === "function") {
      const list3 = P.getActiveCfgsForDir(d);
      if (list3?.length) {
        if (typeof P.listFiles === "function") {
          const names = new Set(P.listFiles().map((f) => f.name));
          const out = list3.filter((p) => names.has(p));
          if (out.length) return out;
        } else return list3.slice();
      }
    }
    const one = defaultActiveCfgForDir(d);
    return one ? [one] : [];
  }
  function resolveActiveCfgsForDir(options) {
    if (typeof options?.activeCfgsForDir === "function") return options.activeCfgsForDir;
    return defaultActiveCfgsForDir;
  }
  function resolveOwningActiveCfg(files2, filePath, getText, activeCfgs) {
    if (!activeCfgs?.length) return null;
    const owning = activeCfgs.filter((cfg) => resolveActiveChain(files2, cfg, getText).includes(filePath));
    return owning.length === 1 ? owning[0] : null;
  }
  function standaloneResult(active) {
    return {
      kind: "standalone",
      cfg: null,
      paths: active ? [active.name] : [],
      activeIndex: active ? 0 : -1,
      preludePaths: [],
      scopeKey: active ? `standalone:${active.name}` : "standalone:"
    };
  }
  function developmentForFile(files2, activeId2, getText, options = {}) {
    const activeCfgsForDir = resolveActiveCfgsForDir(options);
    const activeCfgForDir = resolveActiveCfgForDir(options);
    const active = files2.find((f) => f.id === activeId2);
    if (!active) {
      return {
        kind: "standalone",
        cfg: null,
        paths: [],
        activeIndex: -1,
        preludePaths: [],
        scopeKey: "standalone:"
      };
    }
    if (/\.cfg$/i.test(String(active.name))) {
      const paths2 = resolveActiveChain(files2, active.name, getText);
      return {
        kind: "module",
        cfg: active.name,
        paths: paths2,
        activeIndex: -1,
        preludePaths: [],
        scopeKey: `module:${active.name}`
      };
    }
    if (!isSignaturePath(active.name)) {
      return {
        kind: "standalone",
        cfg: null,
        paths: [],
        activeIndex: -1,
        preludePaths: [],
        scopeKey: "standalone:"
      };
    }
    let cfgPath = resolveOwningActiveCfg(files2, active.name, getText, activeCfgsForDir(dirOf(active.name)));
    if (!cfgPath) cfgPath = activeCfgForDir(dirOf(active.name));
    let paths = cfgPath ? resolveActiveChain(files2, cfgPath, getText) : [];
    let activeIndex2 = paths.indexOf(active.name);
    if (activeIndex2 < 0) {
      cfgPath = owningCfgForFile(files2, active.name, getText, cfgPath);
      if (!cfgPath) return standaloneResult(active);
      paths = resolveActiveChain(files2, cfgPath, getText);
      activeIndex2 = paths.indexOf(active.name);
      if (activeIndex2 < 0) return standaloneResult(active);
    }
    return {
      kind: "module",
      cfg: cfgPath,
      paths,
      activeIndex: activeIndex2,
      preludePaths: activeIndex2 > 0 ? paths.slice(0, activeIndex2) : [],
      scopeKey: `module:${cfgPath}`
    };
  }
  function cfgPathForActive(files2, activeId2, getText, options = {}) {
    const dev = developmentForFile(files2, activeId2, getText, options);
    return dev.kind === "module" && dev.cfg ? dev.cfg : null;
  }
  function visibilityPaths(dev) {
    if (!dev || !dev.paths.length) return [];
    const active = dev.paths[dev.activeIndex >= 0 ? dev.activeIndex : dev.paths.length - 1];
    const out = [...dev.preludePaths];
    if (active && out.indexOf(active) === -1) out.push(active);
    return out;
  }
  function workspaceDevelopments(files2, getText) {
    const sigPaths = allSignaturePaths(files2);
    const cfgByDir = cfgByDirFromFiles(files2, getText);
    const allSet = pathSetFrom(sigPaths);
    const developments = [];
    const covered = {};
    for (const cfgPath of topLevelCfgPaths(files2, getText)) {
      const dir = dirOf(cfgPath);
      const base = cfgPath.slice(cfgPath.lastIndexOf("/") + 1);
      const map = cfgByDir[dir];
      if (!map?.[base]) continue;
      const ordered = resolveCfgOrder(dir, map[base], cfgByDir, allSet, /* @__PURE__ */ new Set());
      if (!ordered.length) continue;
      for (const p of ordered) covered[p] = true;
      developments.push({
        kind: "config",
        name: baseNoExt(cfgPath),
        cfg: cfgPath,
        paths: ordered
      });
    }
    for (const p of sigPaths) {
      if (covered[p]) continue;
      developments.push({ kind: "orphan", name: p, cfg: null, paths: [p] });
    }
    return developments;
  }
  function orderedDevelopmentPaths(files2, activeId2, getText, options = {}) {
    return developmentForFile(files2, activeId2, getText, options).paths;
  }
  function preludePathsFor(files2, activeId2, getText, options = {}) {
    return developmentForFile(files2, activeId2, getText, options).preludePaths;
  }
  function listDevelopmentMembers(files2, activeId2, getText, options = {}, liveActiveText = null) {
    const dev = developmentForFile(files2, activeId2, getText, options);
    const byName = new Map(files2.map((f) => [f.name, f]));
    const members = [];
    for (const path of dev.paths) {
      const f = byName.get(path);
      if (!f) continue;
      const text = f.id === activeId2 && liveActiveText != null ? liveActiveText : String(getText(f.id) ?? "");
      members.push({ id: f.id, name: f.name, text });
    }
    if (!members.length) {
      const f = files2.find((x) => x.id === activeId2);
      if (f) {
        members.push({
          id: f.id,
          name: f.name,
          text: String(liveActiveText != null && f.id === activeId2 ? liveActiveText : getText(f.id) ?? "")
        });
      }
    }
    return { members, paths: dev.paths };
  }

  // js/workspace/project-source.mjs
  function concat(files2) {
    const parts = [];
    const spans = [];
    let cursor = 1;
    for (const f of files2) {
      const text = String(f.text != null ? f.text : "");
      const lineCount = text.split("\n").length;
      spans.push({
        id: f.id,
        name: f.name,
        startLine: cursor,
        endLine: cursor + lineCount - 1
      });
      parts.push(text);
      cursor += lineCount + 1;
    }
    return { code: parts.join("\n\n"), spans };
  }
  function mapLine(spans, line) {
    if (!spans || !isFinite(line)) return null;
    for (const s of spans) {
      if (line >= s.startLine && line <= s.endLine) {
        return { id: s.id, name: s.name, line: line - s.startLine + 1 };
      }
    }
    return null;
  }
  function remapLocations(text, spans) {
    if (!text || !spans || !spans.length) return text;
    let out = String(text);
    out = out.replace(
      /File\s+"([^"]*)"\s*,\s*line\s+(\d+)/g,
      (whole, _fname, line) => {
        const hit = mapLine(spans, +line);
        if (!hit) return whole;
        return `File "${hit.name}", line ${hit.line}`;
      }
    );
    out = out.replace(
      /([^\s:"]+)\.bel:(\d+)\.(\d+)(?:-(\d+)\.(\d+))?:/g,
      (whole, _fname, sl, sc, el5, ec) => {
        const start = mapLine(spans, +sl);
        if (!start) return whole;
        let token = `${start.name}:${start.line}.${sc}`;
        if (el5 != null) {
          const end = mapLine(spans, +el5);
          if (!end || end.id !== start.id) return whole;
          token += `-${end.line}.${ec}`;
        }
        return `${token}:`;
      }
    );
    out = out.replace(
      /(^|\n)(\s*)at line\s+(\d+),(\s*characters?\s+\d+(?:-\d+)?)/g,
      (whole, lead, ws, line, rest) => {
        const hit = mapLine(spans, +line);
        if (!hit) return whole;
        return `${lead}${ws}in ${hit.name}, at line ${hit.line},${rest}`;
      }
    );
    return out;
  }
  function pickCfgForDir(cfgByDir, dir, paths, activeName) {
    const map = cfgByDir[dir];
    if (!map) return null;
    const names = Object.keys(map);
    if (!names.length) return null;
    const pathSet = {};
    for (const p of paths) {
      if (dirOf(p) === dir) pathSet[p] = true;
    }
    if (activeName) {
      for (const name of names) {
        const ord = resolveCfgOrder(dir, map[name], cfgByDir, pathSet, /* @__PURE__ */ new Set());
        if (ord.indexOf(activeName) !== -1) return map[name];
      }
    }
    if (names.length === 1) return map[names[0]];
    let best = null;
    let bestCount = -1;
    for (const name of names) {
      const resolved = resolveCfgOrder(dir, map[name], cfgByDir, pathSet, /* @__PURE__ */ new Set());
      if (resolved.length > bestCount) {
        bestCount = resolved.length;
        best = map[name];
      }
    }
    return best;
  }
  function orderSignaturePaths(paths, cfgByDir) {
    cfgByDir = cfgByDir || {};
    const byDir = {};
    for (const p of paths) {
      const d = dirOf(p);
      if (!byDir[d]) byDir[d] = [];
      byDir[d].push(p);
    }
    const out = [];
    for (const dir of Object.keys(byDir).sort()) {
      const inDir = byDir[dir].slice().sort();
      const cfgText = pickCfgForDir(cfgByDir, dir, paths, null);
      if (cfgText) {
        const pathSet = Object.fromEntries(inDir.map((p) => [p, true]));
        const ordered = resolveCfgOrder(dir, cfgText, cfgByDir, pathSet, /* @__PURE__ */ new Set());
        const seen2 = {};
        for (const p of ordered) {
          if (!seen2[p]) {
            seen2[p] = true;
            out.push(p);
          }
        }
        for (const p of inDir) {
          if (!seen2[p]) out.push(p);
        }
      } else {
        out.push(...inDir);
      }
    }
    return out;
  }
  function orderBelPaths(belPaths, cfgByDir) {
    cfgByDir = cfgByDir || {};
    const byDir = {};
    for (const p of belPaths) {
      const d = dirOf(p);
      if (!byDir[d]) byDir[d] = [];
      byDir[d].push(p);
    }
    const out = [];
    for (const dir of Object.keys(byDir).sort()) {
      const files2 = byDir[dir].slice().sort();
      const cfgText = pickCfgForDir(cfgByDir, dir, belPaths, null);
      if (cfgText) {
        const belSet = Object.fromEntries(files2.map((p) => [p, true]));
        const ordered = resolveCfgOrder(dir, cfgText, cfgByDir, belSet, /* @__PURE__ */ new Set());
        const seen2 = Object.fromEntries(ordered.map((p) => [p, true]));
        out.push(...ordered);
        for (const p of files2) {
          if (!seen2[p]) out.push(p);
        }
      } else {
        out.push(...files2);
      }
    }
    return out;
  }
  function developmentFilesFor(files2, activeId2, getText, options) {
    const ordered = orderedDevelopmentPaths(files2, activeId2, getText, options);
    const out = [];
    for (const name of ordered) {
      for (const f of files2) {
        if (f.name === name) {
          out.push(f);
          break;
        }
      }
    }
    return out;
  }
  function orderedPathsForCfg(files2, cfgPath, getText) {
    if (!cfgPath) return [];
    const dir = dirOf(cfgPath);
    const base = cfgPath.slice(cfgPath.lastIndexOf("/") + 1);
    const paths = [];
    for (const f of files2) {
      const fn = String(f.name || "");
      if (dirOf(fn) === dir && isSignaturePath(fn)) paths.push(fn);
    }
    const cfgByDir = cfgByDirFromFiles(files2, getText);
    const map = cfgByDir[dir];
    if (!map || !map[base]) return [];
    const pathSet = Object.fromEntries(paths.map((p) => [p, true]));
    return resolveCfgOrder(dir, map[base], cfgByDir, pathSet, /* @__PURE__ */ new Set());
  }
  function developmentFilesForCfg(files2, cfgPath, getText) {
    const ordered = orderedPathsForCfg(files2, cfgPath, getText);
    const out = [];
    for (const name of ordered) {
      for (const f of files2) {
        if (f.name === name) {
          out.push(f);
          break;
        }
      }
    }
    return out;
  }
  function inferDefaultCfgPath(files2, getText) {
    const cfgFiles = files2.filter((f) => String(f.name || "").toLowerCase().endsWith(".cfg"));
    if (!cfgFiles.length) return null;
    const cfgByDir = cfgByDirFromFiles(files2, getText);
    const sigPaths = allSignaturePaths(files2);
    let best = null;
    let bestCount = -1;
    for (const cfg of cfgFiles) {
      const cfgPath = cfg.name;
      const dir = dirOf(cfgPath);
      const base = cfgPath.slice(cfgPath.lastIndexOf("/") + 1);
      const map = cfgByDir[dir];
      if (!map || !map[base]) continue;
      const pathSet = {};
      for (const p of sigPaths) {
        if (dirOf(p) === dir) pathSet[p] = true;
      }
      const ord = resolveCfgOrder(dir, map[base], cfgByDir, pathSet, /* @__PURE__ */ new Set());
      if (!best || ord.length > bestCount || ord.length === bestCount && cfgPath < best) {
        bestCount = ord.length;
        best = cfgPath;
      }
    }
    return best;
  }
  function preludeFilesFor(files2, activeId2, getText, options) {
    const paths = preludePathsFor(files2, activeId2, getText, options || {});
    if (!paths.length) return [];
    const out = [];
    for (const name of paths) {
      for (const f of files2) {
        if (f.name === name) {
          out.push(f);
          break;
        }
      }
    }
    return out;
  }
  var GLOBAL_FILE_PRAGMA_LINE = /^\s*--(?:nostrengthen|coverage|warncoverage)\s*\.?\s*(?:%.*)?$/i;
  function peelGlobalFilePragmas(fileCode) {
    const text = String(fileCode != null ? fileCode : "");
    const lines = text.split("\n");
    let start = -1;
    if (lines[0] && GLOBAL_FILE_PRAGMA_LINE.test(lines[0])) start = 0;
    else if (lines[0] && lines[0].trim() === "" && lines[1] && GLOBAL_FILE_PRAGMA_LINE.test(lines[1])) start = 1;
    if (start < 0) {
      return { hoisted: "", rest: text, hoistLineCount: 0 };
    }
    const hoisted = [];
    let i = start;
    while (i < lines.length && GLOBAL_FILE_PRAGMA_LINE.test(lines[i])) {
      hoisted.push(lines[i]);
      i += 1;
    }
    while (i < lines.length && lines[i].trim() === "") i += 1;
    const hoistedText = hoisted.join("\n");
    return {
      hoisted: hoistedText,
      rest: lines.slice(i).join("\n"),
      hoistLineCount: hoistedText ? hoistedText.split("\n").length : 0
    };
  }
  function peelGlobalFilePragmasInPlace(fileCode) {
    const text = String(fileCode != null ? fileCode : "");
    const peeled = peelGlobalFilePragmas(text);
    if (!peeled.hoisted) return { hoisted: "", body: text };
    const lines = text.split("\n");
    let blanked = 0;
    for (let i = 0; i < lines.length && blanked < peeled.hoistLineCount; i += 1) {
      if (GLOBAL_FILE_PRAGMA_LINE.test(lines[i])) {
        lines[i] = "";
        blanked += 1;
      }
    }
    return { hoisted: peeled.hoisted, body: lines.join("\n") };
  }
  function joinCheckerParts(parts) {
    return parts.filter((p) => p != null && p !== "").join("\n\n");
  }
  function assembleCheckerCode(fileCode, prelude) {
    if (!prelude) {
      return { code: String(fileCode != null ? fileCode : ""), prelude: null };
    }
    const peeled = peelGlobalFilePragmasInPlace(fileCode);
    if (!peeled.hoisted) {
      return { code: joinCheckerParts([prelude.code, peeled.body]), prelude };
    }
    const hoistOffset = peeled.hoisted.split("\n").length + 1;
    const adjustedPrelude = {
      code: prelude.code,
      spans: prelude.spans.map((s) => ({
        id: s.id,
        name: s.name,
        startLine: s.startLine + hoistOffset,
        endLine: s.endLine + hoistOffset
      })),
      offsetLines: prelude.offsetLines + hoistOffset,
      names: prelude.names
    };
    return {
      code: joinCheckerParts([peeled.hoisted, prelude.code, peeled.body]),
      prelude: adjustedPrelude
    };
  }
  function assembleProjectCode(files2) {
    const hoistedLines = [];
    const stripped = [];
    for (const f of files2) {
      const peeled = peelGlobalFilePragmas(String(f.text != null ? f.text : ""));
      if (peeled.hoisted) {
        for (const line of peeled.hoisted.split("\n")) {
          if (line && hoistedLines.indexOf(line) === -1) hoistedLines.push(line);
        }
      }
      stripped.push({ id: f.id, name: f.name, text: peeled.rest });
    }
    const hoisted = hoistedLines.join("\n");
    const parts = [];
    const spans = [];
    let cursor = hoisted ? hoistedLines.length + 2 : 1;
    for (const s of stripped) {
      const text = String(s.text != null ? s.text : "");
      const lineCount = text.split("\n").length;
      spans.push({
        id: s.id,
        name: s.name,
        startLine: cursor,
        endLine: cursor + lineCount - 1
      });
      parts.push(text);
      cursor += lineCount + 1;
    }
    const body = parts.join("\n\n");
    return {
      code: hoisted ? joinCheckerParts([hoisted, body]) : body,
      spans
    };
  }
  function buildPrelude(files2, activeId2, getText, options) {
    const pre = preludeFilesFor(files2, activeId2, getText, options);
    if (!pre.length) return null;
    const parts = [];
    const spans = [];
    let cursor = 1;
    for (const f of pre) {
      const text = String(getText(f.id) != null ? getText(f.id) : "");
      const lineCount = text.split("\n").length;
      spans.push({ id: f.id, name: f.name, startLine: cursor, endLine: cursor + lineCount - 1 });
      parts.push(text);
      cursor += lineCount + 1;
    }
    const last = spans[spans.length - 1];
    return {
      code: parts.join("\n\n"),
      spans,
      offsetLines: last.endLine + 1
    };
  }
  function preludeFileAt(spans, line) {
    for (const s of spans) {
      if (line >= s.startLine && line <= s.endLine) {
        return { name: s.name, line: line - s.startLine + 1 };
      }
    }
    return null;
  }
  function messageAfter(text, index) {
    const lines = String(text).slice(index, index + 400).split("\n");
    for (const line of lines) {
      const t = line.trim().replace(/^(Error|Warning):\s*/i, "");
      if (t && !/^[-^~\s]+$/.test(t)) return t.slice(0, 160);
    }
    return "";
  }
  function shiftCheckerOutput(text, prelude) {
    if (!text || !prelude) return { text: text || "", preludeIssues: [] };
    const offset = prelude.offsetLines;
    const issues = [];
    const seen2 = /* @__PURE__ */ new Set();
    function noteIssue(hit, src, index) {
      const k = `${hit.name}:${hit.line}`;
      if (seen2.has(k)) return;
      seen2.add(k);
      issues.push({ name: hit.name, line: hit.line, message: messageAfter(src, index) });
    }
    let out = String(text);
    out = out.replace(/File\s+"([^"]*)"\s*,\s*line\s+(\d+)/g, (whole, fname, line, idx, src) => {
      const L = +line;
      if (L > offset) return `File "${fname}", line ${L - offset}`;
      const hit = preludeFileAt(prelude.spans, L);
      if (hit) noteIssue(hit, src, idx + whole.length);
      return `(project prelude ${hit ? hit.name : "?"} line ${hit ? hit.line : L})`;
    });
    out = out.replace(
      /([^\s:"]+)\.bel:(\d+)\.(\d+)(?:-(\d+)\.(\d+))?:/g,
      (whole, fname, sl, sc, el5, ec, idx, src) => {
        const SL = +sl;
        if (SL > offset) {
          const EL = el5 != null ? +el5 - offset : null;
          if (el5 != null && EL < 1) return whole;
          return `${fname}.bel:${SL - offset}.${sc}${el5 != null ? `-${EL}.${ec}` : ""}:`;
        }
        const hit = preludeFileAt(prelude.spans, SL);
        if (hit) noteIssue(hit, src, idx + whole.length);
        return `(project prelude ${hit ? hit.name : "?"} line ${hit ? hit.line : SL})`;
      }
    );
    out = out.replace(
      /(^|\n)(\s*)at line\s+(\d+),(\s*characters?\s+\d+(?:-\d+)?)/g,
      (whole, lead, ws, line, rest, idx, src) => {
        const L = +line;
        if (L > offset) return `${lead}${ws}at line ${L - offset},${rest}`;
        const hit = preludeFileAt(prelude.spans, L);
        if (hit) noteIssue(hit, src, idx + whole.length);
        return `${lead}${ws}(project prelude ${hit ? hit.name : "?"} line ${hit ? hit.line : L})${rest.replace(/^\s*/, " ")}`;
      }
    );
    return { text: out, preludeIssues: issues };
  }
  function scanProjectText(files2, query2, limit) {
    const cap = limit || 60;
    const q = String(query2 || "").toLowerCase();
    if (!q) return [];
    const out = [];
    for (const f of files2) {
      const text = String(f.text != null ? f.text : "");
      const lines = text.split("\n");
      let offset = 0;
      for (let li = 0; li < lines.length; li += 1) {
        const lower = lines[li].toLowerCase();
        let k = lower.indexOf(q);
        while (k !== -1) {
          out.push({
            id: f.id,
            name: f.name,
            line: li + 1,
            col: k + 1,
            lineText: lines[li].trim(),
            from: offset + k,
            to: offset + k + q.length
          });
          if (out.length >= cap) return out;
          k = lower.indexOf(q, k + Math.max(1, q.length));
        }
        offset += lines[li].length + 1;
      }
    }
    return out;
  }
  function reorder(files2, id, delta) {
    const idx = files2.findIndex((f) => f.id === id);
    if (idx === -1) return files2;
    const to = Math.max(0, Math.min(files2.length - 1, idx + (delta || 0)));
    if (to === idx) return files2;
    const next = files2.slice();
    const entry = next.splice(idx, 1)[0];
    next.splice(to, 0, entry);
    return next;
  }
  var ProjectSource2 = {
    concat,
    mapLine,
    remapLocations,
    reorder,
    dirOf,
    joinPath,
    baseNoExt,
    fileBase,
    isExtensionless,
    isCfgPath,
    isElfPath,
    isBelPath,
    isSignaturePath,
    isProjectSourcePath,
    isCfgEntryToken,
    isCfgSourceEntry,
    parseCfg,
    resolveCfgOrder,
    allSignaturePaths,
    orderBelPaths,
    orderSignaturePaths,
    pickCfgForDir,
    cfgByDirFromFiles,
    developmentForFile,
    resolveOwningActiveCfg,
    activeCfgResolver,
    defaultActiveCfgForDir,
    defaultActiveCfgsForDir,
    orderedDevelopmentPaths,
    visibilityPaths,
    listDevelopmentMembers,
    developmentFilesFor,
    orderedPathsForCfg,
    developmentFilesForCfg,
    cfgPathForActive,
    workspaceDevelopments,
    inferDefaultCfgPath,
    inferActiveCfgForDir,
    inferActiveCfgByDir,
    preludePathsFor,
    preludeFilesFor,
    buildPrelude,
    assembleCheckerCode,
    assembleProjectCode,
    peelGlobalFilePragmas,
    shiftCheckerOutput,
    scanProjectText
  };
  var g14 = typeof window !== "undefined" ? window : globalThis;
  g14.ProjectSource = ProjectSource2;
  g14.BelJarProjectSource = g14.ProjectSource;

  // js/workspace/import-project.mjs
  var g15 = typeof window !== "undefined" ? window : globalThis;
  function relPathFromPickerFile(file, opts) {
    const rel = file.webkitRelativePath || file.name;
    const parts = rel.split("/");
    if (opts && opts.stripRoot && parts.length > 1) return parts.slice(1).join("/");
    return rel;
  }
  function projectEntriesFromRawEntries(rawEntries) {
    const belEntries = [];
    const elfEntries = [];
    const cfgEntries = [];
    for (const entry of rawEntries) {
      if (ProjectSource2.isCfgPath(entry.name)) cfgEntries.push(entry);
      else if (ProjectSource2.isElfPath(entry.name)) elfEntries.push(entry);
      else if (ProjectSource2.isBelPath(entry.name)) belEntries.push(entry);
    }
    const belPaths = belEntries.map((e) => e.name);
    const sigPaths = belPaths.concat(elfEntries.map((e) => e.name));
    const cfgByDir = {};
    for (const entry of cfgEntries) {
      const dir = ProjectSource2.dirOf(entry.name);
      const base = entry.name.slice(entry.name.lastIndexOf("/") + 1);
      if (!cfgByDir[dir]) cfgByDir[dir] = {};
      cfgByDir[dir][base] = entry.text;
    }
    const byPath = new Map([...belEntries, ...elfEntries, ...cfgEntries].map((e) => [e.name, e]));
    const orderedSig = typeof ProjectSource2.orderSignaturePaths === "function" ? ProjectSource2.orderSignaturePaths(sigPaths, cfgByDir) : sigPaths.slice().sort();
    const projectEntries = orderedSig.map((p) => byPath.get(p)).filter(Boolean);
    for (const cfg of cfgEntries) projectEntries.push(cfg);
    return { projectEntries, belCount: belPaths.length, sigCount: sigPaths.length };
  }
  async function projectEntriesFromPickerFiles(all, opts) {
    const rawEntries = [];
    for (const file of all) {
      if (!ProjectSource2.isProjectSourcePath(file.name)) continue;
      rawEntries.push({ name: relPathFromPickerFile(file, opts), text: await file.text() });
    }
    return projectEntriesFromRawEntries(rawEntries);
  }
  function activeCfgByDirFor(projectEntries) {
    if (typeof ProjectSource2.inferActiveCfgByDir !== "function") return null;
    const tmpFiles = projectEntries.map((e, i) => ({ id: "tmp-" + i, name: e.name }));
    const tmpText = (id) => (projectEntries[Number(id.slice(4))] || {}).text || "";
    return ProjectSource2.inferActiveCfgByDir(tmpFiles, tmpText);
  }
  async function folderAsProject(all) {
    const { projectEntries, belCount } = await projectEntriesFromPickerFiles(all, { stripRoot: true });
    if (!belCount) return null;
    const first = all[0];
    const name = first && first.webkitRelativePath ? first.webkitRelativePath.split("/")[0] : "Imported";
    const bel = projectEntries.filter((e) => ProjectSource2.isBelPath(e.name));
    return {
      name,
      entries: projectEntries,
      activeCfgByDir: activeCfgByDirFor(projectEntries),
      firstBel: bel.length ? bel[0].name : null
    };
  }
  function createImportedProject(plan) {
    const P = g15.Persist;
    const made = P.createProjectWithFiles(plan.name, plan.entries, {
      projectName: plan.name,
      activeCfgByDir: plan.activeCfgByDir || void 0
    });
    if (!made || !made.projectId) return null;
    const open6 = plan.activePath || plan.firstBel;
    if (open6) {
      const created = P.listFiles().find((f) => f.name === open6);
      if (created) P.setActiveFileId(created.id);
    }
    return made.projectId;
  }
  var ImportProject = {
    relPathFromPickerFile,
    projectEntriesFromRawEntries,
    projectEntriesFromPickerFiles,
    activeCfgByDirFor,
    folderAsProject,
    createImportedProject
  };
  g15.ImportProject = ImportProject;

  // js/commands/command-settings.mjs
  var ROWS = [
    // ── layout ────────────────────────────────────────────────────────────────
    {
      slug: "word-wrap",
      title: "Word wrap",
      aliases: ["wrap"],
      setting: "editorWordWrap"
    },
    {
      slug: "line-numbers",
      title: "Line numbers",
      aliases: ["number", "nu"],
      setting: "editorLineNumbers"
    },
    {
      slug: "line-number-style",
      title: "Line number style",
      labels: { absolute: "Absolute", relative: "Relative", hybrid: "Relative + current" },
      aliases: ["relativenumber", "rnu"],
      setting: "editorLineNumberMode"
    },
    {
      slug: "fold-gutter",
      title: "Code folding",
      aliases: ["foldenable", "fen"],
      setting: "editorFoldGutter"
    },
    {
      slug: "active-line",
      title: "Active line highlight",
      aliases: ["cursorline", "cul"],
      setting: "editorActiveLine"
    },
    {
      slug: "scroll-past-end",
      title: "Scroll past end",
      aliases: ["scrollpastend", "spe"],
      setting: "editorScrollPastEnd"
    },
    {
      slug: "rulers",
      title: "Print-width ruler",
      aliases: ["colorcolumn", "cc"],
      setting: "editorRulers"
    },
    {
      slug: "sticky-decl",
      title: "Structure path",
      aliases: ["sticky"],
      setting: "stickyDeclHeader"
    },
    {
      slug: "tab-size",
      title: "Tab size",
      aliases: ["tabstop", "ts"],
      labels: { 2: "2 spaces", 4: "4 spaces" },
      setting: "editorTabSize"
    },
    {
      slug: "format-width",
      title: "Format print width",
      aliases: ["textwidth", "tw"],
      labels: { 80: "80 columns", 100: "100 columns", 120: "120 columns" },
      setting: "editorFormatWidth"
    },
    {
      slug: "whitespace",
      title: "Show whitespace",
      verb: "whitespace marks",
      on: "all",
      off: "none",
      aliases: ["list"],
      labels: { none: "Off", trailing: "Trailing only", selection: "In selection", all: "All" },
      setting: "editorWhitespace"
    },
    // ── type ──────────────────────────────────────────────────────────────────
    {
      slug: "font-size",
      title: "Font size",
      labels: { sm: "Small", md: "Default", lg: "Large", xl: "Larger" },
      setting: "editorFontSize"
    },
    {
      slug: "line-height",
      title: "Line height",
      labels: { compact: "Compact", normal: "Default", relaxed: "Relaxed" },
      setting: "editorLineHeight"
    },
    {
      slug: "font-family",
      title: "Editor font",
      labels: { jetbrains: "JetBrains Mono", system: "System monospace" },
      setting: "editorFontFamily"
    },
    {
      slug: "cursor-blink",
      title: "Cursor blink",
      labels: { off: "Solid", blink: "Blink", fast: "Fast" },
      setting: "editorCursorBlink"
    },
    // ── highlighting ──────────────────────────────────────────────────────────
    {
      slug: "syntax-highlight",
      title: "Syntax highlighting",
      aliases: ["syntax"],
      setting: "editorSyntaxHighlight"
    },
    {
      slug: "semantic-highlight",
      title: "Semantic highlighting",
      setting: "editorSemanticHighlight"
    },
    {
      slug: "parse-highlight",
      title: "Invalid parse styling",
      setting: "editorParseHighlight"
    },
    {
      slug: "occurrence-highlight",
      title: "Occurrence highlight",
      setting: "editorOccurrenceHighlight"
    },
    {
      slug: "selection-matches",
      title: "Selection matches",
      aliases: ["hlsearch", "hls"],
      setting: "editorSelectionMatches"
    },
    {
      slug: "bracket-match",
      title: "Bracket matching",
      aliases: ["showmatch", "sm"],
      setting: "editorBracketMatch"
    },
    // ── editing behaviour ─────────────────────────────────────────────────────
    {
      slug: "auto-close-brackets",
      title: "Auto-close brackets",
      aliases: ["autoclose"],
      setting: "editorAutoCloseBrackets"
    },
    {
      slug: "reindent-paste",
      title: "Re-indent on paste",
      setting: "editorReindentPaste"
    },
    {
      slug: "format-on-save",
      title: "Format on save",
      setting: "formatOnSave"
    },
    {
      slug: "trim-whitespace",
      title: "Trim trailing whitespace on save",
      setting: "trimTrailingWs"
    },
    // ── proof surface ─────────────────────────────────────────────────────────
    {
      slug: "hole-gutter",
      title: "Hole gutter marks",
      setting: "editorHoleGutter"
    },
    {
      slug: "hole-emphasis",
      title: "Hole gutter emphasis",
      labels: { subtle: "Subtle", normal: "Default", loud: "Loud" },
      setting: "editorHoleEmphasis"
    },
    {
      slug: "quiet-typing",
      title: "Quiet while typing",
      aliases: ["quiet"],
      setting: "quietWhileTyping"
    },
    {
      slug: "hover-sticky",
      title: "Sticky hover",
      setting: "hoverSticky"
    },
    // ── the two pages ─────────────────────────────────────────────────────────
    {
      slug: "start-page",
      title: "Start page",
      pages: "both",
      labels: { home: "Home", last: "Last project" },
      setting: "startPage"
    },
    // ── the account (Settings > Account; the labels are that panel's) ─────────
    {
      slug: "sync-settings",
      title: "Sync settings",
      verb: "settings sync",
      pages: "both",
      needs: "server",
      setting: "syncSettings"
    },
    {
      slug: "sync-both-changed",
      title: "Changed in two places",
      verb: "files changed in two places",
      pages: "both",
      needs: "server",
      labels: { merge: "Merge them", ask: "Ask me" },
      setting: "syncBothChanged"
    },
    {
      slug: "sync-overlap",
      title: "Where edits overlap",
      pages: "both",
      needs: "server",
      labels: { ask: "Ask me", mine: "Keep mine", cloud: "Keep the cloud\u2019s" },
      setting: "syncOverlap"
    },
    {
      slug: "sync-reconnect",
      title: "Back online",
      verb: "edits made offline",
      pages: "both",
      needs: "server",
      labels: { upload: "Upload them", ask: "Ask me first" },
      setting: "syncReconnect"
    },
    {
      slug: "sync-notices",
      title: "Say when you go offline",
      verb: "offline notices",
      pages: "both",
      needs: "server",
      setting: "syncNotices"
    },
    {
      slug: "sign-out-keep",
      title: "Projects in this browser",
      verb: "projects kept on sign-out",
      pages: "both",
      needs: "server",
      labels: { remove: "Remove them", keep: "Keep them" },
      setting: "signOutKeep"
    }
  ];
  function serverAnswers() {
    const A = globalThis.Account;
    return !!(A && typeof A.available === "function" && A.available());
  }
  function offered(s) {
    return s.needs !== "server" || serverAnswers();
  }
  var SETTINGS2 = ROWS.map((r) => {
    const row = settingRow(r.setting);
    if (!row) throw new Error(`command-settings: "${r.slug}" names no setting "${r.setting}"`);
    return typeOf(row) === "bool" ? { ...r, kind: "bool" } : { ...r, kind: "enum", values: row.values };
  });
  function lowerFirst(text) {
    const t = String(text || "");
    return t.charAt(0).toLowerCase() + t.slice(1);
  }
  function settingId(slug) {
    return "set." + slug;
  }
  function settingEntries() {
    return SETTINGS2.map((s) => ({
      id: settingId(s.slug),
      title: (s.kind === "bool" ? "Toggle " : "Cycle ") + lowerFirst(s.verb || s.title),
      section: "Settings",
      scope: "global",
      keybindable: true,
      palette: true,
      pages: s.pages || "editor"
    }));
  }
  function optionNames() {
    const out = [];
    for (const s of SETTINGS2.filter(offered)) {
      out.push(s.slug);
      for (const a of s.aliases || []) out.push(a);
    }
    return out;
  }
  function optionCandidates() {
    const out = [];
    for (const s of SETTINGS2.filter(offered)) {
      out.push({ value: s.slug, label: s.title });
      for (const a of s.aliases || []) out.push({ value: a, label: s.title });
    }
    for (const s of SETTINGS2.filter(offered)) {
      if (s.kind !== "bool" && s.off === void 0) continue;
      out.push({ value: "no" + s.slug, label: s.title + " (off)" });
      for (const a of s.aliases || []) out.push({ value: "no" + a, label: s.title + " (off)" });
    }
    return out;
  }
  function findSetting(name) {
    const key = String(name == null ? "" : name).toLowerCase();
    if (!key) return null;
    const bare = key.startsWith("set.") ? key.slice(4) : key;
    const here = SETTINGS2.filter(offered);
    return here.find((s) => s.slug === bare) || here.find((s) => (s.aliases || []).indexOf(bare) >= 0) || null;
  }
  function nextValue(spec, current, requested) {
    if (!spec) return null;
    if (spec.kind === "bool") {
      if (requested === true || requested === false) return requested;
      if (requested == null || requested === "") return !current;
      const word = String(requested).toLowerCase();
      if (["on", "true", "yes", "1"].indexOf(word) >= 0) return true;
      if (["off", "false", "no", "0"].indexOf(word) >= 0) return false;
      return null;
    }
    const values = spec.values || [];
    if (requested === true) return spec.on === void 0 ? null : spec.on;
    if (requested === false) return spec.off === void 0 ? null : spec.off;
    if (requested != null && requested !== "") {
      const wanted = values.find((v) => String(v) === String(requested));
      return wanted === void 0 ? null : wanted;
    }
    const at = values.findIndex((v) => String(v) === String(current));
    return values[(at + 1) % values.length];
  }
  function nearestSetting(name) {
    const lower = String(name || "").toLowerCase();
    if (!lower) return null;
    let best = null;
    let bestLen = 0;
    for (const n of optionNames()) {
      let i = 0;
      while (i < n.length && i < lower.length && n[i] === lower[i]) i += 1;
      if (i > bestLen || i === bestLen && best && n.length > best.length) {
        best = n;
        bestLen = i;
      }
    }
    return bestLen >= 2 ? best : null;
  }
  function parseSet(raw) {
    const text = String(raw == null ? "" : raw).trim();
    if (!text) return { error: "usage" };
    const eq = text.indexOf("=");
    const value = eq >= 0 ? text.slice(eq + 1).trim() : null;
    const typed2 = (eq >= 0 ? text.slice(0, eq) : text).trim();
    let name = typed2.toLowerCase();
    let toggle3 = false;
    if (name.endsWith("!")) {
      name = name.slice(0, -1);
      toggle3 = true;
    }
    let negated = false;
    if (!findSetting(name) && name.startsWith("no") && findSetting(name.slice(2))) {
      name = name.slice(2);
      negated = true;
    }
    const spec = findSetting(name);
    if (!spec) {
      return { error: "unknown", name, near: nearestSetting(name), typed: typed2, value, negated, toggle: toggle3 };
    }
    if (value != null && value !== "" && spec.kind === "enum" && !(spec.values || []).some((v) => String(v) === String(value))) {
      return { error: "value", name, spec, value };
    }
    if (negated && spec.kind === "enum" && spec.off === void 0) {
      return { error: "not-boolean", name, spec };
    }
    let requested;
    if (value != null && value !== "") requested = value;
    else if (negated) requested = false;
    else if (toggle3) requested = void 0;
    else if (spec.kind === "bool" || spec.on !== void 0) requested = true;
    else requested = void 0;
    return { spec, requested };
  }
  function describeChange(spec, value) {
    if (value === true) return spec.title + " on";
    if (value === false) return spec.title + " off";
    const labels = spec.labels || {};
    return spec.title + ": " + (labels[value] != null ? labels[value] : String(value));
  }
  function applyValue(settings2, spec, requested) {
    if (!settings2 || typeof settings2.get !== "function" || !spec) {
      return { ok: false, message: "Settings are not ready yet." };
    }
    const value = nextValue(spec, settings2.get(spec.setting), requested);
    if (value === null) return { ok: false, message: `${spec.title}: no such value.` };
    if (!settings2.set(spec.setting, value)) return { ok: false, message: `${spec.title} could not be saved.` };
    return { ok: true, applied: true, spec, value, message: describeChange(spec, value) };
  }

  // js/commands/command-catalog.mjs
  var ROWS2 = [
    // ── File ───────────────────────────────────────────────────────────────────
    { id: "project.new", title: "New Project\u2026", section: "File", scope: "global", palette: true },
    { id: "file.new", title: "New File\u2026", section: "File", scope: "global", palette: true },
    { id: "file.upload", title: "Upload File", section: "File", scope: "global", palette: true },
    { id: "file.upload-folder", title: "Upload Folder", section: "File", scope: "global", palette: true },
    { id: "file.import-folder", title: "Import Folder as New Project", section: "File", scope: "global", palette: true },
    { id: "file.download", title: "Download Current File", section: "File", scope: "global", palette: true },
    // The whole project as a zip: how work outlives a browser that clears its storage.
    { id: "project.download", title: "Download Project", section: "File", scope: "global", palette: true },
    // Every version the cloud keeps, and Restore (js/ui/version-history.mjs): signed in only.
    { id: "project.history", title: "Version History", section: "File", scope: "global", palette: true },
    { id: "tab.next", title: "Next Tab", section: "File", scope: "global", palette: true, keybindable: true, ex: ["bn"] },
    { id: "tab.prev", title: "Previous Tab", section: "File", scope: "global", palette: true, keybindable: true, ex: ["bp"] },
    { id: "tab.close", title: "Close Tab", section: "File", scope: "global", palette: true, keybindable: true },
    { id: "tab.close-others", title: "Close Other Tabs", section: "File", scope: "global", palette: true, keybindable: true },
    { id: "tab.close-right", title: "Close Tabs to the Right", section: "File", scope: "global", palette: true, keybindable: true },
    // `:w`. BelJar autosaves, so this is "commit it NOW" — including the
    // format-on-save and trim-trailing-whitespace transforms, which otherwise
    // wait for the debounce. `:wa` is the same act: there is one live buffer, so
    // a separate save-all would be a second name for one thing.
    {
      id: "file.save",
      title: "Save Now",
      section: "File",
      scope: "global",
      palette: true,
      keybindable: true,
      ex: ["w", "write", "wa", "wall"],
      styles: { vim: "always" }
    },
    // `:e util.bel` — open a project file by name, with completion. Opening one
    // that is already open just focuses its tab, which is what `:b` would do.
    {
      id: "file.open",
      title: "Open File",
      section: "File",
      scope: "global",
      palette: false,
      keybindable: false,
      ex: ["e", "edit"],
      args: [{ kind: "file", label: "file" }]
    },
    // Suite membership for the current file. Gated on the file's directory having
    // exactly ONE active suite: with two, the answer is a question, and a command
    // that guesses would be rewriting a .cfg on the user's behalf.
    {
      id: "suite.add-file",
      title: "Add to Suite",
      section: "File",
      scope: "global",
      palette: true,
      keybindable: true
    },
    {
      id: "suite.remove-file",
      title: "Remove from Suite",
      section: "File",
      scope: "global",
      palette: true,
      keybindable: true
    },
    // ── Edit ───────────────────────────────────────────────────────────────────
    {
      id: "edit.undo",
      title: "Undo",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+Z",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only" }
    },
    {
      id: "edit.redo",
      title: "Redo",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+Y",
      macDefaultSpec: "Mod+Shift+Z",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    // Cut/Copy/Paste run through the browser's own clipboard (`document.execCommand`
    // in editor-commands.mjs — the same mechanism the context menu and the Edit
    // menu already used ad hoc, now centralised behind one id each).
    //
    // ⛔ BOTH styles take all three chords, and neither policy may be softer than
    // that. This shipped as `vim: 'always'` on the strength of a remembered claim
    // that "neither this vim package nor real vim binds Ctrl+X/Ctrl+V"; the
    // package's own keymap says otherwise on every line — `<C-x>` is
    // incrementNumberToken (it DECREMENTS THE NUMBER under the caret), `<C-v>` is
    // blockwise visual mode, and `<C-c>` is `<Esc>`. Vim runs at `Prec.highest` and
    // preventDefaults what it matched, so the chord never reached these commands:
    // the sheet offered Cut on Ctrl+X, Available Keys printed it as pressable,
    // and pressing it edited the document instead. Insert-only is the truth — vim
    // matches only `context: 'insert'` commands there, so all three fall through.
    //
    // Emacs: `C-x` and `C-c` are prefixes and `C-v` is scroll-up-command, so the
    // chords are gone outright. Emacs' own kill-ring — `C-w`/`M-w`/`C-y`, already
    // live and already listed in Available Keys — is what fires instead.
    {
      id: "edit.cut",
      title: "Cut",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+X",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    {
      id: "edit.copy",
      title: "Copy",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+C",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    {
      id: "edit.paste",
      title: "Paste",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+V",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    {
      id: "edit.find",
      title: "Find\u2026",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+F",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    {
      id: "edit.search-project",
      title: "Search in Project\u2026",
      section: "Edit",
      scope: "global",
      defaultSpec: "Mod+Shift+F",
      keybindable: true,
      palette: true
    },
    {
      id: "edit.toggle-comment",
      title: "Toggle Line Comment",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+/",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    // ⛔ `emacs: 'off'`, and it is not a preference. `Alt+Shift+F` is `S-M-f` to
    // the Emacs handler, which binds it to forward-word-selecting off the package's
    // own key table — at `Prec.highest`, so Format Document never ran under Emacs
    // and every surface went on offering the chord. `C-c q` is the substitute, in
    // the one place an Emacs user would look for it: `M-q` is fill-paragraph.
    {
      id: "edit.format",
      title: "Format Document",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Alt+Shift+F",
      keybindable: true,
      palette: true,
      ex: ["fmt", "format"],
      styles: { vim: "always", emacs: "off" }
    },
    {
      id: "edit.rename",
      title: "Rename Symbol",
      section: "Edit",
      scope: "editor",
      defaultSpec: "F2",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "edit.select-all",
      title: "Select All",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Mod+A",
      keybindable: true,
      palette: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    {
      // Chord-only: "show me completions" is meaningless from a palette you had
      // to open with the keyboard anyway.
      id: "edit.autocomplete",
      title: "Show Autocomplete",
      section: "Edit",
      scope: "editor",
      defaultSpec: "Control+Space",
      keybindable: true,
      styles: { vim: "insert-only", emacs: "off" }
    },
    { id: "edit.delete-line", title: "Delete Line", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.move-line-up", title: "Move Line Up", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.move-line-down", title: "Move Line Down", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.duplicate-line", title: "Duplicate Line", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.duplicate-line-up", title: "Duplicate Line Up", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.indent", title: "Indent", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.dedent", title: "Dedent", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.reindent", title: "Reindent Selection", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.transpose-chars", title: "Transpose Characters", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.split-line", title: "Split Line", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.blank-line", title: "Insert Blank Line", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    { id: "edit.trim-whitespace", title: "Trim Trailing Whitespace", section: "Edit", scope: "editor", keybindable: true, palette: true, styles: { vim: "insert-only" } },
    // ── Motion ─────────────────────────────────────────────────────────────────
    // Bindable, but in NEITHER the palette nor the command line: nobody searches
    // a command list for "move left", and `:motion-char-left` is not a thing
    // anyone types. They exist so "bind anything" is true — `cmdline: false` is what
    // keeps 31 of them out of the line's completion.
    //
    // ⛔ This is the only section that turns the flag off, and the reason it
    // exists. Anything else added here must earn the same argument.
    { id: "motion.char-left", title: "Move Left", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.char-right", title: "Move Right", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.word-left", title: "Move Word Left", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.word-right", title: "Move Word Right", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.line-up", title: "Move Up", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.line-down", title: "Move Down", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.line-start", title: "Move to Line Start", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.line-end", title: "Move to Line End", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.doc-start", title: "Move to Start of File", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.doc-end", title: "Move to End of File", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.page-up", title: "Move Page Up", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.page-down", title: "Move Page Down", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.match-bracket", title: "Move to Matching Bracket", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.syntax-left", title: "Move by Syntax Left", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "motion.syntax-right", title: "Move by Syntax Right", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.char-left", title: "Select Left", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.char-right", title: "Select Right", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.word-left", title: "Select Word Left", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.word-right", title: "Select Word Right", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.line-up", title: "Select Up", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.line-down", title: "Select Down", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.line-start", title: "Select to Line Start", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.line-end", title: "Select to Line End", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.doc-start", title: "Select to Start of File", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.doc-end", title: "Select to End of File", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.page-up", title: "Select Page Up", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.page-down", title: "Select Page Down", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.match-bracket", title: "Select to Matching Bracket", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.line", title: "Select Line", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.parent-syntax", title: "Select Enclosing Syntax", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    { id: "select.collapse", title: "Collapse Selection", section: "Motion", scope: "editor", keybindable: true, cmdline: false, styles: { vim: "insert-only" } },
    /**
     * Keyboard macros — record what you type, replay it.
     *
     * ⛔ Editor scope and NO default chord. There is no cross-editor convention
     * for a non-modal keyboard macro (Emacs has `C-x (`, Vim has `q`, and both
     * reach these ids through their own style map), and inventing one is how a
     * keymap ends up fighting the user's. Bindable, so Standard users can pick.
     *
     * ⛔ `emacs: 'off'` is NOT "unavailable": Emacs reaches both through `C-x (`
     * / `C-x )` / `C-x e`, which is why they carry `STYLE_CHORDS` substitutes.
     * The declaration is about the CHORD, and Emacs owns every chord these could
     * ship on.
     */
    {
      id: "macro.record",
      title: "Record Macro",
      section: "Edit",
      scope: "editor",
      palette: true,
      keybindable: true,
      ex: ["macrorec"]
    },
    {
      id: "macro.replay",
      title: "Replay Macro",
      section: "Edit",
      scope: "editor",
      palette: true,
      keybindable: true,
      ex: ["macroplay"]
    },
    // ── Navigate ───────────────────────────────────────────────────────────────
    {
      id: "nav.symbol",
      title: "Go to Symbol\u2026",
      section: "Navigate",
      scope: "global",
      defaultSpec: "Mod+Shift+O",
      keybindable: true,
      palette: true,
      ex: ["sym"]
    },
    {
      id: "nav.anywhere",
      title: "Go to File\u2026",
      section: "Navigate",
      scope: "global",
      defaultSpec: "Mod+K",
      keybindable: true,
      styles: { emacs: "yield" }
    },
    /**
     * ⛔ `Mod+G` is not invented — it is goto-line in VS Code, Sublime, Atom,
     * Notepad++ and every IDE that has the feature, and the vim package binds no
     * `<C-g>` at all. Emacs DOES (`keyboard-quit`), so it is `off` there and
     * reaches the same command through `M-g g`, which is Emacs' own spelling.
     *
     * Until this existed the feature had no command: Vim had `:42` and `G`, the
     * palette had its `:` mode, and Emacs had `M-g` bound by the package to a
     * command the package does not ship — a dead key on the chord an Emacs user
     * presses to go to a line.
     */
    {
      id: "nav.goto-line",
      title: "Go to Line\u2026",
      section: "Navigate",
      scope: "global",
      defaultSpec: "Mod+G",
      keybindable: true,
      palette: true,
      ex: ["line"],
      styles: { emacs: "off" }
    },
    {
      id: "nav.definition",
      title: "Go to Definition",
      section: "Navigate",
      scope: "editor",
      defaultSpec: "F12",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.references",
      title: "Find References",
      section: "Navigate",
      scope: "editor",
      defaultSpec: "Shift+F12",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.enclosing-decl",
      title: "Go to Enclosing Declaration",
      section: "Navigate",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.binder",
      title: "Go to Binder",
      section: "Navigate",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.inspector",
      title: "Reveal in Inspector",
      section: "Navigate",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    // Structure motions: a Beluga file is declarations containing case branches,
    // so `]d` and `]c` are the two that matter.
    { id: "nav.next-decl", title: "Go to Next Declaration", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    { id: "nav.prev-decl", title: "Go to Previous Declaration", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    { id: "nav.next-case", title: "Go to Next Case Branch", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    { id: "nav.prev-case", title: "Go to Previous Case Branch", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    // A proof with a hole or an error; the status strip's progress segment.
    { id: "nav.next-unfinished", title: "Go to Next Unfinished Proof", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    { id: "nav.prev-unfinished", title: "Go to Previous Unfinished Proof", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    // The jump list. Everything above jumps; these are the way back.
    { id: "nav.jump-back", title: "Jump Back", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    { id: "nav.jump-forward", title: "Jump Forward", section: "Navigate", scope: "editor", keybindable: true, palette: true, styles: { vim: "always" } },
    {
      id: "nav.next-hole",
      title: "Go to Next Hole",
      section: "Navigate",
      scope: "editor",
      defaultSpec: "F8",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.prev-hole",
      title: "Go to Previous Hole",
      section: "Navigate",
      scope: "editor",
      defaultSpec: "Shift+F8",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.next-problem",
      title: "Go to Next Problem",
      section: "Navigate",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "nav.prev-problem",
      title: "Go to Previous Problem",
      section: "Navigate",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    // ── Prover ─────────────────────────────────────────────────────────────────
    // Everything here is gated on the caret standing in a hole, so the palette
    // stays quiet unless there is actually a goal under the cursor.
    {
      id: "prover.hole-intro",
      title: "Intro at Hole",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "prover.hole-split",
      title: "Split at Hole",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "prover.hole-fill",
      title: "Fill Hole",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "prover.open-in-harpoon",
      title: "Open Hole in Harpoon",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      ex: ["harpoon"],
      styles: { vim: "always" }
    },
    // Case completion (docs/case-completion.md). The missing cases of a proof are filled
    // in the background and drawn as faint arms; these act on the one whose ghost hangs
    // from the caret's line, else on every one of the proof under the caret. Gated on
    // there being something to act on, so the palette stays quiet otherwise.
    {
      id: "prover.case-accept",
      title: "Accept Filled Case",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "prover.case-fill",
      title: "Fill This Case",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "prover.case-dismiss",
      title: "Dismiss Filled Case",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    // Reading the proof state, from the editor. Not gated on standing IN a hole:
    // "how many are left" is a question you ask from anywhere in the file.
    {
      id: "prover.count-holes",
      title: "Count Holes",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      ex: ["holes"],
      styles: { vim: "always" }
    },
    {
      id: "prover.goal-at-cursor",
      title: "Show Goal at Cursor",
      section: "Prover",
      scope: "editor",
      keybindable: true,
      palette: true,
      ex: ["goal"],
      styles: { vim: "always" }
    },
    // Driving the Harpoon lab itself. `when()` resolves the session the user is
    // looking at (`Harpoon.activeSession`), so with no lab open these vanish from
    // the palette rather than reporting a failure.
    {
      id: "harpoon.next-goal",
      title: "Next Goal",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "harpoon.prev-goal",
      title: "Previous Goal",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "harpoon.undo-move",
      title: "Undo Proof Move",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "harpoon.redo-move",
      title: "Redo Proof Move",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "harpoon.orca-start",
      title: "Run Orca",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      ex: ["orca"],
      styles: { vim: "always" }
    },
    {
      id: "harpoon.orca-pause",
      title: "Pause Orca",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    {
      id: "harpoon.orca-absorb",
      title: "Take Over from Orca",
      section: "Prover",
      scope: "global",
      keybindable: true,
      palette: true,
      styles: { vim: "always" }
    },
    // ── Run ────────────────────────────────────────────────────────────────────
    // What the Run button does: a suite member runs the suite up to and including
    // itself; an isolated file runs alone. The status segment uses this so it can
    // never be a weaker Run than the button beside it.
    { id: "run.default", title: "Run", section: "Run", scope: "global", palette: true, keybindable: true },
    { id: "run.file", title: "Run File", section: "Run", scope: "global", palette: true, keybindable: true, ex: ["run"] },
    { id: "run.here", title: "Run Suite to Here", section: "Run", scope: "global", palette: true, keybindable: true },
    { id: "run.module", title: "Run Suite", section: "Run", scope: "global", palette: true, keybindable: true, ex: ["runs"] },
    { id: "run.project", title: "Run Project", section: "Run", scope: "global", palette: true, keybindable: true, ex: ["runp"] },
    { id: "run.stop", title: "Stop Run", section: "Run", scope: "global", palette: true, keybindable: true },
    { id: "run.clear-output", title: "Clear Output", section: "Run", scope: "global", palette: true, keybindable: true },
    // ── View ───────────────────────────────────────────────────────────────────
    { id: "view.theme", title: "Toggle Theme", section: "View", scope: "global", palette: true, keybindable: true },
    { id: "view.explorer", title: "Toggle Explorer", section: "View", scope: "global", palette: true, keybindable: true },
    { id: "view.reveal-file", title: "Reveal in Explorer", section: "View", scope: "global", palette: true, keybindable: true },
    { id: "view.library", title: "Toggle Library", section: "View", scope: "global", palette: true, keybindable: true },
    { id: "view.harpoon", title: "Toggle Harpoon", section: "View", scope: "global", palette: true, keybindable: true },
    // The `⟲` widget in the status strip is the same panel; a surface you can only
    // reach by clicking is one the palette and the `:` line cannot offer.
    { id: "view.edit-history", title: "Toggle Edit History", section: "View", scope: "global", palette: true, keybindable: true, ex: ["undolist"] },
    { id: "view.settings", title: "Open Settings\u2026", section: "View", scope: "global", palette: true, keybindable: true },
    { id: "fold.all", title: "Fold All", section: "View", scope: "editor", palette: true, keybindable: true },
    { id: "fold.unfold-all", title: "Unfold All", section: "View", scope: "editor", palette: true, keybindable: true },
    // ── Settings ───────────────────────────────────────────────────────────────
    // Generated from `command-settings.mjs`: one declaration behind the palette
    // row, the bindable chord and Vim's `:set`.
    ...settingEntries(),
    // The line's way in. Not in the palette: without an argument it does nothing,
    // and each preference already has its own palette row above.
    {
      id: "settings.set",
      title: "Set Option",
      section: "Settings",
      scope: "global",
      palette: false,
      keybindable: false,
      ex: ["set", "se"],
      args: [{ kind: "option", label: "option" }]
    },
    // ── Account ────────────────────────────────────────────────────────────────
    // The avatar's and the cloud's actions, by name (js/account/). Each is
    // available only where it works: no server, no sign-in; signed out, no sync.
    { id: "account.sign-in", title: "Sign In with GitHub", section: "Account", scope: "global", palette: true, keybindable: true },
    { id: "account.sign-out", title: "Sign Out", section: "Account", scope: "global", palette: true, keybindable: true },
    { id: "sync.now", title: "Sync Now", section: "Account", scope: "global", palette: true, keybindable: true },
    { id: "sync.review", title: "Review Differences", section: "Account", scope: "global", palette: true, keybindable: true },
    { id: "sync.review-offline", title: "Review Changes Made Offline", section: "Account", scope: "global", palette: true, keybindable: true },
    // ── Tools ──────────────────────────────────────────────────────────────────
    // Not keybindable: `nav.anywhere` owns Mod+K. The literal `shortcut` is the
    // palette's own display fallback for an entry with no chord of its own.
    // Fullscreen + `navigator.keyboard.lock()`. Measured by hand: under lock the
    // ten reserved chords reach the page AND their browser actions do not fire.
    { id: "keys.full-keyboard", title: "Toggle Full Keyboard", section: "Tools", scope: "global", palette: true, keybindable: true, ex: ["fullkeys"] },
    // Generated from `describe()`, so it is the keymap rather than a copy of it.
    // `keys.show-chords` from the original Wave G list folded in here: one sheet
    // that answers "what can I press" beats two that answer half each.
    // ⛔ The ID stays `keys.macros` while the NAME changes. Ids are the stable
    // contract — a user's stored keybindings are keyed by them, and renaming one
    // orphans their chord silently. `:macros` stays an alias for the same reason.
    //
    // The name had to change: "macro" already means a recorded keystroke sequence
    // in both Vim (`q`/`@`) and Emacs (`C-x (`), and Vim's works here — the strip
    // prints `recording @a` while you record one. A window listing pressable KEYS
    // cannot also be called that.
    {
      id: "keys.macros",
      title: "Available Keys\u2026",
      section: "Tools",
      scope: "global",
      palette: true,
      keybindable: true,
      ex: ["keys", "help", "macros"]
    },
    /**
     * Reload the page.
     *
     * ⛔ A real command, because it is a real thing people do — and because
     * everything BelJar can do must be reachable BY NAME. It was reachable only by
     * the browser's own chord, which means it existed for the mouse and for F5 and
     * for nobody typing `:`.
     *
     * ⛔ NO DEFAULT CHORD — and NOT because the browser has `Ctrl+R`. It does not:
     * the hand audit (`scripts/chord-audit.html`, every Ctrl+letter, Chrome 152 /
     * Windows 11) measured it ARRIVING, which is why it is absent from
     * `BROWSER_RESERVED_PC`. Emacs proves the point by taking it — `C-r` is bound
     * to reverse-search there.
     *
     * The real reason is that it is spoken for in two of the three styles, by the
     * ⛔ rule that a style policy is a claim about the PACKAGE'S keymap:
     *   vim    `<C-r>` is REDO, in the package's own table.
     *   emacs  `C-r` is reverse-search, re-pointed at BelJar's search line.
     * So a default could only be Standard-only — a chord that shadows the
     * browser's own reload to do what the browser's own reload already does,
     * since `beforeunload` flushes on that path too. Bindable if someone wants
     * it; not worth a default.
     *
     * The work is safe: `beforeunload`, `pagehide` and `visibilitychange` all
     * flush every buffer to storage, so a reload loses nothing.
     */
    { id: "app.reload", title: "Reload BelJar", section: "Tools", scope: "global", palette: true, keybindable: true, ex: ["reload", "refresh"] },
    // Home: your projects and the account (index.html). The brand in the header
    // is the same link; this is its name, for the palette and the command line.
    { id: "app.home", title: "Go Home", section: "Tools", scope: "global", palette: true, keybindable: true, ex: ["home"] },
    { id: "app.report-issue", title: "Report an Issue", section: "Tools", scope: "global", palette: true, keybindable: true },
    { id: "cmdline.repeat", title: "Repeat Last Command", section: "Tools", scope: "global", palette: true, keybindable: true },
    { id: "cmdline.open", title: "Command Line", section: "Tools", scope: "global", palette: true, keybindable: true },
    { id: "tools.palette", title: "Open Command Palette", section: "Tools", scope: "global", palette: true, shortcut: "Mod+K" },
    { id: "tools.graph", title: "Open Dependency Graph", section: "Tools", scope: "global", palette: true, keybindable: true, ex: ["graph"] },
    { id: "tools.inspector", title: "Open Inspector", section: "Tools", scope: "global", palette: true, keybindable: true },
    {
      id: "tools.commands",
      title: "Run Command\u2026",
      section: "Tools",
      scope: "global",
      // ⛔ NOT `Mod+Shift+P`. That was the shipped chord until `scripts/chord-audit.html`
      // measured Chrome on Windows taking it before the page ever sees it — a
      // default that simply did nothing for half our users. `Alt+X` was measured
      // arriving, and it reads as "execute a command" to anyone who has met M-x.
      defaultSpec: "Alt+X",
      // ⚠ Alt is Option on a Mac and composes characters — Option+X types "≈", so
      // the Windows chord cannot carry over. Cmd+Shift+P is free there (Chrome's
      // incognito chord is Cmd+Shift+N) and is what every editor uses anyway.
      macDefaultSpec: "Mod+Shift+P",
      keybindable: true,
      // …which is exactly what Emacs binds it to, so Emacs' own M-x wins there.
      styles: { emacs: "off" }
    }
  ];
  var HOME_TOO = [
    "project.new",
    "file.import-folder",
    "nav.anywhere",
    "view.theme",
    "account.sign-in",
    "account.sign-out",
    "sync.now",
    "sync.review",
    "sync.review-offline",
    "app.reload",
    "app.report-issue",
    "tools.palette",
    "tools.commands"
  ];
  var CATALOG = ROWS2.map((row) => Object.assign({ pages: HOME_TOO.includes(row.id) ? "both" : "editor" }, row));

  // js/commands/command-shadows.mjs
  var STYLE_TAKES = {
    emacs: [
      { spec: "Mod+F", key: "C-f", runs: "forward-char" },
      // ⛔ Emacs binds `C-z` to undo and `ensureEmacsUndoBridge` re-binds that same
      // spec to BelJar's history — so Ctrl+Z under Emacs IS Undo, reached through
      // Emacs' own key. `sameCommand`, like `M-x`, because nothing is lost.
      { spec: "Mod+Z", key: "C-z", runs: "undo", sameCommand: "edit.undo" },
      // ⛔ Not a no-op: the package binds `C-x C-p|C-x h` to selectAll, and
      // `probe-keymap.mjs` measures it selecting the whole document. A remembered
      // claim about a dependency once told Emacs users a working chord did not
      // exist. Read the package's key table, do not recall it.
      { spec: "Mod+A", key: "C-a", runs: "move-beginning-of-line" },
      { spec: "Control+Space", key: "C-Space", runs: "set-mark-command" },
      { spec: "Mod+Y", key: "C-y", runs: "yank" },
      { spec: "Mod+/", key: "C-/", runs: "undo" },
      { spec: "Mod+K", key: "C-k", runs: "kill-line" },
      // ⛔ `C-g` is the one chord an Emacs user presses to get OUT of something.
      // BelJar's Go to Line ships on `Mod+G` — the universal IDE chord — so under
      // Emacs it stands aside and answers to `M-g g`, Emacs' own goto-map.
      { spec: "Mod+G", key: "C-g", runs: "keyboard-quit" },
      // ⛔ A PREFIX takes the chord as surely as a command does. `C-x` and `C-c`
      // are not in the package's key table — they are chain heads — so a table
      // built by reading `emacsKeys` alone missed them, and Cut and Copy went on
      // advertising Ctrl+X and Ctrl+C under Emacs with no tag on either.
      { spec: "Mod+X", key: "C-x", runs: "the C-x prefix" },
      { spec: "Mod+C", key: "C-c", runs: "the C-c prefix" },
      { spec: "Mod+V", key: "C-v", runs: "scroll-up-command" },
      { spec: "Alt+Shift+F", key: "S-M-f", runs: "forward-word, selecting" },
      // ⛔ `M-x` IS Run Command — Emacs reaches the same command through its own
      // binding. `sameCommand` stops it reading as a loss, because nothing is lost.
      { spec: "Alt+X", key: "M-x", runs: "execute-extended-command", sameCommand: "tools.commands" }
    ],
    // Vim takes no chord for itself: what it does is make BelJar's chords
    // Insert-only, which is a MODE caveat and carries its own tag.
    vim: []
  };
  var INSERT_ALTERNATIVE = {
    vim: {
      "edit.undo": "u",
      "edit.redo": "C-r",
      "edit.find": "/",
      // The kill-ring answer, not the chord: in Normal mode Vim's own operators
      // are what cut, copy and paste, and the chords belong to Vim there.
      "edit.cut": "d",
      "edit.copy": "y",
      "edit.paste": "p"
    }
  };
  var STYLE_CHORDS = {
    emacs: {
      "edit.find": "C-s",
      "edit.select-all": "C-x h",
      "edit.redo": "C-S-z",
      "edit.format": "C-c q",
      "tools.commands": "M-x",
      "nav.anywhere": "C-x C-f",
      // Emacs' own goto-map. `M-g` alone is the prefix; `M-g g` and `M-g M-g`
      // both land here, exactly as they do in Emacs.
      "nav.goto-line": "M-g g",
      // Emacs' own kmacro keys, running BelJar's one macro engine.
      "macro.record": "C-x (",
      "macro.replay": "C-x e"
    },
    vim: {}
  };
  var STYLE_NAME = { emacs: "Emacs", vim: "Vim" };
  function readableStyleChord(keys) {
    const raw = String(keys == null ? "" : keys).trim();
    if (!raw) return "";
    if (raw.indexOf(" ") >= 0) return raw.split(/\s+/).map(readableStyleChord).join(" ");
    if (raw.indexOf("-") < 0) return raw.length === 1 ? raw.toUpperCase() : raw;
    const parts = raw.split("-");
    const last = parts.pop();
    const mods = parts.map((p) => ({ C: "Ctrl", S: "Shift", M: "Alt" })[p] || p);
    const rank = { Ctrl: 0, Alt: 1, Shift: 2 };
    mods.sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9));
    const name = last === "Space" ? "Space" : last.length === 1 ? last.toUpperCase() : last;
    return mods.concat([name]).join("+");
  }
  function specFromStyleKey(key) {
    const raw = String(key == null ? "" : key).trim();
    if (!raw || /\s/.test(raw)) return "";
    const sep = raw.indexOf("-") >= 0 ? "-" : "+";
    const parts = raw.split(sep);
    const last = parts.pop();
    if (!last) return "";
    const mods = { Mod: false, Alt: false, Shift: false };
    for (const part of parts) {
      if (part === "C" || part === "Ctrl" || part === "Mod") mods.Mod = true;
      else if (part === "M" || part === "Alt") mods.Alt = true;
      else if (part === "S" || part === "Shift") mods.Shift = true;
      else return "";
    }
    if (!mods.Mod && !mods.Alt && !mods.Shift) return "";
    const out = [];
    if (mods.Mod) out.push("Mod");
    if (mods.Alt) out.push("Alt");
    if (mods.Shift) out.push("Shift");
    out.push(last.length === 1 ? last.toUpperCase() : last);
    return out.join("+");
  }
  function chordInStyle(described) {
    if (!described) return "";
    if (described.styleChord) return described.styleChord;
    if (described.availableInStyle === false) return "";
    if (described.shadow && described.shadow.kind === "shadowed") return "";
    return described.chord || "";
  }
  function takesChord(style, spec) {
    if (!spec) return null;
    const table = STYLE_TAKES[style] || [];
    for (const entry of table) {
      if (entry.spec === spec) return entry;
    }
    return null;
  }
  function chordShadow(opts) {
    const style = opts.style;
    if (!STYLE_NAME[style]) return null;
    const name = STYLE_NAME[style];
    if (opts.policy === "insert-only") {
      const instead = (INSERT_ALTERNATIVE[style] || {})[opts.commandId] || "";
      return {
        kind: "insert",
        tag: "insert",
        instead,
        tip: instead ? `Only while you are typing. In Normal mode, press ${instead}.` : `Only while you are typing, not in ${name}'s Normal mode.`
      };
    }
    const spec = opts.spec || "";
    const label = opts.label || spec;
    const taken = takesChord(style, spec);
    if (taken && taken.sameCommand !== opts.commandId) {
      return {
        kind: "shadowed",
        tag: "shadowed",
        key: taken.key,
        runs: taken.runs,
        // ⛔ A statement about the CHORD, naming both claimants. Never "without
        // Emacs this command would be…" — that describes a world you are not in.
        tip: `${name} uses ${label} for ${taken.runs}.`
      };
    }
    if (!opts.fromStyle) return null;
    const owner = typeof opts.baseOwnerOf === "function" ? opts.baseOwnerOf(spec) : null;
    if (owner && owner.id !== opts.commandId) {
      return {
        kind: "shadowing",
        tag: "shadowing",
        owner: owner.id,
        tip: `${name} uses ${label} here. In Standard, ${label} is ${owner.title}.`
      };
    }
    return null;
  }

  // js/commands/command-context.mjs
  function doc(given) {
    if (given) return given;
    return typeof document !== "undefined" ? document : null;
  }
  function activeElement(given) {
    const d = doc(given);
    return d && d.activeElement ? d.activeElement : null;
  }
  function closestFrom(el5, selector) {
    if (!el5 || typeof el5.closest !== "function") return null;
    try {
      return el5.closest(selector);
    } catch (_) {
      return null;
    }
  }
  function editingStyle() {
    try {
      const v = Settings.get("keymapStyle");
      return v === "vim" || v === "emacs" ? v : "default";
    } catch (_) {
      return "default";
    }
  }
  function isEmacsEditorFocused(given) {
    const ed = closestFrom(activeElement(given), ".cm-editor");
    if (!ed || typeof ed.querySelector !== "function") return false;
    try {
      return !!ed.querySelector(".cm-emacsMode");
    } catch (_) {
      return false;
    }
  }
  function isCommandLineFocused(given) {
    return !!closestFrom(activeElement(given), ".jar-cmdline, .jar-strip__vim");
  }

  // js/commands/command-names.mjs
  var MX_PREFIX = "beljar-";
  function mxNameFor(id, explicit) {
    if (explicit) return String(explicit);
    const slug = String(id == null ? "" : id).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug ? MX_PREFIX + slug : "";
  }
  function exNamesFor(ex) {
    const raw = ex == null ? [] : Array.isArray(ex) ? ex : [ex];
    const out = [];
    for (const name of raw) {
      const clean = String(name == null ? "" : name).trim().replace(/^:+/, "");
      if (clean && out.indexOf(clean) < 0) out.push(clean);
    }
    return out;
  }
  function titleFor(id, explicit) {
    if (explicit) return String(explicit);
    const tail = String(id == null ? "" : id).split(".").pop() || "";
    const words = tail.replace(/[-_]+/g, " ").trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : String(id || "");
  }

  // js/commands/command-registry.mjs
  var global8 = globalThis;
  var POLICIES = ["off", "yield", "insert-only", "always"];
  var DEFAULT_POLICY = "always";
  var order = [];
  var byId = /* @__PURE__ */ Object.create(null);
  var version = 0;
  function currentPage() {
    const routes = global8.Routes;
    if (!routes || typeof routes.pageOf !== "function" || !global8.location) return null;
    return routes.pageOf(global8.location) === "edit" ? "editor" : "home";
  }
  function runsOn(cmd, page) {
    return !page || cmd.pages === "both" || cmd.pages === page;
  }
  function normalize(record) {
    const id = String(record.id);
    return Object.assign({}, record, {
      id,
      title: titleFor(id, record.title),
      section: record.section || "",
      scope: record.scope || "global",
      pages: record.pages === "home" || record.pages === "both" ? record.pages : "editor",
      keybindable: !!record.keybindable,
      palette: !!record.palette,
      cmdline: record.cmdline === false ? false : true,
      ex: exNamesFor(record.ex),
      mx: mxNameFor(id, record.mx),
      styles: record.styles || null
    });
  }
  function define(desc) {
    if (!desc || typeof desc !== "object") return false;
    const id = desc.id == null ? "" : String(desc.id);
    if (!id) return false;
    const prev = byId[id];
    if (!prev) order.push(id);
    const next = normalize(Object.assign({}, prev || {}, desc, { id }));
    if (!runsOn(next, currentPage())) {
      delete next.run;
      delete next.when;
      delete next.preview;
    }
    byId[id] = next;
    version += 1;
    return true;
  }
  function defineAll(list3) {
    if (!Array.isArray(list3)) return 0;
    let n = 0;
    for (const desc of list3) if (define(desc)) n += 1;
    return n;
  }
  function attach(id, behaviour) {
    if (!id || !behaviour) return false;
    const patch = { id: String(id) };
    if (typeof behaviour.run === "function") patch.run = behaviour.run;
    if (typeof behaviour.when === "function") patch.when = behaviour.when;
    if (typeof behaviour.preview === "function") patch.preview = behaviour.preview;
    return define(patch);
  }
  function unregister(id) {
    const key = String(id == null ? "" : id);
    if (!byId[key]) return false;
    delete byId[key];
    const at = order.indexOf(key);
    if (at >= 0) order.splice(at, 1);
    version += 1;
    return true;
  }
  function get(id) {
    return byId[String(id == null ? "" : id)] || null;
  }
  function has(id) {
    return !!get(id);
  }
  function isAvailable(cmd, ctx) {
    if (!cmd || typeof cmd.when !== "function") return true;
    try {
      return !!cmd.when(ctx);
    } catch (_) {
      return false;
    }
  }
  function list(filter) {
    const f = filter || {};
    const out = [];
    for (const id of order) {
      const cmd = byId[id];
      if (!cmd) continue;
      if (f.palette === true && !cmd.palette) continue;
      if (f.keybindable === true && !cmd.keybindable) continue;
      if (f.cmdline === true && !cmd.cmdline) continue;
      if (f.runnable === true && typeof cmd.run !== "function") continue;
      if (f.scope && cmd.scope !== f.scope) continue;
      if (f.page && !runsOn(cmd, f.page)) continue;
      if (f.section && cmd.section !== f.section) continue;
      if (f.available === true && !isAvailable(cmd, f.ctx)) continue;
      out.push(cmd);
    }
    return out;
  }
  function idsWithStyle(style, policy) {
    const out = [];
    for (const id of order) {
      const cmd = byId[id];
      if (cmd && cmd.styles && cmd.styles[style] === policy) out.push(id);
    }
    return out;
  }
  function styleFor(id, style) {
    const cmd = get(id);
    if (!cmd || !cmd.styles) return DEFAULT_POLICY;
    const p = cmd.styles[style];
    return POLICIES.indexOf(p) >= 0 ? p : DEFAULT_POLICY;
  }
  function styleChordFor(id, style) {
    return readableStyleChord((STYLE_CHORDS[style] || {})[id] || "");
  }
  function baseOwnerOf(spec, exceptId) {
    const KB = global8.Keybindings;
    if (!spec || !KB || typeof KB.findConflict !== "function") return null;
    const id = KB.findConflict(spec, exceptId);
    if (!id) return null;
    const cmd = get(id);
    return cmd ? { id, title: cmd.title } : null;
  }
  function describe(id, opts) {
    const cmd = get(id);
    if (!cmd) return null;
    const o = opts || {};
    const style = o.style || "default";
    const KB = global8.Keybindings;
    let spec = "";
    let chord = "";
    if (KB && typeof KB.has === "function" && KB.has(cmd.id)) {
      spec = KB.resolve(cmd.id, o.isMac) || "";
      chord = KB.labelFor(cmd.id, o.isMac) || "";
    } else if (cmd.shortcut && KB && typeof KB.formatShortcut === "function") {
      spec = KB.normalizeSpec ? KB.normalizeSpec(cmd.shortcut) : "";
      chord = KB.formatShortcut(cmd.shortcut, o.isMac) || "";
    }
    const policy = styleFor(cmd.id, style);
    const styleChord = styleChordFor(cmd.id, style);
    const showingStyle = o.showing === "style" && !!styleChord;
    const shownSpec = showingStyle ? specFromStyleKey(styleChord) : spec;
    const shownLabel = showingStyle ? styleChord : chord;
    return {
      id: cmd.id,
      title: cmd.title,
      section: cmd.section,
      scope: cmd.scope,
      chord,
      spec,
      styleChord,
      ex: cmd.ex.slice(),
      mx: cmd.mx,
      keybindable: cmd.keybindable,
      palette: cmd.palette,
      runnable: typeof cmd.run === "function",
      policy,
      availableInStyle: policy !== "off",
      shadow: chordShadow({
        style,
        policy,
        commandId: cmd.id,
        spec: shownSpec,
        label: shownLabel,
        fromStyle: showingStyle,
        baseOwnerOf: (s) => baseOwnerOf(s, cmd.id)
      })
    };
  }
  function defaults() {
    return list({ keybindable: true }).map((c) => ({
      id: c.id,
      title: c.title,
      section: c.section,
      scope: c.scope,
      defaultSpec: c.defaultSpec || "",
      macDefaultSpec: c.macDefaultSpec || ""
    }));
  }
  function run(id, ctx) {
    const cmd = get(id);
    if (!cmd || typeof cmd.run !== "function") return false;
    if (!isAvailable(cmd, ctx)) return false;
    return cmd.run(ctx) !== false;
  }
  defineAll(CATALOG);
  var Commands = {
    define,
    defineAll,
    attach,
    unregister,
    get,
    has,
    list,
    describe,
    defaults,
    run,
    styleFor,
    idsWithStyle,
    /** 'home' | 'editor', or null with no page (tests). */
    page: currentPage,
    /** Whether `id` runs on this page (its `pages` in the catalogue). */
    runsHere(id) {
      const cmd = get(id);
      return !!cmd && runsOn(cmd, currentPage());
    },
    // The preference table, so the editor's `:set` resolves through the same
    // source as the palette rows without importing across the bundle seam.
    settings: {
      list: () => SETTINGS2.slice(),
      find: findSetting,
      next: nextValue,
      nearest: nearestSetting,
      id: settingId,
      parse: parseSet,
      describe: describeChange,
      candidates: optionCandidates
    },
    /**
     * The tag for an arbitrary chord shown for a command — for surfaces that
     * render a style's OWN maps (`gd`, `C-x C-s`) rather than a catalogue chord.
     *
     * ⛔ One entry point, so nothing else decides when a chord is contested.
     */
    chordShadowFor(opts) {
      const o = opts || {};
      const cmd = get(o.commandId);
      return chordShadow({
        style: o.style,
        policy: "always",
        commandId: o.commandId,
        spec: specFromStyleKey(o.keys),
        label: o.keys,
        // Always: this entry point only ever describes a STYLE's own map.
        fromStyle: true,
        baseOwnerOf: (s) => baseOwnerOf(s, cmd ? cmd.id : null)
      });
    },
    /**
     * The chord that invokes `id` RIGHT NOW, in the style currently in force, or
     * '' when nothing does.
     *
     * ⛔ The one call for a surface that prints a key beside a command's name.
     * `describe().chord` is BelJar's own binding and says nothing about whether the
     * style left it alone — print that under Emacs and the Find row offers Ctrl+F,
     * which Emacs uses for forward-char. A row with no chord is right; a row with a
     * chord that does nothing is not.
     */
    liveChord(id, opts) {
      const o = opts || {};
      const style = o.style || editingStyle();
      return chordInStyle(describe(id, Object.assign({}, o, { style, showing: "style" })));
    },
    isAvailable,
    version: () => version,
    _pure: { normalize, POLICIES, DEFAULT_POLICY, chordShadow, STYLE_TAKES, STYLE_CHORDS, specFromStyleKey, CATALOG }
  };
  global8.Commands = Commands;

  // js/ui/keybindings.mjs
  var global9 = globalThis;
  var IS_MAC = typeof navigator !== "undefined" && /Mac/.test(navigator.platform || "");
  var DEFAULTS = [];
  var BY_ID3 = /* @__PURE__ */ Object.create(null);
  var projectedVersion = -1;
  function syncDefaults() {
    var v = Commands.version();
    if (v === projectedVersion) return;
    projectedVersion = v;
    var next = Commands.defaults();
    DEFAULTS.length = 0;
    for (var k in BY_ID3) delete BY_ID3[k];
    for (var i = 0; i < next.length; i++) {
      DEFAULTS.push(next[i]);
      BY_ID3[next[i].id] = next[i];
    }
  }
  syncDefaults();
  var RESERVED = {
    "Mod+T": 1,
    "Mod+N": 1,
    "Mod+W": 1,
    "Mod+Q": 1,
    "Mod+Shift+T": 1,
    "Mod+Shift+N": 1,
    "Mod+Shift+W": 1,
    "Mod+L": 1,
    "Mod+Shift+Delete": 1,
    "Alt+F4": 1
  };
  var SECTION_ORDER = ["File", "Edit", "Motion", "Navigate", "Prover", "Run", "View", "Settings", "Account", "Tools"];
  var globalHandlers = /* @__PURE__ */ Object.create(null);
  var globalFallback = null;
  var listening = false;
  var scopeDefsCache = /* @__PURE__ */ Object.create(null);
  var scopeDefsVersion = -1;
  function defsForScope(scope) {
    syncDefaults();
    if (scopeDefsVersion !== projectedVersion) {
      scopeDefsVersion = projectedVersion;
      scopeDefsCache = /* @__PURE__ */ Object.create(null);
    }
    var cached = scopeDefsCache[scope];
    if (cached) return cached;
    var out = [];
    for (var i = 0; i < DEFAULTS.length; i++) {
      if (DEFAULTS[i].scope === scope) out.push(DEFAULTS[i]);
    }
    scopeDefsCache[scope] = out;
    return out;
  }
  function readOverrides() {
    return Settings.get("keybindings");
  }
  function overridesRaw() {
    return Settings.revision("keybindings");
  }
  function compileSpec(n) {
    if (!n) return null;
    var parts = n.split("+");
    var c = { key: parts[parts.length - 1], mod: false, control: false, alt: false, shift: false };
    for (var i = 0; i < parts.length - 1; i++) {
      if (parts[i] === "Mod") c.mod = true;
      else if (parts[i] === "Control") c.control = true;
      else if (parts[i] === "Alt") c.alt = true;
      else if (parts[i] === "Shift") c.shift = true;
    }
    return c;
  }
  function eventMatchesCompiled(e, key, c) {
    if (!c) return false;
    if (c.control) {
      if (!e.ctrlKey || e.metaKey) return false;
    } else if (c.mod !== !!(e.ctrlKey || e.metaKey)) return false;
    if (c.alt !== !!e.altKey) return false;
    if (c.shift !== !!e.shiftKey) return false;
    return key === c.key;
  }
  var globalTable = null;
  function globalDispatchTable() {
    syncDefaults();
    var raw = overridesRaw();
    if (globalTable && globalTable.version === projectedVersion && raw !== null && globalTable.raw === raw) {
      return globalTable;
    }
    var overrides = readOverrides();
    var defs = defsForScope("global");
    var bound = [];
    for (var i = 0; i < defs.length; i++) {
      var spec = resolveWith(defs[i].id, null, overrides);
      if (spec) bound.push({ id: defs[i].id, c: compileSpec(spec) });
    }
    var freedSpecs = freedDefaultsForScope("global", overrides);
    var freed = [];
    for (var j = 0; j < freedSpecs.length; j++) {
      var fc = compileSpec(freedSpecs[j]);
      if (fc) freed.push(fc);
    }
    var table = { raw, version: projectedVersion, bound, freed };
    globalTable = raw === null ? null : table;
    return table;
  }
  function writeOverrides(map) {
    Settings.set("keybindings", map);
  }
  function notifyChanged() {
    globalTable = null;
    try {
      if (typeof global9.CustomEvent === "function") {
        global9.dispatchEvent(new global9.CustomEvent("beljar:keybindings-changed", { detail: {} }));
      } else if (typeof global9.dispatchEvent === "function") {
        global9.dispatchEvent({ type: "beljar:keybindings-changed", detail: {} });
      }
    } catch (_) {
    }
  }
  function formatShortcutPart(part, isMac) {
    if (part === "Mod") return isMac ? "\u2318" : "Ctrl";
    if (part === "Control") return isMac ? "\u2303" : "Ctrl";
    if (part === "Shift") return isMac ? "\u21E7" : "Shift";
    if (part === "Alt") return isMac ? "\u2325" : "Alt";
    return part;
  }
  function shortcutParts(spec, isMac) {
    if (!spec) return [];
    return String(spec).split("+").map(function(part) {
      return formatShortcutPart(part, isMac != null ? isMac : IS_MAC);
    });
  }
  function formatShortcut(spec, isMac) {
    if (!spec) return "";
    var mac = isMac != null ? isMac : IS_MAC;
    var parts = shortcutParts(spec, mac);
    return parts.join(mac ? "" : "+");
  }
  function normalizeKeyToken(raw) {
    if (!raw) return "";
    var k = String(raw);
    if (k === " ") return "Space";
    if (k.length === 1) return k.toUpperCase();
    if (/^f\d{1,2}$/i.test(k)) return k.toUpperCase();
    if (k === "ArrowLeft") return "Left";
    if (k === "ArrowRight") return "Right";
    if (k === "ArrowUp") return "Up";
    if (k === "ArrowDown") return "Down";
    if (k === "Escape") return "Escape";
    if (k === "Backspace") return "Backspace";
    if (k === "Delete") return "Delete";
    if (k === "Enter") return "Enter";
    if (k === "Tab") return "Tab";
    return k.length === 1 ? k.toUpperCase() : k;
  }
  function normalizeSpec(spec) {
    if (spec == null || spec === "") return "";
    var parts = String(spec).split("+").filter(Boolean);
    if (!parts.length) return "";
    var mod = false;
    var control = false;
    var shift = false;
    var alt = false;
    var key = "";
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var pl = p.toLowerCase();
      if (pl === "control" || p === "\u2303") control = true;
      else if (pl === "mod" || pl === "ctrl" || pl === "meta" || pl === "cmd" || p === "\u2318") mod = true;
      else if (pl === "shift" || p === "\u21E7") shift = true;
      else if (pl === "alt" || pl === "option" || p === "\u2325") alt = true;
      else key = normalizeKeyToken(p);
    }
    if (!key) return "";
    var out = [];
    if (mod) out.push("Mod");
    if (control) out.push("Control");
    if (alt) out.push("Alt");
    if (shift) out.push("Shift");
    out.push(key);
    return out.join("+");
  }
  function platformDefaultSpec(def, isMac) {
    if (!def) return "";
    var mac = isMac != null ? isMac : IS_MAC;
    if (mac && def.macDefaultSpec) return normalizeSpec(def.macDefaultSpec);
    return normalizeSpec(def.defaultSpec);
  }
  function isUnboundSentinel(v) {
    return v === null || v === "";
  }
  function resolveWith(id, isMac, overrides) {
    var def = BY_ID3[id];
    if (!def) return null;
    if (Object.prototype.hasOwnProperty.call(overrides, id)) {
      var ov = overrides[id];
      if (isUnboundSentinel(ov)) return null;
      return normalizeSpec(ov) || null;
    }
    return platformDefaultSpec(def, isMac) || null;
  }
  function resolve(id, isMac) {
    syncDefaults();
    return resolveWith(id, isMac, readOverrides());
  }
  function isUserOverride(id) {
    var overrides = readOverrides();
    return Object.prototype.hasOwnProperty.call(overrides, id);
  }
  function has2(id) {
    syncDefaults();
    return !!BY_ID3[id];
  }
  function labelFor(id, isMac) {
    return formatShortcut(resolve(id, isMac), isMac);
  }
  function list2(isMac) {
    syncDefaults();
    var mac = isMac != null ? isMac : IS_MAC;
    var rows = DEFAULTS.map(function(def) {
      var spec = resolve(def.id, mac);
      return {
        id: def.id,
        title: def.title,
        section: def.section,
        scope: def.scope,
        spec,
        defaultSpec: platformDefaultSpec(def, mac),
        isUser: isUserOverride(def.id),
        isEmpty: !spec
      };
    });
    rows.sort(function(a, b) {
      var sa = SECTION_ORDER.indexOf(a.section);
      var sb = SECTION_ORDER.indexOf(b.section);
      if (sa < 0) sa = SECTION_ORDER.length;
      if (sb < 0) sb = SECTION_ORDER.length;
      if (sa !== sb) return sa - sb;
      return a.title.localeCompare(b.title);
    });
    return rows;
  }
  function isBrowserReserved(spec) {
    var n = normalizeSpec(spec);
    return !!(n && RESERVED[n]);
  }
  function isFunctionKey(key) {
    return /^F([1-9]|1\d|2[0-4])$/i.test(key || "");
  }
  function isReservedSequence(spec) {
    var n = normalizeSpec(spec);
    if (!n) return false;
    if (RESERVED[n]) return true;
    var parts = n.split("+");
    var key = parts[parts.length - 1];
    var hasMod = false;
    var hasAlt = false;
    var hasControl = false;
    for (var i = 0; i < parts.length - 1; i++) {
      if (parts[i] === "Mod") hasMod = true;
      if (parts[i] === "Alt") hasAlt = true;
      if (parts[i] === "Control") hasControl = true;
    }
    if (hasMod || hasAlt || hasControl) return false;
    if (isFunctionKey(key)) return false;
    return true;
  }
  function titleFor2(id) {
    syncDefaults();
    var def = BY_ID3[id];
    return def ? def.title : "";
  }
  function findConflict(spec, exceptId) {
    syncDefaults();
    var n = normalizeSpec(spec);
    if (!n) return null;
    var overrides = readOverrides();
    for (var i = 0; i < DEFAULTS.length; i++) {
      var def = DEFAULTS[i];
      if (exceptId && def.id === exceptId) continue;
      var r = resolveWith(def.id, null, overrides);
      if (r && normalizeSpec(r) === n) return def.id;
    }
    return null;
  }
  function setBinding(id, spec) {
    if (!BY_ID3[id]) return { ok: false, reason: "unknown" };
    if (isUnboundSentinel(spec)) {
      var mapClear = readOverrides();
      mapClear[id] = "";
      writeOverrides(mapClear);
      notifyChanged();
      return { ok: true };
    }
    var n = normalizeSpec(spec);
    if (!n) return { ok: false, reason: "invalid" };
    if (isReservedSequence(n)) return { ok: false, reason: "reserved" };
    var conflictId = findConflict(n, id);
    if (conflictId) return { ok: false, reason: "conflict", conflictId };
    var map = readOverrides();
    var def = BY_ID3[id];
    var plat = platformDefaultSpec(def);
    if (n === plat) delete map[id];
    else map[id] = n;
    writeOverrides(map);
    notifyChanged();
    return { ok: true };
  }
  function clearBinding(id) {
    return setBinding(id, "");
  }
  function resetBinding(id) {
    if (!BY_ID3[id]) return { ok: false, reason: "unknown" };
    var map = readOverrides();
    delete map[id];
    writeOverrides(map);
    notifyChanged();
    return { ok: true };
  }
  function resetAll() {
    Settings.reset("keybindings");
    notifyChanged();
    return { ok: true };
  }
  function isModifierKey(key) {
    return key === "Control" || key === "Shift" || key === "Alt" || key === "Meta" || key === "OS";
  }
  function specFromEvent(e) {
    if (!e || isModifierKey(e.key)) return null;
    if (e.key === "Dead") return null;
    var parts = [];
    if (e.metaKey) parts.push("Mod");
    else if (e.ctrlKey) parts.push(IS_MAC ? "Control" : "Mod");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    var key = normalizeKeyToken(e.key);
    if (!key || key === "Shift" || key === "Control" || key === "Alt" || key === "Meta") return null;
    parts.push(key);
    return normalizeSpec(parts.join("+"));
  }
  function eventMatchesSpec(e, spec) {
    var n = normalizeSpec(spec);
    if (!n || !e) return false;
    var want = /* @__PURE__ */ Object.create(null);
    var parts = n.split("+");
    var wantKey = parts[parts.length - 1];
    for (var i = 0; i < parts.length - 1; i++) want[parts[i]] = true;
    var hasMod = !!(e.ctrlKey || e.metaKey);
    var hasAlt = !!e.altKey;
    var hasShift = !!e.shiftKey;
    if (want.Control) {
      if (!e.ctrlKey || e.metaKey) return false;
    } else if (!!want.Mod !== hasMod) return false;
    if (!!want.Alt !== hasAlt) return false;
    if (!!want.Shift !== hasShift) return false;
    var got = normalizeKeyToken(e.key);
    return got === wantKey;
  }
  function matchesId(e, id) {
    var spec = resolve(id);
    if (!spec) return false;
    return eventMatchesSpec(e, spec);
  }
  function toCmKey(spec) {
    var n = normalizeSpec(spec);
    if (!n) return "";
    return n.split("+").map(function(part, idx, arr) {
      if (part === "Mod" || part === "Shift" || part === "Alt") return part;
      if (part === "Control") return "Ctrl";
      if (idx === arr.length - 1 && part.length === 1) return part.toLowerCase();
      return part;
    }).join("-");
  }
  function freedDefaultsForScope(scope, overrides) {
    var ov = overrides || readOverrides();
    var defs = defsForScope(scope);
    var freed = [];
    var claimed = /* @__PURE__ */ Object.create(null);
    for (var i = 0; i < defs.length; i++) {
      var resolved = resolveWith(defs[i].id, null, ov);
      if (resolved) claimed[normalizeSpec(resolved)] = defs[i].id;
    }
    for (var j = 0; j < defs.length; j++) {
      var d = defs[j];
      var plat = platformDefaultSpec(d);
      if (!plat) continue;
      var cur = resolveWith(d.id, null, ov);
      if (normalizeSpec(cur) === plat) continue;
      if (claimed[plat]) continue;
      freed.push(plat);
      claimed[plat] = d.id;
    }
    return freed;
  }
  function buildEditorKeymap(runById, opts) {
    syncDefaults();
    var entries = [];
    var seen2 = /* @__PURE__ */ Object.create(null);
    var runners = runById || {};
    var fallback = opts && typeof opts.fallback === "function" ? opts.fallback : null;
    var omit = /* @__PURE__ */ Object.create(null);
    var omitDefaultSpecs = /* @__PURE__ */ Object.create(null);
    if (opts && opts.omitIds) {
      var list3 = opts.omitIds;
      for (var oi = 0; oi < list3.length; oi++) {
        omit[list3[oi]] = true;
        var omitDef = BY_ID3[list3[oi]];
        if (omitDef && omitDef.scope === "editor") {
          var omitPlat = platformDefaultSpec(omitDef);
          if (omitPlat) omitDefaultSpecs[normalizeSpec(omitPlat)] = true;
        }
      }
    }
    for (var i = 0; i < DEFAULTS.length; i++) {
      var def = DEFAULTS[i];
      if (def.scope !== "editor") continue;
      if (omit[def.id]) continue;
      var spec = resolve(def.id);
      if (!spec) continue;
      var run3 = runners[def.id] || (fallback ? fallback(def.id) : null);
      if (typeof run3 !== "function") continue;
      var cm = toCmKey(spec);
      if (!cm || seen2[cm]) continue;
      seen2[cm] = true;
      (function(fn) {
        entries.push({ key: cm, run: function(view) {
          return !!fn(view);
        } });
      })(run3);
    }
    var freed = freedDefaultsForScope("editor");
    for (var f = 0; f < freed.length; f++) {
      if (omitDefaultSpecs[normalizeSpec(freed[f])]) continue;
      var fcm = toCmKey(freed[f]);
      if (!fcm || seen2[fcm]) continue;
      seen2[fcm] = true;
      entries.push({ key: fcm, run: function() {
        return true;
      } });
    }
    return entries;
  }
  function isRecordingChordTarget2(e) {
    var t = e && e.target || (typeof document !== "undefined" ? document.activeElement : null);
    return !!(t && t.classList && t.classList.contains("jar-kb__chord") && t.classList.contains("is-recording"));
  }
  function isEmacsEditorFocused2() {
    return isEmacsEditorFocused();
  }
  function shouldYieldGlobalForEmacs(commandId, emacsFocused) {
    if (!emacsFocused) return false;
    var policy = Commands.styleFor(commandId, "emacs");
    return policy === "yield" || policy === "off";
  }
  function onGlobalKeydown(e) {
    if (e.isComposing) return;
    var key = normalizeKeyToken(e.key);
    if (!(e.ctrlKey || e.metaKey || e.altKey) && !isFunctionKey(key)) return;
    if (isRecordingChordTarget2(e)) return;
    if (isCommandLineFocused()) return;
    var table = globalDispatchTable();
    var freed = table.freed;
    for (var fi = 0; fi < freed.length; fi++) {
      if (eventMatchesCompiled(e, key, freed[fi])) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    var bound = table.bound;
    for (var i = 0; i < bound.length; i++) {
      if (!eventMatchesCompiled(e, key, bound[i].c)) continue;
      var id = bound[i].id;
      if (shouldYieldGlobalForEmacs(id, isEmacsEditorFocused2())) return;
      var handler = globalHandlers[id] || (globalFallback ? globalFallback(id) : null);
      if (typeof handler !== "function") continue;
      e.preventDefault();
      e.stopPropagation();
      try {
        handler();
      } catch (_) {
      }
      return;
    }
  }
  function initGlobals(handlers, opts) {
    if (handlers && typeof handlers === "object") {
      Object.keys(handlers).forEach(function(id) {
        globalHandlers[id] = handlers[id];
      });
    }
    if (opts && typeof opts.fallback === "function") globalFallback = opts.fallback;
    if (listening) return;
    listening = true;
    global9.addEventListener("keydown", onGlobalKeydown, true);
  }
  function setGlobalHandler(id, fn) {
    globalHandlers[id] = fn;
  }
  global9.Keybindings = {
    DEFAULTS,
    IS_MAC,
    has: has2,
    list: list2,
    resolve,
    labelFor,
    isUserOverride,
    platformDefaultSpec: function(id, isMac) {
      return platformDefaultSpec(BY_ID3[id], isMac);
    },
    normalizeSpec,
    formatShortcut,
    shortcutParts,
    specFromEvent,
    eventMatchesSpec,
    matchesId,
    isBrowserReserved,
    isReservedSequence,
    titleFor: titleFor2,
    findConflict,
    setBinding,
    clearBinding,
    resetBinding,
    resetAll,
    toCmKey,
    buildEditorKeymap,
    freedDefaultsForScope,
    initGlobals,
    setGlobalHandler,
    shouldYieldGlobalForEmacs,
    isEmacsEditorFocused: isEmacsEditorFocused2,
    _pure: {
      normalizeSpec,
      formatShortcut,
      shortcutParts,
      platformDefaultSpec,
      isBrowserReserved,
      isReservedSequence,
      toCmKey,
      specFromEvent,
      shouldYieldGlobalForEmacs,
      DEFAULTS,
      RESERVED
    }
  };
  global9.BelJarKeybindings = global9.Keybindings;

  // js/ui/list-step.mjs
  var LIST_STEP = { n: 1, m: 1, p: -1 };
  var LIST_PAGE = 8;
  function stepLetter(e) {
    if (!e.ctrlKey || e.shiftKey) return "";
    if (e.key && e.key.length === 1) return e.key.toLowerCase();
    if (e.code && e.code.length === 4 && e.code.startsWith("Key")) return e.code[3].toLowerCase();
    return "";
  }
  function listStepDelta(e, opts) {
    if (!e || e.altKey || e.metaKey) return 0;
    const arrows = !opts || opts.arrows !== false;
    if (e.key === "PageDown") return LIST_PAGE;
    if (e.key === "PageUp") return -LIST_PAGE;
    if (arrows && !e.ctrlKey && !e.shiftKey) {
      if (e.key === "ArrowDown") return 1;
      if (e.key === "ArrowUp") return -1;
    }
    const letter = stepLetter(e);
    if (letter && LIST_STEP[letter] !== void 0) return LIST_STEP[letter];
    const KB = typeof globalThis !== "undefined" ? globalThis.Keybindings : null;
    if (KB && typeof KB.matchesId === "function") {
      if (!arrows && (e.key === "ArrowDown" || e.key === "ArrowUp")) return 0;
      if (KB.matchesId(e, "motion.line-down")) return 1;
      if (KB.matchesId(e, "motion.line-up")) return -1;
    }
    return 0;
  }

  // js/ui/command-palette.mjs
  var global10 = globalThis;
  function fuzzyScore(query2, text) {
    if (!query2) return { score: 0, positions: [] };
    const t = String(text || "");
    const q = query2.toLowerCase();
    const tl = t.toLowerCase();
    if (q.length > tl.length) return null;
    let score = 0;
    let prev = -2;
    let from = 0;
    const positions = [];
    for (let qi = 0; qi < q.length; qi++) {
      const idx = tl.indexOf(q[qi], from);
      if (idx < 0) return null;
      let s = 1;
      if (idx === prev + 1) s += 4;
      const before = idx > 0 ? t[idx - 1] : "";
      const isWordStart = idx === 0 || before === " " || before === "-" || before === "_" || before === "." || before === "/" || before === ":";
      const isHump = t[idx] >= "A" && t[idx] <= "Z" && before >= "a" && before <= "z";
      if (isWordStart || isHump) s += 6;
      score += s;
      positions.push(idx);
      prev = idx;
      from = idx + 1;
    }
    const spread = positions[positions.length - 1] - positions[0] - (q.length - 1);
    score -= Math.floor(spread * 0.5);
    if (positions[0] === 0) score += 3;
    return { score, positions };
  }
  function substringPositions(query2, text) {
    if (!query2) return null;
    const t = String(text || "");
    const q = String(query2);
    const idx = t.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return null;
    const positions = [];
    for (let i = 0; i < q.length; i++) positions.push(idx + i);
    return positions;
  }
  function parseInput(raw) {
    const s = String(raw || "");
    if (s.startsWith(">")) return { mode: "commands", query: s.slice(1).trim() };
    if (s.startsWith("@")) return { mode: "symbols", query: s.slice(1).trim() };
    if (s.startsWith("%")) return { mode: "search", query: s.slice(1).trim() };
    if (s.startsWith("#")) {
      return { mode: "search", query: s.slice(1).trim(), legacyHash: true };
    }
    if (s.startsWith(":")) return { mode: "line", query: s.slice(1).trim() };
    if (s.startsWith("!")) return { mode: "problems", query: s.slice(1).trim() };
    if (s.startsWith("/")) return { mode: "library", query: s.slice(1).trim() };
    if (s.startsWith("?")) return { mode: "help", query: s.slice(1).trim() };
    return { mode: "anywhere", query: s.trim() };
  }
  function rankItems(items, query2, limit) {
    const cap = limit || 50;
    if (!query2) {
      return items.slice(0, cap).map((item) => ({ ...item, _match: null }));
    }
    const scored = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const onTitle = fuzzyScore(query2, item.title);
      if (onTitle) {
        scored.push({ item, score: onTitle.score, positions: onTitle.positions, index: i });
        continue;
      }
      if (item.detail) {
        const onDetail = fuzzyScore(query2, item.detail);
        if (onDetail) scored.push({ item, score: onDetail.score * 0.5, positions: null, index: i });
      }
    }
    scored.sort((a, b) => b.score - a.score || a.index - b.index);
    return scored.slice(0, cap).map((s) => ({ ...s.item, _match: s.positions }));
  }
  function formatShortcutPart2(part, isMac) {
    if (part === "Mod") return isMac ? "\u2318" : "Ctrl";
    if (part === "Shift") return isMac ? "\u21E7" : "Shift";
    if (part === "Alt") return isMac ? "\u2325" : "Alt";
    return part;
  }
  function shortcutParts2(spec, isMac) {
    if (!spec) return [];
    return String(spec).split("+").map((part) => formatShortcutPart2(part, isMac));
  }
  function formatShortcut2(spec, isMac) {
    if (!spec) return "";
    const parts = shortcutParts2(spec, isMac);
    return parts.join(isMac ? "" : "+");
  }
  function parseLineQuery(query2) {
    const m = String(query2 || "").match(/^(\d+)(?::(\d+))?$/);
    if (!m) return null;
    const line = parseInt(m[1], 10);
    const col = m[2] != null ? parseInt(m[2], 10) : 1;
    if (!Number.isFinite(line) || line < 1) return null;
    return { line, col: Number.isFinite(col) && col >= 1 ? col : 1 };
  }
  var HELP_CATALOG = [
    { mode: "anywhere", title: "Anywhere", detail: "Go to files & symbols", prefix: "", commandId: "nav.anywhere" },
    { mode: "commands", title: "Commands", detail: "Run a command", prefix: ">", commandId: "tools.commands" },
    { mode: "symbols", title: "Symbols", detail: "Go to symbol", prefix: "@", commandId: "nav.symbol" },
    { mode: "search", title: "Search project", detail: "Find text across files", prefix: "%", commandId: "edit.search-project" },
    { mode: "line", title: "Go to line", detail: "Jump to line[:column]", prefix: ":" },
    { mode: "problems", title: "Problems", detail: "Errors & warnings", prefix: "!" },
    { mode: "library", title: "Library", detail: "Browse library samples", prefix: "/" },
    { mode: "help", title: "Help", detail: "This mode list", prefix: "?" }
  ];
  var MODE_META = {
    anywhere: { label: "Anywhere", placeholder: "Go to file/symbol or change mode\u2026" },
    commands: { label: "Commands", placeholder: "Type a command\u2026" },
    symbols: { label: "Symbols", placeholder: "Go to symbol\u2026" },
    search: { label: "Search", placeholder: "Search project text\u2026" },
    line: { label: "Line", placeholder: "Line number, or line:column\u2026" },
    problems: { label: "Problems", placeholder: "Filter errors & warnings\u2026" },
    library: { label: "Library", placeholder: "Search library samples\u2026" },
    help: { label: "Help", placeholder: "Filter modes\u2026" }
  };
  var MODE_PREFIX = {
    anywhere: "",
    commands: ">",
    symbols: "@",
    search: "%",
    line: ":",
    problems: "!",
    library: "/",
    help: "?"
  };
  var PROVIDER_KINDS = ["files", "symbols", "search", "problems", "library"];
  var providers = /* @__PURE__ */ Object.create(null);
  for (const k of PROVIDER_KINDS) providers[k] = null;
  function register(cmd) {
    if (!cmd || !cmd.id || typeof cmd.run !== "function") return;
    Commands.define(Object.assign({ palette: true }, cmd));
  }
  function unregister2(id) {
    Commands.unregister(id);
  }
  function setProvider(kind, fn) {
    if (PROVIDER_KINDS.indexOf(kind) < 0) return;
    providers[kind] = fn;
  }
  function modeAvailable(mode) {
    if (mode === "anywhere" || mode === "commands" || mode === "help") return true;
    if (mode === "line") return !!global10.CurrentEditor;
    return typeof providers[mode] === "function";
  }
  function parseHere(raw) {
    const parsed = parseInput(raw);
    return modeAvailable(parsed.mode) ? parsed : { mode: "anywhere", query: String(raw || "").trim() };
  }
  function setModeMeta(mode, meta) {
    if (!MODE_META[mode] || !meta) return;
    MODE_META[mode] = Object.assign({}, MODE_META[mode], meta);
  }
  function activeCommands() {
    return Commands.list({ palette: true, runnable: true, available: true });
  }
  function listCommands() {
    return Commands.list({ palette: true }).map((c) => ({
      id: c.id,
      title: c.title || c.id,
      section: c.section || "",
      shortcut: c.shortcut || "",
      detail: c.detail || ""
    }));
  }
  function providerItems(kind, arg) {
    const fn = providers[kind];
    if (!fn) return [];
    try {
      return fn(arg) || [];
    } catch {
      return [];
    }
  }
  var IS_MAC2 = typeof navigator !== "undefined" && /Mac/.test(navigator.platform || "");
  var ui = null;
  var isOpen = false;
  var sessionId = 0;
  var flatItems = [];
  var activeIndex = 0;
  var restoreFocusTo = null;
  var SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  function buildUi() {
    const backdrop = document.createElement("div");
    backdrop.className = "jar-palette-backdrop";
    backdrop.addEventListener("pointerdown", close);
    const panel = document.createElement("div");
    panel.className = "jar-palette";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Command palette");
    const inputWrap = document.createElement("div");
    inputWrap.className = "jar-palette-inputwrap";
    const modeChip = document.createElement("span");
    modeChip.className = "jar-palette-mode";
    modeChip.setAttribute("aria-hidden", "true");
    const iconHost = document.createElement("span");
    iconHost.className = "jar-palette-icon";
    iconHost.innerHTML = SEARCH_ICON;
    iconHost.setAttribute("aria-hidden", "true");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "jar-palette-input";
    input.placeholder = MODE_META.anywhere.placeholder;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("data-surface-find", "");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-controls", "jar-palette-list");
    inputWrap.append(modeChip, iconHost, input);
    const list3 = document.createElement("div");
    list3.className = "jar-palette-list";
    list3.id = "jar-palette-list";
    list3.setAttribute("role", "listbox");
    const empty = document.createElement("div");
    empty.className = "jar-palette-empty";
    empty.textContent = "No matching results";
    empty.hidden = true;
    const hint = document.createElement("div");
    hint.className = "jar-palette-hint";
    hint.hidden = true;
    panel.append(inputWrap, list3, empty, hint);
    input.addEventListener("input", renderResults);
    input.addEventListener("keydown", (e) => {
      const delta = listStepDelta(e);
      if (delta) {
        e.preventDefault();
        setActive(activeIndex + delta);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        runActive();
      } else if (e.key === "Escape" || e.ctrlKey && e.key === "g") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab") {
        e.preventDefault();
      }
    });
    document.body.append(backdrop, panel);
    ui = { backdrop, panel, input, list: list3, empty, hint, modeChip };
    return ui;
  }
  var commandItemsCache = null;
  var commandItemsKey = "";
  function commandItems() {
    const key = `${sessionId}|${Commands.version()}`;
    if (commandItemsCache && commandItemsKey === key) return commandItemsCache;
    commandItemsKey = key;
    commandItemsCache = activeCommands().map((c) => ({
      id: c.id,
      title: c.title,
      section: c.section || "Commands",
      shortcut: Commands.liveChord ? Commands.liveChord(c.id) || "" : "",
      detail: c.detail || "",
      run: c.run
    }));
    return commandItemsCache;
  }
  function helpItems() {
    return HELP_CATALOG.filter((h) => modeAvailable(h.mode)).map((h) => {
      let shortcut = h.prefix || "bare";
      if (h.commandId) {
        const live2 = Commands.liveChord ? Commands.liveChord(h.commandId) : "";
        if (live2) shortcut = live2;
      }
      const meta = MODE_META[h.mode] || {};
      return {
        title: (h.prefix ? h.prefix + "  " : "") + (meta.helpTitle || h.title),
        detail: meta.helpDetail || h.detail,
        shortcut,
        section: "Modes",
        run: () => {
          open5({ mode: h.mode });
        }
      };
    });
  }
  function lineJumpItems(query2) {
    const parsed = parseLineQuery(query2);
    if (!parsed) {
      if (!query2) return [];
      return [];
    }
    return [{
      title: "Go to line " + parsed.line + (query2.indexOf(":") >= 0 ? ", column " + parsed.col : ""),
      detail: "Current file",
      mono: false,
      run: () => {
        const ed = global10.CurrentEditor;
        if (!ed || typeof ed.getView !== "function") return;
        const view = ed.getView();
        if (!view) return;
        const doc2 = view.state.doc;
        const line = Math.min(Math.max(1, parsed.line), doc2.lines);
        const lineObj = doc2.line(line);
        const col = Math.min(Math.max(1, parsed.col), lineObj.length + 1);
        const pos = Math.min(lineObj.from + col - 1, lineObj.to);
        if (typeof ed.jumpToRange === "function") ed.jumpToRange({ from: pos, to: pos });
        else {
          view.dispatch({ selection: { anchor: pos, head: pos }, scrollIntoView: true });
          view.focus();
        }
      }
    }];
  }
  function gatherItems(parsed) {
    if (parsed.mode === "symbols") {
      return rankItems(providerItems("symbols"), parsed.query, 80);
    }
    if (parsed.mode === "search") {
      return providerItems("search", parsed.query).slice(0, 60).map((item) => {
        const positions = substringPositions(parsed.query, item.title);
        return { ...item, _match: positions };
      });
    }
    if (parsed.mode === "commands") {
      return rankItems(commandItems(), parsed.query, 300);
    }
    if (parsed.mode === "line") {
      return lineJumpItems(parsed.query);
    }
    if (parsed.mode === "problems") {
      return rankItems(providerItems("problems", parsed.query), parsed.query, 60);
    }
    if (parsed.mode === "library") {
      return rankItems(providerItems("library", parsed.query), parsed.query, 40);
    }
    if (parsed.mode === "help") {
      return rankItems(helpItems(), parsed.query, 20);
    }
    const files2 = providerItems("files").map((f) => ({ section: "Files", ...f }));
    const symbols = providerItems("symbols").map((s) => ({ ...s, section: "Symbols" }));
    return rankItems(files2.concat(symbols), parsed.query, 50);
  }
  function emptyMessage(parsed) {
    if (parsed.legacyHash) return "Project search is now %. Type after % to search.";
    if (parsed.mode === "search" && !parsed.query) {
      return "Type to search the project\u2026";
    }
    if (parsed.mode === "line") {
      return parsed.query ? "Enter a line number (e.g. 42 or 42:8)" : "Type a line number\u2026";
    }
    if (parsed.mode === "problems") return "No problems in the project";
    if (parsed.mode === "library") {
      return parsed.query ? "No matching library samples" : "Type to search the library\u2026";
    }
    if (parsed.mode === "help") return "No matching modes";
    return "No matching results";
  }
  function syncModeChrome(parsed) {
    const meta = MODE_META[parsed.mode] || MODE_META.anywhere;
    ui.modeChip.textContent = meta.label;
    ui.input.placeholder = meta.placeholder;
    ui.panel.setAttribute("data-mode", parsed.mode);
  }
  function renderResults() {
    if (!ui) return;
    const parsed = parseHere(ui.input.value);
    syncModeChrome(parsed);
    flatItems = gatherItems(parsed);
    const grouped = !parsed.query && (parsed.mode === "commands" || parsed.mode === "anywhere" || parsed.mode === "help" || parsed.mode === "problems");
    ui.list.innerHTML = "";
    ui.empty.hidden = flatItems.length > 0;
    ui.empty.textContent = emptyMessage(parsed);
    const showHint = parsed.mode === "anywhere" && !parsed.query;
    ui.hint.hidden = !showHint;
    if (showHint) {
      ui.hint.textContent = ["> for commands", modeAvailable("search") ? "% to search project" : "", "? to see modes"].filter(Boolean).join(" \xB7 ");
    }
    let lastSection = null;
    flatItems.forEach((item, i) => {
      if (grouped && item.section && item.section !== lastSection) {
        lastSection = item.section;
        const head = document.createElement("div");
        head.className = "jar-palette-section";
        head.textContent = item.section;
        ui.list.appendChild(head);
      }
      const row = document.createElement("div");
      row.className = "jar-palette-item";
      if (item.severity === "error") row.classList.add("is-severity-error");
      if (item.severity === "warning") row.classList.add("is-severity-warning");
      if (item.kind === "library") row.classList.add("is-library");
      row.id = "jar-palette-opt-" + i;
      row.setAttribute("role", "option");
      row.setAttribute("data-index", String(i));
      const title = document.createElement("span");
      title.className = "jar-palette-item-title" + (item.mono ? " is-mono" : "");
      appendHighlighted(title, item.title, item._match);
      row.appendChild(title);
      const side = item.shortcut || item.detail;
      if (side) {
        const meta = document.createElement("span");
        meta.className = item.shortcut ? "jar-palette-item-shortcut" : "jar-palette-item-detail";
        meta.textContent = side;
        row.appendChild(meta);
      }
      row.addEventListener("pointerdown", (e) => e.preventDefault());
      row.addEventListener("click", () => {
        activeIndex = i;
        runActive();
      });
      row.addEventListener("pointermove", () => {
        if (activeIndex !== i) setActive(i, { scroll: false });
      });
      ui.list.appendChild(row);
    });
    setActive(0, { scroll: true });
  }
  function appendHighlighted(el5, text, positions) {
    if (!positions || !positions.length) {
      el5.textContent = text;
      return;
    }
    const set = new Set(positions);
    let run3 = "";
    let runHit = set.has(0);
    for (let i = 0; i < text.length; i++) {
      const hit = set.has(i);
      if (hit !== runHit) {
        flush();
        runHit = hit;
      }
      run3 += text[i];
    }
    flush();
    function flush() {
      if (!run3) return;
      if (runHit) {
        const b = document.createElement("b");
        b.textContent = run3;
        el5.appendChild(b);
      } else {
        el5.appendChild(document.createTextNode(run3));
      }
      run3 = "";
    }
  }
  function setActive(index, opts) {
    if (!ui || !flatItems.length) {
      activeIndex = 0;
      if (ui) ui.input.removeAttribute("aria-activedescendant");
      return;
    }
    const n = flatItems.length;
    activeIndex = (index % n + n) % n;
    const rows = ui.list.querySelectorAll(".jar-palette-item");
    rows.forEach((row) => {
      const on = Number(row.getAttribute("data-index")) === activeIndex;
      row.classList.toggle("is-active", on);
      row.setAttribute("aria-selected", on ? "true" : "false");
    });
    ui.input.setAttribute("aria-activedescendant", "jar-palette-opt-" + activeIndex);
    if (!opts || opts.scroll !== false) {
      const row = ui.list.querySelector(".jar-palette-item.is-active");
      if (row) row.scrollIntoView({ block: "nearest" });
    }
  }
  function runActive() {
    const item = flatItems[activeIndex];
    if (!item) return;
    close();
    try {
      item.run();
    } catch (err) {
      if (global10.console && console.error) console.error("[palette]", err);
      if (global10.Toasts && global10.Toasts.warn) {
        const msg = err && err.message ? String(err.message) : String(err);
        global10.Toasts.warn("Command failed: " + msg);
      }
    }
  }
  function open5(opts) {
    let mode = "anywhere";
    if (opts && opts.mode && MODE_PREFIX[opts.mode] != null && modeAvailable(opts.mode)) mode = opts.mode;
    if (!ui) buildUi();
    sessionId += 1;
    commandItemsCache = null;
    restoreFocusTo = document.activeElement;
    isOpen = true;
    ui.backdrop.classList.add("is-open");
    ui.panel.classList.add("is-open");
    ui.input.value = MODE_PREFIX[mode] + (opts && typeof opts.query === "string" ? opts.query : "");
    renderResults();
    ui.input.focus();
    const len = ui.input.value.length;
    try {
      ui.input.setSelectionRange(len, len);
    } catch (_) {
    }
  }
  function close() {
    if (!ui || !isOpen) return;
    isOpen = false;
    ui.backdrop.classList.remove("is-open");
    ui.panel.classList.remove("is-open");
    const back = restoreFocusTo;
    restoreFocusTo = null;
    if (back && typeof back.focus === "function" && document.contains(back)) back.focus();
  }
  function toggle2(opts) {
    if (isOpen) close();
    else open5(opts);
  }
  function runCommandEntry() {
    var style = Settings.get("keymapStyle");
    var line = typeof StatusStrip !== "undefined" && StatusStrip.openCommandLine;
    if (!line) return toggle2({ mode: "commands" });
    if (style === "emacs") return StatusStrip.openCommandLine("", { prompt: "M-x" });
    return StatusStrip.openCommandLine("");
  }
  var fallbackKeydown = null;
  function onFallbackKeydown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = (e.key || "").toLowerCase();
    if (key === "k" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      toggle2({ mode: "anywhere" });
    } else if (key === "p" && e.shiftKey && !e.altKey) {
      e.preventDefault();
      toggle2({ mode: "commands" });
    } else if (key === "o" && e.shiftKey && !e.altKey) {
      e.preventDefault();
      toggle2({ mode: "symbols" });
    } else if (key === "f" && e.shiftKey && !e.altKey) {
      e.preventDefault();
      toggle2({ mode: "search" });
    }
  }
  function dispose3() {
    close();
    if (fallbackKeydown) {
      window.removeEventListener("keydown", fallbackKeydown, true);
      fallbackKeydown = null;
    }
  }
  function init3() {
    dispose3();
    if (typeof Keybindings !== "undefined" && typeof Keybindings.initGlobals === "function") {
      Keybindings.initGlobals({
        "nav.anywhere": () => toggle2({ mode: "anywhere" }),
        "tools.commands": runCommandEntry,
        "nav.symbol": () => toggle2({ mode: "symbols" }),
        "edit.search-project": () => toggle2({ mode: "search" })
      }, {
        // ⛔ Everything else runs through the registry. These four need a
        // closure because they open a specific palette MODE; the other 63
        // global commands are ordinary ids, and without this they accepted a
        // chord in the Keybindings sheet and did nothing when pressed.
        //
        // Null when nothing is attached yet, so the chord falls through to the
        // browser rather than being swallowed by a handler that cannot act.
        fallback: (id) => {
          const cmd = Commands.get(id);
          if (!cmd || typeof cmd.run !== "function") return null;
          return () => Commands.run(id);
        }
      });
      return;
    }
    fallbackKeydown = onFallbackKeydown;
    window.addEventListener("keydown", fallbackKeydown, true);
  }
  function shortcutLabelFor(idOrSpec) {
    if (typeof Keybindings !== "undefined" && Keybindings.has(idOrSpec)) {
      return Keybindings.labelFor(idOrSpec);
    }
    return formatShortcut2(idOrSpec, IS_MAC2);
  }
  global10.CommandPalette = {
    register,
    dispose: dispose3,
    unregister: unregister2,
    setProvider,
    setModeMeta,
    modeAvailable,
    open: open5,
    close,
    toggle: toggle2,
    runCommandEntry,
    init: init3,
    isOpen: () => isOpen,
    /** Bumped on every `open()`. See the note there. */
    sessionId: () => sessionId,
    shortcutLabel: shortcutLabelFor,
    shortcutParts: (spec) => shortcutParts2(spec, IS_MAC2),
    listCommands,
    _pure: {
      fuzzyScore,
      parseInput,
      rankItems,
      formatShortcut: formatShortcut2,
      shortcutParts: shortcutParts2,
      parseLineQuery,
      substringPositions,
      HELP_CATALOG,
      MODE_PREFIX
    },
    _registry: { activeCommands }
  };

  // js/ui/double-tap.mjs
  var global11 = globalThis;
  var TRIGGERS = {
    off: null,
    shift: { key: "Shift", flag: "shiftKey" },
    control: { key: "Control", flag: "ctrlKey" },
    alt: { key: "Alt", flag: "altKey" }
  };
  var SPEEDS = { fast: 250, normal: 350, relaxed: 500 };
  var lastUpAt = 0;
  var sawOtherKey = false;
  var listening2 = false;
  function settings() {
    return {
      trigger: Settings.get("doubleTapTrigger"),
      target: Settings.get("doubleTapCommand"),
      windowMs: SPEEDS[Settings.get("doubleTapSpeed")] || SPEEDS.normal
    };
  }
  function shouldFire(state2) {
    const s = state2 || {};
    if (!s.trigger || s.trigger === "off") return false;
    if (s.repeat) return false;
    if (s.otherKeySeen) return false;
    if (s.otherModifier) return false;
    if (!(s.gap > 0)) return false;
    return s.gap <= s.windowMs;
  }
  function blockReason(state2) {
    const s = state2 || {};
    if (s.composing) return "composing";
    if (s.recordingChord) return "chord-recorder";
    if (s.modalOpen) return "modal";
    if (s.commandLineOpen) return "command-line";
    return "";
  }
  function blocked(e) {
    const doc2 = typeof document !== "undefined" ? document : null;
    const t = e && e.target || (doc2 ? doc2.activeElement : null);
    const B = global11.StatusStrip;
    return !!blockReason({
      composing: !!(e && (e.isComposing || e.keyCode === 229)),
      recordingChord: !!(t && t.classList && t.classList.contains("jar-kb__chord") && t.classList.contains("is-recording")),
      // A modal owns the screen; opening the palette behind or over it is wrong.
      // This also covers the settings search field, which lives inside one.
      modalOpen: !!(doc2 && doc2.querySelector("dialog[open]")),
      commandLineOpen: !!(B && typeof B.isCommandLineOpen === "function" && B.isCommandLineOpen())
    });
  }
  function otherModifierHeld(e, flag) {
    const held = [];
    if (e.shiftKey) held.push("shiftKey");
    if (e.ctrlKey) held.push("ctrlKey");
    if (e.altKey) held.push("altKey");
    if (e.metaKey) held.push("metaKey");
    return held.some((f) => f !== flag);
  }
  function onKeyDown(e) {
    const cfg = settings();
    const trigger = TRIGGERS[cfg.trigger];
    if (!trigger || e.key !== trigger.key) {
      sawOtherKey = true;
      return;
    }
    if (e.repeat) sawOtherKey = true;
  }
  function onKeyUp(e) {
    const cfg = settings();
    const trigger = TRIGGERS[cfg.trigger];
    if (!trigger || e.key !== trigger.key) return;
    const now = Date.now();
    const fire = shouldFire({
      trigger: cfg.trigger,
      repeat: !!e.repeat,
      otherKeySeen: sawOtherKey,
      otherModifier: otherModifierHeld(e, trigger.flag),
      gap: lastUpAt ? now - lastUpAt : 0,
      windowMs: cfg.windowMs
    });
    if (fire && !blocked(e)) {
      lastUpAt = 0;
      sawOtherKey = false;
      run2(cfg.target);
      return;
    }
    lastUpAt = now;
    sawOtherKey = false;
  }
  var PALETTE_OPENERS = /* @__PURE__ */ new Set([
    "tools.palette",
    "tools.commands",
    "nav.anywhere",
    "nav.symbol",
    "edit.search-project"
  ]);
  function resolveAction(id, paletteOpen) {
    if (!paletteOpen) return { close: false, run: id };
    if (PALETTE_OPENERS.has(id)) return { close: true, run: null };
    return { close: true, run: id };
  }
  function run2(id) {
    const C = global11.Commands;
    const P = global11.CommandPalette;
    const paletteOpen = !!(P && typeof P.isOpen === "function" && P.isOpen());
    const action = resolveAction(id, paletteOpen);
    if (action.close && P && typeof P.close === "function") P.close();
    if (action.run && C && typeof C.run === "function") C.run(action.run);
  }
  function init4() {
    if (listening2 || typeof global11.addEventListener !== "function") return false;
    listening2 = true;
    global11.addEventListener("keydown", onKeyDown, true);
    global11.addEventListener("keyup", onKeyUp, true);
    return true;
  }
  var GESTURE_TARGETS = [
    "tools.palette",
    "tools.commands",
    "nav.anywhere",
    "nav.symbol",
    "edit.search-project",
    "cmdline.open",
    "run.default",
    "view.harpoon",
    "keys.macros"
  ];
  global11.DoubleTap = {
    init: init4,
    shouldFire,
    targets: () => GESTURE_TARGETS.slice(),
    _pure: {
      TRIGGERS,
      SPEEDS,
      shouldFire,
      blockReason,
      resolveAction,
      PALETTE_OPENERS,
      GESTURE_TARGETS
    }
  };
  if (typeof document !== "undefined") init4();

  // js/commands/shared-commands.mjs
  var g16 = globalThis;
  function attachSharedCommands(page) {
    const say3 = page && typeof page.say === "function" ? page.say : () => {
    };
    const applied = page && typeof page.applied === "function" ? page.applied : () => {
    };
    const on = (id, run3, when) => Commands.attach(id, when ? { run: run3, when } : { run: run3 });
    const account = () => g16.Account || null;
    const sync = () => g16.Persist && typeof g16.Persist.syncSummary === "function" ? g16.Persist.syncSummary() : null;
    on("account.sign-in", () => account().signIn(), () => !!account() && account().available() && !account().user());
    on("account.sign-out", () => account().signOut(), () => !!account() && !!account().user());
    on("sync.now", () => g16.Persist.confirmSynced(), () => {
      const s = sync();
      return !!s && s.signedIn && s.state !== "offline" && s.state !== "held";
    });
    on("sync.review", () => g16.SyncUI.review(), () => {
      const s = sync();
      return !!s && s.differs.length > 0;
    });
    on("sync.review-offline", () => g16.SyncUI.reviewOffline(), () => {
      const s = sync();
      return !!s && s.state === "held";
    });
    on("view.theme", () => g16.Frame.toggleTheme());
    on("app.report-issue", () => Routes.reportIssue());
    on("tools.palette", () => g16.CommandPalette.open());
    for (const spec of SETTINGS2) {
      const id = settingId(spec.slug);
      if (!Commands.runsHere(id)) continue;
      on(id, () => {
        const res = applyValue(g16.Settings, spec, void 0);
        if (res.applied) applied(spec);
        say3(res.message);
        return res.ok;
      }, spec.needs === "server" ? serverAnswers : void 0);
    }
  }

  // js/home/home-commands.mjs
  var g17 = globalThis;
  function attachHomeCommands(home) {
    const palette = g17.CommandPalette;
    palette.init();
    attachSharedCommands({ say: home.say });
    const on = (id, run3, when) => Commands.attach(id, when ? { run: run3, when } : { run: run3 });
    on("project.new", () => home.newProject());
    on("file.import-folder", () => home.pickFolder());
    on("app.reload", () => g17.location.reload());
    palette.setProvider("files", () => home.projects().map((p) => ({
      title: p.name,
      detail: p.detail,
      section: "Projects",
      run: () => Routes.go(Routes.editUrl(p.id))
    })));
    palette.setModeMeta("anywhere", {
      label: "Projects",
      placeholder: "Go to a project, or > for a command\u2026",
      helpTitle: "Projects",
      helpDetail: "Go to a project"
    });
  }

  // js/home/preload-editor.mjs
  var g18 = typeof window !== "undefined" ? window : globalThis;
  function scriptsOf(html) {
    return [...String(html || "").replace(/<!--[\s\S]*?-->/g, "").matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  }
  function mayPreload(nav) {
    const c = nav && nav.connection;
    return !(c && c.saveData);
  }
  async function preloadEditor(env) {
    const doc2 = env && env.document || g18.document;
    const fetchFn = env && env.fetch || g18.fetch;
    const nav = env && env.navigator || g18.navigator;
    const base = env && env.base || g18.location && g18.location.href;
    if (!doc2 || typeof fetchFn !== "function" || !base || !mayPreload(nav)) return [];
    let html;
    let at;
    try {
      at = new URL(Routes.editUrl(), base);
      const res = await fetchFn(at.href, { credentials: "same-origin" });
      if (!res || !res.ok) return [];
      html = await res.text();
    } catch (_) {
      return [];
    }
    const asked2 = [];
    for (const src of scriptsOf(html)) {
      let url;
      try {
        url = new URL(src, at);
      } catch (_) {
        continue;
      }
      if (url.origin !== at.origin) continue;
      const link = doc2.createElement("link");
      link.rel = "prefetch";
      link.as = "script";
      link.href = url.href;
      doc2.head.appendChild(link);
      asked2.push(url.href);
    }
    return asked2;
  }
  function preloadEditorWhenIdle() {
    const run3 = () => {
      preloadEditor();
    };
    if (typeof g18.requestIdleCallback === "function") g18.requestIdleCallback(run3, { timeout: 3e3 });
    else setTimeout(run3, 1200);
  }

  // js/home/home.mjs
  var g19 = typeof window !== "undefined" ? window : globalThis;
  var OPEN_WAIT_MS = 8e3;
  function orderProjects(projects, last, statsOf) {
    const at = new Map(projects.map((p) => [p.id, statsOf(p.id).editedAt || 0]));
    return projects.slice().sort((a, b) => {
      if (a.id === last !== (b.id === last)) return a.id === last ? -1 : 1;
      return at.get(b.id) - at.get(a.id) || String(a.name).localeCompare(String(b.name)) || (a.id < b.id ? -1 : 1);
    });
  }
  function reviewWord(n) {
    return n === 1 ? "1 file to review" : n + " files to review";
  }
  function whenEdited(ms, now = Date.now()) {
    if (!ms) return "";
    const s = Math.max(0, Math.round((now - ms) / 1e3));
    if (s < 45) return "Just now";
    const m = Math.round(s / 60);
    if (m < 60) return m === 1 ? "1 minute ago" : m + " minutes ago";
    const then = new Date(ms);
    const today = new Date(now);
    const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const days = Math.ceil((midnight - ms) / 864e5);
    if (days <= 0) {
      const h = Math.round(m / 60);
      return h === 1 ? "1 hour ago" : h + " hours ago";
    }
    if (days === 1) return "Yesterday";
    if (days < 7) return days + " days ago";
    const opts = then.getFullYear() === today.getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" };
    return then.toLocaleDateString([], opts);
  }
  function homeMode(o) {
    if (o.count > 0) return "returning";
    return o.arriving ? "arriving" : "first";
  }
  function findsByTyping(key) {
    return typeof key === "string" && /^[\p{L}\p{N}]$/u.test(key);
  }
  function listMove(e, style) {
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    if (plain && e.key === "ArrowDown") return 1;
    if (plain && e.key === "ArrowUp") return -1;
    if (style === "vim" && plain && !e.shiftKey) {
      if (e.key === "j") return 1;
      if (e.key === "k") return -1;
    }
    if (style === "emacs" && e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === "n" || e.key === "m") return 1;
      if (e.key === "p") return -1;
    }
    return 0;
  }
  function pendingStep(o) {
    if (o.here) return "open";
    if (o.timedOut || o.accountKnown && !o.signedIn) return "up";
    if (o.signedIn && o.roundDone) return "up";
    return "wait";
  }
  function listArriving(o) {
    if (o.count > 0 || o.timedOut) return false;
    if (!o.accountKnown) return true;
    if (!o.signedIn) return false;
    return o.state === "syncing" && !(o.lastSync > 0);
  }
  var ACCOUNT_WAIT_MS = 2500;
  var SIGN_IN_HINT = "sign-in";
  var SIGN_IN_HINT_TEXT = "Sign in with GitHub to keep your projects on every device.";
  function signInHintDue(o) {
    return !!(o && o.accountKnown && o.available && !o.signedIn && !o.unreachable && !o.seen);
  }
  var drawn = null;
  var renderQueued = false;
  var pending = null;
  var accountKnown = false;
  var folderInput = null;
  var mountedAt = 0;
  var unfocused = false;
  function el4(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function toast2(message, kind) {
    const T = g19.Toasts;
    if (!T) return;
    if (kind === "warn" && typeof T.warn === "function") T.warn(message);
    else if (typeof T.show === "function") T.show(message);
  }
  function conflictsByProject() {
    const out = /* @__PURE__ */ new Map();
    for (const c of g19.Persist.listConflicts()) out.set(c.pid, (out.get(c.pid) || 0) + 1);
    return out;
  }
  async function newProject() {
    const P = g19.Persist;
    const NP = g19.NamePrompt;
    const name = await NP.open({
      ariaLabel: "New project",
      message: "New project",
      value: P.DEFAULT_PROJECT_NAME,
      selection: { start: 0, end: P.DEFAULT_PROJECT_NAME.length },
      normalize: NP.defaultNormalize,
      validate: (n) => n ? null : "Name is required.",
      confirmLabel: "Create"
    });
    if (name === null) return;
    const pid = P.createProject(String(name).trim() || P.DEFAULT_PROJECT_NAME);
    if (!pid) {
      toast2("Couldn\u2019t create the project: storage is full.", "warn");
      return;
    }
    Routes.go(Routes.editUrl(pid));
  }
  function pickFolder() {
    if (!folderInput) {
      folderInput = document.createElement("input");
      folderInput.type = "file";
      folderInput.webkitdirectory = true;
      folderInput.style.display = "none";
      document.body.appendChild(folderInput);
      folderInput.addEventListener("change", async () => {
        const all = Array.from(folderInput.files || []);
        folderInput.value = "";
        if (!all.length) return;
        const plan = await folderAsProject(all);
        if (!plan) {
          toast2("No .bel files in that folder.", "warn");
          return;
        }
        const pid = createImportedProject(plan);
        if (!pid) {
          toast2("Couldn\u2019t import the folder: storage is full.", "warn");
          return;
        }
        Routes.go(Routes.editUrl(pid));
      });
    }
    folderInput.click();
  }
  async function renameProject(p) {
    const NP = g19.NamePrompt;
    const next = await NP.open({
      ariaLabel: "Rename project",
      message: "Rename project",
      value: p.name,
      normalize: NP.defaultNormalize,
      validate: (n) => n ? null : "Name is required.",
      confirmLabel: "Save"
    });
    if (next !== null && next !== p.name) {
      g19.Persist.renameProject(p.id, next);
      render4();
    }
    afterDialog(() => focusRow(p.id));
  }
  function downloadProject(p) {
    const src = g19.Persist.projectFiles(p.id);
    if (!src || !g19.DownloadZip) return;
    const archive = g19.DownloadZip.projectArchive(src.name, src.files, src.folders);
    g19.DownloadZip.downloadZip(archive.entries, archive.fileName);
  }
  async function deleteProject(p) {
    const yes = await g19.ConfirmDialog.confirm({
      subject: p.name,
      message: "Delete this project and all of its files?",
      ariaLabel: "Delete project"
    });
    if (!yes) {
      afterDialog(() => focusRow(p.id));
      return;
    }
    const at = rowLinks().findIndex((a) => a.closest(".home-row").dataset.pid === p.id);
    g19.Persist.removeProject(p.id);
    render4();
    afterDialog(() => {
      const left = rowLinks();
      if (left.length) left[Math.min(Math.max(at, 0), left.length - 1)].focus();
      else focusFirstAction();
    });
  }
  function rowMenu(p) {
    return [
      { label: "Open", onSelect: () => Routes.go(Routes.editUrl(p.id)) },
      { label: "Rename\u2026", onSelect: () => renameProject(p) },
      { label: "Download", onSelect: () => downloadProject(p) },
      { type: "separator" },
      { label: "Delete\u2026", onSelect: () => deleteProject(p) }
    ];
  }
  var ICONS = {
    more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.4a1.5 1.5 0 0 1 1.1.5L11.5 8h8A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z"/><path d="M12 11.25v4.5"/><path d="m10 13.9 2 1.95 2-1.95"/></svg>',
    // The editor's own Library glyph (edit.html #btn-library): the same place, from here.
    library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M3.5 8v12.25a1.75 1.75 0 0 0 1.75 1.75h14a1.75 1.75 0 0 0 1.75-1.75V8"/><path d="m8.65 12.6-2.2 2.1 2.2 2.1"/><path d="m15.35 12.6 2.2 2.1-2.2 2.1"/><path d="m12.85 11.6-1.7 6"/></svg>'
  };
  var START = [
    { id: "new", label: "New project", icon: "plus", run: () => newProject() },
    { id: "import", label: "Import folder", icon: "folder", run: () => pickFolder() },
    { id: "examples", label: "Browse examples", icon: "library", run: () => Routes.go(Routes.editUrl() + "#library") }
  ];
  var LINKS = [
    { label: "Beluga", href: "https://www.cs.mcgill.ca/~complogic/beluga/" },
    { label: "Email me", href: CONTACT_URL, here: true },
    { label: "GitHub", href: "https://github.com/dpbarry/bel-jar" },
    { label: "Privacy", href: Routes.privacyUrl(), here: true }
  ];
  function rowLinks() {
    return Array.from(document.querySelectorAll("#home .home-row__open"));
  }
  function focusRow(pid) {
    const row = document.querySelector('#home .home-row[data-pid="' + pid + '"] .home-row__open');
    if (row) row.focus();
  }
  function afterDialog(fn) {
    let tries = 0;
    const look = () => {
      if (document.querySelector("dialog[open]") && tries++ < 40) setTimeout(look, 25);
      else fn();
    };
    setTimeout(look, 0);
  }
  function focusFirstAction() {
    const btn = document.querySelector("#home-actions .home-tile");
    if (btn) btn.focus();
  }
  function rowNode(p, stats, review) {
    const li = el4("li", "home-row");
    li.dataset.pid = p.id;
    const a = el4("a", "home-row__open");
    a.href = Routes.editUrl(p.id);
    a.appendChild(el4("span", "home-row__name", p.name));
    if (review) a.appendChild(el4("span", "home-row__mark", reviewWord(review)));
    a.appendChild(el4("span", "home-row__when", whenEdited(stats.editedAt)));
    li.appendChild(a);
    const more = el4("button", "icon-btn home-row__more");
    more.type = "button";
    more.innerHTML = ICONS.more;
    more.setAttribute("aria-label", "More for " + p.name);
    more.setAttribute("aria-haspopup", "menu");
    more.setAttribute("aria-expanded", "false");
    wireMenuTrigger(more, { side: "bottom", align: "end", items: () => rowMenu(p) });
    li.appendChild(more);
    return li;
  }
  function emptyRow() {
    const li = el4("li", "home-row home-row--empty");
    const line = el4("span", "home-row__open");
    line.appendChild(el4("span", "home-row__name", "No projects"));
    li.appendChild(line);
    return li;
  }
  function startNodes() {
    return START.map((s) => {
      const btn = el4("button", "home-tile");
      btn.type = "button";
      btn.dataset.action = s.id;
      const glyph = el4("span", "home-tile__icon");
      glyph.setAttribute("aria-hidden", "true");
      glyph.innerHTML = ICONS[s.icon];
      btn.append(glyph, el4("span", "home-tile__label", s.label));
      btn.addEventListener("click", s.run);
      return btn;
    });
  }
  function linkNodes() {
    return LINKS.map((l) => {
      const a = el4("a", "home-link", l.label);
      a.href = l.href;
      if (l.here) return a;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      return a;
    });
  }
  function findNodes(chord) {
    const nodes = [el4("span", null, "Search")];
    if (chord) nodes.push(el4("kbd", "home-kbd", chord));
    return nodes;
  }
  function drawFixed() {
    const actions = document.getElementById("home-actions");
    if (actions && !actions.childElementCount) actions.append(...startNodes());
    const links = document.getElementById("home-links");
    if (links && !links.childElementCount) links.append(...linkNodes());
  }
  function drawFind() {
    const btn = document.getElementById("home-find");
    if (!btn) return;
    btn.hidden = !g19.CommandPalette;
    if (btn.hidden) return;
    const KB = g19.Keybindings;
    const chord = KB && typeof KB.labelFor === "function" && KB.labelFor("nav.anywhere") || "";
    if (btn.childElementCount && btn.dataset.chord === chord) return;
    btn.dataset.chord = chord;
    btn.replaceChildren(...findNodes(chord));
  }
  function offerSignInHint() {
    const A = g19.Account;
    const Hint = g19.Hint;
    const eligible = signInHintDue({
      accountKnown,
      available: !!(A && A.available()),
      signedIn: !!(A && A.user()),
      unreachable: !!(A && A.unreachable()),
      seen: false
    });
    if (!eligible) {
      if (Hint && Hint.isVisible && Hint.isVisible(SIGN_IN_HINT)) Hint.dismiss(SIGN_IN_HINT);
      return;
    }
    if (!Hint || !Hint.show) return;
    if (Hint.isVisible && Hint.isVisible(SIGN_IN_HINT)) return;
    if (Hint.wasDismissed && Hint.wasDismissed(SIGN_IN_HINT)) return;
    const anchor = document.getElementById("btn-account");
    if (!anchor) return;
    const box = anchor.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    Hint.show({
      id: SIGN_IN_HINT,
      anchor,
      text: SIGN_IN_HINT_TEXT,
      side: "below",
      align: "end",
      wait: false,
      onClick: () => anchor.click()
    });
  }
  function drawRisk() {
    const note = document.getElementById("home-risk");
    if (!note) return;
    const P = g19.Persist;
    const atRisk = !!(P.durabilityStatus && P.durabilityStatus().atRisk);
    note.hidden = !atRisk;
    if (atRisk) {
      const A = g19.Account;
      note.textContent = A && A.available() && !A.user() ? "Safari deletes this site\u2019s data after 7 days without a visit. Sign in, or download your projects, to keep them." : "Safari deletes this site\u2019s data after 7 days without a visit. Download your projects to keep a copy.";
    }
  }
  function render4() {
    const P = g19.Persist;
    const main = document.getElementById("home");
    const list3 = document.getElementById("home-list");
    if (!P || !main || !list3) return;
    const active = document.activeElement;
    const focused = active && active.closest ? active.closest(".home-row") : null;
    const focusedPid = focused ? focused.dataset.pid : null;
    const onMore = !!(focused && active.classList.contains("home-row__more"));
    const projects = P.projects();
    const review = conflictsByProject();
    const stats = new Map(projects.map((p) => [p.id, P.projectStats(p.id)]));
    const ordered = orderProjects(projects, P.lastProjectId(), (id) => stats.get(id));
    const sync = P.syncSummary();
    const mode = homeMode({
      count: projects.length,
      arriving: listArriving({
        count: projects.length,
        accountKnown,
        signedIn: !!(g19.Account && g19.Account.user()),
        state: sync.state,
        lastSync: sync.lastSync,
        timedOut: Date.now() - mountedAt >= (accountKnown ? OPEN_WAIT_MS : ACCOUNT_WAIT_MS)
      })
    });
    const says = JSON.stringify([mode, ordered.map((p) => [p.id, p.name, whenEdited(stats.get(p.id).editedAt), review.get(p.id) || 0])]);
    if (says !== drawn) {
      drawn = says;
      main.dataset.mode = mode;
      list3.replaceChildren(...ordered.length ? ordered.map((p) => rowNode(p, stats.get(p.id), review.get(p.id) || 0)) : mode === "arriving" ? [] : [emptyRow()]);
      const section = document.getElementById("home-projects-section");
      if (section) section.hidden = mode === "arriving";
    }
    drawFixed();
    drawFind();
    offerSignInHint();
    drawRisk();
    if (focusedPid) {
      const again = main.querySelector('.home-row[data-pid="' + focusedPid + '"] ' + (onMore ? ".home-row__more" : ".home-row__open"));
      if (again) again.focus();
    } else if (unfocused && mode !== "arriving" && !pending && (!document.activeElement || document.activeElement === document.body)) {
      unfocused = false;
      focusStart();
    }
    settlePending();
  }
  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(() => {
      renderQueued = false;
      if (g19.Menu && g19.Menu.isOpen() || document.querySelector("dialog[open]")) {
        setTimeout(queueRender, 300);
        return;
      }
      render4();
    }, 30);
  }
  function settlePending() {
    if (!pending || pending.gaveUp) return;
    const P = g19.Persist;
    const A = g19.Account;
    const signedIn = !!(A && A.user());
    if (signedIn && !pending.asked) {
      pending.asked = true;
      const waiting2 = pending;
      P.confirmSynced(OPEN_WAIT_MS).then((res) => {
        if (res && res.reason === "not-syncing") return;
        waiting2.roundDone = true;
        queueRender();
      });
    }
    const step = pendingStep({
      here: P.projects().some((p) => p.id === pending.pid),
      accountKnown,
      signedIn,
      roundDone: !!pending.roundDone,
      timedOut: Date.now() - pending.since >= OPEN_WAIT_MS
    });
    const note = document.getElementById("home-waiting");
    if (step === "open") {
      Routes.go(Routes.editUrl(pending.pid), { replace: true });
      pending.gaveUp = true;
      return;
    }
    if (step === "wait") {
      if (note) {
        note.hidden = false;
        note.textContent = "Opening your project\u2026";
      }
      return;
    }
    pending.gaveUp = true;
    Routes.settle(Routes.homeUrl());
    if (note) {
      note.hidden = false;
      note.textContent = "That project isn\u2019t in this browser.";
    }
  }
  function keymapStyle() {
    return g19.Settings ? g19.Settings.get("keymapStyle") : "default";
  }
  function onListKey(e) {
    const link = e.target && e.target.closest ? e.target.closest(".home-row__open") : null;
    if (!link) return;
    const links = rowLinks();
    const at = links.indexOf(link);
    const row = link.closest(".home-row");
    const p = g19.Persist.projects().find((x) => x.id === row.dataset.pid);
    const move = listMove(e, keymapStyle());
    if (move) {
      e.preventDefault();
      const next = links[Math.min(Math.max(at + move, 0), links.length - 1)];
      if (next) next.focus();
      return;
    }
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    if (plain && e.key === "Home") {
      e.preventDefault();
      links[0].focus();
      return;
    }
    if (plain && e.key === "End") {
      e.preventDefault();
      links[links.length - 1].focus();
      return;
    }
    if (!p) return;
    if (plain && e.key === "F2") {
      e.preventDefault();
      renameProject(p);
      return;
    }
    if (plain && e.key === "Delete") {
      e.preventDefault();
      deleteProject(p);
      return;
    }
    if (e.key === "ContextMenu" || e.shiftKey && e.key === "F10") {
      e.preventDefault();
      row.querySelector(".home-row__more").click();
      return;
    }
    if (plain && findsByTyping(e.key) && g19.CommandPalette) {
      e.preventDefault();
      g19.CommandPalette.open({ query: e.key });
    }
  }
  var NEWS_MS = 4e3;
  var newsTimer = null;
  function say2(text) {
    const line = document.getElementById("home-news");
    if (!line || !text) return;
    line.textContent = String(text);
    line.hidden = false;
    clearTimeout(newsTimer);
    newsTimer = setTimeout(() => {
      line.hidden = true;
    }, NEWS_MS);
  }
  function paletteProjects() {
    const P = g19.Persist;
    const projects = P.projects();
    const stats = new Map(projects.map((p) => [p.id, P.projectStats(p.id)]));
    return orderProjects(projects, P.lastProjectId(), (id) => stats.get(id)).map((p) => ({
      id: p.id,
      name: p.name,
      detail: whenEdited(stats.get(p.id).editedAt)
    }));
  }
  function focusStart() {
    const first = rowLinks()[0];
    if (first) first.focus();
    else focusFirstAction();
  }
  function mount2() {
    const P = g19.Persist;
    if (!P || !document.getElementById("home-list")) return;
    if (g19.BELJAR_LEAVING) return;
    if (g19.Frame) g19.Frame.mount();
    attachHomeCommands({ newProject, pickFolder, projects: paletteProjects, say: say2 });
    const accountBtn = document.getElementById("btn-account");
    if (accountBtn) {
      const hideSignInHint = () => {
        if (g19.Hint && g19.Hint.isVisible && g19.Hint.isVisible(SIGN_IN_HINT)) g19.Hint.dismiss(SIGN_IN_HINT);
      };
      accountBtn.addEventListener("pointerdown", hideSignInHint);
      accountBtn.addEventListener("click", hideSignInHint);
    }
    wireMenuTrigger(accountBtn, {
      side: "bottom",
      align: "end",
      items: () => g19.Account ? g19.Account.menuItems() : []
    });
    wireMenuTrigger(document.getElementById("btn-sync"), {
      side: "bottom",
      align: "end",
      items: () => g19.SyncUI ? g19.SyncUI.menuItems() : []
    });
    const wanted = Routes.pendingOf(g19.location);
    if (wanted) pending = { pid: wanted, since: Date.now(), gaveUp: false, asked: false, roundDone: false };
    mountedAt = Date.now();
    render4();
    if (!pending) focusStart();
    unfocused = !document.activeElement || document.activeElement === document.body;
    setTimeout(render4, ACCOUNT_WAIT_MS + 50);
    setTimeout(render4, OPEN_WAIT_MS + 50);
    const find = document.getElementById("home-find");
    if (find) find.addEventListener("click", () => {
      if (g19.CommandPalette) g19.CommandPalette.open();
    });
    const home = document.getElementById("home");
    document.addEventListener("keydown", () => {
      home.dataset.keys = "";
    }, { capture: true, once: true });
    home.addEventListener("keydown", onListKey);
    home.addEventListener("contextmenu", (e) => {
      const row = e.target && e.target.closest ? e.target.closest(".home-row") : null;
      if (!row) return;
      e.preventDefault();
      row.querySelector(".home-row__more").click();
    });
    home.addEventListener("click", (e) => {
      const link = e.target && e.target.closest ? e.target.closest(".home-row__open") : null;
      if (!link || e.defaultPrevented || e.button > 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      link.closest(".home-row").setAttribute("data-opening", "");
    });
    P.onProjectsChange(queueRender);
    P.onSyncSummary(queueRender);
    g19.addEventListener("beljar:account", () => {
      accountKnown = true;
      queueRender();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") queueRender();
    });
    setTimeout(queueRender, 4e3);
    preloadEditorWhenIdle();
  }
  var Home = { mount: mount2, render: render4, say: say2 };
  g19.Home = Home;
  if (typeof document !== "undefined") {
    if (document.getElementById("home-list")) mount2();
    else document.addEventListener("DOMContentLoaded", mount2, { once: true });
  }
})();
