// Guard the (b) change: intel seeding is VIEWPORT-scoped at mount, and scrolling
// PULLS intel for newly-visible declarations — so nothing is lost by not warming
// the whole file up front. This is the exact "what happens when you scroll?"
// worry, pinned as a test.
//
// Model: 6 implicit-bearing global decls stacked down a long doc. The viewport
// shows a window; startBackground must queue only the decls in that window, and
// onViewportChange + seedFromFrontier (what the editor calls on scroll) must
// queue the decls that scroll into view.

import { createSemanticScheduler } from '../js/editor-src/semantic/semantic-scheduler.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// 6 decls, 100 doc-units apart. Each has implicit sites (so it's elaboratable).
const DECLS = Array.from({ length: 6 }, (_, i) => ({
  id: `d${i}`,
  range: { from: i * 100, to: i * 100 + 60 },
}));

function makeEngine() {
  const symbolsById = new Map(DECLS.map((d) => [d.id, { id: d.id, range: d.range }]));
  return {
    stores: {
      symbols: {
        getSnapshot: () => ({ symbolsById, globalSymbols: DECLS.map((d) => ({ id: d.id, range: d.range })) }),
        // Every decl has one implicit site → all are elaboration candidates.
        implicitSitesForDeclaration: () => [{ name: 'X' }],
      },
      syntax: { getSnapshot: () => ({ doc: { toString: () => '' } }) },
    },
    dirtyFrontier: () => [],
    // No checker code / warmIntel in the fake — scheduler tolerates their absence.
    getCheckerCode: () => '',
    isSettlementReady: () => true,
  };
}

function queuedIds(sched) {
  // getStatus exposes count + next; use isPending per decl for the full set.
  return DECLS.filter((d) => sched.isPending(d.id)).map((d) => d.id);
}

// ── Mount: viewport shows decls d0,d1 only (doc 0..150) ──────────────────────
{
  const sched = createSemanticScheduler(makeEngine(), {});
  sched.onViewportChange({ from: 0, to: 150 }); // d0 (0-60), d1 (100-160) visible
  sched.startBackground();

  const q = queuedIds(sched);
  expect(q.includes('d0') && q.includes('d1'), `visible decls seeded at mount (got ${q.join(',')})`);
  expect(!q.includes('d3') && !q.includes('d5'),
    `off-screen decls NOT eagerly seeded at mount (got ${q.join(',')})`);
}

// ── Scroll down: viewport now shows d4,d5 (doc 380..600) ─────────────────────
{
  const sched = createSemanticScheduler(makeEngine(), {});
  sched.onViewportChange({ from: 0, to: 150 });
  sched.startBackground();
  const before = queuedIds(sched);
  expect(!before.includes('d5'), 'precondition: d5 not queued before scroll');

  // The editor, on viewportChanged, calls onViewportChange then seedFromFrontier.
  sched.onViewportChange({ from: 380, to: 600 }); // d4 (400-460), d5 (500-560)
  sched.seedFromFrontier({ includeCleanViewport: true });

  const after = queuedIds(sched);
  expect(after.includes('d4') && after.includes('d5'),
    `scrolling into view PULLS intel for newly-visible decls (got ${after.join(',')})`);
}

// ── Priority: the decl under the cursor is in the top tier (elaborated first) ─
// priorityFor gives a 200-unit cursor window priority 0; the decls here are 100
// apart, so several share the window — the point is the cursor decl is never
// starved behind off-screen work, which nextDeclId being one of the near decls
// confirms. Use a far cursor to show a distant decl does NOT win.
{
  const sched = createSemanticScheduler(makeEngine(), {});
  sched.onViewportChange({ from: 0, to: 600 }); // all visible
  sched.startBackground();
  sched.onCursorMove(30); // inside d0 (0-60); d5 (500-560) is far
  const next = sched.getStatus().nextDeclId;
  expect(next === 'd0',
    `cursor decl (d0) is elaborated first when the cursor is clearly in it (got ${next})`);
}

console.log('OK scheduler-viewport-frontier: mount seeds only visible decls; scroll pulls the rest; cursor wins priority');
