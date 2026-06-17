// Semantic Engine V2 — navigation substrate (navAt / occurrencesAt).
// Pins the one-call shape the IDE UI layer (go-to-def, find-refs, rename,
// reveal-binder) reads, so the engine contract those
// features depend on can't silently drift.
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';

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

// Offset of the first occurrence of a substring in the document.
function offsetOf(needle, nth = 0) {
  const s = SAMPLE;
  let idx = -1;
  for (let i = 0; i <= nth; i++) idx = s.indexOf(needle, idx + 1);
  return idx;
}

// --- navAt on a USE of ⊃ (inside ⊃I's signature) ---
const useOfImp = offsetOf('A ⊃ B'); // the ⊃ inside (A ⊃ B)
const navUse = e.navAt(useOfImp + 2); // land on the ⊃ glyph
expect(navUse, 'navAt should resolve on a use of ⊃');
expect(navUse.symbolId === sym('⊃').id, 'navAt on a use points at the ⊃ declaration');
expect(navUse.onDefinition === false, 'a use is not the definition occurrence');
expect(navUse.nameRange && navUse.nameRange.from === sym('⊃').nameRange.from,
  'navAt.nameRange is the declaration name (jump-to-def target)');
expect(navUse.reference && navUse.reference.range, 'navAt carries the hovered reference range');

// --- navAt on the DEFINITION name of ⊃ ---
const navDef = e.navAt(sym('⊃').nameRange.from);
expect(navDef && navDef.onDefinition === true, 'navAt on the decl name reports onDefinition');
expect(navDef.symbolId === sym('⊃').id, 'navAt on the decl name resolves to itself');
expect(navDef.isGlobal === true, 'global decl flagged isGlobal');

// --- occurrencesAt: ⊃ has its def name + 1 reference = 2 occurrences ---
const occ = e.occurrencesAt(useOfImp + 2);
expect(occ.length === 2, `⊃ should have 2 occurrences (def + 1 use), got ${occ.length}`);
expect(occ[0].from < occ[1].from, 'occurrences sorted by position');

// --- navAt tolerates a non-identifier position without throwing ---
const navNone = e.navAt(0); // 'LF' keyword start, not an ident
expect(navNone === null || typeof navNone === 'object',
  'navAt returns null or a record at a non-identifier position');

// --- signature surfaced for find/insert: ⊃ has a source signature ---
expect(navDef.signature && navDef.signature.type, 'navAt surfaces a signature on global defs');

console.log('OK semantic nav v2 (navAt shape, onDefinition, occurrencesAt, signature surfacing)');
