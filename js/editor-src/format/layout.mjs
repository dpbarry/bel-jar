import { concat, empty, group, hardline, join, render, space, text } from './doc.mjs';

export function measureDoc(doc, printWidth) {
  const s = render(doc, printWidth);
  const lines = s.split('\n');
  return {
    text: s,
    oneLine: lines.length <= 1,
    width: Math.max(0, ...lines.map((l) => l.length)),
  };
}

export function layoutStack(items, opts = {}) {
  const { printWidth = 80, indent = 2, baseCol = 0 } = opts;
  if (items.length === 0) return empty;
  if (items.length === 1) return items[0];
  const flat = group(join(space, items));
  const m = measureDoc(flat, printWidth);
  if (m.oneLine && m.width <= printWidth) return flat;
  const pad = ' '.repeat(baseCol + indent);
  let doc = items[0];
  for (let i = 1; i < items.length; i++) {
    doc = concat(doc, hardline, text(pad), items[i]);
  }
  return doc;
}

export function layoutPrefixChain(headDoc, clauseDocs, opts = {}) {
  const { indent = 2 } = opts;
  if (clauseDocs.length === 0) return headDoc;
  let doc = concat(headDoc, clauseDocs[0]);
  const pad = ' '.repeat(indent);
  for (let i = 1; i < clauseDocs.length; i++) {
    doc = concat(doc, hardline, text(pad), clauseDocs[i]);
  }
  return doc;
}

function breakLongSegment(segText, continuationIndent) {
  if (!segText || segText.length < 56) return text(segText);
  const idx = segText.search(/\s+⊢\s*/);
  if (idx < 12) return text(segText);
  const pre = segText.slice(0, idx).trimEnd();
  const post = segText.slice(idx).trimStart();
  if (!post.startsWith('⊢')) return text(segText);
  return concat(text(pre), hardline, text(' '.repeat(continuationIndent)), text(post));
}

export function layoutArrowChain(opts) {
  const {
    printWidth = 80,
    lineIndent = 0,
    continuationIndent = 2,
    headPrefix = '',
    segments,
    ops,
    renderSegment,
    stickyBeforeOp,
    terminator = null,
    widthSlack = 0,
    flatLine = null,
    omitLeadingSegment = false,
  } = opts;

  const termLen = terminator ? terminator.length : 0;
  let sticky = false;
  for (let i = 0; i < ops.length; i++) {
    if (stickyBeforeOp(segments[i], ops[i])) sticky = true;
  }

  if (flatLine && !sticky && flatLine.length + termLen + widthSlack <= printWidth) {
    return concat(text(flatLine), terminator ? text(terminator) : empty);
  }

  const linePad = ' '.repeat(lineIndent);
  const contCol = lineIndent + continuationIndent;
  let doc = omitLeadingSegment ? empty : concat(text(headPrefix + renderSegment(segments[0])));

  for (let i = 0; i < ops.length; i++) {
    const opT = opts.opToText(ops[i]);
    const nxt = renderSegment(segments[i + 1]);
    const isSticky = stickyBeforeOp(segments[i], ops[i]);
    if (isSticky || nxt.includes('\n')) {
      doc = concat(
        doc,
        hardline,
        text(linePad + opT + ' '),
        breakLongSegment(nxt.replace(/\n/g, ' ').trim(), contCol),
      );
    } else {
      doc = concat(doc, hardline, text(linePad + opT + ' '), text(nxt));
    }
  }

  return concat(doc, terminator ? text(terminator) : empty);
}
