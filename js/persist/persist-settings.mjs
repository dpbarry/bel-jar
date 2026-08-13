/**
 * User settings (REPL, Beluga, editor, keybindings, aliases) — injected into Persist.
 */
export function create(deps) {
    var backendLoad = deps.backendLoad;
    var backendSave = deps.backendSave;
    var backendRemove = deps.backendRemove;
    var tryParse = deps.tryParse;
    var THEME_STORAGE_KEY = deps.THEME_STORAGE_KEY;
    var UI_FONT_SIZE_KEY = deps.UI_FONT_SIZE_KEY;
    var UI_TEXT_CONTRAST_KEY = deps.UI_TEXT_CONTRAST_KEY;
    var BELUGA_MODE_STORAGE_KEY = deps.BELUGA_MODE_STORAGE_KEY;
    var DEFAULT_PROJECT_NAME = deps.DEFAULT_PROJECT_NAME;
    var ensureProject = deps.ensureProject;
    var getFileText = deps.getFileText;
    var readState = deps.readState;
    var defaultBackend = deps.defaultBackend;
    var stateKeyFor = deps.stateKeyFor;

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
        if (v === 'user-only') return 'user-only';
        if (v === 'none') return 'none';
        return 'all';
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
    var ALIAS_PAIRS_KEY = 'beljar-alias-pairs';
    var CFG_AUTO_SYNC_KEY = 'beljar-cfg-auto-sync';

    function readStoredCfgAutoSync() {
      try {
        var v = backendLoad(CFG_AUTO_SYNC_KEY);
        return v !== 'off';
      } catch (_) {
        return true;
      }
    }

    function writeStoredCfgAutoSync(on) {
      if (on) backendRemove(CFG_AUTO_SYNC_KEY);
      else backendSave(CFG_AUTO_SYNC_KEY, 'off');
    }

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

    function readStoredAliasPairs() {
      try {
        var raw = backendLoad(ALIAS_PAIRS_KEY);
        if (raw == null || raw === '') return null;
        var parsed = tryParse(raw);
        if (!Array.isArray(parsed)) return null;
        return parsed;
      } catch (_) {
        return null;
      }
    }

    function writeStoredAliasPairs(pairs) {
      if (pairs == null) {
        backendRemove(ALIAS_PAIRS_KEY);
        return;
      }
      if (!Array.isArray(pairs)) return;
      backendSave(ALIAS_PAIRS_KEY, JSON.stringify(pairs));
    }

    // ── User settings (REPL, Beluga run, workspace, editor) ───────────────────

    var REPL_AUTOSCROLL_KEY = 'beljar-repl-autoscroll';
    var REPL_WELCOME_KEY = 'beljar-repl-welcome';
    var REPL_ECHO_KEY = 'beljar-repl-echo';
    var REPL_FILTER_CHATTER_KEY = 'beljar-repl-filter-chatter';
    var REPL_HOVER_TIMESTAMP_KEY = 'beljar-repl-hover-timestamp';
    var REPL_HISTORY_CAP_KEY = 'beljar-repl-history-cap';
    var REPL_HISTORY_PERSIST_KEY = 'beljar-repl-history-persist';
    var REPL_TRANSCRIPT_KEY = 'beljar-repl-transcript-v1';
    var REPL_CMD_HISTORY_KEY = 'beljar-repl-cmd-history-v1';
    var REPL_CMD_HISTORY_DEFAULT_CAP = 1000;
    var BELUGA_FALLBACK_STABLE_KEY = 'beljar-beluga-fallback-stable';
    var BELUGA_CANCEL_ON_EDIT_KEY = 'beljar-beluga-cancel-on-edit';
    var LIBRARY_EXPAND_DEFAULT_KEY = 'beljar-library-expand-default';
    var LIBRARY_HINT_DISMISSED_KEY = 'beljar-library-hint-dismissed';
    var HINT_DISMISSED_PREFIX = 'beljar-hint-dismissed:';
    var RESTORE_PANELS_KEY = 'beljar-restore-panels';
    var ACTIVE_SIDE_PANEL_KEY = 'beljar-active-side-panel';
    var WORKSPACE_KEY = 'beljar-workspace-v1';
    var SIDE_PANEL_IDS = ['explorer', 'inspector', 'library', 'harpoon'];
    var AUTOSAVE_DELAY_KEY = 'beljar-autosave-delay';
    var EDITOR_FONT_SIZE_KEY = 'beljar-editor-font-size';
    var EDITOR_LINE_HEIGHT_KEY = 'beljar-editor-line-height';
    var EDITOR_WORD_WRAP_KEY = 'beljar-editor-word-wrap';
    var EDITOR_TAB_SIZE_KEY = 'beljar-editor-tab-size';
    var EDITOR_LINE_NUMBERS_KEY = 'beljar-editor-line-numbers';
    var EDITOR_FOLD_GUTTER_KEY = 'beljar-editor-fold-gutter';
    var EDITOR_FOLD_PERSIST_KEY = 'beljar-editor-fold-persist';
    var EDITOR_ACTIVE_LINE_KEY = 'beljar-editor-active-line';
    var EDITOR_DIAG_GUTTER_KEY = 'beljar-editor-diag-gutter';
    var EDITOR_HOLE_GUTTER_KEY = 'beljar-editor-hole-gutter';
    var EDITOR_SYNTAX_HIGHLIGHT_KEY = 'beljar-editor-syntax-highlight';
    var EDITOR_SEMANTIC_HIGHLIGHT_KEY = 'beljar-editor-semantic-highlight';
    var EDITOR_PARSE_HIGHLIGHT_KEY = 'beljar-editor-parse-highlight';
    var EDITOR_OCCURRENCE_HIGHLIGHT_KEY = 'beljar-editor-occurrence-highlight';
    var EDITOR_BRACKET_MATCH_KEY = 'beljar-editor-bracket-match';
    var EDITOR_AUTO_CLOSE_BRACKETS_KEY = 'beljar-editor-auto-close-brackets';
    var EDITOR_SELECTION_MATCHES_KEY = 'beljar-editor-selection-matches';
    var EDITOR_REINDENT_PASTE_KEY = 'beljar-editor-reindent-paste';
    var EDITOR_FORMAT_WIDTH_KEY = 'beljar-editor-format-width';
    var EDITOR_AUTOCOMPLETE_TRIGGER_KEY = 'beljar-editor-autocomplete-trigger';
    var EDITOR_AUTOCOMPLETE_CONTINUE_KEY = 'beljar-editor-autocomplete-continue';
    var EDITOR_CURSOR_BLINK_KEY = 'beljar-editor-cursor-blink';
    var EDITOR_SCROLL_PAST_END_KEY = 'beljar-editor-scroll-past-end';
    var EDITOR_WHITESPACE_KEY = 'beljar-editor-whitespace';
    var EDITOR_RULERS_KEY = 'beljar-editor-rulers';
    var EDITOR_FONT_FAMILY_KEY = 'beljar-editor-font-family';
    var EDITOR_HOLE_EMPHASIS_KEY = 'beljar-editor-hole-emphasis';
    var MOTION_PREF_KEY = 'beljar-motion-pref';
    var TOAST_DURATION_KEY = 'beljar-toast-duration';
    var CHECK_AGGRESSIVENESS_KEY = 'beljar-check-aggressiveness';
    var AUTOSOLVE_FOCUS_NEXT_KEY = 'beljar-autosolve-focus-next';
    var AUTOSOLVE_SHOW_STATS_KEY = 'beljar-autosolve-show-stats';
    var QUIET_WHILE_TYPING_KEY = 'beljar-quiet-while-typing';
    var DIAG_PRESENTATION_KEY = 'beljar-diag-presentation';
    var DIAG_SEVERITY_KEY = 'beljar-diag-severity';
    var FORMAT_ON_SAVE_KEY = 'beljar-format-on-save';
    var TRIM_TRAILING_WS_KEY = 'beljar-trim-trailing-ws';
    var STICKY_DECL_HEADER_KEY = 'beljar-sticky-decl-header';
    var SUITE_CHECK_KEY = 'beljar-suite-check';
    var HOVER_STICKY_KEY = 'beljar-hover-sticky';

    function readBoolDefaultOn(key) {
      try {
        return backendLoad(key) !== 'off';
      } catch (_) {
        return true;
      }
    }

    function writeBoolDefaultOn(key, on) {
      if (on) backendRemove(key);
      else backendSave(key, 'off');
    }

    function readBoolDefaultOff(key) {
      try {
        return backendLoad(key) === '1';
      } catch (_) {
        return false;
      }
    }

    function writeBoolDefaultOff(key, on) {
      if (on) backendSave(key, '1');
      else backendRemove(key);
    }

    function readStoredReplAutoscroll() { return readBoolDefaultOn(REPL_AUTOSCROLL_KEY); }
    function writeStoredReplAutoscroll(on) { writeBoolDefaultOn(REPL_AUTOSCROLL_KEY, on); }

    function readStoredReplWelcome() { return readBoolDefaultOn(REPL_WELCOME_KEY); }
    function writeStoredReplWelcome(on) { writeBoolDefaultOn(REPL_WELCOME_KEY, on); }

    function readStoredReplEcho() { return readBoolDefaultOn(REPL_ECHO_KEY); }
    function writeStoredReplEcho(on) { writeBoolDefaultOn(REPL_ECHO_KEY, on); }

    function readStoredReplFilterChatter() { return readBoolDefaultOn(REPL_FILTER_CHATTER_KEY); }
    function writeStoredReplFilterChatter(on) { writeBoolDefaultOn(REPL_FILTER_CHATTER_KEY, on); }

    function readStoredReplHoverTimestamp() { return readBoolDefaultOff(REPL_HOVER_TIMESTAMP_KEY); }
    function writeStoredReplHoverTimestamp(on) { writeBoolDefaultOff(REPL_HOVER_TIMESTAMP_KEY, on); }

    function readStoredReplHistoryCap() {
      try {
        var v = parseInt(backendLoad(REPL_HISTORY_CAP_KEY), 10);
        if (v === 100 || v === 250 || v === 500 || v === 1000) return v;
        return REPL_CMD_HISTORY_DEFAULT_CAP;
      } catch (_) {
        return REPL_CMD_HISTORY_DEFAULT_CAP;
      }
    }

    function writeStoredReplHistoryCap(cap) {
      var n = Number(cap);
      if (n === 100 || n === 250 || n === 500) backendSave(REPL_HISTORY_CAP_KEY, String(n));
      else backendRemove(REPL_HISTORY_CAP_KEY);
    }

    function readStoredReplHistoryPersist() {
      try {
        var v = backendLoad(REPL_HISTORY_PERSIST_KEY);
        if (v === 'session' || v === 'none') return v;
        return 'local';
      } catch (_) {
        return 'local';
      }
    }

    function replHistoryStore(mode) {
      if (typeof globalThis === 'undefined') return null;
      if (mode === 'session') return globalThis.sessionStorage || null;
      if (mode === 'local') return globalThis.localStorage || null;
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
      } catch (_) {}
    }

    function replHistoryStoreRemove(mode, key) {
      var store = replHistoryStore(mode);
      if (!store) return;
      try {
        store.removeItem(key);
      } catch (_) {}
    }

    function clearReplHistoryPayload(mode) {
      if (mode === 'session' || mode === 'local') {
        replHistoryStoreRemove(mode, REPL_TRANSCRIPT_KEY);
        replHistoryStoreRemove(mode, REPL_CMD_HISTORY_KEY);
        return;
      }
      replHistoryStoreRemove('session', REPL_TRANSCRIPT_KEY);
      replHistoryStoreRemove('session', REPL_CMD_HISTORY_KEY);
      replHistoryStoreRemove('local', REPL_TRANSCRIPT_KEY);
      replHistoryStoreRemove('local', REPL_CMD_HISTORY_KEY);
    }

    function writeStoredReplHistoryPersist(mode) {
      var next = mode === 'session' || mode === 'none' ? mode : 'local';
      var prev = readStoredReplHistoryPersist();
      if (next === 'local') backendRemove(REPL_HISTORY_PERSIST_KEY);
      else backendSave(REPL_HISTORY_PERSIST_KEY, next);
      if (prev === next) return;
      if (next === 'none') {
        clearReplHistoryPayload();
        return;
      }
      if (prev === 'session' || prev === 'local') {
        var keys = [REPL_TRANSCRIPT_KEY, REPL_CMD_HISTORY_KEY];
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          var raw = replHistoryStoreGet(prev, key);
          if (raw && !replHistoryStoreGet(next, key)) replHistoryStoreSet(next, key, raw);
        }
        clearReplHistoryPayload(prev);
      }
    }

    function readStoredReplTranscript() {
      try {
        var mode = readStoredReplHistoryPersist();
        if (mode === 'none') return null;
        var raw = replHistoryStoreGet(mode, REPL_TRANSCRIPT_KEY);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || parsed.v !== 1) return null;
        if (typeof parsed.html !== 'string') return null;
        return {
          v: 1,
          html: parsed.html,
          scrollTop: typeof parsed.scrollTop === 'number' ? parsed.scrollTop : 0,
          savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
        };
      } catch (_) {
        return null;
      }
    }

    function writeStoredReplTranscript(snap) {
      try {
        var mode = readStoredReplHistoryPersist();
        if (mode === 'none') return;
        if (!snap || typeof snap.html !== 'string' || !snap.html) {
          replHistoryStoreRemove(mode, REPL_TRANSCRIPT_KEY);
          return;
        }
        replHistoryStoreSet(mode, REPL_TRANSCRIPT_KEY, JSON.stringify({
          v: 1,
          html: snap.html,
          scrollTop: typeof snap.scrollTop === 'number' ? snap.scrollTop : 0,
          savedAt: typeof snap.savedAt === 'number' ? snap.savedAt : Date.now(),
        }));
      } catch (_) {}
    }

    function clampReplCommandHistory(list) {
      var arr = Array.isArray(list) ? list.filter(function (s) { return typeof s === 'string'; }) : [];
      var cap = readStoredReplHistoryCap();
      if (!cap) cap = REPL_CMD_HISTORY_DEFAULT_CAP;
      if (arr.length > cap) arr = arr.slice(arr.length - cap);
      return arr;
    }

    function readStoredReplCommandHistory() {
      try {
        var mode = readStoredReplHistoryPersist();
        if (mode === 'none') return [];
        var raw = replHistoryStoreGet(mode, REPL_CMD_HISTORY_KEY);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        return clampReplCommandHistory(parsed);
      } catch (_) {
        return [];
      }
    }

    function writeStoredReplCommandHistory(list) {
      try {
        var mode = readStoredReplHistoryPersist();
        if (mode === 'none') return;
        var arr = clampReplCommandHistory(list);
        if (!arr.length) replHistoryStoreRemove(mode, REPL_CMD_HISTORY_KEY);
        else replHistoryStoreSet(mode, REPL_CMD_HISTORY_KEY, JSON.stringify(arr));
      } catch (_) {}
    }

    function readStoredBelugaFallbackStable() { return readBoolDefaultOn(BELUGA_FALLBACK_STABLE_KEY); }
    function writeStoredBelugaFallbackStable(on) { writeBoolDefaultOn(BELUGA_FALLBACK_STABLE_KEY, on); }

    function readStoredBelugaCancelOnEdit() { return readBoolDefaultOn(BELUGA_CANCEL_ON_EDIT_KEY); }
    function writeStoredBelugaCancelOnEdit(on) { writeBoolDefaultOn(BELUGA_CANCEL_ON_EDIT_KEY, on); }

    function readStoredLibraryExpandDefault() { return readBoolDefaultOff(LIBRARY_EXPAND_DEFAULT_KEY); }
    function writeStoredLibraryExpandDefault(on) { writeBoolDefaultOff(LIBRARY_EXPAND_DEFAULT_KEY, on); }

    function readStoredLibraryHintDismissed() { return readBoolDefaultOff(LIBRARY_HINT_DISMISSED_KEY); }
    function writeStoredLibraryHintDismissed(on) { writeBoolDefaultOff(LIBRARY_HINT_DISMISSED_KEY, on); }

    function readStoredHintDismissed(id) {
      if (id == null || id === '') return false;
      return readBoolDefaultOff(HINT_DISMISSED_PREFIX + String(id));
    }
    function writeStoredHintDismissed(id, on) {
      if (id == null || id === '') return;
      writeBoolDefaultOff(HINT_DISMISSED_PREFIX + String(id), !!on);
    }

    function readStoredRestorePanels() { return readBoolDefaultOn(RESTORE_PANELS_KEY); }
    function writeStoredRestorePanels(on) { writeBoolDefaultOn(RESTORE_PANELS_KEY, on); }

    function readStoredAutosaveDelay() {
      try {
        var v = parseInt(backendLoad(AUTOSAVE_DELAY_KEY), 10);
        if (v === 320 || v === 1000 || v === 2000) return v;
        return 320;
      } catch (_) {
        return 320;
      }
    }

    function writeStoredAutosaveDelay(ms) {
      var n = Number(ms);
      if (n === 320) backendRemove(AUTOSAVE_DELAY_KEY);
      else if (n === 1000 || n === 2000) backendSave(AUTOSAVE_DELAY_KEY, String(n));
      else backendRemove(AUTOSAVE_DELAY_KEY);
    }

    function readStoredEditorFontSize() {
      try {
        var v = backendLoad(EDITOR_FONT_SIZE_KEY);
        if (v === 'sm' || v === 'lg' || v === 'xl') return v;
        return 'md';
      } catch (_) {
        return 'md';
      }
    }

    function writeStoredEditorFontSize(size) {
      if (size === 'md') backendRemove(EDITOR_FONT_SIZE_KEY);
      else if (size === 'sm' || size === 'lg' || size === 'xl') backendSave(EDITOR_FONT_SIZE_KEY, size);
      else backendRemove(EDITOR_FONT_SIZE_KEY);
    }

    function readStoredEditorLineHeight() {
      try {
        var v = backendLoad(EDITOR_LINE_HEIGHT_KEY);
        if (v === 'compact' || v === 'relaxed') return v;
        return 'normal';
      } catch (_) {
        return 'normal';
      }
    }

    function writeStoredEditorLineHeight(mode) {
      if (mode === 'normal') backendRemove(EDITOR_LINE_HEIGHT_KEY);
      else if (mode === 'compact' || mode === 'relaxed') backendSave(EDITOR_LINE_HEIGHT_KEY, mode);
      else backendRemove(EDITOR_LINE_HEIGHT_KEY);
    }

    function readStoredEditorWordWrap() { return readBoolDefaultOff(EDITOR_WORD_WRAP_KEY); }
    function writeStoredEditorWordWrap(on) { writeBoolDefaultOff(EDITOR_WORD_WRAP_KEY, on); }

    function readStoredEditorTabSize() {
      try {
        return backendLoad(EDITOR_TAB_SIZE_KEY) === '4' ? 4 : 2;
      } catch (_) {
        return 2;
      }
    }

    function writeStoredEditorTabSize(n) {
      if (Number(n) === 4) backendSave(EDITOR_TAB_SIZE_KEY, '4');
      else backendRemove(EDITOR_TAB_SIZE_KEY);
    }

    function readStoredEditorLineNumbers() { return readBoolDefaultOn(EDITOR_LINE_NUMBERS_KEY); }
    function writeStoredEditorLineNumbers(on) { writeBoolDefaultOn(EDITOR_LINE_NUMBERS_KEY, on); }

    function readStoredEditorFoldGutter() { return readBoolDefaultOn(EDITOR_FOLD_GUTTER_KEY); }
    function writeStoredEditorFoldGutter(on) { writeBoolDefaultOn(EDITOR_FOLD_GUTTER_KEY, on); }

    function readStoredEditorFoldPersist() {
      try {
        var v = backendLoad(EDITOR_FOLD_PERSIST_KEY);
        if (v === 'none' || v === 'local') return v;
        return 'session';
      } catch (_) {
        return 'session';
      }
    }

    function writeStoredEditorFoldPersist(mode) {
      // session is the default — omit the key; persist none/local explicitly.
      if (mode === 'none' || mode === 'local') backendSave(EDITOR_FOLD_PERSIST_KEY, mode);
      else backendRemove(EDITOR_FOLD_PERSIST_KEY);
    }

    function readStoredEditorActiveLine() { return readBoolDefaultOn(EDITOR_ACTIVE_LINE_KEY); }
    function writeStoredEditorActiveLine(on) { writeBoolDefaultOn(EDITOR_ACTIVE_LINE_KEY, on); }

    function readStoredEditorDiagGutter() { return readBoolDefaultOn(EDITOR_DIAG_GUTTER_KEY); }
    function writeStoredEditorDiagGutter(on) { writeBoolDefaultOn(EDITOR_DIAG_GUTTER_KEY, on); }

    function readStoredEditorHoleGutter() { return readBoolDefaultOn(EDITOR_HOLE_GUTTER_KEY); }
    function writeStoredEditorHoleGutter(on) { writeBoolDefaultOn(EDITOR_HOLE_GUTTER_KEY, on); }

    function readStoredEditorSyntaxHighlight() { return readBoolDefaultOn(EDITOR_SYNTAX_HIGHLIGHT_KEY); }
    function writeStoredEditorSyntaxHighlight(on) { writeBoolDefaultOn(EDITOR_SYNTAX_HIGHLIGHT_KEY, on); }

    function readStoredEditorSemanticHighlight() { return readBoolDefaultOn(EDITOR_SEMANTIC_HIGHLIGHT_KEY); }
    function writeStoredEditorSemanticHighlight(on) { writeBoolDefaultOn(EDITOR_SEMANTIC_HIGHLIGHT_KEY, on); }

    function readStoredEditorParseHighlight() { return readBoolDefaultOn(EDITOR_PARSE_HIGHLIGHT_KEY); }
    function writeStoredEditorParseHighlight(on) { writeBoolDefaultOn(EDITOR_PARSE_HIGHLIGHT_KEY, on); }

    function readStoredEditorOccurrenceHighlight() { return readBoolDefaultOn(EDITOR_OCCURRENCE_HIGHLIGHT_KEY); }
    function writeStoredEditorOccurrenceHighlight(on) { writeBoolDefaultOn(EDITOR_OCCURRENCE_HIGHLIGHT_KEY, on); }

    function readStoredEditorBracketMatch() { return readBoolDefaultOn(EDITOR_BRACKET_MATCH_KEY); }
    function writeStoredEditorBracketMatch(on) { writeBoolDefaultOn(EDITOR_BRACKET_MATCH_KEY, on); }

    function readStoredEditorAutoCloseBrackets() { return readBoolDefaultOn(EDITOR_AUTO_CLOSE_BRACKETS_KEY); }
    function writeStoredEditorAutoCloseBrackets(on) { writeBoolDefaultOn(EDITOR_AUTO_CLOSE_BRACKETS_KEY, on); }

    function readStoredEditorSelectionMatches() { return readBoolDefaultOn(EDITOR_SELECTION_MATCHES_KEY); }
    function writeStoredEditorSelectionMatches(on) { writeBoolDefaultOn(EDITOR_SELECTION_MATCHES_KEY, on); }

    function readStoredEditorReindentPaste() { return readBoolDefaultOn(EDITOR_REINDENT_PASTE_KEY); }
    function writeStoredEditorReindentPaste(on) { writeBoolDefaultOn(EDITOR_REINDENT_PASTE_KEY, on); }

    function readStoredEditorFormatWidth() {
      try {
        var v = parseInt(backendLoad(EDITOR_FORMAT_WIDTH_KEY), 10);
        if (v === 100 || v === 120) return v;
        return 80;
      } catch (_) {
        return 80;
      }
    }

    function writeStoredEditorFormatWidth(width) {
      var n = Number(width);
      if (n === 80) backendRemove(EDITOR_FORMAT_WIDTH_KEY);
      else if (n === 100 || n === 120) backendSave(EDITOR_FORMAT_WIDTH_KEY, String(n));
      else backendRemove(EDITOR_FORMAT_WIDTH_KEY);
    }

    function readStoredEditorAutocompleteTrigger() {
      try {
        var v = backendLoad(EDITOR_AUTOCOMPLETE_TRIGGER_KEY);
        if (v === 'none' || v === 'always') return v;
        return 'typing';
      } catch (_) {
        return 'typing';
      }
    }

    function writeStoredEditorAutocompleteTrigger(mode) {
      if (mode === 'none' || mode === 'always') backendSave(EDITOR_AUTOCOMPLETE_TRIGGER_KEY, mode);
      else backendRemove(EDITOR_AUTOCOMPLETE_TRIGGER_KEY);
    }

    function readStoredEditorAutocompleteContinue() {
      return readBoolDefaultOff(EDITOR_AUTOCOMPLETE_CONTINUE_KEY);
    }

    function writeStoredEditorAutocompleteContinue(on) {
      writeBoolDefaultOff(EDITOR_AUTOCOMPLETE_CONTINUE_KEY, on);
    }

    function readStoredEditorCursorBlink() {
      try {
        var v = backendLoad(EDITOR_CURSOR_BLINK_KEY);
        if (v === 'off' || v === 'fast') return v;
        return 'blink';
      } catch (_) {
        return 'blink';
      }
    }

    function writeStoredEditorCursorBlink(mode) {
      if (mode === 'off' || mode === 'fast') backendSave(EDITOR_CURSOR_BLINK_KEY, mode);
      else backendRemove(EDITOR_CURSOR_BLINK_KEY);
    }

    function readStoredEditorScrollPastEnd() { return readBoolDefaultOn(EDITOR_SCROLL_PAST_END_KEY); }
    function writeStoredEditorScrollPastEnd(on) { writeBoolDefaultOn(EDITOR_SCROLL_PAST_END_KEY, on); }

    function readStoredEditorWhitespace() {
      try {
        var v = backendLoad(EDITOR_WHITESPACE_KEY);
        if (v === 'trailing' || v === 'all' || v === 'selection') return v;
        return 'none';
      } catch (_) {
        return 'none';
      }
    }

    function writeStoredEditorWhitespace(mode) {
      if (mode === 'trailing' || mode === 'all' || mode === 'selection') backendSave(EDITOR_WHITESPACE_KEY, mode);
      else backendRemove(EDITOR_WHITESPACE_KEY);
    }

    function readStoredEditorRulers() { return readBoolDefaultOff(EDITOR_RULERS_KEY); }
    function writeStoredEditorRulers(on) { writeBoolDefaultOff(EDITOR_RULERS_KEY, on); }

    function readStoredEditorFontFamily() {
      try {
        var v = backendLoad(EDITOR_FONT_FAMILY_KEY);
        if (v === 'system') return 'system';
        return 'jetbrains';
      } catch (_) {
        return 'jetbrains';
      }
    }

    function writeStoredEditorFontFamily(family) {
      if (family === 'system') backendSave(EDITOR_FONT_FAMILY_KEY, 'system');
      else backendRemove(EDITOR_FONT_FAMILY_KEY);
    }

    function readStoredEditorHoleEmphasis() {
      try {
        var v = backendLoad(EDITOR_HOLE_EMPHASIS_KEY);
        if (v === 'subtle' || v === 'loud') return v;
        return 'normal';
      } catch (_) {
        return 'normal';
      }
    }

    function writeStoredEditorHoleEmphasis(mode) {
      if (mode === 'subtle' || mode === 'loud') backendSave(EDITOR_HOLE_EMPHASIS_KEY, mode);
      else backendRemove(EDITOR_HOLE_EMPHASIS_KEY);
    }

    function readStoredMotionPref() {
      try {
        var v = backendLoad(MOTION_PREF_KEY);
        if (v === 'reduce' || v === 'full') return v;
        return 'system';
      } catch (_) {
        return 'system';
      }
    }

    function writeStoredMotionPref(mode) {
      if (mode === 'reduce' || mode === 'full') backendSave(MOTION_PREF_KEY, mode);
      else backendRemove(MOTION_PREF_KEY);
    }

    function applyStoredMotionPref(doc) {
      var root = doc && doc.documentElement ? doc.documentElement : null;
      if (!root && typeof document !== 'undefined') root = document.documentElement;
      if (!root) return;
      var mode = readStoredMotionPref();
      root.classList.toggle('bj-motion-reduce', mode === 'reduce');
      root.classList.toggle('bj-motion-full', mode === 'full');
    }

    function prefersReducedMotion() {
      var mode = readStoredMotionPref();
      if (mode === 'reduce') return true;
      if (mode === 'full') return false;
      try {
        return typeof matchMedia === 'function'
          && matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (_) {
        return false;
      }
    }

    function readStoredToastDuration() {
      try {
        var v = backendLoad(TOAST_DURATION_KEY);
        if (v === 'short' || v === 'long') return v;
        return 'normal';
      } catch (_) {
        return 'normal';
      }
    }

    function writeStoredToastDuration(mode) {
      if (mode === 'short' || mode === 'long') backendSave(TOAST_DURATION_KEY, mode);
      else backendRemove(TOAST_DURATION_KEY);
    }

    function toastDurationMs() {
      var mode = readStoredToastDuration();
      if (mode === 'short') return 2000;
      if (mode === 'long') return 6000;
      return 3500;
    }

    function readStoredCheckAggressiveness() {
      try {
        var v = backendLoad(CHECK_AGGRESSIVENESS_KEY);
        if (v === 'responsive' || v === 'thorough') return v;
        return 'balanced';
      } catch (_) {
        return 'balanced';
      }
    }

    function writeStoredCheckAggressiveness(mode) {
      if (mode === 'responsive' || mode === 'thorough') backendSave(CHECK_AGGRESSIVENESS_KEY, mode);
      else backendRemove(CHECK_AGGRESSIVENESS_KEY);
    }

    function checkAggressivenessScale() {
      var mode = readStoredCheckAggressiveness();
      if (mode === 'responsive') return 0.7;
      if (mode === 'thorough') return 1.45;
      return 1;
    }

    function readStoredAutosolveFocusNext() { return readBoolDefaultOn(AUTOSOLVE_FOCUS_NEXT_KEY); }
    function writeStoredAutosolveFocusNext(on) { writeBoolDefaultOn(AUTOSOLVE_FOCUS_NEXT_KEY, on); }

    function readStoredAutosolveShowStats() { return readBoolDefaultOn(AUTOSOLVE_SHOW_STATS_KEY); }
    function writeStoredAutosolveShowStats(on) { writeBoolDefaultOn(AUTOSOLVE_SHOW_STATS_KEY, on); }

    function readStoredQuietWhileTyping() { return readBoolDefaultOff(QUIET_WHILE_TYPING_KEY); }
    function writeStoredQuietWhileTyping(on) { writeBoolDefaultOff(QUIET_WHILE_TYPING_KEY, on); }

    function readStoredDiagPresentation() {
      try {
        var v = backendLoad(DIAG_PRESENTATION_KEY);
        if (v === 'underlines' || v === 'gutter' || v === 'none' || v === 'both') return v;
        // Legacy: diag gutter off meant underlines-only (squiggles stayed).
        if (backendLoad(EDITOR_DIAG_GUTTER_KEY) === 'off') return 'underlines';
        return 'both';
      } catch (_) {
        return 'both';
      }
    }

    function writeStoredDiagPresentation(mode) {
      if (mode === 'underlines' || mode === 'gutter' || mode === 'none') {
        backendSave(DIAG_PRESENTATION_KEY, mode);
      } else {
        backendRemove(DIAG_PRESENTATION_KEY);
      }
      // Keep legacy key coherent for older readers.
      if (mode === 'underlines' || mode === 'none') writeBoolDefaultOn(EDITOR_DIAG_GUTTER_KEY, false);
      else writeBoolDefaultOn(EDITOR_DIAG_GUTTER_KEY, true);
    }

    function readStoredDiagSeverity() {
      try {
        var v = backendLoad(DIAG_SEVERITY_KEY);
        if (v === 'errors') return 'errors';
        return 'all';
      } catch (_) {
        return 'all';
      }
    }

    function writeStoredDiagSeverity(mode) {
      if (mode === 'errors') backendSave(DIAG_SEVERITY_KEY, 'errors');
      else backendRemove(DIAG_SEVERITY_KEY);
    }

    function readStoredFormatOnSave() { return readBoolDefaultOff(FORMAT_ON_SAVE_KEY); }
    function writeStoredFormatOnSave(on) { writeBoolDefaultOff(FORMAT_ON_SAVE_KEY, on); }

    function readStoredTrimTrailingWs() { return readBoolDefaultOff(TRIM_TRAILING_WS_KEY); }
    function writeStoredTrimTrailingWs(on) { writeBoolDefaultOff(TRIM_TRAILING_WS_KEY, on); }

    function readStoredStickyDeclHeader() { return readBoolDefaultOff(STICKY_DECL_HEADER_KEY); }
    function writeStoredStickyDeclHeader(on) { writeBoolDefaultOff(STICKY_DECL_HEADER_KEY, on); }

    function readStoredSuiteCheck() {
      try {
        var v = backendLoad(SUITE_CHECK_KEY);
        if (v === 'active') return 'active';
        return 'suite';
      } catch (_) {
        return 'suite';
      }
    }

    function writeStoredSuiteCheck(mode) {
      if (mode === 'active') backendSave(SUITE_CHECK_KEY, 'active');
      else backendRemove(SUITE_CHECK_KEY);
    }

    function readStoredHoverSticky() { return readBoolDefaultOff(HOVER_STICKY_KEY); }
    function writeStoredHoverSticky(on) { writeBoolDefaultOff(HOVER_STICKY_KEY, on); }

    function applyStoredEditorChrome(doc) {
      var root = doc && doc.documentElement ? doc.documentElement : null;
      if (!root && typeof document !== 'undefined') root = document.documentElement;
      if (!root) return;
      var family = readStoredEditorFontFamily();
      root.style.setProperty(
        '--editor-mono',
        family === 'system'
          ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
          : "'JetBrains Mono', monospace"
      );
      root.style.setProperty('--editor-ligatures', 'none');
      backendRemove('beljar-editor-ligatures');
      var emph = readStoredEditorHoleEmphasis();
      root.classList.toggle('bj-hole-subtle', emph === 'subtle');
      root.classList.toggle('bj-hole-loud', emph === 'loud');
    }

    var USER_SETTINGS_EXPORT_KEYS = [
      'beljar-theme',
      'beljar-ui-font-size',
      'beljar-ui-text-contrast',
      'beljar-motion-pref',
      'beljar-toast-duration',
      'beljar-beluga-mode',
      'beljar-beluga-fallback-stable',
      'beljar-beluga-cancel-on-edit',
      'beljar-check-aggressiveness',
      'beljar-hover-scope',
      'beljar-alias-activation',
      'beljar-alias-pairs',
      'beljar-cfg-auto-sync',
      'beljar-repl-autoscroll',
      'beljar-repl-welcome',
      'beljar-repl-echo',
      'beljar-repl-filter-chatter',
      'beljar-repl-hover-timestamp',
      'beljar-repl-history-cap',
      'beljar-repl-history-persist',
      'beljar-library-expand-default',
      'beljar-restore-panels',
      'beljar-inspector-follow',
      'beljar-autosave-delay',
      'beljar-autosolve-focus-next',
      'beljar-autosolve-show-stats',
      QUIET_WHILE_TYPING_KEY,
      DIAG_PRESENTATION_KEY,
      DIAG_SEVERITY_KEY,
      FORMAT_ON_SAVE_KEY,
      TRIM_TRAILING_WS_KEY,
      STICKY_DECL_HEADER_KEY,
      SUITE_CHECK_KEY,
      HOVER_STICKY_KEY,
      'beljar-keybindings',
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
      EDITOR_HOLE_EMPHASIS_KEY,
    ];

    function exportUserSettings() {
      var prefs = {};
      for (var i = 0; i < USER_SETTINGS_EXPORT_KEYS.length; i++) {
        var key = USER_SETTINGS_EXPORT_KEYS[i];
        try {
          var v = backendLoad(key);
          if (v != null && v !== '') prefs[key] = v;
        } catch (_) {}
      }
      try {
        if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
          var kb = globalThis.localStorage.getItem('beljar-keybindings');
          if (kb) prefs['beljar-keybindings'] = kb;
        }
      } catch (_) {}
      return { v: 1, exportedAt: Date.now(), prefs: prefs };
    }

    function importUserSettings(bundle) {
      if (!bundle || typeof bundle !== 'object' || !bundle.prefs || typeof bundle.prefs !== 'object') {
        return { ok: false, reason: 'invalid' };
      }
      var prefs = bundle.prefs;
      var applied = 0;
      Object.keys(prefs).forEach(function (key) {
        if (USER_SETTINGS_EXPORT_KEYS.indexOf(key) < 0 && key !== 'beljar-keybindings') return;
        var val = prefs[key];
        if (typeof val !== 'string') return;
        try {
          if (key === 'beljar-keybindings') {
            if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
              if (!val || val === '{}') globalThis.localStorage.removeItem(key);
              else globalThis.localStorage.setItem(key, val);
              applied += 1;
            }
            return;
          }
          backendSave(key, val);
          applied += 1;
        } catch (_) {}
      });
      return { ok: true, applied: applied };
    }

    function resetAppearancePrefs() {
      backendRemove(THEME_STORAGE_KEY);
      backendRemove(UI_FONT_SIZE_KEY);
      backendRemove(UI_TEXT_CONTRAST_KEY);
      backendRemove(MOTION_PREF_KEY);
      backendRemove(TOAST_DURATION_KEY);
    }

    function resetEditorTypographyPrefs() {
      backendRemove(EDITOR_FONT_SIZE_KEY);
      backendRemove(EDITOR_LINE_HEIGHT_KEY);
      backendRemove(EDITOR_WORD_WRAP_KEY);
      backendRemove('beljar-editor-ligatures');
      backendRemove(EDITOR_FONT_FAMILY_KEY);
      backendRemove(EDITOR_CURSOR_BLINK_KEY);
      backendRemove(EDITOR_SCROLL_PAST_END_KEY);
      backendRemove(EDITOR_WHITESPACE_KEY);
      backendRemove(EDITOR_RULERS_KEY);
    }

    function resetEditorIndentPrefs() {
      backendRemove(EDITOR_TAB_SIZE_KEY);
      backendRemove(AUTOSAVE_DELAY_KEY);
      backendRemove(EDITOR_FORMAT_WIDTH_KEY);
      backendRemove(EDITOR_REINDENT_PASTE_KEY);
      backendRemove(CFG_AUTO_SYNC_KEY);
      backendRemove(FORMAT_ON_SAVE_KEY);
      backendRemove(TRIM_TRAILING_WS_KEY);
    }

    function resetEditorCodeInsightPrefs() {
      backendRemove(EDITOR_SYNTAX_HIGHLIGHT_KEY);
      backendRemove(EDITOR_SEMANTIC_HIGHLIGHT_KEY);
      backendRemove(EDITOR_PARSE_HIGHLIGHT_KEY);
      backendRemove(EDITOR_OCCURRENCE_HIGHLIGHT_KEY);
      backendRemove(EDITOR_BRACKET_MATCH_KEY);
      backendRemove(EDITOR_AUTO_CLOSE_BRACKETS_KEY);
      backendRemove(EDITOR_SELECTION_MATCHES_KEY);
      backendRemove(HOVER_SCOPE_KEY);
      backendRemove(EDITOR_AUTOCOMPLETE_TRIGGER_KEY);
      backendRemove(EDITOR_AUTOCOMPLETE_CONTINUE_KEY);
      backendRemove(QUIET_WHILE_TYPING_KEY);
      backendRemove(HOVER_STICKY_KEY);
    }

    function resetEditorGutterPrefs() {
      backendRemove(EDITOR_LINE_NUMBERS_KEY);
      backendRemove(EDITOR_FOLD_GUTTER_KEY);
      backendRemove(EDITOR_FOLD_PERSIST_KEY);
      backendRemove(EDITOR_ACTIVE_LINE_KEY);
      backendRemove(EDITOR_DIAG_GUTTER_KEY);
      backendRemove(DIAG_PRESENTATION_KEY);
      backendRemove(DIAG_SEVERITY_KEY);
      backendRemove(EDITOR_HOLE_GUTTER_KEY);
      backendRemove(EDITOR_HOLE_EMPHASIS_KEY);
      backendRemove(STICKY_DECL_HEADER_KEY);
    }

    function resetEditorPrefs() {
      resetEditorTypographyPrefs();
      resetEditorIndentPrefs();
      resetEditorCodeInsightPrefs();
      resetEditorGutterPrefs();
    }

    function resetBelugaPrefs() {
      backendRemove(BELUGA_MODE_STORAGE_KEY);
      backendRemove(BELUGA_FALLBACK_STABLE_KEY);
      backendRemove(BELUGA_CANCEL_ON_EDIT_KEY);
      backendRemove(CHECK_AGGRESSIVENESS_KEY);
      backendRemove(SUITE_CHECK_KEY);
      backendRemove(AUTOSOLVE_FOCUS_NEXT_KEY);
      backendRemove(AUTOSOLVE_SHOW_STATS_KEY);
    }

    function resetReplPrefs() {
      backendRemove(REPL_AUTOSCROLL_KEY);
      backendRemove(REPL_WELCOME_KEY);
      backendRemove(REPL_ECHO_KEY);
      backendRemove(REPL_FILTER_CHATTER_KEY);
      backendRemove(REPL_HOVER_TIMESTAMP_KEY);
      backendRemove(REPL_HISTORY_CAP_KEY);
      backendRemove(REPL_HISTORY_PERSIST_KEY);
      clearReplHistoryPayload();
    }

    var KEYBINDINGS_KEY = 'beljar-keybindings';

    function readStoredKeybindings() {
      try {
        var raw = globalThis.localStorage && globalThis.localStorage.getItem(KEYBINDINGS_KEY);
        if (!raw) return {};
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        var out = {};
        Object.keys(parsed).forEach(function (id) {
          var v = parsed[id];
          if (v === '' || v === null) out[id] = '';
          else if (typeof v === 'string') out[id] = v;
        });
        return out;
      } catch (_) {
        return {};
      }
    }

    function writeStoredKeybindings(map) {
      try {
        if (!globalThis.localStorage) return;
        var clean = {};
        if (map && typeof map === 'object') {
          Object.keys(map).forEach(function (id) {
            var v = map[id];
            if (v === '' || v === null) clean[id] = '';
            else if (typeof v === 'string' && v) clean[id] = v;
          });
        }
        if (!Object.keys(clean).length) globalThis.localStorage.removeItem(KEYBINDINGS_KEY);
        else globalThis.localStorage.setItem(KEYBINDINGS_KEY, JSON.stringify(clean));
      } catch (_) {}
    }

    function resetKeybindingPrefs() {
      writeStoredKeybindings({});
    }

    function resetAliasesPrefs() {
      backendRemove(ALIAS_ACTIVATION_KEY);
      backendRemove(ALIAS_PAIRS_KEY);
    }

    function isAliasExpandablePath(name) {
      var PS = typeof ProjectSource !== 'undefined' ? ProjectSource : null;
      if (PS && typeof PS.isBelPath === 'function') return PS.isBelPath(name);
      var n = String(name || '').toLowerCase();
      if (n.endsWith('.cfg') || n.endsWith('.elf')) return false;
      if (n.endsWith('.bel')) return true;
      var base = String(name || '').slice(String(name || '').lastIndexOf('/') + 1);
      return base.indexOf('.') === -1;
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
      if (typeof BelEditor !== 'undefined' && typeof BelEditor.expandBelAliases === 'function') {
        return BelEditor.expandBelAliases(text);
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

    return {
      readStoredBelugaMode: readStoredBelugaMode,
      writeStoredBelugaMode: writeStoredBelugaMode,
      readStoredHoverScope: readStoredHoverScope,
      writeStoredHoverScope: writeStoredHoverScope,
      readStoredCfgAutoSync: readStoredCfgAutoSync,
      writeStoredCfgAutoSync: writeStoredCfgAutoSync,
      readStoredAliasActivation: readStoredAliasActivation,
      writeStoredAliasActivation: writeStoredAliasActivation,
      readStoredAliasPairs: readStoredAliasPairs,
      writeStoredAliasPairs: writeStoredAliasPairs,
      readBoolDefaultOn: readBoolDefaultOn,
      writeBoolDefaultOn: writeBoolDefaultOn,
      readBoolDefaultOff: readBoolDefaultOff,
      writeBoolDefaultOff: writeBoolDefaultOff,
      readStoredReplAutoscroll: readStoredReplAutoscroll,
      writeStoredReplAutoscroll: writeStoredReplAutoscroll,
      readStoredReplWelcome: readStoredReplWelcome,
      writeStoredReplWelcome: writeStoredReplWelcome,
      readStoredReplEcho: readStoredReplEcho,
      writeStoredReplEcho: writeStoredReplEcho,
      readStoredReplFilterChatter: readStoredReplFilterChatter,
      writeStoredReplFilterChatter: writeStoredReplFilterChatter,
      readStoredReplHoverTimestamp: readStoredReplHoverTimestamp,
      writeStoredReplHoverTimestamp: writeStoredReplHoverTimestamp,
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
      readStoredEditorAutocompleteTrigger: readStoredEditorAutocompleteTrigger,
      writeStoredEditorAutocompleteTrigger: writeStoredEditorAutocompleteTrigger,
      readStoredEditorAutocompleteContinue: readStoredEditorAutocompleteContinue,
      writeStoredEditorAutocompleteContinue: writeStoredEditorAutocompleteContinue,
      readStoredEditorCursorBlink: readStoredEditorCursorBlink,
      writeStoredEditorCursorBlink: writeStoredEditorCursorBlink,
      readStoredEditorScrollPastEnd: readStoredEditorScrollPastEnd,
      writeStoredEditorScrollPastEnd: writeStoredEditorScrollPastEnd,
      readStoredEditorWhitespace: readStoredEditorWhitespace,
      writeStoredEditorWhitespace: writeStoredEditorWhitespace,
      readStoredEditorRulers: readStoredEditorRulers,
      writeStoredEditorRulers: writeStoredEditorRulers,
      readStoredEditorFontFamily: readStoredEditorFontFamily,
      writeStoredEditorFontFamily: writeStoredEditorFontFamily,
      readStoredEditorHoleEmphasis: readStoredEditorHoleEmphasis,
      writeStoredEditorHoleEmphasis: writeStoredEditorHoleEmphasis,
      readStoredMotionPref: readStoredMotionPref,
      writeStoredMotionPref: writeStoredMotionPref,
      applyStoredMotionPref: applyStoredMotionPref,
      prefersReducedMotion: prefersReducedMotion,
      readStoredToastDuration: readStoredToastDuration,
      writeStoredToastDuration: writeStoredToastDuration,
      toastDurationMs: toastDurationMs,
      readStoredCheckAggressiveness: readStoredCheckAggressiveness,
      writeStoredCheckAggressiveness: writeStoredCheckAggressiveness,
      checkAggressivenessScale: checkAggressivenessScale,
      readStoredAutosolveFocusNext: readStoredAutosolveFocusNext,
      writeStoredAutosolveFocusNext: writeStoredAutosolveFocusNext,
      readStoredAutosolveShowStats: readStoredAutosolveShowStats,
      writeStoredAutosolveShowStats: writeStoredAutosolveShowStats,
      readStoredQuietWhileTyping: readStoredQuietWhileTyping,
      writeStoredQuietWhileTyping: writeStoredQuietWhileTyping,
      readStoredDiagPresentation: readStoredDiagPresentation,
      writeStoredDiagPresentation: writeStoredDiagPresentation,
      readStoredDiagSeverity: readStoredDiagSeverity,
      writeStoredDiagSeverity: writeStoredDiagSeverity,
      readStoredFormatOnSave: readStoredFormatOnSave,
      writeStoredFormatOnSave: writeStoredFormatOnSave,
      readStoredTrimTrailingWs: readStoredTrimTrailingWs,
      writeStoredTrimTrailingWs: writeStoredTrimTrailingWs,
      readStoredStickyDeclHeader: readStoredStickyDeclHeader,
      writeStoredStickyDeclHeader: writeStoredStickyDeclHeader,
      readStoredSuiteCheck: readStoredSuiteCheck,
      writeStoredSuiteCheck: writeStoredSuiteCheck,
      readStoredHoverSticky: readStoredHoverSticky,
      writeStoredHoverSticky: writeStoredHoverSticky,
      applyStoredEditorChrome: applyStoredEditorChrome,
      exportUserSettings: exportUserSettings,
      importUserSettings: importUserSettings,
      resetAppearancePrefs: resetAppearancePrefs,
      resetEditorTypographyPrefs: resetEditorTypographyPrefs,
      resetEditorIndentPrefs: resetEditorIndentPrefs,
      resetEditorCodeInsightPrefs: resetEditorCodeInsightPrefs,
      resetEditorGutterPrefs: resetEditorGutterPrefs,
      resetEditorPrefs: resetEditorPrefs,
      resetBelugaPrefs: resetBelugaPrefs,
      resetReplPrefs: resetReplPrefs,
      readStoredKeybindings: readStoredKeybindings,
      writeStoredKeybindings: writeStoredKeybindings,
      resetKeybindingPrefs: resetKeybindingPrefs,
      resetAliasesPrefs: resetAliasesPrefs,
      isAliasExpandablePath: isAliasExpandablePath,
      fileNameForId: fileNameForId,
      expandAliasesForStorage: expandAliasesForStorage,
      expandAliasesInAllFiles: expandAliasesInAllFiles,
      explorerFoldKey: explorerFoldKey,
      getExplorerFold: getExplorerFold,
      setExplorerFold: setExplorerFold,
    };
  }
