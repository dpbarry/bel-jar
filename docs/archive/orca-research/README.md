# Orca research programme — **SHELVED**

*Shelved 2026-08-29. Nothing in this directory is required to build, run, explain or maintain
Orca. For what Orca **is**, read [`../../ORCA.md`](../../ORCA.md). This directory is the record of
an attempt to make it much more, and of why that attempt did not succeed.*

---

## 1. The honest status

| | |
|---|---|
| Orca as shipped | **273 / 850 = 32.1%**, sound, documented in [`../../ORCA.md`](../../ORCA.md) |
| The mandate this programme was set | **100% — every theorem** |
| What the programme added to the ledger | **0 — it was never wired into `proveProgram`** |
| Best measured by the research prototype | **12 / 570 residue targets (2.1%)**, declaration-verified |

Over roughly six weeks of agent-driven work the corpus number moved by a few points, and the
final week moved it by **nothing at all**. That is a failure against the mandate and it should
be read as one. It is recorded here in full, without softening, because the failure modes are
more useful to a successor than the successes.

**This is not a statement that the problem is closed.** It is a statement that a particular
family of approaches — enumerated below — was tried and measured, and that a successor should
start somewhere else.

## 2. What went wrong, in one page

Three patterns account for most of the wasted effort. A successor who internalises only this
section will already be ahead.

**⛔ Adding one term-former at a time.** The rule set was extended repeatedly — the case rule,
substitution formers, `impossible`, a `let`-unboxing rule. Each was individually correct,
verified at the source, and each moved the corpus number by ~0. The pinned mandate calls this
out explicitly ("a mechanism that adds a rule per SHAPE is architecturally wrong however it
measures"), and it was done anyway, for days, while quoting the mandate in the write-ups.

**⛔ Trusting an instrument that was never checked.** Repeatedly, a measurement was believed
when the instrument producing it was broken. A regex compiled with backspace bytes could never
match and printed nothing. A 200-character truncation in a report turned a valid proof into an
apparent parse error. A 60-character log truncation hid a term that had in fact been built. A
guard that failed *open* silently certified a circular proof. **Check that an instrument prints
at all, and that a component actually fires, before believing any number it produces.**

**⛔ Reasoning where a dump would answer.** On one target, seven consecutive explanations were
proposed for a failure — ordering, scope, budget, emission, cap, depth, the checker — and all
seven were wrong. The answer came from printing the candidate list and reading every line of
the rejection log. When a search will not take a move, print the moves.

⚠️ **A measurement caveat that invalidated the numbers taken late in the programme, now resolved:** the
search's per-candidate budget was derived from the *global* budget, so `--calls` changed what
the search could **reach**, not merely when it stopped. Numbers must record their `--calls`.
This is diagnosed but **not fixed** — the principled fix (a fixed per-candidate allowance)
costs a working proof and was reverted. The final full-residue sweep was therefore re-run at
`--calls 8000`: **12/570 verified, 19 found (63% precision)** — up from 9/570 at the crippled
budget. Three of the new passes each needed **4877 calls**, far beyond the old cap. The raw
run is `residue-run-2026-08-29.txt`.

## 3. What is here

| file | what it is |
|---|---|
| `README.md` | **start here** — failure record, refuted ledger, how to resume |
| `ORCA-MANDATE.md` | the bar the programme was set: 100%, composition over enumeration |
| `prover-master-plan.md` | experimental log — 77 numbered entries, newest first |
| `instruments.md` | index of harnesses in `scratch/probes/` (gitignored) |
| `orca-research-brief-v3.md`, `-v4.md` | dossiers written for external research passes |
| `ORCA-KICKOFF.md`, `prover-agent-kickoff.md` | archived onboardings — do not paste as if the thread were live |
| `arc-2026-08-working-notes.md` | raw research narrative |
| `residue-run-2026-08-29.txt` | final corrected full-residue sweep |

The experimental instruments live in `scratch/probes/` (gitignored) with their own README.

## 4. ⭐ The most valuable thing here: the refuted ledger

Roughly a dozen mechanisms were built, gated behind a toggle, and measured at ~0. **Read this
before proposing anything, so you do not rebuild one.** Read it to avoid repetition — *not* to
conclude the problem is closed.

- adding, reordering, pruning, ranking or budgeting **candidates** — 22 gated attempts, 0 gains
- **iterative deepening** — negative twice
- supplying a **capability** wholesale: precision, construction, structure-handover, breadth — each 0/45
- **`_` as a search candidate** — 0 gains, 1 loss, 2× cost
- a **cheap adjudication oracle** — a *perfect* oracle converts 0, so a cheap one changes cost, not outcome
- **Beluga's own LF solver** (`%:solve-lf-hole`) pointed at residue leaves — 0/3; it finds *an* inhabitant, not *the* required term
- **per-target hunts** — days of them produced +7 of 823
- **head-choice filtering** by conclusion and premise-satisfiability — an 8× branching cut converted 1/40

⭐ **The single most constraining fact for a successor:** cutting head branching by 8× — a
~4,000× reduction in that dimension — converted essentially nothing. The residue is therefore
**not** blocked on reachability, not on soundness, and not on branching width. Any new proposal
should explain that result before it is worth building.

## 5. What was genuinely built and does work

Recorded so it is not lost, and so a successor knows the ground is real:

- **Whole-proof synthesis exists and is sound.** From a theorem's type alone — no author
  structure handed over — the search can build a complete proof: binder introduction, a
  coverage-generated case tree (including parameter-variable and context-variable patterns),
  `let`-chains, and recursion on pattern-bound sub-derivations. Verified end-to-end with
  `/ total /` restored on real targets, at 100% precision on a control set.
- **A constructed termination certificate.** Because the search builds the case tree, every
  metavariable bound by an arm's pattern *is* a structural subterm of that arm's scrutinee by
  construction — an exact relation, needing no source walk and no checker call.
- **A former position matrix**: which term formers admit a hole (refinable) versus which sit in
  synthesis position and cannot (`let` scrutinees, `impossible` arguments, ascriptions).
- **Instruments with controls built in** — census, reach, A/B and verification harnesses that
  report a control drawn from the successes and quote the lift, never the raw share.

None of this is wired into `proveProgram`. It lives in `scratch/probes/leaf-synth3.mjs`, and
**integrating it was identified as first-class work on day one and never done** — which is why
the ledger did not move regardless of what the research measured.

## 6. If you resume

1. Read [`../../ORCA.md`](../../ORCA.md) first — know what already works before changing it.
2. Read §2 and §4 above. They are short and they are the expensive part.
3. Declare a **numeric stake and a kill criterion** before building, and honour the kill.
4. Score every census against a **control drawn from the successes**, and report the **lift**.
5. **Verify the instrument fires** before believing a null.
6. The ledger of record is `results/corpus/library.native-rebaseline-20260815.jsonl`; the
   status field is `outcome`. Re-baseline before quoting any number.

The problem remains open and worth attacking. It should be attacked from a different direction
than this programme took.
