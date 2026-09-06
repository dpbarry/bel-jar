# The Jar Platform — a generic proof-assistant IDE

*The plan document. How BelJar becomes a platform, what a new assistant costs to add,
and the 16-week schedule that gets there with a second assistant shipped.*

---

## 0. The thesis

BelJar is not a Beluga UI that happens to be nice. It is a **proof-assistant IDE whose
Beluga-specific parts are smaller than they look**, sitting on top of ~45k LOC that is
already language-neutral by accident of discipline.

The platform claim:

> Give the shell a **grammar**, a **manifest**, and a **provider adapter**, and a full IDE
> falls out: editing, navigation, outline, project explorer, diagnostics, the command
> layer, the status strip, persistence, and an interactive proof surface.

**BelJar** then becomes the reference implementation, not a fork. **RocqJar**, **AbellaJar**
and anything else are language packs against the same shell.

---

## 1. The unlock: a Provider, not js_of_ocaml

The original framing was "js_of_ocaml any OCaml assistant, tweak, ship." That framing makes
the browser build a precondition, and the browser build is the single most expensive and
least controllable part of every port.

**Invert it.** The shell talks to a `Provider`. A provider is an object satisfying an
interface. *How* it reaches the assistant is its own business:

| Transport | Example | Cost |
|---|---|---|
| in-page js_of_ocaml | Beluga (today), Abella | high once, then free |
| pre-built browser bundle | Rocq via jsCoq / coq-lsp | integration only |
| WASM | anything with a C/Rust core | medium |
| LSP over WebSocket | Lean, Rocq, Isabelle | low |
| plain REPL over a socket | Twelf, Abella, anything with a CLI | lowest |

This single decision is what makes "literally anything" honest rather than aspirational.
An assistant with no JS story at all is still reachable through a small socket adapter, and
the user gets the same IDE. The in-browser build becomes an *optimisation* for assistants
that can afford it, not the entry fee.

⛔ **Law: nothing above the provider boundary may assume the backend is in-process.**
Every provider call is async and cancellable. This is already true of the worker seam
today; it must survive generalisation.

---

## 2. The Provider interface

Five tiers. A provider declares what it implements; **the shell derives every surface from
that declaration** and offers nothing it cannot deliver.

### Tier 0 — required

```js
capabilities() -> Capabilities     // the declaration everything else derives from
check(units)   -> Diagnostic[]     // the only mandatory intelligence
```

A Tier-0 provider already gets: editor, syntax highlighting, folding, the explorer,
multi-file projects, persistence, diagnostics with gutter, the command palette, the status
strip, keybindings including the Vim and Emacs layers.

### Tier 1 — elaboration

```js
typeAt(unit, pos) -> TypeInfo | null
declType(name)    -> TypeInfo | null
```

Unlocks: hover, the inspector, type-directed completion, the type-level dependency graph.

### Tier 2 — proof sessions

```js
proofStart(unit, pos)        -> ProofState
proofState()                 -> ProofState
proofTactic(subgoal, tactic) -> ProofState
proofUndo() / proofRedo()    -> ProofState
proofTranslate()             -> string        // session back to source text
tactics()                    -> TacticSpec[]  // the declared vocabulary
```

Unlocks: the whole Harpoon surface.

**This protocol already exists in the tree.** `js/harpoon/harpoon-client.js` drives exactly
these six verbs against `Beluga.ideProof*` — methods that were **never implemented** in
`Beluga-W/src/web/beluga_web.ml`. A backend-agnostic tactic protocol was written as a spec
and left without an implementation behind it. Rocq and Abella both implement all six
natively.

### Tier 3 — search substrate

```js
moveCandidates(goal) -> Move[]   // language-specific move generation
```

Unlocks: Orca. See §5.

### Tier 4 — optional oracles

Provider-specific extras (Beluga's `adjudicate`, Rocq's `Search`, Abella's `search`),
surfaced only through capability-gated commands.

---

## 3. The generic Goal

The load-bearing question for genericity is whether the assistants share a proof-state
shape. They do:

| | context | target |
|---|---|---|
| Beluga | meta-context Δ + computation context Γ | computation type |
| Rocq | hypothesis context Γ | CIC conclusion |
| Abella | nominal context + hypotheses | formula |
| Lean | local context | target type |

All four are **a list of named, typed hypotheses plus a target**. So:

```js
Goal = {
  id: string,
  hypotheses: [{ name, type, kind?, sort? }],
  target: string,
  meta?: unknown        // opaque provider payload, round-tripped, never interpreted
}
```

`meta` is the pressure valve. Beluga's split between Δ and Γ, Rocq's universe constraints,
Abella's nominal constants: all ride in `meta`, are rendered by a provider-supplied
formatter, and are handed back untouched on the next call. The shell never parses them.

This is sufficient for the goal renderer, the holes card, the node graph, subgoal
navigation, undo/redo, and the search frame.

---

## 4. Tactics as data

```js
TacticSpec = {
  name: 'intro',
  args: [{ kind: 'ident' | 'term' | 'nat' | 'choice', optional, choices? }],
  appliesWhen?: (goal) => boolean,   // provider-supplied predicate
  doc: 'short one-liner'
}
```

The Harpoon picker stops being a Beluga-shaped menu and becomes **a renderer over a
declared vocabulary**. Beluga contributes `intro / split / unbox / solve / by / suffices`;
Rocq contributes `intro / apply / destruct / induction / rewrite / exact / auto`; Abella
contributes `intros / case / apply / search / induction / split`.

This is the "surfaces must derive, not retype" law applied at platform scale, and it is the
single failure mode that would make an open-source release embarrassing: a RocqJar whose
menus are full of unpressable Beluga affordances. Capability gating is not a nice-to-have;
it is the load-bearing design.

---

## 5. Generic Orca

Orca today is `candidateMoves` (generation) plus `proveProgram` (search loop with pruning).
The project's own hardest-won law is that **generation pays and search control does not**:
every gain ever measured came from a missing move or mis-emitted text, and 22 prune/rank
attempts produced zero.

That law is exactly what makes Orca portable, because it says the two halves are cleanly
separable and the valuable half is the language-specific one:

- **The search frame is generic.** Goal stack, move application, backtracking, pruning, the
  oracle-certification loop, and the idle → running → paused → absorbed state machine.
  Platform code, written once.
- **The move generator is per-language.** Tier 3's `moveCandidates(goal) -> Move[]`.

So porting Orca to Rocq is *writing a move generator against the generic Goal shape*, not
rewriting an engine. Beluga's LF context splitting, schema-driven case analysis, box and
`mlam` introduction, and `/ total /` handling stay in `lang/beluga/moves.mjs` where they
belong. They were never platform code.

⛔ Orca's soundness rules travel with it. An untotalied COMPLETE is not a proof, and each
per-language move generator must supply its own certification predicate.

---

## 6. The contract

**What a new assistant costs.**

| Artifact | Effort | Measured by |
|---|---|---|
| `grammar.lezer` | ~2 weeks, agent-authored from a language reference plus a corpus | corpus-clean % (Beluga hit 99.1%) |
| `manifest.mjs` | ~1 day | node → symbol kind, binder and reference nodes, scope extents, comment and string syntax |
| `provider.mjs` | ~1 week given a JS build, an LSP, or a REPL | the conformance suite |
| `tactics.mjs` | ~1 day | Tier 2 only |

**What falls out free.** Editor with highlighting, folding and formatting primitives;
incremental symbol store; go-to-definition; find-references; rename; outline; project
explorer with health dots; name-level dependency graph; 102 language-neutral commands; the
command palette; the status strip; keybindings with the Vim and Emacs layers; workspace
persistence; the library; multi-file projects; diagnostics with gutter and inline
highlighting. Tier 1 adds hover, the inspector, type-directed completion and the type-level
graph. Tier 2 adds the entire Harpoon surface. Tier 3 adds Orca's frame.

---

## 7. The 16 weeks

Four parallel tracks. Agent-driven throughput is high on well-specified mechanical
refactors across a tree with 249 test files, and low on open-ended research; this plan is
deliberately almost entirely the first kind.

### Week 0 — instrumentation (non-negotiable, blocks everything)

A 134k-LOC refactor gated only by 236 unit tests is the one thing that could actually sink
this, and `prover:diff` is currently down.

- **Shell differential.** Golden outputs over the 850-file corpus through parse → symbols →
  scopes → outline → diagnostics. Not the prover. This is the safety net for tracks B and C.
- **Purity lint.** Per-directory count of language-specific identifiers, wired into
  `npm test` as a monotone-decreasing gate. This is the number the project is measured by.

### Weeks 1–3 — Track A: the interface

Spec `Provider`, `Capabilities`, `Goal`, `TacticSpec`, `Diagnostic` and `SymbolKind` as a
versioned document, plus JSDoc types, plus a **conformance suite**. Implement
`BelugaProvider` over the existing 14 shim methods as the reference.

⭐ **Write `MockProvider` in week 3, before any real second backend.** A small toy language
(simply-typed lambda calculus with a trivial checker) that exercises every capability tier.
It costs days and it catches Beluga-shaped assumptions in the interface in week 3 instead
of week 14. An interface with one implementation is unfalsified by construction; the mock
is the cheapest possible falsifier.

### Weeks 2–5 — Track B: shell delamination (parallel)

- Capability-gate the registry: each of 119 commands declares required capabilities, and
  the palette, keymap, settings panel and status strip **derive** from the declaration.
- Purge the two `ui/` files, plus `workspace/`, `persist/` and `boot/`.
- Rename `window.Beluga` → `window.Provider`, `BelugaClient` → `ProviderClient`.
- **Exit criterion: purity lint reads 0 outside `providers/` and `lang/`.**

### Weeks 4–8 — Track C: language pack extraction

- `beluga.grammar` → `lang/beluga/grammar.lezer`.
- `NAMESPACE` (12 constants) and the node-name switch at `project-prelude.mjs:145-152` →
  `lang/beluga/manifest.mjs`, declarative.
- Symbol store, scope resolution, semantic graph, outline and completion become
  manifest-driven.
- **Exit criterion: byte-identical symbol output on the 850-file corpus, before vs after**,
  using the equivalence-test pattern already proven on the incremental symbolStore.

### Weeks 6–9 — Track D: toy provider end-to-end (parallel)

Ship a genuinely usable IDE for the mock language. If this does not work, everything
downstream is fiction, and it is far cheaper to learn that here than in Rocq.

### Weeks 9–14 — Track E: RocqJar

- Provider adapter over a pre-built browser Rocq (jsCoq / coq-lsp) or, if that fights back,
  over coq-lsp on a socket. **The transport decision is reversible and does not change a
  line above the provider boundary** — this is the insurance §1 buys.
- Rocq grammar, scoped to a real working subset: `Definition`, `Fixpoint`, `Inductive`,
  `Lemma` / `Theorem` / `Proof` / `Qed`, `Require Import`, notation basics.
- Map Rocq goals into the generic Goal; universe and evar detail rides in `meta`.
- Wire Rocq's tactic engine to the six verbs.
- **Deliverable: open a `.v` file, check it, see goals, run tactics, navigate, outline.**

### Weeks 12–16 — Track F: Abella, polish, release (parallel)

- Abella provider. The cheapest real second confirmation: a small language, close enough to
  Beluga's world to be quick, different enough to catch residual assumptions.
- `docs/PROVIDER.md` and a "port your assistant in a weekend" guide.
- OSS repo, license, CI, and the conformance suite as the public contract.

---

## 8. Risks, and what buys them down

| Risk | Buy-down |
|---|---|
| Silent semantic regressions across a 134k-LOC refactor | Week 0 shell differential plus corpus equivalence tests as track exit criteria |
| The interface is secretly Beluga-shaped | `MockProvider` in week 3; Abella as the second confirmation |
| Rocq's browser build fights back | Transport-agnostic provider; fall back to coq-lsp on a socket without touching the shell |
| Rocq's goal model strains the six verbs | Opaque `meta` payload; the protocol is deliberately loose |
| Grammar authoring is the real per-language cost | Agent-authored against a corpus with a corpus-clean metric; a 2-week budget that is measured, not guessed |
| A shipped surface offering dead affordances | Capability gating designed in from week 2, never retrofitted |

---

## 9. What is explicitly outside the window

Stated so the plan is honest about its edges, not to pre-emptively narrow it:

- **Orca move generators for Rocq or Abella.** The frame is platform code inside the
  window; the per-language generators are the follow-on work.
- **Type-level dependency graphs for Tier-0 providers.** Name-level is free; type-level
  needs Tier 1.
- **The Beluga pretty-printers** in `editor-src/format/`. Generic formatting primitives
  land; per-language proof and type rendering is a language-pack artifact.
