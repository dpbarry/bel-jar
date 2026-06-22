import { RangeSetBuilder, StateField } from '@codemirror/state';
import { GutterMarker, ViewPlugin, gutterLineClass } from '@codemirror/view';
import { forEachDiagnostic } from '@codemirror/lint';

class DiagRowMarker extends GutterMarker {
  constructor(cls) {
    super();
    this.elementClass = cls;
  }
}

const errorMarker = new DiagRowMarker('cm-diagRow-error');
const warningMarker = new DiagRowMarker('cm-diagRow-warning');

function buildRowMarkers(state) {
  const severityByLine = new Map();
  forEachDiagnostic(state, (d, from) => {
    if (d.severity !== 'error' && d.severity !== 'warning') return;
    const lineFrom = state.doc.lineAt(from).from;
    if (severityByLine.get(lineFrom) === 'error') return;
    if (d.severity === 'error' || !severityByLine.has(lineFrom)) {
      severityByLine.set(lineFrom, d.severity);
    }
  });

  const builder = new RangeSetBuilder();
  for (const lineFrom of [...severityByLine.keys()].sort((a, b) => a - b)) {
    builder.add(lineFrom, lineFrom, severityByLine.get(lineFrom) === 'error' ? errorMarker : warningMarker);
  }
  return builder.finish();
}

const diagRowField = StateField.define({
  create: buildRowMarkers,
  update(value, tr) {
    if (!tr.docChanged && tr.effects.length === 0) return value;
    return buildRowMarkers(tr.state);
  },
  provide: (f) => gutterLineClass.from(f),
});

export function diagnosticRowHighlight() {
  return diagRowField;
}

// ── Gutter hover tooltip: all diagnostics on a line, anchored to its cell ─────
function diagnosticsByLine(state) {
  const map = new Map();
  forEachDiagnostic(state, (d, from) => {
    if (d.severity !== 'error' && d.severity !== 'warning') return;
    const line = state.doc.lineAt(from);
    const arr = map.get(line.number) || [];
    arr.push({ severity: d.severity, message: d.message || '', col: from - line.from + 1 });
    map.set(line.number, arr);
  });
  return map;
}

function summarizeDiags(errs, warns) {
  const parts = [];
  if (errs) parts.push(errs === 1 ? '1 error' : `${errs} errors`);
  if (warns) parts.push(warns === 1 ? '1 warning' : `${warns} warnings`);
  return parts.join(' · ') || 'Diagnostics';
}

const TIP_ATTRS = ['data-tooltip', 'data-tooltip-head', 'data-tooltip-errors', 'data-tooltip-placement'];

function applyGutterTips(view) {
  const g = typeof window !== 'undefined' ? window : null;
  const T = g && g.Tooltips;
  const byLine = diagnosticsByLine(view.state);
  const cells = view.dom.querySelectorAll('.cm-lineNumbers .cm-gutterElement');
  cells.forEach((cell) => {
    const n = parseInt(cell.textContent, 10);
    const diags = Number.isFinite(n) ? byLine.get(n) : null;
    if (!diags || !diags.length) {
      if (cell.hasAttribute('data-tooltip-errors')) {
        for (const a of TIP_ATTRS) cell.removeAttribute(a);
      }
      return;
    }
    const errs = diags.filter((d) => d.severity === 'error').length;
    cell.setAttribute('data-tooltip', summarizeDiags(errs, diags.length - errs));
    cell.setAttribute('data-tooltip-head', '');
    cell.setAttribute('data-tooltip-placement', 'right');
    cell.setAttribute('data-tooltip-errors', JSON.stringify(
      diags.map((d) => ({ line: d.col, msg: d.message, kind: d.severity })),
    ));
    if (T && typeof T.bind === 'function') T.bind(cell);
  });
}

const gutterTipPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.pending = false;
    this.schedule(view);
  }

  update(u) {
    if (u.docChanged || u.viewportChanged || u.transactions.some((t) => t.effects.length)) {
      this.schedule(u.view);
    }
  }

  // Defer to after CM has written the gutter DOM for the new state.
  schedule(view) {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      if (view.dom.isConnected) applyGutterTips(view);
    });
  }
});

export function diagnosticGutterTooltips() {
  return gutterTipPlugin;
}
