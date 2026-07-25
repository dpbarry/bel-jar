import {
  applySyntaxFaultMask,
  computeLintBlocks,
  hasSyntaxFaultBlock,
} from '../lint-units.mjs';

export function checkerSnapshot(tree, doc) {
  const { blocks, blockAt } = computeLintBlocks(tree, doc);
  return {
    blocks,
    blockAt,
    code: applySyntaxFaultMask(doc.toString(), doc, blocks),
    hasSyntaxFault: hasSyntaxFaultBlock(blocks),
  };
}

// Keyed on the (immutable) syntax snapshot: each keystroke builds one and it is
// consumed several times per update (fingerprint prev+next, getCheckerCode,
// settlement). Rebuilding `checkerSnapshot` — a whole-doc `toString()` + lint-block
// walk — for every consumer is the bulk of the residual per-edit cost; the
// snapshot is a pure function of `syntax`, so one build per snapshot suffices.
const _snapCache = new WeakMap();

export function checkerSnapshotFromSyntax(syntax) {
  if (!syntax || !syntax.tree || !syntax.doc) {
    return { blocks: [], blockAt: () => null, code: '', hasSyntaxFault: false };
  }
  const cached = _snapCache.get(syntax);
  if (cached) return cached;
  const snap = checkerSnapshot(syntax.tree, syntax.doc);
  _snapCache.set(syntax, snap);
  return snap;
}
