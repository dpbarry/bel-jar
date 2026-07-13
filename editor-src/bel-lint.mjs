import { syntaxTree } from '@codemirror/language';
import { walkTree } from './bel-walk.mjs';
import { collectUndefinedApplicationDiags } from './bel-resolve.mjs';
import { lintQueryPragmaBounds, mergeDiagnostics as mergeDiagLists } from './bel-query-diag.mjs';
import { timeSync } from './perf/check-trace.mjs';

const _lintCache = new WeakMap();

export function syntaxLintTree(tree, doc) {
  const cached = _lintCache.get(tree);
  if (cached) return cached;
  return timeSync('syntaxLint', () => syntaxLintTreeInner(tree, doc));
}

function syntaxLintTreeInner(tree, doc) {
  const { blockAt, parseDiags } = timeSync('walkTree', () => walkTree(tree, doc));
  const queryDiags = lintQueryPragmaBounds(tree, doc);
  const appDiags = timeSync('undefAppDiags', () => collectUndefinedApplicationDiags(tree, doc));
  const merged = mergeDiagLists(mergeDiagLists(parseDiags, queryDiags), appDiags);
  for (const d of merged) {
    const hit = blockAt(d.from);
    if (hit) d.blockIndex = hit.index;
  }
  _lintCache.set(tree, merged);
  return merged;
}

export { syntaxLintTreeInner };

export function syntaxLint(view) {
  return syntaxLintTree(syntaxTree(view.state), view.state.doc);
}
