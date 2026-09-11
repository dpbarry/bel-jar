# Chunk 1 — The boundary

*What actually crosses between BelJar and Beluga. Measured, not assumed.*

---

## 1. There is not one boundary. There are four channels.

The 14-method shim is the boundary everyone points at. It is the smallest and healthiest of
four, and three of the four are invisible from the shim.

| Ch | Channel | Direction | Medium | Size | Health |
|---|---|---|---|---|---|
| A | **Call** | shell → backend | JS method calls | 14 methods, 16 call sites | good |
| B | **Command** | shell → backend | `%:` command strings | 5 commands | fair |
| C | **Prose** | backend → shell | human-readable text, scraped by regex | 343 lines | **the real coupling** |
| D | **Grammar reach** | shell → shell | diagnostics code reading AST node names | small but structural | hidden |

---

## 2. Channel A — the call surface

Every `Beluga.<method>` call site in the tree:

```
loadFromString  checkFromString  runCommand  reset  create
getCommittedFingerprint
ideTypeAtJson  ideDeclType  ideElaborateDecl  ideCommandJson  ideAdjudicate
ideHarpoonAuto
ideProofStart  ideProofState  ideProofTactic  ideProofUndo  ideProofRedo  ideProofTranslate
errors  warnings
```

Three groups, and they map cleanly onto the Needs:

- **Session hygiene** (`create`, `reset`, `getCommittedFingerprint`) — pure plumbing,
  universal.
- **Judgment** (`loadFromString`, `checkFromString`, `errors`, `warnings`) — Need 3.
- **Elaboration** (`ideTypeAtJson`, `ideDeclType`, `ideElaborateDecl`) — Need 3, richer tier.
- **Proof** (the six `ideProof*` verbs) — Need 4.
- **Beluga-specific oracles** (`ideAdjudicate`, `ideHarpoonAuto`) — genuinely local. Two of
  nineteen. These become Tier 4 optional.

⭐ **The six `ideProof*` verbs are called but were never implemented.** They do not appear in
`Beluga-W/src/web/beluga_web.ml`. `js/harpoon/harpoon-client.js` drives them against a
backend that does not exist; the shipped Harpoon runs on the pure-JS engine instead. The
header comment on that file already states the discipline the whole platform needs: *"only
structured JSON crosses this boundary — never Beluga prose."*

This is a backend-agnostic tactic protocol, written as a spec, with the implementation slot
empty. It is the single most valuable artifact for the port.

---

## 3. Channel B — the command surface

Every `%:` interpreter command the shell issues:

| Command | Semantic operation | Universal? |
|---|---|---|
| `%:get-type` | type at a position | yes |
| `%:split` | case-split a goal | yes (every assistant has it) |
| `%:intro` | introduce a binder | yes |
| `%:fsig` | signature of a function | yes |
| `%:constructors-comp` | constructors of a type | yes |

All five are semantically universal; only the **spelling** is Beluga's. This channel
generalizes by moving the spelling into the provider: the shell asks for *the operation*,
the provider knows the string. No shell logic changes.

⛔ Known trap, already paid for: `%:split` breaks on an argument marked by `/ total /`,
because totality marks it `TypInd` and `genPatCGoals` has no case for it. The provider, not
the shell, owns workarounds like this.

---

## 4. Channel C — the prose channel (the real coupling)

`js/editor-src/ide/beluga-diag.mjs`, 343 lines, exists because **diagnostics arrive as human
prose and have to be scraped**. This is the boundary that will actually cost time, and it is
entirely invisible from the shim's type signature.

It does four separable jobs:

**(a) ANSI stripping and line normalisation.** Universal. Free.

**(b) Location parsing.**

```
/^File\s+"[^"]*"\s*,\s*line\s+(\d+)\s*(?:,\s*column\s+(\d+)|,\s*characters?\s+(\d+)(?:-(\d+))?)?/i
```

⭐ This is **the OCaml ecosystem's standard error format**, not a Beluga invention. Rocq
emits `File "./foo.v", line 3, characters 0-10:`. Abella and anything else built with the
OCaml toolchain land in the same shape. This parser is very close to portable for free
across exactly the family of assistants \*jar is targeting first.

**(c) Severity and body extraction.** `^(Error|Warning):`, plus OCaml backtrace suppression
(`Raised at`, `Called from`, `Re-raised`, `Backtrace`). Ecosystem-standard again.

**(d) `namedCulprit` — identifier recovery from error prose.** Five English-language
patterns:

```
Identifier X is unbound
Unbound (identifier|variable|operator|constructor|type|module|namespace) X
X is unbound
X is not (bound|defined|in scope)
(No|Unknown) (operator|pragma|constructor) X
```

These are **natural-language heuristics, not Beluga syntax**. Rocq says
`The reference X was not found in the current environment.` Different sentence, same job.
This is a per-language pattern table: data, not code.

**Verdict on Channel C:** roughly three quarters of it is OCaml-ecosystem convention and
ports nearly unchanged. The remaining quarter is a per-language regex table that belongs in
the language pack. This is far better than the line count suggests.

---

## 5. Channel D — the hidden one: diagnostics reach into the grammar

Two places in the diagnostic layer bypass the provider entirely and read the AST directly:

- `locateToken` walks the lezer tree looking for node names `LowerIdentifier` and
  `UpperIdentifier`, to point a squiggle at the real token when the error has no column.
- `firstMeaningfulLineAnchor` hardcodes `%` and `%{{{` as comment syntax to find the first
  meaningful line.

**Consequence: Judgment is not independent of Shape.** The diagnostic layer needs the
language pack to tell it which node names are identifiers and what a comment looks like. It
cannot be generalized against the provider interface alone.

This is small — two functions — but it is the kind of thing that, left undiscovered, turns
into a week of confusion in November. The manifest must declare:

```js
identifierNodes: ['LowerIdentifier', 'UpperIdentifier'],
commentPrefixes: ['%', '%{{{'],
```

---

## 6. What chunk 1 changes about the plan

1. **The provider interface must carry a diagnostic *format* declaration**, not just a
   `check()` method. Location grammar, severity keywords, backtrace markers, and the
   culprit-pattern table are provider data.
2. **The manifest must serve the diagnostic layer**, not only the symbol layer. Identifier
   node names and comment syntax are shared between Shape and Judgment.
3. **`%:` spellings move into the provider.** The shell asks for operations by name.
4. **Two of nineteen calls are irreducibly Beluga.** `ideAdjudicate` and `ideHarpoonAuto`
   become Tier 4. Everything else is universal in shape.
5. **The six proof verbs are a spec, not a debt.** Implementing them for Rocq is filling an
   empty slot that already has a client written against it.

---

## 7. Open questions carried to later chunks

- Does `beluga-run.mjs` (637 lines) scrape prose too, or only route it? → chunk 4.
- How does the settlement use `namedCulprit` to recognise *induced* errors from masked
  blocks, and is that mechanism language-neutral? → chunk 4.
- What exactly does `ideElaborateDecl`'s batch position protocol assume? → chunk 3.
