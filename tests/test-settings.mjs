// Settings (js/persist/settings*.mjs): one table, one record, one way in.
// docs/PERSIST.md §3.5. Every guarantee the Settings dialog, early boot and the
// editor rely on without re-checking is pinned here.
import { createStore, SCHEMA } from '../js/persist/store.mjs';
import { createSettings, EXPORT_KIND } from '../js/persist/settings.mjs';
import {
  SETTINGS, SECTIONS, SETTINGS_KEY, settingRow, normalizeSetting, sameValue, typeOf, readBootSettings, resolveValues,
} from '../js/persist/settings-schema.mjs';
import { applyDocumentSettings, UI_FONT_SCALES } from '../js/persist/settings-apply.mjs';
import { normalizeValue } from '../js/persist/table.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function fakeStorage(maxChars = Infinity) {
  const m = new Map();
  const used = () => [...m].reduce((a, [k, v]) => a + k.length + v.length, 0);
  return {
    get length() { return m.size; },
    key(i) { return [...m.keys()][i] ?? null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) {
      v = String(v);
      if (used() - (m.has(k) ? k.length + m.get(k).length : 0) + k.length + v.length > maxChars) {
        const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
      }
      m.set(k, v);
    },
    removeItem(k) { m.delete(k); },
  };
}
function fakeEvents() {
  const ls = new Set();
  return {
    addEventListener(t, fn) { if (t === 'storage') ls.add(fn); },
    removeEventListener(t, fn) { ls.delete(fn); },
    fire(e) { for (const fn of ls) fn(e); },
  };
}
function fresh(storage = fakeStorage(), events = fakeEvents()) {
  const store = createStore({ storage, events, now: () => 1 });
  return { store, settings: createSettings(store), storage, events };
}

// ── 0. an Off saved before the strip became obligatory reads as on ──────────
{
  const { store } = fresh();
  store.set(SETTINGS_KEY, { values: { statusStrip: 'off', theme: 'light' } });
  const settings = createSettings(store);
  expect(settings.get('theme') === 'light', 'the saved record is read');
  expect(settings.get('statusStrip') === 'standard', `but a saved "off" is no value the table holds: the strip is on (${settings.get('statusStrip')})`);
}

// ── 1. the table is well-formed ──────────────────────────────────────────────
{
  const ids = SETTINGS.map((r) => r.id);
  expect(new Set(ids).size === ids.length, 'every setting id is unique');
  for (const row of SETTINGS) {
    expect(SECTIONS.includes(row.section), `${row.id} belongs to a real Settings section`);
    expect(sameValue(normalizeSetting(row, row.default), row.default),
      `${row.id}: its default is a value it can hold (${JSON.stringify(row.default)})`);
    if (row.values) expect(new Set(row.values.map(String)).size === row.values.length, `${row.id}: no duplicate choices`);
    expect(['enum', 'bool', 'string', 'json'].includes(typeOf(row)), `${row.id}: has a type`);
  }
  for (const s of SECTIONS) expect(SETTINGS.some((r) => r.section === s), `section ${s} has settings`);
  expect(SETTINGS.filter((r) => r.boot).map((r) => r.id).sort().join() ===
    'editorFontFamily,editorHoleEmphasis,motionPref,theme,uiFontSize,uiTextContrast',
    'exactly the settings first paint needs are marked boot');
}

// ── 2. get / set ─────────────────────────────────────────────────────────────
{
  const { settings, store } = fresh();
  expect(settings.get('theme') === 'dark' && settings.get('editorTabSize') === 2, 'unset settings read as their default');
  let threw = false;
  try { settings.get('noSuchSetting'); } catch (_) { threw = true; }
  expect(threw, 'reading an undeclared setting throws: declare it in the table');

  expect(settings.set('theme', 'light') && settings.get('theme') === 'light', 'a valid value is stored');
  expect(!settings.set('theme', 'purple') && settings.get('theme') === 'light', 'an invalid value is refused and changes nothing');
  expect(!settings.set('editorWordWrap', 'on') && settings.get('editorWordWrap') === false, 'a bool setting refuses a non-boolean');
  expect(settings.set('editorTabSize', '4') && settings.get('editorTabSize') === 4, 'a numeric choice accepts its dropdown string');
  expect(!settings.set('editorTabSize', '3'), 'but only a listed number');
  expect(!settings.set('doubleTapCommand', ''), 'a string setting refuses the empty string');
  // The status strip is always there (2026-09-30): its setting is how much it says.
  expect(settings.get('statusStrip') === 'standard', 'the status strip says a standard amount by default');
  expect(!settings.set('statusStrip', 'off') && settings.get('statusStrip') === 'standard', 'and cannot be turned off');
  expect(!settings.set('statusStrip', null), 'nor left to decide for itself');
  expect(settings.set('statusStrip', 'compact') && settings.get('statusStrip') === 'compact', 'only how much it says changes');
  settings.set('statusStrip', 'standard');
  expect(normalizeValue({ values: [null, 'a'], default: null }, null) === null, 'null is still a real choice where a table lists it');

  expect(store.get(SETTINGS_KEY).values.theme === 'light', 'the record holds what was set');
  settings.set('theme', 'dark');
  expect(!('theme' in store.get(SETTINGS_KEY).values), 'setting a value back to its default removes it from the record');
  expect(settings.isDefault('theme') && !settings.isDefault('editorTabSize'), 'isDefault tells the two apart');

  settings.set('keybindings', { 'nav.anywhere': 'Ctrl+K', 'tools.palette': null, junk: 3 });
  const kb = settings.get('keybindings');
  expect(kb['nav.anywhere'] === 'Ctrl+K' && kb['tools.palette'] === '' && !('junk' in kb),
    'keybindings are cleaned: strings kept, null means unbound, anything else dropped');
  kb['nav.anywhere'] = 'mutated';
  expect(settings.get('keybindings')['nav.anywhere'] === 'Ctrl+K', 'a returned object is a copy: mutating it cannot change the setting');
  expect(settings.set('aliasPairs', [['->', '→']]) && settings.get('aliasPairs').length === 1, 'alias pairs accept an array');
  expect(!settings.set('aliasPairs', 'nope'), 'and refuse anything else');
}

// ── 3. reload, reset, sections ───────────────────────────────────────────────
{
  const storage = fakeStorage();
  const a = fresh(storage);
  a.settings.set('theme', 'light');
  a.settings.set('editorFontSize', 'lg');
  a.settings.set('replEcho', false);
  const b = fresh(storage).settings;
  expect(b.get('theme') === 'light' && b.get('editorFontSize') === 'lg' && b.get('replEcho') === false, 'settings survive a reload');
  expect(b.reset('editor') && b.get('editorFontSize') === 'md', 'resetting a section restores its settings');
  expect(b.get('theme') === 'light' && b.get('replEcho') === false, 'and only its settings');
  b.set('editorLineNumberMode', 'relative');
  b.reset('editor');
  expect(b.get('editorLineNumberMode') === 'absolute', 'line-number mode resets with the editor (it never used to)');
  let threw = false;
  try { b.reset('everything'); } catch (_) { threw = true; }
  expect(threw, 'an unknown section throws');
  expect(b.resetAll() && b.get('theme') === 'dark' && b.get('replEcho') === true, 'resetAll restores everything');
  const all = b.values();
  expect(Object.keys(all).length === SETTINGS.length && all.theme === 'dark', 'values() is every setting, resolved');
}

// ── 4. export / import ───────────────────────────────────────────────────────
{
  const { settings } = fresh();
  settings.set('theme', 'light');
  settings.set('keymapStyle', 'vim');
  const bundle = settings.exportBundle(5);
  expect(bundle.kind === EXPORT_KIND && bundle.exportedAt === 5, 'an export says what it is');
  expect(Object.keys(bundle.values).sort().join() === 'keymapStyle,theme', 'an export holds exactly what the user changed');

  const other = fresh().settings;
  const res = other.importBundle({ ...bundle, values: { ...bundle.values, bogus: 1, editorTabSize: 7, replEcho: false } });
  expect(res.ok && res.applied.sort().join() === 'keymapStyle,replEcho,theme', `valid values are applied (${res.applied})`);
  expect(res.skipped.sort().join() === 'bogus,editorTabSize', 'unknown ids and invalid values are skipped and named');
  expect(other.get('keymapStyle') === 'vim' && other.get('editorTabSize') === 2, 'and the skipped ones change nothing');
  expect(!other.importBundle({ prefs: {} }).ok, 'a file that is not a BelJar settings export is refused');
}

// ── 5. who changed it ────────────────────────────────────────────────────────
{
  const storage = fakeStorage();
  const events = fakeEvents();
  const { settings } = fresh(storage, events);
  const seen = [];
  settings.subscribe((e) => seen.push(`${e.origin}:${e.ids.join('+')}`));
  settings.set('theme', 'light');
  settings.set('theme', 'light');
  expect(seen.join() === 'local:theme', 'a change is announced once; setting the same value again is silent');

  // Another tab rewrites the record directly.
  const other = createSettings(createStore({ storage, events: fakeEvents(), now: () => 2 }));
  other.set('editorFontSize', 'xl');
  events.fire({ storageArea: storage, key: SETTINGS_KEY });
  expect(settings.get('editorFontSize') === 'xl', "another tab's change reaches memory without a reload");
  expect(seen[1] === 'tab:editorFontSize', `and names exactly what moved (${seen[1]})`);
  const r0 = settings.revision('editorFontSize');
  other.set('editorFontSize', 'sm');
  events.fire({ storageArea: storage, key: SETTINGS_KEY });
  expect(settings.revision('editorFontSize') === r0 + 1, "another tab's change bumps the revision a cache keys on");
  const t0 = settings.revision('theme');
  settings.set('theme', 'dark');
  settings.set('theme', 'dark');
  expect(settings.revision('theme') === t0 + 1, 'a local change bumps it once; a no-op does not');
  settings.resetAll();
  expect(settings.revision('editorFontSize') === r0 + 2, 'a reset bumps what it changed');
}

// ── 6. a full disk refuses honestly ──────────────────────────────────────────
{
  const storage = fakeStorage(60);
  const store = createStore({ storage, events: fakeEvents(), now: () => 1 });
  const settings = createSettings(store);
  const ok = settings.set('keybindings', { a: 'x'.repeat(200) });
  expect(!ok, 'a setting that cannot be stored reports failure');
  expect(sameValue(settings.get('keybindings'), {}), 'and memory does not pretend it was saved');
}

// ── 7. first paint ───────────────────────────────────────────────────────────
{
  const storage = fakeStorage();
  const { settings } = fresh(storage);
  settings.set('theme', 'light');
  settings.set('uiFontSize', 'xl');
  const boot = readBootSettings(storage, SCHEMA);
  expect(boot.theme === 'light' && boot.uiFontSize === 'xl', 'early boot reads the stored settings');
  expect(readBootSettings(storage, SCHEMA + 1).theme === 'dark', 'a different schema paints defaults: the store is about to wipe it');
  storage.setItem(SETTINGS_KEY, '{broken');
  expect(readBootSettings(storage, SCHEMA).theme === 'dark', 'a corrupt record paints defaults instead of throwing');
  expect(resolveValues({ theme: 'purple', extra: 1 }).theme === 'dark', 'an impossible stored value resolves to the default');

  const cls = new Set();
  const vars = {};
  const docEl = {
    classList: { toggle(c, on) { if (on) cls.add(c); else cls.delete(c); } },
    style: { setProperty(k, v) { vars[k] = v; } },
  };
  applyDocumentSettings(docEl, { ...resolveValues({}), theme: 'light', uiFontSize: 'lg', motionPref: 'reduce', editorHoleEmphasis: 'loud' });
  expect(cls.has('light') && cls.has('jar-motion-reduce') && cls.has('jar-hole-loud'), 'the page gets the classes');
  expect(vars['--ui-font-scale'] === String(UI_FONT_SCALES.lg), 'and the variables');
  applyDocumentSettings(docEl, resolveValues({}));
  expect(!cls.has('light') && !cls.has('jar-motion-reduce') && !cls.has('jar-hole-loud'), 'and applying defaults takes them away again');
}

console.log(`OK settings (${n} checks: ${SETTINGS.length} settings in ${SECTIONS.length} sections; table, get/set, reset, export, tabs, quota, boot)`);
