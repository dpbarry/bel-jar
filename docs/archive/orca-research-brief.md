# Orca — Research Dossier for a Cold-Start Agent — **superseded** (archive)

**Superseded by:** [`orca-research/orca-research-brief-v3.md`](orca-research/orca-research-brief-v3.md) (partial) and [`orca-research/orca-research-brief-v4.md`](orca-research/orca-research-brief-v4.md).

---

# Orca — Research Dossier for a Cold-Start Agent

**Purpose.** Design a proof-search algorithm for the Beluga proof assistant that is
materially better than anything that exists. This document assumes **no prior knowledge** of
Beluga, Harpoon, LF, or this codebase.

**Status date:** 2026-08-17. Every number below is measured, not estimated; the instrument
that produced it is named so you can re-run it.

**How to read this.** §1–3 are domain. §4 is the system as built. §5 is measured state.
§6 is every direction already tried and its outcome — *read this before proposing anything*.
§7 is the soundness trap. §8 is prior art. §9 is the single most important discovery in this
document. §10–12 are open directions, laws, and the proposal rubric.

---

## 0. Mandate

- Current: **271 of 850 corpus targets proved (31.9%)**.
- Rate of progress: **~+0.2%/day**. **This is unacceptable and is why this dossier exists.**
- Reaching 90% means converting **~492 of the ~494 available in-fragment targets** — i.e.
  essentially the entire remaining analytic fragment. No sequence of small mechanisms
  reaches that; the arithmetic alone rules it out.
- Wanted: an algorithm that **decides** rather than **samples** — a decision procedure by
  construction over a declared fragment.
- **Novelty alone is worthless.** ~30 mechanisms have been built and measured; the failure
  modes are consistent and documented in §6. A proposal that repeats one will be rejected
  without measurement.

### Hard constraints

1. **Must emit a checkable proof term.** Twelf's meta-prover does not; that is treated as a
   defect, not a simplification.
2. **Must own termination.** Beluga does *not* check termination absent a `/ total /`
   pragma. This system has already shipped false proofs for exactly this reason (§7).
3. **Must handle what dominates the real corpus**: context block schemas, parameter
   variables `#p`, substitution variables `$S`, context variables. The published
   state-of-the-art Beluga tactic excludes all three.
4. **Must be measured on the whole corpus** with masking-based falsification, not case
   studies.
5. **Speed is correctness.** A proof at 30 min / 15k checker calls is a defect.

---

## 1. Beluga: the type theory you must understand

Beluga is a proof assistant for **mechanised metatheory** — proving properties *about*
formal systems (type safety, normalisation, confluence), not proving mathematics.

### 1.1 Two layers

**Specification layer — LF** (Edinburgh Logical Framework). A dependently-typed λ-calculus
used to *encode* an object language. Object-language binding is represented by LF binding —
**higher-order abstract syntax (HOAS)** — so α-equivalence and capture-avoiding substitution
are inherited rather than axiomatised.

```
LF tm : type =
| app : tm -> tm -> tm
| lam : (tm -> tm) -> tm      % the argument is a FUNCTION. This is HOAS.
;

LF step : tm -> tm -> type =
| beta : step (app (lam \x. M x) N) (M N)     % substitution is LF application
| s_app1 : step M M' -> step (app M N) (app M' N)
;
```

LF terms are in **canonical (β-normal, η-long) form**. The core judgment is
`Γ ⊢ M ⇐ A` (M checks against type A in context Γ). Type families are indexed
(`step : tm -> tm -> type`), which is what makes the framework dependent.

**Reasoning layer — a dependently-typed functional language over *contextual objects*.**
A proof is a **total, structurally recursive program**; the theorem is its **type**. This is
Curry–Howard taken literally: proof search here *is* program synthesis.

### 1.2 Contextual modal type theory (Nanevski–Pfenning–Pientka)

The distinguishing feature. An LF object is never bare; it is always paired with the context
it inhabits.

| construct | meaning |
|---|---|
| `[g ⊢ M]` | a **contextual object** — term `M` in context `g` |
| `[g ⊢ A]` | a **contextual type** |
| `g` | a **context variable** |
| `schema ctx = tm + block (x:tm, u:eq x x)` | a **schema** — what may appear in a context |
| `#p` | a **parameter variable** — stands for *some variable* drawn from the context |
| `$S` | a **substitution variable** — stands for a substitution between contexts |
| `b : block (x:tm, u:eq x x)` | a **block** — correlated assumptions, projected `b.1`, `b.2` |
| `M[..]` | **weakening** — M transported along the identity substitution |
| `M[.., x]` | M under an extended context, with `x` supplied |
| `M[$S]` | M under substitution `$S` |

**Meta-types** classify these: `(g ⊢ A)` boxed types, `#(g ⊢ A)` parameter types,
`$(g ⊢ h)` substitution types, `ctx` schemas.

**Judgments a search algorithm must respect:**

- `Δ; Γ ⊢ e ⇐ τ` — computation-level checking (Δ = meta-context, Γ = computation context)
- `Δ ⊢ Ψ ⇐ schema` — **schema satisfaction**: does this context conform?
- `Δ ⊢ σ : Ψ → Φ` — substitution well-formedness
- coverage — does a set of patterns exhaust a contextual type?
- termination — is the recursion structurally decreasing per the declared order?

**Substitution is not bookkeeping — it is proof obligation.** Weakening `[g ⊢ M]` to
`[g, x:tm ⊢ M[..]]` requires the right explicit spelling. Getting it wrong is a type error,
and mis-spelled substitutions are ~19% of all rejected candidates in this system (§5.3).

### 1.3 Totality — the load-bearing detail

```
rec f : [ |- nat] -> [ |- nat] =
/ total x (f x) /          % measure: recursion decreases on x
fn x => ...
```

- **With** an aligned pragma, Beluga enforces structural descent
  (`"Recursive call not structurally smaller"`).
- **Without** a pragma, Beluga performs **no termination check at all**. `fn x => f x`
  typechecks and is accepted.

Verified directly (`Beluga-W/.../main.exe` on a two-line fixture): circular + aligned pragma
→ rejected; circular + no pragma → **accepted**; circular + wrong-arity pragma → rejected
("too many arguments"). A pragma that is arity-correct but whose measure lands on an
*implicit* argument → **accepted vacuously**. This is §7.

### 1.4 Why automation here is harder than Coq/Agda

- **No library to mine.** Each development is self-contained → premise selection (hammers)
  has nothing to select from.
- **Goals are not first-order entailments** but inhabitation problems in a dependent theory
  with HOAS. FOL translation destroys the structure that matters.
- **Context reasoning is first-class**: weakening, strengthening, schema satisfaction,
  substitution composition are all proof obligations.
- **Coverage is genuinely hard.** Schürmann & Pfenning (TPHOLs 2003): *"splitting failure
  due to incompleteness of the unification may happen while checking coverage of a
  definition by case analysis over complex dependent inductive types, **even if rules for
  all constructors are given**."*

---

## 2. Corpus specimens (what the algorithm actually faces)

### Specimen A — routine structural induction (currently solved)

```
rec ceq : (g:tctx) Deq [g |- T] [g |- S] -> Aeq [g |- T] [g |- S] =
/ total d (ceq g t s d)/
fn d => case d of
| De_l d       => Ae_l (ceq d)
| De_a d1 d2   => Ae_a (ceq d1) (ceq d2)
| De_r [g |- T] => ref [g] [g |- T]
| De_t d1 d2   => trans (ceq d1) (ceq d2)
| De_v         => Ae_v
;
```
Requires: split on a computation-level hypothesis, recursive calls on case components,
application of two sibling lemmas (`ref`, `trans`). **This shape is within reach.**

### Specimen B — logical relations (Twelf cannot even express this)

```
rec logEqSym : {T:[|- tp]} LogEq [g |- M1] [g |- M2] [ |- T]
            -> LogEq [g |- M2] [g |- M1] [ |- T] =
/ total t (logEqSym g m1 m2 t) /
mlam T => fn e => case [|- T] of
| [|- i] => let LogBase a = e in LogBase (algEqNSym a)
| [|- arr T1 T2] =>
  let LogArr [g |- M1] [g |- M2] f = e in
  LogArr [g |- M2] [g |- M1] (mlam h,$W, N1, N2 => fn rn =>
          let e' = logEqSym [|- T1] rn in
          logEqSym [|- T2] (f [h] $[h |- $W] [h |- N2] [h |- N1] e'))
;
```
Requires: induction on a **type index** (not a derivation); construction of a higher-order
argument (`mlam …`) containing **two nested recursive calls**; a **substitution variable**
`$W` passed as `$[h |- $W]`; application of a higher-order hypothesis `f` to five arguments.
Recursive types make this inexpressible in Twelf's M2.

### Specimen C — parameter variables, blocks, context induction

```
rec exTRelV : {#p: #[l |- term]} Crel [l] [h] -> ExWkV [h] [l |- #p] =
mlam #p => fn cr => let (cr : Crel [l] [h]) = cr in case [l |- #p] of
| [l, x:term |- x]      => let Crel_xa (cr' : Crel [l0] [h0]) = cr in
                           ExWkV/c (TRvar0 [h0] cr')
| [l, x:term |- #p[..]] => let Crel_xa cr' = cr in
                           let ExWkV/c tr = exTRelV [l |- #p] cr' in ExWkV/c (TRvar tr)
;
```
Requires: splitting a **parameter variable** into "is the newest variable" vs "is further in",
recursion **on the context**, and weakening spellings (`#p[..]`). Note also the
**type-ascription re-binding** idiom `let (cr : Crel [l] [h]) = cr in`, which is needed to
make an implicit context variable writable.

### Specimen D — the block-extended recursive result

```
| [g |- lam \x. M] =>
  let TRlam tr1 = r in
  let [h, b:block (y:term, _t:aeq y y) |- AE[.., b.1, b.2]] = ref' tr1 in
    [h |- ae_l \x. \w. AE]
```
The recursive call's result is bound **under a context extended by a block**, with the
metavariable applied to the block's **projections**, and then cited **under two lambda
binders**. Roughly half the hard residue needs this shape.

---

## 3. Harpoon — Beluga's interactive prover

Tactic-driven; produces a script that elaborates to a checked Beluga program. Tactics:
`intros`, `split`, `invert`, `msplit`, `unbox`, `solve`, `by`, `suffices`.

**Built-in automation** (toggled by `toggle-automation`):

| automation | behaviour |
|---|---|
| `auto-intros` | introduces assumptions on a function-typed subgoal |
| `auto-solve-trivial` | closes a subgoal whose type is convertible with an assumption's. *Never solves the last remaining subgoal* |
| `auto-invert-solve` | solves when no splitting beyond inversions is needed; bounded DFS at computation + LF levels |
| `inductive-auto-solve` | splits on a **user-named** variable, then `auto-invert-solve` per case |

**The induction variable is supplied by the human.** That is the shipped baseline to beat.

---

## 4. Orca as built

### 4.1 Architecture

```
 ┌───────────────────────────────────────────────┐
 │ Orca — JavaScript, ~16.7k lines             │
 │  • model of theorem + open holes              │
 │  • candidate MOVE generation (as TEXT)        │
 │  • greedy DFS + chronological backtracking    │
 └──────────────┬────────────────────────────────┘
                │ emits a WHOLE PROGRAM as a string
                ▼
 ┌───────────────────────────────────────────────┐
 │ Beluga (OCaml → js_of_ocaml)                  │
 │  returns: ok / not-ok  +  an error string     │
 └───────────────────────────────────────────────┘
```

**Move vocabulary:** `intro`, `split`, `invert`, `fill`, `recurse`, `lemma`, `synth`,
`impossible`.

**Loop:** parse holes from the checker's report (goal, context, metavariables) → select one
hole (leftmost arm, DFS) → generate candidate texts → try each against the checker → accept
the first that typechecks without increasing the error count → repeat. Dead end backtracks
chronologically over *every* accepted move.

### 4.2 The defining constraint

**The interface to the logic is one bit plus an error string.** Orca has no type system of
its own; it cannot know whether a term is well-typed except by asking. Consequences:

- It emits several **spellings** of the same idea and lets the checker arbitrate — the
  internal "dual-spell, never rename" doctrine. E.g. for one fill it may emit
  `[h |- E]`, `[_ |- E]`, `[h |- E[..]]`, `[h, b:block(…) |- E[.., b.1, b.2]]`.
- Guess-and-check at scale explodes → prefilters, budgets, caps, depth bounds accumulate.
- Every divergence between the string model and real semantics requires a targeted repair.

Source census: **~773 lines** touch spelling/variant/writability/guard/budget concerns vs
**~183** touching unification/substitution — about **4:1**. ~24% of the file is comments,
mostly documenting a failure that cost a debugging session.

### 4.3 Move generation, in detail

| move | what it emits |
|---|---|
| `intro` | `fn X => ?` / `mlam X => ?` from the goal's telescope |
| `split` | `case S of \| pat1 => ? \| pat2 => ?` — patterns built by enumerating the scrutinee family's constructors, with index unification against the scrutinee (`matchIndices`) and a rigid-head conflict pruner |
| `invert` | `let [g \|- ctor S] = d in ?` — a one-branch case |
| `fill` | a closing term. Constructor of the goal head applied to arguments chosen from `fillScope` = let-bound results + hypotheses + metavariables. **Arguments are selected by type-family HEAD only**, though the constructor's own result indices *are* unified against the goal and the substitution pushed into slot types |
| `recurse` | `let [Γ \|- R] = thm args in ?` — an IH call; the decreasing slot is gated by `decOk` |
| `lemma` | as `recurse`, for sibling theorems |
| `synth` | invokes an internal SLD backward-chaining engine (`prover-synth.mjs`, 2.2k lines) over a declared fragment |

**Known structural limits of generation:**
- higher-order argument slots draw candidates *only* from let-bound recursion results;
  empty pool ⇒ the whole constructor is dropped (§5.4)
- argument selection ignores index information (family head only)
- combination caps: 4 / 6 / 12 / 48 depending on site

### 4.4 The corpus and masking harness

- **850 targets** — every `rec`/`proof` in Beluga's own example library.
- **Masking**: take a real proof, replace its body with `?`, re-derive. The author's proof is
  ground truth and is never shown to the engine.
- Orchestration: suite prelude + already-complete siblings are kept, other holed declarations
  stripped, then the target is masked.
- **This is a genuine falsification instrument and is better than standard practice in this
  field**, where evaluation is by case study. No corpus-scale evaluation of metatheory
  automation has been published.

---

## 5. Measured state

### 5.1 Headline

| | |
|---|---|
| **Proved (genuine)** | **271 / 850 (31.9%)** |
| in-fragment STUCK | 402 |
| TIMEOUT | 92 |
| out of fragment by construction (coinductive / fun-copattern) | ~74 |
| programs that do not themselves typecheck | 27 |
| **analytic ceiling** | **~91%** |

### 5.2 Residue by bucket (current ledger, `prover-residue-audit.mjs`)

```
STUCK:no-move            MEDIUM(9-25)     72     STUCK:no-move        SMALL(<=8)  70
STUCK:no-totality-measure MEDIUM          55     coinductive(by-design)           49
TIMEOUT                  MEDIUM           34     STUCK:step-bound     MEDIUM      34
STUCK:no-totality-measure LARGE           30     TIMEOUT              SMALL       30
STUCK:no-move            TINY-noncase     25     STUCK:no-move        LARGE       24
STUCK:step-bound         SMALL            20     STUCK:no-totality    TINY        20
STUCK:no-totality-measure SMALL           19     TIMEOUT              LARGE       18
ref-uses-fun/copattern (out-of-fragment)  13     STUCK:step-bound     LARGE       10
```

### 5.3 Why the search stops (207 cheap-death targets, `death-census.mjs`)

| | |
|---|---|
| targets that ever hit a hole with **zero** candidates | 8 (4%) |
| deepest dead end = candidates generated, all checker-rejected | 182 (88%) |
| rejections that are **type** errors | ~72% |
| rejections that are **scope** errors (free ctx var / free meta / not closed) | ~19% |
| rejections that are parse errors | ~2% |

**The engine is not short of moves. It emits semantically wrong terms at scale**, because
nothing in it can tell they are wrong before the checker does.

### 5.4 Constructor reach (77 scored dead-end holes, `ctor-reach-census.mjs`)

| | |
|---|---|
| proposed every constructor the reference needs | 40% |
| **missed ≥1 needed constructor** | **60%** |

Of missing constructors, **73% are higher-order (binder-taking)** vs 7.7% of proposed ones —
**9.5× enrichment**. Located cause: a higher-order slot draws only from let-bound recursion
results and returns empty otherwise, dropping the enclosing constructor entirely.

### 5.5 Induction-hypothesis availability (all 391 in-fragment stuck, `recurse-offered-census.mjs`)

| | |
|---|---|
| offered `recurse` anywhere | 129 (33%) |
| offered `lemma` anywhere | 129 (33%) |
| **offered NEITHER** | **180 (46%)** |
| offered `split` anywhere | 380 (97%) |

Of those 180, **164 (91%) provably need one**: 86 self-recurse, 72 both self-recurse and
call siblings, 6 lemmas only, 16 neither. Average **1.78 calls per proof** — these are
*shallow* proofs. **Every lemma they call already exists as a sibling declaration**, so no
lemma speculation ("cut") is required for this population.

**This is the largest single measured gap: 46% of the residue is never offered any way to
use induction, while being offered case analysis 97% of the time.** It has ≥3 distinct
causes (untotalied + box premise: 44; untotalied without box premise: 69; totalied yet still
no IH: 67).

---

## 6. Directions already tried, and what they measured

**The most important section.** ~30 mechanisms built, each gated by full test suite +
corpus differential.

### 6.1 The one-directional ROI law (~20 gated attempts)

- **Everything that ever paid was a MISSING MOVE or MIS-EMITTED TEXT**: poisoned decreasing
  slot (+3), higher-order ctype construction + accessibility chain (+6), type-ascription
  re-binding (+2), inferred-index spelling variants (+1, and 713→37 checks on one target),
  ctype inversion + nested-case parenthesisation (+3).
- **Everything that was PRUNING or RANKING returned 0 or negative**: unwritable-context
  variants (instant loss, 47→645 checks on one target), invented-name guard (failed a
  soundness pin), comp-application family check (0), ctype-ctor θ twin (0), relaxed
  ascription limiter (+11% checks), inverts-before-recurses (+35% checks). Only two pruning
  ideas paid at all, and only in **speed**.
- **No completion has ever come from pruning.** A no-move target's search is *exhausted*;
  cheaper candidates cannot help it.

### 6.2 Candidate-pool shaping is dead in BOTH directions

- **Filtering** the largest rejection class (41% of rejections — structurally invalid LF
  arguments): **−4.1% checks, 0 gains, 0 losses.** Reverted.
- **Widening** every generation cap 4→64 / 6→96 / 48→512 / 12→128 across the full
  207-target class: **207/207 identical verdicts, 0 changes, +4.4% checks.**

⇒ The correct term is **absent from the pool**, not buried in it. Fills are inhabited by
*lookup*; a slot needing a **constructed** term cannot be filled at any cap.
**"Generation pays" ≠ "more candidates pays". It means more expressive construction pays.**

### 6.3 Composite moves are atomic

A three-part move built two-thirds of the way measured **zero** completions at a verified 40%
reach. Re-confirmed: a higher-order slot-filling mechanism built as "piece 3 of 3" measured
**2/31 with +69.9% checks** — and the post-mortem showed the pieces were in the wrong
*order*; the blocker was upstream (no IH available), so everything downstream measured zero
by construction.

### 6.4 There is no mass class left

Three independent instruments: feature census over all 552 stuck (every syntactic feature
3–20%); error census over 1341 rejections (the one 41% class is **4% of checks**); step-map
(56% die at step 0, consuming 18% of checks).

### 6.5 Per-target hunting

Days of per-target root-causing produced **+7 of 823**.

### 6.6 Untotalied recursion (instructive failure)

Opening recursive-call generation for author-untotalied theorems:
**11 gains, 0 losses, −11.2% checks — and 10 of the 11 were circular proofs.** Reverted. §7.

### 6.7 The fragmentation result

Every attempt to isolate a workable class subdivided rather than concentrating:

> 577 residue → 202 cheap deaths → 75 scored holes → 30 higher-order drops → 17 never
> offered recursion → {9 no-totality-measure, 8 no-move} → {1 ctype premise, 16 all-box}

Six levels, no concentration. **This is the empirical case that a new algorithm is required
rather than more mechanisms.**

---

## 7. The soundness trap

Beluga does not check termination without a pragma ⇒ `checked.ok` is **not evidence of a
proof** for an untotalied theorem.

Orca contains a **measure fork**: when a theorem has no pragma, it *invents* one and
retries. An invented measure can be arity-correct yet land on an **implicit** argument,
satisfying the totality check **vacuously**. It produced:

```
rec halts_step : {S:[ |- step M M']} [ |- halts M'] -> [ |- halts M] =
/ total s (halts_step s _ _ _) /       % INVENTED by the engine; not in the source
mlam S => fn s => case s of
  | [ |- halts/m X X1] : [ |- halts M] => halts_step [ |- S] s   % self-call, unchanged arg
;
```

**Beluga accepts this.** The theorem is proved by itself. **Five such false proofs existed in
the 273-target ledger.**

The structural guard (`decOk`) is sound but guards only the **IH/recurse** route; these calls
arrived through the **fill** route and never consulted it. A certification-time
well-foundedness check now blocks them (a self-application is well-founded iff ≥1 argument is
a strict sub-derivation). After the fix: differential 199/199, and 0 circular among all 109
untotalied completions.

⚠️ Two of the false proofs (`exTRel`, `exTRel'`) are the very targets the codebase cites as
evidence that an earlier policy was "measured sufficient". **That evidence was partly false
proofs.**

**Implication: termination must be YOUR invariant, not the checker's.** A percentage that
includes circular proofs is worse than a lower honest one.

---

## 8. Prior art you must understand

### 8.1 Directly ancestral

**Twelf's meta-theorem prover / M2** — Schürmann & Pfenning, CADE-15 1998; Schürmann's CMU
thesis *Automating the Meta-Theory of Deductive Systems* (2000).
Algorithm: **Filling, Recursion, Splitting**, *sequentialised **without backtracking***
(default order FRS, configurable RFS). Filling = iterative deepening with size bounds;
Recursion = appeal to the IH on smaller arguments per the termination ordering
(`maxRecurse`); Splitting = all constructors in the signature (`maxSplit`).
Proves type preservation for MiniML, Church–Rosser for STLC, cut-admissibility for FOL.
**Limits:** Π₂ statements only; **no recursive types ⇒ logical relations inexpressible**;
**produces no proof terms** ("proof realization as logic programs is presently disabled") so
results are unverifiable; the user supplies the termination ordering via `%prove`.

**Semi-Automation of Meta-Theoretic Proofs in Beluga** — Schwartzentruber & Pientka, LFMTP
2023 (arXiv 2311.10439). **A sound and complete focusing calculus for the core of Beluga's
logic**, shipped as Harpoon's `auto` tactic.
Judgments: uniform LF `Δ;Ψ ⇒ᵘ A`; focused LF `Δ;Ψ > x:A ⇉ P`; computation-level uniform
right `Δ;Γ ⇒ᴿ τ`; uniform left `Δ;Γ ≫ Γ′ ⇒ᴸ ⌈Ψ⊢P⌉`; focused `Δ;Γ > y:τ ⇒ ⌈Ψ⊢P⌉`.
Invertible rules applied to exhaustion, then focus on one assumption and decompose to atoms;
**dependent** function assumptions resolved by **unification**, non-dependent by search.
**Completeness is with respect to cut-free derivations.** Recursive types treated as atomic.
Depth bound default 3. Induction variable supplied **by the user, by position**.
**Explicitly unsupported: context block schemas, parameter variables, substitution
variables.** Evaluated on case studies. The authors state: *"Beluga's proving power does not
yet surpass that of Twelf's."*

**Abella** — two-level logic, ∇-quantifier / nominal abstraction; interactive; core search
restricted to definitional unfolding and pattern matching; schema tacticals remove
administrative lemmas.

### 8.2 Proof-theoretic machinery

- **Focusing / uniform proofs** — Andreoli; Miller–Nadathur–Pfenning–Scedrov. Partition rules
  into invertible (asynchronous) and non-invertible (synchronous). Invertible rules apply
  eagerly in any order and **need never be backtracked**; the only branching is the choice of
  focus. The standard way to make proof search canonical.
- **Focused Inductive Theorem Proving** — Baelde & Miller (IJCAR 2010); the **Tac** prover.
  Focusing for a logic with induction/coinduction as fixed points; whole Prolog-like
  computations collapse into a single synchronous phase.
- **Cyclic proofs / infinite descent** — Brotherston et al. Build a possibly-cyclic
  derivation, then check a **global** soundness condition instead of a local measure.
  Directly relevant given §7.

### 8.3 Inductive theorem proving (Boyer–Moore lineage)

**PLTP (1973) / NQTHM / ACL2.** The mature literature on *choosing* the induction. ACL2
generates **all plausible induction schemes** suggested by how functions recursively
decompose their arguments in the conjecture, scores each by a **"hitting ratio"**, merges
compatible schemes, **vetoes** ones that "flaw" others, and proceeds with the best;
overridable by an `:induction` hint.
**Relevance: Orca picks a single decreasing slot. Twelf and Beluga both require the human
to supply the induction. Nobody in the LF family infers it. This is a genuine opening.**

**Proof planning** — CLAM, IsaPlanner. **Rippling** as search control for induction;
**lemma speculation** and **generalisation** as failure-driven critics; **theory exploration**
for automatic lemma discovery. This is the literature for the step Orca defers.

### 8.4 Type-directed program synthesis

Via Curry–Howard, "find a term of this type" *is* proof search.
**Synquid** (polymorphic refinement types), **Myth** (type-and-example-directed), **SuSLik**
(separation logic). SuSLik explicitly adopts focusing: it *"designates some rules… to be
invertible; these rules can be applied eagerly and need not be backtracked."*
All maintain a **typed internal representation** and use **unification** to decide rule
applicability — the opposite of emitting text and asking an oracle.

### 8.5 Deliberately NOT applicable

**CoqHammer / sauto / Tactician / Proverbot9001.** Hammers work by premise selection over a
large library + FOL translation + reconstruction. Beluga developments are self-contained and
the goals are not FOL entailments. Citing these as models signals unfamiliarity with the
problem.

### 8.6 Benchmarks

POPLmark; the ORBI open challenge repository for systems supporting binders; the list-machine
benchmark. These are **challenge problems**, not evaluation harnesses.

---

## 9. ⭐ The discovery that should shape your proposal

**Beluga's own proof search engine, unifier, coverage checker and totality checker are
compiled into the binary Orca already talks to — and are not exposed.**

`Beluga-W/src/core/` (37 modules):

| module | lines | what it is |
|---|---|---|
| **`logic.ml`** | **6,155** | **the logic-programming + focusing proof-search engine** |
| `coverage.ml` | 3,648 | coverage checking / case splitting |
| `unify.ml` | 3,312 | higher-order unification |
| `check.ml` | 1,757 | computation-level type checking |
| `total.ml` | 1,722 | totality / termination |
| `order.ml` | — | termination orders |
| `interactive.ml`, `holes.ml`, `command.ml` | — | the interactive/hole layer |

`logic.mli` exposes, among others:

```ocaml
module Convert : sig
  val comptypToCompGoal : Comp.typ -> comp_goal
  val comptypToMQuery   : Comp.typ * Id.offset -> mquery * Comp.typ * LF.msub * ...
end
module Solver  : sig val solve   : LF.mctx -> LF.dctx -> query -> (…) -> bound -> unit end
module CSolver : sig val cgSolve : LF.mctx -> Comp.gctx -> Comp.ihctx -> mquery ->
                                   (Comp.exp -> unit) -> (bound * bound * int) -> … -> unit end
module Frontend: sig val msolve_tactic : … -> (Comp.exp option) end
```

`logic.ml`'s author list includes **Johanna Schwartzentruber** — i.e. **the LFMTP-2023
focusing calculus is implemented here**, `enableLogic = ref true`, and `cgSolve` returns a
`Comp.exp` (a real proof term).

**The web shim `Beluga-W/src/web/beluga_web.ml` is 423 lines** and exposes only:
`checkFromString`, `loadFromString`, `runCommand`, `ideTypeAtJson`, `ideDeclType`,
`ideCommandJson`, `getCommittedFingerprint`.

**So the one-bit interface described in §4.2 is a property of a 423-line shim, not of
Beluga.** Orca reimplements — in strings, at 4:1 spelling-to-semantics — machinery that
already exists, compiled, in the same process.

### 9.1 Already reachable *today*, with no OCaml rebuild

`runCommand` dispatches Beluga's interactive command table, which includes:

| command | usage | relevance |
|---|---|---|
| `solve-lf-hole` | `solve-lf-hole N` | *"Use logic programming to solve an LF hole."* Invokes `Logic.prepare()` + the solver |
| `split` | `split H V` | *"Try to split on variable V in hole H"* — **coverage-correct** splitting |
| `intro` | `intro H` | introduce on a hole |
| `constructors-comp` | — | enumerate a computation family's constructors |
| `constructors` | — | enumerate an LF family's constructors |
| `query` | `query EXPECTED TRIES TYP` | LF logic-programming query |
| `get-type` / `type` / `fsig` / `fdef` | — | typing queries |
| `printhole` / `lochole` / `countholes` / `lookuphole` | — | hole inspection |

Compare against §5.3–5.5: 60% of dead ends never propose the needed constructor
(`constructors-comp` enumerates them); ~72% of rejections are type errors (a unification
query decides applicability); splits that never certify (`split H V` is coverage-checked).

**This is the cheapest high-value experiment available and it has never been run.**

### 9.2 The obvious objection, stated fairly

Exposing `cgSolve` would make Orca a *front-end to Beluga's own prover*, which is
excellent engineering but weaker as a research contribution — and that prover is explicitly
incomplete for **block schemas, parameter variables and substitution variables**, i.e. much
of the hard corpus (§2 specimens C and D). The interesting design is therefore probably
**hybrid**: use Beluga's unifier/coverage/solver as *decision primitives*, and build the
novel algorithm — induction inference, context reasoning, termination — **above** them, in
the space the published calculus leaves open.

---

## 10. Open directions

Each with evidence for, known objection, and where possible a cheap falsifier.

1. **Expose decision primitives (§9).** Unification, coverage-correct splitting, constructor
   enumeration, LF hole solving.
   *For*: attacks the measured dominant cause (72% type errors, 60% missing constructors);
   reuses Beluga's own semantics so there is **no divergence risk**; partially reachable
   today via `runCommand`.
   *Against*: risks becoming a front-end rather than a contribution — see §9.2.
   **Falsifier: drive ~10 stuck targets through `constructors-comp` + `split H V` and measure
   whether the top rejection class collapses. Hours, not weeks.**

2. **Own typed core + higher-order pattern unification.**
   *For*: full independence; makes the search a decision procedure.
   *Against*: re-implementing reconstruction/coverage/totality invites silent divergence from
   Beluga — the original reason for the oracle architecture. §9 makes this look like
   duplicated effort.

3. **Focusing discipline retrofitted.** The engine already classifies moves invertible vs
   non-invertible (for a "no cut-free proof" certificate) and then backtracks over all of
   them anyway. Twelf does not backtrack at all; the Beluga tactic backtracks only across
   focus choices; SuSLik states the rule explicitly.
   *For*: four independent confirmations; small change; targets the 92 TIMEOUT + step-bound
   population. *Against*: it is search control, which has never paid here — though this is
   restoring a discipline, not adding a heuristic.

4. **Automatic induction-scheme inference (ACL2-style scored population).**
   *For*: targets the largest measured gap (46% never offered an IH); **nobody in the LF
   family does this** — Twelf and Beluga both ask the human.
   *Against*: the 46% has ≥3 causes; only one is measure-related.

5. **Cyclic proof / global termination.** Build the derivation, check well-foundedness
   globally. *For*: §7 makes termination your invariant regardless; sidesteps measure
   inference entirely. *Against*: unexplored here; interaction with Beluga's own totality
   checker unclear.

6. **Saturation / e-graph substrate for the deterministic fragment.** Long-standing plan
   entry, never built. *Against*: prior "saturate then search" attempts in this project
   relocated the blow-up rather than removing it. **Any bound must be *proved* to be a
   bound.**

---

## 11. Laws and traps (each cost a real debugging session)

**Measurement**
- **Every census needs a CONTROL GROUP** — score the *solved* set identically. A study-only
  census said stuck proofs need "constructed" argument slots (84.5%); the control said 69.5%,
  and two of three shapes were *more* common in solved proofs. **Report the lift, never the
  raw share.**
- **An exact 0% or 100% is a bug until proven otherwise.** Two live instrument bugs caught
  this way in two days.
- **On a merged ledger, verify each field's semantics per source.** `steps`/`moveKinds` are
  per-source and unreliable; `outcome`/`checks` are trustworthy. A full causal story was once
  built on `steps` and was wrong.
- **A COMPLETE with zero accepted moves is a harness bug** (masking failed), not a proof.
- **A completion whose check count is implausible for its reference proof is a false positive
  until proven otherwise.**
- **Never A/B beside a sweep** — a contended arm once faked a clean 2× regression.
- **Extracting a produced declaration with the masker RE-MASKS it** — an audit did this and
  passed 11/11 while every proof it "verified" was a hole.

**Gating**
- **The test suite cannot catch corpus behaviour; the DIFFERENTIAL is the gate.** Three
  false-positive bugs shipped in one change, all caught by the differential, none by a green
  suite.
- **Zero regressions or revert.** Declare a numeric stake *before* building; honour it.
- **Size by the mechanism's own predicate**, not a text census — text overstated reach 4× in
  one session, 24× in another.

**Method**
- **When a class survives sizing, ask what is UPSTREAM before building.** A whole build was
  spent learning a downstream piece measures zero by construction.
- **Read the emitted text before doubting a mechanism.** Three correct mechanisms measured
  zero because one predicate mangled their output.

---

## 12. Where everything is

| area | path |
|---|---|
| Search loop, move dispatch | `js/editor-src/prover/prover-orchestrator.mjs` |
| SLD backward-chaining synthesis | `js/editor-src/prover/prover-synth.mjs` |
| Split/invert/fill model, schemas, index unification | `js/editor-src/prover/hole-split.mjs` |
| Comp-types, totality, decreasing index | `js/editor-src/prover/prover-comp-type.mjs` |
| `decOk` gate + circular-self-call guard | `js/editor-src/prover/prover-hyp.mjs` |
| **Beluga's own solver / unifier / coverage** | **`Beluga-W/src/core/{logic,unify,coverage,total}.ml`** |
| **The 423-line shim that hides them** | **`Beluga-W/src/web/beluga_web.ml`** |
| Single-target native probe | `scripts/prover-native-oracle.mjs` |
| The gate | `npm run prover:diff` |
| Current ledger | `results/corpus/library.native-rebaseline-20260815.jsonl` |
| Full numbered history (55 entries) | `docs/orca-research/prover-master-plan.md` |

Instruments (`scratch/probes/`): `death-census`, `ctor-reach-census`, `recurse-offered-census`,
`slot-shape-census` (+control), `ih-need-census`, `untotalied-census`, `circularity-audit`,
`rebaseline` (resumable full sweep), `ab-toggle`, `diverge-one`, `class-dump`, `step-map`.

---

## 13. What a good proposal contains

1. Which measured gap it attacks, with the number from §5.
2. Which prior system it descends from and what it does differently (§8).
3. Its termination invariant, and why it does not depend on the checker (§7).
4. A count of independent pieces; if >1, all behind one toggle (§6.3).
5. A numeric stake and kill criterion, declared before any code.
6. A **cheap falsifier**.
7. An explicit position on §9 — whether it uses Beluga's own primitives or re-implements,
   and why.

**Rejected without measurement:** anything that adds candidates, reorders candidates, prunes
candidates, or adds a budget (§6.1, §6.2).

**Honest summary.** The machinery works, the evaluation methodology exceeds the field's, and
the diagnosis is unusually well measured. The algorithm at the centre is a heuristic text
generator arbitrated by a black box — and §9 shows the black box is only opaque because of a
423-line shim, while a 6,155-line proof-search engine implementing the published
state-of-the-art calculus sits unexposed beside it. Everything in §6 is consistent with the
text-generation architecture being the binding constraint. The task is to replace it with
something that **decides** rather than **samples**, while keeping the two things that make
this system credible: it produces checkable proof terms, and it is measured against a real
corpus.
