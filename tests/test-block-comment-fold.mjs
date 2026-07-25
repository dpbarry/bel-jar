import { beluga, editorCodeFolding } from '../js/editor-src/language.mjs';
import { ensureSyntaxTree, foldable } from '@codemirror/language';
import { EditorState, Text } from '@codemirror/state';

let failed = false;
function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed = true; }
}

function foldOnLine(src, lineNo) {
  const doc = Text.of(src.split('\n'));
  const state = EditorState.create({ doc, extensions: [beluga(), editorCodeFolding()] });
  ensureSyntaxTree(state, doc.length);
  const line = doc.line(lineNo);
  return foldable(state, line.from, line.to);
}

const multi = foldOnLine('%{ line1\nline2 }%\nLF a : type = | c : a ;', 1);
expect(multi && multi.from === 2 && multi.to === 15, 'multi-line %{ }% comment is foldable');

const single = foldOnLine('%{ one line }%\nLF a : type = | c : a ;', 1);
expect(single == null, 'single-line %{ }% comment is not foldable');

const doc = foldOnLine('%{{ # Title\nbody }}%\nLF a : type = | c : a ;', 1);
expect(doc && doc.from === 3 && doc.to === 17, 'multi-line %{{ }}% doc comment is foldable');

const run = foldOnLine('% a\n% b\n% c\n\nLF a : type = | c : a ;', 1);
expect(run && run.from === 2 && run.to === 11, 'multi-line % run leaves gap space before box');

const runMid = foldOnLine('% a\n% b\n% c\n\nLF a : type = | c : a ;', 2);
expect(runMid == null, 'middle line of % run has no fold marker');

const runSingle = foldOnLine('% only\nLF a : type = | c : a ;', 1);
expect(runSingle == null, 'single % line is not foldable');

const runBlank = foldOnLine('% a\n\n% b\nLF a : type = | c : a ;', 1);
expect(runBlank == null, 'blank line breaks % run so lone % line does not fold');

const emptyLine = foldOnLine('% header\n%\n% footer\nLF a : type = | c : a ;', 1);
expect(emptyLine && emptyLine.from === 2 && emptyLine.to === 19, 'bare % lines count in a run');

if (failed) process.exit(1);
console.log('OK comment fold');
