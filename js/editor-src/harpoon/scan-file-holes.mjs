// Syntactic hole scan for Harpoon's project-wide goal list. Parses each file's
// Lezer tree for `?` tokens — no checker round-trip — so the panel can list
// goals across the workspace immediately.
import { isSignaturePath } from '../project-paths.mjs';
import { Text } from '@codemirror/state';
import { parser } from '../beluga-parser.js';
import { parseHolesFromTree } from '../prover/hole-report.mjs';

export function holeHostFile(name) {
  return isSignaturePath(name);
}

export function scanFileHoles(text) {
  const src = String(text ?? '');
  if (!src.trim()) return [];
  let tree;
  try { tree = parser.parse(src); } catch (_) { return []; }
  const doc = Text.of(src.replace(/\r\n/g, '\n').split('\n'));
  return parseHolesFromTree(tree, doc);
}

export function hitsFromHoles(holes) {
  return (holes || []).map((h) => ({
    hole: h,
    from: h.from,
    to: h.to,
  }));
}

// Top-level declaration span containing `pos`, from a plain text snapshot —
// the text-based twin of the view-bound declSpanAt, for files that are not
// mounted in the editor.
export function declSpanInText(text, pos) {
  const src = String(text ?? '');
  if (!src) return null;
  let tree;
  try { tree = parser.parse(src); } catch (_) { return null; }
  let node = tree.resolveInner(Math.max(0, Math.min(pos, src.length)), 1);
  while (node && node.parent && node.parent.name !== 'Program') {
    node = node.parent;
  }
  if (!node || node.name === 'Program') return null;
  return { from: node.from, to: node.to };
}

// Rec/proof MEMBER containing `pos` — the first RecBody of a mutual block, or
// a RecContinuation (`and` / `and rec`), or a standalone ProofDeclaration.
// `blockFrom`/`blockTo` cover the enclosing RecDeclaration (siblings included).
export function memberSpanFromTree(tree, pos) {
  if (!tree) return null;
  let node = tree.resolveInner(pos, 1);
  let recBody = null;
  let recDecl = null;
  let proofDecl = null;
  while (node) {
    if (node.name === 'RecBody') recBody = node;
    if (node.name === 'RecDeclaration') recDecl = node;
    if (node.name === 'ProofDeclaration') proofDecl = node;
    if (node.name === 'Program' || !node.parent) break;
    node = node.parent;
  }
  if (proofDecl) {
    return {
      from: proofDecl.from, to: proofDecl.to,
      blockFrom: proofDecl.from, blockTo: proofDecl.to,
    };
  }
  if (!recBody) {
    if (!recDecl) return null;
    return {
      from: recDecl.from, to: recDecl.to,
      blockFrom: recDecl.from, blockTo: recDecl.to,
    };
  }
  const parent = recBody.parent;
  let from = recBody.from;
  if (parent && parent.name === 'RecContinuation') from = parent.from;
  else if (recDecl) {
    for (let c = recDecl.firstChild; c; c = c.nextSibling) {
      if (c.name === 'RecKeyword') { from = c.from; break; }
    }
  }
  const blockFrom = recDecl ? recDecl.from : from;
  const blockTo = recDecl ? recDecl.to : recBody.to;
  return { from, to: recBody.to, blockFrom, blockTo };
}

export function memberSpanInText(text, pos) {
  const src = String(text ?? '');
  if (!src) return null;
  let tree;
  try { tree = parser.parse(src); } catch (_) { return declSpanInText(src, pos); }
  return memberSpanFromTree(tree, Math.max(0, Math.min(pos, src.length)))
    || declSpanInText(src, pos);
}
