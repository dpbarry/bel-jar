# BelJar code map

Durable atlas of where things live. Orientation only — product specs and open plans are indexed in [`README.md`](README.md).
Commands and architecture: [`AGENTS.md`](../AGENTS.md), [`.cursor/rules/`](../.cursor/rules/).

## Two-layer runtime

BelJar is **two runtimes glued by globals**, not one modular app:

```
index.html
  ├─ css/style.css         (@import cascade → css/*.css, css/components/)
  ├─ js/                   shell domains + editor-src + editor-cm.bundle.js
  │    ├─ app/ commands/ status-strip/ persist/ harpoon/ beluga/ explorer/ library/ ui/ workspace/ repl/
  │    └─ editor-src/ → bundled to editor-cm.bundle.js
  ├─ beluga_web.bc.js      Beluga (js_of_ocaml), via worker
  └─ js/shell.js           product shell after clients + editor
```

| Layer | Path | Role |
|-------|------|------|
| Shell | `js/{app,commands,status-strip,persist,harpoon,beluga,explorer,library,ui,workspace,repl}/`, `js/shell.mjs` | Product boot → `shell.js` |
| Editor core | `js/editor-src/` → `js/editor-cm.bundle.js` | AST, semantics, prover, CM extensions |
| Beluga | `beluga_web.bc.js`, `js/beluga/` | Surgical checker on a **web worker** |
| Corpus | `library/` | Bundled examples + manifests |
| Test fixtures | `tests/fixtures/` | Sample Beluga sources for unit tests |

**Seam:** shell does **not** ES-import `js/editor-src/`. Glue is `window` system-noun globals (`Persist`, `BelEditor`, `Harpoon`, …) plus `beljar:*` events. Legacy `BelJar*` names are compat aliases ([`beljar-window-aliases.mjs`](../js/compat/beljar-window-aliases.mjs)). Soft `typeof` only at editor / Beluga / session edges; peers inside `shell.js` call each other directly.

**Shipping:** edit `.mjs` → `npm run build:shell` / `node scripts/build-editor.mjs`. Import order in [`shell.mjs`](../js/shell.mjs) is load-bearing. Do not hand-edit generated `.js`. Clients (`beluga-client.js`, `harpoon-client.js`) stay classic. Doc index: [`docs/README.md`](README.md). Archive: [`docs/archive/`](archive/).

**Naming (durable):** system nouns for editor-src modules and CM factories; Beluga product nouns (`beluga-parser*`, `beluga()`, …); CSS `bel-editor--*` / `bel-hl-*` stay. New modules land in domain folders — see `.cursor/rules/beljar-codemap.mdc`.

## Domains — start here

| Domain | Start here | Also look in |
|--------|------------|--------------|
| **Mount / public API** | [`editor.mjs`](../js/editor-src/editor.mjs) | Shell-facing barrel |
| **Parser / grammar** | [`beluga.grammar`](../beluga.grammar) | `beluga-parser*`, `beluga-tokens`, `language`, `tree-walk` |
| **Semantic / checking** | [`semantic-engine.mjs`](../js/editor-src/semantic/semantic-engine.mjs) | `semantic/*` |
| **Prover / holes** | [`prover-orchestrator.mjs`](../js/editor-src/prover/prover-orchestrator.mjs) | `prover/*` (hyp, moves, candidates, synth, certify, hole-*) |
| **Harpoon (dual)** | [Harpoon dual](#harpoon-dual) | Shell lab UI vs editor-src model — globals only |
| **IDE chrome** | [`ide/`](../js/editor-src/ide/) | Rename, fold, hover, lint, inspector, cfg/suite, [`completion/`](../js/editor-src/ide/completion/) (`classify` → `contributors` → `weigh`; holes use assembled code + `offsetLines`) |
| **Graph** | [`graph-view.mjs`](../js/editor-src/graph/graph-view.mjs) | `graph/*` |
| **Format** | [`document-format.mjs`](../js/editor-src/format/document-format.mjs) | `format/*` |
| **Perf tracing** | [`check-trace.mjs`](../js/editor-src/perf/check-trace.mjs) | `perf/*` |
| **Commands / keys** | [`command-registry.mjs`](../js/commands/command-registry.mjs) | `commands/*` — catalogue (metadata) + attached behaviour; `Keybindings`, the palette, the command line and Available macros are all projections of it. Modal keymaps: `editor-src/ide/modal/*`, assembled by `keymap-style.mjs`. See [`COMMANDS.md`](COMMANDS.md) |
| **Status strip** | [`status-strip-view.mjs`](../js/status-strip/status-strip-view.mjs) | `status-strip/*` — status strip under the editor pane (shell-owned sibling of `.editor-body`, not a CM panel); fed by [`status-strip-feed.mjs`](../js/editor-src/ide/status-strip-feed.mjs) + `beljar:file-lint` |
| **Shell UI** | [`app.mjs`](../js/app/app.mjs) → generated `app.js` | `app-*.mjs` peels; explorer / library / settings |
| **Persist / workspace** | [`persist.mjs`](../js/persist/persist.mjs), [`workspace.mjs`](../js/workspace/workspace.mjs) | Peels + [`install-edit-history.mjs`](../js/persist/install-edit-history.mjs) |
| **Beluga runtime** | [`beluga-client.js`](../js/beluga/beluga-client.js) | `beluga-run*`, `beluga-worker.js` (checker always on worker) |
| **Library / corpus** | [`library/`](../library/) | Generated [`library.js`](../js/library/library.js) |
| **Style** | [`css/style.css`](../css/style.css) | Tokens → concern files → `components/`; `responsive` last |
| **Tests / scripts** | [`tests/`](../tests/), [`scripts/`](../scripts/) | One `npm test`; prover probes `scripts/prover-*.mjs` |

**Root `js/editor-src/*`:** substrate + barrel only — `editor.mjs`; parser/tokens; `language` / `tree-walk` / `tree-helpers` / `name-resolve` / `infix` / `lint-units` / `aliases`; `edit-history` / `editor-prefs` / `editor-doc-prep`; `project-paths`. Everything else goes in a domain folder.

## Vocabulary

| Term | Means |
|------|--------|
| **settlement** | Prefix-closed Beluga passes on the active editor graph |
| **development-check** | Suite-member Beluga check for the load-order “development” containing a file |
| **hole-goal-system** | Owner for hole goals across settlement / development-check / store ([`hole-goal-system.mjs`](../js/editor-src/prover/hole-goal-system.mjs)) |
| **project-diagnostics** | Layered file health (syntax / suite / settlement / live / development) |
| **semantic-engine** | Façade over syntax / symbol / metavar / checker / graph stores + settlement |
| **Harpoon (dual)** | Shell lab UI vs editor-src model/glue — [below](#harpoon-dual) |
| **edit-history (dual)** | Core [`edit-history.mjs`](../js/editor-src/edit-history.mjs); install → `EditHistory` |
| **workspace (dual)** | Shell [`js/workspace/`](../js/workspace/) vs semantic [`workspace-index.mjs`](../js/editor-src/semantic/workspace-index.mjs) |
| **explorer / persist** | Shell-only trees (`js/explorer/`, `js/persist/`) |

## Harpoon dual

Same product noun, two trees. **No ES import across the seam** — shell soft-calls `BelEditor.*`; editor soft-calls `Harpoon*`.

| Side | Path | Hub |
|------|------|-----|
| Shell (lab UI / session) | [`js/harpoon/`](../js/harpoon/) | [`harpoon-lab.mjs`](../js/harpoon/harpoon-lab.mjs) (`Harpoon`); panel / goals / glyphs / icon; boot [`harpoon-ui.mjs`](../js/harpoon/harpoon-ui.mjs); classic [`harpoon-client.js`](../js/harpoon/harpoon-client.js) → `HarpoonEngine` |
| Editor (model / glue) | [`js/editor-src/harpoon/`](../js/editor-src/harpoon/) | `harpoon-program`, `harpoon-model`, `harpoon-anchor`, `scan-file-holes` |

## Window globals

Owners publish system nouns next to their module (`Persist`, `BelEditor`, `Toasts`, …). Cross-seam soft-calls: `BelEditor`, `Commands`, `CurrentEditor`, `EditHistory*`, `BelugaClient`, `Harpoon*`, `Persist`, `ProjectSource`. Debug flags: `Perf`, `JumpLog`, …. Full alias map: [`beljar-window-aliases.mjs`](../js/compat/beljar-window-aliases.mjs).

## Satellites and do-not-touch

| Path | Status |
|------|--------|
| `Beluga-W/` | Upstream. **Do not edit** `src/core/` or other semantic OCaml. Shim only: `Beluga-W/src/web/beluga_web.ml` |
| `beluga_web.bc.js` | Generated — `_rebuild/rebuild.ps1` only when the shim changes |
| `js/editor-src/beluga-parser.js` | Generated from `beluga.grammar` |
| `js/editor-cm.bundle.js` | Generated — `node scripts/build-editor.mjs` |
| `js/**/*.js` leaves + `js/shell.js` | Generated from `.mjs` — `npm run build:shell`; never hand-edit |
| `scratch/` | Local only: `probes/` (research), `machine-transfer/` (devops), dumps — gitignored except README |
| `scripts/` | Committed npm-wired tools only — not scratch |
| `tests/fixtures/`, `results/` | Test samples / harness outputs |

## Principles (structure)

1. **Map before move** — update this file when domains change.
2. **Domains, not line counts** — extract when a concern has a name and boundary.
3. **Partition on contact** — when touching a large file for feature work, move a named system out.
4. **Preserve the runtime seam** until a deliberate seam redesign.
5. **Scratch stays out of the product tree.**

## God files (partition on contact)

| File | Job | Partition toward |
|------|-----|------------------|
| `prover/prover-orchestrator.mjs` | Live search loop | hyp / moves / candidates done; residual certify + measure forks |
| `app/app.mjs` | Shell mount + wiring | `app-*.mjs` peels |
| `persist/persist.mjs` | Storage facade | `persist-*.mjs` peels |
| `css/style.css` | Import-only cascade | Concern files under `css/` |
| `harpoon/harpoon-lab.mjs` | Session hub | manual / display / commit / reel / auto / tree-ui |
| `ui/settings-ui.mjs` | Settings dialog | widgets: `bj-toggle`, `bj-dropdown`; panels stay here |
| `editor.mjs` | Mount + barrel | Live check host → `semantic/editor-check-host.mjs` |

## Feature docs

Index: [`README.md`](README.md). Closed plans: [`archive/`](archive/).

| Topic | Doc | Role |
|-------|-----|------|
| **Orca (the prover)** | [`ORCA.md`](ORCA.md) | What it is, how it works, how to run it |
| **Harpoon (the surface)** | [`HARPOON.md`](HARPOON.md) | States, invariants, how to change it |
| **Commands / keys** | [`COMMANDS.md`](COMMANDS.md) | ⭐ **Read this before adding or changing a command.** The shape, the recipe, the invariants and the four traps |
| Modal editing | [`modal-editing.md`](modal-editing.md) | Closed **record** of how the layer was built. §0.4 indexes the ⛔ rules; `COMMANDS.md` is the working page |
| Edit history | [`edit-history.md`](edit-history.md) | Undo contract |
