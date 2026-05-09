import { EditorState } from '@codemirror/state';
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
  scrollPastEnd,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentUnit, syntaxTree } from '@codemirror/language';
import { beluga } from './bel-language.mjs';

// indentUnit = one indent step; tabSize = column width for tab stops (keep aligned).
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
  'StratifiedBody',
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
        alignItems: 'stretch !important',
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
      },
      '.cm-lineNumbers .cm-gutterElement': {
        padding: '0 0.4rem 0 0.5rem',
        minWidth: '2.5rem',
        textAlign: 'right',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'light-dark(rgba(0, 0, 0, 0.03), rgba(255, 255, 255, 0.038))',
        color: 'var(--editor-gutter-fg-active)',
      },
      '.cm-content': {
        caretColor: 'var(--accent-high)',
        paddingTop: '0',
        paddingBottom: 'var(--pad-block)',
        flexGrow: 2,
        flexShrink: 0,
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

function baseExtensions(placeholderText, onDocChange) {
  return [
    beluga(),
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    bracketMatching(),
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    scrollPastEnd(),
    EditorView.lineWrapping,
    indentUnit.of(INDENT),
    EditorState.tabSize.of(TAB_SIZE),
    keymap.of([{ key: 'Enter', run: smartEnter }, indentWithTab, ...defaultKeymap, ...historyKeymap]),
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

  const view = new EditorView({
    parent: parentEl,
    state: EditorState.create({ doc: options.doc ?? '', extensions }),
  });

  return {
    getValue() {
      return view.state.doc.toString();
    },
    setValue(text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
    },
    focus() {
      view.focus();
    },
    insertTop(text) {
      view.dispatch({ changes: { from: 0, to: 0, insert: text + '\n\n' } });
      view.focus();
    },
    insertBottom(text) {
      const cur = view.state.doc.toString();
      const prefix = cur ? cur.replace(/\s*$/, '') + '\n\n' : '';
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: prefix + text },
      });
      view.focus();
    },
    getView() {
      return view;
    },
  };
}
