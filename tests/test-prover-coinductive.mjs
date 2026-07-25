// Fragment classification for honest STUCK verdicts (prover-orchestrator):
// a no-move goal CONCLUDING in a `coinductive`-declared family is out of the
// inductive fragment BY CONSTRUCTION (needs the copattern `fun` former) and
// must be reported as such, not as a bare "no-move". Purely syntax-directed —
// the declaration keyword, never a family name (invented names throughout).
import {
  coinductiveFamiliesOf,
  goalConcludesInFamily,
  proveProgram,
  theoremUnderProof,
  stuckHintFor,
} from '../js/editor-src/prover/prover-orchestrator.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── coinductiveFamiliesOf: declaration-keyword detection ────────────────────
{
  const code = [
    'q : type.',
    'inductive Walk : (g:cx) [g |- q] -> ctype =',
    '| W_go : Walk [g |- P] -> Walk [g |- P];',
    'coinductive Drift : (g:cx) [g |- q] -> [g |- q] -> ctype =',
    '| .Driftf : Drift [g |- P] [g |- Q] :: Walk [g |- P] -> Walk [g |- Q]',
    'and inductive HasStep : (g:cx) [g |- q] -> ctype =',
    '| H_s : HasStep [g |- P]',
    'and coinductive Glide : (g:cx) [g |- q] -> ctype =',
    '| .Glidef : Glide [g |- P] :: HasStep [g |- P];',
    '% coinductive Ghost : [ |- q] -> ctype =   (commented out — must not count)',
    '%{ coinductive Phantom : [ |- q] -> ctype = }%',
  ].join('\n');
  const fams = coinductiveFamiliesOf(code);
  expect(fams.has('Drift'), 'top-level coinductive family detected');
  expect(fams.has('Glide'), 'and-joined coinductive member detected');
  expect(!fams.has('Walk') && !fams.has('HasStep'), 'inductive families not tagged');
  expect(!fams.has('Ghost') && !fams.has('Phantom'), 'commented-out declarations never count');
}

// ── goalConcludesInFamily: conclusion-head matching ─────────────────────────
{
  const fams = new Set(['Drift', 'Glide']);
  expect(goalConcludesInFamily('Drift [g |- P] [g |- Q]', fams) === 'Drift',
    'bare coinductive goal matches');
  expect(goalConcludesInFamily('Walk [g |- P] -> Drift [g |- P] [g |- Q]', fams) === 'Drift',
    'goal with premises: conclusion of the arrow spine decides');
  expect(goalConcludesInFamily('{P:[g |- q]} Glide [g |- P]', fams) === 'Glide',
    'leading Pi binder groups are peeled');
  expect(goalConcludesInFamily('(g:cx) Drift [g |- P] [g |- P]', fams) === 'Drift',
    'leading implicit ctx group is peeled');
  expect(goalConcludesInFamily('Drift [g |- P] [g |- Q] -> Walk [g |- P]', fams) === null,
    'a coinductive PREMISE with an inductive conclusion does not classify');
  expect(goalConcludesInFamily('[g |- step (drift P) Q]', fams) === null,
    'a boxed LF goal never matches a comp family');
  expect(goalConcludesInFamily('Drift [g |- P] [g |- Q]', new Set()) === null,
    'no coinductive families declared: never classifies');
}

// ── end-to-end: the stuck VERDICT carries the classification ────────────────
// Stub oracle: first check passes (bootstraps the syntactic fallback hole with
// the full comp type as goal), every later check fails — so no candidate ever
// certifies and the engine must decline with an honestly-classified reason.
function decliningOracle() {
  let first = true;
  return async () => {
    if (first) { first = false; return { ok: true, output: '## Type Reconstruction done ##' }; }
    return { ok: false, output: 'File "input.bel", line 1, column 1:\nError: rejected' };
  };
}
{
  const decl = 'rec spin : [ |- q] -> Drift [ |- P] [ |- Q] =\n?\n;';
  const code = 'q : type.\ncoinductive Drift : [ |- q] -> [ |- q] -> ctype =\n'
    + '| .Driftf : Drift [ |- P] [ |- Q] :: [ |- q];\n' + decl;
  const r = await proveProgram(code, theoremUnderProof(decl), decliningOracle(), { maxSteps: 4 });
  expect(!r.complete && r.stuck && r.stuck.reason === 'coinductive-out-of-fragment',
    `coinductive-goal decline carries the fragment verdict (got ${JSON.stringify(r.stuck && r.stuck.reason)})`);
  expect(r.stuck.family === 'Drift', 'the classified family is reported');
  expect(/coinductive family Drift/.test(r.stuck.hint || ''),
    `G.1 hint names the family (got ${JSON.stringify(r.stuck.hint)})`);
  expect(r.verdict === 'BEYOND-FRAGMENT' && r.tier === 2,
    'G.0/G.1 coinductive carries BEYOND-FRAGMENT tier 2');
}
{
  // A boxed-premise theorem with NO totality measure: recursion candidates are
  // unavailable by construction — the verdict must name the blocking cause,
  // AND measure synthesis must have forked the search over hypothetical
  // `/ total N /` pragmas before giving up (generate-and-verify measures).
  const decl = 'rec walkless : [ |- q] -> [ |- q] =\n?\n;';
  const code = 'q : type.\nqq : q.\n' + decl;
  const seen = [];
  let first = true;
  const oracle = async (src) => {
    seen.push(src);
    if (first) { first = false; return { ok: true, output: '## Type Reconstruction done ##' }; }
    return { ok: false, output: 'File "input.bel", line 1, column 1:\nError: rejected' };
  };
  const r = await proveProgram(code, theoremUnderProof(decl), oracle, { maxSteps: 4 });
  expect(!r.complete && r.stuck && r.stuck.reason === 'no-totality-measure',
    `measureless boxed-premise decline names the cause (got ${JSON.stringify(r.stuck && r.stuck.reason)})`);
  expect(Array.isArray(r.stuck.measuresTried) && r.stuck.measuresTried.join(',') === '/ total 1 /',
    `hypothetical measure / total 1 / was attempted (got ${JSON.stringify(r.stuck.measuresTried)})`);
  expect(seen.some((s) => /\/ total 1 \//.test(s)),
    'the forked search actually spliced / total 1 / into the program');
  expect(/structural recursion/.test(r.stuck.hint || '') && /\/ total 1 \//.test(r.stuck.hint || ''),
    `G.1 hint suggests / total 1 / (got ${JSON.stringify(r.stuck.hint)})`);
  expect(Array.isArray(r.stuck.measurePragmas) && r.stuck.measurePragmas[0] === '/ total 1 /',
    'G.1 measurePragmas lists the candidate');
  // With synthesis disabled, no fork happens.
  const r2 = await proveProgram(code, theoremUnderProof(decl), decliningOracle(),
    { maxSteps: 4, noMeasureSynthesis: true });
  expect(r2.stuck && r2.stuck.reason === 'no-totality-measure' && !r2.stuck.measuresTried,
    'noMeasureSynthesis opts out of the fork');
  expect(/structural recursion/.test(r2.stuck.hint || ''),
    'G.1 hint still present when forks are opted out');
}
{
  // With a measure present, the same shape declines as plain no-move.
  const decl = 'rec walked : [ |- q] -> [ |- q] =\n/ total 1 /\n?\n;';
  const code = 'q : type.\nqq : q.\n' + decl;
  const r = await proveProgram(code, theoremUnderProof(decl), decliningOracle(), { maxSteps: 4 });
  expect(!r.complete && r.stuck && r.stuck.reason === 'no-move',
    `measured decline stays no-move (got ${JSON.stringify(r.stuck && r.stuck.reason)})`);
}
{
  // An explicit OBJECT-Pi binder is a measure position too (the exTRel/refl
  // class: induction on a Pi-bound term). Its fork uses the NAMED `_`-spine
  // form — the D6 pi-object split gate keys on the measure naming the binder —
  // while the box premise keeps the index form; both spliced in premise order.
  const decl = 'rec pwalk : {M : [ |- q]} [ |- q] -> [ |- q] =\n?\n;';
  const code = 'q : type.\nqq : q.\n' + decl;
  const seen = [];
  let first = true;
  const oracle = async (src) => {
    seen.push(src);
    if (first) { first = false; return { ok: true, output: '## Type Reconstruction done ##' }; }
    return { ok: false, output: 'File "input.bel", line 1, column 1:\nError: rejected' };
  };
  const r = await proveProgram(code, theoremUnderProof(decl), oracle, { maxSteps: 4 });
  expect(!r.complete && r.stuck && r.stuck.reason === 'no-totality-measure',
    `pi+box measureless decline names the cause (got ${JSON.stringify(r.stuck && r.stuck.reason)})`);
  const tried = (r.stuck.measuresTried || []).join(' ; ');
  expect(/\/ total m \(pwalk m _\) \//.test(tried),
    `the named _-spine pi measure was forked (got ${JSON.stringify(r.stuck.measuresTried)})`);
  expect(/\/ total 2 \//.test(tried),
    `the box position (explicit position 2) was forked in index form (got ${JSON.stringify(r.stuck.measuresTried)})`);
  expect(seen.some((s) => /\/ total m \(pwalk m _\) \//.test(s)),
    'the pi fork actually spliced the named pragma into the program');
}

// Phase G.1 — stuckHintFor is pure and fail-closed on unknown reasons
{
  expect(stuckHintFor({ reason: 'disproved' }, null)?.message.includes('counterexample'),
    'DISPROVED hint');
  expect(stuckHintFor({ reason: 'no-move' }, null) === null,
    'bare no-move has no speculative hint');
  expect(stuckHintFor({ reason: 'no-move', closest: 'synth: let x = f in' }, null)?.message.includes('closest tried'),
    'no-move with closest reports it');
}

// ── Phase G.3 — the certified NO-CUT-FREE-PROOF verdict ─────────────────────
// Positive: intro accepted (invertible), then a hole whose full move space is
// generated, synth-exhausted (G.2, no tripwire), and rejected by the oracle —
// the certificate fires. The STUB oracle is the arbiter by design (as in every
// pin here); against real Beluga the same conditions gate the same claim.
{
  const decl = 'rec gap : [ |- fam_a] -> [ |- fam_b] =\n/ total 1 /\n?\n;';
  const code = 'fam_a : type.\nfam_b : type.\n' + decl;
  let n = 0;
  const oracle = async (src) => {
    n += 1;
    if (n === 1) return { ok: true, output: '## Type Reconstruction done ##' };
    // The bare intro skeleton (a `?` immediately after `=>`) is the one splice
    // this oracle accepts — structural, so wave order cannot misroute it. Every
    // other candidate (fills, recurse lets, impossible) replaces that `?` and
    // is rejected.
    if (/\bfn\b/.test(src) && /=>\s*\n?\s*\?\s*(\n|$)/.test(src)) {
      let ln = 1;
      let col = 1;
      src.split('\n').forEach((l, i) => {
        const j = l.indexOf('?');
        if (j >= 0 && ln === 1) { ln = i + 1; col = j + 1; }
      });
      const binder = (/\bfn\s+([A-Za-z_][A-Za-z0-9_']*)/.exec(src) || [null, 'x'])[1];
      return {
        ok: true,
        output: [
          '## Holes ##',
          `File "input.bel", line ${ln}, column ${col}: Hole number 0, <anonymous>`,
          'Computation context:',
          `${binder} : [ |- fam_a]`,
          'Goal: [ |- fam_b]',
        ].join('\n'),
      };
    }
    return { ok: false, output: 'File "input.bel", line 1, column 1:\nError: rejected' };
  };
  const r = await proveProgram(code, theoremUnderProof(decl), oracle, { maxSteps: 6 });
  expect(!r.complete && r.stuck && r.stuck.reason === 'no-move',
    `G.3 positive: stuck no-move (got ${JSON.stringify(r.stuck && r.stuck.reason)})`);
  expect(r.stuck.noCutFree === true,
    `G.3 positive: exhaustion certificate attached (got ${JSON.stringify(r.stuck)})`);
  expect(r.verdict === 'NO-CUT-FREE-PROOF' && r.tier === 1,
    `G.3 positive: verdict NO-CUT-FREE-PROOF tier 1 (got ${r.verdict}/${r.tier})`);
  expect(/cut/.test(r.stuck.hint || ''),
    `G.3 positive: hint names the cut (got ${JSON.stringify(r.stuck.hint)})`);
}
{
  // Negative: the same theorem with the intro itself rejected — stuck at the
  // syntactic fallback hole where synthesis never ran ⇒ no exhaustion claim.
  const decl = 'rec gap : [ |- fam_a] -> [ |- fam_b] =\n/ total 1 /\n?\n;';
  const code = 'fam_a : type.\nfam_b : type.\n' + decl;
  const r = await proveProgram(code, theoremUnderProof(decl), decliningOracle(), { maxSteps: 4 });
  expect(!r.complete && r.stuck && r.stuck.reason === 'no-move' && !r.stuck.noCutFree,
    `G.3 negative: unexhausted no-move carries no certificate (got ${JSON.stringify(r.stuck)})`);
  expect(r.verdict === 'STUCK' && r.tier === null,
    `G.3 negative: verdict stays STUCK tier null (got ${r.verdict}/${r.tier})`);
}
// stuckHintFor: the certificate hint is pure.
{
  expect(stuckHintFor({ reason: 'no-move', noCutFree: true }, null)?.message.includes('cut'),
    'G.3 hint: noCutFree names the required cut');
}

// ── P7 — implicit-ctx writability: a goal context that is a bare implicitly
// quantified variable gets the INFERRED `[_ ⊢ …]` fill variant (the ctxToEnv
// loss: `[h |- nil]` rejects "free context variable is illegal" while
// `[_ |- nil]` certifies; ground-truthed against native main.exe). ────────────
{
  const decl = 'rec toenv : Wrap [h] -> [h |- env] =\n?\n;';
  const code = [
    'env : type.',
    'enil : env.',
    'schema hctx = env;',
    'inductive Wrap : {h:hctx} ctype =',
    '| W : Wrap [h];',
    decl,
  ].join('\n');
  let sawUnderscore = false;
  let first = true;
  const oracle = async (src) => {
    if (first) { first = false; return { ok: true, output: '## Type Reconstruction done ##' }; }
    if (/\bfn\b/.test(src) && /=>\s*\n?\s*\?\s*(\n|$)/.test(src)) {
      let ln = 1;
      let col = 1;
      src.split('\n').forEach((l, i) => {
        const j = l.indexOf('?');
        if (j >= 0 && ln === 1) { ln = i + 1; col = j + 1; }
      });
      const binder = (/\bfn\s+([A-Za-z_][A-Za-z0-9_']*)/.exec(src) || [null, 'x'])[1];
      return {
        ok: true,
        output: [
          '## Holes ##',
          `File "input.bel", line ${ln}, column ${col}: Hole number 0, <anonymous>`,
          'Computation context:',
          `${binder} : Wrap [h]`,
          'Goal: [h |- env]',
        ].join('\n'),
      };
    }
    if (/\[_\s*(\||⊢)\s*-?\s*enil\]/.test(src) || /\[_\s*\|-\s*enil\]/.test(src)) {
      sawUnderscore = true;
      return { ok: true, output: '' }; // the inferred spelling certifies, no holes left
    }
    return { ok: false, output: 'File "input.bel", line 1, column 1:\nError: This free context variable is illegal.' };
  };
  const r = await proveProgram(code, theoremUnderProof(decl), oracle, { maxSteps: 6 });
  expect(r.complete === true && sawUnderscore,
    `P7 inferred-ctx fill variant closes the implicit-ctx goal (complete=${r.complete} sawUnderscore=${sawUnderscore})`);
}

console.log('OK test-prover-coinductive (keyword-driven fragment + totality classification of stuck verdicts)');
