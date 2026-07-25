import assert from 'node:assert';
import {
  readEditorPrefs,
  buildToggleableExtensions,
  buildEditorChromeTheme,
} from '../js/editor-src/editor-prefs.mjs';
import { EditorView } from '@codemirror/view';

function withPersist(fn) {
  const prev = globalThis.Persist;
  globalThis.Persist = {
    readStoredEditorFontSize: () => 'lg',
    readStoredEditorLineHeight: () => 'compact',
    readStoredEditorWordWrap: () => true,
    readStoredEditorTabSize: () => 4,
    readStoredEditorFormatWidth: () => 100,
    readStoredEditorReindentPaste: () => false,
    readStoredEditorLineNumbers: () => false,
    readStoredEditorFoldGutter: () => false,
    readStoredEditorActiveLine: () => false,
    readStoredEditorDiagGutter: () => false,
    readStoredEditorHoleGutter: () => false,
    readStoredEditorSyntaxHighlight: () => false,
    readStoredEditorSemanticHighlight: () => false,
    readStoredEditorParseHighlight: () => false,
    readStoredEditorOccurrenceHighlight: () => false,
    readStoredEditorBracketMatch: () => false,
    readStoredEditorAutoCloseBrackets: () => false,
    readStoredEditorSelectionMatches: () => false,
  };
  try {
    fn();
  } finally {
    globalThis.Persist = prev;
  }
}

withPersist(() => {
  const prefs = readEditorPrefs();
  assert.equal(prefs.fontSize, 'lg');
  assert.equal(prefs.tabSize, 4);
  assert.equal(prefs.wordWrap, true);
  assert.equal(prefs.syntaxHighlight, false);
});

withPersist(() => {
  const prefs = readEditorPrefs();
  const theme = buildEditorChromeTheme(prefs);
  assert.ok(theme);
  const rules = theme.inner?.value?.rules;
  assert.ok(Array.isArray(rules) && rules.some((r) => /var\(--ui-font-scale/.test(r)));
  const exts = buildToggleableExtensions(prefs, { semanticEngine: null });
  assert.ok(Array.isArray(exts));
  assert.ok(exts.length >= 2);
  const hasWrap = exts.some((e) => e === EditorView.lineWrapping);
  assert.equal(hasWrap, true);
});

console.log('OK editor prefs');
