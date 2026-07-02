import { EditorState, Text } from '@codemirror/state';
import {
  buildAuxStatusPresentation,
  buildIdeStatusPresentation,
  computeParseCoverage,
  formatGlobalGraphStaleBanner,
  updateIdeStatusDot,
} from '../editor-src/bel-ide-status.mjs';
import { lintTooltipItemsFromDiagnostics } from '../editor-src/bel-diag-gutter.mjs';
import { beluga } from '../editor-src/bel-language.mjs';

function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

const presParsing = buildIdeStatusPresentation({
  diagnostics: [],
  parseCoverage: { parsed: 40, total: 100, percent: 40, complete: false },
  belugaPending: false,
});
expect(presParsing.liveState === 'checking', 'incomplete parse → checking state');
expect(presParsing.tooltip === 'Parsing 40%', 'parsing-only tooltip');

const presBoth = buildIdeStatusPresentation({
  diagnostics: [],
  parseCoverage: { parsed: 40, total: 100, percent: 40, complete: false },
  belugaPending: true,
});
expect(presBoth.liveState === 'checking', 'parsing + beluga → checking');
expect(presBoth.tooltip === 'Parsing 40% · Checking…', 'compound tooltip');

const presCheck = buildIdeStatusPresentation({
  diagnostics: [],
  parseCoverage: { parsed: 100, total: 100, percent: 100, complete: true },
  belugaPending: true,
});
expect(presCheck.liveState === 'checking', 'complete parse + beluga → checking');
expect(presCheck.tooltip === 'Checking…', 'beluga-only tooltip');

const presStaleErr = buildIdeStatusPresentation({
  diagnostics: [{ severity: 'error' }],
  parseCoverage: { parsed: 100, total: 100, percent: 100, complete: true },
  belugaPending: true,
});
expect(presStaleErr.liveState === 'error-checking', 'stale error + beluga → error-checking dot');
expect(presStaleErr.tooltip.includes('Checking'), 'error-checking tooltip mentions checking');
expect(presStaleErr.tooltip.includes('1 error'), 'error-checking tooltip keeps error count');

const presStaleFlag = buildIdeStatusPresentation({
  diagnostics: [{ severity: 'error', message: 'old', stale: true }],
  parseCoverage: { parsed: 100, total: 100, percent: 100, complete: true },
  belugaPending: true,
});
expect(presStaleFlag.liveState === 'error-checking', 'stale-flag error + beluga → error-checking');

const banner = formatGlobalGraphStaleBanner({
  parseCoverage: { parsed: 500, total: 2000, percent: 25, complete: false },
  symbolCount: 12,
});
expect(banner.includes('Parse 25%'), 'banner mentions parse percent when incomplete');
expect(banner.includes('12 symbols indexed'), 'banner mentions symbol count');
expect(!/awaiting/i.test(banner), 'banner never surfaces the internal dirty/refresh count');

const bannerClean = formatGlobalGraphStaleBanner({
  parseCoverage: { parsed: 100, total: 100, percent: 100, complete: true },
  symbolCount: 12,
});
expect(bannerClean === '', 'no banner when the parse is complete (green-dot consistent)');

const state = EditorState.create({
  doc: 'LF nat : type.\n',
  extensions: [beluga()],
});
const cov = computeParseCoverage(state);
expect(cov.total === state.doc.length, 'coverage total matches doc');
expect(cov.percent === 100, 'small file parses completely');

const auxClean = buildAuxStatusPresentation({ diagnostics: [], fileCount: 3 });
expect(auxClean.liveState === 'checked', 'cfg checked → checked state');
expect(auxClean.tooltip === 'Suite: 3 files', 'cfg clean tooltip names suite size');

const auxBroken = buildAuxStatusPresentation({
  diagnostics: [{ severity: 'error' }, { severity: 'warning' }],
  fileCount: 2,
});
expect(auxBroken.liveState === 'error', 'cfg errors → error state');
expect(auxBroken.tooltip === '2 problems', 'cfg problems tooltip');

const belDoc = Text.of('LF t : type.\n  | bad\n;\n'.split('\n'));
const belFrom = belDoc.line(2).from + 4;
const belItems = lintTooltipItemsFromDiagnostics([
  { severity: 'error', message: 'Type mismatch', from: belFrom },
], belDoc);
expect(belItems.length === 1 && belItems[0].msg === 'Type mismatch', 'engine beluga diag → tooltip item');
expect(belItems[0].line === 2 && belItems[0].prefix === 'row ', 'status-dot tooltip uses row number');

const dot = {
  attrs: new Map(),
  setAttribute(k, v) { this.attrs.set(k, String(v)); },
  removeAttribute(k) { this.attrs.delete(k); },
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
};
updateIdeStatusDot(dot, [
  { severity: 'error', message: 'Type mismatch', from: belFrom },
], {
  parseCoverage: { parsed: 100, total: 100, percent: 100, complete: true },
  belugaPending: true,
  lintItems: belItems,
});
expect(dot.getAttribute('data-live-state') === 'error-checking', 'lint list wired on error-checking dot');
expect(dot.getAttribute('data-tooltip-errors')?.includes('Type mismatch'), 'error-checking dot carries lint JSON');

console.log('OK ide status (parse/check dot, aux suite dot, stale banner, coverage)');
