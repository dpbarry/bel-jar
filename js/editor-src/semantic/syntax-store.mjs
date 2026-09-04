import { collectParseDiagnostics, walkTree } from '../tree-walk.mjs';
import { collectUndefinedApplicationDiags } from '../name-resolve.mjs';
import { lintQueryPragmaBounds, mergeDiagnostics as mergeDiagLists } from '../ide/query-diag.mjs';
import { DEFAULT_DOCUMENT_ID, normalizeDocumentId, STATUS } from './ids.mjs';

function lastBlockDirtyRange(prev, changes) {
  if (!prev?.blocks?.length || !changes || typeof changes.touchesRange !== 'function') return null;
  if (changes.length !== prev.doc.length) return null;
  let touched = -1;
  for (let i = 0; i < prev.blocks.length; i += 1) {
    const b = prev.blocks[i];
    if (!changes.touchesRange(b.from, b.to)) continue;
    if (touched >= 0) return null;
    touched = i;
  }
  if (touched < 0) return { kind: 'none' };
  if (touched !== prev.blocks.length - 1) return null;
  const old = prev.blocks[touched];
  return {
    kind: 'last',
    oldFrom: old.from,
    oldTo: old.to,
    from: changes.mapPos(old.from, 1),
    to: changes.mapPos(old.to, -1),
  };
}

function remapDiag(d, changes) {
  const from = changes.mapPos(d.from, 1);
  const to = changes.mapPos(d.to, -1);
  if (to <= from) return null;
  return { ...d, from, to };
}

function remapKeptDiags(prevDiags, dirty, changes) {
  if (dirty.kind === 'none') {
    return prevDiags.map((d) => remapDiag(d, changes)).filter(Boolean);
  }
  const kept = [];
  for (const d of prevDiags) {
    if (d.to <= dirty.oldFrom || d.from >= dirty.oldTo) {
      const mapped = remapDiag(d, changes);
      if (mapped) kept.push(mapped);
    }
  }
  return kept;
}

export function createSyntaxStore({ documentId = DEFAULT_DOCUMENT_ID } = {}) {
  let version = 0;
  let snapshot = null;
  let lastAppDiags = null;
  let lastParseDiags = null;

  function update(tree, doc, options = {}) {
    const normalizedDocumentId = normalizeDocumentId(options.documentId || documentId);
    const walk = walkTree(tree, doc);
    version++;
    const prev = snapshot;
    const prevApp = lastAppDiags;
    const prevParse = lastParseDiags;
    lastAppDiags = null;
    lastParseDiags = null;
    const changes = options.changes || null;
    // syntaxDiagnostics is LAZY: full syntax lint (incl. the undefined-application
    // pass) runs on first read, not inside the keystroke transaction. By then the
    // symbol store has updated for this tree, so the lint's name environment is
    // the O(1) store index rather than a whole-file walk. Deterministic in
    // (tree, doc), so laziness cannot change the answer.
    let lintDiags = null;
    const parsePart = () => {
      if (lastParseDiags) return lastParseDiags;
      const dirty = lastBlockDirtyRange(prev, changes);
      if (dirty && prevParse) {
        const kept = remapKeptDiags(prevParse, dirty, changes);
        if (dirty.kind === 'none') {
          lastParseDiags = kept;
        } else {
          const fresh = collectParseDiagnostics(tree, doc, {
            blocks: walk.blocks,
            blockAt: walk.blockAt,
            range: { from: dirty.from, to: dirty.to },
          });
          lastParseDiags = kept.concat(fresh);
          lastParseDiags.sort((a, b) => a.from - b.from);
        }
      } else {
        lastParseDiags = walk.parseDiags;
      }
      return lastParseDiags;
    };
    const diagnostics = () => {
      if (!lintDiags) {
        const queryDiags = lintQueryPragmaBounds(tree, doc);
        const dirty = lastBlockDirtyRange(prev, changes);
        let appDiags;
        if (dirty && prevApp) {
          if (dirty.kind === 'none') {
            appDiags = remapKeptDiags(prevApp, dirty, changes);
          } else {
            const kept = remapKeptDiags(prevApp, dirty, changes);
            const fresh = collectUndefinedApplicationDiags(tree, doc, {
              from: dirty.from,
              to: dirty.to,
            });
            appDiags = kept.concat(fresh);
            appDiags.sort((a, b) => a.from - b.from);
          }
        } else {
          appDiags = collectUndefinedApplicationDiags(tree, doc);
        }
        lastAppDiags = appDiags;
        lintDiags = mergeDiagLists(mergeDiagLists(parsePart(), queryDiags), appDiags).map((diag) => {
          const hit = walk.blockAt(diag.from);
          return {
            ...diag,
            sourcePhase: diag.sourcePhase || 'syntax',
            recoverability: diag.recoverability || 'recoverable',
            ...(hit ? { blockIndex: hit.index } : null),
          };
        });
      }
      return lintDiags;
    };
    snapshot = {
      documentId: normalizedDocumentId,
      version,
      tree,
      doc,
      blocks: walk.blocks,
      blockAt: walk.blockAt,
      get parseDiags() { return parsePart(); },
      get definedNames() { return walk.definedNames; },
      get defMap() { return walk.defMap; },
      get syntaxDiagnostics() { return diagnostics(); },
      get status() { return diagnostics().length ? STATUS.SYNTAX_FAULT : STATUS.UNKNOWN; },
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
