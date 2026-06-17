// Regression net for the grammar overhaul that aligned beluga.grammar with
// Beluga-W's lexer/parser. Each snippet exercises a feature that previously
// failed to parse; we assert zero error nodes. Also checks that the new
// declaration kinds resolve to the right hover label, and that newly-supported
// symbols carry a builtin tooltip.

import { parser } from '../editor-src/beluga-parser.js';
import { Text } from '@codemirror/state';
import { resolveHoverDoc } from '../editor-src/bel-resolve.mjs';
import { BUILTIN_TOOLTIPS } from '../editor-src/bel-builtins.mjs';

let failed = false;
function fail(msg) { console.error('FAIL:', msg); failed = true; }

function errorNodes(src) {
  const out = [];
  parser.parse(src).iterate({
    enter(n) { if (n.type.isError && n.to > n.from) out.push(src.slice(n.from, n.to)); },
  });
  return out;
}

function parses(label, src) {
  const errs = errorNodes(src);
  if (errs.length) fail(`${label}: ${errs.length} parse error(s): ${JSON.stringify(errs.slice(0, 4))}`);
}

// ── Features that must parse cleanly ──────────────────────────────────────────
parses('n-ary tuple',          'rec f : [g |- a] = [g |- <x ; y ; z>] ;');
parses('substitution tuple',   'rec f : [g |- a] = [g |- M[.., <x; nx>, y]] ;');
parses('coinductive + ::',
  'coinductive Sim : [|- term] -> ctype =\n| Unit : Sim [|- m] :: [|- eq m m] ;');
parses('mutual mixed datatypes',
  'inductive A : ctype = | a : A and coinductive B : ctype = | o : B :: A ;');
parses('cofunction copatterns', 'rec f : Sim = fun .Unit d => d | .Pair d => d ;');
parses('observation application', 'rec f : a = s2 .Unit (s1 .Unit d) ;');
parses('proof header + body',
  'proof tps : [|- a] -> [|- b] =\nintros\n{ x : ( |- a) | y : [|- a] ; split y as q } ;');
parses('substitution type |-#', 'rec f : {$S : $[h |-# g]} a = ? ;');
parses('? in identifier',       'rec is_value? : [ |- tm] -> [ |- yes_no] = / total (is_value?) / fn m => ? ;');
parses('named hole',            'rec f : a = ?goal ;');
parses('ellipsis substitution', 'rec f : [g |- a] = [g, x:tm _ ⊢ M[…, x]] ;');
parses('Pi binder arrow kind',  'inductive R : (g : ctx) {P : [g ⊢ tm]} → ctype = | c : R ;');
parses('datatype no leading bar', 'LF halts : tm -> type =\nhalts/m : step -> halts M ;');
parses('empty some',            'schema termCtx = some [] block (x: term) ;');
parses('lexicographic totality',
  'rec f : a = / total {m n} (f g m n) / fn x => ? ;');
parses('trust totality',         'rec f : a = / trust / fn x => ? ;');
parses('bare total totality',    'rec f : a = / total / fn x => ? ;');
parses('paren totality measure', 'rec f : a = / total (str h) / fn x => ? ;');
parses('named + numeric projection', 'rec f : [g |- a] = [g, b:block (x:tm, u:p) |- <b.1; b.u>] ;');
parses('nested block comment',  '%{ outer %{ inner }% still comment }%\nLF a : type = | c : a ;');
parses('doc comment',           '%{{ # Title\n`code` }}%\nLF a : type = | c : a ;');
parses('prop kind',             'inductive P : prop = | p : P ;');
parses('hash/dollar blank',     'rec f : a = mlam #_, $_ => ? ;');
parses('backarrow',             'LF c : a <- b. LF d : a ← b.');

// ── New declaration kinds resolve to the right hover label ────────────────────
function labelAt(src, needle) {
  const tree = parser.parse(src);
  const doc = Text.of(src.split('\n'));
  const r = resolveHoverDoc(tree, doc, src.indexOf(needle));
  return r && r.label;
}
const coind = 'coinductive Sim : [|- term] -> ctype =\n| Unit : Sim [|- m] :: [|- eq m m] ;';
if (labelAt(coind, 'Sim ') !== 'Coinductive Type') fail('coinductive type label');
if (labelAt(coind, 'Unit') !== 'Destructor') fail('destructor label');
if (labelAt('proof tps : [|- a] = intros { } ;', 'tps') !== 'Proof') fail('proof label');
if (labelAt('stratified Tm : tp -> ctype = | L : Tm ;', 'Tm ') !== 'Stratified Type') fail('stratified label');

// ── Newly-supported symbols carry a builtin tooltip ───────────────────────────
for (const key of ['PropKeyword', 'CoinductiveKeyword', 'ProofKeyword', 'TurnstileHash',
  'Tuple', 'Observation', '|-#', '…', '←', 'FunKeyword']) {
  if (!BUILTIN_TOOLTIPS.has(key)) fail(`missing builtin tooltip for ${key}`);
}
// `fun` is the cofunction, not an fn alias (the previous wrong description).
const funTip = BUILTIN_TOOLTIPS.get('FunKeyword');
if (!/copattern/i.test(funTip.desc) || /alternative spelling/i.test(funTip.desc)) {
  fail('FunKeyword should be described as the copattern-matching cofunction');
}

if (failed) process.exit(1);
console.log('OK grammar corpus (new constructs parse, labels, builtin tooltips)');
