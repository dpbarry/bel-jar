// Emacs bindings for BelJar: the `C-x` map people expect, and a `C-c` prefix
// for the things only BelJar has.
//
// Every binding is a COMMAND id, so nothing here can do something the palette
// and the Keybindings sheet do not also know about.
//
// ⛔ Second keys are plain letters, never control chords. `C-c C-n` would be
// unreachable on Windows/Linux — pressing it opens a browser window mid-chord —
// so the BelJar prefix is `C-c` followed by a letter. See reserved-chords.mjs.
import { EmacsHandler } from '@replit/codemirror-emacs';
import { EMACS_MACRO_KEYS } from './macro-keys.mjs';

const global = globalThis;

function say(text) {
  if (global.StatusStrip && global.StatusStrip.setMessage) global.StatusStrip.setMessage(text);
}

/**
 * `keys` is threaded so the context can carry `dropTrailing` — how many
 * keystrokes the chord was, DERIVED from the chord itself. `C-x )` is two, and
 * the macro recorder has already seen both by the time this runs.
 */
function runId(id, keys) {
  const C = global.Commands;
  if (!C || typeof C.run !== 'function') return;
  const ctx = { dropTrailing: String(keys || '').split(/\s+/).filter(Boolean).length || 1 };
  if (!C.run(id, ctx)) {
    const cmd = C.get ? C.get(id) : null;
    say(cmd ? `"${cmd.title}" is not available right now.` : `Unknown command "${id}".`);
  }
}

/** `C-x` — the standard map, limited to what BelJar can actually do. */
export const CX_MAP = [
  ['C-x C-f', 'tools.palette'],
  ['C-x b', 'tools.palette'],
  // ⛔ The chord an Emacs user presses most, and it was missing. BelJar saves on
  // its own, but a keymap that ignores `C-x C-s` reads as broken no matter what
  // the app does in the background — the answer has to be visible.
  ['C-x C-s', 'file.save'],
  ['C-x k', 'tab.close'],
  ['C-x g', 'tools.graph'],
  ['C-x p', 'nav.symbol'],
  // ⛔ `C-x z` is repeat-last-command, and BelJar had the command
  // (`cmdline.repeat`) with nothing pressing it in any style. Emacs users reach
  // for this constantly; it was silence.
  ['C-x z', 'cmdline.repeat'],
  // ⛔ Keyboard macros, on Emacs' own keys, running BelJar's one engine — the
  // same arrangement undo has. `C-x (` and `C-x )` both toggle, so the pair
  // reads as Emacs while being one command underneath.
  [EMACS_MACRO_KEYS.record, 'macro.record'],
  [EMACS_MACRO_KEYS.stop, 'macro.record'],
  [EMACS_MACRO_KEYS.replay, 'macro.replay'],
];

/**
 * `M-g` — Emacs' goto-map.
 *
 * ⛔ This REPLACES a dead key, it does not add one. The package's own table
 * carries `"M-g": "gotoline"` and ships no `gotoline` command, so `M-g` under
 * Emacs did nothing at all — measured by pressing it, not inferred. Binding a
 * CHAIN here is what repairs it: `bindKey` stores every prefix of a chain as the
 * marker string `"null"`, so binding `M-g g` overwrites `M-g` with the prefix
 * marker and the chain resolves. Both of Emacs' spellings land on the same
 * command, as they do in Emacs.
 */
export const MG_MAP = [
  ['M-g g', 'nav.goto-line'],
  ['M-g M-g', 'nav.goto-line'],
];

/** `C-c` — the BelJar prefix: the prover, the runner, the problems. */
export const CC_MAP = [
  ['C-c h', 'prover.hole-intro'],
  ['C-c s', 'prover.hole-split'],
  ['C-c f', 'prover.hole-fill'],
  ['C-c p', 'prover.open-in-harpoon'],
  ['C-c r', 'run.default'],
  ['C-c e', 'nav.next-problem'],
  ['C-c n', 'nav.next-hole'],
  ['C-c d', 'nav.definition'],
  ['C-c g', 'tools.graph'],
  // ⛔ Format Document's own chord is gone under Emacs: `Alt+Shift+F` is `S-M-f`,
  // which the package binds to forward-word-selecting. `q` because `M-q` is
  // fill-paragraph — the nearest thing Emacs has to "tidy this up".
  ['C-c q', 'edit.format'],
];

/**
 * Chords Emacs users will reach for that BelJar deliberately does NOT bind.
 * Answering is the point: silence reads as a broken keymap, and guessing an
 * analogue for something the app cannot do is worse than saying so.
 */
export const DECLINED = [
  ['C-x C-c', 'BelJar runs in a browser tab. There is nothing to quit.'],
  ['C-x 2', 'BelJar has one editor pane; there are no window splits.'],
  ['C-x 3', 'BelJar has one editor pane; there are no window splits.'],
  ['C-x 1', 'BelJar has one editor pane; there are no window splits.'],
  ['C-x o', 'BelJar has one editor pane; there is no other window.'],
];

/**
 * The handler names keys from `e.code`, stripping only the `Key`/`Numpad`
 * prefixes — so a digit arrives as `Digit2`, not `2`. Binding the readable
 * spelling alone silently never fires.
 *
 * ⛔ Shifted punctuation is the same trap one level deeper. `(` is Shift+9, and
 * what reaches the handler is the CODE plus the modifier: `S-Digit9`. So a table
 * written `C-x (` — which is how Emacs spells it, and how it has to read on
 * screen — binds nothing at all unless the spelling is derived here. Layout is
 * the package's own convention: it keys off `e.code` throughout.
 */
const SHIFTED_CODE = {
  '(': 'S-Digit9',
  ')': 'S-Digit0',
};

export function chordVariants(keys) {
  const out = [keys];
  const swapped = keys.split(' ')
    .map((part) => SHIFTED_CODE[part] || (/^[0-9]$/.test(part) ? 'Digit' + part : part))
    .join(' ');
  if (swapped !== keys) out.push(swapped);
  return out;
}

let installed = false;

export function installEmacsBindings() {
  if (installed) return false;
  installed = true;
  for (const [keys, id] of CX_MAP.concat(CC_MAP, MG_MAP)) {
    for (const variant of chordVariants(keys)) {
      try {
        EmacsHandler.bindKey(variant, () => runId(id, keys));
      } catch (_) { /* a chain the handler refuses stays unbound */ }
    }
  }
  for (const [keys, why] of DECLINED) {
    for (const variant of chordVariants(keys)) {
      try {
        EmacsHandler.bindKey(variant, () => say(why));
      } catch (_) { /* ignore */ }
    }
  }
  return true;
}

/** Pure, for tests. */
export const _pure = { CX_MAP, CC_MAP, MG_MAP, DECLINED, chordVariants };
