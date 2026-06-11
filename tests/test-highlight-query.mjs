import { belugaLanguage } from '../editor-src/bel-language.mjs';
import { highlightTree, tagHighlighter, tags as t } from '@lezer/highlight';

const parser = belugaLanguage.parser;
const hi = tagHighlighter([
  { tag: t.meta, class: 'meta' },
  { tag: t.number, class: 'num' },
  { tag: t.propertyName, class: 'prop' },
  { tag: t.typeName, class: 'type' },
  { tag: t.typeOperator, class: 'arrow' },
  { tag: t.definitionOperator, class: 'colon' },
]);

function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

function hits(src) {
  const out = [];
  highlightTree(parser.parse(src), hi, (f, to, cls) => {
    out.push({ text: src.slice(f, to), cls });
  });
  return out;
}

function has(h, text, cls) {
  return h.some((x) => x.text === text && x.cls === cls);
}

// Real Beluga-W examples (test_constructors.bel)
const q1 = '--query 1 * D : oft (suc (suc z)) T.';
const h1 = hits(q1);
expect(has(h1, '--query', 'meta'), '--query directive');
expect(has(h1, '1', 'num'), 'expected solutions');
expect(has(h1, '*', 'num'), 'max tries');
expect(has(h1, 'D', 'prop'), 'solution metavar label');
expect(has(h1, ':', 'colon'), 'label colon');
expect(has(h1, 'oft', 'type'), 'predicate head');
expect(has(h1, 'T', 'type'), 'type metavar');

const q2 = '--query * 5 P : oft X nat -> oft (suc X) nat.';
const h2 = hits(q2);
expect(has(h2, 'P', 'prop'), 'label P');
expect(has(h2, '->', 'arrow'), 'comp arrow in query goal');
expect(has(h2, 'nat', 'type'), 'nat type');

// Label required before colon (Beluga parser rejects bare `--query N * : goal.`)
const q3 = '--query 1 * Q : oft (suc z) T.';
const h3 = hits(q3);
expect(has(h3, 'oft', 'type'), 'labeled goal parses');
expect(has(h3, 'Q', 'prop'), 'solution label');
expect(has(h3, ':', 'colon'), 'label colon');

// Parse tree: zero error nodes on real queries
for (const src of [q1, q2, q3]) {
  let errs = 0;
  parser.parse(src).iterate({
    enter(n) { if (n.type.isError && n.from < n.to) errs++; },
  });
  expect(errs === 0, `parse errors in ${src}`);
}

console.log('OK query pragma handling');
