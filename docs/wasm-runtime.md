# The Beluga runtime on WebAssembly — the experiment

Does compiling the Beluga runtime with wasm_of_ocaml make checking noticeably faster in BelJar?
An experiment first: the app loads nothing of it yet. This page is the record: how the builds were
made, what was measured and how, the numbers, and what follows from them. How to build is
[`_rebuild/RECIPE.md`](../_rebuild/RECIPE.md) ("Wasm builds").

Status: **measured 16 Oct 2026; shipped 17 Oct** (Dean's three decisions, §7):

- **Wasm CPS is the default runtime** wherever the browser runs Wasm (WasmGC, tail calls and
  exception handling, validated, never guessed); everywhere else, the JS build. Settings > Beluga >
  Build version chooses among Stable, Wasm and Wasm CPS. Every Beluga slot (checker, intel, prover
  and its pool, Harpoon, case completion) runs the chosen build.
- **The JS build is compiled in dune's release profile**: 2.6 MB instead of 25.4 MB, 1.9× faster
  in Chrome, the same answers.
- **Fast is retired**: the double-translation build and Run on the main thread, with its "Retry
  with Stable if Fast fails" switch. A stored "fast" reads as the default.

What holds it: `js/beluga/beluga-client.js` `BUILDS` (the one table), `beluga-runtime-load.js`
(loads a Wasm build in a worker), the worker's `overflowAnswer` (a thrown Wasm overflow answered as
Stable answers one), `sw.js` (caches the loader and its `.wasm`), `tests/test-beluga-builds.mjs`,
`npm run probe:builds`, `npm run upload:runtime` and `npm run probe:live` (`_rebuild/RECIPE.md`,
Deploying). The final builds (all three from `rebuild.ps1`'s release profile) were checked against
the build that shipped before: 0 differences of 6485 records each
(`results/runtime-bench/differential-final.json`). In Chrome 155 they check the library in 9.4 s
(`wasm-cps`, warm), 14.0 s (`wasm`) and ~43 s (`stable`), against 76.5 s for the build that shipped
before (`chrome-final.json`). The measurements below are of the six builds as they stood on 16 Oct,
`fast` included.

In short: in Chrome, `wasm-cps` checks the library 5.8× faster than the shipped `stable`, with the
same answers byte for byte and a deeper stack. 1.9× of that needs no Wasm (the shipped JS is a dune
dev build; a release build gets it, and 12× fewer bytes). Wasm's own part is ~3× on checking and
2.5× on memory in Chrome, and little in Firefox.

## 1. The builds

Six builds of the same source (`Beluga-W/src/web/beluga_web.ml` at `9960ffca`), all from OCaml 5.4.1:

| Name | Compiler | Effects | Profile | Files |
|------|----------|---------|---------|-------|
| `stable` (shipped) | js_of_ocaml 6.3.2 | cps | dune dev: separate compilation, pretty-printed, inline source map | `beluga_web.bc.js` 25.4 MB |
| `fast` (shipped) | js_of_ocaml 6.3.2 | double-translation | dev, as above | `beluga_web.bc.dt.js` 33.0 MB |
| `stable-release` | js_of_ocaml 6.3.2 | cps | dune release: whole program, no source map | 2.6 MB (not shipped) |
| `fast-release` | js_of_ocaml 6.3.2 | double-translation | release | 3.2 MB (not shipped) |
| `wasm` | wasm_of_ocaml 6.3.2, Binaryen 126 | **disabled** | whole program, no source map | 24 KB loader + 1.98 MB `.wasm` |
| `wasm-cps` | wasm_of_ocaml 6.3.2, Binaryen 126 | cps | whole program, no source map | 24 KB loader + 2.49 MB `.wasm` |

The release-profile JS builds are there to keep the comparison honest: the shipped JS is a dune
*dev* build (11 MB of the stable build is an inline base64 source map), so "Wasm is faster" must
be separated from "a release build is faster". They are built with
`dune build --profile release --build-dir <elsewhere> src/web/beluga_web.bc.js src/web/beluga_web_dt.bc.js`,
which leaves `_build` and the shipped blobs alone.

### Does Beluga perform effects?

No, so the Wasm build needs neither JSPI nor CPS for effects. Statically: nothing under
`Beluga-W/src`, nor in the linked gen, extlib, sedlex or js_of_ocaml libraries, uses `Effect`; in
the shipped bundle `Stdlib__Effect` appears only as a module name in the stdlib's table.
Dynamically: the `--effects=disabled` build runs the whole library, the sessions and the glyph
variants through the differential (§3) with the same answers as `stable`; an effect performed
under `disabled` would have raised. So:

- `wasm` is direct style and needs no JSPI (which would have meant Chrome 137+ and no Safari).
- `wasm-cps` is not about effects at all. It is the Wasm counterpart of `stable`: CPS code under
  Wasm tail calls keeps its continuations on the heap, so deep inputs do not exhaust the stack.

## 2. How it was measured

Instruments, all in [`scripts/runtime-bench/`](../scripts/runtime-bench/) (never uploaded):

- `corpus.mjs`: the corpus. The bundled library as the units the app checks: each folder with a
  `.cfg` is one unit (its primary cfg, assembled by `assembleCfgProgram`), and each `.bel` no
  suite claims is one unit. **161 units (20 suites, 141 files), 1.03 MB.** Also four input
  families whose checking recursion grows with n, for depth.
- `node-bench.mjs` (`npm run bench:runtime`): Node 22.12 (V8 12.4). Every measurement in its own
  child process, one build at a time, never two side by side.
- `chrome-bench.mjs` (`npm run bench:runtime:chrome`): Chrome 155, in dedicated workers as the app
  runs Beluga. JS builds load as `beluga-runtime-load.js` loads them (fetch, Blob URL,
  `importScripts`); Wasm builds by their own URL, the worker handing the loader the
  `document.currentScript.src` it looks for.
- `firefox-smoke.mjs`: Firefox 158, same page and worker. A smoke check, not a benchmark.
- `differential.mjs` (`npm run diff:runtime`): §3.
- `tests/_beluga-runtime.mjs`: loads any build in Node behind one shape (`{ Beluga, bootMs }`).
  The test suite's oracle stays the stable JS build (`tests/_beluga-check.mjs`).

Machine: AMD Ryzen 7 7840HS (8 cores, 16 threads), 15 GB, Windows 11, on mains power.

What each number means:

- **boot**: from reading (Node) or `new Worker()` (Chrome) to a `Beluga` that takes calls.
  Chrome *cold* is a fresh browser context (nothing cached); *warm* is a fresh worker with the
  bytes in the HTTP cache.
- **first check**: a fresh instance's first `checkFromString`, so it pays the JIT.
- **corpus, first pass / warm**: one instance checks all 161 units N times; the first pass pays
  the JIT on each new code path, *warm* is the median of the later passes.
- **depth**: the largest n of each family a build checks before its stack gives out. Doubling from
  16, then bisection to 3%. A check slower than 60 s ends the search (the build is limited by
  time at that n, not by its stack).
- **transfer**: the bytes of every file a build fetches, gzip -9, and brotli at the level that
  reproduces what R2 sends for `stable` today (3,866,320 bytes, measured with curl).

## 3. Do they say the same things?

**Yes: byte for byte, on every record.** `differential.mjs` runs one long-lived instance per build,
as the app's worker is, replays one transcript, and compares every answer with `stable`'s
(`results/runtime-bench/differential.json` and `differential-release.json`, 16 Oct 2026, 25 min each):

| Step | What | Records | `fast` | `wasm` | `wasm-cps` | `stable-release` | `fast-release` |
|------|------|--------:|:------:|:------:|:----------:|:----------------:|:--------------:|
| A | every unit through `checkFromString` (verdict and full text) | 161 | same | same | same | same | same |
| B | every unit again in the notation the editor writes (`⊢ → ⇒`): multi-byte text, and every location after it, across the JS boundary | 161 | same | same | same | same | same |
| C | the REPL session per unit: `loadFromString`, its fingerprint, `ideDeclType` and `ideTypeAtJson` on up to 12 declarations, `%:countholes` raw and as JSON; then a load that **fails** (the trial-session rollback must keep the committed session and its answers), then a check (must leave the committed fingerprint alone) | 6157 | same | same | same | same | same |
| D | edge strings: empty, a lone surrogate, CRLF, Unicode names (`⊤ ∧`) | 4 | same | same | same | same | same |
| E | after a stack overflow, the first 20 units again: does the instance still answer as it did? | 1 | yes | yes | yes | yes | yes |

0 differences of 6485 records for each of the five. The harness was shown to catch a difference: a
"build" that is `stable` plus one space on the output of any input naming `nat` was reported at
the right unit and offset, and the run exited 1.

The stress on the boundary is real: B and D are where `--disable use-js-string` mattered for the
JS builds, and the Wasm builds (whose OCaml strings are bytes, with `Js.string` / `Js.to_string`
converting at the edge) agree with them there too, positions and columns included. A successful
check's output is only the phase lines for `input.bel`, so on the units that pass, A compares
little more than the verdict; C (types, holes, rollback) and the failing units' error text are
where agreement is tested hardest.

Not called directly: `ideElaborateDecl`, which the intel slot uses (`semantic-session.mjs`), is
`%:get-type` at each position, the command C runs through `ideTypeAtJson`; the prover pool and the
case-completion worker only call `checkFromString` and `loadFromString`. `ideAdjudicate` and
`ideHarpoonAuto` have no caller in the app (research scripts only) and are not compared.

## 4. Speed

The tables below are printed by `node scripts/runtime-bench/report.mjs` from
`results/runtime-bench/{node,chrome}.json`. "Per unit" is the geometric mean, over the 161 units,
of stable's warm time divided by the build's.

**Chrome 155, in a worker: the whole corpus** (warm = the median of passes 2 and 3)

| build | first pass | warm | per unit vs `stable` | on the 9 units `stable` takes > 2 s on |
|---|---:|---:|---:|---:|
| `stable` | 77.8 s | 76.5 s | 1.0× | 1.0× |
| `stable-release` | 40.1 s | 40.0 s | 1.9× | 1.9× |
| `fast` | 61.6 s | 49.8 s | 1.3× | 1.7× |
| `fast-release` | 42.9 s | 34.1 s | 2.0× | 2.4× |
| `wasm` | 16.1 s | 15.6 s | 6.4× | 4.8× |
| **`wasm-cps`** | **13.7 s** | **13.3 s** | **6.2×** | **5.6×** |

**Chrome: a fresh worker's first check** (median of 3; it pays the JIT)

| build | arith.bel (small) | howe-total.bel (medium) | poplmark-reloaded+ (large suite) |
|---|---:|---:|---:|
| `stable` | 259 ms | 3.67 s | 7.51 s |
| `stable-release` | 154 ms | 1.90 s | 3.89 s |
| `fast` | 277 ms | 2.42 s | 6.69 s |
| `fast-release` | 125 ms | 1.51 s | 4.82 s |
| `wasm` | 66 ms | 534 ms | 1.68 s |
| `wasm-cps` | 78 ms | 902 ms | 1.34 s |

**Node 22.12 (V8 12.4): the whole corpus** (warm = the median of passes 2–4)

| build | first pass | warm | per unit vs `stable` | on the 23 units `stable` takes > 2 s on |
|---|---:|---:|---:|---:|
| `stable` | 179.3 s | 188.9 s | 1.0× | 1.0× |
| `stable-release` | 136.1 s | 133.7 s | 1.4× | 1.4× |
| `fast` | 81.8 s | 87.3 s | 1.9× | 2.2× |
| `fast-release` | 59.1 s | 61.0 s | 2.7× | 3.2× |
| `wasm` | 11.0 s | 10.6 s | 20.6× | 18.5× |
| `wasm-cps` | 15.0 s | 15.2 s | 14.0× | 12.6× |

**Firefox 158, a fresh worker** (one sample each; `firefox-smoke.mjs`)

| build | boot | arith.bel | poplmark-reloaded+ |
|---|---:|---:|---:|
| `stable` | 1066 ms | 351 ms | 12.9 s |
| `stable-release` | 256 ms | 229 ms | 8.70 s |
| `fast` | 896 ms | 342 ms | 8.57 s |
| `fast-release` | 196 ms | 163 ms | 3.65 s |
| `wasm` | 244 ms | 96 ms | 3.66 s |
| `wasm-cps` | 134 ms | 69 ms | 5.36 s |

What this says:

- **Two separate gains, which compose.** In Chrome, building the JS in dune's release profile is
  worth 1.9× on its own (`stable` → `stable-release`); Wasm is worth another ~3× on top
  (`stable-release` → `wasm-cps`: 40.0 → 13.3 s, 3.3× per unit). The whole step from what ships
  today is 5.8× (76.5 → 13.3 s).
- **The engine matters as much as the build.** Node's older V8 runs the JS builds much worse than
  Chrome's does (stable: 189 s vs 77 s) and Wasm a little better (10.6 vs 15.6 s), so Node
  overstates the gain about threefold. Firefox runs Wasm relatively slower still: there, Wasm over
  an equally optimised JS build is 1.6× for the CPS pair and nothing for the direct pair.
- **In Chrome, `wasm-cps` is not the slow Wasm build.** It matches `wasm` overall and beats it on
  the heavy units, unlike Node and Firefox, where direct style is faster.
- All builds give the same verdicts (143/161 ok). Within one instance, four units answer
  differently on later passes in **every** build alike: Beluga's hole numbers run on across checks
  ("Hole number 0", then 1, …), as `beluga-client.js` already knows (`holeAction` finds a hole by
  position for that reason). Pass by pass, every build agrees with `stable` on 161 of 161.

## 5. Stack depth, and what an overflow looks like

**Chrome 155, in a worker** (the setting that matters; a Chrome worker gets about half to two
thirds of the depth Node's main thread does): the largest n each build checks.

| build | term `s (s (… z))` | arrows `nat → … → type` | lets `let y1 = x in …` | decls (a chain of `rec`) |
|---|---:|---:|---:|---:|
| `stable` | 2368, then overflow | 2880, then overflow | 512, then > 60 s | 6144, then overflow |
| `stable-release` | 2688, then overflow | 3392, then overflow | 512, then > 60 s | 4480, then overflow |
| `fast` | **23**, then overflow | 140, then overflow | 72, then overflow | 256, then overflow |
| `fast-release` | 22, then overflow | 160, then overflow | 68, then overflow | 252, then overflow |
| `wasm` | 164, then overflow | 832, then overflow | 416, then overflow | 1536, then overflow |
| **`wasm-cps`** | **8192, then > 60 s** | **14080**, then overflow | **1024, then > 60 s** | **≥ 65536** (the cap) |

Node (main thread): the same order, deeper; `wasm-cps` never overflows there (term 4096, arrows
16384 and lets 1024 each stopped by the 60 s clock; decls reached the cap).

- **`stable` is not unbounded.** CPS under js_of_ocaml trampolines, but some of Beluga still runs
  in direct style: `stable` overflows on three of the four families in Chrome.
- **`wasm-cps` goes further than `stable` on every family**: 3.5× on term, 4.9× on arrows, 10× on
  decls, and on lets both are stopped by the clock, `wasm-cps` at twice the n. Beluga's own
  superlinear cost on deep input, not the stack, is what usually stops it.
- **`fast` is shallow**: 23 levels of nesting in Chrome. `wasm` is 7× deeper and still shallow:
  it is a replacement for `fast`, not for `stable`.

**What an overflow looks like:**

| build | Chrome / Node | Firefox |
|---|---|---|
| JS builds | *returned*: `{ ok: false, output: "Stack overflow\n" }` (`normalize_exn` catches the `RangeError`) | the same |
| Wasm builds | *thrown* out of `checkFromString`: `RangeError: Maximum call stack size exceeded` | *thrown*: `InternalError: too much recursion` |

Under Wasm no OCaml handler sees the engine's overflow, so `normalize_exn` is dead code there.
`js/beluga/beluga-worker.js` catches both forms (its test matches either text), and the instance
answers correctly afterwards (differential step E; `firefox-smoke.mjs`). One oddity on `fast`: one
overflow struck *inside* js_of_ocaml's own overflow test and surfaced as `SyntaxError: Invalid
regular expression: /maximum call stack/i: Maximum call stack size exceeded`; the client's pattern
matches it by luck of wording.

## 6. Boot, transfer, memory, workers

**Boot in a Chrome worker**, `new Worker()` to a runtime that takes calls (median; cold = a fresh
browser context, nothing cached; warm = the bytes from the HTTP cache, verified by
`transferSize` 0). Served locally, so cold leaves out the network.

| build | cold | warm | Node (fresh process) |
|---|---:|---:|---:|
| `stable` | 480 ms | 465 ms | 325 ms |
| `stable-release` | 141 ms | 86 ms | 79 ms |
| `fast` | 573 ms | 468 ms | 351 ms |
| `fast-release` | 146 ms | 83 ms | 103 ms |
| `wasm` | 76 ms | 41 ms | 41 ms |
| `wasm-cps` | 103 ms | 70 ms | 46 ms |

Of `stable`'s 465 ms warm, about 35 ms is the cache and the rest is parsing 25 MB from a Blob URL,
which no code cache helps. The release profile removes most of that; Wasm a little more.

**Transfer.** R2 sends `stable` as 3,866,320 bytes (brotli, measured); brotli level 2 reproduces
that (3.94 MB), so that column estimates each build on the wire.

| build | on disk | gzip -9 | brotli 2 (≈ R2 today) | brotli 11 |
|---|---:|---:|---:|---:|
| `stable` | 25.39 MB | 3.71 MB | 3.94 MB | 2.47 MB |
| `stable-release` | 2.60 MB | 320 KB | **333 KB** | 250 KB |
| `fast` | 33.00 MB | 4.93 MB | 5.35 MB | 3.35 MB |
| `fast-release` | 3.24 MB | 508 KB | 528 KB | 396 KB |
| `wasm` | 2.01 MB | 444 KB | 463 KB | 348 KB |
| `wasm-cps` | 2.52 MB | 618 KB | 630 KB | 464 KB |

**The transfer gain is the release profile's, not Wasm's**: `stable-release` is half the bytes of
`wasm-cps`. Whether Cloudflare compresses `application/wasm` at all is not yet known (§7).

**A pool of workers in Chrome**, booted together, each then checking one medium unit; memory from
`performance.measureUserAgentSpecificMemory()` (the page is cross-origin isolated).

| build | 1 worker | 3 workers | 7 workers | per worker, at 7 | all 7 ready |
|---|---:|---:|---:|---:|---:|
| `stable` | 79.7 MB | 221.5 MB | 505.5 MB | 72.2 MB | 918 ms |
| `stable-release` | 36.4 MB | 93.5 MB | 207.7 MB | 29.7 MB | 173 ms |
| `fast` | 91.2 MB | 243.4 MB | 563.6 MB | 80.5 MB | 1.85 s |
| `fast-release` | 35.2 MB | 89.7 MB | 198.7 MB | 28.4 MB | 212 ms |
| `wasm` | 13.6 MB | 32.0 MB | 68.7 MB | 9.8 MB | 98 ms (45 ms shared) |
| `wasm-cps` | 27.9 MB | 46.5 MB | 83.7 MB | 12.0 MB | 97 ms (38 ms shared) |

"Shared" is the page compiling the `.wasm` once (`WebAssembly.compileStreaming`, with the
loader's own options) and handing the `WebAssembly.Module` to each worker, whose loader then
instantiates it instead of compiling its own (the worker replaces `instantiateStreaming`). It
halves the time to a ready pool and leaves memory where it was. The app can hold about nine
runtimes at once (seven in `BelugaClient`, Harpoon's, case completion's): at `stable`'s 72 MB
each that is ~650 MB, at `wasm-cps`'s 12 MB about 110 MB.

## 7. What follows

### The answer

**Yes, noticeably, in Chrome; and part of the gain needs no Wasm at all.**

From what ships today to `wasm-cps`, in Chrome workers as the app runs Beluga: the library checks
**5.8× faster** (76.5 → 13.3 s; 6.2× per unit), with the same answers byte for byte, a deeper
stack on every family, a fifth to a seventh of the boot time, and a sixth of the memory per worker.
That gain has two parts:

| | speed (Chrome) | boot (warm) | memory / worker | on the wire | stack |
|---|---:|---:|---:|---:|---|
| **release profile** (`stable` → `stable-release`) | 1.9× | 465 → 86 ms | 72 → 30 MB | 3.94 MB → 333 KB | about the same |
| **then Wasm** (`stable-release` → `wasm-cps`) | **3.0×** | 86 → 70 ms | 30 → 12 MB | 333 → 630 KB (larger) | much deeper |

So Wasm's own contribution in Chrome is about 3× on checking, 2.5× on memory, and the stack; the
transfer and most of the boot gains are the release profile's, and on the wire Wasm is twice the
bytes of a release JS build. In Firefox Wasm's own part is small (1.6× for the CPS pair, nothing for
the direct pair, one sample each). Node's V8 12.4 overstates everything about threefold and is not
the number to quote.

Which Wasm build: in Chrome `wasm-cps` is as fast as direct `wasm` overall and faster on the heavy
units, and it is the only build that is deeper than `stable` everywhere. `wasm` overflows early (it
is the counterpart of `fast`, not of `stable`). `wasm-cps` replaces `stable` with no trade-off
except bytes.

### Decided (Dean, 17 Oct) and built

Steps 0 and 1 below, in full: the JS build in the release profile; `wasm-cps` the default with the
JS build as the fallback, chosen by feature detection; and Fast retired. Steps 2–5 and 7 are built
too (the overflow answer, the loader, the one owner of the URL, `sw.js` and R2 with
`npm run upload:runtime`, `tests/test-beluga-builds.mjs` and `npm run probe:builds`). Step 6
(compiling once for every worker) is not: boots are well under 0.1 s.

### The proposal, as it was put (16 Oct)

0. **First, and on its own: build the two JS runtimes in dune's release profile.** One change to
   how `rebuild.ps1` calls dune (a release-profile build of `src/web`, or the same flags per
   executable). It needs no app change: the files keep their names and their single-script shape.
   In Chrome it is 1.9× faster checking, 5× faster warm boot, 2.4× less memory per worker, and 12×
   fewer bytes from R2 for everyone; the repository stops gaining 58 MB per rebuild. It answers as
   the shipped builds do (`differential-release.json`). It is worth doing whatever is decided
   about Wasm, and it is also what the Wasm build falls back to.
1. **One Wasm build in the app: `wasm-cps`**, for every slot that runs `stable` today (checker,
   intel, prover and its pool, Harpoon's worker, case completion). Keep the release-profile
   `stable` for a browser without WasmGC, tail calls and exception handling, chosen by feature
   detection (`WebAssembly.validate` on a few bytes using all three), never by user agent. `wasm`
   (direct) stays a build, unused, unless Firefox speed turns out to matter.
2. **Overflow.** Under Wasm an overflow is *thrown*, never reported as text (§5). The worker's
   existing `catch` sees it (`RangeError` in Chrome, `InternalError: too much recursion` in
   Firefox: both match its test) and the instance stays sound, but today that path *rejects* the
   job, where `stable` *returns* `{ ok: false, output: "Stack overflow\n" }` and the lint shows it.
   So the worker answers a thrown overflow from a Wasm build with exactly that result, and nothing
   above it can tell the builds apart. Since `stable` overflows earlier than `wasm-cps` on every
   family measured, falling back to it would not help. (If `wasm` were used, its fallback would be
   `wasm-cps`, in the worker path, which has no fallback today.)
3. **Loading** (`js/beluga/beluga-runtime-load.js`, the one loader): for a Wasm build, set
   `self.document = { currentScript: { src: url } }` and `importScripts(url)` the loader by its
   real URL (a classic worker may import cross-origin), then wait for the shim to assign
   `Beluga`, with a deadline and an `unhandledrejection` listener, so a failed start is an error
   and not a hang. `beluga-worker.js`'s `init` already waits for the runtime to load.
4. **One owner of the URL.** `BelugaClient.runtimeScriptUrl(build)` learns the Wasm build and
   returns its loader's URL with `?v=`; the `.wasm` is resolved by the loader from that URL, so
   nothing else names it. `tests/test-runtime-url.mjs`'s scan widens from `beluga_web\.bc` to the
   Wasm names.
5. **Caching and deploy.** The `.wasm` is named by its hash, so only the loader needs the stamp.
   `sw.js` caches the loader and `.wasm` paths too. R2 gets the loader and the `.assets/` folder,
   the `.wasm` uploaded with `--content-type application/wasm` (`instantiateStreaming` refuses
   anything else); whether Cloudflare compresses `application/wasm` on the way out has to be seen
   on the live response (`probe:live` checks it). Order unchanged: R2, then deploy, then
   `probe:live`. `scripts/dev-server.mjs`, `server/worker.mjs` (dev proxy) and
   `tests/test-dev-runtime.mjs` learn the new paths and the MIME type.
6. **Compile once.** Handing the page-compiled `WebAssembly.Module` to each worker halves the time
   to a ready pool (7 workers: 97 → 38 ms) and does not change memory. Worth it only if pools
   grow; boots are already well under 0.1 s.
7. **Tests.** `npm test` keeps the stable JS build as its oracle, and gains one file that runs a
   slice of the differential (`wasm-cps` against `stable`, a dozen units with sessions and
   glyphs), so the two cannot drift apart unseen. The full `diff:runtime` runs before any change
   to the shim or the toolchain.

The questions that were open, and their answers (17 Oct):

- Is ~3× faster checking in Chrome (on top of step 0) worth the integration, given that on the wire
  Wasm is twice the bytes of a release JS build and Firefox gains little? **Yes.**
- With `wasm-cps` in a worker 3.7× faster than the `fast` build, does "fast" mode still earn its
  place? **No: retired.**
- Still open: Safari 18.2+ should run the Wasm builds but cannot be tested here; if it cannot, it
  gets the JS build by the same feature detection.
