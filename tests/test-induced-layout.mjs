import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EditorState, Transaction } from '@codemirror/state';
import { history, undo } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { beluga } from '../js/editor-src/language.mjs';
import { inducedEnterEdit, inducedTokenEdit, inducedLayout } from '../js/editor-src/ide/induced-layout.mjs';

const exts = [indentUnit.of('  '), beluga()];

function stateOf(marked, extra = []) {
  const pos = marked.indexOf('‸');
  assert.notEqual(pos, -1, marked);
  const doc = marked.replace('‸', '');
  return {
    pos,
    state: EditorState.create({
      doc,
      selection: { anchor: pos },
      extensions: [...exts, ...extra],
    }),
  };
}

function shown(doc, anchor) {
  return doc.slice(0, anchor) + '‸' + doc.slice(anchor);
}

function enter(marked) {
  const { state } = stateOf(marked);
  const edit = inducedEnterEdit(state);
  if (!edit) return null;
  const doc = state.doc.toString();
  const next = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  return shown(next, edit.anchor);
}

function snap(marked) {
  const { state } = stateOf(marked);
  const edit = inducedTokenEdit(state);
  if (!edit) return marked;
  const doc = state.doc.toString();
  const next = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  return shown(next, edit.anchor);
}

const enterCases = [
  ['case of opens a bar', 'rec f : nat -> nat =\n  case n of‸', 'rec f : nat -> nat =\n  case n of\n  | ‸'],
  ['fun opens a bar', 'rec f : nat -> nat =\n  fun‸', 'rec f : nat -> nat =\n  fun\n  | ‸'],
  ['finished case arm grows the next', 'rec f : nat -> nat =\n  case n of\n  | z => z‸', 'rec f : nat -> nat =\n  case n of\n  | z => z\n  | ‸'],
  ['finished arm body on the next line grows a bar at the bar column', 'rec f : nat -> nat =\n  case n of\n  | z =>\n    x‸', 'rec f : nat -> nat =\n  case n of\n  | z =>\n    x\n  | ‸'],
  ['open arm does not grow a bar', 'rec f : nat -> nat =\n  case n of\n  | z =>‸', null],
  ['let still owing its body does not grow a bar', 'rec f : nat -> nat =\n  case n of\n  | z =>\n    let y = x in‸', null],
  ['let without in does not grow a bar', 'rec f : nat -> nat =\n  case n of\n  | z =>\n    let y = x‸', null],
  ['if without else does not grow a bar', 'rec f : nat -> nat =\n  case n of\n  | z => if e then x‸', null],
  ['a finished let body grows a bar', 'rec f : nat -> nat =\n  case n of\n  | z =>\n    let y = x in y‸', 'rec f : nat -> nat =\n  case n of\n  | z =>\n    let y = x in y\n  | ‸'],
  ['a finished if grows a bar', 'rec f : nat -> nat =\n  case n of\n  | z => if e then x else y‸', 'rec f : nat -> nat =\n  case n of\n  | z => if e then x else y\n  | ‸'],
  ['open constructor type does not grow a bar', 'LF t : type =\n  | s : t ->‸', null],
  ['unicode arrow does not grow a bar', 'LF t : type =\n  | s : t →‸', null],
  ['open :: continues the result', 'coinductive Stream : ctype =\n  | hd : nat ::‸', null],
  ['finished :: grows a bar', 'coinductive Stream : ctype =\n  | hd : nat :: nat‸', 'coinductive Stream : ctype =\n  | hd : nat :: nat\n  | ‸'],
  ['rec equals does not open a bar', 'rec f : nat -> nat =‸', null],
  ['fn arrow stays with the fn', 'rec f : nat -> nat =\n  fn x =>‸', null],
  ['mlam arrow stays with the mlam', 'rec f : nat -> nat =\n  mlam x =>‸', null],
  ['struct indents and inserts nothing', 'module M = struct‸', 'module M = struct\n  ‸'],
  ['schema equals indents and inserts nothing', 'schema ctx =‸', 'schema ctx =\n  ‸'],
  ['typedef equals indents', 'typedef t : ctype =‸', 'typedef t : ctype =\n  ‸'],
  ['let equals indents', 'let x =‸', 'let x =\n  ‸'],
  ['proof equals indents the script', 'proof p : [|- nat] =‸', 'proof p : [|- nat] =\n  ‸'],
  ['empty LF bar leaves at the declaration', 'LF t : type =\n  |‸', 'LF t : type =\n‸'],
  ['empty bar inside a module leaves at the LF', 'module M = struct\n  LF t : type =\n    |‸', 'module M = struct\n  LF t : type =\n  ‸'],
  ['empty case bar leaves at the declaration', 'rec f : nat -> nat =\n  case n of\n  |‸', 'rec f : nat -> nat =\n  case n of\n‸'],
  ['empty case bar inside an open let leaves at the let', 'rec f : nat -> nat =\n  let y = case n of\n  |‸', 'rec f : nat -> nat =\n  let y = case n of\n  ‸'],
  ['padded semicolon snaps, then breaks', 'LF t : type =\n  | z : t\n      ;‸', 'LF t : type =\n  | z : t\n;\n‸'],
  ['padded and snaps, then breaks', 'LF nat : type =\n  | z : nat\n      and‸', 'LF nat : type =\n  | z : nat\nand\n‸'],
  ['end snaps to the module', 'module M = struct\n    end‸', 'module M = struct\nend\n‸'],
  ['in snaps to the let, then the body stays there', 'rec f : nat -> nat =\n  let y = x\n      in‸', 'rec f : nat -> nat =\n  let y = x\n  in\n  ‸'],
  ['then snaps to the if', 'rec f : nat -> nat =\n  if e\n      then‸', 'rec f : nat -> nat =\n  if e\n  then\n  ‸'],
  ['else snaps to the if', 'rec f : nat -> nat =\n  if e then x\n      else‸', 'rec f : nat -> nat =\n  if e then x\n  else\n  ‸'],
  ['a comment after equals is not an empty header', 'LF t : type =‸\n  % note\n', null],
  ['a proof script line does not move', 'proof p : [|- nat] =\n  intros‸', null],
  ['a hole does not move', 'rec f : nat -> nat =\n  ?x‸', null],
  ['a pragma does not move', '--open nat.‸', null],
  ['a constant kind continues', 'tm : tp ->‸', null],
  ['a bare dot is not a layout event', 'tm : tp.\n.‸', null],
  ['open paren indents inside the brackets', 'rec f : nat -> nat =\n  (‸', 'rec f : nat -> nat =\n  (\n    ‸'],
  ['plus on its own line snaps, then breaks', 'schema ctx =\n    +‸', 'schema ctx =\n  +\n  ‸'],
  ['turnstile is not a bar', 'rec f : nat -> nat =\n  |- nat‸', null],
];

for (const [what, from, to] of enterCases) assert.equal(enter(from), to, what);

const snapCases = [
  ['semicolon at the declaration column', 'LF t : type =\n  | z : t\n      ;‸', 'LF t : type =\n  | z : t\n;‸'],
  ['semicolon inside a module shares the LF column', 'module M = struct\n  LF t : type =\n    | z : t\n        ;‸', 'module M = struct\n  LF t : type =\n    | z : t\n  ;‸'],
  ['semicolon in let x = e stays', 'let x = e;‸', 'let x = e;‸'],
  ['lone bar snaps to the body column', 'LF t : type =\n|‸', 'LF t : type =\n  |‸'],
  ['lone bar inside a module snaps under the LF', 'module M = struct\n  LF t : type =\n|‸', 'module M = struct\n  LF t : type =\n    |‸'],
  ['lone case bar snaps to the case column', 'rec f : nat -> nat =\n  case n of\n|‸', 'rec f : nat -> nat =\n  case n of\n  |‸'],
  ['turnstile does not snap', 'LF t : type =\n  |-‸', 'LF t : type =\n  |-‸'],
  ['and waits until the word is finished', 'LF nat : type =\n  | z : nat\nand‸', 'LF nat : type =\n  | z : nat\nand‸'],
  ['and snaps once a space finishes it', 'LF nat : type =\n  | z : nat\n    and ‸', 'LF nat : type =\n  | z : nat\nand ‸'],
  ['in is not inductive', 'inductive Nat : ctype = | Z : Nat;‸', 'inductive Nat : ctype = | Z : Nat;‸'],
  ['halfway through inductive does not snap', 'in‸', 'in‸'],
  ['inductive does not snap as in', 'ind‸', 'ind‸'],
  ['in snaps to the let once finished', 'rec f : nat -> nat =\n  let y = x\n      in ‸', 'rec f : nat -> nat =\n  let y = x\n  in ‸'],
  ['end snaps to the module once finished', 'module M = struct\n      end ‸', 'module M = struct\nend ‸'],
  ['plus snaps to the schema body', 'schema ctx =\n+‸', 'schema ctx =\n  +‸'],
  ['fn as the first token of the body snaps', 'rec f : nat -> nat =\nfn ‸', 'rec f : nat -> nat =\n  fn ‸'],
  ['fn under an open arm nests one unit', 'rec f : nat -> nat =\n  case n of\n  | z =>\nfn ‸', 'rec f : nat -> nat =\n  case n of\n  | z =>\n    fn ‸'],
  ['case as the first token of the body snaps', 'rec f : nat -> nat =\ncase n of‸', 'rec f : nat -> nat =\n  case n of‸'],
  ['let on its own declaration line does not jump', 'let x = e‸', 'let x = e‸'],
  ['closer paren returns to the opener', 'rec f : nat -> nat =\n  (x\n    )‸', 'rec f : nat -> nat =\n  (x\n  )‸'],
  ['a proof line does not snap', 'proof p : [|- nat] =\n    intros‸', 'proof p : [|- nat] =\n    intros‸'],
  ['a proof semicolon snaps to the proof', 'proof p : [|- nat] =\n  intros\n    ;‸', 'proof p : [|- nat] =\n  intros\n;‸'],
  ['a comment does not snap', '    % note‸', '    % note‸'],
  ['a pragma does not snap', '    --open nat.‸', '    --open nat.‸'],
  ['a hole does not snap', '    ?x‸', '    ?x‸'],
];

for (const [what, from, to] of snapCases) assert.equal(snap(from), to, what);

// Shift+Enter is a plain newline: the binding does not run the classifier.
{
  const src = readFileSync(new URL('../js/editor-src/editor.mjs', import.meta.url), 'utf8');
  assert.match(src, /key: 'Enter', run: smartEnter, shift: insertNewline/);
}

// The keystroke that completes a token snaps in the same undo group. A case-ghost
// accept (`input.complete`) does not.
{
  const base = 'LF t : type =\n  | z : t\n';
  let st = EditorState.create({
    doc: base,
    extensions: [...exts, inducedLayout(), history()],
  });
  const view = {
    get state() { return st; },
    dispatch(spec) { st = (spec instanceof Transaction ? spec : st.update(spec)).state; },
  };
  const at = st.doc.length;
  view.dispatch({
    changes: { from: at, insert: '    ;' },
    selection: { anchor: at + 5 },
    userEvent: 'input.type',
  });
  assert.equal(view.state.doc.toString(), 'LF t : type =\n  | z : t\n;');
  undo(view);
  assert.equal(view.state.doc.toString(), base, 'the snap shares the keystroke\'s undo group');

  view.dispatch({
    changes: { from: view.state.doc.length, insert: '    ;' },
    selection: { anchor: view.state.doc.length + 5 },
    userEvent: 'input.complete',
  });
  assert.equal(view.state.doc.toString(), base + '    ;', 'input.complete does not snap');
}

function viewOf(doc) {
  let st = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [...exts, inducedLayout(), history()],
  });
  const view = {
    get state() { return st; },
    dispatch(spec) { st = (spec instanceof Transaction ? spec : st.update(spec)).state; },
  };
  return view;
}

function insertAt(view, at, text, userEvent, head, anchor = head) {
  view.dispatch({
    changes: { from: at, to: at, insert: text },
    selection: { anchor: at + anchor, head: at + head },
    userEvent,
  });
}

const layoutCases = [];
function layout(what, run) {
  layoutCases.push(what);
  run();
}

layout('accepting fn after rec breaks and indents', () => {
  const base = 'rec f : nat -> nat = ';
  const view = viewOf(base);
  const ins = 'fn ? \u21d2 ?';
  insertAt(view, base.length, ins, 'input.accept', ins.indexOf('?') + 1);
  assert.equal(view.state.doc.toString(), 'rec f : nat -> nat =\n  fn ? \u21d2 ?');
  const head = view.state.selection.main.head;
  assert.equal(view.state.doc.sliceString(head - 1, head), '?');
  undo(view);
  assert.equal(view.state.doc.toString(), base, 'the layout shares the accept undo group');
});

layout('typing a name after rec breaks under the equals', () => {
  const view = viewOf('rec f : nat -> nat = ');
  for (const ch of 'sum-z') {
    const at = view.state.selection.main.head;
    insertAt(view, at, ch, 'input.type', 1);
  }
  assert.equal(view.state.doc.toString(), 'rec f : nat -> nat =\n  sum-z');
  assert.equal(view.state.selection.main.head, view.state.doc.length);
});

layout('pasting a case indents the arm', () => {
  const base = 'rec f : nat -> nat = ';
  const view = viewOf(base);
  const ins = 'case ? of\n| _ \u21d2 ?';
  insertAt(view, base.length, ins, 'input.paste', ins.indexOf('?') + 1);
  assert.equal(view.state.doc.toString(), 'rec f : nat -> nat =\n  case ? of\n  | _ \u21d2 ?');
});

layout('a case after the arrow stays on the arrow line', () => {
  const base = 'rec f : nat -> nat =\n  fn x \u21d2 ';
  const view = viewOf(base);
  const ins = 'case ? of\n| _ \u21d2 ?';
  insertAt(view, base.length, ins, 'input.accept', ins.indexOf('?') + 1);
  assert.equal(
    view.state.doc.toString(),
    'rec f : nat -> nat =\n  fn x \u21d2 case ? of\n  | _ \u21d2 ?',
  );
});

layout('a totality hole breaks under the equals and stays selected', () => {
  const base = 'rec f : nat -> nat = ';
  const view = viewOf(base);
  const ins = '/ total ? /';
  const hole = ins.indexOf('?');
  insertAt(view, base.length, ins, 'input.accept', hole + 1, hole);
  assert.equal(view.state.doc.toString(), 'rec f : nat -> nat =\n  / total ? /');
  const sel = view.state.selection.main;
  assert.equal(view.state.doc.sliceString(sel.from, sel.to), '?');
});

layout('a totality annotation and its expression each take a line', () => {
  const base = 'rec f : nat = ';
  const view = viewOf(base);
  const ins = '/ total 1 / fn x => x;';
  insertAt(view, base.length, ins, 'input.paste', ins.length);
  assert.equal(view.state.doc.toString(), 'rec f : nat =\n  / total 1 /\n  fn x => x\n;');
});

layout('an LF bar pasted at column 0 indents, and a parsed semicolon breaks', () => {
  const view = viewOf('');
  const ins = 'LF nat : type =\n| z : nat;';
  insertAt(view, 0, ins, 'input.paste', ins.length);
  assert.equal(view.state.doc.toString(), 'LF nat : type =\n  | z : nat\n;');
});

layout('an LF hole scaffold indents its bar', () => {
  const view = viewOf('');
  const ins = 'LF ? : type =\n| ? : ?;';
  insertAt(view, 0, ins, 'input.paste', ins.length);
  assert.equal(view.state.doc.toString(), 'LF ? : type =\n  | ? : ?;');
});

layout('module end takes its own line', () => {
  const view = viewOf('');
  const ins = 'module M = struct end;';
  insertAt(view, 0, ins, 'input.paste', ins.length);
  assert.equal(view.state.doc.toString(), 'module M = struct\nend;');
});

layout('let and impossible take only the rec-body break', () => {
  const base = 'rec f : nat -> nat = ';
  for (const [ins, want] of [
    ['let ? = ? in ?', 'rec f : nat -> nat =\n  let ? = ? in ?'],
    ['impossible ?', 'rec f : nat -> nat =\n  impossible ?'],
  ]) {
    const view = viewOf(base);
    insertAt(view, base.length, ins, 'input.accept', ins.length);
    assert.equal(view.state.doc.toString(), want, ins);
  }
});

layout('a short let, schema, and typedef stay on their equals line', () => {
  for (const ins of ['let x = e;', 'schema ctx = block (x : nat);', 'typedef t : ctype = nat;']) {
    const view = viewOf('');
    insertAt(view, 0, ins, 'input.paste', ins.length);
    assert.equal(view.state.doc.toString(), ins, ins);
  }
});

layout('a keystroke on a settled line does not reflow another declaration', () => {
  const doc = 'rec f : nat -> nat =\n  fn x \u21d2 \n;\nrec g : nat = y;';
  const view = viewOf(doc);
  const at = doc.indexOf('\u21d2 ') + '\u21d2 '.length;
  insertAt(view, at, 'x', 'input.type', 1);
  assert.equal(view.state.doc.toString(), 'rec f : nat -> nat =\n  fn x \u21d2 x\n;\nrec g : nat = y;');
});

layout('input.complete does not lay out', () => {
  const base = 'rec f : nat -> nat = ';
  const view = viewOf(base);
  const ins = 'fn ? \u21d2 ?';
  insertAt(view, base.length, ins, 'input.complete', ins.length);
  assert.equal(view.state.doc.toString(), base + ins);
});

layout('a proof script stays where it was pasted', () => {
  const base = 'proof p : [|- nat] =\n';
  const view = viewOf(base);
  insertAt(view, base.length, '| intros', 'input.paste', '| intros'.length);
  assert.equal(view.state.doc.toString(), base + '| intros');
});

console.log(`OK induced layout (${enterCases.length + snapCases.length} routes, ${layoutCases.length} layout)`);
