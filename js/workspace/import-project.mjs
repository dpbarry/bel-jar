/**
 * A folder of Beluga sources, as a project: what "Import folder as new
 * project" does, for both pages (the editor's Project menu, and home).
 *
 * Pure up to the last step: files in, ordered project entries out, with which
 * suite file each directory runs by. `create` is the one call that writes.
 */
import { ProjectSource } from './project-source.mjs';

const g = typeof window !== 'undefined' ? window : globalThis;

/** A picked file's path in the project. `stripRoot`: without the folder that was picked. */
export function relPathFromPickerFile(file, opts) {
  const rel = file.webkitRelativePath || file.name;
  const parts = rel.split('/');
  if (opts && opts.stripRoot && parts.length > 1) return parts.slice(1).join('/');
  return rel;
}

/** Signature files in the order their suite files give, then the suite files. */
export function projectEntriesFromRawEntries(rawEntries) {
  const belEntries = [];
  const elfEntries = [];
  const cfgEntries = [];
  for (const entry of rawEntries) {
    if (ProjectSource.isCfgPath(entry.name)) cfgEntries.push(entry);
    else if (ProjectSource.isElfPath(entry.name)) elfEntries.push(entry);
    else if (ProjectSource.isBelPath(entry.name)) belEntries.push(entry);
  }
  const belPaths = belEntries.map((e) => e.name);
  const sigPaths = belPaths.concat(elfEntries.map((e) => e.name));
  const cfgByDir = {};
  for (const entry of cfgEntries) {
    const dir = ProjectSource.dirOf(entry.name);
    const base = entry.name.slice(entry.name.lastIndexOf('/') + 1);
    if (!cfgByDir[dir]) cfgByDir[dir] = {};
    cfgByDir[dir][base] = entry.text;
  }
  const byPath = new Map([...belEntries, ...elfEntries, ...cfgEntries].map((e) => [e.name, e]));
  const orderedSig = typeof ProjectSource.orderSignaturePaths === 'function'
    ? ProjectSource.orderSignaturePaths(sigPaths, cfgByDir)
    : sigPaths.slice().sort();
  const projectEntries = orderedSig.map((p) => byPath.get(p)).filter(Boolean);
  for (const cfg of cfgEntries) projectEntries.push(cfg);
  return { projectEntries, belCount: belPaths.length, sigCount: sigPaths.length };
}

export async function projectEntriesFromPickerFiles(all, opts) {
  const rawEntries = [];
  for (const file of all) {
    if (!ProjectSource.isProjectSourcePath(file.name)) continue;
    rawEntries.push({ name: relPathFromPickerFile(file, opts), text: await file.text() });
  }
  return projectEntriesFromRawEntries(rawEntries);
}

/** Which suite file each directory runs by, as the editor would infer it once the files are in. */
export function activeCfgByDirFor(projectEntries) {
  if (typeof ProjectSource.inferActiveCfgByDir !== 'function') return null;
  const tmpFiles = projectEntries.map((e, i) => ({ id: 'tmp-' + i, name: e.name }));
  const tmpText = (id) => (projectEntries[Number(id.slice(4))] || {}).text || '';
  return ProjectSource.inferActiveCfgByDir(tmpFiles, tmpText);
}

/**
 * The files of a picked folder, as a project named after it: { name, entries,
 * activeCfgByDir, firstBel }, or null when it holds no signature file.
 */
export async function folderAsProject(all) {
  const { projectEntries, belCount } = await projectEntriesFromPickerFiles(all, { stripRoot: true });
  if (!belCount) return null;
  const first = all[0];
  const name = first && first.webkitRelativePath ? first.webkitRelativePath.split('/')[0] : 'Imported';
  const bel = projectEntries.filter((e) => ProjectSource.isBelPath(e.name));
  return {
    name,
    entries: projectEntries,
    activeCfgByDir: activeCfgByDirFor(projectEntries),
    firstBel: bel.length ? bel[0].name : null,
  };
}

/**
 * Make the project. ⛔ This settles the page on the new project (the files go
 * in through the page's own project): the caller leaves for its address.
 * Returns its id, or null when storage refused it.
 */
export function createImportedProject(plan) {
  const P = g.Persist;
  const made = P.createProjectWithFiles(plan.name, plan.entries, {
    projectName: plan.name,
    activeCfgByDir: plan.activeCfgByDir || undefined,
  });
  if (!made || !made.projectId) return null;
  const open = plan.activePath || plan.firstBel;
  if (open) {
    const created = P.listFiles().find((f) => f.name === open);
    if (created) P.setActiveFileId(created.id);
  }
  return made.projectId;
}

export const ImportProject = {
  relPathFromPickerFile,
  projectEntriesFromRawEntries,
  projectEntriesFromPickerFiles,
  activeCfgByDirFor,
  folderAsProject,
  createImportedProject,
};

g.ImportProject = ImportProject;
