// Proof Lab model: structuring the Harpoon shim's proof JSON into binder records.
// Fixtures are verbatim shapes observed from the real shim (Node-verified in the
// Architecture II build): goal types, meta/comp context renders, split labels.
import {
  parseBinders,
  normalizeSubgoal,
  normalizeProofModel,
  applicableTactics,
  splitTargets,
} from '../js/editor-src/harpoon/harpoon-model.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}
function eq(a, b, msg) { expect(JSON.stringify(a) === JSON.stringify(b), `${msg}\n  got ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`); }

// --- parseBinders -----------------------------------------------------------
eq(parseBinders(''), [], 'empty context');
eq(parseBinders('   '), [], 'whitespace context');

// Verbatim comp-context render from the shim.
eq(parseBinders('x : [ |- nat],\nx1 : [ |- nat]'),
   [{ name: 'x', type: '[ |- nat]' }, { name: 'x1', type: '[ |- nat]' }],
   'two comp binders, comma+newline separated');

// Verbatim meta render from the shim (parens form).
eq(parseBinders('n : ( |- nat)'),
   [{ name: 'n', type: '( |- nat)' }],
   'single meta binder');

// A type containing a top-level-looking comma INSIDE brackets must NOT split.
eq(parseBinders('d : [g, z:name, hz:hyp z C[] |- hyp X[..] A[]]'),
   [{ name: 'd', type: '[g, z:name, hz:hyp z C[] |- hyp X[..] A[]]' }],
   'commas inside brackets do not split');

// A context var with no type (a bare schema var) keeps an empty type.
eq(parseBinders('g'), [{ name: 'g', type: '' }], 'bare binder no colon');

// --- normalizeSubgoal -------------------------------------------------------
const sg = normalizeSubgoal({
  id: 'split [ |- X] (case s)',
  label: 'split [ |- X] (case s)',
  goal: '[ |- nat]',
  ctxText: '',
  metaText: 'X : ( |- nat)',
});
eq(sg.goal, '[ |- nat]', 'subgoal goal preserved');
eq(sg.meta, [{ name: 'X', type: '( |- nat)' }], 'subgoal meta parsed');
eq(sg.ctx, [], 'subgoal empty comp ctx');
expect(sg.id.includes('case s'), 'subgoal id retains split label');

// --- normalizeProofModel ----------------------------------------------------
const start = normalizeProofModel({
  ok: true, name: 'double', complete: false,
  subgoals: [{ id: 'intros', label: 'intros', goal: '{n : [ |- nat]} [ |- nat]', ctxText: '', metaText: '' }],
});
expect(start.ok && start.name === 'double', 'start ok + name');
eq(start.subgoals.length, 1, 'start one subgoal');

// A complete proof: ok with zero subgoals → complete true.
const done = normalizeProofModel({ ok: true, name: 'id', complete: true, subgoals: [] });
expect(done.ok && done.complete && done.subgoals.length === 0, 'complete proof normalized');

// An error response (e.g. split on an unbound name).
const err = normalizeProofModel({ ok: false, error: 'Error: Unbound identifier x.' });
expect(!err.ok && /Unbound/.test(err.error), 'error response normalized');

// A non-object response.
expect(!normalizeProofModel(null).ok, 'null model is not ok');

// --- applicableTactics ------------------------------------------------------
const tArrow = applicableTactics({ goal: '[ |- nat] -> [ |- nat]', meta: [], ctx: [] });
expect(tArrow.intros, 'intros offered on arrow goal');

const tPi = applicableTactics({ goal: '{n : [ |- nat]} [ |- nat]', meta: [], ctx: [] });
expect(tPi.intros, 'intros offered on Pi-box goal');

const tFlat = applicableTactics({ goal: '[ |- nat]', meta: [{ name: 'n', type: '( |- nat)' }], ctx: [] });
expect(!tFlat.intros, 'no intros on non-arrow goal');
// split targets carry their source context (cD = 'meta', cG = 'comp') so the
// tactic dispatch can elaborate the scrutinee from the right context.
eq(tFlat.split, [{ name: 'n', where: 'meta' }], 'split offered on meta var (with where)');
eq(tFlat.solve, ['n'], 'solve offered on meta var');

// A boxed COMPUTATION hypothesis (cG) — e.g. the post-intros induction scrutinee
// `x : [ |- dual A A']` — must be offered for split with where:'comp'. This is the
// dual_sym case that was previously dead (only 'auto' offered, which no-ops).
const tComp = applicableTactics({
  goal: "[ |- dual A' A]",
  meta: [],
  ctx: [{ name: 'x', type: "[ |- dual A A']" }],
});
eq(tComp.split, [{ name: 'x', where: 'comp' }], 'split offered on cG hypothesis');
eq(tComp.solve, [], 'solve stays meta-only (no cG fill)');

// Both contexts present: meta targets come first, then comp.
eq(splitTargets({ meta: [{ name: 'm' }], ctx: [{ name: 'c' }] }),
   [{ name: 'm', where: 'meta' }, { name: 'c', where: 'comp' }],
   'splitTargets merges cD then cG with where tags');

console.log(`OK test-harpoon-model (${n} assertions)`);
