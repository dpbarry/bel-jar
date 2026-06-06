// Central IDE action layer: every navigation/refactor gesture (Ctrl-click, F2,
// context menu, find-refs) routes through these functions, defined once and
// shared. Each takes the EditorView and reads the engine via getEngine.

import { EditorView, Decoration } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';

// ---- engine access -------------------------------------------------------

export function getEngine(view) {
  const g = typeof window !== 'undefined' ? window : self;
  const ed = g.BelJarCurrentEditor;
  if (ed && typeof ed.getSemanticEngine === 'function') {
    const eng = ed.getSemanticEngine();
    if (eng) return eng;
  }
  // Fallback: a per-view engine stashed at mount (used before the global is set).
  return view._belSemanticEngine || null;
}

export function navInfoAt(view, pos) {
  const eng = getEngine(view);
  if (!eng || typeof eng.navAt !== 'function') return null;
  try {
    return eng.navAt(pos);
  } catch (_) {
    return null;
  }
}

// ---- transient flash highlight ------------------------------------------
// A short-lived line wash on jump, so the eye can land.

const setFlashEffect = StateEffect.define();
const clearFlashEffect = StateEffect.define();

const flashLineMark = Decoration.line({ class: 'cm-bel-flash-line' });

const flashField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(clearFlashEffect)) {
        value = Decoration.none;
      } else if (e.is(setFlashEffect)) {
        const line = tr.state.doc.lineAt(e.value.from);
        value = Decoration.set([flashLineMark.range(line.from)]);
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

let flashTimer = null;
// Only the teardown is deferred; the flash rides the jump transaction (moveTo).
function scheduleFlashClear(view) {
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashTimer = null;
    if (view.dom.isConnected) view.dispatch({ effects: clearFlashEffect.of(null) });
  }, 750);
}

export function flashExtension() {
  return flashField;
}

// ---- navigation primitives ----------------------------------------------

function moveTo(view, range, { flash = true, select = false } = {}) {
  if (!range) return false;
  const anchor = range.from;
  const head = select ? range.to : range.from;
  // Caret move, scroll, and flash in one transaction so the line paints at its
  // final position with the flash class already on it — sweep starts frame one.
  view.dispatch({
    selection: { anchor, head },
    scrollIntoView: true,
    effects: flash ? setFlashEffect.of({ from: range.from, to: range.to }) : undefined,
  });
  view.focus();
  if (flash) scheduleFlashClear(view);
  return true;
}

// Jump to the declaration of the identifier at pos (or the cursor).
export function goToDefinition(view, pos) {
  const nav = navInfoAt(view, pos ?? view.state.selection.main.head);
  if (!nav || !nav.nameRange) return false;
  return moveTo(view, nav.nameRange, { flash: true });
}

// Reveal the binder for the variable at pos: its definition, or for a free
// implicit metavar the enclosing declaration header.
export function revealBinder(view, pos) {
  const at = pos ?? view.state.selection.main.head;
  const nav = navInfoAt(view, at);
  if (!nav) return false;
  if (nav.nameRange) return moveTo(view, nav.nameRange, { flash: true });
  if (nav.enclosingDeclarationId) {
    const eng = getEngine(view);
    const snap = eng && eng.getSnapshot && eng.getSnapshot();
    const sym = snap && snap.symbols && snap.symbols.symbolsById.get(nav.enclosingDeclarationId);
    if (sym && sym.nameRange) return moveTo(view, sym.nameRange, { flash: true });
  }
  return false;
}

// Apply a rename across the definition + every reference, as one undoable edit.
export function applyRename(view, symbolId, newName) {
  const eng = getEngine(view);
  if (!eng || typeof eng.renamePreview !== 'function') {
    return { ok: false, reason: 'no-engine' };
  }
  const preview = eng.renamePreview(symbolId, newName);
  if (!preview.ok) return preview;
  const changes = preview.edits.map((e) => ({ from: e.from, to: e.to, insert: e.insert }));
  view.dispatch({
    changes,
    userEvent: 'rename',
    scrollIntoView: true,
  });
  view.focus();
  return { ok: true, count: changes.length };
}

// Insert the best-known signature (reconstructed type if available, else
// source) as a comment above the declaration.
export function insertSignature(view, pos) {
  const at = pos ?? view.state.selection.main.head;
  const nav = navInfoAt(view, at);
  if (!nav || !nav.signature || nav.signature.type == null || !nav.declRange) {
    return { ok: false, reason: 'no-signature' };
  }
  const declLine = view.state.doc.lineAt(nav.declRange.from);
  const indent = (declLine.text.match(/^\s*/) || [''])[0];
  const text = `${indent}% ${nav.name} : ${nav.signature.type}\n`;
  view.dispatch({
    changes: { from: declLine.from, to: declLine.from, insert: text },
    userEvent: 'input.insert-signature',
    scrollIntoView: true,
  });
  view.focus();
  return { ok: true };
}
