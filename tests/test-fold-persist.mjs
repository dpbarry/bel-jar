import { beluga, belCodeFolding } from '../editor-src/bel-language.mjs';
import {
  readFileFoldKeys,
  readFoldPersistMode,
  reconcileStoredFoldKeys,
  writeFileFoldKeys,
} from '../editor-src/bel-fold-persist.mjs';
import {
  enumerateFoldables,
  foldKeyForRange,
  matchStoredFoldKeys,
  resolveFoldKeys,
} from '../editor-src/bel-fold-keys.mjs';
import {
  ensureSyntaxTree,
  foldEffect,
  foldedRanges,
} from '@codemirror/language';
import { EditorState, Text } from '@codemirror/state';

let failed = false;
function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed = true; }
}

const store = new Map();
globalThis.sessionStorage = {
  getItem(k) { return store.has(k) ? store.get(k) : null; },
  setItem(k, v) { store.set(k, v); },
  removeItem(k) { store.delete(k); },
};
globalThis.localStorage = globalThis.sessionStorage;

globalThis.BelJarPersist = {
  readStoredEditorFoldPersist: () => 'session',
  readStoredEditorFoldGutter: () => true,
};

function editorState(src) {
  const doc = Text.of(src.split('\n'));
  return EditorState.create({
    doc,
    extensions: [beluga(), belCodeFolding()],
  });
}

const src = [
  'rec f : tp -> tp',
  '  -> tp',
  '  -> tp = fn x => x ;',
  'rec g : tp -> tp = fn y => y ;',
].join('\n');

const state = editorState(src);
ensureSyntaxTree(state, state.doc.length);
const foldables = enumerateFoldables(state);
expect(foldables.length >= 1, 'finds foldable blocks');
const fKey = foldables.find((f) => f.key === 'decl:RecDeclaration:f');
expect(fKey, 'rec f gets stable decl key');

const gFold = foldables.find((f) => f.key === 'decl:RecDeclaration:g')?.range;
expect(!gFold, 'single-line rec g is not foldable');

const keyed = resolveFoldKeys(state, ['decl:RecDeclaration:f']);
expect(keyed.length === 1 && keyed[0].from === fKey.range.from, 'resolve key to current range');

writeFileFoldKeys('file-a', ['decl:RecDeclaration:f'], 'session');
expect(readFileFoldKeys('file-a', 'session').length === 1, 'round-trip stored keys');

const restored = state.update({
  effects: resolveFoldKeys(state, readFileFoldKeys('file-a', 'session')).map((r) => foldEffect.of(r)),
}).state;
let folded = false;
foldedRanges(restored).between(0, restored.doc.length, () => { folded = true; });
expect(folded, 'stored key restores fold');

const bad = resolveFoldKeys(state, ['decl:RecDeclaration:missing']);
expect(bad.length === 0, 'unknown keys resolve to nothing');

const afterFold = state.update({ effects: foldEffect.of(fKey.range) }).state;
const key = foldKeyForRange(afterFold, fKey.range);
expect(key === 'decl:RecDeclaration:f', 'folded range maps back to key');

writeFileFoldKeys('file-b', ['bad'], 'none');
expect(readFileFoldKeys('file-b', 'none').length === 0, 'none mode does not store');

expect(readFoldPersistMode() === 'session', 'reads persist mode from BelJarPersist');

store.set('beljar-fold-session-v1', '{not json');
expect(readFileFoldKeys('file-a', 'session').length === 0, 'corrupt store fails gracefully');

writeFileFoldKeys('file-c', ['decl:RecDeclaration:f', 'decl:RecDeclaration:ghost'], 'session');
reconcileStoredFoldKeys(state, 'file-c', 'session');
expect(
  readFileFoldKeys('file-c', 'session').join() === 'decl:RecDeclaration:f',
  'load prunes keys that no longer match foldable blocks',
);

if (failed) process.exit(1);
console.log('OK fold persist');
