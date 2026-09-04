# Orca research — working notes, 2026-07 to 2026-08

*Preserved verbatim from the agent working memory when the programme was shelved on
2026-08-29. This is raw research narrative, not a designed document: it is kept because the
failure modes and refuted directions in it are the expensive part. The digested version is
[`README.md`](README.md); the formal log is [`prover-master-plan.md`](prover-master-plan.md).*

---



## From memory: `project_orca_f_strategy.md`

**The strategic frame adopted 2026-08-25, after a full theorizing pass over the mandate,
the kickoff and master-plan entries 40–74.** Supersedes the "leaves vs structure are two
halves" framing. Builds on [[orca-r6-is-structure]].

## ⭐⭐⭐ THE CENTRAL CLAIM — the rule set is less than half the grammar
Entry 60.3b found the "nine rules" were wrong and that the real set is **~13 computation
formers + ~9 LF formers** (from `beluga.grammar`, the authoritative, 99.1% corpus-clean
one). **It was recorded as an error and never implemented.** Orca implements ~9 of ~22.
Two consequences, both hard:
1. **Mandate §3 is unanswerable** — you cannot show a closure covers the fragment with a
   set that provably is not the grammar. Entry 72.2 falsified the closure argument; nobody
   repaired it.
2. ⛔ **No measured number is a bound** — 13%, 1/16 above the cliff, 0/45 were all taken
   with a half-built generator. This is the kickoff's anti-prejudice instruction applied to
   OUR OWN numbers, not just borrowed ones.

## ⭐⭐ STROKE 1 — the ELIMINATION rule is missing (→E over LOCAL heads)
`candidatesFor` in `leaf-synth3` offers heads from only: the oracle's `Variables of this
type` (used **bare**, never applied) · `ctorsOf(goal)` · `theoremIndex(code)` (top-level
siblings). **Nothing pushes `v ? ?` for `v` bound in Γ or Δ.** Orca has →I (R1/R2/R8, built
entry 70) but no →E over local hypotheses at computation level.
- ⭐ **This explains the ~10-token cliff mechanically.** Below it: one GLOBAL head applied
  to variables (R5+R7 suffice, 60–76% verified). Above it: nested applications with a
  LOCAL inner head (1/16). Token count was a proxy for "did an inner head have to be local".
  Better than entry 72.3's contextual-apparatus story, and it predicts the R10 null (the
  problem is the HEAD was never offered, not spelling the object).
- ⭐ It explains entry 72.1's byte-identical call counts at 15× budget: the term is not in
  the generated language, so no budget reaches it.
- Target term from entry 70.2: `f [h'] (mlam T => fn y => s' [ |- T] (s [ |- T] y))` —
  `s'` and `s` are `fn`-bound local hypotheses of function type.
- ⚠️ **VERIFY FIRST (changes the size, do not assert):** entry 60.3's design says R9's head
  ranges over `Σ ∪ Ψ ∪ metas ∪ params` but the implementation looks like `ctorsOf` only (⇒
  LF level broken the same way, gap LARGER); whether `Variables of this type` lists
  function-typed hypotheses whose CONCLUSION matches; whether `prover-candidates.mjs`
  (the OLD engine) already does local heads (⇒ a leaf-synth fix, not an engine one).

## ⭐⭐⭐⭐ DAY-1 RESULT (2026-08-25) — STROKE 1 IS SMALL; THE WALL IS REFINABLE
**Stroke 1 measured.** `localhead-census.mjs`, scored PASS-vs-FAIL on the SAME leaves
(declaration-verified). Residue: **0.0% of SOLVED leaves carry a local application head vs
17.4% of FAILED** (infinite lift); control 5.3% vs 11.8% (2.24x). Size gradient clean:
residue ≤10 tok **0.0%**, >10 tok **25.0%**. ⛔ **BUT THE MASS IS 4 LEAVES.** Real, small,
NOT the wall — and R10 had infinite lift replicated on two sets and converted zero.
⚠️ The classifier was wrong FIVE ways on first draft (missed a head before a box, split
`halts/m` on `/`, read `tm` out of a box CONTEXT, mishandled the LF lambda, and a failed
.cfg assemble would have marked every head local). Entry 44's hand-check law caught all five.

**⭐ THE FULL TAXONOMY of the 23 failed residue leaves, by MISSING RULE** (`gap-taxonomy.mjs`):

| missing capability | leaves |
|---|---|
| **substitution objects/variables** (`M[sigma]`, `$W`, `$[Psi \|- sigma]`) | **7** |
| **context objects/extension** (`[]`, `[_]`, `[g, x:A]`) | **~5** |
| deep nesting / budget / search quality | 5 |
| **`impossible` former** (absent entirely) | 2 |
| local application head (Stroke 1) | 2 |
| `let` in arg position · block projection `#q.1` · **sibling arity cap `k>4`** | 3 |

⇒ **The wall is the CONTEXTUAL LAYER IN TERM POSITION (~12 of 23)** — independently
re-deriving entry 72.3 by a different route (missing-rule taxonomy vs feature census).

## ⭐⭐⭐⭐⭐ THE STROKE — ENTRY 72.5's DICHOTOMY IS FALSIFIED. THE LAYER IS **REFINABLE**.
Entry 72.5: *"the contextual layer must be SOLVED (unification), not GUESSED (search)"*.
There is a **third option: REFINED**. Verified at the source (`subst-refine.mjs`, controls
passing — it took THREE setups to get an honest control, see below):

```
[g, x:tm |- N[.., ?]]  ->  OK 1,  SUBGOAL [g, x : tm |- tm]   <- a hole INSIDE a substitution
[g, x:tm |- N[.., _]]  ->  OK 0,  no subgoal                  <- R10's `_`
```

⭐⭐ **THE MECHANICAL EXPLANATION OF R10's ZERO: `_` DEFERS the goal; `?` REDUCES it.**
Same position, opposite information. R10 emitted an author ABBREVIATION where the grammar
has FORMERS (`sigma ::= ^ | .. | sigma, M`). Refine the COMPONENTS, never the whole:
`N[?]` FAILS (*"Ill-typed substitution variable"*) because a bare hole parses as a
substitution VARIABLE.
- ✅ **substitutions: REFINABLE** (`sigma, ?`) — the 7-leaf class.
- ✅ **context objects: ENUMERABLE** — `probe [ ] [ ] ? ?` and `probe [g] [g] ? ?` both give
  correctly-typed subgoals. Finite: empty, each psi in Delta, extensions.
- ⛔ **contexts themselves are NOT refinable** — *"Holes may not appear as contextual LF
  types"*; `[?]` gives *"Identifier missing for the binding"*. Enumerate, do not refine.

## ⛔ HARNESS LAW BOUGHT TODAY — three false nulls in one probe
A substitution needs a **META** variable (Delta, `mlam`-bound). A **computation** variable of
boxed type used inside a box reads as *"This free meta-variable is illegal"* — the exact
error entry 69.1 diagnosed for `multi_tps [ |- d1]`. Setup 1 put the hole at goal `[ |- tm]`
while emitting a `[g, x:tm |- ...]` box; setup 2 used `fn m` instead of `mlam M`. **Both
produced a clean, total, entirely fake NULL.** Confirm a POSITIVE before believing any null.

## DAY-2 (2026-08-25) — LS3_CTX BUILT AND MEASURED. Honest net ≈ 0. Default OFF.
Five pieces behind one toggle (`LS3_CTX=1`, opt-in) in `leaf-synth3`: premise-model fix ·
arity-cap removal · per-slot argument shaping · R11 substitution former · `impossible`.
A/B on the 36 residue leaves, declaration-verified, control reproducing the stored 13/36:

| | before | after | gains | losses | cost |
|---|---|---|---|---|---|
| miswired build | 13 | 11 | **0** | 2 | +62% |
| **corrected build** | 13 | **15** | **4** | **2** | **+132%** |

⛔⛔⛔ **RESOLVED — ALL THREE `impossible` GAINS WERE FALSE PROOFS. `LS3_CTX` IS A NEGATIVE.**
Attribution (sub-toggles): `impossible` **0** legitimate gains · R11 substitution **1** real
gain (`[g |- D1[.., _, D2]]`, the author's exact term) at 1 loss and +88% calls · premise
model **0** gains. **Default OFF. The tenth mechanism to measure ~zero.**

### ⛔⛔⛔ A LATENT SOUNDNESS HOLE IN BELUGA — `impossible` ON A NON-DATATYPE
`impossible e` requires `e`'s type to have no coverage cases. A **function or Π type is not a
datatype**, so `Cover.genPatCGoals` generates no patterns, reports ZERO CASES, and
`impossible` is satisfied **vacuously**. Measured (`imposs-sound2.mjs`):
`rec c2 : ([ |- nat] -> [ |- nat]) -> [ |- nat] = fn f => impossible f` **loads clean**, with
AND without `/ total /`. All three gains discharged a function-typed hypothesis
(`s : {T} NeutVar [g1] [ |- T] -> NeutVar [h] [ |- T]`, manifestly inhabited — it was passed
in). **A machine search finds this immediately; an author never would.** Any use of
`impossible` must be gated to Δ metas with non-arrow, non-Π types.

### ⭐⭐⭐ THE METHOD LAW THIS BOUGHT (worth more than the toggle)
**A SOUNDNESS CONTROL MUST COVER EVERY TYPE SHAPE THE RULE CAN APPLY TO — not several
instances of ONE shape.** `imposs-sound.mjs` was a real experiment with positive AND negative
controls, run *because* the pragma was missing, and it still certified a false result: every
case it tried was datatype/box-typed, which genuinely does have cases. A second control
(`impossible` rejected on solved-control leaves) agreed — **blind in the same direction**.
⇒ Two agreeing controls are not independent if they vary the instance and not the SHAPE.

### ⭐⭐⭐ THE TWO DURABLE LAWS BOUGHT HERE (worth more than the toggle)
1. **REFINEMENT REACHES CHECKABLE POSITIONS ONLY.** `impossible [ |- ?]` fails —
   *"This LF hole is appearing in a SYNTHESIZABLE position, but LF holes must appear in
   CHECKABLE positions"* — while `impossible [ |- #p]` gives OK 0. A former whose argument is
   in SYNTHESIS mode **cannot be refined at all**; it must be handed a concrete term from
   Δ/Γ. This is a hard boundary on the whole ORCA-F design, not a bug.
2. ⭐⭐ **R10's POSTMORTEM WAS DRAWN TOO WIDE, and the corrected reading is mechanical.**
   The distinction is NOT `_` vs `?`. It is **`_` at a DETERMINED SLOT INSIDE A FORMER**
   (correct — the author writes `D1[.., _, D2]`) versus **`_` AS A WHOLE GOAL** (vacuous —
   defers everything, which is all R10 measured). Verified both ways at the oracle:
   `D1[.., _, D2]` → OK 0, `D1[.., ?, ?]` → *"Ill-typed term"*, `D1[.., ?]` → *"Missing type
   information"*. ⚠️ **This INVERTS the synthetic probe**, where `N[.., ?]` returned a typed
   subgoal — a slot determined by UNIFICATION is not checkable, one determined by the GOAL is.
   Emit both spellings and let the oracle arbitrate; do not model which.
   ⛔ And `D1[.., _, _]` closes hole-locally but FAILS the declaration
   (*"Leftover meta-variables"*) — **`LS3_STRICT` is what rejects it and lets the search go on
   to find the author's own term.** Without strict, that is a banked false proof.

### ⛔⛔ INFRASTRUCTURE — `scratchpad/` IS GONE; IT IS `scratch/probes/` NOW
Committed `scratch/README.md` documents the rename ("formerly `scratchpad/`"). The move left
**every instrument's relative imports one level short**, so *nothing in `scratch/probes/` ran
at all*. Repaired 2026-08-25: 192 static `from '../js/` across 101 files, **plus 2 DYNAMIC
`await import('../js/` in `ls3-verify.mjs` that a `from '...'` grep MISSES**, plus 2
`'../scripts/`. ⛔ **A junction does NOT fix this** — Node resolves it via realpath, so
`../js` still lands in `scratch/js`.
⭐ **THE BROKEN VERIFIER MANUFACTURED A CLEAN FAKE A/B**: every row returned `v:"crash"`, so
both arms scored 0/36 and read as "neutral". **The control (OFF must reproduce 13/36) is the
only thing that caught it.** Always score the control against its stored value first.

## DAY-3 (2026-08-25) — R6 BUILT INTO THE SEARCH. WHOLE-PROOF IS 0/6 ON THE CONTROL.
`LS3_R6=1` + `--whole` (masks the ENTIRE body to `?`, so intro + case tree + leaves must all
be synthesised — the first structure-synthesis measurement of any kind; every prior run in
this arc spliced the author's prefix). Entry **76**.
- ✅ **R6 is ACTIVE**: case candidates emitted AND accepted (`fundVar` 7/7, `weakNorm` 4/1).
- ⭐ **THE INVERSION BOUND — the day-1 open problem, solved cheaply.** Case-analysis is
  invertible but **unbounded**; the search re-split hypotheses inside every arm and drowned
  (`eq_refl` emitted **193** case candidates). **The bound is the rule's own applicability
  condition, not a ranking: a scrutinee already decomposed ON THIS PATH has nothing left to
  yield** (the arms bind its components, not itself), and **the partial term IS the path**, so
  no state need be threaded. `eq_refl` 193→**24**, `lin_name_must_appear` 36→**2**. Keep this.
- ⛔⛔ **0 of 6 on the POSITIVE CONTROL** (targets the OLD engine completes, 1500 calls,
  depth 12). **The residue was NOT measured** — entry 74.6's ≥8/30 stake stays untested until
  the control moves.
- ⭐ **DIAGNOSED, not guessed** (`LS3_VERBOSE` trace): (1) ⛔ **R6's arm patterns carry an
  UNDERSCORE CONTEXT** — `[_ |- l_pcomp1 (\x. X3)]` where the author's arm is over `g`. This
  is **[[prover-master-plan]] entry 69.8's unwritable-context defect resurfacing inside R6**,
  invariant 11 at a third boundary; an arm with a `_` context cannot bind the hypothesis the
  recursive call needs. (2) R3 (box intro) is tried before R5, so at the EMPTY type `imposs`
  — where the whole proof IS a recursive call — the DFS exhausts a dead branch first.
  ⚠️ That second one is candidate ORDERING (22 measured negatives); declared stake required.
- ⛔⛔ **CORRECTION (entry 76.6): the `_` context was NOT the blocker.** Split's output is
  ACCEPTED as printed (OK 9), and **all 9 arms of `lin_name_must_appear` CLOSE**, each with a
  one-step recursive call. The proof is reachable. The real chain is three layers:
  1. ⭐⭐ **THE ARM's CONTEXT VARIABLE HAS NO STABLE NAME.** It is an IMPLICIT parameter, so
     reconstruction RE-INVENTS it every elaboration — the same term reported it as `x`, then
     `z`, then `y` across three calls. The search re-elaborates the WHOLE term at hole 0 each
     step, so **a context name read from one report is meaningless in the next.** This is why
     a hole-by-hole probe succeeds where the search fails.
  2. **Fix: BIND the name ourselves in the PATTERN** (`[_ |-` → `[g0 |-`), which a case
     pattern may legally do — exactly what the author writes. Gives OK 9 and the name is then
     stable. But each arm's context is `g0` PLUS the LF binders ITS OWN pattern introduces,
     so the body must spell the ARM-EXTENDED context; derive it from the ARM HOLE's report
     (swap the invented head), **not** from the pattern text (that got binder COUNTS wrong).
  3. `ctxVars` was empty because the arm's context variable is **not a Δ entry of its own** —
     it appears ONLY inside another meta's type, so R5's context pool was empty and plain
     `f ?` crashed lfcheck as that code's own comment predicts. Both fixes shipped.
- **After the fixes: still 0/6, but the failure MOVED** — `lin_name_must_appear` went from 80
  calls (SPACE exhausted) to 3000 (BUDGET exhausted). Vocabulary present, assembly not. A
  hand-built whole proof types through ~690 of ~800 chars.
## ⭐⭐⭐ `let`-BOUND NAMES ARE INVISIBLE TO THE ORACLE — a durable finding
Measured (`let-chain.mjs`): the three-piece chain IS reachable one step at a time —
`let [ |- l] = dsym [ |- Dl] in ?` → OK 1, a NESTED `let` at that body hole → OK 1,
`[ |- d_pair l r]` → **OK 0**. So the chain is in the generated language and this is a
SEARCH-COMPLETION problem, not [[composite-moves-are-atomic]].
⛔ **But the body hole's report lists ONLY `d`.** `l` is absent from the computation context,
the meta-context AND `Variables of this type` — yet `[ |- d_pair l r]` types there. **A
`let`-bound name is USABLE but INVISIBLE**, so R7 (which trusts the oracle's list, correctly,
everywhere else) can NEVER discover it. ⇒ R7-LET added: recover the binder from the path,
since WE chose the name. The one fact the oracle omits.

## ⭐⭐⭐ FAIR BUDGET DIVISION ACROSS CANDIDATES — generalises the per-arm fix, and it works
Arms are independent CONJUNCTS; a shared budget let arm 1 spend everything, and per-arm
division fixed it. **Candidates at a hole are disjunctive ALTERNATIVES and the same pathology
applies.** On `dual_sym` the FIRST candidate's subtree consumed the arm's whole budget three
times running — wrong-context call, then nested self-call, then LF constructors — so R-LET,
~40th in the list, was never tried at the arm's top level. **Each of those three fixes was
locally principled and each merely handed the budget to the next generator: fixing them one
at a time IS the per-shape slog the mandate forbids.** ⛔ Not a ranking (22 negatives): the
ORDER is untouched, only the SHARE (`LS3_CANDCAP`, floor 12).
✅ **Measured: R-LET now fires at the arm's top level** — `(let [|- lv113] = dual_sym [|- X4]
in ?)` → `… in [ |- D⅋ ? ?]`. Calls 300 → 195, `acc.let` 1 → 2. Leaf mode 5 calls,
`lin_name_must_appear` still PASSES (720 chars).

## ⚠️ CORRECTION to the "let-bound names are invisible" finding
The trace shows `vars[lv113]` — **the oracle DOES list a `let`-bound name once the goal drops
to LF level.** It was absent only at COMPUTATION level in the synthetic probe. So R7-LET is a
narrower fix than recorded, and the chain does not depend on it as heavily as I claimed.

## ⚠️⚠️ SCOPE IS **NOT** THE BLOCKER — measured, and it corrects TWO earlier notes
`letbody-report.mjs` dumps the RAW report at each step of the chain. At the let-BODY hole:
```
  "i : ( |- tm)                 <- checker-invented, correctly skipped by our parser
  Dl : ( |- dual "i "i1)
  Dr : ( |- dual B B')          <- available for the SECOND let
  l  : ( |- dual "i1 "i)        <- the LET-BOUND NAME IS IN DELTA
```
⇒ `info.metas` is non-empty there and R-LET's guard passes. **The nested `let` is not blocked
by scope.** ⛔ And this corrects the same mistake TWICE: I twice read the Computation context
and concluded a name was invisible. **A `let`-bound name lands in the META-context (Delta),
not Gamma** — look in Delta.

## ⛔⛔⛔ `\b` IN A PYTHON HEREDOC IS **BACKSPACE** — A SILENTLY UNMATCHABLE REGEX
`cat -A` on the dump condition showed `/^Hlet^H/` — literal **0x08** bytes. Writing JS via a
non-raw Python heredoc turned every `\b` I typed into BACKSPACE, compiling
`/\blet\b/` into `/\x08let\x08/`: a VALID regex that can never match. **The instrument was not
logically wrong; it was compiled to something unmatchable, and emitted nothing while looking
healthy.** Every other escaping slip this arc was a loud syntax error; this one was silent and
cost a full cycle.
⛔ Repairing it with `sed s/\x08/\\b/g` then ate the backslash and produced `/bletb/` — also
valid, also never matching. **Rewrite such lines with `node -e` line replacement and verify
with `cat -A`; do not use heredoc-python or sed for JS regexes.** 3 backspace bytes were
found and repaired in `leaf-synth3.mjs`; the `\b`s at lines 89/388/548/836/839/1193 were
verified intact afterwards.

## ⭐/⛔ THE FULL-RESIDUE NUMBER — 9 of 570, DECLARATION-VERIFIED (master-plan entry 77)
Whole residue swept (not sampled), `--calls 1500 --depth 20`, every result spliced back with
`/ total /` RESTORED: **16 found, 9 VERIFIED (1.6%)**, residue precision **56%** against
**100%** on the COMPLETE control. The nine are all confirmed `STUCK` in the ledger.
⛔⛔ **THE LEDGER DOES NOT MOVE.** These come from a SCRATCHPAD instrument; the ledger's 273
is `proveProgram`, untouched. 282/850 is what it *would* read if the refinement search were
wired in — **integration was named on day one of this arc and never done.**
⚠️ **The control OVERSTATED soundness**: 100% precision there, 56% on the residue (7 found
terms failed the reload; none banked). **A control drawn from successes cannot measure the
residue's failure mode.**
⛔ **1.6% is what mandate §2 rules out explicitly** ("not as a milestone, not as a stepping
stone, not as 'at least it's positive'"). Record it as failing the bar, not as a gain.

## ⛔⛔⛔ EVERY INGREDIENT IS AVAILABLE AND COMPOSITION STILL FAILS — the standing wall
Four staked interventions on this axis, **all killed**, and a diagnostic chain that rules out
every component explanation:

| what was suspected | how it was tested | verdict |
|---|---|---|
| proof SIZE | its own data | a 720-char proof cost 64 calls, a 106-char one 702 |
| head BRANCHING | conclusion+premise filter, 8x measured | **1/40** |
| SPLIT choice | `split-choice.mjs` | author's scrutinee ALWAYS offered, pos 1-2, pragma names it 5/6 |
| `let` SHAPE | `letrhs-census.mjs` | **89% of residue lets already generatable** (bare 34.2% + sibling 54.9%); only 11% outside |
| R-LET running UNFILTERED (real defect, fixed) | premise-only filter on both R-LET loops | **1/40, unchanged** |

⚠️ The R-LET gap was REAL — the head filter had been applied to R5's loop only, while R-LET
(the dominant generator on `let`-shaped targets, up to 32 candidates + the n-ary chain) ran
unfiltered. Fixing it changed nothing. ⭐ Note the filter must be **premise-only** for R-LET:
`let [Psi |- v] = f args in body` does NOT need f's CONCLUSION to match the goal, so applying
the conclusion half there would delete correct candidates and break completeness.

⇒ **Leaves close (50%), scrutinees are offered, 89% of let shapes are generatable, branching
cuts do nothing — yet whole-proof composition is 2.5% on this band.** Every individual MOVE is
available; the search cannot COMPOSE them, and no constant-factor width reduction helps. That
points at composition DEPTH (k), not width (b) — and nothing measured so far reduces k.
⛔ **Do not propose a fifth width/ordering/filter mechanism. Four are dead.**

## ⛔ AND IT IS NOT SPLIT CHOICE EITHER — R6 offers the author's scrutinee every time
`split-choice.mjs` on the 71-200 band. Where the author uses a top-level `case`:

| target | author splits on | our position | pragma names it |
|---|---|---|---|
| `append` / `eq4` / `vself` | d1 / r / v | **1st** | yes |
| `neutralSNe` / `mstep_match` / `howe_subst_wkn` | sne / ms / h | 2nd | yes / yes / no |

**The author's scrutinee is ALWAYS offered, at position 1 or 2, never absent**, and
`/ total /` names it in 5 of 6. ⇒ Ordering the split by the pragma moves three targets from
2nd to 1st — **marginal, not the wall.** Do not build it as a mechanism.

⭐⭐ **AND THE ASSUMPTION UNDERNEATH WAS WRONG: structure != case tree.** **10 of 16 band
targets have NO top-level `case` at all** — their shape is `["fn","let","let","box"]`, i.e.
`let`-CHAINS. R6 is not the operative rule on most of this band. The structure gap is in
`let`-chain construction (R-LET), whose scrutinee pool is siblings x metas, while the
author's lets are frequently DESTRUCTURING or otherwise shaped.
⇒ Next question, narrow: on the band's `let`-shaped targets, is the author's `let` in
R-LET's generated set at all? (`author-walk.mjs` gives the former sequence; `destrlet-reach`
gives the destructuring contract.)

## ⭐⭐⭐⭐ THE LOCALIZATION (2026-08-28) — IT IS **STRUCTURE**, NOT LEAVES, NOT BRANCHING
Same 71-200 char residue band, two modes of the SAME search:

| | |
|---|---|
| **LEAF mode** — author's structure handed over, leaves synthesised | **4/9 every-leaf-closed (44%)**; individual leaves **5/10 (50%)** strict |
| **WHOLE-PROOF** — structure synthesised too | **1/40 (2.5%)** |

⇒ **The terms ARE reachable. What fails is choosing the case tree.** Run
`leaf-band.mjs <ids>` to reproduce.

⛔⛔ **THIS OVERTURNS THE PREVIOUS TURN'S CONCLUSION.** I reasoned that an 8x branching cut =
8^4 ~= 4,096x space reduction converting 1/40 proves "the answer is not in the space." Wrong:
the cut was at HEAD choice while the search was losing at STRUCTURE choice, so the reduction
was applied to the wrong dimension entirely. **A search-space argument is only valid about the
dimension you actually reduced.**
⚠️ Discount honestly: per-leaf scoring is OPTIMISTIC (entry 70.4 — leaves share metavariables
and here the other leaves still hold AUTHOR text). 44% is an upper bound. But 44% vs 2.5% is
not noise, and it is the sharpest localization in this arc.

⭐ It also re-reads the size story: bigger proof -> more structure -> more places for R6 to
choose wrongly. Size was a PROXY for structure-choice count all along.
⇒ **The open question is now narrow and answerable: WHY does R6 pick the wrong case tree?**
Not "can we reach terms" (yes), not "is branching too wide" (cut 8x, no effect).

## 🚨🚨🚨 THE "DEFINITIVE" 9/570 IS AN UNDERCOUNT — A BUDGET ARTIFACT I CREATED
**`--calls` changes REACHABILITY, not just runtime.** `dual_sym`, identical code, identical
depth:
```
--calls 1500 -> FAILS, stops at 327 calls
--calls 8000 -> PASSES, uses  345 calls      <- succeeds using FEWER than the 1500 cap
```
⭐ **Cause is my own fair-division formula:**
`share = calls + max(CANDCAP, (cap - calls) / nCand)` derives each candidate's allowance from
the **GLOBAL** budget, so at 1500 every branch is squeezed to the 12-call floor. A budget
parameter that alters what the search can REACH makes every number budget-relative.

⛔⛔ **AND I RAN THE HEADLINE MEASUREMENTS AT 1500** — chosen only so the 570-target sweep
would finish overnight. Same band, same targets, same code:
| budget | 71-200 band |
|---|---|
| `--calls 1500` | **1/40** |
| `--calls 8000` | **4/40** |
⇒ **The full-residue 9/570 (1.6%) is an UNDERCOUNT, plausibly ~4x.** It must be re-run at
8000 before any number from this arc is quoted. Master-plan entry 77 carries the stale figure.

⚠️⚠️ **AND THE FOUR "DEAD" INTERVENTIONS WERE ALL SCORED UNDER THE CRIPPLED SETTING** (head
filter 1/40, R-LET premise filter 1/40, both at 1500). Their nulls are NOT trustworthy and at
least the head filter deserves a re-run at 8000 before it stays in the refuted ledger.

### ⛔ THE PRINCIPLED FIX WAS BUILT AND REVERTED — it costs a working proof
Replaced the share with a FIXED per-candidate allowance (`calls + PERCAND`), which makes the
search genuinely budget-independent — verified: `dual_sym` reports the SAME 286 calls at
`--calls` 1500 / 3000 / 8000. ⛔ **But it does not FIND `dual_sym` at any allowance tried
(40 / 80 / 200 / 400 / 1200 — all exhaust at 286), while the old formula finds it at 345.**
⭐ **The old formula finds MORE by giving LESS:** a tight per-candidate cap forces early
backtracking, so the search explores BREADTH instead of sinking into one subtree. Generosity
is not neutral here. (Also tried and NOT the cause: adding the ancestor to the `seen` key.)
⇒ **Reverted to the known-good formula.** Both proofs restored (leaf 5, `lin_name_must_appear`
62, `dual_sym` 345). The budget artifact stands as a **CAVEAT, not a fixed defect**: every
number must record its `--calls`, and a fix must not be adopted unless the two known proofs
survive it.

⭐ **THE REAL FIX (still open):** the per-candidate share must come from a FIXED per-hole
allowance, never from the remaining global budget — then `--calls` governs only when the
search stops, not what it can find. Until then every result carries its budget as a caveat.

## ⭐/⛔ (STALE — see the correction above) FULL RESIDUE AT `--calls 1500`: **9 VERIFIED**
Not a sample. Every one of the 570 residue targets, `--calls 1500 --depth 20`, each result
spliced back with `/ total /` RESTORED and the program reloaded (master-plan **entry 77**).

| | |
|---|---|
| proofs FOUND | 16 / 570 |
| **DECLARATION-VERIFIED** | **9 / 570 (1.6%)** |
| precision on the residue | **56%** — vs **100%** on the COMPLETE control |

The nine: `test.cfg#best_step` · `lincx.cfg#helper1_6a` · `lincx.cfg#helper1_6b` ·
`Close_Terms.bel#close1` · `#close` · `#close'` · `Normalization_by_Evaluation.bel#app'` ·
`Weak_Normalization.bel#weakNorm` · `weak-norm.bel#weakNorm`. All confirmed `STUCK`.

⛔⛔ **THE LEDGER DOES NOT MOVE.** These come from a SCRATCHPAD instrument; the ledger's 273
is `proveProgram`, never touched. **282/850 (33.2%) is what it WOULD read if the refinement
search were wired into the engine — and that integration was named on day one of this arc and
never done.** Any future claim must state this or it is false.

⚠️ **The control OVERSTATED soundness.** 100% precision there, 56% here — seven found terms
failed the `/ total /` reload (`terminate` x2, `extend` x2, three `weakNorm` variants). None
was banked. **A control drawn from successes cannot measure the residue's failure mode.**

⛔ **And 1.6% is the outcome mandate §2 explicitly rules out** ("not as a milestone, not as a
stepping stone, not as 'at least it's positive'"). Record it as a failure to clear the bar.

## ⛔⛔ THE HEAD FILTER — 8x BRANCHING REDUCTION, MEASURED, AND IT CONVERTS 1/40. KILLED.
Two APPLICABILITY conditions (not heuristics, not ranking): a head is offered only if its
CONCLUSION can reach the goal and Delta/Gamma can SUPPLY ITS ARGUMENTS. A head failing either
provably fails the checker, so nothing reachable is removed.
Measured branching reduction: concl 2.0-4.6x · prem 1.9-8.0x · **both 2.7x-11.3x, median ~8x**.
Arithmetic said this should be decisive: at k=4 head choices, 40^4 = 2.5M -> ~1,000.
**Stake: >=8 verified on the 71-200 char residue band (148 targets, 40 sampled). Kill: <3.
MEASURED 1/40. KILLED.** No regression (leaf 5 calls, `dual_sym` 353 -> 345).

### ⭐⭐⭐ WHAT THE THREE FAILED DIAGNOSES ADD UP TO — CONVERSION DECAYS WITH PROOF SIZE
| population | verified |
|---|---|
| COMPLETE control (any size) | 10/30 (33%) |
| residue, author proof <=70 chars | **7/56 (12.5%)** |
| residue, 71-200 chars | **1/40 (2.5%)** |
| residue, uniform stride (median 321) | 0/30 |

**Conversion collapses with size and NONE of the three interventions moved it** — I proposed
SIZE (cut layer), then BRANCHING (head filter), and measurement killed both; the first was
killed by its own data (a 720-char proof cost 64 calls, a 106-char one cost 702). The honest
synthesis is that the mechanism has a hard complexity ceiling near ~70 chars of author proof,
b is NOT the binding constraint (8x bought nothing), and k for the 71-200 band must be far
larger than the 3-4 estimated from "2-4 lemma calls".
⛔ **Do not propose a fourth mechanism on this axis without first explaining why b=8x bought
zero.** That fact constrains the hypothesis space more than any census does.

## ⭐⭐⭐⭐⭐ +7 RESIDUE TARGETS, DECLARATION-VERIFIED — THE FIRST NON-ZERO IN THIS ARC
Swept ALL 56 residue targets whose AUTHOR body is <= 70 chars (the band the mechanism
actually reaches), 6000 calls / depth 20:

| | |
|---|---|
| **DECLARATION-VERIFIED** (`/ total /` restored) | **7 / 56 (12.5%)** |
| of targets that actually ran | 7 / 47 (**15%**) |
| found but FAILED verification | 2 (residue precision 78%, vs 100% on the control) |
| unparseable | 9 |

**All 7 confirmed `STUCK` in the ledger** — genuine conversions, not re-solves:
`test.cfg#best_step` · `lincx.cfg#helper1_6a` · `lincx.cfg#helper1_6b` ·
`Close_Terms.bel#close1` · `Normalization_by_Evaluation.bel#app'` ·
`Weak_Normalization.bel#weakNorm` · `weak-norm.bel#weakNorm`.
⇒ Ledger would be **280/850 (32.9%)**, +0.8 points. ⛔ NOT banked — a claim needs a full
re-baseline, not a targeted sweep.

### ⛔⛔ THE 0/30 THAT "KILLED" THIS WAS A SAMPLING ARTIFACT
One turn earlier I measured 0/30 on a stride sample over all 570 residue targets and wrote
the mechanism off as reproducing easy proofs only. **A stride sample over the whole residue
contains ~3 targets in the <=70-char band (9.8%), so it could not detect a mechanism whose
range IS that band.** The size census is what caught it: the residue holds **56** small
targets — MORE in absolute count than the control's 43, despite a lower share.
⭐⭐ **STRATIFY BY THE MECHANISM'S OWN RANGE BEFORE CONCLUDING ZERO.** A uniform sample tests
the population, not the mechanism, and this project's ledger of "measured ~0" results should
be re-read with that in mind — at least one of them may be the same artifact.

## (superseded — sampling artifact) THE VERDICT: 0/30 ON THE RESIDUE
Stride sample over the WHOLE residue (570 targets), same protocol, 6000 calls / depth 20:

| | verified |
|---|---|
| COMPLETE control (already solved by the shipped engine) | **10 / 30 (33%)** |
| **RESIDUE** | **0 / 30** |

One proof found on the residue (`weak-norm-total#weakNorm`, 106 chars) and it **FAILS**
type-checking — residue precision 0/1 against 100% on the control.

⭐ **33% of ALREADY-SOLVED targets and 0% of unsolved ones is the signature of a mechanism
that REPRODUCES easy proofs rather than one that EXTENDS REACH.** It is the same verdict this
project already reached about Harpoon's own prover ([[harpoon-auto-baseline]]: "it solves
NOTHING Orca cannot") — now turned on our own mechanism. **The ledger cannot move from this,
and R6/R-LET/whole-proof must not be described as a corpus advance.**

⚠️ What it IS: the first time Orca has built a complete proof — structure and leaves — from a
theorem's TYPE ALONE, soundly (100% control precision, every close surviving `/ total /`).
That capability did not exist before and the sub-results stand (the position matrix, the
constructed termination certificate, coverage-generated `#p`/context patterns). ⛔ But
capability is not conversion, and this is the eighth reach-without-payload result in the
project's ledger. **Do not open another slice on this axis without a residue-side reason.**

## ⭐⭐⭐⭐ WHOLE-PROOF SYNTHESIS — 10/30 ON THE COMPLETE CONTROL, 100% PRECISION
Stride sample over all 273 COMPLETEs, fixed before the run, 6000 calls / depth 20:

| | |
|---|---|
| **DECLARATION-VERIFIED** (`/ total /` restored) | **10 / 30 (33%)** |
| of targets that actually ran | 10 / 27 (**37%**) |
| precision | **100%** — every proof found also verifies |
| unparseable rows remaining | 3 |

Passing sizes: 13, 18, 25, 25, 27, 30, 30, 49, 61, **720** chars. Nine small proofs plus
`lin_name_must_appear`'s 9-arm, 720-char one.

### ⛔⛔ FOUR OF THE TEN WERE HIDDEN BY A LEAF-MODE GUARD
The first run scored **6/30 with 10 unparseable rows**. Four `emit({err})` guards —
`shape`, `reveal`, `no-leaf`, `artifact-leaf` — reject a target because the AUTHOR's leaf at
maxDepth-1 is missing or is itself a case. **In `--whole` the body is masked to a single `?`
and the author's decomposition is never used**, so all four excluded targets for reasons that
do not apply, BEFORE the search ran. Guarding them with `!WHOLE` took 6 -> **10** and
unparseable 10 -> 3. ⭐ **The instrument was suppressing 40% of the successes**, and reporting
them as "no proof found" — indistinguishable from a real failure in the output.
⇒ **When a mode is added to an existing harness, audit every early-exit guard for whether it
still applies.** This is the second time this arc that a measurement was wrong because a
leaf-mode assumption leaked into whole mode.

⚠️ **These are targets the OLD engine already completes**, so 33% is not a corpus gain — it
measures how much of the shipped engine's own success whole-proof synthesis reproduces from
the TYPE ALONE, no author structure handed over. **The residue is still untouched by it.**

## (superseded) THE FIRST REAL DENOMINATOR — 6/30, before the guard fix
Stride sample over all 273 COMPLETEs, fixed before the run, 6000 calls / depth 20:

| | count |
|---|---|
| **DECLARATION-VERIFIED** | **6** |
| genuinely measured failures (search ran and exhausted) | 14 |
| ⚠️ **unparseable output — CRASH, not a result** | **10** |

⇒ **6/30 raw, but 6/20 = 30% of targets that ACTUALLY RAN.** 100% precision — every proof
found also verifies with `/ total /` restored. Passing term sizes: 13, 25, 25, 30, 61, **720**
chars (the 720 is `lin_name_must_appear`, 9 arms) — five small proofs plus one substantial.
⛔ **A THIRD OF THE SAMPLE WAS LOST TO INSTRUMENT FAILURE** and would have been reported as
"no proof found" if the two had not been separated. **Always split CRASHES from measured
failures before quoting a rate** — `whole-run.mjs` prints `calls=undefined`/`calls=?` for
these; fix the driver (or the crash) before the next sweep.
⚠️ **These are targets the OLD engine already completes**, so 30% here is not a corpus gain —
it measures how much of the shipped engine's own success whole-proof synthesis can reproduce
from the TYPE ALONE, with no author structure handed over. **The residue has not been touched
by this mechanism at all.**

## ⛔⛔⛔ A GUARD THAT FAILS OPEN IS WORSE THAN NO GUARD — the certificate's second hole
`dual_uniq` "found" `fn v0 => fn v1 => dual_uniq (dual_sym (dual_sym v0)) v1` — semantically
`v0`, structurally NOT smaller, and Beluga rejects it (*"Recursive call not structurally
smaller"*) only at declaration level, after a full program load.
**`decCertified` should have caught it and did not.** `ARG`'s paren alternative is
`\([^()]*\)`, which cannot span NESTING, so the whole regex FAILED TO MATCH at
`dual_uniq (dual_sym (dual_sym v0))` — the loop body never ran and the function returned
**TRUE by default**. ⭐ **A guard that fails OPEN on text it cannot parse certifies silently;
that is strictly worse than having no guard, because it also stops anyone looking.** Fixed: a
`(` directly after the head is a non-bare argument and can never be a structural subterm.
⇒ **Control precision is now 100%: 2 proofs found, 2 verified** (was 3 found / 2 verified).
⚠️ This is the SECOND defect in this same certificate (the first swallowed `in`/`let` and
rejected the author's own proof). **Both were regex-scoping errors on emitted text. If this
guard is ever extended again, write it as a TOKEN SCAN with balanced-paren tracking, not a
regex.**

## ⭐⭐⭐⭐⭐ TWO VERIFIED WHOLE PROOFS — CONTROL 2/6 (was 1/6)
```
lin_name_must_appear    64 calls   720 chars   PASS
dual_sym               353 calls   555 chars   PASS   <- NEW
```
Both from the theorem's TYPE ALONE: intro, coverage-generated case tree, `let`-chains,
recursive calls on subderivations. Both accepted by Beluga with `/ total /` RESTORED.
`dual_sym`'s term matches the author's arm for arm.

### ⛔⛔⛔ THE BUG WAS MY OWN TERMINATION CERTIFICATE
`decCertified` extracted a self-call's arguments as a GREEDY run, and `ARG` accepts bare
identifiers — so after `dual_sym [|- X4]` it swallowed `in`, then `let`, then `[|- lv226]`,
and finally the body box `[ |- (D⅋ lv225 lv226)]`. That last is not a bare name, so the rule
"a non-bare argument rebuilds, never decreases" fired and **the guard rejected the AUTHOR'S
OWN PROOF.** Every `decRej` on `dual_sym` was self-inflicted. Fix: stop consuming arguments at
`in`/`let`/`case`/`of`/`fn`/`mlam`/`=>`, which END the application.

### ⭐⭐ SEVEN WRONG ATTRIBUTIONS, AND WHAT ACTUALLY BROKE THE DEADLOCK
ordering → scope → budget → emission → cap → depth → "the checker rejects it". **All seven
wrong.** The term was formed, unskipped, and typed `OK 0` the entire time.
**What broke it was FIXING THE INSTRUMENTS, not the search:**
1. `\b` written through a non-raw Python heredoc became **BACKSPACE**, compiling `/\blet\b/`
   into a regex that can never match — a SILENT dead instrument.
2. VERBOSE truncates terms at 60 chars, so `D⅋ lv225 lv226` printed as `D⅋ lv225 l` and a
   grep for it found nothing — I concluded it was never built and reasoned on that for turns.
3. `decRej` had 6 entries; I printed 3. The answer was in lines 5-6.
⇒ **When a search will not take a move: print the moves, print ALL of them, and check the
instrument prints at all before believing any of it.**

### ⛔ META-TYPE SIGILS `#(…)` / `$(…)` WERE MIS-PARSED — fixed, and it was polluting everything
A PARAMETER-VARIABLE meta prints `#p : #(g |- A)`; a SUBSTITUTION variable prints
`$S : $(g |- h)`. The Delta parser stripped only a leading `(`, so the context came out as
**`#(g`** and R-LET/R5 spliced it into candidates verbatim: `let [#(g0 |- lv11] = ...` —
pure garbage, emitted on **every target with a `#p` in Delta**, which is common.
Fixed (`replace(/^[#$]/, '')` before the paren strip). Cleaned the pool; did not by itself
unlock `str_hyp`. ⭐ Found only by DUMPING THE CANDIDATE LIST — it is invisible in any
counter, since the garbage candidates simply fail and look like ordinary rejections.

### ⭐⭐⭐ WHERE THE DESTRUCTURING `let`s SIT — and why the class is NOT the lead
`let-position.mjs`, shallowest destructuring `let` per proof, control built in:

| depth | residue | COMPLETE |
|---|---|---|
| 0 (top level) | 16.7% | 13.6% |
| 1 (one arm) | 9.6% | 9.1% |
| **>=2 (nested arms)** | **73.8%** | **77.3%** |

1. ✅ **The 4.3% was a MEASUREMENT ARTIFACT, not a broken mechanism.** The contract probe
   splits at the TOP hole, which can only ever see ~17% of the class. The repairs live in
   `candidatesFor`, which runs at EVERY hole, so they were already in the right place —
   only the probe was one level up from where the shape lives.
2. ⛔⛔ **AND THE DISTRIBUTIONS ARE NEAR-IDENTICAL (16.7/9.6/73.8 vs 13.6/9.1/77.3).** Depth
   does not discriminate at all; both sets use this construct the same way, in the same
   places. The 1.72x was about PRESENCE only. **"A feature in 80% of failures and 75% of
   successes explains nothing"** — that law applies here.
⇒ **The destructuring `let` is NOT the residue's distinguishing problem and should not get a
dedicated slice.** Keep the four repairs (verified correct, 7/9 accepted candidates needed
them, 100% round-trip where offered); stop treating the class as a lead. **Any future contract
measurement for a DEEP construct must run the FULL SEARCH, not a top-hole probe.**

### (superseded) THE DESTRUCTURING-`let` CONTRACT — reach measured at the wrong position
`destrlet-reach.mjs` + `destrlet-run.mjs`, stride sample, control built in:

| | residue | COMPLETE |
|---|---|---|
| class size (TEXT census) | 240 | 66 |
| `%:split` OFFERS a destructuring `let` | **1 of 23 (4.3%)** | 6 of 24 (25.0%) |
| …ROUND-TRIPS | **100%** | **100%** |
| candidates accepted RAW / only AFTER REPAIR | 0 / 3 | 2 / 4 |

✅ **The four repairs are CORRECT AND WORK AT SCALE** — 7 of 9 accepted candidates required
them, every offered candidate round-trips. They were right; testing them on `str_hyp` ALONE
was the only error.
⛔⛔ **BUT THE TEXT CENSUS OVERSTATED REACH ~10x** (41.6% class -> 4.3% offered), the fourth
documented instance of that law after 4x, 24x and 3.5x. **Size by a FIRING COUNTER during real
runs, never by what proofs contain** — I sized this class by text one turn after writing that
caveat down, and then believed the 240.
⚠️ And the direction INVERTS: split offers the shape on **25% of COMPLETE vs 4.3% of residue,
lift 0.17x**. The residue's destructuring lets are needed DEEPER than the top hole this probe
splits at, or on scrutinees split does not pick there. **Before any more work here, measure
where in the proof those lets sit** — a top-hole probe cannot see them.

### (superseded by the contract above) THE `let` TEXT CENSUS
`let-census.mjs`, control built in (273 COMPLETE vs 577 residue), report the LIFT:

| | COMPLETE | residue | lift |
|---|---|---|---|
| uses ANY `let` | 70.0% | 73.0% | **1.04x** (explains NOTHING — ubiquitous) |
| uses a **DESTRUCTURING** `let` | 24.2% | **41.6% (240)** | **1.72x** |
| uses a CALL-BINDING `let` | 59.0% | 61.2% | 1.04x |
| residue OCCURRENCES | | destructuring 743 · call-binding 1719 | |

⭐⭐ **This CORRECTS the instinct to write `str_hyp` off as a tail target.** The destructuring
shape covers **240 residue targets at 1.72x lift** — the highest structural lift in a while,
and a mass class by any reading. Stopping the unmeasured grind was right; concluding "tail"
without measuring would have been wrong.
⭐ Note the asymmetry: call-binding lets are twice as frequent in raw occurrences yet have NO
lift (both sets use them equally). That is the shape R-LET handles, and it is what unlocked
`dual_sym` — a reminder that lift ranks CLASSES, not the value of a mechanism.
⚠️ A TEXT census overstates reach (4x, 24x, 3.5x documented). **240 is an upper bound on what
the mechanism could touch, never a prediction of conversion.**

⇒ **The destructuring shape earns a REAL SLICE with a declared stake** — make the whole shape
work systematically (context naming + binder annotation + intra-type rename), verified at the
ORACLE on a SAMPLE of the 240, not against `str_hyp` alone. ⛔ Not more one-off fixes.

### ⚠️ str_hyp — FOUR fixes, NO movement. The class is real; the METHOD was wrong.
Applied in sequence, each locally correct, none closing it: widened the ARMCTX rewrite for
`[_, x1, x2 |-`; annotated pattern binders from the SCRUTINEE's context (available before the
checkinhole call, unlike the arm hole's); fixed `#(…)`/`$(…)` sigil mis-parsing; renamed
earlier binder names INSIDE later binder types (`hz : hyp z C[]` -> `x2 : hyp x1 C[]`, since
`z` is not bound in the new pattern). Calls moved 76 -> 197 -> 183; `closed` never.
⛔ **This is the per-shape slog the mandate forbids, on a SINGLE TARGET.** Four principled
fixes with zero conversion is the signal to re-scope, not to try a fifth.
⭐ **Before resuming, get the DENOMINATOR:** how many of the 850 need a destructuring `let` at
all? If it is a handful, `str_hyp` is a tail target and the control should simply be widened
past it. If it is a large class, it earns a proper slice with a stake. **Measure the class
before writing more code for it** — that is exactly what [[feedback-optimize-mass-not-tail]]
demands and what I stopped doing here.

### str_hyp — the THIRD `let` shape, still open
Its proof is one `let` DESTRUCTURING AN INPUT (not binding a call):
`fn h => let [g, z:name, hz: hyp z C[] |- H[..]] = h in [g |- H]`. `%:split` produces exactly
that shape — `let [_, x1, x2 |- #p.2[..]] = Y in ?` — so R6 is the right rule and it fires
(`case: 3`). ✅ Widened the ARMCTX rewrite to `/\[\s*_\s*(?=[,|])/` since `_` is NOT always
flush against the turnstile here. ⛔ Still no proof: the binders `x1, x2` remain UNANNOTATED
and `annotate()` can only supply types it can read off the goal, which fails for this shape.
**Next: get the binder types from the ARM HOLE's report (as the arm-context fix does) rather
than from the goal.**

## (resolved, wrongly) THE CHECKER REJECTS THE COMPLETED TERM
With the instrument repaired and skip-tracing on BOTH skip sites (`SKIP-cycle` / `SKIP-seen`):
- The completed term **IS formed and entered** — `D⅋ lv225 l…` in the trace is VERBOSE's
  60-char truncation of `[ |- D⅋ lv225 lv226]`. ⚠️ That truncation is why an earlier
  `grep "D⅋ lv[0-9]* lv[0-9]*"` found nothing and I concluded it was never built.
- It is **not** skipped: the only skips at that hole are `SKIP-cycle lv225 … D⅋ lv225 lv225`,
  which is the cycle check working correctly (lv225 three times).
- It is **not** rejected by the certificate: `decRej` lists 6 terms, none of them this one.
⇒ **The only remaining possibility is that `%:checkinhole` does not accept it.** That is a
different class of problem from everything chased so far (all six attributions were about
whether the term gets REACHED; this is about whether it TYPES).
**Next: ask the oracle directly for its error on that exact term** — `ci-ask`-style at the arm
hole, spelled `let [ |- v1] = dual_sym [ |- X4] in let [ |- v2] = dual_sym [ |- X5] in
[ |- D⅋ v1 v2]`. The author's own term types (`let-probe.mjs` control, OK 0), so the
difference between ours and the author's is now a two-line diff, not a search question.

## ⛔ SIX FALSIFIED ATTRIBUTIONS ON `dual_sym` — all about REACHING, none about TYPING
Falsified, each by one measurement: **ordering** (self-call bound, fair division) ·
**scope** (Delta holds `X4,X5,lv225,lv226`) · **budget** (`ARMSHARE=full`: 235 vs 241) ·
**emission** (the correct chain IS generated) · **per-candidate cap** (`CANDCAP` 12/200/2000:
251/298/298) · **depth** (22 vs 60: byte-identical 251).

⭐ **The state is now known exactly.** With the instrument fixed, the dump shows `build`
ENTERS the hole `... in [ |- (D⅋ lv225 ?)]`, that `candidatesFor` returns **`lv226` FIRST**,
and that the goal there is `dual "i3 "i2` — i.e. **the completed author proof
`[ |- D⅋ lv225 lv226]` is one candidate away** — yet that term never appears in any trace.
The only code that can skip a candidate is the CYCLE CHECK or `seen`; `DIAG.cycleSkip` and
`DIAG.seenSkip` are already wired. **Print those two counters at that hole. That is the whole
remaining question.**

## (resolved) PICK UP HERE — FIX THE INSTRUMENT FIRST
`LS3_DUMPLET` fired correctly when its condition was `CANDS.some(c => /^\s*let/.test(c))`
(dumping at the ARM hole). After I changed it to `/let/.test(term)` — meaning "any hole
sitting UNDER a let" — it emits **nothing at all**, on a run where `fire.let = 390` and
`acc.let = 3` prove let-terms are built. So either `build` is not re-entered with those terms
(despite the candidate loop calling it) or `info` comes back null there.
⛔ **Do not read anything into `dual_sym`'s failure until the dump works again** — an
instrument that silently emits nothing is exactly the shape that produced the fake 0/36 A/B
earlier in this arc. Restore the old condition first, confirm it prints, then widen it.

## THE N-ARY `let` CHAIN — BUILT AND TAKEN. Stake STILL unmet, and the gap is now TINY.
Emitting the chain as ONE unit (one call per pattern-bound meta, in order — |SIBS| candidates,
not a product) works exactly as designed. Measured (`LS3_DUMPLET`):
```
(let [|- lv225] = dual_sym [|- X4] in let [|- lv226] = dual_sym [|- X5] in ?)
  -> ... in [ |- ?]
  -> ... in [ |- (D⅋ ? ?)]         cands=8  metas=X4,X5,lv225,lv226
```
**Both lets, the box, and the constructor are all reached, with both `lv` names in Delta.**
⛔ But `grep "D⅋ lv[0-9]* lv[0-9]*"` is **0** — neither hole is ever filled with them, and the
search exhausts at 251 calls. ⚠️ The SINGLE-let run did produce `D⅋ lv113 ?` (first slot
filled), so filling is possible; the chain configuration loses it.
⇒ **The whole proof is now one candidate-selection step away**, at an LF hole offering only
8 candidates with the answer in Delta. **Next: dump those 8.** Do not theorise — the last four
attributions (ordering, scope, budget, emission) were all wrong and each was settled by one
dump.

## ⭐⭐⭐ READ THE LIST — AND IT SETTLES IT (`LS3_DUMPLET=1`)
At the let-body hole of `dual_sym`:
```
hole=64  cands=54  lets=32  metas=X4,X5,lv113
   term: (let [|- lv113] = dual_sym [|- X4] in ?)
   let-cands: ... | let [|- lv170] = dual_sym [|- X5] in ?   <- EXACTLY the right candidate
```
**The correct second `let` IS generated, at the right hole, with the right meta.** And the
next dumps show the kill:
```
term: (let [|- lv113] = ... in [ |- ?])              lets=0
term: (let [|- lv113] = ... in [ |- (D⅋ lv113 ?)])   lets=0
```
⭐⭐ **ONCE THE SEARCH TAKES `[ |- ?]` IT IS INSIDE A BOX, AT LF LEVEL, WHERE `let` CANNOT BE
INTRODUCED** — `let` is a COMPUTATION-level former, so `lets=0` there is correct, not a bug.
The second `let` must precede the box, and that candidate is offered but never taken because
R3 (box intro) is explored first and the subtree `D⅋ lv113 ?` is a DEAD END that can never be
completed from inside the box. ✅ Note `D⅋ lv113 ?` also proves R7 finds let-bound names.

⇒ **This is a REAL structural fact, not a budget or ordering accident: a `let` chain must be
built to its full depth BEFORE the box is introduced, because entering the box is
irreversible for `let`.** The n-ary shape (`n` recursive results feeding one LF constructor
with `n` args) needs `n` lets emitted as a UNIT — which is [[composite-moves-are-atomic]]
arriving with a named count: count the constructor's arity at the goal, emit that many lets.

⛔⛔ **BUDGET WAS NOT THE BLOCKER — hypothesis FALSIFIED.**
`LS3_ARMSHARE=full` gives each arm the ENTIRE remaining budget, removing the per-arm divisor
outright. Measured on `dual_sym` at 8000 calls: **235 (divisor on) vs 241 (divisor off)** —
essentially identical, and both exhaust far below the cap. So the space is genuinely
EXHAUSTED at ~240 calls with neither scope nor budget responsible.

⇒ **THREE ATTRIBUTIONS IN A ROW WERE WRONG** (ordering, then scope, then budget), each
plausible and each falsified by one cheap measurement. ⛔ **Stop attributing.** The remaining
fact is narrow and checkable: **a nested `let` is never GENERATED** (0 across every run), at a
hole where `info.metas` demonstrably holds `Dl`, `Dr` and `l`. The next step is to dump
`candidatesFor`'s output AT a let-body hole and see whether a `let` is in the list at all —
if it is not, the bug is in R-LET's emission path; if it is, it is being skipped, and the
`seen` key / cycle check are the only things that can skip it. **Read the list; do not
theorise about it.**

## (superseded) THE BLOCKER: no nested `let` is ever generated
Measured across a 3x budget sweep (`calls` 4000/12000 x `CANDCAP` 12/40): calls PLATEAU at
195-279 and `grep -c "let \[.*let \["` is **0** in every run. The space is EXHAUSTED, not the
budget — so this is neither ordering nor starvation. **R-LET simply does not emit at the
let-BODY hole.** Its guard needs `info.metas` non-empty, and that hole reports `vars[]`, so
the arm's pattern metas (`X4`, `X5`) are probably not in ITS Delta under the name we look for.
⭐ Same shape as the arm-context bug that unlocked `lin_name_must_appear`: **the names we need
exist but are not visible where we look.** Check the let-body hole's raw `%:printhole` first —
that is a 10-minute question, not a design one.

## ⛔ WHERE `dual_sym` STILL STOPS (stake UNMET)
The search reaches `let lv1 = dual_sym [|- X4] in [ |- D⅋ ? ?]` and then cannot fill either
hole: the arm needs `let lv1 = … in let lv2 = dual_sym [|- X5] in [ |- D⅋ lv1 lv2]`, i.e. the
SECOND `let` must precede the constructor. That path is in the language and reachable (all
three steps verified `OK 0` in `let-chain.mjs`); the DFS simply commits to the constructor
first. **Next: bias nothing — instead check whether fair division at the LET BODY hole (where
constructor vs second-let compete) already reaches it with a larger budget, before touching
order.**

## (superseded) R5's bare self-call regress eats the arm first
`fire.let 116 / acc.let 1`, and the accepted lets appear only as
`dual_sym (dual_sym (let [|- lv57] = dual_sym [|- X4] in ?))` — buried under a self-call
regress. R5's bare `f ?` is ordered before R-LET, so its subtree consumes the arm's budget
before R-LET is tried at the arm's TOP level, and ARM 76 stays UNSOLVED.
⭐ **Same failure mode as the context-ordering bug that unlocked `lin_name_must_appear`:** a
wrong candidate's subtree eats the budget before the right one is reached. There, the fix was
principled (a meta's OWN context is the one to pass it in). Here the analogous principle is
that **only R-LET and R5's boxed form can produce a DECREASING argument** — `decCertified`
already knows a bare `f ?` can close only if the hole becomes a pattern meta — so generation
could consult the certificate instead of leaving it to acceptance. ⚠️ Ordering has 22 measured
negatives; declare a stake first.

## R-LET — NOW FIRING (116 emitted, 1 accepted). Stake still UNMET, but the null is real now.
⛔⛔ **THE BUG THAT HID IT, AND IT IS THE MOST REUSABLE THING HERE.** R6's split-depth bound
was written `if (splitDepth >= SPLITMAX) return out;` — **a `return` out of `candidatesFor`
itself.** Since R6 is emitted BEFORE R11 (substitution), `impossible` and R-LET, that
silently disabled all three at every hole INSIDE AN ARM — exactly where they are needed.
R-LET reported `fire.let = 0` while `dual_sym`'s arm hole demonstrably held the metas it
wants (`metas=[X4: X5:]`). ⭐ **A bound on ONE rule must never short-circuit the rule SET.**
After the fix: `fire.let 0 -> 116`, `acc.let 1`.

**Where `dual_sym` now stands:** arms 1-2 SOLVE (`[ |- D⊥]`, `[ |- D1]`); arm 3 (`D⊗ Dl Dr`)
does not. It needs a THREE-PIECE chain at one arm —
`let [ |- l] = dual_sym [ |- Dl] in let [ |- r] = dual_sym [ |- Dr] in [ |- Dpar l r]` —
i.e. a `let`, a NESTED `let`, then a constructor over BOTH bound names. R-LET supplies the
first and the body is refinable, so the chain IS in the generated language; it is not being
completed. ⚠️ [[composite-moves-are-atomic]] applies: count these three before tuning.

## (superseded) R-LET first build — wired but not firing
`LS3_LET=1`. Scrutinee ENUMERATED from {self+siblings} x {pattern-bound metas} x {contexts},
body REFINED — exactly what the position matrix prescribes. **Stake was: `dual_sym` must
synthesise and declaration-verify. UNMET — `fire.let = 0`, so the null is uninterpretable.**
- ⛔ **Bug 1 (fixed): referenced R5's `ctxs`, which is `const`-scoped INSIDE the `!info.lf`
  block.** It never threw only because the meta loop was empty wherever it ran. Made
  self-contained.
- ⛔ **Bug 2 (OPEN, the pickup point).** Firing counter: `letCalls 33, letLf 29, letMetas 44,
  letSibs 14` — **29 of 33 evaluations are at LF holes**, where R-LET rightly skips, because
  the search spends nearly all its time INSIDE BOXES. Only 4 reach a computation-level hole
  and those had no metas in scope. The rule is offered in the wrong places, not worthless.
  ⇒ Investigate: does `solveArms` reach the arm holes of `dual_sym` at all (`fire.case 3`,
  `acc.case 3`, but arms may fail before `candidatesFor`)? And should R-LET also be offered
  when an LF goal's closure needs an unboxed computation — i.e. one level UP from the box.
⭐ **Standing method note, third time it has paid: a component that never fires cannot be
  distinguished from one that is worthless.** Check the firing counter BEFORE reading any A/B.

## ⭐⭐⭐⭐⭐ THE FORMER POSITION MATRIX — classify BEFORE building (`former-matrix.mjs`)
Three sessions each ended by discovering a former is not refinable, one per session, each
costing a build-measure cycle. This classifies them all in ONE pass, every row carrying its
own FULLY-SPELLED positive control (without which a null is meaningless — that confound gave
three fake nulls in `subst-refine.mjs` and a false soundness verdict in `imposs-sound.mjs`).

| former | verdict |
|---|---|
| R3 box · R9 LF app · R8 LF lambda · R4 ctype ctor · R5 self/sibling call | ✅ REFINABLE |
| **`let` BODY** | ✅ **REFINABLE** |
| tuple/paren · substitution-on-a-meta · block projection `#p.1` | ✅ REFINABLE |
| ContextApplication `[Psi]` | ⛔ ENUMERATE (finite: `.`, each psi in Delta, extensions) |
| **`let` SCRUTINEE** · `impossible` ARGUMENT · ascription `e : tau` | ⛔ SYNTHESIS-ONLY |

⭐⭐ **`let`'s BODY is refinable — only its SCRUTINEE is not.** So the hybrid is minimal:
enumerate the scrutinee from the finite pool (siblings x pattern-bound metas x contexts),
then refine the body normally. No new machinery beyond the enumeration.
⚠️ All three synthesis-only cases fail as **`reconstruct.ml:1194 Pattern matching failed`** —
an INTERNAL CRASH, not a clean type error (same signature entry 69.1 saw for `f ?` with an
undetermined context). A search must read that as NOT-APPLICABLE, never as "wrong candidate".
⚠️ The R6 row reads SETUP BROKEN — a bad control in the probe (`?` inside a pattern), not a
finding; R6 is verified refinable in entry 74.

## ⭐⭐⭐⭐ WHY THE OTHER FIVE CONTROLS FIND NOTHING: THE `let` FORMER, AND IT IS NOT REFINABLE
Author proofs of the failing controls:
```
str_hyp:  fn h => let [g, z:name, hz: hyp z C[] |- H[..]] = h in [g |- H]
dual_sym: ... => let [ |- l] = dual_sym [ |- Dl] in let [ |- r] = dual_sym [ |- Dr] in [ |- Dpar l r]
eq_refl:  ... => let [g |- D1] = eq_refl [g] [g |- M1] in ... [g |- eq_app D1 D2]
```
**3 of 5 need `let`, and not as convenience: a recursive call returns a BOXED COMPUTATION and
a computation cannot sit inside an LF term, so `let [Psi |- x] = <call> in …` is the UNBOXING
idiom.** No proof whose recursive result feeds an LF constructor is expressible without it.

⭐ **CORRECTION TO ENTRY 41c** ("the let-then-use spelling is checker-dead, so the call MUST
be built inline") — that was measured on the OLD closed-term engine. `%:checkinhole` accepts a
fully-spelled `let … in …` (**OK 0** on the author-style whole proof). It is not checker-dead.

⛔⛔ **BUT `let` IS NOT REFINABLE** (`let-probe.mjs`):
```
let [ |- l] = dsym [ |- ?] in ?   -> FAIL "Expression is not closed"
let [ |- l] = dsym ?       in ?   -> FAIL "Expression is not closed"
let [ |- ?] = ?            in ?   -> FAIL "Labellable holes may not appear as contextual LF terms"
```
A `let`'s bound expression sits in **SYNTHESIS position** (its type must be inferred to type
the pattern), so a hole is illegal there. ⇒ **THIRD INSTANCE OF THE SAME LAW — refinement
reaches CHECKABLE positions only** (`impossible`'s argument, substitution's unification-
determined slots, now `let`'s scrutinee). **Check this for every former before building it.**

⭐ **THE WAY THROUGH — hybrid, and finite.** The `let` scrutinee must be CLOSED, but its space
is tiny and enumerable: a sibling/self call applied to PATTERN-BOUND METAS, which the arm
already names (`dsym [ |- Dl]`). So REFINE everywhere except `let` scrutinees, and ENUMERATE
those from the finite pool (siblings x pattern metas x contexts). Not a per-shape rule — the
pool is fixed by the rule set. **This is the next slice; declare a stake.**

## ⭐⭐⭐⭐⭐ FIRST DECLARATION-VERIFIED WHOLE-PROOF SYNTHESIS (2026-08-25)
`cp.cfg#lin_name_must_appear`: **64 checker calls, 720 chars, 9-arm case tree, PASS with
`/ total /` RESTORED** — Beluga's own coverage and termination checks accept it. Nothing was
handed over: intro, case tree and every leaf came from the theorem's type.
**Six-target positive control (targets the OLD engine completes): proofs found 2/6,
DECLARATION-VERIFIED 1/6.** The other four honestly find nothing; `dual_uniq` finds a wrong
term that fails type-checking. ⛔ Ledger unchanged at 273/850 — this is a control, not corpus.

### ⛔⛔ A SOUNDNESS HOLE I INTRODUCED, AND THE REPAIR
`decCertified`'s first cut matched only self-calls with BRACKETED arguments, so a call on a
plain `fn`-bound input escaped the certificate **entirely**. Three control targets "closed"
with `fn v0 => dual_sym v0` and `fn v0 => fn v1 => dual_uniq v0 v1` — the theorem applied to
its own untouched inputs, the purest circular proof. **An argument may be a box, a
parenthesised term, OR a bare name, and all three must face the check.** After repair those
three correctly report *no proof found*. ⇒ **Whenever a guard is written as a regex over
emitted text, enumerate every SYNTACTIC FORM the guarded construct can take** — this is the
same failure shape as the `impossible` soundness control (one type shape tested, three
existed).

### ⛔ A HARNESS TRAP THAT LOOKED EXACTLY LIKE A REAL DEFECT
`emit` truncated `found` to **200 chars**. A leaf term fits; a WHOLE-PROOF body does not, and
the truncated string went into declaration verification, which rejected it with a **parse
error** (*"Expected the token `fn', but got `)'"*) that read precisely like an emitted-syntax
bug — and would have sent the next session hunting parenthesisation. **The proof was never
the problem; the REPORT was.** Check the length of anything you verify.

### ⭐⭐⭐⭐⭐ THE AUTHOR'S PROOF, SYNTHESISED FROM THE TYPE ALONE — 64 CALLS
`lin_name_must_appear`, `--whole`, R6 + certificate + cycle check + meta-contexts-first:
```
fn v0 => case v0 of
| [g0 |- l_pcomp1 (\x. X3)] => lin_name_must_appear [g0, x : name |- X3]
| [g0 |- l_pcomp2 (\x. X3)] => lin_name_must_appear [g0, x : name |- X3]
| [g0 |- l_wait2 X2]        => ...                              (9 arms)
```
**Structurally identical to the author's proof** (`| [g ⊢ l_wait2 linQ] ⇒
lin_name_must_appear [g ⊢ linQ] | [g ⊢ l_out2 (\y. linQ)] ⇒ …[g, y:name ⊢ …]`) — recursion on
the pattern-bound SUBDERIVATION in the EXTENDED context. Intro, coverage-generated case tree
and all nine leaves, from the theorem's type alone, in **64 checker calls**.

⛔ **BUT IT DOES NOT VERIFY — and the reason is a PARSE error, not a semantic one:**
`Error: Failed to parse (mutual) recursive function declaration(s). Expected the token 'fn',
but got the token ')'`. Same theme as every other defect in this arc: **`%:checkinhole`
accepts text the DECLARATION parser rejects.** Suspect the doubled parens `((…))` that
`solveArms` adds on top of already-parenthesised arm terms, and the outer `(fn …)` wrapper.
**Fix the emitted syntax, re-verify, then run the six-target control.** Instrument:
`whole-verify.mjs` (splices the whole BODY, restores `/ total /`, reloads — `ls3-verify`
assumes a LEAF and cannot be used here).

### THE FOUR CHANGES THAT GOT IT THERE (all measured, leaf mode 5 calls throughout)
1. **`seen` keyed by HOLE** — a dedup sound for one path is UNSOUND across independent
   subproblems. 7/9 arms → complete assembly.
2. **Ancestor path threaded** — arms start from `?`, so path-derived bounds were invisible
   inside them. calls 1200 → 119.
3. **Cycle check on a repeated head** (entry 70.6's "standard answer", stake declared): the
   wrong-context candidate `f [g0 |- ?]` sank the arm's whole budget into a 93-deep
   `l_pcomp1 (\x. (l_pcomp1 …))` regress. 68 skips, no leaf-mode loss.
4. ⭐ **Meta contexts BEFORE bare context variables** — not a ranking: the context a meta
   LIVES IN is the context to pass it in. Δ held both `X3 : (g0, x : name |- …)` and bare
   `g0`; trying `[g0 |- ?]` first was simply the wrong type. calls 270 → 96 → 64.

### ✅ THE CONSTRUCTED TERMINATION CERTIFICATE — BUILT (entry 74.5 piece 4), AND IT WORKS
`decCertified(term, anc)`: **because R6 BUILDS the case tree, every meta bound by an arm's
PATTERN is a structural subterm of that arm's scrutinee BY CONSTRUCTION** — no source walk
(`decSubderivNames` needs source and may only say YES), no under-approximation, no checker
call. A self-call is admissible iff its argument is such a meta, spelled **BARE**:
- `[g0 |- X3]` — bare pattern meta → SMALLER, admissible.
- `[g0 |- (l_pcomp1 (\x. X3))]` — constructor application → REBUILDS the scrutinee. This is
  exactly the circular close strict rejected, and the old `circularSelfCall` misses it
  (entry 69.5: caught 2 of 12).
✅ **Measured: `strictRejects` 1 → 0.** The circular close is now rejected at acceptance time
for free, instead of after a whole program load. Leaf mode regression-free (5 calls).

### ⛔ WHERE IT STOPS, precisely (this is the pickup point)
With the certificate on, the AS-PRINTED arm variant reached **9/9 arms solved in the SOUND
bare-meta form** (`[z, x : name |- X3]`) — but that variant's patterns are `[_ |- …]`, so its
arms bind NO context name and their bodies spell heads Beluga invented per-hole, which are
unbound in the assembled term. **That variant can never assemble**, so R6 now emits ONLY the
`g0`-named form when split prints `_`.
⛔ **The named variant's FIRST arm then fails**, and the oracle says it should not:
```
OK 1  lin_name_must_appear [g0, x : name |- ?]
      subgoal: linear (\x1. ?P_5549[^0][.., x])   vars=[X3]
```
`lin_name_must_appear [g0, x : name |- X3]` is ONE STEP away, the prefix types, the oracle
NAMES `X3` — and the arm still reports UNSOLVED after ~270 calls. **The candidate is
generated, valid, and not taken.** Suspects, in order: the per-arm `cap` being consumed by
candidate 3's subtree (`[g0 |- ?]`, which is ill-typed since X3 lives in `g0, x : name`);
`decCertified` rejecting it (hand-traced as passing — verify); the hole-keyed `seen`.
**Start here — it is bounded and instrumented (`LS3_VERBOSE` prints offered candidates plus
the oracle's verdict on each at any unsolved arm).**

### ⭐⭐⭐ FIRST WHOLE-PROOF ASSEMBLY EVER — AND IT IS CIRCULAR. STRICT CAUGHT IT.
`lin_name_must_appear`, `--whole`, 172 calls: the search built a COMPLETE 9-arm case tree
from the theorem's type alone — intro, coverage-generated patterns, every arm filled. **The
first time this project has assembled a whole proof.** ⛔ **And it is a FALSE PROOF:** the arm
bodies call the theorem on the arm's own RECONSTRUCTED SCRUTINEE
(`lin_name_must_appear [g0 |- (l_pcomp1 (\x. X3))]`) rather than on the sub-derivation `X3`,
and arm 2's body does not even match arm 2's pattern. **`LS3_STRICT` REJECTED it**
(strictChecks=1, strictRejects=1) and nothing sound was found afterwards within budget.
⇒ Report as: structure synthesis now REACHES a complete proof; soundness is the gap.
⭐ **THE BINDING CONSTRAINT IS NOW ENTRY 74.5's PIECE 4, still unbuilt** — the constructed
termination certificate. Because R6 BUILDS the tree, the arm's pattern-bound metas are
structurally smaller than the scrutinee BY CONSTRUCTION, so a self-call is admissible iff its
argument is one of them. That rejects the circular candidate at GENERATION time instead of
after a costly reload, and it is principled, not a ranking. **Build this next.**

### THREE BUGS THE PER-ARM RESTRUCTURE INTRODUCED (all mine, all found by tracing)
1. ⛔⛔ **`seen` MUST BE KEYED BY HOLE.** Before per-arm solving, every term was a WHOLE-BODY
   string, so a term identified a path uniquely and a global `seen` was sound. Solving arms at
   their own holes collapses that — each arm starts from `?` and explores the SAME small term
   space, so `lin_name_must_appear [g0 |- ?]` tried in arm 1 SILENTLY SUPPRESSED it in arm 3,
   where it was the answer (the oracle named `X2` in the very next subgoal). **A dedup sound
   for one path is UNSOUND across independent subproblems.** This single fix took the target
   from 7/9 arms to a complete assembly.
2. ⛔ **Path-derived bounds die when the term is reset.** Both inversion bounds read the path
   off the partial term; arms start from `?`, so the enclosing case was invisible and neither
   bound fired inside arms (hole ids ran to 386). Fixed by threading ANCESTOR text explicitly:
   calls 1200 → 119, arm attempts 60 → 11.
3. ⛔ **Arms must be excluded from the whole-body strict gate** — an arm's term is not a
   declaration body; splicing it rejects every arm.

### PER-ARM INDEPENDENT SOLVING — BUILT, WORKS AT THE ARM LEVEL
`ask`/`build` are now parameterised by HOLE (every prior call typed the whole term against
hole 0, which is *why* arms were one conjunctive path AND why the arm context name was
unusable). `solveArms` solves each arm at its OWN hole and assembles.
- ✅ **Arms solve individually, with the author's own shapes**:
  `ARM 18 -> lin_name_must_appear [g0, x : name |- X3]`.
- ✅ **Per-arm BUDGET allocation** — a shared cap let arm 1 spend everything and left arms
  4-9 UNSOLVED. Allocation across independent subproblems, not a budget increase.
- ✅ **Arms must be excluded from the strict whole-body gate** — an arm's term is not a
  declaration body, so splice+`/ total /`+reload is meaningless on it and rejects every arm.
- ⛔ **Whole proof still 0.** Measured on `lin_name_must_appear`: 60 arm attempts, 10 solved,
  **best consecutive run 7 of the 9 needed**.
- ⛔ **THE NAMED REMAINING DEFECT — the invented-head translation is unreliable.** An arm
  solved at its own hole spells the context with the head Beluga invented there
  (`[z, x : name |- X3]`); the assembled term's pattern binds `g0`, so it breaks on splice.
  Current code takes the FIRST meta's context head, which is wrong when an arm's metas
  disagree or it has no context variable at all. **Fix this before anything else** — it is
  the last thing between per-arm solving and a closed whole proof on the control.
- ✅ Leaf mode is regression-free throughout (`lin_name_must_appear` 5 calls, entry 69's value).

- ⭐⭐ **THE IDEA BEHIND IT (kept): CASE ARMS ARE INDEPENDENT SUBGOALS.** The
  DFS treats a 9-arm case as ONE conjunctive path — fills arms 1–8, fails on 9, backtracks
  through everything. Solving each arm as its OWN search is LINEAR in the arms, not
  exponential. ⛔ Not candidate control: independence is a property of the RULE. Declare a
  stake first.

## ⭐⭐ STROKE 2 — structure is INVERTED, not searched
Case-analysis on a hypothesis is an **invertible** rule: splitting never loses provability.
So under a focused discipline you split everything splittable eagerly and **the case tree is
DETERMINED, not chosen.** Entry 59's "structure 0/45" measured the cost of handing over
something that was never a decision (and handed it to the old closed-term engine).
- ⭐ **The totality measure becomes an OUTPUT: it is read off WHICH argument we split.**
  That defuses [[orca-infer-totality]]'s worry — no guessing.
- ⭐ **Termination gets EASIER:** when we build the tree, every pattern variable in an arm
  is a subterm of that arm's scrutinee BY CONSTRUCTION — exact, unlike `decSubderivNames`
  (source-walking, may only say YES, entry 71.2). Replaces `circularSelfCall` (caught 2/12).
- ⚠️ **GENUINELY OPEN:** bounding the inversion phase (splitting is invertible but
  unbounded). "Split each hypothesis once per branch" is a guess. **Read Harpoon's own
  `auto` first — it is in the tree and had to solve this.**

## ⭐ STROKE 3 — forward SATURATION of the context
Backward-from-goal is the only direction ever run. Γ/Δ are small and concrete; saturating
them under application to depth 2–3 is cheap and involves **no choice**. R7 generalizes from
"is the goal a variable in scope" to "is the goal in the saturated closure". ⛔ Not in the
refuted ledger — all 22 negatives were candidate CONTROL at a hole; this is a deterministic
PHASE, and it is generation. ⚠️ Cost is the risk: every step is a checker round-trip.

## The architecture (ORCA-F) — one nondeterministic choice
`INVERT (deterministic) → SATURATE (deterministic) → FOCUS (the only choice)`.
Focus head = one whose **CONCLUSION** matches the goal. ⭐ **`Variables of this type` is the
DEPTH-0 case of that filter** — and depth-0 alone took entry 69 from 2/5 to 56/75. Compute
depth-n by stripping Π/→ off the printed type (`leadingPiBinder`/`topLevelArrow` already
exist). Search depth becomes the number of FOCUSING PHASES (~5–8), not tokens.
⭐ `docs/prover-master-plan.md` §0 + Phase D named exactly this ("the focusing rewrite…the
heart of the doc", "the saturation database") and **it was never built.**

## ⛔⛔ STROKE 4 — THE INTEGRATION GAP nobody is counting
**Everything in entries 65–74 lives in `scratch/probes/`. The ledger's 273/850 is
`proveProgram`. The refinement engine has NEVER been wired into the engine.** So leaf
synthesis at 58/75 verified **could not move the corpus number by construction**. Whatever
the rule set becomes, in the scratchpad it is worth zero points. Treat integration as a
first-class piece of work, not plumbing.

## Why this may escape the nine zeros (stated narrowly)
Every one of the nine was a CAPABILITY handed to the old closed-term engine, or SEARCH
CONTROL. The only two things ever built that were genuinely missing **MOVES** in the
refinement engine gave the largest step in project history (entry 69, 2/5 → 56/75) and +1.
**Missing-move results here are bimodal, not uniformly zero.**

## Decided
⛔ **No external deep-research agent.** Entry 73 is the case study: it reasoned from papers
to "no incremental API exists" when `Unify.StdTrail` exports one and our shim already calls
it, and its remedy was refuted by an experiment run the day before. Context-free research
gives literature-shaped answers to source-shaped questions. (User concurred 2026-08-25.)


## From memory: `project_orca_r6_is_structure.md`

**Orca's "two halves" were never two problems.** `scratch/probes/leaf-synth3.mjs` implements
R1, R2, R3, R4, R5, R7, R8, R9 (+ opt-in R10) — every rule of entry 60.3 **except R6**,
`case s of | pat => ?`. **R6 IS the case tree, i.e. the "structure synthesis" half the
kickoff called never attacked.** Master-plan **entry 74** (2026-08-24).

## What is VERIFIED (primitive, at the source — mandate §4)
- `%:checkinhole` elaborates a `case` whose **arms are holes**, returns one SUBGOAL per arm,
  and reports each arm **in its pattern-extended context** (the pattern variable is in scope).
- `%:split H V` supplies the patterns **from coverage** — so nothing is invented.
- **Refinement NESTS**: an arm hole can be split again; depth-2 arms come back correctly typed.
- ⭐⭐ **The durable finding.** Split generates, and checkinhole accepts, the exact apparatus
  [[orca-one-open-question]]/entry 72.2 said Orca has **zero formation rules** for:
  `case m of | [g |- #p] => ? | ...` and `case [g] of | [] => ? | [g, x : nat] => ?`.
  Arm holes come back with `#p : #(g |- nat)` bound and the context variable eliminated in one
  arm / extended in the other. ⇒ **In PATTERN position the contextual layer is GENERATED BY
  COVERAGE** — a third option entry 72.5 missed (it offered only "solved by unification" vs
  "guessed by search").

## Corpus contract (40 residue + 40 control from the 273 COMPLETE)
≥1 split round-trips: **residue 69.2% vs control 77.5% — lift 0.89×** (near parity, so R6 is
not selectively broken on the residue). Context-variable splits: residue 29 vs control 16 =
**1.8×**. ⛔ **A COMPONENT CONTRACT, NOT A PAYLOAD** — nothing consumes it; seven prior reach
numbers converted zero ([[orca-refinement-ceiling]]). Never quote 69.2% as a result.

## ⚠️ It re-reads entry 70.4's "13% ceiling"
That composition test handed a perfect structure oracle to a search **with no R6**, so a leaf
itself needing a nested case (21% of residue proofs) was unclosable. **13% bounds the composed
design WITHOUT the case rule, not the composed design.**

## Traps found (all mis-emitted text, all the ORACLE's)
- ⛔ `%:split` prints context binders **without their type** (`[g, x1 |- #p[..]]`) and
  `checkinhole` parses only annotated ones. Bites at **depth ≥2 only** (once a split has
  extended the context) — 0 hits at depth 1. Fix = BelJar-side transform reading the type off
  the hole's own `Goal:` line; **skip the context VARIABLE** (annotating it fails identically).
- ⛔ `checkinhole` does **NOT enforce coverage** — a one-arm `case` on a two-constructor type
  returns `OK`. **Exhaustiveness is OURS**, exactly like termination
  ([[engine-can-bank-false-proofs]]). Use split's full arm list; never subset it.
- Split can print **`FREE Var 1`**, which is not Beluga syntax at all.
- ✅ The JS command channel **is UTF-8 clean** (`uni-probe.mjs`) — do not re-suspect it.

## Next: 5 pieces, one toggle (entry 74.5-74.6)
hole-id threading · R6 generation + the annotation transform · coverage preservation ·
**termination** (⭐ easier under R6: because we build the tree, the structural-subterm relation
is exact BY CONSTRUCTION, replacing `decSubderivNames`' source-walk, which may only say YES) ·
whole-body verification with `/ total /` restored. **STAKE ≥8/30 residue declaration-verified
with structure NO LONGER handed over; KILL <5/30 or any control loss.**
[[composite-moves-are-atomic]] — all five or don't start.


## From memory: `project_orca_refinement_ceiling.md`

# What the refinement arc measured

⚠️ **READ THIS FIRST (2026-08-23).** Everything below was measured with a rule set now known
to be incomplete (the contextual layer had no formation rules) and with **structure synthesis
never attempted**. The numbers are real; the word "ceiling" that used to head this file was an
INTERPRETATION and it was wrong to state as a bound. The target is 100%
([[harpoon-auto-baseline]] shows the real incumbent is ~16%, not the ~40% that was cited).
**Use this file to avoid rebuilding a refuted mechanism, never to conclude the problem is
closed.**

The 2026-08-22 arc built the leaf half of hole-directed refinement
([[refinement-primitive-laws]]) and then measured the composed design end to end.

## The ceiling (master plan entry 70.4)

`ls3-whole.mjs` splices the author's own prefix(maxDepth-1) — induction, case tree,
contexts, bound hypotheses all HANDED OVER free — synthesises **every** leaf with the
search (each leaf filled with our own term before the next is attempted, because leaves
share metavariables), then reloads the whole declaration with **`/ total /` restored**:

| whole-target composition | solved control | **residue** |
|---|---|---|
| declaration verifies | 55 / 73 (75.3%) | **3 / 23 (13.0%)** |

⚠️ **In this setup — the most generous one tried so far — it converts 13%** of entry 61's hardest
class. Against the 494-target residue that is ≈64 targets ≈ **+7.5 points of corpus** — and
it is gated on structure synthesis, which entry 59 measured at **0/45**. The second half — structure synthesis — has been measured
once (0/45) and is otherwise UNTOUCHED. That is the open frontier, not a dead end.

⭐ **So: know this number before proposing another LEAF mechanism.**
The leaf half genuinely works — 75.3% on the control, and below entry 61b's ~10-token cliff
leaf synthesis is essentially solved. The structure half is simply not built yet.

## Where it actually dies: TERMINATION, 13 of 14

Of the targets that closed EVERY leaf and still failed the declaration, **13 of 14 failed
for "Recursive call"** — the search closes a leaf with `complete ms`, `nbe t`, `idLogSub r`
and Beluga rejects the whole declaration. Not typing, not coverage, not writability.

This is [[feedback-engine-can-bank-false-proofs]] by a third independent route, and mandate
§7 is explicit that termination is OUR invariant. It was the largest NAMED defect in the arc
— and the section below records what happened when it was actually fixed. The crude in-search
guard (refuse a self-call whose args are all top-level inputs) catches only 2 of 12, because
a pattern-bound argument can still fail to decrease on the MEASURED position.

## ⛔ The termination failures are NOT recoverable targets (entry 71)

The natural reading of "13 of 14 near-misses die on TERMINATION" is that 14 targets are one
mechanism away. **That reading is wrong and was measured wrong.** `LS3_STRICT` makes Beluga
rule on every candidate close (splice it in, restore `/ total /`, reload), so a circular close
is rejected and the search continues. Result: **+1 gain over 111 leaves** (control
`unique_eval`, which then finds the author's own term; residue **+0**).

⭐ Rejecting a circular close mostly converts a FALSE close into an HONEST FAILURE. Those were
never near-misses — they were places the search had no right answer and was reporting a wrong
one. **Keep strict mode anyway**: its value is that no circular proof can be banked (mandate
§7), not its payload.

⛔ **`decSubderivNames` may only say YES.** The engine's own criterion is cheap and available
at a hole, but it UNDER-approximates by design (its `let`-inversion match needs a
bare-identifier RHS on one line — "a miss costs a candidate, never a wrong one"). The engine
uses it to ADMIT an IH call. Using it to REJECT inverts its safety direction and immediately
refused `multi_tps d1 [ |- S2]`, which Beluga verifies. Sound fast-accept only.

## Reach-without-payload, entries five and six

- **R1/R2/R8, the binder introduction rules** — genuinely absent, genuinely fire (the search
  builds `Slam (mlam h1 => (fn v0 => (fn v1 => ?)))`, the author's own skeleton), and
  measure **+1 gain / 0 losses over 111 leaves**. Keep them (the rule set is incomplete
  without them, they cost nothing) but they are not a payload mechanism.
- **Iterative deepening** — measured negative TWICE (entries 68, 69): 0 gains, 3–19× the
  calls. Do not try a third time.

Half the large-leaf wall is a GENERATION gap (no candidate applies at all), not budget —
`scratch/probes/gap-forms.mjs` names the missing former for each unclosed leaf. ⭐ Confirmed
2026-08-23: the same 13 leaves at **2× depth and 15× budget** gave 0 closes with
**byte-identical call counts** — the search runs out of CANDIDATES, never of time.

## ⭐⭐⭐ The likeliest reason the ceiling is where it is (entry 72, 2026-08-23)

Entry 60.3 declared the nine rules complete: *"they are the term grammar of Beluga … a tenth
rule would mean a tenth term former."* **That is false.** R1–R9 generate applications of NAMED
THINGS at the computation and LF term levels. Beluga's CONTEXTUAL layer — contexts (`Ψ, x:A`),
substitutions (`..`, `σ, M`, `$S`), parameter variables (`#p`, `#p.k`) and the placeholder `_`
— has its own formation rules, and Orca has **none of them**.

Controlled census (`scratch/probes/ctx-apparatus-census.mjs`): contextual apparatus appears in
**68% of unclosed residue leaves vs 7% of closed** (9.5× lift); bare `_` is 32% vs **0%**,
replicated on the solved control at 21% vs 0%. ⭐ This explains the ~10-token cliff
mechanically — small leaves are plain applications, large ones carry apparatus — and accounts
for all seven prior zeros with one mechanism.

⛔ **But the obvious first rule is ALREADY REFUTED.** `_` as a candidate (R10): residue 13→13
(0 gains), control 58→57 (**1 loss**), +52% / +112% checker calls. Reverted to opt-in.
⭐ **Why, and this is the lesson worth keeping:** `_` is not a search move — it is an
abbreviation the AUTHOR uses because reconstruction solves the object for them. Emitting it
does not REDUCE the goal, it DEFERS it to a solver the hole-local primitive cannot consult.
**A candidate the oracle cannot adjudicate is noise, not a move.** Refinement worked at the
term layer *because the checker adjudicates every step*; the contextual layer has no such
incremental adjudication. ⇒ **Solve it by unification, do not guess it by search.**
Direction doc: `docs/orca-research-brief-v4.md`. See [[refinement-primitive-laws]].

## ⛔⛔ The adjudication remedy is DEAD (entry 73, 2026-08-23)

A deep-research pass proposed that the deficit is not a missing rule but a missing cheap
**adjudication oracle** (per-step SOLVED / POSTPONED / FAILED). Built and refuted the same day:

- ⭐ The oracle IS reachable and cheap — `Unify.StdTrail.unresolvedGlobalCnstrs` etc. are
  exported and `src/web/beluga_web.ml` (inside the security boundary) already uses them.
  `ideAdjudicate` was added + rebuilt: **4–7 ms** vs ~3–5 s for a declaration reload.
- ⛔ **But it is the wrong oracle.** The constraint store tracks postponed UNIFICATION
  PROBLEMS, not undetermined METAVARIABLES. `[ |- _]` has no constraint at all, so it returns
  SOLVED; **POSTPONED never fired once.** Determinedness is decided by ABSTRACTION
  (`Abstract.exp`'s free-variable context), which needs a core-file edit.
- ⛔⛔ **The edit is not worth making.** Entry 72's R10 already ran the mechanism with a
  PERFECT oracle (declaration reload per close, `_` available at every hole): **residue 0
  gains, control 0 gains / 1 loss.** A perfect oracle converts nothing, so a cheap one changes
  cost, not outcome. **Adjudication was never the binding constraint.**

⚠️ Trap inherited: `run_command_status`'s boolean means "no exception ESCAPED", not "the
command succeeded" — `%:checkinhole` prints `FAIL …` without raising, so the first oracle
returned SOLVED for `__nonsense__`. Read the command's own output, never the escape flag.

✅ What survives from the research pass: the **determined/searched partition** (~90% of the
contextual apparatus is determined, only parameter-variable choice and rare schema witnesses
are searched) and the **ceiling argument** (Harpoon `auto` excludes exactly this apparatus;
Twelf cannot do logical relations; nobody reports corpus-scale automation on
POPLmark-reloaded). Both are in `docs/orca-research-brief-v4.md` §11.


## From memory: `project_orca_one_open_question.md`

## ⛔⛔⛔ 2026-08-20/21 — THREE CAPABILITIES, THREE ZEROS. AND ONE NEW LEAD.

An external research pass proposed **Scheme** (infer the induction + case tree + SCT
measure, commit globally, then let the existing filler do leaves). Rather than its own
REACH falsifier (which all three prior zeros would have PASSED), it was tested by handing
the engine a **PERFECT** scheme: the author's own pragma + intro + outermost case arms,
every arm body `?`. Master plan **entry 59**.

| capability handed to the engine | contract (verified ACTIVE) | payload |
|---|---|---|
| precision — know the slot's TYPE | 33.9% of slots sharpened | **0 / 45** |
| construction — BUILD the inhabitant | 1128 constructed candidates | **0 / 45** |
| **structure — the whole induction + case tree + measure** | 166 arms handed over, 45/45 changed | **0 / 45** |

Positive control 4/5 (spliced SOLVED targets still complete); 45/45 splices well-formed;
checks fell 26%. ⛔ **The damning detail: accepted steps went DOWN (198→112) and `no-move`
went UP (17→22) — and all 22 died at `steps = 0`.** Given the correct case tree the engine
proposes **nothing at all** at the author's first leaf.

⭐⭐ **THE RESIDUE IS NOT BLOCKED ON ANY SINGLE MISSING CAPABILITY.** That is strictly
stronger than any one null. ⛔ Do not commission a fourth "supply capability X" proposal
without a mechanism that explains all three zeros.

⭐ **THE NEW LEAD (entry 59c) — a DIFFERENT failure mode from the recorded one.** The death
census says 88% of deaths generate candidates and have them rejected. These generate an
EMPTY SET. Characterised over the 22: **8 substitution variables (`$S`), 7 parameter
variables (`#p`, `#p.1`), 8 checker-INVENTED `"`-prefixed names** (which the writability
guards refuse to spell by design, invariant 11). Those are the same three features the
published LFMTP-2023 tactic excludes — except this engine REACHES them and then has an
EMPTY IMAGE. Example goals: `Reduce [ |- A] [_ |- #p[$S[..]]]`,
`Howe_subst [] $[h1, x : term S[] |- ] $[h1, x : term S[] |- ]`.
⇒ Next question is **what the engine can SPELL at all**, not which capability is missing.
Ids `scratch/probes/os-zero-ids.txt`; instruments `scratch/probes/oracle-scheme-*.mjs`,
`os-zero-report.mjs`.

⚠ **Inherited-instrument law:** an external agent left the splice lib with a syntax error
in a final edit AFTER its control had run. **`node --check` anything you inherit.**

## ⛔⛔⛔ 2026-08-20 — THE UNIFIED-CORE HYPOTHESIS IS DEAD. GO TO DEEP RESEARCH.

**Claim tested:** the residue's fragments are N sites of ONE missing capability
(type-directed recursive construction), worth 20%+. **Built both halves and both measure
ZERO on a residue-wide sample.** Master plan entries 57, 57c, 58, 58b.

| | component contract | payload |
|---|---|---|
| **step 2** unifier (`prover-unify.mjs`, `UNIFY=1`) | 33.9% of ALL argument slots sharpened, 66.7% of targets | **0 gains / 45** (+5.5% checks, re-measured on corrected code) |
| **step 3** inhabiter (`prover-inhabit.mjs`, `INHABIT=1`) | fired on 35.7% of targets, **1128 constructed candidates** at 145 slots | **0 gains / 45** (+15.7% checks) |

Step 3's sample was drawn stride-wise from **all 494 IN-FRAGMENT residue targets** across
32 developments (coinductive + file-error rows excluded) — deliberately NOT the entry-56
ctype class, because a 20% claim must face the whole residue. Declared bar ≥9. Got 0.

⭐ **NOT a wiring null.** The candidates are real constructed terms no lookup pool could
produce: `RArr (\g'. \x. \N. \d. d)`, `(ctx_unrest_unr X)`, `(str_lin h)`,
`(eq1 [g |- X1])`. Over a thousand of them. Not one proof followed.

⛔⛔ **WHAT THIS REFRAMES.** Two independent capabilities — knowing a slot's TYPE and
BUILDING its inhabitant — both measure exactly zero. **The engine's problem is NOT that it
cannot name or build the right term at a hole.** That was the standing diagnosis behind
every entry since 44 ("the paying category is a missing move or mis-emitted text") and it
is now falsified twice at the residue. What remains by elimination is PROOF STRUCTURE
(which lemma, which induction, which scrutinee, in what order) — and
[[feedback-generation-pays-search-control-does-not]] records 22 measured failures on that
axis. **Nothing left in this architecture pays.** That is
`docs/orca-research-brief-v2.md` §1 confirmed by construction rather than by arithmetic.

⛔ **Any future proposal amounting to "generate better terms at the hole" is refuted by
MEASUREMENT, not by argument.** Feed both negatives to the deep-research effort (its
rubric §15/§6 demands exactly this).

⛔ **LAW: `decomposeContextual` is NOT a box test** (entry 58b). It reports a box for any
parenthesised type, because a meta type really is `(g |- A)` — so `(tm -> tm)` became the
bogus box `[ |- tm -> tm]` at every parenthesised argument slot, silently, and poisoned
step 2's first null. Use **`asBox`** (requires a real turnstile at depth 0). Found by a
positive control that could not fail for any legitimate reason.

⛔ **Do not re-run either as a payload experiment.** Both are measured zeros with their
component contracts verified ACTIVE. Opt-in, default inert, suite 209/210.

## ⛔⛔ 2026-08-20 — STEP 2 OF THE UNIFIED CORE IS BUILT, AND PRECISION IS NOT THE BOTTLENECK

`prover-unify.mjs` (opt-in `UNIFY=1`) — a real contextual-type unifier: binds index
metavariables **and context variables**, indices buried in context declarations, flexible
goals, and hidden implicit arguments (align from the RIGHT — `printImplicit` defaults
false). **Master plan entry 57 is the record.**

| measured DURING RUNS, 45 targets | first cut | + flexible goals & implicits |
|---|---|---|
| ctor applications where it binds | 20.2% | **44.5%** |
| argument slots SHARPENED | 15.6% | **33.9%** |
| targets with ≥1 slot sharpened | 33.3% | **66.7%** |

⛔ **A/B on top of the entry-56 composite: 0 gains, 0 losses, +13.3% checks.** A third of
all slots on two thirds of targets now carry the type the GOAL fixes instead of the type
the DECLARATION wrote, and not one extra proof follows. **Knowing the slot's type is not
what the engine was missing — checks went UP, so precision did not even remove wrong
candidates. The bottleneck is INHABITING a slot, not naming it.**

⭐ Fourth independent line of evidence for the same conclusion, first from the type side:
caps widened 128× = 207/207 unchanged; death census = a CONSTRUCTION gap; entry 51b's
slot-filler alone = 2/31; a correct unifier = 0/45.

⚠ **Gate-design lesson (mine, this session):** I flagged BEFORE running that step 2's
precision is consumed by only one downstream site, then set a conversion stake on it
anyway. The test could not separate "worthless core" from "unbuilt consumer".
**A component gate must measure the component's OWN contract; the payload gate belongs on
the piece that consumes it.**

➡ **The system claim is NARROWED, not refuted, to `inhabit(type, ctx, scope, depth)`** —
one recursive goal-directed builder (hypothesis · ctor application · inline call · binder
introduction) with the unifier's substitution threaded through. It would subsume SEVEN
generators (`fillCandidates` rules 3/3b/4/5, `argFillChoices`, `nestedCtorArgFills`,
`lfCtorAppFills`, `hoSlotFills`, `synthesizeFills`, `inlineArgCallTexts`) — which is why
each of them measured ~2%. Step 2 is its precondition and is green. **Step 3 is the one
that has to be worth 20%.**

## ⭐ WHERE THE BUILD IS (2026-08-19) — the composite is BUILT, and it is OPT-IN

`globalThis.__proverInlineArg` / `INLINEARG=1` (honoured by `diverge-one`,
`rebaseline-one`, and `scripts/prover-native-oracle.mjs` so the DIFFERENTIAL can measure
it without a code edit). **Master plan entry 56 is the full record — read it, don't
re-derive it.**

- **Gains:** `cc.bel#weaken` no-move/52 → **COMPLETE/33 in 4 moves** (the author's proof),
  `cc.bel#extend` no-move/8 → **COMPLETE/14** (closes via a SIBLING call),
  `alg-equal-datatypes#ref` step-bound/266 → COMPLETE/12,
  `weak-norm-under-binders#wknRedSub` TIMEOUT/756 → COMPLETE/21.
- **A/B over 45 class targets: 3 gains / 0 losses / −15.7% checks.** Declared stake was
  ≥3 of 24, extended at the same rate to ≥6 of 45. **MISSED → opt-in, as declared.**
- **Gates with it ON: `prover:diff` 199/199 zero regressions, suite 209/210.** Default
  path inert (47/47 non-timeout rows byte-identical to the ledger).
- ⛔⛔ **THE CLASS NUMBER WAS INFLATED ~3.5× — see entry 56b.** `inline-arg-reach.mjs`
  said 179/577 at 4.98× lift, but that predicate is STATIC (what the SIGNATURES permit).
  Measured with a FIRING COUNTER during real runs: the ctype-goal path fires on **11.1%**
  of the sampled class and an inline call is emitted on **28.9%**. Real class ≈ 50, so
  the ~12-target projection was the optimistic end of a 3.5×-too-big number.
- ⛔ **No shared next wall.** 32 of 42 non-converters die at the GENERIC
  `Type-checking error.` row (entry 30 already sub-classified it as not-a-defect), with
  recurse offered to 17 and lemma to 12. Forty causes, not one.
  **This was the best-posed remaining slice; built WHOLE, gated clean, worth ~+12 at most.**

⛔ **Entry 42's "three pieces" was WRONG — it is five, and the trace said so before any
code was written.** (A) context-indexed ctype goals (`Map [h] [g]`) were not recognised at
all (`resultGoalParts` demands a boxed argument), so the ctor application was never even
proposed; (B) `matchIndices` binds only UPPERCASE, so ctype context indices never bound and
every slot kept its DECLARED context — which is why entry 40a's weakening could never fire
here; (C) the inline call (the piece entry 42 named) — and `supportLemmaTexts` skips any
lemma with no BOX premise, which is exactly this family's lemma; (D) the weakened box
(existed); (F) the slot's own context binder.

⭐ **Two further paying defects were MIS-EMITTED TEXT, found by reading one trace:** the
ctype split bound a BOX argument as a bare name (`M_dot X1 X2`), making it a comp value
that can never be weakened (entry 40b) — the corpus writes `| M_dot sigma' [h |- M] =>`;
and the instantiated slot context cited a reconstruction-invented name (`z`), refused by
invariant 11 while the identical `_` spelling is accepted. See
[[feedback-generation-pays-search-control-does-not]] — that law now has two more instances.

⭐ **A WHOLE composite behaves differently from a partial one.** 51b built 1 piece: 2/31 at
**+69.9%** checks. This built 5: 3/45 at **−15.7%** checks, zero losses.
[[feedback-composite-moves-are-atomic]] confirmed from the paying side for the first time.
The RATE is still entry 53c's ~1.5–3% tail.

## ⛔ Do not re-run these

- **`hoSlotFills` (`__proverHoSlot`, entry 51/53 piece 3) alone: 0 gains / 0 losses /
  +17.2% checks** over 24 targets. Reproduces entry 53's prediction — without a recursive
  call there is no derived fact to put in the slot.
- **`prover-transport.mjs` at the entry-42 drop site (`__proverTransport`): 0/12,
  −0.4% checks** — fired 572 times, declined all 572. At a ctype goal the planner sets
  `goalParts = []` (`prover-moves.mjs:371`), destroying the per-argument contexts. The
  module is correct but aimed at a shape that does not occur THERE. Entry 56 solved the
  same problem in `fillCandidates` instead, which is the "bounded home" entry 41 preferred.
- **The MEASURE path is dead** (2026-08-18): the fork supplies candidate measures to 100%
  of the `no-totality-measure` class (lift 0.00×); zero of 21 targets die of a totality
  rejection. `hypotheticalMeasures` really does drop ctype premises
  (`prover-orchestrator.mjs:284`) but the defect is INERT — verified paired, with a
  positive control, via `diverge-one --id … SPLICE_TOTAL=N`.
- **The 126 `no-totality-measure` class is a PHANTOM** — `proveProgramWithScope` returns
  the UNFORKED result on total failure, so the ledger reason names a decline a later retry
  moved past.

## ⚠️ PROCESS — what worked, and what cost the previous session

0. ⭐ **"Sized by the mechanism's own predicate" is NOT enough — the predicate must be
   evaluated DURING A RUN by a firing counter, never over corpus text.** A static
   signature census produced a 4.98× "lift" that was 3.5× inflated. This is
   [[feedback-size-classes-by-toggle]] in a new disguise; entry 43's rule did not spell
   out the fine print.
0b. ⚠ **`execFileSync` DISCARDS stderr on success** — debug counters read 0/0 on a target
   that demonstrably fires. Use `spawnSync`. Caught only because the positive control was
   run first.
1. **READ `docs/prover-master-plan.md` FIRST.** Entries 42, 51, 53 were each re-derived by
   experiment AFTER hours of work. What worked on 2026-08-19: read entries 40–44 and 51–56
   first, then run ONE trace on the motivating target BEFORE writing code — that trace
   corrected entry 42's own piece count in ten minutes.
2. **`diverge-one` needs `ALL_ENTRIES=1` + `stepsText`** (added 2026-08-19) to see what a
   hole ADVANCED on. `allDead` only shows dead ends, and the whole diagnosis here was that
   a hole advanced on the WRONG move (a nested re-split) because the right fill was refused.
3. **Confirm an instrument yields a POSITIVE on a known-good target before believing a NULL.**
4. **Write probes to FILES** — `node -e` through bash mangles regex backslashes.
5. **Verify a patch landed by grepping the NEW text**, never by a success message.
6. **A/B arms run SEQUENTIALLY and alone**; never beside a sweep or a suite run.
