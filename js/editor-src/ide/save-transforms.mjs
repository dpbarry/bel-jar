/** Save-time text transforms for .bel autosave. */

import { EditorSelection, Transaction } from '@codemirror/state';
import { formatDocument } from '../format/document-format.mjs';

/**
 * The trailing-whitespace runs to delete, as MINIMAL edits.
 *
 * ⛔ Not a whole-document replacement. A `{from: 0, to: len}` change maps every
 * position inside it to one end of the replacement, so trimming sent the caret
 * to offset 0 — the top of the file — on every autosave that found a stray
 * space. Autosave runs while you are typing, so turning the preference on moved
 * the caret to line 1 roughly once a second. Deleting only the runs leaves the
 * caret where it was, because nothing it sits in front of moved.
 *
 * ⛔ `protectedLines` is not an optimisation either. Autosave fires mid-word:
 * type `foo `, let the debounce land, and the space you were about to build on
 * is gone — so the next keystroke gives `foobar`. An editor that autosaves must
 * not trim the line a cursor is on.
 */
export function trailingWhitespaceEdits(doc, protectedLines = null) {
  const edits = [];
  for (let i = 1; i <= doc.lines; i += 1) {
    if (protectedLines && protectedLines.has(i)) continue;
    const line = doc.line(i);
    const m = /[ \t]+$/.exec(line.text);
    if (!m) continue;
    edits.push({ from: line.from + m.index, to: line.to });
  }
  return edits;
}

/** Every line a cursor or a selection end sits on. */
export function linesUnderSelection(state) {
  const lines = new Set();
  for (const r of state.selection.ranges) {
    lines.add(state.doc.lineAt(r.head).number);
    lines.add(state.doc.lineAt(r.anchor).number);
  }
  return lines;
}

export function trimTrailingWhitespace(text) {
  const s = String(text != null ? text : '');
  if (!s) return s;
  const endsWithNl = /\r?\n$/.test(s);
  const lines = s.split(/\r?\n/);
  if (endsWithNl && lines.length && lines[lines.length - 1] === '') lines.pop();
  const trimmed = lines.map((line) => line.replace(/[ \t]+$/g, ''));
  return endsWithNl ? `${trimmed.join('\n')}\n` : trimmed.join('\n');
}

export function isBelSavePath(filePath) {
  const n = String(filePath || '').toLowerCase();
  if (n.endsWith('.cfg') || n.endsWith('.elf')) return false;
  if (n.endsWith('.bel')) return true;
  const base = n.slice(n.lastIndexOf('/') + 1);
  return base.indexOf('.') === -1;
}

function persistApi() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  return g.Persist;
}

/** Apply format/trim prefs to the live editor before Persist materializes text. */
export function applySaveTransforms(view, filePath) {
  if (!view?.state || !isBelSavePath(filePath)) return false;
  const p = persistApi();
  const formatOn = !!p?.readStoredFormatOnSave?.();
  const trimOn = !!p?.readStoredTrimTrailingWs?.();
  if (!formatOn && !trimOn) return false;

  let changed = false;
  if (trimOn) {
    const edits = trailingWhitespaceEdits(view.state.doc, linesUnderSelection(view.state));
    if (edits.length) {
      view.dispatch({
        changes: edits,
        annotations: Transaction.addToHistory.of(false),
      });
      changed = true;
    }
  }
  if (formatOn) {
    try {
      // ⛔ Carry the caret. A format IS a whole-document replacement — there is
      // no minimal edit to make — so the selection has to be stated, or it maps
      // to offset 0 exactly as the trim did. This is the same clamp
      // `formatCommand` uses for the explicit Format Document action; the two
      // paths must not disagree about where the caret ends up.
      const head = view.state.selection.main.head;
      const change = formatDocument(view.state);
      if (change) {
        const newLen = String(change.changes.insert ?? '').length;
        view.dispatch({
          ...change,
          selection: EditorSelection.cursor(Math.min(head, newLen)),
          annotations: Transaction.addToHistory.of(false),
        });
        changed = true;
      }
    } catch (_) {
      // Same honesty as format command: leave current text, still save.
    }
  }
  return changed;
}
