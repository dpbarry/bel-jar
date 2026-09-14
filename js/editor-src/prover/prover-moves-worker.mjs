import { candidateMoves } from './prover-candidates.mjs';
import { collectMovesAt } from './prover-moves-at.mjs';
import { setConstructorScopeDecl } from './hole-split.mjs';

globalThis.onmessage = (e) => {
  const msg = e.data || {};
  const id = msg.id;
  try {
    const thm = msg.thm;
    setConstructorScopeDecl(thm && thm.name);
    let moves = [];
    if (msg.op === 'movesAt') {
      moves = collectMovesAt(msg.hole, msg.code, thm);
    } else {
      moves = candidateMoves(msg.hole, msg.code, thm) || [];
    }
    globalThis.postMessage({ id, moves });
  } catch (err) {
    globalThis.postMessage({ id, error: String((err && err.message) || err) });
  } finally {
    setConstructorScopeDecl(null);
  }
};
