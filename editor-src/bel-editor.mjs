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
import { linter } from '@codemirror/lint';
import { beluga } from './bel-language.mjs';
import { formatCommand } from './bel-format.mjs';
import { belAliases } from './bel-aliases.mjs';
import { syntaxLint } from './bel-lint.mjs';
import { createBelugaLinter } from './bel-beluga-lint.mjs';
import { updateIdeStatusDot } from './bel-ide-status.mjs';
import { applySyntaxFaultMask, computeLintBlocks } from './bel-units.mjs';
import { belHoverTooltip, LINT_TOOLTIP_FILTER } from './bel-hover.mjs';
import { diagnosticRowHighlight } from './bel-diag-gutter.mjs';
import { createSemanticEngine } from './semantic/semantic-engine.mjs';

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
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'light-dark(rgba(0, 0, 0, 0.03), rgba(255, 255, 255, 0.038))',
      color: 'var(--editor-gutter-fg-active)',
    },
    '.cm-diagRow-warning': {
      backgroundColor: 'light-dark(rgba(217, 119, 6, 0.16), rgba(251, 191, 36, 0.16))',
      color: 'light-dark(rgb(180, 83, 9), rgb(252, 211, 77))',
    },
    '.cm-diagRow-error': {
      backgroundColor: 'light-dark(rgba(220, 38, 38, 0.18), rgba(248, 113, 113, 0.24))',
      color: 'light-dark(rgb(185, 28, 28), rgb(252, 165, 165))',
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
      indentWithTab, ...defaultKeymap, ...historyKeymap,
    ]),
    placeholder(placeholderText),
    belEditorChrome(),
    belSyntaxLinter(),
    belugaLinterExt,
    diagnosticRowHighlight(),
    belHoverTooltip(semanticEngine),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onDocChange(update.state.doc.toString());
    }),
  ];
}

function adaptiveLintDelay(lineCount) {
  if (lineCount < 60) return 200;
  if (lineCount < 200) return 450;
  if (lineCount < 600) return 800;
  return 1100;
}

function lineCountOf(text) {
  return (String(text == null ? '' : text).match(/\n/g) || []).length + 1;
}

function belSyntaxLinter() {
  return linter((view) => syntaxLint(view), { delay: 0, tooltipFilter: LINT_TOOLTIP_FILTER });
}

function mergeLintDiagnostics(syntaxDiags, belugaDiags) {
  const merged = syntaxDiags.slice();
  for (const d of belugaDiags) {
    if (!merged.some((e) => e.from === d.from && e.to === d.to && e.message === d.message)) {
      merged.push(d);
    }
  }
  merged.sort((a, b) => a.from - b.from);
  return merged;
}

export function mount(parentEl, options = {}) {
  if (!parentEl) return null;
  if (typeof options.onDocChange !== 'function') {
    throw new TypeError('BelJarEditor.mount requires options.onDocChange (function)');
  }
  const ph = options.placeholder ?? 'Write Beluga code here...';
  const themeCompartment = new Compartment();
  const ideCompartment = new Compartment();
  const lintDelayCompartment = new Compartment();
  let lintDelay = adaptiveLintDelay(lineCountOf(options.doc));
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
    onTypeObserved: scheduleSemanticTypesSave,
  });

  const SEMANTIC_TYPES_KEY = 'beljar:semantic-types';
  let semanticTypesSaveTimer = null;
  function saveSemanticTypes() {
    semanticTypesSaveTimer = null;
    try {
      const blob = semanticEngine.exportTypes();
      const hasDecls = blob && blob.decls && blob.decls.length;
      const hasMetavars = blob && blob.metavars && blob.metavars.length;
      if (hasDecls || hasMetavars) {
        g.localStorage && g.localStorage.setItem(SEMANTIC_TYPES_KEY, JSON.stringify(blob));
      }
    } catch (_) {}
  }
  function scheduleSemanticTypesSave() {
    if (semanticTypesSaveTimer) clearTimeout(semanticTypesSaveTimer);
    semanticTypesSaveTimer = setTimeout(saveSemanticTypes, 400);
  }
  function hydrateSemanticTypes() {
    try {
      const raw = g.localStorage && g.localStorage.getItem(SEMANTIC_TYPES_KEY);
      if (raw) semanticEngine.importTypes(JSON.parse(raw));
    } catch (_) {}
  }

  const ideStatusDot = typeof document !== 'undefined'
    ? document.getElementById('ide-status-dot')
    : null;

  let lastBelugaLintDiags = [];
  let belugaCheckPending = false;

  function belugaCheckEnabled(view) {
    return !!(g.BelugaClient && typeof g.BelugaClient.check === 'function'
      && view.state.doc.toString().trim());
  }

  function markBelugaCheckPending(view) {
    belugaCheckPending = belugaCheckEnabled(view);
  }

  function refreshIdeStatus(view) {
    updateIdeStatusDot(
      ideStatusDot,
      mergeLintDiagnostics(syntaxLint(view), lastBelugaLintDiags),
      { belugaPending: belugaCheckPending },
    );
  }

  const belugaLinter = createBelugaLinter({
    delay: 0,

    onCheckStart(view) {
      markBelugaCheckPending(view);
      refreshIdeStatus(view);
    },
    onDiagnostics(view, belugaDiags) {
      lastBelugaLintDiags = belugaDiags;
      belugaCheckPending = false;
      refreshIdeStatus(view);
    },
  });

  function updateParseProgress(view) {
    if (!ideStatusDot) return;
    const docLen = view.state.doc.length;
    if (docLen <= 0) {
      ideStatusDot.removeAttribute('data-parsing');
      return;
    }
    const pct = Math.min(100, Math.round((syntaxTree(view.state).length / docLen) * 100));
    if (pct < 100) {
      ideStatusDot.setAttribute('data-parsing', `${pct}%`);
      ideStatusDot.setAttribute('data-tooltip', `Parsing ${pct}%`);
      ideStatusDot.setAttribute('aria-label', `Parsing ${pct}%`);
    } else {
      ideStatusDot.removeAttribute('data-parsing');
    }
  }

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
    updateParseProgress(view);
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
    if (update.docChanged) {
      lastBelugaLintDiags = [];
      markBelugaCheckPending(update.view);
      syncSemanticFromView(update.view);
      semanticEngine.onDocChange(update.changes);
      seedSemanticScheduler(update.view);
      scheduleSemanticTypesSave();
      const wantDelay = adaptiveLintDelay(update.state.doc.lines);
      if (wantDelay !== lintDelay) {
        lintDelay = wantDelay;
        const v = update.view;
        queueMicrotask(() => v.dispatch({
          effects: lintDelayCompartment.reconfigure(linter(null, { delay: wantDelay })),
        }));
      }
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
    lintDelayCompartment.of(linter(null, { delay: lintDelay })),
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

  semanticEngine.setCheckerCode(() => healthySnapshotForView());
  hydrateSemanticTypes();
  markBelugaCheckPending(view);
  syncSemanticFromView(view);
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

  if (typeof window !== 'undefined') {
    const flush = () => {
      if (semanticTypesSaveTimer) {
        clearTimeout(semanticTypesSaveTimer);
        semanticTypesSaveTimer = null;
      }
      saveSemanticTypes();
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
  }

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

    getHydratePromise() { return Promise.resolve(0); },
  };
}
