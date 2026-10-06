import { EditorSelection } from '@codemirror/state';
import { parser } from '../beluga-parser.js';
import { render } from './doc.mjs';
import { makePrinter } from './printer.mjs';
import { childrenArr } from './basics.mjs';
import { GAP_PRAGMA_LINE, TOP_LEVEL_PRAGMA_INNER } from '../lint-units.mjs';
import {
  captureFormatViewportAnchor,
  resolveFormatViewportAnchor,
  scheduleScrollToCenter,
} from '../ide/viewport.mjs';
import { dispatchEdit } from '../edit-history.mjs';
import { readSetting } from '../../persist/settings-schema.mjs';

function showFormatToast(message, kind) {
  const T = typeof window !== 'undefined' ? window.Toasts : null;
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
  if (!gap || !gap.includes('\n')) return gap;
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

export const keptAsWritten = (src, inner) =>
  subtreeHasNonRecoveryError(inner) ||
  declarationUsesPercentBlockMacro(src, inner) ||
  declarationHasRiskyDoubleDash(src, inner);

function isRecoverAbbrevNoise(inner, src) {
  if (inner.name !== 'AbbrevPragma') return false;
  if (!subtreeHasError(inner)) return false;
  const head = src.slice(inner.from, inner.to).trimStart();
  return !head.startsWith('--abbrev');
}

function programOf(node, src) {
  const tokens = [];
  const comments = [];
  const norm = (n) => src.slice(n.from, n.to).replace(/\s+/g, ' ').trim();
  node.cursor().iterate((n) => {
    if (n.name === 'LineComment' || n.name === 'BlockComment') {
      comments.push(norm(n));
      return false;
    }
    if (!n.node.firstChild && n.to > n.from) tokens.push(`${n.name} ${norm(n)}`);
    return undefined;
  });
  return { tokens, comments: comments.sort().join('\n') };
}

const SUPPLIED_BAR_AFTER = /^(?:= =|OfKeyword |FunKeyword )/;

/** Same tokens in the same order and the same comments; the printer may only supply a leading `|`. */
function sameProgram(a, b) {
  if (a.comments !== b.comments) return false;
  let i = 0;
  let j = 0;
  while (i < a.tokens.length || j < b.tokens.length) {
    if (a.tokens[i] === b.tokens[j]) {
      i++;
      j++;
    } else if (b.tokens[j] === '| |' && SUPPLIED_BAR_AFTER.test(b.tokens[j - 1] ?? '')) j++;
    else return false;
  }
  return true;
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
    const verbatim = keptAsWritten(src, inner);
    const asWritten = normalizeNewlines(src.slice(wrap.from, wrap.to));
    cursor = wrap.to;
    if (verbatim) {
      out.push(asWritten);
    } else {
      const rendered = render(pp(inner), width).replace(/[ \t]+(?=\n|$)/gm, '');
      const kept = sameProgram(programOf(inner, src), programOf(parser.parse(rendered).topNode, rendered));
      if (!kept) opts.onRefuse?.({ from: wrap.from, to: wrap.to, rendered });
      out.push(kept ? rendered : asWritten);
      // Whitespace a recovered node swallowed at its end is the gap to the next declaration.
      if (kept) while (cursor > wrap.from && /\s/.test(src[cursor - 1])) cursor--;
    }
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

export function resolvePrintWidth(opts = {}) {
  return opts.printWidth
    ?? readSetting('editorFormatWidth')
    ?? 80;
}

function warnRefused(count) {
  if (count === 0) return;
  showFormatToast(
    count === 1
      ? 'One declaration was left as written: printing it would have changed its code.'
      : `${count} declarations were left as written: printing them would have changed their code.`,
    'warn',
  );
}

/** Format source text without a CodeMirror view. Returns formatted text, or null if refused. */
export function formatSource(src, opts = {}) {
  const oldText = String(src ?? '');
  const printWidth = resolvePrintWidth(opts);
  let refused = 0;
  try {
    const out = formatString(oldText, parser.parse(oldText), { ...opts, printWidth, onRefuse: () => refused++ });
    if (!opts.quiet) warnRefused(refused);
    return out;
  } catch (e) {
    if (!opts.quiet) {
      if (e && e.code === 'FORMAT_SHRINK_GUARD') {
        showFormatToast('Format refused. The result would drop too much content.', 'warn');
      } else {
        showFormatToast('Format failed.', 'error');
      }
    }
    return null;
  }
}

export function formatDocument(state, opts = {}) {
  const oldText = state.doc.toString();
  const printWidth = resolvePrintWidth(opts);
  let newText;
  let refused = 0;
  try {
    newText = formatString(oldText, parser.parse(oldText), { ...opts, printWidth, onRefuse: () => refused++ });
    warnRefused(refused);
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
  const sel = view.state.selection.main;
  // ⛔ The caret needs an anchor too, not a byte offset.
  //
  // Formatting rewrites the whole document, so `Math.min(head, newLength)` is a
  // position in the OLD text read against the NEW one — it lands wherever the
  // reflowed text happens to reach, and the further down the file you were the
  // further off it is. The viewport already had this solved: the same
  // declaration-relative, whitespace-insensitive anchor that keeps the right
  // code on screen puts the caret back where the user left it.
  const caretAnchor = captureFormatViewportAnchor(view, sel.head);
  const change = formatDocument(view.state);
  if (!change) return false;

  const newText = change.changes.insert;
  const newLen = newText.length;
  const fallbackHead = Math.min(sel.head, newLen);
  const fileId = (typeof globalThis !== 'undefined' ? globalThis : window).CurrentEditor?.getCurrentFileId?.() ?? null;

  dispatchEdit(view, {
    ...change,
    selection: EditorSelection.cursor(fallbackHead),
    userEvent: 'format',
  }, {
    fileId,
    kind: 'format',
  });

  // Resolved against the state the dispatch just produced.
  const selHead = resolveFormatViewportAnchor(caretAnchor, view.state, newText) ?? fallbackHead;
  const resolvedPos = resolveFormatViewportAnchor(anchor, view.state, newText) ?? selHead;
  scheduleScrollToCenter(view, resolvedPos, {
    selection: { anchor: selHead, head: selHead },
  });
  return true;
}
