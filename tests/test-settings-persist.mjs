import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert';

const here = dirname(fileURLToPath(import.meta.url));
const persistSrc = readFileSync(join(here, '..', 'js', 'persist.js'), 'utf8');

function freshPersist() {
  const storage = new Map();
  const fakeLocalStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  const ctx = vm.createContext({
    globalThis: {},
    clearTimeout,
    setTimeout,
    TextEncoder,
    localStorage: fakeLocalStorage,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  ctx.globalThis = ctx;
  vm.runInContext(persistSrc, ctx);
  return ctx.BelJarPersist;
}

const P = freshPersist();

assert.equal(P.readStoredReplAutoscroll(), true);
P.writeStoredReplAutoscroll(false);
assert.equal(P.readStoredReplAutoscroll(), false);

assert.equal(P.readStoredReplHistoryCap(), 0);
P.writeStoredReplHistoryCap(500);
assert.equal(P.readStoredReplHistoryCap(), 500);

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

console.log('OK settings persist');
