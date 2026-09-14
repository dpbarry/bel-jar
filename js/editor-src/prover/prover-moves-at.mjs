import { candidateMoves, movePrefilterOk } from './prover-candidates.mjs';

/** Ranked, prefiltered moves at one hole. Pure; safe to run in a worker. */
export function collectMovesAt(hole, code, thm) {
  if (!hole) return [];
  let moves = candidateMoves(hole, code, thm) || [];
  moves = moves.filter((mv) => movePrefilterOk(mv, hole, code, { trustScope: true }));
  if (!moves.length && hole.ctx && hole.ctx.length) {
    const bare = { ...hole, ctx: [] };
    moves = (candidateMoves(bare, code, thm) || [])
      .filter((mv) => movePrefilterOk(mv, bare, code, { trustScope: true }));
  }
  return moves;
}
