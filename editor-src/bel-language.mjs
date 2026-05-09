// Beluga CodeMirror language: Lezer parser configuration (highlight tags,
// indentation props, folding). Grammar source: ../beluga.grammar.
//
// Base tags here; bound-variable *uses* are overridden in bel-scope-highlight.mjs.
// When adding nodes, update styleTags + scope collector + printer (format/printer.mjs).

import {
  HighlightStyle,
  LRLanguage,
  LanguageSupport,
  syntaxHighlighting,
  indentNodeProp,
  foldNodeProp,
  foldInside,
  delimitedIndent,
} from '@codemirror/language';
import { Prec } from '@codemirror/state';
import { styleTags, tags as t } from '@lezer/highlight';
import { parser } from './beluga-parser.js';
import { belParseErrorHighlightExtensions } from './bel-invalid-highlight.mjs';
import { belugaScopeHighlight } from './bel-scope-highlight.mjs';

/** LF/Comp parenthesis nodes otherwise get CM's implicit align:true (+2 units vs +1). */
function parenDelimitedNoAlign(cx) {
  const open = cx.node.firstChild;
  if (!open || cx.state.doc.sliceString(open.from, open.to) !== '(') return cx.continue();
  return delimitedIndent({ closing: ')', align: false })(cx);
}

function lineStartsClosingSemi(doc, pos) {
  return /^\s*;\s*$/.test(doc.lineAt(pos).text);
}

/** LF datatype / inductive body: header line and lone `;` flush left; ctor lines indented. */
function indentDeclBodyAfterHeader(cx) {
  const doc = cx.state.doc;
  const headerLn = doc.lineAt(cx.node.from).number;
  if (doc.lineAt(cx.pos).number === headerLn) return cx.continue();
  if (lineStartsClosingSemi(doc, cx.pos)) return cx.continue();
  return cx.baseIndentFor(cx.node) + cx.unit;
}

function indentContinuationUnderAncestor(cx, ancestorNames) {
  const doc = cx.state.doc;
  if (doc.lineAt(cx.pos).number === doc.lineAt(cx.node.from).number) return cx.continue();
  for (let p = cx.node.parent; p; p = p.parent) {
    if (ancestorNames.has(p.name)) return cx.baseIndentFor(p) + cx.unit;
  }
  return cx.baseIndentFor(cx.node) + cx.unit;
}

const LF_TYPE_CONT_ANCESTORS = new Set(['LFConstructor', 'LFDeclaration', 'LFKind']);
const LF_KIND_CONT_ANCESTORS = new Set(['LFDatatypeDeclaration', 'LFDeclaration']);
const COMP_TYPE_CONT_ANCESTORS = new Set(['CompConstructor']);
const COMP_KIND_CONT_ANCESTORS = new Set(['InductiveBody']);

/** After `… =`, CM often resolves the parent decl exactly on `[`, skipping ContextualObject.delimitedIndent. */
function indentBracketRhsAfterDeclHeader(cx) {
  const doc = cx.state.doc;
  const headerLn = doc.lineAt(cx.node.from).number;
  if (doc.lineAt(cx.pos).number === headerLn) return cx.continue();
  if (doc.lineAt(cx.pos).text.trimStart().startsWith('['))
    return cx.baseIndentFor(cx.node) + cx.unit;
  return cx.continue();
}

const belugaHighlight = styleTags({
  type: t.keyword,
  ctype: t.keyword,
  schema: t.keyword,
  some: t.keyword,
  block: t.keyword,
  inductive: t.keyword,
  stratified: t.keyword,
  typedef: t.keyword,
  rec: t.keyword,
  fn: t.keyword,
  mlam: t.keyword,
  case: t.keyword,
  of: t.keyword,
  let: t.keyword,
  in: t.keyword,
  if: t.keyword,
  then: t.keyword,
  else: t.keyword,
  impossible: t.keyword,
  module: t.keyword,
  struct: t.keyword,
  end: t.keyword,
  and: t.keyword,
  none: t.keyword,
  left: t.keyword,
  right: t.keyword,
  datatype: t.keyword,

  LFKeyword: t.keyword,
  FNKeyword: t.keyword,
  TypeKeyword: t.keyword,
  DatatypeKeyword: t.keyword,
  SchemaKeyword: t.keyword,
  SomeKeyword: t.keyword,
  BlockKeyword: t.keyword,
  InductiveKeyword: t.keyword,
  CTypeKeyword: t.keyword,
  AndKeyword: t.keyword,
  StratifiedKeyword: t.keyword,
  TypedefKeyword: t.keyword,
  RecKeyword: t.keyword,
  FnKeyword: t.keyword,
  MLamKeyword: t.keyword,
  CaseKeyword: t.keyword,
  OfKeyword: t.keyword,
  LetKeyword: t.keyword,
  InKeyword: t.keyword,
  IfKeyword: t.keyword,
  ThenKeyword: t.keyword,
  ElseKeyword: t.keyword,
  ImpossibleKeyword: t.keyword,
  ModuleKeyword: t.keyword,
  StructKeyword: t.keyword,
  EndKeyword: t.keyword,
  NoneKeyword: t.keyword,
  LeftKeyword: t.keyword,
  RightKeyword: t.keyword,

  '--coverage --warncoverage --nostrengthen --infix --prefix --assoc \
   --name --abbrev --not --open --query --opaque': t.meta,

  'Associativity/...': t.modifier,
  QueryBound: t.number,

  'LFDeclaration/LowerIdentifier':    t.variableName,
  'LFDatatypeDeclaration/LowerIdentifier': t.definition(t.typeName),
  'LFConstructor/LowerIdentifier':    t.definition(t.function(t.variableName)),
  'SchemaDeclaration/LowerIdentifier': t.definition(t.typeName),
  'TypedefDeclaration/LowerIdentifier': t.definition(t.typeName),
  'TypedefDeclaration/UpperIdentifier': t.definition(t.typeName),
  'InductiveBody/UpperIdentifier':    t.definition(t.typeName),
  'CompConstructor/UpperIdentifier':  t.definition(t.function(t.variableName)),
  'RecBody/LowerIdentifier':          t.definition(t.variableName),
  'LetDeclaration/LowerIdentifier':   t.definition(t.variableName),
  'ModuleDeclaration/UpperIdentifier': t.definition(t.namespace),

  'FnParam/LowerIdentifier':          t.definition(t.local(t.variableName)),
  'MLamParam/LowerIdentifier':        t.definition(t.local(t.variableName)),
  'MLamParam/UpperIdentifier':        t.definition(t.local(t.typeName)),
  'LFLambdaBinder/...':               t.definition(t.local(t.variableName)),
  'LFLambdaBinder/LowerIdentifier':   t.definition(t.local(t.variableName)),
  'LFBlockField/LowerIdentifier':     t.definition(t.local(t.variableName)),
  'ContextEntry/LowerIdentifier':     t.definition(t.local(t.variableName)),
  'ContextHead/LowerIdentifier':      t.definition(t.local(t.variableName)),
  'SchemaSomeBindings/LowerIdentifier': t.definition(t.local(t.variableName)),
  'CompTypeBinder/LowerIdentifier':   t.definition(t.local(t.variableName)),
  'CompTypeBinder/UpperIdentifier':   t.definition(t.local(t.typeName)),

  'LFAtomicTerm/LowerIdentifier':     t.function(t.variableName),
  'Projection/LowerIdentifier':      t.function(t.variableName),

  'InfixPragma/LowerIdentifier':      t.function(t.variableName),
  'PrefixPragma/LowerIdentifier':     t.function(t.variableName),

  'LFAtomicTerm/UpperIdentifier':     t.special(t.variableName),
  'LFAtomicType/UpperIdentifier':     t.special(t.typeName),

  'LFAtomicType/LowerIdentifier':     t.typeName,

  'CompAtomicType/UpperIdentifier':   t.typeName,
  'CompAtomicType/LowerIdentifier':   t.typeName,

  'AtomicExpression/UpperIdentifier': t.function(t.variableName),
  'AtomicExpression/LowerIdentifier': t.function(t.variableName),

  'AtomicPattern/UpperIdentifier':    t.definition(t.local(t.typeName)),
  'AtomicPattern/LowerIdentifier':    t.function(t.variableName),

  ParameterVariable:                  t.special(t.variableName),
  SubstitutionVariable:               t.special(t.typeName),

  LowerIdentifier: t.variableName,
  UpperIdentifier: t.typeName,

  Number:          t.number,
  Hole:            t.atom,
  UnderscoreHole:  t.atom,

  LineComment:     t.lineComment,
  BlockComment:    t.blockComment,

  Turnstile:       t.controlKeyword,
  ArrowOp:         t.typeOperator,
  ProjectionTail:  t.propertyName,
  SubstHead:       t.operator,
});

// HighlightStyle: more specific tag rules first.

const c = {
  keyword:      'light-dark(hsl(221, 82%, 34%), var(--accent-mid))',
  meta:         'light-dark(hsl(194, 72%, 33%), hsl(190, 68%, 72%))',

  typeName:     'light-dark(hsl(268, 70%, 37%), hsl(264, 78%, 74%))',
  typeNameDef:  'light-dark(hsl(270, 78%, 32%), hsl(264, 88%, 78%))',

  varName:      'var(--base-highest)',
  varNameDef:   'light-dark(hsl(220, 88%, 30%), hsl(215, 92%, 82%))',
  varNameLocalDef: 'light-dark(hsl(276, 82%, 33%), hsl(280, 80%, 80%))',
  varNameLocalRef: 'light-dark(hsl(272, 64%, 38%), hsl(280, 50%, 80%))',

  ctorDef:      'light-dark(hsl(221, 84%, 31%), hsl(215, 92%, 82%))',

  metaVar:      'light-dark(hsl(194, 70%, 32%), hsl(190, 76%, 76%))',
  metaType:     'light-dark(hsl(195, 64%, 30%), hsl(190, 70%, 74%))',

  property:     'light-dark(hsl(213, 82%, 34%), hsl(210, 78%, 72%))',
  number:       'light-dark(hsl(26, 88%, 35%), hsl(30, 88%, 72%))',
  comment:      'light-dark(hsl(221, 10%, 40%), var(--muted-high))',
  control:      'light-dark(hsl(350, 78%, 39%), hsl(356, 75%, 72%))',
  punct:        'light-dark(var(--muted-higher), var(--muted-highest))',
  cyan:         'light-dark(hsl(194, 72%, 33%), hsl(190, 68%, 72%))',
};

export const defaultBelugaHighlightStyle = HighlightStyle.define([
  { tag: t.definition(t.local(t.variableName)),
    color: c.varNameLocalDef, fontWeight: '600' },
  { tag: t.definition(t.local(t.typeName)),
    color: c.metaType, fontWeight: '600' },
  { tag: t.definition(t.function(t.variableName)),
    color: c.ctorDef, fontWeight: '600' },
  { tag: t.definition(t.variableName),
    color: c.varNameDef, fontWeight: '600' },
  { tag: t.definition(t.typeName),
    color: c.typeNameDef, fontWeight: '600' },
  { tag: t.definition(t.namespace),
    color: c.typeNameDef, fontWeight: '600' },

  { tag: t.local(t.variableName), color: c.varNameLocalRef },
  { tag: t.local(t.typeName), color: c.varNameLocalRef },

  { tag: t.special(t.variableName), color: c.metaVar },
  { tag: t.special(t.typeName),     color: c.metaType, fontWeight: '600' },

  { tag: t.function(t.variableName), color: c.ctorDef },

  { tag: t.typeName,     color: c.typeName },
  { tag: t.variableName, color: c.varName },

  { tag: t.keyword,            color: c.keyword, fontWeight: '600' },
  { tag: t.meta,               color: c.meta },
  { tag: t.modifier,           color: c.cyan },
  { tag: t.propertyName,       color: c.property },
  { tag: t.number,             color: c.number },
  { tag: t.atom,               color: c.number },
  { tag: [t.lineComment, t.blockComment],
                               color: c.comment, fontStyle: 'italic' },
  { tag: t.controlKeyword,     color: c.control, fontWeight: '600' },
  { tag: t.typeOperator,       color: c.control },
  { tag: t.definitionOperator, color: c.cyan },
  { tag: t.arithmeticOperator, color: c.cyan },
  { tag: t.operator,           color: c.cyan },
  { tag: t.separator,          color: c.punct },
  { tag: [t.punctuation, t.paren, t.squareBracket, t.brace, t.angleBracket],
                               color: c.punct },
]);

const belugaParser = parser.configure({
  props: [
    belugaHighlight,
    indentNodeProp.add({
      ModuleDeclaration: delimitedIndent({ closing: 'end', align: false }),
      LFDatatypeDeclaration: indentDeclBodyAfterHeader,
      RecBody: indentBracketRhsAfterDeclHeader,
      LetDeclaration: indentBracketRhsAfterDeclHeader,
      InductiveBody: indentDeclBodyAfterHeader,
      LFKind: (cx) => indentContinuationUnderAncestor(cx, LF_KIND_CONT_ANCESTORS),
      LFType: (cx) => indentContinuationUnderAncestor(cx, LF_TYPE_CONT_ANCESTORS),
      CompKind: (cx) => indentContinuationUnderAncestor(cx, COMP_KIND_CONT_ANCESTORS),
      CompType: (cx) => indentContinuationUnderAncestor(cx, COMP_TYPE_CONT_ANCESTORS),
      TupleOrParenExpression: delimitedIndent({ closing: ')', align: false }),
      TupleOrParenPattern: delimitedIndent({ closing: ')', align: false }),
      ContextualObject: delimitedIndent({ closing: ']', align: false }),
      ContextualType: delimitedIndent({ closing: ']', align: false }),
      Substitution: delimitedIndent({ closing: ']', align: false }),
      LFAtomicTerm: parenDelimitedNoAlign,
      LFAtomicType: parenDelimitedNoAlign,
      CompAtomicType: parenDelimitedNoAlign,
      CaseBranch: cx => cx.baseIndent + cx.unit,
    }),
    foldNodeProp.add({
      ModuleDeclaration: foldInside,
      InductiveDeclaration: foldInside,
      StratifiedDeclaration: foldInside,
      LFDatatypeDeclaration: foldInside,
      BlockComment: foldInside,
    }),
  ],
});

export const belugaLanguage = LRLanguage.define({
  name: 'beluga',
  parser: belugaParser,
  languageData: {
    commentTokens: { line: '%', block: { open: '%{', close: '}%' } },
    closeBrackets: { brackets: ['(', '[', '{'] },
    indentOnInput: /^\s*(=>|→|->|<-|\||end)$/,
  },
});

export function beluga() {
  return new LanguageSupport(belugaLanguage, [
    syntaxHighlighting(defaultBelugaHighlightStyle),
    Prec.highest(belugaScopeHighlight),
    ...belParseErrorHighlightExtensions,
  ]);
}
