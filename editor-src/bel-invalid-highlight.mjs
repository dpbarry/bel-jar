import {
  HighlightStyle,
  highlightingFor,
  syntaxHighlighting,
  syntaxTree,
} from '@codemirror/language';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import { Tag, tags as t } from '@lezer/highlight';
import { Decoration, ViewPlugin } from '@codemirror/view';
import { lfDeclarationHasColon } from './bel-units.mjs';

const PARSE_ERROR = '\u26A0';

export const belParseErrorNeutral = Tag.define(t.name);

const belParseErrorNeutralStyle = HighlightStyle.define([
  { tag: belParseErrorNeutral, color: 'var(--base-highest)', fontWeight: '400' },
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

  tree.iterate({
    enter(ref) {
      const node = ref.node;
      if (node.firstChild != null) return;
      if (node.from >= node.to) return;
      if (node.name === 'LineComment' || node.name === 'BlockComment') return;
      if (!neutralHighlightContext(node)) return;
      if (!overlapsViewport(ref.from, ref.to, view)) return;
      const mk = markFor(state, markCache, belParseErrorNeutral);
      if (mk) builder.add(ref.from, ref.to, mk);
    },
  });

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
        this.decorations = buildDecorations(u.view, this.markCache);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** Neutral theme tag + plugin (Prec highest — applied after scope highlight). */
export const belParseErrorHighlightExtensions = [
  syntaxHighlighting(belParseErrorNeutralStyle),
  Prec.highest(belParseErrorHighlightPlugin),
];
