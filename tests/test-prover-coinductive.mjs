// Fragment classification for honest STUCK verdicts (bel-prover-bridge):
// a no-move goal CONCLUDING in a `coinductive`-declared family is out of the
// inductive fragment BY CONSTRUCTION (needs the copattern `fun` former) and
// must be reported as such, not as a bare "no-move". Purely syntax-directed —
// the declaration keyword, never a family name (invented names throughout).
import {
  coinductiveFamiliesOf,
  goalConcludesInFamily,
  proveProgram,
  theoremUnderProof,
} from '../editor-src/bel-prover-bridge.mjs';

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
  // With synthesis disabled, no fork happens.
  const r2 = await proveProgram(code, theoremUnderProof(decl), decliningOracle(),
    { maxSteps: 4, noMeasureSynthesis: true });
  expect(r2.stuck && r2.stuck.reason === 'no-totality-measure' && !r2.stuck.measuresTried,
    'noMeasureSynthesis opts out of the fork');
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

console.log('OK test-prover-coinductive (keyword-driven fragment + totality classification of stuck verdicts)');
