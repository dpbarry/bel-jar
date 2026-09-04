# Orca — Research Dossier v2 — **superseded** (archive)

**Superseded by:** [`orca-research/orca-research-brief-v3.md`](orca-research/orca-research-brief-v3.md) and [`orca-research/orca-research-brief-v4.md`](orca-research/orca-research-brief-v4.md).

---

# Orca — Research Dossier v2, for a Zero-Context Deep-Research Agent

**Purpose.** Design a proof-search algorithm for the **Beluga** proof assistant that is
materially better than anything that exists, and that we can actually build and measure.
This document assumes **no prior knowledge** of Beluga, Harpoon, LF, contextual type theory,
or this codebase.

**Status date:** 2026-08-17 (revised same day — see §0.1).

**What v2 is.** v1 of this dossier (`docs/archive/orca-research-brief.md`) produced a research
proposal ("Descent") that was well-read in the literature but rested on three unverified
empirical premises. Two were false. v2 records the verification and the falsification
experiment that followed.

> ### 0.1 ⚠️ v2.1 CORRECTION — read before anything else
>
> **The first release of v2 diagnosed the central negative result wrongly, and a second
> proposal ("KEEL") was built on that wrong diagnosis before it was caught.**
>
> v2.0 reported that Beluga's coverage-correct `%:split` returns `impossible` because the
> scrutinee's type mentions **implicit meta-variables absent from the hole's meta-context**.
> That is false, verified three ways (§10.6):
>
> 1. The implicits **are** in `cD`. `Printer.Control.printImplicit` defaults to `false`, so
>    `%:printhole` *hides* them. With `+implicit`, `subcomp`'s `K,F,W` are all present.
> 2. A minimal pair (implicit vs explicit index, otherwise identical) splits **fine both
>    ways**. Implicitness does not block coverage.
> 3. The real cause is a **defect in Beluga's interactive `split`**: a `/ total /` pragma
>    marks the measured argument `Comp.TypInd`; `Interactive.split`'s `matchTyp` unwraps
>    `TypInd` to dispatch but passes the still-wrapped type to `Cover.genPatCGoals`, whose
>    match has no `TypInd` case and falls through to `| _ -> []`. Zero cases prints as
>    `impossible`.
>
> **Because the study population is the TOTALIED class, 100% of it carried the trigger.**
> Re-measured with the pragma stripped: COMP binders go from 20/53 CASES (37.7%) to
> **49/50 (98.0%)**, IMPOSSIBLE from 32 to **0**; `subcomp` goes from `impossible` to
> **33 cases**.
>
> **Consequences.** Coverage was never the blocker. v2.0's §11 "reframed research question"
> (the goal is under-constrained; carry a metavariable constraint store) was aimed at a
> phenomenon that does not occur, and is withdrawn — see the rewritten §11. Any proposal
> descending from it (KEEL's Mode A/Mode B classifier, index-first splitting, constraint-
> carrying state, the `ideSplitInternal` shim) is unmotivated by this evidence.
>
> **Workaround, free and immediate:** strip the totality pragma before using `%:split` as an
> oracle. It is a non-mutating preview and the pragma has no bearing on which constructor
> patterns coverage generates. No shim, no rebuild, no core edit — which matters because
> `Beluga-W/src/core/` is off-limits under this project's security boundary.

---

## 0. How to read this, and how to trust it

Every factual claim below carries a provenance tag. **Do not treat them as equally
reliable.**

| tag | meaning |
|---|---|
| ✅ **VERIFIED** | Checked against source or measured by a named instrument during the 2026-08-17 session. Reproducible; the command is given. |
| 📊 **MEASURED (inherited)** | Produced by a named instrument in an earlier session. Believed sound, methodology documented, but **not re-run on 2026-08-17**. |
| ⚠️ **UNVERIFIED** | Asserted in v1 of this dossier or in a prior proposal, never checked at source. Treat as a hypothesis. |
| 📚 **LITERATURE** | A claim about published prior art. Citations given; several were only partially confirmable. |

**Section map.** §1–3 are domain background. §4 is the system as built. §5 is measured state.
§6 is every direction already tried and why it failed — *read before proposing anything*.
§7 is the soundness trap. §8 is prior art. §9 is what is actually inside the Beluga binary
(corrected). §10 is the Descent proposal and its falsification — **the most important new
section**. §11 is the reframed research question. §12 is open directions. §13 is
methodology law. §14 is where everything lives. §15 is the proposal rubric.

---

## 1. Mandate

- Current: **273 of 850 corpus targets proved (32.1%)**. ✅ VERIFIED — counted directly
  from `results/corpus/library.native-rebaseline-20260815.jsonl`: 850 lines, `outcome`
  distribution `COMPLETE 273 / STUCK 478 / TIMEOUT 92 / CANCELLED 7`.
  *(v1 of this dossier said 271; that was wrong, or was silently netting out known false
  proofs. Use 273 and state your own adjustment explicitly.)*
- Rate of progress: **~+0.2%/day**. ⚠️ UNVERIFIED. **This is why the dossier exists.**
- Reaching 90% means converting **essentially the entire remaining analytic fragment**. No
  sequence of small mechanisms gets there; the arithmetic rules it out.
- Wanted: an algorithm that **decides** rather than **samples** — a decision procedure by
  construction over a declared fragment.
- **Novelty alone is worthless.** ~30 mechanisms have been built and measured (§6). A
  proposal that repeats a documented failure mode will be rejected without measurement.

### 1.1 Hard constraints

1. **Must emit a checkable proof term.** Twelf's meta-prover does not; that is treated as a
   defect, not a simplification.
2. **Must own termination.** Beluga performs **no termination check** absent a `/ total /`
   pragma. This system has already shipped false proofs for exactly this reason (§7).
3. **Must handle what dominates the real corpus**: context block schemas, parameter
   variables `#p`, substitution variables `$S`, context variables. The published
   state-of-the-art Beluga tactic excludes all three.
4. **Must be measured on the whole corpus** with masking-based falsification, not case
   studies.
5. **Speed is correctness.** A proof at 30 min / 15k checker calls is a defect, not a win.

---

## 2. Beluga: the type theory you must understand

Beluga is a proof assistant for **mechanised metatheory** — proving properties *about*
formal systems (type safety, normalisation, confluence), not proving mathematics.

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

LF terms are in **canonical (β-normal, η-long) form**. The core judgment is `Γ ⊢ M ⇐ A`.
Type families are indexed (`step : tm -> tm -> type`), which is what makes the framework
dependent.

**Reasoning layer — a dependently-typed functional language over *contextual objects*.**
A proof is a **total, structurally recursive program**; the theorem is its **type**. This is
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

**Meta-types** classify these: `(g ⊢ A)` boxed, `#(g ⊢ A)` parameter, `$(g ⊢ h)`
substitution, `ctx` schemas.

**Judgments a search algorithm must respect:**

- `Δ; Γ ⊢ e ⇐ τ` — computation-level checking (Δ = meta-context, Γ = computation context)
- `Δ ⊢ Ψ ⇐ schema` — **schema satisfaction**: does this context conform?
- `Δ ⊢ σ : Ψ → Φ` — substitution well-formedness
- coverage — does a set of patterns exhaust a contextual type?
- termination — is the recursion structurally decreasing per the declared order?

**Substitution is proof obligation, not bookkeeping.** Weakening `[g ⊢ M]` to
`[g, x:tm ⊢ M[..]]` requires the right explicit spelling. Mis-spelled substitutions are
~19% of all rejected candidates in this system (§5.4). 📊 MEASURED (inherited)

### 2.3 Implicit arguments — read this twice

Beluga **reconstructs** implicit arguments. In

```
rec subcomp : {Ks:[ |- envstack]}{P:[ |- program]}{S:[ |- env]}
              [ |- feval K F W] ->
              [ |- mstep (st (push Ks K) (prog (ev F) P) S) (st Ks P (vcons S W))] =
```

`Ks`, `P`, `S` are **explicit** (written in `{…}`, introduced by `mlam`). `K`, `F`, `W`
appear *only* inside types — they are **implicit**, inferred by reconstruction, and are not
bound by any binder the user writes. ✅ VERIFIED (source:
`library/data/examples/compile/cls/complete.bel:38`).

⚠️ **CORRECTION (v2.1) — do not over-read this.** v2.0 said implicits are "not bound by any
binder the user can name or split on" and built its central diagnosis on that. **Reconstruction
DOES bind them in the meta-context**: with `main.exe +implicit`, `K,F,W` all appear in `cD`,
and coverage splits them normally. `Printer.Control.printImplicit` defaults to `false`, which
is why they looked absent (§10.6). Implicit arguments are **not** the cause of the §10 negative
result.

Where implicit arguments *are* genuinely load-bearing is **§7, the soundness trap**: an invented
measure that lands on an implicit argument satisfies Beluga's totality check vacuously, and that
shipped five false proofs. **Any proposal must state what it does about implicit arguments — as
a termination concern, not a splitting concern.**

### 2.4 Totality — the load-bearing detail

```
rec f : [ |- nat] -> [ |- nat] =
/ total x (f x) /          % measure: recursion decreases on x
fn x => ...
```

- **With** an aligned pragma, Beluga enforces structural descent
  (`"Recursive call not structurally smaller"`).
- **Without** a pragma, Beluga performs **no termination check at all**. ✅ **VERIFIED**
  (upgraded from UNVERIFIED): a circular body `fn y => half y` with no pragma reports
  "Type Reconstruction done" and is **accepted**; the same body with `/ total 1 /` is
  **rejected** — "Recursive call not structurally smaller."

### 2.4.1 ⭐ The two pragma conventions differ on implicits ✅ VERIFIED

Corpus distribution (699 pragmas across `library/**/*.bel`):

| form | count | share | counts implicits? |
|---|---|---|---|
| **named** `/ total d (f … d) /` | **612** | **87.6%** | **YES — spine has one slot per implicit** |
| fn-only `/ total (f) /` | 64 | 9.2% | n/a — designates nothing |
| **numeric** `/ total N /` | 13 | 1.9% | **NO — counts explicit arguments only** |
| lexicographic `/ total {a b c} (…) /` | 10 | 1.4% | as named |

**The two forms use opposite conventions, and getting it wrong rejects a CORRECT proof.**
On one genuinely-decreasing theorem with one implicit `N` and one explicit `y`:

| pragma | result |
|---|---|
| `/ total 1 /` | ✅ accepted (numeric skips the implicit) |
| `/ total y (half y) /` | ❌ **"Recursive call not structurally smaller"** |
| `/ total y (half _ y) /` | ✅ accepted (spine pads the implicit) |

**308 of the 612 named spines (50.3%) visibly pad with `_`** — e.g. `subcomp`'s
`/ total d (subcomp _ _ _ _ _ _ d) /`: 3 implicits (`K,F,W`) + 4 explicits, `d` at spine
position 7, explicit index 4.

⚠️ **Any system that emits a pragma must pick a form and own the conversion.** Emitting
numeric is simplest (13 corpus decls prove it works), but **any gate stated as "agrees with
the author's index" is comparing against an 87.6% named-form population** and therefore
depends on a named→numeric converter that counts implicits. That converter is a tested
component, not an assumption.

### 2.4.2 ⭐ `(g:ctx)` vs `{g:cxt}` — a domain fact that has broken three instruments

**Parenthesised `(g:ctx)` is an IMPLICITLY bound context variable** — never `mlam`-bound, not
an argument, but it still occupies a slot in a named pragma's spine.
**Braced `{g:cxt}` is EXPLICIT** — `mlam`-bound, and it IS an argument.
`parseCompType` reports the first as `kind:'ctx'` and the second as `kind:'pi'`.

Three separate measurement paths have been broken by this distinction:
`CTXVAR 0.0%` (§10.3), the `decIdx = -1` reclassifications (§5.8.1), and the measure
converter twice over (§2.4.3). Treat it as a domain fact, not a per-instrument bug.

### 2.4.3 Gate-2 measurement: the named→numeric converter ✅ VERIFIED

`scratch/probes/measure-convert-gate2.mjs` derives a numeric N from each named pragma by two
independent routes, substitutes `/ total N /`, and re-checks natively (baseline-clean
programs only). Over 150 named-form targets, 148 scored:

| converter | PASS | FAIL-TERM | notes |
|---|---|---|---|
| spine position − `implicitMetaCount` | 0% (all CRASH) | — | `implicitMetaCount` omits the implicit `(g:ctx)` slot |
| …+ implicit-ctx correction | 76.8% | 32 | still wrong: `abs_sn` has 5 explicit premises, 0 implicits, but `implicitMetaCount` reports 1 |
| **count from the RIGHT** (no implicit count) | **86.5%** | 19 | licensed by `total.ml:197` — *"assumes that all cdecls are before the actual rec. arg."* |

The surviving 19 split into **9 lexicographic** (`/ total {sn0 sn1 sn2} (…) /`, all poplmark
SN) — a single numeric N **provably cannot express** a lexicographic order, so the fix is form
selection (`order.ml`'s `Lex`), not conversion — plus **5 spine-truncated** (the author's
spine names fewer arguments than the type has explicit premises, e.g. `fundVar` spine len 1
vs E=3, so right-alignment fails) and **5 other**.

**⇒ 86.5% raw; ~92.1% once lexicographic targets are emitted in lexicographic form.** All 19
are in `poplmark-reloaded`/`+` (18) and `bigstep-deterministic` (1).

⚠️ **An out-of-range index CRASHES rather than rejects.** `/ total 2 /` on a
one-explicit-argument theorem gives an uncaught `Pattern matching failed` at
`reconstruct.ml:258`. A harness must distinguish a crash from a rejection, or a converter
bug reads as a soundness result.

### 2.5 Why automation here is harder than Coq/Agda

- **No library to mine.** Each development is self-contained ⇒ premise selection (hammers)
  has nothing to select from.
- **Goals are not first-order entailments** but inhabitation problems in a dependent theory
  with HOAS. FOL translation destroys the structure that matters.
- **Context reasoning is first-class**: weakening, strengthening, schema satisfaction,
  substitution composition are all proof obligations.
- **Coverage is genuinely hard.** 📚 Schürmann & Pfenning (TPHOLs 2003): *"splitting failure
  due to incompleteness of the unification may happen while checking coverage of a
  definition by case analysis over complex dependent inductive types, **even if rules for
  all constructors are given**."*

---

## 3. Corpus specimens (what the algorithm actually faces)

### Specimen A — routine structural induction (currently solved)

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
Split a computation hypothesis, recurse on components, apply two sibling lemmas.

⚠️ **CORRECTION (v2.1).** v1 and v2.0 both described this shape as "currently solved / within
reach today." **That is false.** ✅ VERIFIED: all 9 corpus instances of `ceq` are `STUCK`
(reasons: `no-move` ×4, `no-totality-measure` ×3, `step-bound`) or `TIMEOUT` ×1. Both prior
research proposals reasoned from the claim that this shape is solved. It is not — and if
routine structural induction with two sibling lemmas is out of reach, that is a more
significant datum than any of the specimens below.

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
Induction on a **type index** (not a derivation); construction of a higher-order argument
(`mlam …`) containing **two nested recursive calls**; a **substitution variable** `$W`
passed as `$[h |- $W]`; a higher-order hypothesis `f` applied to five arguments.

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
Splitting a **parameter variable** into "is the newest variable" vs "is further in";
recursion **on the context**; weakening spellings (`#p[..]`); and the **type-ascription
re-binding** idiom `let (cr : Crel [l] [h]) = cr in`, needed to make an implicit context
variable writable.

### Specimen D — the block-extended recursive result

```
| [g |- lam \x. M] =>
  let TRlam tr1 = r in
  let [h, b:block (y:term, _t:aeq y y) |- AE[.., b.1, b.2]] = ref' tr1 in
    [h |- ae_l \x. \w. AE]
```
The recursive call's result is bound **under a context extended by a block**, the
metavariable applied to the block's **projections**, then cited **under two lambda binders**.
Roughly half the hard residue needs this shape. ⚠️ UNVERIFIED (the "half" figure).

### Specimen E — context induction (100% reachable by Beluga's coverage; see §10)

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
✅ VERIFIED (source: `library/data/examples/poplmark-reloaded/2b_sn.bel:113`). The measure
names the **context variable** `g`, and the proof cases on the context itself.

⚠️ **CORRECTION (v2.1).** v2.0 said coverage "handles this shape perfectly (7/7) while failing
on Specimen A's shape." The asymmetry was real but its cause was the `TypInd` defect (§10.6),
not the shape: context splitting takes a different code path that the defect misses. With the
pragma stripped, both shapes split. What *is* separately true of this shape: the engine's
`decreasingArgIndex` returns `-1` for a `{g:cxt}` measure — it cannot resolve "induct on the
context" to a slot at all (✅ VERIFIED via `ih-blocker-probe`, §5.8.1).

---

## 4. Harpoon — Beluga's interactive prover

Tactic-driven; produces a script that elaborates to a checked Beluga program. Tactics:
`intros`, `split`, `invert`, `msplit`, `unbox`, `solve`, `by`, `suffices`.

**Built-in automation** (toggled by `toggle-automation`): ⚠️ UNVERIFIED except where noted.

| automation | behaviour |
|---|---|
| `auto-intros` | introduces assumptions on a function-typed subgoal ✅ VERIFIED present in `src/harpoon/automation.ml` |
| `auto-solve-trivial` | closes a subgoal whose type is convertible with an assumption's. *Never solves the last remaining subgoal* ✅ VERIFIED present |
| `auto-invert-solve` | solves when no splitting beyond inversions is needed; bounded DFS ✅ VERIFIED **absent** from `automation.ml`; lives in `src/harpoon/prover.ml` |
| `inductive-auto-solve` | splits on a **user-named** variable, then `auto-invert-solve` per case ✅ VERIFIED same — in `prover.ml`, not `automation.ml` |

**The induction variable is supplied by the human.** That is the shipped baseline to beat.

---

## 5. Orca as built, and its measured state

### 5.1 Architecture

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
 │ Beluga (OCaml → js_of_ocaml, or native)       │
 │  returns: ok / not-ok  +  an error string     │
 └───────────────────────────────────────────────┘
```

**Move vocabulary:** `intro`, `split`, `invert`, `fill`, `recurse`, `lemma`, `synth`,
`impossible`.

**Loop:** parse holes from the checker's report → select one hole (leftmost arm, DFS) →
generate candidate texts → try each against the checker → accept the first that typechecks
without increasing the error count → repeat. Dead ends backtrack chronologically over
*every* accepted move.

### 5.2 The defining constraint

**The interface to the logic is one bit plus an error string.** Orca has no type system of
its own; it cannot know whether a term is well-typed except by asking. Consequences:

- It emits several **spellings** of the same idea and lets the checker arbitrate — the
  internal "dual-spell, never rename" doctrine. For one fill it may emit `[h |- E]`,
  `[_ |- E]`, `[h |- E[..]]`, `[h, b:block(…) |- E[.., b.1, b.2]]`.
- Guess-and-check at scale explodes ⇒ prefilters, budgets, caps, depth bounds accumulate.
- Every divergence between the string model and real semantics needs a targeted repair.

Source census: **~773 lines** touch spelling/variant/writability/guard/budget concerns vs
**~183** touching unification/substitution — about **4:1**. ⚠️ UNVERIFIED.

### 5.3 Move generation, in detail ⚠️ UNVERIFIED (inherited description)

| move | what it emits |
|---|---|
| `intro` | `fn X => ?` / `mlam X => ?` from the goal's telescope |
| `split` | `case S of \| pat1 => ? \| pat2 => ?` — patterns from the scrutinee family's constructors, with index unification (`matchIndices`) and a rigid-head conflict pruner |
| `invert` | `let [g \|- ctor S] = d in ?` — a one-branch case |
| `fill` | a closing term. Constructor of the goal head applied to arguments from `fillScope` = let-bound results + hypotheses + metavariables. **Arguments selected by type-family HEAD only** |
| `recurse` | `let [Γ \|- R] = thm args in ?` — an IH call; decreasing slot gated by `decOk` |
| `lemma` | as `recurse`, for sibling theorems |
| `synth` | an internal SLD backward-chaining engine (`prover-synth.mjs`, 2.2k lines) |

**Known structural limits of generation:**
- higher-order argument slots draw candidates *only* from let-bound recursion results; empty
  pool ⇒ the whole constructor is dropped
- argument selection ignores index information (family head only)
- combination caps: 4 / 6 / 12 / 48 depending on site

### 5.4 The corpus and masking harness

- **850 targets** — every `rec`/`proof` in Beluga's own example library. ✅ VERIFIED (850
  ledger lines).
- **Masking**: take a real proof, replace its body with `?`, re-derive. The author's proof is
  ground truth and is never shown to the engine.
- Orchestration: suite prelude + already-complete siblings kept, other holed declarations
  stripped, then the target masked.
- **This is a genuine falsification instrument and exceeds standard practice in this field**,
  where evaluation is by case study. No corpus-scale evaluation of metatheory automation has
  been published. 📚/⚠️

### 5.5 Headline residue 📊 MEASURED (inherited)

| | |
|---|---|
| **Proved (genuine)** | **273 / 850 (32.1%)** ✅ |
| in-fragment STUCK | 402 |
| TIMEOUT | 92 ✅ |
| out of fragment by construction (coinductive / fun-copattern) | ~74 |
| programs that do not themselves typecheck | 27 |
| **analytic ceiling** | **~91%** |

### 5.6 Why the search stops (207 cheap-death targets, `death-census.mjs`) 📊

| | |
|---|---|
| targets that ever hit a hole with **zero** candidates | 8 (4%) |
| deepest dead end = candidates generated, all checker-rejected | 182 (88%) |
| rejections that are **type** errors | ~72% |
| rejections that are **scope** errors (free ctx var / free meta / not closed) | ~19% |
| rejections that are parse errors | ~2% |

**The engine is not short of moves. It emits semantically wrong terms at scale**, because
nothing in it can tell they are wrong before the checker does.

### 5.7 Constructor reach (77 scored dead-end holes, `ctor-reach-census.mjs`) 📊

| | |
|---|---|
| proposed every constructor the reference needs | 40% |
| **missed ≥1 needed constructor** | **60%** |

Of missing constructors, **73% are higher-order (binder-taking)** vs 7.7% of proposed ones —
**9.5× enrichment**. Located cause: a higher-order slot draws only from let-bound recursion
results and returns empty otherwise, dropping the enclosing constructor entirely.

### 5.8 Induction-hypothesis availability (all 391 in-fragment stuck) 📊

| | |
|---|---|
| offered `recurse` anywhere | 129 (33%) |
| offered `lemma` anywhere | 129 (33%) |
| **offered NEITHER** | **180 (46%)** |
| offered `split` anywhere | 380 (97%) |

Of those 180, **164 (91%) provably need one**: 86 self-recurse, 72 both self-recurse and
call siblings, 6 lemmas only, 16 neither. Average **1.78 calls per proof** — *shallow*
proofs. **Every lemma they call already exists as a sibling declaration**, so no lemma
speculation ("cut") is required for this population.

**This was v1's headline gap and the target of the Descent proposal.** §10 is what happened
when it was probed. **It survives the v2.1 correction intact** — it is a `recurse`/`lemma`
availability measurement and never depended on `%:split`.

### 5.8.1 Why no IH? — the causal split has NO verdict ✅ VERIFIED

`ih-blocker-probe.mjs` classifies the 180 as **MEASURE**-blocked (no usable measure slot is
ever formed ⇒ fix is measure/scheme inference) vs **GATE**-blocked (a slot IS resolved but
`decOk`/split selection withholds the IH ⇒ fix is IH admission). Its own stated decision rule
is "MEASURE-dominant ⇒ build scored induction-scheme inference; GATE-dominant ⇒ the IH exists
but is withheld."

| | MEASURE | GATE |
|---|---|---|
| as the instrument reports | 14 (35.0%) | 26 (65.0%) |
| with `slotOk` corrected to require `decIdx >= 0` | **21 (52.5%)** | **19 (47.5%)** |

The instrument scored `decIdx = -1` ("no slot found") as a *resolved* slot, because its test
only rejected `null`/`'ERR'`/`undefined`. **Corrected, the split is 53/47 — the instrument
yields no verdict at all.** Descent was designed as ACL2-style measure inference on the
strength of the uncorrected reading; KEEL inherited it.

All 7 reclassifications are `decIdx = -1`, and four (`id_red`, `str`, `redVar` ×2) are
**context-induction** theorems: `decreasingArgIndex` cannot resolve a `{g:cxt}` measure to an
argument index. Same root cause as the `CTXVAR 0.0%` bug in §10.3 — `{g:cxt}` parses as a `pi`
binder. **The engine cannot express "induct on the context" as a measure slot.**

---

## 6. Directions already tried, and what they measured

**The most important historical section.** ~30 mechanisms built, each gated by full test
suite + corpus differential. 📊 MEASURED (inherited) throughout.

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
**2/31 with +69.9% checks** — and the pieces were in the wrong *order*; the blocker was
upstream (no IH available), so everything downstream measured zero by construction.

### 6.4 There is no mass class left

Three independent instruments: feature census over all 552 stuck (every syntactic feature
3–20%); error census over 1341 rejections (the one 41% class is **4% of checks**); step-map
(56% die at step 0, consuming 18% of checks).

### 6.5 Per-target hunting

Days of per-target root-causing produced **+7 of 823**.

### 6.6 Untotalied recursion (instructive failure)

Opening recursive-call generation for author-untotalied theorems: **11 gains, 0 losses,
−11.2% checks — and 10 of the 11 were circular proofs.** Reverted. See §7.

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
the 273-target ledger.** ⚠️ UNVERIFIED at source this session.

The structural guard (`decOk`) is sound but guards only the **IH/recurse** route; these calls
arrived through the **fill** route and never consulted it. A certification-time
well-foundedness check now blocks them (a self-application is well-founded iff ≥1 argument is
a strict sub-derivation). After the fix: differential 199/199, 0 circular among all 109
untotalied completions.

⚠️ Two of the false proofs (`exTRel`, `exTRel'`) are the very targets the codebase cited as
evidence that an earlier policy was "measured sufficient". **That evidence was partly false
proofs.**

**Implication: termination must be YOUR invariant, not the checker's.** A percentage that
includes circular proofs is worse than a lower honest one.

**Note the common thread with §2.3:** the trap works *because* the measure lands on an
implicit argument. Implicit arguments are the recurring hazard surface in this system.

---

## 8. Prior art 📚

### 8.1 Directly ancestral

**Twelf's meta-theorem prover / M2** — Schürmann & Pfenning, CADE-15 1998 (LNCS 1421,
pp. 286–300); Schürmann's CMU thesis *Automating the Meta-Theory of Deductive Systems*
(CMU-CS-00-146, 2000).
Algorithm: **Filling, Recursion, Splitting**, *sequentialised **without backtracking***
(default FRS, configurable RFS). Filling = iterative deepening with size bounds; Recursion =
appeal to the IH on smaller arguments per the termination ordering (`maxRecurse`); Splitting
= all constructors in the signature (`maxSplit`). Proves type preservation for MiniML,
Church–Rosser for STLC, cut-admissibility for FOL.
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
restricted to definitional unfolding and pattern matching.

### 8.2 Proof-theoretic machinery

- **Focusing / uniform proofs** — Andreoli; Miller–Nadathur–Pfenning–Scedrov. Partition rules
  into invertible (asynchronous) and non-invertible (synchronous). Invertible rules apply
  eagerly in any order and **need never be backtracked**; the only branching is the choice of
  focus.
- **Focused Inductive Theorem Proving** — Baelde & Miller (IJCAR 2010); the **Tac** prover.
  Focusing for a logic with induction/coinduction as fixed points.
- **Cyclic proofs / infinite descent** — Brotherston & Simpson (LICS 2007); Cyclist. Build a
  possibly-cyclic derivation, then check a **global trace condition** instead of a local
  measure. Directly relevant given §7.

### 8.3 Inductive theorem proving (Boyer–Moore lineage)

**PLTP (1973) / NQTHM / ACL2.** The mature literature on *choosing* the induction. ACL2
generates **all plausible induction schemes** suggested by how functions recursively
decompose their arguments, scores each by a **"hitting ratio"**, merges compatible schemes,
**vetoes** ones that "flaw" others, and proceeds with the best; overridable by an
`:induction` hint.
**Relevance: Orca picks a single decreasing slot. Twelf and Beluga both require the human
to supply the induction. Nobody in the LF family infers it.**

**Proof planning** — CLAM, IsaPlanner. **Rippling** as search control; **lemma speculation**
and **generalisation** as failure-driven critics; **theory exploration** (HipSpec, QuickSpec,
Hipster) for automatic lemma discovery.

### 8.4 Type-directed program synthesis

Via Curry–Howard, "find a term of this type" *is* proof search.
**Synquid** (Polikarpova, Kuraj & Solar-Lezama, PLDI 2016) — polymorphic refinement types;
E-term/I-term split (elimination terms propagate types bottom-up, introduction terms
decompose top-down). **Myth** (type-and-example-directed). **SuSLik**
(Polikarpova–Sergey et al., POPL 2019) — separation logic; explicitly adopts focusing:
*"designates some rules… to be invertible; these rules can be applied eagerly and need not be
backtracked."*
All maintain a **typed internal representation** and use **unification** to decide rule
applicability — the opposite of emitting text and asking an oracle.

### 8.5 Deliberately NOT applicable

**CoqHammer / sauto / Tactician / Proverbot9001.** Hammers work by premise selection over a
large library + FOL translation + reconstruction. Beluga developments are self-contained and
the goals are not FOL entailments. Citing these as models signals unfamiliarity with the
problem.

### 8.6 Benchmarks

POPLmark; the ORBI open challenge repository; the list-machine benchmark. These are
**challenge problems**, not evaluation harnesses.

---

## 9. What is actually inside the Beluga binary — CORRECTED

v1 of this dossier claimed that Beluga's own solver, unifier, coverage checker and totality
checker are compiled into the binary Orca already talks to, and that a 423-line web shim is
all that hides them. **The first half is true and verified. The second half is materially
wrong**, and a proposal built on it will not run.

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

`logic.mli` (48 lines) exposes exactly:

```ocaml
module Options : sig val enableLogic : bool ref  … end
module Convert : sig
  val comptypToCompGoal : Comp.typ -> comp_goal
  val typToQuery   : LF.mctx -> LF.dctx -> LF.typ * Id.offset -> query * … 
  val comptypToMQuery : Comp.typ * Id.offset -> mquery * Comp.typ * LF.msub * …
end
module Frontend: sig val msolve_tactic : … -> (Comp.exp option) end
module Solver  : sig val solve  : LF.mctx -> LF.dctx -> query -> (…) -> bound -> unit end
module CSolver : sig val cgSolve : LF.mctx -> Comp.gctx -> Comp.ihctx -> mquery ->
                                   (Comp.exp -> unit) -> (bound*bound*int) -> … -> unit end
val storeQuery … val runLogic … val runLogicOn … val prepare : unit -> unit
```

`Logic.Options.enableLogic` defaults to **`ref true`** (`logic.ml:20`) — the engine is on by
default and *disable-able* via the `-logic` CLI flag, not opt-in.

### 9.2 The interactive command table — the full, verified list ✅

23 commands, all reachable via the `%:` prefix through `runCommand` (web) or `main.exe -I`
(native Beli):

```
countholes   chatteron   chatteroff   types        reset        clearholes
reload       load FILE   printhole N  lochole N    lookuphole N solve-lf-hole N
constructors IDENTIFIER  constructors-comp IDENTIFIER            help
split H V    intro N     fsig IDENT   fdef IDENT   type EXP     query E T TYP
get-type LINE COLUMN     quit
```

### 9.3 What v1 got WRONG — three corrections that matter ✅ VERIFIED

1. **`%:type EXP` type-checks in the EMPTY context.**
   `command.ml` `read_comp_expression_and_infer_type` calls
   `Reconstruct.elExp' LF.Empty LF.Empty apx_exp`. It can only type **closed** expressions
   over signature constants. It **cannot** type an expression mentioning a hole's local
   hypotheses, metavariables, or context variable. `get-type LINE COLUMN` is position-based
   over the loaded file and cannot type a synthesized term either.
   **⇒ There is no local-context typing oracle in the command table.** Any plan whose step is
   "construct a candidate term and ask Beluga for its type in the subgoal's context" **does
   not have that primitive today.**

2. **`fill H with E` and `msplit` do not exist as core commands.** `msplit` is a Harpoon
   tactic. v1 and the Descent proposal both cite `fill H with E` as available; it is not in
   the table.

3. **`cgSolve` is NOT reachable via `runCommand`.** Its only callers are
   `src/harpoon/prover.ml:189,539,566`. `prover.ml` lives in the `harpoon` library, which
   `src/web/dune` does **not** link. `harpoon_core` *is* linked — but its module list is
   `tactic, translate, automation, theorem, cidProgRewrite, revisit, web_recover`, and
   `automation.ml` contains only `auto_intros` and `auto_solve_trivial`. So
   `auto-invert-solve` / `inductive-auto-solve` are unreachable from the web build.

### 9.4 The upside v1 missed ✅ VERIFIED

`src/web/dune` already links `harpoon_core`, and `Logic` lives in the `beluga` library which
is also linked. So `beluga_web.ml` — the one OCaml file this project's security boundary
permits editing — **can call `Logic.Frontend.msolve_tactic` and a local-context
`Reconstruct.elExp'` / `Check.Comp.check` directly.** The primitives are not behind a rebuild
of core; they are behind ~30 lines in the shim plus one `_rebuild` run.

**⇒ The correct statement is: the primitives are reachable, but NOT without an OCaml shim
edit and rebuild.** "No rebuild needed" is false for anything beyond the 23 commands above.

### 9.5 `Interactive.split` is genuinely coverage-backed ✅ VERIFIED

`src/core/interactive.ml:216` `split` → `Cover.genPatCGoals` for computation hypotheses;
`genCGoals` → `Cover.genContextGoals` for context variables (`LF.CTyp`) and `Cover.genCGoals`
for other meta-types (`ClTyp`, covering `MTyp`/`PTyp`/`STyp`). So the delegation idea is
architecturally sound. §10 measures whether it *works*.

---

## 10. ⭐ The Descent proposal and its Stage-0 falsification

**This is the newest and most decision-relevant material in the dossier.**

### 10.1 What was proposed

A proposal called **Descent** was produced against v1. Its core:

- Replace text generate-and-test with a **typed contextual sequent** `Δ; Γ ⊢ τ` plus a
  **descent ledger** (a size-change graph over recursive-call handles).
- **Infer the induction scheme** ACL2-style: enumerate explicit arguments as candidate
  controlling arguments, generate schemes by driving Beluga's coverage-correct `split`, form
  candidate IHs per subgoal, score by "hitting ratio", commit to the best single argument.
- **Own termination** via a size-change (Lee–Jones–Ben-Amram) certificate checked by Orca,
  reduced to a single-argument `/ total N /` pragma, with implicit arguments **excluded from
  candidacy** so the §7 vacuity trap becomes unreachable.
- **Hybrid oracle boundary**: reuse `unify.ml`, `coverage.ml`/`split` and `cgSolve` as
  decision primitives; build induction inference + context reasoning + termination *above*
  them.
- Staged on the 180 no-IH population: **67 totalied → 69 untotalied-no-box → 44
  untotalied+box**.
- **Declared kill criterion:** on the 67, ≥90% (≥60/67) must yield a well-typed IH the SCT
  certifier marks strictly decreasing on an explicit argument; <50% (<34/67) abandons.

The design is coherent and the termination half is sound. Its **load-bearing empirical
premise** is that Beluga's coverage-correct `split` supplies the case analysis Orca fails
to propose.

### 10.2 The partition, reproduced and controlled ✅ VERIFIED

`scratch/probes/descent-partition.mjs` recomputes the three causes from source. v1's split is
exact:

| class | study (180 no-IH stuck) | control (273 COMPLETE) | **lift** |
|---|---|---|---|
| TOTALIED (author pragma present) | 67 (37.2%) | 164 (60.1%) | **0.62×** |
| UNTOT-BOX (no pragma, boxed premise) | 44 (24.4%) | 85 (31.1%) | 0.79× |
| UNTOT-NOBOX (no pragma, no boxed premise) | 69 (38.3%) | 24 (8.8%) | **4.36×** |

**The control group changes the staging rationale.** The 67 TOTALIED are *under*-represented
in the failure population — they look like the successes. The only class enriched in failure
is UNTOT-NOBOX, at 4.36×, which Descent stages **last**. Staging on the 67 is still correct
for a *falsifier* (ground truth exists only there), but **a win on the 67 does not predict
the 69**: those are a structurally different class, not a harder version of the same one.

### 10.3 The threshold was unreachable by construction ✅ VERIFIED

`scratch/probes/descent-measure-shape.mjs`:

- The 67 ids are only **49 distinct theorems** (1.37 ids/theorem — `lookup` appears 5×,
  `logEq_Monotone` 3×, `completeness` 2×). A per-id threshold overstates independent facts by
  ~37%.
- What the ground-truth measures name: **42 PREMISE** (a derivation), **15 CTXVAR** (a
  context variable — Specimen E), **7 BARE** (`/ total /`, names nothing), **3 UNRESOLVED**.
- The 10 BARE + UNRESOLVED carry **no readable controlling argument**, so the falsifier's
  "read the controlling argument from the pragma" step cannot run on them. Ceiling = 57/67.

**⇒ `≥60/67` was unreachable regardless of how well the mechanism worked.**

*(Methodological note: the first run of this instrument reported `CTXVAR 0.0%`, which the
project's "an exact 0% or 100% is a bug until proven otherwise" law correctly flagged.
`{g:cxt}` parses as a `pi` binder, not a `ctx` binder, so context induction was being
silently scored as premise induction.)*

### 10.4 The experiment ✅ VERIFIED

`scratch/probes/descent-split-probe.mjs`. For each of the 49 distinct theorems, via native
`main.exe -I` (no OCaml rebuild, no engine changes):

1. assemble the `.cfg`, mask the target body to `?`
2. `%:load`, resolve the target's hole id via `%:countholes` + `%:lochole`
3. `%:intro H` → the introduced binder spine
4. splice the intro back over the hole, reload
5. `%:split H V` for **every** introduced binder V

Splitting every binder (rather than only the measured one) was deliberate: it prevents a
measure-name→binder-position mapping bug from masquerading as a coverage failure.

Outcome classes: `CASES n` (an n-branch case — what Descent needs), `IMPOSSIBLE` (coverage's
**empty** case set), `NOVAR`, `ERROR`.

### 10.5 The result ✅ VERIFIED

Scored by binder kind (`scratch/probes/descent-split-analyze.mjs`) — META = `mlam`-bound (meta
object, context variable, type index); COMP = `fn`-bound (a computation-level derivation
hypothesis, which is what structural induction on a derivation needs):

⚠️ **The numbers in this subsection are ARTIFACTS. See §0.1 and §10.6.** They are retained
because the *comparison* between them and the corrected run is the evidence for the defect.

| binder kind | CASES | IMPOSSIBLE | other | **corrected (pragma stripped)** |
|---|---|---|---|---|
| META | 25 (92.6%) | 1 (3.7%) | 1 | 23 CASES (92.0%), 1 IMPOSSIBLE |
| **COMP** | **20 (37.7%)** | **32 (60.4%)** | 1 | **49 CASES (98.0%), 0 IMPOSSIBLE** |

Of the 38 theorems with ≥1 COMP binder, 22 (57.9%) had every COMP binder `IMPOSSIBLE`.
**Corrected: zero.**

Scored on **the argument the author's own measure designates** — the only measure that
matters, since splitting an unrelated binder is not the induction:

```
CTXVAR    7/7    100%     context induction, via Cover.genContextGoals
BARE      5/5    100%     (weak credit — no designated argument to miss)
PREMISE  13/37   35.1%    measure names a derivation — the DOMINANT class
─────────────────────────
TOTAL    25/49   51.0%
```

⚠️ **All of the above is the artifact.** With the pragma stripped, essentially every target
splits, and the "51% sits on Descent's abandon line" reading is void. Descent's Stage-0
falsifier, had it been run as specified, would have *passed* — for entirely the wrong reason.

### 10.6 The diagnosed cause — CORRECTED ✅ VERIFIED

**`impossible` is a defect in Beluga's interactive `split`, triggered by the totality
pragma.** It has nothing to do with implicit arguments, under-constrained indices, or
coverage's power.

**Chain of evidence.**

1. **The implicits are in `cD`.** `Printer.Control.printImplicit = ref false`
   (`printer.ml:8`), and `fmt_ppr_lf_mctx` skips `Plicity.Implicit` declarations
   (`prettyint.ml:948-958`). Re-running with `main.exe +implicit`:
   ```
   Meta-context:  K : ( |- env)   F : ( |- exp')   W : ( |- val)
                  Ks : ( |- envstack)   P : ( |- program)   S : ( |- env)
   Computation context:  y2 : [ |- feval K F W]*
   ```
   v2.0 read a printer default as a scope fact.

2. **Implicitness does not block coverage.** Minimal pair — `even N` with `N` implicit vs
   `{N:[|-nat]}` explicit, otherwise identical. Both split into `ez` / `ess X1`.

3. **The pragma is the trigger.** Same 13-line file, sole difference `/ total 1 /`:

   | | `%:split 0 y` |
   |---|---|
   | no pragma | `\| [ \|- ez] => ? \| [ \|- ess X1] => ?` |
   | `/ total 1 /` | **`impossible y`** |

**Mechanism.** The pragma marks the measured argument `Comp.TypInd` — that is the `*` on
`y2` above (`prettyint.ml:1217` prints `TypInd tau` as `tau*`). `Interactive.split`'s
`matchTyp` recurses through `TypInd` to *dispatch* on the underlying `TypBox`, but then calls
`Cover.genPatCGoals cD0 tau` with the **original, still-wrapped** `tau` (the binding from
`Comp.CTypDecl (n, tau, _)`). `genPatCGoals` matches only `TypCross` / `TypBox` / `TypBase`
and ends `| _ -> []` (`coverage.ml:2705`). Zero cases → `impossible`.

**Why it produced exactly the observed pattern.** Only the *measure-designated* argument is
`TypInd`-marked. So the argument the author's own measure names is precisely the one that
fails, while sibling binders split normally — which is what the "split available on the
argument the measure designates: PREMISE 13/37" reading was actually detecting.

**Why CTXVAR was unaffected (7/7).** Context splitting goes through `searchMctx` →
`genCGoals` → `Cover.genContextGoals`, a different code path with no `TypInd` wrapper.

**Corrected measurement** (`scratch/probes/descent-split-probe-nopragma.mjs`, pragma stripped):
COMP binders **49/50 CASES (98.0%), 0 IMPOSSIBLE**; `subcomp` yields **33 cases**; the 11
`NO-COMP` rows are the context-induction theorems whose binders are all `mlam`-bound.

### 10.7 What this does and does not establish

**Establishes:**
- **Coverage is not the blocker.** With the trigger removed it splits 98% of COMP binders.
  Any proposal premised on "Beluga's splitter cannot serve our population" is refuted.
- The `TypInd` defect is real, isolated to 13 lines, and free to work around (strip the
  pragma; `%:split` is a non-mutating preview).
- **Two successive architectural diagnoses were instrument artifacts** — v1/Descent's "the
  coverage oracle is missing" and v2.0/KEEL's "the goal is under-constrained." Both were
  well-argued from bad substrate.

**Does NOT establish:**
- **Split availability does not imply completion.** All 49 targets are `STUCK` in the ledger
  (✅ verified). Even before the correction, 13 PREMISE theorems had a split available on the
  measured argument and were still stuck. The 98% is *not* a forecast of conversions.
- Nothing about the engine's own behaviour. **Orca never calls `%:split`** — it generates
  splits from its own model, and §5.8 records that it already offers `split` on 97% of stuck
  targets. The split-oracle question was never the measured bottleneck; the measured gap was
  `recurse`/`lemma` availability (46%).

---

## 11. The research question — v2.0's version WITHDRAWN

⚠️ **v2.0's §11 argued that "the goal is under-constrained" and that the algorithm must carry
and refine a metavariable constraint store. That rested entirely on the wrong §10.6 diagnosis
and is withdrawn.** Indices are not unconstrained; coverage refines them at 98%. A proposal
(KEEL) was already built on the withdrawn framing before it was caught — see §0.1.

### 11.1 What the corrected evidence supports

The measured gap is unchanged and is **not about splitting**: §5.8 — **180 of 391 in-fragment
stuck targets (46%) are never offered `recurse` or `lemma`**, while being offered `split` 97%
of the time, and 164 of the 180 provably need recursion.

Composition of the 501 reachable-and-unproved targets (✅ VERIFIED from the ledger's `reason`
field; 850 = 273 COMPLETE + 49 `coinductive-out-of-fragment` + 27 `file-errors` + 501):

| verdict | n | what it is |
|---|---|---|
| `no-move` | 205 | genuine gap — the pool was exhausted |
| `no-totality-measure` | 126 | **policy refusal** — engine will not recurse without a pragma |
| `TIMEOUT` | 92 | resource exhaustion |
| `step-bound` | 67 | resource exhaustion |
| `cancelled` | 7 | harness |
| `search-bound` | 4 | resource exhaustion |

⚠️ **SUPERSEDED — see §11.1.1.** The reading "289 are a policy refusal plus a sampling
budget" was wrong on both halves. Measured 2026-08-18.

### 11.1.1 ⭐ The 126 are a PHANTOM CLASS, and the middle band is DIVERGENCE ✅ VERIFIED

**The ledger field is misleading.** `proveProgramWithScope`
(`prover-orchestrator.mjs:381-426`) already FORKS on a `no-totality-measure` decline: it
synthesizes candidate pragmas via `hypotheticalMeasures`, splices each, and re-runs the whole
search. When every fork fails it returns `first` — the **unforked** result — attaching only
`measuresTried`. **The forked runs' own stuck reasons are discarded.** So
`reason: 'no-totality-measure'` is the reason from the pass taken *before* any measure was
tried. It does **not** mean "failed for lack of a measure."

**Three measurements, each with a control (`scratch/probes/notot-scope.mjs`,
`forked-reason-probe.mjs`):**

| question | study (126) | control | verdict |
|---|---|---|---|
| fork generates zero candidates? | 0 (0.0%), mean 1.54 | 14/109 (12.8%) untotalied COMPLETE | lift **0.00×** — not a generation gap |
| self-recurses **and** has a measurable slot? | 89 (70.6%) | 77/109 (**70.6%**) | lift **1.00×** — does not discriminate |
| what do they die of under the synthesized measure? | see below | — | **zero totality rejections** |

**Forked-reason sweep (24 stride-sampled, 38 individual measure attempts):**
`no-move` 12 (50%), `step-bound` 8 (33%), `file-errors` 3 (probe defect), `COMPLETE` 1.
**Not one target failed with "Recursive call not structurally smaller."** The measure is never
the proximate blocker.

**Budget A/B (40 vs 150 steps, run alone per §13):** **24/24 identical verdicts**; the arms did
~4× the work (`sstu_helper2` 19,897 → **77,947** checks; `ctxjoinmer` 8,128 → 40,468) and
**0 of 8 step-bound targets converted.** The middle band is therefore **not resource
exhaustion** — it is **divergence**: an unbounded search that generates moves forever and never
decides. 77,947 checks with no proof is 5× past this project's own "15k checks is a defect" line.

**⇒ Three classes become two. The 126 dissolve:**

| class | was | now | mechanism |
|---|---|---|---|
| construction (`no-move`) | 205 | **~277** | build higher-order terms, don't look them up |
| **divergence** (step/search-bound, TIMEOUT) | 163 | **~211** | a search that DECIDES, not a bigger cap |
| measure | 126 | **~0** | phantom — an artifact of the discarded fork reason |

This is the **first class in this codebase's recorded history to CONCENTRATE rather than
fragment** — the direct inverse of §6.7.

### 11.2 The question worth researching

> **What is the design of a decision procedure over a declared fragment of contextual type
> theory that (a) owns its own termination, (b) constructs higher-order terms rather than
> looking them up, and (c) is complete for a fragment large enough to cover a metatheory
> corpus?**

Three sub-questions, each matched to one measured class:

1. **Termination as an owned invariant → the 126.** SCT (Lee–Jones–Ben-Amram) + the global
   trace condition, over the Pientka–Abel contextual subterm order, reduced to a
   Beluga-acceptable pragma. This is the one component that survived falsification in *both*
   prior research passes and in the §10 re-measurement. §6.6 gives the control: opening
   untotalied recursion naively produced 11 gains of which **10 were circular**.
2. **Deciding rather than sampling → the 163.** Timeouts and step-bounds are the signature of
   guess-and-check. What discipline (focusing, typed state, canonical derivations) removes
   the branching that produces them, and what is *proved* about its bound?
3. **Construction, not lookup → the 205.** §5.7: 60% of dead-end holes miss a needed
   constructor and 73% of the missing are binder-taking, because higher-order slots draw only
   from let-bound recursion results. Terms must be *built* (the Synquid I-term discipline),
   not selected.

**Sequencing is forced by §6.3** (a partially-built composite measures zero; pieces in the
wrong order measure zero *by construction* — the 2/31 result). Termination gates recursion
availability; recursion availability gates whether constructed higher-order slots have
anything to build from. So: state → termination → construction, one system, one toggle.

**What a research pass should NOT do:** survey Twelf / Abella / ACL2 / hammers (§8 covers it,
and more citations change no decision); or propose an integration of Beluga's existing
engines — two passes have now done that and both aimed at artifacts.

---

## 12. Open directions, revised

Each with evidence for, the known objection, and a cheap falsifier.

⚠️ **v2.0's directions 1 and 2 (index-refinement ordering; constraint-carrying state) are
WITHDRAWN** — both were aimed at the withdrawn §10.6 diagnosis. See §0.1.

1. **⭐ Termination as an owned invariant (SCT) → the 126 `no-totality-measure`.** Build the
   size-change certificate over the Pientka–Abel contextual subterm order, verify it in
   Orca, gate **every** recursive edge on it (`fill` and `recurse` alike), delete the
   measure fork, and emit `/ total … /` only as a witness of a certificate already held.
   ⚠️ **SCOPE CORRECTED (§11.1.1): this has NO measured yield.** Zero of 21 probed targets
   died of a totality rejection; the fork already supplies measures to 100% of the 126. Build
   it for **SOUNDNESS ONLY** — stake it as *zero circular admissions*, never as *+126*.
   *For*: §7's five false proofs and §6.6's 10-of-11 circular gains are real and unaddressed;
   it is the only component that survived falsification in all three research passes; and it
   has a **built-in control**.
   *Against*: Beluga accepts single-argument structural orders, so an SCT certificate whose
   only descent is genuinely lexicographic must still be reduced (Krauss) or declared outside
   the fragment.
   **Falsifier: on the 11 known-circular gains of §6.6, the certifier must reject 10/10 and
   admit the 1 genuine one. Zero tolerance on any circular admission.**

2. **Construction, not lookup → the 205 `no-move`.** Higher-order slots must *build* terms
   (enter the binder, synthesize the body against its known expected type — the Synquid I-term
   discipline) instead of drawing only from let-bound recursion results.
   *For*: §5.7 — 60% of dead-end holes miss a needed constructor, 73% of the missing are
   binder-taking (9.5× enrichment); §6.2 proves the term is *absent from the pool*, not buried.
   *Against*: **downstream of direction 1** — §6.3's 2/31 result is exactly this mechanism
   built before the IH was available. Do not build it first.

3. **Context induction as an expressible measure.** `decreasingArgIndex` returns `-1` for a
   `{g:cxt}` measure (§5.8.1) — the engine cannot name the context as the decreasing slot.
   *For*: small, separable, verified defect; and nothing published infers context induction.
   *Against*: 15 of 67 in the totalied no-IH population. Size before building.

4. **Strip the pragma when using `%:split` as an oracle.** Free, immediate, no rebuild (§0.1).
   Not a research direction — a correction to any experiment that drives Beluga's splitter.

4. **Context induction as a shipped seam.** 7/7 measured. Small, separable, and nobody else
   does it.
   *For*: the one unambiguously working result in §10.
   *Against*: 15 of 67 in this population — a real but bounded prize. Size it before building.

5. **Own typed core + higher-order pattern unification.**
   *For*: full independence; makes the search a decision procedure.
   *Against*: re-implementing reconstruction/coverage/totality invites silent divergence from
   Beluga — the original reason for the oracle architecture.

6. **Focusing discipline retrofitted.** The engine already classifies moves invertible vs
   non-invertible and then backtracks over all of them anyway.
   *For*: four independent confirmations in the literature; small change; targets the 92
   TIMEOUT + step-bound population.
   *Against*: it is search control, which has never paid here (§6.1).

7. **Cyclic proof / global termination (SCT).** Survives §10 intact; independent of the
   oracle question.
   *For*: §7 makes termination your invariant regardless.
   *Against*: interaction with Beluga's own totality checker unclear; must still emit a
   single-argument pragma Beluga accepts.

8. **Automatic induction-scheme inference (ACL2-style).** Still genuinely novel for the LF
   family.
   *Against*: §10 shows the *scheme-generation* step (drive coverage) fails on 65% of the
   dominant class, so this is downstream of direction 1 or 2. **Do not build it first —
   §6.3.**

---

## 13. Laws and traps (each cost a real debugging session)

**Measurement**
- **Every census needs a CONTROL GROUP** — score the *solved* set identically. **Report the
  lift, never the raw share.** §10.2 is a live example: the raw share said "stage on the 67";
  the lift said the 67 look like successes.
- **An exact 0% or 100% is a bug until proven otherwise.** Caught twice in this session alone
  (§10.3, and a 100% NO-INTRO run that was an off-by-one in response parsing).
- **On a merged ledger, verify each field's semantics per source.** `steps`/`moveKinds` are
  per-source and unreliable; `outcome`/`checks` are trustworthy.
- **A COMPLETE with zero accepted moves is a harness bug** (masking failed), not a proof.
- **A completion whose check count is implausible for its reference proof is a false positive
  until proven otherwise.**
- **Never A/B beside a sweep** — a contended arm once faked a clean 2× regression.
- **Extracting a produced declaration with the masker RE-MASKS it** — an audit did this and
  passed 11/11 while every proof it "verified" was a hole.
- **Score on the argument that MATTERS.** §10's first verdict counted a target as
  `SPLIT-OK` if *any* binder split; `subcomp` scored OK while the argument its measure names
  was `IMPOSSIBLE`. Re-scoring by binder kind moved the headline from 67% to 51%.
- **Collapse duplicate targets before quoting a denominator.** 67 ids = 49 theorems.
- ⭐ **A PRINTER DEFAULT IS NOT A FACT ABOUT THE TERM.** `%:printhole` hides implicit
  meta-variables (`printImplicit = ref false`); v2.0 read that absence as a scope fact and
  built a research programme on it. **Before concluding something is not there, check whether
  you are allowed to see it** — `main.exe +implicit`, `Printer.with_implicits`.
- ⭐ **THE STUDY POPULATION CAN CARRY THE TRIGGER.** The §10 probe measured the TOTALIED
  class, and the defect it found fires on the totality pragma — so 100% of the sample was
  confounded and the confound was invisible in the results. **Ask what the population has in
  common besides the property being studied.** A control drawn from *outside* the selection
  criterion would have caught it immediately.
- ⭐ **TWO SPELLINGS OF ONE PRAGMA CAN USE OPPOSITE CONVENTIONS.** `/ total N /` counts
  explicit arguments only; `/ total d (f … d) /` needs a spine slot per implicit. The wrong
  choice rejects a *correct* proof, and an out-of-range numeric index **crashes**
  (`reconstruct.ml:258`) instead of erroring. Never infer a convention from one form (§2.4.1).
- ⭐ **A STUCK REASON CAN PREDATE THE RETRY.** When every measure fork fails,
  `proveProgramWithScope` returns the UNFORKED result and discards the forked runs' reasons —
  so `no-totality-measure` names a decline that a later retry may have moved past. An entire
  "policy refusal" class (the 126) was invented by reading it literally. **Before trusting a
  failure label, check whether the code retried after emitting it.**
- ⭐ **A SENTINEL IS NOT A VALUE.** `ih-blocker-probe` scored `decIdx = -1` ("not found") as a
  resolved slot because its guard only rejected `null`/`'ERR'`/`undefined`. That single test
  moved a 65/35 verdict to 53/47 — i.e. from "build measure inference" to no verdict at all.

**Gating**
- **The test suite cannot catch corpus behaviour; the DIFFERENTIAL is the gate.**
- **Zero regressions or revert.** Declare a numeric stake *before* building; honour it.
- **Size by the mechanism's own predicate**, not a text census — text overstated reach 4× in
  one session, 24× in another.

**Method**
- **When a class survives sizing, ask what is UPSTREAM before building.**
- **Read the emitted text before doubting a mechanism.**
- **Verify the primitives before designing around them.** Three of Descent's cited primitives
  did not exist as described (§9.3).

---

## 14. Where everything is

| area | path |
|---|---|
| Search loop, move dispatch | `js/editor-src/prover/prover-orchestrator.mjs` |
| SLD backward-chaining synthesis | `js/editor-src/prover/prover-synth.mjs` |
| Split/invert/fill model, schemas, index unification | `js/editor-src/prover/hole-split.mjs` |
| Comp-types, totality, decreasing index | `js/editor-src/prover/prover-comp-type.mjs` |
| `decOk` gate + circular-self-call guard | `js/editor-src/prover/prover-hyp.mjs` |
| Corpus assembly + masking | `js/editor-src/prover/prover-corpus-decls.mjs` |
| **Beluga's solver / unifier / coverage / totality** | `Beluga-W/src/core/{logic,unify,coverage,total}.ml` |
| **Interactive command table (23 commands)** | `Beluga-W/src/core/command.ml` |
| **Coverage-backed split/intro** | `Beluga-W/src/core/interactive.ml:139,216` |
| **The 423-line web shim** | `Beluga-W/src/web/beluga_web.ml` |
| **Harpoon tactics (`prover.ml` NOT linked into web)** | `Beluga-W/src/harpoon/` |
| Native checker | `Beluga-W/_build/default/src/beluga/main.exe` |
| Native interactive (Beli) | `main.exe -I`, commands prefixed `%:` |
| Single-target native probe | `scripts/prover-native-oracle.mjs` |
| The gate | `npm run prover:diff` |
| Current ledger | `results/corpus/library.native-rebaseline-20260815.jsonl` |
| Full numbered history (55 entries) | `docs/orca-research/prover-master-plan.md` |
| v1 of this dossier | `docs/archive/orca-research-brief.md` |

**Instruments** (`scratch/probes/`): inherited — `death-census`, `ctor-reach-census`,
`recurse-offered-census`, `slot-shape-census` (+control), `ih-need-census`, `ih-blocker-probe`,
`untotalied-census`, `circularity-audit`, `rebaseline` (resumable full sweep), `ab-toggle`,
`diverge-one`, `class-dump`, `step-map`.
**New 2026-08-17** — `descent-partition.mjs` (3-cause partition + control group),
`descent-measure-shape.mjs` (what the ground-truth measures name),
`descent-split-probe.mjs` (drives `%:load`/`%:intro`/`%:split` through native Beli),
`descent-split-analyze.mjs` (scores by binder kind), **`descent-split-probe-nopragma.mjs`**
(the corrected re-measurement — same probe with the totality pragma stripped). Outputs:
`descent-totalied-ids.txt`, `descent-split-probe.jsonl`, `descent-split-probe.out`,
`descent-split-nopragma.jsonl`, `descent-split-nopragma.out`.
**Switch-1 falsification (2026-08-18)** — `notot-scope.mjs` (does the 126's reference proof
recurse, with a control), `forked-reason-probe.mjs` (re-derives the stuck reason the fork
discards; `--max-steps` for budget A/B), `measure-convert-gate2.mjs` (named→numeric measure
converter + its gate). Outputs: `forked-reason.jsonl` / `.out` (40 steps),
`forked-reason-hi.jsonl` / `.out` (150 steps), `measure-convert-gate2-v2.jsonl`.
⚠️ `forked-reason-probe` inserts a pragma beside any existing one, so the 5 `/ trust /`
targets in the 126 yield spurious `file-errors`; observed `file-errors` was 12.5%, above that
4%, so a second undiagnosed splice defect remains.

### 14.1 Reproducing the §10 result

```
node scratch/probes/descent-partition.mjs           # 67/44/69 + control lift
node scratch/probes/descent-measure-shape.mjs       # 42 PREMISE / 15 CTXVAR / 7 BARE / 3 UNRESOLVED
node scratch/probes/descent-split-probe.mjs         # the ARTIFACT run (pragma present)
node scratch/probes/descent-split-analyze.mjs       # its binder-kind table
node scratch/probes/descent-split-probe-nopragma.mjs  # the CORRECTED run: COMP 98% CASES, 0 IMPOSSIBLE
node scratch/probes/ih-blocker-probe.mjs            # ⚠️ slotOk bug live — see §5.8.1 before quoting
```

### 14.2 Reproducing the `TypInd` defect in 13 lines

```
LF nat  : type = | z : nat | s : nat -> nat;
LF even : nat -> type = | ez : even z | ess : even N -> even (s (s N));
rec f : [ |- even N] -> [ |- nat] =
fn y =>
?
;
```
`printf '%:load m.bel\n%:split 0 y\n%:quit\n' | main.exe -I` → two cases.
Insert `/ total 1 /` above `fn y =>` and re-run → `impossible y`.
Add `+implicit` to any invocation to see the hidden implicit meta-variables.

---

## 15. What a good proposal contains

1. Which measured gap it attacks, with the number from §5 or §10.
2. Which prior system it descends from and what it does differently (§8).
3. Its termination invariant, and why it does not depend on the checker (§7).
4. **An explicit position on implicit arguments (§2.3, §2.4.1, §7).** As a TERMINATION
   concern, not a splitting one: which pragma form does it emit, how does it count implicits,
   and how is the named→numeric conversion tested? Implicit positions must be excluded from
   the measure domain (§7's five false proofs all landed on one).
5. A count of independent pieces; if >1, all behind one toggle (§6.3).
6. A numeric stake and kill criterion, declared before any code — **stated against a
   denominator that is reachable** (§10.3).
7. A **cheap falsifier**, and a check that every primitive it calls actually exists (§9.3).
8. An explicit position on §9 — which Beluga primitives it uses, and whether it needs a shim
   edit + rebuild.

**Rejected without measurement:** anything that adds candidates, reorders candidates, prunes
candidates, or adds a budget (§6.1, §6.2).

---

## 16. Honest summary

The machinery works, the evaluation methodology exceeds the field's, and the diagnosis is
unusually well measured. The algorithm at the centre is a heuristic text generator arbitrated
by a black box.

v1 concluded that the black box is only opaque because of a 423-line shim, and that a
6,155-line proof-search engine sits unexposed beside it. **That is half right.** The engine is
there and `logic.mli` is exactly as described. But the interactive surface does not expose a
local-context typing oracle, and `cgSolve` is not linked into the web build (§9.3).

**v2.0 then concluded that coverage fails because the goal is under-constrained. That was
wrong** (§0.1, §10.6). Coverage splits 98% of computation binders once you remove a defect in
Beluga's interactive `split` that the totality pragma triggers. The defect is 13 lines to
reproduce and free to work around.

**Three architectural diagnoses have now been artifacts of instruments, in a row:** "the
coverage oracle is missing" (v1 → Descent), "the goal is under-constrained" (v2.0 → KEEL), and
"measure inference is the fix" (the 65/35 MEASURE/GATE reading, §5.8.1 — actually 53/47, no
verdict). Each was well-argued from bad substrate. **The recurring failure is not reasoning
quality; it is that instruments were trusted without a control drawn from outside their own
selection criterion.** §13 now carries three laws written directly from these.

What survives, and what the corpus actually says: **289 of the 501 reachable-and-unproved
targets are a policy refusal (126 will not recurse without a pragma) plus a sampling budget
(163 timeouts and step-bounds)** — not intractability. The remaining 205 need terms to be
*constructed* rather than looked up. Those three classes map onto three mechanisms —
termination ownership, deciding rather than sampling, construction — sequenced in that order
because §6.3 says a composite built out of order measures zero by construction.

That is the system to design, while keeping the two things that make this project credible:
it produces checkable proof terms, and it is measured against a real corpus.
