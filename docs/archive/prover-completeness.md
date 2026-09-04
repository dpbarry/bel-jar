# Generation-level completeness — historical appendix

> **Not a current plan.** Absorbed into [`orca-research/prover-master-plan.md`](orca-research/prover-master-plan.md).
> Historical completeness-audit prose only (D-divergences, enumerators obligation).

The former-closure table (plan §1) proves the engine can *emit* every inductive-fragment
expression former. That is necessary but NOT sufficient: coverage requires that **at every
hole state, the generated candidate set contains a next step of some valid proof**. This
document states that obligation precisely, gives the completeness argument, and records the
audited divergences. A lemma failing is a *symptom*; the measure is this spec holding.

## 1. The hole state (what generation may read — types only)

A hole is `⟨Γc; Δ; goal⟩` under a theorem `T` with totality measure `μ`:

- **goal** — a computation type: leading binders (`{X:U}` Pi over meta-objects — LF terms,
  **contexts**, **substitutions `$[h ⊢ g]`**, parameters — and implicit `(g:schema)`),
  then boxed premises, then a boxed/ctype conclusion.
- **Γc (comp context)** — fn-bound variables of box/ctype type. *Usable as: whole proof
  terms (bare), scrutinees of `case`, arguments to rec/lemma calls (BARE — never inside a
  box or LF term).*
- **Δ (meta context)** — metavariables `X : (Ψ ⊢ A)`, parameter variables `#p`, context
  variables, substitution variables `$W`. *Usable as: LF terms inside boxes (with the
  appropriate substitution closure), split scrutinees (boxed), inversion/destructuring
  subjects, arguments rendered `[Ψ ⊢ X…]`.*
- **The signature** — LF families/constructors, schemas, sibling complete lemmas, and `T`
  itself as the IH, guarded by μ.

## 2. The complete step relation (per move kind)

For each hole, the union of generated candidates MUST include, up to α-equivalence:

- **intro** — one skeleton introducing the goal's **entire** leading binder telescope:
  `mlam` for every explicit Pi *regardless of the bound object's sort* (term, context,
  substitution `$W`, parameter), `fn` for every boxed premise. Emitting a *partial*
  telescope is a bug worse than emitting none.
- **split** — `case` on: every Γc variable of box type; every Δ metavariable (boxed
  scrutinee) whose family has ≥ 1 unifying constructor — guarded against re-splitting an
  already-destructured subject (openCasesAt / branch-body checks), with annotated + bare
  arm variants, parameter arms from the schema, **a variable arm per NAMED context entry
  whose type-family matches the scrutinee's AND whose type is independent of the other
  extension entries** (`g, u:pr A[..], v:pr B[..]` — `#p[..]` ranges only over the schema
  part, so `u`/`v` need their own arms; a DEPENDENT entry like `hz : hyp z C[]` is excluded
  by the scrutinee's strengthened indices and its arm is not demanded), and `impossible`
  as the 0-arm case.
- **invert / saturate** — for any Γc or Δ hypothesis whose (refined) type admits a
  **unique** unifying constructor: the destructuring `let`. This applies recursively to
  destructured components (saturation to a bounded fixpoint) — an inversion chain is
  deterministic information, never speculation.
- **fill** — the goal inhabited by: a bare Γc variable of exactly the goal type; a Δ
  entry / parameter projection under the right substitution (identity `[..]`, or the
  in-scope substitution variable `[$W]` when the goal context differs); constructor
  applications with arguments drawn recursively from this same relation.
- **rec / lemma call (incl. the tail-call fill)** — `T'` any sibling lemma or the IH. The
  argument for each premise slot draws from ALL of: Δ metavariables (rendered
  `[Ψ ⊢ X]`), **Γc variables (rendered bare)**, and recursively synthesized terms. Pi
  binders re-instantiate: context Pi → the (possibly block-extended) context; **substitution
  Pi → the in-scope substitution variable, extended alongside the context
  (`$[h, b:… ⊢ $W[..], b]`)**; object Pi → the unification-determined term. For the IH,
  the **decreasing slot** (see §3) must be a certified-smaller sub-derivation
  (`fromScrutinee`/decOk); every OTHER slot is unconstrained — **passing an original
  premise through unchanged is legitimate and required** (transitivity shape).
- **synthesis** (backward chaining) — SLD over the above with rules = constructors +
  lemmas + IH; facts = **all** Γc/Δ hypotheses (Γc facts usable only as rec/lemma args or
  the whole tail — never inside LF terms); saturation = unique-constructor inversion of
  **facts and rule-products**; bounded depth must report `depth-bound`, never `no-move`.

**Ordering/budgets may rank candidates; they must never make the set empty of every
spec-mandated candidate. Prefilters must be sound (reject only checker-rejectable).**

## 3. The decreasing slot — named measures

`/ total N /` counts **explicit arguments uniformly — Pi binders and box premises alike**
(implicit paren groups don't number). Ground truth 2026-07-12 by native experiment:
`/ total 1 /` on `copy : {n:[ |- nat]} [ |- unit] -> [ |- nat]` designates the Pi binder
`n` and certifies; `/ total 2 /` is rejected. The named `_`-spine form
`/ total n (copy n _) /` also certifies. `/ total x (f a1 … x) /` (named) designates
the **last argument of the application pattern**; its premise index is recovered by
aligning the pattern's argument spine against the theorem's: context/Pi binders + implicit
metavariables (the distinct free uppercase names of the type, Beluga's implicit
quantification) + explicit premises in order. Falling back to "premise 0" is WRONG for any
multi-premise named-measure theorem and silently inverts the IH slot discipline.

## 4. The completeness argument

Focused proof search over the inductive fragment is complete when (i) intro covers the
whole binder telescope, (ii) splits cover every case-able subject, (iii) closure draws
application heads from all typed sources with arguments from all typed sources, and
(iv) certification is sound (the checker accepts exactly the valid steps). Given the
former-closure table (every emitted shape is expressible) and §2 (every needed candidate
is generated), any inductive-fragment proof's next step is always in the candidate set, so
the search finds *a* proof whenever one exists within the honest bounds — and a bound hit
is reported as such. Beluga's checker provides (iv). What remains engineering (bounds,
ordering) can cost time, never coverage-with-silence.

## 5. Audited divergences (2026-07-10) and their status

| # | Divergence (violates) | Where | Status |
|---|---|---|---|
| D1 | Named totality measure → decreasing slot defaulted to premise 0 (§3) | `prover-comp-type.mjs decreasingPremise`, bridge `recurseTexts`/`synthMoves`/`mkRule`/`isIntroducedPremise` | **FIXED** — spine-aligned resolution (`decreasingBoxIndex`) |
| D2 | No unique-ctor inversion of base FACTS (only rule-products) (§2 invert) | `prover-synth.mjs` saturation | **FIXED** — fact-inversion saturation to bounded fixpoint |
| D3 | Γc hypotheses excluded as call args; boxed when admitted (§2 rec/lemma) | bridge `candsFor`/`premiseBoxArg`; synth fact rendering | **FIXED** — comp sources admitted, rendered bare; synth `viaComp` facts restricted to rule-arg/tail positions |
| D4 | Intro telescope truncated at `$`/`#` binder names; partial skeleton emitted | `hole-split.mjs buildIntroSkeleton` | **FIXED** — full name grammar; stall ⇒ null, never partial |
| D5 | Substitution-Pi arguments unrepresentable in IH/lemma calls (§2) | bridge `piRecurseTexts`/`mkRule`/`callArgs`, `schemaSomeVars`, `fillCandidates` | **FIXED** — `subst` Pi kind; pass-through + parallel extension + extended result binding; IMPLICIT schema some-vars now erased (`schema c = block (x:tm, u:oft x A)` — A leaked as a free meta at call sites); parameter fills under a substitution variable (`#p.2[$W]`, named + positional). Context-morphism theorems solve end-to-end |
| D10 | Multi-line hole GOALS (Pi type printed on following lines) parsed as `goal: null` — the whole hole state dropped | `hole-report.mjs parseHoles` | **FIXED** — block-mode accumulation; pinned |
| D6 | Δ metavariables never split (multi-ctor sub-derivations) (§2 split) | bridge `candidateMoves` splits | **FIXED** — boxed-scrutinee splits for general cD metas (≥2 ctors, no unique inversion, re-split guarded), ranked last |
| D7 | Synth facts with shorter-than-goal contexts dropped (no weakening) | bridge `pushFact` | **FIXED** — strict-prefix contexts admitted, spelled `X[..]` at use sites (comp vars excluded) |
| D8 | Depth/node bounds report `no-move` instead of `bound` | `prover-synth.mjs`, bridge stuck reasons | **FIXED** — `opts.stats.boundHit` threaded through synthMoves/candidateMoves; STUCK reason is `search-bound` when a bound (not the move set) was the limiter |
| D9 | Greedy premise resolution: first matching fact, no backtracking — one wrong early binding killed derivable chains (fair enumeration, §2) | `prover-synth.mjs applyRule` | **FIXED** — bounded DFS over resolution choices (found by the D3 pin, not by a corpus lemma) |
| D11 | **WRITABILITY** (2026-07-12, the eval_add_comm root cause): the hole report's namespace ≠ the source namespace. The checker INVENTS names (via `--name` pragmas) for implicit pattern arguments it had to elaborate; they appear in the reported meta context but are bound NOWHERE in source, so any emitted reference to them is rejected "This free meta-variable is illegal" — the §2-mandated candidate existed but its only emitted spelling was uncertifiable BY CONSTRUCTION. (`"`-quoted internals were the first instance of this dimension; plain-looking invented names are the second.) | `prover-synth.mjs` object-Pi arg rendering | **FIXED** — every synth plan with explicit object-Pi args is emitted in TWO spellings, named first (more constrained; load-bearing when a call has no box premises to infer from) and `[Ψ ⊢ _]` second, checker-arbitrated (the D3 dual-spelling doctrine). Pinned on invented shapes. RESIDUAL: a plan that must reference an invented-name FACT in a premise slot is still unemittable — see §8 |
| D12 | **PER-PATH guard scope** (2026-07-12, same witness): the duplicate-call, inversion-dup, and self-chaining guards were scoped to `branchBodyBefore` (innermost arm only), so every nested split LAUNDERED them — the same junk lemma call was re-accepted at three nesting depths, and each junk fact faked state novelty past the `seen` fingerprint (which is hypothesis-multiset– and branch-text–inclusive, and whose `branchProgress` exemption is satisfied by every let). | bridge guards + `proveProgramCore` | **FIXED** — `pathBodyBefore` (ancestor-chain body, closed siblings excluded) scopes those guards; plus §7 invariant 2 implemented as the per-path canonicity refute (below) |
| D13 | **Measure-synthesis fork space missed object-Pi positions** (2026-07-12 audit of the 148-target no-totality residue: 106 box-only / 22 object-Pi / 20 unicode-ident): recursion on an explicit Pi-bound term (`{M : [Ψ ⊢ A]}`, the standard induction-on-M idiom — refl/exTRel class) was never proposed; and `decreasingBoxIndex` read `/ total N /` as a BOX ordinal when ground truth (§3) numbers explicit args uniformly — latent while no measures sat on Pi positions. | `hypotheticalMeasures`, `prover-comp-type.mjs` | **FIXED** — `measureDesignation(thm)` (single source of truth: `{kind:'box',boxIdx} \| {kind:'pi',piIdx}`); pi positions forked in the NAMED `_`-spine form (`/ total m (f m _) /` — the D6 pi-object split gate keys on the measure NAMING the binder); mixed pi+box theorems route to `piRecurseTexts`, which now passes box premises as call args and binds CTYPE results bare or by unique-ctor destructure (`let ExWk/c [h ⊢ M1] tr = f … in`). Synth's IH rule is withheld for pi measures (decOk gating is box-keyed). Pinned; whole chain live-verified on exTRel |
| D14 | **Writability, instances 3–4: implicit CONTEXT variables** (2026-07-12, exTRel): a theorem type's free context variables (`Crel [l] [h]`) are implicitly quantified and UNBOUND in the body — every split/fill/call spelling them is rejected "free context variable is illegal" (the checker prints such goals with `[_]` contexts); AND a mid-proof re-elaboration may RENAME a reported ctx var (l → g) away from the source-bound spelling. | intro emission + candidate variants | **FIXED** — (a) when the goal shows unnamed contexts, the intro is also offered with Beluga's own naming idiom appended (`fn cr => let (cr : Crel [l] [h]) = cr in ?`, ranked first — it strictly dominates); (b) when exactly one reported ctx name is source-unbound and exactly one source-spelled name is missing from the report, every affected candidate gains a source-spelling variant, checker-arbitrated. Live-verified: exTRel's split + both IH recursions certify |

Note on D3's rendering: a comp-context hypothesis has two possible spellings (a
pattern-bound sub-derivation certifies BOXED; an fn-bound premise variable certifies BARE)
and provenance is not syntactically recoverable — so `callArgs` proposes BOTH variants and
the checker arbitrates, per the generate-and-verify law.

Every fix is type-driven (no name literals — `test-prover-no-overfit.mjs` guards this
file's consumers) and pinned by pure tests on ≥2 shapes. The held-out corpus and the 11
gates are spot-checks OF this spec, not the target.

## 6. Enforcement by construction (gaps are found by REASONING, not by corpora)

The maintenance obligation is that a coverage gap must surface mechanically, before any
blind batch can stumble on it. Three instruments carry that:

1. **The shape-class coverage matrix** (`tests/test-prover-coverage-matrix.mjs`). The
   reduction it exploits: generation is *syntax-directed*, and the anti-overfit guard
   enforces *name-independence* — so what candidates are generated depends only on the hole
   state's SHAPE CLASS (measure form × goal binder sorts × hypothesis kinds × schema form ×
   context relation), never on names. Completeness over the infinite fragment therefore
   reduces to the finite class table, and the matrix asserts the §2-mandated candidate per
   class on invented signatures. A gap = a red row, by construction. **Any new syntax
   dimension (a new binder sort, hypothesis kind, schema form) REQUIRES a matrix row in the
   same change.**
2. **The grammar anchor** (same file). The fragment boundary is pinned to the ground truth
   this argument is anchored to — the `Raw_*` expression-former vocabulary of
   `Beluga-W/src/parser/comp_parser.ml`. Upstream adding/removing a former fails the test
   with a re-audit instruction; the closure table and this spec cannot silently drift from
   the grammar.
3. **Blind held-out batches** (`tests/heldout-corpus/`, authored by Harpoon-oblivious
   agents) are FALSIFICATION of instruments 1–2, not the discovery mechanism. A blind
   failure means two defects: the coverage gap itself AND the missing matrix row / spec
   clause that should have caught it — both must be fixed, and the postmortem is "why did
   reasoning miss it", not just "make it pass".

## 7. The DECIDABILITY contract (timeouts must become unreachable, not removed)

The search over the inductive fragment must be a DECISION PROCEDURE: terminate with a
proof, or with NO-PROOF-IN-FRAGMENT — `search-bound`/timeout stay only as safety nets that
should never fire. Four invariants make that true by construction:

1. **Finite universe.** Every candidate's pieces are drawn from the subterm closure of the
   hole state + signature, instantiated only by unification — never invented. The
   reachable state space is then finite.
2. **State canonicity.** Hole states are memoized up to α/print-normalization
   (`alphaGoal`/`ctxSig`); a revisited state REFUTES its branch. No loops are possible,
   only exhaustion.
3. **Progress or focus.** Every accepted move must (a) consume structure — split/invert/
   intro; (b) belong to a focus chain bounded by the goal's size — constructor/IH/lemma
   spines; or (c) be SATURATION into a bounded fact database (deterministic inversions,
   rule products over the universe). A move that certifies but neither consumes, focuses,
   nor saturates is junk BY DEFINITION — the ceq-closure lemma orbit is the witness. The
   chain cap is a stopgap for (c); the real mechanism is moving speculative lemma results
   out of the STEP dimension entirely and into in-process saturation.
4. **Checks O(proof).** The checker certifies PLANS (whole chains/subtrees found
   in-process), never per-candidate arbitration. Greedy per-candidate certification is why
   deep searches cost ~1400 round-trips: the count must scale with the proof's size plus
   plan revisions, not with candidates × depth. prover-synth already embodies this for
   closing chains; the contract extends it to lemma products (saturation) and ultimately
   to the full move space.

Exhaustion of the finite space without a proof yields the honest verdict
NO-PROOF-IN-FRAGMENT — a decidable "no", distinct from any bound. Under this contract the
remaining engineering (ordering, batching) can only shrink the constant factor of "a
matter of time", never re-open non-termination.

### 7.1 Invariant 2 refined: PER-PATH canonicity over the junk-free quotient (2026-07-12)

The naive reading of invariant 2 ("memoize states, refute revisits") is doubly wrong, and
both errors were measured:

- **Global memoization over-refutes.** Sibling case arms are independent obligations that
  legitimately α-repeat (symmetric constructors). Only the ANCESTOR CHAIN — the enclosing
  split points of the current hole — may refute a repeat. Depth-pruned ancestor tracking
  (DFS focus order makes nesting depth a sufficient path key) keeps siblings legal by
  construction.
- **Literal state identity under-refutes — an α-regress is NOT a literal revisit.** Every
  move ADDS something (junk lets add facts; splits add pattern products), so the raw state
  multiset grows strictly and never repeats. The canonical object must be the state
  **quotiented by regenerable facts**: sig = shared-α-normalization of the goal + the
  structural hypothesis types, EXCLUDING (i) call-result bindings (`let … = f a… in` —
  ≥2-token RHS) anywhere on the path and (ii) bare object metas (index sorts; their
  occurrences inside judgment facts and the goal carry the information). *Justification of
  the quotient:* a call result is derivable again from the structural facts by the same
  call, so two states with equal junk-free signatures have the same derivable closure —
  they ARE the same obligation. A hole strictly deeper than an ancestor with an equal
  junk-free signature re-poses that ancestor's obligation with nothing consumed: refuted.

Implemented in `proveProgramCore` (`pathAnc` stack + `junkFreeSig`); `pathBodyBefore`
gives every guard the ancestor-chain scope. Pinned in test-prover-path-canonicity.

### 7.2 Honest gaps in the §7 argument itself (open, ranked)

1. **Invariant 1 does NOT hold for nested splits.** A schematic sub-derivation's metas
   are always freshly splittable (X → c X₁ X₂ → split X₁ → …): the split-nesting
   dimension is unbounded, so "finite universe" is false as stated. Canonicity (7.1)
   refutes only the α-repeating descents; a strictly-refining descent (each arm visibly
   refines the goal or a fact) can still go arbitrarily deep. The honest interim is a
   per-path split-depth budget reported as `search-bound` (never `no-move`). The
   PRINCIPLED closure is №2 below.
2. **Plan-driven splitting is the real invariant-4 architecture (the north star).** Splits
   should be DEMANDED by synthesis — a backward-chaining plan blocked on a fact whose
   refinement would unblock it requests exactly that split (focused proof search; the
   focusing discipline is what bounds the descent by the goal's structure). Today splits
   are enumerated forward and ranked last, which is why a poisoned greedy path can wander
   into them. Moving splits into the plan domain subsumes the split-depth budget, realizes
   "checks O(proof)", and makes termination an argument about plan size, not state counts.
3. **Writability residual (D11).** Premise-slot references to invented-name FACTS are
   still unemittable (no `_` analogue in term positions). Two principled directions:
   (a) synthesis prefers plans whose referenced facts are all source-writable (writability
   as a plan-search constraint — the writable-name set is computable from the decl text +
   signature); (b) BY-CONSTRUCTION: the engine controls split emission, so it can BIND the
   names itself — extend arm annotations/patterns until every reported hypothesis the plan
   may need is source-named. (b) removes the dimension entirely and is the direction
   consistent with "productive by construction".
4. **The greedy loop has no backtracking over accepted moves.** One accepted junk move
   can still poison a path (it merely certifies; acceptance ≠ progress toward THE proof).
   D11+D12 removed the measured poison sources, but the architecture-level cure is again
   №2: plans are complete objects, accepted whole.
5. **Synth's fact domain excludes CTYPE-typed hypotheses.** `pushFact` requires a boxed
   type, so a hypothesis like `R1 : TRel [g ⊢ M'] [h ⊢ R]` is invisible to backward
   chaining — the closing composite `ExWk/c [h ⊢ app R R5] (TRel-app R1 R6)` cannot be
   planned even when every piece is in scope (measured at exTRel's final hole; the same
   frontier as the reassoc combos and the two-schema 0/5). The principled extension:
   admit ctype facts with `viaComp`-style spelling discipline (usable as rule args and
   tails, never inside LF terms) and admit ctype constructors as rules uniformly (mkRule
   already normalizes their indices). This is the highest-yield named gap for the
   existence-package (`ExPlus`/`ExEval`/`*_total`) and cross-schema transport classes.
6. **Unicode identifiers are an unhandled SYNTAX DIMENSION.** Engine identifier regexes
   are `[A-Za-z_]`-classed throughout, so Greek-named binders (`φ`, `ψ`, `$σ` — 20/148 of
   the no-totality residue alone, plus an unmeasured share of every other ledger class)
   stall the intro generator at step 0. The fix is ONE shared identifier class (JS
   `\p{L}` with the `u` flag) substituted mechanically across the prover modules, plus a
   coverage-matrix row with Greek-named invented shapes — per the session-6 lesson that
   instruments must exercise every syntax dimension. Do not fix it regex-by-regex on
   demand; that path guarantees silent partial coverage.
