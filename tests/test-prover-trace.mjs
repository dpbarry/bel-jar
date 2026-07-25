// proveProgram trace enrichment: full tried text+rationale, hole snapshots, focus meta.
import {
  proveProgram,
  theoremUnderProof,
  certifyWaveSize,
} from '../js/editor-src/prover/prover-orchestrator.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const topDecl = 'rec top : [ |- a] -> [ |- b] =\n?\n;';
const thm = theoremUnderProof(topDecl);
const traceEntries = [];
let oracleCalls = 0;

const holeReportingOracle = async (c) => {
  oracleCalls += 1;
  const rep = [];
  c.split('\n').forEach((ln, i) => {
    const j = ln.indexOf('?');
    if (j >= 0 && /=>/.test(ln)) {
      rep.push(`File "input.bel", line ${i + 1}, column ${j + 1}: Hole number 0, <anonymous>\nGoal: [ |- b]`);
    }
  });
  return { ok: true, output: rep.length ? '## Holes ##\n' + rep.join('\n') : '' };
};

const res = await proveProgram(topDecl, thm, holeReportingOracle, {
  maxSteps: 3,
  collectTrace: true,
  onTraceEntry(entry) { traceEntries.push(entry); },
});

expect(res.steps && res.steps.length >= 1, 'at least one step recorded');
const st = res.steps[0];
expect(Array.isArray(st.holeCtx), 'step has holeCtx array');
expect(Array.isArray(st.holeMeta), 'step has holeMeta array');
expect(st.focus && typeof st.focus.score === 'number', 'step has focus metadata');

expect(res.trace && res.trace.length >= 1, 'trace array populated');
const te = res.trace[0];
expect(Array.isArray(te.holeCtx), 'trace entry has holeCtx');
expect(Array.isArray(te.tried), 'trace entry has tried list');
if (te.tried.length) {
  const row = te.tried[0];
  expect(row.kind && row.verdict, 'tried row has kind and verdict');
  expect('text' in row, 'tried row has full text');
  expect('rationale' in row, 'tried row has rationale field');
}

expect(traceEntries.length === res.trace.length, 'onTraceEntry streams live');

// Phase E instrument: checkCount equals Beluga certifications (spy), not guard skips.
expect(Number.isFinite(res.checkCount) && res.checkCount >= 1,
  `checkCount reported and ≥1 baseline (got ${res.checkCount})`);
expect(res.checkCount === oracleCalls,
  `checkCount mirrors oracle spy (${res.checkCount} vs ${oracleCalls})`);

// Phase E.1 — closing heads certify alone (wave does not inflate).
expect(certifyWaveSize({ text: '[ |- refl]' }, 5) === 1,
  'hole-free fill ⇒ wave 1');
expect(certifyWaveSize({ text: 'case x of\n| z => ?\n', closingPlan: false }, 5) === 5,
  'open hole ⇒ default wave');
expect(certifyWaveSize({ text: 'case x of\n| z => [ |- refl]\n', closingPlan: true }, 5) === 1,
  'closingPlan tag ⇒ wave 1');

console.log('OK test-prover-trace');
