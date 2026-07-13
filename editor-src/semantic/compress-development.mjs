import { parser } from '../beluga-parser.js';
import { assembleCheckerCode } from '../project-prelude.mjs';
import {
  buildScopedSource,
  declIndicesForRanges,
  topDeclSpans,
} from './scoped-check.mjs';

// Signature-compressed development: Beluga re-verifies only the dirty frontier.
// Outside that frontier, rec/proof bodies become `?` so signatures stay in
// scope without replaying proof scripts — including every prelude member.

function bodySpansInTree(tree, { upTo = Infinity, excludeRanges = [] } = {}) {
  const spans = [];
  const excluded = (span) => excludeRanges.some((r) => span.from >= r.from && span.to <= r.to);
  tree.iterate({
    enter(ref) {
      if (ref.name !== 'RecBody' && ref.name !== 'ProofDeclaration') return;
      let eq = null;
      for (let c = ref.node.firstChild; c; c = c.nextSibling) {
        if (c.name === '=') eq = c;
        else if (eq && (c.name === 'Expression' || c.name === 'ProofScript')) {
          if (c.to > c.from && c.to <= upTo && !excluded({ from: c.from, to: c.to })) {
            spans.push({ from: c.from, to: c.to });
          }
          break;
        }
      }
    },
  });
  return spans;
}

function applyLinePreservingStubs(src, spans) {
  let out = src;
  for (const s of [...spans].sort((a, b) => b.from - a.from)) {
    const nl = (src.slice(s.from, s.to).match(/\n/g) || []).length;
    out = out.slice(0, s.from) + '?' + '\n'.repeat(nl) + out.slice(s.to);
  }
  return out;
}

/** Stub every rec/proof body in `src`. Signatures stay; line count preserved. */
export function stubAllBodies(src, tree = null) {
  const text = String(src ?? '');
  if (!text) return text;
  const t = tree || parser.parse(text);
  return applyLinePreservingStubs(text, bodySpansInTree(t));
}

// Stubbing parses the WHOLE prelude with Lezer — never per settle on the main
// thread. Keyed by the prelude text (string value equality), small LRU.
const PRELUDE_STUB_CACHE_MAX = 4;
const preludeStubCache = new Map();

/** Prelude with all proof/rec bodies stubbed; spans / offsetLines unchanged. */
export function compressPrelude(prelude) {
  if (!prelude || !prelude.code) return prelude;
  const key = prelude.code;
  let stubbed = preludeStubCache.get(key);
  if (stubbed == null) {
    stubbed = stubAllBodies(key);
    preludeStubCache.set(key, stubbed);
    if (preludeStubCache.size > PRELUDE_STUB_CACHE_MAX) {
      preludeStubCache.delete(preludeStubCache.keys().next().value);
    }
  }
  return { ...prelude, code: stubbed };
}

/**
 * Build the checker program for frontier certification:
 *   compressed prelude (all bodies stubbed) + scoped active file (dirty kept).
 * Returns null when there is nothing scopable (empty frontier).
 */
export function buildCompressedCheckerCode({
  fileCode,
  prelude = null,
  keepIdx = null,
  tree = null,
  activeSrc = null,
} = {}) {
  const src = activeSrc != null ? String(activeSrc) : String(fileCode ?? '');
  if (!keepIdx || !keepIdx.size) return null;
  const scopedActive = buildScopedSource(src, keepIdx, tree);
  if (scopedActive == null) return null;
  // Masked fileCode may differ from live src; prefer scoped live text when
  // fileCode is the checker snapshot of the same buffer (line-preserving stubs
  // need the tree that matches `src`). When fileCode was already masked, callers
  // should pass tree/src for that masked text.
  const activeForAssemble = fileCode != null && String(fileCode) !== src
    ? buildScopedSource(String(fileCode), keepIdx, tree) || scopedActive
    : scopedActive;
  const compressed = compressPrelude(prelude);
  return assembleCheckerCode(activeForAssemble, compressed);
}

export function keepIndicesForFrontier(tree, frontierRanges) {
  return declIndicesForRanges(tree, frontierRanges || []);
}

export {
  buildScopedSource,
  declIndicesForRanges,
  topDeclSpans,
};
