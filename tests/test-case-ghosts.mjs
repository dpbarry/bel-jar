// The ghost layer of case completion (js/editor-src/ide/case-ghosts.mjs), on a bare
// EditorState: what is drawn when, what an edit does to it, and what accepting does to
// the document. Pure Node, no Beluga, no DOM.
import { EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { beluga } from '../js/editor-src/language.mjs';
import {
  caseGhosts, bindCaseGhosts, caseCommandState, acceptFilledCase, dismissFilledCase, fillCaseNow,
  _forTests,
} from '../js/editor-src/ide/case-ghosts.mjs';
import * as store from '../js/editor-src/prover/case-fill-store.mjs';
import { proofsOfText } from '../js/editor-src/prover/case-fill-scheduler.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const { refreshGhosts } = _forTests;

// `f` has the case for `b` written; `a` belongs before it and `c` after it.
const DOC = `LF tm : type = | a : tm | b : tm | c : tm -> tm;
rec f : [ |- tm] -> [ |- tm] =
/ total n (f n) /
fn n => case n of
| [ |- b] => [ |- b]
;
`;
const FILE = 'file-1';
const touched = [];
const forced = [];
bindCaseGhosts({
  fileId: () => FILE,
  scheduler: {
    proofTouched: (fileId, recKey) => touched.push({ fileId, recKey }),
    force: (pos, keys) => { forced.push({ pos, keys }); return true; },
  },
});
const toasts = [];
globalThis.Toasts = { error: (m) => toasts.push(m) };

const proofOf = (text) => proofsOfText(text).find((p) => p.name === 'f');
// Structure, read past the notation: greedy alias expansion (the default) writes glyphs.
const plain = (s) => s.replace(/⊢/g, '|-').replace(/⇒/g, '=>').replace(/→/g, '->');
const armTexts = (text) => proofOf(text).arms.map((x) => plain(x.text.replace(/\s+/g, ' ').trim()));
const ROWS = [
  { key: 'a', rule: 'a', pattern: '[ |- a]', anchor: 'b' },
  { key: 'c', rule: 'c', pattern: '[ |- c N]', anchor: null },
];

function plan(text, rows = ROWS) {
  const p = proofOf(text);
  store.setPlan(FILE, p.recKey, {
    recName: 'f', ordinal: 0, fingerprint: p.fingerprint, eligibility: null, rows,
  });
  return p.recKey;
}

// A view the layer can dispatch through, with CodeMirror's own history to count steps.
function fakeView(doc, caret) {
  // The Beluga language too: its indenter is what an accept must not run over the proof.
  let st = EditorState.create({ doc, selection: { anchor: caret }, extensions: [beluga(), history(), caseGhosts()] });
  return {
    get state() { return st; },
    dispatch(spec) { st = (spec instanceof Transaction ? spec : st.update(spec)).state; },
  };
}
const refresh = (v) => v.dispatch({ effects: refreshGhosts.of(null) });
function widgetCount(state) {
  let n = 0;
  for (const set of state.facet(EditorView.decorations)) {
    if (typeof set === 'function') continue;
    set.between(0, state.doc.length, () => { n += 1; });
  }
  return n;
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const lineStart = (text, needle) => text.indexOf(needle);
const OUTSIDE = 0; // inside the LF declaration, outside the proof
const CASE_LINE = lineStart(DOC, 'fn n => case n of') + 3; // the line `a`'s ghost hangs from
const B_LINE = lineStart(DOC, '| [ |- b]') + 3; // the line `c`'s ghost hangs from

// ── what is drawn ────────────────────────────────────────────────────────────
{
  store.resetStore();
  const v = fakeView(DOC, OUTSIDE);
  expect(widgetCount(v.state) === 0, 'nothing is drawn before case completion knows anything');
  const recKey = plan(DOC);
  refresh(v);
  expect(widgetCount(v.state) === 0, 'rows not filled are hidden while the caret is outside the proof');
  v.dispatch({ selection: { anchor: B_LINE } });
  expect(widgetCount(v.state) === 2, 'with the caret in the proof, the unfilled rows show, one ghost per place');
  expect(caseCommandState(v.state).inProof && !caseCommandState(v.state).hasFilled,
    'in the proof, nothing filled yet: Fill offered, Accept not');
  v.dispatch({ selection: { anchor: OUTSIDE } });
  expect(widgetCount(v.state) === 0, 'leaving the proof hides them again');
  expect(!caseCommandState(v.state).inProof, 'outside every proof, nothing is offered');

  store.setResult(FILE, recKey, { key: 'a', ok: true, text: '[ |- a] => [ |- a]', source: 'orca' });
  refresh(v);
  expect(widgetCount(v.state) === 1, 'a filled row shows wherever the caret is');
  expect(caseCommandState(v.state, CASE_LINE).hasFilled, 'Accept is offered on the line a filled ghost hangs from');
  expect(caseCommandState(v.state, DOC.indexOf('/ total') + 2).hasFilled,
    'and anywhere else in a proof with a filled row');
  store.setResult(FILE, recKey, { key: 'c', ok: false, why: 'no-move' });
  refresh(v);
  expect(widgetCount(v.state) === 1, 'a row nothing filled stays hidden outside the proof');
}

// ── an edit elsewhere maps the ghosts; an edit in the proof drops them ────────
{
  store.resetStore();
  touched.length = 0;
  const v = fakeView(DOC, OUTSIDE);
  const recKey = plan(DOC);
  store.setResult(FILE, recKey, { key: 'a', ok: true, text: '[ |- a] => [ |- a]', source: 'orca' });
  store.setResult(FILE, recKey, { key: 'c', ok: true, text: '[ |- c N] => [ |- N]', source: 'lookup', donor: 'b' });
  refresh(v);
  expect(widgetCount(v.state) === 2, 'two filled rows, two places');

  const PAD = '% a note\n';
  v.dispatch({ changes: { from: 0, insert: PAD } });
  expect(widgetCount(v.state) === 2, 'an edit outside the proof keeps its ghosts');
  expect(touched.length === 0, 'and does not touch its job');
  // The hang lines moved with the text: accepting from `case`'s line takes `a` alone.
  const caseLine = CASE_LINE + PAD.length;
  expect(acceptFilledCase(v, caseLine), 'accept from the line a ghost hangs from');
  const after = v.state.doc.toString();
  const arms = armTexts(after);
  expect(arms.length === 2 && arms.some((x) => x.startsWith('[ |- a]')) && !arms.some((x) => x.startsWith('[ |- c')),
    `the edit elsewhere mapped the hang lines: one arm, a, accepted (got ${JSON.stringify(arms)})`);
  expect(arms[0].startsWith('[ |- a]'), 'a goes before b, where the signature puts it');
}

{
  store.resetStore();
  touched.length = 0;
  const v = fakeView(DOC, OUTSIDE);
  const recKey = plan(DOC);
  store.setResult(FILE, recKey, { key: 'a', ok: true, text: '[ |- a] => [ |- a]', source: 'orca' });
  refresh(v);
  const at = DOC.indexOf('[ |- b] => [ |- b]') + '[ |- b] => [ |- '.length;
  v.dispatch({ changes: { from: at, to: at + 1, insert: 'a' } });
  expect(widgetCount(v.state) === 0, 'an edit inside the proof drops its ghosts at once');
  await flush();
  expect(touched.length === 1 && touched[0].recKey === recKey && touched[0].fileId === FILE,
    'and tells the scheduler which proof changed');
}

// ── accepting: one step, exactly the arm, parse-checked first ─────────────────
{
  store.resetStore();
  const v = fakeView(DOC, B_LINE);
  const recKey = plan(DOC);
  store.setResult(FILE, recKey, { key: 'a', ok: true, text: '[ |- a] => [ |- a]', source: 'orca' });
  store.setResult(FILE, recKey, { key: 'c', ok: true, text: '[ |- c N] => [ |- N]', source: 'orca' });
  refresh(v);
  // The caret is on b's line, where c's ghost hangs: c alone goes in, after b.
  expect(acceptFilledCase(v), 'accept the ghost on the caret line');
  const one = v.state.doc.toString();
  const arms = armTexts(one);
  expect(arms.length === 2 && arms[1] === '[ |- c N] => [ |- N]', `c goes after b (got ${JSON.stringify(arms)})`);
  expect(one.includes('| [ ⊢ c N] ⇒ [ ⊢ N]'),
    "the arm is written in the file's notation: greedy expansion has nothing left to rewrite");
  expect(!store.entry(FILE, recKey).rows.has('c'), 'an accepted row leaves the store');
  expect(store.entry(FILE, recKey).fingerprint === proofOf(one).fingerprint,
    'the entry now belongs to the proof as it reads after the accept');
  refresh(v);
  expect(widgetCount(v.state) === 1, 'the other filled row is still drawn against the new text');

  // From outside any hang line but inside the proof: every filled row of the proof.
  v.dispatch({ selection: { anchor: one.indexOf('/ total') + 2 } });
  expect(acceptFilledCase(v), 'accept every filled case of the proof');
  const two = v.state.doc.toString();
  expect(proofOf(two).arms.length === 3, 'the proof has all three arms');
  undo(v);
  expect(v.state.doc.toString() === one, 'one undo takes back one accept');
  undo(v);
  expect(v.state.doc.toString() === DOC, 'and the next, the one before it');
}

{
  store.resetStore();
  toasts.length = 0;
  const v = fakeView(DOC, CASE_LINE);
  const recKey = plan(DOC);
  // An arm that would not read back as one more arm of this proof is not placed.
  store.setResult(FILE, recKey, { key: 'a', ok: true, text: '[ |- a] => [ |- a];\nrec g : [ |- tm] -> [ |- tm] = fn n => n', source: 'orca' });
  refresh(v);
  expect(acceptFilledCase(v), 'the accept ran');
  expect(v.state.doc.toString() === DOC, 'a fill that does not parse back as one arm leaves the document alone');
  expect(toasts.length === 1, 'and says so');
}

// ── an accept writes the arm as the ghost shows it, and touches nothing else ───
// Regression (Chrome, 2026-10-05): the accept ran the language's indenter over the span,
// which pushed the new arm in two columns and re-indented the last line of the case the
// author had written above it.
{
  store.resetStore();
  const TALL = `LF tm : type = | a : tm | b : tm | c : tm -> tm;
rec f : [ ⊢ tm] → [ ⊢ tm] =
/ total n (f n) /
fn n ⇒ case n of
| [ ⊢ b] ⇒
  let x = n in
  [ ⊢ b]
;
`;
  const v = fakeView(TALL, TALL.indexOf('  [ ⊢ b]') + '  [ ⊢ b]'.length);
  const recKey = plan(TALL, [{ key: 'c', rule: 'c', pattern: '[ |- c N]', anchor: null }]);
  // Orca lays its own output out four columns in; the author's arms use two. The body is
  // moved as a block to the author's column, its own nesting kept.
  store.setResult(FILE, recKey, { key: 'c', ok: true, text: '[ |- c N] =>\n    let y = n in\n      [ |- N]', source: 'orca' });
  refresh(v);
  expect(acceptFilledCase(v), 'accept a two-line case');
  const want = TALL.replace('  [ ⊢ b]\n;', '  [ ⊢ b]\n| [ ⊢ c N] ⇒\n  let y = n in\n    [ ⊢ N]\n;');
  expect(v.state.doc.toString() === want, `exactly the arm, in the author's columns, and nothing else moved:\n${v.state.doc.toString()}`);
}

// ── dismiss and force ─────────────────────────────────────────────────────────
{
  store.resetStore();
  forced.length = 0;
  const v = fakeView(DOC, CASE_LINE);
  const recKey = plan(DOC);
  store.setResult(FILE, recKey, { key: 'a', ok: true, text: '[ |- a] => [ |- a]', source: 'orca' });
  store.setResult(FILE, recKey, { key: 'c', ok: true, text: '[ |- c N] => [ |- N]', source: 'orca' });
  refresh(v);
  expect(dismissFilledCase(v), 'dismiss the ghost on the caret line');
  refresh(v);
  expect(store.entry(FILE, recKey).rows.get('a').state === 'dismissed', 'the row is dismissed');
  expect(store.entry(FILE, recKey).rows.get('c').state === 'filled', 'the other filled row is untouched');
  expect(widgetCount(v.state) === 1, 'and still drawn');
  store.setResult(FILE, recKey, { key: 'c', ok: false, why: 'no-move' });
  refresh(v);
  // c's unfilled ghost hangs from b's line: forcing there asks for c alone.
  v.dispatch({ selection: { anchor: B_LINE } });
  expect(fillCaseNow(v), 'force from the line an unfilled row hangs from');
  expect(forced.length === 1 && JSON.stringify(forced[0].keys) === '["c"]', `forces that row only (got ${JSON.stringify(forced)})`);
  v.dispatch({ selection: { anchor: DOC.indexOf('/ total') + 2 } });
  expect(fillCaseNow(v), 'force from elsewhere in the proof');
  expect(forced.length === 2 && forced[1].keys === null, 'forces the whole proof');
}

console.log('ok case-ghosts');
