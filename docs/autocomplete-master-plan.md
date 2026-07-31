# Autocomplete master plan — correct-by-construction completion

**Doctrine.** The engine never offers a completion it cannot justify algorithmically.
Utility grows by *expanding the set of sites where a strong justification exists*,
never by loosening what may be offered at a site. Ranking, fuzzy matching,
proximity, and peers operate strictly *inside* an already-justified offer set —
they may reorder or drop, never admit.

This is the completion-engine instance of the BelJar architecture law: the AST /
semantic model is the substrate; Beluga is consulted surgically; when we cannot
justify, we **honestly decline** (empty popup / no popup), we do not guess.

Execution is phased. Each phase has exact files, exact acceptance gates, and
kill criteria. Do the phases in order. Do not start phase N+1 while phase N's
gate is red.

---

## 0. Current state (read this before touching anything)

Pipeline (all under `js/editor-src/ide/completion/`):

| Module | Role |
|---|---|
| `classify.mjs` | `classifyCompletionSite(state, pos, engine)` → `{kind: 'ident'|'structure'|'none', …}`. Sync, Lezer-only, never forces settlement. Holes (`?`) are declined — Harpoon owns them. Structure slots (`case-arm`, `top-decl`, `expr-head`) gate what may appear. |
| `contributors.mjs` | `contributeIdents` (in-file scope via `symbolStore.visibleSymbolsAt` + cfg peers via `getPeerSymbols`). **No hole fills.** |
| `snippets.mjs` | Structural scaffolds (`LF`/`rec`/`case`/`| … ⇒`) keyed by structure slot. Ranked above idents via `scoreHints.base` (no CM section headers). Tab accepts. |
| `weigh.mjs` | `rankLookupItems(items, query, limit)` — ranks an already-justified set; `limit: 0` keeps the complete pool. |
| `source.mjs` | CM glue: builds the full justified empty-query pool once, then BelJar filters and re-ranks its surviving members on each token edit without re-gathering candidates. |
| `fuzzy.mjs`, `chrome.mjs` | Scoring + popup theme. |

Semantic substrate: `semantic/symbol-store.mjs` — `visibleSymbolsAt(pos, {namespaces, refKind})`,
`expectedNamespacesAt(tree, pos, refKind)`, `expectedNamespacesForContext(ctxName, refKind)`.
Peers: `semantic/project-prelude.mjs` `listGroupSymbols` (memoized, carries `namespace` from `defsOf`).
Namespaces: `semantic/ids.mjs` `NAMESPACE` (12 values).

**The gap.** Hard namespace prediction exists for exactly three Lezer contexts —
`LFAtomicType` (→ `LF_TYPE_FAMILY`), `LFAtomicTerm` (→ `LF_CONSTRUCTOR|LF_CONSTANT`),
`CompAtomicType` (case-split upper/lower) — plus fixity pragmas. **Everywhere else
`namespaces` is `null`** and the engine offers every case-compatible visible global
plus peers on every keystroke. Patterns, schema bodies, context entries, expression
heads, module access: all unpredicted. Peers with missing namespace metadata pass a
*soft first-letter case filter*. Tests (`tests/test-autocomplete.mjs`) certify scope
and a few namespace cases; nothing asserts "this site must NOT offer that name."

That is the inversion to fix: wide offer set first, ranking as apology. The hole
path (`fillCandidates`) is the only slice already at the right standard — goal-directed,
axiom-first, honest empty.

---

## 1. The correctness ladder (the central untangling)

"Guaranteed correct" cannot naively mean "type-checks" — full type correctness of
an arbitrary insertion is only decidable by running the checker, which is banned
on the keystroke path (worker checker, latency law). So we define a **justification
ladder** and make every candidate carry its level. This is the load-bearing design
decision; everything else follows from it.

| Level | Guarantee | Decidable how | Cost |
|---|---|---|---|
| **J0** | none (word appears somewhere) | — | **banned. Never offered, by anyone, ever.** |
| **J1** | *Resolvable*: the name is a declared symbol, visible in scope at this position, case-compatible. Inserting it can never produce an "unknown identifier" error. | `visibleSymbolsAt` + visibility-group peers | O(1) on snapshot |
| **J2** | *Sort-correct*: J1 **and** the grammar site predicts a namespace set that the symbol inhabits. Inserting it can never produce a wrong-sort head error (type family in term slot, ctor in type slot…). | `expectedNamespacesForContext` table (extended in Phase 2) | O(tree depth) |
| **J3** | *Type-compatible*: J2 **and** a statically known expected type / goal head matches the symbol's result head (or assumption type). | prover substrate: `headOfConclusion`, `assumptionCompatible`, `typesMatchModuloSpacing` from `hole-split.mjs`; hole goals; scrutinee types | string/AST ops on snapshot data |
| **J4** | *Checker-verified*: the actual splice type-checks. | async worker check (`verifyAtHole` pattern) | worker round-trip; **never blocking, never per-keystroke** |

**Offer policy (decided, not negotiable):**

- **Implicit popup (typing):** only J2 or better. If the best the site supports is
  J1 — i.e. `classify` cannot predict a sort — the implicit popup **declines**
  (`kind: 'none'` for typing purposes). No exceptions.
- **Explicit invoke (Ctrl-Space):** may show J1 when nothing stronger exists at the
  site, because the user asked, and J1 still carries a real guarantee (resolvability).
  J1-only state must be visually distinct is *not* required; correct content is.
- **Holes:** `fillCandidates` output is J3 by construction (goal-directed) and stays
  the sole hole contributor. J4 verification is an *async decoration* (Phase 4),
  never a gate on showing the list.
- Every `LookupItem` gains a required field `just: 1|2|3|4`. `rankLookupItems`
  asserts (dev builds) that no item lacks it. This makes the invariant auditable
  by machines, not prose.

**Why J1 exists at all instead of "type-checked or nothing":** demanding J4
everywhere means either per-keystroke checking (violates the latency/worker law)
or an engine that is silent almost everywhere (violates utility). The ladder is
the honest middle: each offered item states exactly which errors it *provably
cannot* cause. That claim is testable, and Phase 0 builds the test.

**Metavariable question (untangled):** uppercase identifiers in LF term/type
positions are usually *free metavariables* — fresh names the user is inventing.
An engine cannot "complete" a fresh name. Decision: in LF sites we offer only
*defined* uppercase constants (already the `LF_TYPE_HEAD`/`LF_TERM_HEAD`
semantics); we never synthesize metavariable names in ident completion. Fresh-name
suggestion is a hole-fill/prover concern, not autocomplete's.

**Keyword question (untangled):** Lezer's LR parser does not expose a public
expected-token/FOLLOW API, so "grammar-derived keywords" cannot be computed at
runtime honestly. Decision: keywords/templates come from a **hand-authored
site→snippet table keyed by Lezer contexts**, and every entry is *proved* correct
by a test that inserts it at a representative site and asserts the parse tree
contains no error node (Phase 5). A static keyword dump at every site is J0 and
therefore banned.

**Verification question (untangled):** do we ever call the checker from the
completion path? Synchronously: **never.** Asynchronously: only in Phase 4, only
at holes, only for the top-k already-shown fills, debounced, purely additive
(a ✓ badge / re-rank on next open), and cancellable. The popup contents at time
of display are never blocked on a worker.

---

## 2. Engine laws (apply to every phase)

1. **No settlement forcing, no checker calls, no whole-doc `toString` on the
   sync path.** `classify` + `contribute*` + `rank` must stay pure functions of
   the current Lezer tree, the symbol-store snapshot, and cached peer lists.
   Budget: p95 ≤ 2 ms for classify+gather+rank on `cp_thrm.bel`-scale files.
2. **Fuzzy/proximity/recency never admit.** They operate on the justified set only.
3. **Honest decline.** Unknown site → no implicit popup. Empty justified set →
   empty result, not a fallback bag.
4. **Determinism.** Same document + snapshot + position ⇒ same list, same order.
   No wall-clock, no randomness, no usage-frequency state (if usage ranking is
   ever wanted, it is a *ranking* input inside the justified set, a separate
   proposal — not part of this plan).
5. **One inference substrate.** Type/goal reasoning reuses `hole-split.mjs` /
   prover helpers. Never write a second, slightly different head-matcher inside
   `completion/`. If a helper needs generalizing, generalize it in place.
6. **Peer symbols must carry `namespace`.** A peer def whose namespace `defsOf`
   could not classify is J1-at-best and therefore excluded from implicit popups.
   Delete the soft first-letter case filter when this lands (Phase 1).
7. **Corpus replay is the referee** (Phase 0 harness). Never declare a phase done
   from anecdote. Report soundness violations and recall flat, gap-first.

---

## 3. Phases

### Phase 0 — Instrument before touching (the referee)

Build `scripts/autocomplete-audit.mjs` (pattern: existing `scripts/prover-*-audit.mjs`).

Mechanics:
- Corpus: every `.bel` file under `library/data/` reachable from the shipped cfgs
  (reuse `project-prelude.mjs` grouping so peers are realistic).
- For every identifier *reference* token in each file (skip binding occurrences —
  the symbol store distinguishes them): truncate the token to its first `k`
  characters (k = 0, 1, 3), run `classifyCompletionSite` + `gatherCompletions`
  on the mutilated document, record:
  - **soundness**: does every offered item satisfy its claimed level? Concretely:
    J1 items must resolve via the symbol store at that position; J2 items must
    additionally inhabit the predicted namespace set. (J3 checks land with Phase 3.)
  - **recall@10 / MRR**: is the ground-truth token in the list, at what rank.
  - **site coverage**: fraction of reference sites where a J2+ prediction existed.
  - **latency**: per-call classify+gather+rank time; report p50/p95.
- Output: one flat table per metric to stdout + JSON dump under `scratch/` for
  diffing between phases. Wire as `npm run ac:audit` in `package.json`.

Gate to close Phase 0: harness runs the full corpus in one invocation and reports
a **baseline** (expect: soundness violations > 0 today via the soft peer filter and
null-namespace bag — that number is the point).

**How to read the audit numbers (do not confuse these):**

| Metric | What it means | Good looks like |
|---|---|---|
| **Soundness violations** | Offered item fails its claimed J-level (unresolvable / wrong namespace / falsely tagged J3) | **0** — this is the correctness bar |
| **Illegal implicit J1** | Implicit popup offered J1-only items | **0** |
| **J2 coverage** | Fraction of sites where grammar predicts a namespace set | High (we sit ~99%) |
| **J3 coverage** | Fraction of sites where an *expected type* is statically known, so ranking *can* boost type-compatible names | Mid (~47%) is **normal**, not a failure — most references sit where no goal type is known yet |
| **recall@10 / MRR** | Was the true token in the top 10 / how high did it rank | Higher is better; utility, not correctness |

J3 coverage is *opportunity for better ranking*, not a pass/fail grade. Raising it
means teaching `expectedGoalType` about more sites — never by inventing types.

Non-goals: no engine changes in this phase.

### Phase 1 — Soundness hardening (shrink to guaranteed)

Changes:
1. `classify.mjs`: `classifyCompletionSite` returns the site's best justification
   capability. Add field `maxJust` (`2` when `namespaces` predicted, else `1`).
2. `source.mjs` `belCompletionSource`: when `!context.explicit && site.kind === 'ident'
   && !site.namespaces` → return `null`. Explicit invoke keeps today's behavior
   (J1 list). This is the single highest-leverage line in the plan.
3. `contributors.mjs`: peers without `namespace` are dropped whenever
   `site.namespaces` is set (already true) **and also dropped from implicit popups
   when it is not set** — i.e. delete the soft case-filter branch; on explicit-J1
   invokes peers require namespace metadata too (defsOf provides it; treat absence
   as a defsOf bug and fix there, not here).
4. Tag every item with `just` per §1; dev-assert in `rankLookupItems`.
5. Tests: extend `tests/test-autocomplete.mjs` with *negative* assertions —
   "implicit popup at an unpredicted expression-body site yields no result";
   "peer lacking namespace never appears implicitly"; "wrong-sort symbol never
   appears at LFAtomicType even under explicit invoke".

Gate: audit shows **0 soundness violations**; recall may *drop* — record it, do
not chase it here. `npm test` green. `node scripts/build-editor.mjs` clean.

Kill criterion: none — this phase only removes unjustified offers.

### Phase 2 — Site coverage (grow J2 territory)

Goal: raise "fraction of reference sites with a J2 prediction" from the Phase 0
baseline toward ≥ 90%, by extending `expectedNamespacesForContext` in
`symbol-store.mjs` — one Lezer context at a time, each with tests.

Work queue (grammar node → predicted namespace set; verify each against
`beluga.grammar` and real corpus usage before landing):

| Lezer context | Predict |
|---|---|
| `AtomicPattern` (inside `CaseBranch` pattern) | lower: `LF_CONSTRUCTOR`, `COMP_CONSTRUCTOR`; upper: `COMP_CONSTRUCTOR` + pattern variables are *binders* — do not complete binders (see rule below) |
| `SchemaElement` / `SchemaSomeBindings` type positions | `LF_TYPE_FAMILY` |
| `ContextEntry` type position (`x : A` in `[g, x:A ⊢ …]`) | `LF_TYPE_FAMILY` |
| `ContextHead` | `SCHEMA` context variables (locals) — locals-only site |
| `CompTypeBinder` / `QuantifiedBinder` type position | as `CompAtomicType` |
| `Observation` after `.` | `COMP_CONSTRUCTOR` (destructors) — needs dot-aware token matching in `matchIdentToken` |
| `TotalityCall` args | `REC_FUNCTION` |
| Module path segment after `Foo.` | member lookup — **defer to Phase 6**, do not half-build |

Binder rule (untangle it once): a position that *binds* a fresh name
(`FnParam`, `MLamParam`, `PiBinder`, `LFLambdaBinder`, pattern variables,
`let` LHS) must never open an implicit popup — completing a binder is always
wrong. `classify` must return `none` for these. Add explicit tests.

Each context lands as: grammar-context entry + positive test (right namespace
offered) + negative test (wrong namespace absent) + audit re-run showing coverage
increase with soundness still 0.

Gate: J2 site coverage ≥ 90% on corpus references; soundness 0; latency budget held.

Kill criterion: any context whose prediction misfires on real corpus (a legal
program where the true token is outside the predicted set) gets *widened or
reverted immediately* — a wrong hard filter is worse than none, it hides the
correct completion. The audit's recall metric catches this: recall at J2 sites
must be ≥ recall at the same sites in Phase 0 baseline.

### Phase 3 — Type direction (J3 where a goal is statically known)

Sources of expected-type knowledge, in priority order:

1. **Holes** — already J3 (goal + ctx + meta through `fillCandidates`). Untouched.
2. **Case scrutinee → pattern constructors.** At an `AtomicPattern` site inside
   `case e of`, if the scrutinee's type head is statically known (scrutinee is a
   variable whose declared/let-bound type is in the symbol store `sourceText`, or
   a boxed contextual object with a syntactic head), filter constructors to that
   family/comp-type using `headOfConclusion` on each candidate's `sourceText`.
   When the head is unknown: stay at J2 (all constructors) — never guess.
3. **LF term application heads.** Inside `LFAtomicTerm` where the *parent
   application's* target type head is syntactically evident (e.g. the RHS of an
   `LFConstructor` declaration `c : … -> head`), filter `LF_CONSTRUCTOR|LF_CONSTANT`
   candidates by result head compatibility (`assumptionCompatible` semantics:
   exact heads lead, `_`-compatible follow).
4. **Typed expression positions.** Where a `CompType` ascription or the rec
   signature pins the expected comp type of an expression hole-like position,
   apply the same head filter to `REC_FUNCTION`/`COMP_CONSTRUCTOR` candidates.

Implementation constraints:
- All matching reuses `hole-split.mjs` helpers (law 5). Export what's needed
  (`headOfConclusion`, `assumptionCompatible` are the expected exports); do not copy.
- **J3 REORDERS, IT NEVER REMOVES.** This is a law, not a tuning choice. J3 is a
  *ranking* pass inside `contributeIdents` after the J2 namespace gate: a
  goal-compatible item is promoted to `just: 3`; everything else stays at J2 and
  ranks below it. A `false` verdict from the type matcher is **not** authority to
  withhold a name.
  - Why: compatibility is decided by string surgery over type text, so `false`
    means "these strings didn't line up", not "this is ill-typed". It was briefly
    allowed to drop candidates and it deleted `plus` from inside `plus`'s own
    body (`[|- nat] -> [|- nat] -> [|- nat]` was mis-read as a single box and
    judged incompatible with goal `[|- nat]`). Withholding a name the user is
    actively typing is far worse than ranking it a few rows down.
  - Only the **J2 namespace gate** may remove a candidate — that is grammar, and
    grammar is decidable here. Types are not.
- All matching reuses `hole-split.mjs` helpers (law 5). Export what's needed; do
  not copy.

Gate: audit shows soundness 0 **and** a typing-replay check passes — replay a
proof keystroke by keystroke and assert the recursive call, the local binders,
and the in-scope constructors are each offered where a human would reach for
them. Corpus recall alone cannot see a name being deleted from a list that still
looks "sound"; that is exactly how the `plus` regression shipped.

### Phase 4 — REMOVED (holes are Harpoon's)

Hole-fill autocomplete and async J4 verification were built, then torn out.
Editing a hole means deleting the `?` and typing a term; the `?`-anchored popup
never matches that workflow. Harpoon owns holes. Autocomplete declines any site
on a `Hole` / `?` token.

### Phase 5 — Structural snippets (grammar-gated)

Hand-authored table in `completion/snippets.mjs`, keyed by structure slot:

- `top-decl` (between declarations / empty file): `LF`, `rec`, `schema`,
  `inductive`, `--infix` / `--prefix`. Idents withheld — only scaffolds.
- `expr-head` (after `=`, after `⇒`, sparse expression): `fn`, `mlam`, `case`,
  `let`, `impossible`, plus normal idents.
- `case-arm` (after `case e of`, between finished arms): only `| _ ⇒ ?`.
  Typing a letter (e.g. `l`) yields **no popup** — the only legal token is `|`.

Rules:
- Snippet bodies parse-clean in a host (tested). Expression holes may be `?`
  (Harpoon takes over); patterns use `_`, not `?` (holes are not legal patterns).
- Snippets rank above idents via `scoreHints.base` so **Tab** accepts the
  scaffold at empty-query structure slots (no section title row in the popup).
- After `|` opens an arm, the slot ends — pattern constructors resume.

### Phase 6 — Scoped growth: module members, then ranking polish

1. **Module member access** (`Foo.bar`): **done** — `membersOfModule` /
   `moduleMembersOf` over structural keys (`Mod/Decl#name`); `classify` detects
   `Ident . partial` (Observation or type-position error recovery); offer set =
   that module's **direct** exports with J2. Unknown module head → fall through.
   Nested `Mod/Inner/…` symbols are withheld until `Inner.` is typed.
2. **Ranking polish, audit-driven only.** **done** — `weigh.mjs` exports
   `WEIGHTS`; sweep via `scripts/autocomplete-weigh-sweep.mjs`.

| config | MRR | recall@10 |
|---|---:|---:|
| baseline (pre-6.2: fuzzy×100 + just×80) | 0.380 | 48.6% |
| **prefix-heavy (shipped)** | **0.383** | **48.7%** |
| just-heavy / peer-soft | 0.383 | 48.7% |

Shipped knobs: `prefixBonus=400`, `exactBonus=600`, `lengthFitScale=40`,
`peerPenalty=30`, `justStep=80`. Soundness stayed 0; p95 stayed under budget.
Snippets no longer use a CM `section` header (flat suggestion rows only).

Gate: MRR reported; soundness still 0; latency budget held. **Phase 6 closed.**

### Phase 7 — Kind keywords + utility (done)

Keyword/`type` gap was never a weigh bug: `type`/`ctype`/`prop` are grammar
keywords, not symbols, and empty `: ` was binder-over-declined. Phase 7 adds
grammar-gated kind slots and hardens incomplete-decl classification.

1. **Kind structure slots** — `lf-kind` / `comp-kind` in `snippets.mjs`, detected
   via `LFKind`/`CompKind`, after-`:` spans in LF/datatype/inductive/typedef
   decls, and Program-level incomplete debris (`inductive Box : c`). Snippets:
   `type` (LF); `ctype`/`prop` (comp). Kind slots keep `idents: true` with
   `LFAtomicType` / `CompAtomicType` namespaces so `nat → type` still works.
2. **Binder hygiene** — `isBinderSite` no longer declines past `:` / `=` inside
   `BINDER_PARENT` decls (same idea as RecBody-after-`=`). Kind/type nodes short-
   circuit the empty-token climb.
3. **Top-decl hygiene** — `isTopDeclSlot` rejects Program-level incomplete debris;
   kind slots are checked *before* `top-decl` in `structureSlotAt`.
4. **Wider top-decl scaffolds** — `coinductive`, `stratified`, `typedef`, `module`
   (parse-clean hosts, same Phase 5 contract).
5. **J3 opportunity** — `expectedGoalType` climbs when `ctxName` is missing, covers
   `CompAtomicType`, and peels rec signatures at `expr-head` (including empty
   `fn x ⇒` / `mlam x ⇒` bodies). Still reorder-only; `plus` regression held.

Gate: unit tests for kind/top-decl positives + negatives; soundness 0 on
`npm run ac:audit`; latency budget held. Keyword sites are not ground-truth in
the reference-token audit (by construction) — certified by
`tests/test-autocomplete.mjs`. Audit treats structure+idents slots as utility
sites and ignores snippets in soundness checks.

Post-Phase-7 audit figures were from the old per-prefix gather path and are
not runtime MRR/recall figures after the retained-pool change.

**Phase 7 closed.**

### Phase 8 — Retained pool semantics (done)

Autocomplete now gathers the complete justified pool at activation, rather than
a display-sized or prefix-shrunk list. While the token remains in the same
semantic site, BelJar re-filters and re-ranks **only members of that pool**;
membership therefore cannot increase as the prefix grows. Each edit revisits
the source but does not rescan symbols or peers. A kind/namespace/locality/
module-site change changes the pool key, so a structural scaffold cannot leak
into a later ident site.

`ac:audit` certifies soundness plus retained-pool recall; it deliberately no
longer reports MRR because production ranking is the retained-pool filter/rank
path. The weight sweep is labelled offline prefix-rank analysis, not a runtime
score.

### Phase 9 — Pattern-binder depth (done)

Boxed LF patterns bind variables nested under λ/Π, not only top-level app atoms.
`collectPatternBinders` walks `LFTerm` / `LFAppTerm` / `LFAtomicTerm` /
`LFLambda` / `LFPi` after `⊢`, skips known constructor heads and λ/Π binder
idents, and registers free pattern vars (e.g. `linQ` in
`| [g ⊢ l_out2 (\y. linQ)]`) as `PatternBinder` scoped to the enclosing
`CaseBranch` / `LetExpression`. Bare `| [g ⊢ linQ]` still binds. Classify
declines nested binder sites in the pattern; branch-body uses complete normally.

`ContextEntry` binders inside a pattern keep in-box visibility after the entry
and extend through the case/let body; expression-box `ContextEntry`s (RHS of
`let`, app args) keep ordinary `ContextualObject` scope — they are not remapped
to `PatternBinder` (that remap previously hid uses like `bly.x` in the same box).

Audit miss classification no longer uses `name.length <= 2` as the primary
`patternLocal` signal. Unresolved binderish contexts (`AtomicPattern` /
`ContextHead` / `ContextTailEntry`, and `LFAtomicTerm` still under a `Pattern`)
count as pattern-local; true cross-file gaps remain `peers`.

Post-fix metrics (`npm run ac:audit`, 212 files): soundness **0/0/0**;
retained-pool recall ~66%; adjusted pool recall **~91%** (excl. declined /
ns-filter / metavar / pattern-local); `missedPeers` ~14k (down from the
flat-collector ~15–53k era). LFAtomicTerm context-recall ~60% (was ~53%).
ContextHead / AtomicPattern rates stay low largely because binder sites
decline by design. Residual `peers` are mostly true cross-file gaps
(`str_equiv`, `bstep`, …), not nested pattern LF vars.

### Phase 10 — Mutual-block visibility (done)

Beluga mutual blocks (`LF a … and b …`, `rec f … and rec g …`, inductive
`and` chains) make every head visible from the **start of the mutual block**,
not only after its own name. Prefix-closed `nameVisible` previously hid
forward refs inside the block, so in-file uses of `bstep` / `str_equiv'` /
`wtp_s` audited as `missedPeers`.

Symbols now carry `visibleFrom` (block start for mutual heads; name start
otherwise). `shiftSymbol` keeps it delta-correct on the incremental path.

Post-fix (`npm run ac:audit`): soundness **0/0/0**; adjusted pool recall
**~91.3%** (was ~90.9%); `missedPeers` ~13.6k (was ~14.1k). Forward mutual
refs (`bstep`, `str_equiv'`, `wtp_s`) resolve in-file. Remaining peer samples
skew toward totality pragma args (`/ total …`) and a few unresolved lowers
(`one`, `bot`) — not mutual-block gaps.

**Phase 10 closed.**

### Phase 11 — Local-scope completion closeout (done)

The full miss census (grouped by reason / name / file / Lezer context) exposed
three remaining local-scope classes that the capped 40-sample list obscured:

- totality annotations refer to the later leading `fn` / `mlam` parameters;
- inductive/coinductive header binders scope through their constructor block
  (including parameter/substitution variables such as `#p` / `$S`);
- `fun` cofunction copatterns bind branch-local arguments.

The symbol store now models all three. Type positions admit visible locals;
sigiled prefixes derive case from the identifier after `#` / `$`; cofunction
binder sites decline while their branch-body uses complete. The audit report
retains the top 200 full-corpus miss groups so future work starts from dominant
classes rather than a sample accident.

Post-fix (`npm run ac:audit`, 212 files): soundness **0/0/0**; retained-pool
recall **71.1%**; adjusted pool recall **93.8%** (target ≥93%); `missedPeers`
~10.2k; LFAtomicType **83%**, AtomicExpression **93%**, ContextHead **51%**,
CompAtomicType **81%**. Full suite: **203/203**.

**Phase 11 closed.**

### Phase 12 — Suite cfg ownership + signature totality (done)

Two actionable residue classes, without inventing free LF metavariables in the
symbol store (that path wrongly turns cross-file uses like `wa u` into locals
and drops graph edges / breaks unresolved-metavar doctrine):

1. **Multi-cfg directories.** Audit (and any caller) picks the cfg that *lists*
   the active file via `owningCfgForFile`, not only the largest/best cfg in the
   folder. Fixes `.elf` peers (`term` / `pred` from `lam.elf`) when a sibling
   cfg (e.g. cover tests) outranks the real suite.
2. **Signature binders in `/ total …`.** `CompTypeBinder` scope extends through
   the enclosing `RecBody`, so `{g:ctx}` is visible in totality annotations
   before the leading `mlam`/`fn` params.

Free uppercase / reconstructed LF vars (`N`, `A`, `sigma`-class implicits with
no in-file def) stay unresolved and audit as `metavar` / honest peer noise —
completing them would invent binders.

Post-fix (`npm run ac:audit`, 212 files): soundness **0/0/0**; adjusted pool
recall **94.8%** (was 93.8%); `missedPeers` ~8.9k (was ~10.2k); retained-pool
recall **75.7%**. Full suite: **203/203**.

**Phase 12 closed.**

### Phase 13 — Live suite ownership + peer census (done)

Phase 12’s `owningCfgForFile` lived in the audit only. Live completion called
`listGroupSymbols` with empty opts, so `developmentForFile` returned standalone
whenever Persist/best cfg did not list the open file (multi-cfg dirs like
church-rosser → missing `.elf` peers).

1. **`developmentForFile`** now falls back to `owningCfgForFile` when the
   preferred cfg’s chain does not include the active file. Preferred still wins
   when it owns; true orphans stay standalone.
2. **Audit** exercises that same seam (preferred = `inferActiveCfgByDir`, no
   special owning override). Emits `recallBreakdown.peerGroups` (top 50 peer
   clusters). Unresolved free names in LF term/type slots — lower or upper —
   classify as `metavar` (doctrine: never invent reconstructed implicits).

Post-fix (`npm run ac:audit`, 212 files): soundness **0/0/0**; adjusted pool
recall **96.2%** (was 94.8%); `missedPeers` ~6.4k (was ~8.9k); metavar bucket
absorbs lowercase LF free implicits. Full suite: **203/203**.

**Phase 13 closed.**

### Phase 14 — Pattern precision + totality audit (done)

Phase 13’s peer census was ~80% totality argument labels and ~20% a real scope
bug: binders inside `(Ctor …)` never entered the symbol store. Separately,
`isPatternArgBinder` treated every identifier after `⊢` in a pattern box as a
fresh binder, so substitution uses (`F1[..,x]`) and known ctor heads declined.

1. **`collectPatternBinders`** descends through `TupleOrParenPattern` into nested
   pattern/app atoms (same ctor-head vs arg rules).
2. **`isPatternArgBinder`** exempts `Substitution`/`SubstBody` uses and known
   LF ctor/constant heads after `⊢`; free boxed vars (incl. nested `linQ`) still
   decline at their binding occurrence.
3. **Audit** buckets unresolved `TotalityArg` as `totalityLabel` and excludes it
   from adjusted actionable recall (alongside metavar / pattern-local).

Post-fix (`npm run ac:audit`, 212 files): soundness **0/0/0**; adjusted pool
recall **98.8%** (was 96.2%); `missedPeers` ~2.1k (was ~6.4k); totality-label
~3.9k honest; LFAtomicTerm raw **67%** (was 62%); declined **4.6k** (was 14k from
false binder declines). Full suite: **203/203**.

**Phase 14 closed.**

### Phase 15 — Let / ascribed pattern binders (done)

Phase 14’s leftover peers were mostly untracked `let` / ascribed `fun` locals
(`ms`, `sn'`, `conf`, `t`), not cfg gaps. Unknown lowercase pattern **heads**
were skipped to avoid inventing mistyped case constructors — correct for bare
case arms, wrong for let LHS and ascribed fun params.

1. **`collectPatternBinders`** binds lowercase heads under `LetExpression`,
   `CofunctionBranch`, or ascribed `Pattern` (`y : T`).
2. **`isPatternArgBinder`** declines those binding occurrences; body uses still
   complete. Bare unknown case heads stay unbound.
3. **Audit** treats unresolved `$`/`#` in `CompAtomicType` as `metavar`.

Post-fix (`npm run ac:audit`, 212 files): soundness **0/0/0**; adjusted pool
recall **99.5%** (was 98.8%); `missedPeers` ~0.9k (was ~2.1k); AtomicExpression
context recall **99%**. Full suite: **203/203**.

**Phase 15 closed.**

### Phase 16 — Mutual continuation visibility + name-pragma hygiene (done)

Phase 15’s leftover peers were ~90% `--name` preferred aliases (`ctx=unknown`)
and ~5% mutual co/inductive forward refs under `DatatypeContinuation`.

1. **`mutualVisibleFrom`** climbs `DatatypeContinuation` to the enclosing
   inductive/coinductive/stratified declaration so continuation heads share
   block-start visibility.
2. **Reference walk** skips identifiers under `NamePreferred` (pretty-print
   aliases); the `--name` constant itself still resolves.
3. **Audit** buckets residual name-preferred unresolved as `namePragma`.

Post-fix (`npm run ac:audit`, 212 files): soundness **0/0/0**; retained-pool
**77.6%**; adjusted pool recall **100.0%** (peers **10**, name-pragma **0**,
symbol-store **0**). Full suite: **203/203**.

**Phase 16 closed.**

---

## 4. What is explicitly out of scope

- **ML / statistical completion, usage-frequency learning.** Not in this plan.
  Any future proposal must slot in as a ranking input inside the justified set.
- **Per-keystroke checker calls** in any form (law 1).
- **REPL autocomplete** (`js/repl/repl-autocomplete.mjs`) — separate surface,
  separate contract; do not "unify" it into this engine as a side effect.
- **Completing binder positions or inventing fresh names** (Phase 2 binder rule).
- **cfg-editor completion** (`ide/cfg-editor.mjs` has its own path list logic).

---

## 5. Execution discipline for agents

- One phase per work item. Read this doc top to bottom first; then `docs/CODEMAP.md`
  §IDE chrome; then the five completion modules in full (they are short).
- Build after `editor-src` edits: `node scripts/build-editor.mjs`. Full suite in
  one call: `npm test`. Audit: `npm run ac:audit` (exists after Phase 0).
- Report flat, gap-first: soundness violations first, coverage second, recall/MRR
  third, latency last. A recall drop with soundness 0 in Phase 1 is *expected and
  correct* — say so plainly, do not pad it.
- Never declare a phase complete from a scoreline alone; the gate list in the
  phase is the contract. If a gate cannot be met, stop and report the gap —
  do not weaken the gate.
- New helpers go in `js/editor-src/ide/completion/`; type-reasoning stays in
  prover/semantic modules and is imported (law 5). Root `js/editor-src/` gets
  nothing new.
