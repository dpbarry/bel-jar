import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const manifestPath = join(root, 'library', 'manifest.json');
const dataRoot = join(root, 'library', 'data');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
expect(manifest.version === 2, 'manifest version is 2');
expect(Array.isArray(manifest.sections) && manifest.sections.length >= 2, 'manifest has sections');

const ids = new Set();
let itemCount = 0;

function walkTree(node) {
  if (!node) return;
  if (node.type === 'file') {
    itemCount += 1;
    expect(node.id && node.label && node.path && node.ext, 'file has required fields');
    expect(!ids.has(node.id), 'duplicate item id: ' + node.id);
    ids.add(node.id);
    expect(['bel', 'elf', 'cfg'].includes(node.ext), 'item ext is bel, elf, or cfg: ' + node.path);
    const filePath = join(dataRoot, node.path);
    expect(existsSync(filePath), 'data file exists: ' + node.path);
    return;
  }
  expect(node.type === 'folder', 'node is folder or file');
  expect(Array.isArray(node.children), 'folder has children');
  for (const child of node.children) walkTree(child);
}

for (const section of manifest.sections) {
  expect(section.id && section.label, 'section has id and label');
  expect(section.tree, 'section has tree root');
  walkTree(section.tree);
}

expect(itemCount >= 200, 'catalog has substantial item count, got ' + itemCount);

const builtins = manifest.sections.find((s) => s.id === 'builtins');
expect(builtins, 'builtins section present');

function findFile(node, label) {
  if (!node) return null;
  if (node.type === 'file' && node.label === label) return node;
  if (node.type !== 'folder') return null;
  for (const child of node.children) {
    const hit = findFile(child, label);
    if (hit) return hit;
  }
  return null;
}

expect(findFile(builtins.tree, 'nd-propositional.bel'), 'nd-propositional built-in present');
expect(findFile(builtins.tree, 'nd-first-order.bel'), 'nd-first-order built-in present');

const examples = manifest.sections.find((s) => s.id === 'examples');
expect(examples, 'examples section present');

function findFolder(node, name) {
  if (!node || node.type !== 'folder') return null;
  for (const child of node.children) {
    if (child.type === 'folder' && child.name === name) return child;
    if (child.type === 'folder') {
      const hit = findFolder(child, name);
      if (hit) return hit;
    }
  }
  return null;
}

const compile = examples.tree.children.find((c) => c.type === 'folder' && c.name === 'compile');
expect(compile, 'examples/compile top folder');
const cpm = compile && findFolder(compile, 'cpm');
expect(cpm, 'examples/compile/cpm nested folder');
expect(
  cpm && cpm.children.some((c) => c.type === 'file' && c.path === 'examples/compile/cpm/ceval.elf'),
  'nested file stays under compile/cpm',
);

console.log('OK library manifest (' + itemCount + ' items)');
