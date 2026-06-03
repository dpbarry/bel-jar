import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { readFileSync } from 'fs';

const SRC = readFileSync('all.bel', 'utf8');
const doc = Text.of(SRC.split('\n'));
const tree = parser.parse(SRC);
const line42 = SRC.split('\n')[41];
const pos = SRC.indexOf(line42) + line42.indexOf(' K') + 1;
let n = tree.resolveInner(pos, 1);
const path = [];
while (n) {
  path.push(`${n.name}[${n.from}-${n.to}] "${SRC.slice(n.from, n.to).replace(/\n/g,'\\n')}"`);
  n = n.parent;
}
console.log('line', line42);
console.log('pos', pos);
console.log(path.join('\n  '));
