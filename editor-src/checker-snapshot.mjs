import {
  applySyntaxFaultMask,
  computeLintBlocks,
  hasSyntaxFaultBlock,
} from './bel-units.mjs';

export function checkerSnapshot(tree, doc) {
  const { blocks, blockAt } = computeLintBlocks(tree, doc);
  return {
    blocks,
    blockAt,
    code: applySyntaxFaultMask(doc.toString(), doc, blocks),
    hasSyntaxFault: hasSyntaxFaultBlock(blocks),
  };
}

export function checkerSnapshotFromSyntax(syntax) {
  if (!syntax || !syntax.tree || !syntax.doc) {
    return { blocks: [], blockAt: () => null, code: '', hasSyntaxFault: false };
  }
  return checkerSnapshot(syntax.tree, syntax.doc);
}
