# Research instruments

*The experimental harnesses built during the shelved programme. They live in
`scratch/probes/` (**gitignored** — local and regenerable), so this index is kept here in the
tracked tree so it survives even if that directory is cleaned. ~180 files accumulated; the
ones below are the load-bearing ones.*

⛔ **None of these is part of the product.** The shipped engine (`js/editor-src/prover/`) does
not import anything from `scratch/`. Deleting `scratch/probes/` cannot break Orca.

---

## The oracle channel

| file | role |
|---|---|
| `bw-driver.mjs` | drives the js_of_ocaml Beluga build from node; exposes `load()` and `cmd()` over one session. **Everything else sits on this.** |

The native `main.exe` cannot be relinked in this environment (mingw, `-lws2_32`), so all
oracle access goes through the JS build. Interactive commands are reachable with the `%:`
prefix — `checkinhole`, `split`, `intro`, `printhole`, `countholes`, `solve-lf-hole`.

## The refinement search

| file | role |
|---|---|
| `leaf-synth3.mjs` | the whole experimental search (~84 KB). Leaf mode fills one hole with the author's structure spliced in; `--whole` synthesises an entire proof from the theorem's type alone. |
| `whole-run.mjs` | runs `--whole` over a target list, verifying each result |
| `whole-verify.mjs` | splices a whole BODY back, **restores `/ total /`**, reloads the program |
| `ls3-verify.mjs` | the same for a single LEAF term |
| `ls3-ab.mjs` | A/B two runs on the declaration-verified metric — gains and losses separately, never totals |

**Toggles** (all default OFF, so the baseline is the pre-toggle behaviour):
`LS3_R6` (case rule) · `LS3_LET` (let-unboxing) · `LS3_CTX` (grammar formers) ·
`LS3_STRICT` (declaration-level verification of every close) · `LS3_SPLITDEPTH` ·
`LS3_CANDCAP` · `LS3_VERBOSE` · `LS3_DUMPLET` · `LS3_HEADSTAT`.

⚠️ **`--calls` is not a pure cutoff.** The per-candidate budget was derived from the global
budget, so the value changes what the search can *reach*. Always record it. Known-good
settings for the two whole proofs that verify: `--calls 8000 --depth 22`.

## Measurement, with controls built in

| file | question it answers |
|---|---|
| `former-matrix.mjs` | which term formers admit a hole (refinable) vs sit in synthesis position |
| `let-census.mjs` | how author `let`s are shaped, residue vs COMPLETE, with lift |
| `size-gap.mjs` | proof-size distribution, residue vs COMPLETE |
| `author-walk.mjs` | the sequence of formers the author actually uses |
| `split-choice.mjs` | does the search offer the scrutinee the author splits on, and where in the list |
| `harpoon-auto.mjs` / `harpoon-ctl.mjs` | **Beluga's own prover on our corpus** — the baseline comparison, with its positive control. Run `harpoon-ctl.mjs` first. |

---

## ⛔ Traps these instruments taught, the hard way

- **Confirm a POSITIVE on a known-good target before believing any NULL.** Several nulls in
  this programme were manufactured by broken setups, not by the mechanism under test.
- **Check that a component actually FIRES.** Three mechanisms measured "zero" while never
  having run — a firing counter distinguishes *worthless* from *unwired*.
- **Check that an instrument PRINTS.** One dump condition compiled to a regex that could never
  match and emitted nothing, which is indistinguishable from a clean result.
- **Watch report truncation.** A 200-character cap turned a valid 720-character proof into an
  apparent parse error; a 60-character log cap hid a term that had in fact been built.
- **One process per target.** OCaml's signature store is global and accumulates.
- **The hole store accumulates and hole ids are SPARSE** — a failed `checkinhole` burns an id
  without leaving a hole, so "the last n holes" is not `[count-n, count)`. Scan upward from a
  high-water mark.
- **Never A/B beside a sweep.** Under CPU contention a cancelled run looks exactly like a 2×
  regression.
