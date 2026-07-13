// §7 PER-PATH DISCIPLINE (invariant 2) — the mechanics that make guards and
// state identity ANCESTOR-CHAIN-scoped instead of innermost-branch-scoped.
// Measured defect (eval_add_comm, 2026-07-12): every guard scoped to
// branchBodyBefore was laundered by a nested split — the same lemma call was
// re-accepted at three nesting depths, and junk-fact accumulation faked state
// novelty past the seen-fingerprint. All shapes below are INVENTED (no corpus
// names) per the anti-overfit law.
import { pathBodyBefore, junkFreeSig } from '../editor-src/bel-prover-bridge.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// A decl with a nested (parenthesized) case: hole A in the inner c2 arm,
// hole B in the inner c3 arm. Ancestor-arm bindings are on BOTH paths;
// the c2 arm's binding is NOT on B's path (closed sibling).
const code = [
  'rec t : [ |- foo A B] -> [ |- bar A B] =',
  '/ total d (t a b d) /',
  'fn d => case d of',
  '| [ |- c1 X] =>',
  '  let [ |- R] = lem [ |- X] in',
  '  (case [ |- X] of',
  '   | [ |- c2 Y] => let [ |- R2] = lem2 [ |- Y] in ?',
  '   | [ |- c3] => ?)',
  ';',
].join('\n');
const holeA = { line: 7, col: code.split('\n')[6].indexOf('?') + 1 };
const holeB = { line: 8, col: code.split('\n')[7].indexOf('?') + 1 };

const pathA = pathBodyBefore(code, holeA);
expect(pathA.includes('let [ |- R] = lem [ |- X] in'),
  'ancestor-arm binding is on the inner hole’s path');
expect(pathA.includes('let [ |- R2] = lem2 [ |- Y] in'),
  'own-arm binding is on the path');

const pathB = pathBodyBefore(code, holeB);
expect(pathB.includes('let [ |- R] = lem [ |- X] in'),
  'ancestor-arm binding is on the sibling hole’s path too');
expect(!pathB.includes('lem2'),
  'a CLOSED SIBLING arm’s binding is NOT on the path (sibling repeats stay legal)');

// ── junkFreeSig: state identity quotiented by regenerable facts ──────────────
const goal = '[ |- bar A1 B1]';
const structural = [
  { name: 'X', type: '( |- foo A1 B1)' },
  { name: 'd', type: '[ |- foo A B]' },
];
const base = { ...holeA, goal, meta: structural, ctx: [] };
const withDerived = {
  ...holeA,
  goal,
  meta: [...structural, { name: 'R', type: '( |- baz A1)' }, { name: 'R2', type: '( |- baz B1)' }],
  ctx: [],
};
expect(junkFreeSig(code, base) === junkFreeSig(code, withDerived),
  'call-result facts (path lets with applied RHS) are quotiented out of the signature');

const withObjMeta = {
  ...holeA,
  goal,
  meta: [...structural, { name: 'N', type: '( |- nat)' }],
  ctx: [],
};
expect(junkFreeSig(code, base) === junkFreeSig(code, withObjMeta),
  'bare object metas (index sorts, no indices) are quotiented out');

const renamed = {
  ...holeA,
  goal: '[ |- bar "i7 "i9]',
  meta: [
    { name: 'X', type: '( |- foo "i7 "i9)' },
    { name: 'd', type: '[ |- foo A B]' },
  ],
  ctx: [],
};
// positional α: A1/B1 vs "i7/"i9 map to the same canonical slots
expect(junkFreeSig(code, base) === junkFreeSig(code, renamed),
  'checker-renumbered `"`-names normalize positionally (α-invariance)');

const withStructural = {
  ...holeA,
  goal,
  meta: [...structural, { name: 'Y', type: '( |- foo A1)' }],
  ctx: [],
};
expect(junkFreeSig(code, base) !== junkFreeSig(code, withStructural),
  'a new STRUCTURAL judgment fact (pattern product) changes the signature');

console.log('OK test-prover-path-canonicity (ancestor-chain scope; junk-free state identity: derived/object-meta quotient, α-invariance, structural sensitivity)');
