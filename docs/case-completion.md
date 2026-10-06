# Case completion

*Given a proof by induction with some cases written, supply the rest. What exists, what a
result is worth, and the measured floor.*
*A side track built against Beluga / Harpoon / Orca, deliberately not inside [Calf](calf.md).*

---

## 1. What it is

The author writes some cases of a proof by induction; the machine supplies the rest, and
refuses by name the ones it cannot do. Two ways to supply a case, both measured (§6):

- **The lookup.** The case is a sibling's with constructors renamed by the signature
  (`e_succ → e_pred` brings `t_succ → t_pred`). Instant, no search, one check. Fills 11% of
  theorem cases; renaming of any kind tops out at 16%.
- **Orca on one case.** The shipped engine fills the single hole the missing case leaves
  inside the author's case split. Seconds per case, in the background. Fills 61%.

**It ships** (§7): both, in the background, as faint arms in the proof. Measured end to end with
two cases missing and the patterns generated: **62% of theorem cases filled, 49% in proofs with
six or more.**

The original theory (*the author supplies the pieces, the machine supplies the domain
assignment*, with three to five pieces per proof) did not survive measurement: under exact
renaming the author still writes 84% of theorem cases.

**It is not the shelved Orca programme.** That pushed the whole-theorem rate past 32% from a
bare goal. This runs the shipped engine on goals the author's case split has already made
small; on `tps` the same engine is stuck on the whole theorem and fills all fifteen cases one
at a time.

## 2. The reviewable object is the assignment

The generated cases are checked by Beluga, so they carry nothing the author needs to review.
The claim worth showing is the **assignment**: which authored piece covers which rule. That is
the table in [`case-assignment.mjs`](../js/editor-src/prover/case-assignment.mjs), one row per
rule: the rule, the piece assigned to it, a verdict.

Three interface decisions are encoded there rather than documented:

1. **The schema is an input.** `assign` is injected and every row records its provenance, so
   an authored schema (Calf's later contribution) drops in where an inferred one came out.
2. **Rows are abstract.** A rule and a piece id. Nothing in the table renders source text.
3. **The rule set is data**: exactly what `enumerateConstructorsTyped` returns. No path.

**The classifier cannot declare a case correct.** `assign` proposes; the row starts
`Not checked yet`; only `recordVerdict`, which takes an oracle's answer, reaches `Checked`.

## 3. What a `Checked` is worth

Two independent questions, and neither may be assumed.

**How much does Beluga check on this declaration?** Three strengths (`STRENGTH`):

| strength | when | guarantees |
|---|---|---|
| `total` | the declaration carries a `/ total … /` | well-typed, covering, terminating |
| `covering` | no totality declaration, but the file opens with `--coverage` | well-typed, covering |
| `typedOnly` | neither | well-typed |

- Beluga gates coverage **per declaration** on that declaration's own totality declaration
  (`recsgn.ml:1603`, read at `coverage.ml:3592`). A proof with a deleted case and no pragma
  passes, even beside a totalied sibling.
- ⛔ **`covering` is the trap.** Beluga notices a missing case and still accepts a proof that
  calls itself on its unchanged argument. A `Checked` there is not a proof.
- ⛔ **A commented-out pragma is not a pragma.** About 93 corpus declarations carry
  `% / total … /`. `strengthOf` strips comments first; `parseTotality` deliberately does not,
  because to Orca a commented pragma is a hint about which argument decreases. Different
  question, same parser.
- ⛔ Never emit a `/ total /` the author did not write. Case bodies are copied; measures are not.

**Does the type pin the answer?** "Beluga accepts it" certifies a case only when every
inhabitant of the type is acceptable. For a theorem that holds. For a program it does not:
`copy : [g |- tm] -> [g |- tm]` accepts `copy (app U V) = suc (copy U)`, which is well-typed,
covering, terminating and wrong. Nothing in Beluga's syntax tells the two apart; every corpus
proof is a `rec`. The harness uses a proxy (§5), and so does the surface: only a result in an
indexed family is filled unasked (§7, §8).

## 4. Where the code lives

| file | role |
|---|---|
| `js/editor-src/prover/case-assignment.mjs` | the table: verdicts, strengths, `buildTable`, `recordVerdict`, `reassign`, `summarize`, `validate` |
| `js/editor-src/prover/case-pieces.mjs` | reading a proof: families, the rule index, an arm's head, `splitArm`, `authoredPieces`, `missingRules` |
| `js/editor-src/prover/case-arms.mjs` | the arm reader (grammar walk), masking and replacing an arm in place (`scripts/case-read-arms.mjs` re-exports it) |
| `js/editor-src/prover/case-lookup.mjs` | the signature lookup: a sibling's arm with constructors renamed |
| `js/editor-src/prover/case-fill.mjs` | **the core, shared by the harness and the product**: `eligibility`, `planCase` (the missing cases, each parked under its own hole), `fillRow` (lookup, then Orca on that one hole), `slicesFor`, `resultClassOf` |
| `js/editor-src/prover/case-fill-job.mjs` | one proof's job: plan, lookup pass, Orca pass, with the two budgets |
| `js/editor-src/prover/case-fill-worker.mjs` | the worker (built to `js/case-fill.worker.js`, classic): its own Beluga runtime, the job run synchronously as the harness runs it |
| `js/editor-src/prover/case-fill-scheduler.mjs` | when: settlement, the pause, one job at a time, cancel, the watchdog |
| `js/editor-src/prover/case-fill-store.mjs` | what is known, per file and proof; the table lives here |
| `js/editor-src/ide/case-ghosts.mjs` | on screen: the ghosts, accept, force, dismiss, `Tab` |
| `scripts/case-harness.mjs` | the measurement (§5) |
| `scripts/case-harness-lib.mjs` | re-exports the slicing and the result classifier from `case-fill.mjs` |
| `scripts/probe-case-fill.mjs` | `npm run probe:cases`, the surface in Chrome (§7) |
| `tests/test-case-*.mjs` | nine files; every assertion was mutation-tested |

The arm reader moved into the editor tree when the feature shipped; the `*jar` purity baseline
was lowered to the measured count in the same change.

## 5. Measuring it

```bash
node scripts/case-harness.mjs --strategy verbatim     # whole corpus, ~45 min, 4 jobs
node scripts/case-harness.mjs --file x.bel            # one file, rows to stdout
node scripts/case-harness.mjs --report rows.jsonl     # re-report a finished run
node scripts/case-harness.mjs --redo-skipped rows.jsonl --strategy verbatim --out merged.jsonl
```

**Leave-one-out.** Take a finished proof, hide one case, offer the others, ask Beluga. Every
arm carries two controls, and an arm that fails either is excluded and counted:

- **Negative.** The proof with the arm removed must be rejected, for coverage. Otherwise
  "accepted" says nothing about a candidate put there.
- **Positive.** The author's own body, spliced back through the path every candidate takes,
  must be accepted. Otherwise the splice is broken, not the candidate.

Only `total` proofs are scored. Each proof is checked in the smallest slice that itself checks
(the signature, the proofs it names transitively, itself), which took one development from
118s to 26s with identical verdicts.

A strategy is `(hidden arm, siblings) -> candidate bodies`. The one built in, **`verbatim`**,
is a floor and is labelled as one: a sibling's body, unchanged, under the hidden case's own
pattern. It knows no constructor correspondence and renames nothing.

**Reading the report.** It leads with theorems and labels the blend "do not quote on its own".
The classes come from the result type: a derivation of an *indexed* family (theorem-like), a
term of an *unindexed* type (a program), or a computation-level type. ⚠ A proxy: intrinsically
typed data (`exp T`) is an indexed family too.

## 6. Where it stands — 1 October 2026

`Beluga-W/examples`: 200 distinct files, 136 check alone, 19 of 20 `.cfg` developments check,
8 files check neither way. 696 proofs with two or more cases: 218 untotalied and 41
coverage-pragma-only were not scored; 437 were. **1354 arms measured, 1264 scorable (93.4%).**
Positive control 1354/1354. The 89 arms whose removal went unnoticed sit under overlapping
patterns or a catch-all.

The `verbatim` floor (ledger `results/corpus/case-loo-verbatim-20261001b.jsonl`, gitignored):

| result | arms | any sibling | one at random | wins that are the author's own body |
|---|---:|---:|---:|---:|
| **theorems** (indexed family) | 652 | **9.8%** | 4.1% | 64.1% |
| theorems, proofs with ≥ 6 cases | 215 | **17.2%** | 2.8% | |
| computation-level type | 416 | 2.6% | 0.5% | 72.7% |
| programs (unindexed term) | 147 | 53.7% | 29.9% | 27.8% |

- **About one theorem case in ten is already written elsewhere in the same proof**, verbatim
  or as a body that never mentions its own pattern. That is free and needs no theory.
- **The 54% on programs is not a completion rate.** Three quarters of those wins are not what
  the author wrote; the type cannot rule them out.
- About 11 of the 64 theorem wins sit in typed-data families the proxy lets through (`exp`,
  `term`, `obj'`, `val`), so the true theorem floor is nearer 8% than 10%.
### How big the prize is — measured 2 October 2026

Text only, on the same 652 scorable theorem arms (`scratch/probes/rename-ceiling.mjs`,
`rename-nearmiss.mjs`; both run in under a second). A hidden case counts when some sibling is
**the same token for token, up to renaming variables and constructors**: `e_succ → e_pred`
with `t_succ → t_pred`. Such a case equals the author's up to variable names, so it certainly
checks; no Beluga call is needed to score it.

| a sibling is… | all theorem arms | proofs with ≥ 6 cases |
|---|---:|---:|
| the same body, at most variables renamed | 5.7% | 9.3% |
| + a constructor renaming a **signature lookup predicts** | 10.6% | 22.8% |
| + any constructor renaming at all (**the ceiling for renaming**) | **15.6%** | **32.6%** |
| + within 10% of a sibling's structure, names ignored | 25.6% | 58.1% |

- ⛔ **The ceiling for transport by renaming is 16% of theorem cases, 33% in long proofs.**
  The 52.3% that motivated this track (`scratch/calf-transport/sizing.mjs`) used a coarse
  signature, and corresponds to the last row: cases that *resemble* a sibling. Closing that
  gap means changing the structure of an argument (which premise recurses, an extra
  inversion), which is synthesis, not renaming.
- **"Three to five pieces per proof" does not hold here.** Under exact renaming the author
  still writes 84% of theorem cases (67% in long proofs).
- **The lookup** (in `predicted` in the probe): the donor and target rules differ in the object
  constructors their conclusions mention (`succ → pred`); every other constructor in the body
  is left alone if it does not mention a changed one, and otherwise replaced by the one
  constructor of its family and arity that mentions the new one in its place. It reproduces
  the author's renaming for 49 of the 70 renamable cases in long proofs, with no search and
  no checker call. The rest need the types, not just the names (`t_zero → t_true`).
- Computation-level proofs (logical relations, normalisation) barely repeat: 8.2% ceiling.
- Brute force is the wrong shape: the unpredicted renamings would mean trying 12.8
  constructors per renamed name, at 0.35 to 4 seconds a check.

### One proof, both routes — `tps` in `tapl/ch3+arith+leq`, 2 October 2026

`scratch/probes/lookup-demo.mjs` and `orca-cases.mjs`. Fifteen cases.

- **The lookup fills 2** (`e_pred`, `e_iszero`, both from `e_succ`), identical to the author's.
  The other "twins" are not renamings: `e_switch_true`/`e_switch_false` return different
  premises, `e_leq_1`/`e_leq_2` recurse on different arguments, the `…_zero` cases return the
  constant the result type demands.
- **Orca, run on one missing case at a time inside the author's case split, fills all 15.**
  Every result re-checked independently: whole program, no holes, the author's `/ total /`.
  5 to 23 checks a case, median 7.9 s in Node (one outlier 88 s). Its output is the author's
  argument with different variable names.
- **The same engine on the whole theorem is STUCK** (`step-bound`, ledger of 15 Aug). The
  case split is what makes it tractable: fifteen small goals instead of one large one.
- ⚠ One proof, from the family Orca is strongest on. The corpus number is below.

### Orca, one case at a time, whole corpus — 3 October 2026

`node scripts/case-harness.mjs --strategy orca` (ledger `case-loo-orca-20261002b.jsonl`, the
4-hour run plus a targeted redo). Each hidden case becomes `pattern => ?` inside the author's
case split; the shipped `proveProgram` fills that one hole with a budget of 15 steps and 60 s.
A fill counts only if the program differs from the author's **only inside that case** and
checks again from scratch with no hole left. 1252 scorable arms, positive control 1342/1342.

| result | arms | Orca fills | median per filled case |
|---|---:|---:|---:|
| **theorems** | 638 | **60.8%** | 4.0 s |
| theorems, proofs with ≥ 6 cases | 203 | **41.4%** | 6.2 s |
| computation-level type | 416 | 20.0% | 4.8 s |
| programs (⚠ not a completion rate) | 149 | 79.2% | 0.9 s |

**Lookup first, then Orca on the rest** (`scratch/probes/hybrid.mjs`, same theorem cases):
**65.2%** of theorem cases, **49.3%** in proofs with ≥ 6. The two are complementary: in long
proofs the lookup fills 16 cases Orca misses.

- **This replaces renaming as the main route.** Renaming tops out at 16%; the shipped engine,
  given the author's case split, fills 61%. It is not the shelved programme: that pushed the
  whole-theorem rate from nothing; this runs the shipped engine on goals the split made small.
- **Why not filled:** no move 319, the 60 s budget 294, step and search bounds 22. Almost
  half the misses are the budget, so a longer background budget is a dial, not a new idea.
- **Logical-relations proofs stay hard** (20%). The prize is in the syntactic-metatheory
  families: type preservation, determinism, evaluation, equality.
- ⚠ **The engine does not always honour cancellation**: two cases ran 41 minutes against a
  60 s budget (`howe_subst`, `algeqNeuTrans`). A background filler needs that fixed first.

## 7. The feature

Decided by Dean on 3 October 2026: **this is the feature**, done "skillfully and usefully, not
bothering the user, while still providing manual endpoints to force it on a row".

**When it runs.** After the file settles with a coverage failure at a proof's outermost `case`,
with the checker ready, the setting on *Automatically*, and typing paused for 1.5 s. One proof at
a time, in its own worker (`js/case-fill.worker.js`) with its own Beluga, running the prover
synchronously exactly as the harness does. Editing the proof cancels its job; a job that ignores
the cancel is terminated after its budget plus 15 s, and the cases it had not reached are
queued again. It waits while Harpoon's Orca runs.

**Which proofs run unasked.** Only one that is `total`, whose result is an indexed family (a
theorem), and whose written cases have distinct heads (`eligibility`). Everything else, a
`covering` or `typedOnly` proof, a function returning data or a computation, shows nothing until
a fill is forced, and the hover on what that fill found says what was not checked.

**Per missing case**: the lookup first (instant), then Orca on that one parked hole with a budget
of 15 steps and 60 s (40 steps and 180 s when forced). A fill is shown only if Orca made at least
one move, the program changed only inside that case, and the whole program checks again with no
hole left in it. `noMeasureSynthesis` is always on.

**On screen** (UI.md: silent by default, one indicator per fact):

| state | what is drawn |
|---|---|
| filled | the arm as it would be written, faint, where it belongs; always |
| not filled yet, or not found | one faint line `\| pattern ⇒ …`, only while the caret is in that proof (or after a force) |
| searching | nothing for an automatic run; a forced row shimmers |
| a forced fill found nothing | an error toast naming the case, and the reason in Notifications |

Hover says where a fill came from (*Filled from e_succ*, *Found by Orca*) and its strength when
weaker than `total`.

**The endpoints.** `Tab` at the end of the line a filled ghost hangs from accepts it (under Vim,
in Insert mode only; anywhere else Tab is Tab). Three commands, in the palette, the editor's
context menu and every style (`docs/COMMANDS.md`): *Accept Filled Case* (`C-c a`, `<leader>a`),
*Fill This Case* (`C-c c`, `<leader>c`), *Dismiss Filled Case* (`C-c k`, `<leader>x`). Each acts on
the case whose ghost hangs from the caret's line, else on every case of the proof under the
caret. Clicking a ghost accepts it, or forces it when it is not filled. One setting: *Fill
missing cases: Automatically / When asked* (Harpoon section).

**Accepting** is one edit and one undo step (`case-arm` in the history). The result is parsed
before anything is dispatched: it must read back as exactly one more arm per accepted case, or
nothing is written and a toast says so. The arm is written in the file's own notation (§9).

**What ships, measured** (5 October 2026). `node scripts/case-harness.mjs --strategy fill --hide 2`
runs the shipped pipeline itself: each scored case is hidden **together with a partner** (at
least one case always stays written), the planner generates the missing patterns as the
product does, and each is filled by `fillRow`, lookup then Orca, under the automatic budget.
Ledger `results/corpus/case-fill-hide2-20261003b.jsonl` (1267 scorable arms, positive control
1357/1357).

| result | arms | filled | median per filled case |
|---|---:|---:|---:|
| **theorems** | 648 | **61.6%** | 3.8 s |
| theorems, proofs with ≥ 6 cases | 203 | **48.8%** | 5.2 s |
| computation-level type | 416 | 17.1% | 6.5 s |
| programs (⚠ not a completion rate) | 154 | 76.0% | 1.2 s |

- **Generating the patterns costs nothing measurable.** Leave-one-out with the author's own
  pattern filled 65.2% (lookup then Orca); two missing at once with generated patterns, 61.6%.
- **Why not filled** (every class): no move 221, the 60 s budget 186, the planner could not
  build the row 118 + 109 + 16, step and search bounds 18. A case attempted takes a median of
  5.7 s; the slowest took 154 s against its 60 s budget, which is why the worker has a
  watchdog (budget + 15 s, then terminate).
- About a third of the theorem fills (136 of 399) are the author's own case, character for
  character; the rest are other proofs of the same case, each re-checked whole.

## 8. Open decisions

1. **The outermost case is not always the induction.** `det` cases on a pair and
   cut admissibility repeats a rule with different sub-patterns; 534 of the scorable arms are
   of this kind. "Rule" is the wrong word for those arms and the table does not model them.
2. **Theorem or program** is decided by a proxy for now (§3, `resultClassOf`): only indexed
   families run unasked. Typed data (`exp T`) passes the proxy.

## 9. Traps

- **A sweep pins the code it runs on, and mutation testing is editing.** The harness spawns
  one process per unit, so each re-imports from disk. Touch nothing it imports while it runs.
- **The grammar recovers from errors.** "It still parses" passed with a dangling bar left
  behind; assert exact text.
- **Both arrows.** `=>` and `⇒` differ in width; `splitArm` is the only place that slices.
- ⛔ **Both turnstiles, because the editor writes glyphs.** Alias expansion is greedy by default,
  so a person's file reads `[ ⊢ e_succ S] ⇒`, never `|-`. The corpus is ASCII and every Node
  test passed while, in the browser, `armRuleHead` read no head from any arm: no proof ever ran
  unasked (the distinct-heads gate) and a forced fill planned the written cases as missing.
  Found by the Chrome probe, not by the suite; the probe seeds glyphs on purpose.
- ⛔ **Write in the file's notation.** A filled arm comes back in ASCII. Inserted as is, greedy
  expansion rewrites it in a second transaction: a second undo step, and an edit to the proof
  that drops the ghosts still waiting. `case-ghosts.mjs` shows and inserts it through
  `maybeExpandBelAliases`.
- ⛔ **Never run the indenter over an accept.** It pushed the new arm in two columns and
  re-indented the author's last line above it: an edit outside the arm, and outside undo.
  The arm goes in exactly as its ghost shows it; only its body is moved, as a block, to the
  column the author's arms use (Orca lays its output out at its own).
- ⛔ **A text put back as it was settles nothing.** Type a space in the proof and delete it:
  the checker has nothing new to check, no settled check arrives, and the ghosts the edit
  dropped never came back. The scheduler keeps the last settled check and reads it again,
  after the pause, when the text is back to what it checked.
- These four were found by `npm run probe:cases`, none by the Node suite. Run it after any
  change to the surface.
- **Constructor names carry symbols** (`step_@1`). Use `DECL_IDENT`, never a letters-only class.
- **`%:split` returns `impossible` on the measured argument** (an upstream Beluga defect in
  `Interactive.split`). Not needed here: the missing rules come from the signature.
- **A COMPLETE with no move filled nothing.** A development can declare a name twice
  (`vsound` in two files of one cfg); with both in the slice, Orca looked at the finished one
  and reported done. 94 such claims, all caught by the independent re-check. The slicer no
  longer counts a proof's calls to itself as references, and the filler reports a zero-move
  COMPLETE as unmeasured, never as a result.
- **The engine's theorem reader needed whitespace before the body `=`**, so headers written
  `… [ |- not_possible]=` were unreadable and Orca could not start on four corpus theorems.
  Fixed in `declBodyEqIndex` (`prover-hyp.mjs`): a closing bracket also marks the `=` as the
  body's, since no name contains one (`tests/test-corpus-decls.mjs` (i)).
