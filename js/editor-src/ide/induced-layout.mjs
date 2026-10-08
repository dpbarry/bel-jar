import { EditorState } from '@codemirror/state';
import {
  IndentContext,
  getIndentUnit,
  getIndentation,
  indentString,
  syntaxTree,
} from '@codemirror/language';

// A phrase is open while its last token is still one of these. `of` and `fun`
// are bar-list headers; the rest continue, and do not grow a bar.
const FINISHED_BAR = new Set([
  'LFConstructor',
  'CompConstructor',
  'CompDestructor',
  'CaseBranch',
  'CofunctionBranch',
]);

const CTOR_EQ = new Set([
  'LFDatatypeDeclaration',
  'InductiveBody',
  'CoinductiveBody',
]);

const DECL = new Set([
  'LFDatatypeDeclaration',
  'LFDeclaration',
  'InductiveDeclaration',
  'StratifiedDeclaration',
  'CoinductiveDeclaration',
  'RecDeclaration',
  'LetDeclaration',
  'TypedefDeclaration',
  'SchemaDeclaration',
  'ProofDeclaration',
  'ModuleDeclaration',
]);

// `=` whose right-hand side is an expression, a schema, or a proof script.
const RHS = new Set([
  'RecBody',
  'RecDeclaration',
  'LetDeclaration',
  'LetExpression',
  'SchemaDeclaration',
  'SchemaBody',
  'TypedefDeclaration',
  'ProofDeclaration',
]);

const BAR_CONTEXT = new Set([
  ...FINISHED_BAR,
  ...CTOR_EQ,
  'CaseExpression',
  'CaseBody',
  'CofunctionExpression',
  'LFDeclaration',
  'InductiveDeclaration',
  'StratifiedDeclaration',
  'CoinductiveDeclaration',
  'DatatypeContinuation',
]);

const NOT_CTOR = new Set([
  'RecBody',
  'RecDeclaration',
  'SchemaDeclaration',
  'SchemaBody',
  'TypedefDeclaration',
  'LetDeclaration',
  'LetExpression',
  'ProofDeclaration',
  'ProofScript',
  'ModuleDeclaration',
]);

const CLOSERS = new Set(['and', 'end', 'in', 'then', 'else']);
const STARTERS = new Set(['fn', 'mlam', 'FN', 'case', 'fun', 'let', 'if']);
const OPEN_BRACKET = { ')': '(', ']': '[', '}': '{' };
const HEADER = /^(?:LF|datatype|inductive|stratified|coinductive)\b/;

function ready(state) {
  if (state.readOnly) return null;
  const sel = state.selection;
  if (sel.ranges.length !== 1 || !sel.main.empty) return null;
  return sel.main.head;
}

function walk(state, pos) {
  const nodes = [];
  let n = syntaxTree(state).resolveInner(pos, -1);
  for (; n; n = n.parent) nodes.push(n);
  return nodes;
}

function leadingCols(state, text) {
  let cols = 0;
  const tab = state.tabSize || 2;
  for (const ch of text) {
    if (ch === ' ') cols++;
    else if (ch === '\t') cols += tab - (cols % tab);
    else break;
  }
  return cols;
}

function lineIndent(state, pos) {
  return leadingCols(state, state.doc.lineAt(pos).text);
}

function tokenNode(state, pos, text) {
  const tree = syntaxTree(state);
  for (const [at, side] of [[pos, 1], [pos + 1, -1], [pos, -1]]) {
    if (at < 0 || at > state.doc.length) continue;
    const node = tree.resolveInner(at, side);
    if (state.doc.sliceString(node.from, node.to) === text) return node;
  }
  return null;
}

function hasRealSiblingAfter(state, node) {
  for (let sib = node.nextSibling; sib; sib = sib.nextSibling) {
    if (sib.from === sib.to) continue;
    if (!state.doc.sliceString(sib.from, sib.to).trim()) continue;
    return true;
  }
  return false;
}

function commentFollows(state, from) {
  return /^\s*(?:%|--)/.test(state.doc.sliceString(from, state.doc.length));
}

function introducer(text) {
  const t = text.trimEnd();
  if (!t) return '';
  if (/(?:=>|⇒)$/.test(t)) return 'fat';
  if (/(?:->|→|<-|←)$/.test(t)) return 'arrow';
  if (/::$/.test(t)) return 'dcolon';
  if (/(?:^|\s)of$/.test(t)) return 'of';
  if (/(?:^|\s)struct$/.test(t)) return 'struct';
  if (/(?:^|\s)fun$/.test(t)) return 'fun';
  if (/(?:^|\s)let$/.test(t)) return 'let';
  if (/[(\[{]$/.test(t)) return 'open';
  if (/=$/.test(t) && !t.endsWith('==')) return 'eq';
  return '';
}

function codeOf(line) {
  return line.text.replace(/\s+%.*$/, '').replace(/\s+$/, '');
}

function opaque(state, line, pos) {
  const code = codeOf(line).trim();
  if (!code || code.startsWith('%') || code.startsWith('--')) return true;
  for (const n of walk(state, pos)) {
    if (n.name === 'ProofScript' || n.name === 'BlockComment') return true;
    if (n.name.endsWith('Pragma')) return true;
  }
  return false;
}

function breakColumn(state, pos) {
  try {
    const cols = getIndentation(new IndentContext(state, { simulateBreak: pos }), pos);
    return typeof cols === 'number' ? cols : null;
  } catch {
    // An unfinished declaration can make the printer throw on the blank-line
    // stand-in. That is a decline: the ancestor column is used instead.
    return null;
  }
}

// The printer's column when it is at least the structural one. An unfinished
// declaration often comes back as 0, which is not a column it could name.
function choose(printed, structural) {
  if (printed == null) return structural;
  if (structural == null) return printed;
  return printed >= structural ? printed : structural;
}

function bodyColumn(state, pos) {
  const unit = getIndentUnit(state);
  const here = state.doc.lineAt(pos).number;
  for (const n of walk(state, pos)) {
    if (n.name !== 'CaseBranch' && n.name !== 'CofunctionBranch') continue;
    let arrow = null;
    for (let c = n.firstChild; c; c = c.nextSibling) if (c.name === 'FatArrow') arrow = c;
    if (arrow && pos > arrow.to) return lineIndent(state, n.from) + unit;
  }
  for (const n of walk(state, pos)) {
    if (!DECL.has(n.name)) continue;
    if (state.doc.lineAt(n.from).number === here) return null;
    return lineIndent(state, n.from) + unit;
  }
  return null;
}

function barColumn(state, pos) {
  const nodes = walk(state, pos);
  const list = nodes.find((n) => n.name === 'CaseExpression' || n.name === 'CofunctionExpression');
  if (list) return bodyColumn(state, list.from) ?? lineIndent(state, list.from);
  return bodyColumn(state, pos);
}

function declColumn(state, pos) {
  const decl = walk(state, pos).find((n) => DECL.has(n.name));
  return decl ? lineIndent(state, decl.from) : 0;
}

function wordColumn(state, pos, token) {
  const nodes = walk(state, pos);
  if (token === ';' || token === 'and') return declColumn(state, pos);
  if (token === 'end') {
    const mod = nodes.find((n) => n.name === 'ModuleDeclaration');
    return mod ? lineIndent(state, mod.from) : null;
  }
  if (token === 'in') {
    const letN = nodes.find((n) => n.name === 'LetExpression' || n.name === 'LetDeclaration');
    return letN ? lineIndent(state, letN.from) : null;
  }
  if (token === 'then' || token === 'else') {
    const iff = nodes.find((n) => n.name === 'IfExpression');
    return iff ? lineIndent(state, iff.from) : null;
  }
  if (token === '+') {
    if (!nodes.some((n) => n.name === 'SchemaDeclaration' || n.name === 'SchemaBody')) return null;
    return bodyColumn(state, pos);
  }
  if (STARTERS.has(token)) return bodyColumn(state, pos);
  if (token === '|') return barColumn(state, pos);
  if (OPEN_BRACKET[token]) return openerColumn(state, pos, token);
  return null;
}

function openerColumn(state, pos, closer) {
  const open = OPEN_BRACKET[closer];
  for (const n of walk(state, pos)) {
    const first = n.firstChild;
    if (first && state.doc.sliceString(first.from, first.to) === open)
      return lineIndent(state, first.from);
  }
  return null;
}

function leaveColumn(state, pos) {
  const nodes = walk(state, pos);
  const caseLike = nodes.some((n) =>
    n.name === 'CaseExpression' || n.name === 'CaseBody' || n.name === 'CofunctionExpression');
  if (caseLike) {
    for (const n of nodes) {
      if (n.name !== 'LetExpression') continue;
      let closed = false;
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.name === 'InKeyword' && c.from < pos) closed = true;
      }
      if (!closed) return lineIndent(state, n.from);
    }
  }
  return declColumn(state, pos);
}

function inBarList(state, pos) {
  return walk(state, pos).some((n) => BAR_CONTEXT.has(n.name));
}

function headOf(line) {
  const m = /^(\s*)(\S*)(.*)$/.exec(line.text);
  return { ws: m[1], token: m[2], rest: m[3] };
}

function replaceIndent(state, line, cols) {
  if (cols == null || cols < 0) return null;
  const cur = /^\s*/.exec(line.text)[0];
  const norm = indentString(state, cols);
  if (cur === norm) return null;
  const head = state.selection.main.head;
  const boundary = line.from + cur.length;
  const anchor = head >= boundary ? head + (norm.length - cur.length) : line.from + norm.length;
  return { from: line.from, to: boundary, insert: norm, anchor };
}

function insertBar(state, line, cols) {
  const indent = indentString(state, cols);
  const insert = `\n${indent}| `;
  let from = line.to;
  const text = line.text;
  while (from > line.from && text[from - line.from - 1] === ' ') from--;
  return { from, to: line.to, insert, anchor: from + insert.length };
}

function breakAt(state, line, cols) {
  const indent = indentString(state, cols);
  const insert = `\n${indent}`;
  let from = line.to;
  const text = line.text;
  while (from > line.from && text[from - line.from - 1] === ' ') from--;
  return { from, to: line.to, insert, anchor: from + insert.length };
}

function ctorColumn(state, pos) {
  const nodes = walk(state, pos);
  const decl = nodes.find((n) =>
    n.name === 'LFDatatypeDeclaration' || n.name === 'LFDeclaration'
    || n.name === 'InductiveDeclaration' || n.name === 'StratifiedDeclaration'
    || n.name === 'CoinductiveDeclaration');
  const structural = (decl ? lineIndent(state, decl.from) : 0) + getIndentUnit(state);
  return choose(breakColumn(state, pos), structural);
}

function listColumn(state, pos) {
  const structural = bodyColumn(state, pos) ?? lineIndent(state, pos);
  return choose(breakColumn(state, pos), structural);
}

function headerEdit(state, line, pos) {
  const trimmed = line.text.trimEnd();
  const kind = introducer(trimmed);
  if (kind === 'eq') {
    const eqAt = line.from + trimmed.length - 1;
    if (commentFollows(state, eqAt + 1)) return null;
    const eq = tokenNode(state, eqAt, '=');
    if (eq && CTOR_EQ.has(eq.parent?.name) && !hasRealSiblingAfter(state, eq))
      return insertBar(state, line, ctorColumn(state, pos));
    if (!HEADER.test(trimmed.trimStart())) return null;
    if (eq && hasRealSiblingAfter(state, eq)) return null;
    if (!/^\s*$/.test(state.doc.sliceString(eqAt + 1, state.doc.length))) return null;
    if (walk(state, eqAt).some((n) => NOT_CTOR.has(n.name))) return null;
    return insertBar(state, line, ctorColumn(state, pos));
  }
  if (kind === 'of') {
    const ofAt = line.from + trimmed.length - 2;
    if (commentFollows(state, ofAt + 2)) return null;
    const caseNode = walk(state, pos).find((n) => n.name === 'CaseExpression');
    if (!caseNode) return null;
    if (hasChild(caseNode, 'CaseBranch') || hasChild(caseNode, '|')) return null;
    return insertBar(state, line, listColumn(state, pos));
  }
  if (kind === 'fun') {
    const funAt = line.from + trimmed.length - 3;
    if (commentFollows(state, funAt + 3)) return null;
    const funNode = walk(state, pos).find((n) => n.name === 'CofunctionExpression');
    if (!funNode) return null;
    if (hasChild(funNode, 'CofunctionBranch') || hasChild(funNode, '|')) return null;
    return insertBar(state, line, listColumn(state, pos));
  }
  return null;
}

function hasChild(node, name) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === name) return true;
    if (c.name === 'CaseBody' && hasChild(c, name)) return true;
  }
  return false;
}

function pipePrefix(state, bar) {
  let at = bar.from;
  const parent = bar.parent;
  if (parent) {
    for (let c = parent.firstChild; c; c = c.nextSibling) {
      if (c.from >= bar.from) break;
      if (c.name === '|') at = c.from;
    }
  }
  return /^\s*/.exec(state.doc.lineAt(at).text)[0];
}

function finishedBarEdit(state, line) {
  const bare = codeOf(line);
  if (!bare.trim() || introducer(bare)) return null;
  const sig = line.from + bare.trimEnd().length;
  const bar = walk(state, sig).find((n) => FINISHED_BAR.has(n.name));
  if (!bar || bar.to < sig) return null;
  if (state.doc.lineAt(Math.max(bar.from, bar.to - 1)).number !== line.number) return null;
  if (braceDelimited(state, bar)) return null;
  const insert = `\n${pipePrefix(state, bar)}| `;
  let from = line.to;
  const text = line.text;
  while (from > sig && text[from - line.from - 1] === ' ') from--;
  return { from, to: line.to, insert, anchor: from + insert.length };
}

function braceDelimited(state, node) {
  for (let n = node; n; n = n.parent) {
    if (n.name !== 'CaseBody') continue;
    const first = n.firstChild;
    return !!first && state.doc.sliceString(first.from, first.to) === '{';
  }
  return false;
}

function emptyBarEdit(state, line) {
  if (!/^\s*\|\s*$/.test(line.text)) return null;
  const pipeAt = line.from + /^\s*/.exec(line.text)[0].length;
  if (!inBarList(state, pipeAt) && !inBarList(state, line.to)) return null;
  const indent = indentString(state, leaveColumn(state, pipeAt));
  return { from: line.from, to: line.to, insert: indent, anchor: line.from + indent.length };
}

function continuationColumn(state, line, pos, kind) {
  const unit = getIndentUnit(state);
  const nodes = walk(state, pos);
  if (kind === 'fat') {
    const fn = nodes.find((n) => n.name === 'FnExpression' || n.name === 'MLamExpression');
    if (fn) return lineIndent(state, fn.from);
    const br = nodes.find((n) => n.name === 'CaseBranch' || n.name === 'CofunctionBranch');
    if (br) return lineIndent(state, br.from) + unit;
    return lineIndent(state, pos) + unit;
  }
  if (kind === 'struct') {
    const mod = nodes.find((n) => n.name === 'ModuleDeclaration');
    return (mod ? lineIndent(state, mod.from) : 0) + unit;
  }
  if (kind === 'eq') {
    const eqAt = line.from + line.text.trimEnd().length - 1;
    const eq = tokenNode(state, eqAt, '=');
    if (!eq || !RHS.has(eq.parent?.name)) return null;
    return lineIndent(state, eq.parent.from) + unit;
  }
  if (kind === 'open' || kind === 'let' || kind === 'arrow' || kind === 'dcolon')
    return lineIndent(state, pos) + unit;
  return null;
}

function continuationEdit(state, line, pos) {
  const kind = introducer(line.text);
  if (!kind || kind === 'of' || kind === 'fun') return null;
  const structural = continuationColumn(state, line, pos, kind);
  const printed = breakColumn(state, pos);
  const cols = choose(printed, structural);
  if (cols == null) return null;
  if (printed === cols) return null;
  return breakAt(state, line, cols);
}

function closerToken(line) {
  const { token, rest } = headOf(line);
  if (rest.trim() !== '') return null;
  if (token === ';' || token === '+' || CLOSERS.has(token) || OPEN_BRACKET[token]) return token;
  return null;
}

function snapThenBreak(state, line, token) {
  const cols = wordColumn(state, line.to, token);
  if (cols == null) return null;
  const indent = indentString(state, cols);
  const snapped = indent + token;
  const at = line.from + snapped.length;
  const next = state.update({
    changes: { from: line.from, to: line.to, insert: snapped },
    selection: { anchor: at },
  }).state;
  const breakCols = choose(breakColumn(next, at), cols);
  const insert = `${snapped}\n${indentString(state, breakCols)}`;
  return { from: line.from, to: line.to, insert, anchor: line.from + insert.length };
}

/**
 * Enter at the end of a line. Null keeps the ordinary newline, which is also
 * how an open phrase breaks at the printer's continuation column.
 */
export function inducedEnterEdit(state) {
  const pos = ready(state);
  if (pos == null) return null;
  const line = state.doc.lineAt(pos);
  if (pos !== line.to) return null;
  if (opaque(state, line, pos)) return null;

  const closer = closerToken(line);
  if (closer) {
    const edit = snapThenBreak(state, line, closer);
    if (edit) return edit;
  }

  const cleared = emptyBarEdit(state, line);
  if (cleared) return cleared;

  const header = headerEdit(state, line, pos);
  if (header) return header;

  const finished = finishedBarEdit(state, line);
  if (finished) return finished;

  return continuationEdit(state, line, pos);
}

/**
 * The line's first token, once it is complete, at the column that token induces.
 * Word keywords wait for a space: `in` is the start of `inductive`.
 */
export function inducedTokenEdit(state) {
  const pos = ready(state);
  if (pos == null) return null;
  const line = state.doc.lineAt(pos);
  if (opaque(state, line, pos)) return null;
  const { token, rest } = headOf(line);
  if (!token || token === '|-') return null;

  const whole = rest.trim() === '';
  const spaced = /^\s/.test(rest);
  let cols = null;
  if ((token === ';' || token === '|' || token === '+' || OPEN_BRACKET[token]) && whole)
    cols = wordColumn(state, pos, token);
  else if (CLOSERS.has(token) && spaced)
    cols = wordColumn(state, pos, token);
  else if (STARTERS.has(token) && (whole || spaced))
    cols = wordColumn(state, pos, token);
  if (cols == null) return null;
  if (token === '|' && !inBarList(state, pos)) return null;
  return replaceIndent(state, line, cols);
}

/** Typing filter. `input.complete` is not a trigger, so accepting a case ghost does not reindent. */
export function inducedLayout() {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || !tr.isUserEvent('input.type')) return tr;
    const head = tr.newSelection.main.head;
    if (head > tr.newDoc.lineAt(head).from + 200) return tr;
    if (!mightSnap(tr.newDoc.lineAt(head).text)) return tr;
    const next = tr.startState.update({
      changes: tr.changes,
      selection: tr.newSelection,
      filter: false,
    }).state;
    const edit = inducedTokenEdit(next);
    if (!edit) return tr;
    return [tr, {
      changes: { from: edit.from, to: edit.to, insert: edit.insert },
      selection: { anchor: edit.anchor },
      sequential: true,
    }];
  });
}

function mightSnap(text) {
  const m = /^(\s*)(\S+)(.*)$/.exec(text);
  if (!m) return false;
  const token = m[2];
  const rest = m[3];
  if (token === '|-') return false;
  const whole = rest.trim() === '';
  if ((token === ';' || token === '|' || token === '+' || OPEN_BRACKET[token]) && whole) return true;
  if (CLOSERS.has(token) && /^\s/.test(rest)) return true;
  if (STARTERS.has(token) && (whole || /^\s/.test(rest))) return true;
  return false;
}
