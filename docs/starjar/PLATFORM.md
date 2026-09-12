# \*jar — the platform plan

*The working plan. Rewritten 2026-09-08 against chunks 0–10, which corrected the first draft
in eleven places; figures re-verified against the working tree 2026-09-10. Where this document
and a chunk disagree, the chunk measured it; where a chunk and `FILES.md` disagree, `FILES.md`
re-measured it.*

**This is the \*jar project.** The deliverable is a proof-assistant IDE *platform*. Rocq is
its **first application and its battle test**, targeted for 31 December 2026 — not the goal,
and not the measure of success.

⛔ **Read that as a standing rule.** Every decision in this document is made for the
platform. Where a choice would make RocqJar easier but \*jar narrower, the platform wins.
A "RocqJar project" is a different, smaller project, and it is not this one.

---

## 0. The thesis

BelJar is a proof-assistant IDE whose Beluga-specific parts are smaller, and differently
placed, than they look. Give the shell a **grammar**, a **language pack**, and a **provider
adapter**, and a full IDE falls out.

BelJar becomes the reference implementation, not a fork. Every other assistant — Rocq first,
then Abella, then whatever comes after — is the same shell with two different `<script>`
tags.

### The compensation principle

The finding that reframes the product. \*jar's platform machinery is largely **a library of
compensations for weak backends**:

| Capability | The machinery compensates for |
|---|---|
| `haltsAtFirstError` | the checker reports one error per run → settlement's 8-pass masking loop |
| `proof: 'splice'` | the backend has **no proof API at all** → the splice-and-check prover |
| `project: 'concatenative'` | the backend cannot resolve imports → prelude assembly, offset maths, compression |

A capable backend turns each of them off. Three consequences:

1. **The platform gets easier as backends get stronger.** RocqJar is not "BelJar plus work" —
   it is BelJar with several of its hardest subsystems switched off.
2. **BelJar is near the worst case in the family**, which is the right place to generalize
   from. Every compensation exists and is tested.
3. **The compensations are the real intellectual property.** An assistant with a weak backend
   still gets a full IDE. That is a far stronger claim than "we support many languages."

---

## 1. The unlock: a Provider, not js_of_ocaml

Requiring an in-browser build makes the hardest, least controllable step a precondition.
Instead the shell talks to a **Provider**, and how it reaches the assistant is its own
business:

| Transport | Example |
|---|---|
| in-page js_of_ocaml | Beluga today |
| pre-built browser bundle | Rocq via jsCoq / coq-lsp |
| WASM | anything with a C/Rust core |
| LSP over WebSocket | Rocq, Lean, Isabelle |
| plain REPL over a socket | Twelf, Abella, anything with a CLI |

⛔ **Law: nothing above the provider boundary may assume the backend is in-process.** Every
call is async and cancellable. Already true of the worker seam; it must survive.

This also de-risks Rocq specifically: if an in-browser build fights back, coq-lsp on a
socket changes nothing above the boundary.

---

## 2. The four Needs

| # | Need | Question | Source |
|---|---|---|---|
| 1 | **Shape** | how does text become a tree? | grammar, in-browser |
| 2 | **Meaning** | which nodes are named entities, what kind, what scope? | language pack, in-browser |
| 3 | **Judgment** | is this correct, and where isn't it? | the provider |
| 4 | **Proof** | what goals are open, what may I do? | the provider, *or* the shell |

⭐ **Needs 1 and 2 never touch the backend.** A new language gets navigation, outline,
rename, the explorer, incremental symbols and syntax-plus-scope diagnostics **before its
provider exists**. Grammar work and backend work are fully parallel, which is the schedule's
central unlock.

---

## 3. Capabilities and tiers

| Capability | Values | Turns off |
|---|---|---|
| `haltsAtFirstError` | bool | settlement's divide-and-conquer |
| `proof` | `'splice'` / `'session'` / absent | the move generator, or the session verbs |
| `project` | `'concatenative'` / `'resolved'` | prelude assembly, offset maths, compression |
| `format` | bool | the format command |

| Tier | Requires | Buys |
|---|---|---|
| **0** | `check(units)` | editor, explorer, multi-file projects, persistence, diagnostics, commands, status strip, keymaps, **type-directed completion**, **and a splice-mode prover** |
| **1** | `typeAt`, `declType` | hover, inspector, type-level graph |
| **2** | `proofStart/State/Tactic/Undo/Redo/Translate`, `tactics()` | session-mode Harpoon |
| **3** | `moveCandidates(goal)` | Orca |
| **4** | language oracles | `adjudicate`, `Search`, … |

⭐ **Tier 0 includes an interactive prover.** \*jar can give a proof surface to an assistant
with no proof API whatsoever, given a move generator. State this loudly in `PROVIDER.md`.

⭐ **Tier 0 also includes type-directed completion** (pass 2, F8). `type-expect.mjs` derives
the expected type at the cursor from the AST alone — zero `typeAt`, `declType` or checker
calls. Three features have now turned out to sit *below* the tier first assigned to them
(splice-mode proving, the dependency graph, type-directed completion), all for the same
reason: BelJar computes far more from Shape and Meaning than a wrapper would.

### The proof-session protocol already exists

`js/harpoon/harpoon-client.js` drives all six Tier-2 verbs against `Beluga.ideProof*` —
methods **never implemented** in `beluga_web.ml`. Its header states the discipline: *"only
structured JSON crosses this boundary — never Beluga prose."* A backend-agnostic tactic
protocol, written as a spec, implementation slot empty. Rocq and Abella implement all six
natively.

---

## 4. The Goal

```js
Goal = {
  id, label, target,
  binders: [{ name, type, band }],
  bands:   [{ id: 'meta', label: 'Meta-context' }, { id: 'comp', label: 'Context' }]
}
```

Taken from the shipped `harpoon-model.mjs`, which is better than the first draft's opaque
`meta` blob. A proof context is **named bands of typed binders**: Beluga has two (Δ, Γ),
Abella two, Rocq and Lean one. The provider declares bands with labels; the renderer groups
by band.

---

## 5. The language pack

Not a manifest. A **module**, because Meaning needs functions.

```js
// lang/<x>/index.mjs
export const parser;                       // lezer
export const roles;                        // nodeName → role   (see §6)
export const binders  = { FnExpression: fnParams, … };   // extractors: node → bound names
export const definers = { Inductive: multiHead, '*': firstIdentChild };  // ⚠ return LISTS
export const namespaces = {                // traits, order, labels — three different jobs
  'lf-constructor': { label: 'LF constructor', traits: ['constructor','global'], order: 3 }
};
export const gatherRawDecls;               // block boundaries
export const imports;                      // cross-file name resolution  ⚠ new scope
export const signatureBoundary;            // buys the entire graph subsystem
export const diagnosticFormat = {          // ⛔ correctness-critical, see §8
  location, severities, backtraceMarkers, culpritPatterns
};
export const commands = {                  // ⚠ bidirectional: spelling out, parser back
  typeAt: { send: '%:get-type', parse: parseGetType },
  fsig:   { send: '%:fsig',     parse: parseFsigOutput }
};
export const printer;                      // optional; gates `format`
export const nameResolve;                  // hover / type projection
export const snippets, builtins;           // data
```

⚠️ **`definers` returns a list of heads, always.** Mutual declarations are the general case,
not a Beluga quirk: `LF n … and a …`, `Inductive even … with odd …`, `Fixpoint f … with g …`.

---

## 6. Shape is the dominant cost

### The full Beluga surface, four dimensions (pass 3, F13)

| Dimension | Sites | Nature | Work |
|---|---:|---|---|
| **grammar node names** | **1,416** | structural | roles conversion — the only one needing design |
| Beluga-named identifiers | 600 (75 names, 49 files) | naming, incl. public globals `BelugaClient` / `BelugaRun` / `BelugaText` | rename + compat aliases |
| ~~`.bel-` CSS namespace~~ | ~~177~~ | branding | ✅ **done 2026-09-11** — both prefixes → `jar-`, 1,796 sites |
| file extensions | 79 | semantic | language-pack `extensions` field |
| **total** | **~2,272** | | |

⭐ Only the first requires design. The other 856 sites are mechanical — exactly what agent
throughput is best at, and what a differential gate makes safe. **Schedule the renames; do
not discover them.** Precedent: `compat/beljar-window-aliases.mjs` already carried one global
rename (`BelJar*` → system nouns) with a shim to burn later.

### The structural dimension

The first draft cited `NAMESPACE`'s 12 constants. The real number:

| | |
|---|---|
| distinct grammar node names referenced from JS | **162** |
| total hardcoded reference sites | **1,416** |
| of which language-pack-by-nature (relocate, don't generalize) | **~446** — `printer` 193, `snippets` 106, `builtins` 49, `hole-split` 48 |
| of which platform code to convert | **~970** |

### The design: names → roles

Platform code switches on **role**; each pack ships one name→role table. A first-cut
vocabulary of ~25 roles (identifier, comment, declaration, binder, reference, application,
abstraction, branch, pattern, typeExpression, proofScript…).

The mapping is many-to-one, strongly so for Beluga, which carries **two parallel term
languages** (`LFType`/`CompType`, `LFKind`/`CompKind`, `LFLambda`/`FnExpression`/`MLamExpression`)
that Rocq does not. Rocq's grammar should map a *smaller* name set onto the same roles.

⛔ **The pilot ran on 2026-09-10 and falsified this.** `ide/sticky-decl.mjs`, 62 sites:
**42%** reduce to a pure role — below the 80% threshold. See `PHASE0.md` §2.

⭐ **The corrected abstraction:** a language pack is **a module of tables — roles, strategies
and relations — not a flat `nodeName → role` map.** Three escape hatches, all pack data:

- **pairwise relations** (`RecDeclaration` is redundant when `RecBody` is on the path),
- **per-node extraction strategies**, a small closed set: `beforeToken('FatArrow')`,
  `keywordLabel('CaseKeyword','case')`, `identChild`, `headIdent`, …
- **concrete token names** as strategy arguments.

Counting roles and strategies together, **81%** of sites become pack data and the remaining
fifth is six pairs and four token names. Strategies are parameterised data, so
`beforeToken('FatArrow')` ports to Rocq as `beforeToken('Dot')` with no platform change.

This is the same shape chunk 3 found independently in `doNamesWalk`, where the dispatch
generalized and the binder *extractors* did not. Two unrelated files, one answer — which is
why §5 describes the pack as a module and this section now agrees with it.

---

## 7. What is already generic

Measured, not assumed:

| Subsystem | LOC | Language coupling |
|---|---|---|
| graph (3D, flat, webgl, force-sim, grouping, nav) | 4,868 | **0** |
| inspector | 2,914 | **0** |
| explorer | 2,994 | **0** |
| library | 4,155 | **0** |
| settlement / scheduler / health | ~1,150 | **0** |
| pretty-printer engine (`doc`, `layout`, renderers) | 1,270 | ~10 |
| status strip | 3,695 | 3 lines |
| command catalog (156 commands) | — | 24, in three clean capability groups |

⭐ **Dependency graphs leave the post-window list.** They are already generic; one function
(`signatureBoundary`) buys the whole subsystem. The claim can be made today.

### Capability gating already exists

`command-catalog.mjs` is data only; behaviour attaches separately; `Commands.list({ palette,
runnable, available })` already narrows on exactly the right axes. Adding `requires: ['proof']`
plus a `capable` filter is one field and one predicate.

Concretely: **24 of 156 commands** need `requires`, in three clean groups — 15 `proof`,
3 `proof`+`moveCandidates`, 6 `check`. `CATALOG` carries `requires` on 0 entries today.

⛔ But the projection must be **tested**, not the model — the law bought with four shipped
lies at 236/236 green. And one is still half-live: as of 2026-09-10 `ide/context-menu.mjs`
resolves its *chord labels* through `Commands.liveChord`, but still **hand-builds its item
list** — now including `'Introduce'` (`%:intro`) alongside `'Open in Harpoon…'`.
`app-menus.mjs` likewise. What a menu SAYS derives; what a menu OFFERS does not, and only the
second makes dead affordances. Fix before delamination.

---

## 8. The two dangerous couplings

**(a) Prose is load-bearing for correctness.** Settlement masks blocks to extract multiple
errors from a one-error checker; masking creates **induced** unbound-identifier errors, and
settlement discards them via `namedCulprit`'s regexes. ⛔ If a language's culprit patterns
are wrong, settlement cannot separate induced errors from real ones and **the file shows
errors that do not exist**. Failure mode is silently wrong diagnostics, not a crash.

**Gate: a masking round-trip test per language.** Mask a known block; assert every induced
error is recognised and discarded.

Prose is scraped in **five platform loci** — `ide/beluga-diag.mjs`, `semantic/settlement.mjs`,
`ide/hover.mjs`, `repl/repl-output.mjs` and `beluga/beluga-text.mjs` — plus `prover/*`, where
it is correct because Orca reads its own oracle. The count has grown at every pass, so the
rule is a **boundary, not a list**: prose parsing inside `lang/` is fine, outside it is debt,
and a lint enforces that. The command channel is also **bidirectional** — spelling out,
format parsed back.

**(b) Mode B undo must not refuse.** In splice mode, undo restores a text snapshot and cannot
fail. In session mode it must call `proofUndo()` **and** restore the local snapshot across an
async boundary. ⛔⛔ "Undo must never refuse" was bought with a 57-check probe. Design it in
the provider spec — the likely answer is that the shell's snapshot stays authoritative and
the backend is re-synced by replay.

---

## 9. Orca

73% generation, 15% frame, 11% surface. The strategic claim holds — porting Orca means
writing a move generator, not rewriting an engine — but the first draft overstated the code:
**"generation pays, search control does not" says where the value is, not that the code is
separated.** `prover-orchestrator.mjs` interleaves the search loop with Beluga heuristics
(`coinductiveFamiliesOf`, `hypotheticalMeasures`, `pruneOneBranch`, `caseArmLine`).

**Decision: Orca stays Beluga-only through December.** The frame is ~1,500 usable lines
tangled inside 1,705; ⛔ the engine invariants forbid casual refactoring of
`proveProgramCore`; and Rocq needs no move generator at all (Mode B). Orca is not on the
critical path.

⛔ **Standing rule: nothing in the December work may make the frame extraction harder.** The
prover directory is relocated to `lang/beluga/` and otherwise left alone.

---

## 10. Distribution

```html
<script src="js/lang/beluga.js"></script>       <!-- grammar, manifest, meaning, printer -->
<script src="js/providers/beluga.js"></script>  <!-- backend adapter, owns its worker -->
<script src="js/editor-cm.bundle.js"></script>  <!-- language-neutral core -->
<script src="js/shell.js"></script>             <!-- language-neutral -->
```

**Swap the first two lines and it is RocqJar.** The provider is already an independently
loaded script; only the language pack needs the same treatment, and the grammar is imported
by exactly **17 files**, all pulling the same `{ parser }` object. Packs register on a global
exactly as `beluga-client.js` does — no module-system change, no dynamic import, no
duplicated core.

⚠️ `check-build-stale.mjs` must extend to every language and provider bundle.

---

## 11. The schedule to 31 December

~16 weeks from 8 September. Two tracks run in parallel from week 3, because Shape and Meaning
have **zero backend dependency**.

### Phase 0 — instrumentation and truth (Sep 8–19)

Blocks everything. ~104k LOC of refactor gated only by the unit suite, with `prover:diff`
down, is the one thing that could actually sink this.

- **Shell differential.** Golden outputs over the 850-file corpus: parse → symbols → scopes →
  outline → local diagnostics. Not the prover.
  ⭐ **This is not one gate among several — it is the gate** (pass 7, F27). Only 20 of 257
  unit tests reference a grammar node name, so the suite survives the roles conversion and
  protects it well; but 194 of 257 are written in Beluga and say nothing about a second
  language pack. Build it on `scripts/corpus-harness.mjs`; unlike `prover:diff` it needs no
  native oracle, so it is buildable today.
- **Clear the strays.** Six debug/temp files sit in `scripts/` (292 LOC, F30). Probes belong
  in `scratch/probes/`.
- **Purity lint.** Node-name sites per file, wired into `npm test` as a monotone-decreasing
  gate. This is the number the project is measured by.
- **Fix the menus.** `context-menu.mjs` and `app-menus.mjs` build their item lists from the
  registry, not by hand. Chord labels already derive; the items do not.
- **Annotate `requires`.** 24 of 156 catalogue entries, three capability groups — mechanical,
  and it unblocks the projection probe in Phase 1.
- ⭐ **The role pilot** on `ide/sticky-decl.mjs` (62 sites, no semantic subtlety). Measure the
  clean-reduction rate; collect the escape hatches. **The highest-information action in the
  whole project** — it decides §6's strategy.

### Phase 1 — core delamination (Sep 22 – Oct 17)

- Language registry; convert the 17 parser imports.
- **The renames** (F13): `Beluga*` → `Provider*` across 600 identifier sites with compat
  aliases, and `.bel-` → `.jar-` across 177 CSS-class sites plus `css/`. Mechanical, gated by
  the differential, and cheaper now than after `css/` and every probe selector hardens.
- Relocate the ~446 language-pack-by-nature sites to `lang/beluga/` **first** — cheap, and it
  makes the remaining number honest.
- Convert the ~970 platform sites to roles.
- Extract the Meaning module: `binders`, `definers`, `namespaces` with traits/order/labels.
- Provider interface, capabilities, and the **conformance suite** — seeded by rewriting the
  **20 contract tests** (settlement, checker store, diagnostics, prelude, dirty frontier,
  cross-file: 2,826 LOC) against `MockProvider` (F28). Their assertions already describe
  provider obligations; only the inputs are Beluga.
- ⭐ **`MockProvider`** — a toy language exercising every tier — and the **capability-projection
  probe**: for a provider declaring set *C*, no surface offers anything outside *C*, and
  everything inside *C* is reachable. Run against Tier 0, Tier 0+2, and full.
- Exit: purity lint reads 0 outside `lang/` and `providers/`; corpus symbol output identical.

### Phase 2 — Rocq Shape + Meaning, no backend (Oct 6 – Nov 14, parallel from week 5)

- Rocq lezer grammar. Two precedents already solved in `beluga.grammar`: **`Proof … Qed` as
  one opaque node** via an external tokenizer (do not parse Ltac), and **`.` disambiguation**
  via contextual tokens.
- Rocq manifest, meaning module, `imports` function, `signatureBoundary`.
- ⭐ **Milestone: RocqJar with no provider.** Open real `.v` files with outline,
  go-to-definition, find-references, rename, explorer, incremental symbols, and syntax plus
  scope diagnostics. A demonstrable product two months before the deadline.

### Phase 3 — the Rocq provider (Nov 17 – Dec 12)

- coq-lsp adapter. Transport decided by what works; reversible by §1.
- **Measure** `haltsAtFirstError`, the `project` capability, the goal format, the error
  format. Everything about Rocq in this plan is currently expectation.
- Diagnostics: location grammar (OCaml-standard, largely inherited), severity keywords,
  culprit table, **and the masking round-trip test**.
- Mode B session: six verbs, `tactics()`, bands. Undo designed against §8(b).

### Phase 4 — ship (Dec 15–31)

- Tier 1 (`typeAt`, `declType`) for hover, inspector, type-directed completion.
- `format: false` is an acceptable v1 — a Rocq printer is not required.
- `PROVIDER.md`, the port guide, conformance as the public contract, OSS packaging.
- Buffer.

### ⚠ The escape hatch

**The December date outranks the abstraction — but never the platform.** If the roles
conversion stalls, the Rocq application may fork specific files rather than block on
generalizing them. A forked file is a debt logged in `docs/starjar/`, not a failure.

⛔ What may **not** be compromised, at any deadline pressure: the provider interface, the
capability declarations, and the conformance suite. Those are not scaffolding for RocqJar —
they *are* the deliverable. Narrowing the interface so one application fits is how a platform
project quietly becomes a single-language project, and it is the failure mode this rule
exists to prevent. Slip the date first.

---

## 12. What has not been measured

- **Rocq itself.** coq-lsp's protocol, goal format, error format and halt behaviour are all
  expectation. Phase 3 settles it, and Phase 2 is deliberately independent of the answer.
- **Performance under a remote provider.** Thread 2's input-lag work assumed an in-process
  worker; a socket transport changes the latency model and nothing has measured it.
- **The `.js`/`.mjs` duplicate build.** Whether language packs must maintain the same duality
  is an open build question.

---

## 13. The road past Rocq

Rocq is the battle test, not the destination. What it proves, and what it leaves unproven,
determines what comes next.

### What RocqJar validates

Tier 0–2, `project: 'resolved'`, `haltsAtFirstError: false`, `proof: 'session'`, a
name-resolved import model, and a grammar with a fundamentally different term language from
Beluga's. That is a hard test and it exercises most of the interface.

### What RocqJar leaves unproven — and Abella covers

**Abella is the next application, and it tests things Rocq structurally cannot.**

| | Rocq | Abella |
|---|---|---|
| transport | pre-built browser bundle or coq-lsp | ⭐ **a plain REPL over a socket** |
| `project` | `'resolved'` | `Specification` / `Import` — a third shape |
| logic | CIC, one context band | two-level logic, **nominal + hypothesis bands** |
| relation to Beluga | distant | close — HOAS, the same problem family |

⭐ **The socket-REPL transport is the claim §1 rests on** — that an assistant with no JS
story at all still gets the full IDE. If Rocq ships as a pre-built bundle, that claim is
never exercised. **Abella is the cheapest way to prove it**, and until something proves it,
§1 is an argument rather than a fact.

Abella also exercises the **two-band Goal** (§4) against a logic that is not Beluga's, and a
third project model. Those are exactly the assumptions most likely to be Beluga-shaped
without anyone noticing.

### Sequencing

\*jar → Rocq (battle test, Dec 2026) → Abella → others. Abella is **not scheduled inside the
window**, because a second application before the first one works proves nothing. It is the
next thing after, and the interface is designed against it now so that it stays cheap.

---

## 14. Out of the window

- Orca move generators for any language other than Beluga (§9).
- The Orca frame extraction (§9).
- A Rocq pretty-printer (`format: false` ships).
- The Abella application itself (§13) — designed for, not built.
