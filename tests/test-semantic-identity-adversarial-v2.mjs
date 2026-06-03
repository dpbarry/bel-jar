// Semantic Engine V2 — adversarial identity lock-down.
// Goes beyond the happy-path identity test: it pins behavior under the cases
// that break naive name/position identity — duplicate declarations, inserting
// a duplicate before another, reordering duplicates, renaming a parent family,
// moving a constructor between families, and reopening a renamed file in a
// fresh session. It asserts the guarantees we provide AND documents, honestly,
// the boundaries we do not (cross-family move and name-based fresh identity).
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const upd = (e, src) => e.update(parser.parse(src), Text.of(src.split('\n')));
const symbols = (e) => e.debugSnapshot().symbols;
const symOf = (e, name) => symbols(e).find((s) => s.name === name);
// Identify a duplicate-named family by which constructor it encloses.
const familyOf = (e, ctorName) => {
  const all = symbols(e);
  const ctor = all.find((s) => s.name === ctorName && s.namespace === 'lf-constructor');
  return all.find((s) => s.namespace === 'lf-type-family'
    && s.range.from <= ctor.range.from && ctor.range.to <= s.range.to);
};

// --- SymbolId and StructuralKey are distinct concepts -------------------
// A rename changes the (volatile, name-based) structural key but must NOT
// change the (persistent) SymbolId within a session.
{
  const e = createSemanticEngine();
  const BASE = `LF nd : o → type =\n  | impI : nd\n;\n`;
  upd(e, BASE);
  const keyBefore = symOf(e, 'impI').structuralKey;
  const idBefore = symOf(e, 'impI').id;
  upd(e, BASE.replace(/impI/g, 'arrowI'));
  const after = symOf(e, 'arrowI');
  expect(after.structuralKey !== keyBefore, 'structural key must change on rename (it is name-based)');
  expect(after.id === idBefore, 'SymbolId must persist across rename (registry-backed)');
}

// --- Same-qualified duplicates: distinct and globally unique ids ---------
{
  const e = createSemanticEngine();
  upd(e, `LF nd : type =\n  | a : nd\n;\nLF nd : type =\n  | b : nd\n;\n`);
  const nds = symbols(e).filter((s) => s.name === 'nd' && s.namespace === 'lf-type-family');
  expect(nds.length === 2, `expected two nd families, got ${nds.length}`);
  expect(new Set(nds.map((s) => s.id)).size === 2, 'duplicate families must have distinct ids');
  const allIds = symbols(e).map((s) => s.id);
  expect(new Set(allIds).size === allIds.length, 'all SymbolIds must be unique (no collisions)');
}

// --- Inserting a NEW duplicate BEFORE an existing one keeps identity -----
// Original is `foo` enclosing ctor x; we prepend a different `foo` (ctor y).
// The x-family must keep its id; the y-family is genuinely new; ids unique.
{
  const e = createSemanticEngine();
  upd(e, `LF foo : type =\n  | x : foo\n;\n`);
  const origId = symOf(e, 'foo').id;
  upd(e, `LF foo : type =\n  | y : foo\n;\nLF foo : type =\n  | x : foo\n;\n`);
  expect(familyOf(e, 'x').id === origId, 'the original (x) family must keep its id when a twin is prepended');
  expect(familyOf(e, 'y').id !== origId, 'the newly inserted (y) family must get its own id');
  const ids = symbols(e).map((s) => s.id);
  expect(new Set(ids).size === ids.length, 'no id collision after duplicate insertion');
}

// --- Reordering existing duplicates follows content, not position -------
{
  const e = createSemanticEngine();
  upd(e, `LF foo : type =\n  | x : foo\n;\nLF foo : type =\n  | y : foo\n;\n`);
  const idX = familyOf(e, 'x').id;
  const idY = familyOf(e, 'y').id;
  upd(e, `LF foo : type =\n  | y : foo\n;\nLF foo : type =\n  | x : foo\n;\n`); // swapped order
  expect(familyOf(e, 'x').id === idX, 'reordered duplicate (x) keeps identity by content');
  expect(familyOf(e, 'y').id === idY, 'reordered duplicate (y) keeps identity by content');
}

// --- Renaming a parent family re-anchors its children -------------------
{
  const e = createSemanticEngine();
  upd(e, `LF nd : o → type =\n  | impI : nd\n  | trueI : nd\n;\n`);
  const parentBefore = symOf(e, 'nd').id;
  const impBefore = symOf(e, 'impI').id;
  const trueBefore = symOf(e, 'trueI').id;
  upd(e, `LF derivation : o → type =\n  | impI : derivation\n  | trueI : derivation\n;\n`);
  expect(symOf(e, 'derivation').id === parentBefore, 'renamed family keeps its own id');
  expect(symOf(e, 'impI').id === impBefore, 'child impI re-anchored across parent rename');
  expect(symOf(e, 'trueI').id === trueBefore, 'child trueI re-anchored across parent rename');
}

// --- Documented boundary: moving a constructor between families ----------
// Identity follows the qualified location, so a cross-family move is a new
// symbol. We assert this explicitly so the boundary is intentional, not a
// silent surprise.
{
  const e = createSemanticEngine();
  upd(e, `LF a : type =\n  | c : a\n;\nLF b : type =\n  | d : b\n;\n`);
  const cBefore = symOf(e, 'c').id;
  upd(e, `LF a : type =\n;\nLF b : type =\n  | d : b\n  | c : b\n;\n`);
  expect(symOf(e, 'c').id !== cBefore, 'moving a constructor between families is (by design) a new identity');
}

// --- Cross-session: export after rename, restore in a fresh engine ------
{
  const SRC = `LF nd : o → type =\n  | impI : nd\n;\n`;
  const s1 = createSemanticEngine();
  upd(s1, SRC);
  const origId = symOf(s1, 'impI').id;
  upd(s1, SRC.replace(/impI/g, 'arrowI')); // rename in session 1
  expect(symOf(s1, 'arrowI').id === origId, 'session-1 rename keeps id');
  const blob = s1.exportIdentity();

  const s2 = createSemanticEngine();
  s2.importIdentity(blob);
  upd(s2, SRC.replace(/impI/g, 'arrowI')); // reopen the renamed file
  expect(symOf(s2, 'arrowI').id === origId, 'imported registry restores identity in a fresh session');

  // Documented limit: without the registry, fresh identity is name-based.
  const s3 = createSemanticEngine();
  upd(s3, SRC.replace(/impI/g, 'arrowI'));
  expect(symOf(s3, 'arrowI').id !== origId, 'a fresh engine without the registry cannot recover a renamed id');
}

console.log('OK semantic identity adversarial v2 (duplicates, reorder, parent rename, move boundary, cross-session)');
