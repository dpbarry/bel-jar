# Handoff prompt: native prover — `str_step` (cp lemmas)

> **Use this as the agent prompt.** Pick up where the prior session left off; do not re-litigate architecture or re-do completed work unless a regression appears.

---

## Your mission

Finish **`str_step`** in BelJar's native prover so `node scripts/run-str-step-only.mjs` reports **COMPLETE**, then promote it in `scripts/prover-probes.mjs` (remove `optional: true`). After that, continue cp-suite backlog: **`lin_name_must_appear`**, then minimal Harpoon Auto polish.

BelJar drives; Beluga certifies via `proveProgram` + `BelugaClient.checkResult`. The AST/type/schema model is the substrate — **never** paste Beluga output or add `if (theorem === 'str_step')` shortcuts (`tests/test-prover-no-overfit.mjs` enforces this).

---

## Current probe status (2026-06-30)

```bash
node scripts/build-editor.mjs && node scripts/run-str-step-only.mjs
```

| Metric | Value |
|--------|-------|
| Steps | **20** (stuck) |
| Nullary branches (12) | ✅ auto-closed |
| **β∥1** HO branch | ✅ recurse → `str_step'` → `Res` close |
| **β∥2** HO branch | ✅ same chain |
| **β≡** branch | ❌ **only remaining hole** |
| Tests | **158/158** green |
| `str_step` in probes | still `optional: true` |

Stuck state (line ~271): pattern `[g, x:name |- β≡ X10 X11 X12]`, goal `Result [g ⊢ P] [g, x:name ⊢ Q]`, reason `no-move`.

Saved partial proofs (for debugging):

- `scripts/.str-step-14.bel` — before β∥1 recurse
- `scripts/.str-step-15.bel` — after block IH, before `str_step'`
- `scripts/.str-step-20.bel` — β∥1/β∥2 done, β≡ open

---

## Ground truth (reference proof)

`library/data/case-studies/classical-processes/cp_lemmas.bel` L138–177.

**β≡ branch (your immediate target):**

```bel
| [g, x:name ⊢ β≡ ≡PQ ⇛QR ≡RS] ⇒
  let Res' [g ⊢ _] [g, x:name ⊢ refl_proc] [g ⊢ ≡PQ'] = str_equiv [g, x:name ⊢ ≡PQ] in
  let Res [g ⊢ _] [g, x:name ⊢ refl_proc] [g ⊢ ⇛QR'] = str_step [g, x:name ⊢ ⇛QR] in
  let Res' [g ⊢ _] [g, x:name ⊢ refl_proc] [g ⊢ ≡RS'] = str_equiv [g, x:name ⊢ ≡RS] in
  Res [g ⊢ _] [g, x:name ⊢ refl_proc] [g ⊢ β≡ ≡PQ' ⇛QR' ≡RS']
```

Prelude stubs (already in probe): `scripts/cp-str-step-prelude.mjs` — includes `str_step'` and `str_equiv` as `fn _ => ?;` stubs plus full cp schema/Result types.

Pattern at hole: three **distinct metas** `X10`, `X11`, `X12` (equiv, step, equiv components) — not a single HO subderivation.

---

## What's already landed (do not revert)

### Nullary close (steps 2–14)

- `branchResultCloseFill` — nullary `⇛` ctors close with unboxed `Res [g |- _] [g, x:name |- refl_proc] [g |- <ctor>]` (not boxed `[g |- Res …]`).
- `enumerateCTypeConstructorsText` / `ctypeCtorArms` — multiline `→` ctype arms.
- `familyOfConstructorName` / `premiseDecHead` — infix `β∥1` resolves family `⇛`; declared `step` wins over metavar scan.
- `fillCandidates` skips junk `Res` cartesian for `Result`/`Result'`.

### Block IH closedness (step 15)

- Schema `hyp x A` → **`hyp x ⊥`** in block specs when prelude has `⊥ : tp` (`blockFieldType` + `codeHasBottomTp`). Required for Beluga to accept `let Res … = str_step [block IH …]` (without it: "Expression is not closed" on Result indices).
- Verified: `hyp x _` fails; `hyp x ⊥` passes (see `scripts/debug-str-step-recurse-variants.mjs`).

### HO chain β∥1 / β∥2 (steps 15–20)

Generic machinery (no hardcoded lemma names in regex — uses `Res` block lets + primed helper `foo'`):

1. **`pendingStepPrimeLemma`** / **`stepPrimeLemmaTexts`** — after block IH, call primed helper with `<y;hy>` substitution:  
   `let [g, y:name |- R2'] = str_step' [g, y:name, hy:hyp y ⊥ |- R2[..,<y;hy>]] in ?`
2. **`branchResultCloseFill` HO path** — after prime let, close:  
   `Res [g |- _] [g, x:name |- refl_proc] [g |- β∥N (\y. R2'[.., y])]`  
   Uses `headOfConclusion` for Unicode ctors (`β∥1`), not ASCII-only regex.
3. **`pendingHoSubderivRecurses`** — skips once block IH let exists.
4. Duplicate block recurse filtered when `branchBlockStepRecurseBind` already present.

Key files touched: `editor-src/bel-prover-bridge.mjs`, `editor-src/bel-hole-split.mjs`.

---

## What you must implement next

### 1. β≡ branch chain (blocks `str_step` COMPLETE)

Engine needs a **multi-helper chain** before final fill — analogous to `wtpBranchChainPhase` for `str_wtp`, but for:

| Order | Helper | Premise shape | Binds |
|-------|--------|---------------|-------|
| 1 | `str_equiv` | `[g, x:name ⊢ P ≡ Q]` | `Result'` → `≡PQ'` |
| 2 | `str_step` | `[g, x:name ⊢ P ⇛ Q]` | `Result` → `⇛QR'` |
| 3 | `str_equiv` | `[g, x:name ⊢ P ≡ Q]` | `Result'` → `≡RS'` |
| 4 | fill | — | `Res … [g |- β≡ ≡PQ' ⇛QR' ≡RS']` |

**Design constraints:**

- Generalize from **goal/branch pattern + theorem index** — match metas in branch `β≡ X10 X11 X12` to premise heads `≡` / `⇛` via `contextualHead` / `expandedHypsOf`, not hardcoded meta names.
- `str_equiv` returns **`Result'`** (`Res'`), not `Result` — `supportLemmaTexts` or a new **`equivStepChainPhase`** may be the right hook (read how `supportLemmaTexts` binds `Result`-headed goals).
- Gate direct fills until chain complete (`needsLemmaChainBeforeFill` pattern).
- Final close: third `Res` arg is **`β≡`** applied to three primed binders — extend `branchResultCloseFill` or add `branchBetaEquivCloseFill` using pattern metas + `branchLetRoles`.

**Beluga-verify each candidate** with a small splice script (pattern: `scripts/debug-str-step-prime.mjs` — include `.wasm` MIME in static server).

### 2. Promote probe + docs

When green:

- Remove `optional: true` from `str_step` in `scripts/prover-probes.mjs`.
- Update this file and trim stale sections in `docs/prover-str-wtp-handoff.md`.
- Run `npm test` once (full suite, single invocation).

### 3. After `str_step` (cp finish line)

| Item | Notes |
|------|-------|
| `lin_name_must_appear` | `cp_lemmas.bel` L64–78; `nctx` schema; imposs goal |
| `tp_uniq` / `t_lam` | Defer unless user reprioritizes — recursion under binders |
| Harpoon UI | Already wired: `js/harpoon-lab.js` → `proveProgram` (maxSteps 120); polish stuck UX / maxSteps after probes green |

**Outlook:** ~2–4 continues after β≡ for cp-only minimal ship (user-approved framing).

---

## Commands (speed discipline)

| Command | When |
|---------|------|
| `node scripts/build-editor.mjs` | **Always** before browser probes after `editor-src/` edits |
| `node scripts/run-str-step-only.mjs` | Fast gate (~40s) |
| `node tests/test-hole-split.mjs` | Split/fill/close edits |
| `node tests/test-prover-bridge.mjs` | Bridge/IH/lemma edits |
| `node tests/test-prover-no-overfit.mjs` | After adding lemma-name patterns |
| `npm test` | Milestone only — **one call**, never loop individual tests |

Checker: background semantic checks use **web worker** only (`CHECKER_THREAD='worker'`). Do not route auto-checks through main-thread Beluga.

---

## Key files

| File | Role |
|------|------|
| `editor-src/bel-prover-bridge.mjs` | `proveProgram`, `candidateMoves`, `recurseTexts`, `stepPrimeLemmaTexts`, `needsLemmaChainBeforeFill` |
| `editor-src/bel-hole-split.mjs` | `branchResultCloseFill`, `fillCandidates`, `schemaInfo`, split skeletons |
| `scripts/cp-str-step-prelude.mjs` | Prelude + `str_step'` / `str_equiv` stubs |
| `scripts/run-str-step-only.mjs` | Single-lemma gate |
| `scripts/prover-probes.mjs` | Full probe suite |
| `tests/test-hole-split.mjs` | Regression for split/close |
| `tests/test-prover-bridge.mjs` | IH, helpers, block schema |
| `.cursor/rules/beljar-prover.mdc` | Prover rule |
| `.cursor/rules/beljar-architecture.mdc` | AST-first, no OCaml core edits |

---

## Pitfalls (learned the hard way)

1. **Block hyp must be `⊥` not `_`** for `Result`-returning IH when schema is `hyp x A` — closedness failure otherwise.
2. **`\b` after `str_step'`** in regex fails (apostrophe is non-word) — use `(?=\s)` lookahead.
3. **`[^\]]+` in let patterns** breaks on nested `]` — use `[\s\S]+?` with non-greedy match to `|-`.
4. **Unicode constructor heads** (`β∥1`, `β≡`) — use `headOfConclusion`, not `[A-Za-z_]+` regex.
5. **Beluga hole report** omits pattern metas — `branchPatternMetas`, `enrichHoleFromTheorem` recover them.
6. **Pretty-printed goals** like `"i1]` are normal Beluga name-meta display — not corruption.
7. **Puppeteer probes** need `.wasm` content-type on static server or worker fails to load.
8. **`proveProgram` rejects** moves that increase error count — if stuck with `no-move`, candidate exists but failed Beluga check; splice manually first.

---

## Debug scripts (reuse, don't reinvent)

| Script | Purpose |
|--------|---------|
| `debug-str-step-recurse-variants.mjs` | IH splice variants (hyp `_` vs `⊥`) |
| `debug-str-step-prime.mjs` | `str_step'` + HO close Beluga check |
| `debug-step-16-fill.mjs` | Post-prime fill candidates |
| `debug-str-step-recurse-check.mjs` | Live 15-step snap + recurse splice |

---

## Scoreboard (report at end of each prover turn)

User wants visibility toward minimal shippable Harpoon (engine + Auto wired on cp lemmas):

```
Probe steps: N
Branches: nullary ✅ | β∥1 ✅ | β∥2 ✅ | β≡ ⏳
Tests: X/X
Next blocker: <one line>
Continues remaining: ~N
```

---

## Non-goals for this handoff

- Do not modify `Beluga-W/src/core/` or semantic OCaml.
- Do not commit unless user asks.
- Do not loop individual test files.
- Do not build a Harpoon tactic REPL — engine generates, checker certifies.

---

*Prior session transcript: agent-transcripts folder, search `str_step` / `β∥1` / `branchResultCloseFill`.*
