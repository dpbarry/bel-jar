// The two harness decisions that silently shape every number: which program a proof
// is checked in, and what kind of thing the proof returns.
// Pure ESM: the grammar and the prover's own readers, no Beluga.
import { resultClassOf, slicesFor, typeTextOf } from '../scripts/case-harness-lib.mjs';
import { recsWithArms } from '../scripts/case-read-arms.mjs';
import { enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const code = `LF tm : type = | app : tm -> tm -> tm | unit : tm;
LF step : tm -> tm -> type = | s_refl : step M M;
LF exp : tm -> type = | e_unit : exp unit;
inductive Red : [ |- tm] -> ctype = | RUnit : Red [ |- unit];
rec helper : [ |- step M N] -> [ |- step M N] =
/ total d (helper m n d) /
fn d => case d of
| [ |- s_refl] => [ |- s_refl]
;
rec unrelated : [ |- tm] -> [ |- tm] =
/ total e (unrelated e) /
fn e => case e of
| [ |- app U V] => [ |- unit]
| [ |- unit] => [ |- unit]
;
rec mid : [ |- step M N] -> [ |- step M N] =
/ total d (mid m n d) /
fn d => case d of
| [ |- s_refl] => helper [ |- s_refl]
;
rec target : [ |- step M N] -> [ |- step M N] = % the result is [ |- tm], says this comment
/ total d (target m n d) /
fn d => case d of
| [ |- s_refl] => mid [ |- s_refl]
;
rec copy : [ |- tm] -> [ |- tm] =
/ total e (copy e) /
fn e => case e of
| [ |- app U V] => [ |- unit]
| [ |- unit] => [ |- unit]
;
rec typed : [ |- exp M] -> [ |- exp M] =
fn e => e
;
rec red : {M : [ |- tm]} Red [ |- M] -> Red [ |- M] =
mlam M => fn r => r
;
rec later : [ |- tm] -> [ |- tm] =
fn e => target2 e
;`;

const recs = recsWithArms(code);
const byName = (n) => recs.find((r) => r.name === n);
const decls = enumerateDecls(code);

// ── what a proof returns ──────────────────────────────────────────────────────
// The headline depends on this: "Beluga accepts it" certifies a case for a theorem
// and not for a program, so the two must never be counted as one population.
expect(resultClassOf(code, byName('target')).result === 'indexed', 'a derivation of an indexed family is theorem-like');
expect(resultClassOf(code, byName('target')).resultFamily === 'step', 'and its family is named');
expect(resultClassOf(code, byName('copy')).result === 'data', 'a term of an unindexed type is a program');
expect(resultClassOf(code, byName('red')).result === 'comp', 'a computation-level result is its own class');
// The proxy's known limit, pinned so nobody mistakes it for a decision procedure:
// intrinsically typed DATA is an indexed family too.
expect(resultClassOf(code, byName('typed')).result === 'indexed', 'typed data lands in the indexed class; the proxy cannot tell');
// A comment after the `=` mentions a different result type. The signature is what counts.
expect(typeTextOf(code.slice(byName('target').from, byName('target').to)).trim() === '[ |- step M N] -> [ |- step M N]',
  'the type is read up to the top-level equals, and never out of a comment');
expect(typeTextOf('rec f : {M : [ |- tm]} [ |- eq M M] =\nfn x => x').includes('eq M M'), 'a binder with a colon of its own does not end the type early');
// Corpus authors annotate premises inline. A comment INSIDE the signature that happens
// to contain an equals sign must not be mistaken for the end of the type.
const annotated = 'rec g : [ |- step M N]   % d : M = N in one step\n      -> [ |- tm] =\nfn d => ?';
expect(typeTextOf(annotated).includes('-> [ |- tm]'), 'an equals sign inside a comment does not end the type');
expect(
  resultClassOf('LF tm : type = | unit : tm;\nLF step : tm -> tm -> type = | s : step M M;\n' + annotated,
    { from: 'LF tm : type = | unit : tm;\nLF step : tm -> tm -> type = | s : step M M;\n'.length, to: 1e9 }).result === 'data',
  'so a commented premise cannot turn a program into a theorem',
);

// ── slicing ───────────────────────────────────────────────────────────────────
const slices = slicesFor(code, decls, byName('target'));
expect(slices.map((s) => s.how).join(',') === 'pruned,prefix,full', 'slices are offered smallest first, ending in the whole program');
const [pruned, prefix, full] = slices;
expect(full.prog === code && full.shift === 0, 'the last slice is the program itself');

expect(pruned.prog.includes('rec mid'), 'a proof the target names is kept');
expect(pruned.prog.includes('rec helper'), 'and so is one it names only THROUGH another proof');
expect(!pruned.prog.includes('rec unrelated'), 'a proof it never names is dropped');
expect(!pruned.prog.includes('rec copy') && !pruned.prog.includes('rec later'), 'nothing after the target survives');
expect(pruned.prog.includes('LF step') && pruned.prog.includes('inductive Red'), 'the signature is kept whole, used or not');

// Offsets must move with the text, or every mask and splice lands in the wrong place.
const t = byName('target');
for (const arm of t.arms) {
  expect(pruned.prog.slice(arm.from + pruned.shift, arm.to + pruned.shift) === arm.text, 'an arm is found at its shifted offset in the pruned slice');
  expect(prefix.prog.slice(arm.from + prefix.shift, arm.to + prefix.shift) === arm.text, 'and at its own offset in the prefix');
}
expect(prefix.prog.includes('rec unrelated') && !prefix.prog.includes('rec copy'), 'the prefix keeps everything before the target and nothing after');
expect(pruned.prog.length < prefix.prog.length, 'pruning is smaller than the plain prefix');

// Shadowing: a development can declare one name twice. The target's calls to ITSELF
// must not drag in the earlier declaration of that name; with both in the slice the
// engine worked on the finished one and reported a zero-move COMPLETE.
const shadowed = `LF nat : type = | z : nat | s : nat -> nat;
rec twice : [ |- nat] -> [ |- nat] =
/ total n (twice n) /
fn n => case n of | [ |- z] => [ |- z] | [ |- s X] => twice [ |- X]
;
rec twice : [ |- nat] -> [ |- nat] =
/ total n (twice n) /
fn n => case n of | [ |- z] => [ |- z] | [ |- s X] => twice [ |- X]
;`;
const shRecs = recsWithArms(shadowed);
const shSlice = slicesFor(shadowed, enumerateDecls(shadowed), shRecs[1])[0];
expect((shSlice.prog.match(/rec twice/g) || []).length === 1, "a proof's own recursive calls do not keep an earlier proof of the same name");
expect(shSlice.prog.slice(shRecs[1].arms[1].from + shSlice.shift, shRecs[1].arms[1].to + shSlice.shift) === shRecs[1].arms[1].text,
  'and the second declaration is the one in the slice');

// A proof that names nothing needs no other proof at all.
const solo = slicesFor(code, decls, byName('copy'))[0];
expect(!/rec (helper|mid|target|unrelated)\b/.test(solo.prog), 'a self-contained proof is sliced down to the signature and itself');

// A rec the declaration list does not contain gets the whole program, never a guess.
expect(slicesFor(code, decls, { from: code.length + 10, to: code.length + 20 }).map((s) => s.how).join(',') === 'full',
  'an unlocatable proof is checked in the whole program');

console.log('PASS test-case-harness-lib.mjs');
