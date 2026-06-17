// Phase 4 / C1: the explorer lists a folder's active-suite members in LOAD order
// (the order governs cross-file visibility), right after the .cfg files, with
// non-members alphabetical below. buildExplorerModel is pure (no DOM), so the
// ordering is unit-testable. Loads explorer-tree.js against a fake window, same
// pattern as test-project-source.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'explorer-tree.js'), 'utf8');
const win = {};
// eslint-disable-next-line no-new-func
new Function('window', src)(win);
const EX = win.BelJarExplorer;
expect(EX && typeof EX.buildExplorerModel === 'function', 'BelJarExplorer.buildExplorerModel exported');

const files = [
  { id: 'cfg', name: 'grp/sources.cfg' },
  { id: 'a', name: 'grp/base.bel' },
  { id: 'b', name: 'grp/use.bel' },
  { id: 'z', name: 'grp/zzz.bel' },   // not a member
  { id: 'p', name: 'grp/prelude.elf' }, // .elf member, listed first
];
// Active suite lists: prelude.elf, then use.bel, then base.bel (NOT alphabetical).
const order = (dir) => (dir === 'grp'
  ? ['grp/prelude.elf', 'grp/use.bel', 'grp/base.bel']
  : null);

// With suite order: cfg first, then members in load order, then non-members.
{
  const model = EX.buildExplorerModel(files, [], order);
  const grp = model.folders.get('grp');
  const names = grp.files.map((f) => f.name);
  expect(names.join('|') === 'grp/sources.cfg|grp/prelude.elf|grp/use.bel|grp/base.bel|grp/zzz.bel',
    `members in load order after cfg, non-member last; got: ${names.join('|')}`);
}

// Without a suite order resolver: plain alphabetical buckets (cfg, bel, other).
{
  const model = EX.buildExplorerModel(files, [], null);
  const grp = model.folders.get('grp');
  const names = grp.files.map((f) => f.name);
  expect(names.join('|') === 'grp/sources.cfg|grp/base.bel|grp/use.bel|grp/zzz.bel|grp/prelude.elf',
    `no suite → alphabetical buckets, got: ${names.join('|')}`);
}

console.log('OK explorer suite order (members in cfg load order, alphabetical fallback)');
