import { Compartment, EditorState, StateEffect, StateField, Transaction } from '@codemirror/state';
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
import { openSearchPanel, findNext, findPrevious, highlightSelectionMatches } from '@codemirror/search';
import { belSearch } from './bel-search-panel.mjs';
import { bracketMatching, ensureSyntaxTree, foldGutter, foldKeymap, indentRange, indentUnit, syntaxTree } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { diagnosticCount, forceLinting, forEachDiagnostic, linter } from '@codemirror/lint';
import { beluga, belCodeFolding } from './bel-language.mjs';
import { formatCommand } from './bel-format.mjs';
import {
  scheduleJumpToRange, scheduleViewportRestore, viewportCenterLine,
  resolveJumpRange,
} from './bel-viewport.mjs';
import { belAliases, maybeExpandBelAliases } from './bel-aliases.mjs';

export { expandBelAliases, maybeExpandBelAliases, readAliasActivationMode } from './bel-aliases.mjs';
export {
  enableJumpLog, jumpLogEnabled, logJumpMount, logJumpRequest, logJumpResult,
} from './bel-jump-log.mjs';
export { prepareEditorDoc, sanitizeEditorText } from './editor-doc-prep.mjs';
import { syntaxLint } from './bel-lint.mjs';
import { createBelugaLinter } from './bel-beluga-lint.mjs';
import { cfgLinter, cfgDiagnostics } from './bel-cfg-lint.mjs';
import { cfgEditorExtensions, countCfgEntries, goToCfgEntry } from './bel-cfg-editor.mjs';
import { computeParseCoverage, updateAuxStatusDot, updateIdeStatusDot } from './bel-ide-status.mjs';
import { lintLinterOptions, lintPresentation } from './bel-lint-presentation.mjs';
import { checkerSnapshot } from './checker-snapshot.mjs';
import { computeLintBlocks } from './bel-units.mjs';
import { belHoverTooltip } from './bel-hover.mjs';
import { diagnosticRowHighlight } from './bel-diag-gutter.mjs';
import { createSemanticEngine } from './semantic/semantic-engine.mjs';
import { assembleCheckerCode, buildPrelude, listGroupSymbols } from './project-prelude.mjs';
import { developmentForFile } from './development.mjs';
import { belNavigation, belNavSemanticTick } from './bel-nav.mjs';
import { belRename, startRename } from './bel-rename.mjs';
import { belContextMenu } from './bel-context-menu.mjs';
import { findReferences } from './bel-refs-panel.mjs';
import {
  flashExtension, goToDefinition, jumpToRange, jumpToReference, jumpToNextError, revealInInspector,
  peekRange,
} from './bel-ide-actions.mjs';
import { openLocalGraphWindow, openGlobalGraphWindow } from './bel-graph-view.mjs';
import { belInspector } from './bel-inspector.mjs';
import { belEditorFollow } from './bel-follow-sync.mjs';
import { prepareEditorDoc, sanitizeEditorText } from './editor-doc-prep.mjs';

const TAB_SIZE = 2;
const INDENT = '  ';

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
      fontSize: '0.8125rem',
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
      lineHeight: '1.65',
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
    '.cm-diagRow-warning': {
      backgroundColor: 'light-dark(rgba(217, 119, 6, 0.16), rgba(251, 191, 36, 0.16))',
      color: 'light-dark(rgb(180, 83, 9), rgb(252, 211, 77))',
      transition: 'background-color 80ms ease-out, color 80ms ease-out',
    },
    '.cm-diagRow-error': {
      backgroundColor: 'light-dark(rgba(220, 38, 38, 0.18), rgba(248, 113, 113, 0.24))',
      color: 'light-dark(rgb(185, 28, 28), rgb(252, 165, 165))',
      transition: 'background-color 80ms ease-out, color 80ms ease-out',
    },
    '.cm-content': {
      caretColor: 'var(--accent-high)',
      paddingTop: '0',
      paddingBottom: 'var(--pad-block)',
    },
    '.cm-line': {
      paddingLeft: '6px',
      paddingRight: 'var(--pad-editor-x)',
      whiteSpace: 'pre',
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

function cmThemeExtensions(dark) {
  return dark ? [EditorView.darkTheme.of(true)] : [];
}

function baseExtensions(placeholderText, onDocChange, semanticEngine, belugaLinterExt) {
  return [
    settlementTickField,
    indentUnit.of(INDENT),
    EditorState.tabSize.of(TAB_SIZE),
    beluga(),
    belAliases(),
    EditorView.clipboardInputFilter.of((text) =>
      text == null || text === '' ? text ?? '' : sanitizePastedPlainText(text)
    ),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const indentTrigger = update.transactions.some((tr) => {
        const ue = tr.annotation(Transaction.userEvent);
        return ue === 'input.paste' || ue === 'input.drop' || ue === 'move.drop';
      });
      if (!indentTrigger) return;
      queueMicrotask(() => reindentWholeDocument(update.view));
    }),
    ...safeScrollPastEnd(),
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    bracketMatching(),
    closeBrackets(),
    belCodeFolding(),
    foldGutter({
      markerDOM(open) {
        const el = document.createElement('span');
        el.className = 'cm-bel-foldmarker' + (open ? ' is-open' : ' is-folded');
        el.innerHTML = open
          ? '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6.5 4 4 4-4"/></svg>'
          : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4.5 4 4-4 4"/></svg>';
        return el;
      },
    }),
    belSearch(),
    highlightSelectionMatches({ minSelectionLength: 2 }),
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
      ...closeBracketsKeymap, indentWithTab, ...defaultKeymap, ...historyKeymap, ...foldKeymap,
    ]),
    placeholder(placeholderText),
    belEditorChrome(),
    ...lintPresentation(),
    belSyntaxLinter(),
    belugaLinterExt,
    diagnosticRowHighlight(),
    belHoverTooltip(semanticEngine),
    flashExtension(),
    belNavigation(),
    belRename(),
    belContextMenu(),
    belInspector(),
    belEditorFollow(),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onDocChange(update.state.doc.toString());
    }),
  ];
}

function belSyntaxLinter() {
  // Syntax diagnostics are a synchronous Lezer tree walk — keep them on a small
  // fixed delay so parser-level errors show fast on files of any size, decoupled
  // from the Beluga checker's own adaptive debounce.
  return linter((view) => syntaxLint(view), lintLinterOptions({ delay: 80 }));
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
      ...defaultKeymap, ...historyKeymap,
    ]),
    placeholder(placeholderText),
    belEditorChrome(),
    ...lintPresentation(),
    EditorView.contentAttributes.of({ class: 'cm-aux-file' }),
    themeCompartment.of(cmThemeExtensions(dark)),
    ...(cfgDocumentId ? [
      cfgLinter(cfgDocumentId),
      ...cfgEditorExtensions(cfgDocumentId),
    ] : []),
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
  ideStatusDot._belErrorNavClick = () => {
    if (ideStatusDot.getAttribute('data-live-state') !== 'error') return;
    const api = g.BelJarCurrentEditor;
    const v = api && typeof api.getView === 'function' ? api.getView() : null;
    if (v) jumpToNextError(v);
  };
  ideStatusDot._belErrorNavKey = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (ideStatusDot.getAttribute('data-live-state') !== 'error') return;
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
      EditorView.updateListener.of((update) => {
        if (diagnosticCount(update.state) !== diagnosticCount(update.startState)) {
          refreshStatusDot();
        }
      }),
    ],
  });
  const view = new EditorView({ parent: parentEl, state });
  view.dom.classList.add('bel-editor--aux', 'bel-editor--cfg');

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
  function refreshStatusDot() {
    const { diags, fileCount } = cfgStatus();
    updateAuxStatusDot(ideStatusDot, diags, { fileCount });
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    if (typeof g.dispatchEvent === 'function') {
      const { errors, warnings } = cfgStatus();
      g.dispatchEvent(new CustomEvent('beljar:file-lint', {
        detail: { errors, warnings },
      }));
    }
  }
  refreshStatusDot();
  if (isCfg) queueMicrotask(() => forceLinting(view));

  return {
    getIdeStatus: () => {
      const { errors, warnings } = cfgStatus();
      return { errors, warnings };
    },
    getValue: () => view.state.doc.toString(),
    setValue(text) {
      const doc = sanitizePastedPlainText(text ?? '');
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
    },
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
    destroy() { view.destroy(); },
    refreshLint() {
      if (isCfg) forceLinting(view);
      refreshStatusDot();
    },
    goToDefinition(pos) { return isCfg ? goToCfgEntry(view, documentId, pos) : false; },
    jumpToNextError() { return jumpToNextError(view); },
  };
}

export function mount(parentEl, options = {}) {
  if (!parentEl) return null;
  if (typeof options.onDocChange !== 'function') {
    throw new TypeError('BelJarEditor.mount requires options.onDocChange (function)');
  }
  const g = typeof window !== 'undefined' ? window : self;
  const docId = options.documentId || '';
  const docPath = String(docId).replace(/^workspace:\/\//, '');
  const isCfgFile = /\.cfg$/i.test(docPath);
  parentEl.replaceChildren();
  if (isCfgFile) return mountAuxEditor(parentEl, options, docId, docPath);

  const ph = options.placeholder ?? 'Write Beluga code here...';
  const themeCompartment = new Compartment();
  const ideCompartment = new Compartment();
  const initialDark = options.dark ?? isDocumentDarkTheme();

  let semanticView = null;

  function healthySnapshotForView() {
    if (!semanticView) return '';
    const doc = semanticView.state.doc;
    return checkerSnapshot(syntaxTree(semanticView.state), doc).code;
  }

  function buildCheckContext(doc) {
    if (!g.BelJarPersist || !doc) return null;
    const files = g.BelJarPersist.listFiles();
    const activeId = g.BelJarPersist.getActiveFileId();
    const prelude = buildPrelude(files, activeId, (id) => {
      if (id === activeId) return doc.toString();
      return g.BelJarPersist.getFileText(id);
    });
    const fileCode = semanticView
      ? checkerSnapshot(syntaxTree(semanticView.state), doc).code
      : doc.toString();
    return { doc, prelude, fileCode };
  }

  function healthyCodeWithPrelude() {
    if (!semanticView) return '';
    const ctx = buildCheckContext(semanticView.state.doc);
    return ctx ? assembleCheckerCode(ctx.fileCode, ctx.prelude).code : healthySnapshotForView();
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

  const semanticEngine = createSemanticEngine({
    documentId: options.documentId || 'workspace://main.bel',
    belugaClient: g.BelugaClient,
    getCheckContext: (syntaxSnap) => (syntaxSnap?.doc ? buildCheckContext(syntaxSnap.doc) : null),
    getScopeKey: currentScopeKey,
    onTypeObserved: () => {
      if (options.persist && typeof options.persist.scheduleCheckpointSave === 'function') {
        options.persist.scheduleCheckpointSave();
      }
    },
    onSettlement: () => {
      if (semanticView) {
        queueMicrotask(() => {
          if (!semanticView.dom.isConnected) return;
          semanticView.dispatch({
            effects: [settlementUpdated.of(null), belNavSemanticTick.of(null)],
          });
          forceLinting(semanticView);
        });
      }
    },
    onSettlementChecking: () => {
      if (semanticView) refreshIdeStatusRef(semanticView);
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
      getViewport: () => {
        if (!semanticView) return {};
        const sel = semanticView.state.selection.main;
        return {
          selection: { anchor: sel.anchor, head: sel.head },
          centerLine: viewportCenterLine(semanticView),
        };
      },
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

  function refreshIdeStatus(view) {
    const diags = [];
    forEachDiagnostic(view.state, (d) => diags.push(d));
    const settling = semanticEngine.settleState?.() === 'checking';
    updateIdeStatusDot(ideStatusDot, diags, {
      parseCoverage: computeParseCoverage(view.state),
      belugaPending: settling,
    });
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    if (typeof g.dispatchEvent === 'function') {
      g.dispatchEvent(new CustomEvent('beljar:file-lint', {
        detail: {
          errors: diags.filter((d) => d.severity === 'error').length,
          warnings: diags.filter((d) => d.severity === 'warning').length,
        },
      }));
    }
  }

  function collectIdeStatus() {
    const diags = [];
    forEachDiagnostic(view.state, (d) => diags.push(d));
    const parse = computeParseCoverage(view.state);
    const snap = semanticEngine.getSnapshot?.() || null;
    return {
      parse,
      belugaChecking: semanticEngine.settleState?.() === 'checking',
      errors: diags.filter((d) => d.severity === 'error').length,
      warnings: diags.filter((d) => d.severity === 'warning').length,
      syntaxVersion: snap?.syntax?.version ?? null,
      symbolCount: snap?.summary?.symbols ?? snap?.symbols?.globalSymbols?.length ?? null,
      dirtyCount: snap?.graph?.dirty?.size ?? snap?.summary?.dirty ?? 0,
    };
  }

  const belugaLinter = createBelugaLinter({
    getEngine: () => semanticEngine,
    settlementTickField,
    delay: 400,
  });

  refreshIdeStatusRef = refreshIdeStatus;

  function seedSemanticScheduler(view) {
    const sched = semanticEngine.scheduler;
    if (!sched) return;
    sched.onCursorMove(view.state.selection.main.head);
    const vr = view.visibleRanges[0];
    if (vr) sched.onViewportChange({ from: vr.from, to: vr.to });
    sched.seedFromFrontier();
  }

  function syncSemanticFromView(view) {
    const tree = syntaxTree(view.state);
    semanticEngine.update(tree, view.state.doc, {
      cursorPos: view.state.selection.main.head,
      visibleRanges: view.visibleRanges,
    });
    refreshIdeStatus(view);
  }

  const treeWatchPlugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.treeLength = syntaxTree(view.state).length;
      this.parseMilestone = 0;
    }
    update(update) {
      const newLen = syntaxTree(update.state).length;
      const docLen = update.state.doc.length;
      const pct = docLen ? Math.floor((newLen / docLen) * 100) : 100;
      const milestone = pct >= 100 ? 100 : Math.floor(pct / 25) * 25;
      if (newLen > this.treeLength || milestone > this.parseMilestone) {
        this.treeLength = newLen;
        this.parseMilestone = milestone;
        syncSemanticFromView(update.view);
        seedSemanticScheduler(update.view);
        const v = update.view;
        queueMicrotask(() => {
          if (v.dom.isConnected) v.dispatch({ effects: belNavSemanticTick.of(null) });
        });
      }
    }
  });

  const docSyncExt = EditorView.updateListener.of((update) => {
    // Keep the status dot in lock-step with the rendered diagnostics: whenever
    // the lint set changes (syntax pass, Beluga check landing), refresh it.
    const settlementTicked = update.transactions.some((tr) =>
      tr.effects.some((e) => e.is(settlementUpdated)));
    if (settlementTicked
      || diagnosticCount(update.state) !== diagnosticCount(update.startState)) {
      refreshIdeStatus(update.view);
    }
    if (update.docChanged) {
      syncSemanticFromView(update.view);
      semanticEngine.onDocChange(update.changes);
      seedSemanticScheduler(update.view);
      if (options.persist) options.persist.scheduleCheckpointSave();
    }
    if (update.selectionSet || update.viewportChanged) {
      if (options.persist) options.persist.scheduleCheckpointSave();
    }
    if (update.selectionSet) {
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
    ...baseExtensions(ph, options.onDocChange, semanticEngine, belugaLinter),
    docSyncExt,
    treeWatchPlugin,
    themeCompartment.of(cmThemeExtensions(initialDark)),
    ideCompartment.of([]),
  ];

  const initialDoc = prepareEditorDoc(options.doc ?? '', docPath);
  let state = EditorState.create({ doc: initialDoc, extensions });
  const ir0 = indentRange(state, 0, state.doc.length);
  if (!ir0.empty) state = state.update({ changes: ir0 }).state;

  const view = new EditorView({
    parent: parentEl,
    state,
  });
  semanticView = view;
  // Let the IDE action layer reach the engine straight off the view, before the
  // global BelJarCurrentEditor handle is assigned by app.js.
  view._belSemanticEngine = semanticEngine;
  wireStatusDotErrorNavLocal();
  if (/\.elf$/i.test(docPath)) view.dom.classList.add('bel-editor--elf');

  semanticEngine.setCheckerCode(() => healthyCodeWithPrelude());
  hydrateSemanticCheckpoint(initialDoc);
  syncSemanticFromView(view);
  if (!options.jumpAt) scheduleViewportRestore(view, options.initialLocal);
  seedSemanticScheduler(view);
  if (semanticEngine.scheduler && semanticEngine.scheduler.startBackground) {
    semanticEngine.scheduler.startBackground();
  }

  const scheduleIdle = typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (fn) => setTimeout(fn, 1);
  scheduleIdle(() => {
    ensureSyntaxTree(view.state, view.state.doc.length, 5000);
    syncSemanticFromView(view);
    seedSemanticScheduler(view);
    view.dispatch({ effects: belNavSemanticTick.of(null) });
  });

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

  return {
    getValue() {
      return view.state.doc.toString();
    },
    setValue(text) {
      const doc = sanitizePastedPlainText(text ?? '');
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
      queueMicrotask(() => reindentWholeDocument(view));
    },
    focus() {
      view.focus();
    },
    insertTop(text) {
      const block = sanitizePastedPlainText(text ?? '') + '\n\n';
      view.dispatch({ changes: { from: 0, to: 0, insert: block } });
      queueMicrotask(() => {
        reindentWholeDocument(view);
        view.focus();
      });
    },
    insertBottom(text) {
      const cur = view.state.doc.toString();
      const prefix = cur ? cur.replace(/\s*$/, '') + '\n\n' : '';
      const block = sanitizePastedPlainText(text ?? '');
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: prefix + block },
      });
      queueMicrotask(() => {
        reindentWholeDocument(view);
        view.focus();
      });
    },
    insertAtSelection(text) {
      view.dispatch(view.state.replaceSelection(sanitizePastedPlainText(text ?? '')), {
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
    setDarkTheme(dark) {
      view.dispatch({ effects: themeCompartment.reconfigure(cmThemeExtensions(!!dark)) });
    },

    getSemanticEngine() { return semanticEngine; },
    getParseCoverage() { return computeParseCoverage(view.state); },
    getIdeStatus() { return collectIdeStatus(); },

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
      semanticView.dispatch({
        effects: [settlementUpdated.of(null), belNavSemanticTick.of(null)],
      });
      forceLinting(semanticView);
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
      const sel = view.state.selection.main;
      return {
        selection: { anchor: sel.anchor, head: sel.head },
        centerLine: viewportCenterLine(view),
      };
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
    revealInInspector(pos) { return revealInInspector(view, pos); },
    // Dependency graph: with a pos → local neighborhood; without → whole-file.
    openDependencyGraph(pos) {
      return pos == null ? openGlobalGraphWindow(view) : openLocalGraphWindow(view, pos);
    },

    getHydratePromise() { return Promise.resolve(0); },

    // Tear the editor down for a document switch: halt background semantic
    // work permanently and detach the CodeMirror view from the DOM.
    destroy() {
      if (semanticEngine.scheduler && semanticEngine.scheduler.stop) {
        semanticEngine.scheduler.stop();
      }
      view.destroy();
    },

    // Edit-menu commands — these work even when the editor isn't focused.
    undo() { return undo(view); },
    redo() { return redo(view); },
    selectAll() { return selectAll(view); },
    openSearch() { return openSearchPanel(view); },
    toggleComment() { return toggleComment(view); },
  };
}
