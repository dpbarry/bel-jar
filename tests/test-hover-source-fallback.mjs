import { EditorState } from '@codemirror/state';
import { resolveHover } from '../editor-src/bel-resolve.mjs';
import { beluga } from '../editor-src/bel-language.mjs';

const SAMPLE = `% Natural Deduction
LF o : type =
  | ⊃ : o → o → o
  | ⊤ : o
;

LF nd : o → type =
  | ⊃I : (nd A → nd B) → nd (A ⊃ B)
  | ⊤I : nd ⊤
;
`;

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function stateOf(src) {
  return EditorState.create({ doc: src, extensions: [beluga()] });
}

const state = stateOf(SAMPLE);

const ctorDecl = resolveHover(state, SAMPLE.indexOf('⊃I'));
expect(ctorDecl, 'constructor declaration should resolve');
expect(ctorDecl.kind === 'global', `constructor kind should be global, got ${ctorDecl.kind}`);
expect(
  ctorDecl.sourceText === '(nd A → nd B) → nd (A ⊃ B)',
  `constructor sourceText mismatch: ${ctorDecl.sourceText}`
);

const typeFamilyDecl = resolveHover(state, SAMPLE.indexOf('nd :'));
expect(typeFamilyDecl, 'LF type family declaration should resolve');
expect(
  typeFamilyDecl.sourceText === 'o → type',
  `LF family sourceText mismatch: ${typeFamilyDecl.sourceText}`
);

const topUse = resolveHover(state, SAMPLE.lastIndexOf('⊤'));
expect(topUse, 'constructor reference should resolve');
expect(topUse.kind === 'global', `constructor reference kind should be global, got ${topUse.kind}`);
expect(topUse.sourceText === 'o', `constructor reference sourceText mismatch: ${topUse.sourceText}`);

const BLOCK_PROJ = `rec f : [b1:block (x:tm m/q _, nx:neu x) ⊢ tm m/q A[]] → type =
  fn _ ⇒ [b1:block (x:tm m/q _, nx:neu x) ⊢ b1.1];
`;
const blockState = stateOf(BLOCK_PROJ);
const b11Pos = BLOCK_PROJ.indexOf('b1.1');
const b11 = resolveHover(blockState, b11Pos + 1);
expect(b11 && b11.kind === 'local', 'block projection should resolve as local context entry');
expect(
  b11 && b11.sourceType === 'tm m/q _',
  `b1.1 field type should be tm m/q _, got ${b11 && b11.sourceType}`,
);

console.log('OK hover source-signature fallback');
