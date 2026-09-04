/**
 * Undo and redo, routed through BelJar's own history first.
 *
 * `EditHistory` knows about edits CodeMirror never saw — a rename applied across
 * files, a format-on-save rewrite — so it gets first refusal, and CodeMirror's
 * own history handles the rest. Shared by both modal runtimes because both
 * packages ship their own undo binding and both must land here.
 */
import { undo as cmUndo, redo as cmRedo } from '@codemirror/commands';

export function beljarUndo(view) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const H = g.EditHistory;
  if (H?.undo?.()) return true;
  return cmUndo(view);
}

export function beljarRedo(view) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const H = g.EditHistory;
  if (H?.redo?.()) return true;
  return cmRedo(view);
}
