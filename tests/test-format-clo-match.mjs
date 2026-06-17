import assert from 'node:assert/strict';
import { parser } from '../editor-src/beluga-parser.js';
import { formatString } from '../editor-src/bel-format.mjs';

const src = `and rec clo-match1-⊗: (Δ:ctx) (Ψ:nctx)
  {P:[Ψ ⊢ tm K[] (⊗ A[] B[])]}
  LRc [ ⊢ ⊗ A B] [Ψ ⊢ P]
→ {Q:[Δ, a:tm K[] A[], b:tm K[] B[] ⊢ tm K'[] C[]]}
→ LogSub [Δ] $[Ψ ⊢ $ρ]
→ LR [⊢ C] [Ψ ⊢ match P (pat/pair (\\x.\\y. Q[$ρ[..], x,y]))] =
/ total 3 /
mlam P ⇒ fn LrcP ⇒ mlam Q ⇒ fn ls ⇒
let (ls : LogSub [Δ] $[Φ ⊢ $ρ]) = ls in
case LrcP of
| LRc/neu [_ ⊢ _] [_ ⊢ neuP] ⇒
  LR/clo (LRc/M/p [_ ⊢ _] [_ ⊢ neuP] [_ ⊢ _] (main [Δ, a:tm _ _, b:tm _ _ ⊢ Q]
    (wk-logsub [Δ, a:tm _ _] (wk-logsub [Δ] ls [ ⊢ _]) [ ⊢ _])))
| LRc/ifc LrP1 LrP2 LrP3 ⇒
  ?
| LRc/⊗ LrP1 LrP2 ⇒
let (Halts/c [Φ ⊢ V] [Φ ⊢ stepsP1V1] [Φ ⊢ normV1]) = prop8-halts LrP1 in
let LrV1 = lem5-closure-red LrP1 [Φ ⊢ stepsP1V1] in
let LrV2 = lem5-closure-red LrP2 [Φ ⊢ stepsP2V2] in
lem4-closure-exp LrQV1V2
  (concat↦* [Φ ⊢ ↦*/step (↦/match/K ▷/pair) ↦*/refl])
| LRc/step [_ ⊢ stepPP'] LrcP' ⇒
let LrmP'Q = clo-match1-⊗ [_ ⊢ _] LrcP' [_ ⊢ Q] ls in
lem4-closure-exp LrmP'Q [_ ⊢ ↦*/step (↦/match stepPP') ↦*/refl]
;
`;

const out = formatString(src, parser.parse(src));

assert.ok(!out.includes('⇒\n?'), '? must be indented under ⇒');
assert.ok(!out.includes('⇒\nLR/clo'), 'case body must be indented under ⇒');
assert.ok(/\| LRc\/ifc.*⇒\n {2,}\?/.test(out), '? gets branch-body indent');
assert.ok(/\| LRc\/neu.*⇒\n {2,}LR\/clo/.test(out), 'neu branch body indented');
assert.ok(out.includes('\n    let LrV1 ='), 'let in branch keeps indent');
assert.ok(!out.includes('⇒\nlet (Halts'), 'case branch let must not sit flush under ⇒');
assert.match(out, /\| LRc\/⊗.*⇒\n {4,}let \(Halts/, 'let chain in ⊗ branch indented');
assert.match(out, /\| LRc\/step.*⇒\n {4,}let LrmP'Q/, 'let in step branch indented');
assert.ok(!out.includes('fn ls ⇒ let'), 'mlam chain must not collapse let onto same line');

const srcBare = `rec f : t =
case X of
| P ⇒
?
;
`;
const outBare = formatString(srcBare, parser.parse(srcBare));
assert.match(outBare, /\| P ⇒\n {2,}\?/, '⇒ body gets indent even without source spaces');

console.log('OK format clo-match');
