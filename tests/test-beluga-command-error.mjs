import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ self: {} });
vm.runInContext(readFileSync(join(root, 'js/beluga/beluga-text.js'), 'utf8'), ctx);
const BT = ctx.BelugaText || ctx.self.BelugaText;
const { parseBelugaCommandError } = BT;

function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

const raw = `- Error in query : - Failed to execute command.
- Failed to execute command.
File "<query>", line 1, column 24
Error: Failed to parse Expected the parser input to end here.
;
`;

const info = parseBelugaCommandError(raw);
expect(info, 'parses query command failure');
expect(info.label === 'Query failed', 'query label');
expect(!/Failed to execute command/.test(info.detail), 'strips wrapper noise');
expect(info.detail.includes('column 24'), 'keeps location');
expect(info.detail.includes('unexpected text here'), 'polishes parse message');

console.log('OK beluga command error parse');
