import { StateField, RangeSetBuilder } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';
import { isSuitePreludeBannerDiag } from './suite-prelude-banner.mjs';
import { isRenaming } from './bel-rename.mjs';

function marksFromDiags(diags, docLen) {
  const b = new RangeSetBuilder();
  const len = docLen ?? Infinity;
  const sorted = (diags || []).slice().sort((a, b) => a.from - b.from || a.to - b.to);
  for (const d of sorted) {
    if (d.from == null || d.to == null || d.to <= d.from) continue;
    const from = Math.max(0, Math.min(d.from, len));
    const to = Math.max(from, Math.min(d.to, len));
    if (to <= from) continue;
    if (d.severity !== 'error' && d.severity !== 'warning') continue;
    b.add(from, to, Decoration.mark({
      class: `cm-lintRange cm-lintRange-${d.severity}`,
    }));
  }
  return b.finish();
}

export function belugaDiagnosticsFromEngine(getEngine) {
  const eng = typeof getEngine === 'function' ? getEngine() : null;
  return eng?.getBelugaDiagnostics?.() || [];
}

// Beluga squiggles synced to the checker store on settlement tick — NOT through
// CM's async lint scheduler (delay + forceLinting races left underlines stale
// until the next click/selection repaint while the gutter already looked right).
export function belugaDiagnosticDecorations({ getEngine, getOverlayDiags = null, settlementTickField }) {
  const build = (state) => {
    if (isRenaming(state)) return Decoration.none;
    const extra = typeof getOverlayDiags === 'function' ? (getOverlayDiags() || []) : [];
    const base = belugaDiagnosticsFromEngine(getEngine);
    const overlay = extra.filter((d) => !isSuitePreludeBannerDiag(d));
    return marksFromDiags(overlay.length ? [...overlay, ...base] : base, state.doc.length);
  };

  return StateField.define({
    create: build,
    update(deco, tr) {
      if (isRenaming(tr.state)) return Decoration.none;
      const tick = settlementTickField ? (tr.state.field(settlementTickField, false) ?? 0) : 0;
      const prevTick = settlementTickField ? (tr.startState.field(settlementTickField, false) ?? 0) : 0;
      if (!tr.docChanged && tick === prevTick) return deco.map(tr.changes);
      return build(tr.state);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}
