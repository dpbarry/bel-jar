import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { syntaxLintTree } from '../editor-src/bel-lint.mjs';
import { referenceKind } from '../editor-src/bel-resolve.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const SRC = `LF tm : type.
rec test : tm -> tm =
  fn x => let {A:tm}{B:tm} A = B in A;
`;

const doc = Text.of(SRC.split('\n'));
const tree = parser.parse(SRC);

let parseErrors = 0;
tree.iterate({ enter(n) { if (n.type.isError) parseErrors += 1; } });
expect(parseErrors === 0, `expected 0 parse errors, got ${parseErrors}`);

let qbCount = 0;
tree.iterate({
  enter(ref) {
    if (ref.name === 'QuantifiedBinder' && ref.node.parent?.name === 'LetExpression') qbCount += 1;
  },
});
expect(qbCount === 2, `expected 2 quantified binders in let, got ${qbCount}`);

const diags = syntaxLintTree(tree, doc);
expect(diags.length === 0, `expected 0 syntax diags, got ${diags.length}: ${diags.map((d) => d.message).join('; ')}`);

const aUsePos = SRC.lastIndexOf(' A');
expect(referenceKind(tree, doc, aUsePos + 1) === 'local', 'pattern binder use in body is local');

console.log('OK let quantified binders parse and scope');
