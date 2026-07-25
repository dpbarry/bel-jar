import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runPersistStackInContext } from './persist-stack.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));

function loadOnWindow(files) {
  for (const f of files) {
    const src = readFileSync(join(here, '..', f), 'utf8');
    // eslint-disable-next-line no-new-func
    new Function(src)();
  }
  return globalThis;
}

const win = loadOnWindow(['js/ui/name-conflicts.js', 'js/explorer/explorer.js']);
const EX = win.Explorer;
const IL = win.ExplorerInlineName;
const NC = win.NameConflicts;

expect(EX.resolveCreateParentDir({ kind: 'folder', folderPath: 'lib/pkg' }) === 'lib/pkg',
  'folder target → folder path');
expect(EX.resolveCreateParentDir({ kind: 'file', parentDir: 'lib' }) === 'lib',
  'file target → parent dir');
expect(EX.resolveCreateParentDir({ kind: 'root' }) === '',
  'root target → empty parent');

expect(IL.resolveCreateParentFromRow({
  hasAttribute: (k) => k === 'data-folder-path',
  getAttribute: (k) => (k === 'data-folder-path' ? 'src' : null),
}) === 'src', 'folder row → folder path');
expect(IL.resolveCreateParentFromRow({
  hasAttribute: () => false,
  getAttribute: (k) => (k === 'data-drop-zone' ? 'lib' : null),
}) === 'lib', 'file row → drop zone parent');
expect(IL.resolveCreateParentFromRow({
  hasAttribute: () => false,
  getAttribute: () => null,
}) === '', 'root file row → empty parent');

const FILES = [
  { id: 'a', name: 'main.bel' },
  { id: 'b', name: 'lib/util.bel' },
];
const model = EX.buildExplorerModel(FILES, ['empty', 'lib/newdir']);
const paths = EX.collectFolderPaths(model);
expect(paths.indexOf('empty') !== -1, 'empty folder marker appears in model');
expect(paths.indexOf('lib') !== -1, 'existing folder preserved');
expect(paths.indexOf('lib/newdir') !== -1, 'nested empty folder appears');

const suggested = IL.suggestDefaultFileName('lib', FILES);
expect(suggested === 'lib/untitled.bel', 'default file name in folder');

expect(IL.suggestDefaultFolderName('', FILES, ['empty']) === 'untitled',
  'default folder name at root when free');
expect(IL.suggestDefaultFolderName('', FILES, ['untitled']) === 'untitled-1',
  'default folder name when untitled folder exists');

const fileOk = IL.validateFileCommit('new.bel', '', FILES, null);
expect(fileOk.ok && fileOk.fullPath === 'new.bel', 'valid file commit');

const fileDup = IL.validateFileCommit('main.bel', '', FILES, null);
expect(!fileDup.ok, 'duplicate file rejected');

const fileSelf = IL.validateFileCommit('main.bel', '', FILES, 'a');
expect(fileSelf.ok && fileSelf.fullPath === 'main.bel', 'commit excludes own file on create');

const folderSelf = IL.validateFolderCommit('empty', '', FILES, ['empty'], 'empty');
expect(folderSelf.ok && folderSelf.fullPath === 'empty', 'commit excludes own empty folder on create');

const folderDup = IL.validateFolderCommit('lib', '', FILES, [], null);
expect(!folderDup.ok, 'duplicate folder rejected');

// persist empty-folder APIs
function loadPersist(seed) {
  const store = new Map(Object.entries(seed || {}));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const ctx = vm.createContext({ globalThis: {}, clearTimeout, setTimeout, TextEncoder, localStorage });
  ctx.globalThis = ctx;
  runPersistStackInContext(ctx);
  return ctx.Persist;
}

const P = loadPersist({});
P.ensureProject();
P.addEmptyFolder('scratch');
expect(P.listEmptyFolders().length === 1 && P.listEmptyFolders()[0] === 'scratch',
  'addEmptyFolder stores path');
P.createFile('scratch/note.bel');
expect(P.listEmptyFolders().length === 0, 'createFile under empty folder removes marker');
P.renameFile(P.listFiles().find((f) => f.name === 'scratch/note.bel').id, 'other/note.bel');
expect(P.listEmptyFolders().length === 1 && P.listEmptyFolders()[0] === 'scratch',
  'moving last file out of folder preserves empty folder marker');
P.replaceProject([{ name: 'lib/a.bel', text: '' }], { projectName: 'Move' });
const libId = P.listFiles()[0].id;
P.renameFile(libId, 'pkg/lib/a.bel', true);
P.preserveEmptyFoldersAfterMoves([{ from: 'lib/a.bel', to: 'pkg/lib/a.bel' }]);
expect(P.listEmptyFolders().indexOf('lib') === -1, 'relocating a folder does not leave an empty stub');
P.addEmptyFolder('old');
P.renameEmptyFolderPrefix('old', 'new');
expect(P.listEmptyFolders()[0] === 'new', 'renameEmptyFolderPrefix updates marker');

console.log('OK explorer-create');
