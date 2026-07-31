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

assert.equal(P.readStoredReplHoverTimestamp(), true);
P.writeStoredReplHoverTimestamp(false);
assert.equal(P.readStoredReplHoverTimestamp(), false);
P.writeStoredReplHoverTimestamp(true);
assert.equal(P.readStoredReplHoverTimestamp(), true);

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

console.log('OK settings persist');
