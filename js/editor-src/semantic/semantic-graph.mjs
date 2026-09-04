import { mergeDiagnostics } from '../ide/query-diag.mjs';
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

function sortedDiags(diags) {
  return (diags || []).slice().sort((a, b) => a.from - b.from || a.to - b.to);
}

function overlappingSorted(sorted, range) {
  const out = [];
  for (const d of sorted) {
    if (d.from >= range.to) break;
    if (d.to > range.from && rangesOverlap(range, d)) out.push(d);
  }
  return out;
}

function unresolvedFromRefs(refs) {
  const out = [];
  if (!refs) return out;
  for (const ref of refs) {
    if (ref.symbolId || ref.kind !== 'lower' || !ref.enclosingDeclarationId) continue;
    out.push(ref);
  }
  return out;
}

function refFingerprint(refs) {
  if (!refs || !refs.length) return '';
  return refs.map((r) => `${r.from}:${r.to}:${r.symbolId || ''}:${r.resolution || ''}:${r.kind || ''}`)
    .sort()
    .join('|');
}

function refFingerprintByOwner(symbolSnapshot) {
  const out = new Map();
  const byOwner = symbolSnapshot.referencesByOwner;
  if (!byOwner) return out;
  for (const [id, refs] of byOwner) out.set(id, refFingerprint(refs));
  return out;
}

function addEdgesFromRefs(edgeMap, refs, symbolsById) {
  if (!refs) return;
  for (const ref of refs) {
    if (!ref.symbolId || ref.resolution !== 'global') continue;
    const ownerId = ref.enclosingDeclarationId;
    if (!ownerId || ownerId === ref.symbolId) continue;
    const owner = symbolsById.get(ownerId);
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
}

function sameGlobalSpine(previous, symbolSnapshot) {
  const prevG = previous._globalSymbols;
  const nextG = symbolSnapshot.globalSymbols;
  if (!prevG || prevG.length !== nextG.length) return false;
  for (let i = 0; i < nextG.length; i += 1) {
    if (nextG[i].id !== prevG[i].id) return false;
    if (nextG[i].signatureHash !== prevG[i].signatureHash) return false;
  }
  return true;
}

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
    cascade(removed, buildInterfaceReverseDeps(previous.edgeMap), dirty);
    for (const id of removed) dirty.delete(id);
  }
  return { dirty, removed };
}

function fillNode(symbol, syntaxDiags, belugaDiags, blockedRefs, previous) {
  const diags = mergeDiagnostics(syntaxDiags, belugaDiags);
  const old = previous && previous.nodeMap.get(symbol.id);
  const safeOld = old
    && old.status !== STATUS.SYNTAX_FAULT
    && old.status !== STATUS.ERRORING
    ? old
    : null;
  return {
    node: {
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
    },
    meta: { diags, syntaxDiags, belugaDiags, blockedRefs, safeOld },
  };
}

export function createSemanticGraph() {
  let snapshot = null;

  function publish(
    nodeMap, edgeMap, meta, previous, syntaxSnapshot, symbolSnapshot,
    belugaDiagnostics, unresolvedByOwner, updateKind,
  ) {
    const changes = classifyChanges(nodeMap, previous);
    const { dirty, removed } = computeDirty(nodeMap, edgeMap, previous, changes);
    for (const [id, node] of nodeMap) {
      const { diags, syntaxDiags, belugaDiags, blockedRefs, safeOld } = meta.get(id);
      node.diagnostics = diags;
      node.status = syntaxDiags.length
        ? STATUS.SYNTAX_FAULT
        : belugaDiags.length
          ? STATUS.ERRORING
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
      _updateKind: updateKind,
      _tree: syntaxSnapshot.tree,
      _globalSymbols: symbolSnapshot.globalSymbols,
      _references: symbolSnapshot.references,
      _belugaDiagnostics: belugaDiagnostics,
      _unresolvedByOwner: unresolvedByOwner,
      _refFingerprintByOwner: refFingerprintByOwner(symbolSnapshot),
    };
    return snapshot;
  }

  function tryIncremental(previous, symbolSnapshot, syntaxSnapshot, belugaDiagnostics) {
    if (!previous?.nodeMap || !symbolSnapshot.referencesByOwner) return null;
    if (!sameGlobalSpine(previous, symbolSnapshot)) return null;

    const dirtyIds = new Set();
    const refDirtyIds = new Set();
    const prevFp = previous._refFingerprintByOwner;
    for (const symbol of symbolSnapshot.globalSymbols) {
      const old = previous.nodeMap.get(symbol.id);
      if (!old) return null;
      if (old.bodyHash !== symbol.bodyHash) dirtyIds.add(symbol.id);
      const refs = symbolSnapshot.referencesByOwner.get(symbol.id);
      const fp = refFingerprint(refs);
      if (prevFp && prevFp.get(symbol.id) !== fp) refDirtyIds.add(symbol.id);
    }
    const edgeDirtyIds = new Set([...dirtyIds, ...refDirtyIds]);

    const syntaxSorted = sortedDiags(syntaxSnapshot.syntaxDiagnostics || []);
    const belugaSorted = sortedDiags(belugaDiagnostics);
    const nodeMap = new Map();
    const meta = new Map();
    const unresolvedByOwner = new Map();
    for (const symbol of symbolSnapshot.globalSymbols) {
      const syntaxDiags = overlappingSorted(syntaxSorted, symbol.range);
      const belugaDiags = overlappingSorted(belugaSorted, symbol.range);
      const blockedRefs = unresolvedFromRefs(symbolSnapshot.referencesByOwner.get(symbol.id));
      unresolvedByOwner.set(symbol.id, blockedRefs);
      const filled = fillNode(symbol, syntaxDiags, belugaDiags, blockedRefs, previous);
      meta.set(symbol.id, filled.meta);
      nodeMap.set(symbol.id, filled.node);
    }

    const edgeMap = new Map();
    for (const edge of previous.edges) {
      if (edgeDirtyIds.has(edge.from)) continue;
      edgeMap.set(edge.id, {
        id: edge.id,
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
        references: edge.references,
      });
    }
    for (const id of edgeDirtyIds) {
      addEdgesFromRefs(edgeMap, symbolSnapshot.referencesByOwner.get(id), symbolSnapshot.symbolsById);
    }

    return publish(
      nodeMap, edgeMap, meta, previous, syntaxSnapshot, symbolSnapshot,
      belugaDiagnostics, unresolvedByOwner, 'incremental',
    );
  }

  function update(symbolSnapshot, syntaxSnapshot, options = {}) {
    const previous = options.previous !== undefined ? options.previous : snapshot;
    const belugaDiagnostics = options.belugaDiagnostics || [];
    // Same tree + same symbol arrays + same Beluga diag list: the graph cannot
    // have changed (lint is a pure function of the tree). Skip the rebuild.
    if (previous
      && previous._tree === syntaxSnapshot.tree
      && previous._globalSymbols === symbolSnapshot.globalSymbols
      && previous._references === symbolSnapshot.references
      && previous._belugaDiagnostics === belugaDiagnostics) {
      snapshot = { ...previous, version: syntaxSnapshot.version, _updateKind: 'identity' };
      return snapshot;
    }
    if (!options.forceFull) {
      const inc = tryIncremental(previous, symbolSnapshot, syntaxSnapshot, belugaDiagnostics);
      if (inc) return inc;
    }

    const nodeMap = new Map();
    const edgeMap = new Map();
    const syntaxSorted = sortedDiags(syntaxSnapshot.syntaxDiagnostics || []);
    const belugaSorted = sortedDiags(belugaDiagnostics);
    const unresolvedByOwner = new Map();
    const byOwner = symbolSnapshot.referencesByOwner;
    if (byOwner) {
      for (const [id, refs] of byOwner) unresolvedByOwner.set(id, unresolvedFromRefs(refs));
    } else {
      for (const ref of symbolSnapshot.references) {
        if (ref.symbolId || ref.kind !== 'lower' || !ref.enclosingDeclarationId) continue;
        const list = unresolvedByOwner.get(ref.enclosingDeclarationId) || [];
        list.push(ref);
        unresolvedByOwner.set(ref.enclosingDeclarationId, list);
      }
    }

    const meta = new Map();
    for (const symbol of symbolSnapshot.globalSymbols) {
      const syntaxDiags = overlappingSorted(syntaxSorted, symbol.range);
      const belugaDiags = overlappingSorted(belugaSorted, symbol.range);
      const blockedRefs = unresolvedByOwner.get(symbol.id) || [];
      const filled = fillNode(symbol, syntaxDiags, belugaDiags, blockedRefs, previous);
      meta.set(symbol.id, filled.meta);
      nodeMap.set(symbol.id, filled.node);
    }

    if (byOwner) {
      for (const refs of byOwner.values()) {
        addEdgesFromRefs(edgeMap, refs, symbolSnapshot.symbolsById);
      }
    } else {
      addEdgesFromRefs(edgeMap, symbolSnapshot.references, symbolSnapshot.symbolsById);
    }

    return publish(
      nodeMap, edgeMap, meta, previous, syntaxSnapshot, symbolSnapshot,
      belugaDiagnostics, unresolvedByOwner, 'full',
    );
  }

  function statusForSymbol(symbolId) {
    return snapshot?.nodeMap.get(symbolId)?.status || STATUS.UNKNOWN;
  }

  const named = (id) => ({ id, name: snapshot.nodeMap.get(id)?.name || null });

  function dependenciesOf(symbolId) {
    if (!snapshot) return [];
    return snapshot.edges
      .filter((edge) => edge.from === symbolId)
      .map((edge) => ({ ...named(edge.to), kind: edge.kind }));
  }

  function dependentsOf(symbolId) {
    if (!snapshot) return [];
    return snapshot.edges
      .filter((edge) => edge.to === symbolId)
      .map((edge) => ({ ...named(edge.from), kind: edge.kind }));
  }

  // Impact = the full blast radius of changing this declaration, in two tiers:
  //  • 'cascade' — transitive over INTERFACE (signature/notation) edges: changing
  //    this signature restructures each of these types in turn (recursively).
  //  • 'uses'    — a decl that calls this (or a cascaded decl) in its BODY: its
  //    proof/implementation needs re-checking, but its OWN type is unchanged, so it
  //    is a LEAF — never propagated further (a body-user's dependents are NOT hit).
  // Cascade membership wins over a 'uses' tag.
  function impactOf(symbolId) {
    if (!snapshot) return [];
    const cascadeSet = new Set();
    cascade([symbolId], buildInterfaceReverseDeps(snapshot.edgeMap), cascadeSet);
    const usesSet = new Set();
    for (const edge of snapshot.edges) {
      if (edge.kind !== EDGE_KIND.BODY) continue;
      if (edge.to !== symbolId && !cascadeSet.has(edge.to)) continue;
      if (edge.from === symbolId || cascadeSet.has(edge.from)) continue;
      usesSet.add(edge.from);
    }
    return [
      ...[...cascadeSet].map((id) => ({ ...named(id), kind: 'cascade' })),
      ...[...usesSet].map((id) => ({ ...named(id), kind: 'uses' })),
    ];
  }

  // Subgraph (nodes + typed edges) overlapping a document range, or the whole
  // graph when no selection. The data backbone for a dependency/diagram view —
  // not consumed by the UI yet, but the natural substrate for one.
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
