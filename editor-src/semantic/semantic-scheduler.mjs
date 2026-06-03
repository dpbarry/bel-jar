/**
 * Smart Scheduler for Beluga Elaboration
 *
 * One warm Beluga session (via semantic-session) elaborates implicit metavariables
 * per *declaration* (batch %:get-type at all use-sites), not per hover.
 */

const BATCH_PER_TICK = 8;

export function createSemanticScheduler(engine, session) {
  const queue = [];
  const elaborating = new Set();
  const elaborated = new Set();
  const declWaiters = new Map();

  let cursorPosition = 0;
  let viewportRange = { from: 0, to: 0 };
  let scheduledRun = null;

  function priorityFor(declRange) {
    if (!declRange) return 1000;

    const { from, to } = declRange;
    const cursorDist = Math.min(
      Math.abs(from - cursorPosition),
      Math.abs(to - cursorPosition),
    );

    if (cursorDist < 200) return 0;
    if (from < viewportRange.to && to > viewportRange.from) return 1;
    return 2 + cursorDist / 1000;
  }

  function dequeueDecl(declId) {
    const idx = queue.findIndex((item) => item.declId === declId);
    if (idx >= 0) queue.splice(idx, 1);
  }

  function enqueue(declId, declRange) {
    if (elaborated.has(declId) || elaborating.has(declId)) return;

    const priority = priorityFor(declRange);
    const existing = queue.findIndex((item) => item.declId === declId);

    if (existing >= 0) {
      queue[existing].priority = Math.min(queue[existing].priority, priority);
    } else {
      queue.push({ declId, declRange, priority });
    }
  }

  function requeue() {
    queue.sort((a, b) => a.priority - b.priority);
    scheduleRun();
  }

  function markDirty(declId, declRange) {
    elaborated.delete(declId);
    enqueue(declId, declRange);
    requeue();
  }

  function onCursorMove(pos) {
    if (cursorPosition === pos) return;
    cursorPosition = pos;
    for (const item of queue) item.priority = priorityFor(item.declRange);
    requeue();
  }

  function onViewportChange(range) {
    if (viewportRange.from === range.from && viewportRange.to === range.to) return;
    viewportRange = range;
    for (const item of queue) item.priority = priorityFor(item.declRange);
    requeue();
  }

  function onDocChange() {
    if (!engine.stores || !engine.stores.symbols) return;

    const snapshot = engine.stores.symbols.getSnapshot();
    if (!snapshot || !snapshot.symbolsById) return;

    const dirty = typeof engine.dirtyFrontier === 'function' ? engine.dirtyFrontier() : [];
    for (const declId of dirty) {
      elaborated.delete(declId);
      const symbol = snapshot.symbolsById.get(declId);
      if (symbol && symbol.range) markDirty(declId, symbol.range);
    }

    requeue();
  }

  function waitForDecl(declId) {
    if (elaborated.has(declId)) return Promise.resolve({ ok: true });
    const w = declWaiters.get(declId);
    return w ? w.promise : Promise.resolve({ ok: false });
  }

  function beginDeclWait(declId) {
    let w = declWaiters.get(declId);
    if (!w) {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      w = { promise, resolve };
      declWaiters.set(declId, w);
    }
    return w;
  }

  async function elaborateDeclById(declId) {
    if (elaborated.has(declId)) return { ok: true, cached: true };
    if (elaborating.has(declId)) return waitForDecl(declId);

    const snapshot = engine.stores?.symbols?.getSnapshot();
    if (!snapshot || !snapshot.symbolsById) return null;

    const symbol = snapshot.symbolsById.get(declId);
    if (!symbol || !symbol.range) return null;

    const syntaxSnap = engine.stores.syntax.getSnapshot();
    const code = typeof engine.getCheckerCode === 'function'
      ? engine.getCheckerCode()
      : (syntaxSnap?.doc?.toString() || '');
    if (!code) return null;

    const sites = engine.stores.symbols.implicitSitesForDeclaration
      ? engine.stores.symbols.implicitSitesForDeclaration(declId)
      : [];
    if (sites.length === 0) {
      elaborated.add(declId);
      return { ok: true, skipped: true };
    }

    elaborating.add(declId);
    dequeueDecl(declId);
    const waiter = beginDeclWait(declId);

    try {
      const result = engine.elaborateDeclarationImplicits
        ? await engine.elaborateDeclarationImplicits(declId)
        : { ok: false, complete: false };

      // Settle after one honest attempt, even if not every site got a type.
      // Some sites are free metavars Beluga can't type at any occurrence; they
      // never report `complete`, and re-running them on every cursor/viewport
      // tick just saturates the single worker for no new information. Edits
      // clear `elaborated` for dirty decls (onDocChange), so changed code is
      // retried. Guard on ok !== false so a transient "engine/session not
      // ready" result still gets retried rather than wrongly settled.
      if (result && result.ok !== false) elaborated.add(declId);
      waiter.resolve(result);
      return result;
    } catch (error) {
      waiter.resolve({ ok: false, error });
      enqueue(declId, symbol.range);
      throw error;
    } finally {
      elaborating.delete(declId);
      declWaiters.delete(declId);
    }
  }

  async function elaborateNext() {
    while (queue.length > 0) {
      const item = queue[0];
      if (elaborated.has(item.declId)) {
        queue.shift();
        continue;
      }
      if (elaborating.has(item.declId)) return null;
      queue.shift();
      return elaborateDeclById(item.declId);
    }
    return null;
  }

  async function ensureElaborated(declId, declRange) {
    if (!declId) return null;
    if (elaborated.has(declId)) return { ok: true, cached: true };
    if (elaborating.has(declId)) return waitForDecl(declId);
    if (declRange) enqueue(declId, declRange);
    return elaborateDeclById(declId);
  }

  function scheduleRun() {
    if (scheduledRun) return;

    scheduledRun = setTimeout(async () => {
      scheduledRun = null;

      for (let i = 0; i < BATCH_PER_TICK && queue.length > 0; i++) {
        try {
          await elaborateNext();
        } catch (e) {
          console.error('[scheduler] elaboration failed:', e);
        }
      }

      if (queue.length > 0) scheduleRun();
    }, 50);
  }

  function invalidateAll() {
    elaborated.clear();
    elaborating.clear();
    queue.length = 0;
    declWaiters.clear();

    if (scheduledRun) {
      clearTimeout(scheduledRun);
      scheduledRun = null;
    }
  }

  function declInViewport(range) {
    return range.from < viewportRange.to && range.to > viewportRange.from;
  }

  function seedFromFrontier({ includeCleanViewport = true } = {}) {
    const snapshot = engine.stores?.symbols?.getSnapshot();
    if (!snapshot || !snapshot.symbolsById) return;

    const dirty = typeof engine.dirtyFrontier === 'function' ? engine.dirtyFrontier() : [];
    for (const declId of dirty) {
      elaborated.delete(declId);
      const symbol = snapshot.symbolsById.get(declId);
      if (symbol && symbol.range) enqueue(declId, symbol.range);
    }

    if (includeCleanViewport && engine.stores.symbols.implicitSitesForDeclaration) {
      for (const symbol of snapshot.globalSymbols) {
        if (!symbol.range || !declInViewport(symbol.range)) continue;
        const sites = engine.stores.symbols.implicitSitesForDeclaration(symbol.id);
        if (sites.length > 0) enqueue(symbol.id, symbol.range);
      }
    }

    requeue();
  }

  function seedAllImplicitDeclarations() {
    const snapshot = engine.stores?.symbols?.getSnapshot();
    if (!snapshot || !engine.stores.symbols.implicitSitesForDeclaration) return;

    for (const symbol of snapshot.globalSymbols) {
      if (!symbol.range) continue;
      const sites = engine.stores.symbols.implicitSitesForDeclaration(symbol.id);
      if (sites.length > 0) enqueue(symbol.id, symbol.range);
    }
    requeue();
  }

  function startBackground() {
    // Simmer the WHOLE file in the background so hints are warm before the
    // user hovers — minimal friction, not hover-only-lazy. This is safe now
    // that decls settle after one attempt (no perpetual re-elaboration): the
    // pass dispatches one decl at a time (scheduleRun awaits each step), is
    // ordered viewport/cursor-first by priorityFor, and each decl is visited
    // exactly once per content version. A hover preempts via direct
    // ensureElaborated and waits behind at most one in-flight job.
    seedAllImplicitDeclarations();
    scheduleRun();
  }

  function getStatus() {
    const sorted = queue.slice().sort((a, b) => a.priority - b.priority);
    return {
      queued: queue.length,
      nextDeclId: sorted.length ? sorted[0].declId : null,
      elaborating: elaborating.size,
      elaborated: elaborated.size,
    };
  }

  return {
    enqueue,
    markDirty,
    onCursorMove,
    onViewportChange,
    onDocChange,
    elaborateNext,
    ensureElaborated,
    invalidateAll,
    seedFromFrontier,
    seedAllImplicitDeclarations,
    startBackground,
    getStatus,
  };
}
