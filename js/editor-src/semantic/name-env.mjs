// Unified name environment: ONE answer to "is this name bound / defined here?"
// for lint, tint, hover, and completion — backed by the incremental symbol store
// instead of a whole-file tree walk.
//
// The store publishes its snapshot here keyed by the Lezer tree it was built
// from (a WeakMap, so discarded trees release their snapshots). A consumer
// holding a tree asks for the environment of THAT tree; a hit is proof the
// snapshot describes exactly the document being queried, so per-name lookups
// are O(1) map reads. A miss (engine not yet synced for this tree) returns
// null and the caller falls back to its legacy path — the environment is a
// fast lane, never a source of drift.
import { NAMESPACE } from './ids.mjs';
import { groupCtorNames, groupDefinedNames, findGroupSignature } from './project-prelude.mjs';

const IDENT = new Set(['LowerIdentifier', 'UpperIdentifier']);

const _envByTree = new WeakMap();
const _preludeByEnv = new WeakMap();
const EMPTY_CTORS = new Set();

export function publishNameEnv(tree, symbolsSnapshot) {
  if (!tree || !symbolsSnapshot || !symbolsSnapshot.globalsByName) return;
  _envByTree.set(tree, symbolsSnapshot);
}

export function nameEnvForTree(tree) {
  if (!tree) return null;
  const snap = _envByTree.get(tree);
  return snap && snap.globalsByName ? snap : null;
}

function persistGroup() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  const P = g.Persist;
  if (!P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') {
    return null;
  }
  try {
    const files = P.listFiles();
    const activeId = P.getActiveFileId();
    const getText = (id) => P.getFileText(id);
    return { files, activeId, getText };
  } catch (_) {
    return null;
  }
}

function preludeRecord(env) {
  if (_preludeByEnv.has(env)) return _preludeByEnv.get(env);
  const ctx = persistGroup();
  const rec = ctx
    ? {
      names: groupDefinedNames(ctx.files, ctx.activeId, ctx.getText),
      has(name) { return this.names.has(name); },
      signature(name) {
        return findGroupSignature(ctx.files, ctx.activeId, name, ctx.getText);
      },
    }
    : null;
  _preludeByEnv.set(env, rec);
  return rec;
}

// Does any global declaration with this name exist, matching the reference's
// case? Order-insensitive on purpose — parity with the tree-walk defMap answer
// the undefined-application lint historically relied on. Notation pragmas name
// operators, not declarations, and never count.
export function envHasGlobal(env, name, isUpper) {
  return !!envFindGlobal(env, name, isUpper);
}

export function envFindGlobal(env, name, isUpper) {
  const list = env.globalsByName.get(name);
  if (!list) return null;
  for (const symbol of list) {
    if (symbol.namespace === NAMESPACE.PRAGMA) continue;
    if ((symbol.definingNodeKind === 'UpperIdentifier') === isUpper) return symbol;
  }
  return null;
}

// Is a local binder with this name in scope covering `pos`?
export function envHasLocalCovering(env, name, pos) {
  return !!envFindLocalCovering(env, name, pos);
}

// Innermost local covering `pos` (smallest scope span; later-from on a tie).
export function envFindLocalCovering(env, name, pos) {
  const list = env.localsByName.get(name);
  if (!list) return null;
  let best = null;
  for (const symbol of list) {
    const nr = symbol.nameRange;
    const inName = nr && nr.from <= pos && pos < nr.to;
    const scope = symbol.scope;
    const inScope = scope && scope.from <= pos && pos <= scope.to;
    if (!inScope && !inName) continue;
    if (!best) { best = symbol; continue; }
    const bs = best.scope;
    const span = scope ? (scope.to - scope.from) : (nr.to - nr.from);
    const bestSpan = bs ? (bs.to - bs.from) : 1e15;
    if (span < bestSpan || (span === bestSpan && (scope ? scope.from : nr.from) >= (bs ? bs.from : 0))) {
      best = symbol;
    }
  }
  return best;
}

export function envHasPreludeName(env, name) {
  const rec = preludeRecord(env);
  return !!(rec && rec.has(name));
}

export function envPreludeSignature(env, name) {
  const rec = preludeRecord(env);
  return rec ? rec.signature(name) : null;
}

// Constructor / constant names defined in earlier suite files. Pattern
// collection uses this so a prelude head (`≡comm`) is not a local binder.
export function preludeCtorNames() {
  const ctx = persistGroup();
  if (!ctx) return EMPTY_CTORS;
  return groupCtorNames(ctx.files, ctx.activeId, ctx.getText);
}

// The identifier node the store recorded for a symbol (defNodeFrom/To), or null
// if the live tree no longer has that span (mid-parse).
export function envIdentNode(tree, symbol) {
  if (!tree || !symbol) return null;
  const from = symbol.defNodeFrom != null ? symbol.defNodeFrom : symbol.nameRange && symbol.nameRange.from;
  const to = symbol.defNodeTo != null ? symbol.defNodeTo : symbol.nameRange && symbol.nameRange.to;
  if (from == null || to == null) return null;
  for (const bias of [1, -1, 0]) {
    const n = tree.resolveInner(from, bias);
    if (n && IDENT.has(n.name) && n.from === from && n.to === to) return n;
  }
  return null;
}
