import { checkerSnapshotFromSyntax } from './checker-snapshot.mjs';

function blocksOf(syntax) {
  if (syntax?.blocks?.length) return syntax.blocks;
  if (!syntax?.tree || !syntax?.doc) return null;
  return checkerSnapshotFromSyntax(syntax).blocks;
}

export function changedBlockIndices(prevSyntax, syntax) {
  if (!prevSyntax?.doc || !syntax?.doc) return null;
  const prev = blocksOf(prevSyntax);
  const curr = blocksOf(syntax);
  if (!prev || !curr || prev.length !== curr.length) return null;
  const changed = [];
  for (let i = 0; i < curr.length; i += 1) {
    const pb = prev[i];
    const cb = curr[i];
    const prevText = prevSyntax.doc.sliceString(pb.from, pb.to);
    const currText = syntax.doc.sliceString(cb.from, cb.to);
    if (prevText !== currText) changed.push(i);
  }
  return changed;
}

export function onlySyntaxFaultBlocksChanged(prevSyntax, syntax) {
  const changed = changedBlockIndices(prevSyntax, syntax);
  if (!changed || !changed.length) return false;
  const curr = blocksOf(syntax);
  return changed.every((i) => curr[i]?.syntaxFault);
}
