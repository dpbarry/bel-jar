# BelJar — agent context

BelJar is a browser IDE for the Beluga proof assistant. The AST/semantic engine is the substrate; Beluga is invoked surgically, not as a text blob checker.

**Where things live:** [`docs/CODEMAP.md`](docs/CODEMAP.md). **Doc index:** [`docs/README.md`](docs/README.md).

## Rules (`.cursor/rules/`)

| Rule | Scope |
|------|-------|
| `beljar-architecture.mdc` | Always — AST-first, not a Beluga wrapper, security boundary |
| `beljar-workflow.mdc` | Always — builds, `npm test`, checker worker, communication |
| `beljar-codemap.mdc` | Always — new modules go in domain folders; root `js/editor-src/` is legacy |
| `beljar-prover.mdc` | Prover / Harpoon files |
| `beljar-css.mdc` | `css/` |
| `beljar-cfg-suites.mdc` | Suite cfg sync |
| `beljar-tooltips.mdc` | Native tooltips, no HTML `title` |

## Quick commands

```bash
npm test                  # full suite: 236 checks, ~95s (BELJAR_TEST_JOBS=8 default)
npm run test:fast         # same minus the 7 Beluga integration files, ~50s — says so on exit
npm run build             # editor + shell ESM leaves + library (not OCaml)
npm run check:build       # fail when authored .mjs is newer than committed .js
node scripts/build-editor.mjs   # editor bundle only
node scripts/build-shell.mjs    # shell ESM → IIFE (tooltips, dialogs, boot, …)
npm run probe             # ALL probes in real Chrome (~3min)
npm run probe:app         # ROUTINE: general surfaces only (~24s)
npm run probe:keymap      # deep: Vim/Emacs, the command line, every binding pressed (~2.5min)
npm run probe:harpoon     # deep: the manual proving surface (~10s)
npm run probe:holes       # deep: the Harpoon holes panel (~8s)
```

**Two tiers.** `npm test` is pure Node — parsers, semantic model, formatters, Beluga. `npm run
probe*` is real Chrome with real keystrokes, and catches what Node cannot see: focus, layout, and
chords the browser eats. Neither replaces the other.

**Which to run while iterating:** `npm run test:fast` + `npm run probe:app`, then the `probe:*` for
whatever area you touched. **Before calling anything done:** `npm test` and `npm run probe`.

⛔ `test:fast` skips the Beluga integration files and **prints that it did** — a fast run that looks
identical to a full one is how "the suite is green" comes to mean less than it says.
⛔ Do not add keymap checks to `probe.mjs`: three probes' worth of Vim/Emacs dominating the routine
gate is what made the split necessary.

The shelved Orca thread's instruments (`prover-*.mjs`, `corpus-*.mjs`, `autocomplete-*.mjs`) are
still in `scripts/` but no longer have npm entries — that thread is closed, and `prover-differential`
reports a false 0/199 regression because the native `main.exe` is gone. Run them by path, knowingly.

**Boot (`index.html`):** `js/boot/early-boot.js` (prefs + split vars), `panel-restore.js` (side panel), `error-hook.js` (global `onerror`). Sources in `js/boot/*-core.mjs` + `*.mjs`; tested via `tests/test-early-boot.mjs`, `test-error-hook.mjs`.

Native Beluga CLI (`prover:diff`, `scripts/prover-native-oracle.mjs`, `scripts/prover-bench.mjs`): requires `Beluga-W/_build/default/src/beluga/main.exe` — build via `_rebuild/rebuild.ps1`.

OCaml shim rebuild (rare): `_rebuild/rebuild.ps1` — only when `Beluga-W/src/web/beluga_web.ml` changes.

## Docs (do not start from the archive)

| Thread | Start here |
|--------|------------|
| **Index / where code lives** | [`docs/README.md`](docs/README.md), [`docs/CODEMAP.md`](docs/CODEMAP.md) |
| **Orca (shipped search)** | [`docs/ORCA.md`](docs/ORCA.md) |
| **Harpoon (proving surface)** | [`docs/HARPOON.md`](docs/HARPOON.md) |
| **Modal editing** (open) | [`docs/modal-editing.md`](docs/modal-editing.md) |
| **Undo** | [`docs/edit-history.md`](docs/edit-history.md) |
| **Archive** | [`docs/archive/`](docs/archive/) — closed plans + shelved Orca-past-32% programme |

## Active work

**1. Modal editing.** Command registry is landed; catalogue and command bar are in progress; Vim/Emacs depth is not. Plan: [`docs/modal-editing.md`](docs/modal-editing.md).

**2. Orca is shipped at 32.1%.** Naming: **Harpoon** is the proving surface; **Orca** is the automatic search inside it (`proveProgram` / `candidateMoves`). Older notes say "autosolve"; read those as Orca. Product: [`docs/ORCA.md`](docs/ORCA.md). Pushing past 32% is **shelved** — resume only from [`docs/archive/orca-research/README.md`](docs/archive/orca-research/README.md), which exists so a successor does not rebuild a refuted mechanism.

⛔ **Two standing traps on the shipped engine:** never emit a `/ total /` the author did not write (an invented measure can disable Beluga's termination check and bank a circular proof); **`npm run prover:diff` is DOWN** (native `main.exe` missing since 2026-08-22) — its 0/199 STUCK is a missing tool, not a regression. `npm test` is the working gate.

Durable prover laws: [`.cursor/rules/beljar-prover.mdc`](.cursor/rules/beljar-prover.mdc).
