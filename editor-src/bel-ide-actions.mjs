// Shared IDE actions (navigation, rename, inspector, signature insert).

import { syntaxTree } from '@codemirror/language';
import { forEachDiagnostic } from '@codemirror/lint';
import { EditorView, Decoration } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import { scrollIntoViewCenter } from './bel-viewport.mjs';
import { findProjectDefinition } from './project-prelude.mjs';

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

function clampPosInDoc(doc, pos) {
  const p = Math.floor(Number(pos));
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(p, doc.length));
}

function clampPos(view, pos) {
  return clampPosInDoc(view.state.doc, pos);
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
        const from = clampPosInDoc(tr.state.doc, e.value?.from);
        const line = tr.state.doc.lineAt(from);
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
  const from = clampPos(view, range.from);
  const to = clampPos(view, select ? range.to : range.from);
  const anchor = from;
  const head = select ? to : from;
  const scrollFx = scrollIntoViewCenter(from);
  view.dispatch({
    selection: { anchor, head },
    effects: flash ? [scrollFx, setFlashEffect.of({ from, to })] : scrollFx,
  });
  view.focus();
  if (flash) scheduleFlashClear(view);
  return true;
}

export function jumpToRange(view, range) {
  if (!range) return false;
  return moveTo(view, range, { flash: true });
}

// Syntax and Beluga linters can both squiggle the same line at different
// offsets — collapse those to one navigation stop per source line.
export function collapseErrorNavStops(errors) {
  const sorted = [...errors].sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.from - b.from || a.to - b.to;
  });
  const stops = [];
  for (const e of sorted) {
    const prev = stops[stops.length - 1];
    if (!prev || e.line !== prev.line) stops.push(e);
  }
  return stops;
}

export function pickNextErrorStop(stops, headLine) {
  if (!stops.length) return null;
  for (let i = 0; i < stops.length; i++) {
    if (headLine === stops[i].line) return stops[(i + 1) % stops.length];
  }
  for (let i = 0; i < stops.length; i++) {
    if (stops[i].line > headLine) return stops[i];
  }
  return stops[0];
}

export function jumpToNextError(view) {
  const errors = [];
  forEachDiagnostic(view.state, (d, from, to) => {
    if (d.severity !== 'error') return;
    const f = Number.isFinite(from) ? from : d.from;
    const t = Number.isFinite(to) ? to : f;
    if (!Number.isFinite(f)) return;
    errors.push({
      from: f,
      to: t,
      line: view.state.doc.lineAt(f).number,
    });
  });
  const stops = collapseErrorNavStops(errors);
  const headLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  const next = pickNextErrorStop(stops, headLine);
  if (!next) return false;
  return jumpToRange(view, next);
}

// Cross-file lookup: when the engine can't resolve the name in THIS document,
// search the file's development group (cfg-ordered same-folder files) for the
// definition. Returns { fileId, fileName, from, to, sourceRange } or null.
export function crossFileDefinitionAt(view, pos) {
  const at = pos ?? view.state.selection.main.head;
  const range = termRangeAt(view, at);
  if (!range) return null;
  const name = view.state.sliceDoc(range.from, range.to);
  if (!name) return null;
  const g = typeof window !== 'undefined' ? window : self;
  const P = g.BelJarPersist;
  if (!P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') return null;
  try {
    const hit = findProjectDefinition(
      P.listFiles(),
      P.getActiveFileId(),
      name,
      (id) => P.getFileText(id)
    );
    return hit ? { ...hit, sourceRange: range } : null;
  } catch (_) {
    return null;
  }
}

export function goToDefinition(view, pos) {
  const nav = navInfoAt(view, pos ?? view.state.selection.main.head);
  if (nav && nav.nameRange) return moveTo(view, nav.nameRange, { flash: true });
  // Not defined here — try the project group (jump opens the defining file).
  const cross = crossFileDefinitionAt(view, pos);
  if (!cross) return false;
  const g = typeof window !== 'undefined' ? window : self;
  if (typeof g.dispatchEvent !== 'function') return false;
  g.dispatchEvent(new CustomEvent('beljar:open-file-at', {
    detail: { fileId: cross.fileId, from: cross.from, to: cross.to },
  }));
  return true;
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
  const focus = changes.length ? changes[0].from : view.state.selection.main.head;
  view.dispatch({
    changes,
    userEvent: 'rename',
    effects: scrollIntoViewCenter(focus),
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
