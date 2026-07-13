import { syntaxTree } from '@codemirror/language';
import { EditorSelection } from '@codemirror/state';
import { render } from './format/doc.mjs';
import { makePrinter } from './format/printer.mjs';
import { childrenArr } from './format/tree.mjs';
import { GAP_PRAGMA_LINE, TOP_LEVEL_PRAGMA_INNER } from './bel-units.mjs';
import {
  captureFormatViewportAnchor,
  resolveFormatViewportAnchor,
  scheduleScrollToCenter,
} from './bel-viewport.mjs';
import { dispatchEdit } from './bel-edit-history.mjs';

function showFormatToast(message, kind) {
  const T = typeof window !== 'undefined' ? window.BelJarToasts : null;
  if (!T) return;
  if (kind === 'error' && T.error) T.error(message);
  else if (kind === 'warn' && T.warn) T.warn(message);
  else if (T.show) T.show(message, { kind: kind || 'warn' });
}

function normalizeNewlines(s) {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function significantLen(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') n++;
  }
  return n;
}

function sameSourceLine(src, posA, posB) {
  if (posA < 0 || posB < 0) return false;
  return src.lastIndexOf('\n', posA) === src.lastIndexOf('\n', posB);
}

function normalizeSameLinePragmaGap(src, gap, gapStart, gapEnd) {
  const g = normalizeNewlines(gap);
  if (g.includes('\n')) return g;
  if (gapEnd <= gapStart) {
    if (gapStart > 0 && src.slice(gapEnd, gapEnd + 2) === '--' && sameSourceLine(src, gapStart - 1, gapEnd) && src[gapStart - 1] === '.') {
      return ' ';
    }
    return g;
  }
  if (!sameSourceLine(src, gapStart, gapEnd - 1)) return g;
  if (gapStart > 0 && src[gapStart - 1] === '.' && src.slice(gapEnd, gapEnd + 2) === '--') {
    if (g.trim() === '') return ' ';
  }
  return g;
}

function subtreeHasError(node) {
  const lo = node.from;
  const hi = node.to;
  let bad = false;
  node.cursor().iterate((n) => {
    if (n.type.isError && n.from >= lo && n.to <= hi) bad = true;
  });
  return bad;
}

function subtreeHasNonRecoveryError(node) {
  const lo = node.from;
  const hi = node.to;
  let bad = false;
  node.cursor().iterate((n) => {
    if (!(n.type.isError && n.from >= lo && n.to <= hi)) return;
    if (n.name === '⚠' && n.from === n.to) return;
    bad = true;
  });
  return bad;
}

function declarationUsesPercentBlockMacro(src, node) {
  const slice = src.slice(node.from, node.to);
  return slice.includes('%{{') || slice.includes('}}%');
}


function proseBlockGap(gap) {
  return gap.includes('%{{') || gap.includes('}}%');
}

function findProseBlocks(src) {
  const blocks = [];
  let i = 0;
  while (i < src.length) {
    const start = src.indexOf('%{{', i);
    if (start < 0) break;
    const end = src.indexOf('}}%', start);
    if (end < 0) break;
    blocks.push([start, end + 3]);
    i = end + 3;
  }
  return blocks;
}

function proseBlockContaining(pos, blocks) {
  for (const [a, b] of blocks) {
    if (pos >= a && pos < b) return [a, b];
  }
  return null;
}

function normalizeGapTrailingPragmas(gap) {
  if (!gap) return gap;
  const lines = gap.split('\n');
  let i = lines.length - 1;
  while (i >= 0) {
    const line = lines[i];
    if (line.trim() === '') {
      i--;
      continue;
    }
    if (GAP_PRAGMA_LINE.test(line)) {
      i--;
      continue;
    }
    break;
  }
  const start = i + 1;
  for (let k = start; k < lines.length; k++) {
    const L = lines[k];
    if (L.trim() === '') {
      lines[k] = '';
      continue;
    }
    if (GAP_PRAGMA_LINE.test(L)) lines[k] = L.trimStart();
  }
  return lines.join('\n');
}

function declarationHasRiskyDoubleDash(src, node) {
  if (TOP_LEVEL_PRAGMA_INNER.has(node.name)) return false;
  const slice = src.slice(node.from, node.to);
  for (const line of slice.split('\n')) {
    const t = line.trimStart();
    if (t.startsWith('--')) return true;
  }
  return false;
}

function isRecoverAbbrevNoise(inner, src) {
  if (inner.name !== 'AbbrevPragma') return false;
  if (!subtreeHasError(inner)) return false;
  const head = src.slice(inner.from, inner.to).trimStart();
  return !head.startsWith('--abbrev');
}

function errorProseClusterEnd(decls, src, start) {
  if (!isRecoverAbbrevNoise(decls[start].inner, src)) return start + 1;
  let j = start;
  while (j + 1 < decls.length) {
    const gap = src.slice(decls[j].wrap.to, decls[j + 1].wrap.from);
    if (gap.includes('}}%') || gap.includes('%{{')) break;
    if (!subtreeHasError(decls[j + 1].inner)) break;
    j++;
  }
  return j + 1;
}

export function formatString(src, tree, opts = {}) {
  src = normalizeNewlines(src);
  const width = opts.printWidth ?? 80;
  const minSignificantRatio = opts.minSignificantRatio ?? 0.5;
  const { pp } = makePrinter(src, { printWidth: width });

  const root = tree.topNode;
  const decls = [];
  for (const c of childrenArr(root)) {
    if (c.name === 'Declaration') {
      const inner = c.firstChild;
      if (inner) decls.push({ wrap: c, inner });
    }
  }

  const proseBlocks = findProseBlocks(src);
  const out = [];
  let cursor = 0;
  let di = 0;
  while (di < decls.length) {
    const { wrap, inner } = decls[di];
    const inProse = proseBlockContaining(wrap.from, proseBlocks);
    if (inProse) {
      const [pbStart, pbEnd] = inProse;
      if (cursor < pbStart) {
        const rawGap = src.slice(cursor, pbStart);
        const gap = proseBlockGap(rawGap)
          ? normalizeNewlines(rawGap)
          : normalizeSameLinePragmaGap(src, normalizeGapTrailingPragmas(rawGap), cursor, pbStart);
        out.push(gap);
      }
      out.push(normalizeNewlines(src.slice(pbStart, pbEnd)));
      cursor = pbEnd;
      while (di < decls.length && decls[di].wrap.from < pbEnd) di++;
      continue;
    }
    const rawGap = src.slice(cursor, wrap.from);
    const gap = proseBlockGap(rawGap)
      ? normalizeNewlines(rawGap)
      : normalizeSameLinePragmaGap(src, normalizeGapTrailingPragmas(rawGap), cursor, wrap.from);
    out.push(gap);
    const clusterEnd = errorProseClusterEnd(decls, src, di);
    if (clusterEnd > di + 1) {
      out.push(normalizeNewlines(src.slice(decls[di].wrap.from, decls[clusterEnd - 1].wrap.to)));
      cursor = decls[clusterEnd - 1].wrap.to;
      di = clusterEnd;
      continue;
    }
    const verbatim =
      subtreeHasNonRecoveryError(inner) ||
      declarationUsesPercentBlockMacro(src, inner) ||
      declarationHasRiskyDoubleDash(src, inner);
    if (verbatim) {
      out.push(normalizeNewlines(src.slice(wrap.from, wrap.to)));
    } else {
      let rendered = render(pp(inner), width);
      rendered = rendered.replace(/[ \t]+(?=\n|$)/gm, '');
      out.push(rendered);
    }
    cursor = wrap.to;
    di++;
  }
  const tailGap = src.slice(cursor, src.length);
  out.push(
    proseBlockGap(tailGap) ? normalizeNewlines(tailGap) : normalizeGapTrailingPragmas(normalizeNewlines(tailGap)),
  );

  let result = normalizeNewlines(out.join(''));
  result = result.replace(/\r\n?/g, '\n');
  result = result.replace(/[ \t]+$/gm, '');
  result = result.replace(/\n{4,}/g, '\n\n\n');
  result = result.replace(/^(?:[ \t]*\n)+/, '');
  result = result.replace(/(?:\n[ \t]*)+$/, '\n');
  if (!result.endsWith('\n')) result += '\n';

  const srcSig = significantLen(src);
  const resultSig = significantLen(result);
  if (!opts.allowShrink && srcSig > 0 && resultSig < srcSig * minSignificantRatio) {
    const err = new Error(
      `format: would drop significant content (${resultSig} < ${minSignificantRatio} × ${srcSig}); refusing to apply`
    );
    err.code = 'FORMAT_SHRINK_GUARD';
    throw err;
  }

  return result;
}

export function formatDocument(state, opts = {}) {
  const tree = syntaxTree(state);
  const oldText = state.doc.toString();
  const g = typeof window !== 'undefined' ? window : globalThis;
  const printWidth = opts.printWidth
    ?? g.BelJarPersist?.readStoredEditorFormatWidth?.()
    ?? 80;
  let newText;
  try {
    newText = formatString(oldText, tree, { ...opts, printWidth });
  } catch (e) {
    if (e && e.code === 'FORMAT_SHRINK_GUARD') {
      showFormatToast('Format refused. The result would drop too much content.', 'warn');
      return null;
    }
    showFormatToast('Format failed.', 'error');
    return null;
  }
  if (newText === oldText) return null;

  return {
    changes: { from: 0, to: state.doc.length, insert: newText },
  };
}

export function formatCommand(view) {
  const anchor = captureFormatViewportAnchor(view);
  const oldText = view.state.doc.toString();
  const sel = view.state.selection.main;
  const change = formatDocument(view.state);
  if (!change) return false;

  const newText = change.changes.insert;
  const newLen = newText.length;
  const selHead = Math.min(sel.head, newLen);
  const fileId = (typeof globalThis !== 'undefined' ? globalThis : window).BelJarCurrentEditor?.getCurrentFileId?.() ?? null;

  dispatchEdit(view, {
    ...change,
    selection: EditorSelection.cursor(selHead),
    userEvent: 'format',
  }, {
    fileId,
    kind: 'format',
    editorLocal: anchor,
  });

  const resolvedPos = resolveFormatViewportAnchor(anchor, view.state, newText) ?? selHead;
  scheduleScrollToCenter(view, resolvedPos, {
    selection: { anchor: selHead, head: selHead },
  });
  return true;
}
