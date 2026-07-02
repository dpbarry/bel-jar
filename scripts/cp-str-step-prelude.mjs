import fs from 'node:fs';
import path from 'node:path';

export function cpStrStepPrelude(root = process.cwd()) {
  const dir = path.join(root, 'library/data/case-studies/classical-processes');
  const parts = ['cp_base.bel', 'cp_linear.bel', 'cp_statics.bel', 'cp_dyn.bel']
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
  const lemmas = fs.readFileSync(path.join(dir, 'cp_lemmas.bel'), 'utf8');
  const schemaBlock = lemmas.slice(0, lemmas.indexOf('rec dual_sym'));
  const resultStart = lemmas.indexOf('% encode existentials for strengthening in reductions');
  const resultEnd = lemmas.indexOf('% strengthening on hyps');
  const resultBlock = lemmas.slice(resultStart, resultEnd);
  const stubs = [
    "rec str_step' : (g : ctx) [g, x:name, h:hyp x A[] ⊢ P[..,x] ⇛ Q[..,x]] → [g, x:name ⊢ P ⇛ Q] =",
    'fn _ => ?;',
    "rec str_equiv : (g : ctx) [g, x:name ⊢ P[..] ≡ Q] → Result' [g ⊢ P] [g, x:name ⊢ Q] =",
    'fn _ => ?;',
  ].join('\n');
  return [...parts, schemaBlock, resultBlock, stubs].join('\n\n');
}

export const strStepDecl = [
  'rec str_step : (g : ctx) [g, x:name ⊢ P[..] ⇛ Q] → Result [g ⊢ P] [g, x:name ⊢ Q] =',
  '/ total 1 /',
  '?',
  ';',
].join('\n');
