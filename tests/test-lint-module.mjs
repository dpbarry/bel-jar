import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { computeLintBlocks } from '../js/editor-src/lint-units.mjs';

const sample = `module M = struct
  LF a : type.
  LF b : o → type = | c : b a.
end;

LF x : o → type = | y : x ⊤.
`;

const doc = Text.of(sample.split('\n'));
const tree = parser.parse(sample);
const { blocks } = computeLintBlocks(tree, doc);

console.log('blocks:', blocks.length);
for (let i = 0; i < blocks.length; i++) {
  const b = blocks[i];
  console.log(
    `  [${i}] L${doc.lineAt(b.from).number}-${doc.lineAt(Math.max(b.from, b.to - 1)).number}`,
    `inner=${b.inner} syntaxFault=${b.syntaxFault} trustBeluga=${b.trustBeluga}`
  );
}

const aPos = sample.indexOf('LF a');
const xPos = sample.indexOf('LF x');
const blockA = blocks.find((b) => aPos >= b.from && aPos < b.to);
const blockX = blocks.find((b) => xPos >= b.from && xPos < b.to);

const lfDeclInners = new Set(['LFDeclaration', 'LFDatatypeDeclaration']);
if (!blockA || !lfDeclInners.has(blockA.inner)) {
  console.error('FAIL: LF a inside module should be its own block, got', blockA);
  process.exit(1);
}
if (!blockX || blockX.inner !== 'LFDatatypeDeclaration') {
  console.error('FAIL: LF x outside module should be its own block, got', blockX);
  process.exit(1);
}
if (blockA.from >= blockX.from) {
  console.error('FAIL: module body block should precede top-level LF x');
  process.exit(1);
}

const header = blocks.find((b) => b.inner === 'ModuleDeclaration');
if (!header || header.trustBeluga) {
  console.error('FAIL: expected module header block without Beluga trust');
  process.exit(1);
}

console.log('OK');
process.exit(0);
