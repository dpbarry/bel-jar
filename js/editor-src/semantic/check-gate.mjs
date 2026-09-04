import { checkerSnapshotFromSyntax } from './checker-snapshot.mjs';
import { onlySyntaxFaultBlocksChanged } from './syntax-only-gate.mjs';

function commentSpans(tree) {
  const spans = [];
  if (!tree) return spans;
  tree.iterate({
    enter(node) {
      if (node.name === 'LineComment' || node.name === 'BlockComment') {
        spans.push({ from: node.from, to: node.to });
      }
    },
  });
  return spans;
}

function stripSpans(text, spans) {
  const sorted = [...spans].sort((a, b) => b.from - a.from);
  let out = text;
  for (const { from, to } of sorted) {
    out = out.slice(0, from) + out.slice(to);
  }
  return out;
}

// Whitespace and blank-line edits that Beluga treats as immaterial for checking.
function normalizeCosmeticWhitespace(text) {
  return text
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .join('\n')
    .replace(/\n{2,}/g, '\n');
}

export function semanticDeclText(doc, declarationNode, tree) {
  let text = doc.sliceString(declarationNode.from, declarationNode.to);
  if (tree && declarationNode) {
    const lo = declarationNode.from;
    const hi = declarationNode.to;
    const spans = [];
    // Bound the walk to [lo, hi]. An unbounded tree.iterate here used to
    // re-scan the ENTIRE file for every binder/decl (O(n²) on large proofs —
    // ~300ms/keystroke on cp_thrm.bel).
    tree.iterate({
      from: lo,
      to: hi,
      enter(node) {
        if (node.name === 'LineComment' || node.name === 'BlockComment') {
          spans.push({ from: node.from - lo, to: node.to - lo });
        }
      },
    });
    text = stripSpans(text, spans);
  }
  return normalizeCosmeticWhitespace(text);
}

function rangeFingerprint(syntax, from, to) {
  let text = syntax.doc.sliceString(from, to);
  if (syntax.tree) {
    const spans = [];
    syntax.tree.iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'LineComment' || node.name === 'BlockComment') {
          spans.push({ from: node.from - from, to: node.to - from });
        }
      },
    });
    text = stripSpans(text, spans);
  }
  return normalizeCosmeticWhitespace(text);
}

function blockFingerprint(syntax, block) {
  if (block.syntaxFault) return 'FAULT';
  return rangeFingerprint(syntax, block.from, block.to);
}

// Per-lint-block semantic spine. When a ChangeSet is present, only the touched
// block(s) are rehashed — earlier suite members are assumed unchanged (prefix
// closed). Untouched inter-block whitespace is cosmetic by construction.
export function blockSpineEqual(prevSyntax, syntax, changes) {
  const prev = prevSyntax?.blocks;
  const curr = syntax?.blocks;
  if (!prev || !curr || prev.length !== curr.length) return false;
  const canTouch = changes && typeof changes.touchesRange === 'function'
    && changes.length === prevSyntax.doc.length;
  for (let i = 0; i < curr.length; i += 1) {
    const pb = prev[i];
    const cb = curr[i];
    if (canTouch && !changes.touchesRange(pb.from, pb.to)) {
      if (!!pb.syntaxFault !== !!cb.syntaxFault) return false;
      continue;
    }
    if (blockFingerprint(prevSyntax, pb) !== blockFingerprint(syntax, cb)) return false;
  }
  return true;
}

// Memoized by snapshot identity. settlementTrigger fingerprints BOTH prev and
// next every update, and `prev` is just the previous update's `next` — so without
// this cache the fingerprint of the unchanged prior doc is recomputed from
// scratch every keystroke (a whole-doc walk + normalize for nothing).
const _fpCache = new WeakMap();

export function belugaCheckFingerprint(syntax) {
  if (!syntax?.doc) return '';
  const cached = _fpCache.get(syntax);
  if (cached !== undefined) return cached;
  const snap = checkerSnapshotFromSyntax(syntax);
  const stripped = stripSpans(snap.code, commentSpans(syntax.tree));
  const fp = normalizeCosmeticWhitespace(stripped);
  _fpCache.set(syntax, fp);
  return fp;
}

// cosmetic — comments / insignificant whitespace only: keep checker verdict, no schedule
// syntax-only — broken-block edits only: refresh graph, no Beluga
// semantic — schedule settlement
export function settlementTrigger(prevSyntax, syntax, opts = {}) {
  if (!prevSyntax?.doc || !syntax?.doc) return 'semantic';

  const changes = opts.changes || null;
  if (prevSyntax.blocks && syntax.blocks) {
    if (blockSpineEqual(prevSyntax, syntax, changes)) return 'cosmetic';
  } else if (belugaCheckFingerprint(prevSyntax) === belugaCheckFingerprint(syntax)) {
    return 'cosmetic';
  }
  if (onlySyntaxFaultBlocksChanged(prevSyntax, syntax)) {
    return 'syntax-only';
  }
  return 'semantic';
}
