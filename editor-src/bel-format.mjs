// Beluga source formatter: Lezer tree → pretty-print doc → string.
//
// Layering (extend here or in format/printer.mjs):
//   format/doc.mjs     — Wadler/Leijen combinators + render()
//   format/tree.mjs    — syntax-tree helpers + comment sweep
//   format/printer.mjs — AST → Doc (add rules per grammar node)
//
// Driver below wires CodeMirror; declarations with parse errors or `%`
// comments copy verbatim so line comments never swallow merged lines.

import { syntaxTree } from '@codemirror/language';
import { EditorSelection } from '@codemirror/state';
import { render } from './format/doc.mjs';
import { makePrinter } from './format/printer.mjs';
import { childrenArr, collectComments } from './format/tree.mjs';

function alignColons(s) {
  const lines = s.split('\n');
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^(\s*\|\s*\S+)\s*:/);
    if (!m) {
      i++;
      continue;
    }
    let j = i;
    let maxCol = 0;
    while (j < lines.length) {
      const mj = lines[j].match(/^(\s*\|\s*\S+)\s*:/);
      if (!mj) break;
      maxCol = Math.max(maxCol, mj[1].length);
      j++;
    }
    for (let k = i; k < j; k++) {
      const mk = lines[k].match(/^(\s*\|\s*\S+)(\s*):(.*)$/);
      if (!mk) continue;
      const pad = ' '.repeat(maxCol - mk[1].length);
      lines[k] = mk[1] + pad + ' :' + mk[3];
    }
    i = j;
  }
  return lines.join('\n');
}

export function formatString(src, tree, opts = {}) {
  const width = opts.printWidth ?? 80;
  const { pp } = makePrinter(src);

  const root = tree.topNode;
  const items = [];
  const comments = collectComments(tree, src);

  for (const c of childrenArr(root)) {
    if (c.name === 'Declaration') {
      const inner = c.firstChild;
      if (inner) items.push({ kind: 'decl', node: inner });
    } else if (c.name === 'LineComment' || c.name === 'BlockComment') {
      items.push({ kind: 'comment', node: c });
    }
  }

  const out = [];
  let prevEnd = 0;
  for (const item of items) {
    const blankLines = countBlankLinesBetween(prevEnd, item.node.from, src);

    if (out.length > 0) {
      out.push('\n');
      if (blankLines >= 1) out.push('\n');
    }

    if (item.kind === 'comment') {
      out.push(src.slice(item.node.from, item.node.to));
    } else {
      const leadingComments = pickLeadingComments(comments, prevEnd, item.node.from);
      for (const lc of leadingComments) out.push(src.slice(lc.from, lc.to), '\n');
      if (subtreeHasError(item.node) || declarationUsesPercentComment(src, item.node)) {
        out.push(src.slice(item.node.from, item.node.to));
      } else {
        out.push(render(pp(item.node), width));
      }
    }

    prevEnd = item.node.to;
  }

  let result = out.join('');
  if (opts.align) result = alignColons(result);
  if (!result.endsWith('\n')) result += '\n';
  return result;
}

function subtreeHasError(node) {
  let bad = false;
  node.toTree().iterate({
    enter(n) {
      if (n.type.isError) bad = true;
    },
  });
  return bad;
}

function declarationUsesPercentComment(src, node) {
  return src.slice(node.from, node.to).includes('%');
}

function countBlankLinesBetween(from, to, src) {
  const between = src.slice(from, to);
  const m = between.match(/\n/g);
  if (!m) return 0;
  return m.length - 1;
}

function pickLeadingComments(comments, fromPos, toPos) {
  return comments.filter((c) => c.from >= fromPos && c.to <= toPos);
}

export function formatDocument(state, opts = {}) {
  const tree = syntaxTree(state);
  const oldText = state.doc.toString();
  let newText;
  try {
    newText = formatString(oldText, tree, opts);
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('beluga formatter:', e);
    return null;
  }
  if (newText === oldText) return null;

  return {
    changes: { from: 0, to: state.doc.length, insert: newText },
  };
}

export function formatCommand(view) {
  const change = formatDocument(view.state);
  if (!change) return false;
  view.dispatch({
    ...change,
    selection: EditorSelection.cursor(Math.min(view.state.selection.main.head, change.changes.insert.length)),
    userEvent: 'format',
  });
  return true;
}
