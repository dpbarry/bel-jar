// Pragma lines are a distinct selection target: inspector + graph treat the whole
// pragma as one entity, not the operator symbol embedded in it.
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';
import { NAMESPACE } from '../editor-src/semantic/ids.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const SRC = `LF o : type =
  | ⊃ : o → o → o
  | ¬ : o → o
;
--prefix ¬ 8.
--infix ⊃ 5 right.
LF nd : o → type =
  | ⊃I : (nd A → nd B) → nd (A ⊃ B)
;
`;

const e = createSemanticEngine();
const doc = Text.of(SRC.split('\n'));
e.update(parser.parse(SRC), doc);

const prefixLine = SRC.indexOf('--prefix');
const opPos = SRC.indexOf('¬', prefixLine);
const prefixMid = prefixLine + 4;

for (const pos of [prefixMid, opPos]) {
  const intel = e.intelSyncAt(pos);
  expect(intel, `intelSyncAt should resolve on pragma at ${pos}`);
  expect(intel.namespace === NAMESPACE.PRAGMA, `pos ${pos}: expected PRAGMA namespace, got ${intel.namespace}`);
  expect(intel.label === 'prefix pragma', `pos ${pos}: expected prefix pragma label, got ${intel.label}`);
  expect(intel.name === '--prefix ¬ 8', `pos ${pos}: expected full pragma line as name, got ${intel.name}`);
  expect(intel.type == null, `pos ${pos}: pragma should have no type`);
  const ctorIntel = e.intelSyncAt(SRC.indexOf('¬ : o'));
  expect(ctorIntel.namespace === NAMESPACE.LF_CONSTRUCTOR,
    'clicking the constructor definition still resolves the LF constructor');
}

const infixPos = SRC.indexOf('⊃', SRC.indexOf('--infix'));
const infixIntel = e.intelSyncAt(infixPos);
expect(infixIntel.label === 'infix pragma', `expected infix pragma label, got ${infixIntel.label}`);

const pragmaSym = e.debugSnapshot().symbols.find((s) => s.namespace === NAMESPACE.PRAGMA);
const nav = e.navAt(opPos);
expect(nav && nav.symbolId === pragmaSym.id,
  'navAt on the operator inside a pragma resolves to the pragma symbol');

console.log('OK pragma selection (inspector identity, no type, graph root suppressed)');
