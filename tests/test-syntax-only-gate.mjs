import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { onlySyntaxFaultBlocksChanged } from '../js/editor-src/semantic/syntax-only-gate.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const good = `LF t : type =\n  | z : t\n;\n`;
const broken = `LF t : type =\n  | z t\n;\n`;
const tree0 = parser.parse(good);
const doc0 = Text.of(good.split('\n'));
const syntax0 = { tree: tree0, doc: doc0, version: 1 };

const tree1 = parser.parse(broken);
const doc1 = Text.of(broken.split('\n'));
const syntax1 = { tree: tree1, doc: doc1, version: 2 };

expect(onlySyntaxFaultBlocksChanged(syntax0, syntax1), 'syntax-only edit gates Beluga');

const tree2 = parser.parse(good.replace('z', 's'));
const syntax2 = { tree: tree2, doc: Text.of(good.replace('z', 's').split('\n')), version: 3 };
expect(!onlySyntaxFaultBlocksChanged(syntax0, syntax2), 'semantic edit does not gate');

console.log('OK test-syntax-only-gate');
