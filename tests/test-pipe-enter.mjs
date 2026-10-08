import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';
import { beluga } from '../js/editor-src/language.mjs';
import { inducedEnterEdit } from '../js/editor-src/ide/induced-layout.mjs';

function press(marked) {
  const pos = marked.indexOf('‸');
  assert.notEqual(pos, -1, 'caret');
  const doc = marked.replace('‸', '');
  const state = EditorState.create({
    doc,
    selection: { anchor: pos },
    extensions: [indentUnit.of('  '), beluga()],
  });
  const edit = inducedEnterEdit(state);
  if (!edit) return null;
  const next = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  return next.slice(0, edit.anchor) + '‸' + next.slice(edit.anchor);
}

const opens = [
  ['LF header', 'LF le : n -> n -> type =‸', 'LF le : n -> n -> type =\n  | ‸'],
  ['datatype header', 'datatype nat : type =‸', 'datatype nat : type =\n  | ‸'],
  ['kind pi the grammar misses', 'LF eq : {A : type} A -> A -> type =‸', 'LF eq : {A : type} A -> A -> type =\n  | ‸'],
  ['kind pi that parses', 'LF eq : {A : tp} A -> A -> type =‸', 'LF eq : {A : tp} A -> A -> type =\n  | ‸'],
  ['inductive', 'inductive Nat : ctype =‸', 'inductive Nat : ctype =\n  | ‸'],
  ['stratified', 'stratified Tm : ctype =‸', 'stratified Tm : ctype =\n  | ‸'],
  ['coinductive', 'coinductive Stream : ctype =‸', 'coinductive Stream : ctype =\n  | ‸'],
  ['mutual and', 'LF nat : type =\n  | z : nat\nand even : nat -> type =‸', 'LF nat : type =\n  | z : nat\nand even : nat -> type =\n  | ‸'],
  ['trailing space after =', 'LF t : type = ‸', 'LF t : type =\n  | ‸'],
  ['inside a module', 'module M = struct\n  LF t : type =‸', 'module M = struct\n  LF t : type =\n    | ‸'],
  ['unicode arrows', 'LF le : n → n → type =‸', 'LF le : n → n → type =\n  | ‸'],
  ['another declaration follows', 'LF nat : type =‸\nLF bool : type =\n  | true : bool\n;', 'LF nat : type =\n  | ‸\nLF bool : type =\n  | true : bool\n;'],
];

const stays = [
  ['rec', 'rec f : nat -> nat =‸'],
  ['rec totality still to come', 'rec f : nat -> nat =‸\n  / total 1 /'],
  ['module equals is not a bar', 'module M =‸'],
  ['constructors already follow', 'LF t : type =‸\n  | z : t\n;'],
  ['semicolon already follows', 'LF t : type =‸\n;'],
  ['and already follows', 'LF nat : type =‸\nand even : nat -> type =\n;'],
  ['caret not at the end', 'LF t : type =‸ \n'],
  ['open constructor type', 'LF t : type =\n  | s : t ->‸'],
  ['open destructor', 'coinductive Stream : ctype =\n  | hd : nat ::‸'],
  ['open case arm', 'rec f : nat -> nat =\n  case n of\n  | z =>‸'],
  ['a bar that is not a list', '|‸'],
  ['bar ending in equals is not another bar', '| con : nat =‸'],
  ['comment on the header line', 'LF t : type = % note‸'],
  ['comment already on the next line', 'LF t : type =‸\n  % note\n'],
];

const arms = [
  ['filled LF constructor', 'LF t : type =\n  | z : t‸', 'LF t : type =\n  | z : t\n  | ‸'],
  ['filled inductive constructor', 'inductive Nat : ctype =\n  | Z : Nat‸', 'inductive Nat : ctype =\n  | Z : Nat\n  | ‸'],
  ['filled coinductive destructor', 'coinductive Stream : ctype =\n  | hd : nat :: nat‸', 'coinductive Stream : ctype =\n  | hd : nat :: nat\n  | ‸'],
  ['keeps a deeper indent', 'LF t : type =\n    | z : t‸', 'LF t : type =\n    | z : t\n    | ‸'],
  ['filled case arm', 'rec f : nat -> nat =\n  case n of\n  | z => z‸', 'rec f : nat -> nat =\n  case n of\n  | z => z\n  | ‸'],
  ['filled fun arm', 'rec f : nat -> nat =\n  fun | .hd => z‸', 'rec f : nat -> nat =\n  fun | .hd => z\n  | ‸'],
];

const indents = [
  ['let', 'let x =‸', 'let x =\n  ‸'],
  ['schema', 'schema ctx =‸', 'schema ctx =\n  ‸'],
  ['typedef', 'typedef t : ctype =‸', 'typedef t : ctype =\n  ‸'],
  ['proof', 'proof p : [|- nat] =‸', 'proof p : [|- nat] =\n  ‸'],
  ['module struct', 'module M = struct‸', 'module M = struct\n  ‸'],
];

const clears = [
  ['empty LF bar', 'LF t : type =\n  |‸', 'LF t : type =\n‸'],
  ['empty LF bar with the trailing space', 'LF t : type =\n  | ‸', 'LF t : type =\n‸'],
  ['empty bar after a missed kind', 'LF eq : {A : type} A -> A -> type =\n  |‸', 'LF eq : {A : type} A -> A -> type =\n‸'],
  ['empty inductive bar', 'inductive Nat : ctype =\n  |‸', 'inductive Nat : ctype =\n‸'],
  ['empty case bar', 'rec f : nat -> nat =\n  case n of\n  |‸', 'rec f : nat -> nat =\n  case n of\n‸'],
  ['empty case bar after an arm', 'rec f : nat -> nat =\n  case n of\n  | z => z\n  |‸', 'rec f : nat -> nat =\n  case n of\n  | z => z\n‸'],
  ['empty fun bar', 'rec f : nat -> nat =\n  fun\n  |‸', 'rec f : nat -> nat =\n  fun\n‸'],
  ['empty fun bar after an arm', 'rec f : nat -> nat =\n  fun | .hd => z\n  |‸', 'rec f : nat -> nat =\n  fun | .hd => z\n‸'],
];

for (const [what, from, to] of opens) assert.equal(press(from), to, what);
for (const [what, from] of stays) assert.equal(press(from), null, what);
for (const [what, from, to] of arms) assert.equal(press(from), to, what);
for (const [what, from, to] of clears) assert.equal(press(from), to, what);
for (const [what, from, to] of indents) assert.equal(press(from), to, what);

console.log(`OK pipe enter (${opens.length + stays.length + arms.length + clears.length + indents.length})`);
