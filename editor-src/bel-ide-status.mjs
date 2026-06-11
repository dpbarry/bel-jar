import { syntaxTree } from '@codemirror/language';

export function computeParseCoverage(state) {
  const docLen = state.doc.length;
  if (docLen <= 0) {
    return { parsed: 0, total: 0, percent: 100, complete: true };
  }
  const parsed = syntaxTree(state).length;
  const percent = Math.min(100, Math.round((parsed / docLen) * 100));
  return {
    parsed,
    total: docLen,
    percent,
    complete: parsed >= docLen,
  };
}

export function buildIdeStatusPresentation({
  diagnostics,
  parseCoverage = null,
  belugaPending = false,
} = {}) {
  const diags = diagnostics || [];
  const errors = diags.filter((d) => d.severity === 'error').length;
  const warnings = diags.filter((d) => d.severity === 'warning').length;
  const parsing = !!(parseCoverage && !parseCoverage.complete);
  const parsePercent = parsing ? parseCoverage.percent : null;

  const parts = [];
  if (parsing) parts.push(`Parsing ${parsePercent}%`);
  if (belugaPending) parts.push('Beluga checking…');
  if (errors > 0) parts.push(errors === 1 ? '1 error' : `${errors} errors`);
  else if (warnings > 0) parts.push(warnings === 1 ? '1 warning' : `${warnings} warnings`);
  if (!parts.length) parts.push('No errors');

  let liveState = 'clean';
  if (errors > 0) liveState = 'error';
  else if (warnings > 0) liveState = 'warning';
  else if (parsing) liveState = 'parsing';
  else if (belugaPending) liveState = 'checking';

  const tooltip = parts.join(' · ');
  return {
    liveState,
    tooltip,
    ariaLabel: tooltip,
    parsePercent,
    parsing,
    belugaPending,
    errors,
    warnings,
  };
}

export function updateIdeStatusDot(dot, diagnostics, options = {}) {
  if (!dot) return null;
  const pres = buildIdeStatusPresentation({
    diagnostics,
    parseCoverage: options.parseCoverage ?? null,
    belugaPending: options.belugaPending ?? false,
  });
  dot.setAttribute('data-live-state', pres.liveState);
  dot.setAttribute('data-tooltip', pres.tooltip);
  dot.setAttribute('aria-label', pres.ariaLabel);
  if (pres.parsing) dot.setAttribute('data-parsing', `${pres.parsePercent}%`);
  else dot.removeAttribute('data-parsing');
  if (pres.belugaPending) dot.setAttribute('data-beluga-checking', '');
  else dot.removeAttribute('data-beluga-checking');
  return pres;
}

// Banner for the dependency-graph window. ONLY surfaces a genuinely actionable
// fact: the parse is incomplete, so declarations past a point aren't in the graph
// yet. We deliberately do NOT surface the engine's internal `dirty` frontier here
// (it over-reports, never cleanly hits zero, and contradicts a green status dot —
// the same reason it's hidden from the inspector). When parse is complete, no
// banner; the green dot is the source of truth for "settled".
export function formatGlobalGraphStaleBanner({ parseCoverage, symbolCount }) {
  if (!parseCoverage || parseCoverage.complete) return '';
  const parts = [
    `Parse ${parseCoverage.percent}% — declarations after character ${parseCoverage.parsed} are not in the graph yet`,
  ];
  if (typeof symbolCount === 'number') {
    parts.push(`${symbolCount} symbol${symbolCount === 1 ? '' : 's'} indexed`);
  }
  return parts.join(' · ');
}
