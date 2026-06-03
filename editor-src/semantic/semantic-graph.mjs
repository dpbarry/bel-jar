import { EDGE_KIND, NAMESPACE, STATUS } from './ids.mjs';

function edgeId(from, to, kind) {
  return `${from}->${to}:${kind}`;
}

function rangesOverlap(a, b) {
  return a.from < b.to && b.from < a.to;
}

function signatureBoundary(symbol) {
  const text = symbol.declarationText || '';
  const eq = text.indexOf('=');
  const semi = text.indexOf(';');
  if (eq >= 0) return symbol.range.from + eq;
  if (semi >= 0) return symbol.range.from + semi;
  return symbol.range.to;
}

function edgeKindFor(ref, owner) {
  if (!owner) return EDGE_KIND.BODY;
  if (owner.namespace === NAMESPACE.PRAGMA) return EDGE_KIND.NOTATION;
  return ref.from <= signatureBoundary(owner) ? EDGE_KIND.SIGNATURE : EDGE_KIND.BODY;
}

// Interface edges are the ones a dependent actually observes: a change to a
// declaration's signature (or notation) must re-check everyone who depends on
// it, but a change to its private body must not. Reverse index: target -> set
// of declarations that depend on it through an interface edge.
function buildInterfaceReverseDeps(edgeMap) {
  const rev = new Map();
  for (const edge of edgeMap.values()) {
    if (edge.kind !== EDGE_KIND.SIGNATURE && edge.kind !== EDGE_KIND.NOTATION) continue;
    let set = rev.get(edge.to);
    if (!set) { set = new Set(); rev.set(edge.to, set); }
    set.add(edge.from);
  }
  return rev;
}

function cascade(seeds, reverseDeps, into) {
  const queue = [...seeds];
  while (queue.length) {
    const id = queue.shift();
    const dependents = reverseDeps.get(id);
    if (!dependents) continue;
    for (const dep of dependents) {
      if (into.has(dep)) continue;
      into.add(dep);
      queue.push(dep);
    }
  }
}

// Classify each declaration against the previous snapshot by its stable
// SymbolId (stable identity is what makes this diff trustworthy across edits).
function classifyChanges(nodeMap, previous) {
  const changes = new Map();
  for (const [id, node] of nodeMap) {
    const old = previous && previous.nodeMap.get(id);
    if (!old) changes.set(id, 'added');
    else if (old.signatureHash !== node.signatureHash) changes.set(id, 'signature');
    else if (old.bodyHash !== node.bodyHash) changes.set(id, 'body');
    else changes.set(id, 'unchanged');
  }
  return changes;
}

// The minimal set of declarations that must be re-derived after this edit:
// changed declarations themselves, plus the transitive interface-dependents
// of signature/notation changes and of removed declarations. Body-only edits
// dirty just their own declaration. Everything else stays stale-known.
function computeDirty(nodeMap, edgeMap, previous, changes) {
  const dirty = new Set();
  const cascadeSeeds = [];
  for (const [id, kind] of changes) {
    if (kind === 'unchanged') continue;
    dirty.add(id);
    if (kind === 'added' || kind === 'signature') cascadeSeeds.push(id);
  }
  cascade(cascadeSeeds, buildInterfaceReverseDeps(edgeMap), dirty);

  const removed = previous
    ? [...previous.nodeMap.keys()].filter((id) => !nodeMap.has(id))
    : [];
  if (removed.length) {
    // Dependents of a deleted declaration only existed in the old graph.
    cascade(removed, buildInterfaceReverseDeps(previous.edgeMap), dirty);
    for (const id of removed) dirty.delete(id);
  }
  return { dirty, removed };
}

export function createSemanticGraph() {
  let snapshot = null;

  function update(symbolSnapshot, syntaxSnapshot, previous = snapshot) {
    const nodeMap = new Map();
    const edgeMap = new Map();
    const syntaxDiagnostics = syntaxSnapshot.syntaxDiagnostics || [];
    const unresolvedByOwner = new Map();

    for (const ref of symbolSnapshot.references) {
      if (ref.symbolId || ref.kind !== 'lower' || !ref.enclosingDeclarationId) continue;
      const list = unresolvedByOwner.get(ref.enclosingDeclarationId) || [];
      list.push(ref);
      unresolvedByOwner.set(ref.enclosingDeclarationId, list);
    }

    // Pass 1 — build nodes (signature/body hashes carried for diffing); the
    // re-derivation status is assigned after the dirty frontier is known.
    const meta = new Map();
    for (const symbol of symbolSnapshot.globalSymbols) {
      const diags = syntaxDiagnostics.filter((diag) => rangesOverlap(symbol.range, diag));
      const blockedRefs = unresolvedByOwner.get(symbol.id) || [];
      const old = previous && previous.nodeMap.get(symbol.id);
      const safeOld = old && old.status !== STATUS.SYNTAX_FAULT ? old : null;
      meta.set(symbol.id, { diags, blockedRefs, safeOld });
      nodeMap.set(symbol.id, {
        id: symbol.id,
        symbolId: symbol.id,
        documentId: symbol.documentId,
        name: symbol.name,
        namespace: symbol.namespace,
        label: symbol.label,
        range: symbol.range,
        nameRange: symbol.nameRange,
        signatureHash: symbol.signatureHash,
        bodyHash: symbol.bodyHash,
        status: STATUS.UNKNOWN,
        blocking: blockedRefs.length ? blockedRefs[0] : null,
        diagnostics: diags,
        cachedType: safeOld ? safeOld.cachedType : symbol.sourceText,
        sourceText: symbol.sourceText,
      });
    }

    // Pass 2 — typed dependency edges.
    for (const ref of symbolSnapshot.references) {
      if (!ref.symbolId || ref.resolution !== 'global') continue;
      const ownerId = ref.enclosingDeclarationId;
      if (!ownerId || ownerId === ref.symbolId) continue;
      const owner = symbolSnapshot.symbolsById.get(ownerId);
      if (!owner) continue;
      const kind = edgeKindFor(ref, owner);
      const id = edgeId(ownerId, ref.symbolId, kind);
      const existing = edgeMap.get(id);
      if (existing) {
        existing.references.push(ref);
      } else {
        edgeMap.set(id, {
          id,
          from: ownerId,
          to: ref.symbolId,
          kind,
          references: [ref],
        });
      }
    }

    // Pass 3 — incremental invalidation: classify changes and the minimal
    // dirty frontier, then assign status. Unchanged declarations stay
    // stale-known (their prior insight survives) instead of going dark.
    const changes = classifyChanges(nodeMap, previous);
    const { dirty, removed } = computeDirty(nodeMap, edgeMap, previous, changes);
    for (const [id, node] of nodeMap) {
      const { diags, blockedRefs, safeOld } = meta.get(id);
      node.status = diags.length
        ? STATUS.SYNTAX_FAULT
        : blockedRefs.length
          ? STATUS.BLOCKED
          : dirty.has(id)
            ? STATUS.DIRTY
            : (safeOld ? STATUS.STALE_KNOWN : STATUS.UNKNOWN);
    }

    snapshot = {
      documentId: syntaxSnapshot.documentId,
      version: syntaxSnapshot.version,
      nodes: [...nodeMap.values()],
      edges: [...edgeMap.values()],
      nodeMap,
      edgeMap,
      changes,
      dirty,
      removed,
    };
    return snapshot;
  }

  function statusForSymbol(symbolId) {
    return snapshot?.nodeMap.get(symbolId)?.status || STATUS.UNKNOWN;
  }

  const named = (id) => ({ id, name: snapshot.nodeMap.get(id)?.name || null });

  // What this declaration depends on (outgoing typed edges).
  function dependenciesOf(symbolId) {
    if (!snapshot) return [];
    return snapshot.edges
      .filter((edge) => edge.from === symbolId)
      .map((edge) => ({ ...named(edge.to), kind: edge.kind }));
  }

  // What depends on this declaration (incoming typed edges) — direct impact.
  function dependentsOf(symbolId) {
    if (!snapshot) return [];
    return snapshot.edges
      .filter((edge) => edge.to === symbolId)
      .map((edge) => ({ ...named(edge.from), kind: edge.kind }));
  }

  // Transitive blast radius: everything that must be re-checked if this
  // declaration's signature/notation changes (the same interface cascade the
  // dirty frontier uses). Excludes the declaration itself.
  function impactOf(symbolId) {
    if (!snapshot) return [];
    const into = new Set();
    cascade([symbolId], buildInterfaceReverseDeps(snapshot.edgeMap), into);
    return [...into].map(named);
  }

  function graphFor(selection = null) {
    if (!snapshot) return { nodes: [], edges: [] };
    if (!selection || selection.from == null || selection.to == null) {
      return { nodes: snapshot.nodes.slice(), edges: snapshot.edges.slice() };
    }
    const selected = new Set(snapshot.nodes
      .filter((node) => rangesOverlap(node.range, selection))
      .map((node) => node.id));
    for (const edge of snapshot.edges) {
      if (selected.has(edge.from) || selected.has(edge.to)) {
        selected.add(edge.from);
        selected.add(edge.to);
      }
    }
    return {
      nodes: snapshot.nodes.filter((node) => selected.has(node.id)),
      edges: snapshot.edges.filter((edge) => selected.has(edge.from) && selected.has(edge.to)),
    };
  }

  return {
    update,
    statusForSymbol,
    dependenciesOf,
    dependentsOf,
    impactOf,
    graphFor,
    getSnapshot: () => snapshot,
  };
}
