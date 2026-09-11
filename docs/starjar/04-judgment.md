# Chunk 4 — Judgment

*Is this correct, and if not, where and why. The only Need that requires a backend — and
much less of it than expected.*

---

## 1. There are two diagnostic streams, and one of them needs no backend

`syntaxLintTreeInner` assembles the local stream:

```js
const { blockAt, parseDiags } = walkTree(tree, doc);          // parse errors
const queryDiags = lintQueryPragmaBounds(tree, doc);          // pragma bounds
const appDiags   = collectUndefinedApplicationDiags(tree, doc); // unbound names, arity
const merged = mergeDiagLists(mergeDiagLists(parseDiags, queryDiags), appDiags);
```

`lintPresentation` then merges that with the backend stream (`getBelugaDiagnostics()`).

| Stream | Source | Needs a provider? |
|---|---|---|
| **Local** | grammar + Meaning | **no** |
| **Backend** | scraped prose | yes |

⭐ **A language with a grammar and a Meaning module already has red squiggles.** Syntax
errors, unbound identifiers and arity problems are computed from Shape and Meaning alone.
Only *type* errors need the backend.

For the December schedule this compounds chunk 3's finding: RocqJar can show real, useful,
correct diagnostics on real `.v` files before the Rocq provider exists.

---

## 2. Settlement: the divide-and-conquer around a one-error-at-a-time checker

From `settlement.mjs`:

> Beluga halts at the first error it meets. A single check therefore yields at most ONE
> diagnostic per settle — antithetical to the engine's whole design. `MAX_PASSES` bounds the
> divide-and-conquer loop that works around it: each pass masks the blocks that already
> errored (plus everything depending on them) and re-checks the remainder, so independent
> errors all surface.

So settlement is: **check → mask the failing block and its dependents → re-check → repeat,
up to 8 passes (16 with a prelude).** It composes `computeLintBlocks`, `blockDependents`,
`maskBlocksByIndex` and the provider's `check`.

This is a workaround for a *backend property*, not a language property. Which makes it the
cleanest capability negotiation in the system:

```js
capabilities: { haltsAtFirstError: true }   // Beluga
capabilities: { haltsAtFirstError: false }  // expected for Rocq via coq-lsp
```

A provider that reports all diagnostics in one pass **skips settlement entirely** — no
masking, no dependents analysis, no 8-pass loop, and a large amount of latency disappears.

⚠️ Rocq's behaviour here is an expectation, not a measured fact. coq-lsp processes a document
sentence by sentence and is designed to report per-sentence diagnostics, but this must be
verified in the Rocq spike before the capability is trusted. If it turns out Rocq does halt,
settlement is already built and simply stays on.

---

## 3. The tightest coupling in the system

Masking creates errors that were not in the user's code. Removing a block removes the
definitions it provided, so the re-check reports **induced** unbound-identifier errors for
names that are perfectly well defined in the real file.

Settlement discards those by importing `namedCulprit` from `beluga-diag.mjs` and asking:
*is the identifier this error names one that lives in a block I masked out?*

⛔ **Therefore the prose-pattern table is load-bearing for correctness, not presentation.**
If a language's culprit regexes are wrong, settlement cannot distinguish induced errors from
real ones, and the file shows errors that do not exist.

This is the single most dangerous item in the whole generalization. It is a per-language
regex table whose failure mode is *silently wrong diagnostics*, not a crash. It needs a
dedicated test: mask a known block, assert every induced error is recognised and discarded.

---

## 4. The orchestration layer is already generic

Measured — grammar node-name references per file:

| File | Node-name refs |
|---|---|
| `semantic-scheduler.mjs` | **0** |
| `settlement.mjs` | **0** |
| `file-health-store.mjs` | **0** |
| `check-gate.mjs` | 3 |

The scheduler, the 8-pass settlement loop, health computation, and the check-gate
fingerprinting are **already language-neutral**. Judgment's language-specific surface is
exactly two things:

1. the prose table (`beluga-diag.mjs`, ~25% of its 343 lines), and
2. the local diagnostic producers, which are downstream of Shape and Meaning anyway.

Judgment is much cheaper than the chunk-1 prose finding suggested.

---

## 5. Two carried questions, resolved

**`beluga-run.mjs` routes; it does not scrape.** One regex site, no import of the diagnostic
parsers. All prose scraping lives in `beluga-diag.mjs` and `settlement.mjs` — a single,
clean locus. (Chunk 1)

**The `infix.mjs` circularity does not exist.** Chunk 3 flagged operator fixity as Shape
depending on Meaning. It is not: the grammar parses application spines **flat**, and
`infix.mjs` re-associates them in a **post-pass** using a fixity table read from pragmas.
Nothing is fed back into the parser.

```
APP_SPINE  = { LFAppTerm, LFAppType, AppExpression }   // flat spines
ATOMIC_WRAP / STOP_EXPR                                 // where re-association stops
```

The mechanism is language-neutral: flat spine plus fixity table in, associated tree out.
Only the *source* of fixity declarations differs — Beluga pragmas, Rocq `Notation`. This is
a solved problem, not a knot.

---

## 6. What Rocq's Judgment layer must supply

| Piece | Content | Size |
|---|---|---|
| location grammar | OCaml-standard `File "…", line N, characters A-B:` | inherited, §chunk 1 |
| severity keywords | `Error:` / `Warning:` | inherited |
| culprit patterns | `The reference X was not found…`, `Unable to unify…`, etc. | ~6 regexes, **must be tested** |
| `haltsAtFirstError` | expected `false` | one boolean |
| local producers | inherited from Shape + Meaning | free |

---

## 7. What chunk 4 changes about the plan

1. **`haltsAtFirstError` joins the capability set**, and settlement becomes conditional.
   This is the strongest argument yet for capability negotiation being architecture rather
   than decoration.
2. **The culprit-pattern table needs its own gate.** A masking round-trip test, per language.
   Silently wrong diagnostics is the worst failure mode available to this project.
3. **Judgment's platform cost drops.** Orchestration is already neutral; budget the prose
   table and nothing else.
4. **Local diagnostics ship before any provider.** Combined with chunk 3, RocqJar's
   pre-backend milestone is now: navigation, outline, rename, explorer, incremental symbols,
   *and* syntax plus scope diagnostics.
5. **`infix.mjs` moves from "architectural knot" to "language pack table."**

---

## 8. Open questions carried forward

- `collectParseDiagnostics` (in `tree-walk.mjs`) and `lineSyntaxMessage`: how much of parse
  *error message* wording is Beluga-specific, and does the recovery strategy assume Beluga's
  declaration shape? → chunk 7, since it surfaces as UI text.
- `compress-development.mjs` and `assembleCheckerCode`: the prelude/project assembly that
  feeds the checker. How does a multi-file Rocq project (`Require Import`) differ from
  Beluga's `.cfg` suite model? → chunk 8.
- `check-gate.mjs`'s `blockSpineEqual` / `belugaCheckFingerprint`: what exactly makes a
  re-check necessary, and is the fingerprint language-neutral? → chunk 8.
- `query-diag.mjs` lints `%:` query pragma bounds. Does Rocq have an analogue worth
  supporting, or is this Beluga-only surface? → chunk 7.
