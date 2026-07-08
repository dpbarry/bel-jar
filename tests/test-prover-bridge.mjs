// Bridge tests — the GENERAL move-generation capabilities, exercised on the honest
// lemmas the engine reasons about from types/schemas. No test here asserts a specific
// cp-lemma proof produced by hardcoded scaffolding; each checks a general mechanism:
//   • recurse-via-IH (single- and multi-arg, context-parameter, binder-extended)
//   • support-lemma application by conclusion-head match
//   • context-strengthened IH closing an impossibility goal
//   • intro at a top-level hole; theorem-decl range isolation
import {
  candidateMoves,
  recurseTexts,
  theoremUnderProof,
  theoremDeclRange,
  proveProgram,
  proveOrchestrationCode,
  stepMeta,
  stepLead,
} from '../editor-src/bel-prover-bridge.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── 1. Multi-argument IH pairing (dl_uniq shape) ─────────────────────────────
// Two decreasing sub-derivations sharing an index → the IH is applied to a
// consistent tuple. General: the checker certifies the pairing; we over-propose.
const DL = [
  'tp : type.', 'base : tp.', 'arr : tp -> tp -> tp.',
  'dl : tp -> tp -> type.',
  'd_base : dl base base.',
  "d_arr  : dl A A' -> dl B B' -> dl (arr A B) (arr A' B').",
  'eq : tp -> tp -> type.', 'refl : eq A A.',
].join('\n');
const dlDecl = [
  "rec dl_uniq : [ |- dl A A' ] -> [ |- dl A A'' ] -> [ |- eq A' A'' ] =",
  '/ total 1 /', '?', ';',
].join('\n');
const dlThm = theoremUnderProof(dlDecl);
const dlBranch = {
  goal: "[ |- eq (arr A2' B2') (arr A4' B4')]",
  meta: [
    { name: 'g', type: 'ctx' },
    { name: 'X2', type: "[ |- dl A2 A2']" },
    { name: 'X3', type: "[ |- dl B2 B2']" },
    { name: 'X4', type: "[ |- dl A2 A4']" },
    { name: 'X5', type: "[ |- dl B2 B4']" },
  ],
  ctx: [],
};
const dlRec = recurseTexts(dlBranch, dlThm, DL);
// The index-consistent pairing (X2, X4 share the left subtype A2) is proposed; the
// checker certifies it. Metavar references may carry the `[..]` identity substitution.
expect(dlRec.some((t) => /dl_uniq \[ \|- X2(\[\.\.\])?\] \[ \|- X4(\[\.\.\])?\]/.test(t)
  || /dl_uniq \[ \|- X4(\[\.\.\])?\] \[ \|- X2(\[\.\.\])?\]/.test(t)),
  `multi-arg IH pairs index-consistent sub-derivations (got ${JSON.stringify(dlRec.slice(0, 4))})`);

// ── 2. Support-lemma application (str_hyp offered from an earlier theorem) ────
const SUPPORT = [
  'name : type.',
  'tp : type.',
  'hyp : name -> tp -> type.',
  'schema ctx = some [A:tp] block x : name, h : hyp x A;',
  "rec str_hyp : (g:ctx) [g, z:name, hz:hyp z C[] |- hyp X[..] A[]] -> [g |- hyp X A[]] =",
  'fn h => ?',
  ';',
  "rec use_hyp : (g:ctx) [g, z:name, hz:hyp z C[] |- hyp X[..] A[]] -> [g |- hyp X A[]] =",
  'fn h => ?',
  ';',
].join('\n');
const useDecl = SUPPORT.slice(SUPPORT.indexOf('rec use_hyp'));
const supportMoves = candidateMoves({
  goal: '[g |- hyp X A[]]',
  meta: [{ name: 'g', type: 'ctx' }],
  ctx: [{ name: 'h', type: '[g, z:name, hz:hyp z C[] |- hyp X[..] A[]]' }],
}, SUPPORT, theoremUnderProof(useDecl));
expect(supportMoves.some((m) => m.kind === 'lemma' && m.text.includes('str_hyp [g, z:name, hz:hyp z C[] |- h]')),
  'support-lemma call is offered from an earlier theorem');

// ── 3. Context-strengthened IH closing an impossibility goal ─────────────────
// The IH applies directly (bare call, no result binding) when the goal head equals
// the theorem's bare conclusion. Works for a meta sub-derivation AND a comp one.
const linDecl = [
  'rec lin_name_must_appear : (g : nctx) [g |- linear (\\x. P[..])] -> [ |- imposs] =',
  '/ total 1 /', '?', ';',
].join('\n');
const linThm = theoremUnderProof(linDecl);
const linMeta = candidateMoves({
  goal: '[ |- imposs]',
  meta: [
    { name: 'g', type: 'nctx' },
    { name: 'X', type: '(g, y : name |- linear (\\z. P1[.., y]))' },
  ],
  ctx: [],
}, '', linThm);
expect(linMeta.some((m) => m.kind === 'fill' && /^lin_name_must_appear \[g, y ?: ?name \|- X\]$/.test(m.text)),
  'context-strengthened IH closes an imposs branch directly (meta subderiv)');
const linComp = candidateMoves({
  goal: '[ |- imposs]',
  meta: [{ name: 'g', type: 'nctx' }],
  ctx: [{ name: 'linQ', type: '[g |- linear (\\z. wait X (linQ z))]' }],
}, '', linThm);
expect(linComp.some((m) => m.kind === 'fill' && m.text === 'lin_name_must_appear [g |- linQ]'),
  'pattern-bound comp subderiv closes imposs branch directly');

// ── 3b. Strengthening IH under a binder (the str_lin l_inp shape) ─────────────
// A pattern metavar annotated `X[.., y, x]` recurses by re-binding the binder into
// the context BEFORE the strengthened variable, referencing X bare, and binding the
// result in the INSTANTIATED conclusion context (g := g, y:name):
//   let [g, y:name |- R] = str_lin [g, y:name, x:name |- X] in ?
const STRLIN = [
  'name : type.',
  'schema nctx = name;',
  'proc : type.',
  'inp : name -> (name -> name -> proc) -> proc.',
  'linear: (name -> proc) -> type.',
  'l_inp   : ({y:name} linear (\\x. P x y)) ->  linear (\\x. inp x P).',
].join('\n');
const strLinDecl2 = [
  'rec str_lin2 : (g : nctx) [g, x:name |- linear (\\y. P[.., y])] -> [g |- linear (\\y. P)] =',
  '/ total 1 /',
  'fn f => case f of',
  '| [g, x:name |- l_inp (\\y. X[.., y, x])] =>',
  '  ?',
  ';',
].join('\n');
const strLinCode2 = `${STRLIN}\n${strLinDecl2}\n`;
const strLinThm2 = theoremUnderProof(strLinDecl2);
const strLinHoleLine = strLinCode2.split('\n').findIndex((l) => l.trim() === '?') + 1;
const strLinRec = recurseTexts({
  line: strLinHoleLine,
  col: 3,
  goal: '[g |- linear (\\y. inp y (\\a. \\b. Q[.., a, b]))]',
  meta: [{ name: 'g', type: 'nctx' }],
  ctx: [],
}, strLinThm2, strLinCode2);
expect(strLinRec.some((t) => t.includes('let [g, y:name |- R] = str_lin2 [g, y:name, x:name |- X] in')),
  `strengthening IH re-binds the binder + instantiates the result context (got ${JSON.stringify(strLinRec.slice(0, 3))})`);

// ── 4. Intro at a top-level hole ─────────────────────────────────────────────
const strLinDecl = [
  "rec str_lin : (g : nctx) [g, x:name |- linear (\\y. P[.., y])] -> [g |- linear (\\y. P)] =",
  '/ total 1 /', '?', ';',
].join('\n');
const strLinThm = theoremUnderProof(strLinDecl);
const strLinRoot = candidateMoves(
  { goal: strLinThm.compType.raw, meta: [], ctx: [] },
  `name : type.\nschema nctx = name;\n\n${strLinDecl}\n`,
  strLinThm,
);
expect(strLinRoot.some((m) => m.kind === 'intro' && m.text === 'fn f => ?'),
  `str_lin root offers intro (got ${strLinRoot.map((m) => m.kind).join(',')})`);

// ── 5. theoremDeclRange isolates one decl among many ─────────────────────────
const multi = [
  "rec first : [ |- a] -> [ |- b] = fn _ => ?;",
  'rec second : [ |- c] -> [ |- d] =',
  '/ total 1 /',
  '?',
  ';',
].join('\n');
const secondRange = theoremDeclRange(multi, 'second');
expect(secondRange && secondRange.start === 2 && secondRange.end === 5,
  `theoremDeclRange isolates the second decl (got ${JSON.stringify(secondRange)})`);

// ── 6. proof-form `?` without a hole report must not false-complete ───────────
const proofDecl = 'proof silent : [ |- nat] = ? ;';
const silent = await proveProgram(proofDecl, theoremUnderProof(proofDecl), async () => ({
  ok: true,
  output: '## Type Reconstruction done ##',
}));
expect(!(silent.complete && !silent.steps.length),
  'syntactic ? without ## Holes ## must not yield a fake 0-step solve');

// ── 7. syntactic fallback at a TOP-LEVEL hole still bootstraps with intro ─────
// The FIRST check omits the hole report (the proof-form quirk); once intro is
// spliced the oracle reports holes normally. The fallback hole must carry the
// FULL comp type so intro applies (not just the conclusion → instant dead end).
const topDecl = 'rec top : [ |- a] -> [ |- b] =\n?\n;';
const holeReportingOracle = async (c) => {
  const rep = [];
  c.split('\n').forEach((ln, i) => {
    const j = ln.indexOf('?');
    if (j >= 0 && /=>/.test(ln)) {
      rep.push(`File "input.bel", line ${i + 1}, column ${j + 1}: Hole number 0, <anonymous>\nGoal: [ |- b]`);
    }
  });
  return { ok: true, output: rep.length ? '## Holes ##\n' + rep.join('\n') : '' };
};
const top = await proveProgram(topDecl, theoremUnderProof(topDecl), holeReportingOracle, { maxSteps: 3 });
expect(top.steps.length >= 1 && top.steps[0].move === 'intro',
  `fallback top-level hole offers intro (got ${JSON.stringify(top.steps.map((s) => s.move))})`);

// ── 8. a program that doesn't check → honest file-errors decline, not a blind hunt
const bad = await proveProgram(topDecl, theoremUnderProof(topDecl), async () => ({
  ok: false,
  output: 'File "input.bel", line 3, column 1:\nError: something is wrong',
}));
expect(!bad.complete && bad.stuck && bad.stuck.reason === 'file-errors' && /something is wrong/.test(bad.stuck.error),
  `unresolvable check errors decline honestly (got ${JSON.stringify(bad.stuck)})`);

// ── 9. prove orchestration trims sibling holes from the search program ─────────
const suite = [
  'tp : type.',
  'dual : tp -> tp -> type.',
  'eq : tp -> tp -> type.',
  'rec dual_sym : [ |- dual A A\'] -> [ |- dual A\' A] =',
  '/ total 1 /',
  '?',
  ';',
  'rec dual_uniq : [ |- dual A A\' ] -> [ |- dual A A\'\'] -> [ |- eq A\' A\'\'] =',
  '/ total 1 /',
  '?',
  ';',
].join('\n');
const fileStart = suite.indexOf('tp : type.');
const symStart = suite.indexOf('rec dual_sym');
const symEnd = suite.indexOf(';', symStart) + 1;
const uniqStart = suite.indexOf('rec dual_uniq');
const uniqEnd = suite.indexOf(';', uniqStart) + 1;
const slim = proveOrchestrationCode(suite, 'dual_uniq', uniqStart, uniqEnd, fileStart);
expect(!slim.includes('dual_sym'), 'orchestration drops holed sibling theorems');
expect(slim.includes('rec dual_uniq'), 'orchestration keeps the target theorem');
expect(slim.includes('tp : type.'), 'orchestration keeps suite prelude');

// ── 10. Move leads — brief prose; structured facts stay in meta facets ───────
const holeDual = { goal: '[ |- dual A B]', meta: [], ctx: [{ name: 'f', type: '[ |- dual A B]' }] };
const synthText = 'let [ |- x] = dual_sym [ |- f] in\ndual_sym [ |- x]';
const synthMv = { kind: 'synth', text: synthText };
const synthMeta = stepMeta(synthMv, synthText, holeDual);
const synthLeadStr = stepLead(synthMv, synthMeta, holeDual);
expect(synthLeadStr === '2-step chain closing dual', `synth lead: ${synthLeadStr}`);
expect(!synthLeadStr.includes('dual_sym'), 'synth lead omits rule names');
expect(synthMeta.chain.length === 2, 'synth meta records chain');

const fillMv = { kind: 'fill', text: '[ |- D⊥]' };
const fillHole = { goal: '[ |- dual A B]', meta: [], ctx: [] };
const fillMeta = stepMeta(fillMv, '[ |- D⊥]', fillHole);
expect(fillMeta.filler === '[ |- D⊥]', 'fill meta records filler');
expect(fillMeta.goalHead === 'dual', 'fill meta records goal head');
const fillLeadStr = stepLead(fillMv, fillMeta, fillHole);
expect(fillLeadStr === 'closed dual', `fill lead: ${fillLeadStr}`);
expect(!fillLeadStr.includes('D'), 'fill lead omits filler term');

const splitText = 'case f of\n| [ |- D1] =>\n  ?\n| [ |- D2] => ?';
const splitMv = { kind: 'split', scrutinee: 'f', text: splitText };
const splitMeta = stepMeta(splitMv, splitText, { goal: '[ |- dual A B]', meta: [], ctx: [{ name: 'f' }] });
expect(splitMeta.arms === 2, 'split meta records arm count');
const splitLeadStr = stepLead(splitMv, splitMeta, { goal: '[ |- dual A B]' });
expect(splitLeadStr === 'case on f', `split lead: ${splitLeadStr}`);
expect(!splitLeadStr.includes('arm'), 'split lead omits arm count');

const introText = 'fn d => mlam x => ?';
const introMv = { kind: 'intro', text: introText };
const introMeta = stepMeta(introMv, introText, { goal: '[ |- dual A B]', meta: [], ctx: [] });
expect(introMeta.introduced.length === 2 && introMeta.introduced[0] === 'd', 'intro meta records binders');
expect(stepLead(introMv, introMeta, { goal: '[ |- dual A B]' }) === "opened the goal's binders", 'intro lead');

const recurseHole = { goal: '[ |- dual A B]', meta: [], ctx: [{ name: 'Dl' }, { name: 'Dr' }] };
const recurseText = 'let [ |- l] = dual_sym [ |- Dl] in\nlet [ |- r] = dual_sym [ |- Dr] in\n[ |- D⊗ l r]';
const recurseMv = { kind: 'recurse', text: recurseText };
const recurseMeta = stepMeta(recurseMv, recurseText, recurseHole);
expect(stepLead(recurseMv, recurseMeta, recurseHole) === 'induction hypothesis', 'recurse lead');
expect(recurseMeta.uses.includes('Dl'), 'recurse meta records uses');

const impMv = { kind: 'impossible', text: 'impossible [ |- X14]' };
const impMeta = stepMeta(impMv, 'impossible [ |- X14]', { goal: '[ |- eq A B]', meta: [], ctx: [{ name: 'X14' }] });
expect(impMeta.refuted === 'X14', 'impossible meta records refuted hyp');
expect(stepLead(impMv, impMeta, { goal: '[ |- eq A B]' }) === 'refuted X14', 'impossible lead');

console.log('OK test-prover-bridge (general IH / support-lemma / intro moves)');
