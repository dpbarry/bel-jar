import assert from 'node:assert/strict';
import {
  applySplitVars,
  applyStoredSettings,
  installEarlyBoot,
} from '../js/boot/early-boot-core.mjs';
import { createTable } from '../js/persist/table.mjs';
import { DEVICE, DEVICE_KEY } from '../js/persist/device-schema.mjs';
import { UI_FONT_SCALES, UI_TEXT_CONTRAST } from '../js/persist/settings-apply.mjs';
import { SCHEMA, createStore, createMemoryStorage } from '../js/persist/store.mjs';
import { createWork } from '../js/persist/work.mjs';

// What the store writes: the schema, and the settings record in its envelope.
function settingsStorage(values, extra = {}) {
  return {
    data: {
      'beljar/schema': String(SCHEMA),
      'beljar/settings': JSON.stringify({ at: 1, data: { values } }),
      ...extra,
    },
    getItem(k) { return this.data[k] ?? null; },
  };
}
import {
  resolveActivePanel,
  applyActivePanel,
} from '../js/boot/panel-restore-core.mjs';

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

// First paint sizes the panels and the split from what the app wrote: a real
// device table writes, early boot reads the same record without the store.
{
  const mem = createMemoryStorage();
  const device = createTable(createStore({ storage: mem }), { key: DEVICE_KEY, rows: DEVICE });
  const boot = () => {
    const el = {
      classList: { toggle() {} },
      style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } },
    };
    installEarlyBoot({ document: { documentElement: el }, window: { matchMedia: () => ({ matches: false }) }, localStorage: mem });
    return el.style.props;
  };

  let props = boot();
  assert.equal(props['--explorer-w'], undefined, 'a fresh browser paints no panel size: the stylesheet has the defaults');
  assert.equal(props['--workspace-split-cols'], '0.5fr 0.5fr', 'and the default split');

  device.set('explorerWidth', 280);
  device.set('harpoonHeight', 300);
  device.set('editorSplit', 0.42);
  props = boot();
  assert.equal(props['--explorer-w'], '280px', 'a dragged width is painted before first paint');
  assert.equal(props['--harpoon-h'], '300px', 'and a dragged height');
  assert.equal(props['--inspector-w'], undefined, 'a size left alone is not');
  assert.equal(props['--workspace-split-cols'], '0.42fr 0.58fr', 'the split is painted');

  device.set('explorerWidth', 9999);
  device.set('editorSplit', 0.01);
  props = boot();
  assert.equal(props['--explorer-w'], '512px', 'a drag past the edge is clamped when it is stored');
  assert.equal(props['--workspace-split-cols'], '0.18fr 0.82fr', 'and so is the split');

  assert.equal(device.reset((row) => row.group === 'layout'), true);
  props = boot();
  assert.equal(props['--explorer-w'], undefined, 'Reset panel layout puts every size back');
}

// applyStoredSettings — first paint from the settings record
const docEl = {
  classList: {
    classes: new Set(),
    add(c) { this.classes.add(c); },
    toggle(c, on) { if (on) this.classes.add(c); else this.classes.delete(c); },
  },
  style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
};
const themeStore = settingsStorage({
  theme: 'light',
  uiFontSize: 'lg',
  uiTextContrast: 'high',
  motionPref: 'reduce',
  editorFontFamily: 'system',
  editorHoleEmphasis: 'loud',
});
applyStoredSettings(docEl, themeStore);
assert.ok(docEl.classList.classes.has('light'));
assert.equal(docEl.style.props['--ui-font-scale'], String(UI_FONT_SCALES.lg));
assert.equal(docEl.style.props['--ui-text-contrast'], String(UI_TEXT_CONTRAST.high));
assert.ok(docEl.classList.classes.has('jar-motion-reduce'));
assert.equal(docEl.style.props['--editor-ligatures'], 'none');
assert.ok(docEl.classList.classes.has('jar-hole-loud'));

// Another schema's record is about to be wiped: first paint uses the defaults.
const staleEl = {
  classList: { classes: new Set(), toggle(c, on) { if (on) this.classes.add(c); else this.classes.delete(c); } },
  style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
};
const stale = settingsStorage({ theme: 'light' });
stale.data['beljar/schema'] = String(SCHEMA + 1);
applyStoredSettings(staleEl, stale);
assert.ok(!staleEl.classList.classes.has('light'), 'a record from another schema is not painted');

// Panel restore reads what the app wrote: the real work model writes this
// project's session, early boot finds the panel in it without the store.
{
  const mem = createMemoryStorage();
  const work = createWork({ store: createStore({ storage: mem }) });
  assert.equal(resolveActivePanel(mem), null, 'a fresh browser restores no panel');
  work.updateSession((sess) => { sess.panel = 'library'; });
  assert.equal(resolveActivePanel(mem), 'library', 'the project\'s panel comes back (restore panels is on by default)');

  // Another project on this device has its own panel; the one to open next decides.
  const other = work.createProject('Other');
  work.updateSession((sess) => { sess.panel = 'harpoon'; }, other);
  assert.equal(resolveActivePanel(mem), 'library', 'another project\'s panel is not this one\'s');
  work.setActiveProject(other);
  assert.equal(resolveActivePanel(mem), 'harpoon', 'switching projects switches the panel');

  mem.setItem('beljar/settings', JSON.stringify({ at: 1, data: { values: { restorePanels: false } } }));
  assert.equal(resolveActivePanel(mem), null, 'turning restore panels off is honoured at boot');
  mem.removeItem('beljar/settings');

  work.updateSession((sess) => { sess.panel = 'nonsense'; }, other);
  assert.equal(resolveActivePanel(mem), null, 'a panel id early boot does not know opens nothing');

  work.updateSession((sess) => { sess.panel = 'harpoon'; }, other);
  mem.setItem('beljar/schema', String(SCHEMA + 1));
  assert.equal(resolveActivePanel(mem), null, 'another schema\'s session is about to be wiped: nothing restored');
}

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
