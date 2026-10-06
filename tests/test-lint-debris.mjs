// Error recovery parks stray tokens between declarations (`;|` after an LF
// datatype, a lone `)`) as Program-level error nodes outside every
// Declaration. They used to fall in no lint block, so they drew no squiggle
// while Run failed on them. Pins: each stray run is flagged and masked, the
// neighbouring declarations stay trusted, and module bodies behave the same.
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
  return { diags: syntaxLintTree(tree, doc), blocks: computeLintBlocks(tree, doc).blocks };
}

const flagged = (src, stray) => {
  const at = src.lastIndexOf(stray);
  return lint(src).diags.some((d) => d.from <= at && d.to > at);
};

{
  const src = 'LF o : type =\n| a : o\n| b : o\n;|';
  expect(flagged(src, '|'), 'stray | after the closing ; is flagged');
  const { blocks } = lint(src);
  expect(!blocks[0].syntaxFault, 'the LF datatype before the stray | stays trusted');
  expect(blocks.some((b) => b.syntaxFault && b.from === src.length - 1),
    'the stray | is its own faulted block');
}

expect(flagged('LF o : type = | a : o;\n|\n\nLF p : type = | c : p;', '|\n'),
  'stray | between declarations is flagged');
expect(flagged('LF o : type = | a : o;\n)\n', ')'), 'stray ) is flagged');

{
  const src = 'LF o : type = | a : o;\n; ;\n';
  const { diags } = lint(src);
  expect(diags.length === 2, `each stray ; is flagged, got ${diags.length}`);
}

{
  const src = 'module M = struct\nLF o : type = | a : o;\n|\nLF p : type = | c : p;\nend;';
  expect(flagged(src, '|\n'), 'stray | inside a module body is flagged');
  const { blocks } = lint(src);
  expect(blocks.filter((b) => b.syntaxFault).length === 1,
    'only the stray | is faulted, not the declarations around it');
}

{
  const { diags, blocks } = lint('LF o : type = | a : o;\n% note\nrec f : [⊢ o] = ?;\n');
  expect(diags.length === 0 && blocks.every((b) => !b.syntaxFault),
    'comments between declarations are not debris');
}

console.log('OK lint debris (stray tokens between declarations are flagged and masked)');
