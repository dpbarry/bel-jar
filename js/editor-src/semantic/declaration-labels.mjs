// What the IDE calls a declaration: ONE wording, in Beluga's own vocabulary, shared by the symbol
// store (the open file) and the cross-file index (the other files of a development). They used to
// carry separate tables with different wording ("rec. func." vs "recursive function", "computation
// type" vs "inductive type"), and the index labelled a peer `rec` or `proof` as "declaration".
//
// A declaration is named by the keyword its author wrote: `inductive` / `stratified` /
// `coinductive` types, their constructors and destructors, `rec` functions, `proof`s, `let`
// values, `typedef` type abbreviations. The LF level says "LF" because its author writes `LF`.
import { NAMESPACE } from './ids.mjs';

const LABEL = Object.freeze({
  [NAMESPACE.LF_TYPE_FAMILY]: 'LF type family',
  [NAMESPACE.LF_CONSTANT]: 'LF constant',
  [NAMESPACE.LF_CONSTRUCTOR]: 'LF constructor',
  [NAMESPACE.SCHEMA]: 'schema',
  [NAMESPACE.TYPEDEF]: 'type abbreviation',
  [NAMESPACE.COMP_TYPE]: 'type',
  [NAMESPACE.COMP_CONSTRUCTOR]: 'constructor',
  [NAMESPACE.REC_FUNCTION]: 'recursive function',
  [NAMESPACE.MODULE]: 'module',
  [NAMESPACE.PRAGMA]: 'pragma',
  [NAMESPACE.LOCAL_LOWER]: 'local binder',
  [NAMESPACE.LOCAL_UPPER]: 'local binder',
});

// Refinements by declaration kind: a datatype flavour, or the declaring node's name.
const LABEL_BY_KIND = Object.freeze({
  [NAMESPACE.COMP_TYPE]: Object.freeze({ inductive: 'inductive type', stratified: 'stratified type', coinductive: 'coinductive type' }),
  [NAMESPACE.COMP_CONSTRUCTOR]: Object.freeze({ CompDestructor: 'destructor' }),
  [NAMESPACE.REC_FUNCTION]: Object.freeze({ ProofDeclaration: 'proof', LetDeclaration: 'value' }),
  [NAMESPACE.PRAGMA]: Object.freeze({ PrefixPragma: 'prefix pragma', InfixPragma: 'infix pragma' }),
});

// `inductive` and `stratified` share one body node, so the flavour is read from the keyword before
// the body; a bare `and` continuation takes its block's flavour.
const FLAVOUR_OF_DECLARATION = Object.freeze({
  InductiveDeclaration: 'inductive', StratifiedDeclaration: 'stratified', CoinductiveDeclaration: 'coinductive',
});
const FLAVOUR_OF_KEYWORD = Object.freeze({
  InductiveKeyword: 'inductive', StratifiedKeyword: 'stratified', CoinductiveKeyword: 'coinductive',
});
const DATATYPE_BODY = Object.freeze({ InductiveBody: true, CoinductiveBody: true });
const CONTINUATION = Object.freeze({ DatatypeContinuation: true });

const ownValue = (table, key) => (key != null && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null);

function declarationKindOf(node) {
  for (let cur = node; cur; cur = cur.parent) {
    const declared = ownValue(FLAVOUR_OF_DECLARATION, cur.name);
    if (declared) return declared;
    if (ownValue(CONTINUATION, cur.name)) {
      for (let c = cur.firstChild; c; c = c.nextSibling) {
        const keyword = ownValue(FLAVOUR_OF_KEYWORD, c.name);
        if (keyword) return keyword;
      }
      continue;
    }
    if (!ownValue(DATATYPE_BODY, cur.name)) break;
    const keyword = ownValue(FLAVOUR_OF_KEYWORD, cur.prevSibling && cur.prevSibling.name);
    if (keyword) return keyword;
  }
  return node.name;
}

/** The label for a symbol of `namespace`, declared by `declarationNode` (a lezer node). */
export function declarationLabel(namespace, declarationNode) {
  const label = ownValue(LABEL, namespace);
  if (!label) return (declarationNode && declarationNode.name) || 'symbol';
  if (!declarationNode) return label;
  const refinements = ownValue(LABEL_BY_KIND, namespace);
  return (refinements && ownValue(refinements, declarationKindOf(declarationNode))) || label;
}
