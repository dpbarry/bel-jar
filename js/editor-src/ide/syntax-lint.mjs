/**
 * IDE lint surface: syntax lint, Beluga linter, presentation, and squiggle decorations.
 */
import { syntaxTree } from '@codemirror/language';
import { linter } from '@codemirror/lint';
import { StateField, RangeSetBuilder } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';
import { walkTree } from '../tree-walk.mjs';
import { collectUndefinedApplicationDiags } from '../name-resolve.mjs';
import { lintQueryPragmaBounds, mergeDiagnostics as mergeDiagLists } from './query-diag.mjs';
import { timeSync } from '../perf/check-trace.mjs';
import { checkerSnapshot } from '../semantic/checker-snapshot.mjs';
import { LINT_TOOLTIP_FILTER } from './hover.mjs';
import { diagnosticRowHighlight, diagnosticGutterTooltips, suitePreludeRowWash, suitePreludeLineTooltips } from './diag-gutter.mjs';
import { isSuitePreludeBannerDiag } from '../semantic/suite-prelude-banner.mjs';
import { isRenaming } from './rename.mjs';

const _lintCache = new WeakMap();

export function syntaxLintTree(tree, doc) {
  const cached = _lintCache.get(tree);
  if (cached) return cached;
  return timeSync('syntaxLint', () => syntaxLintTreeInner(tree, doc));
}

function syntaxLintTreeInner(tree, doc) {
  const { blockAt, parseDiags } = timeSync('walkTree', () => walkTree(tree, doc));
  const queryDiags = lintQueryPragmaBounds(tree, doc);
  const appDiags = timeSync('undefAppDiags', () => collectUndefinedApplicationDiags(tree, doc));
  const merged = mergeDiagLists(mergeDiagLists(parseDiags, queryDiags), appDiags);
  for (const d of merged) {
    const hit = blockAt(d.from);
    if (hit) d.blockIndex = hit.index;
  }
  _lintCache.set(tree, merged);
  return merged;
}

export { syntaxLintTreeInner };

export function syntaxLint(view) {
  return syntaxLintTree(syntaxTree(view.state), view.state.doc);
}

/** Shared CM lint options — BelJar-styled tooltips, not CM defaults. */
export function lintLinterOptions(extra = {}) {
  return { tooltipFilter: LINT_TOOLTIP_FILTER, ...extra };
}

export function lintPresentation({ getEngine = null, getOverlayDiags = null, settlementTickField = null } = {}) {
  const getBelugaDiags = getEngine
    ? () => getEngine()?.getBelugaDiagnostics?.() || []
    : null;
  const overlay = typeof getOverlayDiags === 'function' ? getOverlayDiags : null;
  const allDiags = () => {
    const base = getBelugaDiags ? getBelugaDiags() : [];
    const extra = overlay ? (overlay() || []) : [];
    if (!extra.length) return base;
    return [...extra, ...base];
  };
  return [
    diagnosticRowHighlight({ getBelugaDiags: allDiags, getOverlayDiags: overlay, settlementTickField }),
    suitePreludeRowWash({ getOverlayDiags: overlay, settlementTickField }),
    suitePreludeLineTooltips({ getOverlayDiags: overlay, settlementTickField }),
    diagnosticGutterTooltips(allDiags),
  ];
}

export function checkerCodeForView(view, getCheckCode) {
  const doc = view.state.doc;
  if (typeof getCheckCode === 'function') {
    const snap = checkerSnapshot(syntaxTree(view.state), doc);
    return { code: getCheckCode(view), blocks: snap.blocks };
  }
  const snap = checkerSnapshot(syntaxTree(view.state), doc);
  return { code: snap.code, blocks: snap.blocks };
}

export function createBelugaLinter({
  getEngine = null,
  settlementTickField = null,
  delay = 400,
} = {}) {
  const ext = linter((view) => {
    if (settlementTickField) view.state.field(settlementTickField);
    const eng = typeof getEngine === 'function' ? getEngine(view) : null;
    if (!eng || typeof eng.getBelugaDiagnostics !== 'function') return [];
    return eng.getBelugaDiagnostics();
  }, lintLinterOptions({
    delay,
    needsRefresh: settlementTickField
      ? (update) => update.state.field(settlementTickField)
          !== update.startState.field(settlementTickField)
      : null,
  }));

  return ext;
}

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
      if (tick === prevTick) return deco.map(tr.changes);
      return build(tr.state);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}
