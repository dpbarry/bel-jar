import { highlightingFor, syntaxTree } from '@codemirror/language';
import { tags as hlTags } from '@lezer/highlight';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import { RangeSetBuilder, StateField, StateEffect } from '@codemirror/state';
import { walkTree } from '../tree-walk.mjs';
import { envHasGlobal, envHasPreludeName, nameEnvForTree } from '../semantic/name-env.mjs';
import { timeSync } from '../perf/check-trace.mjs';

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

function overlapsRanges(from, to, ranges) {
  for (const r of ranges) {
    if (to > r.from && from < r.to) return true;
  }
  return false;
}

function overlapsViewport(from, to, view) {
  return overlapsRanges(from, to, view.visibleRanges);
}

// Bound uses of in-scope locals. Prefers the symbol store's local-resolution
// references (same answer hover/lint/completion use) when that tree has an env;
// falls back to walkTree's binder stack when the store hasn't synced yet.
export function collectBoundTintRanges(tree, doc, visibleRanges) {
  const pending = [];
  const env = nameEnvForTree(tree);
  if (env && Array.isArray(env.references)) {
    for (const r of env.references) {
      if (r.resolution !== 'local') continue;
      if (r.name.startsWith('#') || r.name.startsWith('$')) continue;
      if (envHasGlobal(env, r.name, r.kind === 'upper')) continue;
      if (envHasPreludeName(env, r.name)) continue;
      if (visibleRanges && !overlapsRanges(r.from, r.to, visibleRanges)) continue;
      pending.push({ from: r.from, to: r.to, kind: r.kind === 'upper' ? 'upper' : 'lower' });
    }
    return pending;
  }
  const { uses } = walkTree(tree, doc);
  for (const u of uses) {
    if (!u.bound) continue;
    if (u.name.startsWith('#') || u.name.startsWith('$')) continue;
    if (visibleRanges && !overlapsRanges(u.from, u.to, visibleRanges)) continue;
    pending.push({ from: u.from, to: u.to, kind: u.kind === 'upper' ? 'upper' : 'lower' });
  }
  return pending;
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

  const pendingMarks = [];

  for (const u of collectBoundTintRanges(tree, doc, view.visibleRanges)) {
    const tag = u.kind === 'upper' ? tagBoundUpper : tagBoundLower;
    const mk = markFor(state, markCache, tag);
    if (mk) pendingMarks.push({ from: u.from, to: u.to, deco: mk });
  }

  // Def-name tint only matters where it's visible; bound the declaration scan
  // to the viewport instead of walking every declaration in the file.
  const seenDecl = new Set();
  for (const r of view.visibleRanges) {
    tree.iterate({
      from: r.from,
      to: r.to,
      enter(ref) {
        if (ref.name !== 'LFDeclaration') return;
        if (seenDecl.has(ref.from)) return;
        seenDecl.add(ref.from);
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
  }

  pendingMarks.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder();
  for (const p of pendingMarks) builder.add(p.from, p.to, p.deco);
  return builder.finish();
}

// Bound-variable tinting is a cosmetic overlay, so it must not run on the
// keystroke transaction. Decorations live in a StateField that cheaply shifts
// existing marks by `tr.changes` on each edit, and a debounced scheduler
// re-derives the real set off the critical path once typing settles. The
// rebuild reads the symbol store's local-resolution references (no whole-file
// binder walk) when that tree has an env.
const setScopeEffect = StateEffect.define();

const SCOPE_REBUILD_MS = 90;

const scopeField = StateField.define({
  create() { return Decoration.none; },
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setScopeEffect)) return e.value;
    }
    if (tr.docChanged) return deco.map(tr.changes);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const scopeScheduler = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.markCache = Object.create(null);
      this.timer = null;
      this.recompute(view);
    }
    update(u) {
      // A plain edit: the field already shifted marks by the ChangeSet, so we
      // only need to re-derive after the burst. Scroll / async parse settle are
      // off the keystroke path but still want a prompt (debounced) refresh.
      if (u.docChanged
        || u.viewportChanged
        || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.scheduleDebounced(u.view);
      }
    }
    scheduleDebounced(view) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.recompute(view);
      }, SCOPE_REBUILD_MS);
    }
    recompute(view) {
      queueMicrotask(() => {
        if (!view.dom.isConnected) return;
        const deco = timeSync('scopeHighlight', () => buildDecorations(view, this.markCache));
        view.dispatch({ effects: setScopeEffect.of(deco) });
      });
    }
    destroy() {
      if (this.timer) clearTimeout(this.timer);
    }
  }
);

export const belugaScopeHighlight = [scopeField, scopeScheduler];
