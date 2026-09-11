// Feeds the shell's status strip with caret, selection and editing mode.
//
// This runs on the typing path, so it does the minimum: an early return unless
// the selection, document or focus actually moved, one rAF to coalesce a burst
// of updates into a single push, and O(log n) `lineAt` — never a doc read, never
// a parse, never a symbol walk. The bar itself owns no analysis; diagnostics
// reach it separately through the existing `beljar:file-lint` event.
import { EditorView } from '@codemirror/view';
import { getCM } from '@replit/codemirror-vim';
import { normalizeKeymapStyle } from './keymap-style.mjs';
import { normalizeType } from '../format/type-render.mjs';
import { goalMayStillArrive } from '../prover/hole-goal-display.mjs';

const NO_HOLE = { inHole: false, goal: '', goalPending: false };

/**
 * Where the caret is, as TWO facts: is it in a hole, and is that hole's goal
 * known yet.
 *
 * ⛔ These used to be one string, and collapsing them was a real hole in the
 * state machine. `''` meant both "not in a hole" and "in a hole whose goal the
 * checker has not produced yet", so standing on a fresh `?` looked exactly like
 * standing on ordinary code: the bar said nothing, and had no way to say the
 * honest thing, which is *not yet*.
 *
 * This is the same `holeAtCursor` call the command palette already gates its
 * prover moves on, so it is known cheap; it still runs once per animation frame,
 * never per keystroke.
 */
export function goalAtCaret() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const ed = g.CurrentEditor;
  if (!ed || typeof ed.holeAtCursor !== 'function') return NO_HOLE;
  try {
    const hit = ed.holeAtCursor();
    if (!hit || !hit.hole) return NO_HOLE;
    const goal = hit.hole.goal;
    // ⛔ Whether a goal may STILL ARRIVE is the engine's own settle state, not
    // the bar's `checking` flag — which is `belugaChecking || parse incomplete`,
    // a near-miss that would have the chip promising a goal after the check had
    // already finished without one. `goalMayStillArrive` is the one predicate,
    // and it lives with the rest of the goal vocabulary.
    let settle = '';
    try {
      settle = ed.getSemanticEngine?.()?.settleState?.() || '';
    } catch (_) { /* unknown settle state reads as "still working" */ }
    // `hole.goal` is Beluga's own text: ASCII `|-`, `->`, `=>`. Every surface
    // that SHOWS a type owes it `normalizeType`, which is the single place those
    // become ⊢ → ⇒. Skipping it is how raw `|-` leaks into the UI.
    return {
      inHole: true,
      goal: goal ? normalizeType(String(goal)) : '',
      goalPending: goalMayStillArrive(settle),
    };
  } catch (_) {
    return NO_HOLE;
  }
}

function bar() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const B = g.StatusStrip;
  return B && typeof B.setEditorState === 'function' ? B : null;
}

/** NORMAL / INSERT / VISUAL / V-LINE / V-BLOCK, or '' outside Vim. */
export function vimModeLabel(vimState) {
  if (!vimState) return 'NORMAL';
  if (vimState.insertMode) return 'INSERT';
  if (vimState.visualMode) {
    if (vimState.visualLine) return 'V-LINE';
    return vimState.visualBlock ? 'V-BLOCK' : 'VISUAL';
  }
  return 'NORMAL';
}

function readMode(view, style) {
  if (style === 'vim') {
    const cm = getCM(view);
    return { mode: vimModeLabel(cm?.state?.vim) };
  }
  // ⛔ Emacs' mark is pushed from the key handler, not read here: `C-Space` sets
  // it without a transaction, so this listener never runs for it. Reporting
  // `false` from here would erase what the handler just said.
  if (style === 'emacs') return { mode: '' };
  return { mode: '' };
}

export function statusStripFeed(getStyle) {
  let frame = 0;
  let pending = null;

  const flush = () => {
    frame = 0;
    const B = bar();
    // ⛔ The goal is resolved HERE, not where `pending` is built.
    //
    // `holeAtCaret` walks the hole list and `normalizeType` rewrites the whole
    // type string; the file above says that happens "once per animation frame,
    // never per keystroke", and it was doing it once per transaction — which
    // under key-repeat is every keystroke, on the input path, for a value only
    // the last one of the burst will ever be shown. Reading it in the flush is
    // also more truthful: it reports the caret the user ended up at, not the
    // one they passed through.
    if (B && pending) B.setEditorState({ ...pending, ...goalAtCaret() });
    pending = null;
  };

  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged && !update.focusChanged
      && !update.transactions.length) return;
    if (!bar()) return;
    const view = update.view;
    const style = normalizeKeymapStyle(typeof getStyle === 'function' ? getStyle() : 'default');
    const sel = update.state.selection.main;
    const doc = update.state.doc;
    const head = doc.lineAt(sel.head);
    const selChars = Math.abs(sel.to - sel.from);
    const selLines = selChars ? doc.lineAt(sel.to).number - doc.lineAt(sel.from).number + 1 : 0;
    const { mode } = readMode(view, style);
    pending = {
      style,
      mode,
      hasFile: true,
      line: head.number,
      col: sel.head - head.from + 1,
      selChars,
      selLines,
    };
    if (frame) return;
    frame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(flush)
      : setTimeout(flush, 16);
  });
}
