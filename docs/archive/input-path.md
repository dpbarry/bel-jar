# Input-path history (Phase 0, 2026-07-13)

> **Archived diary.** Closed successor: [`incremental.md`](incremental.md).
> Settlement: [`checking.md`](checking.md).
>
> Records the cost-cutting that drove late-file typing lag down without neutering parse/lint.
> Do not treat this as the current plan.

---

## Progress log

### 2026-07-13 (d) — the LAST-FILE latency: prelude cache invalidated by settlement

Measured the last-file case directly (active = `cp_thrm`, 5-file prelude).
`buildCheckContext` (editor.mjs) — called per keystroke by the scheduler tick,
settlement, and hole actions — keyed its prelude cache on `suiteOverlayGeneration`,
which `bumpSuiteOverlay()` bumps on **every settle start AND complete**. So while
typing the last file (biggest prelude, most checker churn), the prelude cache
missed constantly and re-ran `buildPrelude` (parse + `namesOf` all predecessors,
~6 ms for 5 files, linear in prelude size) + `suiteAnalysisFor`/`analyzeSuite`
many times per second. That is the late-file lag.

Fix: the check-context value is a **pure function of sibling texts + active
fingerprint** — nothing in it depends on checker RESULTS — so the generation key
was spurious and harmful. Removed it; cache identity is now texts-only. Extracted
the decision into [`semantic/prelude-cache-key.mjs`](../js/editor-src/semantic/prelude-cache-key.mjs)
(`preludeCacheMatches`, no generation param) so the invariant is explicit and
guarded by [test-prelude-cache-key.mjs](../tests/test-prelude-cache-key.mjs). The
suite-prelude BANNER keeps its own generation-keyed cache (that one legitimately
tracks checked results). A sibling edit still invalidates via text comparison.
Full suite **193/193**.

### 2026-07-13 (c) — intel loop bounded to the viewport (the 1k-line load cost)

The semantic scheduler ran a self-re-arming `setTimeout(50ms)` loop, and
`startBackground()` seeded **every** implicit-bearing decl in the file at mount →
on a 1k-line file it warmed the whole program into the intel worker up front (part
of why big files felt heavier than "earlier BelJar"). Changed `startBackground`
to `seedFromFrontier({ includeCleanViewport: true })` — seed only VISIBLE decls +
dirty frontier. **Intel is not lost:** the editor already calls
`onViewportChange` + `seedFromFrontier` on scroll (enqueues newly-visible decls at
priority 1), cursor move reprioritises to front, and hover/type-resolution calls
`sched.ensureElaborated(declId)` on demand and awaits it. So a decl gets intel the
instant it scrolls into view, and hover blocks on it if you beat the seed.
Guard: [test-scheduler-viewport-frontier.mjs](../tests/test-scheduler-viewport-frontier.mjs)
proves mount seeds visible-only, scroll pulls the rest, cursor wins priority.
`seedAllImplicitDeclarations()` kept for a future explicit "warm project" action.
Full suite **192/192**.

### 2026-07-13 (b) — the ACTUAL late-file typing lag, found + fixed

Phase A removed the sync `toString`s but users still felt bad lag typing in late
files. Measured (microbench on real `cp_thrm.bel`, 18 KB / 391 lines, per
keystroke): `symbolStore.update` = **~23 ms**, of which `referenceId`'s
`astPathFor` (an O(depth·siblings) ancestor/sibling walk run for **every one of
2711 identifiers**) was **~13 ms**. `settlementTrigger` (belugaCheckFingerprint
×2) added ~2 ms. That 23 ms both blows the frame budget AND (running every
keystroke in the rAF sync) pushes out the next paint → the `worrrkkkk` drops.

Two fixes:
1. **`referenceId` / `astNodeId` are now O(1)** ([semantic/ids.mjs](../js/editor-src/semantic/ids.mjs)):
   a node's `(name, from, to)` already identifies it uniquely within a doc, so the
   `astPathFor` walk is gone. These ids are snapshot-local (rebuilt each update,
   never persisted), so it's a drop-in. `symbolStore.update` 23 ms → **~9 ms**.
2. **Semantic rebuild coalesced under active typing** ([editor.mjs](../js/editor-src/editor.mjs)
   `scheduleSemanticSync`): the symbol/graph rebuild only feeds hover / nav /
   occurrence / rename / graph / settlement-scheduling — none observed
   mid-burst — so instead of one rAF **per keystroke** it runs once on a ~45 ms
   idle gap, with a 220 ms hard-staleness cap (nav/settlement never starve) and an
   immediate flush on a no-edit selection change (click/arrow after typing gets
   fresh semantics at once). Incremental Lezer parse + syntax highlighting stay
   live (they run off CM's tree, not this snapshot) → typing feels like a textarea.
   Rename-end still flushes on the next frame (no coalescing).

Guard: [test-symbolstore-scaling.mjs](../tests/test-symbolstore-scaling.mjs) pins
`symbolStore.update` ~linear + `referenceId` O(1)-per-node (depth-independent).
Full suite **191/191**.

**Still open (next):** `belugaCheckFingerprint` still does O(doc)
`checkerSnapshotFromSyntax` + `stripSpans(commentSpans(tree))` (now coalesced, ~2
ms/burst). And the ~9 ms `symbolStore.update` is still a FULL rebuild every
settle — the real §1.3 prize is making it incremental (reuse unchanged decls'
symbols/refs; only re-resolve the dirty decl). That + a semantic worker (Phase B)
is the path to LoC-agnostic edit cost. Do NOT weaken the fingerprint or drop
reference resolution to fake speed.

### 2026-07-13 — Phase A landed (main-thread input hygiene), tested

Removed the concrete per-keystroke whole-buffer offenders named in §3.3. All 190
tests pass; new guard `tests/test-input-mainthread-budget.mjs` pins the win.

- **Host persist `toString()` gone from `docChanged`.** `js/persist/persist.js` now pulls
  the live doc lazily via a `getText` provider at debounced save time
  (`collectEditorText` + new `markEditorDirty()`); the editor's `docChanged`
  listener calls `onDocChange(null)` and `app.js` calls `markEditorDirty()` (no
  string) on the input path. `remountActiveEditor` flushes before snapshotting so
  the lazy text is captured. Consistent with the pre-existing invariant "storage
  lags the live buffer; active file always uses the live doc" (`getFileText`
  comment in persist.js).
- **Edit-history `toString()` deferred.** `edit-history.mjs` `onDocChange` no
  longer stringifies per keystroke; it holds cheap CM `Text`/view references and
  materializes `before`/`after` once in `flushTypingGroup` (~150 ms after typing
  stops). Budget test: ≤5 whole-doc toStrings across 500 keystrokes (was ~1000).
- **Parse-error highlight bounded to viewport.** `invalid-highlight.mjs`
  `buildDecorations` iterated the whole Lezer tree per `docChanged`; now iterates
  only `view.visibleRanges` (output was already viewport-gated), O(viewport) not
  O(doc).
- **Beluga squiggles map instead of rebuild.** (historical: former `bel-beluga-squiggles.mjs`; settlement / diag path now owns this)
  rebuilds on a settlement tick; a plain edit maps existing marks (`deco.map`).
- **Paste reindent off the critical path.** `editor-prefs.mjs` reindents only the
  pasted line span (`iterChangedRanges`) after paint (`requestAnimationFrame`),
  not `reindentWholeDocument` on a pre-paint microtask.

### Phase C status — architecture already exists; VERIFY, don't rewrite

The prefix-closed settlement machinery is **already implemented and tested**
(`semantic/settlement.mjs` `useFrontier` path + `getScopedFrontier` in
`semantic-engine.mjs` + `compress-development.mjs`). It certifies only
`snapshot.graph.dirty` decls + diagnostic-hosting decls, stubs prelude bodies to
signatures, tracks `lastFullPreludeFp` so a stable prelude never forces a full
re-cert, and returns the cached verdict with **zero** Beluga calls on an empty
frontier. `buildPrelude` excludes the active file, so typing it does not perturb
`preludeFp`. `checkContextCache` (editor.mjs) caches the prelude by sibling
string-identity so it is not re-hashed per keystroke.

`node tests/measure-check-scaling.mjs case-studies/classical-processes` (baseline,
2026-07-13): full suite check ≈13 s; scoped recheck of a mid-file decl (earlier
bodies stubbed to `?`, signatures kept) ≈95 ms @25% / 596 ms @75% — **the 137×
prefix-closure win the frontier path is built to capture.**

**Remaining known main-thread cost (next target, Phase B/C):**
`check-gate.mjs` `belugaCheckFingerprint` runs `checkerSnapshotFromSyntax` +
`stripSpans(commentSpans(tree))` over the **whole file** on every
`settlementTrigger` (twice: prev + next), inside the rAF-deferred
`scheduleSemanticSync`. Off the keystroke transaction, but O(doc) work that
steals subsequent frames under fast typing on large files. Moving the syntax /
symbol / graph update loop (and this fingerprint) to a semantic worker (§Phase B)
is the next lever. Do NOT weaken the fingerprint to fake speed — it is the
cosmetic/syntax-only/semantic trigger gate.

---

## 0. Mission in one paragraph

Make **text input immediate** (keystroke and paste = Text mutation + incremental Lezer only on the main thread). Move **parse enrichment, symbol/graph rebuild, settlement assembly, and Beluga** off the input critical path—preferably onto **web workers**. More importantly: make the semantic/settlement engine **structurally incremental**. Beluga and BelJar must not re-digest prior suite members or prior top-level blocks when only a later region changed. In this language, earlier material is closed under later edits. After bootstrap, edit cost must be **agnostic of development LoC** (depends on dirty frontier size, not total program size). **Do more with less work—not less intelligence.**

---

## 1. Non-negotiable laws

### 1.1 Capacity is sacred

| DO | DO NOT |
|----|--------|
| Keep full Lezer parse fidelity | Strip lint rules, skip undefined-app analysis, or “simplify” diagnostics to feel fast |
| Keep full symbol / graph / hover / rename / holes power | Ship graph BLOCKED as fake “Unresolved reference \`ctx\`” for cross-file names |
| Keep Beluga as certifier of real errors | Silence errors, drop multipass completeness, or under-report |
| Make algorithms smarter / more incremental | Delete features and call it optimization |

**Strong repudiation:** Recent changes that reduced usefulness (phantom graph errors as lint, loosening readiness gates in ways that desync status, “optimizations” that made the IDE less informative while lag remained) are **rejected**. Revert or replace them when they conflict with capacity. Speed comes from **not repeating known work**, not from doing weaker work.

### 1.2 Main thread owns input only

On `docChanged` / paste, the main thread may:

1. Apply the CodeMirror transaction (Text + selection)
2. Run **incremental** Lezer parse (CM’s normal path)
3. Schedule deferred / worker work
4. Map existing decorations by `ChangeSet` where possible

The main thread must **not**, synchronously in that transaction:

- `doc.toString()` of the whole buffer for persist / history / events
- Full `walkTree` / `symbolStore.update` / `semanticGraph.update`
- Full decoration rebuilds that re-walk the tree
- `buildPrelude` / suite analysis / `assembleCheckerCode`
- Beluga `checkResult` / `loadChecker` / intel warm of the full development
- Whole-document reindent on a microtask that still races paint

**Target feel:** typing and paste are as snappy as a plain textarea; intelligence catches up without stealing the next key’s frame.

### 1.3 Language monotonicity (the real win)

Beluga/BelJar developments are **prefix-closed**:

- Suite order is load order. File *k* cannot change the meaning of files *1…k−1*.
- Within a file, earlier top-level declarations are not invalidated by edits that only touch a later declaration (except via explicit dependency edges BelJar already tracks: uses of a changed name, impact set).

Therefore, after an initial certified load:

- **Do not** re-send or re-parse unchanged prelude members on every active-file keystroke.
- **Do not** re-verify unchanged earlier blocks when only a later block is dirty.
- **Do** maintain durable certificates / fingerprints per member and per top-level decl.
- **Do** recompute only the dirty frontier and its dependents (graph-driven).

Edit latency after bootstrap ≈ *f*(dirty frontier), **not** *f*(total LoC).

### 1.4 Workers are strategy, not a dump truck

Moving a whole-program `checkResult(prelude+file)` to a worker **helps** main-thread jank but **does not** satisfy §1.3. Worker time still burns battery and delays diagnostics. Prefer:

1. **Smarter JS** (incremental semantic model) so Beluga is called less and on less text  
2. **Workers** for remaining heavy jobs (Beluga, large walks, suite bootstrap)  
3. Never Beluga-core checkpoint / OCaml Store hacks (`Beluga-W/src/core/` is off-limits)

---

## 2. What was proven broken (evidence, 2026-07-13)

Measure on `library/data/case-studies/classical-processes/` (`cp_thrm.bel` ~18KB late file vs `cp_base.bel` ~1.5KB early file).

| Observation | Implication |
|-------------|-------------|
| Full suite Run is fast; editing the **last** file is laggy | Cost tracks **edit path**, not “Beluga can’t check the suite” |
| Same lag when the suite is concatenated into one file | Cost tracks **prefix/size of what’s reprocessed**, not “cfg plumbing” |
| `symbolStore.update` ~**360ms**/keystroke on thrm before fix; ~4ms on base | Main-thread **O(n²)** JS, not Beluga |
| Root O(n²): `semanticDeclText` did unbounded `tree.iterate` per binder | Bound iterate to decl span; locals don’t need full semantic fingerprinting |
| Undefined-app lint walked **every identifier** with binder lookup | Restrict to application sites (keep diagnostics for typo juxtaposition) |
| “Frontier compression” alone did not make typing feel instant | Assembly / symbol / decoration path still sync; Beluga was not the only villain |
| Deferring semantic sync to `requestAnimationFrame` felt “better but still laggy” | Sync decoration/`toString` path remained; rAF work **stole subsequent frames** under fast typing |
| Fake “Unresolved reference \`ctx\`” from graph BLOCKED | Cross-file names unresolved in **local** store ≠ user-facing error |

**Perf HUD:** `PerfHud.enable()` in the browser console. Prefer measuring *sync work inside CM `updateListener` / StateField.update* separately from worker Beluga time.

---

## 3. Architecture to build

```
┌─────────────────────────────────────────────────────────────────┐
│ MAIN THREAD                                                      │
│  key/paste → CM Text + incremental Lezer                          │
│           → map decorations (ChangeSet)                          │
│           → postMessage(edit delta) to Semantic Worker           │
│           ← apply patches (diags, holes, statuses) when ready    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SEMANTIC WORKER (new or extended)                                │
│  maintain: syntax snapshot, symbol store, graph, dirty frontier  │
│  incremental update from ChangeSet + tree fragment               │
│  schedule Beluga only for dirty frontier (compressed/scoped)     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ BELUGA WORKERS (existing checker + intel slots)                  │
│  bootstrap: load certified prelude once (fingerprinted)          │
│  edit: certify dirty decl(s) only; merge into durable certificates│
│  never: full suite concat on every keystroke as the default      │
└─────────────────────────────────────────────────────────────────┘
```

### 3.1 Durable certificates (JS-side)

Per development member and per top-level declaration, keep:

- content fingerprint (signature vs body split already exists on symbols)
- last Beluga verdict / diagnostics scoped to that decl
- “certified for preludeFp = X” so active-file edits with stable prelude skip prelude re-check

When preludeFp changes (sibling file edit, cfg reorder): one bootstrap re-certify (worker), then return to frontier mode.

### 3.2 Settlement default

- **Default edit path:** frontier-only certify (scoped/compressed active dirty set; prelude treated as already-known signature environment—not re-proofed).
- **Full multipass:** Run action, preludeFp change, explicit force, invariant recovery—not every keystroke.
- Compression (`compress-development.mjs`) is a **lever for Beluga input size**, not a substitute for §1.3 certificates. Do not Lezer-parse the entire prelude on the main thread per settle; precompute/cache on worker at bootstrap.

### 3.3 Input path cleanup (main thread)

Concrete offenders to remove from sync `docChanged` (as of investigation):

| Site | Problem | Direction |
|------|---------|-----------|
| `editor.mjs` `baseExtensions` | `onDocChange(doc.toString())` every key | Defer; persist from worker snapshot or debounced read **after** paint |
| `edit-history.mjs` | `toString()` every key for typing group | Store before once; apply `ChangeSet` or flush-after string once |
| Hole gutter StateField | Rebuild + `getHoles()` every docChanged | `RangeSet.map(changes)` when tree/holes unchanged; recompute async |
| Parse-error highlight plugin | Full leaf iterate every docChanged | Map or viewport-bounded; heavy rebuild off critical path |
| Diag gutter StateField | Rebuild on every docChanged | Map when only positions shift; rebuild on settlement tick |
| `editor-prefs.mjs` paste reindent | `reindentWholeDocument` on microtask | After paint; prefer changed-range reindent |
| `scheduleSemanticSync` rAF | Still runs ~60ms blocking bursts | Move that work to **worker**; main thread only applies results |
| `beljar:doc-changed` sync fan-out | Harpoon/panel wakeups | Keep debounced; never do heavy sync in listeners |

---

## 4. Execution plan (ordered)

### Phase A — Stop lying about “immediate” (main thread hygiene)

1. Inventory every `updateListener` / `ViewPlugin` / `StateField.update` that runs on `docChanged` (start from investigation list in §3.3).
2. For each: **map** vs **recompute**; move recompute off the transaction.
3. Eliminate whole-doc `toString()` from the sync path.
4. Acceptance: holding a key in `cp_thrm.bel` (suite open) shows no multi-frame input delay in Chromium performance trace; paste of ~5–20KB does not freeze.

### Phase B — Semantic worker

1. Define a message protocol: `{ type: 'edit', changes, docLength, treeTransfer? }` / `{ type: 'snapshot', diagnostics, holes, graphStatus, ... }`.
2. Move `syntaxStore` / `symbolStore` / `semanticGraph` update loop to the worker (or a dedicated semantic worker that owns copies).
3. Main thread applies decoration/lint patches from worker results without re-deriving.
4. Acceptance: main-thread long tasks during typing ≪ 8ms; semantic quality tests still pass (`npm test`).

### Phase C — Prefix-closed settlement (the intelligence upgrade)

1. Bootstrap once per `(development, preludeFp)`: certify or load signatures for prelude; cache compressed signature environment on worker.
2. Active edits: Beluga (or surgical intel) only for dirty frontier + dependents; merge diagnostics into durable per-decl certificates.
3. Earlier decls/files: **untouched** unless fingerprint or dependency impact says otherwise.
4. Acceptance: editing the last decl of `cp_thrm` with full classical-processes prelude does **not** scale check time with prelude LoC (measure with `tests/measure-check-scaling.mjs` + PerfHud). Late-suite keystroke path remains LoC-agnostic after bootstrap.

### Phase D — Restore any capacity regressions

1. Audit 2026-07-13 diffs for usefulness regressions (status dot vs reality, missing lint, frontier false negatives).
2. Restore diagnostic completeness; keep only true algorithmic wins (bounded `semanticDeclText`, app-site undef-app collection, prelude content-hash cache that does **not** drop analysis).
3. Acceptance: held-out / corpus lint gates green; no phantom cross-file “unresolved” errors; status dot matches visible diagnostics.

---

## 5. Tests & measurement gates

Run **one** suite invocation: `npm test` (never loop individual `test-*.mjs` in the IDE approval trap).

Add / extend:

- Main-thread budget test (synthetic): simulate N keystrokes; assert sync work under budget **or** assert no whole-doc `toString` / no full symbol rebuild on the mocked sync path.
- Frontier certify: prelude unchanged → Beluga payload / mode is frontier; preludeFp change → one full/bootstrap.
- Scaling: `node tests/measure-check-scaling.mjs` (or successor) on classical-processes — record full vs frontier; frontier must not grow with prelude size after bootstrap.
- Capacity: `test-undefined-type-app`, settlement multipass, suite prelude recovery, semantic hover/nav — must not regress.

Build: `node scripts/build-editor.mjs` after `js/editor-src/` changes. Beluga OCaml rebuild only if `beluga_web.ml` shim changes.

---

## 6. Anti-patterns (reject these PRs)

- “Fix lag” by deleting lint, delaying lint into uselessness, or showing fewer errors.
- Treating graph `BLOCKED` (local unresolved) as Beluga-quality user errors for prelude names.
- Beluga-core checkpoints / Store snapshots (already reverted; do not revive).
- Terminating the checker worker on every keystroke (worker churn ≫ cancel-by-generation).
- Calling `rAF` deferral “done” while StateFields still walk the full tree sync.
- Whole-program `checkResult` as the default per-keystroke certify path “because the worker can take it.”

---

## 7. Kickoff prompt (paste to the next model)

```
You are fixing BelJar input lag + incremental checking.

Read [`incremental.md`](incremental.md) (closed). Obey its laws:
- Do NOT underpower parse/lint/semantics.
- DO use workers to clear the main thread.
- DO make settlement/semantic updates prefix-closed: later edits must not reprocess unchanged earlier suite files or earlier blocks; after bootstrap, cost is frontier-sized, not development-LoC-sized.
- Prior “speed” patches that reduced usefulness are repudiated.

Start with Phase A (main-thread hygiene inventory + remove sync toString/full rebuilds from docChanged), then Phase B/C. Measure on classical-processes cp_thrm vs cp_base. Run npm test once at the end of a coherent slice. Do not modify Beluga-W/src/core/.
```

---

## 8. File map (likely touch list)

| Area | Paths |
|------|--------|
| Input / CM wiring | `js/editor-src/editor.mjs`, `js/editor-src/edit-history.mjs`, `js/editor-src/editor-prefs.mjs` |
| Decorations sync | `hole-decorations.mjs`, `invalid-highlight.mjs`, `diag-gutter.mjs`, settlement / Beluga diags |
| Semantic core | `semantic/semantic-engine.mjs`, `symbol-store.mjs`, `semantic-graph.mjs`, `check-gate.mjs`, `name-resolve.mjs` |
| Settlement | `semantic/settlement.mjs`, `compress-development.mjs`, `scoped-check.mjs`, `project-prelude.mjs` |
| Workers | `js/beluga/beluga-client.js`, `js/beluga/beluga-worker.js`, possibly new `semantic-worker` |
| Persist | `js/persist/persist.js` (`scheduleEditorPersist` / checkpoint) |
| Measure | `tests/measure-check-scaling.mjs`, `js/editor-src/perf/`, `js/ui/perf-hud.mjs` |

---

## 9. Success criteria (user-visible)

1. **Immediate** typing and paste in late suite files on a high-end machine (no perceptible key delay).  
2. **Intelligence intact:** errors, holes, hover, rename, suite status remain correct and complete.  
3. **Late edits cheap:** after load, changing a late block does not re-check the world; status and Beluga work track the dirty frontier.  
4. **Honest UI:** status dot and diagnostics agree; no phantom cross-file unresolved refs from the graph.
