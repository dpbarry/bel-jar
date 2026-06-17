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

const FILES = [
  { id: 'a', name: 'main.bel' },
  { id: 'b', name: 'lib/util.bel' },
  { id: 'c', name: 'pkg/a.bel' },
  { id: 'd', name: 'pkg/b.bel' },
];

const getText = (id) => 'text:' + id;

const fileMove = NC.computeMoveTargets(
  FILES,
  { kind: 'file', fileId: 'a' },
  { kind: 'folder', folderPath: 'lib' },
  getText,
);
expect(fileMove.length === 1 && fileMove[0].to === 'lib/main.bel', 'file into folder');

const noop = NC.computeMoveTargets(
  FILES,
  { kind: 'file', fileId: 'b' },
  { kind: 'folder', folderPath: 'lib' },
  getText,
);
expect(noop.length === 0, 'file already in target folder is noop');

const folderMove = NC.computeMoveTargets(
  FILES,
  { kind: 'folder', folderPath: 'pkg' },
  { kind: 'folder', folderPath: 'lib' },
  getText,
);
expect(folderMove.length === 2, 'folder move produces one entry per file');
expect(folderMove.every((m) => m.to.indexOf('lib/pkg/') === 0), 'folder move nests under target');

expect(!NC.canDropMove(
  { kind: 'folder', folderPath: 'pkg' },
  { kind: 'folder', folderPath: 'pkg' },
  FILES,
), 'cannot drop folder onto itself');

expect(!NC.canDropMove(
  { kind: 'folder', folderPath: 'lib' },
  { kind: 'folder', folderPath: 'lib/util.bel' },
  FILES,
), 'cannot drop folder into itself at same path');

const rootDrop = NC.computeMoveTargets(
  FILES,
  { kind: 'folder', folderPath: 'pkg' },
  { kind: 'root' },
  getText,
);
expect(rootDrop.length === 0, 'folder to root is noop when already at root');

const conflicts = NC.detectMoveConflicts(
  [{ id: 'x', name: 'main.bel' }, { id: 'y', name: 'nested/other.bel' }],
  [{ id: 'y', from: 'nested/other.bel', to: 'main.bel', text: 'z' }],
);
expect(conflicts.length === 1 && conflicts[0].kind === 'file', 'move detects file conflict');
expect(conflicts[0].moveId === 'y', 'move conflict carries source id');

const exSrc = readFileSync(join(here, '..', 'js', 'explorer-tree.js'), 'utf8');
const fake2 = {};
// eslint-disable-next-line no-new-func
new Function('window', exSrc)(fake2);
expect(fake2.BelJarExplorer && fake2.BelJarExplorer.buildExplorerModel, 'explorer module exports model');

const model = fake2.BelJarExplorer.buildExplorerModel([
  { id: '1', name: 'pkg/a.bel' },
  { id: '2', name: 'lib/x.bel' },
  { id: '3', name: 'lib/sub/b.bel' },
]);
const paths = fake2.BelJarExplorer.collectFolderPaths(model);
expect(Array.isArray(paths) && paths.indexOf('pkg') !== -1 && paths.indexOf('lib') !== -1,
  'collectFolderPaths returns array of folder paths');

expect(fake2.BelJarExplorer.rootZoneTopFromLastRow('file', 0, 100, 130) === 100,
  'top-level file: root zone starts at row top');
expect(fake2.BelJarExplorer.rootZoneTopFromLastRow('folder', 0, 100, 130) === 130,
  'top-level folder: root zone starts below row');
expect(fake2.BelJarExplorer.rootZoneTopFromLastRow('file', 2, 200, 230) === 230,
  'nested file: root zone starts below row');

console.log('OK explorer-move');
