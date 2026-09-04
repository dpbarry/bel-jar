# Orca — kickoff for a fresh agent

> **Archived.** The research programme is **shelved**. Start at [`README.md`](README.md).
> Shipped engine: [`../../ORCA.md`](../../ORCA.md). Do not paste §1 into a new session as if the thread were live.

---

## 1. Paste this

```
You are continuing ORCA, BelJar's own proof-search engine for the Beluga proof assistant.
BelJar is the intelligence. Beluga is an ORACLE that certifies fragments we generate. It is
never a text-blob checker we wrap.

THE MANDATE. The target is 100%. Every theorem. Orca exists to supersede automatic provers
entirely, not to place well among them. A blocker is a bug in OUR algorithm, never a property
of the target. Never bake a deterrent in as "acceptable".

⛔ 1% PER DAY IS WORTHLESS. Nine mechanisms have each measured roughly zero, and a tenth of
the same kind is not progress, it is the same failure with a new name. What is wanted is an
ELEGANT, RESEARCH-GRADE algorithm that has not been built before: a finite rule set whose
CLOSURE covers the fragment, so that unboundedly many holes fall to composition rather than
to enumeration. If a design's power scales with how many cases someone writes, it is wrong.
If it scales with how deeply rules compose, it is right. Name the rule set. Show the closure.
Show why no extra rule is needed for the next unseen shape.

⛔ LIMIT YOUR PREJUDICE. This project has accumulated a large ledger of refuted directions and
a larger one of "measured" conclusions. READ THEM TO AVOID REBUILDING A REFUTED MECHANISM,
NEVER TO CONCLUDE THE PROBLEM IS CLOSED. Specifically:
  - "There is no mass class left" was measured on the PRE-refinement engine over proof TEXT.
    It is stale. Re-measure before believing it.
  - "13% ceiling", "~40% is the norm": the first was measured with a rule set now known to be
    incomplete; the second was borrowed from first-order libraries with no binders and is not
    a fact about us. The real incumbent (Harpoon's own prover, measured on OUR corpus through
    OUR harness) gets ~16% granting every unverified claim. We are already past it.
  - Numbers in old entries were true when taken. They are evidence, not bounds.

MAXIMUM EFFORT. Prefer one deep, correct, falsifiable slice over five shallow ones. Before
building: declare a NUMERIC STAKE and a KILL CRITERION. After building: measure with a
control drawn from the successes and report the LIFT, never the raw share. An honest negative
in two days beats a plausible mechanism in ten.

SOUNDNESS IS NOT TRADED FOR PERCENTAGE. Beluga runs no termination check without a `/ total /`
pragma, and the refinement primitive elaborates with no enclosing theorem at all, so a passing
check is WELL-TYPEDNESS, never TERMINATION. Five false proofs have shipped this way. Every
number must survive splicing the term back into the declaration with `/ total /` RESTORED and
reloading the whole program.

⛔ INFRASTRUCTURE, READ FIRST: `npm run prover:diff`, `node scripts/prover-native-oracle.mjs`,
and `node scripts/prover-bench.mjs` require the native Beluga CLI at
`Beluga-W/_build/default/src/beluga/main.exe`. Build it via `_rebuild/rebuild.ps1` when needed.
Until then, `prover:diff` may report 0/199 STUCK file-errors — that is a **missing tool**, not
a regression. Do not revert anything on the strength of it. `npm test` is the always-available gate.

START BY READING: ORCA-MANDATE.md, then prover-master-plan.md entries 60-73 (newest
first, they are the current arc), then ORCA-KICKOFF.md §2-§5 below.
```

---

## 2. Where things actually stand

| | |
|---|---|
| corpus | 850 theorems |
| **Orca COMPLETE** | **273 (32.1%)** |
| Harpoon's own prover, same harness | 0/28 on the residue; ~16% corpus-wide granting every unverified claim, ~6% verified |
| residue, in fragment | ~494 |

**We beat the real incumbent by 2x to 5x and it solves nothing we cannot.** That is the
floor, not the goal.

### The two halves

Orca proves a theorem by choosing a STRUCTURE (the induction and the case tree) and then
filling its LEAVES (the terms at each open goal).

- **Leaves: works.** The 2026-08-22 refinement rebuild took solved-target leaf synthesis from
  2/5 to **58/75 declaration-verified**, median 4 checker calls. Below ~10 tokens it is close
  to solved (60% of small residue leaves verify).
- **Structure: it is R6, and R6 was never built.** Measured once at **0/45** by HANDING the
  structure over to the OLD closed-term engine. ⭐ **2026-08-24 (entry 74): the two halves are
  not two problems.** `leaf-synth3` implements R1-R5, R7-R9 — every rule of entry 60.3 *except*
  R6, `case s of | pat => ?`. R6 **is** the case tree. Verified at the source: `%:checkinhole`
  elaborates a `case` whose arms are holes and reports each arm in its pattern-extended context;
  `%:split` supplies the patterns from coverage (including `#p` and the context-variable split);
  and refinement **nests**. Corpus round-trip is at control parity (69.2% vs 77.5%, lift 0.89×).
  ⛔ **That is a COMPONENT CONTRACT, not a payload — nothing consumes it yet.** The five pieces,
  the stake (≥8/30) and the kill criterion are in master-plan entry 74.5-74.6.

⭐⭐ **And it re-reads the 13%.** Entry 70.4 composed a perfect structure oracle with leaf
synthesis and got 3/23 on the hardest residue class — but that search had **no R6**, so any leaf
itself needing a nested case (21% of residue proofs) was unclosable. 13% is a ceiling on the
composed design *without the case rule*, not on the composed design.

---

## 3. The one genuinely good idea so far

`%:checkinhole H EXPR` types an INCOMPLETE term against hole H's goal, in the hole's own
context, and registers each argument goal as a new hole. So a search step is: propose
`c ? ? ?`, receive the subgoals, recurse. Orca never models weakening, substitutions, implicit
arguments or reconstruction. It calls the thing that already implements them.

⭐ And every registered subgoal, when printed, ends with a line nobody had read:

```
Goal: multi_step (leq "i1 N) ?N'_1617[^0][]
Variables of this type: MS1';
```

**The checker enumerates the type-correct inhabitants in scope, already spelled correctly for
that position.** That turned "which name goes here" from a 30-100 way guess into a lookup with
branching 1. Do not hand-build a candidate pool for the variable rule.

Instruments in `scratch/probes/`: `ci-ask.mjs` (ask the primitive any expression at a leaf — start
here), `ls2-diag.mjs` (which candidate is missing and why), `leaf-synth3.mjs` (the search),
`ls3-verify.mjs` (declaration-level verification, mandatory), `ls3-whole.mjs` (whole-target
composition), `harpoon-auto.mjs` + `harpoon-ctl.mjs` (the baseline and its positive control).

---

## 4. What is refuted, and what that does and does not mean

Each has at least one measured negative. **Do not rebuild one. Do not conclude from the list
that the problem is closed.**

- Adding, reordering, pruning, ranking or budgeting CANDIDATES. 22 gated attempts, 0 gains.
  Reconfirmed 2026-08-23: depth 6 to 12 and budget 200 to 3000 gave 0/13 with byte-identical
  call counts.
- Iterative deepening. Negative twice.
- Supplying a CAPABILITY: precision, construction, structure-handover, breadth. Each handed
  over wholesale, each 0/45.
- `_` as a search candidate. 0 gains, 1 loss, 2x cost.
- A cheap adjudication oracle. Built; a PERFECT oracle converts 0, so a cheap one changes cost
  and not outcome.
- Per-target hunts. Days of them produced +7 of 823.

⭐ The one live structural finding: the nine rules of entry 60.3 cover only the TERM layer.
Beluga's CONTEXTUAL layer (contexts, substitutions, parameter variables) has no formation
rules in Orca at all, and contextual apparatus is a 9.5x controlled marker for failure. The
research pass concluded ~90% of it is DETERMINED, so it is unification's job rather than
search's. That reframing is unproven but it is the sharpest open lead.

---

## 5. The laws, each bought with a burned session

- **Every census gets a CONTROL from the successes. Report the LIFT.** A feature in 80% of
  failures and 75% of successes explains nothing.
- **Reach is not payoff.** Seven measured reach numbers, essentially all converting zero.
- **Confirm a POSITIVE on a known-good target before believing any NULL.** Three searches in
  this arc had their nulls invalidated by controls run first.
- **An unverified close is not a result.** A hole-local `OK` means nothing until the
  declaration checks with `/ total /` restored.
- **Size by a FIRING COUNTER during real runs**, never over corpus text (overstated 4x and
  24x) or declarations (3.5x).
- **Composite moves are atomic.** Two thirds of a three-part move measures zero even at 40%
  reach. Count the pieces first.
- **A background sweep pins the code it runs on.** Editing the mechanism mid-sweep silently
  mixes two builds into one output file.
- **One process per leaf.** OCaml's signature store is global and accumulates.
- ⛔ **Never modify `Beluga-W/src/core/`.** `src/web/beluga_web.ml` plus build scripts are the
  only OCaml in scope, and the OCaml rebuild chain is not run unbidden.
- ⛔ **The working tree is uncommitted and the USER commits.** Never git commit, reset,
  checkout or stash.

---

## 6. Reporting

End every session with five lines: ledger state, delta, regressions, what shipped, next stake
plus kill criterion. Report flat and gap-first. A micro-fix is not a milestone. If a design
cannot clear the mandate's closure test, say so with the numbers and stop.
