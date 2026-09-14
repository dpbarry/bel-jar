import { isSignaturePath } from '../editor-src/project-paths.mjs';

// ⛔ No CodeMirror or lezer imports here. This module ships in the shell bundles, which carry
// their own copies of those packages: a copy's `syntaxTree()` cannot see the editor bundle's
// tree (it returns an empty one) and its highlighter cannot see the editor's style tags, and
// importing them pulled the whole parser into app.js (239 KB -> 1,005 KB). The editor owns the
// tree, so it hands over comments, comment tokens and highlighting (`getReadingView`).

export const MANUSCRIPT_CSS = `
:root {
  color-scheme: light;
  --paper: #f8f7f3;
  --ink: #252831;
  --muted: #69707d;
  --rule: #d9d9d3;
  --code-bg: #1d2027;
  --code-ink: #e8ebf0;
}
* { box-sizing: border-box; }
html { background: var(--paper); }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, serif;
  font-size: 1.08rem;
  line-height: 1.72;
  text-rendering: optimizeLegibility;
}
.manuscript {
  width: min(100% - 3rem, 46rem);
  margin: 0 auto;
  padding: 5rem 0 6rem;
}
.manuscript-header {
  margin-bottom: 3.25rem;
  padding-bottom: 1.3rem;
  border-bottom: 1px solid var(--rule);
}
.manuscript-kicker {
  margin: 0 0 .7rem;
  color: var(--muted);
  font: 600 .7rem/1.2 Inter, system-ui, sans-serif;
  letter-spacing: .15em;
  text-transform: uppercase;
}
.manuscript-title {
  margin: 0;
  color: #17191f;
  font-size: clamp(2rem, 5vw, 3.1rem);
  font-weight: 500;
  letter-spacing: -.025em;
  line-height: 1.08;
  overflow-wrap: anywhere;
}
.manuscript-prose {
  margin: 0 0 1.25rem;
}
.manuscript-code {
  margin: 1.8rem 0 2rem;
  padding: 1.15rem 1.3rem;
  overflow-x: auto;
  border: 1px solid #303641;
  border-radius: .45rem;
  background: var(--code-bg);
  color: var(--code-ink);
  box-shadow: 0 .45rem 1.5rem rgb(22 26 33 / 10%);
  font: 400 .86rem/1.65 "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
  tab-size: 2;
  white-space: pre;
}
.manuscript-code code { font: inherit; }
.jar-hl-keyword { color: #9bbcff; font-weight: 700; }
.jar-hl-control, .jar-hl-arrow { color: #f4c27b; font-weight: 600; }
.jar-hl-op { color: #8bd7e5; }
.jar-hl-type, .jar-hl-type-def { color: #d4b7ff; }
.jar-hl-type-def, .jar-hl-var-def, .jar-hl-local-def { font-weight: 700; }
.jar-hl-metatype, .jar-hl-meta, .jar-hl-meta-pragma { color: #8ed9df; }
.jar-hl-var { color: #e8ebf0; }
.jar-hl-var-def { color: #a9c9ff; }
.jar-hl-local { color: #d5b6f7; }
.jar-hl-ctor { color: #a9c9ff; }
.jar-hl-number, .jar-hl-atom { color: #f2b184; }
.jar-hl-hole { color: #ff9ca5; font-weight: 700; }
.jar-hl-prop { color: #9bc8ff; }
.jar-hl-punct { color: #aeb6c3; }
.jar-hl-comment { color: #aeb6c3; font-style: italic; }
@media (max-width: 44rem) {
  .manuscript { width: min(100% - 1.5rem, 46rem); padding-top: 2.5rem; }
}
`;

const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normalizeLineComment(text, line) {
  const raw = String(text);
  if (!line) return raw.trim();
  return raw.replace(new RegExp(`^(?:${escapeRegExp(line)})+ ?`), '').trimEnd();
}

function normalizeBlockComment(text, block) {
  let inner = String(text);
  if (block?.open && inner.startsWith(block.open)) inner = inner.slice(block.open.length);
  if (block?.close && inner.trimEnd().endsWith(block.close)) {
    inner = inner.trimEnd().slice(0, -block.close.length);
  }
  inner = inner.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
  const lines = inner.split(/\r?\n/);
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => (line.match(/^\s*/) || [''])[0].length);
  const indent = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(indent).replace(/^\s*\* ?/, '')).join('\n').trim();
}

/**
 * A comment's prose. `tokens` are the language's own delimiters as it declares them to the
 * editor (`commentTokens`: `{ line, block: { open, close } }`), never retyped here, so a
 * language with `(* … *)` comments exports as cleanly as one with `%{ … }%`.
 */
export function commentText(comment, tokens = null) {
  return comment.kind === 'line'
    ? normalizeLineComment(comment.text, tokens?.line)
    : normalizeBlockComment(comment.text, tokens?.block);
}

function isOnlyWhitespace(text) {
  return !String(text).trim();
}

export function extractManuscriptParts(source, comments, tokens = null) {
  const text = String(source ?? '');
  const ordered = (comments || []).slice().sort((a, b) => a.from - b.from);
  const parts = [];
  let cursor = 0;
  let lastComment = null;

  const pushCode = (from, to) => {
    let lo = from;
    let hi = to;
    while (lo < hi && /\s/.test(text[lo])) lo += 1;
    while (hi > lo && /\s/.test(text[hi - 1])) hi -= 1;
    if (hi <= lo) return;
    parts.push({ type: 'code', from: lo, to: hi });
  };

  for (const comment of ordered) {
    if (comment.from < cursor || comment.to <= comment.from) continue;
    const between = text.slice(cursor, comment.from);
    if (!isOnlyWhitespace(between)) pushCode(cursor, comment.from);

    const prose = commentText(comment, tokens);
    const canJoin = lastComment
      && lastComment.kind === 'line'
      && comment.kind === 'line'
      && isOnlyWhitespace(between)
      && !/\r?\n\s*\r?\n/.test(between);
    if (prose) {
      if (canJoin && parts.at(-1)?.type === 'prose') parts.at(-1).text += ` ${prose}`;
      else parts.push({ type: 'prose', text: prose });
    }
    lastComment = comment;
    cursor = comment.to;
  }
  pushCode(cursor, text.length);
  return parts;
}

export function safeFileStem(fileName) {
  const base = String(fileName || 'manuscript').split(/[\\/]/).pop() || 'manuscript';
  return base.replace(/\.[^.]*$/, '') || 'manuscript';
}

function appendProse(article, text) {
  for (const paragraph of String(text).split(/\r?\n\s*\r?\n/)) {
    const value = paragraph.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!value) continue;
    const p = document.createElement('p');
    p.className = 'manuscript-prose';
    p.textContent = value;
    article.appendChild(p);
  }
}

/**
 * `comments`, `tokens` and `highlight(from, to)` come from the editor's reading view; without
 * them the whole file is one plain code panel.
 */
export function buildManuscriptHtml({ source, comments = [], tokens = null, highlight = null, fileName }) {
  const text = String(source ?? '');
  const parts = extractManuscriptParts(text, comments, tokens);
  const title = String(fileName || 'Manuscript');
  const doc = document.implementation.createHTMLDocument(title);
  doc.documentElement.lang = 'en';
  const style = doc.createElement('style');
  style.textContent = MANUSCRIPT_CSS;
  doc.head.appendChild(style);

  const article = doc.createElement('article');
  article.className = 'manuscript';
  const header = doc.createElement('header');
  header.className = 'manuscript-header';
  const kicker = doc.createElement('p');
  kicker.className = 'manuscript-kicker';
  kicker.textContent = 'Manuscript';
  const heading = doc.createElement('h1');
  heading.className = 'manuscript-title';
  heading.textContent = title;
  header.append(kicker, heading);
  article.appendChild(header);

  if (!parts.length && text) parts.push({ type: 'code', from: 0, to: text.length });
  for (const part of parts) {
    if (part.type === 'prose') {
      appendProse(article, part.text);
      continue;
    }
    const pre = doc.createElement('pre');
    pre.className = 'manuscript-code';
    const code = doc.createElement('code');
    if (typeof highlight === 'function') {
      try {
        code.appendChild(highlight(part.from, part.to));
      } catch (_) {
        code.textContent = text.slice(part.from, part.to);
      }
    } else {
      code.textContent = text.slice(part.from, part.to);
    }
    pre.appendChild(code);
    article.appendChild(pre);
  }
  doc.body.appendChild(article);
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

export function create(deps) {
  const getEditor = deps.getEditor;
  const getPersist = deps.getPersist;
  const projectFileText = deps.projectFileText;
  const showToast = deps.showToast;

  function exportCurrentManuscript() {
    const editor = getEditor();
    const persist = getPersist();
    const fileId = editor?.getCurrentFileId?.() || persist?.getCurrentFileId?.() || Persist.getActiveFileId?.();
    const file = fileId ? Persist.getFileById(fileId) : null;
    if (!editor || !file) {
      showToast('No file is open to export.', { kind: 'warn' });
      return;
    }
    try {
      // Only the language's own source files have a syntax tree to read, and the editor owns it.
      const reading = isSignaturePath(file.name) ? (editor.getReadingView?.() || null) : null;
      const source = reading?.text ?? editor.getValue?.() ?? projectFileText(fileId) ?? '';
      const html = buildManuscriptHtml({
        source,
        comments: reading?.comments || [],
        tokens: reading?.commentTokens || null,
        highlight: reading?.highlight || null,
        fileName: file.name,
      });
      const name = `${safeFileStem(file.name)}-manuscript.html`;
      DownloadZip.triggerDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), name);
    } catch (_) {
      showToast('Could not export manuscript.', { kind: 'error' });
    }
  }

  return { exportCurrentManuscript };
}
