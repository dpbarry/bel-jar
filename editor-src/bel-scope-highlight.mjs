import { highlightingFor, syntaxTree } from '@codemirror/language';
import { tags as hlTags } from '@lezer/highlight';
import { Decoration, ViewPlugin } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { walkTree } from './bel-walk.mjs';
import { timeSync } from './perf/check-trace.mjs';

const tagBoundLower = hlTags.local(hlTags.variableName);
const tagBoundUpper = hlTags.local(hlTags.typeName);
const tagDefTypeName = hlTags.definition(hlTags.typeName);

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

function overlapsViewport(from, to, view) {
  for (const r of view.visibleRanges) {
    if (to > r.from && from < r.to) return true;
  }
  return false;
}

function lfDeclarationComplete(node) {
  let colon = false;
  let dot = false;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === ':') colon = true;
    if (c.name === '.') dot = true;
  }
  return colon && dot;
}

function buildDecorations(view, markCache) {
  const tree = syntaxTree(view.state);
  const doc = view.state.doc;
  const state = view.state;
  const { uses } = walkTree(tree, doc);

  const pendingMarks = [];

  for (const u of uses) {
    if (!u.bound) continue;
    if (u.name.startsWith('#') || u.name.startsWith('$')) continue;
    if (!overlapsViewport(u.from, u.to, view)) continue;
    const tag = u.kind === 'upper' ? tagBoundUpper : tagBoundLower;
    const mk = markFor(state, markCache, tag);
    if (mk) pendingMarks.push({ from: u.from, to: u.to, deco: mk });
  }

  tree.iterate({
    enter(ref) {
      if (ref.name !== 'LFDeclaration') return;
      const node = ref.node;
      if (!lfDeclarationComplete(node)) return;
      let id = null;
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.name === 'LowerIdentifier') { id = c; break; }
      }
      if (!id) return;
      if (!overlapsViewport(id.from, id.to, view)) return;
      const mk = markFor(state, markCache, tagDefTypeName);
      if (mk) pendingMarks.push({ from: id.from, to: id.to, deco: mk });
    },
  });

  pendingMarks.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder();
  for (const p of pendingMarks) builder.add(p.from, p.to, p.deco);
  return builder.finish();
}

export const belugaScopeHighlight = ViewPlugin.fromClass(
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
        this.decorations = timeSync('scopeHighlight', () => buildDecorations(u.view, this.markCache));
      }
    }
  },
  { decorations: v => v.decorations }
);
