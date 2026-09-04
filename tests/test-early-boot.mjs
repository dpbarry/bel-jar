import assert from 'node:assert/strict';
import {
  clampSplit,
  applySplitVars,
  applyStoredPanelPx,
  applyDocumentPrefs,
  readSplitRatio,
  UI_FONT_SCALES,
  UI_TEXT_CONTRAST,
} from '../js/boot/early-boot-core.mjs';
import {
  panelStorageKey,
  resolveActivePanel,
  applyActivePanel,
} from '../js/boot/panel-restore-core.mjs';

// clampSplit
assert.equal(clampSplit(0.5, 0.18, 0.82, 0.5), 0.5);
assert.equal(clampSplit(0.1, 0.18, 0.82, 0.5), 0.18);
assert.equal(clampSplit(0.9, 0.18, 0.82, 0.5), 0.82);
assert.equal(clampSplit(NaN, 0.18, 0.82, 0.5), 0.5);

// readSplitRatio
const store = {
  data: { 'beljar-editor-split': '0.42' },
  getItem(k) { return this.data[k] ?? null; },
};
assert.equal(readSplitRatio(store, 'beljar-editor-split', 0.18, 0.82, 0.5), 0.42);

// applySplitVars — wide layout
const wideRoot = { props: {}, removeProperty(k) { delete this.props[k]; }, setProperty(k, v) { this.props[k] = v; } };
applySplitVars(wideRoot, 0.6, '(max-width: 48rem)', () => ({ matches: false }));
assert.equal(wideRoot.props['--workspace-split-cols'], '0.6fr 0.4fr');
assert.equal(wideRoot.props['--workspace-split-rows'], undefined);

// applySplitVars — stacked layout
const stackRoot = { props: {}, removeProperty(k) { delete this.props[k]; }, setProperty(k, v) { this.props[k] = v; } };
applySplitVars(stackRoot, 0.6, '(max-width: 48rem)', () => ({ matches: true }));
assert.equal(stackRoot.props['--workspace-split-rows'], '0.6fr 0.4fr');
assert.equal(stackRoot.props['--workspace-split-cols'], undefined);

// applyStoredPanelPx
const panelRoot = { props: {}, setProperty(k, v) { this.props[k] = v; } };
applyStoredPanelPx(panelRoot, store, 'beljar-explorer-w', '--explorer-w');
assert.equal(panelRoot.props['--explorer-w'], undefined);
store.data['beljar-explorer-w'] = '280';
applyStoredPanelPx(panelRoot, store, 'beljar-explorer-w', '--explorer-w');
assert.equal(panelRoot.props['--explorer-w'], '280px');

// applyDocumentPrefs — theme + scale tokens
const docEl = {
  classList: {
    classes: new Set(),
    add(c) { this.classes.add(c); },
    toggle(c, on) { if (on) this.classes.add(c); else this.classes.delete(c); },
  },
  style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
};
const themeStore = {
  data: {
    'beljar-theme': 'light',
    'beljar-ui-font-size': 'lg',
    'beljar-ui-text-contrast': 'high',
    'beljar-motion-pref': 'reduce',
    'beljar-editor-font-family': 'system',
    'beljar-editor-ligatures': 'off',
    'beljar-editor-hole-emphasis': 'loud',
  },
  getItem(k) { return this.data[k] ?? null; },
};
applyDocumentPrefs(docEl, themeStore);
assert.ok(docEl.classList.classes.has('light'));
assert.equal(docEl.style.props['--ui-font-scale'], String(UI_FONT_SCALES.lg));
assert.equal(docEl.style.props['--ui-text-contrast'], String(UI_TEXT_CONTRAST.high));
assert.ok(docEl.classList.classes.has('bj-motion-reduce'));
assert.equal(docEl.style.props['--editor-ligatures'], 'none');
assert.ok(docEl.classList.classes.has('bj-hole-loud'));

// panel restore keys
assert.equal(panelStorageKey('default'), 'beljar-active-side-panel');
assert.equal(panelStorageKey('my/proj'), 'beljar-proj:my_proj:active-side-panel');

const panelStore = {
  data: { 'beljar-restore-panels': 'on', 'beljar-active-project': 'default' },
  getItem(k) { return this.data[k] ?? null; },
};
panelStore.data['beljar-active-side-panel'] = 'library';
assert.equal(resolveActivePanel(panelStore, 'default'), 'library');

panelStore.data = { 'beljar-restore-panels': 'on', 'beljar-harpoon-open': '1' };
assert.equal(resolveActivePanel(panelStore, 'default'), 'harpoon');

panelStore.data = { 'beljar-restore-panels': 'off' };
assert.equal(resolveActivePanel(panelStore, 'default'), null);

// applyActivePanel
const fakeDoc = {
  nodes: {
    workspace: { classList: { classes: new Set(), add(c) { this.classes.add(c); } } },
    'library-panel': { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } },
    'btn-library': { classList: { classes: new Set(), add(c) { this.classes.add(c); } }, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } },
  },
  querySelector(sel) {
    return sel === '.workspace' ? this.nodes.workspace : null;
  },
  getElementById(id) {
    return this.nodes[id] || null;
  },
};
assert.equal(applyActivePanel(fakeDoc, 'library'), true);
assert.ok(fakeDoc.nodes.workspace.classList.classes.has('is-library-open'));
assert.equal(fakeDoc.nodes['library-panel'].attrs['aria-hidden'], 'false');
assert.equal(fakeDoc.nodes['btn-library'].attrs['aria-pressed'], 'true');

console.log('OK test-early-boot.mjs');
