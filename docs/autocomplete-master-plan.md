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
| `snippets.mjs` | Structural scaffolds (`LF`/`rec`/`case`/`| … ⇒`) keyed by structure slot. Separate CM section. Tab accepts. |
| `weigh.mjs` | `rankLookupItems(items, query, limit)` — fuzzy is admission *and* rank when query nonempty; empty query preserves contributor order via `scoreHints.base`. |
| `source.mjs` | CM glue: `belCompletionSource`, `belAutocompletion` (`activateOnTyping: true`, `MAX_OPTIONS = 24`), fills payload from `getHoleActionContext()` (assembled code + `offsetLines`). |
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
- Snippets live in a CM `Structure` section, ranked above idents so **Tab**
  accepts the scaffold at empty-query structure slots.
- After `|` opens an arm, the slot ends — pattern constructors resume.

### Phase 6 — Scoped growth: module members, then ranking polish

1. **Module member access** (`Foo.bar`): ~~extend the symbol store with per-module
   member tables~~ **done** — `membersOfModule` / `moduleMembersOf` over structural
   keys (`Mod/Decl#name`); `classify` detects `Ident . partial` (Observation or
   type-position error recovery); offer set = that module's **direct** exports with
   J2. Unknown module head → fall through (not a fabricated path). Nested
   `Mod/Inner/…` symbols are withheld until `Inner.` is typed.
2. **Ranking polish, audit-driven only.** With soundness pinned at 0, tune
   `weigh.mjs` weights (fuzzy vs `just` vs proximity vs peer penalty) against
   MRR on the Phase 0 harness. Every weight change lands with its before/after
   MRR table in the commit message. No intuition-only tuning.

Gate: MRR reported; soundness still 0; latency budget held.

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
