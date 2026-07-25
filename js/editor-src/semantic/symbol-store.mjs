import {
  astNodeId,
  astNodeIdAt,
  NAMESPACE,
  rangeOf,
  referenceId,
  referenceIdAt,
  structuralSymbolId,
} from './ids.mjs';
import { semanticDeclText } from './check-gate.mjs';
import { timeSync } from '../perf/check-trace.mjs';

const IDENT = new Set(['LowerIdentifier', 'UpperIdentifier']);
const NOTATION_PRAGMA = new Set(['InfixPragma', 'PrefixPragma']);
const GLOBAL_DECL_PARENT = new Set([
  'LFDeclaration',
  'LFDatatypeDeclaration',
  'LFConstructor',
  'SchemaDeclaration',
  'TypedefDeclaration',
  'LetDeclaration',
  'ModuleDeclaration',
  'InductiveBody',
  'CoinductiveBody',
  'CompConstructor',
  'CompDestructor',
  'RecBody',
]);

const TYPEISH = new Set([
  'LFType',
  'LFKind',
  'CompType',
  'CompKind',
  'ContextualType',
  'LFBlock',
]);

const LOCAL_BINDER = new Set([
  'PiBinder',
  'CompTypeBinder',
  'QuantifiedBinder',
  'FnParam',
  'MLamParam',
  'LFLambdaBinder',
  'SchemaElement',
  'ContextEntry',
  'LFBlockField',
]);

const SCOPE_DELIMITERS = Object.freeze({
  FnParam: ['FnExpression'],
  MLamParam: ['MLamExpression'],
  LFLambdaBinder: ['LFLambda'],
  PiBinder: ['LFKind', 'LFType'],
  CompTypeBinder: ['QuantifiedBinder', 'CompKind', 'CompType'],
  ContextEntry: ['ContextualType', 'ContextualObject', 'SubstitutionType', 'ParameterType'],
  LFBlockField: ['LFBlock'],
  SchemaElement: ['SchemaDeclaration'],
});

function scopeSpanFor(binderNode, identNode) {
  const kinds = SCOPE_DELIMITERS[binderNode.name];
  let construct = binderNode.parent || binderNode;
  if (kinds) {
    for (let cur = binderNode.parent; cur; cur = cur.parent) {
      if (kinds.includes(cur.name)) { construct = cur; break; }
    }
  }
  return { from: identNode.to, to: construct.to, kind: binderNode.name };
}

const LOWER_GLOBAL_NAMESPACES = new Set([
  NAMESPACE.LF_TYPE_FAMILY,
  NAMESPACE.LF_CONSTANT,
  NAMESPACE.LF_CONSTRUCTOR,
  NAMESPACE.SCHEMA,
  NAMESPACE.TYPEDEF,
  NAMESPACE.REC_FUNCTION,
]);

const UPPER_GLOBAL_NAMESPACES = new Set([
  NAMESPACE.COMP_TYPE,
  NAMESPACE.COMP_CONSTRUCTOR,
  NAMESPACE.MODULE,
  NAMESPACE.TYPEDEF,
]);

function slice(doc, from, to) {
  return doc.sliceString(from, to);
}

function firstIdentChild(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (IDENT.has(c.name)) return c;
    if (c.name === 'ParameterVariable' || c.name === 'SubstitutionVariable') {
      const sigil = c.firstChild;
      if (!sigil || (sigil.name !== '#' && sigil.name !== '$')) continue;
      const id = sigil.nextSibling;
      if (id && IDENT.has(id.name)) return id;
    }
  }
  return null;
}

// A mutual LF block (`LF n … and a … and p …`) parses as ONE
// LFDatatypeDeclaration whose direct identifier children are the family heads:
// the first one, then one after each `and`. Each head names its own type family
// and needs its own symbol — returning only firstIdentChild drops `a`/`p` from
// the symbol store (so nav / find-refs / inspector / graph never see them).
function lfDatatypeHeads(node) {
  const heads = [];
  let sawFirst = false;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'AndKeyword') {
      for (let h = c.nextSibling; h; h = h.nextSibling) {
        if (IDENT.has(h.name)) { heads.push(h); break; }
        if (h.name === 'AndKeyword' || h.name === 'LFConstructor') break;
      }
      continue;
    }
    if (IDENT.has(c.name) && !sawFirst) {
      sawFirst = true;
      heads.push(c);
    }
  }
  return heads;
}

function nextTypeSibling(ident) {
  for (let s = ident.nextSibling; s; s = s.nextSibling) {
    if (TYPEISH.has(s.name)) return s;
  }
  return null;
}

function declName(node, doc) {
  const id = firstIdentChild(node);
  return id ? slice(doc, id.from, id.to) : '?';
}

function baseStructuralKey(declarationNode, ownName, doc) {
  const qualifier = [];
  for (let cur = declarationNode.parent; cur; cur = cur.parent) {
    if (GLOBAL_DECL_PARENT.has(cur.name)) qualifier.push(declName(cur, doc));
  }
  qualifier.reverse();
  const leaf = `${declarationNode.name}#${ownName}`;
  return qualifier.length ? `${qualifier.join('/')}/${leaf}` : leaf;
}

function disambiguate(base, keyCounts) {
  const n = keyCounts.get(base) || 0;
  keyCounts.set(base, n + 1);
  return n ? `${base}~${n}` : base;
}

function fingerprintOf(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (((h << 5) + h) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function leafName(baseKey) {
  return baseKey.slice(baseKey.lastIndexOf('#') + 1);
}

function identityGroupKey(symbol) {
  const hash = symbol.baseKey.lastIndexOf('#');
  const stem = hash >= 0 ? symbol.baseKey.slice(0, hash) : symbol.baseKey;
  return `${symbol.namespace}|${stem}`;
}

function substituteQualifier(baseKey, renameMap, ambiguous) {
  const parts = baseKey.split('/');
  let changed = false;
  for (let i = 0; i < parts.length - 1; i++) {
    const mapped = renameMap.get(parts[i]);
    if (mapped && !ambiguous.has(parts[i])) {
      parts[i] = mapped;
      changed = true;
    }
  }
  return changed ? parts.join('/') : null;
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const k = keyFn(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function labelFor(namespace, nodeKind) {
  switch (namespace) {
    case NAMESPACE.LF_TYPE_FAMILY: return 'LF type family';
    case NAMESPACE.LF_CONSTANT: return 'LF constant';
    case NAMESPACE.LF_CONSTRUCTOR: return 'LF constructor';
    case NAMESPACE.SCHEMA: return 'schema';
    case NAMESPACE.TYPEDEF: return 'typedef';
    case NAMESPACE.COMP_TYPE: return nodeKind === 'CoinductiveBody' ? 'coinductive type' : 'computation type';
    case NAMESPACE.COMP_CONSTRUCTOR:
      return nodeKind === 'CompDestructor' ? 'computation destructor' : 'computation constructor';
    case NAMESPACE.REC_FUNCTION: return 'rec. func.';
    case NAMESPACE.MODULE: return 'module';
    case NAMESPACE.PRAGMA:
      if (nodeKind === 'PrefixPragma') return 'prefix pragma';
      if (nodeKind === 'InfixPragma') return 'infix pragma';
      return 'pragma';
    case NAMESPACE.LOCAL_UPPER:
    case NAMESPACE.LOCAL_LOWER: return 'local binder';
    default: return nodeKind || 'symbol';
  }
}

function namespaceForGlobal(parent, ident, doc) {
  const name = parent.name;
  if (name === 'LFDatatypeDeclaration') return NAMESPACE.LF_TYPE_FAMILY;
  if (name === 'LFConstructor') return NAMESPACE.LF_CONSTRUCTOR;
  if (name === 'SchemaDeclaration') return NAMESPACE.SCHEMA;
  if (name === 'TypedefDeclaration') return NAMESPACE.TYPEDEF;
  if (name === 'LetDeclaration') return NAMESPACE.REC_FUNCTION;
  if (name === 'ModuleDeclaration') return NAMESPACE.MODULE;
  if (name === 'InductiveBody' || name === 'CoinductiveBody') return NAMESPACE.COMP_TYPE;
  if (name === 'CompConstructor' || name === 'CompDestructor') return NAMESPACE.COMP_CONSTRUCTOR;
  if (name === 'RecBody') return NAMESPACE.REC_FUNCTION;
  if (name === 'LFDeclaration') {
    const rhs = nextTypeSibling(ident);
    if (rhs && (rhs.name === 'LFKind' || /\btype\b/.test(slice(doc, rhs.from, rhs.to)))) {
      return NAMESPACE.LF_TYPE_FAMILY;
    }
    return NAMESPACE.LF_CONSTANT;
  }
  return ident.name === 'UpperIdentifier' ? NAMESPACE.COMP_TYPE : NAMESPACE.LF_CONSTANT;
}

function sourceSignature(parent, ident, doc) {
  const rhs = nextTypeSibling(ident);
  if (!rhs) return '';
  return slice(doc, rhs.from, rhs.to).trim();
}

function extendedRange(node) {
  const p = node.parent;
  if (p?.name === 'ParameterVariable' || p?.name === 'SubstitutionVariable') {
    return { from: p.from, to: node.to };
  }
  let from = node.from;
  for (let cur = node.prevSibling; cur && (cur.name === '#' || cur.name === '$'); cur = cur.prevSibling) {
    from = cur.from;
  }
  return { from, to: node.to };
}

function refKindForNode(node) {
  return node.name === 'UpperIdentifier' ? 'upper' : 'lower';
}

function isCompatibleGlobal(refKind, namespace) {
  if (refKind === 'upper') return UPPER_GLOBAL_NAMESPACES.has(namespace);
  return LOWER_GLOBAL_NAMESPACES.has(namespace);
}

const LF_TYPE_HEAD = Object.freeze(new Set([NAMESPACE.LF_TYPE_FAMILY]));
const LF_TERM_HEAD = Object.freeze(new Set([NAMESPACE.LF_CONSTRUCTOR, NAMESPACE.LF_CONSTANT]));
const COMP_TYPE_LOWER = Object.freeze(new Set([
  NAMESPACE.SCHEMA, NAMESPACE.COMP_TYPE, NAMESPACE.TYPEDEF, NAMESPACE.LF_TYPE_FAMILY,
]));
const COMP_TYPE_UPPER = Object.freeze(new Set([
  NAMESPACE.COMP_TYPE, NAMESPACE.COMP_CONSTRUCTOR, NAMESPACE.TYPEDEF, NAMESPACE.MODULE,
]));
const FIXITY_PRAGMA = new Set(['InfixPragma', 'PrefixPragma', 'OpaquePragma']);

function expectedNamespaces(node, refKind) {
  const parent = node.parent;
  const ctx = parent ? parent.name : '';
  switch (ctx) {
    case 'LFAtomicType':
      // Uppercase in LF type position is normally a metavariable, but Beluga
      // also permits uppercase LF type-family constants. Allow resolution to a
      // defined LF head; if none exists the ref stays unresolved (a metavar).
      return LF_TYPE_HEAD;
    case 'LFAtomicTerm':
      // Likewise uppercase here is usually a metavariable, but may name an
      // uppercase LF constant. Resolve to one if defined, else leave unresolved.
      return LF_TERM_HEAD;
    case 'CompAtomicType':
      return refKind === 'upper' ? COMP_TYPE_UPPER : COMP_TYPE_LOWER;
    default:
      if (FIXITY_PRAGMA.has(ctx)) return LF_TERM_HEAD;
      return null;
  }
}

function nameVisible(symbol, from) {
  return symbol.nameRange.from < from;
}

function sortByRange(a, b) {
  return a.range.from - b.range.from || a.range.to - b.range.to;
}

function contains(range, pos) {
  return range.from <= pos && pos <= range.to;
}

function spanContains(range, from, to = from) {
  return range.from <= from && to <= range.to;
}

function textMatchesIdentChar(ch) {
  return !/[\s()[\]{};,%]/u.test(ch);
}

function validateNewName(newName) {
  return typeof newName === 'string' && newName.length > 0 && [...newName].every(textMatchesIdentChar);
}

export function createSymbolStore() {
  let snapshot = null;
  let identityRegistry = new Map();
  // Per-top-level-declaration partition of the previous snapshot — the substrate
  // for incremental reuse. null disables the incremental path (always safe).
  let incrementalIndex = null;
  const stats = { full: 0, incremental: 0, identical: 0, bails: 0 };

  // Common tail of both update paths: identity registry, id map, declarations
  // list, snapshot assembly, and the incremental index for the NEXT update.
  function finishUpdate({
    documentId, syntaxSnapshot, symbols, globalSymbols, localSymbols, references,
    referencesBySymbolId,
  }) {
    identityRegistry = new Map();
    for (const symbol of globalSymbols) identityRegistry.set(symbol.structuralKey, symbol.id);

    const symbolsById = new Map();
    for (const symbol of symbols) symbolsById.set(symbol.id, symbol);

    const declarations = globalSymbols.slice().sort(sortByRange);
    snapshot = {
      documentId,
      version: syntaxSnapshot.version,
      symbols,
      globalSymbols,
      localSymbols,
      references,
      symbolsById,
      referencesBySymbolId,
      declarations,
      syntaxSnapshot,
    };
    incrementalIndex = buildIncrementalIndex(snapshot);
    return snapshot;
  }

  function fullUpdate(syntaxSnapshot) {
    const previous = snapshot;
    const { documentId, tree, doc } = syntaxSnapshot;
    const symbols = [];
    const globalSymbols = [];
    const localSymbols = [];
    const references = [];
    const referencesBySymbolId = new Map();
    const defByNameRange = new Map();
    const keyCounts = new Map();

    timeSync('sym.collectGlobals', () => collectGlobalSymbols({ documentId, tree, doc, symbols, globalSymbols, defByNameRange, keyCounts }));
    reconcileIdentity(globalSymbols, previous, identityRegistry);
    timeSync('sym.collectRefs', () => collectReferencesAndLocals({
      documentId,
      tree,
      doc,
      symbols,
      globalSymbols,
      localSymbols,
      references,
      referencesBySymbolId,
      defByNameRange,
      keyCounts,
    }));

    return finishUpdate({
      documentId, syntaxSnapshot, symbols, globalSymbols, localSymbols, references,
      referencesBySymbolId,
    });
  }

  // Incremental update: reuse every top-level declaration the ChangeSet did not
  // touch (position-shifted), recompute only the touched ones with a bounded
  // subtree walk. Equivalence with fullUpdate is the contract
  // (tests/test-symbolstore-incremental-equivalence.mjs); any situation whose
  // equivalence is not PROVABLE cheaply throws BAIL and falls back to the full
  // rebuild, so the fast path can only ever be a pure win.
  //
  // Why reuse is sound (the prefix-closure argument):
  //  - Locals never escape their top-level declaration, so an untouched
  //    declaration's locals and local resolutions are exact after shifting.
  //  - Global resolution is position-ordered (a reference resolves to the
  //    latest EARLIER matching global). If the ordered global interface
  //    (structuralKey, namespace, name) of the changed region is unchanged, all
  //    cross-declaration resolutions keep their targets; if it changed, reuse
  //    is only kept when every reused bucket precedes every interface change
  //    (then no reused reference could ever have seen the changed globals).
  //  - structuralKey disambiguation (`~n`) counts same-base keys across the
  //    whole file in walk order; the cached per-bucket (base, prior) sequences
  //    are replayed and verified so reused keys are byte-identical.
  function tryIncrementalUpdate(syntaxSnapshot, changes) {
    const previous = snapshot;
    const index = incrementalIndex;
    const { documentId, tree, doc } = syntaxSnapshot;
    if (!previous || !index || !changes) return null;
    if (index.documentId !== documentId) return null;
    if (typeof changes.mapPos !== 'function' || typeof changes.touchesRange !== 'function') return null;
    // The ChangeSet must span exactly previous-doc -> this-doc; anything else
    // means a sync happened out of band and reuse would be unsound.
    if (changes.length !== index.docLength || changes.newLength !== doc.length) return null;

    const newNodes = topChildNodes(tree);
    const keyOf = (from, to, name) => `${from}:${to}:${name}`;
    const newIdxByKey = new Map();
    for (let j = 0; j < newNodes.length; j += 1) {
      newIdxByKey.set(keyOf(newNodes[j].from, newNodes[j].to, newNodes[j].name), j);
    }

    // Pair untouched old buckets with identically-mapped new spans. Text probes
    // at both ends guard against a misaligned ChangeSet slipping past the
    // length checks.
    const plans = new Array(newNodes.length).fill(null);
    const removedOld = [];
    let maxReusedOldIdx = -1;
    let maxReusedNewIdx = -1;
    for (let oldIdx = 0; oldIdx < index.buckets.length; oldIdx += 1) {
      const bucket = index.buckets[oldIdx];
      let paired = false;
      if (!changes.touchesRange(bucket.from, bucket.to)) {
        const nf = changes.mapPos(bucket.from, 1);
        const nt = changes.mapPos(bucket.to, -1);
        const j = newIdxByKey.get(keyOf(nf, nt, bucket.name));
        if (j != null && plans[j] == null
          && doc.sliceString(nf, Math.min(nt, nf + PROBE_LEN)) === bucket.headProbe
          && doc.sliceString(Math.max(nf, nt - PROBE_LEN), nt) === bucket.tailProbe) {
          plans[j] = { bucket, delta: nf - bucket.from };
          paired = true;
          if (oldIdx > maxReusedOldIdx) maxReusedOldIdx = oldIdx;
          if (j > maxReusedNewIdx) maxReusedNewIdx = j;
        }
      }
      if (!paired) removedOld.push({ bucket, oldIdx });
    }

    try {
      // Pass 1 — globals, in document order, replaying the whole-file key
      // disambiguation counts exactly as the full pass would produce them.
      const keyCounts = new Map();
      const defByNameRange = new Map();
      const symbols = [];
      const globalSymbols = [];
      const recomputedGlobals = new Array(newNodes.length).fill(null);
      for (let j = 0; j < newNodes.length; j += 1) {
        const plan = plans[j];
        if (plan) {
          for (const k of plan.bucket.globalKeys) {
            const cur = keyCounts.get(k.base) || 0;
            if (cur !== k.prior) throw BAIL;
            keyCounts.set(k.base, cur + 1);
          }
          plan.globals = plan.delta === 0
            ? plan.bucket.globals
            : plan.bucket.globals.map((s) => shiftSymbol(s, plan.delta, documentId));
          for (const s of plan.globals) { symbols.push(s); globalSymbols.push(s); }
        } else {
          const ctx = {
            documentId,
            tree,
            doc,
            symbols: [],
            globalSymbols: [],
            defByNameRange,
            keyCounts,
            rootNode: newNodes[j],
          };
          collectGlobalSymbols(ctx);
          recomputedGlobals[j] = ctx.globalSymbols;
          for (const s of ctx.globalSymbols) { symbols.push(s); globalSymbols.push(s); }
        }
      }

      // Interface guard: did the changed region alter the global surface?
      const removedIface = [];
      for (const { bucket } of removedOld) {
        for (const e of bucket.interface) removedIface.push(e);
      }
      const addedIface = [];
      for (let j = 0; j < newNodes.length; j += 1) {
        const list = recomputedGlobals[j];
        if (list) for (const s of list) addedIface.push(interfaceEntry(s));
      }
      let ifaceEqual = removedIface.length === addedIface.length;
      if (ifaceEqual) {
        for (let i = 0; i < removedIface.length; i += 1) {
          if (removedIface[i] !== addedIface[i]) { ifaceEqual = false; break; }
        }
      }
      if (ifaceEqual) {
        // Same surface. Reused references keep their targets — but only when
        // each changed global's identity is decided by the registry (unique
        // baseKey): a duplicated baseKey routes reconcileIdentity through
        // fingerprint pools where an edited declaration's id may be reassigned,
        // stranding reused references. Rare; take the full rebuild.
        if (addedIface.length) {
          const newBaseCounts = new Map();
          for (const s of globalSymbols) {
            newBaseCounts.set(s.baseKey, (newBaseCounts.get(s.baseKey) || 0) + 1);
          }
          for (let j = 0; j < newNodes.length; j += 1) {
            const list = recomputedGlobals[j];
            if (!list) continue;
            for (const s of list) {
              if ((index.globalBaseCounts.get(s.baseKey) || 0) !== 1) throw BAIL;
              if (newBaseCounts.get(s.baseKey) !== 1) throw BAIL;
            }
          }
        }
      } else {
        // Interface changed: sound only when every change sits AFTER every
        // reused bucket (a pure suffix — e.g. typing a new declaration at the
        // end). Earlier references can never resolve forward, so the prefix is
        // untouched by construction.
        for (const { bucket, oldIdx } of removedOld) {
          if (bucket.interface.length && oldIdx < maxReusedOldIdx) throw BAIL;
        }
        for (let j = 0; j < newNodes.length; j += 1) {
          if (recomputedGlobals[j] && recomputedGlobals[j].length && j < maxReusedNewIdx) throw BAIL;
        }
      }

      reconcileIdentity(globalSymbols, previous, identityRegistry);

      // Pass 2 — locals + references, in document order.
      const localSymbols = [];
      const references = [];
      const globalsByName = new Map();
      for (const symbol of globalSymbols) {
        const list = globalsByName.get(symbol.name);
        if (list) list.push(symbol);
        else globalsByName.set(symbol.name, [symbol]);
      }
      for (let j = 0; j < newNodes.length; j += 1) {
        const plan = plans[j];
        if (plan) {
          for (const k of plan.bucket.localKeys) {
            const cur = keyCounts.get(k.base) || 0;
            if (cur !== k.prior) throw BAIL;
            keyCounts.set(k.base, cur + 1);
          }
          const locals = plan.delta === 0
            ? plan.bucket.locals
            : plan.bucket.locals.map((s) => shiftSymbol(s, plan.delta, documentId));
          for (const s of locals) { symbols.push(s); localSymbols.push(s); }
          if (plan.delta === 0) {
            for (const r of plan.bucket.refs) references.push(r);
          } else {
            for (const r of plan.bucket.refs) references.push(shiftReference(r, plan.delta, documentId));
          }
        } else {
          collectReferencesAndLocals({
            documentId,
            tree,
            doc,
            symbols,
            globalSymbols,
            localSymbols,
            references,
            referencesBySymbolId: new Map(), // rebuilt below from `references`
            defByNameRange,
            keyCounts,
            rootNode: newNodes[j],
            globalsByName,
            enclosureGlobals: recomputedGlobals[j] || [],
          });
        }
      }

      const referencesBySymbolId = new Map();
      for (const ref of references) {
        if (!ref.symbolId) continue;
        const list = referencesBySymbolId.get(ref.symbolId);
        if (list) list.push(ref);
        else referencesBySymbolId.set(ref.symbolId, [ref]);
      }

      return finishUpdate({
        documentId, syntaxSnapshot, symbols, globalSymbols, localSymbols, references,
        referencesBySymbolId,
      });
    } catch (err) {
      if (err === BAIL) return null;
      throw err;
    }
  }

  function update(syntaxSnapshot, opts = {}) {
    const prev = snapshot;
    // Same doc + same tree (selection-only or re-issued sync): the previous
    // snapshot is still exact — republish it at the new syntax version.
    if (prev && prev.syntaxSnapshot
      && prev.documentId === syntaxSnapshot.documentId
      && prev.syntaxSnapshot.doc === syntaxSnapshot.doc
      && prev.syntaxSnapshot.tree === syntaxSnapshot.tree) {
      stats.identical += 1;
      snapshot = { ...prev, version: syntaxSnapshot.version, syntaxSnapshot };
      return snapshot;
    }
    if (!opts.forceFull && opts.changes) {
      const inc = timeSync('sym.incremental', () => tryIncrementalUpdate(syntaxSnapshot, opts.changes));
      if (inc) {
        stats.incremental += 1;
        return inc;
      }
      stats.bails += 1;
    }
    stats.full += 1;
    return fullUpdate(syntaxSnapshot);
  }

  function pragmaAt(pos) {
    if (!snapshot) return null;
    return snapshot.globalSymbols
      .filter((symbol) => symbol.namespace === NAMESPACE.PRAGMA && spanContains(symbol.range, pos))
      .sort((a, b) => (a.range.to - a.range.from) - (b.range.to - b.range.from))[0] || null;
  }

  function symbolAt(pos) {
    if (!snapshot) return null;
    return snapshot.symbols
      .filter((symbol) => contains(symbol.nameRange, pos))
      .sort((a, b) => (a.nameRange.to - a.nameRange.from) - (b.nameRange.to - b.nameRange.from))[0] || null;
  }

  function referenceAt(pos) {
    if (!snapshot) return null;
    return snapshot.references
      .filter((ref) => contains(ref.range, pos))
      .sort((a, b) => (a.range.to - a.range.from) - (b.range.to - b.range.from))[0] || null;
  }

  function declarationAt(pos) {
    if (!snapshot) return null;
    return snapshot.declarations
      .filter((symbol) => spanContains(symbol.range, pos))
      .sort((a, b) => (a.range.to - a.range.from) - (b.range.to - b.range.from))[0] || null;
  }

  function definitionAt(pos) {
    const pragma = pragmaAt(pos);
    if (pragma) return pragma;
    const ref = referenceAt(pos);
    if (ref && ref.symbolId) return snapshot.symbolsById.get(ref.symbolId) || null;
    return symbolAt(pos);
  }

  function referencesOf(id) {
    if (!snapshot) return [];
    return (snapshot.referencesBySymbolId.get(id) || []).slice();
  }

  function implicitSitesForDeclaration(declId) {
    if (!snapshot || !declId) return [];
    const doc = snapshot.syntaxSnapshot && snapshot.syntaxSnapshot.doc;
    if (!doc) return [];
    const seen = new Map();
    for (const ref of snapshot.references) {
      if (ref.symbolId || ref.enclosingDeclarationId !== declId) continue;
      if (!ref.name || seen.has(ref.name)) continue;
      const line = doc.lineAt(ref.from);
      seen.set(ref.name, {
        name: ref.name,
        line: line.number,
        col: ref.from - line.from,
        position: ref.from,
      });
    }
    return [...seen.values()];
  }

  function renamePreview(id, newName) {
    if (!snapshot) return { ok: false, reason: 'no-semantic-snapshot', edits: [] };
    if (!validateNewName(newName)) return { ok: false, reason: 'invalid-name', edits: [] };
    const symbol = snapshot.symbolsById.get(id);
    if (!symbol) return { ok: false, reason: 'unknown-symbol', edits: [] };
    const conflict = snapshot.symbols.find((other) => (
      other.id !== id &&
      other.namespace === symbol.namespace &&
      other.name === newName &&
      other.documentId === symbol.documentId &&
      other.isGlobal === symbol.isGlobal
    ));
    if (conflict) {
      return { ok: false, reason: 'name-conflict', conflict, edits: [] };
    }
    const refs = referencesOf(id);
    const edits = [{ from: symbol.nameRange.from, to: symbol.nameRange.to, insert: newName }]
      .concat(refs.map((ref) => ({ from: ref.range.from, to: ref.range.to, insert: newName })))
      .sort((a, b) => a.from - b.from || a.to - b.to);
    return { ok: true, symbol, edits };
  }

  function queryAt(pos) {
    if (!snapshot) return null;
    const pragma = pragmaAt(pos);
    if (pragma) {
      return {
        symbol: pragma,
        reference: null,
        definition: pragma,
        references: referencesOf(pragma.id),
        hoverType: '',
        diagnostics: [],
        status: 'unknown',
        actions: ['definition', 'references', 'rename-preview'],
      };
    }
    const ref = referenceAt(pos);
    const symbol = ref && ref.symbolId ? snapshot.symbolsById.get(ref.symbolId) : symbolAt(pos);
    if (!symbol && !ref) return null;
    const target = symbol || null;
    return {
      symbol: target,
      reference: ref,
      definition: target,
      references: target ? referencesOf(target.id) : [],
      hoverType: target ? target.sourceText : '',
      diagnostics: [],
      status: 'unknown',
      actions: target ? ['definition', 'references', 'rename-preview'] : [],
    };
  }

  function exportIdentity() {
    return [...identityRegistry];
  }
  function importIdentity(entries) {
    identityRegistry = new Map(entries || []);
  }

  return {
    update,
    pragmaAt,
    symbolAt,
    referenceAt,
    declarationAt,
    definitionAt,
    referencesOf,
    implicitSitesForDeclaration,
    renamePreview,
    queryAt,
    exportIdentity,
    importIdentity,
    getSnapshot: () => snapshot,
    getIncrementalStats: () => ({ ...stats }),
  };
}

// ---------------------------------------------------------------------------
// Incremental-update machinery (see tryIncrementalUpdate above for the model).

const BAIL = Symbol('symbol-store-incremental-bail');
const PROBE_LEN = 12;

function topChildNodes(tree) {
  const out = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.to > node.from) out.push(node);
  }
  return out;
}

function interfaceEntry(sym) {
  return `${sym.structuralKey}${sym.namespace}${sym.name}`;
}

// Clone a cached symbol with every absolute offset shifted by delta. Ids are
// structural (position-free) and text hashes are content-based, so they carry
// over — except local symbols, whose fingerprint is defined as the (new)
// nameRange start. delta 0 reuses the object itself (the dominant case: all
// declarations before the edit point).
function shiftSymbol(sym, delta, documentId) {
  const nameRange = { from: sym.nameRange.from + delta, to: sym.nameRange.to + delta };
  const out = {
    ...sym,
    range: { from: sym.range.from + delta, to: sym.range.to + delta },
    nameRange,
    defNodeFrom: sym.defNodeFrom + delta,
    defNodeTo: sym.defNodeTo + delta,
    astNodeId: astNodeIdAt(documentId, sym.definingNodeKind, sym.defNodeFrom + delta, sym.defNodeTo + delta),
  };
  if (sym.scope) {
    out.scope = { from: sym.scope.from + delta, to: sym.scope.to + delta, kind: sym.scope.kind };
  }
  if (!sym.isGlobal) {
    const fp = `${nameRange.from}`;
    out.fingerprint = fp;
    out.signatureHash = fp;
    out.bodyHash = fp;
  }
  return out;
}

function shiftReference(ref, delta, documentId) {
  const from = ref.from + delta;
  const to = ref.to + delta;
  return {
    ...ref,
    from,
    to,
    range: { from, to },
    id: referenceIdAt(documentId, ref.nodeKind, from, to),
  };
}

// Partition a fresh snapshot by the top-level children of the parse tree, and
// record, per bucket: its symbols/references (in order), the (base, prior)
// disambiguation-count sequence each symbol consumed, its ordered global
// interface, and short text probes at both ends. Returns null (disabling the
// incremental path) if anything violates the bucket model — e.g. a symbol
// straddling top-level siblings or a structuralKey the replay can't reproduce.
function buildIncrementalIndex(snap) {
  const syntax = snap.syntaxSnapshot;
  if (!syntax || !syntax.tree || !syntax.doc) return null;
  const { tree, doc } = syntax;
  const nodes = topChildNodes(tree);
  const buckets = nodes.map((n) => ({
    from: n.from,
    to: n.to,
    name: n.name,
    headProbe: doc.sliceString(n.from, Math.min(n.to, n.from + PROBE_LEN)),
    tailProbe: doc.sliceString(Math.max(n.from, n.to - PROBE_LEN), n.to),
    globals: [],
    locals: [],
    refs: [],
    globalKeys: [],
    localKeys: [],
    interface: [],
  }));
  const bucketAt = (pos) => {
    let lo = 0;
    let hi = buckets.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const b = buckets[mid];
      if (pos < b.from) hi = mid - 1;
      else if (pos >= b.to) lo = mid + 1;
      else return b;
    }
    return null;
  };
  const counts = new Map();
  for (const sym of snap.symbols) {
    const prior = counts.get(sym.baseKey) || 0;
    counts.set(sym.baseKey, prior + 1);
    if ((prior ? `${sym.baseKey}~${prior}` : sym.baseKey) !== sym.structuralKey) return null;
    const b = bucketAt(sym.nameRange.from);
    if (!b || sym.range.from < b.from || sym.range.to > b.to) return null;
    if (sym.isGlobal) {
      b.globals.push(sym);
      b.globalKeys.push({ base: sym.baseKey, prior });
      b.interface.push(interfaceEntry(sym));
    } else {
      b.locals.push(sym);
      b.localKeys.push({ base: sym.baseKey, prior });
    }
  }
  for (const ref of snap.references) {
    const b = bucketAt(ref.from);
    if (!b || ref.from < b.from || ref.to > b.to) return null;
    b.refs.push(ref);
  }
  const globalBaseCounts = new Map();
  for (const s of snap.globalSymbols) {
    globalBaseCounts.set(s.baseKey, (globalBaseCounts.get(s.baseKey) || 0) + 1);
  }
  return {
    documentId: snap.documentId,
    docLength: doc.length,
    buckets,
    globalBaseCounts,
  };
}

function mintId(symbol) {
  return structuralSymbolId(symbol.documentId, symbol.namespace, symbol.structuralKey);
}

function reconcileIdentity(globalSymbols, previous, registry) {
  const baseCount = new Map();
  for (const s of globalSymbols) baseCount.set(s.baseKey, (baseCount.get(s.baseKey) || 0) + 1);

  const usedIds = new Set();
  const unmatched = [];

  for (const symbol of globalSymbols) {
    const reuse = baseCount.get(symbol.baseKey) === 1 ? registry.get(symbol.structuralKey) : null;
    if (reuse && !usedIds.has(reuse)) {
      symbol.id = reuse;
      usedIds.add(reuse);
    } else {
      unmatched.push(symbol);
    }
  }

  if (!previous) {
    for (const symbol of unmatched) symbol.id = mintId(symbol);
    return;
  }

  const oldUnused = previous.globalSymbols.filter((old) => !usedIds.has(old.id));
  const oldByGroup = groupBy(oldUnused, identityGroupKey);

  const stillNew = [];
  for (const symbol of unmatched) {
    const pool = oldByGroup.get(identityGroupKey(symbol));
    const hit = pool && pool.find((old) => old.fingerprint === symbol.fingerprint && !usedIds.has(old.id));
    if (hit) {
      symbol.id = hit.id;
      usedIds.add(hit.id);
    } else {
      stillNew.push(symbol);
    }
  }

  const parentRenames = new Map();
  const ambiguousNames = new Set();
  const newByGroup = groupBy(stillNew, identityGroupKey);
  const leftover = [];
  for (const [group, news] of newByGroup) {
    const olds = (oldByGroup.get(group) || []).filter((old) => !usedIds.has(old.id));
    if (news.length === 1 && olds.length === 1) {
      news[0].id = olds[0].id;
      usedIds.add(olds[0].id);
      const nn = leafName(news[0].baseKey);
      const on = leafName(olds[0].baseKey);
      if (nn !== on) {
        if (parentRenames.has(nn) && parentRenames.get(nn) !== on) ambiguousNames.add(nn);
        else parentRenames.set(nn, on);
      }
    } else {
      leftover.push(...news);
    }
  }

  const stillLeft = [];
  for (const symbol of leftover) {
    const candidate = parentRenames.size ? substituteQualifier(symbol.baseKey, parentRenames, ambiguousNames) : null;
    const oldId = candidate ? registry.get(candidate) : null;
    if (oldId && !usedIds.has(oldId)) {
      symbol.id = oldId;
      usedIds.add(oldId);
    } else {
      stillLeft.push(symbol);
    }
  }

  for (const symbol of stillLeft) {
    let id = mintId(symbol);
    if (usedIds.has(id)) {
      let k = 1;
      while (usedIds.has(`${id}~b${k}`)) k++;
      id = `${id}~b${k}`;
    }
    symbol.id = id;
    usedIds.add(id);
  }
}

// Run a collection walk over the whole tree, or — when ctx.rootNode is set —
// over just that node's subtree (the incremental path recomputing one changed
// top-level declaration).
function runCollectionWalk(ctx, spec) {
  if (ctx.rootNode) ctx.rootNode.cursor().iterate(spec.enter, spec.leave);
  else ctx.tree.iterate(spec);
}

function collectGlobalSymbols(ctx) {
  const { doc, keyCounts } = ctx;
  runCollectionWalk(ctx, {
    enter(ref) {
      if (NOTATION_PRAGMA.has(ref.name)) {
        registerNotationPragma(ctx, ref.node);
        return;
      }
      if (!GLOBAL_DECL_PARENT.has(ref.name)) return;
      const node = ref.node;
      // A mutual LF block flattens several type-family heads into one node; emit
      // a symbol for each head, not just the first.
      const heads = node.name === 'LFDatatypeDeclaration'
        ? lfDatatypeHeads(node)
        : [firstIdentChild(node)].filter(Boolean);
      for (const ident of heads) {
        const namespace = namespaceForGlobal(node, ident, doc);
        const nameRange = extendedRange(ident);
        const name = slice(doc, nameRange.from, nameRange.to);
        const base = baseStructuralKey(node, name, doc);
        const symbol = makeSymbol({
          ...ctx,
          namespace,
          name,
          nameRange,
          definingNode: ident,
          declarationNode: node,
          baseKey: base,
          structuralKey: disambiguate(base, keyCounts),
          isGlobal: true,
        });
        ctx.symbols.push(symbol);
        ctx.globalSymbols.push(symbol);
        ctx.defByNameRange.set(`${nameRange.from}:${nameRange.to}`, symbol);
      }
    },
  });
}

function registerNotationPragma(ctx, node) {
  const { doc, keyCounts } = ctx;
  const op = firstIdentChild(node);
  if (!op) return;
  const nameRange = { from: node.from, to: op.from };
  const opName = slice(doc, op.from, op.to);
  const lineText = slice(doc, node.from, node.to).trim().replace(/\.\s*$/, '');
  const base = baseStructuralKey(node, opName, doc);
  const symbol = makeSymbol({
    ...ctx,
    namespace: NAMESPACE.PRAGMA,
    name: opName,
    displayName: lineText,
    nameRange,
    definingNode: node,
    declarationNode: node,
    baseKey: base,
    structuralKey: disambiguate(base, keyCounts),
    isGlobal: true,
  });
  ctx.symbols.push(symbol);
  ctx.globalSymbols.push(symbol);
  ctx.defByNameRange.set(`${nameRange.from}:${nameRange.to}`, symbol);
}

function makeSymbol({
  documentId, doc, tree, namespace, name, displayName, nameRange, definingNode, declarationNode,
  baseKey, structuralKey, isGlobal,
}) {
  const declarationText = slice(doc, declarationNode.from, declarationNode.to);
  let fingerprint;
  let signatureHash;
  let bodyHash;
  if (isGlobal) {
    const semanticText = semanticDeclText(doc, declarationNode, tree);
    const eq = semanticText.indexOf('=');
    const semi = semanticText.indexOf(';');
    const boundary = eq >= 0 ? eq : (semi >= 0 ? semi : semanticText.length);
    fingerprint = fingerprintOf(semanticText);
    signatureHash = fingerprintOf(semanticText.slice(0, boundary));
    bodyHash = fingerprintOf(semanticText.slice(boundary));
  } else {
    // Locals are not identity-reconciled; position-stable ids are enough.
    fingerprint = signatureHash = bodyHash = `${nameRange.from}`;
  }
  return {
    id: structuralSymbolId(documentId, namespace, structuralKey),
    baseKey,
    structuralKey,
    fingerprint,
    signatureHash,
    bodyHash,
    astNodeId: astNodeId(documentId, definingNode),
    documentId,
    namespace,
    name,
    displayName: displayName || name,
    label: labelFor(namespace, declarationNode.name),
    nodeKind: declarationNode.name,
    definingNodeKind: definingNode.name,
    range: rangeOf(declarationNode),
    nameRange,
    // Defining-node span, kept so a cached symbol's astNodeId can be re-derived
    // after a pure position shift (incremental reuse) without holding the node.
    defNodeFrom: definingNode.from,
    defNodeTo: definingNode.to,
    sourceText: sourceSignature(declarationNode, definingNode, doc),
    declarationText,
    isGlobal,
  };
}

function collectReferencesAndLocals(ctx) {
  const localStack = [];
  const localsByName = new Map();
  const refStart = ctx.references.length;
  let globalsByName = ctx.globalsByName;
  if (!globalsByName) {
    globalsByName = new Map();
    for (const symbol of ctx.globalSymbols) {
      const list = globalsByName.get(symbol.name);
      if (list) list.push(symbol);
      else globalsByName.set(symbol.name, [symbol]);
    }
  }

  function pushLocal(node, ident) {
    const nameRange = extendedRange(ident);
    const name = slice(ctx.doc, nameRange.from, nameRange.to);
    const namespace = ident.name === 'UpperIdentifier' ? NAMESPACE.LOCAL_UPPER : NAMESPACE.LOCAL_LOWER;
    const base = baseStructuralKey(node, name, ctx.doc);
    const symbol = makeSymbol({
      ...ctx,
      namespace,
      name,
      nameRange,
      definingNode: ident,
      declarationNode: node,
      baseKey: base,
      structuralKey: disambiguate(base, ctx.keyCounts),
      isGlobal: false,
    });
    const scope = scopeSpanFor(node, ident);
    symbol.scope = scope;
    symbol.range = { from: scope.from, to: scope.to };
    ctx.symbols.push(symbol);
    ctx.localSymbols.push(symbol);
    ctx.defByNameRange.set(`${nameRange.from}:${nameRange.to}`, symbol);
    const entry = { symbol, from: scope.from, to: scope.to };
    localStack.push(entry);
    const bucket = localsByName.get(name);
    if (bucket) bucket.push(entry);
    else localsByName.set(name, [entry]);
  }

  function popLocalsEndingAt(to) {
    while (localStack.length && localStack[localStack.length - 1].to <= to) {
      const entry = localStack.pop();
      const bucket = localsByName.get(entry.symbol.name);
      if (bucket && bucket.length) bucket.pop();
    }
  }

  runCollectionWalk(ctx, {
    enter(ref) {
      const node = ref.node;

      if (LOCAL_BINDER.has(ref.name)) {
        const ident = firstIdentChild(node);
        if (ident) pushLocal(node, ident);
      }

      if (!IDENT.has(ref.name)) return;
      const range = extendedRange(node);
      if (ctx.defByNameRange.has(`${range.from}:${range.to}`)) return;

      const name = slice(ctx.doc, range.from, range.to);
      const refKind = refKindForNode(node);
      const symbol = resolveReference(
        ctx.globalSymbols, localStack, name, refKind, range.from, node, globalsByName, localsByName,
      );
      const reference = {
        id: referenceId(ctx.documentId, node),
        documentId: ctx.documentId,
        name,
        displayName: name,
        kind: refKind,
        range,
        from: range.from,
        to: range.to,
        nodeKind: ref.name,
        enclosingDeclarationId: null,
        symbolId: symbol ? symbol.id : null,
        namespace: symbol ? symbol.namespace : null,
        resolution: symbol ? (symbol.isGlobal ? 'global' : 'local') : 'unresolved',
      };
      ctx.references.push(reference);
      if (reference.symbolId) {
        const list = ctx.referencesBySymbolId.get(reference.symbolId) || [];
        list.push(reference);
        ctx.referencesBySymbolId.set(reference.symbolId, list);
      }
    },
    leave(ref) {
      popLocalsEndingAt(ref.to);
    },
  });

  // A reference's enclosing declaration is always inside the same top-level
  // declaration (global symbol ranges never span top-level siblings), so the
  // incremental path narrows the candidate set to the recomputed bucket's own
  // globals via ctx.enclosureGlobals; the full path scans all of them.
  const enclosureGlobals = ctx.enclosureGlobals || ctx.globalSymbols;
  for (let i = refStart; i < ctx.references.length; i += 1) {
    const ref = ctx.references[i];
    const decl = nearestDeclarationAt(enclosureGlobals, ref.from, ref.to);
    ref.enclosingDeclarationId = decl ? decl.id : null;
  }
}

function resolveReference(
  globalSymbols, localStack, name, refKind, from, node, globalsByName = null, localsByName = null,
) {
  const localBucket = localsByName?.get(name);
  if (localBucket && localBucket.length) {
    for (let i = localBucket.length - 1; i >= 0; i--) {
      const { symbol, to, from: scopeFrom } = localBucket[i];
      if (scopeFrom <= from && from <= to) return symbol;
    }
  } else {
    for (let i = localStack.length - 1; i >= 0; i--) {
      const { symbol, to, from: scopeFrom } = localStack[i];
      if (scopeFrom <= from && from <= to && symbol.name === name) return symbol;
    }
  }

  const expected = expectedNamespaces(node, refKind);
  const allowed = expected
    ? (symbol) => expected.has(symbol.namespace)
    : (symbol) => isCompatibleGlobal(refKind, symbol.namespace);

  const pool = globalsByName?.get(name) || globalSymbols.filter((symbol) => symbol.name === name);
  let best = null;
  let bestFrom = -1;
  for (const symbol of pool) {
    if (!nameVisible(symbol, from) || !allowed(symbol)) continue;
    if (symbol.nameRange.from > bestFrom) {
      best = symbol;
      bestFrom = symbol.nameRange.from;
    }
  }
  return best;
}

function nearestDeclarationAt(globalSymbols, from, to) {
  let best = null;
  let bestSize = Infinity;
  for (const symbol of globalSymbols) {
    if (!spanContains(symbol.range, from, to)) continue;
    const size = symbol.range.to - symbol.range.from;
    if (size < bestSize) {
      best = symbol;
      bestSize = size;
    }
  }
  return best;
}
