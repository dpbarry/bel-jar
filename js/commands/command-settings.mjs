/**
 * Editor preferences as commands.
 *
 * Every preference the editor reads is also something a user may want to flip
 * from the palette, bind a chord to, or set from the command line. Writing that
 * out by hand three times is how the three drift apart, so this table is the one
 * declaration, and the `set.*` catalogue entries, their behaviour, `:set`'s
 * completion list and Vim's `:set` are all generated from it.
 *
 * `read`/`write` are Persist method NAMES, not functions: this module is data,
 * loaded long before Persist exists. `tests/test-command-settings.mjs` checks
 * every name against the real Persist surface, which is the only thing standing
 * between a typo here and a silently dead setting.
 *
 * `kind: 'bool'` flips. `kind: 'enum'` cycles `values`; when an enum also has a
 * vi-style on/off flavour (`:set list` / `:set nolist`) it names `on` and `off`.
 * `aliases` are the names `:set` answers to — vi's own spellings where vi has one.
 */

export const SETTINGS = [
  // ── layout ────────────────────────────────────────────────────────────────
  { slug: 'word-wrap', title: 'Word wrap', kind: 'bool', aliases: ['wrap'],
    read: 'readStoredEditorWordWrap', write: 'writeStoredEditorWordWrap' },
  { slug: 'line-numbers', title: 'Line numbers', kind: 'bool', aliases: ['number', 'nu'],
    read: 'readStoredEditorLineNumbers', write: 'writeStoredEditorLineNumbers' },
  { slug: 'line-number-style', title: 'Line number style', kind: 'enum',
    values: ['absolute', 'relative', 'hybrid'],
    labels: { absolute: 'Absolute', relative: 'Relative', hybrid: 'Relative + current' },
    aliases: ['relativenumber', 'rnu'],
    read: 'readStoredEditorLineNumberMode', write: 'writeStoredEditorLineNumberMode' },
  { slug: 'fold-gutter', title: 'Code folding', kind: 'bool', aliases: ['foldenable', 'fen'],
    read: 'readStoredEditorFoldGutter', write: 'writeStoredEditorFoldGutter' },
  { slug: 'active-line', title: 'Active line highlight', kind: 'bool', aliases: ['cursorline', 'cul'],
    read: 'readStoredEditorActiveLine', write: 'writeStoredEditorActiveLine' },
  { slug: 'scroll-past-end', title: 'Scroll past end', kind: 'bool', aliases: ['scrollpastend', 'spe'],
    read: 'readStoredEditorScrollPastEnd', write: 'writeStoredEditorScrollPastEnd' },
  { slug: 'rulers', title: 'Print-width ruler', kind: 'bool', aliases: ['colorcolumn', 'cc'],
    read: 'readStoredEditorRulers', write: 'writeStoredEditorRulers' },
  { slug: 'sticky-decl', title: 'Structure path', kind: 'bool', aliases: ['sticky'],
    read: 'readStoredStickyDeclHeader', write: 'writeStoredStickyDeclHeader' },
  { slug: 'tab-size', title: 'Tab size', kind: 'enum', values: [2, 4], aliases: ['tabstop', 'ts'],
    labels: { 2: '2 spaces', 4: '4 spaces' },
    read: 'readStoredEditorTabSize', write: 'writeStoredEditorTabSize' },
  { slug: 'format-width', title: 'Format print width', kind: 'enum', values: [80, 100, 120],
    aliases: ['textwidth', 'tw'],
    labels: { 80: '80 columns', 100: '100 columns', 120: '120 columns' },
    read: 'readStoredEditorFormatWidth', write: 'writeStoredEditorFormatWidth' },
  { slug: 'whitespace', title: 'Show whitespace', verb: 'whitespace marks', kind: 'enum',
    values: ['none', 'trailing', 'selection', 'all'], on: 'all', off: 'none', aliases: ['list'],
    labels: { none: 'Off', trailing: 'Trailing only', selection: 'In selection', all: 'All' },
    read: 'readStoredEditorWhitespace', write: 'writeStoredEditorWhitespace' },

  // ── type ──────────────────────────────────────────────────────────────────
  { slug: 'font-size', title: 'Font size', kind: 'enum', values: ['sm', 'md', 'lg', 'xl'],
    labels: { sm: 'Small', md: 'Default', lg: 'Large', xl: 'Larger' },
    read: 'readStoredEditorFontSize', write: 'writeStoredEditorFontSize' },
  { slug: 'line-height', title: 'Line height', kind: 'enum',
    values: ['compact', 'normal', 'relaxed'],
    labels: { compact: 'Compact', normal: 'Default', relaxed: 'Relaxed' },
    read: 'readStoredEditorLineHeight', write: 'writeStoredEditorLineHeight' },
  { slug: 'font-family', title: 'Editor font', kind: 'enum', values: ['jetbrains', 'system'],
    labels: { jetbrains: 'JetBrains Mono', system: 'System monospace' },
    read: 'readStoredEditorFontFamily', write: 'writeStoredEditorFontFamily' },
  { slug: 'cursor-blink', title: 'Cursor blink', kind: 'enum', values: ['off', 'blink', 'fast'],
    labels: { off: 'Solid', blink: 'Blink', fast: 'Fast' },
    read: 'readStoredEditorCursorBlink', write: 'writeStoredEditorCursorBlink' },

  // ── highlighting ──────────────────────────────────────────────────────────
  { slug: 'syntax-highlight', title: 'Syntax highlighting', kind: 'bool', aliases: ['syntax'],
    read: 'readStoredEditorSyntaxHighlight', write: 'writeStoredEditorSyntaxHighlight' },
  { slug: 'semantic-highlight', title: 'Semantic highlighting', kind: 'bool',
    read: 'readStoredEditorSemanticHighlight', write: 'writeStoredEditorSemanticHighlight' },
  { slug: 'parse-highlight', title: 'Invalid parse styling', kind: 'bool',
    read: 'readStoredEditorParseHighlight', write: 'writeStoredEditorParseHighlight' },
  { slug: 'occurrence-highlight', title: 'Occurrence highlight', kind: 'bool',
    read: 'readStoredEditorOccurrenceHighlight', write: 'writeStoredEditorOccurrenceHighlight' },
  { slug: 'selection-matches', title: 'Selection matches', kind: 'bool',
    aliases: ['hlsearch', 'hls'],
    read: 'readStoredEditorSelectionMatches', write: 'writeStoredEditorSelectionMatches' },
  { slug: 'bracket-match', title: 'Bracket matching', kind: 'bool', aliases: ['showmatch', 'sm'],
    read: 'readStoredEditorBracketMatch', write: 'writeStoredEditorBracketMatch' },

  // ── editing behaviour ─────────────────────────────────────────────────────
  { slug: 'auto-close-brackets', title: 'Auto-close brackets', kind: 'bool', aliases: ['autoclose'],
    read: 'readStoredEditorAutoCloseBrackets', write: 'writeStoredEditorAutoCloseBrackets' },
  { slug: 'reindent-paste', title: 'Re-indent on paste', kind: 'bool',
    read: 'readStoredEditorReindentPaste', write: 'writeStoredEditorReindentPaste' },
  { slug: 'format-on-save', title: 'Format on save', kind: 'bool',
    read: 'readStoredFormatOnSave', write: 'writeStoredFormatOnSave' },
  { slug: 'trim-whitespace', title: 'Trim trailing whitespace on save', kind: 'bool',
    read: 'readStoredTrimTrailingWs', write: 'writeStoredTrimTrailingWs' },

  // ── proof surface ─────────────────────────────────────────────────────────
  { slug: 'hole-gutter', title: 'Hole gutter marks', kind: 'bool',
    read: 'readStoredEditorHoleGutter', write: 'writeStoredEditorHoleGutter' },
  { slug: 'hole-emphasis', title: 'Hole gutter emphasis', kind: 'enum',
    values: ['subtle', 'normal', 'loud'],
    labels: { subtle: 'Subtle', normal: 'Default', loud: 'Loud' },
    read: 'readStoredEditorHoleEmphasis', write: 'writeStoredEditorHoleEmphasis' },
  { slug: 'quiet-typing', title: 'Quiet while typing', kind: 'bool', aliases: ['quiet'],
    read: 'readStoredQuietWhileTyping', write: 'writeStoredQuietWhileTyping' },
  { slug: 'hover-sticky', title: 'Sticky hover', kind: 'bool',
    read: 'readStoredHoverSticky', write: 'writeStoredHoverSticky' },
];

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
  }));
}

/** Every name `:set` answers to, in table order. */
export function optionNames() {
  const out = [];
  for (const s of SETTINGS) {
    out.push(s.slug);
    for (const a of s.aliases || []) out.push(a);
  }
  return out;
}

/** Completion rows for the argument slot of `:set`. */
export function optionCandidates() {
  const out = [];
  for (const s of SETTINGS) {
    out.push({ value: s.slug, label: s.title });
    for (const a of s.aliases || []) out.push({ value: a, label: s.title });
  }
  return out;
}

/** Look up by slug, by `set.` id, or by any alias. */
export function findSetting(name) {
  const key = String(name == null ? '' : name).toLowerCase();
  if (!key) return null;
  const bare = key.startsWith('set.') ? key.slice(4) : key;
  return SETTINGS.find((s) => s.slug === bare)
    || SETTINGS.find((s) => (s.aliases || []).indexOf(bare) >= 0)
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
  let name = (eq >= 0 ? text.slice(0, eq) : text).trim().toLowerCase();

  let toggle = false;
  if (name.endsWith('!')) { name = name.slice(0, -1); toggle = true; }
  let negated = false;
  if (!findSetting(name) && name.startsWith('no') && findSetting(name.slice(2))) {
    name = name.slice(2);
    negated = true;
  }

  const spec = findSetting(name);
  if (!spec) return { error: 'unknown', name, near: nearestSetting(name) };
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
 * Write one preference through `persist`. `requested === undefined` toggles a
 * boolean and cycles an enum, which is what a chord on `set.word-wrap` means.
 *
 * `persist` is a parameter rather than a global so this is testable without a
 * browser — the accessor names are the only thing that has to be right, and
 * `tests/test-command-settings.mjs` checks all of them against the real Persist.
 */
export function applyValue(persist, spec, requested) {
  if (!persist || !spec) return { ok: false, message: 'Settings are not ready yet.' };
  if (typeof persist[spec.read] !== 'function' || typeof persist[spec.write] !== 'function') {
    return { ok: false, message: `${spec.title} cannot be changed here.` };
  }
  const value = nextValue(spec, persist[spec.read](), requested);
  if (value === null) return { ok: false, message: `${spec.title}: no such value.` };
  persist[spec.write](value);
  return { ok: true, applied: true, spec, value, message: describeChange(spec, value) };
}

/**
 * A whole `:set` line, parse through write. Returns what to say either way: an
 * option that does not exist should answer, not fail silently.
 */
export function runSetOn(persist, raw) {
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
  return applyValue(persist, res.spec, res.requested);
}
