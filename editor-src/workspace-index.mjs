// Workspace Index — the single, cached, development-scoped substrate for all
// PARSE-derived intelligence: symbols, references, the dependency graph, source
// types, and rename. It formalizes what `project-prelude` + `group-graph`
// already do informally, behind one query API, with a dependency graph memoized
// by member-file content so repeated queries (inspector renders, graph opens)
// don't rebuild.
//
// The unit is the DEVELOPMENT — a `.cfg` suite OR a single non-cfg file as a
// singleton development — never "the active document"; `development.mjs` returns
// both uniformly. Checker-derived facts (reconstructed types, diagnostics) are
// NOT here — they live in the per-development engine/session. This tier is
// checker-free and has no cross-file boundary: it is always complete.

import { developmentForFile } from './development.mjs';
import { buildGroupGraph } from './group-graph.mjs';
import {
  findProjectDefinition,
  findGroupSignature,
  listGroupSymbols,
  groupReferencesFor,
  groupRenameEdits,
} from './project-prelude.mjs';

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// Content signature of a DEVELOPMENT (not the active file): scope key + each
// member path and a hash of its text. The dependency graph is development-wide
// and view-independent, so the signature must NOT include the active id —
// otherwise the same development re-builds once per member. scopeKey already
// disambiguates developments (module:cfgPath / standalone:filename), so any
// member of a development shares one cached graph; it auto-invalidates when any
// member's content changes.
function developmentSignature(files, activeId, getText, opts) {
  const dev = developmentForFile(files, activeId, getText, opts);
  const idByName = new Map((files || []).map((f) => [f.name, f.id]));
  let sig = `${dev.scopeKey}|`;
  for (const path of dev.paths) {
    const id = idByName.get(path);
    const text = id != null ? String(getText(id) ?? '') : '';
    sig += `${path}:${fnv1a(text)};`;
  }
  return { dev, sig };
}

const graphCache = new Map(); // signature -> group graph
const GRAPH_CACHE_CAP = 24;

export function clearWorkspaceIndexCache() {
  graphCache.clear();
}

export function getDevelopment(files, activeId, getText, opts = {}) {
  return developmentForFile(files, activeId, getText, opts);
}

// Memoized suite-wide dependency graph for the active file's development.
// Recomputed only when a member file's content changes.
export function dependencyGraph(files, activeId, getText, opts = {}) {
  const { sig } = developmentSignature(files, activeId, getText, opts);
  const hit = graphCache.get(sig);
  if (hit) return hit;
  const graph = buildGroupGraph(files, activeId, getText, opts);
  if (graphCache.size >= GRAPH_CACHE_CAP) graphCache.clear();
  graphCache.set(sig, graph);
  return graph;
}

// Every global symbol visible in the development (the graph's nodes).
export function symbolsIn(files, activeId, getText, opts = {}) {
  return [...dependencyGraph(files, activeId, getText, opts).nodes.values()];
}

export function definitionOf(files, activeId, name, getText, opts = {}) {
  return findProjectDefinition(files, activeId, name, getText, opts);
}

export function referencesOf(files, activeId, name, getText, opts = {}) {
  return groupReferencesFor(files, activeId, name, getText, opts);
}

export function sourceTypeOf(files, activeId, name, getText, opts = {}) {
  return findGroupSignature(files, activeId, name, getText, opts);
}

export function renameEdits(files, activeId, name, getText, opts = {}) {
  return groupRenameEdits(files, activeId, name, getText, opts);
}

// Suite peers' symbols (excludes the active file) — the cross-file half of the
// search / palette symbol index.
export function peerSymbols(files, activeId, getText, opts = {}) {
  return listGroupSymbols(files, activeId, getText, opts);
}
