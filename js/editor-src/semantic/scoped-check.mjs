import { parser } from '../beluga-parser.js';

// Pure, tree-based construction of a SCOPED program: the smallest well-formed
// active-file text that still lets Beluga authoritatively check the dirty
// declarations. Bodies of the kept (dirty) declarations stay intact so their
// real errors surface; every OTHER rec/proof body before the last kept decl is
// replaced with a hole `?` (its already-proven signature stays in scope); and
// everything after the last kept decl is dropped (unchanged, still green).
//
// Stubs are LINE-COUNT PRESERVING and the tail is a plain truncation, so every
// byte/line offset of a kept declaration is identical to the full source. That
// invariant is what lets the existing settlement attribution (block index,
// prelude shift, doc-relative diagnostics) run unchanged on scoped output — and
// it is exactly what tests/scope-parity.mjs proves against ground-truth Beluga.

export function topDeclSpans(tree) {
  const cur = tree.topNode.cursor();
  const out = [];
  if (cur.firstChild()) {
    do { if (cur.name === 'Declaration') out.push({ from: cur.from, to: cur.to }); }
    while (cur.nextSibling());
  }
  return out;
}

// rec/proof body-expression spans that end at or before `cutoff`.
function bodySpansUpTo(tree, cutoff) {
  const spans = [];
  tree.iterate({
    enter(ref) {
      if (ref.name !== 'RecBody' && ref.name !== 'ProofDeclaration') return;
      let eq = null;
      for (let c = ref.node.firstChild; c; c = c.nextSibling) {
        if (c.name === '=') eq = c;
        else if (eq && (c.name === 'Expression' || c.name === 'ProofScript')) {
          if (c.to > c.from && c.to <= cutoff) spans.push({ from: c.from, to: c.to });
          break;
        }
      }
    },
  });
  return spans;
}

// Map a set of source ranges (e.g. dirty declaration spans) to the indices of
// the top-level declarations that contain them.
export function declIndicesForRanges(tree, ranges) {
  const decls = topDeclSpans(tree);
  const idx = new Set();
  for (const r of ranges || []) {
    for (let i = 0; i < decls.length; i += 1) {
      if (r.from < decls[i].to && r.to > decls[i].from) { idx.add(i); break; }
    }
  }
  return idx;
}

// keepIdx: indices (into topDeclSpans) whose bodies must stay intact — the dirty
// frontier. Returns the scoped source, or null when there is nothing to scope
// (no decls / empty frontier). Offsets of kept decls equal those in `src`.
export function buildScopedSource(src, keepIdx, tree = null) {
  if (!keepIdx || !keepIdx.size) return null;
  const t = tree || parser.parse(src);
  const decls = topDeclSpans(t);
  if (!decls.length) return null;
  const lastKeep = Math.max(...keepIdx);
  if (lastKeep >= decls.length) return null;
  const cutoff = decls[lastKeep].to;
  const keepRanges = [...keepIdx].map((i) => decls[i]).filter(Boolean);
  const insideKept = (span) => keepRanges.some((d) => span.from >= d.from && span.to <= d.to);
  const stub = bodySpansUpTo(t, cutoff)
    .filter((s) => !insideKept(s))
    .sort((a, b) => b.from - a.from);
  let out = src.slice(0, cutoff);
  for (const s of stub) {
    const nl = (src.slice(s.from, s.to).match(/\n/g) || []).length;
    out = out.slice(0, s.from) + '?' + '\n'.repeat(nl) + out.slice(s.to);
  }
  return out;
}

// Drop diagnostics that overlap any of the given doc ranges (the dirty
// frontier). Everything else — errors in other declarations — is left alone.
export function diagnosticOverlapsRange(d, r) {
  if (d.from == null || !r) return false;
  const from = d.from;
  const to = d.to != null ? d.to : from + 1;
  return from < r.to && to > r.from;
}

export function diagnosticsOutsideRanges(diags, ranges) {
  if (!ranges || !ranges.length) return diags || [];
  return (diags || []).filter((d) => !ranges.some((r) => diagnosticOverlapsRange(d, r)));
}

export function declRangesForIndices(tree, keepIdx) {
  const decls = topDeclSpans(tree);
  return [...(keepIdx || [])].map((i) => decls[i]).filter(Boolean);
}
