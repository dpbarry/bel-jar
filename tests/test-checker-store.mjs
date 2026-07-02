import { ChangeSet } from '@codemirror/state';
import { createCheckerStore } from '../editor-src/semantic/checker-store.mjs';

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

console.log('OK checker store (stale carry, applyProgress hold)');
