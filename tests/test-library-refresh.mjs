import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const lib = join(root, 'library');

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const r = spawnSync(process.execPath, [join(lib, 'refresh-manifest.mjs')], { encoding: 'utf8' });
expect(r.status === 0, 'refresh-manifest exits 0');
expect(/Library manifest refreshed:/.test(r.stdout || ''), 'refresh prints summary');

const manifest = JSON.parse(readFileSync(join(lib, 'manifest.json'), 'utf8'));
expect(manifest.version === 2, 'manifest version 2');
expect(manifest.sections.length >= 3, 'builtins + examples + case-studies');

function findFile(node, path) {
  if (!node) return null;
  if (node.type === 'file' && node.path === path) return node;
  for (const child of node.children || []) {
    const hit = findFile(child, path);
    if (hit) return hit;
  }
  return null;
}

const cpCfg = findFile(manifest.sections.find((s) => s.id === 'case-studies')?.tree,
  'case-studies/classical-processes/cp.cfg');
expect(cpCfg && cpCfg.ext === 'cfg', 'classical-processes cp.cfg in manifest');

const cfgPath = join(lib, 'data', 'case-studies', 'classical-processes', 'cp.cfg');
const order = readFileSync(cfgPath, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('%'));
expect(order[0] === 'cp_base.bel' && order.includes('cp_linear.bel'), 'classical-processes load order');

let itemCount = 0;
function count(node) {
  if (node.type === 'file') itemCount += 1;
  else for (const c of node.children || []) count(c);
}
for (const s of manifest.sections) count(s.tree);
expect(itemCount >= 280, 'catalog item count');

console.log('OK library refresh');
