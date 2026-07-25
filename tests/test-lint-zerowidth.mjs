// Lezer's "missing token" recovery leaves ZERO-WIDTH error nodes (unclosed
// paren, missing colon). These used to produce no diagnostic at all and not
// flag the block as a syntax fault — so a broken block showed nothing while
// poisoning the Beluga pass. Pins:
//  1. every broken block yields a diagnostic, including missing-token faults;
//  2. those blocks read syntaxFault (masked from the checker);
//  3. a block that already has a spanning error doesn't ALSO get zero-width
//     recovery echoes;
//  4. a clean file stays diagnostic-free.
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { syntaxLintTree } from '../js/editor-src/ide/syntax-lint.mjs';
import { computeLintBlocks } from '../js/editor-src/lint-units.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function lint(src) {
  const doc = Text.of(src.split('\n'));
  const tree = parser.parse(src);
  return {
    diags: syntaxLintTree(tree, doc),
    blocks: computeLintBlocks(tree, doc).blocks,
    doc,
  };
}

// Three broken blocks (unclosed paren / missing rec colon / stray brace) with
// healthy blocks interleaved — each fault must surface independently.
{
  const { diags, blocks } = lint(`LF x : type =
  | mkX : ( x
;
LF y : type =
  | mkY : y
;
rec broken [⊢ x] =
fn d => d;
LF z : type =
  | mkZ : z
;
schema bad = } block;
`);
  const blocksWithDiag = new Set(diags.map((d) => d.blockIndex));
  expect(blocksWithDiag.has(0), 'unclosed paren block must get a diagnostic');
  expect(blocksWithDiag.has(2), 'rec missing-colon block must get a diagnostic');
  expect(blocksWithDiag.has(4), 'schema stray-brace block must get a diagnostic');
  expect(!blocksWithDiag.has(1) && !blocksWithDiag.has(3),
    'healthy blocks must stay clean');
  expect(blocks[0].syntaxFault && blocks[2].syntaxFault && blocks[4].syntaxFault,
    'all broken blocks must read syntaxFault (masked from Beluga)');
  expect(!blocks[1].syntaxFault && !blocks[3].syntaxFault,
    'healthy blocks must not read syntaxFault');
  // One diagnostic per zero-width fault, not a recovery-echo pile-up.
  const inBlock0 = diags.filter((d) => d.blockIndex === 0);
  expect(inBlock0.length === 1, `one diag for the unclosed paren, got ${inBlock0.length}`);
}

// A clean file yields no diagnostics and no faulted blocks.
{
  const { diags, blocks } = lint(`LF nat : type =
  | z : nat
  | s : nat -> nat
;
rec plus : [⊢ nat] → [⊢ nat] =
fn a => a;
`);
  expect(diags.length === 0, `clean file must have 0 diags, got ${diags.length}`);
  expect(blocks.every((b) => !b.syntaxFault), 'clean file must have no faulted blocks');
}

console.log('OK lint zero-width (missing-token faults surface per block, clean files stay quiet)');
