import { EditorState } from '@codemirror/state';
import {
  buildIdeStatusPresentation,
  computeParseCoverage,
  formatGlobalGraphStaleBanner,
} from '../editor-src/bel-ide-status.mjs';
import { beluga } from '../editor-src/bel-language.mjs';

function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

const presParsing = buildIdeStatusPresentation({
  diagnostics: [],
  parseCoverage: { parsed: 40, total: 100, percent: 40, complete: false },
  belugaPending: false,
});
expect(presParsing.liveState === 'parsing', 'incomplete parse → parsing state');
expect(presParsing.tooltip === 'Parsing 40%', 'parsing-only tooltip');

const presBoth = buildIdeStatusPresentation({
  diagnostics: [],
  parseCoverage: { parsed: 40, total: 100, percent: 40, complete: false },
  belugaPending: true,
});
expect(presBoth.liveState === 'parsing', 'parsing wins over checking for dot color');
expect(presBoth.tooltip === 'Parsing 40% · Beluga checking…', 'compound tooltip');

const presCheck = buildIdeStatusPresentation({
  diagnostics: [],
  parseCoverage: { parsed: 100, total: 100, percent: 100, complete: true },
  belugaPending: true,
});
expect(presCheck.liveState === 'checking', 'complete parse + beluga → checking');
expect(presCheck.tooltip === 'Beluga checking…', 'beluga-only tooltip');

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

console.log('OK ide status (parse/check dot, stale banner, coverage)');
