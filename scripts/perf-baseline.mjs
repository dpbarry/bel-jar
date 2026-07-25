#!/usr/bin/env node
// Captures p50/p95 check-trace stats for a fixed edit sequence.
// Run in browser with BelJarPerf enabled, or use mock timings in CI.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCheckTrace } from '../js/editor-src/perf/check-trace.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const perf = createCheckTrace(true);
const phases = ['settle:total', 'settle:pass', 'dev-check:total', 'intel:typeAt', 'worker:load'];
for (let i = 0; i < 40; i += 1) {
  perf.beginEdit();
  perf.record('settle:debounce', 120 + (i % 5) * 30, { gen: i });
  const s = perf.spanStart('settle:total');
  perf.record('settle:pass', 80 + (i % 7) * 20, { pass: 1 });
  perf.spanEnd(s, { passes: 1 });
  perf.record('intel:typeAt', 5 + (i % 3) * 2);
}

const lines = ['# BelJar perf baseline', '', `Captured: ${new Date().toISOString()}`, '', '| Phase | p50 ms | p95 ms | n |', '|-------|--------|--------|---|'];
for (const phase of phases) {
  const st = perf.statsForPhase(phase);
  if (!st) {
    lines.push(`| ${phase} | — | — | 0 |`);
  } else {
    lines.push(`| ${phase} | ${st.p50.toFixed(1)} | ${st.p95.toFixed(1)} | ${st.count} |`);
  }
}
lines.push('', '_Synthetic seed run — replace with live `classical-processes` capture in browser._');
writeFileSync(join(root, 'docs', 'perf-baseline.md'), lines.join('\n'));
console.log('Wrote docs/perf-baseline.md');
