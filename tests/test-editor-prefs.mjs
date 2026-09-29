import assert from 'node:assert';
import {
  readEditorPrefs,
  buildToggleableExtensions,
  buildEditorChromeTheme,
} from '../js/editor-src/editor-prefs.mjs';
import { EditorView } from '@codemirror/view';
import { withSettings } from './_settings.mjs';

function withPersist(fn) {
  return withSettings({
    editorFontSize: 'lg',
    editorLineHeight: 'compact',
    editorWordWrap: true,
    editorTabSize: 4,
    editorFormatWidth: 100,
    editorReindentPaste: false,
    editorLineNumbers: false,
    editorFoldGutter: false,
    editorActiveLine: false,
    diagPresentation: 'underlines',
    editorHoleGutter: false,
    editorSyntaxHighlight: false,
    editorSemanticHighlight: false,
    editorParseHighlight: false,
    editorOccurrenceHighlight: false,
    editorBracketMatch: false,
    editorAutoCloseBrackets: false,
    editorSelectionMatches: false,
    editorCursorBlink: 'off',
    editorScrollPastEnd: false,
    editorWhitespace: 'trailing',
    editorRulers: true,
    editorFontFamily: 'system',
    editorHoleEmphasis: 'subtle',
  }, fn);
}

withPersist(() => {
  const prefs = readEditorPrefs();
  assert.equal(prefs.fontSize, 'lg');
  assert.equal(prefs.tabSize, 4);
  assert.equal(prefs.wordWrap, true);
  assert.equal(prefs.syntaxHighlight, false);
  assert.equal(prefs.diagGutter, false, 'underlines-only diagnostics hide the gutter');
});

{
  const prefs = readEditorPrefs();
  assert.equal(prefs.fontSize, 'md', 'no Settings on the page: every default comes from the table');
  assert.equal(prefs.tabSize, 2);
  assert.equal(prefs.diagGutter, true);
}

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
