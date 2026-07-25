// Navigation gestures: Ctrl/Cmd-click jumps to definition, Ctrl-hover underlines
// the jumpable token, and on cursor rest other occurrences of the symbol get a
// subtle tint (skipped when it is the only occurrence in the file).

import { EditorView, Decoration, ViewPlugin } from '@codemirror/view';
import { StateEffect, StateField, RangeSetBuilder, Transaction } from '@codemirror/state';
import { getEngine, navInfoAt, goToDefinition, crossFileDefinitionAt } from './ide-actions.mjs';
import { renameActiveField } from './rename.mjs';

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

export function clearDefLink(view) {
  if (!view._belDefLinkActive) return;
  view._belDefLinkActive = false;
  view.dispatch({ effects: clearLinkEffect.of(null) });
  view.dom.classList.remove('cm-bel-deflink-armed');
}

export function armDefLink(view, from, to) {
  view._belDefLinkActive = true;
  view.dispatch({ effects: setLinkEffect.of({ from, to }) });
  view.dom.classList.add('cm-bel-deflink-armed');
}

export function defLinkDecoration() {
  return linkField;
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
    let hl = nav && nav.nameRange && !nav.onDefinition && nav.reference
      ? nav.reference.range
      : null;
    if (!hl && (!nav || !nav.nameRange)) {
      // Defined in another project file? Same gesture, cross-file jump.
      const cross = crossFileDefinitionAt(view, pos);
      if (cross) hl = cross.sourceRange;
    }
    if (hl) {
      armDefLink(view, hl.from, hl.to);
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
    const localTarget = nav && nav.nameRange && !nav.onDefinition;
    if (!localTarget) {
      // Cross-file: only claim the click when the group really defines it.
      if (nav && nav.onDefinition) return false;
      if (!crossFileDefinitionAt(view, pos)) return false;
    }
    event.preventDefault();
    clearDefLink(view);
    goToDefinition(view, pos);
    return true;
  },
});

// ---- live word-occurrence highlight on cursor rest ----------------------

export const navSemanticTick = StateEffect.define();

const REST_MS = 260;

const occMark = Decoration.mark({ class: 'cm-bel-occurrence' });
const occActiveMark = Decoration.mark({ class: 'cm-bel-occurrence cm-bel-occurrence-active' });

const setOccEffect = StateEffect.define();

const occurrenceField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    if (tr.docChanged) return Decoration.none;
    for (const e of tr.effects) {
      if (e.is(setOccEffect)) return e.value;
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildOccDecorations(state, head, occ) {
  const builder = new RangeSetBuilder();
  for (const r of occ) {
    if (r.from === r.to) continue;
    const active = head >= r.from && head <= r.to;
    builder.add(r.from, r.to, active ? occActiveMark : occMark);
  }
  return builder.finish();
}

function pointerSelection(update) {
  return update.transactions.some((tr) => tr.annotation(Transaction.userEvent) === 'select.pointer');
}

function semanticTicked(update) {
  return update.transactions.some((tr) => tr.effects.some((e) => e.is(navSemanticTick)));
}

function dispatchOcc(view, deco) {
  queueMicrotask(() => {
    if (!view.dom.isConnected) return;
    view.dispatch({ effects: setOccEffect.of(deco) });
  });
}

const occurrenceScheduler = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.timer = null;
      this.lastHead = view.state.selection.main.head;
      this.occShown = false;
    }

    update(update) {
      if (update.state.field(renameActiveField, false)) {
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        this.clear(update.view);
        return;
      }

      const sel = update.state.selection.main;
      const headMoved = update.selectionSet && sel.head !== this.lastHead;

      if (update.docChanged) {
        this.lastHead = sel.head;
        this.clear(update.view);
        this.scheduleDebounced(update.view);
        return;
      }

      if (semanticTicked(update)) {
        this.scheduleDebounced(update.view);
      }

      if (headMoved) {
        this.lastHead = sel.head;
        if (pointerSelection(update)) this.recompute(update.view);
        else this.scheduleDebounced(update.view);
      }
    }

    scheduleDebounced(view) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.recompute(view);
      }, REST_MS);
    }

    clear(view) {
      if (!this.occShown) return;
      this.occShown = false;
      dispatchOcc(view, Decoration.none);
    }

    show(view, deco) {
      this.occShown = true;
      dispatchOcc(view, deco);
    }

    recompute(view) {
      queueMicrotask(() => {
        if (!view.dom.isConnected) return;
        if (view.state.field(renameActiveField, false)) {
          this.clear(view);
          return;
        }
        const sel = view.state.selection.main;
        if (!sel.empty) {
          this.clear(view);
          return;
        }
        const eng = getEngine(view);
        const occ = eng && typeof eng.occurrencesAt === 'function'
          ? eng.occurrencesAt(sel.head)
          : [];
        if (!occ || occ.length < 2) {
          this.clear(view);
          return;
        }
        this.show(view, buildOccDecorations(view.state, sel.head, occ));
      });
    }

    destroy() {
      if (this.timer) clearTimeout(this.timer);
    }
  },
);

export function occurrenceHighlight() {
  return [occurrenceField, occurrenceScheduler];
}

export function navigationGestures() {
  return [defLinkGestures];
}

export function navigation() {
  return [linkField, defLinkGestures, occurrenceField, occurrenceScheduler];
}
