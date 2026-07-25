// Beluga file-check must blank syntax-fault blocks (compartmentalization) so
// independent declarations remain checkable. Mirrors what the semantic engine
// already did via setCheckerCode — the Beluga linter was still sending raw text.
import { Text } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { parser } from '../js/editor-src/beluga-parser.js';
import { beluga } from '../js/editor-src/language.mjs';
import { syntaxLintTree } from '../js/editor-src/ide/syntax-lint.mjs';
import { checkerCodeForView } from '../js/editor-src/ide/syntax-lint.mjs';
import { checkerSnapshot } from '../js/editor-src/semantic/checker-snapshot.mjs';
import { computeLintBlocks } from '../js/editor-src/lint-units.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const sample = `LF bad1 : type =
  | | bad1 : o
;

LF good : o → type =
  | gI : good ⊤
;

LF bad2 : type =
  | | bad2 : o
;
`;

const doc = Text.of(sample.split('\n'));
const tree = parser.parse(sample);
const { blocks } = computeLintBlocks(tree, doc);

expect(blocks.filter((b) => b.syntaxFault).length === 2, 'expected two syntax-fault blocks');
const diags = syntaxLintTree(tree, doc);
expect(diags.length === 2, `syntax lint must report both faults, got ${diags.length}`);

const masked = checkerSnapshot(tree, doc).code;
expect(masked.includes('LF good'), 'masked check code must retain the clean LF good block');
expect(!/bad1/.test(masked.split('\n')[1]), 'first fault line must be blanked in masked code');
expect(!/bad2/.test(masked.split('\n')[9]), 'second fault line must be blanked in masked code');

const view = {
  state: EditorState.create({ doc: sample, extensions: [beluga()] }),
};
const { code: checkCode } = checkerCodeForView(view);
expect(checkCode === masked, 'checkerCodeForView must match applySyntaxFaultMask');

console.log('OK beluga check mask (syntax faults blanked, independent blocks preserved)');
