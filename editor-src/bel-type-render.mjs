// Parse a type string inside a synthetic wrapper and render bel-hl-* highlighted DOM.

import { highlightTree, tagHighlighter, tags as t } from '@lezer/highlight';
import { belugaLanguage } from './bel-language.mjs';

const WRAPPERS = {
  lf: { pre: 'LF _belj : type = | _c : ', post: ' ;' },
  comp: { pre: 'rec _belj : ', post: ' = ?;' },
};
const WRAPPER_ORDER = ['comp', 'lf'];

function wrapperKeyForKind(kind) {
  if (!kind) return null;
  const k = String(kind).toLowerCase();
  if (k === 'lf' || k.startsWith('lf-') || k.startsWith('lf ')) return 'lf';
  if (k === 'comp' || k.startsWith('comp')
    || k.includes('recursive') || k.includes('inductive')
    || k.includes('typedef') || k.includes('computation') || k.includes('schema')) {
    return 'comp';
  }
  return null;
}

function countErrors(tree) {
  let errs = 0;
  tree.iterate({ enter(n) { if (n.type.isError) errs += 1; } });
  return errs;
}

// Parse `text` in the best-fitting wrapper. Returns { tree, lo, hi } or null.
function parseWrapped(text, kind) {
  const hinted = wrapperKeyForKind(kind);
  const keys = hinted ? [hinted, ...WRAPPER_ORDER.filter((k) => k !== hinted)] : WRAPPER_ORDER;
  let best = null;
  for (const key of keys) {
    const w = WRAPPERS[key];
    const source = w.pre + text + w.post;
    let tree = null;
    try { tree = belugaLanguage.parser.parse(source); } catch (_) { tree = null; }
    if (!tree) continue;
    const errs = countErrors(tree);
    const cand = { tree, source, lo: w.pre.length, hi: w.pre.length + text.length, errs, hinted: key === hinted };
    if (errs === 0) return cand;
    if (!best || errs < best.errs || (errs === best.errs && cand.hinted && !best.hinted)) {
      best = cand;
    }
  }
  return best;
}

// Tag → stable class. Mirrors the editor's defaultBelugaHighlightStyle buckets
// (see bel-language.mjs), collapsed to the set that matters in type position.
const HIGHLIGHTER = tagHighlighter([
  { tag: t.keyword, class: 'bel-hl-keyword' },
  { tag: t.controlKeyword, class: 'bel-hl-control' },
  { tag: t.typeOperator, class: 'bel-hl-arrow' },
  { tag: t.operator, class: 'bel-hl-op' },
  { tag: t.definitionOperator, class: 'bel-hl-op' },
  { tag: t.special(t.typeName), class: 'bel-hl-metatype' },
  { tag: t.special(t.variableName), class: 'bel-hl-meta' },
  { tag: t.definition(t.special(t.typeName)), class: 'bel-hl-metatype' },
  { tag: t.definition(t.special(t.variableName)), class: 'bel-hl-meta' },
  { tag: t.definition(t.typeName), class: 'bel-hl-type-def' },
  { tag: t.definition(t.variableName), class: 'bel-hl-var-def' },
  { tag: t.definition(t.function(t.variableName)), class: 'bel-hl-ctor' },
  { tag: t.function(t.variableName), class: 'bel-hl-ctor' },
  { tag: t.local(t.variableName), class: 'bel-hl-local' },
  { tag: t.local(t.typeName), class: 'bel-hl-local' },
  { tag: t.typeName, class: 'bel-hl-type' },
  { tag: t.variableName, class: 'bel-hl-var' },
  { tag: t.number, class: 'bel-hl-number' },
  { tag: t.atom, class: 'bel-hl-atom' },
  { tag: t.propertyName, class: 'bel-hl-prop' },
  { tag: t.meta, class: 'bel-hl-meta-pragma' },
  { tag: [t.punctuation, t.paren, t.squareBracket, t.brace, t.angleBracket, t.separator],
    class: 'bel-hl-punct' },
]);

export function normalizeType(typeStr) {
  if (typeStr == null) return '';
  return String(typeStr)
    .replace(/\r\n?/g, '\n')
    // Beluga's Format boxes break block schemas at commas/parens; flatten those
    // without inserting a space (e.g. "m/q _\n," must become "m/q _," not "_ ,").
    .replace(/[ \t]*\n[ \t]*(?=[,;)\]}])/g, '')
    .replace(/([(\[{])[ \t]*\n[ \t]*/g, '$1')
    .replace(/[ \t]*\n[ \t]*/g, ' ')
    // The double quote is a reserved character in Beluga and can never appear
    // in a real type; when the checker's pretty-printer emits one around a
    // generated name (e.g. tm K1[] "i[]") it is a spurious artifact, so drop it.
    .replace(/"/g, '')
    // Canonicalise ASCII operators to the editor's display GLYPHS, so a goal type
    // from Beluga's text output reads exactly like the editor (which accepts both
    // forms — grammar `Turnstile { "|-" | "⊢" }` etc.). Order: hashed turnstile and
    // fat-arrow before their shorter prefixes.
    .replace(/\|-#/g, '⊢#')
    .replace(/\|-/g, '⊢')
    .replace(/=>/g, '⇒')
    .replace(/->/g, '→')
    // Dependent binders in source signatures often omit the space before the
    // following type head (`{x:name}linear`); the display formatter inserts it.
    .replace(/\}([A-Za-z_#])/g, '} $1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function highlightTypeFragment(typeStr, kind) {
  const text = normalizeType(typeStr);
  const frag = document.createDocumentFragment();
  if (!text) return frag;

  const fit = parseWrapped(text, kind);
  if (!fit) {
    frag.appendChild(document.createTextNode(text));
    return frag;
  }
  const { tree, source, lo, hi } = fit;

  let cursor = lo;
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

  highlightTree(tree, HIGHLIGHTER, (from, to, classes) => {
    const a = Math.max(from, lo);
    const b = Math.min(to, hi);
    if (b <= a) return;
    if (a > cursor) pushPlain(cursor, a);
    pushSpan(a, b, classes);
    cursor = b;
  }, lo, hi);

  if (cursor < hi) pushPlain(cursor, hi);

  if (!emitted) {
    frag.textContent = '';
    frag.appendChild(document.createTextNode(text));
  }
  return frag;
}

export function renderTypeInto(el, typeStr, kind) {
  el.textContent = '';
  el.appendChild(highlightTypeFragment(typeStr, kind));
  return el;
}
