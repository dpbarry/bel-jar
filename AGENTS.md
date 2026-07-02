# BelJar — agent context

BelJar is a browser IDE for the Beluga proof assistant. The AST/semantic engine is the substrate; Beluga is invoked surgically, not as a text blob checker.

## Rules (`.cursor/rules/`)

| Rule | Scope |
|------|-------|
| `beljar-architecture.mdc` | Always — AST-first, not a Beluga wrapper, security boundary |
| `beljar-workflow.mdc` | Always — builds, `npm test`, checker worker, communication |
| `beljar-prover.mdc` | Prover / Harpoon files |
| `beljar-css.mdc` | `css/` |
| `beljar-cfg-suites.mdc` | Suite cfg sync |
| `beljar-tooltips.mdc` | Native tooltips, no HTML `title` |

## Quick commands

```bash
npm test                  # full test suite (one invocation)
npm run build             # editor + library (not OCaml compiler)
node scripts/build-editor.mjs   # editor bundle only
npm run prover:probe      # optional live prover gates (Chrome)
```

OCaml shim rebuild (rare): `_rebuild/rebuild.ps1` — only when `Beluga-W/src/web/beluga_web.ml` changes.

## Active work: native prover

BelJar's own proof-search engine (`bel-prover*.mjs`, `bel-hole-split.mjs`) generates steps; the Beluga checker certifies each. Harpoon is demoted to oracle. Context-lemma probes **`str_hyp`**, **`str_lin`**, and **`str_wtp`** are engine-complete (`npm run prover:probe`). Next gap: **`str_step`** / full cp-suite automation; recursion under binders for lemmas like `tp_uniq` (`t_lam`).

**`str_wtp` reference:** [`docs/prover-str-wtp-handoff.md`](docs/prover-str-wtp-handoff.md) (architecture, landed fixes, speed discipline).

**Fast checking (BelJar-first):** [`docs/fast-incremental-checking.md`](docs/fast-incremental-checking.md) — graph-driven minimal Beluga; tail/checkpoint path **reverted**. Start here for settlement/checker work.

General prover handoff detail lives in Claude project memory (`~/.claude/plans/HANDOFF-harpoon-prover.md`) if you have access; the `beljar-prover` rule captures the essentials.
