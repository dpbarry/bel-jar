import { EditorView, lineNumbers, highlightActiveLineGutter, highlightActiveLine, highlightWhitespace, highlightTrailingWhitespace, drawSelection } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { bracketMatching, indentRange, indentUnit } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches } from '@codemirror/search';
import { Transaction } from '@codemirror/state';
import { belugaHighlightExtensions, editorCodeFolding, editorFoldGutter } from './language.mjs';
import { occurrenceHighlight, defLinkDecoration, navigationGestures } from './ide/navigation.mjs';
import { holeGutterHighlight, holeGutterInteraction } from './prover/hole-decorations.mjs';
import { stickyDeclHeader } from './ide/sticky-decl.mjs';
import { highlightWhitespaceInSelection } from './ide/whitespace-selection.mjs';

const FONT_SIZES = {
  sm: '0.75rem',
  md: '0.8125rem',
  lg: '0.875rem',
  xl: '1rem',
};

const LINE_HEIGHTS = {
  compact: '1.5',
  normal: '1.65',
  relaxed: '1.8',
};

const CURSOR_BLINK_MS = {
  off: 0,
  blink: 1200,
  fast: 700,
};

function persistApi() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  return g.Persist;
}

export function readEditorPrefs() {
  const p = persistApi();
  return {
    fontSize: p?.readStoredEditorFontSize?.() ?? 'md',
    lineHeight: p?.readStoredEditorLineHeight?.() ?? 'normal',
    wordWrap: p?.readStoredEditorWordWrap?.() ?? false,
    tabSize: p?.readStoredEditorTabSize?.() ?? 2,
    formatWidth: p?.readStoredEditorFormatWidth?.() ?? 80,
    reindentPaste: p?.readStoredEditorReindentPaste?.() ?? true,
    lineNumbers: p?.readStoredEditorLineNumbers?.() ?? true,
    foldGutter: p?.readStoredEditorFoldGutter?.() ?? true,
    foldPersist: p?.readStoredEditorFoldPersist?.() ?? 'none',
    activeLine: p?.readStoredEditorActiveLine?.() ?? true,
    diagPresentation: p?.readStoredDiagPresentation?.() ?? 'both',
    diagSeverity: p?.readStoredDiagSeverity?.() ?? 'all',
    diagGutter: (() => {
      const pres = p?.readStoredDiagPresentation?.() ?? 'both';
      return pres === 'both' || pres === 'gutter';
    })(),
    holeGutter: p?.readStoredEditorHoleGutter?.() ?? true,
    syntaxHighlight: p?.readStoredEditorSyntaxHighlight?.() ?? true,
    semanticHighlight: p?.readStoredEditorSemanticHighlight?.() ?? true,
    parseHighlight: p?.readStoredEditorParseHighlight?.() ?? true,
    occurrenceHighlight: p?.readStoredEditorOccurrenceHighlight?.() ?? true,
    bracketMatch: p?.readStoredEditorBracketMatch?.() ?? true,
    autoCloseBrackets: p?.readStoredEditorAutoCloseBrackets?.() ?? true,
    selectionMatches: p?.readStoredEditorSelectionMatches?.() ?? true,
    quietWhileTyping: p?.readStoredQuietWhileTyping?.() ?? false,
    formatOnSave: p?.readStoredFormatOnSave?.() ?? false,
    trimTrailingWs: p?.readStoredTrimTrailingWs?.() ?? false,
    stickyDeclHeader: p?.readStoredStickyDeclHeader?.() ?? false,
    hoverSticky: p?.readStoredHoverSticky?.() ?? false,
    cursorBlink: p?.readStoredEditorCursorBlink?.() ?? 'blink',
    scrollPastEnd: p?.readStoredEditorScrollPastEnd?.() ?? true,
    whitespace: p?.readStoredEditorWhitespace?.() ?? 'none',
    rulers: p?.readStoredEditorRulers?.() ?? false,
    ligatures: p?.readStoredEditorLigatures?.() ?? true,
    fontFamily: p?.readStoredEditorFontFamily?.() ?? 'jetbrains',
    holeEmphasis: p?.readStoredEditorHoleEmphasis?.() ?? 'normal',
  };
}

function editorFontSizeCSSValue(prefSize) {
  const fs = FONT_SIZES[prefSize] || FONT_SIZES.md;
  return `calc(${fs} / var(--ui-font-scale, 1))`;
}

export function buildEditorChromeTheme(prefs) {
  const fs = editorFontSizeCSSValue(prefs.fontSize);
  const lh = LINE_HEIGHTS[prefs.lineHeight] || LINE_HEIGHTS.normal;
  const mono = prefs.fontFamily === 'system'
    ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    : 'var(--editor-mono, var(--mono))';
  const ligatures = prefs.ligatures === false ? 'none' : 'common-ligatures';
  const rules = {
    '&': { fontSize: fs, fontFamily: mono },
    '.cm-editor': { fontSize: fs, fontFamily: mono },
    '.cm-scroller': { lineHeight: lh, fontSize: 'inherit', fontFamily: 'inherit' },
    '.cm-content': {
      fontSize: 'inherit',
      fontFamily: 'inherit',
      fontVariantLigatures: ligatures,
    },
    '.cm-line': prefs.wordWrap
      ? { whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
      : { whiteSpace: 'pre' },
  };
  if (prefs.rulers) {
    const cols = prefs.formatWidth === 100 || prefs.formatWidth === 120 ? prefs.formatWidth : 80;
    rules['.cm-content'] = {
      ...rules['.cm-content'],
      backgroundImage: `linear-gradient(to right, transparent ${cols}ch, var(--base-mid) ${cols}ch, var(--base-mid) calc(${cols}ch + 1px), transparent calc(${cols}ch + 1px))`,
      backgroundAttachment: 'local',
    };
  }
  return EditorView.baseTheme(rules);
}

export function buildSelectionExtensions(prefs) {
  const rate = CURSOR_BLINK_MS[prefs.cursorBlink] ?? CURSOR_BLINK_MS.blink;
  return [drawSelection({ cursorBlinkRate: rate })];
}

// Reindent only [from,to] (expanded to whole lines), not the whole document.
// Pasting into a late region of a large file must not re-indent the prefix.
function reindentRange(view, from, to) {
  const doc = view.state.doc;
  const lo = doc.lineAt(Math.max(0, Math.min(from, doc.length))).from;
  const hi = doc.lineAt(Math.max(0, Math.min(to, doc.length))).to;
  const ir = indentRange(view.state, lo, hi);
  if (!ir.empty) {
    view.dispatch({
      changes: ir,
      annotations: Transaction.addToHistory.of(false),
    });
  }
}

// Span the paste/drop touched in the RESULTING document (mapped through the
// change) so we know which lines to reindent.
function insertedSpan(changes) {
  let from = null;
  let to = null;
  changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    if (from == null || fromB < from) from = fromB;
    if (to == null || toB > to) to = toB;
  });
  return from == null ? null : { from, to };
}

export function buildPasteReindentListener() {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    const indentTrigger = update.transactions.some((tr) => {
      const ue = tr.annotation(Transaction.userEvent);
      return ue === 'input.paste' || ue === 'input.drop' || ue === 'move.drop';
    });
    if (!indentTrigger) return;
    const span = insertedSpan(update.changes);
    if (!span) return;
    // After paint (rAF), so the pasted text renders on the current frame; and
    // scoped to the pasted lines so cost is O(paste), not O(doc).
    const view = update.view;
    requestAnimationFrame(() => {
      if (view.dom?.isConnected) reindentRange(view, span.from, span.to);
    });
  });
}

export function buildToggleableExtensions(prefs, deps) {
  const { semanticEngine } = deps;
  const exts = [];

  const tab = prefs.tabSize === 4 ? 4 : 2;
  exts.push(indentUnit.of(' '.repeat(tab)));
  exts.push(EditorState.tabSize.of(tab));

  if (prefs.lineNumbers) exts.push(lineNumbers());
  if (prefs.activeLine) {
    exts.push(highlightActiveLineGutter());
    exts.push(highlightActiveLine());
  }
  if (prefs.bracketMatch) exts.push(bracketMatching());
  if (prefs.autoCloseBrackets) exts.push(closeBrackets());
  if (prefs.foldGutter) {
    exts.push(editorCodeFolding());
    exts.push(editorFoldGutter());
  }
  if (prefs.selectionMatches) exts.push(highlightSelectionMatches({ minSelectionLength: 2 }));
  if (prefs.wordWrap) exts.push(EditorView.lineWrapping);

  if (prefs.whitespace === 'all') exts.push(highlightWhitespace());
  else if (prefs.whitespace === 'trailing') exts.push(highlightTrailingWhitespace());
  else if (prefs.whitespace === 'selection') exts.push(highlightWhitespaceInSelection());

  exts.push(...belugaHighlightExtensions({
    syntaxHighlight: prefs.syntaxHighlight,
    semanticHighlight: prefs.semanticHighlight,
    parseHighlight: prefs.parseHighlight,
  }));

  exts.push(...navigationGestures());
  if (prefs.occurrenceHighlight) exts.push(...occurrenceHighlight());

  exts.push(defLinkDecoration());

  if (prefs.stickyDeclHeader) exts.push(stickyDeclHeader());

  if (prefs.holeGutter && semanticEngine) {
    exts.push(holeGutterHighlight(semanticEngine));
    exts.push(holeGutterInteraction(semanticEngine));
  }

  if (prefs.reindentPaste) exts.push(buildPasteReindentListener());

  return exts;
}

export function buildBracketKeymap(prefs) {
  return prefs.autoCloseBrackets ? closeBracketsKeymap : [];
}
