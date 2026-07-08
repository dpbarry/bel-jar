import { syntaxTree } from '@codemirror/language';
import {
  TOP_LEVEL_FOLD_NODES,
  foldTopLevelDeclaration,
  foldBlockComment,
  foldPercentLineCommentRun,
  foldDeclKey,
  foldBlockCommentKey,
  foldPercentCommentKey,
  isPercentLineComment,
} from './bel-fold.mjs';

function walkFoldNodes(node, state, doc, out, seenKeys) {
  if (TOP_LEVEL_FOLD_NODES.has(node.name)) {
    const range = foldTopLevelDeclaration(node, state);
    if (range) {
      const key = foldDeclKey(doc, node);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        out.push({ key, range });
      }
    }
  } else if (node.name === 'BlockComment') {
    const range = foldBlockComment(node, state);
    if (range) {
      const key = foldBlockCommentKey(doc, node);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        out.push({ key, range });
      }
    }
  }
  for (let c = node.firstChild; c; c = c.nextSibling) {
    walkFoldNodes(c, state, doc, out, seenKeys);
  }
}

export function enumerateFoldables(state) {
  const doc = state.doc;
  const tree = syntaxTree(state);
  const out = [];
  const seenKeys = new Set();
  walkFoldNodes(tree.topNode, state, doc, out, seenKeys);

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (!isPercentLineComment(line.text)) continue;
    const range = foldPercentLineCommentRun(state, line.from);
    if (!range) continue;
    const key = foldPercentCommentKey(doc, range);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    out.push({ key, range });
  }

  return out;
}

export function foldKeyForRange(state, range) {
  for (const item of enumerateFoldables(state)) {
    if (item.range.from === range.from && item.range.to === range.to) return item.key;
  }
  return null;
}

export function matchStoredFoldKeys(state, keys) {
  if (!keys?.length) return [];
  const want = new Set(keys);
  const matched = [];
  for (const item of enumerateFoldables(state)) {
    if (!want.has(item.key)) continue;
    want.delete(item.key);
    matched.push(item);
  }
  return matched;
}

export function resolveFoldKeys(state, keys) {
  return matchStoredFoldKeys(state, keys).map((item) => item.range);
}

export function keysFromFoldedRanges(state, ranges) {
  const keys = [];
  for (const range of ranges) {
    const key = foldKeyForRange(state, range);
    if (key) keys.push(key);
  }
  return keys;
}
