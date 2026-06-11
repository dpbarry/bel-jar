// Shared IDE actions (navigation, rename, inspector, signature insert).

import { syntaxTree } from '@codemirror/language';
import { EditorView, Decoration } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';

export function getEngine(view) {
  const g = typeof window !== 'undefined' ? window : self;
  const ed = g.BelJarCurrentEditor;
  if (ed && typeof ed.getSemanticEngine === 'function') {
    const eng = ed.getSemanticEngine();
    if (eng) return eng;
  }
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

const IDENT_NODES = new Set(['LowerIdentifier', 'UpperIdentifier']);

function syntaxIdentRangeAt(state, pos) {
  for (const bias of [1, -1]) {
    const n = syntaxTree(state).resolveInner(pos, bias);
    if (n && IDENT_NODES.has(n.name)) {
      const p = n.parent;
      if (p && (p.name === 'ParameterVariable' || p.name === 'SubstitutionVariable')) {
        return { from: p.from, to: p.to };
      }
      return { from: n.from, to: n.to };
    }
    if (n && (n.name === '#' || n.name === '$')) {
      const p = n.parent;
      if (p && (p.name === 'ParameterVariable' || p.name === 'SubstitutionVariable')) {
        return { from: p.from, to: p.to };
      }
      const sib = n.nextSibling;
      if (sib && IDENT_NODES.has(sib.name)) return { from: n.from, to: sib.to };
    }
  }
  return null;
}

export function termRangeAt(view, pos) {
  const nav = navInfoAt(view, pos);
  if (nav?.reference?.range) {
    const { from, to } = nav.reference.range;
    if (from < to) return { from, to };
  }
  if (nav?.nameRange) {
    const { from, to } = nav.nameRange;
    if (from < to) return { from, to };
  }
  return syntaxIdentRangeAt(view.state, pos);
}

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

function moveTo(view, range, { flash = true, select = false } = {}) {
  if (!range) return false;
  const anchor = range.from;
  const head = select ? range.to : range.from;
  view.dispatch({
    selection: { anchor, head },
    scrollIntoView: true,
    effects: flash ? setFlashEffect.of({ from: range.from, to: range.to }) : undefined,
  });
  view.focus();
  if (flash) scheduleFlashClear(view);
  return true;
}

export function goToDefinition(view, pos) {
  const nav = navInfoAt(view, pos ?? view.state.selection.main.head);
  if (!nav || !nav.nameRange) return false;
  return moveTo(view, nav.nameRange, { flash: true });
}

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

export function revealInInspector(view, pos) {
  const at = pos ?? view.state.selection.main.head;
  if (at !== view.state.selection.main.head) {
    view.dispatch({ selection: { anchor: at, head: at } });
  }
  const g = typeof window !== 'undefined' ? window : self;
  if (typeof g.dispatchEvent === 'function') {
    g.dispatchEvent(new CustomEvent('beljar:open-inspector', { detail: { pos: at } }));
  }
  view.focus();
  return true;
}

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
