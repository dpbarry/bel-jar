/**
 * How many of a file's proofs are finished. Pure: declarations, holes and a
 * failure predicate in, a tally out.
 *
 * A proof is a top-level `rec` or `proof`; a `let` is a value, not a theorem.
 * It is finished when no hole sits inside it and nothing on it failed. This is
 * the per-DECLARATION measure — the hole count is a separate fact with its own
 * segment, and the two must never be derived from each other.
 */
import { NAMESPACE } from './ids.mjs';

export const isProof = (s) => !!(s && s.isGlobal && s.namespace === NAMESPACE.REC_FUNCTION
  && s.nodeKind !== 'LetDeclaration' && s.range);

const span = (s) => s.range.to - s.range.from;

/** The innermost proof containing `pos`: a mutual `and` nests inside its block. */
function ownerOf(proofs, pos) {
  return proofs
    .filter((p) => p.range.from <= pos && pos < p.range.to)
    .reduce((best, p) => (!best || span(p) < span(best) ? p : best), null);
}

/**
 * @param declarations symbol-store declarations
 * @param holes        `{ from }` for each hole in the file
 * @param failed       `(id) => boolean`, the declaration's own check failed
 * @returns `{ total, done, unfinished: [{ id, name, from, holes, failed }] }`, in document order
 */
export function proofProgress(declarations, holes, failed) {
  const proofs = (declarations || []).filter(isProof).sort((a, b) => a.range.from - b.range.from);
  const holesIn = new Map();
  for (const h of holes || []) {
    const owner = Number.isFinite(h && h.from) ? ownerOf(proofs, h.from) : null;
    if (owner) holesIn.set(owner.id, (holesIn.get(owner.id) || 0) + 1);
  }
  const unfinished = proofs
    .map((p) => ({
      id: p.id,
      name: p.displayName || p.name,
      from: p.range.from,
      holes: holesIn.get(p.id) || 0,
      failed: !!(failed && failed(p.id)),
    }))
    .filter((p) => p.holes || p.failed);
  return { total: proofs.length, done: proofs.length - unfinished.length, unfinished };
}
