import { parser } from '../js/editor-src/beluga-parser.js';
import { resolveHoverDoc } from '../js/editor-src/name-resolve.mjs';
import { Text } from '@codemirror/state';

const SRC = `≻ : mode → mode → type.
↑ok : ≻ K K' → type.
`;
const doc = Text.of(SRC.split('\n'));
const tree = parser.parse(SRC);
const pos = SRC.indexOf(' K') + 1;

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const r = resolveHoverDoc(tree, doc, pos);
expect(r && r.kind === 'implicit', `kind implicit, got ${r && r.kind}`);
expect(r.sourceType === 'mode', `K in ≻ K should be mode, got ${r && r.sourceType}`);
expect(!r.needsElaboration, 'should not need elaboration');

const pos2 = SRC.indexOf(" K'") + 2;
const r2 = resolveHoverDoc(tree, doc, pos2);
expect(r2 && r2.sourceType === 'mode', `K' should be mode, got ${r2 && r2.sourceType}`);

console.log('OK implicit app arg types');
