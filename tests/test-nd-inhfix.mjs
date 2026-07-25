import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import {
  applySyntaxFaultMask,
  computeLintBlocks,
  maskBelugaBlockContext,
} from '../js/editor-src/lint-units.mjs';

const sample = `% Natural Deduction
LF o : type =
  | ⊃ : o → o → o
  | ⊤ : o
  | ∧ : o → o → o
  | ∨ : o → o → o
  | ¬ : o → o
;

--prefix ¬ 10.
--infdix ⊃ 3 right.
--infix ∨ 4 right.
--infix ⊃ 3 right.

LF nd : o → type =
  | ⊃I : (nd A → nd B) → nd (A ⊃ B)
  | ⊤I : nd ⊤
;
`;

const doc = Text.of(sample.split('\n'));
const tree = parser.parse(sample);
const { blocks } = computeLintBlocks(tree, doc);

const lfNdPos = sample.indexOf('LF nd');
const lfNdBlock = blocks.find((b) => lfNdPos >= b.from && lfNdPos < b.to);
console.log('LF nd block:', lfNdBlock);

console.log('all blocks:');
for (let i = 0; i < blocks.length; i++) {
  const b = blocks[i];
  console.log(
    `  [${i}] L${doc.lineAt(b.from).number}-${doc.lineAt(Math.max(b.from, b.to - 1)).number}`,
    `inner=${b.inner} syntaxFault=${b.syntaxFault} trustBeluga=${b.trustBeluga}`
  );
}

const masked = applySyntaxFaultMask(sample, doc, blocks);
let cur = tree.topNode.firstChild;
while (cur) {
  if (doc.lineAt(cur.from).number === 11) {
    console.log('decl on L11:', cur.from, cur.to, cur.firstChild && cur.firstChild.name);
  }
  cur = cur.nextSibling;
}

console.log('\nline 11 unit spans:');
const line11 = blocks.filter((b) => doc.lineAt(b.from).number === 11);
console.log('line 11 blocks:', line11.length, '(expect 1 coalesced)');

console.log('\nmasked lines 11-15:');
const lines = masked.split('\n');
for (let L = 10; L <= 14; L++) console.log(L + 1, JSON.stringify(lines[L]));

if (lines[10].replace(/[^\n]/g, '').trim().length > 0) {
  console.error('FAIL: line 11 must be fully blanked for Beluga');
  process.exit(1);
}
if (line11.length !== 1) {
  console.error('FAIL: expected one coalesced block on typo line, got', line11.length);
  process.exit(1);
}
if (!lfNdBlock || !lfNdBlock.trustBeluga) {
  console.error('FAIL: LF nd block must trust Beluga');
  process.exit(1);
}
const ndIdx = blocks.findIndex((b) => sample.slice(b.from, b.to).includes('LF nd'));
const oIdx = blocks.findIndex((b) => sample.slice(b.from, b.to).includes('LF o'));
const ctx = maskBelugaBlockContext(sample, doc, blocks, ndIdx);
if (!ctx.includes('LF o : type')) {
  console.error('FAIL: LF nd Beluga context must include prior LF o block');
  process.exit(1);
}
const typoLineNum = doc.lineAt(blocks.find((b) => b.syntaxFault).from).number;
const ctxLines = ctx.split('\n');
if (/[^\s\n]/.test(ctxLines[typoLineNum - 1] || '')) {
  console.error('FAIL: typo block line must be blanked in Beluga context');
  console.error(JSON.stringify(ctxLines[typoLineNum - 1]));
  process.exit(1);
}
console.log('OK: syntax per block; Beluga for LF nd sees LF o, not typo');

process.exit(0);
