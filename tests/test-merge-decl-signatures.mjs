import assert from 'node:assert';
import { mergeDeclSignatures, peelLeadingBinders } from '../editor-src/semantic/merge-decl-signatures.mjs';

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

const lfSource = 'o -> type';
const lfRecon = '{g:ctx} nd -> type';
assert.ok(mergeDeclSignatures(lfSource, lfRecon).includes('{g:ctx}'),
  'reconstruction context binder is retained');

assert.equal(peelLeadingBinders('(g:ctx) body').binders.length, 1);

console.log('OK merge decl signatures');
