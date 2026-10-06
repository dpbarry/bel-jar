// Preferences as commands: the table, `:set`'s grammar, and the writes it makes.
//
// Every row names a real setting (the module throws at load if not), and the
// writes go through a REAL Settings over a memory store, so what `:set` stores
// is what the settings table says it can hold.
import {
  SETTINGS, settingId, settingEntries, optionNames, optionCandidates, optionValueCandidates,
  findSetting, nextValue, nearestSetting, parseSet, describeChange, orList,
  applyValue, runSetOn,
} from '../js/commands/command-settings.mjs';
import { createStore, createMemoryStorage } from '../js/persist/store.mjs';
import { createSettings } from '../js/persist/settings.mjs';
import { settingRow } from '../js/persist/settings-schema.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// A server answers (the last section takes it away): the whole table is offered.
globalThis.Account = { available: () => true };

// ── the table is well formed ─────────────────────────────────────────────────
for (const s of SETTINGS) {
  expect(/^[a-z][a-z0-9-]*$/.test(s.slug), `slug shape: ${s.slug}`);
  expect(typeof s.title === 'string' && s.title.length > 0, `${s.slug} has a title`);
  expect(s.kind === 'bool' || s.kind === 'enum', `${s.slug} is bool or enum`);
  expect(typeof s.setting === 'string' && settingRow(s.setting), `${s.slug} names a real setting`);
  if (s.kind === 'enum') expect(s.values === settingRow(s.setting).values, `${s.slug} cycles the table's own values`);
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
// ⛔ The completer must offer at least every name `:set` answers to — and now
// the `no` forms as well, because `parseSet` accepts `:set nonu` and a
// completer that does not offer it disagrees with the parser about the one
// spelling that turns an option OFF.
{
  const cands = optionCandidates().map((c) => c.value);
  const names = optionNames();
  for (const n of names) expect(cands.indexOf(n) >= 0, `\`:set ${n}\` completes`);
  expect(new Set(cands).size === cands.length,
    'no candidate is offered twice — a duplicate shows as two identical rows');
  const negatable = SETTINGS.filter((x) => x.kind === 'bool' || x.off !== undefined);
  expect(negatable.length > 0, 'some settings can be turned off');
  for (const x of negatable) {
    expect(cands.indexOf('no' + x.slug) >= 0, `\`:set no${x.slug}\` completes`);
    expect(parseSet('no' + x.slug).spec === x, `and \`:set no${x.slug}\` parses to ${x.slug}`);
  }
  // The other direction: nothing that cannot be negated gets a `no` form.
  for (const x of SETTINGS) {
    if (x.kind === 'bool' || x.off !== undefined) continue;
    expect(cands.indexOf('no' + x.slug) < 0,
      `${x.slug} has no off value, so \`:set no${x.slug}\` must not be offered`);
  }
}

// `:set <enum>=` completes over that setting's own values; a boolean has none.
{
  for (const x of SETTINGS) {
    const vals = optionValueCandidates(x.slug).map((v) => v.value);
    if (x.kind === 'enum') {
      expect(vals.join(',') === (x.values || []).map(String).join(','),
        `\`:set ${x.slug}=\` offers exactly its values`, vals.join(','));
    } else {
      expect(vals.length === 0, `\`:set ${x.slug}=\` offers nothing — it is a boolean`);
    }
  }
  expect(optionValueCandidates('ts').map((v) => v.value).join(',') === '2,4',
    'and it resolves an alias, not only a slug');
}

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
// A real Settings. `_state[slug]` reads the live value; `_writes` counts changes.
function fakePersist(initial) {
  const S = createSettings(createStore({ storage: createMemoryStorage() }));
  const idOf = Object.fromEntries(SETTINGS.map((s) => [s.slug, s.setting]));
  for (const [slug, v] of Object.entries(initial)) S.set(idOf[slug], v);
  S._writes = [];
  S.subscribe((e) => S._writes.push(e.ids));
  S._state = new Proxy({}, { get: (_, slug) => S.get(idOf[slug]) });
  return S;
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
expect(applyValue({}, wrap, undefined).ok === false, 'something that is not Settings is refused');
expect(applyValue(null, wrap, undefined).ok === false, 'no Settings, no write');

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

// ── ⛔ the account's preferences exist only where a server answers ──────────
// They live in Settings > Account, a panel that is not there without a server.
// By name they must not be there either: not found, not completed, not set.
{
  const server = SETTINGS.filter((s) => s.needs === 'server');
  expect(server.length === 6 && server.every((s) => s.pages === 'both'),
    'the six sync preferences are commands, on both pages: ' + server.map((s) => s.slug).join(', '));
  expect(findSetting('start-page') && findSetting('start-page').pages === 'both' && !findSetting('start-page').needs,
    'the start page is a preference of both pages, and needs no server');
  expect(SETTINGS.filter((s) => !s.pages).every((s) => /^editor|^formatOnSave$|^trimTrailingWs$|^stickyDeclHeader$|^quietWhileTyping$|^hoverSticky$/.test(s.setting)),
    'every other preference is about the open file, and stays the editor’s: '
      + SETTINGS.filter((s) => !s.pages).map((s) => s.setting).filter((id) => !/^editor/.test(id)).join(', '));
  expect(settingEntries().every((e) => e.pages === 'editor' || e.pages === 'both'), 'every generated command says where it runs');

  const S = fakePersist({});
  expect(runSetOn(S, 'sync-reconnect=ask').ok && S.get('syncReconnect') === 'ask', 'with a server, :set reaches a sync preference');
  expect(describeChange(findSetting('sync-reconnect'), 'ask') === 'Back online: Ask me first', 'and says it in the panel’s own words');

  globalThis.Account = { available: () => false };
  for (const s of server) {
    expect(findSetting(s.slug) === null, `without a server, ${s.slug} is not found`);
    expect(optionNames().indexOf(s.slug) < 0 && !optionCandidates().some((c) => c.value === s.slug || c.value === 'no' + s.slug),
      `nor completed (${s.slug})`);
  }
  const refused = runSetOn(S, 'sync-reconnect=upload');
  expect(!refused.ok && /Unknown option/.test(refused.message) && S.get('syncReconnect') === 'ask',
    'and :set says it does not know it, and writes nothing');
  expect(findSetting('start-page') && findSetting('wrap'), 'the rest of the table is untouched');
  delete globalThis.Account;
  expect(findSetting('sync-reconnect') === null, 'no account object at all reads as no server');
  globalThis.Account = { available: () => true };
}

console.log(`OK command settings (${SETTINGS.length} preferences, ${optionNames().length} :set names, every one a real setting)`);
