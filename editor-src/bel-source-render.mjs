// Full-file Beluga source → bel-hl-* highlighted DOM (read-only preview).

import { highlightTree, tagHighlighter, tags as t } from '@lezer/highlight';
import { belugaLanguage, holeTag } from './bel-language.mjs';

import { expandBelAliases } from './bel-aliases.mjs';

const SOURCE_HIGHLIGHTER = tagHighlighter([
  { tag: holeTag, class: 'bel-hl-hole' },
  { tag: t.keyword, class: 'bel-hl-keyword' },
  { tag: t.controlKeyword, class: 'bel-hl-control' },
  { tag: t.typeOperator, class: 'bel-hl-arrow' },
  { tag: t.operator, class: 'bel-hl-op' },
  { tag: t.definitionOperator, class: 'bel-hl-op' },
  { tag: t.arithmeticOperator, class: 'bel-hl-op' },
  { tag: t.special(t.typeName), class: 'bel-hl-metatype' },
  { tag: t.special(t.variableName), class: 'bel-hl-meta' },
  { tag: t.definition(t.special(t.typeName)), class: 'bel-hl-metatype' },
  { tag: t.definition(t.special(t.variableName)), class: 'bel-hl-meta' },
  { tag: t.definition(t.typeName), class: 'bel-hl-type-def' },
  { tag: t.definition(t.variableName), class: 'bel-hl-var-def' },
  { tag: t.definition(t.function(t.variableName)), class: 'bel-hl-ctor' },
  { tag: t.definition(t.local(t.variableName)), class: 'bel-hl-local' },
  { tag: t.definition(t.local(t.typeName)), class: 'bel-hl-meta' },
  { tag: t.function(t.variableName), class: 'bel-hl-ctor' },
  { tag: t.local(t.variableName), class: 'bel-hl-local' },
  { tag: t.local(t.typeName), class: 'bel-hl-local' },
  { tag: t.typeName, class: 'bel-hl-type' },
  { tag: t.variableName, class: 'bel-hl-var' },
  { tag: t.namespace, class: 'bel-hl-prop' },
  { tag: t.number, class: 'bel-hl-number' },
  { tag: t.atom, class: 'bel-hl-atom' },
  { tag: t.propertyName, class: 'bel-hl-prop' },
  { tag: t.meta, class: 'bel-hl-meta-pragma' },
  { tag: t.modifier, class: 'bel-hl-meta-pragma' },
  { tag: [t.lineComment, t.blockComment], class: 'bel-hl-comment' },
  { tag: [t.punctuation, t.paren, t.squareBracket, t.brace, t.angleBracket, t.separator],
    class: 'bel-hl-punct' },
]);

function normalizeSource(text) {
  if (text == null) return '';
  return expandBelAliases(String(text).replace(/\r\n?/g, '\n'));
}

export function highlightSourceFragment(text) {
  const source = normalizeSource(text);
  const frag = document.createDocumentFragment();
  if (!source) return frag;

  let tree = null;
  try {
    tree = belugaLanguage.parser.parse(source);
  } catch (_) {
    tree = null;
  }
  if (!tree) {
    frag.appendChild(document.createTextNode(source));
    return frag;
  }

  let cursor = 0;
  let emitted = false;

  function pushPlain(from, to) {
    if (to <= from) return;
    frag.appendChild(document.createTextNode(source.slice(from, to)));
  }
  function pushSpan(from, to, cls) {
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = source.slice(from, to);
    frag.appendChild(span);
    emitted = true;
  }

  highlightTree(tree, SOURCE_HIGHLIGHTER, (from, to, classes) => {
    if (to <= from) return;
    if (from > cursor) pushPlain(cursor, from);
    pushSpan(from, to, classes);
    cursor = to;
  });

  if (cursor < source.length) pushPlain(cursor, source.length);

  if (!emitted) {
    frag.appendChild(document.createTextNode(source));
  }
  return frag;
}

export function renderSourceInto(el, text, ext) {
  el.textContent = '';
  el.appendChild(highlightSourceFragment(text, ext));
  if (ext === 'elf') el.classList.add('bel-hl-source--elf');
  else el.classList.remove('bel-hl-source--elf');
  return el;
}
