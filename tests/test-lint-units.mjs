import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { computeLintBlocks } from '../js/editor-src/lint-units.mjs';
import { syntaxLintTree } from '../js/editor-src/ide/syntax-lint.mjs';

const sample = `--prefix ¬ 10.
--inhfix ∧ 5 right.
--infix ∨ 4 right.
--infix ⊃ 3 right.
`;

const doc = Text.of(sample.split('\n'));
const tree = parser.parse(sample);
const { blocks, blockAt } = computeLintBlocks(tree, doc);

console.log('blocks:', blocks.length);
for (let i = 0; i < blocks.length; i++) {
  const b = blocks[i];
  const line = doc.lineAt(b.from).number;
  console.log(
    `  [${i}] line ${line} inner=${b.inner} syntaxFault=${b.syntaxFault} trustBeluga=${b.trustBeluga}`
  );
}

const diags = syntaxLintTree(tree, doc);
console.log('syntax diags:', diags.length);
for (const d of diags) {
  console.log(`  L${doc.lineAt(d.from).number} ${d.from}-${d.to} ${d.message}`);
}

const infixLine2 = sample.indexOf('--infix ∨');
const hit = blockAt(infixLine2);
if (!hit) {
  console.error('FAIL: no block at second --infix line');
  process.exit(1);
}
if (hit.block.syntaxFault) {
  console.error('FAIL: valid --infix block marked syntaxFault');
  process.exit(1);
}

const badBlocks = blocks.filter((b) => b.syntaxFault && sample.slice(b.from, b.to).includes('inhfix'));
if (!badBlocks.length) {
  console.error('FAIL: expected a syntaxFault block covering --inhfix line');
  process.exit(1);
}

const inhfixLine = doc.lineAt(sample.indexOf('--inhfix')).number;
const pragmaDiags = diags.filter(
  (d) => doc.lineAt(d.from).number === inhfixLine && d.message === 'Unknown pragma'
);
if (!pragmaDiags.length) {
  console.error('FAIL: expected Unknown pragma on --inhfix line, got:', diags);
  process.exit(1);
}

const diagsOnGoodInfix = diags.filter((d) => d.from >= infixLine2 && d.from < infixLine2 + 10);
if (diagsOnGoodInfix.length) {
  console.error('FAIL: syntax diags on valid --infix line:', diagsOnGoodInfix);
  process.exit(1);
}

console.log('OK');
process.exit(0);
