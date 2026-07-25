# BelJar — agent context

BelJar is a browser IDE for the Beluga proof assistant. The AST/semantic engine is the substrate; Beluga is invoked surgically, not as a text blob checker.

**Where things live:** [`docs/CODEMAP.md`](docs/CODEMAP.md) — two-layer runtime, domain folders, satellites, vocabulary, partition targets.

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
npm test                  # full test suite (one invocation)
npm run build             # editor + shell ESM leaves + library (not OCaml)
node scripts/build-editor.mjs   # editor bundle only
node scripts/build-shell.mjs    # shell ESM → IIFE (tooltips, dialogs, workspace, …)
npm run prover:probe      # optional live prover gates (Chrome)
```

OCaml shim rebuild (rare): `_rebuild/rebuild.ps1` — only when `Beluga-W/src/web/beluga_web.ml` changes.

## Doc sources of truth (do not start from the wrong one)

| Thread | Start here | Also (narrower) |
|--------|------------|-----------------|
| **Structure / where code lives** | [`docs/CODEMAP.md`](docs/CODEMAP.md) | Archive only: [`docs/design-quality-refactoring-handoff.md`](docs/design-quality-refactoring-handoff.md) (thread closed) |
| **Native prover** | [`docs/prover-master-plan.md`](docs/prover-master-plan.md) | Kickoff paste: [`docs/prover-agent-kickoff.md`](docs/prover-agent-kickoff.md). Completeness audit text: [`docs/prover-completeness.md`](docs/prover-completeness.md) (appendix only) |
| **Input lag / incremental symbols** | [`docs/incremental-semantics-execution-handoff.md`](docs/incremental-semantics-execution-handoff.md) (Phase 1 keystone) | Context: [`docs/input-and-incremental-intelligence-handoff.md`](docs/input-and-incremental-intelligence-handoff.md). Beluga settlement principles: [`docs/fast-incremental-checking.md`](docs/fast-incremental-checking.md) |
| **Undo** | [`docs/edit-history.md`](docs/edit-history.md) | — |

## Active work: two threads

**1. Native prover / Harpoon autosolve engine (the frontier).** BelJar's own proof-search engine (`js/editor-src/prover/`) generates each proof step; the Beluga checker certifies it. Harpoon is demoted to oracle. The machinery ships (plan-driven focused search, phases B–I); the work is late-game — grinding the biggest residue classes to maximize corpus autosolve, and making found proofs QUICK + ELEGANT (a completion that costs 30 min / thousands of checks is a *defect*, not a win). North star: make the search a decision procedure by construction — never per-failure budgets or name-keyed branches.

- Direction: [`docs/prover-master-plan.md`](docs/prover-master-plan.md).
- Fresh-agent paste: [`docs/prover-agent-kickoff.md`](docs/prover-agent-kickoff.md) §0.
- Instruments: `npm run prover:probe`, `npm run prover:diff`, `node scripts/prover-native-oracle.mjs`.

**2. Input performance — no lag, no lost power.** Kill typing latency in large files / large preludes via smarter behind-the-scenes scheduling; never underpower lint/parse/checks to fake speed. Per keystroke the main thread does Text + incremental Lezer only — never a whole-doc `toString`/rebuild. Prefix-closed settlement is built. The open keystone is making the JS symbol/lint layer incremental-per-decl to match the already-incremental checker.

- Execution SoT: [`docs/incremental-semantics-execution-handoff.md`](docs/incremental-semantics-execution-handoff.md).
- Input-path history/context: [`docs/input-and-incremental-intelligence-handoff.md`](docs/input-and-incremental-intelligence-handoff.md).
- Graph-driven Beluga (not the typing-lag thread): [`docs/fast-incremental-checking.md`](docs/fast-incremental-checking.md).

Durable prover laws also live in [`.cursor/rules/beljar-prover.mdc`](.cursor/rules/beljar-prover.mdc) (local to Cursor checkouts).
