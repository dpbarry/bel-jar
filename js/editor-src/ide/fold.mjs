import { firstIdentChild } from '../tree-helpers.mjs';

function spansLines(doc, from, to) {
  if (from >= to) return false;
  return doc.lineAt(from).number !== doc.lineAt(Math.max(from, to - 1)).number;
}

function foldRange(doc, from, to) {
  if (!spansLines(doc, from, to)) return null;
  return { from, to };
}

function closingSemiFrom(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === ';') return c.from;
  }
  return null;
}

function closingDotFrom(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === '.') return c.from;
  }
  return null;
}

function closingTerminatorFrom(node) {
  return closingSemiFrom(node) ?? closingDotFrom(node);
}

export const TOP_LEVEL_FOLD_NODES = new Set([
  'ModuleDeclaration',
  'InductiveDeclaration',
  'StratifiedDeclaration',
  'CoinductiveDeclaration',
  'LFDatatypeDeclaration',
  'LFDeclaration',
  'RecDeclaration',
  'SchemaDeclaration',
  'TypedefDeclaration',
  'LetDeclaration',
  'ProofDeclaration',
]);

export function foldTopLevelDeclaration(node, state) {
  const doc = state.doc;
  const from = doc.lineAt(node.from).to;
  const to = closingTerminatorFrom(node);
  if (to == null || from >= to) return null;
  return foldRange(doc, from, to);
}

export function foldBlockComment(node, state) {
  const doc = state.doc;
  if (doc.lineAt(node.from).number === doc.lineAt(node.to).number) return null;
  const text = doc.sliceString(node.from, node.to);
  let openLen = 2;
  let closeLen = 2;
  if (text.startsWith('%{{')) {
    openLen = 3;
    closeLen = 3;
  } else if (!text.startsWith('%{')) {
    return null;
  }
  if (!text.endsWith(closeLen === 3 ? '}}%' : '}%')) return null;
  return { from: node.from + openLen, to: node.to - closeLen };
}

export function isPercentLineComment(text) {
  const t = text.trimStart();
  if (!t.startsWith('%') || t.startsWith('%{')) return false;
  if (t.startsWith('%%') || t === '%') return true;
  const ch = t.charCodeAt(1);
  return ch !== 123 && ch !== 37 && ch !== 10;
}

export function percentLineCommentFoldFrom(line) {
  const text = line.text;
  const t = text.trimStart();
  const lead = text.length - t.length;
  const prefixLen = t.startsWith('%%') ? 2 : 1;
  let from = line.from + lead + prefixLen;
  const rel = from - line.from;
  if (rel < line.text.length && (line.text[rel] === ' ' || line.text[rel] === '\t')) {
    from += 1;
  }
  return from;
}

export function percentLineCommentFoldHasLeadingGap(state, from) {
  if (from <= 0) return false;
  const ch = state.doc.sliceString(from - 1, from);
  return ch === ' ' || ch === '\t';
}

export function foldPercentLineCommentRun(state, lineStart) {
  const doc = state.doc;
  const line = doc.lineAt(lineStart);
  if (!isPercentLineComment(line.text)) return null;

  let startLine = line.number;
  while (startLine > 1 && isPercentLineComment(doc.line(startLine - 1).text)) startLine -= 1;
  if (line.number !== startLine) return null;

  let endLine = startLine;
  while (endLine < doc.lines && isPercentLineComment(doc.line(endLine + 1).text)) endLine += 1;
  if (endLine === startLine) return null;

  const first = doc.line(startLine);
  const last = doc.line(endLine);
  return { from: percentLineCommentFoldFrom(first), to: last.to };
}

export function isPercentLineCommentFold(state, { from }) {
  const line = state.doc.lineAt(from);
  return isPercentLineComment(line.text) && from === percentLineCommentFoldFrom(line);
}

export function normalizeFoldLine(text) {
  return text.trim().replace(/\s+/g, ' ');
}

function declarationHeadName(node, doc) {
  const direct = firstIdentChild(node);
  if (direct) return doc.sliceString(direct.from, direct.to);
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name.endsWith('Keyword')) continue;
    const nested = firstIdentChild(c);
    if (nested) return doc.sliceString(nested.from, nested.to);
    if (c.name === 'LowerIdentifier' || c.name === 'UpperIdentifier') {
      return doc.sliceString(c.from, c.to);
    }
  }
  return null;
}

export function foldDeclKey(doc, node) {
  const name = declarationHeadName(node, doc);
  if (name) return `decl:${node.name}:${name}`;
  const line = normalizeFoldLine(doc.lineAt(node.from).text);
  return `decl:${node.name}@${line}`;
}

export { declarationHeadName };

export function foldBlockCommentKey(doc, node) {
  return `block:${normalizeFoldLine(doc.lineAt(node.from).text)}`;
}

export function foldPercentCommentKey(doc, range) {
  return `comment:${normalizeFoldLine(doc.lineAt(range.from).text)}`;
}
