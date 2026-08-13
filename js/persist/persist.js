(() => {
  // js/persist/persist-ui-prefs.mjs
  function create(deps) {
    var THEME_STORAGE_KEY2 = deps.THEME_STORAGE_KEY;
    var UI_FONT_SIZE_KEY2 = deps.UI_FONT_SIZE_KEY;
    var UI_FONT_SCALES2 = deps.UI_FONT_SCALES;
    var UI_TEXT_CONTRAST_KEY2 = deps.UI_TEXT_CONTRAST_KEY;
    var UI_TEXT_CONTRAST_MULTIPLIERS2 = deps.UI_TEXT_CONTRAST_MULTIPLIERS;
    var backendLoad2 = deps.backendLoad;
    var backendSave2 = deps.backendSave;
    var backendRemove2 = deps.backendRemove;
    function readStoredTheme2() {
      try {
        return backendLoad2(THEME_STORAGE_KEY2) === "light" ? "light" : "dark";
      } catch (_) {
        return "dark";
      }
    }
    function writeStoredTheme2(mode) {
      if (mode === "light") backendSave2(THEME_STORAGE_KEY2, "light");
      else backendRemove2(THEME_STORAGE_KEY2);
    }
    function readStoredUiFontSize2() {
      try {
        var v = backendLoad2(UI_FONT_SIZE_KEY2);
        if (v === "sm" || v === "lg" || v === "xl") return v;
        return "md";
      } catch (_) {
        return "md";
      }
    }
    function writeStoredUiFontSize2(size) {
      if (size === "md") backendRemove2(UI_FONT_SIZE_KEY2);
      else if (size === "sm" || size === "lg" || size === "xl") backendSave2(UI_FONT_SIZE_KEY2, size);
      else backendRemove2(UI_FONT_SIZE_KEY2);
    }
    function uiFontScaleForSize2(size) {
      return UI_FONT_SCALES2[size] || 1;
    }
    function applyStoredUiFontSize2(doc) {
      var root = doc && doc.documentElement ? doc.documentElement : null;
      if (!root && typeof document !== "undefined") root = document.documentElement;
      if (!root) return;
      root.style.setProperty("--ui-font-scale", String(uiFontScaleForSize2(readStoredUiFontSize2())));
    }
    function readStoredUiTextContrast2() {
      try {
        var v = backendLoad2(UI_TEXT_CONTRAST_KEY2);
        if (v === "low" || v === "normal") return "low";
        if (v === "medium" || v === "high" || v === "maximum") return v;
        return "medium";
      } catch (_) {
        return "medium";
      }
    }
    function writeStoredUiTextContrast2(contrast) {
      if (contrast === "medium") backendRemove2(UI_TEXT_CONTRAST_KEY2);
      else if (contrast === "low" || contrast === "high" || contrast === "maximum") {
        backendSave2(UI_TEXT_CONTRAST_KEY2, contrast);
      } else backendRemove2(UI_TEXT_CONTRAST_KEY2);
    }
    function uiTextContrastMultiplierForLevel2(contrast) {
      return UI_TEXT_CONTRAST_MULTIPLIERS2[contrast] || UI_TEXT_CONTRAST_MULTIPLIERS2.medium;
    }
    function applyStoredUiTextContrast2(doc) {
      var root = doc && doc.documentElement ? doc.documentElement : null;
      if (!root && typeof document !== "undefined") root = document.documentElement;
      if (!root) return;
      root.style.setProperty("--ui-text-contrast", String(uiTextContrastMultiplierForLevel2(readStoredUiTextContrast2())));
    }
    return {
      readStoredTheme: readStoredTheme2,
      writeStoredTheme: writeStoredTheme2,
      readStoredUiFontSize: readStoredUiFontSize2,
      writeStoredUiFontSize: writeStoredUiFontSize2,
      uiFontScaleForSize: uiFontScaleForSize2,
      applyStoredUiFontSize: applyStoredUiFontSize2,
      readStoredUiTextContrast: readStoredUiTextContrast2,
      writeStoredUiTextContrast: writeStoredUiTextContrast2,
      uiTextContrastMultiplierForLevel: uiTextContrastMultiplierForLevel2,
      applyStoredUiTextContrast: applyStoredUiTextContrast2
    };
  }

  // js/persist/persist-settings.mjs
  function create2(deps) {
    var backendLoad2 = deps.backendLoad;
    var backendSave2 = deps.backendSave;
    var backendRemove2 = deps.backendRemove;
    var tryParse2 = deps.tryParse;
    var THEME_STORAGE_KEY2 = deps.THEME_STORAGE_KEY;
    var UI_FONT_SIZE_KEY2 = deps.UI_FONT_SIZE_KEY;
    var UI_TEXT_CONTRAST_KEY2 = deps.UI_TEXT_CONTRAST_KEY;
    var BELUGA_MODE_STORAGE_KEY2 = deps.BELUGA_MODE_STORAGE_KEY;
    var DEFAULT_PROJECT_NAME2 = deps.DEFAULT_PROJECT_NAME;
    var ensureProject2 = deps.ensureProject;
    var getFileText2 = deps.getFileText;
    var readState2 = deps.readState;
    var defaultBackend2 = deps.defaultBackend;
    var stateKeyFor2 = deps.stateKeyFor;
    function readStoredBelugaMode2() {
      try {
        var v = backendLoad2(BELUGA_MODE_STORAGE_KEY2);
        if (v === "fast" || v === "stable") return v;
        var old = backendLoad2("beljar-beluga-build");
        return old === "fast" || old === "auto" ? "fast" : "stable";
      } catch (_) {
        return "stable";
      }
    }
    function writeStoredBelugaMode2(mode) {
      backendSave2(BELUGA_MODE_STORAGE_KEY2, mode);
    }
    var HOVER_SCOPE_KEY = "beljar-hover-scope";
    function readStoredHoverScope2() {
      try {
        var v = backendLoad2(HOVER_SCOPE_KEY);
        if (v === "user-only") return "user-only";
        if (v === "none") return "none";
        return "all";
      } catch (_) {
        return "all";
      }
    }
    function writeStoredHoverScope2(scope) {
      if (scope === "all") {
        backendRemove2(HOVER_SCOPE_KEY);
      } else {
        backendSave2(HOVER_SCOPE_KEY, scope);
      }
    }
    var ALIAS_ACTIVATION_KEY = "beljar-alias-activation";
    var ALIAS_PAIRS_KEY = "beljar-alias-pairs";
    var CFG_AUTO_SYNC_KEY = "beljar-cfg-auto-sync";
    function readStoredCfgAutoSync2() {
      try {
        var v = backendLoad2(CFG_AUTO_SYNC_KEY);
        return v !== "off";
      } catch (_) {
        return true;
      }
    }
    function writeStoredCfgAutoSync2(on) {
      if (on) backendRemove2(CFG_AUTO_SYNC_KEY);
      else backendSave2(CFG_AUTO_SYNC_KEY, "off");
    }
    function readStoredAliasActivation2() {
      try {
        var v = backendLoad2(ALIAS_ACTIVATION_KEY);
        return v === "greedy" ? "greedy" : "strict";
      } catch (_) {
        return "strict";
      }
    }
    function writeStoredAliasActivation2(mode) {
      if (mode === "greedy") backendSave2(ALIAS_ACTIVATION_KEY, "greedy");
      else backendRemove2(ALIAS_ACTIVATION_KEY);
    }
    function readStoredAliasPairs2() {
      try {
        var raw = backendLoad2(ALIAS_PAIRS_KEY);
        if (raw == null || raw === "") return null;
        var parsed = tryParse2(raw);
        if (!Array.isArray(parsed)) return null;
        return parsed;
      } catch (_) {
        return null;
      }
    }
    function writeStoredAliasPairs2(pairs) {
      if (pairs == null) {
        backendRemove2(ALIAS_PAIRS_KEY);
        return;
      }
      if (!Array.isArray(pairs)) return;
      backendSave2(ALIAS_PAIRS_KEY, JSON.stringify(pairs));
    }
    var REPL_AUTOSCROLL_KEY = "beljar-repl-autoscroll";
    var REPL_WELCOME_KEY = "beljar-repl-welcome";
    var REPL_ECHO_KEY = "beljar-repl-echo";
    var REPL_FILTER_CHATTER_KEY = "beljar-repl-filter-chatter";
    var REPL_HOVER_TIMESTAMP_KEY = "beljar-repl-hover-timestamp";
    var REPL_HISTORY_CAP_KEY = "beljar-repl-history-cap";
    var REPL_HISTORY_PERSIST_KEY = "beljar-repl-history-persist";
    var REPL_TRANSCRIPT_KEY = "beljar-repl-transcript-v1";
    var REPL_CMD_HISTORY_KEY = "beljar-repl-cmd-history-v1";
    var REPL_CMD_HISTORY_DEFAULT_CAP = 1e3;
    var BELUGA_FALLBACK_STABLE_KEY = "beljar-beluga-fallback-stable";
    var BELUGA_CANCEL_ON_EDIT_KEY = "beljar-beluga-cancel-on-edit";
    var LIBRARY_EXPAND_DEFAULT_KEY = "beljar-library-expand-default";
    var LIBRARY_HINT_DISMISSED_KEY = "beljar-library-hint-dismissed";
    var HINT_DISMISSED_PREFIX = "beljar-hint-dismissed:";
    var RESTORE_PANELS_KEY = "beljar-restore-panels";
    var ACTIVE_SIDE_PANEL_KEY = "beljar-active-side-panel";
    var WORKSPACE_KEY = "beljar-workspace-v1";
    var SIDE_PANEL_IDS = ["explorer", "inspector", "library", "harpoon"];
    var AUTOSAVE_DELAY_KEY = "beljar-autosave-delay";
    var EDITOR_FONT_SIZE_KEY = "beljar-editor-font-size";
    var EDITOR_LINE_HEIGHT_KEY = "beljar-editor-line-height";
    var EDITOR_WORD_WRAP_KEY = "beljar-editor-word-wrap";
    var EDITOR_TAB_SIZE_KEY = "beljar-editor-tab-size";
    var EDITOR_LINE_NUMBERS_KEY = "beljar-editor-line-numbers";
    var EDITOR_FOLD_GUTTER_KEY = "beljar-editor-fold-gutter";
    var EDITOR_FOLD_PERSIST_KEY = "beljar-editor-fold-persist";
    var EDITOR_ACTIVE_LINE_KEY = "beljar-editor-active-line";
    var EDITOR_DIAG_GUTTER_KEY = "beljar-editor-diag-gutter";
    var EDITOR_HOLE_GUTTER_KEY = "beljar-editor-hole-gutter";
    var EDITOR_SYNTAX_HIGHLIGHT_KEY = "beljar-editor-syntax-highlight";
    var EDITOR_SEMANTIC_HIGHLIGHT_KEY = "beljar-editor-semantic-highlight";
    var EDITOR_PARSE_HIGHLIGHT_KEY = "beljar-editor-parse-highlight";
    var EDITOR_OCCURRENCE_HIGHLIGHT_KEY = "beljar-editor-occurrence-highlight";
    var EDITOR_BRACKET_MATCH_KEY = "beljar-editor-bracket-match";
    var EDITOR_AUTO_CLOSE_BRACKETS_KEY = "beljar-editor-auto-close-brackets";
    var EDITOR_SELECTION_MATCHES_KEY = "beljar-editor-selection-matches";
    var EDITOR_REINDENT_PASTE_KEY = "beljar-editor-reindent-paste";
    var EDITOR_FORMAT_WIDTH_KEY = "beljar-editor-format-width";
    var EDITOR_AUTOCOMPLETE_TRIGGER_KEY = "beljar-editor-autocomplete-trigger";
    var EDITOR_AUTOCOMPLETE_CONTINUE_KEY = "beljar-editor-autocomplete-continue";
    var EDITOR_CURSOR_BLINK_KEY = "beljar-editor-cursor-blink";
    var EDITOR_SCROLL_PAST_END_KEY = "beljar-editor-scroll-past-end";
    var EDITOR_WHITESPACE_KEY = "beljar-editor-whitespace";
    var EDITOR_RULERS_KEY = "beljar-editor-rulers";
    var EDITOR_FONT_FAMILY_KEY = "beljar-editor-font-family";
    var EDITOR_HOLE_EMPHASIS_KEY = "beljar-editor-hole-emphasis";
    var MOTION_PREF_KEY = "beljar-motion-pref";
    var TOAST_DURATION_KEY = "beljar-toast-duration";
    var CHECK_AGGRESSIVENESS_KEY = "beljar-check-aggressiveness";
    var AUTOSOLVE_FOCUS_NEXT_KEY = "beljar-autosolve-focus-next";
    var AUTOSOLVE_SHOW_STATS_KEY = "beljar-autosolve-show-stats";
    var QUIET_WHILE_TYPING_KEY = "beljar-quiet-while-typing";
    var DIAG_PRESENTATION_KEY = "beljar-diag-presentation";
    var DIAG_SEVERITY_KEY = "beljar-diag-severity";
    var FORMAT_ON_SAVE_KEY = "beljar-format-on-save";
    var TRIM_TRAILING_WS_KEY = "beljar-trim-trailing-ws";
    var STICKY_DECL_HEADER_KEY = "beljar-sticky-decl-header";
    var SUITE_CHECK_KEY = "beljar-suite-check";
    var HOVER_STICKY_KEY = "beljar-hover-sticky";
    function readBoolDefaultOn(key) {
      try {
        return backendLoad2(key) !== "off";
      } catch (_) {
        return true;
      }
    }
    function writeBoolDefaultOn(key, on) {
      if (on) backendRemove2(key);
      else backendSave2(key, "off");
    }
    function readBoolDefaultOff(key) {
      try {
        return backendLoad2(key) === "1";
      } catch (_) {
        return false;
      }
    }
    function writeBoolDefaultOff(key, on) {
      if (on) backendSave2(key, "1");
      else backendRemove2(key);
    }
    function readStoredReplAutoscroll2() {
      return readBoolDefaultOn(REPL_AUTOSCROLL_KEY);
    }
    function writeStoredReplAutoscroll2(on) {
      writeBoolDefaultOn(REPL_AUTOSCROLL_KEY, on);
    }
    function readStoredReplWelcome2() {
      return readBoolDefaultOn(REPL_WELCOME_KEY);
    }
    function writeStoredReplWelcome2(on) {
      writeBoolDefaultOn(REPL_WELCOME_KEY, on);
    }
    function readStoredReplEcho2() {
      return readBoolDefaultOn(REPL_ECHO_KEY);
    }
    function writeStoredReplEcho2(on) {
      writeBoolDefaultOn(REPL_ECHO_KEY, on);
    }
    function readStoredReplFilterChatter2() {
      return readBoolDefaultOn(REPL_FILTER_CHATTER_KEY);
    }
    function writeStoredReplFilterChatter2(on) {
      writeBoolDefaultOn(REPL_FILTER_CHATTER_KEY, on);
    }
    function readStoredReplHoverTimestamp2() {
      return readBoolDefaultOff(REPL_HOVER_TIMESTAMP_KEY);
    }
    function writeStoredReplHoverTimestamp2(on) {
      writeBoolDefaultOff(REPL_HOVER_TIMESTAMP_KEY, on);
    }
    function readStoredReplHistoryCap2() {
      try {
        var v = parseInt(backendLoad2(REPL_HISTORY_CAP_KEY), 10);
        if (v === 100 || v === 250 || v === 500 || v === 1e3) return v;
        return REPL_CMD_HISTORY_DEFAULT_CAP;
      } catch (_) {
        return REPL_CMD_HISTORY_DEFAULT_CAP;
      }
    }
    function writeStoredReplHistoryCap2(cap) {
      var n = Number(cap);
      if (n === 100 || n === 250 || n === 500) backendSave2(REPL_HISTORY_CAP_KEY, String(n));
      else backendRemove2(REPL_HISTORY_CAP_KEY);
    }
    function readStoredReplHistoryPersist2() {
      try {
        var v = backendLoad2(REPL_HISTORY_PERSIST_KEY);
        if (v === "session" || v === "none") return v;
        return "local";
      } catch (_) {
        return "local";
      }
    }
    function replHistoryStore(mode) {
      if (typeof globalThis === "undefined") return null;
      if (mode === "session") return globalThis.sessionStorage || null;
      if (mode === "local") return globalThis.localStorage || null;
      return null;
    }
    function replHistoryStoreGet(mode, key) {
      var store = replHistoryStore(mode);
      if (!store) return null;
      try {
        return store.getItem(key);
      } catch (_) {
        return null;
      }
    }
    function replHistoryStoreSet(mode, key, value) {
      var store = replHistoryStore(mode);
      if (!store) return;
      try {
        store.setItem(key, value);
      } catch (_) {
      }
    }
    function replHistoryStoreRemove(mode, key) {
      var store = replHistoryStore(mode);
      if (!store) return;
      try {
        store.removeItem(key);
      } catch (_) {
      }
    }
    function clearReplHistoryPayload(mode) {
      if (mode === "session" || mode === "local") {
        replHistoryStoreRemove(mode, REPL_TRANSCRIPT_KEY);
        replHistoryStoreRemove(mode, REPL_CMD_HISTORY_KEY);
        return;
      }
      replHistoryStoreRemove("session", REPL_TRANSCRIPT_KEY);
      replHistoryStoreRemove("session", REPL_CMD_HISTORY_KEY);
      replHistoryStoreRemove("local", REPL_TRANSCRIPT_KEY);
      replHistoryStoreRemove("local", REPL_CMD_HISTORY_KEY);
    }
    function writeStoredReplHistoryPersist2(mode) {
      var next = mode === "session" || mode === "none" ? mode : "local";
      var prev = readStoredReplHistoryPersist2();
      if (next === "local") backendRemove2(REPL_HISTORY_PERSIST_KEY);
      else backendSave2(REPL_HISTORY_PERSIST_KEY, next);
      if (prev === next) return;
      if (next === "none") {
        clearReplHistoryPayload();
        return;
      }
      if (prev === "session" || prev === "local") {
        var keys = [REPL_TRANSCRIPT_KEY, REPL_CMD_HISTORY_KEY];
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          var raw = replHistoryStoreGet(prev, key);
          if (raw && !replHistoryStoreGet(next, key)) replHistoryStoreSet(next, key, raw);
        }
        clearReplHistoryPayload(prev);
      }
    }
    function readStoredReplTranscript2() {
      try {
        var mode = readStoredReplHistoryPersist2();
        if (mode === "none") return null;
        var raw = replHistoryStoreGet(mode, REPL_TRANSCRIPT_KEY);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || parsed.v !== 1) return null;
        if (typeof parsed.html !== "string") return null;
        return {
          v: 1,
          html: parsed.html,
          scrollTop: typeof parsed.scrollTop === "number" ? parsed.scrollTop : 0,
          savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0
        };
      } catch (_) {
        return null;
      }
    }
    function writeStoredReplTranscript2(snap) {
      try {
        var mode = readStoredReplHistoryPersist2();
        if (mode === "none") return;
        if (!snap || typeof snap.html !== "string" || !snap.html) {
          replHistoryStoreRemove(mode, REPL_TRANSCRIPT_KEY);
          return;
        }
        replHistoryStoreSet(mode, REPL_TRANSCRIPT_KEY, JSON.stringify({
          v: 1,
          html: snap.html,
          scrollTop: typeof snap.scrollTop === "number" ? snap.scrollTop : 0,
          savedAt: typeof snap.savedAt === "number" ? snap.savedAt : Date.now()
        }));
      } catch (_) {
      }
    }
    function clampReplCommandHistory(list) {
      var arr = Array.isArray(list) ? list.filter(function(s) {
        return typeof s === "string";
      }) : [];
      var cap = readStoredReplHistoryCap2();
      if (!cap) cap = REPL_CMD_HISTORY_DEFAULT_CAP;
      if (arr.length > cap) arr = arr.slice(arr.length - cap);
      return arr;
    }
    function readStoredReplCommandHistory2() {
      try {
        var mode = readStoredReplHistoryPersist2();
        if (mode === "none") return [];
        var raw = replHistoryStoreGet(mode, REPL_CMD_HISTORY_KEY);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        return clampReplCommandHistory(parsed);
      } catch (_) {
        return [];
      }
    }
    function writeStoredReplCommandHistory2(list) {
      try {
        var mode = readStoredReplHistoryPersist2();
        if (mode === "none") return;
        var arr = clampReplCommandHistory(list);
        if (!arr.length) replHistoryStoreRemove(mode, REPL_CMD_HISTORY_KEY);
        else replHistoryStoreSet(mode, REPL_CMD_HISTORY_KEY, JSON.stringify(arr));
      } catch (_) {
      }
    }
    function readStoredBelugaFallbackStable2() {
      return readBoolDefaultOn(BELUGA_FALLBACK_STABLE_KEY);
    }
    function writeStoredBelugaFallbackStable2(on) {
      writeBoolDefaultOn(BELUGA_FALLBACK_STABLE_KEY, on);
    }
    function readStoredBelugaCancelOnEdit2() {
      return readBoolDefaultOn(BELUGA_CANCEL_ON_EDIT_KEY);
    }
    function writeStoredBelugaCancelOnEdit2(on) {
      writeBoolDefaultOn(BELUGA_CANCEL_ON_EDIT_KEY, on);
    }
    function readStoredLibraryExpandDefault2() {
      return readBoolDefaultOff(LIBRARY_EXPAND_DEFAULT_KEY);
    }
    function writeStoredLibraryExpandDefault2(on) {
      writeBoolDefaultOff(LIBRARY_EXPAND_DEFAULT_KEY, on);
    }
    function readStoredLibraryHintDismissed2() {
      return readBoolDefaultOff(LIBRARY_HINT_DISMISSED_KEY);
    }
    function writeStoredLibraryHintDismissed2(on) {
      writeBoolDefaultOff(LIBRARY_HINT_DISMISSED_KEY, on);
    }
    function readStoredHintDismissed2(id) {
      if (id == null || id === "") return false;
      return readBoolDefaultOff(HINT_DISMISSED_PREFIX + String(id));
    }
    function writeStoredHintDismissed2(id, on) {
      if (id == null || id === "") return;
      writeBoolDefaultOff(HINT_DISMISSED_PREFIX + String(id), !!on);
    }
    function readStoredRestorePanels2() {
      return readBoolDefaultOn(RESTORE_PANELS_KEY);
    }
    function writeStoredRestorePanels2(on) {
      writeBoolDefaultOn(RESTORE_PANELS_KEY, on);
    }
    function readStoredAutosaveDelay2() {
      try {
        var v = parseInt(backendLoad2(AUTOSAVE_DELAY_KEY), 10);
        if (v === 320 || v === 1e3 || v === 2e3) return v;
        return 320;
      } catch (_) {
        return 320;
      }
    }
    function writeStoredAutosaveDelay2(ms) {
      var n = Number(ms);
      if (n === 320) backendRemove2(AUTOSAVE_DELAY_KEY);
      else if (n === 1e3 || n === 2e3) backendSave2(AUTOSAVE_DELAY_KEY, String(n));
      else backendRemove2(AUTOSAVE_DELAY_KEY);
    }
    function readStoredEditorFontSize2() {
      try {
        var v = backendLoad2(EDITOR_FONT_SIZE_KEY);
        if (v === "sm" || v === "lg" || v === "xl") return v;
        return "md";
      } catch (_) {
        return "md";
      }
    }
    function writeStoredEditorFontSize2(size) {
      if (size === "md") backendRemove2(EDITOR_FONT_SIZE_KEY);
      else if (size === "sm" || size === "lg" || size === "xl") backendSave2(EDITOR_FONT_SIZE_KEY, size);
      else backendRemove2(EDITOR_FONT_SIZE_KEY);
    }
    function readStoredEditorLineHeight2() {
      try {
        var v = backendLoad2(EDITOR_LINE_HEIGHT_KEY);
        if (v === "compact" || v === "relaxed") return v;
        return "normal";
      } catch (_) {
        return "normal";
      }
    }
    function writeStoredEditorLineHeight2(mode) {
      if (mode === "normal") backendRemove2(EDITOR_LINE_HEIGHT_KEY);
      else if (mode === "compact" || mode === "relaxed") backendSave2(EDITOR_LINE_HEIGHT_KEY, mode);
      else backendRemove2(EDITOR_LINE_HEIGHT_KEY);
    }
    function readStoredEditorWordWrap2() {
      return readBoolDefaultOff(EDITOR_WORD_WRAP_KEY);
    }
    function writeStoredEditorWordWrap2(on) {
      writeBoolDefaultOff(EDITOR_WORD_WRAP_KEY, on);
    }
    function readStoredEditorTabSize2() {
      try {
        return backendLoad2(EDITOR_TAB_SIZE_KEY) === "4" ? 4 : 2;
      } catch (_) {
        return 2;
      }
    }
    function writeStoredEditorTabSize2(n) {
      if (Number(n) === 4) backendSave2(EDITOR_TAB_SIZE_KEY, "4");
      else backendRemove2(EDITOR_TAB_SIZE_KEY);
    }
    function readStoredEditorLineNumbers2() {
      return readBoolDefaultOn(EDITOR_LINE_NUMBERS_KEY);
    }
    function writeStoredEditorLineNumbers2(on) {
      writeBoolDefaultOn(EDITOR_LINE_NUMBERS_KEY, on);
    }
    function readStoredEditorFoldGutter2() {
      return readBoolDefaultOn(EDITOR_FOLD_GUTTER_KEY);
    }
    function writeStoredEditorFoldGutter2(on) {
      writeBoolDefaultOn(EDITOR_FOLD_GUTTER_KEY, on);
    }
    function readStoredEditorFoldPersist2() {
      try {
        var v = backendLoad2(EDITOR_FOLD_PERSIST_KEY);
        if (v === "none" || v === "local") return v;
        return "session";
      } catch (_) {
        return "session";
      }
    }
    function writeStoredEditorFoldPersist2(mode) {
      if (mode === "none" || mode === "local") backendSave2(EDITOR_FOLD_PERSIST_KEY, mode);
      else backendRemove2(EDITOR_FOLD_PERSIST_KEY);
    }
    function readStoredEditorActiveLine2() {
      return readBoolDefaultOn(EDITOR_ACTIVE_LINE_KEY);
    }
    function writeStoredEditorActiveLine2(on) {
      writeBoolDefaultOn(EDITOR_ACTIVE_LINE_KEY, on);
    }
    function readStoredEditorDiagGutter2() {
      return readBoolDefaultOn(EDITOR_DIAG_GUTTER_KEY);
    }
    function writeStoredEditorDiagGutter2(on) {
      writeBoolDefaultOn(EDITOR_DIAG_GUTTER_KEY, on);
    }
    function readStoredEditorHoleGutter2() {
      return readBoolDefaultOn(EDITOR_HOLE_GUTTER_KEY);
    }
    function writeStoredEditorHoleGutter2(on) {
      writeBoolDefaultOn(EDITOR_HOLE_GUTTER_KEY, on);
    }
    function readStoredEditorSyntaxHighlight2() {
      return readBoolDefaultOn(EDITOR_SYNTAX_HIGHLIGHT_KEY);
    }
    function writeStoredEditorSyntaxHighlight2(on) {
      writeBoolDefaultOn(EDITOR_SYNTAX_HIGHLIGHT_KEY, on);
    }
    function readStoredEditorSemanticHighlight2() {
      return readBoolDefaultOn(EDITOR_SEMANTIC_HIGHLIGHT_KEY);
    }
    function writeStoredEditorSemanticHighlight2(on) {
      writeBoolDefaultOn(EDITOR_SEMANTIC_HIGHLIGHT_KEY, on);
    }
    function readStoredEditorParseHighlight2() {
      return readBoolDefaultOn(EDITOR_PARSE_HIGHLIGHT_KEY);
    }
    function writeStoredEditorParseHighlight2(on) {
      writeBoolDefaultOn(EDITOR_PARSE_HIGHLIGHT_KEY, on);
    }
    function readStoredEditorOccurrenceHighlight2() {
      return readBoolDefaultOn(EDITOR_OCCURRENCE_HIGHLIGHT_KEY);
    }
    function writeStoredEditorOccurrenceHighlight2(on) {
      writeBoolDefaultOn(EDITOR_OCCURRENCE_HIGHLIGHT_KEY, on);
    }
    function readStoredEditorBracketMatch2() {
      return readBoolDefaultOn(EDITOR_BRACKET_MATCH_KEY);
    }
    function writeStoredEditorBracketMatch2(on) {
      writeBoolDefaultOn(EDITOR_BRACKET_MATCH_KEY, on);
    }
    function readStoredEditorAutoCloseBrackets2() {
      return readBoolDefaultOn(EDITOR_AUTO_CLOSE_BRACKETS_KEY);
    }
    function writeStoredEditorAutoCloseBrackets2(on) {
      writeBoolDefaultOn(EDITOR_AUTO_CLOSE_BRACKETS_KEY, on);
    }
    function readStoredEditorSelectionMatches2() {
      return readBoolDefaultOn(EDITOR_SELECTION_MATCHES_KEY);
    }
    function writeStoredEditorSelectionMatches2(on) {
      writeBoolDefaultOn(EDITOR_SELECTION_MATCHES_KEY, on);
    }
    function readStoredEditorReindentPaste2() {
      return readBoolDefaultOn(EDITOR_REINDENT_PASTE_KEY);
    }
    function writeStoredEditorReindentPaste2(on) {
      writeBoolDefaultOn(EDITOR_REINDENT_PASTE_KEY, on);
    }
    function readStoredEditorFormatWidth2() {
      try {
        var v = parseInt(backendLoad2(EDITOR_FORMAT_WIDTH_KEY), 10);
        if (v === 100 || v === 120) return v;
        return 80;
      } catch (_) {
        return 80;
      }
    }
    function writeStoredEditorFormatWidth2(width) {
      var n = Number(width);
      if (n === 80) backendRemove2(EDITOR_FORMAT_WIDTH_KEY);
      else if (n === 100 || n === 120) backendSave2(EDITOR_FORMAT_WIDTH_KEY, String(n));
      else backendRemove2(EDITOR_FORMAT_WIDTH_KEY);
    }
    function readStoredEditorAutocompleteTrigger2() {
      try {
        var v = backendLoad2(EDITOR_AUTOCOMPLETE_TRIGGER_KEY);
        if (v === "none" || v === "always") return v;
        return "typing";
      } catch (_) {
        return "typing";
      }
    }
    function writeStoredEditorAutocompleteTrigger2(mode) {
      if (mode === "none" || mode === "always") backendSave2(EDITOR_AUTOCOMPLETE_TRIGGER_KEY, mode);
      else backendRemove2(EDITOR_AUTOCOMPLETE_TRIGGER_KEY);
    }
    function readStoredEditorAutocompleteContinue2() {
      return readBoolDefaultOff(EDITOR_AUTOCOMPLETE_CONTINUE_KEY);
    }
    function writeStoredEditorAutocompleteContinue2(on) {
      writeBoolDefaultOff(EDITOR_AUTOCOMPLETE_CONTINUE_KEY, on);
    }
    function readStoredEditorCursorBlink() {
      try {
        var v = backendLoad2(EDITOR_CURSOR_BLINK_KEY);
        if (v === "off" || v === "fast") return v;
        return "blink";
      } catch (_) {
        return "blink";
      }
    }
    function writeStoredEditorCursorBlink(mode) {
      if (mode === "off" || mode === "fast") backendSave2(EDITOR_CURSOR_BLINK_KEY, mode);
      else backendRemove2(EDITOR_CURSOR_BLINK_KEY);
    }
    function readStoredEditorScrollPastEnd() {
      return readBoolDefaultOn(EDITOR_SCROLL_PAST_END_KEY);
    }
    function writeStoredEditorScrollPastEnd(on) {
      writeBoolDefaultOn(EDITOR_SCROLL_PAST_END_KEY, on);
    }
    function readStoredEditorWhitespace() {
      try {
        var v = backendLoad2(EDITOR_WHITESPACE_KEY);
        if (v === "trailing" || v === "all" || v === "selection") return v;
        return "none";
      } catch (_) {
        return "none";
      }
    }
    function writeStoredEditorWhitespace(mode) {
      if (mode === "trailing" || mode === "all" || mode === "selection") backendSave2(EDITOR_WHITESPACE_KEY, mode);
      else backendRemove2(EDITOR_WHITESPACE_KEY);
    }
    function readStoredEditorRulers() {
      return readBoolDefaultOff(EDITOR_RULERS_KEY);
    }
    function writeStoredEditorRulers(on) {
      writeBoolDefaultOff(EDITOR_RULERS_KEY, on);
    }
    function readStoredEditorFontFamily() {
      try {
        var v = backendLoad2(EDITOR_FONT_FAMILY_KEY);
        if (v === "system") return "system";
        return "jetbrains";
      } catch (_) {
        return "jetbrains";
      }
    }
    function writeStoredEditorFontFamily(family) {
      if (family === "system") backendSave2(EDITOR_FONT_FAMILY_KEY, "system");
      else backendRemove2(EDITOR_FONT_FAMILY_KEY);
    }
    function readStoredEditorHoleEmphasis() {
      try {
        var v = backendLoad2(EDITOR_HOLE_EMPHASIS_KEY);
        if (v === "subtle" || v === "loud") return v;
        return "normal";
      } catch (_) {
        return "normal";
      }
    }
    function writeStoredEditorHoleEmphasis(mode) {
      if (mode === "subtle" || mode === "loud") backendSave2(EDITOR_HOLE_EMPHASIS_KEY, mode);
      else backendRemove2(EDITOR_HOLE_EMPHASIS_KEY);
    }
    function readStoredMotionPref() {
      try {
        var v = backendLoad2(MOTION_PREF_KEY);
        if (v === "reduce" || v === "full") return v;
        return "system";
      } catch (_) {
        return "system";
      }
    }
    function writeStoredMotionPref(mode) {
      if (mode === "reduce" || mode === "full") backendSave2(MOTION_PREF_KEY, mode);
      else backendRemove2(MOTION_PREF_KEY);
    }
    function applyStoredMotionPref(doc) {
      var root = doc && doc.documentElement ? doc.documentElement : null;
      if (!root && typeof document !== "undefined") root = document.documentElement;
      if (!root) return;
      var mode = readStoredMotionPref();
      root.classList.toggle("bj-motion-reduce", mode === "reduce");
      root.classList.toggle("bj-motion-full", mode === "full");
    }
    function prefersReducedMotion() {
      var mode = readStoredMotionPref();
      if (mode === "reduce") return true;
      if (mode === "full") return false;
      try {
        return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch (_) {
        return false;
      }
    }
    function readStoredToastDuration() {
      try {
        var v = backendLoad2(TOAST_DURATION_KEY);
        if (v === "short" || v === "long") return v;
        return "normal";
      } catch (_) {
        return "normal";
      }
    }
    function writeStoredToastDuration(mode) {
      if (mode === "short" || mode === "long") backendSave2(TOAST_DURATION_KEY, mode);
      else backendRemove2(TOAST_DURATION_KEY);
    }
    function toastDurationMs() {
      var mode = readStoredToastDuration();
      if (mode === "short") return 2e3;
      if (mode === "long") return 6e3;
      return 3500;
    }
    function readStoredCheckAggressiveness() {
      try {
        var v = backendLoad2(CHECK_AGGRESSIVENESS_KEY);
        if (v === "responsive" || v === "thorough") return v;
        return "balanced";
      } catch (_) {
        return "balanced";
      }
    }
    function writeStoredCheckAggressiveness(mode) {
      if (mode === "responsive" || mode === "thorough") backendSave2(CHECK_AGGRESSIVENESS_KEY, mode);
      else backendRemove2(CHECK_AGGRESSIVENESS_KEY);
    }
    function checkAggressivenessScale() {
      var mode = readStoredCheckAggressiveness();
      if (mode === "responsive") return 0.7;
      if (mode === "thorough") return 1.45;
      return 1;
    }
    function readStoredAutosolveFocusNext() {
      return readBoolDefaultOn(AUTOSOLVE_FOCUS_NEXT_KEY);
    }
    function writeStoredAutosolveFocusNext(on) {
      writeBoolDefaultOn(AUTOSOLVE_FOCUS_NEXT_KEY, on);
    }
    function readStoredAutosolveShowStats() {
      return readBoolDefaultOn(AUTOSOLVE_SHOW_STATS_KEY);
    }
    function writeStoredAutosolveShowStats(on) {
      writeBoolDefaultOn(AUTOSOLVE_SHOW_STATS_KEY, on);
    }
    function readStoredQuietWhileTyping() {
      return readBoolDefaultOff(QUIET_WHILE_TYPING_KEY);
    }
    function writeStoredQuietWhileTyping(on) {
      writeBoolDefaultOff(QUIET_WHILE_TYPING_KEY, on);
    }
    function readStoredDiagPresentation() {
      try {
        var v = backendLoad2(DIAG_PRESENTATION_KEY);
        if (v === "underlines" || v === "gutter" || v === "none" || v === "both") return v;
        if (backendLoad2(EDITOR_DIAG_GUTTER_KEY) === "off") return "underlines";
        return "both";
      } catch (_) {
        return "both";
      }
    }
    function writeStoredDiagPresentation(mode) {
      if (mode === "underlines" || mode === "gutter" || mode === "none") {
        backendSave2(DIAG_PRESENTATION_KEY, mode);
      } else {
        backendRemove2(DIAG_PRESENTATION_KEY);
      }
      if (mode === "underlines" || mode === "none") writeBoolDefaultOn(EDITOR_DIAG_GUTTER_KEY, false);
      else writeBoolDefaultOn(EDITOR_DIAG_GUTTER_KEY, true);
    }
    function readStoredDiagSeverity() {
      try {
        var v = backendLoad2(DIAG_SEVERITY_KEY);
        if (v === "errors") return "errors";
        return "all";
      } catch (_) {
        return "all";
      }
    }
    function writeStoredDiagSeverity(mode) {
      if (mode === "errors") backendSave2(DIAG_SEVERITY_KEY, "errors");
      else backendRemove2(DIAG_SEVERITY_KEY);
    }
    function readStoredFormatOnSave() {
      return readBoolDefaultOff(FORMAT_ON_SAVE_KEY);
    }
    function writeStoredFormatOnSave(on) {
      writeBoolDefaultOff(FORMAT_ON_SAVE_KEY, on);
    }
    function readStoredTrimTrailingWs() {
      return readBoolDefaultOff(TRIM_TRAILING_WS_KEY);
    }
    function writeStoredTrimTrailingWs(on) {
      writeBoolDefaultOff(TRIM_TRAILING_WS_KEY, on);
    }
    function readStoredStickyDeclHeader() {
      return readBoolDefaultOff(STICKY_DECL_HEADER_KEY);
    }
    function writeStoredStickyDeclHeader(on) {
      writeBoolDefaultOff(STICKY_DECL_HEADER_KEY, on);
    }
    function readStoredSuiteCheck() {
      try {
        var v = backendLoad2(SUITE_CHECK_KEY);
        if (v === "active") return "active";
        return "suite";
      } catch (_) {
        return "suite";
      }
    }
    function writeStoredSuiteCheck(mode) {
      if (mode === "active") backendSave2(SUITE_CHECK_KEY, "active");
      else backendRemove2(SUITE_CHECK_KEY);
    }
    function readStoredHoverSticky() {
      return readBoolDefaultOff(HOVER_STICKY_KEY);
    }
    function writeStoredHoverSticky(on) {
      writeBoolDefaultOff(HOVER_STICKY_KEY, on);
    }
    function applyStoredEditorChrome(doc) {
      var root = doc && doc.documentElement ? doc.documentElement : null;
      if (!root && typeof document !== "undefined") root = document.documentElement;
      if (!root) return;
      var family = readStoredEditorFontFamily();
      root.style.setProperty(
        "--editor-mono",
        family === "system" ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : "'JetBrains Mono', monospace"
      );
      root.style.setProperty("--editor-ligatures", "none");
      backendRemove2("beljar-editor-ligatures");
      var emph = readStoredEditorHoleEmphasis();
      root.classList.toggle("bj-hole-subtle", emph === "subtle");
      root.classList.toggle("bj-hole-loud", emph === "loud");
    }
    var USER_SETTINGS_EXPORT_KEYS = [
      "beljar-theme",
      "beljar-ui-font-size",
      "beljar-ui-text-contrast",
      "beljar-motion-pref",
      "beljar-toast-duration",
      "beljar-beluga-mode",
      "beljar-beluga-fallback-stable",
      "beljar-beluga-cancel-on-edit",
      "beljar-check-aggressiveness",
      "beljar-hover-scope",
      "beljar-alias-activation",
      "beljar-alias-pairs",
      "beljar-cfg-auto-sync",
      "beljar-repl-autoscroll",
      "beljar-repl-welcome",
      "beljar-repl-echo",
      "beljar-repl-filter-chatter",
      "beljar-repl-hover-timestamp",
      "beljar-repl-history-cap",
      "beljar-repl-history-persist",
      "beljar-library-expand-default",
      "beljar-restore-panels",
      "beljar-inspector-follow",
      "beljar-autosave-delay",
      "beljar-autosolve-focus-next",
      "beljar-autosolve-show-stats",
      QUIET_WHILE_TYPING_KEY,
      DIAG_PRESENTATION_KEY,
      DIAG_SEVERITY_KEY,
      FORMAT_ON_SAVE_KEY,
      TRIM_TRAILING_WS_KEY,
      STICKY_DECL_HEADER_KEY,
      SUITE_CHECK_KEY,
      HOVER_STICKY_KEY,
      "beljar-keybindings",
      EDITOR_FONT_SIZE_KEY,
      EDITOR_LINE_HEIGHT_KEY,
      EDITOR_WORD_WRAP_KEY,
      EDITOR_TAB_SIZE_KEY,
      EDITOR_LINE_NUMBERS_KEY,
      EDITOR_FOLD_GUTTER_KEY,
      EDITOR_FOLD_PERSIST_KEY,
      EDITOR_ACTIVE_LINE_KEY,
      EDITOR_DIAG_GUTTER_KEY,
      EDITOR_HOLE_GUTTER_KEY,
      EDITOR_SYNTAX_HIGHLIGHT_KEY,
      EDITOR_SEMANTIC_HIGHLIGHT_KEY,
      EDITOR_PARSE_HIGHLIGHT_KEY,
      EDITOR_OCCURRENCE_HIGHLIGHT_KEY,
      EDITOR_BRACKET_MATCH_KEY,
      EDITOR_AUTO_CLOSE_BRACKETS_KEY,
      EDITOR_SELECTION_MATCHES_KEY,
      EDITOR_REINDENT_PASTE_KEY,
      EDITOR_FORMAT_WIDTH_KEY,
      EDITOR_AUTOCOMPLETE_TRIGGER_KEY,
      EDITOR_AUTOCOMPLETE_CONTINUE_KEY,
      EDITOR_CURSOR_BLINK_KEY,
      EDITOR_SCROLL_PAST_END_KEY,
      EDITOR_WHITESPACE_KEY,
      EDITOR_RULERS_KEY,
      EDITOR_FONT_FAMILY_KEY,
      EDITOR_HOLE_EMPHASIS_KEY
    ];
    function exportUserSettings() {
      var prefs = {};
      for (var i = 0; i < USER_SETTINGS_EXPORT_KEYS.length; i++) {
        var key = USER_SETTINGS_EXPORT_KEYS[i];
        try {
          var v = backendLoad2(key);
          if (v != null && v !== "") prefs[key] = v;
        } catch (_) {
        }
      }
      try {
        if (typeof globalThis !== "undefined" && globalThis.localStorage) {
          var kb = globalThis.localStorage.getItem("beljar-keybindings");
          if (kb) prefs["beljar-keybindings"] = kb;
        }
      } catch (_) {
      }
      return { v: 1, exportedAt: Date.now(), prefs };
    }
    function importUserSettings(bundle) {
      if (!bundle || typeof bundle !== "object" || !bundle.prefs || typeof bundle.prefs !== "object") {
        return { ok: false, reason: "invalid" };
      }
      var prefs = bundle.prefs;
      var applied = 0;
      Object.keys(prefs).forEach(function(key) {
        if (USER_SETTINGS_EXPORT_KEYS.indexOf(key) < 0 && key !== "beljar-keybindings") return;
        var val = prefs[key];
        if (typeof val !== "string") return;
        try {
          if (key === "beljar-keybindings") {
            if (typeof globalThis !== "undefined" && globalThis.localStorage) {
              if (!val || val === "{}") globalThis.localStorage.removeItem(key);
              else globalThis.localStorage.setItem(key, val);
              applied += 1;
            }
            return;
          }
          backendSave2(key, val);
          applied += 1;
        } catch (_) {
        }
      });
      return { ok: true, applied };
    }
    function resetAppearancePrefs2() {
      backendRemove2(THEME_STORAGE_KEY2);
      backendRemove2(UI_FONT_SIZE_KEY2);
      backendRemove2(UI_TEXT_CONTRAST_KEY2);
      backendRemove2(MOTION_PREF_KEY);
      backendRemove2(TOAST_DURATION_KEY);
    }
    function resetEditorTypographyPrefs2() {
      backendRemove2(EDITOR_FONT_SIZE_KEY);
      backendRemove2(EDITOR_LINE_HEIGHT_KEY);
      backendRemove2(EDITOR_WORD_WRAP_KEY);
      backendRemove2("beljar-editor-ligatures");
      backendRemove2(EDITOR_FONT_FAMILY_KEY);
      backendRemove2(EDITOR_CURSOR_BLINK_KEY);
      backendRemove2(EDITOR_SCROLL_PAST_END_KEY);
      backendRemove2(EDITOR_WHITESPACE_KEY);
      backendRemove2(EDITOR_RULERS_KEY);
    }
    function resetEditorIndentPrefs2() {
      backendRemove2(EDITOR_TAB_SIZE_KEY);
      backendRemove2(AUTOSAVE_DELAY_KEY);
      backendRemove2(EDITOR_FORMAT_WIDTH_KEY);
      backendRemove2(EDITOR_REINDENT_PASTE_KEY);
      backendRemove2(CFG_AUTO_SYNC_KEY);
      backendRemove2(FORMAT_ON_SAVE_KEY);
      backendRemove2(TRIM_TRAILING_WS_KEY);
    }
    function resetEditorCodeInsightPrefs2() {
      backendRemove2(EDITOR_SYNTAX_HIGHLIGHT_KEY);
      backendRemove2(EDITOR_SEMANTIC_HIGHLIGHT_KEY);
      backendRemove2(EDITOR_PARSE_HIGHLIGHT_KEY);
      backendRemove2(EDITOR_OCCURRENCE_HIGHLIGHT_KEY);
      backendRemove2(EDITOR_BRACKET_MATCH_KEY);
      backendRemove2(EDITOR_AUTO_CLOSE_BRACKETS_KEY);
      backendRemove2(EDITOR_SELECTION_MATCHES_KEY);
      backendRemove2(HOVER_SCOPE_KEY);
      backendRemove2(EDITOR_AUTOCOMPLETE_TRIGGER_KEY);
      backendRemove2(EDITOR_AUTOCOMPLETE_CONTINUE_KEY);
      backendRemove2(QUIET_WHILE_TYPING_KEY);
      backendRemove2(HOVER_STICKY_KEY);
    }
    function resetEditorGutterPrefs2() {
      backendRemove2(EDITOR_LINE_NUMBERS_KEY);
      backendRemove2(EDITOR_FOLD_GUTTER_KEY);
      backendRemove2(EDITOR_FOLD_PERSIST_KEY);
      backendRemove2(EDITOR_ACTIVE_LINE_KEY);
      backendRemove2(EDITOR_DIAG_GUTTER_KEY);
      backendRemove2(DIAG_PRESENTATION_KEY);
      backendRemove2(DIAG_SEVERITY_KEY);
      backendRemove2(EDITOR_HOLE_GUTTER_KEY);
      backendRemove2(EDITOR_HOLE_EMPHASIS_KEY);
      backendRemove2(STICKY_DECL_HEADER_KEY);
    }
    function resetEditorPrefs2() {
      resetEditorTypographyPrefs2();
      resetEditorIndentPrefs2();
      resetEditorCodeInsightPrefs2();
      resetEditorGutterPrefs2();
    }
    function resetBelugaPrefs2() {
      backendRemove2(BELUGA_MODE_STORAGE_KEY2);
      backendRemove2(BELUGA_FALLBACK_STABLE_KEY);
      backendRemove2(BELUGA_CANCEL_ON_EDIT_KEY);
      backendRemove2(CHECK_AGGRESSIVENESS_KEY);
      backendRemove2(SUITE_CHECK_KEY);
      backendRemove2(AUTOSOLVE_FOCUS_NEXT_KEY);
      backendRemove2(AUTOSOLVE_SHOW_STATS_KEY);
    }
    function resetReplPrefs2() {
      backendRemove2(REPL_AUTOSCROLL_KEY);
      backendRemove2(REPL_WELCOME_KEY);
      backendRemove2(REPL_ECHO_KEY);
      backendRemove2(REPL_FILTER_CHATTER_KEY);
      backendRemove2(REPL_HOVER_TIMESTAMP_KEY);
      backendRemove2(REPL_HISTORY_CAP_KEY);
      backendRemove2(REPL_HISTORY_PERSIST_KEY);
      clearReplHistoryPayload();
    }
    var KEYBINDINGS_KEY = "beljar-keybindings";
    function readStoredKeybindings2() {
      try {
        var raw = globalThis.localStorage && globalThis.localStorage.getItem(KEYBINDINGS_KEY);
        if (!raw) return {};
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        var out = {};
        Object.keys(parsed).forEach(function(id) {
          var v = parsed[id];
          if (v === "" || v === null) out[id] = "";
          else if (typeof v === "string") out[id] = v;
        });
        return out;
      } catch (_) {
        return {};
      }
    }
    function writeStoredKeybindings2(map) {
      try {
        if (!globalThis.localStorage) return;
        var clean = {};
        if (map && typeof map === "object") {
          Object.keys(map).forEach(function(id) {
            var v = map[id];
            if (v === "" || v === null) clean[id] = "";
            else if (typeof v === "string" && v) clean[id] = v;
          });
        }
        if (!Object.keys(clean).length) globalThis.localStorage.removeItem(KEYBINDINGS_KEY);
        else globalThis.localStorage.setItem(KEYBINDINGS_KEY, JSON.stringify(clean));
      } catch (_) {
      }
    }
    function resetKeybindingPrefs2() {
      writeStoredKeybindings2({});
    }
    function resetAliasesPrefs2() {
      backendRemove2(ALIAS_ACTIVATION_KEY);
      backendRemove2(ALIAS_PAIRS_KEY);
    }
    function isAliasExpandablePath(name) {
      var PS = typeof ProjectSource !== "undefined" ? ProjectSource : null;
      if (PS && typeof PS.isBelPath === "function") return PS.isBelPath(name);
      var n = String(name || "").toLowerCase();
      if (n.endsWith(".cfg") || n.endsWith(".elf")) return false;
      if (n.endsWith(".bel")) return true;
      var base = String(name || "").slice(String(name || "").lastIndexOf("/") + 1);
      return base.indexOf(".") === -1;
    }
    function fileNameForId2(id) {
      var files = ensureProject2();
      for (var i = 0; i < files.length; i++) {
        if (files[i].id === id) return files[i].name || "";
      }
      return "";
    }
    function expandAliasesForStorage2(text, fileName) {
      if (readStoredAliasActivation2() !== "greedy") return String(text != null ? text : "");
      if (!isAliasExpandablePath(fileName)) return String(text != null ? text : "");
      if (typeof BelEditor !== "undefined" && typeof BelEditor.expandBelAliases === "function") {
        return BelEditor.expandBelAliases(text);
      }
      return String(text != null ? text : "");
    }
    function expandAliasesInAllFiles2() {
      if (readStoredAliasActivation2() !== "greedy") return 0;
      var files = ensureProject2();
      var changed = 0;
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (!isAliasExpandablePath(f.name)) continue;
        var cur = getFileText2(f.id);
        var next = expandAliasesForStorage2(cur, f.name);
        if (next !== cur) {
          var state = readState2(defaultBackend2, f.id);
          state.editor.text = next;
          state.meta.updatedAt = Date.now();
          state.meta.revision = (state.meta.revision || 0) + 1;
          backendSave2(stateKeyFor2(f.id), JSON.stringify(state));
          changed += 1;
        }
      }
      return changed;
    }
    function explorerFoldKey(projectName) {
      return "beljar-explorer-fold:" + String(projectName || DEFAULT_PROJECT_NAME2);
    }
    function getExplorerFold2(projectName) {
      try {
        var arr = tryParse2(backendLoad2(explorerFoldKey(projectName)));
        return Array.isArray(arr) ? arr : [];
      } catch (_) {
        return [];
      }
    }
    function setExplorerFold2(projectName, paths) {
      try {
        backendSave2(explorerFoldKey(projectName), JSON.stringify(Array.isArray(paths) ? paths : []));
      } catch (_) {
      }
    }
    return {
      readStoredBelugaMode: readStoredBelugaMode2,
      writeStoredBelugaMode: writeStoredBelugaMode2,
      readStoredHoverScope: readStoredHoverScope2,
      writeStoredHoverScope: writeStoredHoverScope2,
      readStoredCfgAutoSync: readStoredCfgAutoSync2,
      writeStoredCfgAutoSync: writeStoredCfgAutoSync2,
      readStoredAliasActivation: readStoredAliasActivation2,
      writeStoredAliasActivation: writeStoredAliasActivation2,
      readStoredAliasPairs: readStoredAliasPairs2,
      writeStoredAliasPairs: writeStoredAliasPairs2,
      readBoolDefaultOn,
      writeBoolDefaultOn,
      readBoolDefaultOff,
      writeBoolDefaultOff,
      readStoredReplAutoscroll: readStoredReplAutoscroll2,
      writeStoredReplAutoscroll: writeStoredReplAutoscroll2,
      readStoredReplWelcome: readStoredReplWelcome2,
      writeStoredReplWelcome: writeStoredReplWelcome2,
      readStoredReplEcho: readStoredReplEcho2,
      writeStoredReplEcho: writeStoredReplEcho2,
      readStoredReplFilterChatter: readStoredReplFilterChatter2,
      writeStoredReplFilterChatter: writeStoredReplFilterChatter2,
      readStoredReplHoverTimestamp: readStoredReplHoverTimestamp2,
      writeStoredReplHoverTimestamp: writeStoredReplHoverTimestamp2,
      readStoredReplHistoryCap: readStoredReplHistoryCap2,
      writeStoredReplHistoryCap: writeStoredReplHistoryCap2,
      readStoredReplHistoryPersist: readStoredReplHistoryPersist2,
      writeStoredReplHistoryPersist: writeStoredReplHistoryPersist2,
      readStoredReplTranscript: readStoredReplTranscript2,
      writeStoredReplTranscript: writeStoredReplTranscript2,
      readStoredReplCommandHistory: readStoredReplCommandHistory2,
      writeStoredReplCommandHistory: writeStoredReplCommandHistory2,
      readStoredBelugaFallbackStable: readStoredBelugaFallbackStable2,
      writeStoredBelugaFallbackStable: writeStoredBelugaFallbackStable2,
      readStoredBelugaCancelOnEdit: readStoredBelugaCancelOnEdit2,
      writeStoredBelugaCancelOnEdit: writeStoredBelugaCancelOnEdit2,
      readStoredLibraryExpandDefault: readStoredLibraryExpandDefault2,
      writeStoredLibraryExpandDefault: writeStoredLibraryExpandDefault2,
      readStoredLibraryHintDismissed: readStoredLibraryHintDismissed2,
      writeStoredLibraryHintDismissed: writeStoredLibraryHintDismissed2,
      readStoredHintDismissed: readStoredHintDismissed2,
      writeStoredHintDismissed: writeStoredHintDismissed2,
      readStoredRestorePanels: readStoredRestorePanels2,
      writeStoredRestorePanels: writeStoredRestorePanels2,
      readStoredAutosaveDelay: readStoredAutosaveDelay2,
      writeStoredAutosaveDelay: writeStoredAutosaveDelay2,
      readStoredEditorFontSize: readStoredEditorFontSize2,
      writeStoredEditorFontSize: writeStoredEditorFontSize2,
      readStoredEditorLineHeight: readStoredEditorLineHeight2,
      writeStoredEditorLineHeight: writeStoredEditorLineHeight2,
      readStoredEditorWordWrap: readStoredEditorWordWrap2,
      writeStoredEditorWordWrap: writeStoredEditorWordWrap2,
      readStoredEditorTabSize: readStoredEditorTabSize2,
      writeStoredEditorTabSize: writeStoredEditorTabSize2,
      readStoredEditorLineNumbers: readStoredEditorLineNumbers2,
      writeStoredEditorLineNumbers: writeStoredEditorLineNumbers2,
      readStoredEditorFoldGutter: readStoredEditorFoldGutter2,
      writeStoredEditorFoldGutter: writeStoredEditorFoldGutter2,
      readStoredEditorFoldPersist: readStoredEditorFoldPersist2,
      writeStoredEditorFoldPersist: writeStoredEditorFoldPersist2,
      readStoredEditorActiveLine: readStoredEditorActiveLine2,
      writeStoredEditorActiveLine: writeStoredEditorActiveLine2,
      readStoredEditorDiagGutter: readStoredEditorDiagGutter2,
      writeStoredEditorDiagGutter: writeStoredEditorDiagGutter2,
      readStoredEditorHoleGutter: readStoredEditorHoleGutter2,
      writeStoredEditorHoleGutter: writeStoredEditorHoleGutter2,
      readStoredEditorSyntaxHighlight: readStoredEditorSyntaxHighlight2,
      writeStoredEditorSyntaxHighlight: writeStoredEditorSyntaxHighlight2,
      readStoredEditorSemanticHighlight: readStoredEditorSemanticHighlight2,
      writeStoredEditorSemanticHighlight: writeStoredEditorSemanticHighlight2,
      readStoredEditorParseHighlight: readStoredEditorParseHighlight2,
      writeStoredEditorParseHighlight: writeStoredEditorParseHighlight2,
      readStoredEditorOccurrenceHighlight: readStoredEditorOccurrenceHighlight2,
      writeStoredEditorOccurrenceHighlight: writeStoredEditorOccurrenceHighlight2,
      readStoredEditorBracketMatch: readStoredEditorBracketMatch2,
      writeStoredEditorBracketMatch: writeStoredEditorBracketMatch2,
      readStoredEditorAutoCloseBrackets: readStoredEditorAutoCloseBrackets2,
      writeStoredEditorAutoCloseBrackets: writeStoredEditorAutoCloseBrackets2,
      readStoredEditorSelectionMatches: readStoredEditorSelectionMatches2,
      writeStoredEditorSelectionMatches: writeStoredEditorSelectionMatches2,
      readStoredEditorReindentPaste: readStoredEditorReindentPaste2,
      writeStoredEditorReindentPaste: writeStoredEditorReindentPaste2,
      readStoredEditorFormatWidth: readStoredEditorFormatWidth2,
      writeStoredEditorFormatWidth: writeStoredEditorFormatWidth2,
      readStoredEditorAutocompleteTrigger: readStoredEditorAutocompleteTrigger2,
      writeStoredEditorAutocompleteTrigger: writeStoredEditorAutocompleteTrigger2,
      readStoredEditorAutocompleteContinue: readStoredEditorAutocompleteContinue2,
      writeStoredEditorAutocompleteContinue: writeStoredEditorAutocompleteContinue2,
      readStoredEditorCursorBlink,
      writeStoredEditorCursorBlink,
      readStoredEditorScrollPastEnd,
      writeStoredEditorScrollPastEnd,
      readStoredEditorWhitespace,
      writeStoredEditorWhitespace,
      readStoredEditorRulers,
      writeStoredEditorRulers,
      readStoredEditorFontFamily,
      writeStoredEditorFontFamily,
      readStoredEditorHoleEmphasis,
      writeStoredEditorHoleEmphasis,
      readStoredMotionPref,
      writeStoredMotionPref,
      applyStoredMotionPref,
      prefersReducedMotion,
      readStoredToastDuration,
      writeStoredToastDuration,
      toastDurationMs,
      readStoredCheckAggressiveness,
      writeStoredCheckAggressiveness,
      checkAggressivenessScale,
      readStoredAutosolveFocusNext,
      writeStoredAutosolveFocusNext,
      readStoredAutosolveShowStats,
      writeStoredAutosolveShowStats,
      readStoredQuietWhileTyping,
      writeStoredQuietWhileTyping,
      readStoredDiagPresentation,
      writeStoredDiagPresentation,
      readStoredDiagSeverity,
      writeStoredDiagSeverity,
      readStoredFormatOnSave,
      writeStoredFormatOnSave,
      readStoredTrimTrailingWs,
      writeStoredTrimTrailingWs,
      readStoredStickyDeclHeader,
      writeStoredStickyDeclHeader,
      readStoredSuiteCheck,
      writeStoredSuiteCheck,
      readStoredHoverSticky,
      writeStoredHoverSticky,
      applyStoredEditorChrome,
      exportUserSettings,
      importUserSettings,
      resetAppearancePrefs: resetAppearancePrefs2,
      resetEditorTypographyPrefs: resetEditorTypographyPrefs2,
      resetEditorIndentPrefs: resetEditorIndentPrefs2,
      resetEditorCodeInsightPrefs: resetEditorCodeInsightPrefs2,
      resetEditorGutterPrefs: resetEditorGutterPrefs2,
      resetEditorPrefs: resetEditorPrefs2,
      resetBelugaPrefs: resetBelugaPrefs2,
      resetReplPrefs: resetReplPrefs2,
      readStoredKeybindings: readStoredKeybindings2,
      writeStoredKeybindings: writeStoredKeybindings2,
      resetKeybindingPrefs: resetKeybindingPrefs2,
      resetAliasesPrefs: resetAliasesPrefs2,
      isAliasExpandablePath,
      fileNameForId: fileNameForId2,
      expandAliasesForStorage: expandAliasesForStorage2,
      expandAliasesInAllFiles: expandAliasesInAllFiles2,
      explorerFoldKey,
      getExplorerFold: getExplorerFold2,
      setExplorerFold: setExplorerFold2
    };
  }

  // js/persist/persist-layout.mjs
  function create3(deps) {
    var backendLoad2 = deps.backendLoad;
    var backendSave2 = deps.backendSave;
    var backendRemove2 = deps.backendRemove;
    var tryParse2 = deps.tryParse;
    var projectPrefix2 = deps.projectPrefix;
    var getActiveProjectId2 = deps.getActiveProjectId;
    var EDITOR_SPLIT_STORAGE_KEY2 = deps.EDITOR_SPLIT_STORAGE_KEY;
    var DEFAULT_EDITOR_SPLIT2 = deps.DEFAULT_EDITOR_SPLIT;
    var MIN_EDITOR_SPLIT2 = deps.MIN_EDITOR_SPLIT;
    var MAX_EDITOR_SPLIT2 = deps.MAX_EDITOR_SPLIT;
    var SIDE_PANEL_LAYOUT2 = deps.SIDE_PANEL_LAYOUT;
    var DEFAULT_SIDE_PANEL_WIDTH2 = deps.DEFAULT_SIDE_PANEL_WIDTH;
    var DEFAULT_SIDE_PANEL_HEIGHT2 = deps.DEFAULT_SIDE_PANEL_HEIGHT;
    var EXPLORER_OPEN_KEY2 = deps.EXPLORER_OPEN_KEY;
    var INSPECTOR_OPEN_KEY2 = deps.INSPECTOR_OPEN_KEY;
    var INSPECTOR_FOLLOW_KEY2 = deps.INSPECTOR_FOLLOW_KEY;
    var LIBRARY_OPEN_KEY2 = deps.LIBRARY_OPEN_KEY;
    var LOAD_STATS_KEY2 = deps.LOAD_STATS_KEY;
    var WORKSPACE_KEY = "beljar-workspace-v1";
    var ACTIVE_SIDE_PANEL_KEY = "beljar-active-side-panel";
    var SIDE_PANEL_IDS = ["explorer", "inspector", "library", "harpoon"];
    var RESTORE_PANELS_KEY = "beljar-restore-panels";
    var LIBRARY_EXPAND_DEFAULT_KEY = "beljar-library-expand-default";
    function resetLayoutPrefs2() {
      backendRemove2(EDITOR_SPLIT_STORAGE_KEY2);
      for (var panelId in SIDE_PANEL_LAYOUT2) {
        if (!Object.prototype.hasOwnProperty.call(SIDE_PANEL_LAYOUT2, panelId)) continue;
        var layout = SIDE_PANEL_LAYOUT2[panelId];
        backendRemove2(layout.widthKey);
        backendRemove2(layout.heightKey);
      }
    }
    function workspaceKeyFor2(pid) {
      var prefix = projectPrefix2(pid);
      if (prefix === "") return WORKSPACE_KEY;
      return prefix + "workspace-v1";
    }
    function activeSidePanelKey(pid) {
      var prefix = projectPrefix2(pid);
      if (prefix === "") return ACTIVE_SIDE_PANEL_KEY;
      return prefix + "active-side-panel";
    }
    function migrateActiveSidePanelFromLegacy(pid) {
      if (backendLoad2(activeSidePanelKey(pid))) return null;
      if (readStoredHarpoonOpen2()) return "harpoon";
      if (readStoredLibraryOpen2()) return "library";
      if (readStoredInspectorOpen2()) return "inspector";
      if (readStoredExplorerOpen2()) return "explorer";
      return null;
    }
    function readStoredActiveSidePanel2(pid) {
      pid = pid || getActiveProjectId2();
      try {
        var raw = backendLoad2(activeSidePanelKey(pid));
        if (raw && SIDE_PANEL_IDS.indexOf(raw) !== -1) return raw;
      } catch (_) {
      }
      var migrated = migrateActiveSidePanelFromLegacy(pid);
      if (migrated) {
        writeStoredActiveSidePanel2(migrated, pid);
        return migrated;
      }
      return null;
    }
    function writeStoredActiveSidePanel2(id, pid) {
      pid = pid || getActiveProjectId2();
      var key = activeSidePanelKey(pid);
      if (!id || SIDE_PANEL_IDS.indexOf(id) === -1) {
        backendRemove2(key);
        writeStoredExplorerOpen2(false);
        writeStoredInspectorOpen2(false);
        writeStoredLibraryOpen2(false);
        writeStoredHarpoonOpen2(false);
        return;
      }
      backendSave2(key, id);
      if (id === "explorer") writeStoredExplorerOpen2(true);
      else writeStoredExplorerOpen2(false);
      if (id === "inspector") writeStoredInspectorOpen2(true);
      else writeStoredInspectorOpen2(false);
      if (id === "library") writeStoredLibraryOpen2(true);
      else writeStoredLibraryOpen2(false);
      if (id === "harpoon") writeStoredHarpoonOpen2(true);
      else writeStoredHarpoonOpen2(false);
    }
    function readStoredWorkspace2(pid) {
      pid = pid || getActiveProjectId2();
      return tryParse2(backendLoad2(workspaceKeyFor2(pid)));
    }
    function writeStoredWorkspace2(snapshot, pid) {
      pid = pid || getActiveProjectId2();
      try {
        backendSave2(workspaceKeyFor2(pid), JSON.stringify(snapshot));
        if (snapshot) {
          writeStoredActiveSidePanel2(snapshot.activeSidePanel || null, pid);
        }
        return true;
      } catch (_) {
        return false;
      }
    }
    function resetStoredWorkspace2(pid) {
      pid = pid || getActiveProjectId2();
      backendRemove2(workspaceKeyFor2(pid));
      backendRemove2(activeSidePanelKey(pid));
    }
    function resetWorkspaceState2(pid) {
      resetStoredWorkspace2(pid);
    }
    function resetWorkspacePrefs2() {
      resetStoredWorkspace2();
      backendRemove2(INSPECTOR_FOLLOW_KEY2);
      backendRemove2(RESTORE_PANELS_KEY);
      backendRemove2(LIBRARY_EXPAND_DEFAULT_KEY);
    }
    function clampEditorSplit2(ratio) {
      var n = Number(ratio);
      if (!isFinite(n)) return DEFAULT_EDITOR_SPLIT2;
      if (n < MIN_EDITOR_SPLIT2) return MIN_EDITOR_SPLIT2;
      if (n > MAX_EDITOR_SPLIT2) return MAX_EDITOR_SPLIT2;
      return n;
    }
    function readStoredEditorSplit2() {
      try {
        return clampEditorSplit2(parseFloat(backendLoad2(EDITOR_SPLIT_STORAGE_KEY2)));
      } catch (_) {
        return DEFAULT_EDITOR_SPLIT2;
      }
    }
    function writeStoredEditorSplit2(ratio) {
      var clamped = clampEditorSplit2(ratio);
      if (Math.abs(clamped - DEFAULT_EDITOR_SPLIT2) < 1e-3) {
        backendRemove2(EDITOR_SPLIT_STORAGE_KEY2);
      } else {
        backendSave2(EDITOR_SPLIT_STORAGE_KEY2, String(clamped));
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
          parseFloat(backendLoad2(layout.widthKey)),
          layout.minW,
          layout.maxW,
          DEFAULT_SIDE_PANEL_WIDTH2
        );
      } catch (_) {
        return DEFAULT_SIDE_PANEL_WIDTH2;
      }
    }
    function writeStoredSidePanelWidth(layout, px) {
      var clamped = clampPanelPx(px, layout.minW, layout.maxW, DEFAULT_SIDE_PANEL_WIDTH2);
      if (clamped === DEFAULT_SIDE_PANEL_WIDTH2) backendRemove2(layout.widthKey);
      else backendSave2(layout.widthKey, String(clamped));
    }
    function readStoredSidePanelHeight(layout) {
      try {
        return clampPanelPx(
          parseFloat(backendLoad2(layout.heightKey)),
          layout.minH,
          layout.maxH,
          DEFAULT_SIDE_PANEL_HEIGHT2
        );
      } catch (_) {
        return DEFAULT_SIDE_PANEL_HEIGHT2;
      }
    }
    function writeStoredSidePanelHeight(layout, px) {
      var clamped = clampPanelPx(px, layout.minH, layout.maxH, DEFAULT_SIDE_PANEL_HEIGHT2);
      if (clamped === DEFAULT_SIDE_PANEL_HEIGHT2) backendRemove2(layout.heightKey);
      else backendSave2(layout.heightKey, String(clamped));
    }
    function readStoredExplorerWidth2() {
      return readStoredSidePanelWidth(SIDE_PANEL_LAYOUT2.explorer);
    }
    function writeStoredExplorerWidth2(px) {
      writeStoredSidePanelWidth(SIDE_PANEL_LAYOUT2.explorer, px);
    }
    function readStoredInspectorWidth2() {
      return readStoredSidePanelWidth(SIDE_PANEL_LAYOUT2.inspector);
    }
    function writeStoredInspectorWidth2(px) {
      writeStoredSidePanelWidth(SIDE_PANEL_LAYOUT2.inspector, px);
    }
    function readStoredExplorerHeight2() {
      return readStoredSidePanelHeight(SIDE_PANEL_LAYOUT2.explorer);
    }
    function writeStoredExplorerHeight2(px) {
      writeStoredSidePanelHeight(SIDE_PANEL_LAYOUT2.explorer, px);
    }
    function readStoredInspectorHeight2() {
      return readStoredSidePanelHeight(SIDE_PANEL_LAYOUT2.inspector);
    }
    function writeStoredInspectorHeight2(px) {
      writeStoredSidePanelHeight(SIDE_PANEL_LAYOUT2.inspector, px);
    }
    function readStoredExplorerOpen2() {
      try {
        return backendLoad2(EXPLORER_OPEN_KEY2) === "1";
      } catch (_) {
        return false;
      }
    }
    function loadStat2() {
      try {
        var o = tryParse2(backendLoad2(LOAD_STATS_KEY2));
        if (o && o.lines > 0 && o.ms > 0) return o;
      } catch (_) {
      }
      return null;
    }
    function saveStat2(stat) {
      try {
        if (!stat || stat.lines <= 0 || stat.ms <= 0) return;
        backendSave2(LOAD_STATS_KEY2, JSON.stringify({ lines: stat.lines, ms: stat.ms }));
      } catch (_) {
      }
    }
    function writeStoredExplorerOpen2(open) {
      if (open) backendSave2(EXPLORER_OPEN_KEY2, "1");
      else backendRemove2(EXPLORER_OPEN_KEY2);
    }
    function readStoredInspectorOpen2() {
      try {
        return backendLoad2(INSPECTOR_OPEN_KEY2) === "1";
      } catch (_) {
        return false;
      }
    }
    function writeStoredInspectorOpen2(open) {
      if (open) backendSave2(INSPECTOR_OPEN_KEY2, "1");
      else backendRemove2(INSPECTOR_OPEN_KEY2);
    }
    function readStoredInspectorFollow2() {
      try {
        var v = backendLoad2(INSPECTOR_FOLLOW_KEY2);
        if (v === "1") return true;
        if (v === "off") return false;
        if (globalThis.sessionStorage && globalThis.sessionStorage.getItem(INSPECTOR_FOLLOW_KEY2) === "1") {
          writeStoredInspectorFollow2(true);
          return true;
        }
        return true;
      } catch (_) {
        return true;
      }
    }
    function writeStoredInspectorFollow2(on) {
      try {
        if (on) backendSave2(INSPECTOR_FOLLOW_KEY2, "1");
        else backendSave2(INSPECTOR_FOLLOW_KEY2, "off");
        if (globalThis.sessionStorage) globalThis.sessionStorage.removeItem(INSPECTOR_FOLLOW_KEY2);
      } catch (_) {
      }
    }
    function readStoredLibraryOpen2() {
      try {
        return backendLoad2(LIBRARY_OPEN_KEY2) === "1";
      } catch (_) {
        return false;
      }
    }
    function writeStoredLibraryOpen2(open) {
      if (open) backendSave2(LIBRARY_OPEN_KEY2, "1");
      else backendRemove2(LIBRARY_OPEN_KEY2);
    }
    function readStoredHarpoonOpen2() {
      try {
        return backendLoad2("beljar-harpoon-open") === "1";
      } catch (_) {
        return false;
      }
    }
    function writeStoredHarpoonOpen2(open) {
      if (open) backendSave2("beljar-harpoon-open", "1");
      else backendRemove2("beljar-harpoon-open");
    }
    function readStoredHarpoonDetailsCollapsed2() {
      try {
        return backendLoad2("beljar-harpoon-details-collapsed") === "1";
      } catch (_) {
        return false;
      }
    }
    function writeStoredHarpoonDetailsCollapsed2(collapsed) {
      if (collapsed) backendSave2("beljar-harpoon-details-collapsed", "1");
      else backendRemove2("beljar-harpoon-details-collapsed");
    }
    function readStoredLibraryWidth2() {
      return readStoredSidePanelWidth(SIDE_PANEL_LAYOUT2.library);
    }
    function writeStoredLibraryWidth2(px) {
      writeStoredSidePanelWidth(SIDE_PANEL_LAYOUT2.library, px);
    }
    function readStoredLibraryHeight2() {
      return readStoredSidePanelHeight(SIDE_PANEL_LAYOUT2.library);
    }
    function writeStoredLibraryHeight2(px) {
      writeStoredSidePanelHeight(SIDE_PANEL_LAYOUT2.library, px);
    }
    function readStoredHarpoonWidth2() {
      return readStoredSidePanelWidth(SIDE_PANEL_LAYOUT2.harpoon);
    }
    function writeStoredHarpoonWidth2(px) {
      writeStoredSidePanelWidth(SIDE_PANEL_LAYOUT2.harpoon, px);
    }
    function readStoredHarpoonHeight2() {
      return readStoredSidePanelHeight(SIDE_PANEL_LAYOUT2.harpoon);
    }
    function writeStoredHarpoonHeight2(px) {
      writeStoredSidePanelHeight(SIDE_PANEL_LAYOUT2.harpoon, px);
    }
    return {
      resetLayoutPrefs: resetLayoutPrefs2,
      workspaceKeyFor: workspaceKeyFor2,
      activeSidePanelKey,
      migrateActiveSidePanelFromLegacy,
      readStoredActiveSidePanel: readStoredActiveSidePanel2,
      writeStoredActiveSidePanel: writeStoredActiveSidePanel2,
      readStoredWorkspace: readStoredWorkspace2,
      writeStoredWorkspace: writeStoredWorkspace2,
      resetStoredWorkspace: resetStoredWorkspace2,
      resetWorkspaceState: resetWorkspaceState2,
      resetWorkspacePrefs: resetWorkspacePrefs2,
      clampEditorSplit: clampEditorSplit2,
      readStoredEditorSplit: readStoredEditorSplit2,
      writeStoredEditorSplit: writeStoredEditorSplit2,
      clampPanelPx,
      readStoredSidePanelWidth,
      writeStoredSidePanelWidth,
      readStoredSidePanelHeight,
      writeStoredSidePanelHeight,
      readStoredExplorerWidth: readStoredExplorerWidth2,
      writeStoredExplorerWidth: writeStoredExplorerWidth2,
      readStoredInspectorWidth: readStoredInspectorWidth2,
      writeStoredInspectorWidth: writeStoredInspectorWidth2,
      readStoredExplorerHeight: readStoredExplorerHeight2,
      writeStoredExplorerHeight: writeStoredExplorerHeight2,
      readStoredInspectorHeight: readStoredInspectorHeight2,
      writeStoredInspectorHeight: writeStoredInspectorHeight2,
      readStoredExplorerOpen: readStoredExplorerOpen2,
      loadStat: loadStat2,
      saveStat: saveStat2,
      writeStoredExplorerOpen: writeStoredExplorerOpen2,
      readStoredInspectorOpen: readStoredInspectorOpen2,
      writeStoredInspectorOpen: writeStoredInspectorOpen2,
      readStoredInspectorFollow: readStoredInspectorFollow2,
      writeStoredInspectorFollow: writeStoredInspectorFollow2,
      readStoredLibraryOpen: readStoredLibraryOpen2,
      writeStoredLibraryOpen: writeStoredLibraryOpen2,
      readStoredHarpoonOpen: readStoredHarpoonOpen2,
      writeStoredHarpoonOpen: writeStoredHarpoonOpen2,
      readStoredHarpoonDetailsCollapsed: readStoredHarpoonDetailsCollapsed2,
      writeStoredHarpoonDetailsCollapsed: writeStoredHarpoonDetailsCollapsed2,
      readStoredLibraryWidth: readStoredLibraryWidth2,
      writeStoredLibraryWidth: writeStoredLibraryWidth2,
      readStoredLibraryHeight: readStoredLibraryHeight2,
      writeStoredLibraryHeight: writeStoredLibraryHeight2,
      readStoredHarpoonWidth: readStoredHarpoonWidth2,
      writeStoredHarpoonWidth: writeStoredHarpoonWidth2,
      readStoredHarpoonHeight: readStoredHarpoonHeight2,
      writeStoredHarpoonHeight: writeStoredHarpoonHeight2
    };
  }

  // js/persist/persist-graph-prefs.mjs
  function create4(deps) {
    var DEFAULT_GRAPH_PREFS2 = deps.DEFAULT_GRAPH_PREFS;
    var GRAPH_PREFS_STORAGE_KEY2 = deps.GRAPH_PREFS_STORAGE_KEY;
    var LEGACY_GRAPH_LAYOUT_KEY2 = deps.LEGACY_GRAPH_LAYOUT_KEY;
    var LEGACY_GRAPH_IMPL_KEY2 = deps.LEGACY_GRAPH_IMPL_KEY;
    var LEGACY_GRAPH_DEPTH_KEY2 = deps.LEGACY_GRAPH_DEPTH_KEY;
    var LEGACY_GRAPH_SIDEBAR_KEY2 = deps.LEGACY_GRAPH_SIDEBAR_KEY;
    var backendLoad2 = deps.backendLoad;
    var backendSave2 = deps.backendSave;
    var backendRemove2 = deps.backendRemove;
    var tryParse2 = deps.tryParse;
    function normalizeGraphPrefs2(raw) {
      if (!raw || typeof raw !== "object") {
        return {
          layout: DEFAULT_GRAPH_PREFS2.layout,
          impl: DEFAULT_GRAPH_PREFS2.impl,
          depth: DEFAULT_GRAPH_PREFS2.depth,
          labelDensity: DEFAULT_GRAPH_PREFS2.labelDensity,
          sidebarCollapsed: DEFAULT_GRAPH_PREFS2.sidebarCollapsed
        };
      }
      var depth = parseInt(raw.depth, 10);
      if (!isFinite(depth)) depth = DEFAULT_GRAPH_PREFS2.depth;
      depth = Math.min(3, Math.max(1, depth));
      var labelDensity = parseInt(raw.labelDensity, 10);
      if (!isFinite(labelDensity)) labelDensity = DEFAULT_GRAPH_PREFS2.labelDensity;
      labelDensity = Math.min(5, Math.max(1, labelDensity));
      return {
        layout: raw.layout === "flat" ? "flat" : "force",
        impl: raw.impl === "hide" ? "hide" : "show",
        depth,
        labelDensity,
        sidebarCollapsed: !!raw.sidebarCollapsed
      };
    }
    function migrateLegacyGraphPrefs() {
      var prefs = normalizeGraphPrefs2(null);
      var touched = false;
      try {
        var layout = backendLoad2(LEGACY_GRAPH_LAYOUT_KEY2);
        if (layout === "flat") {
          prefs.layout = "flat";
          touched = true;
        }
        var impl = backendLoad2(LEGACY_GRAPH_IMPL_KEY2);
        if (impl === "hide" || impl === "nodes" || impl === "none") {
          prefs.impl = "hide";
          touched = true;
        }
        var depth = parseInt(backendLoad2(LEGACY_GRAPH_DEPTH_KEY2) || "", 10);
        if (isFinite(depth)) {
          prefs.depth = Math.min(3, Math.max(1, depth));
          touched = true;
        }
        var sidebar = backendLoad2(LEGACY_GRAPH_SIDEBAR_KEY2);
        if (sidebar === "collapsed") {
          prefs.sidebarCollapsed = true;
          touched = true;
        }
        if (touched) {
          backendSave2(GRAPH_PREFS_STORAGE_KEY2, JSON.stringify(prefs));
          backendRemove2(LEGACY_GRAPH_LAYOUT_KEY2);
          backendRemove2(LEGACY_GRAPH_IMPL_KEY2);
          backendRemove2(LEGACY_GRAPH_DEPTH_KEY2);
          backendRemove2(LEGACY_GRAPH_SIDEBAR_KEY2);
        }
      } catch (_) {
      }
      return prefs;
    }
    function readStoredGraphPrefs2() {
      try {
        var parsed = tryParse2(backendLoad2(GRAPH_PREFS_STORAGE_KEY2));
        if (parsed) return normalizeGraphPrefs2(parsed);
        return migrateLegacyGraphPrefs();
      } catch (_) {
        return normalizeGraphPrefs2(null);
      }
    }
    function writeStoredGraphPrefs2(partial) {
      var next = normalizeGraphPrefs2(Object.assign({}, readStoredGraphPrefs2(), partial || {}));
      backendSave2(GRAPH_PREFS_STORAGE_KEY2, JSON.stringify(next));
      return next;
    }
    return {
      normalizeGraphPrefs: normalizeGraphPrefs2,
      migrateLegacyGraphPrefs,
      readStoredGraphPrefs: readStoredGraphPrefs2,
      writeStoredGraphPrefs: writeStoredGraphPrefs2
    };
  }

  // js/persist/persist-projects.mjs
  function create5(deps) {
    var PROJECTS_KEY2 = deps.PROJECTS_KEY;
    var ACTIVE_PROJECT_KEY2 = deps.ACTIVE_PROJECT_KEY;
    var DEFAULT_PROJECT_ID2 = deps.DEFAULT_PROJECT_ID;
    var DEFAULT_PROJECT_NAME2 = deps.DEFAULT_PROJECT_NAME;
    var DEFAULT_DOCUMENT_ID2 = deps.DEFAULT_DOCUMENT_ID;
    var PROJECT_NAME_KEY2 = deps.PROJECT_NAME_KEY;
    var backendLoad2 = deps.backendLoad;
    var backendSave2 = deps.backendSave;
    var backendRemove2 = deps.backendRemove;
    var tryParse2 = deps.tryParse;
    var projKey2 = deps.projKey;
    var stateKeyFor2 = deps.stateKeyFor;
    var replaceProject2 = deps.replaceProject;
    function readProjects() {
      var raw = tryParse2(backendLoad2(PROJECTS_KEY2));
      return Array.isArray(raw) && raw.length ? raw : null;
    }
    function writeProjects(projects) {
      backendSave2(PROJECTS_KEY2, JSON.stringify(projects));
    }
    function ensureProjects() {
      var projects = readProjects();
      if (projects) return projects;
      var legacyName = backendLoad2(PROJECT_NAME_KEY2);
      projects = [{
        id: DEFAULT_PROJECT_ID2,
        name: legacyName && String(legacyName).trim() || DEFAULT_PROJECT_NAME2,
        createdAt: Date.now()
      }];
      writeProjects(projects);
      if (!backendLoad2(ACTIVE_PROJECT_KEY2)) backendSave2(ACTIVE_PROJECT_KEY2, DEFAULT_PROJECT_ID2);
      return projects;
    }
    function listProjects2() {
      return ensureProjects();
    }
    function getActiveProjectId2() {
      ensureProjects();
      var id = backendLoad2(ACTIVE_PROJECT_KEY2);
      var projects = readProjects() || [];
      if (id && projects.some(function(p) {
        return p.id === id;
      })) return id;
      return projects.length ? projects[0].id : DEFAULT_PROJECT_ID2;
    }
    function setActiveProjectId2(id) {
      ensureProjects();
      backendSave2(ACTIVE_PROJECT_KEY2, id);
    }
    function getActiveProject2() {
      var id = getActiveProjectId2();
      var projects = readProjects() || [];
      for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === id) return projects[i];
      }
      return projects[0] || null;
    }
    function createProject2(name) {
      var projects = ensureProjects();
      var used = {};
      for (var i = 0; i < projects.length; i++) used[projects[i].id] = true;
      var base = "p-" + Date.now().toString(36);
      var id = base;
      var n = 1;
      while (used[id]) {
        id = base + "-" + n;
        n += 1;
      }
      projects.push({
        id,
        name: String(name || DEFAULT_PROJECT_NAME2).trim() || DEFAULT_PROJECT_NAME2,
        createdAt: Date.now()
      });
      writeProjects(projects);
      backendSave2(projKey2("files", id), JSON.stringify([{ id: DEFAULT_DOCUMENT_ID2, name: "main.bel" }]));
      backendSave2(projKey2("active-file", id), DEFAULT_DOCUMENT_ID2);
      backendSave2(projKey2("open-files", id), JSON.stringify([DEFAULT_DOCUMENT_ID2]));
      backendSave2(projKey2("empty-folders", id), JSON.stringify([]));
      return id;
    }
    function renameProject2(id, name) {
      var projects = ensureProjects();
      var trimmed = String(name != null ? name : "").trim() || DEFAULT_PROJECT_NAME2;
      for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === id) {
          projects[i].name = trimmed;
          writeProjects(projects);
          if (id === DEFAULT_PROJECT_ID2) backendSave2(PROJECT_NAME_KEY2, trimmed);
          return true;
        }
      }
      return false;
    }
    function deleteProject2(id) {
      var projects = ensureProjects();
      if (projects.length <= 1) return null;
      var idx = -1;
      for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === id) {
          idx = i;
          break;
        }
      }
      if (idx === -1) return null;
      var files = tryParse2(backendLoad2(projKey2("files", id)));
      if (Array.isArray(files)) {
        for (var j = 0; j < files.length; j++) backendRemove2(stateKeyFor2(files[j].id, id));
      }
      backendRemove2(projKey2("files", id));
      backendRemove2(projKey2("active-file", id));
      backendRemove2(projKey2("open-files", id));
      backendRemove2(projKey2("default-cfg", id));
      backendRemove2(projKey2("active-cfg-by-dir", id));
      backendRemove2(projKey2("empty-folders", id));
      projects.splice(idx, 1);
      writeProjects(projects);
      var nextId = projects[Math.max(0, idx - 1)].id;
      if (getActiveProjectId2() === id) setActiveProjectId2(nextId);
      return nextId;
    }
    function newBlankProject2(name) {
      var id = createProject2(name);
      setActiveProjectId2(id);
      return id;
    }
    function createProjectWithFiles2(name, entries, options) {
      var id = createProject2(name);
      setActiveProjectId2(id);
      var result = replaceProject2(entries, options || {});
      return { projectId: id, files: result.files, activeId: result.activeId };
    }
    return {
      readProjects,
      writeProjects,
      ensureProjects,
      listProjects: listProjects2,
      getActiveProjectId: getActiveProjectId2,
      setActiveProjectId: setActiveProjectId2,
      getActiveProject: getActiveProject2,
      createProject: createProject2,
      renameProject: renameProject2,
      deleteProject: deleteProject2,
      newBlankProject: newBlankProject2,
      createProjectWithFiles: createProjectWithFiles2
    };
  }

  // js/persist/persist-file-registry.mjs
  function create6(deps) {
    var backendLoad2 = deps.backendLoad;
    var backendSave2 = deps.backendSave;
    var backendRemove2 = deps.backendRemove;
    var tryParse2 = deps.tryParse;
    var projKey2 = deps.projKey;
    var stateKeyFor2 = deps.stateKeyFor;
    var defaultBackend2 = deps.defaultBackend;
    var readState2 = deps.readState;
    var emptyState2 = deps.emptyState;
    var DEFAULT_DOCUMENT_ID2 = deps.DEFAULT_DOCUMENT_ID;
    var dirOf2 = deps.dirOf;
    var expandAliasesForStorage2 = deps.expandAliasesForStorage;
    var fileNameForId2 = deps.fileNameForId;
    var readStoredCfgAutoSync2 = deps.readStoredCfgAutoSync;
    var writeOpenFileIds2 = deps.writeOpenFileIds;
    var closeOpenFile2 = deps.closeOpenFile;
    var writeActiveCfgByDir2 = deps.writeActiveCfgByDir;
    var setActiveCfgForDir2 = deps.setActiveCfgForDir;
    var removeActiveCfgForDir2 = deps.removeActiveCfgForDir;
    var readActiveCfgByDir2 = deps.readActiveCfgByDir;
    var normalizeActiveCfgList2 = deps.normalizeActiveCfgList;
    var setProjectName2 = deps.setProjectName;
    function readProjectFiles2() {
      var raw = tryParse2(backendLoad2(projKey2("files")));
      if (Array.isArray(raw)) return raw;
      return null;
    }
    function writeProjectFiles(files) {
      backendSave2(projKey2("files"), JSON.stringify(files));
    }
    function readEmptyFolders() {
      var raw = tryParse2(backendLoad2(projKey2("empty-folders")));
      if (!Array.isArray(raw)) return [];
      return raw.filter(function(p) {
        return typeof p === "string" && p;
      });
    }
    function writeEmptyFolders(paths) {
      backendSave2(projKey2("empty-folders"), JSON.stringify(paths || []));
    }
    function listEmptyFolders2() {
      return readEmptyFolders();
    }
    function addEmptyFolder2(path) {
      var p = String(path || "").trim();
      if (!p) return;
      var list = readEmptyFolders();
      if (list.indexOf(p) !== -1) return;
      list.push(p);
      list.sort();
      writeEmptyFolders(list);
    }
    function removeEmptyFolder2(path) {
      var p = String(path || "");
      var list = readEmptyFolders();
      var next = list.filter(function(x) {
        return x !== p;
      });
      if (next.length === list.length) return;
      writeEmptyFolders(next);
    }
    function clearEmptyFolders2() {
      writeEmptyFolders([]);
    }
    function pruneEmptyFoldersUnder2(prefix) {
      var p = String(prefix || "").trim();
      if (!p) {
        clearEmptyFolders2();
        return;
      }
      var list = readEmptyFolders();
      var kept = list.filter(function(x) {
        return x !== p && x.indexOf(p + "/") !== 0;
      });
      if (kept.length !== list.length) writeEmptyFolders(kept);
    }
    function renameEmptyFolderPrefix2(from, to) {
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
      }
    }
    function pruneEmptyFoldersForFile(filePath) {
      var name = String(filePath || "");
      if (!name) return;
      var list = readEmptyFolders();
      var next = list.filter(function(ef) {
        return name !== ef && name.indexOf(ef + "/") !== 0;
      });
      if (next.length !== list.length) writeEmptyFolders(next);
    }
    function folderSubtreeOccupied(folderPath, files, emptyFolders) {
      if (!folderPath) return files.length > 0 || emptyFolders.length > 0;
      var prefix = folderPath + "/";
      for (var i = 0; i < files.length; i++) {
        if (files[i].name.indexOf(prefix) === 0) return true;
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
      var files = ensureProject2();
      var empty = readEmptyFolders();
      for (var i = parts.length - 1; i >= 0; i--) {
        var fp = parts.slice(0, i + 1).join("/");
        if (skipPrefixes && isPrefixUnderAny(fp, skipPrefixes)) continue;
        if (!folderSubtreeOccupied(fp, files, empty)) {
          addEmptyFolder2(fp);
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
    function relocatedPrefixTarget(prefix, moves, files) {
      var ps = prefix + "/";
      for (var i = 0; i < files.length; i++) {
        var n = files[i].name;
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
    function inferRelocatedFolderPrefixes(moves, files) {
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
        var target = relocatedPrefixTarget(prefix, moves, files);
        if (target != null) out[prefix] = target;
      }
      return out;
    }
    function preserveEmptyFoldersAfterMoves2(moves) {
      if (!moves || !moves.length) return;
      var files = ensureProject2();
      var reloc = inferRelocatedFolderPrefixes(moves, files);
      for (var oldP in reloc) {
        renameEmptyFolderPrefix2(oldP, reloc[oldP]);
        removeEmptyFolder2(oldP);
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
    function ensureProject2() {
      var files = readProjectFiles2();
      if (files !== null) return files;
      var defaultFile = { id: DEFAULT_DOCUMENT_ID2, name: "main.bel" };
      files = [defaultFile];
      writeProjectFiles(files);
      backendSave2(projKey2("active-file"), DEFAULT_DOCUMENT_ID2);
      return files;
    }
    function listFiles2() {
      return ensureProject2();
    }
    function getActiveFileId2() {
      var files = listFiles2();
      if (!files.length) return null;
      var id = backendLoad2(projKey2("active-file"));
      if (id && files.some(function(f) {
        return f.id === id;
      })) return id;
      return files[0].id;
    }
    function setActiveFileId2(id) {
      backendSave2(projKey2("active-file"), id);
    }
    function uniqueFileId(name, used) {
      var id = "workspace://" + (name || "untitled.bel");
      var base = id;
      var counter = 1;
      while (used[id]) {
        var dot = base.lastIndexOf(".");
        id = dot > 10 ? base.slice(0, dot) + "-" + counter + base.slice(dot) : base + "-" + counter;
        counter++;
      }
      used[id] = true;
      return id;
    }
    function replaceProject2(entries, options) {
      options = options || {};
      var old = readProjectFiles2() || [];
      for (var i = 0; i < old.length; i++) {
        backendRemove2(stateKeyFor2(old[i].id));
      }
      var used = {};
      var files = [];
      var list = entries || [];
      for (var j = 0; j < list.length; j++) {
        var ent = list[j];
        var name = String(ent.name || "untitled.bel");
        var id = uniqueFileId(name, used);
        files.push({ id, name });
        var state = emptyState2(id);
        state.editor.text = expandAliasesForStorage2(ent.text, name);
        state.meta.updatedAt = Date.now();
        state.meta.revision = 1;
        backendSave2(stateKeyFor2(id), JSON.stringify(state));
      }
      writeProjectFiles(files);
      var activeId = options.activeId;
      if (!activeId || !files.some(function(f) {
        return f.id === activeId;
      })) {
        activeId = files.length ? files[0].id : null;
      }
      if (activeId) backendSave2(projKey2("active-file"), activeId);
      writeOpenFileIds2(options.openIds && options.openIds.length ? options.openIds.filter(function(id2) {
        return files.some(function(f) {
          return f.id === id2;
        });
      }) : activeId ? [activeId] : []);
      if (options.projectName) setProjectName2(options.projectName);
      if (options.activeCfgByDir && typeof options.activeCfgByDir === "object") {
        writeActiveCfgByDir2(options.activeCfgByDir);
      } else if (options.defaultCfgPath) {
        setActiveCfgForDir2(dirOf2(options.defaultCfgPath), options.defaultCfgPath);
      } else {
        writeActiveCfgByDir2({});
      }
      writeEmptyFolders([]);
      return { files, activeId };
    }
    function createFile2(name) {
      var files = ensureProject2();
      var used = {};
      for (var u = 0; u < files.length; u++) used[files[u].id] = true;
      var fileName = name || "untitled.bel";
      var id = uniqueFileId(fileName, used);
      files.push({ id, name: fileName });
      writeProjectFiles(files);
      pruneEmptyFoldersForFile(fileName);
      return id;
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
        var activeId = getActiveFileId2();
        var ed = g2.CurrentEditor;
        if (fileId === activeId && ed && typeof ed.getValue === "function") {
          return String(ed.getValue() ?? "");
        }
      }
      return getFileText2(fileId);
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
      var oldDir = dirOf2(oldName);
      var newDir = newName != null ? dirOf2(newName) : null;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var t = line.trim();
        var low = t.toLowerCase();
        var isEntry = isCfgEntryLine(t);
        if (!isEntry) {
          out.push(line);
          continue;
        }
        var resolved = resolveCfgEntryPath(cfgDir, t);
        if (resolved !== oldName) {
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
    function restoreDeletedFile2(id, name, text) {
      var files = ensureProject2();
      for (var i = 0; i < files.length; i++) {
        if (files[i].id === id) return false;
      }
      files.push({ id, name });
      writeProjectFiles(files);
      var state = emptyState2(id);
      state.editor.text = expandAliasesForStorage2(text, name);
      state.meta.updatedAt = Date.now();
      state.meta.revision = 1;
      backendSave2(stateKeyFor2(id), JSON.stringify(state));
      pruneEmptyFoldersForFile(name);
      return true;
    }
    function deleteFile2(id) {
      var files = ensureProject2();
      var idx = -1;
      for (var i = 0; i < files.length; i++) {
        if (files[i].id === id) {
          idx = i;
          break;
        }
      }
      if (idx === -1) return null;
      var deletedName = files[idx].name;
      if (/\.cfg$/i.test(deletedName)) {
        removeActiveCfgForDir2(dirOf2(deletedName), deletedName);
      }
      files.splice(idx, 1);
      writeProjectFiles(files);
      rewriteCfgsForOp(deletedName, null);
      closeOpenFile2(id);
      defaultBackend2.removeSync(stateKeyFor2(id));
      preserveEmptyFoldersAfterPath(deletedName);
      if (!files.length) {
        backendRemove2(projKey2("active-file"));
        writeOpenFileIds2([]);
      }
      return files.length ? files[Math.max(0, idx - 1)].id : null;
    }
    function rewriteCfgsForOp(oldName, newName) {
      if (!readStoredCfgAutoSync2()) return [];
      var files = ensureProject2();
      var updatedIds = [];
      for (var i = 0; i < files.length; i++) {
        var fn = files[i].name;
        if (!/\.cfg$/i.test(fn)) continue;
        var cfgDir = dirOf2(fn);
        var text = cfgTextForRewrite(files[i].id);
        if (!cfgListsEntry(text, cfgDir, oldName)) continue;
        var updated = rewriteCfgBody(text, cfgDir, oldName, newName);
        if (updated != null) {
          setFileText2(files[i].id, updated);
          updatedIds.push(files[i].id);
        }
      }
      notifyCfgRewritten(updatedIds);
      return updatedIds;
    }
    function renameFile2(id, newName) {
      var files = ensureProject2();
      for (var i = 0; i < files.length; i++) {
        if (files[i].id === id) {
          var oldName = files[i].name;
          files[i].name = newName;
          writeProjectFiles(files);
          rewriteCfgsForOp(oldName, newName);
          var map = readActiveCfgByDir2();
          var changed = false;
          for (var k in map) {
            if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
            var list = normalizeActiveCfgList2(map[k]);
            for (var j = 0; j < list.length; j++) {
              if (list[j] === oldName) {
                list[j] = newName;
                changed = true;
              }
            }
            if (list.length) map[k] = list;
          }
          if (changed) writeActiveCfgByDir2(map);
          pruneEmptyFoldersForFile(newName);
          if (oldName !== newName) preserveEmptyFoldersAfterPath(oldName);
          return;
        }
      }
    }
    function cfgFileByPath(cfgPath) {
      var files = ensureProject2();
      for (var i = 0; i < files.length; i++) {
        if (files[i].name === cfgPath) return files[i];
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
    function addEntryToCfg2(cfgPath, fileName) {
      var cfg = cfgFileByPath(cfgPath);
      if (!cfg) return false;
      var dir = dirOf2(cfgPath);
      var rel = relToCfgDir(dir, fileName);
      if (rel == null || rel === "") return false;
      var text = String(getFileText2(cfg.id) || "");
      if (cfgListsEntry(text, dir, fileName)) return false;
      var body = text.replace(/\s*$/, "");
      setFileText2(cfg.id, (body ? body + "\n" : "") + rel + "\n");
      return true;
    }
    function prependEntryToCfg2(cfgPath, fileName) {
      var cfg = cfgFileByPath(cfgPath);
      if (!cfg) return false;
      var dir = dirOf2(cfgPath);
      var rel = relToCfgDir(dir, fileName);
      if (rel == null || rel === "") return false;
      var text = String(getFileText2(cfg.id) || "");
      if (cfgListsEntry(text, dir, fileName)) return false;
      var lines = text.split("\n");
      var firstEntry = -1;
      for (var i = 0; i < lines.length; i++) {
        var t = lines[i].trim();
        if (isCfgEntryLine(t)) {
          firstEntry = i;
          break;
        }
      }
      if (firstEntry === -1) {
        var body = text.replace(/\s*$/, "");
        setFileText2(cfg.id, (body ? body + "\n" : "") + rel + "\n");
        return true;
      }
      var before = lines.slice(0, firstEntry).join("\n");
      var after = lines.slice(firstEntry).join("\n");
      var prefix = before.length ? before + "\n" : "";
      setFileText2(cfg.id, prefix + rel + "\n" + after);
      return true;
    }
    function removeEntryFromCfg2(cfgPath, fileName) {
      var cfg = cfgFileByPath(cfgPath);
      if (!cfg) return false;
      var updated = rewriteCfgBody(getFileText2(cfg.id), dirOf2(cfgPath), fileName, null);
      if (updated == null) return false;
      setFileText2(cfg.id, updated);
      return true;
    }
    function moveEntryInCfg2(cfgPath, fileName, delta) {
      var cfg = cfgFileByPath(cfgPath);
      if (!cfg) return false;
      var dir = dirOf2(cfgPath);
      var lines = String(getFileText2(cfg.id) || "").split("\n");
      var entryLineIdx = [];
      var targetAt = -1;
      for (var i = 0; i < lines.length; i++) {
        var t = lines[i].trim();
        var low = t.toLowerCase();
        var isEntry = isCfgEntryLine(t);
        if (!isEntry) continue;
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
      setFileText2(cfg.id, lines.join("\n"));
      return true;
    }
    function getFileById2(id) {
      var files = listFiles2();
      for (var i = 0; i < files.length; i++) {
        if (files[i].id === id) return files[i];
      }
      return null;
    }
    function moveFile2(id, delta) {
      var files = ensureProject2();
      var idx = -1;
      for (var i = 0; i < files.length; i++) {
        if (files[i].id === id) {
          idx = i;
          break;
        }
      }
      if (idx === -1) return false;
      var to = Math.max(0, Math.min(files.length - 1, idx + (delta || 0)));
      if (to === idx) return false;
      var entry = files.splice(idx, 1)[0];
      files.splice(to, 0, entry);
      writeProjectFiles(files);
      return true;
    }
    var fileTextCache = /* @__PURE__ */ new Map();
    function getFileText2(id) {
      var raw = defaultBackend2.loadSync(stateKeyFor2(id));
      var hit = fileTextCache.get(id);
      if (hit && hit.raw === raw) return hit.text;
      var state = readState2(defaultBackend2, id);
      var text = state && state.editor && typeof state.editor.text === "string" ? state.editor.text : "";
      if (fileTextCache.size > 512) fileTextCache.clear();
      fileTextCache.set(id, { raw, text });
      return text;
    }
    function setFileText2(id, text) {
      var state = readState2(defaultBackend2, id);
      state.editor.text = expandAliasesForStorage2(text, fileNameForId2(id));
      state.meta.updatedAt = Date.now();
      state.meta.revision = (state.meta.revision || 0) + 1;
      backendSave2(stateKeyFor2(id), JSON.stringify(state));
      fileTextCache.delete(id);
      try {
        if (typeof BelEditor !== "undefined" && typeof BelEditor.invalidateFileHealthAfterChange === "function") {
          BelEditor.invalidateFileHealthAfterChange(id);
        }
      } catch (_) {
      }
    }
    return {
      readProjectFiles: readProjectFiles2,
      writeProjectFiles,
      readEmptyFolders,
      writeEmptyFolders,
      listEmptyFolders: listEmptyFolders2,
      addEmptyFolder: addEmptyFolder2,
      removeEmptyFolder: removeEmptyFolder2,
      clearEmptyFolders: clearEmptyFolders2,
      pruneEmptyFoldersUnder: pruneEmptyFoldersUnder2,
      renameEmptyFolderPrefix: renameEmptyFolderPrefix2,
      pruneEmptyFoldersForFile,
      folderSubtreeOccupied,
      preserveEmptyFoldersAfterPath,
      isPrefixUnderAny,
      relocatedPrefixTarget,
      inferRelocatedFolderPrefixes,
      preserveEmptyFoldersAfterMoves: preserveEmptyFoldersAfterMoves2,
      ensureProject: ensureProject2,
      listFiles: listFiles2,
      getActiveFileId: getActiveFileId2,
      setActiveFileId: setActiveFileId2,
      uniqueFileId,
      replaceProject: replaceProject2,
      createFile: createFile2,
      relToCfgDir,
      resolveCfgEntryPath,
      isCfgEntryToken,
      isCfgEntryLine,
      cfgTextForRewrite,
      notifyCfgRewritten,
      rewriteCfgBody,
      restoreDeletedFile: restoreDeletedFile2,
      deleteFile: deleteFile2,
      rewriteCfgsForOp,
      renameFile: renameFile2,
      cfgFileByPath,
      cfgListsEntry,
      addEntryToCfg: addEntryToCfg2,
      prependEntryToCfg: prependEntryToCfg2,
      removeEntryFromCfg: removeEntryFromCfg2,
      moveEntryInCfg: moveEntryInCfg2,
      getFileById: getFileById2,
      moveFile: moveFile2,
      getFileText: getFileText2,
      setFileText: setFileText2
    };
  }

  // js/persist/persist-open-tabs.mjs
  function create7(deps) {
    var backendLoad2 = deps.backendLoad;
    var backendSave2 = deps.backendSave;
    var backendRemove2 = deps.backendRemove;
    var tryParse2 = deps.tryParse;
    var projKey2 = deps.projKey;
    var listFiles2 = deps.listFiles;
    var getFileById2 = deps.getFileById;
    var readProjectFiles2 = deps.readProjectFiles;
    var getActiveProject2 = deps.getActiveProject;
    var renameProject2 = deps.renameProject;
    var getActiveProjectId2 = deps.getActiveProjectId;
    var DEFAULT_PROJECT_NAME2 = deps.DEFAULT_PROJECT_NAME;
    var dirOf2 = deps.dirOf;
    var defaultBackend2 = deps.defaultBackend;
    var getActiveFileId2 = deps.getActiveFileId;
    function writeOpenFileIds2(ids) {
      backendSave2(projKey2("open-files"), JSON.stringify(ids));
    }
    function setOpenFileIds2(ids) {
      writeOpenFileIds2(ids || []);
    }
    function getOpenFileIds2() {
      var files = listFiles2();
      if (!files.length) return [];
      var valid = {};
      for (var i = 0; i < files.length; i++) valid[files[i].id] = true;
      var raw = tryParse2(backendLoad2(projKey2("open-files")));
      if (!Array.isArray(raw)) {
        var all = files.map(function(f) {
          return f.id;
        });
        writeOpenFileIds2(all);
        return all;
      }
      var out = [];
      for (var j = 0; j < raw.length; j++) {
        if (valid[raw[j]] && out.indexOf(raw[j]) === -1) out.push(raw[j]);
      }
      return out;
    }
    function openFile2(id) {
      var ids = getOpenFileIds2();
      if (!getFileById2(id)) return ids;
      if (ids.indexOf(id) === -1) {
        ids.push(id);
        writeOpenFileIds2(ids);
      }
      return ids;
    }
    function closeOpenFile2(id) {
      var ids = getOpenFileIds2();
      var idx = ids.indexOf(id);
      if (idx === -1) return ids;
      ids.splice(idx, 1);
      writeOpenFileIds2(ids);
      return ids;
    }
    function getProjectName2() {
      try {
        var p = getActiveProject2();
        return p && p.name && String(p.name).trim() ? String(p.name).trim() : DEFAULT_PROJECT_NAME2;
      } catch (_) {
        return DEFAULT_PROJECT_NAME2;
      }
    }
    function setProjectName2(name) {
      renameProject2(getActiveProjectId2(), name);
    }
    function normalizeActiveCfgList2(val) {
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
    function readActiveCfgByDir2() {
      var raw = tryParse2(backendLoad2(projKey2("active-cfg-by-dir")));
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        var normalized = {};
        var keys = Object.keys(raw);
        for (var ki = 0; ki < keys.length; ki++) {
          var k = keys[ki];
          normalized[k] = normalizeActiveCfgList2(raw[k]);
        }
        return normalized;
      }
      var migrated = {};
      var legacy = backendLoad2(projKey2("default-cfg"));
      if (legacy && String(legacy).trim()) {
        migrated[dirOf2(String(legacy).trim())] = [String(legacy).trim()];
        writeActiveCfgByDir2(migrated);
        defaultBackend2.removeSync(projKey2("default-cfg"));
      }
      return migrated;
    }
    function writeActiveCfgByDir2(map) {
      var out = {};
      var keys = Object.keys(map || {});
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var list = normalizeActiveCfgList2(map[k]);
        if (list.length) out[k] = list;
      }
      if (!Object.keys(out).length) {
        backendRemove2(projKey2("active-cfg-by-dir"));
        return;
      }
      backendSave2(projKey2("active-cfg-by-dir"), JSON.stringify(out));
    }
    function getActiveCfgsForDir2(dir) {
      var map = readActiveCfgByDir2();
      var d = dir != null ? String(dir) : "";
      return normalizeActiveCfgList2(map[d]);
    }
    function getActiveCfgForDir2(dir) {
      var list = getActiveCfgsForDir2(dir);
      return list.length ? list[0] : null;
    }
    function setActiveCfgsForDir2(dir, paths) {
      var map = readActiveCfgByDir2();
      var d = dir != null ? String(dir) : "";
      var list = normalizeActiveCfgList2(paths);
      if (list.length) map[d] = list;
      else delete map[d];
      writeActiveCfgByDir2(map);
    }
    function setActiveCfgForDir2(dir, path) {
      var trimmed = String(path != null ? path : "").trim();
      if (trimmed) setActiveCfgsForDir2(dir, [trimmed]);
      else setActiveCfgsForDir2(dir, []);
    }
    function addActiveCfgForDir2(dir, path) {
      var trimmed = String(path != null ? path : "").trim();
      if (!trimmed) return;
      var list = getActiveCfgsForDir2(dir);
      for (var i = 0; i < list.length; i++) {
        if (list[i] === trimmed) return;
      }
      list.push(trimmed);
      setActiveCfgsForDir2(dir, list);
    }
    function removeActiveCfgForDir2(dir, path) {
      var trimmed = String(path != null ? path : "").trim();
      if (!trimmed) return;
      var list = getActiveCfgsForDir2(dir);
      var next = [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] !== trimmed) next.push(list[i]);
      }
      setActiveCfgsForDir2(dir, next);
    }
    function getActiveCfgByDir2() {
      return readActiveCfgByDir2();
    }
    function backfillActiveCfgByDir2(byDir) {
      if (!byDir || typeof byDir !== "object") return readActiveCfgByDir2();
      var map = readActiveCfgByDir2();
      var changed = false;
      for (var d in byDir) {
        if (!Object.prototype.hasOwnProperty.call(byDir, d)) continue;
        var path = String(byDir[d] != null ? byDir[d] : "").trim();
        if (!path || normalizeActiveCfgList2(map[d]).length) continue;
        map[d] = [path];
        changed = true;
      }
      if (changed) writeActiveCfgByDir2(map);
      return map;
    }
    function getDefaultCfgPath2() {
      try {
        var activeId = getActiveFileId2();
        var files = readProjectFiles2() || [];
        for (var i = 0; i < files.length; i++) {
          if (files[i].id === activeId) return getActiveCfgForDir2(dirOf2(files[i].name));
        }
        return null;
      } catch (_) {
        return null;
      }
    }
    function setDefaultCfgPath2(path) {
      var trimmed = String(path != null ? path : "").trim();
      if (!trimmed) return;
      setActiveCfgForDir2(dirOf2(trimmed), trimmed);
    }
    return {
      writeOpenFileIds: writeOpenFileIds2,
      setOpenFileIds: setOpenFileIds2,
      getOpenFileIds: getOpenFileIds2,
      openFile: openFile2,
      closeOpenFile: closeOpenFile2,
      getProjectName: getProjectName2,
      setProjectName: setProjectName2,
      normalizeActiveCfgList: normalizeActiveCfgList2,
      readActiveCfgByDir: readActiveCfgByDir2,
      writeActiveCfgByDir: writeActiveCfgByDir2,
      getActiveCfgsForDir: getActiveCfgsForDir2,
      getActiveCfgForDir: getActiveCfgForDir2,
      setActiveCfgsForDir: setActiveCfgsForDir2,
      setActiveCfgForDir: setActiveCfgForDir2,
      addActiveCfgForDir: addActiveCfgForDir2,
      removeActiveCfgForDir: removeActiveCfgForDir2,
      getActiveCfgByDir: getActiveCfgByDir2,
      backfillActiveCfgByDir: backfillActiveCfgByDir2,
      getDefaultCfgPath: getDefaultCfgPath2,
      setDefaultCfgPath: setDefaultCfgPath2
    };
  }

  // js/persist/persist.mjs
  var SCHEMA_VERSION = 3;
  var LEGACY_CHECKPOINT_V2 = 2;
  var LEGACY_SCHEMA_VERSION = 1;
  var STATE_KEY = "beljar-state-v2";
  var LEGACY_STATE_KEY = "beljar-state-v1";
  var LEGACY_SEMANTIC_TYPES_KEY = "beljar:semantic-types";
  var DEFAULT_DOCUMENT_ID = "workspace://main.bel";
  var THEME_STORAGE_KEY = "beljar-theme";
  var UI_FONT_SIZE_KEY = "beljar-ui-font-size";
  var UI_FONT_SCALES = { sm: 0.875, md: 1, lg: 1.125, xl: 1.25 };
  var UI_TEXT_CONTRAST_KEY = "beljar-ui-text-contrast";
  var UI_TEXT_CONTRAST_MULTIPLIERS = { low: 1, medium: 1.6, high: 2.4, maximum: 4.5 };
  var BELUGA_MODE_STORAGE_KEY = "beljar-beluga-mode";
  var EDITOR_SPLIT_STORAGE_KEY = globalThis.BELJAR_SPLIT_KEY || "beljar-editor-split";
  var GRAPH_PREFS_STORAGE_KEY = "beljar-graph-prefs";
  var LEGACY_GRAPH_LAYOUT_KEY = "beljar:graph-layout";
  var LEGACY_GRAPH_IMPL_KEY = "beljar:graph-impl";
  var LEGACY_GRAPH_DEPTH_KEY = "beljar:graph-depth";
  var LEGACY_GRAPH_SIDEBAR_KEY = "beljar:graph-sidebar";
  var PROJECT_FILES_KEY = "beljar-project-files";
  var PROJECT_NAME_KEY = "beljar-project-name";
  var DEFAULT_CFG_KEY = "beljar-default-cfg";
  var ACTIVE_CFG_BY_DIR_KEY = "beljar-active-cfg-by-dir";
  var ACTIVE_FILE_KEY = "beljar-active-file";
  var OPEN_FILES_KEY = "beljar-open-files";
  var DEFAULT_PROJECT_NAME = "Untitled Project";
  var PROJECTS_KEY = "beljar-projects";
  var ACTIVE_PROJECT_KEY = "beljar-active-project";
  var DEFAULT_PROJECT_ID = "default";
  var DEFAULT_GRAPH_PREFS = Object.freeze({
    layout: "force",
    impl: "show",
    depth: 1,
    labelDensity: 3,
    sidebarCollapsed: false
  });
  var DEFAULT_EDITOR_SPLIT = globalThis.BELJAR_SPLIT_DEFAULT != null ? globalThis.BELJAR_SPLIT_DEFAULT : 0.5;
  var MIN_EDITOR_SPLIT = globalThis.BELJAR_SPLIT_MIN != null ? globalThis.BELJAR_SPLIT_MIN : 0.18;
  var MAX_EDITOR_SPLIT = globalThis.BELJAR_SPLIT_MAX != null ? globalThis.BELJAR_SPLIT_MAX : 0.82;
  var EXPLORER_WIDTH_KEY = "beljar-explorer-w";
  var INSPECTOR_WIDTH_KEY = "beljar-inspector-w";
  var EXPLORER_HEIGHT_KEY = "beljar-explorer-h";
  var INSPECTOR_HEIGHT_KEY = "beljar-inspector-h";
  var EXPLORER_OPEN_KEY = "beljar-explorer-open";
  var LOAD_STATS_KEY = "beljar.loadStats";
  var INSPECTOR_OPEN_KEY = "beljar-inspector-open";
  var INSPECTOR_FOLLOW_KEY = "beljar-inspector-follow";
  var LIBRARY_OPEN_KEY = "beljar-library-open";
  var LIBRARY_WIDTH_KEY = "beljar-library-w";
  var LIBRARY_HEIGHT_KEY = "beljar-library-h";
  var HARPOON_WIDTH_KEY = "beljar-harpoon-w";
  var HARPOON_HEIGHT_KEY = "beljar-harpoon-h";
  var DEFAULT_SIDE_PANEL_WIDTH = 250;
  var DEFAULT_SIDE_PANEL_HEIGHT = 190;
  var SIDE_PANEL_LAYOUT = {
    explorer: {
      widthKey: EXPLORER_WIDTH_KEY,
      heightKey: EXPLORER_HEIGHT_KEY,
      minW: 160,
      maxW: 512,
      minH: 96,
      maxH: 320
    },
    inspector: {
      widthKey: INSPECTOR_WIDTH_KEY,
      heightKey: INSPECTOR_HEIGHT_KEY,
      minW: 160,
      maxW: 512,
      minH: 96,
      maxH: 384
    },
    library: {
      widthKey: LIBRARY_WIDTH_KEY,
      heightKey: LIBRARY_HEIGHT_KEY,
      minW: 160,
      maxW: 512,
      minH: 96,
      maxH: 384
    },
    harpoon: {
      widthKey: HARPOON_WIDTH_KEY,
      heightKey: HARPOON_HEIGHT_KEY,
      minW: 160,
      maxW: 512,
      minH: 96,
      maxH: 384
    }
  };
  var textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
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
    var text = String(code != null ? code : "");
    var bytes = utf8Bytes(text);
    var hash = 2166136261;
    for (var i = 0; i < bytes.length; i++) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return bytes.length + ":" + hash.toString(16).padStart(8, "0");
  }
  function createLocalStorageBackend(store) {
    store = store || globalThis.localStorage;
    return {
      loadSync: function(key) {
        try {
          return store.getItem(key);
        } catch (_) {
          return null;
        }
      },
      saveSync: function(key, value) {
        store.setItem(key, value);
      },
      removeSync: function(key) {
        try {
          store.removeItem(key);
        } catch (_) {
        }
      }
    };
  }
  function createMemoryBackend(initial) {
    var store = initial ? Object.assign({}, initial) : {};
    return {
      loadSync: function(key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      saveSync: function(key, value) {
        store[key] = value;
      },
      removeSync: function(key) {
        delete store[key];
      },
      _dump: function() {
        return Object.assign({}, store);
      }
    };
  }
  function createLocalStorageAdapter(store) {
    var backend = createLocalStorageBackend(store);
    return {
      getItem: function(key) {
        return backend.loadSync(key);
      },
      setItem: function(key, value) {
        try {
          backend.saveSync(key, value);
        } catch (_) {
        }
      },
      removeItem: function(key) {
        backend.removeSync(key);
      }
    };
  }
  var defaultBackend = createLocalStorageBackend();
  function slugify(s) {
    return String(s).replace(/[^a-zA-Z0-9._-]/g, "_");
  }
  function projectPrefix(pid) {
    pid = pid || getActiveProjectId();
    return pid === DEFAULT_PROJECT_ID ? "" : "beljar-proj:" + slugify(pid) + ":";
  }
  function projKey(suffix, pid) {
    var prefix = projectPrefix(pid);
    if (prefix === "") {
      if (suffix === "files") return PROJECT_FILES_KEY;
      if (suffix === "active-file") return ACTIVE_FILE_KEY;
      if (suffix === "open-files") return OPEN_FILES_KEY;
      if (suffix === "default-cfg") return DEFAULT_CFG_KEY;
      if (suffix === "active-cfg-by-dir") return ACTIVE_CFG_BY_DIR_KEY;
    }
    return prefix + suffix;
  }
  function dirOf(name) {
    var i = String(name || "").lastIndexOf("/");
    return i === -1 ? "" : name.slice(0, i);
  }
  function stateKeyFor(id, pid) {
    var prefix = projectPrefix(pid);
    if (prefix === "") {
      if (!id || id === DEFAULT_DOCUMENT_ID) return STATE_KEY;
      return "beljar-file:" + slugify(id);
    }
    if (!id || id === DEFAULT_DOCUMENT_ID) return prefix + "state-v2";
    return prefix + "file:" + slugify(id);
  }
  function backendLoad(key) {
    return defaultBackend.loadSync(key);
  }
  function backendSave(key, value) {
    try {
      defaultBackend.saveSync(key, value);
    } catch (_) {
    }
  }
  function backendRemove(key) {
    defaultBackend.removeSync(key);
  }
  var _uiPrefsApi = create({
    THEME_STORAGE_KEY,
    UI_FONT_SIZE_KEY,
    UI_FONT_SCALES,
    UI_TEXT_CONTRAST_KEY,
    UI_TEXT_CONTRAST_MULTIPLIERS,
    backendLoad,
    backendSave,
    backendRemove
  });
  function healKnownCorruptEditorText(text) {
    if (typeof text !== "string" || text.indexOf(": a o") === -1) return text;
    return text.replace(/\| ∨ : a o → o → o/g, "| \u2228 : o \u2192 o \u2192 o").replace(/\| ∨ : a o -> o -> o/g, "| \u2228 : o -> o -> o").replace(/\| v : a o → o → o/g, "| \u2228 : o \u2192 o \u2192 o").replace(/\| v : a o -> o -> o/g, "| \u2228 : o -> o -> o");
  }
  function emptyState(documentId) {
    return {
      v: SCHEMA_VERSION,
      meta: {
        documentId: documentId || DEFAULT_DOCUMENT_ID,
        updatedAt: 0,
        revision: 0
      },
      editor: {
        text: "",
        local: {}
      },
      semantic: null
    };
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
  function normalizeLocal(raw) {
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
  function normalizeLoaded(raw, documentId) {
    var base = emptyState(documentId);
    if (!raw || typeof raw !== "object") return base;
    if (raw.v === SCHEMA_VERSION || raw.v === LEGACY_CHECKPOINT_V2) {
      if (raw.meta && typeof raw.meta === "object") {
        if (typeof raw.meta.documentId === "string") base.meta.documentId = raw.meta.documentId;
        if (typeof raw.meta.updatedAt === "number") base.meta.updatedAt = raw.meta.updatedAt;
        if (typeof raw.meta.revision === "number") base.meta.revision = raw.meta.revision;
      }
      if (raw.editor && typeof raw.editor.text === "string") {
        base.editor.text = healKnownCorruptEditorText(raw.editor.text);
      }
      base.editor.local = normalizeLocal(raw.editor && raw.editor.local);
      base.semantic = normalizeSemantic(raw.semantic);
      return base;
    }
    if (raw.v === LEGACY_SCHEMA_VERSION && raw.editor && typeof raw.editor.text === "string") {
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
      scopeKey: "legacy",
      belugaBuild: readStoredBelugaMode(),
      types,
      identity: [],
      deriveAttempted: []
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
    return !!(t.decls && t.decls.length || t.metavars && t.metavars.length || t.reconstructed && t.reconstructed.length || semantic.identity && semantic.identity.length || semantic.deriveAttempted && semantic.deriveAttempted.length);
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
  var CAPACITY_DEDUPE = "persist.capacity";
  var saveBlocked = false;
  var lastSaveError = null;
  function classifyPersistError(err) {
    if (!err) return { code: "unknown", retryable: false, detail: null };
    if (err.name === "QuotaExceededError" || err.code === "capacity") {
      return {
        code: "capacity",
        retryable: false,
        detail: String(err.message || err.name || "")
      };
    }
    if (err.code === "network" || err.code === "auth" || err.code === "conflict") {
      return {
        code: err.code,
        retryable: !!err.retryable,
        detail: err.detail != null ? String(err.detail) : err.message ? String(err.message) : null
      };
    }
    return {
      code: "unknown",
      retryable: false,
      detail: String(err.message || err)
    };
  }
  function reportCapacityFailure(classified) {
    saveBlocked = true;
    lastSaveError = classified || { code: "capacity", retryable: false, detail: null };
    if (typeof globalThis.Toasts !== "undefined" && globalThis.Toasts.error) {
      globalThis.Toasts.error("Couldn\u2019t save \u2014 storage full.", {
        duration: 0,
        closable: true
      });
    }
    if (typeof globalThis.Notifications !== "undefined" && globalThis.Notifications.emit) {
      globalThis.Notifications.emit({
        kind: "error",
        category: "ops",
        origin: "local",
        title: "Couldn\u2019t save \u2014 storage full",
        body: "BelJar couldn\u2019t write your project. The last successful save is intact; newer edits may be lost on reload until space is available.",
        detail: classified && classified.detail ? classified.detail : null,
        source: "persist.capacity",
        dedupeKey: CAPACITY_DEDUPE
      });
    }
  }
  function clearCapacityFailure() {
    if (!saveBlocked && !lastSaveError) return;
    saveBlocked = false;
    lastSaveError = null;
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
  function isSaveBlocked() {
    return !!saveBlocked;
  }
  function writeState(backend, state) {
    var b = backend || defaultBackend;
    var key = stateKeyFor(state.meta && state.meta.documentId);
    try {
      b.saveSync(key, JSON.stringify(state));
      clearCapacityFailure();
      return { ok: true };
    } catch (err) {
      var classified = classifyPersistError(err);
      if (classified.code !== "capacity") {
        lastSaveError = classified;
        return { ok: false, error: classified };
      }
      if (state.semantic) {
        state.semantic = trimSemanticForQuota(state.semantic);
        try {
          b.saveSync(key, JSON.stringify(state));
          clearCapacityFailure();
          return { ok: true };
        } catch (err2) {
          classified = classifyPersistError(err2);
          if (classified.code !== "capacity") {
            lastSaveError = classified;
            return { ok: false, error: classified };
          }
        }
      }
      reportCapacityFailure(classified);
      return { ok: false, error: classified };
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
      if (!providers || typeof providers.getSemantic !== "function") return state.semantic;
      var exported = providers.getSemantic();
      if (!exported) return state.semantic;
      var text = state.editor.text;
      var docFp = typeof providers.getDocFp === "function" ? providers.getDocFp(text) : documentFingerprint(text);
      var belugaBuild = typeof providers.getBelugaBuild === "function" ? providers.getBelugaBuild() : readStoredBelugaMode();
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
    function collectLocal() {
      if (providers && typeof providers.getViewport === "function") {
        return normalizeLocal(providers.getViewport());
      }
      return state.editor.local || {};
    }
    function collectEditorText() {
      if (providers && typeof providers.getText === "function") {
        try {
          var live = providers.getText();
          if (live != null) return String(live);
        } catch (_) {
        }
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
    }
    function flushCheckpoint() {
      persistNow();
    }
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
      persistNow();
      providers = null;
      documentId = newId;
      state = readStateForId(backend, documentId);
      return exportSnapshot();
    }
    function getCurrentFileId() {
      return documentId;
    }
    return {
      getEditorText: function() {
        return state.editor.text;
      },
      getEditorLocal: function() {
        return normalizeLocal(state.editor.local);
      },
      getSemanticCheckpoint: function() {
        return state.semantic ? JSON.parse(JSON.stringify(state.semantic)) : null;
      },
      getInitialCheckpoint: exportSnapshot,
      scheduleEditorPersist,
      markEditorDirty,
      cancelPendingSave,
      replaceEditorText,
      scheduleCheckpointSave: scheduleSave,
      flushCheckpoint,
      flushEditor,
      exportSnapshot,
      importSnapshot,
      setCheckpointProviders,
      setBackend,
      switchFile,
      getCurrentFileId,
      /** @deprecated use setBackend */
      setAdapter: function(adapter) {
        if (!adapter) return;
        setBackend({
          loadSync: function(k) {
            return adapter.getItem(k);
          },
          saveSync: function(k, v) {
            adapter.setItem(k, v);
          },
          removeSync: function(k) {
            adapter.removeItem(k);
          }
        });
      }
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
  var _settingsApi = create2({
    backendLoad,
    backendSave,
    backendRemove,
    tryParse,
    THEME_STORAGE_KEY,
    UI_FONT_SIZE_KEY,
    UI_TEXT_CONTRAST_KEY,
    BELUGA_MODE_STORAGE_KEY,
    DEFAULT_PROJECT_NAME,
    ensureProject: function() {
      return ensureProject();
    },
    getFileText: function(id) {
      return getFileText(id);
    },
    readState,
    defaultBackend,
    stateKeyFor
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
  function readStoredReplHoverTimestamp() {
    return _settingsApi.readStoredReplHoverTimestamp.apply(_settingsApi, arguments);
  }
  function writeStoredReplHoverTimestamp() {
    return _settingsApi.writeStoredReplHoverTimestamp.apply(_settingsApi, arguments);
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
  function readStoredEditorAutocompleteTrigger() {
    return _settingsApi.readStoredEditorAutocompleteTrigger.apply(_settingsApi, arguments);
  }
  function writeStoredEditorAutocompleteTrigger() {
    return _settingsApi.writeStoredEditorAutocompleteTrigger.apply(_settingsApi, arguments);
  }
  function readStoredEditorAutocompleteContinue() {
    return _settingsApi.readStoredEditorAutocompleteContinue.apply(_settingsApi, arguments);
  }
  function writeStoredEditorAutocompleteContinue() {
    return _settingsApi.writeStoredEditorAutocompleteContinue.apply(_settingsApi, arguments);
  }
  var _settingsExtraNames = [
    "readStoredEditorCursorBlink",
    "writeStoredEditorCursorBlink",
    "readStoredEditorScrollPastEnd",
    "writeStoredEditorScrollPastEnd",
    "readStoredEditorWhitespace",
    "writeStoredEditorWhitespace",
    "readStoredEditorRulers",
    "writeStoredEditorRulers",
    "readStoredEditorFontFamily",
    "writeStoredEditorFontFamily",
    "readStoredEditorHoleEmphasis",
    "writeStoredEditorHoleEmphasis",
    "readStoredMotionPref",
    "writeStoredMotionPref",
    "applyStoredMotionPref",
    "prefersReducedMotion",
    "readStoredToastDuration",
    "writeStoredToastDuration",
    "toastDurationMs",
    "readStoredCheckAggressiveness",
    "writeStoredCheckAggressiveness",
    "checkAggressivenessScale",
    "readStoredAutosolveFocusNext",
    "writeStoredAutosolveFocusNext",
    "readStoredAutosolveShowStats",
    "writeStoredAutosolveShowStats",
    "readStoredQuietWhileTyping",
    "writeStoredQuietWhileTyping",
    "readStoredDiagPresentation",
    "writeStoredDiagPresentation",
    "readStoredDiagSeverity",
    "writeStoredDiagSeverity",
    "readStoredFormatOnSave",
    "writeStoredFormatOnSave",
    "readStoredTrimTrailingWs",
    "writeStoredTrimTrailingWs",
    "readStoredStickyDeclHeader",
    "writeStoredStickyDeclHeader",
    "readStoredSuiteCheck",
    "writeStoredSuiteCheck",
    "readStoredHoverSticky",
    "writeStoredHoverSticky",
    "applyStoredEditorChrome",
    "exportUserSettings",
    "importUserSettings"
  ];
  var _settingsExtra = {};
  _settingsExtraNames.forEach(function(name) {
    _settingsExtra[name] = function() {
      return _settingsApi[name].apply(_settingsApi, arguments);
    };
  });
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
  function fileNameForId() {
    return _settingsApi.fileNameForId.apply(_settingsApi, arguments);
  }
  function expandAliasesForStorage() {
    return _settingsApi.expandAliasesForStorage.apply(_settingsApi, arguments);
  }
  function expandAliasesInAllFiles() {
    return _settingsApi.expandAliasesInAllFiles.apply(_settingsApi, arguments);
  }
  function getExplorerFold() {
    return _settingsApi.getExplorerFold.apply(_settingsApi, arguments);
  }
  function setExplorerFold() {
    return _settingsApi.setExplorerFold.apply(_settingsApi, arguments);
  }
  var _layoutApi = create3({
    backendLoad,
    backendSave,
    backendRemove,
    tryParse,
    projectPrefix,
    getActiveProjectId: function() {
      return getActiveProjectId();
    },
    EDITOR_SPLIT_STORAGE_KEY,
    DEFAULT_EDITOR_SPLIT,
    MIN_EDITOR_SPLIT,
    MAX_EDITOR_SPLIT,
    SIDE_PANEL_LAYOUT,
    DEFAULT_SIDE_PANEL_WIDTH,
    DEFAULT_SIDE_PANEL_HEIGHT,
    EXPLORER_OPEN_KEY,
    INSPECTOR_OPEN_KEY,
    INSPECTOR_FOLLOW_KEY,
    LIBRARY_OPEN_KEY,
    LOAD_STATS_KEY
  });
  function resetLayoutPrefs() {
    return _layoutApi.resetLayoutPrefs.apply(_layoutApi, arguments);
  }
  function workspaceKeyFor() {
    return _layoutApi.workspaceKeyFor.apply(_layoutApi, arguments);
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
  var _graphPrefsApi = create4({
    DEFAULT_GRAPH_PREFS,
    GRAPH_PREFS_STORAGE_KEY,
    LEGACY_GRAPH_LAYOUT_KEY,
    LEGACY_GRAPH_IMPL_KEY,
    LEGACY_GRAPH_DEPTH_KEY,
    LEGACY_GRAPH_SIDEBAR_KEY,
    backendLoad,
    backendSave,
    backendRemove,
    tryParse
  });
  function normalizeGraphPrefs(raw) {
    return _graphPrefsApi.normalizeGraphPrefs(raw);
  }
  function readStoredGraphPrefs() {
    return _graphPrefsApi.readStoredGraphPrefs();
  }
  function writeStoredGraphPrefs(partial) {
    return _graphPrefsApi.writeStoredGraphPrefs(partial);
  }
  var _projectsApi = create5({
    PROJECTS_KEY,
    ACTIVE_PROJECT_KEY,
    DEFAULT_PROJECT_ID,
    DEFAULT_PROJECT_NAME,
    DEFAULT_DOCUMENT_ID,
    PROJECT_NAME_KEY,
    backendLoad,
    backendSave,
    backendRemove,
    tryParse,
    projKey,
    stateKeyFor,
    replaceProject: function(entries, options) {
      return replaceProject(entries, options);
    }
  });
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
  _fileRegistryApi = create6({
    backendLoad,
    backendSave,
    backendRemove,
    tryParse,
    projKey,
    stateKeyFor,
    defaultBackend,
    readState,
    emptyState,
    DEFAULT_DOCUMENT_ID,
    dirOf,
    expandAliasesForStorage: function(t, n) {
      return expandAliasesForStorage(t, n);
    },
    fileNameForId: function(id) {
      return fileNameForId(id);
    },
    readStoredCfgAutoSync: function() {
      return readStoredCfgAutoSync();
    },
    writeOpenFileIds: function(ids) {
      return writeOpenFileIds(ids);
    },
    closeOpenFile: function(id) {
      return closeOpenFile(id);
    },
    writeActiveCfgByDir: function(m) {
      return writeActiveCfgByDir(m);
    },
    setActiveCfgForDir: function(d, p) {
      return setActiveCfgForDir(d, p);
    },
    removeActiveCfgForDir: function(d, p) {
      return removeActiveCfgForDir(d, p);
    },
    readActiveCfgByDir: function() {
      return readActiveCfgByDir();
    },
    normalizeActiveCfgList: function(v) {
      return normalizeActiveCfgList(v);
    },
    setProjectName: function(n) {
      return setProjectName(n);
    }
  });
  function readProjectFiles() {
    return _fileRegistryApi.readProjectFiles.apply(_fileRegistryApi, arguments);
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
  function replaceProject() {
    return _fileRegistryApi.replaceProject.apply(_fileRegistryApi, arguments);
  }
  function createFile() {
    return _fileRegistryApi.createFile.apply(_fileRegistryApi, arguments);
  }
  function restoreDeletedFile() {
    return _fileRegistryApi.restoreDeletedFile.apply(_fileRegistryApi, arguments);
  }
  function deleteFile() {
    return _fileRegistryApi.deleteFile.apply(_fileRegistryApi, arguments);
  }
  function renameFile() {
    return _fileRegistryApi.renameFile.apply(_fileRegistryApi, arguments);
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
  _openTabsApi = create7({
    backendLoad,
    backendSave,
    backendRemove,
    tryParse,
    projKey,
    listFiles: function() {
      return listFiles();
    },
    getFileById: function(id) {
      return getFileById(id);
    },
    readProjectFiles: function() {
      return readProjectFiles();
    },
    getActiveProject: function() {
      return getActiveProject();
    },
    renameProject: function(id, name) {
      return renameProject(id, name);
    },
    getActiveProjectId: function() {
      return getActiveProjectId();
    },
    DEFAULT_PROJECT_NAME,
    dirOf,
    defaultBackend,
    getActiveFileId: function() {
      return getActiveFileId();
    }
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
  function newBlankProject(name) {
    return _projectsApi.newBlankProject(name);
  }
  function createProjectWithFiles(name, entries, options) {
    return _projectsApi.createProjectWithFiles(name, entries, options);
  }
  function createAsyncPersistLayer() {
    return {
      push: function() {
        return Promise.resolve({ ok: false, reason: "not-configured" });
      },
      pull: function() {
        return Promise.resolve({ ok: false, reason: "not-configured" });
      }
    };
  }
  var Persist = {
    SCHEMA_VERSION,
    STATE_KEY,
    LEGACY_STATE_KEY,
    LEGACY_SEMANTIC_TYPES_KEY,
    DEFAULT_DOCUMENT_ID,
    THEME_STORAGE_KEY,
    EDITOR_SPLIT_STORAGE_KEY,
    GRAPH_PREFS_STORAGE_KEY,
    DEFAULT_GRAPH_PREFS,
    DEFAULT_EDITOR_SPLIT,
    MIN_EDITOR_SPLIT,
    MAX_EDITOR_SPLIT,
    documentFingerprint,
    createLocalStorageBackend,
    createMemoryBackend,
    createLocalStorageAdapter,
    createPersist,
    createAsyncPersistLayer,
    classifyPersistError,
    isSaveBlocked,
    readStoredTheme,
    writeStoredTheme,
    UI_FONT_SIZE_KEY,
    UI_FONT_SCALES,
    readStoredUiFontSize,
    writeStoredUiFontSize,
    uiFontScaleForSize,
    applyStoredUiFontSize,
    UI_TEXT_CONTRAST_KEY,
    UI_TEXT_CONTRAST_MULTIPLIERS,
    readStoredUiTextContrast,
    writeStoredUiTextContrast,
    uiTextContrastMultiplierForLevel,
    applyStoredUiTextContrast,
    readStoredEditorSplit,
    writeStoredEditorSplit,
    readStoredExplorerWidth,
    writeStoredExplorerWidth,
    readStoredInspectorWidth,
    writeStoredInspectorWidth,
    readStoredExplorerHeight,
    writeStoredExplorerHeight,
    readStoredInspectorHeight,
    writeStoredInspectorHeight,
    readStoredExplorerOpen,
    writeStoredExplorerOpen,
    loadStat,
    saveStat,
    getExplorerFold,
    setExplorerFold,
    readStoredInspectorOpen,
    writeStoredInspectorOpen,
    readStoredInspectorFollow,
    writeStoredInspectorFollow,
    readStoredLibraryOpen,
    writeStoredLibraryOpen,
    readStoredHarpoonOpen,
    writeStoredHarpoonOpen,
    readStoredHarpoonDetailsCollapsed,
    writeStoredHarpoonDetailsCollapsed,
    readStoredLibraryWidth,
    writeStoredLibraryWidth,
    readStoredLibraryHeight,
    writeStoredLibraryHeight,
    readStoredHarpoonWidth,
    writeStoredHarpoonWidth,
    readStoredHarpoonHeight,
    writeStoredHarpoonHeight,
    DEFAULT_SIDE_PANEL_WIDTH,
    DEFAULT_SIDE_PANEL_HEIGHT,
    SIDE_PANEL_LAYOUT,
    readStoredGraphPrefs,
    writeStoredGraphPrefs,
    normalizeGraphPrefs,
    clampEditorSplit,
    readStoredBelugaMode,
    writeStoredBelugaMode,
    readStoredHoverScope,
    writeStoredHoverScope,
    readStoredAliasActivation,
    writeStoredAliasActivation,
    readStoredAliasPairs,
    writeStoredAliasPairs,
    readStoredCfgAutoSync,
    writeStoredCfgAutoSync,
    readStoredReplAutoscroll,
    writeStoredReplAutoscroll,
    readStoredReplWelcome,
    writeStoredReplWelcome,
    readStoredReplEcho,
    writeStoredReplEcho,
    readStoredReplFilterChatter,
    writeStoredReplFilterChatter,
    readStoredReplHoverTimestamp,
    writeStoredReplHoverTimestamp,
    readStoredReplHistoryCap,
    writeStoredReplHistoryCap,
    readStoredReplHistoryPersist,
    writeStoredReplHistoryPersist,
    readStoredReplTranscript,
    writeStoredReplTranscript,
    readStoredReplCommandHistory,
    writeStoredReplCommandHistory,
    readStoredBelugaFallbackStable,
    writeStoredBelugaFallbackStable,
    readStoredBelugaCancelOnEdit,
    writeStoredBelugaCancelOnEdit,
    readStoredLibraryExpandDefault,
    writeStoredLibraryExpandDefault,
    readStoredLibraryHintDismissed,
    writeStoredLibraryHintDismissed,
    readStoredHintDismissed,
    writeStoredHintDismissed,
    readStoredRestorePanels,
    writeStoredRestorePanels,
    readStoredActiveSidePanel,
    writeStoredActiveSidePanel,
    readStoredWorkspace,
    writeStoredWorkspace,
    resetStoredWorkspace,
    resetWorkspaceState,
    workspaceKeyFor,
    normalizeViewportAnchor,
    readStoredAutosaveDelay,
    writeStoredAutosaveDelay,
    readStoredEditorFontSize,
    writeStoredEditorFontSize,
    readStoredEditorLineHeight,
    writeStoredEditorLineHeight,
    readStoredEditorWordWrap,
    writeStoredEditorWordWrap,
    readStoredEditorTabSize,
    writeStoredEditorTabSize,
    readStoredEditorLineNumbers,
    writeStoredEditorLineNumbers,
    readStoredEditorFoldGutter,
    writeStoredEditorFoldGutter,
    readStoredEditorFoldPersist,
    writeStoredEditorFoldPersist,
    readStoredEditorActiveLine,
    writeStoredEditorActiveLine,
    readStoredEditorDiagGutter,
    writeStoredEditorDiagGutter,
    readStoredEditorHoleGutter,
    writeStoredEditorHoleGutter,
    readStoredEditorSyntaxHighlight,
    writeStoredEditorSyntaxHighlight,
    readStoredEditorSemanticHighlight,
    writeStoredEditorSemanticHighlight,
    readStoredEditorParseHighlight,
    writeStoredEditorParseHighlight,
    readStoredEditorOccurrenceHighlight,
    writeStoredEditorOccurrenceHighlight,
    readStoredEditorBracketMatch,
    writeStoredEditorBracketMatch,
    readStoredEditorAutoCloseBrackets,
    writeStoredEditorAutoCloseBrackets,
    readStoredEditorSelectionMatches,
    writeStoredEditorSelectionMatches,
    readStoredEditorReindentPaste,
    writeStoredEditorReindentPaste,
    readStoredEditorFormatWidth,
    writeStoredEditorFormatWidth,
    readStoredEditorAutocompleteTrigger,
    writeStoredEditorAutocompleteTrigger,
    readStoredEditorAutocompleteContinue,
    writeStoredEditorAutocompleteContinue,
    ..._settingsExtra,
    resetLayoutPrefs,
    resetAppearancePrefs,
    resetEditorTypographyPrefs,
    resetEditorIndentPrefs,
    resetEditorCodeInsightPrefs,
    resetEditorGutterPrefs,
    resetEditorPrefs,
    resetBelugaPrefs,
    resetReplPrefs,
    resetWorkspacePrefs,
    resetAliasesPrefs,
    KEYBINDINGS_KEY: "beljar-keybindings",
    readStoredKeybindings,
    writeStoredKeybindings,
    resetKeybindingPrefs,
    expandAliasesInAllFiles,
    normalizeLoaded,
    emptyState,
    // Projects (top-level containers):
    DEFAULT_PROJECT_ID,
    listProjects,
    getActiveProjectId,
    setActiveProjectId,
    getActiveProject,
    createProject,
    renameProject,
    deleteProject,
    newBlankProject,
    createProjectWithFiles,
    // Project/multi-file management:
    ensureProject,
    listFiles,
    getActiveFileId,
    setActiveFileId,
    replaceProject,
    createFile,
    restoreDeletedFile,
    deleteFile,
    renameFile,
    addEntryToCfg,
    prependEntryToCfg,
    removeEntryFromCfg,
    moveEntryInCfg,
    getFileById,
    listEmptyFolders,
    addEmptyFolder,
    removeEmptyFolder,
    clearEmptyFolders,
    pruneEmptyFoldersUnder,
    renameEmptyFolderPrefix,
    preserveEmptyFoldersAfterMoves,
    moveFile,
    getFileText,
    setFileText,
    getOpenFileIds,
    setOpenFileIds,
    openFile,
    closeOpenFile,
    getProjectName,
    setProjectName,
    getDefaultCfgPath,
    setDefaultCfgPath,
    getActiveCfgForDir,
    getActiveCfgsForDir,
    setActiveCfgForDir,
    setActiveCfgsForDir,
    addActiveCfgForDir,
    removeActiveCfgForDir,
    getActiveCfgByDir,
    backfillActiveCfgByDir,
    DEFAULT_PROJECT_NAME
  };
  var g = typeof window !== "undefined" ? window : globalThis;
  g.Persist = Persist;
  g.BelJarPersist = g.Persist;
})();
