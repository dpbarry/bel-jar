# Execution handoff: incremental, prefix-closed editor intelligence

> **This is the SoT for Phase 1 (incremental-per-decl symbols/lint).**  
> Companion history of input-path cost-cutting:
> [`input-and-incremental-intelligence-handoff.md`](input-and-incremental-intelligence-handoff.md).  
> Beluga graph-driven checking (separate thread):
> [`fast-incremental-checking.md`](fast-incremental-checking.md).

> **Audience:** the next agent, picking up after Phase 0 landed and was committed.
> **Status:** Phase 0 done (194/194 green, committed). Phase 1 (the keystone) not started.
> **This doc is intentionally long and unabridged.** Consolidate it yourself as you
> go — but read all of it before writing a line of code. Nothing here is padding;
> every number and file:line was paid for in a hard debugging session.

---

## 0. The spirit of this work — read this twice

**You are not here to shave milliseconds. You are here to change the shape of the
computation.** The last session drove late-file typing lag from ~170ms/keystroke to
"definitely better" by removing whole-file/whole-development work from the keystroke
path. That was cost-cutting on a fundamentally wrong architecture. It worked, but it
is nearly exhausted as a strategy. What remains cannot be fixed by another debounce,
another cache, another viewport bound.

The remaining problem is **algorithmic**, and it wants **ingenuity**:

- The editor re-derives the entire semantic model of a file from its syntax tree on
  every keystroke. The fix is not "do that faster." The fix is **don't re-derive
  what didn't change.**
- Beluga developments are **prefix-closed**: an earlier declaration's meaning cannot
  depend on a later one; an earlier file cannot depend on a later one. This is a
  *mathematical* property of the language, and it is a gift. It means the correct
  cost of an edit is proportional to the **dirty frontier** (the changed declaration
  plus its dependents), never to the size of the program.
- The Beluga **checker already exploits this** (see §4). The JS **symbol/lint layer
  does not** — it is the last full-rebuild-per-keystroke tier. Closing that gap is
  the whole job.

**The litmus test for every change you make:** "Does this make the work
proportional to what the user changed, or does it just make the whole-file work
cheaper?" Only the former is the real answer. If you catch yourself adding a cache
whose *key* is computed by scanning the whole file, stop — you have reproduced the
problem one level up (this literally happened last session; see §7.4).

**Do MORE with the freed budget, not less work of lower quality.** The goal is not
a leaner IDE. It is an IDE that, because each edit is cheap, can afford *richer*
always-on intelligence than before. Never trade a diagnostic, a resolution, or an
honest status for speed. That trade is explicitly repudiated and has been reverted
every time it crept in.

---

## 1. Where we stand right now

### 1.1 What the editor does per keystroke (post Phase 0)

On the main thread, inside the CodeMirror transaction (blocks paint):
- Apply Text + selection; incremental Lezer reparse; map decorations by ChangeSet.
  All cheap, all correct. **Leave these alone.**
- `scopeHighlight` (scope-highlight.mjs) — a `walkTree` + a full `tree.iterate`,
  viewport-filtered at emit. Measured ~20ms on cp_thrm. **Synchronous. Still a
  whole-file walk. A Phase 1b target.**

Deferred on the main thread (coalesced ~45ms idle, 220ms hard cap — see
`scheduleSemanticSync` in editor.mjs):
- `semanticEngine.update` → `symbolStore.update` (full rebuild, ~9ms after the
  referenceId fix; was ~23ms) + `semanticGraph.update` (~0.3ms) + `settlementTrigger`
  fingerprint (~2ms). **This is the keystone target (Phase 1).**

Main thread, CM's 80ms lint debounce:
- `syntaxLintTree` (syntax-lint.mjs) = `walkTree` + query lint + `collectUndefinedApplicationDiags`.
  The undefined-app lint was ~97ms; last session memoized its two hot helpers
  (`externalKnownName`, `findEnclosingLocalBinder`) per pass, collapsing ~9,400
  redundant prelude scans to ~36 distinct names. **Still a whole-file walk under the
  memos. A Phase 1b target.**

On workers (never block input): settlement/checker (already frontier-scoped),
intel/reconstructed-types, prover, whole-development health check.

### 1.2 The measurement instrument (use it constantly)

Added last session, gated, zero-cost when off. In the browser console:
```
Perf.enable()          // turn on
// ...type in the target file for a few seconds...
Perf.report()          // console.table of per-phase p50/p95 ms
```
Phases recorded: `sync:semanticUpdate`, `sync:syntaxLint`, `sync:scopeHighlight`,
`sync:parseErrorHighlight`, `sync:diagRowMarkers`, `sync:ideStatus`. Implementation:
`timeSync()` in `js/editor-src/perf/check-trace.mjs`; call sites wrap the synchronous
builders. Add new `timeSync('label', () => ...)` wrappers wherever you need a number.

### 1.3 The target file for measurement

`library/data/case-studies/classical-processes/` — a real suite. Edit the **last**
file `cp_thrm.bel` (18KB, deeply-nested proofs) with the full 5-file prelude loaded;
compare against `cp_base.bel` (early, small). "Late file" = big prelude + big
deeply-nested active file = worst case.

### 1.4 ⚠️ The single most important measurement lesson

**Node microbenchmarks LIED to us by up to 10×.** `collectUndefinedApplicationDiags`
measured ~10ms in node but ~97ms in the browser. Root cause: `isKnownGlobalName` →
`externalSignatureFor`/`externalDefinedName` reach into `window.Persist` and
scan every prelude file; in node `Persist` is undefined so that entire branch
is dead. **The expensive path only runs in the browser, and it scales with prelude
depth — exactly the "later files" symptom.** Also: node builds a clean `parser.parse`
tree; the live editor holds a CodeMirror incremental tree. Some costs differ.

**Law: the ground truth is `Perf.report()` in the running browser on the late
suite file. Node benches are for unit correctness and coarse scaling only. Never
declare a latency win from a node number.** Instrument the real path, have the numbers
confirmed in the browser, before and after every change.

---

## 2. The complete intelligence inventory (what must survive, intact)

Every feature below must remain correct and complete. This is the contract Phase 1+
must not break. (Full table with file anchors is in the plan file Part A.)

- **Syntax highlighting, folding** — Lezer tree. Instant. Untouched by semantics.
- **Parse-error neutral highlight** — tree, viewport-bounded.
- **Scope + occurrence highlight** — `walkTree`. (scope: sync; occurrence: debounced.)
- **Syntax lint** — parse diags + query-pragma bounds + undefined-application diags
  (`syntax-lint.mjs`, `name-resolve.mjs`). Needs tree, whole-file `defMap`, prelude names.
- **Suite lint** — pragma-leak / shadowed-use across development files (`suite-lint.mjs`).
- **Beluga diagnostics** — real errors from the checker worker, per-decl attributed
  (`diag-gutter.mjs`, settlement / Beluga diags).
- **Settlement / checker** — multipass, frontier-scoped, prelude-as-signatures
  (`semantic/settlement.mjs`). Already prefix-closed. The model to mirror.
- **Hover types** — source signature + reconstructed/elaborated types + metavars
  (`hover.mjs`, intel worker).
- **Go-to-def, find-refs, rename** — from the symbolStore snapshot (identity-stable).
- **Holes** — existence parsed live from the tree (instant on `?`); goals from the
  checker; Harpoon proof lab.
- **Dependency graph, impact set** — from `semanticGraph`.
- **Inspector** — the whole semantic snapshot.
- **Cross-file / prelude signatures** — development members, prelude index.
- **IDE status dot; explorer/tab health dots.**

The two per-keystroke whole-file consumers to make incremental: **`symbolStore.update`**
(feeds hover/nav/rename/graph/inspector) and **`syntaxLintTree` / scopeHighlight**
(feeds lint/highlight). Everything else reads their snapshot, is already async, or is
already bounded.

---

## 3. The ideal state (define "done" precisely)

1. **Edit latency after bootstrap is O(dirty frontier), not O(file) or O(development).**
   Typing in the last decl of `cp_thrm` with the full prelude loaded is
   indistinguishable from typing in `cp_base`. `Perf.report()` p95 for
   `semanticUpdate` + `syntaxLint` + `scopeHighlight` combined sits well under one
   16.7ms frame — ideally low single digits.
2. **Every feature in §2 is byte-for-byte as correct as the full-rebuild version.**
   Proven by an incremental-vs-full equivalence test (see §6).
3. **Intelligence is richer, not poorer** — the freed budget funds always-on analysis
   that was previously too expensive (§5, Phase 3).
4. **Honest UI** — status dots and diagnostics agree; no phantom cross-file errors.

---

## 4. The model to mirror — how the CHECKER is already prefix-closed

Study this before designing the JS layer; you are re-implementing its philosophy one
tier up. (Anchors from the feasibility exploration.)

- `getScopedFrontier` (`semantic-engine.mjs:138-179`): returns the dirty declaration
  ranges from `snapshot.graph.dirty` (mapped via `symbols.symbolsById.get(id).range`),
  **plus** any decl currently hosting a Beluga diagnostic (so stale squiggles get
  re-verified), sorted cursor-first.
- `semantic-graph.mjs` `classifyChanges`/`computeDirty` (`:52-82`): per-decl diff by
  `signatureHash` then `bodyHash`, keyed by stable symbol id; `'added'`/`'signature'`
  changes **cascade** over interface (SIGNATURE + NOTATION) reverse-deps. This is a
  working per-declaration change-detector **with dependency propagation** and it
  already exists. `snapshot.dirty` / `snapshot.changes` expose it.
- `settlement.mjs` frontier path (`:345-476`) + `compress-development.mjs` +
  `scoped-check.mjs`: keep dirty decls' bodies intact, stub earlier rec/proof bodies
  to `?` (signatures preserved), truncate everything after the last kept decl. The
  load-bearing invariant (`scoped-check.mjs:10-14`): **kept-decl byte offsets are
  identical to the full source**, so diagnostic attribution is unchanged. Empty
  frontier → return prior verdict, zero Beluga calls.

**The lesson for you:** per-decl change detection with cascade is *solved* and lives
in the graph layer — but it runs *after* the symbol store has already rebuilt
everything. Phase 1 is about making the symbol store (and lint) *consume* that signal
instead of rebuilding wholesale.

---

## 5. The architecture to build (recommended path, high confidence)

> Sequence chosen with the owner: Phase 1 on the **main thread** first; then
> **measure and decide** whether a worker is needed (do not assume one up front).

### Phase 1 — Incremental symbol store (the keystone)

**Goal:** `symbolStore.update(syntaxSnapshot, {changes})` reuses the previous
update's per-declaration symbols/references for every top-level `Declaration` not
touched by `changes`, recomputing only the touched decl(s), and position-shifts the
reused results.

**What already exists to build on (do NOT reinvent):**
- Per-decl content hashes: `signatureHash` / `bodyHash` / `fingerprint` in
  `makeSymbol` (`symbol-store.mjs:659-700`), computed from `semanticDeclText` of that
  decl's node only (`check-gate.mjs:35-56`, already bounded to the decl span).
- Identity preservation across updates: `reconcileIdentity` (`symbol-store.mjs:514-593`),
  `identityRegistry` (`structuralKey → id`). Keeps nav/graph ids stable.
- Position shifting of cached ranges by ChangeSet: precedent in
  `checker-store.mjs:144-155` (`changes.mapPos` / `remapDiagnostics`).
- `opts.changes` (a CodeMirror `ChangeSet`) is **already threaded** into
  `semanticEngine.update` (`editor.mjs` `scheduleSemanticSync` composes them
  across coalesced keystrokes) — today used only for cosmetic remap, **not** to scope
  the rebuild. This is your input signal for "what changed."
- Top-level decl spans: `topDeclSpans(tree)` (`scoped-check.mjs:16-24`) — the direct
  `Declaration` children of `Program`. `declIndicesForRanges` / `declRangesForIndices`.

**The structural split that makes this tractable (this is the key insight — internalize it):**
1. **Locals are already per-decl.** `collectReferencesAndLocals` builds local scopes
   within each decl (scope spans, `localStack`). A local in decl X never escapes X.
   So local binders + local resolution recompute cleanly for only the changed decl.
2. **Globals need a whole-file name index, but that index changes rarely.** Global
   reference resolution (`resolveReference:800-832`, position-ordered visibility via
   `nameVisible:297-299`) needs the full `name → globalSymbol[]` map. But that map only
   changes when a **global is added, removed, or renamed** — detectable via
   `signatureHash` on global decls. On the overwhelmingly common edit (typing inside
   one proof body), the global name-set is unchanged, so **references in *other* decls
   stay valid and only need position-shifting; references in the *changed* decl are
   re-resolved against the (unchanged) global index.**

**Therefore the incremental update, in shape:**
1. Diff top-level decls old→new: map `changes` through `topDeclSpans`. A decl whose
   span doesn't overlap any changed range is **unchanged** → reuse its symbols,
   references, locals from the prior snapshot with all offsets shifted by
   `changes.mapPos`. A decl overlapping a change → **recompute** just its subtree
   (bounded `tree.iterate` over `[decl.from, decl.to]`, exactly as `semanticDeclText`
   already bounds its walk).
2. Maintain the persistent `name → globalSymbol[]` index across updates. If the set of
   global names (and their relative order) is unchanged, reused decls' global
   references stay bound as before (shifted). If a global changed, do a **targeted
   re-resolution of references** (cheap: walk references, re-point names whose target
   set changed) — still not a full symbol rebuild.
3. Feed the result to `semanticGraph.update` as today; the graph diff/cascade is
   already incremental and correct.

**The hard parts — where your ingenuity is required (do not paper over these):**
- **`keyCounts` positional disambiguation** (`symbol-store.mjs:150-154, :335`): today
  `structuralKey` appends `~n` based on a whole-file count of earlier same-base decls,
  so inserting an earlier duplicate renumbers later ones. A naive per-decl cache breaks
  identity here. *Think:* can disambiguation key on something **order-independent and
  stable** (e.g. the decl's own position/nameRange, reconciled through `changes.mapPos`)
  rather than a running count? Duplicates are rare; the common path must not pay for
  them. Get this right or nav/rename identity drifts.
- **Reference visibility across the edited region.** A reused decl after the edit
  point may now see a *newly-added* earlier global (or lose a removed one). Handle the
  "global name-set changed" case explicitly (targeted re-resolution) — don't assume
  reused references are always valid.
- **Absolute offsets everywhere.** Every symbol/reference `range`/`nameRange` is an
  absolute byte offset. Reused decls need every offset shifted. Use the `mapPos`
  precedent; be exhaustive (ranges, nameRanges, scope spans, reference froms/tos).

**Correctness gate (non-negotiable):** an **incremental-vs-full equivalence test** —
after any sequence of edits, the incremental snapshot must equal a from-scratch
`symbolStore.update` (compare symbol ids, ranges, reference resolutions). Build this
test FIRST, run it on a fuzz of edits against real corpus files, and let it gate every
step. Mirror `test-symbolstore-scaling.mjs` for the perf/scaling gate.

**Target:** `symbolStore.update` on a one-decl edit drops from ~9ms (O(file)) to
sub-millisecond (O(changed decl)) on `cp_thrm`.

### Phase 1b — Incremental syntax / undefined-app lint + scopeHighlight

Same shape, same insight. Cache per top-level decl keyed by `(declText, globalNameSetFp)`:
- Body edit → re-lint the one changed decl; reuse position-shifted diagnostics for the
  rest. Any change to the global name-set → invalidate the lint cache (coarse but
  correct; rare). `walkTree` results and the undefined-app scan both become per-decl.
- `scopeHighlight`'s `walkTree` + iterate should consume the same per-decl cache so it
  stops re-walking the whole file synchronously (~20ms today).
- The whole-file `defMap` (used by `isKnownGlobalName` → `findGlobalDeclarationIdent`,
  `name-resolve.mjs:485-492`) should be maintained incrementally rather than rebuilt.

### Phase 2 — Measurement gate: decide worker-or-not FROM THE NUMBERS

After Phase 1+1b, measure on `cp_thrm` with `Perf.report()`.
- If `semanticUpdate` + `syntaxLint` + `scopeHighlight` p95 sit comfortably under one
  frame (target < ~8ms combined) → **no worker.** Main-thread incremental is enough;
  simpler, keeps the Lezer tree directly accessible. Stop here on threading.
- If residual cost remains, or to guarantee headroom on the very largest projects →
  move the incremental symbol/lint/graph model into a **dedicated semantic worker**
  (the older handoff's Phase B). Main thread posts `{ChangeSet, text delta}`; worker
  maintains the incremental model and posts back diagnostic/symbol/hole patches.
  **Complication to solve then:** Lezer trees are not transferable — the worker must
  re-parse incrementally (Lezer runs fine in a worker) or receive serialized fragments.
  This is a real project; only take it on if the numbers demand it.

**Do not pre-commit to the worker.** It is the heavier, riskier path and may be
unnecessary once the work is frontier-sized.

### Phase 3 — Spend the freed budget on MORE intelligence

Once an edit is cheap, richer analysis becomes affordable *because it too runs only on
the dirty frontier*:
- A persistent, incrementally-maintained **project-wide cross-file symbol index**
  (updated per file save), so cross-file hover/nav/refs are instant instead of
  re-scanning the prelude group each time.
- Prioritized speculative elaboration (reconstructed types) during idle,
  cursor/viewport-first (the scheduler already has the priority model).
- Always-on diagnostics that were previously too expensive per keystroke — now
  affordable because they touch one decl.

---

## 6. Verification protocol (gate every phase)

1. **No-regression:** `npm test` (currently **194/194**) stays green. Watch
   explicitly: `test-cross-file-*`, `test-semantic-*` (identity/nav/rename/hover),
   `test-settlement-*`, `test-suite-lint`, `test-undefined-type-app`,
   `test-undefined-app-memo`, `test-symbolstore-scaling`, `test-input-mainthread-budget`.
   Run the whole suite in one shot: `npm test` (never loop individual files).
2. **Latency:** `Perf.enable()` → type in `cp_thrm.bel` (suite open) → `.report()`.
   Record before/after each phase. The number that must fall is `semanticUpdate` (Phase
   1) and `syntaxLint`/`scopeHighlight` (Phase 1b).
3. **Incrementality (new test):** per-byte cost of `symbolStore.update` / lint on a
   one-decl edit does not scale with file size (`cp_thrm` vs `cp_base` ratio flat).
   Model on `tests/test-symbolstore-scaling.mjs`.
4. **Equivalence (new test, the important one):** incremental result === from-scratch
   rebuild, over a fuzz of edits on real corpus files. This is what lets you trust the
   reuse.
5. **Build:** `node scripts/build-editor.mjs` after any `js/editor-src/` change (the
   editor is bundled to `js/editor-cm.bundle.js`). `js/app/app.js` and `js/explorer/explorer-tree.js`
   are served directly — no build. Beluga OCaml rebuild only if the `beluga_web.ml`
   shim changes (it won't here). Do NOT modify `Beluga-W/src/core/`.

---

## 7. Hard-won laws and traps (each of these cost real time last session)

**7.1 Measure in the browser, on the late file.** Node benches under-report by up to
10× because the prelude-scanning path is dead without `Persist` (§1.4). Always
confirm with `Perf.report()`.

**7.2 Never reduce intelligence for speed.** No silenced diagnostic, no dropped
resolution, no faked status dot. "Health = checked results" is fine (a dot may lag to
check-completion); "health = wrong" is not. Every speed patch that reduced usefulness
has been repudiated.

**7.3 The memoization pattern that worked.** When the same pure query fires thousands
of times per keystroke over few distinct inputs (measured: 9,451 prelude scans for 36
distinct names; 12,359 binder scans for a handful of positions), memoize by the input,
cleared per pass. But — **do not build a cache whose key is itself O(file)** (§7.4).

**7.4 The trap I fell into: a cache key that reproduces the cost.** I first "cached"
the prelude signature map but built the cache *key* by concatenating all prelude texts
on every call — moving the O(prelude) cost into the key, not removing it. The fix was
to memoize by *name* within a pass and build the group map once. **When you cache, the
key must be cheaper than the thing cached, or you have achieved nothing.**

**7.5 Git safety — this is a hard rule.** The working tree carries the owner's
uncommitted work. **Never run `git checkout <file>`, `git stash`, `git reset`, or any
destructive git command to undo your own edits** — last session `git checkout` on one
file and then `git stash` each silently reverted the owner's uncommitted changes and
had to be recovered. To undo your own change, use the Edit tool against the specific
lines. Only the owner commits.

**7.6 Don't confuse "committed HEAD" with "the running code."** An optimization can
live in the uncommitted working tree while HEAD still has the slow version. Read the
actual working-tree file; measure the actually-built bundle.

**7.7 The coalescing (45ms) is a crutch, not the goal.** `scheduleSemanticSync`
debounces the semantic rebuild because the rebuild is expensive. Once Phase 1 makes it
frontier-sized, the coalescing can shrink or go away — the snapshot should be fresh
enough to run near-synchronously. Don't treat the debounce as sacred; it exists only
because the work is currently O(file).

**7.8 Anti-patterns to reject outright:** deleting/deferring lint into uselessness;
treating graph `BLOCKED` (local unresolved cross-file names) as Beluga-quality user
errors; whole-program `checkResult` per keystroke; terminating the checker worker per
keystroke; calling rAF deferral "done" while StateFields still walk the whole tree;
any "it's 18ms but could be 9ms" micro-optimization that leaves the O(file) shape
intact.

---

## 8. File map (where everything lives)

| Area | Path |
|---|---|
| Symbol store (Phase 1 keystone) | `js/editor-src/semantic/symbol-store.mjs` |
| Per-decl change detection (mirror this) | `js/editor-src/semantic/semantic-graph.mjs`, `semantic/scoped-check.mjs` |
| Frontier scoping (mirror this) | `js/editor-src/semantic/settlement.mjs`, `semantic/compress-development.mjs`, `semantic-engine.mjs` (`getScopedFrontier`) |
| Syntax + undefined-app lint (Phase 1b) | `js/editor-src/ide/syntax-lint.mjs`, `js/editor-src/name-resolve.mjs` |
| Scope highlight (Phase 1b) | `js/editor-src/ide/scope-highlight.mjs`, `js/editor-src/tree-walk.mjs` |
| Engine + input wiring (opts.changes source) | `js/editor-src/semantic/semantic-engine.mjs` (`update`), `js/editor-src/editor.mjs` (`scheduleSemanticSync`) |
| Position-shift precedent | `js/editor-src/semantic/checker-store.mjs` (`mapPos`/`remapDiagnostics`) |
| Perf instrument | `js/editor-src/perf/check-trace.mjs` (`timeSync`, `Perf.report`) |
| Identity ids | `js/editor-src/semantic/ids.mjs` |
| Tests to model | `tests/test-symbolstore-scaling.mjs`, `tests/test-undefined-app-memo.mjs`, `tests/test-semantic-identity-*.mjs` |

---

## 9. Suggested order of work (concrete first steps)

1. Read `symbol-store.mjs` end to end, then `semantic-graph.mjs`, then `scoped-check.mjs`
   + `settlement.mjs`'s frontier path. Hold the whole picture before editing.
2. Write the **equivalence test harness** first (incremental === full over an edit
   fuzz). You cannot safely build the reuse without it.
3. Baseline `Perf.report()` on `cp_thrm` (record the numbers here).
4. Implement the decl-diff + reuse-with-mapPos for **unchanged decls only**, keeping
   full recompute for changed decls and full re-resolution of globals initially (get
   correctness first, via the equivalence test).
5. Then optimize: persistent global name index, targeted reference re-resolution,
   order-independent disambiguation. Re-measure after each.
6. Phase 1b: per-decl lint + scopeHighlight reuse.
7. Phase 2: measure, decide worker-or-not, and only then write §5-Phase-2 up as its own
   plan if needed.
8. Keep memory + this doc updated with real before/after numbers as you go.

---

## 10. One paragraph to keep you honest

If at any point your change makes the whole-file work *cheaper* rather than making the
work *proportional to the edit*, you have not solved the problem — you have deferred it
to a slightly larger file. The owner has said this many times and it is the crux: the
answer is ingenuity — exploiting the language's prefix-closure and the AST as a durable,
incrementally-patched substrate — not another lever. Build the equivalence test, mirror
the checker's frontier model in the symbol/lint layer, prove the numbers in the browser,
and protect every piece of intelligence on the way. That is the whole assignment.
