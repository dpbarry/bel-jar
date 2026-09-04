/**
 * Every key the Emacs package binds, in plain words.
 *
 * ⛔ The KEYS are read from `emacsKeys` — the package's own table — and never
 * recalled. Only the WORDS are ours, and `tests/test-emacs-keys.mjs` fails if the
 * package grows, drops or renames a single spec, so a version bump cannot leave
 * this quietly out of date or quietly incomplete.
 *
 * This exists because Available macros was listing BelJar's chords and BelJar's
 * own Vim/Emacs maps and calling that "available" — while `C-p`, `C-e`, `C-k`,
 * `C-y` and forty others were live the whole time and appeared nowhere. The
 * window is the keybindings sheet filtered to what is bound; omitting the
 * biggest source of bindings in the active style made it a different, smaller
 * thing pretending to be that.
 *
 * ⚠ A `null` label means "deliberately not listed", and there are only three:
 * plain Backspace, Delete and Return. Those insert or remove one character —
 * they are the keyboard working, not a macro — and every other spec must carry
 * words.
 */
import { emacsKeys } from '@replit/codemirror-emacs';

/**
 * spec → what pressing it does. Keys are the package's spec strings verbatim.
 *
 * ⚠ Four of these are OURS, not the package's, because we re-bind them:
 * `C-s`/`C-r` open the status-strip search line, and `C-/`/`S-C-/` route undo
 * and redo through BelJar's own history. The words say what BelJar does, not
 * what the package would have done.
 */
export const EMACS_KEY_LABELS = {
  'Up|C-p': 'Previous line',
  'Down|C-n': 'Next line',
  'Left|C-b': 'Backward one character',
  'Right|C-f': 'Forward one character',
  'C-Left|M-b': 'Backward one word',
  'C-Right|M-f': 'Forward one word',
  'Home|C-a': 'Start of line',
  'End|C-e': 'End of line',
  'C-Home|S-M-,': 'Start of file',
  'C-End|S-M-.': 'End of file',
  'S-Up|S-C-p': 'Select to previous line',
  'S-Down|S-C-n': 'Select to next line',
  'S-Left|S-C-b': 'Select back one character',
  'S-Right|S-C-f': 'Select on one character',
  'S-C-Left|S-M-b': 'Select back one word',
  'S-C-Right|S-M-f': 'Select on one word',
  'S-Home|S-C-a': 'Select to start of line',
  'S-End|S-C-e': 'Select to end of line',
  'S-C-Home': 'Select to start of file',
  'S-C-End': 'Select to end of file',
  'C-l': 'Recentre the view',
  'M-s': 'Centre the selection',
  'M-g': 'Go to line',
  'C-x C-p|C-x h': 'Select the whole file',
  'PageDown|C-v|C-Down': 'Page down',
  'PageUp|M-v|C-Up': 'Page up',
  'S-C-Down': 'Select page down',
  'S-C-Up': 'Select page up',
  'C-s': 'Search forward',
  'C-r': 'Search backward',
  'M-C-s': 'Find next match',
  'M-C-r': 'Find previous match',
  'S-M-5': 'Replace',
  Backspace: null,
  'Delete|C-d': 'Delete the character ahead',
  'Return|C-m': null,
  'C-o': 'Open a line below',
  'M-d|C-Delete': 'Kill the word ahead',
  'C-Backspace|M-Backspace|M-Delete': 'Kill the word behind',
  'C-k': 'Kill to end of line',
  'M-h': 'Select the paragraph',
  'M-@|M-S-2': 'Mark the word',
  'C-y|S-Delete': 'Yank',
  'M-y': 'Yank the entry before',
  'C-g': 'Cancel',
  'C-w|C-S-w': 'Kill the region',
  'M-w': 'Copy the region',
  'C-Space': 'Set the mark',
  'C-x C-x': 'Swap point and mark',
  'C-t': 'Transpose characters',
  'M-u': 'Upper-case the word',
  'M-l': 'Lower-case the word',
  'C-x C-u': 'Upper-case the region',
  'C-x C-l': 'Lower-case the region',
  'M-/': 'Autocomplete',
  'C-u': 'Universal argument',
  'M-;': 'Toggle line comment',
  'C-/|C-x u|S-C--|C-z': 'Undo',
  'S-C-/|S-C-x u|C--|S-C-z': 'Redo',
  'C-x r': 'Select a rectangle',
  'M-x': 'Run a command',
  Esc: 'Clear the mark',
};

/**
 * Pure: ONE spelling for every key in this window — `Ctrl+Shift+P`, never
 * `S-C-p` and never `Ctrl+x C+P`.
 *
 * ⛔ Three spellings used to coexist here: BelJar's chord table wrote `Ctrl+P`,
 * our own Emacs maps wrote `C-x C-f`, and the package wrote `S-C-p`. Grouping
 * keys by shape turned that straight into nonsense — blocks headed `C`, `C+S`,
 * `D`, `E`, `M` and `Ctrl+x`, each holding whichever rows happened to be written
 * that way. A window that sorts by what you press needs one way of writing it.
 *
 * Chains keep their shape: `C-x C-f` becomes `Ctrl+X Ctrl+F`, two tokens.
 * Already-readable input passes through unchanged, so this is safe to apply to
 * every source.
 */
export function readableEmacsKey(key) {
  const raw = String(key == null ? '' : key).trim();
  if (!raw) return '';
  if (raw.indexOf(' ') >= 0) return raw.split(/\s+/).map(readableEmacsKey).join(' ');
  // Already in BelJar's spelling.
  if (raw.indexOf('-') < 0) {
    return raw.length === 1 ? raw.toUpperCase() : raw;
  }
  const parts = raw.split('-');
  const last = parts.pop();
  const mods = [];
  for (const p of parts) {
    if (p === 'C') mods.push('Ctrl');
    else if (p === 'S') mods.push('Shift');
    else if (p === 'M') mods.push('Alt');
    else mods.push(p);
  }
  // Ctrl before Alt before Shift, the order every other BelJar surface prints.
  const rank = { Ctrl: 0, Alt: 1, Shift: 2 };
  mods.sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9));
  const name = last === 'Space' ? 'Space' : (last.length === 1 ? last.toUpperCase() : last);
  return mods.concat([name]).join('+');
}

/**
 * Pure: the alternatives in a spec, in the order the package writes them.
 *
 * `C-Backspace|M-Backspace|M-Delete` is three ways to do one thing; a chain like
 * `C-x C-p` is one way, spelled with a space.
 */
export function specKeys(spec) {
  return String(spec).split('|');
}

/**
 * Pure: which alternative to SHOW, and whether the browser cost us one.
 *
 * Prefers a chord an Emacs user would reach for over an arrow key — `C-p`, not
 * `Up` — but only if this browser delivers it. Where the Emacs spelling is one
 * the browser eats, the arrow is what is shown and the row is flagged, because
 * the row must name a key that WORKS.
 *
 * Returns null when nothing in the spec survives: `C-w|C-S-w` is kill-region and
 * the browser takes both spellings. That is not a row — the substitute BelJar
 * binds in its place is, and it comes from the substitute table.
 */
export function preferredKey(spec, isReserved) {
  const alts = specKeys(spec);
  const gone = (k) => (typeof isReserved === 'function' ? isReserved(readableEmacsKey(k)) : false);
  const emacsish = alts.filter((k) => k.indexOf('-') >= 0);
  const plain = alts.filter((k) => k.indexOf('-') < 0);
  const live = emacsish.find((k) => !gone(k)) || plain.find((k) => !gone(k)) || null;
  if (!live) return null;
  // Flagged only when an Emacs spelling was actually lost — an action that never
  // had one is not a casualty.
  const lost = emacsish.length > 0 && emacsish.every(gone);
  return { key: live, reserved: lost };
}

/**
 * Every live Emacs binding as `{ keys, title, reserved }`.
 *
 * `isReserved(readableChord)` is injected so the measured browser table stays
 * the one source for what this platform eats.
 */
export function emacsKeyRows(isReserved) {
  const out = [];
  for (const spec of Object.keys(emacsKeys)) {
    const title = EMACS_KEY_LABELS[spec];
    if (!title) continue;
    const pick = preferredKey(spec, isReserved);
    if (!pick) continue;
    out.push({ keys: readableEmacsKey(pick.key), title, reserved: pick.reserved });
  }
  return out;
}

/** The package's own spec list, for the test that pins this table against it. */
export function packageSpecs() {
  return Object.keys(emacsKeys);
}
