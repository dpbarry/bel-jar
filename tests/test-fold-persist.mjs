import { beluga, editorCodeFolding } from '../js/editor-src/language.mjs';
import {
  readFileFoldKeys,
  readFoldPersistMode,
  reconcileStoredFoldKeys,
  writeFileFoldKeys,
} from '../js/editor-src/ide/fold-persist.mjs';
import {
  enumerateFoldables,
  foldKeyForRange,
  matchStoredFoldKeys,
  resolveFoldKeys,
} from '../js/editor-src/ide/fold-keys.mjs';
import {
  ensureSyntaxTree,
  foldEffect,
  foldedRanges,
} from '@codemirror/language';
import { EditorState, Text } from '@codemirror/state';
import { makeBrowserStorage, openTab } from './_persist-env.mjs';

let failed = false;
function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed = true; }
}

// A real Persist: folds live in the store the editorFoldPersist setting picks
// (this tab by default), per file of the page's project.
const local = makeBrowserStorage();
const session = makeBrowserStorage();
const { P, S } = openTab(local, { sessionStorage: session });
globalThis.Persist = P;
globalThis.Settings = S;
const fileA = P.createFile('a.bel');
const fileB = P.createFile('b.bel');
const fileC = P.createFile('c.bel');
const foldsKey = 'beljar/p/' + P.getActiveProjectId() + '/folds';

function editorState(src) {
  const doc = Text.of(src.split('\n'));
  return EditorState.create({
    doc,
    extensions: [beluga(), editorCodeFolding()],
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

writeFileFoldKeys(fileA, ['decl:RecDeclaration:f'], 'session');
expect(readFileFoldKeys(fileA, 'session').length === 1, 'round-trip stored keys');

const restored = state.update({
  effects: resolveFoldKeys(state, readFileFoldKeys(fileA, 'session')).map((r) => foldEffect.of(r)),
}).state;
let folded = false;
foldedRanges(restored).between(0, restored.doc.length, () => { folded = true; });
expect(folded, 'stored key restores fold');

const bad = resolveFoldKeys(state, ['decl:RecDeclaration:missing']);
expect(bad.length === 0, 'unknown keys resolve to nothing');

const afterFold = state.update({ effects: foldEffect.of(fKey.range) }).state;
const key = foldKeyForRange(afterFold, fKey.range);
expect(key === 'decl:RecDeclaration:f', 'folded range maps back to key');

writeFileFoldKeys(fileB, ['bad'], 'none');
expect(readFileFoldKeys(fileB, 'none').length === 0, 'none mode does not store');

expect(readFoldPersistMode() === 'session', 'the mode is the setting (this tab, by default)');
expect(session.getItem(foldsKey) !== null && local.getItem(foldsKey) === null, 'kept in the tab store');

session.setItem(foldsKey, '{not json');
expect(readFileFoldKeys(fileA, 'session').length === 0, 'corrupt store fails gracefully');

writeFileFoldKeys(fileC, ['decl:RecDeclaration:f', 'decl:RecDeclaration:ghost'], 'session');
reconcileStoredFoldKeys(state, fileC, 'session');
expect(
  readFileFoldKeys(fileC, 'session').join() === 'decl:RecDeclaration:f',
  'load prunes keys that no longer match foldable blocks',
);

// ⛔ Changing where folds are kept carries them there, whoever changes it.
S.set('editorFoldPersist', 'local');
expect(local.getItem(foldsKey) !== null && session.getItem(foldsKey) === null, 'switching to this device moves the folds');
expect(readFileFoldKeys(fileC).join() === 'decl:RecDeclaration:f', 'and they still read back');
S.set('editorFoldPersist', 'none');
expect(local.getItem(foldsKey) === null && session.getItem(foldsKey) === null, 'switching to none forgets them');
S.set('editorFoldPersist', 'session');

// A deleted file's folds go with it on the next write.
writeFileFoldKeys(fileA, ['decl:RecDeclaration:f']);
writeFileFoldKeys(fileC, ['decl:RecDeclaration:f']);
P.deleteFile(fileA);
writeFileFoldKeys(fileC, ['decl:RecDeclaration:f']);
expect(!(fileA in JSON.parse(session.getItem(foldsKey)).data), 'a deleted file\'s folds are dropped');

if (failed) process.exit(1);
console.log('OK fold persist');
