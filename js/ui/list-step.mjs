/**
 * Walking a list by keyboard, for every list the shell puts in front of you:
 * the command line's candidates, the palette, the REPL's completions.
 *
 * One table, because the three styles have to mean one thing wherever a list
 * appears. The editor bundle keeps its own copy (the two runtimes cannot import
 * each other): js/editor-src/ide/completion/list-keys.mjs, and
 * tests/test-list-step.mjs pins the two together.
 */
/**
 * Walking the list: forward, forward, back.
 *
 * ⛔ `C-m` is forward, NOT Enter. Chromium never delivers `Ctrl+N` to a page, so
 * `Ctrl+M` is the substitute BelJar's own reserved-chord table has promised for
 * next-line since the table was written, and the editor has bound it that way
 * just as long (`EMACS_LINE_DOWN_KEY`). The same trio has to mean the same thing
 * on this line as it does in the editor; treating it as RET because a terminal
 * once did contradicted two places in this repo that already said otherwise.
 */
export const LIST_STEP = { n: 1, m: 1, p: -1 };
export const LIST_PAGE = 8;

/**
 * How far to move an open completion list, or 0 if this key is not a list-step.
 *
 * Same function as `js/editor-src/ide/completion/list-keys.mjs`.
 *
 * @param {{ arrows?: boolean }} [opts] `arrows: false` on Vim's ex line (history)
 */
function stepLetter(e) {
  if (!e.ctrlKey || e.shiftKey) return '';
  if (e.key && e.key.length === 1) return e.key.toLowerCase();
  // Chromium sometimes reports C-m as Enter (CR). The physical key still walks.
  if (e.code && e.code.length === 4 && e.code.startsWith('Key')) return e.code[3].toLowerCase();
  return '';
}

export function listStepDelta(e, opts) {
  if (!e || e.altKey || e.metaKey) return 0;
  const arrows = !opts || opts.arrows !== false;
  if (e.key === 'PageDown') return LIST_PAGE;
  if (e.key === 'PageUp') return -LIST_PAGE;
  if (arrows && !e.ctrlKey && !e.shiftKey) {
    if (e.key === 'ArrowDown') return 1;
    if (e.key === 'ArrowUp') return -1;
  }
  const letter = stepLetter(e);
  if (letter && LIST_STEP[letter] !== undefined) return LIST_STEP[letter];
  const KB = typeof globalThis !== 'undefined' ? globalThis.Keybindings : null;
  if (KB && typeof KB.matchesId === 'function') {
    if (!arrows && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return 0;
    if (KB.matchesId(e, 'motion.line-down')) return 1;
    if (KB.matchesId(e, 'motion.line-up')) return -1;
  }
  return 0;
}
