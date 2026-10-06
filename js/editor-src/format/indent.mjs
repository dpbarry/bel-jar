import { ensureSyntaxTree, indentService } from '@codemirror/language';
import { parser } from '../beluga-parser.js';
import { render } from './doc.mjs';
import { makePrinter } from './printer.mjs';
import { keptAsWritten, resolvePrintWidth } from './document-format.mjs';
import { declaresName } from '../tree-helpers.mjs';

const COMMENTS = new Set(['LineComment', 'BlockComment']);
const SENTINELS = ['%§', '|', 'x'];
const PARSE_BUDGET_MS = 500;
const CACHE_CAP = 128;
const cache = new Map();
const OUTSIDE = Symbol('outside');

const leadingWs = (s) => s.length - s.trimStart().length;

function items(node, text) {
  const out = [];
  node.cursor().iterate((n) => {
    const comment = COMMENTS.has(n.name);
    if (comment || (!n.node.firstChild && n.to > n.from)) {
      const s = text.slice(n.from, n.to);
      out.push({ key: `${n.name} ${s.replace(/\s+/g, ' ').trim()}`, from: n.from + leadingWs(s) });
    }
    return comment ? false : undefined;
  });
  return out;
}

const lineStartCol = (text, at) => {
  const bol = text.lastIndexOf('\n', at - 1) + 1;
  return /\S/.test(text.slice(bol, at)) ? null : at - bol;
};

function columns(text, inner, width) {
  const rendered = render(makePrinter(text, { printWidth: width }).pp(inner), width);
  const src = items(inner, text);
  const out = items(parser.parse(rendered).topNode, rendered);
  const cols = new Map();
  for (let i = 0, j = 0; i < src.length; i++, j++) {
    while (out[j] && out[j].key !== src[i].key && out[j].key === '| |') j++;
    if (out[j]?.key !== src[i].key) return null;
    cols.set(src[i].from, lineStartCol(rendered, out[j].from));
  }
  return cols;
}

function layout(text, width) {
  const decl = parser.parse(text).topNode.firstChild;
  const inner = decl?.name === 'Declaration' ? decl.firstChild : null;
  if (!inner) return null;
  const errors = [];
  decl.cursor().iterate((n) => { if (n.type.isError) errors.push(n.from); });
  return { to: decl.to, errors, asWritten: keptAsWritten(text, inner), cols: columns(text, inner, width) };
}

function cachedLayout(text, width) {
  const key = `${width}\0${text}`;
  if (!cache.has(key)) {
    if (cache.size >= CACHE_CAP) cache.clear();
    cache.set(key, layout(text, width));
  }
  return cache.get(key);
}

function columnAt(l, at, typing) {
  if (l && at >= l.to) return OUTSIDE;
  if (!l?.cols || (l.asWritten && !typing)) return null;
  return l.cols.get(at) ?? null;
}

const errorsUpTo = (l, at) => l ? l.errors.filter((e) => e <= at).length : 0;

/** The stand-in a new line is measured with: the first that adds no error before it, or else the first measurable. */
function sentinelColumn(text, at, width) {
  const base = errorsUpTo(cachedLayout(text, width), at - 1);
  const tries = SENTINELS.map((s) => {
    const l = cachedLayout(text.slice(0, at) + s + text.slice(at), width);
    return { col: columnAt(l, at, true), fits: errorsUpTo(l, at) <= base };
  });
  const measured = tries.filter((t) => typeof t.col === 'number');
  const pick = measured.find((t) => t.fits) ?? measured[0];
  return pick ? pick.col : tries.some((t) => t.col === OUTSIDE) ? 0 : undefined;
}

const insideBlockComment = (tree, pos) => {
  for (let n = tree.resolveInner(pos, 1); n; n = n.parent) if (n.name === 'BlockComment') return n.from < pos;
  return false;
};

/** The column the pretty-printer gives the first token of the line at `pos`; null leaves the line as written. */
function printerIndent(cx, pos) {
  const doc = cx.state.doc;
  const tree = ensureSyntaxTree(cx.state, doc.length, PARSE_BUDGET_MS);
  if (!tree) return undefined;
  if (insideBlockComment(tree, pos)) return null;
  const broken = cx.simulatedBreak === pos;
  const line = doc.lineAt(pos);
  const head = cx.state.selection.main.head;
  const typing = broken || (head >= line.from && head <= line.to);
  const decl = tree.topNode.childBefore(pos);
  if (!decl || decl.name !== 'Declaration' || !declaresName(decl.firstChild)) return typing ? undefined : null;
  const end = Math.max(decl.to, line.to);
  const text = broken
    ? `${doc.sliceString(decl.from, pos)}\n${doc.sliceString(pos, end)}`
    : doc.sliceString(decl.from, end);
  let at = pos - decl.from + (broken ? 1 : 0);
  while (text[at] === ' ' || text[at] === '\t') at++;
  const width = resolvePrintWidth();
  if (at < text.length && text[at] !== '\n') {
    const col = columnAt(cachedLayout(text, width), at, typing);
    if (col !== OUTSIDE) return col;
    return pos < decl.to || text.startsWith('%', at) ? null : 0;
  }
  return broken ? sentinelColumn(text, at, width) : undefined;
}

export const printerIndentation = indentService.of(printerIndent);
