import { checkerSnapshotFromSyntax } from '../checker-snapshot.mjs';

export function changedBlockIndices(prevSyntax, syntax) {
  if (!prevSyntax?.doc || !syntax?.doc) return null;
  const prev = checkerSnapshotFromSyntax(prevSyntax);
  const curr = checkerSnapshotFromSyntax(syntax);
  if (prev.blocks.length !== curr.blocks.length) return null;
  const changed = [];
  for (let i = 0; i < curr.blocks.length; i += 1) {
    const pb = prev.blocks[i];
    const cb = curr.blocks[i];
    const prevText = prevSyntax.doc.sliceString(pb.from, pb.to);
    const currText = syntax.doc.sliceString(cb.from, cb.to);
    if (prevText !== currText) changed.push(i);
  }
  return changed;
}

export function onlySyntaxFaultBlocksChanged(prevSyntax, syntax) {
  const changed = changedBlockIndices(prevSyntax, syntax);
  if (!changed || !changed.length) return false;
  const curr = checkerSnapshotFromSyntax(syntax);
  return changed.every((i) => curr.blocks[i]?.syntaxFault);
}
