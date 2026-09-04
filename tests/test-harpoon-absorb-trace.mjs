// After an Orca run is absorbed into a manual session, the node graph must still show the
// alternatives the search considered.
//
// `buildModel` pairs steps with trace entries BY INDEX, which is only valid when every step
// came from one search run. A manual session that absorbs a run concatenates auto steps onto
// manual ones and renders through `manualNa`, which passes `trace: null` — so the frontier,
// the ghosts and the alternatives tray silently disappeared for everything Orca did. That is
// the feature the surface exists for, so it is pinned here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { absorbAuto } from '../js/editor-src/prover/prover-manual.mjs';

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('  ok   ' + m); pass += 1; };

const thm = { name: 't', line: 1 };
const base = { code: 'rec t : nat = ?;', holes: [], focusIdx: 0, steps: [{ move: 'intro', manual: true }], stack: [], future: [] };

// An auto result: two advancing steps, plus a trace that also records a non-advancing probe.
const result = {
  code: 'rec t : nat = z;',
  complete: true,
  steps: [{ move: 'split' }, { move: 'fill' }],
  trace: [
    { advanced: true, tried: [{ kind: 'split', verdict: 'accepted' }, { kind: 'fill', verdict: 'rejected' }] },
    { advanced: false, tried: [{ kind: 'lemma', verdict: 'guard' }] },
    { advanced: true, tried: [{ kind: 'fill', verdict: 'accepted' }] },
  ],
};

const st = absorbAuto(base, result, thm);

ok(st.steps.length === 3, 'the manual step and both auto steps are present');
ok(st.steps[0].manual === true && !st.steps[0].traceEntry,
  'the pre-existing manual step is untouched and gains no trace entry');

// Only ADVANCED entries pair with steps; the non-advancing probe must not shift the pairing.
ok(st.steps[1].traceEntry && st.steps[1].traceEntry.tried.length === 2,
  'auto step 1 carries its own trace entry (2 alternatives)');
ok(st.steps[2].traceEntry && st.steps[2].traceEntry.tried.length === 1,
  'auto step 2 carries the entry from the next ADVANCED trace row, not the next row');

// Purity: the reducer must not mutate the result it was handed.
ok(!result.steps[0].traceEntry && !result.steps[1].traceEntry,
  'absorbAuto does not mutate the caller’s step objects');

// Position independence: the entry survives however many manual steps precede it.
const deeper = absorbAuto(
  { ...base, steps: [{ move: 'intro', manual: true }, { move: 'split', manual: true }] },
  result, thm);
ok(deeper.steps[2].traceEntry === st.steps[1].traceEntry,
  'the pairing does not depend on how many manual steps came first');

// A run with no trace still absorbs cleanly.
const noTrace = absorbAuto(base, { code: 'x', complete: true, steps: [{ move: 'fill' }] }, thm);
ok(noTrace.steps.length === 2 && !noTrace.steps[1].traceEntry,
  'a result with no trace absorbs without inventing one');

// ⛔ The pairing was first written inside `absorbAuto` alone, and was INERT in production:
// both surface call sites build a fresh `{ complete, code, steps }` and dropped `trace`, so
// the helper never received one. The unit test passed the whole time because it supplied a
// trace the real callers never sent. These assertions pin the wiring, not just the logic.
const src = fs.readFileSync(new URL('../js/harpoon/harpoon-lab-manual.mjs', import.meta.url), 'utf8');
const absorbCalls = src.match(/ed\.absorbAuto\(/g) || [];
ok(absorbCalls.length === 2, 'the surface has exactly the two absorbAuto call sites this pins');
ok((src.match(/trace: \(r\.trace \|\| null\)/g) || []).length === 1
  && (src.match(/trace: na\.trace \|\| null/g) || []).length === 1,
  'both absorbAuto call sites forward the run’s trace');
ok(/\.concat\(ed\.pairTrace \? ed\.pairTrace\(na\.steps \|\| \[\], na\.trace\)/.test(src),
  'the pause-resync path pairs the trace too, not only the finished-run path');

console.log('test-harpoon-absorb-trace: ' + pass + ' ok');
