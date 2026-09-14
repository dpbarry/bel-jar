// Full-file Beluga source → jar-hl-* highlighted DOM (read-only preview).

import { highlightTree, tagHighlighter, tags as t } from '@lezer/highlight';
import { syntaxTree } from '@codemirror/language';
import { belugaLanguage, holeTag } from '../language.mjs';

import { maybeExpandBelAliases } from '../aliases.mjs';

const SOURCE_HIGHLIGHTER = tagHighlighter([
  { tag: holeTag, class: 'jar-hl-hole' },
  { tag: t.keyword, class: 'jar-hl-keyword' },
  { tag: t.controlKeyword, class: 'jar-hl-control' },
  { tag: t.typeOperator, class: 'jar-hl-arrow' },
  { tag: t.operator, class: 'jar-hl-op' },
  { tag: t.definitionOperator, class: 'jar-hl-op' },
  { tag: t.arithmeticOperator, class: 'jar-hl-op' },
  { tag: t.special(t.typeName), class: 'jar-hl-metatype' },
  { tag: t.special(t.variableName), class: 'jar-hl-meta' },
  { tag: t.definition(t.special(t.typeName)), class: 'jar-hl-metatype' },
  { tag: t.definition(t.special(t.variableName)), class: 'jar-hl-meta' },
  { tag: t.definition(t.typeName), class: 'jar-hl-type-def' },
  { tag: t.definition(t.variableName), class: 'jar-hl-var-def' },
  { tag: t.definition(t.function(t.variableName)), class: 'jar-hl-ctor' },
  { tag: t.definition(t.local(t.variableName)), class: 'jar-hl-local' },
  { tag: t.definition(t.local(t.typeName)), class: 'jar-hl-meta' },
  { tag: t.function(t.variableName), class: 'jar-hl-ctor' },
  { tag: t.local(t.variableName), class: 'jar-hl-local' },
  { tag: t.local(t.typeName), class: 'jar-hl-local' },
  { tag: t.typeName, class: 'jar-hl-type' },
  { tag: t.variableName, class: 'jar-hl-var' },
  { tag: t.namespace, class: 'jar-hl-prop' },
  { tag: t.number, class: 'jar-hl-number' },
  { tag: t.atom, class: 'jar-hl-atom' },
  { tag: t.propertyName, class: 'jar-hl-prop' },
  { tag: t.meta, class: 'jar-hl-meta-pragma' },
  { tag: t.modifier, class: 'jar-hl-meta-pragma' },
  { tag: [t.lineComment, t.blockComment], class: 'jar-hl-comment' },
  { tag: [t.punctuation, t.paren, t.squareBracket, t.brace, t.angleBracket, t.separator],
    class: 'jar-hl-punct' },
]);

function normalizeSource(text) {
  if (text == null) return '';
  return maybeExpandBelAliases(String(text).replace(/\r\n?/g, '\n'));
}

function emitHighlighted(frag, source, tree, absBase = 0) {
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

  const absTo = absBase + source.length;
  highlightTree(tree, SOURCE_HIGHLIGHTER, (from, to, classes) => {
    if (to <= from) return;
    const a = Math.max(0, from - absBase);
    const b = Math.min(source.length, to - absBase);
    if (b <= a) return;
    if (a > cursor) pushPlain(cursor, a);
    pushSpan(a, b, classes);
    cursor = b;
  }, absBase, absTo);

  if (cursor < source.length) pushPlain(cursor, source.length);
  if (!emitted) frag.appendChild(document.createTextNode(source));
  return frag;
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
  return emitHighlighted(frag, source, tree, 0);
}

/**
 * Highlight `[from, to)` in an editor document using the live syntax tree so
 * definition / local / ctor tags match the buffer (not a lone re-parse).
 * Pass `knownTree` when the caller already forced a complete parse.
 */
export function highlightDocRange(state, from, to, knownTree = null) {
  const frag = document.createDocumentFragment();
  if (!state?.doc || from == null || to == null) return frag;
  const lo = Math.max(0, from | 0);
  const hi = Math.min(state.doc.length, to | 0);
  if (hi <= lo) return frag;
  const source = state.doc.sliceString(lo, hi);
  let tree = knownTree;
  if (!tree) {
    try {
      tree = syntaxTree(state);
    } catch (_) {
      tree = null;
    }
  }
  if (!tree) {
    frag.appendChild(document.createTextNode(source));
    return frag;
  }
  return emitHighlighted(frag, source, tree, lo);
}

export function renderSourceInto(el, text, ext) {
  el.textContent = '';
  el.appendChild(highlightSourceFragment(text, ext));
  if (ext === 'elf') el.classList.add('jar-hl-source--elf');
  else el.classList.remove('jar-hl-source--elf');
  return el;
}
