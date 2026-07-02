// Context menu Inspect gate: must appear on references, not only definitions.
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';
import { canInspectAt, buildInspectorModel } from '../editor-src/bel-inspector.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const SAMPLE = `LF o : type =
  | ⊃ : o → o → o
  | ⊤ : o
;
LF nd : o → type =
  | ⊃I : (nd A → nd B) → nd (A ⊃ B)
  | ⊤I : nd ⊤
;
`;

const doc = Text.of(SAMPLE.split('\n'));
const e = createSemanticEngine();
e.update(parser.parse(SAMPLE), doc);
const sym = (n) => e.debugSnapshot().symbols.find((s) => s.name === n && s.isGlobal);

const defPos = sym('⊃').nameRange.from;
const usePos = SAMPLE.indexOf('A ⊃ B') + 2;
const navDef = e.navAt(defPos);
const navUse = e.navAt(usePos);
expect(navDef.onDefinition === true, 'fixture: definition site');
expect(navUse.onDefinition === false, 'fixture: use site');
expect(navUse.symbolId === navDef.symbolId, 'use and def share symbolId');

// Unresolved reference: symbolId null on nav, but reference + intel still resolve.
const UNRES = `rec test : nd ⊤ = ?;\n`;
const udoc = Text.of(UNRES.split('\n'));
const ue = createSemanticEngine();
ue.update(parser.parse(UNRES), udoc);
const uPos = UNRES.indexOf('nd');
const uNav = ue.navAt(uPos);
expect(uNav.reference && !uNav.symbolId, 'unresolved use has reference but no symbolId');
expect(buildInspectorModel(ue, uPos)?.name === 'nd', 'inspector model builds on unresolved use');

const view = { state: { selection: { main: { head: uPos } } } };
view._belSemanticEngine = ue;
globalThis.window = globalThis;
expect(canInspectAt(view, uPos), 'canInspectAt on unresolved reference');

console.log('OK context menu inspect gate (references, not only definitions)');
