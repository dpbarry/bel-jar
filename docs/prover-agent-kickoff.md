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
- ROI LAW (measured over ~20 gated attempts, 2026-07-31): every gain came from a
  MISSING MOVE or MIS-EMITTED TEXT; every candidate-pruning / rank-ordering idea
  returned 0 or negative. Ask of any slice: does it ADD a move the fragment needs, or
  FIX text we emit wrongly? If neither, expect zero. No completion has ever come from
  pruning — a no-move search EXHAUSTED, so cheaper candidates cannot help it.
- SIZE BY TOGGLE, never by counting. A signature/reference-shape census says what proofs
  NEED, not what the SEARCH REACHES (overstated reach 4x in one session). Put the
  mechanism behind an env toggle and A/B ~10 members BEFORE building the rest.
- When a mechanism you verified against the checker measures ZERO, read the EMITTED
  TEXT (--dump-candidates) before doubting the mechanism, and census its gates. Three
  correct mechanisms once measured zero because one predicate mangled their output.
- The ledger: use results/corpus/library.native-merged-20260729.jsonl (269 COMPLETE) for
  class sizing; frozen library.jsonl (199) stays the prover:diff --ref.
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

## 0.5 READ FIRST (2026-07-31) — state, the ROI law, and the next problem

**⭐ LEDGER.** `results/corpus/library.jsonl` is FROZEN at 2026-07-19 and says 199
COMPLETE — it **under-counts by ~70**. Every class number in older doc sections derives
from it. Use **`results/corpus/library.native-merged-20260729.jsonl` (269 COMPLETE)** for
class sizing and for `--ledger` on the audit scripts; keep using the frozen file as
`--ref` for `npm run prover:diff` (a fixed baseline is what makes the differential mean
anything). Class map on the honest numbers: `case` comp-hyp **267** (197 step-0) · `let`
**88** (79) · fun/copattern 77 (out of fragment) · `case` box 62 (50) · DIRECT 50 (38) ·
`case` ctx-var 18 · tuple 4.

**⛔⛔ THE ROI LAW — read before choosing a slice.** ~20 mechanisms were built and gated
in the 2026-07-30/31 session. The split is one-directional:

- **Everything that paid was a MISSING MOVE or MIS-EMITTED TEXT** — poisoned decreasing
  slot (+3), higher-order ctype construction and the accessibility chain (+6),
  type-ascription re-binding (+2), inferred-index variants (+1, and 713→37 checks on
  `closed`), ctype inversion + all-ctype recursion + nested-case parens (+3).
- **Everything that was PRUNING or RANKING returned 0 or negative** — unwritable-context
  variants (instant loss), the rewrite form (inert), invented-name guard (failed a
  soundness pin), comp-application family check (0), ctype-ctor θ (0), relaxed ascription
  limiter (+11% checks), inverts-before-recurses (+35% checks). Only two pruning ideas
  paid, and only in SPEED (bare-meta guard −18.6%, rigid-index −0.8%). **No completion
  ever came from pruning** — a no-move target's search EXHAUSTED; cheaper candidates
  cannot help it.

Ask of any proposed slice: *does it ADD a move the fragment needs, or FIX text we emit
wrongly?* If neither, expect zero and demand a very cheap test first.

**Two corollaries, each paid for:**
1. **Read the emitted text before doubting a mechanism.** Three correct mechanisms
   measured zero because one predicate destroyed their output: `splitDone` keys on
   `branchPatternBox`, which needs a `[…]`-bracketed arm, and a CTYPE arm is a bare
   constructor pattern — so every ctype split nested in a ctype arm went out
   UNPARENTHESISED and the outer case's arms were swallowed. One line turned three "dead"
   mechanisms into `equal#trans` COMPLETE. Use `--dump-candidates` and run the checker.
2. **A limiter can be the load-bearing part.** The ascription's "first move only" rule
   looks arbitrary; removing it cost +11% checks for 0 gains.

**METHOD (non-negotiable, each clause bought with a burned attempt):** class list by text
audit → **toggle A/B on ~10 members BEFORE building the rest** → build → `npm test` +
`npm run prover:diff` (ZERO regressions or revert) → measure on the class → record the
number. A signature or reference-shape census sizes what proofs NEED, never what the
SEARCH REACHES; it overstated reach 4× in one session. And read the suite's reported
TIME every run — a catch-all parser rule once passed 203/203 while making `npm test` take
4.9h instead of 110s, on the editor's input path.

**Instruments** live in `scratchpad/` (rebuild if cleared, ~40 lines each):
`run-class.mjs` (batch native A/B runner, writes `.partial` incrementally),
`diverge-one.mjs` (dead-end holes with offered move kinds + each candidate's
verdict/reason — FIRST thing to run on a no-move target), plus the reach-check and
gate-census patterns described in the master plan entries 33 and 36.

## 1. Where we are (2026-07-31)

- **Library 269 COMPLETE measured.** Suite 203/203; differential 199/199.
- **The machinery ships.** Phases A–G, the ctype composition/split build (C1–C8), the
  accessibility chain (split → `mlam` construction → invert → applied HO hypothesis), and
  the model-fidelity waves are all in.
- **The prefilter axis is CLOSED with evidence** (master plan entry 34). Every cheap
  sound prune is found; `movePrefilterOk` structurally only sees closing, boxed,
  `let`-free LF fills while 76% of rejected candidates are bare comp applications. Do not
  open a seventh prefilter front.

## 2. Do next — the best-posed open problem

**Per-path search behaviour in the ctype family.** `equal/alg-equal-ctxrel#trans` and
`alg-equal-datatypes#ceq` reach **18–22 accepted steps** and run out of budget;
`alg-equal-datatypes#trans` completes at 203 checks. All the needed moves now exist
(entry 37), and global RANK is not the problem — ranking inverts before recurses left
those three targets byte-identical while costing +35% elsewhere (entry 39). So the
question is the DECISION TREE: which acceptances are made and later backtracked over.
Probe that before touching rank again.

Also live, with their evidence in the master plan:
- **The step-bound cost the new moves added** — 60 of 253 in the ctype residue. The
  vocabulary opens searches that do not close.
- **Context-structural induction** (18 targets), **joint/diagonal tuple split**,
  **`$`-subst flex** — all still unbuilt, all sized.
- Deferred WITH cost (defer≠discard): the check-count tail; re-running the 70
  cancelled-at-60s `.cfg` targets found 0/23 convert at 240s, so those are genuinely
  stuck, not cap artifacts.

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
