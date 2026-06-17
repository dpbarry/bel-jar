import { LINT_TOOLTIP_FILTER } from './bel-hover.mjs';
import { diagnosticRowHighlight } from './bel-diag-gutter.mjs';

/** Shared CM lint options — BelJar-styled tooltips, not CM defaults. */
export function lintLinterOptions(extra = {}) {
  return { tooltipFilter: LINT_TOOLTIP_FILTER, ...extra };
}

/** Gutter row tint + anything else both editors need for identical lint chrome. */
export function lintPresentation() {
  return [diagnosticRowHighlight()];
}
