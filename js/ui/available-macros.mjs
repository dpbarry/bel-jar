/**
 * "What can I press right now?" — on one screen.
 *
 * Deliberately NOT a listing of all 149 commands. The Keybindings sheet already
 * does that, interactively, and the palette is where you find a command by name.
 * What neither gives you is the short answer: the keys and the `:` names that
 * exist, side by side, at a glance. So a row earns its place by being something
 * you can actually type — everything else would be a column of em-dashes.
 *
 * Three sources, one rule. BelJar's own chords come from `Commands.describe()`,
 * the one chord formatter. The `:` names come from the same descriptors. And the
 * ACTIVE STYLE's maps — Vim's `gd` and leader map, Emacs' `C-x`/`C-c` chains —
 * come from `BelEditor.styleMacros()`, which reads the tables that install them.
 * None of the three can drift from the live keymap.
 */
const global = globalThis;

/** The mark tying a substituted key to the block that explains it. */
export const RESERVED_MARK = '*';

const INFO_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true">'
  + '<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.25"/>'
  + '<path fill="currentColor" d="M8 7.1a.75.75 0 0 1 .75.75v3.3a.75.75 0 1 1-1.5 0v-3.3A.75.75 0'
  + ' 0 1 8 7.1Zm0-2.35a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Z"/></svg>';

/**
 * What this window is, in its own title bar.
 *
 * ⛔ It replaced a footer row reading "Everything else is in the command
 * palette." — a sentence ABOUT the window, taking a row inside the window, on
 * every open forever. A window explains itself in its chrome; its body is for
 * its content.
 */
function aboutFragment() {
  const frag = document.createDocumentFragment();
  const p1 = el('p', 'bj-setting-info-tip',
    'Everything you can type right now: your chords, the keys the active editing '
    + 'style adds, and the names the command line answers to.');
  const p2 = el('p', 'bj-setting-info-tip',
    'Use the command palette to access unbound commands.');
  frag.append(p1, p2);
  return frag;
}

const FILTER_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
  + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

/**
 * Pure: does this row answer `query`? Title, chord and `:` names all match —
 * including the chord that actually works in the active style, since that is
 * the one on screen.
 */
export function rowMatches(row, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const hay = [row.title, liveChord(row), row.search || ''].concat(row.ex || [])
    .join(' ').toLowerCase();
  return hay.indexOf(q.replace(/^:/, '')) >= 0;
}

/**
 * Pure: the chord that invokes this row RIGHT NOW, or '' if nothing does.
 *
 * ⛔ Not the default chord — the live one. Under Emacs, Find is `C-s`; under Vim
 * an insert-only chord still works while you are typing, so it counts. A command
 * whose chord the style took, with nothing bound to replace it, has no live
 * chord at all and does not appear here.
 */
export function liveChord(row) {
  if (!row) return '';
  // ⛔ A key read from the STYLE's own keymap is live by construction — it came
  // from the table that binds it. Only a BelJar command can have its chord taken
  // away, and blanking a package row for the same reason emptied `Alt+X` (the
  // package's `M-x`) because the chord is one Emacs takes from `tools.commands`.
  if (row.live) return row.chord || '';
  if (row.styleChord) return row.styleChord;
  if (row.shadow && row.shadow.kind === 'shadowed') return '';
  return row.chord || '';
}

/**
 * Pure: the two blocks, from `describe()` results.
 *
 * ⛔ EVERY row here can be invoked RIGHT NOW — that is what "available" means. A
 * command the active style has taken, with nothing bound to replace it, is not
 * available and does not appear: listing it with a dash was a list of what you
 * cannot do, in a window whose name promises the opposite.
 *
 * Keys first, then the command line. A command with both appears in both,
 * because someone scanning for a chord and someone scanning for a `:` name are
 * asking different things.
 */
/**
 * Pure: the "taken by the browser" block, from the MEASURED chord table.
 *
 * ⛔ This used to be a separate floating window, and it was a bad one: a table
 * with three columns where five of nine rows were `—  —`, under an orange
 * headline, in a box that scrolled at nine rows. It printed a column of dashes —
 * the exact thing this window was rebuilt to remove — in a sheet nobody could
 * find. It belongs here, because "which of my chords does this browser eat, and
 * what do I press instead" is the same question as "what can I press".
 *
 * The window's grammar is kept: **the right-hand column is always what to
 * press.** So the subject of the row — the chord you would have reached for — is
 * on the LEFT, struck through, with what it means beside it. Reserved chords
 * with no substitute are not rows at all; they are one closing line, because a
 * row whose answer is a dash is not a row.
 */
export function reservedGroup(facts, glossFor, access, style) {
  if (!facts || !facts.rows || !facts.rows.length) return null;
  // ⛔ A substitute only counts in the style that BINDS it. `Ctrl+M`, `Alt+T`,
  // `Ctrl+Q` and `Ctrl+U` live on `EmacsHandler` and nowhere else — offering
  // them under Standard tells you to press a key that does nothing. The chord is
  // still taken, so it moves to the closing line with the rest.
  const usable = (r) => r.substitute && r.substitute !== '—'
    && (!r.subStyle || r.subStyle === style);
  const live = facts.rows.filter(usable);
  const dead = facts.rows.filter((r) => !usable(r));
  const rows = live.map((r) => ({
    id: 'reserved:' + r.chord,
    // What the chord would have done. Emacs' own meaning only where Emacs is the
    // style — `kill-region` means nothing under Standard — otherwise the BelJar
    // command the substitute reaches, which is how `Ctrl+Shift+P → Alt+X` says
    // "Run Command…" rather than nothing.
    title: style === 'emacs' && r.emacs && r.emacs !== '—'
      ? r.emacs
      : (typeof glossFor === 'function' ? glossFor(r.substitute) || '' : ''),
    dead: r.chord,
    chord: r.substitute,
    ex: [],
    // So the filter finds a row by the chord you were LOOKING for — the one
    // that does not work is what you would type to look it up.
    search: r.chord + ' ' + (r.emacs || ''),
  }));
  // ⛔ Two prose paragraphs became two META ROWS, in the same left-label /
  // right-value grammar every other row in this window uses. A block that ends
  // in a chatty sentence reads as an afterthought bolted on; a block whose last
  // two lines are labelled rows reads as finished.
  const meta = [];
  if (dead.length) {
    meta.push({ label: 'Also taken', chords: dead.map((r) => r.chord) });
  }
  meta.push({
    label: 'Reclaim them all',
    // ⛔ `:fullkeys` is Vim's spelling; on the `M-x` line it is `fullkeys`, and
    // under Standard with nothing bound there is no line to type it on at all.
    text: 'Full keyboard, in fullscreen',
    name: access ? access.prefix + 'fullkeys' : '',
  });
  // ⛔ The lead names no chord. `fidelity.detail` spells out which chords are
  // taken; above rows that already say so, that is the same table twice, and the
  // copy that is prose is the one that rots. One short line, or none.
  return {
    name: RESERVED_MARK + ' Taken by the browser',
    rows,
    meta,
    lead: rows.length
      ? 'The browser handles these before BelJar sees them.'
      : 'Nothing BelJar binds is taken on this platform.',
  };
}

/** Pure: `a, b and c`. */
export function listSentence(items) {
  const all = (items || []).map(String);
  if (all.length < 2) return all.join('');
  return all.slice(0, -1).join(', ') + ' and ' + all[all.length - 1];
}

/**
 * Pure: which block a key belongs in — by its SHAPE, not by whose keymap it came
 * from.
 *
 * ⛔ The blocks used to be "Vim keys" / "Emacs C-x" / **"BelJar keys"**, and that
 * last label was nonsense: those bindings change when you switch style, so
 * calling them BelJar's while calling the others the style's drew a line that
 * does not exist. Every key here is live in the style you are in — the only
 * useful way to sort them is by what you press.
 *
 *   `C-x`, `C-c`, `g`, `]`, `\`  a chain or a sequence, grouped by its first key
 *   `Ctrl`, `Ctrl+Shift`, `Alt`  a single chord, grouped by its modifiers
 *   `Function keys`              F1-F24
 *   `Single keys`                everything else
 */
const NAMED_KEY = /^(Up|Down|Left|Right|Home|End|PageUp|PageDown|Esc|Escape|Enter|Return|Tab|Space|Backspace|Delete|Insert|F\d{1,2})$/i;

export function keyGroupOf(keys) {
  const raw = String(keys || '').trim();
  if (!raw) return 'Single keys';
  // `C-x C-f`, `Ctrl+X h` — a chain. Its first key is the group.
  const space = raw.indexOf(' ');
  if (space > 0) return raw.slice(0, space);
  // ⛔ A NAMED key is not a sequence. `Down`, `Esc`, `PageUp` and `Home` have no
  // modifier and more than one character, exactly like `gd` — grouping them by
  // first letter produced blocks headed `D` and `E` holding one row each.
  if (NAMED_KEY.test(raw)) return 'Single keys';
  // `gd`, `]h`, a leader sequence — the first character is the group, which is
  // what a vi user calls it: the `g` map, the `]` map, the leader.
  if (raw.length > 1 && raw.indexOf('+') < 0 && raw.indexOf('-') < 0) return raw[0];
  const parts = raw.split(/[+-]/);
  const last = parts.pop();
  const mods = parts.filter(Boolean);
  if (!mods.length) return /^F\d+$/i.test(last) ? 'Function keys' : 'Single keys';
  const rank = { Ctrl: 0, Alt: 1, Shift: 2, Mod: 0, Meta: 0 };
  return mods.slice().sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9)).join('+');
}

/**
 * Pure: the order blocks appear in.
 *
 * Prefix maps first — they are the style's own vocabulary and the reason someone
 * opened this — then single chords from fewest modifiers to most, then the
 * leftovers. Anything unranked sorts alphabetically at the end rather than
 * landing wherever the data happened to put it.
 */
const GROUP_RANK = [
  // The prefix maps, in the order the styles themselves name them.
  'Ctrl+X', 'Ctrl+C', 'g', ']', '[',
  'Ctrl', 'Ctrl+Shift', 'Alt', 'Alt+Shift', 'Ctrl+Alt', 'Ctrl+Alt+Shift', 'Shift',
  'Function keys', 'Single keys',
];

export function sortGroups(names) {
  return (names || []).slice().sort((a, b) => {
    const ia = GROUP_RANK.indexOf(a);
    const ib = GROUP_RANK.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    // A leader or another unranked prefix leads: it is a map, like C-x and g.
    if (ia >= 0) return 1;
    if (ib >= 0) return -1;
    return a.localeCompare(b);
  });
}

export function macroModel(described, styleGroups, reserved, access, note) {
  const rows = (described || []).filter(Boolean);
  // ── one flat set of live keys, from every source ──────────────────────────
  //
  // ⛔ Sorted by SHAPE, not by source. A key is a key: BelJar's `Ctrl+Shift+F`,
  // Emacs' `Ctrl+K` and our substitute `Ctrl+M` all belong in the Ctrl block
  // together, because that is how you look one up. Splitting them by which table
  // they came from is a fact about our code, not about the keyboard.
  const keys = [];
  // ⛔ One row per KEY. Where two sources bind the same one, the row that names a
  // BelJar COMMAND wins: `Ctrl+S` is both the package's "search forward" and
  // BelJar's Find…, and Find… is the answer someone is looking for — it has a
  // palette entry, a `:` name and a place in the Keybindings sheet behind it.
  const at = new Map();
  const push = (row) => {
    const k = String(row.chord || '').trim();
    if (!k) return;
    const had = at.get(k);
    if (had === undefined) {
      at.set(k, keys.length);
      keys.push(row);
      return;
    }
    if (row.id && !keys[had].id) keys[had] = row;
  };
  // The style's own maps first: where two sources bind the same key, the one
  // with a BelJar command behind it wins, because its title is the real answer.
  for (const g of styleGroups || []) {
    for (const r of g.rows) {
      push({
        id: r.id,
        title: r.title,
        chord: r.keys,
        ex: [],
        live: true,
        reserved: !!r.reserved,
        shadow: r.shadow || null,
      });
    }
  }
  for (const r of rows) {
    const chord = liveChord(r);
    if (chord) push({ ...r, chord });
  }

  const byGroup = new Map();
  for (const row of keys) {
    const name = keyGroupOf(row.chord);
    if (!byGroup.has(name)) byGroup.set(name, []);
    byGroup.get(name).push(row);
  }
  const groups = sortGroups([...byGroup.keys()])
    .map((name) => ({ name, rows: byGroup.get(name) }));

  // ⛔ The command line is its own block, not a key shape — it is a different
  // way of reaching things, and only where something opens it.
  const line = access
    ? [{
      name: 'Command line',
      lead: access.open,
      prefix: access.prefix,
      rows: rows.filter((r) => (r.ex || []).length),
    }]
    : [];
  // ⛔ Taken-by-the-browser comes LAST. The window leads with what you can press;
  // what the platform ate is the footnote to that, not the headline.
  // ⛔ Where a style's own keys CANNOT be listed, say so — and say it under the
  // KEYS, not after the browser block at the very end of the window. Vim's
  // package publishes no enumerable keymap, so vi's motions and operators are
  // absent, and an unexplained absence in a window called "available macros"
  // reads as an oversight. Which is exactly what it read as.
  const live = groups.filter((g) => g.rows.length);
  if (note && live.length) live[live.length - 1].closing = note;
  const tail = reserved ? [reserved] : [];
  return live
    .concat(line.filter((g) => g.rows.length))
    .concat(tail.filter((g) => g && (g.rows.length || (g.meta || []).length)));
}

/**
 * Pure: how the command line is reached in `style`, or null if it is not.
 *
 * ⛔ "Available" has to mean available. The `:` names are only typeable where
 * something opens the line:
 *
 *   vim      `:` in Normal mode, and `Alt+X`. Names carry the colon.
 *   emacs    `M-x`. Names are typed WITHOUT a colon — `:fmt` on the M-x line
 *            resolves to nothing, so printing it was a lie.
 *   default  `Alt+X` opens the PALETTE here, not the line. Nothing types the
 *            line unless you bind a chord to Command Line — so with no chord
 *            bound, the block does not appear at all.
 *
 * `chord` is the resolved binding for `cmdline.open`, passed in so this stays
 * pure and follows a rebind.
 */
export function commandLineAccess(style, chord) {
  if (style === 'vim') return { prefix: ':', open: 'Press : in Normal mode.' };
  if (style === 'emacs') return { prefix: '', open: 'Press M-x.' };
  if (chord) return { prefix: ':', open: 'Press ' + chord + '.' };
  return null;
}

/** Pure: how many rows a block set holds. */
export function countRows(groups) {
  return (groups || []).reduce((n, g) => n + g.rows.length, 0);
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function activeStyle() {
  try {
    const P = global.Persist;
    if (P && typeof P.readStoredKeymapStyle === 'function') return P.readStoredKeymapStyle();
  } catch (_) { /* the default is the honest fallback */ }
  return 'default';
}

function describeAll() {
  const C = global.Commands;
  if (!C || typeof C.describe !== 'function') return [];
  const E = global.BelEditor;
  const style = activeStyle();
  // The editor already worked this out for the reserved-chord table; asking it
  // keeps one answer to "is this a Mac" rather than a second sniff here.
  let isMac = /Mac|iPhone|iPad/.test((global.navigator && global.navigator.platform) || '');
  if (E && typeof E.reservedChordFacts === 'function') {
    try { isMac = !!E.reservedChordFacts().isMac; } catch (_) { /* keep the sniff */ }
  }
  // ⛔ `showing: 'style'` — this window shows the chord that WORKS, so the tag
  // must be computed for THAT chord, not for BelJar's own.
  return C.list().map((c) => C.describe(c.id, { style, isMac, showing: 'style' })).filter(Boolean);
}

/**
 * One row: what it does on the left, how to reach it **in the active style** on
 * the right.
 *
 * ⛔ The chord shown is the one that WORKS. Listing BelJar's default greyed out
 * tells you what does not work, which is the least useful thing to show someone
 * who has just switched to Emacs — there, Find is `C-s`, and that is what the
 * row says. The tag carries what took the default, on hover.
 */
function rowNode(row, wantChord, prefix) {
  const r = el('div', 'bj-macros__row');
  const what = el('span', 'bj-macros__what');
  // ⛔ The DEAD chord is the subject of the row, so it sits on the left where
  // every other row puts its name — never in the keys column, which in this
  // window means "press this" and must stay 100% pressable.
  if (row.dead) {
    r.classList.add('bj-macros__row--reserved');
    what.appendChild(el('kbd', 'bj-macros__dead', row.dead));
  }
  if (row.title) what.appendChild(el('span', 'bj-macros__title', row.title));
  // ⛔ After the NAME, never after the chord. `Ctrl+M*` reads as a chord called
  // "Ctrl+M star" — the mark belongs to the row, and the only place it cannot be
  // mistaken for part of a key is beside the words.
  if (row.reserved && wantChord) what.appendChild(el('span', 'bj-macros__star', RESERVED_MARK));
  // ⛔ A tag ONLY where the chord ON THIS ROW is contested — the style has taken
  // it, or it holds only while you are typing. It used to appear on rows whose
  // chord collided with nothing, saying what the command's chord would be in a
  // keymap you are not using. That is not a caveat on anything shown.
  const shadow = wantChord && row.shadow ? row.shadow : null;
  if (shadow) {
    const tag = el('span', 'bj-macros__tag', shadow.tag);
    tag.setAttribute('data-tooltip', shadow.tip);
    // ⛔ `bindTooltips()` sweeps the document ONCE at boot; it is not delegated.
    // A tooltip added later shows a help cursor and nothing else unless bound.
    if (global.Tooltips && typeof global.Tooltips.bind === 'function') global.Tooltips.bind(tag);
    what.appendChild(tag);
  }
  r.appendChild(what);

  const keys = el('span', 'bj-macros__keys');
  if (row.dead) keys.appendChild(el('span', 'bj-macros__arrow', '→'));
  if (wantChord) {
    keys.appendChild(el('kbd', 'bj-macros__chord', liveChord(row)));
  }
  // ⛔ ONE name, not every synonym. `Save Now` was printing `w write wa wall` —
  // four spellings of one answer, in a column whose job is to tell you what to
  // type. A row needs the name you would type, and the rest are muscle-memory
  // conveniences that work whether or not a list mentions them. They stay in the
  // FILTER, so searching "write" still finds the row.
  else if (row.ex.length) {
    keys.appendChild(el('code', 'bj-macros__ex', (prefix == null ? ':' : prefix) + row.ex[0]));
  }
  r.appendChild(keys);
  return r;
}

/**
 * A labelled row closing a block: `Also taken  ⟨chips⟩`.
 *
 * Same grid as every other row, so the block ends in the shape it is made of
 * rather than in a paragraph.
 */
function metaNode(m) {
  const r = el('div', 'bj-macros__row bj-macros__row--meta');
  r.appendChild(el('span', 'bj-macros__meta-label', m.label));
  const val = el('span', 'bj-macros__keys');
  if (m.text) val.appendChild(el('span', 'bj-macros__meta-text', m.text));
  if (m.name) val.appendChild(el('code', 'bj-macros__ex', m.name));
  for (const c of m.chords || []) val.appendChild(el('kbd', 'bj-macros__dead', c));
  r.appendChild(val);
  return r;
}

function buildBody(groups) {
  const wrap = el('div', 'bj-macros');

  const filter = el('div', 'bj-macros__filter');
  const icon = el('span', 'bj-macros__filter-icon');
  icon.innerHTML = FILTER_ICON;
  icon.setAttribute('aria-hidden', 'true');
  const input = el('input', 'bj-macros__filter-input');
  input.type = 'search';
  input.placeholder = 'Filter by name or key…';
  input.setAttribute('aria-label', 'Filter the available macros');
  input.autocomplete = 'off';
  input.spellcheck = false;
  const count = el('span', 'bj-macros__filter-count');
  count.setAttribute('aria-live', 'polite');
  filter.append(icon, input, count);
  wrap.appendChild(filter);

  const list = el('div', 'bj-macros__list');
  wrap.appendChild(list);
  const empty = el('p', 'bj-macros__empty', 'No matches.');
  empty.hidden = true;
  wrap.appendChild(empty);

  const total = countRows(groups);
  const paint = (query) => {
    list.textContent = '';
    let shown = 0;
    const quiet = !query.trim();
    for (const group of groups) {
      const hits = group.rows.filter((r) => rowMatches(r, query));
      // A group whose only content is context still shows it at rest — the
      // browser may take chords and offer no substitute at all, and that is an
      // answer. While filtering it must not: context is not a match.
      if (!hits.length && !(quiet && (group.meta || []).length)) continue;
      list.appendChild(el('div', 'bj-macros__group', group.name));
      // ⛔ Context lines only at rest. A note has nothing to do with the query,
      // and printing it beside three matches reads as a fourth.
      if (quiet && group.lead) list.appendChild(el('p', 'bj-macros__aside', group.lead));
      // Every group but the command line shows a KEY; the style groups show
      // their sequence in the same <kbd> the chord groups use.
      for (const row of hits) {
        list.appendChild(rowNode(row, group.name !== 'Command line', group.prefix));
      }
      if (quiet) for (const m of group.meta || []) list.appendChild(metaNode(m));
      if (quiet && group.closing) list.appendChild(el('p', 'bj-macros__aside', group.closing));
      shown += hits.length;
    }
    empty.hidden = shown > 0;
    // A count at rest is noise; a count while filtering is the answer.
    count.textContent = query.trim() ? shown + ' of ' + total : '';
  };
  paint('');
  input.addEventListener('input', () => paint(input.value));
  return wrap;
}

/** The active style's own maps, from the editor bundle. */
function styleGroups() {
  const E = global.BelEditor;
  const C = global.Commands;
  if (!E || typeof E.styleMacros !== 'function') return [];
  const style = activeStyle();
  // The MEASURED table decides what this browser eats, so a package key whose
  // Emacs spelling is gone shows the spelling that survives.
  const facts = reservedFacts();
  const eaten = new Set((facts ? facts.rows : []).map((r) => r.chord));
  let groups = [];
  try {
    groups = E.styleMacros(style, (chord) => eaten.has(chord));
  } catch (_) {
    return [];
  }
  if (!C || typeof C.chordShadowFor !== 'function') return groups;
  return groups.map((g) => ({
    name: g.name,
    rows: g.rows.map((r) => Object.assign({}, r, {
      shadow: C.chordShadowFor({ style, keys: r.keys, commandId: r.id }),
    })),
  }));
}

/** The MEASURED reserved-chord table, from the editor bundle. */
function reservedFacts() {
  const E = global.BelEditor;
  if (!E || typeof E.reservedChordFacts !== 'function') return null;
  try {
    return E.reservedChordFacts();
  } catch (_) {
    return null;
  }
}

/** The BelJar command a chord reaches, for glossing a substitute. */
function glossFor(chord) {
  const C = global.Commands;
  const KB = global.Keybindings;
  if (!C || !KB || typeof KB.normalizeSpec !== 'function') return '';
  const spec = KB.normalizeSpec(chord);
  if (!spec) return '';
  const id = typeof KB.findConflict === 'function' ? KB.findConflict(spec, null) : null;
  const cmd = id && typeof C.get === 'function' ? C.get(id) : null;
  return cmd ? cmd.title : '';
}

/** How this style opens the command line, from the live chord table. */
function lineAccess() {
  const KB = global.Keybindings;
  const chord = KB && typeof KB.labelFor === 'function' ? KB.labelFor('cmdline.open') : '';
  return commandLineAccess(activeStyle(), chord);
}

export function openAvailableMacros() {
  const access = lineAccess();
  const E = global.BelEditor;
  let note = '';
  try {
    note = E && typeof E.packageKeyNote === 'function' ? E.packageKeyNote(activeStyle()) : '';
  } catch (_) { /* no note is better than a broken window */ }
  const groups = macroModel(
    describeAll(), styleGroups(),
    reservedGroup(reservedFacts(), glossFor, access, activeStyle()), access, note
  );
  if (!countRows(groups)) {
    if (global.StatusStrip && global.StatusStrip.setMessage) {
      global.StatusStrip.setMessage('The command list is not ready yet.');
    }
    return false;
  }
  if (!global.FloatingWindow || typeof global.FloatingWindow.open !== 'function') return false;
  global.FloatingWindow.open({
    title: 'Available macros',
    className: 'floating-window--macros',
    actions: [{
      icon: INFO_ICON,
      label: 'What this window shows',
      tooltip: aboutFragment,
    }],
    width: 470,
    // Tall enough that the taken-by-the-browser block is not permanently below
    // the fold — it is the answer to a question people arrive with.
    height: 640,
    content: buildBody(groups),
  });
  return true;
}

global.AvailableMacros = { open: openAvailableMacros };
