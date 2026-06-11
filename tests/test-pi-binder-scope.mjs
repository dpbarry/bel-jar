import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { walkTree } from '../editor-src/bel-walk.mjs';

const src = '| ¬I : ({p:o} nd A -> nd p) -> nd (¬ A)';
const doc = Text.of([src]);
const { uses } = walkTree(parser.parse(src), doc);

const pBinder = uses.find((u) => u.name === 'p' && u.from === src.indexOf('{p') + 1);
const pUse = uses.find((u) => u.name === 'p' && u.from === src.lastIndexOf('p'));
if (!pBinder || pBinder.bound) {
  console.error('FAIL: pi binder site must not be a bound use');
  process.exit(1);
}
if (!pUse || !pUse.bound) {
  console.error('FAIL: pi binder use in codomain must be bound');
  process.exit(1);
}
console.log('OK pi binder scope');
