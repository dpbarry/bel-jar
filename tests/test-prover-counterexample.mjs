// Phase I counterexample engine — invented shapes only; fail-closed DISPROOF.
import {
  findCounterexample,
  conclusionRigidlyEmpty,
  enumerateInhabitants,
  ctypeEmptyCtxOnly,
  ctxStructurallyEmpty,
} from '../js/editor-src/prover/prover-counterexample.mjs';
import {
  proveProgram,
  theoremUnderProof,
} from '../js/editor-src/prover/prover-orchestrator.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const SIG = [
  'nat : type.',
  'z : nat.',
  's : nat -> nat.',
  'eq : nat -> nat -> type.',
  'refl : eq N N.',
].join('\n');

// A — ground false conclusion, no premises
{
  const ce = findCounterexample('[ |- eq (s z) z]', SIG);
  expect(ce && ce.status === 'disproved', 'A: eq (s z) z is DISPROVED');
  expect(ce.witness.emptyConclusion.includes('eq (s z) z'),
    'A: witness names the empty conclusion');
  expect(conclusionRigidlyEmpty('eq (s z) z', SIG), 'A: rigidly empty');
  expect(!conclusionRigidlyEmpty('eq z z', SIG), 'A: eq z z is not empty');
}

// B — implication: N ↦ z makes premise inhabited and concl empty
{
  const ce = findCounterexample('[ |- eq N N] -> [ |- eq (s N) N]', SIG);
  expect(ce && ce.status === 'disproved', 'B: false implication DISPROVED');
  expect(ce.witness.assignment.N === 'z', `B: N ↦ z (got ${JSON.stringify(ce.witness.assignment)})`);
  expect(ce.premises.length === 1 && /refl/.test(ce.premises[0].term),
    `B: premise inhabited by refl (got ${ce.premises[0] && ce.premises[0].term})`);
}

// C — true implication: no CE (null ≠ proved)
{
  const ce = findCounterexample('[ |- eq N N] -> [ |- eq N N]', SIG);
  expect(ce === null, 'C: true schema yields null (not a proof claim)');
}

// D — true identity on eq N M: no CE at small depth
{
  const ce = findCounterexample('[ |- eq N M] -> [ |- eq N M]', SIG);
  expect(ce === null, 'D: true open eq schema yields null');
}

// E — unknown family: fail-closed null
{
  const ce = findCounterexample('[ |- mystery a b]', SIG);
  expect(ce === null, 'E: unknown family cannot certify emptiness');
  expect(!conclusionRigidlyEmpty('mystery a b', SIG), 'E: unknown ≠ empty');
}

// I.3 — empty-ctx ctype premises/conclusions
{
  const CSIG = [
    'nat : type.',
    'z : nat.',
    's : nat -> nat.',
    'Ok : [ |- nat] -> ctype.',
    'ok : Ok [ |- z].',
  ].join('\n');
  expect(ctypeEmptyCtxOnly('Ok [ |- N]'), 'I.3: empty-ctx ctype admitted');
  expect(ctypeEmptyCtxOnly('Ok [g |- N]'), 'I.4: bare schema-var ctx is structurally empty');
  expect(!ctypeEmptyCtxOnly('Ok [g, x:nat |- N]'), 'I.4: binder ctx still rejected');
  expect(enumerateInhabitants('Ok [ |- z]', CSIG).includes('ok'),
    `I.3: Ok [ |- z] inhabited by ok (got ${enumerateInhabitants('Ok [ |- z]', CSIG).join(',')})`);
  expect(conclusionRigidlyEmpty('Ok [ |- (s z)]', CSIG), 'I.3: Ok [ |- s z] rigidly empty');
  expect(!conclusionRigidlyEmpty('Ok [ |- z]', CSIG), 'I.3: Ok [ |- z] not empty');
  const ce = findCounterexample('Ok [ |- N] -> Ok [ |- (s N)]', CSIG);
  expect(ce && ce.status === 'disproved', 'I.3: false ctype implication DISPROVED');
  expect(ce.witness.assignment.N === 'z', `I.3: N ↦ z (got ${JSON.stringify(ce.witness.assignment)})`);
  expect(ce.premises[0] && ce.premises[0].term === 'ok',
    `I.3: premise inhabited by ok (got ${ce.premises[0] && ce.premises[0].term})`);
  expect(findCounterexample('Ok [ |- N] -> Ok [ |- N]', CSIG) === null,
    'I.3: true ctype schema yields null');
  expect(findCounterexample('Ok [g, x:nat |- N] -> Ok [ |- z]', CSIG) === null,
    'I.4: binder ctx ctype fail-closed');
}

// I.4 — bare schema-var context on FO boxes
{
  expect(ctxStructurallyEmpty(''), 'I.4: blank ctx empty');
  expect(ctxStructurallyEmpty('g'), 'I.4: bare schema var empty');
  expect(!ctxStructurallyEmpty('g, x:nat'), 'I.4: hyp-extended ctx not empty');
  const ce = findCounterexample('[g |- eq N N] -> [g |- eq (s N) N]', SIG);
  expect(ce && ce.status === 'disproved', 'I.4: bare-g FO implication DISPROVED');
  expect(ce.witness.assignment.N === 'z', `I.4: N ↦ z (got ${JSON.stringify(ce.witness.assignment)})`);
  expect(findCounterexample('[g, x:nat |- eq N N] -> [ |- eq (s z) z]', SIG) === null,
    'I.4: true non-empty ctx fail-closed');
}

// Inhabitants of nat include z and (s z)
{
  const nats = enumerateInhabitants('nat', SIG, { maxDepth: 2, cap: 8 });
  expect(nats.includes('z'), `nat inhabitants include z (got ${nats.join(',')})`);
  expect(nats.some((t) => /^s\b/.test(t)), `nat inhabitants include s … (got ${nats.join(',')})`);
  expect(enumerateInhabitants('eq z z', SIG).some((t) => t === 'refl'),
    'eq z z inhabited by refl');
  expect(enumerateInhabitants('eq (s z) z', SIG).length === 0,
    'eq (s z) z has no FO inhabitant');
}

// I.1 — type-level DISPROVED (no Beluga gate)
{
  const thmText = 'rec bad : [ |- eq (s z) z] =\n?\n;';
  const decl = `${SIG}\n${thmText}`;
  const thm = theoremUnderProof(thmText);
  let calls = 0;
  const oracle = async () => { calls += 1; return { ok: true, output: '' }; };
  const res = await proveProgram(decl, thm, oracle, {
    maxSteps: 3,
    counterexampleCertify: false,
  });
  expect(!res.complete && res.stuck && res.stuck.reason === 'disproved',
    `proveProgram DISPROVED stuck (got ${JSON.stringify(res.stuck && res.stuck.reason)})`);
  expect(res.stuck.counterexample && res.stuck.counterexample.status === 'disproved',
    'stuck carries the counterexample witness');
  expect(calls === 0 && res.checkCount === 0,
    `type-level DISPROVED costs zero oracle calls (calls=${calls} checkCount=${res.checkCount})`);
  expect(res.verdict === 'DISPROVED' && res.tier === 1,
    `G.0 taxonomy: DISPROVED tier 1 (got ${res.verdict}/${res.tier})`);

  const okText = 'rec ok : [ |- eq N N] -> [ |- eq N N] =\n?\n;';
  const okDecl = `${SIG}\n${okText}`;
  const okThm = theoremUnderProof(okText);
  const res2 = await proveProgram(okDecl, okThm, oracle, {
    maxSteps: 2,
    counterexampleCertify: false,
  });
  expect(!(res2.stuck && res2.stuck.reason === 'disproved'),
    'true schema is not false-DISPROVED');
}

// I.2 — Beluga-gated DISPROVED (premise check + conclusion reject)
{
  const { certifyCounterexample, counterexamplePrograms } = await import('../js/editor-src/prover/prover-counterexample.mjs');
  const ce = findCounterexample('[ |- eq N N] -> [ |- eq (s N) N]', SIG);
  expect(ce, 'I.2 needs a type-level CE');
  const progs = counterexamplePrograms(ce, SIG);
  expect(progs.some((p) => p.role === 'premise') && progs.some((p) => p.role === 'conclusion-reject'),
    `I.2 programs include premise + reject (got ${progs.map((p) => p.role).join(',')})`);

  const oracle = async (src) => {
    // Premise programs end with `= [ |- refl]` — accept clean.
    // Conclusion-reject ends with `= [ |- refl]` into eq (s z) z — reject.
    if (/rec ce_c\b/.test(src)) {
      return { ok: false, output: 'File "input.bel", line 1, column 1:\nError: type mismatch' };
    }
    if (/rec ce_p/.test(src)) {
      return { ok: true, output: '## Type Reconstruction done ##' };
    }
    return { ok: true, output: '' };
  };
  const cert = await certifyCounterexample(ce, SIG, oracle);
  expect(cert.ok && cert.checkCount >= 2,
    `I.2 certify ok (got ${JSON.stringify(cert)})`);

  const thmText = 'rec bad2 : [ |- eq N N] -> [ |- eq (s N) N] =\n?\n;';
  const decl = `${SIG}\n${thmText}`;
  const thm = theoremUnderProof(thmText);
  let calls = 0;
  const liveOracle = async (src) => {
    calls += 1;
    return oracle(src);
  };
  const res = await proveProgram(decl, thm, liveOracle, { maxSteps: 3 });
  expect(res.stuck && res.stuck.reason === 'disproved' && res.stuck.counterexample.certified,
    'I.2 proveProgram DISPROVED after Beluga gate');
  expect(res.verdict === 'DISPROVED' && res.tier === 1,
    'I.2 certified DISPROVED carries §3.3 verdict');
  expect(res.checkCount === calls && calls >= 2,
    `I.2 checkCount tracks certify calls (checkCount=${res.checkCount} calls=${calls})`);
}

// ── I.5 soundness: INFIX-symbol ctor results must be matchable (the dual_sym
// false-DISPROVED, caught by the 2026-07-17 library sweep: parseAppType-based
// matching misread `A ⊗ B` as head A, so no ctor "matched" an inhabited
// conclusion and the engine certified a disproof of a true theorem). ─────────
{
  const DSIG = [
    'pol : type.',
    'one : pol.',
    'bot : pol.',
    'ten : pol -> pol -> pol.  --infix ten 6 right.',
    'par : pol -> pol -> pol.  --infix par 6 right.',
    'flip : pol -> pol -> type.',
    'F1 : flip one bot.',
    'Fb : flip bot one.',
    'Ft : flip A A\' -> flip B B\' -> flip (A ten B) (A\' par B\').',
    'Fp : flip A A\' -> flip B B\' -> flip (A par B) (A\' ten B\').',
  ].join('\n');
  // flip symmetry is TRUE — a certified DISPROOF would be a soundness bug.
  const sym = findCounterexample('[ |- flip A A\'] -> [ |- flip A\' A]', DSIG);
  expect(sym === null, `I.5 infix symmetry theorem must not be disproved (got ${JSON.stringify(sym && sym.witness)})`);
  // The infix conclusion instance IS inhabited (Fp F1 …) — never rigidly empty.
  expect(!conclusionRigidlyEmpty('flip (bot par bot) (one ten one)', DSIG),
    'I.5 inhabited infix conclusion is not rigidly empty');
  // Genuinely empty infix instance still detected (no ctor result aligns).
  expect(conclusionRigidlyEmpty('flip one one', DSIG),
    'I.5 flip one one stays rigidly empty (soundness fix keeps real emptiness)');
}

// ── I.5b soundness: an HO-arg ctor whose RESULT matches can inhabit the
// conclusion — it must not be skipped by the emptiness scan. ─────────────────
{
  const HSIG = [
    'tm : type.',
    'app : tm -> tm -> tm.',
    'lam : (tm -> tm) -> tm.',
    'wf : tm -> type.',
    'wf_app : wf M -> wf N -> wf (app M N).',
    'wf_lam : ({x:tm} wf x -> wf (M x)) -> wf (lam M).',
  ].join('\n');
  expect(!conclusionRigidlyEmpty('wf (lam (\\x. x))', HSIG),
    'I.5b HO-ctor-inhabited conclusion is not rigidly empty');
}

console.log('OK test-prover-counterexample (Phase I fail-closed DISPROOF)');
