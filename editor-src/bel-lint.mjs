import { syntaxTree } from '@codemirror/language';
import { walkTree } from './bel-walk.mjs';
import { lintQueryPragmaBounds, mergeDiagnostics as mergeDiagLists } from './bel-query-diag.mjs';

const _lintCache = new WeakMap();

export function syntaxLintTree(tree, doc) {
  const cached = _lintCache.get(tree);
  if (cached) return cached;
  const { blockAt, parseDiags } = walkTree(tree, doc);
  const queryDiags = lintQueryPragmaBounds(tree, doc);
  const merged = mergeDiagLists(parseDiags, queryDiags);
  for (const d of merged) {
    const hit = blockAt(d.from);
    if (hit) d.blockIndex = hit.index;
  }
  _lintCache.set(tree, merged);
  return merged;
}

export function syntaxLint(view) {
  return syntaxLintTree(syntaxTree(view.state), view.state.doc);
}
