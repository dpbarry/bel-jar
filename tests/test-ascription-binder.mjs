import assert from 'node:assert';
import { parser } from '../js/editor-src/beluga-parser.js';
import { resolveHoverDoc } from '../js/editor-src/name-resolve.mjs';
import { Text } from '@codemirror/state';

// `( x : T )` ascriptions must resolve instantly from source — no Beluga.
// This covers heavily-annotated proof pattern binders that previously spun
// forever on a query Beluga cannot answer at a case-pattern subterm.
const SRC = `rec concat : [Ψ ⊢ x] =
fn StepsPQ ⇒ case StepsPQ of
  | [Ψ ⊢ ↦*/step (stepPW: ↦ (P: tm K[] A[]) W) stepsWQ] ⇒ x
;
`;
const doc = Text.of(SRC.split('\n'));
const tree = parser.parse(SRC);

const at = (needle, off = 0) => resolveHoverDoc(tree, doc, SRC.indexOf(needle) + off);

const pw = at('stepPW:', 1);
assert.equal(pw.kind, 'local', 'stepPW is a local binding');
assert.equal(pw.sourceType, '↦ (P: tm K[] A[]) W', 'stepPW type read from ascription');
assert.ok(!pw.needsElaboration, 'stepPW needs no Beluga elaboration');

const p = at('(P: tm', 1);
assert.equal(p.kind, 'local', 'nested binder P is local');
assert.equal(p.sourceType, 'tm K[] A[]', 'nested ascription typed correctly');

console.log('OK ascription binder types (instant, no elaboration)');
