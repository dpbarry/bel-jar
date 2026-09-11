# \*jar — the per-file record

*The complete picture, one line per file. Built by passes; a file counts as **analysed** only
once it has a line here. `node scripts/starjar-census.mjs` reports what is still missing.*

**Class** — `platform` language-neutral, keep · `pack` belongs to a language pack ·
`param` platform code that must be parameterized · `surface` UI, capability-gated ·
`build` tooling/generated.

Coverage: **COMPLETE.** All 595 source files, 162,052 LOC, across `js/`, `css/`, `tests/`,
`scripts/` and the four root files. All 1,416 structural coupling sites attributed (F20).
Verified against the working tree 2026-09-10; `node scripts/starjar-census.mjs` reads 0
unanalysed in every area.

⭐ **Four coupling dimensions are measured, not one** — see F13. Grammar node names (1,416)
are the only dimension needing design; the other ~856 sites are renames and one table.

⛔ **All node-site figures here are grammar node-name OCCURRENCES**, matching the census and
chunks 2–10 (F11). Count them **per file** or with `grep -a` — a tree-wide `cat | grep`
under-reports (F21).

## Findings index

F1 extensions · F2 one-metric zeros · F3/F7 prose loci · F4/F25 the prefix question ·
F5 injection architecture · F6 measure tables by importing · F8 completion is Tier 0 ·
F9 `modal/` at zero · F10 completion splits like format · F11 occurrences not lines ·
F12/F13 the four dimensions · F14 Meaning is one file · F15 status strip is clean ·
F16 `beluga/` → `providers/` · F17 the lint is blind on the prover · F18 Harpoon is portable ·
F19 `hole-split` · F20 the reconciliation · F21 the NUL trap · F22 `editor-src` root ·
F23 graph holds · F24 no CSS in a language pack · F26 gated stylesheets ·
F27 the safety net cuts two ways · F28 the conformance seed · F29 differentials ·
F30 strays · F31 the probe suite

---

## Re-verification, 2026-09-10

The tree was refactored (macros, Vim caret, ex-name truth, tab guard, edit-history, status
strip; 121 files, +5,443/−1,228). Every pass-1 measurement was re-run.

| Measure | Pass 1 | Now | Verdict |
|---|---:|---:|---|
| grammar node-name sites (`js/`) | 1,416 | **1,416** | unchanged |
| `.bel`/`.cfg`/`.elf` extension logic sites | 81 | **79** | unchanged in substance |
| `.bel-` CSS namespace refs in `js/` | 177 | **177** | unchanged |
| `js/` source files | 253 | **259** | +6 new, all platform |
| `js/` source LOC | 101,162 | **103,946** | +2,784 |

⚠️ **Two pass-1 claims were wrong and are corrected below (F6, F7).** Neither was caused by
the refactor; both were measurement error.

### Six new source files — all `platform`

| file | LOC | class | note | pass |
|---|---:|---|---|---|
| `macro-engine.mjs` | 358 | platform | keyboard macros, one implementation for all three styles | 2 |
| `vim-caret.mjs` | 237 | platform | BelJar's caret rule applied to Vim Normal mode | 2 |
| `vim-ex-names.mjs` | 148 | platform | ⭐ the ex commands Vim's own dispatcher answers to, *"as data, so the command line can stop lying about them"* | 2 |
| `tab-guard.mjs` | 124 | platform | second-tab-same-project warning; ⛔ two tabs silently destroy work | 3 |
| `macro-store.mjs` | 82 | platform | pure registers — no DOM, no CodeMirror, no globals | 2 |
| `macro-keys.mjs` | 66 | platform | ⭐ record/replay keys *"as data, so the code that BINDS them and every surface that NAMES them read one source"* | 2 |

⭐ **The refactor moved the codebase toward \*jar's architecture, not away from it.**
`macro-keys.mjs` and `vim-ex-names.mjs` are two more single-source tables created for exactly
the derive-not-retype reason the platform depends on — and `vim-ex-names.mjs` says outright
that the command line *was* lying about them. That is a fifth §T-class lie, found and fixed
by the user, in the surface \*jar most needs to be honest.

---

## Findings from pass 1

Three of these contradict earlier chunks. Recorded here rather than silently fixed.

### F1 — A whole coupling dimension was invisible to chunks 0–10

**File extensions.** `.bel`, `.cfg`, `.elf` appear in **81 real logic sites across ~25
files**. Neither of the metrics used in the chunk analysis — grammar node-name sites, and
the word "beluga" — detects any of them.

`editor-src/project-paths.mjs` (46 lines) is the intended source of truth and exports nine
predicates: `fileBase`, `isExtensionless`, `isCfgPath`, `isElfPath`, `isBelPath`,
`isSignaturePath`, `isProjectSourcePath`, `isCfgEntryToken`, `isCfgSourceEntry`. Its own
header states the rule: *"Beluga source paths: .cfg stays distinct; extensionless files are
implicit .bel."*

The abstraction exists but **leaks** — 81 sites, only some routed through it.

⭐ **New language-pack field:**

```js
extensions: {
  source:    ['.bel'],        // Rocq: ['.v']
  manifest:  '.cfg',          // Rocq: '_CoqProject'
  signature: '.elf',          // Rocq: none
  extensionlessImpliesSource: true
}
```

### F2 — "Zero coupling" in chunk 9 was measured against one metric and stated unconditionally

`graph/` and `inspector/` have zero **grammar node-name** references. That is true and it is
not the same as language-neutral:

- `graph/graph-view.mjs` lines 45, 95, 105 carry real `.cfg` project logic ("a `.cfg` with no
  language", "opening from a `.cfg` with nothing listed").
- `explorer/` — also declared zero — has 5 extension sites.

⛔ **The correction is methodological, not just factual.** Chunk 2 warned that counting sites
says what is coupled, not what an abstraction reaches. Chunk 9 then reported a single
metric's zero as if it were unconditional. Every "0" in these documents means *zero by the
metric named*, and each pass may add a metric.

### F3 — The prose channel has four loci, not three

Chunk 4 said two, chunk 10 corrected it to three. Pass 1 finds a fourth:
`repl/repl-output.mjs` tests `/^Error:/i`, parses query solutions
(`solutions / isDone / queryLine / queryError`), and its line 799 comments on Beluga's
`Unbound_identifier` printer omitting the `Error:` prefix.

| # | Locus | Found in |
|---|---|---|
| 1 | `editor-src/ide/beluga-diag.mjs` | chunk 1 |
| 2 | `editor-src/semantic/settlement.mjs` | chunk 4 |
| 3 | `editor-src/ide/hover.mjs` | chunk 10 |
| 4 | `repl/repl-output.mjs` | **pass 1** |

⭐ **Prose scraping is diffuse and grows with every pass.** Deliverable: the language pack's
`diagnosticFormat` becomes the single import point, plus **a lint that fails on any new
`Error:`-style regex outside `lang/`**. Otherwise locus five appears in November.

### F4 — The `.bel-` CSS namespace is 177 references of branding, not semantics
**RESOLVED 2026-09-11** — see `PHASE0.md` §5. Both `bel-` and `bj-` migrated to `jar-`
(1,796 sites, 101 files). The purity gate's `cssClasses` baseline is now 0 and guards both.


Distinct from F1: `.bel-flat-node`, `.bel-graph3d-stage`, `.bel-strip__*`. Mechanical rename
(`bel-` → `jar-`), cheap now, expensive after `css/` (pass 5) and every probe selector are
written against it. **Decide early.**

### F6 — ⚠️ The command catalogue was measured by grep, and the grep was wrong

Chunk 7 reported "**7** language-adjacent of **119** commands". Importing `CATALOG` instead
of grepping it gives **24 of 156**. The grep only matched entries whose `id` and `title`
shared a source line.

The 24 partition cleanly by capability — 15 `proof`, 3 `proof`+`moveCandidates`, 6 `check` —
which makes `requires` a mechanical annotation rather than a judgement call. `CATALOG`
carries `requires` on **0 of 156** entries today.

⛔ **Measure a data table by importing it, never by grepping it.** Corrected in chunk 7 §3.

### F7 — ⚠️ The prose-locus count was understated, and the metric that found it over-reports

Chunk 4 said two loci, chunk 10 said three, pass 1 said four. A broader sweep matches **20
files**, but that pattern also catches every file with its own `hasError` field or its own
error strings. Classified by hand:

| Class | Files |
|---|---|
| **platform loci — must be parameterized** | `ide/beluga-diag.mjs`, `semantic/settlement.mjs`, `ide/hover.mjs`, `repl/repl-output.mjs`, **`beluga/beluga-text.mjs`** (new: `isBelugaCommandError`, `/^Error:/im` + `/^File "/im`) |
| **language-pack loci — expected, fine** | `prover/*` — Orca reads its own oracle's output by design (`prover-orchestrator.mjs`: *"the web shim puts `Error: …` on the next line; the native CLI interleaves"*) |
| **false positives** | `inspector-model.mjs`, `semantic-engine.mjs` (`hasError` is a *field name*), `vim-setup.mjs`, `ui/keybindings.mjs`, `persist.mjs` (own messages) |

⭐ **Five platform loci, not four** — and the right framing is not a growing count but a
partition: prose parsing inside `lang/` is correct; prose parsing outside it is debt. The
lint from F3 should be written against that boundary, not against a file list.

⭐ Note also that chunk 9's inspector "zero coupling" **survives** — its hit was `hasError:`,
a property name, not error prose. F2's warning cuts both ways: a broad metric over-reports
as readily as a narrow one under-reports.

### F5 — `app/` is already an injection architecture

Every `app-*.mjs` header reads *"injected into app.js"*, with
`app-command-palette.mjs` noting *"Titles, sections, chords and style policy live in
`js/commands/command-catalog.mjs`."* This matches chunk 7's two-halves finding: the shell's
language coupling sits in the injected **behaviours**, not the structure.

---

## js/ui/ — 29 files, 10,531 LOC

| file | LOC | class | note |
|---|---:|---|---|
| `settings-ui.mjs` | 2496 | surface | 31 beluga mentions — largest surface file; settings rows name language concepts |
| `menu.mjs` | 822 | surface | ⛔ header/context menus — hand-built, not registry-derived (chunk 8 F) |
| `tooltips.mjs` | 728 | platform | generic tooltip engine |
| `command-palette.mjs` | 696 | platform | multi-mode router; derives from `Commands.list` ✓ |
| `name-conflicts.mjs` | 685 | param | path-level conflict detection + upload planning |
| `keybindings.mjs` | 608 | platform | resolver, overrides, reserved/conflict checks, CM keymap |
| `available-macros.mjs` | 596 | platform | "what can I press right now" — derives from the registry ✓ |
| `notifications.mjs` | 458 | platform | durable inbox; draws `notification-view`'s decision |
| `notification-store.mjs` | 340 | platform | pure model + adapters, schema-versioned |
| `hint.mjs` | 305 | platform | coachmark balloons |
| `toasts.mjs` | 295 | platform | ephemeral messages |
| `dialog.mjs` | 277 | platform | dialog registry/lifecycle |
| `floating-window.mjs` | 241 | platform | draggable non-modal panel |
| `double-tap.mjs` | 212 | platform | modifier double-tap gesture |
| `bj-dropdown.mjs` | 188 | platform | component |
| `tree-dnd.mjs` | 175 | platform | reusable tree drag-and-drop |
| `name-prompt.mjs` | 169 | **pack** | ⚠ exports `normalizeBelFileName` — extension logic (F1) |
| `download-zip.mjs` | 167 | platform | STORE-only ZIP builder |
| `notification-view.mjs` | 167 | platform | pure projection, Node-testable |
| `prompt-dialog.mjs` | 147 | platform | component |
| `conflict-dialog.mjs` | 140 | platform | component |
| `header-search.mjs` | 123 | platform | shared collapse-to-glass controller |
| `full-keyboard.mjs` | 103 | platform | `navigator.keyboard.lock()` wrapper |
| `scroll-fade.mjs` | 103 | platform | overflow edge fades; pure metrics core |
| `text-slide.mjs` | 99 | platform | marquee for overflowing labels |
| `perf-hud.mjs` | 72 | build | perf overlay |
| `bj-toggle.mjs` | 44 | platform | component |
| `confirm-dialog.mjs` | 36 | platform | component |
| `dialogs.mjs` | 10 | build | leaf graph, one shell build entry |

**Verdict:** 25 of 29 are platform. Language coupling is `settings-ui.mjs` (row text),
`name-prompt.mjs` (extensions), and `menu.mjs` (the ungated `'Open in Harpoon…'`).

## js/app/ — 10 files, 4,500 LOC

| file | LOC | class | note |
|---|---:|---|---|
| `app.mjs` | 1424 | param | the shell root |
| `app-upload-import.mjs` | 644 | param | upload/import/move/download + cfg reload (F1) |
| `app-menus.mjs` | 639 | surface | ⛔ hand-builds menus (chunk 8 F) |
| `app-file-lifecycle.mjs` | 564 | param | switch/peek/openAt/new/close/delete (F1) |
| `app-command-palette.mjs` | 407 | platform | attaches behaviour; metadata stays in the catalog ✓ |
| `app-explorer-bootstrap.mjs` | 357 | platform | explorer/search/library bootstrap, inline create/rename |
| `app-suite-cfg.mjs` | 256 | **pack** | active cfg, suite membership, dangling entries |
| `app-side-panels.mjs` | 79 | platform | Explorer / Inspector / Library / Harpoon toggles |
| `app-file-tabs.mjs` | 73 | platform | tab strip, render only |
| `app-empty-state.mjs` | 47 | platform | idle overlay |

## js/repl/ — 8 files, 3,742 LOC

| file | LOC | class | note |
|---|---:|---|---|
| `repl-output.mjs` | 1311 | **pack** | ⛔ **prose locus #4** (F3) — `/^Error:/i`, query-solution parsing |
| `repl-autocomplete.mjs` | 449 | platform | DOM completion UI |
| `repl-run-cmd.mjs` | 427 | platform | BelJar-local `run` grammar — *"never sent to Beluga"* |
| `repl-stream.mjs` | 422 | platform | streaming transport; no prose parsing ✓ |
| `repl-ac-suggest.mjs` | 391 | param | pure suggestions, no DOM; 4 extension sites (F1) |
| `run-progress.mjs` | 304 | platform | progress model |
| `repl-commands.mjs` | 254 | param | command dispatch |
| `repl-persist.mjs` | 176 | platform | history persistence |

## js/boot/, js/frame/, js/compat/ — 7 files, 414 LOC

| file | LOC | class | note |
|---|---:|---|---|
| `boot/early-boot-core.mjs` | 113 | platform | pre-paint theme/layout |
| `boot/panel-restore-core.mjs` | 75 | platform | panel state restore |
| `boot/error-hook.mjs` | 31 | platform | global error capture |
| `boot/early-boot.mjs` | 24 | build | entry |
| `boot/panel-restore.mjs` | 5 | build | entry |
| `frame/frame.mjs` | 94 | platform | chrome every page wears — theme, toasts, inbox, tooltips, header |
| `compat/beljar-window-aliases.mjs` | 66 | build | legacy `BelJar*` → system-noun globals; *"burn after callers stop"* |

---

## Pass 1 totals

| | files | LOC |
|---|---:|---:|
| analysed | 54 | 19,187 |
| `platform` | 41 | ~11,900 |
| `param` / `pack` / `surface` | 13 | ~7,300 |

**~76% of the app shell is language-neutral today**, and the coupling that exists is
extensions (F1), settings row text, and two ungated menus — not deep structure.

---

# Pass 2 — the IDE layer

63 files, 16,743 LOC, **455 grammar node-name sites**. The most lopsided distribution yet.

| Directory | Files | LOC | node sites |
|---|---:|---:|---:|
| `editor-src/ide/` | 39 | 11,462 | 164 |
| `editor-src/ide/modal/` | 14 | 2,501 | **0** |
| `editor-src/ide/completion/` | 10 | 2,780 | 291 |

## Findings from pass 2

### F8 — ⭐ Type-directed completion is Tier 0, not Tier 1

`PLATFORM.md` §3 lists "type-directed completion" among the things Tier 1 (`typeAt`,
`declType`) buys. **That is wrong.** `type-expect.mjs` (405 LOC, 71 node sites) contains
**zero** references to `engine.`, `checkerSnapshot`, `declType`, `typeAt` or
`runCheckerCommand`. It derives expected types **from the AST alone**.

Across the whole of `completion/`, the only `engine.` uses reach `engine.stores.syntax` — the
lezer snapshot — which chunk 3 established never touches the provider.

**So a Tier-0 provider gets type-directed completion**, and Tier 0's already-surprising
inventory grows again: editor, explorer, projects, persistence, diagnostics, commands,
keymaps, a splice-mode prover, *and* completion that knows what type belongs at the cursor.
This is the third time a feature has turned out to sit below the tier it was assigned.

(Answers chunk 2's carried question about which half dominates `type-expect.mjs`: neither —
there is no backend half.)

### F9 — `modal/` is 2,501 LOC at absolute zero, and it is the architecture argument

Fourteen files — all of Vim, all of Emacs, macros, which-key, reserved chords, style policy,
undo routing — carry **not one** grammar node name. Their headers read like the platform spec
written in advance:

- `emacs-keys.mjs` — the KEYS are read from the package's own table and never retyped
- `style-macros.mjs` — *"as data, so a surface can LIST them"*
- `macro-keys.mjs` — *"as data, so the code that BINDS them and every surface that NAMES them read one source"*
- `vim-ex-names.mjs` — *"as data, so the command line can stop lying about them"*
- `reserved-chords.mjs` — *"Pure: no DOM, no globals — the platform is a parameter"*

⭐ **The modal layer is already a language pack's worth of discipline applied to keymaps.** It
ports to \*jar untouched, and it is the best in-repo model for how the language pack tables
should read.

(Also answers chunk 7's carried question: `style-policy.mjs` states the policy *"is DECLARED
in the shell's command catalogue"*, so chord arbitration already derives. Adding a
per-provider dimension does not disturb it.)

### F10 — `completion/` splits exactly like `format/`

| Half | Files | LOC | node sites |
|---|---:|---:|---:|
| engine — generic | 7 | 1,116 | 1 |
| language pack | 3 | 1,664 | **290** |

`editor-autocomplete`, `source`, `fuzzy`, `weigh`, `chrome`, `index` and `contributors` are
the machine; `snippets` (106), `classify` (113) and `type-expect` (71) are the Beluga
knowledge. The same shape as the pretty-printer. **Two or three files to write per language,
and the completion engine is free.**

### F11 — ⚠️ Metric definition slip, caught in this pass

Pass 2's first table used `grep -c` (matching **lines**); chunks 2–10 used `grep -o`
(**occurrences**). The two disagree by roughly a third on dense files — `printer.mjs` reads
193 by lines and 234 by occurrences.

⛔ **All node-site figures in these documents are OCCURRENCES.** The census
(`starjar-census.mjs`) counts occurrences and totals 1,416 for `js/`, which is the number to
reconcile against. No published figure was wrong; the slip was caught before it reached one.

## `editor-src/ide/` — 39 files, 11,462 LOC

| file | LOC | node | class | note |
|---|---:|---:|---|---|
| `inspector.mjs` | 1278 | 0 | platform | floating windows, docked panel, history, search, follow |
| `inspector-render.mjs` | 931 | 0 | platform | DOM rendering of view-models |
| `hover.mjs` | 865 | 13 | **param** | ⛔ prose locus — `parseFsigOutput`, `parseConstructorsCompOutput` |
| `rename.mjs` | 789 | 0 | platform | inline F2 rename, live mirror to all occurrences |
| `inspector-model.mjs` | 705 | 0 | platform | DOM-free view-models; `hasError` is a field, not prose |
| `refs-panel.mjs` | 444 | 0 | platform | find-all-references |
| `diag-gutter.mjs` | 409 | 0 | platform | gutter marks and tooltips |
| `ide-actions.mjs` | 408 | 6 | param | shared navigation / rename / inspector / signature-insert |
| `macro-engine.mjs` | 358 | 0 | platform | one macro implementation for all three styles |
| `editor-commands.mjs` | 354 | 1 | platform | the editor half of the command registry |
| `sticky-decl.mjs` | 351 | **62** | **param** | ⭐ the Phase 0 role-pilot target |
| `cfg-editor.mjs` | 345 | 0 | **pack** | `.cfg` affordances: spans, open-on-click, hover, reorder |
| `beluga-diag.mjs` | 343 | 2 | **pack** | ⛔ prose locus — the diagnostic scraper |
| `viewport.mjs` | 342 | 4 | param | viewport-scoped work |
| `search-panel.mjs` | 330 | 0 | platform | find/replace in BelJar's design language |
| `context-menu.mjs` | 307 | 0 | surface | ⛔ chords derive, items still hand-built |
| `navigation.mjs` | 256 | 0 | platform | Ctrl-click to definition, Ctrl-hover underline |
| `suite-lint.mjs` | 225 | 5 | **pack** | suite composition, shared by cfg lint and settlement |
| `fold-persist.mjs` | 195 | 0 | platform | fold state persistence |
| `ide-status.mjs` | 191 | 0 | platform | status reporting |
| `scope-highlight.mjs` | 175 | 2 | param | scope highlighting |
| `fold.mjs` | 152 | 13 | **param** | fold regions, declaration-shaped |
| `syntax-lint.mjs` | 148 | 0 | platform | the lint surface; assembles local and backend streams |
| `builtins.mjs` | 147 | **49** | **pack** | Beluga's built-in symbols, pure data |
| `jump-log.mjs` | 140 | 0 | platform | jump history |
| `status-strip-feed.mjs` | 135 | 0 | platform | caret / selection / mode; runs on the typing path |
| `cfg-lint.mjs` | 129 | 0 | **pack** | `.cfg` load-order validation |
| `keymap-style.mjs` | 116 | 0 | platform | the modal-editing assembler |
| `jump-list.mjs` | 110 | 0 | platform | `Ctrl-O` / `Ctrl-I` |
| `save-transforms.mjs` | 108 | 0 | param | save-time text transforms |
| `invalid-highlight.mjs` | 107 | 3 | param | invalid-region highlighting |
| `query-diag.mjs` | 99 | 3 | **pack** | `%:` query pragma bounds |
| `fold-keys.mjs` | 89 | 1 | platform | fold keybindings |
| `relative-line-numbers.mjs` | 87 | 0 | platform | Vim `relativenumber` without a stale gutter |
| `macro-store.mjs` | 82 | 0 | platform | pure macro registers |
| `gutter-tip-band.mjs` | 80 | 0 | platform | one hover region for gutter tooltips |
| `whitespace-selection.mjs` | 53 | 0 | platform | selection helper |
| `follow-sync.mjs` | 52 | 0 | platform | follow-selection toggle |
| `quiet-typing.mjs` | 27 | 0 | platform | typing-path quieting |

## `editor-src/ide/modal/` — 14 files, 2,501 LOC, 0 node sites

All `platform`.

| file | LOC | note |
|---|---:|---|
| `vim-setup.mjs` | 546 | Vim bindings through the package's public API |
| `vim-runtime.mjs` | 328 | what the Vim package needs from BelJar |
| `emacs-runtime.mjs` | 281 | the four things the Emacs package needs |
| `vim-caret.mjs` | 237 | the caret is a CARET, in Normal mode |
| `emacs-keys.mjs` | 190 | every key the package binds, read from its own table |
| `style-policy.mjs` | 153 | chord ownership; declared in the shell catalogue |
| `style-macros.mjs` | 153 | per-style extra keys, as data |
| `emacs-setup.mjs` | 151 | the `C-x` map plus a `C-c` prefix for BelJar's own |
| `vim-ex-names.mjs` | 148 | the ex commands Vim's dispatcher really answers to |
| `reserved-chords.mjs` | 119 | what the browser takes; the platform is a parameter |
| `macro-keys.mjs` | 66 | record/replay keys, as data |
| `which-key.mjs` | 65 | pure half: pending prefix to what it waits for |
| `which-key-hint.mjs` | 41 | resolved against the live registry |
| `undo-route.mjs` | 23 | undo/redo through BelJar's history first |

## `editor-src/ide/completion/` — 10 files, 2,780 LOC

| file | LOC | node | class | note |
|---|---:|---:|---|---|
| `snippets.mjs` | 794 | 106 | **pack** | bodies use `?` as holes so Harpoon owns the rest |
| `classify.mjs` | 465 | 113 | **pack** | cursor-context classification |
| `editor-autocomplete.mjs` | 458 | 0 | platform | the completion UI |
| `type-expect.mjs` | 405 | 71 | **pack** | ⭐ expected type at the cursor — **purely syntactic** (F8) |
| `source.mjs` | 264 | 0 | platform | gathers candidates from the syntax snapshot |
| `contributors.mjs` | 181 | 1 | platform | contributor registry |
| `chrome.mjs` | 90 | 0 | platform | rendering chrome |
| `weigh.mjs` | 67 | 0 | platform | ranking weights; audit-driven only |
| `fuzzy.mjs` | 33 | 0 | platform | pure ranker, duplicated to avoid a bundle seam |
| `index.mjs` | 23 | 0 | build | barrel |

## Pass 2 totals

| | files | LOC |
|---|---:|---:|
| analysed | 63 | 16,743 |
| `platform` | 47 | ~11,300 |
| `param` / `pack` / `surface` | 16 | ~5,400 |

**~68% of the IDE layer is language-neutral**, and the coupling concentrates in six files:
`snippets`, `classify`, `type-expect`, `sticky-decl`, `builtins`, plus the two `.cfg` files.

---

# Pass 3 — semantic, persistence, and the rest of the shell

65 files, 24,020 LOC, **251 grammar node-name sites** — 87% of them in a single file.

| Directory | Files | LOC | node | ext |
|---|---:|---:|---:|---:|
| `editor-src/semantic/` | 28 | 9,316 | 251 | 12 |
| `persist/` | 10 | 5,666 | **0** | 11 |
| `status-strip/` | 7 | 3,147 | **0** | **0** |
| `commands/` | 6 | 1,836 | **0** | 1 |
| `explorer/` | 5 | 1,732 | **0** | 4 |
| `workspace/` | 6 | 1,564 | **0** | 1 |
| `beluga/` | 3 | 759 | **0** | 13 |

## Findings from pass 3

### F12 — ⭐ A fourth coupling dimension: Beluga-named identifiers

`semantic-engine.mjs` is 1,844 LOC — the second-largest file in `semantic/` — and carries
**zero** grammar node sites. It also carries 52 references to Beluga. All of them are
**names**: `belugaDiagnostics`, `belugaClient`, `belugaDiags`, `belugaBuild`,
`checkerShowsBeluga`, `polishBelugaMessage`.

Measured across `js/**/*.mjs`:

| | |
|---|---|
| Beluga-named identifier occurrences | **600** |
| distinct identifiers | **75** |
| files carrying them | **49** |

Top by frequency: `BelugaClient` (60), `BelugaRun` (56), `belugaDiagnostics` (55),
`belugaClient` (34), `getBelugaDiags` (20), `displayBeluga` (18), `BelugaText` (16).

⚠️ **Three of these are public globals** — `BelugaClient`, `BelugaRun`, `BelugaText` — and
`getBelugaDiagnostics()` is an engine method consumed from `syntax-lint.mjs`. This is not
cosmetic: it is the shell's API surface naming one language.

⭐ **The precedent is already in the tree.** `compat/beljar-window-aliases.mjs` exists because
a previous global rename (`BelJar*` → system nouns) shipped with a compatibility shim and a
note to *"burn after callers stop using BelJar\*"*. The same pattern applies:
`Beluga*` → `Provider*`, aliases retained, shim deleted later.

### F13 — The real Beluga surface is ~2,272 sites, not 1,416

Four dimensions, all measured, none reducible to another:

| Dimension | Sites | Nature | Work |
|---|---:|---|---|
| grammar node names | 1,416 | structural | roles conversion (§6) |
| **Beluga-named identifiers** | **600** | naming / public API | rename + compat aliases |
| `.bel-` CSS namespace | 177 | branding | rename (`bel-` → `jar-`) |
| file extensions | 79 | semantic | language-pack `extensions` field |
| **total** | **~2,272** | | |

⭐ Only the first requires design. The other 856 sites are mechanical renames and one
table — the kind of work agent throughput is best at, and the kind that a differential gate
makes safe. **The plan's headline number should be 1,416 *structural* sites out of a ~2,272
total surface**, stated that way so the rename work is scheduled rather than discovered.

### F14 — `semantic/` coupling is 87% one file

`symbol-store.mjs` carries **219 of the directory's 251** node sites. The remainder:
`project-prelude.mjs` 14, `check-gate.mjs` 6, `scoped-check.mjs` 5, `compress-development.mjs`
4, `name-env.mjs` 3.

Everything else is at zero, including the whole orchestration layer confirmed in chunk 4
(`settlement` 0, `semantic-scheduler` 0, `file-health-store` 0) **and now also**
`semantic-engine` 1,844, `editor-check-host` 456, `semantic-graph` 419,
`project-diagnostics` 358, `checker-store` 205, `syntax-store` 151.

**The Meaning refactor of chunk 3 is, in practice, one file plus five small ones.**

### F15 — `status-strip/` is completely clean, and chunk 7 mis-attributed its three lines

3,147 LOC across 7 files: **0 node sites, 0 extension sites.** Chunk 7 reported "3 lines in
`status-strip-view.mjs`" — those are two comments about Beluga types and one state field,
`st.belugaChecking`. That is dimension F12 (naming), not language coupling.

The strip's own headers state the architecture it already has: *"What the editor status strip
says, as data. Pure: no DOM, no globals"*, and the same for the command line's grammar and
the edit-history panel. ⭐ **Three more pure data/projection layers that port untouched.**

### F16 — `beluga/` is the provider directory, and it is already small

3 authored files, 759 LOC: `beluga-run.mjs` (640, Run orchestration, 13 extension sites),
`beluga-text.mjs` (113, ⛔ prose locus), `beluga-run-boot.mjs` (6). Plus the non-`.mjs`
`beluga-client.js` (1,187) and `beluga-worker.js` (165) already covered in chunk 1.

⭐ **This whole directory becomes `providers/beluga/`.** It is the smallest layer in the
analysis and it is the one the distribution design (chunk 10) swaps by script tag.

## `editor-src/semantic/` — 28 files, 9,316 LOC

| file | LOC | node | class | note |
|---|---:|---:|---|---|
| `symbol-store.mjs` | 1864 | **219** | **param** | ⭐ the Meaning core; incremental buckets, prefix-closure soundness |
| `semantic-engine.mjs` | 1844 | 0 | param | ⚠️ structurally generic, entirely Beluga-*named* (F12) |
| `project-prelude.mjs` | 954 | 14 | **pack** | ⛔ *".cfg lists .elf (LF) and .bel files in load order"* — the concatenative model |
| `settlement.mjs` | 713 | 0 | platform | the 8-pass masking loop; gated by `haltsAtFirstError` |
| `editor-check-host.mjs` | 456 | 0 | param | live buffer ↔ provider / project-health host |
| `semantic-graph.mjs` | 419 | 0 | platform | edges: SIGNATURE / BODY / NOTATION |
| `development.mjs` | 403 | 0 | **pack** | canonical module scope via the active `.cfg` |
| `project-diagnostics.mjs` | 358 | 0 | platform | per-file health, live and keyed |
| `semantic-scheduler.mjs` | 338 | 0 | platform | retry back-off ceiling |
| `development-check.mjs` | 248 | 0 | param | development-scoped Tier-2 check |
| `semantic-session.mjs` | 215 | 0 | platform | session lifecycle |
| `checker-store.mjs` | 205 | 0 | param | checker output store |
| `syntax-store.mjs` | 151 | 0 | platform | the lezer snapshot store |
| `name-env.mjs` | 139 | 3 | param | ONE answer to "is this name bound here?" |
| `check-gate.mjs` | 135 | 6 | param | fingerprint + cosmetic/syntax/semantic triage |
| `file-health-store.mjs` | 125 | 0 | platform | pure health helpers |
| `suite-prelude-banner.mjs` | 106 | 0 | **pack** | prelude banner diagnostics |
| `compress-development.mjs` | 106 | 4 | **pack** | signature compression; unnecessary under `project:'resolved'` |
| `workspace-index.mjs` | 100 | 0 | platform | cached development-scoped substrate |
| `scoped-check.mjs` | 99 | 5 | param | smallest well-formed scoped program |
| `ids.mjs` | 85 | 0 | **pack** | `NAMESPACE` — traits / order / labels (chunk 3 §6) |
| `merge-decl-signatures.mjs` | 74 | 0 | **pack** | merge source signature with the reconstructed type |
| `metavar-store.mjs` | 36 | 0 | param | metavariable store |
| `settle-delay.mjs` | 35 | 0 | platform | settle timing |
| `checker-snapshot.mjs` | 33 | 0 | platform | snapshot assembly |
| `syntax-only-gate.mjs` | 30 | 0 | platform | syntax-only edit gate |
| `prelude-cache-key.mjs` | 25 | 0 | platform | pure function of sibling identity |
| `hover-trace.mjs` | 20 | 0 | build | tracing |

## `persist/` — 10 files, 5,666 LOC, 0 node sites

| file | LOC | ext | class | note |
|---|---:|---:|---|---|
| `persist.mjs` | 2076 | 1 | platform | the store |
| `persist-settings.mjs` | 1521 | 2 | platform | settings persistence |
| `persist-file-registry.mjs` | 725 | 6 | **param** | ⚠ the densest extension coupling in `persist/` |
| `persist-layout.mjs` | 419 | 0 | platform | layout |
| `persist-open-tabs.mjs` | 246 | 0 | platform | open tabs |
| `install-edit-history.mjs` | 218 | 1 | platform | edit-history wiring |
| `persist-projects.mjs` | 155 | 1 | platform | project records |
| `tab-guard.mjs` | 124 | 0 | platform | ⛔ two tabs on one project silently destroy work |
| `persist-ui-prefs.mjs` | 95 | 0 | platform | UI prefs |
| `persist-graph-prefs.mjs` | 87 | 0 | platform | graph prefs |

## `status-strip/` — 7 files, 3,147 LOC, 0 node, 0 ext

All `platform`.

| file | LOC | note |
|---|---:|---|
| `status-strip-line-ui.mjs` | 1082 | the command line in three faces |
| `status-strip-view.mjs` | 730 | the full-width strip |
| `status-strip-history-ui.mjs` | 426 | the timeline behind the `⟲` segment |
| `status-strip-segments.mjs` | 363 | ⭐ *"what the strip says, as data. Pure: no DOM, no globals"* |
| `status-strip-history.mjs` | 271 | ⭐ what the history panel says, as data |
| `status-strip-complete.mjs` | 197 | command-line completion; sources injected |
| `status-strip-parse.mjs` | 78 | ⭐ the command line's grammar. Pure |

## `commands/` — 6 files, 1,836 LOC, 0 node sites

All `platform`. This is the registry chunk 7 measured.

| file | LOC | note |
|---|---:|---|
| `command-catalog.mjs` | 706 | 156 entries; data only, no `run`, no DOM. 24 need `requires` |
| `command-settings.mjs` | 360 | the preference table behind `:set` |
| `command-registry.mjs` | 338 | `define` / `attach` / `list` / `run` / `styleFor` |
| `command-shadows.mjs` | 287 | contested-chord arbitration |
| `command-context.mjs` | 106 | the `when()` context |
| `command-names.mjs` | 39 | id vocabulary |

## `explorer/` — 5 files, 1,732 LOC, 0 node sites

| file | LOC | ext | class | note |
|---|---:|---:|---|---|
| `explorer-tree.mjs` | 1214 | 3 | param | nested tree, persisted folds, context menus, DnD |
| `explorer-search.mjs` | 205 | 0 | platform | third member of the `.hsearch` family |
| `explorer-suite-layout.mjs` | 167 | 0 | **pack** | stacks active suites: cfg → members |
| `explorer-inline-name.mjs` | 139 | 1 | param | inline create/rename validation |
| `explorer.mjs` | 7 | 0 | build | domain graph entry |

## `workspace/` — 6 files, 1,564 LOC, 0 node sites

| file | LOC | class | note |
|---|---:|---|---|
| `project-source.mjs` | 557 | param | authored ESM for the shell build |
| `workspace-state.mjs` | 287 | platform | project-scoped UI snapshot |
| `side-panel-resize.mjs` | 285 | platform | live resizer set; re-init replaces |
| `float-placement.mjs` | 235 | platform | floating-window placement |
| `workspace-split.mjs` | 190 | platform | live layout |
| `workspace.mjs` | 10 | build | domain graph entry |

## `beluga/` — 3 authored files, 759 LOC → becomes `providers/beluga/`

| file | LOC | ext | class | note |
|---|---:|---:|---|---|
| `beluga-run.mjs` | 640 | 13 | **pack** | Run orchestration; routes output, does not scrape it |
| `beluga-text.mjs` | 113 | 0 | **pack** | ⛔ prose locus — `isBelugaCommandError` |
| `beluga-run-boot.mjs` | 6 | 0 | build | glue |

## Pass 3 totals

| | files | LOC |
|---|---:|---:|
| analysed | 65 | 24,020 |
| `platform` | 44 | ~13,400 |
| `param` / `pack` / `build` | 21 | ~10,600 |

**The shell layers (`persist`, `status-strip`, `commands`, `workspace`, `explorer`) are
13,945 LOC at zero grammar coupling.** All remaining structural work in this pass sits in
`semantic/`, and 87% of that is `symbol-store.mjs`.

---

# Pass 4 — the proof stack

43 files, 26,680 LOC, **73 grammar node-name sites**. The most Beluga-specific code in the
repository, and the metric barely registers it.

| Directory | Files | LOC | node |
|---|---:|---:|---:|
| `editor-src/prover/` | 25 | 18,048 | 64 |
| `harpoon/` | 13 | 7,823 | **1** |
| `editor-src/harpoon/` | 4 | 649 | 8 |
| `editor-src/perf/` | 1 | 160 | 0 |

## Findings from pass 4

### F17 — ⛔ The purity lint is near-blind on exactly the code it would most matter for

26,680 LOC — Orca's entire generation engine, the move set, the splitter, the synthesiser,
the hypothesis reasoner, the whole Harpoon lab — produce **73** node sites, and **57 of those
are in one file** (`hole-split.mjs`).

A purity lint reading 73 across 26,680 LOC would report the proof stack as one of the
cleanest areas in the codebase. Chunk 6 measured it as **73% generation of Beluga text**.

**Both are true.** Orca is a text-level engine: it synthesises Beluga source, splices it, and
asks the oracle. Its language knowledge lives in string templates, totality measures, case-arm
shapes and coverage workarounds — none of which mention a grammar node name.

⛔ **The Phase 0 purity lint measures STRUCTURAL coupling only. It must never be read as
"language coupling."** For code destined for `lang/`, the only correct measure is *is it in
`lang/`*. The lint's job is to drive `js/` outside `lang/` and `providers/` to zero — not to
certify that anything inside them is clean.

This is the sharpest instance yet of F2's rule, and it changes how the gate is reported:
**two numbers, not one** — structural sites outside `lang/`, and LOC still awaiting
relocation into it.

### F18 — ⭐ The Harpoon surface is far more portable than chunk 5 assumed

13 files, 7,823 LOC, **1 node site**. The lab tree, the reel, the display, the panel, the
commit path, the goal sections — none of them read the grammar.

Its language coupling is concentrated in **display helpers**: `displayBeluga` (18),
`looksLikeBeluga` (5), `belugaText` (2), plus turnstile rendering (`|-` and `⊢`, 34 sites
between them — the same leak `status-strip-view.mjs` guards against in its own comment).

⭐ Combined with chunk 5's generic Goal (bands of typed binders) and chunk 9's finding that
rendering is a pack artifact: **the Harpoon surface is platform code with a pack-supplied
renderer.** Under Mode B it needs the six verbs, a tactic vocabulary, and one
`renderTerm`-shaped function. That is a much smaller port than "8,000 lines of proof UI."

### F19 — `hole-split.mjs` is the single densest coupling in the repository

3,546 LOC and 57 node sites — the only file in the proof stack that genuinely reads the AST,
because case analysis has to see constructors. It is also the largest single file in `js/`.

It is unambiguously `lang/beluga/`, and chunk 6's standing rule applies: relocate, do not
refactor.

### Size reconciliation

Chunk 5 estimated Harpoon surface source at ~8,050 LOC (7,823 measured) and chunk 6 put
`prover/` at 18,122 (18,048 measured). Both within 1% — the small deltas are deletions from
the 2026-09-10 refactor, which removed ~110 lines across `prover-candidates`, `prover-moves`,
`hole-split` and several `harpoon/` files.

## `editor-src/prover/` — 25 files, 18,048 LOC

Chunk 6 classes: **G** generation · **F** frame · **S** surface.

| file | LOC | node | ch6 | class | note |
|---|---:|---:|:--:|---|---|
| `hole-split.mjs` | 3546 | **57** | G | **pack** | ⭐ the only AST-reading prover file (F19) |
| `prover-moves.mjs` | 2255 | 0 | G | **pack** | the move set |
| `prover-synth.mjs` | 2199 | 0 | G | **pack** | term synthesis |
| `prover-orchestrator.mjs` | 1705 | 0 | F | **pack** | ⛔ loop control interleaved with Beluga heuristics; do not refactor |
| `prover-hyp.mjs` | 1416 | 0 | G | **pack** | hypothesis reasoning |
| `prover-candidates.mjs` | 1388 | 2 | G | **pack** | `candidateMoves` — the Tier 3 entry point |
| `hole-actions.mjs` | 634 | 0 | S | surface | hole action layer |
| `hole-goal-system.mjs` | 628 | 2 | S | param | project-wide goal list |
| `prover-comp-type.mjs` | 611 | 0 | G | **pack** | computation types |
| `prover-counterexample.mjs` | 605 | 0 | G | **pack** | counterexample search |
| `prover-corpus-decls.mjs` | 471 | 1 | G | **pack** | corpus lemma index |
| `prover-unify.mjs` | 435 | 0 | G | **pack** | unification |
| `prover-certify.mjs` | 330 | 1 | F | param | ⛔ certification; per-language predicate |
| `prover-inhabit.mjs` | 317 | 0 | G | **pack** | inhabitation |
| `prover-manual.mjs` | 308 | 0 | F | param | the pure manual reducer (chunk 5) |
| `hole-decorations.mjs` | 215 | 0 | S | platform | hole decorations |
| `hole-goal-display.mjs` | 205 | 0 | S | param | goal display |
| `hole-report.mjs` | 183 | 1 | S | param | hole reporting |
| `prover-transport.mjs` | 163 | 0 | F | platform | dedicated search worker |
| `prover-captions.mjs` | 107 | 0 | S | **pack** | move captions; parses Beluga move text |
| `hole-goal-pending-ui.mjs` | 91 | 0 | S | platform | pending state |
| `hole-goals-store.mjs` | 90 | 0 | F | platform | goal store |
| `prover-policy.mjs` | 60 | 0 | F | platform | depth / time budget |
| `cached-goal-hint.mjs` | 51 | 0 | S | param | cached hints |
| `ident.mjs` | 35 | 0 | G | **pack** | identifier helpers |

## `harpoon/` — 13 files, 7,823 LOC, 1 node site

| file | LOC | class | note |
|---|---:|---|---|
| `harpoon-lab.mjs` | 2058 | param | the lab shell; 1 node site |
| `harpoon-lab-manual.mjs` | 1419 | param | manual mode surface |
| `harpoon-panel.mjs` | 746 | platform | the docked panel |
| `harpoon-lab-tree-ui.mjs` | 739 | platform | proof-tree rendering |
| `harpoon-lab-tree.mjs` | 706 | param | proof-tree model |
| `harpoon-lab-reel.mjs` | 608 | platform | step reel |
| `harpoon-lab-display.mjs` | 590 | param | goal display; `displayBeluga` lives near here |
| `harpoon-lab-auto.mjs` | 417 | param | the Orca state (idle → running → paused → absorbed) |
| `harpoon-lab-commit.mjs` | 270 | param | commit the session back to source |
| `harpoon-goal-sections.mjs` | 201 | platform | goal sectioning — maps to Goal bands |
| `harpoon-glyphs.mjs` | 40 | **pack** | Beluga glyphs |
| `harpoon-icon.mjs` | 19 | platform | icon |
| `harpoon-ui.mjs` | 10 | build | bundle entry |

## `editor-src/harpoon/` — 4 files, 649 LOC

| file | LOC | node | class | note |
|---|---:|---:|---|---|
| `harpoon-program.mjs` | 256 | 0 | param | program extraction |
| `harpoon-anchor.mjs` | 179 | 0 | param | ties a session to a source location |
| `harpoon-model.mjs` | 119 | 0 | platform | ⭐ the normalized goal shape — `{id,label,goal,ctx,meta}` (chunk 5 §3) |
| `scan-file-holes.mjs` | 95 | **8** | **pack** | syntactic hole scan for the project-wide goal list |

## `editor-src/perf/` — 1 file

| file | LOC | class | note |
|---|---:|---|---|
| `check-trace.mjs` | 160 | build | `timeSync` tracing used by `walkTree` / `syntaxLint` |

## Pass 4 totals

| | files | LOC |
|---|---:|---:|
| analysed | 43 | 26,680 |
| `pack` (relocate to `lang/beluga/`) | 16 | ~13,900 |
| `param` / `surface` | 17 | ~9,000 |
| `platform` / `build` | 10 | ~3,800 |

⭐ **~13,900 LOC relocates wholesale**, which is the cheapest work in the entire project: no
refactor, no roles conversion, no design. Chunk 2 predicted ~446 node sites would "relocate,
not generalize"; pass 4 shows the relocation is measured better in **LOC than in sites**,
because the densest language knowledge carries no node names at all.

---

# Pass 5 — the `editor-src/` core, graph, format — `js/` complete

32 files, 15,363 LOC, **631 grammar node-name sites** — the densest pass, and the one that
closes `js/`.

| Directory | Files | LOC | node |
|---|---:|---:|---:|
| `editor-src/` (root) | 13 | 7,623 | 386 |
| `editor-src/format/` | 9 | 2,634 | 245 |
| `editor-src/graph/` | 8 | 4,895 | **0** |
| stragglers | 2 | 211 | 0 |

## Findings from pass 5

### F20 — ⭐ Every node site in `js/` is now attributed. The passes reconcile exactly.

| Pass | Scope | node sites |
|---|---|---:|
| 1 | app shell | 6 |
| 2 | IDE layer | 455 |
| 3 | semantic + shell services | 251 |
| 4 | proof stack | 73 |
| 5 | `editor-src` core, format, graph | 631 |
| | **total** | **1,416** |

The census reports **1,416** for `js/`. **6 + 455 + 251 + 73 + 631 = 1,416.**

⭐ This is the completeness proof the passes were for: not "we looked at everything" as a
claim, but every structural coupling site in `js/` landed in a named file with a line in this
record. `js/` is closed — 259 files, 103,946 LOC, zero unanalysed.

### F21 — ⚠️ A tree-wide `cat | grep` silently under-reports, and it fooled the reconciliation once

`semantic/development-check.mjs` contains a deliberate NUL byte at line 197:

```js
for (const m of members) s += `${m.name}\x00${fnv1a(String(m.text ?? ''))}\x01`;
```

A collision-proof field separator in a development signature — correct, intentional, and not
a defect. But it makes `grep` treat any concatenated stream containing that file as **binary**
and emit `Binary file (standard input) matches` instead of the matches. A `wc -l` on that
reads **1**.

The first reconciliation attempt therefore scored `semantic/` at 1 instead of 251 and the
totals missed by 250.

⛔ **Measurement rule:** count node sites **per file**, or pass `grep -a`. The census
(`starjar-census.mjs`) reads files individually through Node and was never affected — which
is why the instrument's 1,416 held while the ad-hoc shell arithmetic did not. One more reason
the gate lives in the script, not in a command line.

### F22 — `editor-src/` root is the second-densest area, and it is four files

386 sites across 13 files, but 345 of them (89%) are in four: `name-resolve.mjs` 140,
`tree-walk.mjs` 116, `infix.mjs` 62, `tree-helpers.mjs` 27.

All four are exactly what chunks 2–4 predicted: `name-resolve` is hover and type projection
(Presentation, chunk 9), `tree-walk` is the Meaning walk (chunk 3), `infix` is the flat-spine
re-association post-pass (chunk 4), `tree-helpers` is shared traversal.

### F23 — `graph/` holds at zero across all eight files

4,895 LOC, **0** node sites, confirmed file by file. Chunk 9's headline survives pass-level
scrutiny on this metric — with F2's caveat intact: `graph-view.mjs` still carries `.cfg`
project logic, which is the extensions dimension, not the structural one.

## `editor-src/` root — 13 files, 7,623 LOC

| file | LOC | node | class | note |
|---|---:|---:|---|---|
| `editor.mjs` | 1886 | 12 | param | the editor assembly; 30 Beluga-named identifiers |
| `name-resolve.mjs` | 1560 | **140** | **pack** | hover resolution, type projection, undefined-application diags |
| `edit-history.mjs` | 1308 | 0 | platform | ⛔ the total recorder; undo must never refuse |
| `tree-walk.mjs` | 866 | **116** | **param** | `walkTree` — blocks, parse diags, the names walk (chunk 3) |
| `language.mjs` | 448 | 7 | **pack** | the CodeMirror language definition |
| `infix.mjs` | 356 | **62** | **pack** | flat-spine re-association from a fixity table (chunk 4 §5) |
| `aliases.mjs` | 351 | 0 | **pack** | glyph aliases (`\|-` → `⊢`) |
| `lint-units.mjs` | 337 | 22 | **param** | `computeLintBlocks` — the check unit (chunk 3 §4) |
| `editor-prefs.mjs` | 240 | 0 | platform | editor preferences |
| `beluga-tokens.mjs` | 94 | 0 | **pack** | the four external tokenizers |
| `tree-helpers.mjs` | 90 | 27 | param | shared traversal helpers |
| `project-paths.mjs` | 46 | 0 | **pack** | ⭐ the extensions source of truth (F1) |
| `editor-doc-prep.mjs` | 41 | 0 | platform | document preparation |

## `editor-src/format/` — 9 files, 2,634 LOC

| file | LOC | node | class | note |
|---|---:|---:|---|---|
| `printer.mjs` | 1354 | **234** | **pack** | the Beluga pretty-printer — densest node coupling in `js/` after `hole-split` |
| `document-format.mjs` | 336 | 2 | platform | drives the format command; gates on `format` capability |
| `proof-script.mjs` | 175 | 1 | **pack** | proof-script formatting |
| `type-render.mjs` | 169 | 0 | **pack** | type rendering |
| `proof-format.mjs` | 135 | 0 | **pack** | proof formatting |
| `doc.mjs` | 135 | 0 | platform | ⭐ Wadler document combinators — free for every language |
| `source-render.mjs` | 127 | 0 | platform | source rendering |
| `basics.mjs` | 107 | 8 | param | formatting primitives |
| `layout.mjs` | 96 | 0 | platform | the layout renderer |

## `editor-src/graph/` — 8 files, 4,895 LOC, 0 node sites

All `platform`. One language input: `signatureBoundary` (chunk 9 §1).

| file | LOC | note |
|---|---:|---|
| `graph-view.mjs` | 2130 | the graph surface; ⚠ carries `.cfg` project logic (F2) |
| `flat-graph.mjs` | 1087 | SVG fallback when WebGL is unavailable |
| `webgl-graph.mjs` | 1051 | the 3D renderer |
| `force-sim.mjs` | 255 | force simulation |
| `group-graph.mjs` | 191 | suite-level grouping |
| `graph-nav.mjs` | 89 | navigation |
| `mat4.mjs` | 58 | matrix maths |
| `graph-prefs.mjs` | 34 | preferences |

## Stragglers — 2 files, 211 LOC

| file | LOC | class | note |
|---|---:|---|---|
| `harpoon/harpoon-client.js` | 160 | **pack** → `providers/` | ⭐ drives the six unimplemented Tier-2 verbs (chunk 1 §2) |
| `shell.mjs` | 51 | build | the shell bundle entry |

## Pass 5 totals

| | files | LOC |
|---|---:|---:|
| analysed | 32 | 15,363 |
| `pack` | 12 | ~4,600 |
| `param` | 6 | ~3,600 |
| `platform` / `build` | 14 | ~7,200 |

---

# `js/` — closed

| | |
|---|---|
| files | **259** |
| LOC | **103,946** |
| structural (node) sites | **1,416**, all attributed |
| unanalysed | **0** |

Remaining for the complete picture: `css/` (43 files, 16,262 LOC), `scripts/` (32, 9,986),
`tests/` (257, 30,587), and the four root files.

---

# Pass 6 — `css/`

43 files, 16,219 LOC. Never examined in chunks 0–10. The result is better than expected and
contains one practical decision that should be made now.

## Findings from pass 6

### F24 — ⭐ CSS carries zero Beluga language concepts

Searched for syntax-token classes tied to the language — `lf`, `comp`, `schema`, `ctype`,
`pragma`, `keyword`, `constructor`, `meta`. **None exist.** The only matches are
`.cm-tooltip-autocomplete` and `.cm-completionMatchedText`, both CodeMirror chrome.

The reason: **syntax highlighting is styled in JavaScript, not CSS.** `editor-src/language.mjs`
(448 LOC, 7 node sites) holds the `styleTags` / `HighlightStyle` mapping. Highlight colours
come from design tokens applied through lezer tags, so a language pack changes the *tag
mapping* and inherits the whole palette.

⭐ **A language pack ships no CSS.** That was not obvious and it removes a whole category of
per-language work.

The classes that *look* language-shaped — `.harpoon-hole-goal`, `.harpoon-lab-move`,
`.harpoon-panel-hole`, `.cm-hole-gutter`, `.hpt-split-rail` — are **proof-surface
vocabulary**, which chunk 5 established is generic: holes, goals, moves and tactics exist in
every assistant. They stay.

### F25 — ⚠️ Two product prefixes already coexist. Do not start a third.

| Prefix | in `css/` | in `js/` | Used by |
|---|---:|---:|---|
| `.bel-` | 288 | 177 | graph-3d, editor, explorer, command-palette, ide, inspector-detail |
| `.bj-` | 563 | — | status-strip, dialogs, settings, keybindings, tooltip |

Both stand for **BelJar**, not Beluga. F4 called `.bel-` "branding, not semantics" — correct,
but it also implied a single clean rename. In fact **a `bel-` → `bj-` migration is already
half-done**, with the newer surfaces (the status strip, the dialog family) on `bj-` and the
older ones still on `bel-`.

⛔ **Decision needed now, not in Phase 1.** Introducing a third prefix for \*jar would leave
two incomplete migrations. Either finish `bel-` → `bj-` and treat `bj-` as the permanent
namespace, or pick the final name once and convert both. The 465 CSS sites and 177 JS sites
are cheap today and get more expensive with every probe selector written against them.

This is the only CSS work the platform actually requires.

### F26 — 1,104 LOC of CSS is capability-gated dead weight

`harpoon-orca.css` is 1,104 LOC styling a surface that only exists when a provider supplies
`moveCandidates` (Tier 3). Under Rocq — which per chunk 5 uses Mode B and needs no move
generator — none of it applies.

The proof surface is 3,495 LOC of CSS in total:

| file | LOC | gate |
|---|---:|---|
| `harpoon-lab.css` | 1956 | `proof` |
| `harpoon-orca.css` | 1104 | **`moveCandidates`** |
| `harpoon-tree.css` | 333 | `proof` |
| `harpoon-panel.css` | 97 | `proof` |
| `harpoon.css` | 5 | barrel |

⭐ **CSS needs the same bundle split as JS**: core stylesheet, plus capability- and
pack-scoped sheets loaded with the language pack. Otherwise RocqJar ships 1,104 lines of
styling for a feature it does not have — harmless to render, but it is the CSS analogue of
the dead-affordance problem, and it makes the pack boundary honest.

## `css/` — 43 files, 16,219 LOC

**Class** — all `platform` unless noted.

| file | LOC | `bel-` | `bj-` | class | note |
|---|---:|---:|---:|---|---|
| `harpoon-lab.css` | 1956 | 8 | 0 | surface | the lab; gated `proof` |
| `status-strip.css` | 1252 | 0 | 207 | platform | the strip, fully on `bj-` |
| `harpoon-orca.css` | 1104 | 0 | 0 | **pack** | ⛔ gated `moveCandidates` (F26) |
| `dialogs-aliases.css` | 882 | 0 | 148 | platform | the alias sheet |
| `ide.css` | 829 | 10 | 4 | platform | editor chrome |
| `repl-results.css` | 730 | 0 | 0 | platform | REPL output |
| `graph-3d.css` | 718 | 128 | 0 | platform | ⚠ densest `bel-` file |
| `library-find.css` | 660 | 0 | 0 | platform | library search |
| `editor.css` | 657 | 30 | 0 | platform | editor surface; theme-aware match highlights |
| `notifications.css` | 535 | 0 | 0 | platform | inbox |
| `dialogs-settings.css` | 514 | 0 | 113 | platform | settings dialog |
| `tooltip.css` (components) | 488 | 0 | 19 | platform | tooltip component |
| `tokens.css` | 484 | 0 | 1 | platform | ⭐ the design system — 277 custom properties + font faces |
| `explorer.css` | 476 | 30 | 0 | platform | project tree |
| `library-preview.css` | 417 | 4 | 0 | platform | library preview |
| `dialogs-library-preview.css` | 361 | 0 | 5 | platform | preview dialog |
| `inspector-detail.css` | 336 | 9 | 0 | platform | inspector detail |
| `harpoon-tree.css` | 333 | 0 | 0 | surface | proof tree; gated `proof` |
| `library-panel.css` | 331 | 0 | 0 | platform | library panel |
| `dialogs-keybindings.css` | 284 | 0 | 45 | platform | keybindings sheet |
| `menu.css` (components) | 281 | 0 | 0 | platform | menu component |
| `header.css` | 254 | 0 | 0 | platform | header |
| `command-palette.css` | 234 | 31 | 0 | platform | palette |
| `inspector-header.css` | 202 | 0 | 0 | platform | inspector header |
| `floating-window.css` | 198 | 0 | 0 | platform | floating windows |
| `dialogs-base.css` | 195 | 0 | 37 | platform | dialog base |
| `hint.css` (components) | 169 | 0 | 0 | platform | coachmarks |
| `base.css` | 162 | 3 | 3 | platform | reset + base |
| `repl-panel.css` | 150 | 0 | 0 | platform | REPL panel |
| `graph.css` | 146 | 25 | 0 | platform | flat graph |
| `workspace.css` | 144 | 0 | 0 | platform | workspace layout |
| `inspector-panel.css` | 141 | 0 | 0 | platform | inspector panel |
| `responsive.css` | 120 | 0 | 0 | platform | responsive rules |
| `repl-stream.css` | 116 | 0 | 0 | platform | REPL stream |
| `inspector-overview.css` | 115 | 0 | 0 | platform | inspector overview |
| `autocomplete.css` (components) | 100 | 0 | 0 | platform | completion popup |
| `harpoon-panel.css` | 97 | 0 | 0 | surface | proof panel; gated `proof` |
| `style.css` | 24 | 0 | 0 | build | the import barrel |
| `dialogs.css` | 6 | 0 | 0 | build | barrel |
| `inspector.css` | 5 | 0 | 0 | build | barrel |
| `harpoon.css` | 5 | 0 | 0 | build | barrel |
| `repl.css` | 4 | 0 | 0 | build | barrel |
| `library.css` | 4 | 0 | 0 | build | barrel |

## Pass 6 totals

| Category | LOC |
|---|---:|
| shell chrome (dialogs, inspector, repl, library, graph, header, workspace, components) | ~10,900 |
| proof surface (`proof`-gated) | 2,391 |
| **Orca (`moveCandidates`-gated)** | **1,104** |
| design system | 790 |
| barrels | 48 |

| | files | LOC |
|---|---:|---:|
| analysed | 43 | 16,219 |
| `platform` | 36 | ~14,700 |
| `surface` (capability-gated) | 3 | 2,386 |
| `pack` | 1 | 1,104 |
| `build` | 6 | 48 |

⭐ **~91% of the stylesheet is language-neutral, and a language pack ships no CSS at all.**
The only required work is the prefix decision (F25) and a capability-scoped bundle split
(F26).

---

# Pass 7 — the gates and the safety net

`scripts/` 32 files / 9,986 LOC, `tests/` 257 files / 30,587 LOC, plus four root files.
This is the pass that most directly changes Phase 0.

## Findings from pass 7

### F27 — ⭐⚠️ The safety net is 83% Beluga, and that cuts two ways

| | files | LOC |
|---|---:|---:|
| tests total | 257 | 30,587 |
| language-touching | **194** | **25,546 (83%)** |
| language-free | 63 | 5,041 |
| carrying grammar node sites | **20** | 5,679 |

Two conclusions, both true, about different risks:

**(a) ⭐ The roles conversion is well protected.** Only **20 of 257** test files reference a
grammar node name at all (66 sites, and 18 of them in `test-autocomplete.mjs`). The suite
exercises behaviour through the API, not AST internals, so 237 tests survive the chunk-2
refactor untouched and will catch regressions in it. This is much better than the 1,416-site
refactor deserved.

**(b) ⚠️ RocqJar arrives with almost no coverage.** 194 of 257 tests are written in Beluga,
against Beluga expectations. They protect BelJar; they say nothing about a second language
pack. The conformance suite **cannot be harvested from them** — it has to be written.

⛔ **Consequence for the plan:** Phase 1's exit criterion *"corpus symbol output identical"*
is doing almost all of the work, and the unit suite protects far less of the *generalization*
than its 257-file count suggests. The Phase 0 shell differential is not one gate among
several — it is the gate.

### F28 — The conformance suite has a seed, and it is 20 files

Tests whose *intent* transfers even though their inputs do not: settlement behaviour, the
checker store, diagnostic shape, prelude assembly, the dirty frontier, cross-file resolution.
**2,826 LOC of contract already written down** — as Beluga cases, but the assertions describe
provider obligations.

⭐ Rewriting these 20 against `MockProvider` is the cheapest possible start on the conformance
suite, and it would happen in Phase 1 anyway.

### F29 — `prover-differential.mjs` exists; the native oracle it needs does not

`scripts/prover-differential.mjs` (97 LOC) and `scripts/prover-native-oracle.mjs` (115) are
the `prover:diff` gate. ⛔ It reports 0/199 STUCK file-errors because `main.exe` has been gone
since 2026-08-22 — **a missing tool, not a regression**, and nothing may be reverted on its
strength.

This matters to Phase 0 precisely because the shell differential is a *different* instrument:
it runs parse → symbols → scopes → outline → local diagnostics, entirely in JS, with **no
native oracle**. It is therefore buildable today, unlike `prover:diff`.
`scripts/corpus-harness.mjs` (269), `corpus-plan.mjs` (186) and `corpus-report.mjs` (147) are
the existing corpus plumbing to build it on.

### F30 — ⚠️ Nine stray files sit in `scripts/`

`debug-str-step-recurse-check.mjs` (57), `debug-str-step-recurse-variants.mjs` (55),
`debug-str-step-prime.mjs` (53), `tmp-probe.mjs` (51), `tmp-inp-recurse.mjs` (49),
`cp-str-step-prelude.mjs` (27) — **292 LOC of debug and temp scratch** in a directory that is
otherwise the gate suite. ⛔ Probes belong in `scratch/probes/`, which is gitignored.

Harmless, but they inflate every `scripts/` measurement and they are the kind of thing that
gets mistaken for tooling. Worth deleting or moving before the census becomes a published
number.

### F31 — The probe suite is 6,359 LOC and almost entirely platform

| Probe | LOC | Protects |
|---|---:|---|
| `probe-keymap.mjs` | 3314 | per-style chord delivery ⛔ the gate that caught the null-binding undo shadow |
| `probe.mjs` | 998 | the routine app gate (~24s) |
| `probe-manual-harpoon.mjs` | 792 | the manual proof surface |
| `probe-undo.mjs` | 700 | ⛔⛔ 87 checks — undo must never refuse |
| `probe-harpoon-panel.mjs` | 405 | the holes panel |
| `probe-harness.mjs` | 150 | shared Chrome driving |

⭐ Four of six are language-neutral and transfer to \*jar directly. The two Harpoon probes
become capability-gated: they run when a provider declares `proof`, and the
capability-projection probe (chunk 7 §5) joins them as the seventh.

## `scripts/` — 32 files, 9,986 LOC

| file | LOC | class | note |
|---|---:|---|---|
| `probe-keymap.mjs` | 3314 | platform | per-style chord delivery; ⛔ never add keymap checks to `probe.mjs` |
| `probe.mjs` | 998 | platform | the routine app gate |
| `probe-manual-harpoon.mjs` | 792 | surface | gated `proof` |
| `probe-undo.mjs` | 700 | platform | ⛔⛔ 87 checks, the undo law |
| `autocomplete-audit.mjs` | 563 | **pack** | completion MRR audit |
| `prover-probes.mjs` | 498 | **pack** | Orca probes |
| `probe-harpoon-panel.mjs` | 405 | surface | gated `proof` |
| `corpus-harness.mjs` | 269 | param | ⭐ corpus plumbing for the Phase 0 differential |
| `chord-audit.html` | 231 | platform | ⏳ the unmeasured Mac chord table |
| `corpus-plan.mjs` | 186 | param | corpus planning |
| `autocomplete-weigh-sweep.mjs` | 176 | **pack** | ranking-weight sweep |
| `prover-bench.mjs` | 172 | **pack** | Orca benchmark |
| `starjar-census.mjs` | 169 | platform | ⭐ the coverage instrument |
| `probe-harness.mjs` | 150 | platform | shared Chrome driving |
| `corpus-report.mjs` | 147 | param | corpus reporting |
| `prover-native-oracle.mjs` | 115 | **pack** | ⛔ needs `main.exe`, gone since 2026-08-22 |
| `prover-firstmove-audit.mjs` | 114 | **pack** | first-move audit |
| `prover-arity-audit.mjs` | 106 | **pack** | arity audit |
| `prover-intro-audit.mjs` | 104 | **pack** | intro audit |
| `prover-differential.mjs` | 97 | **pack** | ⛔ `prover:diff` — DOWN (F29) |
| `prover-residue-audit.mjs` | 94 | **pack** | residue audit |
| `check-build-stale.mjs` | 90 | build | ⚠ must extend to language/provider bundles (chunk 10) |
| `split-css-concerns.mjs` | 64 | build | CSS splitting |
| `build-shell.mjs` | 59 | build | shell bundle |
| `debug-str-step-recurse-check.mjs` | 57 | **stray** | ⚠ F30 |
| `debug-str-step-recurse-variants.mjs` | 55 | **stray** | ⚠ F30 |
| `debug-str-step-prime.mjs` | 53 | **stray** | ⚠ F30 |
| `tmp-probe.mjs` | 51 | **stray** | ⚠ F30 |
| `tmp-inp-recurse.mjs` | 49 | **stray** | ⚠ F30 |
| `vendor-fonts.mjs` | 27 | build | font vendoring |
| `cp-str-step-prelude.mjs` | 27 | **stray** | ⚠ F30 |
| `build-editor.mjs` | 22 | build | editor bundle |

## Root files — 4

| file | LOC | class | note |
|---|---:|---|---|
| `beluga.grammar` | 752 | **pack** | ⭐ 205 node names; → `lang/beluga/grammar.lezer` |
| `index.html` | 266 | param | ⭐ the seven script tags; swap two for RocqJar (chunk 10) |
| `sw.js` | 96 | build | service worker; caches the bundle set |
| `eslint.config.mjs` | 157 | build | lint config; `npm run lint` held at 0 |

## `tests/` — 257 files, 30,587 LOC

Fixtures: `tests/fixtures` (7 files) + `fixtures/userguide` (5), `tests/heldout-corpus` (15
across three dated batches). ⭐ The held-out corpus is the falsification instrument
(`project_corpus_masking_harness`) and is **language-pack data**.

Eight non-`test-` helpers: `run-all.mjs` (the runner, platform), `_beluga-check.mjs` and
`_library-cfg.mjs` (pack helpers), `analyze-scope-corpus.mjs`, `measure-check-scaling.mjs`,
`scope-parity.mjs` (pack instruments), `persist-stack.mjs`, `project-source-stack.mjs`
(platform stacks).

### Conformance candidates — 20 files, 2826 LOC

These exercise the shell↔backend contract: settlement, the checker store, diagnostics,
prelude assembly, the dirty frontier, cross-file resolution. ⭐ **They are the seed of the
provider conformance suite** — the only tests here whose *intent* transfers to another
assistant, even though their inputs do not.

| file | LOC | node |
|---|---:|---:|
| `test-cross-file-nav.mjs` | 442 |  |
| `test-settlement-prelude-recovery.mjs` | 402 |  |
| `test-settlement-multipass.mjs` | 244 |  |
| `test-checker-store.mjs` | 188 |  |
| `test-frontier-certify.mjs` | 174 |  |
| `test-development-diagnostics.mjs` | 162 |  |
| `test-development-check.mjs` | 145 |  |
| `test-project-diagnostics.mjs` | 144 |  |
| `test-beluga-diag.mjs` | 135 |  |
| `test-settlement-graph.mjs` | 121 |  |
| `test-suite-prelude-banner.mjs` | 106 |  |
| `test-edit-cost-frontier.mjs` | 104 |  |
| `test-settlement-hoist.mjs` | 86 |  |
| `test-cross-file-prewarm.mjs` | 76 |  |
| `test-settlement-defer.mjs` | 67 |  |
| `test-cross-file-external-elaborate.mjs` | 65 |  |
| `test-beluga-check-mask.mjs` | 53 |  |
| `test-checker-holes.mjs` | 39 |  |
| `test-isolation-cross-file.mjs` | 39 |  |
| `_beluga-check.mjs` | 34 |  |

### Language-pack tests — 174 files, 22720 LOC

Beluga inputs, Beluga expectations. These move to `lang/beluga/tests/` and do not transfer.

| file | LOC | node |
|---|---:|---:|
| `test-autocomplete.mjs` | 1961 | 18 |
| `test-prover-synth.mjs` | 1151 | 1 |
| `test-prover-bridge.mjs` | 866 |  |
| `test-edit-history.mjs` | 704 |  |
| `test-hole-split.mjs` | 485 |  |
| `test-prover-coverage-matrix.mjs` | 424 | 1 |
| `test-settings-persist.mjs` | 418 |  |
| `test-project-source.mjs` | 350 |  |
| `test-shell-boot.mjs` | 318 |  |
| `test-prover-coinductive.mjs` | 275 |  |
| `test-prover-prefilter.mjs` | 270 | 3 |
| `test-prover-manual.mjs` | 268 |  |
| `measure-check-scaling.mjs` | 250 | 7 |
| `test-status-strip-segments.mjs` | 246 |  |
| `test-corpus-decls.mjs` | 236 | 1 |
| `test-flat-graph-layout.mjs` | 236 |  |
| `test-project-chaos.mjs` | 235 |  |
| `test-prover-counterexample.mjs` | 232 |  |
| `test-prover-block-schema.mjs` | 211 |  |
| `test-hover-env-parity.mjs` | 205 | 2 |
| `test-status-strip-line.mjs` | 196 |  |
| `test-prover-decok-soundness.mjs` | 193 |  |
| `test-development.mjs` | 189 |  |
| `test-implicit-binder-typing.mjs` | 182 |  |
| `test-cfg-lint.mjs` | 177 |  |
| `test-projects.mjs` | 176 |  |
| `test-persist-capacity.mjs` | 174 |  |
| `test-status-strip-history.mjs` | 174 |  |
| `scope-parity.mjs` | 172 | 4 |
| `test-library-corpus.mjs` | 172 |  |
| `test-cfg-sync.mjs` | 168 |  |
| `test-hole-goal-display.mjs` | 167 |  |
| `test-notification-view.mjs` | 166 |  |
| `test-explorer-move.mjs` | 164 |  |
| `test-graph-incremental-equivalence.mjs` | 164 |  |
| `test-workspace-state.mjs` | 163 |  |
| `test-multifile-switch.mjs` | 160 |  |
| `test-prover-completeness.mjs` | 158 |  |
| `test-prover.mjs` | 157 |  |
| `analyze-scope-corpus.mjs` | 154 |  |
| `test-type-render.mjs` | 154 |  |
| `test-command-palette.mjs` | 152 |  |
| `test-repl-run-cmd.mjs` | 151 |  |
| `test-suite-lint.mjs` | 151 |  |
| `test-notification-store.mjs` | 145 |  |
| `test-name-conflicts.mjs` | 143 |  |
| `test-harpoon-anchor.mjs` | 142 |  |
| `test-prover-no-overfit.mjs` | 139 | 1 |
| `test-symbolstore-incremental-equivalence.mjs` | 138 |  |
| `test-walk-parity.mjs` | 138 | 1 |
| `test-checkpoint-v2.mjs` | 134 |  |
| `test-group-graph.mjs` | 134 |  |
| `run-all.mjs` | 133 |  |
| `test-repl-autocomplete.mjs` | 132 |  |
| `test-semantic-intel.mjs` | 132 |  |
| `test-harpoon-lab.mjs` | 130 |  |
| `test-inspector-views.mjs` | 129 |  |
| `test-input-mainthread-budget.mjs` | 128 |  |
| `test-namelint-env-parity.mjs` | 128 |  |
| `test-hover-typeless-coverage.mjs` | 127 |  |
| `test-semantic-identity-adversarial-v2.mjs` | 127 |  |
| `test-graph-view.mjs` | 126 |  |
| `test-decl-fold.mjs` | 123 |  |
| `test-infix-operand-typing.mjs` | 122 |  |
| `test-ide-status.mjs` | 121 |  |
| `test-scan-file-holes.mjs` | 118 |  |
| `test-explorer-create.mjs` | 116 |  |
| `test-file-health-store.mjs` | 115 |  |
| `test-semantic-batch-fallback-v2.mjs` | 115 |  |
| `test-semantic-symbols-v2.mjs` | 112 |  |
| `test-semantic-hover-v2.mjs` | 111 |  |
| `test-highlight-pragmas.mjs` | 110 |  |
| `test-semantic-isolation.mjs` | 107 |  |
| `test-sticky-ws-prefs.mjs` | 107 | 2 |
| `test-semantic-scope-v2.mjs` | 104 |  |
| `test-explorer-selection.mjs` | 102 |  |
| `test-fold-persist.mjs` | 101 |  |
| `test-graph-nav.mjs` | 101 |  |
| `test-symbolstore-scaling.mjs` | 100 | 3 |
| `test-gate-corpus.mjs` | 99 | 1 |
| `test-library-beluga.mjs` | 97 |  |
| `test-semantic-elaboration-v2.mjs` | 97 |  |
| `test-semantic-persist-types-v2.mjs` | 97 |  |
| `test-semantic-derive-types-v2.mjs` | 93 |  |
| `test-semantic-nav-v2.mjs` | 93 | 1 |
| `test-nd-inhfix.mjs` | 92 |  |
| `test-format-viewport.mjs` | 91 | 2 |
| `test-library-manifest.mjs` | 90 |  |
| `test-workspace-index.mjs` | 89 |  |
| `test-lint-corpus.mjs` | 87 |  |
| `test-explorer-suite-layout.mjs` | 86 |  |
| `test-grammar-corpus.mjs` | 84 | 9 |
| `test-turnstile-display.mjs` | 83 |  |
| `test-save-quiet-prefs.mjs` | 82 |  |
| `test-grammar-matrix.mjs` | 81 |  |
| `test-compress-development.mjs` | 79 |  |
| `test-holes.mjs` | 78 |  |
| `test-lint-zerowidth.mjs` | 76 |  |
| `test-explorer-suite-order.mjs` | 73 |  |
| `test-semantic-identity-v2.mjs` | 73 |  |
| `test-semantic-resolution-v2.mjs` | 73 |  |
| `test-semantic-blocked-v2.mjs` | 72 |  |
| `test-prover-trace.mjs` | 71 |  |
| `test-semantic-notation-v2.mjs` | 70 |  |
| `test-undefined-app-memo.mjs` | 69 |  |
| `test-context-menu-refs.mjs` | 67 |  |
| `test-pragma-selection.mjs` | 67 |  |
| `test-lint-units.mjs` | 65 |  |
| `test-repl-run-classify.mjs` | 65 |  |
| `test-highlight-query.mjs` | 64 |  |
| `test-undefined-type-app.mjs` | 63 |  |
| `test-hover-source-fallback.mjs` | 62 |  |
| `test-identifier-extend.mjs` | 62 |  |
| `test-library-suites.mjs` | 61 |  |
| `test-reference-jump-routing.mjs` | 60 |  |
| `test-toasts.mjs` | 60 |  |
| `test-query-lint.mjs` | 57 |  |
| `test-highlight-operators.mjs` | 55 |  |
| `test-impact-uses.mjs` | 55 |  |
| `test-semantic-graph-v2.mjs` | 55 |  |
| `test-format-clo-match.mjs` | 54 |  |
| `test-library-refresh.mjs` | 54 |  |
| `test-semantic-same-decl-all.mjs` | 54 |  |
| `test-semantic-scheduler-priority-v2.mjs` | 54 |  |
| `test-lint-module.mjs` | 53 | 4 |
| `test-prepend-entry-cfg.mjs` | 53 |  |
| `test-semantic-decl-dedupe-v2.mjs` | 53 |  |
| `test-context-menu-inspect.mjs` | 52 |  |
| `test-semantic-rename-v2.mjs` | 51 |  |
| `test-check-gate.mjs` | 49 |  |
| `test-merge-decl-signatures.mjs` | 49 |  |
| `test-semantic-scheduler-dirty-v2.mjs` | 49 |  |
| `test-reconstructed-display-priority.mjs` | 47 |  |
| `test-active-module-pivot.mjs` | 46 |  |
| `test-hole-goals-store.mjs` | 45 |  |
| `test-implicit-position.mjs` | 45 |  |
| `test-block-comment-fold.mjs` | 44 |  |
| `test-format-proof-script.mjs` | 44 |  |
| `test-semantic-decl-text-bounds.mjs` | 44 | 2 |
| `test-certify-hole-goals.mjs` | 43 |  |
| `test-format-lf-ctors.mjs` | 43 |  |
| `test-beluga-lint-refresh.mjs` | 42 |  |
| `test-allbel-implicits.mjs` | 39 |  |
| `test-let-quantified-binders.mjs` | 39 | 2 |
| `test-project-paths.mjs` | 39 |  |
| `_library-cfg.mjs` | 38 |  |
| `test-parameter-block-case.mjs` | 36 |  |
| `test-lint-implicit-domain.mjs` | 35 |  |
| `test-beluga-prover-slot.mjs` | 34 |  |
| `test-format-rec-contextual.mjs` | 34 |  |
| `test-query-prettify.mjs` | 34 |  |
| `test-harpoon-glyphs.mjs` | 33 |  |
| `test-hint-stress.mjs` | 33 |  |
| `test-bel-rename-indexing.mjs` | 32 |  |
| `test-format-let-sticky.mjs` | 32 |  |
| `test-beluga-command-error.mjs` | 31 |  |
| `test-ascription-binder.mjs` | 29 |  |
| `test-cfg-editor.mjs` | 29 |  |
| `test-format-continuations.mjs` | 28 |  |
| `test-format-lf-section-comments.mjs` | 28 |  |
| `test-implicit-app-arg.mjs` | 28 |  |
| `test-syntax-only-gate.mjs` | 28 |  |
| `test-format-lf-mutual.mjs` | 27 |  |
| `test-reference-kind.mjs` | 26 |  |
| `test-name-prompt.mjs` | 24 |  |
| `test-grammar-elf-comments.mjs` | 23 | 1 |
| `test-format-decl-comments.mjs` | 22 |  |
| `test-format-case-binders.mjs` | 21 |  |
| `test-pi-binder-scope.mjs` | 20 |  |
| `test-format-lf-upper.mjs` | 17 |  |
| `test-format-decl-semicolon.mjs` | 16 |  |
| `test-format-inductive-lower.mjs` | 16 |  |
| `test-format-lf-comments.mjs` | 16 |  |
| `test-hint-stress-beluga.mjs` | 7 |  |

### Platform tests — 63 files, 5041 LOC

Language-free. ⭐ These survive the refactor unchanged and are what protects it.

| file | LOC | node |
|---|---:|---:|
| `test-command-settings.mjs` | 242 |  |
| `test-available-macros.mjs` | 224 |  |
| `test-command-catalog.mjs` | 196 |  |
| `test-command-registry.mjs` | 187 |  |
| `test-force-sim.mjs` | 159 |  |
| `test-style-chord-claims.mjs` | 154 |  |
| `test-global-chords.mjs` | 145 |  |
| `test-keybindings-dispatch.mjs` | 141 |  |
| `test-keybindings.mjs` | 135 |  |
| `test-tab-guard.mjs` | 125 |  |
| `test-command-shadows.mjs` | 122 |  |
| `test-early-boot.mjs` | 116 |  |
| `test-editor-chords.mjs` | 112 |  |
| `test-emacs-setup.mjs` | 112 |  |
| `test-harpoon-model.mjs` | 106 |  |
| `test-harpoon-tree.mjs` | 106 |  |
| `test-vim-caret.mjs` | 101 |  |
| `test-style-macros.mjs` | 96 |  |
| `test-bel-rename-commit.mjs` | 95 |  |
| `test-which-key.mjs` | 94 |  |
| `test-prover-path-canonicity.mjs` | 93 |  |
| `test-scheduler-viewport-frontier.mjs` | 93 |  |
| `test-jump-list.mjs` | 80 |  |
| `test-emacs-keys.mjs` | 76 |  |
| `test-double-tap.mjs` | 75 |  |
| `test-macro-store.mjs` | 75 |  |
| `test-editor-commands.mjs` | 74 |  |
| `test-css-tokens.mjs` | 73 |  |
| `test-harpoon-absorb-trace.mjs` | 73 |  |
| `test-bel-rename-preview.mjs` | 71 |  |
| `test-hole-actions.mjs` | 71 |  |
| `test-confirm-dialog.mjs` | 70 |  |
| `test-aliases.mjs` | 68 |  |
| `test-bel-rename-from-use.mjs` | 68 |  |
| `test-editor-prefs.mjs` | 66 |  |
| `test-bel-rename-invalid.mjs` | 62 |  |
| `test-harpoon-commit.mjs` | 62 |  |
| `test-bel-rename-undo.mjs` | 61 |  |
| `test-scroll-fade.mjs` | 61 |  |
| `test-keymap-style.mjs` | 60 |  |
| `test-bel-rename-blur.mjs` | 59 |  |
| `test-keymap-collisions.mjs` | 58 |  |
| `test-bel-rename-short-name.mjs` | 56 |  |
| `test-proof-format.mjs` | 55 |  |
| `test-vim-ex-names.mjs` | 53 |  |
| `test-prelude-cache-key.mjs` | 50 |  |
| `test-vim-setup.mjs` | 46 |  |
| `test-bel-rename-backspace.mjs` | 44 |  |
| `test-error-nav.mjs` | 40 |  |
| `test-relative-line-numbers.mjs` | 38 |  |
| `test-error-hook.mjs` | 33 |  |
| `test-settlement-dedup.mjs` | 33 |  |
| `test-reference-active-row.mjs` | 32 |  |
| `test-prover-transport-spell.mjs` | 31 |  |
| `test-hover-scope.mjs` | 28 |  |
| `persist-stack.mjs` | 27 |  |
| `test-check-context-content-hash.mjs` | 27 |  |
| `project-source-stack.mjs` | 25 |  |
| `test-tooltips-api.mjs` | 25 |  |
| `test-check-trace.mjs` | 22 |  |
| `test-settle-delay.mjs` | 22 |  |
| `test-format-source.mjs` | 19 |  |
| `test-dialog-content.mjs` | 18 |  |

## Pass 7 totals

| | files | LOC |
|---|---:|---:|
| analysed | 293 | 40,825 |
| tests — platform (survive) | 63 | 5,041 |
| tests — conformance seed | 20 | 2,826 |
| tests — language pack | 174 | 22,720 |
| scripts — platform/build | 15 | ~6,200 |
| scripts — pack | 11 | ~2,200 |
| scripts — stray | 6 | 292 |

---

# The complete picture

| Area | Files | LOC | Unanalysed |
|---|---:|---:|---:|
| `js/` | 259 | 103,946 | **0** |
| `css/` | 43 | 16,262 | **0** |
| `tests/` | 257 | 30,587 | **0** |
| `scripts/` | 32 | 9,986 | **0** |
| root | 4 | 1,271 | **0** |
| **total** | **595** | **162,052** | **0** |

Every source file in the repository now has a line in this record, and all 1,416 structural
coupling sites are attributed (F20).
