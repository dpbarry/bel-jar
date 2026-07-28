import { RangeSetBuilder, StateField } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, ViewPlugin, gutterLineClass } from '@codemirror/view';
import { diagnosticCount, forEachDiagnostic } from '@codemirror/lint';
import { bindHoleGutterTip, outerGutterRowCell } from '../prover/hole-decorations.mjs';
import { isSuitePreludeBannerDiag } from '../semantic/suite-prelude-banner.mjs';
import { isRenaming } from './rename.mjs';
import { timeSync } from '../perf/check-trace.mjs';

class DiagRowMarker extends GutterMarker {
  constructor(cls) {
    super();
    this.elementClass = cls;
  }
}

const errorMarker = new DiagRowMarker('cm-diagRow-error');
const warningMarker = new DiagRowMarker('cm-diagRow-warning');
const preludeMarker = new DiagRowMarker('cm-diagRow-prelude');

function mergeSeverity(severityByLine, lineFrom, severity) {
  if (severityByLine.get(lineFrom) === 'error') return;
  if (severity === 'error' || !severityByLine.has(lineFrom)) {
    severityByLine.set(lineFrom, severity);
  }
}

function suitePreludeRows(state, getOverlayDiags) {
  const rows = [];
  if (typeof getOverlayDiags !== 'function') return rows;
  const len = state.doc.length;
  for (const d of getOverlayDiags() || []) {
    if (!isSuitePreludeBannerDiag(d) || d.from == null) continue;
    if (d.from < 0 || d.from > len) continue;
    const line = state.doc.lineAt(d.from);
    rows.push({ line, message: d.message || '', severity: d.severity || 'error' });
  }
  return rows;
}

function buildRowMarkers(state, getBelugaDiags = null, getOverlayDiags = null) {
  const severityByLine = new Map();
  const preludeLines = new Set();
  for (const { line } of suitePreludeRows(state, getOverlayDiags)) {
    preludeLines.add(line.from);
    severityByLine.set(line.from, 'error');
  }
  if (!isRenaming(state)) {
    forEachDiagnostic(state, (d, from) => {
      if (d.severity !== 'error' && d.severity !== 'warning') return;
      if (from < 0 || from > state.doc.length) return;
      mergeSeverity(severityByLine, state.doc.lineAt(from).from, d.severity);
    });
    if (typeof getBelugaDiags === 'function') {
      for (const d of getBelugaDiags()) {
        if (isSuitePreludeBannerDiag(d)) continue;
        if (d.severity !== 'error' && d.severity !== 'warning') continue;
        if (d.from == null || d.from < 0 || d.from > state.doc.length) continue;
        mergeSeverity(severityByLine, state.doc.lineAt(d.from).from, d.severity);
      }
    }
  }

  const builder = new RangeSetBuilder();
  for (const lineFrom of [...severityByLine.keys()].sort((a, b) => a - b)) {
    const sev = severityByLine.get(lineFrom);
    const marker = preludeLines.has(lineFrom)
      ? preludeMarker
      : (sev === 'error' ? errorMarker : warningMarker);
    builder.add(lineFrom, lineFrom, marker);
  }
  return builder.finish();
}

function buildSuitePreludeRowWash(state, getOverlayDiags) {
  const builder = new RangeSetBuilder();
  const seen = new Set();
  for (const { line } of suitePreludeRows(state, getOverlayDiags)) {
    if (seen.has(line.from)) continue;
    seen.add(line.from);
    builder.add(line.from, line.from, Decoration.line({ class: 'cm-suite-prelude-row' }));
  }
  return builder.finish();
}

export function diagnosticRowHighlight({ getBelugaDiags = null, getOverlayDiags = null, settlementTickField = null } = {}) {
  return StateField.define({
    create(state) {
      return buildRowMarkers(state, getBelugaDiags, getOverlayDiags);
    },
    update(value, tr) {
      const tickChanged = settlementTickField
        && tr.state.field(settlementTickField, false) !== tr.startState.field(settlementTickField, false);
      if (!tr.docChanged && !tickChanged && tr.effects.length === 0
        && diagnosticCount(tr.startState) === diagnosticCount(tr.state)) {
        return value;
      }
      return timeSync('diagRowMarkers', () => buildRowMarkers(tr.state, getBelugaDiags, getOverlayDiags));
    },
    provide: (f) => gutterLineClass.from(f),
  });
}

export function suitePreludeRowWash({ getOverlayDiags = null, settlementTickField = null } = {}) {
  return StateField.define({
    create(state) {
      return buildSuitePreludeRowWash(state, getOverlayDiags);
    },
    update(deco, tr) {
      const tickChanged = settlementTickField
        && tr.state.field(settlementTickField, false) !== tr.startState.field(settlementTickField, false);
      if (!tr.docChanged && !tickChanged && tr.effects.length === 0) return deco.map(tr.changes);
      return buildSuitePreludeRowWash(tr.state, getOverlayDiags);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

// ── Gutter hover tooltip: all diagnostics on a line, anchored to its cell ─────
function diagnosticsByLine(state, getBelugaDiags = null) {
  const map = new Map();
  const len = state.doc.length;
  const push = (d, from) => {
    if (d.severity !== 'error' && d.severity !== 'warning') return;
    if (from < 0 || from > len) return;
    const line = state.doc.lineAt(from);
    const arr = map.get(line.number) || [];
    arr.push({ severity: d.severity, message: d.message || '', col: from - line.from + 1 });
    map.set(line.number, arr);
  };
  forEachDiagnostic(state, (d, from) => push(d, from));
  if (typeof getBelugaDiags === 'function') {
    for (const d of getBelugaDiags()) {
      if (d.from == null) continue;
      push(d, d.from);
    }
  }
  return map;
}

function summarizeDiags(errs, warns) {
  const parts = [];
  if (errs) parts.push(errs === 1 ? '1 error' : `${errs} errors`);
  if (warns) parts.push(warns === 1 ? '1 warning' : `${warns} warnings`);
  return parts.join(' · ') || 'Diagnostics';
}

export function lintTooltipHead(items) {
  if (!items || !items.length) return '';
  const errs = items.filter((d) => d.kind === 'error').length;
  return summarizeDiags(errs, items.length - errs);
}

export function lintTooltipItemsFromDiagnostics(diags, doc) {
  if (!doc || !diags?.length) return [];
  const items = [];
  const seen = new Set();
  const len = doc.length;
  for (const d of diags) {
    if (d.severity !== 'error' && d.severity !== 'warning') continue;
    if (d.from == null || d.from < 0 || d.from > len) continue;
    const lineInfo = doc.lineAt(d.from);
    const key = `${lineInfo.number}:${d.severity}:${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      line: lineInfo.number,
      prefix: 'row ',
      msg: d.message || '',
      kind: d.severity,
    });
  }
  items.sort((a, b) => a.line - b.line);
  return items;
}

export function lintTooltipItemsFromState(state, extraDiags = null) {
  const diags = [];
  forEachDiagnostic(state, (d, from) => diags.push({ ...d, from }));
  if (extraDiags) {
    for (const d of extraDiags) {
      if (d?.from != null) diags.push(d);
    }
  }
  return lintTooltipItemsFromDiagnostics(diags, state.doc);
}

const TIP_ATTRS = ['data-tooltip', 'data-tooltip-tone', 'data-tooltip-head', 'data-tooltip-errors', 'data-tooltip-placement'];
const GUTTER_TIP_MEASURE_KEY = 'bel-gutter-diag-tips';
const PRELUDE_TIP_ATTR = 'data-suite-prelude-tip';

function preludeRowLineEl(view) {
  return view.contentDOM.querySelector('.cm-line.cm-suite-prelude-row');
}

function preludeRowAtEvent(view, e, getOverlayDiags) {
  const rows = suitePreludeRows(view.state, getOverlayDiags);
  if (!rows.length) return null;
  const content = view.contentDOM.getBoundingClientRect();
  const right = view.scrollDOM.getBoundingClientRect().right;
  if (e.clientX < content.left || e.clientX > right) return null;
  const lineEl = preludeRowLineEl(view);
  if (!lineEl) return null;
  const r = lineEl.getBoundingClientRect();
  if (e.clientY < r.top || e.clientY > r.bottom) return null;
  return rows[0];
}

function positionPreludeTipAnchor(view, anchor) {
  const lineEl = preludeRowLineEl(view);
  if (!lineEl) return false;
  const lineRect = lineEl.getBoundingClientRect();
  const editor = view.dom.getBoundingClientRect();
  const content = view.contentDOM.getBoundingClientRect();
  const scroller = view.scrollDOM.getBoundingClientRect();
  anchor.style.display = 'block';
  anchor.style.left = `${content.left - editor.left}px`;
  anchor.style.top = `${lineRect.top - editor.top}px`;
  anchor.style.width = `${scroller.right - content.left}px`;
  anchor.style.height = `${lineRect.height}px`;
  return true;
}

function bindPreludeTipAnchor(anchor, row, T) {
  const msg = row.message || '';
  const tone = row.severity === 'warning' ? 'warning' : 'error';
  if (anchor.getAttribute(PRELUDE_TIP_ATTR)
    && anchor.getAttribute('data-tooltip') === msg
    && anchor.getAttribute('data-tooltip-tone') === tone) {
    return;
  }
  anchor.setAttribute(PRELUDE_TIP_ATTR, '1');
  anchor.setAttribute('data-tooltip', msg);
  anchor.setAttribute('data-tooltip-tone', tone);
  anchor.setAttribute('data-tooltip-placement', 'bottom');
  anchor.setAttribute('data-tooltip-no-track', '');
  anchor.removeAttribute('data-tooltip-head');
  anchor.removeAttribute('data-tooltip-errors');
  T?.bind?.(anchor);
}

export function suitePreludeLineTooltips({ getOverlayDiags = null, settlementTickField = null } = {}) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.activeRow = null;
      this.anchor = document.createElement('div');
      this.anchor.className = 'cm-suite-prelude-tip-anchor';
      this.anchor.setAttribute('aria-hidden', 'true');
      view.dom.appendChild(this.anchor);
      this.onMove = (e) => this.handleMove(e);
      this.onLeave = () => this.clearHover();
      this.onScroll = () => this.clearHover();
      view.dom.addEventListener('mousemove', this.onMove);
      view.dom.addEventListener('mouseleave', this.onLeave);
      view.scrollDOM.addEventListener('scroll', this.onScroll);
    }

    destroy() {
      if (this._refreshRaf) cancelAnimationFrame(this._refreshRaf);
      this.view.dom.removeEventListener('mousemove', this.onMove);
      this.view.dom.removeEventListener('mouseleave', this.onLeave);
      this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
      this.clearHover();
      this.anchor.remove();
    }

    clearHover() {
      this.activeRow = null;
      this.anchor.style.display = 'none';
      const T = typeof window !== 'undefined' && window.Tooltips;
      T?.hideImmediate?.();
    }

    handleMove(e) {
      const row = preludeRowAtEvent(this.view, e, getOverlayDiags);
      const T = typeof window !== 'undefined' && window.Tooltips;
      if (!row) {
        if (this.activeRow != null) this.clearHover();
        return;
      }
      if (this.activeRow === row.line.number) return;
      if (!positionPreludeTipAnchor(this.view, this.anchor)) return;
      bindPreludeTipAnchor(this.anchor, row, T);
      this.activeRow = row.line.number;
      T?.show?.(this.anchor);
    }

    refreshActive() {
      if (this.activeRow == null) return;
      const row = suitePreludeRows(this.view.state, getOverlayDiags)
        .find((r) => r.line.number === this.activeRow);
      if (!row) {
        this.clearHover();
        return;
      }
      positionPreludeTipAnchor(this.view, this.anchor);
    }

    scheduleRefresh() {
      if (this._refreshRaf) return;
      this._refreshRaf = requestAnimationFrame(() => {
        this._refreshRaf = 0;
        if (this.view.dom.isConnected) this.refreshActive();
      });
    }

    update(u) {
      const tickChanged = settlementTickField
        && u.state.field(settlementTickField, false) !== u.startState.field(settlementTickField, false);
      if (this.activeRow != null && tickChanged) {
        const still = suitePreludeRows(u.state, getOverlayDiags)
          .some((r) => r.line.number === this.activeRow);
        if (!still) {
          this.clearHover();
          return;
        }
      }
      if (u.viewportChanged) {
        this.clearHover();
        return;
      }
      if (u.geometryChanged || tickChanged) this.scheduleRefresh();
    }
  });
}

function scheduleGutterTips(view, getBelugaDiags = null) {
  view.requestMeasure({
    key: GUTTER_TIP_MEASURE_KEY,
    read: () => null,
    write: (_measure, cmView) => {
      const v = cmView ?? view;
      if (v?.dom?.isConnected) applyGutterTips(v, getBelugaDiags);
    },
  });
}

// Attributes only — gutter cells get no per-cell hover bindings; the
// gutter-band controller (gutter-tip-band.mjs) shows/hides from pointer
// position over the whole gutter strip.
export function bindStackedDiagnosticTip(el, diags, { placement = 'right' } = {}) {
  if (!el || !diags?.length) return;
  const errs = diags.filter((d) => (d.kind || d.severity) === 'error').length;
  el.setAttribute('aria-label', summarizeDiags(errs, diags.length - errs));
  el.setAttribute('data-tooltip-placement', placement);
  el.setAttribute('data-tooltip-errors', JSON.stringify(
    diags.map((d) => ({
      msg: d.msg || d.message || '',
      kind: d.kind || d.severity || 'error',
    })),
  ));
  el.removeAttribute('data-tooltip');
  el.removeAttribute('data-tooltip-head');
  el.removeAttribute('data-tooltip-tone');
}

function clearGutterTips(view) {
  const T = typeof window !== 'undefined' && window.Tooltips;
  const cells = view.dom.querySelectorAll('.cm-lineNumbers .cm-gutterElement');
  cells.forEach((cell) => {
    if (cell.hasAttribute('data-tooltip-errors')) {
      for (const a of TIP_ATTRS) cell.removeAttribute(a);
      bindHoleGutterTip(cell);
    }
  });
  T?.hideImmediate?.();
}

function applyGutterTips(view, getBelugaDiags = null) {
  if (isRenaming(view.state)) {
    clearGutterTips(view);
    return;
  }
  const g = typeof window !== 'undefined' ? window : null;
  const T = g && g.Tooltips;
  const byLine = diagnosticsByLine(view.state, getBelugaDiags);
  const cells = view.dom.querySelectorAll('.cm-lineNumbers .cm-gutterElement');
  cells.forEach((cell) => {
    const n = parseInt(cell.textContent, 10);
    const diags = Number.isFinite(n) ? byLine.get(n) : null;
    if (!diags || !diags.length) {
      if (cell.hasAttribute('data-tooltip-errors')) {
        for (const a of TIP_ATTRS) cell.removeAttribute(a);
        bindHoleGutterTip(cell);
      }
      return;
    }
    bindStackedDiagnosticTip(cell, diags, { placement: 'right' });
    T?.setRectEl?.(cell, outerGutterRowCell);
  });
}

export function diagnosticGutterTooltips(getBelugaDiags = null) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      scheduleGutterTips(view, getBelugaDiags);
    }

    update(u) {
      if (u.docChanged || u.viewportChanged || u.geometryChanged || u.selectionSet
        || diagnosticCount(u.state) !== diagnosticCount(u.startState)
        || u.transactions.some((t) => t.effects.length > 0)) {
        scheduleGutterTips(u.view, getBelugaDiags);
      }
    }
  });
}
