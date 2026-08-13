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
  NEED, not what the SEARCH REACHES (overstated reach 4x in one session, 24x in another).
  Put the mechanism behind an env toggle and A/B ~10 members BEFORE building the rest.
- COMPOSITE MOVES ARE ATOMIC, and REACH IS NOT PAYOFF (entry 42). Write the target term
  out longhand and COUNT the independent pieces the engine must supply. If >1, build ALL
  of them behind one toggle or do not start: a 3-part move built 2/3 of the way measured
  0 completions even at a verified 40% reach (16/40 targets, 160 hits, 7 of them no-move).
  Arriving at the hole is not the same as being able to COMPLETE the term.
- HARNESS TRAPS that each nearly produced a false verdict (entry 40):
  (1) ✅ FIXED 2026-08-06 — `prover:diff`'s default `--ref` was the stale 183 ledger; it is
      now `results/corpus/library.jsonl` (199) and EVERY run prints its baseline first
      (`ref … (default) — 199 COMPLETE`). `npm run prover:diff` is correct bare now.
      Read the printed COMPLETE count; that, not the flag, tells you the baseline is right.
  (2) ⚠️ STILL LIVE. A CANCELLED is NOT a verdict. Never run an A/B beside a
      differential/sweep — a contended arm faked a clean-looking 2x regression that
      vanished on a quiet re-run.
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

Added 2026-07-31 (entries 40–42), all reusable:
- `class-dump.mjs --match "<bucket substring>" [--ids out.txt]` — full member list of a
  residue-audit bucket, grouped BY DEVELOPMENT, so a "mass" class can be checked for being
  one shape replicated across files (which is what Wave 7's +3 turned out to be).
- `reach-drop.mjs --ids <file> --sample N` — REACH census: runs a deterministic stride
  sample and counts targets where the search actually hits a defect site. This is the
  instrument shape to copy when sizing ANY new slice; it is what a text census cannot tell
  you. Pairs with the `__factDropDebug` hook in prover-moves.
- `decidx-blast.mjs` — offline blast radius of a `decreasingArgIndex` change over every
  corpus theorem (old formula vs new). Run this before touching the spine arithmetic.
- `ctorapp-census.mjs`, `mixed-rec-census.mjs`, `weaken-census.mjs` — structural censuses
  for the ctor-application, mixed-recursion and weakening shapes.

**Live env toggles** (all default to the mechanism ON; set the var to disable, which is
the OFF arm of an A/B). `diverge-one.mjs` reads them: `NO_WEAKEN` (entry 40a weakening
spelling), `NO_MIXREC` (entry 40d mixed ctype+box recursion). Debug hooks, no-ops unless a
harness installs them: `globalThis.__factDropDebug` (prover-moves, entry 42),
`globalThis.__sfDebug` (hole-split `synthesizeFills`), `globalThis.__synthDebug`
(prover-moves, pre-existing — note it takes a DIFFERENT payload shape).

## 0.6 UPDATE 2026-08-05 — the per-slot underscore, and "the residue is a long tail"

Master plan **entries 43 and 44**.

- **SHIPPED (entry 43): the MIXED call spelling.** `recurseTexts`' Pi prefix passed every
  object-Pi binder to the recursive call BY NAME; a recursive call puts a SUB-DERIVATION
  in the decreasing slot, so any Pi binder occurring in the decreasing premise is
  re-instantiated to a reconstruction-invented term and naming it is ill-typed — while
  underscoring EVERY slot leaves conclusion-only binders undetermined ("Expression is not
  closed"). **Neither spelling the engine could emit was well-typed for that shape.** The
  rule: *a Pi binder occurring in the decreasing premise → `_`; one that does not → its
  name.* **4 gains / 0 losses in 11**, three developments, and every win got FASTER
  (126→67, 136→67, 193→67 checks). Toggle `__proverNoMixedSlot`.
- ⛔ **SIZE BY THE MECHANISM'S OWN PREDICATE, not by what proofs contain.** The reference-text
  census said 214 targets; the STRUCTURAL reach is **38** (16 exactly-verified). The A/B
  against the text class scored **0/5**; the same code against the structural class scored
  **4/11**. `scratchpad/mixedslot-reach.mjs` computes the structural class offline in
  seconds — copy that instrument shape before sizing anything.
- ⛔⛔ **THERE IS NO MASS CLASS LEFT — STOP LOOKING FOR ONE (entries 44 + 47).** This is the
  single most important thing to know before planning. Three instruments, one conclusion:
  the feature census (all 552) puts EVERY syntactic feature at **3–20%**; the error census
  showed its one 41% class is **4% of checks**; the step-map shows **56% die at step 0**
  (18% of checks) while the 47% that take steps burn **82%**, and **64% are never offered a
  recurse candidate**. The 0-step group is NOT one defect — its goals are heterogeneous
  (`SNe`, `Map`, `Sem`, `Reduce`, `CtxAsTup`, `Aeq'`, plain LF boxes) and 22/25 ARE offered a
  split that never certifies. Every remaining mechanism is worth ~3% and costs a multi-piece
  atomic build. Plan accordingly; do not spend another session hunting for a big class.
- ⭐ **THE BEST REMAINING SLICE, SIZED AND UNBUILT: context-structural induction, 16 targets,
  EXACT type-level predicate.** `scratchpad/ctxind-census.mjs` → (A) explicit `{g:<schema>}`
  binder, (B) measure NAMES it, (C) reference splits `case [g] of`; **A+B = A+C = A+B+C = 16**,
  so the class is identifiable from the TYPE ALONE (ids in `scratchpad/ctxind-ids.txt`).
  Members die cheaply at step 0 (2–11 checks). It is a 3–4 piece ATOMIC composite — context
  split by schema · `[]` + `[g', x:T]` arms · `measureDesignation` ctx designation (today it
  returns box/pi/null; a ctx-named measure falls back to box 0) · recursion at `[g']`. **All
  four behind one toggle or do not start.** Suggested stake ≥6/16, else revert whole.
- ⭐ **NEW INSTRUMENT, KEEP IT: `scratchpad/error-census.mjs`** — runs a stride sample and
  tabulates (move kind × CHECKER ERROR CLASS) over every rejected candidate, so a systematic
  spelling defect appears as a histogram spike instead of needing four hand probes.
  Companion: `scratchpad/ab-toggle.mjs --env <VAR>` A/Bs any engine toggle reporting BOTH
  verdicts and check counts.
- ⛔⛔ **BUT: A SHARE OF REJECTIONS IS NOT A SHARE OF CHECKS (entry 45).** That census's first
  finding — 41% of all rejected candidates are "Expected an LF term-level constant", because
  `fillScope` offers the context variable `g` and comp-context hypotheses as LF arguments —
  was a CORRECT diagnosis with NO payoff. Both filters were built, verified to fire, and
  measured: **−4.1% checks, 0 gains, 0 losses**. Reverted. Invalid candidates are CHEAP and
  clustered in shallow holes; the expensive checks are deep and few. **Convert any rejection
  histogram to a CHECK-WEIGHTED figure before staking a slice on it.** ⛔ Do not re-add the
  fill-pool filters (documented at the `fillScope` code site).
- ⚠️ **Three measurement traps hit in one session** — the ledger field is **`outcome`** (not
  `status`/`result`: reading the wrong key marks all 269 COMPLETEs as stuck); a loose census
  regex matched annotation parens and reported 90% where the truth was 19%; and
  `run-all.mjs` counts laptop SLEEP as elapsed time (a `67577s` suite was an 18 h closed lid,
  not a regression).

## 1. Where we are (2026-07-31)

- **Library 269 COMPLETE measured.** Suite 203/203; differential 199/199.
- **The machinery ships.** Phases A–G, the ctype composition/split build (C1–C8), the
  accessibility chain (split → `mlam` construction → invert → applied HO hypothesis), and
  the model-fidelity waves are all in.
- **The prefilter axis is CLOSED with evidence** (master plan entry 34). Every cheap
  sound prune is found; `movePrefilterOk` structurally only sees closing, boxed,
  `let`-free LF fills while 76% of rejected candidates are bare comp applications. Do not
  open a seventh prefilter front.

## 1.5 UPDATE 2026-07-31b — the decreasing-slot repair, and two harness traps

Master plan **entry 40**. Suite 202/203 (the one failure, `test-project-chaos.mjs`, has no
prover import — pre-existing). Differential **199/199, zero regressions**.

- **Fixed a real model defect:** `decreasingArgIndex` was short one spine position per
  implicit CONTEXT binder, so a ctype-decreasing theorem that also has box premises
  resolved its decreasing slot to the wrong premise and got **no induction hypothesis at
  all**. Two compensating errors hid it (a ctype premise's family head was counted as an
  implicit meta; `ctx` binders were not subtracted). 5 of 273 corpus theorems change slot,
  all five hand-verified as corrections. The spine model is *more* correct, not correct —
  conclusion family heads are still counted, `$`-subst vars still are not.
- **Two mechanisms built, both UNPAID (0 completions, 0 losses, kept):** the weakening
  spelling `X[..]` for a meta used in an extended context, and mixed ctype+box recursion.
- ⛔ **Two harness traps that nearly produced false verdicts:**
  1. ~~`npm run prover:diff` **defaults to `--ref library.20260715.jsonl` (183)**, not the
     frozen `library.jsonl` (199) the laws name. **Always pass `--ref` explicitly.**~~
     ✅ **FIXED 2026-08-06 (entry 48).** The default is now the frozen `library.jsonl`, and
     every run prints `ref <file> (default) — N COMPLETE` before any results, so a stale
     baseline is visible rather than silent. A missing `--ref` file exits 2 with a named
     error. A rule you must remember every time is a trap, not a fix — this one is closed
     by construction.
  2. ⚠️ **STILL LIVE — A `CANCELLED` is not a verdict** — an A/B arm sharing the machine
     with a running sweep reported a bogus 2× regression that vanished on an uncontended
     re-run. Never run an A/B concurrently with a differential.

⛔ **THE ctype-CONSTRUCTOR FAMILY IS CLOSED FOR NOW — entries 41 and 42.** The planner is
single-context, so at a CTYPE goal every boxed fact is DROPPED from the planning domain.
That defect is REAL and BROAD — measured reach **16/40 sampled stuck targets, 160 drops,
7 of them no-move**. Admitting those facts (with own-context spelling AND weakening-aware
matching) was built and measured anyway: **0 completions, 0 verdict changes on those same
16.** Reverted. The family needs a THREE-part composite move — ctype-ctor application +
INLINE IH call in an argument slot + weakened box — and 2 of 3 pays exactly nothing
([[composite-moves-are-atomic]]). ⛔ Do not re-add the fact admission alone. ⛔ Do not try
"annotate the let" — checker-killed three ways (41c); the INLINE spelling is the only
well-typed one. The missing third piece is an inline-IH argument source
(`nestedCtorArgFills` gives depth-2 CONSTRUCTOR witnesses only). All three, one toggle,
or leave it alone. `__factDropDebug` is the no-op hook that sizes any future attempt.

~~**So pick a DIFFERENT class next.** The residue audit's untouched mass is the place to
look — `STUCK:no-totality-measure` (99 across all sizes) and the `TIMEOUT` families have
never had a dedicated slice, and neither has been sized by reach.~~

⛔ **SUPERSEDED 2026-08-06 by entries 46 + 47 — do not act on the struck-through advice.**
Both named classes were investigated and neither is what it looked like:
- **`no-totality-measure` is NOT a measure gap (entry 46).** The label only means "the
  measure fork proposed something and it did not help"; targets where the fork proposes
  NOTHING are labelled plain `no-move`. And an empty fork does not deny an IH anyway —
  `decreasingArgIndex` returns 0 for untotalied theorems under the author-faithful policy,
  which was confirmed natively (`algeq-simplified1#reflect` IS offered recurse).
- **There is no untouched mass to find (entry 47).** Sized three ways; everything is 3–20%.
  See §0.6 above for the map and for the one sized, unbuilt slice worth taking.

## 2. The open leads — read §1.5 FIRST, it re-ranks these

> ⚠️ **Two different "ctype families" live in this file — do not conflate them.**
> §1.5/entry 42 closes the ctype-**CONSTRUCTOR-APPLICATION** family (the `M_dot`/`weaken`
> shape: build a ctype value from an inline IH call + a weakened box). The lead directly
> below is the ctype-**TRANS/CEQ** decision-tree question — still genuinely open, but it
> is **3 targets, i.e. TAIL, not mass** ([[feedback-optimize-mass-not-tail]]). It was
> written when it was the best-posed problem; it is not the best-VALUE one. Prefer an
> unsized mass class (see the end of §1.5) unless you specifically want a hard tail probe.

**Per-path search behaviour in the trans/ceq shape.** `equal/alg-equal-ctxrel#trans` and
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
