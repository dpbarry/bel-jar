# Orca — BelJar's proof-search engine

*The product document. What Orca **is**, what it achieves, and how to run it.*
*A programme aimed at going well past 32% is **shelved** — see [`archive/orca-research/README.md`](archive/orca-research/README.md). Nothing in it is required to understand or use what is described here.*

---

## 1. What Orca is

**Orca is an automatic proof search for the Beluga proof assistant, written in JavaScript and running in the browser.** Given a Beluga theorem with an unproven body, it attempts to construct a complete, machine-checked proof.

It is one of two proving surfaces in BelJar:

| | |
|---|---|
| **Harpoon** | the interactive surface — a tactic picker the user drives by hand |
| **Orca** | the automatic search — one tool *inside* Harpoon, entered as a state (idle → running → paused → absorbed) |

Orca is not a wrapper around Beluga's own prover. It generates candidate proof steps from its own semantic model of the program, and uses Beluga only as an **oracle** that certifies each candidate. The intelligence is BelJar's; Beluga answers yes or no.

---

## 2. Where it stands

Measured over the project's 850-theorem corpus (`results/corpus/library.native-rebaseline-20260815.jsonl`, the ledger of record):

| outcome | count | share |
|---|---:|---:|
| **COMPLETE** — a full, checked proof | **273** | **32.1%** |
| STUCK | 478 | 56.2% |
| TIMEOUT | 92 | 10.8% |
| CANCELLED (harness) | 7 | 0.8% |

**For comparison, on the same corpus through the same harness, Beluga's own `--inductive-auto-solve` reaches roughly 16% granting every unverified claim, ~6% verified — and solves nothing Orca cannot.** Orca is between 2× and 5× the incumbent. Measured, not assumed.

### Why the remaining theorems are not proved

Every STUCK target carries a machine-readable reason:

| reason | n | meaning |
|---|---:|---|
| `no-move` | 205 | the generator produced no candidate at some hole |
| `no-totality-measure` | 126 | no `/ total /` pragma, so no recursion is admissible |
| `step-bound` | 67 | hit the per-proof step cap |
| `coinductive-out-of-fragment` | 49 | codata/copattern proofs — deliberately out of scope |
| `file-errors` | 27 | the source does not load |
| `search-bound` / `no-output` | 11 | budget and harness |

This is a **complete** accounting: nothing is unexplained.

---

## 3. How it works

Orca is a **greedy forward move-generator with a per-candidate certifier**. At each open hole:

1. **Generate** candidate moves from BelJar's own model of the program — its type families, constructors, theorem signatures, hypothesis contexts and totality measures.
2. **Certify** each candidate by round-tripping it to Beluga's checker.
3. **Accept** the first candidate that checks clean, commit it, and advance to the next hole.

The move set, with how often each fires across the corpus:

| move | n | what it does |
|---|---:|---|
| `split` | 1014 | case-analyse a hypothesis (patterns come from Beluga's coverage) |
| `intro` | 600 | introduce a binder (`fn` / `mlam`) |
| `fill` | 571 | close a hole with a complete term |
| `lemma` | 247 | apply a sibling theorem |
| `invert` | 233 | destructure a hypothesis by a one-branch `let` |
| `recurse` | 203 | apply the induction hypothesis |
| `synth` | 202 | synthesise a term for an argument slot |
| `impossible` | 108 | discharge an absurd case |

**Entry point:** `proveProgram(initialCode, thm, oracle, opts)` in `js/editor-src/prover/prover-orchestrator.mjs`.

### Soundness

This matters more than the percentage, and it is the property to state first to a collaborator.

- **A `COMPLETE` is a proof Beluga accepts**, produced by splicing the generated body into the declaration and reloading the whole program.
- ⚠️ **Beluga runs no termination check without a `/ total /` pragma.** A declaration lacking one is checked for *well-typedness*, not *termination*. Orca therefore treats termination as **its own** invariant: the `recurse` move only applies the induction hypothesis to a structurally-smaller sub-derivation, tracked by `decSubderivNames` in `prover-hyp.mjs`.
- ⛔ **Never emit a `/ total /` pragma that the author did not write.** An invented measure can land on an implicit argument, silently disable the termination check, and let a circular self-proof through. This has happened and is the single most important standing rule in the codebase.

---

## 4. Where the code lives

All under `js/editor-src/prover/`:

| file | role |
|---|---|
| `prover-orchestrator.mjs` | the search loop — `proveProgram`, step budgets, stuck classification |
| `prover-candidates.mjs` | move generation — `candidateMoves` |
| `prover-moves.mjs` | move application and emission |
| `prover-certify.mjs` | the Beluga round-trip |
| `hole-split.mjs` | coverage-backed case splitting, `fillCandidates` |
| `prover-hyp.mjs` | hypothesis analysis, the decreasing-argument model |
| `prover-comp-type.mjs` | computation types, premises, totality measures |
| `prover-unify.mjs` | contextual-type matching |
| `prover-manual.mjs` | the pure reducer behind manual Harpoon |
| `prover-corpus-decls.mjs` | corpus assembly and declaration masking |

Supporting UI (`hole-*.mjs`) renders goals and hole state in the editor.

---

## 5. Running and measuring it

```bash
npm run corpus          # plan + run + report over the full library
npm run corpus:report   # re-report from an existing run
npm run heldout         # the same over the held-out corpus (anti-overfit)
npm run prover:residue   # classify every unproved target by its reference proof
npm run prover:probe     # the standing probe set
npm test                 # the suite (211/212; test-project-chaos is a known pre-existing failure)
```

Corpus runs write to `results/corpus/` (gitignored). **The ledger of record is `library.native-rebaseline-20260815.jsonl`** — the `outcome` field is the status; note it is `outcome`, not `status` or `result`.

⚠️ `npm run prover:diff` (the native differential) is **currently non-functional**: it reports 0/199 STUCK file-errors because the native `main.exe` cannot be relinked in this environment (mingw, `-lws2_32`). That is a missing tool, not a regression — do not revert anything on the strength of it. `npm test` is the working gate.

---

## 6. Known limits, stated plainly

- **Coinductive/codata proofs are out of fragment** by design (49 targets).
- **126 targets carry no totality measure**, so no recursive step is admissible — a specification gap in the source, not a search failure.
- **The search is greedy**: it commits to the first certified candidate at each hole and does not backtrack across committed steps.
- **`no-move` (205) is the real frontier** — the generator produces nothing at some hole. That is the class the shelved research programme attacked.

---

## 7. The research programme

A programme aimed at pushing well past 32% is recorded in [`archive/orca-research/`](archive/orca-research/). It is **shelved**, not abandoned. None of it is needed to use, explain, or maintain what is described above.

It contains a full experimental log, the measurement instruments, and a ledger of **refuted directions**, each with the measurement that killed it. Anyone resuming should read [`archive/orca-research/README.md`](archive/orca-research/README.md) first, so they do not rebuild something already shown not to work.
