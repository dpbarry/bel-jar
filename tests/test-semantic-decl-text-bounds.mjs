// semanticDeclText must not re-walk the whole file per binder (O(n²) keystroke lag).
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { semanticDeclText } from '../editor-src/semantic/check-gate.mjs';
import { createSyntaxStore } from '../editor-src/semantic/syntax-store.mjs';
import { createSymbolStore } from '../editor-src/semantic/symbol-store.mjs';
import { performance } from 'perf_hooks';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const binder = '{x : nat}';
const body = Array.from({ length: 400 }, (_, i) => `  | c${i} : nat`).join('\n');
const src = `LF nat : type =\n${body}\n;\n\nrec f : ${binder} nat =\n  fn x ⇒ x\n;\n`;

const doc = Text.of(src.split('\n'));
const tree = parser.parse(src);
let pi = null;
tree.iterate({
  enter(ref) {
    if (ref.name === 'PiBinder' || ref.name === 'CompTypeBinder') pi = ref.node;
  },
});
expect(!!pi, 'expected a binder node');

const t0 = performance.now();
for (let i = 0; i < 200; i += 1) semanticDeclText(doc, pi, tree);
const perCall = (performance.now() - t0) / 200;
expect(perCall < 0.5, `semanticDeclText too slow: ${perCall.toFixed(3)}ms/call (unbounded iterate?)`);

// Warm + measure: absolute ms varies under load; require a clear win vs the
// old O(n²) regime (~hundreds of ms on this fixture when unbounded).
const syn = createSyntaxStore().update(tree, doc, {});
createSymbolStore().update(syn); // warmup
const t1 = performance.now();
createSymbolStore().update(syn);
const symMs = performance.now() - t1;
expect(symMs < 400, `symbolStore.update pathological: ${symMs.toFixed(1)}ms`);

console.log('OK semantic-decl-text-bounds');
