import { LINT_TOOLTIP_FILTER } from './bel-hover.mjs';
import { diagnosticRowHighlight, diagnosticGutterTooltips, suitePreludeRowWash, suitePreludeLineTooltips } from './bel-diag-gutter.mjs';

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
