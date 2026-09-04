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

/**
 * The goal under the caret, or ''. This is the same `holeAtCursor` call the
 * command palette already gates its prover moves on, so it is known cheap; it
 * still only runs once per animation frame, never per keystroke.
 */
function goalAtCaret() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const ed = g.CurrentEditor;
  if (!ed || typeof ed.holeAtCursor !== 'function') return '';
  try {
    const hit = ed.holeAtCursor();
    const goal = hit && hit.hole ? hit.hole.goal : null;
    if (!goal) return '';
    // `hole.goal` is Beluga's own text: ASCII `|-`, `->`, `=>`. Every surface
    // that SHOWS a type owes it `normalizeType`, which is the single place those
    // become ⊢ → ⇒. Skipping it is how raw `|-` leaks into the UI.
    return normalizeType(String(goal));
  } catch (_) {
    return '';
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
    if (B && pending) B.setEditorState(pending);
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
      goal: goalAtCaret(),
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
