// GOAL-DIRECTED SYNTHESIS (bel-synth): the gap-filling engine. This pins the
// exact capability the greedy loop lacks — deriving a deep non-closing
// `let`-chain BACKWARD from the goal by unification (SLD over the pattern
// fragment), with forward saturation restricted to index-determined (unique-
// constructor) inversions and IH termination keyed to decOk sub-derivations.
// The state below is the real bigstep_det eval_app1/eval_app1 branch; the
// expected output is the reference proof's chain, discovered — not templated.
import { synthesize, armRefinements, demandSplitVerdict, fillSplitPlan, fillIntroPlan, fillInvertPlan, fillInvertChainPlan, classifyRuleDescent } from '../js/editor-src/prover/prover-synth.mjs';
import { normalizeCtypeSpelling, parseCompType, isCtypeApplication } from '../js/editor-src/prover/prover-comp-type.mjs';
import { invertCandidates } from '../js/editor-src/prover/hole-split.mjs';
import {
  sourceWritableNames,
  inventedReportNames,
  textReferencesNames,
} from '../js/editor-src/prover/prover-orchestrator.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── the eval_app1/eval_app1 hole state (checker-reported shapes) ─────────────
const goal = { ctx: 'g', concl: `eq "i R'` };
const facts = [
  // d's split (the decreasing scrutinee) — decOk sub-derivations
  { name: 'X5', extras: [], concl: `eval M1 (lam (\\x2. M'))`, original: true, decOk: true },
  { name: 'X6', extras: [], concl: `eval (M'[.., N]) "i`, original: true, decOk: true },
  // f's split — original but NOT decreasing-position material
  { name: 'F1', extras: [], concl: `eval M1 (lam (\\x2. M1'))`, original: true, decOk: false },
  { name: 'F2', extras: [], concl: `eval (M1'[.., N]) R'`, original: true, decOk: false },
];
const rules = [
  {
    name: 'eq_refl', isIH: false, decIdx: -1,
    flex: new Set(['M']),
    pis: [{ kind: 'ctx' }, { kind: 'obj', varName: 'M' }],
    premises: [], result: 'eq M M',
  },
  {
    name: 'eq_sym', isIH: false, decIdx: -1,
    flex: new Set(['M', 'N']),
    pis: [], premises: ['eq M N'], result: 'eq N M',
  },
  {
    name: 'eval_respects_eq', isIH: false, decIdx: -1,
    flex: new Set(['M', 'N', 'R']),
    pis: [], premises: ['eq M N', 'eval M R'], result: 'eval N R',
  },
  {
    name: 'deterministic', isIH: true, decIdx: 0,
    flex: new Set(['M', 'R', "R'"]),
    pis: [], premises: ['eval M R', "eval M R'"], result: "eq R R'",
  },
];
const ctors = new Map([
  ['eq', [
    { name: 'eq_lam', argTypes: ['({x:exp} eq x x -> eq (M x) (N x))'], result: { head: 'eq', indices: ['(lam M)', '(lam N)'] } },
    { name: 'eq_app', argTypes: ['eq E1 F1', 'eq E2 F2'], result: { head: 'eq', indices: ['(app E1 E2)', '(app F1 F2)'] } },
  ]],
  ['eval', [
    { name: 'eval_lam', argTypes: ['({x:exp} eval x x -> notLam x -> eval (M x) (N x))'], result: { head: 'eval', indices: ['(lam M)', '(lam N)'] } },
    { name: 'eval_app1', argTypes: ["eval M (lam M')", "eval (M' N) R"], result: { head: 'eval', indices: ['(app M N)', 'R'] } },
    { name: 'eval_app2', argTypes: ["eval M M'", "notLam M'", "eval N N'"], result: { head: 'eval', indices: ['(app M N)', "(app M' N')"] } },
  ]],
]);

const out = synthesize(goal, facts, rules, ctors);
expect(out && out.text, 'synthesis finds the eval_app1 chain');
const text = out.text;
console.log('--- derived chain ---\n' + text + '\n---------------------');

// The chain's five forced steps, in dependency order:
const lines = text.split('\n');
expect(lines.length === 5, `five steps (got ${lines.length})`);
// 1. index-determined inversion of the IH product (eq (lam _)(lam _) ⇒ eq_lam only)
expect(/^let \[g \|- eq_lam \(\\x\. \\u\. (\w+)\)\] = deterministic \[g \|- X5\] \[g \|- F1\] in$/.test(lines[0]),
  'step 1: deterministic X5 F1 destructured via the UNIQUE ctor eq_lam');
// 2. eq_refl instantiated by unification (result eq M M vs subgoal eq N N ⇒ M:=N)
expect(/^let \[g \|- (\w+)\] = eq_refl \[g\] \[g \|- N\] in$/.test(lines[1]),
  'step 2: eq_refl [g] [g |- N]');
// 3. the under-binder component instantiated `E[.., N, E2]` — slots from the match
expect(/^let \[g \|- (\w+)\] = eq_sym \[g \|- \w+\[\.\., N, \w+\]\] in$/.test(lines[2]),
  'step 3: eq_sym of the substitution-instantiated component');
// 4. eval_respects_eq transports F2 along the symmetric equation
expect(/^let \[g \|- (\w+)\] = eval_respects_eq \[g \|- \w+\] \[g \|- F2\] in$/.test(lines[3]),
  'step 4: eval_respects_eq … F2');
// 5. tail IH call with the DECREASING argument a decOk fact (X6)
expect(/^deterministic \[g \|- X6\] \[g \|- \w+\]$/.test(lines[4]),
  'step 5: tail deterministic X6 …');

// ── REFUTATION closing (the app1×app2 cross arm): the product's inversion
// REFINES M'1 := lam _, leaving `notLam M'1` uninhabitable — closed by the
// destructuring let + `impossible` (the reference's second idiom). ──
const crossFacts = [
  { name: 'X5', extras: [], concl: `eval M2 (lam (\\x2. M'))`, original: true, decOk: true },
  { name: 'X6', extras: [], concl: `eval (M'[.., N1]) "i`, original: true, decOk: true },
  { name: 'X13', extras: [], concl: `eval M2 M'1`, original: true, decOk: false },
  { name: 'X14', extras: [], concl: `notLam M'1`, original: true, decOk: false },
  { name: 'X15', extras: [], concl: `eval N1 N'`, original: true, decOk: false },
];
const crossCtors = new Map([...ctors, ['notLam', [
  { name: "notLam'", argTypes: [], result: { head: 'notLam', indices: ['(app M N)'] } },
]]]);
const cross = synthesize(
  { ctx: 'g', concl: `eq "i (app M'1 N')` },
  crossFacts, rules, crossCtors,
  { metaVars: new Set(["M'1", "M'", 'M2', 'N1', "N'", '"i']) },
);
expect(cross && /impossible \[g \|- X14\]/.test(cross.text),
  'refutation closes the cross arm via impossible on the refuted notLam');
expect(/^let \[g \|- eq_lam \(\\x\. \\u\. \w+\)\] = deterministic \[g \|- X5\] \[g \|- X13\] in$/m.test(cross.text),
  'the refuting destructure is the deterministic X5 X13 inversion');

// ── termination: without decOk facts at the decreasing index, NO chain ───────
const noDec = facts.map((f) => ({ ...f, decOk: false }));
expect(synthesize(goal, noDec, rules, ctors) === null,
  'no decOk fact at the decreasing index ⇒ honest null (termination guard)');

// ── no matching rules ⇒ honest null, never a guess ───────────────────────────
expect(synthesize({ ctx: 'g', concl: 'wtp X Y' }, facts, rules, ctors) === null,
  'an unproducible goal returns null');

// ── a directly-available fact needs no chain ─────────────────────────────────
const direct = synthesize({ ctx: 'g', concl: `eval (M'[.., N]) "i` }, facts, rules, ctors);
expect(direct && direct.text === `[g |- X6]`, 'a direct fact closes as a bare fill');

// ── explicit object-Pi args: named spelling + inferred `[ |- _]` variant ─────
// The determined object may be a meta the checker INVENTED for an unnamed
// implicit pattern argument: present in the hole report, bound NOWHERE in
// source, so the named spelling is unwritable by construction ("This free
// meta-variable is illegal") while `_` certifies. Both variants must be
// offered (checker arbitrates, D3 doctrine), and the internal marker must
// never leak into either text.
const piRules = [
  {
    name: 'k_comm', isIH: false, decIdx: -1,
    flex: new Set(['A', 'B', 'C']),
    pis: [{ kind: 'obj', varName: 'A' }, { kind: 'obj', varName: 'B' }],
    premises: ['rel A B C'], result: 'rel B A C',
  },
];
const piCtors = new Map([
  ['pack', [{ name: 'mk', argTypes: ['rel B A C'], result: { head: 'pack', indices: ['A', 'B', 'C'] } }]],
  ['rel', []],
]);
const piFacts = [{ name: 'X2', extras: [], concl: 'rel N2 N1 P', original: true, decOk: false }];
const pi = synthesize({ ctx: '', concl: 'pack N2 N1 P' }, piFacts, piRules, piCtors, {});
expect(pi && /k_comm \[\s*\|- N2\] \[\s*\|- N1\]/.test(pi.text),
  'named object-Pi spelling stays the primary text');
expect(pi && typeof pi.textU === 'string' && /k_comm \[\s*\|- _\] \[\s*\|- _\]/.test(pi.textU),
  'the inferred `[ |- _]` variant is offered when object-Pi args exist');
expect(pi && !pi.text.includes('¦') && !pi.textU.includes('¦'),
  'the internal object-arg marker never leaks into emitted text');

// ── Phase C: ctype facts + ctype premises share normalizeCtypeSpelling ───────
{
  expect(isCtypeApplication("TRel [g |- M'] [h |- M]"), 'ctype app discriminated');
  expect(!isCtypeApplication('[g |- eq A B]'), 'boxed LF is not a ctype app');
  expect(normalizeCtypeSpelling("TRel [g |- M'] [h |- M]") === "TRel (M') (M)",
    'ctype indices normalize [Ψ |- X] → (X)');
  const spine = parseCompType("{M: [h |- term]} TRel [g |- M'] [h |- M] -> ExWk [h] [g |- M']");
  expect(spine.premises.some((p) => p.kind === 'ctype'), 'ExWk/c ctype premise classified');
  expect(!spine.premises.some((p) => p.kind === 'box' && /TRel/.test(p.raw)),
    'ctype premise is not mis-tagged box');

  const ctypeFacts = [
    { name: 'r1', extras: [], concl: normalizeCtypeSpelling('RelC [ |- A] [ |- B]'), original: true, decOk: false, viaComp: true },
  ];
  const ctypeRules = [{
    name: 'wk', isIH: false, decIdx: -1, flex: new Set(['A', 'B']),
    pis: [], premises: [normalizeCtypeSpelling('RelC [ |- A] [ |- B]')],
    result: 'unit', ctypeResult: false,
  }];
  const ctypeCtors = new Map([['unit', [{ name: 'u', argTypes: [], result: { head: 'unit', indices: [] } }]]]);
  const ctypeOut = synthesize({ ctx: '', concl: 'unit' }, ctypeFacts, ctypeRules, ctypeCtors, {});
  expect(ctypeOut && /wk r1/.test(ctypeOut.text),
    'ctype fact resolves a ctype premise under unified spelling\n  got: ' + (ctypeOut && ctypeOut.text));
}

// ── Phase D Stage 1: blockedAcc collects ALL top-level blocked rules ─────────
{
  const seen = [];
  expect(synthesize(goal, noDec, rules, ctors, {
    onDemand: (obs) => { seen.push(...obs); },
  }) === null, 'noDec still honest-null with onDemand hooked');
  const names = new Set(seen.map((o) => o.ruleName));
  expect(names.has('deterministic'),
    'onDemand surfaces the IH decreasing-premise block\n  got: ' + [...names].join(','));
  expect(names.has('eq_sym'),
    'onDemand also keeps sibling blocked rules (not first-only)\n  got: ' + [...names].join(','));
}

// ── Phase D Stage 1: armRefinements + demandSplitVerdict (invented shapes) ───
{
  const vecCtors = new Map([
    ['vec', [
      { name: 'vnil', argTypes: [], result: { head: 'vec', indices: ['z'] } },
      { name: 'vcons', argTypes: ['nat', 'vec K'], result: { head: 'vec', indices: ['(s K)'] } },
    ]],
    ['nat', [
      { name: 'z', argTypes: [], result: { head: 'nat', indices: [] } },
      { name: 's', argTypes: ['nat'], result: { head: 'nat', indices: [] } },
    ]],
  ]);
  const metaVars = new Set(['A']);
  const arms = armRefinements('vec A', vecCtors, metaVars);
  expect(arms.length === 2, `armRefinements keeps every ctor hit (got ${arms.length})`);
  expect(arms.every((a) => a.metaTheta && a.metaTheta.has('A')),
    'each arm carries subject-side metaTheta for A');

  const obs = [{ premiseText: 'q A', flexRemaining: ['A'], ruleName: 'r' }];
  const bothFacts = [
    { name: 'f0', extras: [], concl: 'q z' },
    { name: 'f1', extras: [], concl: 'q (s z)' },
  ];
  expect(demandSplitVerdict('vec A', obs, bothFacts, vecCtors, metaVars) === 'demanded',
    'demanded when every arm refines the shared meta to a resolvable premise');
  expect(demandSplitVerdict('vec A', obs, [{ name: 'f0', extras: [], concl: 'q z' }], vecCtors, metaVars) === 'open',
    'partial productivity (one arm only; other not FO-empty) stays fail-open');
  expect(demandSplitVerdict('nat', obs, bothFacts, vecCtors, metaVars) === 'vacuous',
    'subject sharing no meta with the obligation is vacuous (safe drop)');
  expect(demandSplitVerdict('vec A', obs, [], vecCtors, metaVars) === 'vacuous',
    'related + zero hits even with componentOf (vec arms have no q-component) is vacuous');

  // D.2.1: productive-or-impossible — one arm resolves, the other refines to a
  // rigidly empty FO type (eq (s z) z with only refl) ⇒ demanded.
  {
    const pairEq = new Map([
      ['pair', [
        { name: 'pz', argTypes: [], result: { head: 'pair', indices: ['z'] } },
        { name: 'ps', argTypes: [], result: { head: 'pair', indices: ['(s z)'] } },
      ]],
      ['eq', [
        { name: 'refl', argTypes: [], result: { head: 'eq', indices: ['N', 'N'] } },
      ]],
    ]);
    const mv = new Set(['A']);
    const eqObs = [{ premiseText: 'eq A z', flexRemaining: ['A'], ruleName: 'r' }];
    const eqFact = [{ name: 'r0', extras: [], concl: 'eq z z', original: true }];
    expect(demandSplitVerdict('pair A', eqObs, eqFact, pairEq, mv) === 'demanded',
      'D.2.1: productive arm + rigidly-empty arm ⇒ demanded');
    expect(demandSplitVerdict('pair A', eqObs, [], pairEq, mv) === 'vacuous',
      'D.2.1: empty-only arms (no productive) stay vacuous — not demanded');
  }

  // componentOf: both arms expose `atom A` — demanded with empty existing facts.
  const tmCtors = new Map([
    ['tm', [
      { name: 'leaf', argTypes: ['atom A'], result: { head: 'tm', indices: ['A'] } },
      { name: 'twig', argTypes: ['atom A'], result: { head: 'tm', indices: ['A'] } },
    ]],
  ]);
  const tmArms = armRefinements('tm A', tmCtors, new Set(['A']));
  expect(tmArms.length === 2 && tmArms.every((a) => a.components && a.components.length === 1),
    'armRefinements attaches FO componentOf facts');
  expect(demandSplitVerdict('tm A', [
    { premiseText: 'atom A', flexRemaining: ['A'], ruleName: 'r' },
  ], [], tmCtors, new Set(['A'])) === 'demanded',
    'componentOf alone can demand a split (empty prior fact pool)');

  // needsDecOk: non-decOk existing fact does NOT count; arm components (decOk) do.
  const expCtors = new Map([
    ['exp', [
      { name: 'e0', argTypes: ['eval M R'], result: { head: 'exp', indices: ['M'] } },
      { name: 'e1', argTypes: ['eval M R'], result: { head: 'exp', indices: ['M'] } },
    ]],
  ]);
  const decObs = [{
    premiseText: 'eval M R', flexRemaining: ['M', 'R'], ruleName: 'ih', needsDecOk: true,
  }];
  const stale = [{ name: 'old', extras: [], concl: 'eval M R', original: true, decOk: false }];
  expect(demandSplitVerdict('exp M', decObs, stale, expCtors, new Set(['M', 'R'])) === 'demanded',
    'IH decreasing block: arm components (decOk) unblock where stale facts cannot');
  const expNatCtors = new Map([['exp', [
    { name: 'e0', argTypes: ['nat'], result: { head: 'exp', indices: ['M'] } },
    { name: 'e1', argTypes: ['nat'], result: { head: 'exp', indices: ['M'] } },
  ]]]);
  expect(demandSplitVerdict('exp M', decObs, stale, expNatCtors, new Set(['M', 'R'])) === 'vacuous',
    'IH decreasing block stays vacuous when arms cannot produce the premise');

  // Phase F.8/F.9: Pi-HO refined; bare-arrow HO skipped; demand open only when partial.
  const hoCtors = new Map([
    ['eq', [
      { name: 'eq_lam', argTypes: ['({x:exp} eq x x -> eq (M x) (N x))'],
        result: { head: 'eq', indices: ['(lam M)', '(lam N)'] } },
      { name: 'eq_app', argTypes: ['eq E1 F1', 'eq E2 F2'],
        result: { head: 'eq', indices: ['(app E1 E2)', '(app F1 F2)'] } },
    ]],
  ]);
  const bothArms = armRefinements('eq A B', hoCtors, new Set(['A', 'B']));
  expect(bothArms.length === 2 && !bothArms.partialHo,
    `F.9 Pi-HO eq_lam + FO eq_app both refine (got ${bothArms.map((a) => a.ctorName).join(',')})`);
  const lamArm = bothArms.find((a) => a.ctorName === 'eq_lam');
  expect(lamArm && lamArm.components.length === 1 && lamArm.components[0].extras.length >= 1,
    `F.9 HO arm carries under-binder extras (got ${JSON.stringify(lamArm && lamArm.components[0])})`);
  const hoArms = armRefinements('eq (app E1 E2) (app F1 F2)', hoCtors, new Set(['E1', 'E2', 'F1', 'F2']));
  expect(hoArms.length === 1 && hoArms[0].ctorName === 'eq_app',
    `F.8/F.9 app subject keeps FO eq_app (got ${hoArms.map((a) => a.ctorName).join(',')})`);
  expect(armRefinements('eq (lam M) (lam N)', hoCtors, new Set(['M', 'N'])).length === 1
    && armRefinements('eq (lam M) (lam N)', hoCtors, new Set(['M', 'N']))[0].ctorName === 'eq_lam',
    'F.9 lam subject refines eq_lam (Pi-HO)');

  const tmMix = new Map([
    ['tm', [
      { name: 'lam', argTypes: ['tm -> tm'], result: { head: 'tm', indices: [] } },
      { name: 'app', argTypes: ['tm', 'tm'], result: { head: 'tm', indices: [] } },
      { name: 'z', argTypes: [], result: { head: 'tm', indices: [] } },
    ]],
  ]);
  const tmMixArms = armRefinements('tm', tmMix, new Set());
  expect(tmMixArms.length === 2 && tmMixArms.partialHo === true
    && tmMixArms.every((a) => a.ctorName !== 'lam'),
    `F.8 bare-arrow lam still skipped; app/z kept (got ${tmMixArms.map((a) => a.ctorName).join(',')})`);
  // Demand's relatedness gate needs a shared meta; pin partialHo→open on that shape.
  const dMix = new Map([
    ['d', [
      { name: 'd_ho', argTypes: ['d -> d'], result: { head: 'd', indices: ['A'] } },
      { name: 'd_fo', argTypes: ['d'], result: { head: 'd', indices: ['A'] } },
    ]],
  ]);
  expect(demandSplitVerdict('d A', [
    { premiseText: 'd A', flexRemaining: ['A'], ruleName: 'r' },
  ], [], dMix, new Set(['A'])) === 'open',
    'F.8 bare-arrow partialHo keeps demand open');
  const mixSkel = [
    'case [ |- E] of',
    '| [ |- lam (\\x. M)] =>',
    '  ?',
    '| [ |- app X Y] =>',
    '  ?',
    '| [ |- z] =>',
    '  ?',
  ].join('\n');
  const mixFill = fillSplitPlan({
    splitText: mixSkel,
    subjectConcl: 'tm',
    goal: { ctx: '', concl: 'tm' },
    facts: [],
    rules: [],
    ctorsMap: tmMix,
    metaVars: new Set(),
  });
  expect(mixFill && mixFill.filledArms >= 1 && mixFill.openArms >= 1,
    `F.8 fillSplitPlan fills FO arm(s), leaves bare-arrow HO open (got filled=${mixFill && mixFill.filledArms} open=${mixFill && mixFill.openArms})`);
  expect(/lam[\s\S]*\?/.test(mixFill.text),
    `F.8 HO lam arm stays a hole (got ${mixFill && mixFill.text})`);
  expect(/app X Y[\s\S]*\[ \|- [XY]\]/.test(mixFill.text),
    `F.8 FO app arm closes from pattern (got ${mixFill && mixFill.text})`);

  // Phase F.9: HO lambda pattern body name is source-writable for residual synth.
  const pCtors = new Map([
    ['p', [
      { name: 'p_ho', argTypes: ['({x:tm} p (F x))'],
        result: { head: 'p', indices: ['(lam F)'] } },
      { name: 'p_fo', argTypes: ['tm'],
        result: { head: 'p', indices: ['A'] } },
    ]],
  ]);
  const piSkel = [
    'case [ |- E] of',
    '| [ |- p_ho (\\x. D)] =>',
    '  ?',
    '| [ |- p_fo X] =>',
    '  ?',
  ].join('\n');
  const piFill = fillSplitPlan({
    splitText: piSkel,
    subjectConcl: 'p (lam F)',
    goal: { ctx: '', concl: 'p F[.., z]' },
    facts: [],
    rules: [],
    ctorsMap: pCtors,
    metaVars: new Set(['F', 'A']),
  });
  expect(piFill && piFill.filledArms >= 1,
    `F.9 Pi-HO arm closes via under-binder fact (got filled=${piFill && piFill.filledArms})`);
  expect(/p_ho[\s\S]*D\[\.\., z\]/.test(piFill.text) && !/¿arm/.test(piFill.text),
    `F.9 HO body cites pattern name D not ¿arm (got ${piFill && piFill.text})`);
}

// ── Phase D Stage 2: fillSplitPlan reuses bridge case text + per-arm synth ───
{
  const vecCtors = new Map([
    ['vec', [
      { name: 'vnil', argTypes: [], result: { head: 'vec', indices: ['z'] } },
      { name: 'vcons', argTypes: ['nat', 'vec K'], result: { head: 'vec', indices: ['(s K)'] } },
    ]],
  ]);
  const skeleton = [
    'case [ |- V] of',
    '| [ |- vnil] : [ |- vec z] =>',
    '  ?',
    '| [ |- vcons N Xs] : [ |- vec (s N)] =>',
    '  ?',
  ].join('\n');

  // Goal independent of the refined meta — both arms close by the same fact.
  const both = fillSplitPlan({
    splitText: skeleton,
    subjectConcl: 'vec A',
    goal: { ctx: '', concl: 'ok' },
    facts: [{ name: 'u', extras: [], concl: 'ok', original: true }],
    rules: [],
    ctorsMap: vecCtors,
    metaVars: new Set(['A']),
  });
  expect(both && both.filledArms === 2, `both arms filled (got ${both && both.filledArms})`);
  expect(both.text.startsWith('case [ |- V] of'), 'case header reused byte-stable');
  expect(/\| \[ \|- vnil\]/.test(both.text) && /\| \[ \|- vcons/.test(both.text),
    'ctor patterns reused (never rebuilt)');
  expect(!/\?/.test(both.text), 'no open holes when every arm synthesizes');

  // Only vnil's refinement makes the goal match a fact.
  const partial = fillSplitPlan({
    splitText: skeleton,
    subjectConcl: 'vec A',
    goal: { ctx: '', concl: 'q A' },
    facts: [{ name: 'f0', extras: [], concl: 'q z', original: true }],
    rules: [],
    ctorsMap: vecCtors,
    metaVars: new Set(['A']),
  });
  expect(partial && partial.filledArms === 1 && partial.openArms === 1,
    `partial fill leaves one ? (got filled=${partial && partial.filledArms} open=${partial && partial.openArms})`);
  expect(/\?/.test(partial.text), 'unfilled arm keeps its ?');

  expect(fillSplitPlan({
    splitText: skeleton,
    subjectConcl: 'vec A',
    goal: { ctx: '', concl: 'nope' },
    facts: [],
    rules: [],
    ctorsMap: vecCtors,
    metaVars: new Set(['A']),
  }) === null, 'zero fills ⇒ null (fail-open; do not duplicate bare split)');

  const hoCtors2 = new Map([
    ['eq', [
      { name: 'eq_lam', argTypes: ['({x:exp} eq x x -> eq (M x) (N x))'],
        result: { head: 'eq', indices: ['(lam M)', '(lam N)'] } },
      { name: 'eq_app', argTypes: ['eq E1 F1', 'eq E2 F2'],
        result: { head: 'eq', indices: ['(app E1 E2)', '(app F1 F2)'] } },
    ]],
  ]);
  // Pre-F.9 this whole family failed open; Pi-HO now refines — residual closes from pool.
  const hoResidual = fillSplitPlan({
    splitText: 'case e of\n| eq_lam (\\x. \\u. E) =>\n  ?\n| eq_app A B =>\n  ?',
    subjectConcl: 'eq (lam M) (lam N)',
    goal: { ctx: '', concl: 'ok' },
    facts: [{ name: 'u', extras: [], concl: 'ok', original: true }],
    rules: [],
    ctorsMap: hoCtors2,
    metaVars: new Set(['M', 'N']),
  });
  expect(hoResidual && hoResidual.filledArms >= 1 && !/¿arm/.test(hoResidual.text),
    `F.9 Pi-HO residual fills without ¿arm (got ${hoResidual && hoResidual.text})`);

  // Phase F.2: arm components named from pattern metavars (not ¿armN).
  const viaComp = fillSplitPlan({
    splitText: skeleton,
    subjectConcl: 'vec A',
    goal: { ctx: '', concl: 'nat' },
    facts: [],
    rules: [],
    ctorsMap: vecCtors,
    metaVars: new Set(['A']),
  });
  expect(viaComp && viaComp.filledArms === 1 && viaComp.openArms === 1,
    `F.2 component-close fills vcons only (got filled=${viaComp && viaComp.filledArms})`);
  expect(/\[ \|- N\]/.test(viaComp.text) && !/¿arm/.test(viaComp.text),
    `F.2 body cites pattern name N, not ¿arm (got ${viaComp && viaComp.text})`);
  const bareSkel = [
    'case [ |- V] of',
    '| [ |- vnil] =>',
    '  ?',
    '| [ |- vcons N Xs] =>',
    '  ?',
  ].join('\n');
  const bareComp = fillSplitPlan({
    splitText: bareSkel,
    subjectConcl: 'vec A',
    goal: { ctx: '', concl: 'nat' },
    facts: [],
    rules: [],
    ctorsMap: vecCtors,
    metaVars: new Set(['A']),
  });
  expect(bareComp && /\[ \|- N\]/.test(bareComp.text) && !/¿arm/.test(bareComp.text),
    `F.2 bare pattern also names components from source (got ${bareComp && bareComp.text})`);

  // Phase F.3a: annotation FO binders enter the fact pool (prefer source index names).
  const evCtors = new Map([
    ['ev', [
      { name: 'e_z', argTypes: [], result: { head: 'ev', indices: ['z'] } },
      { name: 'e_app', argTypes: ['tm', 'tm'], result: { head: 'ev', indices: ['(app M N)'] } },
    ]],
  ]);
  const annSkel = [
    'case [ |- E] of',
    '| [ |- e_z] : [ |- ev z] =>',
    '  ?',
    '| [ |- e_app X Y] : [ |- ev (app M N)] =>',
    '  ?',
  ].join('\n');
  const annFill = fillSplitPlan({
    splitText: annSkel,
    subjectConcl: 'ev A',
    goal: { ctx: '', concl: 'tm' },
    facts: [],
    rules: [],
    ctorsMap: evCtors,
    metaVars: new Set(['A']),
  });
  expect(annFill && annFill.filledArms === 1,
    `F.3a annotation arm fills (got filled=${annFill && annFill.filledArms})`);
  expect(/\[ \|- [MN]\]/.test(annFill.text) && !/¿arm/.test(annFill.text),
    `F.3a body cites annotation binder M/N (got ${annFill && annFill.text})`);
  const bareEv = [
    'case [ |- E] of',
    '| [ |- e_z] =>',
    '  ?',
    '| [ |- e_app X Y] =>',
    '  ?',
  ].join('\n');
  const bareFill = fillSplitPlan({
    splitText: bareEv,
    subjectConcl: 'ev A',
    goal: { ctx: '', concl: 'tm' },
    facts: [],
    rules: [],
    ctorsMap: evCtors,
    metaVars: new Set(['A']),
  });
  expect(bareFill && /\[ \|- [XY]\]/.test(bareFill.text),
    `F.3a bare (no annotation) uses pattern names only (got ${bareFill && bareFill.text})`);

  // Phase F.4: annotation binders when count ≠ FO args (index-only metas).
  const ev3 = new Map([
    ['ev', [
      { name: 'e_z', argTypes: [], result: { head: 'ev', indices: ['z'] } },
      { name: 'e_tri', argTypes: ['tm', 'tm'],
        result: { head: 'ev', indices: ['(triple M N R)'] } },
    ]],
  ]);
  const triSkel = [
    'case [ |- E] of',
    '| [ |- e_z] : [ |- ev z] =>',
    '  ?',
    '| [ |- e_tri X Y] : [ |- ev (triple M N R)] =>',
    '  ?',
  ].join('\n');
  const triFill = fillSplitPlan({
    splitText: triSkel,
    subjectConcl: 'ev A',
    goal: { ctx: '', concl: 'tm' },
    facts: [],
    rules: [],
    ctorsMap: ev3,
    metaVars: new Set(['A']),
  });
  expect(triFill && triFill.filledArms === 1,
    `F.4 non-1:1 annotation fills (got filled=${triFill && triFill.filledArms})`);
  expect(/\[ \|- [MNR]\]/.test(triFill.text) && !/¿arm/.test(triFill.text),
    `F.4 body cites annotation index M/N/R (got ${triFill && triFill.text})`);

  // Phase F.5: bare result-index binders typed by family kind (derivation args
  // make F.4 objectSortGuess fail — R must come from `ev : tm → tm → type`).
  const evApp = new Map([
    ['ev', [
      { name: 'e_z', argTypes: [], result: { head: 'ev', indices: ['z', 'z'] } },
      { name: 'e_app', argTypes: ['ev X', 'ev Y'],
        result: { head: 'ev', indices: ['(app M N)', 'R'] } },
    ]],
  ]);
  const famKinds = new Map([['ev', ['tm', 'tm']]]);
  const appSkel = [
    'case [ |- E] of',
    '| [ |- e_z] : [ |- ev z z] =>',
    '  ?',
    '| [ |- e_app D1 D2] : [ |- ev (app M N) R] =>',
    '  ?',
  ].join('\n');
  const appArgs = {
    splitText: appSkel,
    subjectConcl: 'ev A B',
    goal: { ctx: '', concl: 'tm' },
    facts: [],
    rules: [],
    ctorsMap: evApp,
    metaVars: new Set(['A', 'B']),
  };
  const appBare = fillSplitPlan(appArgs);
  expect(!(appBare && appBare.filledArms),
    `F.5 without familyKinds cannot type index R from derivation args (got ${appBare && appBare.filledArms})`);
  const appFill = fillSplitPlan({ ...appArgs, familyKinds: famKinds });
  expect(appFill && appFill.filledArms === 1,
    `F.5 family kind types bare index R (got filled=${appFill && appFill.filledArms})`);
  expect(/\[ \|- R\]/.test(appFill.text) && !/¿arm/.test(appFill.text),
    `F.5 body cites annotation index R (got ${appFill && appFill.text})`);

  // Phase F.6: nested FO args of compound indices ← index-head ctor spine.
  // Distinct sort `arg` so F.5's bare-index `R : tm` cannot close the goal.
  const needArg = {
    splitText: appSkel,
    subjectConcl: 'ev A B',
    goal: { ctx: '', concl: 'arg' },
    facts: [],
    rules: [],
    metaVars: new Set(['A', 'B']),
    familyKinds: famKinds,
  };
  const argCtors = new Map([
    ['ev', evApp.get('ev')],
    ['tm', [
      { name: 'z', argTypes: [], result: { head: 'tm', indices: [] } },
      { name: 'app', argTypes: ['arg', 'arg'], result: { head: 'tm', indices: [] } },
    ]],
  ]);
  const noArg = fillSplitPlan({ ...needArg, ctorsMap: new Map([['ev', evApp.get('ev')]]) });
  expect(!(noArg && noArg.filledArms),
    `F.6 without index-head ctor cannot type nested M/N as arg (got ${noArg && noArg.filledArms})`);
  const withArg = fillSplitPlan({ ...needArg, ctorsMap: argCtors });
  expect(withArg && withArg.filledArms === 1,
    `F.6 types nested M/N from app spine (got filled=${withArg && withArg.filledArms})`);
  expect(/\[ \|- [MN]\]/.test(withArg.text) && !/¿arm/.test(withArg.text),
    `F.6 body cites nested annotation binder M/N (got ${withArg && withArg.text})`);
}

// ── Phase E.2: fillIntroPlan composes intro + residual synth (one certify) ───
{
  const id = fillIntroPlan({
    introText: 'fn x => ?',
    goalType: '[ |- eq N N] -> [ |- eq N N]',
    facts: [],
    rules: [],
    ctorsMap: new Map(),
  });
  expect(id && id.closingPlan && id.text === 'fn x => x',
    `identity intro plan closes with binder (got ${id && id.text})`);
  expect(fillIntroPlan({
    introText: 'fn x => ?',
    goalType: '[ |- eq N N] -> [ |- eq (s N) N]',
    facts: [],
    rules: [],
    ctorsMap: new Map(),
  }) === null, 'false residual fails closed (null, not a fake closer)');
  expect(fillIntroPlan({
    introText: 'fn a => fn b => ?',
    goalType: '[ |- eq N N] -> [ |- eq N N] -> [ |- eq N N]',
    facts: [],
    rules: [],
    ctorsMap: new Map(),
  })?.text === 'fn a => fn b => a' || fillIntroPlan({
    introText: 'fn a => fn b => ?',
    goalType: '[ |- eq N N] -> [ |- eq N N] -> [ |- eq N N]',
    facts: [],
    rules: [],
    ctorsMap: new Map(),
  })?.text === 'fn a => fn b => b',
    'two-premise identity closes with a binder fact');
}

// ── Phase E.4: fillInvertPlan — unique invert + residual synth (one certify) ─
{
  const oftCtors = new Map([
    ['oft', [
      { name: 'oft_z', argTypes: [], result: { head: 'oft', indices: ['z'] } },
      { name: 'oft_s', argTypes: ['oft N'], result: { head: 'oft', indices: ['(s N)'] } },
    ]],
  ]);
  const closed = fillInvertPlan({
    invertText: 'let [ |- oft_s X] = h in\n?',
    goal: { ctx: '', concl: 'oft N' },
    facts: [{ name: 'h', extras: [], concl: 'oft (s N)', original: true, decOk: true }],
    rules: [],
    ctorsMap: oftCtors,
    metaVars: new Set(['N']),
  });
  expect(closed && closed.closingPlan && /oft_s X/.test(closed.text) && /\[ \|- X\]/.test(closed.text),
    `unique invert+synth closes with component (got ${closed && closed.text})`);
  expect(closed.hyp === 'h', `invert plan records hyp (got ${closed && closed.hyp})`);
  expect(fillInvertPlan({
    invertText: 'let [ |- oft_s X] = h in\n?',
    goal: { ctx: '', concl: 'ok' },
    facts: [{ name: 'h', extras: [], concl: 'oft (s N)', original: true, decOk: true }],
    rules: [],
    ctorsMap: oftCtors,
    metaVars: new Set(['N']),
  }) === null, 'false residual after invert fails closed');
  expect(fillInvertPlan({
    invertText: 'let [ |- oft_s X] = h in\n?',
    goal: { ctx: '', concl: 'oft N' },
    facts: [{ name: 'h', extras: [], concl: 'oft M', original: true, decOk: true }],
    rules: [],
    ctorsMap: oftCtors,
    metaVars: new Set(['M', 'N']),
  }) === null, 'ambiguous invert (oft M) fails closed');
  expect(fillInvertPlan({
    invertText: 'let [g |- #q.1[..]] = h in\n?',
    goal: { ctx: 'g', concl: 'oft N' },
    facts: [{ name: 'h', extras: [], concl: 'oft N', original: true, decOk: true }],
    rules: [],
    ctorsMap: oftCtors,
    metaVars: new Set(['N']),
  }) === null, 'param invert fails open (null)');
}

// ── Phase F.3b: annotation FO binders in fillInvertPlan (mirror F.3a) ─────────
{
  const evCtors = new Map([
    ['ev', [
      { name: 'e_z', argTypes: [], result: { head: 'ev', indices: ['z'] } },
      { name: 'e_app', argTypes: ['tm', 'tm'], result: { head: 'ev', indices: ['(app M N)'] } },
    ]],
  ]);
  const annInv = fillInvertPlan({
    invertText: 'let [ |- e_app X Y] : [ |- ev (app M N)] = h in\n?',
    goal: { ctx: '', concl: 'tm' },
    facts: [{ name: 'h', extras: [], concl: 'ev (app M N)', original: true, decOk: true }],
    rules: [],
    ctorsMap: evCtors,
    metaVars: new Set(['M', 'N']),
  });
  expect(annInv && annInv.closingPlan && /\[ \|- [MN]\]/.test(annInv.text),
    `F.3b annotated invert cites annotation binder (got ${annInv && annInv.text})`);
  const bareInv = fillInvertPlan({
    invertText: 'let [ |- e_app X Y] = h in\n?',
    goal: { ctx: '', concl: 'tm' },
    facts: [{ name: 'h', extras: [], concl: 'ev (app M N)', original: true, decOk: true }],
    rules: [],
    ctorsMap: evCtors,
    metaVars: new Set(['M', 'N']),
  });
  expect(bareInv && /\[ \|- [XY]\]/.test(bareInv.text),
    `F.3b bare invert uses pattern names only (got ${bareInv && bareInv.text})`);
}

// ── Phase E.5: fillInvertChainPlan — depth≥2 unique-FO chain (one certify) ───
{
  const oftCtors = new Map([
    ['oft', [
      { name: 'oft_z', argTypes: [], result: { head: 'oft', indices: ['z'] } },
      { name: 'oft_s', argTypes: ['oft N'], result: { head: 'oft', indices: ['(s N)'] } },
    ]],
  ]);
  const open = fillInvertChainPlan({
    invertText: 'let [ |- oft_s X] = h in\n?',
    goal: { ctx: '', concl: 'ok' },
    facts: [{ name: 'h', extras: [], concl: 'oft (s (s N))', original: true, decOk: true }],
    rules: [],
    ctorsMap: oftCtors,
    metaVars: new Set(['N']),
  });
  expect(open && !open.closingPlan && open.chainLen >= 2 && /\?\s*$/.test(open.text),
    `open invert chain depth≥2 (got ${open && open.text})`);
  expect(/oft_s X/.test(open.text) && /oft_s C1/.test(open.text),
    `chain nests a second unique invert (got ${open && open.text})`);
  const nestedClose = fillInvertChainPlan({
    invertText: 'let [ |- oft_s X] = h in\n?',
    goal: { ctx: '', concl: 'oft N' },
    facts: [{ name: 'h', extras: [], concl: 'oft (s (s N))', original: true, decOk: true }],
    rules: [],
    ctorsMap: oftCtors,
    metaVars: new Set(['N']),
  });
  expect(nestedClose && nestedClose.closingPlan && nestedClose.chainLen >= 2 && !/\?/.test(nestedClose.text),
    `closing invert chain fills residual (got ${nestedClose && nestedClose.text})`);
  expect(fillInvertChainPlan({
    invertText: 'let [ |- oft_s X] = h in\n?',
    goal: { ctx: '', concl: 'ok' },
    facts: [{ name: 'h', extras: [], concl: 'oft (s N)', original: true, decOk: true }],
    rules: [],
    ctorsMap: oftCtors,
    metaVars: new Set(['N']),
  }) === null, 'length-1 open chain not emitted (bare invert owns it)');
  expect(fillInvertChainPlan({
    invertText: 'let [ |- oft_s X] = h in\n?',
    goal: { ctx: '', concl: 'oft N' },
    facts: [{ name: 'h', extras: [], concl: 'oft M', original: true, decOk: true }],
    rules: [],
    ctorsMap: oftCtors,
    metaVars: new Set(['M', 'N']),
  }) === null, 'ambiguous root fails closed');
}

// ── ¿-remnant uniqueness refusal (the unique_eval chain trap, 2026-07-18) ────
// r_mk's premise index U never appears in its conclusion, so the root
// inversion leaves the component typed `rel P ¿U` — an unresolved existential.
// Judging link-2 uniqueness with ¿U rigid falsely excludes the nonlinear r_wr
// (`wr ¿X` vs rigid ¿U fails) and turns a refining COMMITMENT into a claimed
// inversion — the accepted "invert" then silently refines the branch-universal
// P and poisons the branch. With ≥2 ctors and a remnant the chain must REFUSE.
{
  const relCtors = new Map([
    ['rel', [
      { name: 'r_mk', argTypes: ['rel A U'], result: { head: 'rel', indices: ['(mk A B)', 'V'] } },
      { name: 'r_wr', argTypes: [], result: { head: 'rel', indices: ['(wr X)', '(wr X)'] } },
    ]],
  ]);
  expect(fillInvertChainPlan({
    invertText: 'let [ |- r_mk C1] = h in\n?',
    goal: { ctx: '', concl: 'ok' },
    facts: [{ name: 'h', extras: [], concl: 'rel (mk P Q) W', original: true, decOk: true }],
    rules: [],
    ctorsMap: relCtors,
    metaVars: new Set(['P', 'Q', 'W']),
  }) === null, '¿-remnant component refuses the multi-ctor chain link (no false-unique inversion)');
  // Single-ctor family: unique under EVERY instantiation — the remnant cannot
  // create ambiguity, so the chain may still walk it (completeness guard).
  const oneCtors = new Map([
    ['rel', [
      { name: 'r_mk', argTypes: ['rel A U'], result: { head: 'rel', indices: ['(mk A B)', 'V'] } },
    ]],
  ]);
  const oneChain = fillInvertChainPlan({
    invertText: 'let [ |- r_mk C1] = h in\n?',
    goal: { ctx: '', concl: 'ok' },
    facts: [{ name: 'h', extras: [], concl: 'rel (mk P Q) W', original: true, decOk: true }],
    rules: [],
    ctorsMap: oneCtors,
    metaVars: new Set(['P', 'Q', 'W']),
  });
  expect(oneChain && oneChain.chainLen >= 2,
    `single-ctor family stays chain-invertible under a remnant (got ${oneChain && oneChain.text})`);
}

// ── INVERSION-UNLOCK demand (2026-07-19, prd_det shape) ──────────────────────
// Both arms of the split on s1 : `pr N R1` refine N so that the SIBLING fact
// s2 : `pr N R2` becomes NEWLY uniquely-invertible (was 2-ctor ambiguous) —
// deterministic information, so the split is demanded even though no
// obligation premise resolves in any arm. Without a second fact there is
// nothing to unlock and the same split stays vacuous.
{
  const prCtors = new Map([
    ['pr', [
      { name: 'pr_z', argTypes: [], result: { head: 'pr', indices: ['k0', 'k0'] } },
      { name: 'pr_s', argTypes: [], result: { head: 'pr', indices: ['(k1 X)', 'X'] } },
    ]],
  ]);
  const obs = [{ premiseText: 'pr ¿n ¿r', ruleName: 't', flexRemaining: ['¿n', '¿r'], needsDecOk: true }];
  const two = demandSplitVerdict('pr N R1', obs, [
    { name: 's1', extras: [], concl: 'pr N R1', original: true, decOk: false },
    { name: 's2', extras: [], concl: 'pr N R2', original: true, decOk: false },
  ], prCtors, new Set(['N', 'R1', 'R2']));
  // RESCUED from vacuous (certifiable at normal split rank) — never PROMOTED
  // to demanded (unlock-promotion outranked times_det's winning lemma path).
  expect(two === 'open',
    `arms that newly-invert a sibling fact are rescued to open (got ${two})`);
  const lone = demandSplitVerdict('pr N R1', obs, [
    { name: 's1', extras: [], concl: 'pr N R1', original: true, decOk: false },
  ], prCtors, new Set(['N', 'R1']));
  expect(lone === 'vacuous',
    `with nothing to unlock the split stays vacuous (got ${lone})`);
}

// ── Phase F.1: annotated unique invert binds index metas in source ───────────
{
  const oftCtors = new Map([
    ['oft', [
      { name: 'oft_z', argTypes: [], result: { head: 'oft', indices: ['z'] } },
      { name: 'oft_s', argTypes: ['oft N'], result: { head: 'oft', indices: ['(s N)'] } },
    ]],
  ]);
  const INV = [
    'nat : type.', 'z : nat.', 's : nat -> nat.',
    'oft : nat -> type.',
    'oft_z : oft z.',
    'oft_s : oft N -> oft (s N).',
  ].join('\n');
  const ann = invertCandidates(
    { name: 'h', type: '[ |- oft (s N)]' }, INV, [], undefined, { annotate: true },
  );
  expect(ann.length === 1 && /: \[ \|- oft \(s \w+\)\]/.test(ann[0]),
    `F.1 annotated unique invert binds index (got ${JSON.stringify(ann)})`);
  const idx = (ann[0].match(/oft \(s (\w+)\)/) || [])[1];
  expect(idx && new RegExp(`\\b${idx}\\b`).test(ann[0]),
    `F.1 index name appears in annotated let (got ${ann[0]})`);
  // E.4 still closes when the bridge offers the annotated spelling.
  const closedAnn = fillInvertPlan({
    invertText: `${ann[0]}\n?`,
    goal: { ctx: '', concl: 'oft N' },
    facts: [{ name: 'h', extras: [], concl: 'oft (s N)', original: true, decOk: true }],
    rules: [],
    ctorsMap: oftCtors,
    metaVars: new Set(['N']),
  });
  expect(closedAnn && closedAnn.closingPlan && /oft_s/.test(closedAnn.text),
    `E.4 accepts annotated invert (got ${closedAnn && closedAnn.text})`);
  // After the annotated let is in the path body, the index is source-writable.
  const code = [
    'nat : type.', 'z : nat.', 's : nat -> nat.',
    'oft : nat -> type.', 'oft_z : oft z.', 'oft_s : oft N -> oft (s N).',
    'rec thm : [ |- oft (s N)] -> [ |- oft N] =',
    'fn h =>',
    ann[0],
    '?',
    ';',
  ].join('\n');
  const hole = { line: 10, col: 1, meta: [{ name: idx, type: '( |- nat)' }], ctx: [] };
  const writable = sourceWritableNames(code, hole, { name: 'thm' });
  expect(writable.has(idx), `F.1 annotation makes index ${idx} source-writable`);
  expect(!inventedReportNames(hole, writable).includes(idx),
    'F.1 annotated index is not an invented report name');
}

// ── Phase F.0: source-writable set vs invented hole-report names ─────────────
{
  const code = [
    'nat : type.',
    'z : nat.',
    'rec id : [ |- nat] -> [ |- nat] =',
    'fn x =>',
    '?',
    ';',
  ].join('\n');
  const hole = { line: 5, col: 1, meta: [{ name: 'X1', type: '( |- nat)' }, { name: 'x', type: '[ |- nat]' }], ctx: [] };
  const writable = sourceWritableNames(code, hole, { name: 'id' });
  expect(writable.has('x') && writable.has('id') && writable.has('z'),
    `source binders/ctors are writable (got ${[...writable].slice(0, 12).join(',')})`);
  expect(!writable.has('X1'), 'checker-invented X1 is absent from source text');
  const invented = inventedReportNames(hole, writable);
  expect(invented.includes('X1') && !invented.includes('x'),
    `invented = {X1} not x (got ${invented.join(',')})`);
  expect(textReferencesNames('k_comm [ |- X1] [ |- z]', invented),
    'named object-Pi citing X1 is detected');
  expect(!textReferencesNames('k_comm [ |- _] [ |- _]', invented),
    'inferred `_` spelling does not cite invented names');
  expect(!textReferencesNames('fn x => x', invented),
    'source binder use is clean');
}

// ── Phase F.7: invented report facts never cited by name ─────────────────────
{
  const natCtors = new Map([
    ['nat', [
      { name: 'z', argTypes: [], result: { head: 'nat', indices: [] } },
      { name: 's', argTypes: ['nat'], result: { head: 'nat', indices: [] } },
    ]],
  ]);
  // Invented X1 would otherwise steal the direct fill; skip → constructor z.
  const preferCtor = synthesize(
    { ctx: '', concl: 'nat' },
    [{ name: 'X1', extras: [], concl: 'nat', original: true, decOk: false, invented: true }],
    [],
    natCtors,
    {},
  );
  expect(preferCtor && /\bz\b/.test(preferCtor.text) && !/\bX1\b/.test(preferCtor.text),
    `F.7 prefers ctor over invented fact cite (got ${preferCtor && preferCtor.text})`);
  // Only invented fact for an empty family → honest null (no unwritable cite).
  expect(synthesize(
    { ctx: '', concl: 'ghost' },
    [{ name: 'X9', extras: [], concl: 'ghost', original: true, invented: true }],
    [],
    new Map([['ghost', []]]),
    {},
  ) === null, 'F.7 invented-only fact does not emit a named cite');
  // Premise slot: writable fact preferred over invented twin.
  const twin = synthesize(
    { ctx: '', concl: 'unit' },
    [
      { name: 'X1', extras: [], concl: 'nat', original: true, invented: true },
      { name: 'n', extras: [], concl: 'nat', original: true },
    ],
    [{
      name: 'wrap', isIH: false, decIdx: -1, flex: new Set(),
      pis: [], premises: ['nat'], result: 'unit',
    }],
    new Map([['unit', [{ name: 'u', argTypes: [], result: { head: 'unit', indices: [] } }]]]),
    {},
  );
  expect(twin && /wrap/.test(twin.text) && /\bn\b/.test(twin.text) && !/\bX1\b/.test(twin.text),
    `F.7 premise slot cites writable n not invented X1 (got ${twin && twin.text})`);
}

// ── E.2 REGRESSION PIN: intro-bound premises are NEVER decOk ─────────────────
// The theorem's own premise fresh off `fn` is the RAW derivation, not a split's
// sub-derivation — marking it decOk let the IH consume itself (`fn e => f e`),
// and because the closing plan dominated the bare intro, the self-call was the
// ONLY intro offered (the eq_sym loss, 2026-07-17 sweep). The plan must refuse.
{
  const selfCall = fillIntroPlan({
    introText: 'fn e => ?',
    goalType: '[ |- rel2 N M] -> [ |- rel2 M N]',
    facts: [],
    rules: [{
      name: 'symthm', isIH: true, decIdx: 0,
      flex: new Set(['M', 'N']),
      pis: [], premises: ['rel2 N M'], result: 'rel2 M N',
    }],
    ctorsMap: new Map(),
  });
  expect(selfCall === null,
    `E.2 intro plan refuses the IH self-call (got ${selfCall && selfCall.text})`);
}

// ── P10: binders bound ON THE HOLE'S LINE are source-writable ────────────────
// `mlam q => fn r => ?` puts the theorem's own premises on the hole's line;
// excluding that line tagged them INVENTED and F.7 forbade synth from citing
// them — the todbruijn wrong-chain (synth fell to a garbage ctor fill).
{
  const code = 'rec t9 : [ |- fam_a] -> [ |- fam_b] =\nmlam q9 => fn r9 => ?\n;';
  const w = sourceWritableNames(code, { line: 2, col: 20 }, { name: 't9' });
  expect(w.has('q9') && w.has('r9'),
    `P10 same-line binders before the hole are writable (got q9=${w.has('q9')} r9=${w.has('r9')})`);
}

// ── DEMAND-PROBE SOUNDNESS (the vacuous-verdict fixes, 2026-07-17 sweep) ─────
{
  // (i) Implicit metas: an empty cD still has refinable uppercase index metas —
  // the m_ref-style arm (rel2 X X) must unify via refinement, not be lost.
  // (ii) A fully-schematic obligation (IH under an `empty` goal binds nothing)
  // relates by FAMILY HEAD. (iii) Schematic arm components resolve premises by
  // SYMMETRIC unification. Together: the split is never 'vacuous'.
  const dCtors = new Map([
    ['walk', [
      { name: 'w_ref', argTypes: [], result: { head: 'walk', indices: ['M', 'M'] } },
      { name: 'w_step', argTypes: ['hop M K', 'walk K N'], result: { head: 'walk', indices: ['M', 'N'] } },
    ]],
    ['hop', [
      { name: 'h1', argTypes: [], result: { head: 'hop', indices: ['a1', 'a2'] } },
      { name: 'h2', argTypes: [], result: { head: 'hop', indices: ['a2', 'a1'] } },
    ]],
  ]);
  const schematicObl = [{
    premiseText: 'walk ¿M ¿N', ruleName: 'refute', flexRemaining: ['¿M', '¿N'],
    partialTheta: new Map(), resolvedSoFar: [], depth: 3, needsDecOk: true,
  }];
  const v = demandSplitVerdict('walk M N', schematicObl, [], dCtors, new Set());
  expect(v !== 'vacuous',
    `demand probe: schematic decOk obligation + implicit-meta subject is not vacuous (got ${v})`);
}

// ── P11: unstrippable parenthesized tokens must not recurse forever ──────────
// `(a)(b)` starts with `(` but is not one balanced group — stripParens returns
// it unchanged, and the paren recursion in matchT/unifyT re-entered with
// identical arguments until the stack overflowed (the wk heldout crash,
// 2026-07-18). Must terminate with an honest non-match, not crash.
{
  const junkRule = [{
    name: 'jr', isIH: false, decIdx: -1, flex: new Set(),
    pis: [], premises: [], result: 'jfam (a1)(a2)',
  }];
  let crashed = false;
  let out = null;
  try {
    out = synthesize({ ctx: '', concl: 'jfam (b1)(b2)' }, [], junkRule, new Map(), {});
  } catch (e) {
    crashed = true;
  }
  expect(!crashed && out === null,
    `P11 unstrippable paren tokens terminate honestly (crashed=${crashed})`);
}

// ── DESCENT CLASSIFICATION (the termination architecture) ────────────────────
// classifyRuleDescent partitions rules structurally (never by name) into the
// three classes whose policies make backward chaining terminate without budgets.
{
  const mk = (premises, result, flexNames) => ({
    name: 'r', isIH: false, decIdx: -1, flex: new Set(flexNames),
    pis: [], premises, result,
  });
  // Every premise arg a subterm of a conclusion arg, ≥1 strictly ⇒ descending.
  expect(classifyRuleDescent(mk(['sum M N K'], 'sum (c1 M) N (c1 K)', ['M', 'N', 'K'])) === 'descending',
    'descent: structural-recursion shape classifies descending');
  // Permutation (sym shape): contained but never strict ⇒ orbit.
  expect(classifyRuleDescent(mk(['rel M N'], 'rel N M', ['M', 'N'])) === 'orbit',
    'descent: symmetric shape classifies orbit');
  // Fresh bare existential middle (trans shape): no growth ⇒ orbit.
  expect(classifyRuleDescent(mk(['rel M K', 'rel K N'], 'rel M N', ['M', 'N', 'K'])) === 'orbit',
    'descent: fresh-middle transitivity classifies orbit');
  // Premise wraps a schematic in rigid structure absent from the conclusion ⇒
  // growing (the p X ← q (s X) counter-machine — the non-terminating dimension).
  expect(classifyRuleDescent(mk(['fam2 (c1 X)'], 'fam1 X', ['X'])) === 'growing',
    'descent: rigid growth around a schematic classifies growing');
  // Evaluation shape: premise arg (M' N) is fresh structure ⇒ growing.
  expect(classifyRuleDescent(
    mk(["run M (v1 M')", "run (M' N) R"], 'run (a1 M N) R', ['M', "M'", 'N', 'R']),
  ) === 'growing', 'descent: eval-app shape classifies growing');
}

// ── GROWING GATE: growth-chasing recursion is fact-only; termination is by
// construction, and a clean exhaustion is CERTIFIED (stats.exhausted), never a
// silent depth verdict. Invented mutual counter-machine: pre-gate this spiralled
// to the depth bound (searchBounded); now it exhausts finitely and says so. ──
{
  const counterRules = [
    { name: 'stepP', isIH: false, decIdx: -1, flex: new Set(['X']), pis: [], premises: ['famQ (c1 X)'], result: 'famP X' },
    { name: 'stepQ', isIH: false, decIdx: -1, flex: new Set(['X']), pis: [], premises: ['famP X'], result: 'famQ X' },
  ];
  const stats = {};
  const spun = synthesize(
    { ctx: '', concl: 'famP a0' }, [], counterRules, new Map(), { stats },
  );
  expect(spun === null, 'growing gate: counter-machine yields honest null');
  expect(!stats.boundHit, 'growing gate: no bound fires (termination by construction)');
  expect(stats.exhausted === true, 'growing gate: clean exhaustion is certified');
}

// ── GROWING rules still resolve their premises from FACTS (the gate blocks
// recursion, never fact-matching): one growth step backed by a hypothesis. ──
{
  const growRule = [{
    name: 'lower', isIH: false, decIdx: -1, flex: new Set(['M']),
    pis: [], premises: ['famA (c1 M)'], result: 'famB M',
  }];
  const withFact = synthesize(
    { ctx: '', concl: 'famB a0' },
    [{ name: 'h1', extras: [], concl: 'famA (c1 a0)', original: true, decOk: false }],
    growRule, new Map(), {},
  );
  expect(withFact && /lower/.test(withFact.text) && /h1/.test(withFact.text) && !/\?/.test(withFact.text),
    `growing gate: fact-resolved growth step still closes (got ${withFact && withFact.text})`);
}

// ── ORBIT recursion is NOT gated: a fresh-middle chain needing ground recursion
// through the finite fact orbit still closes (completeness under the gate). ──
{
  const chainRules = [{
    name: 'trans2', isIH: false, decIdx: -1, flex: new Set(['M', 'K', 'N']),
    pis: [], premises: ['rel M K', 'rel K N'], result: 'rel M N',
  }];
  const chain = synthesize(
    { ctx: '', concl: 'rel a0 d0' },
    [
      { name: 'h1', extras: [], concl: 'rel a0 b0', original: true, decOk: false },
      { name: 'h2', extras: [], concl: 'rel b0 c0', original: true, decOk: false },
      { name: 'h3', extras: [], concl: 'rel c0 d0', original: true, decOk: false },
    ],
    chainRules, new Map(), {},
  );
  expect(chain && !/\?/.test(chain.text) && /trans2/.test(chain.text),
    `orbit recursion: 3-link fresh-middle chain closes (got ${chain && chain.text})`);

  // DEPTH RETIREMENT differential: a 7-link chain sits beyond the old depth-5
  // wall — pre-G.2 this was a silent depth death; the finite orbit closes it.
  const links = ['a0', 'b0', 'c0', 'd0', 'e0', 'f0', 'g0', 'h0'];
  const deepFacts = links.slice(0, -1).map((x, i) => ({
    name: `h${i + 1}`, extras: [], concl: `rel ${x} ${links[i + 1]}`, original: true, decOk: false,
  }));
  const deepStats = {};
  const deep = synthesize(
    { ctx: '', concl: `rel a0 h0` }, deepFacts, chainRules, new Map(), { stats: deepStats },
  );
  expect(deep && !/\?/.test(deep.text),
    `depth retirement: 7-link chain closes beyond the old depth wall (got ${deep && deep.text})`);
}

console.log('OK test-prover-synth (backward chaining derives the eval_app1 reference chain; termination + honesty + object-Pi dual spelling pinned)');
