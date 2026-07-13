// BelJar-native case-split + intro skeleton generation. These pin that BelJar
// builds well-typed patterns FROM ITS OWN MODEL (constructors enumerated from our
// AST, arities + higher-order args read from the AST, parameter-variable branch
// from the schema) — NOT by wrapping Beluga's `%:split` printer text. See
// [[feedback-beljar-not-beluga-wrapper]].
import fs from 'node:fs';
import {
  decomposeContextual,
  headOfConclusion,
  typeFamilyHead,
  enumerateLFConstructors,
  schemaAdmittedTypes,
  schemaInfo,
  parameterTermFor,
  contextAdmitsHead,
  constructorTerm,
  boxPattern,
  buildSplitSkeleton,
  introBinders,
  buildIntroSkeleton,
  fillCandidates,
  branchLetNames,
  enumerateConstructorsTyped,
  splitConstructorsForGoal,
  constructorArgDescriptor,
  synthesizeFills,
  invertCandidates,
  parseAppType,
  infixDeclaredOps,
  renderApp,
} from '../editor-src/bel-hole-split.mjs';
import { transformBelugaStep, scrutineeIsParameterDetermined } from '../editor-src/bel-hole-actions.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const CODE = `LF nat : type =
| z : nat
| s : nat -> nat
;
LF tm : type =
| app : tm -> tm -> tm
| lam : (tm -> tm) -> tm
;
LF tp : type = ;
LF term : tp -> type =
| c : {A:tp} term A -> term A
;
schema ctx = tm ;`;

// ── Contextual decomposition + head ─────────────────────────────────────────
expect(JSON.stringify(decomposeContextual('[ |- nat]')) === JSON.stringify({ ctx: '', concl: 'nat', boxed: true }),
  'decompose empty-context box');
const d2 = decomposeContextual('[g, x:tm |- tm]');
expect(d2 && d2.ctx === 'g, x:tm' && d2.concl === 'tm', 'decompose context box');
expect(decomposeContextual('nat') === null, 'a bare comp type is not a boxed scrutinee');
const metaBox = decomposeContextual('(x : tm, x11 : oft x A9[] |- oft (R9[x]) B9[])');
expect(metaBox && metaBox.ctx === 'x : tm, x11 : oft x A9[]' && metaBox.concl === 'oft (R9[x]) B9[]',
  'decompose meta-context ( … ) box');
expect(headOfConclusion('nat') === 'nat' && headOfConclusion('term A') === 'term', 'head of conclusion spine');

const linearCtors = [
  { name: 'l_fwd', args: [] },
  { name: 'l_out', args: [{ higherOrder: false, binders: 0 }] },
  { name: 'l_wait2', args: [{ higherOrder: false, binders: 0 }] },
];
const typedRaw = [
  { name: 'l_out', result: { indices: ['(\\x. out x P Q)'] }, argTypes: ['linear Q'] },
  { name: 'l_wait2', result: { indices: ['(\\z. wait X (P z))'] }, argTypes: ['linear P'] },
];
// splitConstructorsForGoal returns the FULL constructor set (coverage); any
// narrowing is the checker's job via index unification, not a family-specific filter.
expect(splitConstructorsForGoal('linear (\\x. P[..])', linearCtors).length === 3,
  'split keeps all constructors of the scrutinee family (checker narrows)');
expect(splitConstructorsForGoal('linear (\\y. P[.., y])', linearCtors).length === 3,
  'split keeps all constructors regardless of opacity');

const stepCtors = [
  { name: 'βfwd', args: [] },
  { name: 'β∥1', args: [{ higherOrder: true }] },
];
expect(splitConstructorsForGoal('P[..] ⇛ Q', stepCtors).length === 2,
  '⇛ metavar scrutinee keeps all step constructors');

const dyn = fs.readFileSync('library/data/case-studies/classical-processes/cp_dyn.bel', 'utf8');
expect(enumerateConstructorsTyped(dyn, '⇛').some((x) => x.name === 'βfwd'),
  'cp_dyn infix ⇛ enumerates βfwd');
expect(typeFamilyHead('β∥1 (\\d. X[.., d, x])', dyn) === '⇛',
  'HO ctor pattern maps to infix ⇛ family for split/branch metas');

// ── Constructor enumeration from OUR AST ────────────────────────────────────
const nats = enumerateLFConstructors(CODE, 'nat');
expect(nats.length === 2 && nats[0].name === 'z' && nats[1].name === 's', 'nat ctors z, s');
expect(nats[0].args.length === 0, 'z has arity 0');
expect(nats[1].args.length === 1 && !nats[1].args[0].higherOrder, 's has one first-order arg');

const tms = enumerateLFConstructors(CODE, 'tm');
expect(tms[0].name === 'app' && tms[0].args.length === 2, 'app has arity 2');
expect(tms[1].name === 'lam' && tms[1].args.length === 1 && tms[1].args[0].higherOrder && tms[1].args[0].binders === 1,
  'lam has one HIGHER-ORDER arg with one binder');

// Implicit `{A:tp}` is NOT a positional pattern arg.
const terms = enumerateLFConstructors(CODE, 'term');
expect(terms.length === 1 && terms[0].name === 'c' && terms[0].args.length === 1,
  'c skips the implicit {A:tp}, explicit arity 1');

expect(enumerateLFConstructors(CODE, 'nope') === null, 'unknown family → null');

// ── Pattern assembly (our grammar) ──────────────────────────────────────────
expect(constructorTerm(nats[0], () => 'X') === 'z', 'z term is bare');
expect(constructorTerm(nats[1], (() => { let i = 0; return () => (i++ === 0 ? 'X' : 'X1'); })()) === 's X',
  's term applies one metavar');
expect(constructorTerm(tms[0], (() => { let i = 0; return () => 'X' + (i++ || ''); })()) === 'app X X1',
  'app term applies two metavars');
expect(constructorTerm(tms[1], () => 'X') === 'lam (\\x. X)', 'lam term gets a lambda pattern');

expect(boxPattern('', 'z') === '[ |- z]', 'empty-context box pattern');
expect(boxPattern('g, x:tm', 'app X X1') === '[g, x:tm |- app X X1]', 'context box pattern');

// ── Split skeleton — empty context (value split) ────────────────────────────
const splitNat = buildSplitSkeleton('n', '', nats);
expect(splitNat === 'case n of\n| [ |- z] =>\n  ?\n| [ |- s X] =>\n  ?',
  `nat split skeleton (got:\n${splitNat})`);

// ── Schema awareness → parameter-variable branch ────────────────────────────
const admitted = schemaAdmittedTypes(CODE, 'ctx');
expect(admitted.has('tm'), 'schema ctx admits tm');
expect(contextAdmitsHead('g, x:tm', 'tm', admitted), 'context with x:tm admits a tm variable');
expect(!contextAdmitsHead('', 'tm', admitted), 'empty context admits no variable');

// A bare schema element (`ctx = tm`) → the parameter pattern is `#p[..]`.
const ctxSchema = schemaInfo(CODE, 'ctx');
const splitTm = buildSplitSkeleton('m', 'g, x:tm', tms, { head: 'tm', schema: ctxSchema });
expect(splitTm.includes('| [g, x:tm |- #p[..]] =>'), 'context split emits the #p parameter-variable branch');
expect(splitTm.indexOf('app') < splitTm.indexOf('#p[..]'), 'constructor branches come before #p branch');
expect(splitTm.includes('| [g, x:tm |- lam (\\x. X6)] =>'),
  'context split keeps the higher-order lam pattern with arm-unique metavars');

const linInp = [{ name: 'l_inp', args: [{ higherOrder: true, binders: 1, binderCtx: [{ name: 'y', type: 'name' }] }] }];
const linSplit = buildSplitSkeleton('linP', 'g, x:name', linInp, { contextProjection: true, usedNames: ['x'] });
expect(linSplit.includes('l_inp (\\y. X[.., y, x])'), `linear HO split uses contextual projection (got ${linSplit})`);

// General block-hyp projection in type-directed synthesis: a `hyp` argument is
// inhabited by the schema block's `#b.x #b.h` projection pair.
const wtpFwdFill = synthesizeFills('wtp (fwd #bx.1 #bly.1)', {
  goal: '[g |- wtp (fwd #bx.1 #bly.1)]',
  meta: [
    { name: 'g', type: 'ctx' },
    { name: '#bx', type: '#(g |- block (x : name, h : hyp x _))' },
    { name: '#bly', type: '#(g |- block (x : name, h : hyp x _))' },
    { name: 'X', type: '( |- dual A1[] A1p[])' },
  ],
  ctx: [],
}, [
  'hyp : name -> tp -> type.',
  'dual : tp -> tp -> type.',
  'proc : type.',
  'fwd : name -> name -> proc.',
  'wtp : proc -> type.',
  "wtp_fwd : dual A A' -> {X:name}hyp X A -> {Y:name}hyp Y A' -> wtp (fwd X Y).",
].join('\n'));
expect(wtpFwdFill[0] === 'wtp_fwd X[] #bx.x #bx.h #bly.x #bly.h',
  `wtp_fwd synthesized from block projections when goal uses blocks (got ${JSON.stringify(wtpFwdFill)})`);

// branchLetNames reads the result names bound by `let`s earlier in the branch.
const letFillCode = [
  'fn f => case f of',
  '| [g, z : name |- foo A B] =>',
  '  let [g |- R] = bar [g, z : name |- A] in',
  '  let [g |- R3] = baz [g, z : name |- B] in',
  '  let [g, b:block (x:name, h:hyp x _) |- R1[.., b.x, b.h]] = qux [] in',
  '  let [g, b:block (x:name, h:hyp x _) |- R4[.., b.x, b.h]] = qux [] in',
  '  ?',
  ';',
].join('\n');
const letHoleLine = letFillCode.split('\n').findLastIndex((l) => l.trim() === '?') + 1;
expect(branchLetNames(letFillCode, { line: letHoleLine, col: 3 }).join(',') === 'R,R3,R1,R4',
  'branchLetNames reads IH/helper let results');

const hoDesc = constructorArgDescriptor('({x:tm} oft x A -> oft (R x) B)', []);
expect(hoDesc.higherOrder && hoDesc.binders === 2, 'higher-order descriptor counts Pi + premise binders');
expect(JSON.stringify(hoDesc.binderCtx) === JSON.stringify([{ name: 'x', type: 'tm' }, { name: 'd', type: 'oft x A' }]),
  `higher-order descriptor carries typed binder context (got ${JSON.stringify(hoDesc.binderCtx)})`);

// Without schema info, no #p branch (just constructors) — we never GUESS a bare #p.
const splitTmNoSchema = buildSplitSkeleton('m', 'g, x:tm', tms);
expect(!splitTmNoSchema.includes('#p'), 'no #p branch without a fitting schema');

// ── Block schema: structured info + projection parameter pattern (str_hyp) ──
// A real-world hypothesis context: `ctx = some [A:tp] block x:name, h:hyp x A`.
const BLOCK = `LF name : type = ;
LF tp : type = ;
LF hyp : name -> tp -> type = ;
schema bctx = some [A:tp] block x : name, h : hyp x A;
schema nctx = name;`;
const si = schemaInfo(BLOCK, 'bctx');
expect(si.elements.length === 1 && si.elements[0].block, 'bctx has one block element');
expect(JSON.stringify(si.elements[0].fields) === JSON.stringify([
  { name: 'x', head: 'name', type: 'name' },
  { name: 'h', head: 'hyp', type: 'hyp x A' },
]),
  `block fields read with names + type-heads (got ${JSON.stringify(si.elements[0].fields)})`);
// The parameter pattern for a `hyp` term is the projection of the `h` field.
expect(parameterTermFor('hyp', si) === '#p.h[..]', 'hyp → block projection #p.h[..]');
expect(parameterTermFor('name', si) === '#p.x[..]', 'name → block projection #p.x[..]');
expect(parameterTermFor('tp', si) === null, 'a type with no matching block field → null');
// A bare schema element projects directly.
const sn = schemaInfo(BLOCK, 'nctx');
expect(parameterTermFor('name', sn) === '#p[..]', 'bare schema element → #p[..]');

// hyp has NO constructors → the split is the SINGLE block-projection branch
// (this is the str_hyp case that wrongly declined before).
const hypHead = headOfConclusion(decomposeContextual('[g, z:name, hz:hyp z C[] |- hyp X[..] A[]]').concl);
expect(hypHead === 'hyp', 'str_hyp scrutinee head is hyp');
expect((enumerateLFConstructors(BLOCK, 'hyp') || []).length === 0, 'hyp has no constructors');
const splitHyp = buildSplitSkeleton('d', 'g, z:name, hz:hyp z C[]', enumerateLFConstructors(BLOCK, 'hyp') || [],
  { head: 'hyp', schema: si });
expect(splitHyp === 'case d of\n| [g, z:name, hz:hyp z C[] |- #p.h[..]] =>\n  ?',
  `str_hyp split = single block-projection branch (got:\n${splitHyp})`);

// No constructors AND no fitting schema → null (BelJar can't model → cascade).
expect(buildSplitSkeleton('d', 'g', [], { head: 'hyp', schema: schemaInfo(BLOCK, 'nctx') }) === null,
  'no constructors + no fitting schema element → null (cascade)');

// ── intro ───────────────────────────────────────────────────────────────────
const ib = introBinders('[ |- nat] -> [ |- nat] -> [ |- nat]');
expect(ib.kind === 'arrows' && ib.arrows === 2, 'two top-level arrows → two binders');
expect(introBinders('[ |- nat]').kind === 'none', 'non-arrow goal → nothing to intro');
expect(introBinders('(g:ctx) [g |- tm]').kind === 'dependent', 'leading (g:ctx) is dependent (cascade)');

expect(buildIntroSkeleton('[ |- nat] -> [ |- nat] -> [ |- nat]') === 'fn X => fn X1 => ?',
  'intro builds fn binders');
expect(buildIntroSkeleton('[ |- nat]') === null, 'no intro for a non-arrow goal');
expect(buildIntroSkeleton('(g:ctx) [g |- tm] -> [g |- tm]') === 'fn X => ?',
  'ctx-param goal: one fn for the boxed premise, ctx stays implicit');
expect(buildIntroSkeleton('(g:ctx) [g |- tm]') === null, 'no arrow after ctx+box → no intro');

// Fresh metavars avoid names already in scope.
const splitAvoid = buildSplitSkeleton('n', '', nats, { usedNames: ['X'] });
expect(splitAvoid.includes('[ |- s X1]'), 'fresh metavar skips an in-scope X');

// ── transformBelugaStep (step-2 transform/reject) ───────────────────────────
expect(transformBelugaStep('case n of\n| [ |- z] => ?\n| [ |- s X] => ?') !== null,
  'a clean case passes the transform through');
expect(transformBelugaStep('let [_, x1, x2 |- #p.2[..]] = X7 in ?') === null,
  'the non-reparseable context-pattern form is REJECTED (→ honest-decline, never inserted)');
expect(transformBelugaStep('fn Y => fn X => ?') !== null, 'a plain intro passes through');

// ── Degenerate split: scrutinee already determined by a context projection ──
// A NESTED split where the scrutinee's reconstructed type is already pinned to a
// parameter projection (`#p.1[..]`) is degenerate — read from the RECONSTRUCTED
// type, not the source signature (the dependency the static model can't see).
expect(scrutineeIsParameterDetermined('[g, z : name, hz : hyp z C[] |- hyp (#p.1[..]) A1[]]'),
  'a #p.1-determined scrutinee is recognised as already-determined');
expect(scrutineeIsParameterDetermined('[g |- hyp #p.h A]'), 'a #p.h projection counts too');
expect(!scrutineeIsParameterDetermined('[g, z:name, hz:hyp z C[] |- hyp X[..] A[]]'),
  'a FREE scrutinee (the top-level str_hyp case) is NOT determined — split proceeds');
expect(!scrutineeIsParameterDetermined('[ |- nat]'), 'a plain value scrutinee is not determined');

// ── fill: inhabiting-term candidates for a directly-provable goal ───────────
// The REAL str_hyp inner hole: goal [g |- hyp #p.1 A1], with #p a block param. The
// inhabiting term is the `h` projection — BelJar GENERATES it (caller then verifies).
const strHypInner = {
  goal: '[g |- hyp #p.1 A1[]]',
  meta: [
    { name: 'g', type: 'ctx' },
    { name: 'C', type: '( |- tp)' },
    { name: '#p', type: '#(g |- block (x : name, h : hyp x A1[]))' },
  ],
  ctx: [{ name: 'X', type: '[g, z : name, hz : hyp z C[] |- hyp (#p.1[..]) A1[]]' }],
};
const fc1 = fillCandidates(strHypInner, '');
expect(fc1[0] === '[g |- #p.h[..]]',
  `str_hyp inner goal filled by the #p.h projection (got ${JSON.stringify(fc1)})`);

// A returned-variable fill: goal [ |- nat], comp ctx n : [ |- nat] → `n` first.
const natId = { goal: '[ |- nat]', meta: [], ctx: [{ name: 'n', type: '[ |- nat]' }] };
const natCode = 'LF nat : type =\n| z : nat\n| s : nat -> nat\n;';
const fc2 = fillCandidates(natId, natCode);
expect(fc2.includes('n'), 'a comp var of the goal type is a fill candidate');
expect(fc2.includes('[ |- z]'), 'a nullary constructor of the goal is a fill candidate');
expect(fc2.indexOf('n') < fc2.indexOf('[ |- z]'), 'the returned variable ranks before a constructor');

const linCode = [
  'linear: (name -> proc) -> type.',
  "l_choice2: ({x':name}linear (\\z. P z x')) -> ({x':name}linear (\\z. Q z x')) -> linear (\\z. choice X (P z) (Q z)).",
].join('\n');
const choice2Fills = fillCandidates({
  goal: '[g |- linear (\\y. P)]',
  meta: [
    { name: 'g', type: 'nctx' },
    { name: 'R', type: '[g, y:name |- linear (\\z. P1[.., z, y])]' },
    { name: 'R1', type: '[g, y:name |- linear (\\z. Q1[.., z, y])]' },
  ],
  ctx: [],
}, linCode);
expect(choice2Fills.some((t) => t.includes("l_choice2 (\\x'. R) (\\x'. R1)")),
  'dual dependent-Pi HO constructor gets a lambda fill from IH results');

// No candidates when nothing fits.
expect(fillCandidates({ goal: '[ |- mystery]', meta: [], ctx: [] }, '').length === 0,
  'no fill candidates when nothing in scope inhabits the goal');

// ── Typed constructor enumeration: BOTH declaration forms ────────────────────
// (a) The `LF F = | c1 | …` block form.
const blockCtors = enumerateConstructorsTyped('LF nat : type =\n| z : nat\n| s : nat -> nat\n;', 'nat');
expect(blockCtors.length === 2, 'block-form: both constructors enumerated');
expect(blockCtors.find((c) => c.name === 'z' && c.argTypes.length === 0), 'z is nullary');
expect(blockCtors.find((c) => c.name === 's' && c.argTypes.length === 1 && c.argTypes[0] === 'nat'),
  's takes one nat arg (typed)');

// (b) The top-level `c : … -> F …` form (the cp-suite style that was the GAP).
const DECL = [
  'tp : type.',
  'plus : tp -> tp -> tp.',
  'rel : tp -> tp -> type.',
  'r_refl : rel A A.',
  'r_step : rel A B -> rel B C -> rel A C.',
].join('\n');
const relCtors = enumerateConstructorsTyped(DECL, 'rel');
expect(relCtors.length === 2, 'top-level form: constructors found by RESULT head (the cp-style gap)');
const rstep = relCtors.find((c) => c.name === 'r_step');
expect(rstep && rstep.argTypes.length === 2, 'r_step has two args (typed)');
expect(rstep.result.head === 'rel' && rstep.result.indices.length === 2, 'r_step result head+indices read');
// A bare `type`-kinded family decl (rel itself) is NOT a constructor of rel.
expect(!relCtors.find((c) => c.name === 'rel'), 'the family declaration is not its own constructor');

const CTYPE = [
  'inductive Result : (g : ctx){P : [g |- proc]}{Q : [g, x:name |- proc]} -> ctype =',
  '| Res : {Qp : [g |- proc]} -> [g, x:name |- eq_proc Q Qp[..]] -> [g |- step P Qp] -> Result [g |- P] [g, x:name |- Q]',
  ';',
].join('\n');
const resCtors = enumerateConstructorsTyped(CTYPE, 'Result');
expect(resCtors.length === 1 && resCtors[0].name === 'Res', 'ctype inductive constructor is enumerated');
expect(resCtors[0].argTypes.length === 3 && resCtors[0].result.indices.length === 2,
  'ctype constructor arg types and result indices are read');

const UNICODE_CTYPE = [
  'inductive Result : (g : ctx){P : [g |- proc]}{Q : [g, x:name |- proc]} → ctype =',
  '| Res : {Qp : [g |- proc]}',
  '      → [g, x:name |- eq_proc Q Qp[..]]',
  '      → [g |- P ⇛ Qp]',
  '      → Result [g |- P] [g, x:name |- Q]',
  ';',
  'eq_proc : proc -> proc -> type.',
  'refl_proc : eq_proc P P.',
  '⇛ : proc -> proc -> type.',
  'βfwd : ⇛.',
].join('\n');
const uniRes = enumerateConstructorsTyped(UNICODE_CTYPE, 'Result');
expect(uniRes.length === 1 && uniRes[0].argTypes.length === 3,
  'unicode-arrow ctype Res constructor is enumerated');

// parseAppType: head + indices, paren-grouped indices stay whole.
expect(JSON.stringify(parseAppType('dual (A ⊗ B) C')) === JSON.stringify({ head: 'dual', indices: ['(A ⊗ B)', 'C'] }),
  'parseAppType keeps a parenthesised index whole');

// ── Term SYNTHESIS: constructor application unifying under operators ──────────
// Goal `rel A C` with `d1 : rel A B`, `d2 : rel B C` in scope → `r_step d1 d2`.
const synthGoal = {
  goal: '[ |- rel A C]',
  ctx: [{ name: 'd1', type: '[ |- rel A B]' }, { name: 'd2', type: '[ |- rel B C]' }],
  meta: [],
};
const sf = synthesizeFills('rel A C', synthGoal, DECL);
expect(sf.includes('r_step d1 d2'), `synthesises the transitive step (got ${JSON.stringify(sf)})`);

// Unification UNDER a constructor: goal `rel (plus A B) X` matched by `r_refl`
// only if X unifies with `plus A B` — here it binds A:=plus A B for r_refl.
const reflGoal = { goal: '[ |- rel D D]', ctx: [], meta: [] };
expect(synthesizeFills('rel D D', reflGoal, DECL).includes('r_refl'),
  'r_refl synthesised for a reflexive goal (pattern var binds both indices)');

// No spurious synthesis: goal whose args aren't in scope yields nothing.
expect(synthesizeFills('rel A C', { goal: '[ |- rel A C]', ctx: [], meta: [] }, DECL).length === 0,
  'no constructor-application fill when the arguments are not inhabited');

// ── Inversion: destructure a DETERMINED hypothesis (one-branch case = a let) ──
const INV = [
  'tp : type.', 'base : tp.', 'arr : tp -> tp -> tp.',
  'dl : tp -> tp -> type.',
  'd_base : dl base base.',
  'd_arr  : dl A A\' -> dl B B\' -> dl (arr A B) (arr A\' B\').',
].join('\n');
// A hypothesis determined to base-shape → exactly the nullary d_base inversion.
const i1 = invertCandidates({ name: 'h', type: '[ |- dl base X]' }, INV, []);
expect(i1.length === 1 && i1[0] === 'let [ |- d_base] = h in',
  `determined (base) hypothesis inverts to the unique nullary constructor (got ${JSON.stringify(i1)})`);
// A hypothesis determined to arr-shape → the unique d_arr inversion with FRESH vars.
const i2 = invertCandidates({ name: 'h', type: '[ |- dl (arr A1 B1) X]' }, INV, []);
expect(i2.length === 1 && /^let \[ \|- d_arr \w+ \w+\] = h in$/.test(i2[0]),
  `determined (arr) hypothesis inverts to d_arr with fresh pattern vars (got ${JSON.stringify(i2)})`);
// A fully-abstract hypothesis is NOT determined → many candidates (left to split).
expect(invertCandidates({ name: 'h', type: '[ |- dl A X]' }, INV, []).length === 2,
  'an undetermined hypothesis yields multiple inversions (not a unique inversion)');
// Inversion respects the box context.
const i3 = invertCandidates({ name: 'h', type: '[g |- dl base X]' }, INV, []);
expect(i3[0] === 'let [g |- d_base] = h in', 'inversion preserves the box context');

const TYPING = [
  'tp : type.', 'tm : type.', 'arr : tp -> tp -> tp.', 'lam : tp -> (tm -> tm) -> tm.',
  'oft : tm -> tp -> type.',
  't_lam : ({x:tm} oft x A -> oft (R x) B) -> oft (lam A R) (arr A B).',
].join('\n');
const ilam = invertCandidates({ name: 'h', type: '[ |- oft (lam A R) T]' }, TYPING, []);
expect(ilam.length === 1 && ilam[0].includes('t_lam (\\x. \\d. X)'),
  `higher-order inversion uses a lambda pattern with typed binder names (got ${JSON.stringify(ilam)})`);

// Redundancy guard: an arr-shaped hypothesis whose sub-derivations are ALREADY in
// scope must NOT be re-inverted (this was the infinite-inversion loop on a
// just-split scrutinee). With both sub-derivations present, no inversion is offered.
const alreadyDestructured = invertCandidates(
  { name: 'h', type: "[ |- dl (arr A1 B1) (arr A2 B2)]" }, INV, [],
  [{ name: 'p', type: '[ |- dl A1 A2]' }, { name: 'q', type: '[ |- dl B1 B2]' }],
);
expect(alreadyDestructured.length === 0,
  'a hypothesis whose sub-derivations are already in scope is NOT re-inverted (loop guard)');
// But WITHOUT the sub-derivations in scope, the same hypothesis IS inverted.
const notYet = invertCandidates({ name: 'h', type: "[ |- dl (arr A1 B1) (arr A2 B2)]" }, INV, [], []);
expect(notYet.length === 1, 'the same hypothesis inverts when its sub-derivations are absent');

// ── Fixity-aware emission (renderApp + infixDeclaredOps) ─────────────────────
// A `--infix` head is illegal in prefix position; emitted applications must
// respect the declared fixity (invented names; the pragma is the only signal).
{
  const CODE = 'tn : type.\nta : tn.\nbop : tn -> tn -> tn.\n--infix bop 6 left.\n';
  const ops = infixDeclaredOps(CODE);
  expect(ops.has('bop') && !ops.has('ta'), 'infixDeclaredOps reads the pragma, nothing else');
  expect(renderApp(CODE, 'bop', ['ta', 'ta']) === 'ta bop ta',
    '2-ary infix head renders infix');
  expect(renderApp(CODE, 'bop', ['ta', 'bop2 ta ta']) === 'ta bop (bop2 ta ta)',
    'compound operand is parenthesized');
  expect(renderApp(CODE, 'bop', ['(f a)', '[x |- b]']) === '(f a) bop [x |- b]',
    'already-grouped operands stay unwrapped');
  expect(renderApp(CODE, 'bop', ['(a) c (b)', 'ta']) === '((a) c (b)) bop ta',
    'balance-aware grouping: (a) c (b) is NOT one group');
  expect(renderApp(CODE, 'other', ['ta', 'ta']) === 'other ta ta',
    'non-infix heads stay prefix');
  expect(renderApp(CODE, 'bop', ['ta']) === 'bop ta',
    'partial application stays prefix (checker arbitrates)');
}

console.log('OK  hole-split — BelJar builds well-typed split/intro skeletons, fill candidates, TYPED constructor enumeration (both decl forms), and type-directed term SYNTHESIS (constructor application unifying under operators) — all from its OWN model');
