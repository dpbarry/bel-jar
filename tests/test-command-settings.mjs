// Preferences as commands: the table, `:set`'s grammar, and the writes it makes.
//
// The load-bearing assertion is the last one: every Persist accessor named in
// the table must actually exist. Nothing else catches a typo there — a bad name
// produces a setting that is present in the palette and silently does nothing.
import {
  SETTINGS, settingId, settingEntries, optionNames, optionCandidates,
  findSetting, nextValue, nearestSetting, parseSet, describeChange, orList,
  applyValue, runSetOn,
} from '../js/commands/command-settings.mjs';
import { readFileSync } from 'node:fs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── the table is well formed ─────────────────────────────────────────────────
for (const s of SETTINGS) {
  expect(/^[a-z][a-z0-9-]*$/.test(s.slug), `slug shape: ${s.slug}`);
  expect(typeof s.title === 'string' && s.title.length > 0, `${s.slug} has a title`);
  expect(s.kind === 'bool' || s.kind === 'enum', `${s.slug} is bool or enum`);
  expect(typeof s.read === 'string' && typeof s.write === 'string', `${s.slug} names its accessors`);
  if (s.kind === 'enum') {
    expect(Array.isArray(s.values) && s.values.length > 1, `${s.slug} enumerates values`);
    if (s.on !== undefined) expect(s.values.some((v) => v === s.on), `${s.slug} on is a value`);
    if (s.off !== undefined) expect(s.values.some((v) => v === s.off), `${s.slug} off is a value`);
  } else {
    expect(s.values === undefined, `${s.slug} is boolean, so has no value list`);
  }
}
expect(new Set(SETTINGS.map((s) => s.slug)).size === SETTINGS.length, 'slugs are unique');
expect(new Set(optionNames()).size === optionNames().length, 'no name means two settings');
expect(optionCandidates().length === optionNames().length, 'every name completes');

// ── catalogue rows ───────────────────────────────────────────────────────────
const entries = settingEntries();
expect(entries.length === SETTINGS.length, 'one row per preference');
expect(entries.every((e) => e.section === 'Settings' && e.palette && e.keybindable),
  'every preference is in the palette and bindable');
// The row has to read as an action, or the palette lists nouns you cannot press.
expect(entries.every((e) => /^(Toggle|Cycle) /.test(e.title)), 'palette rows name the verb');
expect(entries.find((e) => e.id === 'set.word-wrap').title === 'Toggle word wrap', 'booleans toggle');
expect(entries.find((e) => e.id === 'set.font-size').title === 'Cycle font size', 'enums cycle');
// `Cycle show whitespace` stutters, so that one row supplies its own verb form.
expect(entries.find((e) => e.id === 'set.whitespace').title === 'Cycle whitespace marks',
  'a title that already opens with a verb supplies its own');
// The preference is named the same in the settings panel, the palette, `:set`
// and the bar. Lowercasing the whole title would break a name like `Auto-close`.
expect(entries.find((e) => e.id === 'set.auto-close-brackets').title === 'Toggle auto-close brackets',
  'only the first letter drops');
// `:nu` is vi's "print line numbers"; a preference must not steal it.
expect(entries.every((e) => e.ex === undefined), 'preferences take no bare ex name');
expect(settingId('word-wrap') === 'set.word-wrap', 'id shape');

// ── lookup ───────────────────────────────────────────────────────────────────
expect(findSetting('word-wrap').slug === 'word-wrap', 'by slug');
expect(findSetting('nu').slug === 'line-numbers', 'by vi abbreviation');
expect(findSetting('number').slug === 'line-numbers', 'by vi long name');
expect(findSetting('set.tab-size').slug === 'tab-size', 'by command id');
expect(findSetting('WRAP').slug === 'word-wrap', 'case insensitive');
expect(findSetting('nope') === null, 'unknown name');
expect(findSetting('') === null && findSetting(null) === null, 'empty name');
expect(nearestSetting('numbr') === 'number', 'the long name beats the abbreviation on a tie');
expect(nearestSetting('zzz') === null, 'nothing close enough to suggest');

// ── next value ───────────────────────────────────────────────────────────────
const wrap = findSetting('word-wrap');
const size = findSetting('font-size');
const ws = findSetting('whitespace');
expect(nextValue(wrap, false, undefined) === true, 'a boolean with no request flips');
expect(nextValue(wrap, true, undefined) === false, 'and flips back');
expect(nextValue(wrap, false, true) === true, 'an explicit request wins');
expect(nextValue(wrap, true, 'off') === false, 'off parses as false');
expect(nextValue(wrap, true, 'maybe') === null, 'a word that is not a boolean is refused');
expect(nextValue(size, 'md', undefined) === 'lg', 'an enum with no request cycles');
expect(nextValue(size, 'xl', undefined) === 'sm', 'and wraps at the end');
expect(nextValue(size, 'nonsense', undefined) === 'sm', 'an unknown current value starts over');
expect(nextValue(size, 'md', 'xl') === 'xl', 'an explicit value is taken');
expect(nextValue(size, 'md', 'huge') === null, 'an unknown value is refused');
expect(nextValue(ws, 'none', true) === 'all', 'an enum with an on/off flavour turns on');
expect(nextValue(ws, 'all', false) === 'none', 'and off');
expect(nextValue(size, 'md', true) === null, 'an enum without one cannot be turned on');
expect(nextValue(null, 'x', true) === null, 'no spec, no value');

// ── :set grammar ─────────────────────────────────────────────────────────────
expect(parseSet('').error === 'usage', 'a bare :set asks for usage');
expect(parseSet('   ').error === 'usage', 'whitespace is bare too');
expect(parseSet('nu').requested === true, ':set nu turns on');
expect(parseSet('nonu').requested === false, 'the no- prefix turns off');
expect(parseSet('nu!').requested === undefined, 'the bang toggles');
expect(parseSet('ts=4').requested === '4', 'a value is carried through');
expect(parseSet('ts = 4').spec === undefined || parseSet('ts=4').spec.slug === 'tab-size', 'ts is tab-size');
expect(parseSet('list').requested === true, ':set list turns whitespace on');
expect(parseSet('nolist').requested === false, ':set nolist turns it off');
expect(parseSet('font-size').requested === undefined, 'an enum with no on/off cycles');
expect(parseSet('numbr').error === 'unknown' && parseSet('numbr').near === 'number',
  'a typo names the nearest option');
expect(parseSet('ts=9').error === 'value', 'a value outside the list is refused');
expect(parseSet('nofont-size').error === 'not-boolean', 'you cannot turn off a plain enum');
// `nonsense` must not be read as `no` + `nsense`; the prefix only strips when
// what remains is a real option.
expect(parseSet('nonsense').error === 'unknown', 'the no- prefix needs a real option behind it');

// A boolean reads as a sentence, an enum as a label — and the enum's words are
// the settings panel's own, not the slug the value is stored under.
expect(describeChange(wrap, true) === 'Word wrap on', 'a boolean reads as a sentence');
expect(describeChange(wrap, false) === 'Word wrap off', 'both ways');
expect(describeChange(size, 'lg') === 'Font size: Large',
  'an enum reports the panel’s own word, not the slug', describeChange(size, 'lg'));
expect(describeChange(findSetting('tab-size'), 4) === 'Tab size: 4 spaces', 'numbers get their unit');
expect(describeChange(findSetting('format-width'), 100) === 'Format print width: 100 columns', 'and so do these');
// A value with no label falls back to itself rather than printing nothing.
expect(describeChange({ title: 'X' }, 'raw') === 'X: raw', 'an unlabelled value still reads');
for (const spec of SETTINGS) {
  if (spec.kind !== 'enum' || !spec.labels) continue;
  for (const v of spec.values) {
    expect(spec.labels[v] != null, `${spec.slug} labels every value it offers (${v} is bare)`);
  }
}
expect(orList([2, 4]) === '2 or 4', 'two values');
expect(orList(['a', 'b', 'c']) === 'a, b or c', 'three');
expect(orList(['solo']) === 'solo' && orList([]) === '', 'one, and none');


// ── the writes ───────────────────────────────────────────────────────────────
function fakePersist(initial) {
  const state = { ...initial };
  const p = { _state: state, _writes: [] };
  for (const s of SETTINGS) {
    p[s.read] = () => state[s.slug];
    p[s.write] = (v) => { state[s.slug] = v; p._writes.push([s.slug, v]); };
  }
  return p;
}

let P = fakePersist({ 'line-numbers': false, 'word-wrap': true, whitespace: 'none', 'tab-size': 2 });
expect(runSetOn(P, 'nowrap').message === 'Word wrap off',
  'the bar echoes the settings panel’s own words', runSetOn(P, 'nowrap').message);
expect(runSetOn(P, 'ts=4').message === 'Tab size: 4 spaces', 'and a value reads plainly');
expect(runSetOn(P, 'nu').ok && P._state['line-numbers'] === true, ':set nu writes');
expect(runSetOn(P, 'nonu').ok && P._state['line-numbers'] === false, ':set nonu writes');
expect(runSetOn(P, 'nu!').ok && P._state['line-numbers'] === true, ':set nu! flips');
expect(runSetOn(P, 'nowrap').ok && P._state['word-wrap'] === false, ':set nowrap');
expect(runSetOn(P, 'list').ok && P._state.whitespace === 'all', ':set list shows whitespace');
expect(runSetOn(P, 'nolist').ok && P._state.whitespace === 'none', ':set nolist hides it');
expect(runSetOn(P, 'ts=4').ok && P._state['tab-size'] === 4, ':set ts=4 stores a number, not "4"');
expect(P._state['tab-size'] === 4 && typeof P._state['tab-size'] === 'number', 'the stored type is the table type');

// It answers rather than failing silently.
const before = P._writes.length;
expect(runSetOn(P, 'numbr').ok === false, 'an unknown option is refused');
expect(/did you mean "number"/i.test(runSetOn(P, 'numbr').message), 'and suggests the nearest');
expect(/Usage/.test(runSetOn(P, '').message), 'a bare :set answers with usage');
expect(runSetOn(P, 'ts=9').message === 'ts takes 2 or 4.', 'a bad value says which are good',
  runSetOn(P, 'ts=9').message);
expect(runSetOn(P, 'whitespace=nope').message === 'whitespace takes none, trailing, selection or all.',
  'and lists more than two readably');
expect(P._writes.length === before, 'and none of those wrote anything');

// A chord on a `set.*` command toggles, with no request.
P = fakePersist({ 'word-wrap': false, 'font-size': 'md' });
expect(applyValue(P, wrap, undefined).value === true, 'a chord flips a boolean');
expect(applyValue(P, wrap, undefined).value === false, 'twice flips back');
expect(applyValue(P, size, undefined).value === 'lg', 'a chord cycles an enum');
expect(applyValue({}, wrap, undefined).ok === false, 'a Persist without the accessor is refused');
expect(applyValue(null, wrap, undefined).ok === false, 'no Persist, no write');

// ── ⚠ the one that catches typos ─────────────────────────────────────────────
// `editor-prefs.mjs` reads these names; `persist-settings.mjs` defines them. A
// name that exists in neither is a preference that looks live and is not.
const persistSrc = ['js/persist/persist-settings.mjs', 'js/persist/persist.mjs', 'js/persist/persist.js']
  .map((f) => { try { return readFileSync(new URL('../' + f, import.meta.url), 'utf8'); } catch (_) { return ''; } })
  .join('\n');
expect(persistSrc.length > 1000, 'the Persist sources were found');
for (const s of SETTINGS) {
  for (const name of [s.read, s.write]) {
    expect(persistSrc.includes(name), `Persist has no ${name} (for ${s.slug})`);
  }
}

// ── the line completes over the real names ───────────────────────────────────
// The bar feeds `optionCandidates()` into the argument slot of `:set`; if the
// catalogue ever stops declaring that slot, completion silently offers nothing.
const { complete } = await import('../js/status-strip/status-strip-complete.mjs');
const { CATALOG } = await import('../js/commands/command-catalog.mjs');
const setCmd = CATALOG.find((c) => c.id === 'settings.set');
expect(setCmd, 'the catalogue has settings.set');
expect((setCmd.ex || []).indexOf('set') >= 0, 'reachable as :set');
expect(setCmd.args && setCmd.args[0] && setCmd.args[0].kind === 'option',
  'its first argument is an option, or the bar completes nothing there');

const sources = {
  commands: () => [{ value: 'set', label: setCmd.title, args: setCmd.args }],
  files: () => [],
  options: () => optionCandidates(),
};
const res = complete('set n', 5, sources);
expect(res.kind === 'option', 'the caret in slot 1 asks for options');
expect(res.items.some((i) => i.value === 'nu'), ':set n offers nu');
expect(complete('set ', 4, sources).items.length > 10, 'a bare :set  lists the preferences');

console.log(`OK command settings (${SETTINGS.length} preferences, ${optionNames().length} :set names, accessors verified)`);
