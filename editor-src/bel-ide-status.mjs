export function updateIdeStatusDot(dot, diagnostics, { belugaPending = false } = {}) {
  if (!dot) return;
  const diags = diagnostics || [];
  const errors = diags.filter((d) => d.severity === 'error').length;
  const warnings = diags.filter((d) => d.severity === 'warning').length;

  if (errors > 0) {
    dot.setAttribute('data-live-state', 'error');
    const label = errors === 1 ? '1 error' : `${errors} errors`;
    dot.setAttribute('data-tooltip', label);
    dot.setAttribute('aria-label', label);
    return;
  }
  if (warnings > 0) {
    dot.setAttribute('data-live-state', 'warning');
    const label = warnings === 1 ? '1 warning' : `${warnings} warnings`;
    dot.setAttribute('data-tooltip', label);
    dot.setAttribute('aria-label', label);
    return;
  }
  if (belugaPending) {
    dot.setAttribute('data-live-state', 'checking');
    dot.setAttribute('data-tooltip', 'Checking…');
    dot.setAttribute('aria-label', 'Checking');
    return;
  }
  dot.setAttribute('data-live-state', 'clean');
  dot.setAttribute('data-tooltip', 'No errors');
  dot.setAttribute('aria-label', 'No errors');
}
