# Graph-driven checking

**Closed.** Beluga settlement is prefix-closed. Syntax intelligence (name env, incremental symbols/graph/lint) is closed: [`incremental.md`](incremental.md).

BelJar is the checker; Beluga is the certifier. The semantic graph knows which declarations are dirty, blocked, or syntax-faulted. The edit path hands Beluga a **compressed frontier** — not the whole development, and not a surgical `ideDeclType` per decl.

Full-program reload is rare (session start, prelude content change, explicit Run, `forceFull`). **Never modify `Beluga-W/src/core/`.** Shim only: `Beluga-W/src/web/beluga_web.ml`.

**Wrong path (reverted, do not rebuild):** Beluga `Store.snapshot` / `reconstruct_tail` / checkpoint ladders. That optimizes how often Beluga reloads *text*; it does not make BelJar intelligent.

---

## What shipped

```
Edit → parse → symbols + graph (DIRTY is a scheduler state, not a squiggle)
  → settlementTrigger (cosmetic | syntax-only | semantic)
  → debounce → checkResult(compressed frontier)
       keep dirty bodies; stub earlier rec/proof bodies to `?`; truncate after last kept
  → onComplete → markLoaded → scheduler ideDeclType / ideElaborate (intel slot)
```

Uncompressed `checkResult` only when prelude text changes, `forceFull`, or no frontier is wired. Empty frontier with a prior ready verdict for this version → no Beluga (`frontier-empty`). First mount with no dirty set certifies every top-level decl, still compressed.

`ideDeclType` / `ideElaborate` are **intel** (hover, reconstructed types), not the certify path. Graph DIRTY/BLOCKED must not appear in `documentDiagnostics` — local unresolved prelude names are a scheduling state, not a user error.

| Piece | Where |
|-------|--------|
| Dirty frontier drives default settlement | `semantic-graph.mjs`, `settlement.mjs` (`useFrontier`) |
| Signature-compressed development | `compress-development.mjs` |
| Cursor-first frontier | `getScopedFrontier` in `semantic-engine.mjs` |
| Syntax-only gate | `syntax-only-gate.mjs` |
| Content-hash checkContext | `editor-check-host.mjs` |
| Adaptive debounce | `settle-delay.mjs` (120–350 ms) |
| Superseded settle dropped | generation in `settlement.mjs`; worker kill if inflight ≥ 4 s |
| Intel after settle | `semantic-session.mjs`, `semantic-scheduler.mjs` |

---

## Gates (already exist)

| Test | Asserts |
|------|---------|
| `tests/test-frontier-certify.mjs` | Edit path is compressed `checkResult`; prelude change forces full bodies |
| `tests/test-compress-development.mjs` | Stubs preserve signatures and line count |
| `tests/test-settlement-graph.mjs` | Beluga ERRORING scoped to the decl; not inherited |
| `tests/test-settlement-dedup.mjs` | `markLoaded` skips a second `loadChecker` (intel session) |
| `tests/scope-parity.mjs` | Optional live Beluga: scoped vs full, no phantom errors, same-line faults. Not `npm test`. |

Do not add tests that demand `ideDeclType` as the certifier, DIRTY-as-squiggle, or a synthetic CI perf budget. The old `perf-baseline` script lied (hardcoded loop) and was deleted.

---

## Files

| Area | Path |
|------|------|
| Edit → graph | `js/editor-src/semantic/semantic-engine.mjs` |
| Dirty / status | `semantic/semantic-graph.mjs` |
| Compression | `semantic/compress-development.mjs`, `semantic/scoped-check.mjs` |
| Settlement | `semantic/settlement.mjs` |
| Intel session | `semantic/semantic-session.mjs` |
| Scheduler | `semantic/semantic-scheduler.mjs` |
| Check context | `semantic/editor-check-host.mjs` |
| Worker slots | `js/beluga/beluga-client.js` (checker vs intel) |
