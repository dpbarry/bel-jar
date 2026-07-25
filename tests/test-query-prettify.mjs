import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ self: {} });
vm.runInContext(readFileSync(join(root, 'js/beluga/beluga-text.js'), 'utf8'), ctx);
const BT = ctx.BelugaText || ctx.self.BelugaText;
const { prettifyQueryBindings } = BT;

function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

const harvest = [
  { key: 'P', value: '\\x4. o_s x4' },
  { key: 'X', value: '?Z_4' },
];

const pretty = prettifyQueryBindings(harvest);
expect(pretty.length === 1 && pretty[0].value === 'fn x => o_s x', 'prettify harvest witness');

const concrete = prettifyQueryBindings([
  { key: 'T', value: 'nat' },
  { key: 'D', value: 'o_s (o_s o_z)' },
]);
expect(concrete.length === 2, 'concrete bindings unchanged count');
expect(concrete[1].value === 'o_s (o_s o_z)', 'ground terms pass through');

expect(prettifyQueryBindings([{ key: 'X', value: '?Z_4' }]).length === 0, 'drops internal-only');

console.log('OK query prettify');
