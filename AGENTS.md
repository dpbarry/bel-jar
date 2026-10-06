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
npm test                  # full suite: 301 files, ~110s (BELJAR_TEST_JOBS=8 default)
npm run test:fast         # same minus the 7 Beluga integration files, ~50s — says so on exit
npm run build             # editor + shell ESM leaves + library (not OCaml)
npm run check:build       # fail when authored .mjs is newer than committed .js
node scripts/build-editor.mjs   # editor bundle only
node scripts/build-shell.mjs    # shell ESM → IIFE (tooltips, dialogs, boot, …)
npm run probe             # ALL probes in real Chrome (~6min; keymap ~4, undo ~1¼)
npm run probe:app         # ROUTINE: general surfaces only (~24s)
npm run probe:keymap      # deep: Vim/Emacs, the command line, every binding pressed (~4min)
npm run probe:harpoon     # deep: the manual proving surface (~10s)
npm run probe:holes       # deep: the Harpoon holes panel (~8s)
npm run probe:cases       # deep: case completion, ghosts arriving unasked, accept in every style, decline (in `probe`)
npm run probe:kit         # the kit page (dev/kit.html): every component, one screenshot per theme (not in `probe`)
npm run probe:migration   # the next stored format, rehearsed: old tab, new tab, no flash (in `probe`)
npm run probe:notices     # the bell: a run finished elsewhere, a suite changing colour (in `probe`; docs/UI.md §3)
npm run backup:export     # the live database, read only, to ~/beljar-backups (weekly); backup:restore, backup:rehearse
npm run usage             # how big the live store has grown, beside its limits
npm run probe:live        # AFTER A DEPLOY: the live site, R2, both Beluga workers (network; not in `probe`)
npm run dev               # EVERYTHING locally at http://127.0.0.1:8787: sign-in, sync, Beluga checks (PERSIST §5.7; secrets in server/.dev.vars; local D1 in ~/.beljar-dev). A static server (Live Server) has no /api: online features are off there by design
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

**Storage durability.** `pagehide`/`beforeunload` are not save hooks — a phone switching apps
or a tab Chrome discards fires neither. The flush lives on `visibilitychange` → hidden, and
that one is DIRTY-GATED (`persist.flushCheckpointIfDirty`, `ReplPersist.saveIfPending`)
because the ordinary flush writes unconditionally and this hook fires on every alt-tab.
`js/persist/tab-guard.mjs` warns when a second tab has the same project open — a handshake
over the `storage` event, so it cannot produce a false alarm. Keeping the storage at all is
`js/persist/durability.mjs` (PERSIST §5.9): it asks `navigator.storage.persist()` at the next
click once there is work to lose, says Safari's 7-day deletion once, and Project > Download project
is the export.

**Deploy (Cloudflare).** Live at `https://beljar.deanbarry.com`, a Worker with static assets
(`.assetsignore` keeps the runtime blobs and the source tree out of the upload). The old GitHub Pages
address redirects there from `index.html` (`tests/test-canonical-redirect.mjs`).
`bel-jar.deanbarry100.workers.dev` still serves, but it is a separate origin with separate storage:
not an address to give anyone. The deploy is `wrangler.jsonc` at the root (Worker `bel-jar`: the
site's files, plus `server/worker.mjs` for `/api/*` on D1 `beljar-sync` and R2 `beljar-texts`);
`tests/test-deploy-config.mjs` holds it and lists the upload as wrangler does.
⛔ wrangler uploads every file `.assetsignore` does not name (it served `/.git/` until 2026-09-28).
⛔ A new migration in `server/migrations/` is applied with
`npx wrangler d1 migrations apply DB --remote` BEFORE the push that needs it. The Beluga runtime
is served from R2, `https://beljar-cdn.deanbarry.com/` (bucket `beljar-runtime`, CORS for the site
origins), because the fast build is over the 25 MiB per-file cap. `index.html` sets
`BELJAR_RUNTIME_BASE` on deployed hosts; local dev and the probes stay same-origin.
Migrations applied remotely: 0001 and 0002 (2026-09-28), 0003 sessions and deletions (2026-10-04),
0004 tables stored by key and 0005 the account's count (2026-10-05, each after
`npm run backup:rehearse` kept every row of a fresh export).
⛔ A migration that rebuilds tables is rehearsed first: `npm run backup:export`, then
`npm run backup:rehearse` (the export restored locally, every pending migration applied, no table
may lose a row), and only then `npx wrangler d1 migrations apply DB --remote`.
**Backups** (PERSIST §5.7): D1 Time Travel covers 7 days (30 on paid,
`npx wrangler d1 time-travel info beljar-sync`); once a week, `npm run backup:export` (the live
database, read only, to `~/beljar-backups`, newest four kept) and `npm run backup:restore` (the
newest into a scratch local D1, every table's rows checked against the file). R2 texts are named by
content and never overwritten. ⛔ `privacy.html` says what is kept and for how long:
`tests/test-privacy-page.mjs` holds it to the migrations and the code; change both together.
After `_rebuild/rebuild.ps1`: **upload both blobs to R2 first, then deploy**, then
`npm run probe:live`. The runtime URL carries the build stamp (`?v=`, written by
`_rebuild/stamp-runtime.ps1`), so deploying first lets the edge cache the old bytes under the new
URL until its TTL.
⛔ The runtime URL has ONE owner, `BelugaClient.runtimeScriptUrl`, and anything else that loads the
runtime asks it (`tests/test-runtime-url.mjs`). A private copy in `harpoon-client.js` kept pointing
at the app origin after the move to R2, and its worker 404'd there.

**Two pages (PERSIST §5.11).** `index.html` is home (the projects, and signing in; `js/home.js`,
its own bundle with no editor and no Beluga) and `edit.html` is the editor, on the one project its
address names (`/edit?p=ID`; `edit.html?p=ID` on a static server).
⛔ Every address and every navigation goes through `js/frame/routes.mjs` (`tests/test-routes.mjs`
scans for any other).
⛔ The editor never opens a different project under an address: one this browser cannot show sends
the page home, touching nothing.
⛔ Home makes no project: it reads `Persist.projects()`, never `listProjects()` /
`getActiveProjectId()`, which make one when none is visible.
⛔ A page that is left stops sync (`pagehide`), and one brought back from the browser's
back/forward cache reloads: kept in that cache it held the sync lock, and no tab synced.
⛔ A command runs on the pages it declares (`pages` in the catalogue; `HOME_TOO`): the palette and
its chords are on home too, and the registry keeps no behaviour for a command on the other page.
What both pages run is attached in `js/commands/shared-commands.mjs`, once.
⛔ The navigation between the pages is a view transition: the opt-in is INLINE in each document's
head (through `@import` it was refused), and the two travelling boxes are rewritten to
transform-only animations (`page-transition-core.mjs`), or the editor's start-up stalls them.
⛔ With "Start page: Last project", a bare home address goes on to the last project, so every link
to home is `Routes.homeUrl()` (`/?home`), never a typed `/`.
The signed-in half is probed by `node scratch/probes/probe-account.mjs` (the Worker and a stand-in
GitHub; Devices, Sign out there and Delete account by `node scratch/probes/probe-devices.mjs`; the
bell's card for sync failing by `node scratch/probes/probe-sync-failing.mjs`), the rest by `node scratch/probes/probe-home.mjs`; the cloud beside the project name by
`node scratch/probes/probe-cloud.mjs` (painted pixels, 1x to 3x: layout boxes said it was centred
while it was drawn high); `node scratch/film-live.mjs` records the navigation as Chrome plays it (its screencast: the frames a
person sees; `scratch/film-transition.mjs` pauses and steps it, which redraws every frame sharp and
hides stretching and stalls); `node scratch/probes/measure-open.mjs`
times the click on home to an editor that takes a key.

**Boot (both documents):** `js/boot/early-boot.js` (prefs + split vars), `panel-restore.js` (side panel; the editor only), `error-hook.js` (global `onerror`). Sources in `js/boot/*-core.mjs` + `*.mjs`; tested via `tests/test-early-boot.mjs`, `test-error-hook.mjs`.

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
| **Persistence** (in progress) | [`docs/PERSIST.md`](docs/PERSIST.md): one store, every setting and every piece of device state in a table, projects and files on opaque ids; ⛔ only the store touches browser storage (`test-store-ownership.mjs`); ⛔ bumping `SCHEMA` means adding the step to `js/persist/migrations.mjs` in the same change: older data is migrated or left alone, never deleted (§3.1, `test-migrations.mjs`); ⛔ a change underneath an open file is merged, never overwritten (§4.4); sync (§5) is built against a reference server (`js/persist/sync/`), and the real server must pass its tests; read before storing anything |
| **Archive** | [`docs/archive/`](docs/archive/) — closed plans + shelved Orca-past-32% programme |

## Active work

**1. Modal editing.** Command registry, catalogue, command line and status strip are landed.
⛔ **The three styles are meant to be equally reachable** — `COMMANDS.md` carries the capability
matrix and the gates (`test-global-chords.mjs`, and the `[parity]` phase of `probe:keymap`).
**Keyboard macros have one owner too** — `js/editor-src/ide/macro-engine.mjs` records DOM
keystrokes and replays them through whichever style is loaded, and Vim's `q`/`@` are
re-pointed at it just as `ensureVimUndoBridge` re-points `:undo`. Plan: [`docs/modal-editing.md`](docs/modal-editing.md).

**2. Orca is shipped at 32.1%.** Naming: **Harpoon** is the proving surface; **Orca** is the automatic search inside it (`proveProgram` / `candidateMoves`). Older notes say "autosolve"; read those as Orca. Product: [`docs/ORCA.md`](docs/ORCA.md). Pushing past 32% is **shelved** — resume only from [`docs/archive/orca-research/README.md`](docs/archive/orca-research/README.md), which exists so a successor does not rebuild a refuted mechanism.

⛔ **Two standing traps on the shipped engine:** never emit a `/ total /` the author did not write (an invented measure can disable Beluga's termination check and bank a circular proof); **`npm run prover:diff` is DOWN** (native `main.exe` missing since 2026-08-22) — its 0/199 STUCK is a missing tool, not a regression. `npm test` is the working gate.

Durable prover laws: [`.cursor/rules/beljar-prover.mdc`](.cursor/rules/beljar-prover.mdc).
