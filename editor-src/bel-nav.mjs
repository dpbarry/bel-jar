// Navigation gestures: Ctrl/Cmd-click jumps to definition, Ctrl-hover underlines
// the jumpable token, and on cursor rest every occurrence of the symbol gets a
// subtle tint. All read the engine via bel-ide-actions.

import { EditorView, Decoration, ViewPlugin } from '@codemirror/view';
import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import { getEngine, navInfoAt, goToDefinition } from './bel-ide-actions.mjs';

function modPressed(event) {
  return event.metaKey || event.ctrlKey;
}

// ---- Ctrl-click go-to-definition + Ctrl-hover underline ------------------

const setLinkEffect = StateEffect.define();
const clearLinkEffect = StateEffect.define();

const linkMark = Decoration.mark({ class: 'cm-bel-deflink' });

const linkField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(clearLinkEffect)) value = Decoration.none;
      else if (e.is(setLinkEffect)) {
        const { from, to } = e.value;
        value = Decoration.set([linkMark.range(from, to)]);
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function clearDefLink(view) {
  if (!view._belDefLinkActive) return;
  view._belDefLinkActive = false;
  view.dispatch({ effects: clearLinkEffect.of(null) });
  view.dom.classList.remove('cm-bel-deflink-armed');
}

const defLinkGestures = EditorView.domEventHandlers({
  mousemove(event, view) {
    if (!modPressed(event)) {
      clearDefLink(view);
      return false;
    }
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;
    const nav = navInfoAt(view, pos);
    // Underline only a token whose definition is elsewhere (not the def name).
    const hl = nav && nav.nameRange && !nav.onDefinition && nav.reference
      ? nav.reference.range
      : null;
    if (hl) {
      view._belDefLinkActive = true;
      view.dispatch({ effects: setLinkEffect.of({ from: hl.from, to: hl.to }) });
      view.dom.classList.add('cm-bel-deflink-armed');
    } else {
      clearDefLink(view);
    }
    return false;
  },
  mouseleave(event, view) {
    clearDefLink(view);
    return false;
  },
  mousedown(event, view) {
    if (event.button !== 0 || !modPressed(event)) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;
    const nav = navInfoAt(view, pos);
    if (!nav || !nav.nameRange || nav.onDefinition) return false;
    event.preventDefault();
    clearDefLink(view);
    goToDefinition(view, pos);
    return true;
  },
});

// ---- live word-occurrence highlight on cursor rest ----------------------

const REST_MS = 260;

const occMark = Decoration.mark({ class: 'cm-bel-occurrence' });
const occActiveMark = Decoration.mark({ class: 'cm-bel-occurrence cm-bel-occurrence-active' });

// Carries rest-timer-computed occurrence ranges back into the view.
const setOccEffect = StateEffect.define();

function buildOccDecorations(state, head, occ) {
  const builder = new RangeSetBuilder();
  for (const r of occ) {
    if (r.from === r.to) continue;
    const active = head >= r.from && head <= r.to;
    builder.add(r.from, r.to, active ? occActiveMark : occMark);
  }
  return builder.finish();
}

const occurrenceHighlighter = ViewPlugin.fromClass(
  class {
    constructor() {
      this.decorations = Decoration.none;
      this.timer = null;
      this.lastHead = -1;
    }

    update(update) {
      for (const tr of update.transactions) {
        for (const e of tr.effects) {
          if (e.is(setOccEffect)) {
            this.decorations = e.value;
          }
        }
      }
      // Drop stale ranges on edit rather than mapping them through.
      if (update.docChanged && this.decorations.size) {
        this.decorations = Decoration.none;
      }
      const sel = update.state.selection.main;
      if (update.docChanged || (update.selectionSet && sel.head !== this.lastHead)) {
        if (this.decorations.size && update.selectionSet) this.decorations = Decoration.none;
        this.lastHead = sel.head;
        this.schedule(update.view);
      }
    }

    schedule(view) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.recompute(view);
      }, REST_MS);
    }

    recompute(view) {
      if (!view.dom.isConnected) return;
      const sel = view.state.selection.main;
      if (!sel.empty) {
        if (this.decorations.size) view.dispatch({ effects: setOccEffect.of(Decoration.none) });
        return;
      }
      const eng = getEngine(view);
      const occ = eng && typeof eng.occurrencesAt === 'function'
        ? eng.occurrencesAt(sel.head)
        : [];
      // A lone occurrence (just the declaration, no uses) isn't worth tinting.
      if (!occ || occ.length < 2) {
        if (this.decorations.size) view.dispatch({ effects: setOccEffect.of(Decoration.none) });
        return;
      }
      const decos = buildOccDecorations(view.state, sel.head, occ);
      view.dispatch({ effects: setOccEffect.of(decos) });
    }

    destroy() {
      if (this.timer) clearTimeout(this.timer);
    }
  },
  { decorations: (v) => v.decorations }
);

export function belNavigation() {
  return [linkField, defLinkGestures, occurrenceHighlighter];
}
