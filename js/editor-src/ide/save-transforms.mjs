/** Save-time text transforms for .bel autosave. */

import { Transaction } from '@codemirror/state';
import { formatDocument } from '../format/document-format.mjs';

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
    const cur = view.state.doc.toString();
    const next = trimTrailingWhitespace(cur);
    if (next !== cur) {
      view.dispatch({
        changes: { from: 0, to: cur.length, insert: next },
        annotations: Transaction.addToHistory.of(false),
      });
      changed = true;
    }
  }
  if (formatOn) {
    try {
      const change = formatDocument(view.state);
      if (change) {
        view.dispatch({
          ...change,
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
