// BelJar proof-search engine — fundamentals (signature parsing, totality measure,
// IH matcher). Validated on SEVERAL distinct lemma shapes, NOT one, to keep the
// reasoning general (no overfit to dual_sym). Pure; no browser, no Beluga.
import {
  parseCompType,
  parseTotality,
  boxedConclusionHead,
  inductionApplications,
  searchProof,
  stitchProof,
} from '../editor-src/bel-prover.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}
function eq(a, b, msg) {
  expect(JSON.stringify(a) === JSON.stringify(b),
    `${msg}\n  got  ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`);
}

// ── parseCompType: premises + conclusion, bracket-aware, multiple shapes ──────
// 1) A single-premise symmetric relation (dual_sym-shaped, but treated generally).
const t1 = parseCompType("[ |- dual A A'] -> [ |- dual A' A]");
eq(t1.premises.map((p) => p.kind), ['box'], 'one box premise');
eq(t1.conclusion, "[ |- dual A' A]", 'conclusion after the arrow');

// 2) Multi-premise with a leading context binder (typing-lemma-shaped).
const t2 = parseCompType('(g:ctx) [g |- tm] -> [g |- tp] -> [g |- oft]');
eq(t2.premises.map((p) => p.kind), ['ctx', 'box', 'box'], 'ctx + two box premises');
eq(t2.conclusion, '[g |- oft]', 'final conclusion of a 3-premise lemma');

// 3) Arrows INSIDE a box must not split the spine.
const t3 = parseCompType('[g |- arr A B -> C] -> [g |- C]');
eq(t3.premises.length, 1, 'arrow inside a box does not split the spine');
eq(t3.conclusion, '[g |- C]', 'conclusion past an inner-arrow premise');

// 4) Explicit Pi binder premise.
const t4 = parseCompType('{n:[ |- nat]} [ |- even n] -> [ |- odd (s n)]');
eq(t4.premises.map((p) => p.kind), ['pi', 'box'], 'pi binder + box premise');

// ── parseTotality: the recursion guard, every form ───────────────────────────
eq(parseTotality('/ total 1 /'), { kind: 'index', index: 1 }, 'positional measure');
eq(parseTotality('/ total 2 /'), { kind: 'index', index: 2 }, 'positional measure (2nd arg)');
expect(parseTotality('/ total /').kind === 'bare', 'bare total');
eq(parseTotality('/ total f x /'), { kind: 'named', name: 'x', fn: 'f' }, 'named measure f x');
// The application pattern's argument list is KEPT — decreasingBoxIndex aligns it
// against the premise spine to resolve WHICH premise decreases (spec §3).
eq(parseTotality('/ total d (tp_uniq g m t t\' d) /'),
  { kind: 'named', name: 'd', args: ['g', 'm', 't', "t'", 'd'] }, 'named measure with index list');
eq(parseTotality('/ total linP /'), { kind: 'named', name: 'linP' }, 'single-name decreasing argument');
expect(parseTotality('rec foo : T = ?') === null, 'no annotation ⇒ null (no blind recursion)');

// ── boxedConclusionHead: general head extraction ──────────────────────────────
eq(boxedConclusionHead("[ |- dual A A']"), 'dual', 'head of a boxed atom');
eq(boxedConclusionHead('[g, x:tm |- oft x T]'), 'oft', 'head past a non-empty context');
eq(boxedConclusionHead('[ |- nat]'), 'nat', 'head of a bare-context box');
expect(boxedConclusionHead('') === null, 'empty type ⇒ no head');

// ── inductionApplications: GENERAL structural-IH matching ─────────────────────
// The theorem under proof; a split introduced sub-derivations, some of which are
// strict subterms of the scrutinee (fromScrutinee:true) and share the decreasing
// premise's family head ⇒ the IH applies to exactly those.
const thm = {
  name: 'dual_sym',
  compType: parseCompType("[ |- dual A A'] -> [ |- dual A' A]"),
  totality: parseTotality('/ total 1 /'),
};
const subHyps = [
  { name: 'Dl', type: "[ |- dual A B]", fromScrutinee: true },   // a sub-derivation ⇒ IH ok
  { name: 'Dr', type: "[ |- dual C D]", fromScrutinee: true },   // another ⇒ IH ok
  { name: 'z',  type: "[ |- nat]",      fromScrutinee: true },   // wrong family ⇒ no IH
  { name: 'x',  type: "[ |- dual A B]", fromScrutinee: false },  // not a subterm ⇒ no IH (guard)
];
const apps = inductionApplications(thm, subHyps);
eq(apps, [{ onBinder: 'Dl', name: 'dual_sym' }, { onBinder: 'Dr', name: 'dual_sym' }],
  'IH applies to the same-family STRICT subterms only (structural guard)');

// A DIFFERENT theorem (typing-lemma-shaped) must work through the SAME matcher,
// proving generality — the decreasing premise is picked by the measure's index.
const thm2 = {
  name: 'oft_uniq',
  compType: parseCompType('[g |- oft M T] -> [g |- oft M T2] -> [g |- eq T T2]'),
  totality: parseTotality('/ total 1 /'),
};
const sub2 = [
  { name: 'D1', type: '[g |- oft M1 T]', fromScrutinee: true },  // matches premise-1 head `oft`
  { name: 'D2', type: '[g |- oft M2 T]', fromScrutinee: true },
];
const apps2 = inductionApplications(thm2, sub2);
eq(apps2, [{ onBinder: 'D1', name: 'oft_uniq' }, { onBinder: 'D2', name: 'oft_uniq' }],
  'same matcher generalises to a different theorem (no overfit)');

// No totality measure ⇒ matcher refuses to recurse (safety).
const thmNoTot = { name: 'f', compType: parseCompType('[ |- dual A B] -> [ |- dual B A]'), totality: null };
eq(inductionApplications(thmNoTot, subHyps), [], 'no measure ⇒ no recursion offered');

// ── searchProof + stitchProof: the tree builder over injected moves ───────────
// A GENERAL toy world: a goal is solved by `fill` if it's a "base" goal, else by
// `split` into two children (one base, one recursive that fills). The oracle
// accepts everything here (the move-generation is what we exercise). This proves
// the loop composes moves into a verified tree and stitches text correctly,
// independent of any real theorem.
function toyCtx() {
  return {
    verify: () => ({ ok: true, holes: 0 }), // oracle: accept (move-gen under test)
    moves(goal) {
      if (goal === 'BASE') {
        return [{ kind: 'fill', text: '[ |- done]', rationale: 'nullary constructor', subGoals: [] }];
      }
      if (goal === 'SPLIT') {
        return [{
          kind: 'split', rationale: 'case-analyse x',
          text: 'case x of\n| A => ?\n| B => ?',
          subGoals: [{ goal: 'BASE' }, { goal: 'BASE' }],
        }];
      }
      return []; // unknown ⇒ stuck (honest)
    },
  };
}

const r1 = searchProof('BASE', toyCtx());
expect(r1.complete, 'a fillable goal solves');
eq(r1.tree.status, 'solved', 'leaf node solved');
eq(stitchProof(r1.tree), '[ |- done]', 'stitch of a leaf = its fill text');

const r2 = searchProof('SPLIT', toyCtx());
expect(r2.complete, 'a split-into-bases goal solves');
eq(r2.tree.status, 'open', 'split node is open with solved children');
eq(r2.tree.children.map((c) => c.status), ['solved', 'solved'], 'both branches solved');
// The split move text has two `?` placeholders; stitch fills each with the
// corresponding child's term (both '[ |- done]').
eq(stitchProof(r2.tree), 'case x of\n| A => [ |- done]\n| B => [ |- done]',
   'stitch replaces each branch hole with its child term');

// Honest limits: an unknown goal with no moves is 'stuck', search reports incomplete.
const r3 = searchProof('MYSTERY', toyCtx());
expect(!r3.complete, 'unknown goal ⇒ incomplete (no silent success)');
eq(r3.tree.status, 'stuck', 'unknown goal node is stuck');
expect(r3.tree.reason === 'no-move', 'stuck node carries an honest reason');

// The oracle REJECTS: a move that does not type-check is skipped → stuck.
const rejecting = {
  verify: () => ({ ok: false }), // oracle rejects every move
  moves: () => [{ kind: 'fill', text: 'wrong', subGoals: [] }],
};
const r4 = searchProof('BASE', rejecting);
expect(!r4.complete, 'oracle-rejected move ⇒ not accepted');
eq(r4.tree.status, 'stuck', 'all moves rejected ⇒ stuck');
expect(r4.tree.reason === 'fill-rejected', 'stuck reason reflects the rejected move kind');

console.log(`OK test-prover (${n} assertions)`);
