import { createCheckTrace } from '../js/editor-src/perf/check-trace.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const perf = createCheckTrace(true);
const id = perf.spanStart('test:span');
perf.spanEnd(id, { ok: true });
perf.record('test:record', 12.5);
perf.workerJob('load', 40, { slot: 'checker' });

const stats = perf.statsForPhase('test:record');
expect(stats && stats.count === 1, 'record stats');
expect(perf.events.length >= 2, 'events captured');
perf.record('edit:trigger', 0, { trigger: 'cosmetic', version: 1 });
const trig = perf.events.find((e) => e.phase === 'edit:trigger');
expect(trig && trig.trigger === 'cosmetic', 'trigger tag on edit:trigger events');
console.log('OK test-check-trace');
