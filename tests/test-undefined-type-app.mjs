import assert from 'node:assert';
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { referenceKind, resolveHoverDoc } from '../editor-src/bel-resolve.mjs';
import { syntaxLintTree } from '../editor-src/bel-lint.mjs';

const TYPO = `name : type.
tp : type.
⅋ : t p -> tp -> tp.
`;

const VALID_IMPLICIT = `LF tm : type.
LF value : tm -> type.
LF ~> : tm -> tm -> type.
LF ↦* : tm -> tm -> type.
↦*/i : t ↦* t.
`;

const VALID_APP = `LF tp : type.
LF dual : tp -> tp -> type =
  | d : dual A A'
;
`;

function at(src, needle) {
  return src.indexOf(needle);
}

{
  const doc = Text.of(TYPO.split('\n'));
  const tree = parser.parse(TYPO);
  const tPos = at(TYPO, 't p');
  const pPos = tPos + 2;
  assert.equal(referenceKind(tree, doc, tPos), 'unbound', 'typo head t is unbound');
  assert.equal(referenceKind(tree, doc, pPos), 'unbound', 'typo arg p is unbound');
  const th = resolveHoverDoc(tree, doc, tPos);
  assert.equal(th.kind, 'unbound');
  assert.match(th.message, /not defined/);
  const ph = resolveHoverDoc(tree, doc, pPos);
  assert.equal(ph.kind, 'unbound');
  const diags = syntaxLintTree(tree, doc);
  assert.ok(diags.length >= 2, 'syntax lint flags both typo atoms');
  assert.ok(diags.some((d) => d.message.includes("Type family 't' is not defined")));
}

{
  const doc = Text.of(VALID_IMPLICIT.split('\n'));
  const tree = parser.parse(VALID_IMPLICIT);
  const tPos = at(VALID_IMPLICIT, '↦*/i : t') + '↦*/i : '.length;
  assert.equal(referenceKind(tree, doc, tPos), 'implicit', 'arrow-domain t stays implicit');
  const undefApp = syntaxLintTree(tree, doc).filter((d) => /not defined/.test(d.message));
  assert.equal(undefApp.length, 0, 'valid implicit signature has no undefined-app lint');
}

{
  const doc = Text.of(VALID_APP.split('\n'));
  const tree = parser.parse(VALID_APP);
  const aPos = at(VALID_APP, 'A A');
  assert.equal(referenceKind(tree, doc, aPos), 'implicit', 'dual A arg stays implicit');
}

console.log('OK undefined type application (t p typo)');
