export const DEFAULT_DOCUMENT_ID = 'workspace://main.bel';

export const STATUS = Object.freeze({
  FRESH: 'fresh',
  CHECKING: 'checking',
  STALE_KNOWN: 'stale-known',
  DIRTY: 'dirty',
  SYNTAX_FAULT: 'syntax-fault',
  ERRORING: 'erroring',
  BLOCKED: 'blocked',
  UNKNOWN: 'unknown',
});

export const EDGE_KIND = Object.freeze({
  SIGNATURE: 'signature',
  BODY: 'body',
  NOTATION: 'notation',
  MODULE: 'module',
  IMPLICIT: 'implicit',
  COVERAGE: 'coverage',
});

export const NAMESPACE = Object.freeze({
  LF_TYPE_FAMILY: 'lf-type-family',
  LF_CONSTANT: 'lf-constant',
  LF_CONSTRUCTOR: 'lf-constructor',
  SCHEMA: 'schema',
  TYPEDEF: 'typedef',
  COMP_TYPE: 'comp-type',
  COMP_CONSTRUCTOR: 'comp-constructor',
  REC_FUNCTION: 'rec-function',
  MODULE: 'module',
  LOCAL_LOWER: 'local-lower',
  LOCAL_UPPER: 'local-upper',
  PRAGMA: 'pragma',
});

export function normalizeDocumentId(input = DEFAULT_DOCUMENT_ID) {
  const raw = String(input || DEFAULT_DOCUMENT_ID).replace(/\\/g, '/').trim();
  return raw || DEFAULT_DOCUMENT_ID;
}

export function rangeOf(node) {
  return { from: node.from, to: node.to };
}

export function astPathFor(node) {
  const parts = [];
  for (let cur = node; cur && cur.parent; cur = cur.parent) {
    let index = 0;
    for (let prev = cur.prevSibling; prev; prev = prev.prevSibling) index++;
    parts.push(`${cur.name}:${index}`);
  }
  return parts.reverse().join('/');
}

// A node's (name, from, to) is unique within a document — two distinct nodes
// cannot share an identical span AND type — so it identifies the node without
// the ancestor/sibling walk astPathFor does. astPathFor was O(depth × siblings)
// PER node; called for every reference (thousands on a large file) it was the
// dominant per-keystroke cost in symbolStore.update (~13 ms on cp_thrm). These
// ids are snapshot-local (rebuilt each update; not persisted), so the cheaper
// key is a drop-in. astPathFor is kept for any positional-path consumer.
export function astNodeId(documentId, node) {
  return astNodeIdAt(documentId, node.name, node.from, node.to);
}

// Span-keyed variants: the id of a node whose (name, from, to) is known without
// holding the node itself — used by the incremental symbol store to shift a
// cached symbol/reference's id when its declaration moved but did not change.
export function astNodeIdAt(documentId, nodeName, from, to) {
  return `${normalizeDocumentId(documentId)}#ast:${nodeName}:${from}-${to}`;
}

export function structuralSymbolId(documentId, namespace, structuralKey) {
  return `${normalizeDocumentId(documentId)}#sym:${namespace}:${structuralKey}`;
}

export function referenceId(documentId, node) {
  return referenceIdAt(documentId, node.name, node.from, node.to);
}

export function referenceIdAt(documentId, nodeName, from, to) {
  return `${normalizeDocumentId(documentId)}#ref:${nodeName}:${from}-${to}`;
}
