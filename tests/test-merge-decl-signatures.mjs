import assert from 'node:assert';
import {
  inferredDeclBinders,
  mergeDeclSignatures,
  peelLeadingBinders,
  priorDeclBinders,
} from '../js/editor-src/semantic/merge-decl-signatures.mjs';

const rich = '(g:ctx) (P:[g |- o]) (Q:[g |- o]) [g |- mstep P Q] -> type';
const stripped = '[g |- mstep P Q] -> type';
const merged = mergeDeclSignatures(rich, stripped);
assert.ok(merged.includes('(g:ctx)'), `keeps g binder: ${merged}`);
assert.ok(merged.includes('(Q:[g |- o])'), `keeps Q binder: ${merged}`);
assert.ok(merged.includes('[g |- mstep P Q]'), `keeps body: ${merged}`);

const minimal = 'vec N -> vec (s N)';
const expanded = '(N : nat) vec N -> vec (s N)';
assert.equal(mergeDeclSignatures(minimal, expanded), expanded,
  'inferred implicit binder is added from reconstruction');
assert.deepEqual(inferredDeclBinders(minimal, expanded).map((b) => b.text), ['(N : nat)'],
  'reports only reconstruction-added binders');
assert.deepEqual(inferredDeclBinders(rich, stripped), [],
  'does not report source binders omitted by reconstruction');

assert.deepEqual(priorDeclBinders(rich, stripped).map((b) => b.text),
  ['(g:ctx)', '(P:[g |- o])', '(Q:[g |- o])'],
  'prior binders are source binders dropped from the goal');
assert.deepEqual(priorDeclBinders(rich, rich), [],
  'no priors when the goal still shows the full source type');

// Priors against the MERGED signature surface reconstruction-inferred binders
// too (dual_sym: source writes none, Beluga infers {A} {A'}, the goal shows
// neither — the priors row must show both).
const dualSrc = '[ |- dual A A\'] -> [ |- dual A\' A]';
const dualRecon = '{A : ( |- tp)} {A\' : ( |- tp)} [ |- dual A A\'] -> [ |- dual A\' A]';
assert.deepEqual(
  priorDeclBinders(mergeDeclSignatures(dualSrc, dualRecon), dualSrc).map((b) => b.text),
  ['{A : ( |- tp)}', '{A\' : ( |- tp)}'],
  'inferred implicit binders count as priors when the goal drops them');

const lfSource = 'o -> type';
const lfRecon = '{g:ctx} nd -> type';
assert.ok(mergeDeclSignatures(lfSource, lfRecon).includes('{g:ctx}'),
  'reconstruction context binder is retained');

assert.equal(peelLeadingBinders('(g:ctx) body').binders.length, 1);

console.log('OK merge decl signatures');
