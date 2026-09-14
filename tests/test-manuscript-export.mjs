import assert from 'node:assert/strict';
import {
  MANUSCRIPT_CSS,
  commentText,
  extractManuscriptParts,
  safeFileStem,
  create as createManuscriptExport,
} from '../js/app/app-manuscript-export.mjs';

// Delimiters come from the language (its CodeMirror `commentTokens`); these are test data.
const PERCENT = { line: '%', block: { open: '%{', close: '}%' } };
const ML = { block: { open: '(*', close: '*)' } };

assert.equal(commentText({ kind: 'line', text: '% A readable sentence' }, PERCENT), 'A readable sentence');
assert.equal(commentText({ kind: 'line', text: '%% Doubled marker' }, PERCENT), 'Doubled marker');
assert.equal(
  commentText({ kind: 'block', text: '%{\n  A block.\n  * With a second line.\n}%\n' }, PERCENT),
  'A block.\nWith a second line.',
);
// Another language's delimiters, with nothing retyped in the exporter.
assert.equal(commentText({ kind: 'block', text: '(* An essay.\n * Second line. *)' }, ML), 'An essay.\nSecond line.');
// Without the language's tokens nothing is stripped: the delimiters really come from the tokens.
assert.equal(commentText({ kind: 'line', text: '% kept' }), '% kept');

{
  const source = '% First.\n% second.\n\nfun x : Nat = z\n';
  const comments = [
    { from: 0, to: 8, kind: 'line', text: '% First.' },
    { from: 9, to: 18, kind: 'line', text: '% second.' },
  ];
  assert.deepEqual(extractManuscriptParts(source, comments, PERCENT), [
    { type: 'prose', text: 'First. second.' },
    { type: 'code', from: 20, to: source.length - 1 },
  ]);
}

{
  const source = 'fun x = z\n% explanation\nfun y = x\n';
  const start = source.indexOf('%');
  const end = source.indexOf('\n', start);
  assert.deepEqual(extractManuscriptParts(source, [{
    from: start,
    to: end,
    kind: 'line',
    text: source.slice(start, end),
  }], PERCENT), [
    { type: 'code', from: 0, to: start - 1 },
    { type: 'prose', text: 'explanation' },
    { type: 'code', from: end + 1, to: source.length - 1 },
  ]);
}

assert.equal(safeFileStem('chapters/intro.bel'), 'intro');
assert.equal(safeFileStem('untitled'), 'untitled');
assert.match(MANUSCRIPT_CSS, /\.manuscript-code/);
assert.match(MANUSCRIPT_CSS, /color-scheme: light/);

function makeEl(tag) {
  const node = {
    tagName: String(tag).toLowerCase(),
    className: '',
    lang: '',
    children: [],
    _text: '',
    appendChild(child) { this.children.push(child); return child; },
    append(...kids) { for (const kid of kids) this.appendChild(kid); },
    set textContent(v) { this._text = v == null ? '' : String(v); this.children = []; },
    get textContent() {
      if (this.children.length) return this.children.map((c) => c.textContent).join('');
      return this._text;
    },
    get outerHTML() {
      const attrs = [];
      if (this.lang) attrs.push(` lang="${this.lang}"`);
      if (this.className) attrs.push(` class="${this.className}"`);
      const inner = this.children.length
        ? this.children.map((c) => c.outerHTML).join('')
        : this._text;
      return `<${this.tagName}${attrs.join('')}>${inner}</${this.tagName}>`;
    },
  };
  return node;
}

function installDom() {
  function makeDoc() {
    const html = makeEl('html');
    const head = makeEl('head');
    const body = makeEl('body');
    html.appendChild(head);
    html.appendChild(body);
    return { documentElement: html, head, body, createElement: makeEl };
  }
  globalThis.document = {
    implementation: { createHTMLDocument: () => makeDoc() },
  };
}

function exportHarness({ editor, persistFile, triggerDownload, persistId = 'f1' } = {}) {
  const toasts = [];
  globalThis.Persist = {
    getActiveFileId: () => persistId,
    getFileById: () => persistFile,
  };
  globalThis.DownloadZip = { triggerDownload: triggerDownload || (() => {}) };
  const api = createManuscriptExport({
    getEditor: () => editor,
    getPersist: () => ({ getCurrentFileId: () => persistId }),
    projectFileText: () => '',
    showToast: (msg, opts) => toasts.push({ msg, opts }),
  });
  api.exportCurrentManuscript();
  return toasts;
}

{
  const toasts = exportHarness({ editor: null, persistFile: null, persistId: null });
  assert.deepEqual(toasts, [{ msg: 'No file is open to export.', opts: { kind: 'warn' } }]);
}

{
  installDom();
  const downloads = [];
  const toasts = exportHarness({
    persistFile: { name: 'intro.bel' },
    editor: {
      getCurrentFileId: () => 'f1',
      getValue: () => 'fun x = z\n',
      getReadingView: () => ({ text: 'fun x = z\n', comments: [], commentTokens: null }),
    },
    triggerDownload: (_blob, name) => downloads.push(name),
  });
  assert.equal(toasts.length, 0);
  assert.deepEqual(downloads, ['intro-manuscript.html']);
}

{
  installDom();
  const toasts = exportHarness({
    persistFile: { name: 'intro.bel' },
    editor: {
      getCurrentFileId: () => 'f1',
      getValue: () => 'fun x = z\n',
      getReadingView: () => ({ text: 'fun x = z\n', comments: [], commentTokens: null }),
    },
    triggerDownload: () => { throw new Error('blocked'); },
  });
  assert.deepEqual(toasts, [{ msg: 'Could not export manuscript.', opts: { kind: 'error' } }]);
}

console.log('OK test-manuscript-export.mjs');
