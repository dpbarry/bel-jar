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

export function astNodeId(documentId, node) {
  return `${normalizeDocumentId(documentId)}#ast:${astPathFor(node)}:${node.name}`;
}

// A SymbolId is built from a position-independent structural key (see
// symbol-store) rather than a raw sibling-index AST path, so unrelated
// insertions before a declaration do not shift its identity.
export function structuralSymbolId(documentId, namespace, structuralKey) {
  return `${normalizeDocumentId(documentId)}#sym:${namespace}:${structuralKey}`;
}

export function referenceId(documentId, node) {
  return `${normalizeDocumentId(documentId)}#ref:${astPathFor(node)}:${node.from}-${node.to}`;
}
