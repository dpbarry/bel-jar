/**
 * The keys an editing style adds on top of BelJar's own chord table — as data,
 * so a surface can LIST them.
 *
 * Vim's `gd`, `]h`, `\f` and Emacs' `C-x C-s`, `C-c h` are ordinary bindings on
 * ordinary command ids, and they are the most distinctive thing about either
 * mode. Until this existed they appeared in no listing anywhere: the Keybindings
 * sheet projects `Keybindings`, which has never heard of them; the palette lists
 * commands rather than keys; Available Macros asked `Commands.describe()`, which
 * only knows BelJar's own table. Which-key was the sole way in, and which-key
 * only answers a prefix you already knew to press.
 *
 * Pure: the maps come from the modules that install them, the leader is a
 * parameter, and titles are resolved by the caller from the registry. So a row
 * here cannot name a key that is not mapped, and cannot survive a map being
 * deleted.
 */
import { _pure as vimMaps, DEFAULT_LEADER, leaderLabel } from './vim-setup.mjs';
import { _pure as emacsMaps } from './emacs-setup.mjs';
import { emacsKeyRows, readableEmacsKey } from './emacs-keys.mjs';
import { EMACS_SUBSTITUTES } from './emacs-runtime.mjs';

/**
 * Pure: `[keys, id]` pairs for a style, leader already expanded.
 *
 * ⛔ Grouped the way the keys themselves are grouped, not by command section: a
 * Vim user looking for "the leader map" wants the leader map, and someone who
 * has just switched to Emacs wants to know what `C-c` does. The groups are the
 * mental model; the sections are the palette's.
 */
/**
 * Pure: a vim key sequence as a READER sees it.
 *
 * ⛔ `<C-o>` is vim's CONFIG syntax, not a key. Printed straight into a list
 * whose other rows read `gd` and `]h` — and whose neighbouring block reads
 * `Ctrl+K` — it is the one row nobody can act on without already knowing the
 * notation. The angle brackets belong in a `.vimrc`, not on screen.
 */
export function readableKeys(keys) {
  return String(keys).replace(/<([CSMA])-([^>]+)>/g, (_, mod, key) => {
    const name = { C: 'Ctrl', S: 'Shift', M: 'Alt', A: 'Alt' }[mod];
    return name + '+' + (key.length === 1 ? key.toUpperCase() : key);
  });
}

export function styleMacroGroups(style, leader) {
  if (style === 'vim') {
    // The READABLE spelling: vim wants `<Space>f`, a reader wants `Space f`.
    const lead = leaderLabel(leader || DEFAULT_LEADER);
    return [
      {
        name: 'Vim keys',
        rows: vimMaps.NORMAL_MAP.map(([keys, id]) => ({ keys: readableKeys(keys), id })),
      },
      {
        name: 'Vim leader',
        rows: vimMaps.LEADER_MAP.map(([keys, id]) => ({ keys: lead + keys, id })),
      },
    ];
  }
  if (style === 'emacs') {
    return [
      // ⛔ Through the same speller as everything else. These are written
      // `C-x C-f` in the map that installs them; three spellings in one window
      // turned shape-grouping into nonsense.
      { name: 'Emacs C-x', rows: emacsMaps.CX_MAP.map(([keys, id]) => ({ keys: readableEmacsKey(keys), id })) },
      { name: 'Emacs C-c', rows: emacsMaps.CC_MAP.map(([keys, id]) => ({ keys: readableEmacsKey(keys), id })) },
    ];
  }
  return [];
}

/** What each substitute BelJar binds in a reserved chord's place actually does. */
const SUBSTITUTE_TITLES = {
  'C-m': 'Next line',
  'M-t': 'Transpose characters',
  'C-q': 'Kill the region',
};

/**
 * The keys the STYLE'S OWN PACKAGE binds — read from the package, never recalled.
 *
 * ⛔ These are the bulk of what is live under Emacs and they were listed nowhere:
 * `C-p`, `C-e`, `C-k`, `C-y` and forty more. Available macros is the keybindings
 * sheet filtered to what is bound, and it was quietly omitting the single largest
 * source of bindings in the style you are in.
 *
 * ⚠ VIM HAS NO EQUIVALENT HERE, and that is a fact about the package, not a
 * choice: `@replit/codemirror-vim` exposes `map`, `unmap`, `defineAction` and
 * `findKey`, but nothing that ENUMERATES its keymap. Listing vi's own keys would
 * mean writing them from memory, which is the one thing the ⛔ read-the-table law
 * forbids. `vimPackageNote()` says so on screen rather than leaving the gap to be
 * read as an oversight.
 */
export function packageKeyRows(style, isReserved) {
  if (style !== 'emacs') return [];
  const rows = emacsKeyRows(isReserved);
  for (const [key] of EMACS_SUBSTITUTES) {
    const title = SUBSTITUTE_TITLES[key];
    if (title) rows.push({ keys: readableEmacsKey(key), title, reserved: true });
  }
  return rows;
}

/** Why a style's own keys are not listed, where they cannot be. */
export function packageKeyNote(style) {
  if (style !== 'vim') return '';
  return 'Vim’s own keys — motions, operators, counts — are not listed: the vim '
    + 'package does not publish its keymap, and writing one from memory is how a list starts '
    + 'lying. Everything BelJar adds on top of vi is above.';
}

/**
 * The same groups with the leader read from stored preferences and each row's
 * title resolved through the registry.
 *
 * A row whose command the registry does not know is DROPPED rather than shown
 * with its raw id — the same rule Available Macros follows for everything else,
 * and the reason this is worth centralising: one list, one set of names.
 */
export function styleMacros(style, isReserved) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const C = g.Commands;
  if (!C || typeof C.get !== 'function') return [];
  let leader = DEFAULT_LEADER;
  try {
    const p = g.Persist;
    if (p && typeof p.readStoredVimLeader === 'function') leader = p.readStoredVimLeader() || leader;
  } catch (_) { /* the default leader is the honest fallback */ }
  const out = [];
  for (const group of styleMacroGroups(style, leader)) {
    const rows = [];
    for (const row of group.rows) {
      const cmd = C.get(row.id);
      if (cmd && cmd.title) rows.push({ keys: row.keys, id: row.id, title: cmd.title });
    }
    if (rows.length) out.push({ name: group.name, rows });
  }
  // The package's own keys carry their own words — they are not BelJar commands
  // and have no id to resolve.
  const pkg = packageKeyRows(style, isReserved);
  if (pkg.length) out.push({ name: 'Package keys', rows: pkg });
  return out;
}
