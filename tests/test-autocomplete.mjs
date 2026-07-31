import { Text } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { beluga } from '../js/editor-src/language.mjs';
import { createSyntaxStore } from '../js/editor-src/semantic/syntax-store.mjs';
import {
  createSymbolStore,
  expectedNamespacesAt,
  expectedNamespacesForContext,
} from '../js/editor-src/semantic/symbol-store.mjs';
import { NAMESPACE } from '../js/editor-src/semantic/ids.mjs';
import {
  classifyCompletionSite,
  refKindFromPrefix,
} from '../js/editor-src/ide/completion/classify.mjs';
import { contributeIdents } from '../js/editor-src/ide/completion/contributors.mjs';
import { rankLookupItems } from '../js/editor-src/ide/completion/weigh.mjs';
import { fuzzyScore } from '../js/editor-src/ide/completion/fuzzy.mjs';
import { belCompletionSource, gatherCompletions } from '../js/editor-src/ide/completion/source.mjs';
  import {
  SNIPPETS,
  isCaseArmSlot,
} from '../js/editor-src/ide/completion/snippets.mjs';
import {
  decomposeContextual,
  typeCompatibleWithGoal,
} from '../js/editor-src/prover/hole-split.mjs';
import { defsOf, listGroupSymbols } from '../js/editor-src/semantic/project-prelude.mjs';
import { activeCfgResolver } from '../js/editor-src/semantic/development.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const DOC_ID = 'workspace://ac.bel';

function mkStore(src) {
  const doc = Text.of(src.split('\n'));
  const tree = parser.parse(doc.toString());
  const syntaxStore = createSyntaxStore({ documentId: DOC_ID });
  const syntax = syntaxStore.update(tree, doc, { documentId: DOC_ID });
  const symbols = createSymbolStore();
  symbols.update(syntax);
  return { doc, tree, syntax, symbols, syntaxStore, src };
}

function mkEngine(store, holes = []) {
  return {
    stores: { symbols: store.symbols, syntax: store.syntaxStore },
    getHoles: () => holes,
    getCheckerCode: () => store.src,
  };
}

function mkState(src) {
  return EditorState.create({ doc: src, extensions: [beluga()] });
}

// ── visibleSymbolsAt: scope + prefix-closed globals ─────────────────────────

{
  const src = [
    'LF nat : type =',
    '| z : nat',
    '| s : nat -> nat;',
    '',
    'rec id : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒',
    '  let y = x in',
    '  ?;',
  ].join('\n');
  const store = mkStore(src);
  const holePos = src.indexOf('?');
  expect(holePos >= 0, 'fixture has hole');

  const atHole = store.symbols.visibleSymbolsAt(holePos);
  const names = new Set(atHole.map((s) => s.name));
  expect(names.has('nat'), 'nat visible before hole');
  expect(names.has('z'), 'ctor z visible');
  expect(names.has('s'), 'ctor s visible');
  expect(names.has('id'), 'rec id visible');
  expect(names.has('x'), `fn param x in scope at hole; got ${[...names]}`);

  // Locals after their scope end: past the rec — use a position after `;` of rec
  // is still in file; x's scope is the FnExpression. Position before `fn` should
  // not see x.
  const beforeFn = src.indexOf('fn x');
  const early = store.symbols.visibleSymbolsAt(beforeFn);
  expect(!early.some((s) => s.name === 'x' && !s.isGlobal), 'x not visible before binder');
}

// ── namespace filter (LF type vs term) ───────────────────────────────────────

{
  expect(refKindFromPrefix('$S') === 'upper', 'substitution sigil preserves uppercase ref kind');
  expect(refKindFromPrefix('#p') === 'lower', 'parameter sigil preserves lowercase ref kind');
  expect(
    expectedNamespacesForContext('LFAtomicType', 'lower').has(NAMESPACE.LF_TYPE_FAMILY),
    'LF type wants type family',
  );
  expect(
    !expectedNamespacesForContext('LFAtomicType', 'lower').has(NAMESPACE.LF_CONSTRUCTOR),
    'LF type rejects constructors',
  );
  expect(
    expectedNamespacesForContext('LFAtomicTerm', 'lower').has(NAMESPACE.LF_CONSTRUCTOR),
    'LF term wants constructors',
  );

  const src = [
    'LF nat : type =',
    '| z : nat',
    '| s : nat -> nat;',
    '',
    'LF vec : nat -> type =',
    '| empty : vec z',
    '| cons : nat -> vec (s z);',
  ].join('\n');
  const store = mkStore(src);
  // Position inside `vec z` — the `z` is an LF term (index).
  const zInVec = src.lastIndexOf('z');
  const termNs = expectedNamespacesAt(store.tree, zInVec, 'lower');
  expect(termNs && termNs.has(NAMESPACE.LF_CONSTRUCTOR), 'z in vec z is term context');

  const filtered = store.symbols.visibleSymbolsAt(zInVec, { namespaces: termNs, refKind: 'lower' });
  const fnames = new Set(filtered.map((s) => s.name));
  expect(fnames.has('z'), 'ctor z in term filter');
  expect(fnames.has('s'), 'ctor s in term filter');
  expect(!fnames.has('nat') || filtered.every((s) => s.name !== 'nat' || s.namespace !== NAMESPACE.LF_TYPE_FAMILY),
    'type family nat filtered out of term slot when namespaces set');
  expect(!fnames.has('vec') || !termNs.has(NAMESPACE.LF_TYPE_FAMILY),
    'vec (type family) not in LF term namespaces');
  expect(!filtered.some((s) => s.namespace === NAMESPACE.LF_TYPE_FAMILY),
    'no type families under LF term namespace filter');
}

// ── weigher + fuzzy ─────────────────────────────────────────────────────────

{
  const items = [
    { label: 'succ', just: 2, scoreHints: { base: 10 } },
    { label: 's', just: 2, scoreHints: { base: 50 } },
    { label: 'nat', just: 2, scoreHints: { base: 40 } },
  ];
  const empty = rankLookupItems(items, '', 10);
  expect(empty[0].label === 's', 'empty query prefers higher base');

  const fuzzy = rankLookupItems(items, 's', 10);
  expect(fuzzy.some((i) => i.label === 's'), 'fuzzy keeps s');
  expect(fuzzy.every((i) => fuzzyScore('s', i.label)),
    'fuzzy drops non-matches');
  expect(!fuzzy.some((i) => i.label === 'nat'), 'nat does not fuzzy-match s');
  expect(fuzzy[0].label === 's', 'exact/prefix "s" beats "succ"');
}

{
  const items = [
    { label: 'identity', just: 2, scoreHints: { base: 40 } },
    { label: 'id', just: 2, scoreHints: { base: 40 } },
    { label: 'peerId', just: 2, kind: 'peer', source: 'peer', scoreHints: { base: 10 } },
  ];
  const ranked = rankLookupItems(items, 'id', 10);
  expect(ranked[0].label === 'id', 'exact match beats longer prefix');
}

// ── ident contributor + classifier ──────────────────────────────────────────

{
  const src = [
    'LF nat : type =',
    '| z : nat',
    '| s : nat -> nat;',
    '',
    'rec id : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒ x;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const xPos = src.lastIndexOf('x;') + 1; // on the body `x`
  const site = classifyCompletionSite(state, xPos, engine);
  expect(site.kind === 'ident', `site at body x is ident, got ${site.kind}`);
  expect(site.query === 'x' || site.query === '', `query around x, got ${JSON.stringify(site.query)}`);

  const idents = contributeIdents(
    { kind: 'ident', from: xPos, to: xPos, query: '', namespaces: null, refKind: 'lower' },
    engine,
    {
      activePath: 'classical-processes/cp_thrm.bel',
      getPeerSymbols: () => [
        {
          name: 'peerNat',
          fileName: 'classical-processes/cp_linear.bel',
          namespace: NAMESPACE.LF_TYPE_FAMILY,
          sourceText: 'type',
        },
        {
          name: 'other',
          fileName: 'examples/other.bel',
          namespace: NAMESPACE.LF_CONSTANT,
          sourceText: 'nat',
        },
      ],
    },
  );
  expect(idents.some((i) => i.label === 'nat'), 'ident contrib lists nat');
  expect(idents.some((i) => i.label === 'x'), 'ident contrib lists local x');
  const peerSame = idents.find((i) => i.label === 'peerNat');
  expect(peerSame && peerSame.signature === 'type' && !peerSame.detail,
    `peer shows its type, not a path, got ${JSON.stringify(peerSame)}`);
  const peerElse = idents.find((i) => i.label === 'other');
  expect(peerElse && peerElse.signature === 'nat' && !peerElse.detail,
    `peer shows its type, not a path, got ${JSON.stringify(peerElse)}`);
  expect(!contributeIdents(
    { kind: 'ident', from: xPos, to: xPos, query: '', namespaces: null, refKind: 'lower' },
    engine,
    { getPeerSymbols: () => [{ name: 'unclassifiedPeer', fileName: 'suite/peer.bel' }] },
  ).some((item) => item.label === 'unclassifiedPeer'), 'peer without namespace is withheld');

  const gathered = gatherCompletions(
    { kind: 'ident', from: xPos, to: xPos + 1, query: 'n', namespaces: null, refKind: 'lower' },
    engine,
    state,
    { getPeerSymbols: () => [], limit: 24 },
  );
  expect(gathered.some((i) => i.label === 'nat'), 'gatherCompletions fuzzy for n→nat');
  expect(!gathered.some((i) => i.label === 'z'), 'z does not match prefix n');
}

// ── implicit completion: predicted sites fire; binders decline ───────────────

{
  const src = [
    'LF nat : type =',
    '| z : nat;',
    '',
    'rec id : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒ x;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const xPos = src.lastIndexOf('x;') + 1;
  const source = belCompletionSource(engine, { getPeerSymbols: () => [] });
  const body = source({ state, pos: xPos, explicit: false });
  // Query is the finished token `x`; sole exact row is a no-op — popup hidden.
  expect(body === null,
    'finished exact-token singleton hides the popup');
  const emptyQuery = gatherCompletions(
    { ...classifyCompletionSite(state, xPos, engine), query: '' },
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(emptyQuery.some((item) => item.label === 'x'),
    'expression body empty query offers local x');
  expect(emptyQuery.some((item) => item.label === 'id'),
    'expression body still offers rec id — J3 reorders, never withholds');
  expect(!emptyQuery.some((item) => item.label === 'z'),
    'expression body empty query withholds ctor z');

  // Prefix of a longer name still offers completions.
  const prefixSrc = src.replace('fn x ⇒ x;', 'fn x ⇒ i;');
  const prefixStore = mkStore(prefixSrc);
  const prefixEngine = mkEngine(prefixStore);
  const prefixState = mkState(prefixSrc);
  const iPos = prefixSrc.lastIndexOf('i;') + 1;
  const prefixSource = belCompletionSource(prefixEngine, { getPeerSymbols: () => [] });
  const prefixBody = prefixSource({ state: prefixState, pos: iPos, explicit: false });
  expect(prefixBody && prefixBody.options.some((item) => item.label === 'id'),
    'prefix query still offers matching completions');
  expect(!prefixBody.options.some((item) => item.label === 'z'),
    'expression body withholds LF constructors');

  const binderPos = src.indexOf('fn x') + 3; // on the binder name
  expect(classifyCompletionSite(state, binderPos, engine).kind === 'none',
    'fn param binder declines');
  expect(source({ state, pos: binderPos, explicit: false }) === null,
    'implicit completion declines at binder');

  const typeSrc = 'LF nat : type = | z : nat;\nLF vec : na';
  const typeStore = mkStore(typeSrc);
  const typeState = mkState(typeSrc);
  const typeSource = belCompletionSource(mkEngine(typeStore), { getPeerSymbols: () => [] });
  const typed = typeSource({ state: typeState, pos: typeSrc.length, explicit: true });
  expect(typed && typed.options.some((item) => item.label === 'nat'),
    'type site offers type families');
  expect(!typed.options.some((item) => item.label === 'z'),
    'type site withholds constructors even when explicitly invoked');
}

// ── classifier: comments decline; holes are Harpoon's (autocomplete declines) ─

{
  const src = '% comment\nLF nat : type.\nfn x ⇒ ?;\n';
  const store = mkStore(src);
  const holePos = src.indexOf('?');
  const engine = mkEngine(store);
  const state = mkState(src);
  const commentPos = src.indexOf('comment');
  expect(classifyCompletionSite(state, commentPos, engine).kind === 'none', 'comment → none');
  expect(classifyCompletionSite(state, holePos, engine).kind === 'none',
    'bare hole → none (Harpoon owns holes)');
}

{
  const src = 'fn x ⇒ ?goal;\n';
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const onName = src.indexOf('goal') + 2;
  expect(classifyCompletionSite(state, onName, engine).kind === 'none',
    'named hole ?goal → none');
}

// ── defsOf carries namespace for peer filters ────────────────────────────────

{
  const defs = defsOf('LF nat : type = | z : nat | s : nat -> nat;\n');
  const nat = defs.find((d) => d.name === 'nat');
  const z = defs.find((d) => d.name === 'z');
  expect(nat && nat.namespace === NAMESPACE.LF_TYPE_FAMILY, 'nat is type family');
  expect(z && z.namespace === NAMESPACE.LF_CONSTRUCTOR, 'z is constructor');
}

// ── P1: peers respect expectedNamespaces (ctors out of LF type slots) ───────

{
  const src = [
    'LF nat : type =',
    '| z : nat',
    '| s : nat -> nat;',
    '',
    'LF vec : nat -> type =',
    '| empty : vec z;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const typeNs = expectedNamespacesForContext('LFAtomicType', 'lower');
  expect(typeNs.has(NAMESPACE.LF_TYPE_FAMILY), 'type ns has families');
  expect(!typeNs.has(NAMESPACE.LF_CONSTRUCTOR), 'type ns excludes ctors');

  const idents = contributeIdents(
    {
      kind: 'ident',
      from: src.indexOf('vec'),
      to: src.indexOf('vec') + 3,
      query: '',
      namespaces: typeNs,
      refKind: 'lower',
    },
    engine,
    {
      activePath: 'suite/proof.bel',
      getPeerSymbols: () => [
        { name: 'peerFam', fileName: 'suite/types.bel', namespace: NAMESPACE.LF_TYPE_FAMILY },
        { name: 'z', fileName: 'suite/types.bel', namespace: NAMESPACE.LF_CONSTRUCTOR },
        { name: 'peerCtor', fileName: 'suite/types.bel', namespace: NAMESPACE.LF_CONSTRUCTOR },
      ],
    },
  );
  expect(idents.some((i) => i.label === 'peerFam' && i.source === 'peer'), 'peer type family kept');
  expect(!idents.some((i) => i.label === 'peerCtor'), 'peer ctor filtered from type slot');
  expect(!idents.some((i) => i.label === 'z' && i.source === 'peer'), 'peer z ctor filtered');
}

// ── P2: proximity prefers nearer decls over later-in-file ───────────────────

{
  const items = [
    {
      label: 'far',
      just: 2,
      scoreHints: { base: 40, proximity: Math.max(0, 15 - Math.min(15, Math.floor(Math.abs(0 - 2000) / 200))) },
    },
    {
      label: 'near',
      just: 2,
      scoreHints: { base: 40, proximity: Math.max(0, 15 - Math.min(15, Math.floor(Math.abs(1900 - 2000) / 200))) },
    },
  ];
  const ranked = rankLookupItems(items, '', 10);
  expect(ranked[0].label === 'near', `proximity ranks nearer first, got ${ranked[0].label}`);
}

// ── Phase 2: AtomicPattern / ContextHead / TotalityCall / Observation ───────

{
  expect(
    expectedNamespacesForContext('AtomicPattern', 'lower').has(NAMESPACE.LF_CONSTRUCTOR),
    'pattern site wants LF constructors',
  );
  expect(
    expectedNamespacesForContext('AtomicPattern', 'lower').has(NAMESPACE.COMP_CONSTRUCTOR),
    'pattern site wants comp constructors',
  );
  expect(
    !expectedNamespacesForContext('AtomicPattern', 'lower').has(NAMESPACE.LF_TYPE_FAMILY),
    'pattern site rejects type families',
  );
  expect(
    expectedNamespacesForContext('TotalityCall', 'lower').has(NAMESPACE.REC_FUNCTION),
    'totality args want rec functions',
  );
  expect(
    expectedNamespacesForContext('Observation', 'upper').has(NAMESPACE.COMP_CONSTRUCTOR),
    'observation wants destructors/ctors',
  );
  expect(
    expectedNamespacesForContext('ContextHead', 'lower').size === 0,
    'context head is locals-only (empty global set)',
  );
  expect(
    expectedNamespacesForContext('AtomicExpression', 'lower').has(NAMESPACE.REC_FUNCTION),
    'expression heads want rec functions',
  );
}

{
  const src = [
    'LF nat : type =',
    '| z : nat',
    '| s : nat -> nat;',
    '',
    'inductive Box : ctype =',
    '| Mk : [⊢ nat] → Box;',
    '',
    'rec id : [⊢ nat] → [⊢ nat] =',
    '/ total id (id) /',
    'fn x ⇒',
    'case x of',
    '| z ⇒ z',
    '| s y ⇒ y;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);

  const patZ = src.indexOf('| z ⇒') + 2;
  const patSite = classifyCompletionSite(state, patZ, engine);
  expect(patSite.kind === 'ident' && patSite.maxJust === 3, 'pattern z is J3 ident (scrutinee type)');
  expect(patSite.expectedType === '[⊢ nat]', `pattern expectedType, got ${patSite.expectedType}`);
  expect(patSite.namespaces && patSite.namespaces.has(NAMESPACE.LF_CONSTRUCTOR),
    'pattern predicts constructors');
  const patItems = gatherCompletions(
    { ...patSite, query: '' },
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(patItems.some((i) => i.label === 'z'), 'pattern offers ctor z');
  expect(patItems.some((i) => i.label === 's'), 'pattern offers ctor s');
  // Goal-matching ctors are promoted; non-matching ones stay at J2 rather than
  // being deleted, so assert on the promotion, not on the whole list.
  expect(patItems.find((i) => i.label === 'z').just === 3, 'ctor z promoted to J3');
  expect(patItems.find((i) => i.label === 's').just === 3, 'ctor s promoted to J3');
  expect(!patItems.some((i) => i.label === 'nat'), 'pattern withholds type family nat');
  expect(!patItems.some((i) => i.label === 'id'), 'pattern withholds rec id');
  expect(gatherCompletions(patSite, engine, state, { getPeerSymbols: () => [] })
    .some((i) => i.label === 'z'), 'pattern prefix z keeps ctor z');
  expect(!gatherCompletions(patSite, engine, state, { getPeerSymbols: () => [] })
    .some((i) => i.label === 's'), 'pattern prefix z drops ctor s');

  const binderY = src.indexOf('s y') + 2;
  expect(classifyCompletionSite(state, binderY, engine).kind === 'none'
    || !gatherCompletions(
      { ...classifyCompletionSite(state, binderY, engine), query: 'y' },
      engine,
      state,
      { getPeerSymbols: () => [] },
    ).some((i) => i.label === 'nat'),
    'pattern variable position does not offer type families');

  // Totality: `(id)` inside `/ total id (id) /`
  const totPos = src.lastIndexOf('(id)') + 2;
  const totSite = classifyCompletionSite(state, totPos, engine);
  expect(totSite.namespaces && totSite.namespaces.has(NAMESPACE.REC_FUNCTION),
    `totality predicts rec, got namespaces=${totSite.namespaces && [...totSite.namespaces]} kind=${totSite.kind}`);
  const totItems = gatherCompletions(totSite, engine, state, { getPeerSymbols: () => [] });
  expect(totItems.some((i) => i.label === 'id'), 'totality offers rec id');
  expect(!totItems.some((i) => i.label === 'z'), 'totality withholds ctor z');
}

{
  const src = [
    'LF nat : type =',
    '| z : nat;',
    'rec id : [⊢ nat] → [⊢ nat] = fn x ⇒ x;',
    'schema ctx = block (x:nat);',
    'rec descend : (g:ctx) [g ⊢ nat] → [g ⊢ nat] =',
    '/ total x (descend g x) /',
    'mlam g ⇒ fn x ⇒ id x;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const measure = src.indexOf('/ total x') + '/ total '.length;
  const gArg = src.indexOf(' g x)', measure) + 1;
  const xArg = src.indexOf(' x)', gArg) + 1;
  for (const [pos, name] of [[measure, 'x'], [gArg, 'g'], [xArg, 'x']]) {
    const site = classifyCompletionSite(state, pos, engine);
    const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => [] });
    expect(site.allowLocals, `totality parameter site allows locals at ${pos}`);
    expect(items.some((i) => i.label === name),
      `totality parameter ${name} completes at ${pos}, got ${items.map((i) => i.label)}`);
  }
}

{
  // Context head: `g` in `[g ⊢ nat]` — locals-only (schema-bound context var).
  const src = [
    'schema ctx = block (x:nat);',
    'rec f : {g:ctx} [g ⊢ nat] → [g ⊢ nat] =',
    'mlam g ⇒ fn x ⇒ x;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  // Second `[g ⊢` in the return type — context head reference.
  const first = src.indexOf('[g ⊢');
  const gPos = src.indexOf('[g ⊢', first + 1) + 1;
  const site = classifyCompletionSite(state, gPos, engine);
  expect(site.kind === 'ident' && site.localsOnly, `context head locals-only, got ${JSON.stringify({
    kind: site.kind, localsOnly: site.localsOnly, maxJust: site.maxJust,
  })}`);
  const items = gatherCompletions(site, engine, state, {
    getPeerSymbols: () => [
      { name: 'peerRec', fileName: 'other.bel', namespace: NAMESPACE.REC_FUNCTION },
    ],
  });
  expect(!items.some((i) => i.label === 'peerRec'), 'context head withholds peer globals');
  expect(!items.some((i) => i.label === 'nat'), 'context head withholds type family');
}

// ── Phase 3: type-directed filtering (J3) ───────────────────────────────────

{
  const src = [
    'LF nat : type =',
    '| z : nat',
    '| s : nat -> nat -> nat;',
    '',
    'rec id : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒',
    'case x of',
    '| z ⇒ z',
    '| s y ⇒ y;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const patZ = src.indexOf('| z ⇒') + 2;
  const site = classifyCompletionSite(state, patZ, engine);
  expect(site.maxJust === 3 && site.expectedType === '[⊢ nat]',
    `case pattern gets scrutinee type, got ${site.expectedType}`);
  const items = gatherCompletions({ ...site, query: '' }, engine, state, { getPeerSymbols: () => [] });
  expect(items.find((i) => i.label === 'z').just === 3, 'goal-matching ctor promoted to J3');
  expect(!items.some((i) => i.label === 'nat'), 'namespace withholds type family');
  expect(!items.some((i) => i.label === 'id'), 'namespace withholds rec id');
}

{
  const src = [
    'LF nat : type =',
    '| z : nat',
    '| s : nat -> nat;',
    '',
    'LF vec : nat -> type =',
    '| empty : vec z',
    '| cons : nat -> vec (s z);',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const zPos = src.lastIndexOf('z');
  const site = classifyCompletionSite(state, zPos, engine);
  expect(site.maxJust === 3 && site.expectedType === 'nat',
    `LF index slot gets nat, got ${site.expectedType}`);
  const items = gatherCompletions({ ...site, query: '' }, engine, state, { getPeerSymbols: () => [] });
  expect(items.some((i) => i.label === 'z'), 'nat-index offers z');
  expect(items.some((i) => i.label === 's'), 'nat-index offers s');
  expect(!items.some((i) => i.label === 'vec'), 'nat-index withholds vec family');
  // `empty : vec z` does not fit a nat index, but J3 ranks rather than deletes:
  // it stays available and sorts below the nat-headed constructors.
  const rankOf = (name) => items.findIndex((i) => i.label === name);
  expect(rankOf('z') < rankOf('empty') && rankOf('s') < rankOf('empty'),
    `nat ctors outrank the vec ctor, got ${items.map((i) => i.label)}`);
}

{
  const src = [
    'schema ctx = block (x:nat);',
    'rec must_appear : (g : ctx) [g ⊢ nat] → [ ⊢ nat] =',
    'fn linP ⇒ case linP of | z ⇒ z;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const gPos = src.indexOf('[g ⊢ nat]') + 1;
  const site = classifyCompletionSite(state, gPos, engine);
  expect(site.ctxName === 'ContextHead' && site.expectedType === 'ctx',
    `rec-signature context binder, got ${site.expectedType}`);
}

// ── J3 reorders, never removes: the recursive call must survive ─────────────
// Regression: a J3 pass that DROPPED type-incompatible names deleted `plus` from
// its own body, because `[|- nat] -> [|- nat] -> [|- nat]` was mis-read as one box
// and judged incompatible with goal `[|- nat]`. Calling your own function is the
// most common completion in a proof; string-matched types may never veto it.
{
  const src = [
    'LF nat : type =',
    '| z : nat',
    '| s : nat -> nat;',
    '',
    'rec plus : [|- nat] -> [|- nat] -> [|- nat] =',
    'fn a => fn b => case a of',
    '| [|- z] => b',
    '| [|- s N] => pl',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const pos = src.length;

  const site = classifyCompletionSite(state, pos, engine);
  expect(site.kind === 'ident', `recursive-call site is ident, got ${site.kind}`);
  expect(site.query === 'pl', `prefix query is pl, got ${site.query}`);
  const items = gatherCompletions({ ...site }, engine, state, { getPeerSymbols: () => [] });
  expect(items.some((i) => i.label === 'plus'),
    `typing "pl" must offer the recursive call, got ${items.map((i) => i.label)}`);

  const source = belCompletionSource(engine, { getPeerSymbols: () => [] });
  const implicit = source({ state, pos, explicit: false });
  expect(implicit && implicit.options.some((o) => o.label === 'plus'),
    'recursive call is offered without pressing Ctrl-Space');
}

// A boxed arrow is not one box: `[|- nat] -> [|- nat]` opens and closes with
// brackets but is an arrow between two boxes.
{
  expect(decomposeContextual('[|- nat] -> [|- nat]') === null,
    'arrow between boxes is not a single contextual box');
  const one = decomposeContextual('[g |- tm]');
  expect(one && one.concl === 'tm', `single box still decomposes, got ${JSON.stringify(one)}`);
  expect(typeCompatibleWithGoal('[|- nat] -> [|- nat] -> [|- nat]', '[|- nat]') !== false,
    'a function whose result is the goal is never judged incompatible');
}

// ── Phase 5: structure snippets + grammar gating ────────────────────────────

{
  const prelude = [
    'LF nat : type =',
    '| z : nat',
    '| s : nat -> nat;',
    '',
  ].join('\n');
  const afterOf = prelude + [
    'rec id : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒ case x of',
    '',
  ].join('\n');
  const store = mkStore(afterOf);
  const engine = mkEngine(store);
  const state = mkState(afterOf);
  const pos = afterOf.length;
  const site = classifyCompletionSite(state, pos, engine);
  expect(site.kind === 'structure' && site.structure === 'case-arm',
    `after \`of\` is case-arm, got ${site.kind}/${site.structure}`);
  expect(site.idents === false, 'case-arm withholds idents');
  const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => [] });
  expect(items.length === 2, `after of offers | keyword + arm scaffold, got ${items.map((i) => i.label)}`);
  const armKw = items.find((i) => i.source === 'snippet-keyword');
  const armSc = items.find((i) => i.source === 'snippet');
  expect(armKw && armKw.label === '|' && armKw.insert === '|',
    `arm keyword row inserts |, got ${armKw && armKw.insert}`);
  expect(armSc && armSc.insert === '| _ ⇒ ?',
    `arm scaffold inserts full arm, got ${armSc && armSc.insert}`);
  const source = belCompletionSource(engine, { getPeerSymbols: () => [] });
  const implicit = source({ state, pos, explicit: false });
  expect(implicit && implicit.options[0].apply === '| _ ⇒ ?',
    'empty query after of fires arm scaffold for Tab');

  const typedL = afterOf + 'l';
  const storeL = mkStore(typedL);
  const engineL = mkEngine(storeL);
  const stateL = mkState(typedL);
  expect(isCaseArmSlot(storeL.tree, storeL.doc, typedL.length), 'typing l after of is still arm slot');
  const sourceL = belCompletionSource(engineL, { getPeerSymbols: () => [] });
  expect(sourceL({ state: stateL, pos: typedL.length, explicit: false }) === null,
    'typing l after of shows no popup');

  const between = prelude + [
    'rec id : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒ case x of',
    '| z ⇒ z',
    '',
  ].join('\n');
  const storeB = mkStore(between);
  const siteB = classifyCompletionSite(mkState(between), between.length, mkEngine(storeB));
  expect(siteB.structure === 'case-arm', 'between arms is case-arm');
}

{
  const top = '';
  const store = mkStore(top);
  const site = classifyCompletionSite(mkState(top), 0, mkEngine(store));
  expect(site.structure === 'top-decl', 'empty file is top-decl');
  const items = gatherCompletions(site, mkEngine(store), mkState(top), { getPeerSymbols: () => [] });
  expect(items.every((i) => i.source === 'snippet' || i.source === 'snippet-keyword'),
    'top-decl offers only snippets');
  expect(items.some((i) => i.label === 'LF') && items.some((i) => i.label === 'rec'),
    'top-decl has LF and rec');
  const lfKw = items.find((i) => i.source === 'snippet-keyword' && i.label === 'LF');
  const lfSc = items.find((i) => i.source === 'snippet' && i.insert && i.insert.startsWith('LF '));
  expect(!!lfKw && lfKw.insert === 'LF', 'top-decl LF keyword twin');
  expect(!!lfSc && lfSc.insert.includes('type'), 'top-decl LF scaffold twin');
}

{
  // Expanding scaffolds: keyword twin + template; typed prefix prefers keyword.
  const prelude = [
    'LF nat : type =',
    '| z : nat',
    '| s : nat -> nat;',
    '',
    'rec id : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒ ',
  ].join('\n');
  const typed = prelude + 'ca';
  const storeT = mkStore(typed);
  const engineT = mkEngine(storeT);
  const stateT = mkState(typed);
  const siteT = classifyCompletionSite(stateT, typed.length, engineT);
  expect(siteT.structure === 'expr-head', `ca at expr-head, got ${siteT.structure}`);
  const caseItems = gatherCompletions(siteT, engineT, stateT, { getPeerSymbols: () => [] });
  const caseKw = caseItems.find((i) => i.source === 'snippet-keyword' && i.label === 'case');
  const caseSc = caseItems.find((i) => i.source === 'snippet' && i.insert && i.insert.startsWith('case '));
  expect(!!caseKw && caseKw.insert === 'case',
    `case keyword twin inserts just case, got ${caseKw && caseKw.insert}`);
  expect(!!caseSc && caseSc.insert.includes('of'),
    `case scaffold inserts structure, got ${caseSc && caseSc.insert}`);
  expect(caseItems[0].label === 'case' && caseItems[0].insert === 'case',
    `typed ca prefers keyword case first, got ${caseItems[0] && caseItems[0].label}`);
}

{
  // Scaffolds are structure-only: holes (`?`/`_`) allowed; no fake symbols.
  const DUMMY = /\b(nat|name|Name|Mod|Mk|obs|op)\b|\b[xy]\b(?!\s*:)/;
  function assertHonest(snip, where) {
    expect(!DUMMY.test(snip.insert),
      `${where} ${snip.label} must not invent symbols, got ${JSON.stringify(snip.insert)}`);
    expect(snip.insert.includes(snip.label) || snip.label === '? : ?',
      `${where} ${snip.label} insert keeps its keyword`);
  }
  for (const snip of SNIPPETS['top-decl']) assertHonest(snip, 'top');
  for (const snip of SNIPPETS['expr-head']) assertHonest(snip, 'expr');
  for (const snip of SNIPPETS['case-arm']) assertHonest(snip, 'case-arm');
  for (const snip of SNIPPETS['schema-body']) assertHonest(snip, 'schema-body');
  for (const snip of SNIPPETS['ctor-line']) assertHonest(snip, 'ctor-line');
  for (const snip of SNIPPETS['ctx-entry']) assertHonest(snip, 'ctx-entry');
  expect(SNIPPETS['top-decl'].some((s) => s.insert.includes('?')),
    'top-decl scaffolds use ? holes');
  expect(SNIPPETS['expr-head'].find((s) => s.label === 'case').insert.includes('_'),
    'case pattern uses _ not a fake binder');
}

{
  // Typing a decl-keyword prefix at top level still offers scaffolds.
  for (const typed of ['L', 'LF', 'rec', '--in', 'induc', 'modu']) {
    const store = mkStore(typed);
    const engine = mkEngine(store);
    const state = mkState(typed);
    const site = classifyCompletionSite(state, typed.length, engine);
    expect(site.structure === 'top-decl',
      `typing ${JSON.stringify(typed)} is top-decl, got ${site.kind}/${site.structure}`);
    const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => [] });
    expect(items.length > 0, `typing ${JSON.stringify(typed)} offers scaffolds`);
    expect(items.every((i) => i.source === 'snippet' || i.source === 'snippet-keyword'),
      `typing ${JSON.stringify(typed)} offers only scaffolds`);
  }
  const past = 'LF n';
  const storeP = mkStore(past);
  const siteP = classifyCompletionSite(mkState(past), past.length, mkEngine(storeP));
  expect(siteP.structure !== 'top-decl',
    `past keyword (LF n) leaves top-decl, got ${siteP.structure}`);

  // Pragma dashes are part of the completion token (`--p` ≠ `p`).
  {
    const src = '--p';
    const store = mkStore(src);
    const engine = mkEngine(store);
    const state = mkState(src);
    const site = classifyCompletionSite(state, src.length, engine);
    expect(site.structure === 'top-decl' && site.query === '--p',
      `query keeps dashes, got ${site.structure}/${site.query}`);
    expect(site.from === 0 && site.to === src.length,
      `replace span covers --p, got ${site.from}-${site.to}`);
    const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => [] });
    expect(items.every((i) => String(i.label).startsWith('--') || String(i.insert || '').startsWith('--')),
      `typing --p only offers --* pragmas, got ${items.map((i) => i.label)}`);
    expect(items[0].label === '--prefix' || items[0].insert === '--prefix',
      `typing --p prefers --prefix, got ${items[0] && items[0].label}`);
  }
}

{
  // Infix/assoc: only left/right after op/prec.
  const infixSites = [
    '--infix + 5 ',
    '--infix + 5 l',
    '--infix + ',
    '--assoc + ',
    '--assoc + r',
  ];
  for (const src of infixSites) {
    const store = mkStore(src);
    const engine = mkEngine(store);
    const state = mkState(src);
    const site = classifyCompletionSite(state, src.length, engine);
    expect(site.structure === 'infix-assoc',
      `${JSON.stringify(src)} is infix-assoc, got ${site.kind}/${site.structure}`);
    const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => [] });
    const labels = items.map((i) => i.label);
    expect(labels.every((l) => l === 'left' || l === 'right'),
      `assoc offers only left/right, got ${labels}`);
    expect(items.some((i) => i.label === 'left') || src.endsWith('r'),
      `assoc includes left (or right-prefix), got ${labels}`);
  }

  // Incomplete infix must not steal a later blank top-decl line.
  {
    const src = '--infix + 5\n\n';
    const store = mkStore(src);
    const engine = mkEngine(store);
    const state = mkState(src);
    const site = classifyCompletionSite(state, src.length, engine);
    expect(site.structure === 'top-decl',
      `blank line after incomplete infix is top-decl, got ${site.structure}`);
  }
}

{
  const completionDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../js/editor-src/ide/completion');
  for (const name of ['source.mjs', 'contributors.mjs', 'classify.mjs', 'weigh.mjs', 'snippets.mjs']) {
    const text = fs.readFileSync(path.join(completionDir, name), 'utf8');
    expect(!text.includes('beluga-client'), `${name} must not import beluga-client`);
    expect(!text.includes('contributeHoleFills') && !text.includes('fillCandidates'),
      `${name} must not do hole fills`);
  }
  expect(!fs.existsSync(path.join(completionDir, 'hole-verify.mjs')),
    'hole-verify.mjs removed');
}

// ── Phase 6: module member access (`Foo.bar`) ───────────────────────────────

{
  const src = [
    'module Nat = struct',
    'LF nat : type;',
    'LF z : nat;',
    'LF s : nat → nat;',
    'rec id : [⊢ nat] → [⊢ nat] = fn x ⇒ x;',
    'end;',
    '',
    'rec use : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒ Nat.',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const pos = src.length;
  const site = classifyCompletionSite(state, pos, engine);
  expect(site.kind === 'module-member' && site.moduleName === 'Nat',
    `Nat. is module-member, got ${site.kind}/${site.moduleName}`);
  expect(site.maxJust >= 2, 'module-member is J2');
  const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => [] });
  const labels = items.map((i) => i.label).sort();
  expect(labels.includes('id') && labels.includes('nat') && labels.includes('z') && labels.includes('s'),
    `Nat. offers module exports, got ${labels}`);
  expect(!labels.includes('use'), 'Nat. must not offer outer rec use');
  expect(items.every((i) => i.just >= 2 && i.source === 'module-member'),
    'module members are J2 module-member');

  const source = belCompletionSource(engine, { getPeerSymbols: () => [] });
  const implicit = source({ state, pos, explicit: false });
  expect(implicit && implicit.options.some((o) => o.label === 'id'),
    'empty query after Nat. fires implicitly');

  const partial = src + 'i';
  const storeP = mkStore(partial);
  const engineP = mkEngine(storeP);
  const stateP = mkState(partial);
  const siteP = classifyCompletionSite(stateP, partial.length, engineP);
  expect(siteP.kind === 'module-member' && siteP.query === 'i', 'Nat.i keeps module-member');
  const itemsP = gatherCompletions(siteP, engineP, stateP, { getPeerSymbols: () => [] });
  expect(itemsP.some((i) => i.label === 'id') && !itemsP.some((i) => i.label === 'nat'),
    `Nat.i ranks/filters toward id, got ${itemsP.map((i) => i.label)}`);
}

{
  const src = [
    'module Nat = struct',
    'LF nat : type;',
    'end;',
    'rec use : [⊢ Nat.nat] → [⊢ Nat.nat] = fn x ⇒ x;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const pos = src.indexOf('Nat.nat') + 'Nat.'.length;
  const site = classifyCompletionSite(state, pos, engine);
  expect(site.kind === 'module-member', `type-position Nat.nat is module-member, got ${site.kind}`);
  const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => [] });
  expect(items.some((i) => i.label === 'nat'), 'type-position offers nat');
}

{
  const src = 'rec use : [⊢ nat] → [⊢ nat] =\nfn x ⇒ Foo.';
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const site = classifyCompletionSite(state, src.length, engine);
  expect(site.kind !== 'module-member',
    `unknown Foo. is not module-member, got ${site.kind}`);
}

{
  const members = mkStore([
    'module Nat = struct',
    'LF nat : type;',
    'module Inner = struct',
    'LF hidden : type;',
    'end;',
    'end;',
  ].join('\n')).symbols.membersOfModule('Nat', 200);
  expect(members && members.some((m) => m.name === 'Inner'), 'direct nested module is a member');
  expect(members && members.some((m) => m.name === 'nat'), 'direct LF is a member');
  expect(members && !members.some((m) => m.name === 'hidden'),
    'nested Inner.hidden is not a direct Nat member');
}

// ── Phase 7: kind keywords + decl hygiene ───────────────────────────────────

{
  const pre = [
    'LF nat : type =',
    '| z : nat',
    '| s : nat -> nat;',
    '',
  ].join('\n');

  function harness(src) {
    const store = mkStore(src);
    const engine = mkEngine(store);
    const state = mkState(src);
    return { store, engine, state, pos: src.length };
  }

  {
    const { engine, state, pos } = harness('LF vec : ');
    const site = classifyCompletionSite(state, pos, engine);
    expect(site.structure === 'lf-kind', `empty LF kind is lf-kind, got ${site.kind}/${site.structure}`);
    expect(site.idents === true, 'lf-kind allows type-family idents');
    const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => [] });
    expect(items.some((i) => i.label === 'type' && i.source === 'snippet'),
      `empty LF kind offers type, got ${items.map((i) => i.label)}`);
    const source = belCompletionSource(engine, { getPeerSymbols: () => [] });
    const implicit = source({ state, pos, explicit: false });
    expect(implicit && implicit.options.some((o) => o.label === 'type'),
      'empty LF kind fires type implicitly');
  }

  for (const prefix of ['t', 'ty', 'typ', 'type']) {
    const { engine, state, pos } = harness(`LF vec : ${prefix}`);
    const site = classifyCompletionSite(state, pos, engine);
    expect(site.structure === 'lf-kind', `${prefix} stays lf-kind`);
    const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => [] });
    expect(items.some((i) => i.label === 'type'),
      `${prefix} offers type, got ${items.map((i) => i.label)}`);
  }

  {
    const { engine, state, pos } = harness(pre + 'LF vec : ');
    const items = gatherCompletions(
      classifyCompletionSite(state, pos, engine),
      engine, state, { getPeerSymbols: () => [] },
    );
    expect(items.some((i) => i.label === 'type') && items.some((i) => i.label === 'nat'),
      `empty LF kind offers type + nat, got ${items.map((i) => i.label)}`);
  }

  {
    const { engine, state, pos } = harness('inductive Box : ');
    const site = classifyCompletionSite(state, pos, engine);
    expect(site.structure === 'comp-kind', `empty inductive kind is comp-kind, got ${site.structure}`);
    const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => [] });
    expect(items.some((i) => i.label === 'ctype') && items.some((i) => i.label === 'prop'),
      `comp-kind offers ctype/prop, got ${items.map((i) => i.label)}`);
  }

  {
    const { engine, state, pos } = harness('inductive Box : c');
    const site = classifyCompletionSite(state, pos, engine);
    expect(site.structure === 'comp-kind', `inductive Box : c is comp-kind, not top-decl (${site.structure})`);
    const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => [] });
    expect(items.some((i) => i.label === 'ctype'), 'inductive … : c offers ctype');
    expect(!items.some((i) => i.label === 'LF' || i.label === 'rec' || i.label === 'schema'),
      `mid-inductive must not offer top-decl scaffolds, got ${items.map((i) => i.label)}`);
  }

  {
    const { engine, state, pos } = harness('typedef Foo : c');
    const site = classifyCompletionSite(state, pos, engine);
    expect(site.structure === 'comp-kind', `typedef Foo : c is comp-kind, got ${site.structure}`);
    const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => [] });
    expect(!items.some((i) => i.label === 'LF' || i.label === 'rec'),
      `mid-typedef must not offer top-decl scaffolds, got ${items.map((i) => i.label)}`);
  }

  {
    // Negative: type keyword absent at expression heads.
    const src = pre + [
      'rec id : [⊢ nat] → [⊢ nat] =',
      'fn x ⇒ t',
    ].join('\n');
    const { engine, state, pos } = harness(src);
    const items = gatherCompletions(
      classifyCompletionSite(state, pos, engine),
      engine, state, { getPeerSymbols: () => [] },
    );
    expect(!items.some((i) => i.label === 'type'),
      `expr head must not offer type, got ${items.map((i) => i.label)}`);
  }

  {
    function errCount(src) {
      const tree = parser.parse(src);
      let n = 0;
      tree.iterate({ enter(node) { if (node.type.isError) n += 1; } });
      return n;
    }
    for (const snip of SNIPPETS['lf-kind']) {
      expect(errCount(`LF name : ${snip.insert} =\n| c : name;\n`) === 0,
        `lf-kind ${snip.label} parses`);
    }
    for (const snip of SNIPPETS['comp-kind']) {
      expect(errCount(`inductive Name : ${snip.insert} =\n| Mk : Name;\n`) === 0,
        `comp-kind ${snip.label} parses`);
    }
    // Kind keywords are real tokens (insert === label); top scaffolds intentionally use ?.
    for (const snip of SNIPPETS['top-decl']) {
      expect(!/\b(nat|name|Name|Mod|Mk|op)\b/.test(snip.insert),
        `top ${snip.label} stays symbol-free`);
    }
  }

  {
    // Expr-head after `fn x ⇒` peels the rec signature (J3 opportunity).
    const src = pre + [
      'rec id : [⊢ nat] → [⊢ nat] =',
      'fn x ⇒ ',
    ].join('\n');
    const { engine, state, pos } = harness(src);
    const site = classifyCompletionSite(state, pos, engine);
    expect(site.structure === 'expr-head', `empty fn body is expr-head, got ${site.structure}`);
    expect(site.expectedType && /nat/.test(site.expectedType),
      `expr-head expectedType peels rec sig, got ${site.expectedType}`);
    expect(site.maxJust >= 3, 'expr-head with expected type is J3-capable');
  }

  {
    // Screenshot regression: bare LF decl `eval: term -> term -> ty` must offer
    // `type` above peer `hastype` (not hastype alone).
    const src = [
      '%{',
      '  BIG-STEP EVALUATION RULES',
      '}%',
      '',
      'eval: term -> term -> ty',
      '',
      'ev_true :',
      '  eval true true.',
    ].join('\n');
    const pos = src.indexOf('-> ty') + '-> ty'.length;
    const store = mkStore(src);
    const engine = mkEngine(store);
    const state = mkState(src);
    const site = classifyCompletionSite(state, pos, engine);
    expect(site.structure === 'lf-kind',
      `eval:…ty is lf-kind, got ${site.kind}/${site.structure}`);
    const peers = [{
      name: 'hastype',
      namespace: NAMESPACE.LF_TYPE_FAMILY,
      path: 'evaluation.bel',
      sourceText: 'type',
    }];
    const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => peers });
    expect(items.some((i) => i.label === 'type'),
      `eval:…ty must offer type, got ${items.map((i) => i.label)}`);
    expect(items[0] && items[0].label === 'type',
      `type must rank first over hastype, got ${items.map((i) => i.label)}`);
    const visibleSymbolsAt = engine.stores.symbols.visibleSymbolsAt.bind(engine.stores.symbols);
    let poolBuilds = 0;
    engine.stores.symbols.visibleSymbolsAt = (...args) => {
      poolBuilds += 1;
      return visibleSymbolsAt(...args);
    };
    const source = belCompletionSource(engine, { getPeerSymbols: () => peers });
    const implicit = source({ state, pos, explicit: false });
    expect(implicit && implicit.options.some((o) => o.label === 'type'),
      'eval:…ty fires type implicitly');
    const peerOption = implicit && implicit.options.find((o) => o.label === 'hastype');
    expect(peerOption && peerOption.signature === 'type' && !peerOption.detail,
      'peer completion exposes its signature and never a file path');
    const typSrc = src.slice(0, pos - 2) + 'typ' + src.slice(pos);
    const typState = mkState(typSrc);
    const typed = implicit.update(
      implicit,
      pos - 2,
      pos + 1,
      { state: typState, pos: pos + 1, explicit: false },
    );
    expect(implicit && implicit.filter === false && typed && typed.filter === false,
      'BelJar, not CodeMirror, filters the retained pool');
    expect(typeof implicit.update === 'function',
      'completion result updates in place while the token changes');
    expect(typed.options.some((o) => o.label === 'type'),
      'typ retains type from the same justified pool');
    expect(poolBuilds === 1,
      `typing ty→typ reuses the candidate pool, visibleSymbolsAt=${poolBuilds}`);
  }

  {
    // Mid-token must only filter: empty-query uncapped pool ⊇ every longer
    // prefix's admitted set. typ-matching ⊆ ty-matching ⊆ pool.
    const base = 'eval: term -> term -> ';
    const peers = [{
      name: 'hastype',
      namespace: NAMESPACE.LF_TYPE_FAMILY,
      path: 'evaluation.bel',
      sourceText: 'type',
    }, {
      name: 'typeof',
      namespace: NAMESPACE.LF_TYPE_FAMILY,
      path: 'other.bel',
      sourceText: 'type',
    }];
    function poolAndGather(suffix) {
      const src = base + suffix;
      const store = mkStore(src);
      const engine = mkEngine(store);
      const state = mkState(src);
      const site = classifyCompletionSite(state, src.length, engine);
      const pool = gatherCompletions({ ...site, query: '' }, engine, state, {
        getPeerSymbols: () => peers,
        limit: 0,
      }).map((i) => i.label);
      const at = gatherCompletions(site, engine, state, {
        getPeerSymbols: () => peers,
        limit: 0,
      }).map((i) => i.label);
      return { pool, at };
    }
    const ty = poolAndGather('ty');
    const typ = poolAndGather('typ');
    expect(ty.at.every((l) => ty.pool.includes(l)),
      `ty gather ⊆ empty pool, missing ${ty.at.filter((l) => !ty.pool.includes(l))}`);
    expect(typ.at.every((l) => ty.pool.includes(l)),
      `typ gather ⊆ empty pool`);
    expect(typ.at.every((l) => ty.at.includes(l)),
      `typ ⊆ ty (monotonic filter), typ=${typ.at} ty=${ty.at}`);
    expect(ty.pool.length >= typ.at.length,
      'pool is not a display-sized truncation of the justified set');
  }

  {
    // The retained pool is the full justified set, not the rendered 24 rows.
    // A later prefix may select a name initially below the visible cutoff.
    const src = 'eval: term -> term -> t';
    const store = mkStore(src);
    const engine = mkEngine(store);
    const state = mkState(src);
    const peers = Array.from({ length: 40 }, (_, i) => ({
      name: `typePeer${String(i).padStart(2, '0')}`,
      namespace: NAMESPACE.LF_TYPE_FAMILY,
      path: `p${i}.bel`,
      sourceText: 'type',
    }));
    const source = belCompletionSource(engine, { getPeerSymbols: () => peers });
    const result = source({ state, pos: src.length, explicit: false });
    expect(result && result.options.length === 24,
      `first render honors the 24-row display cap, got ${result?.options.length}`);
    const later = 'eval: term -> term -> typePeer3';
    const laterState = mkState(later);
    const laterResult = result.update(
      result,
      src.lastIndexOf('t'),
      later.length,
      { state: laterState, pos: later.length, explicit: false },
    );
    expect(laterResult && laterResult.options.some((o) => o.label === 'typePeer39'),
      'a candidate beyond the initial 24 remains in the retained pool');
  }

  {
    // Same token characters are not enough: when grammar moves from an
    // expr-head slot into an ordinary expression, discard the old scaffold pool.
    const before = [
      'LF nat : type =',
      '| z : nat;',
      'rec id : [⊢ nat] → [⊢ nat] =',
      'fn x ⇒ ',
    ].join('\n');
    const store = mkStore(before);
    const engine = mkEngine(store);
    const state = mkState(before);
    const source = belCompletionSource(engine, { getPeerSymbols: () => [] });
    const result = source({ state, pos: before.length, explicit: false });
    expect(result && result.options.some((o) => o.label === 'fn'),
      'empty expr-head result includes expression scaffolds');

    const after = `${before}z`;
    const afterState = mkState(after);
    const invalidated = result.update(
      result,
      before.length,
      after.length,
      { state: afterState, pos: after.length, explicit: false },
    );
    expect(invalidated === null,
      'grammar transition invalidates the active completion session');
    const afterResult = source({ state: afterState, pos: after.length, explicit: false });
    expect(!afterResult || !afterResult.options.some((o) => o.label === 'fn'),
      'grammar transition discards the expr-head pool');
  }
}

// ── Phase excellence: app-arg J3, let-RHS, snippets, proximity, peers ────────

{
  // App-arg expected type: `id : [⊢ nat] → [⊢ nat]` applied as `id ?`.
  const src = [
    'LF nat : type =',
    '| z : nat;',
    '',
    'rec id : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒ x;',
    '',
    'rec use : [⊢ nat] → [⊢ nat] =',
    'fn a ⇒ id a',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  // Position on the argument `a` of `id a`.
  const pos = src.lastIndexOf(' id a') + ' id '.length;
  const site = classifyCompletionSite(state, pos, engine);
  expect(site.expectedType && /nat/.test(site.expectedType),
    `app-arg expectedType mentions nat, got ${site.expectedType}`);
  expect(site.maxJust >= 3, 'app-arg site is J3-capable');
}

{
  // Let-RHS ascription: `let y : [⊢ nat] = ? in …`
  const src = [
    'LF nat : type =',
    '| z : nat;',
    '',
    'rec id : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒ let y : [⊢ nat] = x in y;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const pos = src.indexOf('= x in') + 2; // on the RHS `x`
  const site = classifyCompletionSite(state, pos, engine);
  expect(site.expectedType && /nat/.test(site.expectedType),
    `let-RHS expectedType mentions nat, got ${site.expectedType}`);
}

{
  // Schema-body scaffolds after `schema g =`.
  const src = 'schema g = ';
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const site = classifyCompletionSite(state, src.length, engine);
  expect(site.structure === 'schema-body',
    `schema body slot, got ${site.kind}/${site.structure}`);
  const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => [] });
  expect(items.some((i) => i.label === 'block') && items.some((i) => i.label === 'some'),
    `schema-body offers block/some, got ${items.map((i) => i.label)}`);
  for (const snip of SNIPPETS['schema-body']) {
    expect(!/\b(nat|name|x|y)\b/.test(snip.insert),
      `schema-body ${snip.label} uses holes, got ${snip.insert}`);
  }
}

{
  // Ctor-line between inductive constructors.
  const src = [
    'inductive Box : ctype =',
    '| Mk : [⊢ nat] → Box',
    '',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const site = classifyCompletionSite(state, src.length, engine);
  expect(site.structure === 'ctor-line' && site.idents === false,
    `between ctors is ctor-line, got ${site.structure}`);
  const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => [] });
  expect(items.length === 2, `ctor-line offers | keyword + scaffold, got ${items.map((i) => i.label)}`);
  expect(items.some((i) => i.source === 'snippet-keyword' && i.insert === '|'),
    'ctor-line keyword twin inserts |');
  expect(items.some((i) => i.source === 'snippet' && i.insert === '| ? : ?'),
    'ctor-line scaffold inserts hole ctor line');
}

{
  // Recursive call boost: `plus` outranks a far peer inside its own body.
  const src = [
    'LF nat : type =',
    '| z : nat',
    '| s : nat -> nat;',
    '',
    'rec plus : [⊢ nat] → [⊢ nat] → [⊢ nat] =',
    'fn a ⇒ fn b ⇒ case a of',
    '| [⊢ z] ⇒ b',
    '| [⊢ s N] ⇒ pl',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const pos = src.length;
  const items = gatherCompletions(
    classifyCompletionSite(state, pos, engine),
    engine,
    state,
    {
      getPeerSymbols: () => [{
        name: 'peerPlus',
        fileName: 'other/peer.bel',
        namespace: NAMESPACE.REC_FUNCTION,
        sourceText: '[⊢ nat] → [⊢ nat] → [⊢ nat]',
      }],
      activePath: 'suite/plus.bel',
    },
  );
  const plus = items.find((i) => i.label === 'plus');
  expect(plus, `recursive plus offered, got ${items.map((i) => i.label)}`);
  expect(items[0].label === 'plus' || items.findIndex((i) => i.label === 'plus') < 3,
    `recursive plus in top 3, got ${items.slice(0, 5).map((i) => i.label)}`);
  expect(plus.scoreHints.proximity >= 25,
    `recursive call gets proximity boost, got ${plus.scoreHints.proximity}`);
}

{
  // Same-directory peers outrank distant peers (higher base).
  const src = [
    'LF nat : type =',
    '| z : nat;',
    'LF vec : n',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const site = {
    ...classifyCompletionSite(state, src.length, engine),
    query: '',
  };
  expect(site.namespaces && site.namespaces.has(NAMESPACE.LF_TYPE_FAMILY),
    `type site predicts families, got ${site.namespaces && [...site.namespaces]}`);
  const items = contributeIdents(
    { ...site, kind: 'ident' },
    engine,
    {
      activePath: 'suite/local.bel',
      getPeerSymbols: () => [
        {
          name: 'nearFam',
          fileName: 'suite/types.bel',
          namespace: NAMESPACE.LF_TYPE_FAMILY,
          sourceText: 'type',
        },
        {
          name: 'farFam',
          fileName: 'other/types.bel',
          namespace: NAMESPACE.LF_TYPE_FAMILY,
          sourceText: 'type',
        },
      ],
    },
  );
  const near = items.find((i) => i.label === 'nearFam');
  const far = items.find((i) => i.label === 'farFam');
  expect(near && far, `both peers present, got ${items.map((i) => i.label)}`);
  expect(near.scoreHints.base > far.scoreHints.base,
    `same-dir peer base ${near.scoreHints.base} > far ${far.scoreHints.base}`);
}

{
  // Ctx-entry scaffold inside `[ , ]` before turnstile.
  const src = 'rec f : {g:ctx} [g,  ⊢ nat] → [⊢ nat] = mlam g ⇒ fn x ⇒ x;';
  // Find the position after `[g, `
  const pos = src.indexOf('[g, ') + '[g, '.length;
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const site = classifyCompletionSite(state, pos, engine);
  // May be ctx-entry or declined binder — either way, if structure fires it offers scaffold.
  if (site.structure === 'ctx-entry') {
    const items = gatherCompletions(site, engine, state, { getPeerSymbols: () => [] });
    expect(items.some((i) => i.label === '? : ?'),
      `ctx-entry offers scaffold, got ${items.map((i) => i.label)}`);
  }
}

// ── Pattern binders enter the symbol store and complete at uses ─────────────

{
  const src = [
    'LF nat : type =',
    '| z : nat',
    '| s : nat -> nat;',
    '',
    'rec id : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒ case x of',
    '| z ⇒ z',
    '| s y ⇒ y;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const yBind = src.indexOf('s y') + 2;
  const yUse = src.lastIndexOf('y;');
  expect(classifyCompletionSite(state, yBind, engine).kind === 'none',
    'pattern binder position declines');
  expect(store.symbols.visibleSymbolsAt(yUse).some((s) => s.name === 'y' && !s.isGlobal),
    'pattern binder y visible at use');
  const items = gatherCompletions(
    classifyCompletionSite(state, yUse, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(items.some((i) => i.label === 'y'),
    `case-branch body offers pattern binder y, got ${items.map((i) => i.label)}`);
}

{
  const src = [
    'LF nat : type =',
    '| z : nat;',
    '',
    'rec dual_sym : [⊢ nat] → [⊢ nat] = fn x ⇒ x;',
    'rec f : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒ let [ ⊢ l] = dual_sym [ ⊢ x] in [ ⊢ l];',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const lUse = src.lastIndexOf('⊢ l]') + 2;
  expect(store.symbols.visibleSymbolsAt(lUse).some((s) => s.name === 'l' && !s.isGlobal),
    'let-pattern binder l visible at use');
  const items = gatherCompletions(
    classifyCompletionSite(state, lUse, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(items.some((i) => i.label === 'l'),
    `let body offers pattern binder l, got ${items.map((i) => i.label)}`);
}

{
  const src = [
    'LF name : type.',
    'LF lin : type =',
    '| l_out2 : (name → lin) → lin',
    '| l_atom : lin;',
    'schema ctx = block (x:name);',
    'rec f : {g:ctx} [g ⊢ lin] → [g ⊢ lin] =',
    'mlam g ⇒ fn x ⇒ case x of',
    '| [g ⊢ l_out2 (\\y. linQ)] ⇒ [g ⊢ linQ]',
    '| [g ⊢ linQ] ⇒ [g ⊢ linQ];',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const nestedBind = src.indexOf('linQ)]') ;
  const bareBind = src.indexOf('| [g ⊢ linQ]') + '| [g ⊢ '.length;
  const nestedUse = src.indexOf('⇒ [g ⊢ linQ]') + '⇒ [g ⊢ '.length;
  const bareUse = src.lastIndexOf('⊢ linQ]') + 2;
  expect(classifyCompletionSite(state, nestedBind, engine).kind === 'none',
    'nested pattern LF binder linQ declines');
  expect(classifyCompletionSite(state, bareBind, engine).kind === 'none',
    'bare boxed pattern LF binder linQ declines');
  expect(store.symbols.visibleSymbolsAt(nestedUse).some((s) => s.name === 'linQ' && !s.isGlobal),
    'nested pattern binder linQ visible at use');
  expect(store.symbols.visibleSymbolsAt(bareUse).some((s) => s.name === 'linQ' && !s.isGlobal),
    'bare boxed pattern binder linQ visible at use');
  const nestedItems = gatherCompletions(
    classifyCompletionSite(state, nestedUse, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(nestedItems.some((i) => i.label === 'linQ'),
    `nested use offers linQ, got ${nestedItems.map((i) => i.label)}`);
  const bareItems = gatherCompletions(
    classifyCompletionSite(state, bareUse, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(bareItems.some((i) => i.label === 'linQ'),
    `bare use offers linQ, got ${bareItems.map((i) => i.label)}`);
}

{
  const src = [
    'LF nat : type =',
    '| z : nat;',
    'schema ctx = block (x:nat);',
    'rec id : {g:ctx} [g ⊢ nat] → [g ⊢ nat] = mlam g ⇒ fn x ⇒ x;',
    'rec f : {g:ctx} [g ⊢ nat] → [g ⊢ nat] =',
    'mlam g ⇒ fn x ⇒ case x of',
    '| [g ⊢ z] ⇒',
    '  let [g, bly:block (x:nat) ⊢ y] =',
    '    id [g, bly:block (x:nat) ⊢ y] in [g ⊢ y];',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const patUse = src.indexOf('⊢ y]') + 2;
  const rhsUse = src.lastIndexOf('⊢ y]') + 2;
  const bodyUse = src.lastIndexOf('[g ⊢ y]') + 4;
  expect(store.symbols.visibleSymbolsAt(patUse).some((s) => s.name === 'bly' && !s.isGlobal),
    'let-pattern ContextEntry bly visible after turnstile in pattern');
  expect(store.symbols.visibleSymbolsAt(rhsUse).some((s) => s.name === 'bly' && !s.isGlobal),
    'expression ContextEntry bly visible after turnstile in RHS box');
  expect(store.symbols.visibleSymbolsAt(bodyUse).some((s) => s.name === 'y' && !s.isGlobal),
    'let-pattern binder y visible in body');
  const items = gatherCompletions(
    classifyCompletionSite(state, rhsUse, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(items.some((i) => i.label === 'bly'),
    `RHS box offers bly, got ${items.map((i) => i.label)}`);
}

{
  // Mutual and-rec: later name is visible to earlier bodies.
  const src = [
    'LF nat : type =',
    '| z : nat;',
    'rec f : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒ g x',
    'and rec g : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒ f x;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const gUse = src.indexOf('g x');
  const fUse = src.lastIndexOf('f x');
  expect(store.symbols.visibleSymbolsAt(gUse).some((s) => s.name === 'g' && s.isGlobal),
    'mutual and-rec g visible in earlier body');
  expect(store.symbols.visibleSymbolsAt(fUse).some((s) => s.name === 'f' && s.isGlobal),
    'mutual and-rec f visible in later body');
  const items = gatherCompletions(
    classifyCompletionSite(state, gUse, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(items.some((i) => i.label === 'g'),
    `mutual and-rec offers g at forward use, got ${items.map((i) => i.label)}`);
}

{
  const src = [
    'LF nat : type =',
    '| z : nat;',
    'rec coid : [⊢ nat] → [⊢ nat] =',
    'fun d ⇒ d;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const bind = src.indexOf('fun d') + 4;
  const use = src.lastIndexOf('d;');
  expect(classifyCompletionSite(state, bind, engine).kind === 'none',
    'cofunction copattern binder declines');
  expect(store.symbols.visibleSymbolsAt(use).some((s) => s.name === 'd' && !s.isGlobal),
    'cofunction copattern d visible in branch');
  const items = gatherCompletions(
    classifyCompletionSite(state, use, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(items.some((i) => i.label === 'd'),
    `cofunction branch offers d, got ${items.map((i) => i.label)}`);
}

{
  // Mutual LF: later head visible in earlier constructors.
  const src = [
    'LF fstep : type =',
    '| use : bstep → fstep',
    'and bstep : type =',
    '| bs : bstep;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const use = src.indexOf('bstep →');
  expect(store.symbols.visibleSymbolsAt(use).some((s) => s.name === 'bstep' && s.isGlobal),
    'mutual LF head bstep visible in earlier ctor');
  const items = gatherCompletions(
    classifyCompletionSite(state, use, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(items.some((i) => i.label === 'bstep'),
    `mutual LF offers bstep at forward use, got ${items.map((i) => i.label)}`);
}

{
  const src = [
    'LF tm : type;',
    'schema ctx = tm;',
    'inductive Rel : {g:ctx} {$S:$[g ⊢ g]} ctype =',
    '| Base : Rel [g] $[g ⊢ $S]',
    '| Step : Rel [g] $[g ⊢ $S] → Rel [g] $[g ⊢ $S];',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const use = src.indexOf('$S]', src.indexOf('| Base')) + 2;
  for (const name of ['g', '$S']) {
    expect(store.symbols.visibleSymbolsAt(use).some((s) => s.name === name && !s.isGlobal),
      `inductive header binder ${name} visible in constructors`);
  }
  const items = gatherCompletions(
    classifyCompletionSite(state, use, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(items.some((i) => i.label === '$S'),
    `constructor use offers quantified $S, got ${items.map((i) => i.label)}`);
}

{
  const src = [
    'LF nat : type =',
    '| z : nat;',
    'schema ctx = block (x:nat);',
    'rec f : {g:ctx} [g ⊢ nat] → [g ⊢ nat] =',
    '/ total g (f g) /',
    'mlam g ⇒ fn x ⇒ x;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const totG = src.indexOf('/ total g') + '/ total '.length;
  expect(store.symbols.visibleSymbolsAt(totG).some((s) => s.name === 'g' && !s.isGlobal),
    'signature binder g visible in totality annotation');
  const items = gatherCompletions(
    classifyCompletionSite(state, totG, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(items.some((i) => i.label === 'g'),
    `totality offers signature g, got ${items.map((i) => i.label)}`);
}

{
  // Live peers follow owningCfgForFile when Persist/best cfg does not list the file.
  const files = [
    { id: 'cover', name: 'multi/cover.cfg', text: 'lam.elf\nother.bel' },
    { id: 'suite', name: 'multi/suite.cfg', text: 'lam.elf\nactive.bel' },
    { id: 'lam', name: 'multi/lam.elf', text: 'LF term : type;' },
    { id: 'other', name: 'multi/other.bel', text: 'LF other : type;' },
    { id: 'active', name: 'multi/active.bel', text: 'LF use : term → type;' },
  ];
  const getText = (id) => files.find((f) => f.id === id).text;
  const wrongPreferred = {
    activeCfgForDir: activeCfgResolver({ multi: 'multi/cover.cfg' }),
  };
  const peers = listGroupSymbols(files, 'active', getText, wrongPreferred);
  expect(peers.some((p) => p.name === 'term'),
    `owning suite still surfaces prelude term (got ${peers.map((p) => p.name)})`);
  const src = files.find((f) => f.id === 'active').text;
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const pos = src.indexOf('term');
  const items = gatherCompletions(
    classifyCompletionSite(state, pos, engine),
    engine,
    state,
    { getPeerSymbols: () => peers },
  );
  expect(items.some((i) => i.label === 'term'),
    `completion offers owning-cfg peer term, got ${items.map((i) => i.label)}`);
}

{
  // Parenthesized constructor patterns bind nested args through the branch body.
  const src = [
    'LF tm : type;',
    'LF step : tm → tm → type =',
    '| Howe_lam : step M N → step (lam M) (lam N);',
    'rec f : [⊢ step M N] → [⊢ step M N] =',
    'fn x ⇒ case x of',
    '| (Howe_lam h1 s1) ⇒ Howe_lam h1 s1;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const bindH1 = src.indexOf('h1 s1)') ;
  const useH1 = src.lastIndexOf('Howe_lam h1') + 'Howe_lam '.length;
  const useS1 = src.lastIndexOf('h1 s1;') + 'h1 '.length;
  expect(classifyCompletionSite(state, bindH1, engine).kind === 'none',
    'paren-pattern binder h1 declines at binding occurrence');
  expect(store.symbols.visibleSymbolsAt(useH1).some((s) => s.name === 'h1' && !s.isGlobal),
    'paren-pattern binder h1 visible in body');
  expect(store.symbols.visibleSymbolsAt(useS1).some((s) => s.name === 's1' && !s.isGlobal),
    'paren-pattern binder s1 visible in body');
  const h1Items = gatherCompletions(
    classifyCompletionSite(state, useH1, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(h1Items.some((i) => i.label === 'h1'),
    `paren-pattern body offers h1, got ${h1Items.map((i) => i.label)}`);
  const s1Items = gatherCompletions(
    classifyCompletionSite(state, useS1, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(s1Items.some((i) => i.label === 's1'),
    `paren-pattern body offers s1, got ${s1Items.map((i) => i.label)}`);
}

{
  // Boxed substitution args and known ctor heads after ⊢ are uses, not binders.
  const src = [
    'LF names : type.',
    'LF fstep : type =',
    '| fs_par1 : fstep → fstep;',
    'schema ctx = block (x:names);',
    'rec f : {g:ctx} [g ⊢ fstep] → [g ⊢ fstep] =',
    'mlam g ⇒ fn x ⇒ case x of',
    '| [g, x:names ⊢ fs_par1 F1[..,x]] ⇒ [g ⊢ F1[..,x]];',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const ctorInPat = src.indexOf('fs_par1 F1');
  const substX = src.indexOf('F1[..,x]]') + 'F1[..,'.length;
  const useX = src.lastIndexOf('F1[..,x]') + 'F1[..,'.length;
  expect(classifyCompletionSite(state, ctorInPat, engine).kind !== 'none',
    'known ctor fs_par1 after ⊢ is completable');
  expect(classifyCompletionSite(state, substX, engine).kind !== 'none',
    'substitution use of x after ⊢ is completable');
  expect(store.symbols.visibleSymbolsAt(substX).some((s) => s.name === 'x' && !s.isGlobal),
    'context binder x visible inside pattern substitution');
  const items = gatherCompletions(
    classifyCompletionSite(state, useX, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(items.some((i) => i.label === 'x'),
    `boxed subst body offers x, got ${items.map((i) => i.label)}`);
}

{
  // Bare let pattern binder.
  const src = [
    'LF nat : type =',
    '| z : nat;',
    'rec f : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒ let ms = x in ms;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const bindMs = src.indexOf('ms =');
  const useMs = src.lastIndexOf('ms;');
  expect(classifyCompletionSite(state, bindMs, engine).kind === 'none',
    'bare let binder ms declines at binding occurrence');
  expect(store.symbols.visibleSymbolsAt(useMs).some((s) => s.name === 'ms' && !s.isGlobal),
    'bare let binder ms visible in body');
  const items = gatherCompletions(
    classifyCompletionSite(state, useMs, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(items.some((i) => i.label === 'ms'),
    `bare let body offers ms, got ${items.map((i) => i.label)}`);
}

{
  // Ascribed let pattern binder.
  const src = [
    'LF nat : type =',
    '| z : nat;',
    'rec f : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒ let y : [⊢ nat] = x in y;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const bindY = src.indexOf('y :');
  const useY = src.lastIndexOf('y;');
  expect(classifyCompletionSite(state, bindY, engine).kind === 'none',
    'ascribed let binder y declines at binding occurrence');
  expect(store.symbols.visibleSymbolsAt(useY).some((s) => s.name === 'y' && !s.isGlobal),
    'ascribed let binder y visible in body');
  const items = gatherCompletions(
    classifyCompletionSite(state, useY, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(items.some((i) => i.label === 'y'),
    `ascribed let body offers y, got ${items.map((i) => i.label)}`);
}

{
  // Ascribed fun / copattern binder; bare fun still works.
  const ascribed = [
    'LF nat : type =',
    '| z : nat;',
    'rec f : [⊢ nat] → [⊢ nat] =',
    'fun (t : [⊢ nat]) ⇒ t;',
  ].join('\n');
  const storeA = mkStore(ascribed);
  const engineA = mkEngine(storeA);
  const stateA = mkState(ascribed);
  const bindT = ascribed.indexOf('t :');
  const useT = ascribed.lastIndexOf('t;');
  expect(classifyCompletionSite(stateA, bindT, engineA).kind === 'none',
    'ascribed fun binder t declines at binding occurrence');
  expect(storeA.symbols.visibleSymbolsAt(useT).some((s) => s.name === 't' && !s.isGlobal),
    'ascribed fun binder t visible in body');
  const itemsA = gatherCompletions(
    classifyCompletionSite(stateA, useT, engineA),
    engineA,
    stateA,
    { getPeerSymbols: () => [] },
  );
  expect(itemsA.some((i) => i.label === 't'),
    `ascribed fun body offers t, got ${itemsA.map((i) => i.label)}`);

  const bare = [
    'LF nat : type =',
    '| z : nat;',
    'rec f : [⊢ nat] → [⊢ nat] =',
    'fun u ⇒ u;',
  ].join('\n');
  const storeB = mkStore(bare);
  const engineB = mkEngine(storeB);
  const stateB = mkState(bare);
  const useU = bare.lastIndexOf('u;');
  expect(storeB.symbols.visibleSymbolsAt(useU).some((s) => s.name === 'u' && !s.isGlobal),
    'bare fun binder u visible in body');
  const itemsB = gatherCompletions(
    classifyCompletionSite(stateB, useU, engineB),
    engineB,
    stateB,
    { getPeerSymbols: () => [] },
  );
  expect(itemsB.some((i) => i.label === 'u'),
    `bare fun body offers u, got ${itemsB.map((i) => i.label)}`);
}

{
  // Bare unknown case head still does not invent a binder.
  const src = [
    'LF nat : type =',
    '| z : nat;',
    'rec f : [⊢ nat] → [⊢ nat] =',
    'fn x ⇒ case x of',
    '| mistyped ⇒ z;',
  ].join('\n');
  const store = mkStore(src);
  const use = src.indexOf('⇒ z') ;
  expect(!store.symbols.visibleSymbolsAt(use).some((s) => s.name === 'mistyped' && !s.isGlobal),
    'unknown lowercase case head does not invent a binder');
}

{
  // Mutual co/inductive continuation: later `and inductive` head visible earlier.
  const src = [
    'LF tp : type;',
    'coinductive Val : [⊢ tp] → ctype =',
    '| Out : Val [⊢ B] → Val\' [⊢ B]',
    'and inductive Val\' : [⊢ tp] → ctype =',
    '| C : Val\' [⊢ B];',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const use = src.indexOf("Val' [⊢ B]");
  const valPrime = [...store.symbols.getSnapshot().globalSymbols]
    .find((s) => s.name === "Val'");
  expect(!!valPrime, "Val' symbol exists");
  expect(valPrime.visibleFrom < use,
    `Val' visibleFrom is block start (got ${valPrime.visibleFrom} vs use ${use})`);
  expect(store.symbols.visibleSymbolsAt(use).some((s) => s.name === "Val'" && s.isGlobal),
    "mutual continuation head Val' visible in earlier ctor");
  const items = gatherCompletions(
    classifyCompletionSite(state, use, engine),
    engine,
    state,
    { getPeerSymbols: () => [] },
  );
  expect(items.some((i) => i.label === "Val'"),
    `mutual continuation offers Val' at forward use, got ${items.map((i) => i.label)}`);
}

{
  // `--name` preferred aliases are not actionable unresolved refs; constant resolves.
  const src = [
    'LF nat : type.',
    '--name nat N x.',
    'LF z : nat;',
  ].join('\n');
  const store = mkStore(src);
  const snap = store.symbols.getSnapshot();
  const prefs = snap.references.filter((r) => r.name === 'N' || r.name === 'x');
  expect(prefs.length === 0,
    `NamePreferred aliases are not references (got ${prefs.map((r) => r.name)})`);
  const natRefs = snap.references.filter((r) => r.name === 'nat');
  expect(natRefs.some((r) => r.resolution === 'global'),
    'constant nat in --name still resolves as a reference');
}

console.log('ok - autocomplete slice A');
