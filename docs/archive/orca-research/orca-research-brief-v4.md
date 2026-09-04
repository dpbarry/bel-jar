# Orca — Research Brief v4, for a Zero-Context Deep-Research Agent

> **Archived.** Programme **shelved**. Start at [`README.md`](README.md). Shipped engine: [`../../ORCA.md`](../../ORCA.md).

**Date: 2026-08-23. Supersedes v3 (2026-08-20) as the statement of the QUESTION.**
v3's §2 (Beluga's type theory) and §3 (corpus specimens) are unchanged and are still the
best background — **read those two sections of `orca-research-brief-v3.md` first, then
this document instead of the rest of v3.** Everything in v3 §5, §11, §12 and §13 is now
superseded: it predates the refinement arc and its research question has been answered.

> ⏱️ **HARD CONSTRAINT: there are 10 days.** A proposal that requires a research programme is
> not useful. A proposal that names one experiment runnable in a day, with a declared
> numeric stake and a kill criterion, is.

---

## 0. The one-paragraph version

BelJar contains **Orca**, its own proof-search engine for the Beluga proof assistant. It
completes **273 of 850** corpus theorems (32.1%). Over three weeks, ~8 principled mechanisms
were built and measured, and **every one of them converted approximately zero**. On
2026-08-22 the engine was rebuilt around a genuinely better primitive — the checker itself
now types incomplete terms and enumerates each hole's inhabitants — and that produced the
first real capability step in months. It also produced a hard number: **hand the search a
perfect proof structure for free and let it synthesise every leaf, and it converts 13% of
the hardest residue class.** That is ≈+7.5 corpus points at best.

**This brief argues that the 13% is not a property of the design, but of a rule set that is
missing an entire syntactic sort — and asks you to check that, and to say what to do about
it.**

---

## 1. What the system is, in 90 seconds

Beluga is a dependently-typed proof assistant for *metatheory of languages with binders*. Its
distinguishing feature is **contextual types**: a term is always judged relative to an LF
context, written `[Ψ ⊢ M]`. A theorem looks like

```beluga
rec mstep_appl : [ ⊢ mstep M M'] -> [ ⊢ mstep (app M N) (app M' N)] =
/ total s (mstep_appl s) /
fn s => case s of
  | [ ⊢ m-refl]        => [ ⊢ m-refl]
  | [ ⊢ m-step S MS]   => let [ ⊢ MS'] = mstep_appl [ ⊢ MS] in [ ⊢ m-step (rappl S) MS']
;
```

Orca's job: given the type and the surrounding development, produce the body. The corpus is
Beluga's own `library/` — POPLmark-reloaded, weak normalisation by logical relations,
Church–Rosser, Howe's method, algorithmic equality, type uniqueness, CPS conversion.

⛔ **BelJar is NOT a wrapper around Beluga.** Orca generates candidate proof text from its
own semantic model; Beluga is called only to *certify* fragments. "Just call Beluga's own
prover" is not an available answer — Beluga's interactive prover (Harpoon) has no automation
to speak of, which is why Orca exists.

---

## 2. The measured state, 2026-08-23

### 2.1 The scoreboard

| | |
|---|---|
| corpus theorems | 850 |
| **COMPLETE** | **273 (32.1%)** |
| residue, in-fragment | ~494 |
| of residue: needs the FULL proof (engine contributes nothing) | 73.2% |

### 2.2 The refinement primitive (2026-08-22, the one real advance)

A new Beluga command `%:checkinhole H EXPR` types an **incomplete** term against hole `H`'s
goal, *in the hole's own context*, and registers each argument goal as a new hole. So a
search step is: propose `c ? ? ?`, receive the subgoals, recurse. The engine never models
weakening, substitution, implicit arguments or reconstruction — it calls the thing that
already implements them.

⭐ **And each registered subgoal, when printed, ends with a line nobody had ever read:**

```
Goal: multi_step (leq "i1 N) ?N'_1617[^0][]
Variables of this type: MS1';
```

**The checker enumerates the type-correct inhabitants in scope, already spelled correctly for
that position** (a computation-level variable bare, a meta-variable bare inside a box). This
turned the "which name goes here" rule from a 30–100-way guess into a lookup with branching 1.

### 2.3 What that bought, measured with declaration-level verification

Every number below is verified by splicing the synthesised term back into the declaration,
**restoring the `/ total /` pragma**, and reloading the whole program, so Beluga's own
coverage and termination checks rule on it.

| leaf synthesis | before (2026-08-22 am) | after |
|---|---|---|
| solved-target control, 75 leaves | 2/5 in the predecessor | **58/75 (77%)** |
| residue, 36 leaves | — | **13/36 (36%)** |
| residue leaves ≤10 tokens | — | 12/20 (60%) |
| ⛔ **residue leaves >10 tokens** | — | **1/16 (6%)** |

### 2.4 ⛔ The ceiling, and it is the number that matters

`ls3-whole.mjs` hands the search the author's own `prefix(maxDepth-1)` — the induction, the
case tree, the contexts, the bound hypotheses, **all free** — then synthesises *every* leaf
(each filled with the search's own term before the next is attempted, because leaves share
metavariables) and checks the whole declaration:

| whole-target composition | solved control | **residue** |
|---|---|---|
| declaration verifies | 55/73 (75.3%) | **3/23 (13.0%)** |

**13% of the hardest residue class, with a perfect structure oracle it does not have**
(structure synthesis was separately measured at 0/45). Against a 494-target residue that is
≈64 targets ≈ **+7.5 points**. That does not close the arithmetic, and it is why this brief
exists.

---

## 3. ⭐⭐⭐ THE HYPOTHESIS THIS BRIEF WANTS CHECKED

### 3.1 The claim that is probably false

The refinement design was justified by naming a finite rule set and asserting its closure:

> **R1** `fn x => ?` (τ is an arrow) · **R2** `mlam X => ?` (τ is a Π) · **R3** `[Ψ ⊢ ?]`
> (τ is a box) · **R4** `c ? … ?` (c a constructor) · **R5** `f ? … ?` (f the theorem or a
> sibling) · **R6** `case s of …` · **R7** `x` from scope · **R8** `\x. ?` (LF Π) ·
> **R9** `h ? … ?` (LF atomic)
>
> *"These are not heuristics. They are the term grammar of Beluga, which is what generates
> every well-typed term there is; a tenth rule would mean a tenth term former."*

**That closure argument is wrong.** R1–R9 generate **applications of named things** at two
levels: computation terms and LF terms. Beluga is a *contextual* modal type theory, and it
has further syntactic sorts with their own formation rules, none of which appear above:

| sort | formed by | example in the corpus |
|---|---|---|
| **contexts** Ψ | `·`, a context variable `ψ`, `Ψ, x:A` | `[g, x:tm A[] ⊢ x]` |
| **substitutions** σ | `^` (shift), `..` (weakening/identity), `σ, M`, `$S` | `D1[.., _, D2]`, `M1[$W]` |
| **parameter variables** | `#p`, and projections `#p.k` | `impossible [ ⊢ #p]`, `#q.1[..]` |
| **the reconstruction placeholder** | `_` | `reify [_] _ _ (eval [_ ⊢ M] …)` |

**Orca has zero formation rules for any of these.** It can only emit a contextual object if
one happens to be a name already in scope.

### 3.2 The evidence, with a control

`scratch/probes/ctx-apparatus-census.mjs` classifies every residue leaf by whether the author's
term uses contextual apparatus, scored separately for leaves the search CLOSED and leaves it
did not — the lift, not the raw share:

| feature | unclosed (22) | closed (14) | lift |
|---|---|---|---|
| context extension `[g, x:A ⊢ …]` | 23% | **0%** | ∞ |
| substitution application `M[σ]` | 27% | **0%** | ∞ |
| substitution variable `$S` | 9% | **0%** | ∞ |
| parameter variable `#p` | 9% | 7% | 1.3× |
| **standalone `_`** | **32%** | **0%** | **∞** |
| **ANY of the above** | **68%** | **7%** | **9.5×** |

⭐ **Replicated independently on the solved-target control set** (75 leaves): standalone `_`
appears in 21% of leaves the search fails and **0%** of leaves it closes.

### 3.3 Why this single mechanism explains every prior negative

The mandate requires that a new hypothesis explain the existing zeros rather than just
predict a new win. This one does:

| measured zero | why a missing contextual sort predicts it |
|---|---|
| **precision** — hand the search each argument's exact type (0/45) | knowing a slot's type does not let you WRITE a substitution you have no rule for |
| **construction** — 1128 constructed candidates (0/45) | every one was an application of named things; none was a contextual object |
| **structure** — hand over the whole case tree (0/45) | the leaves still required contextual objects |
| **breadth** — every cap widened 128× (207/207 identical) | widening enumeration of the wrong sort adds nothing |
| **binder rules R1/R2/R8** (+1/111) | correct and necessary, but still the term layer |
| **termination made sound** (+1/111) | rejects wrong answers; does not create right ones |
| **depth 6→12, budget 200→3000 (2026-08-23)** | **0/13, with byte-identical call counts** — the search is not depth-limited or budget-limited; **it runs out of candidates** |

⭐ **And it mechanically explains the 10-token cliff** (44% of residue final leaves exceed
~10 tokens; the search solves 0–6% of those and 60% of the rest). Small leaves are plain
applications of names. Large leaves are where contextual apparatus appears. The cliff was
never about size.

### 3.4 What is already known to be true, and what is not

✅ **Established.** The search runs out of candidates rather than time (identical call counts
at 15× budget). Contextual apparatus is a 9.5× marker for failure with a control. `_` is a
real term former in Beluga's grammar that Orca never emits.

⛔⛔ **REFUTED ALREADY — the obvious first move does not work.** The cheapest contextual rule,
`_` as a candidate (R10), was built and measured on 2026-08-23. Both arms
declaration-verified, identical budget, `_` tried last with its own check budget so it could
not starve real candidates:

| + R10 | before | after | gains | losses | cost |
|---|---|---|---|---|---|
| residue, 36 leaves | 13 | **13** | **0** | 0 | **+52% calls** |
| solved control, 75 leaves | 58 | **57** | **0** | **1** | **+112% calls** |

**The highest-lift feature ever measured in this project converts nothing and doubles the
cost.** Eighth reach-without-payload result. Reverted to opt-in. Full record: entry 72.

### 3.5 ⭐⭐⭐ Why it failed — this is the part that shapes the question

Two obstacles, both found by building it:

1. **`_` type-checks HOLE-LOCALLY almost everywhere.** The refinement primitive elaborates
   with no declaration-level obligation, so it cannot distinguish "reconstruction will
   determine this" from "this is a real proof obligation." Added naively it turns the search
   into a yes-machine: every leaf of the small control "closed" with `[ ⊢ _]`. It also ate
   11 of 14 verification slots on the first residue leaf before being given its own budget.

2. **⭐ `_` IS NOT A SEARCH MOVE AT ALL.** It is an abbreviation the *author* uses because
   reconstruction will solve the object for them. Emitting it does not REDUCE the goal — it
   DEFERS the goal to a solver the search cannot consult incrementally. **A candidate the
   oracle cannot adjudicate is noise, not a move.**

⇒ **So the conclusion is not "the contextual sort does not matter." It is that the contextual
layer must be SOLVED — by unification — and not GUESSED, by search.** Refinement was the right
answer at the term layer *precisely because the checker adjudicates every step*. There is no
equivalent incremental adjudication for a contextual object. Finding one, or discovering that
Beluga already has one, is the question in §4.

⚠️ **Whatever you propose must name the oracle that adjudicates each step, and its cost.**
That, not the rule list, is where the previous design ran out.

---

## 4. The research question

> **What is the complete formation-rule set for Beluga's contextual layer — contexts,
> substitutions, parameter variables — and what does a proof search look like when those are
> first-class GOALS rather than text to be spelled?**

Concretely, a good answer addresses:

1. **The rules.** Enumerate the formation rules for context, substitution and parameter-variable
   objects in contextual modal type theory as Beluga implements it (Nanevski–Pfenning–Pientka
   2008; Pientka & Dunfield; Cave & Pientka on contextual LF and case analysis). State them so
   they can be implemented, not cited.

2. **⭐ Determined vs searched — THE HIGHEST-VALUE SUB-QUESTION, and §3.5 is why.** Which of
   these objects are *recoverable by higher-order pattern unification* — i.e. legitimately
   left to reconstruction — and which must genuinely be searched? What is the decidable
   fragment (Miller patterns), and how much of the corpus's apparatus falls inside it?
   If most contextual objects are DETERMINED, then the missing rule set is small and the real
   problem is **adjudication**: getting an incremental, cheap answer to *"is this object
   determined yet?"* mid-search. R10 failed precisely because it deferred to a solver the
   search could not consult.

3. **The adjudication problem from §3.5.** If `_` can only be judged at declaration level,
   what is the cheapest sound way to get that judgement inside a search loop? Does Beluga
   expose an abstraction/reconstruction check that answers "is this metavariable determined?"
   without a full reload?

4. **Prior art that actually did this.** Twelf's logic programming and `%mode`/`%worlds`
   checking; Beluga's own coverage checker (which *does* synthesise contexts and substitutions
   when splitting); Abella; ELPI/λProlog; Lean `grind`; any synthesis work that treats
   substitutions as first-class search objects. **What do they generate, and what do they
   refuse to generate?** Beluga's own coverage checker is the most interesting: it is inside
   the binary we already link, and it already constructs the objects Orca cannot.

5. **A reality check we are willing to hear.** Is 32%→~40% the honest ceiling for *any* known
   automatic method on a corpus of published metatheory (logical relations, Howe's method,
   POPLmark)? The project's standing stance is "a blocker is a bug in our algorithm, never a
   property of the target." **You are explicitly released from that stance for this question.**
   If the literature says otherwise, say so with citations — that is a more useful answer than
   an eighth mechanism.

---

## 5. ⛔ Refuted directions — do not propose these

Each has ≥1 measured negative behind it. Re-proposing one without new evidence wastes a day
we do not have.

- **Anything that adds, reorders, prunes, ranks or budgets CANDIDATES.** 22 gated attempts,
  0 gains. Reconfirmed 2026-08-23: depth 6→12 and budget 200→3000 gave 0/13 with identical
  call counts.
- **Iterative deepening.** Measured negative twice.
- **Anything premised on coverage being the blocker.** `split` is offered on 97% of stuck
  targets; the apparent coverage defect was a totality-pragma artifact.
- **Anything premised on term production at a hole being the blocker.** Three separate
  capability injections measured 0/45.
- **`_` as a search candidate (R10).** Built and measured 2026-08-23: 0 gains, 1 loss, 2× cost.
  See §3.5 — the lesson is about adjudication, not about the underscore.
- **"Supply capability X."** Precision, construction, structure and breadth were each handed
  over wholesale and each measured zero. The next design may not be another capability; it
  must change what a step *is* — or, per §3, what sort a step ranges over.
- **Per-target hunts.** Days of them produced +7 of 823.
- **Building the OCaml `ideProof*` shim / linking Harpoon's engine.** Investigated; the native
  JS engine was built instead.

---

## 6. Soundness — non-negotiable, and it has bitten five times

Beluga performs **no termination check without a `/ total /` pragma**, and the refinement
primitive elaborates with *no enclosing theorem at all*, so a successful check is
**well-typedness, never termination**. Unguarded, the search closes leaves with
`complete ms`, `nbe t`, `unique_eval d f` — the theorem applied to its own untouched inputs.
Five false COMPLETEs have been banked this way historically; 12 more circular closes were
caught in one day by declaration-level verification.

**A percentage containing circular proofs is worse than a lower honest one.** Any proposal
must say how its results are verified. In this project the answer is: splice the term into the
declaration, restore `/ total /`, reload the program, and let Beluga rule.

⚠️ One trap worth inheriting: the engine's own `decSubderivNames` (which names the
structurally-smaller descendants of the decreasing binder) **under-approximates by design** —
its own comment says "a miss costs a candidate, never a wrong one." It is a sound *accept*
test and an unsound *reject* test. Using it to reject immediately refused a close that Beluga
verifies.

---

## 7. Measurement discipline you are expected to inherit

These were each paid for with a burned session or a false headline.

- **Every census gets a CONTROL drawn from the successes. Report the LIFT, never the raw
  share.** A feature in 80% of failures and 75% of successes explains nothing.
- **Reach is not payoff.** Seven measured reach numbers — 40%, 66.7%, 35.7%, 9.5×, and a
  perfect structure handed over on 45/45 — every one with a verified-active component, and
  essentially all converting zero.
- **Size by a FIRING COUNTER during real runs**, never over corpus text (overstated 4× and
  24×) and never over declarations (overstated 3.5×).
- **Confirm a POSITIVE on a known-good target before believing any NULL.** Three searches in
  this arc had their nulls invalidated by controls that were run first.
- **An unverified close is not a result.** A hole-local `OK` means nothing until the
  declaration checks.
- **A background sweep pins the code it runs on.** Editing the mechanism mid-sweep silently
  mixes two builds into one output file; it cost a whole A/B on 2026-08-22.
- **Composite moves are atomic.** A 3-part move built 2/3 of the way measures zero even at 40%
  reach. Count the pieces first; build all of them behind one toggle or do not start.

---

## 8. What a good proposal contains

1. **The rule set, named and finite**, with an argument that its closure covers the fragment —
   and, unlike the nine rules above, an explicit statement of **which syntactic sorts it
   ranges over**.
2. **A firing counter**, not a text census: how often does the rule actually fire during a
   real run?
3. **A numeric stake declared before building**, and a kill criterion.
4. **One experiment runnable in a day.** Ten days total.
5. **How results are verified** (see §6).
6. **Why no tenth rule is needed for the next unseen shape** — or an honest statement that the
   set is open-ended, which is itself a finding.

---

## 9. Repo orientation (not required reading)

| what | where |
|---|---|
| the god doc — direction, ledger, every slice as numbered entries | `prover-master-plan.md` (entries 60–72 are this arc) |
| paste-into-a-fresh-agent orientation | `prover-agent-kickoff.md` §0, §0.4 |
| domain background + corpus specimens (**still current**) | `orca-research-brief-v3.md` §2, §3 |
| the mandate | `ORCA-MANDATE.md` |
| the refinement search | `scratch/probes/leaf-synth3.mjs` |
| ask the primitive any expression at a leaf (**start here**) | `scratch/probes/ci-ask.mjs` |
| which candidate is missing, and why | `scratch/probes/ls2-diag.mjs` |
| declaration-level verification | `scratch/probes/ls3-verify.mjs`, `ls3-vleaf.mjs` |
| whole-target composition | `scratch/probes/ls3-whole.mjs` |
| the apparatus census of §3.2 | `scratch/probes/ctx-apparatus-census.mjs` |
| engine source | `js/editor-src/prover/` |

---

## 10. Honest summary

The refinement primitive is real and it works: leaf synthesis went from 2/5 to 58/75 in a day,
and below ~10 tokens it is essentially solved. Above that line it is not, and the composed
design tops out at 13% of the hardest residue class **even when handed a perfect proof
structure for free**.

The best current explanation is that the rule set was declared complete when it covered only
the term layer, and that Beluga's contextual layer — contexts, substitutions, parameter
variables, and the `_` that stands in for them — has no formation rules at all. That
explanation has a 9.5× controlled lift behind it and it accounts for all seven prior zeros
with one mechanism.

It has also not yet converted anything — and the cheapest rule built against it (`_`) is a
measured negative that cost 2× and lost a target. What that negative bought is a sharper
question: **the term layer yielded to refinement because the checker adjudicates every step,
and the contextual layer has no such incremental adjudication.** Supply that, or show it
cannot exist, and this is decided either way.

**We would rather have a sharp negative in two days than a plausible mechanism in ten.**

---

## 11. ⛔⛔ ANSWERED AND CLOSED — read this before acting on §4 (added 2026-08-23, entry 73)

**A deep-research pass was run against this brief on the day it was written, and its central
remedy was tested and refuted the same day.** §§1–3 and §5–§10 stand. **§4's framing does not.**

**What the research got right.** The contextual layer's formation rules are finite and known;
the objects are **~90% DETERMINED rather than searched** (identity/weakening substitutions,
`u[σ]`, context extensions from splitting, and `_` are all pattern-fragment objects
reconstruction solves; only parameter-variable/projection choice and rare schema witnesses are
genuinely searched). That partition is the durable result of the pass. Its ceiling argument
(§(f) of the report — Harpoon `auto` explicitly excludes schemas, parameter variables and
substitution variables; Twelf cannot do logical relations; no system reports corpus-scale
automation on POPLmark-reloaded) is well-sourced and consistent with our own +7.5-point number.

**What it got wrong, and what we found at the source.** It concluded no cheap incremental
"is-this-determined?" oracle exists, reasoning from Pientka (JFP 2013) on abstraction as a
whole-declaration post-pass. In fact `Unify.StdTrail` exports `unresolvedGlobalCnstrs`,
`globalCnstrs`, `forceGlobalCnstr`, and `src/web/beluga_web.ml` (inside our security boundary)
already uses them. We added `ideAdjudicate` and rebuilt: **4–7 ms per verdict vs ~3–5 s for a
reload.**

⛔ **But it is the wrong oracle.** The constraint store tracks postponed *unification
problems*, not undetermined *metavariables*. `[ ⊢ _]` creates a metavariable with no
constraint at all, so it comes back **SOLVED**; POSTPONED never fired once across every leaf
tested. Determinedness really is decided by abstraction (`Abstract.exp`'s free-variable
context), and reaching that needs the elaborated term out of `elaborate_in_hole` — a core-file
edit.

⛔⛔ **That edit is not worth making, and this is the decisive point.** Entry 72's R10 already
ran this mechanism **with a perfect oracle**: under `LS3_STRICT` every `_`-bearing close was
adjudicated by splicing it into the declaration, restoring `/ total /`, and reloading — ground
truth itself — with `_` available at every hole including argument positions. Result:
**residue 0 gains, control 0 gains and 1 loss.** With a perfect determinedness oracle the
mechanism converts nothing, so making that oracle cheap changes the **cost**, not the
**outcome**. The hypothesis "the deficit is adjudication, not rules" is falsified by an
experiment run the day before it was proposed.

⇒ **Do not re-propose an adjudication oracle.** If you are picking this up cold: the open
question is no longer "how do we adjudicate contextual objects cheaply" — it is whether
anything at all converts the residue's large leaves, and three independent routes now say no
(determined-objects analysis, perfect-oracle refutation, and the 13% structure-oracle ceiling).
