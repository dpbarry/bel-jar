// Multi-file analog of the single-file derive frontier: once a suite is settled,
// a use of a prelude term whose type the checker must supply (B1) is elaborated
// in the BACKGROUND (deriveFrontier), so the hover is instant instead of firing
// an on-demand elaboration. Mirrors test-semantic-derive-types-v2's harness.
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const upd = (e, src) => e.update(parser.parse(src), Text.of(src.split('\n')));

// Prelude file a.bel defines `x` with no extractable signature (a let-binding);
// active file b.bel uses it. Suite t.cfg = [a, b], active = b.
const PRELUDE = 'let x = [ |- z];';
const ACTIVE = 'let use = x;';
const xPos = ACTIVE.indexOf('x;');

function installProject() {
  globalThis.BelJarPersist = {
    listFiles: () => [
      { id: 'a', name: 'p/a.bel' },
      { id: 'b', name: 'p/b.bel' },
      { id: 'c', name: 'p/t.cfg' },
    ],
    getActiveFileId: () => 'b',
    getFileText: (id) => ({ a: PRELUDE, b: ACTIVE, c: 'a.bel\nb.bel\n' }[id] || ''),
    getActiveCfgForDir: (dir) => (dir === 'p' ? 'p/t.cfg' : null),
  };
}

// typeAt is the only session capability — exercises the cross-file branch (the
// decl branch needs ideDeclType, which we omit). Count calls for termination.
let calls = 0;
const session = {
  typeAt: async () => { calls += 1; return { ok: true, type: '[ |- nat]' }; },
};

installProject();
try {
  const e = createSemanticEngine({ session });
  upd(e, ACTIVE);

  // Before pre-warm: the use is recognised as cross-file but its type is not yet
  // cached, so the hover is not instant.
  const before = e.hoverAt(xPos);
  expect(before && before.status === 'pending',
    `before pre-warm the cross-file hover should be pending, got ${before && before.status}`);

  // Background pre-warm (what the scheduler runs once the suite is settled).
  const more = await e.deriveFrontier();
  expect(calls >= 1, 'deriveFrontier should elaborate the cross-file use via the checker');
  expect(more === false, 'one batch covers the single use → no remaining work');

  // After pre-warm: the hover is served synchronously from cache.
  const after = e.hoverAt(xPos);
  expect(after && after.status === 'ready',
    `after pre-warm the cross-file hover should be instant, got ${after && after.status}`);
  expect(after.type === '[ |- nat]',
    `pre-warmed hover shows the checker's reconstructed type, got ${after && after.type}`);

  // Termination: a second pass must not re-query the already-cached use.
  const callsAfter = calls;
  const more2 = await e.deriveFrontier();
  expect(calls === callsAfter, `cached use must not be re-elaborated, got ${calls} vs ${callsAfter}`);
  expect(more2 === false, 'no remaining cross-file work after everything is cached');
} finally {
  delete globalThis.BelJarPersist;
}

console.log('OK cross-file pre-warm (settled suite background-elaborates B1 uses → instant hover)');
