// Block-schema recursion under a binder (tp_uniq's t_lam / unique3's lam case) —
// the once-honest GAP, now a GENERAL capability. The engine repackages a raw
// context extension `(g, x:tm, u:oft x A[..] |- …)` as the theorem-schema's block
// (`[g, b:block (x:tm, u:oft x _) |- X[.., b.1, b.2]]`, positional projections),
// fields read from the SCHEMA AST and aligned by TYPE-FAMILY HEAD — never by any
// hardcoded name (see memory: feedback-prover-overfit-postmortem). Companion move:
// parameter INVERSION (`let [g |- #q.u[..]] = f in`), the unique3 `#r.2` idiom.
// The honest contract survives: with NO schema to derive from, the engine must not
// fabricate a block extension.
import {
  candidateMoves,
  recurseTexts,
  theoremUnderProof,
} from '../js/editor-src/prover/prover-orchestrator.mjs';
import {
  fillCandidates,
  paramInvertCandidates,
  schemaInfo,
} from '../js/editor-src/prover/hole-split.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const BLOCK = [
  'tp : type.',
  'tm : type.',
  'app : tm -> tm -> tm.',
  'lam : tp -> (tm -> tm) -> tm.',
  'oft : tm -> tp -> type.',
  't_app : oft M (arr A B) -> oft N A -> oft (app M N) B.',
  't_lam : ({x:tm} oft x A -> oft (R x) B) -> oft (lam A R) (arr A B).',
  'eq_tp : tp -> tp -> type.',
  'refl_tp : eq_tp A A.',
  'schema tctx = some [A:tp] block (x:tm, u:oft x _);',
].join('\n');

// ── 1. POSITIVE: the schema-conformant block IH under a binder ────────────────
const decl = [
  "rec tp_uniq : (g:tctx)[g |- oft M T[]] -> [g |- oft M T'[]] -> [ |- eq_tp T T'] =",
  "/ total d (tp_uniq g m t t' d) /",
  '?',
  ';',
].join('\n');
const thm = theoremUnderProof(decl);
const code = `${BLOCK}\n${decl}`;

// Two lambda-body sub-derivations in a RAW binder-extended context, the shape a
// t_lam split + inversion exposes in cD.
const hole = {
  goal: "[ |- eq_tp T T']",
  meta: [
    { name: 'g', type: 'tctx' },
    { name: 'X', type: '(g, x:tm, u:oft x A[..] |- oft (E[.., x]) B[])' },
    { name: 'X4', type: "(g, x:tm, u:oft x A[..] |- oft (E[.., x]) B'[])" },
  ],
  ctx: [],
};
const rec = recurseTexts(hole, thm, code);
const blockCall = rec.find((t) => t.includes(':block (x:tm, u:oft x _)'));
expect(!!blockCall,
  `IH under a binder extends the context with the SCHEMA block (got ${JSON.stringify(rec.slice(0, 3))})`);
expect(/\[g, b:block \(x:tm, u:oft x _\) \|- X4?\[\.\., b\.1, b\.2\]\]/.test(blockCall),
  `binders are substituted by positional block projections (got ${JSON.stringify(blockCall)})`);
expect(/\[g, b \|- X4?\[\.\., b\.1, b\.2\]\]/.test(blockCall),
  `the second argument abbreviates the already-declared block (got ${JSON.stringify(blockCall)})`);
expect(/let \[ \|- refl_tp\] =/.test(blockCall),
  'the unique-constructor result pattern refines the equality');

// ── 2. HONEST CONTRACT: no schema ⇒ no fabricated block extension ─────────────
const closedDecl = [
  "rec cl_uniq : [ |- oft M T] -> [ |- oft M T'] -> [ |- eq_tp T T'] =",
  '/ total 1 /',
  '?',
  ';',
].join('\n');
const closedThm = theoremUnderProof(closedDecl);
const closedCode = `${BLOCK}\n${closedDecl}`;
const closedHole = {
  goal: "[ |- eq_tp T T']",
  meta: [
    { name: 'X', type: '(x:tm, u:oft x A |- oft (E[.., x]) B)' },
    { name: 'X4', type: "(x:tm, u:oft x A |- oft (E[.., x]) B')" },
  ],
  ctx: [],
};
const closedRec = recurseTexts(closedHole, closedThm, closedCode);
expect(closedRec.every((t) => !t.includes(':block')),
  `no theorem context schema ⇒ no invented block extension (got ${JSON.stringify(closedRec.slice(0, 3))})`);
expect(closedRec.every((t) => !/\bb\.\d/.test(t)),
  'no fabricated block projections without a schema to derive them from');

// ── 3. Parameter inversion (the unique3 `let [g |- #r.2] = f in` idiom) ───────
const schema = schemaInfo(BLOCK, 'tctx');
const pv = paramInvertCandidates(
  { name: 'f', type: "[g |- oft (#p.1) T'[]]" },
  schema,
  ['g', 'f', '#p'],
);
expect(pv.length === 1 && /^let \[g \|- #q\.u\[\.\.\]\] = f in$/.test(pv[0]),
  `a parameter-headed hypothesis inverts to the schema-block projection (got ${JSON.stringify(pv)})`);
// Gate: a conclusion with NO parameter mention is constructor territory — no move.
expect(paramInvertCandidates({ name: 'f', type: "[g |- oft M T'[]]" }, schema, ['g', 'f']).length === 0,
  'no parameter in the conclusion ⇒ no parameter inversion offered');

// ── 4. Refutation: the zero-branch case `impossible h` ────────────────────────
// When NO constructor result unifies with a hypothesis' indices and no parameter
// can inhabit it, the engine proposes `impossible h` (Beluga certifies emptiness).
const IMP = [
  'nat : type.',
  'z : nat.',
  's : nat -> nat.',
  'is_s : nat -> type.',
  'iss : is_s (s N).',
  'imposs : type.',
].join('\n');
const impDecl = ['rec no_zero : [ |- is_s z] -> [ |- imposs] =', '/ total 1 /', '?', ';'].join('\n');
const impMoves = candidateMoves({
  goal: '[ |- imposs]',
  meta: [],
  ctx: [{ name: 'h', type: '[ |- is_s z]' }],
}, `${IMP}\n${impDecl}`, theoremUnderProof(impDecl));
expect(impMoves.some((m) => m.kind === 'impossible' && m.text === 'impossible h'),
  `a constructor-refuted hypothesis offers the zero-branch case (got ${impMoves.map((m) => m.kind).join(',')})`);
// An inhabitable hypothesis (unique constructor unifies) inverts instead.
const okMoves = candidateMoves({
  goal: '[ |- imposs]',
  meta: [],
  ctx: [{ name: 'h', type: '[ |- is_s (s z)]' }],
}, `${IMP}\n${impDecl}`, theoremUnderProof(impDecl));
expect(!okMoves.some((m) => m.kind === 'impossible') && okMoves.some((m) => m.kind === 'invert'),
  'an inhabitable hypothesis inverts rather than refutes');

// ── 5. Computation-level constructor fill (the str_step `Res` idiom) ──────────
// A ctype goal is filled by a BARE comp-constructor application over boxed args:
// the existential Pi gets a boxed wildcard (checker infers the witness), a boxed
// premise gets the family's nullary ctor (`refl_proc`) or the branch pattern's own
// strengthened term (`[g |- βfwd]`).
const CTYPE = [
  'name : type.',
  'proc : type.',
  'fwd : name -> name -> proc.',
  'step : proc -> proc -> type.',
  'βfwd : step P P.',
  'eq_proc : proc -> proc -> type.',
  'refl_proc : eq_proc P P.',
  'hyp2 : name -> tp -> type.',
  'schema pctx = some [A:tp] block x : name, h : hyp2 x A;',
  'inductive Result : (g : pctx){P : [g ⊢ proc]}{Q : [g, x:name ⊢ proc]} → ctype =',
  "| Res : {Q' : [g ⊢ proc]}",
  "      → [g, x:name ⊢ eq_proc Q Q'[..]]",
  "      → [g ⊢ step P Q']",
  '      → Result [g ⊢ P] [g, x:name ⊢ Q]',
  ';',
].join('\n');
const stepDecl = [
  'rec str_step2 : (g : pctx) [g, x:name |- step P[..] Q] -> Result [g |- P] [g, x:name |- Q] =',
  '/ total 1 /',
  'fn s => case s of',
  '| [g, x:name |- βfwd] =>',
  '  ?',
  ';',
].join('\n');
const stepCode = `${BLOCK}\n${CTYPE}\n${stepDecl}\n`;
const stepHoleLine = stepCode.split('\n').findIndex((l) => l.trim() === '?') + 1;
const stepFills = fillCandidates({
  line: stepHoleLine,
  col: 3,
  goal: '[g |- Result [g ⊢ P] [g, x:name ⊢ Q]]',
  meta: [{ name: 'g', type: 'pctx' }],
  ctx: [],
}, stepCode);
expect(stepFills.some((t) => t === 'Res [g |- _] [g, x:name |- refl_proc] [g |- βfwd]'),
  `ctype goal yields the bare Res fill with witness/equality/strengthened-step (got ${JSON.stringify(stepFills.slice(0, 4))})`);
expect(stepFills.every((t) => !t.startsWith('[g |- Res')),
  'a comp-constructor fill is never re-boxed');

// ── 6. Term-substitution instantiation (the last substitution former) ─────────
// A binder-extended meta is usable in the shorter context by instantiating its
// slots with in-scope terms matched per-slot by family: `eq_sym [g |- E1[.., N, E2]]`.
const SUBST = [
  'exp: type.',
  'app: exp -> exp -> exp.',
  'lam: (exp -> exp) -> exp.',
  'eq: exp -> exp -> type.',
  "eq_app : eq E1 F1 -> eq E2 F2 -> eq (app E1 E2) (app F1 F2).",
  'eq_lam :  ({x : exp} eq x x -> eq (E x) (F x)) -> eq (lam (\\x. E x)) (lam (\\x. F x)).',
  'schema sctx = block x:exp, _t:eq x x;',
  'rec eq_sym : (g:sctx) [g |- eq M N] -> [g |- eq N M] =',
  'fn d => ?;',
  'rec use_it : (g:sctx) [g |- eq A B] -> [g |- eq B A] =',
  '/ total 1 /',
  '?;',
].join('\n');
const substMoves = candidateMoves({
  goal: '[g |- eq B A]',
  meta: [
    { name: 'g', type: 'sctx' },
    { name: 'E1', type: '(g, x:exp, u:eq x x |- eq (M1[.., x]) (M2[.., x]))' },
    { name: 'N', type: '(g |- exp)' },
    { name: 'E2', type: '(g |- eq N N)' },
  ],
  ctx: [],
}, SUBST, theoremUnderProof(SUBST.slice(SUBST.indexOf('rec use_it'))));
expect(substMoves.some((m) => m.kind === 'lemma' && m.text.includes('eq_sym [g |- E1[.., N, E2]]')),
  `binder-extended meta instantiated with TERMS as a lemma arg (got ${JSON.stringify(substMoves.filter((m) => m.kind === 'lemma').map((m) => m.text.split('\n')[0]).slice(0, 5))})`);

console.log('OK test-prover-block-schema (schema-driven block IH + parameter inversion + refutation + ctype fill + term-substitution instantiation)');
