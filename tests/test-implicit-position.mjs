import assert from 'node:assert';
import { parser } from '../js/editor-src/beluga-parser.js';
import { resolveHoverDoc } from '../js/editor-src/name-resolve.mjs';
import { Text } from '@codemirror/state';

function check(SRC, needle, expected, label, body = false, posFn = null) {
  const doc = Text.of(SRC.split('\n'));
  const tree = parser.parse(SRC);
  const pos = posFn ? posFn(SRC) : (body ? SRC.lastIndexOf(needle) : SRC.indexOf(needle)) + 1;
  const r = resolveHoverDoc(tree, doc, pos);
  assert.equal(r?.sourceType, expected, `${label}: got ${r?.sourceType}`);
  assert.notEqual(r?.needsElaboration, true, `${label}: should not need Beluga`);
}

// Decl-signature implicit (stepP'Q' style — name declared in rec type prefix)
check(
  `LF Steps : type -> type -> type.
LF pair : type.
rec lem : (stepP'Q' : Steps pair pair) -> Steps pair pair =
fn _ => stepP'Q'
;
`,
  "stepP'Q'",
  'Steps pair pair',
  'decl-signature implicit',
  true,
);

// Multiple prefix binders (discharge-style) — A in nd A inside signature
check(
  `schema ctx = o.
LF nd : o -> type.
rec discharge : (g : ctx) [g |- nd A] -> [g |- nd A] =
fn d => d
;
`,
  'nd A',
  'o',
  'type-app in signature',
  false,
  (src) => src.indexOf('nd A') + 4,
);

console.log('OK implicit position types');
