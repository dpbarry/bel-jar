import {
  HighlightStyle,
  LRLanguage,
  LanguageSupport,
  syntaxHighlighting,
  indentNodeProp,
  foldNodeProp,
  foldService,
  codeFolding,
  foldGutter,
  unfoldEffect,
  delimitedIndent,
} from '@codemirror/language';
import { Prec } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';

// Holes (`?` / `?name`) are their own tag (highlight-tags.mjs), coloured below.
import { holeTag, belugaHighlight } from './highlight-tags.mjs';
export { holeTag };
import { parser } from './beluga-parser.js';
import {
  foldBlockComment,
  foldPercentLineCommentRun,
  foldTopLevelDeclaration,
  isPercentLineCommentFold,
  percentLineCommentFoldHasLeadingGap,
} from './ide/fold.mjs';
import { parseErrorHighlightExtensions } from './ide/invalid-highlight.mjs';
import { declaresName } from './tree-helpers.mjs';
import { belugaScopeHighlight } from './ide/scope-highlight.mjs';
import { printerIndentation } from './format/indent.mjs';

function lineStartsClosingSemi(doc, pos) {
  return /^\s*;\s*$/.test(doc.lineAt(pos).text);
}

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
    if (!ancestorNames.has(p.name)) continue;
    // Stray words the parser dressed as a declaration (tree-helpers
    // `declaresName`) are no type to continue: null leaves each line where
    // the author put it. The editor re-indents every file it opens, and
    // indented them as one.
    if (!declaresName(p)) return null;
    return cx.baseIndentFor(p) + cx.unit;
  }
  return cx.baseIndentFor(cx.node) + cx.unit;
}

const LF_TYPE_CONT_ANCESTORS = new Set(['LFConstructor', 'LFDeclaration', 'LFKind']);
const LF_KIND_CONT_ANCESTORS = new Set(['LFDatatypeDeclaration', 'LFDeclaration']);
const COMP_TYPE_CONT_ANCESTORS = new Set(['CompConstructor']);
const COMP_KIND_CONT_ANCESTORS = new Set(['InductiveBody']);

function indentBracketRhsAfterDeclHeader(cx) {
  const doc = cx.state.doc;
  const headerLn = doc.lineAt(cx.node.from).number;
  if (doc.lineAt(cx.pos).number === headerLn) return cx.continue();
  if (doc.lineAt(cx.pos).text.trimStart().startsWith('['))
    return cx.baseIndentFor(cx.node) + cx.unit;
  return cx.continue();
}

function parenDelimitedNoAlign(cx) {
  const open = cx.node.firstChild;
  if (!open || cx.state.doc.sliceString(open.from, open.to) !== '(') return cx.continue();
  return delimitedIndent({ closing: ')', align: false })(cx);
}

const belPercentLineCommentFold = foldService.of((state, lineStart, lineEnd) => {
  const range = foldPercentLineCommentRun(state, lineStart);
  if (!range || range.from > lineEnd || range.from < lineStart || range.to <= lineEnd) return null;
  return range;
});

export function editorFoldGutter() {
  return foldGutter({
    markerDOM(open) {
      const el = document.createElement('span');
      el.className = `cm-jar-foldmarker${open ? ' is-open' : ' is-folded'}`;
      el.innerHTML = open
        ? '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6.5 4 4 4-4"/></svg>'
        : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4.5 4 4-4 4"/></svg>';
      return el;
    },
  });
}

export function editorCodeFolding() {
  return codeFolding({
    placeholderText: '⋯',
    preparePlaceholder(state, range) {
      const comment = isPercentLineCommentFold(state, range);
      return {
        from: range.from,
        to: range.to,
        variant: comment
          ? (percentLineCommentFoldHasLeadingGap(state, range.from) ? 'comment-space' : 'comment-margin')
          : 'decl',
      };
    },
    placeholderDOM(view, _onclick, prepared) {
      const el = document.createElement('span');
      const variant = prepared?.variant;
      const isComment = variant === 'comment-space' || variant === 'comment-margin';
      el.textContent = isComment ? '...' : '⋯';
      el.className = 'cm-foldPlaceholder';
      if (variant === 'comment-space') el.classList.add('cm-foldPlaceholder--gap-space');
      el.setAttribute('aria-label', view.state.phrase('folded code'));
      el.title = view.state.phrase('unfold');
      el.onmousedown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (prepared?.from != null) {
          view.dispatch({ effects: unfoldEffect.of({ from: prepared.from, to: prepared.to }) });
        }
      };
      return el;
    },
  });
}

// The node → tag table lives in highlight-tags.mjs: the reading page shares it.

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
  control:      'light-dark(hsl(34, 82%, 36%), hsl(36, 76%, 68%))',
  hole:         'var(--ide-hole-border)',
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

  { tag: t.definition(t.special(t.variableName)),
    color: c.metaVar, fontWeight: '600' },
  { tag: t.definition(t.special(t.typeName)),
    color: c.metaType, fontWeight: '600' },
  { tag: t.special(t.variableName), color: c.metaVar },
  { tag: t.special(t.typeName),     color: c.metaType, fontWeight: '600' },

  { tag: t.function(t.variableName), color: c.ctorDef },

  { tag: t.namespace,        color: c.property },
  { tag: t.typeName,     color: c.typeName },
  { tag: t.variableName, color: c.varName },

  { tag: t.keyword,            color: c.keyword, fontWeight: '600' },
  { tag: t.meta,               color: c.meta },
  { tag: t.modifier,           color: c.cyan },
  { tag: t.propertyName,       color: c.property },
  { tag: t.number,             color: c.number },
  { tag: t.atom,               color: c.number },
  { tag: holeTag,              color: c.hole, fontWeight: '700' },
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
      ModuleDeclaration: foldTopLevelDeclaration,
      InductiveDeclaration: foldTopLevelDeclaration,
      StratifiedDeclaration: foldTopLevelDeclaration,
      CoinductiveDeclaration: foldTopLevelDeclaration,
      LFDatatypeDeclaration: foldTopLevelDeclaration,
      LFDeclaration: foldTopLevelDeclaration,
      RecDeclaration: foldTopLevelDeclaration,
      SchemaDeclaration: foldTopLevelDeclaration,
      TypedefDeclaration: foldTopLevelDeclaration,
      LetDeclaration: foldTopLevelDeclaration,
      ProofDeclaration: foldTopLevelDeclaration,
      BlockComment: foldBlockComment,
    }),
  ],
});

export const belugaLanguage = LRLanguage.define({
  name: 'beluga',
  parser: belugaParser,
  languageData: {
    commentTokens: { line: '%', block: { open: '%{', close: '}%' } },
    closeBrackets: { brackets: ['(', '[', '{'] },
    // `|` and `end` belong to induced layout. This regexp is only consulted if
    // the stock indent-on-input filter is installed, and that filter measures
    // the document from before the keystroke.
    indentOnInput: /^\s*(=>|→|->|<-)$/,
  },
});

export function beluga() {
  return new LanguageSupport(belugaLanguage, [belPercentLineCommentFold, printerIndentation]);
}

export function belugaHighlightExtensions(opts = {}) {
  const exts = [];
  if (opts.syntaxHighlight !== false) {
    exts.push(syntaxHighlighting(defaultBelugaHighlightStyle));
  }
  if (opts.semanticHighlight !== false) {
    exts.push(Prec.highest(belugaScopeHighlight));
  }
  if (opts.parseHighlight !== false) {
    exts.push(...parseErrorHighlightExtensions);
  }
  return exts;
}
