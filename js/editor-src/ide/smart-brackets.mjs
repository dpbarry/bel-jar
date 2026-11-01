// Beluga's pairs are () [] {}.
//
// ⛔ An orphan closer on this line (only spaces/tabs between) is claimed: the
// opener is typed alone. A closer that already belongs to an empty pair around
// the cursor nests — `(|)` then `(` becomes `((|))`. Typing the closer steps
// over a mate. A typed closer never invents an opener.
// ⛔ Backspace/Delete removes both braces only when the character being erased
// is a brace of a pair whose interior is only spaces or tabs (`()`, `[  ]`).
// Erasing a space inside that pair removes the space alone.
// ⛔ Delete runs on contentDOM capture so Vim/Emacs bubble handlers cannot
// steal Backspace the way a Prec.highest keymap still can.
import { EditorSelection } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { getCM } from '@replit/codemirror-vim';

const CLOSE_OF = { '(': ')', '[': ']', '{': '}' };
const OPEN_OF = { ')': '(', ']': '[', '}': '{' };
const BEFORE = ')]}:;>';
const PAD = '[  ]';
const PAD_CURSOR = 2;

const android = typeof navigator === 'object' && navigator != null
  && /Android\b/.test(navigator.userAgent || '');

function configured(state, pos) {
  const data = typeof state.languageDataAt === 'function' ? state.languageDataAt('closeBrackets', pos) : [];
  const conf = data[0] || {};
  const tokens = conf.brackets || ['(', '[', '{'];
  return {
    opens: tokens.filter((t) => CLOSE_OF[t]),
    before: typeof conf.before === 'string' ? conf.before : BEFORE,
  };
}

function charAt(doc, pos) {
  if (pos < 0 || pos >= doc.length) return '';
  return doc.sliceString(pos, pos + 1);
}

// Position of the matching closer on this line, looking through spaces/tabs only.
function closerAheadAt(doc, pos, close) {
  const line = doc.lineAt(Math.max(0, Math.min(pos, doc.length)));
  const rest = doc.sliceString(pos, line.to);
  let i = 0;
  while (rest[i] === ' ' || rest[i] === '\t') i += 1;
  return rest[i] === close ? pos + i : -1;
}

/** True when `closeAt` is the closer of a whitespace-only pair that contains `pos`. */
function insideEmptyPair(doc, pos, closeAt, opens) {
  const pair = emptyPairFromClose(doc, closeAt, opens);
  return !!(pair && pair.from < pos && pos <= closeAt);
}

function plain(range, insert) {
  return {
    changes: { from: range.from, to: range.to, insert },
    range: EditorSelection.cursor(range.from + insert.length),
  };
}

/**
 * The transaction for typing one bracket, or null when the character should
 * be inserted as itself. `padBoxes` turns the auto-closed `[]` into `[  ]`
 * with the cursor after the first space.
 */
export function bracketTypeEdit(state, insert, padBoxes) {
  if (state.readOnly || insert.length !== 1) return null;
  const { opens, before } = configured(state, state.selection.main.head);
  const isOpen = opens.includes(insert);
  const isClose = opens.some((open) => CLOSE_OF[open] === insert);
  if (!isOpen && !isClose) return null;

  let special = false;
  const changes = state.changeByRange((range) => {
    if (isOpen && !range.empty) {
      special = true;
      const pad = padBoxes && insert === '[';
      const openIns = pad ? '[ ' : insert;
      const closeIns = pad ? ' ]' : CLOSE_OF[insert];
      return {
        changes: [{ insert: openIns, from: range.from }, { insert: closeIns, from: range.to }],
        range: EditorSelection.range(range.anchor + openIns.length, range.head + openIns.length),
      };
    }
    if (!range.empty) return plain(range, insert);
    const next = charAt(state.doc, range.head);
    if (isClose && next === insert) {
      special = true;
      return {
        changes: { from: range.head, to: range.head + insert.length, insert },
        range: EditorSelection.cursor(range.head + insert.length),
      };
    }
    // A padded box's closer is a space away (`[ x‸ ]`): typing it steps over both,
    // or `]` typed by hand left the box's own ` ]` stranded after it.
    if (isClose && padBoxes && insert === ']' && next === ' ' && charAt(state.doc, range.head + 1) === ']') {
      special = true;
      return {
        changes: { from: range.head, to: range.head + 2, insert: ' ]' },
        range: EditorSelection.cursor(range.head + 2),
      };
    }
    if (isOpen) {
      const close = CLOSE_OF[insert];
      const mate = closerAheadAt(state.doc, range.head, close);
      // Orphan closer ahead: claim it. Closer of the empty pair we are in: nest.
      if (mate >= 0 && !insideEmptyPair(state.doc, range.head, mate, opens)) {
        return plain(range, insert);
      }
      const closable = !next || /\s/.test(next) || before.includes(next);
      if (closable) {
        special = true;
        const pad = padBoxes && insert === '[';
        const body = pad ? PAD : insert + close;
        return {
          changes: { insert: body, from: range.head },
          range: EditorSelection.cursor(range.head + (pad ? PAD_CURSOR : insert.length)),
        };
      }
    }
    return plain(range, insert);
  });
  if (!special) return null;
  return state.update(changes, { scrollIntoView: true, userEvent: 'input.type' });
}

function wsOnly(doc, from, to) {
  return from <= to && /^[ \t]*$/.test(doc.sliceString(from, to));
}

/** Span of an opener…closer pair on this line whose interior is only spaces/tabs. */
function emptyPairFromOpen(doc, openAt, opens) {
  const open = charAt(doc, openAt);
  if (!opens.includes(open)) return null;
  const close = CLOSE_OF[open];
  const line = doc.lineAt(openAt);
  for (let i = openAt + 1; i < line.to; i++) {
    const ch = charAt(doc, i);
    if (ch === close) return wsOnly(doc, openAt + 1, i) ? { from: openAt, to: i + 1 } : null;
    if (ch !== ' ' && ch !== '\t') return null;
  }
  return null;
}

function emptyPairFromClose(doc, closeAt, opens) {
  const close = charAt(doc, closeAt);
  const open = OPEN_OF[close];
  if (!open || !opens.includes(open)) return null;
  const line = doc.lineAt(closeAt);
  for (let i = closeAt - 1; i >= line.from; i--) {
    const ch = charAt(doc, i);
    if (ch === open) return wsOnly(doc, i + 1, closeAt) ? { from: i, to: closeAt + 1 } : null;
    if (ch !== ' ' && ch !== '\t') return null;
  }
  return null;
}

/** Pair removed when Backspace/Delete is about to erase the brace at `at`. */
function pairForBrace(doc, at, opens) {
  if (at < 0 || at >= doc.length) return null;
  const ch = charAt(doc, at);
  if (opens.includes(ch)) return emptyPairFromOpen(doc, at, opens);
  if (OPEN_OF[ch]) return emptyPairFromClose(doc, at, opens);
  return null;
}

/**
 * Delete both braces when the erased character is a brace of a whitespace-only
 * pair. Null when Backspace/Delete should remove one character. `forward` is
 * the Delete key.
 */
export function bracketDeleteEdit(state, forward) {
  if (state.readOnly) return null;
  const { opens } = configured(state, state.selection.main.head);
  if (!opens.length) return null;
  let blocked = false;
  const changes = state.changeByRange((range) => {
    if (!range.empty) {
      blocked = true;
      return { range };
    }
    const at = forward ? range.head : range.head - 1;
    const pair = pairForBrace(state.doc, at, opens);
    if (!pair) {
      blocked = true;
      return { range };
    }
    return {
      changes: { from: pair.from, to: pair.to },
      range: EditorSelection.cursor(pair.from),
    };
  });
  if (blocked) return null;
  return state.update(changes, {
    scrollIntoView: true,
    userEvent: forward ? 'delete.forward' : 'delete.backward',
  });
}

function vimCommandMode(view) {
  const cm = getCM(view);
  return !!(cm && cm.state && cm.state.vim && !cm.state.vim.insertMode);
}

function runDelete(view, forward) {
  if (vimCommandMode(view)) return false;
  const tr = bracketDeleteEdit(view.state, forward);
  if (!tr) return false;
  view.dispatch(tr);
  return true;
}

export function smartBrackets(padBoxes) {
  return [
    EditorView.inputHandler.of((view, from, to, insert) => {
      if ((android ? view.composing : view.compositionStarted) || view.state.readOnly) return false;
      const sel = view.state.selection.main;
      if (insert.length !== 1 || from !== sel.from || to !== sel.to) return false;
      const tr = bracketTypeEdit(view.state, insert, !!padBoxes);
      if (!tr) return false;
      view.dispatch(tr);
      return true;
    }),
    // Capture beats Vim/Emacs bubble handlers. A Prec.highest keymap still loses.
    ViewPlugin.fromClass(class {
      constructor(view) {
        this.view = view;
        this.onKey = (e) => {
          if (e.key !== 'Backspace' && e.key !== 'Delete') return;
          if (e.ctrlKey || e.altKey || e.metaKey) return;
          if (!runDelete(view, e.key === 'Delete')) return;
          e.preventDefault();
          e.stopPropagation();
        };
        view.contentDOM.addEventListener('keydown', this.onKey, true);
      }
      destroy() {
        this.view.contentDOM.removeEventListener('keydown', this.onKey, true);
      }
    }),
  ];
}

/** Kept for the editor compartment; delete itself also lives on capture above. */
export function smartBracketKeymap() {
  return [
    { key: 'Backspace', run: (view) => runDelete(view, false) },
    { key: 'Delete', run: (view) => runDelete(view, true) },
  ];
}
