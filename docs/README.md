# docs/

Top level is current: in-progress plans, and the explanatory pieces you need to work on the product. Completed plans live in [`archive/`](archive/).

Agent rules and commands: [`AGENTS.md`](../AGENTS.md), [`.cursor/rules/`](../.cursor/rules/).

**Build hygiene:** after editing `js/**/*.mjs` run `npm run build:shell` (or `npm run build`); `npm run check:build` verifies committed `.js` leaves are fresh. Large concern CSS (`harpoon`, `dialogs`, `library`, `repl`, `inspector`) is split into sibling files — re-split via `node scripts/split-css-concerns.mjs` only when adding rules to a monolith (already-split parents are skipped).

## Explanatory

| Doc | Role |
|-----|------|
| [CODEMAP.md](CODEMAP.md) | Where code lives — two-layer runtime, domains, vocabulary |
| [ORCA.md](ORCA.md) | Proof search — what it is, the 32.1%, how to run it |
| [HARPOON.md](HARPOON.md) | Proving surface — states, invariants, how to change it |
| [edit-history.md](edit-history.md) | Undo/redo contract |

## Open plans

| Doc | Role | Status |
|-----|------|--------|
| [modal-editing.md](modal-editing.md) | Command layer, status strip, Vim/Emacs | Registry landed; catalogue in progress; bar exists; Vim/Emacs depth not |

## Archive

[`archive/`](archive/) — closed plans. Do not start from these. The only research resume document is [`archive/orca-research/README.md`](archive/orca-research/README.md) (Orca past 32% is **shelved**; the shipped engine is [`ORCA.md`](ORCA.md)).
