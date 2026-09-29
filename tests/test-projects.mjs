// The work model (docs/PERSIST.md §4.2): projects and files on opaque ids, a
// clean slate over any older format, per-project isolation, a page pinned to
// its project, whole-project delete, and caches that follow another tab.
import { makeBrowserStorage, openTab } from './_persist-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const keysOf = (storage) => [...storage.map.keys()].sort();

// ── a fresh browser: one project, one empty main.bel, open and active ───────
{
  const storage = makeBrowserStorage();
  const { P } = openTab(storage);
  const projects = P.listProjects();
  expect(projects.length === 1 && projects[0].name === 'Untitled Project', 'a fresh browser has one untitled project');
  expect(/^p_[0-9a-hjkmnp-tv-z]{26}$/.test(projects[0].id), `project ids are 128-bit, time-ordered and opaque (${projects[0].id})`);
  const files = P.listFiles();
  expect(files.length === 1 && files[0].name === 'main.bel', 'with one main.bel');
  expect(/^f_[0-9a-hjkmnp-tv-z]{26}$/.test(files[0].id), `file ids too (${files[0].id})`);
  const made = [P.createFile('a.bel'), P.createFile('b.bel'), P.createFile('c.bel')];
  expect(made.slice().sort().join() === made.join(), 'ids made one after another sort in the order they were made');
  expect(P.getActiveFileId() === files[0].id && P.getOpenFileIds().join() === files[0].id, 'open and active');
  expect(P.getFileText(files[0].id) === '', 'and empty');
}

// ── any older format is wiped, not migrated ─────────────────────────────────
{
  const storage = makeBrowserStorage({
    'beljar/schema': '3',
    'beljar-editor-split': '0.3',
    'beljar-fold-local-v1': '{}',
    'beljar/device': JSON.stringify({ at: 1, data: { activeProject: 'p_old' } }),
    'beljar-project-files': JSON.stringify([{ id: 'workspace://main.bel', name: 'main.bel' }]),
    'beljar-state-v2': JSON.stringify({ v: 2, editor: { text: 'OLD' } }),
    'beljar-proj:p-x:files': '[]',
    'beljar/projects': JSON.stringify({ at: 1, data: [{ id: 'p_old', name: 'Old' }] }),
    'unrelated-site-key': 'kept',
  });
  const { P } = openTab(storage);
  expect(P.listProjects().length === 1 && P.listProjects()[0].name === 'Untitled Project', 'an older schema starts clean');
  expect(!keysOf(storage).some((k) => /^beljar[-:]/.test(k)), `no old-format key survives (${keysOf(storage).join(', ')})`);
  expect(!storage.map.has('beljar/projects') && !P.listProjects().some((p) => p.id === 'p_old'),
    'the previous format (schema 3, one shared project list) is gone too');
  expect(storage.getItem('unrelated-site-key') === 'kept', 'keys that are not BelJar\'s are left alone');
}

// ── two paths never meet in storage; a rename never moves text ──────────────
{
  const storage = makeBrowserStorage();
  const { P } = openTab(storage);
  const a = P.createFile('proofs/nat.bel');
  const b = P.createFile('proofs_nat.bel');
  const c = P.createFile('proofs nat.bel');
  P.setFileText(a, 'A');
  P.setFileText(b, 'B');
  P.setFileText(c, 'C');
  expect(P.getFileText(a) === 'A' && P.getFileText(b) === 'B' && P.getFileText(c) === 'C',
    'files whose paths slug alike keep their own text (the old storage-key collision)');
  const fileKeys = keysOf(storage).filter((k) => k.includes('/f/'));
  expect(fileKeys.every((k) => /\/f\/f_[0-9a-hjkmnp-tv-z]{26}$/.test(k)), `no path appears in a key (${fileKeys.join(', ')})`);
  const before = keysOf(storage).join();
  P.renameFile(a, 'lemmas/nat.bel');
  expect(P.getFileText(a) === 'A' && P.getFileById(a).name === 'lemmas/nat.bel', 'a rename keeps id and text');
  expect(keysOf(storage).join() === before, 'and moves no record');
  const fresh = openTab(storage).P;
  expect(fresh.getFileText(a) === 'A' && fresh.getFileText(b) === 'B', 'all of it survives a reload');
}

// ── projects are isolated; creating one does not switch to it ───────────────
{
  const storage = makeBrowserStorage();
  const { P } = openTab(storage);
  const home = P.getActiveProjectId();
  const main = P.listFiles()[0].id;
  P.setFileText(main, 'HOME BODY');
  const pid = P.createProject('Second');
  expect(pid !== home && P.listProjects().length === 2, 'a second project with its own id');
  expect(P.getActiveProjectId() === home, 'createProject does not switch this page');
  expect(P.listFiles().length === 1 && P.getFileText(main) === 'HOME BODY', 'this project is untouched');

  P.setActiveProjectId(pid);
  const second = P.listFiles();
  expect(second.length === 1 && second[0].name === 'main.bel' && second[0].id !== main, 'the new project has its own main.bel');
  expect(P.getFileText(second[0].id) === '', 'blank');
  P.setFileText(second[0].id, 'SECOND BODY');
  P.setActiveProjectId(home);
  expect(P.getFileText(main) === 'HOME BODY', 'switching back finds this project\'s text');
  expect(openTab(storage).P.getActiveProjectId() === home, 'the next load opens the project last made active');
}

// ── ⛔ a page is pinned to its project: another tab switching cannot redirect it ──
{
  const storage = makeBrowserStorage();
  const tabA = openTab(storage).P;
  const home = tabA.getActiveProjectId();
  const homeMain = tabA.listFiles()[0].id;
  const tabB = openTab(storage).P;
  const other = tabB.newBlankProject('Elsewhere');
  expect(tabB.getActiveProjectId() === other, 'tab B switched to its new project');
  expect(tabA.getActiveProjectId() === home, 'tab A is still on its own project');
  expect(tabA.listFiles().map((f) => f.id).join() === homeMain, 'and still sees its own files');
  const doc = tabA.createPersist({ documentId: homeMain, debounceMs: 1 });
  doc.scheduleEditorPersist('WRITTEN IN A');
  doc.flushCheckpoint();
  const again = openTab(storage).P;
  again.setActiveProjectId(home);
  expect(again.getFileText(homeMain) === 'WRITTEN IN A', 'tab A\'s save landed in tab A\'s project');
  again.setActiveProjectId(other);
  expect(again.listFiles().every((f) => again.getFileText(f.id) === ''), 'and not in the project tab B opened');
}

// ── another tab's write reaches this tab's caches ───────────────────────────
{
  const storage = makeBrowserStorage();
  const tabA = openTab(storage).P;
  const tabB = openTab(storage).P;
  const id = tabA.listFiles()[0].id;
  expect(tabA.getFileText(id) === '' && tabA.listFiles().length === 1, 'tab A has read (and cached) the file and the tree');
  tabB.setFileText(id, 'FROM B');
  const made = tabB.createFile('from-b.bel');
  expect(tabA.getFileText(id) === 'FROM B', 'tab A reads tab B\'s text, not its cached copy');
  expect(tabA.getFileById(made) && tabA.listFiles().length === 2, 'and tab B\'s new file');
}

// ── newBlankProject / createProjectWithFiles ────────────────────────────────
{
  const storage = makeBrowserStorage();
  const { P } = openTab(storage);
  const home = P.getActiveProjectId();
  const homeMain = P.listFiles()[0].id;
  P.setFileText(homeMain, 'ORIGINAL');
  const pid = P.newBlankProject('Blank');
  expect(P.getActiveProjectId() === pid && P.getProjectName() === 'Blank' && P.listFiles().length === 1,
    'newBlankProject makes a named one-file project and switches to it');

  const res = P.createProjectWithFiles('Imported', [
    { name: 'lam.bel', text: 'LF term : type;' },
    { name: 'sub/eq.bel', text: 'rec f : x = ?;' },
  ], { projectName: 'Imported' });
  expect(P.getActiveProjectId() === res.projectId, 'the imported project is active');
  expect(P.listFiles().map((f) => f.name).join() === 'lam.bel,sub/eq.bel', 'with exactly the imported files, in order');
  expect(res.activeId === P.listFiles()[0].id && P.getOpenFileIds().join() === res.activeId, 'the first open and active');
  expect(P.getFileText(res.activeId) === 'LF term : type;', 'with their text');
  P.setActiveProjectId(home);
  expect(P.getFileText(homeMain) === 'ORIGINAL', 'the original project is untouched');
}

// ── replaceProject leaves no orphaned records ───────────────────────────────
{
  const storage = makeBrowserStorage();
  const { P } = openTab(storage);
  const old = P.createFile('old.bel');
  P.setFileText(old, 'old');
  P.replaceProject([{ name: 'new.bel', text: 'new' }]);
  const records = keysOf(storage).filter((k) => /\/(f|cache)\//.test(k));
  const live = P.listFiles().map((f) => f.id);
  expect(records.length === 1 && records[0].endsWith('/f/' + live[0]), `only the new file has records (${records.join(', ')})`);
}

// ── deleteProject removes every record under it; refuses the last ───────────
{
  const storage = makeBrowserStorage();
  const { P } = openTab(storage);
  const home = P.getActiveProjectId();
  const pid = P.newBlankProject('Doomed');
  P.setFileText(P.listFiles()[0].id, 'doomed body');
  expect(keysOf(storage).some((k) => k.startsWith('beljar/p/' + pid + '/')), 'the doomed project has records');
  const next = P.deleteProject(pid);
  expect(next === home, 'delete returns the project to fall back to');
  expect(P.listProjects().map((p) => p.id).join() === home, 'the registry forgets it');
  expect(!keysOf(storage).some((k) => k.startsWith('beljar/p/' + pid + '/')), 'and every record under it is gone');
  expect(P.getActiveProjectId() === home && openTab(storage).P.getActiveProjectId() === home,
    'deleting the active project falls back, now and on the next load');
  expect(P.deleteProject(home) === null && P.listProjects().length === 1, 'the last project cannot be deleted');
}

// ── ⛔ no record is shared by every project ─────────────────────────────────
{
  const storage = makeBrowserStorage();
  const A = openTab(storage).P;
  const B = openTab(storage).P;
  const a = A.createProject('From A');
  const b = B.createProject('From B');
  const names = openTab(storage).P.listProjects().map((p) => p.name).sort().join();
  expect(names === 'From A,From B', `two tabs creating projects at once keep both (${names})`);
  expect([...storage.map.keys()].some((k) => k === 'beljar/p/' + a + '/meta')
    && [...storage.map.keys()].some((k) => k === 'beljar/p/' + b + '/meta')
    && !storage.map.has('beljar/projects'), 'each project is its own meta record; there is no shared list');
  const meta = JSON.parse(storage.getItem('beljar/p/' + a + '/meta')).data;
  expect(meta.owner === null && meta.name === 'From A' && typeof meta.createdAt === 'number',
    'a new project belongs to this device (owner null) until an account claims it');
  expect(A.listProjects().find((p) => p.id === a).owner === null, 'and the owner is on the listed project');
}

// ── a project the disk refuses is not half-made ─────────────────────────────
// Room for the new tree record but not the session after it: the partial
// create the cleanup exists for (sized from a real tree record, not guessed).
{
  const scratch = makeBrowserStorage();
  const sp = openTab(scratch).P.createProject('Too big');
  const treeKey = 'beljar/p/' + sp + '/tree';
  const treeSize = treeKey.length + scratch.getItem(treeKey).length;

  const storage = makeBrowserStorage();
  const { P } = openTab(storage);
  const before = P.listProjects().length;
  const keysBefore = [...storage.map.keys()].sort().join();
  storage.maxChars = [...storage.map].reduce((a, [k, v]) => a + k.length + v.length, 0) + treeSize + 20;
  expect(P.createProject('Too big') === null, 'a create the disk refuses part-way answers null');
  storage.maxChars = null;
  expect(P.listProjects().length === before, 'nothing is listed');
  expect([...storage.map.keys()].sort().join() === keysBefore, 'and no record of it is left behind');
}

// ── renameProject ───────────────────────────────────────────────────────────
{
  const { P } = openTab(makeBrowserStorage());
  const pid = P.createProject('Old Name');
  expect(P.renameProject(pid, 'New Name') === true, 'rename succeeds');
  expect(P.listProjects().find((p) => p.id === pid).name === 'New Name', 'the registry has the new name');
  expect(P.renameProject(pid, '   ') === true && P.listProjects().find((p) => p.id === pid).name === 'Untitled Project',
    'a blank name falls back to Untitled Project');
  expect(P.renameProject('p_nope', 'x') === false, 'an unknown id fails');
}

// ── a project can be emptied, and filled again ──────────────────────────────
{
  const { P } = openTab(makeBrowserStorage());
  P.deleteFile(P.listFiles()[0].id);
  expect(P.listFiles().length === 0 && P.getActiveFileId() === null && P.getOpenFileIds().length === 0,
    'all files can be deleted: no active file, no tabs');
  expect(P.listFiles().length === 0, 'and nothing re-seeds main.bel');
  const id = P.createFile('fresh.bel');
  expect(P.listFiles().map((f) => f.name).join() === 'fresh.bel' && P.getFileText(id) === '', 'createFile works on an empty project');
}

// ── deleting a file drops its text, view and cache; restore brings it back ──
{
  const storage = makeBrowserStorage();
  const { P } = openTab(storage);
  const id = P.createFile('gone.bel');
  const doc = P.createPersist({ documentId: id, debounceMs: 1 });
  let editorText = 'LF gone : type;';
  doc.setCheckpointProviders({
    getText: () => editorText,
    getViewport: () => ({ selection: { anchor: 3, head: 3 } }),
    getSemantic: () => ({ types: { v: 1, decls: [{ name: 'gone' }], metavars: [], reconstructed: [] } }),
  });
  doc.flushCheckpoint();
  expect(keysOf(storage).some((k) => k.endsWith('/cache/' + id)), 'the file has a semantic cache');
  P.deleteFile(id);
  expect(!keysOf(storage).some((k) => k.endsWith('/' + id)), 'deleting it drops its text and cache');
  const session = JSON.parse(storage.getItem('beljar/p/' + P.getActiveProjectId() + '/session')).data;
  expect(!(id in session.views), 'and its view');
  editorText = 'LF zombie : type;'; // the editor, still open on it, keeps typing
  doc.flushCheckpoint();
  expect(!keysOf(storage).some((k) => k.endsWith('/' + id)), '⛔ a save after the delete does not resurrect it');
  expect(P.restoreDeletedFile(id, 'gone.bel', 'LF back : type;') === true, 'restore puts it back');
  expect(P.getFileById(id).name === 'gone.bel' && P.getFileText(id) === 'LF back : type;', 'same id, restored text');
  expect(P.restoreDeletedFile(id, 'gone.bel', 'x') === false, 'restoring a file that exists is refused');
}

// ── folder delete must not leave dangling empty-folder markers ──────────────
{
  const { P } = openTab(makeBrowserStorage());
  const f1 = P.createFile('church-rosser/a.bel');
  const f2 = P.createFile('church-rosser/b.bel');
  P.deleteFile(f1);
  P.deleteFile(f2);
  expect(P.listEmptyFolders().indexOf('church-rosser') !== -1, 'deleting the files leaves the folder as an empty-folder marker');
  P.pruneEmptyFoldersUnder('church-rosser');
  expect(P.listEmptyFolders().indexOf('church-rosser') === -1, 'pruneEmptyFoldersUnder removes the marker');
}

// ── a returned list is a copy ───────────────────────────────────────────────
{
  const { P } = openTab(makeBrowserStorage());
  const files = P.listFiles();
  files[0].name = 'mutated.bel';
  files.push({ id: 'f_fake0000', name: 'fake.bel' });
  expect(P.listFiles().length === 1 && P.listFiles()[0].name === 'main.bel', 'mutating a returned list changes nothing');
}

console.log(`OK projects (${n} checks: opaque ids, clean slate, no collision, isolation, pinned page, cross-tab caches, import, delete, restore, folders)`);
