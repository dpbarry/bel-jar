# The Harpoon prover — the decision-procedure master plan

> **This file is the single source of truth for the engine's DIRECTION.** It absorbs
> the former `prover-completeness.md` audit (kept as a historical appendix) and
> supersedes the retired `prover-str-*-handoff.md` docs. Engine *invariants* that
> cost debugging sessions are also captured in [`.cursor/rules/beljar-prover.mdc`](../.cursor/rules/beljar-prover.mdc)
> (local to Cursor checkouts).
>
> **Audience:** an agent picking this up cold, to drive the engine toward its ideal.
> **This doc is intentionally long and unabridged. Read all of it before writing a
> line of code, then consolidate as you go.** Nothing here is padding; every number,
> file:line, and named gap was paid for in a hard session.

---

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

---

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
MOVE their own reference proof makes (pure text, seconds — `scratchpad/firstmove` pattern,
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
`scratchpad/arity-audit` pattern; count `\x.`-led tokens as part of the argument they
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
83 no-move survivors of the class above (`scratchpad/reject-census` pattern):
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

Re-instrumented for that (`scratchpad/divergence` pattern — steps accepted, plus the
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
    instrument (`scratchpad/reach-drop.mjs` + the `__factDropDebug` hook) ran a 40-target
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
    attempt), plus `scratchpad/reach-drop.mjs` and `scratchpad/ctorapp-census.mjs`. The
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
    (`scratchpad/probe-mixed-slot.mjs`), on `poplmark-reloaded#mstep_appl`:
    | spelling | verdict |
    |---|---|
    | all-named `f [g⊢M] [g⊢M'] [g⊢N] [g⊢X1]` | Ill-typed expression |
    | all-underscore `f [g⊢_] [g⊢_] [g⊢_] [g⊢X1]` | Expression is not closed |
    | **this rule** `f _ _ [g⊢N] [g⊢X1]` | **PASS** |
    | `_` at slot 2 only | Ill-typed (slot 1 still named) |

    **Measured A/B** (`scratchpad/ab-mixedslot.mjs`, toggle `__proverNoMixedSlot`):
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
    contain** ([[feedback-size-classes-by-toggle]]). `scratchpad/mixedslot-reach.mjs`
    computes the structural class offline in seconds; copy that instrument shape.

    **Note `piRecurseTexts` was already correct** — it spells non-decreasing Pi args
    `[ctx |- _]`. The defect was unique to `recurseTexts`' Pi prefix.

44. **THE RESIDUE IS A LONG TAIL, measured — no single missing move is mass.**
    (2026-08-05.) `scratchpad/feature-census.mjs` counts, over all 552 STUCK/TIMEOUT
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
    carries the checker's own error. `scratchpad/error-census.mjs` runs a stride sample
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
    | `scratchpad/feature-census.mjs` | all 552 stuck, text | EVERY syntactic feature lands at **3–20%**. Top: weakening 22%, nested case 21%, nested-ctor-arg 19% (**18** in closing position), ctype-pattern-let 17%, subst-applied meta 8%, param-Pi 5%, **context induction 3%**. Nothing dominates. |
    | `scratchpad/error-census.mjs` | 20 targets, 1341 rejections | one class IS 41% ("Expected an LF term-level constant") but is only **~4% of CHECKS** (entry 45). A rejection histogram is not a cost histogram. |
    | `scratchpad/step-map.mjs` | 45 targets, step-weighted | **56% of stuck targets die at step 0**, consuming only **18% of checks**; the 47% that DO take steps consume **82%**. **64% are never offered a recurse candidate.** |

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
    `scratchpad/ctxind-census.mjs` computes it: (A) an explicit `{g : <schema>}` binder,
    (B) the measure NAMES it (`/ total g (f g) /`), (C) the reference splits `case [g] of`.
    **A+B = A+C = A+B+C = 16** — the correlation is perfect, so the engine can identify
    the class from the THEOREM'S TYPE ALONE, no reference proof needed (ids in
    `scratchpad/ctxind-ids.txt`). Members die cheaply at step 0 (2–11 checks:
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
    ZERO fork candidates. `scratchpad/measure-gap-census.mjs` sized it: **115 targets, 83
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

    **The instrument (KEEP — `scratchpad/error-census.mjs`).** Runs a stride sample of
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

---

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

---

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

---

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

---

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

---

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

---

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

---

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

---

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

1. **Capture the stuck state once** (scratchpad `dump-stuck-state.mjs` pattern): run with a small
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
   settled by a 5-variant invented-decl experiment in minutes (scratchpad
   `numbering-experiment.mjs` pattern). When you don't know what the checker will accept, ASK IT
   with a minimal invented decl — don't reason from docs.

**During Phase D specifically:** the forward path is your differential oracle. For every theorem,
`planner_result` must ⊇ `forward_result`. A regression there is a planner bug, caught instantly and
locally.

---

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

---

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

---

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

---

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

---

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
