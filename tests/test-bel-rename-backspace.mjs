import { EditorState, Transaction } from '@codemirror/state';
import {
  rename,
  renameActiveField,
  renameSessionEffect,
} from '../js/editor-src/ide/rename.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// Single-char anchor at cursor start: first backspace deletes, stays in rename.
const session = {
  symbolId: 'sym:x',
  originalName: 'x',
  sites: [{ from: 0, to: 1 }, { from: 4, to: 5 }],
  anchorSite: 0,
};

let state = EditorState.create({
  doc: 'x bar x',
  extensions: rename(),
});

state = state.update({
  effects: renameSessionEffect.of(session),
  selection: { anchor: 0, head: 0 },
}).state;

// Simulate backspace at anchor start with one char left: changeFilter allows delete inside anchor.
state = state.update({
  changes: [{ from: 0, to: 1, insert: '' }],
  selection: { anchor: 0, head: 0 },
}).state;
expect(state.field(renameActiveField, false), 'single-char delete keeps rename session');

// Empty anchor: session still active (second backspace would cancel via keymap in browser).
const anchor = state.field(renameActiveField, false).sites[state.field(renameActiveField, false).anchorSite];
expect(anchor.from === anchor.to, 'anchor is empty after deleting sole char');

console.log('OK bel-rename backspace (delete last char stays in rename)');
