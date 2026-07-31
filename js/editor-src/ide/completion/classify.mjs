import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import {
  contextAllowsLocals,
  expectedNamespacesAt,
  expectedNamespacesForContext,
  LOCALS_ONLY_NAMESPACES,
  predictedContextAt,
} from '../../semantic/symbol-store.mjs';
import { NAMESPACE } from '../../semantic/ids.mjs';
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
  const c = (t[0] === '$' || t[0] === '#') ? t[1] : t[0];
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

// Like matchIdentToken, but keeps a leading `--` / `-` run when it starts a
// token (after BOL/whitespace). Otherwise `--p` ranks as query `p` and every
// label containing `p` competes with `--prefix`.
function matchCompletionToken(doc, pos) {
  const tok = matchIdentToken(doc, pos);
  let from = tok.from;
  let dashFrom = from;
  while (dashFrom > 0 && doc.sliceString(dashFrom - 1, dashFrom) === '-') dashFrom -= 1;
  if (dashFrom < from) {
    const before = dashFrom === 0 ? '' : doc.sliceString(dashFrom - 1, dashFrom);
    if (dashFrom === 0 || /\s/.test(before)) from = dashFrom;
  } else if (!tok.text && pos > 0) {
    // Bare `--` / `-` with no letters yet.
    dashFrom = pos;
    while (dashFrom > 0 && doc.sliceString(dashFrom - 1, dashFrom) === '-') dashFrom -= 1;
    if (dashFrom < pos) {
      const before = dashFrom === 0 ? '' : doc.sliceString(dashFrom - 1, dashFrom);
      if (dashFrom === 0 || /\s/.test(before)) {
        return { from: dashFrom, to: pos, text: doc.sliceString(dashFrom, pos) };
      }
    }
  }
  if (from === tok.from) return tok;
  return { from, to: tok.to, text: doc.sliceString(from, tok.to) };
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

function binderParentStillBinding(node, pos) {
  if (node.name === 'RecBody') {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.name === '=' && pos >= c.to) return false;
    }
    return true;
  }
  let colon = null;
  let body = null;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === ':' && !colon) colon = c;
    // Schema/module use bare `=`; LF/rec use `: … =`. Either ends the binder.
    if (c.name === '=' || c.name === '.') body = c;
  }
  // After `:` is kind/type ascription territory — not a fresh-name binder.
  if (colon && pos >= colon.to) return false;
  if (body && pos >= body.to) return false;
  return true;
}

function isBinderSite(tree, pos, token, engine, doc) {
  for (const bias of [-1, 1, 0]) {
    const n = tree.resolveInner(pos, bias);
    if (!n) continue;
    if (n.name === 'LowerIdentifier' || n.name === 'UpperIdentifier') {
      const p = n.parent;
      if (p && BINDER_PARENT.has(p.name)) return true;
      // AppPattern arguments (not the constructor head) bind fresh names.
      if (p && (p.name === 'AtomicPattern' || p.name === 'LFAtomicTerm')) {
        if (isPatternArgBinder(p, n, engine, doc)) return true;
      }
      return false;
    }
  }
  if (!token.text) {
    for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
      // Expression territory wins over RecBody (binder parent for the rec name).
      if (ATOMIC.has(cur.name) || cur.name === 'AtomicExpression' || cur.name === 'AtomicPattern'
          || cur.name === 'Expression' || cur.name === 'CaseExpression' || cur.name === 'CaseBody'
          || cur.name === 'FnExpression' || cur.name === 'MLamExpression'
          || cur.name === 'LFKind' || cur.name === 'CompKind'
          || cur.name === 'LFType' || cur.name === 'CompType'
          || cur.name === 'LFTerm' || cur.name === 'LFLambda' || cur.name === 'LFPi') {
        // Empty spot in an AppPattern / boxed LF (incl. λ body) is a binder slot.
        if ((cur.name === 'AtomicPattern' || cur.name === 'LFAtomicTerm'
            || cur.name === 'LFTerm' || cur.name === 'LFLambda' || cur.name === 'LFPi')
            && isPatternArgBinder(cur, null, engine, doc)) {
          return true;
        }
        return false;
      }
      if (BINDER_PARENT.has(cur.name)) {
        return binderParentStillBinding(cur, pos);
      }
    }
  }
  return false;
}

function isKnownLfHead(engine, name, pos) {
  if (!name || !engine?.stores?.symbols?.visibleSymbolsAt) return false;
  return engine.stores.symbols.visibleSymbolsAt(pos, {
    namespaces: new Set([NAMESPACE.LF_CONSTRUCTOR, NAMESPACE.LF_CONSTANT]),
  }).some((s) => s.name === name && s.isGlobal);
}

function underSubstitution(node) {
  for (let p = node; p; p = p.parent) {
    if (p.name === 'Substitution' || p.name === 'SubstBody' || p.name === 'SubstElem') {
      return true;
    }
    if (p.name === 'ContextualObject' || p.name === 'ContextualType'
        || p.name === 'AtomicPattern' || p.name === 'AppPattern'
        || p.name === 'CaseBranch' || p.name === 'LetExpression') {
      return false;
    }
  }
  return false;
}

function underAscribedPattern(node) {
  for (let cur = node; cur; cur = cur.parent) {
    if (cur.name === 'Pattern') {
      let sawColon = false;
      for (let c = cur.firstChild; c; c = c.nextSibling) {
        if (c.name === ':') sawColon = true;
        if (sawColon && (c.name === 'CompType' || c.name === 'CompAppType' || c.name === 'CompAtomicType')) {
          return true;
        }
      }
    }
    if (cur.name === 'CaseBranch' || cur.name === 'LetExpression' || cur.name === 'CofunctionBranch'
        || cur.name === 'Copattern' || cur.name === 'Expression' || cur.name === 'RecBody') {
      return false;
    }
  }
  return false;
}

function sameSpan(a, b) {
  return !!a && !!b && a.from === b.from && a.to === b.to && a.name === b.name;
}

// Leftmost LF term atom under an application (or a bare atomic).
function isLfAppHead(ident) {
  if (!ident) return false;
  let atomic = ident.parent;
  while (atomic && atomic.name !== 'LFAtomicTerm') {
    if (atomic.name === 'ContextualObject' || atomic.name === 'ContextualType'
        || atomic.name === 'AtomicPattern' || atomic.name === 'AppPattern') {
      return false;
    }
    atomic = atomic.parent;
  }
  if (!atomic) return false;
  let cur = atomic;
  while (cur.parent
      && (cur.parent.name === 'LFAppTerm' || cur.parent.name === 'LFTerm'
        || cur.parent.name === 'LFType')) {
    const parent = cur.parent;
    let first = null;
    for (let c = parent.firstChild; c; c = c.nextSibling) {
      if (c.name === 'LFAppTerm' || c.name === 'LFAtomicTerm' || c.name === 'LFTerm'
          || c.name === 'LFType' || c.name === 'LFLambda' || c.name === 'LFPi') {
        first = c;
        break;
      }
    }
    if (!sameSpan(first, cur)) return false;
    cur = parent;
  }
  return true;
}

// True when `atom` is a non-head AtomicPattern / boxed LF var under a Pattern
// (including nested under LFLambda / LFPi after ⊢).
function isPatternArgBinder(atom, ident, engine, doc) {
  let inPattern = false;
  let inCopattern = false;
  let owner = null;
  for (let p = atom.parent; p; p = p.parent) {
    if (p.name === 'Pattern' || p.name === 'AppPattern' || p.name === 'Copattern') inPattern = true;
    if (p.name === 'Copattern') inCopattern = true;
    if (p.name === 'CaseBranch' || p.name === 'LetExpression' || p.name === 'CofunctionBranch') {
      if (!inPattern) return false;
      owner = p;
      break;
    }
    if (p.name === 'Expression' || p.name === 'RecBody' || p.name === 'FnExpression') return false;
  }
  if (!inPattern) return false;
  if (inCopattern) return true;
  // Let LHS pattern binders (bare `let ms =` / ascribed `let y : T =`).
  if (owner?.name === 'LetExpression') return true;

  // Substitution args after ⊢ are uses of already-bound names, not fresh binders.
  if (ident && underSubstitution(ident)) return false;

  // Boxed term variable after ⊢ in a pattern (any LF depth under the box).
  const probe = ident || atom;
  for (let p = atom; p; p = p.parent) {
    if (p.name === 'ContextualObject' || p.name === 'ContextualType') {
      let turnstile = null;
      for (let c = p.firstChild; c; c = c.nextSibling) {
        if (c.name === 'Turnstile') turnstile = c;
      }
      if (turnstile && probe.from >= turnstile.to) {
        // Known LF ctor/constant heads are references, not binders.
        if (ident && doc && isLfAppHead(ident)) {
          const name = doc.sliceString(ident.from, ident.to);
          if (isKnownLfHead(engine, name, ident.from)) return false;
        }
        return true;
      }
    }
    if (p.name === 'AtomicPattern' || p.name === 'AppPattern') break;
  }

  // Ascribed pattern binders (`y : T` / `(t : T)`), including under case.
  if (underAscribedPattern(atom)) return true;

  // Walk up to AppPattern and see if this atom is not the leftmost.
  let app = atom.parent;
  while (app && app.name !== 'AppPattern') app = app.parent;
  if (!app || app.name !== 'AppPattern') return false;
  const atoms = [];
  function flat(n) {
    if (n.name === 'AtomicPattern') { atoms.push(n); return; }
    if (n.name === 'AppPattern') {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.name === 'AppPattern' || c.name === 'AtomicPattern') flat(c);
      }
    }
  }
  flat(app);
  if (atoms.length < 2) return false;
  const target = atom.name === 'AtomicPattern' ? atom
    : atoms.find((a) => ident && ident.from >= a.from && ident.to <= a.to);
  return target != null && target !== atoms[0];
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

  const token = matchCompletionToken(doc, pos);
  const structure = structureSlotAt(tree, doc, pos, token.text);

  // Structure-only slots win over binder decline: typing `LF` / `rec` / `--in`
  // or an infix assoc prefix must not look like a fresh binder name.
  if (structure === 'case-arm' || structure === 'top-decl'
      || structure === 'ctor-line' || structure === 'ctx-entry'
      || structure === 'infix-assoc') {
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

  if (isBinderSite(tree, pos, token, engine, doc)) return { kind: 'none' };

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

  // Remaining structure slots (kinds, schema-body, expr-head) keep idents.
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
  // Kind slots always predict a sort, even on empty `: ` with no atomic node yet.
  if (structure === 'lf-kind' && !namespaces) {
    namespaces = expectedNamespacesForContext('LFAtomicType', refKind);
    ctxName = ctxName || 'LFAtomicType';
  }
  if (structure === 'comp-kind' && !namespaces) {
    namespaces = expectedNamespacesForContext('CompAtomicType', refKind);
    ctxName = ctxName || 'CompAtomicType';
  }
  // Schema body after `=` may be a bare LF type family (`schema g = nat`).
  if (structure === 'schema-body' && !namespaces) {
    namespaces = expectedNamespacesForContext('LFAtomicType', refKind);
    ctxName = ctxName || 'LFAtomicType';
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
