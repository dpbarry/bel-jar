import { parser } from '../js/editor-src/beluga-parser.js';
import {
  stubAllBodies,
  compressPrelude,
  buildCompressedCheckerCode,
  keepIndicesForFrontier,
  topDeclSpans,
} from '../js/editor-src/semantic/compress-development.mjs';
import { assembleCheckerCode } from '../js/editor-src/semantic/project-prelude.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const preludeSrc = `rec f : [⊢ nat] =
  fn x ⇒ x
;
rec g : [⊢ nat] =
  fn x ⇒ f x
;
`;

const activeSrc = `rec h : [⊢ nat] =
  fn x ⇒ g x
;
rec broken : [⊢ nat] =
  fn x ⇒ Z9_unbound
;
`;

{
  const stubbed = stubAllBodies(preludeSrc);
  expect(stubbed.includes('?'), 'stubAllBodies inserts hole');
  expect(stubbed.includes('rec f : [⊢ nat]'), 'signature preserved');
  expect(!/fn x ⇒ x/.test(stubbed), 'f body stubbed out');
  expect(stubbed.split('\n').length === preludeSrc.split('\n').length, 'line count preserved');
}

{
  const prelude = {
    code: preludeSrc,
    spans: [{ id: 'p', name: 'p.bel', startLine: 1, endLine: 6 }],
    offsetLines: 7,
    names: new Set(['f', 'g']),
  };
  const compressed = compressPrelude(prelude);
  expect(compressed.offsetLines === 7, 'offsetLines unchanged');
  expect(compressed.code.length < prelude.code.length, 'compressed prelude smaller');
}

{
  const tree = parser.parse(activeSrc);
  const decls = topDeclSpans(tree);
  expect(decls.length >= 2, 'active has decls');
  const keepIdx = keepIndicesForFrontier(tree, [decls[decls.length - 1]]);
  const prelude = {
    code: preludeSrc,
    spans: [{ id: 'p', name: 'p.bel', startLine: 1, endLine: preludeSrc.split('\n').length }],
    offsetLines: preludeSrc.split('\n').length + 1,
    names: new Set(),
  };
  const full = assembleCheckerCode(activeSrc, prelude);
  const comp = buildCompressedCheckerCode({
    fileCode: activeSrc,
    prelude,
    keepIdx,
    tree,
    activeSrc,
  });
  expect(!!comp, 'compressed assemble succeeds');
  expect(comp.code.length < full.code.length, 'compressed checker program smaller than full');
  expect(comp.code.includes('Z9_unbound'), 'dirty decl body kept');
  expect(!comp.code.includes('fn x ⇒ g x'), 'earlier active body stubbed or truncated');
}

console.log('OK compress-development');
