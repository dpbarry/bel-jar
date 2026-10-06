/**
 * Editor preferences as commands.
 *
 * Every preference the editor reads is also something a user may want to flip
 * from the palette, bind a chord to, or set from the command line. Writing that
 * out by hand three times is how the three drift apart, so this table is the one
 * declaration, and the `set.*` catalogue entries, their behaviour, `:set`'s
 * completion list and Vim's `:set` are all generated from it.
 *
 * A row names the setting it drives (`setting`, an id in settings-schema.mjs)
 * and adds only the command surface's own words: slug, title, labels and the
 * vi names. Whether it flips or cycles, and the values it cycles through in
 * order, come from the settings table, never from here: a value list written
 * here too was a second copy of the schema, and the two had drifted apart.
 * An id the table does not declare throws at load.
 *
 * `pages: 'both'` is a preference home offers too (it is not about an open
 * file), and `needs: 'server'` one that exists only where a server answers:
 * the account's. Without a server it is not attached, not completed and not
 * found by `:set`, as its panel is not in the Settings dialog.
 *
 * A boolean flips. A choice cycles its values; when a choice also has a
 * vi-style on/off flavour (`:set list` / `:set nolist`) it names `on` and `off`.
 * `aliases` are the names `:set` answers to — vi's own spellings where vi has one.
 */
import { settingRow, typeOf } from '../persist/settings-schema.mjs';

const ROWS = [
  // ── layout ────────────────────────────────────────────────────────────────
  { slug: 'word-wrap', title: 'Word wrap', aliases: ['wrap'],
    setting: 'editorWordWrap' },
  { slug: 'line-numbers', title: 'Line numbers', aliases: ['number', 'nu'],
    setting: 'editorLineNumbers' },
  { slug: 'line-number-style', title: 'Line number style',
    labels: { absolute: 'Absolute', relative: 'Relative', hybrid: 'Relative + current' },
    aliases: ['relativenumber', 'rnu'],
    setting: 'editorLineNumberMode' },
  { slug: 'fold-gutter', title: 'Code folding', aliases: ['foldenable', 'fen'],
    setting: 'editorFoldGutter' },
  { slug: 'active-line', title: 'Active line highlight', aliases: ['cursorline', 'cul'],
    setting: 'editorActiveLine' },
  { slug: 'scroll-past-end', title: 'Scroll past end', aliases: ['scrollpastend', 'spe'],
    setting: 'editorScrollPastEnd' },
  { slug: 'rulers', title: 'Print-width ruler', aliases: ['colorcolumn', 'cc'],
    setting: 'editorRulers' },
  { slug: 'sticky-decl', title: 'Structure path', aliases: ['sticky'],
    setting: 'stickyDeclHeader' },
  { slug: 'tab-size', title: 'Tab size', aliases: ['tabstop', 'ts'],
    labels: { 2: '2 spaces', 4: '4 spaces' },
    setting: 'editorTabSize' },
  { slug: 'format-width', title: 'Format print width',
    aliases: ['textwidth', 'tw'],
    labels: { 80: '80 columns', 100: '100 columns', 120: '120 columns' },
    setting: 'editorFormatWidth' },
  { slug: 'whitespace', title: 'Show whitespace', verb: 'whitespace marks',
    on: 'all', off: 'none', aliases: ['list'],
    labels: { none: 'Off', trailing: 'Trailing only', selection: 'In selection', all: 'All' },
    setting: 'editorWhitespace' },

  // ── type ──────────────────────────────────────────────────────────────────
  { slug: 'font-size', title: 'Font size',
    labels: { sm: 'Small', md: 'Default', lg: 'Large', xl: 'Larger' },
    setting: 'editorFontSize' },
  { slug: 'line-height', title: 'Line height',
    labels: { compact: 'Compact', normal: 'Default', relaxed: 'Relaxed' },
    setting: 'editorLineHeight' },
  { slug: 'font-family', title: 'Editor font',
    labels: { jetbrains: 'JetBrains Mono', system: 'System monospace' },
    setting: 'editorFontFamily' },
  { slug: 'cursor-blink', title: 'Cursor blink',
    labels: { off: 'Solid', blink: 'Blink', fast: 'Fast' },
    setting: 'editorCursorBlink' },

  // ── highlighting ──────────────────────────────────────────────────────────
  { slug: 'syntax-highlight', title: 'Syntax highlighting', aliases: ['syntax'],
    setting: 'editorSyntaxHighlight' },
  { slug: 'semantic-highlight', title: 'Semantic highlighting',
    setting: 'editorSemanticHighlight' },
  { slug: 'parse-highlight', title: 'Invalid parse styling',
    setting: 'editorParseHighlight' },
  { slug: 'occurrence-highlight', title: 'Occurrence highlight',
    setting: 'editorOccurrenceHighlight' },
  { slug: 'selection-matches', title: 'Selection matches',
    aliases: ['hlsearch', 'hls'],
    setting: 'editorSelectionMatches' },
  { slug: 'bracket-match', title: 'Bracket matching', aliases: ['showmatch', 'sm'],
    setting: 'editorBracketMatch' },

  // ── editing behaviour ─────────────────────────────────────────────────────
  { slug: 'auto-close-brackets', title: 'Auto-close brackets', aliases: ['autoclose'],
    setting: 'editorAutoCloseBrackets' },
  { slug: 'reindent-paste', title: 'Re-indent on paste',
    setting: 'editorReindentPaste' },
  { slug: 'format-on-save', title: 'Format on save',
    setting: 'formatOnSave' },
  { slug: 'trim-whitespace', title: 'Trim trailing whitespace on save',
    setting: 'trimTrailingWs' },

  // ── proof surface ─────────────────────────────────────────────────────────
  { slug: 'hole-gutter', title: 'Hole gutter marks',
    setting: 'editorHoleGutter' },
  { slug: 'hole-emphasis', title: 'Hole gutter emphasis',
    labels: { subtle: 'Subtle', normal: 'Default', loud: 'Loud' },
    setting: 'editorHoleEmphasis' },
  { slug: 'quiet-typing', title: 'Quiet while typing', aliases: ['quiet'],
    setting: 'quietWhileTyping' },
  { slug: 'hover-sticky', title: 'Sticky hover',
    setting: 'hoverSticky' },

  // ── the two pages ─────────────────────────────────────────────────────────
  { slug: 'start-page', title: 'Start page', pages: 'both',
    labels: { home: 'Home', last: 'Last project' },
    setting: 'startPage' },

  // ── the account (Settings > Account; the labels are that panel's) ─────────
  { slug: 'sync-settings', title: 'Sync settings', verb: 'settings sync', pages: 'both', needs: 'server',
    setting: 'syncSettings' },
  { slug: 'sync-both-changed', title: 'Changed in two places', verb: 'files changed in two places', pages: 'both', needs: 'server',
    labels: { merge: 'Merge them', ask: 'Ask me' },
    setting: 'syncBothChanged' },
  { slug: 'sync-overlap', title: 'Where edits overlap', pages: 'both', needs: 'server',
    labels: { ask: 'Ask me', mine: 'Keep mine', cloud: 'Keep the cloud’s' },
    setting: 'syncOverlap' },
  { slug: 'sync-reconnect', title: 'Back online', verb: 'edits made offline', pages: 'both', needs: 'server',
    labels: { upload: 'Upload them', ask: 'Ask me first' },
    setting: 'syncReconnect' },
  { slug: 'sync-notices', title: 'Say when you go offline', verb: 'offline notices', pages: 'both', needs: 'server',
    setting: 'syncNotices' },
  { slug: 'sign-out-keep', title: 'Projects in this browser', verb: 'projects kept on sign-out', pages: 'both', needs: 'server',
    labels: { remove: 'Remove them', keep: 'Keep them' },
    setting: 'signOutKeep' },
];

/** A server answers here: the account, and the preferences that belong to it, exist. */
export function serverAnswers() {
  const A = globalThis.Account;
  return !!(A && typeof A.available === 'function' && A.available());
}

/** A preference this page can be asked for by name right now. */
function offered(s) {
  return s.needs !== 'server' || serverAnswers();
}

/** The rows, with what they flip or cycle taken from the settings table. */
export const SETTINGS = ROWS.map((r) => {
  const row = settingRow(r.setting);
  if (!row) throw new Error(`command-settings: "${r.slug}" names no setting "${r.setting}"`);
  return typeOf(row) === 'bool' ? { ...r, kind: 'bool' } : { ...r, kind: 'enum', values: row.values };
});

/** Only the first letter: `Auto-close brackets` must not become `auto-close`. */
function lowerFirst(text) {
  const t = String(text || '');
  return t.charAt(0).toLowerCase() + t.slice(1);
}

export function settingId(slug) {
  return 'set.' + slug;
}

/**
 * Catalogue rows, so a preference cannot exist without being reachable.
 *
 * `title` is the verb, because a palette full of nouns you cannot press is a
 * list rather than a command surface. `spec.title` stays the plain name, which
 * is what the bar echoes back ("Word wrap on").
 *
 * No `ex` names: `:nu` and `:list` mean something else entirely in vi, so a
 * setting is reached from the line as `:set nu`, through the one `settings.set`
 * command, rather than as a bare verb.
 */
export function settingEntries() {
  return SETTINGS.map((s) => ({
    id: settingId(s.slug),
    title: (s.kind === 'bool' ? 'Toggle ' : 'Cycle ') + lowerFirst(s.verb || s.title),
    section: 'Settings',
    scope: 'global',
    keybindable: true,
    palette: true,
    pages: s.pages || 'editor',
  }));
}

/** Every name `:set` answers to, in table order. */
export function optionNames() {
  const out = [];
  for (const s of SETTINGS.filter(offered)) {
    out.push(s.slug);
    for (const a of s.aliases || []) out.push(a);
  }
  return out;
}

/** Completion rows for the argument slot of `:set`. */
export function optionCandidates() {
  const out = [];
  for (const s of SETTINGS.filter(offered)) {
    out.push({ value: s.slug, label: s.title });
    for (const a of s.aliases || []) out.push({ value: a, label: s.title });
  }
  // ⛔ The `no` forms too. `parseSet` accepts `:set nonu` — it strips `no` when
  // BelJar owns the remainder — so a completer that only knows `nu` disagrees
  // with the parser about the one spelling that turns an option OFF, and
  // offered nothing for the half of vi's `:set` grammar people use most.
  // Only where turning it off means something: an enum with no `off` value has
  // nothing to negate, which is exactly what `parseSet` reports as
  // `not-boolean`.
  for (const s of SETTINGS.filter(offered)) {
    if (s.kind !== 'bool' && s.off === undefined) continue;
    out.push({ value: 'no' + s.slug, label: s.title + ' (off)' });
    for (const a of s.aliases || []) out.push({ value: 'no' + a, label: s.title + ' (off)' });
  }
  return out;
}

/**
 * The values `:set <name>=` will accept, for the completer.
 *
 * A boolean has none — `:set wrap=true` is not vi, and `parseSet` would reject
 * the value — so it returns nothing rather than inventing `true`/`false`.
 */
export function optionValueCandidates(name) {
  const spec = findSetting(String(name || '').replace(/^no/, '')) || findSetting(name);
  if (!spec || spec.kind !== 'enum') return [];
  return (spec.values || []).map((v) => ({
    value: String(v),
    label: (spec.labels && spec.labels[v]) || String(v),
  }));
}

/** Look up by slug, by `set.` id, or by any alias. */
export function findSetting(name) {
  const key = String(name == null ? '' : name).toLowerCase();
  if (!key) return null;
  const bare = key.startsWith('set.') ? key.slice(4) : key;
  const here = SETTINGS.filter(offered);
  return here.find((s) => s.slug === bare)
    || here.find((s) => (s.aliases || []).indexOf(bare) >= 0)
    || null;
}

/**
 * Pure: the value a setting takes next. `requested === undefined` means "the
 * user did not say" — booleans flip and enums cycle, so a chord or a repeated
 * `:set` walks the list instead of dead-ending on the last value.
 */
export function nextValue(spec, current, requested) {
  if (!spec) return null;
  if (spec.kind === 'bool') {
    if (requested === true || requested === false) return requested;
    if (requested == null || requested === '') return !current;
    const word = String(requested).toLowerCase();
    if (['on', 'true', 'yes', '1'].indexOf(word) >= 0) return true;
    if (['off', 'false', 'no', '0'].indexOf(word) >= 0) return false;
    return null;
  }
  const values = spec.values || [];
  if (requested === true) return spec.on === undefined ? null : spec.on;
  if (requested === false) return spec.off === undefined ? null : spec.off;
  if (requested != null && requested !== '') {
    const wanted = values.find((v) => String(v) === String(requested));
    return wanted === undefined ? null : wanted;
  }
  const at = values.findIndex((v) => String(v) === String(current));
  return values[(at + 1) % values.length];
}

/** Pure: the nearest known name for a typo, or null. Longest shared prefix wins. */
export function nearestSetting(name) {
  const lower = String(name || '').toLowerCase();
  if (!lower) return null;
  let best = null;
  let bestLen = 0;
  for (const n of optionNames()) {
    let i = 0;
    while (i < n.length && i < lower.length && n[i] === lower[i]) i += 1;
    // Longest shared prefix wins, and on a tie the longer name — so `numbr`
    // suggests `number` rather than the two-letter alias that also matches.
    if (i > bestLen || (i === bestLen && best && n.length > best.length)) {
      best = n;
      bestLen = i;
    }
  }
  return bestLen >= 2 ? best : null;
}

/**
 * Pure: a `:set` argument → what to do. Accepts vi's whole surface —
 * `nu`, `nonu`, `nu!`, `ts=4`, `whitespace=trailing` — and reports a typo with
 * the nearest name rather than silently doing nothing.
 *
 * @returns {{ spec?, requested?, error?, name?, near?, value? }}
 */
export function parseSet(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return { error: 'usage' };
  const eq = text.indexOf('=');
  const value = eq >= 0 ? text.slice(eq + 1).trim() : null;
  const typed = (eq >= 0 ? text.slice(0, eq) : text).trim();
  let name = typed.toLowerCase();

  let toggle = false;
  if (name.endsWith('!')) { name = name.slice(0, -1); toggle = true; }
  let negated = false;
  if (!findSetting(name) && name.startsWith('no') && findSetting(name.slice(2))) {
    name = name.slice(2);
    negated = true;
  }

  const spec = findSetting(name);
  // ⛔ An `unknown` carries the PARSE, not just the name. BelJar's `:set` replaces
  // Vim's outright (`defineEx('set', …)` overwrites the package's entry), so the
  // five options only Vim knows — `pcre`, `langmap`, `insertModeEscKeysTimeout`,
  // `filetype`, `textwidth` — would otherwise be answered "Unknown option" and
  // silently lost. `vim-setup.mjs` hands those back to Vim, and it must not parse
  // the line a second time to do it. `typed` keeps the original case, because
  // `insertModeEscKeysTimeout` does not survive lower-casing.
  if (!spec) {
    return { error: 'unknown', name, near: nearestSetting(name), typed, value, negated, toggle };
  }
  if (value != null && value !== '' && spec.kind === 'enum'
      && !(spec.values || []).some((v) => String(v) === String(value))) {
    return { error: 'value', name, spec, value };
  }
  if (negated && spec.kind === 'enum' && spec.off === undefined) {
    return { error: 'not-boolean', name, spec };
  }

  let requested;
  if (value != null && value !== '') requested = value;
  else if (negated) requested = false;
  else if (toggle) requested = undefined;
  // A bare `:set nu` turns it ON, as vi does; a bare enum with no on/off has
  // nothing to turn on, so it cycles.
  else if (spec.kind === 'bool' || spec.on !== undefined) requested = true;
  else requested = undefined;

  return { spec, requested };
}

/** Pure: `2, 4` becomes `2 or 4`; `a, b, c` becomes `a, b or c`. */
export function orList(values) {
  const all = (values || []).map(String);
  if (all.length < 2) return all.join('');
  return all.slice(0, -1).join(', ') + ' or ' + all[all.length - 1];
}

/**
 * Pure: what the bar says after a change.
 *
 * A boolean reads as a sentence, an enum as a label — and the enum's words are
 * the settings panel's own, so `lg` is reported as "Large" the way the dropdown
 * spells it, not as the slug it is stored under.
 */
export function describeChange(spec, value) {
  if (value === true) return spec.title + ' on';
  if (value === false) return spec.title + ' off';
  const labels = spec.labels || {};
  return spec.title + ': ' + (labels[value] != null ? labels[value] : String(value));
}

/**
 * Write one preference through `settings` (the Settings object, passed in so
 * this runs without a browser). `requested === undefined` toggles a boolean
 * and cycles a choice, which is what a chord on `set.word-wrap` means.
 */
export function applyValue(settings, spec, requested) {
  if (!settings || typeof settings.get !== 'function' || !spec) {
    return { ok: false, message: 'Settings are not ready yet.' };
  }
  const value = nextValue(spec, settings.get(spec.setting), requested);
  if (value === null) return { ok: false, message: `${spec.title}: no such value.` };
  if (!settings.set(spec.setting, value)) return { ok: false, message: `${spec.title} could not be saved.` };
  return { ok: true, applied: true, spec, value, message: describeChange(spec, value) };
}

/**
 * A whole `:set` line, parse through write. Returns what to say either way: an
 * option that does not exist should answer, not fail silently.
 */
export function runSetOn(settings, raw) {
  const res = parseSet(raw);
  if (res.error === 'usage') {
    return { ok: false, message: 'Usage: :set nu, :set nowrap, :set ts=4' };
  }
  if (res.error === 'unknown') {
    return {
      ok: false,
      message: res.near ? `Unknown option "${res.name}". Did you mean "${res.near}"?`
        : `Unknown option "${res.name}".`,
    };
  }
  if (res.error === 'value') {
    return { ok: false, message: `${res.name} takes ${orList(res.spec.values)}.` };
  }
  if (res.error === 'not-boolean') {
    return {
      ok: false,
      message: `${res.spec.title} is not on or off. Try :set ${res.name}=${res.spec.values[0]}.`,
    };
  }
  return applyValue(settings, res.spec, res.requested);
}
