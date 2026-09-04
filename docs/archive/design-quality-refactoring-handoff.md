# Design-quality refactoring — **complete** (archive)

**Status (July 2026):** Thread **closed**. Prefer [`CODEMAP.md`](../CODEMAP.md) for where
things live and how to partition on contact. Active product work is **prover** and
**incremental semantics** — see [`AGENTS.md`](../../AGENTS.md).

This file is an **archive** of how BelJar got to a navigable shell + editor layout.
Do not start a new “Plan N” structural campaign from it.

---

## What shipped

| Outcome | Notes |
|---------|--------|
| Shell ESM ladder (waves 1–10) | Authored `.mjs` → `npm run build:shell` → one product `shell.js`; leaf bundles for focused tests |
| Domain folderization | `js/{app,persist,harpoon,beluga,explorer,library,ui,workspace,repl}/` + `js/editor-src/{semantic,prover,ide,harpoon,graph,format}/` |
| System-noun naming | Editor-src modules + CM factories; shell window globals; `BelJar*` kept as compat aliases |
| Named system partitions | hole-goal-system; prover-hyp / moves / candidates; inspector-model / render; harpoon-lab peers; `semantic/editor-check-host` |
| CSS cascade | Import-only `style.css` → concern files + `components/` |
| Boot smoke | `tests/test-shell-boot.mjs`; soft `typeof` only at editor / Beluga / session seams |

**Locked endgame (still true):** one ESM shell module graph. Classic IIFE is **transport**, not the long-term authoring shape. Clients (`beluga-client.js`, `harpoon-client.js`) stay classic for worker URL math.

---

## Hard constraints (unchanged)

- BelJar is the intelligence; Beluga is a surgical certifier — not a text-blob wrapper.
- Never edit `Beluga-W/src/core/`; shim only `Beluga-W/src/web/beluga_web.ml`.
- Background checker stays on the **worker**.
- Undo goes through EditHistory — no feature-local stacks.
- Full suite: one `npm test`. After `js/editor-src` edits: `node scripts/build-editor.mjs`.

**Plan 4 lesson (still load-bearing):** fat `create(deps)` extracts need create-time dep honesty and **browser boot smoke**. Prefer ESM imports over new classic globals when partitioning shell peers.

---

## Runtime shape (durable)

```
index.html
  classic clients → beluga / harpoon
  editor-cm.bundle.js (IIFE BelEditor from js/editor-src)
  shell.js (product shell graph)
       ↕ worker
  beluga_web.bc.js
```

Shell must **not** ES-import `js/editor-src/` until a deliberate seam redesign. Dual trees with the same word are often correct (e.g. `js/harpoon/` lab UI vs `js/editor-src/harpoon/` model/glue).

---

## Ladder record (done — do not re-run)

| Wave | Toward endgame |
|------|----------------|
| 1–2 | Shipping pattern + one `build:shell` |
| 3–4 | `ui/dialogs`, `workspace/` real import graphs |
| 5–6 | `persist/` + `app/` peels via `create` + hub imports |
| 7–8 | Remaining domains + one product `shell.js` |
| 9–10 | Burn shell-internal `typeof BelJar*`; SW cache bump; shell-boot test |

Cap was ≤10 waves; each deleted a classic script tag, shell-internal global, or dual.

---

## After this thread (Boy Scout, not a campaign)

Further design wins are **on contact** while shipping product:

1. **Partition god files** along named concerns (see CODEMAP §God files) — algorithm boundaries for prover; composition hubs for shell.
2. **Trim fat `create(deps)`** when you already touch a peel (unused deps / dead returns). App/persist peel SoT is wired; do not invent a deps validator.
3. **Do not** merge harpoon duals, move `beluga_web.bc.js` for neatness, re-run `bel-*` renames, or expand peel graphs without boot smoke.

Stale scare from earlier drafts: empty-state / side-panels / file-tabs “duplication” — **resolved** (peels are sole SoT; hub forwards).

---

## What *not* to prioritize

- Another purely structural folder move across all of `js/`.
- Renaming CM factories or burning `BelJar*` compat without an external-consumer plan.
- Touching Beluga OCaml core for “architecture.”

---

## Pointers

| Doc | Why |
|-----|-----|
| [`CODEMAP.md`](../CODEMAP.md) | Atlas |
| [`AGENTS.md`](../../AGENTS.md) | Commands + active product threads |
| [`../ORCA.md`](../ORCA.md) | Shipped proof search |
| [`incremental.md`](incremental.md) | Closed — JS name env + incremental lint/graph |
| [`../edit-history.md`](../edit-history.md) | Undo contract |
| `.cursor/rules/beljar-*.mdc` | Non-negotiables |

---

## Closing note

The tree is navigable; the ladder is finished. Treat leftover god files and fat dep objects as **Boy Scout debt**, not an open design-quality project. Bring a sharp diagnosis when a feature forces a cut; otherwise ship product.
