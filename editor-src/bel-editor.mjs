import { Compartment, EditorState, StateEffect, StateField, Transaction, EditorSelection } from '@codemirror/state';
import {
  EditorView,
  ViewPlugin,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment, undo, redo, selectAll } from '@codemirror/commands';
import { openSearchPanel, findNext, findPrevious } from '@codemirror/search';
import { belSearch } from './bel-search-panel.mjs';
import { ensureSyntaxTree, foldKeymap, indentRange, indentUnit, syntaxTree } from '@codemirror/language';
import { diagnosticCount, forceLinting, forEachDiagnostic, linter } from '@codemirror/lint';
import { beluga } from './bel-language.mjs';
import { formatCommand } from './bel-format.mjs';
import {
  scheduleJumpToRange, scheduleViewportRestore, viewportCenterLine,
  resolveJumpRange, captureFormatViewportAnchor, captureViewportLocal,
} from './bel-viewport.mjs';
import { belAliases, maybeExpandBelAliases } from './bel-aliases.mjs';

export { expandBelAliases, maybeExpandBelAliases, readAliasActivationMode } from './bel-aliases.mjs';
export {
  enableJumpLog, jumpLogEnabled, logJumpMount, logJumpRequest, logJumpResult,
} from './bel-jump-log.mjs';
export { prepareEditorDoc, sanitizeEditorText } from './editor-doc-prep.mjs';
export { highlightSourceFragment, renderSourceInto } from './bel-source-render.mjs';
export { normalizeType, renderTypeInto } from './bel-type-render.mjs';
export { buildProofProgram, commitProof, parseDecl, declRangeWithSemicolon } from './bel-harpoon.mjs';
export { formatProofBody } from './bel-proof-format.mjs';
export { captureHarpoonAnchor, assessHarpoonAnchor, textFingerprint, holeKeyFromHit } from './harpoon-anchor.mjs';
export {
  proveProgram,
  theoremUnderProof,
  theoremDeclRange,
  candidateMoves,
  proveOrchestrationCode,
  movePrefilterOk,
  stepLead,
  stepMeta,
} from './bel-prover-bridge.mjs';
export {
  buildCommitCheckCodes,
  needsFullCommitCheck,
  countSiblingHoledDecls,
} from './harpoon-commit.mjs';
export { parseHoles } from './bel-holes.mjs';
export { fillCandidates } from './bel-hole-split.mjs';
export { normalizeProofModel, normalizeSubgoal, parseBinders, applicableTactics, splitTargets } from './harpoon-model.mjs';
export { createCachedGoalHintIcon, createApproxGoalHintIcon, bindCachedGoalHintTooltip, CACHED_GOAL_TIP, APPROXIMATE_GOAL_TIP, RECHECKING_GOAL_TIP, CHECKING_GOAL_TIP, CACHED_GOAL_HINT_SVG } from './cached-goal-hint.mjs';
export { mountHoleGoalTier } from './hole-goal-pending-ui.mjs';
export { holeHostFile, scanFileHoles, hitsFromHoles } from './harpoon-project-goals.mjs';
export {
  buildHoleDisplayRows,
  settlementGoalsByPos,
  fileInActiveDevelopment,
  resolveHoleGoalForPosition,
} from './hole-goal-display.mjs';
export {
  collectWorkspaceInspector,
  restoreWorkspaceInspector,
  collectFloatingInspectorWindows,
  restoreFloatingInspectorWindow,
} from './bel-inspector.mjs';
export {
  collectFloatingGraphWindows,
  restoreFloatingGraphWindow,
} from './bel-graph-view.mjs';
export {
  createEditHistory,
  dispatchEdit,
  belEditHistoryKeymap,
  belEditHistoryListener,
  editHistoryTxn,
} from './bel-edit-history.mjs';
import { syntaxLint } from './bel-lint.mjs';
import { belugaDiagnosticDecorations } from './bel-beluga-squiggles.mjs';
import { cfgLinter, cfgDiagnostics, resolveCfgDocumentPath } from './bel-cfg-lint.mjs';
import { cfgEditorExtensions, countCfgEntries, goToCfgEntry } from './bel-cfg-editor.mjs';
import { collectStatusDiagnostics, computeParseCoverage, updateAuxStatusDot, updateIdeStatusDot } from './bel-ide-status.mjs';
import { lintLinterOptions, lintPresentation } from './bel-lint-presentation.mjs';
import { lintTooltipItemsFromDiagnostics } from './bel-diag-gutter.mjs';
import { checkerSnapshot } from './checker-snapshot.mjs';
import { computeLintBlocks } from './bel-units.mjs';
import { belHoverTooltip } from './bel-hover.mjs';
import { holeCycleKeymap } from './bel-hole-decorations.mjs';
import { createSemanticEngine } from './semantic/semantic-engine.mjs';
import { preludeCacheMatches } from './semantic/prelude-cache-key.mjs';
import { assembleCheckerCode, buildPrelude, preludeFilesFor, listGroupSymbols } from './project-prelude.mjs';
import { analyzeSuite, suiteFileDiagnostics } from './bel-suite-lint.mjs';
import {
  isSuitePreludeBannerDiag,
  suitePreludeBannerForActive,
} from './suite-prelude-banner.mjs';
import { developmentForFile, listDevelopmentMembers } from './development.mjs';
import { textFingerprint } from './harpoon-anchor.mjs';
import { getDevelopmentChecker, findMemberHole, fileContentSig, developmentSignature } from './development-check.mjs';
import {
  belugaDiagsToFileHealth,
  devCheckCacheLookup,
  notifyExplorerHealthChanged,
  resolveExplorerFileHealth,
} from './file-health-store.mjs';
import { getCheckTrace, timeSync } from './perf/check-trace.mjs';
import { computeSettleDelayMs, noteTypingVelocity, SETTLE_DELAY_MS } from './semantic/settle-delay.mjs';
import {
  syncHoleGoalsFromDevelopment,
  syncHoleGoalsFromSettlement,
  getHoleGoalsStore,
} from './hole-goals-store.mjs';
import {
  buildHoleDisplayRows,
  settlementGoalsByPos,
  fileInActiveDevelopment,
  resolveHoleGoalForPosition,
} from './hole-goal-display.mjs';
import { parseHoles } from './bel-holes.mjs';
import { proveOrchestrationCode, mapProveHolesToDocHits } from './bel-prover-bridge.mjs';
import { parseDecl } from './bel-harpoon.mjs';
import { belNavSemanticTick } from './bel-nav.mjs';
import { belRename, startRename, cancelRenameIfActive, isRenaming, renameSessionChanged } from './bel-rename.mjs';
import { belContextMenu } from './bel-context-menu.mjs';
import { findReferences } from './bel-refs-panel.mjs';
import {
  flashExtension, goToDefinition, jumpToRange, jumpToReference, jumpToNextError, revealInInspector,
  peekRange,
} from './bel-ide-actions.mjs';
import { openLocalGraphWindow, openGlobalGraphWindow, belGraphLive } from './bel-graph-view.mjs';
import { belInspector } from './bel-inspector.mjs';
import { belEditorFollow } from './bel-follow-sync.mjs';
import { prepareEditorDoc, sanitizeEditorText } from './editor-doc-prep.mjs';
import {
  readEditorPrefs,
  buildEditorChromeTheme,
  buildToggleableExtensions,
  buildBracketKeymap,
} from './editor-prefs.mjs';
import { belFoldPersistence, flushFoldKeys } from './bel-fold-persist.mjs';
import {
  belEditHistoryKeymap,
  belEditHistoryListener,
  dispatchEdit,
} from './bel-edit-history.mjs';

const TAB_SIZE = 2;
const INDENT = '  ';

let activeEditorPrefsApplier = null;
let activeEditorView = null;

export function applyEditorPrefs() {
  const prefs = readEditorPrefs();
  if (activeEditorPrefsApplier) {
    activeEditorPrefsApplier(prefs);
    if (activeEditorView) {
      activeEditorView.requestMeasure();
    }
  }
}

const settlementUpdated = StateEffect.define();
const settlementTickField = StateField.define({
  create() {
    return 0;
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(settlementUpdated)) return value + 1;
    }
    return value;
  },
});

const PIPE_CONTEXT_NODES = new Set([
  'LFDeclaration',
  'LFDatatypeDeclaration',
  'InductiveDeclaration',
  'StratifiedDeclaration',
  'LFConstructor',
  'CompConstructor',
  'InductiveBody',
]);

function inPipeContext(state, pos) {
  let cur = syntaxTree(state).resolveInner(pos, -1);
  while (cur) {
    if (PIPE_CONTEXT_NODES.has(cur.name)) return true;
    cur = cur.parent;
  }
  return false;
}

function continuePipeLine(view) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;

  const line = state.doc.lineAt(sel.from);
  if (sel.from !== line.to) return false;

  const text = line.text;
  const m = text.match(/^(\s*)\|(?:\s.*)?$/);
  if (!m) return false;
  if (!inPipeContext(state, sel.from) && !/:\s*.*=\s*$/.test(text)) return false;

  const insert = `\n${m[1]}| `;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection: { anchor: sel.from + insert.length },
    userEvent: 'input',
  });
  return true;
}

const smartEnterRules = [continuePipeLine];

function smartEnter(view) {
  for (const rule of smartEnterRules) {
    if (rule(view)) return true;
  }
  return false;
}

function sanitizePastedPlainText(text) {
  return sanitizeEditorText(text);
}

function globalRef() {
  return typeof globalThis !== 'undefined' ? globalThis : window;
}

function replaceDocNonUndoable(view, text, opts = {}) {
  const H = globalRef().BelJarEditHistory;
  H?.markNonUndoable?.(opts.markMs ?? 2000);
  const doc = sanitizePastedPlainText(text ?? '');
  const len = doc.length;
  let anchor = opts.selection?.anchor;
  let head = opts.selection?.head;
  if (anchor == null || head == null) {
    anchor = head = len;
  } else {
    anchor = Math.max(0, Math.min(anchor, len));
    head = Math.max(0, Math.min(head, len));
  }
  const anns = [Transaction.addToHistory.of(false)];
  if (opts.userEvent) anns.push(Transaction.userEvent.of(opts.userEvent));
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: doc },
    selection: EditorSelection.single(anchor, head),
    annotations: anns,
  });
}

function runEditHistoryUndo() {
  const H = globalRef().BelJarEditHistory;
  return H?.undo?.() ?? false;
}

function runEditHistoryRedo() {
  const H = globalRef().BelJarEditHistory;
  return H?.redo?.() ?? false;
}

function reindentWholeDocument(view) {
  const ir = indentRange(view.state, 0, view.state.doc.length);
  if (!ir.empty) {
    view.dispatch({
      changes: ir,
      annotations: Transaction.addToHistory.of(false),
    });
  }
}

const safeScrollPastEndPlugin = ViewPlugin.fromClass(
  class {
    constructor() {
      this.paddingBottom = 0;
      this.attrs = { style: 'padding-bottom: 0px' };
    }
    update(update) {
      const view = update.view;
      const eh = view.viewState.editorHeight;
      const lh = view.defaultLineHeight || 16;
      const topPad = view.documentPadding.top;
      let next = 0;
      if (eh > lh + topPad + 2) {
        next = Math.max(0, eh - lh - topPad - 0.5);
      }
      if (next !== this.paddingBottom) {
        this.paddingBottom = next;
        this.attrs = { style: `padding-bottom: ${next}px` };
      }
    }
  }
);

function safeScrollPastEnd() {
  return [
    safeScrollPastEndPlugin,
    EditorView.contentAttributes.of((view) => {
      const p = view.plugin(safeScrollPastEndPlugin);
      return p ? p.attrs : null;
    }),
  ];
}

function belEditorChrome() {
  return EditorView.baseTheme({
    '&': {
      height: '100%',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-editor': {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      borderRadius: 'var(--radius-sm)',
      boxShadow: 'inset 0 0 0 1px var(--chrome-divider)',
      overflow: 'hidden',
    },
    '.cm-scroller': {
      flex: 1,
      minHeight: 0,
      overflow: 'auto',
      overflowX: 'auto',
      alignItems: 'stretch',
      fontFamily: 'var(--mono, ui-monospace, monospace)',
      fontVariantLigatures: 'none',
      fontFeatureSettings: '"liga" 0, "calt" 0',
      fontSize: 'inherit',
      backgroundColor: 'var(--bg)',
      color: 'var(--base-highest)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--editor-gutter-bg)',
      color: 'var(--editor-gutter-fg)',
      border: 'none',
      borderRight: '1px solid var(--editor-gutter-edge)',
      userSelect: 'none',
      position: 'relative',
      zIndex: 2,
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 0.4rem 0 0.5rem',
      minWidth: '2.5rem',
      textAlign: 'right',
      userSelect: 'none',
      transition: 'background-color 80ms ease-out, color 80ms ease-out',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'light-dark(rgba(0, 0, 0, 0.03), rgba(255, 255, 255, 0.038))',
      color: 'var(--editor-gutter-fg-active)',
    },
    '.cm-content': {
      caretColor: 'var(--accent-high)',
      paddingTop: '0',
      paddingBottom: 'var(--pad-block)',
    },
    '.cm-line': {
      paddingLeft: '6px',
      paddingRight: 'var(--pad-editor-x)',
    },
    '.cm-placeholder': { color: 'var(--base-high)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent-high)' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'light-dark(rgba(37, 99, 235, 0.22), rgba(96, 165, 250, 0.22))',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'light-dark(rgba(37, 99, 235, 0.12), rgba(96, 165, 250, 0.14))',
    },
    '.cm-activeLine': {
      backgroundColor: 'light-dark(rgba(0, 0, 0, 0.045), rgba(255, 255, 255, 0.05))',
    },
    '&.cm-focused .cm-matchingBracket': {
      backgroundColor: 'light-dark(rgba(37, 99, 235, 0.14), rgba(96, 165, 250, 0.14))',
      outline: '1px solid light-dark(rgba(37, 99, 235, 0.35), rgba(96, 165, 250, 0.35))',
    },
    '&.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: 'light-dark(rgba(185, 28, 28, 0.12), rgba(248, 113, 113, 0.14))',
    },
  });
}

function belCompletionChrome() {
  const selectedRow = {
    backgroundColor: 'var(--editor-ac-row-bg)',
    color: 'var(--editor-ac-row-fg)',
    borderLeftColor: 'var(--editor-ac-row-accent)',
  };
  return EditorView.baseTheme({
    '.cm-tooltip.cm-tooltip-autocomplete': {
      backgroundColor: 'transparent',
      border: 'none',
      color: 'inherit',
      padding: 0,
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      fontFamily: 'var(--mono, ui-monospace, monospace)',
      fontSize: '0.78rem',
      minWidth: '0',
      maxWidth: 'min(28rem, 90vw)',
      width: 'max-content',
      maxHeight: '17rem',
      padding: '2px 0',
      backgroundColor: 'var(--search-drop-bg)',
      border: '1px solid var(--search-drop-border)',
      borderRadius: 'var(--editor-ac-radius)',
      boxShadow: 'var(--search-drop-shadow)',
      scrollbarWidth: 'thin',
      scrollbarColor: 'color-mix(in srgb, var(--base-mid) 50%, transparent) transparent',
      '& > li, & > completion-section': {
        padding: '0.3rem 0.62rem',
        lineHeight: 1.3,
      },
      '& > li': {
        borderLeft: '2px solid transparent',
        transition: 'background 100ms ease, border-color 100ms ease',
      },
      '& > completion-section': {
        borderBottom: '1px solid var(--menu-separator)',
        paddingLeft: '0.62rem',
        opacity: 0.7,
        fontFamily: 'var(--sans)',
        fontSize: '0.64rem',
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
      },
    },
    '&light .cm-tooltip-autocomplete ul li[aria-selected], &dark .cm-tooltip-autocomplete ul li[aria-selected]': selectedRow,
    '&light .cm-tooltip-autocomplete-disabled ul li[aria-selected], &dark .cm-tooltip-autocomplete-disabled ul li[aria-selected]': {
      backgroundColor: 'var(--editor-ac-row-bg)',
      color: 'var(--editor-ac-row-fg)',
      borderLeftColor: 'transparent',
    },
    '.cm-completionMatchedText': {
      textDecoration: 'none',
      fontWeight: '600',
      color: 'inherit',
    },
    '.cm-completionIcon': {
      display: 'none',
    },
    '.cm-completionDetail': {
      marginLeft: '0.5em',
      fontStyle: 'normal',
      fontSize: '0.64rem',
      color: 'var(--muted-high)',
      opacity: 0.7,
    },
    '.cm-tooltip.cm-completionInfo': {
      padding: '0.34rem 0.55rem',
      backgroundColor: 'light-dark(var(--base-lowest), var(--base-lower))',
      color: 'var(--base-highest)',
      border: '1px solid light-dark(var(--muted-mid), var(--base-higher))',
      borderRadius: 'var(--radius-sm)',
      boxShadow: '0 0.06rem 0.16rem var(--tooltip-shadow-near)',
      fontFamily: 'var(--sans)',
      fontSize: '0.65rem',
      lineHeight: 1.35,
    },
  });
}

function isDocumentDarkTheme() {
  return typeof document !== 'undefined' && !document.documentElement.classList.contains('light');
}

function refreshSyntaxHighlighting(view) {
  ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  // TreeHighlighter skips a rebuild when the Lezer tree grows in place (same ref).
  // Clicking the editor fixes it via viewportChanged — nudge scroll to match that.
  const sc = view.scrollDOM;
  const y = sc.scrollTop;
  sc.scrollTop = y + 1;
  sc.scrollTop = y;
}

function cmThemeExtensions(dark) {
  return dark ? [EditorView.darkTheme.of(true)] : [];
}

function buildDiagLintExtensions(semanticEngine, prefs, getOverlayDiags = null) {
  if (!prefs.diagGutter) return [];
  return lintPresentation({
    getEngine: semanticEngine ? () => semanticEngine : null,
    getOverlayDiags,
    settlementTickField: semanticEngine ? settlementTickField : null,
  });
}

function refreshSettlementLint(view) {
  if (!view?.dom?.isConnected) return;
  // One tick transaction rebuilds Beluga squiggles + gutter synchronously from
  // the checker store. Syntax lint stays on CM's own doc-change scheduler.
  view.dispatch({
    effects: [settlementUpdated.of(null), belNavSemanticTick.of(null)],
  });
}

function baseExtensions(placeholderText, onDocChange, semanticEngine, prefs, bracketKeymapCompartment, getOverlayDiags = null) {
  return [
    settlementTickField,
    beluga(),
    belAliases(),
    EditorView.clipboardInputFilter.of((text) =>
      text == null || text === '' ? text ?? '' : sanitizePastedPlainText(text)
    ),
    ...safeScrollPastEnd(),
    belSearch(),
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    keymap.of([
      { key: 'Enter', run: smartEnter },
      { key: 'Alt-Shift-f', run: formatCommand },
      { key: 'Mod-f', run: openSearchPanel },
      { key: 'F3', run: findNext, shift: findPrevious },
      { key: 'Mod-/', run: toggleComment },
      { key: 'F12', run: (view) => goToDefinition(view) },
      { key: 'Shift-F12', run: (view) => findReferences(view) },
      ...holeCycleKeymap(semanticEngine),
      ...belEditHistoryKeymap(),
      indentWithTab, ...defaultKeymap, ...historyKeymap, ...foldKeymap,
    ]),
    bracketKeymapCompartment.of(keymap.of(buildBracketKeymap(prefs))),
    placeholder(placeholderText),
    belEditorChrome(),
    belugaDiagnosticDecorations({
      getEngine: () => semanticEngine,
      getOverlayDiags,
      settlementTickField,
    }),
    belSyntaxLinter(),
    belHoverTooltip(semanticEngine, getOverlayDiags),
    flashExtension(),
    belRename(),
    belContextMenu(),
    belInspector(),
    belEditorFollow(),
    belGraphLive(),
    EditorView.updateListener.of((update) => {
      if (renameSessionChanged(update)) {
        forceLinting(update.view);
        refreshSettlementLint(update.view);
      }
      if (update.docChanged && !isRenaming(update.state)) {
        // No whole-buffer toString() here: persist pulls the live doc lazily at
        // debounced save time via its getText provider. Passing null signals
        // "dirty, materialize later" (see app.js onDocChange).
        onDocChange(null);
      }
    }),
  ];
}

function belSyntaxLinter() {
  return linter((view) => {
    if (isRenaming(view.state)) return [];
    return syntaxLint(view);
  }, lintLinterOptions({ delay: 80 }));
}

function auxFilePlaceholder() {
  return 'Beluga load order: one file path per line (% comments allowed).';
}

function auxFileExtensions(placeholderText, onDocChange, dark, themeCompartment, cfgDocumentId) {
  return [
    indentUnit.of(INDENT),
    EditorState.tabSize.of(TAB_SIZE),
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    drawSelection(),
    keymap.of([
      { key: 'F12', run: (view) => goToCfgEntry(view, cfgDocumentId) },
      { key: 'Mod-f', run: openSearchPanel },
      { key: 'F3', run: findNext, shift: findPrevious },
      ...belEditHistoryKeymap(),
      ...defaultKeymap, ...historyKeymap,
    ]),
    placeholder(placeholderText),
    belEditorChrome(),
    EditorView.contentAttributes.of({ class: 'cm-aux-file' }),
    themeCompartment.of(cmThemeExtensions(dark)),
    ...(cfgDocumentId ? [
      cfgLinter(cfgDocumentId),
      ...cfgEditorExtensions(cfgDocumentId),
    ] : []),
    ...(cfgDocumentId ? [belEditHistoryListener(cfgDocumentId)] : []),
    belCompletionChrome(),
    belInspector(),
    belEditorFollow(),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onDocChange(update.state.doc.toString());
    }),
  ];
}

function wireStatusDotErrorNav(ideStatusDot) {
  if (!ideStatusDot) return;
  if (ideStatusDot._belErrorNavClick) {
    ideStatusDot.removeEventListener('click', ideStatusDot._belErrorNavClick);
    ideStatusDot.removeEventListener('keydown', ideStatusDot._belErrorNavKey);
  }
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const navigable = () => {
    const s = ideStatusDot.getAttribute('data-live-state');
    return s === 'error' || s === 'error-checking' || s === 'warning';
  };
  ideStatusDot._belErrorNavClick = () => {
    if (!navigable()) return;
    const api = g.BelJarCurrentEditor;
    const v = api && typeof api.getView === 'function' ? api.getView() : null;
    if (v) jumpToNextError(v);
  };
  ideStatusDot._belErrorNavKey = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!navigable()) return;
    e.preventDefault();
    const api = g.BelJarCurrentEditor;
    const v = api && typeof api.getView === 'function' ? api.getView() : null;
    if (v) jumpToNextError(v);
  };
  ideStatusDot.addEventListener('click', ideStatusDot._belErrorNavClick);
  ideStatusDot.addEventListener('keydown', ideStatusDot._belErrorNavKey);
}

function mountAuxEditor(parentEl, options, documentId, docPath) {
  const initialDark = options.dark ?? isDocumentDarkTheme();
  const themeCompartment = new Compartment();
  const chromeCompartment = new Compartment();
  const diagCompartment = new Compartment();
  const editorPrefs = readEditorPrefs();
  const ph = auxFilePlaceholder();
  const initialDoc = sanitizePastedPlainText(options.doc ?? '');
  const isCfg = /\.cfg$/i.test(String(docPath || ''));
  // Refresh the status dot on every edit (defined below; safe to reference — it
  // only fires after the view is mounted), then forward to the host listener.
  function handleDocChange(text) {
    refreshStatusDot();
    if (typeof options.onDocChange === 'function') options.onDocChange(text);
  }
  let state = EditorState.create({
    doc: initialDoc,
    extensions: [
      ...auxFileExtensions(ph, handleDocChange, initialDark, themeCompartment, isCfg ? documentId : null),
      diagCompartment.of(buildDiagLintExtensions(null, editorPrefs)),
      chromeCompartment.of(buildEditorChromeTheme(editorPrefs)),
      EditorView.updateListener.of((update) => {
        if (diagnosticCount(update.state) !== diagnosticCount(update.startState)) {
          refreshStatusDot();
        }
      }),
    ],
  });
  const view = new EditorView({ parent: parentEl, state });
  view.dom.classList.add('bel-editor--aux', 'bel-editor--cfg');
  activeEditorView = view;
  activeEditorPrefsApplier = (prefs) => {
    view.dispatch({
      effects: [
        chromeCompartment.reconfigure(buildEditorChromeTheme(prefs)),
        diagCompartment.reconfigure(buildDiagLintExtensions(null, prefs)),
      ],
    });
  };

  const ideStatusDot = typeof document !== 'undefined'
    ? document.getElementById('ide-status-dot')
    : null;
  wireStatusDotErrorNav(ideStatusDot);

  function cfgStatus() {
    if (!isCfg) return { errors: 0, warnings: 0, diags: [], fileCount: 0 };
    const diags = cfgDiagnostics(view.state.doc, documentId);
    let errors = 0;
    let warnings = 0;
    for (const d of diags) {
      if (d.severity === 'error') errors += 1;
      else warnings += 1;
    }
    return {
      errors,
      warnings,
      diags,
      fileCount: countCfgEntries(view.state.doc),
    };
  }
  function collectLintTooltipItems() {
    return cfgDiagnostics(view.state.doc, documentId).map((d) => {
      const line = view.state.doc.lineAt(d.from);
      return { line: d.from - line.from + 1, msg: d.message || '', kind: d.severity };
    });
  }
  function refreshStatusDot() {
    const { diags, fileCount } = cfgStatus();
    updateAuxStatusDot(ideStatusDot, diags, { fileCount, lintItems: collectLintTooltipItems() });
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    if (typeof g.dispatchEvent === 'function') {
      const { errors, warnings } = cfgStatus();
      g.dispatchEvent(new CustomEvent('beljar:file-lint', {
        detail: { errors, warnings, items: collectLintTooltipItems() },
      }));
    }
  }
  refreshStatusDot();
  if (isCfg) queueMicrotask(() => forceLinting(view));
  if (!options.jumpAt) scheduleViewportRestore(view, options.initialLocal, { focus: true });

  return {
    getDocumentId() { return documentId; },
    getIdeStatus: () => {
      const { errors, warnings } = cfgStatus();
      return { errors, warnings };
    },
    getLintTooltipItems: collectLintTooltipItems,
    getValue: () => view.state.doc.toString(),
    setValue(text) {
      replaceDocNonUndoable(view, text);
    },
    setValueNonUndoable(text) {
      replaceDocNonUndoable(view, text);
    },
    getCurrentFileId() { return documentId; },
    focus: () => view.focus(),
    insertTop(text) {
      const block = sanitizePastedPlainText(text ?? '') + '\n\n';
      view.dispatch({ changes: { from: 0, to: 0, insert: block } });
      view.focus();
    },
    insertBottom(text) {
      const cur = view.state.doc.toString();
      const prefix = cur ? cur.replace(/\s*$/, '') + '\n\n' : '';
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: prefix + sanitizePastedPlainText(text ?? '') },
      });
      view.focus();
    },
    insertAtSelection(text) {
      view.dispatch(view.state.replaceSelection(sanitizePastedPlainText(text ?? '')));
      view.focus();
    },
    getView: () => view,
    runSyntaxLint: () => [],
    getDeclSpan: () => null,
    setDarkTheme(dark) {
      view.dispatch({ effects: themeCompartment.reconfigure(cmThemeExtensions(dark)) });
    },
    destroy() {
      activeEditorPrefsApplier = null;
      activeEditorView = null;
      view.destroy();
    },
    refreshLint() {
      if (isCfg) forceLinting(view);
      refreshStatusDot();
    },
    goToDefinition(pos) { return isCfg ? goToCfgEntry(view, documentId, pos) : false; },
    jumpToRange(range) { return jumpToRange(view, range); },
    peekRange(jumpAt) {
      const resolved = resolveJumpRange(view.state.doc, jumpAt);
      return resolved ? peekRange(view, resolved) : false;
    },
    getViewport() {
      return captureViewportLocal(view);
    },
    applyViewport(local) { scheduleViewportRestore(view, local); },
    scheduleJumpToRange(jumpAt) { scheduleJumpToRange(view, jumpAt); },
    restoreViewport() { scheduleViewportRestore(view, options.initialLocal); },
    listProjectSymbols() {
      const g = typeof window !== 'undefined' ? window : globalThis;
      const P = g.BelJarPersist;
      if (!P || !isCfg || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') return [];
      try {
        return listGroupSymbols(P.listFiles(), documentId, (id) => P.getFileText(id));
      } catch (_) {
        return [];
      }
    },
    jumpToNextError() { return jumpToNextError(view); },
    undo() { return runEditHistoryUndo(); },
    redo() { return runEditHistoryRedo(); },
    selectAll() { return selectAll(view); },
    openSearch() { return openSearchPanel(view); },
    toggleComment() { return toggleComment(view); },
  };
}

function persistDevOptsFromGlobal() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.BelJarPersist;
  if (!P) return {};
  return {
    getActiveCfgsForDir: typeof P.getActiveCfgsForDir === 'function'
      ? (dir) => P.getActiveCfgsForDir(dir)
      : undefined,
    getActiveCfgForDir: typeof P.getActiveCfgForDir === 'function'
      ? (dir) => P.getActiveCfgForDir(dir)
      : undefined,
  };
}

// Members of the development containing [fileId]. Live editor text is spliced in
// only when [fileId] is the file currently open — never from another buffer.
function developmentMembersForFile(view, fileId) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.BelJarPersist;
  if (!P || !fileId) return { members: [], paths: [] };
  const files = P.listFiles();
  const editorActiveId = P.getActiveFileId();
  const live = view?.state?.doc ? view.state.doc.toString() : null;
  const getText = (id) => (id === editorActiveId && live != null ? live : P.getFileText(id));
  const liveFor = fileId === editorActiveId ? live : null;
  return listDevelopmentMembers(
    files, fileId, getText, persistDevOptsFromGlobal(), liveFor,
  );
}

function developmentMembersPersisted(fileId) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.BelJarPersist;
  if (!P || !fileId) return { members: [], paths: [] };
  const files = P.listFiles();
  return listDevelopmentMembers(
    files, fileId, (id) => P.getFileText(id), persistDevOptsFromGlobal(), null,
  );
}

function dispatchDevelopmentChecked() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  g.dispatchEvent(new CustomEvent('beljar:development-checked'));
}

let devCheckInflight = null;
let devCheckInflightSig = '';
let lastSettledNonActiveDevSig = '';

// Explorer/tab health dots ask fileHealthFor() for EVERY file row on every
// navigation, settlement pass, and dev-check completion. Each raw computation
// resolves the whole development (reading + JSON-parsing every member's stored
// state twice) and syntax-parses the file — O(files²) JSON parses per refresh,
// which froze navigation as suites grew. Health only actually changes at a few
// discrete moments, so memoize by fileId and invalidate wholesale when any of
// them fire (notifyExplorerHealthChanged funnels dev-check + settlement; a file
// switch and the active file's own edits are folded into the key below).
const fileHealthCache = new Map(); // fileId -> { key, value }
let fileHealthGeneration = 0;

export function invalidateFileHealthCache() {
  fileHealthGeneration += 1;
  fileHealthCache.clear();
}

// Health changes only when a CHECK produces new results: dev-check completion
// (the event below) and settlement-ready (explicit call in
// syncSettlementFileHealth). Never invalidate on 'explorer-health-changed' —
// that event also rides UI refresh paths, and wiring invalidation to it made
// every keystroke recompute health for the whole project. The active file's
// cache key already includes its live-text hash, so its own dot stays honest
// between checks without any global invalidation.
(function registerFileHealthInvalidation() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  if (!g || typeof g.addEventListener !== 'function') return;
  g.addEventListener('beljar:development-checked', invalidateFileHealthCache);
})();

function runDevelopmentCheck(dc, members) {
  const perf = getCheckTrace();
  const span = perf.enabled ? perf.spanStart('dev-check:total', { members: members.length }) : null;
  const getText = (id) => members.find((m) => m.id === id)?.text ?? '';
  return dc.check(members).then((result) => {
    if (span) perf.spanEnd(span, { ok: result?.ok });
    syncHoleGoalsFromDevelopment(members, result?.memberHoles);
    notifyExplorerHealthChanged();
    dispatchDevelopmentChecked();
    return result;
  }).catch((err) => {
    if (span) perf.spanEnd(span, { ok: false });
    throw err;
  });
}

export function fileHealthFor(fileId, liveText = null) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.BelJarPersist;
  if (!P || !fileId) return { errors: 0, warnings: 0, items: [] };
  // A non-active file's health comes from the (shared) dev-check cache and its
  // own stored text — neither depends on which file is active — so it stays
  // cached across navigation and is invalidated only by a generation bump. The
  // ACTIVE file additionally tracks its LIVE buffer + live Beluga, so fold the
  // live text into its key and mark it active so switching files recomputes it.
  const activeIdForKey = typeof P.getActiveFileId === 'function' ? P.getActiveFileId() : null;
  const isActiveForKey = fileId === activeIdForKey;
  const liveKey = (isActiveForKey && liveText != null)
    ? `${liveText.length}:${fileContentSig(liveText)}`
    : '';
  const cacheKey = `${fileHealthGeneration}|${isActiveForKey ? 'A' : '-'}|${liveKey}`;
  const cached = fileHealthCache.get(fileId);
  if (cached && cached.key === cacheKey) return cached.value;
  const value = computeFileHealth(fileId, liveText, P);
  fileHealthCache.set(fileId, { key: cacheKey, value });
  return value;
}

function computeFileHealth(fileId, liveText, P) {
  const file = P.getFileById(fileId);
  if (!file) return { errors: 0, warnings: 0, items: [] };
  const text = liveText != null ? liveText : String(P.getFileText(fileId) ?? '');
  const activeId = P.getActiveFileId();
  const view = activeEditorView;
  const { members } = developmentMembersForFile(view, fileId);
  const { members: persistedMembers } = developmentMembersPersisted(fileId);
  const dc = getDevelopmentChecker();
  const cached = members.length
    ? devCheckCacheLookup(dc, members, persistedMembers)
    : null;
  const isActive = fileId === activeId;

  let activeBelugaHealth = null;
  if (isActive && view?.state) {
    const eng = view._belSemanticEngine;
    const settle = eng?.settleState?.();
    if (eng && settle && settle !== 'idle' && settle !== 'failed') {
      const diags = collectStatusDiagnostics(view, eng)
        .filter((d) => !isSuitePreludeBannerDiag(d));
      activeBelugaHealth = belugaDiagsToFileHealth(diags, view.state.doc);
    }
  }

  if (members.length) {
    return resolveExplorerFileHealth({
      file,
      text,
      memberDiagnostics: cached?.memberDiagnostics,
      devCheckCached: !!cached,
      activeBelugaHealth,
      isActiveFile: isActive,
    });
  }
  return resolveExplorerFileHealth({
    file,
    text,
    devCheckCached: false,
    activeBelugaHealth,
    isActiveFile: isActive,
  });
}

export function ensureDevelopmentChecked(view) {
  const dc = getDevelopmentChecker();
  const P = typeof window !== 'undefined' ? window : globalThis;
  const persist = P.BelJarPersist;
  if (!dc || !persist || !view) return;
  const activeId = persist.getActiveFileId();
  const { members } = developmentMembersForFile(view, activeId);
  if (!members.length) return;
  const sig = developmentSignature(members);
  if (dc.cachedFor(members)) return;
  if (devCheckInflight && devCheckInflightSig === sig) return devCheckInflight;
  devCheckInflightSig = sig;
  devCheckInflight = runDevelopmentCheck(dc, members).finally(() => {
    devCheckInflight = null;
    devCheckInflightSig = '';
  });
  return devCheckInflight;
}

export function ensureDevelopmentCheckedForFile(view, fileId) {
  const dc = getDevelopmentChecker();
  if (!dc || !view || !fileId) return;
  const { members } = developmentMembersForFile(view, fileId);
  if (!members.length || dc.cachedFor(members)) return;
  runDevelopmentCheck(dc, members).catch(() => {});
}

// Run (or reuse) the development-scoped check for the development containing
// [fileId] and return the reconstructed hole at (line, col), if any.
export async function computeHoleGoalOnDemand(view, fileId, line, col) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const dc = getDevelopmentChecker();
  const P = g.BelJarPersist;
  if (!dc || !P || !fileId) return null;
  const files = P.listFiles();
  const file = files.find((f) => f.id === fileId);
  if (!file) return null;
  const { members } = developmentMembersForFile(view, fileId);
  if (!members.length) return null;

  const holesFor = (map) => findMemberHole(map?.[file.name], line, col);

  const api = g.BelJarCurrentEditor;
  const eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
  if (eng && typeof eng.memberHoles === 'function') {
    const settled = holesFor(eng.memberHoles());
    if (settled) return settled;
  }

  let result = dc.cachedFor(members);
  if (result?.memberHoles) syncHoleGoalsFromDevelopment(members, result.memberHoles);
  if (!result) {
    try {
      result = await runDevelopmentCheck(dc, members);
    } catch (_) {
      return null;
    }
  }
  const fromDev = holesFor(result?.memberHoles);
  if (fromDev) return fromDev;

  if (eng && typeof eng.memberHoles === 'function') {
    return holesFor(eng.memberHoles());
  }
  return null;
}

export function cachedDevelopmentMemberHoles(view) {
  const dc = getDevelopmentChecker();
  const P = typeof window !== 'undefined' ? window : globalThis;
  const persist = P.BelJarPersist;
  if (!dc || !persist) return {};
  const { members } = developmentMembersForFile(view, persist.getActiveFileId());
  const cached = dc.cachedFor(members);
  if (cached?.memberHoles) syncHoleGoalsFromDevelopment(members, cached.memberHoles);
  return getHoleGoalsStore().freshMap(members.map((m) => ({ name: m.name, text: m.text })));
}

export function cachedMemberHolesForFile(view, fileId) {
  const dc = getDevelopmentChecker();
  if (!dc || !fileId) return {};
  const { members } = developmentMembersForFile(view, fileId);
  const cached = dc.cachedFor(members);
  if (cached?.memberHoles) syncHoleGoalsFromDevelopment(members, cached.memberHoles);
  return getHoleGoalsStore().freshMap(members.map((m) => ({ name: m.name, text: m.text })));
}

export function freshHoleGoalsForProject(view) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.BelJarPersist;
  if (!P || typeof P.listFiles !== 'function') return {};
  const files = P.listFiles();
  const activeId = P.getActiveFileId();
  const live = view?.state?.doc ? view.state.doc.toString() : null;
  const entries = files.map((f) => ({
    name: f.name,
    text: (f.id === activeId && live != null) ? live : String(P.getFileText(f.id) ?? ''),
  }));
  return getHoleGoalsStore().freshMap(entries);
}

export function freshHoleGoalsForDevelopment(view) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.BelJarPersist;
  if (!P) return {};
  const activeId = P.getActiveFileId();
  const { members } = developmentMembersForFile(view, activeId);
  return getHoleGoalsStore().freshMap(members.map((m) => ({ name: m.name, text: m.text })));
}

export function freshHoleGoalsForFile(view, fileId) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.BelJarPersist;
  if (!P || !fileId) return {};
  const files = P.listFiles();
  const file = files.find((f) => f.id === fileId);
  if (!file) return {};
  const activeId = P.getActiveFileId();
  const live = view?.state?.doc ? view.state.doc.toString() : null;
  const text = (file.id === activeId && live != null) ? live : String(P.getFileText(file.id) ?? '');
  const holes = getHoleGoalsStore().fresh(file.name, fileContentSig(text));
  return holes?.length ? { [file.name]: holes } : {};
}

export function developmentMemberPaths(view) {
  const P = typeof window !== 'undefined' ? window : globalThis;
  if (!P.BelJarPersist) return [];
  const activeId = P.BelJarPersist.getActiveFileId();
  const { members, paths } = developmentMembersForFile(view, activeId);
  if (paths.length) return paths;
  return members.map((m) => m.name);
}

function declSpanAt(view, pos) {
  if (!view?.state) return null;
  const tree = syntaxTree(view.state);
  let node = tree.resolveInner(pos, 1);
  while (node && node.parent && node.parent.name !== 'Program') {
    node = node.parent;
  }
  if (!node || node.name === 'Program') return null;
  return { from: node.from, to: node.to };
}

export function enrichHoleHitsWithGoalState(view, hits, fileName, engine, opts = {}) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.BelJarPersist;
  const activeId = P?.getActiveFileId?.();
  const isActive = opts.isActiveFile != null
    ? opts.isActiveFile
    : !!(view && P && opts.fileId && opts.fileId === activeId);
  const doc = isActive && view?.state?.doc ? view.state.doc : null;
  const fileText = doc
    ? doc.toString()
    : String(opts.fileText ?? '');
  const devPaths = opts.developmentPaths
    || (view && typeof developmentMemberPaths === 'function' ? developmentMemberPaths(view) : []);
  const inDevelopment = opts.inDevelopment != null
    ? opts.inDevelopment
    : fileInActiveDevelopment(fileName, devPaths);
  const settle = isActive && engine ? engine.settleState?.() : null;
  const goalsByPos = isActive ? settlementGoalsByPos(engine, settle) : new Map();
  const syntactic = (hits || []).map((hit, i) => ({
    index: hit.hole?.index ?? i,
    line: hit.hole?.line,
    col: hit.hole?.col || 1,
    from: hit.from,
    to: hit.to,
  }));
  const rows = buildHoleDisplayRows({
    fileName,
    fileText,
    doc,
    inDevelopment,
    settleState: settle,
    syntacticHoles: syntactic,
    settlementGoalsByPos: goalsByPos,
  });
  const byKey = new Map(rows.map((r) => [`${r.line}:${r.col}`, r]));
  return (hits || []).map((hit) => {
    const key = `${hit.hole.line}:${hit.hole.col || 1}`;
    const row = byKey.get(key);
    if (!row) return hit;
    return {
      ...hit,
      hole: {
        ...hit.hole,
        goal: row.goal ?? hit.hole.goal ?? null,
        goalState: row.goalState,
        loadingLive: row.loadingLive,
      },
    };
  });
}

let certifyHoleGoalsTimer = null;
let certifyHoleGoalsInflight = null;
let certifyHoleGoalsAttemptKey = null;

function certifyHoleGoalsNeedKey(view, hits) {
  const P = typeof window !== 'undefined' ? window.BelJarPersist : null;
  if (!view?.state?.doc || !P || !hits?.length) return '';
  const need = hits.filter((h) => {
    const st = h.hole?.goalState;
    return st === 'pending' || st === 'approximate';
  });
  if (!need.length) return '';
  const sig = fileContentSig(view.state.doc.toString());
  const pos = need.map((h) => `${h.hole.line}:${h.hole.col || 1}`).sort().join(',');
  return `${sig}|${pos}`;
}

export function scheduleCertifyHoleGoalsScoped(view, hits) {
  const attemptKey = certifyHoleGoalsNeedKey(view, hits);
  if (!attemptKey) return;
  if (attemptKey === certifyHoleGoalsAttemptKey && (certifyHoleGoalsInflight || certifyHoleGoalsTimer)) return;
  if (certifyHoleGoalsTimer) clearTimeout(certifyHoleGoalsTimer);
  certifyHoleGoalsTimer = setTimeout(() => {
    certifyHoleGoalsTimer = null;
    if (!view?.state?.doc) return;
    const liveHits = hits.filter((h) => {
      if (h.from == null || h.from >= view.state.doc.length) return false;
      if (view.state.doc.sliceString(h.from, h.from + 1) !== '?') return false;
      const st = h.hole?.goalState;
      return st === 'pending' || st === 'approximate';
    });
    if (!liveHits.length) return;
    const freshKey = certifyHoleGoalsNeedKey(view, liveHits);
    if (!freshKey || freshKey !== attemptKey) return;
    certifyHoleGoalsScoped(view, liveHits, freshKey).catch(() => {});
  }, 150);
}

export async function certifyHoleGoalsScoped(view, hits, attemptKey) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const client = g.BelugaClient;
  const P = g.BelJarPersist;
  if (!view || !client || !P || !hits?.length) return;
  const need = hits.filter((h) => {
    const st = h.hole?.goalState;
    return st === 'pending' || st === 'approximate';
  });
  if (!need.length) return;
  const key = attemptKey || certifyHoleGoalsNeedKey(view, hits);
  if (!key) return;
  if (key === certifyHoleGoalsAttemptKey && certifyHoleGoalsInflight) return certifyHoleGoalsInflight;
  if (certifyHoleGoalsInflight) return certifyHoleGoalsInflight;

  const activeId = P.getActiveFileId();
  const files = P.listFiles();
  const active = files.find((f) => f.id === activeId);
  if (!active) return;

  const doc = view.state.doc;
  const fileCode = checkerSnapshot(syntaxTree(view.state), doc).code;
  const getText = (id) => (id === activeId ? doc.toString() : P.getFileText(id));
  const prelude = buildPrelude(files, activeId, getText);
  const assembled = assembleCheckerCode(fileCode, prelude);
  const assembledCode = assembled.code;
  const fileStart = assembled.fileOffset != null ? assembled.fileOffset : 0;

  const byDecl = new Map();
  for (const hit of need) {
    const span = declSpanAt(view, hit.from);
    if (!span) continue;
    const decl = parseDecl(doc.sliceString(span.from, span.to));
    if (!decl) continue;
    const key = decl.kw + ':' + decl.name;
    if (!byDecl.has(key)) {
      const re = new RegExp('(^|\\n)\\s*(rec|proof)\\s+' + decl.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:');
      const match = re.exec(assembledCode);
      if (!match) continue;
      const declStart = match.index + match[1].length;
      const semi = assembledCode.indexOf(';', declStart);
      const declEnd = semi === -1 ? assembledCode.length : semi + 1;
      byDecl.set(key, { decl, declStart, declEnd, hits: [] });
    }
    byDecl.get(key).hits.push(hit);
  }
  if (!byDecl.size) return;

  const contentSig = fileContentSig(doc.toString());
  certifyHoleGoalsInflight = (async () => {
    let changed = false;
    try {
      if (client.beginProverSession) await client.beginProverSession();
      for (const { decl, declStart, declEnd, hits: declHits } of byDecl.values()) {
        const proveCode = proveOrchestrationCode(assembledCode, decl.name, declStart, declEnd, fileStart);
        if (client.loadProverChecker) await client.loadProverChecker(proveCode);
        const res = client.checkResultForProver
          ? await client.checkResultForProver(proveCode)
          : await client.checkResult(proveCode);
        if (!res?.ok || !res.output) continue;
        const parsed = parseHoles(res.output);
        if (!parsed.length) continue;
        const docHoles = mapProveHolesToDocHits(parsed, proveCode, decl.name, declHits);
        if (!docHoles.length) continue;
        if (getHoleGoalsStore().merge(active.name, contentSig, docHoles)) changed = true;
      }
      if (changed) g.dispatchEvent?.(new CustomEvent('beljar:hole-goals-updated'));
    } finally {
      certifyHoleGoalsAttemptKey = key;
      if (client.endProverSession) client.endProverSession();
      certifyHoleGoalsInflight = null;
    }
  })();
  return certifyHoleGoalsInflight;
}

export function resolveHoleGoalForHit(view, engine, hit) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.BelJarPersist;
  if (!view?.state?.doc || !hit?.hole || !P) {
    return { goal: null, state: 'pending', loadingLive: true };
  }
  const active = P.listFiles?.()?.find((f) => f.id === P.getActiveFileId());
  if (!active) return { goal: null, state: 'pending', loadingLive: true };
  const settle = engine?.settleState?.() ?? null;
  let settlementGoal = null;
  if (settle === 'ready' && typeof engine.getHoles === 'function') {
    for (const h of engine.getHoles()) {
      if (h.line === hit.hole.line && (h.col || 1) === (hit.hole.col || 1)) {
        settlementGoal = h.goal || null;
        break;
      }
    }
  }
  return resolveHoleGoalForPosition({
    fileName: active.name,
    fileText: view.state.doc.toString(),
    line: hit.hole.line,
    col: hit.hole.col,
    inDevelopment: true,
    settleState: settle,
    settlementGoal,
  });
}

export function mount(parentEl, options = {}) {
  if (!parentEl) return null;
  if (typeof options.onDocChange !== 'function') {
    throw new TypeError('BelJarEditor.mount requires options.onDocChange (function)');
  }
  const g = typeof window !== 'undefined' ? window : self;
  const docId = options.documentId || '';
  const docPath = options.filePath || resolveCfgDocumentPath(docId);
  const isCfgFile = /\.cfg$/i.test(docPath);
  parentEl.replaceChildren();
  if (isCfgFile) return mountAuxEditor(parentEl, options, docId, docPath);

  const ph = options.placeholder ?? 'Write Beluga code here...';
  const themeCompartment = new Compartment();
  const chromeCompartment = new Compartment();
  const ideCompartment = new Compartment();
  const bracketKeymapCompartment = new Compartment();
  const diagCompartment = new Compartment();
  const initialDark = options.dark ?? isDocumentDarkTheme();
  const editorPrefs = readEditorPrefs();

  let semanticView = null;

  function healthySnapshotForView() {
    if (!semanticView) return '';
    const doc = semanticView.state.doc;
    return checkerSnapshot(syntaxTree(semanticView.state), doc).code;
  }

  // The background scheduler ticks every ~50ms while deriving types and calls
  // getCheckerCode() (→ this) each tick; settlement + hole actions call it too.
  // Cache by CONTENT fingerprints (prelude siblings + active snapshot), not doc
  // object identity — CodeMirror allocates a new Text every keystroke, which
  // previously forced O(suite) reassembly on every call ("worse deeper in the suite").
  // Prelude is cached independently of the active file: editing the open buffer
  // must NOT re-join / re-hash every predecessor on each keystroke.
  // NOTE: this cache must NOT be keyed on suiteOverlayGeneration. Its value
  // (prelude + suite text-analysis) is a pure function of the sibling texts and
  // the active text — nothing here depends on checker RESULTS. Tying it to the
  // overlay generation (bumped on every settle start/complete) invalidated the
  // prelude on every settlement tick, so the LAST file in a suite — the one with
  // the biggest prelude and the most checker churn — re-joined + re-parsed all of
  // its predecessors many times per second while typing. That was the late-file
  // latency. The suite-prelude BANNER (a separate cache) is what legitimately
  // tracks the generation.
  let checkContextCache = {
    preludeIds: null,
    preludeTexts: null,
    prelude: null,
    preludeFp: '',
    activeDoc: null,
    activeFp: '',
    value: null,
  };

  function fnv1a(text) {
    let h = 0x811c9dc5;
    const s = String(text ?? '');
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `${s.length.toString(16)}:${h.toString(16).padStart(8, '0')}`;
  }

  function buildCheckContext(doc) {
    if (!g.BelJarPersist || !doc) return null;
    const files = g.BelJarPersist.listFiles();
    const activeId = g.BelJarPersist.getActiveFileId();
    const getText = (id) => (id === activeId ? doc.toString() : g.BelJarPersist.getFileText(id));
    const pre = preludeFilesFor(files, activeId, getText);
    const preludeIds = pre.map((f) => f.id);
    // Prefer string-identity equality (persist returns stable refs for untouched
    // siblings) so we never scan prelude bytes while typing the active file.
    const preludeTexts = pre.map((f) => String(g.BelJarPersist.getFileText(f.id) ?? ''));
    const preludeSame = preludeCacheMatches(checkContextCache, preludeIds, preludeTexts);

    if (preludeSame && checkContextCache.activeDoc === doc && checkContextCache.value) {
      return checkContextCache.value;
    }

    let prelude = checkContextCache.prelude;
    let preludeFp = checkContextCache.preludeFp;
    if (!preludeSame) {
      prelude = buildPrelude(files, activeId, getText);
      preludeFp = prelude ? fnv1a(prelude.code) : '';
    }

    const activeText = doc.toString();
    const activeFp = fnv1a(activeText);
    if (preludeSame
      && checkContextCache.activeFp === activeFp
      && checkContextCache.value) {
      // Same content, new Text object — reuse value but retarget doc.
      const reused = { ...checkContextCache.value, doc };
      checkContextCache = {
        ...checkContextCache,
        activeDoc: doc,
        value: reused,
      };
      return reused;
    }

    const fileCode = semanticView
      ? checkerSnapshot(syntaxTree(semanticView.state), doc).code
      : activeText;
    const suite = suiteAnalysisFor(files, activeId, getText, doc);
    const active = files.find((f) => f.id === activeId);
    const value = {
      doc,
      prelude,
      fileCode,
      activeFileName: active ? active.name : null,
      suiteDiagnostics: suite.diagnostics,
      suiteFindings: suite.findings,
      preludeFp,
      contentKey: `${preludeIds.join(',')}|${activeFp}`,
    };
    checkContextCache = {
      preludeIds,
      preludeTexts,
      prelude,
      preludeFp,
      activeDoc: doc,
      activeFp,
      value,
    };
    return value;
  }

  function nonActiveDevSignature(view, activeId) {
    const { members } = developmentMembersForFile(view, activeId);
    const nonActive = members.filter((m) => m.id !== activeId);
    return developmentSignature(nonActive);
  }

  function scheduleDevelopmentCheckIfNeeded(view) {
    const activeId = g.BelJarPersist?.getActiveFileId?.();
    if (!activeId) return;
    const sig = nonActiveDevSignature(view, activeId);
    if (sig === lastSettledNonActiveDevSig) return;
    lastSettledNonActiveDevSig = sig;
    ensureDevelopmentChecked(view);
  }

  function scheduleDevelopmentCheck(view) {
    ensureDevelopmentChecked(view);
  }

  let devCheckDebounceTimer = null;

  function scheduleDebouncedDevelopmentCheck(view) {
    if (devCheckDebounceTimer != null) clearTimeout(devCheckDebounceTimer);
    devCheckDebounceTimer = setTimeout(() => {
      devCheckDebounceTimer = null;
      // Gate on the NON-ACTIVE members' signature (scheduleDevelopmentCheckIfNeeded),
      // never unconditionally: the live active text is spliced into the members,
      // so an ungated call re-ran the WHOLE-development Beluga check after every
      // typing pause — permanently saturating the checker worker. The active
      // file's own results come from the settlement; the whole-dev pass only
      // needs to re-run when some OTHER member actually changed.
      if (view.dom?.isConnected) scheduleDevelopmentCheckIfNeeded(view);
    }, SETTLE_DELAY_MS);
  }

  // Suite-composition analysis for the active development: diagnostics surfaced in
  // the OPEN file (same problems the cfg reports), PLUS the raw findings (with
  // affected files resolved to NAMES) so the settlement can recognise when a
  // "prelude error" is really caused by the active file's own pragma/decl and
  // re-attribute the blame instead of telling the user to fix a correct file.
  function suiteAnalysisFor(files, activeId, getText, doc) {
    const pre = preludeFilesFor(files, activeId, getText);
    if (!pre.length) return { diagnostics: [], findings: [] };
    const active = files.find((f) => f.id === activeId);
    const ordered = [...pre, active].filter(Boolean);
    const entries = ordered.map((f) => ({ key: f.id, name: f.name, text: String(getText(f.id) ?? '') }));
    const lineSpan = (lineIdx0) => {
      const n = Math.min(Math.max(1, lineIdx0 + 1), doc.lines);
      const line = doc.line(n);
      return { from: line.from, to: Math.max(line.to, line.from + 1) };
    };
    const nameOf = new Map(ordered.map((f) => [f.id, f.name]));
    const findings = analyzeSuite(entries).map((f) => ({
      ...f,
      atName: nameOf.get(f.at) || f.at,
      atIsActive: f.at === activeId,
      affectedNames: (f.affected || []).map((k) => nameOf.get(k) || k),
    }));
    return { diagnostics: suiteFileDiagnostics(entries, activeId, lineSpan), findings };
  }

  function healthyCodeWithPrelude() {
    if (!semanticView) return '';
    const ctx = buildCheckContext(semanticView.state.doc);
    return ctx ? assembleCheckerCode(ctx.fileCode, ctx.prelude).code : healthySnapshotForView();
  }

  // Code + prelude line-offset for driving interactive hole commands. The hole's
  // doc line L appears in the assembled program at line L + offsetLines (holes
  // only surface on a CLEAN reconstruction, where fileCode === the live snapshot,
  // so no block masking shifts positions). Built from the LIVE doc so a command
  // runs against exactly what the user sees.
  function holeActionContext() {
    if (!semanticView) return null;
    const ctx = buildCheckContext(semanticView.state.doc);
    if (!ctx) return { code: healthySnapshotForView(), offsetLines: 0 };
    const assembled = assembleCheckerCode(ctx.fileCode, ctx.prelude);
    return {
      code: assembled.code,
      offsetLines: assembled.prelude ? assembled.prelude.offsetLines : 0,
      fileStart: assembled.fileOffset != null ? assembled.fileOffset : 0,
    };
  }

  let refreshIdeStatusRef = () => {};

  function currentScopeKey() {
    if (!g.BelJarPersist) return '';
    return developmentForFile(
      g.BelJarPersist.listFiles(),
      g.BelJarPersist.getActiveFileId(),
      (id) => g.BelJarPersist.getFileText(id),
    ).scopeKey;
  }

  let semanticEngine;
  // Bumped whenever the checked results feeding the suite-prelude banner change
  // (settlement lands, whole-development check completes).
  //
  // CRITICAL: the banner recompute (computeSuitePreludeBanner) re-parses EVERY
  // prelude member — it must NEVER run inside a keystroke transaction. It used to:
  // the diag-gutter StateField reads getOverlayDiags() on every docChanged, and a
  // lazy cache keyed on this generation meant the FIRST keystroke after any settle
  // tick paid the whole-suite reparse synchronously, before paint. On a late suite
  // file settles fire constantly, so nearly every keystroke paid it — literal
  // typing lag that scales with prelude depth. Fix: recompute EAGERLY here (bump
  // fires only from settlement async callbacks, off the input path) and cache the
  // RESULT, so getOverlayDiags() during a keystroke is always a pure read.
  let suiteOverlayGeneration = 0;
  let suiteOverlayValue = [];
  function recomputeSuiteOverlay() {
    if (!semanticView?.state) { suiteOverlayValue = []; return; }
    const banner = computeSuitePreludeBanner(semanticView);
    suiteOverlayValue = banner ? [banner] : [];
  }
  const bumpSuiteOverlay = () => {
    suiteOverlayGeneration += 1;
    recomputeSuiteOverlay();
  };

  function mergedMemberDiagnostics(members) {
    const dc = getDevelopmentChecker();
    const fromDev = dc?.cachedFor(members)?.memberDiagnostics || {};
    const fromSettled = semanticEngine?.memberDiagnostics?.() || {};
    const out = { ...fromDev };
    for (const [name, list] of Object.entries(fromSettled)) {
      if (!list?.length || out[name]?.length) continue;
      out[name] = list;
    }
    return out;
  }

  function syncSettlementFileHealth(view, checkerSnap) {
    if (!view?.state || !checkerSnap || checkerSnap.state !== 'ready') return;
    // Settlement landed real diagnostics — this IS a health change, so drop the
    // memo before announcing it (the announce triggers the rAF'd dot refresh).
    invalidateFileHealthCache();
    notifyExplorerHealthChanged();
  }

  function computeSuitePreludeBanner(view) {
    const P = g.BelJarPersist;
    if (!P || !view?.state) return null;
    const activeId = P.getActiveFileId();
    const { members } = developmentMembersForFile(view, activeId);
    if (members.length < 2) return null;
    const live = view.state.doc.toString();
    const getText = (id) => (id === activeId ? live : P.getFileText(id));
    const files = P.listFiles();
    const suite = suiteAnalysisFor(files, activeId, getText, view.state.doc);
    return suitePreludeBannerForActive({
      doc: view.state.doc,
      members,
      activeId,
      memberDiagnostics: mergedMemberDiagnostics(members),
      getText,
      suiteFindings: suite.findings,
    });
  }

  // The lint decorations, gutter wash, and tooltips each call this several times
  // per editor update, and computeSuitePreludeBanner reparses EVERY development
  // member — so an un-memoized call reparsed the whole suite ~5×/keystroke,
  // scaling with prelude depth (the navigation/typing lag). Cache by the live
  // doc identity (stable within an update) + a generation bumped whenever member
  // diagnostics change, so repeated calls reuse one computation and it only
  // recomputes when the doc or the checked results actually change.
  // The banner is anchored at line 1 ("an earlier suite file is broken") and its
  // content depends ONLY on the members' checked results — never on the active
  // doc's live text — so it is safe to reuse across keystrokes and refresh only
  // when a check lands (the generation bump). This keeps the whole-suite reparse
  // it performs OFF the per-keystroke path entirely (at HEAD there was no overlay
  // in the gutter decorations at all; this restores that cost profile).
  // Pure read of the eagerly-computed banner (see recomputeSuiteOverlay). NEVER
  // recomputes — so the diag-gutter StateField calling this on every keystroke's
  // docChanged costs O(1), never a whole-suite reparse.
  function suiteOverlayDiagnostics() {
    return suiteOverlayValue;
  }

  semanticEngine = createSemanticEngine({
    documentId: options.documentId || 'workspace://main.bel',
    belugaClient: g.BelugaClient,
    getCheckContext: (syntaxSnap) => (syntaxSnap?.doc ? buildCheckContext(syntaxSnap.doc) : null),
    getSuiteOverlayDiagnostics: suiteOverlayDiagnostics,
    getScopeKey: currentScopeKey,
    onTypeObserved: () => {
      noteTypingVelocity();
      const perf = getCheckTrace();
      if (perf.enabled) perf.beginEdit();
      if (options.persist && typeof options.persist.scheduleCheckpointSave === 'function') {
        options.persist.scheduleCheckpointSave();
      }
      if (semanticView?.dom?.isConnected) {
        queueMicrotask(() => {
          if (!semanticView.dom.isConnected) return;
          semanticView.dispatch({ effects: belNavSemanticTick.of(null) });
        });
      }
    },
    getSettleDelay: (syntaxSnap) => {
      const files = g.BelJarPersist?.listFiles?.() || [];
      const activeId = g.BelJarPersist?.getActiveFileId?.();
      const pre = preludeFilesFor(files, activeId, (id) => g.BelJarPersist.getFileText(id));
      return computeSettleDelayMs(syntaxSnap, { preludePaths: pre.length });
    },
    onSettlement: (checkerSnap) => {
      if (semanticView && checkerSnap) {
        const doc = semanticView.state.doc;
        const ctx = buildCheckContext(doc);
        const files = g.BelJarPersist?.listFiles?.() || [];
        const activeId = g.BelJarPersist?.getActiveFileId?.();
        const byName = new Map(files.map((f) => [f.name, f]));
        syncHoleGoalsFromSettlement(ctx, checkerSnap, (name) => {
          const f = byName.get(name);
          if (!f) return '';
          if (f.id === activeId) return doc.toString();
          return String(g.BelJarPersist.getFileText(f.id) ?? '');
        });
      }
      if (semanticView) {
        bumpSuiteOverlay();
        scheduleDevelopmentCheckIfNeeded(semanticView);
        // Prefer the code settlement actually certified (often compressed).
        // Reloading the full prelude+file into intel after every settle undoes
        // the frontier win.
        const code = (checkerSnap && checkerSnap.checkedCode)
          || healthyCodeWithPrelude();
        if (code && g.BelugaClient?.warmIntel) g.BelugaClient.warmIntel(code).catch(() => {});
        refreshSettlementLint(semanticView);
        refreshIdeStatusRef(semanticView);
        syncSettlementFileHealth(semanticView, checkerSnap);
      }
    },
    onSettlementChecking: () => {
      if (!semanticView) return;
      bumpSuiteOverlay();
      refreshIdeStatusRef(semanticView);
      refreshSettlementLint(semanticView);
    },
  });

  function docFingerprint(text) {
    if (g.BelugaClient && typeof g.BelugaClient.fingerprint === 'function') {
      return g.BelugaClient.fingerprint(text);
    }
    if (typeof g.BelJarPersist !== 'undefined' && g.BelJarPersist.documentFingerprint) {
      return g.BelJarPersist.documentFingerprint(text);
    }
    return '';
  }

  function hydrateSemanticCheckpoint(text) {
    const semantic = options.semanticCheckpoint;
    if (!semantic) return;
    const belugaBuild = typeof g.BelJarPersist !== 'undefined'
      ? g.BelJarPersist.readStoredBelugaMode()
      : 'stable';
    semanticEngine.importCheckpoint(semantic, {
      docFp: docFingerprint(text),
      belugaBuild,
      scopeKey: currentScopeKey(),
    });
  }

  if (options.persist && typeof options.persist.setCheckpointProviders === 'function') {
    options.persist.setCheckpointProviders({
      getSemantic: () => semanticEngine.exportCheckpoint(),
      // Lazy live-text provider: persistNow() materializes the doc string at
      // debounced save time, so we never toString() the whole buffer on the
      // input critical path.
      getText: () => (semanticView?.state?.doc ? semanticView.state.doc.toString() : ''),
      getViewport: () => captureViewportLocal(semanticView),
      getDocFp: (text) => docFingerprint(text != null ? text : semanticView?.state.doc.toString() || ''),
      getBelugaBuild: () => (
        typeof g.BelJarPersist !== 'undefined' ? g.BelJarPersist.readStoredBelugaMode() : 'stable'
      ),
      getScopeKey: currentScopeKey,
    });
  }

  const ideStatusDot = typeof document !== 'undefined'
    ? document.getElementById('ide-status-dot')
    : null;

  function wireStatusDotErrorNavLocal() {
    wireStatusDotErrorNav(ideStatusDot);
  }

  function checkerSettling() {
    const s = semanticEngine.settleState?.();
    if (s === 'checking' || s === 'stale') return true;
    const ver = semanticEngine.getSnapshot?.()?.syntax?.version;
    if (ver != null && semanticEngine.isSettledFor && !semanticEngine.isSettledFor(ver)) {
      const parse = computeParseCoverage(semanticView.state);
      if (!parse.complete) return false;
      if (semanticEngine.isSettlementPending?.()) return true;
      semanticEngine.ensureSettled?.();
      return semanticEngine.isSettlementPending?.();
    }
    return false;
  }

  function statusLintTooltipItems(view) {
    const diags = collectStatusDiagnostics(view, semanticEngine);
    return lintTooltipItemsFromDiagnostics(diags, view.state.doc);
  }

  function refreshIdeStatus(view) {
    return timeSync('ideStatus', () => refreshIdeStatusInner(view));
  }

  function refreshIdeStatusInner(view) {
    const settling = checkerSettling();
    const diags = collectStatusDiagnostics(view, semanticEngine);
    const lintItems = lintTooltipItemsFromDiagnostics(diags, view.state.doc);
    updateIdeStatusDot(ideStatusDot, diags, {
      parseCoverage: computeParseCoverage(view.state),
      belugaPending: settling,
      lintItems,
    });
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    if (typeof g.dispatchEvent === 'function') {
      g.dispatchEvent(new CustomEvent('beljar:file-lint', {
        detail: {
          errors: diags.filter((d) => d.severity === 'error').length,
          warnings: diags.filter((d) => d.severity === 'warning').length,
          items: lintItems,
        },
      }));
    }
  }

  function collectIdeStatus() {
    const diags = collectStatusDiagnostics(view, semanticEngine);
    const parse = computeParseCoverage(view.state);
    const snap = semanticEngine.getSnapshot?.() || null;
    return {
      parse,
      belugaChecking: checkerSettling(),
      errors: diags.filter((d) => d.severity === 'error').length,
      warnings: diags.filter((d) => d.severity === 'warning').length,
      syntaxVersion: snap?.syntax?.version ?? null,
      symbolCount: snap?.summary?.symbols ?? snap?.symbols?.globalSymbols?.length ?? null,
      dirtyCount: snap?.graph?.dirty?.size ?? snap?.summary?.dirty ?? 0,
    };
  }

  refreshIdeStatusRef = refreshIdeStatus;

  function seedSemanticScheduler(view) {
    const sched = semanticEngine.scheduler;
    if (!sched) return;
    sched.onCursorMove(view.state.selection.main.head);
    const vr = view.visibleRanges[0];
    if (vr) sched.onViewportChange({ from: vr.from, to: vr.to });
    sched.seedFromFrontier();
  }

  function syncSemanticFromView(view, opts = {}) {
    return timeSync('semanticUpdate', () => syncSemanticFromViewInner(view, opts));
  }

  function syncSemanticFromViewInner(view, opts = {}) {
    const tree = syntaxTree(view.state);
    semanticEngine.update(tree, view.state.doc, {
      cursorPos: view.state.selection.main.head,
      visibleRanges: view.visibleRanges,
      changes: opts.changes ?? null,
      deferSettlement: opts.deferSettlement,
      forceResettle: opts.forceResettle,
    });
    if (!opts.deferSettlement) semanticEngine.ensureSettled?.();
    refreshIdeStatus(view);
  }

  let semanticSyncGen = 0;
  let pendingSemanticSync = null;
  let semanticSyncRaf = 0;
  let semanticSyncTimer = 0;
  let semanticSyncFirstQueuedAt = 0;

  // The heavy per-keystroke main-thread work is symbolStore.update + graph
  // rebuild inside syncSemanticFromView (~23 ms on an 18 KB late-suite file):
  // it re-resolves every identifier in the file even though the user changed one
  // declaration. That whole snapshot only feeds hover / nav / occurrence
  // highlight / rename / dependency graph / settlement scheduling — none of which
  // is observed MID-BURST; it's what you consult when you PAUSE. So while keys
  // are arriving faster than a frame, coalesce the rebuild into a short idle
  // window instead of running it every keystroke (which also pushes out the next
  // paint). Incremental Lezer parse + syntax highlighting stay live (they run off
  // CM's own tree, not this snapshot), so typing feels like a plain textarea.
  //
  // MAX_SEMANTIC_STALENESS caps how long the snapshot may lag even under
  // continuous typing, so nav/settlement never starve; IDLE_SYNC_MS is the quiet
  // gap that triggers an immediate flush (the common "typed a bit, paused" case).
  const IDLE_SYNC_MS = 45;
  const MAX_SEMANTIC_STALENESS_MS = 220;

  function flushPendingSemanticSync() {
    if (semanticSyncTimer) { clearTimeout(semanticSyncTimer); semanticSyncTimer = 0; }
    if (semanticSyncRaf) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(semanticSyncRaf);
      else clearTimeout(semanticSyncRaf);
      semanticSyncRaf = 0;
    }
    semanticSyncFirstQueuedAt = 0;
    const job = pendingSemanticSync;
    pendingSemanticSync = null;
    if (!job || job.gen !== semanticSyncGen) return;
    const { view, changes, renameEnded, deferSettlement } = job;
    if (!view.dom?.isConnected || isRenaming(view.state)) return;
    if (renameEnded) syncSemanticFromView(view, { forceResettle: true });
    else syncSemanticFromView(view, { changes, deferSettlement });
    semanticEngine.onDocChange();
    seedSemanticScheduler(view);
    if (renameEnded) scheduleDevelopmentCheck(view);
    else scheduleDebouncedDevelopmentCheck(view);
    refreshIdeStatus(view);
  }

  function scheduleSemanticSync(view, opts = {}) {
    const nextChanges = opts.changes ?? null;
    let changes = nextChanges;
    if (pendingSemanticSync?.changes && nextChanges) {
      try {
        changes = pendingSemanticSync.changes.compose(nextChanges);
      } catch (_) {
        changes = nextChanges;
      }
    } else if (pendingSemanticSync?.changes && !nextChanges) {
      changes = pendingSemanticSync.changes;
    }
    pendingSemanticSync = {
      gen: ++semanticSyncGen,
      view,
      changes,
      renameEnded: !!(opts.renameEnded || pendingSemanticSync?.renameEnded),
      deferSettlement: opts.deferSettlement != null
        ? !!opts.deferSettlement
        : !!pendingSemanticSync?.deferSettlement,
    };
    // Rename-end must land promptly (it re-settles the corrected doc) — flush on
    // the next frame, no idle coalescing.
    if (pendingSemanticSync.renameEnded) {
      if (semanticSyncTimer) { clearTimeout(semanticSyncTimer); semanticSyncTimer = 0; }
      if (semanticSyncRaf) return;
      const kick = () => { semanticSyncRaf = 0; flushPendingSemanticSync(); };
      semanticSyncRaf = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(kick) : setTimeout(kick, 0);
      return;
    }
    const now = Date.now();
    if (!semanticSyncFirstQueuedAt) semanticSyncFirstQueuedAt = now;
    // Hard staleness cap: if the snapshot has been dirty too long under
    // continuous typing, flush now rather than deferring again.
    if (now - semanticSyncFirstQueuedAt >= MAX_SEMANTIC_STALENESS_MS) {
      flushPendingSemanticSync();
      return;
    }
    // Otherwise (re)arm the idle window: the rebuild runs once typing pauses.
    if (semanticSyncTimer) clearTimeout(semanticSyncTimer);
    semanticSyncTimer = setTimeout(() => {
      semanticSyncTimer = 0;
      flushPendingSemanticSync();
    }, IDLE_SYNC_MS);
  }

  const treeWatchPlugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.treeLength = syntaxTree(view.state).length;
      this.parseMilestone = 0;
    }
    update(update) {
      if (isRenaming(update.state)) return;
      const newLen = syntaxTree(update.state).length;
      const docLen = update.state.doc.length;
      const pct = docLen ? Math.floor((newLen / docLen) * 100) : 100;
      const milestone = pct >= 100 ? 100 : Math.floor(pct / 25) * 25;
      if (newLen > this.treeLength || milestone > this.parseMilestone) {
        this.treeLength = newLen;
        this.parseMilestone = milestone;
        scheduleSemanticSync(update.view, { deferSettlement: milestone < 100 });
        const v = update.view;
        queueMicrotask(() => {
          if (v.dom.isConnected) v.dispatch({ effects: belNavSemanticTick.of(null) });
        });
      }
    }
  });

  const docSyncExt = EditorView.updateListener.of((update) => {
    const H = globalRef().BelJarEditHistory;
    const historyApplying = H?.isApplying?.() ?? false;
    // Keep the status dot in lock-step with the rendered diagnostics: whenever
    // the lint set changes (syntax pass, Beluga check landing), refresh it.
    const settlementTicked = update.transactions.some((tr) =>
      tr.effects.some((e) => e.is(settlementUpdated)));
    if (!historyApplying && (settlementTicked
      || diagnosticCount(update.state) !== diagnosticCount(update.startState))) {
      refreshIdeStatus(update.view);
    }
    const renameEnded = renameSessionChanged(update) && !isRenaming(update.state);
    if (renameEnded) {
      bumpSuiteOverlay();
      // Rename rewrites the doc: drop the check-context cache so the next build
      // re-reads texts. (Not gen-keyed anymore; clear by nulling the keys.)
      checkContextCache = {
        preludeIds: null,
        preludeTexts: null,
        prelude: null,
        preludeFp: '',
        activeDoc: null,
        activeFp: '',
        value: null,
      };
      lastSettledNonActiveDevSig = '';
    }
    if (update.docChanged) {
      if (!isRenaming(update.state)) {
        scheduleSemanticSync(update.view, {
          changes: update.changes,
          renameEnded,
        });
      }
      if (!isRenaming(update.state) && options.persist) {
        options.persist.scheduleCheckpointSave();
      }
      // Hole-list surfaces refresh without waiting for Beluga. Skip during rename:
      // preview edits do not update the semantic engine or persisted doc.
      const gg = typeof globalThis !== 'undefined' ? globalThis : window;
      if (!isRenaming(update.state) && typeof gg.dispatchEvent === 'function') {
        gg.dispatchEvent(new CustomEvent('beljar:doc-changed'));
      }
    } else if (renameEnded) {
      scheduleSemanticSync(update.view, { renameEnded: true });
    }
    if (update.selectionSet || update.viewportChanged) {
      if (!isRenaming(update.state) && options.persist) {
        options.persist.scheduleCheckpointSave();
      }
    }
    if (update.selectionSet) {
      // A selection change with no edit means the user stopped typing and is now
      // navigating (click / arrow / jump) — flush any coalesced semantic rebuild
      // so hover / go-to-def / occurrence highlight see the current doc at once.
      if (!update.docChanged && pendingSemanticSync) flushPendingSemanticSync();
      semanticEngine.onCursorMove(update.state.selection.main.head);
      seedSemanticScheduler(update.view);
    }
    if (update.viewportChanged) {
      const vr = update.view.visibleRanges[0];
      if (vr) semanticEngine.onViewportChange({ from: vr.from, to: vr.to });
      seedSemanticScheduler(update.view);
    }
  });

  const extensions = [
    ...baseExtensions(ph, options.onDocChange, semanticEngine, editorPrefs, bracketKeymapCompartment, suiteOverlayDiagnostics),
    diagCompartment.of(buildDiagLintExtensions(semanticEngine, editorPrefs, suiteOverlayDiagnostics)),
    docSyncExt,
    treeWatchPlugin,
    themeCompartment.of(cmThemeExtensions(initialDark)),
    chromeCompartment.of(buildEditorChromeTheme(editorPrefs)),
    ideCompartment.of(buildToggleableExtensions(editorPrefs, { semanticEngine })),
  ];
  if (editorPrefs.foldGutter && docId) {
    extensions.push(belFoldPersistence(docId));
  }
  if (docId) {
    extensions.push(belEditHistoryListener(docId));
  }

  const initialDoc = prepareEditorDoc(options.doc ?? '', docPath);
  let state = EditorState.create({ doc: initialDoc, extensions });
  globalRef().BelJarEditHistory?.markNonUndoable?.();
  const ir0 = indentRange(state, 0, state.doc.length);
  if (!ir0.empty) {
    state = state.update({
      changes: ir0,
      annotations: Transaction.addToHistory.of(false),
    }).state;
  }

  const view = new EditorView({
    parent: parentEl,
    state,
  });
  semanticView = view;
  if (g.BelugaClient?.setIntelKeepWarm) g.BelugaClient.setIntelKeepWarm(true);
  activeEditorView = view;
  // Let the IDE action layer reach the engine straight off the view, before the
  // global BelJarCurrentEditor handle is assigned by app.js.
  view._belSemanticEngine = semanticEngine;
  wireStatusDotErrorNavLocal();
  if (/\.elf$/i.test(docPath)) view.dom.classList.add('bel-editor--elf');

  semanticEngine.setCheckerCode(() => healthyCodeWithPrelude());
  hydrateSemanticCheckpoint(initialDoc);
  syncSemanticFromView(view);
  semanticEngine.ensureSettled?.();
  queueMicrotask(() => {
    if (view.dom?.isConnected) ensureDevelopmentChecked(view);
  });
  if (typeof g.addEventListener === 'function') {
    g.addEventListener('beljar:development-checked', () => {
      if (!semanticView?.dom?.isConnected) return;
      bumpSuiteOverlay();
      refreshIdeStatusRef(semanticView);
      refreshSettlementLint(semanticView);
    });
  }
  if (!options.jumpAt) scheduleViewportRestore(view, options.initialLocal, { focus: true });
  if (typeof options.onDocChange === 'function') {
    options.onDocChange(view.state.doc.toString());
  }
  seedSemanticScheduler(view);
  if (semanticEngine.scheduler && semanticEngine.scheduler.startBackground) {
    semanticEngine.scheduler.startBackground();
  }

  const scheduleIdle = typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (fn) => setTimeout(fn, 1);
  scheduleIdle(() => {
    refreshSyntaxHighlighting(view);
    syncSemanticFromView(view);
    seedSemanticScheduler(view);
    view.dispatch({ effects: belNavSemanticTick.of(null) });
  });
  requestAnimationFrame(() => refreshSyntaxHighlighting(view));

  view.dom.addEventListener(
    'paste',
    (e) => {
      if (!e.clipboardData || view.state.readOnly) return;
      const t = e.clipboardData.getData('text/plain');
      if (t === '') return;
      e.preventDefault();
      e.stopPropagation();
      view.dispatch(view.state.replaceSelection(sanitizePastedPlainText(t)), {
        scrollIntoView: true,
        userEvent: 'input.paste',
      });
    },
    true
  );

  const fontsReady = typeof document !== 'undefined' && document.fonts?.ready;
  if (fontsReady) {
    fontsReady.then(() => {
      view.requestMeasure();
      requestAnimationFrame(() => view.requestMeasure());
    });
  }

  activeEditorPrefsApplier = (prefs) => {
    view.dispatch({
      effects: [
        chromeCompartment.reconfigure(buildEditorChromeTheme(prefs)),
        ideCompartment.reconfigure(buildToggleableExtensions(prefs, { semanticEngine })),
        bracketKeymapCompartment.reconfigure(keymap.of(buildBracketKeymap(prefs))),
        diagCompartment.reconfigure(buildDiagLintExtensions(semanticEngine, prefs, suiteOverlayDiagnostics)),
      ],
    });
    refreshSettlementLint(view);
  };

  return {
    getValue() {
      return view.state.doc.toString();
    },
    setValue(text) {
      replaceDocNonUndoable(view, text);
      queueMicrotask(() => reindentWholeDocument(view));
    },
    setValueNonUndoable(text, opts) {
      replaceDocNonUndoable(view, text, opts);
    },
    replaceDocumentNonUndoable(text, opts) {
      replaceDocNonUndoable(view, text, opts);
    },
    getCurrentFileId() { return docId; },
    flushCheckpoint() {
      if (options.persist?.flushCheckpoint) options.persist.flushCheckpoint();
    },
    focus() {
      view.focus();
    },
    insertTop(text) {
      const block = sanitizePastedPlainText(text ?? '') + '\n\n';
      dispatchEdit(view, { changes: { from: 0, to: 0, insert: block } }, {
        fileId: docId,
        kind: 'library-insert',
      });
      queueMicrotask(() => {
        reindentWholeDocument(view);
        view.focus();
      });
    },
    insertBottom(text) {
      const cur = view.state.doc.toString();
      const prefix = cur ? cur.replace(/\s*$/, '') + '\n\n' : '';
      const block = sanitizePastedPlainText(text ?? '');
      dispatchEdit(view, {
        changes: { from: 0, to: view.state.doc.length, insert: prefix + block },
      }, {
        fileId: docId,
        kind: 'library-insert',
      });
      queueMicrotask(() => {
        reindentWholeDocument(view);
        view.focus();
      });
    },
    insertAtSelection(text) {
      dispatchEdit(view, view.state.replaceSelection(sanitizePastedPlainText(text ?? '')), {
        fileId: docId,
        kind: 'library-insert',
        userEvent: 'input.paste',
      });
      view.focus();
    },
    getView() {
      return view;
    },
    runSyntaxLint() {
      return syntaxLint(view);
    },
    getDeclSpan(pos) {
      const tree = syntaxTree(view.state);
      let node = tree.resolveInner(pos, 1);
      while (node && node.parent && node.parent.name !== 'Program') {
        node = node.parent;
      }
      if (!node || node.name === 'Program') return null;
      return { from: node.from, to: node.to };
    },
    getLintBlocks() {
      const tree = syntaxTree(view.state);
      return computeLintBlocks(tree, view.state.doc);
    },
    getBlockGroups() {
      return this.getLintBlocks().blocks;
    },
    maskForBelugaCheck() {
      return checkerSnapshot(syntaxTree(view.state), view.state.doc).code;
    },
    format() {
      return formatCommand(view);
    },
    setIdeExtensions(exts) {
      view.dispatch({ effects: ideCompartment.reconfigure(exts) });
    },
    setChromeTheme(theme) {
      view.dispatch({ effects: chromeCompartment.reconfigure(theme) });
    },
    setDarkTheme(dark) {
      view.dispatch({ effects: themeCompartment.reconfigure(cmThemeExtensions(!!dark)) });
    },

    getSemanticEngine() { return semanticEngine; },
    getHoleActionContext() { return holeActionContext(); },
    harpoonSuiteFingerprints(fileId) {
      const P = g.BelJarPersist;
      if (!P || !fileId) return {};
      const files = P.listFiles();
      const activeId = P.getActiveFileId();
      const live = semanticView && activeId === fileId
        ? semanticView.state.doc.toString()
        : null;
      const getText = (id) => (id === activeId && live != null ? live : (P.getFileText(id) || ''));
      const { paths } = listDevelopmentMembers(
        files, fileId, getText, persistDevOptsFromGlobal(), live,
      );
      const out = {};
      for (const path of paths) {
        const f = files.find((row) => row.name === path);
        if (!f) continue;
        out[path] = textFingerprint(getText(f.id));
      }
      return out;
    },
    getParseCoverage() { return computeParseCoverage(view.state); },
    getIdeStatus() { return collectIdeStatus(); },
    getLintTooltipItems() { return statusLintTooltipItems(view); },

    remoduleContext() {
      if (!semanticView) return;
      const text = semanticView.state.doc.toString();
      const blob = semanticEngine.exportCheckpoint();
      semanticEngine.importCheckpoint(blob, {
        docFp: docFingerprint(text),
        belugaBuild: typeof g.BelJarPersist !== 'undefined'
          ? g.BelJarPersist.readStoredBelugaMode()
          : 'stable',
        scopeKey: currentScopeKey(),
      });
      if (semanticEngine.session?.invalidate) semanticEngine.session.invalidate();
      const sched = semanticEngine.scheduler;
      if (sched?.invalidateAll) sched.invalidateAll();
      syncSemanticFromView(semanticView);
      if (sched?.seedFromFrontier) sched.seedFromFrontier({ includeCleanViewport: true });
      refreshSettlementLint(semanticView);
      refreshIdeStatusRef(semanticView);
    },

    // IDE navigation/refactor actions, callable from header menus or scripts.
    getDocumentId() { return docId; },
    goToDefinition(pos) { return goToDefinition(view, pos); },
    jumpToRange(range) { return jumpToRange(view, range); },
    jumpToReference(range, name) { return jumpToReference(view, range, name, range); },
    peekRange(jumpAt) {
      const resolved = resolveJumpRange(view.state.doc, jumpAt);
      return resolved ? peekRange(view, resolved) : false;
    },
    getViewport() {
      return captureViewportLocal(view);
    },
    applyViewport(local) { scheduleViewportRestore(view, local); },
    scheduleJumpToRange(jumpAt) { scheduleJumpToRange(view, jumpAt); },
    restoreViewport() { scheduleViewportRestore(view, options.initialLocal); },
    syncIntelAt(pos) {
      const p = pos != null ? pos : view.state.selection.main.from;
      ensureSyntaxTree(view.state, view.state.doc.length, 5000);
      syncSemanticFromView(view);
      semanticEngine.onCursorMove(p);
      const vr = view.visibleRanges[0];
      if (vr) semanticEngine.onViewportChange({ from: vr.from, to: vr.to });
      return p;
    },
    // Definitions in the OTHER files of this file's development group
    // (palette "@" mode; the engine owns the active file's own symbols).
    listProjectSymbols() {
      const P = g.BelJarPersist;
      if (!P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') return [];
      try {
        return listGroupSymbols(
          P.listFiles(),
          options.documentId || P.getActiveFileId(),
          (id) => P.getFileText(id)
        );
      } catch (_) {
        return [];
      }
    },
    jumpToNextError() { return jumpToNextError(view); },
    findReferences(pos) { return findReferences(view, pos); },
    rename(pos) { return startRename(view, pos); },
    cancelRename() { return cancelRenameIfActive(view); },
    revealInInspector(pos) { return revealInInspector(view, pos); },
    // Dependency graph: with a pos → local neighborhood; without → whole-file.
    openDependencyGraph(pos) {
      return pos == null ? openGlobalGraphWindow(view) : openLocalGraphWindow(view, pos);
    },

    getHydratePromise() { return Promise.resolve(0); },

    // Tear the editor down for a document switch: halt background semantic
    // work permanently and detach the CodeMirror view from the DOM.
    destroy() {
      cancelRenameIfActive(view);
      if (editorPrefs.foldGutter && docId) flushFoldKeys(view, docId);
      activeEditorPrefsApplier = null;
      activeEditorView = null;
      if (g.BelugaClient?.setIntelKeepWarm) g.BelugaClient.setIntelKeepWarm(false);
      if (semanticEngine.scheduler && semanticEngine.scheduler.stop) {
        semanticEngine.scheduler.stop();
      }
      view.destroy();
    },

    // Edit-menu commands — these work even when the editor isn't focused.
    undo() { return runEditHistoryUndo(); },
    redo() { return runEditHistoryRedo(); },
    selectAll() { return selectAll(view); },
    openSearch() { return openSearchPanel(view); },
    toggleComment() { return toggleComment(view); },
  };
}
