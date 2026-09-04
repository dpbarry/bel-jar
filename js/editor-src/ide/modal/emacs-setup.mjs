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

const global = globalThis;

function say(text) {
  if (global.StatusStrip && global.StatusStrip.setMessage) global.StatusStrip.setMessage(text);
}

function runId(id) {
  const C = global.Commands;
  if (!C || typeof C.run !== 'function') return;
  if (!C.run(id)) {
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
 */
export function chordVariants(keys) {
  const out = [keys];
  const swapped = keys.split(' ')
    .map((part) => (/^[0-9]$/.test(part) ? 'Digit' + part : part))
    .join(' ');
  if (swapped !== keys) out.push(swapped);
  return out;
}

let installed = false;

export function installEmacsBindings() {
  if (installed) return false;
  installed = true;
  for (const [keys, id] of CX_MAP.concat(CC_MAP)) {
    for (const variant of chordVariants(keys)) {
      try {
        EmacsHandler.bindKey(variant, () => runId(id));
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
export const _pure = { CX_MAP, CC_MAP, DECLINED, chordVariants };
