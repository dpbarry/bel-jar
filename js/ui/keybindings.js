"use strict";
(() => {
  // js/ui/keybindings.mjs
  var global = globalThis;
  var IS_MAC = typeof navigator !== "undefined" && /Mac/.test(navigator.platform || "");
  var DEFAULTS = [
    { id: "nav.anywhere", title: "Go to File\u2026", section: "Navigate", scope: "global", defaultSpec: "Mod+K" },
    { id: "tools.commands", title: "Run Command\u2026", section: "Tools", scope: "global", defaultSpec: "Mod+Shift+P" },
    { id: "nav.symbol", title: "Go to Symbol\u2026", section: "Navigate", scope: "global", defaultSpec: "Mod+Shift+O" },
    { id: "edit.search-project", title: "Search in Project\u2026", section: "Edit", scope: "global", defaultSpec: "Mod+Shift+F" },
    { id: "edit.undo", title: "Undo", section: "Edit", scope: "editor", defaultSpec: "Mod+Z" },
    { id: "edit.redo", title: "Redo", section: "Edit", scope: "editor", defaultSpec: "Mod+Y", macDefaultSpec: "Mod+Shift+Z" },
    { id: "edit.find", title: "Find\u2026", section: "Edit", scope: "editor", defaultSpec: "Mod+F" },
    { id: "edit.toggle-comment", title: "Toggle Line Comment", section: "Edit", scope: "editor", defaultSpec: "Mod+/" },
    { id: "edit.format", title: "Format Document", section: "Edit", scope: "editor", defaultSpec: "Alt+Shift+F" },
    { id: "edit.rename", title: "Rename Symbol", section: "Edit", scope: "editor", defaultSpec: "F2" },
    { id: "edit.select-all", title: "Select All", section: "Edit", scope: "editor", defaultSpec: "Mod+A" },
    { id: "nav.definition", title: "Go to Definition", section: "Navigate", scope: "editor", defaultSpec: "F12" },
    { id: "nav.references", title: "Find References", section: "Navigate", scope: "editor", defaultSpec: "Shift+F12" },
    { id: "nav.next-hole", title: "Go to Next Hole", section: "Navigate", scope: "editor", defaultSpec: "F8" },
    { id: "nav.prev-hole", title: "Go to Previous Hole", section: "Navigate", scope: "editor", defaultSpec: "Shift+F8" }
  ];
  var BY_ID = /* @__PURE__ */ Object.create(null);
  for (i = 0; i < DEFAULTS.length; i++) BY_ID[DEFAULTS[i].id] = DEFAULTS[i];
  var i;
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
  var SECTION_ORDER = ["Edit", "Navigate", "Tools"];
  var globalHandlers = /* @__PURE__ */ Object.create(null);
  var listening = false;
  function persistApi() {
    return global.Persist || null;
  }
  function readOverrides() {
    var p = persistApi();
    if (!p || typeof p.readStoredKeybindings !== "function") return {};
    var o = p.readStoredKeybindings();
    return o && typeof o === "object" ? o : {};
  }
  function writeOverrides(map) {
    var p = persistApi();
    if (p && typeof p.writeStoredKeybindings === "function") p.writeStoredKeybindings(map);
  }
  function notifyChanged() {
    try {
      if (typeof global.CustomEvent === "function") {
        global.dispatchEvent(new global.CustomEvent("beljar:keybindings-changed", { detail: {} }));
      } else if (typeof global.dispatchEvent === "function") {
        global.dispatchEvent({ type: "beljar:keybindings-changed", detail: {} });
      }
    } catch (_) {
    }
  }
  function formatShortcutPart(part, isMac) {
    if (part === "Mod") return isMac ? "\u2318" : "Ctrl";
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
    var shift = false;
    var alt = false;
    var key = "";
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var pl = p.toLowerCase();
      if (pl === "mod" || pl === "ctrl" || pl === "control" || pl === "meta" || pl === "cmd" || p === "\u2318") mod = true;
      else if (pl === "shift" || p === "\u21E7") shift = true;
      else if (pl === "alt" || pl === "option" || p === "\u2325") alt = true;
      else key = normalizeKeyToken(p);
    }
    if (!key) return "";
    var out = [];
    if (mod) out.push("Mod");
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
  function resolve(id, isMac) {
    var def = BY_ID[id];
    if (!def) return null;
    var overrides = readOverrides();
    if (Object.prototype.hasOwnProperty.call(overrides, id)) {
      var ov = overrides[id];
      if (isUnboundSentinel(ov)) return null;
      return normalizeSpec(ov) || null;
    }
    return platformDefaultSpec(def, isMac) || null;
  }
  function isUserOverride(id) {
    var overrides = readOverrides();
    return Object.prototype.hasOwnProperty.call(overrides, id);
  }
  function has(id) {
    return !!BY_ID[id];
  }
  function labelFor(id, isMac) {
    return formatShortcut(resolve(id, isMac), isMac);
  }
  function list(isMac) {
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
    for (var i = 0; i < parts.length - 1; i++) {
      if (parts[i] === "Mod") hasMod = true;
      if (parts[i] === "Alt") hasAlt = true;
    }
    if (hasMod || hasAlt) return false;
    if (isFunctionKey(key)) return false;
    return true;
  }
  function titleFor(id) {
    var def = BY_ID[id];
    return def ? def.title : "";
  }
  function findConflict(spec, exceptId) {
    var n = normalizeSpec(spec);
    if (!n) return null;
    for (var i = 0; i < DEFAULTS.length; i++) {
      var def = DEFAULTS[i];
      if (exceptId && def.id === exceptId) continue;
      var r = resolve(def.id);
      if (r && normalizeSpec(r) === n) return def.id;
    }
    return null;
  }
  function setBinding(id, spec) {
    if (!BY_ID[id]) return { ok: false, reason: "unknown" };
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
    var def = BY_ID[id];
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
    if (!BY_ID[id]) return { ok: false, reason: "unknown" };
    var map = readOverrides();
    delete map[id];
    writeOverrides(map);
    notifyChanged();
    return { ok: true };
  }
  function resetAll() {
    var p = persistApi();
    if (p && typeof p.resetKeybindingPrefs === "function") p.resetKeybindingPrefs();
    else writeOverrides({});
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
    if (e.ctrlKey || e.metaKey) parts.push("Mod");
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
    if (!!want.Mod !== hasMod) return false;
    if (!!want.Alt !== hasAlt) return false;
    if (!!want.Shift !== hasShift) return false;
    var got = normalizeKeyToken(e.key);
    return got === wantKey;
  }
  function toCmKey(spec) {
    var n = normalizeSpec(spec);
    if (!n) return "";
    return n.split("+").map(function(part, idx, arr) {
      if (part === "Mod" || part === "Shift" || part === "Alt") return part;
      if (idx === arr.length - 1 && part.length === 1) return part.toLowerCase();
      return part;
    }).join("-");
  }
  function freedDefaultsForScope(scope) {
    var freed = [];
    var claimed = /* @__PURE__ */ Object.create(null);
    for (var i = 0; i < DEFAULTS.length; i++) {
      var def = DEFAULTS[i];
      if (def.scope !== scope) continue;
      var resolved = resolve(def.id);
      if (resolved) claimed[normalizeSpec(resolved)] = def.id;
    }
    for (var j = 0; j < DEFAULTS.length; j++) {
      var d = DEFAULTS[j];
      if (d.scope !== scope) continue;
      var plat = platformDefaultSpec(d);
      if (!plat) continue;
      var cur = resolve(d.id);
      if (normalizeSpec(cur) === plat) continue;
      if (claimed[plat]) continue;
      freed.push(plat);
      claimed[plat] = d.id;
    }
    return freed;
  }
  function buildEditorKeymap(runById) {
    var entries = [];
    var seen = /* @__PURE__ */ Object.create(null);
    var runners = runById || {};
    for (var i = 0; i < DEFAULTS.length; i++) {
      var def = DEFAULTS[i];
      if (def.scope !== "editor") continue;
      var spec = resolve(def.id);
      if (!spec) continue;
      var cm = toCmKey(spec);
      if (!cm || seen[cm]) continue;
      seen[cm] = true;
      (function(commandId) {
        entries.push({
          key: cm,
          run: function(view) {
            var fn = runners[commandId];
            if (typeof fn !== "function") return false;
            return !!fn(view);
          }
        });
      })(def.id);
    }
    var freed = freedDefaultsForScope("editor");
    for (var f = 0; f < freed.length; f++) {
      var fcm = toCmKey(freed[f]);
      if (!fcm || seen[fcm]) continue;
      seen[fcm] = true;
      entries.push({ key: fcm, run: function() {
        return true;
      } });
    }
    return entries;
  }
  function isRecordingChordTarget(e) {
    var t = e && e.target || (typeof document !== "undefined" ? document.activeElement : null);
    return !!(t && t.classList && t.classList.contains("bj-kb__chord") && t.classList.contains("is-recording"));
  }
  function onGlobalKeydown(e) {
    if (e.isComposing) return;
    if (isRecordingChordTarget(e)) return;
    var freed = freedDefaultsForScope("global");
    for (var fi = 0; fi < freed.length; fi++) {
      if (eventMatchesSpec(e, freed[fi])) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    for (var i = 0; i < DEFAULTS.length; i++) {
      var def = DEFAULTS[i];
      if (def.scope !== "global") continue;
      var spec = resolve(def.id);
      if (!spec || !eventMatchesSpec(e, spec)) continue;
      var handler = globalHandlers[def.id];
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
  function initGlobals(handlers) {
    if (handlers && typeof handlers === "object") {
      Object.keys(handlers).forEach(function(id) {
        globalHandlers[id] = handlers[id];
      });
    }
    if (listening) return;
    listening = true;
    global.addEventListener("keydown", onGlobalKeydown, true);
  }
  function setGlobalHandler(id, fn) {
    globalHandlers[id] = fn;
  }
  global.Keybindings = {
    DEFAULTS,
    IS_MAC,
    has,
    list,
    resolve,
    labelFor,
    isUserOverride,
    platformDefaultSpec: function(id, isMac) {
      return platformDefaultSpec(BY_ID[id], isMac);
    },
    normalizeSpec,
    formatShortcut,
    shortcutParts,
    specFromEvent,
    eventMatchesSpec,
    isBrowserReserved,
    isReservedSequence,
    titleFor,
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
    _pure: {
      normalizeSpec,
      formatShortcut,
      shortcutParts,
      platformDefaultSpec,
      isBrowserReserved,
      isReservedSequence,
      toCmKey,
      specFromEvent,
      DEFAULTS,
      RESERVED
    }
  };
  global.BelJarKeybindings = global.Keybindings;
})();
