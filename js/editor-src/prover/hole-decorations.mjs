// Hole gutter highlight + F8 cycling (Theme C). The `?` glyph itself is coloured
// by the syntax highlighter (its own hole tag in language.mjs); the "look
// here" weight is the line-number cell of a CONFIRMED hole's line. Hole data comes
// from engine.getHoles() (parsed from the checker output, see hole-report.mjs).
import { gutterLineClass, GutterMarker, ViewPlugin } from '@codemirror/view';
import { StateField, RangeSet } from '@codemirror/state';
import { getEngine, jumpToRange } from '../ide/ide-actions.mjs';

// Doc offset of a hole's `?`, or null when the report is stale vs the live doc
// (the `?` moved or was edited away — hide rather than mis-anchor).
function holeOffset(doc, hole) {
  if (!hole || hole.line < 1 || hole.line > doc.lines) return null;
  const line = doc.line(hole.line);
  const off = line.from + Math.max(0, (hole.col || 1) - 1);
  if (off >= doc.length) return null;
  return doc.sliceString(off, off + 1) === '?' ? off : null;
}

// Ordered, doc-validated hole offsets (stale ones dropped).
function validHoleOffsets(doc, engine) {
  const offs = [];
  for (const hole of (engine.getHoles ? engine.getHoles() : [])) {
    const off = holeOffset(doc, hole);
    if (off != null) offs.push(off);
  }
  return [...new Set(offs)].sort((a, b) => a - b);
}

function holeHitOnLine(doc, engine, lineNum) {
  if (!engine?.getHoles) return null;
  for (const hole of engine.getHoles()) {
    if (hole.line !== lineNum) continue;
    const off = holeOffset(doc, hole);
    if (off != null) return { hole, from: off, to: off + 1 };
  }
  return null;
}

// ── Gutter highlight: the line-number cell of each hole's line ──────────────
class HoleGutterMarker extends GutterMarker {}
HoleGutterMarker.prototype.elementClass = 'cm-hole-gutter';
const holeGutterMarker = new HoleGutterMarker();

function holeGutterSet(doc, engine) {
  const seen = new Set();
  const ranges = [];
  for (const off of validHoleOffsets(doc, engine)) {
    const lineStart = doc.lineAt(off).from;
    if (seen.has(lineStart)) continue;
    seen.add(lineStart);
    ranges.push(holeGutterMarker.range(lineStart));
  }
  return RangeSet.of(ranges);
}

// A StateField (gutters read from state, not view plugins). Recomputes when the
// hole set changes — a settlement transaction fires the update and the signature
// shifts — or when an edit moves the `?`s. Caches by signature to stay cheap.
export function holeGutterHighlight(engine) {
  const sigOf = (doc) => validHoleOffsets(doc, engine).join('|');
  return StateField.define({
    create(state) { return { sig: sigOf(state.doc), set: holeGutterSet(state.doc, engine) }; },
    update(value, tr) {
      const sig = sigOf(tr.state.doc);
      if (sig === value.sig && !tr.docChanged) return value;
      return { sig, set: holeGutterSet(tr.state.doc, engine) };
    },
    provide: (f) => gutterLineClass.from(f, (v) => v.set),
  });
}

// ── Gutter hover tooltip + click to open Harpoon on the line's hole ─────────
const HOLE_GUTTER_TIP = 'Click to open Harpoon here';

// The outer gutter cell (fold strip) on the same row as `cell` — the geometry
// anchor for all gutter tooltips, so hovering the number cell and the chevron
// strip read as one tooltip pinned to the gutter's outer edge.
export function outerGutterRowCell(cell) {
  const fold = cell.closest?.('.cm-gutters')?.querySelector('.cm-gutter.cm-foldGutter');
  if (!fold) return null;
  const top = cell.getBoundingClientRect().top;
  for (const c of fold.children) {
    if (!c.classList.contains('cm-gutterElement')) continue;
    if (c.style.visibility === 'hidden') continue; // gutter spacer
    if (Math.abs(c.getBoundingClientRect().top - top) < 2) return c;
  }
  return null;
}

// Attributes only — hover show/hide is owned by the gutter-band controller
// (gutter-tip-band.mjs), never by per-cell bindings.
export function bindHoleGutterTip(cell) {
  if (!cell?.classList?.contains('cm-hole-gutter')) return;
  if (cell.hasAttribute('data-tooltip-errors')) return;
  const T = typeof window !== 'undefined' ? window.Tooltips : null;
  cell.setAttribute('data-tooltip', HOLE_GUTTER_TIP);
  cell.setAttribute('data-tooltip-placement', 'right');
  T?.setRectEl?.(cell, outerGutterRowCell);
}

function clearHoleGutterTip(cell) {
  if (cell.getAttribute('data-tooltip') !== HOLE_GUTTER_TIP) return;
  cell.removeAttribute('data-tooltip');
  cell.removeAttribute('data-tooltip-placement');
}

function foldCellHasChevron(cell) {
  return !!cell?.querySelector?.('.cm-bel-foldmarker');
}

function applyHoleGutterTips(view) {
  const cells = view.dom.querySelectorAll(
    '.cm-lineNumbers .cm-gutterElement.cm-hole-gutter, .cm-foldGutter .cm-gutterElement.cm-hole-gutter',
  );
  cells.forEach((cell) => {
    // Fold-toggle cells keep chevron behaviour; don't advertise Harpoon there.
    if (cell.closest('.cm-foldGutter') && foldCellHasChevron(cell)) {
      clearHoleGutterTip(cell);
      return;
    }
    bindHoleGutterTip(cell);
  });
}

function openHarpoonFromGutter(view, engine, lineNum) {
  const hit = holeHitOnLine(view.state.doc, engine, lineNum);
  if (!hit) return;
  const lab = typeof window !== 'undefined' ? window.Harpoon : null;
  if (lab?.openFromHole) lab.openFromHole(view, engine, hit);
}

function lineNumFromGutterClick(view, e, cell) {
  if (cell.closest('.cm-lineNumbers')) {
    const n = parseInt(cell.textContent, 10);
    return Number.isFinite(n) ? n : null;
  }
  const block = view.lineBlockAtHeight(e.clientY - view.documentTop);
  if (!block) return null;
  return view.state.doc.lineAt(block.from).number;
}

function holeGutterInteractionPlugin(engine) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.pending = false;
      this.onClick = (e) => this.handleClick(e);
      view.dom.addEventListener('click', this.onClick);
      this.schedule(view);
    }

    destroy() {
      this.view.dom.removeEventListener('click', this.onClick);
    }

    handleClick(e) {
      const cell = e.target.closest?.(
        '.cm-lineNumbers .cm-gutterElement.cm-hole-gutter, .cm-foldGutter .cm-gutterElement.cm-hole-gutter',
      );
      if (!cell || !this.view.dom.contains(cell)) return;
      // Chevron present → leave the click to CodeMirror's fold toggle.
      if (cell.closest('.cm-foldGutter') && foldCellHasChevron(cell)) return;
      const n = lineNumFromGutterClick(this.view, e, cell);
      if (n == null) return;
      const eng = getEngine(this.view) || engine;
      if (!holeHitOnLine(this.view.state.doc, eng, n)) return;
      e.preventDefault();
      e.stopPropagation();
      openHarpoonFromGutter(this.view, eng, n);
    }

    update(u) {
      if (u.docChanged || u.viewportChanged || u.transactions.some((t) => t.effects.length)) {
        this.schedule(u.view);
      }
    }

    schedule(view) {
      if (this.pending) return;
      this.pending = true;
      requestAnimationFrame(() => {
        this.pending = false;
        if (view.dom.isConnected) applyHoleGutterTips(view);
      });
    }
  });
}

export function holeGutterInteraction(engine) {
  return holeGutterInteractionPlugin(engine);
}

export function cycleHole(view, engine, dir) {
  const offs = validHoleOffsets(view.state.doc, engine);
  if (!offs.length) return false;
  const cur = view.state.selection.main.head;
  let target;
  if (dir > 0) target = offs.find((o) => o > cur);
  else {
    const before = offs.filter((o) => o < cur);
    target = before[before.length - 1];
  }
  if (target == null) target = dir > 0 ? offs[0] : offs[offs.length - 1];
  jumpToRange(view, { from: target, to: target + 1 });
  return true;
}

// F8 / Shift+F8 — move the cursor to the next / previous hole (wrapping), with the
// standard flash-jump. Returns false when there are no holes (lets the key fall
// through). Prefer Keybindings editor keymap in the main editor.
export function holeCycleKeymap(engine) {
  return [
    { key: 'F8', run: (view) => cycleHole(view, engine, 1), shift: (view) => cycleHole(view, engine, -1) },
  ];
}
