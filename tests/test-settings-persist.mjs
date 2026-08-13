import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import assert from 'node:assert';
import { runPersistStackInContext } from './persist-stack.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function makeStorage() {
  const storage = new Map();
  return {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    _map: storage,
  };
}

function freshPersist() {
  const fakeLocalStorage = makeStorage();
  const fakeSessionStorage = makeStorage();
  const ctx = vm.createContext({
    globalThis: {},
    clearTimeout,
    setTimeout,
    TextEncoder,
    localStorage: fakeLocalStorage,
    sessionStorage: fakeSessionStorage,
  });
  ctx.globalThis = ctx;
  runPersistStackInContext(ctx);
  return { P: ctx.Persist, localStorage: fakeLocalStorage, sessionStorage: fakeSessionStorage };
}

const { P } = freshPersist();

assert.equal(P.readStoredReplAutoscroll(), true);
P.writeStoredReplAutoscroll(false);
assert.equal(P.readStoredReplAutoscroll(), false);

assert.equal(P.readStoredReplHoverTimestamp(), false);
P.writeStoredReplHoverTimestamp(true);
assert.equal(P.readStoredReplHoverTimestamp(), true);
P.writeStoredReplHoverTimestamp(false);
assert.equal(P.readStoredReplHoverTimestamp(), false);

assert.equal(P.readStoredReplHistoryCap(), 1000);
P.writeStoredReplHistoryCap(500);
assert.equal(P.readStoredReplHistoryCap(), 500);
P.writeStoredReplHistoryCap(1000);
assert.equal(P.readStoredReplHistoryCap(), 1000);

assert.equal(P.readStoredReplHistoryPersist(), 'local');
P.writeStoredReplHistoryPersist('session');
assert.equal(P.readStoredReplHistoryPersist(), 'session');
P.writeStoredReplHistoryPersist('none');
assert.equal(P.readStoredReplHistoryPersist(), 'none');
P.writeStoredReplHistoryPersist('local');
assert.equal(P.readStoredReplHistoryPersist(), 'local');

assert.equal(P.readStoredReplTranscript(), null);
P.writeStoredReplTranscript({ html: '<div class="repl-banner"></div>', scrollTop: 12, savedAt: 99 });
{
  const snap = P.readStoredReplTranscript();
  assert.ok(snap);
  assert.equal(snap.v, 1);
  assert.equal(snap.html, '<div class="repl-banner"></div>');
  assert.equal(snap.scrollTop, 12);
  assert.equal(snap.savedAt, 99);
}
P.writeStoredReplTranscript(null);
assert.equal(P.readStoredReplTranscript(), null);

assert.deepEqual(P.readStoredReplCommandHistory(), []);
P.writeStoredReplCommandHistory(['types', 'help', 'query 1 * D : nat']);
assert.deepEqual(P.readStoredReplCommandHistory(), ['types', 'help', 'query 1 * D : nat']);
P.writeStoredReplCommandHistory([]);
assert.deepEqual(P.readStoredReplCommandHistory(), []);

{
  const { P: P2, localStorage: ls, sessionStorage: ss } = freshPersist();
  P2.writeStoredReplHistoryPersist('local');
  P2.writeStoredReplTranscript({ html: '<div>local</div>', scrollTop: 0, savedAt: 1 });
  P2.writeStoredReplCommandHistory(['local-cmd']);
  assert.ok(ls.getItem('beljar-repl-transcript-v1'));
  assert.equal(ss.getItem('beljar-repl-transcript-v1'), null);

  P2.writeStoredReplHistoryPersist('session');
  assert.ok(ss.getItem('beljar-repl-transcript-v1'));
  assert.equal(ls.getItem('beljar-repl-transcript-v1'), null);
  assert.deepEqual(P2.readStoredReplCommandHistory(), ['local-cmd']);
  assert.equal(P2.readStoredReplTranscript().html, '<div>local</div>');

  P2.writeStoredReplHistoryPersist('none');
  assert.equal(P2.readStoredReplTranscript(), null);
  assert.deepEqual(P2.readStoredReplCommandHistory(), []);
  assert.equal(ls.getItem('beljar-repl-transcript-v1'), null);
  assert.equal(ss.getItem('beljar-repl-transcript-v1'), null);

  P2.writeStoredReplTranscript({ html: '<div>ignored</div>', scrollTop: 0, savedAt: 2 });
  P2.writeStoredReplCommandHistory(['ignored']);
  assert.equal(P2.readStoredReplTranscript(), null);
  assert.deepEqual(P2.readStoredReplCommandHistory(), []);
}

assert.equal(P.readStoredBelugaFallbackStable(), true);
P.writeStoredBelugaFallbackStable(false);
assert.equal(P.readStoredBelugaFallbackStable(), false);

assert.equal(P.readStoredRestorePanels(), true);
P.writeStoredRestorePanels(false);
assert.equal(P.readStoredRestorePanels(), false);

assert.equal(P.readStoredAutosaveDelay(), 320);
P.writeStoredAutosaveDelay(2000);
assert.equal(P.readStoredAutosaveDelay(), 2000);

assert.equal(P.readStoredEditorSyntaxHighlight(), true);
P.writeStoredEditorSyntaxHighlight(false);
assert.equal(P.readStoredEditorSyntaxHighlight(), false);

assert.equal(P.readStoredUiFontSize(), 'md');
P.writeStoredUiFontSize('lg');
assert.equal(P.readStoredUiFontSize(), 'lg');
assert.equal(P.uiFontScaleForSize('lg'), 1.125);
P.writeStoredUiFontSize('md');
assert.equal(P.readStoredUiFontSize(), 'md');
assert.equal(P.readStoredUiTextContrast(), 'medium');
assert.equal(P.uiTextContrastMultiplierForLevel('unknown'), 1.6);
P.writeStoredUiTextContrast('low');
assert.equal(P.readStoredUiTextContrast(), 'low');
assert.equal(P.uiTextContrastMultiplierForLevel('low'), 1);
P.writeStoredUiTextContrast('medium');
assert.equal(P.readStoredUiTextContrast(), 'medium');
assert.equal(P.uiTextContrastMultiplierForLevel('medium'), 1.6);
P.writeStoredUiTextContrast('maximum');
assert.equal(P.readStoredUiTextContrast(), 'maximum');
assert.equal(P.uiTextContrastMultiplierForLevel('maximum'), 4.5);
P.resetAppearancePrefs();
assert.equal(P.readStoredUiFontSize(), 'md');
assert.equal(P.readStoredUiTextContrast(), 'medium');

P.writeStoredEditorSplit(0.42);
assert.ok(Math.abs(P.readStoredEditorSplit() - 0.42) < 0.001);
P.writeStoredExplorerWidth(300);
P.writeStoredHarpoonHeight(220);
assert.equal(P.readStoredExplorerWidth(), 300);
assert.equal(P.readStoredHarpoonHeight(), 220);
P.resetLayoutPrefs();
assert.equal(P.readStoredEditorSplit(), 0.5);
assert.equal(P.readStoredExplorerWidth(), P.DEFAULT_SIDE_PANEL_WIDTH);
assert.equal(P.readStoredInspectorWidth(), P.DEFAULT_SIDE_PANEL_WIDTH);
assert.equal(P.readStoredLibraryWidth(), P.DEFAULT_SIDE_PANEL_WIDTH);
assert.equal(P.readStoredHarpoonWidth(), P.DEFAULT_SIDE_PANEL_WIDTH);
assert.equal(P.readStoredExplorerHeight(), P.DEFAULT_SIDE_PANEL_HEIGHT);
assert.equal(P.readStoredHarpoonHeight(), P.DEFAULT_SIDE_PANEL_HEIGHT);
assert.equal(P.DEFAULT_SIDE_PANEL_WIDTH, 250);
assert.equal(P.DEFAULT_SIDE_PANEL_HEIGHT, 190);

assert.equal(P.readStoredInspectorFollow(), true);
P.writeStoredInspectorFollow(false);
assert.equal(P.readStoredInspectorFollow(), false);
P.writeStoredInspectorFollow(true);
assert.equal(P.readStoredInspectorFollow(), true);

assert.equal(P.readStoredReplEcho(), true);
P.writeStoredReplEcho(false);
assert.equal(P.readStoredReplEcho(), false);
P.writeStoredReplEcho(true);

assert.equal(P.readStoredReplFilterChatter(), true);
P.writeStoredReplFilterChatter(false);
assert.equal(P.readStoredReplFilterChatter(), false);

assert.equal(P.readStoredEditorCursorBlink(), 'blink');
P.writeStoredEditorCursorBlink('off');
assert.equal(P.readStoredEditorCursorBlink(), 'off');
P.writeStoredEditorCursorBlink('blink');
assert.equal(P.readStoredEditorCursorBlink(), 'blink');

assert.equal(P.readStoredEditorScrollPastEnd(), true);
P.writeStoredEditorScrollPastEnd(false);
assert.equal(P.readStoredEditorScrollPastEnd(), false);

assert.equal(P.readStoredEditorWhitespace(), 'none');
P.writeStoredEditorWhitespace('trailing');
assert.equal(P.readStoredEditorWhitespace(), 'trailing');
P.writeStoredEditorWhitespace('selection');
assert.equal(P.readStoredEditorWhitespace(), 'selection');
P.writeStoredEditorWhitespace('all');
assert.equal(P.readStoredEditorWhitespace(), 'all');
P.writeStoredEditorWhitespace('none');
assert.equal(P.readStoredEditorWhitespace(), 'none');

assert.equal(P.readStoredEditorRulers(), false);
P.writeStoredEditorRulers(true);
assert.equal(P.readStoredEditorRulers(), true);

assert.equal(P.readStoredEditorFontFamily(), 'jetbrains');
P.writeStoredEditorFontFamily('system');
assert.equal(P.readStoredEditorFontFamily(), 'system');
P.writeStoredEditorFontFamily('jetbrains');

assert.equal(P.readStoredEditorHoleEmphasis(), 'normal');
P.writeStoredEditorHoleEmphasis('loud');
assert.equal(P.readStoredEditorHoleEmphasis(), 'loud');
P.writeStoredEditorHoleEmphasis('normal');

assert.equal(P.readStoredMotionPref(), 'system');
P.writeStoredMotionPref('reduce');
assert.equal(P.readStoredMotionPref(), 'reduce');
assert.equal(P.prefersReducedMotion(), true);
P.writeStoredMotionPref('full');
assert.equal(P.prefersReducedMotion(), false);
P.writeStoredMotionPref('system');

assert.equal(P.readStoredToastDuration(), 'normal');
P.writeStoredToastDuration('short');
assert.equal(P.toastDurationMs(), 2000);
P.writeStoredToastDuration('long');
assert.equal(P.toastDurationMs(), 6000);
P.writeStoredToastDuration('normal');
assert.equal(P.toastDurationMs(), 3500);

assert.equal(P.readStoredCheckAggressiveness(), 'balanced');
assert.equal(P.checkAggressivenessScale(), 1);
P.writeStoredCheckAggressiveness('responsive');
assert.equal(P.checkAggressivenessScale(), 0.7);
P.writeStoredCheckAggressiveness('thorough');
assert.equal(P.checkAggressivenessScale(), 1.45);
P.writeStoredCheckAggressiveness('balanced');

assert.equal(P.readStoredAutosolveFocusNext(), true);
P.writeStoredAutosolveFocusNext(false);
assert.equal(P.readStoredAutosolveFocusNext(), false);
P.writeStoredAutosolveFocusNext(true);

assert.equal(P.readStoredAutosolveShowStats(), true);
P.writeStoredAutosolveShowStats(false);
assert.equal(P.readStoredAutosolveShowStats(), false);
P.writeStoredAutosolveShowStats(true);

assert.equal(P.readStoredQuietWhileTyping(), false);
P.writeStoredQuietWhileTyping(true);
assert.equal(P.readStoredQuietWhileTyping(), true);
P.writeStoredQuietWhileTyping(false);

assert.equal(P.readStoredDiagPresentation(), 'both');
P.writeStoredDiagPresentation('underlines');
assert.equal(P.readStoredDiagPresentation(), 'underlines');
P.writeStoredDiagPresentation('gutter');
assert.equal(P.readStoredDiagPresentation(), 'gutter');
P.writeStoredDiagPresentation('both');
assert.equal(P.readStoredDiagPresentation(), 'both');

assert.equal(P.readStoredDiagSeverity(), 'all');
P.writeStoredDiagSeverity('errors');
assert.equal(P.readStoredDiagSeverity(), 'errors');
P.writeStoredDiagSeverity('all');

assert.equal(P.readStoredFormatOnSave(), false);
P.writeStoredFormatOnSave(true);
assert.equal(P.readStoredFormatOnSave(), true);
P.writeStoredFormatOnSave(false);

assert.equal(P.readStoredTrimTrailingWs(), false);
P.writeStoredTrimTrailingWs(true);
assert.equal(P.readStoredTrimTrailingWs(), true);
P.writeStoredTrimTrailingWs(false);

assert.equal(P.readStoredStickyDeclHeader(), false);
P.writeStoredStickyDeclHeader(true);
assert.equal(P.readStoredStickyDeclHeader(), true);
P.writeStoredStickyDeclHeader(false);

assert.equal(P.readStoredSuiteCheck(), 'suite');
P.writeStoredSuiteCheck('active');
assert.equal(P.readStoredSuiteCheck(), 'active');
P.writeStoredSuiteCheck('suite');
assert.equal(P.readStoredSuiteCheck(), 'suite');

assert.equal(P.readStoredHoverSticky(), false);
P.writeStoredHoverSticky(true);
assert.equal(P.readStoredHoverSticky(), true);
P.writeStoredHoverSticky(false);

{
  P.writeStoredEditorDiagGutter(false);
  // Legacy gutter-off maps to underlines when presentation key unset.
  assert.equal(P.readStoredDiagPresentation(), 'underlines');
  P.writeStoredDiagPresentation('both');
}

{
  P.writeStoredEditorRulers(true);
  P.writeStoredMotionPref('reduce');
  const bundle = P.exportUserSettings();
  assert.equal(bundle.v, 1);
  assert.ok(bundle.prefs['beljar-editor-rulers']);
  assert.equal(bundle.prefs['beljar-motion-pref'], 'reduce');
  P.writeStoredEditorRulers(false);
  P.writeStoredMotionPref('system');
  const result = P.importUserSettings(bundle);
  assert.equal(result.ok, true);
  assert.equal(P.readStoredEditorRulers(), true);
  assert.equal(P.readStoredMotionPref(), 'reduce');
  P.writeStoredEditorRulers(false);
  P.writeStoredMotionPref('system');
}

console.log('OK settings persist');
