import { syntaxTree } from '@codemirror/language';
import { linter } from '@codemirror/lint';
import { checkerSnapshot } from './checker-snapshot.mjs';
import { lintLinterOptions } from './bel-lint-presentation.mjs';

// Re-export for tests and callers that need masking without settlement.
export function checkerCodeForView(view, getCheckCode) {
  const doc = view.state.doc;
  if (typeof getCheckCode === 'function') {
    const snap = checkerSnapshot(syntaxTree(view.state), doc);
    return { code: getCheckCode(view), blocks: snap.blocks };
  }
  const snap = checkerSnapshot(syntaxTree(view.state), doc);
  return { code: snap.code, blocks: snap.blocks };
}

export function createBelugaLinter({
  getEngine = null,
  settlementTickField = null,
  delay = 400,
} = {}) {
  const ext = linter((view) => {
    if (settlementTickField) view.state.field(settlementTickField);
    const eng = typeof getEngine === 'function' ? getEngine(view) : null;
    if (!eng || typeof eng.getBelugaDiagnostics !== 'function') return [];
    return eng.getBelugaDiagnostics();
  }, lintLinterOptions({
    delay,
    needsRefresh: settlementTickField
      ? (update) => update.state.field(settlementTickField)
          !== update.startState.field(settlementTickField)
      : null,
  }));

  return ext;
}
