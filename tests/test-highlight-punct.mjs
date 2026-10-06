import { belugaLanguage, holeTag } from '../js/editor-src/language.mjs';
import { highlightTree, tagHighlighter, tags as t } from '@lezer/highlight';

const parser = belugaLanguage.parser;
const hi = tagHighlighter([
  { tag: t.keyword, class: 'keyword' },
  { tag: t.typeOperator, class: 'typeOp' },
  { tag: t.controlKeyword, class: 'control' },
  { tag: t.operator, class: 'op' },
  { tag: t.separator, class: 'punct' },
  { tag: t.punctuation, class: 'punct' },
  { tag: t.paren, class: 'punct' },
  { tag: t.squareBracket, class: 'punct' },
  { tag: t.brace, class: 'punct' },
  { tag: t.angleBracket, class: 'punct' },
  { tag: t.definitionOperator, class: 'defOp' },
  { tag: t.propertyName, class: 'prop' },
  { tag: t.special(t.variableName), class: 'meta' },
  { tag: t.definition(t.local(t.variableName)), class: 'localDef' },
  { tag: t.number, class: 'num' },
  { tag: holeTag, class: 'hole' },
]);

function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

function hits(src) {
  const tree = parser.parse(src);
  let errs = 0;
  tree.iterate({ enter(n) { if (n.type.isError && n.from < n.to) errs++; } });
  expect(errs === 0, `parse errors in ${src}`);
  const out = [];
  highlightTree(tree, hi, (from, to, cls) => out.push({ text: src.slice(from, to), cls }));
  return out;
}

function cls(h, text) {
  const found = h.filter((x) => x.text === text);
  expect(found.length > 0, `missing token ${JSON.stringify(text)}`);
  return found.map((x) => x.cls);
}

function is(h, text, want) {
  const got = cls(h, text);
  expect(got.every((c) => c === want), `${JSON.stringify(text)} highlighted ${got.join(',')} wanted ${want}`);
}

function has(h, text, want) {
  expect(cls(h, text).includes(want), `${JSON.stringify(text)} missing ${want}`);
}

// Definition `=` is punctuation, the same class as brackets, commas, and bars.
{
  const programs = [
    'rec f : (nat) -> [g, x:tp |- tm] =\n/ total 1 /\nfn y => [ |- \\z. z];',
    'schema s = block (x:tp, y:tp) + tp;',
    'rec h : tp = [ |- <a; b>];',
    'rec p : tp * tp = ?;',
    'coinductive Stream : ctype = | hd : Stream :: tp;',
    'rec g : {X :: [ |- tp]} tp = ?;',
    'rec q : tp = [ |- b.x];',
    'rec r : #[g |- block (x:tm, _t: pred N[..] x)] = ?;',
  ];
  const h = programs.flatMap(hits);
  for (const text of ['=', '(', ')', '[', ']', '{', '}', '<', '>', ',', ';', '|', ':', '.', '/', '\\', '::', '+']) {
    is(h, text, 'punct');
  }
  is(h, 'total', 'keyword');
  is(h, '*', 'typeOp');
  is(h, '->', 'typeOp');
  is(h, '=>', 'typeOp');
  is(h, '|-', 'control');
  is(h, '#', 'op');
  is(h, '.x', 'prop');
  is(h, 'N[..]', 'meta');
  is(h, '?', 'hole');
  has(h, 'z', 'localDef');
  expect(!h.some((x) => x.text === '\\' && x.cls !== 'punct'), 'lambda backslash is punctuation');
  expect(!h.some((x) => x.cls === 'defOp'), '= is not a definition operator');
}

// A query bound `*` stays a number; its label colon is an ordinary colon.
{
  const src = '--query * 5 P : oft X nat.';
  const h = hits(src);
  is(h, '*', 'num');
  is(h, ':', 'punct');
}

console.log('OK highlight punctuation');
