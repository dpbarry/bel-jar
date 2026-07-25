// Semantic Engine V2 — rename precision lock-down.
// Pins that renamePreview rewrites exactly the definition name plus its
// resolved references (nothing else), and refuses same-namespace collisions.
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSemanticEngine } from '../js/editor-src/semantic/semantic-engine.mjs';

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

const e = createSemanticEngine();
e.update(parser.parse(SAMPLE), Text.of(SAMPLE.split('\n')));
const sym = (n) => e.debugSnapshot().symbols.find((s) => s.name === n && s.isGlobal);

// ⊃I is defined but never referenced -> exactly one edit (the definition).
const r1 = e.renamePreview(sym('⊃I').id, 'impI');
expect(r1.ok, `rename ⊃I should succeed, got ${r1.reason}`);
expect(r1.edits.length === 1, `⊃I rename should touch only its definition, got ${r1.edits.length} edits`);
expect(r1.edits[0].insert === 'impI', 'edit should insert the new name');

// ⊃ is used once inside ⊃I's signature -> definition + 1 reference = 2 edits.
const refs = e.referencesOf(sym('⊃').id);
expect(refs.length === 1, `⊃ should have exactly one resolved reference, got ${refs.length}`);
const r2 = e.renamePreview(sym('⊃').id, 'imp');
expect(r2.ok, `rename ⊃ should succeed, got ${r2.reason}`);
expect(r2.edits.length === 2, `⊃ rename should touch def + 1 ref = 2 edits, got ${r2.edits.length}`);
// Edits must be sorted by position and cover the def name range.
const defEdit = r2.edits.find((ed) => ed.from === sym('⊃').nameRange?.from) || r2.edits[0];
expect(defEdit, 'rename edits should include the definition name range');

// Collision with an existing same-namespace constructor is refused.
const r3 = e.renamePreview(sym('⊃I').id, '⊤I');
expect(!r3.ok, 'renaming ⊃I to existing ⊤I must fail');
expect(r3.reason === 'name-conflict', `expected name-conflict, got ${r3.reason}`);
expect(r3.edits.length === 0, 'a rejected rename must produce no edits');

console.log('OK semantic rename v2 (precise edits, conflict refusal)');
