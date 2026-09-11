# Chunk 6 — Search

*Orca: what is frame, what is generation, and whether the split that exists in theory also
exists in the code.*

---

## 1. Orca is a text-level engine, not an AST engine

Grammar node-name references across the 25 prover files:

| File | Refs |
|---|---|
| `hole-split.mjs` | 48 |
| `prover-candidates.mjs` | 2 |
| `hole-goal-system.mjs` | 2 |
| everything else | 0–1 |

`prover-orchestrator`, `prover-moves`, `prover-synth`, `prover-hyp`, `prover-unify`,
`prover-inhabit` — **zero**.

Orca does not manipulate a typed AST. It **synthesises candidate move text**, splices it
into the program, and asks the oracle. Types are strings. Only `hole-split.mjs` needs
structure, because case analysis needs to see constructors.

This explains the engine's size (18k LOC of string synthesis), and it explains why the
"generation pays" law holds so strongly: in a text-level engine, generation *is* the
product.

---

## 2. The split, quantified

| Class | LOC | Share | Files |
|---|---|---|---|
| **Generation** | ~13,330 | **73%** | `hole-split` 3555, `prover-moves` 2289, `prover-synth` 2200, `prover-hyp` 1428, `prover-candidates` 1421, `prover-comp-type` 611, `prover-counterexample` 605, `prover-corpus-decls` 471, `prover-unify` 435, `prover-inhabit` 317 |
| **Frame** | ~2,740 | 15% | `prover-orchestrator` 1705 (mixed), `prover-certify` 330, `prover-manual` 308, `prover-transport` 163, `hole-goals-store` 90, `prover-policy` 60 |
| **Surface** | ~2,050 | 11% | `hole-actions`, `hole-goal-system`, `hole-decorations`, `hole-goal-display`, `hole-report`, `hole-goal-pending-ui`, `prover-captions` |

The headline claim in `PLATFORM.md` §5 — *porting Orca means writing a move generator, not
rewriting an engine* — is **confirmed by the ratio**. 73% of the engine is exactly the part
that would have to be rewritten per language anyway.

---

## 3. Correction: the frame is separable in principle, not in fact

`PLATFORM.md` §5 said the search frame "is generic, platform code, written once." That
overstated what the code does today.

**"Generation pays and search control does not" says where the *value* is. It does not say
the *code* is separated.** Those are different claims and the plan conflated them.

`prover-orchestrator.mjs` (1,705 lines, and 0 grammar references) exports:

```
proveProgram          ← genuine frame: the search loop
scoreHole  countErrors  firstErrorOf        ← frame-ish
coinductiveFamiliesOf  hypotheticalMeasures ← Beluga totality / coinduction
pruneOneBranch  caseArmLine  junkFreeSig    ← Beluga coverage-checker workarounds
approximateHoleGoal  stuckHintFor           ← Beluga goal heuristics
```

Loop control and Beluga heuristics are **interleaved in one file**. Zero grammar coupling
does not mean zero language coupling; this code knows Beluga at the level of totality
measures and case-arm text.

Extracting a clean frame is therefore real, delicate work on the file the engine
invariants ⛔ specifically forbid refactoring casually.

---

## 4. Decision: Orca stays Beluga-only through December

Three facts converge:

1. The frame is ~1,500 usable lines tangled inside a 1,705-line file.
2. ⛔ The engine invariants forbid casual refactoring of `proveProgramCore`, and
   `pruneOneBranch` is mandatory.
3. **Chunk 5 removed the need.** Rocq gets Mode B — backend-owned proof sessions — and
   needs no move generator at all. Orca is not on RocqJar's critical path.

So: **no frame extraction before the RocqJar milestone.** Orca remains a Beluga language-pack
asset. The frame design is recorded here so the post-window work starts from a plan rather
than a blank page, and nothing in the December work is allowed to make the extraction harder.

### The frame, when it is extracted

```js
searchFrame({
  initialGoals,
  moveCandidates,     // ← Tier 3, per language
  apply,              // ← Mode A: splice+check. Mode B: proofTactic
  certify,            // ← per language: what counts as a finished proof
  score, policy       // ← generic: ranking, depth, time budget
})
```

⛔ `certify` is per-language and non-negotiable: Beluga's soundness rule is that an
untotalied COMPLETE is not a proof. Every language pack supplies its own certification
predicate or its search is unsound.

---

## 5. The reducer state is text-anchored, and Mode B is not

Carried question from chunk 5, answered. The manual state is:

```js
{ code, holes, focusIdx, steps, stack, future }
```

`code` is not a field of the state — `code` *is* the state. `absorbAuto` takes
`result.code`, re-derives holes from it, and appends steps. `undo` restores a text snapshot.

Under Mode B the backend owns proof state and there is no `code` until `proofTranslate()` is
called. So:

```js
{ goals, focusIdx, steps, stack, future, code? }   // code optional, derived in Mode B
```

### ⚠️ The risk this creates

In Mode A, undo is a local snapshot restore and cannot fail. In Mode B, undo must call
`proofUndo()` on the backend **and** restore the local snapshot, keeping two states in sync
across an async boundary.

This collides directly with ⛔⛔ **"undo must never refuse"** — the recorder is total, undo
reconciles drift rather than dead-ending, and a step is atomic across files, folders, tabs
and the editor. That law was bought with a 57-check probe.

**Mode B undo must be designed against that law from the start, not retrofitted.** A backend
that fails or lags a `proofUndo()` must not produce a refusing undo. The likely answer is
that the shell's snapshot remains authoritative and the backend is re-synced by replay, but
this needs designing in chunk 5's provider work, not discovering in December.

---

## 6. What chunk 6 changes about the plan

1. **`PLATFORM.md` §5 is corrected**: the frame is separable in principle, tangled in fact.
   The 73/15/11 ratio still supports the strategic claim.
2. **Orca frame extraction is explicitly out of the December window** — and costs RocqJar
   nothing, because chunk 5 removed the dependency.
3. **A new law: nothing in the December work may make the frame extraction harder.** The
   prover directory is touched only to relocate it under `lang/beluga/`.
4. **Mode B undo is a designated design risk**, to be resolved against the undo law during
   the provider spec, not during the Rocq spike.
5. **Tier 3 (`moveCandidates`) drops to the bottom of the priority list.** No target language
   in the window needs it.

---

## 7. Open questions carried forward

- `hole-goal-system.mjs` (628) and `hole-goals-store.mjs` (90) maintain the project-wide goal
  list. Is that store generic over Mode A/B goals? → chunk 7.
- `prover-transport.mjs` (163) runs the search on a dedicated worker. Does Mode B need a
  worker at all, or does the provider own concurrency? → chunk 10.
- `prover-captions.mjs` (107) is user-facing move descriptions. Beluga vocabulary in the UI.
  → chunk 7.
- `prover-corpus-decls.mjs` (471) indexes the corpus for lemma suggestions. Does a
  Rocq equivalent come from the provider (`Search`) instead? → chunk 8.
