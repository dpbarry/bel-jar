/**
 * The editor half of the command registry.
 *
 * Motions and editing verbs are CodeMirror commands, and the shell cannot import
 * `@codemirror/commands` — it lives on the other side of the bundle seam. So the
 * editor attaches them itself, once, with runs that resolve the LIVE view each
 * time. Attaching per mount would mean stale closures every time a document
 * switch rebuilds the editor.
 *
 * Metadata (titles, sections, flags) stays in the shell's catalogue; this file
 * supplies behaviour only. The two agree because both key off the same ids, and
 * `tests/test-editor-commands.mjs` fails if either side grows an id the other
 * does not have.
 */
import {
  cursorCharLeft, cursorCharRight, selectCharLeft, selectCharRight,
  cursorGroupLeft, cursorGroupRight, selectGroupLeft, selectGroupRight,
  cursorLineUp, cursorLineDown, selectLineUp, selectLineDown,
  cursorLineBoundaryBackward, cursorLineBoundaryForward,
  selectLineBoundaryBackward, selectLineBoundaryForward,
  cursorDocStart, cursorDocEnd, selectDocStart, selectDocEnd,
  cursorPageUp, cursorPageDown, selectPageUp, selectPageDown,
  cursorMatchingBracket, selectMatchingBracket,
  cursorSyntaxLeft, cursorSyntaxRight, selectParentSyntax,
  selectLine, simplifySelection,
  deleteLine, moveLineUp, moveLineDown, copyLineUp, copyLineDown,
  indentMore, indentLess, indentSelection,
  transposeChars, splitLine, insertBlankLine, deleteTrailingWhitespace,
} from '@codemirror/commands';

import { syntaxTree } from '@codemirror/language';
import { travel } from './jump-list.mjs';
import { normalizeType } from '../format/type-render.mjs';

const global = globalThis;

/** Pure: the next entry in `positions` after `pos`, wrapping. */
export function stepThrough(positions, pos, forward) {
  if (!positions.length) return null;
  if (forward) {
    const hit = positions.find((p) => p > pos);
    return hit == null ? positions[0] : hit;
  }
  for (let i = positions.length - 1; i >= 0; i -= 1) {
    if (positions[i] < pos) return positions[i];
  }
  return positions[positions.length - 1];
}

/** Top-level declaration starts, in document order. */
function declStarts() {
  const ed = global.CurrentEditor;
  const eng = ed && typeof ed.getSemanticEngine === 'function' ? ed.getSemanticEngine() : null;
  const snap = eng && typeof eng.getSnapshot === 'function' ? eng.getSnapshot() : null;
  const symbols = snap?.symbols?.globalSymbols || [];
  const out = [];
  for (const s of symbols) {
    const from = s.range?.from ?? s.nameRange?.from;
    if (Number.isFinite(from)) out.push(from);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** `case` branch starts, from the syntax tree — a Beluga proof's real structure. */
function caseBranchStarts(view) {
  const out = [];
  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name === 'CaseBranch') out.push(node.from);
    },
  });
  return out.sort((a, b) => a - b);
}

function jumpTo(view, pos) {
  const ed = global.CurrentEditor;
  if (ed && typeof ed.jumpToRange === 'function') return ed.jumpToRange({ from: pos, to: pos });
  view.dispatch({ selection: { anchor: pos, head: pos }, scrollIntoView: true });
  return true;
}

function say(text) {
  const B = global.StatusStrip;
  if (B && typeof B.setMessage === 'function') B.setMessage(text);
  return true;
}

/** Pure: how a hole tally reads. Exported for tests. */
export function holeReport(total, inDecl, declName) {
  if (!total) return 'No holes in this file.';
  const holes = total === 1 ? '1 hole' : total + ' holes';
  if (!declName || !inDecl) return holes + ' in this file.';
  if (total === inDecl) return holes + ', all in ' + declName + '.';
  return holes + ', ' + inDecl + ' in ' + declName + '.';
}

/**
 * How many goals are left, and how many are in the declaration under the caret.
 *
 * Counted from OUR semantic model, not by asking Beluga: the engine already
 * knows where every hole is, and a question this cheap should never wait on a
 * checker run.
 */
function countHoles(view) {
  const ed = global.CurrentEditor;
  const eng = ed && typeof ed.getSemanticEngine === 'function' ? ed.getSemanticEngine() : null;
  const holes = eng && typeof eng.getHoles === 'function' ? (eng.getHoles() || []) : [];
  const doc = view.state.doc;
  const head = view.state.selection.main.head;

  // The enclosing declaration is the last one starting at or before the caret.
  const starts = declStarts();
  let declFrom = -1;
  let declTo = doc.length;
  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i] <= head) { declFrom = starts[i]; declTo = starts[i + 1] ?? doc.length; }
  }
  let inDecl = 0;
  for (const h of holes) {
    if (!h || h.line < 1 || h.line > doc.lines) continue;
    const off = doc.line(h.line).from + Math.max(0, (h.col || 1) - 1);
    if (declFrom >= 0 && off >= declFrom && off < declTo) inDecl += 1;
  }
  return say(holeReport(holes.length, inDecl, declName(declFrom)));
}

/** The name of the declaration starting at `from`, or null. */
function declName(from) {
  if (from < 0) return null;
  const ed = global.CurrentEditor;
  const eng = ed && typeof ed.getSemanticEngine === 'function' ? ed.getSemanticEngine() : null;
  const snap = eng && typeof eng.getSnapshot === 'function' ? eng.getSnapshot() : null;
  for (const sym of snap?.symbols?.globalSymbols || []) {
    if ((sym.range?.from ?? sym.nameRange?.from) === from) return sym.name || null;
  }
  return null;
}

/**
 * The full goal at the caret, in the bar.
 *
 * The bar's goal segment truncates to fit its row; this is the same type with
 * nothing cut. ⛔ `normalizeType` is not optional — it is the single place `|-`
 * becomes ⊢, and every surface that SHOWS a type owes it.
 */
function goalAtCursor() {
  const ed = global.CurrentEditor;
  const hit = ed && typeof ed.holeAtCursor === 'function' ? ed.holeAtCursor() : null;
  const goal = hit && hit.hole ? hit.hole.goal : null;
  if (!goal) return say('No goal at the cursor.');
  const name = hit.hole.name ? '?' + hit.hole.name + '  ' : '';
  return say(name + normalizeType(String(goal)));
}

/** Commands that need more than a CodeMirror call. */
const CUSTOM_COMMANDS = {
  'prover.count-holes': countHoles,
  'prover.goal-at-cursor': goalAtCursor,
  'nav.next-decl': (view) => cycle(view, declStarts(), true),
  'nav.prev-decl': (view) => cycle(view, declStarts(), false),
  'nav.next-case': (view) => cycle(view, caseBranchStarts(view), true),
  'nav.prev-case': (view) => cycle(view, caseBranchStarts(view), false),
  'nav.jump-back': (view) => travelTo(view, -1),
  'nav.jump-forward': (view) => travelTo(view, 1),
};

function cycle(view, positions, forward) {
  const target = stepThrough(positions, view.state.selection.main.head, forward);
  if (target == null) return false;
  return jumpTo(view, target);
}

function travelTo(view, delta) {
  const here = {
    fileId: global.Persist?.getActiveFileId?.() ?? null,
    pos: view.state.selection.main.head,
  };
  return travel(delta, (entry) => {
    const g = global;
    const activeId = g.Persist?.getActiveFileId?.() ?? null;
    if (entry.fileId && activeId && entry.fileId !== activeId) {
      // The jump came from another file; reopen it at the remembered spot.
      g.dispatchEvent?.(new CustomEvent('beljar:open-file-at', {
        detail: { fileId: entry.fileId, from: entry.pos, to: entry.pos },
      }));
      return true;
    }
    return jumpTo(view, Math.min(entry.pos, view.state.doc.length));
  }, here);
}

/**
 * id → CodeMirror command. Ids match `command-catalog.mjs` exactly; the shared
 * table is the contract between the two halves.
 */
export const EDITOR_COMMANDS = {
  // ── motion ────────────────────────────────────────────────────────────────
  'motion.char-left': cursorCharLeft,
  'motion.char-right': cursorCharRight,
  'motion.word-left': cursorGroupLeft,
  'motion.word-right': cursorGroupRight,
  'motion.line-up': cursorLineUp,
  'motion.line-down': cursorLineDown,
  'motion.line-start': cursorLineBoundaryBackward,
  'motion.line-end': cursorLineBoundaryForward,
  'motion.doc-start': cursorDocStart,
  'motion.doc-end': cursorDocEnd,
  'motion.page-up': cursorPageUp,
  'motion.page-down': cursorPageDown,
  'motion.match-bracket': cursorMatchingBracket,
  'motion.syntax-left': cursorSyntaxLeft,
  'motion.syntax-right': cursorSyntaxRight,

  // ── selection ─────────────────────────────────────────────────────────────
  'select.char-left': selectCharLeft,
  'select.char-right': selectCharRight,
  'select.word-left': selectGroupLeft,
  'select.word-right': selectGroupRight,
  'select.line-up': selectLineUp,
  'select.line-down': selectLineDown,
  'select.line-start': selectLineBoundaryBackward,
  'select.line-end': selectLineBoundaryForward,
  'select.doc-start': selectDocStart,
  'select.doc-end': selectDocEnd,
  'select.page-up': selectPageUp,
  'select.page-down': selectPageDown,
  'select.match-bracket': selectMatchingBracket,
  'select.line': selectLine,
  'select.parent-syntax': selectParentSyntax,
  'select.collapse': simplifySelection,

  // ── editing ───────────────────────────────────────────────────────────────
  'edit.delete-line': deleteLine,
  'edit.move-line-up': moveLineUp,
  'edit.move-line-down': moveLineDown,
  'edit.duplicate-line-up': copyLineUp,
  'edit.duplicate-line': copyLineDown,
  'edit.indent': indentMore,
  'edit.dedent': indentLess,
  'edit.reindent': indentSelection,
  'edit.transpose-chars': transposeChars,
  'edit.split-line': splitLine,
  'edit.blank-line': insertBlankLine,
  'edit.trim-whitespace': deleteTrailingWhitespace,
};

function liveView() {
  const ed = global.CurrentEditor;
  return ed && typeof ed.getView === 'function' ? ed.getView() : null;
}

let installed = false;

/**
 * Idempotent: one attach for the life of the page, resolving the view per call.
 */
export function installEditorCommands() {
  if (installed) return false;
  const C = global.Commands;
  if (!C || typeof C.attach !== 'function') return false;
  installed = true;
  const all = Object.assign({}, EDITOR_COMMANDS, CUSTOM_COMMANDS);
  for (const id of Object.keys(all)) {
    const fn = all[id];
    C.attach(id, {
      run: () => {
        const view = liveView();
        if (!view) return false;
        view.focus();
        return fn(view) !== false;
      },
      when: () => !!liveView(),
    });
  }
  return true;
}

/** Pure, for tests. */
export const _pure = {
  ids: () => Object.keys(EDITOR_COMMANDS).concat(Object.keys(CUSTOM_COMMANDS)),
  stepThrough,
  CUSTOM_IDS: Object.keys(CUSTOM_COMMANDS),
};
