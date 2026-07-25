// Projects layer: files live in folders live in a project, every project saved
// in main storage, only the active one is hot. Verifies migration (existing
// flat-keyed data → default project), siloing (a new project's files/state are
// isolated), active-project switching, and delete. vm-loaded with a fake
// localStorage like test-multifile-switch / test-project-source.
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runPersistStackInContext } from './persist-stack.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));

// A fresh persist instance over a given localStorage seed.
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
  return { P: ctx.Persist, store };
}

// ── migration: existing flat-keyed data becomes the default project ──────────
{
  const { P, store } = loadPersist({
    'beljar-project-files': JSON.stringify([{ id: 'workspace://main.bel', name: 'main.bel' }]),
    'beljar-project-name': 'My Old Work',
    'beljar-state-v2': JSON.stringify({ v: 2, meta: { documentId: 'workspace://main.bel' }, editor: { text: 'LF a : type;', local: {} }, semantic: null }),
  });
  const projects = P.listProjects();
  expect(projects.length === 1, 'migration creates exactly one project');
  expect(projects[0].id === P.DEFAULT_PROJECT_ID, 'it is the default project');
  expect(P.getProjectName() === 'My Old Work', 'default project inherits the legacy name');
  expect(P.getActiveProjectId() === P.DEFAULT_PROJECT_ID, 'default project is active');
  expect(P.listFiles().length === 1 && P.listFiles()[0].name === 'main.bel', 'legacy files preserved');
  expect(P.getFileText('workspace://main.bel') === 'LF a : type;', 'legacy file text preserved');
  // Default project keeps writing the historical flat key (no new namespaced key).
  expect(store.has('beljar-project-files'), 'default project still uses the flat files key');
}

// ── createProject silos a new container; default untouched ───────────────────
{
  const { P, store } = loadPersist({});
  P.ensureProject(); // seed default with a main.bel
  P.setFileText('workspace://main.bel', 'DEFAULT PROJECT BODY');
  const defaultFiles = P.listFiles().map((f) => f.name);

  const pid = P.createProject('Second');
  expect(pid !== P.DEFAULT_PROJECT_ID, 'new project gets its own id');
  expect(P.listProjects().length === 2, 'two projects now');
  // createProject must NOT change the active project.
  expect(P.getActiveProjectId() === P.DEFAULT_PROJECT_ID, 'createProject does not switch active');
  expect(JSON.stringify(P.listFiles().map((f) => f.name)) === JSON.stringify(defaultFiles),
    'default project files unchanged after creating another');

  // The new silo lives under namespaced keys, separate from the flat ones.
  const namespaced = [...store.keys()].filter((k) => k.startsWith('beljar-proj:'));
  expect(namespaced.length > 0, 'new project writes namespaced keys');

  // Switch active → see the new project's seeded file, isolated text.
  P.setActiveProjectId(pid);
  expect(P.listFiles().length === 1 && P.listFiles()[0].name === 'main.bel', 'new project seeded with main.bel');
  expect(P.getFileText('workspace://main.bel') === '', 'new project main.bel is blank (isolated state)');
  P.setFileText('workspace://main.bel', 'SECOND PROJECT BODY');

  // Back to default → its body is intact, not the second project's.
  P.setActiveProjectId(P.DEFAULT_PROJECT_ID);
  expect(P.getFileText('workspace://main.bel') === 'DEFAULT PROJECT BODY',
    'per-project file state is fully isolated');
}

// ── newBlankProject activates + reload-ready ─────────────────────────────────
{
  const { P } = loadPersist({});
  P.ensureProject();
  const pid = P.newBlankProject('Blank');
  expect(P.getActiveProjectId() === pid, 'newBlankProject makes the new project active');
  expect(P.listFiles().length === 1, 'blank project has one file');
  expect(P.getProjectName() === 'Blank', 'blank project carries its name');
}

// ── createProjectWithFiles imports into a fresh silo ─────────────────────────
{
  const { P } = loadPersist({});
  P.ensureProject();
  P.setFileText('workspace://main.bel', 'ORIGINAL');
  const entries = [
    { name: 'lam.bel', text: 'LF term : type;' },
    { name: 'sub/eq.bel', text: 'rec f : x = ?;' },
  ];
  const res = P.createProjectWithFiles('Imported', entries, { projectName: 'Imported' });
  expect(P.getActiveProjectId() === res.projectId, 'imported project becomes active');
  expect(P.listFiles().length === 2, 'imported files present (seeded main.bel replaced)');
  const names = P.listFiles().map((f) => f.name).sort();
  expect(JSON.stringify(names) === JSON.stringify(['lam.bel', 'sub/eq.bel']), 'exactly the imported files');
  // Original project still intact.
  P.setActiveProjectId(P.DEFAULT_PROJECT_ID);
  expect(P.getFileText('workspace://main.bel') === 'ORIGINAL', 'original project untouched by import');
}

// ── deleteProject removes its keys; refuses the last ─────────────────────────
{
  const { P, store } = loadPersist({});
  P.ensureProject();
  const pid = P.createProject('Doomed');
  P.setActiveProjectId(pid);
  P.setFileText('workspace://main.bel', 'doomed body');
  const before = [...store.keys()].filter((k) => k.startsWith('beljar-proj:')).length;
  expect(before > 0, 'doomed project has namespaced keys');

  P.setActiveProjectId(P.DEFAULT_PROJECT_ID);
  const next = P.deleteProject(pid);
  expect(next === P.DEFAULT_PROJECT_ID, 'delete returns the fallback project id');
  expect(P.listProjects().length === 1, 'project removed from registry');
  const after = [...store.keys()].filter((k) => k.startsWith('beljar-proj:' + pid.replace(/[^a-zA-Z0-9._-]/g, '_'))).length;
  expect(after === 0, 'all of the deleted project\'s keys are gone');

  expect(P.deleteProject(P.DEFAULT_PROJECT_ID) === null, 'refuses to delete the last project');
  expect(P.listProjects().length === 1, 'last project survives');
}

// ── renameProject ────────────────────────────────────────────────────────────
{
  const { P } = loadPersist({});
  P.ensureProject();
  const pid = P.createProject('Old Name');
  expect(P.renameProject(pid, 'New Name') === true, 'rename succeeds');
  const found = P.listProjects().find((p) => p.id === pid);
  expect(found && found.name === 'New Name', 'registry reflects the new name');
  expect(P.renameProject('nope', 'x') === false, 'rename of unknown id fails');
}

// ── empty project registry ────────────────────────────────────────────────────
{
  const { P } = loadPersist({});
  P.ensureProject();
  P.deleteFile('workspace://main.bel');
  expect(P.listFiles().length === 0, 'all files can be deleted');
  expect(P.getActiveFileId() === null, 'no active file when empty');
  expect(P.getOpenFileIds().length === 0, 'no open tabs when empty');
  expect(P.listFiles().length === 0, 'listFiles does not re-seed main.bel');
  const id = P.createFile('fresh.bel');
  expect(P.listFiles().length === 1 && P.listFiles()[0].name === 'fresh.bel',
    'createFile works on an empty project');
  expect(P.getFileText(id) === '', 'new file starts blank');
}

// ── folder delete must not leave dangling empty-folder markers ────────────────
{
  const { P } = loadPersist({});
  P.ensureProject();
  const f1 = P.createFile('church-rosser/a.bel');
  const f2 = P.createFile('church-rosser/b.bel');
  P.setFileText(f1, 'x');
  P.setFileText(f2, 'y');
  P.deleteFile(f1);
  P.deleteFile(f2);
  expect(P.listEmptyFolders().indexOf('church-rosser') !== -1,
    'deleting files leaves parent as empty-folder marker');
  P.pruneEmptyFoldersUnder('church-rosser');
  expect(P.listEmptyFolders().indexOf('church-rosser') === -1,
    'pruneEmptyFoldersUnder removes the folder marker');
}

console.log('OK projects (migration, siloing isolation, active switch, blank/import create, delete, rename, empty registry, folder prune)');
