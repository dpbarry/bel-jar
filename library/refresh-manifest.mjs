#!/usr/bin/env node
// Regenerate library/manifest.json from static library/data + library/catalog.json.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LIB = here;
const DATA = join(LIB, 'data');
const CATALOG_PATH = join(LIB, 'catalog.json');
const MANIFEST_PATH = join(LIB, 'manifest.json');

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

function loadCatalog() {
  if (!existsSync(CATALOG_PATH)) {
    console.error('Missing library/catalog.json');
    process.exit(1);
  }
  return JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
}

function sortTree(node) {
  if (node.type !== 'folder') return;
  node.children.sort((a, b) => {
    const aCfg = a.type === 'file' && a.ext === 'cfg';
    const bCfg = b.type === 'file' && b.ext === 'cfg';
    if (aCfg && !bCfg) return -1;
    if (bCfg && !aCfg) return 1;
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    const la = a.type === 'folder' ? a.name : a.label;
    const lb = b.type === 'folder' ? b.name : b.label;
    return la.localeCompare(lb);
  });
  for (const c of node.children) {
    if (c.type === 'folder') sortTree(c);
  }
}

function countFiles(node) {
  if (node.type === 'file') return 1;
  let n = 0;
  for (const c of node.children) n += countFiles(c);
  return n;
}

function fileNode(relPath, catalog, uniqueItemId) {
  const label = relPath.slice(relPath.lastIndexOf('/') + 1);
  const ext = label.slice(label.lastIndexOf('.') + 1).toLowerCase();
  const meta = catalog.files?.[relPath];
  const node = {
    type: 'file',
    id: uniqueItemId(relPath),
    label,
    path: relPath,
    ext,
  };
  if (meta?.description) node.description = meta.description;
  if (ext === 'cfg' && !node.description) node.description = 'Development load order';
  return node;
}

function scanFolderChildren(absDir, relDir, sectionId, catalog, uniqueItemId) {
  const entries = readdirSync(absDir, { withFileTypes: true });
  const children = [];

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const childRel = relDir ? `${relDir}/${ent.name}` : ent.name;
    const node = {
      type: 'folder',
      id: slug(`${sectionId}-${childRel}`),
      name: ent.name,
      children: scanFolderChildren(join(absDir, ent.name), childRel, sectionId, catalog, uniqueItemId),
    };
    const desc = catalog.folders?.[`${sectionId}/${childRel}`];
    if (desc) node.description = desc;
    children.push(node);
  }

  const files = entries.filter((e) => e.isFile() && /\.(bel|elf|cfg)$/i.test(e.name));
  const cfgs = files.filter((e) => e.name.endsWith('.cfg')).sort((a, b) => a.name.localeCompare(b.name));
  const rest = files.filter((e) => !e.name.endsWith('.cfg')).sort((a, b) => a.name.localeCompare(b.name));

  for (const ent of [...cfgs, ...rest]) {
    const relPath = relDir ? `${relDir}/${ent.name}` : ent.name;
    children.push(fileNode(`${sectionId}/${relPath}`, catalog, uniqueItemId));
  }

  sortTree({ type: 'folder', children });
  return children;
}

function buildSection(section, catalog, uniqueItemId) {
  if (section.staticTree) {
    const tree = structuredClone(section.staticTree);
    sortTree(tree);
    return { id: section.id, label: section.label, tree };
  }
  const dataPath = section.dataPath || section.id;
  const abs = join(DATA, dataPath);
  if (!existsSync(abs)) return null;
  const root = {
    type: 'folder',
    id: `${section.id}-root`,
    name: '',
    children: scanFolderChildren(abs, '', section.id, catalog, uniqueItemId),
  };
  sortTree(root);
  return { id: section.id, label: section.label, tree: root };
}

function loadExistingIds() {
  if (!existsSync(MANIFEST_PATH)) return new Map();
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const byPath = new Map();
  function walk(node) {
    if (!node) return;
    if (node.type === 'file' && node.path) byPath.set(node.path, node.id);
    for (const child of node.children || []) walk(child);
  }
  for (const section of manifest.sections || []) walk(section.tree);
  return byPath;
}

function build() {
  const catalog = loadCatalog();
  const existingIds = loadExistingIds();
  const usedIds = new Set(existingIds.values());
  const uniqueItemId = (pathKey) => {
    if (existingIds.has(pathKey)) return existingIds.get(pathKey);
    let id = slug(pathKey);
    let n = 2;
    while (usedIds.has(id)) {
      id = `${slug(pathKey)}-${n}`;
      n += 1;
    }
    usedIds.add(id);
    existingIds.set(pathKey, id);
    return id;
  };

  const sections = [];
  for (const section of catalog.sections) {
    const built = buildSection(section, catalog, uniqueItemId);
    if (built) sections.push(built);
  }

  const manifest = { version: 2, sections };
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const itemCount = sections.reduce((n, s) => n + countFiles(s.tree), 0);
  console.log(`Library manifest refreshed: ${itemCount} items → ${MANIFEST_PATH}`);
}

build();
