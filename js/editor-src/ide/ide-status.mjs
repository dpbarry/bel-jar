import { syntaxTree } from '@codemirror/language';
import { forEachDiagnostic } from '@codemirror/lint';

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

// Engine snapshot is authoritative for both syntax and Beluga findings — Beluga
// squiggles are decorations, not CM lint, and the checker store leads CM while
// settling.
export function collectStatusDiagnostics(view, engine) {
  if (engine && typeof engine.documentDiagnostics === 'function') {
    return engine.documentDiagnostics();
  }
  const diags = [];
  if (view?.state) forEachDiagnostic(view.state, (d) => diags.push(d));
  return diags;
}

export function buildIdeStatusPresentation({
  diagnostics,
  parseCoverage = null,
  belugaPending = false,
} = {}) {
  const diags = diagnostics || [];
  const errors = diags.filter((d) => d.severity === 'error').length;
  const warnings = diags.filter((d) => d.severity === 'warning').length;
  const staleErrors = diags.some((d) => d.severity === 'error' && d.stale);
  const parsing = !!(parseCoverage && !parseCoverage.complete);
  const parsePercent = parsing ? parseCoverage.percent : null;
  const checking = parsing || belugaPending;
  const recheckingErrors = belugaPending && (errors > 0 || staleErrors);

  const parts = [];
  if (parsing) parts.push(`Parsing ${parsePercent}%`);
  if (belugaPending) parts.push('Checking…');
  if (errors > 0) parts.push(errors === 1 ? '1 error' : `${errors} errors`);
  else if (staleErrors && belugaPending) parts.push('1 error');
  else if (warnings > 0) parts.push(warnings === 1 ? '1 warning' : `${warnings} warnings`);
  if (!parts.length) parts.push('Checked');

  let liveState = 'checked';
  if (recheckingErrors) liveState = 'error-checking';
  else if (errors > 0) liveState = 'error';
  else if (warnings > 0) liveState = 'warning';
  else if (checking) liveState = 'checking';

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

export function buildAuxStatusPresentation({ diagnostics, fileCount = 0 } = {}) {
  const diags = diagnostics || [];
  const errors = diags.filter((d) => d.severity === 'error').length;
  const warnings = diags.filter((d) => d.severity === 'warning').length;
  const problems = errors + warnings;

  const parts = [];
  if (problems > 0) {
    parts.push(problems === 1 ? '1 problem' : `${problems} problems`);
  } else if (fileCount > 0) {
    parts.push(`Suite: ${fileCount} file${fileCount === 1 ? '' : 's'}`);
  } else {
    parts.push('Empty suite');
  }

  let liveState = 'checked';
  if (errors > 0) liveState = 'error';
  else if (warnings > 0) liveState = 'warning';

  const tooltip = parts.join(' · ');
  return {
    liveState,
    tooltip,
    ariaLabel: tooltip,
    errors,
    warnings,
    problems,
    fileCount,
  };
}

function statusLintItems(lintItems) {
  if (!Array.isArray(lintItems)) return [];
  return lintItems.filter((d) => d && (d.kind === 'error' || d.kind === 'warning'));
}

// Skip no-op writes: redundant setAttribute still fires the tooltip attribute
// observer, which re-lays-out (and visibly re-pops) an open tooltip. The status
// settle watch refreshes every 120ms while checking, so this must be quiet.
function setAttrIfChanged(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function applyStatusDotTooltip(dot, pres, lintItems) {
  if (!dot) return;
  // The status strip spells the status out in words right beside its dot, so a
  // tooltip repeating it is noise. The hosting segment keeps its own.
  if (typeof dot.hasAttribute === 'function' && dot.hasAttribute('data-status-silent')) {
    setAttrIfChanged(dot, 'aria-label', pres.ariaLabel || pres.tooltip || '');
    dot.removeAttribute('data-tooltip');
    dot.removeAttribute('data-tooltip-head');
    dot.removeAttribute('data-tooltip-errors');
    return;
  }
  const T = typeof window !== 'undefined' ? window.Tooltips : null;
  const items = statusLintItems(lintItems);
  setAttrIfChanged(dot, 'aria-label', pres.ariaLabel || pres.tooltip || '');
  if (items.length) {
    setAttrIfChanged(dot, 'data-tooltip', pres.tooltip || '');
    setAttrIfChanged(dot, 'data-tooltip-head', '');
    setAttrIfChanged(dot, 'data-tooltip-errors', JSON.stringify(items));
    dot.removeAttribute('title');
    if (T?.bind) T.bind(dot);
    return;
  }
  dot.removeAttribute('data-tooltip-head');
  dot.removeAttribute('data-tooltip-errors');
  if (T?.set) {
    T.set(dot, pres.tooltip || '', { ariaLabel: pres.ariaLabel || pres.tooltip || '' });
  } else {
    dot.setAttribute('data-tooltip', pres.tooltip || '');
    if (T?.bind) T.bind(dot);
  }
}

export function updateAuxStatusDot(dot, diagnostics, options = {}) {
  if (!dot) return null;
  const pres = buildAuxStatusPresentation({
    diagnostics,
    fileCount: options.fileCount ?? 0,
  });
  dot.setAttribute('data-live-state', pres.liveState);
  applyStatusDotTooltip(dot, pres, options.lintItems);
  dot.removeAttribute('data-parsing');
  dot.removeAttribute('data-beluga-checking');
  return pres;
}

export function updateIdeStatusDot(dot, diagnostics, options = {}) {
  if (!dot) return null;
  const pres = buildIdeStatusPresentation({
    diagnostics,
    parseCoverage: options.parseCoverage ?? null,
    belugaPending: options.belugaPending ?? false,
  });
  dot.setAttribute('data-live-state', pres.liveState);
  applyStatusDotTooltip(dot, pres, options.lintItems);
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
// banner; the green dot is the source of truth for "checked".
export function formatGlobalGraphStaleBanner({ parseCoverage, symbolCount }) {
  if (!parseCoverage || parseCoverage.complete) return '';
  const parts = [
    `Parse ${parseCoverage.percent}% complete. Declarations after character ${parseCoverage.parsed} are not in the graph yet.`,
  ];
  if (typeof symbolCount === 'number') {
    parts.push(`${symbolCount} symbol${symbolCount === 1 ? '' : 's'} indexed`);
  }
  return parts.join(' · ');
}
