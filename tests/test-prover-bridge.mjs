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
  schemaSomeVars,
  theoremUnderProof,
  theoremDeclRange,
  proveProgram,
  proveOrchestrationCode,
  withWritableRiskDominated,
  deferDominated,
  trimForCertify,
  stepMeta,
  stepLead,
} from '../js/editor-src/prover/prover-orchestrator.mjs';

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

// Phase E.6 — unused flat LF dropped from suite prelude; sibling recs untouched.
{
  const prelude = [
    'nat : type.',
    'z : nat.',
    's : nat -> nat.',
    'vec : type.',
    'vnil : vec.',
    'vcons : nat -> vec -> vec.',
    'tp : type.',
    'unit : tp.',
  ].join('\n');
  const fileBody = [
    'rec helper : [ |- nat] -> [ |- nat] =',
    'fn x => x',
    ';',
    'rec id : [ |- nat] -> [ |- nat] =',
    'fn x => ?',
    ';',
  ].join('\n');
  const fat = `${prelude}\n${fileBody}`;
  const fs = fat.indexOf('rec helper');
  const idStart = fat.indexOf('rec id');
  const idEnd = fat.indexOf(';', idStart) + 1;
  const trimmed = proveOrchestrationCode(fat, 'id', idStart, idEnd, fs);
  expect(trimmed.includes('nat : type.') && trimmed.includes('z : nat.'),
    'E.6 keeps LF families/ctors in the seed closure');
  expect(!trimmed.includes('vec : type.') && !trimmed.includes('vnil'),
    'E.6 drops unused LF families outside the seed');
  expect(!trimmed.includes('tp : type.') && !trimmed.includes('unit : tp.'),
    'E.6 drops unrelated LF (tp) when unused by the target');
  expect(trimmed.includes('rec helper'),
    'E.6 never strips complete sibling recs (lemma pool)');
  expect(trimmed.includes('rec id'), 'E.6 keeps the target theorem');
  expect(trimmed.length < fat.length, 'E.6 orchestration is strictly smaller');
}

// E.6 must keep LF deps of KEPT non-LF prelude decls (lemma pool), not only
// names free in the target — else `lin_name_must_appear : … → [ ⊢ imposs]`
// survives while `imposs : type.` is trimmed out from under it.
{
  const preludeOk = [
    'imposs : type.',
    'nat : type.',
    'z : nat.',
    'orphan : type.',
    'rec need_imposs : [ |- imposs] =',
    '[ |- z]',
    ';',
  ].join('\n');
  const fileBody = [
    'rec id : [ |- nat] -> [ |- nat] =',
    'fn x => ?',
    ';',
  ].join('\n');
  const fat = `${preludeOk}\n${fileBody}`;
  const fs = fat.indexOf('rec id');
  const idEnd = fat.indexOf(';', fs) + 1;
  const trimmed = proveOrchestrationCode(fat, 'id', fs, idEnd, fs);
  expect(trimmed.includes('imposs : type.'),
    'E.6 keeps LF named only by a kept prelude lemma');
  expect(trimmed.includes('rec need_imposs'),
    'E.6 keeps the prelude lemma itself');
  expect(!trimmed.includes('orphan : type.'),
    'E.6 still drops LF unused by target and by kept lemmas');
}

// E.6/E.7 FAIL-OPEN + real-lexer identifiers (the file-errors spike,
// 2026-07-17 sweep, 26 targets): (a) ctor names with symbol chars (`is_@`) and
// (b) `%`-comment lines INSIDE multi-line decls broke the narrow parsers, and
// unparseable meant DROPPED — load-bearing typing rules vanished and sibling
// recs went unbound. A trim is an optimization: uncertainty must KEEP.
{
  const prelude = [
    'obj : type.',
    'judge : obj -> obj -> type.',
    'j_@ : judge X X.', // symbol char in ctor name — real Beluga lexer accepts
    'j_step : judge X Y ->',
    '       % ----------',   // comment INSIDE the decl, inference-rule style
    '         judge Y X.',
    'ghost : type.',          // genuinely unused — must STILL be trimmed
    'gh1 : ghost.',
  ].join('\n');
  const fileBody = [
    'rec use : [ |- judge M N] -> [ |- judge N M] =',
    'fn x => ?',
    ';',
  ].join('\n');
  const fat = `${prelude}\n${fileBody}`;
  const fs2 = fat.indexOf('rec use');
  const useEnd = fat.indexOf(';', fs2) + 1;
  const trimmed = proveOrchestrationCode(fat, 'use', fs2, useEnd, fs2);
  expect(trimmed.includes('j_@'),
    'trim keeps symbol-char ctor names (fail-open on the real lexer)');
  expect(trimmed.includes('j_step'),
    'trim keeps multi-line decls with embedded % comments');
  expect(trimmed.includes('judge :'), 'trim keeps the cited family');
  expect(!trimmed.includes('ghost') && !trimmed.includes('gh1'),
    'trim still drops the genuinely unused family (effectiveness intact)');
}

// Phase E.7 — unused flat LF dropped from the active-file kept prefix too.
{
  const body = [
    'nat : type.',
    'z : nat.',
    's : nat -> nat.',
    'vec : type.',
    'vnil : vec.',
    'vcons : nat -> vec -> vec.',
    'rec helper : [ |- nat] -> [ |- nat] =',
    'fn x => x',
    ';',
    'rec id : [ |- nat] -> [ |- nat] =',
    'fn x => ?',
    ';',
  ].join('\n');
  const idStart = body.indexOf('rec id');
  const idEnd = body.indexOf(';', idStart) + 1;
  const trimmed = proveOrchestrationCode(body, 'id', idStart, idEnd, 0);
  expect(trimmed.includes('nat : type.') && trimmed.includes('z : nat.'),
    'E.7 keeps active-file LF in the seed closure');
  expect(!trimmed.includes('vec : type.') && !trimmed.includes('vnil'),
    'E.7 drops unused LF from the active-file prefix');
  expect(trimmed.includes('rec helper'),
    'E.7 still keeps complete sibling recs');
  expect(trimmed.includes('rec id'), 'E.7 keeps the target theorem');
}

// E.9 — certify-closure trim: certification needs the candidate's dependency
// closure, not the world (the measured timeout mechanism). Fail-open: any
// unparseable decl is kept; the target always survives; mutual blocks keep
// whole when any member is cited; genuinely unrelated recs drop.
{
  const prog = [
    'fam_a : type.',
    'mk_a : fam_a.',
    'fam_c : type.',
    'mk_c : fam_c.',
    'rec used_lemma : [ |- fam_a] -> [ |- fam_a] =',
    'fn x => x',
    ';',
    'rec unrelated : [ |- fam_c] -> [ |- fam_c] =',
    'fn x => x',
    ';',
    'rec mutA : [ |- fam_c] -> [ |- fam_c] =',
    'fn x => x',
    'and rec mutB : [ |- fam_c] -> [ |- fam_c] =',
    'fn x => x',
    ';',
    'rec tgt9 : [ |- fam_a] -> [ |- fam_a] =',
    'fn d => used_lemma d',
    ';',
  ].join('\n');
  const t = trimForCertify(prog, 'tgt9');
  expect(t && t.code.includes('rec tgt9'), 'E.9 target survives');
  expect(t.code.includes('used_lemma') && t.code.includes('fam_a : type.'),
    'E.9 cited sibling + its families kept (closure)');
  expect(!t.code.includes('rec unrelated') && !t.code.includes('mutA'),
    'E.9 uncited recs and mutual blocks dropped');
  const lines = t.code.split('\n');
  expect(/rec tgt9/.test(lines[t.targetStartLine - 1]),
    `E.9 target line range accurate (start ${t.targetStartLine}: ${lines[t.targetStartLine - 1]})`);
  // A cited mutual MEMBER keeps the whole block.
  const t2 = trimForCertify(prog.replace('used_lemma d', 'mutB d'), 'tgt9');
  expect(t2 && t2.code.includes('and rec mutB') && t2.code.includes('rec mutA'),
    'E.9 citing one mutual member keeps the whole block');
  expect(trimForCertify(prog, 'no_such_rec') === null, 'E.9 unlocatable target fails open (null)');
  // Block-form LF (`LF fam : type = | ctor : …;`) has a BARE head — citing the
  // FAMILY name (not a ctor) must keep the block (the red_rew_impl_fstepcong
  // `cong`-unbound near-miss, caught by native validation before shipping).
  const prog2 = [
    'LF bfam : type =',
    '| bmk : bfam;',
    'ghost2 : type.',
    'rec u1 : [ |- bfam] -> [ |- bfam] =', 'fn x => x', ';',
    'rec u2 : [ |- ghost2] -> [ |- ghost2] =', 'fn x => x', ';',
    'rec tgt10 : [ |- bfam] -> [ |- bfam] =', 'fn d => u1 d', ';',
  ].join('\n');
  const t3 = trimForCertify(prog2, 'tgt10');
  expect(t3 && t3.code.includes('LF bfam') && t3.code.includes('rec u1'),
    'E.9 block-form LF family cited by FAMILY name is kept (+ cited sibling)');
  expect(!t3.code.includes('ghost2') && !t3.code.includes('rec u2'),
    'E.9 unrelated block + rec still dropped');
}

// §6.2 №4 (scoped) — CHRONOLOGICAL BACKTRACKING: an accepted move that leads
// to a dead end is popped, its text joins the code-state's skip set, and the
// NEXT candidate at that hole gets its turn (unique_eval's measured pattern:
// the eager invert accepted first, the winning alternative buried behind it).
// (2026-07-19 redesign: mk_a1 is UNARY over an INDEXED family so the invert
// binds a judgment component — the original nullary/no-refinement candidates
// are now correctly refused as zero-progress no-ops by the inv-3 refute
// (its own pin below), and a bare-sort component would trip the α-regress
// exclusion (ii) instead.)
{
  const code = [
    'dx : type.',
    'kx : dx.',
    'fam_c : dx -> type.',
    'fam_a : type.',
    'mk_a1 : fam_c kx -> fam_a.',
    'fam_b : type.',
    'rec helper : [ |- fam_c kx] -> [ |- fam_b] =',
    'fn x => x',
    ';',
    'rec bttgt : [ |- fam_a] -> [ |- fam_b] =',
    '/ total 1 /',
    '?',
    ';',
  ].join('\n');
  const decl = code.slice(code.indexOf('rec bttgt'));
  const report = (src, goal, ctxLines) => {
    let ln = 1; let col = 1;
    src.split('\n').forEach((l, i) => { const j = l.indexOf('?'); if (j >= 0 && ln === 1 && i > src.split('\n').findIndex((x) => /rec bttgt/.test(x))) { ln = i + 1; col = j + 1; } });
    return {
      ok: true,
      output: ['## Holes ##', `File "input.bel", line ${ln}, column ${col}: Hole number 0, <anonymous>`,
        'Computation context:', ...ctxLines, `Goal: ${goal}`].join('\n'),
    };
  };
  let first = true;
  const oracle = async (src) => {
    if (first) { first = false; return { ok: true, output: '## Type Reconstruction done ##' }; }
    const body = src.slice(src.indexOf('rec bttgt'));
    if (/=>\s*\n?\s*\?/.test(body) && /\bfn\b/.test(body) && !/let/.test(body) && !/case/.test(body)) {
      return report(src, '[ |- fam_b]', ['x : [ |- fam_a]']); // intro accepted
    }
    // Candidate A: the unique INVERT on x — binds the component X1 (real
    // progress), certifies, then every continuation under it rejects (the
    // dead end that must be POPPED, not terminal).
    const mA = /let \[ \|- mk_a1 ([^\s\]]+)\] = x in\s*\n?\s*\?\s*\n;/.exec(body);
    if (mA) {
      return report(src, '[ |- fam_b]', ['x : [ |- fam_a]', `${mA[1]} : [ |- fam_c kx]`]);
    }
    // Candidate B (after backtracking): the SPLIT on x — its arm binds a
    // component and the arm's helper-fill closes the branch. Only accepted
    // as the TOP move (never under the abandoned invert).
    const underInvert = /let \[ \|- mk_a1/.test(body);
    const inArm = !underInvert && /case x of[\s\S]*\?/.test(body);
    if (inArm) {
      const mP = /case x of\s*\|\s*\[ \|- mk_a1 ([^\s\]]+)\]/.exec(body);
      if (mP) return report(src, '[ |- fam_b]', ['x : [ |- fam_a]', `${mP[1]} : [ |- fam_c kx]`]);
    }
    if (!underInvert && /case x of[\s\S]*helper/.test(body) && !/\?/.test(body)) {
      return { ok: true, output: '' }; // arm closed by the helper fill — complete
    }
    return { ok: false, output: 'File "input.bel", line 1, column 1:\nError: rejected' };
  };
  const r = await proveProgram(code, theoremUnderProof(decl), oracle, { maxSteps: 25, certifyTrim: false });
  expect(r.complete === true,
    `backtracking recovers the buried alternative (stuck=${r.stuck && r.stuck.reason} steps=${(r.steps || []).map((s) => s.move).join(',')})`);
  expect((r.steps || []).some((s) => s.move === 'split') && !(r.steps || []).some((s) => /^let \[ \|- mk_a1/.test(s.text || '')),
    'the abandoned invert is not in the final step list');
}

// Inv-3 ZERO-PROGRESS budget (2026-07-19) — a certified move whose successor
// hole carries the SAME junk-free signature re-poses the identical obligation
// (the batch-09 eval_det runaway: 80 junk `let [ |- refl] = det X X in`
// acceptances, zero backtracks). NOT a hard refusal — today's synth does not
// regenerate every load-bearing let (eqfun measured) — but a PATH-scoped
// budget: a few no-ops are afforded, then the chain dies. The stub offers an
// endless supply of certifying no-ops (six distinct helper lemmas — distinct
// callees evade the 2-lemma chain cap via interleaved nullary inverts on
// three premises); the run must refuse the overflow and never fake a proof.
{
  const helpers = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  const code = [
    'fam_a : type.',
    'mk_a1 : fam_a.',
    'fam_b : type.',
    ...helpers.flatMap((h) => [
      `rec ${h} : [ |- fam_a] -> [ |- fam_b] =`,
      'fn x => x',
      ';',
    ]),
    'rec zptgt : [ |- fam_a] -> [ |- fam_a] -> [ |- fam_a] -> [ |- fam_b] =',
    '/ total 1 /',
    '?',
    ';',
  ].join('\n');
  const decl = code.slice(code.indexOf('rec zptgt'));
  const baseCtx = ['xa : [ |- fam_a]', 'xb : [ |- fam_a]', 'xc : [ |- fam_a]'];
  const report = (src, goal, ctxLines) => {
    let ln = 1; let col = 1;
    src.split('\n').forEach((l, i) => { const j = l.indexOf('?'); if (j >= 0 && ln === 1 && i > src.split('\n').findIndex((x) => /rec zptgt/.test(x))) { ln = i + 1; col = j + 1; } });
    return {
      ok: true,
      output: ['## Holes ##', `File "input.bel", line ${ln}, column ${col}: Hole number 0, <anonymous>`,
        'Computation context:', ...ctxLines, `Goal: ${goal}`].join('\n'),
    };
  };
  let first = true;
  const oracle = async (src) => {
    if (first) { first = false; return { ok: true, output: '## Type Reconstruction done ##' }; }
    const body = src.slice(src.indexOf('rec zptgt'));
    if (/=>\s*\n?\s*\?/.test(body) && /\bfn\b/.test(body) && !/let/.test(body)) {
      return report(src, '[ |- fam_b]', baseCtx);
    }
    // Every nullary invert and every helper-let CERTIFIES with a state-
    // identical report (derived results excluded from the signature) — an
    // endless certifying no-op supply.
    const binds = [];
    const reB = /let \[ \|- ([^\s\]]+)\] = h\d[^\n]*in\b/g;
    let mm;
    while ((mm = reB.exec(body))) binds.push(`${mm[1]} : [ |- fam_b]`);
    if (/\?/.test(body)) {
      return report(src, '[ |- fam_b]', [...baseCtx, ...binds]);
    }
    return { ok: false, output: 'File "input.bel", line 1, column 1:\nError: rejected' };
  };
  const r = await proveProgram(code, theoremUnderProof(decl), oracle, {
    maxSteps: 30, certifyTrim: false, collectTrace: true, triedCap: 80,
  });
  expect(r.complete === false,
    'no-op acceptances cannot fake a proof');
  const zp = (r.trace || []).flatMap((t) => t.tried || [])
    .filter((c) => c.verdict === 'guard' && /zero-progress budget/.test(c.reason || ''));
  expect(zp.length >= 1,
    `the no-op overflow is refused by the zero-progress budget (got ${zp.length} refusals)`);
}

// §6.2 №4 (extension, 2026-07-18; reshaped 2026-07-19 for the zero-progress
// refute) — a SEARCH-BOUND dead end backtracks like a no-move (the bound
// truncated that PATH, not the tree; aborting buried live alternatives —
// measured on unique_eval). The bounded leaf taints the run: if the tree then
// exhausts without a proof the verdict is an honest `search-bound`, never a
// no-move, and never a NO-CUT-FREE-PROOF certificate. The bound is tripped
// for real: inverting x by the 5-ary mk_a5 binds five fam_c components
// (source-writable pattern binders) against sibling `pairup`'s two fam_c
// premises ⇒ 20 distinct saturation tuples > MAX_PRODUCTS at the deep hole;
// the root hole has zero fam_c facts, so scenario 2 pins the final
// no-move → search-bound override exactly.
{
  const code = [
    'dx : type.',
    'kx : dx.',
    'fam_c : dx -> type.',
    'fam_a : type.',
    'mk_a5 : fam_c kx -> fam_c kx -> fam_c kx -> fam_c kx -> fam_c kx -> fam_a.',
    'fam_b : type.',
    'fam_d : type.',
    'fam_e : type.',
    'rec pairup : [ |- fam_c kx] -> [ |- fam_c kx] -> [ |- fam_d] =',
    'fn x => fn y => x',
    ';',
    'rec helper : [ |- fam_c kx] -> [ |- fam_b] =',
    'fn x => x',
    ';',
    'rec sbtgt : [ |- fam_a] -> [ |- fam_b] =',
    '/ total 1 /',
    '?',
    ';',
  ].join('\n');
  const decl = code.slice(code.indexOf('rec sbtgt'));
  const report = (src, goal, ctxLines) => {
    let ln = 1; let col = 1;
    src.split('\n').forEach((l, i) => { const j = l.indexOf('?'); if (j >= 0 && ln === 1 && i > src.split('\n').findIndex((x) => /rec sbtgt/.test(x))) { ln = i + 1; col = j + 1; } });
    return {
      ok: true,
      output: ['## Holes ##', `File "input.bel", line ${ln}, column ${col}: Hole number 0, <anonymous>`,
        'Computation context:', ...ctxLines, `Goal: ${goal}`].join('\n'),
    };
  };
  const mkOracle = (acceptSplit) => {
    let first = true;
    return async (src) => {
      if (first) { first = false; return { ok: true, output: '## Type Reconstruction done ##' }; }
      const body = src.slice(src.indexOf('rec sbtgt'));
      const underInvert = /let \[ \|- mk_a5/.test(body);
      if (/=>\s*\n?\s*\?/.test(body) && !/let/.test(body) && !/case/.test(body)) {
        return report(src, '[ |- fam_b]', ['x : [ |- fam_a]']); // intro accepted
      }
      // Candidate A: the bare invert on x binds five fam_c components (real
      // progress — accepted) whose 20 pairup tuples blow the saturation
      // budget at its successor: a searchBounded leaf where everything else
      // rejects.
      const mA = /let \[ \|- mk_a5 ([^\]]+)\] = x in\s*\n?\s*\?\s*\n;/.exec(body);
      if (mA) {
        const comps = mA[1].trim().split(/\s+/).map((n) => `${n} : [ |- fam_c kx]`);
        // fam_e has no producer, so synth cannot close — it exhausts through
        // the 20-tuple pairup saturation and surfaces the bound.
        return report(src, '[ |- fam_e]', ['x : [ |- fam_a]', ...comps]);
      }
      if (underInvert) {
        return { ok: false, output: 'File "input.bel", line 1, column 1:\nError: rejected' };
      }
      // Candidate B (reachable only if the bounded leaf BACKTRACKS): the
      // SPLIT on x — its arm binds the components, and the arm closes by the
      // helper fill.
      if (acceptSplit && /case x of[\s\S]*\?/.test(body)) {
        const mP = /case x of\s*\|\s*\[ \|- mk_a5 ([^\]]+)\]/.exec(body);
        if (mP) {
          const comps = mP[1].trim().split(/\s+/).map((n) => `${n} : [ |- fam_c kx]`);
          return report(src, '[ |- fam_b]', ['x : [ |- fam_a]', ...comps]);
        }
      }
      if (acceptSplit && /case x of[\s\S]*helper/.test(body) && !/\?/.test(body)) {
        return { ok: true, output: '' }; // arm closed by the helper fill — complete
      }
      return { ok: false, output: 'File "input.bel", line 1, column 1:\nError: rejected' };
    };
  };
  const r1 = await proveProgram(code, theoremUnderProof(decl), mkOracle(true), { maxSteps: 40, certifyTrim: false });
  expect(r1.complete === true,
    `search-bound leaf backtracks to the buried alternative (stuck=${r1.stuck && r1.stuck.reason} steps=${(r1.steps || []).map((s) => s.move).join(',')})`);
  const r2 = await proveProgram(code, theoremUnderProof(decl), mkOracle(false), { maxSteps: 40, certifyTrim: false });
  expect(r2.complete === false && r2.stuck && r2.stuck.reason === 'search-bound',
    `tree with a bounded leaf reports search-bound, never no-move (got ${r2.stuck && r2.stuck.reason})`);
  expect(!(r2.stuck && r2.stuck.noCutFree),
    'no exhaustion certificate survives a bounded leaf');
}

// P17 (2026-07-18) — a NULLARY ctor arm whose result DEFINITELY rigid-clashes
// the scrutinee's indices is never emitted: the checker does not reject such
// an arm — a bare-identifier pattern whose ctor cannot type elaborates as a
// fresh catch-all VARIABLE binder, a certifying arm that re-poses the WHOLE
// pre-split obligation (natval_dont_step's wander fuel). Flexible indices
// keep every arm (fail-open).
{
  const code = [
    'd : type.',
    'k1 : d.',
    'k2 : d.',
    'rel : d -> type.',
    'r_one : rel k1.',
    'r_oneb : rel k1.',
    'r_two : rel k2.',
    'rec p17tgt : [ |- rel k1] -> [ |- d] =',
    '/ total 1 /', '?', ';',
  ].join('\n');
  const p17thm = theoremUnderProof(code.slice(code.indexOf('rec p17tgt')));
  const mv = candidateMoves({
    goal: '[ |- d]',
    meta: [],
    ctx: [{ name: 'x', type: '[ |- rel k1]' }],
  }, code, p17thm);
  const splits = mv.filter((m) => m.kind === 'split' && /case x of/.test(m.text)); // GENERAL: move-kind tag
  expect(splits.length > 0 && splits.every((m) => /r_one\b/.test(m.text) && !/r_two/.test(m.text)),
    `rigid-clash nullary arm dropped from split (got ${splits.map((m) => m.text.replace(/\n/g, ' ').slice(0, 80)).join(' || ')})`);
  const mv2 = candidateMoves({
    goal: '[ |- d]',
    meta: [{ name: 'N', type: '( |- d)' }],
    ctx: [{ name: 'x', type: '[ |- rel N]' }],
  }, code, p17thm);
  const splits2 = mv2.filter((m) => m.kind === 'split' && /case x of/.test(m.text)); // GENERAL: move-kind tag
  expect(splits2.length > 0 && splits2.some((m) => /r_one\b/.test(m.text) && /r_two/.test(m.text)),
    'flexible scrutinee index keeps every nullary arm (fail-open)');
}

// Comment-aware schema scanning (2026-07-18) — a COMMENTED-OUT alternative
// schema declaration must not be scanned as real: eq-proof-tuple's
// `% schema w = some [x:exp] eq x x;` made schemaSomeVars return ['x'] for the
// LIVE block schema, eraseSomeVars rewrote its own field references to
// `eq _ _`, and every block-extension IH call failed "Expression is not
// closed". Scanners obey the same law as trims (P5): parse comment-free text.
{
  const code = [
    'tmx : type.',
    'eqx : tmx -> tmx -> type.',
    '% schema wx = some [y:tmx] eqx y y;',
    'schema wx = block y:tmx, _u:eqx y y;',
  ].join('\n');
  expect(schemaSomeVars(code, 'wx').length === 0,
    `commented-out some-schema is not scanned (got [${schemaSomeVars(code, 'wx')}])`);
  const code2 = [
    'tmx : type.',
    'eqx : tmx -> tmx -> type.',
    'schema wx = some [a:tmx] block y:tmx, _u:eqx y a;',
  ].join('\n');
  expect(schemaSomeVars(code2, 'wx').join(',') === 'a',
    `live some-schema still scanned (got [${schemaSomeVars(code2, 'wx')}])`);
}

// E.9 wire-up — rejection scans certify against the trimmed closure (small
// programs); an acceptance re-runs the FULL program (bookkeeping coordinates);
// certifyTrim:false opts out entirely (the native oracle's cost model).
{
  const pad = [];
  for (let i = 0; i < 6; i += 1) {
    pad.push(`padfam${i} : type.`, `padmk${i} : padfam${i}.`,
      `rec padlemma${i} : [ |- padfam${i}] -> [ |- padfam${i}] =\nfn x => x\n;`);
  }
  const decl = 'rec tgt9w : [ |- fam_a] -> [ |- fam_a] =\n/ total 1 /\n?\n;';
  const code = ['fam_a : type.', 'mk_a : fam_a.', ...pad, decl].join('\n');
  const mkOracle = (sizes) => {
    let first = true;
    return async (src) => {
      sizes.push(src.length);
      if (first) {
        first = false;
        let ln = 1; let col = 1;
        src.split('\n').forEach((l, i) => { const j = l.indexOf('?'); if (j >= 0 && ln === 1) { ln = i + 1; col = j + 1; } });
        return {
          ok: true,
          output: ['## Holes ##', `File "input.bel", line ${ln}, column ${col}: Hole number 0, <anonymous>`, 'Goal: [ |- fam_a]'].join('\n'),
        };
      }
      // accept any hole-free target body; reject the rest at the target's line
      if (/tgt9w[\s\S]*?=[\s\S]*?mk_a/.test(src) && !/\?/.test(src.slice(src.indexOf('tgt9w')))) {
        return { ok: true, output: '' };
      }
      const tl = src.split('\n').findIndex((l) => /rec tgt9w/.test(l)) + 2;
      return { ok: false, output: `File "input.bel", line ${tl}, column 1:\nError: rejected` };
    };
  };
  const sizesOn = [];
  const rOn = await proveProgram(code, theoremUnderProof(decl), mkOracle(sizesOn), { maxSteps: 6 });
  expect(rOn.complete === true, `E.9 wire: still completes with trim on (stuck=${rOn.stuck && rOn.stuck.reason})`);
  const full = code.length;
  expect(sizesOn.some((s) => s < full * 0.8),
    `E.9 wire: some certifies ran against the TRIMMED closure (sizes ${JSON.stringify(sizesOn)})`);
  expect(sizesOn.some((s) => s >= full * 0.9),
    'E.9 wire: the acceptance re-ran the full program');
  const sizesOff = [];
  const rOff = await proveProgram(code, theoremUnderProof(decl), mkOracle(sizesOff), { maxSteps: 6, certifyTrim: false });
  expect(rOff.complete === true && sizesOff.every((s) => s >= full * 0.9),
    `E.9 wire: certifyTrim:false keeps every check full-size (sizes ${JSON.stringify(sizesOff)})`);
}

// P8 — "a certified complete chain is never worse than a speculative
// refinement" holds at the TOP LEVEL: closing fills rank before open splits.
// (Split-first ordering, unmasked by the P6 demand fixes, sent todbruijn into
// an 8-deep split spiral where one closer ends the proof.)
{
  const ordSig = [
    'fam : type.',
    'mkA : fam.',
    'mkB : fam.',
    'gate : fam -> type.',
    'gA : gate mkA.',
    'gB : gate mkB.',
    'rec pick : [ |- gate F] -> [ |- fam] =',
    '/ total 1 /',
    'fn d => ?',
    ';',
  ].join('\n');
  const ordMoves = candidateMoves({
    goal: '[ |- fam]',
    meta: [],
    ctx: [{ name: 'd', type: '[ |- gate F]' }],
  }, ordSig, theoremUnderProof(ordSig.slice(ordSig.indexOf('rec pick'))));
  const iClose = ordMoves.findIndex((m) => m && m.text && !/\?/.test(m.text));
  const iSplit = ordMoves.findIndex((m) => m && m.kind === 'split');
  expect(iClose >= 0 && iSplit >= 0 && iClose < iSplit,
    `P8 closers rank before open splits at top level (close@${iClose} split@${iSplit})`);
}

// G.3b — dominated moves defer to the queue's tail; never dropped, never
// tried before a live candidate. Order preserved within each class.
{
  const a = { kind: 'synth', text: 'x' };
  const b = { kind: 'invert', text: 'y', dominated: true };
  const c = { kind: 'split', text: 'z' };
  const d = { kind: 'split', text: 'w', dominated: true };
  const out = deferDominated([a, b, c, d]);
  expect(out.length === 4 && out[0] === a && out[1] === c && out[2] === b && out[3] === d,
    'G.3b deferDominated: live first (order kept), dominated last (order kept)');
  const plain = [a, c];
  expect(deferDominated(plain) === plain, 'G.3b no dominated ⇒ identity (no realloc)');
  expect(deferDominated([]).length === 0, 'G.3b empty stays empty');
}

// Phase E.8 — writableRisk synth dominated when a clean closing synth exists.
{
  const clean = { kind: 'synth', text: '[ |- z]', rationale: 'clean' };
  const risk = { kind: 'synth', text: '[ |- X1]', rationale: 'risky', writableRisk: true };
  const onlyRisk = withWritableRiskDominated([risk]);
  expect(onlyRisk.length === 1 && !onlyRisk[0].dominated,
    'E.8 keeps writableRisk when it is the only closer');
  const both = withWritableRiskDominated([clean, risk]);
  expect(both[0].dominated !== true, 'E.8 clean synth stays live');
  expect(both[1].dominated === true && /writable synth/.test(both[1].rationale),
    `E.8 dominates writableRisk beside clean (got ${JSON.stringify(both[1])})`);
  expect(withWritableRiskDominated([]).length === 0, 'E.8 empty stays empty');
}

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
