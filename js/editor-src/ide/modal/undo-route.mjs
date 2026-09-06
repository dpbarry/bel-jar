/**
 * Undo and redo, routed through BelJar's own history first.
 *
 * `EditHistory` knows about edits CodeMirror never saw — a rename applied across
 * files, a format-on-save rewrite — so it gets first refusal, and CodeMirror's
 * own history handles the rest. Shared by both modal runtimes because both
 * packages ship their own undo binding and both must land here.
 *
 * ⛔ "First refusal" is ownership, not a first attempt. `runHistoryUndo` takes
 * the key whenever our stack has a step in that direction, even if applying it
 * fails. Handing a FAILED undo on to CodeMirror ran a second, divergent history
 * over the same document — the user got an error toast and an unrelated edit.
 */
import { undo as cmUndo, redo as cmRedo } from '@codemirror/commands';
import { runHistoryUndo, runHistoryRedo } from '../../edit-history.mjs';

export function beljarUndo(view) {
  return runHistoryUndo() || cmUndo(view);
}

export function beljarRedo(view) {
  return runHistoryRedo() || cmRedo(view);
}
