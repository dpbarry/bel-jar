import { editorTextForIndexing } from '../semantic/project-prelude.mjs';

const KEY = 'beljar-jump-log';

export function jumpLogEnabled() {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  if (g.JumpLog === false) return false;
  if (g.JumpLog === true) return true;
  try {
    const v = localStorage.getItem(KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch (_) { /* ignore */ }
  return false;
}

export function enableJumpLog(on = true) {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  g.JumpLog = !!on;
  g.BelJarJumpLog = g.JumpLog
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.setItem(KEY, '0');
  } catch (_) { /* ignore */ }
  console.warn(`[bel-jar:jump] logging ${on ? 'on' : 'off'}`);
}

function sliceAt(text, from, to) {
  const f = Math.max(0, Math.min(Number(from) || 0, text.length));
  const t = Math.max(f, Math.min(to != null ? Number(to) : f + 1, text.length));
  return {
    from: f,
    to: t,
    token: text.slice(f, t),
    context: text.slice(Math.max(0, f - 28), Math.min(text.length, t + 28)),
  };
}

function lineColAt(text, from) {
  let line = 1;
  let lineStart = 0;
  const pos = Math.max(0, Math.min(Number(from) || 0, text.length));
  for (let i = 0; i < pos; i++) {
    if (text[i] === '\n') {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, col: pos - lineStart + 1 };
}

function fileNameForId(fileId) {
  const P = typeof globalThis !== 'undefined' ? globalThis.Persist : null;
  if (!P || typeof P.listFiles !== 'function') return '';
  const f = P.listFiles().find((x) => x.id === fileId);
  return f ? f.name : '';
}

export function logJumpRequest(detail) {
  if (!jumpLogEnabled()) return;
  const fileId = detail.fileId;
  const from = detail.from;
  const to = detail.to;
  const fileName = fileNameForId(fileId);
  const P = typeof globalThis !== 'undefined' ? globalThis.Persist : null;
  const raw = P && typeof P.getFileText === 'function' ? String(P.getFileText(fileId) ?? '') : '';
  const indexed = editorTextForIndexing(raw, fileName);
  const rawHit = sliceAt(raw, from, to);
  const idxHit = sliceAt(indexed, from, to);

  console.warn('[bel-jar:jump] request', {
    phase: detail.phase || 'openFileAt',
    file: fileName || fileId,
    from, to,
    line: detail.line,
    col: detail.col,
    rawToken: rawHit.token,
    indexedToken: idxHit.token,
    rawAt: lineColAt(raw, from),
    indexedAt: lineColAt(indexed, from),
    rawLen: raw.length,
    indexedLen: indexed.length,
    storedEqualsIndexed: raw === indexed,
  });
}

export function logJumpMount(ctx) {
  if (!jumpLogEnabled()) return;
  const {
    fileName, jumpAt, rawDoc, initialDoc, finalDoc,
    ir0Empty, indentEdits, preFrom, preTo, postFrom, postTo,
  } = ctx;
  const preHit = sliceAt(initialDoc, preFrom, preTo);
  const postHit = sliceAt(finalDoc, postFrom, postTo);

  console.warn('[bel-jar:jump] mount', {
    file: fileName,
    requested: jumpAt,
    indentEmpty: ir0Empty,
    indentEdits,
    preToken: preHit.token,
    postToken: postHit.token,
    preAt: lineColAt(initialDoc, preFrom),
    postAt: lineColAt(finalDoc, postFrom),
    storedEqualsPreIndent: rawDoc === initialDoc,
    tokenChangedByIndent: preHit.token !== postHit.token,
  });
}

export function logJumpResult(view, jumpAt, label = 'result') {
  if (!jumpLogEnabled() || !view) return;
  const doc = view.state.doc.toString();
  const sel = view.state.selection.main;
  const from = sel.from;
  const to = sel.to;
  const expectedFrom = jumpAt && jumpAt.from != null ? jumpAt.from : null;

  console.warn(`[bel-jar:jump] ${label}`, {
    selection: { anchor: sel.anchor, head: sel.head, from, to },
    selected: doc.slice(from, to),
    at: lineColAt(doc, from),
    requestedFrom: expectedFrom,
    selectionMismatch: expectedFrom != null && from !== expectedFrom,
    requestedToken: expectedFrom != null ? sliceAt(doc, expectedFrom, jumpAt.to).token : null,
  });
}

export function logJumpSameFile(view, range, label = 'same-file') {
  if (!jumpLogEnabled() || !view || !range) return;
  const doc = view.state.doc.toString();
  const hit = sliceAt(doc, range.from, range.to);
  console.warn(`[bel-jar:jump] ${label}`, {
    from: range.from,
    to: range.to,
    token: hit.token,
    at: lineColAt(doc, range.from),
    context: hit.context,
  });
  requestAnimationFrame(() => logJumpResult(view, range, `${label} (after)`));
}
