# Harpoon — BelJar's proving surface

*What Harpoon is, how it is put together, and how to change it safely.*
*For the search it drives, see [`ORCA.md`](ORCA.md).*

---

## 1. The one idea

**One surface, one working program.** Harpoon is an interactive tactic picker. Orca, the
automatic search, is a **state of that surface**, never a second screen that replaces it.

| state | what the user sees |
|---|---|
| **idle** | goal, context, tactics, and an Orca button |
| **running** | the button becomes a cockpit in place; tactics grey out; the derivation streams live |
| **paused** | the run is *held*; tactics return, resynced to where Orca actually reached |
| **absorbed** | applying a tactic while paused retires the held run and the proof advances |
| **finished** | Proven → Place → Solution → Derivation, on the same surface |

The feature this exists for is that **a proof can be part hand-built and part searched in one
session**. Orca can start at any hole the user is standing on, and the user can take over
wherever Orca stopped. Everything below serves that.

## 2. Why the two modes compose

Not because the UI hides a switch. Three deliberate agreements:

- **One focus rule.** `defaultFocusIdx` reuses the engine's own `caseArmLine` then `scoreHole`,
  so "the current subgoal" means the same thing to a human and to the search.
- **One step shape.** Manual `buildStep` mirrors the search's record, adding only
  `manual: true` and omitting the auto-only fields rather than faking them. The reel, the
  derivation list and the node graph need no manual-specific code.
- **One certification path.** `attemptMove` is the single entry point for both the background
  sweep and an applied click.

## 3. Architecture

| file | role |
|---|---|
| `js/editor-src/prover/prover-manual.mjs` | **pure reducer**: `manualState`, `movesAt`, `attemptMove`, `applyMove`, `undo`, `redo`, `absorbAuto`, `pairTrace`, `focusOn`. Oracle injected, so it is testable in node. |
| `js/harpoon/harpoon-lab.mjs` | the lab shell and session object |
| `js/harpoon/harpoon-lab-manual.mjs` | the tactic picker surface |
| `js/harpoon/harpoon-lab-auto.mjs` | the Orca cockpit state |
| `js/harpoon/harpoon-lab-tree.mjs` | node-graph **model** (`buildModel`) |
| `js/harpoon/harpoon-lab-tree-ui.mjs` | node graph, pop-out explorer, detail rail |
| `js/harpoon/harpoon-lab-reel.mjs` | the live step reel |
| `js/harpoon/harpoon-lab-commit.mjs` | placing the finished proof into the file |
| `js/harpoon/harpoon-lab-display.mjs`, `-goal-sections.mjs`, `-panel.mjs` | goal, context and panel rendering |

**Bundling:** these are peers assembled by `harpoon-ui.mjs` into `js/harpoon/harpoon-ui.js`.
⛔ **Never hand-edit `harpoon-ui.js`.** Edit the `.mjs` and run `npm run build:shell`.

**Styling:** all of it is in `css/harpoon.css`, including the node graph (`hpt-` prefix).
Keep it one file — splitting recreates the “which stylesheet?” problem.

## 4. The invariants that keep it honest

Each cost a round of rework. Breaking one is how this surface gets visibly wrong.

- **`pruneOneBranch` is mandatory.** Splits are emitted with every constructor's arm, and
  Beluga expects arms its coverage checker infers impossible to be *omitted*. `attemptMove`
  prunes the arm the error points into and re-verifies, bounded by the arm count. Without it
  most splits never certify. `applyMove` lands the **pruned** text, not `mv.text`.
- **The sweep's token is claimed before any early return.** Every continuation bails on
  `_sweepToken !== token`, so replacing the token is what orphans an in-flight sweep. A call
  that starts no sweep must still orphan the previous one.
- **The precomputed cache is keyed to the program.** `attemptMove` stamps `forCode`; a cache
  reached against a different program is re-checked, never trusted.
- **`absorbAuto` pushes one snapshot**, so undo reverts an entire Orca run atomically. Intended:
  the run is one user action.
- **`_renderSig` gates the in-place fast path**, which fires only while Orca is searching.
  Pausing, resyncing and a failed resync are all *structural* and must rebuild. Two ad-hoc
  booleans failed here before; keep it one signature.
- **Every path that folds a run into a manual session must call `pairTrace`.** There are three:
  two `absorbAuto` call sites and the pause-resync. Skipping it silently drops the search's
  alternatives from the node graph.
- **Banners are permanent statements about current state; events are toasts.** A rejected move
  is an event: toast, and the row goes dead. Never a banner.
- **Two segments, in order:** `[goal + banners]` then `[bar + state + work + derivation]`.
- **Never emit a `/ total /` the author did not write.** The commit path re-attaches only a
  pragma already present in the declaration.

## 5. The visual contract

Two surfaces carry rules that are easy to undo by accident.

**The holes panel card.** Three fields in a fixed shape: the declaration the hole belongs to
(left of the header, syntax-coloured from the shared `bel-hl-*` palette), where it is (right),
and the goal type beneath. The type **never wraps** — a card is one line of type tall whatever
the goal, fading off the right edge and sliding to its end on hover.

- The declaration is found by scanning file text upward from the hole, not by `declKeyForHit`,
  which needs a live view and so only answers for the *active* file. The panel lists holes
  project-wide.
- The location holds its natural width and the declaration absorbs the shrink. Two truncated
  fields tell the reader nothing; `main.bel:16` is not recoverable from anywhere else, a long
  theorem name is recoverable from the type below it.
- The fade lives on its own layer between the window and the sliding track. A mask applies to
  an element's **background** as well as its text, so putting it on the window faded the goal
  band itself — long-type cards ended up differing from short ones at the right edge.
- Sections group by DIRECTORY, so a card's suite is not recoverable from its section header.
  It is the hue on the card's left edge; do not drop it.

**The node graph.** In the pop-out explorer it fills and centres its pane. It mounts into a
dialog that has not been laid out yet, so the host measures 0 high on the first draw and the
graph fits itself to a height it does not have — `mountTreePanel` redraws once on the next
frame to correct that. Remove the redraw and the diagram goes back to sitting pinned to the
top of an empty pane. Move chips size to their label; a fixed width made `fill` as wide as
`impossible`, and the shape of the tree carried no information.

## 6. Changing it safely

```bash
node scripts/probe-manual-harpoon.mjs   # REQUIRED after any change to the proving surface
node scripts/probe-harpoon-panel.mjs    # REQUIRED after any change to the holes panel or graph
node scripts/probe-orca-glyph.mjs       # the Orca icon, at every size it ships at
npm test                                 # test-project-chaos is a known pre-existing failure
npm run build:shell                      # after editing any js/harpoon/*.mjs
```

`probe-manual-harpoon.mjs` builds the app, serves it, drives real Chrome against the real
Beluga checker, and asserts on geometry as well as behaviour. It is the only end-to-end test of
this surface; the `tests/test-harpoon-*.mjs` files cover the model and reducer, not the DOM.

`probe-harpoon-panel.mjs` covers the project-wide holes list, the proof surface reached from a
card, and the node graph. It asserts on **measured** geometry, not appearance: a card whose
type overruns must carry a negative slide equal to its overrun, and one that fits must carry
neither. That distinction is invisible to a screenshot.

⚠️ **They catch things review does not.** `probe-manual-harpoon` found a 1px layout shift that moved the tactic list
under the user's cursor mid-click, and a screenshot review had previously passed a
click-dead panel.

## 7. Seams

**Commit** (`verifyAndCommit`) refuses rather than no-op: blocking anchor, wrong file
(deferred via `pendingCommitAfterNav`), no view, hole gone, parse fail. Timeouts are
explicit. `totalityPrefixFromDecl` can only preserve an author `/ total /`.

**Tree model.** A step with an unknown `branch` key attaches to the root
(`tails[container] || root`) rather than throwing. Absorbed Orca steps carry `traceEntry`
via `pairTrace` — do not re-derive that pairing at render time.

**Persistence.** Five prefs (`HarpoonMode`, `HarpoonVerifyMoves`, `HarpoonDetailsCollapsed`,
`AutosolveFocusNext`, `AutosolveShowStats`); every reader is `try`/`catch` with a default.

**Dead client.** `js/harpoon/harpoon-client.js` is loaded by `index.html` but dispatches to
`Beluga.ideProof*`, which the OCaml side never defined. It is the client half of a designed
but unbuilt native engine. If that engine is abandoned, the file and its script tag go
together.

The wrap-up diary that found the 1px shift, lost alternatives, and stale tree redraw is
[`archive/harpoon-seams.md`](archive/harpoon-seams.md) — history, not the living spec.
