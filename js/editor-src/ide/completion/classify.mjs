import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import {
  contextAllowsLocals,
  expectedNamespacesAt,
  expectedNamespacesForContext,
  LOCALS_ONLY_NAMESPACES,
  predictedContextAt,
} from '../../semantic/symbol-store.mjs';
import { expectedGoalType } from './type-expect.mjs';
import { structureSlotAt } from './snippets.mjs';

// `Head.partial` — Observation in expressions, or error-recovery `.` in types.
function moduleAccessShape(doc, pos, token) {
  let dotAt = -1;
  if (token.text) {
    if (token.from > 0 && doc.sliceString(token.from - 1, token.from) === '.') {
      dotAt = token.from - 1;
    }
  } else if (pos > 0 && doc.sliceString(pos - 1, pos) === '.') {
    dotAt = pos - 1;
  }
  if (dotAt < 0) return null;

  let headTo = dotAt;
  let headFrom = headTo;
  while (headFrom > 0 && isIdentChar(doc.sliceString(headFrom - 1, headFrom))) {
    headFrom -= 1;
  }
  if (headFrom === headTo) return null;
  const headName = doc.sliceString(headFrom, headTo);
  if (!headName) return null;
  return {
    headName,
    from: token.text ? token.from : dotAt + 1,
    to: token.text ? token.to : dotAt + 1,
    query: token.text || '',
  };
}

const COMMENT = new Set(['LineComment', 'BlockComment']);
const ATOMIC = new Set(['LFAtomicType', 'LFAtomicTerm', 'CompAtomicType']);

// Positions that bind a fresh name — completing a binder is always wrong.
const BINDER_PARENT = new Set([
  'FnParam',
  'MLamParam',
  'PiBinder',
  'LFLambdaBinder',
  'ContextEntry',
  'SchemaSomeBindings',
  'CompTypeBinder',
  'LFBlockField',
  'ParameterBlockField',
  'RecBody',
  'LetDeclaration',
  'LFConstructor',
  'CompConstructor',
  'CompDestructor',
  'InductiveBody',
  'CoinductiveBody',
  'SchemaDeclaration',
  'TypedefDeclaration',
  'ModuleDeclaration',
  'LFDeclaration',
  'LFDatatypeDeclaration',
]);

const IDENT_CHAR = /[\p{L}\p{N}_'#$\u0080-\uFFFF]/u;

export function isIdentChar(ch) {
  return ch != null && ch !== '' && IDENT_CHAR.test(ch);
}

export function refKindFromPrefix(text) {
  const t = String(text || '');
  if (!t) return 'lower';
  const c = t[0];
  return c >= 'A' && c <= 'Z' ? 'upper' : 'lower';
}

function inComment(node) {
  for (let cur = node; cur; cur = cur.parent) {
    if (COMMENT.has(cur.name)) return true;
  }
  return false;
}

function matchIdentToken(doc, pos) {
  let from = pos;
  let to = pos;
  while (from > 0 && isIdentChar(doc.sliceString(from - 1, from))) from -= 1;
  while (to < doc.length && isIdentChar(doc.sliceString(to, to + 1))) to += 1;
  return { from, to, text: doc.sliceString(from, to) };
}

// Prefer the semantic engine's full tree (always covers the doc). CM's
// syntaxTree without a View is truncated (~3k chars); ensureSyntaxTree is the
// fallback when the engine snapshot is missing or stale.
function treeFor(state, engine, pos) {
  const snap = engine?.stores?.syntax?.getSnapshot?.();
  if (snap?.tree && snap.doc && snap.doc.length === state.doc.length) {
    return snap.tree;
  }
  const need = Math.min(state.doc.length, Math.max((pos || 0) + 512, 0));
  return ensureSyntaxTree(state, need, 100)
    || ensureSyntaxTree(state, state.doc.length, 5000)
    || syntaxTree(state);
}

function isBinderSite(tree, pos, token) {
  for (const bias of [-1, 1, 0]) {
    const n = tree.resolveInner(pos, bias);
    if (!n) continue;
    if (n.name === 'LowerIdentifier' || n.name === 'UpperIdentifier') {
      const p = n.parent;
      if (p && BINDER_PARENT.has(p.name)) return true;
      return false;
    }
  }
  if (!token.text) {
    for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
      // Expression territory wins over RecBody (binder parent for the rec name).
      if (ATOMIC.has(cur.name) || cur.name === 'AtomicExpression' || cur.name === 'AtomicPattern'
          || cur.name === 'Expression' || cur.name === 'CaseExpression' || cur.name === 'CaseBody'
          || cur.name === 'FnExpression' || cur.name === 'MLamExpression') {
        return false;
      }
      if (cur.name === 'RecBody') {
        // Name position is a binder; after `=` is the body (structure/expr head).
        for (let c = cur.firstChild; c; c = c.nextSibling) {
          if (c.name === '=' && pos >= c.to) return false;
        }
        return true;
      }
      if (BINDER_PARENT.has(cur.name)) return true;
    }
  }
  return false;
}

// Sync Lezer-only site classification. Never forces settlement.
// Holes (`?`) are Harpoon's surface — autocomplete declines them.
export function classifyCompletionSite(state, pos, engine) {
  const doc = state.doc;
  if (pos == null || pos < 0 || pos > doc.length) return { kind: 'none' };

  const tree = treeFor(state, engine, pos);
  const node = tree.resolveInner(pos, -1);
  if (inComment(node)) return { kind: 'none' };

  // Holes are Harpoon's surface — autocomplete stays out.
  for (let cur = node; cur; cur = cur.parent) {
    if (cur.name === 'Hole' || cur.name === 'UnderscoreHole') return { kind: 'none' };
    if (ATOMIC.has(cur.name) || cur.name === 'AtomicExpression' || cur.name === 'Expression') break;
  }
  if (doc.sliceString(Math.max(0, pos - 1), pos) === '?'
      || doc.sliceString(pos, Math.min(doc.length, pos + 1)) === '?') {
    // Named hole `?goal`: decline while cursor is in the hole token.
    let from = pos;
    while (from > 0 && doc.sliceString(from - 1, from) !== '?' && isIdentChar(doc.sliceString(from - 1, from))) {
      from -= 1;
    }
    if (from > 0 && doc.sliceString(from - 1, from) === '?') return { kind: 'none' };
    if (doc.sliceString(pos, Math.min(doc.length, pos + 1)) === '?') return { kind: 'none' };
  }

  const token = matchIdentToken(doc, pos);
  if (isBinderSite(tree, pos, token)) return { kind: 'none' };

  // Module member access (`Foo.bar` / `Foo.`): only when the head resolves to a
  // MODULE in the symbol store. Unknown head → fall through (Observation etc.).
  const access = moduleAccessShape(doc, pos, token);
  if (access) {
    const store = engine?.stores?.symbols;
    const mod = store && typeof store.resolveModuleNamed === 'function'
      ? store.resolveModuleNamed(access.headName, access.from)
      : null;
    if (mod) {
      return {
        kind: 'module-member',
        moduleName: mod.name,
        from: access.from,
        to: access.to,
        query: access.query,
        namespaces: null,
        refKind: refKindFromPrefix(access.query),
        maxJust: 2,
        allowLocals: false,
        localsOnly: false,
        idents: false,
      };
    }
  }

  const structure = structureSlotAt(tree, doc, pos, token.text);

  // After `case e of` (and between arms): only a `|` arm is legal. Letters get nothing.
  // Top-level: only declaration scaffolds (not every in-scope name).
  if (structure === 'case-arm' || structure === 'top-decl') {
    return {
      kind: 'structure',
      structure,
      from: token.from,
      to: token.to,
      query: token.text,
      namespaces: null,
      refKind: refKindFromPrefix(token.text),
      maxJust: 2,
      allowLocals: false,
      localsOnly: false,
      idents: false,
    };
  }

  const refKind = refKindFromPrefix(token.text);
  let namespaces = expectedNamespacesAt(tree, pos, refKind);
  let ctxName = predictedContextAt(tree, pos, refKind);
  if (!namespaces) {
    for (let cur = node; cur; cur = cur.parent) {
      if (ATOMIC.has(cur.name)) {
        namespaces = expectedNamespacesForContext(cur.name, refKind);
        ctxName = cur.name;
        break;
      }
    }
  }

  const localsOnly = namespaces === LOCALS_ONLY_NAMESPACES;
  const allowLocals = !namespaces || localsOnly || contextAllowsLocals(ctxName);

  const site = {
    kind: structure ? 'structure' : 'ident',
    structure,
    from: token.from,
    to: token.to,
    query: token.text,
    namespaces,
    refKind,
    maxJust: namespaces || structure ? 2 : 1,
    allowLocals,
    localsOnly,
    ctxName,
    idents: true,
  };
  const expectedType = expectedGoalType(tree, doc, { ...site, kind: 'ident' });
  if (expectedType) {
    site.expectedType = expectedType;
    site.maxJust = 3;
  }
  return site;
}
