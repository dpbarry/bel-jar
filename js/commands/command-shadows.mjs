/**
 * Which CHORDS an editing style takes from BelJar's base keymap, and what it
 * does with them.
 *
 * ⛔ This is a table of CHORDS, not of commands, and that distinction is the
 * whole point. It used to be keyed by command id and the tag it produced said
 * *"This is an Emacs macro. Without Emacs, Redo is Ctrl+Y."* — a statement about
 * a COMMAND's chord changing, hung on a row whose chord was not in collision
 * with anything. It appeared where nothing was contested and said nothing about
 * the contest where one existed.
 *
 * A tag exists for exactly one reason: **the chord on this row is claimed by
 * something other than this row.** So it is computed from the chord, it is shown
 * only when a chord is genuinely contested, and it names the other claimant.
 *
 * `spec` is BelJar's own binding in canonical `Mod+…` form — it is matched
 * against the LIVE chord table, so a chord the user has rebound stops colliding
 * on its own. `key` is how the style spells the same chord, and `runs` is what
 * the style does with it, read off the package's own key table rather than
 * remembered (see `emacsKeys` in `@replit/codemirror-emacs`).
 */

/** style → the base chords it takes. */
export const STYLE_TAKES = {
  emacs: [
    { spec: 'Mod+F', key: 'C-f', runs: 'forward-char' },
    // ⛔ Not a no-op: the package binds `C-x C-p|C-x h` to selectAll, and
    // `probe-keymap.mjs` measures it selecting the whole document. A remembered
    // claim about a dependency once told Emacs users a working chord did not
    // exist. Read the package's key table, do not recall it.
    { spec: 'Mod+A', key: 'C-a', runs: 'move-beginning-of-line' },
    { spec: 'Control+Space', key: 'C-Space', runs: 'set-mark-command' },
    { spec: 'Mod+Y', key: 'C-y', runs: 'yank' },
    { spec: 'Mod+/', key: 'C-/', runs: 'undo' },
    { spec: 'Mod+K', key: 'C-k', runs: 'kill-line' },
    // ⛔ `M-x` IS Run Command — Emacs reaches the same command through its own
    // binding. `sameCommand` stops it reading as a loss, because nothing is lost.
    { spec: 'Alt+X', key: 'M-x', runs: 'execute-extended-command', sameCommand: 'tools.commands' },
  ],
  // Vim takes no chord for itself: what it does is make BelJar's chords
  // Insert-only, which is a MODE caveat and carries its own tag.
  vim: [],
};

/**
 * Where a command's own job lives in the style, when its chord is Insert-only.
 *
 * ⛔ This is the ONE place a command-centric sentence is still right, because
 * the caveat genuinely is about the mode you are in rather than about a
 * contested chord: Ctrl+Z works, but only while you are typing.
 */
export const INSERT_ALTERNATIVE = {
  vim: {
    'edit.undo': 'u',
    'edit.redo': 'C-r',
    'edit.find': '/',
  },
};

/**
 * The chord the STYLE binds for a BelJar command — the one that works right now.
 *
 * ⛔ Only claim one BelJar actually binds. A substitute nobody can press is the
 * exact failure the reserved-chord table shipped with for weeks.
 *   C-s      the search line          (`ensureEmacsUndoBridge`)
 *   C-x h    selectAll                (the package's own key table)
 *   C-S-z    redo                     (`ensureEmacsUndoBridge`)
 *   M-x      the command line         (`showCommandLine`)
 *   C-x C-f  the palette              (`CX_MAP`; `tools.palette` and
 *                                      `nav.anywhere` are the same action)
 */
export const STYLE_CHORDS = {
  emacs: {
    'edit.find': 'C-s',
    'edit.select-all': 'C-x h',
    'edit.redo': 'C-S-z',
    'tools.commands': 'M-x',
    'nav.anywhere': 'C-x C-f',
  },
  vim: {},
};

export const STYLE_NAME = { emacs: 'Emacs', vim: 'Vim' };

/**
 * Pure: a style's spelling of a chord in BelJar's — `C-x h` → `Ctrl+X H`.
 *
 * ⛔ One spelling per surface. Available macros groups keys by SHAPE, and two
 * spellings in one list produced blocks headed `C`, `C+S` and `Ctrl+x`. A shell
 * copy of the editor's speller, because this side of the bundle seam cannot
 * import across it.
 */
export function readableStyleChord(keys) {
  const raw = String(keys == null ? '' : keys).trim();
  if (!raw) return '';
  if (raw.indexOf(' ') >= 0) return raw.split(/\s+/).map(readableStyleChord).join(' ');
  if (raw.indexOf('-') < 0) return raw.length === 1 ? raw.toUpperCase() : raw;
  const parts = raw.split('-');
  const last = parts.pop();
  const mods = parts.map((p) => ({ C: 'Ctrl', S: 'Shift', M: 'Alt' }[p] || p));
  const rank = { Ctrl: 0, Alt: 1, Shift: 2 };
  mods.sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9));
  const name = last === 'Space' ? 'Space' : (last.length === 1 ? last.toUpperCase() : last);
  return mods.concat([name]).join('+');
}

/**
 * Pure: a style's spelling of a chord as a canonical `Mod+…` spec, or ''.
 *
 * ⛔ Without this the `shadowing` case can never fire, because a style chord
 * (`C-s`, `M-x`, `Ctrl+O`) is not in the form the chord table is keyed by — so
 * "is this style chord taking a base chord from someone" was a question nothing
 * could answer.
 *
 * A CHAIN (`C-x h`) returns '' on purpose: two keys cannot collide with a single
 * chord, and pretending otherwise would tag `C-x C-f` against whatever owns
 * Ctrl+X.
 */
export function specFromStyleKey(key) {
  const raw = String(key == null ? '' : key).trim();
  if (!raw || /\s/.test(raw)) return '';
  // Two spellings reach here: the style's own (`C-s`, `M-x`) and the readable
  // one a list renders (`Ctrl+O`). Splitting on only one of them silently
  // returned '' for the other, which reads as "no collision" — the same failure
  // this whole tag exists to stop.
  const sep = raw.indexOf('-') >= 0 ? '-' : '+';
  const parts = raw.split(sep);
  const last = parts.pop();
  if (!last) return '';
  const mods = { Mod: false, Alt: false, Shift: false };
  for (const part of parts) {
    if (part === 'C' || part === 'Ctrl' || part === 'Mod') mods.Mod = true;
    else if (part === 'M' || part === 'Alt') mods.Alt = true;
    else if (part === 'S' || part === 'Shift') mods.Shift = true;
    else return '';
  }
  if (!mods.Mod && !mods.Alt && !mods.Shift) return '';
  const out = [];
  if (mods.Mod) out.push('Mod');
  if (mods.Alt) out.push('Alt');
  if (mods.Shift) out.push('Shift');
  out.push(last.length === 1 ? last.toUpperCase() : last);
  return out.join('+');
}

/**
 * Pure: what `style` does with `spec`, or null.
 *
 * `spec` is a normalized `Mod+…` chord. Matching on the spec rather than on the
 * command id is what makes this follow a rebind: move Find… off Ctrl+F and the
 * collision moves with it, to whatever now sits on Ctrl+F.
 */
export function takesChord(style, spec) {
  if (!spec) return null;
  const table = STYLE_TAKES[style] || [];
  for (const entry of table) {
    if (entry.spec === spec) return entry;
  }
  return null;
}

/**
 * Pure: the tag for a row showing `spec` for `commandId`, or null.
 *
 * Three answers, and only three:
 *
 *   shadowed   the chord on this row is taken by the style. `runs` names what
 *              the style does with it instead.
 *   shadowing  the chord on this row is the STYLE's own, and the base keymap
 *              gives that same chord to a different command. `owner` names it.
 *              Requires `fromStyle` — two BASE commands sharing a chord is a
 *              keybinding conflict, not a style contest.
 *   insert     the chord works, but only while you are typing.
 *
 * `baseOwnerOf(spec)` is injected so this stays pure — the registry passes a
 * lookup against the live chord table.
 */
export function chordShadow(opts) {
  const style = opts.style;
  if (!STYLE_NAME[style]) return null;
  const name = STYLE_NAME[style];

  if (opts.policy === 'insert-only') {
    const instead = (INSERT_ALTERNATIVE[style] || {})[opts.commandId] || '';
    return {
      kind: 'insert',
      tag: 'insert',
      instead,
      tip: instead
        ? `Only while you are typing. In Normal mode, press ${instead}.`
        : `Only while you are typing, not in ${name}'s Normal mode.`,
    };
  }

  const spec = opts.spec || '';
  const label = opts.label || spec;

  // ── the chord on this row is taken by the style ────────────────────────────
  const taken = takesChord(style, spec);
  if (taken && taken.sameCommand !== opts.commandId) {
    return {
      kind: 'shadowed',
      tag: 'shadowed',
      key: taken.key,
      runs: taken.runs,
      // ⛔ A statement about the CHORD, naming both claimants. Never "without
      // Emacs this command would be…" — that describes a world you are not in.
      tip: `${name} uses ${label} for ${taken.runs}.`,
    };
  }

  // ── the chord on this row is the style's, and base gives it to someone else ─
  //
  // ⛔ Only when the chord shown is the STYLE's own. If it is BelJar's own chord,
  // another command holding it is a keybinding CONFLICT — a different thing, with
  // its own indicator — and this branch fired on one: `tools.palette` and
  // `nav.anywhere` deliberately share Ctrl+K because they are the same action, and
  // the row read "Vim uses Ctrl+K here. In Standard, Ctrl+K is Go to File…" under
  // a style that had done nothing at all.
  if (!opts.fromStyle) return null;
  const owner = typeof opts.baseOwnerOf === 'function' ? opts.baseOwnerOf(spec) : null;
  if (owner && owner.id !== opts.commandId) {
    return {
      kind: 'shadowing',
      tag: 'shadowing',
      owner: owner.id,
      tip: `${name} uses ${label} here. In Standard, ${label} is ${owner.title}.`,
    };
  }

  return null;
}
