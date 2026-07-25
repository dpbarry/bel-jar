// Shared IDE actions (navigation, rename, inspector, signature insert).

import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { forEachDiagnostic } from '@codemirror/lint';
import { EditorView, Decoration } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import { scrollIntoViewCenter, resolveReferenceJump, notifyInspectorJump } from './viewport.mjs';
import { logJumpSameFile } from './jump-log.mjs';
import { findProjectDefinition, findProjectDefinitions, findGroupDefinition } from '../semantic/project-prelude.mjs';

export function getEngine(view) {
  const g = typeof window !== 'undefined' ? window : self;
  const ed = g.CurrentEditor;
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
  ensureSyntaxTree(view.state, Math.min(view.state.doc.length, pos + 1), 100);
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
  if (!range || !view?.dom?.isConnected) return false;
  const from = clampPos(view, range.from);
  const spanEnd = range.to != null && range.to > range.from ? range.to : range.from;
  const to = clampPos(view, select ? spanEnd : range.from);
  const anchor = from;
  const head = select ? to : from;
  const scrollFx = scrollIntoViewCenter(from);
  view.dispatch({
    selection: { anchor, head },
    effects: flash ? [scrollFx, setFlashEffect.of({ from, to })] : scrollFx,
  });
  view.focus();
  if (flash) scheduleFlashClear(view);
  notifyInspectorJump(view, from);
  return true;
}

export function jumpToReference(view, range, name, meta = {}) {
  if (!range || !view?.dom?.isConnected) return false;
  const resolved = resolveReferenceJump(
    view.state.doc,
    range,
    name,
    meta.line ?? range.line,
    meta.col ?? range.col,
  );
  logJumpSameFile(view, { ...range, name, ...resolved }, 'jumpToReference');
  return jumpToRange(view, resolved);
}

export function jumpToRange(view, range) {
  if (!range || !view?.dom?.isConnected) return false;
  if (range.name) {
    return jumpToReference(view, range, range.name, range);
  }
  logJumpSameFile(view, range, 'jumpToRange');
  const select = range.to != null && range.to > range.from;
  return moveTo(view, range, { flash: true, select });
}

// Preview a range without committing: scroll it into view and flash the line,
// but leave the caret and focus where they are. Backs find-refs hover-preview; a
// click is still required to actually jump (and close the menu).
export function peekRange(view, range) {
  if (!range) return false;
  const from = clampPos(view, range.from);
  view.dispatch({ effects: [scrollIntoViewCenter(from), setFlashEffect.of({ from, to: from })] });
  scheduleFlashClear(view);
  return true;
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

export function pickPrevErrorStop(stops, headLine) {
  if (!stops.length) return null;
  for (let i = 0; i < stops.length; i++) {
    if (headLine === stops[i].line) {
      return stops[(i - 1 + stops.length) % stops.length];
    }
  }
  for (let i = stops.length - 1; i >= 0; i--) {
    if (stops[i].line < headLine) return stops[i];
  }
  return stops[stops.length - 1];
}

function collectErrorStops(view) {
  const errors = [];
  const push = (d, from, to) => {
    if (d.severity !== 'error' && d.severity !== 'warning') return;
    const f = Number.isFinite(from) ? from : d.from;
    const t = Number.isFinite(to) ? to : f;
    if (!Number.isFinite(f)) return;
    errors.push({
      from: f,
      to: t,
      line: view.state.doc.lineAt(f).number,
      severity: d.severity,
      message: d.message || '',
    });
  };
  forEachDiagnostic(view.state, (d, from, to) => push(d, from, to));
  const eng = getEngine(view);
  // documentDiagnostics includes the suite-prelude overlay banner (anchored on
  // line 1) — getBelugaDiagnostics deliberately excludes it, which left the
  // status dot red with nothing to jump to when the banner was the only error.
  if (eng?.documentDiagnostics) {
    for (const d of eng.documentDiagnostics()) push(d, d.from, d.to);
  } else if (eng?.getBelugaDiagnostics) {
    for (const d of eng.getBelugaDiagnostics()) push(d, d.from, d.to);
  }
  return collapseErrorNavStops(errors);
}

// Cycle the cursor through the document's problems — errors AND warnings — so
// the status dot navigates a warning-only file too, not just errors.
export function jumpToNextError(view) {
  const stops = collectErrorStops(view);
  const headLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  const next = pickNextErrorStop(stops, headLine);
  if (!next) return false;
  return jumpToRange(view, next);
}

export function jumpToPrevError(view) {
  const stops = collectErrorStops(view);
  const headLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  const prev = pickPrevErrorStop(stops, headLine);
  if (!prev) return false;
  return jumpToRange(view, prev);
}

export function listDocumentProblems(view) {
  return collectErrorStops(view);
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
  const P = g.Persist;
  if (!P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') return null;
  try {
    const hit = findProjectDefinition(
      P.listFiles(),
      P.getActiveFileId(),
      name,
      (id) => P.getFileText(id)
    ) ?? findGroupDefinition(
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

// All cross-file definitions of the name at `pos`, each carrying the queried
// token's `sourceRange`. Empty when the name resolves locally or is unknown.
export function crossFileDefinitionsAt(view, pos) {
  const at = pos ?? view.state.selection.main.head;
  const range = termRangeAt(view, at);
  if (!range) return [];
  const name = view.state.sliceDoc(range.from, range.to);
  if (!name) return [];
  const g = typeof window !== 'undefined' ? window : self;
  const P = g.Persist;
  if (!P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') return [];
  try {
    return findProjectDefinitions(P.listFiles(), P.getActiveFileId(), name, (id) => P.getFileText(id))
      .map((hit) => ({ ...hit, name, sourceRange: range }));
  } catch (_) {
    return [];
  }
}

function openFileAtDef(hit) {
  const g = typeof window !== 'undefined' ? window : self;
  if (typeof g.dispatchEvent !== 'function') return false;
  g.dispatchEvent(new CustomEvent('beljar:open-file-at', {
    detail: { fileId: hit.fileId, from: hit.from, to: hit.to },
  }));
  return true;
}

// When one name is defined in several visible files, let the user pick which to
// jump to instead of silently choosing the closest one. Falls back to a direct
// jump when the Menu primitive isn't available.
function chooseCrossFileTarget(view, at, targets) {
  const g = typeof window !== 'undefined' ? window : self;
  if (typeof g.Menu === 'undefined' || typeof g.Menu.openContext !== 'function') {
    return openFileAtDef(targets[0]);
  }
  let x; let y;
  const c = view.coordsAtPos(at);
  if (c) { x = c.left; y = c.bottom; }
  else {
    const r = view.dom.getBoundingClientRect();
    x = r.left + 40; y = r.top + 40;
  }
  const name = targets[0].name || '';
  g.Menu.openContext({
    x, y, side: 'bottom', align: 'start',
    items: [
      { type: 'section', label: `${name} — ${targets.length} definitions` },
      ...targets.map((t) => ({
        label: t.fileName.split('/').pop(),
        onSelect: () => openFileAtDef(t),
      })),
    ],
  });
  return true;
}

export function goToDefinition(view, pos) {
  const at = pos ?? view.state.selection.main.head;
  const nav = navInfoAt(view, at);
  if (nav && nav.nameRange) return moveTo(view, nav.nameRange, { flash: true });
  // Not defined here — try the project group (jump opens the defining file).
  // Several visible files may define the name: disambiguate rather than guess.
  const targets = crossFileDefinitionsAt(view, at);
  if (!targets.length) return false;
  if (targets.length === 1) return openFileAtDef(targets[0]);
  return chooseCrossFileTarget(view, at, targets);
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
