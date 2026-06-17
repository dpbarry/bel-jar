import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { syntaxLintTree } from '../editor-src/bel-lint.mjs';
import { referenceKind } from '../editor-src/bel-resolve.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function parseErrorCount(tree) {
  let n = 0;
  tree.iterate({ enter(node) { if (node.type.isError) n += 1; } });
  return n;
}

function lintCorpus(label, src, { maxParseErrors = 0, allowUndefinedName = false } = {}) {
  const doc = Text.of(src.split('\n'));
  const tree = parser.parse(src);
  const parseErrs = parseErrorCount(tree);
  const diags = syntaxLintTree(tree, doc);
  const undef = diags.filter((d) => d.message.includes('is not defined'));
  if (parseErrs > maxParseErrors) {
    console.error(`FAIL ${label}: ${parseErrs} parse errors (max ${maxParseErrors})`);
    process.exit(1);
  }
  if (!allowUndefinedName && undef.length) {
    console.error(`FAIL ${label}: undefined-name lint`, undef.slice(0, 3));
    process.exit(1);
  }
}

const TAPL = `LF tm : type.
LF value : tm -> type.
LF ↝ : tm -> tm -> type.
LF ↦ : tm -> tm -> type.
LF ↦* : tm -> tm -> type.

--infix ↦* right.

↦*/s : t ↦ t' → t ↦* t'.
↦*/i : t ↦* t.
↦*/t : t ↦* t' → t' ↦* t'' → t ↦* t''.

⇓ : tm → tm → type.

--infix ⇓ right.

⇓/v : value v → v ⇓ v.
LF ↝/ift : t ↝ t' -> ift t t1 t2 ↝ ift t' t1 t2.
`;

lintCorpus('tapl', TAPL);

for (const name of [
  'lf-term-datatype.bel',
  'lf-twelf-style.bel',
  'datatype-foo.bel',
  'infix-operators.bel',
]) {
  const src = fs.readFileSync(path.join(__dir, 'fixtures/userguide', name), 'utf8');
  lintCorpus(`userguide/${name}`, src);
}

for (const name of ['hint-stress.bel']) {
  const src = fs.readFileSync(path.join(__dir, '..', name), 'utf8');
  lintCorpus(name, src);
}

const allBel = fs.readFileSync(path.join(__dir, '..', 'all.bel'), 'utf8');
lintCorpus('all.bel (no parse or undefined-name lint)', allBel);

const taplDoc = Text.of(TAPL.split('\n'));
const taplTree = parser.parse(TAPL);
const tPos = TAPL.indexOf('↦*/i : t') + '↦*/i : '.length;
expect(referenceKind(taplTree, taplDoc, tPos) === 'implicit', 'referenceKind: signature t is implicit');
const vPos = TAPL.indexOf('⇓/v : value v') + '⇓/v : value '.length;
expect(referenceKind(taplTree, taplDoc, vPos) === 'implicit', 'referenceKind: domain v is implicit');

console.log('OK lint corpus (TAPL, userguide fixtures, hint-stress, all.bel undefined-name gate)');
