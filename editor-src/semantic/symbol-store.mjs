import {
  astNodeId,
  NAMESPACE,
  rangeOf,
  referenceId,
  structuralSymbolId,
} from './ids.mjs';

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
    case NAMESPACE.REC_FUNCTION: return 'recursive function';
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

  function update(syntaxSnapshot) {
    const previous = snapshot;
    const { documentId, tree, doc } = syntaxSnapshot;
    const symbols = [];
    const globalSymbols = [];
    const localSymbols = [];
    const references = [];
    const referencesBySymbolId = new Map();
    const defByNameRange = new Map();
    const keyCounts = new Map();

    collectGlobalSymbols({ documentId, tree, doc, symbols, globalSymbols, defByNameRange, keyCounts });
    reconcileIdentity(globalSymbols, previous, identityRegistry);
    collectReferencesAndLocals({
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
    });

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
    return snapshot;
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

function collectGlobalSymbols(ctx) {
  const { tree, doc, keyCounts } = ctx;
  tree.iterate({
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
  documentId, doc, namespace, name, displayName, nameRange, definingNode, declarationNode,
  baseKey, structuralKey, isGlobal,
}) {
  const declarationText = slice(doc, declarationNode.from, declarationNode.to);
  const eq = declarationText.indexOf('=');
  const semi = declarationText.indexOf(';');
  const boundary = eq >= 0 ? eq : (semi >= 0 ? semi : declarationText.length);
  return {
    id: structuralSymbolId(documentId, namespace, structuralKey),
    baseKey,
    structuralKey,
    fingerprint: fingerprintOf(declarationText),
    signatureHash: fingerprintOf(declarationText.slice(0, boundary)),
    bodyHash: fingerprintOf(declarationText.slice(boundary)),
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
    sourceText: sourceSignature(declarationNode, definingNode, doc),
    declarationText,
    isGlobal,
  };
}

function collectReferencesAndLocals(ctx) {
  const localStack = [];

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
    localStack.push({ symbol, from: scope.from, to: scope.to });
  }

  function popLocalsEndingAt(to) {
    while (localStack.length && localStack[localStack.length - 1].to <= to) {
      localStack.pop();
    }
  }

  ctx.tree.iterate({
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
      const symbol = resolveReference(ctx.globalSymbols, localStack, name, refKind, range.from, node);
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

  for (const ref of ctx.references) {
    const decl = nearestDeclarationAt(ctx.globalSymbols, ref.from, ref.to);
    ref.enclosingDeclarationId = decl ? decl.id : null;
  }
}

function resolveReference(globalSymbols, localStack, name, refKind, from, node) {
  for (let i = localStack.length - 1; i >= 0; i--) {
    const { symbol, to, from: scopeFrom } = localStack[i];
    if (scopeFrom <= from && from <= to && symbol.name === name) return symbol;
  }

  const expected = expectedNamespaces(node, refKind);
  const allowed = expected
    ? (symbol) => expected.has(symbol.namespace)
    : (symbol) => isCompatibleGlobal(refKind, symbol.namespace);

  const candidates = globalSymbols
    .filter((symbol) => symbol.name === name)
    .filter((symbol) => nameVisible(symbol, from))
    .filter(allowed)
    .sort((a, b) => b.nameRange.from - a.nameRange.from);
  return candidates[0] || null;
}

function nearestDeclarationAt(globalSymbols, from, to) {
  return globalSymbols
    .filter((symbol) => spanContains(symbol.range, from, to))
    .sort((a, b) => (a.range.to - a.range.from) - (b.range.to - b.range.from))[0] || null;
}
