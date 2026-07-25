// Semantic Engine V2 — identity hardening lock-down.
// SymbolIds must be robust along two axes:
//   * Deterministic (fresh engines): identity is a position-independent
//     structural key, so unrelated insertions, leading comments, and
//     reformatting do not shift it, yet same-named declarations stay distinct.
//   * Persistent (sequential edits of one engine): a declaration keeps its id
//     across renames and unrelated insertions via cross-snapshot matching.
// This guards against the original AST-sibling-index identity, which shifted
// whenever anything was inserted before a declaration.
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSemanticEngine } from '../js/editor-src/semantic/semantic-engine.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const upd = (e, src) => e.update(parser.parse(src), Text.of(src.split('\n')));
const symOf = (e, name) => e.debugSnapshot().symbols.find((s) => s.name === name);
const freshId = (src, name) => { const e = createSemanticEngine(); upd(e, src); return symOf(e, name).id; };

const BASE = `LF nd : o → type =
  | ⊃I : (nd A → nd B) → nd (A ⊃ B)
  | ⊤I : nd ⊤
;
`;

// --- Deterministic stability (independent fresh engines) ----------------
const base = freshId(BASE, '⊃I');
const INSERT_BEFORE = `LF extra : type =\n  | e : extra\n;\n` + BASE;
const COMMENT_BEFORE = `% a fresh leading comment\n` + BASE;
const REFORMATTED = BASE.replace('  | ⊃I', '        |   ⊃I').replace('  | ⊤I', '        |   ⊤I');

expect(freshId(INSERT_BEFORE, '⊃I') === base, 'id must survive an unrelated declaration inserted before it');
expect(freshId(COMMENT_BEFORE, '⊃I') === base, 'id must survive a leading comment inserted before it');
expect(freshId(REFORMATTED, '⊃I') === base, 'id must survive reformatting');

// The structural key is position-independent and family-qualified.
const e0 = createSemanticEngine();
upd(e0, BASE);
expect(symOf(e0, '⊃I').structuralKey === 'nd/LFConstructor#⊃I',
  `unexpected structural key: ${symOf(e0, '⊃I').structuralKey}`);

// --- Same-named declarations stay distinct ------------------------------
const DUP = `LF a : type =\n  | c : a\n;\nLF b : type =\n  | c : b\n;\n`;
const eDup = createSemanticEngine();
upd(eDup, DUP);
const cs = eDup.debugSnapshot().symbols.filter((s) => s.name === 'c');
expect(cs.length === 2, `expected two 'c' symbols, got ${cs.length}`);
expect(new Set(cs.map((s) => s.id)).size === 2, 'same-named constructors in different families must not collapse');
expect(new Set(cs.map((s) => s.structuralKey)).size === 2, 'their structural keys must differ (family-qualified)');

// --- Persistent identity across renames (one engine, sequential edits) ---
const e1 = createSemanticEngine();
upd(e1, BASE);
const idBeforeRename = symOf(e1, '⊃I').id;
upd(e1, BASE.replace(/⊃I/g, 'impI'));
const idAfterRename = symOf(e1, 'impI').id;
expect(idAfterRename === idBeforeRename, 'a renamed declaration must keep its persistent id');

// --- Persistent identity across an unrelated insertion ------------------
const e2 = createSemanticEngine();
upd(e2, BASE);
const idBeforeInsert = symOf(e2, '⊃I').id;
upd(e2, INSERT_BEFORE);
expect(symOf(e2, '⊃I').id === idBeforeInsert, 'id must persist across an unrelated insertion edit');
// The newly inserted declaration is genuinely new (distinct id, not stolen).
expect(symOf(e2, 'e').id !== idBeforeInsert, 'a newly inserted declaration must receive its own id');

console.log('OK semantic identity v2 (insertion/comment/format stable, rename-persistent, duplicates distinct)');
