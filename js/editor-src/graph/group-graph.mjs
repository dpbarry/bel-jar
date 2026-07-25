// Suite-wide (cross-file) dependency graph.
//
// The live `semantic/semantic-graph` is single-document: it only links a
// reference to a symbol DEFINED IN THE SAME FILE. A Beluga development is an
// ordered suite though (a `.cfg` lists files in load order), and most real
// dependencies cross files — a proof in `fol.bel` uses constructors declared in
// the prelude `fol.elf`. This module builds one graph over all files visible to
// the active file (prelude predecessors + the active file), by running the SAME
// symbol store per file and then resolving each reference's name across the
// suite (closest-prelude-wins, like the rest of the cross-file index). Node ids
// are the store's structural ids (already document-scoped, so unique per file).
//
// Consumed by the inspector (Used by / Depends on / Impact) and the dependency
// graph view, so both finally see cross-file edges.

import { Text } from '@codemirror/state';
import { parser } from '../beluga-parser.js';
import { createSymbolStore } from '../semantic/symbol-store.mjs';
import { EDGE_KIND, NAMESPACE } from '../semantic/ids.mjs';
import { editorTextForIndexing, developmentFilesFor } from '../semantic/project-prelude.mjs';

function signatureBoundary(symbol) {
  const text = symbol.declarationText || '';
  const eq = text.indexOf('=');
  const semi = text.indexOf(';');
  if (eq >= 0) return symbol.range.from + eq;
  if (semi >= 0) return symbol.range.from + semi;
  return symbol.range.to;
}

// Same rule as semantic-graph.edgeKindFor, replicated to keep this module from
// importing engine internals.
function edgeKindFor(ref, owner) {
  if (!owner) return EDGE_KIND.BODY;
  if (owner.namespace === NAMESPACE.PRAGMA) return EDGE_KIND.NOTATION;
  return ref.from <= signatureBoundary(owner) ? EDGE_KIND.SIGNATURE : EDGE_KIND.BODY;
}

const fileCache = new Map(); // indexed-src -> { globalSymbols, references, symbolsById }

function snapshotForFile(fileId, fileName, rawText) {
  const src = editorTextForIndexing(rawText, fileName);
  const cached = fileCache.get(src);
  if (cached) return cached;
  let result = { globalSymbols: [], references: [], symbolsById: new Map() };
  try {
    const store = createSymbolStore();
    const snap = store.update({
      documentId: fileId,
      tree: parser.parse(src),
      doc: Text.of(src.split('\n')),
    });
    result = {
      globalSymbols: snap.globalSymbols,
      references: snap.references,
      symbolsById: snap.symbolsById,
    };
  } catch (_) { /* keep empty result */ }
  if (fileCache.size > 64) fileCache.clear();
  fileCache.set(src, result);
  return result;
}

function makeNode(symbol, file, order) {
  return {
    id: symbol.id,
    name: symbol.displayName || symbol.name,
    namespace: symbol.namespace,
    label: symbol.label,
    range: symbol.range,
    nameRange: symbol.nameRange,
    fileId: file.id,
    fileName: file.name,
    order,
  };
}

// Build the cross-file graph for the development the active file belongs to.
// Returns a query object; `nodes` is a Map(id -> node), `edges` an array of
// { from, to, kind }. Empty (but valid) when there is no project store.
export function buildGroupGraph(files, activeId, getText, options = {}) {
  const empty = makeGraph(new Map(), []);
  if (!Array.isArray(files) || !files.length || typeof getText !== 'function') return empty;

  let visible;
  try {
    visible = developmentFilesFor(files, activeId, getText, options);
  } catch (_) {
    return empty;
  }
  if (!visible || !visible.length) return empty;

  const nodes = new Map();
  const defsByName = new Map(); // name -> [{ order, node }] in visible (load) order
  const perFile = [];

  visible.forEach((file, order) => {
    const snap = snapshotForFile(file.id, file.name, String(getText(file.id) ?? ''));
    perFile.push({ file, snap, order });
    for (const symbol of snap.globalSymbols) {
      const node = makeNode(symbol, file, order);
      nodes.set(node.id, node);
      const list = defsByName.get(node.name) || [];
      list.push({ order, node });
      defsByName.set(node.name, list);
    }
  });

  // Resolve a name as seen from a file at `order`: the closest definition at or
  // before that position wins (later files shadow earlier ones).
  function resolveName(name, order) {
    const list = defsByName.get(name);
    if (!list) return null;
    let best = null;
    for (const entry of list) {
      if (entry.order <= order && (!best || entry.order > best.order)) best = entry;
    }
    return best ? best.node : list[0].node;
  }

  const edgeMap = new Map();
  for (const { snap, order } of perFile) {
    for (const ref of snap.references) {
      if (ref.resolution === 'local') continue; // local binder — never a global edge
      const ownerId = ref.enclosingDeclarationId;
      if (!ownerId || !nodes.has(ownerId)) continue;
      let target = ref.symbolId ? nodes.get(ref.symbolId) : null;
      if (!target) target = resolveName(ref.name, order);
      if (!target || target.id === ownerId) continue;
      const ownerSym = snap.symbolsById.get(ownerId);
      const kind = edgeKindFor(ref, ownerSym);
      const key = `${ownerId}->${target.id}:${kind}`;
      if (!edgeMap.has(key)) edgeMap.set(key, { from: ownerId, to: target.id, kind });
    }
  }

  return makeGraph(nodes, [...edgeMap.values()], { defsByName, resolveName, activeOrder: visible.length - 1 });
}

function makeGraph(nodes, edges, extra = {}) {
  const named = (id) => {
    const n = nodes.get(id);
    return { id, name: n ? n.name : null };
  };
  const dependenciesOf = (id) => edges.filter((e) => e.from === id).map((e) => ({ ...named(e.to), kind: e.kind }));
  const dependentsOf = (id) => edges.filter((e) => e.to === id).map((e) => ({ ...named(e.from), kind: e.kind }));
  // Impact = the full blast radius of changing this declaration (mirrors the
  // single-file engine's semantic-graph.impactOf), in two tiers:
  //  • 'cascade' — transitive over INTERFACE (signature / notation) edges: changing
  //    this signature restructures each of these types in turn.
  //  • 'uses'    — a decl that calls this (or a cascaded decl) in its BODY: its
  //    proof needs re-checking, but its OWN type is unchanged, so it is a LEAF —
  //    never propagated further. Cascade membership wins over a 'uses' tag.
  const impactOf = (id) => {
    const cascadeSet = new Set();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      for (const e of edges) {
        if (e.to !== cur) continue;
        if (e.kind !== EDGE_KIND.SIGNATURE && e.kind !== EDGE_KIND.NOTATION) continue;
        if (e.from === id || cascadeSet.has(e.from)) continue;
        cascadeSet.add(e.from);
        stack.push(e.from);
      }
    }
    const usesSet = new Set();
    for (const e of edges) {
      if (e.kind !== EDGE_KIND.BODY) continue;
      if (e.to !== id && !cascadeSet.has(e.to)) continue;
      if (e.from === id || cascadeSet.has(e.from)) continue;
      usesSet.add(e.from);
    }
    return [
      ...[...cascadeSet].map((nid) => ({ ...named(nid), kind: 'cascade' })),
      ...[...usesSet].map((nid) => ({ ...named(nid), kind: 'uses' })),
    ];
  };
  // The node best matching a name as visible to the active file (for the
  // inspector, which knows the symbol by name + active scope).
  const nodeForName = (name) => (extra.resolveName ? extra.resolveName(name, extra.activeOrder ?? 0) : null);
  return {
    nodes,
    edges,
    dependenciesOf,
    dependentsOf,
    impactOf,
    nodeById: (id) => nodes.get(id) || null,
    nodeForName,
  };
}
