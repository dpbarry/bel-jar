import {
  HighlightStyle,
  highlightingFor,
  syntaxHighlighting,
  syntaxTree,
} from '@codemirror/language';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import { Tag, tags as t } from '@lezer/highlight';
import { Decoration, ViewPlugin } from '@codemirror/view';
import { lfDeclarationHasColon } from '../lint-units.mjs';
import { timeSync } from '../perf/check-trace.mjs';

const PARSE_ERROR = '\u26A0';

export const parseErrorNeutral = Tag.define(t.name);

const parseErrorNeutralStyle = HighlightStyle.define([
  { tag: parseErrorNeutral, color: 'var(--base-highest)', fontWeight: '400' },
]);

function neutralHighlightContext(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.name === PARSE_ERROR) return true;
    if (p.name === 'LFDeclaration' && !lfDeclarationHasColon(p)) return true;
  }
  return false;
}

function overlapsViewport(from, to, view) {
  for (const r of view.visibleRanges) {
    if (to > r.from && from < r.to) return true;
  }
  return false;
}

function markFor(state, markCache, tag) {
  const cls = highlightingFor(state, [tag]);
  if (!cls) return null;
  let m = markCache[cls];
  if (!m) {
    m = Decoration.mark({ class: cls });
    markCache[cls] = m;
  }
  return m;
}

function buildDecorations(view, markCache) {
  const builder = new RangeSetBuilder();
  const tree = syntaxTree(view.state);
  const state = view.state;

  // Only the visible spans can produce marks (overlapsViewport gates output), so
  // bound the tree walk to the viewport instead of iterating every leaf in the
  // document. On a large file this makes the per-keystroke cost O(viewport), not
  // O(doc). RangeSetBuilder requires ascending `from`, so iterate ranges in order.
  // Guard against a leaf that straddles two adjacent visible ranges being
  // visited (and added) twice — RangeSetBuilder requires strictly ascending
  // starts, so never emit a mark that starts at/behind the previous one.
  let lastFrom = -1;
  const enter = (ref) => {
    const node = ref.node;
    if (node.firstChild != null) return;
    if (node.from >= node.to) return;
    if (ref.from <= lastFrom) return;
    if (node.name === 'LineComment' || node.name === 'BlockComment') return;
    if (!neutralHighlightContext(node)) return;
    if (!overlapsViewport(ref.from, ref.to, view)) return;
    const mk = markFor(state, markCache, parseErrorNeutral);
    if (mk) {
      builder.add(ref.from, ref.to, mk);
      lastFrom = ref.from;
    }
  };

  const ranges = view.visibleRanges;
  if (ranges.length) {
    for (const r of ranges) {
      tree.iterate({ from: r.from, to: r.to, enter });
    }
  }

  return builder.finish();
}

const belParseErrorHighlightPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.markCache = Object.create(null);
      this.decorations = buildDecorations(view, this.markCache);
    }
    update(u) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        syntaxTree(u.startState) !== syntaxTree(u.state)
      ) {
        this.decorations = timeSync('parseErrorHighlight', () => buildDecorations(u.view, this.markCache));
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export const parseErrorHighlightExtensions = [
  syntaxHighlighting(parseErrorNeutralStyle),
  Prec.highest(belParseErrorHighlightPlugin),
];
