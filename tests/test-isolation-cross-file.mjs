import { activeCfgResolver } from '../editor-src/development.mjs';
import { findGroupSignature } from '../editor-src/project-prelude.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const grpOpts = { activeCfgForDir: activeCfgResolver({ grp: 'grp/order.cfg' }) };

const orphanDir = [
  { id: 'cfg', name: 'grp/order.cfg', text: 'base.bel\nuse.bel' },
  { id: 'a', name: 'grp/base.bel', text: 'LF o : type;\nLF tp : type;' },
  { id: 'z', name: 'grp/use.bel', text: 'LF nd : tp → type;' },
  { id: 'x', name: 'grp/extra.bel', text: 'LF local : o → type;' },
];
const text = (id) => orphanDir.find((f) => f.id === id).text;

expect(findGroupSignature(orphanDir, 'x', 'tp', text, grpOpts) === null,
  'unlisted file must not see module peer tp signature');
expect(findGroupSignature(orphanDir, 'x', 'o', text, grpOpts) === null,
  'unlisted file must not see module peer o signature');
expect(findGroupSignature(orphanDir, 'z', 'o', text, grpOpts)?.type?.includes('type'),
  'module member still sees prelude signatures');

const root = [
  { id: 'mod', name: 'bisimulation/picalc.bel', text: 'LF tp : type;\nLF nd : tp → type;' },
  { id: 'iso', name: 'untitled.bel', text: 'LF o : type;\nLF nd : o → type;' },
];
const rootText = (id) => root.find((f) => f.id === id).text;

expect(findGroupSignature(root, 'iso', 'tp', rootText) === null,
  'standalone root must not see other folder tp');
expect(findGroupSignature(root, 'iso', 'nd', rootText) === null,
  'standalone root must not see other folder nd signature');

console.log('OK cross-file isolation (active module, standalone)');
