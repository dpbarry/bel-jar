import { Compartment, EditorState, Prec, StateEffect, StateField, Transaction, EditorSelection } from '@codemirror/state';
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
import { defaultKeymap, history, historyKeymap, indentLess, indentMore, toggleComment, undo, redo, selectAll } from '@codemirror/commands';
import { openSearchPanel, findNext, findPrevious } from '@codemirror/search';
import { searchPanel } from './ide/search-panel.mjs';
import { ensureSyntaxTree, foldAll, foldKeymap, indentRange, indentUnit, syntaxTree, unfoldAll } from '@codemirror/language';
import { diagnosticCount, forceLinting, forEachDiagnostic, linter } from '@codemirror/lint';
import { beluga } from './language.mjs';
import { formatCommand, formatSource, formatString } from './format/document-format.mjs';
export { formatCommand, formatSource, formatString };
import {
  scheduleJumpToRange, scheduleViewportRestore, viewportCenterLine,
  resolveJumpRange, captureFormatViewportAnchor, captureViewportLocal,
} from './ide/viewport.mjs';
import { aliases, maybeExpandBelAliases } from './aliases.mjs';

export {
  expandBelAliases,
  maybeExpandBelAliases,
  readAliasActivationMode,
  getAliasPairs,
  defaultAliasPairs,
  normalizeAliasPairs,
  invalidateAliasPairs,
  ALIAS_PAIRS,
  DEFAULT_ALIAS_MAP,
} from './aliases.mjs';
export {
  enableJumpLog, jumpLogEnabled, logJumpMount, logJumpRequest, logJumpResult,
} from './ide/jump-log.mjs';
export { prepareEditorDoc, sanitizeEditorText } from './editor-doc-prep.mjs';
export { highlightSourceFragment, renderSourceInto } from './format/source-render.mjs';
export { normalizeType, renderTypeInto } from './format/type-render.mjs';
export { buildProofProgram, commitProof, parseDecl, declRangeWithSemicolon } from './harpoon/harpoon-program.mjs';
export { formatProofBody } from './format/proof-format.mjs';
export { captureHarpoonAnchor, assessHarpoonAnchor, textFingerprint, holeKeyFromHit } from './harpoon/harpoon-anchor.mjs';
export {
  proveProgram,
  theoremUnderProof,
  theoremDeclRange,
  candidateMoves,
  proveOrchestrationCode,
  movePrefilterOk,
  stepLead,
  stepMeta,
} from './prover/prover-orchestrator.mjs';
export {
  buildCommitCheckCodes,
  needsFullCommitCheck,
  countSiblingHoledDecls,
} from './harpoon/harpoon-program.mjs';
export { parseHoles } from './prover/hole-report.mjs';
// Manual Harpoon — the interactive session reducer (pure; the Lab injects the oracle).
export {
  manualState,
  movesAt,
  focusHole,
  focusOn,
  isComplete as manualIsComplete,
  attemptMove,
  applyMove,
  absorbAuto,
  undo as manualUndo,
  redo as manualRedo,
  canUndo as manualCanUndo,
  canRedo as manualCanRedo,
} from './prover/prover-manual.mjs';
export { fillCandidates } from './prover/hole-split.mjs';
export { normalizeProofModel, normalizeSubgoal, parseBinders, applicableTactics, splitTargets } from './harpoon/harpoon-model.mjs';
export { createCachedGoalHintIcon, createApproxGoalHintIcon, bindCachedGoalHintTooltip, CACHED_GOAL_TIP, APPROXIMATE_GOAL_TIP, RECHECKING_GOAL_TIP, CHECKING_GOAL_TIP, CACHED_GOAL_HINT_SVG } from './prover/cached-goal-hint.mjs';
export { mountHoleGoalTier } from './prover/hole-goal-pending-ui.mjs';
export { holeHostFile, scanFileHoles, hitsFromHoles, declSpanInText } from './harpoon/scan-file-holes.mjs';
export {
  buildHoleDisplayRows,
  settlementGoalsByPos,
  fileInActiveDevelopment,
  resolveHoleGoalForPosition,
} from './prover/hole-goal-display.mjs';
export {
  invalidateFileHealthCache,
  fileHealthFor,
  invalidateFileHealthAfterChange,
  ensureDevelopmentChecked,
  ensureDevelopmentCheckedForFile,
  computeHoleGoalOnDemand,
  holeActionContextForFile,
  cachedDevelopmentMemberHoles,
  cachedMemberHolesForFile,
  freshHoleGoalsForProject,
  freshHoleGoalsForDevelopment,
  freshHoleGoalsForFile,
  developmentMemberPaths,
  enrichHoleHitsWithGoalState,
  scheduleCertifyHoleGoalsScoped,
  certifyHoleGoalsScoped,
  resolveHoleGoalForHit,
} from './prover/hole-goal-system.mjs';
export {
  collectWorkspaceInspector,
  restoreWorkspaceInspector,
  collectFloatingInspectorWindows,
  restoreFloatingInspectorWindow,
} from './ide/inspector.mjs';
export {
  collectFloatingGraphWindows,
  restoreFloatingGraphWindow,
} from './graph/graph-view.mjs';
export {
  createEditHistory,
  dispatchEdit,
  editHistoryKeymap,
  editHistoryListener,
  editHistoryTxn,
} from './edit-history.mjs';
import {
  syntaxLint,
  belugaDiagnosticDecorations,
  lintLinterOptions,
  lintPresentation,
} from './ide/syntax-lint.mjs';
import { cfgLinter, cfgDiagnostics, resolveCfgDocumentPath } from './ide/cfg-lint.mjs';
import { cfgEditorExtensions, countCfgEntries, goToCfgEntry } from './ide/cfg-editor.mjs';
import { collectStatusDiagnostics, computeParseCoverage, updateAuxStatusDot, updateIdeStatusDot } from './ide/ide-status.mjs';
import { gutterTooltipBand } from './ide/gutter-tip-band.mjs';
import { lintTooltipItemsFromDiagnostics } from './ide/diag-gutter.mjs';
import { checkerSnapshot } from './semantic/checker-snapshot.mjs';
import { computeLintBlocks } from './lint-units.mjs';
import { hoverTooltip } from './ide/hover.mjs';
import { belAutocompletion, toggleEditorAutocomplete } from './ide/completion/index.mjs';
import { completionChrome } from './ide/completion/chrome.mjs';
import { holeCycleKeymap, cycleHole } from './prover/hole-decorations.mjs';
import { createSemanticEngine } from './semantic/semantic-engine.mjs';
import { createEditorCheckHost } from './semantic/editor-check-host.mjs';
import { listGroupSymbols, normalizeUnlocatedBelugaRunOutput } from './semantic/project-prelude.mjs';
export { normalizeUnlocatedBelugaRunOutput };
import {
  isSuitePreludeBannerDiag,
} from './semantic/suite-prelude-banner.mjs';
import { fileContentSig } from './semantic/development-check.mjs';
import { textFingerprint } from './harpoon/harpoon-anchor.mjs';
import {
  getProjectDiagnostics,
} from './semantic/project-diagnostics.mjs';
export {
  getProjectDiagnostics,
  createProjectDiagnostics,
  mergeFileLayers,
  computeFileHealthKey,
  makeHealthKey,
} from './semantic/project-diagnostics.mjs';
import { getCheckTrace, timeSync } from './perf/check-trace.mjs';
getCheckTrace(); // install window.Perf at bundle load (HUD / console)
import { noteTypingVelocity } from './semantic/settle-delay.mjs';
import {
  developmentMembersForFile,
} from './prover/hole-goal-system.mjs';
export { mapProveHolesToDocHits } from './prover/prover-orchestrator.mjs';
export {
  inferredDeclBinders, priorDeclBinders, peelLeadingBinders, mergeDeclSignatures,
} from './semantic/merge-decl-signatures.mjs';
import { navSemanticTick } from './ide/navigation.mjs';
import { rename, startRename, cancelRenameIfActive, isRenaming, renameSessionChanged } from './ide/rename.mjs';
import { contextMenu } from './ide/context-menu.mjs';
import { findReferences } from './ide/refs-panel.mjs';
import {
  flashExtension, goToDefinition, jumpToRange, jumpToReference, jumpToNextError, jumpToPrevError,
  listDocumentProblems, revealBinder, revealInInspector, peekRange,
} from './ide/ide-actions.mjs';
import { holeAt, canIntro, splitTargetsOf, runIntro, runFill, runSplit } from './prover/hole-actions.mjs';
import { openLocalGraphWindow, openGlobalGraphWindow, graphLive } from './graph/graph-view.mjs';

export function openDependencyGraphForView(view, pos) {
  if (!view) return false;
  return pos == null ? openGlobalGraphWindow(view) : openLocalGraphWindow(view, pos);
}
import { inspector } from './ide/inspector.mjs';
import { editorFollow } from './ide/follow-sync.mjs';
import { prepareEditorDoc, sanitizeEditorText } from './editor-doc-prep.mjs';
import {
  readEditorPrefs,
  buildEditorChromeTheme,
  buildToggleableExtensions,
  buildBracketKeymap,
  buildSelectionExtensions,
} from './editor-prefs.mjs';
import { applySaveTransforms } from './ide/save-transforms.mjs';
import { foldPersistence, flushFoldKeys } from './ide/fold-persist.mjs';
import {
  editHistoryKeymap,
  editHistoryListener,
  dispatchEdit,
} from './edit-history.mjs';

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
  const H = globalRef().EditHistory;
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
  const effects = opts.scrollIntoView
    ? EditorView.scrollIntoView(head, { y: 'nearest', x: 'nearest' })
    : undefined;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: doc },
    selection: EditorSelection.single(anchor, head),
    annotations: anns,
    effects,
  });
}

function runEditHistoryUndo() {
  const H = globalRef().EditHistory;
  return H?.undo?.() ?? false;
}

function runEditHistoryRedo() {
  const H = globalRef().EditHistory;
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

function scrollPastEndExtensions(prefs) {
  return prefs.scrollPastEnd === false ? [] : safeScrollPastEnd();
}

function editorChrome() {
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
  const presentation = prefs.diagPresentation || 'both';
  if (presentation === 'none') return [];
  const severity = prefs.diagSeverity === 'errors' ? 'errors' : 'all';
  const showUnderlines = presentation === 'both' || presentation === 'underlines';
  const showGutter = presentation === 'both' || presentation === 'gutter';
  const exts = [];
  if (showUnderlines) {
    exts.push(belugaDiagnosticDecorations({
      getEngine: semanticEngine ? () => semanticEngine : null,
      getOverlayDiags,
      settlementTickField: semanticEngine ? settlementTickField : null,
      severity,
    }));
  }
  if (showGutter) {
    exts.push(...lintPresentation({
      getEngine: semanticEngine ? () => semanticEngine : null,
      getOverlayDiags,
      settlementTickField: semanticEngine ? settlementTickField : null,
      severity,
    }));
  }
  return exts;
}

function refreshSettlementLint(view) {
  if (!view?.dom?.isConnected) return;
  // One tick transaction rebuilds Beluga squiggles + gutter synchronously from
  // the checker store. Syntax lint stays on CM's own doc-change scheduler.
  view.dispatch({
    effects: [settlementUpdated.of(null), navSemanticTick.of(null)],
  });
}

function buildRemappableEditorKeymap(semanticEngine) {
  const g = typeof window !== 'undefined' ? window : self;
  const KB = g.Keybindings;
  if (!KB || typeof KB.buildEditorKeymap !== 'function') {
    return [
      { key: 'Alt-Shift-f', run: formatCommand },
      { key: 'Mod-f', run: openSearchPanel },
      { key: 'Mod-/', run: toggleComment },
      { key: 'F12', run: (view) => goToDefinition(view) },
      { key: 'Shift-F12', run: (view) => findReferences(view) },
      ...holeCycleKeymap(semanticEngine),
      ...editHistoryKeymap(),
      { key: 'F2', run: (view) => startRename(view) },
      { key: 'Mod-a', run: selectAll },
      { key: 'Ctrl-Space', run: toggleEditorAutocomplete },
    ];
  }
  return KB.buildEditorKeymap({
    'edit.undo': (view) => {
      const H = g.EditHistory;
      if (H?.undo()) return true;
      return undo(view);
    },
    'edit.redo': (view) => {
      const H = g.EditHistory;
      if (H?.redo()) return true;
      return redo(view);
    },
    'edit.find': openSearchPanel,
    'edit.toggle-comment': toggleComment,
    'edit.format': formatCommand,
    'edit.rename': (view) => startRename(view),
    'edit.select-all': selectAll,
    'edit.autocomplete': toggleEditorAutocomplete,
    'nav.definition': (view) => goToDefinition(view),
    'nav.references': (view) => findReferences(view),
    'nav.next-hole': (view) => cycleHole(view, semanticEngine, 1),
    'nav.prev-hole': (view) => cycleHole(view, semanticEngine, -1),
  });
}

/** Tab: insert indent at caret; indent lines when something is selected. */
function insertIndentAtCursor(view) {
  if (view.state.readOnly) return false;
  if (view.state.selection.ranges.some((r) => !r.empty)) return indentMore(view);
  const unit = view.state.facet(indentUnit);
  let insert = unit;
  if (unit !== '\t' && unit.length > 0) {
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    const col = head - line.from;
    insert = ' '.repeat(unit.length - (col % unit.length));
  }
  view.dispatch(view.state.update(
    view.state.replaceSelection(insert),
    { scrollIntoView: true, userEvent: 'input' },
  ));
  return true;
}

const indentOrInsertTab = { key: 'Tab', run: insertIndentAtCursor, shift: indentLess };

function baseExtensions(placeholderText, onDocChange, semanticEngine, prefs, bracketKeymapCompartment, remappableKeymapCompartment, selectionCompartment, scrollPastEndCompartment, getOverlayDiags = null) {
  return [
    settlementTickField,
    beluga(),
    aliases(),
    EditorView.clipboardInputFilter.of((text) =>
      text == null || text === '' ? text ?? '' : sanitizePastedPlainText(text)
    ),
    scrollPastEndCompartment.of(scrollPastEndExtensions(prefs)),
    searchPanel(),
    history(),
    selectionCompartment.of(buildSelectionExtensions(prefs)),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    remappableKeymapCompartment.of(
      Prec.high(keymap.of(buildRemappableEditorKeymap(semanticEngine)))
    ),
    keymap.of([
      { key: 'Enter', run: smartEnter },
      { key: 'F3', run: findNext, shift: findPrevious },
      indentOrInsertTab, ...defaultKeymap, ...historyKeymap, ...foldKeymap,
    ]),
    bracketKeymapCompartment.of(keymap.of(buildBracketKeymap(prefs))),
    placeholder(placeholderText),
    editorChrome(),
    gutterTooltipBand(),
    syntaxLinter(),
    hoverTooltip(semanticEngine, getOverlayDiags),
    ...belAutocompletion(semanticEngine),
    flashExtension(),
    rename(),
    contextMenu(),
    inspector(),
    editorFollow(),
    graphLive(),
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

function syntaxLinter() {
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
      ...editHistoryKeymap(),
      ...defaultKeymap, ...historyKeymap,
    ]),
    placeholder(placeholderText),
    editorChrome(),
    EditorView.contentAttributes.of({ class: 'cm-aux-file' }),
    themeCompartment.of(cmThemeExtensions(dark)),
    ...(cfgDocumentId ? [
      cfgLinter(cfgDocumentId),
      ...cfgEditorExtensions(cfgDocumentId),
    ] : []),
    ...(cfgDocumentId ? [editHistoryListener(cfgDocumentId)] : []),
    completionChrome(),
    inspector(),
    editorFollow(),
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
    const api = g.CurrentEditor;
    const v = api && typeof api.getView === 'function' ? api.getView() : null;
    if (v) jumpToNextError(v);
  };
  ideStatusDot._belErrorNavKey = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!navigable()) return;
    e.preventDefault();
    const api = g.CurrentEditor;
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
    const rows = diags.map((d) => {
      const line = view.state.doc.lineAt(Math.min(Math.max(0, d.from), view.state.doc.length));
      return { line: line.number, message: d.message || '', severity: d.severity || 'error' };
    });
    const index = getProjectDiagnostics();
    const cfgName = resolveCfgDocumentPath(documentId);
    index.setActiveLive(documentId, rows, { fileName: cfgName });
    index.setObservation(documentId, rows, {
      fileName: cfgName,
      key: `cfg|${fileContentSig(view.state.doc.toString())}|`,
      source: 'live',
      quiet: true,
    });
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
    getFilePath() { return docPath; },
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
      const P = g.Persist;
      if (!P || !isCfg || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') return [];
      try {
        return listGroupSymbols(P.listFiles(), documentId, (id) => P.getFileText(id));
      } catch (_) {
        return [];
      }
    },
    jumpToNextError() { return jumpToNextError(view); },
    openDependencyGraph(pos) { return openDependencyGraphForView(view, pos); },
    undo() { return runEditHistoryUndo(); },
    redo() { return runEditHistoryRedo(); },
    selectAll() { return selectAll(view); },
    openSearch() { return openSearchPanel(view); },
    toggleComment() { return toggleComment(view); },
  };
}


/** Live check host (check context / suite overlay / file health) lives in editor-check-host. */

export function mount(parentEl, options = {}) {
  if (!parentEl) return null;
  if (typeof options.onDocChange !== 'function') {
    throw new TypeError('BelEditor.mount requires options.onDocChange (function)');
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
  const remappableKeymapCompartment = new Compartment();
  const selectionCompartment = new Compartment();
  const scrollPastEndCompartment = new Compartment();
  const diagCompartment = new Compartment();
  const initialDark = options.dark ?? isDocumentDarkTheme();
  const editorPrefs = readEditorPrefs();

  let semanticView = null;
  let semanticEngine = null;
  let refreshIdeStatusRef = () => {};

  const checkHost = createEditorCheckHost({
    getGlobal: () => g,
    getView: () => semanticView,
    getEngine: () => semanticEngine,
    refreshSettlementLint,
    getRefreshIdeStatus: () => refreshIdeStatusRef,
  });

  const {
    healthyCodeWithPrelude,
    holeActionContext,
    currentScopeKey,
    suiteOverlayDiagnostics,
    bumpSuiteOverlay,
    scheduleDevelopmentCheck,
    scheduleDebouncedDevelopmentCheck,
    publishActiveLiveDiagnostics,
  } = checkHost;

  semanticEngine = createSemanticEngine({
    documentId: options.documentId || 'workspace://main.bel',
    belugaClient: g.BelugaClient,
    getCheckContext: (syntaxSnap) => (syntaxSnap?.doc ? checkHost.buildCheckContext(syntaxSnap.doc) : null),
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
          semanticView.dispatch({ effects: navSemanticTick.of(null) });
        });
      }
    },
    getSettleDelay: checkHost.getSettleDelay,
    onSettlement: checkHost.handleSettlement,
    onSettlementChecking: checkHost.handleSettlementChecking,
  });

  function docFingerprint(text) {
    if (g.BelugaClient && typeof g.BelugaClient.fingerprint === 'function') {
      return g.BelugaClient.fingerprint(text);
    }
    if (typeof g.Persist !== 'undefined' && g.Persist.documentFingerprint) {
      return g.Persist.documentFingerprint(text);
    }
    return '';
  }

  function hydrateSemanticCheckpoint(text) {
    const semantic = options.semanticCheckpoint;
    if (!semantic) return;
    const belugaBuild = typeof g.Persist !== 'undefined'
      ? g.Persist.readStoredBelugaMode()
      : 'stable';
    semanticEngine.importCheckpoint(semantic, {
      docFp: docFingerprint(text),
      belugaBuild,
      scopeKey: currentScopeKey(),
    });
  }

  if (options.persist && typeof options.persist.setCheckpointProviders === 'function') {
    let applyingSaveTransforms = false;
    options.persist.setCheckpointProviders({
      getSemantic: () => semanticEngine.exportCheckpoint(),
      // Lazy live-text provider: persistNow() materializes the doc string at
      // debounced save time, so we never toString() the whole buffer on the
      // input critical path. Optionally format/trim the live doc first.
      getText: () => {
        if (!applyingSaveTransforms && semanticView?.dom?.isConnected) {
          applyingSaveTransforms = true;
          try {
            applySaveTransforms(semanticView, docPath);
          } finally {
            applyingSaveTransforms = false;
          }
        }
        return semanticView?.state?.doc ? semanticView.state.doc.toString() : '';
      },
      getViewport: () => captureViewportLocal(semanticView),
      getDocFp: (text) => docFingerprint(text != null ? text : semanticView?.state.doc.toString() || ''),
      getBelugaBuild: () => (
        typeof g.Persist !== 'undefined' ? g.Persist.readStoredBelugaMode() : 'stable'
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

  let statusSettleWatchTimer = 0;
  let statusSettleWatchAttempts = 0;

  function syntaxNeedsSettlement() {
    const ver = semanticEngine.getSnapshot?.()?.syntax?.version;
    return ver != null
      && typeof semanticEngine.isSettledFor === 'function'
      && !semanticEngine.isSettledFor(ver);
  }

  function clearStatusSettleWatch() {
    if (statusSettleWatchTimer) {
      clearTimeout(statusSettleWatchTimer);
      statusSettleWatchTimer = 0;
    }
    statusSettleWatchAttempts = 0;
  }

  // Keep kicking ensureSettled + status refresh until syntax catches the checker.
  // Without this, a version bump after the last updateListener tick leaves the
  // status dot stuck on "Checking…" forever (idle, no further edits).
  function armStatusSettleWatch(view) {
    if (statusSettleWatchTimer || !view?.dom) return;
    statusSettleWatchTimer = setTimeout(() => {
      statusSettleWatchTimer = 0;
      if (!view.dom?.isConnected) {
        clearStatusSettleWatch();
        return;
      }
      statusSettleWatchAttempts += 1;
      const needs = syntaxNeedsSettlement();
      if (!needs) {
        clearStatusSettleWatch();
        refreshIdeStatus(view);
        return;
      }
      if (!semanticEngine.isSettlementPending?.()) semanticEngine.ensureSettled?.();
      refreshIdeStatus(view);
      if (statusSettleWatchAttempts < 40) armStatusSettleWatch(view);
      else clearStatusSettleWatch();
    }, 120);
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
    const ownDiags = diags.filter((d) => !isSuitePreludeBannerDiag(d));
    const lintItems = lintTooltipItemsFromDiagnostics(ownDiags, view.state.doc);
    updateIdeStatusDot(ideStatusDot, diags, {
      parseCoverage: computeParseCoverage(view.state),
      belugaPending: settling,
      lintItems,
    });
    if (syntaxNeedsSettlement() || settling) armStatusSettleWatch(view);
    else clearStatusSettleWatch();
    publishActiveLiveDiagnostics(view, diags);
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    if (typeof g.dispatchEvent === 'function') {
      const health = getProjectDiagnostics().forFile(g.Persist?.getActiveFileId?.());
      g.dispatchEvent(new CustomEvent('beljar:file-lint', {
        detail: {
          errors: health.errors || 0,
          warnings: health.warnings || 0,
          items: health.items || [],
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
  // The flush runs the full semantic rebuild (walkTree + lint). Under a browser
  // trace it lands INSIDE the keydown handler when forced inline, which is the
  // mid-typing stutter. So: (a) only flush after a genuine pause (a fast-typing
  // burst with sub-IDLE gaps never triggers it), and (b) even at the staleness
  // cap, DEFER off the keyboard handler instead of running inline. Nothing needs
  // the snapshot mid-burst — hover/nav flush on cursor move (selectionSet path).
  const IDLE_SYNC_MS = 120;
  const MAX_SEMANTIC_STALENESS_MS = 1500;

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
    // continuous typing, flush — but DEFER it to just after the frame (not inline
    // in the keydown handler), so a held key / fast burst never pays the rebuild
    // as input latency. It still runs promptly, just off the critical path.
    if (now - semanticSyncFirstQueuedAt >= MAX_SEMANTIC_STALENESS_MS) {
      if (semanticSyncTimer) { clearTimeout(semanticSyncTimer); semanticSyncTimer = 0; }
      if (!semanticSyncRaf) {
        const kick = () => { semanticSyncRaf = 0; flushPendingSemanticSync(); };
        semanticSyncRaf = typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(kick) : setTimeout(kick, 0);
      }
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
          if (v.dom.isConnected) v.dispatch({ effects: navSemanticTick.of(null) });
        });
      }
    }
  });

  const docSyncExt = EditorView.updateListener.of((update) => {
    const H = globalRef().EditHistory;
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
      checkHost.onRenameEnded();
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
    ...baseExtensions(ph, options.onDocChange, semanticEngine, editorPrefs, bracketKeymapCompartment, remappableKeymapCompartment, selectionCompartment, scrollPastEndCompartment, suiteOverlayDiagnostics),
    diagCompartment.of(buildDiagLintExtensions(semanticEngine, editorPrefs, suiteOverlayDiagnostics)),
    docSyncExt,
    treeWatchPlugin,
    themeCompartment.of(cmThemeExtensions(initialDark)),
    chromeCompartment.of(buildEditorChromeTheme(editorPrefs)),
    ideCompartment.of(buildToggleableExtensions(editorPrefs, { semanticEngine })),
  ];
  if (editorPrefs.foldGutter && docId) {
    extensions.push(foldPersistence(docId));
  }
  if (docId) {
    extensions.push(editHistoryListener(docId));
  }

  const initialDoc = prepareEditorDoc(options.doc ?? '', docPath);
  let state = EditorState.create({ doc: initialDoc, extensions });
  globalRef().EditHistory?.markNonUndoable?.();
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
  // global CurrentEditor handle is assigned by app.js.
  view._belSemanticEngine = semanticEngine;
  wireStatusDotErrorNavLocal();
  if (/\.elf$/i.test(docPath)) view.dom.classList.add('bel-editor--elf');

  semanticEngine.setCheckerCode(() => healthyCodeWithPrelude());
  hydrateSemanticCheckpoint(initialDoc);
  syncSemanticFromView(view);
  semanticEngine.ensureSettled?.();
  queueMicrotask(() => {
    if (view.dom?.isConnected) scheduleDevelopmentCheck(view);
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
    view.dispatch({ effects: navSemanticTick.of(null) });
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
        selectionCompartment.reconfigure(buildSelectionExtensions(prefs)),
        scrollPastEndCompartment.reconfigure(scrollPastEndExtensions(prefs)),
        diagCompartment.reconfigure(buildDiagLintExtensions(semanticEngine, prefs, suiteOverlayDiagnostics)),
      ],
    });
    refreshSettlementLint(view);
    const p = typeof window !== 'undefined' ? window.Persist : null;
    if (p?.applyStoredEditorChrome) p.applyStoredEditorChrome();
  };

  function reconfigureRemappableKeymap() {
    if (!view) return;
    view.dispatch({
      effects: remappableKeymapCompartment.reconfigure(
        Prec.high(keymap.of(buildRemappableEditorKeymap(semanticEngine)))
      ),
    });
  }
  if (typeof g.addEventListener === 'function') {
    g.addEventListener('beljar:keybindings-changed', reconfigureRemappableKeymap);
  }

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
    getFilePath() { return docPath; },
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
      const P = g.Persist;
      if (!P || !fileId) return {};
      const files = P.listFiles();
      const activeId = P.getActiveFileId();
      const live = semanticView && activeId === fileId
        ? semanticView.state.doc.toString()
        : null;
      const getText = (id) => (id === activeId && live != null ? live : (P.getFileText(id) || ''));
      const { paths } = developmentMembersForFile(semanticView, fileId);
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
        belugaBuild: typeof g.Persist !== 'undefined'
          ? g.Persist.readStoredBelugaMode()
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
      const P = g.Persist;
      if (!P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') return [];
      // Mount documentId wins — Persist active can lag the open tab.
      const id = options.documentId || docId || P.getActiveFileId();
      try {
        return listGroupSymbols(
          P.listFiles(),
          id,
          (fid) => P.getFileText(fid)
        );
      } catch (_) {
        return [];
      }
    },
    jumpToNextError() { return jumpToNextError(view); },
    jumpToPrevError() { return jumpToPrevError(view); },
    listProblems() { return listDocumentProblems(view); },
    findReferences(pos) { return findReferences(view, pos); },
    rename(pos) { return startRename(view, pos); },
    cancelRename() { return cancelRenameIfActive(view); },
    revealBinder(pos) { return revealBinder(view, pos); },
    revealInInspector(pos) { return revealInInspector(view, pos); },
    foldAll() { return foldAll(view); },
    unfoldAll() { return unfoldAll(view); },
    cycleHole(dir) {
      const eng = semanticEngine;
      if (!eng || typeof eng.getHoles !== 'function') return false;
      const holes = eng.getHoles() || [];
      const offs = [];
      for (const h of holes) {
        if (h && Number.isFinite(h.from)) offs.push(h.from);
      }
      offs.sort((a, b) => a - b);
      if (!offs.length) return false;
      const cur = view.state.selection.main.head;
      const forward = dir >= 0;
      let target;
      if (forward) target = offs.find((o) => o > cur);
      else {
        const before = offs.filter((o) => o < cur);
        target = before[before.length - 1];
      }
      if (target == null) target = forward ? offs[0] : offs[offs.length - 1];
      return jumpToRange(view, { from: target, to: target + 1 });
    },
    holeAtCursor(pos) {
      const at = pos != null ? pos : view.state.selection.main.head;
      return holeAt(semanticEngine, view.state.doc, at);
    },
    runHoleIntro(pos) {
      const hit = this.holeAtCursor(pos);
      if (!hit || !canIntro(hit.hole)) return false;
      return runIntro(view, semanticEngine, hit);
    },
    runHoleSplit(pos) {
      const hit = this.holeAtCursor(pos);
      if (!hit) return false;
      const vars = splitTargetsOf(hit.hole);
      if (!vars.length) return false;
      return runSplit(view, semanticEngine, hit, vars[0]);
    },
    runHoleFill(pos) {
      const hit = this.holeAtCursor(pos);
      if (!hit) return false;
      return runFill(view, semanticEngine, hit);
    },
    openHoleInHarpoon(pos) {
      const hit = this.holeAtCursor(pos);
      if (!hit) return false;
      const lab = g.Harpoon;
      if (!lab || typeof lab.openFromHole !== 'function') return false;
      lab.openFromHole(view, semanticEngine, hit);
      return true;
    },
    // Dependency graph: with a pos → local neighborhood; without → whole-file.
    openDependencyGraph(pos) { return openDependencyGraphForView(view, pos); },

    getHydratePromise() { return Promise.resolve(0); },

    // Tear the editor down for a document switch: halt background semantic
    // work permanently and detach the CodeMirror view from the DOM.
    destroy() {
      cancelRenameIfActive(view);
      if (editorPrefs.foldGutter && docId) flushFoldKeys(view, docId);
      activeEditorPrefsApplier = null;
      activeEditorView = null;
      if (typeof g.removeEventListener === 'function') {
        g.removeEventListener('beljar:keybindings-changed', reconfigureRemappableKeymap);
      }
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
