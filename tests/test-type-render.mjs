// Shared type renderer (bel-type-render.mjs): pins that a Beluga type STRING is
// parsed-and-highlighted into spans with stable bel-hl-* classes, and that the
// literal text round-trips (no characters dropped or reordered). Uses a tiny DOM
// shim so the renderer's document.* calls run under node.
import { normalizeType, highlightTypeFragment } from '../editor-src/bel-type-render.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// --- minimal DOM shim (document.createElement / createDocumentFragment / TextNode) ---
function makeNode(kind) {
  return {
    nodeKind: kind,
    className: '',
    _text: '',
    children: [],
    set textContent(v) { this._text = v == null ? '' : String(v); this.children = []; },
    get textContent() {
      if (this.children.length) return this.children.map((c) => c.textContent).join('');
      return this._text;
    },
    appendChild(c) { this.children.push(c); return c; },
  };
}
globalThis.document = {
  createElement: () => makeNode('el'),
  createDocumentFragment: () => makeNode('frag'),
  createTextNode: (t) => { const n = makeNode('text'); n._text = String(t); return n; },
};

// Flatten a fragment into [{text, cls}] leaves.
function leaves(node, out = []) {
  if (node.nodeKind === 'text') {
    if (node._text) out.push({ text: node._text, cls: null });
  } else if (node.nodeKind === 'el') {
    if (node.children.length) node.children.forEach((c) => leaves(c, out));
    else if (node._text) out.push({ text: node._text, cls: node.className });
  } else {
    node.children.forEach((c) => leaves(c, out));
  }
  return out;
}

// --- normalizeType ---
expect(normalizeType('  a  →  b ') === 'a → b', 'normalizeType collapses spaces');
expect(normalizeType('a -> b') === 'a → b', 'normalizeType converts -> to →');
expect(normalizeType('a →\n   b') === 'a → b', 'normalizeType joins wrapped lines');
expect(normalizeType(null) === '', 'normalizeType tolerates null');

// --- a realistic comp type (from the screenshots) ---
const T1 = '(tm Ka A → pat Kb B Kc C) → type';
const frag1 = highlightTypeFragment(T1);
const lv1 = leaves(frag1);
expect(lv1.length > 0, 'highlightTypeFragment emits leaves');
// Literal text must round-trip exactly.
expect(lv1.map((l) => l.text).join('') === normalizeType(T1),
  `rendered text must equal the normalized type, got "${lv1.map((l) => l.text).join('')}"`);
// At least some leaves are highlighted spans (not all plain text).
expect(lv1.some((l) => l.cls && l.cls.startsWith('bel-hl-')),
  'at least one leaf carries a bel-hl-* class');
// The trailing "type" keyword is highlighted as a keyword.
expect(lv1.some((l) => l.text === 'type' && l.cls === 'bel-hl-keyword'),
  '"type" renders as a keyword');
// Type-family heads are highlighted as type names.
expect(lv1.some((l) => l.text === 'tm' && l.cls === 'bel-hl-type'),
  'a type-family head renders as bel-hl-type');
// Arrows are coloured (the renderer colours bare arrows the grammar misses).
expect(lv1.some((l) => l.text === '→' && l.cls === 'bel-hl-arrow'),
  'arrows render as bel-hl-arrow');

// Turnstile in contextual types; parameter binder in dependent type
const T3 = '{#p:[Δ ⊢ tm K[] A[]]} → type';
const lv3 = leaves(highlightTypeFragment(T3));
expect(lv3.some((l) => (l.text === '⊢' || l.text === '|-') && l.cls === 'bel-hl-control'),
  'turnstile renders as bel-hl-control');
expect(lv3.some((l) => l.text === '#p' && l.cls === 'bel-hl-meta'),
  '#p parameter binder renders as bel-hl-meta');
expect(lv3.some((l) => l.text === '→' && l.cls === 'bel-hl-arrow'),
  'binder type arrow renders as bel-hl-arrow');

// --- an implicit-heavy type with binders ---
const T2 = '({x:tm K _} {y:tm K _} msf (\\z. M z x y)) → pmsf (\\z. pat/pair (M z))';
const lv2 = leaves(highlightTypeFragment(T2));
expect(lv2.map((l) => l.text).join('') === normalizeType(T2),
  'implicit-heavy type text round-trips exactly');
expect(lv2.some((l) => l.cls && l.cls.startsWith('bel-hl-')),
  'implicit-heavy type gets highlighted');

// --- empty / degenerate input never throws and yields empty/plain ---
expect(leaves(highlightTypeFragment('')).length === 0, 'empty type yields no leaves');

// --- kind hint selects the parse context so colours match the editor ---
// An LF type's args colour as constructors/meta-vars; a comp type's args as type
// names. The SAME string must honour the hint. (Drift fix: tooltip/inspector now
// pass the symbol kind so LF types stop being mis-coloured as comp types.)
const LFT = 'nd (A ⊃ B)';
const lfLeaves = leaves(highlightTypeFragment(LFT, 'lf-constructor'));
const compLeaves = leaves(highlightTypeFragment(LFT, 'comp-type'));
const clsOf = (lv, txt) => (lv.find((l) => l.text === txt) || {}).cls;
// In LF context, the argument A is a meta-variable; in comp context it's a type.
expect(clsOf(lfLeaves, 'A') === 'bel-hl-meta',
  `LF-kind hint colours argument A as a meta-var (got ${clsOf(lfLeaves, 'A')})`);
expect(clsOf(compLeaves, 'A') === 'bel-hl-type',
  `comp-kind hint colours argument A as a type name (got ${clsOf(compLeaves, 'A')})`);
// The head `nd` is a type name in both.
expect(clsOf(lfLeaves, 'nd') === 'bel-hl-type', 'LF head nd is a type name');
// Text round-trips regardless of hint.
expect(lfLeaves.map((l) => l.text).join('') === normalizeType(LFT), 'LF-hinted text round-trips');

console.log('OK type render (normalizeType, highlight spans, round-trip, kind-aware LF vs comp colouring)');
