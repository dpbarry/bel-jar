# Orca — Research Dossier v3, for a Zero-Context Deep-Research Agent

> **Archived.** Programme **shelved**. Start at [`README.md`](README.md). Shipped engine: [`../../ORCA.md`](../../ORCA.md).

**Purpose.** Design a proof-search algorithm for the **Beluga** proof assistant that is
materially better than anything that exists, and that we can actually build and measure.
This document assumes **no prior knowledge** of Beluga, Harpoon, LF, contextual type theory,
or this codebase. It is self-contained; nothing else needs to be read.

### 0.0.0 ⛔ THE BAR — `ORCA-MANDATE.md`

**Logic and programming languages are FINITE but INFINITELY EXPRESSIVE. A proof search
over them must be too.** A finite set of first-principle rules must compose to solve
unboundedly many holes — not an endless slog of rules creeping toward an asymptote. A
mechanism that adds a rule per SHAPE is architecturally wrong regardless of what it
measures, and **~1% of the residue per build is not an option.** Any proposal must NAME
ITS FINITE RULE SET, show that its closure covers the fragment, and show why no further
rule is needed for the next unseen shape. The full mandate is pinned in
`ORCA-MANDATE.md`; §16's rubric is subordinate to it.

### 0.0 What you are being asked to do

**The artifact.** *Orca* is an automatic proof-search engine for Beluga, written from
scratch in ~17k lines of JavaScript and embedded in a browser IDE for the language. It takes a
theorem statement with an empty body and tries to derive a complete, machine-checkable proof.
It is evaluated by **masking**: take a real proof from Beluga's own example library, delete
its body, and re-derive it — the author's proof is ground truth and is never shown to the
engine. **850 such targets; 273 currently proved.**

**The ask.** Propose the *design of an algorithm* — not an implementation, not a survey. It
must attack a gap that is **measured in this document**, state its termination invariant, and
come with a numeric stake and a cheap falsifier. §16 is the rubric it will be judged against;
§6 and §11 are the list of things already built and measured that it must not repeat.

**The bar.** The remaining unproved population is **494 targets**. A mechanism worth ~2% of
that is not progress and will not be built. Think in systems that account for **20%+ at a
time** — or conclude honestly that the evidence does not support one, and say what that
implies.

**What makes this problem unusual, and worth your time.** The evaluation harness is
corpus-scale and falsification-based, which exceeds what is standard in this field (evaluation
by case study). Every claim below is a measurement; several prior architectural diagnoses were
*falsified* by it; and a proposal made here can be checked rather than argued about.

**Status date:** 2026-08-20. Supersedes `docs/orca-research-brief-v2.md` (2026-08-17) and
`docs/orca-research-brief.md` (v1).

---

> ## 0.1 ⛔⛔ WHAT CHANGED IN v3 — READ THIS BEFORE ANYTHING ELSE
>
> v2 named three mechanisms, sequenced, as the system to design: **termination ownership →
> deciding rather than sampling → construction rather than lookup** (v2 §11.2, §12).
>
> **The third one has now been built and it measures ZERO.** Not "small". Zero.
>
> Between 2026-08-19 and 2026-08-20 the "construction" half was built as a real,
> general, two-layer core and gated on the corpus:
>
> | | its own contract (verified active) | payload |
> |---|---|---|
> | **A contextual-type unifier** — binds index metavariables **and context variables**, indices buried inside context declarations, flexible goals, hidden implicit arguments | **33.9%** of all constructor argument slots got a *sharper type*; **66.7%** of targets affected | **0 gains / 45** |
> | **A recursive goal-directed inhabiter** — builds terms: hypothesis · constructor application with slots inhabited recursively · inline IH/lemma call · binder introduction | fired on **35.7%** of targets, **1128 constructed candidates** across 145 slots | **0 gains / 45** |
>
> The second sample was drawn stride-wise from **all 494 in-fragment residue targets** across
> 32 developments. Declared bar was ≥9 of 45 (20%). Result: **0 gains, 0 losses.**
>
> These are not wiring nulls. The inhabiter emitted real constructed terms that no lookup
> pool can produce at any cap — `RArr (\g'. \x. \N. \d. d)`, `(ctx_unrest_unr X)`,
> `(str_lin h)`, `(eq1 [g |- X1])` — over a thousand of them, and **not one proof followed.**
>
> **Consequence, and it is the central fact of this dossier:**
>
> > **The engine's problem is NOT that it cannot name, type, or build the right term at a
> > hole.** Two independent capabilities were added — *knowing* a slot's type and *building*
> > its inhabitant — and both measured exactly zero on a residue-wide sample.
>
> That falsifies the standing diagnosis behind ~15 numbered entries of this project's history
> ("the paying category is a missing move or mis-emitted text"), and it retires v2 §11.2
> sub-question 3, v2 §12 direction 2, and **any proposal whose content is "generate better
> terms at the hole."** Those are now refuted by measurement, not by argument.
>
> What is left by elimination is **proof structure**: which lemma to have, which induction to
> perform, which scrutinee to split, in what order. The project has 22 measured failures on
> that axis *within the current architecture* (§6.1). **So there is nothing left in this
> architecture that pays — which is exactly why this document exists.**

---

## 0.2 How to read this, and how to trust it

Every factual claim carries a provenance tag. **Do not treat them as equally reliable.**

| tag | meaning |
|---|---|
| ✅ **VERIFIED** | Checked against source or measured by a named instrument, with the command given. Reproducible. |
| 📊 **MEASURED (inherited)** | Produced by a named instrument in an earlier session; methodology documented, not re-run for this revision. |
| ⚠️ **UNVERIFIED** | Asserted in a prior dossier or proposal, never checked at source. Treat as hypothesis. |
| 📚 **LITERATURE** | A claim about published prior art. |

**Internal references.** File paths (`js/editor-src/prover/...`), numbered plan entries
("entry 57"), and instrument names (`scratch/probes/*.mjs`) appear throughout as **provenance, so
that every number here is traceable by the team that produced it**. You are not expected to
have access to any of them, and **no argument in this document depends on reading them.**
Appendix A collects the repo-internal material in one place; skip it.

**Section map.** §0.0 the ask. §1 mandate. §2–3 domain background and corpus specimens. §4 the shipped
baseline to beat. §5 the system as built and its measured state. §6 **every direction already
tried and what it measured — read before proposing anything.** §7 the soundness trap. §8 prior
art. §9 what is actually inside the Beluga binary. §10 the Descent/KEEL falsification (why two
prior research passes aimed at instrument artifacts). §11 **the 2026-08-19/20 campaign — the
unified-core hypothesis, built and refuted; the newest and most decision-relevant material.**
§12 the research question. §13 open directions. §14 laws and traps. §16 proposal
rubric. §17 honest summary. **Appendix A** is repo-internal and skippable.

---

## 1. Mandate

- Current: **273 of 850 corpus targets proved (32.1%)** ✅ VERIFIED — counted from
  `results/corpus/library.native-rebaseline-20260815.jsonl`: 850 lines, `outcome`
  distribution `COMPLETE 273 / STUCK 478 / TIMEOUT 92 / CANCELLED 7`. Two of the 273 were
  later shown to be false proofs and refused by a new guard (§7), so **271 is the honest
  genuine figure**; the ledger has not been re-swept since.
- Rate of progress: **~+0.2%/day.** ⚠️ UNVERIFIED. **This is why the dossier exists.**
- Reaching 90% means converting **essentially the entire remaining analytic fragment.** No
  sequence of small mechanisms gets there; the arithmetic rules it out. This was v2's claim
  and §11 now demonstrates it by construction rather than by arithmetic.
- Wanted: an algorithm that **decides** rather than **samples** — a decision procedure by
  construction over a declared fragment.
- **The bar is explicit and it is the project owner's, not a heuristic:** *think in first-principles
  systems that account for 20%+ at a time, never in discrete 2%s.* A mechanism worth ~2% is
  not progress against a 494-target residue and will not be built.
- **Novelty alone is worthless.** ~32 mechanisms have been built and measured (§6). A proposal
  that repeats a documented failure mode will be rejected without measurement.

### 1.1 Hard constraints

1. **Must emit a checkable proof term.** Twelf's meta-prover does not; that is treated as a
   defect, not a simplification.
2. **Must own termination.** Beluga performs **no termination check** absent a `/ total /`
   pragma. This system has already shipped false proofs for exactly this reason (§7).
3. **Must handle what dominates the real corpus**: context block schemas, parameter variables
   `#p`, substitution variables `$S`, context variables. The published state-of-the-art
   Beluga tactic excludes all three.
4. **Must be measured on the whole corpus** with masking-based falsification, not case
   studies.
5. **Speed is correctness.** A proof at 30 min / 15k checker calls is a defect, not a win.

---

## 2. Beluga: the type theory you must understand

Beluga is a proof assistant for **mechanised metatheory** — proving properties *about* formal
systems (type safety, normalisation, confluence), not proving mathematics.

### 2.1 Two layers

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
| beta   : step (app (lam \x. M x) N) (M N)   % substitution is LF application
| s_app1 : step M M' -> step (app M N) (app M' N)
;
```

LF terms are in **canonical (β-normal, η-long) form**. The core judgment is `Γ ⊢ M ⇐ A`. Type
families are indexed (`step : tm -> tm -> type`), which is what makes the framework dependent.

**Reasoning layer — a dependently-typed functional language over *contextual objects*.** A
proof is a **total, structurally recursive program**; the theorem is its **type**. This is
Curry–Howard taken literally: **proof search here *is* program synthesis.**

### 2.2 Contextual modal type theory (Nanevski–Pfenning–Pientka)

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

**Meta-types** classify these: `(g ⊢ A)` boxed, `#(g ⊢ A)` parameter, `$(g ⊢ h)` substitution,
`ctx` schemas.

**Judgments a search algorithm must respect:**

- `Δ; Γ ⊢ e ⇐ τ` — computation-level checking (Δ = meta-context, Γ = computation context)
- `Δ ⊢ Ψ ⇐ schema` — **schema satisfaction**: does this context conform?
- `Δ ⊢ σ : Ψ → Φ` — substitution well-formedness
- coverage — does a set of patterns exhaust a contextual type?
- termination — is the recursion structurally decreasing per the declared order?

**Substitution is proof obligation, not bookkeeping.** Weakening `[g ⊢ M]` to
`[g, x:tm ⊢ M[..]]` requires the right explicit spelling. Mis-spelled substitutions are ~19%
of all rejected candidates in this system (§5.6). 📊 MEASURED (inherited)

### 2.3 Implicit arguments — read this twice

Beluga **reconstructs** implicit arguments. In

```
rec subcomp : {Ks:[ |- envstack]}{P:[ |- program]}{S:[ |- env]}
              [ |- feval K F W] ->
              [ |- mstep (st (push Ks K) (prog (ev F) P) S) (st Ks P (vcons S W))] =
```

`Ks`, `P`, `S` are **explicit** (written in `{…}`, introduced by `mlam`). `K`, `F`, `W` appear
*only* inside types — they are **implicit**, inferred by reconstruction. ✅ VERIFIED (source:
`library/data/examples/compile/cls/complete.bel:38`).

**Reconstruction DOES bind them in the meta-context.** With `main.exe +implicit`, `K,F,W` all
appear in `cD`, and coverage splits them normally. `Printer.Control.printImplicit` defaults to
`false`, which is why they can look absent (§10.4). Implicit arguments are **not** a splitting
obstacle.

Where they *are* load-bearing is **§7, the soundness trap**: an invented measure that lands on
an implicit argument satisfies Beluga's totality check vacuously, and that shipped five false
proofs. Implicit arguments are also the trigger for a *hidden-arity* problem the new unifier
had to solve (§11.2): because they are not printed, a goal read from a hole report carries
*fewer* indices than the constructor declares, and the two must be aligned **from the right**.

**Any proposal must state what it does about implicit arguments — as a termination concern and
an arity concern, not a splitting one.**

### 2.4 Totality — the load-bearing detail

```
rec f : [ |- nat] -> [ |- nat] =
/ total x (f x) /          % measure: recursion decreases on x
fn x => ...
```

- **With** an aligned pragma, Beluga enforces structural descent (*"Recursive call not
  structurally smaller"*).
- **Without** a pragma, Beluga performs **no termination check at all.** ✅ VERIFIED: a
  circular body `fn y => half y` with no pragma reports "Type Reconstruction done" and is
  **accepted**; the same body with `/ total 1 /` is rejected.

#### 2.4.1 ⭐ The two pragma conventions differ on implicits ✅ VERIFIED

Corpus distribution (699 pragmas across `library/**/*.bel`):

| form | count | share | counts implicits? |
|---|---|---|---|
| **named** `/ total d (f … d) /` | **612** | **87.6%** | **YES — one spine slot per implicit** |
| fn-only `/ total (f) /` | 64 | 9.2% | n/a — designates nothing |
| **numeric** `/ total N /` | 13 | 1.9% | **NO — explicit arguments only** |
| lexicographic `/ total {a b c} (…) /` | 10 | 1.4% | as named |

**The two forms use opposite conventions, and getting it wrong rejects a CORRECT proof.** On a
genuinely-decreasing theorem with one implicit `N` and one explicit `y`:

| pragma | result |
|---|---|
| `/ total 1 /` | ✅ accepted (numeric skips the implicit) |
| `/ total y (half y) /` | ❌ *"Recursive call not structurally smaller"* |
| `/ total y (half _ y) /` | ✅ accepted (spine pads the implicit) |

**308 of the 612 named spines (50.3%) visibly pad with `_`.**

⚠️ **An out-of-range numeric index CRASHES rather than rejects** — `/ total 2 /` on a
one-explicit-argument theorem gives an uncaught `Pattern matching failed` at
`reconstruct.ml:258`. A harness must distinguish a crash from a rejection.

**Named→numeric conversion** (`scratch/probes/measure-convert-gate2.mjs`, 148 targets scored):
counting **from the right** (licensed by `total.ml:197` — *"assumes that all cdecls are before
the actual rec. arg."*) scores **86.5%**, rising to **~92.1%** if lexicographic targets are
emitted in lexicographic form. A single numeric N **provably cannot** express a lexicographic
order. ✅ VERIFIED

#### 2.4.2 ⭐ `(g:ctx)` vs `{g:cxt}` — a domain fact that has broken four instruments

**Parenthesised `(g:ctx)` is an IMPLICITLY bound context variable** — never `mlam`-bound, not
an argument, but it still occupies a slot in a named pragma's spine. **Braced `{g:cxt}` is
EXPLICIT** — `mlam`-bound, and it IS an argument. `parseCompType` reports the first as
`kind:'ctx'`, the second as `kind:'pi'`. Four measurement paths have been broken by this
(§10.2, §5.8, the measure converter twice). Treat it as a domain fact, not a per-instrument bug.

### 2.5 Why automation here is harder than Coq/Agda

- **No library to mine.** Each development is self-contained ⇒ premise selection (hammers) has
  nothing to select from.
- **Goals are not first-order entailments** but inhabitation problems in a dependent theory
  with HOAS. FOL translation destroys the structure that matters.
- **Context reasoning is first-class**: weakening, strengthening, schema satisfaction,
  substitution composition are all proof obligations.
- **Coverage is genuinely hard.** 📚 Schürmann & Pfenning (TPHOLs 2003): *"splitting failure
  due to incompleteness of the unification may happen … even if rules for all constructors are
  given."*

---

## 3. Corpus specimens (what the algorithm actually faces)

### Specimen A — routine structural induction

```
rec ceq : (g:tctx) Deq [g |- T] [g |- S] -> Aeq [g |- T] [g |- S] =
/ total d (ceq g t s d)/
fn d => case d of
| De_l d        => Ae_l (ceq d)
| De_a d1 d2    => Ae_a (ceq d1) (ceq d2)
| De_r [g |- T] => ref [g] [g |- T]
| De_t d1 d2    => trans (ceq d1) (ceq d2)
| De_v          => Ae_v
;
```

Split a computation hypothesis, recurse on components, apply two sibling lemmas. ✅ VERIFIED:
**all 9 corpus instances of `ceq` are STUCK or TIMEOUT.** If routine structural induction with
two sibling lemmas is out of reach, that is a more significant datum than any specimen below.

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

Induction on a **type index** (not a derivation); a higher-order argument (`mlam …`) containing
**two nested recursive calls**; a **substitution variable** `$W` passed as `$[h |- $W]`; a
higher-order hypothesis `f` applied to five arguments.

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

Splitting a **parameter variable** into "is the newest variable" vs "is further in"; recursion
**on the context**; weakening spellings (`#p[..]`); and the **type-ascription re-binding**
idiom `let (cr : Crel [l] [h]) = cr in`, needed to make an implicit context variable writable.

### Specimen D — the block-extended recursive result

```
| [g |- lam \x. M] =>
  let TRlam tr1 = r in
  let [h, b:block (y:term, _t:aeq y y) |- AE[.., b.1, b.2]] = ref' tr1 in
    [h |- ae_l \x. \w. AE]
```

The recursive call's result is bound **under a context extended by a block**, the metavariable
applied to the block's **projections**, then cited **under two lambda binders**.

### Specimen E — context induction

```
rec id_red : {g:cxt} RedS [g] $[g ⊢ ..] =
/ total g (id_red g) /
mlam g ⇒ case [g] of
| [] ⇒ RNil
| [g, x:tm A[]] ⇒
  let r  = id_red [g] in
  let r' = rename_redS [g] [g, x:tm A[]] $[g, x:tm A[] ⊢ ..] r in
  RCons (red_var [g, x:tm A[]] [g, x:tm A[] ⊢ x]) r'
;
```

✅ VERIFIED (`library/data/examples/poplmark-reloaded/2b_sn.bel:113`). The measure names the
**context variable** and the proof cases on the context itself. The engine's
`decreasingArgIndex` returns `-1` for a `{g:cxt}` measure — **it cannot express "induct on the
context" as a slot at all.** ✅ VERIFIED

### Specimen F — the ctype-construction shape (the 2026-08-19 target)

```
inductive Map : {h:tctx}{g:sctx} ctype =
| M_id  : {h:tctx} Map [h] []
| M_dot : Map [h] [g] -> [h |- target S[]] -> Map [h] [g, x:source S[]]
;
rec weaken : Map [h] [g] -> Map [h, x:target S[]] [g] =
/ total m (weaken _ _ _ m) /
fn sigma => case sigma of
| M_id [h] => M_id [h, x:target _]
| M_dot sigma' [h |- M] => M_dot (weaken sigma') [h, x:target _ |- M[..]]
;
```

A ctype **indexed by contexts, not by contextual objects**. Closing it requires, in one term:
a ctype-constructor application at a ctype goal; an **inline recursive call in an argument
slot** (it cannot be let-bound first — every ascribed spelling is rejected, ✅ VERIFIED); and a
**weakened box** `M[..]` in another slot whose context the *goal* fixes. §11.1 is the account
of building all of that.

---

## 4. Harpoon — Beluga's interactive prover (the baseline to beat)

Tactic-driven; produces a script that elaborates to a checked Beluga program. Tactics:
`intros`, `split`, `invert`, `msplit`, `unbox`, `solve`, `by`, `suffices`.

| automation | behaviour |
|---|---|
| `auto-intros` | introduces assumptions on a function-typed subgoal ✅ VERIFIED in `src/harpoon/automation.ml` |
| `auto-solve-trivial` | closes a subgoal convertible with an assumption. *Never solves the last remaining subgoal* ✅ VERIFIED |
| `auto-invert-solve` | solves when no splitting beyond inversions is needed; bounded DFS ✅ VERIFIED **absent** from `automation.ml`; lives in `src/harpoon/prover.ml` |
| `inductive-auto-solve` | splits on a **user-named** variable, then `auto-invert-solve` per case ✅ VERIFIED same |

**The induction variable is supplied by the human.** That is the shipped baseline.

---

## 5. Orca as built, and its measured state

### 5.1 Architecture

```
 ┌───────────────────────────────────────────────┐
 │ Orca — JavaScript, ~17.2k lines             │
 │  • model of theorem + open holes              │
 │  • candidate MOVE generation (as TEXT)        │
 │  • greedy DFS + chronological backtracking    │
 └──────────────┬────────────────────────────────┘
                │ emits a WHOLE PROGRAM as a string
                ▼
 ┌───────────────────────────────────────────────┐
 │ Beluga (OCaml → js_of_ocaml, or native)       │
 │  returns: ok / not-ok  +  an error string     │
 └───────────────────────────────────────────────┘
```

**Move vocabulary:** `intro`, `split`, `invert`, `fill`, `recurse`, `lemma`, `synth`,
`impossible`.

**Loop:** parse holes from the checker's report → select one hole (leftmost arm, DFS) →
generate candidate texts → try each against the checker → accept the first that typechecks
without increasing the error count → repeat. Dead ends backtrack chronologically over *every*
accepted move.

### 5.2 The defining constraint

**The interface to the logic is one bit plus an error string.** Orca has no type system of
its own; it cannot know whether a term is well-typed except by asking. Consequences:

- It emits several **spellings** of the same idea and lets the checker arbitrate — the internal
  "dual-spell, never rename" doctrine. For one fill it may emit `[h |- E]`, `[_ |- E]`,
  `[h |- E[..]]`, `[h, b:block(…) |- E[.., b.1, b.2]]`.
- Guess-and-check at scale explodes ⇒ prefilters, budgets, caps, depth bounds accumulate.
- Every divergence between the string model and real semantics needs a targeted repair.

Source census: **~773 lines** touch spelling/variant/writability/guard/budget concerns vs
**~183** touching unification/substitution — about **4:1**. ⚠️ UNVERIFIED.

⭐ **§11 is the direct test of whether that ratio is the problem. It is not.**

### 5.3 Move generation, in detail

| move | what it emits |
|---|---|
| `intro` | `fn X => ?` / `mlam X => ?` from the goal's telescope |
| `split` | `case S of \| pat1 => ? \| pat2 => ?` — patterns from the scrutinee family's constructors, with index unification and a rigid-head conflict pruner |
| `invert` | `let [g \|- ctor S] = d in ?` — a one-branch case |
| `fill` | a closing term. Constructor of the goal head applied to arguments from `fillScope` = let-bound results + hypotheses + metavariables |
| `recurse` | `let [Γ \|- R] = thm args in ?` — an IH call; decreasing slot gated by `decOk` |
| `lemma` | as `recurse`, for sibling theorems |
| `synth` | an internal SLD backward-chaining engine (`prover-synth.mjs`, 2.2k lines) |

**Known structural limits of generation** (all three addressed by §11's build, to no effect):
higher-order argument slots drew candidates *only* from let-bound recursion results; argument
selection ignored index information (family head only); combination caps of 4 / 6 / 12 / 48.

### 5.4 The corpus and masking harness

- **850 targets** — every `rec`/`proof` in Beluga's own example library. ✅ VERIFIED.
- **Masking**: take a real proof, replace its body with `?`, re-derive. The author's proof is
  ground truth and is never shown to the engine.
- Orchestration: suite prelude + already-complete siblings kept, other holed declarations
  stripped, then the target masked. ⚠️ A sweep that does not orchestrate differs on 2.5% of
  targets and is not comparable to the ledger.
- **This is a genuine falsification instrument and exceeds standard practice in this field**,
  where evaluation is by case study. No corpus-scale evaluation of metatheory automation has
  been published. 📚/⚠️

### 5.5 The population, exactly ✅ VERIFIED

From the current ledger (850 rows):

| bucket | n |
|---|---|
| COMPLETE | 273 (271 genuine, §7) |
| STUCK `no-move` | 205 |
| STUCK `no-totality-measure` | 126 |
| STUCK `step-bound` | 67 |
| STUCK `search-bound` | 4 |
| STUCK `coinductive-out-of-fragment` | 49 — **out of fragment by construction** |
| STUCK `file-errors` | 27 — **programs that do not themselves typecheck** |
| TIMEOUT | 92 |
| CANCELLED | 7 — harness |
| **IN-FRAGMENT RESIDUE (the real denominator)** | **494** |
| analytic ceiling | ~91% |

**Use 494 as the denominator for any reach or conversion claim.** §11's A/B is sampled from
exactly this set.

### 5.6 Why the search stops (207 cheap-death targets) 📊

| | |
|---|---|
| targets that ever hit a hole with **zero** candidates | 8 (4%) |
| deepest dead end = candidates generated, all checker-rejected | 182 (88%) |
| rejections that are **type** errors | ~72% |
| rejections that are **scope** errors (free ctx var / free meta / not closed) | ~19% |
| rejections that are parse errors | ~2% |

**The engine is not short of moves. It emits semantically wrong terms at scale**, because
nothing in it can tell they are wrong before the checker does.

### 5.7 Constructor reach (77 scored dead-end holes) 📊

| | |
|---|---|
| proposed every constructor the reference needs | 40% |
| **missed ≥1 needed constructor** | **60%** |

Of missing constructors, **73% are higher-order (binder-taking)** vs 7.7% of proposed ones —
**9.5× enrichment**. ⭐ **This measurement is what motivated §11's inhabiter. The inhabiter
supplies exactly the missing capability and converts nothing** — so the 9.5× enrichment is
real and is *not* causal.

### 5.8 Induction-hypothesis availability (all 391 in-fragment stuck) 📊

| | |
|---|---|
| offered `recurse` anywhere | 129 (33%) |
| offered `lemma` anywhere | 129 (33%) |
| **offered NEITHER** | **180 (46%)** |
| offered `split` anywhere | 380 (97%) |

Of those 180, **164 (91%) provably need one**: 86 self-recurse, 72 both, 6 lemmas only, 16
neither. Average **1.78 calls per proof** — *shallow* proofs. **Every lemma they call already
exists as a sibling declaration**, so no lemma speculation ("cut") is required for this
population.

⚠️ The causal split (MEASURE-blocked vs GATE-blocked) **has no verdict**: 53/47 once the
instrument's `decIdx = -1` sentinel bug is corrected. Do not cite 65/35.

---

## 6. Directions already tried, and what they measured

**The most important historical section.** ~32 mechanisms built, each gated by full test suite
+ corpus differential. 📊 MEASURED throughout.

### 6.1 The one-directional ROI law (~22 gated attempts)

- **Everything that ever paid was a MISSING MOVE or MIS-EMITTED TEXT**: poisoned decreasing
  slot (+3), higher-order ctype construction + accessibility chain (+6), type-ascription
  re-binding (+2), inferred-index spelling variants (+1, and 713→37 checks on one target),
  ctype inversion + nested-case parenthesisation (+3), per-slot underscore (+4 of 11).
- **Everything that was PRUNING or RANKING returned 0 or negative**: unwritable-context
  variants (instant loss, 47→645 checks on one target), invented-name guard (failed a
  soundness pin), comp-application family check (0), ctype-ctor θ twin (0), relaxed ascription
  limiter (+11% checks), inverts-before-recurses (+35% checks). **No completion has ever come
  from pruning.**
- ⛔ **v3 CAVEAT:** the first half of this law is now **falsified at the residue** by §11 — two
  new capabilities of exactly the "missing move" kind measured zero. The law describes the
  *history* of a population that has since been exhausted.

### 6.2 Candidate-pool shaping is dead in BOTH directions

- **Filtering** the largest rejection class (41% of rejections): **−4.1% checks, 0 gains, 0
  losses.**
- **Widening** every generation cap 4→64 / 6→96 / 48→512 / 12→128 over the full 207-target
  class: **207/207 identical verdicts, 0 changes, +4.4% checks.**

⇒ The correct term is **absent from the pool**, not buried in it. **"Generation pays" ≠ "more
candidates pays."** ⛔ §11 shows it does not mean "more expressive construction pays" either.

### 6.3 Composite moves are atomic

A three-part move built two-thirds of the way measured **zero** at a verified 40% reach.
Re-confirmed: a higher-order slot-filler built as "piece 3 of 3" measured **2/31 with +69.9%
checks** — the pieces were in the wrong *order*, and everything downstream of an unavailable IH
measures zero by construction. ⭐ §11.1 confirms the law from the *paying* side for the first
time: the same family built **whole** (five pieces) gave 3 gains at **−15.7%** checks.

### 6.4 There is no mass class left

Three independent instruments: feature census over all 552 stuck (every syntactic feature
3–20%); error census over 1341 rejections (the one 41% class is **4% of checks**); step-map
(56% die at step 0, consuming 18% of checks).

### 6.5 Per-target hunting

Days of per-target root-causing produced **+7 of 823**.

### 6.6 Untotalied recursion (instructive failure)

Opening recursive-call generation for author-untotalied theorems: **11 gains, 0 losses, −11.2%
checks — and 10 of the 11 were circular proofs.** Reverted. See §7.

### 6.7 The fragmentation result

Every attempt to isolate a workable class subdivided rather than concentrating:

> 577 residue → 202 cheap deaths → 75 scored holes → 30 higher-order drops → 17 never offered
> recursion → {9 no-totality-measure, 8 no-move} → {1 ctype premise, 16 all-box}

Six levels, no concentration.

### 6.8 ⛔ NEW — Type PRECISION is not the gap (2026-08-20)

A real contextual-type unifier was built (§11.2): binds index metavariables **and context
variables**, indices buried inside context declarations, flexible goals, hidden implicits.
**33.9% of all constructor argument slots got a sharper type, on 66.7% of targets — and 0 of 45
converted, at +5.5% checks.** Precision did not even remove wrong candidates; checks went *up*.

### 6.9 ⛔⛔ NEW — Recursive CONSTRUCTION is not the gap (2026-08-20)

One recursive goal-directed inhabiter was built (§11.3), subsuming the nine lookup-shaped
generators. **It fired on 35.7% of targets and produced 1128 constructed candidates across 145
slots. 0 of 45 converted, at +15.7% checks.** Sample drawn residue-wide (494 population, 32
developments). **This retires v2 §12 direction 2 and v2 §11.2 sub-question 3.**

---

## 7. The soundness trap

Beluga does not check termination without a pragma ⇒ `checked.ok` is **not evidence of a
proof** for an untotalied theorem.

Orca contains a **measure fork**: when a theorem has no pragma, it *invents* one and retries.
An invented measure can be arity-correct yet land on an **implicit** argument, satisfying the
totality check **vacuously**. It produced:

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
well-foundedness check now blocks them: *a self-application is well-founded iff ≥1 argument is
a strict sub-derivation in the decOk set at that call site.* After the fix: differential
199/199, **0 circular among all 109 untotalied completions**, and `halts_step` now completes
*genuinely* (the guard refuses the circular term and the search finds the author's proof).

⚠️ Two of the false proofs (`exTRel`, `exTRel'`) are the very targets the codebase cited as
evidence that an earlier policy was "measured sufficient". **That evidence was partly false
proofs.**

⚠️ **Still open:** the fork still *emits* an invented pragma; it merely can no longer launder a
circular proof. Emitting only measures that land on an **explicit** argument is the clean root
fix.

**Implication: termination must be YOUR invariant, not the checker's.** A percentage that
includes circular proofs is worse than a lower honest one.

---

## 8. Prior art 📚

### 8.1 Directly ancestral

**Twelf's meta-theorem prover / M2** — Schürmann & Pfenning, CADE-15 1998; Schürmann's CMU
thesis (CMU-CS-00-146, 2000). Algorithm: **Filling, Recursion, Splitting**, *sequentialised
without backtracking*. Filling = iterative deepening with size bounds; Recursion = appeal to
the IH on smaller arguments per the termination ordering; Splitting = all constructors.
**Limits:** Π₂ statements only; **no recursive types ⇒ logical relations inexpressible**;
**produces no proof terms**; the user supplies the termination ordering via `%prove`.

**Semi-Automation of Meta-Theoretic Proofs in Beluga** — Schwartzentruber & Pientka, LFMTP 2023
(arXiv 2311.10439). **A sound and complete focusing calculus for the core of Beluga's logic**,
shipped as Harpoon's `auto` tactic. Invertible rules to exhaustion, then focus on one
assumption; dependent function assumptions resolved by **unification**. **Completeness is with
respect to cut-free derivations.** Recursive types treated as atomic. Depth bound default 3.
Induction variable supplied **by the user, by position**. **Explicitly unsupported: context
block schemas, parameter variables, substitution variables.** The authors state: *"Beluga's
proving power does not yet surpass that of Twelf's."*

**Abella** — two-level logic, ∇-quantifier / nominal abstraction; interactive; core search
restricted to definitional unfolding and pattern matching.

### 8.2 Proof-theoretic machinery

- **Focusing / uniform proofs** — Andreoli; Miller–Nadathur–Pfenning–Scedrov. Invertible rules
  apply eagerly and **need never be backtracked**; the only branching is the choice of focus.
- **Focused Inductive Theorem Proving** — Baelde & Miller (IJCAR 2010); the **Tac** prover.
- **Cyclic proofs / infinite descent** — Brotherston & Simpson (LICS 2007); Cyclist. Build a
  possibly-cyclic derivation, then check a **global trace condition** instead of a local
  measure. Directly relevant given §7.

### 8.3 Inductive theorem proving (Boyer–Moore lineage)

**PLTP / NQTHM / ACL2.** The mature literature on *choosing* the induction. ACL2 generates all
plausible schemes suggested by how functions decompose their arguments, scores each by a
**hitting ratio**, merges compatible schemes, **vetoes** ones that flaw others.
**Relevance: Orca picks a single decreasing slot. Twelf and Beluga both require the human to
supply the induction. Nobody in the LF family infers it.**

**Proof planning** — CLAM, IsaPlanner. **Rippling** as search control; **lemma speculation**
and **generalisation** as failure-driven critics; **theory exploration** (HipSpec, QuickSpec,
Hipster) for automatic lemma discovery. ⭐ **After §11, this is the branch that matters most.**

### 8.4 Type-directed program synthesis

**Synquid** (PLDI 2016) — polymorphic refinement types; E-term/I-term split. **Myth**
(type-and-example-directed). **SuSLik** (POPL 2019) — separation logic; explicitly adopts
focusing. All maintain a **typed internal representation** and use **unification** to decide
rule applicability.
⛔ **v3: this is precisely the discipline §11 implemented, and it measured zero here.** The
Synquid analogy is not wrong in spirit, but it is refuted as a *sufficient* diagnosis for this
corpus. Any proposal invoking it must say why its version differs from §11.3.

### 8.5 Deliberately NOT applicable

**CoqHammer / sauto / Tactician / Proverbot9001.** Hammers work by premise selection over a
large library + FOL translation. Beluga developments are self-contained and the goals are not
FOL entailments. Citing these as models signals unfamiliarity with the problem.

### 8.6 Benchmarks

POPLmark; the ORBI open challenge repository; the list-machine benchmark. These are **challenge
problems**, not evaluation harnesses.

---

## 9. What is actually inside the Beluga binary

### 9.1 Confirmed exactly ✅ VERIFIED

`Beluga-W/src/core/`:

| module | lines | what it is |
|---|---|---|
| **`logic.ml`** | **6,155** | the logic-programming + focusing proof-search engine |
| `coverage.ml` | 3,648 | coverage checking / case splitting |
| `unify.ml` | 3,312 | higher-order unification |
| `check.ml` | 1,757 | computation-level type checking |
| `total.ml` | 1,722 | totality / termination |
| `order.ml` | 34 | termination orders |
| `command.ml` | 965 | the interactive command table |
| `src/web/beluga_web.ml` | 423 | the js_of_ocaml shim |

`Logic.Options.enableLogic` defaults to **`ref true`** — the engine is on by default.

### 9.2 The interactive command table — 23 commands ✅ VERIFIED

Reachable via the `%:` prefix through `runCommand` (web) or `main.exe -I` (native Beli):

```
countholes   chatteron   chatteroff   types        reset        clearholes
reload       load FILE   printhole N  lochole N    lookuphole N solve-lf-hole N
constructors IDENTIFIER  constructors-comp IDENTIFIER            help
split H V    intro N     fsig IDENT   fdef IDENT   type EXP     query E T TYP
get-type LINE COLUMN     quit
```

### 9.3 Three corrections that matter ✅ VERIFIED

1. **`%:type EXP` type-checks in the EMPTY context** (`Reconstruct.elExp' LF.Empty LF.Empty`).
   It cannot type an expression mentioning a hole's hypotheses, metavariables, or context
   variable. **⇒ There is no local-context typing oracle in the command table.** Any plan whose
   step is "construct a candidate and ask Beluga for its type in the subgoal's context" **does
   not have that primitive today.**
2. **`fill H with E` and `msplit` do not exist as core commands.** `msplit` is a Harpoon tactic.
3. **`cgSolve` is NOT reachable via `runCommand`.** Its only callers are `src/harpoon/prover.ml`,
   and `prover.ml` is not linked into the web build.

### 9.4 The upside ✅ VERIFIED

`src/web/dune` already links `harpoon_core`, and `Logic` lives in the `beluga` library which is
also linked. So `beluga_web.ml` — the one OCaml file this project's security boundary permits
editing — **can call `Logic.Frontend.msolve_tactic` and a local-context `Reconstruct.elExp'` /
`Check.Comp.check` directly.** ⇒ The primitives are reachable, but **not without an OCaml shim
edit and rebuild.**

⛔ **Security boundary: `Beluga-W/src/core/` and semantic OCaml are OFF LIMITS.**
`src/web/beluga_web.ml` plus build scripts are the only permitted OCaml edits.

### 9.5 `Interactive.split` is genuinely coverage-backed ✅ VERIFIED

`interactive.ml:216` → `Cover.genPatCGoals` for computation hypotheses; `genCGoals` →
`Cover.genContextGoals` for context variables.

---

## 10. The Descent / KEEL falsification — why two prior research passes failed

### 10.1 What was proposed

**Descent** (against v1): typed contextual sequent + a descent ledger; ACL2-style induction
scheme inference driven by Beluga's coverage-correct `split`; size-change termination reduced
to a `/ total N /` pragma; hybrid oracle boundary reusing `unify.ml`/`coverage.ml`/`cgSolve`.
Its load-bearing empirical premise: **Beluga's `split` supplies the case analysis Orca fails
to propose.**

### 10.2 The partition, with a control ✅ VERIFIED

| class | study (180 no-IH stuck) | control (273 COMPLETE) | **lift** |
|---|---|---|---|
| TOTALIED | 67 (37.2%) | 164 (60.1%) | **0.62×** |
| UNTOT-BOX | 44 (24.4%) | 85 (31.1%) | 0.79× |
| UNTOT-NOBOX | 69 (38.3%) | 24 (8.8%) | **4.36×** |

**The control changed the staging rationale.** The 67 TOTALIED are *under*-represented in
failure — they look like the successes. The 67 ids are also only **49 distinct theorems**, and
10 of them carry no readable controlling argument, so Descent's declared threshold (≥60/67) was
**unreachable by construction.**

### 10.3 The experiment and its result ✅ VERIFIED

Drove `%:load` / `%:intro` / `%:split` through native Beli for every introduced binder of all
49 theorems. Initial result: COMP binders **20/53 CASES (37.7%), 32 IMPOSSIBLE (60.4%)** —
apparently a decisive negative on coverage.

### 10.4 The diagnosed cause — a defect in Beluga, not a fact about coverage ✅ VERIFIED

**`impossible` is a defect in Beluga's interactive `split`, triggered by the totality pragma.**
The pragma marks the measured argument `Comp.TypInd`; `Interactive.split`'s `matchTyp` unwraps
`TypInd` to *dispatch* but passes the still-wrapped type to `Cover.genPatCGoals`, whose match
has no `TypInd` case and falls through to `| _ -> []` (`coverage.ml:2705`). Zero cases prints
as `impossible`.

**Because the study population was the TOTALIED class, 100% of it carried the trigger.**
Re-measured with the pragma stripped: COMP binders go to **49/50 CASES (98.0%), 0 IMPOSSIBLE**.

Reproduce in 13 lines:

```
LF nat  : type = | z : nat | s : nat -> nat;
LF even : nat -> type = | ez : even z | ess : even N -> even (s (s N));
rec f : [ |- even N] -> [ |- nat] =
fn y =>
?
;
```
`printf '%:load m.bel\n%:split 0 y\n%:quit\n' | main.exe -I` → two cases. Insert `/ total 1 /`
above `fn y =>` → `impossible y`.

**Workaround: strip the totality pragma before using `%:split` as an oracle.** It is a
non-mutating preview and the pragma has no bearing on which patterns coverage generates.

### 10.5 What this establishes

- **Coverage is not the blocker.** Any proposal premised on "Beluga's splitter cannot serve our
  population" is refuted.
- **Split availability does not imply completion.** All 49 targets are STUCK. Even before the
  correction, 13 theorems had a split available on the measured argument and were still stuck.
- **Orca never calls `%:split`** — it generates splits from its own model, and already offers
  `split` on 97% of stuck targets. The split-oracle question was never the measured bottleneck.
- **KEEL**, a second proposal built on v2.0's mis-diagnosis ("the goal is under-constrained;
  carry a metavariable constraint store"), is unmotivated by the corrected evidence and is
  withdrawn along with it.

### 10.6 The pattern across three passes

Three architectural diagnoses in a row were **instrument artifacts**: "the coverage oracle is
missing" (v1 → Descent), "the goal is under-constrained" (v2.0 → KEEL), "measure inference is
the fix" (a 65/35 reading that is actually 53/47 — no verdict). Each was well-argued from bad
substrate. **The recurring failure is not reasoning quality; it is instruments trusted without
a control drawn from outside their own selection criterion.**

---

## 11. ⭐⭐⭐ The 2026-08-19/20 campaign — the unified-core hypothesis, built and refuted

**This is the newest and most decision-relevant material in the dossier.** Unlike §10, nothing
here is an artifact: every component's own contract was verified active before its payload was
believed.

### 11.0 The hypothesis

The project's history is ~15 entries each patching one site where a term was produced by
**lookup** where it needed to be **constructed**, each measuring ~2%. The claim under test:

> Those are not N causes. They are N sites of **one** missing capability — the engine has no
> type theory of its own — and supplying it properly is worth 20%+, not 2%.

Read from the *code* rather than the corpus, the engine has **nine** generators that each
answer "what term goes here?", each written for the sliver its author's target needed:

```
fillCandidates rule (3)   nullary constructors of the goal head
fillCandidates rule (3b)  the higher-order `mlam` skeleton (accessibility families)
fillCandidates rule (4)   synthesizeFills — LF constructor synthesis, one level
fillCandidates rule (5)   constructor application over in-scope names
argFillChoices            per-slot lookup, with five special cases inside it
nestedCtorArgFills        depth-2 constructor witnesses, comp families only
lfCtorAppFills            depth-1 constructor applications, LF families only
hoSlotFills               binder introduction, only when the R-pool is empty
inlineArgCallTexts        an inline IH/lemma call, ctype slots only
```

The proposed core: **(1)** a typed IR, **(2)** a real unifier over contextual types, **(3)** one
recursive `inhabit(type, ctx, scope, depth)` subsuming all nine, **(4)** a single spelling pass
at the boundary. Steps 2 and 3 were built and measured. Step 4 is a refactor with no new
capability and cannot convert anything by itself.

### 11.1 First — the whole-composite result that motivated it

Before the core, the best-posed remaining *mechanism* was built, to see what a composite built
**whole** does. Target: Specimen F.

⛔ **Prior scoping said the family needed three pieces and that two existed. Reading one real
trace before writing code showed it needs FIVE**, three of them missing:

| piece | status before |
|---|---|
| (A) recognise a **context-indexed** ctype goal (`Map [h] [g]`) | **MISSING** — goal decomposition demanded a *boxed* argument, so a ctype indexed by contexts decomposed to nothing and the constructor application was never proposed at all |
| (B) instantiate constructor slots from the goal's **context** indices | **MISSING** — index matching bound only UPPERCASE tokens, and context variables are lowercase by convention, so every slot kept its *declared* context |
| (C) inline IH/lemma call in an argument slot | **MISSING** — and the sibling-lemma generator skipped any lemma with no *box* premise, which is exactly this family's lemma |
| (D) weakened box in an argument slot | existed — but unreachable without (B) |
| (F) the slot's own context binder as a fill | **MISSING** |

Two further defects, both **mis-emitted text**, both decisive:

1. **The ctype split bound a BOX argument as a bare name** (`M_dot X1 X2`), making the
   sub-derivation a *computation value*, which can never be weakened into a deeper box
   (measured: *"Expected an LF term-level constant"*). The corpus writes `| M_dot sigma' [h |- M] =>`,
   binding `M` in the **meta** context. The exact reference term was being refused **for the
   spelling of a pattern three moves earlier.**
2. **The instantiated slot context cited a reconstruction-invented name** (`z`), refused with
   *"This free context variable is illegal"*, while the identical term with `_` is accepted.
3. Variants must be **interleaved, not appended** — the argument-combo enumeration walks slots
   diagonally under a cap, so a spelling parked at the end of a slot's list is only reachable
   together with every other slot's first choice.

**Result:** `cc.bel#weaken` **no-move/52 checks → COMPLETE in 33 checks, 4 moves**, structurally
the author's proof. `cc.bel#extend` **no-move/8 → COMPLETE/14**, closing through the *sibling*
call. A/B over 45: **3 gains, 0 losses, −15.7% checks.** Differential **199/199**, suite
209/210.

⭐ **This is the first time a composite built WHOLE behaved differently from a partial one**
(§6.3's law confirmed from the paying side): one piece alone had given 2/31 at **+69.9%**
checks; five pieces gave 3/45 at **−15.7%**.

⛔ **And its class size was inflated 3.5×.** The class was sized by a predicate over
*declarations* ("the theorem concludes in a ctype family whose constructor has a fillable
slot") — 179/577 stuck vs 17/273 complete, a 4.98× lift. Measured with a **firing counter
during real runs**, the mechanism reaches 11.1–28.9%, so the real class is ~50 and the ceiling
is ~+12 targets. **"Sized by the mechanism's own predicate" is not enough — the predicate must
be evaluated DURING A RUN.**

Of the non-converters, **32 of 42 die at the generic `Type-checking error.` row** — already
sub-classified in earlier work and found *not* to be a defect. No shared next wall.

### 11.2 Step 2 — the contextual-type unifier

`js/editor-src/prover/prover-unify.mjs`. Binds index metavariables **and context variables**,
in two deliberately separate namespaces (a lowercase `h` may be an LF variable in one position
and a context variable in another; only the *structure* says which). Substitution is applied
**structurally**, never as a global text replace.

What the old index matcher could not do, all three now handled:
- a context variable never bound;
- an index buried inside a context declaration never bound (`S` in `x:source S[]`);
- a token-spine mismatch returned null, leaving the slot raw.

Two further first-principles fixes came out of the first measurement and **doubled reach on
their own, with no per-family code**:
- **a flexible GOAL constrains nothing** — `X2`, `_`, `#p`, `b.1`: a pattern more specific than
  the goal must *match* it binding nothing, not fail. One flexible index was killing the
  substitution for a whole constructor.
- **implicit arguments are not printed** (§2.3), so the goal is short by its implicit prefix and
  the two align **from the right**. Bailing on the length difference discards every constructor
  of every family carrying an implicit index — in this corpus, most of them.

| measured DURING RUNS, 45 targets | first cut | + the two fixes |
|---|---|---|
| constructor applications where it binds | 20.2% | **44.5%** |
| argument slots whose type is **sharpened** | 15.6% | **33.9%** |
| targets with ≥1 slot sharpened | 33.3% | **66.7%** |

⛔ **Payload: 0 gains, 0 losses, +5.5% checks.** Precision did not even remove wrong candidates
— checks went *up*.

### 11.3 Step 3 — the recursive inhabiter

`js/editor-src/prover/prover-inhabit.mjs`. `inhabit(want, env, depth)` returns term texts for a
type from four sources applied **uniformly at every depth and in every position**:

1. a hypothesis (meta, comp, context binder, block projection) whose type unifies with the want;
2. a constructor of the want's family whose **result unifies** with the want, its argument slots
   inhabited **recursively** with the unifier's substitution threaded through;
3. an inline call (the IH or a sibling lemma) whose conclusion unifies;
4. **binder introduction** for a higher-order want, body inhabited in the extended scope.

Two laws it obeys: it may only **add or sharpen** candidates, never refuse one (selection uses
"both heads rigid and different", everything uncertain passes); and it is **capped at every
level** (4 / 8 / 16), because the evidence says the win comes from a term being *present at
all*, not from enumerating more.

**Gate declared before the code.** Population: stride sample of **45 from all 494 in-fragment
residue targets** across 32 developments — deliberately *not* the entry-56 class, because a 20%
claim must face the whole residue. Component contract: novelty. Payload: **≥9 of 45 (20%), 0
losses, else the one-system claim is dead.**

| | |
|---|---|
| targets where `inhabit` contributed (14 sampled) | **5 (35.7%)** |
| slots it filled | 145 |
| constructed candidates produced | **1128** |
| **gains** | **0** |
| losses | 0 |
| checks | +15.7% |

Sample output — real constructed terms no lookup pool can produce at any cap:
`RArr (\g'. \x. \N. \d. d)` · `(ctx_unrest_unr X)` · `(str_lin h)` · `(eq1 [g |- X1])`.

### 11.4 A real core bug the build exposed — and how it was caught

`decomposeContextual` reports a **box** for any parenthesised type, because a meta type
genuinely *is* written `(g |- A)`. But `(tm -> tm)` — the higher-order argument of
`lam : (tm -> tm) -> tm` — decomposes identically, so step 2's instantiation rewrote it as
**`[ |- tm -> tm]`, a bogus box, at every parenthesised argument slot.** Silently.

Found because the inhabiter returned `[]` for `[g |- tm]` on a three-line signature — a
positive control that could not fail for any legitimate reason. Fixed by `asBox` (a box
requires an actual **turnstile at depth 0**) and routed through every box decomposition in both
modules. **Step 2's A/B was then re-run against corrected code and the null held** (+13.3% →
+5.5% checks, 0 gains either way).

⛔ **Law: `decomposeContextual` is NOT a box test.**
⛔ **Law: a measurement taken on buggy code is not a result until it is re-taken.**

### 11.5 What §11 establishes, precisely

**Establishes:**
- Two independent capabilities — *knowing* a slot's type, and *building* its inhabitant — both
  measure exactly **zero** on a residue-wide sample, with component contracts verified active.
- Therefore **the engine's problem is not term production at a hole.** The standing diagnosis
  behind ~15 entries is falsified at the residue.
- A whole composite really does behave differently from a partial one (§11.1) — but even
  whole, its ceiling is ~2%.
- The remaining residue does not concentrate behind either capability: 32/42 non-converters die
  at an uninformative generic type error, with `recurse` offered to 17 and `lemma` to 12.

**Does NOT establish:**
- That a *typed core* is worthless in principle. It establishes that adding precision and
  construction **to this search architecture** converts nothing. A different architecture that
  uses them differently is not refuted — but it must say *how* it differs from §11.3.
- Anything about the divergence class (§12) — neither step was aimed at it.

### 11.7 ⛔⛔⛔ THE ORACLE-SCHEME TEST — a PERFECT proof structure also converts ZERO

After v3 was written, an external research pass proposed **Scheme**: infer a global
induction scheme (induction position / context variable, the coverage case tree, where the
IHs land) plus an owned size-change measure, commit to it BEFORE filling any hole, then let
the existing leaf-filler finish each case. It proposed a REACH falsifier ("does the
enumerator contain the author's scheme ≥70%"). ⛔ **All three nulls above would have PASSED
a reach gate** (40%, 66.7%, 35.7% reach; zero conversions each).

It was tested by payload instead: splice the AUTHOR's own `/ total /` pragma + intro +
outermost `case ... of` arm patterns into the masked declaration, **every arm body replaced
by `?`**, then run the existing filler. That is Scheme's Pieces 1–4 at 100% inference
quality, for free.

| | |
|---|---|
| positive control — spliced targets from the 273 COMPLETE | **4 of 5 still complete** |
| eligible population — 494 residue whose author proof makes a recursive/sibling call | 434 |
| …and has an outermost `case` (skeletonisable) | **300**, 75 developments |
| spliceable share: residue 60.7% vs COMPLETE control 69.2% | lift **0.88×** |
| study sample | **45**, 30 developments, **45/45 splices well-formed** |
| **completions with a perfect scheme** | **0 / 45** (baseline also 0, as expected) |

Not inert: 45/45 runs changed behaviour, **166 arms** handed over (mean 3.7), 32 carried
the author's pragma, checks fell **26%**. ⛔ **And accepted steps went DOWN (198→112) while
`no-move` went UP (17→22) — all 22 at `steps = 0`.** Given the correct case tree and the
correct measure, the engine proposes **nothing at all** at the author's very first leaf.

⭐⭐ **THE TRIANGULATION.** Three capabilities, three verified-active contracts, three zeros:
knowing the slot's TYPE (§11.2), BUILDING its inhabitant (§11.3), and now supplying the
whole PROOF STRUCTURE. **The residue is not blocked on any single missing capability.**
⛔ Do not propose a fourth "supply capability X" design without a mechanism that explains
all three zeros.

### 11.8 ⭐ THE NEW LEAD — an EMPTY IMAGE, not a wrong image

§5.6 records that **88% of deaths generate candidates and have them all rejected** (~72%
type errors). These 22 generate **an empty set**. That is a different failure mode and it
had never been isolated, because until now the engine never *reached* the author's leaf.
Characterised over all 22:

| feature in the zero-candidate goal or its scope | n / 22 |
|---|---|
| **substitution variable** `$S` / `$[... |- ]` | **8** |
| **parameter variable** `#p`, `#p.1`, `#p.2` | **7** |
| checker-INVENTED name (the `"`-prefixed unwritable class) | **8** |
| ctype goal / boxed goal | 12 / 9 |
| goal carrying a context variable | 8 |

```
Reduce [ |- A] [_ |- #p[$S[..]]]                            (redVar x3)
Log [_ |- ((#p.1[$S1[..]]) sim (#p.1[$S2[..]]))] [ |- Q]    (lookup)
Howe_subst [] $[h1, x : term S[] |- ] $[h1, x : term S[] |- ]  (howe_subst_wkn)
[g |- nf_eq #p.2 (nabs (\x. X))]                             (tm_same)
```

⭐ **These are the same three features §8.1's state-of-the-art tactic explicitly excludes**
(context blocks, parameter variables, substitution variables) — except this engine REACHES
them and then has nothing to say. And the `"`-prefixed names are a self-inflicted refusal:
the writability guards never spell a checker-invented name, so a goal *stated in terms of
one* has no expressible inhabitant by construction.

⇒ **The open question is now "what can the engine SPELL at all?", not "which capability is
missing".** Any v4 should start here.

### 11.6 Status of the code

`UNIFY=1` and `INHABIT=1` are opt-in; the default path is inert (verified by measurement: 47/47
non-timeout baseline rows byte-identical to the ledger) and the suite is green (209/210, one
pre-existing unrelated failure). Kept as **evidence and instruments**, not as machinery to
extend. ⛔ **Do not re-run either as a payload experiment.**

---

## 12. The research question

v2's three-way decomposition of the residue was:

| class | n (v2 reading) | proposed mechanism | status after §11 |
|---|---|---|---|
| construction (`no-move`) | ~277 | build terms, don't look them up | ⛔ **BUILT — 0/45. REFUTED.** |
| divergence (step/search-bound, TIMEOUT) | ~211 | a search that DECIDES, not a bigger cap | **untouched** |
| measure (`no-totality-measure`) | ~0 | phantom — an artifact of a discarded fork reason | dissolved |

**One of the two real classes has now been attacked directly and did not move.** So:

> ### The question
>
> **What is the design of a proof-search procedure over contextual type theory whose
> correctness argument is about the SHAPE OF THE PROOF rather than the shape of the term at a
> hole — one that (a) owns its own termination, (b) decides rather than samples, and (c) is
> complete for a declared fragment large enough to cover a metatheory corpus?**

Three sub-questions, each with a measured hook:

1. **Divergence, not exhaustion → the ~211.** A 4× budget converts **0 of 8** step-bound
   targets while doing ~4× the work (one target: 19,897 → **77,947** checks). Timeouts here are
   not slow proofs; they are the same wall hit repeatedly. **What discipline — focusing, a
   canonical derivation form, a typed state with a decidable revisit test — removes the
   branching that produces them, and what is *proved* about its bound?** Note §6.1: search
   *control* has 22 negative results here, so a proposal must explain why it is a *decision
   procedure* and not another heuristic ordering.
2. **Proof structure, by elimination.** §11 leaves "which lemma, which induction, which
   scrutinee, in what order" as the only untested category. §5.8 is the hook: 46% of stuck
   targets are never offered `recurse` or `lemma`, 91% of them provably need one, average 1.78
   calls per proof, and **every lemma they call already exists as a sibling** — so no cut
   speculation is required for this population. The literature branch is §8.3 (ACL2 scheme
   generation/scoring/vetoing; proof planning; critics), and **nobody in the LF family infers
   the induction.**
3. **Termination as an owned invariant — for SOUNDNESS ONLY.** ⚠️ This has **no measured
   yield**: zero of 21 probed targets died of a totality rejection, and the fork already
   supplies measures to 100% of the `no-totality-measure` class. Build it because §7's false
   proofs are real, and stake it as **zero circular admissions**, never as "+126".

**Sequencing is forced by §6.3:** a composite built out of order measures zero by construction.
Count the independent pieces first; if more than one, all behind one toggle or do not start.

**What a research pass should NOT do:** survey Twelf / Abella / ACL2 / hammers (§8 covers it);
propose integrating Beluga's existing engines (two passes have done that, both aimed at
artifacts); or propose anything whose content is "generate better terms at the hole" (§11).

---

## 13. Open directions, revised again

Each with evidence for, the known objection, and a cheap falsifier.

⛔ **WITHDRAWN in v3:** *construction, not lookup* (built, 0/45, §11.3); *type-directed
precision* (built, 0/45, §11.2); *index-refinement ordering* and *constraint-carrying state*
(v2.0, aimed at the withdrawn §10.4 diagnosis).

1. **⭐⭐ Deciding rather than sampling → the ~211 divergence class.** The engine backtracks
   chronologically over *every* accepted move and has no notion of a state it has already
   refuted. A focusing discipline plus a canonical form for derivations (so that two search
   states differing only by junk are *the same state*) turns the search from sampling into
   enumeration with a bound.
   *For*: the budget A/B proves these are not resource-bound; four independent literature
   confirmations that invertible rules never need backtracking; the engine already classifies
   moves invertible vs non-invertible and then backtracks over them anyway.
   *Against*: it is search control, and §6.1 records 22 failures on that axis. **A proposal must
   distinguish "a better order" from "a smaller state space with a proof about it."**
   **Falsifier:** on the 8 known step-bound targets, the state count must be *provably* finite
   and the search must terminate with a verdict (proof or refutation) inside the existing
   budget. Zero conversions with a proved bound is still informative; a conversion with no
   bound is not.
2. ⛔ **TESTED AND REFUTED 2026-08-21 — see §11.7. A PERFECT scheme converts 0/45.**
   ~~**⭐ Induction-scheme inference (ACL2-style) → §5.8's 46%.**~~ Generate all plausible schemes
   from how the theorem's premises decompose, score, merge, veto; commit to the best. Nobody in
   the LF family does this.
   *For*: genuinely novel here; the population is measured (180 targets, 91% provably need a
   call); §10 established that coverage *can* supply the case analysis once the pragma trigger
   is removed.
   *Against*: downstream of termination ownership (an inferred scheme is worthless if the IH it
   licenses cannot be admitted soundly); and §10.2's control says the totalied sub-population
   *looks like the successes*, so pick the study class by lift, not by convenience.
   **Falsifier:** on the 49 distinct no-IH theorems, ≥N must yield a well-typed IH that the
   termination certifier accepts. Declare N against a denominator that is *reachable* (§10.2's
   ceiling error).
3. **⭐ Termination as an owned invariant (SCT).** Size-change (Lee–Jones–Ben-Amram) over the
   Pientka–Abel contextual subterm order, verified in Orca, gating **every** recursive edge
   (`fill` and `recurse` alike), with `/ total … /` emitted only as a *witness of a certificate
   already held* — never invented.
   *For*: §7's false proofs; §6.6's 10-of-11 circular gains; the only component that survived
   falsification in all three prior research passes; it has a **built-in control**.
   *Against*: **no measured yield** — stake it as soundness, not conversions. Beluga accepts
   single-argument structural orders, so a genuinely lexicographic certificate must be reduced
   (Krauss) or declared outside the fragment.
   **Falsifier:** on the 11 known-circular gains of §6.6, reject 10/10 and admit the 1 genuine
   one. Zero tolerance on any circular admission.
4. **Context induction as an expressible measure.** `decreasingArgIndex` returns `-1` for a
   `{g:cxt}` measure — the engine cannot name the context as the decreasing slot. 7/7 of the
   corpus's context-induction theorems split correctly via `Cover.genContextGoals`.
   *For*: small, separable, verified defect; nobody else infers context induction.
   *Against*: ~15 of 67 in the relevant population — a real but bounded prize. **Size it with a
   firing counter during runs (§11.1), not a declaration census.**
5. **Own typed core + higher-order pattern unification.**
   *For*: full independence; makes the search a decision procedure.
   *Against*: re-implementing reconstruction/coverage/totality invites silent divergence from
   Beluga; and §11 is direct evidence that a partial version of this buys nothing on its own.
   Only worth it as the substrate of direction 1, never as an end.
6. **Lemma speculation / theory exploration (HipSpec-style).** ⚠️ Note §5.8: for the measured
   no-IH population, **every lemma needed already exists as a sibling**, so this is *not*
   required there. It becomes relevant only for whatever remains after directions 1–3.

---

## 14. Laws and traps (each cost a real debugging session)

**Measurement**
- **Every census needs a CONTROL GROUP** — score the *solved* set identically. **Report the
  lift, never the raw share.**
- ⭐ **Size by the mechanism's own predicate, evaluated DURING A RUN by a firing counter —
  never over corpus text or declarations.** A text census overstated reach 4× in one session
  and 24× in another; a *declaration* census overstated it 3.5× in a third (§11.1) while
  looking exactly like a proper mechanism-predicate census.
- ⭐ **Confirm an instrument yields a POSITIVE on a known-good target before believing any
  NULL.** A null with no work behind it — 0 checks, empty kinds, identical arms — is a harness
  bug. This caught the `asBox` defect (§11.4) and a dead debug channel (`execFileSync` returns
  stdout and **discards stderr on success**, so firing counters read 0 on a target that
  demonstrably fires — use `spawnSync`).
- ⭐ **A measurement taken on buggy code is not a result until it is re-taken** (§11.4).
- **An exact 0% or 100% is a bug until proven otherwise.** Caught three times.
- ⭐ **A component gate must measure the COMPONENT'S OWN contract**; the payload gate belongs on
  the piece that consumes it. Setting a conversion stake on a component nothing consumes yet
  produces a test that cannot distinguish "worthless" from "unbuilt consumer" (§11.2).
- ⭐ **A PRINTER DEFAULT IS NOT A FACT ABOUT THE TERM.** `printImplicit = ref false`; v2.0 read
  that absence as a scope fact and built a research programme on it.
- ⭐ **THE STUDY POPULATION CAN CARRY THE TRIGGER.** §10's probe measured the TOTALIED class and
  the defect it found fires on the totality pragma — 100% of the sample was confounded. **Ask
  what the population has in common besides the property being studied.**
- ⭐ **A STUCK REASON CAN PREDATE THE RETRY.** When every measure fork fails, the orchestrator
  returns the *unforked* result and discards the forked reasons — an entire "policy refusal"
  class of 126 was invented by reading the label literally.
- ⭐ **A SENTINEL IS NOT A VALUE.** Scoring `decIdx = -1` ("not found") as a resolved slot moved
  a 65/35 verdict to 53/47 — i.e. from "build measure inference" to no verdict at all.
- ⭐ **TWO SPELLINGS OF ONE PRAGMA CAN USE OPPOSITE CONVENTIONS** (§2.4.1); an out-of-range
  numeric index **crashes** rather than errors.
- **On a merged ledger, verify each field's semantics per source.** `steps`/`moveKinds` are
  per-source and unreliable; `outcome`/`checks` are trustworthy.
- **A COMPLETE with zero accepted moves is a harness bug**, not a proof. **A completion whose
  check count is implausible for its reference proof is a false positive until proven
  otherwise.**
- **Never A/B beside a sweep** — a contended arm once faked a clean 2× regression.
- **Collapse duplicate targets before quoting a denominator.** 67 ids = 49 theorems.
- **Use 494, not 577 or 850, as the residue denominator** (§5.5).

**Gating**
- **The test suite cannot catch corpus behaviour; the DIFFERENTIAL is the gate.**
- **Zero regressions or revert. Declare a numeric stake before building; honour it.**
- **Count the independent pieces first.** If more than one, all behind one toggle or do not
  start (§6.3).

**Method**
- **When a class survives sizing, ask what is UPSTREAM before building.**
- **Read the emitted text before doubting a mechanism.** §11.1's five-piece correction came
  from reading one trace before writing any code.
- **Verify the primitives before designing around them.** Three of Descent's cited primitives
  did not exist as described (§9.3).
- **Write probes to FILES** — `node -e` through a shell mangles regex backslashes.
- **Verify a patch landed by grepping the new text**, never by a success message.

---

## Appendix A — Where everything is (repo-internal; NOT required reading)

*Nothing in §1–§17 depends on this appendix. It exists so the team can reproduce every
number above, and so a proposal can name the seam it would modify.*

| area | path |
|---|---|
| Search loop, move dispatch | `js/editor-src/prover/prover-orchestrator.mjs` |
| SLD backward-chaining synthesis | `js/editor-src/prover/prover-synth.mjs` |
| Split/invert/fill model, schemas, index unification | `js/editor-src/prover/hole-split.mjs` |
| Comp-types, totality, decreasing index | `js/editor-src/prover/prover-comp-type.mjs` |
| `decOk` gate + circular-self-call guard | `js/editor-src/prover/prover-hyp.mjs` |
| **The contextual-type unifier (§11.2)** | `js/editor-src/prover/prover-unify.mjs` |
| **The recursive inhabiter (§11.3)** | `js/editor-src/prover/prover-inhabit.mjs` |
| Corpus assembly + masking | `js/editor-src/prover/prover-corpus-decls.mjs` |
| **Beluga's solver / unifier / coverage / totality** | `Beluga-W/src/core/{logic,unify,coverage,total}.ml` |
| **Interactive command table (23 commands)** | `Beluga-W/src/core/command.ml` |
| **Coverage-backed split/intro** | `Beluga-W/src/core/interactive.ml:139,216` |
| **The 423-line web shim (only editable OCaml)** | `Beluga-W/src/web/beluga_web.ml` |
| Native checker | `Beluga-W/_build/default/src/beluga/main.exe` |
| Native interactive (Beli) | `main.exe -I`, commands prefixed `%:` |
| Single-target native probe | `scripts/prover-native-oracle.mjs` |
| The gate | `npm run prover:diff` (default ref = the frozen 199) |
| Current ledger | `results/corpus/library.native-rebaseline-20260815.jsonl` |
| Full numbered history (58 entries) | `prover-master-plan.md` |
| v2 / v1 of this dossier | `docs/orca-research-brief-v2.md`, `docs/orca-research-brief.md` |

**Toggles** (all default OFF; honoured by `diverge-one`, `rebaseline-one`, and
`scripts/prover-native-oracle.mjs` so the differential can measure an opt-in mechanism without
a code edit):

```
INLINEARG=1   the entry-56 ctype-construction composite (§11.1)
UNIFY=1       the contextual-type unifier (§11.2)
INHABIT=1     the recursive inhabiter (implies UNIFY) (§11.3)
HOSLOT=1      the entry-51 higher-order slot filler (stake missed, kept opt-in)
```

**Instruments** (`scratch/probes/`): `death-census`, `ctor-reach-census`, `recurse-offered-census`,
`slot-shape-census` (+control), `ih-need-census`, `ih-blocker-probe` (⚠️ sentinel bug — see
§5.8), `untotalied-census`, `circularity-audit`, `rebaseline` (resumable full sweep),
`diverge-one` (⭐ `ALL_ENTRIES=1` + `stepsText` show what a hole *advanced* on — `allDead`
cannot), `class-dump`, `step-map`, `descent-*` (§10), `notot-scope`, `forked-reason-probe`,
`measure-convert-gate2`.
**New 2026-08-19/20:** `unify-selftest.mjs` (9 positive controls incl. two fail-open cases),
`inhabit-selftest.mjs` (4 controls incl. the Specimen-F composite), `unify-rate.mjs` (firing
counter, the shape to copy for any sizing), `inhabit-novelty.mjs` (component contract),
`inline-arg-reach.mjs` (⛔ STATIC predicate — read §11.1 before quoting it),
`inline-arg-ab.sh`, `inhabit-ab.sh`.

### A.1 Reproducing the §11 result

```
node scratch/probes/unify-selftest.mjs        # 9/9 — the unifier's own contract
node scratch/probes/inhabit-selftest.mjs      # 4/4 — incl. Specimen F from one procedure
node scratch/probes/unify-rate.mjs            # firing counter: 44.5% / 33.9% / 66.7%
bash  scratch/probes/inhabit-ab.sh            # the 45-target residue-wide A/B (both arms, alone)
node scratch/probes/inhabit-novelty.mjs       # 1128 constructed candidates, 35.7% of targets
INLINEARG=1 INHABIT=1 npm run prover:diff # regression gate with the core ON
```

---

## 16. What a good proposal contains

1. **Which measured gap it attacks**, with the number from §5, §11 or §12 — against the **494**
   denominator.
2. **Which prior system it descends from and what it does differently** (§8).
3. **Its termination invariant**, and why it does not depend on the checker (§7).
4. **An explicit position on implicit arguments** (§2.3, §2.4.1, §7) — as a TERMINATION and
   ARITY concern, not a splitting one: which pragma form it emits, how it counts implicits, how
   the named→numeric conversion is tested. Implicit positions must be excluded from the measure
   domain.
5. **A count of independent pieces**; if >1, all behind one toggle (§6.3).
6. **A numeric stake and kill criterion, declared before any code**, against a denominator that
   is **reachable** (§10.2), with the **component contract separated from the payload gate**
   (§11.2).
7. **A cheap falsifier**, and a check that every primitive it calls actually exists (§9.3).
8. **An explicit position on §9** — which Beluga primitives it uses, and whether it needs a shim
   edit + rebuild (core OCaml is off limits).
9. ⭐ **An explicit answer to §11**: why this proposal is not another way of generating better
   terms at a hole, given that both precision and construction measured zero.

**Rejected without measurement:** anything that adds candidates, reorders candidates, prunes
candidates, or adds a budget (§6.1, §6.2); anything premised on coverage being the blocker
(§10); anything premised on term production being the blocker (§11).

---

## 17. Honest summary

The machinery works, the evaluation methodology exceeds the field's, and the diagnosis is
unusually well measured. The algorithm at the centre is a heuristic text generator arbitrated
by a black box.

Three prior architectural diagnoses were instrument artifacts — "the coverage oracle is
missing", "the goal is under-constrained", "measure inference is the fix". Each was well-argued
from bad substrate, and §14 now carries a law written from each.

**The fourth diagnosis was not an artifact, and it is the reason for this revision.** The
standing story — that the residue is a long tail of places where the engine cannot produce the
right term, and that a proper typed core would collapse the tail — was **built and measured**.
A real contextual-type unifier sharpens a third of all argument slots on two thirds of targets.
A real recursive inhabiter produces over a thousand constructed terms that no lookup pool can
reach. Together, on a residue-wide sample of 45 across 32 developments: **zero conversions.**

So the honest state is narrow and clear. **Producing the right term at a hole is not the
bottleneck.** What is left is the shape of the proof — which induction, which lemma, which
scrutinee, in what order — and a search that currently *samples* that space and diverges rather
than deciding it: a 4× budget converts 0 of 8, while doing 4× the work.

That is the system to design, while keeping the two things that make this project credible: it
produces checkable proof terms, and it is measured against a real corpus.
