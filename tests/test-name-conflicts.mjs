import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'name-conflicts.js'), 'utf8');
const fakeWindow = {};
// eslint-disable-next-line no-new-func
new Function('window', src)(fakeWindow);
const NC = fakeWindow.BelJarNameConflicts;
expect(NC && typeof NC.detectUploadConflicts === 'function', 'BelJarNameConflicts exported');

const existing = [
  { id: 'a', name: 'main.bel' },
  { id: 'b', name: 'lib/util.bel' },
  { id: 'c', name: 'pkg/a.bel' },
  { id: 'd', name: 'pkg/b.bel' },
];

expect(!NC.nameConflict(existing, 'other.bel'), 'no conflict for new root name');
expect(NC.nameConflict(existing, 'main.bel'), 'root file conflict');
expect(!NC.nameConflict(existing, 'main.bel', 'a'), 'exclude self on rename');
expect(NC.nameConflict(existing, 'lib/util.bel', 'x'), 'nested path conflict');
expect(!NC.nameConflict(existing, 'util.bel'), 'same basename in different folder is ok');

expect(NC.suggestNewPath('main.bel', ['main.bel']) === 'main-1.bel', 'suggest -1 before ext');
expect(NC.suggestNewPath('main.bel', ['main.bel', 'main-1.bel']) === 'main-2.bel',
  'increment when -1 taken');
expect(NC.suggestNewPath('main-1.bel', ['main-1.bel']) === 'main-2.bel',
  'increment trailing number on stem');
expect(NC.suggestNewPath('lib/util.bel', ['lib/util.bel']) === 'lib/util-1.bel',
  'suggest numbered path in folder');

const fileConflict = NC.detectUploadConflicts(existing, [{ name: 'main.bel', text: 'x' }]);
expect(fileConflict.length === 1 && fileConflict[0].kind === 'file', 'detect file conflict');
expect(fileConflict[0].suggestedPath === 'main-1.bel', 'file conflict gets suggested path');

const noConflict = NC.detectUploadConflicts(existing, [{ name: 'util.bel', text: 'x' }]);
expect(noConflict.length === 0, 'no conflict when only basename matches in another folder');

const folderIncoming = [
  { name: 'pkg/a.bel', text: '1' },
  { name: 'pkg/c.bel', text: '2' },
];
const folderConflict = NC.detectUploadConflicts(existing, folderIncoming);
expect(folderConflict.length === 1 && folderConflict[0].kind === 'folder', 'folder conflict when tree collides');
expect(folderConflict[0].path === 'pkg', 'folder conflict path is folder prefix');
expect(folderConflict[0].suggestedPath === 'pkg-1', 'folder conflict suggests numbered folder');

const libraryBatchRoots = NC.uploadFolderBatchRoots(folderIncoming);
expect(libraryBatchRoots.length === 1 && libraryBatchRoots[0] === 'pkg',
  'library folder insert shares one batch root');
const libraryFolderConflict = NC.detectUploadConflicts(existing, folderIncoming, {
  folderBatchRoots: libraryBatchRoots,
});
expect(libraryFolderConflict.length === 1 && libraryFolderConflict[0].kind === 'folder',
  'library bulk insert uses folder conflict when root collides');

const multiFileConflict = NC.detectUploadConflicts(
  existing,
  [{ name: 'main.bel', text: '1' }, { name: 'lib/util.bel', text: '2' }],
  { folderBatchRoots: [] },
);
expect(multiFileConflict.length === 2, 'multi file upload yields per-file conflicts');
expect(multiFileConflict.every(function (c) { return c.kind === 'file'; }), 'no bogus folder batch');

const moveIntoFolder = NC.detectMoveConflicts(
  [
    { id: 'b', name: 'lib/a.bel' },
    { id: 'c', name: 'lib/b.bel' },
    { id: 'x', name: 'main.bel' },
    { id: 'y', name: 'foo.bel' },
  ],
  [
    { id: 'x', from: 'main.bel', to: 'lib/a.bel', text: '1' },
    { id: 'y', from: 'foo.bel', to: 'lib/b.bel', text: '2' },
  ],
  { moveKind: 'files' },
);
expect(moveIntoFolder.length === 2, 'multi-file move into folder yields per-file conflicts');
expect(moveIntoFolder.every(function (c) { return c.kind === 'file'; }), 'move loose files not folder batch');

const planSkip = NC.applyResolutions(
  existing,
  [{ name: 'main.bel', text: 'new' }],
  fileConflict,
  [{ action: 'skip' }],
);
expect(planSkip.create.length === 0 && planSkip.replace.length === 0, 'skip leaves plan empty');

const planReplace = NC.applyResolutions(
  existing,
  [{ name: 'main.bel', text: 'new' }],
  fileConflict,
  [{ action: 'replace' }],
);
expect(planReplace.replace.length === 1 && planReplace.replace[0].id === 'a', 'replace targets existing id');
expect(planReplace.create.length === 0, 'replace does not create');

const planRename = NC.applyResolutions(
  existing,
  [{ name: 'main.bel', text: 'new' }],
  fileConflict,
  [{ action: 'rename', newPath: 'main-copy.bel' }],
);
expect(planRename.create.length === 1 && planRename.create[0].name === 'main-copy.bel', 'rename creates new path');

// Library Magic uses the same upload conflict plan for a single incoming sample.
const magicNoConflict = NC.applyResolutions(
  existing,
  [{ name: 'samples/demo.bel', text: 'library code' }],
  [],
  [],
);
expect(magicNoConflict.create.length === 1 && magicNoConflict.create[0].name === 'samples/demo.bel',
  'magic with no conflict creates at target path');

const magicReplace = NC.applyResolutions(
  existing,
  [{ name: 'main.bel', text: 'from library' }],
  NC.detectUploadConflicts(existing, [{ name: 'main.bel', text: 'from library' }]),
  [{ action: 'replace' }],
);
expect(magicReplace.replace[0].text === 'from library', 'magic replace overwrites existing content');

expect(NC.applyResolutions(existing, [], fileConflict, null) === null, 'null resolutions abort');

const moveRename = NC.applyMoveResolutions(
  existing,
  [{ id: 'a', from: 'main.bel', to: 'lib/main.bel', text: 't' }],
  [],
  [],
);
expect(moveRename.renames.length === 1 && moveRename.renames[0].to === 'lib/main.bel', 'move without conflict renames');

console.log('OK name-conflicts');
