import { belugaLanguage } from '../js/editor-src/language.mjs';
import { highlightTree, tagHighlighter, tags as t } from '@lezer/highlight';

const parser = belugaLanguage.parser;
const hi = tagHighlighter([
  { tag: t.meta, class: 'meta' },
  { tag: t.propertyName, class: 'prop' },
  { tag: t.namespace, class: 'ns' },
  { tag: t.modifier, class: 'mod' },
  { tag: t.function(t.variableName), class: 'fn' },
  { tag: t.number, class: 'num' },
  { tag: t.typeName, class: 'type' },
  { tag: t.variableName, class: 'var' },
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

function hasCls(h, text, cls) {
  return h.some((x) => x.text.includes(text) && x.cls === cls);
}

// --name: subject (prop) + preferred meta name (mod, not type)
{
  const h = hits('tp : mode → type. --name tp A.');
  expect(has(h, '--name', 'meta'), '--name directive is meta');
  expect(has(h, 'tp', 'prop'), 'name pragma subject tp is propertyName');
  expect(has(h, 'A', 'mod'), 'name pragma preferred name A is modifier');
  expect(!has(h, 'A', 'type'), 'name pragma A must not be typeName');
}

{
  let errs = 0;
  parser.parse('--name exp E x.').iterate({
    enter(n) { if (n.type.isError && n.from < n.to) errs++; },
  });
  expect(errs === 0, '--name exp E x. parses');
}

// --infix: operator (fn) + precedence (num) + associativity (mod via inherit)
{
  const h = hits('--infix ⊃ 5 right.');
  expect(has(h, '--infix', 'meta'), '--infix directive is meta');
  expect(has(h, '⊃', 'fn'), 'infix operator is function');
  expect(has(h, '5', 'num'), 'infix precedence is number');
  expect(has(h, 'right', 'mod'), 'infix associativity is modifier');
}

// --prefix
{
  const h = hits('--prefix foo 3.');
  expect(has(h, 'foo', 'fn'), 'prefix operator is function');
  expect(has(h, '3', 'num'), 'prefix precedence is number');
}

// --open / --abbrev
{
  const ho = hits('--open MyModule.');
  expect(has(ho, 'MyModule', 'ns'), 'open module is namespace');
  const ha = hits('--abbrev FullName Short.');
  expect(has(ha, 'FullName', 'ns'), 'abbrev module is namespace');
  expect(has(ha, 'Short', 'ns'), 'abbrev alias is namespace');
}

// --opaque
{
  const h = hits('--opaque secret.');
  expect(has(h, 'secret', 'prop'), 'opaque subject is propertyName');
}

// --assoc
{
  const h = hits('--assoc left.');
  expect(has(h, '--assoc', 'meta'), '--assoc directive is meta');
  expect(has(h, 'left', 'mod'), 'assoc value is modifier');
}

// flag pragmas
for (const kw of ['--not', '--nostrengthen', '--coverage', '--warncoverage']) {
  const h = hits(kw + '.');
  expect(hasCls(h, kw, 'meta'), `${kw} is meta`);
}

// --query: bounds, optional label, comp-type goal (real Beluga LP syntax)
{
  const h = hits('--query * 5 P : oft X nat -> oft (suc X) nat.');
  expect(has(h, '--query', 'meta'), '--query directive is meta');
  expect(has(h, '*', 'num'), 'query * bound is number');
  expect(has(h, '5', 'num'), 'query numeric bound is number');
  expect(has(h, 'P', 'prop'), 'query label is propertyName');
  expect(has(h, '->', 'arrow'), 'query goal arrow is typeOperator');
}

console.log('OK pragma highlighting');
