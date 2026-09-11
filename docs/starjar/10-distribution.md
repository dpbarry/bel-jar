# Chunk 10 — Distribution

*How a language pack and a provider actually get loaded, and the reconciliation of nine
chunks against the original plan.*

---

## 1. The current load path is already the right shape

`index.html` loads seven classic scripts — no runtime module system, IIFE bundles that
publish globals:

```html
js/boot/early-boot.js
js/boot/panel-restore.js
js/beluga/beluga-client.js        ← the provider client (owns its worker)
js/harpoon/harpoon-client.js      ← the proof-session client (own worker)
js/editor-cm.bundle.js            ← editor + Shape/Meaning/Judgment/Presentation
js/boot/error-hook.js
js/shell.js                       ← app, ui, persist, commands, explorer
```

Built with esbuild: `editor-src/editor.mjs → BelEditor` (one entry, `globalName`), and
multiple shell entries into `shell.js`.

⭐ **The provider is already a separate, independently loaded script.** `beluga-client.js`
is not compiled into either bundle. The distribution seam \*jar needs already exists at the
provider level; what does not exist is the same seam for the *language pack*.

---

## 2. The language is statically linked, but only just

Every consumer of the grammar imports the same single object:

```js
import { parser } from '../beluga-parser.js';
```

**17 files** do this. `beluga-tokens.mjs` is the only importer of the generated terms file,
so the external tokenizers are already self-contained.

Seventeen call sites is a small, mechanical delamination:

```js
// core/lang.mjs — the language registry
let active = null;
export function setLanguage(pack) { active = pack; }
export function parser() { return active.parser; }
```

### The target load path

```html
<script src="js/lang/beluga.js"></script>       <!-- grammar, manifest, meaning, printer, name-resolve -->
<script src="js/providers/beluga.js"></script>  <!-- backend adapter, owns its worker -->
<script src="js/editor-cm.bundle.js"></script>  <!-- language-neutral core -->
<script src="js/shell.js"></script>             <!-- language-neutral -->
```

**Swap the first two lines and it is RocqJar.**

This is, almost exactly, the "a few tweaks and you get RocqJar" the project was founded on —
placed at the seam where it is actually true, rather than at `js_of_ocaml`.

It also requires no change to the module system, no dynamic `import()`, and no duplicated
core: language packs register themselves on a global exactly as `beluga-client.js` already
does. Of the three options (injection at boot, per-language full bundles, runtime ESM),
injection is both the smallest change and the one that matches the existing architecture.

⚠️ `check-build-stale.mjs` gates that each `.js` bundle is not older than its `.mjs`
sources. It must be extended to cover every language and provider bundle, or a stale
language pack will ship silently.

---

## 3. Correction: the prose channel has three loci, not two

Chunk 4 concluded that all prose scraping lives in `beluga-diag.mjs` and `settlement.mjs` —
"a single, clean locus." **That was wrong.** `ide/hover.mjs` scrapes too:

```js
const raw = await client.runCheckerCommand(code, '%:fsig ' + fb.name);
return parseFsigOutput(raw);

const raw = await client.runCheckerCommand(code, '%:constructors-comp ' + fb.parent);
return parseConstructorsCompOutput(raw, fb.ctor);
```

This extends chunk 1's Channel B finding in an important way:

> **The command channel is bidirectional.** The shell sends an operation whose *spelling* is
> language-specific, and parses a reply whose *format* is language-specific too.

So a language pack owes an output parser for every command operation it declares, not just
the command string. Small, but it must be in the provider contract or it will be discovered
by a wrong hover in November.

---

## 4. Three carried questions, closed

- **`signatureBoundary` survives both new capabilities.** It is derived from Shape alone —
  where a declaration's type ends and its body begins — so neither `proof: 'session'` nor
  `project: 'resolved'` affects it. The graph subsystem is safe.
- **Formatting becomes a capability.** With `printer.mjs` in the language pack, a pack with
  no printer has no formatter. That must be `capabilities: { format: false }` and a gated
  command, not a silent no-op — per chunk 7 §4, absence must be explainable.
- **Hover renders provider prose** (above), so hover quality is bounded by the pack's output
  parsers, not by the shell.

---

## 5. The final capability set

Nine chunks produced four architectural switches and five tiers.

| Capability | Values | Turns off |
|---|---|---|
| `haltsAtFirstError` | bool | settlement's 8-pass divide-and-conquer (chunk 4) |
| `proof` | `'splice'` / `'session'` / absent | the move generator, or the session verbs (chunk 5) |
| `project` | `'concatenative'` / `'resolved'` | prelude assembly, offset maths, compression (chunks 8, 9) |
| `format` | bool | the format command (chunk 10) |

| Tier | Requires | Buys |
|---|---|---|
| 0 | `check` | editor, explorer, navigation, diagnostics, commands, persistence, **and a splice-mode prover** |
| 1 | `typeAt`, `declType` | hover, inspector, type-directed completion, type-level graph |
| 2 | six proof verbs, `tactics()` | session-mode Harpoon |
| 3 | `moveCandidates` | Orca |
| 4 | language oracles | `adjudicate`, `Search`, … |

---

## 6. Reconciliation: what the analysis changed in `PLATFORM.md`

| # | Original claim | Corrected by |
|---|---|---|
| 1 | 134k LOC to refactor | **~103k**; ~31k were built duplicates (ch 8) |
| 2 | `NAMESPACE`'s 12 constants are the ontology coupling | **1,416 node-name sites, 162 names** — Shape dominates (ch 2) |
| 3 | The language pack is a manifest (data) | Meaning needs **extractor functions**; it is a module (ch 3) |
| 4 | `Goal` carries an opaque `meta` blob | **Named bands** of typed binders — the shipped shape is better (ch 5) |
| 5 | Orca's search frame is platform code | Separable **in principle, not in fact**; out of the window (ch 6) |
| 6 | Capability gating must be designed and built | **Already exists** (`runnable` / `available`); needs one field and a probe (ch 7) |
| 7 | Rocq's prover is the hard part | **Mode B makes it the easy part**; no move generator needed (ch 5) |
| 8 | Dependency graphs are post-window work | **Already 100% generic**, 4,868 LOC at zero coupling (ch 9) |
| 9 | Prose scraping is display-only | **Load-bearing for settlement's correctness** (ch 4) |
| 10 | — | New: `imports` function for cross-file navigation (ch 8) |
| 11 | — | New: the **compensation principle** (ch 8, folded into the theory) |

**Net direction: the platform is smaller and further along than the plan assumed, and the
single largest cost — Shape's 1,416 sites — was invisible to it.**

---

## 7. Distribution and OSS packaging

| Artifact | Contents |
|---|---|
| `core/` | editor bundle, shell bundle — language-neutral |
| `lang/<x>/` | grammar, manifest, meaning module, printer, name-resolve, output parsers |
| `providers/<x>/` | backend adapter and its worker; transport-agnostic |
| `conformance/` | the provider test suite — **the public contract** |
| `docs/PROVIDER.md` | the port guide |

The conformance suite is what makes this an open platform rather than a codebase with
options: a third party's claim to support an assistant is exactly "passes conformance at
tier N with capabilities C."

---

## 8. What remains unanalysed

Stated so the analysis does not overclaim completeness:

- **The Rocq side itself.** Everything about coq-lsp's protocol, goal format, error format
  and `haltsAtFirstError` behaviour is expectation, not measurement. The spike settles it.
- **Performance under a remote provider.** Thread 2's input-lag work assumed an in-process
  worker. A socket-backed provider changes the latency model and no chunk measured it.
- **The `.js`/`.mjs` duplicate build.** Why both exist, and whether language packs must
  maintain the same duality, is a build question this analysis did not open.
