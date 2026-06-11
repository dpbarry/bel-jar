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
LF value : tm -> type.
LF ~> : tm -> tm -> type.
LF ↦* : tm -> tm -> type.

--infix ↦* right.

↦*/i : t ↦* t.
⇓/v : value v → v ⇓ v.
LF ~>/ift : t ~> t' -> ift t t1 t2 ~> ift t' t1 t2.
`;

const doc = Text.of(SRC.split('\n'));
const tree = parser.parse(SRC);
const diags = syntaxLintTree(tree, doc);
const undef = diags.filter((d) => d.message.includes('is not defined'));

expect(undef.length === 0, `syntax lint must never emit undefined-name errors, got ${undef.length}`);

const tPos = SRC.indexOf('↦*/i : t') + '↦*/i : '.length;
expect(referenceKind(tree, doc, tPos) === 'implicit', 'signature t is implicit, not unbound');

console.log('OK lint implicit signature binders (no undefined-name syntax lint)');
