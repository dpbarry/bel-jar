'use strict';

/**
 * BelJar keybinding resolver — defaults, user overrides, reserved/conflict
 * checks, global dispatch, and CodeMirror keymap building for the bound set.
 *
 * The bindable set is a PROJECTION of the command registry (`keybindable: true`
 * entries), not a list of its own — one catalogue, one truth. Everything below
 * still works in specs, not commands.
 */
import { Commands } from '../commands/command-registry.mjs';
import { isEmacsEditorFocused as isEmacsFocused } from '../commands/command-context.mjs';

const global = globalThis;
var IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || '');

  // Mutated in place, never reassigned: `Keybindings.DEFAULTS` hands this array
  // out and callers hold the reference.
  var DEFAULTS = [];
  var BY_ID = Object.create(null);
  var projectedVersion = -1;

  /** Re-project only when the registry has actually changed. */
  function syncDefaults() {
    var v = Commands.version();
    if (v === projectedVersion) return;
    projectedVersion = v;
    var next = Commands.defaults();
    DEFAULTS.length = 0;
    for (var k in BY_ID) delete BY_ID[k];
    for (var i = 0; i < next.length; i++) {
      DEFAULTS.push(next[i]);
      BY_ID[next[i].id] = next[i];
    }
  }

  syncDefaults();

  /** Browser / OS chords that must not be claimed. Normalized Mod+… form. */
  var RESERVED = {
    'Mod+T': 1,
    'Mod+N': 1,
    'Mod+W': 1,
    'Mod+Q': 1,
    'Mod+Shift+T': 1,
    'Mod+Shift+N': 1,
    'Mod+Shift+W': 1,
    'Mod+L': 1,
    'Mod+Shift+Delete': 1,
    'Alt+F4': 1,
  };

  // Mirrors the catalogue's section order so the sheet and the palette read alike.
  var SECTION_ORDER = ['File', 'Edit', 'Motion', 'Navigate', 'Prover', 'Run', 'View', 'Settings', 'Tools'];
  var globalHandlers = Object.create(null);
  var listening = false;

  function persistApi() {
    return global.Persist || null;
  }

  // The global keydown listener runs on EVERY keypress in the app, editor typing
  // included, and walks every global-scope command. Reading overrides inside
  // `resolve` meant a localStorage read per command per keystroke — invisible at
  // four global commands, real input cost at twenty-five. Callers that resolve
  // more than one id read the map ONCE and thread it through. Nothing is cached
  // across calls: an override written by another tab, a settings import, or a
  // direct Persist write has to take effect immediately.
  var scopeDefsCache = Object.create(null);
  var scopeDefsVersion = -1;

  /** Defs of one scope, rebuilt only when the registry itself changes. */
  function defsForScope(scope) {
    syncDefaults();
    if (scopeDefsVersion !== projectedVersion) {
      scopeDefsVersion = projectedVersion;
      scopeDefsCache = Object.create(null);
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
    var p = persistApi();
    if (!p || typeof p.readStoredKeybindings !== 'function') return {};
    var o = p.readStoredKeybindings();
    return o && typeof o === 'object' ? o : {};
  }

  function writeOverrides(map) {
    var p = persistApi();
    if (p && typeof p.writeStoredKeybindings === 'function') p.writeStoredKeybindings(map);
  }

  function notifyChanged() {
    try {
      if (typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent('beljar:keybindings-changed', { detail: {} }));
      } else if (typeof global.dispatchEvent === 'function') {
        global.dispatchEvent({ type: 'beljar:keybindings-changed', detail: {} });
      }
    } catch (_) {}
  }

  function formatShortcutPart(part, isMac) {
    if (part === 'Mod') return isMac ? '\u2318' : 'Ctrl';
    if (part === 'Control') return isMac ? '\u2303' : 'Ctrl';
    if (part === 'Shift') return isMac ? '\u21E7' : 'Shift';
    if (part === 'Alt') return isMac ? '\u2325' : 'Alt';
    return part;
  }

  function shortcutParts(spec, isMac) {
    if (!spec) return [];
    return String(spec).split('+').map(function (part) {
      return formatShortcutPart(part, isMac != null ? isMac : IS_MAC);
    });
  }

  function formatShortcut(spec, isMac) {
    if (!spec) return '';
    var mac = isMac != null ? isMac : IS_MAC;
    var parts = shortcutParts(spec, mac);
    return parts.join(mac ? '' : '+');
  }

  function normalizeKeyToken(raw) {
    if (!raw) return '';
    var k = String(raw);
    if (k === ' ') return 'Space';
    if (k.length === 1) return k.toUpperCase();
    if (/^f\d{1,2}$/i.test(k)) return k.toUpperCase();
    if (k === 'ArrowLeft') return 'Left';
    if (k === 'ArrowRight') return 'Right';
    if (k === 'ArrowUp') return 'Up';
    if (k === 'ArrowDown') return 'Down';
    if (k === 'Escape') return 'Escape';
    if (k === 'Backspace') return 'Backspace';
    if (k === 'Delete') return 'Delete';
    if (k === 'Enter') return 'Enter';
    if (k === 'Tab') return 'Tab';
    return k.length === 1 ? k.toUpperCase() : k;
  }

  /** Canonical Mod+Shift+Key form (sorted modifiers). Empty string if invalid. */
  function normalizeSpec(spec) {
    if (spec == null || spec === '') return '';
    var parts = String(spec).split('+').filter(Boolean);
    if (!parts.length) return '';
    var mod = false;
    var control = false;
    var shift = false;
    var alt = false;
    var key = '';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var pl = p.toLowerCase();
      if (pl === 'control' || p === '\u2303') control = true;
      else if (pl === 'mod' || pl === 'ctrl' || pl === 'meta' || pl === 'cmd' || p === '\u2318') mod = true;
      else if (pl === 'shift' || p === '\u21E7') shift = true;
      else if (pl === 'alt' || pl === 'option' || p === '\u2325') alt = true;
      else key = normalizeKeyToken(p);
    }
    if (!key) return '';
    var out = [];
    if (mod) out.push('Mod');
    if (control) out.push('Control');
    if (alt) out.push('Alt');
    if (shift) out.push('Shift');
    out.push(key);
    return out.join('+');
  }

  function platformDefaultSpec(def, isMac) {
    if (!def) return '';
    var mac = isMac != null ? isMac : IS_MAC;
    if (mac && def.macDefaultSpec) return normalizeSpec(def.macDefaultSpec);
    return normalizeSpec(def.defaultSpec);
  }

  function isUnboundSentinel(v) {
    return v === null || v === '';
  }

  /** `overrides` lets a caller resolving many ids read the map just once. */
  function resolveWith(id, isMac, overrides) {
    var def = BY_ID[id];
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

  function has(id) {
    syncDefaults();
    return !!BY_ID[id];
  }

  function labelFor(id, isMac) {
    return formatShortcut(resolve(id, isMac), isMac);
  }

  function list(isMac) {
    syncDefaults();
    var mac = isMac != null ? isMac : IS_MAC;
    var rows = DEFAULTS.map(function (def) {
      var spec = resolve(def.id, mac);
      return {
        id: def.id,
        title: def.title,
        section: def.section,
        scope: def.scope,
        spec: spec,
        defaultSpec: platformDefaultSpec(def, mac),
        isUser: isUserOverride(def.id),
        isEmpty: !spec,
      };
    });
    rows.sort(function (a, b) {
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
    return /^F([1-9]|1\d|2[0-4])$/i.test(key || '');
  }

  /** Browser/OS chords, or bare / Shift-only non-F keys (would steal typing). */
  function isReservedSequence(spec) {
    var n = normalizeSpec(spec);
    if (!n) return false;
    if (RESERVED[n]) return true;
    var parts = n.split('+');
    var key = parts[parts.length - 1];
    var hasMod = false;
    var hasAlt = false;
    var hasControl = false;
    for (var i = 0; i < parts.length - 1; i++) {
      if (parts[i] === 'Mod') hasMod = true;
      if (parts[i] === 'Alt') hasAlt = true;
      if (parts[i] === 'Control') hasControl = true;
    }
    if (hasMod || hasAlt || hasControl) return false;
    if (isFunctionKey(key)) return false;
    return true;
  }

  function titleFor(id) {
    syncDefaults();
    var def = BY_ID[id];
    return def ? def.title : '';
  }

  // Called once per row while the Keybindings sheet renders, so it resolves the
  // whole table against a single overrides read rather than one read per
  // candidate — that product is quadratic in the catalogue size.
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
    if (!BY_ID[id]) return { ok: false, reason: 'unknown' };
    if (isUnboundSentinel(spec)) {
      var mapClear = readOverrides();
      mapClear[id] = '';
      writeOverrides(mapClear);
      notifyChanged();
      return { ok: true };
    }
    var n = normalizeSpec(spec);
    if (!n) return { ok: false, reason: 'invalid' };
    if (isReservedSequence(n)) return { ok: false, reason: 'reserved' };
    var conflictId = findConflict(n, id);
    if (conflictId) return { ok: false, reason: 'conflict', conflictId: conflictId };
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
    return setBinding(id, '');
  }

  function resetBinding(id) {
    if (!BY_ID[id]) return { ok: false, reason: 'unknown' };
    var map = readOverrides();
    delete map[id];
    writeOverrides(map);
    notifyChanged();
    return { ok: true };
  }

  function resetAll() {
    var p = persistApi();
    if (p && typeof p.resetKeybindingPrefs === 'function') p.resetKeybindingPrefs();
    else writeOverrides({});
    notifyChanged();
    return { ok: true };
  }

  function isModifierKey(key) {
    return key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta' || key === 'OS';
  }

  /** Build a normalized spec from a keydown event, or null if incomplete / modifier-only. */
  function specFromEvent(e) {
    if (!e || isModifierKey(e.key)) return null;
    if (e.key === 'Dead') return null;
    var parts = [];
    if (e.metaKey) parts.push('Mod');
    else if (e.ctrlKey) parts.push(IS_MAC ? 'Control' : 'Mod');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    var key = normalizeKeyToken(e.key);
    if (!key || key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return null;
    parts.push(key);
    return normalizeSpec(parts.join('+'));
  }

  function eventMatchesSpec(e, spec) {
    var n = normalizeSpec(spec);
    if (!n || !e) return false;
    var want = Object.create(null);
    var parts = n.split('+');
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

  /** True when `e` matches the currently resolved binding for `id` (unbound → false). */
  function matchesId(e, id) {
    var spec = resolve(id);
    if (!spec) return false;
    return eventMatchesSpec(e, spec);
  }

  /** CodeMirror keymap key string from Mod+Shift+F → Mod-Shift-f */
  function toCmKey(spec) {
    var n = normalizeSpec(spec);
    if (!n) return '';
    return n.split('+').map(function (part, idx, arr) {
      if (part === 'Mod' || part === 'Shift' || part === 'Alt') return part;
      if (part === 'Control') return 'Ctrl';
      if (idx === arr.length - 1 && part.length === 1) return part.toLowerCase();
      return part;
    }).join('-');
  }

  function freedDefaultsForScope(scope, overrides) {
    var ov = overrides || readOverrides();
    var defs = defsForScope(scope);
    var freed = [];
    var claimed = Object.create(null);
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

  /**
   * The editor half of the chord table, as CodeMirror keymap entries.
   *
   * `runners` names the commands that need a view-specific closure (the undo
   * bridge, the search panel, a semantic-engine handle). `opts.fallback(id)`
   * supplies a runner for everything else — that is how the ~60 registry-backed
   * editor commands become real chords instead of dead ones.
   */
  function buildEditorKeymap(runById, opts) {
    syncDefaults();
    var entries = [];
    var seen = Object.create(null);
    var runners = runById || {};
    var fallback = opts && typeof opts.fallback === 'function' ? opts.fallback : null;
    var omit = Object.create(null);
    var omitDefaultSpecs = Object.create(null);
    if (opts && opts.omitIds) {
      var list = opts.omitIds;
      for (var oi = 0; oi < list.length; oi++) {
        omit[list[oi]] = true;
        var omitDef = BY_ID[list[oi]];
        if (omitDef && omitDef.scope === 'editor') {
          var omitPlat = platformDefaultSpec(omitDef);
          if (omitPlat) omitDefaultSpecs[normalizeSpec(omitPlat)] = true;
        }
      }
    }

    for (var i = 0; i < DEFAULTS.length; i++) {
      var def = DEFAULTS[i];
      if (def.scope !== 'editor') continue;
      if (omit[def.id]) continue;
      var spec = resolve(def.id);
      if (!spec) continue;
      // ⛔ A bound chord with no runner is a DEAD KEY, and the sheet that
      // offered the binding says nothing about it. This used to emit the entry
      // anyway and return false from inside it, so 62 of the 74 bindable editor
      // commands — every motion, every selection, the line edits, the nav and
      // prover verbs — accepted a chord and did nothing.
      //
      // `fallback` is how the caller says "anything I did not name explicitly
      // still runs, through the registry". Where there is neither a runner nor a
      // fallback the entry is SKIPPED rather than emitted dead, so the chord
      // falls through to CodeMirror instead of being swallowed.
      var run = runners[def.id] || (fallback ? fallback(def.id) : null);
      if (typeof run !== 'function') continue;
      var cm = toCmKey(spec);
      if (!cm || seen[cm]) continue;
      seen[cm] = true;
      (function (fn) {
        entries.push({ key: cm, run: function (view) { return !!fn(view); } });
      })(run);
    }

    var freed = freedDefaultsForScope('editor');
    for (var f = 0; f < freed.length; f++) {
      if (omitDefaultSpecs[normalizeSpec(freed[f])]) continue;
      var fcm = toCmKey(freed[f]);
      if (!fcm || seen[fcm]) continue;
      seen[fcm] = true;
      entries.push({ key: fcm, run: function () { return true; } });
    }
    return entries;
  }

  function isRecordingChordTarget(e) {
    var t = (e && e.target) || (typeof document !== 'undefined' ? document.activeElement : null);
    return !!(t && t.classList && t.classList.contains('bj-kb__chord') && t.classList.contains('is-recording'));
  }

  function isEmacsEditorFocused() {
    return isEmacsFocused();
  }

  /**
   * When Emacs owns the focused Beluga editor, stand aside for the chords Emacs
   * itself uses.
   *
   * ⛔ BOTH policies, not just `yield`. `off` means the style owns the chord
   * outright, and until `tools.commands` moved onto `Alt+X` no global had ever
   * declared it — so a global firing over `M-x` was a case that had never come
   * up. `yield` and `off` differ in what the Keybindings sheet says, not in who
   * gets the key.
   */
  function shouldYieldGlobalForEmacs(commandId, emacsFocused) {
    if (!emacsFocused) return false;
    var policy = Commands.styleFor(commandId, 'emacs');
    return policy === 'yield' || policy === 'off';
  }

  function onGlobalKeydown(e) {
    if (e.isComposing) return;
    // Bare keys and modifier-only presses can never be a global chord; bail out
    // before touching the tables so ordinary typing costs one branch.
    if (!(e.ctrlKey || e.metaKey || e.altKey) && !isFunctionKey(normalizeKeyToken(e.key))) return;
    // Settings chord capture: let the focused .is-recording button own the event
    // (globals use capture and would otherwise steal Mod+K / Mod+Shift+P / …).
    if (isRecordingChordTarget(e)) return;
    var overrides = readOverrides();
    var freed = freedDefaultsForScope('global', overrides);
    for (var fi = 0; fi < freed.length; fi++) {
      if (eventMatchesSpec(e, freed[fi])) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    var defs = defsForScope('global');
    for (var i = 0; i < defs.length; i++) {
      var def = defs[i];
      var spec = resolveWith(def.id, null, overrides);
      if (!spec || !eventMatchesSpec(e, spec)) continue;
      if (shouldYieldGlobalForEmacs(def.id, isEmacsEditorFocused())) return;
      var handler = globalHandlers[def.id];
      if (typeof handler !== 'function') continue;
      e.preventDefault();
      e.stopPropagation();
      try { handler(); } catch (_) {}
      return;
    }
  }

  function initGlobals(handlers) {
    if (handlers && typeof handlers === 'object') {
      Object.keys(handlers).forEach(function (id) {
        globalHandlers[id] = handlers[id];
      });
    }
    if (listening) return;
    listening = true;
    global.addEventListener('keydown', onGlobalKeydown, true);
  }

  function setGlobalHandler(id, fn) {
    globalHandlers[id] = fn;
  }

  global.Keybindings = {
    DEFAULTS: DEFAULTS,
    IS_MAC: IS_MAC,
    has: has,
    list: list,
    resolve: resolve,
    labelFor: labelFor,
    isUserOverride: isUserOverride,
    platformDefaultSpec: function (id, isMac) {
      return platformDefaultSpec(BY_ID[id], isMac);
    },
    normalizeSpec: normalizeSpec,
    formatShortcut: formatShortcut,
    shortcutParts: shortcutParts,
    specFromEvent: specFromEvent,
    eventMatchesSpec: eventMatchesSpec,
    matchesId: matchesId,
    isBrowserReserved: isBrowserReserved,
    isReservedSequence: isReservedSequence,
    titleFor: titleFor,
    findConflict: findConflict,
    setBinding: setBinding,
    clearBinding: clearBinding,
    resetBinding: resetBinding,
    resetAll: resetAll,
    toCmKey: toCmKey,
    buildEditorKeymap: buildEditorKeymap,
    freedDefaultsForScope: freedDefaultsForScope,
    initGlobals: initGlobals,
    setGlobalHandler: setGlobalHandler,
    shouldYieldGlobalForEmacs: shouldYieldGlobalForEmacs,
    isEmacsEditorFocused: isEmacsEditorFocused,
    _pure: {
      normalizeSpec: normalizeSpec,
      formatShortcut: formatShortcut,
      shortcutParts: shortcutParts,
      platformDefaultSpec: platformDefaultSpec,
      isBrowserReserved: isBrowserReserved,
      isReservedSequence: isReservedSequence,
      toCmKey: toCmKey,
      specFromEvent: specFromEvent,
      shouldYieldGlobalForEmacs: shouldYieldGlobalForEmacs,
      DEFAULTS: DEFAULTS,
      RESERVED: RESERVED,
    },
  };
  global.BelJarKeybindings = global.Keybindings;
