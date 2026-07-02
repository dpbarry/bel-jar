# Fast checking — plan of record (BelJar-first)

> **Last updated:** 2026-07-01  
> **Audience:** Next agent session. Read this before touching settlement, Beluga workers, or OCaml.  
> **Supersedes** any prior “fast incremental checking” plan that described Beluga store snapshots, prefix/tail reconstruction, or checkpoint ladders.

---

## 0. One paragraph

**BelJar is the checker; Beluga is the certifier.** The semantic graph (`editor-src/semantic/`) already knows which declarations are dirty, blocked, or syntax-faulted. The goal is to **use that graph to call Beluga as little as possible**: one bootstrap load per stable checker fingerprint, then **surgical** `ideDeclType` / `ideElaborate` / fragment queries on the dirty frontier — not whole-file `checkResult` on every keystroke. Full-program Beluga reload should be rare (session start, prelude change, explicit user Run), not the default edit path. A prior implementation went the wrong way (Beluga-core checkpoints + text tail reconstruction); **that path was reverted**. What remains is mostly plumbing; the real work is **rewiring settlement** around `dirtyFrontier()`.

---

## 1. North star (non-negotiable)

| Principle | Meaning |
|-----------|---------|
| AST / graph is substrate | `semantic-graph.mjs` dirty set, block impact, symbol hashes drive work |
| Beluga invoked surgically | Per-decl or per-fragment on intel worker; not “paste whole development string” |
| Full load once | `semantic-session.mjs` `ensureLoaded` / `markLoaded` after bootstrap; edits should not re-`loadChecker` unless fingerprint changes |
| Errors local by construction | Syntax → instant (80ms lint). Semantic break → graph marks DIRTY immediately; Beluga ERRORING when certified |
| No Beluga core changes | **Never** modify `Beluga-W/src/core/`. Shim only: `Beluga-W/src/web/beluga_web.ml` if a new JSON IDE entrypoint is needed |

**Wrong approach (do not rebuild):** Beluga `Store.snapshot` / `reconstruct_tail` / `loadPrefixAndSnapshot` / checkpoint LRU / “longest unchanged text prefix” ladder. That optimizes how often Beluga reloads **text**; it does not make BelJar intelligent.

---

## 2. What was built and reverted (2026-06/07)

### Reverted — Beluga-W submodule

- `store.ml` snapshot/restore, `load.ml` `reconstruct_tail`, `recsgn_state` checkpoints, `incremental_checkpoint.ml`, `beluga_web.ml` checkpoint APIs
- Restored to pre-checkpoint HEAD; `beluga_web.bc.js` rebuilt without those exports

### Removed — JS tail-check wiring

- `editor-src/semantic/checkpoint-ladder.mjs`
- `editor-src/semantic/incremental-checking.mjs`
- `beluga-client.js` / `beluga-worker.js` checkpoint message types
- Persist `beljar-incremental-checking` flag
- Tests: `test-checkpoint-ladder.mjs`, `test-incremental-guards.mjs`

### Kept — BelJar-side (no core dependency)

| Piece | Location | Role |
|-------|----------|------|
| Intel worker slot | `js/beluga-client.js` | `ideType`, `ideDeclType`, `ideElaborate` off hot checker path |
| Hard cancel | `beluga-client.js`, `settlement.mjs` | Superseded settlement drops in-flight checker work |
| Adaptive debounce | `editor-src/semantic/settle-delay.mjs` | 120–350ms before settle (still too slow for type errors alone) |
| Dev-check dedupe | `editor-src/bel-editor.mjs` | Development check only when non-active member changes |
| Syntax-only gate | `syntax-only-gate.mjs` + `semantic-engine.mjs` | Skip Beluga when only parse-fault blocks changed (**`prevSyntax` bug fixed** 2026-07-01) |
| Check trace / perf HUD | `editor-src/perf/`, `js/perf-hud.js` | Opt-in: `BelJarPerfHud.enable()` in console |
| Graph + scheduler | `semantic-graph.mjs`, `semantic-scheduler.mjs` | `dirtyFrontier`, `deriveFrontier`, cursor/viewport priority — **not yet driving settlement scope** |

---

## 3. Current bottleneck (why edits still feel like 10s)

Today, a **semantic** edit (valid parse, broken type) still does:

1. **Settle debounce** (~120–350ms)
2. **`settlement.mjs` `settleNow`** → concatenates **prelude + active file** → `checkResult` on **checker worker**
3. Up to **8 multipass** full checks (mask erroring blocks, re-check remainder)
4. **Beluga lint** refreshes on settlement tick (+ ~400ms delay)
5. Only then does graph get `ERRORING` from `belugaDiagnostics`

The graph marks the decl **DIRTY** immediately, but **type errors are not shown until Beluga returns**. Syntax lint (80ms) does not cover type breaks.

`semantic-scheduler.mjs` already elaborates dirty decls via `ideElaborate` / session — but only **after** `isSettlementReady()`, which waits on the monolithic settle above.

---

## 4. Target architecture

```
Edit → parse (instant) → symbolStore + semanticGraph.update
                              │
                              ├─ syntax fault? → SYNTAX_FAULT + lint (80ms) — no Beluga
                              ├─ unresolved ref? → BLOCKED — no Beluga
                              └─ dirty decl?   → DIRTY shown immediately in UI
                                        │
                    ┌───────────────────┴───────────────────┐
                    │  Bootstrap once (prelude+file fp)      │
                    │  session.ensureLoaded / markLoaded     │
                    └───────────────────┬───────────────────┘
                                        │
                    Dirty frontier only (ordered: cursor decl first)
                    ├─ ideDeclType(name)     — certify signature
                    ├─ ideElaborate(range)   — certify body / implicits
                    └─ merge diagnostics onto graph nodes (local)
                                        │
                    Full checkResult       — rare: first open, prelude member
                                           changed, user Run, invariant failure
```

**Session fingerprint:** When only the active file body changes and prelude fp is stable, intel session keeps loaded state; certify **changed decls only**.

**Prelude:** Load once per development; re-bootstrap only when a prelude **member** file changes (not on every active-file keystroke).

---

## 5. Phases (accurate backlog)

### Phase A — Stop the bleeding (JS only, no OCaml)

- [ ] **A1. Graph-first diagnostics for dirty decls** — Surface DIRTY/BLOCKED in beluga-lint / gutter before Beluga returns; do not leave UI blank for 10s
- [ ] **A2. Decouple intel from monolithic settle** — Scheduler may run `deriveFrontier` / `ideDeclType` on dirty frontier when session fp matches, without waiting for `settleNow` to finish
- [ ] **A3. Narrow default settle** — Default path: bootstrap if needed, then certify dirty frontier; reserve full `checkResult` for explicit Run + prelude-change + first mount
- [ ] **A4. Cursor-first ordering** — Dirty decl under cursor certified first (scheduler priority already exists; wire to certification)
- [ ] **A5. Measure** — `BelJarPerfHud` + `docs/perf-baseline.md`: p50/p95 for “break type in decl” &lt; 500ms target on classical-processes active file

**Acceptance:** Edit breaks type in one theorem → squiggle or graph ERRORING within **&lt;1s** on dev machine (not 10s); full-file check not invoked on every key.

### Phase B — Frontier-certified settlement

- [ ] **B1. Replace `runCheck(wholeCode)` as default** in `settlement.mjs` with `certifyFrontier(dirtyIds, session)`
- [ ] **B2. Merge per-decl Beluga diagnostics** onto `semantic-graph` nodes (line-local, not whole-file parse of stdout)
- [ ] **B3. Prelude policy** — `project-prelude.mjs`: bootstrap fingerprint per development; active-file edits do not re-send prelude text unless a member changed
- [ ] **B4. Multipass only on full-check fallback** — MAX_PASSES masking applies when forced full check runs, not on per-decl certify

**Acceptance:** `npm test` green; new test: dirty single decl edit does not call `checkResult` (mock client call counts).

### Phase C — Hardening

- [ ] **C1. Parity harness** — frontier certify vs full load on corpus (classical-processes, hint-stress, mutual-rec) — results must match
- [ ] **C2. CI perf budget** — regression vs `docs/perf-baseline.md`
- [ ] **C3. Long-session memory** — worker lifecycle, no leak over 30min typing

### Explicitly out of scope

- Beluga `Store.snapshot` / `reconstruct_tail` / any `src/core/` change
- Text prefix/tail checkpoint ladder
- Trusting Beluga printed text as source of truth
- New UI modes or settings toggles unless needed for debug

---

## 6. Key files

| Area | Path |
|------|------|
| Edit → graph | `editor-src/semantic/semantic-engine.mjs` (`update`, `dirtyFrontier`) |
| Dirty / status | `editor-src/semantic/semantic-graph.mjs` |
| Monolithic check (to narrow) | `editor-src/semantic/settlement.mjs` |
| Session bootstrap | `editor-src/semantic/semantic-session.mjs` |
| Background elaboration | `editor-src/semantic/semantic-scheduler.mjs` |
| Prelude assembly | `editor-src/project-prelude.mjs` |
| Worker routing | `js/beluga-client.js` (checkerSlot vs intelSlot) |
| Editor wiring | `editor-src/bel-editor.mjs` |
| Beluga shim (if new API) | `Beluga-W/src/web/beluga_web.ml` only |

---

## 7. Commands

```bash
npm test                              # full suite — one invocation
node scripts/build-editor.mjs         # after editor-src/*.mjs edits
_rebuild/rebuild.ps1                  # ONLY if beluga_web.ml changes
```

Hard-refresh browser after WASM rebuild (SW cache version in `_rebuild/rebuild.ps1` output).

Debug perf (console): `BelJarPerfHud.enable()`

---

## 8. Tests to add (when implementing)

| Test | Asserts |
|------|---------|
| `test-frontier-certify.mjs` | Single dirty decl edit → `ideDeclType` called, `checkResult` not |
| `test-settle-bootstrap-once.mjs` | Two edits same fp → one `loadChecker` |
| `test-dirty-immediate-ui.mjs` | Graph DIRTY before async Beluga returns |
| Parity (slow) | Frontier vs full-load diagnostic equivalence on fixture corpus |

---

## 9. Status snapshot

| Item | State |
|------|--------|
| Beluga core checkpoint path | **Reverted** |
| Graph dirty frontier | **Exists**, not driving settle |
| Surgical intel (`ideDeclType` etc.) | **Exists**, gated on monolithic settle ready |
| Syntax-only gate | **Fixed** (`prevSyntax` before snapshot overwrite) |
| User-visible fast type errors | **Not done** — still blocked on full settle |
| This plan | **Accurate as of 2026-07-01** |

---

## 10. Agent discipline

1. Read `beljar-architecture.mdc` — if the solution reloads all Beluga state per keystroke, it's wrong.
2. Do not mark phases done without acceptance tests and measurable latency.
3. Do not touch `Beluga-W/src/core/`.
4. Prefer deleting dead paths over adding flags for reverted checkpoint work.
