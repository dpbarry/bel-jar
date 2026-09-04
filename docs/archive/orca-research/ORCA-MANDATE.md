# ⛔ THE ORCA MANDATE — bar for any resumed search work

> **The programme this governed is shelved.** Shipped engine: [`../../ORCA.md`](../../ORCA.md).
> Resume only from [`README.md`](README.md). If you do resume, this is still the bar.

*Pinned 2026-08-21. If a proposal does not clear it, it is not a proposal — it is another 1%.*

---

## 1. The bar, in one sentence

> **Logic and programming languages are FINITE but INFINITELY EXPRESSIVE. A proof search
> over them must be too. A finite set of first-principle rules must compose to solve
> unboundedly many holes — not an endless slog of rules creeping toward an asymptote.**

## 2. What follows from that, and it is not negotiable

- **A mechanism that adds a rule per SHAPE is architecturally wrong**, regardless of what
  it measures. If the answer to "what about `#p`?" is "add a `#p` generator", the design
  has already failed: the next question is `$S`, then blocks, then projections, forever.
- **Solving ~1% of the residue per build is not an option.** Not as a milestone, not as a
  stepping stone, not as "at least it's positive". The arithmetic never closes: the
  residue is 494 targets and the analytic ceiling is ~91%.
- **The unit of action matters more than the quality of the heuristic.** Nine generators
  that each guess a whole term are nine fragments of one missing rule, and they will each
  measure ~2% forever. Ask what a single SEARCH STEP is before asking how to make it
  smarter.
- **Expressiveness comes from COMPOSITION and RECURSION, never from enumeration.** If the
  design's power scales with how many cases it enumerates, it is bounded by how many cases
  someone writes. If it scales with how deeply rules compose, it is unbounded.

## 3. The test any proposal must pass, stated as a question

> **Name the finite rule set. Show that its closure under composition covers the fragment.
> Then show why no tenth rule is needed for the next unseen shape.**

If the answer requires enumerating families, constructors, spellings, or syntactic
features, it is the wrong shape of answer. The finite set must be the *typing rules of the
language*, because those are what generate every well-typed term there is.

## 4. Measurement discipline (the bar is not only conceptual)

- **Reach is not payoff.** Four measured reach numbers — 40%, 66.7%, 35.7%, and a perfect
  scheme handed over on 45/45 — every one with a verified-active component, every one
  converting **zero**. ⛔ A reach gate is not a gate.
- **A component gate measures the COMPONENT's contract; the payload gate belongs on the
  piece that consumes it.** Setting a conversion stake on a component nothing consumes yet
  produces a test that cannot distinguish "worthless" from "unbuilt consumer".
- **Confirm a POSITIVE on a known-good target before believing any NULL.**
- **Every census gets a control drawn from the SOLVED set; report the LIFT.**
- **Size by a FIRING COUNTER during real runs** — never over corpus text, never over
  declarations. Text overstated reach 4× and 24×; a declaration census overstated it 3.5×
  while looking exactly like a proper mechanism predicate.
- **Verify every primitive at the source before designing around it.** Three primitives a
  prior proposal depended on did not exist as described.

## 5. The three (now four) zeros any new proposal must explain

These are not cautionary tales; they are constraints on the hypothesis space. A design that
cannot say why all four happened is not yet a design.

| capability handed to the engine | contract, verified ACTIVE | payload |
|---|---|---|
| **precision** — know the slot's TYPE | 33.9% of argument slots sharpened, 66.7% of targets | **0 / 45** |
| **construction** — BUILD the inhabitant | 1128 constructed candidates, 35.7% of targets | **0 / 45** |
| **structure** — the whole induction + case tree + measure | 166 arms handed over, 45/45 behaviour changed | **0 / 45** |
| **breadth** — every generation cap widened 128× | 207-target class | **207/207 identical** |

⭐ **Together these say: the residue is not blocked on any single missing capability.** So
the next design may not be "supply capability X". It must change something about what a
step *is*.

## 6. Standing prohibitions

⛔ Rejected without measurement — each has ≥1 measured negative behind it:
- anything that adds, reorders, prunes, or budgets CANDIDATES (22 gated attempts, 0 gains)
- anything premised on coverage being the blocker (it is not; `split` is offered on 97% of
  stuck targets, and the apparent coverage defect was a totality-pragma artifact)
- anything premised on term production at a hole being the blocker (three zeros above)
- anything staged on a class chosen by convenience rather than by LIFT
- any per-target hunt (days of them produced +7 of 823)

## 7. Soundness is not traded for percentage

Beluga performs **no termination check without a `/ total /` pragma**, so `checked.ok` is
not a proof. Five false proofs shipped this way. **A percentage containing circular proofs
is worse than a lower honest one.** Termination is OUR invariant; any recursion the design
admits must be certified by us, and implicit argument positions must be excluded from the
measure domain.

## 8. How to fail well

If a design cannot clear §3, **say so with the numbers and stop.** The honest negative is
worth more than a mechanism that banks 1%. Every entry in this project that survived
contact did so because it was falsified cheaply and early, not because it was defended.

---

*Referenced by: `prover-master-plan.md` (top), `orca-research-brief-v3.md` §0.*
