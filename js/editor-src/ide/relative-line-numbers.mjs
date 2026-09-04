/**
 * Relative line numbers — Vim's `relativenumber`, done without a stale gutter.
 *
 * Vim motions take counts (`5j`, `d3k`, `2dd`), and relative numbers are how you
 * READ the count instead of eyeballing it. That is the whole feature.
 *
 * ⛔ Why this is a gutter of its own rather than `lineNumbers({ formatNumber })`.
 * The built-in number gutter declares
 *
 *     lineMarkerChange: update => update.startState.facet(lineNumberConfig)
 *                              != update.state.facet(lineNumberConfig)
 *
 * so it repaints when its CONFIG changes — on document and viewport changes, and
 * never on a selection change. A `formatNumber` that reads the cursor is
 * therefore correct exactly until you move, and then silently wrong, which is
 * worse than absolute numbers because you would act on it.
 *
 * `gutter({ lineMarkerChange })` is the supported hook for "repaint when I say",
 * and what we say is: only when the cursor's LINE changes. Typing inside a line
 * costs nothing, which is the property Thread 2 cares about.
 */
import { gutter, GutterMarker } from '@codemirror/view';

/** The line the caret is on, 1-based. */
export function cursorLine(state) {
  return state.doc.lineAt(state.selection.main.head).number;
}

/**
 * Pure: what one line's gutter reads.
 *
 * `relative` puts 0 on the caret's line, the way Vim does with `relativenumber`
 * alone. `hybrid` puts the absolute number there instead — `number` plus
 * `relativenumber`, which is what most people actually run, because the count
 * you need for a motion is never 0 but the line you are on is worth knowing.
 */
export function lineLabel(lineNo, caretLine, mode) {
  if (lineNo === caretLine) return mode === 'hybrid' ? String(lineNo) : '0';
  return String(Math.abs(lineNo - caretLine));
}

class NumberMarker extends GutterMarker {
  constructor(text) {
    super();
    this.text = text;
  }

  eq(other) {
    return this.text === other.text;
  }

  toDOM() {
    return document.createTextNode(this.text);
  }
}

/**
 * @param {'relative'|'hybrid'} mode
 */
export function relativeLineNumbers(mode) {
  const style = mode === 'hybrid' ? 'hybrid' : 'relative';
  return gutter({
    // The same class the built-in uses, so the existing gutter CSS and
    // `highlightActiveLineGutter` apply unchanged.
    class: 'cm-lineNumbers',
    renderEmptyElements: false,
    lineMarker(view, line, others) {
      if (others.some((m) => m.toDOM)) return null;
      const no = view.state.doc.lineAt(line.from).number;
      return new NumberMarker(lineLabel(no, cursorLine(view.state), style));
    },
    // The point of the whole module: repaint on a LINE change, never per keystroke.
    lineMarkerChange(update) {
      return cursorLine(update.startState) !== cursorLine(update.state);
    },
    // Width comes from the line COUNT, as it does for absolute numbers, so the
    // gutter keeps a steady width instead of breathing as you move the caret.
    initialSpacer(view) {
      return new NumberMarker(String(view.state.doc.lines));
    },
    updateSpacer(spacer, update) {
      const max = String(update.view.state.doc.lines);
      return max === spacer.text ? spacer : new NumberMarker(max);
    },
    side: 'before',
  });
}
