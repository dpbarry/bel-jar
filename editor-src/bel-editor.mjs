import { Compartment, EditorState, Transaction } from '@codemirror/state';
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
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, ensureSyntaxTree, indentRange, indentUnit, syntaxTree } from '@codemirror/language';
import { diagnosticCount, forEachDiagnostic, linter } from '@codemirror/lint';
import { beluga } from './bel-language.mjs';
import { formatCommand } from './bel-format.mjs';
import { scheduleViewportRestore, viewportCenterLine } from './bel-viewport.mjs';
import { belAliases } from './bel-aliases.mjs';
import { syntaxLint } from './bel-lint.mjs';
import { createBelugaLinter } from './bel-beluga-lint.mjs';
import { computeParseCoverage, updateIdeStatusDot } from './bel-ide-status.mjs';
import { applySyntaxFaultMask, computeLintBlocks } from './bel-units.mjs';
import { belHoverTooltip, LINT_TOOLTIP_FILTER } from './bel-hover.mjs';
import { diagnosticRowHighlight } from './bel-diag-gutter.mjs';
import { createSemanticEngine } from './semantic/semantic-engine.mjs';
import { belNavigation } from './bel-nav.mjs';
import { belRename, startRename } from './bel-rename.mjs';
import { belContextMenu } from './bel-context-menu.mjs';
import { findReferences } from './bel-refs-panel.mjs';
import { flashExtension, goToDefinition, revealInInspector } from './bel-ide-actions.mjs';
import { openLocalGraphWindow, openGlobalGraphWindow } from './bel-graph-view.mjs';
import { belInspector } from './bel-inspector.mjs';

const TAB_SIZE = 2;
const INDENT = '  ';

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
  if (text == null || text === '') return '';
  return String(text)
    .replace(/\uFEFF/g, '')
    .replace(/\0/g, '')
    .replace(/\r\n?|\u0085|\u2028|\u2029/g, '\n')
    .replace(/\p{Zs}/gu, ' ')
    .replace(/[\u200b-\u200d]/g, '');
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
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    keymap.of([
      { key: 'Enter', run: smartEnter },
      { key: 'Mod-Shift-f', run: formatCommand },
      { key: 'F12', run: (view) => goToDefinition(view) },
      { key: 'Shift-F12', run: (view) => findReferences(view) },
      indentWithTab, ...defaultKeymap, ...historyKeymap,
    ]),
    placeholder(placeholderText),
    belEditorChrome(),
    belSyntaxLinter(),
    belugaLinterExt,
    diagnosticRowHighlight(),
    belHoverTooltip(semanticEngine),
    flashExtension(),
    belNavigation(),
    belRename(),
    belContextMenu(),
    belInspector(),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onDocChange(update.state.doc.toString());
    }),
  ];
}

function belSyntaxLinter() {
  // Syntax diagnostics are a synchronous Lezer tree walk — keep them on a small
  // fixed delay so parser-level errors show fast on files of any size, decoupled
  // from the Beluga checker's own adaptive debounce.
  return linter((view) => syntaxLint(view), { delay: 80, tooltipFilter: LINT_TOOLTIP_FILTER });
}

export function mount(parentEl, options = {}) {
  if (!parentEl) return null;
  if (typeof options.onDocChange !== 'function') {
    throw new TypeError('BelJarEditor.mount requires options.onDocChange (function)');
  }
  const ph = options.placeholder ?? 'Write Beluga code here...';
  const themeCompartment = new Compartment();
  const ideCompartment = new Compartment();
  const initialDark = options.dark ?? isDocumentDarkTheme();
  parentEl.replaceChildren();

  const g = typeof window !== 'undefined' ? window : self;
  let semanticView = null;

  function healthySnapshotForView() {
    if (!semanticView) return '';
    const doc = semanticView.state.doc;
    const code = doc.toString();
    const { blocks } = computeLintBlocks(syntaxTree(semanticView.state), doc);
    return applySyntaxFaultMask(code, doc, blocks);
  }

  const semanticEngine = createSemanticEngine({
    documentId: options.documentId || 'workspace://main.bel',
    belugaClient: g.BelugaClient,
    onTypeObserved: () => {
      if (options.persist && typeof options.persist.scheduleCheckpointSave === 'function') {
        options.persist.scheduleCheckpointSave();
      }
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
    });
  }

  const ideStatusDot = typeof document !== 'undefined'
    ? document.getElementById('ide-status-dot')
    : null;

  let belugaCheckPending = false;

  function refreshIdeStatus(view) {
    const diags = [];
    forEachDiagnostic(view.state, (d) => diags.push(d));
    updateIdeStatusDot(ideStatusDot, diags, {
      parseCoverage: computeParseCoverage(view.state),
      belugaPending: belugaCheckPending,
    });
  }

  function collectIdeStatus() {
    const diags = [];
    forEachDiagnostic(view.state, (d) => diags.push(d));
    const parse = computeParseCoverage(view.state);
    const snap = semanticEngine.getSnapshot?.() || null;
    return {
      parse,
      belugaChecking: belugaCheckPending,
      errors: diags.filter((d) => d.severity === 'error').length,
      warnings: diags.filter((d) => d.severity === 'warning').length,
      syntaxVersion: snap?.syntax?.version ?? null,
      symbolCount: snap?.summary?.symbols ?? snap?.symbols?.globalSymbols?.length ?? null,
      dirtyCount: snap?.graph?.dirty?.size ?? snap?.summary?.dirty ?? 0,
    };
  }

  const belugaLinter = createBelugaLinter({
    delay: 400,
    onCheckStart(v) {
      belugaCheckPending = true;
      refreshIdeStatus(v);
    },
    onCheckComplete(v) {
      belugaCheckPending = false;
      refreshIdeStatus(v);
    },
  });

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
      }
    }
  });

  const docSyncExt = EditorView.updateListener.of((update) => {
    // Keep the status dot in lock-step with the rendered diagnostics: whenever
    // the lint set changes (syntax pass, Beluga check landing), refresh it.
    if (diagnosticCount(update.state) !== diagnosticCount(update.startState)) {
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

  const initialDoc = sanitizePastedPlainText(options.doc ?? '');
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

  semanticEngine.setCheckerCode(() => healthySnapshotForView());
  hydrateSemanticCheckpoint(initialDoc);
  syncSemanticFromView(view);
  scheduleViewportRestore(view, options.initialLocal);
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
      const doc = view.state.doc;
      const { blocks } = this.getLintBlocks();
      return applySyntaxFaultMask(doc.toString(), doc, blocks);
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

    // IDE navigation/refactor actions, callable from header menus or scripts.
    goToDefinition(pos) { return goToDefinition(view, pos); },
    findReferences(pos) { return findReferences(view, pos); },
    rename(pos) { return startRename(view, pos); },
    revealInInspector(pos) { return revealInInspector(view, pos); },
    // Dependency graph: with a pos → local neighborhood; without → whole-file.
    openDependencyGraph(pos) {
      return pos == null ? openGlobalGraphWindow(view) : openLocalGraphWindow(view, pos);
    },

    getHydratePromise() { return Promise.resolve(0); },
  };
}
