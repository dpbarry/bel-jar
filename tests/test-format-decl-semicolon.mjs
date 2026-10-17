import assert from 'node:assert/strict';
import { parser } from '../js/editor-src/beluga-parser.js';
import { formatString } from '../js/editor-src/format/document-format.mjs';

const src = `rec f : [ ⊢ tm] → [ ⊢ tm] =
  lem4-closure-exp LrmRmVQ
    (concat↦* [Φ ⊢ ↦*/step (↦/match/K ▷/pair) ↦*/refl])
;
`;

const out = formatString(src, parser.parse(src));
assert.match(out, /↦\*\/refl \]\)\n;/, 'declaration ; on its own line');
assert.ok(!/refl\s*\]\);/.test(out), 'semicolon must not fold onto expression line');

const totSrc = 'rec f : nat = / total 1 / fn x => x;\n';
const totWant = 'rec f : nat =\n  / total 1 /\n  fn x => x\n;\n';
assert.equal(formatString(totSrc, parser.parse(totSrc)), totWant, 'totality takes its own line');
assert.equal(
  formatString(totSrc, parser.parse(totSrc), { printWidth: 1e9 }),
  totWant,
  'unlimited width keeps the totality break',
);

console.log('OK format decl semicolon');
