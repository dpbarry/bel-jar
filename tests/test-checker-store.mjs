import { ChangeSet } from '@codemirror/state';
import { createCheckerStore } from '../js/editor-src/semantic/checker-store.mjs';

function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

const store = createCheckerStore();
store.applyResult({
  syntaxVersion: 1,
  checkerFp: 'fp1',
  ok: false,
  belugaDiagnostics: [{ severity: 'error', message: 'Identifier ?0 is unbound.', from: 10, to: 12 }],
  rawOutput: 'err',
});
expect(store.settleState() === 'ready', 'ready after applyResult');

store.invalidate(2);
const afterInv = store.getSnapshot();
expect(afterInv.state === 'stale', 'invalidate with prior errors → stale');
expect(afterInv.belugaDiagnostics.length === 1 && afterInv.belugaDiagnostics[0].stale === true,
  'invalidate marks diagnostics stale');

store.markChecking(2, 'fp2');
store.applyProgress({
  syntaxVersion: 2,
  checkerFp: 'fp2',
  belugaDiagnostics: [],
  rawOutput: '',
});
const mid = store.getSnapshot();
expect(mid.state === 'checking', 'applyProgress keeps checking state');
expect(mid.belugaDiagnostics.length === 1 && mid.belugaDiagnostics[0].stale === true,
  'empty applyProgress does not blink stale diagnostics away');

store.applyProgress({
  syntaxVersion: 2,
  checkerFp: 'fp2',
  belugaDiagnostics: [{ severity: 'error', message: 'new error', from: 20, to: 22 }],
  rawOutput: 'err2',
});
const fresh = store.getSnapshot();
expect(fresh.belugaDiagnostics.length === 1 && fresh.belugaDiagnostics[0].message === 'new error',
  'non-empty applyProgress replaces stale diagnostics');

store.invalidate(3);
store.markChecking(3, 'fp3');
store.applyProgress({
  syntaxVersion: 3,
  checkerFp: 'fp3',
  belugaDiagnostics: [],
  replace: true,
  rawOutput: '',
});
expect(store.getSnapshot().belugaDiagnostics.length === 0,
  'replace:true applyProgress clears stale diagnostics');

store.applyResult({
  syntaxVersion: 4,
  checkerFp: 'fp4',
  ok: false,
  belugaDiagnostics: [{ severity: 'error', message: 'stays', from: 1, to: 2 }],
  rawOutput: 'err',
});
store.invalidate(5);
store.holdVerdict();
const held = store.getSnapshot();
expect(held.state === 'ready', 'holdVerdict restores ready');
expect(held.syntaxVersion === 5, 'holdVerdict keeps adopted syntax version');
expect(held.belugaDiagnostics.length === 1 && held.belugaDiagnostics[0].stale !== true,
  'holdVerdict clears stale flag');

const idleStore = createCheckerStore();
idleStore.invalidate(1);
expect(idleStore.getSnapshot().state === 'idle', 'fresh invalidate without prior errors → idle');
idleStore.holdVerdict();
expect(idleStore.getSnapshot().state === 'idle', 'holdVerdict is no-op on idle');

store.adoptSyntaxVersion(99);
expect(store.getSnapshot().syntaxVersion === 99, 'adoptSyntaxVersion bumps checker version');

store.applyResult({
  syntaxVersion: 99,
  checkerFp: 'fp',
  ok: false,
  belugaDiagnostics: [{ severity: 'error', message: 'x', from: 5, to: 7 }],
  rawOutput: '',
});
const changes = ChangeSet.of([{ from: 0, to: 0, insert: '  ' }], 20);
store.remapDiagnostics(changes);
const remapped = store.getSnapshot().belugaDiagnostics[0];
expect(remapped.from === 7 && remapped.to === 9, 'remapDiagnostics follows cosmetic insert');

// ── a ready verdict never carries an unverified finding ──────────────────────
//
// ⛔ This is the phantom-error bug. `stale` means "the document moved under this
// diagnostic and nothing has re-checked it". Settlement's frontier-empty path
// used to copy the previous findings straight into applyResult, which stamps
// them `ready` — so an error from before an undo became an authoritative verdict
// on a document that no longer contained it, and nothing ever cleared it: the
// file had to be closed and reopened. A ready snapshot must only ever hold what
// the checker actually confirmed.
{
  const s = createCheckerStore();
  s.applyResult({
    syntaxVersion: 1,
    checkerFp: 'fp1',
    ok: false,
    belugaDiagnostics: [{ severity: 'error', message: 'real', from: 0, to: 1 }],
    rawOutput: '',
  });
  s.invalidate(2);
  const carried = s.getSnapshot().belugaDiagnostics;
  expect(carried.length === 1 && carried[0].stale === true, 'invalidate marks findings stale');

  // Exactly what the buggy fast path did: hand the stale set back as a verdict.
  s.applyResult({
    syntaxVersion: 2,
    checkerFp: 'fp2',
    ok: true,
    belugaDiagnostics: carried,
    rawOutput: '',
  });
  const after = s.getSnapshot();
  expect(after.state === 'ready', 'applyResult still lands a ready verdict');
  expect(after.belugaDiagnostics.length === 0,
    'a stale finding cannot survive into a ready verdict');
  expect(after.ok === true && after.belugaDiagnostics.length === 0,
    'ok and the diagnostic list agree');

  // A verified finding passes through untouched.
  s.applyResult({
    syntaxVersion: 3,
    checkerFp: 'fp3',
    ok: false,
    belugaDiagnostics: [{ severity: 'error', message: 'verified', from: 0, to: 1 }],
    rawOutput: '',
  });
  expect(s.getSnapshot().belugaDiagnostics.length === 1, 'verified findings are kept');
}

// ⛔ A finding whose text the edit consumed is DROPPED, not carried inverted.
//
// The two ends map with opposite association so the range shrinks around an
// edit rather than swallowing it. When an edit REPLACES a span that ENCLOSES
// the finding — select a line and paste over it — `from` maps to the end of the
// insertion and `to` to its start, and the range comes out backwards. The
// squiggle layer skips an inverted range; the COUNTS did not, so the strip and
// the tab dot kept reporting an error with nothing on screen to point at, and
// "go to next problem" aimed at a position that no longer meant anything.
{
  const s = createCheckerStore();
  s.applyResult({
    syntaxVersion: 1,
    checkerFp: 'fp',
    ok: false,
    belugaDiagnostics: [
      { severity: 'error', message: 'pasted over', from: 6, to: 8 },
      { severity: 'error', message: 'further down', from: 20, to: 24 },
    ],
    rawOutput: '',
  });
  // Replace [5,9) — which strictly encloses [6,8) — with three characters.
  s.remapDiagnostics(ChangeSet.of([{ from: 5, to: 9, insert: 'abc' }], 40));
  const left = s.getSnapshot().belugaDiagnostics;
  expect(left.length === 1, 'the finding inside the replaced span is dropped');
  expect(left[0].message === 'further down', 'and the untouched one survives');
  expect(left[0].from < left[0].to, 'with a range that is still a range');
  expect(left[0].from === 19, 'shifted by what the edit changed');
}

// A pure deletion collapses the range to nothing, which is equally a phantom.
{
  const s = createCheckerStore();
  s.applyResult({
    syntaxVersion: 1,
    checkerFp: 'fp',
    ok: false,
    belugaDiagnostics: [{ severity: 'error', message: 'deleted', from: 5, to: 9 }],
    rawOutput: '',
  });
  s.remapDiagnostics(ChangeSet.of([{ from: 4, to: 10, insert: '' }], 40));
  expect(s.getSnapshot().belugaDiagnostics.length === 0, 'a collapsed finding is dropped too');
}


console.log('OK checker store (stale carry, applyProgress hold, no stale in a ready verdict)');
