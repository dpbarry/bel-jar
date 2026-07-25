import { beluga, editorCodeFolding } from '../js/editor-src/language.mjs';
import { ensureSyntaxTree, foldable, foldEffect, foldedRanges, unfoldEffect } from '@codemirror/language';
import { EditorState, Text } from '@codemirror/state';

let failed = false;
function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed = true; }
}

function foldOnLine(src, lineNo = 1) {
  const doc = Text.of(src.split('\n'));
  const state = EditorState.create({ doc, extensions: [beluga(), editorCodeFolding()] });
  ensureSyntaxTree(state, doc.length);
  const line = doc.line(lineNo);
  return foldable(state, line.from, line.to);
}

function firstLine(src) {
  return src.split('\n')[0];
}

function headerOf(src, fold) {
  return src.slice(0, fold.from);
}

function bodyOf(src, fold) {
  return src.slice(fold.from, fold.to);
}

const indSrc = 'inductive tp : ctype =\n  | t_unit : tp\n  | t_pair : tp -> tp -> tp ;';
const ind = foldOnLine(indSrc);
expect(ind, 'multi-line inductive is foldable');
expect(headerOf(indSrc, ind).trimEnd() === firstLine(indSrc), 'inductive fold keeps first line');
expect(bodyOf(indSrc, ind).includes('| t_unit'), 'inductive fold hides constructor arms');

const recSrc = 'rec f : tp -> tp =\n  fn x => f x ;';
const rec = foldOnLine(recSrc);
expect(rec, 'multi-line rec is foldable');
expect(headerOf(recSrc, rec).trimEnd() === firstLine(recSrc), 'rec fold keeps first line');

const recSigSrc = 'rec f : tp -> tp\n  -> tp\n  -> tp = fn x => x ;';
const recSig = foldOnLine(recSigSrc, 1);
expect(recSig, 'multi-line rec signature folds from first line');
expect(headerOf(recSigSrc, recSig).trimEnd() === firstLine(recSigSrc), 'rec signature fold keeps first line only');
expect(foldOnLine(recSigSrc, 3) == null, 'rec signature has no chevron on = line');
expect(bodyOf(recSigSrc, recSig).includes('= fn x => x'), 'rec signature fold includes = and body');

const letSrc = 'let x : tp =\n  fn y => y ;';
const letFold = foldOnLine(letSrc);
expect(letFold, 'multi-line let is foldable');
expect(headerOf(letSrc, letFold).trimEnd() === firstLine(letSrc), 'let fold keeps first line');

expect(foldOnLine('let x = 1 ;') == null, 'single-line let is not foldable');

const proofSrc = 'proof p : tp =\n  intros.\n  split.\n;';
const proof = foldOnLine(proofSrc);
expect(proof, 'multi-line proof is foldable');
expect(headerOf(proofSrc, proof).trimEnd() === firstLine(proofSrc), 'proof fold keeps first line');
expect(bodyOf(proofSrc, proof).includes('intros.'), 'proof fold hides script');

const modSrc = 'module M = struct\n  LF a : type.\nend;';
const mod = foldOnLine(modSrc);
expect(mod, 'multi-line module is foldable');
expect(headerOf(modSrc, mod).trimEnd() === firstLine(modSrc), 'module fold keeps first line');
expect(bodyOf(modSrc, mod).includes('LF a'), 'module fold hides inner decls');

const lfSrc = 'LF nat : type =\n  | z : nat\n  | s : nat -> nat ;';
const lf = foldOnLine(lfSrc);
expect(lf, 'multi-line LF datatype is foldable');
expect(headerOf(lfSrc, lf).trimEnd() === firstLine(lfSrc), 'LF datatype fold keeps first line');

const coSrc = 'coinductive stream : ctype =\n  | hd :: tl : stream -> stream ;';
expect(foldOnLine(coSrc), 'multi-line coinductive is foldable');

const stratSrc = 'stratified nat : ctype =\n  | z : nat\n  | s : nat -> nat ;';
expect(foldOnLine(stratSrc), 'multi-line stratified is foldable');

const schemaSrc = 'schema ctx =\n  (x : tp) + (y : tp) ;';
expect(foldOnLine(schemaSrc), 'multi-line schema is foldable');

const typedefSrc = 'typedef nat : ctype =\n  nat ;';
expect(foldOnLine(typedefSrc), 'multi-line typedef is foldable');
expect(foldOnLine('typedef nat : ctype = nat ;') == null, 'single-line typedef is not foldable');

const mutualSrc = 'inductive t1 : ctype = | c1 : t1\nand t2 : ctype = | c2 : t2 ;';
const mutual = foldOnLine(mutualSrc);
expect(mutual, 'mutual inductive is foldable');
expect(bodyOf(mutualSrc, mutual).includes('and t2'), 'mutual inductive fold includes and-clauses');

const lfDeclSrc = "wtp_fwd   : dual A A'\n  -> {X:name}hyp X A -> {Y:name}hyp Y A'\n  -> wtp (fwd X Y).";
const lfDecl = foldOnLine(lfDeclSrc);
expect(lfDecl, 'multi-line LF declaration is foldable');
expect(headerOf(lfDeclSrc, lfDecl).trimEnd() === firstLine(lfDeclSrc), 'LF decl fold keeps first line');
expect(bodyOf(lfDeclSrc, lfDecl).includes('-> {X:name}'), 'LF decl fold hides continuation');

expect(foldOnLine('hyp : name -> tp -> type.') == null, 'single-line LF declaration is not foldable');

function foldDoc(src) {
  const doc = Text.of(src.split('\n'));
  const state = EditorState.create({ doc, extensions: [beluga(), editorCodeFolding()] });
  ensureSyntaxTree(state, doc.length);
  const line = doc.line(1);
  const range = foldable(state, line.from, line.to);
  if (!range) return null;
  return state.update({ effects: foldEffect.of(range) }).state;
}

function firstFoldedRange(state) {
  let found = null;
  foldedRanges(state).between(0, state.doc.length, (from, to) => { found = { from, to }; });
  return found;
}

const foldedState = foldDoc('rec f : tp -> tp\n  -> tp\n  -> tp = fn x => x ;');
expect(foldedState, 'multi-line rec can be folded');
const folded = firstFoldedRange(foldedState);
expect(folded, 'folded range exists');
const unfolded = foldedState.update({ effects: unfoldEffect.of(folded) }).state;
expect(firstFoldedRange(unfolded) == null, 'stored range unfold clears fold');

if (failed) process.exit(1);
console.log('OK decl fold');
