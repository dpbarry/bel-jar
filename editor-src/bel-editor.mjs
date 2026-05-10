import { EditorState, Transaction } from '@codemirror/state';
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
import { bracketMatching, indentRange, indentUnit, syntaxTree } from '@codemirror/language';
import { beluga } from './bel-language.mjs';
import { formatCommand } from './bel-format.mjs';
import { belAliases } from './bel-aliases.mjs';

const TAB_SIZE = 2;
const INDENT = '  ';

// --- LF datatype / inductive `|` continuation contexts for smart Enter ---

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

// --- Clipboard / bulk indent ---

function smartEnter(view) {
  for (const rule of smartEnterRules) {
    if (rule(view)) return true;
  }
  return false;
}

/** Plain-text hygiene only; indentation comes from CM `indentRange` + Beluga grammar. */
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

// --- Viewport padding so the caret can scroll comfortably past the last line ---

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

// --- Theme tokens (pair with css/style.css `.editor-cm-host`) ---

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

// --- Extension bundle ---

function baseExtensions(placeholderText, onDocChange) {
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
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onDocChange(update.state.doc.toString());
    }),
  ];
}

export function mount(parentEl, options = {}) {
  if (!parentEl) return null;
  if (typeof options.onDocChange !== 'function') {
    throw new TypeError('BelJarEditor.mount requires options.onDocChange (function)');
  }
  const ph = options.placeholder ?? 'Write Beluga code here...';
  parentEl.replaceChildren();
  const extensions = baseExtensions(ph, options.onDocChange);

  const initialDoc = sanitizePastedPlainText(options.doc ?? '');
  let state = EditorState.create({ doc: initialDoc, extensions });
  const ir0 = indentRange(state, 0, state.doc.length);
  if (!ir0.empty) state = state.update({ changes: ir0 }).state;

  const view = new EditorView({
    parent: parentEl,
    state,
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
    format() {
      return formatCommand(view);
    },
  };
}
