# The Harpoon prover — experimental log (archived)

> **Archived.** This is **not** the source of truth for the shipped engine.
> Shipped Orca: [`../../ORCA.md`](../../ORCA.md). Resume only from [`README.md`](README.md).
> The bar, if you resume: [`ORCA-MANDATE.md`](ORCA-MANDATE.md).
>
> What follows is the 77-entry experimental log of a programme that was **shelved**
> on 2026-08-29. It never entered `proveProgram`. Keep it so a successor does not
> rebuild a refuted mechanism.



> ⛔⛔⛔ **THE BAR IS PINNED IN `ORCA-MANDATE.md` — READ IT FIRST.**
> Logic is FINITE but INFINITELY EXPRESSIVE; a proof search over it must be too. A finite
> set of first-principle rules must COMPOSE to solve unboundedly many holes. A mechanism
> that adds a rule per SHAPE is architecturally wrong however it measures, and **~1% per
> build is not an option**. Every rethink starts at that document.

> ⛔⛔ **2026-08-20 — THE TERM-PRODUCTION DIAGNOSIS IS FALSIFIED.** Entries 57 and 58 built
> a contextual-type unifier and a recursive inhabiter (the "one unified core"). Both measure
> **0 gains / 45** on a residue-wide sample with their component contracts verified ACTIVE
> (33.9% of argument slots sharpened; 1128 constructed candidates). **Producing the right term
> at a hole is not the bottleneck**, so entries 40–56's whole ROI story is exhausted at the
> residue. The current direction document is **`orca-research-brief-v4.md`** — read
> **`orca-research-brief-v3.md` §2–§3** first for domain context, then v4 before opening
> any new slice.

## 0. The spirit of this work — read this twice

**You are not here to push levers. You are here to change the shape of the search.**

The engine today is a *greedy forward move-generator with a per-candidate certifier*: at
each hole it enumerates candidate moves from our type/schema model, certifies each one by
round-tripping to Beluga's checker, accepts the first that checks clean, and advances. This
architecture got us real proofs — 11/11 hard gates, a held-out corpus, `bigstep_det` closed
by the synthesis engine. But it has hit its ceiling, and the ceiling is *architectural*, not
a matter of one more guard, one more budget, one more worker, one more ordering tweak.

**The single most important sentence in this document:** every remaining failure mode —
the timeouts, the unbounded split nesting, the greedy-path poisoning — is a symptom of the
*same* root cause: **intelligence lives in the STEP dimension when it must live in the PLAN
dimension.** The cure is one idea, applied thoroughly: **focused, plan-driven proof search.**
Move the search out of "generate a step, certify it, commit, repeat" and into "build a whole
proof plan by backward chaining, demand splits only when a plan is blocked, and certify
plans whole." This is not my invention; it is the focusing discipline (Andreoli), adapted to
Beluga's contextual LF, and the docs have named it the north star for a while. Your job is to
*finally build it* — and to refuse every seductive shortcut that treats a symptom instead.

**The litmus test for every change you make** (steal it from the IDE team, it is exactly
right): *"Does this make the search a decision procedure by CONSTRUCTION, or does it just
make the greedy loop stumble into one more proof?"* Only the former is the real answer. If
you catch yourself adding a per-failure-class budget, a name-keyed ordering, a "try this
heuristic for cases that look like X" — **stop.** You have reproduced the problem one level
down. The user's standing law: *fill gaps, don't reduce them; a gap's fix is a principled
mechanism, never a budget tweak or more workers.* This has burned every session that ignored
it.

**Ingenuity, not levers. Say it back to yourself before every change.** The whole reason
this problem is worth a god-doc is that it *rewards smarts*: the right abstraction (the plan,
the focus, the saturation database, the junk-free quotient) collapses an intractable search
into a decidable one. The wrong abstraction (more knobs) buys a percentage point and a new
timeout class. We have watched both happen. Choose the first every single time.



## §0.5 THE 2026-07-19 REFOCUS — read this BEFORE the phases; it scopes everything below

**The verdict that forced this section:** multi-day passes of principled, differential-gated
search-control work (P13–P17, ⊥-elim/unlock probes, budgets, orderings) produced **+7/823**.
The user's judgment — catastrophic ROI — was correct. The per-target
measure→localize→fix loop yields +1s BY CONSTRUCTION; class-sized deltas need class-sized
mechanisms chosen by residue mass. This is now a standing law
(memory: `feedback-optimize-mass-not-tail`).

### The class map (the audit that falsified the "wall")

`node scripts/prover-residue-audit.mjs` — classifies every failed target by its
REFERENCE PROOF (present in the corpus; pure text, seconds, no oracle). Result on the
2026-07-19 ledger, deduped:

| Residue class | ≤3 ln (direct term) | ≤8 ln | 9–25 ln | >25 ln | fun/copattern |
|---|---|---|---|---|---|
| no-move (378) | **34** | **145** | 125 | 36 | 37 |
| no-totality (108) | 15 | 24 | 45 | 22 | 2 |
| TIMEOUT (88) | 7 | 7 | 42 | 31 | — |

**The falsification:** the long-standing story "the no-move mass is the lemma-depth/cut
wall" is DEAD. 179 no-moves have reference proofs of ≤8 lines — typically ONE case, ONE
let, 2–4 calls to lemmas ALREADY IN THE POOL (`red_var` is literally
`mlam g, #p ⇒ cr3 [_] [⊢_] [_⊢_] (SVar [g ⊢ #p])`). Every corpus target's ingredients
exist by construction (masking removes one body; siblings remain) — corpus "no-move" is
never literally "needs an invention"; it is the engine failing to COMPOSE. §3's cut
theory remains true AS THEORY; its empirical address is the LARGE tails (~90 targets),
not the mass. A second finding: 39 "no-move"/"no-totality" targets have fun/copattern
reference proofs — misclassified out-of-fragment cases (an honest-verdict classifier
gap, cheap to fix).

### The laws (hardened; they override any contrary habit in the sections below)

1. **Mass first.** A slice targets the LARGEST tractable class, with a NUMERIC STAKE
   declared before work starts ("this mechanism must move ≥⅓ of its bench reps, else it
   is abandoned, not polished").
2. **The inner loop is the STRATIFIED BENCH** — 1–2 representatives per audit bucket,
   run natively, minutes end-to-end. Build/refresh it before the mechanism.
3. **Sweeps and full differentials are SLICE-END instruments only** — the differential
   once when a slice ships; a browser sweep only to re-baseline the ledger after shipped
   slices. Never as decision inputs.
4. **Residue questions are answered by TEXT first** (the reference proofs are in the
   corpus — the audit script), oracle probes second, sweeps last.
5. **A per-target hunt is legitimate ONLY while finishing a class mechanism** — never as
   an expedition of its own. If a trace-dive isn't attached to a slice with a stake,
   stop.
6. **Report deltas flat and per unit of work.** A micro-fix is not a milestone; "the
   named hunt resolved"-style narration is banned.

### The slice queue (supersedes §12's ordering)

- **S1 — ctype-lemma COMPOSITION (the 179 TINY+SMALL no-moves) — ATTEMPTED
  2026-07-19, HONEST RESULT BELOW.** The dominant shapes,
  visible in the samples: ctype-valued lemmas (`Red`/`SN`, the logrel and
  poplmark-reloaded families), inferred `[_]`/`[⊢_]` Pi arguments, substitution
  arguments, ctor-of-lemma nesting, small harmony/church-rosser combos. The defect is in
  GENERATION SPELLING + SYNTH COMPOSITION — not search control. Stake: ≥⅓ of bench reps.

  **RESULT (2026-07-19): stake MISSED. Honest yield 3/179 (1.7%) on the full
  native class run** (`eq3`, `saeq`, `trans'` — three different files/developments,
  so the mechanism is general, not one-target-lucky; NOT overfit — no name literals,
  passes `test-prover-no-overfit`). **Five general, verified, SAFE-TO-KEEP mechanisms
  shipped** (197/197 suite, zero regressions on the differential — see below), but
  the "179 TINY+SMALL no-moves" bucket was never one mechanism; the line-count
  classifier bundled at least THREE structurally distinct defects and only one was
  fixed:
  1. **CTYPE-COMPOSITION (fixed, M1–M4 below).** A theorem whose goal/premises are
     ctype applications (`Aeq`, `TRel`, `Map`, `Pair9`-shaped) composes sibling
     lemmas via `let x = lemma a b in otherLemma x` — this is what landed.
  2. **SPLIT-ON-CTYPE-HYPOTHESIS (untouched, next candidate).** `splitTextForBox`'s
     very first line is `decomposeContextual(boxedType)`, which returns null for a
     bare ctype application — so `case X of …` is NEVER OFFERED when X's type is
     ctype-headed (`Deq […]…`, `TRel […]…`). Traced directly on `ceq`/`exCRel`
     (both need this) — this is the SPLIT half of the class the audit lumped in
     with composition, and by the bench sample looks comparably or more populous.
     It requires a genuinely new emission path in `hole-split.mjs` (arm
     patterns without LF-box wrapping, ctor-arg handling for ctype constructors)
     — NOT a small fix; scope it properly before starting.
  3. **UNRELATED SMALL-PROOF DEFECTS (untouched, un-triaged).** `append_nil`,
     `ceval_complete` (pure LF, not ctype at all), `extend` (a MIXED ctype+LF
     constructor argument — `M_dot (weaken sigma) [h,x:target _ |- x]` — whose ctor
     path deliberately never boxes ANY argument; the fix needs per-argument
     kind-awareness in the CTOR-application branch, mirrored from M3's REC/LEMMA
     fix but not yet built), `osim_refl` (a Pi/substitution-binder ctor argument —
     HO territory). Each is its own small investigation; none share a mechanism.

  **The mechanisms that landed (M1–M4 + two ctor-scanner fixes), each general and
  pinned by the 3/179 spread + zero regressions:**
  - **M1 (ctype GOAL admission):** `synthMoves` required `decomposeContextual(hole.goal)`
    to succeed — null for any bare ctype goal (`OSim […]…`, `Map […]…`), so synth
    NEVER RAN for the goal shape this whole class needs. Added an `isCtypeApplication`
    fallback (`ctypeGoal` flag threaded through); the tail-emission and Pi-context
    spelling (`[_]`, never `[]`) branch on it.
  - **M1b (ctype PREMISE counts as a premise):** `synthMoves`'s box-only gate
    (`premises.filter(p => p.kind==='box')`) zeroed generation for any theorem whose
    ONLY premise is ctype (`Map [h] [g] -> …`) — now counts `ctype` premises too.
  - **M2 (no-totality ⇏ no-synth):** the blanket `!thm.totality` early return blocked
    EVERY straight-line, non-self-recursive composition lemma (`saeq`'s
    `atrans_s (aeq_wk ae tr1 tr2)` — no `/ total /` because it never recurses). Relaxed
    to: block only when a BOX-kind premise exists without totality (the genuine unsound-
    recursion risk; `decreasingBoxIndex` defaults an untotalied box premise to index 0
    rather than -1, so IH construction there is still refused as before).
  - **M2b (ctype-result rules un-gated from backward chaining):** `solve()`'s rule loop
    had `if (rule.ctypeResult) continue` — a CTYPE-CONCLUDED lemma (`aeq_wk : … -> Aeq'
    […]…`) could never be chained BACKWARD as a step toward proving a subgoal, only used
    for forward saturation. This was the SINGLE largest block on the composition shape:
    without it, `atrans_s`'s premise `Aeq' (M) (N)` has no way to reach `aeq_wk`. Un-gated;
    soundness/spelling now carried by M3.
  - **M3/M4 (box-vs-bare, the correctness half of M2b):** un-gating M2b alone produced
    ILL-TYPED output — `applyRule`'s arg-assembly boxed every resolved premise slot
    uniformly (`box(r.text)`), and its let-binding boxed every rule's OWN result
    uniformly too (`let [Γ⊢r] = …`). A ctype value is a COMP-level expression and must
    never be boxed. Added a parallel `rule.premiseCtype[]` array (threaded from `mkRule`)
    and made both the arg-embedding and the let-binding conditional on it — `let S1 =
    aeq_wk X X1 X2 in atrans_s S1`, correctly bare throughout.
  - **Ctor-scanner comment-awareness:** `ctypeCtorArms` (the `inductive Name : … = |
    Ctor : type ...` block walker) had NO comment stripping — a `%`-comment trailing a
    `|`-arm line (`| Ae_v' : % {#p:…}`) corrupted the type text, and its fragile
    leading-token continuation heuristic (`->`/`|`/non-letter ⇒ continue, else break`)
    silently DROPPED any arm whose type spills onto a bare-identifier-led continuation
    line — emptying `enumerateConstructorsTyped` for that WHOLE family (measured: `Aeq'`
    lost all 3 constructors). Fixed both: `stripLfCommentsForCtors` (the same discipline
    as P16) + a join-until-next-`|`-or-terminator continuation rule.
  - **Ctor-scanner BLOCK-EXTENT bound (a self-inflicted regression, caught by
    `npm test` before it shipped):** the simpler continuation rule above initially had
    no proper block boundary — `enumerateCTypeConstructorsText` slices `body` from the
    block's `= ` to EOF (not to the block's own end), and the ORIGINAL fragile heuristic
    had ACCIDENTALLY served as an implicit "stop at the next declaration" guard. Once
    real PROOF BODIES (not just signatures) shared the scanned source, the permissive
    rule ran on past the block's own `;` (routinely glued to the last constructor's own
    line, e.g. `… Pair9 [⊢A] [⊢B];`) and swallowed an unrelated case-split's `|`-arm as a
    bogus extra constructor (`test-prover-coverage-matrix` caught this — a real, ctype-
    typed regression, root-caused and fixed same session, not shipped). Fixed with a
    proper bracket/paren-DEPTH-0 terminator scan (`blockExtent`) bounding `body` before
    any line-based arm-walking — also incidentally fixed a pre-existing, independent bug
    (a trailing `;` glued onto a constructor's LAST result index, e.g. `"[⊢B];"`,
    present even in the old code but never triggered because the old heuristic broke on
    something else first).

  **Verification:** 197/197 suite. Full corpus differential (`--ref library.jsonl`):
  **198/199 — 3 gains (`eq3`, `saeq`, `trans'`), 1 LOSS (`tps`, ch3+arith:
  COMPLETE[292 checks] → STUCK step-bound[999 checks, 51 accepts/29 backtracks —
  the step budget consumed entirely by chronological-backtrack churn]).** Net +2.
  Bisected (not hand-waved): the ch3+arith assembly has ZERO `inductive`/`ctype`
  declarations anywhere in its 7 assembled files, so none of M1/M1b/M2b/M3/M4/the
  ctor-scanner fixes can activate on this target's search AT ALL; a live toggle
  disabling the flex head-strip (the one universally-applied change) reproduced
  the IDENTICAL failure (999 checks, same accept/backtrack split) — ruled out.
  Reproduced twice, byte-identical — not flaky. `tps` is a NAMED, pre-existing
  §6.2 №4 accepted-move-path-sensitivity target (the master plan's own ledger
  history flags this exact class); the mechanism is architecture-level (greedy
  search has no memory of "this path was fine last time"), not a bug this slice
  introduced that can be pointed at and patched — per the law, NOT chased with an
  ordering tweak. Reported as a real, acknowledged cost, not hidden.

### S1b — split-on-ctype-hypothesis, ATTEMPTED 2026-07-19, REVERTED (net negative)

Scoped honestly first (not guessed): text-only scan of the S1 no-move residue for
reference proofs that `case` on a hypothesis whose DECLARED premise type is a bare
ctype application (not LF-boxed) found **69 targets** — comparable in size to
composition's real yield, confirming the sub-mechanism split was real, not a guess.

**Built:** `splitTextForCtype` (prover-orchestrator.mjs, exported) — detects a ctype-
headed scrutinee, enumerates its constructors (reusing the already-fixed comment/
depth-bound-safe scanner), skips any ctor with a Pi-prefixed arg (`{h:taCtx} …` —
dependent/HO, fail-open, matching F.8's precedent), and reuses the EXISTING
`constructorTerm` UNBOXED — which turned out to already fall through to a bare
`fresh()` name for any argument it doesn't recognize as HO/hyp-block/dependent,
exactly the correct spelling for a ctype-typed constructor argument. Verified
directly against Beluga: the emitted split for `exCRel`'s `TRel` scrutinee
(`case X of | TRvar X1 => ? | TRapp X2 X3 => ? | TRlam X4 => ?`) is
CHECKER-ACCEPTED — the core idea is sound.

**What it does NOT do (found by tracing, not guessed):** the arm continuation goal
after a real split is a REFINED-CONTEXT ctype application (`Crel [_,x:term]
[_,b:block(…)]`) that the fact/fill/recurse generators — built entirely around
LF-boxed scrutinees — do not know how to work with; every candidate at that hole
was rejected. Making the split PRODUCTIVE (not just sound) needs a second layer:
context-refinement tracking for a ctype family's own implicit params, refined per
arm — genuinely separate, unbuilt work.

**A REGRESSION was found and REVERTED, not shipped:** enabling the split exposed
that its natural re-split guard (`caseScrutSet`, keyed off `branchPatternBox`,
which requires a `[…]`-bracketed arm line) is BLIND to a bare ctype arm — so the
engine re-split its own already-destructured scrutinee every round. The obvious
fix (drop the `branchPatternBox` pre-gate, key `caseScrutSet` off `openCasesAt`
directly) caused **23 corpus regressions** on the differential — `openCasesAt`'s
prefix-wide paren-depth scan and `branchPatternBox`'s narrower arm-line check are
NOT equivalent, and removing the gate let `openCasesAt` over-match on ordinary
LF-boxed proofs, wrongly blocking legitimate re-splits (`tps`, the whole tapl
ch3/ch3+arith `sound`/`complete`/`mstep_*` family, lincx, logrel — none of them
anywhere near a ctype family). Caught by the differential before being reported as
done; reverted; suite back to 197/197, differential back to the S1 baseline.

**Full 12-rep bench, with or without the guard fix: 1/12 — ZERO measured
completions gained.** Net expected value of activating S1b as built: negative
(real search-cost increase — `append_nil` flipped no-move→search-bound, several
targets' check counts rose 3–10× — for zero verified benefit). **DISABLED at the
call site** (`if (false && …)`, `splitTextForCtype` kept defined+exported+tested
as scaffolding, not deleted).

**Next decision (checked in with the user before proceeding further, per the
mass-not-tail law):** this sub-mechanism needs BOTH (1) a reconciled closure
semantics between `openCasesAt` and `branchPatternBox` (audit every one of
`branchPatternBox`'s 13 call sites before touching its bracket-only assumption —
do not repeat the caseScrutSet shortcut) and (2) refined-context fact generation
for ctype-family arms, before it is worth re-attempting. Scope BOTH before
starting, with their own stake — this is now known to be a two-layer feature, not
a targeted fix, confirmed by direct measurement rather than estimation.

### Slice 1 (grind-inspired substrate rewrite) — ctype constructor extraction, tree not text (2026-07-20/21)

Root cause behind the whole S1/S1b bug pattern: ctype constructor data was read
by a hand-rolled regex scanner (`enumerateCTypeConstructorsText`/`ctypeCtorArms`/
`stripLfCommentsForCtors`/`blockExtent`) duplicating a Lezer grammar
(`beluga.grammar`) that ALREADY parses `InductiveDeclaration`/`CompConstructor`/
`CompType` structurally. Replaced the regex path with a tree-walk twin of the
existing LF-side pattern (`compArrowSpineTree`, mirroring `lfArrowSpineTyped`),
wired into `enumerateConstructorsTyped` (`hole-split.mjs`), then deleted the
retired text-scanning functions outright — not left in parallel.

**Verification (exhaustive, text-only, before touching the call site):** every
`inductive`/`stratified` family referenced anywhere in `library/` (231 families
across all assembled corpus programs) — tree-walk output vs regex output.
**195 identical, 36 differ.** All 36 hand-reviewed: every one is an old-path bug
(entire families returning EMPTY constructor lists — `Sem`, `Reduce`, `Log`,
`LogEq`, `Red`, `IsList`; block-boundary spillover into the next mutual-block
decl for `SN`/`Normal`; multiple Pi binders glommed into one string for
`Clos`/`CtxRel`/`IsExp`). Zero cases where the old path was right and the new
one wrong.

**Gates:** `npm test` 197/197. `node scripts/prover-differential.mjs --ref
results/corpus/library.jsonl` — 198/199, byte-identical to the pre-existing S1
baseline (the one loss, `tps`, is the already-bisected S1 step-bound cost,
unrelated to this slice). Zero new regressions.

**Corpus yield, measured, not estimated:** `node scripts/prover-bench.mjs
--class s1 --cap 179 --all` (full 179-member class, real Beluga-checker oracle)
against the frozen 2026-07-19 21:54 reference snapshot: **4/179 now COMPLETE
that were STUCK in the snapshot.** Of these, 3 (`eq3`, `saeq`, `trans'`) are the
already-recorded original-S1 hand-fix gains, not new. The 4th,
`weak-norm-total-mix-lf-inductive.bel#bwd_closed`, is new since the snapshot —
its theorem is stated directly over `Reduce`, one of the families this slice's
verification found returning an EMPTY constructor list under the old regex
path, so the mechanism is plausible and direct; not independently re-verified
by a toggle A/B since the old path no longer exists to toggle back to.

**Net measured completion gain directly attributable to this slice: 1.** The
slice's actual payoff is correctness and removed debt (36 confirmed bugs, 6
previously totally-blind families across logrel/popl12/poplmark-reloaded now
readable everywhere, not just the two spots patched by hand in S1), not a
composition-class unlock — the S1 residue class's remaining 175 no-moves are
still no-move. **Blocker LOCALIZED (2026-07-21, code not guessed):** those
no-moves need a `case` on a ctype hypothesis as an EARLY move (e.g. `exCRel`:
`case tr of TRvar => … | TRapp => … | TRlam => …`, TRel a bare ctype), and
ctype-hypothesis splitting is HARD-DISABLED at `prover-orchestrator.mjs:2653`
(`if (false && …)`, the S1b kill-switch). That — not box detection — is the
primary gate. Box-vs-ctype `ContextualType`-node detection is subordinate
hygiene the split-productivity work consumes, NOT a standalone composition-class
unlock (an earlier draft of this entry inverted that; corrected). The real
mechanism for this class is the two-layer ctype-split-productivity feature the
S1b postmortem already scoped: (a) reconciled `openCasesAt`/`branchPatternBox`
re-split closure semantics, (b) refined-context fact generation for ctype arms.
Honest ceiling: the S1b scan found **69** case-on-ctype-then-compose targets —
the max this lever can address, realistic yield lower. Genuine multi-part build,
not a slice; needs its own stake before starting.

### THE CTYPE-SPLIT PRODUCTIVITY BUILD — staked and executed 2026-07-21

User-staked after Slice 1. Six mechanisms, each measure→localize→fix with a
single-target probe verifying it before the next; suite 197/197 after every one.
Class facts first: 69 s1b members, **50 carry `/ total /`** (the honest
IH-addressable set), 19 untotalied (recursion stays refused by law).

1. **Stage A — split enabled behind a ctype-ONLY re-split guard.**
   `prover-orchestrator.mjs` candidateMoves: `ctypeScrutsOpen()` (openCasesAt
   names, lazily memoized) gates ONLY the ctype-split emission; the LF path's
   `splitDone`/`caseScrutSet` is byte-identical. openCasesAt's over-matching is
   safe here BY POSITION: a false positive suppresses a move type that didn't
   exist before. (The S1b disaster was merging it into the SHARED guard.)
2. **C1 — `decreasingArgIndex` (prover-comp-type.mjs).** Root cause of the class:
   `decreasingBoxIndex` filters `kind==='box'`, so a ctype-premise theorem got
   -1 → NO IH rule (bridge :904 gate) and NO decOk facts (`decSubderivNames`
   fnNames[-1]) — recursion on a ctype premise was structurally impossible.
   The new index counts box+ctype ARG premises in declaration order — the
   notion actually aligned with mkRule's `premises` array AND the source's
   fn-binder order. All-box theorems delegate to decreasingBoxIndex verbatim
   (compat by construction). Untotalied → -1 (the unverified-recursion law,
   mirrored from boxes). Consumers: synthMoves' decIdxThm + mkRule's decI
   ONLY; decreasingBoxIndex untouched at its other 7 sites.
3. **C2 — schema-Pi ctor split patterns.** `splitTextForCtype` no longer skips
   `{h:tctx}`-prefixed ctors (M_id/TRvar0 shapes → one-arm splits → coverage
   rejection): a SCHEMA-typed Pi arg spells as a fresh context box `[h1]` —
   checker-arbitrated spelling, verified directly (cc.bel `M_id [h] => ?`
   accepted; `M_id _` rejected). Non-schema Pi still skips (fail-open).
4. **C3 — ctype ctors as backward rules (prover-synth.mjs `ctypeCtorAsRule`).**
   Two sub-mechanisms, both gated on `c.isCType` (LF ctors byte-identical):
   whole-token context indices `[h]`/`[g]` (lowercase = invisible to the
   uppercase ctorFlex scan) become flex placeholders so `Map [h] []` can match
   a concrete goal; schema-Pi args become SPELLED argument slots via an
   `argPlan` (arg-order interleaving of pi-slots and premise-slots).
5. **C4 — `underscoreCtxArg`.** The θ-exact ctx spelling
   (`M_id [x : target (cross Y S)]`) hits D11 writability (implicit metas
   unbound in generated source — "free meta-variable is illegal"). The
   head+underscore form `M_id [x : target _]` is the corpus idiom and checks;
   bare `[x : _]` is ILLEGAL ("Holes may not appear as contextual LF types").
6. **C5 — the `[..]` bracket mangle.** `normalizeCtypeSpelling`'s conclusion
   group was `[^\]]+` — stops at the `]` INSIDE `$Id[..]`, producing junk
   `($Id[..)]` tokens that poison matchT (found on the idLogSub trace). Now
   one-level-nesting-tolerant; deeper nesting fails to match (unnormalized,
   never mangled). Same fix in bridge planNorm.

**MEASURED (native step-faithful oracle, frozen 2026-07-19 reference):**
- 12-rep bench: 1/12 (S1b revert) → **3/12**.
- Full 69-target class: **10/69 COMPLETE — 9 NEW this build** (`trans'` was
  S1's earlier gain): reduce_halts ×6 (Weak_Normalization + 5 logrel
  weak-norm* variants), cr1, logEqTrans (148 checks — a real IH composition
  chain), remove. 6 of 9 totalied (IH path), 3 untotalied (split + lemma
  composition, no recursion — consistent with the law).
- **Differential: 198/199 — byte-identical to baseline (the known tps
  step-bound loss only). Zero regressions across all six mechanisms.**
- Suite 197/197.

**Remaining walls, named with owners (NOT attempted — each needs its own
scoping):**
- **$-substitution flex** (~idLogSub/idLogEqSub/logEqSub* class, ≥8 members):
  rule `$($Id)` vs fact `$($Id1[..])` cannot unify — `$`-prefixed names are
  deliberately non-flex (capture risk, the flex-scan guard). Needs a
  capture-safe design in matchT/substTok, not an improvisation.
- **Untotalied recursion policy** (19 members, exCRel/det_eq/howe shapes):
  Beluga ACCEPTS untotalied recs (it just doesn't verify termination); the
  engine's law refuses to generate them. Policy decision for the user, not
  an engine bug. *(RESOLVED same day — see the continuation below.)*
- **Term-transforming arms** (extendEnv M_dot shape): the reference rewrites
  the argument body (`M[crst x]`) — invention, not composition; out of the
  analytic fragment by §3's own boundary.

### CONTINUATION, same day (2026-07-21): policy + C6–C8 — 12/69

Two USER DECISIONS taken mid-session (recorded in memory
`project_prover_sprint_contract.md`): (1) **goal = MAX CORPUS %** for the
coming weeks; (2) **author-faithful untotalied recursion ALLOWED** — when the
AUTHOR's decl omits `/ total /`, the engine may recurse. SAFETY LAW: Beluga
accepts circular junk untotalied (`fn x => f x` CHECKS), so the checker is NOT
the guard — the engine's decOk case-component gate stays mandatory
(`decreasingArgIndex`: untotalied ctype → arg 0, never emits a pragma).

Three more mechanisms, probe-verified:

7. **C6 — context variables are SCHEMATIC in the ctype planning domain.**
   The same gap at three sites: ctor rules (`Crel_xa`'s result `[g, x:term]`
   vs goal `[_, x : term]`), theorem rules (mkRule: IH result `Crel [l] [h]`
   vs `Crel [_] [h1]`), and instantiated premises (`[_]` vs fact `[g]`).
   Fixes: flexCtx rewrites (whole-token `[h]`→`[CTXV_h]`, composite head
   `[g, x:term]`→`[CTXV_g, x:term]`) in ctypeCtorAsRule AND mkRule (ctype
   premises/conclusions only); matchT ctx-token rules (`[_]` wildcard;
   `[FX]` binds inner; flex-head composite binds the leading segment when the
   tail agrees). θ-value convention: UNBRACKETED context text.
8. **C7 — comp facts resolve CTYPE ctor args.** The dfs law "a comp fact
   never resolves an LF ctor argument" is wrong for ctype ctors (their args
   ARE comp expressions — `Crel_xa X1`). premiseCtype-keyed exceptions at the
   two viaComp gates + the lfOnly recursion flag; LF ctors byte-identical.
9. **C8 — the root-alternative synth channel.** The synth was ONE-SHOT (first
   plan-valid chain), and C6's wider rule applicability let checker-REJECTED
   rule calls shadow checker-ACCEPTED fills — caught as a REAL 12-rep bench
   regression (`remove` COMPLETE→STUCK: `append X X` shadowed `Nil`).
   Root-cause: pre-C6 `remove` completed via the degenerate-but-well-typed
   `fn X => Nil`. Fix: after a solved primary, re-solve the ROOT with its
   rules loop suppressed (rules stay available in premise recursion, so
   compositions like `Crel_xa (exCRel X2)` survive), up to two levels deeper
   (a direct IH solves at d=1; its ctor-composed form needs d=2); result
   rides the existing alts channel; suppressed-pass failures never enter
   failMemo. This is a first, bounded instance of intra-synth alternation —
   the checker arbitrates the candidate list.

**MEASURED (final, all gates on the same code):**
- 12-rep bench: 3/12 (C5) → regression to 2/12 (C6, caught) → **4/12**
  (exCRel + remove-recovered).
- Full 69-target class: **12/69** — exCRel and trelImpliesTdCxt new vs the
  C5 checkpoint (both UNTOTALIED context-relation lemmas: policy + C6 + C8
  together). exCRel's proof: ctype split, `Crel_xa X1`, rejected direct IH,
  accepted composed `let S2 = exCRel X2 in …`, nested split — the original
  S1b poster target, checker-certified end to end.
- **Differential: 198/199 (the known tps loss only). Suite 197/197.**
- Day total (Slice 1 + ctype build): **+12 measured native completions** on
  previously-STUCK targets, zero regressions shipped.

**Next stake candidates (per the sprint contract, mass order — pick ONE with
a numeric stake before starting):** S2 no-totality audit (108 members, never
audited, audit itself is cheap); S3 TIMEOUT class (88, E.10 design exists);
$-subst flex (≥8, design needed). Remaining s1b no-moves (det_eq, ev_value,
env_ext, idLogSub…) fold into these.

### S2 — the no-totality class, staked and executed 2026-07-21/22

**Audit first (comment-aware — invariant 18 bit the audit itself: the first
run bucketed 42 targets as HAS-PRAGMA whose pragmas were `%`-commented out):
ALL 112 ledger members are NO-PRAGMA (98 single-decl + 14 mutual).** One
mechanism class: the author omitted (or deliberately commented out) totality;
the engine refused recursion. Mechanism = the box-premise half of the
author-faithful policy. Stake: expectation 10–25 (s1b's ~17% conversion);
kill ≤1 on the 12-rep bench.

**Mechanism:** the synthMoves bail (`hasBoxPremise && !thm.totality → []`)
removed; `decreasingBoxIndex`'s untotalied default (premise 0) feeds the
decOk-gated IH; no pragma ever emitted. The pre-existing measure-synthesis
fork machinery is untouched (still runs on the no-totality verdict).

**Two containments, each forced by a REAL differential loss (the
whack-a-mole was measured, not imagined):**
1. v1 (raw unlock): bench 2/12 (appd, count) — but the differential flipped
   `sstu_helper4` COMPLETE→step-bound. Root cause: pre-policy these theorems
   had NO synthesis at all; the full sibling-lemma rule mass flooded holes
   that used to have lean move sets. Containment: IH-rule-ONLY for
   author-untotalied box theorems.
2. v2: sstu_helper4 recovered — and `ctx_eq_unr` flipped instead (fact/ctor
   chains at PRE-split holes were still new mass). Containment: for these
   theorems synthesis engages only at holes where a decOk fact EXISTS (post-
   split). Pre-split holes are byte-identical to pre-policy.

**Final gates (containment v2):** differential **198/199 — exact baseline**
(the known tps loss only; sstu_helper4 AND ctx_eq_unr both verified COMPLETE
by direct probe). Suite 197/197. 12-rep bench 2/12 (appd 36 checks, count 9
checks — both via the decOk-gated IH at post-split holes, as designed).
**Full-class result: 6/108** — appd, append, eq3 (test-crec-cover), sym_pconv
(175 checks, a real chain), count, ceq. **Below the 10–25 stake, above the
kill line — reported as such, no inflation.** The finding that matters: the
class converts at ~6%, not s1b's ~17% — "no-totality-measure" was a LABEL
hiding downstream no-move/timeout failures, which the policy now lets surface
honestly. The remaining 102 belong to the no-move/timeout mechanisms, not to
totality. CLASSIFIER NOTE (S4 debt): the stuck verdict for these still reads
`no-totality-measure` (totalityBlocked keys on `!thm.totality` alone), which
is now a misnomer — post-split holes DID get IH access. Fold into S4.

**Cost note (pre-existing, NOT this slice's):** `conf`-shaped members burn
~9,580 checks / ~690s inside the MEASURE-SYNTHESIS FORKS (a spliced pragma
makes the fork totalied, so containment correctly doesn't apply there; the
fork machinery predates the policy). That cost class is S3/E.10 territory —
fork-count caps or trigger-indexed instantiation, its own stake.

### S3 — the TIMEOUT class, AUDITED 2026-07-22 (measurement only, no code yet)

Full 88-member native run (browserless bench, `--class s3 --all`). Purpose:
separate browser-cap artifacts from real engine limits, and SIZE the cost
drivers. Result — **the class is a CHECK-COUNT problem, dominated by the
measure-synthesis forks:**

| verdict | n | total checks | avg | max |
|---|---|---|---|---|
| no-totality forks | 30 | **85,879 (66%)** | 2,862 | 15,557 |
| step-bound | 35 | 42,306 (33%) | 1,208 | 4,081 |
| no-move | 8 | 1,301 (1%) | 162 | 437 |

15/88 complete NATIVELY (browser-cap artifacts confirmed) — BUT per the
2026-07-22 "quick+reliable+elegant" law ([[prover-sprint-contract]]) these are
NOT banked wins: only ~3 are genuinely browser-viable (`symG` 43ck, `sym`
52ck, `eq6` 107ck); the rest are DEFERRED DEFECTS (`is_unr_mer` 6,442ck,
`helper1_2b` 4,117ck, `is_unr_join_comm` 1,816ck — completions bought with
30-minute searches). Recorded here with cost so they are picked up, not
discarded.

**Two false trails ruled out by thinking, not editing:**
1. "Skip redundant forks" — WRONG. Post-S2-policy the plain untotalied search
   has synth-IH but the `/ total 1 /` fork ADDITIONALLY engages recurseTexts
   (the box-recursion generator the plain path deliberately still refuses), so
   the fork is NOT redundant; skipping it loses yield.
2. Fork-count caps — trade the reliability the sprint contract prioritizes.
   Rejected on principle, not tried.

**THE MECHANISM (named, not yet staked as a build): E.10 trigger-indexed
instantiation.** Saturation (lemma × fact enumeration under bounded DFS) is the
per-search check driver, and it runs inside EVERY fork — so it multiplies
through the 5× fork structure into the 85,879-check mass. E.10's success metric
is redefined per the sprint contract: NOT new completions but CHECK-COUNT
REDUCTION on already-completing proofs (`is_unr_mer`: 6,442 → target hundreds).
This is a genuine research-grade build (demand-driven E-matching replacing
generate-and-test), scoped as its own multi-step effort, NOT a one-session
slice. Smallest safe increment + a check-count metric to be staked before any
edit.

**DEFERRED to the plan tail WITH cost (not discarded):** the 3 severe-defect
completions and the >2000-check members (16 of 88). They are provable TODAY;
they are slow.

### E.10 PREMISE FALSIFIED ON CONTACT (2026-07-22) — measure before building

Before staking E.10 as a build, instrumented the actual check budget of two
S3 cost profiles (probe-checkbudget: buckets oracle checks by fork, then by
move KIND via the verdict pulse). **The master-plan assumption "saturation is
the biggest check-count driver" is FALSE on contact:**

| target (verdict) | fill | lemma | split | synth/saturation |
|---|---|---|---|---|
| `ca` (no-totality) | **82%** | — | 12% | ~0% |
| `trans` (step-bound) | **49%** | **37%** | 4% | **1%** |

And the fork split for `ca`: **71% of checks are the PLAIN search**, only 29%
the measure-forks — so the fork multiplier is NOT the mass either. The
check-count driver is **`fill` (direct goal-inhabitation) + `lemma` (helper
application) CANDIDATE BREADTH** — hundreds of candidates submitted to the
checker one at a time per search. Tell: 244 fill candidates in BOTH targets,
identical — `fillCandidates` (hole-split.mjs:1789) emits a large set that
survives its `rigidConflict` head-pruner and reaches the oracle.

**E.10 is therefore MISAIMED for S3 and is NOT being built now** — it would
optimize a ~1% bucket. It is NOT discarded: it remains the right mechanism IF
saturation ever becomes a measured driver (it may, on a saturation-heavy
class), and the MAX_PRODUCTS blowup note stands. Parked at the tail with this
falsification recorded, per the defer≠discard law.

**PRUNABILITY MEASURED (2026-07-22) — the pruner is VIABLE and the mechanism
is well-scoped (NOT a research build):** instrumented fill/lemma candidates
that reach the checker, by accept/reject + reject-reason category:

| target · kind | →checker | reject% | CHEAPLY prefilterable | needs kernel |
|---|---|---|---|---|
| `ca` fill | 353 | 100% | ~52% (kind/sort 51 + writ 1) | 43% (ill-typed idx) |
| `trans` fill | 244 | 99% | ~96% (kind/sort 83 + writ 13) | 3% |
| `trans` lemma | 184 | 100% | 100% (kind/sort 50 + scope 50) | 0% |

Dominant reject = **KIND/SORT mismatch** ("Expected an LF term-level
constant"). Concrete shapes (dumped): constructor-application fills applying an
LF constructor to (a) a CONTEXT VARIABLE in a term slot (`ae_a X3 g` — `g` is a
ctx var, provably sort-wrong, our model knows this) or (b) FRESH INVENTED names
not in the hole's scope (`ae_a X3 X3`). Both are model-detectable with
CERTAINTY — the Level-2 pre-filter. Accepted candidates (3 in `trans`) are
sort-correct by definition, so a correct filter passes them.

**THE STAKE — sort/scope pre-filter on fill+lemma candidates, before the
oracle call.** Expected: eliminate 50–100% of the reject volume in these
buckets → large check-count drop; some browser-TIMEOUT-but-native-complete
targets fall under the 60s cap (real corpus %). Metric: check-count on
representative targets. Constraint: ZERO yield loss (only rejects what the
checker rejects). Kill: any differential regression, or any bench completion
lost. Smallest increment first (the highest-certainty category), gated on the
full differential before widening. This is surgical search-critical code (the
S1b-risk zone) — build conservative, gate hard.

### RESULT (2026-07-22): the cheap pre-filter is a NEAR-NULL win — S3 is checker-bound

Built the sound pre-filter (movePrefilterOk): (a) a CONTEXT VARIABLE in a
first-order LF term slot → reject (unambiguously sound); (b) a `trustScope`
move-loop-only check rejecting an UPPERCASE arg absent from the REAL hole's
meta AND ctx AND not a declared ctor (unbound). Suite 198/198 (both contract
directions pinned in test-prover-prefilter, incl. the synthetic-hole PASS the
scope check must not violate). **Differential 198/199 — exact baseline, ZERO
regressions: the pre-filter is corpus-wide sound.**

**But the measured yield is ~null (trans 544→540, ca 945→945), and the reason
is the decisive S3 finding:** an intermediate meta-only version cut trans to
343 — then adding the (correct) hole.ctx scope check put it back to 540,
proving those `ae_a X3 X3` candidates are NOT unbound — `X3` is an IN-SCOPE
comp variable. The checker rejects them for being the WRONG TYPE for the slot,
not for being unbound/wrong-sort. **The 82–86% fill/lemma reject mass is
type/index mismatches on in-scope names — it genuinely needs the kernel (or
full type-inference in our model, a large build), not a cheap structural
pre-filter.** The meta-only 343 was an UNSOUND prune (would drop valid
in-ctx names); the differential-sound version catches only the true
context-var / unbound sliver.

**S3 VERDICT — DEFERRED as genuine tail, not mass-with-a-lever
([[prover-sprint-contract]] defer≠discard):** its check-count problem has no
cheap fix. The real levers are both large builds: (1) model-side LF
type-inference to pre-reject wrong-type fills without the kernel; (2) E.10-style
work IF a saturation-heavy class ever makes saturation the driver. Both parked
here with this analysis. The sound pre-filter is KEPT (zero-risk hardening,
~null yield honestly). Next effort goes to cheaper mass: S4 classifier honesty
or a fresh native ledger re-baseline.

### S-logrel — depth-2 term synthesis (fill-site), staked + executed 2026-07-22

**Mass first (cheap text audit, `prover-residue-audit.mjs` by development):** the
`logrel` development is the single largest no-move residue — **114 of 340
in-fragment no-moves**, concentrated in one development of near-duplicate file
variants (algeq-simplified ×2, weak-norm* ×9), so shapes replicate. ~37 are
walled on the separate `$`-subst flex problem; the rest split ~DIRECT (21,
no-case composition/inhabitation) / BOXSPLIT (30) / CTYPESPLIT+DotNil (13).

**The gap (native-oracle traces, not guessed):** across `halts_step`, `mstep_app`,
`weakNorm`, `haltsMstep` the engine **inverts premises cleanly but cannot
re-SYNTHESISE a nested constructor witness** — `Halts/c (Onestep s ms') v` after
`let Halts/c ms' v = h`. `fillCandidates`' constructor-arg filling was explicitly
ONE LEVEL (hole-split.mjs comment); nested witnesses were reachable only via
the STEP dimension (let-chaining), which the greedy loop was not finding. This is
§4/§0's own diagnosis: intelligence stuck in STEP, must live in the TERM
structure.

**Built — `nestedCtorArgFills` (hole-split.mjs).** In argFillChoices, fill a
CTYPE-family argument by applying ONE constructor of that family to in-scope
hypotheses, **only when EVERY constructor argument is inhabited by an in-scope hyp
of its family** (the strong limiter — fires exactly at a rebuild point, never as
generic search breadth); appended AFTER the bare choices (existing candidate order
unchanged), tight cap (≤6), boxed-LF/Pi ctor args skipped, uppercase-head+unboxed
guard confines it to ctype-conclusion inhabitation (LF paths untouched). En route
fixed a real latent misparse: `conclusionOf`/`headOfConclusion` grab the tail
after the last turnstile for a ctype-with-boxed-index application
(`Step [⊢M] [⊢M']` → `M]`) — used `parseAppType().head` instead (the underlying
functions are still wrong for that shape elsewhere — **noted debt**).

**MEASURED (native step-faithful oracle):**
- Stake was ≥3 conversions on the 20-target DIRECT-non-subst logrel bench. **HONEST
  RESULT: +1** — `halts_step` (weak-norm-total-mix-lf-inductive) no-move[123ck] →
  **COMPLETE[38 checks, 3 steps]**, a fast/reliable proof. 18/20 targets
  byte-identical (zero-change-when-idle confirmed); `haltsStep` moved
  timeout→search-bound (no completion). **Below the stake.**
- **Why the miss (measured, not excused):** the fill-site is the SMALLER half of
  the logrel DIRECT mass. The fatter half is the SYNTH-site nested-LEMMA
  composition (`weakNorm ×8` = `cr1 (eval [] [⊢M] Nil)`, `completeness ×2`,
  `bwd_closed ×3`) — the engine over-splits `M`/premises instead of composing two
  library lemmas. That is a distinct mechanism (depth-2 backward-chaining at the
  RULE-application arg site, prover-synth.mjs) AND is entangled with over-splitting
  (plan-discipline), NOT addressed here.
- **Gates:** suite **198/198**; differential **198/199 — exact baseline** (only the
  known `tapl/ch3+arith#tps` step-bound path-sensitivity loss; confirmed by
  identity, zero regressions across the full ref-COMPLETE set).

**Verdict: KEPT.** Correct, general (no name literals — not overfit),
quick (38ck), zero-regression, zero-change-when-idle; the right abstraction (term
construction), reused by the next lever. Not banked as a class unlock — it is +1
with the mass now correctly localised.

**CORPUS-WIDE YIELD CONFIRMED +1 (not just logrel-local).** The mechanism is
general; measured its true reach by native-running every corpus no-move/step-bound
target whose reference has the ctype invert-REBUILD signature (`Ctor (Ctor …)`,
no `$`-subst — 7 corpus-wide). All 6 non-`halts_step` candidates (cpp13 `reify`×2,
equal `exTRelV`/`exTRelV'`, logrel `main`/`idRedSub`) STILL bail at **step 0**
(2–14 checks, zero moves) — BEFORE any fill point — so the rebuild synthesis
cannot engage. +1 is the honest, complete corpus accounting.

**THE LOGREL REMAINDER IS FRONTIER-DOMINATED (measured 2026-07-22, the mass-not-tail
lesson reconfirmed).** Line count made 114 look like known-mechanism mass; native
traces show ~1 clean win and the rest gated behind FRONTIER blockers, in three
families:
1. **Context/schema induction** (`case [g] of | [] => … | [g', x:A] => …`) — the
   step-0-bail class (`idRedSub`, `reify`, `exTRelV`, and many logrel no-moves): the
   engine offers NO context-split move, so it bails before any progress.
   **ROOT CAUSE CONFIRMED at code level (2026-07-22):** `candidateMoves`
   (prover-orchestrator.mjs) only fills, recurses, and splits/inverts COMP-context
   hypotheses (`hole.ctx`); it NEVER splits a CONTEXT VARIABLE (`hole.meta` of type
   `ctx`). Context-structural induction is a genuinely MISSING MOVE TYPE, not a search
   gap. **Substrate to build it EXISTS:** `schemaInfo(code, schema)` already returns
   the schema's elements (the `[g', x:A]` cons arm[s]) and `buildSplitSkeleton` builds
   arm skeletons — so the move is: for the leading `{g:ctx/sctx}` (when the theorem's
   `/ total g /` measures the context), emit `case [g] of | [ ] => ? | <one cons arm
   per schema element> => ?`, refining the continuation context per arm
   (`g:=[]` / `g:=g', x:elem`, IH available on `g'`). Scope ≈ the ctype-split build
   (C1–C8): detect-when + arm-generation + refined-context writability. This is
   ANALYTIC (structural induction on a schema — decidable, Tier 1), NOT the cut —
   the leading candidate for the next real slice ONCE the re-baseline sizes its true
   post-ctype-build population. Still often compounded with `$`-subst (the harder half).
   **STALE-ledger sizing + feasibility (2026-07-22):** 18 explicit `case [g] of …[]`
   no-move/no-tot targets, **16 `$`-subst-FREE** (logrel 10, cpp13 4, poplmark 2) — the
   standalone ceiling (a strict-regex LOWER bound). `schemaInfo` PROBE (corrected —
   an earlier note mis-read a wrong probe name): the substrate is STRONG. Bare schemas
   give the cons-arm head (`ctx`→`tm`, `tctx`→`target`); BLOCK schemas give the FULL
   field breakdown (`taCtx = block x:term, _t:aeq x x` → `[{x,head:term},{_t,head:aeq,
   type:"aeq x x"}]`) — exactly what a `[g', b:block x:term,_t:aeq x x]` cons arm needs.
   The ONLY hardening gap is the `some [Ω] block …` existential-prefix form (e.g.
   `equalCtx = some [] block …`), which returns `{elements:[]}`. So the build needs
   (a) `schemaInfo` `some [...]`-prefix parsing (narrow), (b) arm-type spelling with
   index args (`x:tm A[]` — D11 writability), (c) refined-context continuation +
   IH-on-`g'`. Scope ≈ C1–C8; greenlit-feasible. SIZE on the fresh re-baseline before
   committing (the ledger over-counts — `equal`'s ctype targets `exCRel`/`ceq`/`saeq`/
   `trelImpliesTdCxt` already COMPLETE on current code).
2. **Fundamental-theorem application** (`weakNorm ×8` = `cr1 (eval [] [⊢M] Nil)`):
   `eval` is the development's MAIN theorem; using it as a backward rule needs
   explicit `{g:ctx}:=[]` instantiation + a `RedSub … Nil` premise + `$S[^]` subst.
   Not a generic depth-2 composition — it is "apply the fundamental lemma," + `$`-subst.
3. **`$`-subst flex** (~37 logrel): the named `matchT`/`substTok` capture-safe wall.

**RE-SCOPING (honest, for the sprint):** logrel is NOT the cheap 114-mass it read as.
The known-mechanism grind here is essentially exhausted at +1. The next mass slice
should target a class chosen by BLOCKER TYPE, not line count — a fresh residue
re-audit that classifies box-derivation-induction (tractable) vs
context/schema-induction + `$`-subst + fundamental-theorem (frontier). Candidate
non-logrel masses to re-audit by blocker: harmony-lemma (22, reduction/rewriting —
likely box-derivation), equal (25, algorithmic equality). poplmark-reloaded (58) and
popl12 (33) are large but likely share logrel's context/`$`-subst frontier — verify
before committing. The three frontier families above are DEFERRED (defer≠discard)
with their mechanisms named: context-split move generation (T3c), fundamental-lemma
backward application, `$`-subst flex.

### RE-BASELINE (targeted, 2026-07-22) — the ledger was STALE; true COMPLETE ≥ 219

The frozen 2026-07-19 ledger (199 COMPLETE) predates the ctype build (C1–C8, 07-21)
and the rebuild slice (07-22), so it badly under-counts. A full native re-sweep was
killed (dominated by big-assembly TIMEOUTs at the 50s cap — the deferred-slow class,
not the signal). A TARGETED native sweep of the 270 fast standalone ctype-dev targets
(logrel/equal/cpp13/popl12/literate/small-step, 30s cap) found **18 RECOVERED**
(now COMPLETE, unrecorded in the ledger): logrel 12 (`reduce_halts`×6, `logEqSym`×3,
`logEqTrans`, `cr1`, `bwd_closed`, `halts_step`=the rebuild slice), equal 5
(`exCRel`, `trelImpliesTdCxt`, `ceq`, `saeq`, `trans'`), literate 1 (`reduce_halts`).
Plus 2 from the partial full sweep (`poplmark-reloaded+#eq_red`, `howe-total#sim_howe`).
**True current COMPLETE ≥ 219 (a LOWER bound — big-assembly + un-swept devs unmeasured).**
A COMPLETE verdict is contention-proof, so these 20 are solid. NEXT: a clean, unattended
full re-sweep (model-free, no parallel native work) to bank the true ledger; archive
`library.jsonl` by rename first (harness law).

### CONTEXT-INDUCTION SLICE — FINALIZED STAKE (real class size, current code)

Of the 270 swept targets, **252 remain stuck; 14 are context-induction, ALL
`$`-subst-free**, clean replicas: `reify`/`str` (cpp13 ×4), `lookup` (logrel ×5),
`redVar` (logrel ×3), `idRedSub`/`idIsVarSub` (logrel). + the un-swept poplmark
`fundVar` class → **~18–20 corpus-wide.** STAKE for the build: the context-structural
induction move (`case [g] of | [ ] => ? | <cons arm per schemaInfo element> => ?`),
target the 14 swept replicas; expected conversion ≥⅓ (≥5) as QUICK proofs (the move
unblocks step 0; base arm = existing fill, cons arm = existing recurse+IH, so a
meaningful fraction should complete once split). Kill: any differential regression, or
completions only via huge searches. C1–C8-scale (new move type + `some[...]`
schemaInfo hardening + arm spelling/writability + refined-context continuation) —
START FRESH, gate hard. This is the leading next slice.

### STEP-BOUND CLASS mined (2026-07-22) — a 2nd frontier move: JOINT TUPLE SPLIT

The 20 swept step/search-bound targets ("engine REACHES but wanders 100–500ck") are
mostly the S3 check-count frontier (`closed` 510ck, `ref` 394ck, `lookupVars` 233ck —
they find the proof via the STEP dimension, slowly; deferred-defect territory). One
shape is a distinct, nameable GENERATION gap: the **uniqueness/determinism idiom**
(`unique`/`unique'`, alg-equal — two derivations of a SHARED subject, `case (tr,sr) of
(C,C) | …` diagonal). TRACE: the engine splits the two scrutinees INDEPENDENTLY and
descends a deep cross-product tree (129ck, step-bound) instead of the JOINT diagonal
split. `trans'` (same `case (e,d)` shape) completes only because backward-chaining
closes it before the wander bites. **Mechanism: joint/parallel tuple split** — offer
`case (a,b) of` with constructor-MATCHED diagonal arms as ONE move (coverage prunes
the impossible off-diagonal). New split move type, C1–C8-scale, search-critical —
its own stake. Recurs across uniqueness/determinism proofs corpus-wide.

**HONEST STATE (2026-07-22): the clean one-session quick wins are EXHAUSTED.** Every
remaining tractable-looking class needs a real NEW mechanism, each C1–C8-scale:
context-induction split (~18–20 targets, leading), joint tuple split
(uniqueness/determinism), synth-site lemma composition (`weakNorm`/fundamental-theorem),
`$`-subst flex. None is an incremental fix; each is a fresh-session build with its own
numeric stake, gated hard. The +1 rebuild slice was the last clean increment.

- **S2 — the no-totality small-reference class (~84).** Class-audit why measure
  synthesis declines them (empty/named measures, `/ trust /`-style, mutual blocks)
  before writing any code.
- **S3 — TIMEOUT small/medium (~56):** E.10 trigger-indexed instantiation (the grind
  notes) + plans-accepted-whole — check-count mechanisms, not caps.
- **S4 — classifier honesty — AUDITED 2026-07-22, NOT cheap on contact.** The
  39 fun/copattern-mislabeled targets (engine says no-move/no-totality; ref uses
  `fun`/copattern → out-of-fragment) are ALL in 2 files: `howes-method/howe.bel`
  + `howe-total.bel` (+ bisimulation) — the Howe's-method coinductive
  development. A SOUND type-level relabel detector needs (1) correct ctype-
  application head extraction (a prototype mis-read `OSim [|- T] [g|-M] [g|-R]`
  as head `R` — the last-turnstile trap), (2) transitive coinductive-
  reachability (OSim is `inductive` but its sole ctor OSimC requires producing
  the coinductive `Sim` under binders — the real signal), (3) soundness care (a
  wrong relabel HIDES a fixable gap). Safe framing IS available: relabel only at
  the verdict site AFTER search exhausts (pure label on an already-failed
  no-move → zero yield risk, never pre-declines). But it is a real detector
  build for 0 corpus % (pure honesty), not the "cheap" it was filed as.
  Deferred with this scoping; pick up as its own effort if verdict-trust is
  wanted. The no-totality-measure MISNOMER sub-part is entangled with the
  measure-fork TRIGGER (proveProgram forks on that exact reason) — a relabel
  must be POST-fork to avoid killing fork completions.
- **DEMOTED indefinitely:** further wander/ordering/budget tuning, certificate polish,
  UI work (unless user-requested), and any hunt whose expected yield is one target.

### ⭐ THE MODEL-FIDELITY SLICE (2026-07-25) — the step-0 mass was MISREADING, not missing search

**How the class was chosen (and why the previously-"leading" slice was wrong).** The
ledger's `steps` field answers the mass question directly: **400 of 533 STUCK targets
end at steps 0** — the search accepts nothing at all. Classifying those 400 by the FIRST
MOVE their own reference proof makes (pure text, seconds — `scratch/probes/firstmove` pattern,
and note the classifier must accept BOTH `=>` and `⇒`, an ASCII-only regex mis-bucketed
half the corpus on the first run) gives:

| reference's first move | targets | of which step-0 |
|---|---|---|
| `case` on a COMP hypothesis | 296 | **194** |
| `let` (invert / call-then-use) | 102 | 63 |
| `fun`/copattern (out of fragment) | 78 | 43 |
| `case` on an LF box | 66 | 40 |
| DIRECT term (fill / composition) | 56 | 36 |
| **`case` on a CONTEXT VARIABLE** | **18** | 18 |
| joint/diagonal tuple `case` | 5 | 5 |

So the kickoff doc's "LEADING" slice — context-structural induction — is an **18-target**
class, and the mass is the plainest move in the vocabulary: `case h of`, which the engine
has emitted since day one. Traces of that class showed why it fails, and the answer was
not search control: **OUR MODEL WAS MISREADING THE PROGRAM.** Six model-fidelity defects,
each general, each found by dumping what the engine GENERATED at the divergence:

1. **The AXIOM rule was string equality.** `fillCandidates` closed a goal with an in-scope
   hypothesis only when the two type texts matched modulo spacing — but the checker prints
   a hole's goal with `_` wherever it will still INFER an index or a context, so
   `X : Extends [g] [g1]` never matched the goal `Extends [_] [g1]`. Worse, a BARE ctype
   goal has no contextual decomposition, so `fillCandidates` returned before the axiom loop
   ran at all. Now: exact matches first, then `assumptionCompatible` — a sound
   OVER-approximation of unifiability (same shape, same rigid head, same arity, no position
   where both sides are rigid-ground and different), with the checker arbitrating, ranked
   after every structurally-derived fill. This is the sequent calculus's init rule; it was
   missing.
2. **The comp-type signature parser was comment-blind (invariant 18, again).** Corpus
   authors annotate premises inline (`[g |- eq T R]  % e1 : eq T R`); the comment text was
   carried into the premise's `raw`, so `decomposeContextual`/`splitTextFor`/the IH matcher
   all saw a corrupted type and emitted NO split, NO recurse, NO lemma — a step-0 bail with
   6 checks. `parseCompType` now strips comments. (`parseTotality` deliberately does NOT —
   see its comment: 93 decls carry a commented-out pragma, 27 of them COMPLETE, and the
   pragma is only the engine's own guidance while decOk is the real guard.)
3. **`buildIntroSkeleton` could not interleave `mlam`/`fn`.** It collected LEADING `{…}`
   binders and then appended N `fn`s, so a Pi binder appearing MID-SPINE
   (`… -> {T:[⊢tp]} TmVar [g,x] [⊢T] -> Sem …`, the `extend`/`weaken`/`nsubst` shape) built
   an expression of the wrong shape. Replaced with a spine walk that emits one binder per
   segment in source order (`introSpineSegments`), including the `(g:ctx)`-vs-parenthesized-
   premise distinction.
4. **Explicit `{Pi}` constructor arguments were dropped from LF patterns and terms.**
   `lfArrowSpineTyped` skipped `{A:tp}` binders as "index variables, not term args" — but
   Beluga's IMPLICIT arguments come from free uppercase variables and are never spelled, so
   a `{A:tp}` that appears in the source IS an explicit argument. Every pattern and
   application of such a constructor was built with the wrong ARITY (`lam (\x. X)` for
   `lam : {A:tp}(value A -> exp B) -> value (arr A B)`), so the whole `case` was rejected.
   They are now argTypes entries in position (the comp-level twin already did this), with
   `piArgsCoveredByHyp` suppressing the one idiom where the slot is already supplied by a
   block-projection pair (`{X:name} hyp X A` → `#b.x #b.h`, str_wtp's `wtp_fwd`).
5. **Family SHADOWING was resolved first-wins; Beluga's rule is sequential.** A program may
   declare a family twice (`eq-proof-tuple.bel` refines `LF eq` mid-file, with proofs on
   both sides). The enumerator kept the FIRST declaration, so it offered the shadowed
   family's constructors. Fixed with a real scope: `setConstructorScopeDecl(thm.name)` is
   announced by `proveProgram` (and cleared in `finally`, so the editor's own queries still
   see the whole program), and `enumerateConstructorsTyped` answers within it — later
   declarations are invisible, and a re-declaration drops the earlier one's constructors.
   Naive last-wins was tried FIRST and cost `eqfun` on the differential; the scoped version
   recovers it.
6. **Redundant parenthesised grouping in the arrow TAIL hid arguments.**
   `axiom : (hyp A -> conc A)` read as NULLARY; `impl : conc A -> (hyp B -> conc C) ->
   (hyp (imp A B) -> conc C)` read as 2-ary instead of 3-ary. `unwrapParenLFType` unwraps
   only the TAIL (a genuine higher-order ARGUMENT keeps its parens and stays one argument).

**A new falsification instrument, cheap and construction-level (use it before any future
generation work): the ARITY AUDIT.** For every constructor the model enumerates across the
whole corpus, compare the arity the model believes against the arities the corpus's own
proofs actually apply it with (text only, no oracle, ~1 min —
`scratch/probes/arity-audit` pattern; count `\x.`-led tokens as part of the argument they
prefix, or every HO constructor reads as a false mismatch). This is exactly the
"corpus VERIFIES, never DISCOVERS" discipline in an instrument: it falsifies the model
against the corpus WITHOUT running a search. **Before this slice: 47 mismatches / 1831
constructors. After: 2 / 1844, and both are audit artifacts (`cletpack`/`copen`, multi-
binder lambdas).** Defects 4 and 6 were found this way, not by a trace.

**A seventh mechanism, same rule one context over — the META-CONTEXT axiom.** Every
split puts its sub-derivations in cD, so a goal `[g ⊢ aeq M N]` is very often inhabited
by `X1 : (g ⊢ aeq M N)`, spelled `[g ⊢ X1]` — and `fillCandidates` had no such candidate
(it covered parameter projections and named context entries only). Added with the same
exact-first / compatible-last discipline. **Yield on the 20-rep bench: 0 new completions;
`small-step/system-f-iso#pres` moves no-move[13ck] → step-bound[684ck, 16 steps]** — a
step-0 bail turned into a real search, at a real cost, with no completion. KEPT
(zero-regression, and refusing the init rule would bake a deterrent in), flagged as
unpaid-for so far.

**Gates: `npm test` 201/201. Differential `--ref library.jsonl` 199/199 — ABOVE baseline:
zero regressions AND the long-standing `tapl/ch3+arith#tps` §6.2 №4 loss is RECOVERED.**

**MEASURED YIELD, honest and attributed.** Full native run of the 123 standalone-`.bel`
members of the step-0 `CASE comp-hyp` class (40s/target cap): **15/123 COMPLETE.** Of
those, **11 were already banked before this session** (the master plan's own 2026-07-22
re-baseline names them: `reduce_halts`×6, `cr1`, `exCRel`, `trelImpliesTdCxt`, `remove`,
literate `reduce_halts` — the ledger is stale, so they read as gains but are not).
**+4 are attributable with a traced root cause: the `trans` family across `eq-proof.bel`,
`eq-proof-2.bel`, `eq-proof-crec.bel`, `eq-proof-tuple.bel`** — all four carry inline
`%` comments in the type signature (defect 2), and `eq-proof-tuple` additionally needed
the shadowing fix (defect 5). All four are QUICK (125–193 checks, 5–7s), not searches
bought with a budget. `ucconv-total#fvar` also completes and is NOT claimed — none of
the six mechanisms explains it and the prior re-baseline was explicitly a lower bound,
so it is most likely another unrecorded pre-existing recovery. Residue of the 123:
83 no-move, 12 cancelled-at-40s, 9 step-bound, 3 search-bound, 1 no-totality.
**The 66 `.cfg`-assembly members of the class were NOT measured this session** (each
check costs 10–30s on a large assembly) — unmeasured, not claimed.

### WAVE 2 (2026-07-25) — the REJECT CENSUS, and what it ranked

**A third construction-level instrument, and the one to run first from now on.**
Every FAILING oracle call *is* a rejected candidate, so wrapping the oracle and
classifying the checker's full error (headline + the Expected/Actual detail) ranks
the engine's GENERATION defects by mass — no guessing from one trace. Run over the
83 no-move survivors of the class above (`scratch/probes/reject-census` pattern):
**4,043 oracle calls, 3,621 rejections.** The ranking immediately paid for itself:

| n | targets | cause |
|---|---|---|
| ~562 | many | **`Identifier <lemma> is unbound`** — `confluence` 88, `determinacy'` 88, `mstep_trans` 86, `mstep_app` 44, `neutral_mstep` 42, `ceq_main` 38 … |
| 865 | 56 | `Type-checking error.` (generic) |
| 537 | 59 | `Expected an LF term-level constant.` |
| ~453 | ~12 | `Identifier <var> is unbound` (`g1`, `A`, `g`, `M`, …) — the WRITABILITY class |
| 171 | 26 | **`Failed to parse …`** — text that is not even lexable |
| 123 | 34 | `This free context variable is illegal` |
| 110 | 36 | `COVERAGE FAILURE: Case expression doesn't cover` |

Every name in the top row is a **THEOREM**, and the fix is the same law as defect 5
one level up: **the LEMMA POOL had no scope.** Beluga's signature is sequential, so
a `rec` declared AFTER the one under proof cannot be cited — mutual `and`-chain
members excepted. `theoremIndex` now carries `at` + `block`, `theoremInScope`
decides it, and the three lemma-pool sites filter on it. ~15% of ALL checker
traffic on the residue was being spent on calls that could never succeed.

The `Failed to parse` row is the second: the engine was emitting a **bare parameter
variable in a computation-level argument slot** (`Ae_a X #p`, `Ae_a #p #p`,
`Ae_a g1 #p`). A `#p`/`$S` is a meta object — legal only inside a box, a projection,
an `mlam` binder list, or a `{#p : …}` binder — so bare it is a PARSE error, never a
type error. Added as universal lexical guard #2 in `movePrefilterOk`, next to the
`"`-name guard it exactly parallels; 13 contract cases (4 reject / 9 legal-and-must-
pass) pinned in `test-prover-prefilter`.

**MEASURED, and honest about what it is:** rerunning the census on the same 83
targets, **oracle calls 4,043 → 3,104 (−23%), rejections 3,621 → 2,679 (−26%)**,
`Failed to parse` 171 → 24, and every lemma-name row **gone**. Gates: suite 202/202,
differential **199/199** after each. **NEW COMPLETIONS: ZERO** (82 no-move, 1
step-bound). These two are SPEED and hygiene — real against the sprint contract's
"quick + reliable" half, worth nothing against the corpus-% half. Do not bank them
as yield.

**Where the next wave should start (from the census, not from a hunch).** After the
two fixes the residue's causes are: `Type-checking error.` 854/56 targets (generic —
needs sub-classification before it is actionable), `Expected an LF term-level
constant.` 395/49 (the S3 finding stands: these are IN-SCOPE names of the wrong
TYPE, so the fix is model-side LF type inference — a large build, correctly parked),
`Ill-typed expression.` 258 + `‹expected a boxed type›` 229, the WRITABILITY cluster
(`free context variable` 119/34 + `free meta-variable` 46/8 + the unbound-variable
rows ≈ 570 — invariant 11's named closure, "the engine emits the splits so it can
bind every name itself"), and **COVERAGE FAILURE 110 across 36/83 targets**.
Coverage is the broadest and the checker PRINTS the pattern it wants, which is a
gift — harvested samples show at least three distinct sub-causes (a missing
PARAMETER arm; a case emitting ONLY the parameter arm and no constructor arms —
`nbe-sub#eval`; and an over-strict constructor-selection unifier dropping legitimate
arms — `system-f-iso#progress` drops 6 of 8 `has` constructors although all 8
enumerate correctly). Split those three before staking; only the third is
per-target.

### WAVE 3 (2026-07-26) — following the census down, and a FALSE TRAIL recorded

**A false trail, recorded because the next agent will be tempted by it.** The census
ranked `COVERAGE FAILURE` (110 / 36 targets) as the broadest remaining cause, so it
looked like the obvious next slice. It is NOT a defect class. The engine emits split
variants in pairs — ANNOTATED first, BARE second (the checker-arbitrated dual-spelling
doctrine) — and the annotated variant legitimately fails coverage on many shapes while
the bare one is accepted. Verified end to end on `fol-handbook#ndhil`: the full 6-arm
bare case is **ACCEPTED by Beluga**, and the trace shows the engine accepting it. The
coverage rejections are largely the arbitration working as designed. **A census counts
REJECTIONS, and this engine deliberately generates candidates it expects to lose — so a
big rejection row is not automatically a bug.** Check whether a sibling variant succeeds
before treating one as a defect. (En route, a second false lead: a classifier that
located "the" case by `lastIndexOf('case ')` mis-attributed arms and invented a
`DROPPED-CTOR` class that does not exist — the fresh-name numbering in the real output
(`X23` for `alli` with `X16–X18` skipped) proves the arms were generated and then
removed by the branch pruner, not never emitted.)

Two mechanisms did come out of it, both differential-gated at **199/199**:

7. **Schema resolution for an IMPLICITLY quantified context** (`soleSchemaAdmitting`).
   `candidateSchemasFor` reads a context variable's schema from `hole.meta` or an
   explicit `(g:ctx)` binder; a theorem that leaves `g` free (`nsubst : … [g ⊢ neut S[]]
   → [h ⊢ neut S[]]`) resolves neither, so no PARAMETER arm was emitted. When exactly one
   declared schema admits the scrutinee's family, that settles it (ambiguity is never
   guessed); gated on the context being a variable at all, so a closed `[ ⊢ …]` scrutinee
   is untouched. **Measured yield: ~null on the class** (COVERAGE 110→109) — it opened
   `weak_neut` and `nsubst` from step-0 bails into real searches and nothing more. Kept
   as correctness, reported as null.
8. **⭐ CONTEXT WRITABILITY (invariant 11, the context half) — the real find.** A theorem
   may bind its context IMPLICITLY: `rec ndhil : (g:ndhilCtx) [g ⊢ nd A] → …` binds `g`
   in the TYPE but **not in the body**. The hole report still prints the context as `g`,
   so every fill spelled `[g ⊢ …]` was rejected outright — and at a PRE-SPLIT hole that is
   *every* fill. A case ARM binds the name (a pattern's context is a binding occurrence),
   which is why the same spelling works after a split and why this hid for so long.
   Verified natively: at a pre-split hole `[g ⊢ k]` dies on the free-context error while
   `[_ ⊢ k]` passes into ordinary type checking. `contextWritableAt` asks the narrow
   question — is the lead context variable bound in the proof BODY before the hole —
   and `fillCandidates` spells the context `_` when it is not. Note the two traps: the
   existing `sourceWritableNames` is too coarse (it counts occurrences in the TYPE), and
   the body region must have the TOTALITY PRAGMA stripped (`/ total d (ndhil g a d) /`
   names the context and made every such context read as writable — the first cut of
   this fix silently did nothing because of it).
   **Measured: `This free context variable is illegal` 119 rejections / 34 targets → 45 /
   14 (−62%)**; those candidates now reach honest type-checking instead of failing
   structurally. The residual 45 are the same defect on the split/lemma/synth emitters,
   which still spell the unwritable name — the obvious follow-on.

9. **The positional-alignment guard, narrowed.** Invariant 5 barred the prefilter from
   judging a Pi-typed constructor *because* `argTypes` dropped explicit `{Pi}` binders.
   Wave 1 keeps them in position, so the guard narrows to what it must still cover — a
   declaration we cannot LOCATE. (The two misalignment sources are already handled: the
   exact-arity requirement catches a term omitting a Pi arg supplied by a hyp pair, and
   each Pi/HO slot is skipped individually.) **Measured: ~null** (3,095 → 3,088 calls) —
   the relaxation rarely fires. Kept; recorded so nobody re-derives invariant 5's now-
   obsolete justification.
10. **⭐ Nullary CTYPE constructors were BOXED.** `fillCandidates` rule (3) emitted
   `box(ctor.name)` for every nullary constructor of the goal head, including comp-level
   ones — `[_ ⊢ Ae_v]` for `Aeq`'s nullary ctype constructor `Ae_v`. A ctype value is a
   COMP expression and must never be boxed (the M3/M4 rule from S1, violated here in a
   different emitter): ill-formed by construction, one wasted checker round-trip at every
   ctype goal that has such a constructor, and it recurs across the whole equal/algeq
   family. `compFamily` was already computed — five lines BELOW the loop that needed it.
   **Measured: `Expected an LF term-level constant` 380 rejections / 49 targets → 308 /
   29 (−41% of affected targets).**

### ⭐ WAVE 5 — the metric was wrong, and the fix under it closes a NAMED OPEN LEAD

**Stop and re-read the residue definition before optimising it again.** Waves 2–4 drove
the reject census down 28% and bought ZERO completions, and the reason is structural:
**82 of the 83 targets are `no-move`, which means the search EXHAUSTED — it did not run
out of budget.** Cheaper or cleaner candidates cannot help a target that ran out of
candidates. A rejection census is the right instrument for a TIMEOUT/step-bound residue
and the WRONG one for a no-move residue. The question for no-move is the opposite:
*which correct move was never proposed?*

Re-instrumented for that (`scratch/probes/divergence` pattern — steps accepted, plus the
move KINDS offered at the DEEPEST hole visited, not the root the search backtracked to;
getting that wrong the first time made every target look like it only had `intro`):
**82/83 accept zero steps**, and at the divergence hole the vocabulary is mostly rich
(`fill+split`, `fill+recurse+split`, `fill+lemma+recurse+split`) — so generation is not
the general problem. But **13 targets collapse to `fill` or `fill+intro` alone**, and
they replicate across files (`neutral_mstep` ×3, `determinacy'` ×3, `lookup` ×2,
`monotone` ×2). Tracing one showed the cause immediately.

11. **⭐ `parseTotality` mis-parsed the parenthesised measure form.** `/ total (f) /`
    and `/ total (f x) /` — 64 declarations corpus-wide — left the parens glued to the
    token, so the measure's decreasing argument came out as `(neutral_mstep` or `h)`.
    `introBinderNames` then named a binder that way and the intro emitted
    `fn (neutral_mstep => …`, which does not parse: **the theorem had no first move at
    all and bailed at step 0 in 3 checks.** A lone function name designates no argument,
    which is exactly `bare`; `f x` means fn `f`, decreasing `x`.

    **MEASURED BY EXACT A/B (toggle on the mechanism, same 10 targets): 7/10 → 10/10,
    so +3 attributable completions, all QUICK** — `cp.cfg#str_hyp` no-move[3 checks] →
    COMPLETE[3 steps, 7 checks], `weak-norm-total-products#halts_step` and
    `weak-norm-total#halts_step` both no-move[2] → COMPLETE[2 steps, 4 checks].
    `neutral_mstep` goes no-move[3] → step-bound[8 steps, 1100 checks] (real search, no
    proof — not banked).

    **This closes a NAMED OPEN LEAD.** The harness memory has carried, for weeks, "the
    sharpest unexplained finding: gates diverge under the REAL assembly — `str_hyp` goes
    no-move[**3 checks**] under `cp.cfg` where the curated-prelude gate version solves[5]".
    That is exactly this bug, down to the check count: the curated gate prelude spells
    the measure differently, the real assembly writes `/ total (str_hyp h) /`, and the
    engine parsed its decreasing argument as `h)`. Root-caused and closed — remove it
    from the open-leads list.

**Cumulative across waves 2–4 on the 83-target residue: oracle calls 4,043 → 3,035
(−25%), rejections 3,621 → 2,607 (−28%), with ZERO completions from those three waves.** Suite 203/203,
differential 199/199 throughout. Say it plainly: these three waves bought correctness and
speed, not corpus %. The remaining top rows (`Type-checking error.` 879, `Expected an LF
term-level constant.` 382, `Ill-typed expression.` 281) are all "the term is the wrong
TYPE for the slot", which is the S3 finding again — the fix is model-side LF type
inference, a genuine build, and it is the honest next frontier rather than another
lexical guard.

### WAVE 6 (2026-07-27/28) — the model layer is now CLEAN, and a real ledger

**Two reverts, causes isolated — record them so they are not re-derived blind.**
(a) Narrowing `classifyPremise` so a PARENTHESISED FUNCTION premise
(`({T:[⊢tp]} TmVar [g] [⊢T] -> Sem [h] [⊢T])`, the `extend`/`nsubst` shape) counts as
an argument rather than an implicit `(g:ctx)` binder is CORRECT in isolation — it
otherwise shifts every downstream argument index — but it blew
`tapl/ch3+arith+leq#mstep_leq_2` from COMPLETE to a >10-minute search (the extra
premise widens IH/rule arity and the lemma pool explodes). (b) Promoting the measure's
declared induction subject to the FRONT of the split order is ordering-only and sound
in principle, but it was the actual cause of that hang; reverted, `mstep_leq_2` back to
COMPLETE at 179 checks. Both notes live at their code sites.

**⛔ AND THE EVIDENCE FOR (b) WAS A MEASUREMENT ARTIFACT.** The "19 of 66 targets split
the wrong subject" figure came from comparing the REFERENCE's binder index (which
counts `mlam`s) against the ENGINE's fresh-name numbering (which counts `fn` binders
only). Corrected: **8 of 66**, six of them the `extend` family. Two instruments in a
row (this and the `lastIndexOf('case ')` arm classifier) produced confident, wrong
class stories. **Validate the instrument on one hand-checked target before believing
its aggregate.**

12. **The INTRO AUDIT — a third construction-level falsifier, and a clean negative.**
    Almost every stuck target dies at step 0, and step 0 is the intro. `npm run
    prover:intro` compares the binder sequence our model would emit against the binder
    sequence the reference proof actually uses, for every theorem — text only, no
    oracle, ~1 min. **Result: 801 theorems compared, 10 mismatches, and all 10 are
    granularity artifacts** (source text keeps a parenthesised conclusion the checker
    flattens; `plus'`/`b_map` introduce fewer binders up front and more inside arms —
    both spellings legal). **The intro layer is correct.** With the arity audit at
    2/1844 (both artifacts), THE MODEL NOW READS THE PROGRAM CORRECTLY: the remaining
    residue is genuinely search and composition, not misreading. Stop looking there.

**⭐ THE LEDGER, MEASURED AT LAST.** `library.jsonl` (2026-07-19) says 199 COMPLETE and
every class size in these docs derives from it — which is how the "leading" slice came
out at 18 targets. Re-ran all **331 standalone-`.bel` targets it records as not
COMPLETE**, natively, 40 steps / 40s cap, coinductive excluded:
**31 COMPLETE ⇒ true library ≥ 230.** Recorded as
`results/corpus/library.native-rebaseline-20260728.jsonl` (a separate file: the cap and
step budget differ from the browser harness, so it must not be silently merged).
Residue over those 331: no-move 163, no-totality 69, step-bound 32, cancelled@40s 33,
search-bound 4. **Still owed:** the `.cfg` assemblies, then a fold into `library.jsonl`
with an archive-by-rename first.

**What this slice does NOT claim.** Six real defects and a clean arity audit are
model-correctness work; the corpus % they bought is +4 measured. The step-0 mass is
still 83/123 no-move in this class alone, and those now fail for reasons the model reads
CORRECTLY — which is the point: the next investigation starts from a model that is not
lying to it.

### WAVE 7 (2026-07-28) — the POISONED DECREASING SLOT

13. **⭐ `decreasingHyps` fed the IH's decreasing-argument slot from the INNERMOST case
    arm, family-filtered only.** When that arm destructured a premise NOT descended from
    the MEASURED one — the uniqueness / determinacy / confluence idiom, two derivations of
    the same family split one after the other — every recursive call it generated was
    rejected by the totality checker (`Recursive call not structurally smaller`), and the
    call the proof actually needs (decreasing argument from the OUTER split on the measured
    premise) was **never generated at all**. Measured on
    `logrel/algeq-simplified#determinacy` by dumping every candidate the search emitted:
    `determinacy [g ⊢ X1] [g ⊢ X]` proposed 4×, `determinacy [g ⊢ X] [g ⊢ X1]` **0×**.

    **The fix is the checker's own criterion, not a heuristic.** `decSubderivNames` (the
    fixpoint over enclosing cases whose scrutinee is decreasing-descended) already gates
    the synthesis engine's decOk facts; the greedy recurse generator never consulted it.
    Now: when the innermost arm binds NO eligible sub-derivation, the eligible ones in
    scope LEAD the pool. Nothing is dropped — the criterion is blind to a sub-derivation
    bound by a `let`-inversion rather than a `case`, so the pool is only widened and
    reordered, and a hole whose innermost arm is already eligible is byte-identical.

    **MEASURED BY EXACT A/B** (mechanism toggled off, same 58-target list, same cap):
    **6/58 → 9/58, so +3 attributable, 0 losses, no other verdict change anywhere in the
    class** — `determinacy` in `logrel/algeq-simplified.bel`, `algeq-simplified1.bel`,
    `algeq-typing.bel`, each no-move[129 checks] → **COMPLETE[8 steps, 55 checks, ~5s]**.
    Quick proofs, not budget purchases. Corroborated independently: the 2026-07-28 native
    re-baseline records all three as STUCK on current code, so these are new against the
    freshest ledger, not stale-ledger recoveries. **Gates: suite 203/203; differential
    `--ref library.jsonl` 199/199 — exact baseline, zero regressions.**

    **Honest sizing, and the lesson.** The class was scoped text-only as "≥2 argument
    premises sharing the MEASURED premise's family head" — **58 stuck+totalied targets**
    (30 no-move, 22 TIMEOUT, 6 no-totality; logrel 15, church-rosser 12, poplmark± 6,
    unique/path/howe). That is a NECESSARY condition and it badly over-estimates: total
    checks across the class moved only 13,611 → 13,389, i.e. **the mechanism barely fires
    outside the `determinacy` family**, because in most members the innermost arm DOES
    bind an eligible sub-derivation. +3 is one proof SHAPE replicated across three file
    variants, not three independent shapes. **The signature-level necessary condition is a
    weak proxy for a search-behaviour class — size such classes by running the toggle on a
    sample before staking, not by counting signatures.** (Wave 6's "validate the instrument
    on a hand-checked target" law, one level up: validate the CLASS DEFINITION too.)

    **Residue of the 58, with the mechanism on:** 16 step-bound (the engine reaches and
    wanders — S3 check-count territory), 15 no-move, 17 cancelled at the 120s cap (the
    `.cfg` assemblies, no signal either way), 1 no-totality.

14. **The same criterion completed for `let`-inversions — BUILT, and a NULL result with
    an instrument lesson.** Beluga treats a one-branch `let` exactly like a `case`, so
    `let [g ⊢ ctor S] = d in` makes `S` structurally smaller for a decreasing-descended
    `d`; `decSubderivNames` walked `openCasesAt` only. Now one fixpoint over BOTH forms
    (RHS must be a bare identifier — a hypothesis, never a call result — and the pattern
    single-line; both UNDER-approximate, so a miss costs a candidate, never a wrong one).
    **Gates: suite 203/203, differential 199/199.** **Yield: 0 completions across ALL 21
    class members** — the 7 standalone `.bel` are byte-identical ON vs OFF (same verdict,
    same check count to the digit: the mechanism never fires), and the 14 `.cfg` are
    0/14.

    **⛔ THE INSTRUMENT WAS MEASURING THE WRONG PROGRAM.** The 21-target class came from
    auditing where the **REFERENCE** proof binds its recursive call's decreasing argument
    — but `decSubderivNames` reads **the engine's OWN emitted proof text**. If the engine
    never emits that inversion, the code is inert no matter how many references use it.
    A reference-shape audit sizes what a proof NEEDS; it says nothing about what the
    search REACHES. This is Wave 6's "validate the instrument" law again, and it is now
    twice in one session (see the class-sizing note in 13). **KEPT** as correctness
    (zero-regression, zero-change-when-idle, and refusing to model a real rule of the
    checker bakes a deterrent in), reported as null.

15. **⭐ Object-Pi constructor arguments in ctype patterns — an entire development had NO
    FIRST MOVE.** `splitTextForCtype` skipped any constructor with a non-schema Pi
    argument (`if (t[0] === '{') { ok = false; break; }`, the C2 fail-open). `Sn`'s ONLY
    constructor is
    `Acc : {Γ:cxt} {A:[⊢ty]} {M:[Γ⊢tm A[]]} ({M':…} {S:…} Sn [Γ⊢M']) → Sn [Γ⊢M]`,
    so `branches` came out empty and **no split or inversion was EVER offered on an `Sn`
    hypothesis** — the step-0 bail for the whole poplmark-reloaded SN development
    (measured: 12 of 14 members bailing at 11–23 checks). An object-Pi argument is a
    META-OBJECT, not out of fragment: it binds as a BOX. **Checker-arbitrated before
    coding** (the doctrine, not a guess): for `Acc`,
    `| Acc [_] [ |- A1] [_ |- M1] R => ?` is **ACCEPTED**, and the bare spelling the
    naive un-skip would emit is **REJECTED** ("Expected a meta-object; Found a
    computation-level pattern"). Context spelled `_` (corpus idiom, D11-safe — the ctor's
    declared context variable need not be writable at the hole); a structural extension
    keeps its tail; a non-box Pi still skips.

16. **A malformed pattern that could not even parse.** `piRecurseTexts`' ctype-result
    component mapper ran EVERY constructor argument through `decomposeContextual`,
    including `Acc`'s higher-order accessibility function — which split at the FIRST
    turnstile, that one being *inside* the nested Pi, emitting
    `let Acc R [ |- R1] [Γ |- R2] [{M':[Γ |- R3] = …` and the checker's "Failed to parse
    (mutual) recursive function declaration(s)". A higher-order argument is a COMP-level
    value and binds BARE (the M3/M4 law, one emitter over). Now only a genuine `[Γ ⊢ A]`
    box binds boxed. The candidate now parses and fails, honestly, on type.

    **MEASURED for 15+16 together, same 14-target list, same 240s cap, before vs after:
    0/14 → 0/14 COMPLETE.** What changed is that the step-0 bails became real searches —
    `inl_sn` 11→35 checks, `inr_sn` 11→35, `mstep_sn` 78→312, `caser_sn` 17→173,
    `match_sn` 21→312, `abs_sn` 49→111 — and the trace confirms the `Acc` split is now
    generated AND accepted (arm `[h]`, pattern vars live in the continuation goals). One
    target got WORSE in cost: `bc_aux_sum` no-move[23ck] → step-bound[480ck, 162s].
    **Gates: suite 203/203, differential 199/199 — zero regressions.** **KEPT and flagged
    UNPAID-FOR**, exactly like mechanism 7 and the meta-context axiom before it.

    **⭐ THE NEXT MECHANISM, LOCALIZED WITH EVIDENCE (this is the one worth staking).**
    The family's reference proofs all have the same second move, and the engine cannot
    write it: **construct a ctype constructor's HIGHER-ORDER argument as an `mlam`
    skeleton with a fresh hole.**
    `inl_sn` = `let Acc [_] [⊢A] [_⊢M] r = sn in Acc [_] [⊢ sum A B] [_ ⊢ inl _ M]
    (mlam _, S ⇒ let [_ ⊢ rinl S'] = [_ ⊢ S] in inl_sn [_⊢_] [⊢_] (r [_⊢_] [_⊢S']))`.
    Inverting is now possible; BUILDING is not. The `mlam _, S ⇒ ?` skeleton is fully
    DERIVABLE from the constructor's declared argument type (`{M':…} {S:…} Sn [Γ⊢M']` →
    one binder per Pi, hole at the body), so this is analytic term construction, not
    invention — intelligence in the TERM structure, which is §0's north star, and the
    same shape as `nestedCtorArgFills` one level up. Note the applied-hypothesis use
    `(r [_⊢_] [_⊢S'])`: the bound HO variable must also be APPLICABLE as a rule. Scope
    ≈ C1–C8. Class: poplmark-reloaded± SN (58 targets by the per-development audit) plus
    every accessibility/logical-relation family of the same shape. **Declare a numeric
    stake before starting, and size it by TOGGLE on a sample — not by counting
    signatures or reference shapes, both of which misled this session.**

17. **HIGHER-ORDER CTYPE CONSTRUCTION (`mlam` skeletons) — BUILT, guarded, and UNPAID.**
    Rule (3) emitted only NULLARY constructors for a comp-family goal and rule (4)
    (type-directed constructor synthesis) is LF-only, so a ctype goal could never be
    built by APPLYING its constructor — `Acc` was unreachable as a term. Added rule (3b)
    in `fillCandidates`: schema Pi → `[_]`, box Pi → `[<underscored ctx> ⊢ _]`,
    higher-order argument → `(mlam b1, … ⇒ ?)`, one binder per Pi in the argument's own
    declared type. Spelling **checker-arbitrated before coding**:
    `Acc [_] [ |- _] [_ |- _] (mlam M2, S => ?)` ACCEPTED; dropping the explicit Pi
    arguments REJECTED ("Expected: function type").

    **A REAL ORBIT, caught and fixed, not shipped.** The `mlam` body has the SAME family
    goal as the constructor that opened it, so the first cut re-applied `Acc` into its
    own body forever — 25 accepted steps, step-bound at 261 checks on `inl_sn`. Guard:
    refuse while an emitted `(mlam` is still OPEN at this hole with NO intervening
    `case`/`let` — a structural non-progress test (the speculative-let chain cap's shape),
    not a budget. After it: 74 checks, orbit gone.

    **MEASURED BY TOGGLE, 44-target spread over 22 programs (2 per program) drawn from
    the 140 stuck targets whose ctype goal family has a higher-order constructor
    argument: 1/44 → 1/44. GAIN 0, LOSS 0, checks 6,174 → 6,178 (+4).** The only
    verdict changes are two HONEST relabels (`howe`/`howe-total#howe_osim`,
    no-move → coinductive-out-of-fragment). **Gates: suite 203/203 (one flake in the
    unrelated `test-settings-persist`, green standalone and on re-run), differential
    199/199 — zero regressions.**

    **Why it is inert, stated plainly:** the limiter requires EVERY argument to be a
    schema Pi, box Pi, or higher-order, and most ctype constructors with an HO argument
    also carry plain ctype premises (`SnCInl : Sn … → Sn … → Sn … → SnRed …`). So it
    fires essentially only on the accessibility shape — where, as 16 already records, the
    proof still needs two more mechanisms. **KEPT as the construction half of the SN
    build** (cost measured at ~zero, two verdicts made honest), explicitly NOT banked.

18. **⭐ THE ACCESSIBILITY CHAIN CLOSED — `inl_sn` / `inr_sn` COMPLETE.** Three further
    defects, each found by probing the checker rather than reasoning about it:

    (a) **Rule (3b) was emitting a VACUOUS ACCEPTANCE.** `Acc [_] [ |- _] [_ |- _]
    (mlam …)` type-checks, but leaves the constructor's explicit Pi arguments
    undetermined — the meta-context reads `S : (FREE CtxVar 5 |- step (?X…) M')`, so the
    skeleton certifies and the NEXT move on `S` dies "Expression is not closed". Rule (3b)
    now instantiates those arguments by unifying the constructor's RESULT against the
    goal (`Acc [_] [ |- _] [_ |- inl B[] X2] …`). Probed both ways: instantiated
    ACCEPTED, all-underscore REJECTED. **A move that certifies but poisons its own
    continuation is the P12 pathology — check the move AFTER the one you are adding.**

    (b) **Metas bound by an `mlam` WE emitted were unsplittable.** The pi-meta split loop
    keys on `piNames`, the THEOREM's Pi binders, so the derivation bound inside our own
    skeleton could never be analysed. `piNames` now also carries the binders of any
    `mlam` on the path to the hole (membership in `hole.meta` — the checker's own report —
    remains the authority on scope). The split then collapses to the single possible arm:
    `(case [h |- X5] of | [h |- rinl X21] => ?)`.

    (c) **The recursion emitter dropped the CTYPE argument slot, and recursed on the
    wrong subject.** `piRecurseTexts` filtered premises to `box`, so `inl_sn` was called
    as `inl_sn [ |- _] [ |- X1]` — two arguments for a three-argument theorem — and its
    `decI` picked the last box Pi (`B : ty`), i.e. induction on a TYPE. Fixed: ctype
    premises are argument slots (M1b, one more emitter), and a CTYPE-SUBJECT call family
    is emitted with every Pi argument inferred, carrying the decrease in the argument
    itself. The slot's candidates come from `hoHypApplications` — **applying an in-scope
    HIGHER-ORDER hypothesis as a rule**, the last missing move: `X3` is bound by the `Acc`
    pattern and is itself a Pi telescope, and nothing in the vocabulary applied it.
    Probed: `let R = X3 … in inl_sn … R` is REJECTED ("Recursive call not structurally
    smaller") — the totality checker accepts it ONLY inline in the argument slot, so the
    nested form is the one to generate. The decI gating now bails to `out`, never `[]`,
    so these calls survive a Pi subject with no candidate in scope.

    **MEASURED: the 14-target SN list 0/14 → 2/14** — `poplmark-reloaded+#inl_sn` and
    `#inr_sn`, each **COMPLETE[5 steps, 106 checks, ~18s]**, quick proofs:
    `case X of | Acc [h] [ |- X1] [_ |- X2] X3 ⇒ Acc [_] [ |- _] [_ |- inl B[] X2]
    (mlam X4, X5 ⇒ (case [h |- X5] of | [h |- rinl X21] ⇒
    inl_sn [_ |- _] [ |- _] (X3 [h |- _] [h |- X21])))` — split, higher-order
    construction, invert, and a recursion through an applied accessibility function,
    end to end from our model. **Gates: suite 203/203, differential 199/199 — zero
    regressions.** On the 44-target cross-development HO sample the delta is 0 (that
    sample takes 2 targets per program and is mostly standalone `.bel`; the SN wins are
    `.cfg`), so the honest reach so far is the accessibility shape, not all 140.

19. **WIDENED, same mechanism — the SN list 0/14 -> 4/14.** Three further increments,
    each probe-first:

    (a) **One-constructor REBUILDS in the HO application's slots.** The accessibility
    function is routinely applied to a derivation the caller must BUILD:
    `r [_ | - _] [_ | - rappr S]` — the bound `S` steps the sub-term, the slot wants the
    step of the WHOLE term. Per slot, each constructor of the slot's family taking exactly
    ONE argument of that same family, applied to an in-scope meta (the
    `nestedCtorArgFills` limiter — a rebuild point, never generic breadth). Probed on
    app_snb: with `rappr X5` ACCEPTED, with the bare meta "Ill-typed".

    (b) **SUPPLY THE DERIVATION, INFER THE INDICES — and a ranking that hid the answer.**
    A telescope's leading slots are index arguments and its LAST slot is the derivation
    that determines them, so the shape that checks is inferred-leading-slots plus a
    concrete final one. The first cut ranked tuples by FEWEST underscores (a guess, made
    to dodge "leftover metavariables") and sorted the winning shape out of the cap
    entirely — every emitted application filled the LEADING slot concretely and every one
    was "Ill-typed". The rejected-candidate dump showed it immediately: 60+ variants, none
    of them the one form the probe had already proven. **When a probe says a spelling
    works and the engine never emits it, look at the RANKING before the generator.**

    (c) **Instantiated slots take the GOAL's context, not the constructor's.** A goal over
    an EXTENDED context needs the extended spelling; rule (3b) used the declared context.

    **MEASURED, same 14-target list, same 240s cap, before the whole build vs after:
    0/14 -> 4/14** — `inl_sn`, `inr_sn` (143 ck), `app_snb` in BOTH poplmark-reloaded and
    poplmark-reloaded+ (54 ck, 4 steps). **Gates: suite 203/203, differential 199/199 —
    zero regressions.**

    **THE COST, reported not buried:** the mechanism opens searches that do not close.
    `abs_sn` no-move[49] -> step-bound[239], `confluence` no-move[15] -> step-bound[821],
    `mstep_sn` no-move[78] -> step-bound[397], and **three go no-move -> CANCELLED at
    240s** (`bc_aux_sum`, `caser_sn`, `match_sn`). Against the sprint contract's
    quick+reliable half that is a real debit on 6 targets for 4 completions. It is
    contained to this family's shape and the differential is clean, so it ships — but the
    next increment here should be CHEAPENING those searches, not widening further.

    **`case_snb`/`case_snc` are blocked ELSEWHERE — a hole-report defect, not this
    mechanism.** At the post-split hole the report splits the accessibility hypothesis's
    Pi telescope across TWO context entries (one holding only the first binder, a second
    holding the rest plus the conclusion) because the type contains a lambda.
    `hoHypApplications` then sees a telescope with no conclusion and skips it, so no
    recursion is ever offered. The fix belongs in the hole report's context-entry
    splitter (lambda-aware), and it is worth doing: it silently corrupts every hypothesis
    whose type carries a lambda binder.

    **Residue of the 14:** 4 COMPLETE, 3 step-bound, 3 cancelled@240s, 2 no-move
    (case_snb/case_snc, blocked by the report defect above), 2 other.

21. **⭐ THE `.cfg` RE-BASELINE — the ledger owed since Wave 6, now paid.**
    Ran all **209 `.cfg` targets the 2026-07-19 ledger records as non-COMPLETE**
    natively (40 steps / 60s cap), incremental-write so an interrupted sweep keeps its
    measurements. Recorded as
    `results/corpus/library.native-rebaseline-cfg-20260729.jsonl` (kept SEPARATE, like
    the 07-28 standalone sweep — different cap and step budget from the browser
    harness, so it must not be silently merged).

    **24 COMPLETE.** Residue: 70 cancelled@60s, 66 no-move, 36 no-totality, 7
    step-bound, 6 coinductive.

    **⭐ TRUE LIBRARY COMPLETE ≈ 254** (199 frozen ledger + 31 standalone-`.bel`
    recoveries from the 07-28 sweep + 24 here). The frozen ledger under-counts by ~55,
    which is exactly why four class estimates went wrong this session — EVERY residue
    number in these docs derives from it. Fold both sweeps into `library.jsonl`
    (archive by rename first) before staking anything on a class size again.

    **6 of the 24 are attributable to this session's accessibility build**, each
    verified by reading the emitted proof rather than assumed: `app_sna` and `app_snb`
    in BOTH poplmark-reloaded and poplmark-reloaded+, plus `inl_sn`/`inr_sn`. `app_sna`
    was NOT in the 14-target SN bench and would have gone uncounted without this sweep
    — its proof is the same chain (`Acc` split → `Acc [...] (mlam ...)` construction
    → HO application with a `rappl` rebuild). The other 18 are pre-existing recoveries
    the ledger never recorded (church-rosser `eq3`/`eq6`/`sym_pconv`/`appd`/`append`,
    lincx `is_unr_join*`/`lemma1_6b`/`unr_uniqueness`, cp `str_hyp`/`str_lin`,
    bisimulation `invsym`, tapl `vsound`/`lemma_val_1`, poplmark `eq_red`).

    **The 70 cancelled@60s are NOT verdicts** — the cap is well under what a big
    assembly needs (`str_lin` took 55.7s to SUCCEED). They are unmeasured, not stuck.

22. **⭐ THE LEDGER OF RECORD, REBUILT — and the class map redrawn on real numbers.**
    The 70 targets that cancelled at the 60s cap were re-run at **240s**. **0/70
    COMPLETE** on the 23 measured before this entry was written (6 step-bound, 8 still
    cancelled, 7 no-totality, 2 no-move). **This FALSIFIES the natural reading that the
    cap was hiding completions** — it was hiding VERDICTS. Quadrupling it converts
    nothing; it only turns TIMEOUT rows into honest no-move/no-totality ones. So **254
    stands** and the deep re-run is a classifier-honesty instrument, not a corpus-%
    one. (Recorded before the sweep finished because the signal was unambiguous at
    23/70; per the sprint contract a completion bought with a 240s search would be a
    deferred defect anyway.)

    **`results/corpus/library.native-merged-20260729.jsonl`** — the frozen 2026-07-19
    ledger with **541 rows overridden** by the two native sweeps (07-28 standalone
    `.bel`, 07-29 `.cfg`). `library.jsonl` is UNTOUCHED (the archive-by-rename law
    applies before any real fold); this is a derived VIEW, and the right input for
    class sizing until someone does the fold properly.

    | outcome | n |
    |---|---|
    | COMPLETE | **254** |
    | no-move | 275 |
    | no-totality-measure | 107 |
    | TIMEOUT (unswept residue) | 103 |
    | step-bound | 39 |
    | coinductive (out of fragment) | 39 |
    | PRECHECK_FAIL / FAIL | 29 |

    **The class map, rebuilt on it** (`npm run prover:firstmove --ledger <the merged
    file>`) — compare against the stale map in the MODEL-FIDELITY entry, which is what
    everything before this was sized from:

    | reference's first move | targets | of which step-0 |
    |---|---|---|
    | `case` on a COMP hypothesis | **267** | **197** |
    | `let` (invert / call-then-use) | 88 | **79** |
    | `fun`/copattern (out of fragment) | 77 | 48 |
    | `case` on an LF box | 62 | 50 |
    | DIRECT term | 50 | 38 |
    | `case` on a CONTEXT VARIABLE | 18 | 18 |
    | joint/diagonal tuple `case` | 4 | 4 |

    The shape survives the correction — `case` on a comp hypothesis is still the mass —
    but note the LET class's step-0 count went 63 → **79**: native verdicts replaced
    TIMEOUT rows with honest step-0 bails, so that class is denser than it looked. Any
    future stake is sized from THIS table, and then confirmed by toggle on a sample
    ([[feedback-size-classes-by-toggle]]) before a line of code is written.

23. **⭐ TYPE-ASCRIPTION RE-BINDING — a missing move, found by reading the LET class.**
    With the ledger honest (entry 22), the `let` class is the second mass: 88 targets,
    **79 accepting nothing**. Reading its references showed one distinctive first move
    repeated across whole families (`existsEq`/`existsEqV`/`exTRel`/`exTRelV`,
    `ctx_member`, `strengthen`/`extend`, `env_ext`): **`let (cr : Crel [l] [h]) = cr in`**.

    A premise routinely quantifies its context and substitution parameters IMPLICITLY —
    bound in the TYPE, not in the body — so every later move that spells one dies with
    "This free context variable is illegal". Re-binding the hypothesis AT ITS DECLARED
    TYPE brings those names into scope for the whole body. Probed before building, on
    `equal#exTRelV`: the split the proof needs is **REJECTED without the ascription and
    ACCEPTED with it** — productive, not cosmetic.

    Emitted alongside inverts, limited to stay a FIRST move: only at a hole with no
    enclosing case, only for a premise whose declared type carries an implicit
    lower-case context or `$`-substitution name, only when the family head identifies
    the premise uniquely, never twice for the same name on a path.

    **A trap on the way in, worth its own line:** the "no enclosing case" test used
    `openCasesAt(code, hole)`, which defaults to scanning from offset 0 — and a sibling
    `rec`'s unparenthesised top-level `case` NEVER closes, so every hole in a multi-decl
    file read as already inside a case and the move never fired. Scope it with
    `declStartOffset` (the same trap the split-depth budget documents). Symptom was
    silence, not an error.

    **MEASURED BY EXACT TOGGLE on the 32-target class: 0/32 → 2/32. +2, 0 losses** —
    `equal#exTRel` no-totality[34ck] → COMPLETE[45ck], `equal#exTRel'`
    no-totality[24ck] → COMPLETE[31ck], both quick. **Gates: suite 203/203 in 149s,
    differential 199/199 — zero regressions.** 6% conversion, below a ⅓ stake: the
    ascription is the first move of all 32 but most need a SECOND missing move on top
    (`exTRelV` still no-move at 10 checks — it needs a parameter-variable split,
    `case [l ⊢ #p] of` with `#p`/`#p[..]` patterns, which is the next thing to scope in
    this class).

24. **PARAMETER-VARIABLE SPLIT — a genuinely missing move, and UNPAID.**
    `case [l ⊢ #p] of | [l, x:term ⊢ x] | [l, x:term ⊢ #p[..]]`. A theorem quantified
    over a PARAMETER (`{#p : #[l ⊢ term]}`) is proved by asking whether that variable is
    the context's NEWEST binding or an earlier one. The engine split constructors,
    boxes and comp hypotheses but never a parameter, so the whole idiom
    (`exTRelV`, `existsEqV`, `ctx_member`, `lookupVars`) had no move at all. Arms come
    from the context's SCHEMA via `schemaInfo` — the "newest binding" arm (the element's
    own variable, or a block PROJECTION) and the "earlier one" arm, whose spelling
    `parameterTermFor` already knew (`#p[..]` / `#p.f[..]`). Both arms present the
    context EXTENDED by that element, which is what makes the refinement visible.

    Checker-arbitrated on equal#exTRelV (only reachable AFTER the type ascription of
    entry 23 — without it every spelling dies on "free context variable"): the two-arm
    split is ACCEPTED, and the element's type must be spelled CONCRETELY — `[l, x:_ ⊢ x]`
    is rejected with "Holes may not appear as contextual LF types".

    **MEASURED: 0/26 on the class of stuck targets carrying a Pi-bound parameter
    (poplmark± 8, literate 4, equal 2, cpp13 2, logrel 7, …), and +0 on the 32-target
    ascription class (still 2/32).** The move is generated and ACCEPTED — `exTRelV`
    now takes it and goes 10 → 22 checks — but no target closes on it yet. **Gates:
    suite 203/203 in 160s, differential 199/199 — zero regressions. KEPT** as
    vocabulary (refusing a move the fragment genuinely needs bakes a deterrent in, the
    standing law), reported as NULL, not banked.

    **What `exTRelV` still needs, traced not guessed:** after the parameter split its
    arms need `let Crel_xa (cr' : Crel [l0] [h0]) = cr in` — an inversion of the ctype
    hypothesis whose bound sub-hypothesis is itself TYPE-ASCRIBED (entry 23's move, one
    level in, at a non-first position). That is the third move in this family's chain
    and the next thing to scope here.

25. **⭐⭐ INFERRED-INDEX VARIANTS — the first GENERAL mechanism of this arc, and the
    one that should have come first.**

    Every family-specific slice this session converted at 0–15% of its class. Reading
    back across ALL the traces, one cause repeats everywhere: an application whose SHAPE
    is right and whose INDEX arguments are the wrong terms — "Ill-typed expression" on
    `f [g ⊢ M] [g ⊢ N] d` where `f [g ⊢ _] [g ⊢ _] d` checks. Beluga RECONSTRUCTS those
    slots from the derivation argument, and the corpus writes them that way
    (`inl_sn [_ ⊢ _] [ ⊢ _] (r …)`). The engine instead ENUMERATES concrete terms for
    every slot and loses on all of them — which is also why the reject census kept
    reading as "wrong TYPE for the slot" and got parked as needing model-side LF type
    inference. It does not: it needs us to stop guessing what the checker will infer.

    **The mechanism (post-pass over the ordered move list, ~25 lines):** for each
    application-shaped move (`fill`/`recurse`/`lemma`), offer ONE extra variant with
    every boxed argument except the LAST spelled `_` — the same "supply the derivation,
    infer the indices" rule that was checker-proven for higher-order hypothesis
    application (entry 19b). Purely additive, ranked immediately after its original, so
    the concrete spelling still leads and no accepted move changes order.

    **MEASURED BY EXACT TOGGLE on a broad 60-target sample (2 per program, drawn across
    the WHOLE standalone residue — not a hand-picked class): 5/60 → 6/60. +1, 0
    losses.** The gain is also a SPEED result, which is the sprint contract's other
    half: `logrel/weak-norm-closed-ideal#closed` step-bound[**713 checks**] →
    **COMPLETE[37 checks]** — 19× cheaper AND decided. **Gates: suite 203/203 in 134s,
    differential 199/199 — zero regressions.**

    **This is the shape of mechanism to look for from here.** It is not tied to a
    family, a schema, or a constructor; it applies at every application site in the
    corpus. One general rule beat four targeted builds on breadth per line of code.

26. **FULL STANDALONE RE-SWEEP on the shipped engine — TRUE LIBRARY COMPLETE ≈ 266.**
    All **382** standalone-`.bel` targets the merged ledger calls non-COMPLETE, native,
    40 steps / 60s. **12 COMPLETE**, folded into
    `results/corpus/library.native-merged-20260729.jsonl`. Residue: 174 no-move, 65
    no-totality, 44 cancelled@60s, 43 coinductive, 39 step-bound, 5 search-bound.

    **Attribution, checked and NOT assumed:** 6 of the 12 are this session's
    (`determinacy` ×3, `exTRel`, `exTRel'`, `closed`). The other 6 are the
    `howe`/`howe-total` pair `ev_val`/`ev_value`/`sim_howe` — I read their proofs and
    they use plain intro/split/synth with NONE of this session's moves, so they are
    pre-existing recoveries the 07-28 sweep missed because it EXCLUDED coinductive
    developments. Newly recorded, not claimed.

    **Session total, all toggle- or proof-verified: +12** — `determinacy` ×3,
    `inl_sn`, `inr_sn`, `app_snb` ×2, `app_sna` ×2, `exTRel`, `exTRel'`, `closed`.
    Ledger 199 (frozen) → **266** measured, of which +12 is engine work this session and
    the rest was already true and unrecorded.

27. **THE DEEPEST-HOLE CENSUS on the shipped engine, and two general post-passes —
    one shipped, two reverted. The DISCRIMINATOR is what to carry forward.**

    Ran the divergence prober over a 34-target sample of the no-move residue (one per
    program, 48 programs) and aggregated the checker's objection at the DEEPEST hole
    reached — not the root the search backtracked to:

    | n | objection |
    |---|---|
    | 269 | `Type-checking error.` (generic) |
    | ~220 | **`Expected <name> to be a program constant or constructor`** (`h` 140, `M` 32, `g` 20, `A` 18, `E1` 10) |
    | ~115 | **`Identifier <name> is unbound`** (`g` 73, `N1` 32, `g1` 10) |
    | 44 | `Expected an LF term-level constant.` |
    | 18 | `Ill-typed expression.` |

    Move kinds present at that hole: fill 31, split 18, recurse 10, lemma 10, invert 7 —
    the vocabulary is rich, so this is generation QUALITY, not missing moves.

    **⛔ THE DISCRIMINATOR FOR A GENERAL POST-PASS: does it change the candidate COUNT?**
    Two were tried on the same day with the same predicate quality and opposite results:
    - **Inferred-index variants (entry 25) — SHIPPED.** Adds ONE variant per
      APPLICATION-shaped move. +1 measured, 0 losses, and a 19× speedup on `closed`.
    - **Unwritable-context variants — REVERTED, instant loss.** Adds a variant to EVERY
      move kind. `equal#exTRel` COMPLETE[47 checks] → STUCK[645] on the first smoke test.
    - **Unwritable-context REWRITE (bounded, in place, no count change) — REVERTED,
      measured INERT.** Canary identical; 0 gain / 0 loss / 4,996 → 4,988 checks on the
      60-target broad sample.

    So: a post-pass bounded by application SITES is safe; one that fires on nearly every
    move is not, however sound its predicate. Reasoning left at both code sites.

    **⭐ AND THE INERT RESULT IS THE USEFUL ONE.** If those ~115 `Identifier <name> is
    unbound` rejections were unwritable CONTEXTS, the rewrite would have moved the check
    count. It did not. `N1` is uppercase and `g1` is report-shaped, so that mass is the
    engine citing **CHECKER-INVENTED METAVARIABLE names absent from source** — exactly
    what `inventedReportNames` / `sourceWritableNames` guard for SYNTH fact admission
    (Phase F.7) and nothing else. **Aim the next attempt at the META side, in the
    split/lemma/recurse emitters, not the context side.** The `Expected <name> to be a
    program constant` row (~220) is its sibling: a meta-context entry used BARE in a
    computation-level argument slot, which is refusable with certainty from our own
    model — a sound PREFILTER (removes candidates, so bounded by construction).

28. **⭐ LEXICAL GUARD #3 — bare META NAMES at computation level. −18.6% checks
    corpus-wide, zero risk.** Straight off entry 27's census: the second-largest
    objection (~220: `h` 140, `M` 32, `g` 20, `A` 18, `E1` 10) is
    `Expected <name> to be a program constant or constructor` — a meta-context entry
    (context variable or LF metavariable) written BARE in a computation-level argument
    slot. That is the exact sibling of guard #2, which already covers `#p`/`$S`: a meta
    object may be cited inside a box or bound in a binder list, never bare at comp
    level. `hole.meta` is the CHECKER's own meta context, so a name in it that is not
    also a computation binding can never head a comp argument — sound by construction.
    Fails OPEN with no meta context; never judges `split`/`intro` (binding occurrences).

    **MEASURED on the 60-target broad sample: checks 4,996 → 4,069 (−18.6%), 0 gains,
    0 losses.** Canaries got cheaper with identical proofs (`exTRel` 47 → 33 checks,
    `exTRel'` 31 → 24, `determinacy` unchanged at 73). **Gates: suite 203/203,
    differential 199/199.** Pinned with 13 contract cases in `test-prover-prefilter`
    (reject + legal-and-must-pass, plus the fail-open and never-judge-a-split rules).

    **It buys SPEED, not corpus % — verified, not assumed.** Re-ran the 88
    budget-limited standalone targets (TIMEOUT / step-bound / search-bound) with the
    18.6%-cheaper search: **0 conversions**. Those targets wander; they do not narrowly
    miss, so a constant-factor saving cannot flip them. This is the S3 finding holding
    exactly as recorded — and it is why the prefilter is banked against the sprint
    contract's quick+reliable half and NOT against its corpus-% half.

29. **Guard #4 (checker-invented names) — TRIED, REVERTED BY A SOUNDNESS PIN.**
    The census's third row (~115: `Identifier <name> is unbound`, `g` 73, `N1` 32,
    `g1` 10) is the engine citing metavariables the hole report reconstructed but the
    SOURCE never binds. Phase F.7 keeps those out of SYNTH's fact pool; the
    fill/lemma/recurse emitters had no guard (all three helpers —
    `inventedReportNames`, `sourceWritableNames`, `textReferencesNames` — were imported
    into prover-candidates and UNUSED). Rejecting any move citing one measured −1.3%
    checks, 0 gains, 0 losses, all canaries clean.

    **It FAILED the existing pin** "trustScope passes uppercase args bound as comp-vars
    (soundness — no false prune)". Cause: `sourceWritableNames` measures SOURCE binding,
    so a name legitimately in scope via the engine's OWN emitted text — or any hole whose
    source position will not resolve — reads as invented and the candidate is wrongly
    pruned. That is the same unsound direction S3 recorded when a meta-only prune cut
    `trans` 544 → 343 by dropping valid in-scope names. Reverted; reasoning at the code
    site. **A correct version needs a scope notion unioning source bindings with the
    engine's emitted binders — not `sourceWritableNames` alone.**

    **The pin did its job.** It was written by an earlier session against exactly this
    mistake, and it caught a change whose every empirical signal (canaries, check count,
    zero losses) said ship. Numbers do not detect unsoundness; pins do.

30. **THE GENERIC `Type-checking error.` ROW, SUB-CLASSIFIED — and it is NOT a defect
    class. The census instrument is now exhausted.** It was the largest row (269) and
    the plan flagged it as "needs sub-classification before it is actionable". Done:
    dumped every candidate the engine submits for four no-move targets
    (`exTRelV`, `cc#lookup`, `algeq-simplified#thm`, `normeval#nsubst`), re-ran the
    checker on each, and bucketed the DETAIL lines the engine never records (it stores
    only the headline). Result:

    | n | detail |
    |---|---|
    | 12 | `Expected type: [?g ⊢ algeq (?M) (?N)]` … genuine INDEX mismatch |
    | 8 | `Expected type: TRel [?g ⊢ ?#q] [?h ⊢ ?#p.1]` … genuine index mismatch |
    | 5 | `Expected type: Log [_ ⊢ (M1[$S1] sim M2[$S2])]` … genuine index mismatch |
    | 5 | **`Found box-expression but expected expression of type {T1 : ( ⊢ tp)} NeutVar …`** |
    | 2 | `Expected Crel [?l, X1 : term] [?h]` vs `Inferred Crel …` — index mismatch |
    | 2 | **`Expected [h ⊢ neut S[]]` vs `Inferred [g ⊢ neut S[]]`** — right type, WRONG CONTEXT |

    **~90% of it is genuine semantic index mismatch** — the candidate has the right
    family and the wrong indices. No lexical or structural rule can refuse those; only
    knowing the types can. **This CONFIRMS the S3 finding at the level of individual
    error details rather than headline counts: the remaining mass needs model-side LF
    type inference, and that is a real build, not a guard.**

    Two small structural slivers remain, both already-known laws in new emitters, and
    both too small to stake on their own (6 and 2 occurrences across four targets):
    a BOX emitted where a Pi-typed comp expression is expected (the M3/M4 boxed-vs-bare
    rule), and a hypothesis cited from context `g` where `h` is required (needs
    weakening/substitution, not a spelling fix).

    **Disposition of the whole census (entries 27–30):** row 2 (bare meta names, ~220)
    → SHIPPED as guard #3, −18.6% checks. Row 3 (unbound identifiers, ~115) → tried
    twice, reverted twice; needs a scope notion unioning source bindings with the
    engine's emitted binders. Row 1 (generic, 269) → NOT actionable without type
    inference. **The reject-census instrument has now given everything it can for this
    residue; the next real lever is the type-inference build, and it should be scoped as
    such rather than approached with another guard.**

31. **FIRST RUNG OF THE TYPE-INFERENCE LEVER — `rigidIndexConflict`. Sound, shipped,
    and MARGINAL, which is itself the finding.** Entry 30 said the remaining mass needs
    model-side type inference. Its cheapest sound rung: the prefilter compares the
    constructor's result FAMILY against the goal's (rule 1) but never its INDEX heads.
    `rigidIndexConflict` (hole-split, exported) answers only "provably not unifiable" —
    both index heads RIGID (a declared lowercase constructor/family) and DIFFERENT —
    and passes on every doubt: flexible head, arity difference, substitution,
    projection, box, lambda, unknown head. Deliberately weaker than the existing
    `matchIndices`/`unifyIndices`, which compare whole token spines and would
    false-prune (the split-side unifier is already on record as having been
    OVER-strict). Wired as prefilter rule (1b).

    **MEASURED: checks 4,069 → 4,038 (−0.8%) on the broad 60-target sample, 0 gains,
    0 losses.** Canaries unchanged (`exTRel` 33, `closed` 27, `determinacy` 73).
    **Gates: suite 203/203, differential 199/199, existing prefilter pins green
    (including the `eq_app D1 D2` no-false-prune case).** KEPT — sound, subtractive,
    zero-risk — but banked at its real size, which is ~nothing.

    **⭐ WHY IT IS MARGINAL, AND WHAT THAT SAYS ABOUT THE LEVER.** A constructor's
    result indices are almost always PATTERNS with flexible heads (`eq (app A B) …`),
    so a rigid-rigid head clash is rare. The census's ~90% index mismatch is between a
    FLEXIBLE pattern and a concrete goal — resolvable only by accumulating a
    SUBSTITUTION from the arguments' own types and checking it against the goal, not by
    comparing heads. **So the type-inference lever cannot be climbed in conservative
    rungs: the cheap sound fraction is already spent (rules 1, 1b, 2, guards #1–#3) and
    what remains needs the real thing** — unify each declared argument type against the
    actual argument's type, accumulate θ, apply θ to the result indices, compare. That
    is a genuine build whose known failure mode is over-strictness, so it needs the
    no-false-prune pins extended FIRST and a differential per increment. Scope it as a
    build; do not approach it with another guard.

32. **⛔⛔ THE PREFILTER IS THE WRONG AXIS — a structural finding that redirects the
    whole "type-level pruning" direction.** Built the θ-accumulating index check
    (`ctorSubstIndexConflict`, hole-split, exported): match each declared argument type
    against the argument's REAL type to bind the constructor's pattern variables, apply
    θ to the result indices, then verdict via `rigidIndexConflict`. Bindings are
    best-effort (a slot that does not match contributes nothing), an inconsistently bound
    variable is NOT treated as a conflict, and the verdict is still rigid-vs-rigid only —
    so θ can only turn a flexible position concrete, never widen suspicion into a
    rejection. It DEMONSTRABLY works: pinned in `test-prover-prefilter` where `eq_app`
    against `eq unit unit` is refused ONLY after substitution, while the well-typed
    `eq_app` and every unknown/flexible case pass.

    **On the corpus it moved the check count by EXACTLY ZERO** (4,038 → 4,038, broad
    60-target sample). Cause, confirmed in the code rather than guessed:

    ```
    movePrefilterOk:  if (!mv || mv.kind !== 'fill') return true;
                      if (/\?/.test(t))              return true;   // open fill
                      if (/let|\|=>/.test(t))    return true;   // call/binder form
                      if (!decomposeContextual(t))   return true;   // bare ctype app
    ```

    **Rule (2)'s ENTIRE machinery — the family check, the scope check, rule (1b), and
    this one — only ever sees a CLOSING, BOXED, `let`-free LF constructor fill.** The
    residue's rejections are dominated by `let`-bound lemma/recurse CALLS and bare
    COMP-level ctype applications (`TRel …`, `Log …`, `Decl …`, `NeutVar …` in the entry-30
    detail census) — every one of which exits at a gate before any rule runs.

    **So further type-level pruning must NOT be added to `movePrefilterOk`.** The cheap
    sound fraction for closing LF fills is fully spent (rules 1, 1b, 2, guards #1–#3);
    the mass lives in comp-level applications, and judging those needs the check to run
    where those candidates are GENERATED (synthMoves / recurseTexts / the lemma emitters)
    or at a new comp-application judging site — with its own no-false-prune pins.
    `ctorSubstIndexConflict` is kept exported and pinned as scaffolding for that build;
    its wiring into the prefilter is reverted with this reasoning at the call site.

    **Cumulative speed for the session stands at −19.2%** (4,996 → 4,038 checks on the
    broad sample): guard #3 (−18.6%) plus rule (1b) (−0.8%). Suite 203/203,
    differential 199/199.

33. **THE REACH CHECK — the instrument that should gate every prefilter idea from now
    on — and a comp-level family check that failed it after the fact.**

    Entry 32 said the prefilter is structurally blind to most candidates. Quantified it
    before building anything: over the no-move residue, of **371 rejected candidates,
    283 (76%) are bare COMP applications** and only **34 (9%)** are the closing boxed
    fills rule (2) can see (34 let-bound calls, 20 other). So the blindness is real and
    large — the reach check is now the cheap first question for any prefilter work:
    *does this site even receive the candidates I am aiming at?*

    Built the obvious thing at a site the gates do not block: for `f a1 … an` with `f` a
    declared theorem (`theoremIndex`, memoized), compare each BARE argument's family
    against the declared family of the premise it fills — rule (2)(c)'s standard, one
    level out. **Measured 4,038 → 4,038 checks: EXACTLY ZERO.** Reverted.

    **Why it failed even with the reach:** the emitters that PRODUCE those candidates
    (`candsFor` in recurseTexts, `helperLemmaTexts`) already select arguments BY FAMILY,
    so a family mismatch is essentially never what the checker objects to. Reach was
    necessary and not sufficient — the check also has to target the objection the census
    actually recorded, which at comp level is INDEX mismatch (entry 30), needing θ over
    comp premises rather than families.

    **⚠️ AND A MEASUREMENT-HYGIENE CORRECTION worth more than the mechanism.**
    `poplmark-reloaded+#inl_sn` went 143 → 234 checks in the same window and I first
    recorded it against this change. It PERSISTS after the revert — it belongs to the
    guard-#3 / rule-1b prefilters. A subtractive filter still changes the PATH: dropping
    a candidate the search used to accept can send it down a longer route. **Attribute a
    cost move by re-measuring with the change removed, never by adjacency in time.**
    Both corrections live at the code site.

    **Standing after this:** cumulative speed −19.2% (4,996 → 4,038), suite 203/203,
    differential 199/199, and `ctorSubstIndexConflict` exported + pinned as the starting
    point for the θ-over-comp-premises build, which is the one remaining lever that both
    has reach AND targets the measured objection.

34. **θ OVER COMP PREMISES — shipped as (0d); the CTYPE-CONSTRUCTOR twin reverted.
    THE PREFILTER AXIS IS NOW CLOSED, with the gate census that closes it.**

    `compAppIndexConflict` (hole-split, exported + smoke-pinned): for `f a1 … an` with
    `f` a declared theorem, bind the theorem's variables by matching each declared
    PREMISE's index patterns against the argument's real type, apply θ to the CONCLUSION
    indices, verdict via `rigidIndexConflict`. Same discipline as the ctor twin —
    best-effort bindings, rigid-vs-rigid verdicts only. **Gates: suite 203/203,
    differential 199/199.**

    **A WIRING BUG worth the entry on its own.** The first cut looked up each argument in
    the hole's scope BY ITS WHOLE TEXT — but real candidates spell arguments BOXED
    (`[g ⊢ X1]`), so every lookup missed, `actual` was always empty, and the check could
    never fire. It measured a clean zero and looked like a dead idea. Extracting the
    inner citation fixed it: `equal#exTRelV` 22 → 18 checks. **A "measured zero" from a
    mechanism that cannot physically fire is not evidence about the IDEA — instrument
    the gates before concluding.**

    **The ctype-constructor twin: REVERTED, inert.** A gate census showed the heads
    reaching that site are a theorem ONCE and a ctype constructor everywhere else
    (`ExWkV/c X[]`, `LogBase X`), so wiring `ctorSubstIndexConflict` there looked like
    the dominant case. A/B by env toggle on the 32 ctype-heavy targets: **2,587 → 2,587
    checks, check-count changed on ZERO targets.** `exTRelV`'s 22 → 18 in the same window
    belongs to the boxed-argument fix above — confirmed 18 in BOTH arms, not assumed.

    **⛔ CLOSING THE AXIS.** Six mechanisms were tried on candidate pruning this
    session; the score is guard #3 (−18.6%), rule (1b) (−0.8%), (0d) (fires, unmeasurable
    on the samples), and three reverts. Each zero eliminated a specific hypothesis, and
    together they say the same thing: **every cheap SOUND prune has been found.** What
    the checker still objects to needs index-level unification through substitutions and
    contexts — precisely what the conservative rules refuse to judge, and they refuse for
    good reason (the over-strict split unifier, and the soundness pin that caught guard
    #4). **Do not open a seventh prefilter front.** The remaining levers are MOVE
    GENERATION (the +12 this session all came from missing or mis-spelled moves, never
    from pruning) and, if pruning is ever revisited, a real bidirectional type
    reconstruction over our model — a build measured in weeks, not a guard.

35. **RELAXING THE ASCRIPTION'S FIRST-MOVE LIMITER — tried, REVERTED, and the limiter
    turns out to be the mechanism's load-bearing part.** The `exTRelV` trace is
    unambiguous that its ARMS need the type ascription one level in
    (`let Crel_xa (cr' : Crel [l0] [h0]) = cr in`), and entry 23 confines the move to a
    hole with no enclosing case. Relaxing that to any hole is the obvious next step and
    it is WRONG:

    - **It orbits.** The move re-binds a name to ITSELF, so the path-scoped
      already-ascribed check misses its own earlier emission: `exTRelV` accepted
      `let (X1 : Crel [l] [h]) = X1 in` repeatedly, 6 steps then backtracked to 0. A
      decl-prefix scan kills the orbit (62 → 27 checks) but not the cost.
    - **A/B on the 32-target class: 0 gains, 0 losses, checks 2,587 → 2,880 (+11%), 13
      targets dearer against 2 cheaper.** Reverted to the exact gated state (`exTRel`
      back to 33 checks).

    **The lesson is about the limiter, not the move.** Position is what keeps this to ONE
    candidate per theorem instead of one per hypothesis per hole — the same
    bounded-vs-blanket discriminator that decided the general post-passes (entry 27). A
    limiter that looks like an arbitrary restriction can be the only thing making a
    mechanism affordable; check its cost contribution before widening it.

    **`exTRelV` remains the honest open case for this family:** it needs the ascription
    inside an arm AND something that makes the resulting search converge. The move is
    available in principle; making it affordable there is the unsolved part.

36. **⭐ LEXICOGRAPHIC MEASURES WERE MIS-PARSED — a real model-fidelity defect, found
    by re-running the audit that has the best track record here.** After the pruning axis
    closed (entry 34), went back to model fidelity — the axis that produced +4 (Wave 1)
    and +3 (Wave 5, `parseTotality`'s parenthesised form). Audited `parseTotality`
    against every ACTIVE pragma in the corpus: **504 decls, and the buckets are clean
    (424 named, 60 bare, 10 index)** — except one:

    **`/ total {sn0 sn1 sn2} (match_sn … sn0 sn1 sn2) /` parsed as
    `{kind:'named', name:'{sn0 sn1 sn2}'}`** — the whole brace group kept as the measure
    NAME. No argument is ever called that, so `measureDesignation`'s
    `args.lastIndexOf(name)` missed and fell back to `args.length - 1`: **the engine
    believed `sn2` was the decreasing argument.** The references decrease `sn0`, or hold
    it equal and decrease `sn1`; none decrease `sn2` — so every IH call generated for
    this family targeted the wrong component. 10 decls: the whole poplmark SN
    lexicographic set (`match_sn`, `casel_sn`, `caser_sn`, `bc_aux_sum`, `bc_aux_app`,
    `app_sn`, `app_abs_sn`, `bc_aux`) plus `small-step/system-f-iso`.

    Fixed: a brace group resolves to its PRIMARY (first) component, with the full
    ordering kept as `totality.lex` for whoever implements the real lexicographic
    reading (a call may hold `sn0` equal and decrease `sn1` — currently unmodelled).
    **Gates: suite 203/203, differential 199/199.**

    **⚠️ YIELD IS UNMEASURED, AND THE A/B WAS VOID — say it plainly.** All 12 class
    members CANCELLED at the 240s cap in BOTH arms (and 2 could not even be masked:
    `prog_@_lemma`'s `@` defeats the harness), so the run produced 12 rows of no-signal,
    not a result. One long-cap probe for a real datapoint:
    `poplmark-reloaded#app_sn` at 900s → still **no-move, 3,755 checks, 422s**. So the
    family is far from closing and this fix alone does not move it. KEPT on correctness
    grounds only — the engine no longer holds a provably wrong belief about which
    argument decreases — and explicitly NOT banked.

    **Two instrument notes for next time:** a class whose every member exceeds the cap
    cannot be A/B'd at that cap — check that the baseline arm produces signal BEFORE
    running the second arm; and `maskByName` fails on identifiers containing `@`.

37. **TWO MISSING MOVES for the all-CTYPE theorem shape, PLUS the parenthesisation
    bug that was masking both. +3 measured and counting.** Traced `equal/alg-equal-datatypes#trans`
    (`Aeq [g⊢E] [g⊢F] → Aeq [g⊢F] [g⊢L] → Aeq [g⊢E] [g⊢L]`, the pattern that has the
    best track record: find the move the reference makes that the engine never offers).
    At its deepest hole the vocabulary was **fill+split only** — no recurse, no invert:

    (a) **CTYPE INVERSION — the one-arm case, `let Ae_a d1 d2 = d in`.** When the
    hypothesis' OWN indices leave exactly one constructor possible, the corpus writes a
    `let`, not a case. The engine had the full ctype SPLIT (every constructor) and LF
    inversion, but nothing for a DETERMINED ctype hypothesis. Selection reuses
    `rigidIndexConflict`; emitted only when exactly one of several constructors survives,
    ranked with the inverts. Two soundness rules had to be added to make it see anything:
    **unwrap a BOX before reading an index head** (ctype indices ARE boxes — without this
    the whole function was inert for every ctype family), and **a PARAMETER-variable
    index cannot be a constructor application** (`Ae_v : Aeq [g⊢#p] [g⊢#p]` is the
    commonest ctype ctor; a parameter ranges over context VARIABLES, never over an
    application).

    (b) **ALL-CTYPE RECURSION.** `recurseTexts`' first line filters premises to
    `kind === 'box'`, so a theorem whose argument premises are ALL ctype fell through to
    `piRecurseTexts`, which needs a Pi binder to pick a decreasing subject — with none it
    bails and **the theorem gets no recursion at all**. This is the M1b rule ("a ctype
    premise IS a premise") reaching the last emitter that still filtered to boxes.
    Arguments spelled BARE (M3/M4); the decreasing slot restricted to
    `decSubderivNames`, so no call is proposed that the checker would refuse for
    termination.

    **MEASURED: 0 completions** on 57 ctype-development residue targets. **Gates: suite
    203/203, differential 199/199 for each.** What DID change is structural and visible
    in the traces: the deepest hole's vocabulary went `fill,split` →
    `fill,invert,recurse,split`, and `equal/alg-equal-ctxrel#trans` went
    **no-move → step-bound with 20 accepted steps**. The remaining gap is ORDER, not
    vocabulary: `trans` needs split → invert X1 → recurse on the inverted parts, and the
    recursion is offered but rejected because its argument still names the un-inverted
    hypothesis (`let R = trans X2 X in`). All three moves now exist; the search does not
    sequence them.

    **KEPT** (zero-regression, and refusing a move the fragment needs bakes a deterrent
    in), **reported as unpaid.** The next question for this family is a search/ordering
    one — get the invert to precede the recurse that depends on it — not another move.

38. **⭐⭐ THE NESTED-CASE PARENTHESISATION BUG — a one-line predicate that was voiding
    every ctype split nested inside a ctype arm.** Entry 37's two new moves measured 0,
    and the reason was neither move: hand-checking the reference shape showed BOTH
    one-arm inversions and the full `trans` proof are ACCEPTED by the checker, so the
    moves were right and something else broke them.

    A nested `case` MUST be parenthesised or the OUTER case's remaining arms parse as
    arms of the INNER one. The engine decides that with `splitDone`, which keys on
    `branchPatternBox` — and that requires a `[…]`-BRACKETED arm line. **A ctype arm
    (`| Ae_a X2 X3 =>`) is a bare constructor pattern, so it never matched**, and every
    ctype split emitted inside a ctype arm went out unparenthesised. Caught in the
    candidate dump for `equal#trans`: the inner `case X1 of` had swallowed the outer
    `| Ae_l X4 =>` arm, and the resulting type error looked like the inversion's fault.
    Fixed by treating any decl-scoped OPEN case as nesting.

    **This is why entries 23/24/37 all measured ~0 in this family** — the moves were
    being generated correctly and destroyed on the way out. Chasing the mechanism rather
    than the emitted TEXT cost several passes; the candidate dump answered it in one.

    **MEASURED, full 253-target ctype residue: 3 COMPLETE** — `equal#trans`
    no-move → COMPLETE[7 steps, 203 checks], `logrel/algeq-simplified#lookup` [30ck] and
    `algeq-simplified1#lookup` [31ck]. All three were non-COMPLETE in the merged ledger;
    all three are quick. **Gates: suite 203/203, differential 199/199.**

    **The cost, stated:** the residue's step-bound count rose to 60 of 253. The new
    vocabulary opens searches that do not close — the same debit the accessibility build
    took (entry 19). Worth it at +3 with zero regressions, but it is the reason the next
    work in this family is SEARCH ORDER, not more moves.

    **A differential-flake note:** the first post-fix differential reported 4
    HARNESS-ERRORs (`ceq_main`, `addProjs`, `small-step#unique`, `unique3`). All four
    COMPLETE when run individually, and a clean re-run returned 199/199. A HARNESS-ERROR
    is not a verdict — re-run before treating one as a regression.

39. **SEARCH ORDER for the ctype family — first attempt, REVERTED, and it narrows the
    problem usefully.** Entry 38 left the family needing ORDER, not vocabulary:
    `trans`-shaped proofs must invert before the recursion that consumes the inversion's
    output, and `recurses` rank ahead of `invertsMarked`. Ranking inverts first is the
    same focusing argument the code already makes for invert-before-split, one step
    further — an inversion is deterministic and information-preserving, a recursion
    commits to a call.

    **Measured: 0 gains, 0 losses, checks 4,038 → 5,470 (+35%) on the broad sample**,
    10 targets changed. Reverted.

    **The informative part is WHERE it did nothing.** The three ctype targets it was
    aimed at came out BYTE-IDENTICAL either way (`alg-equal-ctxrel#trans` 233,
    `alg-equal-datatypes#trans` 203, `ceq` 1233) — so at their deciding holes the invert
    was never competing with the recurse for rank at all. The ordering is not what stops
    them, and the +35% elsewhere says recursion earns its position by being the CLOSING
    move far more often than it is a wasted commitment.

    **So the remaining `trans`/`ceq` gap is NOT global rank.** They reach 18–22 accepted
    steps and run out of budget, which points at per-path search behaviour (what gets
    accepted then backtracked over) rather than the candidate order at a single hole.
    Next probe should be the DECISION TREE — which acceptances are later abandoned — not
    another rank permutation.

40. **⭐ THE DECREASING SLOT WAS MIS-RESOLVED FOR MIXED ctype+box THEOREMS — a real
    model-fidelity defect, plus two mechanisms around it that measured ZERO.**
    (2026-07-31.) Followed the mass: the residue audit's biggest tractable class is
    `STUCK:no-move` SMALL (79) + MEDIUM (73), spread over ~25 developments — not one
    shape replicated. Reading the references, a recurring idiom is *split a ctype, then
    rebuild it one binder deeper* (`M_dot (weaken σ) [h, x:target _ ⊢ M[..]]`).

    **(a) The weakening SPELLING — built, sound, UNPAID.** A metavariable `X : [Ψ ⊢ A]`
    used inside a box whose context extends Ψ must carry the weakening substitution.
    Bare `X` is not merely unlikely, it is a hard checker error — verified natively on
    `cpp13/cc.bel#weaken`: *"Ill-typed substitution. Does not take context: h to context:
    h, x : target _"*, while `X[..]` type-checks. Added at the two sites that spell a
    meta into a box (`fillCandidates` axiom rule; `argFillChoices`' boxed ctor argument),
    APPENDED after the bare spelling so candidate order is untouched. Pinned in
    `test-hole-split.mjs` (offered when the context extends; absent when contexts agree;
    bare still leads). **MEASURED on the 24 residue targets whose reference proofs
    contain exactly this idiom: 0 completions, 0 losses, 23 of 24 byte-identical,
    +9 checks on one.** A text census said 24 NEED it; the search REACHES the site in
    one. That is [[feedback-size-classes-by-toggle]] again, at 24×.

    **(b) ⛔ A COMP variable can never be weakened into a box — tried, reverted, do not
    re-add.** The obvious extension of (a) to `hole.ctx` is ill-formed by construction: a
    comp variable of boxed type is a computation VALUE, and `[Ψ, x:B ⊢ c[..]]` earns
    *"Expected an LF term-level constant"* (measured on `popl12/nbe.bel#weak_neut`). Such
    a hypothesis must be UNBOXED first (`let [Ψ ⊢ R] = c in`); then R is a meta and (a)
    applies. The revert is commented at the code site.

    **(c) ⭐ THE REAL DEFECT — `decreasingArgIndex` was short one position per implicit
    CONTEXT binder.** `weak_neut : (g:ctx)(h:ctx) Extends [g] [h] → [g ⊢ neut A[]] →
    [h ⊢ neut A[]]` with `/ total e (weak_neut g h a e r) /` resolved its decreasing slot
    to **1 (the box `r`)** instead of **0 (the ctype `e`)**. With no eligible
    sub-derivation of `r`, the theorem got **no induction hypothesis at all** — its trace
    offered fill/intro/invert/split/synth and never one recurse. Two compensating errors
    were hiding it: `implicitMetaCount` COUNTS a ctype premise's application head
    (`Extends`) as an implicit meta, while `decreasingArgIndex` subtracted only `pi`
    premises and NOT the `ctx` binders — the twin `measureDesignation` subtracts its whole
    `nonBox`, which does include them. The two cancel exactly when #distinct-ctype-heads
    == #ctx-binders, which is why all-ctype theorems resolved correctly and mixed ones did
    not. Fixed both halves together (skip the ctype head; subtract `ctxs.length`).
    **Blast radius measured offline over every corpus theorem: 5 of 273 change slot**, and
    all five were hand-verified as CORRECTIONS — `nbe#weak_neut` 1→0, `nbe#weaken` 1→0,
    `algeq-simplified{,1}#thm` 1→0 (the measure `d` is the first premise, `fn d`), and
    `howe-total#howe_subst` 0→1 (the measure `hr` is the LAST argument, `Howe_subst`).
    **⚠️ The spine model is still only approximate** — a CONCLUSION's family head is
    counted as an implicit meta and `$`-substitution variables are not counted; on
    `howe_subst` those two errors cancel. It is more correct than before, not correct.

    **(d) MIXED ctype+box RECURSION — built, KEPT, UNPAID.** `recurseTexts`' all-ctype
    branch (entry 37b) is gated on `!boxes.length`, so a ctype-decreasing theorem that
    also carries box premises reached neither emitter. Added the mixed branch (decreasing
    slot restricted to `decSubderivNames`; ctype args bare per M3/M4; box slots from
    comp-context hyps; result unboxed via `resultBoxFor` so a later fill can weaken it).
    `weak_neut` now offers exactly the reference's move, `let [h ⊢ R1] = weak_neut X2 X1
    in`, and goes **no-move[152 checks] → step-bound[10 steps, 574 checks]**.
    **MEASURED on the 12-target mixed class: 0 completions, 0 losses**, one row changed
    (weak_neut), everything else byte-identical. Kept under entry 37's precedent — a
    theorem that had NO IH now has one, and refusing a move the fragment needs bakes a
    deterrent in — but banked as UNPAID, not a win.

    **GATES: suite 202/203, differential `--ref library.jsonl` 199/199 (zero regressions)
    for the whole slice.** The one suite failure is `test-project-chaos.mjs`, which
    imports only cfg-lint/persist/project-source and no prover code — pre-existing in the
    working tree, unrelated to this slice.

    **⚠️ TWO HARNESS LESSONS, both of which nearly produced a false verdict.**
    (1) ✅ **FIXED 2026-08-06 — see entry 48; the text below is the historical record.**
    ~~`npm run prover:diff` DEFAULTS to `--ref library.20260715.jsonl` (183 targets),
    NOT the frozen `library.jsonl` (199) the laws name — pass `--ref` explicitly or the
    gate silently measures a different, older baseline.~~ The default is now the frozen
    `library.jsonl` and every run prints its baseline; `npm run prover:diff` is correct
    bare. (2) ⚠️ **STILL LIVE.** A `CANCELLED` is not a
    verdict. The A/B's ON arm reported `algeq-typing#thm` step-bound[352] → CANCELLED and
    it looked like a real 2× cost regression; re-run uncontended, **both arms are
    identical (352 checks, ~82s)** — it was CPU contention from a differential running
    concurrently. Entry 38's "re-run before treating a HARNESS-ERROR as a regression"
    extends to CANCELLED, and A/B arms must not share the machine with a sweep.

    **WHERE THIS LEAVES THE CLASS.** `weak_neut` still does not close: it now has the
    recursion and the weakening spelling, and wanders at 10 accepted steps. The reference
    is two moves — `let [h ⊢ R] = weak_neut e' r in` then `[h, x:neut _ ⊢ R[..]]` — so
    the remaining gap is the same per-path search question entry 39 isolated, now reached
    by a second family. The `cc.bel#weaken` shape needs one more thing neither mechanism
    supplies: the planner (`synthesize`) compares box contexts LITERALLY, so a fact
    `[h ⊢ A]` can never match a ctor argument `[h, x:B ⊢ A]` and `M_dot ? ?` is never
    proposed at all. **Teaching the PLANNER that LF weakening is admissible is the named
    next slice** — it is the one change that would supply the missing ctor-application
    and the inline recursion together. Sized but NOT built: do not start it without an
    A/B toggle on ~10 members first.

41. **THE `weaken`/`M_dot` SHAPE, LOCALIZED EXACTLY — and one hypothesis killed by the
    checker before any code was written.** (2026-07-31, follow-on to entry 40.) Chased
    entry 40's named next slice and found the planner ALREADY implements weakening — but
    it can never reach this family, for a reason worth writing down.

    **(a) The planner is SINGLE-CONTEXT by construction.** `synthesize` boxes every fact
    and goal in ONE ambient context (`const box = inner => `[${goal.ctx} |- ${inner}]``),
    and `pushFact` forces each fact into that context: a fact whose context is a strict
    PREFIX of the goal's already gets `weaken: true` (spelled `X[..]`, spec §2/D7 — and a
    `viaComp` fact is correctly DROPPED there, independently confirming entry 40b). But at
    a **CTYPE goal** the ambient context is EMPTY (`goal = { ctx: '', … }`), so a boxed
    fact's own context becomes an unparseable "extra" and the fact is **discarded from the
    planning domain entirely**. Instrumented on `cc.bel#weaken`: `DROP X2 : [h1 ⊢ target
    S1[]] ctx=[h1] goalParts=[]`. That is why `M_dot ? ?` is never proposed — the box
    argument's inhabitant is not in the fact pool at all. The debug hook
    (`globalThis.__factDropDebug`, no-op by default) is left at the drop site.

    **(b) hole-split's ctype path does not cover it either.** For a `compFamily` goal
    `fillCandidates` offers nullary constructors and the higher-order `mlam` skeleton
    (3b, gated on `sawHO`); the general ctype-constructor application over in-scope
    arguments comes ONLY from the planner. `synthesizeFills` is `push(box(term))` — LF
    goals only. So neither emitter can build `M_dot _ _`.

    **(c) ⛔ "ANNOTATE THE LET" IS DEAD — killed by the checker, do not re-derive.** The
    obvious composition is `let R = weaken σ' in M_dot R […]`, which the engine already
    proposes and the checker already rejects (*"Leftover meta-variables… provide a type
    annotation"*). The natural repair is an ascribed let. **It does not work**: tried
    `let (r : Map [h, x:target _] [g]) = weaken sigma' in …` with the context spelled
    `g`, `g1` and `_` — all three fail with *"…requires that some metavariables are
    further restricted"*. `weaken`'s result implicit `S` is fixed only by the
    CONTINUATION, so no ascription at the binding site can pin it. **The reference's
    INLINE form `M_dot (weaken σ') [h, x:target _ ⊢ M[..]]` is not stylistic — it is the
    only well-typed spelling**, because the constructor's argument position is what
    determines the implicit.

    **THE SLICE THIS DEFINES (sized, not built).** The family needs ONE composite move:
    a ctype-constructor application at a ctype goal whose argument slots may take (i) an
    INLINE recursive/lemma call and (ii) a weakened box `[Ψ, x:B ⊢ X[..]]` (entry 40a
    already supplies the spelling, and `argFillChoices` already computes the per-argument
    context `boxedArg.ctx` that the planner cannot). Two candidate homes: extend the
    planner to per-argument contexts (correct, invasive — its single-context assumption is
    load-bearing throughout), or add the general ctype-ctor-application path to
    `fillCandidates`' compFamily branch reusing `argFillChoices` (bounded, but needs an
    inline-IH argument source, which `nestedCtorArgFills` does not provide — it offers
    depth-2 CONSTRUCTOR witnesses only). Prefer the bounded one; A/B toggle on ~10 members
    before building the rest, and note the stake is modest — of entry 40's 24-target
    weakening census only the ctor-argument subset lives here.

42. **⛔⛔ CONTEXTUAL FACTS AT CTYPE GOALS — 40% REACH, ZERO PAYOFF. Built, measured,
    REVERTED, and the most useful lesson of the arc.** (2026-07-31, executes entry 41's
    named slice and kills it.)

    **The stake, declared first.** Entry 41a's drop looked like the best-sized defect on
    the board. Text census: of 532 stuck references, **256 apply a ctype constructor to a
    parenthesised inline call** — 48% of the residue, an order of magnitude above the 15
    that need the full `M_dot` shape. Then, per
    [[feedback-size-classes-by-toggle]], a REACH census rather than a text one: a new
    instrument (`scratch/probes/reach-drop.mjs` + the `__factDropDebug` hook) ran a 40-target
    stride sample and found **16/40 (40%) hit ≥1 ctype-goal fact drop, 160 drops total,
    and 7 of the 16 were STUCK:no-move** — the exact signature of a search exhausting for
    want of a candidate that was thrown away. That is ~24× the reach of entry 40a. Kill
    criterion set before coding: **≥3 of the bench must move, else abandon.**

    **What was built.** (i) Admit a boxed fact at a ctype goal with its FULL boxed
    conclusion and its own per-fact spelling (`[h1 ⊢ X2]` for a cD meta; bare for a comp
    variable, which is already a contextual object); (ii) plumb that spelling through the
    planner's ~6 emission sites, marking such facts "bare" so the caller does not re-box
    them into the empty ambient context; (iii) weakening-aware subgoal matching, so a fact
    `[Ψ ⊢ C]` discharges a subgoal `[Ψ, x:B ⊢ C]` spelled `[Ψ, x:B ⊢ X[..]]` (comp
    variables excluded per entry 40b).

    **MEASURED on the 16 drop-targets, exact A/B: 0 completions, 0 verdict changes, ONE
    row changed at all** (`Normalization_by_Evaluation#eval`, 34 → 27 checks, same
    verdict). The motivating target `cc.bel#weaken` was byte-identical (52 checks) with
    the mechanism fully on. **1 of 16 against a stake of 3 — reverted in full**, restoring
    both spot-checked baselines exactly (52 / 85 checks). Suite green throughout.

    **⭐⭐ THE LESSON — REACH IS NOT PAYOFF, AND A PARTIAL COMPOSITE PAYS EXACTLY ZERO.**
    Every prior law here has been about not trusting a NEED census over a REACH
    measurement. This slice had a genuine 40% reach measurement and still returned
    nothing, because *arriving at the hole is not the same as being able to COMPLETE the
    term*. The family needs a THREE-part composite move — ctype-constructor application
    **+** an INLINE IH/lemma call in one argument slot **+** a weakened box in another —
    and the fix supplied two of the three. A composite move is ATOMIC for measurement
    purposes: two thirds of it is worth the same as none of it. **Before building any
    multi-part move, write the target term out and count the independent pieces the
    engine must supply; if it is more than one, either build all of them behind one
    toggle or do not start.** (Entry 40's mixed recursion is the mirror image: it was ONE
    piece, so it moved its target's verdict immediately.)

    **KEPT from the attempt:** `globalThis.__factDropDebug` at the drop site (a no-op hook
    — it is the instrument that produced the reach number and will size any future
    attempt), plus `scratch/probes/reach-drop.mjs` and `scratch/probes/ctorapp-census.mjs`. The
    drop itself is now documented in code as a KNOWN, MEASURED, NON-PAYING gap.

    **If this family is ever reopened**, the missing third piece is the inline IH
    application at a ctype argument slot — `argFillChoices`' `nestedCtorArgFills` offers
    depth-2 CONSTRUCTOR witnesses only, never a recursive call. And note entry 41c: the
    `let`-then-use spelling is checker-dead, so the call MUST be built inline. All three
    pieces, one toggle, or leave it alone.

43. **⭐ THE PER-SLOT UNDERSCORE — a MIS-EMITTED-TEXT defect in every recursive call
    with object-Pi binders. SHIPPED.** (2026-08-05.) A third confirmation of the ROI law:
    the gain came from text we were emitting wrongly, not from a new move or better search.

    **The defect.** `recurseTexts`' `piPrefixCore` passed every explicit object-Pi binder
    to the recursive call BY ITS SIGNATURE NAME. But a recursive call puts a
    SUB-DERIVATION in the decreasing slot, so every Pi binder occurring in the decreasing
    premise is re-instantiated to a reconstruction-invented term with no source name
    (`X1 : mstep N1 M'` — `N1` is not citable). Naming it is ill-typed. The engine's only
    other spelling underscored EVERYTHING, which is equally wrong: a binder occurring
    only in the CONCLUSION is determined by nothing and reconstruction answers
    "Expression is not closed". **Neither of the two spellings the engine could emit was
    ever well-typed for this shape.**

    **The law now implemented** (derived from the theorem's own type; no name branching):
    *a Pi binder OCCURRING IN THE DECREASING PREMISE is solved from the argument → spell
    `_`; one that does not occur there must be spelled by its in-scope name.* Emitted as
    a variant AHEAD of the named spelling (D3/D11/D14 checker-arbitration), collapsing to
    the old string when nothing is re-instantiated — so all-box theorems are byte-identical.

    Verified against the checker in the ENGINE'S OWN SKELETON before any code
    (`scratch/probes/probe-mixed-slot.mjs`), on `poplmark-reloaded#mstep_appl`:
    | spelling | verdict |
    |---|---|
    | all-named `f [g⊢M] [g⊢M'] [g⊢N] [g⊢X1]` | Ill-typed expression |
    | all-underscore `f [g⊢_] [g⊢_] [g⊢_] [g⊢X1]` | Expression is not closed |
    | **this rule** `f _ _ [g⊢N] [g⊢X1]` | **PASS** |
    | `_` at slot 2 only | Ill-typed (slot 1 still named) |

    **Measured A/B** (`scratch/probes/ab-mixedslot.mjs`, toggle `__proverNoMixedSlot`):
    **4 gains / 0 losses in 11** on a stride sample of the true structural class, across
    THREE developments (`poplmark-reloaded#mstep_appl`, `poplmark-reloaded+#mstep_appl`,
    `poplmark-reloaded+#mstep_inl`, `mini-ml/vsound-explicit#vs`) — the multi-development
    spread is the anti-overfit evidence. Every win also got FASTER: 126→67, 136→67,
    193→67 checks. Cost where it does not close: `mstep_abs` 115→234 (it needs a second
    piece, a higher-order `\x.` closing), `small_to_big` 509→691.

    ⚠️ **SIZING — the text census overstated reach 4×, AGAIN.** A reference-text census
    said 214/552 targets spell a mixed-slot call (150 needing only this piece). The
    STRUCTURAL reach — theorems where the mechanism actually changes the emitted string —
    is **38**, of which **16** are in the exactly-verified configuration. The first A/B I
    ran was against the text class and scored 0/5; re-running it against the structural
    class scored 4/11. **Size by the mechanism's own predicate, never by what proofs
    contain** ([[feedback-size-classes-by-toggle]]). `scratch/probes/mixedslot-reach.mjs`
    computes the structural class offline in seconds; copy that instrument shape.

    **Note `piRecurseTexts` was already correct** — it spells non-decreasing Pi args
    `[ctx |- _]`. The defect was unique to `recurseTexts`' Pi prefix.

44. **THE RESIDUE IS A LONG TAIL, measured — no single missing move is mass.**
    (2026-08-05.) `scratch/probes/feature-census.mjs` counts, over all 552 STUCK/TIMEOUT
    targets, which syntactic features each reference proof uses. Nothing dominates:
    nested ctor arg in an argument slot 19% (only **18** in CLOSING position, where a
    fill must emit it) · weakening `X[..]` 22% · nested case 21% · ctype pattern let 17% ·
    subst-applied meta 8% · param-var Pi binder 5% · **context-structural induction 3%
    (18 targets)** · context-block projection 2% (12).

    ⚠️ **Two self-inflicted measurement errors, both caught, both worth repeating here:**
    (a) the ledger field is **`outcome`**, not `status`/`result` — reading the wrong key
    silently classified all 269 COMPLETEs as stuck and inflated every census; (b) the
    first nested-ctor regex matched annotation parens `(x : T)` and parens inside TYPES,
    reporting **90%** where the true figure is 19%. Tighten a census regex against a
    hand-checked example before quoting it.

    **Consequence for planning:** stop looking for one big missing move. The paying
    category is MIS-EMITTED TEXT, and it is findable in BULK — every rejected candidate
    carries the checker's own error. `scratch/probes/error-census.mjs` runs a stride sample
    and tabulates (move kind × checker error class) so a systematic spelling defect shows
    up as a spike. Entry 43's defect took four hand probes to find; that instrument would
    have shown it as a histogram row.

    ⚠️ **A FALSE ALARM ON THE SUITE CLOCK, recorded so nobody re-raises it.** This run
    reported `206/207 passed in 67577.1s` (18.8 h). That is NOT a regression: the laptop
    lid was shut mid-run and the suite idled ~18 h of wall clock (user, 2026-08-06).
    `run-all.mjs` measures `Date.now()` deltas, so it counts SLEEP as elapsed time.
    Corroborating evidence gathered before the explanation arrived: all 13 prover tests
    run in 0–1 s, and the two genuinely heavy tests (`test-library-beluga.mjs` ~52 s,
    `test-symbolstore-incremental-equivalence.mjs` ~35 s) have ZERO prover imports.
    **The green-clock law still stands** ([[feedback-green-suite-is-not-a-green-clock]])
    — but before treating a big number as a defect, check it against the elapsed WALL
    time of the session, because the suite's own clock cannot distinguish work from sleep.

77. **⭐/⛔ WHOLE-PROOF SYNTHESIS — THE FULL-RESIDUE NUMBER: 9 of 570, DECLARATION-VERIFIED.
    A real capability that did not exist, and 1.6% of the residue against a bar that rules
    out 1%.** (2026-08-26/28. `scratch/probes/leaf-synth3.mjs --whole`.)

    ### 77.0 ⚠️ CORRECTION (2026-08-29) — 77.1's FIGURE WAS TAKEN AT A CRIPPLED BUDGET

    Everything in 77.1 was measured at `--calls 1500`, a value chosen only so a 570-target
    sweep would finish overnight. **`--calls` is not a pure cutoff**: the per-candidate share
    was derived from the GLOBAL budget, so the setting changed what the search could REACH.
    Re-run at `--calls 8000` over the same 570 targets:

    | | at 1500 | **at 8000** |
    |---|---|---|
    | proofs found | 16 | **19** |
    | DECLARATION-VERIFIED | 9 (1.6%) | **12 (2.1%)** |
    | precision | 56% | **63%** |

    The three new passes are `trans1'` in `algeq-simplified`, `algeq-simplified1` and
    `algeq-typing`, each needing **4877 calls** — beyond the old cap outright. Raw run:
    `residue-run-2026-08-29.txt`. ⛔ The conclusions of 77.2/77.3 are UNCHANGED: 2.1% is still
    the outcome mandate §2 rules out, and the ledger still cannot move because none of this is
    wired into `proveProgram`.

    ### 77.1 THE NUMBER, measured over the WHOLE residue (not a sample)

    All 570 residue targets, `--calls 1500 --depth 20`, every result spliced back with
    `/ total /` RESTORED and the program reloaded:

    | | |
    |---|---|
    | proofs FOUND | 16 / 570 |
    | **DECLARATION-VERIFIED** | **9 / 570 (1.6%)** |
    | precision on the residue | **56%** (vs **100%** on the COMPLETE control) |

    The nine: `test.cfg#best_step` · `lincx.cfg#helper1_6a` · `lincx.cfg#helper1_6b` ·
    `Close_Terms.bel#close1` · `Close_Terms.bel#close` · `Close_Terms.bel#close'` ·
    `Normalization_by_Evaluation.bel#app'` · `Weak_Normalization.bel#weakNorm` ·
    `weak-norm.bel#weakNorm`. All confirmed `STUCK` in the ledger of record.

    ⛔⛔ **THE LEDGER DOES NOT MOVE, AND THIS IS THE CENTRAL CAVEAT.** These come from a
    SCRATCHPAD instrument. The ledger's 273 is `proveProgram`, which was never touched — a
    re-baseline of the ENGINE would print 273 unchanged. 282/850 (33.2%) is what the ledger
    *would* read if the refinement search were wired in, and **that integration was named as
    a first-class piece of work on day one of this arc and never done.**

    ⚠️ **Residue precision is 56%, not 100%.** Seven found terms failed declaration
    verification (`terminate` ×2, `extend` ×2, three `weakNorm` variants). Every one was
    caught by the `/ total /` reload; none was banked. **On the control precision was 100%,
    so the control OVERSTATED soundness — a control drawn from successes cannot measure the
    failure mode of the residue.**

    ### 77.2 WHAT THE ARC BOUGHT, stated flat

    ✅ **Orca can now build a COMPLETE proof — structure and leaves — from a theorem's TYPE
    ALONE.** Intro, coverage-generated case tree (including `#p` and context-variable
    patterns), `let`-chains, recursion on pattern-bound subderivations. 33% of a 30-target
    COMPLETE control at 100% precision, `lin_name_must_appear` at 720 chars / 9 arms / 64
    calls. That capability did not exist a week ago.
    ⛔ **And it is 1.6% of the residue.** Mandate §2: *"Solving ~1% of the residue per build
    is not an option. Not as a milestone, not as a stepping stone, not as 'at least it's
    positive'."* This is that, and it should be recorded as a failure to clear the bar rather
    than as a gain.

    ### 77.3 THE CONSTRAINT THIS PUTS ON THE HYPOTHESIS SPACE (the durable part)

    Three staked diagnoses were proposed and **all three died on measurement**:
    | diagnosis | intervention | result |
    |---|---|---|
    | proof SIZE is the wall | (cut layer — not built) | killed by its own data: a 720-char proof cost 64 calls, a 106-char one cost 702 |
    | k>=3 COMPOSITION, b too wide | head filter (conclusion + premise-satisfiability) | **8x branching reduction measured, converts 1/40** |
    | destructuring `let` is a mass class | four repairs | class is real (240) but depth profile IDENTICAL to the control — explains nothing |

    ⭐⭐ **The binding fact for whoever comes next: cutting branching 8x bought ZERO.** The
    residue's difficulty is therefore not reachability (R6/R-LET reach it), not soundness
    (100% control precision), and not head branching. **Any new proposal on this axis must
    explain why b=8x converted nothing before it is worth building.**

    ⭐ Conversion decays sharply with author-proof size — residue <=70 chars **12.5%**,
    71-200 chars **2.5%**, uniform sample (median 321) **0%** — and none of the three
    interventions moved that ceiling.

    **Instruments:** `whole-run.mjs` + `whole-verify.mjs` (whole-BODY verification; `ls3-verify`
    assumes a leaf) · `former-matrix.mjs` (checkable vs synthesis-only, classify BEFORE
    building) · `let-census.mjs` / `let-position.mjs` / `size-gap.mjs` (class sizing with
    controls) · `destrlet-reach.mjs` · head-choice `LS3_HEADSTAT`.
    ⛔ Zero engine files touched, zero OCaml. Ledger of record unchanged at **273/850**.

76. **⛔ R6 BUILT INTO THE SEARCH — AND WHOLE-PROOF SYNTHESIS IS 0/6 ON THE POSITIVE
    CONTROL. The rule works; the search around it does not. Two real sub-results and one
    named defect.** (2026-08-25.)

    Entry 74 verified R6's primitive and counted five pieces; nothing consumed it. This
    entry consumes it: hole-id threading, `%:split`-generated arms with both entry-74.4
    repairs (`FREE Var N`, context-binder annotation), and `--whole` — a mode that masks
    the ENTIRE body to `?` so the search must build intro, case tree and leaves from the
    theorem's type alone. Every previous run in this arc spliced the author's
    prefix(maxDepth-1), so this is the first structure-synthesis measurement of any kind.

    ### 76.1 ✅ R6 IS ACTIVE AS A RULE
    Firing counters, real runs: `case` candidates emitted and **ACCEPTED by the checker**
    (`weak-norm#weakNorm` 4 emitted / 1 accepted; `poplmark-reloaded#fundVar` 7 / 7). The
    case rule composes with the existing set exactly as entry 74 predicted.

    ### 76.2 ⭐ BOUNDING THE INVERSION PHASE — the day-1 open problem, solved cheaply
    Case-analysis is INVERTIBLE (it never loses provability, so the tree is determined
    rather than searched) but **UNBOUNDED**: nothing stops the search re-splitting a
    hypothesis inside every arm, forever. The first control drowned there — `eq_refl` emitted
    **193** case candidates and exhausted its budget.
    **The bound is the rule's own applicability condition, not a ranking:** a scrutinee
    already decomposed ON THIS PATH has nothing left to yield, because the arms bind its
    components rather than itself. The current partial term IS the path, so it is the
    authority — no state to thread. Harpoon's and Twelf's discipline too.
    Measured: `eq_refl` 193 -> **24** candidates, `lin_name_must_appear` 36 -> **2**, with
    call counts down across the board.

    ### 76.3 ⛔⛔ THE RESULT — 0 of 6, and the control is what says stop
    Whole-proof synthesis on six targets the OLD engine already completes (drawn from the
    273, all with a `split` in their move list), budget 1500 calls / depth 12:
    **0 closed.** ⛔ Per the standing law — confirm a POSITIVE on known-good material before
    believing any NULL — **the residue was NOT measured.** Entry 74.6's stake (>=8/30 residue
    targets) is untested and stays untested until the control moves.

    ### 76.4 ⭐ THE DIAGNOSIS (traced, not guessed — entry 68's instruction)
    `LS3_VERBOSE` on `lin_name_must_appear`, whose leaf closes in 5 calls when the author's
    structure is handed over:
    ```
    ?                                   goal=[g |- linear (\x. P[..])] -> [ |- imposs]
    (fn v0 => ?)                        goal=[ |- imposs]            <- R1 fires
    (fn v0 => [ |- ?])                  goal=imposs  vars[]          <- R3 dead-ends
    (fn v0 => case v0 of | [_ |- l_pcomp1 (\x. X3)] => ?)  n=9       <- R6 fires
    ```
    Two causes, both named:
    1. ⛔ **The arm patterns carry an UNDERSCORE CONTEXT** — `[_ |- l_pcomp1 (\x. X3)]` where
       the author's arm is over `g`. This is **entry 69.8's unwritable-context defect
       resurfacing inside R6's arms**: the primitive's namespace and the source's are not the
       same namespace (invariant 11 at a third boundary). An arm whose context is `_` cannot
       bind the hypothesis the recursive call needs.
    2. **R3 (box introduction) is tried before R5 (the recursive call)**, so at `[ |- imposs]`
       — an EMPTY type, where the whole proof is a recursive call — the DFS fully explores a
       dead branch into `imposs` first. ⚠️ This is candidate ORDERING, which has 22 measured
       negatives behind it; it may only be touched with a declared stake, and entry 69.4's
       IH-before-siblings gain is the sole precedent (justified as a RULE order, not a score).

    ### 76.5 What this does and does not say
    - ⛔ It does **not** show structure synthesis is impossible. It shows the arms are
      mis-spelled, which is the MIS-EMITTED TEXT category — the only category that has ever
      paid here.
    - ✅ The inversion bound is real and cheap and should be kept whatever happens next.
    - ⛔ Entry 70.4's 13% still bounds the composed design from above on the hardest class,
      and R6 synthesising structure cannot beat a perfect structure oracle there.

    ### 76.6 ⛔⛔ CORRECTION TO 76.4 — THE `_` CONTEXT IS **NOT** THE BLOCKER

    76.4 blamed `%:split` printing `[_ |- …]` and asserted such an arm "cannot bind the
    hypothesis the recursive call needs". **Both halves are false**, and the real chain is
    three layers deep (`armctx-probe.mjs`, `armname-test.mjs`):

    1. **Split's output is ACCEPTED as printed** — `OK 9`, arms typed, hypotheses bound. And
       **all 9 arms of `lin_name_must_appear` CLOSE**, each with a one-step recursive call
       (`lin_name_must_appear [z, y : name |- X3]` and so on). The proof is reachable.
    2. ⭐⭐ **THE ARM's CONTEXT VARIABLE HAS NO STABLE NAME.** It is an IMPLICIT parameter, so
       reconstruction RE-INVENTS it on every elaboration — the same term reported it as `x`,
       then `z`, then `y` across three calls. The search re-elaborates the WHOLE partial term
       at hole 0 at every step, so **a context name read from one report is meaningless in
       the next**, and an arm body can never refer to its own context. This is why a hole-by-
       hole probe succeeds where the search fails: the probe addressed the arm hole directly.
    3. **The fix is to BIND the name ourselves.** A case pattern may bind a context variable —
       exactly what the author writes (`| [g ⊢ l_wait2 linQ] ⇒ f [g ⊢ linQ]`). Rewriting
       `[_ |-` to `[g0 |-` gives **OK 9** and the name is then stable. But each arm's context
       is `g0` PLUS the LF binders ITS OWN pattern introduces (`(\x. X3)` puts `X3` in
       `g0, x : name`), so the body must spell the ARM-EXTENDED context. Deriving that from
       the pattern text got the binder COUNT wrong on nested-lambda shapes; the ARM HOLE's own
       report is the authority (`X3 : (z, y : name |- …)` — swap the invented head for `g0`).

    ⭐ Also corrected: `ctxVars` was empty because the arm's context variable is **not a Δ
    entry of its own** — it appears ONLY inside another meta's type. So R5's candidate-context
    pool was empty and the plain `f ?` form crashed lfcheck exactly as that code's own comment
    predicts. Both fixes are in (`ARMCTX`, meta-derived contexts).

    ### 76.7 WHERE IT STANDS AFTER THE FIXES — still 0/6, and the failure MOVED

    A hand-built whole proof now types through ~690 of ~800 characters before one arm shape
    fails, so the term is very nearly expressible. In the search, `lin_name_must_appear` went
    from **80 calls (SPACE exhausted) to 3000 (BUDGET exhausted)**: the vocabulary is now
    present and the assembly is not.

    ⭐⭐ **THE NEXT IDEA, and it is structural rather than another rule.** A 9-arm case is NINE
    INDEPENDENT SUBGOALS, but the DFS treats them as one conjunctive path: it fills arm 1..8,
    fails on arm 9, and backtracks through everything. Solving each arm as its OWN search and
    combining is LINEAR in the arms rather than exponential. That is not candidate control —
    it exploits the fact that case arms are independent conjuncts, which is a property of the
    rule, not a heuristic. **This is the next slice, and it needs a declared stake.**

    **Next, in order:** map the arm's `_` context to the enclosing declaration's own binder
    (entry 69.8 item 1, now blocking a second mechanism) and re-run the SAME six. If the
    control does not move, R6-as-search is a negative and should be reported as one.
    ⛔ Zero engine files touched. Ledger unchanged at **273/850**.

75. **⭐⭐⭐ THE GRAMMAR'S MISSING FORMERS, BUILT AND MEASURED — `LS3_CTX`. Net +2/36 on the
    residue leaf metric (13 → 15), 4 gains / 2 losses, at +132% checker calls. The two LAWS
    it bought are worth more than the toggle: refinement reaches CHECKABLE positions only,
    and R10's postmortem was drawn too wide.** (2026-08-25.)

    ### 75.1 WHY THIS RAN — the rule set is less than half the grammar

    Entry 60.3b found the "nine rules" were wrong and that the real set is ~13 computation
    formers and ~9 LF formers, taken from `beluga.grammar`. **It was recorded as an error and
    never implemented.** R10 (`_`) was built instead — and `_` is not a former, it is an
    author abbreviation. So every number from entry 40 on was measured with a generator built
    from roughly 9 of ~22 productions, which is also why mandate §3 ("show the closure covers
    the fragment") has been unanswerable.

    ### 75.2 THE DAY-1 TAXONOMY that chose the pieces (`gap-taxonomy.mjs`)

    All 23 failed residue leaves, classified by MISSING RULE rather than by a favoured
    hypothesis — the point being to avoid a tail hunt:

    | missing capability | leaves |
    |---|---|
    | **substitution objects / variables** (`M[σ]`, `$W`, `$[Ψ ⊢ σ]`) | **7** |
    | **context objects / extension** (`[]`, `[_]`, `[g, x:A]`) | **~5** |
    | deep nesting / budget / search quality | 5 |
    | **`impossible` former** (absent entirely) | 2 |
    | local application head | 2 |
    | `let` in arg position · block projection `#q.1` · sibling arity cap `k>4` | 3 |

    ⭐ **The wall is the CONTEXTUAL LAYER IN TERM POSITION (~12 of 23)** — independently
    re-deriving entry 72.3 by a different route (missing-rule taxonomy vs feature census).

    ⚠️ **The local-head hypothesis that motivated the day was measured and is SMALL.**
    `localhead-census.mjs`, scored PASS-vs-FAIL on the same leaves: residue **0.0% of solved
    leaves carry a local application head vs 17.4% of failed** (infinite lift), control 5.3%
    vs 11.8% (2.24×), and a clean size gradient (≤10 tok 0.0%, >10 tok 25.0%). **But the mass
    is 4 leaves.** R10 also had infinite lift replicated on two sets and converted zero. Real,
    small, not the wall — recorded so nobody stakes a build on it.

    ### 75.3 THE FIVE PIECES (one toggle, `LS3_CTX=1`, default OFF)

    1. **Premise-model fix.** `classifyPremise` tags EVERY parenthesised segment `kind:'ctx'`,
       so a HIGHER-ORDER premise — `({T:[⊢tp]} TmVar [g] [⊢T] -> Sem [h] [⊢T])`, which is what
       a logical relation IS — reads as an implicit context binder and is DROPPED from the
       arity. `nbe-sub#eval` has premises `[ctx,ctx,box,ctx]` and R5 emitted `eval ?`: arity 1
       where the author writes `eval t initialMap`. The call could never type.
       ⭐ **`prover-comp-type.mjs:107` records this fix as TRIED AND REVERTED (2026-07-27)** —
       "CORRECT in isolation" but it blew `mstep_leq_2` from COMPLETE to >10 minutes because
       "the extra premise widens the IH/rule arity and the lemma pool EXPLODES", with a
       standing instruction not to re-apply without bounding the cost. **That objection is an
       artifact of the OLD UNIT OF ACTION.** A closed-term engine must ENUMERATE ARGUMENT
       TUPLES, so +1 arity multiplies the space (entry 60.1); under REFINEMENT +1 arity is +1
       HOLE the checker types. The fix becomes affordable *because the unit changed*.
    2. **Arity cap.** `k > 4` excluded lemmas outright — `weak-norm-total-products#bwd_closed'`
       has 5 premises and was never offered, and its leaf's author term is a 5-argument call.
    3. **Per-slot argument shaping**, from `elim-close.mjs`: `hv1 ? ?` fails ("Expected:
       function type") where `hv1 [ |- _] ?` types. One uniform shape across all slots is not
       enough.
    4. **R11, the substitution former** (`σ ::= ^ | .. | σ, M`).
    5. **`impossible`.**

    ### 75.4 ⭐⭐ LAW ONE — REFINEMENT REACHES CHECKABLE POSITIONS ONLY

    Diagnosed at the oracle on `poplmark-reloaded#fundVar`, whose author term IS
    `impossible [ |- #p]`:

    ```
    impossible [ |- #p]  ->  OK 0
    impossible [ |- ?]   ->  FAIL "This LF hole is appearing in a SYNTHESIZABLE position,
                                   but LF holes must appear in CHECKABLE positions"
    ```

    **`impossible e` puts `e` in SYNTHESIS mode, so it CANNOT BE REFINED** — a hole has no
    type to synthesise. It must be handed a CONCRETE term drawn from Δ/Γ. This is a hard
    structural boundary on the whole refinement design, not a bug, and it should be checked
    for every new former before one is built.

    ### 75.5 ⭐⭐⭐ LAW TWO — R10's POSTMORTEM WAS DRAWN TOO WIDE

    Diagnosed on `Parallel_Reduction#subst`, author term `[g |- D1[.., _, D2]]`:

    | expression | verdict |
    |---|---|
    | `D1[.., _, D2]` | **OK 0** |
    | `D1[.., ?, ?]` | FAIL *"Ill-typed term"* |
    | `D1[.., ?]` | FAIL *"Missing type information for bound variable"* |

    ⛔ **The distinction is NOT `_` versus `?`.** It is **`_` at a DETERMINED SLOT INSIDE A
    FORMER** — correct, and exactly what the author writes — versus **`_` AS A WHOLE GOAL**,
    which is vacuous because it defers everything. Entry 72.4 measured the second and the
    project concluded against the first.

    ⚠️ **AND THIS INVERTS A SYNTHETIC PROBE TAKEN THE SAME DAY.** `subst-refine.mjs` got a
    properly typed subgoal out of `N[.., ?]`. Both are true: a slot determined by the GOAL is
    checkable and takes `?`; a slot determined only by UNIFICATION is not, and takes `_`.
    Emit both spellings and let the oracle arbitrate — do not model which.

    ⛔ **`D1[.., _, _]` closes hole-locally and FAILS the declaration** (*"Leftover
    meta-variables"*). `LS3_STRICT` is what rejects it and lets the search continue to the
    author's own term. Without strict this is a banked false proof, and it is how the +2 was
    nearly a +3 of which one was fake.

    ### 75.6 THE A/B — declaration-verified, control reproducing the stored 13/36

    | build | before | after | gains | losses | cost |
    |---|---|---|---|---|---|
    | as first written | 13 | 11 | **0** | 2 | +62% |
    | **corrected spellings** | 13 | **15** | **4** | **2** | **+132%** |

    Gains: `Parallel_Reduction#subst` = `[g |- D1[.., _, D2]]` (**byte-identical to the
    author's published term**) · `logEq_Monotone#1` · `normeval-abbrev#subst` leaves 0 and 1.
    Losses: `test-crec-cover#eq1`, `Poplmark#sound#0` — both budget starvation, the R10 pattern.

    ⛔⛔⛔ **RETRACTED — SEE 75.8. THE THREE `impossible` GAINS ARE FALSE PROOFS.** The
    paragraph below was written from a soundness probe that was too narrow, and it is kept
    only so the mistake is legible. It read (`imposs-sound.mjs`): Three of the four gains carry `total:false` — no
    `/ total /` to restore — and `impossible e` elaborates as a ZERO-BRANCH case whose entire
    soundness is the coverage check, so the natural fear was the five-false-proofs mechanism:

    | case | verdict |
    |---|---|
    | honest proof, no pragma | ACCEPTED (control) |
    | `impossible n` on an INHABITED `[ ⊢ nat]`, **no pragma** | **rejected** — *"The expression n is not impossible"* |
    | same, with `/ total /` | rejected |
    | `impossible v` on a genuinely empty type, no pragma | ACCEPTED (control) |

    ⇒ **Coverage for `impossible` runs INDEPENDENTLY of the totality pragma.** A separate
    control confirms it is not a yes-machine: `impossible` is REJECTED on known-good solved
    control leaves.

    ### 75.7 ⛔⛔ TWO PROCESS FAILURES, both caught only by the control

    1. **An A/B was run on a build already known to be miswired.** Two of five pieces had
       spelling defects diagnosed AFTER the sweep launched (and the sweep could not be
       corrected mid-run — a background sweep pins the code it runs on). The first negative
       measured that build. **Diagnose every piece at the oracle BEFORE the sweep starts.**
    2. ⛔⛔⛔ **`scratchpad/` NO LONGER EXISTS — it is `scratch/probes/`** (the rename is
       documented in the committed `scratch/README.md`). The move left every instrument's
       relative imports one level short, so **nothing in that directory ran at all**. Repaired:
       192 static `from '../js/` across 101 files, **plus 2 DYNAMIC `await import('../js/` in
       `ls3-verify.mjs` that a `from '…'` grep MISSES**, plus 2 `'../scripts/`.
       ⛔ **A junction does NOT fix this** — Node resolves it via realpath, so `../js` still
       lands in `scratch/js`.
       ⭐ **The half-repair manufactured a clean fake A/B**: the verifier crashed on every row,
       both arms scored 0/36, and it read as a tidy "neutral". **The only thing that caught it
       was scoring the OFF control against its stored 13.** Score the control against its known
       value before reading any delta.


    ### 75.8 ⛔⛔⛔ RETRACTION — ALL THREE `impossible` GAINS WERE FALSE PROOFS, AND THE
    SOUNDNESS CONTROL IS WHAT FAILED

    Looking at what was actually being discharged (`normeval-abbrev#subst` leaf 1):

    ```
      s : {T : ( |- tp)} NeutVar [g1] [ |- T] -> NeutVar [h] [ |- T]
      Goal: Sem [h] [ |- arr A1 B]
    ```

    **`s` is FUNCTION-typed and manifestly inhabited — it was passed in.** `impossible e`
    requires `e`'s type to have no coverage cases; a function or Π type is not a datatype, so
    `Cover.genPatCGoals` generates no patterns, reports ZERO CASES, and `impossible` is
    satisfied **VACUOUSLY**. Measured directly (`imposs-sound2.mjs`):

    | case | verdict |
    |---|---|
    | datatype-typed hypothesis (all `imposs-sound.mjs` ever tried) | rejected ✓ |
    | **FUNCTION-typed hypothesis, no pragma** | ***ACCEPTED*** |
    | **FUNCTION-typed hypothesis, WITH `/ total /`** | ***ACCEPTED*** |
    | **Π-typed hypothesis (the exact shape of all three gains)** | ***ACCEPTED*** |
    | genuinely empty type | ACCEPTED ✓ |

    `rec c2 : ([ |- nat] -> [ |- nat]) -> [ |- nat] = fn f => impossible f` **loads clean.**
    That asserts a manifestly inhabited type is empty. **This is a latent soundness hole in
    Beluga that a machine search finds immediately and an author never would** — authors use
    `impossible` on datatypes. Restricting the rule to Δ metas with non-arrow, non-Π types
    removes all three closes (verified: `closed=false` on each).

    ⭐⭐⭐ **THE METHOD LESSON, and it is the point of this entry.** `imposs-sound.mjs` was a
    real experiment with a positive AND a negative control, run *because* the pragma was
    missing, and it still certified a false result — because every case it tried was of ONE
    TYPE SHAPE (datatype/box), which genuinely does have cases. **A soundness control must
    cover every TYPE SHAPE the rule can be applied to, not several instances of one shape.**
    A second control (`impossible` rejected on solved-control leaves) agreed with it, for the
    same reason. Two agreeing controls, both blind in the same direction.

    ### 75.9 THE CORRECTED SCOREBOARD

    | piece | legitimate gains | losses | cost |
    |---|---|---|---|
    | `impossible` | **0** (all 3 were the coverage exploit) | 0 | +0% |
    | R11 substitution | **1** — `[g |- D1[.., _, D2]]`, the author's exact term | 1 | +88% |
    | premise model + arity cap + shaping | **0** | ≤2 | +37–132% |

    ⇒ **`LS3_CTX` is a NEGATIVE and stays default OFF.** The one real gain is R11 on the
    substitution class, bought at +88% checker calls and one regression. The tenth mechanism
    to measure ~zero. ⛔ The premise-model fix still LOOKS correct (entry 75.3(1)) and still
    has no measured payload — do not re-litigate it without a new reason.

    **Instruments:** `gap-taxonomy.mjs` · `localhead-census.mjs` (hand-check sample + assembly
    guard built in) · `elim-probe/elim-close.mjs` · `subst-refine.mjs` · `imposs-sound.mjs` ·
    `premise-shape.mjs` · `ls3-sweep.mjs` · firing counters in `leaf-synth3` (`fire`/`acc`).
    ⛔ Zero engine files touched, zero OCaml. Ledger unchanged at **273/850**.

74. **⭐⭐⭐⭐ R6 IS A REFINEMENT RULE — THE ONE RULE OF THE NINE NEVER BUILT, AND IT IS
    EXACTLY THE "STRUCTURE" HALF. Verified at the source: the checker elaborates a `case`
    whose arms are holes, coverage supplies the patterns (`#p` and context splits
    included), and refinement NESTS. Component contract on the corpus at control parity.
    ⛔ NOT BUILT INTO THE SEARCH, AND NOT MEASURED FOR CONVERSION.** (2026-08-24.)

    ### 74.1 The observation that started it

    `leaf-synth3` implements R1, R2, R3, R4, R5, R7, R8, R9 and (opt-in) R10. **It does not
    implement R6** — `case s of | pat => ?`, the case tree. That is not a detail: R6 *is*
    structure synthesis. The project has been describing "leaves" and "structure" as two
    halves needing different work, when in entry 60.3's own rule set they are nine rules and
    a tenth, in one closure. The open half was never a different problem; it was a missing
    rule.

    ⚠️ **This also re-reads entry 70.4's 13%.** That composition test handed over the
    author's structure to a search *with no R6*, so a leaf that itself needs a nested case
    (entry 44: nested case in 21% of residue proofs) could not be closed at all. 13% is a
    ceiling on the composed design **without the case rule**, not on the composed design.

    ### 74.2 THE PRIMITIVE, VERIFIED AT THE SOURCE BEFORE ANY DESIGN (mandate §4)

    `%:checkinhole` calls `State.elaborate_in_hole` and collects holes via `Holes.catch`, so
    the question is empirical, not architectural. All four answers are positive:

    | # | question | result |
    |---|---|---|
    | A | does `checkinhole` elaborate a `case` with HOLE arms? | ✅ `OK 2`, one SUBGOAL per arm |
    | B | is each arm reported in its PATTERN-EXTENDED context? | ✅ arm hole carries `N : ( \|- nat)` — the pattern variable is in scope |
    | C | do the patterns come from COVERAGE, not invention? | ✅ `%:split H V` supplies them, and its output round-trips through `checkinhole` |
    | D | does refinement NEST (a case inside an arm of a case)? | ✅ depth-2 arms come back correctly typed |

    ⭐⭐ **THE PART THAT MATTERS MOST.** `%:split` generates, and `checkinhole` accepts, the
    exact apparatus entry 72.2 said Orca has **zero formation rules** for:

    ```
    %:split 0 m   ->  case m of | [g |- #p] => ? | [g |- z] => ? | [g |- s X] => ?
    %:split 0 g   ->  case [g] of | [] => ? | [g, x : nat] => ?
    ```

    and the arm holes come back with **`#p : #(g |- nat)` in the meta-context**, with the
    context variable ELIMINATED in one arm and EXTENDED in the other (`m : [g, x : nat |- nat]`,
    the hypothesis automatically re-typed).

    ⇒ **Entry 72.5 offered two options — the contextual layer must be SOLVED by unification,
    not GUESSED by search. There is a third, and it is the one that works: in PATTERN
    position the contextual layer is GENERATED BY COVERAGE.** We never spell `#p`, never
    spell a context extension, never write a formation rule for either. Beluga's own coverage
    writes them and its own checker binds them. This is entry 60.2's argument ("whatever
    cannot be written can still be REFINED") holding at the pattern layer as well as the
    term layer.

    ### 74.3 THE COMPONENT CONTRACT ON THE REAL CORPUS — with a control, reporting the lift

    `scratch/probes/r6-reach.mjs` + `r6-reach-run.mjs`. At the TOP goal of a fully-masked
    declaration (`/ total /` stripped — `%:split` breaks on `TypInd` otherwise): intro, then
    `%:split` every name bound in the hole's report, then feed each result back through
    `%:checkinhole`. Stride sample, 40 residue + 40 drawn from the 273 COMPLETE.

    | | residue | **control** | lift |
    |---|---|---|---|
    | usable targets | 39 | 40 | |
    | **≥1 split ROUND-TRIPS** | **27 (69.2%)** | **31 (77.5%)** | **0.89×** |
    | split candidates offered | 64 | 56 | |
    | …accepted by `checkinhole` | 44 (68.8%) | 45 (80.4%) | 0.86× |
    | arms handed back | 142 | 192 | |
    | splits producing a `#p` arm | 15 | 12 | |
    | **context-variable splits** | **29** | **16** | **1.8×** |

    ⭐ Near parity: R6 is **not** selectively broken on the residue, which is the only thing
    this measurement is entitled to say. The one place the residue is *richer* is
    context-variable splitting (1.8×) — consistent with entry 59c's context-carrying
    zero-candidate goals and entry 44's context-induction class.

    ⛔⛔ **THIS IS A COMPONENT CONTRACT AND NOTHING MORE.** Mandate §4: the payload gate
    belongs on the piece that consumes it, and nothing consumes this yet. Seven reach
    numbers in this project have converted zero. **Do not quote 69.2% as a result.**

    ### 74.4 ⭐ EVERY REJECTION IS MIS-EMITTED TEXT — and it is the ORACLE's text

    Of 29 rejected round-trips, **not one is a search-quality or semantic failure.** All are
    Beluga's own printer emitting strings Beluga's own parser refuses:

    | n | checker error | note |
    |---|---|---|
    | 21 | *Failed to parse Computation-level expression* | the dominant class, uncharacterised |
    | 3 | *Contextual LF context pattern bindings require type annotations* | ⭐ **repaired**, see below |
    | 2 | *Unlexable character(s)* on `Γ` | ⚠️ the channel is UTF-8 clean (probed); cause is elsewhere |
    | 2 | *Expected an LF term-level constant* | |
    | 2 | *Projection on a parameter variable has a functional type* | a genuine Beluga limitation |
    | 1 | *Identifier missing for the binding in the contextual LF context pattern* | |

    Plus a printer defect that emits **`FREE Var 1`** — not Beluga syntax at all —
    into a `let`-shaped split (`let Acc [Γ] [ |- B] [Γ |- M[.., N]] FREE Var 1 = x71 in ?`).

    ⭐ **This lands on the ONE category that has ever paid**
    ([[feedback-generation-pays-search-control-does-not]]: every gain ever was a MISSING
    MOVE or MIS-EMITTED TEXT). ⛔ It is also a warning: reading it as "29 recoverable
    targets" would repeat entry 70.5's error exactly (13-of-14 on termination converted +1).

    **The one already repaired.** `%:split` prints context-pattern binders WITHOUT their
    type (`[g, x1 |- #p[..]]`); `checkinhole` parses only annotated ones. So split's output
    is not re-feedable **once a previous split has EXTENDED the context** — i.e. at exactly
    depth ≥2, which is why depth-1 needed the repair 0 times in the corpus sample and the
    nesting probe needed it immediately. The fix is a BelJar-side TRANSFORM, not a
    workaround: the binder's type is readable off the hole's own goal
    (`Goal: [g, x : nat |- nat]`), and the context VARIABLE must be skipped (annotating it
    yields `[g : nat, x1 |- …]`, which fails identically and cost one probe cycle).

    ### 74.5 ⛔ THE PIECES, COUNTED BEFORE STARTING — five, not one

    [[feedback-composite-moves-are-atomic]]: two thirds of a three-part move measures ZERO
    even at 40% reach, so count first and put all pieces behind one toggle or do not start.
    R6-in-the-search is **five**:

    1. **Thread the hole ID** through `parseHole` → `candidatesFor`. `%:split` addresses a
       hole by id; `parseHole` currently discards it. (Small. The DFS re-elaborates the whole
       term at hole 0 each step, so a `case` in the term needs no special handling — and
       arm registration order matched textual order in every probe, which is what
       `build`'s leftmost-`?` convention requires.)
    2. **R6 generation** — `%:split <id> <v>` for every name bound in the report, plus the
       §74.4 annotation transform.
    3. **Coverage preservation.** ⛔ `checkinhole` does **NOT** enforce exhaustiveness:
       `case n of | [ |- z] => ?` on a two-constructor type returns `OK 1`. Coverage is OURS
       exactly as termination is. Sound by construction only if split's FULL arm list is
       always used and never subsetted.
    4. **Termination.** `decSubderivNames` walks the SOURCE text for enclosing case arms;
       under refinement the case tree is a string we are assembling and is not in the source,
       so it does not apply. ⭐ But this gets *easier*, not harder: because R6 builds the tree,
       the structural-subterm relation is known **by construction** — when R6 splits scrutinee
       `s`, every pattern variable bound in an arm is a structural subterm of `s`, so an exact
       constructed relation replaces the source-walking under-approximation (whose standing law
       is that it may only say YES — entry 71.2). R5's self-call is then admissible iff its
       MEASURED-position argument is in that set, implicit positions excluded (mandate §7).
       This replaces `circularSelfCall`, which entry 69.5 measured catching 2 of 12.
    5. **Whole-body verification.** The current gate `ls3-vleaf` splices a LEAF; an R6 search
       produces a whole declaration body, so the gate is `ls3-verify-whole` with `/ total /`
       restored. No number counts without it.

    ### 74.6 THE STAKE AND THE KILL CRITERION, declared before building

    Metric: **declaration-verified with `/ total /` restored**, A/B via `ls3-ab.mjs`, both
    arms same budget, residue AND the solved control, gains and losses reported separately —
    never totals.

    - **STAKE:** on the whole-target composition test *with the author's structure NO LONGER
      handed over* (R6 must synthesise it), ≥ **8 of 30** residue targets declaration-verify.
      Rationale: entry 70.4 got 3/30 **with structure free and no R6**; a rule that both
      synthesises structure and unlocks nested-case leaves must beat the handed-over number,
      not merely match it.
    - **KILL:** < 5/30, **or any loss on the solved control**, **or any close that fails
      `ls3-verify-whole`** — abandon, do not polish. A percentage containing circular proofs
      is worse than a lower honest one.
    - ⛔ **Do not stage this on a class chosen by convenience.** The 30 are entry 61's hardest
      slice and entry 70.4 flagged that the easier ~27% were never sampled; whichever set is
      used, it is fixed BEFORE the run and the control is drawn from the successes.

    **Instruments added:** `r6-probe.mjs` (A/B: case with hole arms) · `r6-probe2.mjs`
    (coverage-generated patterns) · `r6-probe3/4.mjs` (round-trip, with the sparse-id
    high-water-mark addressing entry 69.3 requires) · `r6-probe5/6.mjs` (nesting + the
    annotation repair) · `r6-reach.mjs` + `r6-reach-run.mjs` (the corpus contract, control
    built in) · `uni-probe.mjs` (the channel is UTF-8 clean — recorded so it is not
    re-suspected). ⛔ **Zero engine files touched. Zero OCaml touched.** The ledger is
    unchanged at **273/850**.

73. **⛔⛔ THE ADJUDICATION HYPOTHESIS IS DEAD, AND IT WAS ALREADY DEAD BEFORE IT WAS
    PROPOSED. The oracle was built, and the experiment that refutes it had already been
    run.** (2026-08-23. Answers the deep-research proposal of the same day.)

    A zero-context research agent, given `orca-research-brief-v4.md`, returned a strong
    proposal: the contextual layer is ~90% **determined** rather than searched, so the deficit
    is not a missing rule but a missing **adjudication oracle** — a cheap per-step
    SOLVED / POSTPONED / FAILED verdict. Its declared Day-1 probe was to find out whether such
    a verdict is readable at hole granularity without a declaration reload, and its stated kill
    criterion was that it is not.

    ### 73.1 ⭐ The oracle IS reachable — the research reasoned from papers, not the source

    The proposal concluded there is "no documented cheap incremental *is-this-determined?*
    API", from Pientka (JFP 2013) describing abstraction as a whole-declaration post-pass.
    The implementation says otherwise. `Unify.StdTrail` exports:

    ```
    val resetGlobalCnstrs      : unit -> unit
    val globalCnstrs           : cnstr list ref
    val unresolvedGlobalCnstrs : unit -> bool
    val forceGlobalCnstr       : unit -> unit
    ```

    and `src/web/beluga_web.ml` — the ONE OCaml file inside the security boundary — already
    calls `Unify.StdTrail.resetGlobalCnstrs ()`. So the probe needed no `command.ml` edit:
    `ideAdjudicate` was added to the shim (reset the store, run the command, read the state),
    rebuilt, and it answers in **4–7 ms**, against ~3–5 s for a declaration reload.

    ### 73.2 ⛔ But it is the WRONG oracle, and the research was right about why

    | expression | verdict | correct? |
    |---|---|---|
    | `[ ⊢ ms_tr MS1' MS2']` (the author's own term) | SOLVED | ✅ |
    | `__nonsense__` | FAILED | ✅ |
    | **`[ ⊢ _]`** | **SOLVED** | ⛔ **should be POSTPONED** |
    | `_`, `[ ⊢ _]`, `[g ⊢ _]` across 3 further residue leaves | SOLVED / SOLVED / FAILED | **POSTPONED never fired once** |

    ⭐ **The reason, and it is the durable finding:** the constraint store tracks postponed
    **unification problems**, not undetermined **metavariables**. `[ ⊢ _]` creates a
    metavariable with *no constraint on it at all* — perfectly consistent, simply not
    determined. So `unresolvedGlobalCnstrs` separates FAILED from ⊥-vs-satisfiable and says
    nothing about determinedness. **Determinedness is decided by ABSTRACTION**
    (`Abstract.exp : Comp.exp -> fctx * Comp.exp`, non-empty `fctx` ⇒ free metavariables),
    exactly as the research said — and reaching it needs the elaborated expression out of
    `State.elaborate_in_hole`, i.e. a core-file edit.

    ### 73.3 ⛔⛔ THAT EDIT IS NOT WORTH MAKING — the experiment already exists

    **Entry 72's R10 already ran this mechanism with a PERFECT oracle.** Under `LS3_STRICT`
    every `_`-bearing close was adjudicated by splicing it into the declaration, restoring
    `/ total /`, and reloading — i.e. by ground truth itself, the most accurate and most
    expensive verdict obtainable. `_` was available as a candidate **at every hole**, including
    argument positions inside larger applications, which is where the corpus's `_`s live.

    | R10 with reload-adjudication (a perfect oracle) | result |
    |---|---|
    | residue, 36 leaves | **0 gains**, 0 losses |
    | solved control, 75 leaves | **0 gains, 1 LOSS** |

    ⇒ **With a perfect determinedness oracle the mechanism converts nothing. Making that
    oracle cheap changes the COST, not the OUTCOME.** The hypothesis "the deficit is
    adjudication, not rules" is therefore falsified by an experiment run the day before it was
    proposed. The terms are not found; adjudication was never the binding constraint.

    ⛔ **Do not spend a `command.ml` edit and a rebuild on an abstraction-based oracle.** The
    only thing it can buy is a 500× speedup on a verdict that has already been shown not to
    matter.

    ### 73.4 What is kept

    - ✅ **`ideAdjudicate` stays.** It is cheap, inside the boundary, and gives a genuine
      4–7 ms FAILED/SOLVED verdict — but it is **equivalent in information to `%:checkinhole`'s
      own `OK`/`FAIL` line**, so it is a convenience, not a capability. Its `postponed` flag has
      never fired; do not build on it without first making it fire on a known non-pattern
      unification.
    - ⚠️ **A real bug it exposed, worth inheriting:** `run_command_status`'s boolean means
      *"no exception escaped"*, **not** *"the command succeeded"*. `%:checkinhole` catches its
      own errors and PRINTS `FAIL …`, so the boolean is `true` for nonsense. The first build of
      the oracle returned SOLVED for `__nonsense__` and only the positive/negative control
      caught it. **Read the command's own output, never the escape flag.**
    - ⭐ **The research's §(b) determined/searched partition survives and is the durable
      result**, as does its §(f) ceiling argument. What died is its §(c) remedy.

    ### 73.5 The standing conclusion

    Three independent routes now say the same thing about the residue's contextual leaves:
    the objects are mostly DETERMINED (research §b), a perfect adjudicator for them converts
    nothing (72 + 73), and the composed design tops out at **13% of the hardest residue class
    even with a perfect structure oracle** (70.4). The arithmetic does not close, and the
    literature (Harpoon `auto` excludes exactly this apparatus; Twelf cannot do logical
    relations; no system reports corpus-scale automation on POPLmark-reloaded) says it does not
    close for anyone else either.

72. **⭐⭐⭐ THE RULE SET WAS DECLARED COMPLETE OVER THE WRONG SORTS — and the first rule
    built against that finding is a clean NEGATIVE that sharpens it.** (2026-08-23.)

    ### 72.1 First, a belief formed the previous day, re-tested and SURVIVED

    Entry 70.1 classified 13 residue leaves as a GENERATION gap because the DFS finished
    under budget. But it finished within **depth 6** — for a 31-token term that could be a
    depth cap wearing a generation-gap costume. Re-ran the identical 13 at **depth 12 and
    3000 calls** (2× depth, 15× budget): **0 closed, and byte-identical call counts**
    (55, 36, 38, 49, 10 …). The DFS was never depth-limited; it runs out of CANDIDATES.
    ⭐ Fifth independent confirmation that budget/breadth does not pay, and the first one
    taken inside the refinement design.

    ### 72.2 ⛔⛔⛔ THE CLOSURE ARGUMENT OF ENTRY 60.3 IS FALSE

    The refinement design was justified by naming nine rules and asserting:

    > *"These are not heuristics. They are the term grammar of Beluga, which is what generates
    > every well-typed term there is; a tenth rule would mean a tenth term former."*

    R1–R9 generate **applications of named things** at two levels — computation terms and LF
    terms. Beluga is a CONTEXTUAL modal type theory and has further syntactic sorts, each with
    its own formation rules, none of which appear in the nine:

    | sort | formed by | in the corpus |
    |---|---|---|
    | contexts Ψ | `·`, a context variable `ψ`, `Ψ, x:A` | `[g, x:tm A[] ⊢ x]` |
    | substitutions σ | `^`, `..`, `σ, M`, `$S` | `D1[.., _, D2]`, `M1[$W]` |
    | parameter variables | `#p`, `#p.k` | `impossible [ ⊢ #p]`, `#q.1[..]` |
    | reconstruction placeholder | `_` | `reify [_] _ _ (eval [_ ⊢ M] …)` |

    **Orca has zero formation rules for any of them.** It can emit a contextual object only
    when one is already a name in scope.

    ### 72.3 The evidence, with a control (`scratch/probes/ctx-apparatus-census.mjs`)

    Residue leaves, scored separately for those the search CLOSED and those it did not:

    | feature | unclosed (22) | closed (14) | lift |
    |---|---|---|---|
    | context extension | 23% | **0%** | ∞ |
    | substitution application | 27% | **0%** | ∞ |
    | substitution variable `$S` | 9% | **0%** | ∞ |
    | **standalone `_`** | **32%** | **0%** | **∞** |
    | **ANY of the above** | **68%** | **7%** | **9.5×** |

    ⭐ Replicated on the SOLVED control (75 leaves): bare `_` in 21% of leaves the search
    fails, **0%** of leaves it closes.

    ⭐⭐ **This explains the ~10-token cliff mechanically.** Small leaves are plain
    applications of names; large leaves are where contextual apparatus appears. The cliff was
    never about size. It also explains all seven prior zeros with one mechanism: precision,
    construction, structure, breadth, the binder rules and the termination fix all operated on
    the TERM layer, so none of them could touch a leaf whose obstacle is a different sort.

    ### 72.4 ⛔ R10 — `_` AS A CANDIDATE: BUILT, MEASURED, NEGATIVE, REVERTED TO OPT-IN

    Both arms under `LS3_STRICT` (declaration-verified), identical budget, `_` tried LAST with
    its own separate check budget so it could not starve real candidates:

    | + R10 | before | after | gains | losses | cost |
    |---|---|---|---|---|---|
    | residue, 36 leaves | 13 | **13** | **0** | 0 | **+52% calls** |
    | solved control, 75 leaves | 58 | **57** | **0** | **1** | **+112% calls** |

    The loss is `unique_eval`, whose genuine close (`unique_eval [ ⊢ D3] [ ⊢ F3]`) was no
    longer reached. **The highest-lift feature ever measured in this project — infinite lift,
    replicated on two sets — converts nothing and doubles the cost.** Default OFF
    (`LS3_UNDERSCORE=1` to opt in). Eighth reach-without-payload result.

    ### 72.5 ⭐⭐⭐ WHY IT FAILED, AND THIS IS THE USEFUL PART

    Two obstacles, both discovered by building it:

    1. **`_` type-checks HOLE-LOCALLY almost everywhere.** The primitive elaborates with no
       declaration-level obligation, so it cannot distinguish *"reconstruction will determine
       this"* from *"this is a real proof obligation"*. Added naively it turns the search into
       a yes-machine: all 5 leaves of the small control "closed" with `[ ⊢ _]`. It also
       consumed 11 of 14 strict checks on the very first residue leaf until given its own
       budget.
    2. **⭐ `_` IS NOT A SEARCH MOVE AT ALL.** It is an abbreviation the AUTHOR uses because
       reconstruction will solve the object for them. Emitting it does not REDUCE the goal —
       it DEFERS the goal to a solver the search cannot consult incrementally. A candidate the
       oracle cannot adjudicate is noise, not a move.

    ⇒ **The conclusion is not "the contextual sort does not matter". It is that the contextual
    layer must be SOLVED (by unification), not GUESSED (by search).** Refinement was the right
    answer for the term layer precisely because the checker adjudicates each step; there is no
    equivalent incremental adjudication for a contextual object, and inventing one — or
    finding that Beluga already has one — is the question.

    ⭐ This is the sharpest form the project's question has ever taken, and it is now the
    subject of **`orca-research-brief-v4.md`** (written 2026-08-23, supersedes v3's
    §5/§11/§12/§13; v3 §2–§3 remain the domain background). The highest-value sub-question
    named there: **which contextual objects are recoverable by higher-order pattern
    unification** — hence legitimately `_` — **and which must genuinely be searched?** If most
    are determined, the missing rule set is small and the real problem is adjudication.

    **Instruments:** `ctx-apparatus-census.mjs` (apparatus lift, control built in) ·
    `depth-probe` re-run of 72.1 · `ls3-ab.mjs` (A/B on the declaration-verified metric).
    ⛔ Zero engine files touched.

71. **⭐⭐ TERMINATION AS OUR INVARIANT — and the discovery that the engine's own criterion
    may only say YES.** (2026-08-22, third pass.)

    Entry 70.5 measured the composed design's dominant declaration-level failure: **13 of 14**
    targets that closed EVERY leaf and still failed did so for *"Recursive call"*. This entry
    is the work against that, and it produced one clean mechanism plus one law worth more
    than the mechanism.

    ### 71.1 The instrument — `LS3_STRICT`, ground truth inside the search

    `scratch/probes/ls3-vleaf.mjs` splices a single candidate close into the declaration,
    **restores `/ total /`**, and reloads the whole program. `LS3_STRICT=1` calls it on every
    candidate close: a close Beluga rejects is *not a close*, and the search keeps going —
    which is the point, because a non-circular inhabitant may sit behind the circular one.

    ⛔ It costs one program load per candidate close. That is fine for measurement and
    **could never live inside the engine's inner loop**, which is why the cheap criterion
    below matters.

    ### 71.2 ⭐⭐⭐ THE LAW — `decSubderivNames` UNDER-approximates, so it may only ADMIT

    The shipped engine already owns the right invariant. `decSubderivNames(code, hole, decIdx)`
    (`prover-hyp.mjs`) walks the enclosing case arms **and `let`-inversions** to a fixpoint and
    returns the names that are structurally-smaller descendants of the decreasing binder,
    excluding the binder itself; `prover-comp-type.mjs` states the discipline outright — *"the
    IH rule's decreasing slot only accepts facts from decSubderivNames … so a generated call
    is structurally smaller BY CONSTRUCTION, morally total even though unverified."* It takes
    a hole POSITION, so the refinement search can consult it for one source walk, **no checker
    call and no reload**.

    Wiring it as a REJECTION test looked obviously right and was wrong within three targets:
    it refused **`multi_tps d1 [ |- S2]`**, a close Beluga verifies, because `d1` was not in
    the returned set.

    ⭐ **The reason is written in the function's own comment:** its `let`-inversion match
    requires a bare-identifier RHS on a single line, and *"both restrictions UNDER-approximate,
    so a miss costs a candidate, never a wrong one."* In the engine the set is used to **admit**
    an IH call, where an under-approximation is safe. **Using it to reject inverts its safety
    direction and turns every miss into a false refusal.**

    ⛔ **Standing law: `decSubderivNames` may only say YES.** It is a sound fast-ACCEPT and
    never a rejection criterion. Rejection needs ground truth. The final layering is:
    *cheap sound accept (`decDefinitelyOk`) → otherwise the crude all-inputs test → otherwise,
    under `LS3_STRICT`, the authority.*

    ### 71.3 ⚠️ THE A/B — a soundness mechanism, not a payload one

    Identical budget, declaration-verified metric, clean runs:

    | + `LS3_STRICT` | before | after | gains | losses | cost |
    |---|---|---|---|---|---|
    | solved control, 75 leaves | 57 | **58** | **1** | 0 | −0.7% calls |
    | residue, 36 leaves | 13 | **13** | **0** | 0 | 0.0% |

    The single gain is `unique-eval.bel#unique_eval`: the search's first close was
    `(unique_eval d f)` — the theorem on its own inputs — and once Beluga rejected it the
    search went on to find **`unique_eval [ |- D3] [ |- F3]`, the author's own term.** That is
    exactly the behaviour the mechanism was built for. It happened once in 111 leaves.

    ⛔⛔ **SO THE "13 OF 14 DIE ON TERMINATION" FINDING IS NOT 14 RECOVERABLE TARGETS.** That
    was the natural reading of entry 70.5 and it is wrong. Rejecting a circular close mostly
    converts a FALSE close into an HONEST FAILURE: only 1 of 14 had a valid alternative
    anywhere in the search's reach. The termination failures were never a pool of near-misses;
    they were places where the search had no right answer and had been reporting a wrong one.

    ⚠️ **A retraction, recorded because it nearly became a claim.** A mid-run spot check showed
    `mstep_app` closing with `[g |- refl]` and `idLogSub` with `Nil` where both had previously
    been circular, which looked like conversion. Both came from the BROKEN dec-rejection build
    of §71.2 and neither was declaration-verified; in the final configuration neither converts.
    **An unverified close is not a result** — the same law that entry 69 had to learn.

    ### 71.4 What this is worth, and why it still ships

    ✅ **KEEP `LS3_STRICT` for every reported number from this arc.** Its value is not the +1;
    it is that **no circular close can ever be banked**, which mandate §7 makes non-negotiable
    ("a percentage containing circular proofs is worse than a lower honest one") and which this
    project has violated five times. The cheap `decDefinitelyOk` fast-accept means the expensive
    reload is only paid on closes the engine's own criterion cannot already vouch for.

    ⛔ **It does not move the ceiling.** Entry 70.4's 13% stands unchanged: the composed design
    converts 3/23 of the hardest residue class with the author's structure handed over free.
    Termination was the largest *named* defect in the arc and closing it properly bought +1/111.
    That is the sixth verified-active mechanism in this project to measure ~zero, and the third
    in one day.

    ### 71.5 The composition test re-run under strict — the ceiling is unchanged and now honest

    | whole-target composition, residue (30 probed) | non-strict | **STRICT** |
    |---|---|---|
    | every leaf closed | 7 | **4** |
    | of those, declaration FAILS | 4 | **1** |
    | **DECLARATION VERIFIES** | **3** | **3** |

    ⭐ Strict mode changes the intermediate number and not the result: three of the four
    "every leaf closed" targets were closing on terms Beluga would refuse. **Entry 70.4's 13%
    (3/23) stands, and now nothing upstream of it is a false close.** This was re-measured
    rather than reasoned about, because "the number cannot change" is exactly the kind of
    claim this project has been wrong about before.

    ⚠️ **PROCESS FAILURE, recorded so it is not repeated.** The first strict run was scored
    against code I edited WHILE IT WAS RUNNING — each leaf spawns a fresh `node`, so jobs after
    the edit ran a different search. The outputs are quarantined as
    `*.CONTAMINATED-code-edited-mid-run` rather than deleted. This is the same family as the
    standing "never A/B beside a sweep" trap ([[prover-harness-traps]]): **a background sweep
    pins the code it runs on, so treat the source tree as frozen until it finishes.**

70. **⚠⭐ THE RESIDUE WALL, DECOMPOSED — AND THE BINDER RULES BUILT AGAINST IT: reach
    confirmed, payload +1/75 and 0/36.** (2026-08-22, second half.)

    ### 70.1 The wall is three walls, and they need different work

    Entry 69's residue run was scored by OUTCOME rather than by CAUSE, which hides what to
    build next. Re-scored by why each leaf failed (`scratch/probes/gap-forms.mjs`):

    | of the 36 residue leaves | all | **>10 tokens** |
    |---|---|---|
    | verified (declaration + `/ total /`) | 13 | **1** |
    | found, REJECTED for TERMINATION — a circular close | 4 | 3 |
    | not found, BUDGET exhausted (a search gap) | 6 | 4 |
    | **not found, SPACE exhausted (a GENERATION gap — no candidate applied)** | **13** | **8** |

    ⭐ **Half of the large-leaf wall is a generation gap**, and generation is the only
    category that has ever paid ([[feedback-generation-pays-search-control-does-not]]). So
    the next question is not "search harder", it is *which rule is missing*.

    ### 70.2 The missing rules, named from the data

    Classifying what the AUTHOR writes at every space-exhausted leaf: 4 of the 6
    budget-exhausted leaves want an LF lambda (`[g |- ... (c_res \w.C3[..,w]) ...]`,
    `[g |- subtype_forall E1 (\a.\w.E2)]`), and the generation-gap leaves are applications
    whose ARGUMENTS are binder terms (`Slam (mlam h' => fn s' => fn e => ...)`,
    `Acc [_] [_ |- _] [_ |- _] (mlam M', S => let ...)`).

    ⛔ **`leaf-synth3` implemented R3/R4/R5/R7/R9 and none of R1/R2/R8** — the three binder
    INTRODUCTION rules of entry 60.3 were simply absent. A goal that is an arrow or a Π has
    no other introduction (no constructor and no call produces a function type), so such a
    goal could only ever be closed by finding a variable already of exactly that type.
    Built, all three behind one change (they are one piece, not three —
    [[feedback-composite-moves-are-atomic]]):

    | | rule | fires when | binder name |
    |---|---|---|---|
    | R2 | `mlam X => ?` | comp goal begins `{X : U}` | **from the goal** (`h1`), so the body's references line up with what the checker prints |
    | R1 | `fn v0 => ?` | comp goal has a top-level `->` | invented, checked FRESH against every name bound in the hole's report (invariant 11) |
    | R8 | `\x. ?` | LF goal is a Π or an arrow | from the goal when it names one |

    ⚠️ Two implementation notes that cost real time. **A goal is often MULTI-LINE and
    terminated by `;` at the end of a LINE** — anchoring the terminator at end-of-string
    yields an EMPTY goal for exactly the arrow/Π shapes these rules exist to serve. And the
    arrow test must be at **bracket depth 0**: `({T:...} NeutVar ... -> ...) -> Sem ...` has
    an arrow inside its own premise.

    ⭐ **The rules demonstrably fire.** On `normeval-abbrev#subst` the search now builds
    `Slam (mlam h1 => (fn v0 => (fn v1 => ?)))` — the author's own skeleton
    (`Slam (mlam h' => fn s' => fn e => ...)`) with fresh names — and reaches the body goal.

    ### 70.3 ⚠️ THE A/B — reach is real, payload is not

    Identical budget (`--calls 200 --depth 6`), scored on the DECLARATION-VERIFIED metric:

    | | before | after | gains | losses |
    |---|---|---|---|---|
    | solved control, 75 leaves | 56 | **57** | **1** | 0 |
    | residue, 36 leaves | 13 | **13** | **0** | 0 |

    The single gain is `closconv.bel#addProjs`, closed with
    `[e : envr |- clam (\v0. proj nil z)]` — an R8 lambda, on a 21-token leaf, so it is
    genuinely the new rule and genuinely above entry 61b's cliff. Cost is a wash (residue
    −7.2% calls, control +5.0%).

    ⛔ **KEEP, BUT DO NOT COUNT AS A PAYLOAD MECHANISM.** They cost nothing, lose nothing, and
    the rule set is not the rule set without them — but **+1 in 111 leaves is the fifth
    verified-active component in this project to measure ~zero**, and it belongs in the
    mandate's §5 table beside precision, construction, structure and breadth. The reason is
    visible in the `subst` trace: the binder skeleton is one piece of an N-piece term, and
    the body still needs `f [h'] (mlam T => fn y => s' [ |- T] (s [ |- T] y))`. Arriving at
    the body is not the same as being able to write it — entry 42's law, again.

    ### 70.4 ⭐⭐⭐⭐ THE COMPOSITION TEST — the one cell of entry 60.4's table never measured

    Entry 60.4 predicted: *"structure 0/45 (entry 59) — handing over the case tree did not
    help because the LEAVES still demanded closed terms. Under refinement a leaf is just
    another goal."* The leaves half now exists, so the composition is measurable.

    ⛔ **A per-leaf score is NOT this score.** Entry 69's "targets with every leaf verified"
    synthesised each leaf while the OTHER leaves still held the AUTHOR's text. Leaves share
    metavariables (entry 67), so leaf *i+1*'s goal depends on what actually went into leaf
    *i*; filling the earlier leaves from the author while claiming to have synthesised them
    is a rigged experiment. `scratch/probes/ls3-whole.mjs` fills each leaf with OUR OWN term
    before attempting the next (`leaf-synth3 --fill i=TERM`), then checks the WHOLE
    declaration with `/ total /` restored (`ls3-verify-whole.mjs`).

    | whole-target composition | SOLVED CONTROL | **RESIDUE** |
    |---|---|---|
    | targets probed | 101 | 30 |
    | excluded (artifact leaf / shape / crash) | 28 | 7 |
    | every leaf closed | 65 | 7 |
    | **DECLARATION VERIFIES with `/ total /`** | **55 / 73 (75.3%)** | **3 / 23 (13.0%)** |

    The three are `church-rosser#conf`, `church-rosser#eq1`, `higher-order#fwd` — the same
    three the per-leaf estimate named, so the shared-metavariable concern did not bite here.

    ⭐ **This is the strongest form of the result and it must be read as a CEILING, not a
    gain.** These 30 are entry 61's hardest class — the targets where the engine contributed
    *nothing*. Handing over the author's own induction, case tree, contexts and bound
    hypotheses **for free**, and synthesising every leaf, converts **13%** of them.

    ⛔ **THE ARITHMETIC, AND IT IS THE POINT OF THIS ENTRY.** The residue denominator is 494
    ([[orca-research-brief-v3]]). Even at 13% *with a perfect structure oracle*, the fully
    composed refinement design is worth ≈64 targets ≈ **+7.5 points of corpus** — and it is
    gated on structure synthesis, which entry 59 measured at **0/45**. Two unsolved problems
    in series, the second one already falsified once, for at most single-digit points. **That
    does not close the mandate's arithmetic and it is not a fortnight-scale result.**

    ⚠️ **The one way this projection is unfair, stated so nobody has to rediscover it.** These
    30 are the hardest slice: entry 61 found 73.2% of residue targets need the FULL proof
    (engine contributed nothing) while 19.5% finished a genuine remainder. The easier ~27%
    were never sampled here and would presumably convert better, so ≈+7.5 points is a floor
    on the composed design's value, not a point estimate. It is still the right number to
    plan against, because **13% is a hard CEILING for this class no matter how the structure
    is obtained** — the structure was already perfect. Raising it requires better LEAF
    synthesis on large leaves (entry 61b's cliff, still 1/16 verified), and nothing else.

    ### 70.5 ⭐⭐ WHERE THE COMPOSED DESIGN ACTUALLY DIES: TERMINATION

    Of the targets that closed EVERY leaf and still failed the declaration —

    | cause | control | residue |
    |---|---|---|
    | **TERMINATION ("Recursive call")** | **9** | **4** |
    | other | 1 | 0 |

    **13 of 14.** The search's dominant declaration-level failure is not typing, not
    coverage, not writability — it is **recursion it is not entitled to make**. It closes a
    leaf with `complete ms`, `nbe t`, `idLogSub r`, stops, and Beluga rejects the whole
    declaration.

    ⛔ This is [[feedback-engine-can-bank-false-proofs]] arriving by a third independent
    route, and mandate §7 is explicit: *termination is OUR invariant*. The in-search guard
    built in entry 69 (refuse a self-call whose arguments are all top-level inputs) is **too
    weak** — it catches only the crudest form, because an argument that is pattern-bound can
    still fail to decrease on the MEASURED position. The engine already owns a decreasing-slot
    model (`decreasingArgIndex` / `decreasingBoxIndex`, entry 40); the refinement search does
    not consult it.

    ⭐ **This is the highest-reach named defect in the arc: 14 targets across both sets, and
    every one of them is a target where the search already found *something*.** But ⚠️ reach
    is not payoff — five times over in this project — and here the pessimistic case is real:
    the search stopped at the circular term, and a valid alternative may simply not be in its
    space. Any build here must be staked on CONVERSION, not on the 14.

    ### 70.6 Standing results from this half

    - ✅ **KEEP, zero-cost:** R1/R2/R8 (+1/111 leaves, 0 losses). The rule set is incomplete
      without them even though they do not pay.
    - ⛔ **DO NOT re-try iterative deepening** — measured negative twice (entries 68, 69).
    - ⚠️ **A leaf-index probe must distinguish `no-leaf` from `artifact-leaf`.** `leaf-synth3`
      returned one error for both, so a driver walking indices read "past the end" as "this
      target is an artifact" and scored a working target 0/1.
    - ⚠️ **`sound` shows an infinite regress**: `subtype_trans ? ?` regenerates its own goal
      shape, so the search recurses `subtype_trans subtype_top (subtype_trans subtype_top …)`
      until the depth cap, never reaching `subtype_forall`. A cycle check (refuse a subgoal
      α-equivalent to an ancestor) is the standard answer and is NOT heuristic pruning — but
      it is candidate control, which has 22 measured negatives behind it, so it needs a
      declared stake before anyone builds it.

    **Instruments added:** `gap-forms.mjs` (names the missing RULE behind each unclosed leaf)
    · `ls3-ab.mjs` (A/B two runs on the declaration-verified metric, gains and losses, never
    just totals) · `ls3-whole.mjs` + `ls3-verify-whole.mjs` (whole-target composition).
    ⛔ Zero engine files touched; the differential and suite are unchanged by construction.

69. **⭐⭐⭐⭐⭐ ORACLE-DIRECTED REFINEMENT — THE CHECKER ENUMERATES THE INHABITANTS, AND THE
    SEARCH STOPS GUESSING. Solved-leaf control 2/5 → 56/75 declaration-verified. The
    residue's 10-token cliff SURVIVES.** (2026-08-22, `scratch/probes/leaf-synth3.mjs`.)

    Entry 68 ended with an instruction — *diagnose which specific candidate is missing at
    the second subgoal, do not tune ordering blind*. Doing exactly that produced the largest
    single capability step this arc has measured, and then a stricter test took a third of
    it back. Both halves are below; the second half is the important one.

    ### 69.1 The diagnostic first (`scratch/probes/ls2-diag.mjs`)

    Walk the AUTHOR's own term through the primitive in the order the search fills holes,
    and at each step report whether the head the author used is in the search's candidate
    set and whether the checker accepts it. Four verdicts, each demanding a different fix:
    **MISSING** (generation gap) · **ARITY** · **REJECTED** (spelling gap) · **PRESENT**
    (ordering/budget only). On entry 68's five control leaves it returned, in seconds:

    | leaf | verdict | evidence |
    |---|---|---|
    | `multi_tps` | REJECTED at step 1 | we emitted `multi_tps [ \|- d1] ?` → *"This free meta-variable is illegal"*; bare `multi_tps d1 ?` → **OK 1** |
    | `lin_name_must_appear` | REJECTED at step 0 | `f ?` → **lfcheck.ml:962 "Pattern matching failed"** (an internal crash, not a type error); `f [g \|- ?]` → **OK 1** |
    | `mstep_appr` | STRUCT-REJ at step 0 | `[g \|- ?]` → *"This free context variable is illegal"*. The hole's context variable is **`y`**, not the author's `g` |
    | `mstep_leq_1`, `copy` | PRESENT throughout | the whole author path was already reachable; those two failed on BRANCHING alone |

    ⭐ **Not one of the five was a search-quality problem.** Three were emission defects with
    named fixes and two were budget. Entry 68's own instruction was worth more than any
    tuning would have been.

    ### 69.2 ⭐⭐⭐ THE FINDING — `Variables of this type`

    `%:checkinhole` REGISTERS its subgoals as real holes, so each can be `%:printhole`d, and
    that report ends with a line entry 60.2 noticed and nothing ever used:

    ```
      Goal: multi_step (leq "i1 N) ?N'_1617[^0][]
      Variables of this type: MS1';
    ```

    **The checker enumerates the type-correct inhabitants in scope, already spelled correctly
    for the level it is reporting at** — a Γ name bare at computation level (`d1`), a Δ name
    bare inside a box (`MS1'`). That turns rule R7 from "guess among 30–100 names" into a
    lookup with **branching 1**, and it dissolves the Δ/Γ spelling defect outright: we no
    longer decide whether to box a name, we emit it where the checker reported it.

    ⭐ It also gives R3 (box introduction) a second job. A Δ meta-variable is NOT listed at
    computation level, but `[Ψ |- ?]` drops the goal to LF and then it IS listed. So
    `multi_tps d1 [ |- S2]` — the author's exact term — is derivable with **zero guessing**:
    `multi_tps ? ?` → *vars: d1* → `[ |- ?]` → *vars: S2*. Four steps, no enumeration.

    ### 69.3 ⛔⛔ TWO HARNESS BUGS THAT EACH FAKED A VERDICT

    1. **THE HOLE STORE ACCUMULATES.** `checkinhole` never releases its subgoals: countholes
       goes 1→2 after one call, 2→4 after the next. Addressing "my subgoals are holes 1..n"
       reads a STALE hole from an earlier candidate — a plausible goal with a plausible
       variable list attached to the wrong position. Measured cost: **1/5** on the control,
       including one "success" that was an artifact.
    2. **HOLE IDS ARE SPARSE.** `countholes` counts LIVE holes, but ids are allocated
       globally and a FAILED `checkinhole` burns ids without leaving a hole. So `count - n`
       addresses holes that never existed: `printhole 3` answers *"No such hole by id '3'"*
       while countholes says 4. The search then refined against an EMPTY goal with an EMPTY
       variable list. Fix: ids only increase, so scan upward from the last live id.

    ⚠️ Both produced *lower* scores than the broken-free design, so neither announced itself.
    The tell was a control target closing in 2 calls with a one-token term.

    ### 69.4 What paid, what did not

    | change | control effect |
    |---|---|
    | ⭐ R7 from the oracle's `Variables of this type` | the whole step: `mstep_leq_1` 120 calls-and-fail → **5 calls** |
    | ⭐ context variables read from **Δ**, not the goal (`f [g \|- ?]` where the goal's own context is empty) | +1, and `lin_name_must_appear` 9 → 5 calls |
    | ⭐ **IH before sibling lemmas** — R5 is two rules (recursion, then cut), not one pool | **+1 gain / 0 losses**, `multi_tps` fail → 17 calls, and another target got cheaper |
    | ⛔ **iterative deepening** | **0 gains, 3–19× more expensive** (`mstep_leq_1` 5→96, `mstep_appr` 14→84). Entry 68 measured the same on the pre-oracle search. **Measured negative twice — do not try a third time.** Left behind `LS3_DEEPEN=1`. |

    ### 69.5 ⛔⛔ THE STRICTER TEST, AND WHY IT WAS NEEDED

    `%:checkinhole` elaborates with `mcid = None, mfs = []` (entry 67) — **deliberately no
    enclosing theorem, therefore no totality obligation** — and the harness strips
    `/ total /` besides. So `OK 0` means WELL-TYPED, never TERMINATING. Unguarded, the search
    closed leaves with `complete ms`, `tps d s`, `ceq_main e`, `nbe t`: **the theorem applied
    to its own untouched inputs.** That is the circular self-proof that has already banked
    five false COMPLETEs in this project.

    `scratch/probes/ls3-verify.mjs` is the fix and it is now mandatory for any number from this
    arc: splice the found term back into the declaration, **restore `/ total /`**, reload the
    whole program, and let Beluga's own coverage and termination checks rule.
    ⚠️ An in-search heuristic guard (refuse a self-call whose arguments are all top-level
    inputs) was also built and is **too weak** — it caught 2 of the 12 circular closes.
    **Trust the verifier, not the guard.**

    ### 69.6 THE NUMBERS (control first, gap-first, both metrics reported)

    | SOLVED CONTROL — 75 genuine leaves, one target per development across 101 developments | |
    |---|---|
    | entry 68's search (`leaf-synth2`), hole-local | 2 / 5 |
    | this search, hole-local | **67 / 75 (89.3%)** — median **4** checker calls |
    | **this search, DECLARATION-VERIFIED with `/ total /`** | **56 / 75 (74.7%)** |
    | closes rejected by Beluga's termination check | **8** |

    | RESIDUE — the 36 genuine leaves of the 30 targets entry 61 showed the engine cannot touch at all | |
    |---|---|
    | hole-local closes | 17 / 36 (47.2%) |
    | **declaration-verified** | **13 / 36 (36.1%)** |
    | ≤10 tokens, verified | 12 / 20 (60.0%) |
    | ⛔ **>10 tokens, verified** | **1 / 16 (6.2%)** |
    | targets with EVERY leaf verified | 3 / 23 (`conf`, `eq1`, `fwd`) |

    ### 69.7 ⛔ THE HONEST READING — the cliff is not broken

    Entry 61b measured a hard cliff at ~10 tokens: **0 of 16** large residue leaves proposed.
    Hole-locally this search reaches 4/16 there; **after declaration-level verification that
    falls to 1/16.** The other three were circular closes or unwritable names. So:

    - ⭐ **Leaf synthesis below the cliff is now a solved problem** — 60% of small residue
      leaves and 76% of small solved leaves close and verify, at a median of 4–8 checker
      calls. That capability did not exist this morning.
    - ⛔ **Above the cliff nothing has changed.** 1/16 is not a crack in entry 61b's finding;
      it is a rounding error on it. The large-leaf wall is still the wall.
    - ⛔ **None of this is a corpus completion.** Every run splices the author's own
      prefix(maxDepth-1), so the induction, case tree, contexts and bound hypotheses are all
      HANDED OVER. "3 targets with every leaf verified" means *closeable given the structure*,
      and entries 59/61 measured that the engine cannot produce that structure. The ledger is
      unchanged at **273/850**.

    ### 69.8 The named next steps, in order of measured cost

    1. **The unwritable context variable.** `%:printhole` reports the hole's context as `y`;
       the primitive accepts `[y |- ?]`, and the source then rejects it — *"This free context
       variable is illegal"* (`mstep_appr`, verified FAIL). The primitive's namespace and the
       source's namespace are not the same namespace, which is invariant 11 reappearing at a
       new boundary. Map the reported context to the enclosing declaration's own binder.
    2. **Compose the two halves.** Entry 60.4 predicted *"structure 0/45 (entry 59) — handing
       over the case tree did not help because the LEAVES still demanded closed terms."* The
       leaves half now exists. Oracle-structure + oracle-leaves is the one cell of that table
       never measured, and it is cheap: both instruments are built.
    3. **The large-leaf wall, restated quantitatively.** The question entry 61b posed is
       still open and is now sharper: of the 15 large residue leaves that do not verify, how
       many fail for TERMINATION, how many for WRITABILITY, and how many because the search
       genuinely cannot find any inhabitant? That is a three-way split of a 16-target class
       and it decides what the fortnight does next.

    **Instruments (all new, all reusable):** `ls2-diag.mjs` (which candidate is missing, and
    why) · `ci-ask.mjs` (ask the primitive any expression at a leaf — the cheapest probe in
    this arc; test a spelling hypothesis in one command) · `leaf-synth3.mjs` (the search) ·
    `ls3-score.mjs` (control-first scoring) · **`ls3-verify.mjs` (declaration-level
    verification — no number from this arc may be quoted without it)**.
    ⛔ Zero engine files were touched; nothing shipped into `js/editor-src/`, so the
    differential and suite are unchanged by construction.

68. **⚠⭐ THE SEARCH ON TOP OF THE PRIMITIVE — 0/2 → 2/5 on SOLVED leaves after three real
    bugs. Working, weak, no payload claim yet.** (2026-08-22, `scratch/probes/leaf-synth2.mjs`.)

    With entries 65–67 the refinement step is a primitive: propose `head ? ... ?`, receive
    the argument goals. `leaf-synth2` is the obvious search over it — candidates are the
    goal family's constructors, in-scope names, and sibling/self calls; on OK, recurse into
    each subgoal and substitute back.

    **It closes nothing.** Control on SOLVED targets: **0 of 2** (the third was an
    artifact leaf). `copy`'s leaf is `[g |- app F1 F2]` — 6 tokens, trivially reachable —
    and 120 calls do not find it. On residue leaves, likewise 0.

    ⛔ **So its residue failures say NOTHING**, exactly as with `leaf-synth.mjs` (1/13
    control) and `refine-search.mjs` (8.3% parity). **Third search in this arc whose control
    invalidates its own null.** The primitive is verified; the search over it is not.

    ### One real bug already visible, and one design gap
    - The first cut proposed ONLY constructors of the goal's family, all BOXED — so on
      `eq1`, whose author term is `appd [g |- ...] [g |- ...]`, the correct head (a SIBLING
      CALL, computation-level, unboxed) was never proposed at all. Fixed; still 0.
    - `copy`'s goal prints as `[g |- term "i[]]` — carrying an unwritable `"`-prefixed name
      (invariant 11 again). Candidate terms are built by string substitution into that goal,
      so the writability problem that closed ascription (entry 64) is back inside the search.
      **The primitive avoids the namespace problem; a search that reassembles TEXT does not.**
      That is the likely root cause and it is the first thing to check next.

    ### ⭐ THREE BUGS FOUND BY THE CONTROL, ALL STRUCTURAL
    The control run (0/2, including a 6-token leaf) was not a verdict on the design — it was
    a bug detector, and it found three:
    1. **A TRAILING SEMICOLON.** `%:printhole` ends its Goal line with `;`. With it attached
       `decomposeContextual` sees no box, so candidates came out UNBOXED, and for
       `[g |- step* ...];` the family resolved to **null** so nothing was proposed at all.
       One character made the search inert.
    2. **FRAGMENT vs WHOLE TERM.** `%:checkinhole H EXPR` types EXPR against HOLE H's goal;
       it cannot type a FRAGMENT against a subgoal. The first version recursed into a
       subgoal and asked `checkinhole 0 [g |- F1]` — "does F1 inhabit the TOP-LEVEL goal?".
       The state must be the WHOLE partial term, replacing one `?` at a time.
    3. **BOX NESTING.** Substituting a boxed piece into an existing box yields
       `[g |- app [g |- F1] ?]`. Inside a box an argument is an LF TERM. Bracket depth at
       the hole decides which form to insert.

    | control, SOLVED leaves | closed |
    |---|---|
    | before the fixes | 0 / 2 |
    | **after** | **2 / 5** |

    ```
    copy         goal [g |- term "i[]]                found [g |- app E1 E2]      16 calls
    mstep_leq_1  goal [ |- multi_step (leq "i1 N) ..]  found [ |- ms_tr MS1' MS2']  17 calls
    ```
    ⭐ `copy` closes with a term the author did NOT write (`app E1 E2` vs `app F1 F2`) —
    correct behaviour: any well-typed inhabitant closes the leaf. `mstep_leq_1` reproduces
    the author's term exactly.

    ⚠ **Still 3 of 5 unclosed, and all three want a CALL** (`multi_tps d1 [|- S2]`,
    `lin_name_must_appear [g |- linQ]`, `[g |- m-step (rappr S) MS'']`). Calls are generated
    but with a naive arity and no argument guidance, so they burn the budget. That is the
    next thing to fix, and it is a candidate-generation problem, not a primitive problem.

    ### ⚠ Iterative deepening: tried, NO CHANGE (still 2/5), and it costs
    Plain DFS spends its budget in the first bad subtree, so deepening (with an ask-cache
    so prefixes are not re-paid) was the obvious fix. **2/5 before, 2/5 after**, and `copy`
    went 16 -> 56 calls. Recorded so it is not re-tried.
    ⛔ The three failures are NOT a depth problem: `multi_tps ? ?` **is** proposed and
    **does** type (OK 2, subgoals returned), and `multi_tps d1 ?` types too (OK 1). The
    pieces are all reachable; the search still does not assemble them. **Diagnose which
    specific candidate is missing at the second subgoal before touching the search again**
    — do not tune ordering blind.

    ⛔ **NO PAYLOAD CLAIM.** A 2/5 control is far too weak to interpret any residue number;
    the bar for that remains control parity (>=80%, entry 60.11). Do not run the residue
    until the control is high.
    ⭐ **The lesson this arc keeps paying for:** a search's control must be run BEFORE its
    results are read, every time. Three searches, three invalidating controls, zero wasted
    conclusions — because the control was run each time.

67. **⭐⭐⭐⭐⭐ SUBGOAL EXTRACTION — THE REFINEMENT STEP IS NOW A PRIMITIVE, AND IT CARRIES
    SHARED METAVARIABLES ACROSS THE INCOMPLETE TERM.** (2026-08-22.)

    Entry 65 left `%:checkinhole` reporting "OK 0": no subgoals. **Cause, located exactly:**
    `Reconstruct.elExp` at an `Apx.Comp.Hole` (reconstruct.ml ~1149) calls `Holes.allocate`
    — it reserves an ID and builds `Int.Comp.Hole`, but never `Holes.assign`s the context
    and goal. The assignment happens in **`Check.Comp.check`** (check.ml ~1076). Elaboration
    alone registers nothing, so `Holes.catch` returns []. Harpoon's
    `elaborate_checkable_expression` calls `Check.Comp.check` for exactly this reason.
    Added that call (`mcid = None`, `mfs = []` — no enclosing theorem, so no totality
    obligation on a hypothetical term), plus LF-subgoal printing.

    **On a real corpus leaf (`church-rosser#eq1`):**
    ```
    %:checkinhole 0 appd ? ?
      OK 2;
      SUBGOAL [g |- step* (app (lam (\x0. M2)) M2) (?M'_1696[^0][..])];
      SUBGOAL [g |- step* (?M'_1696[^0][..]) (M1'[.., M2'])];
    ```
    and for LF holes (`church-rosser#conf`):
    ```
    %:checkinhole 0 [g |- conf_result ? ?]
      OK 2;
      SUBGOAL-LF [g |- pred* "i5 (?N_1117[^0][..])];
      SUBGOAL-LF [g |- pred* "i2 (?N_1117[^0][..])];
    ```

    ⭐⭐⭐ **NOTE THE SHARED METAVARIABLE.** `?M'_1696` appears in BOTH subgoals of `appd`,
    and `?N_1117` in both of `conf_result` — the intermediate term the two arguments must
    agree on. **That is precisely the "constraint store carried ACROSS an incomplete term"
    that entry 62c named as the one direction the walls did not enclose.** It is not
    enumerated; it is determined by unification and handed back. The engine never guesses it.

    ⇒ **A refinement step is now: propose `c ? ... ?` -> receive the argument goals with
    their shared unknowns -> recurse.** That is the loop entries 56–64 could not build, and
    the reason they could not was the declaration-level round trip, not the type theory.

    ### ⚠ Known costs and gaps before this goes in a search
    - **`checkinhole` MUTATES the hole store**: subgoals are added globally (countholes
      1 -> 3 after one call). A search loop must reset or account for it.
    - **One process per program** is still required (entry 66's global-store contamination).
    - The native binary still cannot be relinked here; everything runs through
      `beluga_web.bc.js` under `scratch/probes/bw-driver.mjs`.
    - ⛔ Still NO payload measurement. Reachability improved (entry 66: 8 of 23 blocked
      leaves now have a path); **no target has been proved by any of this.**

66. **⭐⭐⭐⭐ MEASURED THROUGH `%:checkinhole`: INCREMENTAL PATHS EXIST FOR 8 OF THE 23 LEAVES
    THE DECL-LEVEL CHECKER DECLARED IMPOSSIBLE. The wall was the round trip.**
    (2026-08-22, `scratch/probes/tp-one.mjs` + `tp-run.sh`.)

    Entry 62c measured incremental construction as blocked: walking the author's own term
    prefixes through the WHOLE-FILE checker, 13 of 16 large leaves failed at depth 1 with
    *"Leftover meta-variables"*. Entry 65 built `%:checkinhole`, which elaborates in the
    hole's own context and bypasses declaration-level reconstruction. Re-ran the identical
    experiment through it.

    ⛔ **ONE PROCESS PER LEAF IS MANDATORY.** OCaml's signature store is GLOBAL and the
    shim's `reset` does not clear it; a 36-leaf batch in one runtime scored the positive
    control at **1/36**, while the same targets pass in isolation. That near-miss would have
    been reported as "the primitive does not work on real corpus targets".

    | controls (36 leaves, one process each) | |
    |---|---|
    | author's own term accepted | **35 / 36** |
    | nonsense term accepted | **0 / 36** |
    | errors / timeouts | 0 |

    | incremental path exists | decl-level (62c) | **via `%:checkinhole`** |
    |---|---|---|
    | all leaves | 13/36 | **20/35 (57.1%)** |
    | **> 10 tokens** | **1/16 (6.3%)** | **4/15 (26.7%)** |
    | leaves 62c called impossible | — | **8 / 23 now passable** |

    ⭐⭐ **So a QUARTER of the large leaves that the engine's own checker calls unreachable
    are reachable step-by-step once the declaration-level round trip is removed** — and 8 of
    the 23 blocked leaves have a full path. Entry 62c's conclusion ("top-down blocked at the
    root") was an artifact of asking the question through whole-file reconstruction.

    ⚠ **This is a REACHABILITY result, not a payload result** — the fourth time that
    distinction has mattered in this arc. It says a refinement search now has somewhere to
    go on these leaves; it does not say a search will find it, and 11 of 15 large leaves
    still have no path. Do not quote 26.7% as a conversion figure.

    ### What is needed before a search can use this
    1. **Subgoal extraction** (entry 65's gap): `?` elaborates to an internal metavariable,
       not a store-registered hole, so `Holes.catch` reports none. Path EXISTENCE needs no
       subgoals; a search that DESCENDS into an argument does. This is the next OCaml
       increment and it is small.
    2. **Cost**: one process per leaf, ~25 MB of JS booted each time, because the native
       binary cannot be relinked in this environment. Fine for measurement, useless inside a
       search loop — a search needs a long-lived process, which needs the global-store
       contamination understood rather than worked around.

65. **⭐⭐⭐⭐ `%:checkinhole` — THE MISSING PRIMITIVE, BUILT AND VERIFIED. Beluga WILL type an
    incomplete term; it just would not do it at DECL level.** (2026-08-22.)

    ⚠ **SECURITY BOUNDARY: `src/core/command.ml` is normally OFF LIMITS. The user granted
    this edit explicitly** ("sure!", 2026-08-22, after being asked). Purely additive: one new
    command + one factored-out parse helper; no existing code path altered.

    **What it does.** `%:checkinhole H EXPR` elaborates EXPR against hole H's goal type
    **in H's own cD/cG**, and reports the subgoals. Local scoping is done exactly as Harpoon
    does it (`src/harpoon/prover.ml`: `add_all_mctx` / `add_all_gctx` under a bindings
    checkpoint, then `Reconstruct.elExp`), wrapped in `Holes.catch`.
    Implementation: `State.elaborate_in_hole` beside `read_comp_expression_and_infer_type`
    (which elaborates in the EMPTY context — §9.3's documented gap), plus the command itself.

    **⭐ THE RESULT, on the exact shape that defeated entries 56–64:**
    ```
    %:checkinhole 0 mk x x   ->  OK      (complete term)
    %:checkinhole 0 mk ? ?   ->  OK      (INCOMPLETE — decl level says "Leftover meta-variables")
    %:checkinhole 0 mk x ?   ->  OK
    %:checkinhole 0 x        ->  FAIL: Ill-typed. Expected P [ |- b], inferred [ |- tm b]
    ```
    The check is genuine, not vacuous — it finds `x` in the hole's `cG` (which `%:type`
    cannot) and rejects it for a real type error. **And on real corpus targets it accepts the
    author's own leaf term**: `conf`, `red_rew_impl_fstepcong`, `eq1` all `OK`.

    ⇒ **Entry 62c's wall was the DECL-LEVEL ROUND TRIP, not the type theory.** Beluga can
    type a partially-applied term perfectly well; what it refuses is a whole DECLARATION
    containing undetermined implicits, and the annotation it suggests is unwritable (entry
    64). Bypass the declaration and the refusal disappears.

    ### ⚠ Two things NOT yet delivered — do not overstate this
    1. **Subgoal types are not extracted.** `Holes.catch` returns 0: `?` elaborates to an
       internal metavariable, not a store-registered hole, so the SUBGOAL lines never fire.
       Path EXISTENCE can be measured without them; a search that DESCENDS needs them.
    2. **No corpus measurement yet.** A batch run scored the positive control at 1/36 —
       **global-state contamination**, not a real result: OCaml's signature store is global,
       `reset` does not clear it, and the same three targets that fail in-batch all pass
       `OK` in SEPARATE PROCESSES. The batch harness needs one process per target.

    ### Build notes (this environment)
    - ⛔ **The native `main.exe` CANNOT be relinked here**: the mingw toolchain fails on
      `-lws2_32` (`cygpath` error). `dune build src/core/beluga.cma` succeeds, so the OCaml
      is correct — only the final C link is broken.
    - ✅ **`dune build src/web/beluga_web.bc.js` works**, and the new command is reachable
      through the shim's `runCommand`. `scratch/probes/bw-driver.mjs` boots that 25 MB artifact
      in node (it needs `require` injected into the vm sandbox for js_of_ocaml's node
      device). **This is how to run Beluga when the native binary cannot be built.**

    ⛔ **A patch that reports success is not a patch that landed — THREE scripted edits to
    these files printed success while leaving the file unchanged.** Every one was caught by
    grepping for the new text. Use the editor tool for OCaml, and grep afterwards.

64. **⛔⭐ ASCRIPTION — THE FIX BELUGA ITSELF NAMES — IS UNWRITABLE. 0/15, and the reason is
    the finding.** (2026-08-22, `scratch/probes/ascribe-probe.mjs`.)

    The wall of 62c is `c ? ? ?` rejected with *"Leftover meta-variables in computation-level
    expression; **provide a type annotation**"*. Every probe to that point varied the PENDING
    FORMER (`?` / `_` / mixed). **None supplied the annotation the checker explicitly asks
    for** — and ascription IS a grammar former (`Expression !ann ":" CompType`), with the
    hole's goal type printed right there in the hole report.

    | 15 previously-blocked large leaves | accepted |
    |---|---|
    | plain (no annotation) | 0 |
    | `(c ? ? ? : GOAL)` | 0 |
    | `(c _ _ _ : GOAL)` | 0 |
    | same, unwritable names underscored | 0 |

    ⭐⭐ **THE DIAGNOSIS IS IN THE ERROR CHANGE.** Ascribing moves the failure from
    *"Leftover meta-variables"* to **"This free meta-variable is illegal"** /
    *"This free context variable is illegal"*. The hole report prints its goal as
    `Reduce [ |- A] [ |- M]`, where `A` and `M` are RECONSTRUCTION-INVENTED names with no
    source binding. **The annotation the checker demands cannot be written, because the type
    it hands us is in a namespace the source cannot reference** — invariant 11 / D11, now
    biting on the one repair the checker itself recommends.

    ⇒ **This is the sharpest argument yet for the §9.4 shim route.** The obstruction is the
    ROUND TRIP THROUGH PRINTED SYNTAX: Beluga knows the type, prints it unwritably, and we
    cannot hand it back. A call to `Check.Comp.check` / `Reconstruct.elExp'` with the
    INTERNAL type object never serialises, never re-parses, and has no namespace problem.
    ⚠ But note `src/web/dune` builds `beluga_web.ml` to **JS only** (`(modes js)`), while the
    entire measurement stack drives the NATIVE `main.exe`. A shim primitive is not reachable
    from the current harness without either a node/js_of_ocaml driver or a native command
    (which lives in `src/core/command.ml` — outside the standing permission; ASK).

    ⚠ **Partial test, stated as such.** Underscoring mangles substitution variables (`$S` ->
    `$_`), so several underscored variants died with parse errors and are NOT fair tests.
    Three underscore cleanly (`Reduce [ |- _] [ |- _]`, `[ |- norm _]`, `Sem [h] [ |- arr _ _]`)
    and still fail, and plain ascription with the exact printed goal is a clean 0/15.

63. **⛔ `%:solve-lf-hole` — BELUGA'S OWN SOLVER, POINTED AT THE RESIDUE'S LEAVES. It WORKS,
    and it does not help. Plus two false positives my own parser manufactured.**
    (2026-08-22, `scratch/probes/solve-lf-probe.mjs`.)

    `%:solve-lf-hole N` is in the 23-command interactive table and **this project had never
    used it**. It points `logic.ml` — 6,155 lines of proof search, `Logic.Options.enableLogic`
    defaulting to `true` — at an LF hole. Since entry 62c's wall is "arguments must be
    DETERMINED, not searched", a solver that determines them would be the door, and it needs
    no shim and no rebuild.

    **The primitive is real** — positive control on `[ |- eq c c]` returns `refl`. Two
    controlled facts about it:
    1. It PRINTS its answer and then raises `Beluga.Logic.Solver.End_Of_Search` on
       exhaustion. **The exception is not failure**; the term arrives before it.
    2. On an UNCONSTRAINED goal it **DIVERGES** — a bare `[g |- tm]` hole never returned in
       2 minutes. Every invocation needs its own timeout.

    **On the residue's LF leaves, with every answer VERIFIED by splicing it back: 0 / 3.**

    ⛔⛔ **TWO FALSE POSITIVES, BOTH MINE, BOTH CAUGHT ONLY BY VERIFICATION.**
    - `conf` reported SOLVED with the answer **`Bye bye`** — the interactive QUIT message,
      captured as a term by a response parser that accepted any non-empty segment.
    - `red_rew_impl_fstepcong` reported SOLVED with
      `fsc F2 (c_sym (c_sym (c_sym (c_sym (…` — the solver's iterative deepening emitting a
      divergent enumeration, which does not type-check when spliced back.
    Unverified, this would have been written up as **"2/3, the door is open"**. The rule that
    caught it: **an answer from an oracle is not an answer until it is put back and CHECKED.**

    ⚠ **A patch that reports success is not a patch that landed.** Two consecutive scripted
    edits to this probe printed their success message while the file kept its original text;
    only `grep`-ing for the new comment revealed it. The project law — *verify a patch landed
    by grepping the NEW TEXT, never by a success message* — earned its place again.

    ⇒ **Why it does not help, and this is consistent with 62c.** `logic.ml` searches for an
    inhabitant of an LF type. The residue's leaves are large CONTEXTUAL terms whose shape is
    fixed by the surrounding proof, and an unconstrained search either diverges or returns a
    different inhabitant that does not fit. The solver determines nothing the goal does not
    already determine — which is exactly the gap 62c named.
    ⛔ Do not re-run this as a payload experiment. Keep the two controlled facts; they are the
    useful residue.

62c. **⭐⭐⭐⭐ THE CONSOLIDATED RESULT — THE CHECKER PERMITS ONE PENDING ARGUMENT, NOT MANY.
    Top-down construction is blocked at the ROOT; bottom-up is exponential. That is the
    cliff.** (2026-08-22, `scratch/probes/term-path2.mjs`. Supersedes both 62 and 62b.)

    Entry 62 said the interface cannot hold an incomplete term (uniform-`?` probe, 1/16).
    Entry 62b showed it can (arity-exact single blank, 12/15). **Both were partial.** Re-ran
    the PATH question under the per-argument rule — at each depth try all-`_`, then each
    single-`?`-rest-`_`, and pass the depth if any assignment checks:

    | large leaves (> 10 tokens) | full incremental path exists |
    |---|---|
    | uniform `?` (entry 62) | 1 / 16 |
    | **per-argument `?`/`_` (62b's rule)** | **2 / 16 (12.5%)** |
    | previously blocked leaves now passable | 1 / 23 (4.3%) |

    ⭐ **THE RECONCILIATION, and it is exact.** The single-blank test had every OTHER argument
    holding the author's REAL term — that is the LAST step of a path. A path needs the FIRST
    step, where most of the term is still pending. So:

    > **Beluga accepts a term with ONE pending argument among concrete ones.**
    > **Beluga rejects a term with MOST arguments pending.**
    > Therefore top-down refinement can take its FINAL step but not its FIRST: 13 of 16 large
    > leaves are blocked at depth 1, and the per-argument rule moves that by one target.

    ### What this leaves, structurally
    - **Top-down (refine from the root)** — blocked by the checker at the root. Not a search
      failure: the intermediate states are not expressible.
    - **Bottom-up (build subterms, then apply)** — the only shape the checker permits, and it
      is what entry 58's inhabiter did: depth 2, caps 4/8/16, **0/45**. To reach a 20–40 token
      term bottom-up you need depth ~5, which is exponential in the branching. Confirmed
      empirically by caps ×128 changing 207/207 verdicts by nothing.
    - ⇒ **The cliff is the intersection of those two walls**, and every mechanism of entries
      56–61 lived inside it.

    ### ⭐ The one direction the walls do not enclose
    Bottom-up is exponential only because the arguments are SEARCHED. If they were
    DETERMINED — solved by unification against the goal rather than enumerated — the
    exponential disappears: that is how Twelf's `logic.ml`, Synquid and SuSLik build large
    terms. This needs a metavariable/constraint store carried ACROSS an incomplete term.
    ⚠ **Not entry 57's unifier**, which typed SLOTS and measured 0; the distinction is that
    constraints must persist across the whole partial term, not be recomputed per slot.
    Reachable two ways, both inside the security boundary: an internal store, or §9.4's
    `Reconstruct.elExp'` / `Check.Comp.check` via `src/web/beluga_web.ml` (~30 lines + one
    `_rebuild`; ⛔ the rebuild chain is NEVER run unbidden — ask first).

    ⛔⛔ **METHOD, RECORDED AGAINST MYSELF.** Entry 62 stated a structural impossibility from a
    probe with an arity bug in its own output; 62b overturned it within the hour; 62c shows
    62's CONCLUSION was substantially right and its ARGUMENT was wrong. **A conclusion that
    survives only because its refutation was also flawed is not knowledge.** The rule this
    buys: before writing "cannot", build the control that would show "can" — and when a
    correction arrives, re-run the ORIGINAL question, not just the corrected sub-claim.

62b. **⛔⛔⛔ ENTRY 62 IS WRONG — CORRECTED WITHIN THE HOUR. BELUGA DOES ACCEPT INCOMPLETE
    TERMS; MY PROBE BLANKED THEM UNIFORMLY.** (2026-08-21, `scratch/probes/one-blank.mjs`.)

    Entry 62 concluded that the oracle interface **cannot** hold an incomplete term, from
    13 of 16 large leaves failing at prefix depth 1 with *"Leftover meta-variables"*. That
    experiment emitted **all-`?` uniformly** — and `partial-forms` then produced `Acc _ ×24`
    and `LogArr _ ×12`, i.e. WRONG ARITY, so its "Type-checking error" verdicts were my bug.

    The arity-exact test: take the author's COMPLETE, known-good term and blank exactly ONE
    top-level argument, keeping every other argument and the arity exact.

    | 15 large "blocked" leaves · 77 single-argument blanks | |
    |---|---|
    | blanks accepted with `?` | 19 / 77 |
    | blanks accepted with `_` | 16 / 77 |
    | **leaves where SOME single blank is accepted** | **`?` 12/15 · `_` 5/15** |

    ```
    mstep_app   trans1' ? a2      OK     trans1' a1 ?      OK
    nbe         reify _ _ a3      OK     reify a1 a2 ?     OK
    weakNorm    reify _ _ _ a4    OK     reify a1 a2 a3 ?  OK
    ```

    ⭐ **The pattern:** an argument the others DETERMINE accepts `?`; an argument
    reconstruction can SOLVE accepts `_`. Neither former works everywhere, and the correct
    choice VARIES PER ARGUMENT — which is why a uniform `?` (entry 62) and a fixed
    one-`?`-rest-`_` pattern (`partial-forms`) both scored 0.

    ⇒ **Incremental construction IS available in the existing interface, with no shim and no
    rebuild.** The refinement step is not "apply a constructor with holes" but:
    **choose ONE argument position to defer, mark the rest `_`, and let reconstruction
    solve them.** With arity n that is n cheap variants, and the checker arbitrates.

    ⛔⛔ **METHOD FAILURE, RECORDED AGAINST MYSELF.** Entry 62 was written as a structural
    impossibility — *"not 'has not yet': cannot"* — on a uniform-choice probe with a known
    arity bug visible in its own output (`Acc _ ×24` should have stopped me). **A negative
    that strong demands the arity-exact control BEFORE it is written down, not after.** The
    error was caught only because the next experiment was run at all.
    ⚠ `subst` fails every blank with "Failed to parse" — blanking inside a nested binder
    breaks syntax; a probe artifact, not a verdict. 3 of 15 remain genuinely blank-resistant.


62. **⛔ SUPERSEDED BY 62b — THE CONCLUSION BELOW IS FALSE AS STATED. Kept because the
    ROUTE-1 half (whole-term guessing is exponential; the ~10-token cliff) still stands, and
    because the way it failed is the lesson.** THE ARCHITECTURAL RESULT — THE ORACLE
    INTERFACE CANNOT PRODUCE THE RESIDUE'S
    TERMS. Both routes are closed, and this explains EVERY zero in entries 56–61.**
    (2026-08-21. `scratch/probes/term-path.mjs`.)

    A term can be produced two ways. Both are now measured, and both are shut.

    **ROUTE 1 — present the term COMPLETE and let the checker judge it.** This is what the
    engine does. Cost of guessing a correct size-n contextual term is exponential in n.
    Measured cliff (61b): the engine proposes 40% of author leaves at <= 10 tokens and
    **0 of 16 above it**; widening every cap 128× changed 207/207 verdicts by nothing
    (it enumerates more terms of the SAME size). 44% of residue final leaves are past 10.

    **ROUTE 2 — build the term INCREMENTALLY, each step small.** The only method that does
    not pay the exponential. Tested directly, using the author's own term as the path
    oracle: emit its prefixes (`?`, `c ? ?`, `c (d ?) ?`, …) and CHECK EACH. This asks
    whether the path EXISTS, independent of whether any search finds it — necessary because
    my refinement search closes only 1 of 13 leaves on SOLVED targets (7.7%) and its nulls
    are therefore uninterpretable.

    | 36 genuine leaves | incremental path exists |
    |---|---|
    | <= 10 tokens | 12 / 20 (60.0%) |
    | **> 10 tokens** | **1 / 16 (6.3%)** |

    ⛔⛔ **AND 13 OF THE 16 ARE BLOCKED AT PREFIX DEPTH 1 — THE VERY FIRST STEP.**
    ```
    [g |- r_str ? ? ?]   ->  Leftover meta-variables in computation-level expression
    [g |- fsc ? ?]       ->  Leftover meta-variables in computation-level expression
    appd ? ?             ->  Leftover meta-variables in computation-level expression
    ```
    Write the CORRECT constructor with holes for its arguments and Beluga refuses it,
    because the implicit arguments are not yet determined. 9 of the blocks are exactly this
    error; the rest are the generic type error.

    ⭐⭐⭐ **THE CONCLUSION, AND IT IS STRUCTURAL RATHER THAN EMPIRICAL.**
    > **Beluga will not accept an incomplete term whose metavariables are undetermined.**
    > So a term cannot be built through the checker step by step; it must be presented
    > complete. Presenting it complete means guessing it, which is exponential in its size.
    > **The oracle interface — one bit plus an error string, terms presented whole — is
    > therefore incapable of producing the residue's large leaves. Not "has not yet":
    > cannot.**

    ### This explains every result of this arc with ONE mechanism
    - precision, construction, structure, breadth, rule completion, focusing, the inhabitant
      oracle, let-composition — **eight zeros**: each helped SELECT or ARRANGE, none changed
      whether a large term can be presented at all.
    - refinement search **8.3% control parity**: its steps are exactly the intermediates
      Beluga rejects, so it dead-ends at depth 1 on precisely the hard leaves.
    - the **71% / 73%** reachability result: handed everything but the leaves, the engine
      fails, because the leaves are the part the interface cannot express.
    - the **~10-token cliff**: the boundary between terms small enough to guess whole and
      terms that would have to be built.

    ### ⭐ THE ONLY REMAINING ROUTE, NOW PRECISELY SPECIFIED
    Hold an INCOMPLETE term with unsolved metavariables and solve them by UNIFICATION,
    internally, never consulting the checker until the term is complete. That is what every
    system that scales here has (Twelf's `logic.ml`, Synquid, SuSLik) and what this engine
    refuses to have on principle.
    Two ways in, both inside the security boundary:
    1. **A real internal metavariable/constraint store** — entry 57's unifier was built for
       SLOT TYPING and measured 0; this is a different use of the same component: carrying
       constraints ACROSS an incomplete term. That distinction is the whole point and must
       not be confused with the entry-57 null.
    2. **§9.4's shim route** — `Reconstruct.elExp'` / `Check.Comp.check` called from
       `src/web/beluga_web.ml` (the ONE editable OCaml file; `harpoon_core` and `Logic` are
       already linked) with a meta-context, giving exactly the "type this incomplete term"
       primitive the 23-command table does not expose. ~30 lines + one `_rebuild`.

    ⛔ **What must NOT happen next:** a ninth mechanism that generates, selects, ranks or
    prunes complete terms. That family is closed by measurement and now by argument.
61. **⭐⭐⭐ THE PER-STEP REACHABILITY AUDIT — THE ENGINE CANNOT SUPPLY EVEN THE LAST STEP OF
    71% OF RESIDUE PROOFS. The wall is LEAF-TERM SYNTHESIS, isolated with every confound
    stripped.** (2026-08-21. `scratch/probes/{author-prefix,reach-audit}.mjs`.)

    **THE METHOD.** Decompose each author proof into depth-prefixes (prefix(0)=`?`,
    prefix(k) reveals k nested constructs with sub-bodies as holes, prefix(N)=the whole
    proof). Splice prefix(k) into the orchestrated masked program and let the SHIPPED ENGINE
    finish. Report the **minimal k from which it completes** — how much of its own answer a
    target must be handed before the engine can do the rest. Every prior measurement in this
    project is aggregate; this is per-step.

    **CONTROL: 6/6 solved targets complete at k=0.** ⭐ Three separate harness bugs were caught
    by that control before any number was believed, each of which would have produced a
    spectacular false finding:
    1. **No orchestration** — 5 of 6 solved targets failed even when handed their OWN COMPLETE
       PROOF. The ledger harness orchestrates (suite prelude + complete siblings, other holed
       decls stripped); without it the checker sees a different program.
    2. **Duplicated `/ total /`** — `maskByName` PRESERVES the pragma, so re-attaching it after
       decomposition emitted two consecutive pragmas and the decl failed to PARSE. Presented
       as "the engine cannot complete its own proof".
    3. **A silent `catch`** — the orchestration call was wrapped in `catch { /* fall back */ }`
       while its imports were missing; the ReferenceError was swallowed and every target ran
       unorchestrated, i.e. bug (1) wearing the fix. **A fallback that hides its own reason is
       a harness-bug generator.**
    ⚠ Also: the decomposer's own control caught the pragma leaking into the body, which made
    every proof look like ONE opaque term (median maxDepth 1, implausible on its face).

    | RESIDUE, n = 41 (full sample; residue maxDepth median 5) | |
    |---|---|
    | completes UNAIDED (k=0) | 0 |
    | **needs the FULL proof (minK >= maxDepth) — engine contributed NOTHING** | **30 (73.2%)** |
    | engine finished a genuine remainder | 8 (19.5%) |
    | never completes even at full reveal (instrument caveat) | 3 (7.3%) |

    And of the eight partials, **six could supply only the FINAL LEVEL** (`ctxjoinunreqb`,
    `vself`, `small_to_big`, `ceq`, `pair_halts`, `eqPath`); one supplied two
    (`haltsMstep`), one three (`sim_subst_tp_unr`). **minK median 5, max 9.**
    Target list for the leaf dump: `scratch/probes/reach-audit-targets.txt` (the 30).

    ⭐⭐⭐ **THE FINDING. Handed everything but the leaves, the engine still fails on 71%.**
    At k = maxDepth-1 the only open holes ARE the leaf terms: the structure is given, the
    case tree is given, the contexts are given, the hypotheses are bound. Nothing remains but
    writing single, exactly-correct, often-large contextual terms — and it cannot.

    ### Why this explains all eight zeros at once
    Every mechanism of entries 56–60 was helping a search find something **not in its
    reachable set at all**. Precision, construction, structure, breadth, rule completion,
    focusing, the inhabitant oracle, let-composition — none of them changes whether the
    engine can emit a particular large leaf term, so none of them could pay, and none did.
    It also kills the two live hypotheses from 60.14–60.16: it is **not** search ordering
    (the space does not contain the answer) and **not** depth (they fail ONE STEP from the
    end). It corroborates the density result from the other side: residue leaves exceed 10
    tokens 2.29× as often as solved ones.

    ### ⭐ THE POSITIVE TARGET LIST — the first this project has had
    The audit yields a per-target isolate: for each of the 20, run at k = maxDepth-1, dump
    the open holes and the author's term for each, and characterise the gap. **Every confound
    is stripped** — no structure question, no induction question, no search question, one
    term per hole with its exact goal and context. That is the best-posed question in the
    project's history and it is where the fortnight goes.
    ⛔ Do NOT build another mechanism before that dump exists.

    ### 61b. ⭐⭐⭐ THE LEAF DUMP — A HARD CLIFF AT ~10 TOKENS. 0 of 16 past it.

    For the 30 targets that needed their FULL proof, spliced prefix(maxDepth-1) — everything
    but the leaves — and paired each remaining hole with the term the AUTHOR wrote there
    (`scratch/probes/leaf-dump.mjs`). **30/30 well-formed splices, 45 leaf holes.** Structure,
    case tree, contexts and bound hypotheses all GIVEN; one exactly-correct contextual term
    per hole is all that is missing. Zero confounds.

    ⚠ **Two artifact classes removed first, both found by inspecting the extremes** — a
    622-token "leaf" is a decomposer failure, not a corpus fact:
    - 6 leaves contain a **nested `case`** the decomposer did not descend into (median 219
      tokens): its `case` test does not match a PARENTHESISED nested case, which then falls
      through as an opaque term.
    - 3 more are **`fun ... | ... => ...` copattern expressions** (`howe_refl` 146 tok,
      `howe_osim_trans` 115) — `CofunctionExpression`, another former it does not split.
    Reporting the unfiltered median (12) or p90 (146) would have been a fabricated headline.

    | 36 GENUINE single-term leaves | |
    |---|---|
    | size | median **10** · p75 21 · p90 36 · max 111 |
    | author's term proposed by the engine | 8 / 36 (22.2%) |
    | **<= 10 tokens** | 20 leaves — **8 proposed (40%)** |
    | **> 10 tokens** | 16 leaves — **0 proposed (0%)** |

    ⭐⭐⭐ **A HARD CLIFF AT ~10 TOKENS, AND 44% OF THE RESIDUE'S FINAL LEAVES ARE PAST IT.**
    Zero of sixteen. This is the first crisp threshold the project has ever measured, and it
    is the quantitative form of every zero in entries 56–60: the engine's term generator has
    an effective ceiling, and the residue lives above it.

    Representative leaves it cannot propose — each is ONE term position containing nested
    binders and lets, not a proof fragment:
    ```
    111  abs_sn          Acc [_] [ |- arr _ _] [_ |- abs \x.M] (mlam _, S => let [_ |- rabs \x. S1] ...
     45  logEq_Monotone  LogArr [h |- M1[$W]] [h |- M2[$W]] (mlam h0,$W2, N1, N2 => fn rn => f [h0] ...
     40  idLogSub        Dot (monotoneSub $[_, b:block x:tm _, y:neutral x |- ..] (idLogSub r')) (r ...
     31  subst           Slam (mlam h' => fn s' => fn e => f [h'] (mlam T => fn y => s' [ |- T] (s ...
    ```

    ⚠ **The exact-match metric is a LOWER BOUND and must never be quoted alone.** Its control
    on SOLVED targets is 2/14 (14.3%) — the engine closes those holes with DIFFERENT valid
    terms, so "did not propose the author's term" is not "could not close the hole". What
    survives the control is the SPLIT: 40% below the threshold, 0% above it.

    ⭐ **Where the fortnight goes.** The question is now narrow and quantitative: *what is the
    cost curve of generating a correct contextual term of size n, and what changes it?* Every
    prior mechanism aimed at term SELECTION or proof STRUCTURE; none moved the ceiling.
    Instruments: `scratch/probes/{author-prefix,reach-audit,leaf-dump}.mjs`,
    targets `scratch/probes/reach-audit-targets.txt`, pairs `scratch/probes/leaf-dump.jsonl`.

60. **⭐⭐⭐ THE RETHINK — HOLE-DIRECTED REFINEMENT. The unit of a search step is wrong, and
    that single fact explains all four zeros. Nine rules, verified at the source, whose
    closure is the whole language.** (2026-08-21. Answers `ORCA-MANDATE.md`.)

    ## 60.0 The mandate this answers

    > Logic and programming languages are FINITE but INFINITELY EXPRESSIVE. A proof search
    > over them must be too. A finite set of first-principle rules must compose to solve
    > unboundedly many holes — not an endless slog of rules creeping toward an asymptote.

    ⛔ So the question is not "which capability is missing" (three of those measured zero).
    It is: **name the finite rule set, show its closure covers the fragment, and show why no
    tenth rule is needed for the next unseen shape.**

    ## 60.1 THE DIAGNOSIS — the unit of action, not the quality of the heuristic

    **Orca's unit of action is a COMPLETE CLOSED TERM.** To make progress it must emit a
    fully-instantiated text and have the checker accept it. Everything pathological about
    the engine follows from that one choice:

    - it cannot say "apply this constructor and defer the arguments", so it must ENUMERATE
      argument tuples ⇒ caps (4/6/12/48), combinatorial blowup, and **nine separate
      generators** each guessing whole terms of some shape;
    - it cannot let a later constraint inform an earlier choice, so it dual-spells and lets
      the checker arbitrate (~773 lines of spelling/guard/writability against ~183 of
      unification, 4:1);
    - it cannot represent a term it is not yet able to WRITE — which is why the 22
      zero-candidate goals have an **empty image**: their inhabitants must mention `#p`,
      `$S`, or a checker-invented `"`-name, and the engine's own writability guards forbid
      spelling those (entry 59c).

    ⭐ **Shapes are unbounded, so a design whose unit is "a whole term of some shape" needs
    unboundedly many generators. That is the asymptote the mandate forbids, stated
    mechanically.**

    ## 60.2 THE INVERSION — a step is ONE TYPING RULE, premises left as HOLES

    Emit `c ? ? ?` and let **the checker compute each premise's type, in its own context,
    with reconstruction, weakening, substitutions, parameter variables and implicit
    arguments already applied.** Then recurse on each hole. The engine never models any of
    that machinery; it calls the thing that already implements it.

    ⭐ **VERIFIED AT THE SOURCE, 2026-08-21 (`scratch/probes/h1..h5.bel`, native `main.exe`) —
    this was tested BEFORE the design was written, per §14's "verify the primitives" law.**

    | # | test | result |
    |---|---|---|
    | A | hole in **constructor argument** position — `mk ? ?` | ✅ both holes reported, each with its own **Goal** and context |
    | B | hole in **LF term** position inside a box — `[g \|- app ? ?]` | ✅ reported with **LF Context** `g` and `Goal: tm` |
    | C | ⭐ goal carrying a **PARAMETER VARIABLE** — `r_app ? ?` at `R [g \|- app #q #q]` | ✅ both subgoals reported as `R [_ \|- #q]`, `#q` in the meta-context |
    | D | constructor's **implicit index undetermined** — `bx ?` | ⚠️ hole reported as `[ \|- ev ?N_1[^0][]]` but the decl is REJECTED: *"Leftover meta-variables… provide a type annotation"* |
    | E | partial application of a **RECURSIVE function** — `dbl ?` | ✅ argument hole reported with its type |

    ⭐⭐ **Test C is the whole argument.** At exactly the goal shape where the engine today
    proposes NOTHING, `r_app ? ?` type-checks and Beluga hands back both subgoals **with the
    parameter variable in place**. *We never spell `#q`. The checker does.* Whatever cannot
    be written can still be REFINED.

    ⭐ **Free bonus, present in every report:** `Variables of this type: x` — the checker
    enumerates the in-scope inhabitants of each hole. The lookup pool we hand-built is
    something the oracle already computes.

    ## 60.3 THE NINE RULES — the finite set, and why it is closed

    These are not heuristics. They are the term grammar of Beluga, which is what generates
    every well-typed term there is; a tenth rule would mean a tenth term former.

    **Computation level** — goal `Δ; Γ ⊢ ? ⇐ τ`:
    | | rule | when |
    |---|---|---|
    | R1 | `fn x => ?` | τ is an arrow |
    | R2 | `mlam X => ?` | τ is a Π |
    | R3 | `[Ψ \|- ?]` | τ is a box (drops to LF level) |
    | R4 | `c ? … ?` | τ is a ctype; `c` ranges over the **finite** constructors of its family |
    | R5 | `f ? … ?` | `f` ranges over the theorem itself + its **finite** siblings (the IH/lemma route) |
    | R6 | `case s of \| pat => ?` | `s` from the **finite** scope; patterns from coverage |
    | R7 | `x` | `x` from the **finite** scope — and the checker LISTS which ones fit |

    **LF level** — goal `Ψ ⊢ ? ⇐ A`:
    | | rule | when |
    |---|---|---|
    | R8 | `\x. ?` | A is a Π |
    | R9 | `h ? … ?` | A atomic; `h` from the **finite** signature ∪ Ψ ∪ metas ∪ parameter variables |

    **Why the closure covers the fragment.** Every Beluga proof term is built from exactly
    these formers. At any goal the applicable rules are determined by the goal's head and
    are finitely many; each application yields strictly smaller subgoals *as reported by the
    checker*. Infinite expressiveness comes from **composition and recursion over nine
    rules**, not from enumerating shapes — which is the mandate's requirement, met literally
    rather than by analogy.

    ⭐ **And the answer to "what about the next unseen shape?" is: there isn't one.** `#p`,
    `$S`, blocks, projections, weakening, implicit reconstruction are not term formers — they
    are *type-level machinery the checker applies when it computes a subgoal's type*. That
    is why no rule mentions them, and why none ever will.

    ## 60.3b ⛔ CLOSURE TEST RUN — MY NINE WERE WRONG, AND THE MISSES ARE THE RESIDUE

    Falsifier (a) was run immediately, against the authoritative source: **`beluga.grammar`,
    which is realigned to Beluga-W's real lexer/parser (99.1% corpus-clean).** The term
    formers are not a matter of opinion — they are productions.

    **Computation level** (`Expression`): AppExpression · FnExpression · **CofunctionExpression**
    · MLamExpression · CaseExpression · **LetExpression** · **IfExpression** ·
    **ImpossibleExpression** · **ascription `e : τ`**.
    `AtomicExpression`: identifier · ContextualObject `[Ψ |- M]` · **SubstitutionType `$[…]`**
    · **ParameterType `#[…]`** · **TupleOrParenExpression** · **ContextApplication `[Ψ]`** ·
    Hole · UnderscoreHole. Plus **Observation** (`e .obs`, codata destructor).

    **LF level** (`LFTerm`): LFLambda · LFAppTerm; `LFAtomicTerm`: identifier with
    **projection chain** and **substitution** · metavariable with substitution ·
    **ParameterVariable** · **SubstitutionVariable** · **block Tuple `<M1; M2>`** · Hole ·
    UnderscoreHole · ascription.

    ⛔ **So §60.3's "nine rules" was WRONG.** The true set is ~13 computation formers and ~9
    LF formers. Recorded as an error rather than quietly corrected, because the correction is
    the most useful thing here:

    ⛔⛔ **THE FOLLOWING CLAIM WAS FALSIFIED BY §60.8 — IT READ A CORRELATION AS A CAUSE.**
    The formers really were missing from my nine, and the zero-candidate goals really do
    mention `#p`/`$S` — but implementing the formers produced **0 additional progress**,
    because those goals are CTYPE goals: the parameter and substitution variables sit in the
    goal's INDICES, not in the term to be built. Left in place as the error it was.

    ~~⭐⭐ **THE FORMERS I MISSED ARE EXACTLY THE ZERO-CANDIDATE CLASS.**~~ Entry 59c measured the
    22 goals with an EMPTY image: **8 carry `$S`, 7 carry `#p`, 2 carry blocks.** The formers
    absent from my nine were **SubstitutionType `$[…]`, ParameterType `#[…]`, block tuples,
    projection chains, and ContextApplication `[Ψ]`** — the same three features, arrived at
    from the GRAMMAR with no reference to the measurement. Two independent routes, one answer.

    ⭐ **And this is the mandate satisfied rather than dodged.** The set is finite and fixed by
    the language definition; it does not grow with shapes. "What about the next unseen shape?"
    — there is no next shape, because the enumeration is over PRODUCTIONS, not over corpus
    phenomena. A design that needed a rule per family would have grown here; this one closed.

    ⚠ Out of fragment by construction and correctly excluded: **CofunctionExpression +
    Observation** (codata — the 49 coinductive targets). `IfExpression` is a former the engine
    has never emitted; its corpus frequency is unmeasured and should be checked before it is
    assumed rare.

    ## 60.4 WHY THIS EXPLAINS ALL FOUR ZEROS (the mandate's §5 test)

    | zero | why refinement predicts it |
    |---|---|
    | **precision 0/45** (entry 57) | we recomputed a slot's type ourselves; the checker already computes it exactly — including for `#p[$S[..]]`, which our unifier structurally could not. We were duplicating, badly, a function we could have called. |
    | **construction 0/45** (entry 58) | we built whole closed terms bottom-up under caps. Refinement is top-down and never needs an argument tuple at all. |
    | **structure 0/45** (entry 59) | handing over the case tree did not help because the LEAVES still demanded closed terms. Under refinement a leaf is just another goal. |
    | **breadth 207/207 identical** | widening caps enumerates more *closed* terms; the missing inhabitant was never expressible, at any cap. |

    ⭐ One mechanism, four predictions, all matching measurements taken before the mechanism
    was conceived. That is the strongest evidence available short of building it.

    ## 60.5 ⚠️ WHAT IS GENUINELY HARD — stated before building, not after

    1. **Underdetermined implicits (test D) is a REAL bound.** `c ? ?` whose implicit index
       no sibling determines is rejected outright. Refinement therefore needs a FILL ORDER
       (discharge determining holes first) or an ascription. This is entry 41c's
       *"Leftover meta-variables"* wall in a new place — it is known, diagnosable from the
       hole's own goal text (`?N_1`), and must be designed for, not discovered.
    2. **Cost.** Every refinement step is a checker call. Mitigation is real but unproven:
       one call now returns ALL subgoal types plus inhabitant lists, replacing dozens of
       guess-and-check calls. **Must be measured, never assumed** — "speed is correctness".
    3. **`case` (R6) still needs patterns**, i.e. coverage. Established workable once the
       totality pragma is stripped (entry: `%:split` / `TypInd`).
    4. **Termination is unchanged and still ours.** R5 admits recursive calls; `decOk` +
       an owned SCT-style certificate must gate them, implicit positions excluded from the
       measure domain. Soundness stake stays *zero circular admissions*.
    5. ⛔ **The honest prior is bad.** Four capabilities, four zeros. This design's claim to
       be different is that it changes what a STEP is rather than adding a capability to the
       existing loop — the one axis never tested. That is an argument, not a result.

    ## 60.6 THE FALSIFIER — closure first, payload second, both cheap

    ⛔ Not a reach test. Reach has now produced four zeros.

    **(a) CLOSURE — the mandate's own question, measured.** Parse every author proof in the
    corpus and check that each of its term formers is an instance of R1–R9. Any construct
    that is not is a missing rule, and its frequency is the size of the gap. A finite rule
    set that covers the corpus by construction is exactly "show the closure covers the
    fragment". Cheap: static, no search, no checker.

    **(b) IMAGE — on the 22 zero-candidate goals (entry 59c), where the current image is
    provably EMPTY.** For each, enumerate the applicable rules, emit each with holes, and
    count how many yield a well-typed refinement with reported subgoals. **Current = 0
    candidates; any non-zero is attributable with no confound.** Synthetic tests A–E already
    show 3 of 3 on this shape.

    **(c) PAYLOAD.** Bounded refinement search on a residue-wide stride sample, against the
    mandate's bar. **Declare the numeric stake before writing the search, and do not restate
    it afterwards.**

    ⛔ **Kill criterion, in mandate terms:** if (a) shows the rule set is not closed without
    per-shape additions, the design has already failed §3 and must be abandoned rather than
    patched. If (b) leaves the image empty, refinement does not reach the residue's goals and
    the same applies.

    ## 60.7 FALSIFIER (b) RUN — the empty image LIFTS 0 → 5/22, with a PARTIAL rule set

    `scratch/probes/refine-image.mjs` over the 22 zero-candidate goals of entry 59c. At each
    target's first spliced leaf it applies ONE rule with premises left as holes and asks the
    checker. **Current image on these targets is provably 0 candidates, so any non-zero is
    attributable with no confound.**

    | | |
    |---|---|
    | targets | 22 |
    | candidates tried | 366 |
    | **accepted by the checker** | 28 |
    | **— of which made PROGRESS** | **6** |
    | **targets with a NON-VACUOUS image** | **5 / 22 (22.7%)** |

    ⛔⛔ **ACCEPTANCE IS NOT PROGRESS — the metric was fixed mid-flight and it changed the
    headline from 14/22 (63.6%) to 5/22 (22.7%).** `? → [Ψ |- ?]` type-checks and leaves the
    hole count UNCHANGED: it restates the goal one level down without discharging anything.
    22 of the 28 acceptances were that. Only a refinement that CLOSES a hole or DECOMPOSES it
    into real premises counts. **A 63.6% would have been reported off a rule that does
    nothing** — the same shape of error as counting reach.

    **The 5 lifts are the right KINDS**, which matters more than the count:
    `[g |- refl]` and `[g, x:name |- βfwd]` (closing LF constructors), `s` (a variable),
    `HNil` (a ctype constructor), and — most significantly —
    `cong_fstepleft_impl_fstepright ? ?` (a BRANCHING sibling-lemma call, 2→3 holes).
    That last is the IH/lemma route working through refinement, which entry 58's inhabiter
    could never do because it had to close the call's arguments itself.

    ⭐ **THE 17 THAT ARE STILL EMPTY ARE EMPTY FOR A NAMED, FINITE REASON — and it is exactly
    what §60.3b predicted.** The probe implements only a SUBSET of the grammar-derived rule
    set (box, LF constructor, ctype constructor, call, variable) at DEPTH 1:

    | why still empty | n |
    |---|---|
    | goal needs a `#p` / `$S` / projection head — **formers the probe never generates** | 7 |
    | goal stated via checker-INVENTED `"i` names — unimplemented | 5 |
    | needs depth > 1 or a higher-order constructor slot (`Sn [g1 |- R]` wants `Acc (mlam …)`) | 5 |

    ⇒ **The probe is under-powered BY CONSTRUCTION and in the predicted direction.** The
    missing pieces are the remaining `LFAtomicTerm` / `AtomicExpression` productions
    (`ParameterVariable`, `SubstitutionVariable`, projection chains, block tuples,
    `ContextApplication`) plus R1/R2/R6/R8 and depth. ⭐ **That list is CLOSED — it is the rest
    of the grammar, not a per-shape backlog.** That is the mandate's distinction, and it is
    the first time in this project a "what's missing" list has been finite and enumerable in
    advance.

    ⚠ **Not a payload result and must not be quoted as one.** 5/22 is an IMAGE measurement at
    depth 1 on the hardest 22 targets in the corpus. It says the empty image lifts; it says
    nothing yet about completions. Falsifier (c) — bounded refinement search on a
    residue-wide sample, with the numeric stake declared BEFORE the search is written — is
    the one that decides whether this pays.

    ## 60.8 ⛔ COMPLETING THE LF RULE SET BOUGHT **NOTHING** — and it kills my own diagnosis

    §60.3b predicted that the 17 still-empty targets were empty because the probe omitted
    `ParameterVariable`, `SubstitutionVariable`, projection chains and block tuples. Those
    were implemented (plus `fn`/`mlam` intro and LF lambda), taking the candidate set from
    366 to **439**.

    | | before | after |
    |---|---|---|
    | candidates tried | 366 | **439** |
    | candidates that made PROGRESS | 6 | **6** |
    | targets with a non-vacuous image | 5/22 | **5/22** |

    **Seventy-three new candidates, zero additional progress.**

    ⛔⛔ **WHY — and this is the correction.** All 7 of the `#p`/`$S` targets have **CTYPE**
    goals, not box goals:
    `Reduce [ |- A] [_ |- #p[$S[..]]]` · `Log [_ |- ((#p.1[$S1[..]]) sim (#p.1[$S2[..]]))] [ |- Q]`
    · `Neutral [_ |- M[$W[..]]]`. The parameter and substitution variables sit in the goal's
    **INDICES**; the term to build is a ctype DERIVATION. LF term formers cannot fire there at
    all — they are guarded behind the box case by construction.

    ⭐ **So "the goal mentions `#p`" and "the image is empty" are CORRELATED, not causally
    linked.** §60.3b asserted the link from the grammar alone and it was wrong. The census in
    59c is still correct as a description; my explanation of it was not. **Cost of finding
    out: ~10 minutes, because the prediction was written down as a testable claim before the
    code was.**

    ## 60.9 WHAT REMAINS — R6, and it is the one rule both prior systems have

    The probe implements R1/R2/R3/R4/R5/R7/R8/R9. **It does not implement R6, the
    coverage-backed `case`.** That is the largest missing rule and the most likely cause for
    the ctype-goal residue: `redVar : Reduce [ |- A] [_ |- #p[$S[..]]]` is specimen C's idiom
    — split the parameter variable into *is the newest variable* vs *is further in* — which
    no constructor application can substitute for.

    R6 needs Beluga's coverage (`Cover.genPatCGoals` / `genContextGoals` via `%:split`,
    **with the totality pragma stripped**, established at 98% by the `TypInd` work). Both
    Twelf's M2 and the LFMTP-2023 tactic have this rule; this engine has a split generator
    but the REFINEMENT probe does not.

    ⛔ **Do not read 5/22 as encouraging or discouraging until R6 is in.** The measured claim
    is narrow and exact: *with 8 of the 9 rules at depth 1, the empty image lifts on 5 of 22.*
    Next increment is R6 + depth, then falsifier (c) with the stake declared first.

    ## 60.10 R6 BUILT — and the image lifts **0 → 7/22**. Plus a metric that was wrong TWICE.

    R6 (`scratch/probes/refine-split.mjs`) drives Beluga's own coverage through `%:split` in the
    native interactive shell, **totality pragma stripped**, and returns the arm patterns as a
    refinement whose bodies are holes. ⭐ **Positive control: `bs_in_rew` splits into 9 arms**,
    holes on their own lines, notation normalised.
    ⚠ The FIRST control used a synthetic signature and returned 0 — Beli answered
    `impossible [_ |- #q]`, a genuine coverage verdict, not a broken instrument. **Control on
    a target with a KNOWN-GOOD split, never on one you wrote yourself.**

    ### The metric was wrong twice, in opposite directions

    | criterion | targets with a non-vacuous image | why it was wrong |
    |---|---|---|
    | checker ACCEPTED the refinement | 14/22 (63.6%) | 22 of 28 acceptances were `? → [Ψ \|- ?]` — type-checks, hole count unchanged, discharges nothing |
    | hole-count DELTA | 5/22 (22.7%) | blind to INVERSION: `let IsVar [_ \|- #p] = i in ?` keeps the count while BINDING `#p` |
    | **strictly more INFORMATIVE** (holes changed OR the surviving hole gained a binder) | **7/22 (31.8%)** | principled; stated BEFORE the run |

    **FINAL: the provably-empty image lifts from 0/22 to 7/22 (31.8%)**, 9 progressing
    candidates of 530, with the full rule set at DEPTH 1.
    ⛔ **A progress metric is as falsifiable as a mechanism.** Two of these three would have
    been reported as the headline; the first inflates 2× and the second deflates. Declare the
    criterion before the run and say which one you used.

    ### What each rule actually contributed
    R9/R4 closing constructors (`[g |- refl]`, `[g, x:name |- βfwd]`), R7 a variable (`s`),
    R4 a ctype constructor (`HNil`), R5 a **branching sibling call**
    (`cong_fstepleft_impl_fstepright ? ?`, 2→3 holes — the IH route entry 58's inhabiter could
    never take), and R6 **inversions that bind** (`let IsVar [_ |- #p] = i in ?`).
    ⭐ Note R6's contribution is exactly the `#p` binding the engine cannot spell — obtained
    without spelling it.

    ### Standing at the end of the arc
    - The hole-directed PRIMITIVE is verified five ways and is solid.
    - The rule set is finite, grammar-derived and now COMPLETE at depth 1 (R1–R9).
    - The image on the hardest 22 targets in the corpus goes 0 → 31.8%.
    - ⛔ **This is still an IMAGE result, not a payload result.** Nothing here is a completion.
      Falsifier (c) — bounded refinement SEARCH (depth > 1) on a residue-wide sample, numeric
      stake declared before the search exists — remains the thing that decides whether the
      design pays. Do not quote 31.8% as anything else.

    ## 60.11 ⛔ FALSIFIER (c) RAN 0/45 — AND IT IS **INCONCLUSIVE**, NOT A FIFTH ZERO.

    A bounded refinement search (`scratch/probes/refine-search.mjs`: R1–R9 incl. the
    coverage-backed R6, depth 4, ≤150 checks, ≤120s, informativeness filter as the move
    admission test) was run from the MASKED body — nothing handed over — on the same 45
    residue-wide targets the inhabiter measured 0/45 on.

    **Declared before the search existed:** ≥9/45 = the design pays · 1–8 = alive but
    unproven, report don't bank · 0 = it joins the other four zeros.

    **Result: 0/45.** And the search did real work — median 64 checks, p75 97, max 227; only
    4 of 45 hit the check budget, **none** hit the time cap. Most targets EXHAUSTED their
    refinement space rather than running out of budget.

    ⛔⛔ **BUT THE CONTROL INVALIDATES THE TEST.** Run on a 12-target stride sample of the
    **already-SOLVED** set (12 developments): **1/12 completed — 8.3%.** The prototype fails
    eleven of twelve targets the SHIPPED ENGINE ALREADY PROVES.

    ⭐ **A search that cannot reproduce 92% of known-solvable proofs cannot license any claim
    about the residue.** The 0/45 measures my four-hour prototype, not hole-directed
    refinement. Banking it as a fifth zero would be the same error as trusting a null from a
    broken instrument — the difference is that here the instrument is *weak* rather than
    *broken*, which is harder to notice and just as fatal.
    ⚠ **This is NOT a vindication either.** The design is UNTESTED, not supported. The prior
    from four zeros stands undiminished.

    ### The named weaknesses, in likely order of cost
    1. **First-hole-only selection.** The shipped engine has a focus rule; the prototype
       always refines `holes[0]`.
    2. **Depth 4** — shallow for proofs that need 5–10 steps.
    3. **No spelling variants.** The engine's dual-spell discipline (weakened `X[..]`,
       underscored contexts, boxed vs bare) is absent except where R9 supplies it.
    4. **R5 is ungated** — no `decOk`, so recursive calls are neither well-founded by
       construction nor certified. (No completion resulted, so nothing unsound was banked.)

    ### ⭐ THE GATE FOR ANY FUTURE RESIDUE CLAIM FROM THIS DESIGN
    **The search must reach CONTROL PARITY first: ≥80% of a solved-set control sample.**
    Until then a residue number is uninterpretable. That gate is cheap, objective, and it is
    the honest precondition the previous four zeros all satisfied (each of those mechanisms
    rode ON the shipped engine, which by definition had control parity) and this one does
    not. **State the control rate beside any future number from this search.**

    ## 60.12 ⛔ FOCUSING DID NOT MOVE CONTROL PARITY — 8.3% → 8.3%

    The invertible/non-invertible partition was added to the refinement search: R1 (`fn`),
    R2 (`mlam`), R3 (box), R8 (LF lambda) applied EAGERLY without branching and without
    spending depth, on the grounds that a rule forced by the goal's shape is not a choice
    and can never need undoing (Andreoli; Miller et al.) — a theorem, not a ranking, which is
    why it is admissible under the "search control never pays" law.

    | control (12 stride-sampled SOLVED targets, 12 developments) | complete |
    |---|---|
    | unfocused refinement search | 1/12 (8.3%) |
    | **focused** | **1/12 (8.3%)** |

    ⚠ And it made two targets far more expensive — `algeq-simplified#lookup` 29→2175 checks
    (3.6s → 255s), `halts_step` 13→975 — because the eager phase recurses without decrementing
    depth, so a forced move that re-exposes a forced move opens a much larger space.

    ⭐ **What this rules out.** Convergence discipline is NOT the gap between the refinement
    prototype and the shipped engine. The prototype remains ~12× weaker than an engine that,
    by definition, proves 12/12 of these.

    ### The recentered reading — what a finite rule set does and does not buy

    ⭐ **The mandate's requirement is about EXPRESSIBILITY and it is satisfied**: R1–R9 are
    grammar-derived, finite, and their closure is the language. Structure comes free — a
    refinement never has to guess an argument tuple, and it reaches goals mentioning `#p` /
    `$S` without spelling them (60.10: image 0 → 31.8% on the hardest 22).

    ⛔ **But CLOSING a leaf is where the rules stop helping.** R7/R9 must emit an EXACT term,
    and the space of exact terms at a leaf is the spelling space the shipped engine spends
    ~773 lines on (`X` vs `X[..]` vs `[_ |- X]` vs `#p.1[$S[..]]`). Those spellings ARE
    instances of the grammar's formers, so the rule set covers them in principle — the
    prototype simply enumerates them badly. **Refinement DEFERS the spelling problem; it does
    not dissolve it.** That is the honest limit of the design as measured, and it is
    consistent with entry 59 (perfect structure, leaves still fail).

    ⭐ **The unused lever, and it is free.** Every hole report ends with
    `Variables of this type: x` — **the checker already enumerates the in-scope inhabitants
    of each goal** (verified in 60.2 tests A/B/E). The prototype never reads it. That is a
    closing-position oracle we are paying for and discarding, and it is the cheapest
    remaining thing to try before concluding anything about this design.

    ⛔ **Standing gate unchanged:** no residue claim until control parity ≥80%.

    ## 60.13 ⛔ THE "FREE INHABITANT ORACLE" IS NOT A LEVER — it never fires

    Every hole report can end with `Variables of this type: x` — Beluga enumerating in-scope
    terms whose type IS the goal. §60.12 called this the cheapest remaining thing to try.
    Parsed (`hole-report.mjs` does not) and wired ahead of every other closing rule.

    | control (same 12 SOLVED targets) | complete |
    |---|---|
    | refinement search | 1/12 (8.3%) |
    | + focusing | 1/12 (8.3%) |
    | **+ inhabitant oracle** | **1/12 (8.3%)** |

    And **byte-identical check counts on all 12** (103/65/256/100/195/7/35/27/39/2175/975/31),
    which is the tell: the oracle contributed zero candidates. Measured directly
    (`scratch/probes/inh-oracle-reach.mjs`): **0 of 12 initial holes carry an inhabitant list.**

    ⭐ **Why, and it should have been predictable.** The line appears only when an in-scope
    variable has EXACTLY the goal type — the trivial-close case. If that were common the
    proofs would be trivial. The oracle is free and real, and it answers a question the hard
    targets never ask.
    ⚠ Instrument caveat: reach was measured at the INITIAL hole, where the goal is the
    theorem's whole type; it could fire deeper. The byte-identical search behaviour is what
    makes the null solid, not the 0/12 alone.

    ### ⛔ THE PATTERN IN THIS SUB-ARC IS ITSELF THE SIGNAL
    Three attempts to strengthen the refinement prototype — completing the LF rule set
    (§60.8), focusing (§60.12), the inhabitant oracle (§60.13) — **each moved the control rate
    by exactly zero.** The prototype is stuck at 8.3% against a ≥80% gate, and the three most
    obvious accelerants are spent. That is not evidence the design is wrong; it is evidence
    that **closing a leaf is the hard part and none of these touched it.** Consistent with
    entry 59 (perfect structure, leaves still fail) and with entries 57/58 (precision and
    construction at leaves, both zero).
    ⛔ **Do not attempt a fourth accelerant without a hypothesis that explains all three
    nulls.** The next honest move is to instrument WHERE the 11 failing control targets die
    — which rule was needed and absent at the exact hole — rather than adding capability and
    re-measuring.

    ## 60.14 ⭐⭐⭐ THE RETHINK THAT MEASURED: IT IS NOT DEPTH, IT IS **TERM DENSITY**

    Seven mechanisms have measured zero and every one of them changed what is available AT a
    hole; none shortened the PATH. One hypothesis predicts all seven at once: **the residue's
    proofs are deeper than the search horizon.** It also fits the divergence class (a 4×
    budget converts 0/8) and fits entry 59's tell that handing over the structure made the
    search die EARLIER (steps 198→112, `no-move` 17→22).

    Tested against the AUTHOR's own proofs — an intrinsic property of the target, not a reach
    census — with the 273 solved as control (`scratch/probes/proof-depth-census.mjs`):

    | metric | solved med/mean | residue med/mean | LIFT |
    |---|---|---|---|
    | structural steps (`fn`+`case`+arms+`let`) | 15 / 18.5 | 17 / 26.2 | 1.42× |
    | **tokens** | 60 / 80.1 | **108 / 176.8** | **2.21×** |
    | **`let` bindings** | 1 / 1.9 | **2 / 4.5** | **2.37×** |
    | max bracket nesting | 2 / 1.9 | 3 / 2.7 | 1.42× |
    | `case` expressions | 1 / 1.3 | 1 / 1.3 | **1.00×** |
    | share > 8 structural steps | **71.1%** | **71.3%** | — |
    | share > 12 structural steps | 60.1% | 59.9% | — |

    ⛔ **THE DEPTH HYPOTHESIS IS FALSIFIED.** Above 8 structural steps the two distributions
    are identical to a tenth of a percent, and `case` count is identical at 1.00×. The engine
    already proves things of exactly the residue's SHAPE. Recorded as a wrong prediction.

    ⭐⭐ **WHAT THE CONTROL FOUND INSTEAD.** At the same case structure, residue proofs carry
    **2.2× the tokens** and **2.4× the `let` bindings**. The difference is not the shape of
    the proof — it is the SIZE AND DENSITY OF THE TERMS written at each step, and the number
    of INTERMEDIATE RESULTS that have to be named to build them.

    ### Why this is the first hypothesis that fits every zero
    - **precision / breadth / focusing / oracle** — none makes a bigger term reachable. ✓ zero
    - **construction (entry 58)** — built terms, but at depth 2 with caps 4/8/16, i.e. SMALL
      terms. The residue needs terms 2.2× larger. ✓ zero
    - **breadth ×128** — enumerates more small terms, never a larger one. ✓ 207/207 identical
    - **structure (entry 59)** — hands over the case tree, which the residue did not lack
      (`case` lift 1.00×), and leaves the term-writing untouched. ✓ zero, and it died earlier
    - **refinement (60.11)** — SPLITS one composite move into 1+n subgoals, making the term
      harder to assemble, not easier. ✓ 8.3% parity, worse than the engine

    ⭐ **And `let` is the tell.** A `let` names an intermediate result so a large term need not
    be written as one expression — and in this corpus most `let`s bind the RESULT OF A CALL
    (`let [Γ |- R] = thm … in`). 2.37× more of them is the same fact entry 54 measured from
    the other side (46% of stuck targets are never offered `recurse`/`lemma`), now visible as
    a property of the PROOFS rather than of the search.

    ⚠ **What this does NOT yet establish.** That making bigger terms reachable would pay. It
    reframes the target from "which capability" to "what is the cost curve of term SIZE", and
    the honest next measurement is whether the engine's failures concentrate at the term-size
    boundary — not another mechanism.

    ## 60.15 ⛔⛔ R-LET: THE COMPOSITION OPERATOR. Prediction stated, prediction FALSIFIED.

    §60.14's density finding implies a mechanism: authors avoid large terms by naming
    intermediates, so give the search `let X = f ? … ? in ?` — arguments as HOLES, so nothing
    large is ever spelled. **One grammar former whose closure is unbounded term size from
    bounded terms** — the mandate's sentence, literally. It is not entry 58's inline call
    (that CLOSED a slot and had to spell its arguments) nor entry 54's untotalied recursion
    (10 of 11 gains circular); where the author's `/ total /` is present Beluga guards it.

    **Prediction, written before the build:** *this is the only accelerant that touches term
    size, so if the density story is right it moves control parity off 8.3%; if it does not
    move, the density story is wrong too.*

    | control (12 SOLVED targets) | complete |
    |---|---|
    | refinement search | 1/12 (8.3%) |
    | + focusing | 1/12 |
    | + inhabitant oracle | 1/12 |
    | **+ R-LET composition** | **1/12 (8.3%)** |

    R-LET fires — check counts roughly doubled (103→233, 2175→5100, 975→2250), so the search
    genuinely explored the larger space. It converted nothing. **The prediction was honoured
    and the mechanism claim is dead.** The MEASUREMENT (2.2× tokens, 2.37× lets, 2.29× large
    leaves) stands as a fact about the corpus; the inference that supplying `let` makes those
    proofs reachable does not.

    ### And the implicit-undetermined hypothesis dies with it
    Rejection profile at the first hole across all 22 (492 rejections):
    **51.4% generic `Type-checking error.`** · 9.6% free meta-variable · 7.1% ill-typed ·
    **5.5% `Leftover meta-variables`**. Test D's undetermined-implicit failure is only 5.5%,
    so it is not what empties the image either. Refinements are rejected for being the WRONG
    constructor — the checker working correctly.

    ## 60.16 ⛔⛔⛔ EIGHT MECHANISMS, EIGHT ZEROS — AND THE MEASUREMENT NEVER TAKEN

    precision · construction · structure · breadth · rule-set completion · focusing ·
    inhabitant oracle · let-composition. Four of those are RULES THAT DEMONSTRABLY FIRE
    (check counts grow every time) and none moves control parity off 1/12. Plus ~22 historic
    pruning/ranking attempts at zero.

    ⭐ **It is not which rules are available.** That hypothesis space is exhausted, and
    continuing to add rules is precisely the asymptotic slog the mandate forbids.

    ⛔ **THE MEASUREMENT THIS PROJECT HAS NEVER TAKEN, and should have taken first:**
    a **PER-STEP REACHABILITY AUDIT** against the author's own proof. Decompose each
    reference proof into its steps; at each step, with the proof-so-far spliced in, ask
    whether the engine (and the refinement rule set) PROPOSES the author's next step at all.

    Everything measured so far is aggregate — verdicts, images, class sizes. Nobody has ever
    established, step by step, that a residue proof is REACHABLE AT ALL from the move
    vocabulary. The oracle-scheme test (entry 59) gave the STRUCTURE and stopped there.
    This audit answers the mandate's §3 question — *does the closure of the finite rule set
    contain the corpus proofs?* — as a measurement per step rather than an argument from the
    grammar, and it returns a per-step failure map naming exactly which rule is missing where.

    **It is the only remaining question whose answer cannot already be predicted from the
    eight zeros**, and either answer is decisive: if the author's steps ARE proposed, the
    problem is purely search ordering over a reachable space (and every capability result
    above is explained); if they are NOT, the rule set is provably incomplete and the audit
    names the gap.

59. **⛔⛔⛔ THE ORACLE-SCHEME TEST — a PERFECT induction scheme converts ZERO of 45. The
    "supply the proof structure" hypothesis is dead too, and three independent capabilities
    have now each measured zero. PLUS a genuinely new lead: 22 targets propose NOTHING at
    the author's own first leaf.** (2026-08-20.)

    **WHY THIS RAN.** An external research pass proposed "Scheme": infer a global induction
    scheme (induction position / context variable, the coverage case tree, where the IHs
    land) plus an owned size-change measure, commit to it BEFORE filling any hole, then let
    the existing leaf-filler finish each case. Its own proposed day-one falsifier was a
    REACH test ("does the enumerator contain the author's scheme ≥70%").
    ⛔ **That is the wrong test.** This project has three recent reach measurements — 40%,
    66.7%, 35.7% — every one with a verified-active component, and **all three converted
    zero.** A reach gate would have passed for all of them.

    ⭐ **THE RIGHT TEST — hand the engine a PERFECT scheme and measure COMPLETIONS.** Splice
    the AUTHOR's own `/ total /` pragma + `mlam`/`fn` intro + outermost `case … of` arm
    patterns into the masked declaration, **every arm body replaced by `?`**, then run the
    EXISTING leaf-filler. That is Scheme's Pieces 1–4 at 100% inference quality, for free,
    with no inference built. If a correct scheme does not convert, no enumerator can.

    | | |
    |---|---|
    | positive control — spliced targets drawn from the 273 COMPLETE | **4 of 5 still complete** |
    | eligible population — 494 residue → author proof makes a recursive/sibling call | 434 |
    | …and has an outermost `case` (skeletonisable) | **300**, 75 developments |
    | excluded and COUNTED (not silently dropped) | 123 no-outermost-case · 11 nested-unparenthesised-case |
    | spliceable share: residue 60.7% vs COMPLETE control 69.2% | **lift 0.88×** |
    | study sample | **45**, 30 developments, **45/45 splices well-formed** |
    | baseline arm COMPLETE | 0 (expected — all residue) |
    | **oracle-scheme arm COMPLETE** | **0** |
    | gains / losses | **0 / 0** |

    ⭐ **THE SPLICE WAS NOT INERT — this is not a wiring null.** 45/45 runs changed behaviour
    (zero byte-identical), **166 arms** handed over (mean 3.7/target), **32 of 45** carried
    the author's pragma, alpha-rename applied on 43, and checks fell **26%** (12,797 →
    9,437) because the engine no longer had to find the structure.

    ⛔⛔ **AND THE DAMNING DETAIL.** Accepted steps went DOWN (198 → 112) while `no-move`
    went UP (17 → 22) — and **all 22 died at `steps = 0`.** Given the correct case tree and
    the correct measure, the engine proposed **nothing at all** at the author's very first
    leaf. Handing over a perfect proof structure makes the search die EARLIER, not deeper.

    **⇒ Scheme's one load-bearing assumption — "a correct case tree makes its leaves
    fillable by the existing filler" — is FALSE on this population.** Every other component
    of the proposal (scheme enumeration, hitting-ratio scoring, merging/veto, SCT
    certification, the tabled refuted-state memory) is apparatus around that claim.

    ### 59b. ⭐⭐⭐ THE TRIANGULATION — three capabilities, three zeros, one conclusion.

    | capability handed to the engine | component contract (verified active) | payload |
    |---|---|---|
    | **precision** — know the slot's TYPE (entry 57) | 33.9% of all argument slots sharpened, 66.7% of targets | **0 / 45** |
    | **construction** — BUILD the inhabitant (entry 58) | fired on 35.7% of targets, 1128 constructed candidates | **0 / 45** |
    | **structure** — the whole induction, case tree AND measure (entry 59) | 166 arms handed over, 45/45 behaviour changed | **0 / 45** |

    Each null is individually explicable; together they are not. **The residue is not
    blocked on any single missing capability**, and that is a strictly stronger statement
    than any of the three alone. It is also the honest answer to "is there a ≥20% system
    here": not one of this shape. ⛔ Do not commission a fourth "supply capability X"
    proposal without a mechanism that explains all three zeros.

    ### 59c. ⭐ THE NEW LEAD — `steps = 0` is a DIFFERENT failure mode from the recorded one.

    The death census says **88% of deaths generate candidates and have them all rejected**
    (~72% type errors). But these 22 generate **nothing**. That is not "the engine emits
    semantically wrong terms at scale"; it is **the move generators produce an empty set for
    these goal shapes.** Different problem, different fix, and it has never been isolated
    because until now the engine never *reached* the author's leaf.

    **CHARACTERISED** (`scratch/probes/os-zero-report.mjs`, all 22 traced at the spliced leaf):

    | feature present in the zero-candidate goal or its scope | n / 22 |
    |---|---|
    | **substitution variable** `$S` / `$[... |- ]` | **8** |
    | **parameter variable** `#p`, `#p.1`, `#p.2` | **7** |
    | checker-INVENTED name (the `"`-prefixed unwritable class) | **8** |
    | ctype goal | 12 |
    | boxed goal | 9 |
    | goal carrying a context variable | 8 |
    | higher-order binder in goal or scope | 5 |
    | context block | 2 |

    Representative goals, verbatim:

    ```
    Reduce [ |- A] [_ |- #p[$S[..]]]                            (redVar x3)
    Log [_ |- ((#p.1[$S1[..]]) sim (#p.1[$S2[..]]))] [ |- Q]    (lookup)
    Howe_subst [] $[h1, x : term S[] |- ] $[h1, x : term S[] |- ]  (howe_subst_wkn)
    [g |- nf_eq #p.2 (nabs (\x. X))]                             (tm_same)
    [g |- mstep (app "i3 P) (app "i2 P)]                        (mstep_app)
    ```

    ⭐ **THE THREE FEATURES ARE THE SAME THREE THE PUBLISHED STATE OF THE ART EXCLUDES.**
    The LFMTP-2023 focusing tactic explicitly does not support context block schemas,
    parameter variables, or substitution variables; this engine REACHES those goals and
    then proposes **nothing**. And the `"`-prefixed invented names are a BelJar-side
    refusal: the writability guards deliberately never spell a checker-invented name
    (invariant 11), so a goal STATED IN TERMS OF ONE has no expressible inhabitant by
    construction.

    ⇒ **The next question is not "which capability is missing" — all three of those
    measured zero. It is "why does the move vocabulary have an EMPTY IMAGE on `#p` / `$S` /
    invented-name goals" — a question about what the engine can SPELL at all.**
    Ids: `scratch/probes/os-zero-ids.txt`.

    ### 59d. INSTRUMENT NOTES (the controls are why this null is believable)

    Built as `scratch/probes/oracle-scheme-{lib,pop,prep,one,trace}.mjs` + `os-study.sh`.
    Two REAL confounds were found by the positive control BEFORE any study number existed,
    and each would have manufactured a false zero:
    1. ⛔ **The hole must sit on its OWN LINE.** `branchPatternBox` finds a hole's arm by
       scanning upward for a line starting `|` and ending `=>`; the engine's own `split`
       emits `| PAT =>\n  ?`. An arm written `| PAT => ?` on one line is invisible — no
       branch metavariables, no IH offered, guaranteed no-move. **Cost two of five control
       completions.**
    2. ⛔ **The author's pattern NAMING must be α-renamed to the engine's convention.**
       Authors bind lowercase (`| Ev_app d1 d2 =>`); the engine's `split` emits uppercase,
       and `branchPatternMetas` recovers pattern metavariables with an **uppercase-only**
       regex. Splicing the author's letters hides the sub-derivation the IH must recurse on.
       The oracle hands over the SCHEME, never the author's typography.
    ⚠️ A 100% well-formed-splice rate is legitimate HERE only because the 134
    non-skeletonisable targets were excluded upfront and counted; without that it would be
    an "exact 100% is a bug" violation.
    ⚠️ An external agent produced this instrument and left it with a syntax error in a final
    edit (a single-quoted string split across lines), after its control had already run.
    **Always `node --check` an inherited instrument before trusting or extending it.**

58. **⛔⛔⛔ STEP 3 — THE RECURSIVE INHABITER. Built, demonstrably active, and it converts
    ZERO of 45. THE "ONE UNIFIED CORE" HYPOTHESIS IS DEAD BY ITS OWN DECLARED GATE, and
    the negative is the most valuable result of the arc.** (2026-08-20.
    `js/editor-src/prover/prover-inhabit.mjs`, opt-in `INHABIT=1`.)

    **WHAT WAS CLAIMED.** Entries 40–56 each patched one site where a term was produced by
    LOOKUP where it needed to be CONSTRUCTED. The claim: those are not N causes but N
    sites of one missing capability, and a real core — unification (step 2) plus one
    recursive goal-directed inhabiter (step 3) — would be worth 20%+ rather than 2%.
    Nine generators were identified as fragments of that one function: `fillCandidates`
    rules 3/3b/4/5, `argFillChoices`, `nestedCtorArgFills`, `lfCtorAppFills`,
    `hoSlotFills`, `synthesizeFills`, `inlineArgCallTexts`.

    **WHAT WAS BUILT.** `inhabit(want, env, depth)` — hypotheses (meta, comp, context
    binder), constructor application with argument slots inhabited RECURSIVELY under the
    unifier's substitution, inline IH/lemma calls, and binder introduction for
    higher-order wants, applied uniformly at every depth and position. Capped tight
    (4/8/16), fails open, never prunes. 4/4 self-tests including the entry-42 composite
    produced by the single procedure with no per-family code.

    **THE GATE, DECLARED BEFORE THE CODE.** Population: a stride sample of **45 from all
    494 IN-FRAGMENT residue targets** (coinductive and file-error rows excluded) across 32
    developments — deliberately NOT entry 56's ctype class, because a 20% claim must be
    measured against the whole residue. Component contract: novelty rate. Payload:
    **≥9 of 45 convert (20%), 0 losses, else the one-system claim is dead and we go back
    to deep research.**

    | | |
    |---|---|
    | targets where `inhabit` contributed (14 sampled) | **5 (35.7%)** |
    | slots it filled | 145 |
    | constructed candidates it produced | **1128** |
    | **A/B over 45: gains** | **0** |
    | losses | 0 |
    | checks | +15.7% |

    ⭐ **THIS IS NOT A WIRING NULL — the component demonstrably did its job.** The
    candidates are real constructed terms no lookup pool could produce:
    `RArr (\\g'. \\x. \\N. \\d. d)`, `(ctx_unrest_unr X)`, `(str_lin h)`, `(eq1 [g |- X1])`.
    Over a thousand of them, on a third of targets, and **not one proof followed.**

    ⛔⛔ **THE CONCLUSION, AND IT REFRAMES THE WHOLE RESIDUE.** Two independent capabilities
    were added to the engine and both measured exactly zero on the residue-wide sample:
    knowing the slot's TYPE (step 2, 33.9% of slots sharpened → 0 gains) and BUILDING an
    inhabitant for it (step 3, 1128 constructed terms → 0 gains). **So the engine's
    problem is not that it cannot name or build the right term at a hole.** That was the
    standing diagnosis behind every entry since 44 — "the paying category is a missing
    move or mis-emitted text" — and at the residue it is now falsified twice over.

    What is left, by elimination, is PROOF STRUCTURE: which lemma to have, which induction
    to perform, which scrutinee to split, in what order. And the ROI law
    ([[feedback-generation-pays-search-control-does-not]]) records 22 measured failures on
    exactly that axis within this architecture. **There is nothing left in this
    architecture that pays.** That is the honest state, it is arrived at by construction
    rather than by another class hunt, and it is precisely what
    `docs/orca-research-brief-v2.md` §1 predicted: *"No sequence of small mechanisms gets
    there; the arithmetic rules it out."*

    ⛔ **DIRECTION: back to deep research** — with two decisive new negatives to feed it,
    which is what the brief's own rubric (§15, §6) demands of any proposal: type-directed
    precision is not the gap, and recursive term construction is not the gap. Any proposal
    that amounts to "generate better terms at the hole" is now refuted by measurement, not
    by argument.

    ### 58b. ⭐ A REAL CORE BUG THE BUILD EXPOSED — and it had poisoned step 2's own null.

    `decomposeContextual` reports a BOX for any parenthesised type, because a meta type
    genuinely is written `(g |- A)`. But `(tm -> tm)` — the higher-order argument of
    `lam : (tm -> tm) -> tm` — decomposes identically, so step 2's `instantiateType`
    rewrote it as **`[ |- tm -> tm]`, a bogus box, at every parenthesised argument slot**.
    Found because the recursive inhabiter returned `[]` for `[g |- tm]` on a three-line
    signature — a positive control that could not fail for any legitimate reason.
    Fixed by `asBox` (a box requires an actual TURNSTILE at depth 0) and routed through
    every box decomposition in both modules. **Step 2's A/B was re-run after the fix and
    the null held**, so the conclusion above stands on corrected code.
    ⛔ **Law: `decomposeContextual` is NOT a box test.** Any new code asking "is this a
    contextual object?" must use `asBox`.

    **STATUS.** `UNIFY=1` and `INHABIT=1` are opt-in; default path inert and suite green.
    Kept as evidence and as instruments, not as machinery to extend:
    `scratch/probes/{unify-selftest,inhabit-selftest,unify-rate,inhabit-novelty}.mjs`,
    `scratch/probes/inhabit-ab.sh`, ids in `scratch/probes/inhabit-ab-ids.txt`.
    ⛔ **Do not re-run either as a payload experiment.** Both are measured zeros on a
    residue-wide sample with their component contracts verified active.

57. **⭐⭐⭐ STEP 2 OF THE UNIFIED CORE — THE CONTEXTUAL-TYPE UNIFIER. It works, it is
    general, and it buys ZERO PROOFS. Precision is not the bottleneck; CONSTRUCTION is.**
    (2026-08-19/20. `js/editor-src/prover/prover-unify.mjs`, opt-in `UNIFY=1`.)

    **THE HYPOTHESIS UNDER TEST.** Entries 40–56 each patched one site where a type was
    matched as TEXT. The claim was that these are not N causes but N sites of ONE missing
    capability — the engine has no type theory of its own — and that a real core would be
    worth 20%+ rather than 2%. Step 2 is the cheapest falsifiable component of that core:
    a unifier that binds index metavariables **and context variables** and instantiates
    every constructor argument slot from what the goal fixes.

    **WHAT `matchIndices` COULD NOT DO** (all three measured, all three now handled):
    a context variable never binds (they are lowercase by convention, so every slot kept
    its DECLARED context — the reason entry 40a's weakening spelling could not reach an
    argument slot); an index buried in a context declaration never binds (`S` in
    `x:source S[]`); and a token-spine mismatch returns null, leaving the slot raw.
    Two further first-principles fixes came out of the first measurement and **doubled the
    core's reach on their own, with no per-family code**:
    - **a flexible GOAL constrains nothing.** `X2`, `_`, `#p`, `b.1` — a pattern more
      specific than the goal must MATCH it binding nothing, not fail. One flexible index
      was killing the substitution for the whole constructor.
    - **implicit arguments are not printed** (`Printer.Control.printImplicit` defaults
      false), so the goal is short by its implicit prefix and the two align **from the
      right**. Bailing on the length difference discards every constructor of every family
      carrying an implicit index — in this corpus, most of them.

    | measured DURING RUNS over 45 targets (`scratch/probes/unify-rate.mjs`) | first cut | + the two fixes |
    |---|---|---|
    | constructor applications where the unifier binds | 20.2% | **44.5%** |
    | argument slots whose type is actually SHARPENED | 15.6% | **33.9%** |
    | targets with ≥1 slot sharpened | 33.3% | **66.7%** |

    ⛔⛔ **AND IT CONVERTS NOTHING.** A/B on top of the entry-56 composite, same 45 ids,
    arms alone: **0 gains, 0 losses, +13.3% checks.** Against the raw baseline it is the
    same 3 gains the composite already had. Suite 209/210. Declared gate was ≥25% firing
    (met, 66.7%) **and ≥2 conversions (MISSED, 0)**.

    ⭐ **WHAT THAT ACTUALLY ESTABLISHES — and it is worth more than the null looks.**
    A third of all argument slots on two thirds of targets now carry the type the goal
    FIXES rather than the type the declaration WROTE, and not one additional proof
    follows. So **knowing the slot's type is not what the engine was missing.** Worse for
    the precision story: checks went UP 13.3%. If imprecision were the problem, precision
    would have removed wrong candidates; instead it produced more of them. The bottleneck
    is not naming the goal — it is INHABITING it.

    That is the fourth independent line of evidence for the same thing, and the first from
    the type side: widening every generation cap 128× changed 207/207 verdicts by nothing
    (the term is ABSENT from the pool, not buried); the death census called the residue a
    CONSTRUCTION gap; entry 51b's slot-filler alone measured 2/31; and now a correct
    unifier measures 0/45. **All four say the missing capability is building a term, not
    selecting one.**

    ⚠️ **THE GATE WAS BADLY DESIGNED, and that is recorded so it is not repeated.** Before
    running I flagged that step 2's precision is consumed by only ONE downstream site (the
    boxed-slot context spelling), and then set a conversion threshold anyway. The test as
    built cannot separate "the core is worthless" from "the core's consumer is not built".
    ⛔ **A component gate must measure the component's OWN contract** — here, instantiation
    rate — and a payload gate belongs on the piece that consumes it. Do not set a
    conversion stake on a component nothing consumes yet.

    **WHERE THIS LEAVES THE SYSTEM CLAIM.** Narrowed, not refuted, and narrowed to exactly
    one thing: **step 3, `inhabit(type, ctx, scope, depth)`** — one recursive goal-directed
    procedure that BUILDS a term for a slot (hypothesis · constructor application · inline
    call · binder introduction), with the unifier's substitution threaded through it. That
    single procedure would subsume `fillCandidates` rules 3/3b/4/5, `argFillChoices`,
    `nestedCtorArgFills`, `lfCtorAppFills`, `hoSlotFills`, `synthesizeFills` and
    `inlineArgCallTexts` — seven generators, each written for the sliver its author's
    target needed, which is why each measured ~2%. Step 2 is its precondition and is now
    built and green; step 3 is the one that would have to be worth 20%.

    ### 57c. ⚠️ RE-MEASURED ON CORRECTED CODE — the null HOLDS.

    The A/B above was run before entry 58b's `asBox` bug was found, i.e. against a
    unifier that rewrote every parenthesised argument type into a bogus box. Re-run on the
    corrected module, same 45 ids, arms alone: **0 gains, 0 losses vs the entry-56
    composite, +5.5% checks** (was +13.3% — the bug was costing eight points of the
    overhead, and no conversions either way). Entry 57's conclusion stands on corrected
    code. ⛔ A measurement taken on buggy code is not a result until it is re-taken; the
    only reason this one survived is that it was re-run rather than argued about.

    **STATUS: opt-in `UNIFY=1`** (honoured by `diverge-one`, `rebaseline-one`,
    `scripts/prover-native-oracle.mjs`). Default path inert — every call site is gated on
    `globalThis.__proverUnify`. Cyclic import with `hole-split.mjs` is deliberate and safe
    (both sides export hoisted function declarations); suite green confirms module init.
    9/9 self-tests in `scratch/probes/unify-selftest.mjs`, including two FAIL-OPEN cases
    (rigid head clash, goal longer than pattern) — the unifier may only add or sharpen
    candidates, never refuse one, because a unifier that refuses is a prefilter wearing a
    type theory's clothes and that axis is closed with evidence.

56. **⭐⭐ THE ENTRY-42 CTYPE-CONSTRUCTION COMPOSITE — BUILT WHOLE, AND IT PAYS. Stake
    missed, so it ships OPT-IN.** (2026-08-19. Executes entry 42's "if this family is
    ever reopened"; supersedes its piece count.)

    **⛔ FIRST, THE CORRECTION TO ENTRY 42.** Entry 42 said the family needs THREE pieces
    and that two were built. Reading the actual trace of the motivating target
    (`cpp13/cc.bel#weaken`, via `diverge-one`) before writing any code says otherwise: at
    the `M_dot` arm the entire candidate set was `X`, `X1`, `weaken X1` — **the
    constructor application was never proposed at all.** The composite is FIVE pieces,
    and three of them were missing:

    | piece | status before |
    |---|---|
    | (A) recognise a CONTEXT-INDEXED ctype goal (`Map [h] [g]`) | **MISSING** |
    | (B) instantiate ctor slots from the goal's CONTEXT indices | **MISSING** |
    | (C) inline IH/lemma call in an argument slot | **MISSING** (the one entry 42 named) |
    | (D) weakened box in an argument slot | exists (entry 40a) — but unreachable without (B) |
    | (F) the slot's OWN context binder as a fill | **MISSING** |
    | + ctype-ctor application at a ctype goal | exists — but unreachable without (A) |

    **(A) `resultGoalParts` requires a BOXED argument.** It admits an unboxed comp goal
    only when some index is `[Γ |- …]`. A ctype indexed by CONTEXTS has none — every index
    is `[h]`, which carries no turnstile — so `decomp` came back null and `fillCandidates`
    returned the axiom rule alone. Entry 41b's "the general ctype-ctor application comes
    ONLY from the planner" was still true for this goal SHAPE, fifteen entries later.

    **(B) `matchIndices` binds UPPERCASE pattern variables only**, and a ctype's context
    indices are lowercase by convention (`M_dot : Map [h] [g] -> [h |- target S[]] ->
    Map [h] [g, x:source S[]]`). Nothing ever bound `h`, so every argument slot kept its
    DECLARED context — which is why entry 40a's weakening spelling could never fire here:
    `ctxProperlyExtends` was comparing `h` against `h`. Now bound positionally, only where
    unambiguous (a bare context variable, or parts that align one-for-one).

    **(C) the inline call**, as entry 42 predicted, plus one thing it did not: the SIBLING
    generator `supportLemmaTexts` `continue`s on `!boxes.length`, and `weaken : Map [h] [g]
    -> Map [h, x:target S[]] [g]` has no box premise at all — so the one lemma this family
    needs was unreachable from it by construction. `inlineArgCallTexts` takes SELF calls
    from `recurseTexts` (inheriting decOk + the author's `/ total /` unchanged, so entry
    55's soundness guard keeps its premise) and generates sibling calls over ctype premises.

    ⭐ **TWO FURTHER DEFECTS THE TRACE FOUND, both MIS-EMITTED TEXT, both decisive.**
    1. **The ctype split bound a BOX argument as a bare name.** `splitTextForCtype` spells
       every non-Pi argument `fresh()`, so `M_dot X1 X2` bound the sub-derivation as a
       COMPUTATION value — the wrong side of entry 40b's law, and the exact reference term
       `M_dot (weaken X1) [h, x:target _ |- X2[..]]` was then refused with *"Expected an LF
       term-level constant"* **for the spelling of a pattern three moves earlier.** The
       corpus writes `| M_dot sigma' [h |- M] =>`, which binds M in the META context. Now
       emitted as a leading variant, the bare-name spelling still following.
    2. **The instantiated slot context cited a RECONSTRUCTION-INVENTED name.** With (B)
       landing the goal's own context text into the slot, the fill spelled `[z, x:target _
       |- X2[..]]` and earned *"This free context variable is illegal"* (invariant 11 /
       D11) — while the identical term with `_` is ACCEPTED. Gated on `contextWritableAt`,
       lead-underscored variant first when it is not writable.
    3. A third, smaller: the variants must be **INTERLEAVED, not appended.** The combo
       enumeration walks slots diagonally under a cap, so a spelling parked at the end of
       a slot's list is only reachable together with every other slot's FIRST choice.
       Appended, the one candidate that mattered fell off the diagonal.

    **RESULT ON THE MOTIVATING TARGETS.** `cc.bel#weaken` **no-move / 52 checks →
    COMPLETE in 33 checks, 4 moves**, structurally the author's proof
    (`M_dot (weaken X1) [_, x:target _ |- X2[..]]`). `cc.bel#extend` **no-move / 8 →
    COMPLETE / 14** — and that one closes through the SIBLING call, so both halves of (C)
    are exercised. `extendEnv` no-move → step-bound.

    **THE CLASS, WITH A CONTROL** (`scratch/probes/inline-arg-reach.mjs`, sized by the
    mechanism's own predicate per entry 43: *the theorem concludes in a ctype family F and
    some constructor of F has an argument slot whose family a self or sibling call
    concludes in*):

    | | |
    |---|---|
    | STUCK/TIMEOUT | **179 / 577 (31.0%)** |
    | COMPLETE (control) | 17 / 273 (6.2%) |
    | **LIFT** | **4.98×** |

    ⛔⛔ **THAT TABLE IS WRONG AND WAS CORRECTED THE SAME DAY — see 56b. The predicate is
    STATIC (what the DECLARATIONS permit), not REACH (what the search arrives at), and it
    over-counts by ~3.5×.** It is left here because the error is the instructive part.

    ⛔ **THE STAKE, AND THE VERDICT.** Declared before any code: **≥3 gains, 0 losses over
    ≤24 class targets, else opt-in.** First stride sample: **2 gains / 0 losses / −21.3%
    checks over 23.** Extended (declared before scoring, at the SAME 12.5% rate) to a
    disjoint second stride sample: **combined 3 gains / 0 losses / −15.7% checks over 45.**
    Bar was ≥6. **MISSED, at half the required rate — so the whole composite is OPT-IN
    (`globalThis.__proverInlineArg`, `INLINEARG=1`), exactly as declared.**

    **GATES, all with the mechanism ON:** `npm run prover:diff` **199/199, zero
    regressions**; suite **209/210** (the pre-existing `test-project-chaos`). Default path
    verified INERT by measurement, not by inspection: of 55 A/B baseline rows re-run after
    the edit, **47/47 non-timeout rows are identical to the ledger** in outcome AND check
    count; the 8 that differ are all TIMEOUT rows, where the 60 s cap races the step budget.

    ⭐ **WHAT THIS SAYS ABOUT THE FRONTIER — read against entries 51b / 53c.** 51b built
    ONE piece of a composite and got 2/31 **at +69.9% checks**; this built all five and got
    3/45 **at −15.7% checks with zero losses**, plus two more conversions in its motivating
    development. So a WHOLE composite behaves qualitatively differently from a partial one
    — [[composite-moves-are-atomic]] confirmed from the paying side for the first time —
    but the RATE is still the ~1.5–3%-per-build tail entry 53c described. Both are true.
    Projected over the 179-target class the mechanism is worth ~12 targets (**273 → ~285**);
    that is a PROJECTION from a 45-target sample, not a measurement, and the honest way to
    bank it is a full class sweep (~179 × 2 arms, ~3 h), not another census.

    ### 56b. ⛔⛔ THE CLASS NUMBER WAS INFLATED ~3.5× — AND THERE IS NO SHARED NEXT WALL.

    Re-measured with the composite ON over the same 45 sampled members
    (`scratch/probes/inline-arg-nextwall.mjs`, firing counts from the `__inlineArgDebug` hook):

    | | |
    |---|---|
    | ctype-goal recognition actually FIRED | **5 (11.1%)** |
    | inline call actually EMITTED | **13 (28.9%)** |
    | COMPLETE | 3 |
    | deepest dead end = the GENERIC `Type-checking error.` row | **32 of 42** |
    | kinds ever offered (non-COMPLETE) | fill 41 · split 37 · invert 21 · recurse 17 · lemma 12 |

    ⭐ **The 179 / 4.98× was a DECLARATION census wearing a reach census's clothes.** The
    predicate asked "does the theorem conclude in a ctype family with a slot a call could
    fill" — a property of the SIGNATURE, true whether or not the search ever stands at such
    a goal. True reach is ~29%, so the class is ~50, not 179, and entry 56's ~12-target
    projection was already the optimistic end of a 3.5×-inflated number.
    ⛔ **[[feedback-size-classes-by-toggle]] in a NEW disguise: "sized by the mechanism's
    own predicate" is not enough — the predicate must be evaluated DURING A RUN, by a
    firing counter, never over the corpus text.** Entry 43 said size by the mechanism's
    predicate; this is the fine print it did not spell out.

    ⭐ **And the residue behind it does not concentrate.** 32 of 42 non-converters die at
    the generic `Type-checking error.` row — the row entry 30 already sub-classified and
    found NOT to be a defect — with `recurse` offered to 17 and `lemma` to 12 of them. No
    single further mechanism is implied. This re-confirms entry 53c at yet another grain:
    **the composite was the best-posed remaining slice, was built WHOLE and gated clean,
    and is worth ~+12 at the very most.** A build of that size is not progress against a
    577-target residue, and no sequence of them reaches the mandate
    (`docs/orca-research-brief-v2.md` §1: 90% means converting essentially the entire
    remaining fragment; the arithmetic rules out incremental mechanisms).

    ⚠ **Instrument bug caught by its own law, third time this arc.** The firing counters
    first read **0/0 on `cc.bel#weaken`, a target that demonstrably fires** —
    `execFileSync` returns stdout and DISCARDS stderr on success, so every debug line was
    thrown away. Switched to `spawnSync`. The positive control was run BEFORE any number
    was believed, which is the only reason the null did not become a finding.

    **INSTRUMENTS KEPT:** `scratch/probes/inline-arg-reach.mjs` (the class + its control —
    ⛔ STATIC, read 56b before quoting it), `scratch/probes/inline-arg-nextwall.mjs` (the
    FIRING-COUNTER version, which is the one to copy),
    `scratch/probes/inline-arg-ab.sh` (parameterised via `IDS` / `OFF` / `ON`),
    `scratch/probes/inline-arg-ab-ids{,2}.txt`, and `diverge-one`'s new `stepsText` +
    `ALL_ENTRIES=1` — which is what showed that a hole had ADVANCED on the wrong move.
    `allDead` cannot answer that, and the answer was the whole diagnosis.
    `INLINEARG=1` is honoured by `diverge-one`, `rebaseline-one` AND
    `scripts/prover-native-oracle.mjs`, so the differential can measure an opt-in
    mechanism without a code edit.

55. **🚨🚨 LIVE SOUNDNESS BUG IN THE SHIPPED ENGINE — IT EMITS AN INVENTED `/ total /`
    PRAGMA THAT DISABLES BELUGA'S TERMINATION CHECK, AND BANKS CIRCULAR PROOFS.**
    (2026-08-17. Highest-priority item in this document. Found while auditing entry 54.)

    **The false proof.** `Weak_Normalization.bel#halts_step` is recorded COMPLETE in the
    current ledger. The engine produces:

    ```
    rec halts_step : {S:[ |- step M M']} [ |- halts M'] -> [ |- halts M] =
    / total s (halts_step s _ _ _) /            ← NOT IN THE SOURCE. The engine wrote it.
    mlam S => fn s => case s of
      | [ |- halts/m X X1] : [ |- halts M] =>
        halts_step [ |- S] s                    ← self-call on the UNCHANGED binder
    ;
    ```

    Beluga **ACCEPTS** this (reconstruction only, no totality error). The theorem is proved
    by itself. Steps were `intro,split,fill` — it came through the **FILL** path, so `decOk`
    never saw it.

    **Mechanism, established by controlled test** (`scratch/probes/_tot_test*.bel`):
    - Beluga DOES enforce totality when a pragma is present and aligned →
      *"Recursive call not structurally smaller."*
    - Beluga does NOT check termination with no pragma at all (documented, expected).
    - A pragma with the wrong arity is rejected outright → *"too many arguments."*
    - ⭐ But `halts_step` has TWO IMPLICITS (`M`, `M'`) plus `S` plus the premise, so
      `halts_step s _ _ _` is arity-CORRECT, and the measure variable `s` lands on an
      **implicit argument** rather than the `fn` binder. The totality check is then
      satisfied vacuously and the circular call passes.

    ⛔ **This violates the project's own standing law** — *"Never emit a `/ total /` pragma
    the author didn't write"* ([[prover-sprint-contract]]). The measure fork emits one, and
    the emitted measure can silently disable the very check it appears to request.

    **Blast radius measured, not guessed.** `scratch/probes/circularity-audit.mjs` over all
    **109 untotalied COMPLETEs** in the current ledger: **3 CIRCULAR (all `halts_step`
    copies), 106 clean.** So the 273 baseline contains ~3 false proofs (~1.1%); the true
    figure is ~270. ⚠️ The audit only covers untotalied targets — a totalied theorem is
    guarded by Beluga — but any target where the MEASURE FORK fires is at risk regardless,
    so this bound is a floor, not a ceiling.

    **Required fixes, in order:**
    1. **Stop emitting invented `/ total /` pragmas**, or emit only measures verified to
       land on an EXPLICIT argument (never an implicit).
    2. **A self-application well-foundedness check on the emitted term at certification
       time** — every self-call's decreasing argument must be a case component. `decOk`
       guards the IH/recurse route only; the fill route bypasses it entirely.
    3. Re-audit the whole ledger with `circularity-audit.mjs` after (1) and (2).

    ### 55b. ✅ FIX (2) SHIPPED — and it turned a false COMPLETE into a TRUE one.

    `circularSelfCalls(code, thm, decIdx)` in `prover-hyp.mjs`, called from
    `proveProgramCore`'s completion path. **Rule:** a self-application is well-founded iff
    at least one of its arguments is a strict sub-derivation (in the decOk set at that call
    site). A self-call with no descending argument anywhere, that passes an original `fn`
    binder, is circular → the run returns `stuck: circular-recursion` instead of COMPLETE.
    Passing the binder ALONGSIDE a descending argument stays legal, so the ordinary
    `f x y'` idiom is untouched. The check can only refuse a completion, never invent one.

    ⭐ **The gating condition is the subtle part.** `!thm.totality` was NOT enough: the
    measure fork builds `thm2 = { ...thm, totality: d.totality }`, so inside the fork the
    theorem looks totalied and the check was skipped *exactly* in the case that produces the
    false proof. The fork now sets **`syntheticTotality: true`**, and the check fires on
    `!thm.totality || thm.syntheticTotality` — the author's pragma is trusted to Beluga,
    ours is verified by us.

    **Result on `halts_step`:** the circular proof is refused and the search then finds the
    REAL one —
    `mlam S => fn f => let [ |- halts/m X X1] = f in [ |- halts/m (onestep S X) X1]`
    under `/ total 2 /` — structurally identical to the author's. So the fix converts a
    false COMPLETE into a true COMPLETE rather than merely losing it.

    ### 55c. ✅ GATED — 199/199, and the false-proof count is now ZERO.

    **Final verification.** `npm run prover:diff` **199/199, zero losses**; suite **209/210**
    (pre-existing `test-project-chaos`). Re-audit of all **109 untotalied COMPLETEs**:
    **0 circular** (was 3).

    - All three `halts_step` copies now complete **genuinely** — the guard refuses the
      circular term and the search finds the author's actual proof.
    - **`exTRel` and `exTRel'` are correctly REFUSED**: they were completing as
      `mlam M => fn X => … exTRel [l |- M] X` — every argument unchanged — under an
      invented `/ total m (exTRel m _ _) /` that Beluga accepts because the measure lands
      on an implicit. Two MORE false proofs than the first audit found, because that audit
      only inspected the FIRST argument of a self-call while the guard checks all of them.
    - ⚠️ These two are exactly the targets the S2 policy comment cites ("exCRel et al.")
      as evidence the untotalied synth path was "measured sufficient". **That evidence was
      partly false proofs.** Any claim resting on it should be re-checked.

    **Corrected ledger: 273 → 271 genuine COMPLETE**, and the untotalied population is now
    verified circular-free.

    ⚠️ **THREE false-positive bugs shipped in the first cut of this check**, every one
    caught by the differential and none by review — recorded because they are the failure
    modes any future guard here will repeat:
    1. **hardcoded `decIdx = 0`** → `decSubderivNames` read the wrong `fn` binder on any
       theorem whose decreasing premise is not first, returning an empty decOk set so every
       self-call looked circular;
    2. **global scan** → the check ran over the whole orchestrated program, so a sibling
       decl mentioning the name matched; it refused `rec eval : … = fn X => X`, the
       IDENTITY, which has no self-call at all;
    3. **`'` escaped as `\'`** → invalid escape under the `u` flag, `RegExp` threw, and
       `mstep'` came back HARNESS-ERROR.
    All three are pinned as C1–C5 in `tests/test-prover-decok-soundness.mjs`.
    ⛔ **The suite cannot catch any of these — it does not touch the corpus. The
    DIFFERENTIAL is the gate for this file.**

    ⚠️ Fix (1) is still OPEN: the fork still emits an invented pragma, it is
    just no longer able to launder a circular proof. Emitting only measures that land on an
    EXPLICIT argument remains the cleaner root fix.

    ⚠️ **Auditing trap that hid this for one full pass.** The first audit reported 11/11
    clean because it extracted the decl with `maskByName`, which **re-masks the body to `?`**
    — so it read a hole and found no calls. Use `enumerateDecls` on the produced code. A
    soundness audit that reads the wrong text is worse than none.

54. **⭐⭐⭐ THE IH IS NEVER OFFERED TO 46% OF THE RESIDUE — and the largest located cause is
    a documented conservative refusal in `recurseTexts`.** (2026-08-16.)

    Population census over **all 391** in-fragment stuck targets
    (`scratch/probes/recurse-offered-census.mjs`):

    | | |
    |---|---|
    | offered `recurse` anywhere | 129 (33%) |
    | offered `lemma` anywhere | 129 (33%) |
    | **offered NEITHER** | **180 (46%)** |
    | offered `split` anywhere | 380 (97%) |

    And they need it — of those 180, **164 (91.1%)** have reference proofs that self-recurse
    (86), call sibling theorems (6), or both (72); only 16 need neither. Average 1.78 calls
    per proof, and **every lemma they call is a sibling theorem already declared in the same
    program**. ⭐ So the cut layer is NOT the binding constraint for this population — nothing
    needs to be speculated. That is a mechanism gap, not a research wall.

    **THE LOCATED CAUSE** — `prover-moves.mjs` (~line 352), in the S2 author-faithful policy
    comment: *"recurseTexts/piRecurseTexts **still refuse without totality** (conservative;
    the synth IH path is the one opened…)"*. The 2026-07-21 untotalied-recursion policy was
    opened ONLY on the synth path; the main recursion generators still bail whenever the
    author omitted `/ total /`. Two probes confirm the shape: `conv` and `ctp` both
    `intro` → `split` on the right premise, producing sub-components, then stop dead at
    10–15 checks with no recurse candidate.

    **SIZED, WITH A CONTROL** (`scratch/probes/untotalied-census.mjs`):

    | | untotalied |
    |---|---|
    | the 180 no-IH targets | 62.8% |
    | all in-fragment stuck | 43.5% |
    | **COMPLETE (control)** | **39.9%** |

    Enriched 1.57× but NOT a clean discriminator — 40% of completed proofs are untotalied and
    succeed via the synth path. The precise slice is the intersection: **44 targets that are
    untotalied AND have a box premise.** The rest of the 180 decomposes as 69 untotalied
    without a box premise (ctype/pi recursion routes) and 67 totalied-but-still-no-IH
    (a different cause, unexamined).

    ⛔⛔ **THIS SLICE CARRIES THE PROJECT'S ONLY REAL SOUNDNESS RISK — read before building.**
    The same comment states why it was left conservative: *"Beluga accepts untotalied recs …
    The checker is NOT the guard here (it would accept circular junk untotalied); decOk is."*
    Opening `recurseTexts` to untotalied theorems means the CHECKER CANNOT CATCH A CIRCULAR
    PROOF — `decOk` is the sole guard. A hole in `decOk` therefore produces proofs that Beluga
    ACCEPTS but that are circular, i.e. false theorems marked COMPLETE. That is strictly worse
    than any missed proof. **The build must (a) audit `decOk`'s case-component descent, (b) pin
    that `fn x => f x`-style circular junk is refused on ≥2 invented shapes, and (c) treat any
    new COMPLETE whose recursion argument is not a case component as a FAILURE, not a win.**

    **Stake: ≥12 of the 44 convert with ZERO circular acceptances, else revert whole.**
    (Not the ≥40/164 declared before the decomposition — 164 is three causes, not one.)

53. **⭐⭐⭐ THE ENTRY-51 COMPOSITE HAS ITS PIECES IN THE WRONG ORDER — the blocker is that
    NO RECURSIVE CALL IS EVER OFFERED. Piece (2) already exists; piece (1) is the work.**
    (2026-08-16. Read before touching entry 51c — it supersedes that build order.)

    Starting the composite, piece (2) — the block-pattern let — turned out to be **already
    built**: `prover-moves.mjs` emits `let [g, b:block (…) |- R[.., b.1, b.2]] = call in` via
    `resultBoxFor` + `depResultProjs`. So the plan was to probe it on `ref'`. Instead `ref'`
    dies at **4 checks, 7 holes, with kinds `[fill, intro, split]`** — no recursion offered
    at all — while reaching a block-extended context on its own.

    Censused over the whole class (`scratch/probes/recurse-offered-census.mjs`, and
    `diverge-one` now emits `allKinds` = kinds offered over the WHOLE search, which
    `allDead` could not answer):

    | over the 30 class members | |
    |---|---|
    | **`recurse` offered ANYWHERE** | **4 (13.3%)** |
    | `lemma` offered anywhere | 9 (30.0%) |
    | **neither recurse nor lemma** | **17 (56.7%)** |
    | `split` offered anywhere | 30 (100%) |
    | `invert` offered anywhere | 4 (13.3%) |
    | died in ≤10 checks | 13 (43.3%) |

    Members die in **2–7 holes at 4–38 checks**. Meanwhile **18 of 28** of their reference
    proofs need a SELF recursive call (entry 51c). So the class is not blocked on building a
    term in a higher-order slot — **it is blocked on ever having a derived fact to put
    there.**

    ⭐ **This retro-explains 51b exactly.** Piece (3) alone measured 2/31, and the 2 that
    converted (`conv`, `close1`) are precisely the ones whose HO body needs no derived fact.
    Without a recursive call there is nothing to cite, so a binder variable is the only body
    available — which is all piece (3) can supply. The measurement was right; the causal
    story ("the composite needs (1)+(2)") was right in content and wrong in ORDER.

    **Correct order: (1) recursion availability → (2) block-pattern let [EXISTS] →
    (3) HO-slot fill [BUILT, opt-in `__proverHoSlot`].**

    ⚠️ **Why recursion is withheld — ONE trace, not a population claim.** On `ref'` the
    reference proof does `case [g |- M] of` and then, inside each arm, `let TRlam tr1 = r in`
    — a CTYPE INVERSION of the comp-typed premise — and only that sub-derivation licenses the
    IH. The engine performs the box split correctly but never offers the ctype inversion, so
    no structurally-smaller `TRel` exists and `decOk` withholds the IH. Ctype inversion IS a
    shipped mechanism (the +3 of 2026-07-31), so the question is why it does not fire here,
    not whether it exists. **Size that before building: census how many of the 17
    neither-recurse-nor-lemma members have a ctype premise that the reference inverts.**
    ⛔ Do not restart the composite until recursion availability is understood — every piece
    downstream of it measures zero by construction, which is what 51b already paid to learn.

    ### 53b. SIZED — and the ctype-inversion hypothesis was `ref'` ALONE. The class fragments again.

    `scratch/probes/ctype-invert-census.mjs` over the 17 neither-recurse-nor-lemma members:

    | | |
    |---|---|
    | has a CTYPE premise | **1 (5.9%)** — `ref'` |
    | all-box theorem, no ctype premise | **16 (94.1%)** |
    | ledger reason `no-totality-measure` | 9 |
    | ledger reason `no-move` | 8 |

    ⛔ **So "ctype inversion does not fire in a case arm" is a ONE-TARGET hypothesis, not a
    slice.** It was flagged as one trace when written (53 above), and the census killed it:
    16 of 17 have no ctype premise at all, so their recursion must come from a box-premise
    sub-derivation, and they split into two further sub-groups (9 totality-measure, 8
    no-move) with different causes. Do not build against `ref'`.

    ⚠️ **Instrument bug caught by its own law, second time this arc.** The first run reported
    "**100.0%** have a ctype premise" — false. `thm.compType.premises` includes IMPLICIT
    CONTEXT BINDERS (`(h:taCtx)`, carrying a `binder` field), and filtering only on "does not
    start with `[`" counted every one. The "an exact 0% or 100% is a bug until proven
    otherwise" rule (added at 51c after the `0/29` regex) caught it immediately. **Keep that
    rule; it has now paid twice in one arc.** Correct predicate: a ctype premise has NO
    `binder` field and does not start with `[` or `{`.

    ### 53c. THE PATTERN IS THE RESULT — stop looking for a class here.

    Every level of resolution fragments and none concentrates:

    > 577 residue → 202 cheap deaths → 75 scored holes → 30 higher-order drops →
    > 17 never offered recursion → {9 no-totality-measure, 8 no-move} → {1 ctype, 16 all-box}

    Four independent instruments this arc (death census, wide-caps A/B, slot-shape census
    with control, constructor-reach census) plus entry 47's three all agree, and the one
    mechanism actually built against a sized class returned 2/31. **The analytic frontier is
    a long tail of ~1.5–3% composites whose pieces are themselves multi-part**, and each
    sizing pass costs a session. That is the honest state; it is not a failure of any
    particular hunt. Planning should either accept the tail rate explicitly or move to a
    different thread — not commission another class hunt expecting a different shape.

52. **⭐⭐ RE-BASELINED: `library.native-rebaseline-20260815.jsonl` — 273/850 COMPLETE
    (32.1%). Net +4 since 2026-07-29, and it surfaced SIX REGRESSIONS.** (2026-08-15.)

    Every percentage quoted before this was against a ledger frozen 2026-07-29 that predates
    at least two shipped mechanisms. Re-swept natively, one child process per target, 60s
    cap, maxSteps 40, resumable (`scratch/probes/rebaseline.mjs` + `rebaseline-one.mjs`), 172 min.

    > **273 COMPLETE (32.1%) · 478 STUCK · 92 TIMEOUT · 7 CANCELLED.**
    > vs merged-20260729: **10 gains, 6 losses, net +4.**

    ⛔ **HARNESS TRAP, NEARLY A FALSE BASELINE.** The first sweep skipped
    `proveOrchestrationCode` — `scripts/corpus-harness.mjs` orchestrates (suite prelude +
    complete siblings, other holed decls stripped) BEFORE masking, and a sweep that does not
    is not comparable to the historical ledger. Measured both ways on the same day:
    outcomes differ on **21/850 (2.5%)**, though only **4** differ in COMPLETE status. So the
    session's class sizes (built on `diverge-one`, which is also unorchestrated) stand within
    ~2.5% noise — but any future sweep MUST orchestrate. The unorchestrated run is kept as
    `library.native-rebaseline-20260815-unorchestrated.jsonl` for exactly this comparison.

    ### 52b. THE "REGRESSIONS" ARE ALMOST CERTAINLY STALE-LEDGER FALSE COMPLETIONS.

    Diagnosed to a stop, and the answer inverts 52's first reading. Evidence, in order:

    1. **No shipped mechanism causes them.** All six toggles (`NO_WEAKEN`, `NO_MIXREC`,
       `NO_CTFACTS`, `NO_MIXEDSLOT`, `NO_CTXVARFILL`, `NO_LFSCOPE`) give **byte-identical**
       check counts to BASE on all five step-bound targets (212 / 166 / 310 / 456 / 359).
    2. **Not a budget.** At `maxSteps 200`, `cap 300s` **all five still fail** — `logEqSym`×3
       step-bound at 782 / 1061 / 1576 checks, `logEqTrans` TIMEOUT at 3705 checks / 300s,
       `ceq` no-totality-measure at 1171. Raising the budget 5× (and the checks 3–8×) does
       not find the proof; it is not "the search got longer".
    3. **`decidx-blast` clears entry 40.** The 5 theorems whose decreasing slot changed are
       `howe_subst`, `algeq-simplified{,1}#thm`, `nbe#weak_neut`, `nbe#weaken` — two of them
       are siblings *in* the affected files, but none is a regressed target.
    4. ⭐ **The reference proofs cannot be found in the checks the old ledger records.**
       `logEqSym` is `LogArr … (mlam h,$W, N1, N2 => fn rn => let e' = logEqSym [|- T1] rn in
       logEqSym [|- T2] (f [h] $[h |- $W] [h |- N2] [h |- N1] e'))` — TWO nested recursive
       calls inside an `mlam`, with a `$`-substitution argument. The ledger claims that at
       **22 checks with zero accepted moves**. That is not constructible in 22 checks.
    5. **The arithmetic closes.** Of the 52 old zero-move COMPLETEs, 48 still complete today
       (with 1–10 real moves — those were genuine, merely unrecorded) and exactly **4 do
       not** — and those 4 are `logEqSym`×3 + `logEqTrans`, i.e. the regressions themselves.

    **Conclusion (calibrated): these were never proved.** The likely mechanism is
    `proveProgramCore`'s vacuous-completion path — when the checker reports no holes and no
    syntactic `?` survives, it returns `complete: checked.ok && errors <= baseErrors` with
    zero steps, which is exactly a `steps:0 / moveKinds:[] / few-checks` row. ⛔ **So the
    net is not "+4 with 6 regressions": the new 273 is CLEAN (zero empty-move completions)
    while the old 269 was partly inflated.** Do not open a regression hunt on these.

    **What would settle it definitively:** re-running the 2026-07-28 engine on these six.
    That needs a git checkout of the pre-entry-40 tree, which is the USER's call — the
    working tree is uncommitted and the agent never checks out. Not required for planning:
    the vacuous-completion path is real and should be made impossible to record as COMPLETE
    regardless (a completion with zero accepted moves on a masked target is a HARNESS BUG —
    assert it, don't ledger it).

    ⭐ **THE SIX LOSSES, AS FIRST READ — banked wins eaten by search COST (SUPERSEDED by 52b).**
    `logEqSym` ×3, `logEqTrans`, `alg-equal-ctxrel#ceq` → step-bound/TIMEOUT;
    `lincx#lemma1_6b` → no-totality-measure. Five of six are step-bound or timeout. They
    completed in **22–273 checks** on 2026-07-29 and today burn **212–453+** before running
    out of budget — a 4–10× cost growth on proofs that used to land. This is the kickoff
    doc's own open lead ("the step-bound cost the new moves added — 60 of 253 in the ctype
    residue") caught in the act of converting completions into step-bounds.

    ⛔ **DO NOT READ `steps`/`moveKinds` ON THE OLD LEDGER — they are per-source.** These
    six show `steps=1, moveKinds=[]` in the merged ledger, which reads as "completed in one
    move" and is FALSE. **52 of the old 269 completions carry `moveKinds: []`, and 48 of
    them still complete today taking 1–10 accepted moves** — so the empty array is a
    RECORDING ARTIFACT of the `native-rebaseline-20260728` / `native-sweep-2026072x` sources,
    not a vacuous or one-move proof. (`checks` IS reliable; it is a plain counter.) An early
    version of this entry built a whole causal story — "a one-move proof became a six-step
    wander" — on that field. Only `checks` supports a claim here.

    ✅ **The engine is broadly STABLE, which this scare briefly obscured.** Of the 206 old
    completions that DO carry a move list, **205 still complete (99.5%)**. The zero-move
    subset fails at 4/52 (7.7%) versus 1/206 (0.5%) — worth noting, but the corpus has not
    drifted. And the new ledger has **zero** empty-move completions, so it is clean.

    First trace (`logEqSym`): 40 holes visited, 23 advanced, 212 checks, and at EVERY dead
    end every candidate is killed by the **prefilter** guard ("constructor/argument family
    or scope cannot match") with zero checker calls. ⚠️ Before treating that as a prefilter
    soundness bug, note §"the prefilter axis is CLOSED with evidence" — the honest next
    step is to recover the ONE move the 2026-07-29 engine accepted first and ask why it is
    now out-ordered, not to open a seventh prefilter front.

    ⭐ **This is a REGRESSION-REPAIR target, not a ranking speculation.** The ROI law's
    "ordering never pays" was measured on attempts to win NEW completions. Here a completion
    demonstrably existed at 22 checks. Six targets, high confidence, cheaper than any
    remaining construction composite — weigh it against entry 51's 14 before building either.

51. **⭐⭐⭐ THE HIGHER-ORDER SLOT DROP — a located, single-cause MISSING MOVE worth 31
    targets across 24 developments. The best-posed slice on the board.** (2026-08-15.)

    Entry 50 asked what the other 178 cheap deaths need, since their shapes are ones the
    lookup pool CAN express. `scratch/probes/ctor-reach-census.mjs` answers it family-scoped, so
    it needs no hole alignment: at a dead-end goal of family F, compare the constructors of
    F the REFERENCE uses against the constructors of F the ENGINE proposed at that hole.

    | at the deepest dead end (77 holes scored) | |
    |---|---|
    | proposed every constructor the reference needs | 31 (40.3%) |
    | proposed some, MISSED one the reference needs (**class B**) | 26 (33.8%) |
    | proposed NO constructor of the goal family (**class A**) | 20 (26.0%) |

    ⭐ **Class B has a single signature-level cause.** Testing the missing constructors
    against their own declared types (`scratch/probes/ho-drop-check.mjs`):

    > **73.0% of MISSING constructors have a HIGHER-ORDER argument slot, vs 7.7% of
    > PROPOSED ones — a 9.5× lift.** The missing names are the binder-takers: `clet`,
    > `klet`, `beta`, `lm`, `ae_l`, `eval_lam`, `r_res`, `ug`.

    ⛔ **Class A is NOT the same defect** — only 30% of its families are all-higher-order;
    the rest are `Map` / `CtxAsTup` ctype families, i.e. the territory entries 41–42 already
    closed as a separate 3-part composite. Do not merge the two.

    **THE CAUSE, LOCATED EXACTLY** — `hole-split.mjs`, the `desc.higherOrder` branch of
    `argFillChoices`: a higher-order argument slot draws candidates **exclusively from the
    R-pool** (`scope.filter(s => /^R\d*$/.test(s.name))` — let-bound recursion results), and
    returns `[]` when no R-binding exists. The constructor loop then hits
    `if (perArg.some((opts) => !opts.length)) continue;` and **drops the entire constructor**.
    At step 0 — where ~95% of these targets die — there is no R-binding yet, so *every*
    binder-taking constructor is unreachable at exactly the moment it is needed. The 9.5×
    lift is this line.

    **THE FIX AT FIRST PRINCIPLES.** A higher-order slot must be inhabited by BINDER
    INTRODUCTION plus synthesis of the body in the extended context — `(\x. BODY)` with BODY
    synthesized against `desc.bodyType` with the binders admitted to scope — not by lookup in
    a pool that is empty by construction early in the proof.

    **PIECES (all behind ONE toggle or do not start, [[composite-moves-are-atomic]]):**
    (1) binder-skeleton generation when the R-pool is empty; (2) a BODY source — synthesize
    `desc.bodyType` in the binder-extended scope; (3) substitution spelling for metas used
    under the new binders (the corpus literally needs `\z.C1[..,z]`); (4) a bound, since the
    new choices multiply through `cartesianArgCombos` and must not regress the other 176.

    **CLASS + STAKE.** Predicate = "at the deepest dead end, a higher-order constructor of
    the goal family that the reference uses was never proposed". **31 distinct targets across
    24 developments** (ids: `scratch/probes/ho-drop-ids.txt`) — 15.0% of the cheap-death class,
    well-distributed, not one shape replicated. Declared stake: **≥8 of 31 convert, else
    revert the whole composite.** Gate as always: `npm test` + `npm run prover:diff`, zero
    regressions or revert.

    ---

    ### 51b. BUILT AND MEASURED — **STAKE MISSED, reverted to opt-in.** (2026-08-15.)

    `hoSlotFills` + `lfCtorAppFills` were built in `hole-split.mjs`: binder introduction,
    binder variables as bodies, in-scope hypotheses transported under the binders with the
    extended substitution (`E[.., x]`, dual-spelled), and depth-1 constructor applications of
    the body family in the binder-extended scope. It works — `ae_l (\x. \d. x)` is now
    proposed on `ref'` where `ae_l` had never been generated at all.

    > **A/B on its own 31-target class: 2 gains · 0 losses · +69.9% checks.**
    > Declared stake was ≥8. **Missed decisively.** Flipped to opt-in
    > (`globalThis.__proverHoSlot`, `HOSLOT=1` in `diverge-one`); default path is inert and
    > byte-identical to before. Suite 208/209 (the pre-existing `test-project-chaos`).

    ⭐ **WHY IT MISSED — and this is the reusable part.** The two conversions (`conv`,
    `close1`, both previously `no-totality-measure`) are exactly the targets whose
    higher-order body needs **no derived fact** — a binder variable or an in-scope
    hypothesis closes them. The other 29 need a body citing a metavariable that only exists
    after an UPSTREAM recursive call bound under binders, e.g. `ref'` needs
    `let [h, b:block (y:term, _t:aeq y y) |- AE[.., b.1, b.2]] = ref' tr1` before
    `ae_l \x.\u. AE[.., x, u]` can be written.

    So the real move is a THREE-part composite and this built the third part only:
    **(1) the recursive call, (2) its let-binding with an extended-context/block pattern,
    (3) the HO-slot fill citing the result with the right substitution.**
    [[composite-moves-are-atomic]] again, one level up — and the measured shape of the
    failure (2/31, all of them the no-upstream-fact cases) is precisely what that law
    predicts. ⛔ Do not re-run piece (3) alone expecting a different number. The next
    attempt must carry (1) and (2) with it, and its stake should be re-sized against the
    29 that need them.

    ### 51c. SIZING (1)+(2) — the class subdivides again. (`scratch/probes/upstream-bind-census.mjs`)

    | over the 29 | |
    |---|---|
    | bind under an EXTENDED context | 22 (75.9%) |
    | — of which a **BLOCK** pattern (`[h, b:block (…) ⊢ AE[.., b.1, b.2]]`) | **14 (48.3%)** |
    | — of which a simple binder (`[g, x:T ⊢ E]`) | 8 (27.6%) |
    | no extended-context binding at all | 7 (24.1%) |
    | RHS is a SELF recursive call | 19 (65.5%) |
    | bound name later cited under a `\`-binder (the `ae_l \x.\w. AE` shape) | **14 (48.3%)** |

    So the coherent sub-class for a next attempt is the **14** needing
    *recursive call → block-pattern let → HO-slot fill*, and the block pattern (with its
    `b.1`/`b.2` projections) is itself a distinct mechanism from the simple binder case.

    ✅ **RE-SIZED AGAINST THE CLEAN LEDGER (entry 52) — the numbers hold.** The original
    counts came from the inflated merged ledger, so the whole chain was recomputed on the
    2026-08-15 population (202 cheap deaths / 76 developments, after also dropping 27
    `file-errors` targets that are programs which do not typecheck, not search failures —
    they had been hiding in the old population as `PRECHECK_FAIL`):

    | | inflated ledger | clean ledger |
    |---|---|---|
    | constructor-reach: proposed everything needed | 40.3% | **40.0%** |
    | constructor-reach: missed ≥1 needed constructor | 59.7% | **60.0%** |
    | HO-drop class (distinct targets / developments) | 31 / 24 | **30 / 23** |
    | of those, needing an upstream fact | 29 | **28** |
    | of those, needing a **BLOCK** pattern | 14 | **14** |

    Every figure is within noise of the original, so entry 51's diagnosis and 51c's build
    target stand unchanged. Ids: `scratch/probes/ho-drop-ids-v2.txt`; population
    `scratch/probes/cheapdeath-ids-v2.txt`. Stake unchanged: **≥5 of 14, else revert whole.**

    ⚠️ **Read the trajectory, not just the row.** 552 residue → 207 cheap deaths → 31
    higher-order drops → 29 needing an upstream fact → 14 sharing one binding shape. The
    class subdivides at every level of resolution and never concentrates. That IS entry 47's
    conclusion re-confirmed at finer grain: each remaining build is worth ~1.5–3% and costs a
    multi-piece atomic composite. Treat a further subdivision as evidence about the frontier,
    not as a lead to chase.

    ⛔ **INSTRUMENT LAW bought here: a census reporting exactly 0% or exactly 100% is a bug
    until proven otherwise.** This one reported "bound name cited under a binder: **0/29**",
    which contradicted the very example the hypothesis was built from. Cause: the regex was
    assembled from an escaped string literal and the leading `\\` collapsed to `\[` — a
    literal bracket — so it could never match. Rebuilt with `String.raw`: the true figure is
    **14/29**. A false 0 reads exactly like a decisive negative result.

50. **⭐ THE SLOT-SHAPE CENSUS — the control group cut entry 49's hypothesis down to a
    29-target class. Nested CONSTRUCTION is real and 3.8× enriched; it is not the unlock.**
    (2026-08-15, same session as 49. Read this WITH 49 — on its own, 49 overstates.)

    Entry 49 concluded "the correct term is absent from the pool; make slot inhabitation
    recursive." That was the right shape of question and too broad an answer. Testing it
    needed a **control group** — if proofs the engine ALREADY completes carry the same slot
    profile, then shape is not the discriminator. Instruments:
    `scratch/probes/slot-shape-census.mjs`, `slot-depth-census.mjs`, `nested-slot-class.mjs`
    (all text-only, seconds, no oracle). Study = the 207 in-fragment cheap deaths;
    control = all 269 COMPLETE.

    **Two of the three "construction" shapes are MORE common in proofs that already work:**

    | slot shape | study | control | verdict |
    |---|---|---|---|
    | LAMBDA (under a binder) | 6.5% | **7.3%** | not a discriminator |
    | CALL (inline theorem call) | 3.7% | **5.0%** | not a discriminator |
    | APP (nested application) | **11.0%** | 2.7% | **4.1× — the signal** |

    ⛔ So "slots need construction" is FALSE as stated: the engine demonstrably handles
    binders and inline calls. Depth confirms the narrowing — boxed applications at
    **depth ≥2: study 22.7% vs control 6.1% (3.7×); depth ≥3: 4.4% vs 0.4% (12×)** — and the
    examples say why. Control's depth-2 terms are ONE nested slot around an atom
    (`ms_step (e_if S)`, `sym (red S*)`, `t_pred (t_succ D)`) — exactly the depth-2
    constructor witness `nestedCtorArgFills` already supplies. Study's need SEVERAL
    structured slots at once, frequently INFIX
    (`fstep (P p_par R) (f_out X Y) (P' p_par R)`, `r_str par_comm (r_par R) par_comm`,
    `red_ind (c_res \z.C1[..,z]) (c_res \z.C2[..,z]) \z.D2[..,z]`).

    **Sized with its own predicate** (≥2 structured slots, or depth ≥3), contamination
    measured on the control rather than assumed:

    > **STUDY 29/207 (14.0%) · CONTROL 10/269 (3.7%) · lift 3.77×.**
    > Infix constructor application present: study 31/207 (15.0%) vs control 11/269 (4.1%).

    ⚠️ **Read that honestly: 29 targets is a TAIL slice**, ~5% of the 552 residue — squarely
    inside entry 47's "everything is 3–20%" band. It is well-posed, enriched, and buildable,
    but it is NOT a route from 32% to the ~91% analytic ceiling, and nothing in this session's
    data suggests such a route exists. Entry 47's conclusion survives a fourth independent
    measurement.

    ⭐ **THE MORE INTERESTING RESIDUAL, UNMEASURED.** The other **178/207** cheap deaths need
    only depth-1 applications of ATOMIC slots — shapes the lookup pool CAN already express.
    So for the large majority the right SHAPE is available and the engine still fails, which
    points at atom CHOICE and context SPELLING (the death census's 19% scope-error class:
    free context variable / free meta-variable / not closed), or at a missing earlier
    split/inversion that would have put the right atom in scope. **That is the next thing to
    measure, and it is a bigger population than the construction class.** It needs the
    oracle (is the needed atom in scope at the dead end?), not a text census.

    **If the nested-construction slice is built anyway**, it is a 3–4 piece ATOMIC composite
    ([[composite-moves-are-atomic]]): recursive slot synthesis · infix emission · under-binder
    slots with substitution spelling · a bound across combined slots. All behind one toggle
    or do not start. Stake: **≥8 of the 29 convert, else revert whole.**

49. **⭐⭐ THE DEATH CENSUS — the residue is a CONSTRUCTION gap, not a coverage gap, and
    not a search-control gap. Pool-shaping is dead by measurement.** (2026-08-15. This is
    the first population-scale answer to "why does the search stop?"; entries 44–47 sized
    the residue, this one names its mechanism.)

    **The blind spot that invalidated the earlier histograms.** `scratch/probes/error-census.mjs`
    tallies only rows with `verdict === 'rejected'`, so it could not see the death mode where
    `candidateMoves` returns NOTHING. Every rejection share it ever reported was therefore
    computed against an unknown denominator. New instrument **`scratch/probes/death-census.mjs`**
    classifies EVERY dead end into `ZERO-CAND` / `ALL-REJECT` / `ALL-GUARD` / `MIXED`, and
    sub-features the zero-candidate goals structurally.

    **Population: all 207 in-fragment cheap deaths** (STUCK, ≤50 checks, coinductive excluded;
    66 developments, max 13 from any one — not one shape replicated). Ids in
    `scratch/probes/cheapdeath-ids.txt`. Run to completion, 0 no-data.

    | measurement | result |
    |---|---|
    | targets that EVER hit a hole with zero candidates | **8 (4%)** |
    | deepest dead end = MIXED / ALL-REJECT | **182 (88%)** |
    | move kinds generated at dead ends | fill **455** · split **329** · intro **146** · recurse **125** · invert **106** · lemma **65** · **synth 16** |
    | rejections that are TYPE errors | **~72%** of 1639 |
    | rejections that are SCOPE errors (free ctx var / free meta / not closed) | **~19%** |

    ⛔ **The engine is not short of moves. It says the wrong thing, at scale.** Note also that
    `recurse` IS offered 125 times at dead ends — the older "64% are never offered a recurse
    candidate" (entry 47, a 45-target sample) does not hold on the full population.

    ⛔⛔ **THE DECISIVE NEGATIVE — CROWD-OUT IS DEAD. DO NOT RE-TEST IT.** The obvious reading
    of "88% die with everything rejected" is crowd-out: a correct fill exists in the pool but
    sits past a cap (`fillScope`'s own comment concedes the risk — "the bounded combo
    enumeration must reach them before the cap"). Tested directly with `__proverWideCaps`
    (`WIDE_CAPS=1`, default OFF, documented at the `capN` site in `hole-split.mjs`), widening
    every generation cap 4→64 / 6→96 / 48→512 / 12→128, same 207 targets:

    > **207/207 IDENTICAL VERDICTS. 0 changes. +4.4% checks.**

    The correct term is **absent from the pool**, not buried in it. The pool is built by
    LOOKUP — in-scope names, their weakened spellings, nullary constructors, the branch
    pattern's own term, and reassembled R-pool lets. A slot needing a **constructed**
    inhabitant (a constructor application, a term under binders, an inline recursive call)
    cannot be filled from it **at any cap**. So widening, filtering, or index-ranking that
    pool is predicted ZERO — which is the standing ROI law (entry 45 measured the filtering
    arm at −4.1% checks / 0 gains) now confirmed from the opposite direction: the widening
    arm is also zero. **Both directions of pool-shaping are closed.**

    ⭐ **Where the real gap is, stated structurally.** Fill generation is *shallow but not
    naive*: `hole-split.mjs` DOES match the constructor's result indices against the goal
    (`matchIndices`) and DOES push that substitution into each slot's expected type
    (`want = applySubst(at, subst)`). Then it throws that information away — `argFillChoices`
    inhabits the slot by comparing **family HEADS only** (`headOfConclusion(s.concl) === fam`),
    over a finite lookup pool. There is no recursion: the procedure that inhabits a GOAL is
    never applied to inhabit a SLOT. `prover-synth.mjs` *is* that recursive procedure (SLD
    backward chaining, honestly fragment-scoped) but it is wired as a **sibling move kind**,
    offered **16 times against fill's 455**.

    **The reformulation this implies (unbuilt, stake below):** make slot inhabitation the
    same goal-directed synthesis applied recursively, threading the accumulated substitution
    through slots, under an explicit depth/termination bound — i.e. unify synth and fill
    instead of running them as siblings. This is a GENERATION change (the only category that
    has ever paid), not a pruning or ranking change.

    ⚠️ **What this entry does NOT establish.** "88% ALL-REJECT" is near-tautological at a dead
    end (a hole with surviving candidates is not a dead end). The load-bearing, non-tautological
    findings are the **4% zero-candidate rate**, the **72/19 type/scope split**, and the
    **207/207 wide-caps null**. Sizing the reformulation still requires its own reach census
    against the mechanism's own predicate ([[feedback-size-classes-by-toggle]]) — the shape
    census of what the reference proofs actually need at these holes is the next measurement,
    NOT the build.

48. **✅ THE `prover:diff` DEFAULT-LEDGER TRAP IS CLOSED BY CONSTRUCTION.** (2026-08-06.)
    Entry 40 documented it and the laws repeated it in three places: `prover:diff` defaulted
    `--ref` to `results/corpus/library.20260715.jsonl` (**183** COMPLETE) rather than the
    frozen `library.jsonl` (**199**) named as THE fixed baseline — and `npm run prover:diff`
    passes no `--ref`, so a bare run silently gated against a stale, smaller ledger and
    reported a confident `183/183`.

    **A rule that must be remembered every time is a trap, not a fix.** Three changes in
    `scripts/prover-differential.mjs`:
    - the default `--ref` is now `results/corpus/library.jsonl`;
    - every run PRINTS ITS BASELINE before any results —
      `ref results\corpus\library.jsonl  (default) — 199 COMPLETE` — with `(default)`
      shown only when `--ref` was omitted, so a wrong or stale ledger is visible at a
      glance instead of silent. The baseline, not the target count, is what a differential
      means;
    - a missing `--ref` file exits **2** with a named error instead of an opaque ENOENT.

    Verified on all three paths (default / explicit / missing). ⚠️ **Consequence:
    `npm run prover:diff` is now correct BARE.** Older doc text saying "always pass `--ref`
    explicitly" is harmless but obsolete; the operative instruction is **read the printed
    COMPLETE count**. Entry 40's second trap (a CANCELLED under CPU contention reading as a
    2× regression) is UNFIXED and still requires discipline: never A/B beside a sweep.

47. **⭐⭐ THE DEFINITIVE RESIDUE MAP — THERE IS NO MASS CLASS LEFT. Three independent
    instruments, one conclusion.** (2026-08-06. Read this before planning any slice; it
    supersedes the "pick a bigger class" framing of §0.5 for the CURRENT residue.)

    Every prior session assumed the residue still contained an unfound mass class and
    that the job was to identify it. **It does not.** Three measurements built this
    session, each cheap and each falsifiable, converge:

    | instrument | scope | finding |
    |---|---|---|
    | `scratch/probes/feature-census.mjs` | all 552 stuck, text | EVERY syntactic feature lands at **3–20%**. Top: weakening 22%, nested case 21%, nested-ctor-arg 19% (**18** in closing position), ctype-pattern-let 17%, subst-applied meta 8%, param-Pi 5%, **context induction 3%**. Nothing dominates. |
    | `scratch/probes/error-census.mjs` | 20 targets, 1341 rejections | one class IS 41% ("Expected an LF term-level constant") but is only **~4% of CHECKS** (entry 45). A rejection histogram is not a cost histogram. |
    | `scratch/probes/step-map.mjs` | 45 targets, step-weighted | **56% of stuck targets die at step 0**, consuming only **18% of checks**; the 47% that DO take steps consume **82%**. **64% are never offered a recurse candidate.** |

    **And the 0-step group is not one defect either.** Its goals are wholly
    heterogeneous — `SNe [_ ⊢ M]`, `Map [x : target …]`, `Sem [h] [ ⊢ b]`,
    `Reduce [ ⊢ A] [ ⊢ #p[]]`, `CtxAsTup [g]`, `Aeq' …`, plus ordinary LF box goals.
    22 of 25 ARE offered a split; it simply never certifies. "The first split fails" is
    a symptom shared by unrelated causes, not a mechanism.

    ⭐ **What this means for planning.** The treadmill the plan warned about ("add a move
    to pass lemma N+1") is now the ONLY thing left on the analytic frontier: each
    remaining mechanism is worth ~3% and costs a multi-piece atomic build. That is not a
    reason to despair — it is the honest shape of a residue whose generation layer is
    closed (§2.3). It DOES mean: stop spending sessions searching for a big class. The
    search is over; the answer is "there isn't one."

    **The best remaining slice, sized and left UNBUILT for whoever picks this up:**
    **context-structural induction — 16 targets, EXACT type-level predicate.**
    `scratch/probes/ctxind-census.mjs` computes it: (A) an explicit `{g : <schema>}` binder,
    (B) the measure NAMES it (`/ total g (f g) /`), (C) the reference splits `case [g] of`.
    **A+B = A+C = A+B+C = 16** — the correlation is perfect, so the engine can identify
    the class from the THEOREM'S TYPE ALONE, no reference proof needed (ids in
    `scratch/probes/ctxind-ids.txt`). Members die cheaply at step 0 (2–11 checks:
    `weak-norm-under-binders#idRedSub` 3ck, `#shiftIsVarSub` 2ck,
    `weak-norm-under-binders-simplified#redVar` 11ck), so conversions would be clean.
    It is a 3–4 piece ATOMIC composite — split the context by its schema · emit the `[]`
    and `[g', x:T]` arms · `measureDesignation` returning a ctx designation (it currently
    returns box/pi/null and a ctx-named measure falls back to box 0) · recursion at `[g']`.
    **All of it behind one toggle or do not start** ([[composite-moves-are-atomic]]).
    Suggested stake: ≥6/16 convert, else revert whole.

46. **⛔ THE "MEASURE-FORK BLIND SPOT" IS NOT A BLOCKER — falsified in 3 minutes, before
    any code.** (2026-08-06.) A text census found a large, well-distributed class and the
    reasoning looked airtight; it was wrong, and the check that killed it was cheap.

    **The hypothesis.** `hypotheticalMeasures` (prover-orchestrator) proposes a synthesized
    `/ total … /` for BOX premises and explicit object-Pi binders only — never for a CTYPE
    premise. So a recursive theorem whose only induction-eligible premise is a ctype gets
    ZERO fork candidates. `scratch/probes/measure-gap-census.mjs` sized it: **115 targets, 83
    of them in-fragment, spread over 26 developments** (not one shape replicated — the
    entry-41 trap was checked for and cleared). It reads like the biggest missing move left.

    **Why it is not.** `decreasingArgIndex` line ~390 — **`if (!thm.totality) return 0;`** —
    is the AUTHOR-FAITHFUL UNTOTALIED RECURSION policy (user, 2026-07-21): when the author's
    decl omits `/ total /`, recursion is allowed and the decreasing slot defaults to the
    first argument premise. An empty measure fork therefore does NOT deny these theorems an
    IH. Confirmed natively: `algeq-simplified1#reflect` is offered `recurse` among its move
    kinds despite proposing zero hypothetical measures.
    (`cc#extend` and `weak-norm-under-binders#extVarSub` are NOT offered recurse — but they
    die at 8 and 6 checks, i.e. at step 0, where no split has yet produced a sub-derivation
    for `decSubderivNames`. That is correct behaviour, not a measure gap.)

    ⭐ **The transferable lesson.** The census question was "what does the MODEL propose?"
    when the operative question was "what does the ENGINE ultimately offer?" — and those
    differ wherever a downstream default (here, untotalied recursion) fills the gap. Before
    sizing any slice on a generator returning empty, run ONE native target and read the
    OFFERED MOVE KINDS. Same family of error as the size-by-toggle law, one level earlier:
    reach measured at the wrong stage of the pipeline.

45. **⛔⛔ THE 41% REJECTION CLASS IS ONLY 4% OF CHECKS — the error census's first
    finding, built, measured, REVERTED.** (2026-08-06.) The most useful negative result
    of the arc, because the premise was *correct* and the payoff still was not there.

    **The instrument (KEEP — `scratch/probes/error-census.mjs`).** Runs a stride sample of
    stuck targets and tabulates (move kind × CHECKER ERROR CLASS) over every REJECTED
    candidate. This industrialises the "read the emitted text" corollary: entry 43's
    defect took four hand probes on one target; a histogram finds that shape in one run.
    First run, 20 targets / 1341 rejected candidates:
    | share | checker error | kinds |
    |---|---|---|
    | **41% (545)** | Expected an LF term-level constant | fill 375, lemma 113, recurse 57 |
    | 25% (340) | Type-checking error | fill 150, lemma 78, recurse 63 |
    | 18% (235) | Ill-typed expression | fill 138, lemma 65 |
    | 3% (41) | Expression is not closed | recurse 26, lemma 15 |

    **The diagnosis was RIGHT.** `fillScope` feeds constructor ARGUMENT slots from
    `hole.meta` + `hole.ctx` with no well-formedness filter, so it offers (a) the schema
    binder `g : cxt` — a context variable is not a term — and (b) comp-context
    hypotheses (`ms : [g ⊢ mstep M M']`), a comp VALUE that is ill-formed bare inside a
    box. The engine really was emitting `[g ⊢ m-step X g]`, `[g ⊢ m-step ms ms]`,
    `[g, x:name ⊢ β≡ g g g]`. hole-split already states law (b) at the WEAKENING site;
    the fill pool never applied it.

    **The payoff was not.** Both filters were built, verified to FIRE, and A/B'd on the
    same 20 targets the census measured:
    | arm | checks | gains | losses |
    |---|---|---|---|
    | exclude context variable | **−1.3%** | 0 | 0 |
    | + exclude comp-context in LF positions (`lfOnly`) | **−2.8%** more | 0 | 0 |
    | combined | **−4.1%** (3417 → 3278) | 0 | 0 |
    Reverted under the declared ≥20%-checks stake. Per-target it did work where the
    census pointed (`red_impl_red_rew_par` −37%, `weakNorm` −31%), but the expensive
    targets (`tps` 740ck, `algEqRTrans` 497ck) barely moved.

    ⭐ **THE LESSON, and it generalises to every future prune:** *a share of REJECTIONS is
    not a share of CHECKS.* Structurally-invalid candidates are CHEAP and CLUSTERED in a
    few shallow holes; the checks that actually cost are deep, few, and individually
    expensive. Never stake a slice on a rejection-class histogram — convert it to a
    CHECK-WEIGHTED figure first (weight each rejected candidate by the ms its check took;
    `diverge-one` already has the data). This is the ROI law's 22nd confirmation: **no
    completion has ever come from removing candidates**, and now we also know the SPEED
    argument for pruning is ~5×  weaker than the rejection histogram suggests.

    The revert is documented at the `fillScope` code site so it is not re-derived.

20. **The hole-report TELESCOPE fix — built, verified, REVERTED. Do not re-derive it
    blind.** `CTX_ENTRY`'s name group is `[^\s:]+`, which also matches a Pi binder's
    opening `{S`, so the second line of a multi-line telescope type is read as a NEW
    context entry and one hypothesis becomes two broken ones. The first line is
    bracket-BALANCED, so the existing `depth > 0` continuation test cannot catch it —
    the same limitation the goal parser's 'block' mode already documents. Requiring an
    identifier name and folding genuine continuations into the previous entry DOES fix
    it (poplmark-reloaded+#case_snb: the accessibility hypothesis then arrives whole,
    33 → 75 checks). **But it bought ZERO completions and cost
    `tapl/ch3+arith+leq#mstep_leq_2` COMPLETE → step-bound** — the same fragile target
    Wave 6's revert (a) names. Reverted under the zero-regressions law; the reasoning
    lives at the code site. Re-attempt only alongside whatever makes `mstep_leq_2` robust
    to a wider hypothesis pool.

    **⚠️ AND A PERF TRAP WORTH ITS OWN LINE.** The first cut made the continuation a
    CATCH-ALL (append any unmatched line to the previous entry). Every gate passed —
    `npm test` **203/203** — but it took **4.9 HOURS instead of 110 seconds**: quadratic
    string growth on large multi-hole reports. `parseHoles` runs on every check in the
    IDE, so this would have landed as an editor-wide input-latency regression that no
    prover gate would have flagged. **A green suite is not a green clock — read the
    suite's own reported time.** Narrowing the rule to structural continuations
    (`{`/`(`/`[`/arrow/closer) restored 108.8s.

    **The SN chain, now exactly located — all four links BUILT:**
    (1) ✅ split the `Sn` hypothesis → `Acc [h] [ |- X1] [_ |- X2] X3` (mechanism 15);
    (2) ✅ construct → `Acc [_] [ |- _] [_ |- _] (mlam X4, X5 ⇒ ?)` (this mechanism);
    (3) ✅ INVERT the mlam-bound derivation — `piNames` now carries emitted-`mlam`
    binders (18b); and
    (4) ✅ apply the HO hypothesis as a rule, INLINE in the recursive call's ctype
    argument slot (18c). All four links ship; `inl_sn`/`inr_sn` close end to end.



## 1. What this is, and the read-first laws

**The inversion (user-mandated, non-negotiable).** BelJar IS the prover. Its semantic engine
(AST / schema / totality intelligence) generates every proof step from OUR model of the
mathematics. Beluga's checker is an **oracle** that certifies candidates (`checkResult`),
never the driver. The pre-inversion design — buttons forwarding to Harpoon's REPL tactics —
was condemned as a wrapper, and "BelJar is not a Beluga wrapper" is the #1 thing the user
gets furious about. If you ever catch yourself "shimming one more tactic," "trusting Beluga's
text harder," or treating Beluga's output as the source of truth: **STOP.** We generate from
the semantic model; we invoke Beluga surgically on AST FRAGMENTS and transform the result;
otherwise we honestly decline. Never a slave-wrapper.

**The Level-2 principle.** The AST is the substrate. Beluga is invoked on AST *fragments*
(so errors are local by construction), never as a text-blob checker we hack around. "Smart /
uncompromising" means exactly this, not a feature-rich UI.

**The laws that have each burned a session:**

- **Anti-overfit.** NEVER branch on a specific theorem / constructor / schema *name*. Measure
  "solved from the TYPE," never "lemma X green." `tests/test-prover-no-overfit.mjs` is
  STRUCTURAL — it flags name-literal compares; a legitimate kind-tag compare needs a same-line
  `// GENERAL:` waiver. Denylist-style tests are theater. Use structural guards and held-out
  lemmas the engine has never seen.

- **Fill gaps, don't reduce them.** The user rejects heuristics that help "some cases." A gap
  gets a principled mechanism (the synthesis engine, the focusing rewrite), not a knob.

- **Corpus VERIFIES, it never DISCOVERS.** This is severe. The "11/11 gates / fragment closure
  / decidability" declarations once COLLAPSED on real-corpus contact (~44/100 on a
  mid-difficulty stretch, 2/60 on the hardest, 16 timeouts in one run). The mandate that came
  out of that: **the engine must be productive BY CONSTRUCTION**; the corpus is a falsification
  instrument that confirms the construction argument, never the mechanism that finds the next
  fix. When a run *discovers* a gap class, the response is a new invariant / mechanism argued
  from the spec (a D-row below), **never an instance patch**. And never, ever declare completion
  from a scoreline. A timeout is a bug to root-cause. Report flat and gap-first.

- **Never modify `Beluga-W/src/core/`** or any semantic OCaml. `src/web/beluga_web.ml` (the
  shim) is the *only* OCaml you may touch, plus build scripts. (§ rebuild recipe at the end.)

- **Listen first.** On a long / multi-angle / frustrated message, internalise the WHOLE picture
  before proposing. Don't latch onto one fragment.

- **The working tree is UNCOMMITTED and the user commits, never you.** Never `git checkout
  <file>` / `git stash` / `git reset` to undo your own edits — that has silently reverted the
  owner's uncommitted work and had to be recovered. Undo with the Edit tool against specific
  lines.



## 2. Where we stand right now (honest, gap-first)

### 2.1 The numbers (as of 2026-07-18 — the P1–P10 ledger of record; E.9 NOT in this engine)

- **Library: 192/823 (23%; 24% in-fragment).** Net **+9 COMPLETE** vs 07-15 (13 gained,
  4 lost: the §6.2 №4 pair `tps`/`unique_eval` + 2 TIMEOUT flips possibly caused by CPU
  contention — test suites ran concurrently with the sweep, violating the one-heavy-instrument
  law). **Zero soundness incidents: 0 false DISPROVED (P4 held), file-errors back to 1 (P5
  held at scale).**
- Stuck decomposition: no-move 348, no-totality 89 (was 166 — the largest mover), coinductive
  39, search-bound 19 (the newly HONEST bound class, formerly silent no-moves), step-bound 1.
- **TIMEOUT: 132 → 69 on the E.9 sweep (2026-07-18)** — the certify-closure trim validated at
  scale: 34 ex-timeouts became honest no-move, 25 no-totality, 5 COMPLETE; whole-sweep wall
  4.0h → 2.6h with 10k MORE checks (per-check ≈2.1× cheaper; 4× on the harmony class —
  `red_rew_impl_fstepcong` 16 → 65 checks/60s, still over the cap). COMPLETE flat at 192
  (5 gained / 5 lost); the E.9 sweep also surfaced P11 (wk crash) + P12 (vacuous-acceptance
  spiral) — fixed same-day, 5 of the 9 sweep losses recovered by native differential.
- **Blind held-out: 22/39 measured on the E.9 engine** (pre-fix; wk recovers post-P11/P12 →
  ~23/39). Remaining heldout losses (`eval_det`, `sound`, `eval_add_comm`) join `tps`,
  `unique_eval` in the **§6.2 №4 accepted-move-sensitivity ledger — now 5 named targets, the
  top completeness priority (plans accepted whole / backtracking over accepted moves).**
- **197/197 tests, tree uncommitted.** Archived ledgers: `library.20260712/15.jsonl`,
  `library.20260717-invalid.jsonl`, `library.20260718-p10.jsonl` (P1–P10 record), current
  `library.jsonl` = the E.9 sweep; heldout `tests-heldout-corpus.20260712.jsonl` archived.

### 2.2 The ledger — what the misses actually ARE (this is the map of the frontier)

The library residue decomposes (Phase A re-sweep, 2026-07-15) as:

| Class | count | What it is | Honest disposition |
|---|---|---|---|
| No-move ("lemma depth") | 321 | proofs needing a CUT (invented lemma / strengthened IH / logical relation) — but this is a SPECTRUM, not a wall | **Decomposes** (§3.2 T3a–d): T3a generalization + T3b algebraic lemmas are tractable (rippling / theory exploration); some rows are mis-classified Tier-1; only T3c-exterior/T3d is a true wall. **Do NOT read 321 as one monolithic crown jewel — §3.2 must reclassify it.** |
| No-totality residue | 162 | measure unavailable / partial | Still includes unicode-ident step-0 stalls (Phase B) + genuine partials |
| TIMEOUT | 114 | oracle cost, not a proof gap | **§7.E — a §7 contract violation to root-cause, not a difficulty** |
| Coinductive | 39 | `fun`/copattern — classified, by design out | Out unless the user asks (bounded 2-former addition) |
| Corpus issues | 27 | PRECHECK_FAIL — the files themselves | Not our bug |
| Harness residues | 4 | 2× protocol `callFunctionOn` FAIL (`*#refl`), 1× `file-errors`, 1× `step-bound` | Protocol FAILs = page wedge (recover already); not engine gaps |

The **162 no-totality residue** still mixes genuine partials (untyped `eval` — fast honest decline
is correct) with **unicode-ident step-0 stalls** (Phase B) and any remaining object-Pi forks
D13 should have moved. Reclassification of the no-totality / no-move boundary is incomplete —
do not treat either count as a single mechanism class.

**⚠️ SUPERSEDED (2026-07-19): the reading below was FALSIFIED by the residue audit —
see §0.5. The "lemma depth" no-move mass is mostly SMALL COMPOSITIONS of pool lemmas
(179 targets with ≤8-line reference proofs); the cut tier's real address is the ~90
LARGE-reference tails. The current class map and slice queue live in §0.5; this
paragraph is kept only as the record of the error.**
~~Read this table as: the NEAR frontier (Phases B–G) is `no-totality (non-partial) + a large
share of the 114 timeouts + the unicode step-0 stalls` — analytic Tier-1 work. The
321 "lemma depth" no-moves are the CUT tier, and §3.2 shows that tier is a spectrum from
tractable (rippling generalization, theory-exploration lemmas — Phase H T3a/T3b) to a single
genuine wall (a novel semantic cut — T3d). Treating 321 as one impassable block is exactly
the error §3 corrects.~~

### 2.3 What is CLOSED (do not re-litigate, do not "add a move" here)

Generation is **closed over the inductive fragment**. A Beluga proof is a `Comp.exp`; its
formers are a FIXED list in `Beluga-W/src/parser/comp_parser.ml`
(`comp_expression_object` / the `Raw_*` vocabulary). The engine emits **all 11 inductive
formers**; the 2 it doesn't (`fun`/copattern + `.field`) are coinduction, explicitly out of
scope. **Consequence: the "add a move to pass lemma N+1" treadmill is provably over.** If you
ever think a former is missing, you are almost certainly looking at a search-control problem
or a bug. This is the single most important thing that is DONE, because it means every
remaining failure is *search*, not *vocabulary* — which is exactly why the answer is a better
search, not more moves.

The D1–D14 audit (§5) closed fourteen concrete generation divergences. The 11 hard gates pass
with zero Harpoon. `bigstep_det` — once architecturally unreachable — is closed by the
backward-chaining synthesis engine.

### 2.4 Architecture map (where everything lives)

The solve loop — `proveProgram` / `proveProgramCore` in
[prover-orchestrator.mjs](js/editor-src/prover/prover-orchestrator.mjs) (3809 lines, THE orchestrator) —
iterates: check program → parse `## Holes ##` report (`parseHoles`,
[hole-report.mjs](js/editor-src/prover/hole-report.mjs)) → leftmost hole → `candidateMoves` from OUR model
→ certify each candidate with the checker → accept the first that checks clean → loop until
0 holes (COMPLETE) or no move (STUCK, with an honest reason + the tried list).

| File | Role |
|---|---|
| [prover-orchestrator.mjs](js/editor-src/prover/prover-orchestrator.mjs) | THE orchestrator. `candidateMoves` (order: closing-fills → **synth** → impossible → recurse → open-fills → invert → lemma → split → intro), `proveProgramCore`, budgets/guards, wave-parallel dispatch, prefilter, F1 step meta/captions/trace. **The file you will change most.** |
| [prover-synth.mjs](js/editor-src/prover/prover-synth.mjs) | goal-directed **backward-chaining synthesis** (SLD over the pattern fragment) — this is the seed of the north star. Pure; adapter = `synthMoves` in the bridge. **The file whose ideas you will GENERALISE.** |
| [hole-split.mjs](js/editor-src/prover/hole-split.mjs) | the model layer: typed constructor enumeration, split/intro skeletons, inversion, param inversion, fills, schema/block machinery, symmetric unifier. |
| [prover-comp-type.mjs](js/editor-src/prover/prover-comp-type.mjs) | pure comp-type parsing, totality parsing, IH matching, `measureDesignation` (single source of truth for what the measure decreases). |
| [proof-format.mjs](js/editor-src/format/proof-format.mjs) | `formatProofBody` — token-preserving re-layout + canonical glyphs. |
| [prover-corpus-decls.mjs](js/editor-src/prover/prover-corpus-decls.mjs) | PURE harness core: `assembleCfgProgram`, `enumerateDecls`, `maskableTargets`, `maskByName`, `mutualMembers`. |
| [js/beluga/beluga-client.js](js/beluga/beluga-client.js) | worker plumbing: `proverSlot` session + a CHECK POOL of 2 (checkFromString is STATELESS → checks parallelize; wave size 3). |
| [scripts/prover-native-oracle.mjs](scripts/prover-native-oracle.mjs) | **FIRST TOOL** — browserless, step-faithful `proveProgram` with native `main.exe` as oracle. |
| [scripts/corpus-harness.mjs](scripts/corpus-harness.mjs) | the falsification instrument (one chrome, resumable JSONL cache). `corpus-plan.mjs` / `corpus-report.mjs` alongside. |
| [scripts/prover-probes.mjs](scripts/prover-probes.mjs) | the 11 live gates (`npm run prover:probe`). |

**Domain facts you need on day one:**
- A case-split's sub-derivations land in the META context (Δ / cD) as `X1 : ( |- dual A A')`,
  NOT the comp context. Meta types use `( |- C)` parens, boxed ones `[ ]` — `conclusionOf`
  handles both.
- A one-branch `case` IS a `let` (the inversion idiom); `impossible` is the zero-branch case.
- Arm patterns need TYPE ANNOTATIONS `| pat : [g ⊢ T] =>` to bind implicit indices (Beluga's
  own discipline) — but annotations fail on some shapes, so the bridge emits TWO variants
  (annotated first, bare fallback) and lets the checker arbitrate. **This dual-spelling,
  checker-arbitrated doctrine recurs everywhere — internalise it (§5, D3/D11/D14).**



## 3. The ideal state — the ONE boundary that matters is the CUT

The user's challenge is exactly right and it reframes this whole section: *before we call
something a wall, we must prove it is a law of physics and not defeatism.* My first draft drew
the wall in the wrong place ("342 lemma-depth misses = out of scope, not decidable") and hid a
rich, largely-tractable interior behind a true-but-misapplied undecidability result. This
section redraws the map at research grade. **Read it as the intellectual core of the whole
plan — the phasing in §7 is downstream of getting this boundary right.**

### 3.1 The single organizing idea: every hard proof is a CUT, and the cut is the only wall

A proof step is one of two kinds. **Analytic** steps (Gentzen's *cut-free* / focusing world):
intro, split/case, inversion, and closing by a head drawn from the signature — every piece is a
*subterm* of the goal, the hypotheses, or the signature. These are what §5–§6 enumerate; the
subformula property makes their search space finite-by-construction (modulo the split-nesting
hole §6.2 №1, which focusing closes). **Synthetic** steps introduce something *not* a subterm of
the goal — a lemma statement, a generalized induction hypothesis, a new type-indexed definition
(a logical relation). In sequent-calculus terms **a synthetic step is a CUT**: the "middle
term" it introduces is invented, not decomposed.

This is the entire boundary, and it is precise:

- **Cut-free, structural-induction search in a fixed signature is a legitimate decision-procedure
  target** (Tier 1). Focusing + the subformula property + a well-founded induction measure make
  the search space a finite quotient; exhaustion is a real answer. This is the honest content of
  the §6 contract.
- **The cut is where creativity — and undecidability — actually live.** Two hard theorems, both
  real laws of physics, pin the wall:
  1. **Undecidability of the ambient logic.** First-order validity is undecidable (Church–Turing);
     higher-order and inductive theories are worse. So "is `T` provable *with arbitrary new
     lemmas/definitions*?" has **no decision procedure, ever.** Full "prove ANYTHING" is
     physically impossible. That part of my caution stands.
  2. **Cut is essential and non-elementarily compressive.** Gentzen's *Hauptsatz* says cuts are
     eliminable *for provability in pure logic* — but (a) with **induction**, cut-free systems are
     **incomplete**: there are inductively-true theorems with **no** cut-free proof, so the lemma
     is not a convenience but a *necessity* (this is why Tier-1 search will correctly, and
     permanently, fail on them); and (b) even when a cut-free proof exists, it can be
     **non-elementarily larger** than the cut proof (Statman/Orevkov) — so bounded cut-free search
     cannot *find* it in feasible time. **Finding the right cut is not bounded search. That is the
     law of physics.**

**But — and this is the correction the user demanded — "finding an *arbitrary* cut is
undecidable" does NOT imply "finding the cuts *this corpus needs* is out of reach."** Halting is
undecidable in general, yet we prove termination of real programs every day. The cuts that SN,
Church–Rosser, Howe's method, and algorithmic-equality completeness need are **not arbitrary**:
they are *structured, named, type-directed constructions* that a substantial, mature body of
research automates. Surrendering them wholesale was falling short. §7.H rebuilds that interior.

### 3.2 The tiers, redrawn — with each "law" checked

**Tier 1 — THE ANALYTIC DECISION PROCEDURE (the spine; §7.A–G).** For any theorem provable
*cut-free with structural induction in the fixed signature*, the engine halts with a certified
proof or the honest verdict **NO-CUT-FREE-PROOF** (a decidable, precise "no" — *not* "false,"
*not* "unprovable in Beluga," but "no proof without a new lemma/generalization"). **Is the "law"
(decidability) real here?** Yes, *under the cut-free + bounded-induction restriction*, and only
there — general inductive theorem proving is undecidable, so the restriction is load-bearing and
must be stated, not hidden. Focusing (§6.2 №2) is what makes the restriction a *finite* search.
Every surviving timeout/`search-bound` is a bug against this contract.

**Tier 2 — COINDUCTION, as the ELEGANT DUAL of Tier 1 (not a footnote; §7.I).** I undersold this.
Coinduction is not a bag of two extra formers bolted on — it is Tier 1's **categorical dual**,
and the whole architecture transposes cleanly:

| Inductive engine | Coinductive dual |
|---|---|
| `case`/split (analytic *elimination*) | copattern/`.field` (analytic *introduction* of the observation) |
| well-founded recursion, **termination** measure | guarded corecursion, **productivity/guardedness** check |
| the induction hypothesis (IH) | the coinduction hypothesis / the bisimulation-up-to |
| finding a generalized IH (a cut) | finding the bisimulation relation (a cut) |

Beluga checks guardedness exactly as it checks totality, so the *analytic* coinductive search
(cosplit on observations, guarded corecursive calls) is decidable by the **same** focusing
machinery with the productivity oracle swapped in for the termination oracle. Its cut (inventing
the bisimulation, Howe's construction) sits in Tier 3 just as the generalized IH does. So Tier 2
is *research-grade elegant*: the interior is free once Tier 1's architecture exists, and it shares
Tier 3's wall. Still gated on the user's demo priorities — but when built, it is a symmetric
completion, not an afterthought.

**Tier 3 — THE CUT, DECOMPOSED (§7.H).** This is where the map was wrong. "Lemma conjecture / IH
generalization" is not one undecidable blob; it is a **spectrum from mechanical to genuinely
creative**, and only the far end is a wall:

- **T3a — generalization (a cut whose middle term is a *variant of the goal*).** Accumulator
  generalization, apart/fusion, "generalize before you induct." **Not a wall** — this is the
  bread and butter of *rippling* (Bundy et al., CLAM/IsaPlanner): annotate the goal's difference
  from the IH as *wave-fronts*, rewrite to move them out, and when rippling *blocks*, the blockage
  **names the generalization needed**. A principled, general mechanism, decades-validated.
- **T3b — auxiliary algebraic/structural lemmas (a small cut over signature operators).**
  Commutativity/associativity/distributivity of `+`/`app`/`◦`, the parallel-reduction (Takahashi)
  lemma behind Church–Rosser, the standard weakening/exchange/substitution lemmas. **Not a wall**
  — this is *theory exploration* (QuickSpec → HipSpec/Hipster/IsaCoSy): bottom-up conjecture the
  small equations/lemmas over the signature, filter by **counterexample testing** (random/generated
  instances checked by the oracle), *prove the survivors with Tier 1*, and promote them to the pool.
  A generate–test–prove loop, principled and bounded per round; it is precisely how modern inductive
  provers clear their lemma frontier. **A meaningful fraction of my "342" is really T3a/T3b — or even
  mis-classified Tier 1 (preservation, progress, determinism are structural). Phase A's re-sweep +
  this decomposition should reclassify them; do not assume 342 are the crown jewel.**
  *(2026-07-19: the reclassification finally ran — §0.5 — and this suspicion UNDERSHOT:
  the mass is not even T3a/T3b; it is Tier-1 COMPOSITION the engine fails to find. The
  corpus can never literally demand a T3b invention — masking leaves the siblings.
  T3a–T3d remain correct for the LARGE-reference tails and for theorems OUTSIDE complete
  developments.)*
- **T3c — logical relations / reducibility (the crown; SN, algorithmic-equality completeness,
  Howe).** The cut here is a **new type-indexed definition** (Tait/Girard's reducibility candidate,
  defined by recursion on the type) *plus* its fundamental theorem. Two honest halves: its
  **exterior** — inventing a *novel* semantic construction for a type system no schema covers — is
  the genuine creative wall, and **no tool does it** (in Beluga/Abella/Twelf these proofs are
  human-guided). But its **interior** — *instantiating a known logical-relations schema* to a type
  system whose connectives the schema covers (STLC, +products/sums, a System-F fragment) — is a
  hard-but-real target, because the reducibility predicate is *type-directed and schematic*, not
  free. The elegant, genuinely-novel contribution BelJar could make is to **formalize the
  logical-relations proof pattern as a first-class, type-directed proof-plan generator** (define
  `Red` by recursion on τ; discharge escape/expansion/closure; prove the fundamental theorem by
  induction on typing). That would be research-grade and, to my knowledge, unautomated. Cave &
  Pientka's Beluga logical-relations methodology is the reference blueprint. **Architectural note:**
  T3c requires synthesizing a new *signature element* (an `inductive`/`LF` declaration), not just a
  proof body — a different synthesis mode than Tier 1, and the masking harness (which masks bodies)
  does not currently even *pose* it. Naming that boundary is part of the work.
- **T3d — the genuinely creative cut** (a bespoke lemma/definition specific to a novel system). The
  real wall. Honest disposition: **decline, and say precisely why** — report the closest analytic
  plan and, if theory exploration or rippling *speculated* a lemma that would unblock it, surface
  that speculation as a conjecture for the human. Never fake it.

### 3.3 The verdict taxonomy — what "decide it unprovable" honestly delivers

"Decide unprovable" is not one thing; the research-grade answer splits it, and each branch is
sound:

1. **COMPLETE** — a certified proof. (Tier 1/2, or a Tier-3 cut we found and Tier-1-verified.)
2. **DISPROVED** — **a counterexample**, found by testing the statement on generated/random
   instances via the oracle (QuickCheck/QuickSpec-style). When it fires it is a *real* disproof,
   the strongest possible "no." Cheap, principled, and reusable as T3b's filter — build it early.
3. **NO-CUT-FREE-PROOF** — the analytic search **exhausted** the finite quotient. A decidable,
   honest "no proof without a new lemma/generalization" — precise and useful, distinct from #2 and
   from a resource bound.
4. **NEEDS-A-CUT (BEYOND-FRAGMENT)** — analytic search is exhausted *and* the theorem tests true
   (no counterexample), so a cut is genuinely required. Report the closest plan + any speculated
   cut. This is the honest face of T3c-exterior/T3d.
5. `search-bound` / `TIMEOUT` — **must be extinct post-§7.E.** Any survivor is a contract bug.

**The one-line definition of done:** *the engine is a sound, complete-for-the-analytic-fragment
decision procedure with a dual coinductive engine, a principled cut-speculation layer (rippling +
theory exploration + type-directed logical-relations schemas) that reaches deep into the corpus's
"hard" tier, a counterexample engine that turns many "unprovable"s into real disproofs, and — at
the one genuine wall (a bespoke semantic cut for a novel system) — an honest, specific decline
with the closest plan and the speculated conjecture. It never times out, and it never lies about
which tier an answer came from.*

**Discipline for the successor (the anti-overclaim law, sharpened for this ambition):** expanding
into T3 does NOT relax the "corpus verifies, never discovers" mandate — it *raises* the bar. Every
T3 mechanism ships with (i) its honest complexity/decidability status stated inline, (ii) a
falsification instrument (a held-out batch of theorems whose cut it should and should NOT find),
and (iii) a hard line between "found and Tier-1-verified" and "speculated for the human." A
T3 result reported without its tier label is a lie by omission.



## 4. The model to mirror — synthesis already IS the north star, in miniature

Before designing anything, study [prover-synth.mjs](js/editor-src/prover/prover-synth.mjs). It is the seed of
everything Phase D builds, and it already embodies the discipline you are extending:

- It does **goal-directed backward chaining** (SLD resolution) over the pattern fragment:
  goal ← rule (constructor / lemma / IH) whose conclusion unifies the goal, recursing on the
  rule's premises as sub-goals.
- It **saturates deterministic information**: unique-constructor inversion of facts and
  rule-products to a bounded fixpoint (D2). Deterministic inversions are *information, not
  speculation* — they belong in a database, not the step stream.
- It **freshens rule schematics** to `¿`-prefixed names before matching, so same-spelled rigid
  checker metas can't capture and derive garbage (invariant 8).
- It reports `depth-bound`, never `no-move`, when a bound (not the move set) was the limiter
  (D8) — the honest-verdict discipline in miniature.
- It **certifies whole closing chains**, not per-step — this is "checks O(proof)" (§6 inv 4)
  already realised *for the closing fragment*. `bigstep_det` closed precisely because of this.

**The lesson:** the architecture you need already exists and works — for closing chains. The
entire Phase D program is *"extend synthesis's plan-based discipline from closing chains to
the FULL move space, splits included."* You are not inventing a proof engine; you are widening
the domain of one that already works. That reframing is the whole strategy, and it is why this
is tractable rather than a research moonshot.

**Focusing, stated once for the record (the theory you are implementing):** a focused sequent
calculus alternates *inversion* phases (deterministic decomposition — here: intro of the whole
binder telescope, unique-constructor inversion, case-split on a subject the goal *demands*) and
*focus* phases (commit to one head — a constructor / lemma / IH — and drive its premises to
completion without interleaving other rules). Focusing is **complete** for the fragment and it
**dramatically shrinks** the search because you never interleave arbitrary rule applications.
Crucially, in a focused system **a split is not a free forward move; it is demanded by a focus
that is blocked on a fact whose refinement would unblock it.** That single property is what
bounds split-nesting by the goal's structure and kills the "unbounded finite universe" hole.



## 5. The generation spec + the audited divergences (ABSORBED from prover-completeness.md)

This is the obligation the enumerators must satisfy, and the fourteen ways they once failed it.
It is *necessary* context for Phase D: plan-driven search still needs every spec-mandated
candidate to exist; focusing changes *when/whether* they are generated, not *what* the complete
set is.

### 5.1 The hole state (what generation may read — TYPES ONLY, never names)

A hole is `⟨Γc; Δ; goal⟩` under theorem `T` with totality measure `μ`:
- **goal** — a computation type: leading binders (`{X:U}` Pi over meta-objects: LF terms,
  **contexts**, **substitutions `$[h ⊢ g]`**, parameters — and implicit `(g:schema)`), then
  boxed premises, then a boxed/ctype conclusion.
- **Γc (comp context)** — fn-bound vars of box/ctype type. Usable as: whole proof terms (bare),
  scrutinees of `case`, arguments to rec/lemma calls (BARE — never inside a box or LF term).
- **Δ (meta context)** — metavariables `X : (Ψ ⊢ A)`, parameters `#p`, context vars,
  substitution vars `$W`. Usable as: LF terms inside boxes, split scrutinees (boxed),
  inversion subjects, arguments rendered `[Ψ ⊢ X…]`.
- **The signature** — LF families/constructors, schemas, sibling complete lemmas, and `T`
  itself as the IH, guarded by μ.

### 5.2 The complete step relation (per move kind) — the set the candidates must contain

For each hole, the union of generated candidates MUST include, up to α-equivalence:

- **intro** — one skeleton introducing the goal's **entire** leading binder telescope: `mlam`
  for every explicit Pi *regardless of sort* (term, context, substitution `$W`, parameter),
  `fn` for every boxed premise. A *partial* telescope is a bug worse than none.
- **split** — `case` on: every Γc var of box type; every Δ metavariable (boxed scrutinee) whose
  family has ≥1 unifying constructor — guarded against re-splitting an already-destructured
  subject (openCasesAt / branch-body checks), with annotated + bare arm variants, parameter arms
  from the schema, **a variable arm per NAMED context entry whose type-family matches the
  scrutinee's AND whose type is independent of the other extension entries**, and `impossible`
  as the 0-arm case.
- **invert / saturate** — for any Γc/Δ hypothesis whose refined type admits a **unique**
  unifying constructor: the destructuring `let`, recursively to a bounded fixpoint. An inversion
  chain is deterministic information, never speculation.
- **fill** — the goal inhabited by: a bare Γc var of exactly the goal type; a Δ entry / parameter
  projection under the right substitution; constructor applications with arguments drawn
  recursively from this same relation.
- **rec / lemma call (incl. tail-call fill)** — `T'` any sibling lemma or the IH. Each premise
  slot draws from ALL of: Δ metavariables (`[Ψ ⊢ X]`), **Γc variables (bare)**, and recursively
  synthesized terms. Pi binders re-instantiate: context Pi → the (block-extended) context;
  substitution Pi → the in-scope `$W`, extended alongside the context; object Pi → the
  unification-determined term. For the IH, the **decreasing slot** (§5.3) must be a
  certified-smaller sub-derivation; **every OTHER slot is unconstrained — passing an original
  premise through unchanged is legitimate and required** (the transitivity shape).
- **synthesis (backward chaining)** — SLD over the above with rules = constructors + lemmas +
  IH; facts = **all** Γc/Δ hypotheses; saturation = unique-constructor inversion of facts and
  rule-products; bounded depth reports `depth-bound`, never `no-move`.

**Ordering/budgets may RANK candidates; they must never make the set empty of a spec-mandated
candidate. Prefilters must be SOUND (reject only what the checker would reject).**

### 5.3 The decreasing slot — named measures

`/ total N /` counts **explicit arguments uniformly — Pi binders AND box premises alike**
(implicit paren groups don't number). Ground truth by native experiment (2026-07-12):
`/ total 1 /` on `copy : {n:[|-nat]} [|-unit] -> [|-nat]` designates the Pi binder `n`; the
named form `/ total n (copy n _) /` also certifies. `/ total x (f a1 … x) /` designates the
**last argument of the application pattern**; its premise index is recovered by aligning the
pattern's spine against the theorem's (context/Pi binders + implicit metavariables — the
distinct free uppercase names — + explicit premises in order). Falling back to "premise 0" is
WRONG for any multi-premise named-measure theorem and silently inverts the IH-slot discipline.
`measureDesignation(thm)` in `prover-comp-type.mjs` is the single source of truth
(`{kind:'box',boxIdx}` | `{kind:'pi',piIdx}`).

### 5.4 The audited divergences (D1–D14) — the fourteen ways the spec was once violated

Every one is FIXED, type-driven (no name literals — `test-prover-no-overfit.mjs` guards this),
and pinned on ≥2 invented shapes. Keep this table: a *regression* shows up here, and the D-row
is the template for how any future gap must be recorded (a general mechanism argued from the
spec, never an instance patch).

| # | Divergence (what the spec clause it violated) | Fix |
|---|---|---|
| D1 | Named measure → decreasing slot defaulted to premise 0 (§5.3) | spine-aligned resolution (`decreasingBoxIndex`) |
| D2 | No unique-ctor inversion of base FACTS (§5.2 invert) | fact-inversion saturation to bounded fixpoint |
| D3 | Γc hypotheses excluded as call args; boxed when admitted (§5.2 rec/lemma) | comp sources admitted, rendered bare; **dual-spelling, checker-arbitrated** (a sub-derivation certifies BOXED, an fn-bound premise BARE, provenance not syntactically recoverable → propose BOTH) |
| D4 | Intro telescope truncated at `$`/`#` binder names; partial skeleton emitted | full name grammar; stall ⇒ null, never partial |
| D5 | Substitution-Pi args unrepresentable in IH/lemma calls | `subst` Pi kind; pass-through + parallel extension + extended result binding; implicit schema some-vars erased; parameter fills under `$W` |
| D6 | Δ metavariables never split (multi-ctor sub-derivations) | boxed-scrutinee splits for general Δ metas (≥2 ctors, re-split guarded), ranked last |
| D7 | Synth facts with shorter-than-goal contexts dropped (no weakening) | strict-prefix contexts admitted, spelled `X[..]` at use sites |
| D8 | Depth/node bounds report `no-move` instead of `bound` | `boundHit` threaded through; STUCK reason is `search-bound` when a bound (not the move set) was the limiter |
| D9 | Greedy premise resolution: first matching fact, no backtracking | **bounded DFS over resolution choices** (found by the D3 pin, not a corpus lemma) |
| D10 | Multi-line hole GOALS parsed as `goal:null` — whole hole state dropped | block-mode accumulation in `parseHoles`; pinned |
| D11 | **WRITABILITY** — the hole report's namespace ≠ the source namespace; the checker INVENTS names for implicit pattern args (via `--name`) that are bound NOWHERE in source, so any reference is rejected "free meta-variable is illegal." The spec-mandated candidate existed but its only spelling was uncertifiable BY CONSTRUCTION. | every synth plan with explicit object-Pi args emitted in TWO spellings — named first, `[Ψ ⊢ _]` second, checker-arbitrated. **RESIDUAL: a plan referencing an invented-name FACT in a premise slot is still unemittable — §7.F.** |
| D12 | **PER-PATH guard scope** — dup-call / inversion-dup / self-chain guards were scoped to `branchBodyBefore` (innermost arm), so every nested split LAUNDERED them | `pathBodyBefore` (ancestor-chain body, closed siblings excluded) scopes those guards; + §6.1 per-path canonicity refute |
| D13 | **Measure-synthesis fork space missed object-Pi positions** (induction on an explicit Pi-bound term `{M:[Ψ⊢A]}`, the refl/exTRel class) | `measureDesignation` single truth; pi positions forked in the named `_`-spine form; mixed pi+box route to `piRecurseTexts`; synth's IH rule withheld for pi measures (decOk is box-keyed) |
| D14 | **Writability instances 3–4: implicit CONTEXT variables** — a type's free ctx vars (`Crel [l] [h]`) are unbound in the body (goal prints `[_]`); mid-proof re-elaboration may RENAME a ctx var away from the source spelling | intro also offered with Beluga's naming idiom (`fn cr => let (cr : Crel [l] [h]) = cr in ?`, ranked first); + when exactly one reported ctx name is source-unbound and one source name is missing, affected candidates gain a source-spelling variant |



## 6. The §6 DECIDABILITY CONTRACT — the spine of Tier 1 (ABSORBED + refined)

The search over the inductive fragment must be a DECISION PROCEDURE: terminate with a proof, or
with NO-PROOF-IN-FRAGMENT. `search-bound` and timeout stay ONLY as safety nets that should never
fire. Four invariants make that true by construction. **These are the acceptance criteria for
Phase D — every design decision is judged against them.**

1. **Finite universe.** Every candidate's pieces are drawn from the subterm closure of the hole
   state + signature, instantiated only by unification — never invented. The reachable state
   space is then finite. *(Honest hole: FALSE for nested splits as stated — §6.2 №1. This is the
   central thing Phase D must fix.)*
2. **State canonicity.** Hole states are memoized up to α/print-normalization; a revisited state
   REFUTES its branch. No loops, only exhaustion. *(Refined in §6.1 — the naive reading is doubly
   wrong.)*
3. **Progress or focus.** Every accepted move must (a) consume structure (split/invert/intro);
   (b) belong to a focus chain bounded by the goal's size (constructor/IH/lemma spines); or (c)
   be SATURATION into a bounded fact database. A move that certifies but neither consumes,
   focuses, nor saturates is **junk BY DEFINITION** — the ceq-closure lemma orbit is the witness.
   The chain cap is a stopgap for (c); the real mechanism is moving speculative lemma results
   **out of the STEP dimension entirely** into in-process saturation.
4. **Checks O(proof).** The checker certifies PLANS (whole chains/subtrees found in-process),
   never per-candidate arbitration. Greedy per-candidate certification is why deep searches cost
   ~1400 round-trips: the count must scale with the proof's size + plan revisions, not with
   candidates × depth. `prover-synth` already embodies this for closing chains; the contract extends
   it to lemma products (saturation) and ultimately the full move space. **This invariant IS the
   timeout cure.**

Exhaustion of the finite space without a proof yields NO-PROOF-IN-FRAGMENT (= **NO-CUT-FREE-PROOF**,
§3.3 — the sharper name, since the "fragment" is precisely the cut-free/analytic one) — a decidable
"no," distinct from any bound.

### 6.1 Invariant 2 refined — PER-PATH canonicity over the junk-free quotient (implemented)

The naive reading ("memoize states, refute revisits") is doubly wrong, and both errors were
measured:
- **Global memoization OVER-refutes.** Sibling case arms are independent obligations that
  legitimately α-repeat (symmetric constructors). Only the ANCESTOR CHAIN — the enclosing split
  points of the current hole — may refute a repeat. Depth-pruned ancestor tracking (DFS focus
  order makes nesting depth a sufficient path key) keeps siblings legal by construction.
- **Literal state identity UNDER-refutes — an α-regress is NOT a literal revisit.** Every move
  ADDS something (junk lets add facts; splits add pattern products), so the raw state multiset
  grows strictly and never repeats. The canonical object must be the state **quotiented by
  regenerable facts**: `junkFreeSig` = shared-α-normalization of the goal + structural
  hypothesis types, EXCLUDING (i) call-result bindings (`let … = f a… in`, ≥2-token RHS) and
  (ii) bare object metas. *Justification:* a call result is derivable again from the structural
  facts by the same call, so two states with equal junk-free signatures have the same derivable
  closure — they ARE the same obligation. A hole strictly deeper than an ancestor with an equal
  junk-free signature re-poses that ancestor's obligation with nothing consumed: refuted.
  Implemented in `proveProgramCore` (`pathAnc` stack + `junkFreeSig`); pinned in
  `test-prover-path-canonicity`. **This is invariant 13 in the memory handbook — the state
  identity IS the junk-free quotient.**

### 6.2 The honest holes in the §6 argument (open, ranked — THIS IS THE PHASE D WORKLIST)

1. **Invariant 1 does NOT hold for nested splits.** A schematic sub-derivation's metas are always
   freshly splittable (`X → c X₁ X₂ → split X₁ → …`): the split-nesting dimension is unbounded, so
   "finite universe" is false as stated. Canonicity (§6.1) refutes only α-repeating descents; a
   strictly-*refining* descent (each arm visibly refines the goal or a fact) can still go
   arbitrarily deep. The honest interim is a per-path split-depth budget reported as
   `search-bound` (never `no-move`). **The PRINCIPLED closure is №2 — this is the whole reason
   Phase D exists.**
2. **PLAN-DRIVEN SPLITTING is the real invariant-4 architecture (THE NORTH STAR).** Splits should
   be DEMANDED by synthesis — a backward-chaining plan blocked on a fact whose refinement would
   unblock it requests exactly that split (the focusing discipline bounds descent by the goal's
   structure). Today splits are enumerated forward and ranked last, which is why a poisoned greedy
   path can wander into them. Moving splits into the plan domain **subsumes the split-depth
   budget** (№1), **realizes checks O(proof)** (inv 4), and **eliminates greedy-path poisoning**
   (№4 — plans are accepted whole). Any proposal that instead adds budgets/ordering per failure
   class is treating symptoms. **This is the architecture north star. §7.D is its execution plan.**
3. **Writability residual (D11).** Premise-slot references to invented-name FACTS are still
   unemittable (no `_` analogue in term positions). Two principled directions, (b) preferred:
   (a) synthesis prefers plans whose referenced facts are all source-writable (writability as a
   plan-search constraint — the writable-name set is computable from the decl text + signature);
   (b) **BY CONSTRUCTION** — the engine controls split emission, so it can BIND the names itself
   (extend arm annotations/patterns until every reported hypothesis the plan may need is
   source-named). (b) removes the dimension entirely and is the direction consistent with
   "productive by construction." **§7.F.**
4. **The greedy loop has NO backtracking over accepted moves.** One accepted junk move can poison
   a path (it merely certifies; acceptance ≠ progress toward THE proof). D11+D12 removed the
   measured poison sources, but the architecture-level cure is again №2: plans are complete
   objects, accepted whole.
5. **Synth mishandles CTYPE types — at THREE seams, not one.** `pushFact` drops ctype hypotheses
   (`R1 : TRel [g ⊢ M'] [h ⊢ R]` invisible), AND ctype *premises* misparse in `mkRule` via
   `decomposeContextual`'s non-top-level turnstile bug, AND the three code paths spell a ctype
   application three inconsistent ways that `matchT` can't reconcile. So the closing composite
   `ExWk/c [h ⊢ app R R5] (TRel-app R1 R6)` cannot be planned even when every piece is in scope
   (measured at exTRel's final hole; same frontier as the reassoc combos and two-schema 0/5). The
   fix is to **unify ctype spelling across the seams** and admit ctype facts in it — NOT a one-line
   `pushFact` relaxation. **Highest-yield NAMED gap; the seams + the discriminator + the
   diagnostic-first recipe are worked out in §7 Phase C.**
6. **Unicode identifiers are a MOSTLY-unhandled SYNTAX DIMENSION** (grounded 2026-07-13; the
   codebase is *partly* migrated, so beware "throughout"). Measured: **~104 ASCII-classed
   identifier regexes** (`[A-Za-z_]`/`[A-Z]`/`[a-z]`) across `hole-split.mjs` (35),
   `prover-orchestrator.mjs` (59), `prover-synth.mjs` (8), `prover-comp-type.mjs` (2) — vs only **~5 already
   `\p{L}`-migrated** (ad hoc, for `⊢`-symbol/infix families). So Greek-named binders (`φ`, `ψ`,
   `$σ` — 20/166 of the no-totality residue alone) stall the intro generator at step 0. **Two
   traps:** (a) `\p{L}` (letter identifiers — the Greek-binder fix) is NOT the same as `\p{S}`
   (math-symbol families like `⇛`, which the 5 existing migrations target) — do not conflate them;
   (b) `hole-report.mjs` (the hole-REPORT parser, i.e. the actual step-0 site where intro reads
   binder names) uses *neither* class — it needs separate inspection, likely `\w`/char-based. The
   fix is ONE shared letter-identifier class (JS `\p{L}` + `u` flag) applied systematically to the
   ~104 ASCII sites + a Greek coverage-matrix row. **Do NOT fix it regex-by-regex on demand —
   silent partial coverage. §7.B.**

### 6.3 Enforcement by construction — gaps found by REASONING, not corpora

Three instruments carry the maintenance obligation that a coverage gap surfaces *mechanically*,
before any blind batch stumbles on it:
1. **The shape-class coverage matrix** (`tests/test-prover-coverage-matrix.mjs`). The reduction:
   generation is *syntax-directed* and the anti-overfit guard enforces *name-independence*, so
   what candidates are generated depends only on the hole state's SHAPE CLASS (measure form ×
   goal binder sorts × hypothesis kinds × schema form × context relation), never names.
   Completeness over the infinite fragment reduces to the finite class table; the matrix asserts
   the §5.2-mandated candidate per class on invented signatures. **Any new syntax dimension (a new
   binder sort, hypothesis kind, schema form) REQUIRES a matrix row in the same change.**
2. **The grammar anchor** (same file): the fragment boundary is pinned to the `Raw_*` former
   vocabulary of `comp_parser.ml`. Upstream adding/removing a former fails the test with a
   re-audit instruction — the spec cannot silently drift from the grammar.
3. **Blind held-out batches** (`tests/heldout-corpus/`, authored by Harpoon-oblivious Sonnet
   subagents — user: no Fable authors) are FALSIFICATION of instruments 1–2, not the discovery
   mechanism. A blind failure means TWO defects: the coverage gap AND the missing matrix row / spec
   clause that should have caught it — both must be fixed, and the postmortem is "why did reasoning
   miss it," not just "make it pass."



## 7. The work — phased, prioritized, ingenuity-first

Ordering principle: **first make measurement honest and unblock the step-0 stalls (cheap, they
hide the real frontier); then land the one highest-yield named mechanism (CTYPE facts); then do
the architectural rewrite (focusing) that closes the §6 holes wholesale; then reap it (checks
O(proof) kills timeouts, writability-by-construction kills the last unemittable class); then
formalise the decidable NO; then, and only then, the honest Tier-3 stretch.** Do not reorder to
chase a scoreline — B and C buy points, but D is the phase that makes the engine a decision
procedure, and everything before it is in service of measuring D honestly.

### Phase A — Measurement health (do this FIRST; you cannot steer blind)

The library 175/823 is a pre-D11–D14 sweep. **Re-sweep it** so every subsequent decision is on
current numbers. The measurement laws (each bought with a burned run — obey them):
- **Archive by RENAME, never truncate.** Cache keys hash the UNMASKED program + `engineGitSha`;
  an uncommitted tree = same sha, so a masker/engine change does NOT self-invalidate. Before a
  re-sweep, `mv results/corpus/library.jsonl` aside, then re-run.
- **Mask IN PLACE** (`maskByName`): keep `rec`, keep pragmas (comment-aware — `/ trust /` must
  survive), body → `?`. NEVER mask with `buildProofProgram` (it rewrites `rec`→`proof` AND drops
  `/ total /` — both fatal).
- **No feedback loop:** held-out files are never edited; harness outcomes never feed authoring.
  Misses stay honest misses.
- **A TIMEOUT is a §6 contract violation to root-cause, not a difficulty.** The measured class:
  per-check re-elaboration × program size (~1.5s/check on 48KB assemblies with 46 sibling recs;
  the *same* theorems complete on a 20KB assembly). The 60s cap is a harness parameter that
  converts cost into TIMEOUT verdicts — it does not create the cost. The real cure is Phase E.
- **One headless browser at a time**; never kill chrome by process name (crashes the user's tabs)
  — filter `--headless` via `Get-CimInstance … CommandLine`. Stream long runs to a log; peek with
  `Get-Content -Tail`. Full library sweep is long — background it.
- Clear the **~8 harness artifacts** while you're here (the "could not parse theorem trans" parse
  edge is the chief one — 5 targets).

Deliverable: a fresh `library.jsonl`, a re-decomposed ledger (§2.2 refreshed), and the priority
queue re-sorted against real post-D14 numbers. **Report flat and gap-first. Do not celebrate a
delta.**

### Phase B — Close the step-0 SYNTAX stalls (unicode identifiers) — ✅ SHIPPED 2026-07-16

The ~20 unicode-ident targets stall the *intro generator at step 0* — they are not hard proofs,
they are hidden ones, and they contaminate every ledger class silently. **Done:** shared
`js/editor-src/ident.mjs` (`\p{L}` / `\p{Lu}` / `\p{Ll}`, `u` flag; **L ≠ S**), mechanical
sweep of the ASCII letter-ident sites in hole-split / bridge / synth / prover; critical gates
`buildIntroSkeleton` + `pushFact` wired to `reIdentDollarHashExact` / `reIdentExact`.
`hole-report.mjs` was already permissive (`[^\s:]+`) — the stall was the engine gates, not the
report parser. Coverage-matrix rows for Greek Pi intro (`Γ`/`$σ`/`φ`) + Greek meta facts.
Leave the five existing `\p{S}` symbol-family sites alone.

### Phase C — CTYPE handling (the highest-yield NAMED mechanism) — ✅ SHIPPED 2026-07-16

Verified Seam 1 garbage (`[TRel [g |- M'] …]` → `{ctx:'TRel [g', concl:"M'] …"}`), then unified
spelling across seams: `hasTopLevelTurnstile` / `isCtypeApplication` / `normalizeCtypeSpelling`
(`[Ψ ⊢ X] → (X)`) in `prover-comp-type.mjs`; `classifyPremise` → `kind:'ctype'`; `mkRule` never wraps
ctype premises; `pushFact` admits bare ctype facts; synth ctor argTypes/results normalized the
same way. Pins in `test-prover-synth` + coverage-matrix ctype row. `\p{S}` sites untouched.

### Phase D — THE FOCUSING REWRITE: plan-driven splitting (the north star, the heart of the doc)

> **STATUS (2026-07-16): Steps 1–5 + D.2 componentOf probe + D.2.1 productive-or-impossible
> SHIPPED (suite green).** Phase D is a
> **demand oracle that ranks/prunes the split candidates the bridge ALREADY emits**
> (`splitTextFor`/`splitTextForBox`), NOT a new `case` emitter — the demand *test* reuses
> `uniqueInversion`'s refinement (`metaTheta`) **plus FO arm `componentOf` facts**; emission stays
> the bridge's job. Stage 2 `fillSplitPlan` splices per-arm synth (with those components) into
> bridge case text. **Still stand-ins / not done:** (a) HO subjects fail-open; (b) full Phase E
> plan-as-search-unit (E.0–E.3 landed; deeper multi-step / prelude trim open). D.2.1 FO
> productive-or-impossible shipped (rigidly-empty refined premises count as settled arms).
> Closes **split-nesting** (§6.2 №1) only; lemma-cut depth stays bounded.

§6.2 №2. This is where the ingenuity lives and where the engine becomes a decision procedure.
**The thesis: move splits (and eventually the whole move space) out of forward enumeration and
into the backward-chaining plan domain.** Concretely:

1. **A plan is a first-class object** — a partial proof term with typed holes, discovered
   in-process by SLD (extend `prover-synth`), carrying the sub-goals it is blocked on. Today synth
   returns closing chains; generalise it to return *partial plans* that may be blocked.
2. **A split is DEMANDED, not enumerated.** When a plan is blocked on a fact `F` whose type has
   ≥2 constructors and whose *refinement* (case analysis) would let some rule fire, the planner
   *requests exactly that split on `F`*. The arms are the constructors that keep the blocked rule
   reachable — no others. This is the focusing discipline: the split is justified by the goal's
   structure, so **descent is bounded by that structure, not by a state counter.** This closes
   §6.2 №1 (finite universe under nested splits) by construction: you cannot split on something no
   plan demands, so the freshly-splittable-meta regress cannot happen.
3. **Plans are accepted WHOLE** (§6.2 №4): the greedy loop never commits a single junk move,
   because there are no single moves to commit — a plan is certified as a unit and either advances
   the proof or is discarded. Backtracking is over *plans*, which is natural and bounded, not over
   *accepted moves*, which is impossible today.
4. **Forward enumeration becomes the FALLBACK, not the driver.** Keep the current
   `candidateMoves` path alive behind the planner (it is your safety net and your differential
   oracle during the rewrite — see the methodology), but the planner leads.

**Where the ingenuity is genuinely required (do not paper over these):**
- **What exactly does "a refinement would unblock the plan" mean, computationally?** You need a
  cheap *demand analysis*: given a blocked resolution step (a rule whose premise `P` won't unify
  any current fact), determine whether case-splitting some fact `F` produces an arm in which `P`
  *does* unify. This is a bounded lookahead — one level of constructor refinement per candidate
  split subject — and it is the crux of the whole phase. Get it right and splits become finite and
  purposeful; get it wrong and you have reinvented forward enumeration with extra steps.
- **The saturation database vs. the plan.** Deterministic information (unique-ctor inversions,
  confluent rule products) belongs in a *saturated fact database* (§6 inv 3c), computed to a
  bounded fixpoint and shared across the plan's sub-goals — NOT re-derived per hole. This is
  "move speculative lemma results out of the STEP dimension." The ceq-closure lemma orbit is the
  witness for why: those junk lemma calls certify but never consume/focus/saturate.
- **Termination argument as a PLAN-SIZE argument.** Once splits are plan-demanded, termination is
  an argument about plan size + plan revisions, not state counts (§6 inv 4). Write that argument
  down as you build — if you cannot state why the planner halts, you have not closed §6.2 №1, you
  have moved it.

**Gate:** the 11 gates + held-out + coverage matrix must stay green throughout; the planner must
be differentially checked against the forward path (any theorem the forward path solves, the
planner must solve — see methodology). Do NOT rip out forward enumeration until the planner
dominates it on the full held-out set.

#### D.1 The blocked-plan return type (grounded in `prover-synth.mjs`) — ✅ SHIPPED
`solve`/`applyRule`/`dfs` used to return `X | null`, throwing away *why* a premise was stuck. They
now return a discriminated result: `{status:'solved', argText, lets, viaComp?, callText?}` |
`{status:'blocked', obligations}` | `{status:'dead'}`. An `Obligation` =
`{premiseText, ruleName, flexRemaining, partialTheta, resolvedSoFar, depth}` — built at the
DFS-exhaustion site (`applyRule`'s inner `dfs`, where `ranked[0]` is the most-ground unresolved
premise). `synthesize`'s **public return is byte-identical** (null/refutation/solved); obligations
surface via the SIDE CHANNELS `opts.onDemand(obligations)` and `globalThis.__demandDebug`. This is
the safe keystone — behavior-preserving, proven by 194/194.

#### D.2 The demand analysis (the crux) — reuse `uniqueInversion`, do NOT rebuild the splitter
Given a blocked obligation `O`, ask: *is there an in-scope subject `F` (family with ≥2 ctors) whose
case-split produces an arm where `O.premiseText` becomes resolvable — by REFINEMENT, not guessing?*
The mechanism: `uniqueInversion` (`prover-synth.mjs:581`) already unifies each ctor pattern against a
subject and returns `metaTheta` (the subject-side meta refinement a case forces). The demand *probe*
= that loop **keeping all hits** (not bailing on the 2nd): for each ctor, `metaTheta` + the arm's
`componentOf` facts. Apply an arm's `metaTheta` to `O.premiseText` and the fact pool (those metas are
`opts.metaVars`, shared with the goal) and ask whether a resolver now exists (shallow, depth-1,
splitting off). **DEMANDED iff productive in ≥1 arm AND every arm is productive-or-impossible** (do
NOT weaken to "some arm" — that clause is the whole difference between focusing and blind splitting).
Restrict candidate subjects to those sharing a meta with `O` — that restriction is what bounds the
demanded set (§6.2 №1). **The probe is a TEST only; it never emits.** Fail-OPEN on HO/block subjects
the first-order probe can't analyse (keep the bridge's split candidate; just skip the ranking).

#### D.3 Emission — REUSE the bridge, do not build `case` text
The bridge already emits correct splits with all the machinery a `uniqueInversion` copy would drop:
`splitTextFor` (`prover-orchestrator.mjs:2263`, annotated+bare comp-hyp splits), `splitTextForBox`
(`:2307`, boxed Δ-meta splits), `invertCandidates`/`paramInvertCandidates` (`:2192/:2205`, schema
block-projection params), the `impossibles` loop (`:2216/:2230`). **Phase D reaches for the
already-emitted candidate** — correlate oracle↔bridge by `mv.scrutinee` (`:2271/:2315`) → subject
type → `armRefinements` → match arms by `ctorName`. Never parse arm text back into refinements.

#### D.4 Two stages — smallest-risk first
**Stage 1 (do first):** greedy loop unchanged; `synthMoves` exposes the blocked obligations
(`opts.onDemand`); `candidateMoves`, after building `splits[]`, runs the demand oracle to **drop
vacuous splits + rank demanded ones ahead of intro/fills**. Probe = `metaTheta` + FO arm
`componentOf` facts; IH decreasing obligations honor `needsDecOk`. **Stage 2 (✅):** `fillSplitPlan`
reuses a demanded bridge split, synthesizes under each arm's `metaTheta` with components in the
pool, emits one candidate into the normal certify loop. Fail-open on HO / zero fills. Forward path
stays as fallback. **D.2.1 ✅** FO productive-or-impossible in `demandSplitVerdict` (rigidly-empty
refined premises settle non-productive arms; still need ≥1 productive). HO/unknown families
fail-open. Phase E check-count + closing plans: see E.0–E.3.

#### D.5 Termination — what D closes, precisely (do NOT overclaim)
Three descent dimensions: **split-nesting** (D CLOSES it — demanded splits are finite because refinements are restricted to metas shared with a blocked obligation, drawn from the finite subterm
closure of goal∪signature; per-path canonicity `pathAnc`/`junkFreeSig` refutes α-repeats); **IH
recursion** (already closed by the well-founded totality measure `decOk`); **lemma-cut composition**
(`MAX_DEPTH`-bounded, NOT eliminated — this is the undecidable cut of §3.1). **"The whole search
terminates" is a FALSE theorem.** Instrument the analytic demanded-set (must stabilize per target)
and lemma-depth (must not rise) — those two are the empirical face of the narrow, true claim.

#### D.6 Migration order (each gated by the native oracle + differential-vs-forward)
1. ✅ **Behavior-preserving return-type refactor** (`solved`/`dead`) — proven nothing moved (194/194).
2. ✅ **Produce `blocked` obligations** + `__demandDebug`/`onDemand` (not acted on; logging only).
3. ✅ **`armRefinements` + demand filter** — pure, unit-test on invented shapes (fail-open case included).
4. ✅ **Stage-1 ranking/prune hook** in `candidateMoves` (reuse `splitTextFor`/`splitTextForBox`).
   - `blockedAcc` collects ALL top-level blocked rules; obligations carry `needsDecOk` for IH
     decreasing premises.
   - Demand probe = `metaTheta` + FO `componentOf` facts; `vacuous` drop safe for unrelated subjects
     and for related subjects with zero productive arms under that probe.
   - Ranks `demanded` ahead of intro/open fills; HO/`open` fail-open.
5. ✅ **Stage-2 demand-spliced plan** (`fillSplitPlan`): bridge split text + per-arm synth under
   `metaTheta` with arm components in the fact pool; emit only when ≥1 arm fills.
6. ✅ **Phase E.0 instrument:** `checkCount` on every `proveProgram` result (= Beluga calls).
7. ✅ **Phase E.1:** closing / hole-free candidates certify alone (`certifyWaveSize`); demand plans
   carry `closingPlan` / `planOpenArms`.
8. ✅ **Phase E.2:** `fillIntroPlan` — intro + residual synth as one closing plan.
9. ✅ **Phase E.3:** invert subsumption by closing synth (drop redundant open inverts).
10. ✅ **Phase E.4:** `fillInvertPlan` — unique invert + residual synth as one closing plan.
11. ✅ **Phase E.5:** `fillInvertChainPlan` — depth≥2 unique-FO invert chain as one plan
    (closing or open); length-1 open stays the bare invert.
12. ✅ **Phase E.6:** thin unused-LF suite-prelude trim in `proveOrchestrationCode`
    (never sibling recs / schemas / pragmas).
12b. ✅ **Phase E.7:** same unused-LF trim on the active-file kept prefix (non-LF seed).
12c. ✅ **Phase E.8:** dominate writableRisk synth beside clean; drop planned open splits.
13. **Phase E proper (rest):** batch checks.

> **⚠️ DIAGNOSTIC FINDING (2026-07-13, from the Step-2 `onDemand` probe — fixed in Stage 1).** Driving
> synth into a block (the `noDec` bigstep shape: IH `deterministic` matches the goal `eq R R'` but its
> decreasing premise `eval M R` has no `decOk` resolver — a split producing the sub-derivation
> unblocks it) surfaced the WRONG obligation: `eq_sym`'s block (goal reversed, a symmetric orbit a
> split can't help), not the IH's decreasing-premise block. Cause: `solve` kept only the FIRST rule
> that blocks (`blockedAcc`), and `eq_sym` is tried before `deterministic`. **Lesson: "first/most-
> ground to block" ≠ "the block a split helps."** Fixed: collect obligations from ALL top-level
> blocked rules; the productivity filter (D.2) selects. Pinned in `test-prover-synth.mjs`.

### Phase E — Checks O(proof): certify PLANS, not candidates (the timeout cure)

§6 inv 4. Directly downstream of D: once the unit of search is a plan, **certify the whole plan in
one checker round-trip**, not each move. This is what collapses the ~94 timeouts — they are not
hard proofs, they are `candidates × depth` round-trips against `~1.5s/check` on big assemblies.
`prover-synth` already certifies closing chains whole; Stage-2 `fillSplitPlan` emits richer single
candidates into the same loop. Secondary levers (prelude/program trimming for certification checks —
dependency-closure only, LF/schema decls, NEVER trim sibling recs which are the lemma pool; batched
checks) are constant-factor and come *after* the O(proof) shape is in place.

**E.0 ✅ Instrument (2026-07-16):** `proveProgram` / `proveProgramCore` return `checkCount` = every
Beluga `oracle` call (not guard/prefilter skips). Measure forks accumulate into the returned total.
Pinned: `res.checkCount ===` spy in `test-prover-trace.mjs`. A timeout that survives the later O(proof)
reshape is a bug to root-cause against this counter — not a difficulty.

**E.1 ✅ Closing certify alone (2026-07-16):** `certifyWaveSize` — hole-free candidates (closing
fills, fully demand-spliced plans with `closingPlan` / `planOpenArms === 0`) take wave=1 so
speculative parallel siblings do not inflate `checkCount`. Open-hole candidates keep the default
wave (wall-time win on rejection scans).

**E.2 ✅ Intro+synth closing plan (2026-07-16):** `fillIntroPlan` splices residual synth under
`fn`/`mlam` binders into the intro skeleton → one hole-free candidate (`closingPlan`). Dominates
open intros when present. Pinned on invented identity / false-residual shapes in
`test-prover-synth.mjs`.

**E.3 ✅ Invert subsumption (2026-07-16):** open `invert` candidates whose hyp is already
destructured by a closing synth stay in the vocabulary (`dominated: true`) but skip certify
(synth saturation owns that let — two checks → one). Coverage matrix still sees `kind:'invert'`.

**E.4 ✅ Invert+synth closing plan (2026-07-16):** `fillInvertPlan` splices residual synth under
a unique FO invert (bridge `let` spelling reused; hyp marked inverted so saturation does not
double-emit). Emits one hole-free `closingPlan`; dominates the open invert for that hyp. Param /
HO / ambiguous fail-closed. Pinned on invented `oft` shapes in `test-prover-synth.mjs`.

**E.5 ✅ Invert chain plan (2026-07-16):** `fillInvertChainPlan` walks a bounded unique-FO invert
chain (≤3, same as synth saturation). Requires depth ≥ 2 (length-1 open stays the bare invert;
E.4 owns length-1 close). Residual synth may close; otherwise emits `lets…\n?` still as one
candidate / one certify. Dominates the root open invert. Pinned: open chain, nested close,
length-1 refusal, ambiguous fail-closed.

**E.6 ✅ Unused-LF prelude trim (2026-07-16):** `proveOrchestrationCode` drops flat `lf` decls
from the suite prelude (`fileStart` prefix) outside the free-name closure of kept file prefix +
target. Keep rule: family head ∈ seed, or ctor result-family ∈ seed; fixpoint adds idents from
kept decls. Always keep schema / inductive / pragma / rec / proof. Never trims sibling recs
(lemma pool). Pinned in `test-prover-bridge.mjs`.

**E.7 ✅ Unused-LF active-file prefix trim (2026-07-17):** same closure trim now runs on the
active-file kept prefix (after holed-sibling strip). Seed is **non-LF decls + target** so unused
LF in the prefix cannot self-justify; prelude trim then seeds from the trimmed prefix + target.
Sibling recs/schemas still always kept. Constant-factor check cost win on fat single-file
signatures. Pinned in `test-prover-bridge.mjs`.

**E.8 ✅ Dominate redundant writableRisk / planned open splits (2026-07-17):**
`withWritableRiskDominated` marks `writableRisk` synths `dominated` when a clean closing synth
exists (F.0 already prefers `_`; this skips the second certify). Open splits whose scrutinee
already has a filled demand plan are dropped from the certify queue (same rule as bare
demandedRest). Vocabulary preserved for coverage. Pinned in `test-prover-bridge.mjs`.
**E.9 ✅ Certify-closure trim (2026-07-18):** `trimForCertify` — certification of ONE candidate
runs against the candidate's dependency closure, not the world. Generation keeps the whole
lemma pool; a rejection scan does not need the 29 sibling recs it never cites. Grounded on the
user-reported pair: `red_rew_impl_fstepcong` (harmony) clunked ~5s/move because EVERY check
re-elaborated 50KB/51 decls/29 sibling recs (E.6/E.7 are LF-only and must keep recs);
`dual_sym` (cp) whizzes because orchestration already strips its holed siblings to 5KB. The
trim takes harmony's per-check program 50.5KB → 3.4KB (~15×), native-validated to certify
clean. Mechanics: defined-name closure over ALL decl kinds (mutual blocks whole; block-form
`LF fam :` bare heads count — the `cong`-unbound near-miss, caught by native validation and
pinned; every unparseable decl KEEPS, P5's law). Arbitration keeps verdicts identical by
construction: trimmed OK → re-run FULL (bookkeeping coordinates); trimmed rejection not
line-attributable to the target decl → re-run FULL (fail-open). **Cost-model gate:**
`opts.certifyTrim === false` disables (native oracle: per-CALL spawn cost, the trim's extra
calls hurt — measured A/B 21 vs 36 checks on `sound`; browser: per-BYTE wasm cost, where the
15–50× byte cut is the win). Browser effect lands with the next bundle; the harmony target is
its validation case. Pinned in `test-prover-bridge.mjs` (closure, mutual, LF-heads, fail-open,
wire-up sizes, opt-out).
**Still open:** true multi-program Beluga batch checks (likely subsumed if E.9's browser
numbers hold).

### Phase F — Writability BY CONSTRUCTION (kill the last unemittable class)

§6.2 №3 / D11 residual. Prefer direction (b): the engine controls split emission, so **it binds
every hypothesis name a plan may reference** — extend arm annotations/patterns until every
reported hypothesis is source-named. This removes the "invented-name fact in a premise slot"
dimension entirely rather than working around it with `_`-spellings. Direction (a) — writability
as a plan-search constraint (prefer plans whose referenced facts are all source-writable, the
writable set computable from decl text + signature) — is the interim if (b) proves too invasive.
Either way: pin on invented shapes; NEVER "fix" a free-meta rejection by renaming.

**F.0 ✅ Writability preference (direction a) (2026-07-16):** `sourceWritableNames` /
`inventedReportNames` / `textReferencesNames`. In `synthMoves`, named spelling that cites
checker-invented hole binders is dropped when the inferred (`_`) spelling is clean; otherwise
underscore ranks first and both are tagged `writableRisk`. Never renames. Pinned in
`test-prover-synth.mjs`.

**F.1 ✅ Annotate unique FO invert (2026-07-16):** `invertCandidates` mirrors split
`armAnnotation` — unique FO invert emits `let [Γ ⊢ pat] : [Γ ⊢ refined] = h in` when index
metas exist (binds them in source). Bridge dual-spells annotated + bare; E.4/E.5
`parseInvertLet` accepts the optional `: [ann]`. Param / HO / no-index stay bare. Pinned in
`test-hole-split.mjs` + `test-prover-synth.mjs`.

**F.2 ✅ FO arm-component name alignment (2026-07-16):** `fillSplitPlan` names synth
components from the bridge arm's FO pattern metavars (not `¿armN`), so closing arm bodies
cite source-bound names. HO / compound pattern args leave `¿arm` unused (fail-closed when a
body would still cite `¿arm` after a successful parse). Annotated and bare patterns both
work. Pinned in `test-prover-synth.mjs`.

**F.3a ✅ Annotation FO binders in fillSplitPlan (2026-07-16):** when an arm's `: [Γ ⊢ …]`
annotation FO binders line up 1:1 with FO components, those binders enter the residual fact
pool (same types, ranked ahead of pattern names) so bodies can cite annotation index names
already bound in source. Absent annotation → pattern names only (no invention). HO/lambda
annotations ignored. Pinned in `test-prover-synth.mjs`.

**F.3b ✅ Annotation FO binders in fillInvertPlan (2026-07-16):** same harvest on unique invert
plans (and the root let of `fillInvertChainPlan`). F.1 already emits the annotation; residual
synth now prefers those source index names. Pinned in `test-prover-synth.mjs`.

**F.4 ✅ Annotation index facts without 1:1 pairing (2026-07-17):** when annotation FO binders
outnumber (or under-count) FO components, still expose them as facts typed by a simple FO
object sort from the ctor's argTypes (`tm`/`nat`/…). Fail-closed when no such sort exists
(overlap zip only). Unlocks index-only metas like `R` in `ev (app M N) R` when args are
themselves object-sorted. Pinned in `test-prover-synth.mjs`.

**F.5 ✅ Family-kind sorts for bare result indices (2026-07-17):** `familyIndexSorts` reads
`LF F : A → B → type` telescopes; bare whole-index annotation binders (`R` in
`ev (app M N) R`) get those sorts even when FO args are *derivation* types (so F.4's
objectSortGuess is empty). Nested metas inside compound indices stay fail-closed.
Wired through `armRefinements` / `fillSplitPlan` / invert plans via `demandFamilyKinds`.
Pinned in `test-prover-synth.mjs`.

**F.6 ✅ Nested index metas from index-head ctor spines (2026-07-17):** FO args of a
compound result index (`M`/`N` in `(app M N)`) are typed from that head's ctor
argTypes when the head is a unique FO ctor in `ctorsMap` with matching arity and
simple sorts. Soft-zip no longer assigns derivation-component types to those nested
names (wrong-by-construction). Pinned in `test-prover-synth.mjs`.

**F.7 ✅ Invented report facts never cited by name (2026-07-17):** hole.meta/ctx binders
absent from the source-writable set are tagged `invented` at fact admission. Synth
skips them for direct fills, premise slots, inversion RHS, saturation tuples, and
refutation — so a plan cannot emit `lemma [ ⊢ X1]` / `impossible [ ⊢ X1]` for a
checker-invented name. Writable twins and constructors remain available; invented-only
→ honest null. Complements F.0 (`_` preference for object-Pi) and F.1–F.6 (bind at
emission). Pinned in `test-prover-synth.mjs`.

**F.8 ✅ FO arms amid HO siblings (2026-07-17):** `armRefinements` skips HO ctors
per-arm instead of aborting the whole family. FO siblings stay refinable so
`fillSplitPlan` can close those arms while HO arms remain `?`. Demand verdict
stays **open** when `partialHo` (incomplete coverage — never pretend HO is
settled). Pinned in `test-prover-synth.mjs`.

**F.9 ✅ Pi-HO components + pattern body names (2026-07-17):** `componentOfArg`
handles Pi-prefixed HO (`{x:T} … → body`) as under-binder facts; bare-arrow HO
still returns null (arm skipped, `partialHo`). `parseArmPatternArgs` extracts
the body name from `(\x. \u. D)` spines so residual synth cites source `D`, not
`¿armN`. Pinned in `test-prover-synth.mjs`. **Not yet:** bare-arrow HO component
typing; true HO invert/demand; Beluga multi-program batch.

### Phase G — The decidable NO + the verdict taxonomy

Formalise Tier-1 done: exhaustion of the finite quotient yields **NO-CUT-FREE-PROOF**, a real
answer distinct from `search-bound`/timeout (which should no longer fire post-E). Serve the
long-standing user request too: a stuck verdict carries a **feasible-only blocking cause**
("likely provable by recursion on argument N — add `/ total N /`"), *derived from which generator
came closest*, never speculation. Partially served already by measure synthesis + verdict
classification; finish it. Emit the full §3.3 taxonomy: **COMPLETE | DISPROVED (counterexample,
Phase I) | NO-CUT-FREE-PROOF (decidable no) | NEEDS-A-CUT/BEYOND-FRAGMENT (closest plan +
speculated cut, Phase H) |** (`search-bound`/`TIMEOUT` extinct). **Every verdict names its tier —
a result without a tier label is a lie by omission.**

**G.0 ✅ Taxonomy labels on every finish (2026-07-16):** `classifyVerdict` + `finish` attaches
`verdict` / `tier` to every `proveProgram` result. Mapped today: COMPLETE (tier 1), DISPROVED
(tier 1), BEYOND-FRAGMENT (coinductive, tier 2), SEARCH-BOUND / STUCK / ILL-TYPED / CANCELLED
(tier null — honest transitional). **Not yet:** NO-CUT-FREE-PROOF (needs exhaustion cert);
NEEDS-A-CUT from Phase H; extinction of SEARCH-BOUND post-E.

**G.1 ✅ Actionable stuck hints (2026-07-16):** `stuckHintFor` / `attachStuckHint` — feasible-only
blocking cause on every stuck finish (`stuck.hint`). Totality → suggest `/ total … /` from
`hypotheticalMeasures` (`measurePragmas`); coinductive → names the family; disproved / search-
and step-bound are honest about what they are; bare `no-move` stays silent unless `closest`
(from always-on tried rows) is present. Pinned in `test-prover-coinductive.mjs`. **Not yet:**
NO-CUT-FREE-PROOF exhaustion certificate.

**G.2 ✅ The termination architecture: rule-descent classification + certified synth exhaustion
(2026-07-17).** The theory pass that grounds the exhaustion certificate — and a RETRACTION: the
earlier "cut-free ⇒ premises are subformulas ⇒ multiset descent" sketch is FALSE (fresh
existential middles — `trans`'s `K`, `ev_app`'s `R U` — are not subterms of the goal; the
subformula property fails *inside the signature*, cut or no cut). The correct decomposition
(Twelf-style structural termination, Rohwedder–Pfenning; tabling/loop-check completeness for the
finite-orbit class; the given `/ total /` measure is already a cyclic-proof progress condition
à la Brotherston–Simpson, machine-checked via `decOk`):

- **`classifyRuleDescent`** (`prover-synth.mjs`, pure, name-free, `// GENERAL:`-tagged): partitions
  rules into **descending** (every premise arg ⊑ a conclusion arg, ≥1 strict — recursion is
  well-founded by goal structure), **orbit** (no rigid growth around schematics; fresh bare
  existentials allowed — reachable goals stay in the finite subterm closure of goal∪facts, so
  path-check + memo exhaust a finite orbit), **growing** (a premise wraps a schematic in rigid
  structure absent from the conclusion — `p X ← q (s X)`: the one genuinely non-terminating
  backward dimension; Horn logic is Turing-complete through exactly this).
- **The growing gate:** growing rules resolve premises from FACTS only (dfs case (b) skips
  recursion). Correct, not a compromise — grown derivations (multi-step evaluations) come from
  destructured hypotheses via demanded splits, never from synthesizing computation.
- **Tripwire honesty:** `choiceBudget` exhaustion and ALL saturation truncations
  (`MAX_PRODUCTS` product cap, tuple-state cap, the 3-round inversion fixpoint) now set
  `stats.boundHit` — previously silent bounds reported as honest "dead" (a D8 violation).
- **Cyc-safe memoization:** a failure reached through a path-cut is path-DEPENDENT; memoizing it
  leaked incompleteness (the failure exported to paths where the cut ancestor is absent).
  `cyc`-tainted failures are never memoized, only re-explored — the tabling-soundness condition
  the exhaustion certificate needs.
- **`stats.exhausted`** (the certificate seed): null with NO bound hit = the synth fragment was
  genuinely exhausted. Threaded as `synthExhausted` through `synthMoves` → `candidateMoves`.
  **Both follow-ons landed same day:** the depth decrement is retired (G.2b below) and the
  bridge-level account is G.3.

Pinned in `test-prover-synth.mjs`: five classifier shapes, the counter-machine terminating with
certified exhaustion (pre-gate: depth spiral → searchBounded), fact-resolved growth steps still
closing, and a 3-link fresh-middle chain still closing through orbit recursion (completeness
under the gate).

**G.2b ❌→G.2c ✅ Depth: naive retirement was WRONG; ITERATIVE DEEPENING replaces it
(2026-07-17, same day — falsified by the re-sweep within hours).** The first cut ("no
decrement, path+memo terminate") was sound for termination but destroyed
completeness-within-node-budget: depth-free DFS burns `MAX_NODES` on deep failing branches and
LOSES shallow solutions the old depth-5 pass found (measured: COMPLETE→search-bound flips,
tapl `sound` among them). **G.2c:** the root runs IDDFS — level d is a complete depth-d
search (shallowest proof first, the behavior the corpus had validated); per-level flags
separate a DEPTH cut (normal frontier behavior — go deeper) from NODE/CHOICE cuts (runtime
tripwires — honest bound); a level that completes with ZERO cuts of any kind has explored the
entire finite space, so the loop halts with a true exhaustion certificate and needs no
ceiling. `failMemo` persists across levels (keys are remaining-depth § goal —
start-level-independent), a sound transposition table. Callers passing `maxDepth` get a probe
ceiling (plan fillers); `synthMoves` runs uncapped. The 7-link-chain differential pin holds
(found at level 6, beyond the old wall).

**G.3 ✅ The theorem-level NO-CUT-FREE-PROOF certificate (2026-07-17).** `classifyVerdict` now
emits **NO-CUT-FREE-PROOF (tier 1)** — the §3.3 decidable NO — when a `no-move` stuck carries
`stuck.noCutFree`, computed at the stuck finish from five conditions, ALL of which must hold
(any taint ⇒ plain no-move; conservative by construction):
1. **Invertible steps:** every accepted step was provability-PRESERVING — intro (the goal's own
   telescope), split (coverage-total case analysis, an invertible left rule), invert
   (deterministic), recurse/lemma lets (weakening — they only add hypotheses), hole-free closers
   (terminal). The ONE non-invertible accepted kind is an **open fill** (commits constructor
   structure with residual holes) — `unsafeAccepted` vetoes for the rest of the run. This is
   why hole-level exhaustion lifts to the THEOREM level: the accepted prefix preserves
   equiprovability, so the theorem is provable iff the stuck hole is.
2. **Synth exhaustion** at the stuck hole (`synthExhausted`, G.2 — no tripwire fired).
3. **No budget-class guard skip** at the stuck hole (`budgetSkips`: the lemma chain cap + the
   speculative-let budget — budgets, never soundness arguments; the sound guards — path
   canonicity, dup/self-chain, prefilter, seen-state — do NOT taint, each carries its own
   soundness argument).
4. **No silent candidate drop**: `spliceFails` (a generated candidate that couldn't be spliced),
   `dominatedSkips` (domination is sound for search but unproven for certification — if the
   dominator is rejected, the dominated was never tried), and `moves.splitDrops` (vacuous-
   verdict and planned-scrut split drops — the demand probe is depth-1, not a proof that the
   case analysis is useless) must all be zero.
5. **Clean baseline** (`baseErrors === 0`).
The verdict is relative to the oracle's verdicts (Beluga is the arbiter) and to §5.2
completeness of generation (carried by the coverage matrix, §6.3). `stuckHintFor` names the
consequence: "a lemma or generalized induction hypothesis (a cut) is required." Pinned in
`test-prover-coinductive.mjs` (positive: intro→exhausted hole→certificate+tier 1; negative:
unexhausted no-move stays STUCK/null; pure hint).
**Honest residue:** budget-class guards still EXIST — where they fire, the verdict honestly
degrades to STUCK; extinguishing them (plan-driven search subsuming the spec budget) widens
the certificate's reach. TIMEOUT extinction is still Phase E's (batch checks) — unchanged.

**G.3b ✅ Domination deferral — now TOTAL (2026-07-17):** `deferDominated` — EVERY dominated
move sorts to the certify queue's TAIL, never skipped, and NOTHING is ever dropped: E.3/E.8
inverts/synths, planned-scrutinee splits, **vacuous-probe splits** (the former drop violated
§5.2's "rank, never empty" — the coverage matrix caught it the moment obligations reached its
shapes), and **open intros under a closing intro plan** (the former `introsRest = []` emptying
is how eq_sym was lost: plan rejected for a bad self-call, bare `fn d => ?` never tried).
Success path pays nothing (a live move accepts first — the E-series check savings intact);
at a failing hole everything is genuinely tried. Removes ALL domination/drop taints from the
certificate — its conditions are now: synth exhausted, no open-fill accepted, no budget skip,
no splice fail, clean baseline. Pinned in `test-prover-bridge.mjs`.

### THE 2026-07-17 RE-SWEEP POSTMORTEM — first corpus contact for E.2–F.9 + G.2–G.3

The fresh sweep (883 targets, all-engine-first-contact for eight days of machinery) came back
**143/823 vs the archived 183/823 — a 49-COMPLETE regression**, and per the law it was treated
as bugs to root-cause, not a score. Six mechanisms, all fixed same-day, each pinned on
invented shapes:

| # | Mechanism (class it caused) | Fix |
|---|---|---|
| P1 | **E.2 `fillIntroPlan` marked intro-bound premises `decOk:true`** — the IH consumed its own raw premise (`fn e => eq_sym e`), Beluga rejected the self-call (COMPLETE→no-move, eq_sym) | intro-bound facts are NEVER decOk (the raw derivation, not a split's sub-derivation) |
| P2 | **`introsRest` EMPTIED under a closing intro plan** — plan rejected ⇒ bare intro never tried (amplified P1) | defer, never empty (G.3b total) |
| P3 | **naive depth-free DFS** burned nodes on deep failing branches (COMPLETE→search-bound) | G.2c iterative deepening |
| P4 | **CE `matchOne` parseAppType-based** — INFIX ctor results (`A ⊗ B`) unmatchable ⇒ inhabited conclusion "rigidly empty" ⇒ **certified FALSE DISPROVED on dual_sym** (an accuracy breach); + HO ctors skipped in the emptiness scan | token-alignment matching; HO results tested; every uncertainty fails OPEN (I.5/I.5b pins) |
| P5 | **E.6/E.7 trim dropped unparseable decls** — symbol-char ctor names (`is_@`) + `%`-comments inside multi-line decls broke the narrow parsers ⇒ load-bearing typing rules vanished ⇒ whole assemblies ill-typed (file-errors 1→27, program-clustered) | permissive real-lexer token class, comment stripping, and the FAIL-OPEN LAW: a trim is an optimization — unparseable ⇒ KEEP |
| P6 | **demand probe vacuous-dropped essential splits** (tapl `sound`, `neutral_doesnt_step`): (a) implicit uppercase metas treated RIGID when cD is empty ⇒ m_ref-style arms lost; (b) one-directional matchT vs schematic arm components ⇒ nothing "productive"; (c) fully-schematic obligations (IH under an `empty` goal) share no textual meta ⇒ "unrelated" | (a) probe-only implicit-meta widening; (b) symmetric unification in `premiseResolvableAfter`; (c) family-head relatedness for ¿-schematic obligations — plus the vacuous verdict now DEFERS, never drops |

Two more surfaced by the post-fix differential (46/49 recovered under the final engine):

| # | Mechanism | Fix |
|---|---|---|
| P7 | **Implicit-ctx writability (ctxToEnv, D14 family):** a goal context that is a bare implicitly-quantified variable is unwritable in the body — `[h ⊢ nil]` rejects "free context variable is illegal" while the INFERRED `[_ ⊢ nil]` certifies (ground-truthed against native main.exe; a broken first experiment — wrong exe path swallowed by `\|\| true` — briefly said all spellings pass: verify the instrument before the claim) | fills citing such a context gain an additive `[_ ⊢ …]` variant, checker-arbitrated |
| P8 | **Top-level ordering contradicted the engine's own law** ("a certified complete chain is never worse than a speculative refinement"): splits ranked before closing fills/synths, historically masked by the over-aggressive vacuous drops — once P6 fixed those, todbruijn spiralled 8 splits deep instead of accepting the one closing synth | closers (closing fills + closing synths) rank before open splits at top level too — ranking, never dropping |
| P9 | **(Found by the P7 pin, not the corpus.)** A COMPLETING candidate's empty hole-fingerprint collides with a no-hole-report baseline and the seen-state guard refuted it as a "revisit" — inert under hole-reporting oracles, real under stub/edge baselines | the revisit refute never fires on an empty next-hole set (completing is progress by definition) |
| P10 | **`sourceWritableNames` excluded the hole's OWN line** — binders bound there (`mlam g' => fn f => ?`, arm patterns sharing the `=>` line) were tagged INVENTED, and F.7 forbade synth from citing the theorem's own premises; synth fell through to garbage ctor fills (todbruijn's `[g' ⊢ one]` instead of the certifiable `hoas2db [g'] f`; found by field-diffing live-vs-replayed synth inputs after three wrong hypotheses) | the writable scan includes the hole's line up to the hole's column |
| P11 | **matchT/unifyT infinite recursion**: a token like `(a)(b)` starts with `(` but is not one balanced group — stripParens returns it UNCHANGED and the paren branch re-entered with identical arguments until stack overflow (the `wk` heldout FAIL, E.9 sweep) | recurse only when stripping progressed; unstrippable tokens fall to literal comparison |
| P12 | **Vacuous-deferral ACCEPTANCE re-opened the split spiral (measured by the E.9 sweep):** a deferred vacuous split usually CERTIFIES, the greedy loop accepted it at failing holes, and eval_det/sound burned 500+ checks into TIMEOUT (tps, lemma_val_1 lost). Vacuous descent is the unbounded §6.2 №1 dimension outside the demand discipline — acceptance is the poison, not certification cost | vacuous splits are VOCABULARY-ONLY: in the moves list (§5.2 + matrix), `skipCertify`, never accepted, counted as the certificate's split taint — the settled position after the corpus falsified both extremes |

**The meta-lessons (laws, not incidents):** (1) node-suite pins that pass with `rules: []` are
not contact — every plan-filler pin needs an IH-present shape; (2) a trim/probe that cannot
parse must KEEP/KEEP-OPEN, never drop; (3) §5.2's "rank, never empty" applies to every
domination, and deferral is its uniform implementation; (4) the 57 no-totality→no-move flips
are STUCK-label drift (verified: no capability change on probed instances) — a classification
lead (`coinductive-out-of-fragment` under-fires on some coinductive goals), not a loss. The
07-17 ledger measured a buggy engine and is ARCHIVED AS INVALID; the post-fix re-sweep is the
ledger of record.

### §6.2 №4a ✅ SCOPED CHRONOLOGICAL BACKTRACKING (2026-07-18)

The greedy loop's "one accepted junk move poisons the run" is closed at the chronological
level: every acceptance pushes a DECISION (pre-state snapshot incl. its loop-top result — a
backtrack is zero-check); a no-move dead end pops to the nearest decision and tries the NEXT
candidate (accepted text joins a per-code-state skip set; rejections are cached per
(state, text) so re-scans never re-pay). Termination by the existing step cap (every visit
ticks it — honest step-bound on tree exhaustion). **G.3 is now a TREE-level certificate:**
NO-CUT-FREE-PROOF fires only at the final empty-stack stuck when every FRESH dead end (a hole
with no backtrack-skips = a real leaf) was per-hole certifiable — because unique_eval
FALSIFIED the per-hole shortcut (a certificate-shaped dead end on a provable theorem ⇒ an
open **coverage-matrix gap at its state class — the named hunt**). Pinned (recovery via the
buried alternative; the abandoned step absent from the final list; G.3 tree-cert). Measured:
winners stable (46/49 differential, eq_sym/todbruijn byte-similar); tps/eval_add_comm
converted from false no-move to honest step-bound (the tree is bigger than 60 steps);
eval_det/sound unchanged (step-bound wanderers — inv-3 progress discipline territory, not
backtracking's).

**Open leads:** `tps` / `unique_eval` — accepted-move path sensitivity, NOT candidate burial. Measured precisely for
unique_eval: the paths agree through `intro, split`, then 07-15 accepted a SINGLE invert
(→ recurse, recurse, fill, invert, fill — COMPLETE) while today's E.5 invert-CHAIN eagerly
destructures one level deeper, and the continuation from that (equiprovable!) state never
certifies — stuck 2 moves later. **Correction to an earlier note: multi-chain emission would
NOT recover these** — the fork is an accepted invert-chain vs single-invert choice, not a
synth-chain choice. The only honest cure is §6.2 №4: backtracking over accepted moves / plans
accepted whole. Until then these two are the measured price of the greedy architecture; do
not chase them with ordering tweaks or by weakening E.5.

### THE 2026-07-18 SECOND PASS — the named hunt RESOLVED (P13–P15 + the ⊥-elim demand)

The unique_eval "certificate-shaped dead end on a provable theorem" was root-caused the
D11 way (per-hole trace of what the engine GENERATED). It was never ONE gap; four
mechanisms, each general, each pinned on invented shapes:

| # | Mechanism | Fix |
|---|---|---|
| P13 | **¿-remnant FALSE-UNIQUE inversion.** `uniqueFoInversion`/`uniqueInversion` judge uniqueness by unifying each ctor against the subject's type — but a DERIVED subject (an E.5 chain link, a saturation product) can carry an unresolved `¿`-existential, which is neither ctor-flex nor a hole meta, so `unifyT` treats it RIGID and falsely excludes nonlinear ctors (`eval E1 ¿V2` claimed ev_app-unique because ev_lam's `lam ¿E` vs rigid `¿V2` failed). The "inversion" then silently REFINED the branch-universal `E1 := app …` — a commitment dressed as information. Beluga certifies it WITH HOLES, but the branch is poisoned: the corrected earlier claim is that the post-chain state is NOT equiprovable — no continuation ever certifies, and the destructured hyp also vanishes from the report namespace (its premise-slot spelling is lost). | multi-ctor family + `¿`-remnant in the subject ⇒ REFUSE uniqueness (fail-closed; deterministic information, never speculation). Single-ctor families stay invertible (unique under every instantiation). Pinned in `test-prover-synth.mjs` (r_mk/r_wr shape + single-ctor guard) |
| P14 | **A search-bound leaf ABORTED the run with live alternatives on the decision stack** — §4a backtracking fired only on `no-move`, so unique_eval died at a bounded leaf with the winning single-invert sibling still buried. | search-bound dead ends backtrack too (the bound truncated the PATH, not the tree); `boundedLeafSeen` taints the run — a final no-move upgrades to an honest `search-bound` and the NO-CUT-FREE-PROOF certificate never fires on a bounded tree. Pinned in `test-prover-bridge.mjs` (real MAX_PRODUCTS trip, both scenarios) |
| P15 | **`decSubderivNames` scanned the WHOLE program prefix for `fn` binders** — sibling recs' binders shift `fnNames[decIdx]` onto an unrelated name in any multi-decl assembly, silently stripping decOk from every split component. Measured on natval_dont_step: X lost decOk, synth's blocked obligation surfaced on the WRONG premise (`nat_value (succ N)` decOk instead of `step N ¿m'`), and the demand probe judged the essential split vacuous. | the binder scan starts at the DECLARATION under proof (`rec|proof|and`). |
| — | **⊥-ELIMINATION DEMAND** (`armRefutesAFact` + `demandSplitVerdict`): an arm whose refinement makes an in-scope FACT rigidly empty DISCHARGES its branch — self-justifying progress (the empty left rule is invertible in a focused calculus), independent of any obligation. P12's settled position had no such clause, so refutation splits (goal `absurd`, only obligation the undischargeable IH decreasing premise) scored zero-productive → vacuous → vocabulary-only → unprovable. | every-arm-refutes ⇒ demanded; in the obligation loop refuting arms count as SETTLED ONLY (counting them productive re-opened the P12 spiral — measured same day on natval and reverted). May-inhabitation semantics (unrefined metas flexible), HO ⇒ fail-open; the checker still arbitrates the `impossible` arms. |
| P17 | **(2026-07-19) Rigid-clash NULLARY ctor arms elaborate as catch-all VARIABLE patterns.** The split emitter's doctrine "the checker narrows by rejecting ill-typed arms" is FALSE for nullary ctors: an arm `\| [ \|- s_pred_zero] => ?` against scrutinee `step (succ N) M'` is NOT rejected — Beluga elaborates the bare identifier as a fresh variable binder (`s_pred_zero : ( \|- step (succ N) "i)` appeared in Δ), a certifying catch-all arm that re-poses the ENTIRE pre-split obligation. Inv-3 junk by construction and the backtracker's wander fuel: natval_dont_step burned 200 steps / 2913 checks on it. | `splitTextForBox` drops a nullary ctor arm whose result indices DEFINITELY rigid-clash the scrutinee's (both heads DECLARED ctors, positionally aligned, differing). Sound: Beluga's own coverage never demands a definitely-unreachable arm. FAIL-OPEN everywhere else (metas, params, `"`-names, index-count misalignment keep the arm; non-nullary clash arms still go through checker pruning). natval_dont_step → COMPLETE, 4 accepts, ZERO backtracks, 29 checks. Pinned in `test-prover-bridge.mjs` (rigid-clash dropped + flexible-index fail-open). |
| — | **(2026-07-19) Live-progress dead-air fix (user report):** two spans emitted no pulses — (a) the slow whole-program check + candidate generation before the first accepted step showed a bare frozen `Checking…`; (b) measure-synthesis forks ran ENTIRE silent sub-searches between the last greyed candidate and "failed search" (`onPulse` was muted along with the trace callbacks, though only step/trace callbacks are covered by the mirror pin). | `runOracle` pulses carry the call count; counterexample probe + per-step candidate generation announce themselves; forks announce `No totality measure — trying synthesized / total … / (k/n)` and forward INNER pulses with a `pragma ·` prefix (step/trace callbacks stay suppressed — the test-prover-trace mirror pin is untouched). The status line is a UI CONTRACT now: any engine span that can exceed ~1s must pulse. |
| P16 | **Schema scanners were not comment-aware** — `schemaSomeVars`/`someInstVariants` regex raw code, so a COMMENTED-OUT alternative declaration (`% schema w = some [x:exp] eq x x;` above the live block schema, eq-proof-tuple) was scanned as real; `eraseSomeVars` then rewrote the live block's OWN field references to `eq _ _` and every block-extension IH call died "Expression is not closed" (eqfun's lam arm). | scan `stripLfComments(code)` — the P5 fail-open law applies to scanners as much as trims. eqfun COMPLETE again (8 steps incl. the tuple-substitution fill `eq_lam (\x. \d. R[.., <x;d>])`). Pinned in `test-prover-bridge.mjs` (`schemaSomeVars` exported; commented-out vs live some-schema). |

**Measured after the five fixes:** unique_eval **COMPLETE** (the reference path: single
invert, recurse ×2, tail fill — the §4a open lead is closed for it); values_dont_step
**COMPLETE** (9 checks, cheaper than the ledger row); eqfun **COMPLETE** (P16);
197/197 tests. Differential vs `library.jsonl`: after P13–P15+⊥-elim 190/192; post-P16
191/192; **post-P17 (2026-07-19) MEASURED: 192/192 — CLEAN, zero losses** — natval_dont_step
recovered by P17 (COMPLETE, 4 accepts, 0 backtracks, 29 checks). unique_eval is a NET GAIN
on top (STUCK in the ref ledger). Editor bundle rebuilt, sw.js cache
`beluga-runtime-20260719a-pulse-p17` (hard-reload needed).
### THE 2026-07-19 THIRD PASS — inv-3 as mechanism (zero-progress budget, split-depth budget, inversion-first order)

The batch-09 heldout `eval_det` RUNAWAY (80 accepts / 0 backtracks / 2967 checks of junk
`let [ |- refl] = add_det [ |- X] [ |- X] in`) drove three mechanisms, each falsified into
final shape the same day:

1. **ZERO-PROGRESS BUDGET (inv-3 as code).** A certified move whose own successor hole has
   the SAME junk-free signature (raw-vs-raw, `keepBareMetas` — a bare-sort component is the
   move's yield at this compare; the loop-top hole is theorem-enriched so an enriched-vs-raw
   compare never fires) re-poses the identical obligation. First shipped as a HARD refusal —
   and the corpus falsified the quotient's "call results are regenerable in-process"
   premise: today's synth does NOT regenerate eqfun's recurse-let chains (COMPLETE → lost,
   measured). Final shape (TWICE corrected by the corpus): an ANCESTOR-PATH budget
   (`ZP_BUDGET = 4`) — the interim chronological counter summed SIBLING arms' legitimate
   lets into a false overflow (mstep_leq_2, whose winning 20-step proof spends 2 lemma-lets
   per arm, was lost); the count is now DERIVED, not kept: accepted no-op steps carry
   `zp: true`, and the check counts flagged steps whose text is on the current hole's
   `pathBodyBefore` (closed siblings excluded; `steps.pop()` on backtrack un-counts for
   free). The runaway's junk piles on ONE nested path → still capped. Budget-class guard:
   taints the certificate, never cached.
2. **SPLIT-DEPTH BUDGET (§6.2 №1's sanctioned interim, finally implemented).** The
   strictly-refining demanded descent (split → synth-closes-an-arm → split one level deeper,
   every level obligation-productive, none α-repeating) is bounded by nothing else. Deeper-
   than-budget (6) splits are budget skips; the dead end reports `search-bound` (D8) and P14
   backtracking recovers shallower paths. TRAP FIXED SAME DAY: `openCasesAt` counts sibling
   recs' unparenthesized top-level cases (they never close) — valid for RELATIVE depth
   compares, poison for an absolute threshold; the budget counts from the DECL start
   (`openCasesAt(code, hole, declStartOffset(…))`) or every hole in a fat assembly is born
   over-budget (values/natval died at 8 checks).
3. **INVERSION-FIRST ORDERING (focusing).** `demandedRest`/`planMoves` ranked before
   `invertsMarked`, so a demand-promoted one-arm split of `f` outranked the UNIQUE INVERT of
   `f` — same content, strictly higher cost — and unique_eval wandered into nested splits
   (43 accepts / 37 backtracks / 3555 checks). The non-branching deterministic inversion is
   the inversion PHASE and ranks before every branching split, demanded or planned. Ranking
   only; vocabulary intact.

**Measured after the pass:** unique_eval COMPLETE 8 accepts / 0 backtracks / 141 checks
(was 883 with wander); eqfun 38, natval 29, values 9, mstep_leq_2 164 checks (was 210,
20 steps → 17) — all zero-backtrack; `eval_det` honest step-bound with bounded churn
(49 accepts / 31 backtracks — no runaway; its true cure remains plans-accepted-whole).
**197/197 tests; differential 192/192 CLEAN (ledger of record fully reproduced +
unique_eval on top).** Bundle rebuilt; sw.js cache `beluga-runtime-20260719b-inv3`.
**Pin lesson:** three stub-oracle pins fabricated worlds where a no-op let is load-bearing
while its regenerable form is rejected — inconsistent with any real checker by the
quotient's own argument; pins for progress-discipline mechanisms must use candidates that
genuinely progress (indexed components, not nullary/no-refinement shapes).

**Stale-ledger warning (measurement law, re-learned):** the three differential "losses"
first blamed on these fixes (values_dont_step, natval_dont_step, eqfun) were PRE-EXISTING —
their `library.jsonl` rows were measured in the E.9 sweep BEFORE P12 landed the same
morning, and neutralized-guard replay showed the losses with the new code disabled. An
uncommitted tree means `engineGitSha` cannot distinguish same-day engines; treat same-day
ledger rows as suspect after any settled-position change. Residue: natval_dont_step now
finds the winning shape (demand plan splices the IH into the e_succ arm) but step-bounds on
wander (inv-3 territory); eqfun's lam-arm continuation is a separate open lead.

**Label-drift lead RESOLVED (no action):** OSim in howes-method is declared `inductive` —
the classifier is right, and the 07-15 `no-totality-measure` labels were the misfire. Those
proofs need `fun`-copattern / mlam-inside-ctor-argument construction; if a name is ever
wanted for that class it is a NEW verdict ("HO comp-argument construction out of scope"),
not a classifier fix.
### THE 2026-07-19 FOURTH PASS — the INVERSION-UNLOCK demand (held-out falsification pays off)

The fresh held-out sweep (first contact for ⊥-elim + P13–P17 + the third pass) measured
21/39 with `wk` recovered (P11) and two losses vs the same-day-suspect E.9 rows —
root-caused natively, ONE general mechanism:

- **INVERSION-UNLOCK probe** (`armUnlocksInversion`, the deterministic sibling of ⊥-elim):
  an arm whose refinement makes a SIBLING fact NEWLY uniquely-invertible has unlocked
  deterministic information — exactly what the split "demands" in the determinism shape
  (`prd_det`: `e : prd N R2` is 2-ctor ambiguous; arm `prd_z` refines `N:=z` and
  `prd z R2` inverts uniquely, whose inversion refines R2 and closes the goal — nullary
  ctors, so there are NO components and no obligation ever resolves in an arm; the split
  was vacuous by every earlier clause). Two traps found by its own negative controls:
  (a) the SUBJECT trivially "unlocks" under its own refinement — skipped (that is the
  split itself); (b) per-fact meta widening (P6a) and PROBE-MODE ¿-remnants
  (`uniqueFoInversion(…, { probeRemnants: true })` — P13's refusal stays for EMISSION,
  the may-semantics probe treats remnants as flexible; over-unification only under-claims
  uniqueness there). **Final rank semantics (corrected by the held-out re-sweep):
  every-arm-refutes ⇒ DEMANDED (⊥-elim is decisive, every branch ends);
  every-arm-refutes-or-unlocks ⇒ OPEN — RESCUED from vacuous (certifiable at normal
  split rank) but never promoted, because unlock-promotion outranked times_det's
  winning 9-step lemma path (COMPLETE→TIMEOUT/step-bound, caught within the hour);
  prd_det/ev_add_ev complete fine from the tail since nothing else certifies at their
  holes. In the obligation loop unlocking arms are SETTLED-ONLY and PRODUCTIVITY IS
  TESTED FIRST (the P12 gate stands).** Pinned (rescued-to-open positive +
  stays-vacuous negative) in `test-prover-synth.mjs`.
- **A redundancy caught and REMOVED instead of shipped:** a `subjDecOk` mechanism
  (stamp decOk on the decreasing binder's split components) was built before measuring
  that `armRefinements`' components already default `decOk: true` — the demand probe was
  never decOk-blind, and prd_det/ev_add_ev both recover on the unlock probe alone. The
  probe's decOk default is theory-loose for non-decreasing subjects (ranking-only;
  emission's decNames still enforces invariant 9) — noted, left as-is.

**One more shadowing trap, caught by the differential (the discipline pays):** the
settled-classes were first tested BEFORE productivity in the obligation loop, so an arm
that was BOTH unlocking and obligation-productive counted settled-only — productive fell
to zero and the transitivity family's essential splits went vacuous (trans/transtp/transG
lost, 189/192). PRODUCTIVITY FIRST — it is the stronger claim and opens the demanded gate.

**Measured:** prd_det COMPLETE 16 checks, ev_add_ev COMPLETE 10 checks, trans 117,
times_det 72 (all zero-backtrack); unique_eval holds at 141. 197/197 tests; differential
192/192 CLEAN. **Held-out re-sweep (browser, 2026-07-19): 23/39** — up from 21 (this
morning's engine) and 22 (E.9); residue 5 TIMEOUT / 9 no-move / 2 step-bound, with
eval_add_comm drifting STUCK→TIMEOUT (wanderer-cost class). The historic 25/39 (07-12)
was measured under the pre-P12 engine whose vacuous-acceptance behavior was later
condemned — not comparable. Bundle `beluga-runtime-20260719d-unlock2`; the post-unlock
library re-sweep is the ledger of record going forward.

### THE GRIND NOTES (2026-07-19) — what Lean's `grind` teaches this engine, and what it doesn't

Read once when planning any Phase D/E successor work. Lean's `grind` (SMT-style tactic:
shared congruence-closed fact "whiteboard", cooperating engines, E-matching, guided case
analysis, certificate-producing theory satellites) independently validates three choices
this engine already made — certify everything (its proof terms ≈ our oracle arbitration),
split only on demand (its guided case analysis ≈ D.2), and name what you are NOT for
(its bv_decide boundary ≈ our tier taxonomy). Three transferable lessons, ranked by fit:

1. **E.10 candidate — TRIGGER-INDEXED LEMMA INSTANTIATION (E-matching).** Saturation
   currently enumerates lemma × fact tuples under bounded DFS — the measured
   `MAX_PRODUCTS` blowup class and the biggest check-count driver. grind's answer:
   index each lemma by a TRIGGER (conclusion head + rigid premise skeletons, derivable
   mechanically from our rule objects) and fire instantiation only when a matching fact
   ENTERS the pool — demand-driven, not generate-and-test. Bounded slice, same
   fail-open/pin/differential discipline as every E-step.
2. **The ARITHMETIC SATELLITE = T3b's first instantiation.** A large named corpus
   residue is linear-arithmetic-shaped (`add`/`plus`/`leq` families). A tiny decision
   satellite for that theory — which must EMIT the corresponding ctor/lemma chain as
   Beluga text and certify it (grind's own law: satellites produce kernel-checkable
   certificates; ours produce checker-certified text) — decides that class instead of
   searching it. Our synth already produces exactly that output shape.
3. **The E-GRAPH SUBSTRATE (research-grade; the Phase D/E successor).** grind's state is
   congruence-closed equivalence classes; ours is TEXT. unique_eval's `eq_ref` let-chains
   ARE manual congruence closure paid per checker round-trip; `junkFreeSig`'s
   α-normalization and the regenerable-facts quotient are ad-hoc equivalence reasoning
   over strings. A congruence-closed term store as the saturation substrate subsumes the
   metaTheta refinement dances, makes "same obligation" a pointer compare, and is the
   natural state representation for plans-accepted-whole. It is also the Level-2
   principle completing itself: the writability bug class (D11/D14/P7) exists BECAUSE
   the prover round-trips text; grind structurally cannot have it. Enter it like
   everything else: spec + invariants + differential gate — it is a rewrite of state
   identity, not a feature.

**Explicitly NOT transferable:** refutation-only proving (we must EMIT constructive
Beluga terms; goal-directed focusing is correct for the cut-free tier — the usable
residue is only "saturate forward harder; goal-provable and context-contradictory are
symmetric outcomes"); boolean constraint propagation (our logic isn't boolean-heavy);
and anything presuming an elaborator without contextual LF — schemas/blocks/ctx-vars
(the D5/D14 dimension) are complications grind never faces.

### THE 2026-07-19 LEDGER OF RECORD — the post-P13–P17/unlock full sweep

> ⚠️ STALE (2026-07-22): this 199 predates the ctype build (C1–C8) and the rebuild
> slice. TRUE current COMPLETE is **≥ 219** — see the "RE-BASELINE (targeted,
> 2026-07-22)" section below; `library.jsonl` was never re-swept clean. Treat the 199
> and its residue decomposition as HISTORY; a clean full re-sweep is the next
> housekeeping job (archive by rename first, no parallel native work).

Fresh browser sweep of all 883 planned targets under the final 2026-07-19 engine
(`beluga-runtime-20260719d-unlock2`). `results/corpus/library.jsonl` is the ledger of
record; the E.9 baseline is archived as `library.20260718-e9.jsonl`. **Measurement law
learned here: the harness's wedge-recovery RE-APPENDS rows (≈30 dups clustered around
the tapl TIMEOUT region) — every report/diff must DEDUPE BY LAST OUTCOME PER ID.**
Deduped basis: 850 unique targets − 27 PRECHECK_FAIL = the 823 denominator.

**Library 199/823 COMPLETE (24%) — +7 vs E.9's 192, ZERO losses.** Decomposition:
no-move 378 (−5) · no-totality 108 (−8) · TIMEOUT 88 (+19) · coinductive 39 ·
step-bound 8 (+7, honest bounded churn) · file-errors 1 · FAIL 2 ·
**search-bound 20 → 0 — extinct as a terminal class, by P14's design (bounded leaves
backtrack; the honest residue lands in step-bound/no-move).** Held-out 23/39.

The 7 gains name the mechanisms: dual_uniq, eq5 ×2, tps (ch3+arith — a §6.2 №4 ledger
target!), addProjs were TIMEOUTs (wander killed → under the cap); small-step unique and
unique_eval were false no-moves (P13/P14/ordering). **The honest cost frontier: 30 new
TIMEOUTs, ALL inflow from former fast-stucks (19 no-move + 10 no-totality + 1
search-bound) — targets that used to give up early now search honestly and exceed the
60s browser cap. Not lost capability (they were STUCK before); pure oracle-cost, the
Phase E contract violation class. Named levers: E.10 trigger-indexed instantiation
(the grind notes), plans-accepted-whole.** Future differentials:
`--ref results/corpus/library.jsonl`.

### Phase I — The counterexample engine (turn "unprovable" into real DISPROOF)

§3.3 #2, and the enabling instrument for Phase H's T3b. Test a theorem statement on
generated/random well-typed instances via the oracle (QuickCheck / QuickSpec-style): enumerate
inhabitants of the premises' types from the signature (the analytic fill machinery already
enumerates typed terms — reuse it), instantiate, and check whether the conclusion holds. A found
counterexample is a **sound, real disproof** — the strongest "no" — and distinguishes "genuinely
false" from "true but needs a cut" (which is what lets Phase G honestly label NEEDS-A-CUT). Cheap,
principled, high-value; **build it early** (it is small, and T3b reuses it as its conjecture
filter). Soundness note: it only ever *fires* to disprove; absence of a counterexample is not a
proof and must never be reported as one.

**I.0 ✅ Pure FO slice (2026-07-16):** `js/editor-src/prover/prover-counterexample.mjs` —
`enumerateInhabitants` + `conclusionRigidlyEmpty` + `findCounterexample`. Empty-ctx box premises
only; depth-bounded FO ctor trees via `enumerateConstructorsTyped`/`renderApp`. Returns
`{ status:'disproved', witness }` or `null` (null ≠ proved). Pinned in
`tests/test-prover-counterexample.mjs`.

**I.1 ✅ proveProgram wiring (2026-07-16):** before search, `proveProgramCore` runs
`findCounterexample`; on hit returns `stuck.reason === 'disproved'` with `stuck.counterexample`.
Opt-out: `opts.noCounterexample`. Type-level-only (zero checks): `opts.counterexampleCertify === false`.

**I.2 ✅ Beluga-gate DISPROVED (2026-07-16):** `certifyCounterexample` / `counterexamplePrograms` —
premise mini-programs must check clean; conclusion reject-fill (nullary FO ctor into empty ground
concl) must fail. Default path: certify before claiming DISPROVED; gate decline ⇒ fall through to
search (never false-DISPROVE). Certified hits set `stuck.counterexample.certified` and accumulate
`checkCount`.

**I.3 ✅ Empty-ctx ctype (2026-07-16):** ctype premises/conclusions admitted when every nested box
has empty context; plan-domain matching via `normalizeCtypeSpelling`.

**I.4 ✅ Bare schema-var ctx (2026-07-17):** `ctxStructurallyEmpty` — blank **or** a bare schema
variable (`g`) with no commas/`:`/`block` counts as empty for CE. Binder-extended contexts
(`g, x:nat`) and HO still fail-closed. Pinned in `test-prover-counterexample.mjs`. **Not yet:**
true non-empty contexts; HO.

### Phase H — THE CUT LAYER: principled cut speculation (the honest research frontier, decomposed)

This is §3.2 Tier 3 made executable. **The map is: T3a/T3b are largely tractable with established
mechanisms and belong on the roadmap; T3c-interior is a hard-but-real research target; T3c-exterior
and T3d are the genuine wall where we decline honestly.** Do NOT promise Tier 1 anywhere here, and
ship every mechanism with its falsification batch (held-out theorems whose cut it should AND should
not find) and its tier label.

- **T3a — generalization by RIPPLING.** Implement wave-front annotation of the induction
  conclusion relative to the IH, ripple rewrites that move wave-fronts outward, and — the payoff —
  **blocked-rippling generalization**: when no ripple applies, the stuck wave-front's shape *names*
  the generalization (or the lemma) needed. This is the Bundy/CLAM/IsaPlanner method; it is a
  general mechanism, not a heuristic per shape. Start with accumulator/apart generalization on the
  arithmetic and list corpora — the most-validated territory. Falsification: a held-out batch of
  "needs-a-stronger-IH" theorems + a batch that must NOT be over-generalized (where the naive IH
  suffices).
- **T3b — theory exploration (bottom-up lemma discovery).** The generate–test–prove loop:
  *conjecture* small equations/lemmas over the signature's operators (QuickSpec-style term
  generation up to a size bound), *test* them with Phase I (discard the false), *prove* the
  survivors with the Tier-1 engine, *promote* the proven to the sibling-lemma pool. This
  mechanically discovers commutativity/associativity/distributivity and the Takahashi
  parallel-reduction lemma that block Church–Rosser and friends. Bounded per round (size-capped
  generation), principled, and it composes perfectly with Tier 1 (Tier 1 IS the prove step).
  Reference: QuickSpec → HipSpec/Hipster/IsaCoSy. Falsification: a suite whose target theorems are
  each unblocked by a discoverable small lemma, with the lemma held out of the pool.
- **T3c — TYPE-DIRECTED LOGICAL-RELATIONS SCHEMAS (the crown; the genuinely novel contribution).**
  The cut here is a *new type-indexed definition* (the reducibility candidate) + its fundamental
  theorem. **Interior (a real target):** formalize the logical-relations proof *pattern* as a
  first-class, type-directed proof-plan generator — define `Red` by recursion on the type structure
  (`Red(base)=SN`; `Red(σ→τ)={t | ∀s∈Red(σ). t s ∈ Red(τ)}`; products/sums componentwise),
  auto-discharge the escape/expansion/closure lemmas, and prove the fundamental theorem by
  induction on typing (Tier 1 discharges the sub-obligations). For type systems whose connectives
  the schema covers (STLC, +×+, a System-F fragment) this could instantiate SN / algorithmic-equality
  completeness *without human guidance* — to my knowledge unautomated, hence research-grade.
  **Architectural boundary to name honestly:** this synthesizes a new *signature element* (an
  `inductive`/`LF` declaration), a different mode than Tier-1 body synthesis, and the masking harness
  does not currently even pose it — extending the harness to mask/replay *definitions* is part of the
  work. Blueprint: **Cave & Pientka's Beluga logical-relations methodology** (contextual-type
  encodings of reducibility) — read it before designing. **Exterior (the wall):** a *novel* semantic
  construction for a type system no schema covers is the genuine creative cut, and no tool does it —
  decline honestly (below).
- **T3d — the bespoke creative cut.** The real law of physics (§3.1: undecidability + non-elementary
  cut compression + cut-free-induction incompleteness). Disposition: **decline with precision** —
  report the closest analytic plan and any lemma T3a/T3b *speculated* that would unblock it, as a
  conjecture for the human. Never fake it, never spin it.

**Reporting law for all of Phase H:** "attempted N, solved M, of which K were Tier-1-verified vs
(M−K) speculated-for-human," per tier. Zero spin. A cut we speculated but did not verify is NOT a
solve.

### Phase J — COINDUCTION as the elegant dual (Tier 2; gated on user priority)

§3.2 Tier 2. Not a bolt-on: transpose the Tier-1 focusing architecture with the productivity oracle
swapped for the termination oracle. Add the two coinductive formers (`fun`/copattern, `.field`) to
the generator (a bounded closure, exactly analogous to the inductive formers already done); make
the planner *cosplit on observations* and emit *guarded corecursive* calls checked by Beluga's
guardedness discipline; the coinduction hypothesis is the dual of the IH under that guard. Its
analytic interior is decidable by the same machinery; its cut (inventing the bisimulation /
Howe's construction) lives in Phase H alongside the generalized IH. **Build only when the user asks
— but when built, it is a symmetric completion of the engine, and the design should already
anticipate it (keep the planner's termination oracle abstract so productivity drops in).**



## 8. The methodology that cracked everything (measure → localize → minimal fix → re-measure)

> **⚠️ SCOPE (2026-07-19, §0.5):** this loop is for DEBUGGING A MECHANISM, and it is
> excellent at that — but it is how sessions get spent producing +1s when used as the
> STRATEGY. Strategy is §0.5: pick the biggest class, declare the stake, drive the
> stratified bench (audit buckets → 1–2 native reps, minutes). THEN this section's loop
> localizes why a bench rep fails. The instruments in order:
> `scripts/prover-residue-audit.mjs` (text, seconds) → the bench reps (native, minutes)
> → this section's per-target probes → the differential/sweep ONLY at slice-end.

When a lemma fails or the engine misbehaves, the winning loop is ALWAYS this, never "try a guard
and rerun the world":

**⭐ FIRST TOOL: the native oracle.**
`node scripts/prover-native-oracle.mjs (--cfg <sources.cfg> | --file <x.bel>) --name <rec>
[--max-steps N] [--trace] [--dump-candidates d]` — drives the FULL `proveProgram` loop in node
with Beluga-W's native `main.exe` as the oracle. No Chrome, step-faithful (branch pruning
included), prints steps live, dumps the stuck hole state + tried list. Use the browser ONLY for
browser-specific behaviour (worker poisoning, page kills, UI).

**⭐ THE PROBE THAT FOUND D11 (do this BEFORE theorizing about search control):** run
`proveProgram` with a small `maxSteps` + `collectTrace` + `triedCap 500`, and **print the last
trace entry's non-fill candidates WITH their checker verdicts.** D11 was found in minutes by
reading the tried list after a full day of state-level theorizing pointed elsewhere. **Always dump
what the engine GENERATED at the divergence before reasoning about why it's stuck.** The bug is
usually that the right candidate was generated but its only spelling was uncertifiable — not that
it was missing.

1. **Capture the stuck state once** (`scratch/probes/dump-stuck-state.mjs` pattern): run with a small
   `maxSteps`, dump the exact code + holes at the stuck point.
2. **Replay locally, cheaply** (`replay-synth.mjs` / `cert-at-hole.mjs`): feed the captured state
   straight to `candidateMoves`/`synthesize` in node, certify ONE candidate at a time with full
   checker output. Debug hooks: `globalThis.__synthDebug/__splitDebug/__budgetDebug/__decDebug`.
3. **Read the reference proof** (`cp_lemmas.bel`, `bigstep-deterministic.bel`, `unique.bel`) to
   learn the IDIOM the checker expects — then implement it GENERALLY from the type/schema, NEVER
   from the lemma's names.
4. **Hand-trace on paper when unification misbehaves** — the `¿`-namespace and flexible-application
   bugs were caught by hand tracing, not more runs.
5. **One checker error message = one root cause.** "free meta-variable is illegal" → unbound
   implicit indices (writability, D11/D14); "not closed" → uninferable some-var (enumerate
   variants); `Not_found` → poisoned worker (invariant below); error line inside a split →
   coverage-impossible branch (prune and re-verify).
6. **Ground-truth experiments beat doc archaeology.** The `/ total N /` numbering question was
   settled by a 5-variant invented-decl experiment in minutes (`scratch/probes/
   `numbering-experiment.mjs` pattern). When you don't know what the checker will accept, ASK IT
   with a minimal invented decl — don't reason from docs.

**During Phase D specifically:** the forward path is your differential oracle. For every theorem,
`planner_result` must ⊇ `forward_result`. A regression there is a planner bug, caught instantly and
locally.



## 9. Engine invariants — each cost a debugging session (do not re-learn)

These are load-bearing. Mirrored in the memory handbook; kept here so this doc stands alone.

1. **The checker RENUMBERS internal `"i`-names per elaboration.** Any fingerprint/budget/seen-guard
   MUST normalize `"`-quoted names positionally (like uppercase metas) — `alphaGoal`/`ctxSig` do.
   Blind guards never accumulate → historic infinite spirals.
2. **WORKER POISONING:** a failed constraint-check leaves Beluga's GLOBAL unification constraint
   store dirty; the next check on that instance dies `Not_found`. The shim calls
   `Unify.StdTrail.resetGlobalCnstrs ()` per `load_from_string`. Spurious `Not_found` after a
   rejected candidate ⇒ suspect a new path bypassing this.
3. **Incremental decl-checking is IMPOSSIBLE without core changes** (`load.ml` does `Store.clear()`
   + global store, no rollback). SETTLED — do not revisit. The substitute is wave-parallelism
   (rank-order acceptance = serial-identical result).
4. **Budgets** are keyed `branchPatternBox§goalKey` and charged ONLY for recurse/lemma — charging
   inverts starves invert²+recurse² proofs (dl_uniq). Synthesis largely obsoletes deep speculative
   search, but the budget still guards the non-synth path. *(Phase D should retire most of this.)*
5. **movePrefilterOk** (sound, zero-checker rejection) must NOT positional-judge Pi-typed ctors
   (`ctorDeclHasPi` guard — argTypes drops explicit `{Pi}` binders). Pinned in
   test-prover-prefilter §3c.
6. **Nested `case` MUST be parenthesized** `(case f of …)` or Beluga attributes the outer case's
   later arms to the inner one; `pruneOneBranch` carries close-parens.
7. **Split guards are CLOSURE-aware** (`openCasesAt`, paren-depth scan): a stale "nearest case"
   regex both blocked legitimate splits and admitted vacuous re-splits.
8. **Synthesis namespace:** rule schematics are freshened to `¿`-prefixed names before matching —
   same-spelled rigid checker metas otherwise capture and derive garbage.
9. **decOk termination:** an IH's decreasing premise must resolve to a pattern var of enclosing
   cases descending from the DECLARED decreasing binder (fixpoint over openCasesAt) — mirrors the
   totality checker exactly.
10. **`branchPatternBox` is balanced-first-box** — first-`[`-to-last-`]` swallowed arm annotations.
11. **WRITABILITY** (D11+D14): the hole report's namespace ≠ the source namespace (four measured
    instances). Never "fix" a free-meta rejection by renaming; dual-spell and let the checker
    arbitrate. By-construction closure = §7.F.
12. **PER-PATH guard scope** (D12): anything scoped to `branchBodyBefore` (innermost arm) is
    LAUNDERED by a nested split. Dup-call/invert-dup/self-chain guards use `pathBodyBefore`
    (ancestor-chain body, closed siblings excluded — exported, pinned).
13. **MEASURES** (D13): `/ total N /` counts explicit args UNIFORMLY (Pi binders AND box premises).
    `measureDesignation` is the single truth; box positions fork in index form, Pi positions in the
    named `_`-spine form. Synth withholds the IH rule for pi measures (decOk is box-keyed).
14. **State identity IS the JUNK-FREE QUOTIENT** (§6.1). An α-regress is NOT a literal revisit —
    every move adds something, states grow strictly. Refute a candidate creating a strictly-deeper
    hole α-equal to an ancestor obligation (`pathAnc` stack, depth-pruned; siblings never compared).
    Global memoization OVER-refutes; raw-state memoization UNDER-refutes.

**OCaml shim rebuild** (only when touching `beluga_web.ml`): `bash _rebuild/rebuild.sh` (Bash
tool). `beluga_web.bc.js` is READ-ONLY on disk — clear the IsReadOnly flag, copy, restore. Never
touch `src/core`. For JS/editor changes: `node scripts/build-editor.mjs`; bump `CACHE_NAME` in
`sw.js` and tell the user to HARD-RELOAD or they see stale UI.



## 10. Hard-won laws and traps (each cost real time)

- **Report flat, gap-first, no spin.** Never declare completion from a scoreline. The score is a
  spot-check OF the construction argument, not the argument. A delta is not a victory.
- **Every fix is a general mechanism argued from the spec** (a D-row + a matrix row + a pin on
  invented shapes). If your fix references a theorem/ctor/schema name, you have overfit — the
  no-overfit test will (and should) reject it.
- **A timeout is a bug, not a difficulty.** Root-cause the check count.
- **The right candidate usually EXISTS but is uncertifiable-by-construction** (writability). Dump
  the tried list before theorizing.
- **Do not build a mechanism whose COST reproduces the problem** (the IDE team's exact trap): a
  saturation database whose fixpoint is unbounded, a plan search whose demand-analysis is itself a
  full forward enumeration — these "solve" nothing, they relocate the blowup. When you add a
  bound, prove it is a bound.
- **Never kill chrome by name / MainWindowTitle** — crashes the user's tabs ("Aw, Snap!"). Filter
  `--headless` via CommandLine. STRICTLY ONE headless browser at a time — two probes starve each
  other into protocol timeouts. Stream long runs to a log; peek with `Get-Content -Tail`.
- **Run the whole test suite via `npm test`** — one approval, never file-by-file. Gates:
  `npm run prover:probe`.
- **Beluga-client stale-error replay** (open, unfixed): after fork-heavy rejection storms the
  prover slot replayed ONE stale error for every subsequent precheck until page rebuild (78
  spurious fails once). Suspect promise-queue desync in `js/beluga/beluga-client.js`. The harness defends
  (precheck-confirm on a fresh page) but the root cause is live.
- **Gates diverge under the REAL assembly** (sharpest unexplained finding): classical-processes
  under its real `cp.cfg` — `str_hyp` goes no-move[3 checks] where the curated-prelude gate solves
  [5]; `dual_sym` 241 checks vs 61. THREE checks means candidate GENERATION differs, not cost —
  diff the two assembled programs' spellings/preludes first. **This is a real lead; don't lose it.**



## 11. File map (where everything lives)

| Area | Path |
|---|---|
| Orchestrator (you change most) | [js/editor-src/prover/prover-orchestrator.mjs](js/editor-src/prover/prover-orchestrator.mjs) |
| Backward-chaining synthesis (you GENERALISE — Phases C/D) | [js/editor-src/prover/prover-synth.mjs](js/editor-src/prover/prover-synth.mjs) |
| **Phase D algorithm (read before editing synth)** | [js/editor-src/prover/prover-synth.mjs](../js/editor-src/prover/prover-synth.mjs) + this master plan |
| Model layer (split/fill/invert/schema) | [js/editor-src/prover/hole-split.mjs](js/editor-src/prover/hole-split.mjs) |
| Comp-type / totality / IH / measureDesignation | [js/editor-src/prover/prover-comp-type.mjs](js/editor-src/prover/prover-comp-type.mjs) |
| Hole report parsing | [js/editor-src/prover/hole-report.mjs](js/editor-src/prover/hole-report.mjs) |
| Proof formatter | [js/editor-src/format/proof-format.mjs](js/editor-src/format/proof-format.mjs) |
| Harness core (pure) | [js/editor-src/prover/prover-corpus-decls.mjs](js/editor-src/prover/prover-corpus-decls.mjs) |
| Native oracle (FIRST TOOL) | [scripts/prover-native-oracle.mjs](scripts/prover-native-oracle.mjs) |
| Falsification harness | [scripts/corpus-harness.mjs](scripts/corpus-harness.mjs), `corpus-plan.mjs`, `corpus-report.mjs` |
| Live gates | [scripts/prover-probes.mjs](scripts/prover-probes.mjs) |
| Worker plumbing / check pool | [js/beluga/beluga-client.js](js/beluga/beluga-client.js) |
| Coverage matrix + grammar anchor | `tests/test-prover-coverage-matrix.mjs` |
| No-overfit structural guard | `tests/test-prover-no-overfit.mjs` |
| Path canonicity pin | `tests/test-prover-path-canonicity.mjs` |
| Prefilter soundness | `tests/test-prover-prefilter.mjs` |
| Held-out corpus (blind falsification) | `tests/heldout-corpus/batch-*/` |
| Reference proofs (idioms, never names) | `library/data/case-studies/classical-processes/cp_lemmas.bel`, `.../bigstep-deterministic.bel`, `.../unique.bel` |



## 12. Suggested order of work (concrete first steps)

> **⚠️ SUPERSEDED by §0.5's slice queue (2026-07-19).** The list below predates the
> residue audit and ordered the work by phase elegance, not residue mass — following it
> produced the +7 verdict. Use §0.5: S1 composition → S2 no-totality class →
> S3 timeouts (E.10/plans-whole) → S4 classifier honesty. The list is kept because its
> per-phase pointers (what to read before touching what) are still accurate.

1. **Read this whole doc, then `prover-synth.mjs` end-to-end, then `candidateMoves` in the bridge.**
   Hold the whole picture (§4 tells you why synth is the seed of everything) before editing.
2. **Phase A:** archive `library.jsonl` by rename, re-sweep, re-decompose the ledger, re-sort the
   priority queue on real post-D14 numbers. Report flat.
3. **Phase B:** the `\p{L}` sweep + Greek matrix rows. Cheap, unblocks measurement.
4. **Phase C:** CTYPE-fact admission in `pushFact` + ctype rules — pinned on invented shapes and a
   matrix row. This is your deep-dive into synthesis and the warm-up for D.
5. **Phase D (the real work):** design the demand analysis first (the crux), prototype
   plan-as-object + demanded-splits behind the forward path, differentially gate against forward on
   the full held-out set, and WRITE THE TERMINATION ARGUMENT as you go. Do not rip out forward
   enumeration until the planner dominates.
6. **Phase E:** certify plans whole; prove the check count scales with proof size; watch the
   timeouts fall to zero.
7. **Phase I early, alongside E:** the counterexample engine — small, high-value, and it is the
   filter T3b depends on. Turns a slice of "unprovable" into real DISPROVED.
8. **Phase F/G:** writability by construction; formalise the decidable NO (NO-CUT-FREE-PROOF) +
   the full §3.3 verdict taxonomy with tier labels.
9. **Phase H (the cut layer), staged by tractability:** T3a rippling generalization → T3b theory
   exploration (reusing Phase I) → then, as a genuine research project, T3c-interior (the
   type-directed logical-relations schema; read Cave & Pientka first, and note it needs
   *definition* synthesis, a new harness mode). T3c-exterior/T3d = decline honestly. Only after
   Tier 1 is a real decision procedure. Every result carries its tier label and its
   found-vs-speculated split; zero spin.
10. **Phase J only if the user asks:** the coinductive dual — but keep the planner's termination
    oracle abstract from Phase D onward so productivity drops in cleanly later.
11. Keep the two memories (`project-beljar-prover.md`, `project-corpus-masking-harness.md`) and this
    doc updated with real numbers as you go. Delete the three superseded docs once you've confirmed
    nothing here is missing.



## 13. Two paragraphs to keep you honest

If at any point your change makes the greedy loop stumble into one more proof rather than making
the search a decision procedure by construction, you have not solved the problem — you have bought
a percentage point and a new timeout class, and the user has seen that movie. The answer is
ingenuity: the plan as the unit of search, the split demanded by a blocked focus, the deterministic
information saturated into a database instead of dribbled into the step stream, the state
quotiented by what is regenerable, the check that scales with the proof and not the search. Build
the demand analysis, move splits into the plan domain, certify plans whole, prove termination as an
argument about plan size, and report every number flat and gap-first. The engine's vocabulary is
already closed; the only thing left to build for Tier 1 is a search worthy of it.

And a third paragraph, bought at full price on 2026-07-19: **elegance is not yield.** Days
of principled, gated, individually-correct search-control mechanisms produced +7 of 823,
because every one of them was aimed at the boundary instead of the mass — while 179
eight-line proofs sat unfound and unexamined, their answers literally written in the
corpus. Before building anything, run the audit, name the class, declare the stake, and
let the reference proofs tell you what the engine actually cannot do. The failure mode is
not wrong fixes; it is correct fixes to the wrong-sized problem, narrated as progress.

And on the hard tier, hold both halves of the truth at once, because the user will accept nothing
less than research grade: there IS a law of physics here — no algorithm finds an *arbitrary* cut
(undecidability), and some inductively-true theorems have no cut-free proof at all (so Tier-1
search will, correctly and forever, return NO-CUT-FREE-PROOF on them). But that wall sits much
farther out than "342 hard misses" implied, and the ground between here and it — generalization by
rippling, lemma discovery by theory exploration, logical relations by type-directed schema, and the
whole coinductive dual — is *real, named, and mostly unbuilt*, not forbidden. Do not claim a wall
you have not proven is a wall; do not claim a proof you only speculated. Verify every "law" before
you invoke it, label every result with the tier it came from, turn every "unprovable" you can into
an honest DISPROOF, and decline the genuine creative cut out loud with the closest plan attached.
That — a decision procedure for the analytic fragment, a principled cut-speculation layer that
reaches deep into the "hard" tier, and scrupulous honesty at the one true wall — is the whole
assignment.
