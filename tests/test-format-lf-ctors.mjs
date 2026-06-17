import assert from 'node:assert/strict';
import { parser } from '../editor-src/beluga-parser.js';
import { formatString } from '../editor-src/bel-format.mjs';

const src = `LF nd : o → type =
  | ⊃E : nd (A ⊃ B) → nd A
  → nd B
  | ∨Il : nd A
  → nd (A ∨ B)
  | ∧I : nd A → nd B → nd (A ∧ B)
;
`;

const out = formatString(src, parser.parse(src));

const lines = out.split('\n');
const andLine = lines.find((l) => l.includes('∧I'));
const orIlFirst = lines.find((l) => l.includes('∨Il'));
const orIlCont = lines[orIlFirst ? lines.indexOf(orIlFirst) + 1 : -1];
const impEFirst = lines.find((l) => l.includes('⊃E'));
const impECont = lines[impEFirst ? lines.indexOf(impEFirst) + 1 : -1];

assert.ok(andLine && !andLine.includes('\n'), 'single-line arrow chain stays on one line');
assert.match(andLine, /nd A → nd B → nd/, '∧I stays one line');

if (orIlFirst && orIlCont) {
  const colonCol = orIlFirst.indexOf(':');
  const contStart = orIlCont.search(/\S/);
  assert.equal(
    contStart,
    colonCol,
    `continuation aligns with colon: got col ${contStart}, colon at ${colonCol}\n  ${orIlFirst}\n  ${orIlCont}`,
  );
}

if (impEFirst && impECont) {
  const colonCol = impEFirst.indexOf(':');
  const contStart = impECont.search(/\S/);
  assert.equal(contStart, colonCol, `⊃E continuation aligns with colon`);
}

console.log('OK format lf ctors');
