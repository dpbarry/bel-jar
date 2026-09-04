# Harpoon seams and failure paths

> **Archived wrap-up diary** (2026-08-29). Living spec: [`../HARPOON.md`](../HARPOON.md).
> Defects recorded here were found and fixed. Do not treat this as the current plan.

---

## 0. The instrument works

`scripts/probe-manual-harpoon.mjs` builds the app, serves it, drives real Chrome against the
real Beluga checker, and asserts on geometry as well as behaviour. Verified 2026-08-29: it
runs, it asserts, and it caught a live defect (below). **Run it after any change here.** It is
the only thing that tests the surface end to end; `npm test`'s harpoon files cover the model
and reducer, not the DOM.

Rebuilding is safe and repeatable: `build-editor` and `build-shell` reproduce
`editor-cm.bundle.js`, `harpoon-ui.js` and `shell.js` byte-for-byte from unchanged sources.

## 1. Fixed: 1px layout shift when applying a tactic

The probe assertion *"the applying pulse appears with NO layout shift"* was failing.

Measured: `dRowTop = 1.00px`, `dListHeight = 0.00px`. The list was fine; everything above it
moved. Cause was not the pulse. `.harpoon-lab-move-track` is already `position: absolute`
specifically so appearing costs no layout, and the busy-sibling rule only touches `opacity`.

The real cause: `setTacticStatus` wrote `textContent = text || ''` into a status span that
lives in the tactics header, a `align-items: baseline` flex row. An **empty inline span
contributes no line box**; the first status text created one and grew the header by 1px,
pushing the whole list down under the cursor mid-click.

Fix: write a zero-width space instead of the empty string, so the line box always exists.
Visibility is already `.is-on`'s opacity, so the placeholder is invisible. One line;
`dRowTop` is now `0.00px` and the probe is green.

## 2. The node-graph model is defensively written

`HarpoonTree.buildModel` (`harpoon-lab-tree.mjs`) reads 13 fields off each step
(`branch focus goal holeCtx holeMeta meta move rationale status text` …) and guards nearly all
of them: `opts.steps || []`, `st.holeCtx || … || []`, `st.goal || ''`, and an explicit
`st.meta && st.meta.armPatterns && st.meta.armPatterns.length` before reading arms. A step
missing fields produces a thinner node, not an exception. `norm()` coerces null to `''` at the
top.

⚠️ **Two silent-degradation paths, both by construction rather than by accident:**

- **`tails[container] || root`** — a step whose `branch` key is not a known arm attaches to the
  **root** instead of its parent. A malformed or out-of-order step therefore produces a
  wrong-shaped graph rather than an error.
- **`advancedTrace[i]`** — the search trace is indexed by **step index**, which assumes
  `trace` and `steps` are aligned.

## 3. Absorbed Orca runs lose their alternatives

The alignment assumption above is safe today, but only because of how the two call sites
happen to be wired:

| path | supplies |
|---|---|
| `harpoon-lab-manual.mjs:422` (`manualNa`) | `trace: null` |
| `harpoon-lab.mjs:1026` (auto) | `trace: (r && r.trace) || null` |

Pure-manual: trace is null, every `entry` is `undefined`, the model falls back to the step's
own fields. Pure-auto: trace and steps align. Neither misindexes.

⚠️ **But a session that absorbs an Orca run renders through `manualNa`, so `trace` is `null`
and the search's `frontier` / `ghosts` / `altCount` are dropped for the absorbed steps.** The
node graph still shows the moves; the sidebar's "Alternatives" tray silently disappears for
them, because `renderAlternativesTray` returns `null` on an empty list.

This is safe (no crash, clean omission) but it is a **fidelity gap in exactly the feature the
surface is built around** — memory records that mixing hand-built and searched steps in one
session "is the actual feature". A user who pauses Orca, takes a step, and looks at the graph
loses the search's reasoning for everything Orca did.

**Fixed (2026-08-29).** The trace is now paired with its steps in `absorbAuto`, which is the
one place the index pairing is known to be valid, instead of at render time where it is not:

```js
const advanced = (result.trace || []).filter((t) => t && t.advanced);
const absorbed = (result.steps || []).map((s, i) => (
  s && advanced[i] && !s.traceEntry ? { ...s, traceEntry: advanced[i] } : s));
```

and `buildModel` now reads `st.traceEntry || advancedTrace[i]`. Consequences:

- Alternatives survive an absorb, so the graph keeps the search's reasoning after the user
  takes a step by hand.
- **The positional assumption is gone for absorbed steps.** The fallback remains for a pure
  auto session, where it is correct by construction.
- The reducer stays pure: steps are cloned, not mutated. Verified there are no step-identity
  comparisons anywhere in the surface, so cloning is safe.
- Only ADVANCED trace rows pair with steps; a non-advancing probe in the trace must not shift
  the pairing. Pinned by test.

Covered by `tests/test-harpoon-absorb-trace.mjs` (7 assertions: pairing, the advanced-only
skip, purity, position independence, and a trace-less result absorbing cleanly).

## 4. The node-graph and sidebar CSS was in the wrong file (moved)

`harpoon-lab-tree-ui.mjs` emits 54 distinct `hpt-` classes. **None were styled in
`harpoon.css`.** All 104 `hpt-` rules lived in `css/ide.css`, in one contiguous 812-line region
running to end of file: derivation section, pop-out explorer, tree panel, detail rail,
alternatives tray. Anyone editing the Harpoon surface looked in `harpoon.css` and found nothing
for the node graph.

Moved into `harpoon.css` (2026-08-29). Checked safe **before** moving, not after:

- **0 identical selectors** exist in both files, so there is no true cascade conflict.
- The **6 selectors naming both an `hpt-` and a `.harpoon-*` class** are more specific than the
  plain rules they meet (`.hpt-detail > .harpoon-lab-section-label` is 0,2,0 against 0,1,0), so
  specificity decides rather than file order. This matters: `ide.css` imports *after*
  `harpoon.css`, so the move shifts these rules earlier in the cascade.
- The region held **0 non-Harpoon rules**; both halves were brace-balanced.
- After: **780 rule blocks before, 780 after, identical set** with comments and whitespace
  normalised away. Probe green, `npm test` 211/212.

### Dead CSS removed

**14 unreachable rules deleted**, leaving **0 unreferenced `hpt-` selectors**:

- 10 whose selector named only never-emitted classes (`hpt-detail-code-plain`, `hpt-card-head`,
  `-title`, `-sub`, `-goal`, `-reason`, `-chips`, `-tried`, `hpt-chip`, `hpt-host--live`).
- 4 compound rules that survived the first pass because they also named a live modifier or
  descendant (`.hpt-card-reason.is-guard`, `.hpt-chip.is-binds`, `.hpt-chip.is-cost`,
  `.hpt-host--live .hpt-svg`). These are provably unreachable: the base class is never emitted,
  so the compound can never match.

Method, worth reusing: a selector is dead only if **every** class it names is dead. A selector
mixing a dead class with a live one must be kept, or the live element loses its styling. One
such selector was trimmed rather than dropped. Verified afterwards that no class still
referenced by JavaScript disappeared from the stylesheet.

⚠️ **`hpt-node--*` and `hpt-kind--*` look dead to a literal search but are live**, built at
runtime by concatenating the move kind onto the prefix. Do not delete them. A first pass at
this analysis reported them dead; any such check must account for constructed class names.

### Corrected: the two "unstyled" classes are not defects

`hpt-detail-ctx` and `hpt-detail-arm` are emitted with no matching rule, but neither renders
badly. `renderCtx` appends a fully styled `.harpoon-lab-ctx` section, and the wrapper's only
job is spacing *between* sections; in the tree rail each wrapper holds exactly one section and
`detailSection` supplies the outer chrome. `hpt-detail-arm` is an `<li>` whose parent
`.hpt-detail-arms` already provides the flex column, gap and font size. They are unused hooks,
not broken elements. Adding rules for them would be no-op bloat.

Noted because everywhere *else* in Harpoon the context wrapper is `harpoon-lab-context`; the
tree rail invented its own name. Harmless today, but it is the kind of divergence that makes
the surface feel improvised.

### Still open here

`harpoon.css` is now ~3300 lines, coherent by subject but large. Splitting it by surface is a
Phase 4 candidate, not something to start while other work is in flight.

### What is not wrong with this surface

Recorded because the code reads worse than it is. `harpoon-lab-tree-ui.mjs` has **zero inline
styles**, one function per concern with clear names, and a longest function of 138 lines.
`buildModel` guards nearly every field it reads. The disorder was in **stylesheet
organisation**, not the JavaScript.

## 5. The remaining seams

### Editor ↔ lab: the commit path (writes the user's file)

The highest-consequence seam, and the best defended. `verifyAndCommit` refuses on five
distinct conditions, each with a user-facing message rather than a silent no-op: a blocking
anchor compromise, the editor having navigated to a different file (deferred via
`pendingCommitAfterNav`), no resolvable view, the hole no longer being present, and the
declaration failing to parse. Timeouts are explicit (`COMMIT_CHECK_TIMEOUT_MS` 45s,
`COMMIT_NAV_TIMEOUT_MS` 8s).

⭐ **Soundness check passed.** `totalityPrefixFromDecl` re-attaches a `/ total /` pragma to the
committed body. It extracts the pragma **from the existing declaration text** and returns `''`
when there is none, so it can only ever preserve what the author wrote. It cannot invent one.
That distinction is the difference between this being safe and it being the false-proof
mechanism Orca has been bitten by.

### Persistence

Five stored prefs (`HarpoonMode`, `HarpoonVerifyMoves`, `HarpoonDetailsCollapsed`,
`AutosolveFocusNext`, `AutosolveShowStats`). Every reader is `try`/`catch` with an explicit
default, so a corrupt or unavailable backend degrades to the default rather than throwing.
Nothing further needed.

### Pop-out explorer: one stale reference, fixed

Lifecycle is sound: double-open raises the existing window instead of opening a second,
`onClose` nulls both `_treeWin` and `_treeRedraw`, and the throttled `requestAnimationFrame`
redraw re-checks `_treeRedraw` before firing.

⚠️ **But `_compactTreeRedraw` (the INLINE tree, not the pop-out) was set on switching to Tree
view and never cleared.** `renderDerivationSection` rebuilds `treeHost` on every structural
render, so after a rebuild the stored redraw closed over a **detached** host, and
`refreshTreeExplorer` invoked it on every frame a live search settled: wasted work, the old
subtree retained, and unguarded in a file with no `try`/`catch`.

Fixed by clearing it at the top of `renderDerivationSection`, which is the point the previous
build becomes stale by definition. Switching to Tree view re-registers a fresh one.

### Worker client: dead, and left in place deliberately

`js/harpoon/harpoon-client.js` is loaded by `index.html` on every page load and dispatches to
`Beluga.ideProofStart` / `State` / `Tactic` / `Undo` / `Redo` / `Translate`. **None of those
exist**: `Beluga-W/src/web/beluga_web.ml` defines no `ideProof*`, and no `.mjs` references
`HarpoonClient`. The OCaml counterpart was never built.

It is dead but **not deleted**: it is the client half of a designed-but-unbuilt native Harpoon
engine, and removing it would discard that thread rather than shelve it. Recorded here so the
cost is visible and the decision is explicit. If the native engine is abandoned outright, the
script tag in `index.html` and the file can go together.

## 6. The verification sweep is cancellation-safe (verified, with one hole closed)

The sweep verifies up to the first 8 tactic rows in the background. The fear was a verdict
from a previous goal landing on the current one. It cannot, and the reason is worth writing
down because it is not "there is a `cancelSweep()` call everywhere".

**The token discipline.** Each sweep takes a fresh object identity as its token and stores it
on the session. All four continuations bail on `_sweepToken !== token`: `next()`, the
`.then`, the `.catch`, and `sinkRefused()`. So a sweep is orphaned by *any* replacement of the
token, not only by explicit cancellation.

**Five explicit cancel sites**, one more than memory records: `manualApply`, `manualStepBack`,
`manualStepForward`, `manualFocus`, `runOrca`.

**Four state-changing functions do not cancel** and do not need to: `startManual`,
`toggleOrcaPause`, `absorbOrcaResult`, `syncManualToOrca`. Each changes a component of
`manualRenderSig` (`m.phase`, `paused`, `syncing`), which forces a structural rebuild, which
runs a fresh sweep, which replaces the token.

**Why the render fast path cannot leak one.** The in-place path requires
`nativeAuto.phase === 'searching'`, and `runOrca` cancels the sweep before that state can
exist. So the one render path that does *not* rebuild the rows is also the one path where no
sweep is in flight.

⚠️ **The hole that was open.** `sweepCandidates` returned early, *before* claiming the token,
when there were no move rows or when move verification was switched off. Those returns left
the previous token live, so a sweep begun for an earlier goal kept running and could still
mark pips. Fixed by claiming the token first, which makes the invariant unconditional: **every
call to `sweepCandidates` orphans any in-flight sweep, including the calls that do not start
one.**

## 7. Status

**Phases 1, 3 and 4 complete.** Living spec: [`../HARPOON.md`](../HARPOON.md).

### Fixed

| defect | where |
|---|---|
| 1px shift moved the tactic list under the cursor mid-click | `setTacticStatus` |
| alternatives lost from the node graph after a run was folded in | 3 paths, now via `pairTrace` |
| stale inline-tree redraw invoked every frame into a detached host | `renderDerivationSection` |
| an in-flight sweep survived a render that produced no rows | `sweepCandidates` token claim |
| node graph and sidebar CSS lived in `ide.css` | moved, 812 lines |
| 14 unreachable CSS rules | removed |

### Verified sound, no change needed

- **Split-arm pruning.** `attemptMove` is the single entry point for both the sweep and an
  applied click. The prune loop is split-only, bounded by the arm count, and breaks on a failed
  prune or splice. `applyMove` lands the PRUNED text, and trusts a precomputed result only when
  `forCode` matches the current program.
- **Rapid interaction.** `manualApply` refuses re-entry while `busy` or `syncing`, and refuses
  rows already marked rejected.
- **The commit path**, including that it can only preserve a `/ total /` the author wrote.
- **Persistence.** Five prefs, every reader guarded with an explicit default.

### Judgement calls left standing

- **`harpoon.css` stays one file** (~3300 lines, 29 descriptive section banners). Splitting it
  would recreate the "which stylesheet is this in?" problem that moving the `hpt-` block just
  solved. It is navigable; size alone is not a reason.
- **`harpoon-client.js` stays** although it is dead. See §5.
