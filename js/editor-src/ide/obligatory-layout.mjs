import { Transaction } from '@codemirror/state';
import { ensureSyntaxTree, getIndentUnit, indentString, syntaxTree } from '@codemirror/language';
import { parser } from '../beluga-parser.js';
import { formatString } from '../format/document-format.mjs';

const WATCHED = new Set(['input.paste', 'input.accept']);

export function layoutUserEvent(tr) {
  const ev = tr.annotation(Transaction.userEvent);
  if (!ev) return false;
  if (WATCHED.has(ev)) return true;
  return ev === 'input.type' || ev.startsWith('input.type.');
}

/**
 * Rewrite a declaration when the edit landed on a break the printer imposes
 * even at unlimited width. Hole scaffolds often do not parse; those take the
 * same breaks locally. One undo group with the edit that caused it.
 */
export function obligatoryLayoutEdit(state, editedLines) {
  if (state.readOnly || state.selection.ranges.length !== 1) return null;
  const sel = state.selection.main;
  const tree = ensureSyntaxTree(state, state.doc.length, 50) || syntaxTree(state);
  if (opaqueAt(tree, sel.head)) return null;
  const decl = outermostDecl(tree, sel.head);
  if (!decl) return null;
  const inner = firstCodeChild(decl);
  if (!inner || inner.name === 'ProofDeclaration') return null;

  const src = state.doc.sliceString(decl.from, decl.to);
  if (risky(src)) return null;
  const baseLine = state.doc.lineAt(decl.from).number;
  const edited = editedLines || new Set([state.doc.lineAt(sel.head).number]);
  if (!mayOblige(src, baseLine, edited)) return null;

  const printed = tryPrint(src);
  let next = null;
  if (printed && structurallyDifferent(src, printed) && diffOverlaps(src, printed, baseLine, edited)) {
    next = printed;
  } else {
    const local = localFix(src, indentString(state, getIndentUnit(state)));
    if (structurallyDifferent(src, local) && diffOverlaps(src, local, baseLine, edited)) next = local;
  }
  if (next == null) return null;
  return {
    from: decl.from,
    to: decl.to,
    insert: next,
    selection: {
      anchor: mapAbs(decl.from, src, next, sel.anchor),
      head: mapAbs(decl.from, src, next, sel.head),
    },
  };
}

export function editedLineNumbers(doc, changes) {
  const lines = new Set();
  changes.iterChanges((_fromA, _toA, fromB, toB) => {
    const start = Math.max(0, Math.min(fromB, doc.length));
    const end = fromB === toB ? start : Math.max(start, Math.min(toB - 1, doc.length));
    const a = doc.lineAt(start).number;
    const b = doc.lineAt(end).number;
    for (let n = a; n <= b; n++) lines.add(n);
  });
  return lines;
}

function opaqueAt(tree, pos) {
  const at = Math.max(0, Math.min(pos, tree.topNode ? tree.topNode.to : pos));
  for (let n = tree.resolveInner(at, -1); n; n = n.parent) {
    if (n.name === 'ProofScript' || n.name === 'BlockComment') return true;
    if (n.name.endsWith('Pragma')) return true;
  }
  return false;
}

function outermostDecl(tree, pos) {
  let decl = null;
  const at = Math.max(0, pos);
  for (let n = tree.resolveInner(at, -1); n; n = n.parent) {
    if (n.name === 'Declaration') decl = n;
  }
  return decl;
}

function firstCodeChild(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name !== 'LineComment' && c.name !== 'BlockComment') return c;
  }
  return null;
}

function risky(src) {
  if (src.includes('%{{') || src.includes('}}%')) return true;
  for (const line of src.split('\n')) {
    if (line.trimStart().startsWith('--')) return true;
  }
  return false;
}

function mayOblige(src, baseLine, edited) {
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!edited.has(baseLine + i)) continue;
    if (lineObliges(lines[i], lines[i + 1] || '')) return true;
  }
  return false;
}

function lineObliges(text, next) {
  if (/^\s*(?:and\s+)?rec\b/.test(text) && bodyAfterEq(text)) return true;
  if (/\/\s*(?:total|trust)\b[^/\n]*\/[ \t]+\S/.test(text)) return true;
  if (/(?:\bof|\bfun|=)[ \t]+\|(?!-)/.test(text)) return true;
  if (/^\|(?!-)/.test(text)) return true;
  if (/^\|(?!-)/.test(next) && /(?:\bof|\bfun|=)[ \t]*$/.test(text)) return true;
  if (/^\s+;\s*$/.test(text)) return true;
  if (/;\s*$/.test(text) && !/^\s*;\s*$/.test(text) && !/^\s*(?:let|schema|typedef)\b/.test(text)) return true;
  if (/\bend\b/.test(text)) {
    const t = text.trim();
    if (t !== 'end' && t !== 'end;') return true;
  }
  return false;
}

function bodyAfterEq(line) {
  const eq = bodyEq(line);
  return eq >= 0 && /\S/.test(line.slice(eq + 1));
}

function bodyEq(line) {
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '=') continue;
    const prev = i > 0 ? line[i - 1] : '';
    const next = line[i + 1] || '';
    if (prev === '<' || prev === '=' || prev === '!' || prev === ':') continue;
    if (next === '=' || next === '>') continue;
    return i;
  }
  return -1;
}

function tryPrint(src) {
  try {
    let out = formatString(src, parser.parse(src), { printWidth: 1e9 });
    if (out.endsWith('\n') && !src.endsWith('\n')) out = out.slice(0, -1);
    return out === src ? null : out;
  } catch {
    return null;
  }
}

function localFix(src, unit) {
  const lines = src.split('\n');
  return reindentBars(splitGlued(splitTotality(splitRec(lines, unit), unit)), unit).join('\n');
}

function splitRec(lines, unit) {
  const out = [];
  for (const line of lines) {
    if (!/^\s*(?:and\s+)?rec\b/.test(line)) { out.push(line); continue; }
    const eq = bodyEq(line);
    if (eq < 0 || !/\S/.test(line.slice(eq + 1))) { out.push(line); continue; }
    const indent = /^\s*/.exec(line)[0];
    out.push(line.slice(0, eq + 1).replace(/[ \t]+$/g, ''));
    out.push(indent + unit + line.slice(eq + 1).trim());
  }
  return out;
}

function splitTotality(lines) {
  const out = [];
  const re = /^(\s*)(\/\s*(?:total|trust)\b[^/\n]*\/)[ \t]+(\S.*)$/;
  for (const line of lines) {
    const m = re.exec(line);
    if (!m) { out.push(line); continue; }
    out.push(m[1] + m[2]);
    out.push(m[1] + m[3]);
  }
  return out;
}

function splitGlued(lines) {
  const out = [];
  for (const line of lines) {
    const parts = line.replace(/(\bof|\bfun|=)[ \t]+(\|(?!-))/g, '$1\n$2').split('\n');
    for (const part of parts) out.push(part);
  }
  return out;
}

function reindentBars(lines, unit) {
  const out = [];
  for (const line of lines) {
    const m = /^[ \t]*(\|(?!-).*)$/.exec(line);
    if (!m) { out.push(line); continue; }
    const prev = lastCode(out);
    if (!prev) { out.push(line); continue; }
    const indent = /^\s*/.exec(prev)[0];
    const body = prev.trim();
    let nextIndent = null;
    if (/(?:\bof|\bfun)$/.test(body) || (body.startsWith('|') && !body.startsWith('|-'))) nextIndent = indent;
    else if (body.endsWith('=')) nextIndent = indent + unit;
    out.push(nextIndent == null ? line : nextIndent + m[1].trim());
  }
  return out;
}

function lastCode(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t || t.startsWith('%') || t.startsWith('--')) continue;
    return lines[i];
  }
  return null;
}

function normalizeLine(line) {
  const m = /^([ \t]*)(.*)$/.exec(line);
  return m[1].replace(/\t/g, '  ') + m[2].replace(/[ \t]+/g, ' ').replace(/[ \t]+$/g, '');
}

function skeletonLines(s) {
  return s.replace(/\r\n/g, '\n').replace(/\n+$/g, '').split('\n').map(normalizeLine);
}

function structurallyDifferent(a, b) {
  const left = skeletonLines(a);
  const right = skeletonLines(b);
  if (left.length !== right.length) return true;
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return true;
  return false;
}

function diffOverlaps(src, next, baseLine, edited) {
  const changed = changedSourceLines(skeletonLines(src), skeletonLines(next));
  for (const i of changed) if (edited.has(baseLine + i)) return true;
  return false;
}

function changedSourceLines(a, b) {
  const n = a.length;
  const m = b.length;
  const changed = new Set();
  if (n * m > 200000) {
    const limit = Math.max(n, m);
    for (let i = 0; i < limit; i++) if ((a[i] ?? '') !== (b[i] ?? '')) changed.add(Math.min(i, n - 1));
    return changed;
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { changed.add(i); i++; }
    else j++;
  }
  while (i < n) { changed.add(i); i++; }
  return changed;
}

function mapAbs(origin, src, next, abs) {
  if (abs < origin) return abs;
  if (abs > origin + src.length) return abs + (next.length - src.length);
  return origin + mapOffset(src, next, abs - origin);
}

function scanTokens(s) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(s))) out.push({ text: m[0], from: m.index, to: m.index + m[0].length });
  return out;
}

function nthOf(toks, i) {
  const text = toks[i].text;
  let n = 0;
  for (let k = 0; k <= i; k++) if (toks[k].text === text) n++;
  return n;
}

function findNth(toks, text, n) {
  let seen = 0;
  for (const t of toks) {
    if (t.text !== text) continue;
    seen++;
    if (seen === n) return t;
  }
  return null;
}

function mapOffset(src, next, off) {
  off = Math.max(0, Math.min(off, src.length));
  const srcToks = scanTokens(src);
  const nextToks = scanTokens(next);
  if (!srcToks.length) return Math.min(off, next.length);
  for (let i = 0; i < srcToks.length; i++) {
    const t = srcToks[i];
    if (off < t.from || off > t.to) continue;
    const u = findNth(nextToks, t.text, nthOf(srcToks, i));
    if (!u) break;
    return Math.min(u.from + (off - t.from), u.to);
  }
  const gap = gapOffset(src, next, srcToks, nextToks, off);
  if (gap != null) return gap;
  for (let i = 0; i < srcToks.length; i++) {
    if (off >= srcToks[i].from) continue;
    const u = findNth(nextToks, srcToks[i].text, nthOf(srcToks, i));
    return u ? u.from : Math.min(off, next.length);
  }
  return next.length;
}

// A cursor in the middle of a gap the reprint kept, such as the pad inside
// `[  ]`, stays that far into the gap. A gap that changed still snaps forward.
function gapOffset(src, next, srcToks, nextToks, off) {
  let prev = -1;
  let nxt = -1;
  for (let i = 0; i < srcToks.length; i++) {
    if (srcToks[i].to < off) prev = i;
    else if (srcToks[i].from > off && nxt < 0) nxt = i;
  }
  if (prev < 0 || nxt < 0) return null;
  const srcGap = src.slice(srcToks[prev].to, srcToks[nxt].from);
  if (!/^[\t ]+$/.test(srcGap)) return null;
  const uPrev = findNth(nextToks, srcToks[prev].text, nthOf(srcToks, prev));
  const uNext = findNth(nextToks, srcToks[nxt].text, nthOf(srcToks, nxt));
  if (!uPrev || !uNext || uNext.from < uPrev.to) return null;
  if (next.slice(uPrev.to, uNext.from) !== srcGap) return null;
  return uPrev.to + (off - srcToks[prev].to);
}
