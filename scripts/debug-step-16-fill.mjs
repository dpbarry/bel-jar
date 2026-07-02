import { readFileSync } from 'node:fs';
import { candidateMoves, spliceAtHole, theoremUnderProof } from '../editor-src/bel-prover-bridge.mjs';
import { fillCandidates, branchLetNames } from '../editor-src/bel-hole-split.mjs';
import { strStepDecl } from './cp-str-step-prelude.mjs';

function branchBodyBefore(code, hole) {
  if (!hole || !hole.line) return '';
  const lines = String(code || '').split('\n');
  const ln = lines[hole.line - 1] || '';
  let col = hole.col || 1;
  const qi = ln.indexOf('?');
  if (qi >= 0) col = qi + 1;
  let off = 0;
  for (let l = 1; l < hole.line; l += 1) off += lines[l - 1].length + 1;
  off += col - 1;
  const prefix = code.slice(0, off);
  const lastArm = Math.max(prefix.lastIndexOf('=>'), prefix.lastIndexOf('⇒'));
  return lastArm >= 0 ? prefix.slice(lastArm) : prefix;
}

let code = readFileSync('scripts/.str-step-15.bel', 'utf8');
const thm = theoremUnderProof(strStepDecl);
const h0 = { line: 264, col: 3, meta: [{ name: 'g', type: 'ctx' }], ctx: [] };
code = spliceAtHole(code, h0, candidateMoves(h0, code, thm).find((x) => x.kind === 'lemma').text);
const h1 = { line: 265, col: 3, goal: '[g |- Result [g ⊢ P] [g, x:name ⊢ Q]]', meta: [{ name: 'g', type: 'ctx' }], ctx: [] };
const body = branchBodyBefore(code, h1);
console.log('body has prime', /=\s*str_step'(?=\s)/.test(body));
const pm = /let\s+\[([\s\S]+?)\|\-\s*([A-Za-z_][A-Za-z0-9_']*)\]\s*=\s*str_step'(?=\s)/.exec(body);
console.log('prime bind', pm && pm[2]);
console.log('fills', fillCandidates(h1, code));
