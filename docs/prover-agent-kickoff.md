# Prover agent kickoff — start here

> **Paste §0 into a fresh agent**, then have it read
> [`docs/prover-master-plan.md`](prover-master-plan.md) (the single source of truth —
> if anything here conflicts, the plan wins). This file is orientation + the next
> move only. Kept short on purpose.

---

## 0. Paste this to the next agent

```
You are continuing BelJar's native prover (Harpoon autosolve). BelJar IS the
intelligence; Beluga only certifies AST fragments we generate. Never a text wrapper.

THE ONE GOAL: maximum corpus decided, at maximum accuracy, at maximum speed —
all three at once. A proof that completes in 30 min / 15k checks is a DEFECT, not a
win. Corpus % is the scoreboard, but speed and reliability ARE the product.

THE ONE PRINCIPLE (say it back before every change):
  A blocker is a bug in OUR algorithm, never a property of the target.
  If the engine can't do something, our method isn't cutting-edge enough yet —
  it does NOT mean the target is unattainable. Never bake a deterrent in as
  "acceptable." Fill the gap with a principled, first-principles mechanism.
  HARDCODING IS UNACCEPTABLE: no branching on a theorem/constructor/schema NAME,
  no per-failure budget, no "try X for cases that look like Y", no bigger-budget
  "fix". Those reproduce the problem one level down. (test-prover-no-overfit.mjs
  guards this; validate every mechanism on >=2 invented shapes, never one target.)
  Litmus for any change: "does this make the search a decision procedure BY
  CONSTRUCTION, or just stumble into one more proof?" Only the former counts.

NORTH STAR: plan-driven focused search — intelligence in the PLAN/TERM structure,
not more step heuristics. DEFER != DISCARD: a hard proof goes to the plan tail WITH
its measured cost and the mechanism that would fix it — never thrown away, never
called "unattainable."

HOW TO WORK (the laws that were bought with burned sessions):
- MASS, not tail. Target the LARGEST tractable class, with a NUMERIC STAKE declared
  BEFORE coding ("this must move >=1/3 of its bench reps, else abandon it"). A
  micro-fix is never a milestone. (feedback-optimize-mass-not-tail)
- Answer residue questions with TEXT first: `node scripts/prover-residue-audit.mjs`
  classifies every stuck target by its own reference proof — seconds, no oracle.
- Inner loop = a STRATIFIED NATIVE BENCH (1-2 reps/class, minutes). FIRST TOOL:
  `node scripts/prover-native-oracle.mjs (--file X.bel | --cfg S.cfg) --name <rec>
  [--max-steps N]` — browserless, step-faithful, dumps what the engine GENERATES.
  Always dump candidates at the divergence BEFORE theorizing about search control.
- After ANY engine change: `npm run prover:diff` (native regression check over the
  ref ledger's COMPLETEs). ZERO regressions or revert. Full browser sweeps are a
  slice-END instrument only — never a decision input.
- Suite: ONE `npm test`. Never loop individual test-*.mjs. Pin every mechanism.
- Never touch Beluga-W/src/core/ or semantic OCaml. Fixes live in js/editor-src/.
- The working tree is UNCOMMITTED and the USER commits — never git commit/reset/
  checkout/stash unless asked. Undo via Edit.
- End each session with a 5-line scoreboard: ledger state | delta | regressions |
  what shipped | next stake + kill criterion.

READ (in order): docs/prover-master-plan.md (whole), this file, then
js/editor-src/prover/prover-synth.mjs (skim) + candidateMoves in
js/editor-src/prover/prover-orchestrator.mjs.
```

---

## 0.5 READ FIRST (2026-07-25) — how to pick the next class, and the instrument

Two things changed the map. **(a) The mass question has a direct answer in the ledger:**
`steps === 0` on a STUCK row means the search accepted NOTHING — 400 of 533 STUCK targets.
Classify those by the FIRST MOVE the target's own reference proof makes (pure text,
seconds) and the real ranking appears: `case` on a comp hypothesis **194**, `let` 63,
`fun` 43, `case` on a box 40, direct term 36, **`case` on a context variable 18**. The
"leading" context-induction slice below is an 18-target class; it is NOT the mass.
**(b) The 194 were not a search problem — the MODEL was misreading the program**
(comment-blind signature parse, dropped explicit `{Pi}` constructor arguments, family
shadowing resolved first-wins, no `mlam`/`fn` interleaving, parenthesised arrow tails,
and a missing axiom rule). See the master plan's "MODEL-FIDELITY SLICE" entry.

**The lesson to carry: before adding a MOVE, verify the model can READ the program.**
The cheapest instrument for that is the **arity audit** (master plan, same entry): compare
every constructor's modelled arity against the arities the corpus's own proofs apply it
with — text only, no oracle, ~1 minute, and it falsifies the model without running a
search. It went 47/1831 mismatches → 2/1844 (both artifacts). Run it after ANY change to
constructor enumeration or term/pattern construction.

## 1. Where we are (2026-07-22)

- **The machinery ships.** Phases A–G, the ctype-composition + ctype-split build
  (C1–C8), and the depth-2 ctype invert-rebuild slice are all in. This is late-game
  engine work, not plumbing.
- **Ledger is STALE — true COMPLETE ≥ 219** (frozen `library.jsonl` says 199). A
  targeted native re-baseline of the ctype-heavy devs banked 20 recoveries the ledger
  never recorded (the ctype build had solved far more than the ledger showed). Suite
  198/198; differential 198/199 (only the pre-existing `tapl/ch3+arith#tps`
  path-sensitivity loss). **First housekeeping job: a clean, unattended full re-sweep
  — archive `library.jsonl` by rename first, no parallel native work (it contends and
  produces false timeouts), then update the ledger of record.**
- **The clean one-session quick wins are EXHAUSTED.** Every remaining tractable class
  needs a genuinely NEW mechanism (a new move type or matcher), each ≈ C1–C8-scale.
  This is expected and correct per the principle: these blockers mean the algorithm
  isn't sharp enough yet — they are the work, not a wall.

## 2. Do next — pick ONE, declare its stake first (all detailed in the master plan)

0. **⭐ PARTIAL RE-BASELINE DONE (2026-07-28) — use it, and finish it.**
   `results/corpus/library.native-rebaseline-20260728.jsonl` holds a NATIVE re-run of
   all **331 standalone-`.bel`** targets the 2026-07-19 ledger records as not
   COMPLETE (40 steps, 40s/target cap; coinductive developments excluded).
   **31 of them COMPLETE today** — so true library COMPLETE is **≥230, not the 199
   `library.jsonl` still says**, and that file is what every class count in this doc
   was computed from. Current residue over those 331: no-move 163, no-totality 69,
   step-bound 32, cancelled-at-40s 33, search-bound 4.
   **Still owed:** the `.cfg` assemblies (each check costs 10–30s there, so budget a
   long unattended run) and a fold of both into `library.jsonl` — archive BY RENAME
   first (harness law), never truncate.

1. **Context-structural induction (18 targets — NOT the mass; see §0.5).** `candidateMoves` (prover-orchestrator.mjs)
   fills, recurses, and splits comp-context hypotheses — but NEVER splits a context
   variable. So `case [g] of | [ ] => ? | [g', x:A] => ?` is a MISSING MOVE TYPE — the
   confirmed root cause of the "step-0 bail" class (`reify`/`str`/`lookup`/`redVar`/
   `idRedSub`, ~18–20 targets, mostly `$`-subst-free). Substrate is ready: `schemaInfo`
   gives clean cons-arm data for bare + block schemas (only `some [Ω] block …` needs
   parsing hardening). Analytic / Tier-1 (decidable), NOT the cut. Two layers, like the
   ctype-split build: emit the split, then refined-context arm handling (base arm =
   existing fill, cons arm = existing recurse+IH). Stake ≥1/3 as quick proofs.
2. **Joint / diagonal tuple split.** `unique`/`unique'` (uniqueness/determinism idiom:
   two derivations of a shared subject) wander through an independent-split cross-product
   (step-bound ~104ck) instead of `case (a,b) of (C,C) | …` matched-diagonal arms. New
   split move; recurs across the corpus.
3. **Synth-site lemma composition.** `weakNorm ×8` = `cr1 (eval [] [⊢M] Nil)` — apply a
   lemma whose premise is proved by ANOTHER lemma. Here `eval` is the fundamental
   theorem; needs explicit `{g:ctx}:=[]` + a `Nil` premise + `$S` subst — hardest, +
   `$`-subst.
4. **`$`-subst flex** (`matchT`/`substTok`, capture-safe) — the standing wall under many
   logrel/equal targets. Design, don't improvise.

Deferred with cost (defer≠discard): the TIMEOUT / step-bound check-count class
(`closed` 510ck, `ref` 394ck …) — real, but slow; the fix is a search that finds the
proof cheaply, never a bigger budget.

## 3. Key paths (current — files were refactored; these are correct)

| Path | Role |
|------|------|
| `docs/prover-master-plan.md` | Single source of truth: direction, laws, ledger, every slice |
| `js/editor-src/prover/prover-orchestrator.mjs` | `candidateMoves`, `proveProgram`, `splitTextForBox/ForCtype`, budgets/guards |
| `js/editor-src/prover/prover-synth.mjs` | Backward-chaining synthesis (SLD over the pattern fragment) + plans |
| `js/editor-src/prover/hole-split.mjs` | Split/invert/fill model (`nestedCtorArgFills`, `schemaInfo`, `fillCandidates`) |
| `js/editor-src/prover/prover-comp-type.mjs` | Comp-type / totality / IH / `decreasingArgIndex` |
| `scripts/prover-native-oracle.mjs` | FIRST TOOL — browserless step-faithful oracle |
| `scripts/prover-residue-audit.mjs` | Text-only stuck-target classifier (seconds) |
| `npm run prover:diff` | Native regression check after any engine change |
| `tests/test-prover-no-overfit.mjs` | Structural anti-overfit guard (validate on ≥2 invented shapes) |

> ⚠️ Live source is `js/editor-src/prover/*.mjs` reached via an `editor-src` junction;
> git may show old flat `editor-src/*.mjs` as D/untracked (in-progress refactor). Edit
> the js path; ignore git/bash path labels. See memory `reference_editor_src_junction`.

## 4. How to talk to the user

Flat and gap-first. Report deltas per unit of work; never inflate a micro-fix into a
milestone; a green mark bought with a huge search is flagged as a defect, not banked.
End long arcs with the 5-line scoreboard.
