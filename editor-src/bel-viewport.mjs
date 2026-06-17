import { syntaxTree } from '@codemirror/language';
import { Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { parser } from './beluga-parser.js';
import { childrenArr } from './format/tree.mjs';

export function viewportCenterPos(view) {
  const scroller = view.scrollDOM;
  const rect = scroller.getBoundingClientRect();
  if (rect.height <= 0) return null;
  const midY = rect.top + rect.height / 2;
  const midX = rect.left + Math.min(48, Math.max(8, rect.width * 0.15));
  return view.posAtCoords({ x: midX, y: midY });
}

export function viewportCenterLine(view) {
  const pos = viewportCenterPos(view);
  if (pos == null) return 1;
  return view.state.doc.lineAt(pos).number;
}

export function scrollIntoViewCenter(pos) {
  const p = Math.max(0, Math.floor(Number(pos)));
  const anchor = Number.isFinite(p) ? p : 0;
  return EditorView.scrollIntoView(anchor, { y: 'center', x: 'nearest' });
}

function isSigChar(c) {
  return c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r';
}

function significantOffsetIn(text, pos, from, to) {
  let n = 0;
  const end = Math.min(pos, to);
  for (let i = from; i < end; i++) {
    if (isSigChar(text[i])) n++;
  }
  return n;
}

function posFromSignificantOffset(text, from, to, target) {
  let n = 0;
  for (let i = from; i < to; i++) {
    if (isSigChar(text[i])) {
      if (n >= target) return i;
      n++;
    }
  }
  return to;
}

function declarationAt(tree, pos) {
  let node = tree.resolveInner(pos, 1);
  while (node && node.parent && node.parent.name !== 'Program') {
    node = node.parent;
  }
  return node?.name === 'Declaration' ? node : null;
}

function declarationByIndex(tree, index) {
  let idx = 0;
  for (const c of childrenArr(tree.topNode)) {
    if (c.name === 'Declaration') {
      if (idx === index) return c;
      idx++;
    }
  }
  return null;
}

export function captureFormatViewportAnchor(view) {
  const pos = viewportCenterPos(view);
  if (pos == null) return null;
  const src = view.state.doc.toString();
  const tree = syntaxTree(view.state);
  const decl = declarationAt(tree, pos);
  if (decl) {
    let declIndex = 0;
    for (const c of childrenArr(tree.topNode)) {
      if (c.name === 'Declaration') {
        if (c.from === decl.from) break;
        declIndex++;
      }
    }
    return {
      kind: 'decl',
      declIndex,
      sigOffset: significantOffsetIn(src, pos, decl.from, decl.to),
    };
  }
  return {
    kind: 'doc',
    sigOffset: significantOffsetIn(src, pos, 0, src.length),
    line: view.state.doc.lineAt(pos).number,
  };
}

export function resolveFormatViewportAnchor(anchor, state, newText) {
  if (!anchor) return null;
  const docLen = state.doc.length;
  const tree = parser.parse(newText);

  if (anchor.kind === 'decl') {
    const decl = declarationByIndex(tree, anchor.declIndex);
    if (decl) {
      const pos = posFromSignificantOffset(newText, decl.from, decl.to, anchor.sigOffset);
      return Math.max(0, Math.min(pos, docLen));
    }
  }

  const pos = posFromSignificantOffset(newText, 0, newText.length, anchor.sigOffset);
  if (pos > 0) return Math.max(0, Math.min(pos, docLen));

  const line = Number(anchor.line);
  if (isFinite(line) && line >= 1 && state.doc.lines > 0) {
    return state.doc.line(Math.min(Math.max(1, Math.floor(line)), state.doc.lines)).from;
  }
  return 0;
}

export function scheduleScrollToCenter(view, pos, { selection, onApplied } = {}) {
  if (pos == null || !isFinite(pos)) return;

  function apply() {
    const docLen = view.state.doc.length;
    const clamped = Math.max(0, Math.min(pos, docLen));
    const tr = {
      annotations: Transaction.addToHistory.of(false),
      effects: scrollIntoViewCenter(clamped),
    };
    if (selection && isFinite(selection.anchor) && isFinite(selection.head)) {
      tr.selection = {
        anchor: Math.max(0, Math.min(selection.anchor, docLen)),
        head: Math.max(0, Math.min(selection.head, docLen)),
      };
    }
    view.dispatch(tr);
    if (onApplied) onApplied(tr.selection ? tr.selection.head : clamped);
  }

  view.requestMeasure();
  const afterLayout = () => {
    view.requestMeasure();
    requestAnimationFrame(() => requestAnimationFrame(apply));
  };
  const fontsReady = typeof document !== 'undefined' && document.fonts?.ready;
  if (fontsReady) fontsReady.then(afterLayout);
  else afterLayout();
}

export function scheduleViewportRestore(view, local) {
  if (!local || typeof local !== 'object') return;

  const doc = view.state.doc;
  const docLen = doc.length;
  let pos = null;
  const centerLine = Number(local.centerLine);
  if (isFinite(centerLine) && centerLine >= 1 && doc.lines > 0) {
    const line = doc.line(Math.min(Math.max(1, Math.floor(centerLine)), doc.lines));
    pos = line.from;
  }

  const selection = local.selection && isFinite(local.selection.anchor) && isFinite(local.selection.head)
    ? {
        anchor: Math.max(0, Math.min(local.selection.anchor, docLen)),
        head: Math.max(0, Math.min(local.selection.head, docLen)),
      }
    : undefined;

  if (pos != null) {
    scheduleScrollToCenter(view, pos, { selection });
    return;
  }
  if (!selection) return;

  function apply() {
    view.dispatch({
      selection,
      annotations: Transaction.addToHistory.of(false),
    });
  }
  requestAnimationFrame(() => requestAnimationFrame(apply));
}

export function resolveJumpRange(doc, jumpAt) {
  if (!jumpAt || jumpAt.from == null) return null;
  if (jumpAt.name) {
    return resolveReferenceJump(doc, jumpAt, jumpAt.name, jumpAt.line, jumpAt.col);
  }
  const from = Math.max(0, Math.min(jumpAt.from, doc.length));
  const rawTo = jumpAt.to != null ? jumpAt.to : from;
  const to = Math.max(from, Math.min(rawTo, doc.length));
  return { from, to };
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Land on `name` near the stored range — byte offsets alone can point at punctuation.
export function resolveReferenceJump(doc, range, name, line, col) {
  const len = doc.length;
  const hintFrom = Math.max(0, Math.min(range?.from ?? 0, len));
  const hintTo = Math.max(hintFrom, Math.min(range?.to ?? hintFrom, len));
  const exact = doc.slice(hintFrom, hintTo);
  if (name && exact === name) return { from: hintFrom, to: hintTo };

  const lineNo = line != null && Number.isFinite(Number(line))
    ? Math.floor(Number(line))
    : null;
  const col1 = col != null && Number.isFinite(Number(col)) ? Math.floor(Number(col)) : null;

  if (lineNo != null && lineNo >= 1 && name) {
    try {
      const ln = doc.line(lineNo);
      const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g');
      const hint = col1 != null ? ln.from + Math.max(0, col1 - 1) : hintFrom;
      let best = null;
      let bestDist = Infinity;
      let m;
      while ((m = re.exec(ln.text)) !== null) {
        const from = ln.from + m.index;
        const dist = Math.abs(from - hint);
        if (dist < bestDist) {
          bestDist = dist;
          best = { from, to: from + name.length };
        }
      }
      if (best) return best;
    } catch (_) { /* fall through */ }
  }

  return { from: hintFrom, to: hintTo };
}

export function notifyInspectorJump(view, pos) {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const p = pos != null ? pos : view.state.selection.main.from;
  const ed = g.BelJarCurrentEditor;
  if (ed && typeof ed.syncIntelAt === 'function') ed.syncIntelAt(p);
  if (typeof g.dispatchEvent === 'function') {
    g.dispatchEvent(new CustomEvent('beljar:inspector-refresh', {
      detail: { pos: p, afterJump: true },
    }));
  }
}

export function scheduleJumpToRange(view, jumpAt) {
  const resolved = resolveJumpRange(view.state.doc, jumpAt);
  if (!resolved) return;
  view.dispatch({
    selection: { anchor: resolved.from, head: resolved.to },
    effects: scrollIntoViewCenter(resolved.from),
    annotations: Transaction.addToHistory.of(false),
  });
  view.focus();
  notifyInspectorJump(view, resolved.from);
}
