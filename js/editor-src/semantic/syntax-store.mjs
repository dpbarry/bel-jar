import { syntaxLintTree } from '../ide/syntax-lint.mjs';
import { walkTree } from '../tree-walk.mjs';
import { DEFAULT_DOCUMENT_ID, normalizeDocumentId, STATUS } from './ids.mjs';

export function createSyntaxStore({ documentId = DEFAULT_DOCUMENT_ID } = {}) {
  let version = 0;
  let snapshot = null;

  function update(tree, doc, options = {}) {
    const normalizedDocumentId = normalizeDocumentId(options.documentId || documentId);
    const walk = walkTree(tree, doc);
    const diagnostics = syntaxLintTree(tree, doc).map((diag) => ({
      ...diag,
      sourcePhase: diag.sourcePhase || 'syntax',
      recoverability: diag.recoverability || 'recoverable',
    }));
    version++;
    snapshot = {
      documentId: normalizedDocumentId,
      version,
      tree,
      doc,
      blocks: walk.blocks,
      blockAt: walk.blockAt,
      definedNames: walk.definedNames,
      defMap: walk.defMap,
      parseDiags: walk.parseDiags,
      syntaxDiagnostics: diagnostics,
      status: diagnostics.length ? STATUS.SYNTAX_FAULT : STATUS.UNKNOWN,
    };
    return snapshot;
  }

  function nodeAt(pos) {
    if (!snapshot) return null;
    return snapshot.tree.resolveInner(pos, -1);
  }

  return {
    update,
    nodeAt,
    getSnapshot: () => snapshot,
  };
}
