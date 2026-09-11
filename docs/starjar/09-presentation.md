# Chunk 9 — Presentation

*Formatting, graphs, hover, inspector. The chunk with the least work in it.*

---

## 1. The dependency graph is already fully generic

| File | LOC | Node-name refs |
|---|---|---|
| `graph-view.mjs` | 2,103 | **0** |
| `flat-graph.mjs` | 1,087 | **0** |
| `webgl-graph.mjs` | 1,051 | **0** |
| `force-sim.mjs` | 255 | **0** |
| `group-graph.mjs` | 191 | **0** |
| `graph-nav.mjs` | 89 | **0** |
| `mat4.mjs`, `graph-prefs.mjs` | 92 | **0** |

**4,868 LOC, zero language coupling.** The graph consumes symbols and edges from the
semantic layer and knows nothing about Beluga.

⭐ Dependency graphs were named as one of the "advanced features" to be generalized after the
window. They need **no work at all**. Any language that produces symbols and references gets
the 3D graph, the flat fallback, grouping, navigation and the force simulation for free.

The only language input is `EDGE_KIND`, which has three values:

```js
SIGNATURE   // the reference sits in the declaration's type
BODY        // it sits in the definition
NOTATION    // it comes from a pragma
```

and one per-language function, `signatureBoundary(owner)` — where a declaration's type ends
and its body begins. One function buys the entire graph subsystem.

---

## 2. The inspector is fully generic too

| File | LOC | Refs |
|---|---|---|
| `inspector.mjs` | 1,278 | **0** |
| `inspector-render.mjs` | 931 | **0** |
| `inspector-model.mjs` | 705 | **0** |

**2,914 LOC, zero coupling.** Inherited whole.

---

## 3. The pretty-printer engine is generic; only the printer is Beluga

`format/doc.mjs` is a textbook Wadler-style document combinator library:

```js
text · line · hardline · blankline · softline · nest · align · group · concat · join · empty · space
```

with `layout.mjs` as the renderer. That is the same abstraction Prettier and every OCaml
`Format` module is built on. Language-neutral by construction.

| File | LOC | Refs | Class |
|---|---|---|---|
| `printer.mjs` | 1,354 | **193** | **language pack** |
| `document-format.mjs` | 326 | 2 | generic |
| `proof-script.mjs` | 175 | 1 | generic |
| `type-render.mjs` | 169 | 0 | generic |
| `proof-format.mjs` | 135 | 0 | generic |
| `doc.mjs` | 135 | 0 | generic |
| `source-render.mjs` | 127 | 0 | generic |
| `basics.mjs` | 107 | 7 | generic |
| `layout.mjs` | 96 | 0 | generic |

`PLATFORM.md` §9 said "generic formatting primitives land; per-language proof and type
rendering is a language-pack artifact." Confirmed, with numbers: **1,354 of 2,624 lines are
the language pack, and the other 1,270 are free.**

---

## 4. Presentation, totalled

| Subsystem | LOC | Language-specific |
|---|---|---|
| graph | 4,868 | 0 |
| inspector | 2,914 | 0 |
| format engine | 1,270 | ~10 |
| hover | 847 | 9 |
| **`printer.mjs`** | 1,354 | **193** |
| **`name-resolve.mjs`** | 1,560 | **107** |
| total | ~12,800 | ~24% |

⭐ **The entire language-specific surface of Presentation is two files.** Everything else in
the layer is inherited unchanged.

`name-resolve.mjs` is the one carrying real subtlety: hover resolution, type projection,
signature binder lookup and slot-expected-type inference. It was misclassified as Meaning in
chunk 2 and reclassified in chunk 3; this is where it actually lives, and it is the second
language-pack artifact of the layer.

---

## 5. Three carried questions, resolved

### `compress-development.mjs` is a compensation, not a correctness requirement

> Signature-compressed development: Beluga re-verifies only the dirty frontier. Outside that
> frontier, rec/proof bodies become `?` so signatures stay in scope without replaying proof
> scripts — including every prelude member.

It is a **latency optimisation for the concatenative project model**. Because the whole
prelude is re-checked on every settle, the prelude's proof bodies are replaced with holes.

Under `project: 'resolved'` the prelude is never re-checked, so **compress-development is
unnecessary**. A fourth instance of the compensation principle, and it switches off with the
same capability as the prelude machinery itself. (Chunk 8)

### `belugaCheckFingerprint` survives `'resolved'`

```js
const stripped = stripSpans(snap.code, commentSpans(syntax.tree));
const fp = normalizeCosmeticWhitespace(stripped);
```

It fingerprints the checker snapshot with comments stripped and cosmetic whitespace
normalized, and `settlementTrigger` classifies each edit three ways:

| Class | Effect |
|---|---|
| cosmetic | keep the verdict, no schedule |
| syntax-only | refresh the graph, no backend call |
| semantic | schedule a settlement |

The mechanism is language-neutral. Its two language inputs are *what counts as a comment*
(already in the manifest, chunk 1 §5) and *what the checker snapshot is* (the project
capability). Under `'resolved'` the snapshot is simply the file rather than prelude ++ file,
and the three-way classification is unchanged. (Chunk 8)

### `prover-corpus-decls.mjs` moves with the Beluga pack

It indexes the corpus for Orca's lemma suggestions. Chunk 6 keeps Orca Beluga-only through
December, so it relocates untouched. If a Rocq equivalent is ever wanted, it is a provider
`Search` call at Tier 4, not shell code. (Chunks 6, 8)

---

## 6. What chunk 9 changes about the plan

1. **"Generic dependency graphs" leaves the post-window list.** They are already generic. The
   claim can be made today.
2. **Presentation's language surface is two files**, `printer.mjs` and `name-resolve.mjs`,
   both language-pack artifacts. No platform refactor is needed in this layer.
3. **A fourth compensation identified** (`compress-development`), reinforcing the theory and
   further reducing what RocqJar has to run.
4. **`signatureBoundary` joins the language pack** — one small function that buys the graph.
5. **Presentation is the cheapest chunk in the analysis** and should not consume schedule.

---

## 7. Open questions carried forward

- `hover.mjs` has a `LINT_TOOLTIP_FILTER` shared with the lint surface. Does hover text
  render provider prose directly anywhere, or always structured data? → chunk 10.
- The graph's `signatureBoundary` depends on knowing where a type ends. Under Mode B and
  `'resolved'`, is that still derivable from Shape alone? → chunk 10.
- `document-format.mjs` drives the format command. With `printer.mjs` in the language pack, a
  provider with no printer has no formatter — is that a capability (`format`) or a silent
  no-op? → chunk 10.
