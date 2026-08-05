import { Decoration, ViewPlugin } from '@codemirror/view';

const tabDeco = Decoration.mark({ class: 'cm-highlightTab' });
const spaceDeco = Decoration.mark({ class: 'cm-highlightSpace' });

/** Collect non-empty selection ranges as {from,to}. */
export function selectionWhitespaceRanges(ranges) {
  const out = [];
  for (const r of ranges || []) {
    if (r.empty) continue;
    const from = Math.min(r.from, r.to);
    const to = Math.max(r.from, r.to);
    if (from < to) out.push({ from, to });
  }
  out.sort((a, b) => a.from - b.from || a.to - b.to);
  return out;
}

/** Mark positions of spaces/tabs inside each [from,to) slice of `doc`. */
export function whitespaceMarksInRanges(doc, ranges) {
  const marks = [];
  for (const { from, to } of ranges) {
    const text = doc.sliceString(from, to);
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      if (ch === 32) marks.push(spaceDeco.range(from + i, from + i + 1));
      else if (ch === 9) marks.push(tabDeco.range(from + i, from + i + 1));
    }
  }
  return Decoration.set(marks);
}

function buildSelectionWhitespaceDeco(state) {
  const ranges = selectionWhitespaceRanges(state.selection.ranges);
  if (!ranges.length) return Decoration.none;
  return whitespaceMarksInRanges(state.doc, ranges);
}

export function highlightWhitespaceInSelection() {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = buildSelectionWhitespaceDeco(view.state);
    }

    update(update) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = buildSelectionWhitespaceDeco(update.state);
      }
    }
  }, {
    decorations: (v) => v.decorations,
  });
}
