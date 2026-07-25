// Grammar construct matrix — features present in beluga.grammar / library but
// lightly covered by test-grammar-corpus.mjs.
import { parser } from '../js/editor-src/beluga-parser.js';
import { Text } from '@codemirror/state';
import { syntaxLintTree } from '../js/editor-src/ide/syntax-lint.mjs';
import { resolveHoverDoc } from '../js/editor-src/name-resolve.mjs';

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
  if (errs.length) fail(`${label}: ${errs.length} parse error(s): ${JSON.stringify(errs.slice(0, 3))}`);
}

function noSyntaxLint(label, src) {
  const doc = Text.of(src.split('\n'));
  const tree = parser.parse(src);
  const diags = syntaxLintTree(tree, doc).filter((d) => d.severity === 'error');
  if (diags.length) fail(`${label}: syntax lint ${diags[0].message}`);
}

parses('module', 'module M = struct LF a : type; end;');
parses('stratified', 'stratified Tm : tp -> ctype = | L : Tm tp ;');
parses('typedef', 'typedef nat : ctype = nat ;');
parses('let quantified', 'rec f : a = let {x:a} M = e in M ;');
parses('if', 'rec f : a = if true then e1 else e2 ;');
parses('impossible', 'rec f : a = impossible e ;');
parses('parameter type', 'rec f : {$S : $[h |- g]} a = ? ;');
parses('substitution type |-#', 'rec f : {$S : $[h |-# g]} a = ? ;');
parses('context application', 'rec f : [g |- a] = [g, x:tm |- M[x]] ;');
parses('unicode turnstile', 'LF a : type.\nrec f : [g ⊢ a] = ? ;');
parses('unicode fat arrow', 'LF a : type.\nrec f : a = fn x => x ;');
parses('unicode infix builtin', `LF ⊃ : o → o → o.\nLF nd : o → type = | ⊃I : nd (A ⊃ B) ;`);
parses('primed subst arg', "rec f : a = case d of | {#p : #[g |- block (a:tp, w: sub a U'[..], ref: sub a a )]} => ? ;");
parses('elf comment line', '%% twelf comment\nLF a : type ;');

// Lint probes (unhappy paths)
{
  const badPragma = '--inhfix x left 1.\nLF a : type ;';
  const doc = Text.of(badPragma.split('\n'));
  const tree = parser.parse(badPragma);
  const diags = syntaxLintTree(tree, doc);
  if (!diags.some((d) => d.message.includes('Unknown pragma'))) {
    fail('unknown pragma should lint');
  }
}

{
  const incomplete = 'LF x : type =\n  | mkX : ( x\n;\nLF a : type ;';
  const doc = Text.of(incomplete.split('\n'));
  const tree = parser.parse(incomplete);
  const diags = syntaxLintTree(tree, doc);
  if (!diags.some((d) => d.severity === 'error')) {
    fail('incomplete/broken LF block should lint');
  }
}

function labelAt(src, needle) {
  const tree = parser.parse(src);
  const doc = Text.of(src.split('\n'));
  const r = resolveHoverDoc(tree, doc, src.indexOf(needle));
  return r && r.label;
}

if (labelAt('module M = struct LF a : type; end;', 'M ') !== 'Module') fail('module label');
if (labelAt('stratified Tm : tp -> ctype = | L : Tm ;', 'Tm ') !== 'Stratified Type') fail('stratified label');

noSyntaxLint('valid implicit domain', 'LF ↝ : tm -> tm -> type.\nrec f : [g |- a] = fn t => t ;');

if (failed) process.exit(1);
console.log('OK grammar matrix (constructs parse, lint probes, labels)');
