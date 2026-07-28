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
import { classifyCompletionSite } from '../js/editor-src/ide/completion/classify.mjs';
import { contributeIdents, peerFileDetail } from '../js/editor-src/ide/completion/contributors.mjs';
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
import { defsOf } from '../js/editor-src/semantic/project-prelude.mjs';
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

// ── peer path labels relative to active folder ──────────────────────────────

{
  expect(
    peerFileDetail('classical-processes/cp_linear.bel', 'classical-processes/cp_thrm.bel')
      === 'cp_linear.bel',
    'same folder → basename',
  );
  expect(
    peerFileDetail('classical-processes/sub/x.bel', 'classical-processes/cp_thrm.bel')
      === 'sub/x.bel',
    'nested under cwd → relative',
  );
  expect(
    peerFileDetail('examples/other.bel', 'classical-processes/cp_thrm.bel')
      === 'examples/other.bel',
    'elsewhere → project path',
  );
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
        { name: 'peerNat', fileName: 'classical-processes/cp_linear.bel', namespace: NAMESPACE.LF_TYPE_FAMILY },
        { name: 'other', fileName: 'examples/other.bel', namespace: NAMESPACE.LF_CONSTANT },
      ],
    },
  );
  expect(idents.some((i) => i.label === 'nat'), 'ident contrib lists nat');
  expect(idents.some((i) => i.label === 'x'), 'ident contrib lists local x');
  const peerSame = idents.find((i) => i.label === 'peerNat');
  expect(peerSame && peerSame.detail === 'cp_linear.bel',
    `same-folder peer shows basename, got ${peerSame && peerSame.detail}`);
  const peerElse = idents.find((i) => i.label === 'other');
  expect(peerElse && peerElse.detail === 'examples/other.bel',
    `other-folder peer keeps project path, got ${peerElse && peerElse.detail}`);
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
  expect(body && body.options.some((item) => item.label === 'x'),
    'expression body site is J2 and offers local x');
  expect(!body.options.some((item) => item.label === 'z'),
    'expression body withholds LF constructors');
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
    '| [|- s N] => plus [|- N] b;',
  ].join('\n');
  const store = mkStore(src);
  const engine = mkEngine(store);
  const state = mkState(src);
  const probe = '| [|- s N] => pl';
  const pos = src.indexOf(probe) + probe.length;

  const site = classifyCompletionSite(state, pos, engine);
  expect(site.kind === 'ident', `recursive-call site is ident, got ${site.kind}`);
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
  expect(items.length === 1 && items[0].label === '|',
    `after of offers only | arm, got ${items.map((i) => i.label)}`);
  const source = belCompletionSource(engine, { getPeerSymbols: () => [] });
  const implicit = source({ state, pos, explicit: false });
  expect(implicit && implicit.options[0].label === '|',
    'empty query after of fires | for Tab');

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
  expect(items.every((i) => i.source === 'snippet'), 'top-decl offers only snippets');
  expect(items.some((i) => i.label === 'LF') && items.some((i) => i.label === 'rec'),
    'top-decl has LF and rec');
}

{
  // Every snippet body must parse cleanly when dropped into a representative host.
  function errCount(src) {
    const tree = parser.parse(src);
    let n = 0;
    tree.iterate({ enter(node) { if (node.type.isError) n += 1; } });
    return n;
  }
  for (const snip of SNIPPETS['top-decl']) {
    expect(errCount(snip.insert + '\n') === 0,
      `top snippet ${snip.label} parses, errs=${errCount(snip.insert + '\n')}`);
  }
  for (const snip of SNIPPETS['expr-head']) {
    const host = `rec id : [⊢ nat] → [⊢ nat] =\n${snip.insert};\n`;
    expect(errCount(host) === 0, `expr snippet ${snip.label} parses in rec body`);
  }
  for (const snip of SNIPPETS['case-arm']) {
    const host = [
      'rec id : [⊢ nat] → [⊢ nat] =',
      'fn x ⇒ case x of',
      snip.insert,
      ';',
    ].join('\n');
    expect(errCount(host) === 0, `case-arm snippet parses`);
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

console.log('ok - autocomplete slice A');
