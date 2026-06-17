import assert from 'node:assert/strict';
import { parser } from '../editor-src/beluga-parser.js';
import { formatString } from '../editor-src/bel-format.mjs';

const src = `rec f : [ ⊢ tm] → [ ⊢ tm] =
  let LrmRmP'Q = LR/clo (LRc/M/p [_ ⊢ _] [_ ⊢ neuR] [_ ⊢ _] LrmP'Q) in
  let LrmRmVQ = lem5-closure-red LrmRmP'Q
    (matchRpair↦* [_ ⊢ _] [_ ⊢ neuR]
      (match1↦*
        [_, blx:block(x:tm m/q A[], nx:neu x), bly:block(y:tm m/q B[], ny:neu y) ⊢ pat/pair (\\x.\\y. Q[$ρ[..], x, y])]
        [_ ⊢ stepsP'V]))
  in
  lem4-closure-exp LrmRmVQ
    (concat↦*
      (match1↦* [_ ⊢ pat/pair (\\x.\\y. Q[$ρ[..], x,y])]
        (matchRpair↦* [_ ⊢ _] [_ ⊢ neuR]
          [_, blx:block(x:tm m/q A[], nx:neu x), bly:block(y:tm m/q B[], ny:neu y) ⊢ stepsP'V]))
    [_ ⊢ ↦*/step (↦/match/cc/pair (norm/match neuR (pnorm/pair \\x.\\nx.\\y.\\ny. normV[..,<x;nx>, <y;ny>]))) ↦*/refl])
;
`;

const out = formatString(src, parser.parse(src));

assert.ok(out.includes("let LrmRmP'Q = LR/clo"), 'first let preserved');
assert.ok(/\n {2}let LrmRmVQ =/.test(out), 'second let on its own line at chain level');
assert.ok(out.includes('\n  in\n'), 'body in on its own line');
assert.ok(out.includes('\n    (matchRpair'), 'app arg break preserved');
assert.ok(!out.includes(' in let LrmRmVQ'), 'let chain must not collapse onto one line');
assert.ok(!out.includes("LrmRmP'Q (matchRpair"), 'first let rhs must not absorb second let');

console.log('OK format let sticky');
